// src/utils/strategies/core/PreTradeFilters.ts
// ─────────────────────────────────────────────────────────────────────────────
// Architectural Enhancement 4: Pre-Trade Quality Filters (Min ATR, Spread, Liq)
// ─────────────────────────────────────────────────────────────────────────────

import { StrategySignal } from './StrategySignal.js';

export interface PreTradeConfig {
  minAtrPct?: number;        // 0.0008 (0.08% of price)
  maxSpreadPct?: number;     // 0.0008 (0.08%)
  minLiquidityUsd?: number;  // 1000000 (1M USD 24h volume)
}

export function applyPreTradeFilters(
  signal: StrategySignal | any,
  marketData: {
    atr: number;
    price: number;
    bidAskSpread: number;
    volume24hUsd: number;
  },
  config: PreTradeConfig = {}
): { passed: boolean; reason?: string } {
  const minAtrPct = config.minAtrPct ?? 0.0008;
  const maxSpreadPct = config.maxSpreadPct ?? 0.0008;
  const minLiquidityUsd = config.minLiquidityUsd ?? 1000000;

  if (!marketData || marketData.price <= 0) {
    return { passed: false, reason: 'Invalid market price' };
  }

  // === MINIMUM ATR FILTER ===
  const atrPct = marketData.atr / marketData.price;
  if (atrPct < minAtrPct) {
    return {
      passed: false,
      reason: `ATR too low: ${(atrPct * 100).toFixed(3)}% < ${(minAtrPct * 100).toFixed(3)}%`
    };
  }

  // === MAXIMUM SPREAD FILTER ===
  const spreadPct = marketData.bidAskSpread / marketData.price;
  if (spreadPct > maxSpreadPct) {
    return {
      passed: false,
      reason: `Spread too wide: ${(spreadPct * 100).toFixed(3)}% > ${(maxSpreadPct * 100).toFixed(3)}%`
    };
  }

  // === MINIMUM LIQUIDITY FILTER ===
  if (marketData.volume24hUsd < minLiquidityUsd) {
    return {
      passed: false,
      reason: `Insufficient liquidity: $${(marketData.volume24hUsd / 1e6).toFixed(2)}M < $${(minLiquidityUsd / 1e6).toFixed(2)}M`
    };
  }

  return { passed: true };
}
