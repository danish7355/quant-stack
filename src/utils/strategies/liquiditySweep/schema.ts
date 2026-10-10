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
  | { status: 'STANDBY'; habitat: Habitat; reason: RejectReason }
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
  uiOverrides?: DeepPartial<SweepConfig>;
}): Resolved {
  const habitat = (opts.regimeMap ?? REGIME_MAP)[opts.regimeLabel] ?? 'transition';
  const profile = HABITATS[habitat] ?? HABITATS.transition;
  if (!profile.enabledIn.includes(opts.mode)) {
    return { status: 'STANDBY', habitat, reason: 'REGIME_STANDBY' };
  }

  let cfg = merge(merge(BASE, MODES[opts.mode]), profile.overrides);
  cfg = JSON.parse(JSON.stringify(cfg)) as SweepConfig; // detach from shared defaults
  cfg.risk.minRR = Math.round((cfg.risk.minRR + profile.adjust.minRRDelta) * 100) / 100;
  cfg.risk.riskMult *= profile.adjust.riskMult;
  cfg.exits.timeStopBars = Math.round(cfg.exits.timeStopBars * profile.adjust.timeStopMult);
  cfg = merge(cfg, opts.uiOverrides ?? {}); // the user's explicit values always win

  if (opts.regimeConfidence < cfg.regime.minConfidence) {
    return { status: 'STANDBY', habitat, reason: 'REGIME_LOW_CONF' };
  }
  if (opts.regimeStableBars < cfg.regime.stabilityBars) {
    return { status: 'STANDBY', habitat, reason: 'REGIME_UNSTABLE' };
  }
  return { status: 'ACTIVE', habitat, cfg };
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
