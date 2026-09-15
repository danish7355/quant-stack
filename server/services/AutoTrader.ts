import fs from 'fs';
import path from 'path';
import { db } from '../firebase.js';
import { doc, getDoc, setDoc, collection, query, where, getDocs, deleteDoc } from 'firebase/firestore';
import { oms } from './OMS.js';
import { positionMonitor } from './PositionMonitor.js';
import { priceStream } from './PriceStream.js';
import { telegramService } from './TelegramService.js';
import { riskManager } from './RiskManager.js';
import { 
  calculateEMA, calculateATR, detectCompression, detectBreakout, 
  isFakeBreakout, scoreBreakout, applyTrendAndMomentumBonus, determineStopLoss, 
  calculateInitialTp, calculateVcbTargets, validateHigherTimeframeTrend
} from '../../src/utils/strategies/volatilityCompression.js';
import { evaluateTrendPullback } from '../../src/utils/strategies/trendPullback.js';
import { evaluateSmc } from '../../src/utils/strategies/smcLiquidity.js';
import { detectMacroRangeBreakout } from '../../src/utils/strategies/macroRange.js';
import { evaluateEarlyCoilBreakout } from '../../src/utils/strategies/earlyCoilBreakout.js';
import { evaluateRangeMeanReversion } from '../../src/utils/strategies/rangeMeanReversion.js';
import { calculateRSI } from '../../src/utils/indicators.js';
import { 
  DEFAULT_STRATEGY_BUCKET, 
  classifyMarketRegime, 
  getEligibleBucketStrategies, 
  StrategyBucketItem 
} from '../../src/utils/strategyBucket.js';

export interface ServerBotSettings {
  autoTradeEnabled: boolean;
  autoTradeThreshold: number;
  tradeFrequency?: 'LOW' | 'MEDIUM' | 'HIGH';
  activeStrategy: 'BINANCE_COMPOSITE' | 'DELTA_CLIMAX' | 'VOLATILITY_COMPRESSION' | 'TREND_PULLBACK' | 'EARLY_COIL_BREAKOUT' | 'AUTO_REGIME' | string;
  strategyBucket?: StrategyBucketItem[];
  telegramBotToken: string;
  telegramChatId: string;
  binanceApiKey?: string;
  binanceApiSecret?: string;
  binanceTestnet?: boolean;
  leverage: number;
  positionSizePct: number;
  accountRiskPct?: number;
  maxConcurrentTrades: number;
  timeframe: string;
  coinCount?: number;
  scanInterval?: number;
  startingBalance?: number;
  demoBalance?: number;
  equitySnapshots?: any[];
  theme?: string;
  min24hVolume?: number;
  maxFundingRate?: number;
  maxSpread?: number;
  emaFastPeriod?: number;
  emaSlowPeriod?: number;
  emaTrendPeriod?: number;
  emaCrossLookback?: number;
  rsiPeriod?: number;
  rsiLongMin?: number;
  rsiLongMax?: number;
  rsiShortMin?: number;
  rsiShortMax?: number;
  macdFast?: number;
  macdSlow?: number;
  macdSignal?: number;
  adxPeriod?: number;
  adxTrendThreshold?: number;
  superTrendPeriod?: number;
  superTrendMultiplier?: number;
  volumeMultiplier?: number;
  fibLookback?: number;
  atrPeriod?: number;
  dailyLossLimitPct?: number;
  maxDrawdownPct?: number;
  tp1AtrMultiple?: number;
  tp2AtrMultiple?: number;
  tp3FibLevel?: number;
  slAtrMultiple?: number;
  minRRRatio?: number;
  trailingStopActivation?: string;
  trailActivationR?: number;
  timeBasedExitEnabled?: boolean;
  timeBasedExitCandles?: number;
  alertOnNewSignal?: boolean;
  alertOnTradeExecuted?: boolean;
  alertOnTpHit?: boolean;
  alertOnSlHit?: boolean;
  alertOnTsMoved?: boolean;
  alertOnDailyLossLimit?: boolean;
  alertOnRangingDetected?: boolean;
  // Climax Reversal Parameters
  crEnabled?: boolean;
  crClimaxLookback?: number;
  crEmaFast?: number;
  crEmaContext?: number;
  crEmaBaseline?: number;
  crAtrPeriod?: number;
  crMinOverextensionAtr?: number;
  crMinAtrVsAverage?: number;
  crAtrAveragePeriod?: number;
  crMinRejectionWickRatio?: number;
  crMinClimaxRangeRatio?: number;
  crMinStopDistanceAtr?: number;
  crMinRewardRisk?: number;
  [key: string]: any;
}

export class AutoTrader {
  private settings: ServerBotSettings = {
    autoTradeEnabled: true,
    autoTradeThreshold: 75,
    tradeFrequency: 'LOW',
    activeStrategy: 'BINANCE_COMPOSITE',
    strategyBucket: DEFAULT_STRATEGY_BUCKET,
    telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || '',
    telegramChatId: process.env.TELEGRAM_CHAT_ID || '',
    leverage: 5,
    positionSizePct: 3,
    maxConcurrentTrades: 5,
    timeframe: '15m'
  };

  private isRunning = false;
  private loopInterval: NodeJS.Timeout | null = null;
  private klineCache = new Map<string, { time: number; klines: any[] }>();
  private pendingSymbols = new Set<string>();
  private pendingSmcSetups = new Map<string, any>();
  private tradeCooldowns = new Map<string, number>();
  private lastTradedSignal = new Map<string, number>();


  constructor() {
    this.init();
  }

  public async init() {
    await this.loadSettings();
    this.startLoop();
    this.startLogCleanupSchedule();
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
        await deleteDoc(doc(db, 'trade_logs', docSnap.id));
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
          await deleteDoc(doc(db, 'positions', docSnap.id));
          posDeleted++;
        }
      }

      console.log(`🧹 [AutoTrader] Cleanup complete. Deleted ${logsDeleted} trade logs and ${posDeleted} closed positions.`);
    } catch (error) {
      console.error('❌ [AutoTrader] Error cleaning up old logs:', error);
    }
  }

  public async loadSettings(): Promise<ServerBotSettings> {
    try {
      const docSnap = await getDoc(doc(db, 'settings', 'bot_config'));
      if (docSnap.exists()) {
        const data = docSnap.data() as Partial<ServerBotSettings>;
        // Merge data, keeping any existing valid credentials if firestore values are empty
        const updated = { ...this.settings };
        for (const [key, val] of Object.entries(data)) {
          if (val !== undefined && val !== null) {
            (updated as any)[key] = val;
          }
        }
        this.settings = updated;
        if (!this.settings.strategyBucket || this.settings.strategyBucket.length === 0) {
          this.settings.strategyBucket = DEFAULT_STRATEGY_BUCKET;
        }
        if (this.settings.telegramBotToken && this.settings.telegramChatId) {
          telegramService.updateConfig(this.settings.telegramBotToken, this.settings.telegramChatId);
        }
        riskManager.updateSettings(this.settings.dailyLossLimitPct, undefined);
        positionMonitor.settings = this.settings;
      }
    } catch (e) {
      console.warn('AutoTrader: Could not load settings from Firestore, using defaults.');
    }
    return this.settings;
  }

  public async saveSettings(newSettings: Partial<ServerBotSettings>): Promise<ServerBotSettings> {
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
    if (this.settings.telegramBotToken && this.settings.telegramChatId) {
      telegramService.updateConfig(this.settings.telegramBotToken, this.settings.telegramChatId);
    }
    riskManager.updateSettings(this.settings.dailyLossLimitPct, undefined);
        positionMonitor.settings = this.settings;
    try {
      await setDoc(doc(db, 'settings', 'bot_config'), this.settings, { merge: true });
    } catch (e) {
      console.error('AutoTrader: Failed to persist settings to Firestore:', e);
    }
    return this.settings;
  }

  public getSettings(): ServerBotSettings {
    if (!this.settings.strategyBucket || this.settings.strategyBucket.length === 0) {
      this.settings.strategyBucket = DEFAULT_STRATEGY_BUCKET;
    }
    return this.settings;
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
          
          // Enforce Strict 1-2% Risk parameter
          const accountEquity = 10000;
          const riskPct = this.settings.accountRiskPct ? (this.settings.accountRiskPct / 100) : 0.015; // default 1.5%
          const userTargetAlloc = accountEquity * ((this.settings.positionSizePct || 10) / 100);
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
              { maxLeverage: this.settings.leverage || 1, maxAllocation },
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
    if (this.isRunning) return;
    this.isRunning = true;
    priceStream.subscribe((prices, batch) => this.processPendingSMC(prices));

    if (this.loopInterval) clearInterval(this.loopInterval);
    // Background autonomous scan every 5 seconds for sniper execution
    this.loopInterval = setInterval(() => {
      this.runScanCycle();
    }, 5000);

    // Initial run
    setTimeout(() => this.runScanCycle(), 5000);
  }

  private isScanning = false;

  public async runScanCycle() {
    if (!this.settings.autoTradeEnabled) return;
    if (this.isScanning) return;
    this.isScanning = true;

    try {
      const activePositions = positionMonitor.getActivePositions();
      const openCount = activePositions.length;
      
      if (openCount >= this.settings.maxConcurrentTrades) {
        return; // Max concurrent trade limit reached
      }

      // 1. Fetch top volume futures tickers
      const topSymbols = await this.getTopVolumeSymbols(this.settings.coinCount || 25);
      
      for (const symbol of topSymbols) {
        const cooldown = this.tradeCooldowns.get(symbol) || 0;
        const cdLimit = this.getCooldownMs(this.settings.timeframe);
        const inCooldown = (Date.now() - cooldown) < cdLimit;

        if (activePositions.some(p => p.symbol === symbol) || this.pendingSymbols.has(symbol) || inCooldown) {
          continue;
        }

        const currentPrice = priceStream.getPrice(symbol);
        if (!currentPrice || currentPrice <= 0) continue;

        // 2. Fetch recent compact klines (cached 60s for bandwidth efficiency)
        const klines = await this.getKlines(symbol, this.settings.timeframe || '15m');
        if (!klines || klines.length < 50) continue;

        // 3. Technical evaluation
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
          let allocatedBalance = dummyBalance * ((this.settings.positionSizePct || 10) / 100);
          let leverage = this.settings.leverage || 1;
          let quantity = (allocatedBalance * leverage) / currentPrice;

          const finalStrat = (signal as any).strategy || (this.settings.activeStrategy === 'AUTO_REGIME' ? 'BINANCE_COMPOSITE' : this.settings.activeStrategy);
          const marketRegime = (signal as any).marketRegime || null;
          const isAutoRegime = this.settings.activeStrategy === 'AUTO_REGIME' || !!(signal as any).isAutoRegime;

          // If VCB or Early Coil strategy, use Liquidation-Safe dynamic sizing (Section 9)
          if ((finalStrat === 'VOLATILITY_COMPRESSION' || finalStrat === 'EARLY_COIL_BREAKOUT') && signal.sl) {
            const riskPct = (this.settings.accountRiskPct || 1) / 100;
            const userTargetAlloc = dummyBalance * ((this.settings.positionSizePct || 10) / 100);
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
              { maxLeverage: this.settings.leverage || 1, maxAllocation },
              riskPct
            );

            if (sizeResult.rejected || sizeResult.contracts <= 0) {
              console.log(`[AutoTrader] VCB sizing rejected for ${symbol}: ${sizeResult.reason}`);
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
            frequencyPreset: this.settings.tradeFrequency || 'MEDIUM',
            compressionHigh: (signal as any).compressionHigh,
            compressionLow: (signal as any).compressionLow
          })
          .then(async (posId) => {
            if (posId) {
              await positionMonitor.refreshOpenPositions();
              this.tradeCooldowns.set(symbol, Date.now());
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
    console.log(`[AutoTrader] getCooldownMs called with tf="${tf}"`); switch(tf) {
      case '1m': return 60000;
      case '5m': return 300000;
      case '15m': return 900000;
      case '30m': return 1800000;
      case '1H': return 3600000;
      case '2H': return 7200000;
      case '4H': return 14400000;
      case '1D': return 86400000;
      default: return 900000;
    }
  }

  
  private logScanResult(symbol: string, direction: string, passes: boolean, rejectReason: string, price: number, sl: number, tp1: number, score: number) {
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
        strategy_version: 'v2.1_closed_candles'
      }) + '\n';
      fs.appendFileSync(path.join(process.cwd(), 'data', 'scan_logs.jsonl'), logLine);
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

      const usdtPairs = data
        .filter((d: any) => d.symbol.endsWith('USDT') && !d.symbol.includes('_'))
        .filter((d: any) => parseFloat(d.quoteVolume || '0') >= minVolume)
        .sort((a: any, b: any) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume))
        .slice(0, limit)
        .map((d: any) => d.symbol);
      return usdtPairs.length > 0 ? usdtPairs : ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];
    } catch (e) {
      return ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];
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

      // 120 candles provides enough lookback for percentiles, EMAs, and pivot analysis
      const res = await fetch(`https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=120`);
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
        volume: parseFloat(k[5])
      }));

      this.klineCache.set(cacheKey, { time: now, klines });
      return klines;
    } catch (e) {
      return [];
    }
  }

  private async evaluateSignal(symbol: string, klines: any[], currentPrice: number): Promise<{
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

    // 0. Auto Regime-Adaptive Strategy Selection
    if (this.settings.activeStrategy === 'AUTO_REGIME') {
      return await this.evaluateAutoRegimeSignal(symbol, klines, currentPrice);
    }

    // 1. If user selected DELTA_CLIMAX strategy, run Climax Reversal algorithm
    if (this.settings.activeStrategy === 'DELTA_CLIMAX') {
      const sig = this.evaluateClimaxReversal(klines, currentPrice);
      if (!sig) return null;
      return { ...sig, strategy: 'DELTA_CLIMAX', marketRegime: 'Exhaustion Climax' };
    }
    
    // 2. If user selected VOLATILITY_COMPRESSION strategy, run VCB algorithm with HTF alignment
    if (this.settings.activeStrategy === 'VOLATILITY_COMPRESSION') {
      const sig = await this.evaluateVolatilityCompression(symbol, klines, currentPrice);
      if (!sig) return null;
      return { ...sig, strategy: 'VOLATILITY_COMPRESSION', marketRegime: 'Consolidation Squeeze' };
    }
    
    // 3. If user selected TREND_PULLBACK strategy
    if (this.settings.activeStrategy === 'EARLY_COIL_BREAKOUT') {
      const sig = evaluateEarlyCoilBreakout(klines, this.settings as any);
      if (!sig) return null;
      return { ...sig, strategy: 'EARLY_COIL_BREAKOUT', marketRegime: 'Fractal Breakout' };
    }

    if (this.settings.activeStrategy === 'TREND_PULLBACK') {
      const signal = evaluateTrendPullback(klines, currentPrice, this.settings as any);
      if (!signal) return null;
      return { ...signal, strategy: 'TREND_PULLBACK', marketRegime: 'Trending [EMA Pullback]' };
    }

    if (this.settings.activeStrategy === 'MACRO_RANGE_BREAKOUT') {
      const atrSeries = calculateATR(klines, 14);
      const currentAtr = atrSeries[atrSeries.length - 1];
      const sig = detectMacroRangeBreakout(klines, currentPrice, currentAtr);
      if (!sig) return null;
      return { ...sig, strategy: 'MACRO_RANGE_BREAKOUT', marketRegime: 'Macro Accumulation' };
    }

    // 5. SMC Liquidity Sweep
    if (this.settings.activeStrategy === 'SMC_LIQUIDITY_SWEEP') {
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

    // 4. Default: Ranging 1:3 R:R Mean-Reversion Strategy (Bollinger Bands + RSI Re-entry)
    const compSig = this.evaluateCompositeStrategy(klines, currentPrice);
    if (!compSig) return null;
    return { ...compSig, strategy: 'BINANCE_COMPOSITE', marketRegime: 'Ranging [1:3 R:R Mean-Reversion]' };
  }

  /**
   * Regime Filter & Strategy Bucket Selection:
   * Restricts the bot to ONLY pick from strategies configured in the user's Strategy Bucket.
   * Classifies current market regime (trending, ranging, exhaustion, breakout, or not_tradable).
   * Runs enabled bucket strategies in order of user priority.
   */
  private async evaluateAutoRegimeSignal(symbol: string, klines: any[], currentPrice: number): Promise<{
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
    if (klines.length < 35) return null;

    // 1. Detect current market regime via statistical filter
    const classification = classifyMarketRegime(klines, currentPrice);
    const currentRegime = classification.regime;

    // If market regime is not tradable (dead volume, untradable chop), sit flat in cash!
    if (currentRegime === 'not_tradable') {
      return null;
    }

    // 2. Fetch user's Strategy Bucket (fallback to DEFAULT_STRATEGY_BUCKET if not configured)
    const bucket: StrategyBucketItem[] = (this.settings.strategyBucket && this.settings.strategyBucket.length > 0)
      ? this.settings.strategyBucket
      : DEFAULT_STRATEGY_BUCKET;

    // 3. Filter bucket: candidate strategies must be both ENABLED and designated for this regime
    const eligibleCandidates = getEligibleBucketStrategies(bucket, currentRegime);
    if (eligibleCandidates.length === 0) {
      // User has not enabled any strategies for this market regime
      return null;
    }

    // 4. Evaluate eligible strategies in order of user priority (Priority 1 = highest)
    for (const candidate of eligibleCandidates) {
      // DELTA CLIMAX REVERSAL
      if (candidate.id === 'DELTA_CLIMAX') {
        const climaxSignal = this.evaluateClimaxReversal(klines, currentPrice);
        if (climaxSignal && climaxSignal.score >= this.settings.autoTradeThreshold) {
          return {
            ...climaxSignal,
            strategy: 'DELTA_CLIMAX',
            marketRegime: classification.label,
            isAutoRegime: true,
            reason: `[Auto Bucket #${candidate.priority}] DELTA_CLIMAX selected for ${classification.label} (${classification.details})`
          };
        }
      }

      // SMC LIQUIDITY SWEEP
      if (candidate.id === 'SMC_LIQUIDITY_SWEEP') {
        try {
          const htfCandles = await this.getKlines(symbol, '1h');
          const smcSig = evaluateSmc(klines, htfCandles, currentPrice);
          if (smcSig && smcSig.score >= this.settings.autoTradeThreshold) {
            const inZone = Math.abs(currentPrice - smcSig.entryPrice) / smcSig.entryPrice < 0.001;
            if (inZone) {
              const risk = Math.abs(currentPrice - smcSig.sl);
              return {
                direction: smcSig.direction,
                score: 95,
                atr: risk,
                sl: smcSig.sl,
                tp1: smcSig.tp1,
                tp2: smcSig.direction === 'LONG' ? currentPrice + (risk * 3) : currentPrice - (risk * 3),
                tp3: smcSig.direction === 'LONG' ? currentPrice + (risk * 5) : currentPrice - (risk * 5),
                strategy: 'SMC_LIQUIDITY_SWEEP',
                marketRegime: classification.label,
                isAutoRegime: true,
                reason: `[Auto Bucket #${candidate.priority}] SMC selected for ${classification.label}: ${smcSig.reason}`
              };
            }
            const expiryTime = Date.now() + (15 * 60 * 1000 * 6);
            this.pendingSmcSetups.set(symbol, { ...smcSig, expiryTime });
          }
        } catch(e) {}
      }

      // TREND PULLBACK
      if (candidate.id === 'TREND_PULLBACK') {
        const pullbackSignal = evaluateTrendPullback(klines, currentPrice, this.settings as any);
        if (pullbackSignal && pullbackSignal.score >= this.settings.autoTradeThreshold) {
          return {
            ...pullbackSignal,
            strategy: 'TREND_PULLBACK',
            marketRegime: classification.label,
            isAutoRegime: true,
            reason: `[Auto Bucket #${candidate.priority}] TREND_PULLBACK selected for ${classification.label} (${classification.details})`
          };
        }
      }

      // MACRO RANGE BREAKOUT (Darvas Box)
      if (candidate.id === 'MACRO_RANGE_BREAKOUT') {
        const currentAtr = classification.metrics.atr;
        const macroSignal = detectMacroRangeBreakout(klines, currentPrice, currentAtr);
        if (macroSignal && macroSignal.score >= this.settings.autoTradeThreshold) {
          return {
            ...macroSignal,
            strategy: 'MACRO_RANGE_BREAKOUT',
            marketRegime: classification.label,
            isAutoRegime: true,
            reason: `[Auto Bucket #${candidate.priority}] MACRO_RANGE_BREAKOUT selected for ${classification.label} (Darvas Box Breakout)`
          };
        }
      }

      // VOLATILITY COMPRESSION BREAKOUT (VCB)
      if (candidate.id === 'VOLATILITY_COMPRESSION') {
        const vcbSignal = await this.evaluateVolatilityCompression(symbol, klines, currentPrice);
        if (vcbSignal && vcbSignal.score >= this.settings.autoTradeThreshold) {
          return {
            ...vcbSignal,
            strategy: 'VOLATILITY_COMPRESSION',
            marketRegime: classification.label,
            isAutoRegime: true,
            reason: `[Auto Bucket #${candidate.priority}] VOLATILITY_COMPRESSION selected for ${classification.label} (Squeeze Release)`
          };
        }
      }

      // EARLY COIL BREAKOUT
      if (candidate.id === 'EARLY_COIL_BREAKOUT') {
        const coilSignal = evaluateEarlyCoilBreakout(klines, this.settings as any);
        if (coilSignal && coilSignal.score >= this.settings.autoTradeThreshold) {
          return {
            ...coilSignal,
            strategy: 'EARLY_COIL_BREAKOUT',
            marketRegime: classification.label,
            isAutoRegime: true,
            reason: `[Auto Bucket #${candidate.priority}] EARLY_COIL_BREAKOUT selected for ${classification.label} (Fractal Breakout)`
          };
        }
      }

      // RANGING 1:3 R:R MEAN-REVERSION (BINANCE_COMPOSITE)
      if (candidate.id === 'BINANCE_COMPOSITE') {
        const compositeSignal = this.evaluateCompositeStrategy(klines, currentPrice);
        if (compositeSignal && compositeSignal.score >= this.settings.autoTradeThreshold) {
          return {
            ...compositeSignal,
            strategy: 'BINANCE_COMPOSITE',
            marketRegime: classification.label,
            isAutoRegime: true,
            reason: `[Auto Bucket #${candidate.priority}] Ranging 1:3 R:R selected for ${classification.label} (BB+RSI Mean-Reversion)`
          };
        }
      }
    }

    // STRICT DISCIPLINE: No fallback forcing outside the bucket or regime!
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
      bbPeriod: (this.settings as any).bbPeriod || 20,
      bbStdDev: (this.settings as any).bbStdDev || 2.0,
      rsiPeriod: this.settings.rsiPeriod || 14,
      rsiOversold: (this.settings as any).rsiLongMin || 30,
      rsiOverbought: (this.settings as any).rsiLongMax || 70,
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
    const cClosed = candles[lastIdx - 1];
    const cPrev = candles[lastIdx - 2];

    // Compute ATR
    let atrSum = 0;
    for (let i = lastIdx - 14; i < lastIdx; i++) {
      if (i <= 0) continue;
      const h = candles[i].high;
      const l = candles[i].low;
      const prevC = candles[i - 1].close;
      atrSum += Math.max(h - l, Math.abs(h - prevC), Math.abs(l - prevC));
    }
    const atr = Math.max(atrSum / 14, currentPrice * 0.01);

    // 20-period average volume
    const volSlice = candles.slice(Math.max(0, lastIdx - lookback - 1), lastIdx - 1);
    const avgVol = volSlice.reduce((s, c) => s + (c.volume || 0), 0) / (volSlice.length || 1);

    // Recent Swing High / Low over last 25 bars
    const recentCandles = candles.slice(Math.max(0, lastIdx - 25), lastIdx - 1);
    const highestHigh = Math.max(...recentCandles.map(c => c.high));
    const lowestLow = Math.min(...recentCandles.map(c => c.low));

    // Pure Setup Check: Statistical Overextension from EMA50
    // A climax reversal ONLY occurs after extreme exhaustion away from mean value (>= 1.6 ATR)
    const closes = candles.map(c => c.close);
    const ema50Series = calculateEMA(closes, 50);
    const ema50 = ema50Series[lastIdx - 1] || currentPrice;

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
  } | null> {
    if (candles.length < 35) return null;
    
    // Clone array so we don't mutate cached references
    const candlesCopy = candles.map(c => ({ ...c }));
    
    // Inject live tick price into last candle
    const lastCandle = candlesCopy[candlesCopy.length - 1];
    lastCandle.close = currentPrice;
    lastCandle.high = Math.max(lastCandle.high, currentPrice);
    lastCandle.low = Math.min(lastCandle.low, currentPrice);

    const previousCandles = candlesCopy.slice(0, -1);
    
    const atrSeries = calculateATR(previousCandles, 14);
    const atr = atrSeries[atrSeries.length - 1] || currentPrice * 0.015;
    const atrAvg = atrSeries.slice(-50).reduce((a, b) => a + b, 0) / 50;
    
    const settingsObj: any = this.settings; 
    
    // Pure Setup + Volume Detection
    const compression = detectCompression(previousCandles, atr, atrAvg, settingsObj);
    const breakout = detectBreakout(lastCandle, compression, atr, settingsObj, candlesCopy);
    
    if (!breakout) return null;
    
    // Score based on breakout metrics and volume expansion
    let score = scoreBreakout(breakout, settingsObj);
    
    // Apply trend and momentum alignment bonus/penalty
    const closes = candlesCopy.map(c => c.close);
    const ema9 = calculateEMA(closes, 9).pop() || 0;
    const ema21 = calculateEMA(closes, 21).pop() || 0;
    const ema50 = calculateEMA(closes, 50).pop() || 0;
    const rsi = calculateRSI(closes, 14).pop() || 50;
    score = applyTrendAndMomentumBonus(score, breakout.direction as 'LONG'|'SHORT', ema9, ema21, ema50, rsi, settingsObj);

    if (score < this.settings.autoTradeThreshold) return null;
    
    const sl = determineStopLoss(breakout.direction as 'LONG'|'SHORT', compression, atr, settingsObj, candlesCopy, currentPrice);
    const risk = Math.abs(currentPrice - sl);
    if (risk <= 0) return null;

    // Asymmetric Volatility Expansion targets (10x-15% runner potential)
    const { tp1, tp2, tp3 } = calculateVcbTargets(currentPrice, breakout.direction as 'LONG'|'SHORT', risk, compression);
    
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
      signalTime: lastCandle.time,
      reason: `VCB Breakout Inception (RVOL: ${breakout.rvol.toFixed(1)}x, Squeeze: ${compression.isSqueezed ? 'YES' : 'ATR'})`
    };
  }
}

export const autoTrader = new AutoTrader();
oms.onTradeClosed = (pnl: number) => {
  autoTrader.updateDemoBalance(pnl);
};
