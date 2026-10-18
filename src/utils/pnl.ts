import { calcRoundTripFeePct } from './regimeEngine.js';

export interface PositionPnlResult {
  gross: number;
  fees: number;
  net: number;
  netPct: number;
}

/**
 * Shared single-source-of-truth position PnL & fee calculation.
 * gross = priceDeltaPct * allocatedBalance * leverage
 * fees = allocatedBalance * leverage * calcRoundTripFeePct(takerFeePct, gstPct, slippageBps) / 100
 * net = gross - fees
 * netPct = (net / allocatedBalance) * 100
 */
export function calcPositionPnl(
  direction: 'LONG' | 'SHORT' | string,
  entryPrice: number,
  price: number,
  allocatedBalance: number,
  leverage: number = 1,
  settings?: any
): PositionPnlResult {
  if (!entryPrice || entryPrice <= 0 || !allocatedBalance || allocatedBalance <= 0) {
    return { gross: 0, fees: 0, net: 0, netPct: 0 };
  }

  const lev = leverage > 0 ? leverage : 1;
  const isLong = direction === 'LONG';
  const priceDeltaPct = isLong
    ? (price - entryPrice) / entryPrice
    : (entryPrice - price) / entryPrice;

  const gross = priceDeltaPct * allocatedBalance * lev;

  const takerFeePct = settings?.takerFeePct ?? 0.05;
  const gstPct = settings?.gstPct ?? 18;
  const slippageBps = settings?.slippageBps ?? 2;

  const roundTripFeePct = calcRoundTripFeePct(takerFeePct, gstPct, slippageBps);
  let fees = (allocatedBalance * lev * roundTripFeePct) / 100;
  if (!Number.isFinite(fees) || isNaN(fees)) {
    fees = 0;
  }

  const net = gross - fees;
  const netPct = allocatedBalance > 0 ? (net / allocatedBalance) * 100 : 0;

  return {
    gross: Number(gross.toFixed(4)),
    fees: Number(fees.toFixed(4)),
    net: Number(net.toFixed(4)),
    netPct: Number(netPct.toFixed(4))
  };
}
