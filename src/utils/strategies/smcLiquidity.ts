/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { calculateATR } from '../indicators.js';
import { allowSMCLiquidity, extractSmcRegimeMetrics, type SmcRegimeMetrics } from './strategyRegimeFilters.js';
export { allowSMCLiquidity, extractSmcRegimeMetrics };
export type { SmcRegimeMetrics };

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export type HtfRegime = 'BULLISH' | 'BEARISH' | 'CHOP';

export interface PivotPoint {
  index: number;
  price: number;
  time: number;
  type: 'HIGH' | 'LOW';
}

export interface LiquiditySweepResult {
  isSweep: boolean;
  direction: 'LONG' | 'SHORT' | null;
  sweepCandleIndex: number;
  sweepPrice: number;
  sweptLevel: number;
  wickRatio: number;
  extensionPct: number;
  reason: string;
}

export interface MssResult {
  hasMss: boolean;
  direction: 'LONG' | 'SHORT' | null;
  mssCandleIndex: number;
  brokenLevel: number;
  displacementAtr: number;
  volumeRatio: number;
  reason: string;
}

export interface FvgZone {
  top: number;
  bottom: number;
  midpoint: number; // Consequent encroachment (50%)
  candleIndex: number;
  direction: 'LONG' | 'SHORT';
}

export interface OrderBlockZone {
  top: number;
  bottom: number;
  midpoint: number;
  candleIndex: number;
  direction: 'LONG' | 'SHORT';
}

export interface SmcSignal {
  direction: 'LONG' | 'SHORT';
  score: number;
  sl: number;
  tp1: number;
  tp2: number;
  tp3?: number;
  entryZoneMin: number;
  entryZoneMax: number;
  entryPrice: number;
  reason: string;
  signalTime: number;
  fvgTop: number;
  fvgBottom: number;
  obTop: number;
  obBottom: number;
  htfRegime: HtfRegime;
  risk: number;
  rrRatio: number;
  confluence: boolean;
  inKillZone: boolean;
  webhookPayload?: string;
  details?: {
    sweptLevel: number;
    sweepPrice: number;
    brokenStructureLevel: number;
    displacementAtr: number;
    volumeRatio: number;
  };
}

export interface SmcOptions {
  htfResolution?: string;       // e.g. '1h', '4h', 'D'
  structureLen?: number;        // Swing pivot length on execution TF (default 10)
  htfPivotLen?: number;         // Pivot length on HTF (default 10)
  wickRatio?: number;           // Min wick-to-body ratio for sweeps (default 0.6)
  minSweepWickPct?: number;     // Min wick extension % beyond level (default 0.0015 = 0.15%)
  dispAtrMult?: number;         // Displacement threshold in ATR (default 0.5)
  atrLen?: number;              // ATR calculation period (default 14)
  sweepConfirmWindow?: number;  // Max bars between sweep and MSS (default 10)
  volAvgLen?: number;           // Volume moving average period (default 20)
  volMult?: number;             // Volume multiplier on MSS (default 1.5)
  fvgAfterMssWindow?: number;   // Max bars between MSS and FVG (default 5)
  obLookback?: number;          // Max lookback for OB identification (default 30)
  useKillZone?: boolean;        // Whether to restrict trades strictly to kill zones (default false)
  atrStopMult?: number;         // ATR multiplier for base stop-loss (default 1.5)
  rrRatio?: number;             // Target Risk:Reward ratio for TP2 (default 3.0)
  strictHtfRegime?: boolean;    // If true, disallow trades during CHOP (default false)
  enforceRegimeFilter?: boolean; // If true, requires dedicated allowSMCLiquidity regime filter check
  symbol?: string;              // Ticker symbol for webhook generation (default 'BTCUSDT')
}

// ---------------------------------------------------------------------------
// 1. PIVOTS & HIGHER-TIMEFRAME REGIME FILTER
// ---------------------------------------------------------------------------

/**
 * Finds confirmed pivot highs and pivot lows using an N-bar left and right window.
 */
export function findPivots(candles: Candle[], leftBars = 10, rightBars = 10): { highs: PivotPoint[]; lows: PivotPoint[] } {
  const highs: PivotPoint[] = [];
  const lows: PivotPoint[] = [];

  if (!candles || candles.length < leftBars + rightBars + 1) {
    return { highs, lows };
  }

  for (let i = leftBars; i < candles.length - rightBars; i++) {
    const curH = candles[i].high;
    const curL = candles[i].low;
    let isH = true;
    let isL = true;

    for (let j = i - leftBars; j <= i + rightBars; j++) {
      if (i === j) continue;
      if (candles[j].high >= curH) isH = false;
      if (candles[j].low <= curL) isL = false;
    }

    if (isH) highs.push({ index: i, price: curH, time: candles[i].time, type: 'HIGH' });
    if (isL) lows.push({ index: i, price: curL, time: candles[i].time, type: 'LOW' });
  }

  return { highs, lows };
}

/**
 * Classifies HTF trend:
 * - Bullish: Last two confirmed swing highs form HH (High2 > High1) and last two swing lows form HL (Low2 > Low1).
 * - Bearish: Last two confirmed swing highs form LH (High2 < High1) and last two swing lows form LL (Low2 < Low1).
 * - Choppy/Unclear: Otherwise.
 */
export function detectHtfRegime(htfCandles: Candle[], pivotLen = 10): { regime: HtfRegime; reason: string } {
  if (!htfCandles || htfCandles.length < pivotLen * 2 + 5) {
    return { regime: 'CHOP', reason: 'Insufficient HTF data for pivot classification' };
  }

  const { highs, lows } = findPivots(htfCandles, pivotLen, pivotLen);

  if (highs.length < 2 || lows.length < 2) {
    // Fallback: check 50-SMA slope if not enough fractal pivots
    const closes = htfCandles.map(c => c.close);
    const lastClose = closes[closes.length - 1];
    const prevClose = closes[Math.max(0, closes.length - 15)];
    if (lastClose > prevClose * 1.015) return { regime: 'BULLISH', reason: 'HTF ascending momentum' };
    if (lastClose < prevClose * 0.985) return { regime: 'BEARISH', reason: 'HTF descending momentum' };
    return { regime: 'CHOP', reason: 'Insufficient confirmed pivots on HTF' };
  }

  const h1 = highs[highs.length - 2].price;
  const h2 = highs[highs.length - 1].price;
  const l1 = lows[lows.length - 2].price;
  const l2 = lows[lows.length - 1].price;

  const isHH = h2 > h1;
  const isHL = l2 > l1;
  const isLH = h2 < h1;
  const isLL = l2 < l1;

  if (isHH && isHL) {
    return { regime: 'BULLISH', reason: `Bullish HTF: Confirmed HH ($${h2.toFixed(2)} > $${h1.toFixed(2)}) & HL ($${l2.toFixed(2)} > $${l1.toFixed(2)})` };
  }
  if (isLH && isLL) {
    return { regime: 'BEARISH', reason: `Bearish HTF: Confirmed LH ($${h2.toFixed(2)} < $${h1.toFixed(2)}) & LL ($${l2.toFixed(2)} < $${l1.toFixed(2)})` };
  }

  return { regime: 'CHOP', reason: `Choppy HTF: Mixed market structure (H2/H1: ${h2 > h1 ? 'HH' : 'LH'}, L2/L1: ${l2 > l1 ? 'HL' : 'LL'})` };
}

// ---------------------------------------------------------------------------
// 2. LIQUIDITY SWEEP DETECTION
// ---------------------------------------------------------------------------

/**
 * Detects institutional liquidity sweep at candle:
 * - Sharp wick beyond recent swing level (liqHigh / liqLow)
 * - Candle closes back inside the prior range
 * - Wick-to-body ratio >= wickRatio (default 0.6)
 * - Extension beyond level >= minSweepWickPct (default 0.15%)
 */
export function detectLiquiditySweep(
  candle: Candle,
  candleIndex: number,
  liqHigh?: number,
  liqLow?: number,
  options: { wickRatio?: number; minSweepWickPct?: number } = {}
): LiquiditySweepResult {
  const wickRatio = options.wickRatio ?? 0.6;
  const minSweepWickPct = options.minSweepWickPct ?? 0.0015;

  const bodySize = Math.abs(candle.close - candle.open);
  const upperWick = candle.high - Math.max(candle.close, candle.open);
  const lowerWick = Math.min(candle.close, candle.open) - candle.low;

  // Bullish Sweep: Price sweeps below liqLow, but closes back above
  if (liqLow !== undefined && liqLow > 0) {
    const sweptBelow = candle.low < liqLow;
    const closedInside = candle.close > liqLow;
    const lowerWickConfirmed = lowerWick >= (bodySize * wickRatio);
    const extension = liqLow - candle.low;
    const extensionPct = extension / (candle.close || 1);
    const materialExtension = extensionPct >= minSweepWickPct;

    if (sweptBelow && closedInside && lowerWickConfirmed && materialExtension) {
      return {
        isSweep: true,
        direction: 'LONG',
        sweepCandleIndex: candleIndex,
        sweepPrice: candle.low,
        sweptLevel: liqLow,
        wickRatio: bodySize > 0 ? lowerWick / bodySize : 1.0,
        extensionPct,
        reason: `Bullish liquidity sweep below $${liqLow.toFixed(2)} with ${(extensionPct * 100).toFixed(2)}% extension & rejection wick`
      };
    }
  }

  // Bearish Sweep: Price sweeps above liqHigh, but closes back below
  if (liqHigh !== undefined && liqHigh > 0) {
    const sweptAbove = candle.high > liqHigh;
    const closedInside = candle.close < liqHigh;
    const upperWickConfirmed = upperWick >= (bodySize * wickRatio);
    const extension = candle.high - liqHigh;
    const extensionPct = extension / (candle.close || 1);
    const materialExtension = extensionPct >= minSweepWickPct;

    if (sweptAbove && closedInside && upperWickConfirmed && materialExtension) {
      return {
        isSweep: true,
        direction: 'SHORT',
        sweepCandleIndex: candleIndex,
        sweepPrice: candle.high,
        sweptLevel: liqHigh,
        wickRatio: bodySize > 0 ? upperWick / bodySize : 1.0,
        extensionPct,
        reason: `Bearish liquidity sweep above $${liqHigh.toFixed(2)} with ${(extensionPct * 100).toFixed(2)}% extension & rejection wick`
      };
    }
  }

  return {
    isSweep: false,
    direction: null,
    sweepCandleIndex: candleIndex,
    sweepPrice: 0,
    sweptLevel: 0,
    wickRatio: 0,
    extensionPct: 0,
    reason: 'No sweep detected'
  };
}

// ---------------------------------------------------------------------------
// 3. MARKET STRUCTURE SHIFT (MSS / CHoCH) WITH DISPLACEMENT
// ---------------------------------------------------------------------------

/**
 * Checks for Market Structure Shift (MSS) with displacement following a sweep:
 * - Close beyond prior structure boundary
 * - Displacement >= dispAtrMult * ATR
 * - Occurs within sweepConfirmWindow bars of the sweep
 * - Volume >= volMult * 20-SMA volume
 */
export function detectMssDisplacement(
  candles: Candle[],
  currentIndex: number,
  sweepIndex: number,
  direction: 'LONG' | 'SHORT',
  atr: number,
  options: {
    structureLen?: number;
    dispAtrMult?: number;
    sweepConfirmWindow?: number;
    volAvgLen?: number;
    volMult?: number;
  } = {}
): MssResult {
  const structureLen = options.structureLen ?? 10;
  const dispAtrMult = options.dispAtrMult ?? 0.5;
  const sweepConfirmWindow = options.sweepConfirmWindow ?? 10;
  const volAvgLen = options.volAvgLen ?? 20;
  const volMult = options.volMult ?? 1.5;

  const barsSinceSweep = currentIndex - sweepIndex;
  if (barsSinceSweep <= 0 || barsSinceSweep > sweepConfirmWindow) {
    return {
      hasMss: false,
      direction: null,
      mssCandleIndex: currentIndex,
      brokenLevel: 0,
      displacementAtr: 0,
      volumeRatio: 0,
      reason: `Outside sweep confirmation window (${barsSinceSweep} bars > max ${sweepConfirmWindow})`
    };
  }

  const currentCandle = candles[currentIndex];
  const preLegCandles = candles.slice(Math.max(0, sweepIndex - structureLen), sweepIndex + 1);

  // Volume Confirmation
  const volSlice = candles.slice(Math.max(0, currentIndex - volAvgLen), currentIndex);
  const volAvg = volSlice.length > 0 ? volSlice.reduce((sum, c) => sum + (c.volume || 0), 0) / volSlice.length : (currentCandle.volume || 1);
  const volumeRatio = volAvg > 0 ? (currentCandle.volume || volAvg) / volAvg : 1.0;
  const hasVolume = volumeRatio >= volMult || (currentCandle.volume === undefined); // allow fallback if volume not delivered

  if (direction === 'LONG') {
    // Structure high to break is the highest high leading up to the sweep
    const structHigh = Math.max(...preLegCandles.map(c => c.high));
    const breaksStructure = currentCandle.close > structHigh;
    const displacement = currentCandle.close - structHigh;
    const displacementAtr = atr > 0 ? displacement / atr : 0;
    const hasDisplacement = displacementAtr >= dispAtrMult;

    if (breaksStructure && hasDisplacement && hasVolume) {
      return {
        hasMss: true,
        direction: 'LONG',
        mssCandleIndex: currentIndex,
        brokenLevel: structHigh,
        displacementAtr,
        volumeRatio,
        reason: `Bullish MSS confirmed: close broke $${structHigh.toFixed(2)} with ${displacementAtr.toFixed(2)}x ATR displacement & ${volumeRatio.toFixed(1)}x volume`
      };
    }
  } else {
    // Structure low to break is the lowest low leading up to the sweep
    const structLow = Math.min(...preLegCandles.map(c => c.low));
    const breaksStructure = currentCandle.close < structLow;
    const displacement = structLow - currentCandle.close;
    const displacementAtr = atr > 0 ? displacement / atr : 0;
    const hasDisplacement = displacementAtr >= dispAtrMult;

    if (breaksStructure && hasDisplacement && hasVolume) {
      return {
        hasMss: true,
        direction: 'SHORT',
        mssCandleIndex: currentIndex,
        brokenLevel: structLow,
        displacementAtr,
        volumeRatio,
        reason: `Bearish MSS confirmed: close broke $${structLow.toFixed(2)} with ${displacementAtr.toFixed(2)}x ATR displacement & ${volumeRatio.toFixed(1)}x volume`
      };
    }
  }

  return {
    hasMss: false,
    direction: null,
    mssCandleIndex: currentIndex,
    brokenLevel: 0,
    displacementAtr: 0,
    volumeRatio,
    reason: 'MSS criteria not satisfied'
  };
}

// ---------------------------------------------------------------------------
// 4. FAIR VALUE GAP (FVG) DETECTION
// ---------------------------------------------------------------------------

/**
 * Detects 3-candle imbalance (FVG) formed during the displacement move:
 * - Bullish FVG: high[2] < low[0] -> Gap between candle 2's high and candle 0's low
 * - Bearish FVG: low[2] > high[0] -> Gap between candle 2's low and candle 0's high
 * Must form within fvgAfterMssWindow bars of the MSS.
 */
export function detectFvg(
  candles: Candle[],
  mssIndex: number,
  direction: 'LONG' | 'SHORT',
  fvgAfterMssWindow = 5
): FvgZone | null {
  const endIndex = Math.min(candles.length - 1, mssIndex + fvgAfterMssWindow);
  const startIndex = Math.max(2, mssIndex - 2);

  // Scan backwards from latest candle to find the most recent valid FVG
  for (let i = endIndex; i >= startIndex; i--) {
    const c0 = candles[i];
    const c2 = candles[i - 2];

    if (direction === 'LONG') {
      // Bullish: c2.high < c0.low
      if (c2.high < c0.low) {
        const top = c0.low;
        const bottom = c2.high;
        const midpoint = (top + bottom) / 2;
        return { top, bottom, midpoint, candleIndex: i, direction: 'LONG' };
      }
    } else {
      // Bearish: c2.low > c0.high
      if (c2.low > c0.high) {
        const top = c2.low;
        const bottom = c0.high;
        const midpoint = (top + bottom) / 2;
        return { top, bottom, midpoint, candleIndex: i, direction: 'SHORT' };
      }
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// 5. ORDER BLOCK (OB) APPROXIMATION
// ---------------------------------------------------------------------------

/**
 * Identifies the displacement-initiating candle's range as the Order Block zone:
 * - Bullish OB: First strong up candle in MSS leg where (close - open) > atr * 0.8
 * - Bearish OB: First strong down candle in MSS leg where (open - close) > atr * 0.8
 * Returns OB zone [min(open, close), max(open, close)]
 */
export function detectOrderBlock(
  candles: Candle[],
  sweepIndex: number,
  mssIndex: number,
  direction: 'LONG' | 'SHORT',
  atr: number
): OrderBlockZone | null {
  const minBodyAtr = atr * 0.75;

  if (direction === 'LONG') {
    for (let i = sweepIndex; i <= mssIndex; i++) {
      const c = candles[i];
      const body = c.close - c.open;
      if (body >= minBodyAtr) {
        const top = Math.max(c.open, c.close);
        const bottom = Math.min(c.open, c.close);
        return { top, bottom, midpoint: (top + bottom) / 2, candleIndex: i, direction: 'LONG' };
      }
    }
    // Fallback: use candle right before MSS
    const c = candles[Math.max(0, mssIndex - 1)];
    return { top: Math.max(c.open, c.close), bottom: Math.min(c.open, c.close), midpoint: (c.open + c.close) / 2, candleIndex: mssIndex - 1, direction: 'LONG' };
  } else {
    for (let i = sweepIndex; i <= mssIndex; i++) {
      const c = candles[i];
      const body = c.open - c.close;
      if (body >= minBodyAtr) {
        const top = Math.max(c.open, c.close);
        const bottom = Math.min(c.open, c.close);
        return { top, bottom, midpoint: (top + bottom) / 2, candleIndex: i, direction: 'SHORT' };
      }
    }
    // Fallback: use candle right before MSS
    const c = candles[Math.max(0, mssIndex - 1)];
    return { top: Math.max(c.open, c.close), bottom: Math.min(c.open, c.close), midpoint: (c.open + c.close) / 2, candleIndex: mssIndex - 1, direction: 'SHORT' };
  }
}

// ---------------------------------------------------------------------------
// 6. CONFLUENCE: FVG + ORDER BLOCK OVERLAP
// ---------------------------------------------------------------------------

/**
 * Validates that the FVG zone and Order Block zone overlap:
 * - Bullish: bullFVGTop >= obBullBottom && bullFVGBottom <= obBullTop
 * - Bearish: bearFVGTop >= obBearBottom && bearFVGBottom <= obBearTop
 */
export function checkConfluence(fvg: FvgZone, ob: OrderBlockZone): boolean {
  // Overlap condition between two intervals [A_low, A_high] and [B_low, B_high]:
  // A_high >= B_low && A_low <= B_high
  return fvg.top >= ob.bottom && fvg.bottom <= ob.top;
}

// ---------------------------------------------------------------------------
// 7. SESSION / KILL-ZONE FILTER
// ---------------------------------------------------------------------------

/**
 * Checks if timestamp falls inside high-liquidity sessions:
 * - London Open: ~07:00 - 10:00 UTC
 * - New York Open: ~12:00 - 15:00 UTC
 */
export function isInKillZone(timestamp: number): boolean {
  const d = new Date(timestamp > 1e11 ? timestamp : timestamp * 1000);
  const h = d.getUTCHours();
  const m = d.getUTCMinutes();
  const time = h + m / 60;

  // London: 07:00 - 10:00 UTC
  if (time >= 7.0 && time <= 10.0) return true;
  // NY: 12:00 - 15:00 UTC
  if (time >= 12.0 && time <= 15.0) return true;

  return false;
}

// ---------------------------------------------------------------------------
// 8. ENTRY, STOP-LOSS & TAKE-PROFIT CALCULATION
// ---------------------------------------------------------------------------

/**
 * Computes entry at FVG midpoint (consequent encroachment),
 * structural stop loss anchored beyond sweep extreme with safety buffer,
 * and 1:3 R:R take profits.
 */
export function calculateSmcLevels(
  direction: 'LONG' | 'SHORT',
  fvg: FvgZone,
  sweepPrice: number,
  atr: number,
  options: { atrStopMult?: number; rrRatio?: number } = {}
): { entryPrice: number; sl: number; tp1: number; tp2: number; tp3: number; risk: number; rrRatio: number } {
  const atrStopMult = options.atrStopMult ?? 1.5;
  const rrRatio = options.rrRatio ?? 3.0;

  // Entry at FVG midpoint (Consequent Encroachment)
  const entryPrice = fvg.midpoint;

  let sl = 0;
  if (direction === 'LONG') {
    const baseStop = entryPrice - (atr * atrStopMult);
    const structuralStop = sweepPrice * 0.9995; // 0.05% safety buffer under sweep low
    sl = Math.min(baseStop, structuralStop);
    // Ensure SL is strictly below entry
    if (sl >= entryPrice) sl = entryPrice * 0.995;
  } else {
    const baseStop = entryPrice + (atr * atrStopMult);
    const structuralStop = sweepPrice * 1.0005; // 0.05% safety buffer above sweep high
    sl = Math.max(baseStop, structuralStop);
    // Ensure SL is strictly above entry
    if (sl <= entryPrice) sl = entryPrice * 1.005;
  }

  const risk = Math.abs(entryPrice - sl);
  const tp1 = direction === 'LONG' ? entryPrice + (risk * 1.5) : entryPrice - (risk * 1.5);
  const tp2 = direction === 'LONG' ? entryPrice + (risk * rrRatio) : entryPrice - (risk * rrRatio);
  const tp3 = direction === 'LONG' ? entryPrice + (risk * 5.0) : entryPrice - (risk * 5.0);

  return {
    entryPrice: parseFloat(entryPrice.toFixed(4)),
    sl: parseFloat(sl.toFixed(4)),
    tp1: parseFloat(tp1.toFixed(4)),
    tp2: parseFloat(tp2.toFixed(4)),
    tp3: parseFloat(tp3.toFixed(4)),
    risk: parseFloat(risk.toFixed(4)),
    rrRatio
  };
}

// ---------------------------------------------------------------------------
// 9. WEBHOOK ALERT PAYLOAD GENERATOR
// ---------------------------------------------------------------------------

/**
 * Generates machine-readable JSON alert payload for TradingView alerts / bridge execution.
 */
export function generateSmcWebhookPayload(
  symbol: string,
  direction: 'LONG' | 'SHORT',
  entryPrice: number,
  sl: number,
  tp: number,
  qtyValue = 2
): string {
  return JSON.stringify({
    action: direction === 'LONG' ? 'buy' : 'sell',
    symbol,
    type: 'limit',
    price: entryPrice,
    sl,
    tp,
    qty_type: 'equity_pct',
    qty_value: qtyValue,
    comment: direction === 'LONG' ? 'SMC_Long_FVG_OB' : 'SMC_Short_FVG_OB'
  });
}

// ---------------------------------------------------------------------------
// 10. MAIN STRATEGY EVALUATOR: evaluateSmc
// ---------------------------------------------------------------------------

/**
 * Institutional SMC High-Probability Strategy Evaluator:
 * 1. HTF Regime Filter (HH/HL Bullish, LH/LL Bearish, Chop)
 * 2. Liquidity Sweep Detection (wick ratio >= 0.6, extension >= 0.15%, close back inside)
 * 3. Market Structure Shift (MSS/CHoCH) with Displacement (>= 0.5 ATR, volume surge)
 * 4. Fair Value Gap (FVG) Detection within window
 * 5. Order Block (OB) Detection in displacement leg
 * 6. Confluence: FVG + OB Overlap
 * 7. Session / Kill-Zone Filter
 * 8. Consequent Encroachment Entry & 1:3 R:R Risk Management
 */
export function evaluateSmc(
  klines: Candle[],
  htfCandles: Candle[] | null | undefined,
  currentPrice: number,
  options: SmcOptions = {}
): SmcSignal | null {
  if (!klines || klines.length < 35) return null;

  const closedKlines = klines.slice(0, -1);
  if (closedKlines.length < 30) return null;

  const structureLen = options.structureLen ?? 10;
  const sweepConfirmWindow = options.sweepConfirmWindow ?? 10;
  const fvgAfterMssWindow = options.fvgAfterMssWindow ?? 5;
  const symbol = options.symbol || 'BTCUSDT';

  // 1. HTF REGIME FILTER
  let htfRegime: HtfRegime = 'CHOP';
  if (htfCandles && htfCandles.length >= 25) {
    const htfCheck = detectHtfRegime(htfCandles, options.htfPivotLen ?? 10);
    htfRegime = htfCheck.regime;
  } else {
    // If HTF candles omitted, derive from longer lookback on current execution candles
    const { highs, lows } = findPivots(closedKlines, 15, 15);
    if (highs.length >= 2 && lows.length >= 2) {
      const isHH = highs[highs.length - 1].price > highs[highs.length - 2].price;
      const isHL = lows[lows.length - 1].price > lows[lows.length - 2].price;
      const isLH = highs[highs.length - 1].price < highs[highs.length - 2].price;
      const isLL = lows[lows.length - 1].price < lows[lows.length - 2].price;
      if (isHH && isHL) htfRegime = 'BULLISH';
      else if (isLH && isLL) htfRegime = 'BEARISH';
    }
  }

  // Gating based on HTF Regime:
  // Long allowed only if regimeBear == false; Short allowed only if regimeBull == false.
  if (options.strictHtfRegime && htfRegime === 'CHOP') {
    return null;
  }

  const closes = closedKlines.map(c => c.close);
  const highs = closedKlines.map(c => c.high);
  const lows = closedKlines.map(c => c.low);
  const atrs = calculateATR(highs, lows, closes, options.atrLen ?? 14);
  const atr = atrs[atrs.length - 1] || (currentPrice * 0.01);

  // Find recent pivots for liquidity levels
  const { highs: swingHighs, lows: swingLows } = findPivots(closedKlines, structureLen, structureLen);

  const mssIndex = closedKlines.length - 1;
  const lastCandle = closedKlines[mssIndex];

  // 7. SESSION KILL ZONE FILTER
  const inKillZone = isInKillZone(lastCandle.time);
  if (options.useKillZone && !inKillZone) {
    return null;
  }

  // --- CHECK BULLISH SETUP (LONG) ---
  if (htfRegime !== 'BEARISH') {
    // Look for recent swing low that was swept
    const recentSwingLows = swingLows.filter(l => l.index < mssIndex - 1);
    for (let li = recentSwingLows.length - 1; li >= Math.max(0, recentSwingLows.length - 3); li--) {
      const liqLow = recentSwingLows[li].price;

      // Scan for liquidity sweep within sweepConfirmWindow bars of current candle
      for (let s = Math.max(recentSwingLows[li].index + 1, mssIndex - sweepConfirmWindow); s < mssIndex; s++) {
        const sweepCandle = closedKlines[s];
        const sweepResult = detectLiquiditySweep(sweepCandle, s, undefined, liqLow, {
          wickRatio: options.wickRatio,
          minSweepWickPct: options.minSweepWickPct
        });

        if (sweepResult.isSweep && sweepResult.direction === 'LONG') {
          // 3. Check MSS with displacement
          const mssResult = detectMssDisplacement(closedKlines, mssIndex, s, 'LONG', atr, {
            structureLen,
            dispAtrMult: options.dispAtrMult,
            sweepConfirmWindow,
            volAvgLen: options.volAvgLen,
            volMult: options.volMult
          });

          if (mssResult.hasMss) {
            // 4. Check FVG
            const fvg = detectFvg(closedKlines, mssIndex, 'LONG', fvgAfterMssWindow);
            if (fvg) {
              // 5. Check Order Block
              const ob = detectOrderBlock(closedKlines, s, mssIndex, 'LONG', atr);
              if (ob) {
                // 6. Confluence: FVG + OB Overlap
                const hasConfluence = checkConfluence(fvg, ob);
                if (hasConfluence) {
                  // 8. Calculate Entry & 1:3 R:R Levels
                  const levels = calculateSmcLevels('LONG', fvg, sweepResult.sweepPrice, atr, {
                    atrStopMult: options.atrStopMult,
                    rrRatio: options.rrRatio
                  });

                  // Score calculation based on institutional criteria
                  let score = 85;
                  if (htfRegime === 'BULLISH') score += 10;
                  if (inKillZone) score += 5;
                  if (mssResult.volumeRatio >= 1.8) score += 5;

                  const webhookPayload = generateSmcWebhookPayload(
                    symbol,
                    'LONG',
                    levels.entryPrice,
                    levels.sl,
                    levels.tp2
                  );

                  if (options.enforceRegimeFilter) {
                    const smcMetrics = extractSmcRegimeMetrics(closedKlines, htfCandles);
                    if (!allowSMCLiquidity(smcMetrics, 'LONG')) {
                      continue;
                    }
                  }

                  return {
                    direction: 'LONG',
                    score: Math.min(100, score),
                    sl: levels.sl,
                    tp1: levels.tp1,
                    tp2: levels.tp2,
                    tp3: levels.tp3,
                    entryZoneMin: Math.min(fvg.bottom, ob.bottom),
                    entryZoneMax: Math.max(fvg.top, ob.top),
                    entryPrice: levels.entryPrice,
                    reason: `SMC Long: Swept $${liqLow.toFixed(2)} -> MSS @ $${mssResult.brokenLevel.toFixed(2)} -> FVG+OB Confluence ($${fvg.bottom.toFixed(2)}-$${fvg.top.toFixed(2)})`,
                    signalTime: lastCandle.time,
                    fvgTop: fvg.top,
                    fvgBottom: fvg.bottom,
                    obTop: ob.top,
                    obBottom: ob.bottom,
                    htfRegime,
                    risk: levels.risk,
                    rrRatio: levels.rrRatio,
                    confluence: true,
                    inKillZone,
                    webhookPayload,
                    details: {
                      sweptLevel: liqLow,
                      sweepPrice: sweepResult.sweepPrice,
                      brokenStructureLevel: mssResult.brokenLevel,
                      displacementAtr: mssResult.displacementAtr,
                      volumeRatio: mssResult.volumeRatio
                    }
                  };
                }
              }
            }
          }
        }
      }
    }
  }

  // --- CHECK BEARISH SETUP (SHORT) ---
  if (htfRegime !== 'BULLISH') {
    const recentSwingHighs = swingHighs.filter(h => h.index < mssIndex - 1);
    for (let hi = recentSwingHighs.length - 1; hi >= Math.max(0, recentSwingHighs.length - 3); hi--) {
      const liqHigh = recentSwingHighs[hi].price;

      for (let s = Math.max(recentSwingHighs[hi].index + 1, mssIndex - sweepConfirmWindow); s < mssIndex; s++) {
        const sweepCandle = closedKlines[s];
        const sweepResult = detectLiquiditySweep(sweepCandle, s, liqHigh, undefined, {
          wickRatio: options.wickRatio,
          minSweepWickPct: options.minSweepWickPct
        });

        if (sweepResult.isSweep && sweepResult.direction === 'SHORT') {
          const mssResult = detectMssDisplacement(closedKlines, mssIndex, s, 'SHORT', atr, {
            structureLen,
            dispAtrMult: options.dispAtrMult,
            sweepConfirmWindow,
            volAvgLen: options.volAvgLen,
            volMult: options.volMult
          });

          if (mssResult.hasMss) {
            const fvg = detectFvg(closedKlines, mssIndex, 'SHORT', fvgAfterMssWindow);
            if (fvg) {
              const ob = detectOrderBlock(closedKlines, s, mssIndex, 'SHORT', atr);
              if (ob) {
                const hasConfluence = checkConfluence(fvg, ob);
                if (hasConfluence) {
                  const levels = calculateSmcLevels('SHORT', fvg, sweepResult.sweepPrice, atr, {
                    atrStopMult: options.atrStopMult,
                    rrRatio: options.rrRatio
                  });

                  let score = 85;
                  if (htfRegime === 'BEARISH') score += 10;
                  if (inKillZone) score += 5;
                  if (mssResult.volumeRatio >= 1.8) score += 5;

                  const webhookPayload = generateSmcWebhookPayload(
                    symbol,
                    'SHORT',
                    levels.entryPrice,
                    levels.sl,
                    levels.tp2
                  );

                  if (options.enforceRegimeFilter) {
                    const smcMetrics = extractSmcRegimeMetrics(closedKlines, htfCandles);
                    if (!allowSMCLiquidity(smcMetrics, 'SHORT')) {
                      continue;
                    }
                  }

                  return {
                    direction: 'SHORT',
                    score: Math.min(100, score),
                    sl: levels.sl,
                    tp1: levels.tp1,
                    tp2: levels.tp2,
                    tp3: levels.tp3,
                    entryZoneMin: Math.min(fvg.bottom, ob.bottom),
                    entryZoneMax: Math.max(fvg.top, ob.top),
                    entryPrice: levels.entryPrice,
                    reason: `SMC Short: Swept $${liqHigh.toFixed(2)} -> MSS @ $${mssResult.brokenLevel.toFixed(2)} -> FVG+OB Confluence ($${fvg.bottom.toFixed(2)}-$${fvg.top.toFixed(2)})`,
                    signalTime: lastCandle.time,
                    fvgTop: fvg.top,
                    fvgBottom: fvg.bottom,
                    obTop: ob.top,
                    obBottom: ob.bottom,
                    htfRegime,
                    risk: levels.risk,
                    rrRatio: levels.rrRatio,
                    confluence: true,
                    inKillZone,
                    webhookPayload,
                    details: {
                      sweptLevel: liqHigh,
                      sweepPrice: sweepResult.sweepPrice,
                      brokenStructureLevel: mssResult.brokenLevel,
                      displacementAtr: mssResult.displacementAtr,
                      volumeRatio: mssResult.volumeRatio
                    }
                  };
                }
              }
            }
          }
        }
      }
    }
  }

  return null;
}
