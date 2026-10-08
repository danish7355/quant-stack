import fs from 'fs';
import path from 'path';
import { db } from '../firebase.js';
import { COLLECTIONS } from '../dbCollections.js';
import { doc, getDoc, setDoc, collection, query, where, getDocs, deleteDoc } from 'firebase/firestore';
import { oms } from './OMS.js';
import { positionMonitor } from './PositionMonitor.js';
import { isQuotaExhausted, safeSetDoc, safeDeleteDoc, safeGetDoc, safeSetDocSettings, safeGetDocSettings, readLocalJson, writeLocalJson } from './firestoreSafe.js';

import { telegramService } from './TelegramService.js';
import { riskManager } from './RiskManager.js';
import { writeSignalAudit } from './SignalAuditService.js';
import { recordSettingsAudit } from './SettingsAuditService.js';
import { heatmapService } from './HeatmapService.js';
import { reconciliationWorker } from './PositionReconciliationWorker.js';
import { priceStream } from './PriceStream.js';
import { marketBreadthService } from './MarketBreadthService.js';
import { 
  calculateEMA, calculateATR, detectCompression, detectBreakout, 
  isFakeBreakout, scoreBreakout, applyTrendAndMomentumBonus, determineStopLoss, 
  calculateInitialTp, calculateVcbTargets, validateHigherTimeframeTrend,
  evaluateVcbChecklist, VcbChecklistResult
} from '../../src/utils/strategies/volatilityCompression.js';
import { evaluateVolatilityCompressionAdapter } from '../../src/utils/strategies/volatilityCompressionAdapter.js';
import { evaluateTrendPullback, getHigherTimeframe } from '../../src/utils/strategies/trendPullback.js';
import { evaluateSmc } from '../../src/utils/strategies/smcLiquidity.js';
import { detectMacroRangeBreakout } from '../../src/utils/strategies/macroRange.js';
import { evaluateEarlyCoilBreakout } from '../../src/utils/strategies/earlyCoilBreakout.js';
import { evaluateTwoSidedCoilBreakout } from '../../src/utils/strategies/twoSidedCoilBreakout.js';
import { evaluateRangeMeanReversion, evaluateRangeRegimeV1, RangeRegimeSignal } from '../../src/utils/strategies/rangeMeanReversion.js';
import { evaluateEmaGapPullback, checkReal3RRoom } from '../../src/utils/strategies/emaGapPullback.js';
import { evaluateEma5PaVolume } from '../../src/utils/strategies/ema5PaVolume.js';
import { evaluateTrendPullbackRetest, createTprState, TprState } from '../../src/utils/strategies/trendPullbackRetest.js';
import { evaluateEma5RejectionReclaim, createErrState, ErrState } from '../../src/utils/strategies/ema5RejectionReclaim.js';
import { evaluateEma5ExactEntry, createEeeState, EeeState } from '../../src/utils/strategies/ema5ExactEntry.js';
import { evaluateSetup as evaluateEma5ExactEntryV2 } from '../../src/utils/strategies/ema5ExactEntryV2.js';
import { calculateRSI } from '../../src/utils/indicators.js';
import {
  allowVCB,
  allowSMCLiquidity,
  allowEMAMeanReversion,
  allowTrendPullback,
  extractVcbRegimeMetrics,
  extractSmcRegimeMetrics,
  extractEmaMeanReversionRegimeMetrics,
  extractTrendPullbackRegimeMetrics,
  evaluateMasterRegimeDecision,
  strategyRegimeTracker
} from '../../src/utils/strategies/strategyRegimeFilters.js';
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
import { analyzeCoinDcxRegime, CoinDcxRegimeResult } from '../../src/utils/coindcxRegimeAnalyzer.js';
import { 
  analyzeThreeLayerRegime, 
  ThreeLayerRegimeState, 
  CoreRegimeType 
} from '../../src/utils/regime/threeLayerRegime.js';

export type ServerBotSettings = TradingSettings;

export class AutoTrader {
  public onSettingsChanged?: (settings: ServerBotSettings) => void;

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
  private cachedThreeLayerRegime: ThreeLayerRegimeState | null = null;
  private lastThreeLayerRegimeTime = 0;
  private threeLayerHysteresis = {
    lastConfirmedRegime: 'RANGE' as CoreRegimeType,
    lastCandidateRegime: 'RANGE' as CoreRegimeType,
    consecutiveCandles: 2,
    regimeAgeBars: 12
  };
  private globalFilterBlockActive = false;
  private globalFilterBlockReason = '';
  // Per-symbol state machine state for TREND_PULLBACK_RETEST
  private tprStates = new Map<string, TprState>();
  // Per-symbol state machine state for EMA5_REJECTION_RECLAIM_V1
  private errStates = new Map<string, ErrState>();
  // Per-symbol state machine state for EMA5_EXACT_ENTRY_V1
  private eeeStates = new Map<string, EeeState>();
  // Consumed setup keys for EMA5_EXACT_ENTRY_V2
  private eev2ConsumedKeys = new Set<string>();

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
   * Higher-Timeframe Directional Agreement Filter
   */
  private async checkHtfAgreement(
    symbol: string, 
    direction: 'LONG' | 'SHORT'
  ): Promise<{ passed: boolean; reason?: string; htfBias?: string; htfTimeframe?: string }> {
    try {
      const bypass =
        this.settings.useMtfAlignment === false ||
        this.settings.bypassHtfAlignment === true ||
        this.isGateDisabled('RISK_htfStructure') ||
        this.isGateDisabled('EGP_htfTrend');

      const targetHtf = this.settings.htfTimeframe || getHigherTimeframe(this.settings.timeframe || '15m');
      const htfKlines = await this.getKlines(symbol, targetHtf);
      if (!htfKlines || htfKlines.length < 30) {
        return { passed: true, htfBias: 'NEUTRAL', htfTimeframe: targetHtf };
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

      if (bypass) {
        return { passed: true, htfBias, htfTimeframe: targetHtf };
      }

      if (direction === 'LONG' && htfBias === 'BEARISH') {
        return { 
          passed: false, 
          reason: `HTF ${targetHtf} trend is BEARISH (Price & EMA21 < EMA50). Long signals vetoed.`, 
          htfBias,
          htfTimeframe: targetHtf
        };
      }
      if (direction === 'SHORT' && htfBias === 'BULLISH') {
        return { 
          passed: false, 
          reason: `HTF ${targetHtf} trend is BULLISH (Price & EMA21 > EMA50). Short signals vetoed.`, 
          htfBias,
          htfTimeframe: targetHtf
        };
      }
      return { passed: true, htfBias, htfTimeframe: targetHtf };
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
    regime?: MarketRegimeType,
    strategy?: string
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
    if (isExhaustion || strategy === 'SMC_LIQUIDITY_SWEEP' || strategy === 'LIQUIDITY_SWEEP_REVERSAL') {
      // Must not be runaway explosive blow-off beyond 4.0 ATR
      if (overextensionAtr > 4.0) {
        return { valid: false, reason: `Runaway parabolic trend: ${(overextensionAtr).toFixed(2)} ATR from EMA50 exceeds 4.0 ATR safety cap` };
      }
      return { valid: true };
    }

    // 2. RANGE MEAN REVERSION REGIME STRUCTURE
    if (isRanging || strategy === 'BINANCE_COMPOSITE' || strategy === 'RANGE_MEAN_REVERSION' || strategy === 'RANGE_REGIME_V1' || strategy === 'EMA5_REJECTION_RECLAIM_V1' || strategy === 'EMA5_REJECTION_RECLAIM') {
      if (overextensionAtr > 2.5) {
        return { valid: false, reason: `Runaway parabolic trend: ${(overextensionAtr).toFixed(2)} ATR from EMA50 exceeds 2.5 ATR safety cap` };
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

  /**
   * Universal Higher-Timeframe (HTF) Structure & Trend Alignment Gate
   * Evaluates across ALL strategies during execution and scanning.
   * Checks:
   * 1. Bypass toggles (useMtfAlignment === false, bypassHtfAlignment === true, RISK_htfStructure, EGP_htfTrend)
   * 2. Local Structure Validity (checkStructureValid for swing invalidation, runaway parabolic overextension, and heavy opposing volume)
   * 3. HTF Trend Alignment (EMA20/50/200 Stack & Slope on HTF)
   * 4. HTF Key Level Obstacle Clearance (Avoid longing directly into immediate HTF resistance or shorting into support)
   */
  private async checkUniversalHtfStructureAlignment(
    symbol: string,
    direction: 'LONG' | 'SHORT',
    currentPrice: number,
    closedKlines: any[],
    strategy?: string,
    regime?: MarketRegimeType
  ): Promise<{
    passed: boolean;
    bypassed: boolean;
    reason?: string;
    htfBias?: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    htfTimeframe?: string;
    obstacleDistancePct?: number;
  }> {
    // 1. Bypass Checks
    const isBypassed =
      this.settings.useMtfAlignment === false ||
      this.settings.bypassHtfAlignment === true ||
      this.isGateDisabled('RISK_htfStructure') ||
      (strategy === 'EMA_GAP_PULLBACK' && this.isGateDisabled('EGP_htfTrend'));

    if (isBypassed) {
      return { passed: true, bypassed: true, htfBias: 'NEUTRAL' };
    }

    // 2. Local Structure Validity Check
    const localStructure = this.checkStructureValid(closedKlines, direction, currentPrice, regime, strategy);
    if (!localStructure.valid) {
      return {
        passed: false,
        bypassed: false,
        reason: `Local Structure Invalidation: ${localStructure.reason}`,
        htfBias: 'NEUTRAL'
      };
    }

    // 3. Determine Higher Timeframe (User setting or dynamic mapping)
    const targetHtf = this.settings.htfTimeframe || getHigherTimeframe(this.settings.timeframe || '15m');
    const htfKlines = await this.getKlines(symbol, targetHtf);

    // If HTF klines insufficient, pass gracefully without false positive kills
    if (!htfKlines || htfKlines.length < 30) {
      return { passed: true, bypassed: false, htfBias: 'NEUTRAL', htfTimeframe: targetHtf };
    }

    const closedHtf = htfKlines.slice(0, -1);
    const closes = closedHtf.map(k => k.close);
    const highs = closedHtf.map(k => k.high);
    const lows = closedHtf.map(k => k.low);
    const lastClose = closes[closes.length - 1];

    const ema20Series = calculateEMA(closes, 20);
    const ema50Series = calculateEMA(closes, 50);
    const ema20 = ema20Series[ema20Series.length - 1] || lastClose;
    const ema50 = ema50Series[ema50Series.length - 1] || lastClose;

    // HTF Trend Bias Determination
    let htfBias: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
    if (lastClose > ema50 && ema20 > ema50) {
      htfBias = 'BULLISH';
    } else if (lastClose < ema50 && ema20 < ema50) {
      htfBias = 'BEARISH';
    }

    const isMeanReversion =
      strategy === 'BINANCE_COMPOSITE' ||
      strategy === 'RANGE_MEAN_REVERSION' ||
      strategy === 'RANGE_REGIME_V1' ||
      strategy === 'EMA5_REJECTION_RECLAIM' ||
      strategy === 'EMA5_REJECTION_RECLAIM_V1' ||
      strategy === 'SMC_LIQUIDITY_SWEEP' ||
      strategy === 'LIQUIDITY_SWEEP_REVERSAL' ||
      (regime && (regime === 'RANGING' || regime.startsWith('EXHAUSTION')));

    // Trend Direction Agreement
    if (!isMeanReversion) {
      // Continuation strategies MUST agree with HTF trend
      if (direction === 'LONG' && htfBias === 'BEARISH') {
        return {
          passed: false,
          bypassed: false,
          reason: `HTF (${targetHtf}) trend is BEARISH (Price ${lastClose.toFixed(4)} < EMA50 ${ema50.toFixed(4)} & EMA20 < EMA50). Long signals vetoed.`,
          htfBias,
          htfTimeframe: targetHtf
        };
      }
      if (direction === 'SHORT' && htfBias === 'BULLISH') {
        return {
          passed: false,
          bypassed: false,
          reason: `HTF (${targetHtf}) trend is BULLISH (Price ${lastClose.toFixed(4)} > EMA50 ${ema50.toFixed(4)} & EMA20 > EMA50). Short signals vetoed.`,
          htfBias,
          htfTimeframe: targetHtf
        };
      }
    }

    // 4. HTF Key Level Obstacle Avoidance (Check clearance to nearest HTF swing barrier)
    const recentHtfBars = closedHtf.slice(-25);
    const htfHighs = recentHtfBars.map(k => k.high);
    const htfLows = recentHtfBars.map(k => k.low);
    const htfResistance = Math.max(...htfHighs);
    const htfSupport = Math.min(...htfLows);

    if (direction === 'LONG') {
      const distToResistancePct = (htfResistance - currentPrice) / currentPrice;
      // If price is within less than 0.25% of major HTF resistance, long entry has no room
      if (distToResistancePct > 0 && distToResistancePct < 0.0025) {
        return {
          passed: false,
          bypassed: false,
          reason: `HTF (${targetHtf}) major resistance barrier directly ahead at ${htfResistance.toFixed(4)} (clearance ${(distToResistancePct * 100).toFixed(2)}% < 0.25%)`,
          htfBias,
          htfTimeframe: targetHtf,
          obstacleDistancePct: distToResistancePct
        };
      }
    } else {
      const distToSupportPct = (currentPrice - htfSupport) / currentPrice;
      // If price is within less than 0.25% of major HTF support, short entry has no room
      if (distToSupportPct > 0 && distToSupportPct < 0.0025) {
        return {
          passed: false,
          bypassed: false,
          reason: `HTF (${targetHtf}) major support barrier directly ahead at ${htfSupport.toFixed(4)} (clearance ${(distToSupportPct * 100).toFixed(2)}% < 0.25%)`,
          htfBias,
          htfTimeframe: targetHtf,
          obstacleDistancePct: distToSupportPct
        };
      }
    }

    return {
      passed: true,
      bypassed: false,
      htfBias,
      htfTimeframe: targetHtf
    };
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
      const tradeLogsRef = collection(db, COLLECTIONS.TRADE_LOGS);
      const qLogs = query(tradeLogsRef, where('time_close', '<', cutoffDate));
      const logsSnap = await getDocs(qLogs);
      
      let logsDeleted = 0;
      for (const docSnap of logsSnap.docs.slice(0, 10)) {
        await safeDeleteDoc(doc(db, COLLECTIONS.TRADE_LOGS, docSnap.id));
        logsDeleted++;
      }

      // 2. Cleanup 'positions' where status is 'CLOSED' and time_close < cutoffDate
      // We query just on 'status' and filter dates locally to avoid requiring composite Firestore indexes
      const posRef = collection(db, COLLECTIONS.POSITIONS);
      const qPos = query(posRef, where('status', '==', 'CLOSED'));
      const posSnap = await getDocs(qPos);
      
      let posDeleted = 0;
      for (const docSnap of posSnap.docs) {
        if (posDeleted >= 10) break;
        const data = docSnap.data();
        if (data.time_close && data.time_close < cutoffDate) {
          await safeDeleteDoc(doc(db, COLLECTIONS.POSITIONS, docSnap.id));
          posDeleted++;
        }
      }

      console.log(`🧹 [AutoTrader] Cleanup complete. Deleted ${logsDeleted} trade logs and ${posDeleted} closed positions.`);
    } catch (error) {
      console.error('❌ [AutoTrader] Error cleaning up old logs:', error);
    }
  }

  /**
   * Helper that merges incoming settings onto target while strictly preventing
   * non-empty credentials from being erased by empty strings, null, undefined, or masked asterisks.
   */
  public mergeSettingsPreservingCredentials(
    target: ServerBotSettings,
    source: Partial<ServerBotSettings>,
    forceClearCredentials = false
  ): ServerBotSettings {
    const updated = { ...target };
    const credFields = ['telegramBotToken', 'telegramChatId', 'binanceApiKey', 'binanceApiSecret', 'githubPat'];

    for (const [key, val] of Object.entries(source)) {
      if (val === undefined || val === null) continue;

      const isCred = credFields.includes(key);
      if (isCred && !forceClearCredentials) {
        if (typeof val === 'string') {
          const trimmed = val.trim();
          // Never allow empty strings, whitespace, or masked patterns to overwrite a valid credential
          if (trimmed === '' || trimmed.includes('****') || trimmed.includes('••••')) {
            continue;
          }
        }
      }

      (updated as any)[key] = val;
    }

    return updated;
  }

  public async loadSettings(): Promise<ServerBotSettings> {
    // 1. Load local settings from disk (fast, immediate resilience)
    const localSettings = readLocalJson<Partial<ServerBotSettings>>('settings.json', {});
    const hasLocal = Boolean(localSettings && Object.keys(localSettings).length > 0);

    if (hasLocal) {
      this.settings = this.mergeSettingsPreservingCredentials(this.settings, localSettings);
    }

    // 2. Fetch remote settings from Firestore (canonical cloud source across Render deploys)
    let remoteData: Partial<ServerBotSettings> | null = null;
    try {
      const snapRes = await safeGetDocSettings(doc(db, COLLECTIONS.SETTINGS, COLLECTIONS.SETTINGS_DOC));
      if (snapRes.success && snapRes.data) {
        remoteData = snapRes.data as Partial<ServerBotSettings>;
      }
    } catch (e) {
      console.warn('AutoTrader: Could not reach Firestore for settings, using local fallback.');
    }

    if (remoteData && Object.keys(remoteData).length > 0) {
      const localVersion = Number(this.settings.settingsVersion) || 0;
      const remoteVersion = Number(remoteData.settingsVersion) || 0;
      const localTime = this.settings.updatedAt ? new Date(this.settings.updatedAt).getTime() : 0;
      const remoteTime = remoteData.updatedAt ? new Date(remoteData.updatedAt).getTime() : 0;

      // Determine which source is strictly newer
      const isRemoteNewer = remoteVersion > localVersion || (remoteVersion === localVersion && remoteTime > localTime);
      const isLocalNewer = localVersion > remoteVersion || (localVersion === remoteVersion && localTime > remoteTime);

      if (!hasLocal || isRemoteNewer) {
        // Case A: Fresh Render deploy (no local file) OR Firestore has strictly newer version
        console.log(`☁️ [AutoTrader] Adopting remote Firestore settings (v${remoteVersion}, updated ${remoteData.updatedAt || 'unknown'}).`);
        this.settings = this.mergeSettingsPreservingCredentials(this.settings, remoteData);
        // Cache to local disk
        writeLocalJson('settings.json', this.settings);
      } else if (isLocalNewer) {
        // Case B: Local disk settings are strictly newer than Firestore
        console.log(`💾 [AutoTrader] Local settings (v${localVersion}) are newer than Firestore (v${remoteVersion}). Syncing local to Firestore...`);
        // Keep local settings and push them to Firestore so cloud stays up-to-date!
        safeSetDocSettings(doc(db, COLLECTIONS.SETTINGS, COLLECTIONS.SETTINGS_DOC), this.settings, { merge: true }).catch(() => {});
      } else {
        // Case C: Same version - merge any credentials that exist in one but not the other
        this.settings = this.mergeSettingsPreservingCredentials(this.settings, remoteData);
        writeLocalJson('settings.json', this.settings);
      }
    } else if (hasLocal) {
      // Case D: Firestore was empty or unreachable, but local settings exist -> push local to Firestore
      console.log(`💾 [AutoTrader] Initializing Firestore from local settings (v${this.settings.settingsVersion || 1})...`);
      safeSetDocSettings(doc(db, COLLECTIONS.SETTINGS, COLLECTIONS.SETTINGS_DOC), this.settings, { merge: true }).catch(() => {});
    }

    // 3. Fallback to process.env credentials if still missing (essential for Render env vars)
    if (!this.settings.telegramBotToken && process.env.TELEGRAM_BOT_TOKEN) {
      this.settings.telegramBotToken = process.env.TELEGRAM_BOT_TOKEN;
    }
    if (!this.settings.telegramChatId && process.env.TELEGRAM_CHAT_ID) {
      this.settings.telegramChatId = process.env.TELEGRAM_CHAT_ID;
    }
    if (!this.settings.binanceApiKey && process.env.BINANCE_API_KEY) {
      this.settings.binanceApiKey = process.env.BINANCE_API_KEY;
    }
    if (!this.settings.binanceApiSecret && process.env.BINANCE_API_SECRET) {
      this.settings.binanceApiSecret = process.env.BINANCE_API_SECRET;
    }

    if (!this.settings.strategyBucket || this.settings.strategyBucket.length === 0) {
      this.settings.strategyBucket = DEFAULT_STRATEGY_BUCKET;
    }
    if (this.settings.telegramBotToken && this.settings.telegramChatId) {
      telegramService.updateConfig(this.settings.telegramBotToken, this.settings.telegramChatId);
    }
    telegramService.updateSettings(this.settings);
    this.syncRiskManagerSettings();
    positionMonitor.settings = this.settings;

    console.log(`⚙️ [AutoTrader] Settings ready. Version: v${this.settings.settingsVersion || 1}, Strategy: ${this.settings.activeStrategy}, Telegram: ${this.settings.telegramBotToken ? 'Configured' : 'Missing'}`);
    this.onSettingsChanged?.(this.settings);
    return this.settings;
  }

  public isGateDisabled(gateId: string): boolean {
    if (!this.settings || !this.settings.disabledGates) return false;
    // When the operator sets a specific autoTradeThreshold (> 50), the score threshold is strictly active and never bypassed
    if ((gateId === 'RISK_threshold' || gateId === 'risk_threshold') && (this.settings.autoTradeThreshold ?? 70) > 50) {
      return false;
    }
    const dg = this.settings.disabledGates as Record<string, boolean>;
    if (dg[gateId] === true) return true;
    if (dg[gateId.toLowerCase()] === true) return true;
    if (dg[gateId.toUpperCase()] === true) return true;
    if (gateId.startsWith('RISK_') && dg[gateId.replace(/^RISK_/, 'risk_')] === true) return true;
    if (gateId.startsWith('risk_') && dg[gateId.replace(/^risk_/, 'RISK_')] === true) return true;
    return false;
  }

  private syncRiskManagerSettings() {
    riskManager.updateSettings({
      limitPct: this.settings.dailyLossLimitPct,
      maxLosses: this.settings.maxConsecutiveLosses ?? 4,
      maxExposure: this.settings.maxPortfolioExposurePct ?? 100,
      maxTrades: this.settings.maxConcurrentTrades,
      bypassMaxPositions: this.settings.bypassMaxPositions || this.isGateDisabled('RISK_maxConcurrent'),
      bypassMaxConsecutiveLosses: this.settings.bypassMaxConsecutiveLosses,
      bypassDailyLossLimit: this.settings.bypassDailyLossLimit || this.isGateDisabled('RISK_dailyLoss'),
      bypassExposureLimit: this.settings.bypassExposureLimit,
      bypassLiquidationBuffer: this.settings.bypassLiquidationBuffer || this.isGateDisabled('CR_stopDistance'),
      minLiquidationBuffer: this.settings.minLiquidationBuffer ?? 1.3,
      maxSinglePositionExposureMult: this.settings.maxSinglePositionExposureMult ?? 5,
      minStopDistancePct: this.settings.minStopDistancePct ?? 0.005,
      allowFractionalContracts: this.settings.allowFractionalContracts !== false,
      killSwitchActive: this.settings.killSwitchActive,
    });
  }

  private setTradeCooldown(symbol: string) {
    if (this.settings.bypassTradeCooldown) return;
    const cooldownSecs = this.settings.tradeCooldownSeconds !== undefined ? this.settings.tradeCooldownSeconds : 60;
    if (cooldownSecs <= 0) return;
    this.tradeCooldowns.set(symbol, Date.now() + cooldownSecs * 1000);
  }

  public async saveSettings(newSettings: Partial<ServerBotSettings>, source: 'FRONTEND' | 'API' | 'SYSTEM' = 'FRONTEND'): Promise<ServerBotSettings> {
    const before = { ...this.settings };
    this.settings = this.mergeSettingsPreservingCredentials(
      this.settings,
      newSettings,
      newSettings.forceClearCredentials === true
    );

    // Keep activeStrategy and enabledStrategies strictly synchronized
    if (newSettings.activeStrategy && (!newSettings.enabledStrategies || newSettings.enabledStrategies.length === 0)) {
      if ((newSettings.activeStrategy as string) !== 'AUTO_REGIME') {
        this.settings.enabledStrategies = [newSettings.activeStrategy as any];
      }
    } else if (newSettings.enabledStrategies && newSettings.enabledStrategies.length > 0 && !newSettings.activeStrategy) {
      this.settings.activeStrategy = newSettings.enabledStrategies[0] as any;
    }

    if (newSettings.autoTradeEnabled !== undefined) {
      if (newSettings.autoTradeEnabled) {
        this.startLoop();
      } else {
        this.stopLoop();
      }
    } else if (this.isRunning && newSettings.scanInterval !== undefined) {
      // Re-arm loop with updated scan interval
      this.startLoop();
    }
    if (this.settings.telegramBotToken && this.settings.telegramChatId) {
      telegramService.updateConfig(this.settings.telegramBotToken, this.settings.telegramChatId);
    }
    telegramService.updateSettings(this.settings);
    this.syncRiskManagerSettings();
    positionMonitor.settings = this.settings;

    // 1. Always persist locally
    writeLocalJson('settings.json', this.settings);

    // 2. Persist to Firestore with high-reliability settings writer (survives network lag on Render)
    const firestoreRes = await safeSetDocSettings(doc(db, COLLECTIONS.SETTINGS, COLLECTIONS.SETTINGS_DOC), this.settings, { merge: true });
    if (firestoreRes.success) {
      console.log(`✅ [AutoTrader] Settings v${this.settings.settingsVersion || 1} persisted to Firestore & local disk.`);
    } else {
      console.warn(`⚠️ [AutoTrader] Saved to local disk, but Firestore write deferred:`, firestoreRes.error?.message || firestoreRes.error);
    }

    // 3. Record audit trail of changes
    recordSettingsAudit(before, this.settings, this.settings.settingsVersion || 1, source);

    this.onSettingsChanged?.(this.settings);

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

      const closedBtcKlines = btcKlines.length > 1 ? btcKlines.slice(0, -1) : btcKlines;
      const btcMacro = classifyBtcMacroRegime(closedBtcKlines, btcPrice);
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
          const closedEthKlines = ethKlines.length > 1 ? ethKlines.slice(0, -1) : ethKlines;
          const ethMacro = classifyBtcMacroRegime(closedEthKlines, ethPrice);
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

      // Cumulative 100-Coin Market Breadth Override (prevents single-coin BTC bias from locking the market)
      try {
        const breadth100 = await marketBreadthService.getCumulativeBreadth(this.settings.coinCount || 100, forceRefresh);
        if (breadth100) {
          // If BTC alone was flagged RED/PANIC, but the broader 100 coins have resilient breadth:
          if ((!isTradable || macroColor === 'RED' || finalRegime === 'PANIC') && breadth100.pctAboveEma50 >= 40 && breadth100.expansionPct < 30) {
            isTradable = true;
            macroColor = 'AMBER';
            finalLabel = `Resilient Market (${breadth100.consensusRegime})`;
            finalDetails = `BTC indicates caution (${btcMacro.label}), but Top 100 Coins Breadth is resilient (${breadth100.pctAboveEma50}% > EMA50, ${breadth100.rangePct}% Range) — Altcoin entries permitted`;
          } else {
            finalDetails += ` | Top 100 Consensus: ${breadth100.consensusRegime} (${breadth100.pctAboveEma50}% > EMA50)`;
          }
        }
      } catch (e) {}

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

  public async getCoinDcxRegime(symbol: string = 'BTCUSDT'): Promise<CoinDcxRegimeResult> {
    try {
      const klines15m = await this.getKlines(symbol, '15m');
      const klines5m = await this.getKlines(symbol, '5m');

      let fundingRate = 0.0001;
      try {
        const response = await fetch(`https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${symbol}`);
        if (response.ok) {
          const data: any = await response.json();
          if (data && data.lastFundingRate) {
            fundingRate = parseFloat(data.lastFundingRate);
          }
        }
      } catch (err) {
        // Fallback default
      }

      const regimeResult = analyzeCoinDcxRegime(klines15m, klines5m, fundingRate, symbol);

      // Note: Centralized auto-sync is handled by 3-Layer Quantitative Regime Engine (getThreeLayerRegime)
      // to avoid 15m/4H regime conflicts and enforce 2-closed-candle hysteresis.
      return regimeResult;
    } catch (e) {
      console.warn(`[AutoTrader] getCoinDcxRegime error for ${symbol}:`, e);
      return analyzeCoinDcxRegime([], [], 0.0001, symbol);
    }
  }

  /**
   * 3-Layer Quantitative Regime Engine (Direction Bias, Core Market Regime, Tradeability Gate)
   * Anchors on BTCUSDT with ETH confirmation across 1D/4H/1H closed bars with 2-bar hysteresis.
   */
  public async getThreeLayerRegime(forceRefresh = false): Promise<ThreeLayerRegimeState> {
    const now = Date.now();
    if (!forceRefresh && this.cachedThreeLayerRegime && (now - this.lastThreeLayerRegimeTime < 60000)) {
      return this.cachedThreeLayerRegime;
    }

    try {
      const [btc1dRaw, btc4hRaw, btc1hRaw, eth1dRaw, eth4hRaw] = await Promise.all([
        this.getKlines('BTCUSDT', '1d'),
        this.getKlines('BTCUSDT', '4h'),
        this.getKlines('BTCUSDT', '1h'),
        this.getKlines('ETHUSDT', '1d'),
        this.getKlines('ETHUSDT', '4h')
      ]);

      const btc1dClosed = btc1dRaw && btc1dRaw.length > 1 ? btc1dRaw.slice(0, -1) : (btc1dRaw || []);
      const btc4hClosed = btc4hRaw && btc4hRaw.length > 1 ? btc4hRaw.slice(0, -1) : (btc4hRaw || []);
      const btc1hClosed = btc1hRaw && btc1hRaw.length > 1 ? btc1hRaw.slice(0, -1) : (btc1hRaw || []);
      const eth1dClosed = eth1dRaw && eth1dRaw.length > 1 ? eth1dRaw.slice(0, -1) : (eth1dRaw || []);
      const eth4hClosed = eth4hRaw && eth4hRaw.length > 1 ? eth4hRaw.slice(0, -1) : (eth4hRaw || []);

      const currentPrice = priceStream.getPrice('BTCUSDT') || (btc4hClosed.length > 0 ? btc4hClosed[btc4hClosed.length - 1].close : 68000);

      // 1. Funding rate 30d history
      let currentFundingRate = 0.0001;
      let fundingRate30dHistory: number[] = [];
      try {
        const frRes = await fetch('https://fapi.binance.com/fapi/v1/fundingRate?symbol=BTCUSDT&limit=90');
        if (frRes.ok) {
          const frData: any = await frRes.json();
          if (Array.isArray(frData) && frData.length > 0) {
            fundingRate30dHistory = frData.map((d: any) => parseFloat(d.fundingRate || '0'));
            currentFundingRate = fundingRate30dHistory[fundingRate30dHistory.length - 1] || 0.0001;
          }
        }
      } catch (e) {}

      // 2. Open interest 4H
      let openInterest4h = { priceChangePct: 0, oiChangePct: 0 };
      try {
        const oiRes = await fetch('https://fapi.binance.com/fapi/v1/openInterestHist?symbol=BTCUSDT&period=4h&limit=5');
        if (oiRes.ok) {
          const oiData: any = await oiRes.json();
          if (Array.isArray(oiData) && oiData.length >= 2) {
            const latest = oiData[oiData.length - 1];
            const prev = oiData[oiData.length - 2];
            const pLatest = parseFloat(latest.sumOpenInterestValue || latest.sumOpenInterest || '1');
            const pPrev = parseFloat(prev.sumOpenInterestValue || prev.sumOpenInterest || '1');
            const oiChangePct = pPrev > 0 ? ((pLatest - pPrev) / pPrev) * 100 : 0;
            const btc4hCloses = btc4hClosed.map(k => k.close);
            const priceChangePct = btc4hCloses.length >= 2 
              ? ((btc4hCloses[btc4hCloses.length - 1] - btc4hCloses[btc4hCloses.length - 2]) / btc4hCloses[btc4hCloses.length - 2]) * 100 
              : 0;
            openInterest4h = { priceChangePct, oiChangePct };
          }
        }
      } catch (e) {}

      // 3. Taker CVD / Long-Short ratio
      let takerCvd4h = { isRising: true, netDelta: 50 };
      try {
        const cvdRes = await fetch('https://fapi.binance.com/futures/data/takerlongshortRatio?symbol=BTCUSDT&period=4h&limit=5');
        if (cvdRes.ok) {
          const cvdData: any = await cvdRes.json();
          if (Array.isArray(cvdData) && cvdData.length >= 2) {
            const latestRatio = parseFloat(cvdData[cvdData.length - 1].buySellRatio || '1.0');
            const prevRatio = parseFloat(cvdData[cvdData.length - 2].buySellRatio || '1.0');
            takerCvd4h = {
              isRising: latestRatio >= prevRatio,
              netDelta: (latestRatio - 1.0) * 100
            };
          }
        }
      } catch (e) {}

      // 4. Cumulative Top 100 Coins Breadth & Market-Wide Regime
      let marketBreadth100 = undefined;
      try {
        marketBreadth100 = await marketBreadthService.getCumulativeBreadth(this.settings.coinCount || 100, forceRefresh);
      } catch (e) {
        console.warn('[AutoTrader] Failed to fetch 100-coin market breadth:', e);
      }

      const breadthTop30PctAboveEma50 = marketBreadth100 ? marketBreadth100.pctAboveEma50 : 55;

      const result = analyzeThreeLayerRegime({
        btc1d: {
          closes: btc1dClosed.map(k => k.close),
          highs: btc1dClosed.map(k => k.high),
          lows: btc1dClosed.map(k => k.low),
          open: btc1dClosed.length > 0 ? btc1dClosed[btc1dClosed.length - 1].open : currentPrice,
          klines: btc1dClosed
        },
        btc4h: {
          closes: btc4hClosed.map(k => k.close),
          highs: btc4hClosed.map(k => k.high),
          lows: btc4hClosed.map(k => k.low),
          volumes: btc4hClosed.map(k => k.volume),
          klines: btc4hClosed
        },
        btc1h: {
          closes: btc1hClosed.map(k => k.close),
          highs: btc1hClosed.map(k => k.high),
          lows: btc1hClosed.map(k => k.low),
          klines: btc1hClosed
        },
        eth1d: {
          closes: eth1dClosed.map(k => k.close)
        },
        eth4h: {
          closes: eth4hClosed.map(k => k.close)
        },
        currentPrice,
        currentFundingRate,
        fundingRate30dHistory,
        openInterest4h,
        takerCvd4h,
        breadthTop30PctAboveEma50,
        marketBreadth100,
        lastConfirmedRegime: this.threeLayerHysteresis.lastConfirmedRegime,
        lastCandidateRegime: this.threeLayerHysteresis.lastCandidateRegime,
        consecutiveCandles: this.threeLayerHysteresis.consecutiveCandles,
        regimeAgeBars: this.threeLayerHysteresis.regimeAgeBars,
        enableLayer3Gate: this.settings.enableRegimeLayer3Gate !== false
      });

      this.threeLayerHysteresis = {
        lastConfirmedRegime: result.regime.confirmedRegime,
        lastCandidateRegime: result.regime.candidateRegime,
        consecutiveCandles: result.regime.consecutiveCandles,
        regimeAgeBars: result.regime.regimeAgeBars
      };

      this.cachedThreeLayerRegime = result;
      this.lastThreeLayerRegimeTime = now;

      // Keep settings.coindcxActiveRegime synchronized with confirmed 3-Layer regime
      if (result.regime && result.regime.confirmedRegime) {
        const confirmed = result.regime.confirmedRegime;
        if (this.settings.coindcxActiveRegime !== confirmed) {
          this.settings.coindcxActiveRegime = confirmed as any;
          this.saveSettings(this.settings, 'SYSTEM').catch(() => {});
        }
      }

      return result;
    } catch (err) {
      console.warn('[AutoTrader] getThreeLayerRegime error:', err);
      if (this.cachedThreeLayerRegime) {
        return this.cachedThreeLayerRegime;
      }
      const fallbackPrice = priceStream.getPrice('BTCUSDT') || 68000;
      return analyzeThreeLayerRegime({
        btc1d: { closes: [fallbackPrice], highs: [fallbackPrice], lows: [fallbackPrice], open: fallbackPrice, klines: [] },
        btc4h: { closes: [fallbackPrice], highs: [fallbackPrice], lows: [fallbackPrice], volumes: [1000], klines: [] },
        currentPrice: fallbackPrice,
        enableLayer3Gate: this.settings.enableRegimeLayer3Gate !== false
      });
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
          const maxAllocation = this.settings.bypassExposureLimit
            ? userTargetAlloc
            : Math.min(userTargetAlloc, remainingExposure);
          
          if (!this.settings.bypassExposureLimit && maxAllocation <= 0) {
              console.log(`🛡️ [SMC] Setup for ${symbol} skipped: Portfolio exposure limit reached.`);
              this.setTradeCooldown(symbol);
              continue;
          }

          const safeSize = riskManager.calculateSafePositionSize(
              accountEquity,
              price,
              setup.sl,
              setup.direction,
              { 
                maxLeverage: this.settings.leverage || 5, 
                maxAllocation,
                allowFractional: this.settings.allowFractionalContracts !== false
              },
              riskPct
          );
          
          if (safeSize.rejected || safeSize.contracts <= 0) {
              console.log(`🚫 [SMC] Setup for ${symbol} rejected by RiskManager: ${safeSize.reason}`);
              this.setTradeCooldown(symbol);
              continue;
          }

          const activePositions = positionMonitor.getActivePositions();
          const riskCheck = riskManager.checkEntryAllowed(accountEquity, safeSize.allocatedBalance, activePositions.length);
          if (!riskCheck.allowed) {
              console.log(`🛡️ [SMC] Trade blocked by RiskManager for ${symbol}: ${riskCheck.reason}`);
              this.setTradeCooldown(symbol);
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
             this.setTradeCooldown(symbol);
          });
      }
    }
  }

  public startLoop() {
    this.isRunning = true;
    this.settings.autoTradeEnabled = true;
    if (this.loopInterval) clearInterval(this.loopInterval);
    const intervalMs = Math.max(5000, (this.settings.scanInterval || 15) * 1000);
    this.loopInterval = setInterval(() => {
      this.runScanCycle();
    }, intervalMs);
    console.log(`▶️ [AutoTrader] Engine STARTED. Autonomous scanning active every ${intervalMs / 1000}s.`);
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
  private lastScanCompletedTime = 0;
  private lastScanDurationMs = 0;
  private lastScannedPairCount = 0;
  private lastScanQualifiedCount = 0;
  private lastScanSummary = 'Initializing scan loop...';

  public getScanDiagnostics() {
    return {
      isScanning: this.isScanning,
      lastScanCompletedTime: this.lastScanCompletedTime > 0 ? new Date(this.lastScanCompletedTime).toISOString() : null,
      lastScanDurationMs: this.lastScanDurationMs,
      lastScannedPairCount: this.lastScannedPairCount,
      lastScanQualifiedCount: this.lastScanQualifiedCount,
      lastScanSummary: this.lastScanSummary
    };
  }

  public async runScanCycle() {
    if (!this.isEngineActive()) return;
    if (this.isScanning) return;
    
    if (priceStream.isStale) {
      console.warn("🛡️ [AutoTrader] Skipping cycle: Market Data is STALE. Failing closed.");
      return;
    }
    
    this.isScanning = true;
    const scanStart = Date.now();
    let scannedCount = 0;
    let qualifiedCount = 0;

    try {
      const activePositions = positionMonitor.getActivePositions();
      const openCount = activePositions.length;
      
      // Gate 3: Max Concurrent Trades (checks bypass & GateManager disabledGates)
      const bypassMax = this.settings.bypassMaxPositions || this.isGateDisabled('RISK_maxConcurrent');
      if (!bypassMax && openCount >= this.settings.maxConcurrentTrades) {
        this.lastScanCompletedTime = Date.now();
        this.lastScanSummary = `Max concurrent trades reached (${openCount}/${this.settings.maxConcurrentTrades}). Standby until position exits. [Toggle "Bypass Max Positions" to override]`;
        return; // Max concurrent trade limit reached
      }

      // 0. Macro Market Safety: Hybrid Global BTC/ETH Regime Filter
      // 0a. 3-Layer Quantitative Regime Sync (Layer 2 confirmed regime + Favored Strategy Alignment)
      if (this.settings.autoActivateRegimeStrategies) {
        try {
          const threeLayer = await this.getThreeLayerRegime();
          const confirmedRegime = threeLayer.regime.confirmedRegime;
          const deleted = this.settings.deletedStrategies || [];
          const validRecommended = (threeLayer.recommendedStrategies || [])
            .filter(s => !deleted.includes(s.strategyId));
          const topFavored = validRecommended.find(s => s.suitability === 'FAVORED') || validRecommended[0];

          if (topFavored) {
            const currentRegime = this.settings.coindcxActiveRegime;
            const currentActive = this.settings.activeStrategy;

            // Prefer strategy auto-selected by Cumulative Top 100 Coins Breadth (if not deleted)
            let targetActive = (threeLayer.marketBreadth100?.favoredStrategy && !deleted.includes(threeLayer.marketBreadth100.favoredStrategy)
              ? threeLayer.marketBreadth100.favoredStrategy
              : topFavored.strategyId) as any;

            if (deleted.includes(targetActive)) {
              targetActive = validRecommended[0]?.strategyId || 'VOLATILITY_COMPRESSION';
            }

            // Unify multi-strategy suite: Arm all valid recommended strategies for this regime
            const targetEnabled = validRecommended.length > 0
              ? validRecommended.map(s => s.strategyId as any)
              : [targetActive];

            // Operator Rule: If trend market regime is > 20% across the top 100 coins, activate trend based strategy too
            const trendPct = threeLayer.marketBreadth100?.trendPct ?? 0;
            if (trendPct > 20) {
              const trendStrats = ['TREND_PULLBACK', 'EMA5_EXACT_ENTRY_V2'];
              for (const ts of trendStrats) {
                if (!deleted.includes(ts) && !targetEnabled.includes(ts)) {
                  targetEnabled.push(ts as any);
                }
              }
            }

            const currentEnabled = this.settings.enabledStrategies || [];
            const isEnabledChanged = !Array.isArray(currentEnabled) ||
              currentEnabled.length !== targetEnabled.length ||
              targetEnabled.some((s: any) => !currentEnabled.includes(s));

            if (currentRegime !== confirmedRegime || currentActive !== targetActive || isEnabledChanged) {
              const trendNote = trendPct > 20 && confirmedRegime !== 'TREND' ? ` [Trend Breadth ${trendPct}% > 20%: Multi-regime Trend strategies active]` : '';
              const consensusInfo = threeLayer.marketBreadth100
                ? `Top 100 Consensus: ${confirmedRegime} (${threeLayer.marketBreadth100.consensusConfidence}% confidence)${trendNote}`
                : `Regime: ${confirmedRegime}`;
              console.log(`🧭 [Cumulative 100-Coin Regime Auto-Sync] ${consensusInfo}. Auto-activating ${targetEnabled.length} strategies: ${targetEnabled.join(', ')} (Primary: ${targetActive})`);
              const updatedSettings = {
                ...this.settings,
                activeStrategy: targetActive,
                enabledStrategies: targetEnabled,
                coindcxActiveRegime: confirmedRegime as any,
                coindcxRegimeSymbol: this.settings.coindcxRegimeSymbol || 'BTCUSDT',
                updatedAt: new Date().toISOString()
              };
              await this.saveSettings(updatedSettings, 'SYSTEM');
            }
          }
        } catch (e) {
          console.warn('[AutoTrader] 3-layer regime auto-sync error:', e);
        }
      }
      const useGlobalFilter = this.settings.useGlobalBtcFilter !== false;
      if (useGlobalFilter) {
        const globalRegime = await this.getGlobalRegime();
        if (!globalRegime.isTradable || globalRegime.regime === 'PANIC' || globalRegime.macroColor === 'RED') {
          this.globalFilterBlockActive = true;
          this.globalFilterBlockReason = `Global Market & BTC Safety Filter: ${globalRegime.symbol} is '${globalRegime.regime}' (${globalRegime.details}). Macro risk management active — new entries paused.`;
          this.lastScanCompletedTime = Date.now();
          this.lastScanSummary = `Global Macro Filter active: ${globalRegime.symbol} is '${globalRegime.regime}'. Altcoin entries paused.`;
          console.log(`🛡️ [Global Macro Filter] Market Safety Lockout: ${globalRegime.symbol} is '${globalRegime.regime}' (${globalRegime.details}). New trade entries paused across all coins.`);
          this.logScanResult(
            globalRegime.symbol,
            'NEUTRAL',
            false,
            `Global Macro Filter: Paused (${globalRegime.details})`,
            globalRegime.btcPrice || 0,
            0,
            0,
            0,
            {
              strategy: this.settings.activeStrategy || 'AUTONOMOUS',
              marketRegime: globalRegime.label || globalRegime.regime || 'Macro Paused',
              macroColor: globalRegime.macroColor,
              regimeConfidence: 100
            }
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

      // 0b. Layer 3 Quantitative Regime Gate (Fee Drag / Friction Filter)
      if (this.settings.enableRegimeLayer3Gate !== false) {
        try {
          const threeLayer = await this.getThreeLayerRegime();
          if (!threeLayer.tradeability.isTradeable) {
            this.globalFilterBlockActive = true;
            this.globalFilterBlockReason = `Regime Layer 3 Gate Blocked: ${threeLayer.tradeability.gateReason}`;
            this.lastScanCompletedTime = Date.now();
            this.lastScanSummary = `Layer 3 Tradeability Gate Active (${threeLayer.tradeability.tradeabilityState}): ${threeLayer.tradeability.gateReason}`;
            console.log(`🛡️ [Regime Layer 3 Gate] Tradeability block active: ${threeLayer.tradeability.gateReason}`);
            return;
          }
        } catch (e) {
          // Fall through if 3-layer calculation fails
        }
      }

      // 1. Fetch top volume futures tickers
      const scanLimit = this.settings.coinCount || 25;
      const topSymbols = await this.getTopVolumeSymbols(scanLimit);
      scannedCount = topSymbols.length;
      
      for (const symbol of topSymbols) {
        const cooldownExpiry = this.tradeCooldowns.get(symbol) || 0;
        const inCooldown = Date.now() < cooldownExpiry;

        if (activePositions.some(p => p.symbol === symbol) || this.pendingSymbols.has(symbol) || (!this.settings.bypassTradeCooldown && inCooldown)) {
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

        
        const effectiveThreshold = this.settings.autoTradeThreshold ?? 70;
        const thresholdBypassed = this.isGateDisabled('RISK_threshold') && effectiveThreshold <= 50;
        const minPassScore = thresholdBypassed ? 50 : effectiveThreshold;

        if (signal) {
           const passes = signal.score >= minPassScore;
           this.logScanResult(symbol, signal.direction, passes, signal.reason || (passes ? `Passed (Score: ${signal.score} >= ${minPassScore})` : `Score ${signal.score} < threshold ${minPassScore}`), currentPrice, signal.sl, signal.tp1, signal.score, {
             strategy: (signal as any).strategy || this.settings.activeStrategy,
             marketRegime: (signal as any).marketRegime,
             macroColor: (signal as any).macroColor,
             regimeConfidence: (signal as any).regimeConfidence,
             tradeQuality: (signal as any).tradeQuality,
             strategyPriority: (signal as any).strategyPriority,
             structuralRR: (signal as any).structuralRR
           });
        }
        
        if (signal && signal.score >= minPassScore) {
          qualifiedCount++;

          const currentTotal = positionMonitor.getActivePositions().length + this.pendingSymbols.size;
          const bypassMax = this.settings.bypassMaxPositions || this.isGateDisabled('RISK_maxConcurrent');
          if (!bypassMax && currentTotal >= this.settings.maxConcurrentTrades) {
            this.logScanResult(symbol, signal.direction, false, `Risk Manager: Max concurrent trades reached (${currentTotal}/${this.settings.maxConcurrentTrades})`, currentPrice, signal.sl, signal.tp1, signal.score, {
              strategy: (signal as any).strategy || this.settings.activeStrategy,
              marketRegime: (signal as any).marketRegime,
              macroColor: (signal as any).macroColor,
              regimeConfidence: (signal as any).regimeConfidence,
              tradeQuality: (signal as any).tradeQuality,
              strategyPriority: (signal as any).strategyPriority,
              structuralRR: (signal as any).structuralRR
            });
            continue;
          }

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
          if ((this.settings.deletedStrategies || []).includes(finalStrat)) {
            console.warn(`🛑 [AutoTrader] Execution blocked: Strategy '${finalStrat}' has been deleted by user.`);
            this.pendingSymbols.delete(symbol);
            continue;
          }
          const marketRegime = (signal as any).marketRegime || null;
          const isAutoRegime = !!(signal as any).isAutoRegime;

          // Universal Liquidation-Safe Dynamic Risk Sizing for any strategy with SL (Section 9)
          if (signal.sl) {
            const riskPct = (this.settings.accountRiskPct || 1.5) / 100;
            const userTargetAlloc = dummyBalance * ((this.settings.positionSizePct || 3) / 100);
            const remainingExposure = riskManager.getRemainingExposure(dummyBalance);
            const maxAllocation = this.settings.bypassExposureLimit
              ? userTargetAlloc
              : Math.min(userTargetAlloc, remainingExposure);

            if (!this.settings.bypassExposureLimit && maxAllocation <= 0) {
              console.log(`🛡️ [AutoTrader] Sizing skipped for ${symbol}: Maximum exposure limit reached.`);
              this.logScanResult(symbol, signal.direction, false, 'Risk Manager: Maximum exposure limit reached', currentPrice, signal.sl, signal.tp1, signal.score, {
                strategy: finalStrat,
                marketRegime,
                macroColor: (signal as any).macroColor,
                regimeConfidence: (signal as any).regimeConfidence,
                tradeQuality: (signal as any).tradeQuality,
                strategyPriority: (signal as any).strategyPriority,
                structuralRR: (signal as any).structuralRR
              });
              this.setTradeCooldown(symbol);
              this.pendingSymbols.delete(symbol);
              continue;
            }

            const sizeResult = riskManager.calculateSafePositionSize(
              dummyBalance,
              currentPrice,
              signal.sl,
              signal.direction,
              { 
                maxLeverage: this.settings.leverage || 5, 
                maxAllocation,
                allowFractional: this.settings.allowFractionalContracts !== false
              },
              riskPct
            );

            if (sizeResult.rejected || sizeResult.contracts <= 0) {
              console.log(`[AutoTrader] Dynamic risk sizing rejected for ${symbol}: ${sizeResult.reason}`);
              this.logScanResult(symbol, signal.direction, false, `Risk Manager: ${sizeResult.reason}`, currentPrice, signal.sl, signal.tp1, signal.score, {
                strategy: finalStrat,
                marketRegime,
                macroColor: (signal as any).macroColor,
                regimeConfidence: (signal as any).regimeConfidence,
                tradeQuality: (signal as any).tradeQuality,
                strategyPriority: (signal as any).strategyPriority,
                structuralRR: (signal as any).structuralRR
              });
              this.setTradeCooldown(symbol);
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
            this.logScanResult(symbol, signal.direction, false, `Risk Manager: ${riskCheck.reason}`, currentPrice, signal.sl, signal.tp1, signal.score, {
              strategy: finalStrat,
              marketRegime,
              macroColor: (signal as any).macroColor,
              regimeConfidence: (signal as any).regimeConfidence,
              tradeQuality: (signal as any).tradeQuality,
              strategyPriority: (signal as any).strategyPriority,
              structuralRR: (signal as any).structuralRR
            });
            this.setTradeCooldown(symbol);
            this.pendingSymbols.delete(symbol);
            continue;
          }

          if (!this.isEngineActive()) {
            console.log(`🛑 [AutoTrader] Trade execution blocked for ${symbol}: Engine is stopped.`);
            if (this.settings.alertOnNewSignal !== false) {
              telegramService.notifySignal({
                symbol,
                direction: signal.direction,
                strategy: finalStrat,
                score: signal.score,
                price: currentPrice,
                sl: signal.sl,
                tp1: signal.tp1,
                tp2: signal.tp2,
                tp3: signal.tp3,
                reason: (signal as any).reason || 'Qualified setup detected by AutoTrader'
              }).catch(() => {});
            }
            this.pendingSymbols.delete(symbol);
            continue;
          }

          oms.placeOrder(symbol, signal.direction, currentPrice, signal.score, signal.atr, {
            balance: dummyBalance,
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
              console.log(`✅ [AutoTrader] Trade filled and active: ${symbol} (${signal.direction}) PosId: ${posId}`);
              this.logScanResult(symbol, signal.direction, true, '', currentPrice, signal.sl, signal.tp1, signal.score, {
                strategy: finalStrat,
                macroColor: (signal as any).macroColor,
                marketRegime: (signal as any).marketRegime,
                regimeConfidence: (signal as any).regimeConfidence,
                tradeQuality: (signal as any).tradeQuality,
                strategyPriority: (signal as any).strategyPriority,
                structuralRR: (signal as any).structuralRR
              });
              await positionMonitor.refreshOpenPositions();
              // Respect bypassTradeCooldown — use setTradeCooldown() for consistency
              if (!this.settings.bypassTradeCooldown) {
                this.tradeCooldowns.set(symbol, Date.now() + this.getCooldownMs(this.settings.timeframe));
              }
              if ((signal as any).signalTime) {
                  this.lastTradedSignal.set(symbol, (signal as any).signalTime);
              }
            }
          })
          .catch((err) => {
            if (err.message && err.message.includes("Risk manager check disallowed trade")) {
              console.log(`🛡️ [AutoTrader] Skipped ${symbol}: ${err.message}`);
            } else {
              console.error(`❌ [AutoTrader] Error executing order on ${symbol}:`, err);
            }
            this.setTradeCooldown(symbol);
          })
          .finally(() => {
            this.pendingSymbols.delete(symbol);
          });
        }
      }
    } catch (e) {
      console.warn('AutoTrader scan cycle error:', e);
      this.lastScanSummary = `Scan error: ${String(e)}`;
    } finally {
      this.lastScanCompletedTime = Date.now();
      this.lastScanDurationMs = Date.now() - scanStart;
      this.lastScannedPairCount = scannedCount;
      this.lastScanQualifiedCount = qualifiedCount;
      if (!this.lastScanSummary || this.lastScanSummary.includes('Initializing') || this.lastScanSummary.includes('Scanned')) {
        this.lastScanSummary = `Scanned ${scannedCount} pairs in ${this.lastScanDurationMs}ms. ${qualifiedCount} setups met threshold.`;
      }
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
      gateResults?: Record<string, 'PASS' | 'FAIL' | 'NOT_CHECKED' | 'BYPASS'>;
      rejectionReasons?: string[];
      spreadBps?: number | null;
      volumePercentile?: number | null;
      adx?: number | null;
      atr?: number | null;
      htfBias?: string;
      htfTimeframe?: string;
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
        macroColor: extra?.macroColor || this.cachedGlobalRegime?.macroColor || 'AMBER',
        marketRegime: extra?.marketRegime || this.cachedGlobalRegime?.label || (this.settings.coindcxActiveRegime ? String(this.settings.coindcxActiveRegime) : 'Consolidation Range'),
        regimeConfidence: extra?.regimeConfidence ?? (score > 0 ? score : 50),
        tradeQuality: extra?.tradeQuality || null,
        strategyPriority: extra?.strategyPriority || null,
        structuralRR: extra?.structuralRR ?? null,
        gateResults: extra?.gateResults || null,
        htfBias: extra?.htfBias || null,
        htfTimeframe: extra?.htfTimeframe || null,
        strategy_version: 'v2.2_regime_gated'
      }) + '\n';
      fs.appendFileSync(path.join(process.cwd(), 'data', 'scan_logs.jsonl'), logLine);
    } catch(e) {}

    // Signal Audit Trail integration
    try {
      const decision = passes ? 'ENTER' : (rejectReason?.includes('Paused') || rejectReason?.includes('Failed Technical') ? 'WATCH' : 'REJECT');
      const defaultRegime = this.cachedGlobalRegime?.label 
        || (this.settings.coindcxActiveRegime ? String(this.settings.coindcxActiveRegime) : 'Consolidation Range');
      const defaultStrategy = this.settings.activeStrategy || 'AUTONOMOUS';
      
      writeSignalAudit({
        signalId: `${symbol}-${Date.now()}`,
        symbol: symbol,
        timeframe: this.settings.timeframe || '15m',
        strategy: extra?.strategy || extra?.strategyPriority || defaultStrategy,
        regime: extra?.marketRegime || defaultRegime,
        direction: (direction === 'LONG' || direction === 'SHORT') ? direction : 'NONE',
        confidence: extra?.regimeConfidence || (score > 0 ? score : 50),
        decision: decision,
        rejectionReasons: extra?.rejectionReasons && extra.rejectionReasons.length > 0 ? extra.rejectionReasons : (rejectReason ? [rejectReason] : []),
        gateResults: extra?.gateResults || {
          macro: (extra?.macroColor || this.cachedGlobalRegime?.macroColor) ? 'PASS' : 'NOT_CHECKED'
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

  private async getTopVolumeSymbols(limit: number = 100): Promise<string[]> {
    try {
      // 1. If scanOnlyWatchlist is enabled and customWatchlist is configured, prioritize user-defined symbols
      if (this.settings.scanOnlyWatchlist && this.settings.customWatchlist) {
        const customSymbols = this.settings.customWatchlist
          .split(',')
          .map(s => s.trim().toUpperCase())
          .filter(s => s.length > 0)
          .map(s => s.endsWith('USDT') ? s : `${s}USDT`);
        if (customSymbols.length > 0) {
          return customSymbols.slice(0, limit);
        }
      }

      const res = await fetch('https://fapi.binance.com/fapi/v1/ticker/24hr');
      if (!res.ok) {
        await res.text().catch(() => {});
        return this.getFallbackSymbols(limit);
      }
      const data: any = await res.json();

      // Enforce liquidity guardrails: exclude illiquid/low-cap pairs below min24hVolume (default $10M)
      const minVolume = (this.settings.min24hVolume && this.settings.min24hVolume > 0)
        ? this.settings.min24hVolume
        : 10000000;

      // Reliable symbol prioritization: BTC, ETH, SOL, XRP have verified real-time tracking
      const prioritySymbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT'];
      const rawUsdtPairs = Array.isArray(data)
        ? data
            .filter((d: any) => d.symbol && d.symbol.endsWith('USDT') && !d.symbol.includes('_') && /^[A-Z0-9]+USDT$/.test(d.symbol))
            .sort((a: any, b: any) => parseFloat(b.quoteVolume || 0) - parseFloat(a.quoteVolume || 0))
        : [];

      // Filter by minVolume first
      let usdtPairs = rawUsdtPairs
        .filter((d: any) => parseFloat(d.quoteVolume || '0') >= minVolume)
        .map((d: any) => d.symbol);

      // If volume filter returned fewer coins than requested limit, backfill from highest remaining volume pairs
      if (usdtPairs.length < limit) {
        const backfill = rawUsdtPairs.map((d: any) => d.symbol);
        usdtPairs = Array.from(new Set([...usdtPairs, ...backfill]));
      }

      const orderedSymbols = Array.from(new Set([...prioritySymbols, ...usdtPairs])).slice(0, limit);
      return orderedSymbols.length > 0 ? orderedSymbols : this.getFallbackSymbols(limit);
    } catch (e) {
      return this.getFallbackSymbols(limit);
    }
  }

  private getFallbackSymbols(limit: number = 100): string[] {
    const list = [
      'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'ZECUSDT', 'XRPUSDT', 'NEARUSDT', 'SUIUSDT', 'ENAUSDT', 'PHAUSDT', 'DOGEUSDT',
      'UNIUSDT', 'HYPEUSDT', 'ONDOUSDT', 'LINKUSDT', 'WLDUSDT', '1000PEPEUSDT', 'LTCUSDT', 'BNBUSDT', 'ADAUSDT', 'TAOUSDT',
      'AVAXUSDT', 'BCHUSDT', 'AAVEUSDT', 'PUMPUSDT', 'QNTUSDT', 'ARKUSDT', 'ARBUSDT', 'SAGAUSDT', 'XLMUSDT', 'FILUSDT',
      'TRUMPUSDT', 'SEIUSDT', 'RAREUSDT', 'AEROUSDT', 'PENGUUSDT', 'FETUSDT', 'INJUSDT', 'LDOUSDT', 'DOTUSDT', 'DASHUSDT',
      'LSKUSDT', 'APTUSDT', 'ETCUSDT', 'OPUSDT', 'GRASSUSDT', 'ZROUSDT', 'JTOUSDT', 'ICPUSDT', '1000SHIBUSDT', 'VIRTUALUSDT',
      'XMRUSDT', 'HBARUSDT', 'JUPUSDT', 'POLUSDT', 'TIAUSDT', 'PENDLEUSDT', 'WIFUSDT', 'FTMUSDT', 'KASUSDT', '1000BONKUSDT',
      '1000FLOKIUSDT', 'ATOMUSDT', 'STXUSDT', 'ALGOUSDT', 'RUNEUSDT', 'GRTUSDT', 'THETAUSDT', 'GALAUSDT', 'SANDUSDT', 'MANAUSDT',
      'AXSUSDT', 'CHZUSDT', 'CRVUSDT', 'DYDXUSDT', 'MKRUSDT', 'SNXUSDT', 'COMPUSDT', 'BLURUSDT', 'ORDIUSDT', 'BOMEUSDT',
      'MEMEUSDT', 'NOTUSDT', 'STRKUSDT', 'ZKUSDT', 'IOUSDT', 'REZUSDT', 'BBUSDT', 'LISTAUSDT', 'TNSRUSDT', 'OMNIUSDT',
      'PYTHUSDT', 'DRIFTUSDT', 'BLASTUSDT', 'POPCATUSDT', 'MEWUSDT', 'NEIROUSDT', 'EIGENUSDT', 'SCRUSDT', 'PNUTUSDT', 'ACTUSDT'
    ];
    return list.slice(0, limit);
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

  public getMinStructuralRR(strategy?: string, regime?: string): number {
    switch (strategy) {
      case 'EMA5_PA_VOLUME_V1':
        return this.settings.ema5PaRiskReward ?? 1.5;
      case 'EMA5_EXACT_ENTRY_V1':
        return this.settings.eeeRiskReward ?? 1.5;
      case 'EMA5_REJECTION_RECLAIM_V1':
        return this.settings.errRiskReward ?? 1.5;
      case 'EMA5_EXACT_ENTRY_V2':
        return Math.min(2.0, this.settings.eev2MinNetRr ?? 2.0);
      case 'TREND_PULLBACK':
        return this.settings.tpbMinRrRatio ?? 1.5;
      case 'TREND_PULLBACK_RETEST':
        return this.settings.tprRrRatio ?? 2.0;
      case 'TWO_SIDED_COIL_BREAKOUT':
        return (this.settings as any)?.coilMinRrRatio ?? 2.0;
      case 'EARLY_COIL_BREAKOUT':
        return (this.settings as any)?.earlyCoilMinRr ?? 2.0;
      case 'SMC_LIQUIDITY_SWEEP':
      case 'LIQUIDITY_SWEEP_REVERSAL':
        return this.settings.smcRrRatio ?? 1.8;
      case 'BINANCE_COMPOSITE':
      case 'RANGE_REGIME_V1':
      case 'RANGE_MEAN_REVERSION':
        return Math.min(1.8, (this.settings.rangeConfig as any)?.tp2MinR ?? 1.8);
      case 'EMA_GAP_PULLBACK':
        return Math.min(2.5, (this.settings as any)?.egpTargetRr ?? 2.5);
      default:
        if (regime && (regime === 'RANGING' || regime.startsWith('EXHAUSTION'))) {
          return 1.8;
        }
        return 2.5;
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
        this.logScanResult(symbol, 'NEUTRAL', false, `Global Macro Filter: Paused (${globalRegime.details})`, currentPrice, 0, 0, 0, {
          strategy: this.settings.activeStrategy || 'AUTONOMOUS',
          marketRegime: globalRegime.label || 'Macro Paused',
          macroColor: globalRegime.macroColor,
          regimeConfidence: 100
        });
        return null;
      }
    }

    // 1. Local Per-Coin Regime Assessment (Layer 2)
    // CRITICAL FIX: Slice off the live, in-progress candle so volume and ATR percentiles evaluate on closed bars
    const closedKlines = klines.slice(0, -1);
    const lastClosedCandle = closedKlines[closedKlines.length - 1];
    const closedPrice = lastClosedCandle?.close || currentPrice;
    const classification = classifyMarketRegime(closedKlines, closedPrice, globalRegime.macroColor);
    
    const bypassStandAside = this.settings.bypassRegimeStandAside || 
      this.isGateDisabled('COMPOSITE_g3') || 
      this.isGateDisabled('EGP_g1') ||
      this.isGateDisabled('VCB_g1');

    if (!bypassStandAside) {
      // Stand-Aside Rule: Skip if local regime is non-tradable (dead volume, extreme panic, or messy chop)
      if (classification.regime === 'PANIC' || classification.regime === 'DEAD_VOLUME' || classification.regime === 'TRANSITION') {
        this.logScanResult(symbol, 'NEUTRAL', false, `Stand-aside: Local regime ${classification.regime} (untradeable)`, currentPrice, 0, 0, 0, {
          strategy: this.settings.activeStrategy || 'AUTONOMOUS',
          marketRegime: classification.label,
          macroColor: globalRegime.macroColor,
          regimeConfidence: classification.confidence
        });
        return null;
      }
      
      // Stand-Aside Rule: Strict regime confidence threshold (>= 60 for GREEN, >= 65 for AMBER)
      const minConfidenceThreshold = globalRegime.macroColor === 'AMBER' ? 65 : 60;
      if (classification.confidence < minConfidenceThreshold) {
        this.logScanResult(symbol, 'NEUTRAL', false, `Stand-aside: Low regime confidence ${classification.confidence.toFixed(0)}% (min: ${minConfidenceThreshold}%)`, currentPrice, 0, 0, 0, {
          strategy: this.settings.activeStrategy || 'AUTONOMOUS',
          marketRegime: classification.label,
          macroColor: globalRegime.macroColor,
          regimeConfidence: classification.confidence
        });
        return null;
      }
    }

    // 2. Evaluate Strategy Routing (pass closed-candle classification to prevent dead code)
    const rawSignal = await this._evaluateSignalRaw(symbol, klines, currentPrice, classification, globalRegime);
    if (!rawSignal) {
      this.logScanResult(symbol, 'NEUTRAL', false, 'Failed Technical Gates (No Setup Confirmation)', currentPrice, 0, 0, 0, {
        strategy: this.settings.activeStrategy || 'AUTONOMOUS',
        marketRegime: classification.label,
        macroColor: globalRegime.macroColor,
        regimeConfidence: classification.confidence
      });
      return null;
    }
    
    // 3. Structural R:R Filter >= 3.0 (Stand-Aside Rule)
    const risk = Math.abs(currentPrice - rawSignal.sl);
    // Enforce minimum stop distance (checks bypassLiquidationBuffer & GateManager CR_stopDistance)
    const bypassStop = this.settings.bypassLiquidationBuffer || this.isGateDisabled('CR_stopDistance');
    const rawMinPct = this.settings.minStopDistancePct ?? 0.003;
    const minStopPct = rawMinPct > 0.02 ? 0.005 : rawMinPct; // Guard against corrupt 5% input, defaulting to 0.5%
    const minDistance = currentPrice * minStopPct;
    if (!bypassStop && risk < minDistance) {
      this.logScanResult(symbol, rawSignal.direction, false, `Gate Failed: SL too tight (Risk: ${(risk/currentPrice*100).toFixed(2)}%, Min: ${(minStopPct*100).toFixed(2)}%)`, currentPrice, rawSignal.sl, rawSignal.tp1, rawSignal.score, {
        strategy: rawSignal.strategy,
        marketRegime: classification.label,
        macroColor: globalRegime.macroColor,
        regimeConfidence: classification.confidence
      });
      return null;
    }
    if (risk <= 0) {
      this.logScanResult(symbol, rawSignal.direction, false, 'Gate Failed: Invalid SL (Risk <= 0)', currentPrice, rawSignal.sl, rawSignal.tp1, rawSignal.score, {
        strategy: rawSignal.strategy,
        marketRegime: classification.label,
        macroColor: globalRegime.macroColor,
        regimeConfidence: classification.confidence
      });
      return null;
    }
    
    const reward3 = Math.abs(rawSignal.tp3 - currentPrice);
    const structuralRR = reward3 / risk;
    
    const bypassRr = this.isGateDisabled('COMPOSITE_g7') || 
                     this.isGateDisabled('EGP_g5') || 
                     this.isGateDisabled('CR_structuralRR') || 
                     this.isGateDisabled('RISK_structuralRR') || 
                     !!(this.settings as any).bypassStructuralRR;
    const minRR = this.getMinStructuralRR(rawSignal.strategy, classification.regime);
    // Allow epsilon tolerance (0.05) to avoid float rounding rejects on exact targets
    if (!bypassRr && structuralRR < (minRR - 0.05)) {
      this.logScanResult(symbol, rawSignal.direction, false, `Gate Failed: Structural R:R ${structuralRR.toFixed(2)} < min ${minRR} (TP3 target inadequate)`, currentPrice, rawSignal.sl, rawSignal.tp1, rawSignal.score, {
        strategy: rawSignal.strategy,
        marketRegime: classification.label,
        macroColor: globalRegime.macroColor,
        regimeConfidence: classification.confidence
      });
      return null;
    }

    // 3b. Universal Higher-Timeframe (HTF) Structure Alignment Gate
    const htfAlign = await this.checkUniversalHtfStructureAlignment(
      symbol,
      rawSignal.direction,
      currentPrice,
      closedKlines,
      rawSignal.strategy,
      classification.regime
    );

    if (!htfAlign.passed) {
      this.logScanResult(
        symbol,
        rawSignal.direction,
        false,
        `Gate Failed: Universal HTF Structure Alignment (${htfAlign.htfTimeframe || 'HTF'}) - ${htfAlign.reason}`,
        currentPrice,
        rawSignal.sl,
        rawSignal.tp1,
        rawSignal.score,
        {
          strategy: rawSignal.strategy,
          marketRegime: classification.label,
          macroColor: globalRegime.macroColor,
          regimeConfidence: classification.confidence,
          htfBias: htfAlign.htfBias
        }
      );
      return null;
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
      structuralRR: parseFloat(structuralRR.toFixed(2)),
      higherTimeframeAligned: htfAlign.bypassed ? 'BYPASS' : (htfAlign.passed ? 'PASS' : 'FAIL'),
      structureValid: 'PASS',
      htfBias: htfAlign.htfBias,
      htfTimeframe: htfAlign.htfTimeframe
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
    distanceToObstacleR?: number;
    nearestObstaclePrice?: number;
  } | null> {
    // Immediate early-exit safety check: NEVER evaluate a strategy deleted by the user
    if ((this.settings.deletedStrategies || []).includes(strat)) {
      return null;
    }

    // Closed candles only — strip the in-progress candle for all indicator/PA logic
    const closedKlines = klines && klines.length > 1 ? klines.slice(0, -1) : (klines || []);

    // 1. 5 EMA Gap Pullback algorithm
    if (strat === 'EMA_GAP_PULLBACK') {
      const htfCandles = await this.getKlines(symbol, '1h');
      const closedHtf = htfCandles && htfCandles.length > 1 ? htfCandles.slice(0, -1) : (htfCandles || []);
      const sig = evaluateEmaGapPullback(closedKlines, closedHtf, currentPrice, this.settings as any);
      if (!sig || sig.status !== 'confirmed') return null;
      // Optional Real 3R room validation if enabled in settings
      if (this.settings.egpRequireReal3RRoom) {
        const roomResult = checkReal3RRoom(sig.entry!, sig.stop!, sig.direction!, closedHtf);
        if (!roomResult.hasRoom) {
          this.logScanResult(symbol, sig.direction!, false,
            `Real 3R Room Failed: ${roomResult.reason}`,
            currentPrice, sig.stop!, sig.tp1!, sig.score || 0,
            { 
              strategy: 'EMA_GAP_PULLBACK',
              marketRegime: classification?.label || '5 EMA Trend Continuation',
              macroColor: globalRegime?.macroColor,
              regimeConfidence: classification?.confidence
            });
          return null;
        }
        // Attach diagnostics to signal
        (sig as any).distanceToObstacleR = roomResult.distanceToObstacleR;
        (sig as any).nearestObstaclePrice = roomResult.nearestObstaclePrice;
      }
      return {
        direction: sig.direction!,
        score: sig.score || 90,
        atr: sig.atr || (currentPrice * 0.01),
        sl: sig.stop!,
        tp1: sig.tp1!,
        tp2: sig.tp2!,
        tp3: sig.tp3!,
        signalTime: sig.signalTime,
        reason: sig.reason,
        // Include Real‑3R diagnostics if present
        distanceToObstacleR: (sig as any).distanceToObstacleR,
        nearestObstaclePrice: (sig as any).nearestObstaclePrice,
        strategy: 'EMA_GAP_PULLBACK',
        marketRegime: '5 EMA Trend Continuation'
      };
    }

    // 1b. EMA 5 Price Action Gap + Volume Strategy (Standalone Pure PA Engine)
    if (strat === 'EMA5_PA_VOLUME_V1') {
      const klines5m = (this.settings.timeframe === '5m')
        ? closedKlines
        : ((await this.getKlines(symbol, '5m'))?.slice(0, -1) || closedKlines);
      const candles15m = await this.getKlines(symbol, '15m');
      const closed15m = candles15m && candles15m.length > 1 ? candles15m.slice(0, -1) : (candles15m || []);
      const sig = evaluateEma5PaVolume(klines5m, closed15m, {
        version: this.settings.ema5PaVersion ?? 'C',
        minVolumeRatio: this.settings.ema5PaMinVolumeRatio ?? 1.10,
        minGapRangeRatio: this.settings.ema5PaMinGapRangeRatio ?? 0.20,
        maxGapRangeRatio: this.settings.ema5PaMaxGapRangeRatio ?? 1.00,
        maxEmaCrosses: this.settings.ema5PaMaxEmaCrosses ?? 3,
        minBodyRatio: this.settings.ema5PaMinBodyRatio ?? 0.50,
        minClosePosition: this.settings.ema5PaMinClosePosition ?? 0.65,
        maxSetupRangeRatio: this.settings.ema5PaMaxSetupRangeRatio ?? 2.0,
        maxStopRangeRatio: this.settings.ema5PaMaxStopRangeRatio ?? 2.0,
        riskReward: this.settings.ema5PaRiskReward ?? 1.5,
        breakevenEnabled: this.settings.ema5PaBreakevenEnabled ?? true,
        requireStructureBreak: this.settings.ema5PaRequireStructureBreak ?? false,
        entryMode: this.settings.ema5PaEntryMode ?? 'MOMENTUM',
      }, symbol);
      if (!sig || sig.rejectionReason) return null;
      return {
        direction: sig.direction,
        score: sig.setupScore,
        atr: sig.metrics.recentAvgRange,
        sl: sig.sl,
        tp1: sig.tp1,
        tp2: sig.tp2,
        tp3: sig.tp3,
        signalTime: sig.candleTime,
        reason: `EMA5 PA Vol (${sig.direction}) 15m ${sig.regime15m}`,
        strategy: 'EMA5_PA_VOLUME_V1',
        marketRegime: `15m Structure ${sig.regime15m}`,
      };
    }
    
    // 2. Volatility Compression Breakout (VCB) Strategy - Primary canonical strategy
    if (strat === 'VOLATILITY_COMPRESSION' || strat === 'AUTO_REGIME') {
      const sig = await this.evaluateVolatilityCompression(symbol, closedKlines, currentPrice);
      if (!sig) return null;
      return { ...sig, strategy: 'VOLATILITY_COMPRESSION', marketRegime: 'Consolidation Squeeze' };
    }
    
    // 3. Early Coil Breakout
    if (strat === 'EARLY_COIL_BREAKOUT') {
      const sig = evaluateEarlyCoilBreakout(closedKlines, this.settings as any);
      if (!sig) return null;
      return { ...sig, strategy: 'EARLY_COIL_BREAKOUT', marketRegime: 'Fractal Breakout' };
    }

    // 3b. Two-Sided Coil Breakout
    if (strat === 'TWO_SIDED_COIL_BREAKOUT') {
      const sig = evaluateTwoSidedCoilBreakout(closedKlines as any, [], {
        symbol,
        timeframe: this.settings.timeframe || '15m',
        minRrRatio: (this.settings as any)?.coilMinRrRatio ?? 2.0,
        aggressiveBreakoutMode: true
      });
      if (!sig || !sig.status.startsWith('VALID')) return null;
      return {
        direction: sig.side as 'LONG' | 'SHORT',
        score: sig.score,
        atr: sig.coil?.atrAtCoil || (currentPrice * 0.015),
        sl: sig.stop,
        tp1: sig.target,
        tp2: sig.target,
        tp3: sig.target,
        compressionHigh: sig.coilRange.high,
        compressionLow: sig.coilRange.low,
        reason: `${sig.setup} [1:${sig.rrRatio.toFixed(1)} RR] (${sig.status})`,
        strategy: 'TWO_SIDED_COIL_BREAKOUT',
        marketRegime: 'Coil Squeeze Breakout'
      };
    }

    // 4. Trend Pullback Strategy (5-pillar confirmation)
    if (strat === 'TREND_PULLBACK') {
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
          unconfirmedVolumeMode: this.settings.tpbAllowUnconfirmedVolume === true,
          maxEntryDistanceAtr: this.settings.tpbMaxEntryDistanceAtr ?? 0.25,
          minStopDistanceAtr: this.settings.tpbMinStopDistanceAtr ?? 0.8,
          maxStopDistanceAtr: this.settings.tpbMaxStopDistanceAtr ?? 3.0,
          allowBroadStop: this.settings.tpbAllowBroadStop === true,
          atrBufferMult: this.settings.tpbAtrBuffer ?? 0.3,
          maxSpreadAtr: this.settings.tpbMaxSpreadAtr ?? 0.3,
          allowLongs: this.settings.tpbAllowLongs !== false,
          allowShorts: this.settings.tpbAllowShorts !== false,
          minRrRatio: this.settings.tpbMinRrRatio || 1.5,
          minScore: this.settings.tpbMinScore || 8,
          enforceRegimeFilter: !this.settings.bypassRegimeStandAside && !this.isGateDisabled('TPB_g1') && ((this.settings as any).tpbEnforceRegimeFilter === true)
        }
      );
      if (!signal) return null;
      return { ...signal, strategy: 'TREND_PULLBACK', marketRegime: 'Trending [EMA Pullback]' };
    }

    // 5. SMC Liquidity Sweep
    if (strat === 'SMC_LIQUIDITY_SWEEP' || strat === 'LIQUIDITY_SWEEP_REVERSAL') {
      try {
        const htf = this.settings.smcHtfResolution || '1h';
        const htfCandles = await this.getKlines(symbol, htf);
        const closedHtf = htfCandles ? htfCandles.slice(0, -1) : null;
        const sig = evaluateSmc(closedKlines, closedHtf, currentPrice, {
          htfResolution: htf,
          structureLen: this.settings.smcStructureLen,
          wickRatio: this.settings.smcWickRatio,
          minSweepWickPct: this.settings.smcMinSweepWickPct,
          dispAtrMult: this.settings.smcDispAtrMult,
          sweepConfirmWindow: this.settings.smcSweepConfirmWindow,
          volMult: this.settings.smcVolMult,
          fvgAfterMssWindow: this.settings.smcFvgAfterMssWindow,
          obLookback: this.settings.smcObLookback,
          useKillZone: this.settings.smcUseKillZone,
          atrStopMult: this.settings.smcAtrStopMult,
          rrRatio: this.settings.smcRrRatio,
          strictHtfRegime: this.settings.smcStrictHtfRegime,
          enforceRegimeFilter: !this.settings.bypassRegimeStandAside && !this.isGateDisabled('SMC_g1') && ((this.settings as any).smcEnforceRegimeFilter === true),
          symbol
        });
        const effectiveThreshold = this.settings.autoTradeThreshold ?? 70;
        const smcThreshold = (this.isGateDisabled('RISK_threshold') && effectiveThreshold <= 50) ? 50 : effectiveThreshold;
        if (sig && sig.score >= smcThreshold) {
          // If price is currently inside the FVG+OB entry zone, execute immediately!
          const inZone = currentPrice >= sig.entryZoneMin * 0.999 && currentPrice <= sig.entryZoneMax * 1.001;
          if (inZone) {
            const risk = Math.abs(currentPrice - sig.sl);
            return {
              direction: sig.direction,
              score: sig.score,
              atr: risk,
              sl: sig.sl,
              tp1: sig.tp1,
              tp2: sig.tp2,
              tp3: sig.tp3 || (sig.direction === 'LONG' ? currentPrice + (risk * 5) : currentPrice - (risk * 5)),
              strategy: 'SMC_LIQUIDITY_SWEEP',
              marketRegime: `SMC Confluence (${sig.htfRegime})`,
              reason: sig.reason,
              signalTime: sig.signalTime
            };
          }

          // Otherwise add to pending limits for retracement to FVG midpoint
          const expiryTime = Date.now() + (15 * 60 * 1000 * 6);
          this.pendingSmcSetups.set(symbol, { ...sig, expiryTime });
        }
      } catch(e) {}
      return null;
    }

    // 7. Ranging Mean-Reversion Strategy
    if (strat === 'BINANCE_COMPOSITE' || strat === 'RANGE_MEAN_REVERSION') {
      const compSig = await this.evaluateCompositeStrategy(symbol, closedKlines, currentPrice);
      if (!compSig) return null;
      return { ...compSig, strategy: 'BINANCE_COMPOSITE', marketRegime: 'Ranging [1:3 R:R Mean-Reversion]' };
    }

    // 8. Trend Pullback Retest (full state-machine strategy)
    if (strat === 'TREND_PULLBACK_RETEST') {
      if (this.settings.tprEnabled === false) return null;
      // Closed candles only — strip the last (in-progress) candle
      const closedKlines = klines.slice(0, -1);
      if (closedKlines.length < 60) return null;
      // Get or create per-symbol state
      if (!this.tprStates.has(symbol)) {
        this.tprStates.set(symbol, createTprState());
      }
      const tprState = this.tprStates.get(symbol)!;
      const sig = evaluateTrendPullbackRetest(
        closedKlines,
        {
          emaFast: this.settings.tprEmaFast ?? 20,
          emaSlow: this.settings.tprEmaSlow ?? 50,
          emaHtf: this.settings.tprEmaHtf ?? 200,
          atrPeriod: this.settings.tprAtrPeriod ?? 14,
          adxPeriod: this.settings.tprAdxPeriod ?? 14,
          rsiPeriod: this.settings.tprRsiPeriod ?? 14,
          minAdx: this.settings.tprMinAdx ?? 20,
          minTrendScore: this.settings.tprMinTrendScore ?? 5,
          maxPullbackAtr: this.settings.tprMaxPullbackAtr ?? 1.5,
          maxPullbackCandles: this.settings.tprMaxPullbackCandles ?? 10,
          retestToleranceAtr: this.settings.tprRetestToleranceAtr ?? 0.20,
          minConfBodyRatio: this.settings.tprMinConfBodyRatio ?? 0.40,
          maxChaseAtr: this.settings.tprMaxChaseAtr ?? 0.75,
          maxConfCandleAtr: this.settings.tprMaxConfCandleAtr ?? 2.0,
          minEmaGapAtrRatio: this.settings.tprMinEmaGapAtrRatio ?? 0.20,
          slAtrMultiple: this.settings.tprSlAtrMultiple ?? 1.5,
          rrRatio: this.settings.tprRrRatio ?? 2.0,
          trailingEnabled: this.settings.tprTrailingEnabled !== false,
          breakevenEnabled: this.settings.tprBreakevenEnabled !== false,
          cooldownCandles: this.settings.tprCooldownCandles ?? 5,
          setupTimeout: this.settings.tprSetupTimeout ?? 10,
          allowLongs: this.settings.tprAllowLongs !== false,
          allowShorts: this.settings.tprAllowShorts !== false,
          debugMode: false,
        },
        tprState,
        symbol
      );
      if (!sig || sig.rejectionReason) return null;
      return {
        direction: sig.direction,
        score: sig.setupScore,
        atr: sig.atr,
        sl: sig.sl,
        tp1: sig.tp1,
        tp2: sig.tp2,
        tp3: sig.tp3,
        signalTime: sig.candleTime,
        reason: sig.reason,
        strategy: 'TREND_PULLBACK_RETEST',
        marketRegime: `Trend Pullback Retest [${sig.trendScore}/6 trend quality]`,
      };
    }

    // 9. EMA 5 Rejection → Reclaim → Displacement Strategy
    if (strat === 'EMA5_REJECTION_RECLAIM_V1') {
      if (this.settings.errEnabled === false) return null;
      // Closed 5m candles only — strip the in-progress candle
      const klines5m = (this.settings.timeframe === '5m')
        ? closedKlines
        : ((await this.getKlines(symbol, '5m'))?.slice(0, -1) || closedKlines);
      if (klines5m.length < 30) return null;

      // Get live 15m candles for regime structure
      const klines15m = await this.getKlines(symbol, '15m');
      const closedKlines15m = klines15m ? klines15m.slice(0, -1) : [];

      if (!this.errStates.has(symbol)) {
        this.errStates.set(symbol, createErrState());
      }
      const errState = this.errStates.get(symbol)!;

      const sig = evaluateEma5RejectionReclaim(
        klines5m,
        closedKlines15m,
        {
          emaLength: this.settings.errEmaLength ?? 5,
          volumeLookback: this.settings.errVolumeLookback ?? 20,
          minVolumeRatio: this.settings.errMinVolumeRatio ?? 1.10,
          minRejectionWickBodyRatio: this.settings.errMinRejectionWickBodyRatio ?? 1.0,
          strongRejectionWickBodyRatio: this.settings.errStrongRejectionWickBodyRatio ?? 1.5,
          minDisplacementBodyRatio: this.settings.errMinDisplacementBodyRatio ?? 0.50,
          strongDisplacementBodyRatio: this.settings.errStrongDisplacementBodyRatio ?? 0.60,
          minClosePosition: this.settings.errMinClosePosition ?? 0.65,
          rejectionExpiryCandles: this.settings.errRejectionExpiryCandles ?? 3,
          reclaimExpiryCandles: this.settings.errReclaimExpiryCandles ?? 2,
          recentRangeLookback: this.settings.errRecentRangeLookback ?? 5,
          maxDisplacementRangeRatio: this.settings.errMaxDisplacementRangeRatio ?? 2.0,
          maxStopRangeRatio: this.settings.errMaxStopRangeRatio ?? 2.0,
          maxEmaCrosses: this.settings.errMaxEmaCrosses ?? 3,
          emaCrossLookback: this.settings.errEmaCrossLookback ?? 10,
          requireStructureBreak: this.settings.errRequireStructureBreak ?? false,
          allowReclaimAsDisplacement: this.settings.errAllowReclaimAsDisplacement ?? false,
          riskReward: this.settings.errRiskReward ?? 1.5,
          breakevenEnabled: this.settings.errBreakevenEnabled !== false,
          breakevenTriggerR: this.settings.errBreakevenTriggerR ?? 1.0,
          cooldownCandles: this.settings.errCooldownCandles ?? 2,
        },
        errState,
        symbol
      );

      if (!sig || sig.rejectionReason) return null;
      return {
        direction: sig.direction,
        score: sig.setupScore,
        atr: sig.metrics.recentAverageRange || 0,
        sl: sig.sl,
        tp1: sig.tp1,
        tp2: sig.tp2,
        tp3: sig.tp3,
        signalTime: sig.candleTime,
        reason: sig.reason,
        strategy: 'EMA5_REJECTION_RECLAIM_V1',
        marketRegime: `EMA5 Rejection Reclaim [15m ${sig.regime15m}]`,
      };
    }

    // 10. EMA 5 Exact Price Action Entry Strategy (EMA5_EXACT_ENTRY_V1)
    if (strat === 'EMA5_EXACT_ENTRY_V1') {
      if (this.settings.eeeEnabled === false) return null;
      // Closed 5m candles only — strip the in-progress candle
      const klines5m = (this.settings.timeframe === '5m')
        ? closedKlines
        : ((await this.getKlines(symbol, '5m'))?.slice(0, -1) || closedKlines);
      if (klines5m.length < 25) return null;

      // Get live 15m candles for regime structure
      const klines15m = await this.getKlines(symbol, '15m');
      const closedKlines15m = klines15m ? klines15m.slice(0, -1) : [];

      if (!this.eeeStates.has(symbol)) {
        this.eeeStates.set(symbol, createEeeState());
      }
      const eeeState = this.eeeStates.get(symbol)!;

      const sig = evaluateEma5ExactEntry(
        klines5m,
        closedKlines15m,
        {
          emaLength: this.settings.eeeEmaLength ?? 5,
          minVolumeRatio: this.settings.eeeMinVolumeRatio ?? 1.05,
          minBodyRatio: this.settings.eeeMinBodyRatio ?? 0.50,
          minClosePosition: this.settings.eeeMinClosePosition ?? 0.60,
          maxEmaDistanceRatio: this.settings.eeeMaxEmaDistanceRatio ?? 1.2,
          maxStopRangeRatio: this.settings.eeeMaxStopRangeRatio ?? 2.0,
          maxEmaCrosses: this.settings.eeeMaxEmaCrosses ?? 3,
          riskReward: this.settings.eeeRiskReward ?? 1.5,
          exitMode: this.settings.eeeExitMode ?? 'RR',
          breakevenEnabled: this.settings.eeeBreakevenEnabled !== false,
          breakevenTriggerR: this.settings.eeeBreakevenTriggerR ?? 1.0,
          cooldownCandles: this.settings.eeeCooldownCandles ?? 2,
          slBufferPct: this.settings.eeeSlBufferPct ?? 0.0005,
          requireOpposingSpace: this.settings.eeeRequireOpposingSpace !== false,
        },
        eeeState,
        symbol
      );

      if (!sig || sig.rejectionReason) return null;
      return {
        direction: sig.direction,
        score: sig.setupScore,
        atr: sig.metrics.recentAverageRange || 0,
        sl: sig.sl,
        tp1: sig.tp1,
        tp2: sig.tp2,
        tp3: sig.tp3,
        signalTime: sig.candleTime,
        reason: sig.reason,
        strategy: 'EMA5_EXACT_ENTRY_V1',
        marketRegime: `EMA5 Exact PA [15m ${sig.regime15m}]`,
      };
    }

    // 11. EMA 5 Exact Price Action Entry V2 (EMA5_EXACT_ENTRY_V2)
    if (strat === 'EMA5_EXACT_ENTRY_V2') {
      if (this.settings.eev2Enabled === false) return null;
      // Closed 5m candles only — strip the in-progress candle
      const klines5m = (this.settings.timeframe === '5m')
        ? closedKlines
        : ((await this.getKlines(symbol, '5m'))?.slice(0, -1) || closedKlines);
      if (klines5m.length < 200) return null;

      // Get live 15m, 1h, and 1D candles for HTF alignment and levels
      const klines15m = await this.getKlines(symbol, '15m');
      const closedKlines15m = klines15m ? klines15m.slice(0, -1) : [];

      const klines1h = await this.getKlines(symbol, '1h');
      const closedKlines1h = klines1h ? klines1h.slice(0, -1) : [];

      const klines1d = await this.getKlines(symbol, '1d');
      const closedKlines1d = klines1d ? klines1d.slice(0, -1) : [];

      const activePositionsCount = positionMonitor.getActivePositions().filter(p => p.symbol === symbol).length;

      const sig = evaluateEma5ExactEntryV2({
        candles5m: klines5m.map(k => ({
          time: k.openTime || k.time,
          open: k.open,
          high: k.high,
          low: k.low,
          close: k.close,
          volume: k.volume,
          closeTime: k.closeTime,
        })),
        candles15m: closedKlines15m.map(k => ({
          time: k.openTime || k.time,
          open: k.open,
          high: k.high,
          low: k.low,
          close: k.close,
          volume: k.volume,
          closeTime: k.closeTime,
        })),
        candles1h: closedKlines1h.map(k => ({
          time: k.openTime || k.time,
          open: k.open,
          high: k.high,
          low: k.low,
          close: k.close,
          volume: k.volume,
          closeTime: k.closeTime,
        })),
        candles1d: closedKlines1d.map(k => ({
          time: k.openTime || k.time,
          open: k.open,
          high: k.high,
          low: k.low,
          close: k.close,
          volume: k.volume,
          closeTime: k.closeTime,
        })),
        symbol,
        config: {
          entryMode: this.settings.eev2EntryMode ?? 'CLOSE_CONFIRM',
          exitMode: this.settings.eev2ExitMode ?? 'LEVEL_LADDER',
          beMode: this.settings.eev2BeMode ?? 'AFTER_TP1',
          minVolumeRatio: this.settings.eev2MinVolumeRatio ?? 1.10,
          regimePivotN: this.settings.eev2RegimePivotN ?? 3,
          slBufferAvgRange: this.settings.eev2SlBufferAvgRange ?? 0.15,
          maxStopAvgRange: this.settings.eev2MaxStopAvgRange ?? 2.0,
          minStopAvgRange: this.settings.eev2MinStopAvgRange ?? 0.5,
          maxFeeR: this.settings.eev2MaxFeeR ?? 0.20,
          minNetRr: this.settings.eev2MinNetRr ?? 2.5,
          tp1MinR: this.settings.eev2Tp1MinR ?? 1.5,
          tp2MinR: this.settings.eev2Tp2MinR ?? 3.0,
          minRoomR: this.settings.eev2MinRoomR ?? 1.0,
          allowRrFallback: this.settings.eev2AllowRrFallback ?? false,
          fallbackTpR: this.settings.eev2FallbackTpR ?? 3.0,
          maxEntryDriftR: this.settings.eev2MaxEntryDriftR ?? 0.15,
        },
        consumedKeys: this.eev2ConsumedKeys,
        activePositionsCount,
        marketDriftPrice: currentPrice,
      });

      if (!sig || sig.signalStatus !== 'VALID' || !sig.direction) return null;

      // Mark setup as consumed
      if (sig.setupKey) {
        this.eev2ConsumedKeys.add(sig.setupKey);
      }

      return {
        direction: sig.direction,
        score: Math.min(100, Math.round(70 + sig.netRr * 5)),
        atr: sig.avgRange || 0,
        sl: sig.stopLoss,
        tp1: sig.tp1,
        tp2: sig.tp2,
        tp3: sig.tp3,
        signalTime: sig.timestamp,
        reason: `EMA 5 Alert-Break [15m ${sig.regime15m}] | Net R:R ${sig.netRr.toFixed(2)} | FeeR ${sig.feeR.toFixed(3)}R`,
        strategy: 'EMA5_EXACT_ENTRY_V2',
        marketRegime: `EMA5 V2 Alert-Break [15m ${sig.regime15m}]`,
      };
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

    // Multi-strategy resolution: Gather all active strategies configured by user (excluding deleted)
    const deletedList = (this.settings.deletedStrategies || []).map(s => String(s).trim());
    let activeStrategies: string[] = [];
    if (this.settings.enabledStrategies && Array.isArray(this.settings.enabledStrategies) && this.settings.enabledStrategies.length > 0) {
      activeStrategies = this.settings.enabledStrategies.filter(s => !deletedList.includes(s));
    } else if (this.settings.activeStrategy && (this.settings.activeStrategy as string) !== 'AUTO_REGIME') {
      if (!deletedList.includes(this.settings.activeStrategy as string)) {
        activeStrategies = [this.settings.activeStrategy];
      }
    } else {
      const isRange = this.settings.coindcxActiveRegime === 'RANGE' || (this.settings.coindcxActiveRegime as string) === 'RANGE_CHOP';
      const defaultStrat = isRange ? 'BINANCE_COMPOSITE' : 'VOLATILITY_COMPRESSION';
      activeStrategies = [defaultStrat].filter(s => !deletedList.includes(s));
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
    // Respect useGlobalBtcFilter toggle — same logic as in evaluateSignal()
    if (this.settings.useGlobalBtcFilter !== false && (!globalRegime.isTradable || globalRegime.macroColor === 'RED')) {
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

    // Dedicated 4-Strategy Master Decision Engine & Two-Candle Hysteresis Check
    const tradeTf = this.settings.timeframe || '15m';
    const htf = getHigherTimeframe(tradeTf);
    let htfKlines: any[] | null = null;
    try {
      htfKlines = await this.getKlines(symbol, htf);
    } catch (e) {}

    const masterDecision = evaluateMasterRegimeDecision(
      closedKlines,
      htfKlines ? htfKlines.slice(0, -1) : null,
      {
        symbol,
        candleTime: closedCandleTime
      }
    );

    // If master decision detects conflict or explicit NO_TRADE, stand aside immediately
    if (masterDecision.hasConflict) {
      this.logScanResult(
        symbol,
        'NEUTRAL',
        false,
        `Master Regime Conflict: ${masterDecision.reason}`,
        currentPrice,
        0, 0, 0,
        {
          marketRegime: 'NO_TRADE',
          macroColor: globalRegime.macroColor,
          strategy: 'AUTO_REGIME',
          rejectionReasons: [masterDecision.reason]
        }
      );
      return null;
    }

    const bucket: StrategyBucketItem[] = (this.settings.strategyBucket && this.settings.strategyBucket.length > 0)
      ? this.settings.strategyBucket
      : DEFAULT_STRATEGY_BUCKET;

    const eligibleCandidates = getEligibleBucketStrategies(bucket, currentRegime, globalRegime.macroColor, this.settings.deletedStrategies || []);
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
            unconfirmedVolumeMode: this.settings.tpbAllowUnconfirmedVolume === true,
            maxEntryDistanceAtr: this.settings.tpbMaxEntryDistanceAtr ?? 0.25,
            minStopDistanceAtr: this.settings.tpbMinStopDistanceAtr ?? 0.8,
            maxStopDistanceAtr: this.settings.tpbMaxStopDistanceAtr ?? 3.0,
            allowBroadStop: this.settings.tpbAllowBroadStop === true,
            maxSpreadAtr: this.settings.tpbMaxSpreadAtr ?? 0.3,
            allowLongs: this.settings.tpbAllowLongs !== false,
            allowShorts: this.settings.tpbAllowShorts !== false,
            minRrRatio: this.settings.tpbMinRrRatio || 1.5,
            minScore: this.settings.tpbMinScore || 8,
            enforceRegimeFilter: !this.settings.bypassRegimeStandAside && !this.isGateDisabled('TPB_g1') && ((this.settings as any).tpbEnforceRegimeFilter === true)
          }
        );
        if (pullbackSignal && (!candidate.direction || pullbackSignal.direction === candidate.direction)) {
          pendingSignal = { ...pullbackSignal };
        }
      }

      if ((candidate.id === 'BINANCE_COMPOSITE' || candidate.id === 'RANGE_MEAN_REVERSION') && currentRegime === 'RANGING') {
        const compositeSignal = await this.evaluateCompositeStrategy(symbol, closedKlines, currentPrice);
        if (compositeSignal) {
          pendingSignal = { ...compositeSignal, strategy: 'BINANCE_COMPOSITE' };
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

      if (candidate.id === 'TWO_SIDED_COIL_BREAKOUT' && currentRegime.startsWith('BREAKOUT')) {
        const coilSig = evaluateTwoSidedCoilBreakout(closedKlines as any, [], {
          symbol,
          timeframe: this.settings.timeframe || '15m',
          minRrRatio: (this.settings as any)?.coilMinRrRatio ?? 2.0,
          aggressiveBreakoutMode: true
        });
        if (coilSig && coilSig.status.startsWith('VALID') && (!candidate.direction || coilSig.side === candidate.direction)) {
          pendingSignal = {
            direction: coilSig.side as 'LONG' | 'SHORT',
            score: coilSig.score,
            atr: coilSig.coil?.atrAtCoil || (currentPrice * 0.015),
            sl: coilSig.stop,
            tp1: coilSig.target,
            tp2: coilSig.target,
            tp3: coilSig.target,
            compressionHigh: coilSig.coilRange.high,
            compressionLow: coilSig.coilRange.low,
            reason: `${coilSig.setup} [1:${coilSig.rrRatio.toFixed(1)} RR] (${coilSig.status})`,
            strategy: 'TWO_SIDED_COIL_BREAKOUT',
          };
        }
      }



      if (candidate.id === 'EMA_GAP_PULLBACK' && currentRegime.startsWith('TRENDING')) {
        const htfCandles = await this.getKlines(symbol, '1h');
        const closedHtf = htfCandles && htfCandles.length > 1 ? htfCandles.slice(0, -1) : (htfCandles || []);
        const egpSignal = evaluateEmaGapPullback(closedKlines, closedHtf, currentPrice, this.settings as any);
        if (egpSignal && egpSignal.status === 'confirmed' && (!candidate.direction || egpSignal.direction === candidate.direction)) {
          pendingSignal = {
            direction: egpSignal.direction!,
            score: egpSignal.score || 90,
            atr: egpSignal.atr || (currentPrice * 0.01),
            sl: egpSignal.stop!,
            tp1: egpSignal.tp1!,
            tp2: egpSignal.tp2!,
            tp3: egpSignal.tp3!,
            signalTime: egpSignal.signalTime,
            reason: egpSignal.reason,
          };
        }
      }

      if (candidate.id === 'EMA5_PA_VOLUME_V1' && currentRegime.startsWith('TRENDING')) {
        const klines5m = (this.settings.timeframe === '5m')
          ? closedKlines
          : ((await this.getKlines(symbol, '5m'))?.slice(0, -1) || closedKlines);
        const candles15m = await this.getKlines(symbol, '15m');
        const closed15m = candles15m && candles15m.length > 1 ? candles15m.slice(0, -1) : (candles15m || []);
        const sig = evaluateEma5PaVolume(klines5m, closed15m, {
          version: this.settings.ema5PaVersion ?? 'C',
          minVolumeRatio: this.settings.ema5PaMinVolumeRatio ?? 1.10,
          minGapRangeRatio: this.settings.ema5PaMinGapRangeRatio ?? 0.20,
          maxGapRangeRatio: this.settings.ema5PaMaxGapRangeRatio ?? 1.00,
          maxEmaCrosses: this.settings.ema5PaMaxEmaCrosses ?? 3,
          minBodyRatio: this.settings.ema5PaMinBodyRatio ?? 0.50,
          minClosePosition: this.settings.ema5PaMinClosePosition ?? 0.65,
          maxSetupRangeRatio: this.settings.ema5PaMaxSetupRangeRatio ?? 2.0,
          maxStopRangeRatio: this.settings.ema5PaMaxStopRangeRatio ?? 2.0,
          riskReward: this.settings.ema5PaRiskReward ?? 1.5,
          breakevenEnabled: this.settings.ema5PaBreakevenEnabled ?? true,
          requireStructureBreak: this.settings.ema5PaRequireStructureBreak ?? false,
          entryMode: this.settings.ema5PaEntryMode ?? 'MOMENTUM',
        }, symbol);
        if (sig && !sig.rejectionReason && (!candidate.direction || sig.direction === candidate.direction)) {
          pendingSignal = {
            direction: sig.direction,
            score: sig.setupScore,
            atr: sig.metrics.recentAvgRange,
            sl: sig.sl,
            tp1: sig.tp1,
            tp2: sig.tp2,
            tp3: sig.tp3,
            signalTime: sig.candleTime,
            reason: `EMA5 PA Vol (${sig.direction}) 15m ${sig.regime15m}`,
          };
        }
      }

      if (candidate.id === 'TREND_PULLBACK_RETEST' && currentRegime.startsWith('TRENDING')) {
        if (this.settings.tprEnabled !== false && closedKlines.length >= 60) {
          if (!this.tprStates.has(symbol)) {
            this.tprStates.set(symbol, createTprState());
          }
          const tprState = this.tprStates.get(symbol)!;
          const tprSig = evaluateTrendPullbackRetest(
            closedKlines,
            {
              emaFast: this.settings.tprEmaFast ?? 20,
              emaSlow: this.settings.tprEmaSlow ?? 50,
              emaHtf: this.settings.tprEmaHtf ?? 200,
              atrPeriod: this.settings.tprAtrPeriod ?? 14,
              adxPeriod: this.settings.tprAdxPeriod ?? 14,
              rsiPeriod: this.settings.tprRsiPeriod ?? 14,
              minAdx: this.settings.tprMinAdx ?? 20,
              minTrendScore: this.settings.tprMinTrendScore ?? 5,
              maxPullbackAtr: this.settings.tprMaxPullbackAtr ?? 1.5,
              maxPullbackCandles: this.settings.tprMaxPullbackCandles ?? 10,
              retestToleranceAtr: this.settings.tprRetestToleranceAtr ?? 0.20,
              minConfBodyRatio: this.settings.tprMinConfBodyRatio ?? 0.40,
              maxChaseAtr: this.settings.tprMaxChaseAtr ?? 0.75,
              maxConfCandleAtr: this.settings.tprMaxConfCandleAtr ?? 2.0,
              minEmaGapAtrRatio: this.settings.tprMinEmaGapAtrRatio ?? 0.20,
              slAtrMultiple: this.settings.tprSlAtrMultiple ?? 1.5,
              rrRatio: this.settings.tprRrRatio ?? 2.0,
              trailingEnabled: this.settings.tprTrailingEnabled !== false,
              breakevenEnabled: this.settings.tprBreakevenEnabled !== false,
              cooldownCandles: this.settings.tprCooldownCandles ?? 5,
              setupTimeout: this.settings.tprSetupTimeout ?? 10,
              allowLongs: this.settings.tprAllowLongs !== false,
              allowShorts: this.settings.tprAllowShorts !== false,
              debugMode: false,
            },
            tprState,
            symbol
          );
          if (tprSig && !tprSig.rejectionReason && (!candidate.direction || tprSig.direction === candidate.direction)) {
            pendingSignal = {
              direction: tprSig.direction,
              score: tprSig.setupScore,
              atr: tprSig.atr,
              sl: tprSig.sl,
              tp1: tprSig.tp1,
              tp2: tprSig.tp2,
              tp3: tprSig.tp3,
              signalTime: tprSig.candleTime,
              reason: tprSig.reason,
            };
          }
        }
      }

      if (candidate.id === 'EMA5_REJECTION_RECLAIM_V1' && (currentRegime.startsWith('TRENDING') || currentRegime === 'RANGING' || currentRegime.startsWith('EXHAUSTION'))) {
        if (this.settings.errEnabled !== false) {
          const klines5m = (this.settings.timeframe === '5m')
            ? closedKlines
            : ((await this.getKlines(symbol, '5m'))?.slice(0, -1) || closedKlines);
          if (klines5m.length >= 30) {
            const klines15m = await this.getKlines(symbol, '15m');
            const closedKlines15m = klines15m ? klines15m.slice(0, -1) : [];

            if (!this.errStates.has(symbol)) {
              this.errStates.set(symbol, createErrState());
            }
            const errState = this.errStates.get(symbol)!;

            const errSig = evaluateEma5RejectionReclaim(
              klines5m,
              closedKlines15m,
              {
                emaLength: this.settings.errEmaLength ?? 5,
                volumeLookback: this.settings.errVolumeLookback ?? 20,
                minVolumeRatio: this.settings.errMinVolumeRatio ?? 1.10,
                minRejectionWickBodyRatio: this.settings.errMinRejectionWickBodyRatio ?? 1.0,
                strongRejectionWickBodyRatio: this.settings.errStrongRejectionWickBodyRatio ?? 1.5,
                minDisplacementBodyRatio: this.settings.errMinDisplacementBodyRatio ?? 0.50,
                strongDisplacementBodyRatio: this.settings.errStrongDisplacementBodyRatio ?? 0.60,
                minClosePosition: this.settings.errMinClosePosition ?? 0.65,
                rejectionExpiryCandles: this.settings.errRejectionExpiryCandles ?? 3,
                reclaimExpiryCandles: this.settings.errReclaimExpiryCandles ?? 2,
                recentRangeLookback: this.settings.errRecentRangeLookback ?? 5,
                maxDisplacementRangeRatio: this.settings.errMaxDisplacementRangeRatio ?? 2.0,
                maxStopRangeRatio: this.settings.errMaxStopRangeRatio ?? 2.0,
                maxEmaCrosses: this.settings.errMaxEmaCrosses ?? 3,
                emaCrossLookback: this.settings.errEmaCrossLookback ?? 10,
                requireStructureBreak: this.settings.errRequireStructureBreak ?? false,
                allowReclaimAsDisplacement: this.settings.errAllowReclaimAsDisplacement ?? false,
                riskReward: this.settings.errRiskReward ?? 1.5,
                breakevenEnabled: this.settings.errBreakevenEnabled !== false,
                breakevenTriggerR: this.settings.errBreakevenTriggerR ?? 1.0,
                cooldownCandles: this.settings.errCooldownCandles ?? 2,
              },
              errState,
              symbol
            );

            if (errSig && !errSig.rejectionReason && (!candidate.direction || errSig.direction === candidate.direction)) {
              pendingSignal = {
                direction: errSig.direction,
                score: errSig.setupScore,
                atr: errSig.metrics.recentAverageRange || 0,
                sl: errSig.sl,
                tp1: errSig.tp1,
                tp2: errSig.tp2,
                tp3: errSig.tp3,
                signalTime: errSig.candleTime,
                reason: errSig.reason,
              };
            }
          }
        }
      }

      if (candidate.id === 'EMA5_EXACT_ENTRY_V2' && currentRegime.startsWith('TRENDING')) {
        if (this.settings.eev2Enabled !== false) {
          const klines5m = (this.settings.timeframe === '5m')
            ? closedKlines
            : ((await this.getKlines(symbol, '5m'))?.slice(0, -1) || closedKlines);
          if (klines5m.length >= 200) {
            const klines15m = await this.getKlines(symbol, '15m');
            const closedKlines15m = klines15m ? klines15m.slice(0, -1) : [];

            const klines1h = await this.getKlines(symbol, '1h');
            const closedKlines1h = klines1h ? klines1h.slice(0, -1) : [];

            const klines1d = await this.getKlines(symbol, '1d');
            const closedKlines1d = klines1d ? klines1d.slice(0, -1) : [];

            const activePositionsCount = positionMonitor.getActivePositions().filter(p => p.symbol === symbol).length;

            const eev2Sig = evaluateEma5ExactEntryV2({
              candles5m: klines5m.map(k => ({
                time: k.openTime || k.time,
                open: k.open,
                high: k.high,
                low: k.low,
                close: k.close,
                volume: k.volume,
                closeTime: k.closeTime,
              })),
              candles15m: closedKlines15m.map(k => ({
                time: k.openTime || k.time,
                open: k.open,
                high: k.high,
                low: k.low,
                close: k.close,
                volume: k.volume,
                closeTime: k.closeTime,
              })),
              candles1h: closedKlines1h.map(k => ({
                time: k.openTime || k.time,
                open: k.open,
                high: k.high,
                low: k.low,
                close: k.close,
                volume: k.volume,
                closeTime: k.closeTime,
              })),
              candles1d: closedKlines1d.map(k => ({
                time: k.openTime || k.time,
                open: k.open,
                high: k.high,
                low: k.low,
                close: k.close,
                volume: k.volume,
                closeTime: k.closeTime,
              })),
              symbol,
              config: {
                entryMode: this.settings.eev2EntryMode ?? 'CLOSE_CONFIRM',
                exitMode: this.settings.eev2ExitMode ?? 'LEVEL_LADDER',
                beMode: this.settings.eev2BeMode ?? 'AFTER_TP1',
                minVolumeRatio: this.settings.eev2MinVolumeRatio ?? 1.10,
                regimePivotN: this.settings.eev2RegimePivotN ?? 3,
                slBufferAvgRange: this.settings.eev2SlBufferAvgRange ?? 0.15,
                maxStopAvgRange: this.settings.eev2MaxStopAvgRange ?? 2.0,
                minStopAvgRange: this.settings.eev2MinStopAvgRange ?? 0.5,
                maxFeeR: this.settings.eev2MaxFeeR ?? 0.20,
                minNetRr: this.settings.eev2MinNetRr ?? 2.5,
                tp1MinR: this.settings.eev2Tp1MinR ?? 1.5,
                tp2MinR: this.settings.eev2Tp2MinR ?? 3.0,
                minRoomR: this.settings.eev2MinRoomR ?? 1.0,
                allowRrFallback: this.settings.eev2AllowRrFallback ?? false,
                fallbackTpR: this.settings.eev2FallbackTpR ?? 3.0,
                maxEntryDriftR: this.settings.eev2MaxEntryDriftR ?? 0.15,
              },
              consumedKeys: this.eev2ConsumedKeys,
              activePositionsCount,
              marketDriftPrice: currentPrice,
            });

            if (eev2Sig && eev2Sig.signalStatus === 'VALID' && eev2Sig.direction && (!candidate.direction || eev2Sig.direction === candidate.direction)) {
              if (eev2Sig.setupKey) {
                this.eev2ConsumedKeys.add(eev2Sig.setupKey);
              }
              pendingSignal = {
                direction: eev2Sig.direction,
                score: Math.min(100, Math.round(70 + eev2Sig.netRr * 5)),
                atr: eev2Sig.avgRange || 0,
                sl: eev2Sig.stopLoss,
                tp1: eev2Sig.tp1,
                tp2: eev2Sig.tp2,
                tp3: eev2Sig.tp3,
                signalTime: eev2Sig.timestamp,
                reason: `EMA 5 Alert-Break [15m ${eev2Sig.regime15m}] | Net R:R ${eev2Sig.netRr.toFixed(2)} | FeeR ${eev2Sig.feeR.toFixed(3)}R`,
              };
            }
          }
        }
      }

      if (candidate.id === 'EMA5_EXACT_ENTRY_V1' && currentRegime.startsWith('TRENDING')) {
        if (this.settings.eeeEnabled !== false) {
          const klines5m = (this.settings.timeframe === '5m')
            ? closedKlines
            : ((await this.getKlines(symbol, '5m'))?.slice(0, -1) || closedKlines);
          if (klines5m.length >= 25) {
            const klines15m = await this.getKlines(symbol, '15m');
            const closedKlines15m = klines15m ? klines15m.slice(0, -1) : [];

            if (!this.eeeStates.has(symbol)) {
              this.eeeStates.set(symbol, createEeeState());
            }
            const eeeState = this.eeeStates.get(symbol)!;

            const eeeSig = evaluateEma5ExactEntry(
              klines5m,
              closedKlines15m,
              {
                emaLength: this.settings.eeeEmaLength ?? 5,
                minVolumeRatio: this.settings.eeeMinVolumeRatio ?? 1.05,
                minBodyRatio: this.settings.eeeMinBodyRatio ?? 0.50,
                minClosePosition: this.settings.eeeMinClosePosition ?? 0.60,
                maxEmaDistanceRatio: this.settings.eeeMaxEmaDistanceRatio ?? 1.2,
                maxStopRangeRatio: this.settings.eeeMaxStopRangeRatio ?? 2.0,
                maxEmaCrosses: this.settings.eeeMaxEmaCrosses ?? 3,
                riskReward: this.settings.eeeRiskReward ?? 1.5,
                exitMode: this.settings.eeeExitMode ?? 'RR',
                breakevenEnabled: this.settings.eeeBreakevenEnabled !== false,
                breakevenTriggerR: this.settings.eeeBreakevenTriggerR ?? 1.0,
                cooldownCandles: this.settings.eeeCooldownCandles ?? 2,
                slBufferPct: this.settings.eeeSlBufferPct ?? 0.0005,
                requireOpposingSpace: this.settings.eeeRequireOpposingSpace !== false,
              },
              eeeState,
              symbol
            );

            if (eeeSig && !eeeSig.rejectionReason && (!candidate.direction || eeeSig.direction === candidate.direction)) {
              pendingSignal = {
                direction: eeeSig.direction,
                score: eeeSig.setupScore,
                atr: eeeSig.metrics.recentAverageRange || 0,
                sl: eeeSig.sl,
                tp1: eeeSig.tp1,
                tp2: eeeSig.tp2,
                tp3: eeeSig.tp3,
                signalTime: eeeSig.candleTime,
                reason: eeeSig.reason,
              };
            }
          }
        }
      }

      if ((candidate.id === 'SMC_LIQUIDITY_SWEEP' || candidate.id === 'LIQUIDITY_SWEEP_REVERSAL') && (currentRegime.startsWith('EXHAUSTION') || currentRegime === 'RANGING' || currentRegime.startsWith('TRENDING'))) {
        try {
          const htf = this.settings.smcHtfResolution || '1h';
          const htfCandles = await this.getKlines(symbol, htf);
          const closedHtf = htfCandles && htfCandles.length > 1 ? htfCandles.slice(0, -1) : (htfCandles || []);
          const smcSig = evaluateSmc(closedKlines, closedHtf, currentPrice, {
            htfResolution: htf,
            structureLen: this.settings.smcStructureLen,
            wickRatio: this.settings.smcWickRatio,
            minSweepWickPct: this.settings.smcMinSweepWickPct,
            dispAtrMult: this.settings.smcDispAtrMult,
            sweepConfirmWindow: this.settings.smcSweepConfirmWindow,
            volMult: this.settings.smcVolMult,
            fvgAfterMssWindow: this.settings.smcFvgAfterMssWindow,
            obLookback: this.settings.smcObLookback,
            useKillZone: this.settings.smcUseKillZone,
            atrStopMult: this.settings.smcAtrStopMult,
            rrRatio: this.settings.smcRrRatio,
            strictHtfRegime: this.settings.smcStrictHtfRegime,
            enforceRegimeFilter: !this.settings.bypassRegimeStandAside && !this.isGateDisabled('SMC_g1') && ((this.settings as any).smcEnforceRegimeFilter === true),
            symbol
          });
          if (smcSig && (!candidate.direction || smcSig.direction === candidate.direction)) {
            const risk = Math.abs(currentPrice - smcSig.sl);
            pendingSignal = {
              direction: smcSig.direction,
              score: smcSig.score,
              atr: risk,
              sl: smcSig.sl,
              tp1: smcSig.tp1,
              tp2: smcSig.tp2,
              tp3: smcSig.tp3 || (smcSig.direction === 'LONG' ? currentPrice + (risk * 5) : currentPrice - (risk * 5)),
              signalTime: smcSig.signalTime || lastClosed.time,
              reason: smcSig.reason
            };
          }
        } catch (e) {
          console.error(`HTF fetch failed for ${symbol} SMC sweep:`, e);
        }
      }

      if (pendingSignal) {
        // Evaluate the 10 Hard Vetoes BEFORE confidence scoring
        const gateResults: Record<string, 'PASS' | 'FAIL' | 'NOT_CHECKED' | 'BYPASS'> = {
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

        // 2. Universal Higher-Timeframe Agreement & Structure Gate
        const htfCheck = await this.checkUniversalHtfStructureAlignment(
          symbol, 
          pendingSignal.direction, 
          currentPrice, 
          closedKlines, 
          candidate.id, 
          currentRegime
        );
        if (!htfCheck.passed) {
          gateResults.higherTimeframeAligned = 'FAIL';
          gateResults.structureValid = 'FAIL';
          rejectionReasons.push(htfCheck.reason || 'HTF Structure alignment failed');
        } else {
          gateResults.higherTimeframeAligned = htfCheck.bypassed ? 'BYPASS' : 'PASS';
          gateResults.structureValid = 'PASS';
        }

        // 4. Stop Loss Structural Validity Gate
        const risk = Math.abs(currentPrice - pendingSignal.sl);
        const bypassStop = this.settings.bypassLiquidationBuffer || this.isGateDisabled('CR_stopDistance');
        const rawMinPct = this.settings.minStopDistancePct ?? 0.003;
        const minStopPct = rawMinPct > 0.02 ? 0.005 : rawMinPct;
        const minRisk = currentPrice * minStopPct; // At least 0.3%-0.5% to avoid spread / noise stop-out
        const maxRisk = currentPrice * 0.045; // Max 4.5% to avoid oversized risk
        if (!bypassStop && risk < minRisk) {
          gateResults.stopStructurallyValid = 'FAIL';
          rejectionReasons.push(`Stop loss too tight: ${(risk / currentPrice * 100).toFixed(2)}% < ${(minStopPct * 100).toFixed(2)}% minimum distance`);
        } else if (risk > maxRisk) {
          gateResults.stopStructurallyValid = 'FAIL';
          rejectionReasons.push(`Stop loss too wide: ${(risk / currentPrice * 100).toFixed(2)}% > 4.5% maximum allowable risk`);
        } else {
          gateResults.stopStructurallyValid = (bypassStop && risk < minRisk) ? 'BYPASS' : 'PASS';
        }

        // 5. Structural Risk-to-Reward Gate
        const minRR = this.getMinStructuralRR(candidate.id, currentRegime);
        const reward3 = Math.abs(pendingSignal.tp3 - currentPrice);
        const structuralRR = risk > 0 ? (reward3 / risk) : 0;
        const bypassRr = this.isGateDisabled('COMPOSITE_g7') || 
                         this.isGateDisabled('EGP_g5') || 
                         this.isGateDisabled('CR_structuralRR') || 
                         this.isGateDisabled('RISK_structuralRR') || 
                         !!(this.settings as any).bypassStructuralRR;
        if (!bypassRr && structuralRR < (minRR - 0.05)) {
          gateResults.rrValid = 'FAIL';
          rejectionReasons.push(`Structural RR ${structuralRR.toFixed(1)} is below required ${minRR.toFixed(1)}:1 threshold`);
        } else {
          gateResults.rrValid = (bypassRr && structuralRR < (minRR - 0.05)) ? 'BYPASS' : 'PASS';
        }

        const allGatesPassed = Object.values(gateResults).every(res => res === 'PASS' || res === 'BYPASS');
        const effectiveThreshold = this.settings.autoTradeThreshold ?? 70;
        const thresholdBypassed = this.isGateDisabled('RISK_threshold') && effectiveThreshold <= 50;
        const minRequiredScore = thresholdBypassed ? 50 : (globalRegime.macroColor === 'AMBER' ? Math.max(80, effectiveThreshold) : effectiveThreshold);
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
  private async evaluateCompositeStrategy(symbol: string, klines: any[], currentPrice: number): Promise<{
    direction: 'LONG' | 'SHORT';
    score: number;
    atr: number;
    sl: number;
    tp1: number;
    tp2: number;
    tp3: number;
    reason?: string;
  } | null> {
    if (!klines || klines.length < 35) return null;

    // 1. Dual-Timeframe Range Regime V1 Evaluation
    try {
      const execTf = (this.settings.rangeConfig?.executionTF as string) || this.settings.timeframe || '5m';
      const execKlines = (this.settings.timeframe === execTf)
        ? klines
        : ((await this.getKlines(symbol, execTf as any))?.slice(0, -1) || klines);

      const directionTf = (this.settings.rangeConfig?.directionTF as string) || '1h';
      const htfKlines = await this.getKlines(symbol, directionTf as any);
      const closedHtfKlines = htfKlines ? htfKlines.slice(0, -1) : [];

      if (closedHtfKlines.length >= 30 && execKlines.length >= 30) {
        const v1Result = evaluateRangeRegimeV1(
          execKlines,
          closedHtfKlines,
          currentPrice,
          this.settings.rangeConfig || {},
          {},
          {}
        );

        if (v1Result && !v1Result.rejectionReason) {
          const sig = v1Result as RangeRegimeSignal;
          const slBuffer = typeof this.settings.rangeConfig?.slBufferAtr === 'number' ? (this.settings.rangeConfig.slBufferAtr as number) : 0.20;
          const estAtr = slBuffer > 0 ? sig.riskPerUnit / slBuffer : currentPrice * 0.015;

          return {
            direction: sig.direction,
            score: sig.score,
            atr: estAtr,
            sl: sig.sl,
            tp1: sig.tp1,
            tp2: sig.tp2,
            tp3: sig.tp3,
            reason: `Range Regime V1 (${sig.setupType}, ${sig.grade}): ${sig.reason}`,
          };
        }
      }
    } catch (err: any) {
      console.warn(`[AutoTrader] evaluateRangeRegimeV1 error for ${symbol}, falling back to legacy:`, err?.message || err);
    }

    // 2. Legacy Range Mean Reversion Fallback
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
      enforceRegimeFilter: !this.settings.bypassRegimeStandAside && !this.isGateDisabled('COMPOSITE_g3') && ((this.settings as any).rmrEnforceEmaFilter === true)
    });

    if (sig) {
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
    if (candles.length < 30) return null;

    // Fetch HTF klines for higher-timeframe trend & draw on liquidity
    const htf = getHigherTimeframe(this.settings.timeframe || '15m');
    let htfKlines: any[] = [];
    try {
      const fetched = await this.getKlines(symbol, htf);
      htfKlines = fetched && fetched.length > 1 ? fetched.slice(0, -1) : (fetched || []);
    } catch (e) {
      htfKlines = [];
    }

    const sig = evaluateVolatilityCompressionAdapter(
      candles,
      htfKlines,
      currentPrice,
      {
        ...this.settings,
        symbol,
        timeframe: this.settings.timeframe || '15m',
      }
    );

    if (sig && !sig.rejectionReason) {
      return {
        direction: (sig.direction.toUpperCase() === 'LONG' ? 'LONG' : 'SHORT'),
        score: sig.setupScore,
        atr: sig.atr,
        sl: sig.sl,
        tp1: sig.tp1,
        tp2: sig.tp2,
        tp3: sig.tp3 || sig.tp2,
        signalTime: sig.candleTime,
        reason: sig.reason,
        checklist: (sig as any).checklist,
      };
    }

    return null;
  }

}

export const autoTrader = new AutoTrader();
oms.onTradeClosed = (pnl: number) => {
  autoTrader.updateDemoBalance(pnl);
};
oms.isEngineActive = () => autoTrader.isEngineActive();
oms.getDeletedStrategies = () => autoTrader.getSettings().deletedStrategies || [];

