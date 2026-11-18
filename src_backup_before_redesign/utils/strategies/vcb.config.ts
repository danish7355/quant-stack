// vcb.config.ts — Volatility Compression Breakout (intraday)
// Single source of truth: types, defaults, presets, UI metadata, validation, fee math.
// The front end renders controls from VCB_UI; the strategy reads VcbParams only.

export type Timeframe = '1m' | '3m' | '5m' | '15m' | '30m' | '1h' | '4h';
export type DirectionPolicy = 'WITH_BIAS' | 'BOTH' | 'LONG_ONLY' | 'SHORT_ONLY';
export type BiasMethod = 'EMA' | 'STRUCTURE' | 'VWAP';
export type EntryMode = 'HYBRID' | 'BREAKOUT_CLOSE' | 'RETEST';
export type SlMode = 'LAST_SWING_IN_BASE' | 'BASE_OPPOSITE' | 'TRIGGER_CANDLE' | 'MIDLINE';
export type TpMode = 'LEVELS_TRAIL' | 'LEVELS' | 'MEASURED_MOVE';
export type LevelSource = 'HTF_SWING' | 'PREV_DAY' | 'WEEKLY' | 'SESSION' | 'EXEC_SWING' | 'ROUND_NUMBER' | 'MEASURED_MOVE';
export type Session = 'ASIA' | 'LONDON' | 'NY';
export type Regime = 'COMPRESSION' | 'TREND_PAUSE' | 'RANGE_EDGE';

export interface VcbParams {
  // ── Timeframes & direction
  executionTf: Timeframe;          // setup detection + trigger candle
  directionTf: Timeframe;          // bias / regime timeframe (must be > executionTf)
  levelTf: Timeframe;              // swing levels used for SL/TP (PDH/PDL, weekly, session always included)
  directionPolicy: DirectionPolicy;
  biasMethod: BiasMethod;
  biasEmaPeriod: number;
  neutralExtraScore: number;       // extra setup score required when bias is NEUTRAL (BOTH policy)

  // ── Regime gate
  regimeGate: boolean;
  allowedRegimes: Regime[];
  adxTrendMin: number;             // ADX(14) on directionTf above this = trending
  adxCompressionMax: number;       // ADX(14) below this = compressed / quiet
  maxAtrExpansionRatio: number;    // ATR14 / median ATR14(100) above this = already expanded → OFF
  btcGuard: boolean;               // block alt longs/shorts against a strong BTC directionTf move
  activeSessions: Session[];

  // ── Setup (the coil)
  baseMinBars: number;
  baseMaxBars: number;
  baseWidthMinAtr: number;         // base height lower bound in ATR (prevents noise-tight stops)
  baseWidthMaxAtr: number;         // base height upper bound in ATR
  squeezePercentileMax: number;    // Bollinger bandwidth percentile (120 bars) must be ≤ this
  rangeDecayMax: number;           // avg TR last third / avg TR first third of base
  volumeDryUpMax: number;          // avg vol last 5 bars / avg vol 20 bars
  boundaryTouchesMin: number;
  touchToleranceAtr: number;
  minSetupScore: number;           // 0-100; below this the setup is not a signal

  // ── Trigger & entry (closed candles only)
  entryMode: EntryMode;
  breakoutBufferAtr: number;       // close must be beyond boundary by this much
  triggerRangeMult: number;        // trigger candle range ≥ this × avg base candle range
  triggerCloseLocation: number;    // close location in candle (0-1); long needs ≥ this, short ≤ 1 - this
  triggerVolumeMult: number;       // trigger volume ≥ this × 20-bar avg
  maxExtensionAtr: number;         // beyond this from boundary → wait for retest instead of chasing
  retestWindowBars: number;
  maxEntryDriftAtr: number;        // cancel if price drifted further than this from trigger close

  // ── Stop loss
  slMode: SlMode;
  slBufferAtr: number;
  minStopAtr: number;              // structural stop tighter than this is widened to it
  maxStopAtr: number;              // stop wider than this → fall back to MIDLINE, else skip
  failedBreakoutExit: boolean;
  failBars: number;
  failDepthAtr: number;            // close back inside the base by this much within failBars = exit
  timeStopBars: number;            // exit if < 0.5R progress after this many bars

  // ── Take profit
  tpMode: TpMode;
  levelSources: LevelSource[];
  levelBufferAtr: number;          // place TP this far before the level
  minNetRrTp1: number;             // net of round-trip fees
  minNetRrTp2: number;
  minRoomToMajorLevelR: number;    // skip if a major level sits closer than this (blocked path)
  tp1ClosePct: number;
  tp2ClosePct: number;             // remainder runs on the trail
  moveToBeAfterTp1: boolean;
  trailAtrMult: number;            // chandelier multiple
  measuredMoveMult: number;        // × base height

  // ── Fees & gates
  takerFeePct: number;             // per side, %
  gstOnFeePct: number;
  maxFeeToRiskRatio: number;       // round-trip fee ÷ stop distance
  minQuoteVolume24hUsd: number;
  maxSpreadBps: number;

  // ── Signal flow
  executeMinScore: number;         // signals ≥ minSetupScore are logged; only ≥ this are sent to AutoTrader
  cooldownBars: number;            // per symbol, after a signal
  maxSignalsPerSymbolPerDay: number;
}

export const VCB_DEFAULTS: VcbParams = {
  executionTf: '5m', directionTf: '1h', levelTf: '1h',
  directionPolicy: 'WITH_BIAS', biasMethod: 'EMA', biasEmaPeriod: 50, neutralExtraScore: 10,

  regimeGate: true, allowedRegimes: ['COMPRESSION', 'TREND_PAUSE'],
  adxTrendMin: 22, adxCompressionMax: 20, maxAtrExpansionRatio: 1.8,
  btcGuard: true, activeSessions: ['ASIA', 'LONDON', 'NY'],

  baseMinBars: 8, baseMaxBars: 30, baseWidthMinAtr: 1.2, baseWidthMaxAtr: 3.5,
  squeezePercentileMax: 35, rangeDecayMax: 0.85, volumeDryUpMax: 0.85,
  boundaryTouchesMin: 2, touchToleranceAtr: 0.25, minSetupScore: 60,

  entryMode: 'HYBRID', breakoutBufferAtr: 0.10, triggerRangeMult: 1.2,
  triggerCloseLocation: 0.65, triggerVolumeMult: 1.3, maxExtensionAtr: 1.0,
  retestWindowBars: 6, maxEntryDriftAtr: 0.15,

  slMode: 'LAST_SWING_IN_BASE', slBufferAtr: 0.15, minStopAtr: 0.8, maxStopAtr: 2.2,
  failedBreakoutExit: true, failBars: 4, failDepthAtr: 0.3, timeStopBars: 24,

  tpMode: 'LEVELS_TRAIL',
  levelSources: ['HTF_SWING', 'PREV_DAY', 'WEEKLY', 'SESSION', 'EXEC_SWING', 'MEASURED_MOVE'],
  levelBufferAtr: 0.10, minNetRrTp1: 1.5, minNetRrTp2: 2.5, minRoomToMajorLevelR: 1.5,
  tp1ClosePct: 50, tp2ClosePct: 30, moveToBeAfterTp1: true, trailAtrMult: 2.5, measuredMoveMult: 1.0,

  takerFeePct: 0.05, gstOnFeePct: 18, maxFeeToRiskRatio: 0.25,
  minQuoteVolume24hUsd: 30_000_000, maxSpreadBps: 6,

  executeMinScore: 70, cooldownBars: 12, maxSignalsPerSymbolPerDay: 3,
};

export type PresetName = 'AGGRESSIVE' | 'BALANCED' | 'STRICT';

export const VCB_PRESETS: Record<PresetName, Partial<VcbParams>> = {
  AGGRESSIVE: {
    directionPolicy: 'BOTH', allowedRegimes: ['COMPRESSION', 'TREND_PAUSE', 'RANGE_EDGE'],
    squeezePercentileMax: 45, baseWidthMaxAtr: 4.5, rangeDecayMax: 1.0, volumeDryUpMax: 1.0,
    boundaryTouchesMin: 1, triggerVolumeMult: 1.15, triggerCloseLocation: 0.6,
    minSetupScore: 55, executeMinScore: 62, minNetRrTp1: 1.3, minRoomToMajorLevelR: 1.2,
    maxFeeToRiskRatio: 0.30, maxSignalsPerSymbolPerDay: 4,
  },
  BALANCED: {},
  STRICT: {
    entryMode: 'RETEST', squeezePercentileMax: 25, baseWidthMaxAtr: 3.0, rangeDecayMax: 0.75,
    volumeDryUpMax: 0.75, boundaryTouchesMin: 3, triggerVolumeMult: 1.6, triggerCloseLocation: 0.75,
    minSetupScore: 72, executeMinScore: 80, minNetRrTp1: 2.0, minNetRrTp2: 3.0,
    minRoomToMajorLevelR: 2.0, maxFeeToRiskRatio: 0.18, maxSignalsPerSymbolPerDay: 2,
  },
};

export const applyPreset = (name: PresetName, overrides: Partial<VcbParams> = {}): VcbParams => ({
  ...VCB_DEFAULTS, ...VCB_PRESETS[name], ...overrides,
});

// ── Fee math (use the same numbers in backtest and live gating)
export const roundTripFeePct = (p: VcbParams): number =>
  2 * p.takerFeePct * (1 + p.gstOnFeePct / 100);                 // 0.118% of notional at defaults

export const feeToRiskRatio = (stopDistancePct: number, p: VcbParams): number =>
  roundTripFeePct(p) / stopDistancePct;

export const netRR = (rewardPct: number, riskPct: number, p: VcbParams): number => {
  const f = roundTripFeePct(p);
  return (rewardPct - f) / (riskPct + f);
};

// ── Validation (run on every front-end change; show messages inline)
const TF_MIN: Record<Timeframe, number> = { '1m': 1, '3m': 3, '5m': 5, '15m': 15, '30m': 30, '1h': 60, '4h': 240 };

export function validateVcb(p: VcbParams): string[] {
  const e: string[] = [];
  if (TF_MIN[p.executionTf] >= TF_MIN[p.directionTf]) e.push('Direction timeframe must be higher than execution timeframe.');
  if (TF_MIN[p.levelTf] < TF_MIN[p.executionTf]) e.push('Level timeframe must be at or above execution timeframe.');
  if (p.baseMinBars >= p.baseMaxBars) e.push('Base min bars must be less than max bars.');
  if (p.baseWidthMinAtr >= p.baseWidthMaxAtr) e.push('Base min width must be less than max width.');
  if (p.minStopAtr >= p.maxStopAtr) e.push('Min stop must be less than max stop.');
  if (p.minNetRrTp2 <= p.minNetRrTp1) e.push('TP2 net RR must exceed TP1 net RR.');
  if (p.tp1ClosePct + p.tp2ClosePct > 100) e.push('TP1 + TP2 close % cannot exceed 100.');
  if (p.executeMinScore < p.minSetupScore) e.push('Execute score must be ≥ setup score.');
  if (p.regimeGate && p.allowedRegimes.length === 0) e.push('Select at least one allowed regime or turn the regime gate off.');
  if (p.levelSources.length === 0) e.push('Select at least one level source.');
  return e;
}

// ── Rejection codes (feeds the signal-funnel panel: which gate kills the most setups)
export type RejectCode =
  | 'REGIME_OFF' | 'SESSION_OFF' | 'LIQUIDITY' | 'BIAS_MISMATCH' | 'BTC_GUARD'
  | 'NO_BASE' | 'BASE_TOO_WIDE' | 'BASE_TOO_TIGHT' | 'SQUEEZE_WEAK' | 'LOW_SCORE'
  | 'TRIGGER_WEAK' | 'OVEREXTENDED' | 'ENTRY_DRIFT' | 'RETEST_TIMEOUT'
  | 'STOP_TOO_WIDE' | 'BLOCKED_BY_LEVEL' | 'FEE_DRAG' | 'RR_TOO_LOW'
  | 'COOLDOWN' | 'SYMBOL_DAILY_CAP';

// ── UI metadata: the front end renders every control from this map
export type Group =
  | 'Timeframes & Direction' | 'Regime' | 'Setup (Coil)' | 'Trigger & Entry'
  | 'Stop Loss' | 'Take Profit' | 'Fees & Gates' | 'Signal Flow';

interface UiBase { group: Group; label: string; help: string; advanced?: boolean }
export type ParamUi =
  | (UiBase & { kind: 'number'; min: number; max: number; step: number; unit?: string })
  | (UiBase & { kind: 'select'; options: readonly string[] })
  | (UiBase & { kind: 'multi'; options: readonly string[] })
  | (UiBase & { kind: 'toggle' });

const num = (group: Group, label: string, min: number, max: number, step: number, help: string, unit?: string, advanced = false): ParamUi =>
  ({ group, label, kind: 'number', min, max, step, help, unit, advanced });
const sel = (group: Group, label: string, options: readonly string[], help: string, advanced = false): ParamUi =>
  ({ group, label, kind: 'select', options, help, advanced });
const multi = (group: Group, label: string, options: readonly string[], help: string, advanced = false): ParamUi =>
  ({ group, label, kind: 'multi', options, help, advanced });
const tog = (group: Group, label: string, help: string, advanced = false): ParamUi =>
  ({ group, label, kind: 'toggle', help, advanced });

const TFS = ['1m', '3m', '5m', '15m', '30m', '1h', '4h'] as const;
const TF = 'Timeframes & Direction', RG = 'Regime', ST = 'Setup (Coil)', TR = 'Trigger & Entry',
  SL = 'Stop Loss', TP = 'Take Profit', FG = 'Fees & Gates', SF = 'Signal Flow';

export const VCB_UI: Record<keyof VcbParams, ParamUi> = {
  executionTf: sel(TF, 'Execution timeframe', TFS, 'Where the coil and trigger candle are detected.'),
  directionTf: sel(TF, 'Direction timeframe', TFS, 'Bias and regime come from this timeframe. Must be above execution.'),
  levelTf: sel(TF, 'Level timeframe', TFS, 'Swing highs/lows on this timeframe become SL/TP levels.'),
  directionPolicy: sel(TF, 'Direction policy', ['WITH_BIAS', 'BOTH', 'LONG_ONLY', 'SHORT_ONLY'], 'WITH_BIAS trades only the direction timeframe bias.'),
  biasMethod: sel(TF, 'Bias method', ['EMA', 'STRUCTURE', 'VWAP'], 'How direction is decided on the direction timeframe.'),
  biasEmaPeriod: num(TF, 'Bias EMA period', 20, 200, 1, 'Price vs EMA and EMA slope define bias.', undefined, true),
  neutralExtraScore: num(TF, 'Neutral-bias extra score', 0, 25, 1, 'Extra score needed when bias is neutral and policy is BOTH.', 'pts', true),

  regimeGate: tog(RG, 'Regime gate', 'Only scan when the market regime suits VCB.'),
  allowedRegimes: multi(RG, 'Allowed regimes', ['COMPRESSION', 'TREND_PAUSE', 'RANGE_EDGE'], 'Regimes in which VCB is active.'),
  adxTrendMin: num(RG, 'ADX trend threshold', 15, 35, 1, 'ADX above this = trending.', undefined, true),
  adxCompressionMax: num(RG, 'ADX compression ceiling', 10, 28, 1, 'ADX below this = quiet / compressed.', undefined, true),
  maxAtrExpansionRatio: num(RG, 'Max ATR expansion', 1.2, 3, 0.1, 'Above this the move has already expanded; VCB turns off.', '×', true),
  btcGuard: tog(RG, 'BTC guard', 'Block alt trades against a strong BTC move on the direction timeframe.'),
  activeSessions: multi(RG, 'Active sessions', ['ASIA', 'LONDON', 'NY'], 'Trade only inside these sessions.'),

  baseMinBars: num(ST, 'Base min bars', 5, 20, 1, 'Shortest valid coil.'),
  baseMaxBars: num(ST, 'Base max bars', 15, 60, 1, 'Longest valid coil.'),
  baseWidthMinAtr: num(ST, 'Base min width', 0.6, 3, 0.1, 'Too-tight bases give noise-sized stops and fee drag.', 'ATR'),
  baseWidthMaxAtr: num(ST, 'Base max width', 2, 6, 0.1, 'Wider than this is a range, not a coil.', 'ATR'),
  squeezePercentileMax: num(ST, 'Squeeze percentile', 10, 60, 1, 'Bandwidth percentile ceiling. Higher = more signals.', '%'),
  rangeDecayMax: num(ST, 'Range decay', 0.5, 1.1, 0.05, 'Last third of base vs first third. Lower = tighter contraction.', '×', true),
  volumeDryUpMax: num(ST, 'Volume dry-up', 0.5, 1.1, 0.05, 'Recent volume vs 20-bar average.', '×', true),
  boundaryTouchesMin: num(ST, 'Boundary touches', 1, 4, 1, 'Times price tested the breakout side.'),
  touchToleranceAtr: num(ST, 'Touch tolerance', 0.1, 0.5, 0.05, 'How close counts as a touch.', 'ATR', true),
  minSetupScore: num(ST, 'Min setup score', 40, 90, 1, 'Below this the setup is rejected.', 'pts'),

  entryMode: sel(TR, 'Entry mode', ['HYBRID', 'BREAKOUT_CLOSE', 'RETEST'], 'HYBRID = enter on close if not extended, else wait for retest.'),
  breakoutBufferAtr: num(TR, 'Breakout buffer', 0.02, 0.4, 0.01, 'Close must clear the boundary by this much.', 'ATR'),
  triggerRangeMult: num(TR, 'Trigger range', 0.8, 2.5, 0.1, 'Trigger candle range vs average base candle.', '×'),
  triggerCloseLocation: num(TR, 'Close location', 0.5, 0.9, 0.05, 'Higher = close nearer the candle extreme.'),
  triggerVolumeMult: num(TR, 'Trigger volume', 1, 3, 0.05, 'Trigger volume vs 20-bar average.', '×'),
  maxExtensionAtr: num(TR, 'Max extension', 0.3, 2, 0.1, 'Further than this from the boundary: wait for retest.', 'ATR'),
  retestWindowBars: num(TR, 'Retest window', 2, 15, 1, 'Bars to wait for a retest before cancelling.', 'bars', true),
  maxEntryDriftAtr: num(TR, 'Max entry drift', 0.05, 0.5, 0.01, 'Cancel if price moved this far from trigger close.', 'ATR', true),

  slMode: sel(SL, 'Stop placement', ['LAST_SWING_IN_BASE', 'BASE_OPPOSITE', 'TRIGGER_CANDLE', 'MIDLINE'], 'Where the structural stop sits.'),
  slBufferAtr: num(SL, 'Stop buffer', 0.05, 0.5, 0.01, 'Distance beyond the structure.', 'ATR'),
  minStopAtr: num(SL, 'Min stop distance', 0.4, 1.5, 0.1, 'Tighter structural stops are widened to this.', 'ATR'),
  maxStopAtr: num(SL, 'Max stop distance', 1.2, 4, 0.1, 'Wider than this: fall back to midline, else skip.', 'ATR'),
  failedBreakoutExit: tog(SL, 'Failed-breakout exit', 'Exit early if price closes back inside the base.'),
  failBars: num(SL, 'Fail window', 2, 10, 1, 'Bars after entry in which a re-entry counts as failure.', 'bars', true),
  failDepthAtr: num(SL, 'Fail depth', 0.1, 1, 0.05, 'How far back inside the base counts as failure.', 'ATR', true),
  timeStopBars: num(SL, 'Time stop', 6, 96, 1, 'Exit if under 0.5R progress after this many bars.', 'bars'),

  tpMode: sel(TP, 'Target mode', ['LEVELS_TRAIL', 'LEVELS', 'MEASURED_MOVE'], 'LEVELS_TRAIL = level targets, then trail the runner.'),
  levelSources: multi(TP, 'Level sources', ['HTF_SWING', 'PREV_DAY', 'WEEKLY', 'SESSION', 'EXEC_SWING', 'ROUND_NUMBER', 'MEASURED_MOVE'], 'Which levels may become targets.'),
  levelBufferAtr: num(TP, 'Target buffer', 0, 0.3, 0.01, 'Place the target this far before the level.', 'ATR', true),
  minNetRrTp1: num(TP, 'TP1 min net RR', 1, 3, 0.1, 'After round-trip fees.', 'R'),
  minNetRrTp2: num(TP, 'TP2 min net RR', 1.5, 6, 0.1, 'After round-trip fees.', 'R'),
  minRoomToMajorLevelR: num(TP, 'Room to major level', 0.8, 3, 0.1, 'Skip if a major level is closer than this.', 'R'),
  tp1ClosePct: num(TP, 'TP1 close', 0, 100, 5, 'Share of the position closed at TP1.', '%'),
  tp2ClosePct: num(TP, 'TP2 close', 0, 100, 5, 'Share closed at TP2; the rest trails.', '%'),
  moveToBeAfterTp1: tog(TP, 'Break-even after TP1', 'Move the stop to entry plus fees once TP1 fills.'),
  trailAtrMult: num(TP, 'Trail multiple', 1.5, 5, 0.1, 'Chandelier distance for the runner.', 'ATR'),
  measuredMoveMult: num(TP, 'Measured move', 0.5, 3, 0.1, 'Base height × this, projected from the boundary.', '×', true),

  takerFeePct: num(FG, 'Taker fee / side', 0, 0.2, 0.005, 'Per side, percent of notional.', '%', true),
  gstOnFeePct: num(FG, 'GST on fee', 0, 30, 1, 'Applied on top of the fee.', '%', true),
  maxFeeToRiskRatio: num(FG, 'Max fee ÷ risk', 0.05, 0.5, 0.01, 'Round-trip fee as a share of stop distance.'),
  minQuoteVolume24hUsd: num(FG, 'Min 24h volume', 1_000_000, 500_000_000, 1_000_000, 'Liquidity floor for the scan universe.', 'USD'),
  maxSpreadBps: num(FG, 'Max spread', 1, 30, 1, 'Skip if the spread is wider.', 'bps', true),

  executeMinScore: num(SF, 'Execute min score', 40, 95, 1, 'Signals below this are logged only, not sent to AutoTrader.', 'pts'),
  cooldownBars: num(SF, 'Cooldown', 0, 60, 1, 'Bars before the same symbol can signal again.', 'bars'),
  maxSignalsPerSymbolPerDay: num(SF, 'Max signals / symbol / day', 1, 10, 1, 'Daily cap per symbol.'),
};
