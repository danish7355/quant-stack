/**
 * LIQUIDITY_SWEEP_REVERSAL (LSR) V2 — Parameter Schema and Presets
 *
 * Single source of truth for LSR:
 *  - Front-end renders controls and sections from PARAMS
 *  - Strategy detector, scanner, server and backtester read from LsrV2Config
 *  - validate() guards configuration updates
 *  - Gate toggles allow switching any rule off without code changes
 */

export type LsrTimeframeChoice = 'context' | 'execution';
export type LsrTriggerPrice = 'mark' | 'last';
export type LsrPresetName = 'Strict' | 'Balanced' | 'Relaxed' | 'Custom';
export type LsrEntryMode = 
  | 'SWEPT_LEVEL'
  | 'MIDPOINT_LIMIT'
  | 'C0_CLOSE'
  | 'LITE_CLOSE'
  | 'DEFAULT_FVG';

export interface LsrPoolScores {
  equalHighsLows: number;
  prevDayHighLow: number;
  sessionHighLow: number;
  prevWeekHighLow: number;
  singleSwing: number;
}

export interface LsrV2Config {
  configVersion: string;
  preset: LsrPresetName;

  // 1. Structure
  executionTimeframe: string;
  contextTimeframe: string;
  structureLookback: number;
  sweepMinAtr: number;
  sweepMaxAtr: number;
  maxReacceptanceBars: number;
  trackConsumedPools: boolean;

  // 2. Location and Pool
  locationGate: {
    enabled: boolean;
    edgePct: number; // 10 - 50%
    rangeTimeframe: LsrTimeframeChoice;
  };
  poolSource: {
    timeframe: LsrTimeframeChoice;
  };
  poolQuality: {
    enabled: boolean;
    minScore: number; // 1 - 4
    eqTolAtr: number; // 0.02 - 0.30
    scores: LsrPoolScores;
  };

  // 3. Entry
  entryMode: LsrEntryMode;
  starShape: {
    enabled: boolean;
    wickToBody: number; // 1 - 4
    wickToRange: number; // 0.3 - 0.8
  };
  volumeGate: {
    enabled: boolean;
    volMultiple: number; // 1 - 3 (x SMA20)
  };

  // 4. Stop and Targets
  minStructuralRR: number; // 1.5 - 6 (Balanced: 3.5)
  finalTpR: number; // 1.5 - 6 (Balanced: 3.5)
  roomCheck: {
    enabled: boolean; // Opposing pool >= minStructuralRR * risk
  };
  sl: {
    atrBuffer: number; // 0 - 0.5 (Balanced: 0.15)
    triggerPrice: LsrTriggerPrice;
  };

  // 5. Exit Rules
  timeStop: {
    enabled: boolean;
    bars: number; // 3 - 30 (Balanced: 8)
    minProgressR: number; // 0.1 - 2 (Balanced: 0.5)
  };
  partialTp1Enabled: boolean;
  partialTp1ClosePct: number;

  // 6. Fees
  feeFloor: {
    enabled: boolean; // default OFF
    roundTripFeePct: number; // 0 - 1 (default 0.177%)
    divisor: number; // 0.05 - 0.5 (default 0.20)
  };
}

export const LSR_PRESETS: Record<'Strict' | 'Balanced' | 'Relaxed', LsrV2Config> = {
  Strict: {
    configVersion: 'LSR_V2.0',
    preset: 'Strict',
    executionTimeframe: '5m',
    contextTimeframe: '15m',
    structureLookback: 50,
    sweepMinAtr: 0.10,
    sweepMaxAtr: 1.0,
    maxReacceptanceBars: 1,
    trackConsumedPools: true,

    locationGate: {
      enabled: true,
      edgePct: 30,
      rangeTimeframe: 'context'
    },
    poolSource: {
      timeframe: 'context'
    },
    poolQuality: {
      enabled: true,
      minScore: 2,
      eqTolAtr: 0.10,
      scores: {
        equalHighsLows: 3,
        prevDayHighLow: 2,
        sessionHighLow: 2,
        prevWeekHighLow: 2,
        singleSwing: 1
      }
    },

    entryMode: 'MIDPOINT_LIMIT',
    starShape: {
      enabled: true,
      wickToBody: 2.0,
      wickToRange: 0.60
    },
    volumeGate: {
      enabled: true,
      volMultiple: 1.5
    },

    minStructuralRR: 3.5,
    finalTpR: 3.5,
    roomCheck: {
      enabled: true
    },
    sl: {
      atrBuffer: 0.15,
      triggerPrice: 'mark'
    },

    timeStop: {
      enabled: true,
      bars: 6,
      minProgressR: 0.5
    },
    partialTp1Enabled: true,
    partialTp1ClosePct: 0.25,

    feeFloor: {
      enabled: true,
      roundTripFeePct: 0.177,
      divisor: 0.20
    }
  },

  Balanced: {
    configVersion: 'LSR_V2.0',
    preset: 'Balanced',
    executionTimeframe: '5m',
    contextTimeframe: '15m',
    structureLookback: 40,
    sweepMinAtr: 0.10,
    sweepMaxAtr: 1.0,
    maxReacceptanceBars: 1,
    trackConsumedPools: true,

    locationGate: {
      enabled: true,
      edgePct: 35,
      rangeTimeframe: 'context'
    },
    poolSource: {
      timeframe: 'context'
    },
    poolQuality: {
      enabled: true,
      minScore: 2,
      eqTolAtr: 0.10,
      scores: {
        equalHighsLows: 3,
        prevDayHighLow: 2,
        sessionHighLow: 2,
        prevWeekHighLow: 2,
        singleSwing: 1
      }
    },

    entryMode: 'MIDPOINT_LIMIT',
    starShape: {
      enabled: true,
      wickToBody: 1.5,
      wickToRange: 0.50
    },
    volumeGate: {
      enabled: true,
      volMultiple: 1.2
    },

    minStructuralRR: 3.5,
    finalTpR: 3.5,
    roomCheck: {
      enabled: true
    },
    sl: {
      atrBuffer: 0.15,
      triggerPrice: 'mark'
    },

    timeStop: {
      enabled: true,
      bars: 8,
      minProgressR: 0.5
    },
    partialTp1Enabled: true,
    partialTp1ClosePct: 0.25,

    feeFloor: {
      enabled: false,
      roundTripFeePct: 0.177,
      divisor: 0.20
    }
  },

  Relaxed: {
    configVersion: 'LSR_V2.0',
    preset: 'Relaxed',
    executionTimeframe: '5m',
    contextTimeframe: '15m',
    structureLookback: 35,
    sweepMinAtr: 0.05,
    sweepMaxAtr: 1.2,
    maxReacceptanceBars: 2,
    trackConsumedPools: true,

    locationGate: {
      enabled: true,
      edgePct: 45,
      rangeTimeframe: 'context'
    },
    poolSource: {
      timeframe: 'context'
    },
    poolQuality: {
      enabled: true,
      minScore: 1,
      eqTolAtr: 0.15,
      scores: {
        equalHighsLows: 3,
        prevDayHighLow: 2,
        sessionHighLow: 2,
        prevWeekHighLow: 2,
        singleSwing: 1
      }
    },

    entryMode: 'C0_CLOSE',
    starShape: {
      enabled: true,
      wickToBody: 1.2,
      wickToRange: 0.40
    },
    volumeGate: {
      enabled: false,
      volMultiple: 1.0
    },

    minStructuralRR: 3.0,
    finalTpR: 3.0,
    roomCheck: {
      enabled: false
    },
    sl: {
      atrBuffer: 0.15,
      triggerPrice: 'mark'
    },

    timeStop: {
      enabled: true,
      bars: 10,
      minProgressR: 0.4
    },
    partialTp1Enabled: true,
    partialTp1ClosePct: 0.25,

    feeFloor: {
      enabled: false,
      roundTripFeePct: 0.177,
      divisor: 0.20
    }
  }
};

export const DEFAULT_LSR_CONFIG: LsrV2Config = { ...LSR_PRESETS.Balanced };

/**
 * Applies a named preset, returning a deep copy
 */
export function applyLsrPreset(preset: LsrPresetName): LsrV2Config {
  if (preset === 'Strict') return JSON.parse(JSON.stringify(LSR_PRESETS.Strict));
  if (preset === 'Relaxed') return JSON.parse(JSON.stringify(LSR_PRESETS.Relaxed));
  return JSON.parse(JSON.stringify(LSR_PRESETS.Balanced));
}

/**
 * Calculates fee share of R-multiple risk
 */
export function calcFeeShareOfR(stopDistancePct: number, roundTripFeePct: number = 0.177): number {
  if (stopDistancePct <= 0) return 0;
  return roundTripFeePct / stopDistancePct;
}

export interface LsrParamDef {
  key: string;
  label: string;
  section: 'Structure' | 'Location and Pool' | 'Entry' | 'Stop and Targets' | 'Exit Rules' | 'Fees';
  type: 'number' | 'boolean' | 'select';
  min?: number;
  max?: number;
  step?: number;
  options?: { value: string; label: string }[];
  tooltip: string;
  unit?: string;
  hasToggle?: boolean;
  toggleKey?: string;
}

export const LSR_PARAM_SECTIONS = [
  'Structure',
  'Location and Pool',
  'Entry',
  'Stop and Targets',
  'Exit Rules',
  'Fees'
] as const;

export const LSR_PARAMS: LsrParamDef[] = [
  // ── Structure ────────────────────────────────────────────────────────────
  {
    key: 'executionTimeframe',
    label: 'Execution Timeframe',
    section: 'Structure',
    type: 'select',
    options: [
      { value: '5m', label: '5m (Primary - Tight Invalidation)' },
      { value: '15m', label: '15m (Balanced Reversals)' },
      { value: '1H', label: '1H (Macro Swing Sweeps)' }
    ],
    tooltip: 'Candle timeframe where sweep and micro-structure reacceptance are confirmed.'
  },
  {
    key: 'contextTimeframe',
    label: 'Context Timeframe',
    section: 'Structure',
    type: 'select',
    options: [
      { value: '15m', label: '15m (Recommended HTF)' },
      { value: '1H', label: '1H (Macro Trend Confirmation)' },
      { value: '4H', label: '4H (Major Daily Bounds)' }
    ],
    tooltip: 'Higher timeframe used for macro range boundaries and major liquidity pools.'
  },
  {
    key: 'structureLookback',
    label: 'Structure Lookback (Bars)',
    section: 'Structure',
    type: 'number',
    min: 20,
    max: 100,
    step: 5,
    unit: 'bars',
    tooltip: 'Number of closed bars scanned to map swing highs/lows and equal level clusters.'
  },
  {
    key: 'sweepMinAtr',
    label: 'Min Sweep Depth (ATR)',
    section: 'Structure',
    type: 'number',
    min: 0.05,
    max: 0.50,
    step: 0.05,
    unit: 'ATR',
    tooltip: 'Minimum penetration beyond the pool required to classify as a genuine sweep.'
  },
  {
    key: 'sweepMaxAtr',
    label: 'Max Sweep Depth (ATR)',
    section: 'Structure',
    type: 'number',
    min: 0.5,
    max: 2.5,
    step: 0.1,
    unit: 'ATR',
    tooltip: 'Maximum allowable sweep depth; sweeps exceeding this are rejected as runaway breakouts.'
  },
  {
    key: 'maxReacceptanceBars',
    label: 'Max Reacceptance Bars',
    section: 'Structure',
    type: 'number',
    min: 1,
    max: 3,
    step: 1,
    unit: 'bars',
    tooltip: 'Maximum closed bars allowed to close back inside the liquidity level (Strict: 1, Relaxed: 2).'
  },
  {
    key: 'trackConsumedPools',
    label: 'Track Consumed Pools (Single-Use)',
    section: 'Structure',
    type: 'boolean',
    tooltip: 'Retire liquidity levels after first sweep to prevent re-trading exhausted zones.'
  },

  // ── Location and Pool ────────────────────────────────────────────────────
  {
    key: 'locationGate.enabled',
    label: 'Location Gate',
    section: 'Location and Pool',
    type: 'boolean',
    tooltip: 'Restricts trades to range extremes (longs in bottom edge, shorts in top edge).'
  },
  {
    key: 'locationGate.edgePct',
    label: 'Range Edge Percentile (%)',
    section: 'Location and Pool',
    type: 'number',
    min: 10,
    max: 50,
    step: 1,
    unit: '%',
    tooltip: 'Shorts only in top edgePct% of range; longs only in bottom edgePct% (Balanced: 35%).'
  },
  {
    key: 'locationGate.rangeTimeframe',
    label: 'Range Measurement Timeframe',
    section: 'Location and Pool',
    type: 'select',
    options: [
      { value: 'context', label: 'Context Timeframe (15m)' },
      { value: 'execution', label: 'Execution Timeframe (5m)' }
    ],
    tooltip: 'Measure range height on context TF (15m) to avoid noisy 5m chop.'
  },
  {
    key: 'poolSource.timeframe',
    label: 'Pool Source Timeframe',
    section: 'Location and Pool',
    type: 'select',
    options: [
      { value: 'context', label: 'Context Timeframe (15m)' },
      { value: 'execution', label: 'Execution Timeframe (5m)' }
    ],
    tooltip: 'Identify high-probability institutional liquidity pools on context TF.'
  },
  {
    key: 'poolQuality.enabled',
    label: 'Pool Quality Gate',
    section: 'Location and Pool',
    type: 'boolean',
    tooltip: 'Filters out lone minor swings; requires verified multi-touch or session pools.'
  },
  {
    key: 'poolQuality.minScore',
    label: 'Min Pool Quality Score',
    section: 'Location and Pool',
    type: 'number',
    min: 1,
    max: 4,
    step: 1,
    tooltip: 'Score threshold (1: allows all, 2: rejects lone swings, 3: requires equal highs/lows).'
  },
  {
    key: 'poolQuality.eqTolAtr',
    label: 'Equal High/Low Tolerance (ATR)',
    section: 'Location and Pool',
    type: 'number',
    min: 0.02,
    max: 0.30,
    step: 0.01,
    unit: 'ATR',
    tooltip: 'Two swing pivots within this ATR distance count as institutional equal highs/lows.'
  },

  // ── Entry ────────────────────────────────────────────────────────────────
  {
    key: 'entryMode',
    label: 'Entry Trigger Mode',
    section: 'Entry',
    type: 'select',
    options: [
      { value: 'SWEPT_LEVEL', label: 'Swept Level Retest: Limit order at exact pool line' },
      { value: 'MIDPOINT_LIMIT', label: 'C0 Midpoint (50%): Limit at 50% body of C0 rejection candle' },
      { value: 'C0_CLOSE', label: 'Immediate: Market fill on C0 candle reacceptance close' },
      { value: 'LITE_CLOSE', label: 'Lite: Market entry upon closed candle beyond C0 extreme' },
      { value: 'DEFAULT_FVG', label: 'Default: MSS close + 50% FVG retest limit' }
    ],
    tooltip: 'Determines the execution fill trigger and limit order placement.'
  },
  {
    key: 'starShape.enabled',
    label: 'Star Shape Rejection Gate',
    section: 'Entry',
    type: 'boolean',
    tooltip: 'Requires C0 candle to form a clear shooting star or hammer rejection wick.'
  },
  {
    key: 'starShape.wickToBody',
    label: 'Min Wick-to-Body Ratio',
    section: 'Entry',
    type: 'number',
    min: 1.0,
    max: 4.0,
    step: 0.1,
    unit: 'x',
    tooltip: 'Rejection wick must be at least this multiple of candle body (Balanced: 1.5x).'
  },
  {
    key: 'starShape.wickToRange',
    label: 'Min Wick-to-Range Ratio',
    section: 'Entry',
    type: 'number',
    min: 0.30,
    max: 0.80,
    step: 0.05,
    unit: '%',
    tooltip: 'Rejection wick must account for at least this share of full candle range (Balanced: 50%).'
  },
  {
    key: 'volumeGate.enabled',
    label: 'Volume Absorption Gate',
    section: 'Entry',
    type: 'boolean',
    tooltip: 'Requires sweep candle volume spike confirming institutional absorption.'
  },
  {
    key: 'volumeGate.volMultiple',
    label: 'Volume Multiplier (x SMA20)',
    section: 'Entry',
    type: 'number',
    min: 1.0,
    max: 3.0,
    step: 0.1,
    unit: 'x',
    tooltip: 'Sweep bar volume must exceed this multiple of 20-period volume SMA (Balanced: 1.2x).'
  },

  // ── Stop and Targets ─────────────────────────────────────────────────────
  {
    key: 'minStructuralRR',
    label: 'Min Structural R:R',
    section: 'Stop and Targets',
    type: 'number',
    min: 1.5,
    max: 6.0,
    step: 0.1,
    unit: 'R',
    tooltip: 'Minimum structural risk/reward ratio to opposing pool (Balanced: 3.5).'
  },
  {
    key: 'finalTpR',
    label: 'Final Take-Profit (R)',
    section: 'Stop and Targets',
    type: 'number',
    min: 1.5,
    max: 6.0,
    step: 0.1,
    unit: 'R',
    tooltip: 'Full position exit target in R-multiples (Balanced: 3.5R).'
  },
  {
    key: 'roomCheck.enabled',
    label: 'Room Check Gate',
    section: 'Stop and Targets',
    type: 'boolean',
    tooltip: 'Skip trade if nearest untapped opposing pool is closer than minStructuralRR x risk.'
  },
  {
    key: 'sl.atrBuffer',
    label: 'Stop Loss ATR Buffer',
    section: 'Stop and Targets',
    type: 'number',
    min: 0.0,
    max: 0.50,
    step: 0.05,
    unit: 'ATR',
    tooltip: 'Placed beyond sweep extreme: extreme +- max(buffer x ATR, 3 ticks) (Balanced: 0.15).'
  },
  {
    key: 'sl.triggerPrice',
    label: 'SL Trigger Price Type',
    section: 'Stop and Targets',
    type: 'select',
    options: [
      { value: 'mark', label: 'Mark Price (Anti-Wick Manipulation)' },
      { value: 'last', label: 'Last Traded Price' }
    ],
    tooltip: 'Trigger type for exchange stop-market order.'
  },

  // ── Exit Rules ───────────────────────────────────────────────────────────
  {
    key: 'timeStop.enabled',
    label: 'Time Stop (Progress Exit)',
    section: 'Exit Rules',
    type: 'boolean',
    tooltip: 'Market exit if trade fails to reach min progress after N closed bars.'
  },
  {
    key: 'timeStop.bars',
    label: 'Time Stop Bar Limit',
    section: 'Exit Rules',
    type: 'number',
    min: 3,
    max: 30,
    step: 1,
    unit: 'bars',
    tooltip: 'Closed bars after entry before progress exit check evaluates (Balanced: 8 bars).'
  },
  {
    key: 'timeStop.minProgressR',
    label: 'Min Progress Threshold (R)',
    section: 'Exit Rules',
    type: 'number',
    min: 0.1,
    max: 2.0,
    step: 0.1,
    unit: 'R',
    tooltip: 'If best favorable closed excursion is below this R after N bars, exit at market.'
  },
  {
    key: 'partialTp1Enabled',
    label: 'Partial TP1 Scale-Out',
    section: 'Exit Rules',
    type: 'boolean',
    tooltip: 'Lock in 25% at opposing liquidity pool and move stop loss to breakeven.'
  },

  // ── Fees ─────────────────────────────────────────────────────────────────
  {
    key: 'feeFloor.enabled',
    label: 'Fee Floor Gate',
    section: 'Fees',
    type: 'boolean',
    tooltip: 'Skips trade if stop distance % < roundTripFeePct / divisor to avoid fee drag.'
  },
  {
    key: 'feeFloor.roundTripFeePct',
    label: 'Round-Trip Fee %',
    section: 'Fees',
    type: 'number',
    min: 0.0,
    max: 1.0,
    step: 0.01,
    unit: '%',
    tooltip: 'Exchange futures taker fee + slippage allowance per round trip (default: 0.177%).'
  },
  {
    key: 'feeFloor.divisor',
    label: 'Fee Floor Divisor',
    section: 'Fees',
    type: 'number',
    min: 0.05,
    max: 0.50,
    step: 0.01,
    tooltip: 'Divisor threshold for minimum stop distance: stopPct must exceed fee / divisor (default: 0.20).'
  }
];

/**
 * Validates a configuration object before saving
 */
export function validateLsrConfig(cfg: LsrV2Config): string[] {
  const errs: string[] = [];

  if (cfg.minStructuralRR < 1.0 || cfg.minStructuralRR > 10) {
    errs.push('minStructuralRR must be between 1.0 and 10.0');
  }
  if (cfg.finalTpR < 1.0 || cfg.finalTpR > 10) {
    errs.push('finalTpR must be between 1.0 and 10.0');
  }
  if (cfg.locationGate.edgePct < 5 || cfg.locationGate.edgePct > 50) {
    errs.push('locationGate.edgePct must be between 5% and 50%');
  }
  if (cfg.poolQuality.minScore < 1 || cfg.poolQuality.minScore > 5) {
    errs.push('poolQuality.minScore must be between 1 and 5');
  }
  if (cfg.poolQuality.eqTolAtr <= 0 || cfg.poolQuality.eqTolAtr > 0.5) {
    errs.push('poolQuality.eqTolAtr must be between 0.01 and 0.50 ATR');
  }
  if (cfg.timeStop.bars < 1 || cfg.timeStop.bars > 50) {
    errs.push('timeStop.bars must be between 1 and 50');
  }
  if (cfg.timeStop.minProgressR <= 0 || cfg.timeStop.minProgressR > 5) {
    errs.push('timeStop.minProgressR must be positive and <= 5.0R');
  }
  if (cfg.sl.atrBuffer < 0 || cfg.sl.atrBuffer > 1.0) {
    errs.push('sl.atrBuffer must be between 0 and 1.0 ATR');
  }
  if (cfg.feeFloor.roundTripFeePct < 0 || cfg.feeFloor.roundTripFeePct > 2.0) {
    errs.push('feeFloor.roundTripFeePct must be between 0% and 2.0%');
  }
  if (cfg.feeFloor.divisor <= 0 || cfg.feeFloor.divisor > 1.0) {
    errs.push('feeFloor.divisor must be between 0.01 and 1.0');
  }
  if (cfg.sweepMinAtr >= cfg.sweepMaxAtr) {
    errs.push('sweepMinAtr must be strictly less than sweepMaxAtr');
  }
  return errs;
}

/**
 * Normalizes an app settings object to guarantee a complete LsrV2Config
 */
export function resolveLsrConfig(rawSettings?: any): LsrV2Config {
  const base = { ...LSR_PRESETS.Balanced };
  if (!rawSettings) return base;

  const candidate: any = rawSettings.lsrV2Config || {};

  return {
    configVersion: candidate.configVersion || 'LSR_V2.0',
    preset: candidate.preset || (rawSettings.lsrStrictMode ? 'Strict' : 'Balanced'),

    executionTimeframe: candidate.executionTimeframe || rawSettings.lsrExecutionTimeframe || base.executionTimeframe,
    contextTimeframe: candidate.contextTimeframe || rawSettings.lsrContextTimeframe || base.contextTimeframe,
    structureLookback: candidate.structureLookback ?? rawSettings.lsrStructureLookback ?? base.structureLookback,
    sweepMinAtr: candidate.sweepMinAtr ?? rawSettings.lsrSweepMinAtr ?? base.sweepMinAtr,
    sweepMaxAtr: candidate.sweepMaxAtr ?? rawSettings.lsrSweepMaxAtr ?? base.sweepMaxAtr,
    maxReacceptanceBars: candidate.maxReacceptanceBars ?? rawSettings.lsrMaxReacceptanceBars ?? base.maxReacceptanceBars,
    trackConsumedPools: candidate.trackConsumedPools ?? rawSettings.lsrTrackConsumedPools ?? base.trackConsumedPools,

    locationGate: {
      enabled: candidate.locationGate?.enabled ?? rawSettings.lsrLocationGateEnabled ?? base.locationGate.enabled,
      edgePct: candidate.locationGate?.edgePct ?? rawSettings.lsrEdgePct ?? base.locationGate.edgePct,
      rangeTimeframe: candidate.locationGate?.rangeTimeframe || rawSettings.lsrRangeTimeframe || base.locationGate.rangeTimeframe
    },
    poolSource: {
      timeframe: candidate.poolSource?.timeframe || rawSettings.lsrPoolSourceTimeframe || base.poolSource.timeframe
    },
    poolQuality: {
      enabled: candidate.poolQuality?.enabled ?? rawSettings.lsrPoolQualityEnabled ?? base.poolQuality.enabled,
      minScore: candidate.poolQuality?.minScore ?? rawSettings.lsrMinLiquidityScore ?? base.poolQuality.minScore,
      eqTolAtr: candidate.poolQuality?.eqTolAtr ?? rawSettings.lsrEqTolAtr ?? base.poolQuality.eqTolAtr,
      scores: {
        equalHighsLows: candidate.poolQuality?.scores?.equalHighsLows ?? 3,
        prevDayHighLow: candidate.poolQuality?.scores?.prevDayHighLow ?? 2,
        sessionHighLow: candidate.poolQuality?.scores?.sessionHighLow ?? 2,
        prevWeekHighLow: candidate.poolQuality?.scores?.prevWeekHighLow ?? 2,
        singleSwing: candidate.poolQuality?.scores?.singleSwing ?? 1
      }
    },

    entryMode: candidate.entryMode || rawSettings.lsrConfirmationTrigger || base.entryMode,
    starShape: {
      enabled: candidate.starShape?.enabled ?? rawSettings.lsrStarShapeEnabled ?? base.starShape.enabled,
      wickToBody: candidate.starShape?.wickToBody ?? rawSettings.lsrMinWickBodyRatio ?? base.starShape.wickToBody,
      wickToRange: candidate.starShape?.wickToRange ?? rawSettings.lsrMinWickRangeRatio ?? base.starShape.wickToRange
    },
    volumeGate: {
      enabled: candidate.volumeGate?.enabled ?? rawSettings.lsrVolumeGateEnabled ?? base.volumeGate.enabled,
      volMultiple: candidate.volumeGate?.volMultiple ?? rawSettings.lsrVolMult ?? base.volumeGate.volMultiple
    },

    minStructuralRR: candidate.minStructuralRR ?? rawSettings.lsrMinRR ?? base.minStructuralRR,
    finalTpR: candidate.finalTpR ?? rawSettings.lsrFinalTpR ?? base.finalTpR,
    roomCheck: {
      enabled: candidate.roomCheck?.enabled ?? rawSettings.lsrRoomCheckEnabled ?? base.roomCheck.enabled
    },
    sl: {
      atrBuffer: candidate.sl?.atrBuffer ?? rawSettings.lsrSlBufferAtr ?? base.sl.atrBuffer,
      triggerPrice: candidate.sl?.triggerPrice || rawSettings.lsrSlTriggerPrice || base.sl.triggerPrice
    },

    timeStop: {
      enabled: candidate.timeStop?.enabled ?? rawSettings.lsrTimeStopEnabled ?? base.timeStop.enabled,
      bars: candidate.timeStop?.bars ?? rawSettings.lsrTimeStopBars ?? base.timeStop.bars,
      minProgressR: candidate.timeStop?.minProgressR ?? rawSettings.lsrTimeStopMinProgressR ?? base.timeStop.minProgressR
    },
    partialTp1Enabled: candidate.partialTp1Enabled ?? true,
    partialTp1ClosePct: candidate.partialTp1ClosePct ?? 0.25,

    feeFloor: {
      enabled: candidate.feeFloor?.enabled ?? rawSettings.lsrFeeFloorEnabled ?? base.feeFloor.enabled,
      roundTripFeePct: candidate.feeFloor?.roundTripFeePct ?? rawSettings.lsrRoundTripFeePct ?? base.feeFloor.roundTripFeePct,
      divisor: candidate.feeFloor?.divisor ?? rawSettings.lsrFeeStopFactor ?? base.feeFloor.divisor
    }
  };
}
