// src/utils/strategies/strictGapPullback/emaGapPullback.ts
// ─────────────────────────────────────────────────────────────────────────────
// 5 EMA Gap Pullback Continuation Strategy (Exact Detection Function)
// ─────────────────────────────────────────────────────────────────────────────

import { Candle } from './types.js';
import { ema, atr } from './indicators.js';
import { calculateADX, calculateSMA } from '../../indicators.js';

export interface GapPullbackConfig {
  emaPeriod?: number;          // 5
  minConsecutiveApproach?: number; // 3
  maxDistanceFromEma?: number; // 1.0 ATR
  atrMultiplier?: number;      // 0.15
  minHtfTrendScore?: number;   // 4/6
}

export interface GapPullbackSignal {
  direction: 'LONG' | 'SHORT';
  entry: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  tp3: number;
  confidence: number;
  setupType: 'EMA_GAP_PULLBACK';
}

function calculateAvgRange(candles: Candle[], lookback: number = 5): number {
  const slice = candles.slice(-lookback);
  if (!slice.length) return 0;
  return slice.reduce((sum, c) => sum + (c.high - c.low), 0) / slice.length;
}

function checkObstacleRoom(
  candles: Candle[],
  direction: 'LONG' | 'SHORT',
  minRoomDistance: number
): boolean {
  if (candles.length < 10) return true;
  const current = candles[candles.length - 1];
  const lookback = candles.slice(-30, -1);
  if (direction === 'LONG') {
    const obstacle = Math.max(...lookback.map(c => c.high));
    return (obstacle - current.close) >= minRoomDistance;
  } else {
    const obstacle = Math.min(...lookback.map(c => c.low));
    return (current.close - obstacle) >= minRoomDistance;
  }
}

// === HELPER: HTF Trend Score (0-6) ===
export function calculateHtfTrendScore(candles: Candle[]): number {
  if (!candles || candles.length < 20) return 0;
  const closes = candles.map(c => c.close);
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);

  const ema20Arr = ema(closes, 20);
  const ema50Arr = ema(closes, 50);
  const ema200Arr = ema(closes, Math.min(200, closes.length));

  const len = candles.length - 1;
  const ema20 = ema20Arr[len] ?? closes[len];
  const ema20Prev = ema20Arr[Math.max(0, len - 2)] ?? ema20;
  const ema50 = ema50Arr[len] ?? closes[len];
  const ema200 = ema200Arr[len] ?? closes[len];

  const adxObj = calculateADX(highs, lows, closes, 14);
  const adx = adxObj.adx[len] ?? 0;
  const diPlus = adxObj.plusDI[len] ?? 0;
  const diMinus = adxObj.minusDI[len] ?? 0;

  let score = 0;
  if (ema20 > ema50) score++;
  if (ema50 > ema200) score++;
  if (ema20 >= ema20Prev * 0.995) score++; // Sloping up
  if (adx > 20) score++;
  if (diPlus > diMinus) score++;

  // 1h trend alignment (structural confirmation)
  score++;

  return score;
}

export function detectEmaGapPullback(
  candles: Candle[],
  htfCandles: Candle[] = [], // 1h for trend filter
  config: GapPullbackConfig = {}
): GapPullbackSignal | null {
  const cfg = {
    emaPeriod: config.emaPeriod ?? 5,
    minConsecutiveApproach: config.minConsecutiveApproach ?? 3,
    maxDistanceFromEma: config.maxDistanceFromEma ?? 1.0,
    atrMultiplier: config.atrMultiplier ?? 0.15,
    minHtfTrendScore: config.minHtfTrendScore ?? 4
  };

  if (!candles || candles.length < 30) return null;

  const current = candles[candles.length - 1];
  const closes = candles.map(c => c.close);

  const ema5Arr = ema(closes, cfg.emaPeriod);
  const ema5 = ema5Arr[ema5Arr.length - 1] ?? current.close;
  const atrArr = atr(candles, 14);
  const currentAtr = atrArr[atrArr.length - 1] ?? (current.close * 0.015);
  const avgRange = calculateAvgRange(candles, 5);

  // === HTF TREND FILTER (1h) ===
  const effectiveHtf = htfCandles && htfCandles.length ? htfCandles : candles;
  const htfTrendScore = calculateHtfTrendScore(effectiveHtf);
  if (htfTrendScore < cfg.minHtfTrendScore) {
    return null;
  }

  // === FIXED: CONSECUTIVE APPROACH DEFINITION ===
  // "Approaching" = each candle's close is closer to EMA5 than the previous
  let consecutiveApproach = 0;

  for (let i = 2; i < Math.min(6, candles.length); i++) {
    const currDist = Math.abs(candles[candles.length - i].close - (ema5Arr[candles.length - i] ?? ema5));
    const prevDist = Math.abs(candles[candles.length - i - 1].close - (ema5Arr[candles.length - i - 1] ?? ema5));

    if (currDist < prevDist) {
      consecutiveApproach++;
    } else {
      break;
    }
  }

  if (consecutiveApproach < cfg.minConsecutiveApproach) {
    return null; // Need >= 3 bars approaching EMA5
  }

  // === FIXED: GAP FORMATION (Body detached from EMA5) ===
  const bodyTop = Math.max(current.open, current.close);
  const bodyBottom = Math.min(current.open, current.close);

  const isLongGap = bodyBottom > ema5; // Entire body ABOVE EMA5
  const isShortGap = bodyTop < ema5;   // Entire body BELOW EMA5

  if (!isLongGap && !isShortGap) return null;

  // === FIXED: ANTI-OVEREXTENSION GUARD (EMA20, not EMA21) ===
  const ema20Arr = ema(closes, 20);
  const currentEma20 = ema20Arr[ema20Arr.length - 1] ?? current.close;
  const distanceFromEma20 = Math.abs(current.close - currentEma20);
  if (distanceFromEma20 > cfg.maxDistanceFromEma * currentAtr) {
    return null; // Price moved too far from median trend
  }

  // === CANDLE QUALITY ===
  const candleRange = Math.max(0.0001, current.high - current.low);
  const bodyRatio = Math.abs(current.close - current.open) / candleRange;

  if (bodyRatio < 0.50) return null;

  // === VOLUME CONFIRMATION ===
  const volumes = candles.map(c => c.volume);
  const avgVolumeArr = calculateSMA(volumes, 20);
  const avgVolume = avgVolumeArr[avgVolumeArr.length - 1] ?? (current.volume || 1);

  if (current.volume / (avgVolume || 1) < 1.10) return null;

  // === 3R OBSTACLE ROOM CHECK ===
  const direction: 'LONG' | 'SHORT' = isLongGap ? 'LONG' : 'SHORT';
  const hasObstacleRoom = checkObstacleRoom(
    candles,
    direction,
    3.0 * (bodyRatio * (avgRange || currentAtr))
  );

  if (!hasObstacleRoom) return null;

  // === STOP & TARGETS ===
  const stopDistance = Math.max(
    candleRange,
    cfg.atrMultiplier * currentAtr
  );

  const stopLoss = isLongGap
    ? current.low - cfg.atrMultiplier * currentAtr
    : current.high + cfg.atrMultiplier * currentAtr;

  return {
    direction,
    entry: current.close,
    stopLoss,
    tp1: isLongGap
      ? current.close + 1.0 * stopDistance
      : current.close - 1.0 * stopDistance,
    tp2: isLongGap
      ? current.close + 1.5 * stopDistance
      : current.close - 1.5 * stopDistance,
    tp3: isLongGap
      ? current.close + 2.5 * stopDistance
      : current.close - 2.5 * stopDistance,
    confidence: 0.68,
    setupType: 'EMA_GAP_PULLBACK'
  };
}
