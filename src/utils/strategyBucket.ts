import { calculateEMA, calculateATR, calculateRSI, calculateADX } from './indicators';


export type MarketRegimeType = 
  | 'TRENDING_UP'
  | 'TRENDING_DOWN'
  | 'RANGING'
  | 'EXHAUSTION_UP'
  | 'EXHAUSTION_DOWN'
  | 'BREAKOUT_UP'
  | 'BREAKOUT_DOWN'
  | 'TRANSITION'
  | 'UNCLEAR'
  | 'DEAD_VOLUME'
  | 'PANIC';

export interface StrategyBucketItem {
  id: string; // Strategy identifier, e.g. 'BINANCE_COMPOSITE', 'TREND_PULLBACK', 'DELTA_CLIMAX', etc.
  name: string;
  description: string;
  direction?: 'LONG' | 'SHORT';
  priority: number; // 1 = Highest preference (P1), 2 = High preference (P2), 3 = Supplementary (P3)
  enabled: boolean; // Included in Auto Strategy Selector bucket
}

export interface GlobalMarketRegime {
  regime: MarketRegimeType;
  label: string;
  details: string;
  symbol: string;
  timestamp: number;
  isTradable: boolean;
  macroColor: 'GREEN' | 'AMBER' | 'RED';
  btcPrice?: number;
  ethPrice?: number;
  adx?: number;
  atrPercentile?: number;
}

export const DEFAULT_STRATEGY_BUCKET: StrategyBucketItem[] = [
  { id: 'TREND_PULLBACK', name: 'Trend EMA Pullback', description: 'Confirmed pullback to dynamic value area in directional trend', priority: 1, enabled: true },
  { id: 'VOLATILITY_COMPRESSION', name: 'VCB Breakout', description: 'Volatility compression breakout with volume confirmation', priority: 2, enabled: true },
  { id: 'EARLY_COIL_BREAKOUT', name: 'Early Coil Breakout', description: 'Fractal compression breakout with structural trigger', priority: 2, enabled: true },
  { id: 'BINANCE_COMPOSITE', name: 'Range Mean Reversion', description: 'Bollinger Band extreme & RSI re-entry inside verified range', priority: 1, enabled: true },
  { id: 'SMC_LIQUIDITY_SWEEP', name: 'LSR Liquidity Sweep', description: 'Protected structure sweep and institutional FVG retest', priority: 2, enabled: true },
  { id: 'DELTA_CLIMAX', name: 'Delta Climax Reversal', description: 'Extreme volume exhaustion capitulation reversal', priority: 3, enabled: true },
  { id: 'MACRO_RANGE_BREAKOUT', name: 'Macro Box Breakout', description: 'Macro accumulation breakout beyond multi-day range', priority: 3, enabled: true }
];

export const strategyBucketMap: Record<MarketRegimeType, StrategyBucketItem[]> = {
  TRENDING_UP: [
    { id: 'TREND_PULLBACK', name: 'Trend EMA Pullback', description: 'Long pullback to EMA21/50 zone', priority: 1, direction: 'LONG', enabled: true },
    { id: 'VOLATILITY_COMPRESSION', name: 'VCB Breakout', description: 'Long continuation breakout', priority: 2, direction: 'LONG', enabled: true },
    { id: 'EARLY_COIL_BREAKOUT', name: 'Early Coil Breakout', description: 'Long early coil breakout', priority: 2, direction: 'LONG', enabled: true },
    { id: 'SMC_LIQUIDITY_SWEEP', name: 'LSR Liquidity Sweep', description: 'Long liquidity sweep of local lows', priority: 3, direction: 'LONG', enabled: true }
  ],
  TRENDING_DOWN: [
    { id: 'TREND_PULLBACK', name: 'Trend EMA Pullback', description: 'Short pullback to EMA21/50 zone', priority: 1, direction: 'SHORT', enabled: true },
    { id: 'VOLATILITY_COMPRESSION', name: 'VCB Breakout', description: 'Short breakdown expansion', priority: 2, direction: 'SHORT', enabled: true },
    { id: 'EARLY_COIL_BREAKOUT', name: 'Early Coil Breakout', description: 'Short early coil breakdown', priority: 2, direction: 'SHORT', enabled: true },
    { id: 'SMC_LIQUIDITY_SWEEP', name: 'LSR Liquidity Sweep', description: 'Short liquidity sweep of local highs', priority: 3, direction: 'SHORT', enabled: true }
  ],
  RANGING: [
    { id: 'BINANCE_COMPOSITE', name: 'Range Mean Reversion', description: 'Bollinger Bands & RSI re-entry mean reversion', priority: 1, enabled: true },
    { id: 'SMC_LIQUIDITY_SWEEP', name: 'LSR Liquidity Sweep', description: 'Sweep of range boundaries', priority: 2, enabled: true },
    { id: 'DELTA_CLIMAX', name: 'Delta Climax', description: 'Exhaustion at range extremes only', priority: 3, enabled: true }
  ],
  BREAKOUT_UP: [
    { id: 'VOLATILITY_COMPRESSION', name: 'VCB Breakout', description: 'Long volatility breakout beyond compression', priority: 1, direction: 'LONG', enabled: true },
    { id: 'EARLY_COIL_BREAKOUT', name: 'Early Coil Breakout', description: 'Long coil expansion', priority: 2, direction: 'LONG', enabled: true },
    { id: 'MACRO_RANGE_BREAKOUT', name: 'Macro Box Breakout', description: 'Long macro range breakout', priority: 3, direction: 'LONG', enabled: true }
  ],
  BREAKOUT_DOWN: [
    { id: 'VOLATILITY_COMPRESSION', name: 'VCB Breakout', description: 'Short volatility breakdown beyond compression', priority: 1, direction: 'SHORT', enabled: true },
    { id: 'EARLY_COIL_BREAKOUT', name: 'Early Coil Breakout', description: 'Short coil expansion', priority: 2, direction: 'SHORT', enabled: true },
    { id: 'MACRO_RANGE_BREAKOUT', name: 'Macro Box Breakout', description: 'Short macro range breakdown', priority: 3, direction: 'SHORT', enabled: true }
  ],
  EXHAUSTION_UP: [
    { id: 'DELTA_CLIMAX', name: 'Delta Climax', description: 'Fade extreme buying climax top', priority: 1, direction: 'SHORT', enabled: true },
    { id: 'SMC_LIQUIDITY_SWEEP', name: 'LSR Liquidity Sweep', description: 'Short liquidity run exhaustion', priority: 2, direction: 'SHORT', enabled: true }
  ],
  EXHAUSTION_DOWN: [
    { id: 'DELTA_CLIMAX', name: 'Delta Climax', description: 'Fade extreme selling climax bottom', priority: 1, direction: 'LONG', enabled: true },
    { id: 'SMC_LIQUIDITY_SWEEP', name: 'LSR Liquidity Sweep', description: 'Long liquidity run capitulation', priority: 2, direction: 'LONG', enabled: true }
  ],
  TRANSITION: [],
  UNCLEAR: [],
  DEAD_VOLUME: [],
  PANIC: []
};

export interface RegimeClassificationResult {
  regime: MarketRegimeType;
  label: string;
  details: string;
  confidence: number;
  macroColor: 'GREEN' | 'AMBER' | 'RED';
  metrics: {
    isTrending?: boolean;
    isUptrend: boolean;
    isDowntrend: boolean;
    atr: number;
    atrPct: number;
    atrPercentile: number;
    overextensionAtr?: number;
    isSqueezed?: boolean;
    rsi: number;
    adx: number;
    plusDI?: number;
    minusDI?: number;
    pctFromSma200?: number;
    ema9?: number;
    ema21?: number;
    ema50?: number;
    sma200?: number;
    emaStackAligned?: boolean;
    emaFlips: number;
    avgWickRatio: number;
    volumeRatio: number;
    bbWidth?: number;
  };
}

/**
 * Calculates the percentile rank (0.0 to 1.0) of the current ATR (or normalized ATR%)
 * across a lookback window of historical ATR values.
 */
export function calculateAtrPercentile(atrSeries: number[], currentAtr: number, lookback = 200): number {
  if (!atrSeries || atrSeries.length === 0) return 0.5;
  const slice = atrSeries.slice(-Math.min(lookback, atrSeries.length));
  if (slice.length === 0) return 0.5;
  const count = slice.filter(v => v <= currentAtr).length;
  return count / slice.length;
}

/**
 * Counts the number of times EMA9 crossed EMA21 over the specified lookback window.
 * High flip frequency signals choppy, directionless whipsaws.
 */
export function calculateEmaFlips(ema9: number[], ema21: number[], lookback = 20): number {
  if (ema9.length < 2 || ema21.length < 2) return 0;
  const start = Math.max(1, ema9.length - lookback);
  let flips = 0;
  for (let i = start; i < ema9.length; i++) {
    const prevDiff = ema9[i - 1] - ema21[i - 1];
    const currDiff = ema9[i] - ema21[i];
    if ((prevDiff > 0 && currDiff < 0) || (prevDiff < 0 && currDiff > 0)) {
      flips++;
    }
  }
  return flips;
}

/**
 * Measures the average wick ratio over recent candles to identify
 * erratic rejection noise and fakeouts.
 */
export function calculateWickRatio(klines: any[], lookback = 15): number {
  if (!klines || klines.length === 0) return 0;
  const slice = klines.slice(-Math.min(lookback, klines.length));
  let totalWick = 0;
  let totalRange = 0;
  for (const k of slice) {
    const upperWick = Math.max(0, k.high - Math.max(k.open, k.close));
    const lowerWick = Math.max(0, Math.min(k.open, k.close) - k.low);
    const range = Math.max(0.00001, k.high - k.low);
    totalWick += (upperWick + lowerWick);
    totalRange += range;
  }
  return totalRange > 0 ? (totalWick / totalRange) : 0;
}

/**
 * Counts how many times price has crossed the 200 SMA over a lookback window.
 */
export function countSmaCrossings(closes: number[], sma200: number, lookback = 30): number {
  const slice = closes.slice(-Math.min(lookback, closes.length));
  if (slice.length < 2) return 0;
  let crossings = 0;
  for (let i = 1; i < slice.length; i++) {
    const prevDiff = slice[i - 1] - sma200;
    const currDiff = slice[i] - sma200;
    if ((prevDiff > 0 && currDiff < 0) || (prevDiff < 0 && currDiff > 0)) {
      crossings++;
    }
  }
  return crossings;
}

/**
 * LAYER 1: BTC Macro Regime (Global Safety + Context)
 * 
 * Defines three macro states for BTCUSDT:
 * - RED: Non-Tradable (Safety Lockout) -> No new entries on any 100 coins.
 * - GREEN: Strong, Clean Macro Trend -> Full trading allowed. Favor Trending and Breakout.
 * - AMBER: Neutral / Transition / Mild Chop -> Full trading allowed. More selective (higher local confidence required).
 */
export function classifyBtcMacroRegime(
  btcKlines: any[],
  btcPrice: number
): GlobalMarketRegime {
  const now = Date.now();
  if (!btcKlines || btcKlines.length < 30) {
    return {
      regime: 'RANGING',
      label: 'MACRO: AMBER – Initializing',
      details: 'Insufficient BTC history for macro classification. Operating with caution.',
      symbol: 'BTCUSDT',
      timestamp: now,
      isTradable: true,
      macroColor: 'AMBER',
      btcPrice
    };
  }

  const closes = btcKlines.map(k => k.close);
  const highs = btcKlines.map(k => k.high);
  const lows = btcKlines.map(k => k.low);
  const volumes = btcKlines.map(k => k.volume || 0);
  const lastIdx = closes.length - 1;

  // 1. Moving Averages & Stack
  const ema9Series = calculateEMA(closes, 9);
  const ema21Series = calculateEMA(closes, 21);
  const ema50Series = calculateEMA(closes, Math.min(50, closes.length));
  const ema9 = ema9Series[ema9Series.length - 1] || btcPrice;
  const ema21 = ema21Series[ema21Series.length - 1] || btcPrice;
  const ema50 = ema50Series[ema50Series.length - 1] || btcPrice;

  const smaPeriod = Math.min(200, closes.length);
  const smaSlice = closes.slice(-smaPeriod);
  const sma200 = smaSlice.reduce((a, b) => a + b, 0) / (smaSlice.length || 1);

  const isUptrendStack = ema9 > ema21 && ema21 > ema50 && btcPrice > ema21 && btcPrice > sma200;
  const isDowntrendStack = ema9 < ema21 && ema21 < ema50 && btcPrice < ema21 && btcPrice < sma200;
  const emaStackAligned = isUptrendStack || isDowntrendStack;

  // 2. Normalized ATR (% of price) & ATR Percentile over historical lookback (200 candles)
  const atrSeries = calculateATR(highs, lows, closes, 14);
  const currentAtr = atrSeries[atrSeries.length - 1] || btcPrice * 0.01;
  const normalizedAtrSeries = atrSeries.map((a, idx) => (a / (closes[idx] || 1)) * 100);
  const currentNormalizedAtr = (currentAtr / (btcPrice || 1)) * 100;
  const atrPercentile = calculateAtrPercentile(normalizedAtrSeries, currentNormalizedAtr, 200);

  // 3. ADX (14)
  const adxResult = calculateADX(highs, lows, closes, 14);
  const adx = adxResult.adx[adxResult.adx.length - 1] || 15;

  // 4. Directional Flips & Wick Ratio (Noise / Fakeout indicators)
  const emaFlips = calculateEmaFlips(ema9Series, ema21Series, 20);
  const avgWickRatio = calculateWickRatio(btcKlines, 15);

  // 5. Volume Liquidity check
  const recent20Vol = volumes.slice(-20);
  const avgVol20 = recent20Vol.reduce((a, b) => a + b, 0) / (recent20Vol.length || 1);
  const currentVol = volumes[lastIdx] || 0;
  const isLiquidityFailure = avgVol20 > 0 && currentVol < (avgVol20 * 0.20);

  // --- RED: Safety Lockout triggers ---
  // A. ADX 18-25 AND frequent direction changes OR many long wicks / fakeouts
  const isWhipsawChop = (adx >= 18 && adx <= 25) && (emaFlips >= 3 || avgWickRatio > 0.65);
  // B. Calibrated ATR Expansion: require BOTH high percentile (>88%) AND elevated absolute normalized ATR (>1.25%), or extreme runaway (>2.2%)
  const isExtremeExpansion = (atrPercentile > 0.88 && currentNormalizedAtr > 1.25) || currentNormalizedAtr > 2.2;
  // C. Liquidity breakdown
  const isLiquidityDeficit = isLiquidityFailure || avgVol20 <= 0;

  if (isExtremeExpansion || isWhipsawChop || isLiquidityDeficit) {
    let reason = '';
    if (isExtremeExpansion) {
      reason = `Extreme volatility expansion (ATR%: ${currentNormalizedAtr.toFixed(2)}%, Percentile: ${(atrPercentile * 100).toFixed(0)}%). Flash panic risk.`;
    } else if (isWhipsawChop) {
      reason = `Erratic whipsaw chop: ADX ${adx.toFixed(1)} with ${emaFlips} EMA flips & ${(avgWickRatio * 100).toFixed(0)}% wick noise.`;
    } else {
      reason = `Severe BTC volume liquidity failure (< 20% of 20-period average).`;
    }

    return {
      regime: 'PANIC',
      label: 'MACRO: RED – Non-Tradable (Safety Lockout)',
      details: reason,
      symbol: 'BTCUSDT',
      timestamp: now,
      isTradable: false,
      macroColor: 'RED',
      btcPrice,
      adx,
      atrPercentile
    };
  }

  // --- GREEN: Strong, Clean Macro Trend ---
  // ADX > 22-25, price clearly above/below 200 SMA, aligned EMA stack, normal ATR percentile (15% to 80%)
  const isNormalAtr = atrPercentile >= 0.15 && atrPercentile <= 0.85;
  const isClearOfSma = Math.abs(btcPrice - sma200) / sma200 > 0.015;

  if (adx >= 22 && emaStackAligned && isClearOfSma && isNormalAtr) {
    const trendDir = isUptrendStack ? 'Bullish Expansion' : 'Bearish Impulse';
    return {
      regime: isUptrendStack ? 'TRENDING_UP' : 'TRENDING_DOWN',
      label: `MACRO: GREEN – ${isUptrendStack ? 'Uptrend' : 'Downtrend'}`,
      details: `Clean ${trendDir}. ADX: ${adx.toFixed(1)}, ATR Percentile: ${(atrPercentile * 100).toFixed(0)}%. Trending & Breakout favored.`,
      symbol: 'BTCUSDT',
      timestamp: now,
      isTradable: true,
      macroColor: 'GREEN',
      btcPrice,
      adx,
      atrPercentile
    };
  }

  // --- AMBER: Neutral / Transition / Mild Chop ---
  return {
    regime: 'RANGING',
    label: 'MACRO: AMBER – Neutral/Transition',
    details: `Transition environment / Mild oscillation near 200 SMA. ADX: ${adx.toFixed(1)}. Strict selectivity active (Req. Conf >= 70%).`,
    symbol: 'BTCUSDT',
    timestamp: now,
    isTradable: true,
    macroColor: 'AMBER',
    btcPrice,
    adx,
    atrPercentile
  };
}

/**
 * LAYER 2: Per-Coin Local Regime (Precision Routing) & Confidence Scoring
 * 
 * Classifies each coin into one primary regime:
 * 1. Trending (ADX > 22-25, EMA stack aligned, price away from 200 SMA, normal ATR)
 * 2. Ranging (ADX < 20, price oscillating around 200 SMA, flat EMAs, normal ATR)
 * 3. Breakout (Prior compression + strong close beyond box + volume surge + rising ADX)
 * 4. Exhaustion (Climax candle > 1.8x ATR + large rejection wick + momentum overextension)
 * 5. Local Non-Tradable (Whipsaws, panic ATR > 82%, or low volume / erratic noise)
 * 
 * If primary regime confidence is below the strict threshold (>= 65 for GREEN, >= 70 for AMBER),
 * the coin is labeled not_tradable (Stand Aside in Cash) to preserve accuracy.
 */
export function classifyMarketRegime(
  klines: any[],
  currentPrice: number,
  btcMacroColor: 'GREEN' | 'AMBER' | 'RED' = 'AMBER'
): RegimeClassificationResult {
  const dummyMetrics = {
    isTrending: false, isUptrend: false, isDowntrend: false, atr: 0, atrPct: 0,
    atrPercentile: 0, overextensionAtr: 0, isSqueezed: false, rsi: 50, adx: 0,
    pctFromSma200: 0, ema9: currentPrice, ema21: currentPrice, ema50: currentPrice,
    sma200: currentPrice, emaStackAligned: false, emaFlips: 0, avgWickRatio: 0, volumeRatio: 0
  };

  if (!klines || klines.length < 30) {
    return { regime: 'UNCLEAR', label: 'Insufficient Data', details: '', confidence: 0, macroColor: btcMacroColor, metrics: dummyMetrics };
  }

  const closes = klines.map((k) => k.close);
  const highs = klines.map((k) => k.high);
  const lows = klines.map((k) => k.low);
  const volumes = klines.map((k) => k.volume || 0);
  const lastIdx = closes.length - 1;

  const ema9Series = calculateEMA(closes, 9);
  const ema21Series = calculateEMA(closes, 21);
  const ema50Series = calculateEMA(closes, Math.min(50, closes.length));
  
  const ema9 = ema9Series[ema9Series.length - 1] || currentPrice;
  const ema21 = ema21Series[ema21Series.length - 1] || currentPrice;
  const ema50 = ema50Series[ema50Series.length - 1] || currentPrice;

  const smaPeriod = Math.min(200, closes.length);
  const smaSlice = closes.slice(-smaPeriod);
  const sma200 = smaSlice.reduce((a, b) => a + b, 0) / (smaSlice.length || 1);
  const pctFromSma200 = Math.abs(currentPrice - sma200) / (sma200 || 1);

  const atrSeries = calculateATR(highs, lows, closes, 14);
  const atr = atrSeries[atrSeries.length - 1] || currentPrice * 0.01;
  const atrPct = (atr / currentPrice) * 100;
  const normalizedAtrSeries = atrSeries.map((a, idx) => (a / (closes[idx] || 1)) * 100);
  const currentNormalizedAtr = (atr / (currentPrice || 1)) * 100;
  const atrPercentile = calculateAtrPercentile(normalizedAtrSeries, currentNormalizedAtr, 200);

  const adxResult = calculateADX(highs, lows, closes, 14);
  const adx = adxResult.adx[adxResult.adx.length - 1] || 15;
  const plusDI = adxResult.plusDI[adxResult.plusDI.length - 1] || 0;
  const minusDI = adxResult.minusDI[adxResult.minusDI.length - 1] || 0;

  const rsiSeries = calculateRSI(closes, 14);
  const rsi = rsiSeries[rsiSeries.length - 1] || 50;
  
  const overextensionAtr = Math.abs(currentPrice - ema50) / (atr || 1);

  const recent20Closes = closes.slice(-20);
  const mean20 = recent20Closes.reduce((a, b) => a + b, 0) / (recent20Closes.length || 1);
  const variance = recent20Closes.reduce((acc, val) => acc + Math.pow(val - mean20, 2), 0) / (recent20Closes.length || 1);
  const stdDev20 = Math.sqrt(variance);
  const bbWidth = (stdDev20 * 2) / (mean20 || 1);
  const isSqueezed = bbWidth < 0.022 || (atrSeries.length >= 25 && atr < (atrSeries[atrSeries.length - 20] || atr) * 0.72);

  const emaFlips = calculateEmaFlips(ema9Series, ema21Series, 20);
  const avgWickRatio = calculateWickRatio(klines, 15);
  const smaCrossings = countSmaCrossings(closes, sma200, 30);

  const recent20Vol = volumes.slice(-20);
  const avgVol20 = recent20Vol.reduce((a, b) => a + b, 0) / (recent20Vol.length || 1);
  const currentVol = volumes[lastIdx] || 0;
  const volumeRatio = avgVol20 > 0 ? (currentVol / avgVol20) : 1;

  const isUptrend = ema9 > ema21 && ema21 > ema50 && currentPrice > ema21;
  const isDowntrend = ema9 < ema21 && ema21 < ema50 && currentPrice < ema21;
  const emaStackAligned = isUptrend || isDowntrend;
  
  const metrics: RegimeClassificationResult['metrics'] = {
    adx: parseFloat(adx.toFixed(1)),
    plusDI: parseFloat(plusDI.toFixed(1)),
    minusDI: parseFloat(minusDI.toFixed(1)),
    rsi: parseFloat(rsi.toFixed(1)),
    atr: parseFloat(atr.toFixed(4)),
    atrPct: parseFloat(atrPct.toFixed(2)),
    atrPercentile: parseFloat(atrPercentile.toFixed(2)),
    isUptrend,
    isDowntrend,
    bbWidth: parseFloat(bbWidth.toFixed(4)),
    emaFlips,
    avgWickRatio: parseFloat(avgWickRatio.toFixed(2)),
    volumeRatio: parseFloat(volumeRatio.toFixed(2))
  };

  // 1. PANIC (Non-tradable)
  if ((atrPercentile > 0.88 && currentNormalizedAtr > 1.25) || currentNormalizedAtr > 2.2 || btcMacroColor === 'RED') {
    return { regime: 'PANIC', label: 'Panic / Extreme Volatility', details: 'Extreme ATR volatility expansion or BTC Macro Red lockout', confidence: 0, macroColor: btcMacroColor, metrics };
  }

  // 2. DEAD_VOLUME (Non-tradable)
  if (avgVol20 > 0 && currentVol < (avgVol20 * 0.15)) {
    return { regime: 'DEAD_VOLUME', label: 'Dead Volume / Illiquid', details: 'Volume collapsed below 15% of 20-period average', confidence: 0, macroColor: btcMacroColor, metrics };
  }

  // 3. TRANSITION CHECKS (No-Trade Transition Zone)
  // Indicators disagree: rapid EMA flips, frequent crossings of SMA/EMA, flattening slopes, wide wicks
  const isTransitionNoise = emaFlips >= 3 || smaCrossings >= 3 || avgWickRatio > 0.58;
  const isTransitionAdx = adx >= 17 && adx <= 22;
  const ema20Slope = (ema9Series[ema9Series.length - 1] - ema9Series[ema9Series.length - 5]) / 5;
  const isSlopeFlat = Math.abs(ema20Slope) < (currentPrice * 0.0001);

  if ((isTransitionNoise && isTransitionAdx) || (isSlopeFlat && emaFlips >= 2)) {
    return { 
      regime: 'TRANSITION', 
      label: 'Transition Zone [No Trade]', 
      details: `Conflicting indicators: ${emaFlips} EMA flips, ${smaCrossings} SMA crossings, ${(avgWickRatio * 100).toFixed(0)}% wicks. Standing aside.`, 
      confidence: 0, 
      macroColor: btcMacroColor, 
      metrics 
    };
  }

  // 4. EXHAUSTION REVERSAL (Directional)
  const lastRange = highs[lastIdx] - lows[lastIdx];
  const isClimaxCandle = lastRange > (1.8 * atr);
  if (isClimaxCandle || overextensionAtr >= 1.75) {
     const lastUpperWick = Math.max(0, highs[lastIdx] - Math.max(closes[lastIdx], klines[lastIdx].open));
     const lastLowerWick = Math.max(0, Math.min(closes[lastIdx], klines[lastIdx].open) - lows[lastIdx]);
     // Upper rejection wick and close off the high
     if (lastUpperWick > 0.38 * lastRange && closes[lastIdx] < highs[lastIdx] - (0.25 * lastRange)) {
       const conf = Math.min(95, Math.max(65, Math.round(70 + (lastUpperWick / (lastRange || 1)) * 25 + Math.min(10, (overextensionAtr - 1.5) * 10))));
       return { regime: 'EXHAUSTION_UP', label: 'Exhaustion Up [Fade Top]', details: 'Buying climax with upper rejection wick', confidence: conf, macroColor: btcMacroColor, metrics };
     }
     // Lower rejection wick and close off the low
     if (lastLowerWick > 0.38 * lastRange && closes[lastIdx] > lows[lastIdx] + (0.25 * lastRange)) {
       const conf = Math.min(95, Math.max(65, Math.round(70 + (lastLowerWick / (lastRange || 1)) * 25 + Math.min(10, (overextensionAtr - 1.5) * 10))));
       return { regime: 'EXHAUSTION_DOWN', label: 'Exhaustion Down [Fade Bottom]', details: 'Selling climax with lower rejection wick', confidence: conf, macroColor: btcMacroColor, metrics };
     }
  }

  // 5. BREAKOUT (Directional, confirmed closed candle)
  const hasPriorCompression = isSqueezed || bbWidth < 0.025;
  const recentHighs = highs.slice(-15, -1);
  const recentLows = lows.slice(-15, -1);
  if (hasPriorCompression && volumeRatio > 1.25) {
     const maxRecentHigh = Math.max(...recentHighs);
     const minRecentLow = Math.min(...recentLows);
     const candleRange = highs[lastIdx] - lows[lastIdx];
     const upperWick = highs[lastIdx] - Math.max(closes[lastIdx], klines[lastIdx].open);
     const lowerWick = Math.min(closes[lastIdx], klines[lastIdx].open) - lows[lastIdx];

     // Breakout Up: closed cleanly above boundary with small upper wick (< 35% of range)
     if (recentHighs.length > 0 && closes[lastIdx] > maxRecentHigh + (0.10 * atr) && upperWick < 0.35 * candleRange) {
       const conf = Math.min(95, Math.max(70, Math.round(70 + Math.min(15, (volumeRatio - 1.0) * 15) + (isSqueezed ? 10 : 0))));
       return { regime: 'BREAKOUT_UP', label: 'Breakout Up', details: 'Confirmed closed breakout above compression resistance', confidence: conf, macroColor: btcMacroColor, metrics };
     }
     // Breakout Down: closed cleanly below boundary with small lower wick (< 35% of range)
     if (recentLows.length > 0 && closes[lastIdx] < minRecentLow - (0.10 * atr) && lowerWick < 0.35 * candleRange) {
       const conf = Math.min(95, Math.max(70, Math.round(70 + Math.min(15, (volumeRatio - 1.0) * 15) + (isSqueezed ? 10 : 0))));
       return { regime: 'BREAKOUT_DOWN', label: 'Breakout Down', details: 'Confirmed closed breakdown below compression support', confidence: conf, macroColor: btcMacroColor, metrics };
     }
  }

  // 6. TRENDING (Directional, intact structure, aligned EMAs and DI control)
  if (adx >= 20 && overextensionAtr <= 2.2) {
      if (isUptrend && ema20Slope > 0 && plusDI > minusDI && closes[lastIdx] > ema50) {
        const conf = Math.min(95, Math.max(70, Math.round(65 + Math.min(20, (adx - 20) * 1.5) + (plusDI - minusDI > 8 ? 10 : 0))));
        return { regime: 'TRENDING_UP', label: 'Trending Up [Bullish]', details: `Bullish Trend: ADX ${adx.toFixed(1)}, +DI > -DI, Price > EMA50`, confidence: conf, macroColor: btcMacroColor, metrics };
      }
      if (isDowntrend && ema20Slope < 0 && minusDI > plusDI && closes[lastIdx] < ema50) {
        const conf = Math.min(95, Math.max(70, Math.round(65 + Math.min(20, (adx - 20) * 1.5) + (minusDI - plusDI > 8 ? 10 : 0))));
        return { regime: 'TRENDING_DOWN', label: 'Trending Down [Bearish]', details: `Bearish Trend: ADX ${adx.toFixed(1)}, -DI > +DI, Price < EMA50`, confidence: conf, macroColor: btcMacroColor, metrics };
      }
  }

  // 7. RANGING (Clean oscillation near 200 SMA without breakout expansion)
  if (adx < 20 && pctFromSma200 < 0.025 && !hasPriorCompression && volumeRatio < 1.15 && emaFlips <= 2) {
      const conf = Math.min(90, Math.max(65, Math.round(65 + Math.min(15, (20 - adx) * 1.5) + (emaFlips <= 1 ? 10 : 0))));
      return { regime: 'RANGING', label: 'Ranging [Mean Reversion]', details: 'Low ADX range oscillation around 200 SMA', confidence: conf, macroColor: btcMacroColor, metrics };
  }

  // 8. Default fallback: TRANSITION (Stand aside in cash)
  return { regime: 'TRANSITION', label: 'Transition Zone [Stand Aside]', details: 'Market regime unconfirmed or between states', confidence: 0, macroColor: btcMacroColor, metrics };
}

/**
 * Filters the user's Strategy Bucket for strategies that are:
 * 1. Enabled by the user
 * 2. Strictly designated for the detected market regime
 * 
 * In AMBER macro environments, P1 strategies are prioritized.
 * Returns candidates sorted by priority (1 = P1 highest priority).
 */
export function getEligibleBucketStrategies(
  bucket: StrategyBucketItem[],
  regime: MarketRegimeType,
  macroColor: 'GREEN' | 'AMBER' | 'RED' = 'GREEN'
): StrategyBucketItem[] {
  const mapped = strategyBucketMap[regime] || [];
  if (!mapped || mapped.length === 0) return [];

  // Cross-reference mapped strategies with the user-defined bucket configuration
  const userBucketMap = new Map<string, StrategyBucketItem>();
  if (bucket && Array.isArray(bucket)) {
    for (const item of bucket) {
      userBucketMap.set(item.id, item);
    }
  }

  const result: StrategyBucketItem[] = [];

  for (const m of mapped) {
    const userItem = userBucketMap.get(m.id);
    // If the user explicitly disabled this strategy in their bucket settings, skip it
    if (userItem && userItem.enabled === false) {
      continue;
    }

    const priority = userItem?.priority || m.priority || 1;
    result.push({
      ...m,
      enabled: true,
      priority
    });
  }

  // Filter in AMBER environments to P1 strategies only
  let filtered = result;
  if (macroColor === 'AMBER') {
    filtered = filtered.filter(item => item.priority === 1);
  }

  // Sort by priority ascending (P1 first, then P2, then P3)
  return filtered.sort((a, b) => a.priority - b.priority);
}


