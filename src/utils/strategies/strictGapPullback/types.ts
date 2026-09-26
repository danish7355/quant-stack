// src/utils/strategies/strictGapPullback/types.ts
// ─────────────────────────────────────────────────────────────────────────────
// All types and enums for the 5 EMA Strict-Gap Pullback Continuation strategy.
// ─────────────────────────────────────────────────────────────────────────────

export type Direction = "LONG" | "SHORT";
export type EntryMethod = "MODEL_A_NEXT_OPEN" | "MODEL_B_RETEST_LIMIT";
export type Confidence = "A" | "B";

export type BtcRegime =
  | "STRONG_BULL_TREND"
  | "BULL_TREND"
  | "RANGE_OR_CHOP"
  | "BEAR_TREND"
  | "STRONG_BEAR_TREND"
  | "HIGH_RISK_VOLATILE";

export interface Candle {
  time: number;        // unix ms
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// ── Gate results ─────────────────────────────────────────────────────────────

export interface Gate1Result {
  passed: boolean;
  btcRegime: BtcRegime;
  allowedDirection: Direction | null;
  reason: string;
}

export interface Gate2Result {
  passed: boolean;
  coinRegime: string;
  relativeStrength: "strong" | "weak" | "neutral";
  reason: string;
}

export interface Gate3Result {
  passed: boolean;
  pullbackBars: number;
  pullbackType: "flag" | "wedge" | "unknown";
  reason: string;
}

export interface Gate4Result {
  passed: boolean;
  closeLocation: number;
  volumeRatio: number;
  rangeAtr: number;
  distToEma21Atr: number;
  reason: string;
}

export interface Gate5Result {
  passed: boolean;
  entry: number;
  stop: number;
  riskPerUnit: number;
  tp1: number;
  tp2: number;
  tp3: number;
  nearestObstacle: number;
  structuralRoom: number;   // in R multiples
  reason: string;
}

export interface Gate6Result {
  passed: boolean;
  method: EntryMethod;
  entryZone: number;
  limitPrice?: number;
  reason: string;
}

// ── Final signal output ───────────────────────────────────────────────────────

export interface ValidSignal {
  status: "VALID_LONG" | "VALID_SHORT";
  coin: string;
  marketRegime: string;
  coinRegime: string;
  timeframe: "15m";
  setup: "5 EMA Strict-Gap Pullback Continuation";
  pullback: string;
  signalCandle: string;
  entryMethod: EntryMethod;
  entryZone: number;
  stopLoss: number;
  riskPerUnit: number;
  riskPct: number;
  tp1: number;
  tpFinal: number;
  nearestObstacle: number;
  structuralRoom: number;
  positionSize: number;
  invalidation: string;
  confidence: Confidence;
  reason: string;
  // Raw gate details for logging / audit
  gates: { g1: Gate1Result; g2: Gate2Result; g3: Gate3Result; g4: Gate4Result; g5: Gate5Result; g6: Gate6Result };
}

export interface NoTradeSignal {
  status: "NO_TRADE";
  coin: string;
  failedGate:
    | "Market Regime"
    | "Coin Regime"
    | "Pullback"
    | "Gap Signal"
    | "Risk-Reward"
    | "Execution";
  reason: string;
  whatIsRequiredNext: string;
}

export type StrategyOutput = ValidSignal | NoTradeSignal;

// ── Settings ──────────────────────────────────────────────────────────────────

export interface StrictGapSettings {
  // Gate 1
  btcAbnormalVolatilityAtrMult?: number;   // default 2.0
  // Gate 2
  coinExtensionAtrMult?: number;           // default 2.0
  // Gate 3
  pullbackMinBars?: number;                // default 3
  pullbackMaxBars?: number;                // default 8
  pullbackMinCloseRatio?: number;          // default 0.60
  // Gate 4
  minCloseLocation?: number;              // default 0.70 (long) / max 0.30 (short)
  maxRangeAtr?: number;                   // default 1.2
  minVolumeMultiplier?: number;           // default 1.5
  maxDistToEma21Atr?: number;             // default 1.0
  // Gate 5
  slAtrBuffer?: number;                   // default 0.2
  minStopAtr?: number;                    // default 0.5
  maxStopAtr?: number;                    // default 1.5
  minStructuralRoom?: number;             // default 3.0 R
  minNetRewardAfterCosts?: number;        // default 2.5 R
  // Gate 6
  maxChaseAtr?: number;                   // default 0.25
  retestMaxCandles?: number;              // default 2
  // Execution costs
  feesAtrFraction?: number;               // round-trip fees as fraction of ATR
  slippageAtrFraction?: number;
  spreadAtrFraction?: number;
  // Account
  accountEquity?: number;
  riskFraction?: number;                  // default 0.01 (1%)
}
