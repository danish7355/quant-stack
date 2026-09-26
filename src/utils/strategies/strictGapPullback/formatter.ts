// src/utils/strategies/strictGapPullback/formatter.ts
// ─────────────────────────────────────────────────────────────────────────────
// Formats the engine output into the exact signal output required by the prompt.
// ─────────────────────────────────────────────────────────────────────────────
import { StrategyOutput, ValidSignal, NoTradeSignal } from "./types";

function fmt(n: number, dp = 4): string {
  return n.toFixed(dp);
}

/**
 * Format the engine output into the exact text output specified in the strategy prompt.
 */
export function formatSignalOutput(output: StrategyOutput): string {
  if (output.status === "NO_TRADE") {
    const s = output as NoTradeSignal;
    return [
      `STATUS: NO TRADE`,
      `COIN: ${s.coin}`,
      `FAILED GATE: ${s.failedGate}`,
      `REASON: ${s.reason}`,
      `WHAT IS REQUIRED NEXT: ${s.whatIsRequiredNext}`,
    ].join("\n");
  }

  const s = output as ValidSignal;
  const statusLabel = s.status === "VALID_LONG" ? "VALID LONG SETUP" : "VALID SHORT SETUP";

  return [
    `STATUS: ${statusLabel}`,
    `COIN: ${s.coin}`,
    `MARKET REGIME: ${s.marketRegime}`,
    `COIN REGIME: ${s.coinRegime}`,
    `TIMEFRAME: 15m setup, 1H/4H confirmation`,
    `SETUP: ${s.setup}`,
    `PULLBACK: ${s.pullback}`,
    `SIGNAL CANDLE: ${s.signalCandle}`,
    `ENTRY METHOD: ${s.entryMethod === "MODEL_A_NEXT_OPEN" ? "Next-Open Market Entry" : "Retest Limit Entry"}`,
    `ENTRY ZONE: ${fmt(s.entryZone)}`,
    `STOP LOSS: ${fmt(s.stopLoss)}`,
    `RISK PER UNIT: ${fmt(s.riskPerUnit)} (${s.riskPct.toFixed(2)}% of equity)`,
    `TAKE PROFIT 1: ${fmt(s.tp1)}  (+1R)`,
    `TAKE PROFIT FINAL: ${fmt(s.tpFinal)}  (+3R)`,
    `NEXT ${s.status === "VALID_LONG" ? "1H/4H RESISTANCE" : "1H/4H SUPPORT"}: ${fmt(s.nearestObstacle)}`,
    `STRUCTURAL ROOM: ${s.structuralRoom.toFixed(2)}R available before key level`,
    `POSITION SIZE: ${s.positionSize.toFixed(4)} units (${s.riskPct.toFixed(2)}% equity risk)`,
    `INVALIDATION: ${s.invalidation}`,
    `CONFIDENCE: ${s.confidence}`,
    `REASON: ${s.reason}`,
  ].join("\n");
}
