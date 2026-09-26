// src/utils/strategies/core/StrategyCatalog.md generated content is in the adjacent StrategyCatalog.md file.
// This file exports a TypeScript-accessible registry of all adapters.

import type { StrategyFn } from "./pipeline";

export interface StrategyEntry {
  name: string;
  description: string;
  allowedRegimes: Array<"trend" | "range" | "neutral">;
  allowedVolatility: Array<"compressed" | "normal" | "expanded">;
  correlationGroup: string;
  adapterPath: string;
}

export const STRATEGY_CATALOG: StrategyEntry[] = [
  {
    name: "EMA Gap Pullback",
    description:
      "Trades high-quality 5-EMA gap candles after structured pullbacks (≥3 bars), filtered by HTF EMA-50 trend alignment. " +
      "Entry near EMA-5 or mid-gap. SL beyond recent swing. TP at 1R / 1.5R / 2.5R.",
    allowedRegimes: ["trend"],
    allowedVolatility: ["normal", "expanded"],
    correlationGroup: "trend-continuation",
    adapterPath: "../emaGapPullbackAdapter",
  },
  {
    name: "Trend Pullback",
    description:
      "Enters a pullback against a confirmed HTF trend. Requires price to retrace ≤2×ATR toward the trend line. " +
      "Entry at pullback extreme, SL beyond pullback high/low, TP at 2R.",
    allowedRegimes: ["trend"],
    allowedVolatility: ["normal", "expanded"],
    correlationGroup: "trend-continuation",
    adapterPath: "../trendPullbackAdapter",
  },
  {
    name: "Volatility Compression Breakout",
    description:
      "Fires after ATR falls below its 50-bar median for N consecutive bars, then a breakout candle exceeds the compression range by ≥1.5×ATR. " +
      "Entry at breakout, SL at compression range floor/ceiling.",
    allowedRegimes: ["range", "neutral"],
    allowedVolatility: ["compressed"],
    correlationGroup: "volatility-expansion",
    adapterPath: "../volatilityCompressionAdapter",
  },
  {
    name: "Early Coil Breakout",
    description:
      "Detects the first candle breaking out of a tight coil structure, using the TwoSidedCoil engine. " +
      "Entry at breakout candle close, SL at opposite coil edge.",
    allowedRegimes: ["trend", "neutral"],
    allowedVolatility: ["compressed", "normal"],
    correlationGroup: "volatility-expansion",
    adapterPath: "../earlyCoilBreakoutAdapter",
  },
  {
    name: "Two-Sided Coil Breakout",
    description:
      "Trades the second breakout when both sides of a coil are penetrated within ≤5 bars. " +
      "Strict rules: min 1×ATR breakout distance; only candle-close counts; increased volume required on the second break. " +
      "If both sides break in one candle the signal is discarded.",
    allowedRegimes: ["neutral"],
    allowedVolatility: ["compressed", "normal"],
    correlationGroup: "volatility-expansion",
    adapterPath: "../twoSidedCoilBreakoutAdapter",
  },
  {
    name: "Macro Range Breakout",
    description:
      "Validates a candle close beyond a pre-defined macro congestion box by a configurable margin (default 0.5×ATR). " +
      "SL at the opposite box edge, TP at 1R / 1.5R / 2R.",
    allowedRegimes: ["trend", "neutral"],
    allowedVolatility: ["normal", "expanded"],
    correlationGroup: "breakout",
    adapterPath: "../macroRangeAdapter",
  },
  {
    name: "Range Mean Reversion",
    description:
      "Captures reversals inside a ranging regime. Entry at the opposite side of the range after a bounce. " +
      "Regime guard: detectRangingRegime must confirm range. SL just beyond range edge, TP at 1R–2R.",
    allowedRegimes: ["range"],
    allowedVolatility: ["compressed", "normal"],
    correlationGroup: "mean-reversion",
    adapterPath: "../rangeMeanReversionAdapter",
  },
  {
    name: "SMC Liquidity Sweep",
    description:
      "Identifies rapid liquidity-sweep patterns (order-block / BSL / SSL consumption). " +
      "Entry at sweep breakout, SL at prior swing with ATR buffer, TP at 1.5R–2.5R. " +
      "Enforces minimum 1.5× RR after buffer application.",
    allowedRegimes: ["trend", "neutral"],
    allowedVolatility: ["normal", "expanded"],
    correlationGroup: "order-flow",
    adapterPath: "../smcLiquidityAdapter",
  },
  {
    name: "Strategy Regime Filters",
    description:
      "Utility adapter that runs the unified regime detector and exposes the MarketContext. " +
      "Used as a pre-filter by all other adapters; does not generate trade signals on its own.",
    allowedRegimes: ["trend", "range", "neutral"],
    allowedVolatility: ["compressed", "normal", "expanded"],
    correlationGroup: "utility",
    adapterPath: "../strategyRegimeFiltersAdapter",
  },
  {
    name: "EMA 5 Price Action Gap + Volume",
    description:
      "Standalone 5m strategy entering early expansions around 5 EMA with confirmed 15m market structure (HH/HL or LH/LL), " +
      "pure price action (CLV >= 65%, body >= 50%), and volume participation (>= 1.10x 20-candle avg). Zero lagging indicators.",
    allowedRegimes: ["trend"],
    allowedVolatility: ["normal", "expanded"],
    correlationGroup: "momentum-expansion",
    adapterPath: "../ema5PaVolumeAdapter",
  },
];
