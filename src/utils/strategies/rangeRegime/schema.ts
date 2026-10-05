/**
 * RANGE_REGIME_V1 — parameter schema for the front end.
 *
 * Single source of truth:
 *  - the UI renders its controls from PARAMS (min / max / step / options / group)
 *  - the strategy reads values from a RangeConfig
 *  - validate() guards every save from the UI
 *
 * Notation: ATR_dir = ATR(14) on directionTF, ATR_exec = ATR(14) on executionTF.
 * `basic: true` params show by default; the rest sit under an "Advanced" toggle.
 */

export type Tf = '1m' | '3m' | '5m' | '15m' | '30m' | '1h' | '2h' | '4h';

export const TF_MINUTES: Record<Tf, number> = {
  '1m': 1, '3m': 3, '5m': 5, '15m': 15, '30m': 30, '1h': 60, '2h': 120, '4h': 240,
};

export type Group =
  | 'Timeframes' | 'Direction' | 'Regime' | 'Range' | 'Setups'
  | 'Confluence' | 'Stop loss' | 'Take profit' | 'Management' | 'Risk';

export interface Base { key: string; label: string; group: Group; help: string; advanced: boolean }
export interface NumParam extends Base { type: 'number'; default: number; min: number; max: number; step: number; unit?: string }
export interface BoolParam extends Base { type: 'boolean'; default: boolean }
export interface SelParam extends Base { type: 'select'; default: string; options: string[] }
export type ParamDef = NumParam | BoolParam | SelParam;
export type RangeConfig = Record<string, number | boolean | string>;

type Opt = { unit?: string; basic?: boolean };

const num = (
  key: string, label: string, group: Group, def: number,
  min: number, max: number, step: number, help: string, o: Opt = {},
): NumParam => ({ type: 'number', key, label, group, default: def, min, max, step, help, unit: o.unit, advanced: !o.basic });

const bool = (key: string, label: string, group: Group, def: boolean, help: string, o: Opt = {}): BoolParam =>
  ({ type: 'boolean', key, label, group, default: def, help, advanced: !o.basic });

const sel = (key: string, label: string, group: Group, def: string, options: string[], help: string, o: Opt = {}): SelParam =>
  ({ type: 'select', key, label, group, default: def, options, help, advanced: !o.basic });

export const PARAMS: ParamDef[] = [
  // ── Timeframes ────────────────────────────────────────────────────────────
  sel('directionTF', 'Direction / range timeframe', 'Timeframes', '1h', ['15m', '30m', '1h', '2h', '4h'],
    'Defines the regime, the range edges and the drift bias. Keep it at least 3x the execution timeframe.', { basic: true }),
  sel('executionTF', 'Execution timeframe', 'Timeframes', '5m', ['1m', '3m', '5m', '15m'],
    'Setups trigger on closed candles of this timeframe.', { basic: true }),

  // ── Direction ─────────────────────────────────────────────────────────────
  sel('biasMode', 'Direction mode', 'Direction', 'AUTO', ['AUTO', 'BOTH', 'LONG_ONLY', 'SHORT_ONLY'],
    'AUTO = drift bias from EMA50 slope on directionTF plus price vs. range mid.', { basic: true }),
  sel('counterBiasPolicy', 'Fades against the drift', 'Direction', 'SIZE_DOWN', ['SIZE_DOWN', 'A_GRADE_ONLY', 'BLOCK'],
    'How to treat fades that go against the AUTO bias.'),
  num('counterBiasSizeMult', 'Counter-drift size multiplier', 'Direction', 0.5, 0.25, 1, 0.05,
    'Risk multiplier when policy is SIZE_DOWN.'),

  // ── Regime ────────────────────────────────────────────────────────────────
  num('regimeMinScore', 'Min regime score', 'Regime', 60, 30, 90, 5,
    '0-100 score (ADX weak, low efficiency, mid crossings, ATR stable, edge tested). Lower = more active.', { basic: true }),
  num('adxPeriod', 'ADX period', 'Regime', 14, 7, 30, 1, 'ADX length on directionTF.'),
  num('adxSoftMax', 'ADX full-credit level', 'Regime', 22, 15, 30, 1, 'ADX at or below this earns full trend-weakness points.'),
  num('adxHardMax', 'ADX hard veto', 'Regime', 30, 22, 40, 1, 'ADX above this = not a range, no fades.'),
  num('erMax', 'Efficiency ratio full-credit level', 'Regime', 0.30, 0.15, 0.6, 0.05, 'Kaufman ER(20) at or below this earns full points.'),
  num('minMidCrosses', 'Min mid-range crossings', 'Regime', 3, 1, 8, 1, 'Times price crossed the range midpoint inside the lookback.'),
  num('atrExpansionMax', 'Max ATR expansion', 'Regime', 1.3, 1.0, 2.0, 0.05, 'ATR_dir / SMA50(ATR_dir). Above this the range is heating up.'),

  // ── Range ─────────────────────────────────────────────────────────────────
  num('rangeLookbackBars', 'Range lookback', 'Range', 48, 24, 120, 4, 'Bars of directionTF used to build the range.', { unit: 'bars' }),
  num('pivotLen', 'Pivot length', 'Range', 3, 2, 6, 1, 'Left/right bars for swing pivots that define edges.'),
  num('minEdgeTouches', 'Min edge tests', 'Range', 2, 1, 4, 1, 'Times the traded edge has been tested (the original pivot counts as 1).', { basic: true }),
  num('touchTolAtr', 'Edge cluster tolerance', 'Range', 0.35, 0.15, 0.7, 0.05, 'Pivots within this x ATR_dir of the extreme form the edge.'),
  num('minRangeAtr', 'Min range height', 'Range', 2.5, 1.5, 5, 0.1, 'x ATR_dir. Too tight = no room to pay fees.'),
  num('maxRangeAtr', 'Max range height', 'Range', 8, 4, 15, 0.5, 'x ATR_dir. Wider than this is a swing, not a range.'),
  num('edgeZonePct', 'Edge zone depth', 'Range', 0.20, 0.10, 0.35, 0.01, 'Fraction of range height, measured inward from each edge.', { basic: true }),
  num('breakConfirmAtr', 'Range-break confirmation', 'Range', 0.30, 0.1, 1, 0.05, 'directionTF close beyond the edge by this x ATR_dir = range broken.'),
  sel('onRangeBreak', 'On range break', 'Range', 'HOLD_SL', ['HOLD_SL', 'CLOSE'], 'What to do with open range trades when the range breaks.'),

  // ── Setups ────────────────────────────────────────────────────────────────
  bool('enableEdgeRejection', 'S1 Edge rejection', 'Setups', true, 'Fade a closed rejection/reclaim candle at the edge zone.', { basic: true }),
  bool('enableSweepReclaim', 'S2 Sweep & reclaim', 'Setups', true, 'Fade a poke beyond the edge that closes back inside.', { basic: true }),
  bool('enableBandSnapback', 'S3 Band snap-back (Grade B)', 'Setups', true, 'Inside-range Bollinger re-entry targeting the mid.', { basic: true }),
  sel('triggerMode', 'S1 trigger', 'Setups', 'EITHER', ['EITHER', 'REJECTION_CANDLE', 'RECLAIM_CLOSE'], 'Which candle pattern confirms S1.'),
  num('rejWickPct', 'Rejection wick', 'Setups', 0.40, 0.25, 0.7, 0.05, 'Min wick as a fraction of the trigger candle range.'),
  num('closeLocationMin', 'Close location', 'Setups', 0.60, 0.5, 0.8, 0.05, 'Trigger close must sit in the favourable end of its range.'),
  num('zoneTouchLookback', 'Zone-touch lookback', 'Setups', 3, 1, 6, 1, 'Execution bars in which price must have touched the edge zone.', { unit: 'bars' }),
  num('impulseVetoAtr', 'Impulse veto', 'Setups', 2.0, 1.2, 3.5, 0.1, 'Skip S1 if a bar this x ATR_exec just closed through the zone.'),
  num('sweepMinAtr', 'Min sweep depth', 'Setups', 0.10, 0.02, 0.5, 0.01, 'x ATR_exec beyond the edge.'),
  num('sweepMaxAtrDir', 'Max sweep depth', 'Setups', 0.60, 0.2, 1.2, 0.05, 'x ATR_dir. Deeper than this is a breakout, not a sweep.'),
  num('reclaimBars', 'Reclaim window', 'Setups', 3, 1, 5, 1, 'Bars allowed for the close back inside the range.', { unit: 'bars' }),
  num('bbPeriod', 'Bollinger period', 'Setups', 20, 10, 40, 1, 'S3 band length on executionTF.'),
  num('bbStd', 'Bollinger deviation', 'Setups', 2.0, 1.5, 3, 0.1, 'S3 band width.'),
  num('rsiPeriod', 'RSI period', 'Setups', 14, 7, 21, 1, 'RSI length on executionTF.'),
  num('rsiOversold', 'RSI oversold', 'Setups', 32, 20, 40, 1, 'S3 long needs RSI at/below this within the last 3 bars.'),
  num('rsiOverbought', 'RSI overbought', 'Setups', 68, 60, 80, 1, 'S3 short needs RSI at/above this within the last 3 bars.'),
  num('snapbackRangePosPct', 'S3 range position', 'Setups', 0.30, 0.10, 0.45, 0.05, 'S3 longs only in the bottom X of the range, shorts in the top X.'),

  // ── Confluence (soft — this is the frequency dial) ───────────────────────
  num('minConfluence', 'Min confluence', 'Confluence', 1, 0, 5, 1, '0 = any valid setup. Higher = fewer, cleaner signals.', { basic: true }),
  num('gradeAMin', 'Grade A at confluence >=', 'Confluence', 3, 2, 5, 1, 'Grade A gets full risk, Grade B gets the B multiplier.'),
  num('volSpikeMult', 'Volume spike', 'Confluence', 1.3, 1.0, 3, 0.1, 'Test/sweep bar volume vs SMA20 for the volume point.'),
  num('levelConfluenceAtr', 'Level confluence distance', 'Confluence', 0.30, 0.1, 1, 0.05, 'PDH/PDL/VWAP/session extreme within this x ATR_dir of the edge.'),

  // ── Stop loss ─────────────────────────────────────────────────────────────
  num('slBufferAtr', 'SL buffer', 'Stop loss', 0.20, 0.05, 0.6, 0.05, 'x ATR_exec beyond the invalidation extreme.', { basic: true }),
  num('minStopAtr', 'Min stop distance', 'Stop loss', 0.6, 0.3, 1.5, 0.05, 'x ATR_exec. Stops tighter than this are widened, not rejected.'),
  num('maxStopPctOfRange', 'Max stop vs range', 'Stop loss', 0.30, 0.15, 0.6, 0.05, 'Stop distance as a fraction of range height; wider = rejected.'),
  num('maxFeeShareOfR', 'Max fee share of R', 'Stop loss', 0.30, 0.1, 0.6, 0.05, 'Round-trip fee / stop distance. Rejects trades where fees eat the risk.', { basic: true }),
  num('feeRoundTripPct', 'Round-trip fee', 'Stop loss', 0.118, 0.02, 0.3, 0.001, '% of notional: 2 x 0.05% taker x 1.18 GST. Lower it if exits are maker fills.', { unit: '%' }),

  // ── Take profit ───────────────────────────────────────────────────────────
  sel('tp1Mode', 'TP1 target', 'Take profit', 'NEAREST_LEVEL', ['NEAREST_LEVEL', 'RANGE_MID', 'VWAP'], 'Nearest important level that clears the TP1 min R, or a fixed choice.'),
  num('tp1ClosePct', 'Close at TP1', 'Take profit', 50, 0, 100, 5, 'Share of the position closed at TP1.', { unit: '%', basic: true }),
  num('tp1MinR', 'TP1 min R', 'Take profit', 0.8, 0.5, 2, 0.1, 'A level closer than this is skipped for the next one.'),
  num('tp2FrontRunPct', 'TP2 front-run', 'Take profit', 0.10, 0, 0.3, 0.01, 'Fraction of range height kept inside the opposite edge.'),
  num('tp2MinR', 'TP2 min R', 'Take profit', 1.8, 1.0, 4, 0.1, 'Opposite-edge target must offer at least this R.', { basic: true }),
  num('minBlendedNetR', 'Min blended net R', 'Take profit', 1.2, 0.8, 3, 0.1, 'Blended R of TP1/TP2 after fees. Below = RR_TOO_LOW.'),
  bool('moveToBeAfterTp1', 'Stop to breakeven after TP1', 'Take profit', true, 'Moves SL to entry plus round-trip fees once TP1 fills.'),

  // ── Management ────────────────────────────────────────────────────────────
  num('timeStopBars', 'Time stop', 'Management', 18, 0, 60, 1, 'Execution bars. 0 = off.', { unit: 'bars', basic: true }),
  num('timeStopMinR', 'Time-stop progress', 'Management', 0.3, 0, 1, 0.1, 'Exit at the time stop if open profit is below this R.'),
  num('maxEntriesPerEdge', 'Max entries per edge', 'Management', 3, 1, 6, 1, 'Each retest weakens a level; stop fading it after this many.'),
  num('cooldownBarsAfterLoss', 'Cooldown after loss', 'Management', 6, 0, 30, 1, 'Execution bars before the same symbol can re-enter.', { unit: 'bars' }),
  num('maxSlippageR', 'Max entry slippage', 'Management', 0.15, 0.05, 0.5, 0.05, 'Skip if price has run this many R from the signal close.'),
  num('maxSignalsPerSymbolPerDay', 'Max signals / symbol / day', 'Management', 6, 1, 20, 1, 'Overtrading cap per symbol.', { basic: true }),

  // ── Risk ──────────────────────────────────────────────────────────────────
  num('riskPctPerTrade', 'Risk per trade', 'Risk', 1.0, 0.1, 2, 0.1, '% of account at Grade A.', { unit: '%', basic: true }),
  num('gradeBRiskMult', 'Grade B risk multiplier', 'Risk', 0.6, 0.25, 1, 0.05, 'Applied to Grade B and all S3 trades.'),
];

export const DEFAULTS: RangeConfig = Object.fromEntries(PARAMS.map((p) => [p.key, p.default])) as RangeConfig;

/** Frequency dial: one-click presets. Anything not listed keeps its default. */
export const PRESETS: Record<'strict' | 'balanced' | 'loose', Partial<RangeConfig>> = {
  strict: { regimeMinScore: 70, minEdgeTouches: 3, minConfluence: 3, tp2MinR: 2.2, maxFeeShareOfR: 0.2, enableBandSnapback: false, reclaimBars: 2 },
  balanced: {},
  loose: { regimeMinScore: 50, adxSoftMax: 25, edgeZonePct: 0.25, zoneTouchLookback: 4, minConfluence: 0, tp2MinR: 1.5, minBlendedNetR: 1.1, maxFeeShareOfR: 0.4 },
};

export const applyPreset = (name: keyof typeof PRESETS): RangeConfig => ({ ...DEFAULTS, ...PRESETS[name] });

/** Log one of these for every rejected candidate; the UI shows a per-gate histogram. */
export const REJECT = [
  'REGIME_SCORE_LOW', 'ADX_HARD_VETO', 'RANGE_TOO_NARROW', 'RANGE_TOO_WIDE', 'RANGE_BROKEN',
  'EDGE_UNPROVEN', 'NOT_IN_EDGE_ZONE', 'NO_TRIGGER', 'IMPULSE_VETO', 'CONFLUENCE_LOW',
  'COUNTER_BIAS_BLOCKED', 'STOP_TOO_WIDE', 'FEE_GATE', 'RR_TOO_LOW',
  'EDGE_TOUCH_LIMIT', 'COOLDOWN', 'DAILY_CAP', 'SLIPPAGE_GUARD',
] as const;
export type RejectCode = (typeof REJECT)[number];

export function validate(cfg: RangeConfig): string[] {
  const errs: string[] = [];
  for (const p of PARAMS) {
    const v = cfg[p.key];
    if (p.type === 'number') {
      if (typeof v !== 'number' || Number.isNaN(v) || v < p.min || v > p.max) errs.push(`${p.key} must be between ${p.min} and ${p.max}`);
    } else if (p.type === 'boolean') {
      if (typeof v !== 'boolean') errs.push(`${p.key} must be true or false`);
    } else if (typeof v !== 'string' || !p.options.includes(v)) {
      errs.push(`${p.key} must be one of ${p.options.join(', ')}`);
    }
  }
  const exec = TF_MINUTES[cfg.executionTF as Tf];
  const dir = TF_MINUTES[cfg.directionTF as Tf];
  if (exec && dir && dir / exec < 3) errs.push('directionTF should be at least 3x executionTF');
  if ((cfg.adxSoftMax as number) >= (cfg.adxHardMax as number)) errs.push('adxSoftMax must be below adxHardMax');
  if ((cfg.tp1MinR as number) >= (cfg.tp2MinR as number)) errs.push('tp1MinR must be below tp2MinR');
  if ((cfg.minConfluence as number) > (cfg.gradeAMin as number)) errs.push('minConfluence cannot exceed gradeAMin');
  if ((cfg.rsiOversold as number) >= (cfg.rsiOverbought as number)) errs.push('rsiOversold must be below rsiOverbought');
  if ((cfg.minRangeAtr as number) >= (cfg.maxRangeAtr as number)) errs.push('minRangeAtr must be below maxRangeAtr');
  return errs;
}
