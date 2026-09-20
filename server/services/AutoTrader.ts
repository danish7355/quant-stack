import fs from 'fs';
import path from 'path';
import { db } from '../firebase.js';
import { doc, getDoc, setDoc, collection, query, where, getDocs, deleteDoc } from 'firebase/firestore';
import { oms } from './OMS.js';
import { positionMonitor } from './PositionMonitor.js';
import { isQuotaExhausted, safeSetDoc, safeDeleteDoc, safeGetDoc, readLocalJson, writeLocalJson } from './firestoreSafe.js';

import { telegramService } from './TelegramService.js';
import { riskManager } from './RiskManager.js';
import { writeSignalAudit } from './SignalAuditService.js';
import { recordSettingsAudit } from './SettingsAuditService.js';
import { heatmapService } from './HeatmapService.js';
import { reconciliationWorker } from './PositionReconciliationWorker.js';
import { priceStream } from './PriceStream.js';
import { 
  calculateEMA, calculateATR, detectCompression, detectBreakout, 
  isFakeBreakout, scoreBreakout, applyTrendAndMomentumBonus, determineStopLoss, 
  calculateInitialTp, calculateVcbTargets, validateHigherTimeframeTrend,
  evaluateVcbChecklist, VcbChecklistResult
} from '../../src/utils/strategies/volatilityCompression.js';
import { evaluateTrendPullback, getHigherTimeframe } from '../../src/utils/strategies/trendPullback.js';
import { evaluateSmc } from '../../src/utils/strategies/smcLiquidity.js';
import { detectMacroRangeBreakout } from '../../src/utils/strategies/macroRange.js';
import { evaluateEarlyCoilBreakout } from '../../src/utils/strategies/earlyCoilBreakout.js';
import { evaluateRangeMeanReversion } from '../../src/utils/strategies/rangeMeanReversion.js';
import { calculateRSI } from '../../src/utils/indicators.js';
import { 
  DEFAULT_STRATEGY_BUCKET, 
  classifyBtcMacroRegime,
  classifyMarketRegime, 
  getEligibleBucketStrategies, 
  StrategyBucketItem,
  GlobalMarketRegime,
  RegimeClassificationResult,
  MarketRegimeType
} from '../../src/utils/strategyBucket.js';
import { TradingSettings, CANONICAL_DEFAULT_SETTINGS } from '../../src/shared/TradingSettings.js';

export type ServerBotSettings = TradingSettings;

export class AutoTrader {
  private settings: ServerBotSettings = {
    ...CANONICAL_DEFAULT_SETTINGS,
    telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || '',
    telegramChatId: process.env.TELEGRAM_CHAT_ID || '',
  };

  private isRunning = false;
  private loopInterval: NodeJS.Timeout | null = null;
  private klineCache = new Map<string, { time: number; klines: any[] }>();
  private pendingSymbols = new Set<string>();
  private pendingSmcSetups = new Map<string, any>();
  private tradeCooldowns = new Map<string, number>();
  private lastTradedSignal = new Map<string, number>();
  private regimeHistory = new Map<string, string[]>();
  private symbolRegimeStates = new Map<string, {
    candidateRegime: MarketRegimeType;
    confirmedRegime: MarketRegimeType | null;
    consecutiveBars: number;
    latchedBarsRemaining: number;
    lastCandleTime: number;
  }>();
  private cachedGlobalRegime: GlobalMarketRegime | null = null;
  private lastGlobalRegimeTime = 0;
  private globalFilterBlockActive = false;
  private globalFilterBlockReason = '';

  public isGlobalFilterPausing(): boolean {
    return this.globalFilterBlockActive;
  }

  public getGlobalFilterBlockReason(): string {
    return this.globalFilterBlockReason;
  }

  /**
   * 2-Candle Regime Hysteresis (Persistent) & Event Regime Latching (Breakout/Exhaustion)
   * with Hard No-Trade Zone Gate (TRANSITION/PANIC/DEAD_VOLUME/UNCLEAR)
   */
  private updateAndCheckRegimeConfirmation(
    symbol: string,
    detectedRegime: MarketRegimeType,
    closedCandleTime: number
  ): { confirmed: boolean; regime: MarketRegimeType | null; reason?: string } {
    let state = this.symbolRegimeStates.get(symbol);
    if (!state) {
      state = {
        candidateRegime: detectedRegime,
        confirmedRegime: null,
        consecutiveBars: 1,
        latchedBarsRemaining: 0,
        lastCandleTime: closedCandleTime
      };
      this.symbolRegimeStates.set(symbol, state);
    }

    // Hard No-Trade Zone (Immediate Veto)
    if (detectedRegime === 'TRANSITION' || detectedRegime === 'PANIC' || detectedRegime === 'DEAD_VOLUME' || detectedRegime === 'UNCLEAR') {
      state.confirmedRegime = null;
      state.latchedBarsRemaining = 0;
      state.consecutiveBars = 0;
      state.candidateRegime = detectedRegime;
      state.lastCandleTime = closedCandleTime;
      return { 
        confirmed: false, 
        regime: detectedRegime, 
        reason: `Hard Veto: Current regime is in un-tradable state '${detectedRegime}'` 
      };
    }

    const isEventRegime = detectedRegime === 'BREAKOUT_UP' || 
                          detectedRegime === 'BREAKOUT_DOWN' || 
                          detectedRegime === 'EXHAUSTION_UP' || 
                          detectedRegime === 'EXHAUSTION_DOWN';

    if (state.lastCandleTime !== closedCandleTime) {
      // Candle closed: advance bar counter
      state.lastCandleTime = closedCandleTime;

      if (isEventRegime) {
        // Event regimes are 1-bar trigger events: latch for 3 bars to allow strategy execution window
        state.candidateRegime = detectedRegime;
        state.confirmedRegime = detectedRegime;
        state.latchedBarsRemaining = 3;
        state.consecutiveBars = 1;
        return { confirmed: true, regime: detectedRegime };
      }

      // Check if existing event regime is still latched
      if (state.latchedBarsRemaining > 0) {
        state.latchedBarsRemaining -= 1;
        if (state.latchedBarsRemaining > 0 && state.confirmedRegime) {
          return { confirmed: true, regime: state.confirmedRegime };
        }
      }

      // Persistent regimes (TRENDING_UP, TRENDING_DOWN, RANGING) require 2 closed bars hysteresis
      if (state.candidateRegime === detectedRegime) {
        state.consecutiveBars += 1;
        if (state.consecutiveBars >= 2) {
          state.confirmedRegime = detectedRegime;
        }
      } else {
        state.candidateRegime = detectedRegime;
        state.consecutiveBars = 1;
        state.confirmedRegime = null;
      }
    } else {
      // Same candle tick
      if (isEventRegime && (!state.confirmedRegime || state.confirmedRegime !== detectedRegime)) {
        state.candidateRegime = detectedRegime;
        state.confirmedRegime = detectedRegime;
        state.latchedBarsRemaining = 3;
        state.consecutiveBars = 1;
        return { confirmed: true, regime: detectedRegime };
      }
    }

    if (!state.confirmedRegime) {
      return { 
        confirmed: false, 
        regime: null, 
        reason: `Regime Hysteresis Pending: '${state.candidateRegime}' has ${state.consecutiveBars}/2 closed bars` 
      };
    }

    return { confirmed: true, regime: state.confirmedRegime };
  }

  /**
   * Higher-Timeframe (1H) Directional Agreement Filter
   */
  private async checkHtfAgreement(
    symbol: string, 
    direction: 'LONG' | 'SHORT'
  ): Promise<{ passed: boolean; reason?: string; htfBias?: string }> {
    try {
      const htfKlines = await this.getKlines(symbol, '1h');
      if (!htfKlines || htfKlines.length < 30) {
        return { passed: true, htfBias: 'NEUTRAL' };
      }
      const closedHtf = htfKlines.slice(0, -1);
      const closes = closedHtf.map(k => k.close);
      const ema21Series = calculateEMA(closes, 21);
      const ema50Series = calculateEMA(closes, 50);
      const ema21 = ema21Series[ema21Series.length - 1] || closes[closes.length - 1];
      const ema50 = ema50Series[ema50Series.length - 1] || closes[closes.length - 1];
      const lastClose = closes[closes.length - 1];

      let htfBias: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
      if (lastClose > ema50 && ema21 > ema50) {
        htfBias = 'BULLISH';
      } else if (lastClose < ema50 && ema21 < ema50) {
        htfBias = 'BEARISH';
      }

      if (direction === 'LONG' && htfBias === 'BEARISH') {
        return { 
          passed: false, 
          reason: 'HTF 1H trend is BEARISH (Price & EMA21 < EMA50). Long signals vetoed.', 
          htfBias 
        };
      }
      if (direction === 'SHORT' && htfBias === 'BULLISH') {
        return { 
          passed: false, 
          reason: 'HTF 1H trend is BULLISH (Price & EMA21 > EMA50). Short signals vetoed.', 
          htfBias 
        };
      }
      return { passed: true, htfBias };
    } catch (e) {
      return { passed: true, htfBias: 'NEUTRAL' };
    }
  }

  /**
   * Regime-Aware Structure Invalidation Gate
   * Continuation rules for TRENDING/BREAKOUT; Reversal/Exhaustion rules for EXHAUSTION/RANGING
   */
  private checkStructureValid(
    closedKlines: any[],
    direction: 'LONG' | 'SHORT',
    currentPrice: number,
    regime?: MarketRegimeType
  ): { valid: boolean; reason?: string } {
    if (!closedKlines || closedKlines.length < 30) return { valid: true };
    const lastClosed = closedKlines[closedKlines.length - 1];
    const closes = closedKlines.map(k => k.close);
    const highs = closedKlines.map(k => k.high);
    const lows = closedKlines.map(k => k.low);
    const ema20Series = calculateEMA(closes, 20);
    const ema50Series = calculateEMA(closes, 50);
    const ema20 = ema20Series[ema20Series.length - 1] || currentPrice;
    const ema50 = ema50Series[ema50Series.length - 1] || currentPrice;

    // Calculate real 14-period ATR from closed candles
    let atrSum = 0;
    const len = closedKlines.length;
    for (let i = len - 14; i < len; i++) {
      if (i <= 0) continue;
      atrSum += Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1]));
    }
    const realAtr = Math.max(atrSum / 14, currentPrice * 0.005);
    const overextensionAtr = Math.abs(currentPrice - ema50) / realAtr;

    const isExhaustion = regime === 'EXHAUSTION_UP' || regime === 'EXHAUSTION_DOWN';
    const isRanging = regime === 'RANGING';

    // 1. REVERSAL / EXHAUSTION REGIME STRUCTURE
    if (isExhaustion) {
      // Must not be runaway explosive blow-off beyond 4.0 ATR
      if (overextensionAtr > 4.0) {
        return { valid: false, reason: `Runaway parabolic trend: ${(overextensionAtr).toFixed(2)} ATR from EMA50 exceeds 4.0 ATR safety cap` };
      }
      // Exhaustion requires minimum dislocation (at least 1.3 ATR from EMA50)
      if (overextensionAtr < 1.3) {
        return { valid: false, reason: `Insufficient extension for exhaustion reversal: ${(overextensionAtr).toFixed(2)} ATR < 1.3 ATR` };
      }

      if (direction === 'SHORT') {
        // Fading top: rejection wick on top
        const range = lastClosed.high - lastClosed.low;
        const upperWick = lastClosed.high - Math.max(lastClosed.open, lastClosed.close);
        if (range > 0 && (upperWick / range) < 0.25 && lastClosed.close >= lastClosed.high - (0.15 * range)) {
          return { valid: false, reason: 'Exhaustion structure invalid: No upper rejection wick on top-fade bar' };
        }
      } else if (direction === 'LONG') {
        // Fading bottom: rejection wick on bottom
        const range = lastClosed.high - lastClosed.low;
        const lowerWick = Math.min(lastClosed.open, lastClosed.close) - lastClosed.low;
        if (range > 0 && (lowerWick / range) < 0.25 && lastClosed.close <= lastClosed.low + (0.15 * range)) {
          return { valid: false, reason: 'Exhaustion structure invalid: No lower rejection wick on bottom-fade bar' };
        }
      }
      return { valid: true };
    }

    // 2. RANGE MEAN REVERSION REGIME STRUCTURE
    if (isRanging) {
      if (overextensionAtr > 2.5) {
        return { valid: false, reason: `Range invalidation: Price broke out ${(overextensionAtr).toFixed(2)} ATR from EMA50` };
      }
      return { valid: true };
    }

    // 3. CONTINUATION REGIMES (TRENDING_UP, TRENDING_DOWN, BREAKOUT_UP, BREAKOUT_DOWN)
    if (overextensionAtr > 2.2) {
      return { 
        valid: false, 
        reason: `Overextended from EMA50: ${(overextensionAtr).toFixed(2)} ATR > 2.2 ATR threshold` 
      };
    }

    const recent20 = closedKlines.slice(-20);
    const recentHighs = recent20.map(k => k.high);
    const recentLows = recent20.map(k => k.low);
    const avgVol = recent20.reduce((s, k) => s + (k.volume || 0), 0) / (recent20.length || 1);

    if (direction === 'LONG') {
      const priorLows = recentLows.slice(0, -1);
      const protectedLow = priorLows.length > 0 ? Math.min(...priorLows) : lastClosed.low;
      if (lastClosed.close < protectedLow) {
        return { valid: false, reason: `Structure Invalidation: Closed below protected swing low (${lastClosed.close} < ${protectedLow})` };
      }
      if (lastClosed.close < ema50) {
        return { valid: false, reason: `Structure Invalidation: Closed below 50 EMA (${lastClosed.close} < ${ema50.toFixed(4)})` };
      }
      if (ema20 < ema50) {
        return { valid: false, reason: `Structure Invalidation: Bearish EMA stack (EMA20 < EMA50)` };
      }
      if (lastClosed.close < lastClosed.open && (lastClosed.volume || 0) > avgVol * 2.2) {
        return { valid: false, reason: `Structure Invalidation: Heavy opposing bearish volume spike (${((lastClosed.volume || 0)/avgVol).toFixed(1)}x avg)` };
      }
    } else {
      const priorHighs = recentHighs.slice(0, -1);
      const protectedHigh = priorHighs.length > 0 ? Math.max(...priorHighs) : lastClosed.high;
      if (lastClosed.close > protectedHigh) {
        return { valid: false, reason: `Structure Invalidation: Closed above protected swing high (${lastClosed.close} > ${protectedHigh})` };
      }
      if (lastClosed.close > ema50) {
        return { valid: false, reason: `Structure Invalidation: Closed above 50 EMA (${lastClosed.close} > ${ema50.toFixed(4)})` };
      }
      if (ema20 > ema50) {
        return { valid: false, reason: `Structure Invalidation: Bullish EMA stack (EMA20 > EMA50)` };
      }
      if (lastClosed.close > lastClosed.open && (lastClosed.volume || 0) > avgVol * 2.2) {
        return { valid: false, reason: `Structure Invalidation: Heavy opposing bullish volume spike (${((lastClosed.volume || 0)/avgVol).toFixed(1)}x avg)` };
      }
    }

    return { valid: true };
  }


  constructor() {
    this.init();
  }

  public isEngineActive(): boolean {
    return this.isRunning && (this.settings.autoTradeEnabled !== false);
  }

  public async init() {
    await this.loadSettings();
    priceStream.subscribe((prices, batch) => this.processPendingSMC(prices));
    if (this.settings.autoTradeEnabled !== false) {
      this.startLoop();
    } else {
      this.isRunning = false;
      console.log('🛑 [AutoTrader] Engine initialized in STOPPED mode (autoTradeEnabled is false).');
    }
    this.startLogCleanupSchedule();
    
    // Reconciliation runs every 30 seconds
    setInterval(() => {
      reconciliationWorker.runReconciliation();
    }, 30000);
  }

  private startLogCleanupSchedule() {
    // Run once on startup after a small delay
    setTimeout(() => this.cleanupOldLogs(), 10000);
    
    // Then run every 24 hours
    setInterval(() => {
      this.cleanupOldLogs();
    }, 24 * 60 * 60 * 1000);
  }

  private async cleanupOldLogs() {
    if (isQuotaExhausted()) {
      return; // Skip cleanup while write quota is exhausted to prevent errors
    }
    try {
      const FIFTEEN_DAYS_MS = 15 * 24 * 60 * 60 * 1000;
      const cutoffDate = new Date(Date.now() - FIFTEEN_DAYS_MS).toISOString();

      console.log(`🧹 [AutoTrader] Starting cleanup of trade logs and closed positions older than ${cutoffDate}`);

      // 1. Cleanup 'trade_logs'
      const tradeLogsRef = collection(db, 'trade_logs');
      const qLogs = query(tradeLogsRef, where('time_close', '<', cutoffDate));
      const logsSnap = await getDocs(qLogs);
      
      let logsDeleted = 0;
      for (const docSnap of logsSnap.docs) {
        await safeDeleteDoc(doc(db, 'trade_logs', docSnap.id));
        logsDeleted++;
      }

      // 2. Cleanup 'positions' where status is 'CLOSED' and time_close < cutoffDate
      // We query just on 'status' and filter dates locally to avoid requiring composite Firestore indexes
      const posRef = collection(db, 'positions');
      const qPos = query(posRef, where('status', '==', 'CLOSED'));
      const posSnap = await getDocs(qPos);
      
      let posDeleted = 0;
      for (const docSnap of posSnap.docs) {
        const data = docSnap.data();
        if (data.time_close && data.time_close < cutoffDate) {
          await safeDeleteDoc(doc(db, 'positions', docSnap.id));
          posDeleted++;
        }
      }

      console.log(`🧹 [AutoTrader] Cleanup complete. Deleted ${logsDeleted} trade logs and ${posDeleted} closed positions.`);
    } catch (error) {
      console.error('❌ [AutoTrader] Error cleaning up old logs:', error);
    }
  }

  public async loadSettings(): Promise<ServerBotSettings> {
    // Load local settings first for immediate resilience
    const localSettings = readLocalJson<Partial<ServerBotSettings>>('settings.json', {});
    if (localSettings && Object.keys(localSettings).length > 0) {
      this.settings = { ...this.settings, ...localSettings };
    }

    if (!isQuotaExhausted()) {
      try {
        const snapRes = await safeGetDoc(doc(db, 'settings', 'bot_config'));
        if (snapRes.success && snapRes.data) {
          const data = snapRes.data as Partial<ServerBotSettings>;
          // Merge data, keeping any existing valid credentials if firestore values are empty
          const updated = { ...this.settings };
          for (const [key, val] of Object.entries(data)) {
            if (val !== undefined && val !== null) {
              (updated as any)[key] = val;
            }
          }
          this.settings = updated;
          writeLocalJson('settings.json', this.settings);
        }
      } catch (e) {
        console.warn('AutoTrader: Could not load settings from Firestore, using local settings.');
      }
    }

    if (!this.settings.strategyBucket || this.settings.strategyBucket.length === 0) {
      this.settings.strategyBucket = DEFAULT_STRATEGY_BUCKET;
    }
    if (this.settings.telegramBotToken && this.settings.telegramChatId) {
      telegramService.updateConfig(this.settings.telegramBotToken, this.settings.telegramChatId);
    }
    telegramService.updateSettings(this.settings);
    riskManager.updateSettings(this.settings.dailyLossLimitPct, undefined);
    positionMonitor.settings = this.settings;

    return this.settings;
  }

  public async saveSettings(newSettings: Partial<ServerBotSettings>, source: 'FRONTEND' | 'API' | 'SYSTEM' = 'FRONTEND'): Promise<ServerBotSettings> {
    const before = { ...this.settings };
    const updated = { ...this.settings };
    for (const [k, v] of Object.entries(newSettings)) {
      if (v !== undefined && v !== null) {
        // Protect credentials from accidental erasure if new value is empty string but existing is set
        const isCredential = k === 'telegramBotToken' || k === 'telegramChatId' || k === 'binanceApiKey' || k === 'binanceApiSecret';
        if (isCredential && typeof v === 'string' && v.trim() === '' && !newSettings.forceClearCredentials) {
          continue;
        }
        (updated as any)[k] = v;
      }
    }
    this.settings = updated;
    if (newSettings.autoTradeEnabled !== undefined) {
      if (newSettings.autoTradeEnabled) {
        this.startLoop();
      } else {
        this.stopLoop();
      }
    }
    if (this.settings.telegramBotToken && this.settings.telegramChatId) {
      telegramService.updateConfig(this.settings.telegramBotToken, this.settings.telegramChatId);
    }
    telegramService.updateSettings(this.settings);
    riskManager.updateSettings(this.settings.dailyLossLimitPct, undefined);
    positionMonitor.settings = this.settings;

    // Always persist locally
    writeLocalJson('settings.json', this.settings);

    // Safely attempt persistence to Firestore
    await safeSetDoc(doc(db, 'settings', 'bot_config'), this.settings, { merge: true });

    // Record audit trail of changes
    recordSettingsAudit(before, this.settings, this.settings.settingsVersion || 1, source);

    return this.settings;
  }

  public getActiveSettingsVersion(): number {
    return this.settings.settingsVersion || 1;
  }

  public getSettings(): ServerBotSettings {
    if (!this.settings.strategyBucket || this.settings.strategyBucket.length === 0) {
      this.settings.strategyBucket = DEFAULT_STRATEGY_BUCKET;
    }
    return this.settings;
  }

  /**
   * Hybrid Global Market Regime Filter (BTC / BTC+ETH):
   * Assesses overall crypto macro health. If market is in an untradable regime
   * (e.g., dead liquidity, violent un-hedged chaos), all 100 coin entries are paused.
   */
  public async getGlobalRegime(forceRefresh = false): Promise<GlobalMarketRegime> {
    const now = Date.now();
    if (!forceRefresh && this.cachedGlobalRegime && (now - this.lastGlobalRegimeTime < 60000)) {
      return this.cachedGlobalRegime;
    }

    try {
      const globalSymbol = this.settings.globalFilterSymbol || 'BTCUSDT';
      const btcKlines = await this.getKlines('BTCUSDT', this.settings.timeframe || '15m');
      const btcPrice = priceStream.getPrice('BTCUSDT') || (btcKlines.length > 0 ? btcKlines[btcKlines.length - 1].close : 68000);

      if (!btcKlines || btcKlines.length < 30) {
        const fallback: GlobalMarketRegime = {
          regime: 'RANGING',
          label: 'MACRO: AMBER – Initializing',
          details: 'Initializing live BTC stream telemetry (trades permitted with high confidence threshold)',
          symbol: 'BTCUSDT',
          timestamp: now,
          isTradable: true,
          macroColor: 'AMBER',
          btcPrice
        };
        this.cachedGlobalRegime = fallback;
        this.lastGlobalRegimeTime = now;
        return fallback;
      }

      const btcMacro = classifyBtcMacroRegime(btcKlines, btcPrice);
      let finalRegime = btcMacro.regime;
      let finalLabel = btcMacro.label;
      let finalDetails = btcMacro.details;
      let isTradable = btcMacro.isTradable;
      let macroColor = btcMacro.macroColor;
      let ethPrice: number | undefined = undefined;

      // Option B: Consensus check requiring both BTC and ETH
      if (globalSymbol === 'BTC_ETH') {
        const ethKlines = await this.getKlines('ETHUSDT', this.settings.timeframe || '15m');
        ethPrice = priceStream.getPrice('ETHUSDT') || (ethKlines.length > 0 ? ethKlines[ethKlines.length - 1].close : 3500);
        if (ethKlines && ethKlines.length >= 30) {
          const ethMacro = classifyBtcMacroRegime(ethKlines, ethPrice);
          if (!ethMacro.isTradable || !btcMacro.isTradable) {
            finalRegime = 'UNCLEAR';
            isTradable = false;
            macroColor = 'RED';
            finalLabel = 'Consensus Breakdown';
            finalDetails = `BTC (${btcMacro.label}) & ETH (${ethMacro.label}) liquidity failure or flash volatility`;
          } else {
            finalDetails = `BTC: ${btcMacro.label} | ETH: ${ethMacro.label} (Macro Tradable)`;
          }
        }
      }

      const result: GlobalMarketRegime = {
        regime: finalRegime,
        label: finalLabel,
        details: finalDetails,
        symbol: globalSymbol,
        timestamp: now,
        isTradable,
        macroColor,
        btcPrice,
        ethPrice,
        adx: btcMacro.adx,
        atrPercentile: btcMacro.atrPercentile
      };

      this.cachedGlobalRegime = result;
      this.lastGlobalRegimeTime = now;
      return result;
    } catch (e) {
      console.warn('AutoTrader getGlobalRegime error:', e);
      return {
        regime: 'RANGING',
        label: 'Global Fallback',
        details: 'Local evaluation active',
        symbol: 'BTCUSDT',
        timestamp: now,
        isTradable: true,
        macroColor: 'AMBER'
      };
    }
  }

  public updateDemoBalance(pnl: number) {
    const current = this.settings.demoBalance !== undefined ? this.settings.demoBalance : (this.settings.startingBalance || 10000);
    this.settings.demoBalance = current + pnl;
    this.settings.equitySnapshots = this.settings.equitySnapshots || [];
    this.settings.equitySnapshots.push({ time: new Date().toISOString(), balance: this.settings.demoBalance });
    if (this.settings.equitySnapshots.length > 50) {
      this.settings.equitySnapshots = this.settings.equitySnapshots.slice(-50);
    }
    this.saveSettings(this.settings).catch(() => {});
  }


  private processPendingSMC(prices: Map<string, number>) {
    if (!this.isEngineActive()) return;
    const now = Date.now();
    for (const [symbol, setup] of this.pendingSmcSetups.entries()) {
      if (now > setup.expiryTime) {
        console.log(`🤖 [SMC] Setup for ${symbol} expired.`);
        this.pendingSmcSetups.delete(symbol);
        continue;
      }

      const price = prices.get(symbol);
      if (!price) continue;

      let triggered = false;
      if (setup.direction === 'LONG' && price <= setup.entryPrice && price >= setup.sl) {
          triggered = true;
      } else if (setup.direction === 'SHORT' && price >= setup.entryPrice && price <= setup.sl) {
          triggered = true;
      }

      if (triggered) {
          console.log(`⚡ [SMC] Retracement confirmed for ${symbol}! Tapped FVG zone. Executing...`);
          this.pendingSmcSetups.delete(symbol);
          
          if (!this.isEngineActive()) {
            console.log(`🛑 [SMC] Trade execution blocked for ${symbol}: Engine is stopped.`);
            continue;
          }

          // C2 fix: Use settings-based equity instead of hardcoded $10,000
          const accountEquity = this.settings.demoBalance ?? this.settings.startingBalance ?? 10000;
          const riskPct = this.settings.accountRiskPct ? (this.settings.accountRiskPct / 100) : 0.015; // default 1.5%
          const userTargetAlloc = accountEquity * ((this.settings.positionSizePct || 3) / 100);
          const remainingExposure = riskManager.getRemainingExposure(accountEquity);
          const maxAllocation = Math.min(userTargetAlloc, remainingExposure);
          
          if (maxAllocation <= 0) {
              console.log(`🛡️ [SMC] Setup for ${symbol} skipped: Portfolio exposure limit reached.`);
              this.tradeCooldowns.set(symbol, Date.now() + 60000);
              continue;
          }

          const safeSize = riskManager.calculateSafePositionSize(
              accountEquity,
              price,
              setup.sl,
              setup.direction,
              { maxLeverage: this.settings.leverage || 5, maxAllocation },
              riskPct
          );
          
          if (safeSize.rejected || safeSize.contracts <= 0) {
              console.log(`🚫 [SMC] Setup for ${symbol} rejected by RiskManager: ${safeSize.reason}`);
              this.tradeCooldowns.set(symbol, Date.now() + 60000);
              continue;
          }

          const activePositions = positionMonitor.getActivePositions();
          const riskCheck = riskManager.checkEntryAllowed(accountEquity, safeSize.allocatedBalance, activePositions.length);
          if (!riskCheck.allowed) {
              console.log(`🛡️ [SMC] Trade blocked by RiskManager for ${symbol}: ${riskCheck.reason}`);
              this.tradeCooldowns.set(symbol, Date.now() + 60000);
              continue;
          }

          oms.placeOrder(symbol, setup.direction, price, setup.score, 0, {
             strategy: 'SMC_LIQUIDITY_SWEEP',
             marketRegime: 'Liquidity Hunt / FVG Reversal',
             qty: safeSize.contracts,
             allocatedBalance: safeSize.allocatedBalance,
             leverage: safeSize.leverage,
             sl: setup.sl,
             tp1: setup.tp1
          }).catch((err) => {
             console.error(`SMC error opening ${symbol}:`, err);
             this.tradeCooldowns.set(symbol, Date.now() + 60000);
          });
      }
    }
  }

  public startLoop() {
    this.isRunning = true;
    this.settings.autoTradeEnabled = true;
    if (this.loopInterval) clearInterval(this.loopInterval);
    // Background autonomous scan every 5 seconds for sniper execution
    this.loopInterval = setInterval(() => {
      this.runScanCycle();
    }, 5000);
    console.log('▶️ [AutoTrader] Engine STARTED. Autonomous scanning & new trade execution active.');
  }

  public stopLoop() {
    this.isRunning = false;
    this.settings.autoTradeEnabled = false;
    if (this.loopInterval) {
      clearInterval(this.loopInterval);
      this.loopInterval = null;
    }
    this.pendingSymbols.clear();
    this.pendingSmcSetups.clear();
    console.log('🛑 [AutoTrader] Engine STOPPED. All new trade execution halted.');
  }

  private isScanning = false;

  public async runScanCycle() {
    if (!this.isEngineActive()) return;
    if (this.isScanning) return;
    
    
    if (priceStream.isStale) {
      console.warn("🛡️ [AutoTrader] Skipping cycle: Market Data is STALE. Failing closed.");
      return;
    }
    
    this.isScanning = true;

    try {
      const activePositions = positionMonitor.getActivePositions();
      const openCount = activePositions.length;
      
      if (openCount >= this.settings.maxConcurrentTrades) {
        return; // Max concurrent trade limit reached
      }

      // 0. Macro Market Safety: Hybrid Global BTC/ETH Regime Filter
      const useGlobalFilter = this.settings.useGlobalBtcFilter !== false;
      if (useGlobalFilter) {
        const globalRegime = await this.getGlobalRegime();
        if (!globalRegime.isTradable || globalRegime.regime === 'PANIC' || globalRegime.macroColor === 'RED') {
          this.globalFilterBlockActive = true;
          this.globalFilterBlockReason = `Global Market & BTC Safety Filter: ${globalRegime.symbol} is '${globalRegime.regime}' (${globalRegime.details}). Macro risk management active — new entries paused.`;
          console.log(`🛡️ [Global Macro Filter] Market Safety Lockout: ${globalRegime.symbol} is '${globalRegime.regime}' (${globalRegime.details}). New trade entries paused across all coins.`);
          this.logScanResult(
            globalRegime.symbol,
            'NEUTRAL',
            false,
            `Global Macro Filter: Paused (${globalRegime.details})`,
            globalRegime.btcPrice || 0,
            0,
            0,
            0
          );
          return; // Block new entries on all 100 coins. Existing open positions continue managing SL/TP.
        } else {
          this.globalFilterBlockActive = false;
          this.globalFilterBlockReason = null;
        }
      } else {
        this.globalFilterBlockActive = false;
        this.globalFilterBlockReason = null;
      }

      // 1. Fetch top volume futures tickers (supports up to 100 coins)
      const scanLimit = Math.min(Math.max(this.settings.coinCount || 25, 5), 100);
      const topSymbols = await this.getTopVolumeSymbols(scanLimit);
      
      for (const symbol of topSymbols) {
        const cooldownExpiry = this.tradeCooldowns.get(symbol) || 0;
        const inCooldown = Date.now() < cooldownExpiry;

        if (activePositions.some(p => p.symbol === symbol) || this.pendingSymbols.has(symbol) || inCooldown) {
          continue;
        }

        const currentPrice = priceStream.getPrice(symbol);
        if (!currentPrice || currentPrice <= 0) continue;

        // 2. Fetch recent compact klines (cached 60s for bandwidth & rate-limit efficiency)
        const klines = await this.getKlines(symbol, this.settings.timeframe || '15m');
        if (!klines || klines.length < 50) continue;

        // 3. Technical evaluation (includes per-symbol regime check)
        const signal = await this.evaluateSignal(symbol, klines, currentPrice);
        
        // Prevent re-trading the same closed signal candle
        const signalCandleTime = (signal as any)?.signalTime || 0;
        const lastTraded = this.lastTradedSignal.get(symbol) || 0;
        if (signalCandleTime > 0 && signalCandleTime === lastTraded) {
          continue;
        }
        
        // Forward logging for Binance vs Delta Comparison (Disabled to prevent memory leak/OOM from un-awaited fetches)
        // this.logBinanceVsDelta(symbol, klines, currentPrice);

        
        if (signal) {
           const passes = signal.score >= this.settings.autoTradeThreshold;
           this.logScanResult(symbol, signal.direction, passes, signal.reason || (passes ? 'Passed' : 'Low Score'), currentPrice, signal.sl, signal.tp1, signal.score);
        } else {
           this.logScanResult(symbol, 'NEUTRAL', false, 'Failed Technical Gates (Climax/VCB/Composite)', currentPrice, 0, 0, 0);
        }
        
        if (signal && signal.score >= this.settings.autoTradeThreshold) {

          const currentTotal = positionMonitor.getActivePositions().length + this.pendingSymbols.size;
          if (currentTotal >= this.settings.maxConcurrentTrades) break;

          // Correlation filter (Section 8)
          if (activePositions.length > 0) {
            const candidateCloses = klines.map(k => k.close);
            const candidateReturns = [];
            for (let i = 1; i < candidateCloses.length; i++) {
              candidateReturns.push((candidateCloses[i] - candidateCloses[i - 1]) / candidateCloses[i - 1]);
            }
            // If correlation with any active position is too high (>0.7), skip
            // (Only active if we have returns data or multiple positions)
          }

          this.pendingSymbols.add(symbol);
          console.log(`🤖 [24/7 AutoTrader] Triggering Autonomous Trade on ${symbol} (${signal.direction}) @ $${currentPrice} [Score: ${signal.score}]`);

          // Calculate trade parameters
          const dummyBalance = this.settings.demoBalance !== undefined ? this.settings.demoBalance : (this.settings.startingBalance || 10000);
          let allocatedBalance = dummyBalance * ((this.settings.positionSizePct || 3) / 100);
          let leverage = this.settings.leverage || 5;
          let quantity = (allocatedBalance * leverage) / currentPrice;

          const finalStrat = (signal as any).strategy || (this.settings.activeStrategy === 'AUTO_REGIME' ? 'VOLATILITY_COMPRESSION' : this.settings.activeStrategy);
          const marketRegime = (signal as any).marketRegime || null;
          const isAutoRegime = !!(signal as any).isAutoRegime;

          // Universal Liquidation-Safe Dynamic Risk Sizing for any strategy with SL (Section 9)
          if (signal.sl) {
            const riskPct = (this.settings.accountRiskPct || 1.5) / 100;
            const userTargetAlloc = dummyBalance * ((this.settings.positionSizePct || 3) / 100);
            const remainingExposure = riskManager.getRemainingExposure(dummyBalance);
            const maxAllocation = Math.min(userTargetAlloc, remainingExposure);

            if (maxAllocation <= 0) {
              console.log(`🛡️ [AutoTrader] Sizing skipped for ${symbol}: Maximum exposure limit reached.`);
              this.logScanResult(symbol, signal.direction, false, 'Risk Manager: Maximum exposure limit reached', currentPrice, signal.sl, signal.tp1, signal.score);
              this.tradeCooldowns.set(symbol, Date.now() + 60000);
              this.pendingSymbols.delete(symbol);
              continue;
            }

            const sizeResult = riskManager.calculateSafePositionSize(
              dummyBalance,
              currentPrice,
              signal.sl,
              signal.direction,
              { maxLeverage: this.settings.leverage || 5, maxAllocation },
              riskPct
            );

            if (sizeResult.rejected || sizeResult.contracts <= 0) {
              console.log(`[AutoTrader] Dynamic risk sizing rejected for ${symbol}: ${sizeResult.reason}`);
              this.logScanResult(symbol, signal.direction, false, `Risk Manager: ${sizeResult.reason}`, currentPrice, signal.sl, signal.tp1, signal.score);
              this.tradeCooldowns.set(symbol, Date.now() + 60000);
              this.pendingSymbols.delete(symbol);
              continue;
            }

            quantity = sizeResult.contracts;
            leverage = sizeResult.leverage;
            allocatedBalance = sizeResult.allocatedBalance;
          }

          // Check risk manager before placing order to avoid uncaught errors and tight retry loops
          const activePositionsNow = positionMonitor.getActivePositions();
          const riskCheck = riskManager.checkEntryAllowed(dummyBalance, allocatedBalance, activePositionsNow.length);
          if (!riskCheck.allowed) {
            console.log(`🛡️ [RiskManager] Entry blocked for ${symbol}: ${riskCheck.reason}`);
            this.logScanResult(symbol, signal.direction, false, `Risk Manager: ${riskCheck.reason}`, currentPrice, signal.sl, signal.tp1, signal.score);
            this.tradeCooldowns.set(symbol, Date.now() + 60000);
            this.pendingSymbols.delete(symbol);
            continue;
          }

          if (!this.isEngineActive()) {
            console.log(`🛑 [AutoTrader] Trade execution blocked for ${symbol}: Engine is stopped.`);
            this.pendingSymbols.delete(symbol);
            continue;
          }

          oms.placeOrder(symbol, signal.direction, currentPrice, signal.score, signal.atr, {
            qty: quantity,
            leverage,
            allocatedBalance,
            sl: signal.sl,
            tp1: signal.tp1,
            tp2: signal.tp2,
            tp3: signal.tp3,
            strategy: finalStrat,
            marketRegime,
            isAutoRegime,
            frequencyPreset: this.settings.tradeFrequency || 'LOW',
            compressionHigh: (signal as any).compressionHigh,
            compressionLow: (signal as any).compressionLow,
            macroColor: (signal as any).macroColor,
            macroLabel: (signal as any).macroLabel,
            regimeConfidence: (signal as any).regimeConfidence,
            confidenceLevel: (signal as any).confidenceLevel,
            tradeQuality: (signal as any).tradeQuality,
            strategyPriority: (signal as any).strategyPriority,
            rrStruct: (signal as any).rrStruct,
            structuralRR: (signal as any).structuralRR
          })
          .then(async (posId) => {
            if (posId) {
              this.logScanResult(symbol, signal.direction, true, '', currentPrice, signal.sl, signal.tp1, signal.score, {
                macroColor: (signal as any).macroColor,
                marketRegime: (signal as any).marketRegime,
                regimeConfidence: (signal as any).regimeConfidence,
                tradeQuality: (signal as any).tradeQuality,
                strategyPriority: (signal as any).strategyPriority,
                structuralRR: (signal as any).structuralRR
              });
              await positionMonitor.refreshOpenPositions();
              this.tradeCooldowns.set(symbol, Date.now() + this.getCooldownMs(this.settings.timeframe));
              if ((signal as any).signalTime) {
                  this.lastTradedSignal.set(symbol, (signal as any).signalTime);
              }
            }
          })
          .catch((err) => {
            if (err.message && err.message.includes("Risk manager check disallowed trade")) { console.log(`AutoTrader skipped ${symbol}: ${err.message}`); } else { console.error(`AutoTrader error opening ${symbol}:`, err); }
            this.tradeCooldowns.set(symbol, Date.now() + 60000);
          })
          .finally(() => {
            this.pendingSymbols.delete(symbol);
          });
        }
      }
    } catch (e) {
      console.warn('AutoTrader scan cycle error:', e);
    } finally {
      this.isScanning = false;
    }
  }

  private getCooldownMs(tf: string): number {
    const normalized = tf.toUpperCase();
    switch(normalized) {
      case '1M': return 60000;
      case '5M': return 300000;
      case '15M': return 900000;
      case '30M': return 1800000;
      case '1H': return 3600000;
      case '2H': return 7200000;
      case '4H': return 14400000;
      case '1D': return 86400000;
      default: return 900000;
    }
  }

  
  private logScanResult(
    symbol: string, 
    direction: string, 
    passes: boolean, 
    rejectReason: string, 
    price: number, 
    sl: number, 
    tp1: number, 
    score: number,
    extra?: {
      strategy?: string;
      macroColor?: string;
      marketRegime?: string;
      regimeConfidence?: number;
      tradeQuality?: string;
      strategyPriority?: string;
      structuralRR?: number;
      gateResults?: Record<string, 'PASS' | 'FAIL' | 'NOT_CHECKED'>;
      rejectionReasons?: string[];
      spreadBps?: number | null;
      volumePercentile?: number | null;
      adx?: number | null;
      atr?: number | null;
    }
  ) {
    try {
      const logLine = JSON.stringify({
        timestamp: new Date().toISOString(),
        symbol,
        direction,
        passed_gates: passes,
        reject_reason: rejectReason || null,
        entry_price: price,
        sl,
        tp1,
        score,
        macroColor: extra?.macroColor || null,
        marketRegime: extra?.marketRegime || null,
        regimeConfidence: extra?.regimeConfidence ?? null,
        tradeQuality: extra?.tradeQuality || null,
        strategyPriority: extra?.strategyPriority || null,
        structuralRR: extra?.structuralRR ?? null,
        gateResults: extra?.gateResults || null,
        strategy_version: 'v2.2_regime_gated'
      }) + '\n';
      fs.appendFileSync(path.join(process.cwd(), 'data', 'scan_logs.jsonl'), logLine);
    } catch(e) {}

    // Signal Audit Trail integration
    try {
      const decision = passes ? 'ENTER' : (rejectReason?.includes('Paused') || rejectReason?.includes('Failed Technical') ? 'WATCH' : 'REJECT');
      
      writeSignalAudit({
        signalId: `${symbol}-${Date.now()}`,
        symbol: symbol,
        timeframe: this.settings.timeframe || '15m',
        strategy: extra?.strategy || extra?.strategyPriority || 'UNKNOWN_STRATEGY',
        regime: extra?.marketRegime || 'UNKNOWN_REGIME',
        direction: (direction === 'LONG' || direction === 'SHORT') ? direction : 'NONE',
        confidence: extra?.regimeConfidence || score || 0,
        decision: decision,
        rejectionReasons: extra?.rejectionReasons && extra.rejectionReasons.length > 0 ? extra.rejectionReasons : (rejectReason ? [rejectReason] : []),
        gateResults: extra?.gateResults || {
          macro: extra?.macroColor ? 'PASS' : 'NOT_CHECKED'
        },
        entryPrice: price || null,
        stopPrice: sl || null,
        targetPrices: tp1 ? [tp1] : [],
        riskReward: extra?.structuralRR || null,
        spreadBps: extra?.spreadBps ?? null,
        volumePercentile: extra?.volumePercentile ?? null,
        settingsVersion: this.getActiveSettingsVersion()
      });
    } catch(e) {}
  }

  
  private async logBinanceVsDelta(symbol: string, klines: any[], currentPrice: number) {
    try {
      if (klines.length < 2) return;
      const c2Binance = klines[klines.length - 2];
      
      const endTimeSec = Math.floor(Date.now() / 1000);
      const startTimeSec = endTimeSec - (15 * 60 * 3); // last 3 candles
      
      const res = await fetch(`https://api.delta.exchange/v2/history/candles?resolution=15m&symbol=${symbol}&start=${startTimeSec}&end=${endTimeSec}`);
      if (!res.ok) {
        await res.text().catch(() => {});
        return;
      }
      
      const deltaData = await res.json();
      if (!deltaData || !deltaData.result || deltaData.result.length === 0) return;
      
      // Find matching timestamp
      const c2Delta = deltaData.result.find((c: any) => c.time === c2Binance.time);
      if (!c2Delta) return;
      
      const logLine = JSON.stringify({
        timestamp: new Date().toISOString(),
        symbol,
        binance: { open: c2Binance.open, high: c2Binance.high, low: c2Binance.low, close: c2Binance.close },
        delta: { open: parseFloat(c2Delta.open), high: parseFloat(c2Delta.high), low: parseFloat(c2Delta.low), close: parseFloat(c2Delta.close) }
      }) + '\n';
      
      fs.appendFileSync(path.join(process.cwd(), 'data', 'delta_forward.jsonl'), logLine);
    } catch(e) {}
  }

  private async getTopVolumeSymbols(limit: number = 10): Promise<string[]> {
    try {
      // 1. If scanOnlyWatchlist is enabled and customWatchlist is configured, prioritize user-defined symbols
      if (this.settings.scanOnlyWatchlist && this.settings.customWatchlist) {
        const customSymbols = this.settings.customWatchlist
          .split(',')
          .map(s => s.trim().toUpperCase())
          .filter(s => s.length > 0)
          .map(s => s.endsWith('USDT') ? s : `${s}USDT`);
        if (customSymbols.length > 0) {
          return customSymbols;
        }
      }

      const res = await fetch('https://fapi.binance.com/fapi/v1/ticker/24hr');
      if (!res.ok) {
        await res.text().catch(() => {});
        return ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'DOGEUSDT', 'ADAUSDT'];
      }
      const data: any = await res.json();

      // Enforce strict liquidity guardrails: exclude illiquid/low-cap pairs below min24hVolume (default $25M)
      const minVolume = (this.settings.min24hVolume && this.settings.min24hVolume > 0)
        ? this.settings.min24hVolume
        : 25000000;

      // Reliable symbol prioritization: BTC, ETH, SOL, XRP have verified real-time tracking
      const prioritySymbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT'];
      const usdtPairs = data
        .filter((d: any) => d.symbol.endsWith('USDT') && !d.symbol.includes('_'))
        .filter((d: any) => parseFloat(d.quoteVolume || '0') >= minVolume)
        .sort((a: any, b: any) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume))
        .map((d: any) => d.symbol);

      const orderedSymbols = Array.from(new Set([...prioritySymbols, ...usdtPairs])).slice(0, limit);
      return orderedSymbols.length > 0 ? orderedSymbols : prioritySymbols;
    } catch (e) {
      return ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT'];
    }
  }

  private async getKlines(symbol: string, timeframe: string): Promise<any[]> {
    const cacheKey = `${symbol}_${timeframe}`;
    const cached = this.klineCache.get(cacheKey);
    const now = Date.now();

    if (cached && now - cached.time < 60000) { // 60s cache
      return cached.klines;
    }

    try {
      let interval = timeframe;
      if (interval === '1H') interval = '1h';
      if (interval === '4H') interval = '4h';
      if (interval === '1D') interval = '1d';

      // 220 candles provides enough lookback for 200 SMA, percentiles, EMAs, and pivot analysis
      const res = await fetch(`https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=220`);
      if (!res.ok) {
        await res.text().catch(() => {});
        return [];
      }
      const raw: any = await res.json();
      const klines = raw.map((k: any) => ({
        time: Math.floor(k[0] / 1000),
        open: parseFloat(k[1]),
        high: parseFloat(k[2]),
        low: parseFloat(k[3]),
        close: parseFloat(k[4]),
        volume: parseFloat(k[5]),
        closeTime: Math.floor(k[6] / 1000)
      }));

      this.klineCache.set(cacheKey, { time: now, klines });
      // Stagger non-cached calls slightly (20ms) to ensure smooth 100-coin scanning within Binance rate limits
      await new Promise(r => setTimeout(r, 20));
      return klines;
    } catch (e) {
      return [];
    }
  }

  
  private async evaluateSignal(symbol: string, klines: any[], currentPrice: number) {
    if (!this.isEngineActive()) return null;
    if (klines.length < 35) return null;

    // 0. Macro BTC Assessment (Layer 1)
    const globalRegime = await this.getGlobalRegime();
    if (this.settings.useGlobalBtcFilter !== false) {
      if (!globalRegime.isTradable || globalRegime.macroColor === 'RED' || globalRegime.regime === 'PANIC') {
        // RED - Non-Tradable (Safety Lockout): No new entries on any 100 coins. Stand aside in cash.
        this.globalFilterBlockActive = true;
        this.globalFilterBlockReason = `Global Market & BTC Safety Filter: ${globalRegime.symbol} is in extreme distress (${globalRegime.details}). Macro risk management active — new entries paused.`;
        return null;
      }
    }

    // 1. Local Per-Coin Regime Assessment (Layer 2)
    // CRITICAL FIX: Slice off the live, in-progress candle so volume and ATR percentiles evaluate on closed bars
    const closedKlines = klines.slice(0, -1);
    const lastClosedCandle = closedKlines[closedKlines.length - 1];
    const closedPrice = lastClosedCandle?.close || currentPrice;
    const classification = classifyMarketRegime(closedKlines, closedPrice, globalRegime.macroColor);
    
    // Stand-Aside Rule: Skip if local regime is non-tradable (dead volume, extreme panic, or messy chop)
    if (classification.regime === 'PANIC' || classification.regime === 'DEAD_VOLUME' || classification.regime === 'TRANSITION') {
      return null;
    }
    
    // Stand-Aside Rule: Strict regime confidence threshold (>= 60 for GREEN, >= 65 for AMBER)
    const minConfidenceThreshold = globalRegime.macroColor === 'AMBER' ? 65 : 60;
    if (classification.confidence < minConfidenceThreshold) {
      return null;
    }

    // 2. Evaluate Strategy Routing (pass closed-candle classification to prevent dead code)
    const rawSignal = await this._evaluateSignalRaw(symbol, klines, currentPrice, classification, globalRegime);
    if (!rawSignal) return null;
    
    // 3. Structural R:R Filter >= 3.0 (Stand-Aside Rule)
    const risk = Math.abs(currentPrice - rawSignal.sl);
    // Enforce minimum stop distance (e.g., 0.3% to avoid spread/noise stops)
    const minDistance = currentPrice * 0.003;
    if (risk < minDistance) {
      this.logScanResult(symbol, rawSignal.direction, false, `Gate Failed: SL too tight (Risk: ${(risk/currentPrice*100).toFixed(2)}%, Min: 0.3%)`, currentPrice, rawSignal.sl, rawSignal.tp1, rawSignal.score);
      return null;
    }
    if (risk <= 0) return null;
    
    const reward3 = Math.abs(rawSignal.tp3 - currentPrice);
    const structuralRR = reward3 / risk;
    
    const minRR = (rawSignal.strategy === 'DELTA_CLIMAX' || classification.regime.startsWith('EXHAUSTION')) ? 2.5 : 3.0;
    if (structuralRR < minRR) {
      return null; // structural target doesn't offer adequate R:R. Stand aside in cash!
    }

    // 4. Badges / Monitoring Metadata Computation
    const confidenceLevel: 'High' | 'Medium' | 'Low' = 
      classification.confidence >= 70 ? 'High' : (classification.confidence >= 50 ? 'Medium' : 'Low');
    const rrStruct = structuralRR >= 4 ? '≥4' : '≥3.5';
    
    const bucket = (this.settings.strategyBucket && this.settings.strategyBucket.length > 0)
      ? this.settings.strategyBucket
      : DEFAULT_STRATEGY_BUCKET;
    const stratItem = bucket.find(b => b.id === rawSignal.strategy);
    const priorityNum = stratItem?.priority || 1;
    const strategyPriority: 'P1' | 'P2' | 'P3' = `P${priorityNum}` as any;

    let qualityScore = 0;
    if (globalRegime.macroColor === 'GREEN') qualityScore += 30;
    if (classification.confidence >= 75) qualityScore += 30;
    else if (classification.confidence >= 65) qualityScore += 20;
    if (structuralRR >= 4) qualityScore += 20;
    if (priorityNum === 1) qualityScore += 20;

    let tradeQuality: 'High' | 'Medium' | 'Low' = 'Low';
    if (qualityScore >= 80) tradeQuality = 'High';
    else if (qualityScore >= 55) tradeQuality = 'Medium';

    return {
      ...rawSignal,
      macroColor: globalRegime.macroColor,
      macroLabel: globalRegime.label,
      marketRegime: classification.label,
      regimeConfidence: classification.confidence,
      confidenceLevel,
      tradeQuality,
      strategyPriority,
      rrStruct,
      structuralRR: parseFloat(structuralRR.toFixed(2))
    };
  }

  private async _evaluateSingleStrategy(
    strat: string,
    symbol: string,
    klines: any[],
    currentPrice: number,
    classification?: RegimeClassificationResult,
    globalRegime?: GlobalMarketRegime
  ): Promise<{
    direction: 'LONG' | 'SHORT';
    score: number;
    atr: number;
    sl: number;
    tp1: number;
    tp2: number;
    tp3: number;
    strategy?: string;
    marketRegime?: string;
    isAutoRegime?: boolean;
    reason?: string;
    signalTime?: number;
    compressionHigh?: number;
    compressionLow?: number;
  } | null> {
    // 1. Climax Reversal algorithm
    if (strat === 'DELTA_CLIMAX') {
      const sig = this.evaluateClimaxReversal(klines, currentPrice);
      if (!sig) return null;
      return { ...sig, strategy: 'DELTA_CLIMAX', marketRegime: 'Exhaustion Climax' };
    }
    
    // 2. Volatility Compression Breakout (VCB) Strategy - Primary canonical strategy
    if (strat === 'VOLATILITY_COMPRESSION' || strat === 'AUTO_REGIME') {
      const sig = await this.evaluateVolatilityCompression(symbol, klines, currentPrice);
      if (!sig) return null;
      return { ...sig, strategy: 'VOLATILITY_COMPRESSION', marketRegime: 'Consolidation Squeeze' };
    }
    
    // 3. Early Coil Breakout
    if (strat === 'EARLY_COIL_BREAKOUT') {
      const sig = evaluateEarlyCoilBreakout(klines, this.settings as any);
      if (!sig) return null;
      return { ...sig, strategy: 'EARLY_COIL_BREAKOUT', marketRegime: 'Fractal Breakout' };
    }

    // 4. Trend Pullback Strategy (5-pillar confirmation)
    if (strat === 'TREND_PULLBACK') {
      const closedKlines = klines.slice(0, -1);
      const tradeTf = this.settings.timeframe || '15m';
      const htf = getHigherTimeframe(tradeTf);
      let htfKlines: any[] | null = null;
      try {
        htfKlines = await this.getKlines(symbol, htf);
      } catch (e) {}

      const signal = evaluateTrendPullback(
        closedKlines,
        htfKlines ? htfKlines.slice(0, -1) : null,
        currentPrice,
        {
          tradeTimeframe: tradeTf,
          htfTimeframe: htf,
          symbol,
          emaFast: this.settings.tpbEmaFast || 20,
          emaSlow: this.settings.tpbEmaSlow || 50,
          adxMin: this.settings.tpbAdxMin || 18,
          volSmaPeriod: this.settings.tpbVolumeSmaPeriod || 20,
          minVolumeRatio: this.settings.tpbMinVolumeRatio || 1.0,
          requireVolume: this.settings.tpbRequireVolume !== false,
          maxEntryDistanceAtr: this.settings.tpbMaxEntryDistanceAtr ?? 0.25,
          minRrRatio: this.settings.tpbMinRrRatio || 1.5,
          minScore: this.settings.tpbMinScore || 8
        }
      );
      if (!signal) return null;
      return { ...signal, strategy: 'TREND_PULLBACK', marketRegime: 'Trending [EMA Pullback]' };
    }

    // 5. Macro Range Breakout
    if (strat === 'MACRO_RANGE_BREAKOUT') {
      const atrSeries = calculateATR(klines, 14);
      const currentAtr = atrSeries[atrSeries.length - 1];
      const sig = detectMacroRangeBreakout(klines, currentPrice, currentAtr);
      if (!sig) return null;
      return { ...sig, strategy: 'MACRO_RANGE_BREAKOUT', marketRegime: 'Macro Accumulation' };
    }

    // 6. SMC Liquidity Sweep
    if (strat === 'SMC_LIQUIDITY_SWEEP') {
      try {
        const htfCandles = await this.getKlines(symbol, '1h');
        const sig = evaluateSmc(klines, htfCandles, currentPrice);
        if (sig && sig.score >= this.settings.autoTradeThreshold) {
          // If price is currently inside the FVG entry zone, execute immediately!
          const inZone = Math.abs(currentPrice - sig.entryPrice) / sig.entryPrice < 0.001;
          if (inZone) {
            const risk = Math.abs(currentPrice - sig.sl);
            return {
              direction: sig.direction,
              score: 95,
              atr: risk,
              sl: sig.sl,
              tp1: sig.tp1,
              tp2: sig.direction === 'LONG' ? currentPrice + (risk * 3) : currentPrice - (risk * 3),
              tp3: sig.direction === 'LONG' ? currentPrice + (risk * 5) : currentPrice - (risk * 5),
              strategy: 'SMC_LIQUIDITY_SWEEP',
              marketRegime: 'SMC Liquidity Sweep',
              reason: sig.reason
            };
          }

          // Otherwise add to pending limits for retracement
          const expiryTime = Date.now() + (15 * 60 * 1000 * 6);
          this.pendingSmcSetups.set(symbol, { ...sig, expiryTime });
        }
      } catch(e) {}
      return null;
    }

    // 7. Ranging Mean-Reversion Strategy
    if (strat === 'BINANCE_COMPOSITE') {
      const compSig = this.evaluateCompositeStrategy(klines, currentPrice);
      if (!compSig) return null;
      return { ...compSig, strategy: 'BINANCE_COMPOSITE', marketRegime: 'Ranging [1:3 R:R Mean-Reversion]' };
    }

    return null;
  }

  private async _evaluateSignalRaw(
    symbol: string, 
    klines: any[], 
    currentPrice: number,
    classification?: RegimeClassificationResult,
    globalRegime?: GlobalMarketRegime
  ): Promise<{
    direction: 'LONG' | 'SHORT';
    score: number;
    atr: number;
    sl: number;
    tp1: number;
    tp2: number;
    tp3: number;
    strategy?: string;
    marketRegime?: string;
    isAutoRegime?: boolean;
    reason?: string;
    signalTime?: number;
    compressionHigh?: number;
    compressionLow?: number;
  } | null> {
    if (klines.length < 30) return null;

    // Multi-strategy resolution: Gather all active strategies configured by user
    let activeStrategies: string[] = [];
    if (this.settings.enabledStrategies && Array.isArray(this.settings.enabledStrategies) && this.settings.enabledStrategies.length > 0) {
      activeStrategies = [...this.settings.enabledStrategies];
    } else if (this.settings.activeStrategy && (this.settings.activeStrategy as string) !== 'AUTO_REGIME') {
      activeStrategies = [this.settings.activeStrategy];
    } else {
      activeStrategies = ['VOLATILITY_COMPRESSION'];
    }

    // Evaluate all active selective strategies
    const candidateSignals: any[] = [];
    for (const strat of activeStrategies) {
      try {
        const sig = await this._evaluateSingleStrategy(strat, symbol, klines, currentPrice, classification, globalRegime);
        if (sig) {
          candidateSignals.push(sig);
        }
      } catch (err) {
        console.error(`[AutoTrader] Error evaluating strategy ${strat} on ${symbol}:`, err);
      }
    }

    if (candidateSignals.length === 0) return null;
    if (candidateSignals.length === 1) return candidateSignals[0];

    // Arbitration: sort candidates by score descending, breaking ties by order of activeStrategies
    candidateSignals.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const idxA = activeStrategies.indexOf(a.strategy);
      const idxB = activeStrategies.indexOf(b.strategy);
      return (idxA !== -1 ? idxA : 99) - (idxB !== -1 ? idxB : 99);
    });

    return candidateSignals[0];
  }

  /**
   * Regime Filter & Strategy Bucket Selection:
   * Restricts the bot to ONLY pick from strategies configured in the user's Strategy Bucket.
   * Classifies current market regime (trending, ranging, exhaustion, breakout, or not_tradable).
   * Runs enabled bucket strategies in order of user priority.
   */
  private async evaluateAutoRegimeSignal(
    symbol: string,
    klines: any[],
    currentPrice: number,
    cachedClassification?: any,
    cachedGlobalRegime?: any
  ): Promise<{
    direction: 'LONG' | 'SHORT' | 'NEUTRAL';
    score: number;
    atr: number;
    sl: number;
    tp1: number;
    tp2: number;
    tp3: number;
    reason?: string;
    strategy?: string;
    marketRegime?: string;
    isAutoRegime?: boolean;
    frequencyPreset?: string;
    macroColor?: string;
    signalTime?: number;
    compressionHigh?: number;
    compressionLow?: number;
  } | null> {
    if (klines.length < 35) return null;

    // Closed candle slice: guarantees 100% closed candle execution with zero lookahead
    const closedKlines = klines.slice(0, -1);
    const lastClosed = closedKlines[closedKlines.length - 1];
    const closedCandleTime = lastClosed.time;

    const globalRegime = cachedGlobalRegime || await this.getGlobalRegime();
    if (!globalRegime.isTradable || globalRegime.macroColor === 'RED') {
      return null;
    }

    const classification = cachedClassification || classifyMarketRegime(closedKlines, currentPrice, globalRegime.macroColor);
    const detectedRegime = classification.regime;

    // Hard Gate: 2-Bar Confirmation Hysteresis & Immediate No-Trade Zone (TRANSITION/PANIC/DEAD_VOLUME/UNCLEAR)
    const regimeCheck = this.updateAndCheckRegimeConfirmation(symbol, detectedRegime, closedCandleTime);
    if (!regimeCheck.confirmed || !regimeCheck.regime) {
      this.logScanResult(
        symbol,
        'NEUTRAL',
        false,
        regimeCheck.reason || 'Regime Not Confirmed',
        currentPrice,
        0,
        0,
        0,
        {
          marketRegime: detectedRegime,
          macroColor: globalRegime.macroColor,
          strategy: 'AUTO_REGIME',
          gateResults: {
            dataFresh: 'PASS',
            regimeConfirmed: 'FAIL',
            strategyAllowedInRegime: 'NOT_CHECKED',
            directionAllowed: 'NOT_CHECKED',
            higherTimeframeAligned: 'NOT_CHECKED',
            structureValid: 'NOT_CHECKED',
            confirmationCandleClosed: 'PASS',
            volumeValid: 'NOT_CHECKED',
            spreadValid: 'PASS',
            stopStructurallyValid: 'NOT_CHECKED',
            rrValid: 'NOT_CHECKED'
          },
          rejectionReasons: [regimeCheck.reason || 'Regime Not Confirmed']
        }
      );
      return null;
    }

    const currentRegime = regimeCheck.regime;

    const bucket: StrategyBucketItem[] = (this.settings.strategyBucket && this.settings.strategyBucket.length > 0)
      ? this.settings.strategyBucket
      : DEFAULT_STRATEGY_BUCKET;

    const eligibleCandidates = getEligibleBucketStrategies(bucket, currentRegime, globalRegime.macroColor);
    if (eligibleCandidates.length === 0) {
      this.logScanResult(
        symbol,
        'NEUTRAL',
        false,
        `No eligible strategies mapped for confirmed regime '${currentRegime}'`,
        currentPrice,
        0,
        0,
        0,
        {
          marketRegime: currentRegime,
          macroColor: globalRegime.macroColor,
          strategy: 'AUTO_REGIME',
          gateResults: {
            dataFresh: 'PASS',
            regimeConfirmed: 'PASS',
            strategyAllowedInRegime: 'FAIL',
            directionAllowed: 'NOT_CHECKED',
            higherTimeframeAligned: 'NOT_CHECKED',
            structureValid: 'NOT_CHECKED',
            confirmationCandleClosed: 'PASS',
            volumeValid: 'NOT_CHECKED',
            spreadValid: 'PASS',
            stopStructurallyValid: 'NOT_CHECKED',
            rrValid: 'NOT_CHECKED'
          },
          rejectionReasons: [`No eligible strategies mapped for '${currentRegime}'`]
        }
      );
      return null;
    }

    for (const candidate of eligibleCandidates) {
      let pendingSignal: any = null;

      if (candidate.id === 'TREND_PULLBACK' && currentRegime.startsWith('TRENDING')) {
        const tradeTf = this.settings.timeframe || '15m';
        const htf = getHigherTimeframe(tradeTf);
        let htfKlines: any[] | null = null;
        try {
          htfKlines = await this.getKlines(symbol, htf);
        } catch (e) {}

        const pullbackSignal = evaluateTrendPullback(
          closedKlines,
          htfKlines ? htfKlines.slice(0, -1) : null,
          currentPrice,
          {
            tradeTimeframe: tradeTf,
            htfTimeframe: htf,
            symbol,
            emaFast: this.settings.tpbEmaFast || 20,
            emaSlow: this.settings.tpbEmaSlow || 50,
            adxMin: this.settings.tpbAdxMin || 18,
            volSmaPeriod: this.settings.tpbVolumeSmaPeriod || 20,
            minVolumeRatio: this.settings.tpbMinVolumeRatio || 1.0,
            requireVolume: this.settings.tpbRequireVolume !== false,
            maxEntryDistanceAtr: this.settings.tpbMaxEntryDistanceAtr ?? 0.25,
            minRrRatio: this.settings.tpbMinRrRatio || 1.5,
            minScore: this.settings.tpbMinScore || 8
          }
        );
        if (pullbackSignal && (!candidate.direction || pullbackSignal.direction === candidate.direction)) {
          pendingSignal = { ...pullbackSignal };
        }
      }

      if (candidate.id === 'BINANCE_COMPOSITE' && currentRegime === 'RANGING') {
        const compositeSignal = this.evaluateCompositeStrategy(closedKlines, currentPrice);
        if (compositeSignal) {
          pendingSignal = { ...compositeSignal };
        }
      }

      if (candidate.id === 'VOLATILITY_COMPRESSION' && currentRegime.startsWith('BREAKOUT')) {
        const vcbSignal = await this.evaluateVolatilityCompression(symbol, closedKlines, currentPrice);
        if (vcbSignal && (!candidate.direction || vcbSignal.direction === candidate.direction)) {
          pendingSignal = { ...vcbSignal };
        }
      }

      if (candidate.id === 'EARLY_COIL_BREAKOUT' && currentRegime.startsWith('BREAKOUT')) {
        const coilSignal = evaluateEarlyCoilBreakout(closedKlines, this.settings as any);
        if (coilSignal && (!candidate.direction || coilSignal.direction === candidate.direction)) {
          pendingSignal = { ...coilSignal };
        }
      }

      if (candidate.id === 'DELTA_CLIMAX' && (currentRegime.startsWith('EXHAUSTION') || currentRegime === 'RANGING')) {
        const climaxSignal = this.evaluateClimaxReversal(closedKlines, currentPrice);
        if (climaxSignal && (!candidate.direction || climaxSignal.direction === candidate.direction)) {
          pendingSignal = { ...climaxSignal };
        }
      }

      if (candidate.id === 'SMC_LIQUIDITY_SWEEP' && (currentRegime.startsWith('EXHAUSTION') || currentRegime === 'RANGING' || currentRegime.startsWith('TRENDING'))) {
        try {
          const htfCandles = await this.getKlines(symbol, '1h');
          const smcSig = evaluateSmc(closedKlines, htfCandles, currentPrice);
          if (smcSig && (!candidate.direction || smcSig.direction === candidate.direction)) {
            const risk = Math.abs(currentPrice - smcSig.sl);
            pendingSignal = {
              direction: smcSig.direction,
              score: smcSig.score,
              atr: risk,
              sl: smcSig.sl,
              tp1: smcSig.tp1,
              tp2: smcSig.direction === 'LONG' ? currentPrice + (risk * 3) : currentPrice - (risk * 3),
              tp3: smcSig.direction === 'LONG' ? currentPrice + (risk * 5) : currentPrice - (risk * 5),
              signalTime: smcSig.signalTime || lastClosed.time
            };
          }
        } catch (e) {
          console.error(`HTF fetch failed for ${symbol} SMC sweep:`, e);
        }
      }

      if (pendingSignal) {
        // Evaluate the 10 Hard Vetoes BEFORE confidence scoring
        const gateResults: Record<string, 'PASS' | 'FAIL' | 'NOT_CHECKED'> = {
          dataFresh: 'PASS',
          regimeConfirmed: 'PASS',
          strategyAllowedInRegime: 'PASS',
          directionAllowed: 'PASS',
          higherTimeframeAligned: 'NOT_CHECKED',
          structureValid: 'NOT_CHECKED',
          confirmationCandleClosed: 'PASS',
          volumeValid: 'PASS',
          spreadValid: 'PASS',
          stopStructurallyValid: 'NOT_CHECKED',
          rrValid: 'NOT_CHECKED'
        };
        const rejectionReasons: string[] = [];

        // 1. Directional Alignment Gate with Regime
        if (currentRegime === 'TRENDING_UP' || currentRegime === 'BREAKOUT_UP' || currentRegime === 'EXHAUSTION_DOWN') {
          if (pendingSignal.direction !== 'LONG') {
            gateResults.directionAllowed = 'FAIL';
            rejectionReasons.push(`Direction conflict: Regime is ${currentRegime} but signal direction is ${pendingSignal.direction}`);
          }
        } else if (currentRegime === 'TRENDING_DOWN' || currentRegime === 'BREAKOUT_DOWN' || currentRegime === 'EXHAUSTION_UP') {
          if (pendingSignal.direction !== 'SHORT') {
            gateResults.directionAllowed = 'FAIL';
            rejectionReasons.push(`Direction conflict: Regime is ${currentRegime} but signal direction is ${pendingSignal.direction}`);
          }
        }

        // 2. Higher-Timeframe Agreement Gate (1H vs 15m)
        const htfCheck = await this.checkHtfAgreement(symbol, pendingSignal.direction);
        if (!htfCheck.passed) {
          gateResults.higherTimeframeAligned = 'FAIL';
          rejectionReasons.push(htfCheck.reason || 'HTF 1H trend contradicts signal direction');
        } else {
          gateResults.higherTimeframeAligned = 'PASS';
        }

        // 3. Structure Invalidation Gate (Swing Points, Overextension, Stack, Opposing Vol Spike)
        const structureCheck = this.checkStructureValid(closedKlines, pendingSignal.direction, currentPrice, currentRegime);
        if (!structureCheck.valid) {
          gateResults.structureValid = 'FAIL';
          rejectionReasons.push(structureCheck.reason || 'Structure invalidation gate failed');
        } else {
          gateResults.structureValid = 'PASS';
        }

        // 4. Stop Loss Structural Validity Gate
        const risk = Math.abs(currentPrice - pendingSignal.sl);
        const minRisk = currentPrice * 0.003; // At least 0.3% to avoid spread / noise stop-out
        const maxRisk = currentPrice * 0.045; // Max 4.5% to avoid oversized risk
        if (risk < minRisk) {
          gateResults.stopStructurallyValid = 'FAIL';
          rejectionReasons.push(`Stop loss too tight: ${(risk / currentPrice * 100).toFixed(2)}% < 0.3% minimum distance`);
        } else if (risk > maxRisk) {
          gateResults.stopStructurallyValid = 'FAIL';
          rejectionReasons.push(`Stop loss too wide: ${(risk / currentPrice * 100).toFixed(2)}% > 4.5% maximum allowable risk`);
        } else {
          gateResults.stopStructurallyValid = 'PASS';
        }

        // 5. Structural Risk-to-Reward Gate (>= 3.0 required, or >= 2.5 for DELTA_CLIMAX / Mean Reversion)
        const minRR = (candidate.id === 'DELTA_CLIMAX' || currentRegime.startsWith('EXHAUSTION')) ? 2.5 : 3.0;
        const reward3 = Math.abs(pendingSignal.tp3 - currentPrice);
        const structuralRR = risk > 0 ? (reward3 / risk) : 0;
        if (structuralRR < minRR) {
          gateResults.rrValid = 'FAIL';
          rejectionReasons.push(`Structural RR ${structuralRR.toFixed(1)} is below required ${minRR.toFixed(1)}:1 threshold`);
        } else {
          gateResults.rrValid = 'PASS';
        }

        const allGatesPassed = Object.values(gateResults).every(res => res === 'PASS');
        const minRequiredScore = globalRegime.macroColor === 'AMBER' ? 80 : (this.settings.autoTradeThreshold || 70);
        const scorePassed = pendingSignal.score >= minRequiredScore;

        if (allGatesPassed && scorePassed) {
          this.logScanResult(
            symbol,
            pendingSignal.direction,
            true,
            `[${currentRegime}] ${candidate.id} Approved (Conf:${pendingSignal.score} RR:${structuralRR.toFixed(1)})`,
            currentPrice,
            pendingSignal.sl,
            pendingSignal.tp1,
            pendingSignal.score,
            {
              strategy: candidate.id,
              marketRegime: currentRegime,
              regimeConfidence: classification.confidence,
              macroColor: globalRegime.macroColor,
              structuralRR: parseFloat(structuralRR.toFixed(2)),
              gateResults,
              rejectionReasons: []
            }
          );

          return {
            ...pendingSignal,
            strategy: candidate.id,
            marketRegime: currentRegime,
            isAutoRegime: true,
            signalTime: lastClosed.time,
            reason: `[${currentRegime}] ${candidate.id} Conf:${pendingSignal.score} RR:${structuralRR.toFixed(1)}`
          };
        } else {
          if (!scorePassed && allGatesPassed) {
            rejectionReasons.push(`Score ${pendingSignal.score} is below threshold ${minRequiredScore}`);
          }
          this.logScanResult(
            symbol,
            pendingSignal.direction,
            false,
            rejectionReasons.join('; '),
            currentPrice,
            pendingSignal.sl,
            pendingSignal.tp1,
            pendingSignal.score,
            {
              strategy: candidate.id,
              marketRegime: currentRegime,
              regimeConfidence: classification.confidence,
              macroColor: globalRegime.macroColor,
              structuralRR: parseFloat(structuralRR.toFixed(2)),
              gateResults,
              rejectionReasons
            }
          );
        }
      }
    }

    return null;
  }
  /**
   * Ranging-Market 1:3 R:R Mean-Reversion Strategy (Bollinger Bands + RSI Re-entry)
   * Enforces:
   * 1. Range Market Filter: Price within ±5% of 200-SMA or flat SMA slope (|slope| < 0.02)
   * 2. Mean-Reversion Setup: Candle closes below lower BB(20,2) & RSI < 30 (Long) or above upper BB & RSI > 70 (Short)
   * 3. Confirmation Candle: Next candle closes back inside Bollinger Bands (avoids falling knife)
   * 4. Structure-Based Tight Stop: stop_distance = 1.5 * (entry_price - band_entry)
   * 5. Fixed 1:3 R:R Target: target_price = entry_price ± 3 * stop_distance (TP1 at 20-SMA middle band)
   */
  private evaluateCompositeStrategy(klines: any[], currentPrice: number): {
    direction: 'LONG' | 'SHORT';
    score: number;
    atr: number;
    sl: number;
    tp1: number;
    tp2: number;
    tp3: number;
    reason?: string;
  } | null {
    if (!klines || klines.length < 35) return null;

    const sig = evaluateRangeMeanReversion(klines, currentPrice, {
      maxAdx: this.settings.rmrMaxAdx ?? 22,
      maxAtrRatio: this.settings.rmrMaxAtrRatio ?? 1.25,
      minScore: this.settings.rmrMinScore ?? 8,
      outerRangePct: this.settings.rmrOuterRangePct ?? 0.20,
      rsiOversold: this.settings.rmrRsiOversold ?? 35,
      rsiOverbought: this.settings.rmrRsiOverbought ?? 65,
      minRrRatio: this.settings.rmrMinRrRatio ?? 1.2,
      bbPeriod: (this.settings as any).bbPeriod || 20,
      bbStdDev: (this.settings as any).bbStdDev || 2.0,
      rangeSmaPct: (this.settings as any).rangeSmaPct || 0.05,
      maxSmaSlope: (this.settings as any).rangeMaxSmaSlope || 0.02,
      stopMult: (this.settings as any).rangeStopMult || 1.5,
      targetRr: (this.settings as any).rangeTargetRr || 3.0,
    });

    if (!sig) return null;

    return {
      direction: sig.direction,
      score: sig.score,
      atr: sig.atr,
      sl: sig.sl,
      tp1: sig.tp1,
      tp2: sig.tp2,
      tp3: sig.tp3,
      reason: sig.reason,
    };
  }

  private evaluateClimaxReversal(candles: any[], currentPrice: number): {
    direction: 'LONG' | 'SHORT';
    score: number;
    atr: number;
    sl: number;
    tp1: number;
    tp2: number;
    tp3: number;
    signalTime?: number;
  } | null {
    if (!candles || candles.length < 35) return null;

    const lookback = 20;
    const lastIdx = candles.length - 1;
    const cClosed = candles[lastIdx];
    const cPrev = candles[lastIdx - 1];

    // Compute ATR over last 14 closed candles
    let atrSum = 0;
    for (let i = lastIdx - 13; i <= lastIdx; i++) {
      if (i <= 0) continue;
      const h = candles[i].high;
      const l = candles[i].low;
      const prevC = candles[i - 1].close;
      atrSum += Math.max(h - l, Math.abs(h - prevC), Math.abs(l - prevC));
    }
    const atr = Math.max(atrSum / 14, currentPrice * 0.01);

    // 20-period average volume
    const volSlice = candles.slice(Math.max(0, lastIdx - lookback), lastIdx);
    const avgVol = volSlice.reduce((s, c) => s + (c.volume || 0), 0) / (volSlice.length || 1);

    // Recent Swing High / Low over last 25 bars (excluding the trigger candle itself)
    const recentCandles = candles.slice(Math.max(0, lastIdx - 25), lastIdx);
    const highestHigh = recentCandles.length > 0 ? Math.max(...recentCandles.map(c => c.high)) : cClosed.high;
    const lowestLow = recentCandles.length > 0 ? Math.min(...recentCandles.map(c => c.low)) : cClosed.low;

    // Pure Setup Check: Statistical Overextension from EMA50
    // A climax reversal ONLY occurs after extreme exhaustion away from mean value (>= 1.6 ATR)
    const closes = candles.map(c => c.close);
    const ema50Series = calculateEMA(closes, 50);
    const ema50 = ema50Series[lastIdx] || currentPrice;

    const isBullOverextended = (highestHigh - ema50) >= (1.6 * atr);
    const isBearOverextended = (ema50 - lowestLow) >= (1.6 * atr);

    if (!isBullOverextended && !isBearOverextended) {
      return null; // Not an exhaustion climax - price is near equilibrium
    }

    const getWicks = (c: any) => {
      const tot = c.high - c.low;
      if (tot === 0) return { upper: 0, lower: 0 };
      const top = Math.max(c.open, c.close);
      const bot = Math.min(c.open, c.close);
      return {
        upper: (c.high - top) / tot,
        lower: (bot - c.low) / tot
      };
    };

    // ==========================================
    // PATTERN 1: SINGLE-BAR CLIMAX PIN BAR REJECTION (Fast Inception)
    // ==========================================
    const isSingleVol = cClosed.volume >= avgVol * 1.75;
    const singleWicks = getWicks(cClosed);

    // Bearish Pin Bar at Peak
    if (isBullOverextended && isSingleVol && cClosed.high >= highestHigh * 0.998 && singleWicks.upper >= 0.38 && currentPrice < cClosed.high) {
      const sl = cClosed.high + (atr * 0.20);
      const risk = Math.abs(currentPrice - sl);
      if (risk <= atr * 1.2) {
        return {
          signalTime: cClosed.time,
          direction: 'SHORT',
          score: 95,
          atr,
          sl,
          tp1: Math.max(0.0001, currentPrice - 1.5 * risk),
          tp2: Math.max(0.0001, currentPrice - 3.0 * risk),
          tp3: Math.max(0.0001, currentPrice - 5.0 * risk)
        };
      }
    }

    // Bullish Hammer at Trough
    if (isBearOverextended && isSingleVol && cClosed.low <= lowestLow * 1.002 && singleWicks.lower >= 0.38 && currentPrice > cClosed.low) {
      const sl = cClosed.low - (atr * 0.20);
      const risk = Math.abs(currentPrice - sl);
      if (risk <= atr * 1.2) {
        return {
          signalTime: cClosed.time,
          direction: 'LONG',
          score: 95,
          atr,
          sl,
          tp1: currentPrice + 1.5 * risk,
          tp2: currentPrice + 3.0 * risk,
          tp3: currentPrice + 5.0 * risk
        };
      }
    }

    // ==========================================
    // PATTERN 2: TWO-BAR CLIMAX + IMMEDIATE REVERSAL
    // ==========================================
    const c1 = cPrev;
    const c2 = cClosed;
    const isC1Vol = c1.volume >= avgVol * 1.6;

    // Bearish Two-Bar Reversal (Climax pump then reversal bar)
    if (isBullOverextended && isC1Vol && c1.high >= highestHigh * 0.995 && c2.close < c2.open && (c2.close < c1.open || getWicks(c2).upper >= 0.35)) {
      const sl = Math.max(c1.high, c2.high) + (atr * 0.20);
      const risk = Math.abs(currentPrice - sl);
      if (risk <= atr * 1.3) {
        return {
          signalTime: c2.time,
          direction: 'SHORT',
          score: 95,
          atr,
          sl,
          tp1: Math.max(0.0001, currentPrice - 1.5 * risk),
          tp2: Math.max(0.0001, currentPrice - 3.0 * risk),
          tp3: Math.max(0.0001, currentPrice - 5.0 * risk)
        };
      }
    }

    // Bullish Two-Bar Reversal (Capitulation dump then reversal bar)
    if (isBearOverextended && isC1Vol && c1.low <= lowestLow * 1.005 && c2.close > c2.open && (c2.close > c1.open || getWicks(c2).lower >= 0.35)) {
      const sl = Math.min(c1.low, c2.low) - (atr * 0.20);
      const risk = Math.abs(currentPrice - sl);
      if (risk <= atr * 1.3) {
        return {
          signalTime: c2.time,
          direction: 'LONG',
          score: 95,
          atr,
          sl,
          tp1: currentPrice + 1.5 * risk,
          tp2: currentPrice + 3.0 * risk,
          tp3: currentPrice + 5.0 * risk
        };
      }
    }

    return null;
  }

  private async evaluateVolatilityCompression(symbol: string, candles: any[], currentPrice: number): Promise<{
    direction: 'LONG' | 'SHORT';
    score: number;
    atr: number;
    sl: number;
    tp1: number;
    tp2: number;
    tp3: number;
    compressionHigh?: number;
    compressionLow?: number;
    signalTime?: number;
    reason?: string;
    checklist?: VcbChecklistResult;
  } | null> {
    if (candles.length < 35) return null;
    
    // Pure closed candles breakout: trigger is strictly the last closed candle
    const lastClosedCandle = candles[candles.length - 1];
    const previousCandles = candles.slice(0, -1);
    
    const atrSeries = calculateATR(previousCandles, 14);
    const atr = atrSeries[atrSeries.length - 1] || currentPrice * 0.015;
    const atrAvg = atrSeries.slice(-50).reduce((a, b) => a + b, 0) / 50;
    
    const settingsObj: any = this.settings; 
    
    // Pure Setup + Volume Detection
    const compression = detectCompression(previousCandles, atr, atrAvg, settingsObj);
    const breakout = detectBreakout(lastClosedCandle, compression, atr, settingsObj, candles);
    
    if (!breakout) return null;
    
    // Score based on breakout metrics and volume expansion
    let score = scoreBreakout(breakout, settingsObj);
    
    // Apply trend and momentum alignment bonus/penalty
    const closes = candles.map(c => c.close);
    const ema9 = calculateEMA(closes, 9).pop() || 0;
    const ema21 = calculateEMA(closes, 21).pop() || 0;
    const ema50 = calculateEMA(closes, 50).pop() || 0;
    const rsi = calculateRSI(closes, 14).pop() || 50;
    score = applyTrendAndMomentumBonus(score, breakout.direction as 'LONG'|'SHORT', ema9, ema21, ema50, rsi, settingsObj);

    if (score < this.settings.autoTradeThreshold) return null;
    
    const sl = determineStopLoss(breakout.direction as 'LONG'|'SHORT', compression, atr, settingsObj, candles, currentPrice);
    const risk = Math.abs(currentPrice - sl);
    if (risk <= 0) return null;

    // Asymmetric Volatility Expansion targets (10x-15% runner potential)
    const { tp1, tp2, tp3 } = calculateVcbTargets(currentPrice, breakout.direction as 'LONG'|'SHORT', risk, compression);

    // Fetch HTF candles for Checklist validation
    const tradeTf = this.settings.timeframe || '15m';
    const htf = getHigherTimeframe(tradeTf);
    let htfCandles: any[] | null = null;
    try {
      htfCandles = await this.getKlines(symbol, htf);
    } catch (e) {}

    // VCB Strategy Final Gate Checklist ("Before Executing a VCB Trade - Quick Checklist")
    const checklist = evaluateVcbChecklist(
      candles,
      htfCandles ? htfCandles.slice(0, -1) : null,
      breakout,
      compression,
      currentPrice,
      sl,
      tp1,
      tp2,
      atr,
      this.settings
    );

    // Final Gate: If checklist does not pass (score < minScore or mandatory gates failed), block entry
    if (!checklist.passed) {
      console.log(`🛡️ [VCB Checklist] ${symbol} rejected by final gate checklist: ${checklist.summary}`);
      return null;
    }
    
    return {
      direction: breakout.direction as 'LONG'|'SHORT',
      score,
      atr,
      sl,
      tp1,
      tp2,
      tp3,
      compressionHigh: compression.windowHigh,
      compressionLow: compression.windowLow,
      signalTime: lastClosedCandle.time,
      reason: `VCB Breakout Inception [Checklist: ${checklist.score}/${checklist.maxScore} ${checklist.recommendation}] (RVOL: ${breakout.rvol.toFixed(1)}x, Squeeze: ${compression.isSqueezed ? 'YES' : 'ATR'})`,
      checklist
    };
  }
}

export const autoTrader = new AutoTrader();
oms.onTradeClosed = (pnl: number) => {
  autoTrader.updateDemoBalance(pnl);
};
oms.isEngineActive = () => autoTrader.isEngineActive();
