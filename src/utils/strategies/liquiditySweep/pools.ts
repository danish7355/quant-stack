/**
 * LIQUIDITY SWEEP REVERSAL: Liquidity Map & Pool Detector
 *
 * Implements Stage 3 of the pipeline:
 *  - Detects untouched liquidity pools (PoolType: prevWeekHL, prevDayHL, sessionHL, rangeEdge, equalHL, swingHL)
 *  - Ranks pools with a 0-100 score: weights[type] + touchBonus * (touches - 1), capped at 100.
 *  - Strict adherence to rule: NO literal thresholds or constants in strategy calculations;
 *    all parameters are supplied from resolved SweepConfig.
 */

import { PoolType, SweepConfig } from './schema.js';

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface LiquidityPool {
  id: string;
  type: PoolType;
  level: number;
  side: 'HIGH' | 'LOW'; // 'HIGH' is buy-side liquidity (bearish sweep target); 'LOW' is sell-side liquidity (bullish sweep target)
  touches: number;
  score: number;
  barIndex: number;
  time: number;
  ageBars: number;
  isUntouched: boolean;
}

/**
 * Finds fractal swing pivots using pivotBars window from cfg.pools.pivotBars.
 */
export function findSwingPivots(
  candles: Candle[],
  pivotBars: number
): { highs: { index: number; price: number; time: number }[]; lows: { index: number; price: number; time: number }[] } {
  const highs: { index: number; price: number; time: number }[] = [];
  const lows: { index: number; price: number; time: number }[] = [];

  if (!candles || candles.length < pivotBars * 2 + 1) {
    return { highs, lows };
  }

  for (let i = pivotBars; i < candles.length - pivotBars; i++) {
    const curH = candles[i].high;
    const curL = candles[i].low;
    let isHigh = true;
    let isLow = true;

    for (let j = 1; j <= pivotBars; j++) {
      if (candles[i - j].high >= curH || candles[i + j].high > curH) {
        isHigh = false;
      }
      if (candles[i - j].low <= curL || candles[i + j].low < curL) {
        isLow = false;
      }
    }

    if (isHigh) {
      highs.push({ index: i, price: curH, time: candles[i].time });
    }
    if (isLow) {
      lows.push({ index: i, price: curL, time: candles[i].time });
    }
  }

  return { highs, lows };
}

/**
 * Detects and clusters Equal Highs and Equal Lows.
 * Clusters swings within equalLevelTolATR * atr of each other.
 */
export function detectEqualLevels(
  swings: { index: number; price: number; time: number }[],
  side: 'HIGH' | 'LOW',
  tolPrice: number
): { level: number; touches: number; lastIndex: number; time: number }[] {
  const clusters: { level: number; touches: number; lastIndex: number; time: number }[] = [];
  const used = new Set<number>();

  for (let i = 0; i < swings.length; i++) {
    if (used.has(i)) continue;
    let count = 1;
    let sumPrice = swings[i].price;
    let lastIdx = swings[i].index;
    let lastTime = swings[i].time;

    for (let j = i + 1; j < swings.length; j++) {
      if (used.has(j)) continue;
      if (Math.abs(swings[j].price - swings[i].price) <= tolPrice) {
        count++;
        sumPrice += swings[j].price;
        lastIdx = Math.max(lastIdx, swings[j].index);
        lastTime = Math.max(lastTime, swings[j].time);
        used.add(j);
      }
    }

    if (count >= 2) {
      used.add(i);
      clusters.push({
        level: sumPrice / count,
        touches: count,
        lastIndex: lastIdx,
        time: lastTime
      });
    }
  }

  return clusters;
}

/**
 * Extracts previous day and previous week High/Low pools.
 */
export function extractCalendarPools(
  htfCandles1D: Candle[] = []
): { prevDayHigh?: number; prevDayLow?: number; prevWeekHigh?: number; prevWeekLow?: number } {
  if (!htfCandles1D || htfCandles1D.length < 2) {
    return {};
  }

  const prevDay = htfCandles1D[htfCandles1D.length - 2];
  const prevDayHigh = prevDay.high;
  const prevDayLow = prevDay.low;

  // Previous week from last 7 completed daily candles
  let prevWeekHigh: number | undefined;
  let prevWeekLow: number | undefined;
  if (htfCandles1D.length >= 8) {
    const last7 = htfCandles1D.slice(-8, -1);
    prevWeekHigh = Math.max(...last7.map(c => c.high));
    prevWeekLow = Math.min(...last7.map(c => c.low));
  }

  return { prevDayHigh, prevDayLow, prevWeekHigh, prevWeekLow };
}

/**
 * Extracts session High/Low (e.g. rolling 8h session or previous 24-48 bars).
 */
export function extractSessionPools(
  candles: Candle[],
  sessionBars: number = 32
): { sessionHigh?: number; sessionLow?: number; sessionIndex?: number } {
  if (!candles || candles.length < 10) return {};
  const half = Math.floor(candles.length / 2);
  const bars = Math.min(sessionBars, half);
  const sessionSlice = candles.slice(-bars * 2, -bars);
  if (sessionSlice.length === 0) return {};

  let sessionHigh = -Infinity;
  let sessionLow = Infinity;
  for (const c of sessionSlice) {
    if (c.high > sessionHigh) sessionHigh = c.high;
    if (c.low < sessionLow) sessionLow = c.low;
  }
  return {
    sessionHigh: isFinite(sessionHigh) ? sessionHigh : undefined,
    sessionLow: isFinite(sessionLow) ? sessionLow : undefined,
    sessionIndex: candles.length - bars
  };
}

/**
 * Extracts range edges (e.g. highest high and lowest low over range lookback).
 */
export function extractRangeEdges(
  candles: Candle[],
  lookbackBars: number = 60
): { rangeHigh?: number; rangeLow?: number; rangeMid?: number } {
  if (!candles || candles.length < 5) return {};
  const actualLookback = Math.min(lookbackBars, candles.length);
  const slice = candles.slice(-actualLookback);
  const rangeHigh = Math.max(...slice.map(c => c.high));
  const rangeLow = Math.min(...slice.map(c => c.low));
  const rangeMid = (rangeHigh + rangeLow) / 2;
  return { rangeHigh, rangeLow, rangeMid };
}

/**
 * Computes pool score:
 * weights[type] + touchBonus * (touches - 1), capped at 100.
 */
export function scorePool(
  type: PoolType,
  touches: number,
  weights: Record<PoolType, number>,
  touchBonus: number
): number {
  const baseWeight = weights[type] ?? 50;
  const bonus = Math.max(0, touches - 1) * touchBonus;
  return Math.min(100, Math.max(0, baseWeight + bonus));
}

/**
 * Checks whether a pool has remained untouched from its creation until the candidate bar.
 */
export function checkUntouched(
  candles: Candle[],
  pool: { level: number; side: 'HIGH' | 'LOW'; barIndex: number },
  sweepBarIndex: number
): boolean {
  const start = Math.max(0, pool.barIndex + 1);
  const end = Math.min(candles.length - 1, sweepBarIndex - 1);

  for (let i = start; i <= end; i++) {
    const c = candles[i];
    if (pool.side === 'HIGH') {
      // For a high pool, if any prior bar closed or wicked above it, it was touched
      if (c.high >= pool.level) return false;
    } else {
      // For a low pool, if any prior bar closed or wicked below it, it was touched
      if (c.low <= pool.level) return false;
    }
  }
  return true;
}

/**
 * Build complete ranked liquidity map according to cfg.pools.
 */
export function buildLiquidityMap(opts: {
  execCandles: Candle[];
  dailyCandles?: Candle[];
  atr: number;
  cfg: SweepConfig;
  currentBarIndex?: number;
}): LiquidityPool[] {
  const { execCandles, dailyCandles, atr, cfg } = opts;
  const currentIdx = opts.currentBarIndex ?? execCandles.length - 1;
  const pools: LiquidityPool[] = [];

  const { weights, touchBonus, equalLevelTolATR, pivotBars, maxAgeBars } = cfg.pools;
  const tolPrice = equalLevelTolATR * atr;

  // 1. Swing Highs & Lows
  const { highs: swingHighs, lows: swingLows } = findSwingPivots(execCandles, pivotBars);

  for (const sh of swingHighs) {
    const age = currentIdx - sh.index;
    if (age <= maxAgeBars && age > 0) {
      const isUntouched = checkUntouched(execCandles, { level: sh.price, side: 'HIGH', barIndex: sh.index }, currentIdx);
      pools.push({
        id: `swingH_${sh.index}_${sh.price.toFixed(4)}`,
        type: 'swingHL',
        level: sh.price,
        side: 'HIGH',
        touches: 1,
        score: scorePool('swingHL', 1, weights, touchBonus),
        barIndex: sh.index,
        time: sh.time,
        ageBars: age,
        isUntouched
      });
    }
  }

  for (const sl of swingLows) {
    const age = currentIdx - sl.index;
    if (age <= maxAgeBars && age > 0) {
      const isUntouched = checkUntouched(execCandles, { level: sl.price, side: 'LOW', barIndex: sl.index }, currentIdx);
      pools.push({
        id: `swingL_${sl.index}_${sl.price.toFixed(4)}`,
        type: 'swingHL',
        level: sl.price,
        side: 'LOW',
        touches: 1,
        score: scorePool('swingHL', 1, weights, touchBonus),
        barIndex: sl.index,
        time: sl.time,
        ageBars: age,
        isUntouched
      });
    }
  }

  // 2. Equal Highs & Equal Lows
  const eqHighs = detectEqualLevels(swingHighs, 'HIGH', tolPrice);
  for (const eq of eqHighs) {
    const age = currentIdx - eq.lastIndex;
    if (age <= maxAgeBars && age > 0) {
      const isUntouched = checkUntouched(execCandles, { level: eq.level, side: 'HIGH', barIndex: eq.lastIndex }, currentIdx);
      pools.push({
        id: `equalH_${eq.lastIndex}_${eq.level.toFixed(4)}`,
        type: 'equalHL',
        level: eq.level,
        side: 'HIGH',
        touches: eq.touches,
        score: scorePool('equalHL', eq.touches, weights, touchBonus),
        barIndex: eq.lastIndex,
        time: eq.time,
        ageBars: age,
        isUntouched
      });
    }
  }

  const eqLows = detectEqualLevels(swingLows, 'LOW', tolPrice);
  for (const eq of eqLows) {
    const age = currentIdx - eq.lastIndex;
    if (age <= maxAgeBars && age > 0) {
      const isUntouched = checkUntouched(execCandles, { level: eq.level, side: 'LOW', barIndex: eq.lastIndex }, currentIdx);
      pools.push({
        id: `equalL_${eq.lastIndex}_${eq.level.toFixed(4)}`,
        type: 'equalHL',
        level: eq.level,
        side: 'LOW',
        touches: eq.touches,
        score: scorePool('equalHL', eq.touches, weights, touchBonus),
        barIndex: eq.lastIndex,
        time: eq.time,
        ageBars: age,
        isUntouched
      });
    }
  }

  // 3. Calendar Pools (Previous Day / Week HL)
  if (dailyCandles && dailyCandles.length >= 2) {
    const cal = extractCalendarPools(dailyCandles);
    const lastDailyTime = dailyCandles[dailyCandles.length - 2].time;

    if (cal.prevDayHigh !== undefined) {
      const isUntouched = checkUntouched(execCandles, { level: cal.prevDayHigh, side: 'HIGH', barIndex: 0 }, currentIdx);
      pools.push({
        id: `prevDayH_${cal.prevDayHigh.toFixed(4)}`,
        type: 'prevDayHL',
        level: cal.prevDayHigh,
        side: 'HIGH',
        touches: 1,
        score: scorePool('prevDayHL', 1, weights, touchBonus),
        barIndex: 0,
        time: lastDailyTime,
        ageBars: 1,
        isUntouched
      });
    }
    if (cal.prevDayLow !== undefined) {
      const isUntouched = checkUntouched(execCandles, { level: cal.prevDayLow, side: 'LOW', barIndex: 0 }, currentIdx);
      pools.push({
        id: `prevDayL_${cal.prevDayLow.toFixed(4)}`,
        type: 'prevDayHL',
        level: cal.prevDayLow,
        side: 'LOW',
        touches: 1,
        score: scorePool('prevDayHL', 1, weights, touchBonus),
        barIndex: 0,
        time: lastDailyTime,
        ageBars: 1,
        isUntouched
      });
    }
    if (cal.prevWeekHigh !== undefined) {
      const isUntouched = checkUntouched(execCandles, { level: cal.prevWeekHigh, side: 'HIGH', barIndex: 0 }, currentIdx);
      pools.push({
        id: `prevWeekH_${cal.prevWeekHigh.toFixed(4)}`,
        type: 'prevWeekHL',
        level: cal.prevWeekHigh,
        side: 'HIGH',
        touches: 1,
        score: scorePool('prevWeekHL', 1, weights, touchBonus),
        barIndex: 0,
        time: lastDailyTime,
        ageBars: 1,
        isUntouched
      });
    }
    if (cal.prevWeekLow !== undefined) {
      const isUntouched = checkUntouched(execCandles, { level: cal.prevWeekLow, side: 'LOW', barIndex: 0 }, currentIdx);
      pools.push({
        id: `prevWeekL_${cal.prevWeekLow.toFixed(4)}`,
        type: 'prevWeekHL',
        level: cal.prevWeekLow,
        side: 'LOW',
        touches: 1,
        score: scorePool('prevWeekHL', 1, weights, touchBonus),
        barIndex: 0,
        time: lastDailyTime,
        ageBars: 1,
        isUntouched
      });
    }
  }

  // 4. Session Pools
  const session = extractSessionPools(execCandles, 32);
  if (session.sessionHigh !== undefined && session.sessionIndex !== undefined) {
    const isUntouched = checkUntouched(execCandles, { level: session.sessionHigh, side: 'HIGH', barIndex: session.sessionIndex }, currentIdx);
    pools.push({
      id: `sessionH_${session.sessionHigh.toFixed(4)}`,
      type: 'sessionHL',
      level: session.sessionHigh,
      side: 'HIGH',
      touches: 1,
      score: scorePool('sessionHL', 1, weights, touchBonus),
      barIndex: session.sessionIndex,
      time: execCandles[session.sessionIndex]?.time ?? 0,
      ageBars: currentIdx - session.sessionIndex,
      isUntouched
    });
  }
  if (session.sessionLow !== undefined && session.sessionIndex !== undefined) {
    const isUntouched = checkUntouched(execCandles, { level: session.sessionLow, side: 'LOW', barIndex: session.sessionIndex }, currentIdx);
    pools.push({
      id: `sessionL_${session.sessionLow.toFixed(4)}`,
      type: 'sessionHL',
      level: session.sessionLow,
      side: 'LOW',
      touches: 1,
      score: scorePool('sessionHL', 1, weights, touchBonus),
      barIndex: session.sessionIndex,
      time: execCandles[session.sessionIndex]?.time ?? 0,
      ageBars: currentIdx - session.sessionIndex,
      isUntouched
    });
  }

  // 5. Range Edges
  const edges = extractRangeEdges(execCandles, 60);
  if (edges.rangeHigh !== undefined) {
    const isUntouched = checkUntouched(execCandles, { level: edges.rangeHigh, side: 'HIGH', barIndex: Math.max(0, currentIdx - 60) }, currentIdx);
    pools.push({
      id: `rangeEdgeH_${edges.rangeHigh.toFixed(4)}`,
      type: 'rangeEdge',
      level: edges.rangeHigh,
      side: 'HIGH',
      touches: 1,
      score: scorePool('rangeEdge', 1, weights, touchBonus),
      barIndex: Math.max(0, currentIdx - 60),
      time: execCandles[Math.max(0, currentIdx - 60)]?.time ?? 0,
      ageBars: 60,
      isUntouched
    });
  }
  if (edges.rangeLow !== undefined) {
    const isUntouched = checkUntouched(execCandles, { level: edges.rangeLow, side: 'LOW', barIndex: Math.max(0, currentIdx - 60) }, currentIdx);
    pools.push({
      id: `rangeEdgeL_${edges.rangeLow.toFixed(4)}`,
      type: 'rangeEdge',
      level: edges.rangeLow,
      side: 'LOW',
      touches: 1,
      score: scorePool('rangeEdge', 1, weights, touchBonus),
      barIndex: Math.max(0, currentIdx - 60),
      time: execCandles[Math.max(0, currentIdx - 60)]?.time ?? 0,
      ageBars: 60,
      isUntouched
    });
  }

  // Sort descending by score
  return pools.sort((a, b) => b.score - a.score);
}
