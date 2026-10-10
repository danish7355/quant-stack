/**
 * LIQUIDITY SWEEP REVERSAL: config contract (regime-gated, nothing hardcoded)
 *
 * RULE FOR THE IMPLEMENTING AGENT
 *   Strategy code may not contain a literal threshold, timeframe, multiplier
 *   or regime label. Every value comes from resolveConfig(). Precedence,
 *   last wins:
 *     BASE (= balanced)  <  MODE preset  <  HABITAT override/adjust  <  UI override
 *   BASE, MODES, HABITATS and REGIME_MAP are only the seeded defaults. Persist
 *   them in the settings store and expose every field in the Settings tab.
 *
 * PIPELINE (per symbol, on the execution timeframe, evaluated on candle close)
 *   1. Regime gate      resolveConfig() returns ACTIVE or STANDBY(reason).
 *   2. Direction bias   from the direction timeframe (trend = its direction,
 *                       range/compression = neutral, both sides allowed).
 *   3. Liquidity map    rank untouched pools (see PoolType) with a 0-100 score:
 *                       weights[type] + touchBonus*(touches-1), capped at 100.
 *   4. Sweep            wick takes the pool by sweep.minDepthATR..maxDepthATR
 *                       and price closes back inside within reclaimWithinBars.
 *   5. Rejection candle hammer (long) / shooting star (short): wick, body and
 *                       close-location limits from `trigger`. Its extreme must
 *                       be the sweep extreme.
 *   6. Confirmation     within confirm.windowBars the next candle must engulf
 *                       per confirm.engulf. A close back beyond the sweep
 *                       extreme cancels the setup.
 *   7. Risk gates       stop distance, RR to target, fee cost in R.
 *   8. Entry            on the confirmation candle's close. Stop beyond the
 *                       sweep extreme + stopBufferATR*ATR.
 *
 * FEES: feeRoundTripPct must be read from the app's fee model (taker per side
 * x2, plus GST on the fees). Never copy a number into this file.
 */

export type Mode = 'strict' | 'balanced' | 'aggressive';
export type Habitat = 'range' | 'trend' | 'compression' | 'expansion' | 'chaos' | 'transition';
export type PoolType = 'prevWeekHL' | 'prevDayHL' | 'sessionHL' | 'rangeEdge' | 'equalHL' | 'swingHL';

/**
 * Bullish example (mirror for shorts):
 *  'range'         confirmation closes above the rejection candle's HIGH and its body engulfs the rejection body
 *  'body'          confirmation body engulfs the rejection candle's body (bullish candle)
 *  'close_through' bullish confirmation closes above the rejection candle's body top
 */
export type EngulfMode = 'range' | 'body' | 'close_through';

export interface SweepConfig {
  atrPeriod: number;
  timeframes: { execution: string; direction: string; liquidity: string[] };
  regime: {
    minConfidence: number; // 0-100, from the regime engine
    stabilityBars: number; // regime must hold this many execution bars before activation
    btcEthAlignment: 'both_agree' | 'btc_not_opposing' | 'off';
    onExit: 'manage' | 'tighten' | 'close'; // what open trades do when the regime leaves favour
  };
  universe: { maxRank: number }; // rank inside the app's top-100 universe
  pools: {
    minScore: number;
    weights: Record<PoolType, number>;
    touchBonus: number;
    equalLevelTolATR: number; // tolerance for equal highs/lows
    pivotBars: number; // fractal width for swing pools
    maxAgeBars: number;
  };
  sweep: {
    minDepthATR: number;
    maxDepthATR: number; // deeper than this = real breakout, not a sweep
    reclaimWithinBars: number; // 1 = the sweep candle itself must close back inside
    minRelVolume: number; // sweep candle volume / SMA(volume)
    volumeLookback: number;
  };
  trigger: {
    minWickToRange: number; // rejection wick / candle range
    maxOppWickToRange: number;
    maxBodyToRange: number;
    minCloseLocation: number; // close position inside the range, from the swept side
    minRangeATR: number; // ignore tiny candles
  };
  confirm: { windowBars: number; engulf: EngulfMode; minBodyATR: number };
  direction: { counterBiasAllowed: boolean; counterBiasRiskMult: number; edgeZonePct: number };
  risk: {
    riskMult: number; // multiplies the app's per-trade risk setting
    stopBufferATR: number;
    minStopATR: number;
    maxStopATR: number;
    minRR: number;
    maxFeeToRisk: number; // reject if round-trip fees exceed this many R
  };
  exits: {
    tp1: { basis: 'r_multiple' | 'range_mid'; r: number; closePct: number };
    tp2: { basis: 'opposite_pool' | 'range_edge' };
    moveToBEAfterTp1: boolean; // break-even plus fee buffer
    trail: 'off' | 'structure';
    timeStopBars: number;
  };
  frequency: { cooldownBarsAfterLoss: number; maxPerSymbolPerDay: number };
}

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends any[] ? T[K] : T[K] extends object ? DeepPartial<T[K]> : T[K];
};

/** Reason codes for the Rejects / Signals tabs and the dashboard's STANDBY badge. */
export const REJECT_REASONS = [
  'REGIME_STANDBY', 'REGIME_LOW_CONF', 'REGIME_UNSTABLE', 'OUT_OF_UNIVERSE',
  'POOL_WEAK', 'SWEEP_TOO_SHALLOW', 'SWEEP_TOO_DEEP', 'NO_RECLAIM', 'LOW_VOLUME',
  'TRIGGER_INVALID', 'NO_ENGULF', 'CONFIRM_EXPIRED',
  'AGAINST_BIAS', 'BTC_ETH_CONFLICT', 'OUTSIDE_EDGE_ZONE',
  'STOP_TOO_TIGHT', 'STOP_TOO_WIDE', 'RR_TOO_LOW', 'FEES_TOO_HIGH',
  'COOLDOWN', 'DAILY_CAP',
] as const;
export type RejectReason = (typeof REJECT_REASONS)[number];

/** BASE equals the balanced preset. */
export const BASE: SweepConfig = {
  atrPeriod: 14,
  timeframes: { execution: '15m', direction: '1h', liquidity: ['1h', '4h', '1d'] },
  regime: { minConfidence: 55, stabilityBars: 2, btcEthAlignment: 'btc_not_opposing', onExit: 'tighten' },
  universe: { maxRank: 60 },
  pools: {
    minScore: 55,
    weights: { prevWeekHL: 100, prevDayHL: 90, rangeEdge: 85, equalHL: 75, sessionHL: 70, swingHL: 55 },
    touchBonus: 5,
    equalLevelTolATR: 0.1,
    pivotBars: 3,
    maxAgeBars: 400,
  },
  sweep: { minDepthATR: 0.06, maxDepthATR: 1.8, reclaimWithinBars: 2, minRelVolume: 1.2, volumeLookback: 20 },
  trigger: { minWickToRange: 0.5, maxOppWickToRange: 0.3, maxBodyToRange: 0.4, minCloseLocation: 0.6, minRangeATR: 0.5 },
  confirm: { windowBars: 1, engulf: 'body', minBodyATR: 0.35 },
  direction: { counterBiasAllowed: false, counterBiasRiskMult: 0.5, edgeZonePct: 20 },
  risk: { riskMult: 1, stopBufferATR: 0.2, minStopATR: 0.5, maxStopATR: 2.5, minRR: 1.6, maxFeeToRisk: 0.2 },
  exits: {
    tp1: { basis: 'r_multiple', r: 1.0, closePct: 50 },
    tp2: { basis: 'opposite_pool' },
    moveToBEAfterTp1: true,
    trail: 'off',
    timeStopBars: 16,
  },
  frequency: { cooldownBarsAfterLoss: 5, maxPerSymbolPerDay: 4 },
};

export const MODES: Record<Mode, DeepPartial<SweepConfig>> = {
  strict: {
    timeframes: { execution: '15m', direction: '4h' },
    regime: { minConfidence: 70, stabilityBars: 3, btcEthAlignment: 'both_agree' },
    universe: { maxRank: 30 },
    pools: { minScore: 70 },
    sweep: { minDepthATR: 0.1, maxDepthATR: 1.2, reclaimWithinBars: 1, minRelVolume: 1.5 },
    trigger: { minWickToRange: 0.6, maxOppWickToRange: 0.2, maxBodyToRange: 0.35, minCloseLocation: 0.7, minRangeATR: 0.6 },
    confirm: { windowBars: 1, engulf: 'range', minBodyATR: 0.5 },
    direction: { counterBiasAllowed: false, edgeZonePct: 15 },
    risk: { stopBufferATR: 0.25, minStopATR: 0.6, maxStopATR: 2.0, minRR: 2.0, maxFeeToRisk: 0.15 },
    exits: { tp1: { closePct: 40 }, timeStopBars: 20 },
    frequency: { cooldownBarsAfterLoss: 8, maxPerSymbolPerDay: 3 },
  },
  balanced: {},
  aggressive: {
    timeframes: { execution: '5m', direction: '1h' },
    regime: { minConfidence: 40, stabilityBars: 1, btcEthAlignment: 'off' },
    universe: { maxRank: 100 },
    pools: { minScore: 40 },
    sweep: { minDepthATR: 0.03, maxDepthATR: 2.5, reclaimWithinBars: 3, minRelVolume: 1.0 },
    trigger: { minWickToRange: 0.4, maxOppWickToRange: 0.35, maxBodyToRange: 0.5, minCloseLocation: 0.5, minRangeATR: 0.4 },
    confirm: { windowBars: 2, engulf: 'close_through', minBodyATR: 0.2 },
    direction: { counterBiasAllowed: true, counterBiasRiskMult: 0.5, edgeZonePct: 30 },
    risk: { riskMult: 0.75, stopBufferATR: 0.15, minStopATR: 0.4, maxStopATR: 3.0, minRR: 1.3, maxFeeToRisk: 0.25 },
    exits: { tp1: { closePct: 60 }, timeStopBars: 12 },
    frequency: { cooldownBarsAfterLoss: 3, maxPerSymbolPerDay: 6 },
  },
};

export interface HabitatProfile {
  enabledIn: Mode[]; // empty array = always STANDBY in this habitat
  overrides: DeepPartial<SweepConfig>;
  adjust: { minRRDelta: number; timeStopMult: number; riskMult: number };
}

const ALL_MODES: Mode[] = ['strict', 'balanced', 'aggressive'];

export const HABITATS: Record<Habitat, HabitatProfile> = {
  // Primary habitat: sweeps of range edges and equal highs/lows revert to the range.
  range: {
    enabledIn: ALL_MODES,
    overrides: { exits: { tp1: { basis: 'range_mid' }, tp2: { basis: 'range_edge' }, trail: 'off' } },
    adjust: { minRRDelta: 0, timeStopMult: 0.75, riskMult: 1 },
  },
  // Pullback sweeps in the trend direction: hold longer, trail the runner.
  trend: {
    enabledIn: ALL_MODES,
    overrides: { exits: { tp1: { basis: 'r_multiple' }, tp2: { basis: 'opposite_pool' }, trail: 'structure' } },
    adjust: { minRRDelta: 0.3, timeStopMult: 1.5, riskMult: 1 },
  },
  // Coil-edge sweeps often precede the real break, so only aggressive mode, at half size.
  compression: {
    enabledIn: ['aggressive'],
    overrides: { exits: { tp1: { basis: 'range_mid' }, tp2: { basis: 'range_edge' }, trail: 'off' } },
    adjust: { minRRDelta: 0, timeStopMult: 0.75, riskMult: 0.5 },
  },
  // A reversal against momentum or chaos: stand by.
  expansion: { enabledIn: [], overrides: {}, adjust: { minRRDelta: 0, timeStopMult: 1, riskMult: 1 } },
  chaos: { enabledIn: [], overrides: {}, adjust: { minRRDelta: 0, timeStopMult: 1, riskMult: 1 } },
  transition: { enabledIn: [], overrides: {}, adjust: { minRRDelta: 0, timeStopMult: 1, riskMult: 1 } },
};

/**
 * Map the regime engine's own labels to habitats. Replace the keys with the
 * labels your engine actually emits and let the UI edit them.
 * An unknown label falls back to 'transition' => STANDBY (fail safe).
 */
export const REGIME_MAP: Record<string, Habitat> = {
  RANGE: 'range',
  RANGING: 'range',
  RANGE_BOUND: 'range',
  RANGE_CHOP: 'range',
  TREND_UP: 'trend',
  TREND_DOWN: 'trend',
  TRENDING_UP: 'trend',
  TRENDING_DOWN: 'trend',
  BULL_TREND: 'trend',
  BEAR_TREND: 'trend',
  COMPRESSION: 'compression',
  EXPANSION: 'expansion',
  HIGH_VOL: 'chaos',
  CHAOS: 'chaos',
  PANIC: 'chaos',
  TRANSITION: 'transition',
};

export type Resolved =
  | { status: 'STANDBY'; habitat: Habitat; reason: RejectReason; config?: SweepConfig }
  | { status: 'ACTIVE'; habitat: Habitat; cfg: SweepConfig };

export function merge<T>(base: T, patch: DeepPartial<T>): T {
  const out: any = Array.isArray(base) ? [...(base as any)] : { ...(base as any) };
  for (const k in patch) {
    const v = (patch as any)[k];
    if (v === undefined) continue;
    out[k] = v && typeof v === 'object' && !Array.isArray(v) ? merge((base as any)[k], v) : v;
  }
  return out;
}

export function resolveConfig(opts: {
  mode: Mode;
  regimeLabel: string;
  regimeConfidence: number; // from the regime engine
  regimeStableBars: number; // bars the current regime has held
  regimeMap?: Record<string, Habitat>;
  habitats?: Record<Habitat, HabitatProfile>;
  uiOverrides?: DeepPartial<SweepConfig>;
}): Resolved {
  const habitat = (opts.regimeMap ?? REGIME_MAP)[opts.regimeLabel] ?? 'transition';
  const profile = (opts.habitats ?? HABITATS)[habitat] ?? HABITATS.transition;
  if (!profile.enabledIn.includes(opts.mode)) {
    return { status: 'STANDBY', habitat, reason: 'REGIME_STANDBY', config: getPresetConfig(opts.mode) };
  }

  let cfg = merge(merge(BASE, MODES[opts.mode]), profile.overrides);
  cfg = JSON.parse(JSON.stringify(cfg)) as SweepConfig; // detach from shared defaults
  cfg.risk.minRR = Math.round((cfg.risk.minRR + profile.adjust.minRRDelta) * 100) / 100;
  cfg.risk.riskMult = Math.round(cfg.risk.riskMult * profile.adjust.riskMult * 1000) / 1000;
  cfg.exits.timeStopBars = Math.round(cfg.exits.timeStopBars * profile.adjust.timeStopMult);
  cfg = merge(cfg, opts.uiOverrides ?? {}); // the user's explicit values always win

  if (opts.regimeConfidence < cfg.regime.minConfidence) {
    return { status: 'STANDBY', habitat, reason: 'REGIME_LOW_CONF', config: cfg };
  }
  if (opts.regimeStableBars < cfg.regime.stabilityBars) {
    return { status: 'STANDBY', habitat, reason: 'REGIME_UNSTABLE', config: cfg };
  }
  return { status: 'ACTIVE', habitat, cfg };
}

/** Returns the raw preset SweepConfig for a mode without habitat adjust or overrides. */
export function getPresetConfig(mode: Mode): SweepConfig {
  const cfg = merge(BASE, MODES[mode]);
  return JSON.parse(JSON.stringify(cfg)) as SweepConfig;
}

/** Computes the effective SweepConfig for a mode under the current regime, with habitat overrides and adjustments applied. */
export function getEffectiveConfig(
  mode: Mode,
  regimeLabel: string,
  habitats?: Record<Habitat, HabitatProfile>,
  regimeMap?: Record<string, Habitat>
): { cfg: SweepConfig; habitat: Habitat; active: boolean; reason?: RejectReason } {
  const habitat = (regimeMap ?? REGIME_MAP)[regimeLabel] ?? 'transition';
  const profile = (habitats ?? HABITATS)[habitat] ?? HABITATS.transition;
  const active = profile.enabledIn.includes(mode);

  let cfg = merge(merge(BASE, MODES[mode]), profile.overrides);
  cfg = JSON.parse(JSON.stringify(cfg)) as SweepConfig;
  cfg.risk.minRR = Math.round((cfg.risk.minRR + profile.adjust.minRRDelta) * 100) / 100;
  cfg.risk.riskMult = Math.round(cfg.risk.riskMult * profile.adjust.riskMult * 1000) / 1000;
  cfg.exits.timeStopBars = Math.round(cfg.exits.timeStopBars * profile.adjust.timeStopMult);

  return {
    cfg,
    habitat,
    active,
    reason: active ? undefined : 'REGIME_STANDBY'
  };
}

/** Safely extracts a nested property using dot-notation. */
export function getNestedValue(obj: any, path: string): any {
  if (!obj || typeof obj !== 'object') return undefined;
  const parts = path.split('.');
  let cur = obj;
  for (const p of parts) {
    if (cur === undefined || cur === null) return undefined;
    cur = cur[p];
  }
  return cur;
}

/** Sets a nested property in a sparse override object, returning a new detached object. */
export function setNestedOverride(overrides: DeepPartial<SweepConfig> | undefined, path: string, value: any): DeepPartial<SweepConfig> {
  const root = JSON.parse(JSON.stringify(overrides || {}));
  const parts = path.split('.');
  let cur = root;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    if (!cur[p] || typeof cur[p] !== 'object' || Array.isArray(cur[p])) {
      cur[p] = {};
    }
    cur = cur[p];
  }
  cur[parts[parts.length - 1]] = value;
  return root;
}

/** Removes a property from a sparse override object, cleaning up empty parent objects. */
export function deleteNestedOverride(overrides: DeepPartial<SweepConfig> | undefined, path: string): DeepPartial<SweepConfig> {
  const root = JSON.parse(JSON.stringify(overrides || {}));
  const parts = path.split('.');

  function remove(obj: any, idx: number): boolean {
    if (!obj || typeof obj !== 'object') return false;
    const key = parts[idx];
    if (idx === parts.length - 1) {
      delete obj[key];
      return Object.keys(obj).length === 0;
    }
    const shouldDeleteChild = remove(obj[key], idx + 1);
    if (shouldDeleteChild) {
      delete obj[key];
    }
    return Object.keys(obj).length === 0;
  }

  remove(root, 0);
  return root;
}

export const TIMEFRAMES_MINUTES: Record<string, number> = {
  '1m': 1,
  '3m': 3,
  '5m': 5,
  '15m': 15,
  '30m': 30,
  '1h': 60,
  '2h': 120,
  '4h': 240,
  '6h': 360,
  '8h': 480,
  '12h': 720,
  '1d': 1440,
  '3d': 4320,
  '1w': 10080
};

export const SUPPORTED_TIMEFRAMES = ['1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '1d'] as const;

export function isTimeframeHigher(htf: string, ltf: string): boolean {
  const h = TIMEFRAMES_MINUTES[htf] ?? 0;
  const l = TIMEFRAMES_MINUTES[ltf] ?? 0;
  return h > l;
}

export interface SweepValidationResult {
  valid: boolean;
  errors: Record<string, string>;
  globalErrors: string[];
}

/** Validates SweepConfig according to Contract Section 4. */
export function validateSweepConfig(cfg: SweepConfig): SweepValidationResult {
  const errors: Record<string, string> = {};
  const globalErrors: string[] = [];

  // 1. Timeframe hierarchy: Direction must be higher than execution
  if (!isTimeframeHigher(cfg.timeframes.direction, cfg.timeframes.execution)) {
    const msg = `Direction timeframe (${cfg.timeframes.direction}) must be higher than execution timeframe (${cfg.timeframes.execution}).`;
    errors['timeframes.direction'] = msg;
    globalErrors.push(msg);
  }

  // 2. Depths: minDepth < maxDepth
  if (cfg.sweep.minDepthATR >= cfg.sweep.maxDepthATR) {
    const msg = `Min sweep depth (${cfg.sweep.minDepthATR} ATR) must be strictly less than max sweep depth (${cfg.sweep.maxDepthATR} ATR).`;
    errors['sweep.minDepthATR'] = msg;
    errors['sweep.maxDepthATR'] = msg;
    globalErrors.push(msg);
  }

  // 3. Stops: minStop < maxStop
  if (cfg.risk.minStopATR >= cfg.risk.maxStopATR) {
    const msg = `Min stop distance (${cfg.risk.minStopATR} ATR) must be strictly less than max stop distance (${cfg.risk.maxStopATR} ATR).`;
    errors['risk.minStopATR'] = msg;
    errors['risk.maxStopATR'] = msg;
    globalErrors.push(msg);
  }

  // 4. Ratios between 0 and 1
  if (cfg.trigger.minWickToRange < 0 || cfg.trigger.minWickToRange > 1) {
    errors['trigger.minWickToRange'] = 'Must be between 0 and 1.';
    globalErrors.push('Trigger min wick/range must be between 0 and 1.');
  }
  if (cfg.trigger.maxOppWickToRange < 0 || cfg.trigger.maxOppWickToRange > 1) {
    errors['trigger.maxOppWickToRange'] = 'Must be between 0 and 1.';
    globalErrors.push('Trigger max opposing wick/range must be between 0 and 1.');
  }
  if (cfg.trigger.maxBodyToRange < 0 || cfg.trigger.maxBodyToRange > 1) {
    errors['trigger.maxBodyToRange'] = 'Must be between 0 and 1.';
    globalErrors.push('Trigger max body/range must be between 0 and 1.');
  }
  if (cfg.trigger.minCloseLocation < 0 || cfg.trigger.minCloseLocation > 1) {
    errors['trigger.minCloseLocation'] = 'Must be between 0 and 1.';
    globalErrors.push('Trigger min close location must be between 0 and 1.');
  }

  // 5. Confirm window >= 1
  if (cfg.confirm.windowBars < 1) {
    errors['confirm.windowBars'] = 'Must be at least 1 bar.';
    globalErrors.push('Confirm window bars must be >= 1.');
  }

  // 6. Reclaim bars >= 1
  if (cfg.sweep.reclaimWithinBars < 1) {
    errors['sweep.reclaimWithinBars'] = 'Must be at least 1 bar.';
    globalErrors.push('Reclaim within bars must be >= 1.');
  }

  // 7. Close % between 0 and 100
  if (cfg.exits.tp1.closePct < 0 || cfg.exits.tp1.closePct > 100) {
    errors['exits.tp1.closePct'] = 'Must be between 0 and 100%.';
    globalErrors.push('TP1 close percentage must be between 0% and 100%.');
  }

  // 8. Pool weights between 0 and 100
  if (cfg.pools && cfg.pools.weights) {
    for (const [poolKey, weight] of Object.entries(cfg.pools.weights)) {
      if (typeof weight !== 'number' || weight < 0 || weight > 100) {
        errors[`pools.weights.${poolKey}`] = 'Must be between 0 and 100.';
        globalErrors.push(`Pool weight for ${poolKey} must be between 0 and 100.`);
      }
    }
  }

  return {
    valid: globalErrors.length === 0,
    errors,
    globalErrors
  };
}

/** Round-trip fee cost expressed in R. Compare against cfg.risk.maxFeeToRisk. */
export const feeCostInR = (feeRoundTripPct: number, stopDistancePct: number): number => {
  if (stopDistancePct <= 0) return 999;
  return feeRoundTripPct / stopDistancePct;
};

/**
 * Computes round-trip fee percentage directly from the application's venue fee model:
 * 2 * takerFee * (1 + GST/100).
 * Never hardcodes fee rates inside strategy logic.
 */
export function getAppFeeRoundTripPct(settings?: { feeTakerPct?: number; feeGstPct?: number; feeRoundTripPct?: number }): number {
  if (settings?.feeRoundTripPct !== undefined && settings.feeRoundTripPct > 0) {
    return settings.feeRoundTripPct;
  }
  const takerPct = settings?.feeTakerPct ?? 0.05;
  const gstPct = settings?.feeGstPct ?? 18;
  const roundTripPct = (takerPct * 2) * (1 + gstPct / 100);
  return roundTripPct; // e.g., 0.118 (as %)
}

/**
 * Maps the flat operator settings from the UI (TradingSettings.lsr*) into
 * a typed DeepPartial<SweepConfig> override structure.
 *
 * Honors Rule 1: Absolute Synchronization Between Frontend and Backend.
 * Any slider, input, or toggle modified by the user immediately takes precedence
 * over the preset values in resolveConfig().
 */
export function buildSweepUiOverrides(settings: any, currentMode?: Mode): DeepPartial<SweepConfig> {
  const overrides: DeepPartial<SweepConfig> = {};
  if (!settings || typeof settings !== 'object') return overrides;

  const mode: Mode = (currentMode || settings.liquiditySweepMode || 'balanced') as Mode;
  const sparseModeOverrides = (settings.liquiditySweepOverrides && settings.liquiditySweepOverrides[mode]) || {};

  // 1. Timeframes
  if (settings.lsrExecutionTf) {
    overrides.timeframes = overrides.timeframes || {} as any;
    overrides.timeframes!.execution = settings.lsrExecutionTf;
  }
  if (settings.lsrDirectionTf) {
    overrides.timeframes = overrides.timeframes || {} as any;
    overrides.timeframes!.direction = settings.lsrDirectionTf;
  }

  // 2. Regime
  if (typeof settings.lsrMinConfidence === 'number') {
    overrides.regime = overrides.regime || {} as any;
    overrides.regime!.minConfidence = settings.lsrMinConfidence;
  }
  if (typeof settings.lsrStabilityBars === 'number') {
    overrides.regime = overrides.regime || {} as any;
    overrides.regime!.stabilityBars = settings.lsrStabilityBars;
  }

  // 3. Universe
  if (typeof settings.lsrMaxRank === 'number') {
    overrides.universe = overrides.universe || {} as any;
    overrides.universe!.maxRank = settings.lsrMaxRank;
  }

  // 4. Pools
  if (typeof settings.lsrMinPoolScore === 'number') {
    overrides.pools = overrides.pools || {} as any;
    overrides.pools!.minScore = settings.lsrMinPoolScore;
  }

  // 5. Sweep
  if (typeof settings.lsrMinDepthAtr === 'number') {
    overrides.sweep = overrides.sweep || {} as any;
    overrides.sweep!.minDepthATR = settings.lsrMinDepthAtr;
  }
  if (typeof settings.lsrMaxDepthAtr === 'number') {
    overrides.sweep = overrides.sweep || {} as any;
    overrides.sweep!.maxDepthATR = settings.lsrMaxDepthAtr;
  }
  if (typeof settings.lsrReclaimWithinBars === 'number') {
    overrides.sweep = overrides.sweep || {} as any;
    overrides.sweep!.reclaimWithinBars = settings.lsrReclaimWithinBars;
  }
  if (typeof settings.lsrMinRelVolume === 'number') {
    overrides.sweep = overrides.sweep || {} as any;
    overrides.sweep!.minRelVolume = settings.lsrMinRelVolume;
  }

  // 6. Trigger
  if (typeof settings.lsrMinWickToRange === 'number') {
    overrides.trigger = overrides.trigger || {} as any;
    overrides.trigger!.minWickToRange = settings.lsrMinWickToRange;
  }
  if (typeof settings.lsrMaxOppWickToRange === 'number') {
    overrides.trigger = overrides.trigger || {} as any;
    overrides.trigger!.maxOppWickToRange = settings.lsrMaxOppWickToRange;
  }
  if (typeof settings.lsrMaxBodyToRange === 'number') {
    overrides.trigger = overrides.trigger || {} as any;
    overrides.trigger!.maxBodyToRange = settings.lsrMaxBodyToRange;
  }
  if (typeof settings.lsrMinCloseLocation === 'number') {
    overrides.trigger = overrides.trigger || {} as any;
    overrides.trigger!.minCloseLocation = settings.lsrMinCloseLocation;
  }
  if (typeof settings.lsrMinRangeAtr === 'number') {
    overrides.trigger = overrides.trigger || {} as any;
    overrides.trigger!.minRangeATR = settings.lsrMinRangeAtr;
  }

  // 7. Confirm
  if (typeof settings.lsrConfirmWindowBars === 'number') {
    overrides.confirm = overrides.confirm || {} as any;
    overrides.confirm!.windowBars = settings.lsrConfirmWindowBars;
  }
  if (settings.lsrConfirmEngulf) {
    overrides.confirm = overrides.confirm || {} as any;
    overrides.confirm!.engulf = settings.lsrConfirmEngulf;
  }
  if (typeof settings.lsrMinBodyAtr === 'number') {
    overrides.confirm = overrides.confirm || {} as any;
    overrides.confirm!.minBodyATR = settings.lsrMinBodyAtr;
  }

  // 8. Risk
  if (typeof settings.lsrStopBufferAtr === 'number') {
    overrides.risk = overrides.risk || {} as any;
    overrides.risk!.stopBufferATR = settings.lsrStopBufferAtr;
  }
  if (typeof settings.lsrMinStopAtr === 'number') {
    overrides.risk = overrides.risk || {} as any;
    overrides.risk!.minStopATR = settings.lsrMinStopAtr;
  }
  if (typeof settings.lsrMaxStopAtr === 'number') {
    overrides.risk = overrides.risk || {} as any;
    overrides.risk!.maxStopATR = settings.lsrMaxStopAtr;
  }
  if (typeof settings.lsrMinRr === 'number') {
    overrides.risk = overrides.risk || {} as any;
    overrides.risk!.minRR = settings.lsrMinRr;
  }
  if (typeof settings.lsrMaxFeeToRisk === 'number') {
    overrides.risk = overrides.risk || {} as any;
    overrides.risk!.maxFeeToRisk = settings.lsrMaxFeeToRisk;
  }

  // 9. Exits
  if (typeof settings.lsrTimeStopBars === 'number') {
    overrides.exits = overrides.exits || {} as any;
    overrides.exits!.timeStopBars = settings.lsrTimeStopBars;
  }

  // 10. Frequency
  if (typeof settings.lsrCooldownBarsAfterLoss === 'number') {
    overrides.frequency = overrides.frequency || {} as any;
    overrides.frequency!.cooldownBarsAfterLoss = settings.lsrCooldownBarsAfterLoss;
  }
  if (typeof settings.lsrMaxPerSymbolPerDay === 'number') {
    overrides.frequency = overrides.frequency || {} as any;
    overrides.frequency!.maxPerSymbolPerDay = settings.lsrMaxPerSymbolPerDay;
  }

  // Merge direct nested settings.liquiditySweepConfig with explicit lsr* fields, and sparse per-mode overrides (highest precedence)
  const mergedFlat = merge(settings.liquiditySweepConfig ?? {}, overrides);
  return merge(mergedFlat, sparseModeOverrides);
}

