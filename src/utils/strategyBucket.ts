import { calculateEMA, calculateATR, calculateRSI } from './indicators';

export type TradableRegimeType = 'trending' | 'ranging' | 'exhaustion' | 'breakout';
export type MarketRegimeType = TradableRegimeType | 'not_tradable';

export interface StrategyBucketItem {
  id: string; // Strategy identifier, e.g. 'BINANCE_COMPOSITE', 'TREND_PULLBACK', 'DELTA_CLIMAX', etc.
  name: string;
  description: string;
  regimes: TradableRegimeType[];
  priority: number; // 1 = Highest preference, 2, 3, etc.
  enabled: boolean; // Included in Auto Strategy Selector bucket
}

export const DEFAULT_STRATEGY_BUCKET: StrategyBucketItem[] = [
  {
    id: 'BINANCE_COMPOSITE',
    name: 'Ranging 1:3 R:R Mean-Reversion',
    description: 'Bollinger Bands (20,2) + RSI(14) re-entry confirmation with tight structure stop & 1:3 target',
    regimes: ['ranging'],
    priority: 1,
    enabled: true,
  },
  {
    id: 'TREND_PULLBACK',
    name: 'Trend EMA Pullback',
    description: 'Rides macro trend, enters on pullback rejection at moving averages with volume defense',
    regimes: ['trending'],
    priority: 1,
    enabled: true,
  },
  {
    id: 'DELTA_CLIMAX',
    name: 'Delta Climax Reversal',
    description: 'Capitulation candle & wick rejection mean-reversion algorithm during momentum exhaustion',
    regimes: ['exhaustion', 'ranging'],
    priority: 2,
    enabled: true,
  },
  {
    id: 'VOLATILITY_COMPRESSION',
    name: 'VCB Breakout + Price Action',
    description: 'Squeeze release with Spring/Upthrust & Buildup Price Action filters',
    regimes: ['breakout', 'trending'],
    priority: 2,
    enabled: true,
  },
  {
    id: 'MACRO_RANGE_BREAKOUT',
    name: 'Macro Accumulation Box',
    description: 'Massive 150-candle Wyckoff accumulation breakouts beyond horizontal box boundaries',
    regimes: ['breakout'],
    priority: 3,
    enabled: true,
  },
  {
    id: 'EARLY_COIL_BREAKOUT',
    name: 'Early Coil Breakout',
    description: 'Fractal pivot pre-confirmation breakout strategy',
    regimes: ['breakout', 'trending'],
    priority: 3,
    enabled: true,
  },
  {
    id: 'SMC_LIQUIDITY_SWEEP',
    name: 'Liquidity Sweep Reversal (LSR)',
    description: 'HTF liquidity grab, MSS market structure shift, Fair Value Gap entry',
    regimes: ['ranging', 'exhaustion'],
    priority: 2,
    enabled: true,
  },
];

export interface RegimeClassificationResult {
  regime: MarketRegimeType;
  label: string;
  details: string;
  metrics: {
    isTrending: boolean;
    isUptrend: boolean;
    isDowntrend: boolean;
    atr: number;
    atrPct: number;
    overextensionAtr: number;
    isSqueezed: boolean;
    rsi: number;
    pctFromSma200: number;
    ema9: number;
    ema21: number;
    ema50: number;
  };
}

/**
 * Classifies market regime based on multi-timeframe price action,
 * moving averages, volatility (ATR/Bollinger), overextension, and momentum.
 */
export function classifyMarketRegime(
  klines: any[],
  currentPrice: number
): RegimeClassificationResult {
  if (!klines || klines.length < 30) {
    return {
      regime: 'not_tradable',
      label: 'Insufficient Data',
      details: 'Less than 30 candles available for statistical regime classification',
      metrics: {
        isTrending: false,
        isUptrend: false,
        isDowntrend: false,
        atr: 0,
        atrPct: 0,
        overextensionAtr: 0,
        isSqueezed: false,
        rsi: 50,
        pctFromSma200: 0,
        ema9: currentPrice,
        ema21: currentPrice,
        ema50: currentPrice,
      },
    };
  }

  const closes = klines.map((k) => k.close);
  const lastIdx = closes.length - 1;

  // 1. Moving Averages
  const ema9Series = calculateEMA(closes, 9);
  const ema21Series = calculateEMA(closes, 21);
  const ema50Series = calculateEMA(closes, Math.min(50, closes.length));
  
  const ema9 = ema9Series[ema9Series.length - 1] || currentPrice;
  const ema21 = ema21Series[ema21Series.length - 1] || currentPrice;
  const ema50 = ema50Series[ema50Series.length - 1] || currentPrice;

  // Approximate 200 SMA (or use 50 if klines < 200)
  const smaPeriod = Math.min(200, closes.length);
  const smaSlice = closes.slice(-smaPeriod);
  const sma200 = smaSlice.reduce((a, b) => a + b, 0) / (smaSlice.length || 1);
  const pctFromSma200 = Math.abs(currentPrice - sma200) / (sma200 || 1);

  // 2. ATR (14)
  const highs = klines.map((k) => k.high);
  const lows = klines.map((k) => k.low);
  const atrSeries = calculateATR(highs, lows, closes, 14);
  const atr = atrSeries[atrSeries.length - 1] || currentPrice * 0.01;
  const atrPct = (atr / currentPrice) * 100;

  // 3. Overextension from EMA50
  const overextensionAtr = Math.abs(currentPrice - ema50) / (atr || 1);

  // 4. RSI (14)
  const rsiSeries = calculateRSI(closes, 14);
  const rsi = rsiSeries[rsiSeries.length - 1] || 50;

  // 5. Volatility Squeeze detection (Bollinger vs Keltner proxy or ATR contraction)
  // Check if standard deviation of last 20 bars is compressed relative to ATR
  const recent20 = closes.slice(-20);
  const mean20 = recent20.reduce((a, b) => a + b, 0) / (recent20.length || 1);
  const variance = recent20.reduce((acc, val) => acc + Math.pow(val - mean20, 2), 0) / (recent20.length || 1);
  const stdDev20 = Math.sqrt(variance);
  const bbWidth = (stdDev20 * 2) / (mean20 || 1);
  const isSqueezed = bbWidth < 0.018 || (atrSeries.length >= 25 && atr < (atrSeries[atrSeries.length - 20] || atr) * 0.72);

  // 6. Trend Direction & Quality
  const isUptrend = ema9 > ema21 && ema21 > ema50 && currentPrice > ema21;
  const isDowntrend = ema9 < ema21 && ema21 < ema50 && currentPrice < ema21;
  const emaSeparation = Math.abs(ema9 - ema50);
  const hasStrongEmaSlope = emaSeparation >= atr * 0.35;
  const isTrending = (isUptrend || isDowntrend) && hasStrongEmaSlope && pctFromSma200 > 0.015;

  // Dead volume or untradable condition
  if (atrPct < 0.18) {
    return {
      regime: 'not_tradable',
      label: 'Dead Volume / Flat',
      details: `ATR% (${atrPct.toFixed(2)}%) is below minimum liquidity threshold (0.18%). Standing aside.`,
      metrics: {
        isTrending: false,
        isUptrend: false,
        isDowntrend: false,
        atr,
        atrPct,
        overextensionAtr,
        isSqueezed,
        rsi,
        pctFromSma200,
        ema9,
        ema21,
        ema50,
      },
    };
  }

  // Exhaustion / Capitulation Climax
  if (overextensionAtr >= 1.85 || (rsi <= 24 && currentPrice < ema50) || (rsi >= 76 && currentPrice > ema50)) {
    return {
      regime: 'exhaustion',
      label: 'Exhaustion Climax',
      details: `Extreme momentum extension (${overextensionAtr.toFixed(1)}x ATR from EMA50, RSI: ${rsi.toFixed(1)}). Reversion probable.`,
      metrics: {
        isTrending,
        isUptrend,
        isDowntrend,
        atr,
        atrPct,
        overextensionAtr,
        isSqueezed,
        rsi,
        pctFromSma200,
        ema9,
        ema21,
        ema50,
      },
    };
  }

  // Breakout / Squeeze Compression
  if (isSqueezed) {
    return {
      regime: 'breakout',
      label: 'Consolidation Squeeze',
      details: `Volatility compression detected (BB width: ${(bbWidth * 100).toFixed(2)}%, low ATR ratio). Energy coiled for expansion.`,
      metrics: {
        isTrending,
        isUptrend,
        isDowntrend,
        atr,
        atrPct,
        overextensionAtr,
        isSqueezed: true,
        rsi,
        pctFromSma200,
        ema9,
        ema21,
        ema50,
      },
    };
  }

  // Trending
  if (isTrending) {
    return {
      regime: 'trending',
      label: isUptrend ? 'Directional Uptrend' : 'Directional Downtrend',
      details: `Clear directional momentum (EMA9/21/50 alignment, price ±${(pctFromSma200 * 100).toFixed(1)}% of 200-SMA).`,
      metrics: {
        isTrending: true,
        isUptrend,
        isDowntrend,
        atr,
        atrPct,
        overextensionAtr,
        isSqueezed,
        rsi,
        pctFromSma200,
        ema9,
        ema21,
        ema50,
      },
    };
  }

  // Ranging / Mean-Reverting
  return {
    regime: 'ranging',
    label: 'Ranging / Oscillation',
    details: `Sideways oscillation within ±${(pctFromSma200 * 100).toFixed(1)}% of 200-SMA. Ideal for Bollinger Band / RSI mean-reversion.`,
    metrics: {
      isTrending: false,
      isUptrend: false,
      isDowntrend: false,
      atr,
      atrPct,
      overextensionAtr,
      isSqueezed,
      rsi,
      pctFromSma200,
      ema9,
      ema21,
      ema50,
    },
  };
}

/**
 * Filters the user's Strategy Bucket for strategies that are:
 * 1. Enabled by the user
 * 2. Allowed to run in the current detected market regime
 * Returns candidates sorted by priority (1 = highest priority).
 */
export function getEligibleBucketStrategies(
  bucket: StrategyBucketItem[],
  regime: MarketRegimeType
): StrategyBucketItem[] {
  if (regime === 'not_tradable') {
    return [];
  }
  const eligible = bucket.filter(
    (item) => item.enabled && item.regimes.includes(regime as any)
  );
  // Sort by priority ascending (1 is top priority, 2 is next, etc.)
  return eligible.sort((a, b) => (a.priority || 99) - (b.priority || 99));
}
