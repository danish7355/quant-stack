// src/utils/strategies/core/FeeDragCalculator.ts
// ─────────────────────────────────────────────────────────────────────────────
// Architectural Enhancement 1: Universal Fee-Drag Floor Calculator
// ─────────────────────────────────────────────────────────────────────────────

export interface FeeDragConfig {
  takerFeeBps?: number;      // 5 (0.05%)
  gstRate?: number;          // 0.18 (18%)
  slippageBps?: number;      // 2 (0.02% typical)
  maxFeeR?: number;          // 0.20
}

export function calculateFeeDrag(
  entryPrice: number,
  stopDistance: number,
  config: FeeDragConfig = {}
): { feeR: number; passed: boolean } {
  const takerFeeBps = config.takerFeeBps ?? 5;
  const gstRate = config.gstRate ?? 0.18;
  const slippageBps = config.slippageBps ?? 2;
  const maxFeeR = config.maxFeeR ?? 0.20;

  if (stopDistance <= 0 || entryPrice <= 0) {
    return { feeR: Infinity, passed: false };
  }

  // Round-trip taker fees + GST
  const roundTripFee = 2 * (takerFeeBps / 10000) * entryPrice;
  const gst = roundTripFee * gstRate;

  // Slippage cost (both entry and exit)
  const roundTripSlippage = 2 * (slippageBps / 10000) * entryPrice;

  const totalCost = roundTripFee + gst + roundTripSlippage;

  // Fee drag in R-units
  const feeR = totalCost / stopDistance;

  return {
    feeR,
    passed: feeR <= maxFeeR
  };
}
