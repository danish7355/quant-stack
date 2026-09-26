// src/utils/strategies/core/positionSizer.ts
// ─────────────────────────────────────────────────────────────────────────────
// Account-level position sizing with every cap applied in priority order.
// Includes kill-switch and daily-drawdown controls.
// ─────────────────────────────────────────────────────────────────────────────

export interface AccountState {
  equity: number;
  /** Current floating + realised P&L for the session */
  sessionPnl: number;
  /** Number of open positions across all strategies */
  openPositions: number;
  /** Total notional currently deployed (sum of entry × qty for all opens) */
  totalOpenNotional: number;
  /** True if a manual or automated kill switch has been triggered */
  killSwitchActive: boolean;
}

export interface SizingSettings {
  /** Risk per trade as a fraction of equity (e.g., 0.01 = 1 %) */
  riskFraction: number;
  /** Maximum quantity per order */
  maxQty?: number;
  /** Maximum notional per order */
  maxNotional?: number;
  /** Maximum total open notional */
  maxTotalNotional?: number;
  /** Maximum concurrent open positions */
  maxOpenPositions?: number;
  /** Daily loss limit as a fraction of equity (e.g., 0.03 = 3 %) – halts trading */
  dailyLossLimitFraction?: number;
  /** Minimum non-zero quantity (lot size floor) */
  minQty?: number;
}

export interface SizingResult {
  quantity: number;
  notional: number;
  riskAmount: number;
  /** If false, one or more caps were binding */
  atFullSize: boolean;
  /** Reason quantity was reduced or set to 0 */
  capReason?: string;
}

/**
 * Compute trade quantity from account equity and signal risk.
 * Returns { quantity: 0 } with a capReason whenever the trade must be blocked.
 */
export function computePositionSize(
  entry: number,
  riskPerUnit: number,
  account: AccountState,
  settings: SizingSettings
): SizingResult {
  // ── Kill switch ──────────────────────────────────────────────────────────
  if (account.killSwitchActive) {
    return { quantity: 0, notional: 0, riskAmount: 0, atFullSize: false, capReason: "kill_switch_active" };
  }

  // ── Daily loss limit ─────────────────────────────────────────────────────
  const dailyLossLimit = (settings.dailyLossLimitFraction ?? 0.03) * account.equity;
  if (account.sessionPnl <= -dailyLossLimit) {
    return { quantity: 0, notional: 0, riskAmount: 0, atFullSize: false, capReason: "daily_loss_limit_hit" };
  }

  // ── Max concurrent positions ─────────────────────────────────────────────
  const maxOpen = settings.maxOpenPositions ?? 5;
  if (account.openPositions >= maxOpen) {
    return { quantity: 0, notional: 0, riskAmount: 0, atFullSize: false, capReason: "max_open_positions" };
  }

  // ── Risk-based quantity ──────────────────────────────────────────────────
  if (riskPerUnit <= 0) {
    return { quantity: 0, notional: 0, riskAmount: 0, atFullSize: false, capReason: "invalid_risk_per_unit" };
  }
  const riskAmount = account.equity * settings.riskFraction;
  let qty = riskAmount / riskPerUnit;

  let capReason: string | undefined;

  // ── Max quantity cap ─────────────────────────────────────────────────────
  if (settings.maxQty !== undefined && qty > settings.maxQty) {
    qty = settings.maxQty;
    capReason = "max_qty";
  }

  // ── Max notional cap ─────────────────────────────────────────────────────
  const notional = qty * entry;
  if (settings.maxNotional !== undefined && notional > settings.maxNotional) {
    qty = settings.maxNotional / entry;
    capReason = "max_notional";
  }

  // ── Max total open notional cap ──────────────────────────────────────────
  const maxTotal = settings.maxTotalNotional ?? Infinity;
  if (account.totalOpenNotional + qty * entry > maxTotal) {
    const available = maxTotal - account.totalOpenNotional;
    if (available <= 0) {
      return { quantity: 0, notional: 0, riskAmount: 0, atFullSize: false, capReason: "max_total_notional" };
    }
    qty = available / entry;
    capReason = "max_total_notional_partial";
  }

  // ── Minimum qty floor ────────────────────────────────────────────────────
  const minQty = settings.minQty ?? 0.001;
  qty = Math.max(qty, minQty);

  const finalNotional = qty * entry;
  return {
    quantity: qty,
    notional: finalNotional,
    riskAmount,
    atFullSize: !capReason,
    capReason,
  };
}
