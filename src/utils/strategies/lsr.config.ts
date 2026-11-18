/**
 * LIQUIDITY SWEEP REVERSAL v2: config + gate/risk helpers (regime-gated, nothing hardcoded)
 *
 * RULES FOR THE IMPLEMENTING AGENT
 *  - Strategy code may not contain a literal threshold, timeframe, multiplier or regime
 *    label. Every value comes from resolveConfig(). Precedence, last wins:
 *      BASE (= balanced)  <  MODE preset  <  HABITAT override/adjust  <  UI override
 *    Store only the fields the user actually edited as UI overrides, per mode.
 *  - Import the helpers below instead of re-implementing them: resolveConfig,
 *    evaluateGates, favorableNext, minAtrPct, setupExtreme, computeStop, evaluateRisk,
 *    positionSize, wilsonLower, evaluateEdge, breakevenWinRate.
 *  - feeFloorPct is the app's round-trip cost in % of notional (fees + slippage cushion).
 *    Always read it from the app's fee model. Never copy a number into this file.
 *
 * PIPELINE (closed bars of the execution timeframe, incremental indicators)
 *  0. On every closed bar: build the market snapshot first, then each coin snapshot,
 *     update each coin's hysteresis state with favorableNext(), then run the strategies,
 *     all inside the same bar-close handler. A lagging snapshot => STALE_REGIME.
 *  1. evaluateGates(): fresh -> macro tradable -> shock -> macro habitat -> macro
 *     confidence -> universe/spread/volatility -> coin habitat + hysteresis -> macro-coin
 *     fit -> direction vs biases -> BTC/ETH confirmation.
 *  2. Liquidity map -> sweep -> rejection candle (hammer / shooting star) -> engulf
 *     confirmation. Thresholds come from cfg (unchanged from v1).
 *  3. Re-run evaluateGates() on the confirmation close and again just before order submit.
 *  4. setupExtreme() -> computeStop() -> evaluateRisk() -> positionSize() -> entry.
 *  5. evaluateEdge() decides whether this (mode, habitat) cell may trade at all.
 */

export type Mode = 'strict' | 'balanced' | 'aggressive';
export type Habitat = 'range' | 'trend' | 'compression' | 'expansion' | 'chaos' | 'transition';
export type PoolType = 'prevWeekHL' | 'prevDayHL' | 'sessionHL' | 'rangeEdge' | 'equalHL' | 'swingHL';
export type Side = 'long' | 'short';
export type Bias = Side | 'neutral';
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
    minConfidence: number; // MARKET (macro) confidence, 0-100
    stabilityBars: number; // bars a coin must stay above coin.enterConfidence before it turns favourable. Leaving is always instant.
    maxBarsBehind: number; // closed regime-TF bars a snapshot may lag. 0 = must include the latest closed bar.
    btcEthAlignment: 'both_agree' | 'btc_not_opposing' | 'off';
    onExit: 'manage' | 'tighten' | 'close'; // what open trades do when the regime leaves favour
    shock: { atrMult: number; windowBars: number; cooldownBars: number }; // BTC shock watchdog
  };
  coin: {
    enterConfidence: number; // hysteresis: turns favourable at or above this
    exitConfidence: number; // hysteresis: stays favourable until it falls below this
    maxSpreadBps: number;
    macroPolicy: 'same' | 'compatible' | 'independent';
    macroCoinCompat: Partial<Record<Habitat, Habitat[]>>; // used by 'compatible'
  };
  universe: { maxRank: number; enforceRank?: boolean }; // rank inside the app's top-100 universe
  pools: {
    minScore: number;
    weights: Record<PoolType, number>;
    touchBonus: number;
    equalLevelTolATR: number;
    pivotBars: number;
    maxAgeBars: number;
  };
  sweep: {
    minDepthATR: number;
    maxDepthATR: number; // deeper than this = real breakout, not a sweep
    reclaimWithinBars: number; // 1 = the sweep candle itself must close back inside
    minRelVolume: number;
    volumeLookback: number;
  };
  trigger: {
    minWickToRange: number;
    maxOppWickToRange: number;
    maxBodyToRange: number;
    minCloseLocation: number;
    minRangeATR: number;
  };
  confirm: { windowBars: number; engulf: EngulfMode; minBodyATR: number };
  direction: { counterBiasAllowed: boolean; counterBiasRiskMult: number; edgeZonePct: number };
  risk: {
    riskMult: number; // multiplies the app's per-trade risk setting
    stopBufferATR: number; // whip gap, ATR part
    stopGapSpreadMult: number; // whip gap, spread part (x current spread)
    stopGapMinTicks: number; // whip gap, tick floor
    stopTrigger: 'mark' | 'last'; // price the protective stop triggers on
    minStopATR: number;
    maxStopATR: number;
    minRR: number; // gross RR to the primary target
    maxFeeToRisk: number; // reject if round-trip cost exceeds this many R
  };
  exits: {
    tp1: { basis: 'r_multiple' | 'range_mid'; r: number; closePct: number };
    tp2: { basis: 'opposite_pool' | 'range_edge' };
    moveToBEAfterTp1: boolean;
    trail: 'off' | 'structure';
    timeStopBars: number;
  };
  frequency: { cooldownBarsAfterLoss: number; maxPerSymbolPerDay: number };
  edge: {
    enabled: boolean;
    minTrades: number; // trades a (mode, habitat) cell needs before it can be judged
    minWinRate: number; // observed win rate (net PnL after fees > 0)
    minExpectancyR: number; // mean net R per trade
    wilsonZ: number; // 1.28 = 90% one-sided
    breakevenMargin: number; // Wilson lower bound must clear break-even by this much
  };
}

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends any[] ? T[K] : T[K] extends object ? DeepPartial<T[K]> : T[K];
};

/** Reason codes for the Rejects / Signals tabs and the STANDBY badge. */
export const REJECT_REASONS = [
  'REGIME_STANDBY', 'REGIME_LOW_CONF', 'REGIME_UNSTABLE' /* legacy, unused in v2 */,
  'STALE_REGIME', 'MACRO_NOT_TRADABLE', 'MACRO_SHOCK',
  'OUT_OF_UNIVERSE', 'SPREAD_TOO_WIDE', 'COIN_TOO_QUIET',
  'COIN_REGIME_UNFAVORABLE', 'COIN_MACRO_MISMATCH',
  'POOL_WEAK', 'SWEEP_TOO_SHALLOW', 'SWEEP_TOO_DEEP', 'NO_RECLAIM', 'LOW_VOLUME',
  'TRIGGER_INVALID', 'NO_ENGULF', 'CONFIRM_EXPIRED',
  'AGAINST_BIAS', 'BTC_ETH_CONFLICT', 'OUTSIDE_EDGE_ZONE',
  'STOP_TOO_TIGHT', 'STOP_TOO_WIDE', 'RR_TOO_LOW', 'FEES_TOO_HIGH',
  'EDGE_NOT_PROVEN', 'COOLDOWN', 'DAILY_CAP',
] as const;
export type RejectReason = (typeof REJECT_REASONS)[number];

/** BASE equals the balanced preset. */
export const BASE: SweepConfig = {
  atrPeriod: 14,
  timeframes: { execution: '15m', direction: '1h', liquidity: ['1h', '4h', '1d'] },
  regime: {
    minConfidence: 60,
    stabilityBars: 1,
    maxBarsBehind: 0,
    btcEthAlignment: 'btc_not_opposing',
    onExit: 'tighten',
    shock: { atrMult: 2.5, windowBars: 3, cooldownBars: 4 },
  },
  coin: {
    enterConfidence: 65,
    exitConfidence: 50,
    maxSpreadBps: 8,
    macroPolicy: 'compatible',
    macroCoinCompat: { trend: ['trend', 'range'], range: ['range'], compression: ['compression', 'range'] },
  },
  universe: { maxRank: 60 },
  pools: {
    minScore: 55,
    weights: { prevWeekHL: 100, prevDayHL: 90, rangeEdge: 85, equalHL: 75, sessionHL: 70, swingHL: 55 },
    touchBonus: 5,
    equalLevelTolATR: 0.1,
    pivotBars: 3,
    maxAgeBars: 400,
  },
  sweep: { minDepthATR: 0.08, maxDepthATR: 1.8, reclaimWithinBars: 2, minRelVolume: 1.4, volumeLookback: 20 },
  trigger: { minWickToRange: 0.5, maxOppWickToRange: 0.3, maxBodyToRange: 0.4, minCloseLocation: 0.6, minRangeATR: 0.5 },
  confirm: { windowBars: 1, engulf: 'body', minBodyATR: 0.35 },
  direction: { counterBiasAllowed: false, counterBiasRiskMult: 0.5, edgeZonePct: 35 },
  risk: {
    riskMult: 1,
    stopBufferATR: 0.15,
    stopGapSpreadMult: 1.5,
    stopGapMinTicks: 3,
    stopTrigger: 'mark',
    minStopATR: 0.5,
    maxStopATR: 2.5,
    minRR: 2.5,
    maxFeeToRisk: 0.15,
  },
  exits: {
    tp1: { basis: 'r_multiple', r: 1.8, closePct: 40 },
    tp2: { basis: 'opposite_pool' },
    moveToBEAfterTp1: true,
    trail: 'off',
    timeStopBars: 16,
  },
  frequency: { cooldownBarsAfterLoss: 5, maxPerSymbolPerDay: 4 },
  edge: { enabled: true, minTrades: 30, minWinRate: 0.6, minExpectancyR: 0.20, wilsonZ: 1.28, breakevenMargin: 0.02 },
};

export const MODES: Record<Mode, DeepPartial<SweepConfig>> = {
  strict: {
    timeframes: { execution: '15m', direction: '4h' },
    regime: { minConfidence: 70, btcEthAlignment: 'both_agree', shock: { atrMult: 2.0, cooldownBars: 6 } },
    coin: { enterConfidence: 70, exitConfidence: 55, maxSpreadBps: 3, macroPolicy: 'same' },
    universe: { maxRank: 30 },
    pools: { minScore: 70 },
    sweep: { minDepthATR: 0.1, maxDepthATR: 1.2, reclaimWithinBars: 1, minRelVolume: 1.5 },
    trigger: { minWickToRange: 0.6, maxOppWickToRange: 0.2, maxBodyToRange: 0.35, minCloseLocation: 0.7, minRangeATR: 0.6 },
    confirm: { windowBars: 1, engulf: 'range', minBodyATR: 0.5 },
    direction: { counterBiasAllowed: false, edgeZonePct: 15 },
    risk: { minStopATR: 0.6, maxStopATR: 2.0, minRR: 2.0, maxFeeToRisk: 0.15 },
    exits: { tp1: { closePct: 40 }, timeStopBars: 20 },
    frequency: { cooldownBarsAfterLoss: 8, maxPerSymbolPerDay: 3 },
  },
  balanced: {},
  aggressive: {
    timeframes: { execution: '5m', direction: '1h' },
    regime: { minConfidence: 40, maxBarsBehind: 1, btcEthAlignment: 'off', shock: { atrMult: 3.0, cooldownBars: 3 } },
    coin: { enterConfidence: 50, exitConfidence: 35, maxSpreadBps: 8, macroPolicy: 'independent' },
    universe: { maxRank: 100 },
    pools: { minScore: 40 },
    sweep: { minDepthATR: 0.03, maxDepthATR: 2.5, reclaimWithinBars: 3, minRelVolume: 1.0 },
    trigger: { minWickToRange: 0.4, maxOppWickToRange: 0.35, maxBodyToRange: 0.5, minCloseLocation: 0.5, minRangeATR: 0.4 },
    confirm: { windowBars: 2, engulf: 'close_through', minBodyATR: 0.2 },
    direction: { counterBiasAllowed: true, counterBiasRiskMult: 0.5, edgeZonePct: 30 },
    risk: { riskMult: 0.75, minStopATR: 0.4, maxStopATR: 3.0, minRR: 1.3, maxFeeToRisk: 0.25 },
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
 * Map the regime engine's own labels to habitats. Replace the keys with the labels your
 * engine actually emits and let the UI edit them. An unknown label falls back to
 * 'transition' => STANDBY (fail safe).
 */
export const REGIME_MAP: Record<string, Habitat> = {
  RANGE: 'range',
  RANGING: 'range',
  TREND_UP: 'trend',
  TREND_DOWN: 'trend',
  STRONG_TREND_UP: 'trend',
  STRONG_TREND_DOWN: 'trend',
  COMPRESSION: 'compression',
  EXPANSION: 'expansion',
  HIGH_VOL: 'chaos',
  VOLATILE: 'chaos',
  TRANSITION: 'transition',
};

export type Resolved =
  | { status: 'STANDBY'; habitat: Habitat; reason: RejectReason }
  | { status: 'ACTIVE'; habitat: Habitat; cfg: SweepConfig };

function merge<T>(base: T, patch: DeepPartial<T>): T {
  const out: any = Array.isArray(base) ? [...(base as any)] : { ...(base as any) };
  for (const k in patch) {
    const v = (patch as any)[k];
    if (v === undefined) continue;
    out[k] = v && typeof v === 'object' && !Array.isArray(v) ? merge((base as any)[k], v) : v;
  }
  return out;
}

/**
 * Resolve the effective config for ONE coin. regimeLabel is that coin's regime label
 * (v2 change: confidence and stability are now checked in evaluateGates, not here).
 */
export function resolveConfig(opts: {
  mode: Mode;
  regimeLabel: string;
  regimeMap?: Record<string, Habitat>;
  habitats?: Record<Habitat, HabitatProfile>;
  uiOverrides?: DeepPartial<SweepConfig>;
}): Resolved {
  const habitat = (opts.regimeMap ?? REGIME_MAP)[opts.regimeLabel] ?? 'transition';
  const profile = (opts.habitats ?? HABITATS)[habitat];
  if (!profile || !profile.enabledIn.includes(opts.mode)) {
    return { status: 'STANDBY', habitat, reason: 'REGIME_STANDBY' };
  }
  let cfg = merge(merge(BASE, MODES[opts.mode]), profile.overrides);
  cfg = JSON.parse(JSON.stringify(cfg)) as SweepConfig; // detach from shared defaults
  cfg.risk.minRR = Math.round((cfg.risk.minRR + profile.adjust.minRRDelta) * 100) / 100;
  cfg.risk.riskMult *= profile.adjust.riskMult;
  cfg.exits.timeStopBars = Math.round(cfg.exits.timeStopBars * profile.adjust.timeStopMult);
  cfg = merge(cfg, opts.uiOverrides ?? {}); // the user's explicit values always win
  return { status: 'ACTIVE', habitat, cfg };
}

/* ------------------------------------------------------------------ */
/* Gates: macro first, then the coin                                    */
/* ------------------------------------------------------------------ */

export interface MacroSnapshot {
  barsBehind: number; // closed regime-TF bars not yet reflected (0 = fresh)
  tradable: boolean; // engine tradeability gate (already honours the user's bypass toggle)
  habitat: Habitat;
  confidence: number; // 0-100
  bias: Bias;
  btc: { habitat: Habitat; bias: Bias };
  eth: { habitat: Habitat; bias: Bias };
  shock: boolean; // BTC shock watchdog, may flip intrabar
}

export interface CoinSnapshot {
  symbol: string;
  isBtcOrEth: boolean;
  barsBehind: number;
  rank: number; // rank inside the top-100 universe
  spreadBps: number;
  atrPct: number; // ATR on the execution TF as % of price
  habitat: Habitat;
  confidence: number; // 0-100
  bias: Bias;
  prevFavorable: boolean; // stored hysteresis state from the previous closed bar
  barsAboveEnter: number; // consecutive closed bars with confidence >= enterConfidence
}

export type GateResult =
  | { ok: true; riskScale: number; nextFavorable: boolean }
  | { ok: false; reason: RejectReason; nextFavorable: boolean };

/** Hysteresis. Run on EVERY closed bar for every scanned coin and store the result. */
export const favorableNext = (prev: boolean, confidence: number, barsAboveEnter: number, cfg: SweepConfig): boolean =>
  prev
    ? confidence >= cfg.coin.exitConfidence
    : confidence >= cfg.coin.enterConfidence && barsAboveEnter >= cfg.regime.stabilityBars;

/** Smallest ATR% at which any stop can satisfy both maxStopATR and the fee cap. Derived, never typed in. */
export const minAtrPct = (cfg: SweepConfig, feeFloorPct: number): number =>
  feeFloorPct / (cfg.risk.maxFeeToRisk * cfg.risk.maxStopATR);

export function evaluateGates(p: {
  cfg: SweepConfig;
  mode: Mode;
  macro: MacroSnapshot;
  coin: CoinSnapshot;
  side: Side;
  feeFloorPct: number;
  habitats?: Record<Habitat, HabitatProfile>;
}): GateResult {
  const { cfg, mode, macro, coin, side } = p;
  const habitats = p.habitats ?? HABITATS;
  const nextFavorable = favorableNext(coin.prevFavorable, coin.confidence, coin.barsAboveEnter, cfg);
  const fail = (reason: RejectReason): GateResult => ({ ok: false, reason, nextFavorable });

  // 0. never trade on a lagging regime
  if (macro.barsBehind > cfg.regime.maxBarsBehind || coin.barsBehind > cfg.regime.maxBarsBehind) return fail('STALE_REGIME');

  // 1. macro
  if (!macro.tradable) return fail('MACRO_NOT_TRADABLE');
  if (macro.shock) return fail('MACRO_SHOCK');
  if (!habitats[macro.habitat].enabledIn.includes(mode)) return fail('REGIME_STANDBY');
  if (macro.confidence < cfg.regime.minConfidence) return fail('REGIME_LOW_CONF');

  // 2. coin tradeability
  if (cfg.universe.enforceRank !== false && coin.rank > cfg.universe.maxRank) return fail('OUT_OF_UNIVERSE');
  if (coin.spreadBps > cfg.coin.maxSpreadBps) return fail('SPREAD_TOO_WIDE');
  if (coin.atrPct < minAtrPct(cfg, p.feeFloorPct)) return fail('COIN_TOO_QUIET');

  // 3. the coin's own regime (hysteresis state decides; advisory for range/transition/compression/chaos)
  const isAllowedAdvisoryHabitat = ['range', 'transition', 'compression', 'chaos'].includes(coin.habitat);
  if ((!habitats[coin.habitat].enabledIn.includes(mode) || !nextFavorable) && !isAllowedAdvisoryHabitat) return fail('COIN_REGIME_UNFAVORABLE');

  // 4. coin must fit the macro regime
  if (cfg.coin.macroPolicy === 'same' && coin.habitat !== macro.habitat) return fail('COIN_MACRO_MISMATCH');
  if (cfg.coin.macroPolicy === 'compatible' && !(cfg.coin.macroCoinCompat[macro.habitat] ?? []).includes(coin.habitat)) {
    return fail('COIN_MACRO_MISMATCH');
  }
  if (cfg.coin.macroPolicy !== 'independent' && macro.habitat === 'trend' && coin.habitat === 'trend' && coin.bias !== macro.bias) {
    return fail('COIN_MACRO_MISMATCH');
  }

  // 5. direction vs biases
  let riskScale = 1;
  const opposesMacro = macro.habitat === 'trend' && macro.bias !== 'neutral' && macro.bias !== side;
  const opposesCoin = coin.habitat === 'trend' && coin.bias !== 'neutral' && coin.bias !== side;
  if (opposesMacro || opposesCoin) {
    if (!cfg.direction.counterBiasAllowed) return fail('AGAINST_BIAS');
    riskScale *= cfg.direction.counterBiasRiskMult;
  }

  // 6. BTC / ETH confirmation for everything that is not BTC or ETH itself
  if (cfg.regime.btcEthAlignment !== 'off' && !coin.isBtcOrEth) {
    const trendContext = macro.habitat === 'trend' || coin.habitat === 'trend';
    const opp: Side = side === 'long' ? 'short' : 'long';
    const momentum = (h: Habitat) => h === 'expansion' || h === 'chaos';
    const conflict =
      cfg.regime.btcEthAlignment === 'both_agree'
        ? trendContext
          ? macro.btc.bias !== side || macro.eth.bias !== side
          : [macro.btc.habitat, macro.eth.habitat].some((h) => h === 'trend' || momentum(h))
        : (trendContext && macro.btc.bias === opp) || momentum(macro.btc.habitat);
    if (conflict) return fail('BTC_ETH_CONFLICT');
  }

  return { ok: true, riskScale, nextFavorable };
}

/* ------------------------------------------------------------------ */
/* Stop, risk gates and sizing                                          */
/* ------------------------------------------------------------------ */

/** bars = every bar from the sweep candle through the confirmation candle, inclusive. */
export function setupExtreme(side: Side, bars: ReadonlyArray<{ high: number; low: number }>): number {
  return side === 'long' ? Math.min(...bars.map((b) => b.low)) : Math.max(...bars.map((b) => b.high));
}

/** Stop = setup wick extreme plus a whip gap, rounded AWAY from entry so rounding never tightens it. */
export function computeStop(p: {
  side: Side;
  setupExtreme: number;
  atr: number;
  spread: number; // absolute price units
  tick: number;
  cfg: SweepConfig;
}): { stop: number; gap: number } {
  const r = p.cfg.risk;
  const gap = Math.max(r.stopBufferATR * p.atr, r.stopGapSpreadMult * p.spread, r.stopGapMinTicks * p.tick);
  const raw = p.side === 'long' ? p.setupExtreme - gap : p.setupExtreme + gap;
  const k = p.side === 'long' ? Math.floor(raw / p.tick) : Math.ceil(raw / p.tick);
  return { stop: Number((k * p.tick).toFixed(12)), gap };
}

/** Single-target break-even win rate: W = (1 + feeR) / (RR + 1). */
export const breakevenWinRate = (rrGross: number, feeR: number): number => (1 + feeR) / (rrGross + 1);

/** Round-trip cost in R. Compare against cfg.risk.maxFeeToRisk. */
export const feeCostInR = (feeFloorPct: number, stopDistancePct: number): number => feeFloorPct / stopDistancePct;

/** Never widens the stop to pass a gate: a failing setup is rejected, not repaired. */
export function evaluateRisk(p: {
  entry: number;
  stop: number;
  target: number; // primary (final) target price
  atr: number;
  feeFloorPct: number;
  cfg: SweepConfig;
}) {
  const r = p.cfg.risk;
  const dist = Math.abs(p.entry - p.stop);
  const stopPct = (dist / p.entry) * 100;
  const stopATR = dist / p.atr;
  const feeR = feeCostInR(p.feeFloorPct, stopPct);
  const rrGross = Math.abs(p.target - p.entry) / dist;
  const diag = {
    dist,
    stopPct,
    stopATR,
    feeR,
    rrGross,
    rrNet: (rrGross - feeR) / (1 + feeR),
    breakevenWinRate: breakevenWinRate(rrGross, feeR),
  };
  const bad = (reason: RejectReason) => ({ ok: false as const, reason, ...diag });
  if (stopATR < r.minStopATR) return bad('STOP_TOO_TIGHT');
  if (stopATR > r.maxStopATR) return bad('STOP_TOO_WIDE');
  if (feeR > r.maxFeeToRisk) return bad('FEES_TOO_HIGH');
  if (rrGross < r.minRR) return bad('RR_TOO_LOW');
  return { ok: true as const, ...diag };
}

/**
 * Loss at the stop equals the intended risk: the per-unit cost includes the round-trip fee floor.
 * riskScale = cfg.risk.riskMult * gates.riskScale. Clamp by the app's own caps via maxNotional.
 */
export function positionSize(p: {
  equity: number;
  riskPct: number; // the app's per-trade risk setting, in %
  riskScale: number;
  entry: number;
  stop: number;
  feeFloorPct: number;
  maxNotional?: number;
}) {
  const dist = Math.abs(p.entry - p.stop);
  const costPerUnit = dist + p.entry * (p.feeFloorPct / 100);
  const riskAmount = p.equity * (p.riskPct / 100) * p.riskScale;
  let qty = riskAmount / costPerUnit;
  let capped = false;
  if (p.maxNotional !== undefined && qty * p.entry > p.maxNotional) {
    qty = p.maxNotional / p.entry;
    capped = true;
  }
  return { qty, riskAmount, actualRisk: qty * costPerUnit, notional: qty * p.entry, capped };
}

/* ------------------------------------------------------------------ */
/* Edge gate: win rate is measured, never assumed                       */
/* ------------------------------------------------------------------ */

export interface CellStats {
  n: number;
  wins: number; // net PnL after fees > 0
  avgWinNetR: number; // mean net R of winners
  avgLossNetR: number; // mean net loss of losers, as a positive number
  expectancyR: number; // mean net R over all trades
}

/** Wilson score lower bound of a win rate (z = 1.28 is a 90% one-sided bound). */
export function wilsonLower(wins: number, n: number, z: number): number {
  if (n <= 0) return 0;
  const p = wins / n;
  const z2 = z * z;
  return (p + z2 / (2 * n) - z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / (1 + z2 / n);
}

/** A (mode, habitat) cell may trade only when its measured results pass every test. */
export function evaluateEdge(s: CellStats, cfg: SweepConfig) {
  const e = cfg.edge;
  const winRate = s.n > 0 ? s.wins / s.n : 0;
  const lower = wilsonLower(s.wins, s.n, e.wilsonZ);
  const denom = s.avgWinNetR + s.avgLossNetR;
  const breakeven = denom > 0 ? s.avgLossNetR / denom : 1; // empirical break-even win rate
  const ok =
    !e.enabled ||
    (s.n >= e.minTrades &&
      winRate >= e.minWinRate &&
      s.expectancyR >= e.minExpectancyR &&
      lower >= breakeven + e.breakevenMargin);
  return { ok, reason: ok ? undefined : ('EDGE_NOT_PROVEN' as const), winRate, wilsonLower: lower, breakevenWinRate: breakeven };
}

/* ------------------------------------------------------------------ */
/* Backward Compatibility Layer & Adapters for Existing UI Components  */
/* ------------------------------------------------------------------ */

export type LsrTimeframeChoice = 'context' | 'execution';
export type LsrTriggerPrice = 'mark' | 'last';
export type LsrPresetName = 'Strict' | 'Balanced' | 'Relaxed' | 'Custom';
export type LsrEntryMode = 'SWEPT_LEVEL' | 'MIDPOINT_LIMIT' | 'C0_CLOSE' | 'LITE_CLOSE' | 'DEFAULT_FVG';

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
  executionTimeframe: string;
  contextTimeframe: string;
  structureLookback: number;
  sweepMinAtr: number;
  sweepMaxAtr: number;
  maxReacceptanceBars: number;
  trackConsumedPools: boolean;
  locationGate: {
    enabled: boolean;
    edgePct: number;
    rangeTimeframe: LsrTimeframeChoice;
  };
  poolSource: {
    timeframe: LsrTimeframeChoice;
  };
  poolQuality: {
    enabled: boolean;
    minScore: number;
    eqTolAtr: number;
    scores: LsrPoolScores;
  };
  entryMode: LsrEntryMode;
  starShape: {
    enabled: boolean;
    wickToBody: number;
    wickToRange: number;
  };
  volumeGate: {
    enabled: boolean;
    volMultiple: number;
  };
  minStructuralRR: number;
  finalTpR: number;
  roomCheck: {
    enabled: boolean;
  };
  sl: {
    atrBuffer: number;
    triggerPrice: LsrTriggerPrice;
  };
  timeStop: {
    enabled: boolean;
    bars: number;
    minProgressR: number;
  };
  partialTp1Enabled: boolean;
  partialTp1ClosePct: number;
  feeFloor: {
    enabled: boolean;
    roundTripFeePct: number;
    divisor: number;
  };
}

export const LSR_PRESETS: Record<'Strict' | 'Balanced' | 'Relaxed', LsrV2Config> = {
  Strict: {
    configVersion: 'LSR_V2.0',
    preset: 'Strict',
    executionTimeframe: '15m',
    contextTimeframe: '4h',
    structureLookback: 50,
    sweepMinAtr: 0.10,
    sweepMaxAtr: 1.2,
    maxReacceptanceBars: 1,
    trackConsumedPools: true,
    locationGate: { enabled: true, edgePct: 30, rangeTimeframe: 'context' },
    poolSource: { timeframe: 'context' },
    poolQuality: {
      enabled: true,
      minScore: 70,
      eqTolAtr: 0.1,
      scores: { equalHighsLows: 75, prevDayHighLow: 90, sessionHighLow: 70, prevWeekHighLow: 100, singleSwing: 55 }
    },
    entryMode: 'C0_CLOSE',
    starShape: { enabled: true, wickToBody: 2.0, wickToRange: 0.60 },
    volumeGate: { enabled: true, volMultiple: 1.5 },
    minStructuralRR: 3.5,
    finalTpR: 3.5,
    roomCheck: { enabled: true },
    sl: { atrBuffer: 0.15, triggerPrice: 'mark' },
    timeStop: { enabled: true, bars: 6, minProgressR: 0.5 },
    partialTp1Enabled: true,
    partialTp1ClosePct: 40,
    feeFloor: { enabled: true, roundTripFeePct: 0.177, divisor: 0.15 }
  },
  Balanced: {
    configVersion: 'LSR_V2.0',
    preset: 'Balanced',
    executionTimeframe: '15m',
    contextTimeframe: '1h',
    structureLookback: 40,
    sweepMinAtr: 0.06,
    sweepMaxAtr: 1.8,
    maxReacceptanceBars: 2,
    trackConsumedPools: true,
    locationGate: { enabled: true, edgePct: 35, rangeTimeframe: 'context' },
    poolSource: { timeframe: 'context' },
    poolQuality: {
      enabled: true,
      minScore: 55,
      eqTolAtr: 0.1,
      scores: { equalHighsLows: 75, prevDayHighLow: 90, sessionHighLow: 70, prevWeekHighLow: 100, singleSwing: 55 }
    },
    entryMode: 'C0_CLOSE',
    starShape: { enabled: true, wickToBody: 1.5, wickToRange: 0.50 },
    volumeGate: { enabled: true, volMultiple: 1.2 },
    minStructuralRR: 3.5,
    finalTpR: 3.5,
    roomCheck: { enabled: true },
    sl: { atrBuffer: 0.15, triggerPrice: 'mark' },
    timeStop: { enabled: true, bars: 8, minProgressR: 0.5 },
    partialTp1Enabled: true,
    partialTp1ClosePct: 50,
    feeFloor: { enabled: false, roundTripFeePct: 0.177, divisor: 0.20 }
  },
  Relaxed: {
    configVersion: 'LSR_V2.0',
    preset: 'Relaxed',
    executionTimeframe: '5m',
    contextTimeframe: '1h',
    structureLookback: 30,
    sweepMinAtr: 0.03,
    sweepMaxAtr: 2.5,
    maxReacceptanceBars: 3,
    trackConsumedPools: false,
    locationGate: { enabled: true, edgePct: 45, rangeTimeframe: 'context' },
    poolSource: { timeframe: 'execution' },
    poolQuality: {
      enabled: true,
      minScore: 40,
      eqTolAtr: 0.15,
      scores: { equalHighsLows: 75, prevDayHighLow: 90, sessionHighLow: 70, prevWeekHighLow: 100, singleSwing: 55 }
    },
    entryMode: 'C0_CLOSE',
    starShape: { enabled: true, wickToBody: 1.2, wickToRange: 0.40 },
    volumeGate: { enabled: false, volMultiple: 1.0 },
    minStructuralRR: 3.0,
    finalTpR: 3.0,
    roomCheck: { enabled: true },
    sl: { atrBuffer: 0.15, triggerPrice: 'mark' },
    timeStop: { enabled: true, bars: 10, minProgressR: 0.4 },
    partialTp1Enabled: true,
    partialTp1ClosePct: 60,
    feeFloor: { enabled: false, roundTripFeePct: 0.177, divisor: 0.25 }
  }
};

export function applyLsrPreset(name: LsrPresetName): LsrV2Config {
  const pName = (name === 'Custom' || !LSR_PRESETS[name as 'Strict' | 'Balanced' | 'Relaxed']) ? 'Balanced' : name as 'Strict' | 'Balanced' | 'Relaxed';
  return JSON.parse(JSON.stringify(LSR_PRESETS[pName]));
}

export function resolveLsrConfig(rawSettings: any): LsrV2Config {
  const modeKey = (rawSettings?.lsrPreset || rawSettings?.lsrV2Config?.preset || 'Balanced') as LsrPresetName;
  const base = applyLsrPreset(modeKey);
  const user = (rawSettings?.lsrV2Config && typeof rawSettings.lsrV2Config === 'object') ? rawSettings.lsrV2Config : {};

  return {
    ...base,
    ...user,
    preset: user.preset || modeKey || 'Balanced',
    executionTimeframe: user.executionTimeframe || base.executionTimeframe || '15m',
    contextTimeframe: user.contextTimeframe || base.contextTimeframe || '1h',
    structureLookback: Number(user.structureLookback ?? base.structureLookback ?? 40),
    sweepMinAtr: Number(user.sweepMinAtr ?? base.sweepMinAtr ?? 0.06),
    sweepMaxAtr: Number(user.sweepMaxAtr ?? base.sweepMaxAtr ?? 1.8),
    maxReacceptanceBars: Number(user.maxReacceptanceBars ?? base.maxReacceptanceBars ?? 2),
    trackConsumedPools: user.trackConsumedPools ?? base.trackConsumedPools ?? true,
    locationGate: {
      ...base.locationGate,
      ...(user.locationGate || {}),
      enabled: user.locationGate?.enabled ?? base.locationGate?.enabled ?? true,
      edgePct: Number(user.locationGate?.edgePct ?? base.locationGate?.edgePct ?? 20),
      rangeTimeframe: user.locationGate?.rangeTimeframe || base.locationGate?.rangeTimeframe || 'context'
    },
    poolSource: {
      ...base.poolSource,
      ...(user.poolSource || {}),
      timeframe: user.poolSource?.timeframe || base.poolSource?.timeframe || 'context'
    },
    poolQuality: {
      ...base.poolQuality,
      ...(user.poolQuality || {}),
      enabled: user.poolQuality?.enabled ?? base.poolQuality?.enabled ?? true,
      minScore: Number(user.poolQuality?.minScore ?? base.poolQuality?.minScore ?? 55),
      eqTolAtr: Number(user.poolQuality?.eqTolAtr ?? base.poolQuality?.eqTolAtr ?? 0.1),
      scores: {
        ...(base.poolQuality?.scores || {}),
        ...(user.poolQuality?.scores || {})
      }
    },
    entryMode: user.entryMode || base.entryMode || 'C0_CLOSE',
    starShape: {
      ...base.starShape,
      ...(user.starShape || {}),
      enabled: user.starShape?.enabled ?? base.starShape?.enabled ?? true,
      wickToBody: Number(user.starShape?.wickToBody ?? base.starShape?.wickToBody ?? 1.5),
      wickToRange: Number(user.starShape?.wickToRange ?? base.starShape?.wickToRange ?? 0.5)
    },
    volumeGate: {
      ...base.volumeGate,
      ...(user.volumeGate || {}),
      enabled: user.volumeGate?.enabled ?? base.volumeGate?.enabled ?? true,
      volMultiple: Number(user.volumeGate?.volMultiple ?? base.volumeGate?.volMultiple ?? 1.2)
    },
    minStructuralRR: Number(user.minStructuralRR ?? base.minStructuralRR ?? 1.6),
    finalTpR: Number(user.finalTpR ?? base.finalTpR ?? 2.5),
    roomCheck: {
      ...base.roomCheck,
      ...(user.roomCheck || {}),
      enabled: user.roomCheck?.enabled ?? base.roomCheck?.enabled ?? true
    },
    sl: {
      ...base.sl,
      ...(user.sl || {}),
      atrBuffer: Number(user.sl?.atrBuffer ?? base.sl?.atrBuffer ?? 0.15),
      triggerPrice: user.sl?.triggerPrice || base.sl?.triggerPrice || 'mark'
    },
    timeStop: {
      ...base.timeStop,
      ...(user.timeStop || {}),
      enabled: user.timeStop?.enabled ?? base.timeStop?.enabled ?? true,
      bars: Number(user.timeStop?.bars ?? base.timeStop?.bars ?? 16),
      minProgressR: Number(user.timeStop?.minProgressR ?? base.timeStop?.minProgressR ?? 0.5)
    },
    partialTp1Enabled: user.partialTp1Enabled ?? base.partialTp1Enabled ?? true,
    partialTp1ClosePct: Number(user.partialTp1ClosePct ?? base.partialTp1ClosePct ?? 50),
    feeFloor: {
      ...base.feeFloor,
      ...(user.feeFloor || {}),
      enabled: user.feeFloor?.enabled ?? base.feeFloor?.enabled ?? true,
      roundTripFeePct: Number(user.feeFloor?.roundTripFeePct ?? base.feeFloor?.roundTripFeePct ?? 0.177),
      divisor: Number(user.feeFloor?.divisor ?? base.feeFloor?.divisor ?? 0.20)
    }
  };
}

export function validateLsrConfig(cfg: LsrV2Config): string[] {
  const errs: string[] = [];
  if (!cfg.executionTimeframe) errs.push('Execution timeframe is required');
  if (cfg.minStructuralRR < 1.0) errs.push('Min structural RR must be >= 1.0');
  return errs;
}

export function calcFeeShareOfR(feeFloorPct: number, stopPct: number): number {
  if (feeFloorPct <= 0 || stopPct <= 0) return 0;
  return Math.min(feeFloorPct, stopPct) / Math.max(feeFloorPct, stopPct);
}

/**
 * Maps LsrV2Config (from UI) to DeepPartial<SweepConfig> so any user configuration
 * made in the frontend is directly applied to the active engine execution.
 */
export function lsrV2ConfigToSweepConfigOverrides(
  v2?: Partial<LsrV2Config>,
  rawSettings?: any
): DeepPartial<SweepConfig> {
  const overrides: DeepPartial<SweepConfig> = {};

  // Preserve existing explicit lsrOverrides if present
  if (rawSettings?.lsrOverrides && typeof rawSettings.lsrOverrides === 'object') {
    Object.assign(overrides, rawSettings.lsrOverrides);
  }

  if (v2) {
    if (v2.executionTimeframe || v2.contextTimeframe) {
      overrides.timeframes = {
        execution: v2.executionTimeframe || overrides.timeframes?.execution || '15m',
        direction: v2.contextTimeframe || overrides.timeframes?.direction || '1h'
      };
    }

    const sweepPatch: any = {};
    if (v2.sweepMinAtr !== undefined) sweepPatch.minDepthATR = Number(v2.sweepMinAtr);
    if (v2.sweepMaxAtr !== undefined) sweepPatch.maxDepthATR = Number(v2.sweepMaxAtr);
    if (v2.maxReacceptanceBars !== undefined) sweepPatch.reclaimWithinBars = Number(v2.maxReacceptanceBars);
    if (v2.volumeGate?.volMultiple !== undefined) {
      sweepPatch.minRelVolume = v2.volumeGate.enabled ? Number(v2.volumeGate.volMultiple) : 1.0;
    }
    if (Object.keys(sweepPatch).length > 0) {
      overrides.sweep = { ...(overrides.sweep || {}), ...sweepPatch };
    }

    if (v2.poolQuality?.minScore !== undefined) {
      overrides.pools = { ...(overrides.pools || {}), minScore: Number(v2.poolQuality.minScore) };
    }

    if (v2.locationGate?.edgePct !== undefined) {
      overrides.direction = { ...(overrides.direction || {}), edgeZonePct: Number(v2.locationGate.edgePct) };
    }

    if (v2.starShape?.wickToRange !== undefined) {
      overrides.trigger = { ...(overrides.trigger || {}), minWickToRange: Number(v2.starShape.wickToRange) };
    }

    const riskPatch: any = {};
    if (v2.minStructuralRR !== undefined) riskPatch.minRR = Number(v2.minStructuralRR);
    if (v2.sl?.atrBuffer !== undefined) riskPatch.stopBufferATR = Number(v2.sl.atrBuffer);
    if (v2.sl?.triggerPrice !== undefined) riskPatch.stopTrigger = v2.sl.triggerPrice;
    if (v2.feeFloor?.divisor !== undefined) riskPatch.maxFeeToRisk = Number(v2.feeFloor.divisor);
    if (Object.keys(riskPatch).length > 0) {
      overrides.risk = { ...(overrides.risk || {}), ...riskPatch };
    }

    const exitPatch: any = {};
    if (v2.partialTp1ClosePct !== undefined) {
      exitPatch.tp1 = { closePct: Number(v2.partialTp1ClosePct) };
    }
    if (v2.timeStop !== undefined) {
      exitPatch.timeStopBars = v2.timeStop.enabled ? Number(v2.timeStop.bars) : 0;
    }
    if (Object.keys(exitPatch).length > 0) {
      overrides.exits = { ...(overrides.exits || {}), ...exitPatch };
    }
  }

  // Top level settings overrides if present
  if (rawSettings) {
    if (!overrides.universe) overrides.universe = {} as any;
    overrides.universe.maxRank = Math.max(60, Number(rawSettings.coinCount || 60));

    if (!overrides.coin) overrides.coin = {} as any;
    if (rawSettings.layer3MaxSpreadBps !== undefined) {
      overrides.coin.maxSpreadBps = Number(rawSettings.layer3MaxSpreadBps);
    }

    if (rawSettings.lsrMinRewardRisk !== undefined) {
      if (!overrides.risk) overrides.risk = {};
      overrides.risk.minRR = Number(rawSettings.lsrMinRewardRisk);
    }
    if (rawSettings.lsrExecutionTimeframe) {
      if (!overrides.timeframes) overrides.timeframes = {};
      overrides.timeframes.execution = rawSettings.lsrExecutionTimeframe;
    }
    if (rawSettings.lsrContextTimeframe) {
      if (!overrides.timeframes) overrides.timeframes = {};
      overrides.timeframes.direction = rawSettings.lsrContextTimeframe;
    }
  }

  return overrides;
}

