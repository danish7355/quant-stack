import fs from 'fs';
import path from 'path';
import { db } from '../firebase.js';
import { doc, getDoc, setDoc, collection, query, where, getDocs, deleteDoc } from 'firebase/firestore';
import { oms } from './OMS.js';
import { positionMonitor } from './PositionMonitor.js';
import { isQuotaExhausted, safeSetDoc, safeDeleteDoc, safeGetDoc, readLocalJson, writeLocalJson } from './firestoreSafe.js';

import { telegramService } from './TelegramService.js';
import { riskManager } from './RiskManager.js';
import { executionAdapter } from './ExecutionAdapter.js';
import { writeSignalAudit, getSignalAudits } from './SignalAuditService.js';
import { heatmapService } from './HeatmapService.js';
import { reconciliationWorker } from './PositionReconciliationWorker.js';
import { priceStream } from './PriceStream.js';
import { coinDcxSimulator } from './CoinDcxSimulator.js';
import { calculateEMA, calculateATR, calculateRSI, calculateADX, calculateBollingerBands, calculateSMA, calculateSlope, classifySlope, evaluate4HHtfBias } from '../../src/utils/indicators.js';
import { HtfBiasData } from '../../src/types.js';
import { evaluateLiquiditySweepReversal } from '../../src/utils/strategies/liquiditySweepReversal.js';
import { evaluateSmcHighProbability } from '../../src/utils/strategies/smcHighProbability.js';
import { evaluateTrendPullback } from '../../src/utils/strategies/trendPullback.js';
import { evaluateMulticoinScalperPro } from '../../src/utils/strategies/multicoinScalperPro.js';
import { evaluateCoilBreakout } from '../../src/utils/strategies/coilBreakout.js';
import { evaluateOrderBlockStrategy } from '../../src/utils/strategies/orderBlockStrategy.js';
import { evaluateVcbStrategy } from '../../src/utils/strategies/vcbStrategy.js';
import { evaluateRangeRegime, checkTwoCandleReversalSetup, Candle } from '../../src/utils/strategies/rangeRegimeStrategy.js';
import { evaluateRegimeLayer2, evaluateTradeabilityLayer3, evaluateDirectionBias, getRecommendedRegimeDirection } from '../../src/utils/regimeEngine.js';
import { 
  DEFAULT_STRATEGY_BUCKET, 
  classifyBtcMacroRegime,
  classifyMarketRegime, 
  getEligibleBucketStrategies, 
  StrategyBucketItem,
  GlobalMarketRegime,
  MarketBreadthStats,
  RegimeClassificationResult,
  MarketRegimeType,
  STRATEGIES_BY_REGIME
} from '../../src/utils/strategyBucket.js';

export interface ServerBotSettings {
  autoTradeEnabled: boolean;
  autoTradeThreshold: number;
  tradeFrequency?: 'LOW' | 'MEDIUM' | 'HIGH';
  activeStrategy: 'BINANCE_COMPOSITE' | 'DELTA_CLIMAX' | 'VOLATILITY_COMPRESSION' | 'TREND_PULLBACK' | 'EARLY_COIL_BREAKOUT' | 'COIL_BREAKOUT' | 'AUTO_REGIME' | 'LIQUIDITY_SWEEP_REVERSAL' | 'SMC_LIQUIDITY' | 'MULTICOIN_SCALPER_PRO' | string;
  activeStrategies?: string[];
  deletedStrategies?: string[];
  customStrategies?: any[];
  strategyBucket?: StrategyBucketItem[];
  useGlobalBtcFilter?: boolean;
  globalFilterSymbol?: 'BTCUSDT' | 'BTC_ETH';
  layer3TradeabilityGateEnabled?: boolean;
  maxFeeDragPctOf1R?: number;
  regimeDirectionEnforced?: boolean; // Strictly enforce trades only in the recommended direction by regime
  telegramBotToken: string;
  telegramChatId: string;
  binanceApiKey?: string;
  binanceApiSecret?: string;
  binanceTestnet?: boolean;
  maxTradeMarginInr?: number;
  maxRiskPerTradeInr?: number;
  enforceInrCapsInLive?: boolean;
  leverage: number;
  positionSizePct: number;
  accountRiskPct?: number;
  maxConcurrentTrades: number;
  timeframe: string;
  // SMC Strategy Settings
  smcHtfResolution?: '1H' | '4H' | '1D';
  smcStructureLen?: number;
  smcWickRatio?: number;
  smcMinSweepWickPct?: number;
  smcDispAtrMult?: number;
  smcAtrLen?: number;
  smcSweepConfirmWindow?: number;
  smcVolAvgLen?: number;
  smcVolMult?: number;
  smcFvgAfterMssWindow?: number;
  smcObLookback?: number;
  smcUseKillZone?: boolean;
  smcKillZoneStart?: string;
  smcKillZoneEnd?: string;
  smcAtrStopMult?: number;
  smcRrRatio?: number;
  coinCount?: number;
  scanInterval?: number;
  startingBalance?: number;
  demoBalance?: number;
  coindcxSimulationMode?: boolean;
  coindcxDemoBalanceInr?: number;
  coindcxStartingBalanceInr?: number;
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
  maxExposurePct?: number;
  maxAccountExposureMultiplier?: number;
  maxConsecutiveLosses?: number;
  minLiqBuffer?: number;
  minStopDistancePct?: number;
  maxStopDistancePct?: number;
  minRRRatio?: number;
  killSwitchActive?: boolean;
  enforceStrictSl?: boolean;
  maxTradesPerDay?: number;
  tradeCooldownMinutes?: number;
  postSlCooldownMinutes?: number;
  antiWhipsawEnabled?: boolean;
  maxConsecutiveLossesPerSymbol?: number;
  consecutiveLossQuarantineMinutes?: number;
  correlationFilterEnabled?: boolean;
  maxCorrelation?: number;
  btcMacroRegimeFilter?: boolean;
  tp1AtrMultiple?: number;
  tp2AtrMultiple?: number;
  tp3FibLevel?: number;
  slAtrMultiple?: number;
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
  // 3Commas Multicoin Scalper PRO (SwissAlgo) Settings
  multicoinProfile?: '5m_SCALP' | '15m_SWING';
  multicoinFilterStables?: boolean;
  multicoinMin24hVolumeUsdt?: number;
  multicoinMaxSpreadPct?: number;
  multicoinMinAtrPct?: number;
  multicoinMaxAtrPct?: number;
  multicoinMaxSingleBarPct?: number;
  multicoinEmaFast?: number;
  multicoinEmaMid?: number;
  multicoinEmaSlow?: number;
  multicoinRequireVwap?: boolean;
  multicoinRsiPeriod?: number;
  multicoinRsiLongMin?: number;
  multicoinRsiLongMax?: number;
  multicoinRsiShortMin?: number;
  multicoinRsiShortMax?: number;
  multicoinMinVolRatio?: number;
  multicoinAdxThreshold?: number;
  multicoinTp1Pct?: number;
  multicoinTp2Pct?: number;
  multicoinSlAtrMult?: number;
  multicoinRiskPerTrade?: number;
  multicoinTimeExitMinutes?: number;
  multicoinUseHtfFilter?: boolean;
  multicoinHtfEmaFast?: number;
  multicoinHtfEmaSlow?: number;
  [key: string]: any;
}

export class AutoTrader {
  private settings: ServerBotSettings = {
    autoTradeEnabled: true,
    autoTradeThreshold: 75,
    tradeFrequency: 'LOW',
    activeStrategy: 'NONE',
    strategyBucket: DEFAULT_STRATEGY_BUCKET,
    useGlobalBtcFilter: true,
    globalFilterSymbol: 'BTCUSDT',
    layer3TradeabilityGateEnabled: true,
    maxFeeDragPctOf1R: 15.0,
    telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || '',
    telegramChatId: process.env.TELEGRAM_CHAT_ID || '',
    maxTradeMarginInr: 200,
    maxRiskPerTradeInr: 100,
    enforceInrCapsInLive: true,
    leverage: 5,
    positionSizePct: 3,
    maxConcurrentTrades: 5,
    coinCount: 100,
    timeframe: '15m',
    postSlCooldownMinutes: 30,
    antiWhipsawEnabled: true,
    maxConsecutiveLossesPerSymbol: 2,
    consecutiveLossQuarantineMinutes: 120
  };

  private isRunning = false;
  private loopInterval: NodeJS.Timeout | null = null;
  private klineCache = new Map<string, { time: number; klines: any[] }>();
  private pendingSymbols = new Set<string>();
  private pendingSmcSetups = new Map<string, any>();
  private tradeCooldowns = new Map<string, number>();
  private lastTradedSignal = new Map<string, number>();

  // Capital Protection & Trade Management State
  private symbolLastTradeClose = new Map<string, { closeTime: number; exitReason: string; pnl: number; direction: string }>();
  private symbolLastLoss = new Map<string, { closeTime: number; direction: string; exitReason: string }>();
  private symbolConsecutiveLosses = new Map<string, number>();
  private symbolQuarantineUntil = new Map<string, { until: number; reason: string }>();
  private accountRecentLosses: number[] = [];
  private accountCircuitBreakerUntil = 0;
  private regimeHistory = new Map<string, string[]>();
  private symbolRegimeStates = new Map<string, {
    candidateRegime: MarketRegimeType;
    confirmedRegime: MarketRegimeType | null;
    consecutiveBars: number;
    latchedBarsRemaining: number;
    lastCandleTime: number;
  }>();
  private symbolRegimeClassification = new Map<string, RegimeClassificationResult>();
  private cachedGlobalRegime: GlobalMarketRegime | null = null;
  public lastTargetStrategies: string[] | null = null;
  private lastGlobalRegimeTime = 0;
  private rateLimitedUntil = 0;
  private lastLiquidityRefreshTime = 0;
  private tickerLiquidityMap = new Map<string, { quoteVolume: number; bid: number; ask: number; spreadBps: number; fundingRate?: number; lastUpdate: number }>();

  public async refreshLiquidityData(): Promise<void> {
    const now = Date.now();
    if (now < this.rateLimitedUntil) return;
    if (now - this.lastLiquidityRefreshTime < 15000) return;

    try {
      const res = await fetch('https://fapi.binance.com/fapi/v1/ticker/24hr');
      if (!res.ok) {
        if (res.status === 429 || res.status === 418) {
          const retryAfter = res.headers?.get('retry-after');
          const waitMs = retryAfter ? (parseInt(retryAfter, 10) * 1000 || 60000) : 60000;
          this.rateLimitedUntil = Date.now() + waitMs;
          return;
        }
      } else {
        const data: any = await res.json();
        for (const item of data) {
          if (item.symbol) {
            const existing = this.tickerLiquidityMap.get(item.symbol) || { quoteVolume: 0, bid: 0, ask: 0, spreadBps: 0, lastUpdate: 0 };
            existing.quoteVolume = parseFloat(item.quoteVolume || '0');
            existing.lastUpdate = Date.now();
            this.tickerLiquidityMap.set(item.symbol, existing);
          }
        }
      }

      const bookRes = await fetch('https://fapi.binance.com/fapi/v1/ticker/bookTicker');
      if (!bookRes.ok) {
        if (bookRes.status === 429 || bookRes.status === 418) {
          const retryAfter = bookRes.headers?.get('retry-after');
          const waitMs = retryAfter ? (parseInt(retryAfter, 10) * 1000 || 60000) : 60000;
          this.rateLimitedUntil = Date.now() + waitMs;
          return;
        }
      } else {
        const bookData: any = await bookRes.json();
        for (const b of bookData) {
          if (b.symbol) {
            const bid = parseFloat(b.bidPrice || '0');
            const ask = parseFloat(b.askPrice || '0');
            const mid = (bid + ask) / 2;
            const spreadBps = mid > 0 ? ((ask - bid) / mid) * 10000 : 0;
            const existing = this.tickerLiquidityMap.get(b.symbol) || { quoteVolume: 0, bid: 0, ask: 0, spreadBps: 0, lastUpdate: 0 };
            existing.bid = bid;
            existing.ask = ask;
            existing.spreadBps = spreadBps;
            existing.lastUpdate = Date.now();
            this.tickerLiquidityMap.set(b.symbol, existing);
          }
        }
      }

      const premRes = await fetch('https://fapi.binance.com/fapi/v1/premiumIndex');
      if (!premRes.ok) {
        if (premRes.status === 429 || premRes.status === 418) {
          const retryAfter = premRes.headers?.get('retry-after');
          const waitMs = retryAfter ? (parseInt(retryAfter, 10) * 1000 || 60000) : 60000;
          this.rateLimitedUntil = Date.now() + waitMs;
          return;
        }
      } else {
        const premData: any = await premRes.json();
        const list = Array.isArray(premData) ? premData : [premData];
        for (const p of list) {
          if (p.symbol) {
            const existing = this.tickerLiquidityMap.get(p.symbol) || { quoteVolume: 0, bid: 0, ask: 0, spreadBps: 0, lastUpdate: 0 };
            if (p.lastFundingRate !== undefined) {
              existing.fundingRate = parseFloat(p.lastFundingRate || '0');
            }
            existing.lastUpdate = Date.now();
            this.tickerLiquidityMap.set(p.symbol, existing);
          }
        }
      }
      this.lastLiquidityRefreshTime = Date.now();
    } catch (e) {
      // Graceful non-blocking catch
    }
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

    const previousConfirmed = state.confirmedRegime;

    // Hard No-Trade Zone (Immediate Veto)
    if (detectedRegime === 'TRANSITION' || detectedRegime === 'PANIC' || detectedRegime === 'DEAD_VOLUME' || detectedRegime === 'UNCLEAR') {
      state.confirmedRegime = null;
      state.latchedBarsRemaining = 0;
      state.consecutiveBars = 0;
      state.candidateRegime = detectedRegime;
      state.lastCandleTime = closedCandleTime;

      if (previousConfirmed && previousConfirmed !== detectedRegime) {
        positionMonitor.handleRegimeTransition(
          symbol,
          previousConfirmed,
          detectedRegime,
          this.cachedGlobalRegime?.macroColor || 'GREEN'
        ).catch(() => {});
      }

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

        if (previousConfirmed && previousConfirmed !== detectedRegime) {
          positionMonitor.handleRegimeTransition(
            symbol,
            previousConfirmed,
            detectedRegime,
            this.cachedGlobalRegime?.macroColor || 'GREEN'
          ).catch(() => {});
        }

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
          if (previousConfirmed && previousConfirmed !== detectedRegime) {
            positionMonitor.handleRegimeTransition(
              symbol,
              previousConfirmed,
              detectedRegime,
              this.cachedGlobalRegime?.macroColor || 'GREEN'
            ).catch(() => {});
          }
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

        if (previousConfirmed && previousConfirmed !== detectedRegime) {
          positionMonitor.handleRegimeTransition(
            symbol,
            previousConfirmed,
            detectedRegime,
            this.cachedGlobalRegime?.macroColor || 'GREEN'
          ).catch(() => {});
        }

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
   * Higher-Timeframe (4H / 1H) Directional Agreement Gate:
   * Uses 4H SMA/EMA slope logic and price alignment to filter counter-trend trades.
   * Enforces strictly closed bars and data freshness (<300 min for 4H, <75 min for 1H)
   */
  public async checkHtfAgreement(
    symbol: string, 
    direction: 'LONG' | 'SHORT'
  ): Promise<{ passed: boolean; reason?: string; htfBias?: string }> {
    try {
      // Prioritize 4H Higher Timeframe for macro directional bias, fallback to 1H if 4H history is brief
      let htfKlines = await this.getKlines(symbol, '4h');
      let tfUsed = '4H';
      if (!htfKlines || htfKlines.length < 30) {
        htfKlines = await this.getKlines(symbol, '1h');
        tfUsed = '1H';
      }
      if (!htfKlines || htfKlines.length < 30) {
        return { passed: false, reason: `HTF (${tfUsed}) candle history unavailable (<30 bars). Vetoed for data integrity.`, htfBias: 'NEUTRAL' };
      }
      const closedHtf = htfKlines.slice(0, -1);
      const lastClosed = closedHtf[closedHtf.length - 1];
      if (!lastClosed) {
        return { passed: false, reason: `HTF (${tfUsed}) closed candle missing. Vetoed for data integrity.`, htfBias: 'NEUTRAL' };
      }
      const now = Date.now();
      const candleAgeMinutes = (now - (lastClosed.time * 1000)) / 60000;
      const maxAgeMinutes = tfUsed === '4H' ? 300 : 75;
      if (candleAgeMinutes > maxAgeMinutes) {
        return { passed: false, reason: `HTF (${tfUsed}) data is stale (${candleAgeMinutes.toFixed(0)}m old > ${maxAgeMinutes}m threshold). Vetoed for data integrity.`, htfBias: 'NEUTRAL' };
      }

      // Evaluate 4H HTF bias using SMA/EMA slope logic
      const htfEval = evaluate4HHtfBias(closedHtf, symbol);
      const htfBias = htfEval.bias;

      if (htfBias === 'NEUTRAL') {
        return {
          passed: false,
          reason: `HTF (${tfUsed}) trend is NEUTRAL/CHOPPY. All trades vetoed for trend alignment governance.`,
          htfBias: 'NEUTRAL'
        };
      }

      if (direction === 'LONG' && htfBias === 'BEARISH') {
        return { 
          passed: false, 
          reason: `HTF (${tfUsed}) trend is BEARISH (Price $${htfEval.price.toFixed(2)} < EMA50 $${htfEval.ema50.toFixed(2)}, Slope ${htfEval.ema50Slope.toFixed(2)}%). Long signals vetoed.`, 
          htfBias 
        };
      }
      if (direction === 'SHORT' && htfBias === 'BULLISH') {
        return { 
          passed: false, 
          reason: `HTF (${tfUsed}) trend is BULLISH (Price $${htfEval.price.toFixed(2)} > EMA50 $${htfEval.ema50.toFixed(2)}, Slope +${htfEval.ema50Slope.toFixed(2)}%). Short signals vetoed.`, 
          htfBias 
        };
      }
      return { passed: true, htfBias };
    } catch (e) {
      return { passed: false, reason: 'HTF fetch exception encountered. Vetoed for safety.', htfBias: 'NEUTRAL' };
    }
  }

  /**
   * Validates setup accuracy (SL and TP placement, R:R ratio, minimum score)
   */
  public validateAccurateSetup(
    signal: { direction: 'LONG' | 'SHORT'; score: number; sl?: number; tp1?: number; tp3?: number; strategy?: string },
    currentPrice: number,
    klines: any[] = []
  ): { accurate: boolean; reason?: string } {
    const minThreshold = this.settings?.autoTradeThreshold || 70;
    if (signal.score < minThreshold) {
      return { 
        accurate: false, 
        reason: `Signal score (${signal.score}) is below minimum threshold (${minThreshold})` 
      };
    }

    if (signal.direction === 'LONG') {
      if (signal.sl !== undefined && signal.sl >= currentPrice) {
        return { 
          accurate: false, 
          reason: `Inaccurate setup: Stop-Loss ($${signal.sl}) must be below current price ($${currentPrice}) for a Long setup.` 
        };
      }
      if (signal.tp1 !== undefined && signal.tp1 <= currentPrice) {
        return { 
          accurate: false, 
          reason: `Inaccurate setup: Take-Profit target ($${signal.tp1}) must be above current price ($${currentPrice}) for a Long setup.` 
        };
      }
    } else if (signal.direction === 'SHORT') {
      if (signal.sl !== undefined && signal.sl <= currentPrice) {
        return { 
          accurate: false, 
          reason: `Inaccurate setup: Stop-Loss ($${signal.sl}) must be above current price ($${currentPrice}) for a Short setup.` 
        };
      }
      if (signal.tp1 !== undefined && signal.tp1 >= currentPrice) {
        return { 
          accurate: false, 
          reason: `Inaccurate setup: Take-Profit target ($${signal.tp1}) must be below current price ($${currentPrice}) for a Short setup.` 
        };
      }
    }

    // Risk : Reward Validation (>= 1.5)
    if (signal.sl !== undefined && (signal.tp1 !== undefined || signal.tp3 !== undefined)) {
      const risk = Math.abs(currentPrice - signal.sl);
      const target = signal.tp3 || signal.tp1 || currentPrice;
      const reward = Math.abs(target - currentPrice);
      const rr = risk > 0 ? reward / risk : 0;
      if (rr < 1.5) {
        return { 
          accurate: false, 
          reason: `Insufficient setup R:R ratio (${rr.toFixed(2)} < 1.5 required). Setup discarded for positive expectancy.` 
        };
      }
    }

    return { accurate: true };
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


  /**
   * Capital Preservation Gate
   */
  public checkTradeManagementGate(_symbol: string, _proposedDirection?: 'LONG' | 'SHORT'): { allowed: boolean; reason?: string } {
    return { allowed: true };
  }

  public handleTradeClosed(pos: any, exitReason: string, pnl: number, timestamp?: number) {
    if (!pos || !pos.symbol) return;
    const symbol = pos.symbol;
    const now = timestamp || Date.now();
    const upperReason = (exitReason || '').toUpperCase();
    const isLoss = pnl < 0 || upperReason.includes('SL') || upperReason.includes('STOP') || upperReason.includes('LIQ');

    // Record last close info
    this.symbolLastTradeClose.set(symbol, {
      closeTime: now,
      exitReason,
      pnl,
      direction: pos.direction
    });

    // Reset base trade cooldown from exit time
    this.tradeCooldowns.set(symbol, now);

    if (isLoss) {
      console.warn(`🛑 [TradeManagement] ${symbol} closed with LOSS (Reason: ${exitReason}, PnL: ${pnl.toFixed(2)}, Dir: ${pos.direction})`);
      
      this.symbolLastLoss.set(symbol, {
        closeTime: now,
        direction: pos.direction,
        exitReason
      });

      // Increment consecutive losses on this symbol
      const curLosses = (this.symbolConsecutiveLosses.get(symbol) || 0) + 1;
      this.symbolConsecutiveLosses.set(symbol, curLosses);

      const maxConsec = this.settings.maxConsecutiveLossesPerSymbol ?? 2;
      const quarantineMins = this.settings.consecutiveLossQuarantineMinutes ?? 120;

      if (curLosses >= maxConsec) {
        const quarantineUntil = now + (quarantineMins * 60000);
        this.symbolQuarantineUntil.set(symbol, {
          until: quarantineUntil,
          reason: `${curLosses} consecutive stop-outs. Quarantined for ${quarantineMins}m to protect capital.`
        });
        console.error(`🚨 [CIRCUIT BREAKER] Symbol ${symbol} QUARANTINED for ${quarantineMins} minutes (${curLosses} consecutive stop-outs).`);
      }

    } else {
      console.log(`✅ [TradeManagement] ${symbol} closed with PROFIT/SCRATCH (PnL: ${pnl.toFixed(2)}). Resetting symbol loss streak.`);
      this.symbolConsecutiveLosses.delete(symbol);
      this.symbolQuarantineUntil.delete(symbol);
    }
  }

  public loadRecentTradeHistory() {
    try {
      const logsPath = path.join(process.cwd(), 'data', 'trade_logs.jsonl');
      if (!fs.existsSync(logsPath)) return;
      const content = fs.readFileSync(logsPath, 'utf8');
      const lines = content.split('\n').filter(l => l.trim().length > 0);
      const parsed: any[] = [];
      for (const line of lines.slice(-100)) {
        try {
          parsed.push(JSON.parse(line));
        } catch (e) {}
      }
      // Sort ascending by close time
      parsed.sort((a, b) => new Date(a.time_close || a.timestamp).getTime() - new Date(b.time_close || b.timestamp).getTime());
      
      const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
      for (const log of parsed) {
        const t = new Date(log.time_close || log.timestamp).getTime();
        if (t >= oneDayAgo) {
          this.handleTradeClosed(
            { symbol: log.symbol, direction: log.direction },
            log.exit_reason || 'CLOSE',
            log.profit || 0,
            t
          );
        }
      }
      console.log(`🛡️ [AutoTrader] Loaded recent trade history. Quarantined symbols: ${Array.from(this.symbolQuarantineUntil.keys()).join(', ') || 'None'}`);
    } catch (e) {
      console.warn('AutoTrader: Failed to load recent trade history:', e);
    }
  }

  constructor() {
    this.init();
  }

  public isEngineActive(): boolean {
    return this.isRunning && (this.settings.autoTradeEnabled !== false);
  }

  public async init() {
    await this.loadSettings();
    this.loadRecentTradeHistory();
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
          // Seamlessly migrate legacy SMC_LIQUIDITY to LIQUIDITY_SWEEP_REVERSAL
          if (this.settings.activeStrategies && Array.isArray(this.settings.activeStrategies)) {
            this.settings.activeStrategies = this.settings.activeStrategies.map(s => s === 'SMC_LIQUIDITY' ? 'LIQUIDITY_SWEEP_REVERSAL' : s);
          }
          if (this.settings.activeStrategy === 'SMC_LIQUIDITY') {
            this.settings.activeStrategy = 'LIQUIDITY_SWEEP_REVERSAL';
          }
          if (this.settings.deletedStrategies && Array.isArray(this.settings.deletedStrategies)) {
            const delSet = new Set(this.settings.deletedStrategies);
            if (this.settings.activeStrategies) {
              this.settings.activeStrategies = this.settings.activeStrategies.filter(s => !delSet.has(s));
            }
            if (this.settings.activeStrategy && delSet.has(this.settings.activeStrategy)) {
              this.settings.activeStrategy = (this.settings.activeStrategies && this.settings.activeStrategies[0]) || 'NONE';
            }
          }
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
    riskManager.updateSettings(this.settings);
    executionAdapter.setInrRiskCaps(Number(this.settings.maxTradeMarginInr || 200), Number(this.settings.maxRiskPerTradeInr || 100));
    positionMonitor.settings = this.settings;

    // Synchronize Exchange Mode (COINDCX vs BINANCE)
    if (this.settings.exchangeProvider === 'COINDCX') {
      executionAdapter.setExchangeProvider('COINDCX');
      if (this.settings.tradingMode !== 'PAPER' && this.settings.coindcxApiKey && this.settings.coindcxApiSecret) {
        executionAdapter.setCoinDcxMode(true, this.settings.coindcxApiKey, this.settings.coindcxApiSecret, (this.settings.coindcxMarginCurrency || 'INR') as any);
        executionAdapter.fetchBalance().then(bal => {
          if (bal && bal.walletBalance > 0) {
            console.log(`[AutoTrader] Synced CoinDCX INR Futures Wallet: ~$${bal.walletBalance.toFixed(2)} USDT (₹${(bal.inrBalance || bal.walletBalance * 87).toFixed(2)} INR)`);
          }
        }).catch(() => {});
      } else {
        executionAdapter.setCoinDcxMode(false);
      }
    } else {
      executionAdapter.setExchangeProvider('BINANCE');
      if (this.settings.tradingMode === 'TESTNET' || (this.settings.binanceTestnet && this.settings.tradingMode !== 'PAPER')) {
        if (this.settings.binanceApiKey && this.settings.binanceApiSecret) {
          executionAdapter.setMode(true, this.settings.binanceApiKey, this.settings.binanceApiSecret, true);
          executionAdapter.fetchBalance().then(bal => {
            if (bal && bal.walletBalance > 0) {
              console.log(`[AutoTrader] Synced Binance Futures Testnet Wallet: $${bal.walletBalance.toFixed(2)} USDT`);
            }
          }).catch(() => {});
        }
      } else if (this.settings.tradingMode === 'LIVE') {
        if (this.settings.binanceApiKey && this.settings.binanceApiSecret) {
          executionAdapter.setMode(true, this.settings.binanceApiKey, this.settings.binanceApiSecret, false);
        }
      } else {
        executionAdapter.setMode(false);
      }
    }

    return this.settings;
  }

  public async saveSettings(newSettings: Partial<ServerBotSettings>): Promise<ServerBotSettings> {
    const updated = { ...this.settings };
    
    // Check if starting balance changed or was set by user
    if (newSettings.startingBalance !== undefined && Number(newSettings.startingBalance) > 0) {
      if (this.settings.startingBalance !== Number(newSettings.startingBalance)) {
        console.log(`💰 [AutoTrader] Starting balance set to $${newSettings.startingBalance}. Synchronizing demoBalance.`);
        updated.startingBalance = Number(newSettings.startingBalance);
        updated.demoBalance = Number(newSettings.startingBalance);
        updated.equitySnapshots = [{ time: new Date().toISOString(), balance: Number(newSettings.startingBalance) }];
        riskManager.reset();
      }
    }

    // E13b: Compute changed keys by comparing each incoming value with current this.settings value (JSON.stringify) BEFORE assigning
    const changedKeys: string[] = [];
    for (const [k, v] of Object.entries(newSettings)) {
      if (v !== undefined && v !== null) {
        if (JSON.stringify((this.settings as any)[k]) !== JSON.stringify(v)) {
          changedKeys.push(k);
        }
      }
    }

    for (const [k, v] of Object.entries(newSettings)) {
      if (v !== undefined && v !== null) {
        // Protect credentials from accidental erasure if new value is empty string but existing is set
        const isCredential = k === 'telegramBotToken' || k === 'telegramChatId' || k === 'binanceApiKey' || k === 'binanceApiSecret' || k === 'coindcxApiKey' || k === 'coindcxApiSecret';
        if (isCredential && typeof v === 'string' && v.trim() === '' && !newSettings.forceClearCredentials) {
          continue;
        }
        (updated as any)[k] = v;
      }
    }

    // E13b: One-time hysteresis bypass only if a CHANGED key matches regime/tradeability list
    const touchesRegimeOrGate = changedKeys.some(k =>
      k.startsWith('regime') ||
      k.startsWith('layer3') ||
      ['maxFeeDragPctOf1R', 'maxSpread', 'takerFeePct', 'gstPct', 'slippageBps', 'min24hVolume', 'autoRegimeStrategySync'].includes(k)
    );
    if (touchesRegimeOrGate) {
      this.lastGlobalRegimeTime = 0;
      this.settings.lastAutoRegimeSwitchTime = 0;
      updated.lastAutoRegimeSwitchTime = 0;
    }

    this.settings = updated;
    if (this.settings.deletedStrategies && Array.isArray(this.settings.deletedStrategies)) {
      const delSet = new Set(this.settings.deletedStrategies);
      if (this.settings.activeStrategies) {
        this.settings.activeStrategies = this.settings.activeStrategies.filter(s => !delSet.has(s));
      }
      if (this.settings.activeStrategy && delSet.has(this.settings.activeStrategy)) {
        this.settings.activeStrategy = (this.settings.activeStrategies && this.settings.activeStrategies[0]) || 'NONE';
      }
    }
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
    riskManager.updateSettings(this.settings);
    executionAdapter.setInrRiskCaps(Number(this.settings.maxTradeMarginInr || 200), Number(this.settings.maxRiskPerTradeInr || 100));
    positionMonitor.settings = this.settings;

    // Synchronize Exchange Mode on save (COINDCX vs BINANCE)
    if (this.settings.exchangeProvider === 'COINDCX') {
      executionAdapter.setExchangeProvider('COINDCX');
      if (this.settings.tradingMode !== 'PAPER' && this.settings.coindcxApiKey && this.settings.coindcxApiSecret) {
        executionAdapter.setCoinDcxMode(true, this.settings.coindcxApiKey, this.settings.coindcxApiSecret, (this.settings.coindcxMarginCurrency || 'INR') as any);
      } else {
        executionAdapter.setCoinDcxMode(false);
      }
    } else {
      executionAdapter.setExchangeProvider('BINANCE');
      if (this.settings.tradingMode === 'TESTNET' || (this.settings.binanceTestnet && this.settings.tradingMode !== 'PAPER')) {
        if (this.settings.binanceApiKey && this.settings.binanceApiSecret) {
          executionAdapter.setMode(true, this.settings.binanceApiKey, this.settings.binanceApiSecret, true);
        }
      } else if (this.settings.tradingMode === 'LIVE') {
        if (this.settings.binanceApiKey && this.settings.binanceApiSecret) {
          executionAdapter.setMode(true, this.settings.binanceApiKey, this.settings.binanceApiSecret, false);
        }
      } else {
        executionAdapter.setMode(false);
      }
    }

    // Always persist locally
    writeLocalJson('settings.json', this.settings);

    // Safely attempt persistence to Firestore
    await safeSetDoc(doc(db, 'settings', 'bot_config'), this.settings, { merge: true });

    return this.settings;
  }

  public getSettings(): ServerBotSettings {
    if (!this.settings.strategyBucket || this.settings.strategyBucket.length === 0) {
      this.settings.strategyBucket = DEFAULT_STRATEGY_BUCKET;
    }
    return this.settings;
  }

  /**
   * Fetches and computes the detailed 4H HTF Bias for a symbol
   * including SMA/EMA slope logic, price alignment, and trade filtering explanation.
   */
  public async getHtfBiasDetails(symbol: string = 'BTCUSDT'): Promise<HtfBiasData> {
    const cleanSymbol = (symbol || 'BTCUSDT').toUpperCase();
    let klines = await this.getKlines(cleanSymbol, '4h');
    
    // If not in cache or less than 20 candles, fetch fresh
    if (!klines || klines.length < 20) {
      try {
        const res = await fetch(`https://fapi.binance.com/fapi/v1/klines?symbol=${cleanSymbol}&interval=4h&limit=100`);
        if (res.ok) {
          const raw = await res.json();
          if (Array.isArray(raw)) {
            klines = raw.map((k: any) => ({
              time: Math.floor(k[0] / 1000),
              open: parseFloat(k[1]),
              high: parseFloat(k[2]),
              low: parseFloat(k[3]),
              close: parseFloat(k[4]),
              volume: parseFloat(k[5]),
            }));
            this.klineCache.set(`${cleanSymbol}_4h`, { klines, time: Date.now() });
          }
        }
      } catch (e) {}
    }

    // Evaluate bias using the 4H slope logic on closed candles
    const closedKlines = klines && klines.length > 1 ? klines.slice(0, -1) : (klines || []);
    const biasData = evaluate4HHtfBias(closedKlines, cleanSymbol);

    // If current price is live in priceStream, update price
    const livePrice = priceStream.getPrice(cleanSymbol);
    if (livePrice && livePrice > 0) {
      biasData.price = livePrice;
    }

    // Attach recent audit rejections from Gate 5 / HTF
    try {
      const audits = getSignalAudits(100);
      const htfRejections = audits.filter(a => 
        a.gateResults?.higherTimeframeAligned === 'FAIL' ||
        a.rejectionReasons?.some(r => r.toLowerCase().includes('htf') || r.toLowerCase().includes('gate 5'))
      );
      biasData.recentRejections = {
        count: htfRejections.length,
        latestReasons: htfRejections.slice(0, 5).map(r => 
          `${r.symbol} (${r.direction}): ${r.rejectionReasons.join('; ')}`
        )
      };
    } catch (e) {}

    return biasData;
  }

  /**
   * Records a symbol's classified regime into the cumulative breadth cache
   */
  public recordSymbolRegimeClassification(symbol: string, classification: RegimeClassificationResult) {
    const existing = this.symbolRegimeStates.get(symbol) || {
      candidateRegime: classification.regime,
      confirmedRegime: classification.regime,
      consecutiveBars: 1,
      latchedBarsRemaining: 0,
      lastCandleTime: Date.now()
    };
    existing.candidateRegime = classification.regime;
    existing.confirmedRegime = classification.regime;
    (existing as any).adx = classification.metrics?.adx || 0;
    (existing as any).atrPct = classification.metrics?.atrPct || 0;
    (existing as any).isUptrend = classification.metrics?.isUptrend || false;
    (existing as any).isDowntrend = classification.metrics?.isDowntrend || false;
    (existing as any).isSqueezed = classification.metrics?.isSqueezed || false;
    (existing as any).timestamp = Date.now();
    this.symbolRegimeStates.set(symbol, existing);
    this.symbolRegimeClassification.set(symbol, classification);
  }

  /**
   * Pre-warms the cumulative altcoin breadth across top 100 volume coins
   */
  public async preWarmMarketBreadth(sampleLimit: number = 100): Promise<MarketBreadthStats> {
    try {
      const symbols = await this.getTopVolumeSymbols(sampleLimit);
      const baseTf = this.settings.timeframe || '15m';
      const now = Date.now();

      const toFetch = symbols.filter(s => {
        const existing = this.symbolRegimeStates.get(s);
        return !existing || !(existing as any).timestamp || (now - (existing as any).timestamp > 180000);
      });

      if (toFetch.length > 0) {
        for (let i = 0; i < toFetch.length; i += 10) {
          const batch = toFetch.slice(i, i + 10);
          await Promise.allSettled(batch.map(async (sym) => {
            try {
              const klines = await this.getKlines(sym, baseTf);
              if (klines && klines.length >= 30) {
                const closedKlines = klines.slice(0, -1);
                const closedPrice = closedKlines[closedKlines.length - 1]?.close || priceStream.getPrice(sym) || 1;
                const cls = classifyMarketRegime(closedKlines, closedPrice);
                this.recordSymbolRegimeClassification(sym, cls);
              }
            } catch (e) {}
          }));
        }
      }
    } catch (e) {}
    return this.computeCumulativeMarketBreadth(sampleLimit);
  }

  /**
   * Computes the cumulative market breadth and consensus regime across the top 100 coins
   */
  public computeCumulativeMarketBreadth(targetCount: number = 100): MarketBreadthStats {
    const now = Date.now();
    const allEntries: Array<{
      symbol: string;
      regime: MarketRegimeType;
      adx: number;
      isUptrend: boolean;
      isDowntrend: boolean;
      isSqueezed: boolean;
    }> = [];

    for (const [sym, st] of this.symbolRegimeStates.entries()) {
      const ts = (st as any).timestamp;
      if (ts && (now - ts) < 25 * 60 * 1000) {
        allEntries.push({
          symbol: sym,
          regime: st.confirmedRegime || st.candidateRegime,
          adx: (st as any).adx || 0,
          isUptrend: !!(st as any).isUptrend,
          isDowntrend: !!(st as any).isDowntrend,
          isSqueezed: !!(st as any).isSqueezed
        });
      }
    }

    const entries = allEntries.slice(0, targetCount);
    const total = entries.length;
    if (total === 0) {
      return {
        totalCoins: 0,
        rangingCount: 0,
        rangingPct: 0,
        trendingUpCount: 0,
        trendingUpPct: 0,
        trendingDownCount: 0,
        trendingDownPct: 0,
        compressionCount: 0,
        compressionPct: 0,
        transitionCount: 0,
        transitionPct: 0,
        dominantRegime: 'RANGING',
        recommendedStrategies: ['RANGE_REGIME_V1', 'LIQUIDITY_SWEEP_REVERSAL', 'COIL_BREAKOUT'],
        summary: 'Cumulative breadth initializing across top 100 coins...'
      };
    }

    let rangingCount = 0;
    let trendingUpCount = 0;
    let trendingDownCount = 0;
    let compressionCount = 0;
    let transitionCount = 0;

    for (const e of entries) {
      const r = e.regime;
      if (r === 'RANGING' || r === 'EXHAUSTION_UP' || r === 'EXHAUSTION_DOWN') {
        rangingCount++;
      } else if (r === 'TRENDING_UP' || r === 'BREAKOUT_UP' || (e.isUptrend && e.adx >= 20)) {
        trendingUpCount++;
      } else if (r === 'TRENDING_DOWN' || r === 'BREAKOUT_DOWN' || (e.isDowntrend && e.adx >= 20)) {
        trendingDownCount++;
      } else if (r === 'COMPRESSION' || e.isSqueezed) {
        compressionCount++;
      } else if (r === 'TRANSITION' || r === 'UNCLEAR') {
        transitionCount++;
      } else {
        rangingCount++;
      }
    }

    const rangingPct = parseFloat(((rangingCount / total) * 100).toFixed(1));
    const trendingUpPct = parseFloat(((trendingUpCount / total) * 100).toFixed(1));
    const trendingDownPct = parseFloat(((trendingDownCount / total) * 100).toFixed(1));
    const compressionPct = parseFloat(((compressionCount / total) * 100).toFixed(1));
    const transitionPct = parseFloat(((transitionCount / total) * 100).toFixed(1));

    const totalConsolidationCount = rangingCount + transitionCount;
    const totalConsolidationPct = parseFloat(((totalConsolidationCount / total) * 100).toFixed(1));

    let dominantRegime: MarketRegimeType = 'RANGING';
    let recommendedStrategies: string[] = [];
    let summary = '';

    // Collective consensus criteria across the top 100 coins
    if (trendingUpPct >= 38 && trendingUpPct > trendingDownPct && trendingUpPct > totalConsolidationPct) {
      dominantRegime = 'TRENDING_UP';
      recommendedStrategies = STRATEGIES_BY_REGIME.TRENDING_UP;
      summary = `Bullish Trend Consensus (${trendingUpPct}% of Top ${total} Coins Trending Up)`;
    } else if (trendingDownPct >= 38 && trendingDownPct > trendingUpPct && trendingDownPct > totalConsolidationPct) {
      dominantRegime = 'TRENDING_DOWN';
      recommendedStrategies = STRATEGIES_BY_REGIME.TRENDING_DOWN;
      summary = `Bearish Trend Consensus (${trendingDownPct}% of Top ${total} Coins Trending Down)`;
    } else if (compressionPct >= 30) {
      dominantRegime = 'COMPRESSION';
      recommendedStrategies = STRATEGIES_BY_REGIME.COMPRESSION;
      summary = `Volatility Compression Consensus (${compressionPct}% of Top ${total} Coins Coiling)`;
    } else if (trendingDownPct >= 25 && trendingDownPct > trendingUpPct) {
      dominantRegime = 'RANGING';
      // Trending breadth >= 25% threshold: Activate trending strategies in hybrid mode (Short-Biased)
      recommendedStrategies = [...STRATEGIES_BY_REGIME.RANGING, ...STRATEGIES_BY_REGIME.TRENDING_DOWN];
      summary = `Consolidation with Bearish Trend Expansion (Trending Down: ${trendingDownPct}% >= 25% Threshold). Trending Strategies Activated (Short-Biased).`;
    } else if (trendingUpPct >= 25 && trendingUpPct > trendingDownPct) {
      dominantRegime = 'RANGING';
      // Trending breadth >= 25% threshold: Activate trending strategies in hybrid mode (Long-Biased)
      recommendedStrategies = [...STRATEGIES_BY_REGIME.RANGING, ...STRATEGIES_BY_REGIME.TRENDING_UP];
      summary = `Consolidation with Bullish Trend Expansion (Trending Up: ${trendingUpPct}% >= 25% Threshold). Trending Strategies Activated (Long-Biased).`;
    } else if (totalConsolidationPct >= 45 || rangingPct >= 35) {
      dominantRegime = 'RANGING';
      recommendedStrategies = STRATEGIES_BY_REGIME.RANGING;
      if (trendingDownPct >= 15) {
        summary = `Consolidation & Mild Downtrend Tilt (${totalConsolidationPct}% Range/Chop, ${trendingDownPct}% Down [Below 25% Trend Trigger])`;
      } else if (trendingUpPct >= 15) {
        summary = `Consolidation & Mild Uptrend Tilt (${totalConsolidationPct}% Range/Chop, ${trendingUpPct}% Up [Below 25% Trend Trigger])`;
      } else {
        summary = `Range Consolidation Consensus (${totalConsolidationPct}% of Top ${total} Coins in Range/Chop [${rangingCount} Clean Range + ${transitionCount} Chop])`;
      }
    } else {
      dominantRegime = 'RANGING';
      recommendedStrategies = STRATEGIES_BY_REGIME.RANGING;
      summary = `Mixed Consolidation Consensus (${totalConsolidationPct}% Range/Chop across Top ${total} Coins)`;
    }

    return {
      totalCoins: total,
      rangingCount,
      rangingPct,
      trendingUpCount,
      trendingUpPct,
      trendingDownCount,
      trendingDownPct,
      compressionCount,
      compressionPct,
      transitionCount,
      transitionPct,
      dominantRegime,
      recommendedStrategies,
      summary
    };
  }

  /**
   * Hybrid Global Market Regime Filter (Cumulative Top 100 Coins + BTC/ETH Benchmark):
   * Assesses overall crypto macro health across all top coins cumulatively.
   */
  public async getGlobalRegime(forceRefresh = false): Promise<GlobalMarketRegime> {
    const now = Date.now();
    if (!forceRefresh && this.cachedGlobalRegime && (now - this.lastGlobalRegimeTime < 45000)) {
      return this.cachedGlobalRegime;
    }

    try {
      const globalSymbol = this.settings.globalFilterSymbol || 'BTCUSDT';
      const btcKlines4H = await this.getKlines('BTCUSDT', '4h');
      const btcKlines1H = await this.getKlines('BTCUSDT', '1h');
      const btcPrice = priceStream.getPrice('BTCUSDT') || (btcKlines4H.length > 0 ? btcKlines4H[btcKlines4H.length - 1].close : 68000);

      // Pre-warm breadth across top 100 volume coins if we have fewer than 95 tracked coins
      let validTrackedCount = 0;
      for (const st of this.symbolRegimeStates.values()) {
        if ((st as any).timestamp && (now - (st as any).timestamp < 25 * 60 * 1000)) validTrackedCount++;
      }
      if (validTrackedCount < 95) {
        await this.preWarmMarketBreadth(100);
      }

      const breadth = this.computeCumulativeMarketBreadth(100);

      if (!btcKlines4H || btcKlines4H.length < 25) {
        const fallback: GlobalMarketRegime = {
          regime: breadth.dominantRegime || 'RANGING',
          label: `MACRO: Top ${breadth.totalCoins} Coins – ${breadth.summary}`,
          details: `Cumulative evaluation active (${breadth.rangingPct}% Ranging, ${breadth.trendingUpPct}% Up, ${breadth.trendingDownPct}% Down)`,
          symbol: `TOP_${breadth.totalCoins || 100}_COINS`,
          timestamp: now,
          isTradable: true,
          macroColor: 'AMBER',
          btcPrice,
          breadth,
          activeStrategies: [...(this.settings.activeStrategies || [])],
          notTradableReason: null
        };
        this.cachedGlobalRegime = fallback;
        this.lastGlobalRegimeTime = now;
        return fallback;
      }

      // Evaluate institutional 3-Layer regime (4H confirmed by 1H) for benchmark anchor
      const klines1HForL3 = btcKlines1H && btcKlines1H.length >= 25 ? btcKlines1H : btcKlines4H;
      const regimeResult = evaluateRegimeLayer2(btcKlines4H, klines1HForL3, this.settings as any);
      const adx = regimeResult.metrics.adx14;
      const atrPercentile = regimeResult.metrics.atrPercentile / 100;

      // Evaluate Layer 1 Direction Bias (1D + 4H) with Cumulative Breadth integration
      const btcKlines1D = await this.getKlines('BTCUSDT', '1d');
      const ethKlines4H = await this.getKlines('ETHUSDT', '4h');
      const biasResult = evaluateDirectionBias(
        btcKlines1D && btcKlines1D.length >= 15 ? btcKlines1D : btcKlines4H,
        btcKlines4H,
        ethKlines4H,
        [],
        0.0001,
        [],
        55,
        btcPrice,
        breadth,
        this.settings as any
      );

      // Derive unified recommended direction by breadth consensus
      const dirEval = getRecommendedRegimeDirection(biasResult, regimeResult, breadth);
      let recommendedDirection = dirEval.recommendedDirection;

      // Evaluate Layer 3 Tradeability Gate (Fee Drag vs 1R Stop Loss)
      const btcSpreadBps = this.tickerLiquidityMap.get('BTCUSDT')?.spreadBps ?? 1.8;
      const tradeability = evaluateTradeabilityLayer3(klines1HForL3, this.settings as any, { spreadBps: btcSpreadBps });
      const isL3GateActive = this.settings.layer3TradeabilityGateEnabled !== false;
      const maxFeeDrag = this.settings.maxFeeDragPctOf1R ?? 15.0;
      const isLowEdge = isL3GateActive && tradeability.feeDragShareOf1R > maxFeeDrag;
      let isTradable = !isLowEdge;
      let macroColor: 'GREEN' | 'AMBER' | 'RED' = 'AMBER';
      let finalRegime: MarketRegimeType = 'RANGING';
      let finalLabel = 'MACRO: AMBER – Cumulative Altcoin Range';
      let finalDetails = '';

      // CUMULATIVE TOP 100 COINS CONSENSUS OVERRIDES BITCOIN ISOLATION
      if (breadth.totalCoins >= 8) {
        finalRegime = breadth.dominantRegime;
        if (breadth.trendingDownPct >= 25 && breadth.trendingDownPct > breadth.trendingUpPct) {
          macroColor = 'RED';
          recommendedDirection = 'SHORT';
          finalLabel = `MACRO: RED – Cumulative Downtrend (${breadth.trendingDownPct}% of Top ${breadth.totalCoins} Coins Trending Down)`;
          finalDetails = `Cumulative Consensus across Top ${breadth.totalCoins} Coins: Broad altcoin bearish trend (${breadth.trendingDownPct}% Down vs ${breadth.trendingUpPct}% Up). Directional Bias: SHORT. Active Strategies: ${breadth.recommendedStrategies.join(', ')}.`;
        } else if (breadth.trendingUpPct >= 25 && breadth.trendingUpPct > breadth.trendingDownPct) {
          macroColor = 'GREEN';
          recommendedDirection = 'LONG';
          finalLabel = `MACRO: GREEN – Cumulative Uptrend (${breadth.trendingUpPct}% of Top ${breadth.totalCoins} Coins Trending Up)`;
          finalDetails = `Cumulative Consensus across Top ${breadth.totalCoins} Coins: Broad altcoin bullish trend expansion (${breadth.trendingUpPct}% Up vs ${breadth.trendingDownPct}% Down). Directional Bias: LONG. Active Strategies: ${breadth.recommendedStrategies.join(', ')}.`;
        } else if (breadth.dominantRegime === 'COMPRESSION') {
          macroColor = 'AMBER';
          recommendedDirection = 'BOTH';
          finalLabel = `MACRO: PURPLE – Cumulative Compression (${breadth.compressionPct}% of Top ${breadth.totalCoins} Coins Coiling)`;
          finalDetails = `Cumulative Consensus across Top ${breadth.totalCoins} Coins: Broad volatility contraction (${breadth.compressionPct}% Squeezed). Active Strategies: ${breadth.recommendedStrategies.join(', ')}.`;
        } else {
          macroColor = 'AMBER';
          recommendedDirection = 'BOTH';
          finalLabel = `MACRO: AMBER – Cumulative Range (${breadth.rangingPct}% of Top ${breadth.totalCoins} Coins Ranging)`;
          finalDetails = `Cumulative Consensus across Top ${breadth.totalCoins} Coins: ${breadth.rangingCount} Ranging (${breadth.rangingPct}%), ${breadth.transitionCount} Sideways Chop (${breadth.transitionPct}%). Directional Bias: TWO-SIDED (BOTH). Active Strategies: ${breadth.recommendedStrategies.join(', ')}.`;
        }
        finalDetails += ` · BTC Anchor: ${regimeResult.primaryRegime} (ADX ${adx.toFixed(1)}) · Recommended Direction: ${recommendedDirection}`;
      } else {
        // Fallback to BTC anchor if altcoin breadth is still populating
        if (regimeResult.primaryRegime === 'COMPRESSION') {
          finalRegime = 'COMPRESSION';
          finalLabel = 'MACRO: PURPLE – Volatility Compression';
          finalDetails = `Institutional 4H Compression (${regimeResult.regimeAgeDurationStr}, ADX ${adx.toFixed(1)}, BBW ${regimeResult.metrics.bbBandwidthPercentile.toFixed(0)}th %ile). Favor Coil Breakout.`;
          macroColor = 'AMBER';
        } else if (regimeResult.primaryRegime === 'TREND') {
          const isUptrend = regimeResult.metrics.emaAlignment.includes('BULLISH');
          finalRegime = isUptrend ? 'TRENDING_UP' : 'TRENDING_DOWN';
          finalLabel = `MACRO: GREEN – ${isUptrend ? 'Uptrend' : 'Downtrend'}`;
          finalDetails = `Institutional 4H Trend Regime (ADX ${adx.toFixed(1)}). Trend Pullback & Order Block favored.`;
          macroColor = 'GREEN';
        } else if (regimeResult.primaryRegime === 'EXPANSION') {
          finalRegime = 'BREAKOUT_UP';
          finalLabel = 'MACRO: AMBER – High Volatility Expansion';
          finalDetails = `Institutional 4H Expansion/Climax (ATR% ${regimeResult.metrics.atrPercentile.toFixed(0)}th %ile). Order Block / Climax Reversal favored.`;
          macroColor = 'AMBER';
        } else {
          finalRegime = 'RANGING';
          finalLabel = 'MACRO: AMBER – Range Chop';
          finalDetails = `Institutional 4H Range Chop (ADX ${adx.toFixed(1)}). Liquidity Sweep Reversal favored.`;
          macroColor = 'AMBER';
        }
      }

      let ethPrice: number | undefined = undefined;
      if (globalSymbol === 'BTC_ETH') {
        ethPrice = priceStream.getPrice('ETHUSDT') || (ethKlines4H.length > 0 ? ethKlines4H[ethKlines4H.length - 1].close : 3500);
      }

      if (!isL3GateActive) {
        finalDetails += ` · Layer 3 Gate: Bypassed by User`;
      } else if (!isTradable) {
        finalDetails += ` · ⚠️ Layer 3 Gate: ${tradeability.lowEdgeReason}`;
      } else {
        finalDetails += ` · Layer 3 Gate: Passed (${tradeability.feeDragShareOf1R.toFixed(1)}% Fee Drag)`;
      }

      const notTradableReason = !isTradable ? (tradeability.lowEdgeReason || 'Layer 3 tradeability gate failed') : null;

      const result: GlobalMarketRegime = {
        regime: finalRegime,
        label: finalLabel,
        details: finalDetails,
        symbol: `TOP_${breadth.totalCoins || 100}_COINS`,
        timestamp: now,
        isTradable,
        macroColor,
        recommendedDirection,
        directionBiasScore: biasResult.totalScore,
        directionBiasLabel: biasResult.label,
        btcPrice,
        ethPrice,
        adx,
        atrPercentile,
        breadth,
        activeStrategies: [...(this.settings.activeStrategies || [])],
        notTradableReason
      };

      this.cachedGlobalRegime = result;
      this.lastGlobalRegimeTime = now;
      return result;
    } catch (e) {
      console.warn('AutoTrader getGlobalRegime error:', e);
      return {
        regime: 'RANGING',
        label: 'Global Altcoin Consensus',
        details: 'Cumulative top coins evaluation active',
        symbol: 'TOP_100_COINS',
        timestamp: now,
        isTradable: true,
        macroColor: 'AMBER',
        activeStrategies: [...(this.settings.activeStrategies || [])],
        notTradableReason: null
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

  public resetCircuitBreakers() {
    this.accountCircuitBreakerUntil = 0;
    this.accountRecentLosses = [];
    this.symbolQuarantineUntil.clear();
    this.symbolConsecutiveLosses.clear();
    this.symbolLastLoss.clear();
    console.log('🔄 [AutoTrader] Reset all portfolio loss streaks, quarantine records, and circuit breakers.');
  }

  public getEffectiveAccountEquity(): number {
    const isCoinDcx = this.settings.exchangeProvider === 'COINDCX' || executionAdapter.getExchangeProvider() === 'COINDCX';
    if (executionAdapter.getIsLive()) {
      const liveBal = executionAdapter.getLastLiveBalance();
      if (liveBal && liveBal.availableBalance > 0) {
        return liveBal.availableBalance;
      }
      if (isCoinDcx) {
        return this.settings.coindcxStartingBalanceInr || 2500;
      }
      if (this.settings.startingBalance && this.settings.startingBalance > 0) {
        return this.settings.startingBalance;
      }
    }
    if (isCoinDcx) {
      const sim = coinDcxSimulator.getSimulatedWallet();
      return sim?.availableBalance || this.settings.coindcxDemoBalanceInr || this.settings.coindcxStartingBalanceInr || 2500;
    }
    return (this.settings.demoBalance !== undefined && this.settings.demoBalance > 0)
      ? this.settings.demoBalance
      : (this.settings.startingBalance || 1000);
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

          if (this.settings.killSwitchActive || riskManager.getRiskStatus().killSwitchActive) {
            console.log(`🛑 [SMC] Trade execution blocked for ${symbol}: Emergency Kill Switch active.`);
            continue;
          }

          const activePositions = positionMonitor.getActivePositions();
          if (activePositions.some(p => p.symbol === symbol) || this.pendingSymbols.has(symbol)) {
            console.log(`🛑 [SMC] Setup for ${symbol} skipped: Position already active or pending.`);
            continue;
          }

          // Anti-Whipsaw & Trade Management Check
          const smcGate = this.checkTradeManagementGate(symbol, setup.direction);
          if (!smcGate.allowed) {
            console.log(`🛡️ [SMC] Setup for ${symbol} blocked by Trade Management: ${smcGate.reason}`);
            continue;
          }

          // Spread Check
          const liq = this.tickerLiquidityMap.get(symbol);
          const spreadPct = liq && liq.spreadBps ? (liq.spreadBps / 100) : 0;
          const maxSpread = this.settings.maxSpread ?? 0.2;
          if (spreadPct > maxSpread) {
            console.log(`🚫 [SMC] Setup for ${symbol} rejected: Spread too wide (${spreadPct.toFixed(3)}% > ${maxSpread.toFixed(3)}%)`);
            this.tradeCooldowns.set(symbol, Date.now() + 60000);
            continue;
          }

          // Min RR Check
          if (setup.sl && setup.tp1) {
            const riskDist = Math.abs(price - setup.sl);
            const rewardDist = Math.abs(setup.tp1 - price);
            const rr = riskDist > 0 ? (rewardDist / riskDist) : 0;
            const minRR = this.settings.minRRRatio ?? 1.5;
            if (rr < minRR) {
              console.log(`🚫 [SMC] Setup for ${symbol} rejected: R:R (${rr.toFixed(2)}) is below minimum required (${minRR})`);
              this.tradeCooldowns.set(symbol, Date.now() + 60000);
              continue;
            }
          }

          // Enforce Strict Risk parameter
          const accountEquity = this.getEffectiveAccountEquity();
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
              { 
                maxLeverage: this.settings.leverage || 1, 
                maxAllocation,
                minLiqBuffer: this.settings.minLiqBuffer,
                maxAccountExposureMultiplier: this.settings.maxAccountExposureMultiplier,
                minStopDistancePct: this.settings.minStopDistancePct !== undefined ? (this.settings.minStopDistancePct > 1 ? this.settings.minStopDistancePct / 100 : this.settings.minStopDistancePct) : undefined,
                maxStopDistancePct: this.settings.maxStopDistancePct !== undefined ? (this.settings.maxStopDistancePct > 1 ? this.settings.maxStopDistancePct / 100 : this.settings.maxStopDistancePct) : undefined,
                maxMarginInr: Number(this.settings.maxTradeMarginInr || 200),
                maxRiskInr: Number(this.settings.maxRiskPerTradeInr || 100),
                usdtToInrRate: executionAdapter.getUsdtToInrRate(),
                isMarginInr: (this.settings.exchangeProvider === 'COINDCX' || executionAdapter.getExchangeProvider() === 'COINDCX') && (this.settings.coindcxMarginCurrency === 'INR' || !this.settings.coindcxMarginCurrency)
              },
              riskPct
          );
          
          if (safeSize.rejected || safeSize.contracts <= 0) {
              console.log(`🚫 [SMC] Setup for ${symbol} rejected by RiskManager: ${safeSize.reason}`);
              this.tradeCooldowns.set(symbol, Date.now() + 60000);
              continue;
          }

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
             if (err.message && (err.message.includes("-2015") || err.message.includes("Invalid API-key") || err.message.includes("permissions for action"))) {
               console.warn(`🛡️ [SMC] Order execution notice for ${symbol}: Exchange credentials invalid or unauthorized (-2015).`);
             } else {
               console.error(`SMC error opening ${symbol}:`, err);
             }
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

      if (this.settings.killSwitchActive || riskManager.getRiskStatus().killSwitchActive) {
        this.logScanResult('GLOBAL', 'NEUTRAL', false, 'Emergency Kill Switch Active: New executions halted', 0, 0, 0, 0);
        return;
      }

      if (Date.now() < this.rateLimitedUntil) {
        this.logScanResult('GLOBAL', 'NEUTRAL', false, 'Binance rate-limited: new entries paused', 0, 0, 0, 0);
        return;
      }

      // Refresh real-time 24h volume & bookTicker spread data
      await this.refreshLiquidityData();

      // Autonomous Background Regime Strategy Alignment (Guarded by 10-minute stability lock, except on regime transition)
      if (this.settings.autoRegimeStrategySync) {
        try {
          const now = Date.now();
          const cooldownMs = 10 * 60 * 1000;
          const lastSwitch = this.settings.lastAutoRegimeSwitchTime || 0;
          const timeSinceSwitch = now - lastSwitch;
          const macro = await this.getGlobalRegime();
          const hasRegimeChanged = !this.settings.lastAutoRegimeApplied || this.settings.lastAutoRegimeApplied !== macro.regime;
          let targetStrats: string[] = [];
          const notTradableReason = !macro.isTradable
            ? (macro.notTradableReason || macro.details || 'Market condition not tradable')
            : null;

          if (!macro.isTradable) {
            targetStrats = [];
          } else if (macro.breadth && macro.breadth.recommendedStrategies && macro.breadth.recommendedStrategies.length > 0) {
            targetStrats = macro.breadth.recommendedStrategies;
          } else if (macro.regime && STRATEGIES_BY_REGIME[macro.regime as MarketRegimeType]) {
            targetStrats = STRATEGIES_BY_REGIME[macro.regime as MarketRegimeType];
          } else {
            targetStrats = STRATEGIES_BY_REGIME.RANGING;
          }

          this.lastTargetStrategies = [...targetStrats];

          const curList = this.settings.activeStrategies || [this.settings.activeStrategy || ''];
          const isAligned = targetStrats.length === curList.length && targetStrats.every(s => curList.includes(s));
          const lastTargetKey = (this.settings as any).lastAutoTargetKey || '';
          const currentTargetKey = !macro.isTradable ? 'NOT_TRADABLE' : targetStrats.join(',');
          const hasTargetChanged = lastTargetKey !== currentTargetKey;

          if (!this.settings.lastAutoRegimeSwitchTime || timeSinceSwitch >= cooldownMs || hasRegimeChanged || (hasTargetChanged && timeSinceSwitch >= 60_000) || (!isAligned && timeSinceSwitch >= 120_000)) {
            if (!isAligned || hasTargetChanged) {
              const summaryText = !macro.isTradable
                ? `Safety Lockout: ${notTradableReason}`
                : (macro.breadth?.summary || macro.label || macro.regime);
              console.log(`⚡ [AutoTrader] Cumulative 100-Coin Auto-Regime Sync: ${!macro.isTradable ? 'Safety Lockout: Deactivating all strategies' : `Aligning active strategies to [${targetStrats.join(', ')}]`} based on ${summaryText}`);
              this.settings.activeStrategies = targetStrats;
              this.settings.activeStrategy = (targetStrats[0] || 'NONE') as any;
              this.settings.lastAutoRegimeApplied = macro.regime;
              (this.settings as any).lastAutoTargetKey = currentTargetKey;
              (this.settings as any).notTradableReason = notTradableReason;
              this.settings.lastAutoRegimeSwitchTime = now;
              this.saveSettings({
                activeStrategies: targetStrats,
                activeStrategy: (targetStrats[0] || 'NONE') as any,
                lastAutoRegimeApplied: macro.regime,
                lastAutoTargetKey: currentTargetKey,
                notTradableReason: notTradableReason,
                lastAutoRegimeSwitchTime: now
              }).catch(() => {});
            }
          }
        } catch (e) {}
      }

      // 1. Fetch top volume futures tickers (Top 100 coins)
      const scanLimit = 100;
      const topSymbols = await this.getTopVolumeSymbols(scanLimit);
      
      for (const symbol of topSymbols) {
        const deletedStrats = this.settings.deletedStrategies || [];
        const rawActiveList = Array.isArray(this.settings.activeStrategies)
          ? this.settings.activeStrategies
          : ((this.settings as any).enabledStrategies && Array.isArray((this.settings as any).enabledStrategies))
          ? (this.settings as any).enabledStrategies
          : (this.settings.activeStrategy && this.settings.activeStrategy !== 'NONE' ? [this.settings.activeStrategy] : []);
        const activeList = rawActiveList.map((s: string) => {
          if (s === 'SMC_LIQUIDITY_SWEEP' || s === 'SMC_LIQUIDITY') return 'LIQUIDITY_SWEEP_REVERSAL';
          if (s === 'EARLY_COIL_BREAKOUT') return 'COIL_BREAKOUT';
          return s;
        }).filter((s: string) => !deletedStrats.includes(s));

        if (activeList.length === 0) {
          continue;
        }
        
        const baseTf = this.settings.timeframe || '15m';

        // Check active positions or in-flight order submissions
        if (activePositions.some(p => p.symbol === symbol) || this.pendingSymbols.has(symbol)) {
          continue;
        }

        // Verify symbol is actively tradable for opening positions on exchange
        if (!executionAdapter.isSymbolTradable(symbol)) {
          continue;
        }

        // Capital Preservation & Trade Management Gate (quarantine, post-SL cooldown, circuit breaker)
        const mgmtGate = this.checkTradeManagementGate(symbol);
        if (!mgmtGate.allowed) {
          continue;
        }

        const currentPrice = priceStream.getPrice(symbol);
        if (!currentPrice || currentPrice <= 0) continue;

        // 24h Volume Gate
        const min24hVol = this.settings.min24hVolume ?? 0;
        const liq = this.tickerLiquidityMap.get(symbol);
        const quoteVol = liq?.quoteVolume || 0;
        if (!this.settings.disabledGates?.min24hVolume && min24hVol > 0 && quoteVol > 0 && quoteVol < min24hVol) {
          const symRegime = this.symbolRegimeClassification.get(symbol)?.label || this.symbolRegimeStates.get(symbol)?.confirmedRegime || this.cachedGlobalRegime?.regime || 'RANGING';
          this.logScanResult(symbol, 'NEUTRAL', false, `24h volume ($${(quoteVol / 1e6).toFixed(1)}M) below minimum ($${(min24hVol / 1e6).toFixed(1)}M)`, currentPrice, 0, 0, 0, {
            strategy: 'PRE_SCAN_VOLUME_GATE',
            marketRegime: symRegime,
            gateResults: { volumeValid: 'FAIL' },
            rejectionReasons: [`24h volume ($${(quoteVol / 1e6).toFixed(1)}M) below minimum ($${(min24hVol / 1e6).toFixed(1)}M)`]
          });
          continue;
        }

        // Spread Check Gate
        const spreadPct = liq && liq.spreadBps ? (liq.spreadBps / 100) : 0;
        const maxSpread = this.settings.maxSpread ?? 0.2;
        if (!this.settings.disabledGates?.maxSpread && spreadPct > maxSpread) {
          const symRegime = this.symbolRegimeClassification.get(symbol)?.label || this.symbolRegimeStates.get(symbol)?.confirmedRegime || this.cachedGlobalRegime?.regime || 'RANGING';
          this.logScanResult(symbol, 'NEUTRAL', false, `Spread too wide (${spreadPct.toFixed(3)}% > ${maxSpread.toFixed(3)}%)`, currentPrice, 0, 0, 0, {
            strategy: 'PRE_SCAN_SPREAD_GATE',
            marketRegime: symRegime,
            gateResults: { spreadValid: 'FAIL' },
            rejectionReasons: [`Spread too wide (${spreadPct.toFixed(3)}% > ${maxSpread.toFixed(3)}%)`]
          });
          continue;
        }

        // Funding Rate Check Gate
        if (!this.settings.disabledGates?.maxFundingRate && this.settings.maxFundingRate !== undefined && liq?.fundingRate !== undefined) {
          const fundingPct = Math.abs(liq.fundingRate * 100);
          if (fundingPct > this.settings.maxFundingRate) {
            const symRegime = this.symbolRegimeClassification.get(symbol)?.label || this.symbolRegimeStates.get(symbol)?.confirmedRegime || this.cachedGlobalRegime?.regime || 'RANGING';
            this.logScanResult(symbol, 'NEUTRAL', false, `Funding rate too high (${fundingPct.toFixed(3)}% > ${this.settings.maxFundingRate}%)`, currentPrice, 0, 0, 0, {
              strategy: 'PRE_SCAN_FUNDING_GATE',
              marketRegime: symRegime,
              rejectionReasons: [`Funding rate too high (${fundingPct.toFixed(3)}% > ${this.settings.maxFundingRate}%)`]
            });
            continue;
          }
        }

        // 2. Fetch base klines on user-selected execution timeframe (e.g. 15m)
        const klines = await this.getKlines(symbol, baseTf);
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
           if (!passes) {
             this.logScanResult(symbol, signal.direction, false, signal.reason || 'Low Score', currentPrice, signal.sl, signal.tp1, signal.score, {
               strategy: (signal as any).strategy,
               marketRegime: (signal as any).marketRegime,
               strategyRegimeStatus: (signal as any).strategyRegimeStatus,
               strategyRegimeFavorable: (signal as any).strategyRegimeFavorable,
               structuralRR: (signal as any).structuralRR
             });
           }
        }
        
        if (signal && signal.score >= this.settings.autoTradeThreshold) {

          const currentTotal = positionMonitor.getActivePositions().length + this.pendingSymbols.size;
          if (currentTotal >= this.settings.maxConcurrentTrades) {
            this.logScanResult(symbol, signal.direction, false, `Max open trades reached (${currentTotal}/${this.settings.maxConcurrentTrades})`, currentPrice, signal.sl, signal.tp1, signal.score, {
              strategy: (signal as any).strategy,
              marketRegime: (signal as any).marketRegime,
              rejectionReasons: [`Max open trades limit reached (${currentTotal}/${this.settings.maxConcurrentTrades})`]
            });
            continue;
          }

          // Min RR Check Gate (Respects user setting minRRRatio / tpMinRiskRewardRatio, not signal's own expected RR)
          if (!this.settings.disabledGates?.minRR && signal.sl && (signal.tp3 || signal.tp1)) {
            const riskDist = Math.abs(currentPrice - signal.sl);
            const targetPrice = signal.tp3 || signal.tp1;
            const rewardDist = Math.abs(targetPrice - currentPrice);
            const rr = riskDist > 0 ? (rewardDist / riskDist) : 0;
            const userMinRR = Number(this.settings.minRRRatio) || Number(this.settings.tpMinRiskRewardRatio) || 1.5;
            if (rr < (userMinRR - 0.05)) {
              this.logScanResult(symbol, signal.direction, false, `R:R ratio (${rr.toFixed(2)}) below minimum (${userMinRR})`, currentPrice, signal.sl, signal.tp1, signal.score, {
                strategy: (signal as any).strategy,
                marketRegime: (signal as any).marketRegime,
                structuralRR: rr,
                rejectionReasons: [`R:R ratio ${rr.toFixed(2)} < required min ${userMinRR}`]
              });
              continue;
            }
          }

          // Correlation filter Gate
          if (!this.settings.disabledGates?.correlation && this.settings.correlationFilterEnabled && activePositions.length > 0) {
            const maxCorr = this.settings.maxCorrelation ?? 0.75;
            const candidateCloses = klines.map(k => k.close);
            let correlatedWith = '';
            let highestCorr = 0;
            for (const pos of activePositions) {
              if (pos.symbol === symbol) continue;
              const posKlines = await this.getKlines(pos.symbol, baseTf);
              if (posKlines && posKlines.length >= 30) {
                const c1 = candidateCloses.slice(-30);
                const c2 = posKlines.slice(-30).map(k => k.close);
                const r1: number[] = [];
                const r2: number[] = [];
                for (let i = 1; i < Math.min(c1.length, c2.length); i++) {
                  r1.push((c1[i] - c1[i - 1]) / c1[i - 1]);
                  r2.push((c2[i] - c2[i - 1]) / c2[i - 1]);
                }
                if (r1.length >= 20) {
                  const m1 = r1.reduce((a, b) => a + b, 0) / r1.length;
                  const m2 = r2.reduce((a, b) => a + b, 0) / r2.length;
                  let num = 0, den1 = 0, den2 = 0;
                  for (let i = 0; i < r1.length; i++) {
                    const d1 = r1[i] - m1;
                    const d2 = r2[i] - m2;
                    num += d1 * d2;
                    den1 += d1 * d1;
                    den2 += d2 * d2;
                  }
                  const corr = (den1 > 0 && den2 > 0) ? (num / Math.sqrt(den1 * den2)) : 0;
                  if (corr > maxCorr) {
                    correlatedWith = pos.symbol;
                    highestCorr = corr;
                    break;
                  }
                }
              }
            }
            if (correlatedWith) {
              this.logScanResult(symbol, signal.direction, false, `Correlation veto: ${highestCorr.toFixed(2)} with ${correlatedWith} exceeds cap (${maxCorr})`, currentPrice, signal.sl, signal.tp1, signal.score, {
                strategy: (signal as any).strategy,
                marketRegime: (signal as any).marketRegime,
                rejectionReasons: [`Correlation veto with ${correlatedWith}`]
              });
              this.tradeCooldowns.set(symbol, Date.now() + 60000);
              continue;
            }
          }

          // Regime Recommended Direction Gate (Strict Rule: Only take trades in the recommended direction by regime)
          if (!this.settings.disabledGates?.regimeDirection && this.settings.regimeDirectionEnforced !== false) {
            const macro = await this.getGlobalRegime();
            const signalStrat = (signal as any).strategy || '';
            const isBidirectionalStrat = signalStrat === 'RANGE_REGIME_V1' || signalStrat === 'RANGE_REGIME' || signalStrat === 'LIQUIDITY_SWEEP_REVERSAL' || signalStrat === 'COIL_BREAKOUT';
            const isRangeOrCompressionMacro = macro.regime === 'RANGING' || macro.regime === 'COMPRESSION';

            if (macro.recommendedDirection && (macro.recommendedDirection === 'LONG' || macro.recommendedDirection === 'SHORT') && (!isBidirectionalStrat || !isRangeOrCompressionMacro)) {
              if (signal.direction !== macro.recommendedDirection) {
                this.logScanResult(
                  symbol,
                  signal.direction,
                  false,
                  `Gate 4 Failed: Signal direction (${signal.direction}) conflicts with Regime Recommended Direction (${macro.recommendedDirection})`,
                  currentPrice,
                  signal.sl,
                  signal.tp1,
                  signal.score,
                  {
                    strategy: (signal as any).strategy || 'ACTIVE_PORTFOLIO',
                    marketRegime: (signal as any).marketRegime || macro?.label || 'RANGING',
                    gateResults: { directionAllowed: 'FAIL' },
                    rejectionReasons: [`Direction veto: ${signal.direction} opposes Regime Recommended Direction ${macro.recommendedDirection} (${macro.details || ''})`]
                  }
                );
                continue;
              }
            }

            // Per-Symbol Higher-Timeframe (1H HTF) Directional Agreement
            if (!this.settings.disabledGates?.htfAgreement && (!isBidirectionalStrat || !isRangeOrCompressionMacro)) {
              const htfCheck = await this.checkHtfAgreement(symbol, signal.direction);
              if (!htfCheck.passed) {
                this.logScanResult(
                  symbol,
                  signal.direction,
                  false,
                  `Gate 5 Failed: ${htfCheck.reason}`,
                  currentPrice,
                  signal.sl,
                  signal.tp1,
                  signal.score,
                  {
                    strategy: (signal as any).strategy || 'ACTIVE_PORTFOLIO',
                    marketRegime: (signal as any).marketRegime || macro?.label || 'RANGING',
                    gateResults: { higherTimeframeAligned: 'FAIL' },
                    rejectionReasons: [htfCheck.reason || 'HTF trend alignment failed']
                  }
                );
                continue;
              }
            }
          }

          // If live exchange execution is active, verify exchange credentials are valid before attempting execution
          const isCoinDcxProvider = this.settings.exchangeProvider === 'COINDCX' || executionAdapter.getExchangeProvider() === 'COINDCX';
          const validExchangeCreds = isCoinDcxProvider ? executionAdapter.isValidCoinDcxCredentials : executionAdapter.isValidCredentials;
          const exchangeCredError = isCoinDcxProvider ? executionAdapter.coindcxCredentialError : executionAdapter.lastCredentialError;

          if (executionAdapter.getIsLive() && !validExchangeCreds) {
            console.warn(`🛡️ [AutoTrader] Execution paused for ${symbol}: ${isCoinDcxProvider ? 'CoinDCX' : 'Binance'} API credentials invalid (${exchangeCredError || 'Unauthorized'}). Update API keys in Settings or switch to Paper mode.`);
            this.logScanResult(symbol, signal.direction, false, `Exchange Credentials Invalid: ${exchangeCredError || 'Rejected API key'}`, currentPrice, signal.sl, signal.tp1, signal.score, {
              strategy: (signal as any).strategy || 'ACTIVE_PORTFOLIO',
              marketRegime: (signal as any).marketRegime || 'LIVE_POSITION',
              rejectionReasons: [`Exchange Credentials Invalid: ${exchangeCredError || 'Rejected API key'}`]
            });
            continue;
          }

          this.pendingSymbols.add(symbol);
          console.log(`🤖 [24/7 AutoTrader] Triggering Autonomous Trade on ${symbol} (${signal.direction}) @ $${currentPrice} [Score: ${signal.score}]`);

          // Calculate trade parameters based on effective live or paper balance
          const dummyBalance = this.getEffectiveAccountEquity();
          // Target allocation percentage: respects accountRiskPct if user configured higher risk
          const targetAllocPct = Math.max(
            Number(this.settings.positionSizePct || 10),
            Number(this.settings.accountRiskPct || 1.5)
          );
          let allocatedBalance = dummyBalance * (Math.min(100, targetAllocPct) / 100);
          let leverage = this.settings.leverage || 1;
          
          // Exchange minNotional check (respects contract-specific minimum, e.g. $50 for BTC, $20 for ETH, $5 for alts)
          const isCoinDcxInr = (this.settings.exchangeProvider === 'COINDCX' || executionAdapter.getExchangeProvider() === 'COINDCX') && (this.settings.coindcxMarginCurrency === 'INR' || !this.settings.coindcxMarginCurrency);
          const liveRate = executionAdapter.getUsdtToInrRate();
          const minNotionalUsd = executionAdapter.getSymbolMinNotional(symbol);
          const maxMarginAllowed = Number(this.settings.maxTradeMarginInr || 200);

          if (isCoinDcxInr) {
            // Strict cap on allocated balance to never exceed maxTradeMarginInr (₹200)
            allocatedBalance = Math.min(allocatedBalance, maxMarginAllowed);
            const minNotionalInr = minNotionalUsd * liveRate;
            if ((allocatedBalance * leverage) < minNotionalInr) {
              const maxLev = executionAdapter.getMaxAllowedLeverage(symbol);
              const neededLev = Math.ceil(minNotionalInr / allocatedBalance);
              if (neededLev <= maxLev) {
                leverage = neededLev;
              } else {
                leverage = maxLev;
              }
            }
          } else {
            if (executionAdapter.getIsLive() && (allocatedBalance * leverage) < minNotionalUsd) {
              allocatedBalance = Math.min(dummyBalance, minNotionalUsd / leverage);
            }
          }
          let quantity = (allocatedBalance * leverage) / currentPrice;

          const finalStrat = (signal as any).strategy || (this.settings.activeStrategy === 'AUTO_REGIME' ? 'BINANCE_COMPOSITE' : this.settings.activeStrategy);
          const marketRegime = (signal as any).marketRegime || null;
          const isAutoRegime = this.settings.activeStrategy === 'AUTO_REGIME' || !!(signal as any).isAutoRegime;

          // Dynamic Margin & Leverage Calibration (User formula: 10% margin, leverage auto-adjusted so SL loses 100% margin)
          const useAutoLeverage = this.settings.autoAdjustLeverageToSl !== false;
          if (signal.sl && useAutoLeverage) {
            const sizeResult = riskManager.calculateSlCalibratedPositionSize(
              dummyBalance,
              currentPrice,
              signal.sl,
              signal.direction,
              {
                marginAllocationPct: Number(this.settings.positionSizePct || 10),
                slPctOfAllocatedMargin: Number(this.settings.slPctOfAllocatedMargin || 100),
                maxLeverage: Number(this.settings.maxAutoLeverage || 50),
                minNotional: executionAdapter.getIsLive() ? executionAdapter.getSymbolMinNotional(symbol) : 0,
                maxMarginInr: Number(this.settings.maxTradeMarginInr || 200),
                maxRiskInr: Number(this.settings.maxRiskPerTradeInr || 100),
                usdtToInrRate: executionAdapter.getUsdtToInrRate(),
                isMarginInr: isCoinDcxInr
              }
            );

            if (sizeResult.rejected || sizeResult.contracts <= 0) {
              console.log(`[AutoTrader] Dynamic SL calibrated sizing rejected for ${symbol}: ${sizeResult.reason}`);
              this.logScanResult(symbol, signal.direction, false, `Risk Manager: ${sizeResult.reason}`, currentPrice, signal.sl, signal.tp1, signal.score, {
                strategy: (signal as any).strategy,
                marketRegime: (signal as any).marketRegime,
                rejectionReasons: [`Risk Manager: ${sizeResult.reason}`]
              });
              this.tradeCooldowns.set(symbol, Date.now() + 60000);
              this.pendingSymbols.delete(symbol);
              continue;
            }

            quantity = sizeResult.contracts;
            leverage = sizeResult.leverage;
            allocatedBalance = sizeResult.allocatedBalance;
          } else if (signal.sl) {
            const riskPct = (Number(this.settings.accountRiskPct) || 1.5) / 100;
            const userTargetAlloc = dummyBalance * (Math.min(100, targetAllocPct) / 100);
            const remainingExposure = riskManager.getRemainingExposure(dummyBalance);
            const maxAllocation = remainingExposure > 0 ? Math.min(userTargetAlloc, remainingExposure) : userTargetAlloc;

            if (maxAllocation <= 0) {
              console.log(`🛡️ [AutoTrader] Sizing skipped for ${symbol}: Maximum exposure limit reached.`);
              this.logScanResult(symbol, signal.direction, false, 'Risk Manager: Maximum exposure limit reached', currentPrice, signal.sl, signal.tp1, signal.score, {
                strategy: (signal as any).strategy,
                marketRegime: (signal as any).marketRegime,
                rejectionReasons: ['Risk Manager: Maximum exposure limit reached']
              });
              this.tradeCooldowns.set(symbol, Date.now() + 60000);
              this.pendingSymbols.delete(symbol);
              continue;
            }

            const sizeResult = riskManager.calculateSafePositionSize(
              dummyBalance,
              currentPrice,
              signal.sl,
              signal.direction,
              { 
                maxLeverage: this.settings.leverage || 1, 
                maxAllocation,
                minLiqBuffer: this.settings.minLiqBuffer,
                maxAccountExposureMultiplier: this.settings.maxAccountExposureMultiplier,
                minStopDistancePct: this.settings.minStopDistancePct !== undefined ? (this.settings.minStopDistancePct > 1 ? this.settings.minStopDistancePct / 100 : this.settings.minStopDistancePct) : undefined,
                maxStopDistancePct: this.settings.maxStopDistancePct !== undefined ? (this.settings.maxStopDistancePct > 1 ? this.settings.maxStopDistancePct / 100 : this.settings.maxStopDistancePct) : undefined,
                maxMarginInr: Number(this.settings.maxTradeMarginInr || 200),
                maxRiskInr: Number(this.settings.maxRiskPerTradeInr || 100),
                usdtToInrRate: executionAdapter.getUsdtToInrRate(),
                isMarginInr: isCoinDcxInr
              },
              riskPct
            );

            if (sizeResult.rejected || sizeResult.contracts <= 0) {
              console.log(`[AutoTrader] Dynamic risk sizing rejected for ${symbol}: ${sizeResult.reason}`);
              this.logScanResult(symbol, signal.direction, false, `Risk Manager: ${sizeResult.reason}`, currentPrice, signal.sl, signal.tp1, signal.score, {
                strategy: (signal as any).strategy,
                marketRegime: (signal as any).marketRegime,
                rejectionReasons: [`Risk Manager: ${sizeResult.reason}`]
              });
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
            this.logScanResult(symbol, signal.direction, false, `Risk Manager: ${riskCheck.reason}`, currentPrice, signal.sl, signal.tp1, signal.score, {
              strategy: (signal as any).strategy,
              marketRegime: (signal as any).marketRegime,
              rejectionReasons: [`Risk Manager: ${riskCheck.reason}`]
            });
            this.tradeCooldowns.set(symbol, Date.now() + 60000);
            this.pendingSymbols.delete(symbol);
            continue;
          }

          // Directional Trade Management & Anti-Whipsaw Flip-Flop Gate
          const dirGateCheck = this.checkTradeManagementGate(symbol, signal.direction);
          if (!dirGateCheck.allowed) {
            console.warn(`🛡️ [TradeManagement] Entry blocked for ${symbol} (${signal.direction}): ${dirGateCheck.reason}`);
            this.logScanResult(symbol, signal.direction, false, `Trade Management: ${dirGateCheck.reason}`, currentPrice, signal.sl, signal.tp1, signal.score, {
              strategy: finalStrat,
              marketRegime: (signal as any).marketRegime,
              rejectionReasons: [`Trade Management: ${dirGateCheck.reason}`]
            });
            this.pendingSymbols.delete(symbol);
            continue;
          }

          if (!this.isEngineActive()) {
            console.log(`🛑 [AutoTrader] Trade execution blocked for ${symbol}: Engine is stopped.`);
            this.pendingSymbols.delete(symbol);
            continue;
          }

          // Pre-execution Setup Accuracy Validation: protect against live price slip violating SL/TP
          if (signal.sl) {
            if (signal.direction === 'LONG' && signal.sl >= currentPrice) {
              console.warn(`🛡️ [AutoTrader] Execution skipped for ${symbol}: Long SL ($${signal.sl}) >= live entry price ($${currentPrice}).`);
              this.logScanResult(symbol, signal.direction, false, `Inaccurate setup: Long SL ($${signal.sl}) >= entry ($${currentPrice})`, currentPrice, signal.sl, signal.tp1, signal.score, {
                strategy: finalStrat,
                marketRegime: (signal as any).marketRegime,
                rejectionReasons: [`Long SL ($${signal.sl}) >= entry ($${currentPrice})`]
              });
              this.pendingSymbols.delete(symbol);
              continue;
            }
            if (signal.direction === 'SHORT' && signal.sl <= currentPrice) {
              console.warn(`🛡️ [AutoTrader] Execution skipped for ${symbol}: Short SL ($${signal.sl}) <= live entry price ($${currentPrice}).`);
              this.logScanResult(symbol, signal.direction, false, `Inaccurate setup: Short SL ($${signal.sl}) <= entry ($${currentPrice})`, currentPrice, signal.sl, signal.tp1, signal.score, {
                strategy: finalStrat,
                marketRegime: (signal as any).marketRegime,
                rejectionReasons: [`Short SL ($${signal.sl}) <= entry ($${currentPrice})`]
              });
              this.pendingSymbols.delete(symbol);
              continue;
            }
          }
          if (signal.tp1) {
            if (signal.direction === 'LONG' && signal.tp1 <= currentPrice) {
              console.warn(`🛡️ [AutoTrader] Execution skipped for ${symbol}: Long TP1 ($${signal.tp1}) <= live entry price ($${currentPrice}).`);
              this.pendingSymbols.delete(symbol);
              continue;
            }
            if (signal.direction === 'SHORT' && signal.tp1 >= currentPrice) {
              console.warn(`🛡️ [AutoTrader] Execution skipped for ${symbol}: Short TP1 ($${signal.tp1}) >= live entry price ($${currentPrice}).`);
              this.pendingSymbols.delete(symbol);
              continue;
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
            strategyRegimeStatus: 'IN_FAVOR',
            strategyRegimeFavorable: true,
            isAutoRegime,
            frequencyPreset: this.settings.tradeFrequency || 'MEDIUM',
            compressionHigh: (signal as any).compressionHigh,
            compressionLow: (signal as any).compressionLow,
            macroColor: (signal as any).macroColor,
            macroLabel: (signal as any).macroLabel,
            regimeConfidence: (signal as any).regimeConfidence,
            confidenceLevel: (signal as any).confidenceLevel,
            tradeQuality: (signal as any).tradeQuality,
            strategyPriority: (signal as any).strategyPriority,
            rrStruct: (signal as any).rrStruct,
            structuralRR: (signal as any).structuralRR,
            triggerLevel: (signal as any).triggerLevel,
            invalidationLevel: (signal as any).invalidationLevel,
            retestTolerance: (signal as any).retestTolerance,
            retestArea: (signal as any).retestArea,
            lifecycleState: (signal as any).lifecycleState,
            entryMode: (signal as any).entryMode,
            retestClassification: (signal as any).retestClassification,
            retestDetails: (signal as any).retestDetails
          })
          .then(async (posId) => {
            if (posId) {
              this.logScanResult(symbol, signal.direction, true, '', currentPrice, signal.sl, signal.tp1, signal.score, {
                strategy: finalStrat,
                marketRegime: (signal as any).marketRegime,
                strategyRegimeStatus: 'IN_FAVOR',
                regimeConfidence: (signal as any).regimeConfidence,
                tradeQuality: (signal as any).tradeQuality,
                strategyPriority: (signal as any).strategyPriority,
                structuralRR: (signal as any).structuralRR
              });
              await positionMonitor.refreshOpenPositions();
              this.tradeCooldowns.set(symbol, Date.now());
              if ((signal as any).signalTime) {
                  this.lastTradedSignal.set(symbol, (signal as any).signalTime);
              }
            } else {
              this.logScanResult(symbol, signal.direction, false, 'Exchange rejected symbol status: not open for opening positions (-4140)', currentPrice, signal.sl, signal.tp1, signal.score, {
                strategy: finalStrat,
                marketRegime: (signal as any).marketRegime,
                rejectionReasons: ['Exchange rejected symbol status: not open for opening positions (-4140)']
              });
              this.tradeCooldowns.set(symbol, Date.now() + 300000);
            }
          })
          .catch((err) => {
            if (err.message && err.message.includes("Risk manager check disallowed trade")) { 
              console.log(`AutoTrader skipped ${symbol}: ${err.message}`); 
            } else if (err.message && (err.message.includes("-2015") || err.message.includes("Invalid API-key") || err.message.includes("permissions for action"))) {
              console.warn(`🛡️ [AutoTrader] Order execution notice for ${symbol}: Exchange credentials invalid or unauthorized (-2015).`);
            } else if (err.message && (err.message.includes("-4140") || err.message.includes("Invalid symbol status") || err.message.includes("opening position"))) {
              console.warn(`⚠️ [AutoTrader] Skipped trade for ${symbol}: Exchange symbol status invalid for opening positions (-4140).`);
            } else { 
              console.error(`AutoTrader error opening ${symbol}:`, err); 
            }
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

  public getTradeExecutionStatus() {
    const isEngineRunning = this.isEngineActive();
    const isAutoTradeEnabled = this.settings.autoTradeEnabled !== false;
    const balance = this.settings.demoBalance || this.settings.startingBalance || 10000;
    const risk = riskManager.getRiskStatus(balance);
    const activePositions = positionMonitor.getActivePositions();
    const openCount = activePositions.length;
    const maxTrades = this.settings.maxConcurrentTrades || 5;

    const activeList = (this.settings.activeStrategies && this.settings.activeStrategies.length > 0)
      ? this.settings.activeStrategies.filter(s => s !== 'NONE')
      : (this.settings.activeStrategy && this.settings.activeStrategy !== 'NONE' ? [this.settings.activeStrategy] : []);

    if (!this.cachedGlobalRegime) {
      this.getGlobalRegime().catch(() => {});
    }
    const macro = this.cachedGlobalRegime;
    const macroColor = macro?.macroColor || (macro?.breadth && macro.breadth.trendingDownPct > macro.breadth.trendingUpPct ? 'RED' : 'AMBER');
    const isMacroTradable = macro ? macro.isTradable : true;
    const isFeedStale = Boolean(priceStream.isStale);
    const isLive = this.settings.tradingMode === 'LIVE' || (!this.settings.binanceTestnet && (this.settings as any).liveTradingActive);
    const hasLiveKeys = !isLive || Boolean(this.settings.binanceApiKey && this.settings.binanceApiSecret);

    const now = Date.now();
    const quarantinedList = Array.from(this.symbolQuarantineUntil.entries())
      .filter(([_, q]) => q.until > now)
      .map(([sym, q]) => ({
        symbol: sym,
        reason: q.reason,
        remainingMinutes: Math.ceil((q.until - now) / 60000)
      }));

    const postSlMinutes = this.settings.postSlCooldownMinutes ?? 30;
    const postSlMs = postSlMinutes * 60000;
    const postSlList = Array.from(this.symbolLastLoss.entries())
      .filter(([_, l]) => (now - l.closeTime) < postSlMs)
      .map(([sym, l]) => ({
        symbol: sym,
        lastDirection: l.direction,
        exitReason: l.exitReason,
        remainingMinutes: Math.ceil((postSlMs - (now - l.closeTime)) / 60000)
      }));

    const isCircuitBreakerTripped = false;
    const circuitBreakerRemainingMinutes = 0;

    const guardrails = [
      {
        id: 'ENGINE_STATUS',
        label: 'Engine Master Switch',
        passed: isEngineRunning && isAutoTradeEnabled,
        metric: isEngineRunning ? 'RUNNING' : 'STOPPED',
        reason: 'Master trading engine is stopped. Autonomous scanning and trade execution are paused.',
        actionType: 'START_ENGINE' as const
      },
      {
        id: 'ACTIVE_STRATEGIES',
        label: 'Active Strategy Assignment',
        passed: activeList.length > 0,
        metric: activeList.length > 0 ? `${activeList.length} Active (${activeList.join(', ')})` : '0 Active (Stand Aside)',
        reason: 'No trading strategies active in your portfolio. Both Trend-Pullback and SMC are inactive.',
        actionType: 'ACTIVATE_STRATEGIES' as const
      },
      {
        id: 'KILL_SWITCH',
        label: 'Emergency Risk Kill-Switch',
        passed: !this.settings.killSwitchActive && !risk.killSwitchActive,
        metric: (this.settings.killSwitchActive || risk.killSwitchActive) ? 'ENGAGED' : 'DISARMED',
        reason: 'Emergency master kill-switch is engaged. All automated trade entries are locked out.',
        actionType: 'RESET_KILL_SWITCH' as const
      },
      {
        id: 'DAILY_LOSS_LIMIT',
        label: 'Daily Loss Circuit Breaker',
        passed: risk.currentDailyLossPct > risk.dailyLossLimitPct,
        metric: `${risk.currentDailyLossPct.toFixed(2)}% / limit: ${risk.dailyLossLimitPct.toFixed(2)}%`,
        reason: `Risk Circuit Breaker Tripped: Daily loss has reached ${risk.currentDailyLossPct.toFixed(2)}% (limit: ${risk.dailyLossLimitPct.toFixed(2)}%). Trading is halted until daily reset.`,
        actionType: 'RESET_CIRCUIT_BREAKER' as const
      },
      {
        id: 'CONSECUTIVE_LOSS_LIMIT',
        label: 'Consecutive Loss Limit',
        passed: risk.consecutiveLosses < risk.maxConsecutiveLosses,
        metric: `${risk.consecutiveLosses} / max: ${risk.maxConsecutiveLosses} Losses`,
        reason: `Circuit Breaker Tripped: ${risk.consecutiveLosses} consecutive losses reached (limit: ${risk.maxConsecutiveLosses}). Trading halted for cool-off.`,
        actionType: 'RESET_CIRCUIT_BREAKER' as const
      },
      {
        id: 'POSITION_CAPACITY',
        label: 'Concurrent Positions Capacity',
        passed: openCount < maxTrades,
        metric: `${openCount} / ${maxTrades} Open Positions`,
        reason: `Maximum concurrent open positions reached (${openCount}/${maxTrades}). Waiting for positions to close before opening new trades.`,
        actionType: 'VIEW_POSITIONS' as const
      },
      {
        id: 'MARKET_FEED',
        label: 'Live Price Data Stream',
        passed: !isFeedStale,
        metric: isFeedStale ? 'STALE (>15s gap)' : 'LIVE STREAMING',
        reason: 'Binance WebSocket price stream is stale. Trade executions held until live feed recovers.',
        actionType: 'RECONNECT_FEED' as const
      },
      {
        id: 'LIVE_CREDENTIALS',
        label: 'Exchange Bot Credentials',
        passed: isLive
          ? (this.settings.exchangeProvider === 'COINDCX'
              ? (!!this.settings.coindcxApiKey && !!this.settings.coindcxApiSecret && executionAdapter.isValidCoinDcxCredentials)
              : (!!this.settings.binanceApiKey && !!this.settings.binanceApiSecret && executionAdapter.isValidCredentials))
          : true,
        metric: !isLive
          ? 'PAPER MODE (Simulated)'
          : this.settings.exchangeProvider === 'COINDCX'
          ? (!this.settings.coindcxApiKey || !this.settings.coindcxApiSecret
              ? 'MISSING COINDCX KEYS'
              : !executionAdapter.isValidCoinDcxCredentials
              ? 'INVALID COINDCX KEYS'
              : 'COINDCX INR FUTURES CONNECTED')
          : !this.settings.binanceApiKey || !this.settings.binanceApiSecret
          ? 'MISSING API KEYS'
          : !executionAdapter.isValidCredentials
          ? 'INVALID API KEY (-2015)'
          : (this.settings.tradingMode === 'TESTNET' || (this.settings.binanceTestnet && this.settings.tradingMode !== 'PAPER'))
          ? 'TESTNET CONNECTED'
          : 'LIVE CONNECTED',
        reason: isLive && this.settings.exchangeProvider === 'COINDCX' && !executionAdapter.isValidCoinDcxCredentials
          ? `CoinDCX rejected API credentials: ${executionAdapter.coindcxCredentialError || 'Invalid credentials'}. Please update your CoinDCX API Key and Secret in Settings.`
          : isLive && !executionAdapter.isValidCredentials
          ? `Binance rejected API credentials: ${executionAdapter.lastCredentialError || 'Invalid API-key, IP, or permissions (-2015)'}. Please update your API Key and Secret in Settings.`
          : 'Live Trading Mode is enabled, but Exchange API Key or Secret is missing in Bot Credentials.',
        actionType: 'ADD_CREDENTIALS' as const
      },
      {
        id: 'LAYER3_TRADEABILITY',
        label: 'Layer 3: Tradeability Gate',
        passed: this.settings.layer3TradeabilityGateEnabled === false || isMacroTradable,
        metric: this.settings.layer3TradeabilityGateEnabled === false
          ? 'BYPASSED (OFF)'
          : isMacroTradable
          ? 'PASSED (HIGH/NORMAL EDGE)'
          : 'LOW EDGE DAY (FEE DRAG > 15%)',
        reason: 'Layer 3 Tradeability Gate blocked trading: Fee drag exceeds threshold relative to current market volatility.',
        actionType: 'BYPASS_TRADEABILITY_GATE' as const
      },
      {
        id: 'REGIME_DIRECTION',
        label: 'Regime Recommended Direction Gate',
        passed: true,
        metric: this.settings.regimeDirectionEnforced === false
          ? 'OFF (Both Directions)'
          : `ENFORCED (${macro?.recommendedDirection || 'SHORT'} ONLY)`,
        reason: this.settings.regimeDirectionEnforced === false
          ? 'Direction gate is bypassed. Both Long and Short signals are permitted.'
          : `Trades strictly locked to regime recommended direction (${macro?.recommendedDirection || 'SHORT'}). Opposing signals are blocked.`,
        actionType: 'NONE' as const
      }
    ];

    const firstFailed = guardrails.find(g => !g.passed);
    const blocked = Boolean(firstFailed);

    return {
      blocked,
      reason: firstFailed ? firstFailed.reason : null,
      code: firstFailed ? firstFailed.id : 'OK',
      actionType: firstFailed ? firstFailed.actionType : 'NONE',
      guardrails: guardrails.map(g => ({
        id: g.id,
        label: g.label,
        passed: g.passed,
        metric: g.metric,
        reason: g.reason
      })),
      quarantinedSymbols: quarantinedList,
      postSlCooldownSymbols: postSlList,
      accountCircuitBreakerActive: isCircuitBreakerTripped,
      accountCircuitBreakerRemainingMinutes: circuitBreakerRemainingMinutes,
      summary: {
        engineRunning: isEngineRunning,
        activeStrategies: activeList,
        openPositionsCount: openCount,
        maxPositionsLimit: maxTrades,
        dailyLossPct: risk.currentDailyLossPct,
        dailyLossLimit: risk.dailyLossLimitPct,
        consecutiveLosses: risk.consecutiveLosses,
        maxConsecutiveLosses: risk.maxConsecutiveLosses,
        killSwitchActive: risk.killSwitchActive || this.settings.killSwitchActive,
        macroColor,
        isFeedStale,
        recommendedDirection: macro?.recommendedDirection || (macro?.breadth && macro.breadth.trendingDownPct > macro.breadth.trendingUpPct ? 'SHORT' : 'BOTH'),
        directionBiasLabel: macro?.directionBiasLabel || (macro?.breadth && macro.breadth.trendingDownPct > macro.breadth.trendingUpPct ? 'BEARISH' : 'NEUTRAL'),
        regimeDirectionEnforced: this.settings.regimeDirectionEnforced !== false
      }
    };
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
      strategyRegimeStatus?: 'IN_FAVOR' | 'WAITING' | 'NEUTRAL';
      strategyRegimeFavorable?: boolean;
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

    // Signal Audit Trail integration - Only record actual strategy evaluations or filtered signals, not idle no-trigger ticks
    if (rejectReason?.includes('No setup matching active strategies') || (!rejectReason && !passes) || symbol === 'GLOBAL') {
      return;
    }

    try {
      const decision = passes ? 'ENTER' : (rejectReason?.includes('Paused') || rejectReason?.includes('Failed Technical') ? 'WATCH' : 'REJECT');
      
      const symbolClassification = this.symbolRegimeClassification.get(symbol);
      const symbolState = this.symbolRegimeStates.get(symbol);
      let effectiveRegime = extra?.marketRegime || symbolClassification?.label || symbolClassification?.regime || symbolState?.confirmedRegime || symbolState?.candidateRegime || this.cachedGlobalRegime?.regime || 'RANGING';
      if (!effectiveRegime || effectiveRegime === 'UNKNOWN' || effectiveRegime === 'UNKNOWN_REGIME') {
        effectiveRegime = 'RANGING';
      }

      let effectiveStrategy = extra?.strategy || extra?.strategyPriority || (this.settings.activeStrategies?.length === 1 ? this.settings.activeStrategies[0] : (this.settings.activeStrategy && this.settings.activeStrategy !== 'NONE' ? this.settings.activeStrategy : 'ACTIVE_PORTFOLIO'));
      if (!effectiveStrategy || effectiveStrategy === 'UNKNOWN_STRATEGY' || effectiveStrategy === 'UNKNOWN') {
        effectiveStrategy = 'ACTIVE_PORTFOLIO';
      }

      writeSignalAudit({
        signalId: `${symbol}-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
        symbol: symbol,
        timeframe: this.settings.timeframe || '15m',
        strategy: effectiveStrategy,
        regime: effectiveRegime,
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
        volumePercentile: extra?.volumePercentile ?? null
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
          .map(s => s.endsWith('USDT') ? s : `${s}USDT`)
          .filter(s => executionAdapter.isSymbolTradable(s));
        if (customSymbols.length > 0) {
          return customSymbols;
        }
      }

      // Ensure exchangeInfo cache is loaded before filtering
      if (Object.keys(executionAdapter.getExchangeInfoCache()).length === 0) {
        await executionAdapter.loadExchangeInfo();
      }

      const res = await fetch('https://fapi.binance.com/fapi/v1/ticker/24hr');
      if (!res.ok) {
        await res.text().catch(() => {});
        return ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'DOGEUSDT', 'ADAUSDT'].filter(s => executionAdapter.isSymbolTradable(s));
      }
      const data: any = await res.json();

      // Enforce strict liquidity guardrails: exclude illiquid/low-cap pairs below min24hVolume (default $25M)
      const minVolume = (this.settings.multicoinMin24hVolumeUsdt && this.settings.multicoinMin24hVolumeUsdt > 0)
        ? this.settings.multicoinMin24hVolumeUsdt
        : ((this.settings.min24hVolume && this.settings.min24hVolume > 0)
          ? this.settings.min24hVolume
          : 20000000);

      // Filter out stablecoins and wrapped/derivative coins if requested or scalper active
      const filterStables = this.settings.multicoinFilterStables !== false;
      const STABLE_EXCLUSIONS = new Set([
        'USDCUSDT', 'FDUSDUSDT', 'TUSDUSDT', 'BUSDUSDT', 'USDPUSDT', 'EURUSDT', 
        'STETHUSDT', 'WBTCUSDT', 'WBETHUSDT', 'DAIUSDT', 'AEURUSDT', 'SUSDUSDT'
      ]);

      // Reliable symbol prioritization: BTC, ETH, SOL, XRP have verified real-time tracking
      const prioritySymbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT'].filter(s => executionAdapter.isSymbolTradable(s));
      let usdtPairs = data
        .filter((d: any) => d.symbol.endsWith('USDT') && !d.symbol.includes('_'))
        .filter((d: any) => !filterStables || !STABLE_EXCLUSIONS.has(d.symbol))
        .filter((d: any) => parseFloat(d.quoteVolume || '0') >= minVolume)
        .filter((d: any) => executionAdapter.isSymbolTradable(d.symbol))
        .sort((a: any, b: any) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume))
        .map((d: any) => d.symbol);

      if (usdtPairs.length < limit) {
        const fallbackPairs = data
          .filter((d: any) => d.symbol.endsWith('USDT') && !d.symbol.includes('_'))
          .filter((d: any) => !filterStables || !STABLE_EXCLUSIONS.has(d.symbol))
          .filter((d: any) => executionAdapter.isSymbolTradable(d.symbol))
          .sort((a: any, b: any) => parseFloat(b.quoteVolume || '0') - parseFloat(a.quoteVolume || '0'))
          .map((d: any) => d.symbol);
        usdtPairs = Array.from(new Set([...usdtPairs, ...fallbackPairs]));
      }

      const orderedSymbols = Array.from(new Set([...prioritySymbols, ...usdtPairs])).slice(0, limit);
      return orderedSymbols.length > 0 ? orderedSymbols : prioritySymbols;
    } catch (e) {
      return ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT'].filter(s => executionAdapter.isSymbolTradable(s));
    }
  }

  private async getKlines(symbol: string, timeframe: string): Promise<any[]> {
    const cacheKey = `${symbol}_${timeframe}`;
    const cached = this.klineCache.get(cacheKey);
    const now = Date.now();

    if (now < this.rateLimitedUntil) {
      return (cached && now - cached.time < 120000) ? cached.klines : [];
    }

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
        if (res.status === 429 || res.status === 418) {
          const retryAfter = res.headers?.get('retry-after');
          const waitMs = retryAfter ? (parseInt(retryAfter, 10) * 1000 || 60000) : 60000;
          this.rateLimitedUntil = Date.now() + waitMs;
          console.warn(`⚠️ [AutoTrader] Binance rate limit hit on klines (HTTP ${res.status}). Pausing requests until ${new Date(this.rateLimitedUntil).toISOString()}`);
        }
        await res.text().catch(() => {});
        return (cached && now - cached.time < 120000) ? cached.klines : [];
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
      return cached ? cached.klines : [];
    }
  }

  
  private async evaluateSignal(symbol: string, klines: any[], currentPrice: number) {
    if (!this.isEngineActive()) return null;
    if (klines.length < 35) return null;

    // 1. Local Per-Coin Technical Classification on closed bars
    const closedKlines = klines.slice(0, -1);
    const lastClosedCandle = closedKlines[closedKlines.length - 1];
    const closedPrice = lastClosedCandle?.close || currentPrice;
    const classification = classifyMarketRegime(closedKlines, closedPrice);
    this.recordSymbolRegimeClassification(symbol, classification);

    // 2. Evaluate Strategy Routing (Each strategy executes its own Market Regime Filter)
    const rawSignal = await this._evaluateSignalRaw(symbol, klines, currentPrice, classification);
    if (!rawSignal) return null;
    
    // Strict Stop-Loss Gate Enforcement
    if (this.settings.enforceStrictSl !== false) {
      if (!rawSignal.sl || rawSignal.sl <= 0 || isNaN(rawSignal.sl)) {
        this.logScanResult(symbol, rawSignal.direction, false, 'Gate Failed: Setup lacks a valid Stop-Loss price (Strict SL rule)', currentPrice, 0, rawSignal.tp1, rawSignal.score, {
          strategy: rawSignal.strategy,
          marketRegime: rawSignal.marketRegime,
          rejectionReasons: ['Gate Failed: Setup lacks a valid Stop-Loss price']
        });
        return null;
      }
    }

    // Accurate Setup Gate: Validate directional alignment of Stop-Loss and Take-Profit against entry price
    if (rawSignal.direction === 'LONG') {
      if (rawSignal.sl >= currentPrice) {
        this.logScanResult(symbol, rawSignal.direction, false, `Gate Failed: Long SL ($${rawSignal.sl}) must be strictly below entry price ($${currentPrice})`, currentPrice, rawSignal.sl, rawSignal.tp1, rawSignal.score, {
          strategy: rawSignal.strategy,
          marketRegime: rawSignal.marketRegime,
          rejectionReasons: [`Long SL ($${rawSignal.sl}) >= entry ($${currentPrice})`]
        });
        return null;
      }
      if (rawSignal.tp1 && rawSignal.tp1 <= currentPrice) {
        this.logScanResult(symbol, rawSignal.direction, false, `Gate Failed: Long TP1 ($${rawSignal.tp1}) must be strictly above entry price ($${currentPrice})`, currentPrice, rawSignal.sl, rawSignal.tp1, rawSignal.score, {
          strategy: rawSignal.strategy,
          marketRegime: rawSignal.marketRegime,
          rejectionReasons: [`Long TP1 ($${rawSignal.tp1}) <= entry ($${currentPrice})`]
        });
        return null;
      }
    } else if (rawSignal.direction === 'SHORT') {
      if (rawSignal.sl <= currentPrice) {
        this.logScanResult(symbol, rawSignal.direction, false, `Gate Failed: Short SL ($${rawSignal.sl}) must be strictly above entry price ($${currentPrice})`, currentPrice, rawSignal.sl, rawSignal.tp1, rawSignal.score, {
          strategy: rawSignal.strategy,
          marketRegime: rawSignal.marketRegime,
          rejectionReasons: [`Short SL ($${rawSignal.sl}) <= entry ($${currentPrice})`]
        });
        return null;
      }
      if (rawSignal.tp1 && rawSignal.tp1 >= currentPrice) {
        this.logScanResult(symbol, rawSignal.direction, false, `Gate Failed: Short TP1 ($${rawSignal.tp1}) must be strictly below entry price ($${currentPrice})`, currentPrice, rawSignal.sl, rawSignal.tp1, rawSignal.score, {
          strategy: rawSignal.strategy,
          marketRegime: rawSignal.marketRegime,
          rejectionReasons: [`Short TP1 ($${rawSignal.tp1}) >= entry ($${currentPrice})`]
        });
        return null;
      }
    }

    const risk = Math.abs(currentPrice - rawSignal.sl);
    if (risk <= 0) return null;

    // Minimum stop distance check (respects user's minStopDistancePct setting if set, else defaults)
    const configuredMinStopPct = this.settings.minStopDistancePct !== undefined
      ? (this.settings.minStopDistancePct > 1 ? this.settings.minStopDistancePct / 100 : this.settings.minStopDistancePct)
      : (rawSignal.strategy === 'MULTICOIN_SCALPER_PRO' ? 0.0015 : 0.003);
    const minDistance = currentPrice * configuredMinStopPct;
    if (risk < minDistance) {
      this.logScanResult(symbol, rawSignal.direction, false, `Gate Failed: SL too tight (Risk: ${(risk/currentPrice*100).toFixed(2)}%, Min: ${(minDistance/currentPrice*100).toFixed(2)}%)`, currentPrice, rawSignal.sl, rawSignal.tp1, rawSignal.score, {
        strategy: rawSignal.strategy,
        marketRegime: rawSignal.marketRegime,
        rejectionReasons: [`Gate Failed: SL too tight (Risk: ${(risk/currentPrice*100).toFixed(2)}%)`]
      });
      return null;
    }

    // Maximum stop distance check (respects user's maxStopDistancePct setting to prevent excessive risk)
    const configuredMaxStopPct = this.settings.maxStopDistancePct !== undefined
      ? (this.settings.maxStopDistancePct > 1 ? this.settings.maxStopDistancePct / 100 : this.settings.maxStopDistancePct)
      : 0.05;
    const maxDistance = currentPrice * configuredMaxStopPct;
    if (risk > maxDistance) {
      this.logScanResult(symbol, rawSignal.direction, false, `Gate Failed: SL too wide (Risk: ${(risk/currentPrice*100).toFixed(2)}%, Max: ${(maxDistance/currentPrice*100).toFixed(2)}%)`, currentPrice, rawSignal.sl, rawSignal.tp1, rawSignal.score, {
        strategy: rawSignal.strategy,
        marketRegime: rawSignal.marketRegime,
        rejectionReasons: [`Gate Failed: SL too wide (Risk: ${(risk/currentPrice*100).toFixed(2)}%)`]
      });
      return null;
    }
    
    // 3. Structural R:R Filter (Stand-Aside Rule)
    const targetPrice = rawSignal.tp3 || rawSignal.tp2 || rawSignal.tp1;
    const reward3 = targetPrice ? Math.abs(targetPrice - currentPrice) : 0;
    const structuralRR = (risk > 0 && reward3 > 0) ? reward3 / risk : 0;
    
    let strategyMinRR = 3.0;
    if (rawSignal.strategy === 'MULTICOIN_SCALPER_PRO') {
      strategyMinRR = this.settings.multicoinProfile === '15m_SWING' ? 1.5 : 1.2;
    } else if (rawSignal.strategy === 'RANGE_REGIME_V1' || rawSignal.strategy === 'RANGE_REGIME') {
      strategyMinRR = (this.settings as any).rangeRegimeParams?.minRewardRisk ?? 1.5;
    } else if (rawSignal.strategy === 'VCB' || rawSignal.strategy === 'VOLATILITY_COMPRESSION') {
      strategyMinRR = (this.settings as any).vcbParams?.minRewardRisk ?? 2.0;
    } else if (rawSignal.strategy === 'LIQUIDITY_SWEEP_REVERSAL') {
      strategyMinRR = this.settings.lsrMinRewardRisk ?? 2.0;
    } else if (rawSignal.strategy === 'TREND_PULLBACK') {
      strategyMinRR = this.settings.tpMinRiskRewardRatio ?? 2.0;
    } else if (rawSignal.strategy === 'ORDER_BLOCK') {
      strategyMinRR = this.settings.obMinRr ?? 3.5;
    } else if (rawSignal.strategy === 'COIL_BREAKOUT') {
      strategyMinRR = this.settings.coilMinRewardRisk ?? 5.0;
    } else if (rawSignal.strategy === 'DELTA_CLIMAX' || classification.regime.startsWith('EXHAUSTION')) {
      strategyMinRR = this.settings.crMinRewardRisk ?? 2.5;
    }

    const minRR = (this.settings.minRRRatio !== undefined && this.settings.minRRRatio > 0)
      ? Math.min(strategyMinRR, this.settings.minRRRatio)
      : strategyMinRR;

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
    if (classification.confidence >= 75) qualityScore += 30;
    else if (classification.confidence >= 65) qualityScore += 20;
    if (structuralRR >= 4) qualityScore += 25;
    if (priorityNum === 1) qualityScore += 25;

    let tradeQuality: 'High' | 'Medium' | 'Low' = 'Low';
    if (qualityScore >= 75) tradeQuality = 'High';
    else if (qualityScore >= 50) tradeQuality = 'Medium';

    return {
      ...rawSignal,
      strategyRegimeStatus: 'IN_FAVOR' as const,
      regimeFavorable: true,
      marketRegime: rawSignal.marketRegime || classification.label,
      regimeConfidence: classification.confidence,
      confidenceLevel,
      tradeQuality,
      strategyPriority,
      rrStruct,
      structuralRR: parseFloat(structuralRR.toFixed(2))
    };
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
    const deletedStrats = this.settings.deletedStrategies || [];
    const rawStrategies: string[] = Array.isArray(this.settings.activeStrategies)
      ? this.settings.activeStrategies
      : (this.settings.activeStrategy && this.settings.activeStrategy !== 'NONE' ? [this.settings.activeStrategy] : []);
    const activeStrategies: string[] = rawStrategies.filter(s => !deletedStrats.includes(s));
    if (activeStrategies.length === 0) {
      return null;
    }
    
    const isObActive = activeStrategies.includes('ORDER_BLOCK');
    const isLsrActive = activeStrategies.includes('LIQUIDITY_SWEEP_REVERSAL') || activeStrategies.includes('SMC_LIQUIDITY') || activeStrategies.includes('SMC_LIQUIDITY_SWEEP');
    const isSmcActive = activeStrategies.includes('SMC_LIQUIDITY') || activeStrategies.includes('SMC_LIQUIDITY_SWEEP');
    const isTpActive = activeStrategies.includes('TREND_PULLBACK');
    const isScalperActive = activeStrategies.includes('MULTICOIN_SCALPER_PRO');
    const isCoilActive = activeStrategies.includes('COIL_BREAKOUT');
    const isDeltaActive = activeStrategies.includes('DELTA_CLIMAX');
    const isVcbActive = activeStrategies.includes('VCB') || activeStrategies.includes('VOLATILITY_COMPRESSION');
    const isCompositeActive = activeStrategies.includes('BINANCE_COMPOSITE');
    const isRangeRegimeActive = activeStrategies.includes('RANGE_REGIME_V1') || activeStrategies.includes('RANGE_REGIME');

    let obResult: any = null;
    let lsrResult: any = null;
    let smcResult: any = null;
    let tpResult: any = null;
    let scalperResult: any = null;
    let coilResult: any = null;
    let deltaResult: any = null;
    let vcbResult: any = null;
    let compositeResult: any = null;
    let rangeRegimeResult: any = null;

    // Evaluate Two-Sided Coil / Compression Breakout Strategy (1:5+ R:R)
    if (isCoilActive) {
      const htfKlines = await this.getKlines(symbol, '1H');
      const btcKlines = symbol !== 'BTCUSDT' ? await this.getKlines('BTCUSDT', '15m') : [];
      const coilSignal = evaluateCoilBreakout(klines, htfKlines, currentPrice, { ...this.settings, symbol } as any, btcKlines);
      if (coilSignal) {
        if (coilSignal.finalDecision === 'EXECUTE') {
          const riskDist = Math.abs(currentPrice - coilSignal.stopLossPrice);
          const tp1Mult = this.settings.tp1AtrMultiple || 2.0;
          const tp2Mult = this.settings.tp2AtrMultiple || 3.5;
          const tp1 = coilSignal.direction === 'LONG' ? currentPrice + (riskDist * tp1Mult) : currentPrice - (riskDist * tp1Mult);
          const tp2 = coilSignal.direction === 'LONG' ? currentPrice + (riskDist * tp2Mult) : currentPrice - (riskDist * tp2Mult);
          coilResult = {
            direction: coilSignal.direction,
            score: coilSignal.score,
            atr: coilSignal.atrValue,
            sl: coilSignal.stopLossPrice,
            tp1,
            tp2,
            tp3: coilSignal.targetPrice,
            strategy: 'COIL_BREAKOUT',
            marketRegime: `Two-Sided Coil Breakout (1:${coilSignal.riskRewardRatio} R:R)`,
            reason: coilSignal.reason,
            signalTime: coilSignal.signalTime,
            structuralRR: coilSignal.riskRewardRatio
          };
        } else {
          this.logScanResult(
            symbol,
            coilSignal.direction,
            false,
            coilSignal.displayStatus,
            currentPrice,
            coilSignal.stopLossPrice,
            coilSignal.targetPrice,
            coilSignal.score,
            {
              strategy: 'COIL_BREAKOUT',
              marketRegime: `Coil (${coilSignal.coilRange.length} bars)`,
              rejectionReasons: [coilSignal.displayStatus],
              atr: coilSignal.atrValue,
              structuralRR: coilSignal.riskRewardRatio
            }
          );
        }
      }
    }

    // Evaluate 3Commas Multicoin Scalper PRO (SwissAlgo)
    if (isScalperActive) {
      let htfKlines: any[] = [];
      const profile = this.settings.multicoinProfile || (this.settings.timeframe === '15m' ? '15m_SWING' : '5m_SCALP');
      if (profile === '15m_SWING' && (this.settings.multicoinUseHtfFilter !== false)) {
        htfKlines = await this.getKlines(symbol, '1H');
      }
      
      const liq = this.tickerLiquidityMap.get(symbol);
      const scalperLiquidity = liq ? {
        quoteVolume24h: liq.quoteVolume,
        spreadPct: liq.spreadBps ? (liq.spreadBps / 100) : 0
      } : undefined;

      const scalperSignal = evaluateMulticoinScalperPro(
        klines, 
        htfKlines, 
        currentPrice, 
        { ...this.settings, symbol } as any, 
        scalperLiquidity
      );
      if (scalperSignal) {
        if (scalperSignal.finalDecision === 'EXECUTE') {
          scalperResult = {
            direction: scalperSignal.direction,
            score: scalperSignal.score,
            atr: scalperSignal.atrValue,
            sl: scalperSignal.stopLossPrice,
            tp1: scalperSignal.tp1,
            tp2: scalperSignal.tp2,
            tp3: scalperSignal.tp2 * (scalperSignal.direction === 'LONG' ? 1.008 : 0.992),
            strategy: 'MULTICOIN_SCALPER_PRO',
            marketRegime: `Scalper PRO (${scalperSignal.profile}): ${scalperSignal.pattern}`,
            reason: scalperSignal.reason,
            signalTime: scalperSignal.signalTime,
            structuralRR: scalperSignal.riskRewardRatio
          };
        } else {
          this.logScanResult(
            symbol,
            scalperSignal.direction,
            false,
            scalperSignal.exactRejectionReason || scalperSignal.status,
            currentPrice,
            scalperSignal.stopLossPrice,
            scalperSignal.tp1,
            scalperSignal.score,
            {
              strategy: 'MULTICOIN_SCALPER_PRO',
              marketRegime: `Profile: ${scalperSignal.profile}`,
              rejectionReasons: [scalperSignal.exactRejectionReason || 'REJECTED'],
              atr: scalperSignal.atrValue,
              structuralRR: scalperSignal.riskRewardRatio
            }
          );
        }
      }
    }

    // Evaluate Liquidity Sweep Reversal (LSR) Strategy (Institutional Failed-Breakout Engine)
    if (isLsrActive) {
      const btcKlines = symbol !== 'BTCUSDT' ? await this.getKlines('BTCUSDT', '15m') : [];
      const lsrSignal = evaluateLiquiditySweepReversal(klines, btcKlines, currentPrice, { ...this.settings, symbol } as any);
      if (lsrSignal) {
        if (lsrSignal.finalDecision === 'EXECUTE') {
          // Explicit Regime Gate for LIQUIDITY_SWEEP_REVERSAL:
          // 1. Enforce that LIQUIDITY_SWEEP_REVERSAL only executes when the regime is RANGING, EXHAUSTION_UP, EXHAUSTION_DOWN, or TRANSITION
          const macro = await this.getGlobalRegime();
          const allowedLsrRegimes = ['RANGING', 'EXHAUSTION_UP', 'EXHAUSTION_DOWN', 'TRANSITION'];
          const isRegimeFavorable = allowedLsrRegimes.includes(macro.regime);

          // 2. Reject if the symbol's coin regime or global macro regime is strongly trending (e.g. ADX > 30 and ER > 0.40)
          const highs = klines.map(k => k.high);
          const lows = klines.map(k => k.low);
          const closes = klines.map(k => k.close);
          const adxRes = calculateADX(highs, lows, closes, 14);
          const coinAdx = adxRes.adx && adxRes.adx.length > 0 ? adxRes.adx[adxRes.adx.length - 1] : 0;

          let coinEr = 0;
          if (closes.length >= 21) {
            const period = 20;
            const netChange = Math.abs(closes[closes.length - 1] - closes[closes.length - 1 - period]);
            let totalPath = 0;
            for (let i = closes.length - period; i < closes.length; i++) {
              totalPath += Math.abs(closes[i] - closes[i - 1]);
            }
            coinEr = totalPath > 0 ? netChange / totalPath : 0;
          }

          const isMacroStronglyTrending = ['TRENDING_UP', 'TRENDING_DOWN', 'BREAKOUT_UP', 'BREAKOUT_DOWN'].includes(macro.regime) || ((macro.adx ?? 0) > 30 && (macro.details || '').includes('Trend'));
          const isCoinStronglyTrending = (coinAdx > 30 && coinEr > 0.40) || lsrSignal.coinRegime === 'STRONG_TREND_UP' || lsrSignal.coinRegime === 'STRONG_TREND_DOWN' || lsrSignal.trendStrength === 'EXTREME';

          // 3. Reject if the sweep is chasing a breakout rather than mean-reverting
          const isChasingBreakout = (lsrSignal.direction === 'LONG' && (macro.regime === 'BREAKOUT_DOWN' || lsrSignal.coinRegime === 'STRONG_TREND_DOWN')) ||
                                    (lsrSignal.direction === 'SHORT' && (macro.regime === 'BREAKOUT_UP' || lsrSignal.coinRegime === 'STRONG_TREND_UP'));

          // 4. Verify 2-Candle Setup Confirmation (Candle 1 Sweep/Probe + Candle 2 Bullish/Bearish Confirmation)
          const execCandlesForLsr: Candle[] = klines.map(k => ({
            time: k.time || k.openTime || 0,
            open: k.open,
            high: k.high,
            low: k.low,
            close: k.close,
            volume: k.volume || 0
          }));
          const twoCandleCheck = checkTwoCandleReversalSetup(
            execCandlesForLsr,
            lsrSignal.direction,
            lsrSignal.liquidityLevel || currentPrice,
            lsrSignal.atrValue
          );

          if (!isRegimeFavorable || isMacroStronglyTrending || isCoinStronglyTrending || isChasingBreakout || !twoCandleCheck.isConfirmed) {
            const rejectMsg = !isRegimeFavorable
              ? `Regime Filter: LSR requires RANGING/EXHAUSTION/TRANSITION (Macro: ${macro.regime})`
              : isChasingBreakout
              ? `Regime Filter: LSR chasing breakout instead of mean-reverting (Coin: ${lsrSignal.coinRegime}, Macro: ${macro.regime})`
              : (isMacroStronglyTrending || isCoinStronglyTrending)
              ? `Regime Filter: Strongly trending market (Coin ADX: ${coinAdx.toFixed(1)}, ER: ${coinEr.toFixed(2)}, Macro: ${macro.regime})`
              : `LSR 2-Candle Setup: ${twoCandleCheck.reason}`;

            this.logScanResult(
              symbol,
              lsrSignal.direction,
              false,
              rejectMsg,
              currentPrice,
              lsrSignal.stopLossPrice,
              lsrSignal.targetPrice,
              lsrSignal.score,
              {
                strategy: 'LIQUIDITY_SWEEP_REVERSAL',
                marketRegime: `LSR [${macro.regime}]: ${lsrSignal.coinRegime} (ADX: ${coinAdx.toFixed(1)}, ER: ${coinEr.toFixed(2)})`,
                rejectionReasons: [rejectMsg],
                atr: lsrSignal.atrValue,
                structuralRR: lsrSignal.riskRewardRatio
              }
            );
          } else {
            const setupBadge = lsrSignal.candleConfirmationSetup && lsrSignal.candleConfirmationSetup !== 'NONE'
              ? ` [${lsrSignal.candleConfirmationSetup}]`
              : '';
            console.log(`[AutoTrader] 💧 [LSR EXECUTE] ${symbol} ${lsrSignal.direction} triggered at [${lsrSignal.liquiditySignificance || 'IMPORTANT'}] $${lsrSignal.liquidityLevel?.toFixed(2)}! Confirmed by ${lsrSignal.candleConfirmationSetup || 'reversal setup'}: ${lsrSignal.candleConfirmationReason || lsrSignal.explanation}`);
            lsrResult = {
              direction: lsrSignal.direction,
              score: lsrSignal.score,
              atr: lsrSignal.atrValue,
              sl: lsrSignal.stopLossPrice,
              tp1: lsrSignal.tp1,
              tp2: lsrSignal.tp2,
              tp3: lsrSignal.tp3,
              strategy: 'LIQUIDITY_SWEEP_REVERSAL',
              marketRegime: `LSR [${lsrSignal.liquiditySignificance || 'IMP'}] (Grade ${lsrSignal.grade} | 1:${lsrSignal.riskRewardRatio.toFixed(1)} R:R)${setupBadge}: ${lsrSignal.coinRegime}`,
              strategyRegimeStatus: 'IN_FAVOR',
              strategyRegimeFavorable: true,
              reason: `${lsrSignal.explanation}${lsrSignal.candleConfirmationReason ? ` | Reversal: ${lsrSignal.candleConfirmationReason}` : ''}`,
              signalTime: lsrSignal.signalTime,
              structuralRR: lsrSignal.riskRewardRatio
            };
          }
        } else if (lsrSignal.status !== 'REJECTED' && !coilResult && !scalperResult) {
          if (lsrSignal.exactRejectionReason === 'WAITING_FOR_CANDLE_CONFIRMATION') {
            console.log(`[AutoTrader] 💧 [LSR ARMED] ${symbol}: High-significance level swept at [${lsrSignal.liquiditySignificance || 'IMPORTANT'}] $${lsrSignal.liquidityLevel?.toFixed(2)} (Quality ${lsrSignal.liquidityQualityScore}/5). Waiting for circled reversal candle setup (Hammer/Pin Bar/Engulfing/Retest Hold)...`);
          }
          this.logScanResult(
            symbol,
            lsrSignal.direction,
            false,
            lsrSignal.rejectionReason || `LSR State: ${lsrSignal.state}`,
            currentPrice,
            lsrSignal.stopLossPrice,
            lsrSignal.targetPrice,
            lsrSignal.score,
            {
              strategy: 'LIQUIDITY_SWEEP_REVERSAL',
              marketRegime: `LSR: ${lsrSignal.coinRegime} (${lsrSignal.grade})`,
              rejectionReasons: [lsrSignal.exactRejectionReason || lsrSignal.rejectionReason || 'WAITING_FOR_CONFIRMATION'],
              atr: lsrSignal.atrValue,
              structuralRR: lsrSignal.riskRewardRatio
            }
          );
        }
      }
    } else if (isSmcActive) {
      const htfInterval = this.settings.smcHtfResolution || '4H';
      const htfKlines = await this.getKlines(symbol, htfInterval);
      
      const smcSignal = evaluateSmcHighProbability(klines, htfKlines, currentPrice, { ...this.settings, symbol } as any);
      if (smcSignal && smcSignal.hasConfluence) {
        smcResult = {
          direction: smcSignal.direction,
          score: smcSignal.score,
          atr: smcSignal.risk / (this.settings.smcAtrStopMult || 1.5),
          sl: smcSignal.sl,
          tp1: smcSignal.tp1,
          tp2: smcSignal.tp2,
          tp3: smcSignal.tp3,
          strategy: 'SMC_LIQUIDITY',
          marketRegime: `HTF: ${smcSignal.htfRegime}`,
          strategyRegimeStatus: 'IN_FAVOR',
          strategyRegimeFavorable: true,
          reason: smcSignal.reason,
          signalTime: smcSignal.signalTime,
        };
      }
    }

    // Evaluate Robust Trend-Pullback Intraday Strategy (Rejection-First Flow)
    if (isTpActive) {
      const htfInterval = (this.settings as any).tpHigherTimeframe || '1H';
      const htfKlines = await this.getKlines(symbol, htfInterval);
      
      const tpSignal = evaluateTrendPullback(klines, htfKlines, currentPrice, { ...this.settings, symbol } as any);
      if (tpSignal) {
        // Enforce strict rejection-first execution
        if (tpSignal.finalDecision !== 'EXECUTE') {
          if (!smcResult) {
            this.logScanResult(
              symbol,
              tpSignal.direction,
              false,
              tpSignal.exactRejectionReason || tpSignal.status,
              currentPrice,
              tpSignal.stopLossPrice,
              tpSignal.targetPrice,
              tpSignal.score * 10,
              {
                strategy: 'TREND_PULLBACK',
                marketRegime: tpSignal.marketRegime,
                rejectionReasons: [tpSignal.rejectionDetails || tpSignal.exactRejectionReason || 'REJECTED'],
                atr: tpSignal.atrValue,
                structuralRR: tpSignal.riskRewardRatio
              }
            );
          }
        } else {
          tpResult = {
            direction: tpSignal.direction,
            score: tpSignal.score * 10, // Scale 0-10 score to 0-100 scale for OMS
            atr: tpSignal.atrValue,
            sl: tpSignal.stopLossPrice,
            tp1: tpSignal.targetPrice,
            tp2: tpSignal.tp2,
            tp3: tpSignal.tp3,
            strategy: 'TREND_PULLBACK',
            marketRegime: `Regime: ${tpSignal.marketRegime}`,
            reason: tpSignal.rejectionDetails || `Trend-Pullback ${tpSignal.priceActionPattern} (${tpSignal.pullbackZone})`,
            signalTime: tpSignal.confirmationTimestamp,
            triggerLevel: tpSignal.triggerLevel,
            invalidationLevel: tpSignal.invalidationLevel,
            retestTolerance: tpSignal.retestTolerance,
            retestArea: tpSignal.retestArea,
            lifecycleState: tpSignal.lifecycleState,
            entryMode: tpSignal.entryMode,
            retestClassification: tpSignal.retestClassification,
            retestDetails: tpSignal.retestDetails
          };
        }
      }
    }

    // Evaluate Order Block Strategy (ORDER_BLOCK) - Pure PA, Displacement, Structure Break, Retest (1:3.5+ R:R)
    if (isObActive) {
      const btcKlines = symbol !== 'BTCUSDT' ? await this.getKlines('BTCUSDT', '15m') : [];
      const obSignal = evaluateOrderBlockStrategy(klines, btcKlines, currentPrice, { ...this.settings, symbol } as any);
      if (obSignal) {
        if (obSignal.finalDecision !== 'EXECUTE') {
          if (!coilResult && !scalperResult && !tpResult && !lsrResult) {
            this.logScanResult(
              symbol,
              obSignal.direction,
              false,
              obSignal.exactRejectionReason || obSignal.reason,
              currentPrice,
              obSignal.stopLossPrice,
              obSignal.targetPrice,
              obSignal.score,
              {
                strategy: 'ORDER_BLOCK',
                marketRegime: obSignal.marketRegime,
                rejectionReasons: [obSignal.rejectionReason || obSignal.exactRejectionReason || 'REJECTED'],
                atr: obSignal.atrValue,
                structuralRR: obSignal.riskRewardRatio
              }
            );
          }
        } else {
          obResult = {
            direction: obSignal.direction,
            score: obSignal.score,
            atr: obSignal.atrValue,
            sl: obSignal.stopLossPrice,
            tp1: obSignal.targetPrice,
            tp2: obSignal.tp2,
            tp3: obSignal.tp3,
            strategy: 'ORDER_BLOCK',
            marketRegime: `Regime: ${obSignal.marketRegime}`,
            reason: obSignal.reason,
            signalTime: obSignal.signalTime,
            structuralRR: obSignal.riskRewardRatio,
            obHigh: obSignal.obHigh,
            obLow: obSignal.obLow,
            obMidpoint: obSignal.obMidpoint,
            obFreshness: obSignal.obFreshness,
            liquidityEvent: obSignal.liquidityEvent,
            displacementValid: obSignal.displacementValid,
            structureBreakValid: obSignal.structureBreakValid,
            sizeMultiplier: obSignal.sizeMultiplier,
            qualityChecklist: obSignal.qualityChecklist
          };
        }
      }
    }

    // Evaluate Delta Climax Reversal Strategy if active
    if (isDeltaActive && klines.length >= 35) {
      const crAtrPeriod = this.settings.crAtrPeriod || 14;
      const crEmaPeriod = this.settings.crEmaBaseline || this.settings.crEmaFast || 20;
      const crVolSpikeMult = this.settings.crVolumeSpikeMultiplier || 2.2;
      const crMinWickRatio = (this.settings.crMinRejectionWickRatio !== undefined && this.settings.crMinRejectionWickRatio <= 1)
        ? this.settings.crMinRejectionWickRatio
        : (this.settings.crMinRejectionWickRatio ? this.settings.crMinRejectionWickRatio / 100 : 0.45);
      const crMinOverextension = this.settings.crMinOverextensionAtr || 1.5;
      const crStopDistanceAtr = this.settings.crMinStopDistanceAtr || 0.2;
      const crMinRR = this.settings.crMinRewardRisk || this.settings.minRRRatio || 2.5;

      const closedBars = klines.slice(0, -1);
      const closes = closedBars.map(k => k.close);
      const highs = closedBars.map(k => k.high);
      const lows = closedBars.map(k => k.low);
      const volumes = closedBars.map(k => k.volume || 0);
      const atrs = calculateATR(highs, lows, closes, crAtrPeriod);
      const emaSeries = calculateEMA(closes, crEmaPeriod);
      const volSmas = calculateSMA(volumes, 20);

      const lastIdx = closedBars.length - 1;
      const lastBar = closedBars[lastIdx];
      const curAtr = atrs[lastIdx] || lastBar.close * 0.01;
      const curEma = emaSeries[lastIdx] || lastBar.close;
      const curVolSma = volSmas[lastIdx] || 1;
      const candleRange = lastBar.high - lastBar.low;

      if (candleRange > 0 && curVolSma > 0) {
        const isVolSpike = (lastBar.volume || 0) >= curVolSma * crVolSpikeMult;
        const lowerWick = Math.min(lastBar.open, lastBar.close) - lastBar.low;
        const upperWick = lastBar.high - Math.max(lastBar.open, lastBar.close);
        const lowerWickRatio = lowerWick / candleRange;
        const upperWickRatio = upperWick / candleRange;

        // Long Climax: Price was pushed far below EMA, heavy volume, long bottom wick rejection
        if (isVolSpike && lastBar.close < curEma - (curAtr * crMinOverextension) && lowerWickRatio >= crMinWickRatio) {
          const sl = lastBar.low - (curAtr * crStopDistanceAtr);
          const tp1 = curEma;
          const tp3 = currentPrice + (Math.abs(currentPrice - sl) * crMinRR);
          deltaResult = {
            direction: 'LONG',
            score: 82,
            atr: curAtr,
            sl,
            tp1,
            tp2: (tp1 + tp3) / 2,
            tp3,
            strategy: 'DELTA_CLIMAX',
            marketRegime: 'Exhaustion Climax',
            strategyRegimeStatus: 'IN_FAVOR',
            strategyRegimeFavorable: true,
            reason: `Delta Climax Exhaustion Wick (${(lowerWickRatio * 100).toFixed(0)}% rejection wick, ${((lastBar.volume || 0)/curVolSma).toFixed(1)}x vol)`,
            signalTime: lastBar.time
          };
        } else if (isVolSpike && lastBar.close > curEma + (curAtr * crMinOverextension) && upperWickRatio >= crMinWickRatio) {
          const sl = lastBar.high + (curAtr * crStopDistanceAtr);
          const tp1 = curEma;
          const tp3 = currentPrice - (Math.abs(currentPrice - sl) * crMinRR);
          deltaResult = {
            direction: 'SHORT',
            score: 82,
            atr: curAtr,
            sl,
            tp1,
            tp2: (tp1 + tp3) / 2,
            tp3,
            strategy: 'DELTA_CLIMAX',
            marketRegime: 'Exhaustion Climax',
            strategyRegimeStatus: 'IN_FAVOR',
            strategyRegimeFavorable: true,
            reason: `Delta Climax Exhaustion Wick (${(upperWickRatio * 100).toFixed(0)}% rejection wick, ${((lastBar.volume || 0)/curVolSma).toFixed(1)}x vol)`,
            signalTime: lastBar.time
          };
        }
      }
    }

    // Evaluate Volatility Compression Breakout (VCB) with VcbParams
    if (isVcbActive && klines.length >= 35) {
      try {
        const htfKlines = await this.getKlines(symbol, '1h');
        const btcKlines = symbol !== 'BTCUSDT' ? await this.getKlines('BTCUSDT', '1h') : [];
        const liq = this.tickerLiquidityMap.get(symbol);
        const quoteVol = liq?.quoteVolume || 50_000_000;
        const spreadBps = liq?.spreadBps || 1.8;
        const mergedVcbParams = {
          ...((this.settings as any).vcbParams || {}),
          baseMinBars: this.settings.vcbCompressionLookback,
          compressionAtrRatioMax: this.settings.vcbCompressionAtrRatioMax,
          windowAtrMult: this.settings.vcbWindowAtrMult,
          boundaryBufferAtr: this.settings.vcbBoundaryBufferAtr,
          rangeExpansionMin: this.settings.vcbRangeExpansionMin,
          volumeExpansionMin: this.settings.vcbVolumeExpansionMin,
          closeStrengthMin: this.settings.vcbCloseStrengthMin,
          htfBonus: this.settings.vcbHtfBonus,
          slBufferAtr: this.settings.vcbSlBufferAtrMult,
          initialTpAtrMult: this.settings.vcbInitialTpAtrMult,
          initialTpClosePct: this.settings.vcbInitialTpClosePct,
          minRewardRisk: this.settings.minRRRatio || (this.settings as any).vcbParams?.minRewardRisk || 2.0
        };
        const vcbSignal = evaluateVcbStrategy(
          symbol,
          klines,
          htfKlines,
          htfKlines,
          currentPrice,
          mergedVcbParams,
          quoteVol,
          spreadBps,
          btcKlines
        );

        if (vcbSignal) {
          if (vcbSignal.finalDecision === 'EXECUTE') {
            vcbResult = {
              direction: vcbSignal.direction,
              score: vcbSignal.score,
              atr: vcbSignal.atrValue,
              sl: vcbSignal.stopLossPrice,
              tp1: vcbSignal.tp1,
              tp2: vcbSignal.tp2,
              tp3: vcbSignal.tp3,
              strategy: 'VCB',
              marketRegime: `VCB [${vcbSignal.baseInfo?.bars || 10}b Coil | ${(vcbSignal.feeToRiskRatio * 100).toFixed(0)}% Fee/R] (1:${vcbSignal.riskRewardRatio.toFixed(1)} R:R)`,
              reason: vcbSignal.reason,
              signalTime: vcbSignal.signalTime,
              structuralRR: vcbSignal.riskRewardRatio
            };
          } else if (vcbSignal.rejectReason) {
            this.logScanResult(
              symbol,
              vcbSignal.direction,
              false,
              vcbSignal.displayStatus,
              currentPrice,
              vcbSignal.stopLossPrice,
              vcbSignal.targetPrice,
              vcbSignal.score,
              {
                strategy: 'VCB',
                marketRegime: `VCB Coil (${vcbSignal.baseInfo?.bars || 8}b)`,
                rejectionReasons: [vcbSignal.displayStatus],
                atr: vcbSignal.atrValue,
                structuralRR: vcbSignal.riskRewardRatio
              }
            );
          }
        }
      } catch (err) {
        console.warn(`[AutoTrader] VCB evaluation error on ${symbol}:`, err);
      }
    }

    // Evaluate 10-Gate Composite Strategy if active
    if (isCompositeActive && klines.length >= 50) {
      const emaFastPeriod = this.settings.emaFastPeriod || 9;
      const emaSlowPeriod = this.settings.emaSlowPeriod || 21;
      const emaTrendPeriod = this.settings.emaTrendPeriod || 50;
      const rsiPeriod = this.settings.rsiPeriod || 14;
      const adxPeriod = this.settings.adxPeriod || 14;
      const adxThreshold = this.settings.adxTrendThreshold || 22;
      const atrPeriod = this.settings.atrPeriod || 14;

      const rsiLongMin = this.settings.rsiLongMin ?? 50;
      const rsiLongMax = this.settings.rsiLongMax ?? 68;
      const rsiShortMin = this.settings.rsiShortMin ?? 32;
      const rsiShortMax = this.settings.rsiShortMax ?? 50;

      const tp1Mult = this.settings.tp1AtrMultiple ?? 1.5;
      const tp2Mult = this.settings.tp2AtrMultiple ?? 2.2;
      const slMult = this.settings.slAtrMultiple ?? 1.5;

      const closedBars = klines.slice(0, -1);
      const closes = closedBars.map(k => k.close);
      const highs = closedBars.map(k => k.high);
      const lows = closedBars.map(k => k.low);
      const emaFasts = calculateEMA(closes, emaFastPeriod);
      const emaSlows = calculateEMA(closes, emaSlowPeriod);
      const emaTrends = calculateEMA(closes, emaTrendPeriod);
      const rsis = calculateRSI(closes, rsiPeriod);
      const adxRes = calculateADX(highs, lows, closes, adxPeriod);
      const atrs = calculateATR(highs, lows, closes, atrPeriod);

      const lastIdx = closedBars.length - 1;
      const lastBar = closedBars[lastIdx];
      const curAtr = atrs[lastIdx] || lastBar.close * 0.01;
      const curRsi = rsis[lastIdx] || 50;
      const curAdx = adxRes.adx[lastIdx] || 15;

      const isBullStack = emaFasts[lastIdx] > emaSlows[lastIdx] && emaSlows[lastIdx] > emaTrends[lastIdx] && lastBar.close > emaFasts[lastIdx];
      const isBearStack = emaFasts[lastIdx] < emaSlows[lastIdx] && emaSlows[lastIdx] < emaTrends[lastIdx] && lastBar.close < emaFasts[lastIdx];

      if (isBullStack && curAdx >= adxThreshold && curRsi >= rsiLongMin && curRsi <= rsiLongMax) {
        const sl = Math.min(emaTrends[lastIdx], currentPrice - (curAtr * slMult));
        const risk = Math.abs(currentPrice - sl);
        compositeResult = {
          direction: 'LONG',
          score: 80,
          atr: curAtr,
          sl,
          tp1: currentPrice + risk * tp1Mult,
          tp2: currentPrice + risk * tp2Mult,
          tp3: currentPrice + risk * (tp2Mult * 1.35),
          strategy: 'BINANCE_COMPOSITE',
          marketRegime: 'Trend Alignment',
          strategyRegimeStatus: 'IN_FAVOR',
          strategyRegimeFavorable: true,
          reason: `Composite 10-Gate Bullish Alignment (EMA Ribbon ${emaFastPeriod}>${emaSlowPeriod}>${emaTrendPeriod}, ADX ${curAdx.toFixed(0)}, RSI ${curRsi.toFixed(0)})`,
          signalTime: lastBar.time
        };
      } else if (isBearStack && curAdx >= adxThreshold && curRsi <= rsiShortMax && curRsi >= rsiShortMin) {
        const sl = Math.max(emaTrends[lastIdx], currentPrice + (curAtr * slMult));
        const risk = Math.abs(currentPrice - sl);
        compositeResult = {
          direction: 'SHORT',
          score: 80,
          atr: curAtr,
          sl,
          tp1: currentPrice - risk * tp1Mult,
          tp2: currentPrice - risk * tp2Mult,
          tp3: currentPrice - risk * (tp2Mult * 1.35),
          strategy: 'BINANCE_COMPOSITE',
          marketRegime: 'Trend Alignment',
          strategyRegimeStatus: 'IN_FAVOR',
          strategyRegimeFavorable: true,
          reason: `Composite 10-Gate Bearish Alignment (EMA Ribbon ${emaFastPeriod}<${emaSlowPeriod}<${emaTrendPeriod}, ADX ${curAdx.toFixed(0)}, RSI ${curRsi.toFixed(0)})`,
          signalTime: lastBar.time
        };
      }
    }

    // Evaluate Range Regime V1 Strategy if active
    if (isRangeRegimeActive && klines.length >= 35) {
      try {
        const htfKlines = await this.getKlines(symbol, '1H');
        const dirCandles = htfKlines.map(k => ({
          time: k.time || k.openTime || 0,
          open: k.open,
          high: k.high,
          low: k.low,
          close: k.close,
          volume: k.volume || 0
        }));
        const execCandles = klines.map(k => ({
          time: k.time || k.openTime || 0,
          open: k.open,
          high: k.high,
          low: k.low,
          close: k.close,
          volume: k.volume || 0
        }));

        // Compute daily levels (PDH, PDL) and execution VWAP for confluence
        const recent24hDir = dirCandles.slice(-24);
        const pdh = recent24hDir.length > 0 ? Math.max(...recent24hDir.map(c => c.high)) : undefined;
        const pdl = recent24hDir.length > 0 ? Math.min(...recent24hDir.map(c => c.low)) : undefined;

        let cumVol = 0;
        let cumVolPrice = 0;
        for (const c of execCandles.slice(-96)) {
          const typical = (c.high + c.low + c.close) / 3;
          cumVol += c.volume;
          cumVolPrice += typical * c.volume;
        }
        const vwap = cumVol > 0 ? cumVolPrice / cumVol : undefined;

        const mergedRangeParams = {
          ...((this.settings as any).rangeRegimeParams || {}),
          adxPeriod: this.settings.adxPeriod,
          minRewardRisk: this.settings.minRRRatio || (this.settings as any).rangeRegimeParams?.minRewardRisk || 1.5
        };

        const rangeSig = evaluateRangeRegime(
          symbol,
          dirCandles,
          execCandles,
          mergedRangeParams,
          { pdh, pdl, vwap }
        );

        if (rangeSig) {
          if (rangeSig.finalDecision === 'EXECUTE') {
            // Explicit Regime Gate for RANGE_REGIME_V1:
            // 1. Enforce that RANGE_REGIME_V1 only executes when macro regime is RANGING, COMPRESSION, or TRANSITION
            const macro = await this.getGlobalRegime();
            const allowedRangeRegimes = ['RANGING', 'COMPRESSION', 'TRANSITION'];
            const isRegimeFavorable = allowedRangeRegimes.includes(macro.regime);

            // 2. Reject if the symbol's coin regime or macro regime is strongly trending
            const highs = klines.map(k => k.high);
            const lows = klines.map(k => k.low);
            const closes = klines.map(k => k.close);
            const adxRes = calculateADX(highs, lows, closes, 14);
            const coinAdx = adxRes.adx && adxRes.adx.length > 0 ? adxRes.adx[adxRes.adx.length - 1] : 0;

            let coinEr = 0;
            if (closes.length >= 21) {
              const period = 20;
              const netChange = Math.abs(closes[closes.length - 1] - closes[closes.length - 1 - period]);
              let totalPath = 0;
              for (let i = closes.length - period; i < closes.length; i++) {
                totalPath += Math.abs(closes[i] - closes[i - 1]);
              }
              coinEr = totalPath > 0 ? netChange / totalPath : 0;
            }

            const isMacroTrending = ['TRENDING_UP', 'TRENDING_DOWN', 'BREAKOUT_UP', 'BREAKOUT_DOWN', 'PANIC'].includes(macro.regime) || ((macro.adx ?? 0) > 28);
            const isCoinTrending = (coinAdx > 25 && coinEr > 0.28);

            // 3. Reject if directional conflict with macro breakout
            const isDirectionalConflict = (rangeSig.direction === 'LONG' && macro.regime === 'BREAKOUT_DOWN') ||
                                          (rangeSig.direction === 'SHORT' && macro.regime === 'BREAKOUT_UP');

            // 4. Verify 2-Candle Setup Confirmation
            const targetKeyLevel = rangeSig.direction === 'LONG' ? (rangeSig.rangeLow || pdl || currentPrice) : (rangeSig.rangeHigh || pdh || currentPrice);
            const twoCandleCheck = checkTwoCandleReversalSetup(execCandles, rangeSig.direction as 'LONG' | 'SHORT', targetKeyLevel, rangeSig.atrExec);

            const isGradeBBlocked = rangeSig.grade === 'GRADE_B' && (
              mergedRangeParams.allowGradeB === false ||
              mergedRangeParams.enableGradeB === false ||
              mergedRangeParams.allowGradeBSetups === false
            );
            const isS3Blocked = rangeSig.setupType === 'S3_BAND_SNAPBACK' && mergedRangeParams.enableBandSnapback === false;

            if (!isRegimeFavorable || isMacroTrending || isCoinTrending || isDirectionalConflict || !twoCandleCheck.isConfirmed || isGradeBBlocked || isS3Blocked) {
              const blockReason = !isRegimeFavorable
                ? `Regime Filter: Range Regime requires RANGING/COMPRESSION (Macro: ${macro.regime})`
                : (isMacroTrending || isCoinTrending)
                ? `Regime Filter: Strongly trending market (Coin ADX: ${coinAdx.toFixed(1)}, ER: ${coinEr.toFixed(2)}, Macro: ${macro.regime})`
                : isDirectionalConflict
                ? `Regime Filter: Directional conflict with macro breakout (${macro.regime})`
                : !twoCandleCheck.isConfirmed
                ? `Range Regime 2-Candle Setup: ${twoCandleCheck.reason}`
                : isS3Blocked
                ? 'Range Regime V1: S3 Band snap-back setups are turned off'
                : `Range Regime V1: Grade B setups are turned off (setup: ${rangeSig.setupType}, Grade A required)`;

              this.logScanResult(
                symbol,
                rangeSig.direction,
                false,
                blockReason,
                currentPrice,
                rangeSig.stopLossPrice,
                rangeSig.tp1,
                rangeSig.score,
                {
                  strategy: 'RANGE_REGIME_V1',
                  rejectionReasons: [blockReason],
                  marketRegime: `Range Regime V1 [${macro.regime}] (${rangeSig.setupType} | ${rangeSig.grade})`
                }
              );
            } else {
              const scaledScore = rangeSig.grade === 'GRADE_A'
                ? Math.max(88, rangeSig.score)
                : Math.max(80, rangeSig.score);
              rangeRegimeResult = {
                direction: rangeSig.direction,
                score: scaledScore,
                atr: rangeSig.atrExec,
                sl: twoCandleCheck.invalidationLevel || rangeSig.stopLossPrice,
                tp1: rangeSig.tp1,
                tp2: rangeSig.tp2,
                tp3: rangeSig.tp2,
                strategy: 'RANGE_REGIME_V1',
                marketRegime: `Range Regime V1 (${rangeSig.setupType} | ${rangeSig.grade.replace('_', ' ')}) [2-Candle Reversal]`,
                strategyRegimeStatus: 'IN_FAVOR',
                strategyRegimeFavorable: true,
                reason: `${rangeSig.reason} | ${twoCandleCheck.reason}`,
                signalTime: rangeSig.signalTime,
                structuralRR: rangeSig.netBlendedR
              };
            }
          } else if (rangeSig.rejectCode) {
            this.logScanResult(
              symbol,
              rangeSig.direction,
              false,
              `Range Regime V1: ${rangeSig.rejectReason || rangeSig.displayStatus}`,
              currentPrice,
              rangeSig.stopLossPrice,
              rangeSig.targetPrice,
              rangeSig.score,
              {
                strategy: 'RANGE_REGIME_V1',
                marketRegime: 'RANGE',
                rejectionReasons: [rangeSig.rejectReason || rangeSig.displayStatus],
                atr: rangeSig.atrExec,
                structuralRR: rangeSig.netBlendedR
              }
            );
          }
        }
      } catch (err) {
        console.warn(`Error evaluating Range Regime V1 on ${symbol}:`, err);
      }
    }

    // Collect all valid triggered candidates
    const candidateSignals: any[] = [];
    if (obResult) candidateSignals.push(obResult);
    if (scalperResult) candidateSignals.push(scalperResult);
    if (coilResult) candidateSignals.push(coilResult);
    if (tpResult) candidateSignals.push(tpResult);
    if (lsrResult) candidateSignals.push(lsrResult);
    if (smcResult) candidateSignals.push(smcResult);
    if (deltaResult) candidateSignals.push(deltaResult);
    if (vcbResult) candidateSignals.push(vcbResult);
    if (compositeResult) candidateSignals.push(compositeResult);
    if (rangeRegimeResult) candidateSignals.push(rangeRegimeResult);

    if (candidateSignals.length === 0) return null;

    // Multi-Strategy Resolution & Confluence Synergy
    // 1. Pick top winning candidate by highest score
    let winningSignal = candidateSignals.reduce((best, cur) => cur.score > best.score ? cur : best, candidateSignals[0]);

    // 2. Check candidates sharing the winning signal's direction for confluence synergy
    const sameDirectionCandidates = candidateSignals.filter(c => c.direction === winningSignal.direction);

    // Apply Confluence Synergy Boost only when 2 or more active strategies agree on the same direction
    // and multiStrategyMode is not configured to 'BEST_SIGNAL'
    if (sameDirectionCandidates.length >= 2 && this.settings.multiStrategyMode !== 'BEST_SIGNAL') {
      const agreeingStrats = Array.from(new Set(sameDirectionCandidates.map(c => c.strategy)));
      const boostedScore = Math.min(98, winningSignal.score + 12); // Synergy boost +12 pts
      return {
        ...winningSignal,
        score: boostedScore,
        isMultiConfluence: true,
        confluenceCount: agreeingStrats.length,
        matchedStrategies: agreeingStrats,
        reason: `⚡ Multi-Strategy Confluence [${agreeingStrats.join(' + ')}]: ${winningSignal.reason}`
      };
    }

    return {
      ...winningSignal,
      matchedStrategies: [winningSignal.strategy]
    };
  }
}

export const autoTrader = new AutoTrader();
oms.onTradeClosed = (pnl: number, pos?: any, exitReason?: string) => {
  autoTrader.updateDemoBalance(pnl);
  if (pos) {
    autoTrader.handleTradeClosed(pos, exitReason || 'CLOSE', pnl);
  }
};
oms.isEngineActive = () => autoTrader.isEngineActive();
oms.getSettings = () => autoTrader.getSettings();
oms.getEffectiveAccountEquity = () => autoTrader.getEffectiveAccountEquity();
