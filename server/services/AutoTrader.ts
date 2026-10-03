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
import { heatmapService } from './HeatmapService.js';
import { reconciliationWorker } from './PositionReconciliationWorker.js';
import { priceStream } from './PriceStream.js';
import { calculateEMA, calculateATR, calculateRSI, calculateADX, calculateBollingerBands, calculateSMA } from '../../src/utils/indicators.js';
import { evaluateLiquiditySweepReversal } from '../../src/utils/strategies/liquiditySweepReversal.js';
import { evaluateSmcHighProbability } from '../../src/utils/strategies/smcHighProbability.js';
import { evaluateTrendPullback } from '../../src/utils/strategies/trendPullback.js';
import { evaluateMulticoinScalperPro } from '../../src/utils/strategies/multicoinScalperPro.js';
import { evaluateCoilBreakout } from '../../src/utils/strategies/coilBreakout.js';
import { evaluateOrderBlockStrategy } from '../../src/utils/strategies/orderBlockStrategy.js';
import { evaluateVcbStrategy } from '../../src/utils/strategies/vcbStrategy.js';
import { evaluateRangeRegime } from '../../src/utils/strategies/rangeRegimeStrategy.js';
import { evaluateRegimeLayer2, evaluateTradeabilityLayer3, evaluateDirectionBias, getRecommendedRegimeDirection } from '../../src/utils/regimeEngine.js';
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
    leverage: 5,
    positionSizePct: 3,
    maxConcurrentTrades: 5,
    coinCount: 100,
    timeframe: '15m'
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
  private tickerLiquidityMap = new Map<string, { quoteVolume: number; bid: number; ask: number; spreadBps: number; fundingRate?: number; lastUpdate: number }>();

  public async refreshLiquidityData(): Promise<void> {
    try {
      const res = await fetch('https://fapi.binance.com/fapi/v1/ticker/24hr');
      if (res.ok) {
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
      if (bookRes.ok) {
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
      if (premRes.ok) {
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
   * Enforces strictly closed 1H bars and data freshness (<75 min staleness limit)
   */
  private async checkHtfAgreement(
    symbol: string, 
    direction: 'LONG' | 'SHORT'
  ): Promise<{ passed: boolean; reason?: string; htfBias?: string }> {
    try {
      const htfKlines = await this.getKlines(symbol, '1h');
      if (!htfKlines || htfKlines.length < 30) {
        return { passed: false, reason: 'HTF (1H) candle history unavailable (<30 bars). Vetoed for data integrity.', htfBias: 'NEUTRAL' };
      }
      const closedHtf = htfKlines.slice(0, -1);
      const lastClosed = closedHtf[closedHtf.length - 1];
      if (!lastClosed) {
        return { passed: false, reason: 'HTF (1H) closed candle missing. Vetoed for data integrity.', htfBias: 'NEUTRAL' };
      }
      const now = Date.now();
      const candleAgeMinutes = (now - (lastClosed.time * 1000)) / 60000;
      if (candleAgeMinutes > 75) {
        return { passed: false, reason: `HTF (1H) data is stale (${candleAgeMinutes.toFixed(0)}m old > 75m threshold). Vetoed for data integrity.`, htfBias: 'NEUTRAL' };
      }

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
      return { passed: false, reason: 'HTF (1H) fetch exception encountered. Vetoed for safety.', htfBias: 'NEUTRAL' };
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
    positionMonitor.settings = this.settings;

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
    positionMonitor.settings = this.settings;

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
      const btcKlines4H = await this.getKlines('BTCUSDT', '4h');
      const btcKlines1H = await this.getKlines('BTCUSDT', '1h');
      const btcPrice = priceStream.getPrice('BTCUSDT') || (btcKlines4H.length > 0 ? btcKlines4H[btcKlines4H.length - 1].close : 68000);

      if (!btcKlines4H || btcKlines4H.length < 25) {
        const fallback: GlobalMarketRegime = {
          regime: 'COMPRESSION',
          label: 'MACRO: Volatility Compression (Coil)',
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

      // Evaluate institutional 3-Layer regime (4H confirmed by 1H)
      const klines1HForL3 = btcKlines1H && btcKlines1H.length >= 25 ? btcKlines1H : btcKlines4H;
      const regimeResult = evaluateRegimeLayer2(btcKlines4H, klines1HForL3);
      const adx = regimeResult.metrics.adx14;
      const atrPercentile = regimeResult.metrics.atrPercentile / 100;

      // Evaluate Layer 1 Direction Bias (1D + 4H)
      const btcKlines1D = await this.getKlines('BTCUSDT', '1d');
      const ethKlines4H = await this.getKlines('ETHUSDT', '4h');
      const biasResult = evaluateDirectionBias(
        btcKlines1D && btcKlines1D.length >= 15 ? btcKlines1D : btcKlines4H,
        btcKlines4H,
        ethKlines4H
      );

      // Derive unified recommended direction by regime
      const dirEval = getRecommendedRegimeDirection(biasResult, regimeResult);
      const recommendedDirection = dirEval.recommendedDirection;

      // Evaluate Layer 3 Tradeability Gate (Fee Drag vs 1R Stop Loss)
      const tradeability = evaluateTradeabilityLayer3(klines1HForL3, 1.8, now);
      const isL3GateActive = this.settings.layer3TradeabilityGateEnabled !== false;
      const maxFeeDrag = this.settings.maxFeeDragPctOf1R || 15.0;
      const isLowEdge = isL3GateActive && tradeability.feeDragShareOf1R > maxFeeDrag;
      let isTradable = !isLowEdge;
      let macroColor: 'GREEN' | 'AMBER' | 'RED' = 'AMBER';
      let finalRegime: MarketRegimeType = 'COMPRESSION';
      let finalLabel = 'MACRO: PURPLE – Volatility Compression';
      let finalDetails = `Institutional 4H Compression (${regimeResult.regimeAgeDurationStr}, ADX ${adx.toFixed(1)}, BBW ${regimeResult.metrics.bbBandwidthPercentile.toFixed(0)}th %ile). Favor Coil Breakout.`;

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

      let ethPrice: number | undefined = undefined;
      if (globalSymbol === 'BTC_ETH') {
        ethPrice = priceStream.getPrice('ETHUSDT') || (ethKlines4H.length > 0 ? ethKlines4H[ethKlines4H.length - 1].close : 3500);
      }

      finalDetails += ` · Regime Recommended Direction: ${recommendedDirection} (${dirEval.reason})`;

      if (!isL3GateActive) {
        finalDetails += ` · Layer 3 Gate: Bypassed by User`;
      } else if (!isTradable) {
        finalDetails += ` · ⚠️ Layer 3 Gate: ${tradeability.lowEdgeReason}`;
      } else {
        finalDetails += ` · Layer 3 Gate: Passed (${tradeability.feeDragShareOf1R.toFixed(1)}% Fee Drag)`;
      }

      const result: GlobalMarketRegime = {
        regime: finalRegime,
        label: finalLabel,
        details: finalDetails,
        symbol: globalSymbol,
        timestamp: now,
        isTradable,
        macroColor,
        recommendedDirection,
        directionBiasScore: biasResult.totalScore,
        directionBiasLabel: biasResult.label,
        btcPrice,
        ethPrice,
        adx,
        atrPercentile
      };

      this.cachedGlobalRegime = result;
      this.lastGlobalRegimeTime = now;
      return result;
    } catch (e) {
      console.warn('AutoTrader getGlobalRegime error:', e);
      return {
        regime: 'COMPRESSION',
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

          if (this.settings.killSwitchActive || riskManager.getRiskStatus().killSwitchActive) {
            console.log(`🛑 [SMC] Trade execution blocked for ${symbol}: Emergency Kill Switch active.`);
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
          const accountEquity = this.settings.demoBalance !== undefined ? this.settings.demoBalance : (this.settings.startingBalance || 10000);
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
              },
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

      if (this.settings.killSwitchActive || riskManager.getRiskStatus().killSwitchActive) {
        this.logScanResult('GLOBAL', 'NEUTRAL', false, 'Emergency Kill Switch Active: New executions halted', 0, 0, 0, 0);
        return;
      }

      // Refresh real-time 24h volume & bookTicker spread data
      await this.refreshLiquidityData();

      // Autonomous Background Regime Strategy Alignment (Guarded by 10-minute stability lock)
      if (this.settings.autoRegimeStrategySync) {
        try {
          const now = Date.now();
          const cooldownMs = 10 * 60 * 1000;
          const lastSwitch = this.settings.lastAutoRegimeSwitchTime || 0;
          const timeSinceSwitch = now - lastSwitch;

          if (!this.settings.lastAutoRegimeSwitchTime || timeSinceSwitch >= cooldownMs) {
            const macro = await this.getGlobalRegime();
            let targetStrats: string[] = [];
            if (macro.regime === 'TRENDING_UP' || macro.regime === 'BREAKOUT_UP') {
              targetStrats = ['TREND_PULLBACK', 'ORDER_BLOCK'];
            } else if (macro.regime === 'TRENDING_DOWN' || macro.regime === 'BREAKOUT_DOWN') {
              targetStrats = ['TREND_PULLBACK', 'ORDER_BLOCK'];
            } else if (macro.regime === 'COMPRESSION') {
              targetStrats = ['COIL_BREAKOUT'];
            } else if (macro.regime === 'RANGING') {
              targetStrats = ['RANGE_REGIME_V1', 'LIQUIDITY_SWEEP_REVERSAL'];
            } else {
              targetStrats = ['ORDER_BLOCK'];
            }

            const curList = this.settings.activeStrategies || [this.settings.activeStrategy || ''];
            const isAligned = targetStrats.length === curList.length && targetStrats.every(s => curList.includes(s));
            if (!isAligned) {
              console.log(`⚡ [AutoTrader] Auto-Regime Sync: Aligning active strategies to [${targetStrats.join(', ')}] for macro ${macro.regime}`);
              this.settings.activeStrategies = targetStrats;
              this.settings.activeStrategy = targetStrats[0] as any;
              this.settings.lastAutoRegimeApplied = macro.regime;
              this.settings.lastAutoRegimeSwitchTime = now;
              this.saveSettings({
                activeStrategies: targetStrats,
                activeStrategy: targetStrats[0] as any,
                lastAutoRegimeApplied: macro.regime,
                lastAutoRegimeSwitchTime: now
              }).catch(() => {});
            }
          }
        } catch (e) {}
      }

      // 1. Fetch top volume futures tickers (supports up to 100 coins)
      const scanLimit = Math.min(Math.max(this.settings.coinCount || 100, 5), 100);
      const topSymbols = await this.getTopVolumeSymbols(scanLimit);
      
      for (const symbol of topSymbols) {
        const deletedStrats = this.settings.deletedStrategies || [];
        const rawActiveList = (this.settings.activeStrategies && this.settings.activeStrategies.length > 0)
          ? this.settings.activeStrategies
          : ((this.settings as any).enabledStrategies && (this.settings as any).enabledStrategies.length > 0)
          ? (this.settings as any).enabledStrategies
          : (this.settings.activeStrategy && this.settings.activeStrategy !== 'NONE' ? [this.settings.activeStrategy] : ['COIL_BREAKOUT', 'MULTICOIN_SCALPER_PRO', 'TREND_PULLBACK', 'LIQUIDITY_SWEEP_REVERSAL', 'RANGE_REGIME_V1', 'ORDER_BLOCK']);
        const activeList = rawActiveList.map((s: string) => {
          if (s === 'SMC_LIQUIDITY_SWEEP' || s === 'SMC_LIQUIDITY') return 'LIQUIDITY_SWEEP_REVERSAL';
          if (s === 'EARLY_COIL_BREAKOUT') return 'COIL_BREAKOUT';
          return s;
        }).filter((s: string) => !deletedStrats.includes(s));
        
        // Base scanning timeframe strictly respects user's configured timeframe (e.g. 15m)
        const baseTf = this.settings.timeframe || '15m';
        const cooldown = this.tradeCooldowns.get(symbol) || 0;
        const cdLimit = this.settings.tradeCooldownMinutes !== undefined
          ? (this.settings.tradeCooldownMinutes * 60000)
          : this.getCooldownMs(baseTf);
        const inCooldown = (Date.now() - cooldown) < cdLimit;

        if (activePositions.some(p => p.symbol === symbol) || this.pendingSymbols.has(symbol) || inCooldown) {
          continue;
        }

        const currentPrice = priceStream.getPrice(symbol);
        if (!currentPrice || currentPrice <= 0) continue;

        // 24h Volume Gate
        const min24hVol = this.settings.min24hVolume ?? 0;
        const liq = this.tickerLiquidityMap.get(symbol);
        const quoteVol = liq?.quoteVolume || 0;
        if (!this.settings.disabledGates?.min24hVolume && min24hVol > 0 && quoteVol > 0 && quoteVol < min24hVol) {
          this.logScanResult(symbol, 'NEUTRAL', false, `24h volume ($${(quoteVol / 1e6).toFixed(1)}M) below minimum ($${(min24hVol / 1e6).toFixed(1)}M)`, currentPrice, 0, 0, 0);
          continue;
        }

        // Spread Check Gate
        const spreadPct = liq && liq.spreadBps ? (liq.spreadBps / 100) : 0;
        const maxSpread = this.settings.maxSpread ?? 0.2;
        if (!this.settings.disabledGates?.maxSpread && spreadPct > maxSpread) {
          this.logScanResult(symbol, 'NEUTRAL', false, `Spread too wide (${spreadPct.toFixed(3)}% > ${maxSpread.toFixed(3)}%)`, currentPrice, 0, 0, 0);
          continue;
        }

        // Funding Rate Check Gate
        if (!this.settings.disabledGates?.maxFundingRate && this.settings.maxFundingRate !== undefined && liq?.fundingRate !== undefined) {
          const fundingPct = Math.abs(liq.fundingRate * 100);
          if (fundingPct > this.settings.maxFundingRate) {
            this.logScanResult(symbol, 'NEUTRAL', false, `Funding rate too high (${fundingPct.toFixed(3)}% > ${this.settings.maxFundingRate}%)`, currentPrice, 0, 0, 0);
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
           this.logScanResult(symbol, signal.direction, passes, signal.reason || (passes ? 'Passed' : 'Low Score'), currentPrice, signal.sl, signal.tp1, signal.score);
        } else {
           this.logScanResult(symbol, 'NEUTRAL', false, `No setup matching active strategies [${activeList.join(', ')}]`, currentPrice, 0, 0, 0);
        }
        
        if (signal && signal.score >= this.settings.autoTradeThreshold) {

          const currentTotal = positionMonitor.getActivePositions().length + this.pendingSymbols.size;
          if (currentTotal >= this.settings.maxConcurrentTrades) {
            this.logScanResult(symbol, signal.direction, false, `Max open trades reached (${currentTotal}/${this.settings.maxConcurrentTrades})`, currentPrice, signal.sl, signal.tp1, signal.score);
            continue;
          }

          // Min RR Check Gate
          if (!this.settings.disabledGates?.minRR && signal.sl && (signal.tp3 || signal.tp1)) {
            const riskDist = Math.abs(currentPrice - signal.sl);
            const targetPrice = signal.tp3 || signal.tp1;
            const rewardDist = Math.abs(targetPrice - currentPrice);
            const rr = riskDist > 0 ? (rewardDist / riskDist) : 0;
            const minRR = (signal as any).structuralRR || (this.settings.minRRRatio ?? 1.5);
            if (rr < minRR) {
              this.logScanResult(symbol, signal.direction, false, `R:R ratio (${rr.toFixed(2)}) below minimum (${minRR})`, currentPrice, signal.sl, signal.tp1, signal.score);
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
              this.logScanResult(symbol, signal.direction, false, `Correlation veto: ${highestCorr.toFixed(2)} with ${correlatedWith} exceeds cap (${maxCorr})`, currentPrice, signal.sl, signal.tp1, signal.score);
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
                    strategy: (signal as any).strategy || 'UNKNOWN',
                    marketRegime: (signal as any).marketRegime || macro.label,
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
                    strategy: (signal as any).strategy || 'UNKNOWN',
                    marketRegime: (signal as any).marketRegime || macro.label,
                    gateResults: { higherTimeframeAligned: 'FAIL' },
                    rejectionReasons: [htfCheck.reason || 'HTF trend alignment failed']
                  }
                );
                continue;
              }
            }
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

          // Universal Liquidation-Safe Dynamic Risk Sizing for any strategy with SL (Section 9)
          if (signal.sl) {
            const riskPct = (this.settings.accountRiskPct || 1.5) / 100;
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
              { 
                maxLeverage: this.settings.leverage || 1, 
                maxAllocation,
                minLiqBuffer: this.settings.minLiqBuffer,
                maxAccountExposureMultiplier: this.settings.maxAccountExposureMultiplier,
                minStopDistancePct: this.settings.minStopDistancePct !== undefined ? (this.settings.minStopDistancePct > 1 ? this.settings.minStopDistancePct / 100 : this.settings.minStopDistancePct) : undefined,
                maxStopDistancePct: this.settings.maxStopDistancePct !== undefined ? (this.settings.maxStopDistancePct > 1 ? this.settings.maxStopDistancePct / 100 : this.settings.maxStopDistancePct) : undefined,
              },
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
    const macroColor = macro?.macroColor || 'GREEN';
    const isMacroTradable = macro ? macro.isTradable : true;
    const isFeedStale = Boolean(priceStream.isStale);
    const isLive = this.settings.tradingMode === 'LIVE' || (!this.settings.binanceTestnet && (this.settings as any).liveTradingActive);
    const hasLiveKeys = !isLive || Boolean(this.settings.binanceApiKey && this.settings.binanceApiSecret);

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
        passed: hasLiveKeys,
        metric: isLive ? (this.settings.binanceApiKey ? 'CONFIGURED' : 'MISSING KEYS') : 'PAPER MODE (Simulated)',
        reason: 'Live Trading Mode is enabled, but Binance Futures API Key or Secret is missing in Bot Credentials.',
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
          : `ENFORCED (${macro?.recommendedDirection || 'LONG'} ONLY)`,
        reason: this.settings.regimeDirectionEnforced === false
          ? 'Direction gate is bypassed. Both Long and Short signals are permitted.'
          : `Trades strictly locked to regime recommended direction (${macro?.recommendedDirection || 'LONG'}). Opposing signals are blocked.`,
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
        recommendedDirection: macro?.recommendedDirection || 'LONG',
        directionBiasLabel: macro?.directionBiasLabel || 'BULLISH',
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

    // Signal Audit Trail integration
    try {
      const decision = passes ? 'ENTER' : (rejectReason?.includes('Paused') || rejectReason?.includes('Failed Technical') ? 'WATCH' : 'REJECT');
      
      writeSignalAudit({
        signalId: `${symbol}-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
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
      const prioritySymbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT'];
      let usdtPairs = data
        .filter((d: any) => d.symbol.endsWith('USDT') && !d.symbol.includes('_'))
        .filter((d: any) => !filterStables || !STABLE_EXCLUSIONS.has(d.symbol))
        .filter((d: any) => parseFloat(d.quoteVolume || '0') >= minVolume)
        .sort((a: any, b: any) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume))
        .map((d: any) => d.symbol);

      if (usdtPairs.length < limit) {
        const fallbackPairs = data
          .filter((d: any) => d.symbol.endsWith('USDT') && !d.symbol.includes('_'))
          .filter((d: any) => !filterStables || !STABLE_EXCLUSIONS.has(d.symbol))
          .sort((a: any, b: any) => parseFloat(b.quoteVolume || '0') - parseFloat(a.quoteVolume || '0'))
          .map((d: any) => d.symbol);
        usdtPairs = Array.from(new Set([...usdtPairs, ...fallbackPairs]));
      }

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

    // 1. Local Per-Coin Technical Classification on closed bars
    const closedKlines = klines.slice(0, -1);
    const lastClosedCandle = closedKlines[closedKlines.length - 1];
    const closedPrice = lastClosedCandle?.close || currentPrice;
    const classification = classifyMarketRegime(closedKlines, closedPrice);

    // 2. Evaluate Strategy Routing (Each strategy executes its own Market Regime Filter)
    const rawSignal = await this._evaluateSignalRaw(symbol, klines, currentPrice, classification);
    if (!rawSignal) return null;
    
    // Strict Stop-Loss Gate Enforcement
    if (this.settings.enforceStrictSl !== false) {
      if (!rawSignal.sl || rawSignal.sl <= 0 || isNaN(rawSignal.sl)) {
        this.logScanResult(symbol, rawSignal.direction, false, 'Gate Failed: Setup lacks a valid Stop-Loss price (Strict SL rule)', currentPrice, 0, rawSignal.tp1, rawSignal.score);
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
      this.logScanResult(symbol, rawSignal.direction, false, `Gate Failed: SL too tight (Risk: ${(risk/currentPrice*100).toFixed(2)}%, Min: ${(minDistance/currentPrice*100).toFixed(2)}%)`, currentPrice, rawSignal.sl, rawSignal.tp1, rawSignal.score);
      return null;
    }

    // Maximum stop distance check (respects user's maxStopDistancePct setting to prevent excessive risk)
    const configuredMaxStopPct = this.settings.maxStopDistancePct !== undefined
      ? (this.settings.maxStopDistancePct > 1 ? this.settings.maxStopDistancePct / 100 : this.settings.maxStopDistancePct)
      : 0.05;
    const maxDistance = currentPrice * configuredMaxStopPct;
    if (risk > maxDistance) {
      this.logScanResult(symbol, rawSignal.direction, false, `Gate Failed: SL too wide (Risk: ${(risk/currentPrice*100).toFixed(2)}%, Max: ${(maxDistance/currentPrice*100).toFixed(2)}%)`, currentPrice, rawSignal.sl, rawSignal.tp1, rawSignal.score);
      return null;
    }
    
    // 3. Structural R:R Filter (Stand-Aside Rule)
    const reward3 = Math.abs(rawSignal.tp3 - currentPrice);
    const structuralRR = reward3 / risk;
    
    let strategyMinRR = 3.0;
    if (rawSignal.strategy === 'MULTICOIN_SCALPER_PRO') {
      strategyMinRR = this.settings.multicoinProfile === '15m_SWING' ? 1.5 : 1.2;
    } else if (rawSignal.strategy === 'RANGE_REGIME_V1' || rawSignal.strategy === 'RANGE_REGIME') {
      strategyMinRR = (this.settings as any).rangeRegimeParams?.minRewardRisk || 1.5;
    } else if (rawSignal.strategy === 'VCB' || rawSignal.strategy === 'VOLATILITY_COMPRESSION') {
      strategyMinRR = (this.settings as any).vcbParams?.minRewardRisk || 2.0;
    } else if (rawSignal.strategy === 'LIQUIDITY_SWEEP_REVERSAL') {
      strategyMinRR = this.settings.lsrMinRewardRisk || 2.0;
    } else if (rawSignal.strategy === 'TREND_PULLBACK') {
      strategyMinRR = this.settings.tpMinRiskRewardRatio || 2.0;
    } else if (rawSignal.strategy === 'ORDER_BLOCK') {
      strategyMinRR = this.settings.obMinRr || 3.5;
    } else if (rawSignal.strategy === 'COIL_BREAKOUT') {
      strategyMinRR = this.settings.coilMinRewardRisk || 5.0;
    } else if (rawSignal.strategy === 'DELTA_CLIMAX' || classification.regime.startsWith('EXHAUSTION')) {
      strategyMinRR = this.settings.crMinRewardRisk || 2.5;
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
    const rawStrategies: string[] = (this.settings.activeStrategies && this.settings.activeStrategies.length > 0)
      ? this.settings.activeStrategies
      : (this.settings.activeStrategy && this.settings.activeStrategy !== 'NONE' ? [this.settings.activeStrategy] : ['COIL_BREAKOUT', 'MULTICOIN_SCALPER_PRO', 'TREND_PULLBACK', 'LIQUIDITY_SWEEP_REVERSAL', 'RANGE_REGIME_V1', 'ORDER_BLOCK']);
    const activeStrategies: string[] = rawStrategies.filter(s => !deletedStrats.includes(s));
    
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

      const tp1Mult = this.settings.tp1AtrMultiple || 1.5;
      const tp2Mult = this.settings.tp2AtrMultiple || 2.2;
      const slMult = this.settings.slAtrMultiple || 1.0;

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
            const scaledScore = rangeSig.grade === 'GRADE_A'
              ? Math.max(88, rangeSig.score)
              : Math.max(80, rangeSig.score);
            rangeRegimeResult = {
              direction: rangeSig.direction,
              score: scaledScore,
              atr: rangeSig.atrExec,
              sl: rangeSig.stopLossPrice,
              tp1: rangeSig.tp1,
              tp2: rangeSig.tp2,
              tp3: rangeSig.tp2,
              strategy: 'RANGE_REGIME_V1',
              marketRegime: `Range Regime V1 (${rangeSig.setupType} | ${rangeSig.grade.replace('_', ' ')})`,
              strategyRegimeStatus: 'IN_FAVOR',
              strategyRegimeFavorable: true,
              reason: rangeSig.reason,
              signalTime: rangeSig.signalTime,
              structuralRR: rangeSig.netBlendedR
            };
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
oms.onTradeClosed = (pnl: number) => {
  autoTrader.updateDemoBalance(pnl);
};
oms.isEngineActive = () => autoTrader.isEngineActive();
