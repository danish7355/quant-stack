/**
 * TREND PULLBACK SWEEP REVERSAL (TPSR): Parameter Registry & Configuration Contract
 *
 * NON-NEGOTIABLE RULES:
 * 1. No hardcoded trading values in strategy calculation code.
 * 2. Every parameter definition is registered in REGISTRY with presets for 'strict', 'balanced', 'aggressive'.
 * 3. Resolution order: pinned user override > (preset * regime scaler) > registry fallback.
 * 4. Override rules:
 *    - Overrides are stored per-parameter separately from presets.
 *    - Switching mode updates only unpinned parameters. Pinned overrides are NEVER deleted.
 *    - Each parameter has an unpin button; panel has a reset-all button and count of pinned fields.
 * 5. Cross-field validation:
 *    - retrace.min < retrace.max
 *    - tp1.minRR < tp2.minRR
 *    - tp1.sharePct + tp2.sharePct <= 100
 *    - stop.minATR < stop.maxATR
 *    - rejection.minRangeATR < rejection.maxRangeATR
 */

export type TpsrMode = 'strict' | 'balanced' | 'aggressive';
export type RegimeTier = 'strong' | 'moderate' | 'emerging';
export type RegimeDirection = 'bull' | 'bear' | 'neutral';
export type ExitOnRegimeFlip = 'none' | 'tighten' | 'flatten';
export type EntryMethod = 'marketOnClose' | 'limitRetest';
export type EngulfRule =
  | 'body_covers_rejection_and_closes_beyond'
  | 'closes_beyond_rejection_extreme'
  | 'closes_beyond_rejection_midpoint';

export type ValueSource = 'pinned' | 'regime-adjusted' | 'preset';

export interface ParamDef {
  key: string;                 // e.g. 'sweep.maxBarsToReclaim'
  group: string;               // Settings stage, e.g. 'Sweep detection'
  type: 'int' | 'float' | 'bool' | 'enum' | 'enumList';
  min?: number;
  max?: number;
  step?: number;
  options?: string[];
  presets: { strict: any; balanced: any; aggressive: any };
  regimeScaler?: 'retrace' | 'tp' | 'risk' | 'trail';
  label: string;
  help: string;
  unit?: string;
}

export interface RegimeScalers {
  retrace: number;     // scales retrace.min and retrace.max
  tp: number;          // scales tp2.minRR
  risk: number;        // scales risk.modeMultiplier
  trail: number;       // scales trail.atrMult
}

export const DEFAULT_REGIME_SCALERS: Record<RegimeTier, RegimeScalers> = {
  strong:   { retrace: 0.85, tp: 1.25, risk: 1.00, trail: 1.20 },
  moderate: { retrace: 1.00, tp: 1.00, risk: 1.00, trail: 1.00 },
  emerging: { retrace: 1.10, tp: 0.80, risk: 0.75, trail: 0.90 }
};

export const PIPELINE_GROUPS = [
  'Regime and direction gates',
  'Universe and filters',
  'Trend and pullback',
  'Zone and sweep',
  'Rejection and engulf',
  'Entry, stop and targets',
  'Risk and controls',
  'Scoring'
] as const;

export const PARAM_REGISTRY: ParamDef[] = [
  // ── Stage 1: Regime and direction gates ──
  {
    key: 'direction.timeframe',
    group: 'Regime and direction gates',
    type: 'enum',
    options: ['4h', '1h', '30m', '15m'],
    presets: { strict: '4h', balanced: '1h', aggressive: '1h' },
    label: 'Direction Timeframe',
    help: 'Higher timeframe to evaluate macro trend alignment and market structure'
  },
  {
    key: 'execution.timeframe',
    group: 'Regime and direction gates',
    type: 'enum',
    options: ['15m', '5m', '3m', '1m'],
    presets: { strict: '15m', balanced: '15m', aggressive: '5m' },
    label: 'Execution Timeframe',
    help: 'Timeframe for sweep detection, candle triggers, and trade entries'
  },
  {
    key: 'regime.minStrength',
    group: 'Regime and direction gates',
    type: 'enum',
    options: ['strong', 'moderate', 'emerging'],
    presets: { strict: 'strong', balanced: 'moderate', aggressive: 'emerging' },
    label: 'Min Regime Strength',
    help: 'Minimum trend strength tier required from the regime engine'
  },
  {
    key: 'regime.minConfidence',
    group: 'Regime and direction gates',
    type: 'float',
    min: 0.1, max: 0.95, step: 0.05,
    presets: { strict: 0.70, balanced: 0.55, aggressive: 0.40 },
    label: 'Min Regime Confidence',
    help: 'Confidence floor from regime engine (0.0 to 1.0) to permit trading'
  },
  {
    key: 'regime.confirmation',
    group: 'Regime and direction gates',
    type: 'enum',
    options: ['both_agree', 'btc_not_opposing', 'neither_opposes'],
    presets: { strict: 'both_agree', balanced: 'btc_not_opposing', aggressive: 'neither_opposes' },
    label: 'BTC/ETH Confirmation',
    help: 'Strictness of macro benchmark consensus across BTC and ETH'
  },
  {
    key: 'regime.maxAgeMinutes',
    group: 'Regime and direction gates',
    type: 'int',
    min: 5, max: 120, step: 5, unit: 'min',
    presets: { strict: 30, balanced: 30, aggressive: 45 },
    label: 'Max Regime Age',
    help: 'Stale regime telemetry older than this window forces STANDBY'
  },
  {
    key: 'rs.minPercentile',
    group: 'Regime and direction gates',
    type: 'int',
    min: 0, max: 90, step: 5, unit: '%',
    presets: { strict: 60, balanced: 40, aggressive: 0 },
    label: 'Min Relative Strength vs BTC',
    help: 'Symbol RS percentile band vs BTC (0 = off). Requires leaders for longs, laggards for shorts.'
  },
  {
    key: 'exit.onRegimeFlip',
    group: 'Regime and direction gates',
    type: 'enum',
    options: ['none', 'tighten', 'flatten'],
    presets: { strict: 'tighten', balanced: 'tighten', aggressive: 'none' },
    label: 'On Regime Flip Action',
    help: 'Behavior for active open trades when market regime flips against the position'
  },

  // ── Stage 0: Universe and filters ──
  {
    key: 'universe.minVolumePercentile',
    group: 'Universe and filters',
    type: 'int',
    min: 0, max: 90, step: 5, unit: '%',
    presets: { strict: 30, balanced: 20, aggressive: 10 },
    label: 'Min Volume Percentile',
    help: 'Filter out low-liquidity coins falling below this 24h volume percentile'
  },
  {
    key: 'spread.maxShareOfStop',
    group: 'Universe and filters',
    type: 'float',
    min: 0.01, max: 0.25, step: 0.01,
    presets: { strict: 0.05, balanced: 0.08, aggressive: 0.10 },
    label: 'Max Spread Share of Stop',
    help: 'Maximum bid-ask spread permitted expressed as a fraction of planned stop distance'
  },
  {
    key: 'volatility.atrPercentileBandMin',
    group: 'Universe and filters',
    type: 'int',
    min: 5, max: 50, step: 5, unit: '%',
    presets: { strict: 30, balanced: 20, aggressive: 10 },
    label: 'ATR Percentile Band Min',
    help: 'Minimum historical ATR percentile to skip dead and non-volatile markets'
  },
  {
    key: 'volatility.atrPercentileBandMax',
    group: 'Universe and filters',
    type: 'int',
    min: 50, max: 99, step: 5, unit: '%',
    presets: { strict: 85, balanced: 90, aggressive: 95 },
    label: 'ATR Percentile Band Max',
    help: 'Maximum historical ATR percentile to prevent trading during chaotic spikes'
  },
  {
    key: 'volatility.lookbackBars',
    group: 'Universe and filters',
    type: 'int',
    min: 50, max: 500, step: 10, unit: 'bars',
    presets: { strict: 200, balanced: 200, aggressive: 200 },
    label: 'Volatility Lookback Bars',
    help: 'Bar count used to calculate ATR percentiles'
  },

  // ── Stage 2 & 3: Trend and pullback ──
  {
    key: 'trend.emaFast',
    group: 'Trend and pullback',
    type: 'int',
    min: 5, max: 50, step: 1, unit: 'bars',
    presets: { strict: 21, balanced: 21, aggressive: 21 },
    label: 'Trend EMA Fast',
    help: 'Direction timeframe fast EMA period'
  },
  {
    key: 'trend.emaMid',
    group: 'Trend and pullback',
    type: 'int',
    min: 20, max: 100, step: 5, unit: 'bars',
    presets: { strict: 55, balanced: 55, aggressive: 55 },
    label: 'Trend EMA Mid',
    help: 'Direction timeframe mid baseline EMA period'
  },
  {
    key: 'trend.emaSlow',
    group: 'Trend and pullback',
    type: 'int',
    min: 100, max: 300, step: 10, unit: 'bars',
    presets: { strict: 200, balanced: 200, aggressive: 200 },
    label: 'Trend EMA Slow',
    help: 'Direction timeframe slow trend anchor EMA period'
  },
  {
    key: 'trend.minAdx',
    group: 'Trend and pullback',
    type: 'float',
    min: 10, max: 40, step: 1,
    presets: { strict: 25, balanced: 20, aggressive: 16 },
    label: 'Min ADX (Direction TF)',
    help: 'Minimum ADX value on the direction timeframe proving directional trend strength'
  },
  {
    key: 'trend.minScore',
    group: 'Trend and pullback',
    type: 'float',
    min: 0.25, max: 1.00, step: 0.05,
    presets: { strict: 1.00, balanced: 0.75, aggressive: 0.50 },
    label: 'Min Trend Score',
    help: 'Required score across 4 trend components: EMA alignment, price side, market structure, ADX'
  },
  {
    key: 'pivot.left',
    group: 'Trend and pullback',
    type: 'int',
    min: 1, max: 5, step: 1, unit: 'bars',
    presets: { strict: 3, balanced: 3, aggressive: 2 },
    label: 'Pivot Left Bars',
    help: 'Left-side bars required to validate swing pivots on direction timeframe'
  },
  {
    key: 'pivot.right',
    group: 'Trend and pullback',
    type: 'int',
    min: 1, max: 5, step: 1, unit: 'bars',
    presets: { strict: 3, balanced: 2, aggressive: 2 },
    label: 'Pivot Right Bars',
    help: 'Right-side closed bars required before a swing pivot is usable (eliminates lookahead bias)'
  },
  {
    key: 'impulse.minATR',
    group: 'Trend and pullback',
    type: 'float',
    min: 1.0, max: 5.0, step: 0.1, unit: 'ATR',
    presets: { strict: 3.0, balanced: 2.5, aggressive: 2.0 },
    label: 'Impulse Min Height (ATR)',
    help: 'Minimum vertical distance of the prior impulse leg in ATR units'
  },
  {
    key: 'impulse.maxBars',
    group: 'Trend and pullback',
    type: 'int',
    min: 5, max: 40, step: 1, unit: 'bars',
    presets: { strict: 12, balanced: 16, aggressive: 20 },
    label: 'Impulse Max Bars',
    help: 'Maximum bars for the impulse leg to complete'
  },
  {
    key: 'retrace.min',
    group: 'Trend and pullback',
    type: 'float',
    min: 0.1, max: 0.5, step: 0.01,
    presets: { strict: 0.382, balanced: 0.30, aggressive: 0.236 },
    regimeScaler: 'retrace',
    label: 'Pullback Retrace Min',
    help: 'Minimum Fibonacci fraction of impulse leg that price must retrace'
  },
  {
    key: 'retrace.max',
    group: 'Trend and pullback',
    type: 'float',
    min: 0.5, max: 0.9, step: 0.01,
    presets: { strict: 0.618, balanced: 0.705, aggressive: 0.786 },
    regimeScaler: 'retrace',
    label: 'Pullback Retrace Max',
    help: 'Maximum Fibonacci fraction of impulse leg allowed (deeper cancels the trend impulse)'
  },
  {
    key: 'pullback.minBars',
    group: 'Trend and pullback',
    type: 'int',
    min: 1, max: 10, step: 1, unit: 'bars',
    presets: { strict: 3, balanced: 2, aggressive: 2 },
    label: 'Pullback Min Bars',
    help: 'Minimum duration of pullback in execution timeframe bars'
  },
  {
    key: 'pullback.maxBars',
    group: 'Trend and pullback',
    type: 'int',
    min: 10, max: 60, step: 2, unit: 'bars',
    presets: { strict: 20, balanced: 30, aggressive: 40 },
    label: 'Pullback Max Bars',
    help: 'Maximum duration allowed for pullback before setup is discarded'
  },
  {
    key: 'pullback.maxVolumeRatio',
    group: 'Trend and pullback',
    type: 'float',
    min: 0, max: 1.5, step: 0.05,
    presets: { strict: 0.70, balanced: 0.85, aggressive: 0 },
    label: 'Pullback Max Volume Ratio',
    help: 'Average pullback volume vs impulse volume (0 = off). Low volume proves corrective character.'
  },

  // ── Stage 4 & 5: Zone and sweep ──
  {
    key: 'zone.minConfluence',
    group: 'Zone and sweep',
    type: 'int',
    min: 0, max: 4, step: 1,
    presets: { strict: 2, balanced: 1, aggressive: 0 },
    label: 'Min Zone Confluence',
    help: 'Minimum value elements touched (EMA band, AVWAP, S/R flip, HTF level, HVN)'
  },
  {
    key: 'zone.toleranceATR',
    group: 'Zone and sweep',
    type: 'float',
    min: 0.1, max: 1.0, step: 0.05, unit: 'ATR',
    presets: { strict: 0.30, balanced: 0.40, aggressive: 0.50 },
    label: 'Zone Tolerance (ATR)',
    help: 'Proximity cushion around confluence levels in ATR units'
  },
  {
    key: 'sweep.poolLookbackBars',
    group: 'Zone and sweep',
    type: 'int',
    min: 20, max: 200, step: 10, unit: 'bars',
    presets: { strict: 60, balanced: 80, aggressive: 100 },
    label: 'Pool Lookback Bars',
    help: 'Maximum historical lookback window to find resting liquidity pools'
  },
  {
    key: 'sweep.equalToleranceATR',
    group: 'Zone and sweep',
    type: 'float',
    min: 0.05, max: 0.50, step: 0.01, unit: 'ATR',
    presets: { strict: 0.10, balanced: 0.15, aggressive: 0.20 },
    label: 'Equal Levels Tolerance (ATR)',
    help: 'Clustering tolerance between pivot prices to identify equal highs/lows'
  },
  {
    key: 'sweep.minPenetrationATR',
    group: 'Zone and sweep',
    type: 'float',
    min: 0.01, max: 0.30, step: 0.01, unit: 'ATR',
    presets: { strict: 0.10, balanced: 0.05, aggressive: 0.03 },
    label: 'Min Sweep Penetration (ATR)',
    help: 'Minimum penetration beyond pool price in ATR to count as genuine stop sweep'
  },
  {
    key: 'sweep.maxPenetrationATR',
    group: 'Zone and sweep',
    type: 'float',
    min: 0.5, max: 2.0, step: 0.05, unit: 'ATR',
    presets: { strict: 0.80, balanced: 1.00, aggressive: 1.20 },
    label: 'Max Sweep Penetration (ATR)',
    help: 'Maximum penetration allowed (deeper indicates trend breakdown, not sweep)'
  },
  {
    key: 'sweep.maxBarsToReclaim',
    group: 'Zone and sweep',
    type: 'int',
    min: 1, max: 6, step: 1, unit: 'bars',
    presets: { strict: 1, balanced: 2, aggressive: 3 },
    label: 'Max Bars to Reclaim',
    help: 'Max bars after sweep for price to close back inside the pool level'
  },
  {
    key: 'sweep.minVolumeRatio',
    group: 'Zone and sweep',
    type: 'float',
    min: 0, max: 2.5, step: 0.1,
    presets: { strict: 1.3, balanced: 1.0, aggressive: 0 },
    label: 'Min Sweep Volume Ratio',
    help: 'Sweep candle volume vs 20 SMA (0 = off). High volume indicates institutional absorption.'
  },

  // ── Stage 6 & 7: Rejection and engulf ──
  {
    key: 'rejection.maxBarsAfterSweep',
    group: 'Rejection and engulf',
    type: 'int',
    min: 0, max: 4, step: 1, unit: 'bars',
    presets: { strict: 0, balanced: 1, aggressive: 2 },
    label: 'Max Bars After Sweep',
    help: 'Bars allowed after the sweep for the rejection candle to form (0 = sweep candle itself)'
  },
  {
    key: 'rejection.minWickToBody',
    group: 'Rejection and engulf',
    type: 'float',
    min: 0.8, max: 3.5, step: 0.1,
    presets: { strict: 2.0, balanced: 1.5, aggressive: 1.2 },
    label: 'Min Wick / Body Ratio',
    help: 'Lower wick length divided by body length for hammer/star validation'
  },
  {
    key: 'rejection.minWickShareOfRange',
    group: 'Rejection and engulf',
    type: 'float',
    min: 0.3, max: 0.8, step: 0.05,
    presets: { strict: 0.60, balanced: 0.50, aggressive: 0.40 },
    label: 'Min Wick Share of Range',
    help: 'Proportion of entire rejection candle range taken up by the rejection wick'
  },
  {
    key: 'rejection.maxOppositeWickShare',
    group: 'Rejection and engulf',
    type: 'float',
    min: 0.05, max: 0.5, step: 0.05,
    presets: { strict: 0.15, balanced: 0.25, aggressive: 0.35 },
    label: 'Max Opposite Wick Share',
    help: 'Maximum permitted opposing wick proportion (prevents indecision spinning tops)'
  },
  {
    key: 'rejection.minCloseLocation',
    group: 'Rejection and engulf',
    type: 'float',
    min: 0.4, max: 0.85, step: 0.05,
    presets: { strict: 0.65, balanced: 0.60, aggressive: 0.50 },
    label: 'Min Close Location',
    help: 'Close position from swept extreme (0.65 = close in upper 35% of bar for long)'
  },
  {
    key: 'rejection.minBodyShare',
    group: 'Rejection and engulf',
    type: 'float',
    min: 0, max: 0.2, step: 0.01,
    presets: { strict: 0.05, balanced: 0.03, aggressive: 0.0 },
    label: 'Min Body Share of Range',
    help: 'Minimum body height as fraction of range (0 allows pure doji)'
  },
  {
    key: 'rejection.minRangeATR',
    group: 'Rejection and engulf',
    type: 'float',
    min: 0.1, max: 1.5, step: 0.05, unit: 'ATR',
    presets: { strict: 0.50, balanced: 0.40, aggressive: 0.30 },
    label: 'Min Rejection Range (ATR)',
    help: 'Minimum candle range in ATR units'
  },
  {
    key: 'rejection.maxRangeATR',
    group: 'Rejection and engulf',
    type: 'float',
    min: 1.5, max: 5.0, step: 0.1, unit: 'ATR',
    presets: { strict: 2.5, balanced: 3.0, aggressive: 3.5 },
    label: 'Max Rejection Range (ATR)',
    help: 'Maximum rejection candle range in ATR units (prevents oversized blow-off bars)'
  },
  {
    key: 'engulf.maxBarsAfterRejection',
    group: 'Rejection and engulf',
    type: 'int',
    min: 1, max: 4, step: 1, unit: 'bars',
    presets: { strict: 1, balanced: 1, aggressive: 2 },
    label: 'Max Bars After Rejection',
    help: 'Allowed candles after rejection candle for the engulfing candle to arrive'
  },
  {
    key: 'engulf.rule',
    group: 'Rejection and engulf',
    type: 'enum',
    options: [
      'body_covers_rejection_and_closes_beyond',
      'closes_beyond_rejection_extreme',
      'closes_beyond_rejection_midpoint'
    ],
    presets: {
      strict: 'body_covers_rejection_and_closes_beyond',
      balanced: 'closes_beyond_rejection_extreme',
      aggressive: 'closes_beyond_rejection_midpoint'
    },
    label: 'Engulf Confirmation Rule',
    help: 'Strictness of candle engulfing criteria confirming the reversal'
  },
  {
    key: 'engulf.minBodyShare',
    group: 'Rejection and engulf',
    type: 'float',
    min: 0.2, max: 0.8, step: 0.05,
    presets: { strict: 0.60, balanced: 0.50, aggressive: 0.40 },
    label: 'Engulf Min Body Share',
    help: 'Minimum candle body proportion for the confirmation bar'
  },
  {
    key: 'engulf.maxRangeATR',
    group: 'Rejection and engulf',
    type: 'float',
    min: 1.5, max: 5.0, step: 0.1, unit: 'ATR',
    presets: { strict: 2.5, balanced: 3.0, aggressive: 3.5 },
    label: 'Engulf Max Range (ATR)',
    help: 'Do not chase oversized engulfing candles exceeding this ATR multiple'
  },
  {
    key: 'engulf.minVolumeRatio',
    group: 'Rejection and engulf',
    type: 'float',
    min: 0, max: 2.5, step: 0.1,
    presets: { strict: 1.0, balanced: 0.8, aggressive: 0 },
    label: 'Engulf Min Volume Ratio',
    help: 'Volume on confirmation candle vs 20 SMA (0 = off)'
  },
  {
    key: 'setup.invalidateOnReSweep',
    group: 'Rejection and engulf',
    type: 'bool',
    presets: { strict: true, balanced: true, aggressive: true },
    label: 'Invalidate on Re-Sweep',
    help: 'Immediately cancel setup if price trades back through the sweep extreme'
  },

  // ── Stage 8 & 9: Entry, stop and targets ──
  {
    key: 'entry.method',
    group: 'Entry, stop and targets',
    type: 'enum',
    options: ['marketOnClose', 'limitRetest'],
    presets: { strict: 'limitRetest', balanced: 'marketOnClose', aggressive: 'marketOnClose' },
    label: 'Entry Method',
    help: 'Enter at candle close (marketOnClose) or wait for limit order pullback retest'
  },
  {
    key: 'entry.limitRetraceOfEngulf',
    group: 'Entry, stop and targets',
    type: 'float',
    min: 0, max: 0.8, step: 0.05,
    presets: { strict: 0.50, balanced: 0, aggressive: 0 },
    label: 'Limit Retrace of Engulf',
    help: 'Retrace fraction of confirmation candle for limit order entry (if limitRetest)'
  },
  {
    key: 'entry.limitExpiryBars',
    group: 'Entry, stop and targets',
    type: 'int',
    min: 0, max: 6, step: 1, unit: 'bars',
    presets: { strict: 3, balanced: 0, aggressive: 0 },
    label: 'Limit Expiry Bars',
    help: 'Number of closed candles before unfilled limit order is cancelled'
  },
  {
    key: 'stop.bufferATR',
    group: 'Entry, stop and targets',
    type: 'float',
    min: 0.05, max: 0.40, step: 0.05, unit: 'ATR',
    presets: { strict: 0.20, balanced: 0.15, aggressive: 0.10 },
    label: 'Stop Buffer (ATR)',
    help: 'Protective buffer placed beyond the sweep extreme in ATR units'
  },
  {
    key: 'stop.minATR',
    group: 'Entry, stop and targets',
    type: 'float',
    min: 0.2, max: 1.0, step: 0.05, unit: 'ATR',
    presets: { strict: 0.60, balanced: 0.50, aggressive: 0.40 },
    label: 'Stop Min Distance (ATR)',
    help: 'Minimum stop loss distance (widened to this if tighter)'
  },
  {
    key: 'stop.maxATR',
    group: 'Entry, stop and targets',
    type: 'float',
    min: 1.5, max: 5.0, step: 0.1, unit: 'ATR',
    presets: { strict: 2.0, balanced: 2.5, aggressive: 3.0 },
    label: 'Stop Max Distance (ATR)',
    help: 'Maximum stop distance permitted (skips trade if wider, never shrinks stop)'
  },
  {
    key: 'fees.maxShareOfRisk',
    group: 'Entry, stop and targets',
    type: 'float',
    min: 0.05, max: 0.50, step: 0.01,
    presets: { strict: 0.20, balanced: 0.25, aggressive: 0.30 },
    label: 'Max Fee Share of Risk',
    help: 'Maximum round-trip fee drag relative to 1R stop distance (0.20 = 20% of 1R)'
  },
  {
    key: 'rr.minBlendedNet',
    group: 'Entry, stop and targets',
    type: 'float',
    min: 1.0, max: 3.0, step: 0.1, unit: ':1',
    presets: { strict: 2.0, balanced: 1.6, aggressive: 1.3 },
    label: 'Min Blended Net R:R',
    help: 'Minimum net risk-to-reward ratio after all exchange and GST fee drag'
  },
  {
    key: 'tp1.minRR',
    group: 'Entry, stop and targets',
    type: 'float',
    min: 0.5, max: 2.0, step: 0.1, unit: 'R',
    presets: { strict: 1.2, balanced: 1.0, aggressive: 0.8 },
    label: 'TP1 Min R:R',
    help: 'Minimum structural R-multiple for Take Profit 1'
  },
  {
    key: 'tp1.sharePct',
    group: 'Entry, stop and targets',
    type: 'int',
    min: 20, max: 80, step: 5, unit: '%',
    presets: { strict: 40, balanced: 50, aggressive: 60 },
    label: 'TP1 Close Share (%)',
    help: 'Percentage of position volume closed at TP1'
  },
  {
    key: 'tp2.minRR',
    group: 'Entry, stop and targets',
    type: 'float',
    min: 1.0, max: 4.0, step: 0.1, unit: 'R',
    presets: { strict: 2.5, balanced: 2.0, aggressive: 1.5 },
    regimeScaler: 'tp',
    label: 'TP2 Min R:R',
    help: 'Minimum structural R-multiple for Take Profit 2'
  },
  {
    key: 'tp2.sharePct',
    group: 'Entry, stop and targets',
    type: 'int',
    min: 10, max: 60, step: 5, unit: '%',
    presets: { strict: 40, balanced: 30, aggressive: 30 },
    label: 'TP2 Close Share (%)',
    help: 'Percentage of position volume closed at TP2 (remainder is runner)'
  },
  {
    key: 'tp.levelBufferATR',
    group: 'Entry, stop and targets',
    type: 'float',
    min: 0.02, max: 0.20, step: 0.01, unit: 'ATR',
    presets: { strict: 0.10, balanced: 0.08, aggressive: 0.05 },
    label: 'TP Level Buffer (ATR)',
    help: 'Cushion placed before structural target levels to ensure reliable fills'
  },
  {
    key: 'be.afterTP1',
    group: 'Entry, stop and targets',
    type: 'bool',
    presets: { strict: true, balanced: true, aggressive: true },
    label: 'Move to Break-Even after TP1',
    help: 'Advance protective stop loss to entry price + fee buffer upon reaching TP1'
  },
  {
    key: 'trail.atrMult',
    group: 'Entry, stop and targets',
    type: 'float',
    min: 1.0, max: 4.0, step: 0.1, unit: 'ATR',
    presets: { strict: 2.5, balanced: 2.0, aggressive: 1.5 },
    regimeScaler: 'trail',
    label: 'Runner Trailing Multiplier (ATR)',
    help: 'Trailing stop distance for the runner portion behind market structure'
  },
  {
    key: 'timeStop.bars',
    group: 'Entry, stop and targets',
    type: 'int',
    min: 10, max: 80, step: 2, unit: 'bars',
    presets: { strict: 40, balanced: 32, aggressive: 24 },
    label: 'Time Stop Bars',
    help: 'Maximum holding bars before closing position if no momentum is achieved'
  },
  {
    key: 'timeStop.minProgressR',
    group: 'Entry, stop and targets',
    type: 'float',
    min: 0.1, max: 1.0, step: 0.05, unit: 'R',
    presets: { strict: 0.30, balanced: 0.30, aggressive: 0.25 },
    label: 'Time Stop Min Progress (R)',
    help: 'Minimum unrealized R progress required to exempt trade from time-stop exit'
  },

  // ── Stage 10: Risk and controls ──
  {
    key: 'risk.modeMultiplier',
    group: 'Risk and controls',
    type: 'float',
    min: 0.25, max: 1.5, step: 0.05,
    presets: { strict: 1.00, balanced: 0.75, aggressive: 0.50 },
    regimeScaler: 'risk',
    label: 'Risk Mode Multiplier',
    help: 'Multiplies the global account risk per trade for this execution mode'
  },
  {
    key: 'cooldown.barsAfterStop',
    group: 'Risk and controls',
    type: 'int',
    min: 1, max: 20, step: 1, unit: 'bars',
    presets: { strict: 8, balanced: 6, aggressive: 4 },
    label: 'Cooldown Bars After Stop',
    help: 'Execution bars to pause new entries on the symbol following a stop out'
  },
  {
    key: 'symbolDailyCap',
    group: 'Risk and controls',
    type: 'int',
    min: 1, max: 10, step: 1, unit: 'trades',
    presets: { strict: 2, balanced: 3, aggressive: 4 },
    label: 'Symbol Daily Trade Cap',
    help: 'Maximum executed signals allowed per symbol in rolling 24h window'
  },
  {
    key: 'shock.btcAdverseATR',
    group: 'Risk and controls',
    type: 'float',
    min: 0.5, max: 4.0, step: 0.1, unit: 'ATR',
    presets: { strict: 1.5, balanced: 2.0, aggressive: 2.5 },
    label: 'BTC Shock Veto (ATR)',
    help: 'Veto entry if BTC moved adversely by more than this ATR multiple over last 3 bars'
  },
  {
    key: 'score.minToTrade',
    group: 'Risk and controls',
    type: 'int',
    min: 20, max: 90, step: 5,
    presets: { strict: 70, balanced: 55, aggressive: 40 },
    label: 'Min Quality Score to Trade',
    help: 'Minimum composite quality score (0-100) required to trigger order execution'
  },

  // ── Stage 10: Scoring Weights ──
  {
    key: 'score.weightRegime',
    group: 'Scoring',
    type: 'int',
    min: 0, max: 40, step: 1,
    presets: { strict: 20, balanced: 20, aggressive: 20 },
    label: 'Score Weight: Regime',
    help: 'Points allocated to regime confidence (out of 100)'
  },
  {
    key: 'score.weightTrend',
    group: 'Scoring',
    type: 'int',
    min: 0, max: 30, step: 1,
    presets: { strict: 15, balanced: 15, aggressive: 15 },
    label: 'Score Weight: Trend',
    help: 'Points allocated to direction-timeframe trend score'
  },
  {
    key: 'score.weightZone',
    group: 'Scoring',
    type: 'int',
    min: 0, max: 30, step: 1,
    presets: { strict: 15, balanced: 15, aggressive: 15 },
    label: 'Score Weight: Zone Confluence',
    help: 'Points allocated to value zone confluence depth'
  },
  {
    key: 'score.weightSweep',
    group: 'Scoring',
    type: 'int',
    min: 0, max: 40, step: 1,
    presets: { strict: 20, balanced: 20, aggressive: 20 },
    label: 'Score Weight: Liquidity Sweep',
    help: 'Points allocated to pool quality and sweep depth'
  },
  {
    key: 'score.weightRejection',
    group: 'Scoring',
    type: 'int',
    min: 0, max: 25, step: 1,
    presets: { strict: 10, balanced: 10, aggressive: 10 },
    label: 'Score Weight: Rejection Candle',
    help: 'Points allocated to rejection wick sharpness and candle form'
  },
  {
    key: 'score.weightEngulf',
    group: 'Scoring',
    type: 'int',
    min: 0, max: 25, step: 1,
    presets: { strict: 10, balanced: 10, aggressive: 10 },
    label: 'Score Weight: Engulf Confirmation',
    help: 'Points allocated to engulfing conviction and volume'
  },
  {
    key: 'score.weightNetRR',
    group: 'Scoring',
    type: 'int',
    min: 0, max: 25, step: 1,
    presets: { strict: 10, balanced: 10, aggressive: 10 },
    label: 'Score Weight: Net R:R Quality',
    help: 'Points allocated to risk-to-reward ratio headroom'
  }
];

export const REGISTRY_BY_KEY: Record<string, ParamDef> = PARAM_REGISTRY.reduce((acc, p) => {
  acc[p.key] = p;
  return acc;
}, {} as Record<string, ParamDef>);

/**
 * Computes deterministic simple hash for resolved configuration.
 */
export function hashConfig(values: Record<string, any>): string {
  const sorted = Object.keys(values).sort().map(k => `${k}:${JSON.stringify(values[k])}`).join('|');
  let hash = 0;
  for (let i = 0; i < sorted.length; i++) {
    hash = (Math.imul(31, hash) + sorted.charCodeAt(i)) | 0;
  }
  return 'tpsr_' + Math.abs(hash).toString(16);
}

/**
 * Resolves effective parameters with strictly maintained precedence:
 * Pinned user override > (Preset value for active mode * regime scaler) > Registry fallback
 */
export function resolveTpsrConfig(opts: {
  mode: TpsrMode;
  regimeTier?: RegimeTier;
  pinnedOverrides?: Record<string, any>;
  customScalers?: Record<RegimeTier, RegimeScalers>;
}): {
  values: Record<string, any>;
  sources: Record<string, ValueSource>;
  configHash: string;
} {
  const {
    mode = 'balanced',
    regimeTier = 'moderate',
    pinnedOverrides = {},
    customScalers = DEFAULT_REGIME_SCALERS
  } = opts;

  const scalers = customScalers[regimeTier] ?? DEFAULT_REGIME_SCALERS.moderate;
  const values: Record<string, any> = {};
  const sources: Record<string, ValueSource> = {};

  for (const def of PARAM_REGISTRY) {
    const key = def.key;
    const rawPreset = def.presets[mode] ?? def.presets.balanced;

    // Check if user has pinned this override
    if (pinnedOverrides[key] !== undefined) {
      values[key] = pinnedOverrides[key];
      sources[key] = 'pinned';
      continue;
    }

    // Apply regime scaler if defined and numeric
    if (def.regimeScaler && typeof rawPreset === 'number') {
      const mult = scalers[def.regimeScaler] ?? 1.0;
      if (mult !== 1.0) {
        let scaled = rawPreset * mult;
        if (def.type === 'int') {
          scaled = Math.round(scaled);
        } else {
          scaled = Math.round(scaled * 1000) / 1000;
        }
        if (def.min !== undefined) scaled = Math.max(def.min, scaled);
        if (def.max !== undefined) scaled = Math.min(def.max, scaled);
        values[key] = scaled;
        sources[key] = 'regime-adjusted';
        continue;
      }
    }

    values[key] = rawPreset;
    sources[key] = 'preset';
  }

  const configHash = hashConfig(values);
  return { values, sources, configHash };
}

/**
 * Validates cross-field rules on save. Returns list of validation errors.
 */
export function validateTpsrConfig(values: Record<string, any>): {
  valid: boolean;
  errors: Record<string, string>;
  globalErrors: string[];
} {
  const errors: Record<string, string> = {};
  const globalErrors: string[] = [];

  // 1. retrace.min < retrace.max
  if (typeof values['retrace.min'] === 'number' && typeof values['retrace.max'] === 'number') {
    if (values['retrace.min'] >= values['retrace.max']) {
      errors['retrace.min'] = 'Min retrace must be less than max retrace';
      errors['retrace.max'] = 'Max retrace must be greater than min retrace';
      globalErrors.push('Pullback min retrace must be strictly less than max retrace.');
    }
  }

  // 2. tp1.minRR < tp2.minRR
  if (typeof values['tp1.minRR'] === 'number' && typeof values['tp2.minRR'] === 'number') {
    if (values['tp1.minRR'] >= values['tp2.minRR']) {
      errors['tp1.minRR'] = 'TP1 min RR must be less than TP2 min RR';
      errors['tp2.minRR'] = 'TP2 min RR must be greater than TP1 min RR';
      globalErrors.push('TP1 minimum R:R must be strictly less than TP2 minimum R:R.');
    }
  }

  // 3. tp1.sharePct + tp2.sharePct <= 100
  if (typeof values['tp1.sharePct'] === 'number' && typeof values['tp2.sharePct'] === 'number') {
    if (values['tp1.sharePct'] + values['tp2.sharePct'] > 100) {
      errors['tp1.sharePct'] = 'Sum of TP1 and TP2 shares cannot exceed 100%';
      errors['tp2.sharePct'] = 'Sum of TP1 and TP2 shares cannot exceed 100%';
      globalErrors.push('TP1 share + TP2 share cannot exceed 100% (the remainder is reserved for the runner).');
    }
  }

  // 4. stop.minATR < stop.maxATR
  if (typeof values['stop.minATR'] === 'number' && typeof values['stop.maxATR'] === 'number') {
    if (values['stop.minATR'] >= values['stop.maxATR']) {
      errors['stop.minATR'] = 'Min stop must be less than max stop';
      errors['stop.maxATR'] = 'Max stop must be greater than min stop';
      globalErrors.push('Stop min distance (ATR) must be strictly less than stop max distance (ATR).');
    }
  }

  // 5. rejection.minRangeATR < rejection.maxRangeATR
  if (typeof values['rejection.minRangeATR'] === 'number' && typeof values['rejection.maxRangeATR'] === 'number') {
    if (values['rejection.minRangeATR'] >= values['rejection.maxRangeATR']) {
      errors['rejection.minRangeATR'] = 'Min rejection range must be less than max';
      errors['rejection.maxRangeATR'] = 'Max rejection range must be greater than min';
      globalErrors.push('Rejection candle min range (ATR) must be strictly less than max range (ATR).');
    }
  }

  // 6. Check individual min/max bounds
  for (const def of PARAM_REGISTRY) {
    const val = values[def.key];
    if (typeof val === 'number') {
      if (def.min !== undefined && val < def.min) {
        errors[def.key] = `Value cannot be less than ${def.min}`;
        globalErrors.push(`${def.label} cannot be less than ${def.min}`);
      }
      if (def.max !== undefined && val > def.max) {
        errors[def.key] = `Value cannot exceed ${def.max}`;
        globalErrors.push(`${def.label} cannot exceed ${def.max}`);
      }
    }
  }

  return {
    valid: globalErrors.length === 0,
    errors,
    globalErrors
  };
}
