// src/utils/strategies/strictGapPullback/engine.ts
// ─────────────────────────────────────────────────────────────────────────────
// Main entry point.
// Runs all gates in order. Stops at the first failure and returns NO_TRADE.
// Returns VALID_LONG or VALID_SHORT only when every gate passes.
// ─────────────────────────────────────────────────────────────────────────────
import {
  Candle, Direction, StrictGapSettings, ValidSignal,
  NoTradeSignal, StrategyOutput, Confidence,
} from "./types";
import { runGate1, runGate2, runGate3, runGate4, runGate5, runGate6 } from "./gates";

export interface EngineInput {
  coin: string;
  /** Completed 15m candles (at least 100 recommended) */
  candles15m: Candle[];
  /** 1H candles for coin regime and resistance detection */
  coin1h: Candle[];
  /** 4H candles for coin regime */
  coin4h: Candle[];
  /** BTC 1H candles */
  btc1h: Candle[];
  /** BTC 4H candles */
  btc4h: Candle[];
  /** Account equity for position sizing */
  accountEquity: number;
  settings?: StrictGapSettings;
}

function noTrade(
  coin: string,
  failedGate: NoTradeSignal["failedGate"],
  reason: string,
  next: string
): NoTradeSignal {
  return { status: "NO_TRADE", coin, failedGate, reason, whatIsRequiredNext: next };
}

function computeConfidence(g4: ReturnType<typeof runGate4>, g5: ReturnType<typeof runGate5>): Confidence {
  // Grade A: close-loc ≥ 0.80, vol ≥ 2×, structural room ≥ 4R, stop in 0.7–1.2×ATR
  const highQualityGap = g4.closeLocation >= 0.80 && g4.volumeRatio >= 2.0;
  const highQualityRR = g5.structuralRoom >= 4.0;
  return highQualityGap && highQualityRR ? "A" : "B";
}

/**
 * Evaluate the 5 EMA Strict-Gap Pullback Continuation strategy.
 * Returns either a complete ValidSignal or a NoTradeSignal.
 * ALL GATES MUST PASS — there is no partial or "maybe" output.
 */
export function evaluateStrictGapPullback(input: EngineInput): StrategyOutput {
  const {
    coin, candles15m, coin1h, coin4h, btc1h, btc4h,
    accountEquity, settings = {},
  } = input;

  const riskFraction = settings.riskFraction ?? 0.01;

  // ── GATE 1: BTC Regime ─────────────────────────────────────────────────────
  const g1 = runGate1(btc1h, btc4h, settings);
  if (!g1.passed) {
    return noTrade(coin, "Market Regime", g1.reason,
      "Wait for BTC to establish a clear trend on both 1H and 4H above/below EMA50 with no abnormal candles.");
  }
  const direction = g1.allowedDirection!;

  // ── GATE 2: Coin Regime ────────────────────────────────────────────────────
  const g2 = runGate2(coin1h, coin4h, direction, settings);
  if (!g2.passed) {
    return noTrade(coin, "Coin Regime", g2.reason,
      `${coin} must independently show ${direction === "LONG" ? "bullish" : "bearish"} structure on both 1H and 4H with rising/falling EMA50.`);
  }

  // ── GATE 3: Controlled Pullback ────────────────────────────────────────────
  const g3 = runGate3(candles15m, direction, settings);
  if (!g3.passed) {
    return noTrade(coin, "Pullback", g3.reason,
      `Wait for a 3–8 bar controlled ${direction === "LONG" ? "downward" : "upward"} pullback toward EMA21 without violent candles.`);
  }

  // ── GATE 4: Strict 5 EMA Gap Signal Candle ─────────────────────────────────
  const g4 = runGate4(candles15m, direction, settings);
  if (!g4.passed) {
    return noTrade(coin, "Gap Signal", g4.reason,
      `Wait for a completed 15m candle where the ENTIRE candle is ${direction === "LONG" ? "above" : "below"} EMA5, body ${direction === "LONG" ? "bullish" : "bearish"}, close-location ${direction === "LONG" ? "≥0.70" : "≤0.30"}, vol ≥1.5×, range ≤1.2×ATR.`);
  }

  // ── GATE 5: Risk, Target, and Structural Room ──────────────────────────────
  const sigClose = candles15m[candles15m.length - 1].close;
  const g5 = runGate5(candles15m, coin1h, direction, sigClose, settings);
  if (!g5.passed) {
    return noTrade(coin, "Risk-Reward", g5.reason,
      `Need structural room of at least 3R from entry to nearest ${direction === "LONG" ? "resistance" : "support"}. Stop must be 0.5–1.5×ATR.`);
  }

  // ── GATE 6: Execution Plan ─────────────────────────────────────────────────
  const g6 = runGate6(candles15m, direction, g5, settings);
  if (!g6.passed) {
    return noTrade(coin, "Execution", g6.reason, "Wait for a non-chase execution opportunity.");
  }

  // ── ALL GATES PASSED — build output ───────────────────────────────────────
  const confidence = computeConfidence(g4, g5);
  const riskPct = riskFraction * 100;
  const positionSize = (accountEquity * riskFraction) / g5.riskPerUnit;

  const statusStr = direction === "LONG" ? "VALID_LONG" : "VALID_SHORT";
  const n = candles15m.length;
  const sig = candles15m[n - 1];

  const invalidation = direction === "LONG"
    ? `Cancel if next 15m open is >${(settings.maxChaseAtr ?? 0.25)}×ATR above signal close. Cancel limit if unfilled after 2 candles or if 15m candle closes below EMA5. Exit if 15m closes below EMA5 before +1R and regime deteriorates. Exit if BTC flips bearish.`
    : `Cancel if next 15m open is >${(settings.maxChaseAtr ?? 0.25)}×ATR below signal close. Cancel limit if unfilled after 2 candles or if 15m candle closes above EMA5. Exit if 15m closes above EMA5 before +1R and regime deteriorates. Exit if BTC flips bullish.`;

  const reason = [
    `✓ G1: BTC ${g1.btcRegime}`,
    `✓ G2: Coin ${g2.coinRegime} (${g2.relativeStrength})`,
    `✓ G3: ${g3.pullbackBars}-bar controlled pullback`,
    `✓ G4: close-loc=${g4.closeLocation.toFixed(2)}, vol=${g4.volumeRatio.toFixed(2)}×, range=${g4.rangeAtr.toFixed(2)}×ATR`,
    `✓ G5: ${g5.structuralRoom.toFixed(2)}R room, net reward ≥2.5R`,
    `✓ G6: ${g6.method}`,
  ].join(" | ");

  const signal: ValidSignal = {
    status: statusStr as ValidSignal["status"],
    coin,
    marketRegime: `${g1.btcRegime} — ${g1.reason}`,
    coinRegime: `${g2.coinRegime} — ${g2.reason}`,
    timeframe: "15m",
    setup: "5 EMA Strict-Gap Pullback Continuation",
    pullback: `${g3.pullbackBars} bars, ${g3.pullbackType}, EMA21 respected`,
    signalCandle: `range=${g4.rangeAtr.toFixed(2)}×ATR, vol=${g4.volumeRatio.toFixed(2)}×SMA20, close-loc=${g4.closeLocation.toFixed(2)}`,
    entryMethod: g6.method,
    entryZone: g6.entryZone,
    stopLoss: g5.stop,
    riskPerUnit: g5.riskPerUnit,
    riskPct,
    tp1: g5.tp1,
    tpFinal: g5.tp3,
    nearestObstacle: g5.nearestObstacle,
    structuralRoom: g5.structuralRoom,
    positionSize,
    invalidation,
    confidence,
    reason,
    gates: { g1, g2, g3, g4, g5, g6 },
  };

  return signal;
}
