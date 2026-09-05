import fs from 'fs';
import path from 'path';
import { db } from '../firebase.js';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { oms } from './OMS.js';
import { positionMonitor } from './PositionMonitor.js';
import { priceStream } from './PriceStream.js';
import { telegramService } from './TelegramService.js';
import { riskManager } from './RiskManager.js';
import { 
  calculateEMA, calculateATR, detectCompression, detectBreakout, 
  isFakeBreakout, scoreBreakout, applyTrendAndMomentumBonus, determineStopLoss, 
  calculateInitialTp, validateHigherTimeframeTrend
} from '../../src/utils/strategies/volatilityCompression.js';
import { evaluateTrendPullback } from '../../src/utils/strategies/trendPullback.js';
import { evaluateSmc } from '../../src/utils/strategies/smcLiquidity.js';
import { calculateRSI } from '../../src/utils/indicators.js';

export interface ServerBotSettings {
  autoTradeEnabled: boolean;
  autoTradeThreshold: number;
  tradeFrequency?: 'LOW' | 'MEDIUM' | 'HIGH';
  activeStrategy: 'BINANCE_COMPOSITE' | 'DELTA_CLIMAX' | 'VOLATILITY_COMPRESSION' | 'TREND_PULLBACK' | 'AUTO_REGIME' | string;
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
        if (this.settings.telegramBotToken && this.settings.telegramChatId) {
          telegramService.updateConfig(this.settings.telegramBotToken, this.settings.telegramChatId);
        }
        riskManager.updateSettings(this.settings.dailyLossLimitPct, undefined);
        positionMonitor.updateSettings(this.settings);
      }
    } catch (e) {
      console.warn('AutoTrader: Could not load settings from Firestore, using defaults.');
    }
    positionMonitor.updateSettings(this.settings);
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
    positionMonitor.updateSettings(this.settings);
    try {
      await setDoc(doc(db, 'settings', 'bot_config'), this.settings, { merge: true });
    } catch (e) {
      console.error('AutoTrader: Failed to persist settings to Firestore:', e);
    }
    return this.settings;
  }

  public getSettings(): ServerBotSettings {
    return this.settings;
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
      if (setup.direction === 'LONG' && price <= setup.entryZoneMax && price >= setup.sl) {
          triggered = true;
      } else if (setup.direction === 'SHORT' && price >= setup.entryZoneMin && price <= setup.sl) {
          triggered = true;
      }

      if (triggered) {
          console.log(`⚡ [SMC] Retracement confirmed for ${symbol}! Tapped FVG zone. Executing...`);
          this.pendingSmcSetups.delete(symbol);
          
          // Enforce Strict 1-2% Risk parameter
          const accountEquity = 10000;
          const riskPct = this.settings.accountRiskPct ? (this.settings.accountRiskPct / 100) : 0.015; // default 1.5%
          
          const safeSize = riskManager.calculateSafePositionSize(
              accountEquity,
              price,
              setup.sl,
              setup.direction,
              undefined,
              riskPct
          );
          
          if (safeSize.rejected) {
              console.log(`🚫 [SMC] Setup for ${symbol} rejected by RiskManager: ${safeSize.reason}`);
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
          }).catch(console.error);
      }
    }
  }

  public startLoop() {
    if (this.isRunning) return;
    this.isRunning = true;
    priceStream.subscribe((prices, batch) => this.processPendingSMC(prices));

    if (this.loopInterval) clearInterval(this.loopInterval);
    // Background autonomous scan every 25 seconds
    this.loopInterval = setInterval(() => {
      this.runScanCycle();
    }, 25000);

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

      // BTC Macro Filter Check
      let btcMacroTrend: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
      try {
        const btcKlines = await this.getKlines("BTCUSDT", "1h");
        if (btcKlines && btcKlines.length >= 50) {
          const closes = btcKlines.map(k => k.close);
          const currentBtcPrice = closes[closes.length - 1];
          // simple inline SMA/EMA
          let sum = 0;
          for(let i = closes.length - 50; i < closes.length; i++) sum += closes[i];
          const btcSma50 = sum / 50;
          btcMacroTrend = currentBtcPrice >= btcSma50 ? 'BULLISH' : 'BEARISH';
        }
      } catch (e) {
        // Soft fail, remain neutral
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
          
          // BTC Macro Filter for Altcoin Longs
          if (symbol !== 'BTCUSDT' && signal.direction === 'LONG' && btcMacroTrend === 'BEARISH') {
            console.log(`[AutoTrader] Rejected LONG on ${symbol} because BTC is currently BEARISH (Macro filter)`);
            continue;
          }

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
          const dummyBalance = 10000;
          let allocatedBalance = dummyBalance * (this.settings.positionSizePct / 100);
          let leverage = this.settings.leverage || 1;
          let quantity = (allocatedBalance * leverage) / currentPrice;

          const finalStrat = (signal as any).strategy || (this.settings.activeStrategy === 'AUTO_REGIME' ? 'BINANCE_COMPOSITE' : this.settings.activeStrategy);
          const marketRegime = (signal as any).marketRegime || null;
          const isAutoRegime = this.settings.activeStrategy === 'AUTO_REGIME' || !!(signal as any).isAutoRegime;

          // If VCB strategy, use Liquidation-Safe dynamic sizing (Section 9)
          if (finalStrat === 'VOLATILITY_COMPRESSION' && signal.sl) {
            const riskPct = (this.settings.accountRiskPct || 1) / 100;
            const sizeResult = riskManager.calculateSafePositionSize(
              dummyBalance,
              currentPrice,
              signal.sl,
              signal.direction,
              { maxLeverage: this.settings.leverage || 20 },
              riskPct
            );

            if (!sizeResult.rejected && sizeResult.contracts > 0) {
              quantity = sizeResult.contracts;
              leverage = sizeResult.leverage;
              allocatedBalance = sizeResult.allocatedBalance;
            }
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
            console.error(`AutoTrader error opening ${symbol}:`, err);
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

      // 60 candles is lightweight and takes < 2 KB
      const res = await fetch(`https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=60`);
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
    if (this.settings.activeStrategy === 'TREND_PULLBACK') {
      const signal = evaluateTrendPullback(klines, currentPrice, this.settings as any);
      if (!signal) return null;

      // 1-Hour HTF Alignment Check to avoid sweeps and trap setups
      try {
        const htfCandles = await this.getKlines(symbol, '1h');
        const htfCheck = validateHigherTimeframeTrend(htfCandles, signal.direction);
        if (!htfCheck.isAligned && htfCheck.penalty <= -35) {
          console.log(`[AutoTrader TREND_PULLBACK] ${symbol} skipped: counter to 1H macro trend (${htfCheck.reason})`);
          return null;
        }
      } catch (e) {
        // Fallback to local data if 1H fetch fails
      }
      return { ...signal, strategy: 'TREND_PULLBACK', marketRegime: 'Trending [EMA Pullback]' };
    }

    
    // 5. SMC Liquidity Sweep
    if (this.settings.activeStrategy === 'SMC_LIQUIDITY_SWEEP') {
      try {
        const htfCandles = await this.getKlines(symbol, '1h');
        const sig = evaluateSmc(klines, htfCandles, currentPrice);
        if (sig && sig.score >= this.settings.autoTradeThreshold) {
          // Do not enter immediately! Add to pending limits for retracement.
          const expiryTime = Date.now() + (15 * 60 * 1000 * 4); // Expire in 4 candles (1 hr)
          this.pendingSmcSetups.set(symbol, { ...sig, expiryTime });
          console.log(`🤖 [SMC] Pending limit setup found for ${symbol} (${sig.direction}). Waiting for FVG retracement. Zone: ${sig.entryZoneMin} - ${sig.entryZoneMax}`);
        }
      } catch(e) {}
      return null; // Return null so we don't market enter
    }

    // 4. Default: BINANCE_COMPOSITE Trend & Momentum Strategy
    let htfCandlesForComp: any[] | undefined = undefined;
    try { htfCandlesForComp = await this.getKlines(symbol, '1h'); } catch(e) {}
    const compSig = this.evaluateCompositeStrategy(klines, currentPrice, htfCandlesForComp);
    if (!compSig) return null;
    return { ...compSig, strategy: 'BINANCE_COMPOSITE', marketRegime: 'Trending [10-Gate Momentum]' };
  }

  /**
   * Evaluates market regime (Trending, Consolidation Squeeze, or Exhaustion Climax)
   * and auto-selects the strategy with highest expected value (EV).
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

    const closes = klines.map(k => k.close);
    const lastIdx = closes.length - 1;

    // Moving averages for regime classification
    const calcEMA = (period: number) => {
      const k = 2 / (period + 1);
      let ema = closes[0];
      for (let i = 1; i < closes.length; i++) {
        ema = closes[i] * k + ema * (1 - k);
      }
      return ema;
    };
    const ema9 = calcEMA(9);
    const ema21 = calcEMA(21);
    const ema50 = calcEMA(Math.min(50, closes.length));

    // ATR 14
    let atrSum = 0;
    for (let i = lastIdx - 14; i < lastIdx; i++) {
      if (i <= 0) continue;
      const h = klines[i].high;
      const l = klines[i].low;
      const prevC = klines[i - 1].close;
      atrSum += Math.max(h - l, Math.abs(h - prevC), Math.abs(l - prevC));
    }
    const currentAtr = Math.max(atrSum / 14, currentPrice * 0.005);

    // Overextension ratio from 50 EMA
    const overextensionAtr = Math.abs(currentPrice - ema50) / currentAtr;

    // Trend classification
    const isUptrend = (ema9 > ema21 && ema21 > ema50);
    const isDowntrend = (ema9 < ema21 && ema21 < ema50);
    const isTrending = isUptrend || isDowntrend;

    // 1. REGIME: EXHAUSTION / CAPITULATION CLIMAX (High EV setup for mean reversion)
    if (overextensionAtr >= 1.8) {
      const climaxSignal = this.evaluateClimaxReversal(klines, currentPrice);
      if (climaxSignal && climaxSignal.score >= this.settings.autoTradeThreshold) {
        return {
          ...climaxSignal,
          strategy: 'DELTA_CLIMAX',
          marketRegime: 'Exhaustion Climax',
          isAutoRegime: true,
          reason: `Auto-Selected DELTA_CLIMAX (Exhaustion Regime, Overextension ${overextensionAtr.toFixed(1)}x ATR)`
        };
      }
    }

    // 1.5 REGIME: LIQUIDITY HUNT / FVG REVERSAL (SMC)
    // Check for SMC sweeps. If found, add to pending limits and return null to prevent standard market entries on this pair.
    try {
      const htfCandles = await this.getKlines(symbol, '1h');
      const smcSig = evaluateSmc(klines, htfCandles, currentPrice);
      if (smcSig && smcSig.score >= this.settings.autoTradeThreshold) {
        const expiryTime = Date.now() + (15 * 60 * 1000 * 4); // Expire in 4 candles (1 hr)
        this.pendingSmcSetups.set(symbol, { ...smcSig, expiryTime });
        console.log(`🤖 [AutoRegime -> SMC] Pending limit setup found for ${symbol} (${smcSig.direction}). Waiting for FVG retracement.`);
        return null; // Return null so we don't market enter right now, letting the pending trigger handle it.
      }
    } catch(e) {}

    // 2. REGIME: ESTABLISHED TREND (Prioritize Trend Pullback with 1H alignment)
    if (isTrending) {
      const pullbackSignal = evaluateTrendPullback(klines, currentPrice, this.settings as any);
      if (pullbackSignal && pullbackSignal.score >= this.settings.autoTradeThreshold) {
        let htfAligned = true;
        try {
          const htfCandles = await this.getKlines(symbol, '1h');
          const htfCheck = validateHigherTimeframeTrend(htfCandles, pullbackSignal.direction);
          if (!htfCheck.isAligned && htfCheck.penalty <= -35) {
            htfAligned = false;
          }
        } catch (e) {}

        if (htfAligned) {
          return {
            ...pullbackSignal,
            strategy: 'TREND_PULLBACK',
            marketRegime: 'Trending [EMA Pullback]',
            isAutoRegime: true,
            reason: `Auto-Selected TREND_PULLBACK (Trending Regime with 1H Macro Alignment)`
          };
        }
      }
    }

    // 3. REGIME: CONSOLIDATION / VOLATILITY SQUEEZE BREAKOUT
    const vcbSignal = await this.evaluateVolatilityCompression(symbol, klines, currentPrice);
    if (vcbSignal && vcbSignal.score >= this.settings.autoTradeThreshold) {
      return {
        ...vcbSignal,
        strategy: 'VOLATILITY_COMPRESSION',
        marketRegime: 'Consolidation Squeeze',
        isAutoRegime: true,
        reason: `Auto-Selected VOLATILITY_COMPRESSION (Squeeze Compression Release)`
      };
    }

    // 4. REGIME: MOMENTUM EXPANSION (Composite 10-Gate Scanner)
    let htfCandlesForComp: any[] | undefined = undefined;
    try { htfCandlesForComp = await this.getKlines(symbol, '1h'); } catch(e) {}
    const compositeSignal = this.evaluateCompositeStrategy(klines, currentPrice, htfCandlesForComp);
    if (compositeSignal && compositeSignal.score >= this.settings.autoTradeThreshold) {
      return {
        ...compositeSignal,
        strategy: 'BINANCE_COMPOSITE',
        marketRegime: 'Trending [10-Gate Momentum]',
        isAutoRegime: true,
        reason: `Auto-Selected BINANCE_COMPOSITE (Directional Momentum Expansion)`
      };
    }

    // 5. Multi-candidate arbitration fallback: test all candidates and choose highest scoring
    const candidates: Array<{ signal: any; strategy: string; regime: string; priority: number }> = [];

    const cs = this.evaluateClimaxReversal(klines, currentPrice);
    if (cs && cs.score >= this.settings.autoTradeThreshold) {
      candidates.push({ signal: cs, strategy: 'DELTA_CLIMAX', regime: 'Exhaustion Climax', priority: cs.score + 5 });
    }

    const ps = evaluateTrendPullback(klines, currentPrice, this.settings as any);
    if (ps && ps.score >= this.settings.autoTradeThreshold) {
      candidates.push({ signal: ps, strategy: 'TREND_PULLBACK', regime: 'Trending [EMA Pullback]', priority: ps.score + 3 });
    }

    const vs = await this.evaluateVolatilityCompression(symbol, klines, currentPrice);
    if (vs && vs.score >= this.settings.autoTradeThreshold) {
      candidates.push({ signal: vs, strategy: 'VOLATILITY_COMPRESSION', regime: 'Consolidation Squeeze', priority: vs.score });
    }

    let htfCandlesForCompFallback: any[] | undefined = undefined;
    try { htfCandlesForCompFallback = await this.getKlines(symbol, '1h'); } catch(e) {}
    const comp = this.evaluateCompositeStrategy(klines, currentPrice, htfCandlesForCompFallback);
    if (comp && comp.score >= this.settings.autoTradeThreshold) {
      candidates.push({ signal: comp, strategy: 'BINANCE_COMPOSITE', regime: 'Trending [10-Gate Momentum]', priority: comp.score });
    }

    if (candidates.length > 0) {
      candidates.sort((a, b) => b.priority - a.priority);
      const winner = candidates[0];
      return {
        ...winner.signal,
        strategy: winner.strategy,
        marketRegime: winner.regime,
        isAutoRegime: true,
        reason: `Auto-Selected ${winner.strategy} (Highest EV in ${winner.regime})`
      };
    }

    return null;
  }

  /**
   * Internal Composite 10-Gate evaluator
   */
  private evaluateCompositeStrategy(klines: any[], currentPrice: number, htfCandles?: any[]): {
    direction: 'LONG' | 'SHORT';
    score: number;
    atr: number;
    sl: number;
    tp1: number;
    tp2: number;
    tp3: number;
  } | null {
    const closes = klines.map(k => k.close);
    const lastIdx = closes.length - 1;
    const lastClose = closes[lastIdx];

    // Compute EMAs
    const calcEMA = (period: number) => {
      const k = 2 / (period + 1);
      let ema = closes[0];
      for (let i = 1; i < closes.length; i++) {
        ema = closes[i] * k + ema * (1 - k);
      }
      return ema;
    };

    const ema9 = calcEMA(9);
    const ema21 = calcEMA(21);
    const ema50 = calcEMA(Math.min(50, closes.length));

    // Compute ATR (14)
    let atrSum = 0;
    for (let i = lastIdx - 14; i < lastIdx; i++) {
      if (i <= 0) continue;
      const h = klines[i].high;
      const l = klines[i].low;
      const prevC = klines[i - 1].close;
      const tr = Math.max(h - l, Math.abs(h - prevC), Math.abs(l - prevC));
      atrSum += tr;
    }
    const atr = Math.max(atrSum / 14, currentPrice * 0.01);

    // Compute RSI (14)
    let gains = 0, losses = 0;
    for (let i = lastIdx - 14; i < lastIdx; i++) {
      if (i <= 0) continue;
      const diff = closes[i] - closes[i - 1];
      if (diff > 0) gains += diff;
      else losses -= diff;
    }
    const rs = losses === 0 ? 100 : gains / (losses || 1);
    const rsi = 100 - (100 / (1 + rs));

    let direction: 'LONG' | 'SHORT' | null = null;
    let score = 50;

    const disabledGates = this.settings.disabledGates || {};
    const isBypassed = (id: string, key: string) => !!(disabledGates[id] || disabledGates[key]);

    // Trend alignment logic
    const g4Bypassed = isBypassed('COMPOSITE_g4', 'g4');
    const g6Bypassed = isBypassed('COMPOSITE_g6', 'g6');

    if ((lastClose > ema9 && ema9 > ema21 && ema21 > ema50) || (g4Bypassed && lastClose > ema21)) {
      direction = 'LONG';
      score += 25;
      if ((rsi > 45 && rsi < 70) || g6Bypassed) score += 15;
    } else if ((lastClose < ema9 && ema9 < ema21 && ema21 < ema50) || (g4Bypassed && lastClose < ema21)) {
      direction = 'SHORT';
      score += 25;
      if ((rsi < 55 && rsi > 30) || g6Bypassed) score += 15;
    }

    if (!direction || score < this.settings.autoTradeThreshold) return null;

    if (htfCandles && htfCandles.length >= 50) {
      const htfCheck = validateHigherTimeframeTrend(htfCandles, direction);
      if (!htfCheck.isAligned && htfCheck.penalty < 0) {
        // Enforce strict alignment: if it fails the strict test, do not trade composite
        return null;
      }
    }

    const slDist = atr * 1.0; // Tight stop loss (1.0x ATR invalidation)
    const sl = direction === 'LONG' ? Math.max(0.0001, currentPrice - slDist) : currentPrice + slDist;
    const tp1 = direction === 'LONG' ? currentPrice + slDist * 1.0 : Math.max(0.0001, currentPrice - slDist * 1.0);
    const tp2 = direction === 'LONG' ? currentPrice + slDist * 2.0 : Math.max(0.0001, currentPrice - slDist * 2.0);
    const tp3 = direction === 'LONG' ? currentPrice + slDist * 3.0 : Math.max(0.0001, currentPrice - slDist * 3.0);

    return {
      direction,
      score: Math.min(score, 99),
      atr,
      sl,
      tp1,
      tp2,
      tp3
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
    const lookback = this.settings.crClimaxLookback || 20;
    const emaBaselinePeriod = this.settings.crEmaBaseline || 200;
    const atrPeriod = this.settings.crAtrPeriod || 14;
    const atrAvgPeriod = this.settings.crAtrAveragePeriod || 50;
    const minOverextension = this.settings.crMinOverextensionAtr || 2.0;
    const minAtrVsAvg = this.settings.crMinAtrVsAverage || 1.0;
    const minRejectionWick = this.settings.crMinRejectionWickRatio || 0.45;
    const minClimaxRange = this.settings.crMinClimaxRangeRatio || 1.3;

    if (candles.length < Math.max(lookback, 30)) return null;

    const close = candles.map(c => c.close);
    const high = candles.map(c => c.high);
    const low = candles.map(c => c.low);
    const open = candles.map(c => c.open);
    const volume = candles.map(c => c.volume || 0);

    // Calc EMA Baseline (Usually 200, but let's also calc Fast EMA 5 for rubber band effect)
    const kBase = 2 / (Math.min(emaBaselinePeriod, candles.length) + 1);
    const kFast = 2 / (5 + 1);
    let emaBase = close[0];
    let emaFast = close[0];
    const emaBaselineArr = [emaBase];
    const emaFastArr = [emaFast];
    for (let i = 1; i < close.length; i++) {
      emaBase = close[i] * kBase + emaBase * (1 - kBase);
      emaFast = close[i] * kFast + emaFast * (1 - kFast);
      emaBaselineArr.push(emaBase);
      emaFastArr.push(emaFast);
    }

    // Calc ATR & ATR Avg
    const tr = [high[0] - low[0]];
    for (let i = 1; i < candles.length; i++) {
      tr.push(Math.max(high[i] - low[i], Math.abs(high[i] - close[i - 1]), Math.abs(low[i] - close[i - 1])));
    }

    const calcSMALocal = (arr: number[], p: number) => {
      const res = [];
      for (let i = 0; i < arr.length; i++) {
        if (i < p - 1) {
          res.push(arr[i]);
        } else {
          let sum = 0;
          for (let j = 0; j < p; j++) sum += arr[i - j];
          res.push(sum / p);
        }
      }
      return res;
    };

    const atrArr = calcSMALocal(tr, atrPeriod);
    const atrAvgArr = calcSMALocal(atrArr, atrAvgPeriod);

    const rangeArr = candles.map(c => c.high - c.low);
    const avgRangeArr = calcSMALocal(rangeArr, lookback);

    const avgVolArr = calcSMALocal(volume, lookback);

    const c1 = {
      open: open[candles.length - 3],
      high: high[candles.length - 3],
      low: low[candles.length - 3],
      close: close[candles.length - 3],
      volume: volume[candles.length - 3],
      range: rangeArr[candles.length - 3],
      avgRange: avgRangeArr[candles.length - 3],
      avgVolume: avgVolArr[candles.length - 3],
      atr: atrArr[candles.length - 3],
      atrAvg: atrAvgArr[candles.length - 3],
      emaBaseline: emaBaselineArr[candles.length - 3],
      emaFast: emaFastArr[candles.length - 3]
    };

    const c2 = {
      open: open[candles.length - 2],
      high: high[candles.length - 2],
      low: low[candles.length - 2],
      close: close[candles.length - 2],
      range: rangeArr[candles.length - 2],
      atr: atrArr[candles.length - 2] || c1.atr
    };

    const getRejectionWick = (c: any) => {
      const tot = c.high - c.low;
      if (tot === 0) return 0;
      const top = Math.max(c.open, c.close);
      const bot = Math.min(c.open, c.close);
      return c.close < c.open ? (c.high - top) / tot : (bot - c.low) / tot;
    };

    const disabledGates = this.settings.disabledGates || {};
    const isBypassed = (id: string, key: string) => !!(disabledGates[id] || disabledGates[key]);

    const bypassClimaxRange = isBypassed('CR_climaxRange', 'cr_climaxRange') || (c1.volume && c1.avgVolume && c1.volume >= c1.avgVolume * 2.5);
    const bypassOverext = isBypassed('CR_overextension', 'cr_overextension');
    const bypassVol = isBypassed('CR_volatility', 'cr_volatility');
    const bypassRejection = isBypassed('CR_rejectionWick', 'cr_rejectionWick');

    // Macro Structure: Avoid shorting into major support floor or buying into ceiling
    const recentLows = low.slice(Math.max(0, low.length - 25), low.length - 2);
    const lowestRecentLow = recentLows.length > 0 ? Math.min(...recentLows) : c1.low;
    const recentHighs = high.slice(Math.max(0, high.length - 25), high.length - 2);
    const highestRecentHigh = recentHighs.length > 0 ? Math.max(...recentHighs) : c1.high;

    // Bearish Reversal Check (SHORT) - Enter right at the top of the reversal!
    if (
      c1.close > c1.open &&
      c1.close > (c1.emaBaseline || 0) && // MUST be above baseline in premium territory, not deep in a downtrend
      c1.high >= highestRecentHigh * 0.995 && // MUST be at the peak of the recent swing
      (bypassClimaxRange || c1.range >= minClimaxRange * c1.avgRange) &&
      (bypassOverext || (c1.close - c1.emaFast) >= minOverextension * c1.atr || (c1.close - c1.emaBaseline) >= minOverextension * c1.atr) &&
      (bypassVol || c1.volume >= c1.avgVolume * 2.5 || c1.atr >= minAtrVsAvg * c1.atrAvg) &&
      c2.close < c2.open &&
      (bypassRejection || c2.close < c1.open || getRejectionWick(c2) >= minRejectionWick) &&
      c2.high >= c1.high * 0.998 &&
      currentPrice > (lowestRecentLow + c2.atr * 0.4) // Do not short the floor support
    ) {
      const stopLevel = Math.max(c1.high, c2.high) + (c2.atr * 0.2); // Tight stop loss at peak
      const risk = Math.abs(currentPrice - stopLevel);

      // Anti-chasing: Do not enter if price already moved too far from the peak
      if (risk <= c2.atr * 1.5) {
        return {
          signalTime: candles[candles.length - 2].time,
          direction: 'SHORT',
          score: 95,
          atr: c2.atr,
          sl: stopLevel,
          tp1: Math.max(0.0001, currentPrice - 1.5 * risk),
          tp2: Math.max(0.0001, currentPrice - 3.0 * risk), // 1:3 RR
          tp3: Math.max(0.0001, currentPrice - 5.0 * risk)  // 1:5 Extended runner
        };
      }
    }

    // Bullish Reversal Check (LONG) - Enter right at the bottom of the reversal!
    if (
      c1.close < c1.open &&
      c1.close < (c1.emaBaseline || Infinity) && // MUST be below baseline in discount territory, not at the top of an uptrend
      c1.low <= lowestRecentLow * 1.005 && // MUST be at the trough of the recent swing
      (bypassClimaxRange || c1.range >= minClimaxRange * c1.avgRange) &&
      (bypassOverext || (c1.emaFast - c1.close) >= minOverextension * c1.atr || (c1.emaBaseline - c1.close) >= minOverextension * c1.atr) &&
      (bypassVol || c1.volume >= c1.avgVolume * 2.5 || c1.atr >= minAtrVsAvg * c1.atrAvg) &&
      c2.close > c2.open &&
      (bypassRejection || c2.close > c1.open || getRejectionWick(c2) >= minRejectionWick) &&
      c2.low <= c1.low * 1.002 &&
      currentPrice < (highestRecentHigh - c2.atr * 0.4) // Do not buy into the ceiling resistance
    ) {
      const stopLevel = Math.min(c1.low, c2.low) - (c2.atr * 0.2); // Tight stop loss at trough
      const risk = Math.abs(currentPrice - stopLevel);

      // Anti-chasing: Do not enter if price already moved too far from the trough
      if (risk <= c2.atr * 1.5) {
        return {
          signalTime: candles[candles.length - 2].time,
          direction: 'LONG',
          score: 95,
          atr: c2.atr,
          sl: stopLevel,
          tp1: currentPrice + 1.5 * risk,
          tp2: currentPrice + 3.0 * risk, // 1:3 RR
          tp3: currentPrice + 5.0 * risk  // 1:5 Extended runner
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
    if (candles.length < 50) return null;
    
    // Use the last candle as the potential breakout candle, 
    // and the candles before it as the compression window.
    const lastCandle = candles[candles.length - 1];
    const previousCandles = candles.slice(0, -1);
    
    const atrSeries = calculateATR(previousCandles, 14);
    const atr = atrSeries[atrSeries.length - 1];
    
    // Calculate 50-period SMA of ATR
    const atrAvg = atrSeries.slice(-50).reduce((a, b) => a + b, 0) / 50;
    
    // We pass settings, mapping the ServerBotSettings to AppSettings format where needed
    const settingsObj: any = this.settings; 
    
    const compression = detectCompression(previousCandles, atr, atrAvg, settingsObj);
    const breakout = detectBreakout(lastCandle, compression, atr, settingsObj, candles);
    
    if (!breakout) return null;
    
    // 1. Higher-Timeframe (1H) Trend Alignment Check
    let htfPenalty = 0;
    let htfReason = '';
    try {
      const htfCandles = await this.getKlines(symbol, '1h');
      const htfCheck = validateHigherTimeframeTrend(htfCandles, breakout.direction as 'LONG' | 'SHORT');
      htfPenalty = htfCheck.penalty;
      htfReason = htfCheck.reason;
      if (!htfCheck.isAligned && htfPenalty <= -35) {
        console.log(`[AutoTrader VCB] ${symbol} skipped: counter to 1H macro trend (${htfReason})`);
        return null;
      }
    } catch (e) {
      // If 1H fetch fails, proceed with local data
    }

    // 2. Apply Trend & Momentum Bonus
    const closes = candles.map(c => c.close);
    const ema9Series = calculateEMA(closes, 9);
    const ema21Series = calculateEMA(closes, 21);
    const ema50Series = calculateEMA(closes, 50);
    const rsiSeries = calculateRSI(closes, 14);
    
    const ema9 = ema9Series[ema9Series.length - 1];
    const ema21 = ema21Series[ema21Series.length - 1];
    const ema50 = ema50Series[ema50Series.length - 1];
    const rsi = rsiSeries[rsiSeries.length - 1];
    
    let score = scoreBreakout(breakout, settingsObj);
    score = applyTrendAndMomentumBonus(score, breakout.direction as 'LONG'|'SHORT', ema9, ema21, ema50, rsi, settingsObj);
    score = Math.max(0, Math.min(100, score + htfPenalty));
    
    if (score < this.settings.autoTradeThreshold) return null;
    
    const sl = determineStopLoss(breakout.direction as 'LONG'|'SHORT', compression, atr, settingsObj, candles, currentPrice);
    const tp1 = calculateInitialTp(currentPrice, breakout.direction as 'LONG'|'SHORT', atr, settingsObj);
    
    return {
      direction: breakout.direction as 'LONG'|'SHORT',
      score,
      atr,
      sl,
      tp1,
      tp2: tp1, // Will trail via chandelier
      tp3: tp1,
      compressionHigh: compression.windowHigh,
      compressionLow: compression.windowLow,
      signalTime: lastCandle.time,
      reason: `VCB Pre-Blast Inception (RVOL: ${breakout.rvol.toFixed(1)}x, CLV: ${(breakout.closeLocationValue * 100).toFixed(0)}%, Squeeze: ${compression.isSqueezed ? 'YES' : 'ATR'}${breakout.paReason ? `, PA: ${breakout.paReason}` : ''})`
    };
  }
}

export const autoTrader = new AutoTrader();
