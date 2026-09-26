// src/utils/strategies/core/regimeDetector.ts
// ─────────────────────────────────────────────────────────────────────────────
// Unified regime detector.
// Returns a rich MarketContext rather than a bare three-state enum.
// Uses proper indicator math (ADX proxy, ATR normalised by price, SMA slope).
// ─────────────────────────────────────────────────────────────────────────────
import { MarketContext } from "./StrategySignal";

export interface Candle {
  time?: number;
  openTime?: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

// ── Internal indicator helpers ─────────────────────────────────────────────

function calcSma(values: number[], period: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) { out.push(NaN); continue; }
    const slice = values.slice(i - period + 1, i + 1);
    out.push(slice.reduce((a, b) => a + b, 0) / period);
  }
  return out;
}

function calcAtr(candles: Candle[], period = 14): number[] {
  const trs: number[] = [];
  for (let i = 0; i < candles.length; i++) {
    if (i === 0) { trs.push(candles[0].high - candles[0].low); continue; }
    const prev = candles[i - 1];
    const c = candles[i];
    trs.push(Math.max(
      c.high - c.low,
      Math.abs(c.high - prev.close),
      Math.abs(c.low - prev.close)
    ));
  }
  const atrs: number[] = [];
  for (let i = 0; i < trs.length; i++) {
    if (i < period) {
      atrs.push(trs.slice(0, i + 1).reduce((a, b) => a + b, 0) / (i + 1));
    } else {
      atrs.push((atrs[i - 1] * (period - 1) + trs[i]) / period);
    }
  }
  return atrs;
}

/** Wilder-smoothed ADX (simplified – DM calculation) */
function calcAdx(candles: Candle[], period = 14): number {
  if (candles.length < period * 2) return 0;
  const recent = candles.slice(-period * 2);
  let plusDm = 0, minusDm = 0, trSum = 0;
  for (let i = 1; i < recent.length; i++) {
    const c = recent[i], p = recent[i - 1];
    const upMove = c.high - p.high;
    const downMove = p.low - c.low;
    plusDm += (upMove > downMove && upMove > 0) ? upMove : 0;
    minusDm += (downMove > upMove && downMove > 0) ? downMove : 0;
    trSum += Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close));
  }
  if (trSum === 0) return 0;
  const plusDi = (plusDm / trSum) * 100;
  const minusDi = (minusDm / trSum) * 100;
  const diSum = plusDi + minusDi;
  if (diSum === 0) return 0;
  return Math.abs(plusDi - minusDi) / diSum * 100;
}

/** Detect session from a UTC timestamp */
function detectSession(ts?: number): string {
  if (!ts) return "unknown";
  const hour = new Date(ts).getUTCHours();
  if (hour >= 2 && hour < 9)  return "asia";
  if (hour >= 7 && hour < 16) return "london";
  if (hour >= 13 && hour < 22) return "new_york";
  return "off_hours";
}

// ── Main detector ──────────────────────────────────────────────────────────

/**
 * Returns a rich MarketContext using:
 * - ADX to classify trend strength (>25 → trend, <20 → range/neutral)
 * - Normalised ATR to classify volatility (compressed / normal / expanded)
 * - SMA slope for trend direction
 * - Optional HTF candles to check cross-frame agreement
 */
export function detectRegime(
  candles: Candle[],
  htfCandles?: Candle[]
): MarketContext {
  const MIN_CANDLES = 30;
  if (candles.length < MIN_CANDLES) {
    return {
      regime: "neutral",
      trendDirection: "mixed",
      volatility: "normal",
      confidence: 0,
      htfAgreement: false,
    };
  }

  const closes = candles.map(c => c.close);
  const smaPeriod = 20;
  const smaArr = calcSma(closes, smaPeriod);
  const sma = smaArr[smaArr.length - 1];
  const smaPrev = smaArr[smaArr.length - 6] ?? sma;   // 5 bars ago

  const atrArr = calcAtr(candles, 14);
  const atr = atrArr[atrArr.length - 1];
  const atrNorm = sma > 0 ? atr / sma : 0;             // normalised by price

  // ATR percentile vs last 50 bars
  const atrHistory = atrArr.slice(-50).filter(v => !isNaN(v));
  const atrMedian = atrHistory.sort((a, b) => a - b)[Math.floor(atrHistory.length / 2)] ?? atr;
  const atrRatio = atrMedian > 0 ? atr / atrMedian : 1;

  const adx = calcAdx(candles, 14);

  // ── Volatility state ────
  let volatility: "compressed" | "normal" | "expanded";
  if (atrRatio < 0.7) volatility = "compressed";
  else if (atrRatio > 1.5) volatility = "expanded";
  else volatility = "normal";

  // ── Regime & direction ────
  const smaSlope = sma - smaPrev;
  let regime: "trend" | "range" | "neutral";
  let trendDirection: "bullish" | "bearish" | "mixed";

  if (adx > 25) {
    regime = "trend";
    trendDirection = smaSlope > 0 ? "bullish" : "bearish";
  } else if (adx < 18 || volatility === "compressed") {
    regime = "range";
    trendDirection = "mixed";
  } else {
    regime = "neutral";
    trendDirection = Math.abs(smaSlope) > atr * 0.05 ? (smaSlope > 0 ? "bullish" : "bearish") : "mixed";
  }

  // ── Confidence ────
  let confidence: number;
  if (adx > 35) confidence = 0.9;
  else if (adx > 25) confidence = 0.7;
  else if (adx > 18) confidence = 0.5;
  else confidence = 0.3;

  // ── HTF agreement ────
  let htfAgreement = false;
  if (htfCandles && htfCandles.length >= MIN_CANDLES) {
    const htfContext = detectRegime(htfCandles); // recursive, no HTF
    htfAgreement = htfContext.regime === regime &&
      htfContext.trendDirection === trendDirection;
  }

  const lastTime = candles[candles.length - 1]?.time ?? candles[candles.length - 1]?.openTime;
  const session = detectSession(lastTime);

  return {
    regime,
    trendDirection,
    volatility,
    confidence: Math.round(confidence * 100),
    htfAgreement,
    session,
  };
}
