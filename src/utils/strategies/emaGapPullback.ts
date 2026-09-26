/**
 * 5 EMA Gap Pullback Strategy
 * 
 * A trend-following pullback continuation strategy that trades high-quality
 * 5 EMA gap candles after structured pullbacks, filtered by HTF trend alignment.
 * 
 * Key Rules:
 * 1. HTF Trend Filter (1H): Only long above 50 EMA (sloping up), short below (sloping down)
 * 2. Overextension Guard: Reject if |close − EMA21| > 1 × ATR(14)
 * 3. Pullback Structure: ≥ 3 candles pulling back toward 5 EMA (flag/wedge, not V-spike)
 * 4. Gap Candle Quality: Body mostly beyond 5 EMA, volume ≥ 1.5× avg20
 * 5. Failed Breakout Filter: Next candle closing back inside 5 EMA → abort
 * 6. Entry near 5 EMA or mid-gap, SL beyond recent swing, TP1=1R, TP2=1.5R, TP3=2.5R
 */

// ─── Interfaces ────────────────────────────────────────────────
export interface EmaGapSignal {
  status: 'confirmed' | 'pullback_forming' | 'rejected';
  direction?: 'LONG' | 'SHORT';
  entry?: number;
  stop?: number;
  tp1?: number;
  tp2?: number;
  tp3?: number;
  score?: number;
  atr?: number;
  ema5?: number;
  ema21?: number;
  ema50Htf?: number;
  pullbackBars?: number;
  volumeRatio?: number;
  distToEma21Atr?: number;
  gapCandleBodyPct?: number;
  signalTime?: number;
  reason?: string;
  riskPerUnit?: number;
}

export interface EmaGapSettings {
  egpEma5Period?: number;
  egpEma21Period?: number;
  egpHtfEma50Period?: number;
  egpHtfSlopeLookback?: number;
  egpMinPullbackBars?: number;
  egpMinGapBodyPct?: number;
  egpVolumeMultiplier?: number;
  egpMaxDistToEma21Atr?: number;
  egpAtrPeriod?: number;
  egpMaxWickRatioForFail?: number;
  egpTp1RMultiple?: number;
  egpTp2RMultiple?: number;
  egpTp3RMultiple?: number;
  egpSlSwingLookback?: number;
  egpSlAtrBuffer?: number;
}

// ─── Indicator Utilities ────────────────────────────────────────

export function calcEma(data: number[], period: number): number[] {
  if (data.length === 0) return [];
  const k = 2 / (period + 1);
  const ema: number[] = [data[0]];
  for (let i = 1; i < data.length; i++) {
    ema.push(data[i] * k + ema[i - 1] * (1 - k));
  }
  return ema;
}

export function calcSma(data: number[], period: number): number[] {
  const sma: number[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      sma.push(data.slice(0, i + 1).reduce((a, b) => a + b, 0) / (i + 1));
    } else {
      const slice = data.slice(i - period + 1, i + 1);
      sma.push(slice.reduce((a, b) => a + b, 0) / period);
    }
  }
  return sma;
}

export function calcAtr(candles: any[], period: number = 14): number[] {
  if (candles.length < 2) return candles.map(() => 0);
  const tr: number[] = [candles[0].high - candles[0].low];
  for (let i = 1; i < candles.length; i++) {
    const h = candles[i].high;
    const l = candles[i].low;
    const pc = candles[i - 1].close;
    tr.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  // Wilder's smoothing
  const atr: number[] = [];
  let seed = 0;
  for (let i = 0; i < Math.min(period, tr.length); i++) seed += tr[i];
  seed /= Math.min(period, tr.length);
  for (let i = 0; i < tr.length; i++) {
    if (i < period) {
      atr.push(seed);
    } else {
      const prev = atr[i - 1];
      atr.push((prev * (period - 1) + tr[i]) / period);
    }
  }
  return atr;
}

function emaSlope(emaSeries: number[], lookback: number): number {
  if (emaSeries.length < lookback + 1) return 0;
  const recent = emaSeries[emaSeries.length - 1];
  const past = emaSeries[emaSeries.length - 1 - lookback];
  if (past === 0) return 0;
  return (recent - past) / past;
}

// ─── HTF Trend Filter ──────────────────────────────────────────

export interface HtfTrendResult {
  direction: 'LONG' | 'SHORT' | null;
  ema50: number;
  slope: number;
  priceAboveEma50: boolean;
}

/**
 * Check Higher-Timeframe (1H) trend alignment using 50 EMA position + slope.
 * Longs: price > EMA50(1H) AND EMA50 slope > 0
 * Shorts: price < EMA50(1H) AND EMA50 slope < 0
 */
export function checkHtfTrendFilter(
  htfCandles: any[],
  ema50Period: number = 50,
  slopeLookback: number = 10
): HtfTrendResult {
  if (!htfCandles || htfCandles.length < ema50Period + slopeLookback) {
    return { direction: null, ema50: 0, slope: 0, priceAboveEma50: false };
  }

  const closes = htfCandles.map((c: any) => c.close);
  const ema50Series = calcEma(closes, ema50Period);
  const lastIdx = ema50Series.length - 1;
  const ema50 = ema50Series[lastIdx];
  const slope = emaSlope(ema50Series, slopeLookback);
  const lastClose = closes[lastIdx];
  const priceAboveEma50 = lastClose > ema50;

  let direction: 'LONG' | 'SHORT' | null = null;
  if (priceAboveEma50 && slope > 0) {
    direction = 'LONG';
  } else if (!priceAboveEma50 && slope < 0) {
    direction = 'SHORT';
  }

  return { direction, ema50, slope, priceAboveEma50 };
}

// ─── Overextension Filter ──────────────────────────────────────

/**
 * Reject entry if price is too far from 21 EMA (overextended).
 * Condition: |close − EMA21| > maxDistAtr × ATR(14) → reject
 */
export function checkOverextension(
  close: number,
  ema21: number,
  atr: number,
  maxDistAtr: number = 1.0
): { isOverextended: boolean; distanceAtr: number } {
  if (atr <= 0) return { isOverextended: false, distanceAtr: 0 };
  const dist = Math.abs(close - ema21);
  const distanceAtr = dist / atr;
  return { isOverextended: distanceAtr > maxDistAtr, distanceAtr };
}

// ─── Pullback Detection ────────────────────────────────────────

export interface PullbackResult {
  isValid: boolean;
  bars: number;
  isVSpike: boolean;
  reason: string;
}

/**
 * Detect a structured pullback toward 5 EMA:
 * - At least minBars candles pulling toward 5 EMA
 * - Not a V-spike (check for range contraction / gradual movement)
 */
export function detectPullback(
  candles: any[],
  ema5Series: number[],
  direction: 'LONG' | 'SHORT',
  minBars: number = 3
): PullbackResult {
  if (candles.length < minBars || ema5Series.length < candles.length) {
    return { isValid: false, bars: 0, isVSpike: false, reason: 'Insufficient candle data' };
  }

  const lastIdx = candles.length - 1;
  // Count candles that are pulling back (moving toward 5 EMA)
  let pullbackBars = 0;
  let maxPullbackRange = 0;
  let totalPullbackRange = 0;

  for (let i = lastIdx; i >= Math.max(0, lastIdx - 15); i--) {
    const c = candles[i];
    const ema5 = ema5Series[i];
    const body = Math.abs(c.close - c.open);
    const range = c.high - c.low;

    if (direction === 'LONG') {
      // Pullback in an uptrend = candles moving DOWN toward EMA5
      // Price should be near or touching EMA5 from above/around
      const distToEma = Math.abs(c.close - ema5);
      const isApproachingEma = c.close <= ema5 * 1.003 || distToEma < range * 0.5;
      const isPullbackCandle = c.close < c.open || isApproachingEma;

      if (isPullbackCandle || isApproachingEma) {
        pullbackBars++;
        totalPullbackRange += range;
        maxPullbackRange = Math.max(maxPullbackRange, range);
      } else {
        break; // Pullback ended
      }
    } else {
      // Pullback in a downtrend = candles moving UP toward EMA5
      const distToEma = Math.abs(c.close - ema5);
      const isApproachingEma = c.close >= ema5 * 0.997 || distToEma < range * 0.5;
      const isPullbackCandle = c.close > c.open || isApproachingEma;

      if (isPullbackCandle || isApproachingEma) {
        pullbackBars++;
        totalPullbackRange += range;
        maxPullbackRange = Math.max(maxPullbackRange, range);
      } else {
        break;
      }
    }
  }

  if (pullbackBars < minBars) {
    return { isValid: false, bars: pullbackBars, isVSpike: false, reason: `Only ${pullbackBars} pullback bars (need ${minBars})` };
  }

  // V-spike detection: If the largest single bar accounts for > 60% of total pullback range,
  // it's a sharp spike, not a structured flag/wedge
  const avgRange = totalPullbackRange / pullbackBars;
  const isVSpike = pullbackBars >= 2 && maxPullbackRange > avgRange * 2.0;

  if (isVSpike) {
    return { isValid: false, bars: pullbackBars, isVSpike: true, reason: 'V-spike pullback (not structured flag/wedge)' };
  }

  return { isValid: true, bars: pullbackBars, isVSpike: false, reason: `${pullbackBars}-bar structured pullback` };
}

// ─── Gap Candle Detection ──────────────────────────────────────

export interface GapCandleResult {
  isValid: boolean;
  bodyPctBeyondEma: number;
  volumeRatio: number;
  reason: string;
}

/**
 * Validate the gap candle:
 * - Body closes mostly beyond 5 EMA (≥ minBodyPct outside)
 * - Volume ≥ volumeMult × 20-candle average
 * - Distance from close to EMA21 ≤ maxDistAtr × ATR
 */
export function detectGapCandle(
  candle: any,
  ema5: number,
  avgVol20: number,
  ema21: number,
  atr: number,
  direction: 'LONG' | 'SHORT',
  minBodyPct: number = 0.60,
  volumeMult: number = 1.5,
  maxDistAtr: number = 1.0
): GapCandleResult {
  const bodyHigh = Math.max(candle.open, candle.close);
  const bodyLow = Math.min(candle.open, candle.close);
  const bodySize = bodyHigh - bodyLow;

  if (bodySize <= 0) {
    return { isValid: false, bodyPctBeyondEma: 0, volumeRatio: 0, reason: 'Doji candle (no body)' };
  }

  // Check body is on the correct side of 5 EMA
  let bodyBeyondEma: number;
  if (direction === 'LONG') {
    // For long: body should be above EMA5
    if (candle.close <= candle.open) {
      return { isValid: false, bodyPctBeyondEma: 0, volumeRatio: 0, reason: 'Gap candle is bearish (need bullish for LONG)' };
    }
    bodyBeyondEma = Math.max(0, bodyHigh - Math.max(ema5, bodyLow)) / bodySize;
  } else {
    // For short: body should be below EMA5
    if (candle.close >= candle.open) {
      return { isValid: false, bodyPctBeyondEma: 0, volumeRatio: 0, reason: 'Gap candle is bullish (need bearish for SHORT)' };
    }
    bodyBeyondEma = Math.max(0, Math.min(ema5, bodyHigh) - bodyLow) / bodySize;
  }

  if (bodyBeyondEma < minBodyPct) {
    return {
      isValid: false,
      bodyPctBeyondEma: bodyBeyondEma,
      volumeRatio: (candle.volume || 0) / (avgVol20 || 1),
      reason: `Body only ${(bodyBeyondEma * 100).toFixed(0)}% beyond 5 EMA (need ${(minBodyPct * 100).toFixed(0)}%)`
    };
  }

  // Volume check
  const volumeRatio = (candle.volume || 0) / (avgVol20 || 1);
  if (volumeRatio < volumeMult) {
    return {
      isValid: false,
      bodyPctBeyondEma: bodyBeyondEma,
      volumeRatio,
      reason: `Volume ${volumeRatio.toFixed(2)}× (need ${volumeMult}×)`
    };
  }

  // Overextension check within gap candle evaluation
  const distToEma21 = Math.abs(candle.close - ema21);
  if (atr > 0 && distToEma21 / atr > maxDistAtr) {
    return {
      isValid: false,
      bodyPctBeyondEma: bodyBeyondEma,
      volumeRatio,
      reason: `Overextended: ${(distToEma21 / atr).toFixed(2)} ATR from EMA21 (max ${maxDistAtr})`
    };
  }

  return {
    isValid: true,
    bodyPctBeyondEma: bodyBeyondEma,
    volumeRatio,
    reason: `Valid gap candle: body ${(bodyBeyondEma * 100).toFixed(0)}% beyond EMA5, vol ${volumeRatio.toFixed(2)}×`
  };
}

// ─── Failed Breakout Filter ────────────────────────────────────

/**
 * If the candle AFTER the gap candle has a long wick that closes back inside
 * the 5 EMA zone, treat it as a failed breakout.
 */
export function detectFailedBreakout(
  nextCandle: any,
  ema5: number,
  direction: 'LONG' | 'SHORT',
  maxWickRatio: number = 0.50
): { isFailed: boolean; reason: string } {
  if (!nextCandle) return { isFailed: false, reason: 'No follow-through candle yet' };

  const range = nextCandle.high - nextCandle.low;
  if (range <= 0) return { isFailed: false, reason: 'No range' };

  const bodyTop = Math.max(nextCandle.open, nextCandle.close);
  const bodyBot = Math.min(nextCandle.open, nextCandle.close);

  if (direction === 'LONG') {
    // Failed long: next candle has upper wick and closes back below/at EMA5
    const upperWick = (nextCandle.high - bodyTop) / range;
    const closedBackInside = nextCandle.close <= ema5;
    if (closedBackInside && upperWick >= maxWickRatio) {
      return { isFailed: true, reason: `Failed breakout: closed back below EMA5 with ${(upperWick * 100).toFixed(0)}% upper wick` };
    }
  } else {
    // Failed short: next candle has lower wick and closes back above/at EMA5
    const lowerWick = (bodyBot - nextCandle.low) / range;
    const closedBackInside = nextCandle.close >= ema5;
    if (closedBackInside && lowerWick >= maxWickRatio) {
      return { isFailed: true, reason: `Failed breakout: closed back above EMA5 with ${(lowerWick * 100).toFixed(0)}% lower wick` };
    }
  }

  return { isFailed: false, reason: 'Follow-through holding' };
}

// ─── Stop Loss & Target Calculation ────────────────────────────

function findSwingLow(candles: any[], endIdx: number, lookback: number): number {
  let low = Infinity;
  for (let i = Math.max(0, endIdx - lookback); i <= endIdx; i++) {
    if (candles[i].low < low) low = candles[i].low;
  }
  return low;
}

function findSwingHigh(candles: any[], endIdx: number, lookback: number): number {
  let high = -Infinity;
  for (let i = Math.max(0, endIdx - lookback); i <= endIdx; i++) {
    if (candles[i].high > high) high = candles[i].high;
  }
  return high;
}

export function calculateLevels(
  direction: 'LONG' | 'SHORT',
  candles: any[],
  gapCandleIdx: number,
  ema5: number,
  atr: number,
  settings: EmaGapSettings
): { entry: number; sl: number; tp1: number; tp2: number; tp3: number; riskPerUnit: number } | null {
  const slLookback = settings.egpSlSwingLookback || 10;
  const slBuffer = (settings.egpSlAtrBuffer ?? 0.2) * atr;
  const tp1Mult = settings.egpTp1RMultiple || 1.0;
  const tp2Mult = settings.egpTp2RMultiple || 1.5;
  const tp3Mult = settings.egpTp3RMultiple || 2.5;

  const gapCandle = candles[gapCandleIdx];
  const gapMid = (Math.max(gapCandle.open, gapCandle.close) + Math.min(gapCandle.open, gapCandle.close)) / 2;

  if (direction === 'LONG') {
    // Entry: near 5 EMA or mid-point of gap candle body (whichever is higher for safety)
    const entry = Math.max(ema5, gapMid);

    // SL: below recent swing low − buffer
    const swingLow = findSwingLow(candles, gapCandleIdx, slLookback);
    const sl = swingLow - slBuffer;

    const risk = entry - sl;
    if (risk <= 0 || risk < atr * 0.15) return null; // Risk too small or negative

    const tp1 = entry + risk * tp1Mult;
    const tp2 = entry + risk * tp2Mult;
    const tp3 = entry + risk * tp3Mult;

    return { entry, sl, tp1, tp2, tp3, riskPerUnit: risk };
  } else {
    // Entry: near 5 EMA or mid-point of gap candle body (whichever is lower for safety)
    const entry = Math.min(ema5, gapMid);

    // SL: above recent swing high + buffer
    const swingHigh = findSwingHigh(candles, gapCandleIdx, slLookback);
    const sl = swingHigh + slBuffer;

    const risk = sl - entry;
    if (risk <= 0 || risk < atr * 0.15) return null; // Risk too small or negative

    const tp1 = Math.max(0.0001, entry - risk * tp1Mult);
    const tp2 = Math.max(0.0001, entry - risk * tp2Mult);
    const tp3 = Math.max(0.0001, entry - risk * tp3Mult);

    return { entry, sl, tp1, tp2, tp3, riskPerUnit: risk };
  }
}

// ─── Main Evaluation Function ──────────────────────────────────

/**
 * evaluateEmaGapPullback — Primary entry point for the 5 EMA Gap Pullback strategy.
 * Used by both the frontend scanner and the server-side AutoTrader.
 * 
 * @param entryCandles - Candle array for the entry timeframe (e.g. 5m, 15m)
 * @param htfCandles - Candle array for 1H timeframe (HTF trend filter)
 * @param currentPrice - Current live price
 * @param settings - Strategy configuration parameters
 */
export function evaluateEmaGapPullback(
  entryCandles: any[],
  htfCandles: any[],
  currentPrice: number,
  settings: EmaGapSettings = {}
): EmaGapSignal | null {
  const ema5Period = settings.egpEma5Period || 5;
  const ema21Period = settings.egpEma21Period || 21;
  const htfEma50Period = settings.egpHtfEma50Period || 50;
  const htfSlopeLookback = settings.egpHtfSlopeLookback || 10;
  const minPullbackBars = settings.egpMinPullbackBars || 3;
  const minGapBodyPct = settings.egpMinGapBodyPct || 0.60;
  const volumeMult = settings.egpVolumeMultiplier || 1.5;
  const maxDistAtr = settings.egpMaxDistToEma21Atr || 1.0;
  const atrPeriod = settings.egpAtrPeriod || 14;
  const maxWickRatio = settings.egpMaxWickRatioForFail || 0.50;

  // Minimum data requirements
  if (!entryCandles || entryCandles.length < Math.max(50, ema21Period + 10)) {
    return null;
  }

  // ── Step 1: HTF Trend Filter ──
  const htfTrend = checkHtfTrendFilter(htfCandles, htfEma50Period, htfSlopeLookback);
  if (!htfTrend.direction) {
    return null; // No clear HTF trend — stand aside
  }
  const direction = htfTrend.direction;

  // ── Step 2: Compute entry-TF indicators ──
  const closes = entryCandles.map((c: any) => c.close);
  const ema5Series = calcEma(closes, ema5Period);
  const ema21Series = calcEma(closes, ema21Period);
  const atrSeries = calcAtr(entryCandles, atrPeriod);
  const lastIdx = entryCandles.length - 1;
  const ema5 = ema5Series[lastIdx];
  const ema21 = ema21Series[lastIdx];
  const atr = atrSeries[lastIdx] || currentPrice * 0.01;

  // ── Step 3: Overextension Guard ──
  const overext = checkOverextension(currentPrice, ema21, atr, maxDistAtr);
  if (overext.isOverextended) {
    return null; // Price too far from EMA21 — overextended move
  }

  // ── Step 4: Volume baseline ──
  const volSlice = entryCandles.slice(Math.max(0, lastIdx - 20), lastIdx);
  const avgVol20 = volSlice.reduce((s: number, c: any) => s + (c.volume || 0), 0) / (volSlice.length || 1);

  // ── Step 5: Scan for gap candle + pullback structure ──
  // The "gap candle" is the most recent closed candle (lastIdx if we use closed candles,
  // or lastIdx - 1 if we want to check for failed breakout on the current bar)
  // We check both the last closed bar and the second-to-last as potential gap candles

  for (let gapIdx = lastIdx; gapIdx >= lastIdx - 1; gapIdx--) {
    if (gapIdx < minPullbackBars + 2) continue;

    const gapCandle = entryCandles[gapIdx];
    const ema5AtGap = ema5Series[gapIdx];
    const ema21AtGap = ema21Series[gapIdx];
    const atrAtGap = atrSeries[gapIdx] || atr;

    // Gap candle quality check
    const gapResult = detectGapCandle(
      gapCandle, ema5AtGap, avgVol20, ema21AtGap, atrAtGap,
      direction, minGapBodyPct, volumeMult, maxDistAtr
    );
    if (!gapResult.isValid) continue;

    // Pullback structure check (candles before the gap candle)
    const pullbackCandles = entryCandles.slice(0, gapIdx);
    const pullbackEma5 = ema5Series.slice(0, gapIdx);
    const pullback = detectPullback(pullbackCandles, pullbackEma5, direction, minPullbackBars);
    if (!pullback.isValid) continue;

    // Failed breakout check (if gap candle is not the very last bar, check follow-through)
    if (gapIdx < lastIdx) {
      const nextCandle = entryCandles[gapIdx + 1];
      const ema5AtNext = ema5Series[gapIdx + 1];
      const failResult = detectFailedBreakout(nextCandle, ema5AtNext, direction, maxWickRatio);
      if (failResult.isFailed) continue;
    }

    // ── Step 6: Calculate entry levels ──
    const levels = calculateLevels(direction, entryCandles, gapIdx, ema5AtGap, atrAtGap, settings);
    if (!levels) continue;

    // ── Step 7: Score the setup ──
    let score = 70; // Base score for a valid setup

    // HTF trend strength bonus (+5 for strong slope)
    if (Math.abs(htfTrend.slope) > 0.005) score += 5;

    // Volume surge bonus (up to +10)
    score += Math.min(10, Math.floor((gapResult.volumeRatio - 1.5) * 10));

    // Pullback structure quality bonus (+5 for 4+ bars, +10 for 5+ bars)
    if (pullback.bars >= 5) score += 10;
    else if (pullback.bars >= 4) score += 5;

    // Proximity to EMA21 bonus (closer = better mean value entry)
    const dist21 = overext.distanceAtr;
    if (dist21 < 0.5) score += 5;

    // Gap candle body quality bonus
    if (gapResult.bodyPctBeyondEma > 0.80) score += 5;

    score = Math.min(100, Math.max(60, score));

    return {
      status: 'confirmed',
      direction,
      entry: levels.entry,
      stop: levels.sl,
      tp1: levels.tp1,
      tp2: levels.tp2,
      tp3: levels.tp3,
      score,
      atr: atrAtGap,
      ema5: ema5AtGap,
      ema21: ema21AtGap,
      ema50Htf: htfTrend.ema50,
      pullbackBars: pullback.bars,
      volumeRatio: gapResult.volumeRatio,
      distToEma21Atr: overext.distanceAtr,
      gapCandleBodyPct: gapResult.bodyPctBeyondEma,
      signalTime: gapCandle.time || gapCandle.openTime || Date.now(),
      reason: `5 EMA Gap ${direction} — ${pullback.bars}-bar pullback, vol ${gapResult.volumeRatio.toFixed(1)}×, HTF trend aligned`,
      riskPerUnit: levels.riskPerUnit,
    };
  }

  // ── Check for forming pullback (watchlist) ──
  const pullbackCheck = detectPullback(
    entryCandles.slice(0, lastIdx),
    ema5Series.slice(0, lastIdx),
    direction,
    minPullbackBars
  );

  if (pullbackCheck.isValid) {
    return {
      status: 'pullback_forming',
      direction,
      ema5,
      ema21,
      ema50Htf: htfTrend.ema50,
      pullbackBars: pullbackCheck.bars,
      atr,
      reason: `Pullback forming (${pullbackCheck.bars} bars) — awaiting gap candle`,
    };
  }

  return null;
}

// ─── Frontend Scanner Wrapper ──────────────────────────────────

/**
 * findEmaGapSetup — Frontend-compatible wrapper for the scanner loop in App.tsx.
 * Drop-in replacement for the old `findCRSetup`.
 */
export function findEmaGapSetup(
  entryCandles: any[],
  htfCandles: any[],
  settings: any
): EmaGapSignal | null {
  if (!entryCandles || entryCandles.length < 30) return null;
  const currentPrice = entryCandles[entryCandles.length - 1].close;
  return evaluateEmaGapPullback(entryCandles, htfCandles, currentPrice, settings);
}
