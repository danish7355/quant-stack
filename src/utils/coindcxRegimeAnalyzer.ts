/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * CoinDCX Futures Intraday Regime Analyzer
 * Implements 15m Trend Regime + 5m Volatility & Risk analysis with 1-2 core setups.
 */

import { calculateEMA, calculateATR, calculateADX } from './indicators';
import { TradingSettings } from '../shared/TradingSettings';

export type CoinDcxRegimeType = 'BULL_TREND' | 'BEAR_TREND' | 'RANGE_CHOP' | 'HIGH_VOL';

export interface TrendRegimeAnalysis {
  price: number;
  ema50: number;
  ema200: number;
  ema50Slope: number; // positive = up, negative = down
  ema200Slope: number;
  ema50SlopeDirection: 'UP' | 'DOWN' | 'FLAT';
  ema200SlopeDirection: 'UP' | 'DOWN' | 'FLAT';
  priceVsEma50: 'ABOVE' | 'BELOW' | 'AT';
  priceVsEma200: 'ABOVE' | 'BELOW' | 'AT';
  adx14: number;
  trendStrength: 'STRONG' | 'MODERATE' | 'WEAK_OR_RANGE';
  isBullTrend: boolean;
  isBearTrend: boolean;
  isRangeChop: boolean;
}

export interface VolatilityAnalysis {
  currentAtr: number;
  avgAtr25: number;
  atrRatio: number; // currentAtr / avgAtr25
  volatilityState: 'HIGH_VOL' | 'COMPRESSION' | 'NORMAL';
  actionGuidance: string;
}

export interface FundingAnalysis {
  fundingRate: number; // e.g. 0.0001 (0.01%)
  fundingRatePct: number; // e.g. 0.01
  squeezeRisk: 'LONG_SQUEEZE_RISK' | 'SHORT_SQUEEZE_RISK' | 'BALANCED';
  details: string;
}

export interface RegimeCoreSetup {
  id: string;
  name: string;
  type: 'PULLBACK' | 'BREAKOUT' | 'RANGE_FADE' | 'DEFENSIVE';
  timeframe: '5m' | '15m';
  mappedStrategyId: string;
  summary: string;
  conditions: string[];
  entryRule: string;
  stopLossRule: string;
  targets: string[];
  trailingRule: string;
  leverageGuidance: string;
}

export interface CoinDcxRegimeResult {
  symbol: string;
  timestamp: number;
  regime: CoinDcxRegimeType;
  regimeLabel: string;
  bias: 'LONG_ONLY' | 'SHORT_ONLY' | 'MEAN_REVERSION' | 'CAPITAL_PRESERVATION';
  biasDescription: string;
  confidence: number;
  trend: TrendRegimeAnalysis;
  volatility: VolatilityAnalysis;
  funding: FundingAnalysis;
  recommendedLeverage: number; // e.g. 3-5x
  recommendedRiskPct: number; // e.g. 0.25 - 0.5%
  recommendedDailyLossCapPct: number; // 2.0%
  setups: RegimeCoreSetup[];
  suggestedSettings: Partial<TradingSettings>;
  feeAnalysis: {
    makerFeePct: number;
    takerFeePct: number;
    gstRatePct: number;
    effectiveMakerPct: number;
    effectiveTakerPct: number;
    roundTripTakerPct: number;
    roundTripMakerTakerPct: number;
    breakevenMovePct: number;
  };
}

// CoinDCX Fee Constants (standard futures contract)
export const COINDCX_FEES = {
  makerRate: 0.00025, // 0.025%
  takerRate: 0.00075, // 0.075%
  gstRate: 0.18,      // 18% GST on brokerage fees
};

/**
 * Calculate effective CoinDCX trading fees including 18% GST
 */
export function calculateCoinDcxEffectiveFees() {
  const effectiveMakerPct = (COINDCX_FEES.makerRate * (1 + COINDCX_FEES.gstRate)) * 100; // ~0.0295%
  const effectiveTakerPct = (COINDCX_FEES.takerRate * (1 + COINDCX_FEES.gstRate)) * 100; // ~0.0885%
  const roundTripTakerPct = effectiveTakerPct * 2; // ~0.1770%
  const roundTripMakerTakerPct = effectiveMakerPct + effectiveTakerPct; // ~0.1180%
  
  return {
    makerFeePct: COINDCX_FEES.makerRate * 100,
    takerFeePct: COINDCX_FEES.takerRate * 100,
    gstRatePct: COINDCX_FEES.gstRate * 100,
    effectiveMakerPct: parseFloat(effectiveMakerPct.toFixed(4)),
    effectiveTakerPct: parseFloat(effectiveTakerPct.toFixed(4)),
    roundTripTakerPct: parseFloat(roundTripTakerPct.toFixed(4)),
    roundTripMakerTakerPct: parseFloat(roundTripMakerTakerPct.toFixed(4)),
    breakevenMovePct: parseFloat((roundTripMakerTakerPct * 1.15).toFixed(4)), // buffer for slip
  };
}

/**
 * Main CoinDCX Intraday Regime Analyzer
 * Evaluates 15m trend + 5m/15m volatility + funding rate to produce authoritative intraday regime.
 */
export function analyzeCoinDcxRegime(
  tf15mKlines: any[],
  tf5mKlines?: any[],
  fundingRate: number = 0.0001,
  symbol: string = 'BTCUSDT'
): CoinDcxRegimeResult {
  const feeAnalysis = calculateCoinDcxEffectiveFees();
  const timestamp = Date.now();

  if (!tf15mKlines || tf15mKlines.length < 30) {
    return createFallbackRegime(symbol, timestamp, feeAnalysis);
  }

  // 1. Process 15m Series
  const closes15m = tf15mKlines.map(k => Number(k.close));
  const highs15m = tf15mKlines.map(k => Number(k.high));
  const lows15m = tf15mKlines.map(k => Number(k.low));
  const currentPrice = closes15m[closes15m.length - 1];

  // 15m EMAs: 50 and 200
  const ema50Series = calculateEMA(closes15m, Math.min(50, closes15m.length));
  const ema200Series = calculateEMA(closes15m, Math.min(200, closes15m.length));

  const lastIdx = closes15m.length - 1;
  const ema50 = ema50Series[ema50Series.length - 1] || currentPrice;
  const ema200 = ema200Series[ema200Series.length - 1] || currentPrice;

  // 5-bar slope comparison
  const slopeLookback = Math.min(5, ema50Series.length - 1);
  const ema50Prev = ema50Series[ema50Series.length - 1 - slopeLookback] || ema50;
  const ema200Prev = ema200Series[ema200Series.length - 1 - slopeLookback] || ema200;

  const ema50Slope = (ema50 - ema50Prev) / (ema50Prev || 1);
  const ema200Slope = (ema200 - ema200Prev) / (ema200Prev || 1);

  const slopeThreshold = 0.0003; // 0.03% move over 5 bars to be sloping
  const ema50SlopeDirection: 'UP' | 'DOWN' | 'FLAT' = 
    ema50Slope > slopeThreshold ? 'UP' : ema50Slope < -slopeThreshold ? 'DOWN' : 'FLAT';
  const ema200SlopeDirection: 'UP' | 'DOWN' | 'FLAT' = 
    ema200Slope > slopeThreshold ? 'UP' : ema200Slope < -slopeThreshold ? 'DOWN' : 'FLAT';

  const priceVsEma50: 'ABOVE' | 'BELOW' | 'AT' = 
    currentPrice > ema50 * 1.0005 ? 'ABOVE' : currentPrice < ema50 * 0.9995 ? 'BELOW' : 'AT';
  const priceVsEma200: 'ABOVE' | 'BELOW' | 'AT' = 
    currentPrice > ema200 * 1.0005 ? 'ABOVE' : currentPrice < ema200 * 0.9995 ? 'BELOW' : 'AT';

  // 15m ADX(14)
  const adxResult = calculateADX(highs15m, lows15m, closes15m, 14);
  const adx14 = adxResult.adx[adxResult.adx.length - 1] || 15;
  const trendStrength: 'STRONG' | 'MODERATE' | 'WEAK_OR_RANGE' = 
    adx14 > 25 ? 'STRONG' : adx14 >= 20 ? 'MODERATE' : 'WEAK_OR_RANGE';

  // 2. Volatility Analysis (ATR 14 vs 25-bar ATR average)
  // Use 5m klines if available for sharper entry volatility, otherwise 15m
  const volKlines = (tf5mKlines && tf5mKlines.length >= 25) ? tf5mKlines : tf15mKlines;
  const volCloses = volKlines.map(k => Number(k.close));
  const volHighs = volKlines.map(k => Number(k.high));
  const volLows = volKlines.map(k => Number(k.low));

  const atrSeries = calculateATR(volHighs, volLows, volCloses, 14);
  const currentAtr = atrSeries[atrSeries.length - 1] || (currentPrice * 0.005);

  const atrSlice = atrSeries.slice(-25);
  const avgAtr25 = atrSlice.reduce((sum, v) => sum + v, 0) / (atrSlice.length || 1);
  const atrRatio = avgAtr25 > 0 ? (currentAtr / avgAtr25) : 1.0;

  let volatilityState: 'HIGH_VOL' | 'COMPRESSION' | 'NORMAL' = 'NORMAL';
  let actionGuidance = 'Normal volatility — Execute standard setups';

  if (atrRatio >= 1.35) {
    volatilityState = 'HIGH_VOL';
    actionGuidance = 'High Volatility (ATR ratio ≥ 1.35x) — Reduce position size, widen stops';
  } else if (atrRatio <= 0.75) {
    volatilityState = 'COMPRESSION';
    actionGuidance = 'Volatility Compression (ATR ratio ≤ 0.75x) — Watch for breakout expansion';
  }

  // Check for extreme single-candle news expansion in 15m
  const last15mRange = highs15m[lastIdx] - lows15m[lastIdx];
  const isNewsSpike = last15mRange >= (2.2 * currentAtr);

  // 3. Funding Rate Check
  const fundingRatePct = fundingRate * 100;
  let squeezeRisk: 'LONG_SQUEEZE_RISK' | 'SHORT_SQUEEZE_RISK' | 'BALANCED' = 'BALANCED';
  let fundingDetails = 'Funding rate balanced. No immediate squeeze pressure.';

  if (fundingRatePct >= 0.04) {
    squeezeRisk = 'LONG_SQUEEZE_RISK';
    fundingDetails = `Elevated positive funding (+${fundingRatePct.toFixed(4)}%). Long crowd pays high premium; caution on long squeeze.`;
  } else if (fundingRatePct <= -0.04) {
    squeezeRisk = 'SHORT_SQUEEZE_RISK';
    fundingDetails = `Elevated negative funding (${fundingRatePct.toFixed(4)}%). Shorts paying longs; caution on rapid short squeeze.`;
  }

  // 4. Regime Determination
  // A: Bull Trend: Price > 50 & 200 EMA, EMAs sloping up, ADX > 25
  const isBullTrend = (priceVsEma50 === 'ABOVE' && priceVsEma200 === 'ABOVE') &&
                      (ema50SlopeDirection === 'UP' || ema200SlopeDirection === 'UP') &&
                      adx14 >= 22; // Allow 22 as practical lower bound for strong trend

  // B: Bear Trend: Price < 50 & 200 EMA, EMAs sloping down, ADX > 25
  const isBearTrend = (priceVsEma50 === 'BELOW' && priceVsEma200 === 'BELOW') &&
                      (ema50SlopeDirection === 'DOWN' || ema200SlopeDirection === 'DOWN') &&
                      adx14 >= 22;

  // C: Range / Chop: ADX < 20, or price weaving around flat EMAs
  const isRangeChop = adx14 < 20 || 
                      ((priceVsEma50 !== priceVsEma200 || (ema50SlopeDirection === 'FLAT' && ema200SlopeDirection === 'FLAT')) && adx14 < 25);

  let regime: CoinDcxRegimeType = 'RANGE_CHOP';
  let regimeLabel = 'Range / Chop Day';
  let bias: 'LONG_ONLY' | 'SHORT_ONLY' | 'MEAN_REVERSION' | 'CAPITAL_PRESERVATION' = 'MEAN_REVERSION';
  let biasDescription = 'Mean-reversion bias: Fade range edges, avoid chasing breakouts.';
  let confidence = 75;

  if (isNewsSpike || atrRatio >= 1.55) {
    regime = 'HIGH_VOL';
    regimeLabel = 'High-Vol / Transition Regime';
    bias = 'CAPITAL_PRESERVATION';
    biasDescription = 'Capital preservation first: Stand aside or trade small size with wide stops.';
    confidence = 85;
  } else if (isBullTrend) {
    regime = 'BULL_TREND';
    regimeLabel = 'Bull Trend Day';
    bias = 'LONG_ONLY';
    biasDescription = 'Long bias: Focus on 5m pullback longs and 15m breakout continuations.';
    confidence = Math.min(95, Math.round(75 + (adx14 - 20) * 1.5));
  } else if (isBearTrend) {
    regime = 'BEAR_TREND';
    regimeLabel = 'Bear Trend Day';
    bias = 'SHORT_ONLY';
    biasDescription = 'Short bias: Focus on 5m rally-fade shorts and 15m breakdown continuations.';
    confidence = Math.min(95, Math.round(75 + (adx14 - 20) * 1.5));
  } else {
    regime = 'RANGE_CHOP';
    regimeLabel = 'Range / Chop Day';
    bias = 'MEAN_REVERSION';
    biasDescription = 'Oscillating market: Fade boundaries, buy support, sell resistance.';
    confidence = Math.min(90, Math.round(70 + (25 - Math.min(25, adx14)) * 1.2));
  }

  // 5. Construct 1-2 Core Setups & Recommended Engine Configuration
  const { setups, suggestedSettings, recommendedLeverage, recommendedRiskPct } = buildSetupsAndSettingsForRegime(
    regime,
    currentPrice,
    currentAtr,
    adx14
  );

  return {
    symbol,
    timestamp,
    regime,
    regimeLabel,
    bias,
    biasDescription,
    confidence,
    trend: {
      price: currentPrice,
      ema50: parseFloat(ema50.toFixed(2)),
      ema200: parseFloat(ema200.toFixed(2)),
      ema50Slope: parseFloat(ema50Slope.toFixed(6)),
      ema200Slope: parseFloat(ema200Slope.toFixed(6)),
      ema50SlopeDirection,
      ema200SlopeDirection,
      priceVsEma50,
      priceVsEma200,
      adx14: parseFloat(adx14.toFixed(1)),
      trendStrength,
      isBullTrend,
      isBearTrend,
      isRangeChop
    },
    volatility: {
      currentAtr: parseFloat(currentAtr.toFixed(4)),
      avgAtr25: parseFloat(avgAtr25.toFixed(4)),
      atrRatio: parseFloat(atrRatio.toFixed(2)),
      volatilityState,
      actionGuidance
    },
    funding: {
      fundingRate,
      fundingRatePct: parseFloat(fundingRatePct.toFixed(4)),
      squeezeRisk,
      details: fundingDetails
    },
    recommendedLeverage,
    recommendedRiskPct,
    recommendedDailyLossCapPct: 2.0, // Strict 2% CoinDCX intraday daily loss cap
    setups,
    suggestedSettings,
    feeAnalysis
  };
}

/**
 * Builds the 1-2 core CoinDCX setups and exact engine settings corresponding to the detected regime
 */
function buildSetupsAndSettingsForRegime(
  regime: CoinDcxRegimeType,
  currentPrice: number,
  atr: number,
  adx: number
): {
  setups: RegimeCoreSetup[];
  suggestedSettings: Partial<TradingSettings>;
  recommendedLeverage: number;
  recommendedRiskPct: number;
} {
  switch (regime) {
    case 'BULL_TREND': {
      const setups: RegimeCoreSetup[] = [
        {
          id: 'BULL_PULLBACK_LONG',
          name: 'Setup 1: 5m Pullback Long',
          type: 'PULLBACK',
          timeframe: '5m',
          mappedStrategyId: 'TREND_PULLBACK',
          summary: 'Wait for 5m price to pull back into 20/50 EMA with bullish rejection wick',
          conditions: [
            '15m chart is in confirmed Bull Trend (Price > 50/200 EMA, ADX > 22)',
            'Price pulls back to test 5m 20 EMA or 50 EMA pocket',
            'Bullish rejection candle forms (lower wick > 35% of candle range, close near high)',
            'Pullback volume contracts below 20-period moving average'
          ],
          entryRule: 'Buy market on confirmed break above the rejection candle high',
          stopLossRule: 'Place stop 1–1.5× ATR(14) below entry or beneath recent 5m swing low',
          targets: [
            'TP1: Prior 5m local high (take 50% off table)',
            'TP2: Measured move projection from swing low to previous high'
          ],
          trailingRule: 'Trail remaining size with 5m 20 EMA or 1.5× ATR trailing stop',
          leverageGuidance: '3× to 5× moderate leverage on CoinDCX Futures'
        },
        {
          id: 'BULL_BREAKOUT_CONTINUATION',
          name: 'Setup 2: 15m Breakout Continuation',
          type: 'BREAKOUT',
          timeframe: '15m',
          mappedStrategyId: 'VOLATILITY_COMPRESSION',
          summary: 'Long breakout as price closes above session high with high volume expansion',
          conditions: [
            'Session high (Asian / European / US session peak) marked on 15m chart',
            '5m candle closes cleanly above session high',
            'Breakout candle volume exceeds 1.5× 20-period volume average'
          ],
          entryRule: 'Enter long upon closed 5m candle confirmation above breakout level',
          stopLossRule: 'Stop loss placed below breakout candle low or midpoint of consolidation range',
          targets: [
            'Target 1: Projected height of prior consolidation range added to breakout level',
            'Target 2: Trailing continuation into momentum exhaustion'
          ],
          trailingRule: 'Move stop to breakeven once 1R reached; trail behind 5m swing lows',
          leverageGuidance: '3× to 4× leverage'
        }
      ];

      const suggestedSettings: Partial<TradingSettings> = {
        activeStrategy: 'TREND_PULLBACK',
        enabledStrategies: ['TREND_PULLBACK', 'VOLATILITY_COMPRESSION'],
        leverage: 4,
        accountRiskPct: 0.5,
        dailyLossLimitPct: 2.0,
        tpbAllowLongs: true,
        tpbAllowShorts: false, // Strict Bull Trend: No counter-trend shorts
        tpbAdxMin: Math.max(20, Math.min(30, Math.round(adx))),
        tpbSlopeLookbackBars: 5,
        tpbPullbackDepthAtr: 0.25
      };

      return { setups, suggestedSettings, recommendedLeverage: 4, recommendedRiskPct: 0.5 };
    }

    case 'BEAR_TREND': {
      const setups: RegimeCoreSetup[] = [
        {
          id: 'BEAR_RALLY_FADE_SHORT',
          name: 'Setup 1: 5m Rally-Fade Short',
          type: 'PULLBACK',
          timeframe: '5m',
          mappedStrategyId: 'TREND_PULLBACK',
          summary: 'Fade counter-trend relief rallies into 20/50 EMA or broken prior support',
          conditions: [
            '15m chart is in confirmed Bear Trend (Price < 50/200 EMA, ADX > 22)',
            'Price rallies up into 5m 20/50 EMA or prior broken support (now resistance)',
            'Bearish rejection candle prints (upper wick > 35% of candle range, close near low)',
            'Rally volume is weak or declining'
          ],
          entryRule: 'Short market on break of the bearish rejection candle low',
          stopLossRule: 'Place stop 1–1.5× ATR(14) above entry or above recent 5m swing high',
          targets: [
            'TP1: Prior 5m local swing low (lock in 50% profits)',
            'TP2: Next key HTF support or measured downward extension'
          ],
          trailingRule: 'Trail remaining position with 5m 20 EMA downward slope',
          leverageGuidance: '3× to 5× moderate leverage on CoinDCX Futures'
        },
        {
          id: 'BEAR_BREAKDOWN_CONTINUATION',
          name: 'Setup 2: 15m Breakdown Continuation',
          type: 'BREAKOUT',
          timeframe: '15m',
          mappedStrategyId: 'VOLATILITY_COMPRESSION',
          summary: 'Short breakdown as price breaches session low / prior day low with high volume',
          conditions: [
            'Key 15m support identified (session low or previous day low)',
            '5m candle closes decisively below support level',
            'Breakdown volume exceeds 1.5× 20-period volume average'
          ],
          entryRule: 'Enter short upon closed 5m candle confirmation below breakdown level',
          stopLossRule: 'Stop loss placed above the breakdown candle high',
          targets: [
            'Target 1: Projected height of prior consolidation range subtracted from breakdown level',
            'Target 2: Trailing downward trend continuation'
          ],
          trailingRule: 'Move stop to breakeven after TP1; trail behind 5m swing highs',
          leverageGuidance: '3× to 4× leverage'
        }
      ];

      const suggestedSettings: Partial<TradingSettings> = {
        activeStrategy: 'TREND_PULLBACK',
        enabledStrategies: ['TREND_PULLBACK', 'VOLATILITY_COMPRESSION'],
        leverage: 4,
        accountRiskPct: 0.5,
        dailyLossLimitPct: 2.0,
        tpbAllowLongs: false, // Strict Bear Trend: No counter-trend bottom fishing
        tpbAllowShorts: true,
        tpbAdxMin: Math.max(20, Math.min(30, Math.round(adx))),
        tpbSlopeLookbackBars: 5,
        tpbPullbackDepthAtr: 0.25
      };

      return { setups, suggestedSettings, recommendedLeverage: 4, recommendedRiskPct: 0.5 };
    }

    case 'RANGE_CHOP': {
      const setups: RegimeCoreSetup[] = [
        {
          id: 'RANGE_FADE_EDGES',
          name: 'Setup 1: Range Boundary Fade',
          type: 'RANGE_FADE',
          timeframe: '5m',
          mappedStrategyId: 'BINANCE_COMPOSITE',
          summary: 'Fade range extremes (buy support, sell resistance) — strictly no breakout chasing',
          conditions: [
            '15m chart displays clear horizontal boundaries with 2–3 touches each',
            'ADX < 20 and EMAs are flat/intertwined',
            '5m reaches range low with bullish rejection wick → Long Setup',
            '5m reaches range high with bearish rejection wick → Short Setup'
          ],
          entryRule: 'Enter on reversal confirmation inside boundary after wick rejection',
          stopLossRule: 'Stop loss placed 1× ATR outside the range boundary',
          targets: [
            'TP1: Range mid-point (50% level)',
            'TP2: Opposite side of the range boundary'
          ],
          trailingRule: 'Exit immediately if price stalls or prints counter-signals near mid-point',
          leverageGuidance: '2× to 3× conservative leverage (ranges penalize overleverage)'
        }
      ];

      const suggestedSettings: Partial<TradingSettings> = {
        activeStrategy: 'SMC_LIQUIDITY_SWEEP',
        enabledStrategies: ['SMC_LIQUIDITY_SWEEP', 'BINANCE_COMPOSITE'],
        leverage: 3,
        accountRiskPct: 0.35,
        dailyLossLimitPct: 2.0
      };

      return { setups, suggestedSettings, recommendedLeverage: 3, recommendedRiskPct: 0.35 };
    }

    case 'HIGH_VOL':
    default: {
      const setups: RegimeCoreSetup[] = [
        {
          id: 'DEFENSIVE_MOMENTUM_ONLY',
          name: 'Setup 1: Capital Preservation / Wide-Stop Continuation',
          type: 'DEFENSIVE',
          timeframe: '15m',
          mappedStrategyId: 'VOLATILITY_COMPRESSION',
          summary: 'High volatility or news event: Sit out or trade minimal size with wide ATR buffer',
          conditions: [
            'ATR ratio ≥ 1.35x or wide news candle printed',
            'Avoid counter-trend trades completely; wait for structure to stabilize',
            'If trading, align strictly with dominant 15m candle displacement'
          ],
          entryRule: 'Momentum continuation only after pullbacks hold key levels',
          stopLossRule: 'Wide 2× ATR stop loss to survive wider spreads and liquidation wicks',
          targets: ['Quick 1:1.5 R:R target; exit rapidly before reversals'],
          trailingRule: 'Fast breakeven trailing stop to prevent giving back profits',
          leverageGuidance: '1× to 2× maximum leverage to prevent liquidation'
        }
      ];

      const suggestedSettings: Partial<TradingSettings> = {
        activeStrategy: 'VOLATILITY_COMPRESSION',
        enabledStrategies: ['VOLATILITY_COMPRESSION'],
        leverage: 2,
        accountRiskPct: 0.25,
        dailyLossLimitPct: 2.0,
        tpbAllowBroadStop: true
      };

      return { setups, suggestedSettings, recommendedLeverage: 2, recommendedRiskPct: 0.25 };
    }
  }
}

/**
 * Fallback regime generator for initial load or offline states
 */
function createFallbackRegime(
  symbol: string,
  timestamp: number,
  feeAnalysis: ReturnType<typeof calculateCoinDcxEffectiveFees>
): CoinDcxRegimeResult {
  return {
    symbol,
    timestamp,
    regime: 'RANGE_CHOP',
    regimeLabel: 'Calibrating Market Regime...',
    bias: 'MEAN_REVERSION',
    biasDescription: 'Initializing multi-timeframe candle stream. Monitoring BTC/USDT session indicators.',
    confidence: 50,
    trend: {
      price: 0,
      ema50: 0,
      ema200: 0,
      ema50Slope: 0,
      ema200Slope: 0,
      ema50SlopeDirection: 'FLAT',
      ema200SlopeDirection: 'FLAT',
      priceVsEma50: 'AT',
      priceVsEma200: 'AT',
      adx14: 15,
      trendStrength: 'WEAK_OR_RANGE',
      isBullTrend: false,
      isBearTrend: false,
      isRangeChop: true
    },
    volatility: {
      currentAtr: 0,
      avgAtr25: 0,
      atrRatio: 1.0,
      volatilityState: 'NORMAL',
      actionGuidance: 'Waiting for candle sync...'
    },
    funding: {
      fundingRate: 0.0001,
      fundingRatePct: 0.01,
      squeezeRisk: 'BALANCED',
      details: 'Funding rate standby.'
    },
    recommendedLeverage: 3,
    recommendedRiskPct: 0.35,
    recommendedDailyLossCapPct: 2.0,
    setups: [],
    suggestedSettings: {
      leverage: 3,
      accountRiskPct: 0.35,
      dailyLossLimitPct: 2.0
    },
    feeAnalysis
  };
}
