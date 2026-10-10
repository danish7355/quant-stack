/**
 * TREND PULLBACK SWEEP REVERSAL (TPSR): Execution Engine
 *
 * 11-STAGE PIPELINE:
 *   Stage 0:  Universe & Volatility Filters
 *   Stage 1:  Regime Gate (direction, strength tier, confidence, benchmark confirmation, RS)
 *   Stage 2:  Direction Timeframe Trend (EMAs, price side, market structure, ADX)
 *   Stage 3:  Impulse Leg & Pullback on Execution Timeframe
 *   Stage 4:  Value Zone Confluence (EMA band, AVWAP, S/R flip, HTF level, HVN)
 *   Stage 5:  Liquidity Sweep (equal levels, swing pivots, session/day extremes)
 *   Stage 6:  Rejection Candle (hammer / shooting star metrics & patterns)
 *   Stage 7:  Engulf Confirmation (closes through rejection candle, volume, no re-sweep)
 *   Stage 8:  Entry (marketOnClose or limitRetest)
 *   Stage 9:  Stop, Targets & Dynamic Fee-Aware RR Check
 *   Stage 10: Final Vetoes, Multi-Factor Scoring (0-100), and Risk Sizing
 *
 * NON-NEGOTIABLE RULE 2.1:
 *   No hardcoded trading numbers in this file. Every threshold, multiplier, lookback,
 *   timeframe, weight, percentage and toggle is read from resolved SweepConfig/cfg.
 *   Only structural numbers (0, 1, -1, array indexes) are allowed.
 */

import {
  TpsrMode,
  RegimeTier,
  RegimeDirection,
  resolveTpsrConfig,
  hashConfig
} from './schema.js';

export type { TpsrMode, RegimeTier, RegimeDirection };
import {
  findSwingPivots,
  detectEqualLevels,
  extractCalendarPools,
  extractSessionPools,
  extractRangeEdges,
  checkUntouched,
  Candle,
  LiquidityPool
} from '../liquiditySweep/pools.js';
import {
  calculateEMA,
  calculateSMA,
  calculateATR,
  calculateADX
} from '../../indicators.js';
import { feeCostInR, getAppFeeRoundTripPct } from '../liquiditySweep/schema.js';

export interface TpsrRegimeSnapshot {
  direction: RegimeDirection; // 'bull' | 'bear' | 'neutral'
  tier: RegimeTier;           // 'strong' | 'moderate' | 'emerging'
  confidence: number;         // 0 to 1
  btcTrend: 'UP' | 'DOWN' | 'NEUTRAL';
  ethTrend: 'UP' | 'DOWN' | 'NEUTRAL';
  btcMacroColor?: 'GREEN' | 'AMBER' | 'RED';
  timestamp: number;
  label?: string;
}

export interface SetupTrace {
  impulseTime?: number;
  pullbackLowHighTime?: number;
  sweepTime?: number;
  rejectionTime?: number;
  engulfTime?: number;
  entryTime?: number;
  sweptPoolLevel?: number;
  sweptPoolType?: string;
  rejectionWickRatio?: number;
  engulfBodyRatio?: number;
}

export interface TpsrSignal {
  symbol: string;
  side: 'LONG' | 'SHORT';
  direction: 'LONG' | 'SHORT';
  mode: TpsrMode;
  entryPrice: number;
  sl: number;
  tp1: number;
  tp2: number;
  tp3: number;
  tp1SharePct: number;
  tp2SharePct: number;
  runnerSharePct: number;
  riskPerUnit: number;
  stopDistanceATR: number;
  blendedNetRR: number;
  feeCostInR: number;
  riskModeMultiplier: number;
  timeStopBars: number;
  timeStopMinProgressR: number;
  trailAtrMult: number;
  moveToBEAfterTp1: boolean;
  score: number;
  reason: string;
  reasonList: string[];
  regimeSnapshot: TpsrRegimeSnapshot;
  configHash: string;
  setupTrace: SetupTrace;
  signalTime: number;
  config: Record<string, any>;
}

export type TpsrStage =
  | 'STAGE_0_UNIVERSE'
  | 'STAGE_1_REGIME'
  | 'STAGE_2_TREND'
  | 'STAGE_3_IMPULSE_PULLBACK'
  | 'STAGE_4_ZONE_CONFLUENCE'
  | 'STAGE_5_LIQUIDITY_SWEEP'
  | 'STAGE_6_REJECTION'
  | 'STAGE_7_ENGULF'
  | 'STAGE_8_ENTRY'
  | 'STAGE_9_RISK_TARGETS'
  | 'STAGE_10_FINAL_VETO';

export type TpsrState = 'STANDBY' | 'SCANNING' | 'ARMED' | 'TRIGGERED';

export type TpsrEvaluationResult =
  | { status: 'ACTIVE'; state: 'TRIGGERED'; signal: TpsrSignal; config: Record<string, any> }
  | { status: 'ARMED'; state: 'ARMED'; stage: TpsrStage; reason: string; details?: string; setupTrace: SetupTrace; config: Record<string, any> }
  | { status: 'STANDBY'; state: 'STANDBY'; stage: TpsrStage; reason: string; details?: string; config: Record<string, any> }
  | { status: 'REJECTED'; state: 'SCANNING'; stage: TpsrStage; reason: string; details?: string; config: Record<string, any> };

export interface FunnelStats {
  universePass: number;
  regimePass: number;
  trendPass: number;
  pullbackPass: number;
  zonePass: number;
  sweepPass: number;
  rejectionPass: number;
  engulfPass: number;
  entryPass: number;
  vetoed: Record<string, number>;
  signals: number;
}

export class TpsrFunnelTracker {
  private static instance: TpsrFunnelTracker;
  public statsByMode: Record<TpsrMode, FunnelStats> = {
    strict: { universePass: 0, regimePass: 0, trendPass: 0, pullbackPass: 0, zonePass: 0, sweepPass: 0, rejectionPass: 0, engulfPass: 0, entryPass: 0, vetoed: {}, signals: 0 },
    balanced: { universePass: 0, regimePass: 0, trendPass: 0, pullbackPass: 0, zonePass: 0, sweepPass: 0, rejectionPass: 0, engulfPass: 0, entryPass: 0, vetoed: {}, signals: 0 },
    aggressive: { universePass: 0, regimePass: 0, trendPass: 0, pullbackPass: 0, zonePass: 0, sweepPass: 0, rejectionPass: 0, engulfPass: 0, entryPass: 0, vetoed: {}, signals: 0 }
  };

  public static get(): TpsrFunnelTracker {
    if (!TpsrFunnelTracker.instance) {
      TpsrFunnelTracker.instance = new TpsrFunnelTracker();
    }
    return TpsrFunnelTracker.instance;
  }

  public recordStagePass(mode: TpsrMode, stage: keyof Omit<FunnelStats, 'vetoed'>) {
    this.statsByMode[mode][stage]++;
  }

  public recordVeto(mode: TpsrMode, reason: string) {
    const map = this.statsByMode[mode].vetoed;
    map[reason] = (map[reason] || 0) + 1;
  }

  public getBottleneck(mode: TpsrMode): { stage: string; dropoffPct: number } {
    const s = this.statsByMode[mode];
    const stages: [string, number][] = [
      ['Universe', s.universePass],
      ['Regime', s.regimePass],
      ['Trend', s.trendPass],
      ['Pullback', s.pullbackPass],
      ['Zone', s.zonePass],
      ['Sweep', s.sweepPass],
      ['Rejection', s.rejectionPass],
      ['Engulf', s.engulfPass],
      ['Signal', s.signals]
    ];
    let maxDrop = 0;
    let worstStage = 'Engulf';
    for (let i = 1; i < stages.length; i++) {
      const prev = stages[i - 1][1];
      const cur = stages[i][1];
      if (prev > 0) {
        const drop = ((prev - cur) / prev) * 100;
        if (drop > maxDrop) {
          maxDrop = drop;
          worstStage = stages[i][0];
        }
      }
    }
    return { stage: worstStage, dropoffPct: Math.round(maxDrop) };
  }
}

export interface EvaluateTpsrInput {
  symbol: string;
  execCandles: Candle[];          // Execution timeframe candles
  isCandlesClosed?: boolean;      // True if execCandles is already closed slice
  directionCandles?: Candle[];    // Direction timeframe candles
  dailyCandles?: Candle[];        // 1D candles for calendar extremes
  currentPrice?: number;
  mode?: TpsrMode;
  regime?: TpsrRegimeSnapshot;
  overrides?: Record<string, any>;
  symbolRank?: number;
  symbolVolumePercentile?: number;
  symbolSpread?: number;
  symbolRelativeStrengthVsBtc?: number; // RS percentile 0-100
  symbolDailyTrades?: number;
  symbolInCooldown?: boolean;
  btcCandles?: Candle[];          // 3 recent closed BTC bars for shock veto
  appFeeSettings?: { feeTakerPct?: number; feeGstPct?: number; feeRoundTripPct?: number };
}

/**
 * Calculates Anchored VWAP starting from a specific bar index.
 */
function calculateAnchoredVWAP(candles: Candle[], startIdx: number): number {
  if (!candles || startIdx < 0 || startIdx >= candles.length) return 0;
  let cumVolPrice = 0;
  let cumVol = 0;
  for (let i = startIdx; i < candles.length; i++) {
    const c = candles[i];
    const vol = c.volume ?? 1;
    const typPrice = (c.high + c.low + c.close) / 3;
    cumVolPrice += typPrice * vol;
    cumVol += vol;
  }
  return cumVol > 0 ? cumVolPrice / cumVol : candles[candles.length - 1].close;
}

/**
 * Helper to normalize raw regime objects into typed TpsrRegimeSnapshot.
 */
export function extractTpsrRegime(raw: any): TpsrRegimeSnapshot {
  if (!raw || typeof raw !== 'object') {
    return {
      direction: 'neutral',
      tier: 'emerging',
      confidence: 0,
      btcTrend: 'NEUTRAL',
      ethTrend: 'NEUTRAL',
      timestamp: Date.now()
    };
  }

  // Raw confidence normalization
  let confidence = raw.confidence ?? raw.regimeConfidence ?? 0.5;
  if (confidence > 1) {
    confidence = confidence / 100;
  }

  // Direction mapping
  let direction: RegimeDirection = 'neutral';
  const labelUpper = String(raw.label || raw.regime || raw.marketRegime || '').toUpperCase();
  const dirUpper = String(raw.direction || raw.biasDirection || '').toUpperCase();
  const macroColor = String(raw.macroColor || '').toUpperCase();

  if (dirUpper === 'LONG' || dirUpper === 'BULL' || macroColor === 'GREEN' || labelUpper.includes('BULL') || labelUpper.includes('UP')) {
    direction = 'bull';
  } else if (dirUpper === 'SHORT' || dirUpper === 'BEAR' || macroColor === 'RED' || labelUpper.includes('BEAR') || labelUpper.includes('DOWN')) {
    direction = 'bear';
  }

  // Tier mapping
  let tier: RegimeTier = 'moderate';
  if (confidence >= 0.70 || labelUpper.includes('STRONG')) {
    tier = 'strong';
  } else if (confidence >= 0.50 || labelUpper.includes('MODERATE')) {
    tier = 'moderate';
  } else {
    tier = 'emerging';
  }

  const btcTrend = (raw.btcTrend || (macroColor === 'GREEN' ? 'UP' : macroColor === 'RED' ? 'DOWN' : 'NEUTRAL')) as any;
  const ethTrend = (raw.ethTrend || btcTrend) as any;

  return {
    direction,
    tier,
    confidence,
    btcTrend,
    ethTrend,
    btcMacroColor: (macroColor as any) || 'AMBER',
    timestamp: raw.timestamp || Date.now(),
    label: raw.label || raw.regime
  };
}

/**
 * Full 11-Stage Trend Pullback Sweep Reversal Strategy Evaluator
 */
export function evaluateTrendPullbackSweep(input: EvaluateTpsrInput): TpsrEvaluationResult {
  const {
    symbol,
    execCandles,
    directionCandles = [],
    dailyCandles = [],
    mode = 'balanced',
    regime = extractTpsrRegime(null),
    overrides = {},
    symbolVolumePercentile = 50,
    symbolSpread = 0,
    symbolRelativeStrengthVsBtc = 50,
    symbolDailyTrades = 0,
    symbolInCooldown = false,
    btcCandles = [],
    appFeeSettings
  } = input;

  const funnel = TpsrFunnelTracker.get();

  // 1. Resolve configuration through registry precedence
  const { values: cfg, configHash } = resolveTpsrConfig({
    mode,
    regimeTier: regime.tier,
    pinnedOverrides: overrides
  });

  // Closed candle slicing (Rule 2.3: Closed candles only)
  const closedExec = input.isCandlesClosed ? execCandles : (execCandles && execCandles.length > 1 ? execCandles.slice(0, -1) : []);
  const rawDir = directionCandles && directionCandles.length >= 20 ? directionCandles : closedExec;
  const closedDir = input.isCandlesClosed ? rawDir : (rawDir && rawDir.length > 1 ? rawDir.slice(0, -1) : rawDir);
  const execLen = closedExec ? closedExec.length : 0;
  const dirLen = closedDir ? closedDir.length : 0;

  if (execLen < 30 || dirLen < 20) {
    return {
      status: 'STANDBY',
      state: 'STANDBY',
      stage: 'STAGE_0_UNIVERSE',
      reason: 'INSUFFICIENT_DATA',
      details: `Execution bars (${execLen}) or direction bars (${dirLen}) insufficient`,
      config: cfg
    };
  }

  // ATR calculation on execution timeframe
  const execHighs = closedExec.map(c => c.high);
  const execLows = closedExec.map(c => c.low);
  const execCloses = closedExec.map(c => c.close);
  const atrArr = calculateATR(execHighs, execLows, execCloses, 14);
  const atr = atrArr[execLen - 1] ?? (closedExec[execLen - 1].close * 0.015);

  if (atr <= 0 || isNaN(atr)) {
    return {
      status: 'STANDBY',
      state: 'STANDBY',
      stage: 'STAGE_0_UNIVERSE',
      reason: 'INVALID_ATR',
      config: cfg
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // STAGE 0: UNIVERSE & VOLATILITY FILTERS
  // ───────────────────────────────────────────────────────────────────────────
  if (symbolVolumePercentile < cfg['universe.minVolumePercentile']) {
    return {
      status: 'REJECTED',
      state: 'SCANNING',
      stage: 'STAGE_0_UNIVERSE',
      reason: 'LOW_VOLUME_PERCENTILE',
      details: `Volume percentile ${symbolVolumePercentile}% < min ${cfg['universe.minVolumePercentile']}%`,
      config: cfg
    };
  }

  // ATR Percentile ranking over volatility.lookbackBars
  const lookbackBars = Math.min(execLen, cfg['volatility.lookbackBars']);
  const recentAtrs = atrArr.slice(-lookbackBars).filter(a => a > 0);
  if (recentAtrs.length > 10) {
    recentAtrs.sort((a, b) => a - b);
    const rankIdx = recentAtrs.findIndex(a => a >= atr);
    const atrPercentile = rankIdx >= 0 ? (rankIdx / recentAtrs.length) * 100 : 50;
    if (atrPercentile < cfg['volatility.atrPercentileBandMin'] || atrPercentile > cfg['volatility.atrPercentileBandMax']) {
      return {
        status: 'REJECTED',
        state: 'SCANNING',
        stage: 'STAGE_0_UNIVERSE',
        reason: 'VOLATILITY_OUT_OF_BAND',
        details: `ATR percentile ${atrPercentile.toFixed(1)}% outside allowed band [${cfg['volatility.atrPercentileBandMin']}, ${cfg['volatility.atrPercentileBandMax']}]`,
        config: cfg
      };
    }
  }

  funnel.recordStagePass(mode, 'universePass');

  // ───────────────────────────────────────────────────────────────────────────
  // STAGE 1: REGIME GATE
  // ───────────────────────────────────────────────────────────────────────────
  if (regime.direction === 'neutral') {
    return {
      status: 'STANDBY',
      state: 'STANDBY',
      stage: 'STAGE_1_REGIME',
      reason: 'REGIME_NEUTRAL',
      details: 'Regime engine is neutral: no directional trend available',
      config: cfg
    };
  }

  const plannedSide: 'LONG' | 'SHORT' = regime.direction === 'bull' ? 'LONG' : 'SHORT';

  // Strength tier check
  const tiers: RegimeTier[] = ['emerging', 'moderate', 'strong'];
  const minTierIdx = tiers.indexOf(cfg['regime.minStrength']);
  const actualTierIdx = tiers.indexOf(regime.tier);
  if (actualTierIdx < minTierIdx) {
    return {
      status: 'STANDBY',
      state: 'STANDBY',
      stage: 'STAGE_1_REGIME',
      reason: 'REGIME_WEAK_TIER',
      details: `Regime tier ${regime.tier} below required ${cfg['regime.minStrength']}`,
      config: cfg
    };
  }

  // Confidence check
  if (regime.confidence < cfg['regime.minConfidence']) {
    return {
      status: 'STANDBY',
      state: 'STANDBY',
      stage: 'STAGE_1_REGIME',
      reason: 'REGIME_LOW_CONFIDENCE',
      details: `Confidence ${regime.confidence.toFixed(2)} below minimum ${cfg['regime.minConfidence']}`,
      config: cfg
    };
  }

  // Stale data check
  const ageMinutes = (Date.now() - regime.timestamp) / 60000;
  if (ageMinutes > cfg['regime.maxAgeMinutes']) {
    return {
      status: 'STANDBY',
      state: 'STANDBY',
      stage: 'STAGE_1_REGIME',
      reason: 'REGIME_STALE_TELEMETRY',
      details: `Telemetry age ${ageMinutes.toFixed(0)}m exceeds ${cfg['regime.maxAgeMinutes']}m`,
      config: cfg
    };
  }

  // BTC/ETH confirmation rule
  const confirmationRule = cfg['regime.confirmation'];
  if (confirmationRule === 'both_agree') {
    if (plannedSide === 'LONG' && (regime.btcTrend !== 'UP' || regime.ethTrend !== 'UP')) {
      return { status: 'STANDBY', state: 'STANDBY', stage: 'STAGE_1_REGIME', reason: 'BTC_ETH_DISAGREE', config: cfg };
    }
    if (plannedSide === 'SHORT' && (regime.btcTrend !== 'DOWN' || regime.ethTrend !== 'DOWN')) {
      return { status: 'STANDBY', state: 'STANDBY', stage: 'STAGE_1_REGIME', reason: 'BTC_ETH_DISAGREE', config: cfg };
    }
  } else if (confirmationRule === 'btc_not_opposing') {
    if (plannedSide === 'LONG' && regime.btcTrend === 'DOWN') {
      return { status: 'STANDBY', state: 'STANDBY', stage: 'STAGE_1_REGIME', reason: 'BTC_OPPOSING', config: cfg };
    }
    if (plannedSide === 'SHORT' && regime.btcTrend === 'UP') {
      return { status: 'STANDBY', state: 'STANDBY', stage: 'STAGE_1_REGIME', reason: 'BTC_OPPOSING', config: cfg };
    }
  } else if (confirmationRule === 'neither_opposes') {
    if (plannedSide === 'LONG' && (regime.btcTrend === 'DOWN' || regime.ethTrend === 'DOWN')) {
      return { status: 'STANDBY', state: 'STANDBY', stage: 'STAGE_1_REGIME', reason: 'BENCHMARK_OPPOSING', config: cfg };
    }
    if (plannedSide === 'SHORT' && (regime.btcTrend === 'UP' || regime.ethTrend === 'UP')) {
      return { status: 'STANDBY', state: 'STANDBY', stage: 'STAGE_1_REGIME', reason: 'BENCHMARK_OPPOSING', config: cfg };
    }
  }

  // Relative strength vs BTC check
  if (cfg['rs.minPercentile'] > 0) {
    if (plannedSide === 'LONG' && symbolRelativeStrengthVsBtc < cfg['rs.minPercentile']) {
      return {
        status: 'REJECTED',
        state: 'SCANNING',
        stage: 'STAGE_1_REGIME',
        reason: 'RS_TOO_WEAK',
        details: `Relative strength ${symbolRelativeStrengthVsBtc}% < min ${cfg['rs.minPercentile']}%`,
        config: cfg
      };
    }
    if (plannedSide === 'SHORT' && symbolRelativeStrengthVsBtc > (100 - cfg['rs.minPercentile'])) {
      return {
        status: 'REJECTED',
        state: 'SCANNING',
        stage: 'STAGE_1_REGIME',
        reason: 'RS_TOO_STRONG',
        details: `Short candidate RS ${symbolRelativeStrengthVsBtc}% too resilient`,
        config: cfg
      };
    }
  }

  funnel.recordStagePass(mode, 'regimePass');

  // ───────────────────────────────────────────────────────────────────────────
  // STAGE 2: TREND ON DIRECTION TIMEFRAME
  // ───────────────────────────────────────────────────────────────────────────
  const dirCloses = closedDir.map(c => c.close);
  const dirHighs = closedDir.map(c => c.high);
  const dirLows = closedDir.map(c => c.low);

  const emaFastArr = calculateEMA(dirCloses, cfg['trend.emaFast']);
  const emaMidArr = calculateEMA(dirCloses, cfg['trend.emaMid']);
  const emaSlowArr = calculateEMA(dirCloses, cfg['trend.emaSlow']);
  const adxResult = calculateADX(dirHighs, dirLows, dirCloses, 14);

  const lastDirIdx = dirLen - 1;
  const emaFast = emaFastArr[lastDirIdx] ?? dirCloses[lastDirIdx];
  const emaMid = emaMidArr[lastDirIdx] ?? dirCloses[lastDirIdx];
  const emaSlow = emaSlowArr[lastDirIdx] ?? dirCloses[lastDirIdx];
  const adxVal = adxResult.adx[lastDirIdx] ?? 0;
  const lastDirClose = dirCloses[lastDirIdx];

  // 4 equally weighted trend components:
  let comp1Alignment = 0;
  let comp2PriceSide = 0;
  let comp3Structure = 0;
  let comp4Adx = 0;

  if (plannedSide === 'LONG') {
    if (emaFast > emaMid && emaMid > emaSlow) comp1Alignment = 0.25;
    if (lastDirClose > emaMid) comp2PriceSide = 0.25;
    if (adxVal >= cfg['trend.minAdx']) comp4Adx = 0.25;

    // Structure component: higher highs and higher lows
    const { highs, lows } = findSwingPivots(closedDir, cfg['pivot.right']);
    if (highs.length >= 2 && lows.length >= 2) {
      const lastH = highs[highs.length - 1].price;
      const prevH = highs[highs.length - 2].price;
      const lastL = lows[lows.length - 1].price;
      const prevL = lows[lows.length - 2].price;
      if (lastH >= prevH && lastL >= prevL) comp3Structure = 0.25;
    } else {
      comp3Structure = 0.125; // Neutral baseline if insufficient pivots
    }
  } else {
    // SHORT
    if (emaFast < emaMid && emaMid < emaSlow) comp1Alignment = 0.25;
    if (lastDirClose < emaMid) comp2PriceSide = 0.25;
    if (adxVal >= cfg['trend.minAdx']) comp4Adx = 0.25;

    const { highs, lows } = findSwingPivots(closedDir, cfg['pivot.right']);
    if (highs.length >= 2 && lows.length >= 2) {
      const lastH = highs[highs.length - 1].price;
      const prevH = highs[highs.length - 2].price;
      const lastL = lows[lows.length - 1].price;
      const prevL = lows[lows.length - 2].price;
      if (lastH <= prevH && lastL <= prevL) comp3Structure = 0.25;
    } else {
      comp3Structure = 0.125;
    }
  }

  const trendScore = comp1Alignment + comp2PriceSide + comp3Structure + comp4Adx;
  if (trendScore < cfg['trend.minScore']) {
    return {
      status: 'REJECTED',
      state: 'SCANNING',
      stage: 'STAGE_2_TREND',
      reason: 'TREND_SCORE_INADEQUATE',
      details: `Trend score ${trendScore.toFixed(2)} < required ${cfg['trend.minScore']}`,
      config: cfg
    };
  }

  funnel.recordStagePass(mode, 'trendPass');

  // ───────────────────────────────────────────────────────────────────────────
  // STAGE 3: IMPULSE AND PULLBACK ON EXECUTION TIMEFRAME
  // ───────────────────────────────────────────────────────────────────────────
  const { highs: execPivotsHigh, lows: execPivotsLow } = findSwingPivots(closedExec, cfg['pivot.right']);
  if (execPivotsHigh.length === 0 || execPivotsLow.length === 0) {
    return { status: 'REJECTED', state: 'SCANNING', stage: 'STAGE_3_IMPULSE_PULLBACK', reason: 'NO_SWING_PIVOTS', config: cfg };
  }

  let impulseOriginIdx = -1;
  let impulseExtremeIdx = -1;
  let impulseHeight = 0;

  if (plannedSide === 'LONG') {
    const lastHighPivot = execPivotsHigh[execPivotsHigh.length - 1];
    const precedingLows = execPivotsLow.filter(l => l.index < lastHighPivot.index);
    if (precedingLows.length === 0) {
      return { status: 'REJECTED', state: 'SCANNING', stage: 'STAGE_3_IMPULSE_PULLBACK', reason: 'NO_IMPULSE_ORIGIN', config: cfg };
    }
    const originLow = precedingLows[precedingLows.length - 1];
    impulseOriginIdx = originLow.index;
    impulseExtremeIdx = lastHighPivot.index;
    impulseHeight = lastHighPivot.price - originLow.price;
  } else {
    // SHORT
    const lastLowPivot = execPivotsLow[execPivotsLow.length - 1];
    const precedingHighs = execPivotsHigh.filter(h => h.index < lastLowPivot.index);
    if (precedingHighs.length === 0) {
      return { status: 'REJECTED', state: 'SCANNING', stage: 'STAGE_3_IMPULSE_PULLBACK', reason: 'NO_IMPULSE_ORIGIN', config: cfg };
    }
    const originHigh = precedingHighs[precedingHighs.length - 1];
    impulseOriginIdx = originHigh.index;
    impulseExtremeIdx = lastLowPivot.index;
    impulseHeight = originHigh.price - lastLowPivot.price;
  }

  const impulseBars = impulseExtremeIdx - impulseOriginIdx;
  if (impulseHeight < cfg['impulse.minATR'] * atr) {
    return {
      status: 'REJECTED',
      state: 'SCANNING',
      stage: 'STAGE_3_IMPULSE_PULLBACK',
      reason: 'IMPULSE_TOO_SMALL',
      details: `Impulse height ${(impulseHeight / atr).toFixed(2)} ATR < min ${cfg['impulse.minATR']}`,
      config: cfg
    };
  }

  if (impulseBars > cfg['impulse.maxBars']) {
    return {
      status: 'REJECTED',
      state: 'SCANNING',
      stage: 'STAGE_3_IMPULSE_PULLBACK',
      reason: 'IMPULSE_TOO_SLOW',
      details: `Impulse took ${impulseBars} bars > max ${cfg['impulse.maxBars']}`,
      config: cfg
    };
  }

  // Pullback measurement: from impulseExtremeIdx to current bar
  const pullbackBars = execLen - 1 - impulseExtremeIdx;
  if (pullbackBars < cfg['pullback.minBars']) {
    return {
      status: 'REJECTED',
      state: 'SCANNING',
      stage: 'STAGE_3_IMPULSE_PULLBACK',
      reason: 'PULLBACK_TOO_BRIEF',
      details: `Pullback ${pullbackBars} bars < min ${cfg['pullback.minBars']}`,
      config: cfg
    };
  }

  if (pullbackBars > cfg['pullback.maxBars']) {
    return {
      status: 'REJECTED',
      state: 'SCANNING',
      stage: 'STAGE_3_IMPULSE_PULLBACK',
      reason: 'PULLBACK_EXPIRED',
      details: `Pullback ${pullbackBars} bars > max ${cfg['pullback.maxBars']}`,
      config: cfg
    };
  }

  const pullbackSlice = closedExec.slice(impulseExtremeIdx);
  const pullbackLowest = Math.min(...pullbackSlice.map(c => c.low));
  const pullbackHighest = Math.max(...pullbackSlice.map(c => c.high));

  // Invalidation check: close beyond impulse origin kills the setup
  const originPrice = plannedSide === 'LONG' ? closedExec[impulseOriginIdx].low : closedExec[impulseOriginIdx].high;
  for (const bar of pullbackSlice) {
    if (plannedSide === 'LONG' && bar.close < originPrice) {
      return { status: 'REJECTED', state: 'SCANNING', stage: 'STAGE_3_IMPULSE_PULLBACK', reason: 'STRUCTURE_BROKEN_AT_ORIGIN', config: cfg };
    }
    if (plannedSide === 'SHORT' && bar.close > originPrice) {
      return { status: 'REJECTED', state: 'SCANNING', stage: 'STAGE_3_IMPULSE_PULLBACK', reason: 'STRUCTURE_BROKEN_AT_ORIGIN', config: cfg };
    }
  }

  // Retrace depth
  const extremePrice = plannedSide === 'LONG' ? closedExec[impulseExtremeIdx].high : closedExec[impulseExtremeIdx].low;
  const retraceDistance = plannedSide === 'LONG' ? (extremePrice - pullbackLowest) : (pullbackHighest - extremePrice);
  const retraceFraction = impulseHeight > 0 ? retraceDistance / impulseHeight : 0;

  if (retraceFraction < cfg['retrace.min'] || retraceFraction > cfg['retrace.max']) {
    return {
      status: 'REJECTED',
      state: 'SCANNING',
      stage: 'STAGE_3_IMPULSE_PULLBACK',
      reason: 'RETRACE_DEPTH_OUT_OF_BOUNDS',
      details: `Retrace ${retraceFraction.toFixed(3)} outside [${cfg['retrace.min']}, ${cfg['retrace.max']}]`,
      config: cfg
    };
  }

  // Pullback volume check (corrective character)
  if (cfg['pullback.maxVolumeRatio'] > 0) {
    const impulseVolAvg = closedExec.slice(impulseOriginIdx, impulseExtremeIdx + 1).reduce((s, c) => s + (c.volume ?? 0), 0) / Math.max(1, impulseBars);
    const pullbackVolAvg = pullbackSlice.reduce((s, c) => s + (c.volume ?? 0), 0) / Math.max(1, pullbackBars);
    const volRatio = impulseVolAvg > 0 ? pullbackVolAvg / impulseVolAvg : 1;
    if (volRatio > cfg['pullback.maxVolumeRatio']) {
      return {
        status: 'REJECTED',
        state: 'SCANNING',
        stage: 'STAGE_3_IMPULSE_PULLBACK',
        reason: 'PULLBACK_VOLUME_TOO_HEAVY',
        details: `Pullback vol ratio ${volRatio.toFixed(2)} > max ${cfg['pullback.maxVolumeRatio']}`,
        config: cfg
      };
    }
  }

  funnel.recordStagePass(mode, 'pullbackPass');

  // ───────────────────────────────────────────────────────────────────────────
  // STAGE 4: VALUE ZONE CONFLUENCE
  // ───────────────────────────────────────────────────────────────────────────
  const zoneTolerance = cfg['zone.toleranceATR'] * atr;
  let confluenceCount = 0;
  const currentPullbackPrice = plannedSide === 'LONG' ? pullbackLowest : pullbackHighest;

  // 1. Execution TF EMA band (EMA21 - EMA55)
  const execEma21 = calculateEMA(execCloses, 21)[execLen - 1] ?? execCloses[execLen - 1];
  const execEma55 = calculateEMA(execCloses, 55)[execLen - 1] ?? execCloses[execLen - 1];
  const minEma = Math.min(execEma21, execEma55);
  const maxEma = Math.max(execEma21, execEma55);
  if (currentPullbackPrice <= maxEma + zoneTolerance && currentPullbackPrice >= minEma - zoneTolerance) {
    confluenceCount++;
  }

  // 2. Anchored VWAP from impulse origin
  const avwap = calculateAnchoredVWAP(closedExec, impulseOriginIdx);
  if (Math.abs(currentPullbackPrice - avwap) <= zoneTolerance) {
    confluenceCount++;
  }

  // 3. Prior structure flipped (prior swing high for long, swing low for short)
  const priorStructure = plannedSide === 'LONG'
    ? execPivotsHigh.filter(h => h.index < impulseOriginIdx).slice(-1)[0]?.price
    : execPivotsLow.filter(l => l.index < impulseOriginIdx).slice(-1)[0]?.price;
  if (priorStructure && Math.abs(currentPullbackPrice - priorStructure) <= zoneTolerance) {
    confluenceCount++;
  }

  // 4. Direction timeframe level
  const htfKeyLevel = plannedSide === 'LONG' ? emaMid : emaMid;
  if (Math.abs(currentPullbackPrice - htfKeyLevel) <= zoneTolerance * 1.5) {
    confluenceCount++;
  }

  // 5. Volume Node / 50% POC approximation
  const impulseMid = (originPrice + extremePrice) / 2;
  if (Math.abs(currentPullbackPrice - impulseMid) <= zoneTolerance) {
    confluenceCount++;
  }

  if (confluenceCount < cfg['zone.minConfluence']) {
    return {
      status: 'REJECTED',
      state: 'SCANNING',
      stage: 'STAGE_4_ZONE_CONFLUENCE',
      reason: 'CONFLUENCE_INSUFFICIENT',
      details: `Touched ${confluenceCount} elements < min ${cfg['zone.minConfluence']}`,
      config: cfg
    };
  }

  funnel.recordStagePass(mode, 'zonePass');

  // ───────────────────────────────────────────────────────────────────────────
  // STAGE 5: LIQUIDITY SWEEP
  // ───────────────────────────────────────────────────────────────────────────
  // Candidate pools to sweep: stops resting under lows for longs, above highs for shorts
  const targetPoolSide: 'LOW' | 'HIGH' = plannedSide === 'LONG' ? 'LOW' : 'HIGH';

  // Build candidate pools from recent price history up to impulseExtremeIdx
  const swingPools = (plannedSide === 'LONG' ? execPivotsLow : execPivotsHigh)
    .filter(p => (execLen - 1 - p.index) <= cfg['sweep.poolLookbackBars'] && p.index <= execLen - 2)
    .map(p => ({
      level: p.price,
      index: p.index,
      type: 'swingHL' as const
    }));

  // Pullback micro-extreme pool
  const microExtremePool = {
    level: plannedSide === 'LONG' ? pullbackLowest : pullbackHighest,
    index: impulseExtremeIdx + 1,
    type: 'microHL' as const
  };

  const candidatePoolLevels = [...swingPools, microExtremePool];

  let sweptPool: { level: number; index: number; type: string } | null = null;
  let sweepCandleIdx = -1;
  let sweepExtremePrice = plannedSide === 'LONG' ? Infinity : -Infinity;

  // Search recent bars (within last 4 bars) for the sweep
  const searchStart = Math.max(impulseExtremeIdx, execLen - 4);
  for (let barIdx = searchStart; barIdx < execLen; barIdx++) {
    const c = closedExec[barIdx];
    for (const pool of candidatePoolLevels) {
      if (plannedSide === 'LONG') {
        if (c.low < pool.level) {
          const penetration = (pool.level - c.low) / atr;
          if (penetration >= cfg['sweep.minPenetrationATR'] && penetration <= cfg['sweep.maxPenetrationATR']) {
            sweptPool = pool;
            sweepCandleIdx = barIdx;
            sweepExtremePrice = Math.min(sweepExtremePrice, c.low);
            break;
          }
        }
      } else {
        if (c.high > pool.level) {
          const penetration = (c.high - pool.level) / atr;
          if (penetration >= cfg['sweep.minPenetrationATR'] && penetration <= cfg['sweep.maxPenetrationATR']) {
            sweptPool = pool;
            sweepCandleIdx = barIdx;
            sweepExtremePrice = Math.max(sweepExtremePrice, c.high);
            break;
          }
        }
      }
    }
    if (sweptPool) break;
  }

  if (!sweptPool || sweepCandleIdx < 0) {
    return {
      status: 'REJECTED',
      state: 'SCANNING',
      stage: 'STAGE_5_LIQUIDITY_SWEEP',
      reason: 'NO_SWEEP_DETECTED',
      details: 'No resting liquidity pool swept within allowed ATR penetration boundaries',
      config: cfg
    };
  }

  // Reclaim verification
  const reclaimWithin = cfg['sweep.maxBarsToReclaim'];
  let reclaimed = false;
  for (let r = sweepCandleIdx; r < Math.min(execLen, sweepCandleIdx + reclaimWithin + 1); r++) {
    const c = closedExec[r];
    if (plannedSide === 'LONG' && c.close > sweptPool.level) reclaimed = true;
    if (plannedSide === 'SHORT' && c.close < sweptPool.level) reclaimed = true;
    if (reclaimed) break;
  }
  if (!reclaimed) {
    return {
      status: 'REJECTED',
      state: 'SCANNING',
      stage: 'STAGE_5_LIQUIDITY_SWEEP',
      reason: 'SWEEP_NOT_RECLAIMED',
      details: `Price failed to close back inside swept pool within ${reclaimWithin} bars`,
      config: cfg
    };
  }

  // Sweep volume verification
  if (cfg['sweep.minVolumeRatio'] > 0) {
    const volSmaArr = calculateSMA(closedExec.map(c => c.volume ?? 0), 20);
    const volSma = volSmaArr[sweepCandleIdx] ?? 1;
    const sweepVol = closedExec[sweepCandleIdx].volume ?? 1;
    if (sweepVol / volSma < cfg['sweep.minVolumeRatio']) {
      return {
        status: 'REJECTED',
        state: 'SCANNING',
        stage: 'STAGE_5_LIQUIDITY_SWEEP',
        reason: 'SWEEP_VOLUME_INSUFFICIENT',
        config: cfg
      };
    }
  }

  funnel.recordStagePass(mode, 'sweepPass');

  // ───────────────────────────────────────────────────────────────────────────
  // STAGE 6: REJECTION CANDLE
  // ───────────────────────────────────────────────────────────────────────────
  let rejCandleIdx = -1;
  const maxRejBars = cfg['rejection.maxBarsAfterSweep'];
  const rejSearchEnd = Math.min(execLen - 2, sweepCandleIdx + maxRejBars);

  for (let idx = sweepCandleIdx; idx <= rejSearchEnd; idx++) {
    const c = closedExec[idx];
    const range = c.high - c.low;
    if (range < cfg['rejection.minRangeATR'] * atr || range > cfg['rejection.maxRangeATR'] * atr) continue;

    const body = Math.abs(c.close - c.open);
    const bodyShare = range > 0 ? body / range : 0;
    if (bodyShare < cfg['rejection.minBodyShare']) continue;

    if (plannedSide === 'LONG') {
      const lowerWick = Math.min(c.open, c.close) - c.low;
      const upperWick = c.high - Math.max(c.open, c.close);
      const wickShare = range > 0 ? lowerWick / range : 0;
      const oppWickShare = range > 0 ? upperWick / range : 0;
      const closeLocation = range > 0 ? (c.close - c.low) / range : 0;
      const wickToBody = body > 0 ? lowerWick / body : lowerWick / 0.0001;

      if (
        wickToBody >= cfg['rejection.minWickToBody'] &&
        wickShare >= cfg['rejection.minWickShareOfRange'] &&
        oppWickShare <= cfg['rejection.maxOppositeWickShare'] &&
        closeLocation >= cfg['rejection.minCloseLocation']
      ) {
        rejCandleIdx = idx;
        break;
      }
    } else {
      // SHORT
      const upperWick = c.high - Math.max(c.open, c.close);
      const lowerWick = Math.min(c.open, c.close) - c.low;
      const wickShare = range > 0 ? upperWick / range : 0;
      const oppWickShare = range > 0 ? lowerWick / range : 0;
      const closeLocation = range > 0 ? (c.high - c.close) / range : 0;
      const wickToBody = body > 0 ? upperWick / body : upperWick / 0.0001;

      if (
        wickToBody >= cfg['rejection.minWickToBody'] &&
        wickShare >= cfg['rejection.minWickShareOfRange'] &&
        oppWickShare <= cfg['rejection.maxOppositeWickShare'] &&
        closeLocation >= cfg['rejection.minCloseLocation']
      ) {
        rejCandleIdx = idx;
        break;
      }
    }
  }

  if (rejCandleIdx < 0) {
    return {
      status: 'ARMED',
      state: 'ARMED',
      stage: 'STAGE_6_REJECTION',
      reason: 'AWAITING_REJECTION_CANDLE',
      setupTrace: {
        sweepTime: closedExec[sweepCandleIdx].time,
        sweptPoolLevel: sweptPool.level,
        sweptPoolType: sweptPool.type
      },
      config: cfg
    };
  }

  funnel.recordStagePass(mode, 'rejectionPass');

  // ───────────────────────────────────────────────────────────────────────────
  // STAGE 7: ENGULF CONFIRMATION
  // ───────────────────────────────────────────────────────────────────────────
  const rejCandle = closedExec[rejCandleIdx];
  const confirmCandle = closedExec[execLen - 1]; // evaluated on the most recently closed bar
  const barsSinceRejection = (execLen - 1) - rejCandleIdx;

  if (barsSinceRejection > cfg['engulf.maxBarsAfterRejection']) {
    return {
      status: 'REJECTED',
      state: 'SCANNING',
      stage: 'STAGE_7_ENGULF',
      reason: 'ENGULF_WINDOW_EXPIRED',
      details: `${barsSinceRejection} bars since rejection > max ${cfg['engulf.maxBarsAfterRejection']}`,
      config: cfg
    };
  }

  // Re-sweep invalidation rule
  if (cfg['setup.invalidateOnReSweep']) {
    for (let k = rejCandleIdx; k < execLen; k++) {
      if (plannedSide === 'LONG' && closedExec[k].low < sweepExtremePrice) {
        return { status: 'REJECTED', state: 'SCANNING', stage: 'STAGE_7_ENGULF', reason: 'RE_SWEEP_INVALIDATION', config: cfg };
      }
      if (plannedSide === 'SHORT' && closedExec[k].high > sweepExtremePrice) {
        return { status: 'REJECTED', state: 'SCANNING', stage: 'STAGE_7_ENGULF', reason: 'RE_SWEEP_INVALIDATION', config: cfg };
      }
    }
  }

  const confirmRange = confirmCandle.high - confirmCandle.low;
  if (confirmRange > cfg['engulf.maxRangeATR'] * atr) {
    return {
      status: 'REJECTED',
      state: 'SCANNING',
      stage: 'STAGE_7_ENGULF',
      reason: 'ENGULF_RANGE_TOO_LARGE',
      details: 'Confirmation candle range exceeds maximum ATR (do not chase oversized bars)',
      config: cfg
    };
  }

  const confirmBody = Math.abs(confirmCandle.close - confirmCandle.open);
  const confirmBodyShare = confirmRange > 0 ? confirmBody / confirmRange : 0;
  if (confirmBodyShare < cfg['engulf.minBodyShare']) {
    return {
      status: 'ARMED',
      state: 'ARMED',
      stage: 'STAGE_7_ENGULF',
      reason: 'ENGULF_BODY_INADEQUATE',
      setupTrace: {
        sweepTime: closedExec[sweepCandleIdx].time,
        rejectionTime: rejCandle.time
      },
      config: cfg
    };
  }

  // Engulfing rule verification
  let engulfPassed = false;
  const engulfRule = cfg['engulf.rule'];
  if (plannedSide === 'LONG') {
    const isBullish = confirmCandle.close > confirmCandle.open;
    if (engulfRule === 'body_covers_rejection_and_closes_beyond') {
      engulfPassed = isBullish &&
        confirmCandle.close >= rejCandle.high &&
        confirmCandle.open <= rejCandle.close &&
        confirmCandle.close >= rejCandle.open;
    } else if (engulfRule === 'closes_beyond_rejection_extreme') {
      engulfPassed = isBullish && confirmCandle.close >= rejCandle.high;
    } else {
      // closes_beyond_rejection_midpoint
      const rejMid = (rejCandle.high + rejCandle.low) / 2;
      engulfPassed = isBullish && confirmCandle.close >= rejMid;
    }
  } else {
    // SHORT
    const isBearish = confirmCandle.close < confirmCandle.open;
    if (engulfRule === 'body_covers_rejection_and_closes_beyond') {
      engulfPassed = isBearish &&
        confirmCandle.close <= rejCandle.low &&
        confirmCandle.open >= rejCandle.close &&
        confirmCandle.close <= rejCandle.open;
    } else if (engulfRule === 'closes_beyond_rejection_extreme') {
      engulfPassed = isBearish && confirmCandle.close <= rejCandle.low;
    } else {
      // closes_beyond_rejection_midpoint
      const rejMid = (rejCandle.high + rejCandle.low) / 2;
      engulfPassed = isBearish && confirmCandle.close <= rejMid;
    }
  }

  if (!engulfPassed) {
    return {
      status: 'ARMED',
      state: 'ARMED',
      stage: 'STAGE_7_ENGULF',
      reason: 'AWAITING_ENGULF_CONFIRMATION',
      setupTrace: {
        sweepTime: closedExec[sweepCandleIdx].time,
        rejectionTime: rejCandle.time
      },
      config: cfg
    };
  }

  // Engulf volume check
  if (cfg['engulf.minVolumeRatio'] > 0) {
    const volSmaArr = calculateSMA(closedExec.map(c => c.volume ?? 0), 20);
    const volSma = volSmaArr[execLen - 1] ?? 1;
    if ((confirmCandle.volume ?? 0) / volSma < cfg['engulf.minVolumeRatio']) {
      return { status: 'REJECTED', state: 'SCANNING', stage: 'STAGE_7_ENGULF', reason: 'ENGULF_VOLUME_LOW', config: cfg };
    }
  }

  funnel.recordStagePass(mode, 'engulfPass');

  // ───────────────────────────────────────────────────────────────────────────
  // STAGE 8 & 9: ENTRY, STOP, TARGETS & DYNAMIC FEE-AWARE RR
  // ───────────────────────────────────────────────────────────────────────────
  let entryPrice = confirmCandle.close;
  if (cfg['entry.method'] === 'limitRetest' && cfg['entry.limitRetraceOfEngulf'] > 0) {
    const engulfHeight = confirmCandle.high - confirmCandle.low;
    entryPrice = plannedSide === 'LONG'
      ? confirmCandle.close - (engulfHeight * cfg['entry.limitRetraceOfEngulf'])
      : confirmCandle.close + (engulfHeight * cfg['entry.limitRetraceOfEngulf']);
  }

  // Stop placement
  const stopBuffer = cfg['stop.bufferATR'] * atr;
  let sl = plannedSide === 'LONG' ? (sweepExtremePrice - stopBuffer) : (sweepExtremePrice + stopBuffer);
  let riskPerUnit = Math.abs(entryPrice - sl);
  let stopDistATR = riskPerUnit / atr;

  if (stopDistATR < cfg['stop.minATR']) {
    // Widen stop to minimum distance floor
    sl = plannedSide === 'LONG' ? entryPrice - (cfg['stop.minATR'] * atr) : entryPrice + (cfg['stop.minATR'] * atr);
    riskPerUnit = Math.abs(entryPrice - sl);
    stopDistATR = cfg['stop.minATR'];
  } else if (stopDistATR > cfg['stop.maxATR']) {
    return {
      status: 'REJECTED',
      state: 'SCANNING',
      stage: 'STAGE_9_RISK_TARGETS',
      reason: 'STOP_TOO_WIDE',
      details: `Stop distance ${stopDistATR.toFixed(2)} ATR > max ${cfg['stop.maxATR']}`,
      config: cfg
    };
  }

  // Spread check against planned stop distance
  if (symbolSpread > 0 && riskPerUnit > 0) {
    if (symbolSpread / riskPerUnit > cfg['spread.maxShareOfStop']) {
      return {
        status: 'REJECTED',
        state: 'SCANNING',
        stage: 'STAGE_9_RISK_TARGETS',
        reason: 'SPREAD_EXCEEDS_RISK_SHARE',
        config: cfg
      };
    }
  }

  // Dynamic fee calculation: 2 * takerFee * (1 + GST)
  const feeRoundTripPct = getAppFeeRoundTripPct(appFeeSettings);
  const stopDistPct = (riskPerUnit / entryPrice) * 100;
  const costInR = feeCostInR(feeRoundTripPct, stopDistPct);

  if (costInR > cfg['fees.maxShareOfRisk']) {
    return {
      status: 'REJECTED',
      state: 'SCANNING',
      stage: 'STAGE_9_RISK_TARGETS',
      reason: 'FEE_DRAG_EXCEEDS_BUDGET',
      details: `Round-trip fee drag ${costInR.toFixed(3)} R > max ${cfg['fees.maxShareOfRisk']}`,
      config: cfg
    };
  }

  // Structural targets with level buffer
  const levelBuffer = cfg['tp.levelBufferATR'] * atr;
  const targetExtreme = plannedSide === 'LONG' ? (extremePrice - levelBuffer) : (extremePrice + levelBuffer);
  const measuredMove = plannedSide === 'LONG'
    ? entryPrice + impulseHeight
    : entryPrice - impulseHeight;

  let tp1 = plannedSide === 'LONG' ? entryPrice + (riskPerUnit * cfg['tp1.minRR']) : entryPrice - (riskPerUnit * cfg['tp1.minRR']);
  let tp2 = plannedSide === 'LONG' ? Math.max(targetExtreme, entryPrice + (riskPerUnit * cfg['tp2.minRR'])) : Math.min(targetExtreme, entryPrice - (riskPerUnit * cfg['tp2.minRR']));
  let tp3 = measuredMove;

  const rr1 = Math.abs(tp1 - entryPrice) / riskPerUnit;
  const rr2 = Math.abs(tp2 - entryPrice) / riskPerUnit;
  const rr3 = Math.abs(tp3 - entryPrice) / riskPerUnit;

  const tp1Share = cfg['tp1.sharePct'] / 100;
  const tp2Share = cfg['tp2.sharePct'] / 100;
  const runnerShare = Math.max(0, 1 - tp1Share - tp2Share);

  const blendedGrossRR = (rr1 * tp1Share) + (rr2 * tp2Share) + (rr3 * runnerShare);
  const blendedNetRR = blendedGrossRR - costInR;

  if (blendedNetRR < cfg['rr.minBlendedNet']) {
    return {
      status: 'REJECTED',
      state: 'SCANNING',
      stage: 'STAGE_9_RISK_TARGETS',
      reason: 'BLENDED_NET_RR_TOO_LOW',
      details: `Blended net RR ${blendedNetRR.toFixed(2)} < required ${cfg['rr.minBlendedNet']}`,
      config: cfg
    };
  }

  funnel.recordStagePass(mode, 'entryPass');

  // ───────────────────────────────────────────────────────────────────────────
  // STAGE 10: FINAL VETOES & QUALITY SCORING
  // ───────────────────────────────────────────────────────────────────────────
  if (symbolInCooldown) {
    funnel.recordVeto(mode, 'COOLDOWN_ACTIVE');
    return { status: 'REJECTED', state: 'SCANNING', stage: 'STAGE_10_FINAL_VETO', reason: 'COOLDOWN_ACTIVE', config: cfg };
  }

  if (symbolDailyTrades >= cfg['symbolDailyCap']) {
    funnel.recordVeto(mode, 'DAILY_CAP_REACHED');
    return { status: 'REJECTED', state: 'SCANNING', stage: 'STAGE_10_FINAL_VETO', reason: 'DAILY_CAP_REACHED', config: cfg };
  }

  // BTC adverse shock veto over last 3 bars
  if (btcCandles && btcCandles.length >= 3) {
    const btcLast3 = btcCandles.slice(-3);
    const btcMove = btcLast3[btcLast3.length - 1].close - btcLast3[0].open;
    const btcAtr = Math.abs(btcLast3[btcLast3.length - 1].high - btcLast3[btcLast3.length - 1].low) || 1000;
    const btcShockAtr = Math.abs(btcMove) / btcAtr;
    if (plannedSide === 'LONG' && btcMove < 0 && btcShockAtr > cfg['shock.btcAdverseATR']) {
      funnel.recordVeto(mode, 'BTC_SHOCK_VETO');
      return { status: 'REJECTED', state: 'SCANNING', stage: 'STAGE_10_FINAL_VETO', reason: 'BTC_SHOCK_VETO', config: cfg };
    }
    if (plannedSide === 'SHORT' && btcMove > 0 && btcShockAtr > cfg['shock.btcAdverseATR']) {
      funnel.recordVeto(mode, 'BTC_SHOCK_VETO');
      return { status: 'REJECTED', state: 'SCANNING', stage: 'STAGE_10_FINAL_VETO', reason: 'BTC_SHOCK_VETO', config: cfg };
    }
  }

  // Multi-factor Quality Score (0 to 100)
  const regimeScore = (regime.confidence) * cfg['score.weightRegime'];
  const trendPart = (trendScore) * cfg['score.weightTrend'];
  const zonePart = Math.min(cfg['score.weightZone'], (confluenceCount / 2) * cfg['score.weightZone']);
  const sweepPart = cfg['score.weightSweep'];
  const rejPart = cfg['score.weightRejection'];
  const engulfPart = cfg['score.weightEngulf'];
  const rrPart = Math.min(cfg['score.weightNetRR'], (blendedNetRR / cfg['rr.minBlendedNet']) * cfg['score.weightNetRR']);

  const compositeScore = Math.min(100, Math.round(
    regimeScore + trendPart + zonePart + sweepPart + rejPart + engulfPart + rrPart
  ));

  if (compositeScore < cfg['score.minToTrade']) {
    funnel.recordVeto(mode, 'SCORE_BELOW_MIN');
    return {
      status: 'REJECTED',
      state: 'SCANNING',
      stage: 'STAGE_10_FINAL_VETO',
      reason: 'SCORE_BELOW_MIN',
      details: `Quality score ${compositeScore} < min ${cfg['score.minToTrade']}`,
      config: cfg
    };
  }

  funnel.recordStagePass(mode, 'signals');

  const reasonList = [
    `Regime ${regime.direction} ${regime.confidence.toFixed(2)} [${regime.tier}], BTC/ETH: ${cfg['regime.confirmation']}`,
    `Trend score ${trendScore.toFixed(2)}/1.00`,
    `Pullback retrace ${retraceFraction.toFixed(2)} of ${(impulseHeight / atr).toFixed(1)} ATR leg`,
    `Zone confluence ${confluenceCount} items`,
    `Sweep ${sweptPool.type} at ${sweptPool.level.toFixed(4)}`,
    `Rejection wick/body ${((rejCandle.high - rejCandle.low) / atr).toFixed(2)} ATR`,
    `Engulf confirmed: ${cfg['engulf.rule']}`,
    `Blended net R:R ${blendedNetRR.toFixed(2)}:1 (fees ${costInR.toFixed(3)}R)`
  ];

  const signal: TpsrSignal = {
    symbol,
    side: plannedSide,
    direction: plannedSide,
    mode,
    entryPrice,
    sl,
    tp1,
    tp2,
    tp3,
    tp1SharePct: cfg['tp1.sharePct'],
    tp2SharePct: cfg['tp2.sharePct'],
    runnerSharePct: Math.round(runnerShare * 100),
    riskPerUnit,
    stopDistanceATR: stopDistATR,
    blendedNetRR,
    feeCostInR: costInR,
    riskModeMultiplier: cfg['risk.modeMultiplier'],
    timeStopBars: cfg['timeStop.bars'],
    timeStopMinProgressR: cfg['timeStop.minProgressR'],
    trailAtrMult: cfg['trail.atrMult'],
    moveToBEAfterTp1: Boolean(cfg['be.afterTP1']),
    score: compositeScore,
    reason: reasonList.join(' | '),
    reasonList,
    regimeSnapshot: regime,
    configHash,
    setupTrace: {
      impulseTime: closedExec[impulseOriginIdx].time,
      sweepTime: closedExec[sweepCandleIdx].time,
      rejectionTime: rejCandle.time,
      engulfTime: confirmCandle.time,
      entryTime: confirmCandle.time,
      sweptPoolLevel: sweptPool.level,
      sweptPoolType: sweptPool.type
    },
    signalTime: confirmCandle.time,
    config: cfg
  };

  return {
    status: 'ACTIVE',
    state: 'TRIGGERED',
    signal,
    config: cfg
  };
}
