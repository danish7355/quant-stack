/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * SMC High-Probability Auto-Trading Strategy
 * Based on institutional Smart Money Concepts (SMC):
 * 1. HTF Regime Filter (HH/HL Bullish, LH/LL Bearish, Chop/Unclear)
 * 2. Liquidity Sweep Detection (Sharp wick beyond swing pivot, close inside range)
 * 3. Market Structure Shift (MSS/CHoCH) with ATR displacement & volume expansion
 * 4. Fair Value Gap (FVG) 3-candle imbalance
 * 5. Order Block (OB) approximation
 * 6. Confluence: FVG + OB overlap zone
 * 7. Session / Kill-Zone Filter (London / New York high liquidity windows)
 * 8. Precise Entry (FVG midpoint / CE) with structural SL & 1:3+ R:R TP
 */

import { AppSettings, SmcSignal, SmcLiquiditySweep, SmcMarketStructureShift, SmcFvgZone, SmcOrderBlock } from '../../types';

export interface Candle {
  time: number; // Unix timestamp in seconds or ms
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface PivotPoint {
  index: number;
  time: number;
  price: number;
  type: 'HIGH' | 'LOW';
}

/**
 * 2.1 Identify Pivot Highs and Pivot Lows with N bars lookback/forward
 */
export function findPivots(candles: Candle[], structureLen: number = 10): { highs: PivotPoint[]; lows: PivotPoint[] } {
  const highs: PivotPoint[] = [];
  const lows: PivotPoint[] = [];

  if (!candles || candles.length < structureLen * 2 + 1) {
    return { highs, lows };
  }

  // Evaluate pivots up to length - structureLen to avoid repainting
  for (let i = structureLen; i < candles.length - structureLen; i++) {
    const currentHigh = candles[i].high;
    const currentLow = candles[i].low;

    let isPivotHigh = true;
    let isPivotLow = true;

    for (let j = i - structureLen; j <= i + structureLen; j++) {
      if (j === i) continue;
      if (candles[j].high >= currentHigh) isPivotHigh = false;
      if (candles[j].low <= currentLow) isPivotLow = false;
    }

    if (isPivotHigh) {
      highs.push({
        index: i,
        time: candles[i].time,
        price: currentHigh,
        type: 'HIGH',
      });
    }

    if (isPivotLow) {
      lows.push({
        index: i,
        time: candles[i].time,
        price: currentLow,
        type: 'LOW',
      });
    }
  }

  return { highs, lows };
}

/**
 * 3.1 Higher-Timeframe (HTF) Regime Filter
 * Identifies swing highs/lows on HTF.
 * Bullish: Last two confirmed swing highs form HH and last two swing lows form HL.
 * Bearish: Last two confirmed swing highs form LH and last two swing lows form LL.
 * Choppy: Otherwise.
 */
export function classifyHtfRegime(htfCandles: Candle[], structureLen: number = 8): {
  regime: 'BULL' | 'BEAR' | 'CHOP';
  regimeBull: boolean;
  regimeBear: boolean;
  regimeChop: boolean;
  details: string;
} {
  if (!htfCandles || htfCandles.length < 25) {
    return {
      regime: 'CHOP',
      regimeBull: false,
      regimeBear: false,
      regimeChop: true,
      details: 'Insufficient HTF data for structural pivots',
    };
  }

  // Use relaxed pivot length on HTF if needed
  const pivotLen = Math.max(3, Math.min(structureLen, Math.floor(htfCandles.length / 8)));
  const { highs, lows } = findPivots(htfCandles, pivotLen);

  if (highs.length < 2 || lows.length < 2) {
    // Fallback: EMA21 vs EMA50 stack if pivots are still forming
    const closes = htfCandles.map((c) => c.close);
    const lastClose = closes[closes.length - 1];
    const ema20 = closes.slice(-20).reduce((a, b) => a + b, 0) / 20;
    const ema50 = closes.slice(-50).reduce((a, b) => a + b, 0) / Math.min(50, closes.length);

    if (lastClose > ema20 && ema20 > ema50) {
      return {
        regime: 'BULL',
        regimeBull: true,
        regimeBear: false,
        regimeChop: false,
        details: 'HTF Trend: Bullish (EMA Trend Alignment)',
      };
    } else if (lastClose < ema20 && ema20 < ema50) {
      return {
        regime: 'BEAR',
        regimeBull: false,
        regimeBear: true,
        regimeChop: false,
        details: 'HTF Trend: Bearish (EMA Trend Alignment)',
      };
    }
    return {
      regime: 'CHOP',
      regimeBull: false,
      regimeBear: false,
      regimeChop: true,
      details: 'HTF Market Structure: Unclear/Chop',
    };
  }

  const h1 = highs[highs.length - 2];
  const h2 = highs[highs.length - 1];
  const l1 = lows[lows.length - 2];
  const l2 = lows[lows.length - 1];

  const isHigherHigh = h2.price > h1.price;
  const isHigherLow = l2.price > l1.price;
  const isLowerHigh = h2.price < h1.price;
  const isLowerLow = l2.price < l1.price;

  if (isHigherHigh && isHigherLow) {
    return {
      regime: 'BULL',
      regimeBull: true,
      regimeBear: false,
      regimeChop: false,
      details: `HTF Bullish Structure (HH: $${h2.price.toFixed(2)} > $${h1.price.toFixed(2)}, HL: $${l2.price.toFixed(2)} > $${l1.price.toFixed(2)})`,
    };
  }

  if (isLowerHigh && isLowerLow) {
    return {
      regime: 'BEAR',
      regimeBull: false,
      regimeBear: true,
      regimeChop: false,
      details: `HTF Bearish Structure (LH: $${h2.price.toFixed(2)} < $${h1.price.toFixed(2)}, LL: $${l2.price.toFixed(2)} < $${l1.price.toFixed(2)})`,
    };
  }

  return {
    regime: 'CHOP',
    regimeBull: false,
    regimeBear: false,
    regimeChop: true,
    details: 'HTF Structure: Consolidation / Mixed Pivots',
  };
}

/**
 * Calculate Average True Range (ATR)
 */
export function calculateAtr(candles: Candle[], period: number = 14): number[] {
  const atrs: number[] = [];
  if (candles.length === 0) return atrs;

  let trSum = 0;
  for (let i = 0; i < candles.length; i++) {
    const high = candles[i].high;
    const low = candles[i].low;
    const prevClose = i > 0 ? candles[i - 1].close : candles[i].open;

    const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));

    if (i < period) {
      trSum += tr;
      atrs.push(trSum / (i + 1));
    } else {
      const prevAtr = atrs[i - 1];
      const atr = (prevAtr * (period - 1) + tr) / period;
      atrs.push(atr);
    }
  }

  return atrs;
}

/**
 * 3.7 Session / Kill-Zone Filter
 * Checks if current candle time falls in high-liquidity session:
 * London Open: ~07:00 - 10:00 UTC
 * New York Open: ~12:00 - 15:00 UTC
 */
export function isInKillZone(
  timestamp: number,
  useKillZone: boolean = true,
  customStart?: string,
  customEnd?: string
): boolean {
  if (!useKillZone) return true;

  // Convert seconds to ms if necessary
  const date = new Date(timestamp > 1e11 ? timestamp : timestamp * 1000);
  const utcHours = date.getUTCHours();
  const utcMinutes = date.getUTCMinutes();
  const timeVal = utcHours + utcMinutes / 60;

  if (customStart && customEnd) {
    const [sH, sM] = customStart.split(':').map(Number);
    const [eH, eM] = customEnd.split(':').map(Number);
    const startVal = sH + (sM || 0) / 60;
    const endVal = eH + (eM || 0) / 60;

    if (startVal <= endVal) {
      return timeVal >= startVal && timeVal <= endVal;
    } else {
      // Over midnight
      return timeVal >= startVal || timeVal <= endVal;
    }
  }

  // Default London (07:00 - 10:00 UTC) or New York (12:00 - 15:30 UTC)
  const isLondon = timeVal >= 7.0 && timeVal <= 10.0;
  const isNewYork = timeVal >= 12.0 && timeVal <= 15.5;

  return isLondon || isNewYork;
}

/**
 * Main Evaluation Engine: SMC High-Probability Auto-Trading Strategy
 */
export function evaluateSmcHighProbability(
  tradingCandles: Candle[],
  htfCandles: Candle[] = [],
  currentPrice: number,
  settings: Partial<AppSettings> = {}
): SmcSignal | null {
  if (!tradingCandles || tradingCandles.length < 35) {
    return null;
  }

  // Extract parameters with robust defaults
  const structureLen = settings.smcStructureLen ?? 8;
  const wickRatio = settings.smcWickRatio ?? 0.6;
  const minSweepWickPct = (settings.smcMinSweepWickPct ?? 0.15) / 100; // Convert 0.15% to 0.0015
  const dispAtrMult = settings.smcDispAtrMult ?? 0.5;
  const atrLen = settings.smcAtrLen ?? 14;
  const sweepConfirmWindow = settings.smcSweepConfirmWindow ?? 10;
  const volAvgLen = settings.smcVolAvgLen ?? 20;
  const volMult = settings.smcVolMult ?? 1.25;
  const fvgAfterMssWindow = settings.smcFvgAfterMssWindow ?? 6;
  const obLookback = settings.smcObLookback ?? 30;
  const useKillZone = settings.smcUseKillZone ?? false;
  const atrStopMult = settings.smcAtrStopMult ?? 1.5;
  const rrRatio = settings.smcRrRatio ?? settings.minRRRatio ?? 3.0;

  // 1. HTF Regime Filter
  const htf = classifyHtfRegime(htfCandles.length >= 20 ? htfCandles : tradingCandles, structureLen);

  // Compute ATR
  const atrSeries = calculateAtr(tradingCandles, atrLen);
  const currentAtr = atrSeries[atrSeries.length - 1] || currentPrice * 0.01;

  // Compute Volume Moving Average
  const volumes = tradingCandles.map((c) => c.volume);
  const volAvgSeries: number[] = [];
  for (let i = 0; i < volumes.length; i++) {
    const start = Math.max(0, i - volAvgLen + 1);
    const slice = volumes.slice(start, i + 1);
    volAvgSeries.push(slice.reduce((a, b) => a + b, 0) / slice.length);
  }

  const lastIndex = tradingCandles.length - 1;
  const lastCandle = tradingCandles[lastIndex];

  // 2. Identify Pivots on Trading Timeframe
  const { highs, lows } = findPivots(tradingCandles, Math.min(structureLen, 6));

  if (highs.length === 0 && lows.length === 0) {
    return null;
  }

  // 3. Liquidity Sweep Detection across the last 20 candles
  let latestBullSweep: SmcLiquiditySweep | null = null;
  let latestBearSweep: SmcLiquiditySweep | null = null;

  const sweepScanStart = Math.max(0, lastIndex - 25);

  for (let i = sweepScanStart; i <= lastIndex; i++) {
    const candle = tradingCandles[i];
    const bodySize = Math.abs(candle.close - candle.open);
    const upperWick = candle.high - Math.max(candle.close, candle.open);
    const lowerWick = Math.min(candle.close, candle.open) - candle.low;

    // Prior confirmed swing low before this candle
    const priorLows = lows.filter((l) => l.index < i);
    if (priorLows.length > 0) {
      const liqLow = priorLows[priorLows.length - 1].price;
      const extension = liqLow - candle.low;
      const extensionPct = extension / candle.close;

      const isBullSweep =
        candle.low < liqLow &&
        candle.close > liqLow && // Closed back above level
        lowerWick >= bodySize * wickRatio && // Disproportionate rejection wick
        extensionPct >= minSweepWickPct; // Material sweep

      if (isBullSweep) {
        latestBullSweep = {
          type: 'BULLISH',
          level: liqLow,
          sweepPrice: candle.low,
          sweepTime: candle.time,
          wickRatio: lowerWick / (bodySize || 1),
          extensionPct: extensionPct * 100,
          barIndex: i,
        };
      }
    }

    // Prior confirmed swing high before this candle
    const priorHighs = highs.filter((h) => h.index < i);
    if (priorHighs.length > 0) {
      const liqHigh = priorHighs[priorHighs.length - 1].price;
      const extension = candle.high - liqHigh;
      const extensionPct = extension / candle.close;

      const isBearSweep =
        candle.high > liqHigh &&
        candle.close < liqHigh && // Closed back below level
        upperWick >= bodySize * wickRatio &&
        extensionPct >= minSweepWickPct;

      if (isBearSweep) {
        latestBearSweep = {
          type: 'BEARISH',
          level: liqHigh,
          sweepPrice: candle.high,
          sweepTime: candle.time,
          wickRatio: upperWick / (bodySize || 1),
          extensionPct: extensionPct * 100,
          barIndex: i,
        };
      }
    }
  }

  // Determine which direction has the most recent valid sweep
  let candidateDirection: 'LONG' | 'SHORT' | null = null;
  let activeSweep: SmcLiquiditySweep | null = null;

  if (latestBullSweep && latestBearSweep) {
    if (latestBullSweep.barIndex >= latestBearSweep.barIndex) {
      candidateDirection = 'LONG';
      activeSweep = latestBullSweep;
    } else {
      candidateDirection = 'SHORT';
      activeSweep = latestBearSweep;
    }
  } else if (latestBullSweep) {
    candidateDirection = 'LONG';
    activeSweep = latestBullSweep;
  } else if (latestBearSweep) {
    candidateDirection = 'SHORT';
    activeSweep = latestBearSweep;
  }

  if (!candidateDirection || !activeSweep) {
    return {
      symbol: '',
      direction: 'LONG',
      score: 40,
      entryPrice: currentPrice,
      sl: currentPrice * 0.99,
      tp1: currentPrice * 1.01,
      tp2: currentPrice * 1.02,
      tp3: currentPrice * 1.03,
      rrRatio: 3.0,
      risk: currentAtr,
      htfRegime: htf.regime,
      sweep: null as any,
      mss: null as any,
      fvg: null as any,
      orderBlock: null as any,
      hasConfluence: false,
      inKillZone: false,
      signalTime: lastCandle.time,
      status: 'WAITING' as any,
      reason: `Market condition not in favor of SMC: No liquidity sweep detected (HTF: ${htf.regime}). Waiting for sweep of key swing highs/lows.`,
      strategyRegimeStatus: 'WAITING',
      marketRegime: `HTF Structure: ${htf.regime}`
    };
  }

  // HTF Regime alignment check
  if ((candidateDirection === 'LONG' && htf.regimeBear) || (candidateDirection === 'SHORT' && htf.regimeBull)) {
    return {
      symbol: '',
      direction: candidateDirection,
      score: 45,
      entryPrice: currentPrice,
      sl: currentPrice * 0.99,
      tp1: currentPrice * 1.01,
      tp2: currentPrice * 1.02,
      tp3: currentPrice * 1.03,
      rrRatio: 3.0,
      risk: currentAtr,
      htfRegime: htf.regime,
      sweep: activeSweep,
      mss: null as any,
      fvg: null as any,
      orderBlock: null as any,
      hasConfluence: false,
      inKillZone: false,
      signalTime: lastCandle.time,
      status: 'WAITING' as any,
      reason: `Market condition not in favor of SMC: Candidate direction (${candidateDirection}) conflicts with HTF ${htf.regime} structure. Waiting for favorable alignment.`,
      strategyRegimeStatus: 'WAITING',
      marketRegime: `HTF Structure: ${htf.regime}`
    };
  }

  // 4. Market Structure Shift (MSS / CHoCH) with Displacement
  const sweepBar = activeSweep.barIndex;
  const barsSinceSweep = lastIndex - sweepBar;
  if (barsSinceSweep > sweepConfirmWindow) {
    return null; // Sweep is too stale
  }

  let mssResult: SmcMarketStructureShift | null = null;

  // Search for MSS between sweep bar and current bar
  for (let i = sweepBar + 1; i <= lastIndex; i++) {
    const candle = tradingCandles[i];
    const atrAtBar = atrSeries[i] || currentAtr;
    const volAtBar = candle.volume;
    const volAvg = volAvgSeries[i] || volAtBar;

    if (candidateDirection === 'LONG') {
      // Recent structural high before the displacement leg
      const lookbackStart = Math.max(0, sweepBar - structureLen);
      const priorHighSlice = tradingCandles.slice(lookbackStart, sweepBar + 1).map((c) => c.high);
      const structHigh = Math.max(...priorHighSlice);

      const displacement = candle.close - structHigh;
      const hasDisplacement = displacement >= atrAtBar * dispAtrMult;
      const volConfirmed = volAtBar >= volAvg * volMult || candle.close > candle.open;

      if (candle.close > structHigh && (hasDisplacement || candle.close > structHigh + currentAtr * 0.2)) {
        mssResult = {
          type: 'BULLISH_MSS',
          brokenLevel: structHigh,
          displacementAtr: displacement / atrAtBar,
          barIndex: i,
          time: candle.time,
          volumeRatio: volAtBar / (volAvg || 1),
        };
        break;
      }
    } else {
      // Bearish MSS
      const lookbackStart = Math.max(0, sweepBar - structureLen);
      const priorLowSlice = tradingCandles.slice(lookbackStart, sweepBar + 1).map((c) => c.low);
      const structLow = Math.min(...priorLowSlice);

      const displacement = structLow - candle.close;
      const hasDisplacement = displacement >= atrAtBar * dispAtrMult;

      if (candle.close < structLow && (hasDisplacement || candle.close < structLow - currentAtr * 0.2)) {
        mssResult = {
          type: 'BEARISH_MSS',
          brokenLevel: structLow,
          displacementAtr: displacement / atrAtBar,
          barIndex: i,
          time: candle.time,
          volumeRatio: volAtBar / (volAvg || 1),
        };
        break;
      }
    }
  }

  if (!mssResult) {
    return null;
  }

  // 5. Fair Value Gap (FVG) Detection
  // Search for 3-candle imbalance formed near the MSS displacement move
  const mssBar = mssResult.barIndex;
  const fvgSearchStart = Math.max(2, mssBar - 1);
  const fvgSearchEnd = Math.min(lastIndex, mssBar + fvgAfterMssWindow);

  let activeFvg: SmcFvgZone | null = null;

  for (let i = fvgSearchStart; i <= fvgSearchEnd; i++) {
    if (i < 2) continue;
    const c0 = tradingCandles[i - 2];
    const c2 = tradingCandles[i];

    if (candidateDirection === 'LONG') {
      // Bullish FVG: high[2] < low
      if (c0.high < c2.low) {
        const top = c2.low;
        const bottom = c0.high;
        const gapSize = top - bottom;
        if (gapSize >= currentAtr * 0.15) {
          activeFvg = {
            type: 'BULLISH',
            top,
            bottom,
            midpoint: (top + bottom) / 2,
            time: c2.time,
            barIndex: i,
            mitigated: currentPrice < bottom,
          };
        }
      }
    } else {
      // Bearish FVG: low[2] > high
      if (c0.low > c2.high) {
        const top = c0.low;
        const bottom = c2.high;
        const gapSize = top - bottom;
        if (gapSize >= currentAtr * 0.15) {
          activeFvg = {
            type: 'BEARISH',
            top,
            bottom,
            midpoint: (top + bottom) / 2,
            time: c2.time,
            barIndex: i,
            mitigated: currentPrice > top,
          };
        }
      }
    }
  }

  // If no crisp 3-bar FVG formed, create a micro-FVG imbalance zone around the MSS displacement
  if (!activeFvg) {
    const dispCandle = tradingCandles[mssBar];
    const buffer = currentAtr * 0.25;
    if (candidateDirection === 'LONG') {
      activeFvg = {
        type: 'BULLISH',
        top: dispCandle.close,
        bottom: Math.max(dispCandle.open, dispCandle.low + buffer),
        midpoint: (dispCandle.close + Math.max(dispCandle.open, dispCandle.low + buffer)) / 2,
        time: dispCandle.time,
        barIndex: mssBar,
        mitigated: false,
      };
    } else {
      activeFvg = {
        type: 'BEARISH',
        top: Math.min(dispCandle.open, dispCandle.high - buffer),
        bottom: dispCandle.close,
        midpoint: (Math.min(dispCandle.open, dispCandle.high - buffer) + dispCandle.close) / 2,
        time: dispCandle.time,
        barIndex: mssBar,
        mitigated: false,
      };
    }
  }

  // 6. Order Block (OB) Approximation
  // Find the displacement-initiating candle (last opposing candle before MSS move)
  let activeOb: SmcOrderBlock | null = null;
  const obScanLimit = Math.max(0, mssBar - obLookback);

  for (let i = mssBar; i >= obScanLimit; i--) {
    const candle = tradingCandles[i];
    if (candidateDirection === 'LONG') {
      // Last down candle before displacement
      if (candle.close <= candle.open || candle.low === activeSweep.sweepPrice) {
        activeOb = {
          type: 'BULLISH',
          top: Math.max(candle.open, candle.close),
          bottom: candle.low,
          open: candle.open,
          close: candle.close,
          high: candle.high,
          low: candle.low,
          time: candle.time,
          barIndex: i,
        };
        break;
      }
    } else {
      // Last up candle before downward displacement
      if (candle.close >= candle.open || candle.high === activeSweep.sweepPrice) {
        activeOb = {
          type: 'BEARISH',
          top: candle.high,
          bottom: Math.min(candle.open, candle.close),
          open: candle.open,
          close: candle.close,
          high: candle.high,
          low: candle.low,
          time: candle.time,
          barIndex: i,
        };
        break;
      }
    }
  }

  if (!activeOb) {
    const baseCandle = tradingCandles[sweepBar];
    activeOb = {
      type: candidateDirection === 'LONG' ? 'BULLISH' : 'BEARISH',
      top: baseCandle.high,
      bottom: baseCandle.low,
      open: baseCandle.open,
      close: baseCandle.close,
      high: baseCandle.high,
      low: baseCandle.low,
      time: baseCandle.time,
      barIndex: sweepBar,
    };
  }

  // 7. Confluence: FVG + OB Overlap Check
  let hasOverlap = false;
  if (candidateDirection === 'LONG') {
    hasOverlap = activeFvg.top >= activeOb.bottom && activeFvg.bottom <= activeOb.top;
  } else {
    hasOverlap = activeFvg.top >= activeOb.bottom && activeFvg.bottom <= activeOb.top;
  }

  // Confluence is confirmed if overlap exists or zones are tightly aligned (within 0.5 ATR)
  const zoneDistance =
    candidateDirection === 'LONG'
      ? Math.max(0, activeFvg.bottom - activeOb.top)
      : Math.max(0, activeOb.bottom - activeFvg.top);
  const isConfluenceValid = hasOverlap || zoneDistance <= currentAtr * 0.75;

  if (!isConfluenceValid) {
    return null;
  }

  // 8. Session / Kill-Zone Check
  const inKill = isInKillZone(lastCandle.time, useKillZone, settings.smcKillZoneStart, settings.smcKillZoneEnd);
  if (useKillZone && !inKill) {
    return null;
  }

  // 9. Entry & Structural Stop-Loss / Take-Profit Calculation
  // Entry at FVG midpoint (consequent encroachment)
  const entryPrice = activeFvg.midpoint;

  let sl = 0;
  if (candidateDirection === 'LONG') {
    const baseStop = entryPrice - currentAtr * atrStopMult;
    // Structural stop below sweep low with 0.05% safety buffer
    const structuralStop = activeSweep.sweepPrice * 0.9995;
    sl = Math.min(baseStop, structuralStop);
  } else {
    const baseStop = entryPrice + currentAtr * atrStopMult;
    const structuralStop = activeSweep.sweepPrice * 1.0005;
    sl = Math.max(baseStop, structuralStop);
  }

  const risk = Math.abs(entryPrice - sl);
  if (risk <= 0 || risk > currentPrice * 0.08) {
    return null; // Unrealistic stop risk
  }

  let tp1 = 0;
  let tp2 = 0;
  let tp3 = 0;

  if (candidateDirection === 'LONG') {
    tp1 = entryPrice + risk * 1.5;
    tp2 = entryPrice + risk * rrRatio;
    tp3 = entryPrice + risk * 5.0;
  } else {
    tp1 = entryPrice - risk * 1.5;
    tp2 = entryPrice - risk * rrRatio;
    tp3 = entryPrice - risk * 5.0;
  }

  // Scoring conviction (0 - 100)
  let score = 75;
  if (htf.regime === (candidateDirection === 'LONG' ? 'BULL' : 'BEAR')) score += 12;
  if (hasOverlap) score += 8;
  if (mssResult.volumeRatio >= 1.5) score += 5;
  if (inKill) score += 5;
  score = Math.min(98, score);

  // Status determination
  const inZone =
    candidateDirection === 'LONG'
      ? currentPrice <= activeFvg.top && currentPrice >= sl
      : currentPrice >= activeFvg.bottom && currentPrice <= sl;

  const status = inZone ? 'TRIGGERED' : 'ARMED';

  const reason = `[SMC ${candidateDirection}] Sweep @ $${activeSweep.sweepPrice.toFixed(2)} (${activeSweep.extensionPct.toFixed(2)}%) → MSS (${mssResult.displacementAtr.toFixed(1)}x ATR) → FVG+OB Confluence [HTF: ${htf.regime}]`;

  return {
    symbol: '',
    direction: candidateDirection,
    score,
    entryPrice,
    sl,
    tp1,
    tp2,
    tp3,
    rrRatio,
    risk,
    htfRegime: htf.regime,
    strategyRegimeStatus: 'IN_FAVOR',
    marketRegime: `HTF Structure: ${htf.regime}`,
    sweep: activeSweep,
    mss: mssResult,
    fvg: activeFvg,
    orderBlock: activeOb,
    hasConfluence: isConfluenceValid,
    inKillZone: inKill,
    signalTime: lastCandle.time,
    status,
    reason,
  };
}

/**
 * 4. Automation & Signal Specification
 * Generates complete Pine Script v6 strategy with alert() JSON payloads,
 * on-chart visual tables, MSS labels, FVG boxes, and OB zones.
 */
export function generateSMCStrategyPineScript(settings: Partial<AppSettings> = {}): string {
  const structureLen = settings.smcStructureLen ?? 8;
  const wickRatio = settings.smcWickRatio ?? 0.6;
  const minSweepWickPct = settings.smcMinSweepWickPct ?? 0.15;
  const dispAtrMult = settings.smcDispAtrMult ?? 0.5;
  const atrLen = settings.smcAtrLen ?? 14;
  const sweepConfirmWindow = settings.smcSweepConfirmWindow ?? 10;
  const volAvgLen = settings.smcVolAvgLen ?? 20;
  const volMult = settings.smcVolMult ?? 1.5;
  const fvgAfterMssWindow = settings.smcFvgAfterMssWindow ?? 5;
  const obLookback = settings.smcObLookback ?? 30;
  const atrStopMult = settings.smcAtrStopMult ?? 1.5;
  const rrRatio = settings.smcRrRatio ?? 3.0;

  return `//@version=6
strategy("SMC High-Probability Strategy [Auto-Execution]", overlay=true, initial_capital=10000, default_qty_type=strategy.percent_of_equity, default_qty_value=2, commission_type=strategy.commission.percent, commission_value=0.04)

// -------------------------------------------------------------
// 1. CONFIGURABLE INPUTS
// -------------------------------------------------------------
string grpHtf         = "Higher Timeframe (HTF) Filter"
string htfRes         = input.timeframe("240", "HTF Resolution", group=grpHtf)
int    structureLen   = input.int(${structureLen}, "Pivot Length (Structure)", minval=3, maxval=30, group=grpHtf)

string grpSweep       = "Liquidity Sweep Settings"
float  wickRatio      = input.float(${wickRatio}, "Min Wick-to-Body Ratio", minval=0.2, step=0.1, group=grpSweep)
float  minSweepWickPct= input.float(${minSweepWickPct}, "Min Sweep Extension (%)", minval=0.05, step=0.05, group=grpSweep)

string grpMss         = "Market Structure Shift (MSS)"
float  dispAtrMult    = input.float(${dispAtrMult}, "Displacement Multiplier (x ATR)", step=0.1, group=grpMss)
int    atrLen         = input.int(${atrLen}, "ATR Length", group=grpMss)
int    sweepWindow    = input.int(${sweepConfirmWindow}, "Sweep Confirm Window (Bars)", group=grpMss)
int    volAvgLen      = input.int(${volAvgLen}, "Volume SMA Length", group=grpMss)
float  volMult        = input.float(${volMult}, "Volume Threshold Multiplier", step=0.1, group=grpMss)

string grpZones       = "FVG & Order Block Zones"
int    fvgWindow      = input.int(${fvgAfterMssWindow}, "Max Bars MSS to FVG", group=grpZones)
int    obLookback     = input.int(${obLookback}, "Order Block Lookback", group=grpZones)

string grpSession     = "Session / Kill Zones"
bool   useKillZone    = input.bool(false, "Enable Kill Zone Filter", group=grpSession)
string killZoneSession= input.session("0700-1000,1200-1530:23456", "Kill Zone Hours (UTC)", group=grpSession)

string grpRisk        = "Risk Management"
float  atrStopMult    = input.float(${atrStopMult}, "ATR Stop Multiplier", step=0.1, group=grpRisk)
float  rrRatio        = input.float(${rrRatio}, "Risk : Reward Ratio", step=0.5, group=grpRisk)

// -------------------------------------------------------------
// 2. INDICATORS & HTF STRUCTURE
// -------------------------------------------------------------
float atrVal = ta.atr(atrLen)
float volSma = ta.sma(volume, volAvgLen)
bool  inSession = not useKillZone or not na(time(timeframe.period, killZoneSession, "UTC"))

// HTF Trend Calculation
f_get_htf_trend(res, len) =>
    h = request.security(syminfo.tickerid, res, ta.pivothigh(high, len, len), lookahead=barmerge.lookahead_off)
    l = request.security(syminfo.tickerid, res, ta.pivotlow(low, len, len), lookahead=barmerge.lookahead_off)
    var float lastH1 = na, var float lastH2 = na
    var float lastL1 = na, var float lastL2 = na
    if not na(h)
        lastH2 := lastH1
        lastH1 := h
    if not na(l)
        lastL2 := lastL1
        lastL1 := l
    bool isBull = (not na(lastH1) and not na(lastH2) and lastH1 > lastH2) and (not na(lastL1) and not na(lastL2) and lastL1 > lastL2)
    bool isBear = (not na(lastH1) and not na(lastH2) and lastH1 < lastH2) and (not na(lastL1) and not na(lastL2) and lastL1 < lastL2)
    [isBull, isBear]

[regimeBull, regimeBear] = f_get_htf_trend(htfRes, structureLen)
bool regimeChop = not regimeBull and not regimeBear

// -------------------------------------------------------------
// 3. LIQUIDITY SWEEP DETECTION
// -------------------------------------------------------------
float pivotH = ta.pivothigh(high, structureLen, structureLen)
float pivotL = ta.pivotlow(low, structureLen, structureLen)

var float liqHigh = na
var float liqLow  = na
if not na(pivotH)
    liqHigh := pivotH
if not na(pivotL)
    liqLow  := pivotL

float bodySize  = math.abs(close - open)
float upperWick = high - math.max(close, open)
float lowerWick = math.min(close, open) - low

bool bullSweep = not na(liqLow) and low < liqLow and close > liqLow and lowerWick >= (bodySize * wickRatio) and ((liqLow - low) >= (close * (minSweepWickPct / 100)))
bool bearSweep = not na(liqHigh) and high > liqHigh and close < liqHigh and upperWick >= (bodySize * wickRatio) and ((high - liqHigh) >= (close * (minSweepWickPct / 100)))

var int lastBullSweepBar = na
var float sweepLowPrice  = na
var int lastBearSweepBar = na
var float sweepHighPrice = na

if bullSweep
    lastBullSweepBar := bar_index
    sweepLowPrice := low

if bearSweep
    lastBearSweepBar := bar_index
    sweepHighPrice := high

// -------------------------------------------------------------
// 4. MSS WITH DISPLACEMENT & VOLUME
// -------------------------------------------------------------
float structH = ta.highest(high, structureLen)[1]
float structL = ta.lowest(low, structureLen)[1]

bool bullMss = close > structH and (close - structH) >= (atrVal * dispAtrMult) and volume >= (volSma * volMult) and not regimeBear
bool bearMss = close < structL and (structL - close) >= (atrVal * dispAtrMult) and volume >= (volSma * volMult) and not regimeBull

bool validBullMss = bullMss and not na(lastBullSweepBar) and (bar_index - lastBullSweepBar <= sweepWindow)
bool validBearMss = bearMss and not na(lastBearSweepBar) and (bar_index - lastBearSweepBar <= sweepWindow)

var int lastBullMssBar = na
var int lastBearMssBar = na
if validBullMss
    lastBullMssBar := bar_index
if validBearMss
    lastBearMssBar := bar_index

// -------------------------------------------------------------
// 5. FAIR VALUE GAP (FVG)
// -------------------------------------------------------------
bool bullFvg = high[2] < low and (low - high[2]) >= (atrVal * 0.15)
bool bearFvg = low[2] > high and (low[2] - high) >= (atrVal * 0.15)

bool validBullFvg = bullFvg and not na(lastBullMssBar) and (bar_index - lastBullMssBar <= fvgWindow)
bool validBearFvg = bearFvg and not na(lastBearMssBar) and (bar_index - lastBearMssBar <= fvgWindow)

float bullFvgTop = validBullFvg ? low : na
float bullFvgBot = validBullFvg ? high[2] : na
float bearFvgTop = validBearFvg ? low[2] : na
float bearFvgBot = validBearFvg ? high : na

// -------------------------------------------------------------
// 6. ORDER BLOCK (OB) & CONFLUENCE
// -------------------------------------------------------------
var float obBullTop = na
var float obBullBot = na
var float obBearTop = na
var float obBearBot = na

if validBullMss
    for i = 0 to obLookback
        if close[i] <= open[i]
            obBullTop := math.max(open[i], close[i])
            obBullBot := low[i]
            break

if validBearMss
    for i = 0 to obLookback
        if close[i] >= open[i]
            obBearTop := high[i]
            obBearBot := math.min(open[i], close[i])
            break

bool bullConfluence = validBullFvg and inSession and (not na(obBullTop) and bullFvgTop >= obBullBot and bullFvgBot <= obBullTop)
bool bearConfluence = validBearFvg and inSession and (not na(obBearTop) and bearFvgTop >= obBearBot and bearFvgBot <= obBearTop)

// -------------------------------------------------------------
// 7. STRATEGY ENTRY & EXIT EXECUTION
// -------------------------------------------------------------
float entryLong = (bullFvgTop + bullFvgBot) / 2
float entryShort = (bearFvgTop + bearFvgBot) / 2

if bullConfluence and strategy.position_size == 0
    float slLong = math.min(entryLong - (atrVal * atrStopMult), not na(sweepLowPrice) ? sweepLowPrice * 0.9995 : entryLong * 0.98)
    float tpLong = entryLong + (entryLong - slLong) * rrRatio
    strategy.entry("SMC_Long", strategy.long, limit=entryLong, comment="SMC_Long_FVG_OB")
    strategy.exit("SMC_Long_Exit", "SMC_Long", stop=slLong, limit=tpLong)
    alert('{"action":"buy","symbol":"' + syminfo.ticker + '","type":"limit","price":' + str.tostring(entryLong) + ',"sl":' + str.tostring(slLong) + ',"tp":' + str.tostring(tpLong) + ',"comment":"SMC_Long_FVG_OB"}', alert.freq_once_per_bar_close)

if bearConfluence and strategy.position_size == 0
    float slShort = math.max(entryShort + (atrVal * atrStopMult), not na(sweepHighPrice) ? sweepHighPrice * 1.0005 : entryShort * 1.02)
    float tpShort = entryShort - (slShort - entryShort) * rrRatio
    strategy.entry("SMC_Short", strategy.short, limit=entryShort, comment="SMC_Short_FVG_OB")
    strategy.exit("SMC_Short_Exit", "SMC_Short", stop=slShort, limit=tpShort)
    alert('{"action":"sell","symbol":"' + syminfo.ticker + '","type":"limit","price":' + str.tostring(entryShort) + ',"sl":' + str.tostring(slShort) + ',"tp":' + str.tostring(tpShort) + ',"comment":"SMC_Short_FVG_OB"}', alert.freq_once_per_bar_close)

// -------------------------------------------------------------
// 8. VISUALS & ON-CHART DASHBOARD
// -------------------------------------------------------------
var table htfTable = table.new(position.top_left, 2, 1, bgcolor=color.new(color.black, 20), border_color=color.gray, border_width=1)
if barstate.islast
    string regimeTxt = regimeBull ? "HTF: BULL" : regimeBear ? "HTF: BEAR" : "HTF: CHOP"
    color  regimeCol = regimeBull ? color.green : regimeBear ? color.red : color.gray
    table.cell(htfTable, 0, 0, regimeTxt, text_color=color.white, bgcolor=regimeCol)

plotshape(bullSweep, title="Bullish Sweep", style=shape.triangleup, location=location.belowbar, color=color.yellow, size=size.small, text="SWEEP")
plotshape(bearSweep, title="Bearish Sweep", style=shape.triangledown, location=location.abovebar, color=color.purple, size=size.small, text="SWEEP")

plotshape(validBullMss, title="Bull MSS", style=shape.labelup, location=location.belowbar, color=color.green, size=size.normal, text="BULL MSS")
plotshape(validBearMss, title="Bear MSS", style=shape.labeldown, location=location.abovebar, color=color.red, size=size.normal, text="BEAR MSS")
`;
}
