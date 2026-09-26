// src/utils/strategies/strictGapPullback/tradeManager.ts
// ─────────────────────────────────────────────────────────────────────────────
// GATE 7 — Post-entry trade management rules.
// Called once per completed candle while a position is open.
// Returns a management action the execution layer must act on.
// ─────────────────────────────────────────────────────────────────────────────
import { Candle, Direction } from "./types";
import { ema, atr } from "./indicators";

export type ManagementAction =
  | "HOLD"
  | "MOVE_TO_BREAKEVEN"
  | "PARTIAL_PROFIT_50PCT"
  | "EXIT_WEAK_SETUP"
  | "EXIT_REGIME_FLIP"
  | "EXIT_EMA5_CLOSE";

export interface TradeState {
  direction: Direction;
  entryPrice: number;
  stopPrice: number;
  riskPerUnit: number;
  tp1: number;
  tpFinal: number;
  candlesSinceEntry: number;
  highestPriceSeen: number;   // for LONG
  lowestPriceSeen: number;    // for SHORT
  atBreakeven: boolean;
  partialTaken: boolean;
}

export interface ManagementResult {
  action: ManagementAction;
  newStop?: number;
  exitPrice?: number;
  reason: string;
}

/**
 * Evaluate trade management on each completed 15m candle.
 * Rules are applied in priority order (most protective first).
 */
export function evaluateTradeManagement(
  candles15m: Candle[],
  state: TradeState,
  btcRegimeFlipped: boolean
): ManagementResult {
  const n = candles15m.length;
  const lastCandle = candles15m[n - 1];
  const closes = candles15m.map(c => c.close);
  const ema5Val = ema(closes, 5)[n - 1];

  const { direction, entryPrice, riskPerUnit, tp1, atBreakeven } = state;
  const sign = direction === "LONG" ? 1 : -1;
  const priceVsEntry = sign * (lastCandle.close - entryPrice);
  const priceVsTp1 = sign * (lastCandle.close - tp1);

  // ── Rule 1: BTC regime flip → exit or tighten ─────────────────────────────
  if (btcRegimeFlipped) {
    return { action: "EXIT_REGIME_FLIP", exitPrice: lastCandle.close, reason: "BTC market regime flipped against trade direction." };
  }

  // ── Rule 2: Exit on EMA5 close before +1R (if regime is also deteriorating) ──
  if (priceVsEntry < riskPerUnit) { // not yet at +1R
    const belowEma5 = direction === "LONG" && lastCandle.close < ema5Val;
    const aboveEma5 = direction === "SHORT" && lastCandle.close > ema5Val;
    if (belowEma5 || aboveEma5) {
      return { action: "EXIT_EMA5_CLOSE", exitPrice: lastCandle.close, reason: "Completed candle closed through EMA5 before reaching +1R." };
    }
  }

  // ── Rule 3: Weak setup – no progress to +0.5R in 3 candles ──────────────
  const halfR = riskPerUnit * 0.5;
  if (state.candlesSinceEntry >= 3 && priceVsEntry < halfR) {
    return { action: "EXIT_WEAK_SETUP", exitPrice: lastCandle.close, reason: "Price failed to reach +0.5R within 3 candles — weak setup, closing trade." };
  }

  // ── Rule 4: Move to breakeven once genuinely at +1R (on close, not wick) ──
  if (!atBreakeven && priceVsEntry >= riskPerUnit) {
    return { action: "MOVE_TO_BREAKEVEN", newStop: entryPrice, reason: "Price closed at or beyond +1R — stop moved to breakeven." };
  }

  // ── Rule 5: Optional partial profit at +1R ────────────────────────────────
  if (!state.partialTaken && priceVsTp1 >= 0) {
    return { action: "PARTIAL_PROFIT_50PCT", reason: "Price reached TP1 (+1R) — taking 50% partial profit." };
  }

  return { action: "HOLD", reason: "Trade is progressing normally. Hold for 3R target." };
}
