/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * ORDER BLOCK STRATEGY — Implementation Spec (v2)
 * 
 * Separate, independent strategy module for the crypto futures bot.
 * Core Trade Model:
 *   Liquidity event (preferred) -> Displacement -> BOS -> Order Block -> First retest -> Reaction -> Entry
 * 
 * Hard Gates:
 * 1. Closed candles only for all structure, swings, displacement, BOS, OB creation, and entry reaction.
 * 2. Swings confirmed only after swing_n closed bars.
 * 3. Displacement: impulse of 1-3 bars with net move >= 1.5 ATR, avg body/range >= 0.55, no close back through OB.
 * 4. BOS Link: must produce a confirmed close beyond a meaningful swing point (leg >= 1.0 ATR).
 * 5. Order Block Zone: last opposite candle/cluster. If width > 1.5 ATR, use body only; if still > 1.5 ATR -> OB_TOO_WIDE.
 * 6. Hard Minimum Risk/Reward >= 1:3.5 to a real structural target.
 * 7. Blocker rule: no major opposing swing level between entry and 2.0R.
 * 8. Cost filter: round-trip fees + slippage + spread must be <= 0.20R.
 * 9. Anti-chase filter: entry at most 0.5 ATR from zone near edge.
 * 10. Visible quality checklist decides size multiplier (no hidden numeric score).
 */

import { AppSettings } from '../../types';

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type ObDirection = 'LONG' | 'SHORT';
export type ObMarketRegime = 'BULLISH' | 'BEARISH' | 'NEUTRAL' | 'CHOPPY';
export type ObCoinRegime = 'BULLISH' | 'BEARISH' | 'NEUTRAL' | 'CHOPPY';
export type ObFreshness = 'FRESH' | 'TESTED' | 'INVALIDATED';
export type ObSetupStatus = 'VALID' | 'WAITING' | 'INVALID';

export type ObRejectionReason =
  | 'NO_LIQUIDITY_EVENT'
  | 'NO_DISPLACEMENT'
  | 'NO_STRUCTURE_BREAK'
  | 'OB_TOO_WIDE'
  | 'OB_ALREADY_TESTED'
  | 'OB_INVALIDATED'
  | 'OB_EXPIRED'
  | 'NO_REACTION'
  | 'ENTRY_TOO_FAR'
  | 'SL_TOO_TIGHT'
  | 'SL_TOO_WIDE'
  | 'COST_TOO_HIGH'
  | 'RR_BELOW_MIN'
  | 'TP_BLOCKED'
  | 'REGIME_CHOPPY';

export interface OrderBlockZone {
  direction: ObDirection;
  startIndex: number;
  startTime: number;
  high: number;
  low: number;
  midpoint: number;
  open: number;
  close: number;
  candleColor: 'BEARISH' | 'BULLISH';
  freshness: ObFreshness;
  touchCount: number;
  isInvalidated: boolean;
  invalidationLevel: number;
  usedBodyOnly: boolean;
  widthAtr: number;
}

export interface SwingPoint {
  index: number;
  time: number;
  price: number;
  type: 'HIGH' | 'LOW';
  isMajor: boolean;
  legAtr: number;
}

export interface QualityChecklist {
  liquiditySweepConfirmed: boolean; // +1
  strongDisplacement: boolean; // +1 (net move >= 2.0 ATR)
  supportiveVolume: boolean; // +1 (rel vol >= 1.3)
  cleanFirstTouch: boolean; // +1 (touch count === 1)
  chochStructure: boolean; // +1 (CHOCH vs standard continuation BOS)
  htfAlignment: boolean; // +1 (aligned with macro BTC/trend)
  highEfficiency: boolean; // +1 (ER >= 0.55)
  totalPassed: number; // 0 to 7
  grade: 'A+' | 'A' | 'B' | 'C';
  sizeMultiplier: number; // 0.3x to 1.0x
}

export interface OrderBlockSignal {
  strategy: 'ORDER_BLOCK';
  direction: ObDirection;
  finalDecision: 'EXECUTE' | 'WAIT' | 'REJECT';
  setupStatus: ObSetupStatus;
  status: 'TRIGGERED' | 'ARMED' | 'WAITING_FOR_RETEST' | 'WAITING_FOR_PA' | 'REJECTED';
  score: number; // 0 to 100

  // Regime Context
  marketRegime: ObMarketRegime;
  coinRegime: ObCoinRegime;
  marketRegimeScore: number;
  marketRegimeReason: string;
  coinRegimeReason: string;
  efficiencyRatio: number;

  // Structural Elements
  liquidityEvent: 'DETECTED' | 'NOT_DETECTED';
  liquidityEventType?: 'SELL_SIDE_SWEEP' | 'BUY_SIDE_SWEEP' | 'EQUAL_LOWS' | 'EQUAL_HIGHS' | 'RANGE_EXTREME';
  liquidityLevelPrice?: number;
  sweepExtremePrice?: number;

  displacementValid: 'VALID' | 'INVALID';
  displacementMagnitudeAtr: number;
  displacementVolumeRatio: number;

  structureBreakValid: 'VALID' | 'INVALID';
  structureBreakType?: 'BOS' | 'CHOCH';
  structureBreakLevel?: number;

  // Order Block Zone
  obType: 'BULLISH' | 'BEARISH';
  obHigh: number;
  obLow: number;
  obMidpoint: number;
  obFreshness: ObFreshness;
  obTouchCount: number;
  obCandleTime?: number;
  obWidthAtr: number;

  // Execution & Risk Geometry
  entryPrice: number;
  stopLossPrice: number;
  slDistancePct: number;
  slDistanceAtr: number;
  targetPrice: number;
  riskRewardRatio: number;
  costRatioR: number;
  logicalSl: number;
  tp1: number;
  tp2?: number;
  tp3?: number;

  // Retest & Fast Reaction
  retestConfirmed: boolean;
  retestPrice?: number;
  fastReactionType?: 'REJECTION_WICK' | 'ENGULFING_RESPONSE' | 'ZONE_HOLD' | 'NONE';

  // Anti-Chasing & Rejection
  isChasing: boolean;
  reason: string;
  rejectionReason: string | null;
  exactRejectionReason: ObRejectionReason | null;
  structuredExplanation: string;
  explanation: string;

  // Quality Checklist & Sizing (Section 12)
  qualityChecklist?: QualityChecklist;
  sizeMultiplier: number;

  // Telemetry
  atrValue: number;
  signalTime: number;
  timestamp: number;
  opposingLiquidityPrice?: number;
}

/**
 * Calculates Simple ATR over N periods
 */
export function calculateAtr(candles: Candle[], period: number = 14): number {
  if (!candles || candles.length < period + 1) return 0;
  let trSum = 0;
  const start = candles.length - period;
  for (let i = start; i < candles.length; i++) {
    const cur = candles[i];
    const prev = candles[i - 1];
    const tr = Math.max(
      cur.high - cur.low,
      Math.abs(cur.high - prev.close),
      Math.abs(cur.low - prev.close)
    );
    trSum += tr;
  }
  return trSum / period;
}

/**
 * Calculates 20-period Median Volume
 */
export function calculateMedianVolume(candles: Candle[], period: number = 20): number {
  if (!candles || candles.length < period) return 0;
  const slice = candles.slice(-period).map(c => c.volume || 0).sort((a, b) => a - b);
  const mid = Math.floor(slice.length / 2);
  return slice.length % 2 !== 0 ? slice[mid] : (slice[mid - 1] + slice[mid]) / 2;
}

/**
 * Calculates Kaufman Efficiency Ratio (ER) over N bars
 * ER = |net close change| / sum(|bar-to-bar close change|)
 */
export function calculateEfficiencyRatio(candles: Candle[], period: number = 20): number {
  if (!candles || candles.length <= period) return 0.5;
  const startIdx = candles.length - period;
  const netChange = Math.abs(candles[candles.length - 1].close - candles[startIdx].close);
  let sumChanges = 0;
  for (let i = startIdx + 1; i < candles.length; i++) {
    sumChanges += Math.abs(candles[i].close - candles[i - 1].close);
  }
  return sumChanges > 0 ? netChange / sumChanges : 0;
}

/**
 * Classifies Broader Market Regime (BTC benchmark)
 */
export function classifyObMarketRegime(btcCandles: Candle[]): {
  regime: ObMarketRegime;
  score: number;
  reason: string;
} {
  if (!btcCandles || btcCandles.length < 25) {
    return { regime: 'NEUTRAL', score: 50, reason: 'Insufficient BTC history; neutral assumed.' };
  }

  const len = btcCandles.length;
  const last = btcCandles[len - 1];
  const c10Ago = btcCandles[len - 10];
  const c25Ago = btcCandles[len - 25];

  const pct10 = ((last.close - c10Ago.close) / c10Ago.close) * 100;
  const pct25 = ((last.close - c25Ago.close) / c25Ago.close) * 100;

  const atr = calculateAtr(btcCandles, 14);
  const atrPct = (atr / last.close) * 100;

  // Unstable choppy / panic detection
  if (atrPct > 3.5 || Math.abs(pct10) > 8.0) {
    return {
      regime: 'CHOPPY',
      score: 35,
      reason: `BTC high volatility/instability (ATR: ${atrPct.toFixed(2)}%, 10-bar move: ${pct10.toFixed(2)}%)`
    };
  }

  if (pct25 > 1.8 && pct10 > 0.4) {
    return { regime: 'BULLISH', score: 85, reason: 'BTC bullish trend structure & momentum' };
  } else if (pct25 < -1.8 && pct10 < -0.4) {
    return { regime: 'BEARISH', score: 15, reason: 'BTC bearish downward continuation' };
  }

  return { regime: 'NEUTRAL', score: 50, reason: 'BTC ranging within normal structural bounds' };
}

/**
 * Finds adaptive swing highs and lows with swing_n confirmation bars
 * and filters by minimum leg ATR to eliminate noise.
 */
export function findSwings(
  candles: Candle[],
  swingN: number = 3,
  atr: number = 0,
  minSwingAtr: number = 1.0,
  majorLegAtr: number = 2.0
): {
  swingHighs: SwingPoint[];
  swingLows: SwingPoint[];
} {
  const swingHighs: SwingPoint[] = [];
  const swingLows: SwingPoint[] = [];
  const len = candles.length;
  const effectiveAtr = atr > 0 ? atr : calculateAtr(candles, 14);

  // Closed candles only: candles[len-1] is the latest closed candle
  for (let i = swingN; i < len - swingN; i++) {
    const cur = candles[i];
    let isHigh = true;
    let isLow = true;

    for (let j = 1; j <= swingN; j++) {
      if (candles[i - j].high >= cur.high || candles[i + j].high > cur.high) {
        isHigh = false;
      }
      if (candles[i - j].low <= cur.low || candles[i + j].low < cur.low) {
        isLow = false;
      }
    }

    if (isHigh) {
      // Calculate leg into swing high
      const priorLow = Math.min(...candles.slice(Math.max(0, i - 10), i).map(c => c.low));
      const legDist = cur.high - priorLow;
      const legAtr = effectiveAtr > 0 ? legDist / effectiveAtr : 1.0;
      if (legAtr >= minSwingAtr) {
        swingHighs.push({
          index: i,
          time: cur.time,
          price: cur.high,
          type: 'HIGH',
          isMajor: legAtr >= majorLegAtr,
          legAtr
        });
      }
    }

    if (isLow) {
      // Calculate leg into swing low
      const priorHigh = Math.max(...candles.slice(Math.max(0, i - 10), i).map(c => c.high));
      const legDist = priorHigh - cur.low;
      const legAtr = effectiveAtr > 0 ? legDist / effectiveAtr : 1.0;
      if (legAtr >= minSwingAtr) {
        swingLows.push({
          index: i,
          time: cur.time,
          price: cur.low,
          type: 'LOW',
          isMajor: legAtr >= majorLegAtr,
          legAtr
        });
      }
    }
  }

  return { swingHighs, swingLows };
}

/**
 * Main Entry Point: Evaluates the Order Block Strategy
 */
export function evaluateOrderBlockStrategy(
  candles: Candle[],
  btcCandles: Candle[] = [],
  currentPrice: number,
  settings: AppSettings = {} as AppSettings
): OrderBlockSignal {
  const signalTime = candles && candles.length > 0 ? candles[candles.length - 1].time : Date.now();

  // Basic validation: Closed candles history check
  if (!candles || candles.length < 45) {
    return createRejectedSignal(
      'LONG',
      'NEUTRAL',
      'NEUTRAL',
      'Insufficient closed candle history (< 45 bars)',
      currentPrice,
      signalTime,
      'NO_DISPLACEMENT'
    );
  }

  const atr = calculateAtr(candles, 14);
  const medVol = calculateMedianVolume(candles, 20);
  const er20 = calculateEfficiencyRatio(candles, 20);
  const lastClosedBar = candles[candles.length - 1];
  const effectivePrice = currentPrice || lastClosedBar.close;

  // 1. Regime & Chop Filter (Section 11)
  const chopThreshold = settings.obChopErThreshold ?? 0.30;
  const isChop = er20 < chopThreshold;
  const coinRegime: ObCoinRegime = isChop ? 'CHOPPY' : (lastClosedBar.close > candles[Math.max(0, candles.length - 20)].close ? 'BULLISH' : 'BEARISH');
  const marketRegimeData = classifyObMarketRegime(btcCandles);

  if (isChop) {
    return createRejectedSignal(
      'LONG',
      marketRegimeData.regime,
      coinRegime,
      `Market in compressed rotational chop (ER: ${er20.toFixed(2)} < ${chopThreshold})`,
      effectivePrice,
      signalTime,
      'REGIME_CHOPPY',
      atr,
      er20
    );
  }

  // Thresholds from settings with Spec v2 defaults (Section 14)
  const minRr = settings.obMinRr ?? settings.minRRRatio ?? 3.5;
  const minDispAtr = settings.obMinDisplacementAtr ?? 1.5;
  const strongDispAtr = settings.obStrongDispAtr ?? 2.0;
  const dispBodyRatio = settings.obDispBodyRatio ?? 0.55;
  const relvolSupportive = settings.obRelvolSupportive ?? 1.3;
  const slBufferAtr = settings.obSlBufferAtr ?? 0.15;
  const maxRetestCandles = settings.obMaxRetestCandles ?? 25;
  const maxChasingAtr = settings.obMaxChasingAtr ?? 0.5;
  const liquidityMode = settings.obLiquidityMode ?? 'preferred';
  const minSlAtr = settings.obMinSlAtr ?? 0.6;
  const maxSlAtr = settings.obMaxSlAtr ?? 3.0;
  const maxCostR = settings.obMaxCostR ?? 0.20;
  const blockerZoneR = settings.obBlockerZoneR ?? 2.0;
  const minSwingAtr = settings.obMinSwingAtr ?? 1.0;
  const majorLegAtr = settings.obMajorLegAtr ?? 2.0;
  const targetSearchMaxAtr = settings.obTargetSearchMaxAtr ?? 15.0;
  const maxCluster = settings.obMaxCluster ?? 3;
  const maxWidthAtr = settings.obMaxWidthAtr ?? 1.5;
  const maxAgeBars = settings.obMaxAgeBars ?? 40;
  const maxTouches = settings.obMaxTouches ?? 2;
  const wickTolAtr = settings.obWickTolAtr ?? 0.25;
  const maxBarsInsideZone = settings.obMaxBarsInsideZone ?? 4;
  const reactionWindowBars = settings.obReactionWindowBars ?? 3;

  // Evaluate both directions independently
  const longCandidate = evaluateDirectionalOb(
    'LONG',
    candles,
    atr,
    medVol,
    er20,
    effectivePrice,
    marketRegimeData,
    coinRegime,
    minRr,
    minDispAtr,
    strongDispAtr,
    dispBodyRatio,
    relvolSupportive,
    slBufferAtr,
    maxRetestCandles,
    maxChasingAtr,
    liquidityMode,
    minSlAtr,
    maxSlAtr,
    maxCostR,
    blockerZoneR,
    minSwingAtr,
    majorLegAtr,
    targetSearchMaxAtr,
    maxCluster,
    maxWidthAtr,
    maxAgeBars,
    maxTouches,
    wickTolAtr,
    maxBarsInsideZone,
    reactionWindowBars,
    signalTime
  );

  const shortCandidate = evaluateDirectionalOb(
    'SHORT',
    candles,
    atr,
    medVol,
    er20,
    effectivePrice,
    marketRegimeData,
    coinRegime,
    minRr,
    minDispAtr,
    strongDispAtr,
    dispBodyRatio,
    relvolSupportive,
    slBufferAtr,
    maxRetestCandles,
    maxChasingAtr,
    liquidityMode,
    minSlAtr,
    maxSlAtr,
    maxCostR,
    blockerZoneR,
    minSwingAtr,
    majorLegAtr,
    targetSearchMaxAtr,
    maxCluster,
    maxWidthAtr,
    maxAgeBars,
    maxTouches,
    wickTolAtr,
    maxBarsInsideZone,
    reactionWindowBars,
    signalTime
  );

  // Execution Priority: EXECUTE > WAIT > REJECT
  if (longCandidate.finalDecision === 'EXECUTE') return longCandidate;
  if (shortCandidate.finalDecision === 'EXECUTE') return shortCandidate;

  if (longCandidate.finalDecision === 'WAIT' && shortCandidate.finalDecision !== 'WAIT') return longCandidate;
  if (shortCandidate.finalDecision === 'WAIT' && longCandidate.finalDecision !== 'WAIT') return shortCandidate;
  if (longCandidate.finalDecision === 'WAIT' && shortCandidate.finalDecision === 'WAIT') {
    return longCandidate.score >= shortCandidate.score ? longCandidate : shortCandidate;
  }

  return longCandidate.score >= shortCandidate.score ? longCandidate : shortCandidate;
}

/**
 * Directional Evaluator: Long or Short
 */
function evaluateDirectionalOb(
  direction: ObDirection,
  candles: Candle[],
  atr: number,
  medVol: number,
  efficiencyRatio: number,
  currentPrice: number,
  marketRegimeData: { regime: ObMarketRegime; score: number; reason: string },
  coinRegime: ObCoinRegime,
  minRr: number,
  minDispAtr: number,
  strongDispAtr: number,
  dispBodyRatio: number,
  relvolSupportive: number,
  slBufferAtr: number,
  maxRetestCandles: number,
  maxChasingAtr: number,
  liquidityMode: 'preferred' | 'required' | 'off',
  minSlAtr: number,
  maxSlAtr: number,
  maxCostR: number,
  blockerZoneR: number,
  minSwingAtr: number,
  majorLegAtr: number,
  targetSearchMaxAtr: number,
  maxCluster: number,
  maxWidthAtr: number,
  maxAgeBars: number,
  maxTouches: number,
  wickTolAtr: number,
  maxBarsInsideZone: number,
  reactionWindowBars: number,
  signalTime: number
): OrderBlockSignal {
  const len = candles.length;
  const isLong = direction === 'LONG';

  // 1. Swings & Structure Detection (Section 3)
  const { swingHighs, swingLows } = findSwings(candles, 3, atr, minSwingAtr, majorLegAtr);

  // 2. Scan recent candles for Displacement + BOS + Order Block (Sections 5, 6, 7)
  let candidateSetup: {
    obStartIndex: number;
    obEndIndex: number;
    obZoneHigh: number;
    obZoneLow: number;
    obMid: number;
    usedBodyOnly: boolean;
    obWidthAtr: number;
    dispStartIndex: number;
    dispEndIndex: number;
    dispMoveAtr: number;
    dispVolRatio: number;
    isStrongDisp: boolean;
    hasVolSupport: boolean;
    bosLevel: number;
    bosType: 'BOS' | 'CHOCH';
    bosIndex: number;
    sweepLow?: number;
    sweepHigh?: number;
    sweepDetected: boolean;
    sweepLevelPrice?: number;
  } | null = null;

  // Search backward for qualifying displacement & BOS within last 4 to 35 candles
  for (let i = len - 2; i >= Math.max(10, len - 35); i--) {
    // Impulse can be 1 to 3 consecutive candles
    for (let impulseLen = 1; impulseLen <= 3; impulseLen++) {
      const impulseStart = i;
      const impulseEnd = Math.min(len - 1, i + impulseLen - 1);
      const impulseBars = candles.slice(impulseStart, impulseEnd + 1);

      if (isLong) {
        // Bullish impulse check
        const allBullish = impulseBars.every(b => b.close > b.open);
        if (!allBullish) continue;

        const impulseLow = Math.min(...impulseBars.map(b => b.low));
        const impulseHigh = Math.max(...impulseBars.map(b => b.high));
        const netMove = impulseBars[impulseBars.length - 1].close - impulseBars[0].open;
        const netMoveAtr = atr > 0 ? netMove / atr : 0;
        if (netMoveAtr < minDispAtr) continue;

        // Avg body / range ratio
        const avgBodyRatio = impulseBars.reduce((sum, b) => {
          const r = b.high - b.low;
          return sum + (r > 0 ? (b.close - b.open) / r : 0);
        }, 0) / impulseBars.length;
        if (avgBodyRatio < dispBodyRatio) continue;

        // Relative volume of strongest impulse candle
        const maxVol = Math.max(...impulseBars.map(b => b.volume || 0));
        const relVol = medVol > 0 ? maxVol / medVol : 1.0;

        // BOS check: displacement must produce a closed BOS above meaningful swing high within 6 bars
        const bosWindowEnd = Math.min(len - 1, impulseEnd + 6);
        const priorSwings = swingHighs.filter(s => s.index < impulseStart && s.index >= Math.max(0, impulseStart - 35));
        if (priorSwings.length === 0) continue;

        let confirmedBos: { level: number; index: number; type: 'BOS' | 'CHOCH' } | null = null;
        for (let bIdx = impulseStart; bIdx <= bosWindowEnd; bIdx++) {
          const bar = candles[bIdx];
          const broken = priorSwings.find(s => bar.close >= s.price + (atr * 0.05));
          if (broken) {
            // Determine if CHOCH (first break of prior swing high after sequence of lower highs)
            const isChoch = priorSwings.length >= 2 && broken.price === Math.min(...priorSwings.map(s => s.price));
            confirmedBos = { level: broken.price, index: bIdx, type: isChoch ? 'CHOCH' : 'BOS' };
            break;
          }
        }
        if (!confirmedBos) continue;

        // Identify Bullish OB: last bearish candle or cluster of up to maxCluster candles immediately before impulse
        let obEnd = impulseStart - 1;
        let obStart = obEnd;
        let clusterCount = 0;
        while (obStart >= Math.max(0, impulseStart - maxCluster) && candles[obStart].close <= candles[obStart].open && clusterCount < maxCluster) {
          clusterCount++;
          if (obStart > 0 && candles[obStart - 1].close <= candles[obStart - 1].open && clusterCount < maxCluster) {
            obStart--;
          } else {
            break;
          }
        }
        if (obStart < 0) continue;

        const clusterBars = candles.slice(obStart, obEnd + 1);
        if (clusterBars.length === 0) continue;

        let obHigh = Math.max(...clusterBars.map(b => b.high));
        let obLow = Math.min(...clusterBars.map(b => b.low));
        let usedBodyOnly = false;
        let width = obHigh - obLow;
        let widthAtr = atr > 0 ? width / atr : 1.0;

        // If width > maxWidthAtr (1.5 ATR), use body only
        if (widthAtr > maxWidthAtr) {
          obHigh = Math.max(...clusterBars.map(b => Math.max(b.open, b.close)));
          obLow = Math.min(...clusterBars.map(b => Math.min(b.open, b.close)));
          usedBodyOnly = true;
          width = obHigh - obLow;
          widthAtr = atr > 0 ? width / atr : 1.0;
        }

        if (widthAtr > maxWidthAtr) {
          // Still too wide
          continue;
        }

        // Check Liquidity Sweep (Section 4)
        // Bullish sweep: candle wicks below sell-side level by 0.05-1.5 ATR and closes back above within 3 bars
        // within 12 bars before displacement
        const sweepLookbackStart = Math.max(0, impulseStart - 12);
        let sweepDetected = false;
        let sweepLevelPrice: number | undefined;
        let sweepLow = obLow;

        const priorLows = swingLows.filter(s => s.index < obStart && s.index >= Math.max(0, obStart - 30));
        for (const pl of priorLows) {
          for (let sIdx = sweepLookbackStart; sIdx <= impulseStart; sIdx++) {
            const bar = candles[sIdx];
            const penetration = pl.price - bar.low;
            const penAtr = atr > 0 ? penetration / atr : 0;
            if (penAtr >= 0.05 && penAtr <= 1.5) {
              // Reclaimed within 3 bars
              const reclaimEnd = Math.min(len - 1, sIdx + 3);
              const reclaimed = candles.slice(sIdx, reclaimEnd + 1).some(b => b.close > pl.price);
              if (reclaimed) {
                sweepDetected = true;
                sweepLevelPrice = pl.price;
                sweepLow = Math.min(sweepLow, bar.low);
                break;
              }
            }
          }
          if (sweepDetected) break;
        }

        candidateSetup = {
          obStartIndex: obStart,
          obEndIndex: obEnd,
          obZoneHigh: obHigh,
          obZoneLow: obLow,
          obMid: (obHigh + obLow) / 2,
          usedBodyOnly,
          obWidthAtr: widthAtr,
          dispStartIndex: impulseStart,
          dispEndIndex: impulseEnd,
          dispMoveAtr: netMoveAtr,
          dispVolRatio: relVol,
          isStrongDisp: netMoveAtr >= strongDispAtr,
          hasVolSupport: relVol >= relvolSupportive,
          bosLevel: confirmedBos.level,
          bosType: confirmedBos.type,
          bosIndex: confirmedBos.index,
          sweepLow,
          sweepDetected,
          sweepLevelPrice
        };
        break;
      } else {
        // Bearish impulse check
        const allBearish = impulseBars.every(b => b.close < b.open);
        if (!allBearish) continue;

        const netMove = impulseBars[0].open - impulseBars[impulseBars.length - 1].close;
        const netMoveAtr = atr > 0 ? netMove / atr : 0;
        if (netMoveAtr < minDispAtr) continue;

        const avgBodyRatio = impulseBars.reduce((sum, b) => {
          const r = b.high - b.low;
          return sum + (r > 0 ? (b.open - b.close) / r : 0);
        }, 0) / impulseBars.length;
        if (avgBodyRatio < dispBodyRatio) continue;

        const maxVol = Math.max(...impulseBars.map(b => b.volume || 0));
        const relVol = medVol > 0 ? maxVol / medVol : 1.0;

        const bosWindowEnd = Math.min(len - 1, impulseEnd + 6);
        const priorSwings = swingLows.filter(s => s.index < impulseStart && s.index >= Math.max(0, impulseStart - 35));
        if (priorSwings.length === 0) continue;

        let confirmedBos: { level: number; index: number; type: 'BOS' | 'CHOCH' } | null = null;
        for (let bIdx = impulseStart; bIdx <= bosWindowEnd; bIdx++) {
          const bar = candles[bIdx];
          const broken = priorSwings.find(s => bar.close <= s.price - (atr * 0.05));
          if (broken) {
            const isChoch = priorSwings.length >= 2 && broken.price === Math.max(...priorSwings.map(s => s.price));
            confirmedBos = { level: broken.price, index: bIdx, type: isChoch ? 'CHOCH' : 'BOS' };
            break;
          }
        }
        if (!confirmedBos) continue;

        let obEnd = impulseStart - 1;
        let obStart = obEnd;
        let clusterCount = 0;
        while (obStart >= Math.max(0, impulseStart - maxCluster) && candles[obStart].close >= candles[obStart].open && clusterCount < maxCluster) {
          clusterCount++;
          if (obStart > 0 && candles[obStart - 1].close >= candles[obStart - 1].open && clusterCount < maxCluster) {
            obStart--;
          } else {
            break;
          }
        }
        if (obStart < 0) continue;

        const clusterBars = candles.slice(obStart, obEnd + 1);
        if (clusterBars.length === 0) continue;

        let obHigh = Math.max(...clusterBars.map(b => b.high));
        let obLow = Math.min(...clusterBars.map(b => b.low));
        let usedBodyOnly = false;
        let width = obHigh - obLow;
        let widthAtr = atr > 0 ? width / atr : 1.0;

        if (widthAtr > maxWidthAtr) {
          obHigh = Math.max(...clusterBars.map(b => Math.max(b.open, b.close)));
          obLow = Math.min(...clusterBars.map(b => Math.min(b.open, b.close)));
          usedBodyOnly = true;
          width = obHigh - obLow;
          widthAtr = atr > 0 ? width / atr : 1.0;
        }

        if (widthAtr > maxWidthAtr) continue;

        // Check Liquidity Sweep (Buy-side sweep)
        const sweepLookbackStart = Math.max(0, impulseStart - 12);
        let sweepDetected = false;
        let sweepLevelPrice: number | undefined;
        let sweepHigh = obHigh;

        const priorHighs = swingHighs.filter(s => s.index < obStart && s.index >= Math.max(0, obStart - 30));
        for (const ph of priorHighs) {
          for (let sIdx = sweepLookbackStart; sIdx <= impulseStart; sIdx++) {
            const bar = candles[sIdx];
            const penetration = bar.high - ph.price;
            const penAtr = atr > 0 ? penetration / atr : 0;
            if (penAtr >= 0.05 && penAtr <= 1.5) {
              const reclaimEnd = Math.min(len - 1, sIdx + 3);
              const reclaimed = candles.slice(sIdx, reclaimEnd + 1).some(b => b.close < ph.price);
              if (reclaimed) {
                sweepDetected = true;
                sweepLevelPrice = ph.price;
                sweepHigh = Math.max(sweepHigh, bar.high);
                break;
              }
            }
          }
          if (sweepDetected) break;
        }

        candidateSetup = {
          obStartIndex: obStart,
          obEndIndex: obEnd,
          obZoneHigh: obHigh,
          obZoneLow: obLow,
          obMid: (obHigh + obLow) / 2,
          usedBodyOnly,
          obWidthAtr: widthAtr,
          dispStartIndex: impulseStart,
          dispEndIndex: impulseEnd,
          dispMoveAtr: netMoveAtr,
          dispVolRatio: relVol,
          isStrongDisp: netMoveAtr >= strongDispAtr,
          hasVolSupport: relVol >= relvolSupportive,
          bosLevel: confirmedBos.level,
          bosType: confirmedBos.type,
          bosIndex: confirmedBos.index,
          sweepHigh,
          sweepDetected,
          sweepLevelPrice
        };
        break;
      }
    }
    if (candidateSetup) break;
  }

  // Hard Gate: No structure break / displacement
  if (!candidateSetup) {
    return createRejectedSignal(
      direction,
      marketRegimeData.regime,
      coinRegime,
      `No qualifying ${direction} Order Block displacement + BOS pattern detected`,
      currentPrice,
      signalTime,
      'NO_DISPLACEMENT',
      atr,
      efficiencyRatio
    );
  }

  // Hard Gate: Liquidity Mode check (Section 4)
  if (liquidityMode === 'required' && !candidateSetup.sweepDetected) {
    return createRejectedSignal(
      direction,
      marketRegimeData.regime,
      coinRegime,
      `Liquidity sweep required but no clean reclaim sweep found within lookback`,
      currentPrice,
      signalTime,
      'NO_LIQUIDITY_EVENT',
      atr,
      efficiencyRatio
    );
  }

  // Hard Gate: OB Age Expiry (Section 8)
  const obAgeBars = len - 1 - candidateSetup.bosIndex;
  if (obAgeBars > maxAgeBars) {
    return createRejectedSignal(
      direction,
      marketRegimeData.regime,
      coinRegime,
      `Order block expired: formed ${obAgeBars} bars ago (> max ${maxAgeBars} bars)`,
      currentPrice,
      signalTime,
      'OB_EXPIRED',
      atr,
      efficiencyRatio
    );
  }

  // 3. Freshness, Invalidation, Touches (Section 8)
  let touchCount = 0;
  let barsInsideZone = 0;
  let retestCandleIndex = -1;
  let isInvalidated = false;
  let invalidationReason = '';

  const obHigh = candidateSetup.obZoneHigh;
  const obLow = candidateSetup.obZoneLow;
  const farEdge = isLong ? obLow : obHigh;

  for (let k = candidateSetup.bosIndex + 1; k < len; k++) {
    const bar = candles[k];
    if (isLong) {
      // Invalidation: candle closes beyond far edge or wicks > wickTolAtr
      if (bar.close < farEdge) {
        isInvalidated = true;
        invalidationReason = `Closed below far edge (${bar.close.toFixed(4)} < ${farEdge.toFixed(4)})`;
        break;
      }
      if (bar.low < farEdge - (atr * wickTolAtr)) {
        isInvalidated = true;
        invalidationReason = `Wicked through far edge beyond tolerance (${bar.low.toFixed(4)})`;
        break;
      }
      // Touch check: range enters zone
      if (bar.low <= obHigh && bar.high >= obLow) {
        touchCount++;
        retestCandleIndex = k;
        if (bar.close <= obHigh && bar.close >= obLow) {
          barsInsideZone++;
        }
      }
    } else {
      if (bar.close > farEdge) {
        isInvalidated = true;
        invalidationReason = `Closed above far edge (${bar.close.toFixed(4)} > ${farEdge.toFixed(4)})`;
        break;
      }
      if (bar.high > farEdge + (atr * wickTolAtr)) {
        isInvalidated = true;
        invalidationReason = `Wicked through far edge beyond tolerance (${bar.high.toFixed(4)})`;
        break;
      }
      if (bar.high >= obLow && bar.low <= obHigh) {
        touchCount++;
        retestCandleIndex = k;
        if (bar.close >= obLow && bar.close <= obHigh) {
          barsInsideZone++;
        }
      }
    }
  }

  if (isInvalidated) {
    return createRejectedSignal(
      direction,
      marketRegimeData.regime,
      coinRegime,
      `Order block invalidated: ${invalidationReason}`,
      currentPrice,
      signalTime,
      'OB_INVALIDATED',
      atr,
      efficiencyRatio
    );
  }

  if (touchCount > maxTouches) {
    return createRejectedSignal(
      direction,
      marketRegimeData.regime,
      coinRegime,
      `Order block zone tested ${touchCount} times (max allowed: ${maxTouches}); zone consumed`,
      currentPrice,
      signalTime,
      'OB_ALREADY_TESTED',
      atr,
      efficiencyRatio
    );
  }

  if (barsInsideZone > maxBarsInsideZone) {
    return createRejectedSignal(
      direction,
      marketRegimeData.regime,
      coinRegime,
      `Price spent ${barsInsideZone} bars inside zone without clean reaction`,
      currentPrice,
      signalTime,
      'NO_REACTION',
      atr,
      efficiencyRatio
    );
  }

  // 4. Retest & Reaction (Section 9)
  const isCurrentlyInZone = isLong
    ? currentPrice <= obHigh * 1.002 && currentPrice >= obLow * 0.998
    : currentPrice >= obLow * 0.998 && currentPrice <= obHigh * 1.002;

  // Chase filter: entry price at most maxChasingAtr (0.5 ATR) beyond near edge
  const nearEdge = isLong ? obHigh : obLow;
  const distanceMovedFromZone = isLong
    ? Math.max(0, currentPrice - nearEdge)
    : Math.max(0, nearEdge - currentPrice);

  const distanceMovedAtr = atr > 0 ? distanceMovedFromZone / atr : 0;
  if (distanceMovedAtr > maxChasingAtr) {
    return createRejectedSignal(
      direction,
      marketRegimeData.regime,
      coinRegime,
      `Entry price moved ${distanceMovedAtr.toFixed(2)}x ATR from zone near edge (> max ${maxChasingAtr}x ATR)`,
      currentPrice,
      signalTime,
      'ENTRY_TOO_FAR',
      atr,
      efficiencyRatio
    );
  }

  // If no touch has occurred yet, signal is WAITING for retest
  if (touchCount === 0 && !isCurrentlyInZone) {
    return {
      strategy: 'ORDER_BLOCK',
      direction,
      finalDecision: 'WAIT',
      setupStatus: 'WAITING',
      status: 'WAITING_FOR_RETEST',
      score: 65,
      marketRegime: marketRegimeData.regime,
      coinRegime,
      marketRegimeScore: marketRegimeData.score,
      marketRegimeReason: marketRegimeData.reason,
      coinRegimeReason: `Efficiency Ratio: ${efficiencyRatio.toFixed(2)}`,
      efficiencyRatio,
      liquidityEvent: candidateSetup.sweepDetected ? 'DETECTED' : 'NOT_DETECTED',
      liquidityEventType: candidateSetup.sweepDetected ? (isLong ? 'SELL_SIDE_SWEEP' : 'BUY_SIDE_SWEEP') : undefined,
      liquidityLevelPrice: candidateSetup.sweepLevelPrice,
      sweepExtremePrice: isLong ? candidateSetup.sweepLow : candidateSetup.sweepHigh,
      displacementValid: 'VALID',
      displacementMagnitudeAtr: candidateSetup.dispMoveAtr,
      displacementVolumeRatio: candidateSetup.dispVolRatio,
      structureBreakValid: 'VALID',
      structureBreakType: candidateSetup.bosType,
      structureBreakLevel: candidateSetup.bosLevel,
      obType: isLong ? 'BULLISH' : 'BEARISH',
      obHigh,
      obLow,
      obMidpoint: candidateSetup.obMid,
      obFreshness: 'FRESH',
      obTouchCount: 0,
      obCandleTime: candles[candidateSetup.obStartIndex].time,
      obWidthAtr: candidateSetup.obWidthAtr,
      entryPrice: candidateSetup.obMid,
      stopLossPrice: isLong ? (candidateSetup.sweepLow ?? obLow) - (atr * slBufferAtr) : (candidateSetup.sweepHigh ?? obHigh) + (atr * slBufferAtr),
      slDistancePct: (Math.abs(candidateSetup.obMid - obLow) / candidateSetup.obMid) * 100,
      slDistanceAtr: Math.abs(candidateSetup.obMid - obLow) / (atr || 1),
      targetPrice: isLong ? candidateSetup.obMid + (atr * 5) : candidateSetup.obMid - (atr * 5),
      riskRewardRatio: minRr,
      costRatioR: 0.05,
      logicalSl: isLong ? (candidateSetup.sweepLow ?? obLow) - (atr * slBufferAtr) : (candidateSetup.sweepHigh ?? obHigh) + (atr * slBufferAtr),
      tp1: isLong ? candidateSetup.obMid + (atr * 5) : candidateSetup.obMid - (atr * 5),
      retestConfirmed: false,
      isChasing: false,
      reason: `Waiting for first retest into ${direction} OB zone [${obLow.toFixed(4)} - ${obHigh.toFixed(4)}]`,
      rejectionReason: null,
      exactRejectionReason: null,
      structuredExplanation: `Fresh ${direction} OB created by ${candidateSetup.dispMoveAtr.toFixed(1)}x ATR displacement + ${candidateSetup.bosType}. Awaiting first retest.`,
      explanation: `Waiting for retest into [${obLow.toFixed(4)} - ${obHigh.toFixed(4)}].`,
      sizeMultiplier: 1.0,
      atrValue: atr,
      signalTime,
      timestamp: Date.now()
    };
  }

  // Reaction Window: check the closed candle reaction (within reactionWindowBars)
  let fastReactionType: 'REJECTION_WICK' | 'ENGULFING_RESPONSE' | 'ZONE_HOLD' | 'NONE' = 'NONE';
  const recentBars = candles.slice(-reactionWindowBars);
  for (const bar of recentBars) {
    const range = bar.high - bar.low;
    if (range <= 0) continue;
    if (isLong) {
      const bottomWick = Math.min(bar.open, bar.close) - bar.low;
      if (bar.close > bar.open && bottomWick / range >= 0.30) {
        fastReactionType = 'REJECTION_WICK';
        break;
      } else if (bar.close > bar.open && bar.close > candidateSetup.obMid) {
        fastReactionType = 'ENGULFING_RESPONSE';
        break;
      } else if (bar.close >= candidateSetup.obMid && (bar.close - bar.low) / range >= 0.45) {
        fastReactionType = 'ZONE_HOLD';
        break;
      }
    } else {
      const topWick = bar.high - Math.max(bar.open, bar.close);
      if (bar.close < bar.open && topWick / range >= 0.30) {
        fastReactionType = 'REJECTION_WICK';
        break;
      } else if (bar.close < bar.open && bar.close < candidateSetup.obMid) {
        fastReactionType = 'ENGULFING_RESPONSE';
        break;
      } else if (bar.close <= candidateSetup.obMid && (bar.high - bar.close) / range >= 0.45) {
        fastReactionType = 'ZONE_HOLD';
        break;
      }
    }
  }

  if (fastReactionType === 'NONE') {
    return {
      strategy: 'ORDER_BLOCK',
      direction,
      finalDecision: 'WAIT',
      setupStatus: 'WAITING',
      status: 'WAITING_FOR_PA',
      score: 75,
      marketRegime: marketRegimeData.regime,
      coinRegime,
      marketRegimeScore: marketRegimeData.score,
      marketRegimeReason: marketRegimeData.reason,
      coinRegimeReason: `Efficiency Ratio: ${efficiencyRatio.toFixed(2)}`,
      efficiencyRatio,
      liquidityEvent: candidateSetup.sweepDetected ? 'DETECTED' : 'NOT_DETECTED',
      liquidityEventType: candidateSetup.sweepDetected ? (isLong ? 'SELL_SIDE_SWEEP' : 'BUY_SIDE_SWEEP') : undefined,
      liquidityLevelPrice: candidateSetup.sweepLevelPrice,
      sweepExtremePrice: isLong ? candidateSetup.sweepLow : candidateSetup.sweepHigh,
      displacementValid: 'VALID',
      displacementMagnitudeAtr: candidateSetup.dispMoveAtr,
      displacementVolumeRatio: candidateSetup.dispVolRatio,
      structureBreakValid: 'VALID',
      structureBreakType: candidateSetup.bosType,
      structureBreakLevel: candidateSetup.bosLevel,
      obType: isLong ? 'BULLISH' : 'BEARISH',
      obHigh,
      obLow,
      obMidpoint: candidateSetup.obMid,
      obFreshness: touchCount <= 1 ? 'FRESH' : 'TESTED',
      obTouchCount: touchCount,
      obCandleTime: candles[candidateSetup.obStartIndex].time,
      obWidthAtr: candidateSetup.obWidthAtr,
      entryPrice: currentPrice,
      stopLossPrice: isLong ? (candidateSetup.sweepLow ?? obLow) - (atr * slBufferAtr) : (candidateSetup.sweepHigh ?? obHigh) + (atr * slBufferAtr),
      slDistancePct: (Math.abs(currentPrice - obLow) / currentPrice) * 100,
      slDistanceAtr: Math.abs(currentPrice - obLow) / (atr || 1),
      targetPrice: isLong ? currentPrice + (atr * 5) : currentPrice - (atr * 5),
      riskRewardRatio: minRr,
      costRatioR: 0.05,
      logicalSl: isLong ? (candidateSetup.sweepLow ?? obLow) - (atr * slBufferAtr) : (candidateSetup.sweepHigh ?? obHigh) + (atr * slBufferAtr),
      tp1: isLong ? currentPrice + (atr * 5) : currentPrice - (atr * 5),
      retestConfirmed: touchCount > 0,
      isChasing: false,
      reason: `Price is at ${direction} OB zone. Awaiting reaction candlestick confirmation.`,
      rejectionReason: null,
      exactRejectionReason: null,
      structuredExplanation: `Retest detected. Waiting for reaction candle (rejection wick or zone defense) to confirm entry.`,
      explanation: `Waiting for candlestick confirmation at OB zone.`,
      sizeMultiplier: 1.0,
      atrValue: atr,
      signalTime,
      timestamp: Date.now()
    };
  }

  // 5. Logical Stop Loss (Section 10)
  const entryPrice = currentPrice;
  const slBuffer = Math.max(slBufferAtr * atr, currentPrice * 0.0006);
  const logicalSl = isLong
    ? Math.min(obLow, candidateSetup.sweepLow ?? obLow) - slBuffer
    : Math.max(obHigh, candidateSetup.sweepHigh ?? obHigh) + slBuffer;

  const riskDist = Math.abs(entryPrice - logicalSl);
  const riskDistAtr = atr > 0 ? riskDist / atr : 0;
  const slDistancePct = (riskDist / entryPrice) * 100;

  if (riskDistAtr < minSlAtr) {
    return createRejectedSignal(
      direction,
      marketRegimeData.regime,
      coinRegime,
      `Stop loss too tight (${riskDistAtr.toFixed(2)}x ATR < min ${minSlAtr}x ATR); noise risk`,
      currentPrice,
      signalTime,
      'SL_TOO_TIGHT',
      atr,
      efficiencyRatio
    );
  }

  if (riskDistAtr > maxSlAtr) {
    return createRejectedSignal(
      direction,
      marketRegimeData.regime,
      coinRegime,
      `Stop loss too wide (${riskDistAtr.toFixed(2)}x ATR > max ${maxSlAtr}x ATR); risk unviable`,
      currentPrice,
      signalTime,
      'SL_TOO_WIDE',
      atr,
      efficiencyRatio
    );
  }

  // 6. Cost (Fee) Filter (Section 10)
  // round trip fees (0.08%) + expected slippage (0.05%) + spread (0.03%) = ~0.16%
  const costPct = 0.0016;
  const costR = (costPct * entryPrice) / riskDist;
  if (costR > maxCostR) {
    return createRejectedSignal(
      direction,
      marketRegimeData.regime,
      coinRegime,
      `Fees/slippage eat ${(costR * 100).toFixed(1)}% of risk R (> max ${(maxCostR * 100).toFixed(0)}% R)`,
      currentPrice,
      signalTime,
      'COST_TOO_HIGH',
      atr,
      efficiencyRatio
    );
  }

  // 7. Structural Targets & Blocker Rule (Section 10)
  const candidates = isLong
    ? swingHighs.filter(s => s.price > entryPrice && s.price <= entryPrice + (atr * targetSearchMaxAtr)).sort((a, b) => a.price - b.price)
    : swingLows.filter(s => s.price < entryPrice && s.price >= entryPrice - (atr * targetSearchMaxAtr)).sort((a, b) => b.price - a.price);

  // Blocker Rule: major opposing level between entry and 2.0R
  const blockerBoundary = isLong ? entryPrice + (riskDist * blockerZoneR) : entryPrice - (riskDist * blockerZoneR);
  const majorBlocker = candidates.find(c => c.isMajor && (isLong ? c.price < blockerBoundary : c.price > blockerBoundary));
  if (majorBlocker) {
    return createRejectedSignal(
      direction,
      marketRegimeData.regime,
      coinRegime,
      `Major opposing swing @ ${majorBlocker.price.toFixed(4)} sits inside ${blockerZoneR}R blocker zone`,
      currentPrice,
      signalTime,
      'TP_BLOCKED',
      atr,
      efficiencyRatio
    );
  }

  // Find nearest candidate giving RR >= minRr
  const validTarget = candidates.find(c => {
    const rDist = Math.abs(c.price - entryPrice);
    return rDist / riskDist >= minRr;
  });

  // If no structural target found that meets minRr, check if open space allows minimum RR target
  let finalTpPrice = validTarget ? validTarget.price : 0;
  let finalRr = validTarget ? Math.abs(validTarget.price - entryPrice) / riskDist : 0;

  if (!validTarget) {
    // Open space check: if no opposing major level blocks the minimum target
    const hypotheticalTp = isLong ? entryPrice + (riskDist * minRr) : entryPrice - (riskDist * minRr);
    const hasOpposingLevel = candidates.some(c => isLong ? c.price < hypotheticalTp : c.price > hypotheticalTp);
    if (!hasOpposingLevel && candidates.length === 0) {
      finalTpPrice = hypotheticalTp;
      finalRr = minRr;
    } else {
      return createRejectedSignal(
        direction,
        marketRegimeData.regime,
        coinRegime,
        `No structural target achieves min ${minRr} R:R without obstruction`,
        currentPrice,
        signalTime,
        'RR_BELOW_MIN',
        atr,
        efficiencyRatio
      );
    }
  }

  // 8. Quality Checklist & Sizing (Section 12)
  const qualityChecklist: QualityChecklist = {
    liquiditySweepConfirmed: candidateSetup.sweepDetected,
    strongDisplacement: candidateSetup.isStrongDisp,
    supportiveVolume: candidateSetup.hasVolSupport,
    cleanFirstTouch: touchCount === 1,
    chochStructure: candidateSetup.bosType === 'CHOCH',
    htfAlignment: isLong ? marketRegimeData.regime === 'BULLISH' : marketRegimeData.regime === 'BEARISH',
    highEfficiency: efficiencyRatio >= 0.55,
    totalPassed: 0,
    grade: 'B',
    sizeMultiplier: 0.6
  };

  let passed = 0;
  if (qualityChecklist.liquiditySweepConfirmed) passed++;
  if (qualityChecklist.strongDisplacement) passed++;
  if (qualityChecklist.supportiveVolume) passed++;
  if (qualityChecklist.cleanFirstTouch) passed++;
  if (qualityChecklist.chochStructure) passed++;
  if (qualityChecklist.htfAlignment) passed++;
  if (qualityChecklist.highEfficiency) passed++;

  qualityChecklist.totalPassed = passed;
  if (passed >= 6) {
    qualityChecklist.grade = 'A+';
    qualityChecklist.sizeMultiplier = 1.0;
  } else if (passed >= 4) {
    qualityChecklist.grade = 'A';
    qualityChecklist.sizeMultiplier = 0.85;
  } else if (passed >= 3) {
    qualityChecklist.grade = 'B';
    qualityChecklist.sizeMultiplier = 0.6;
  } else {
    qualityChecklist.grade = 'C';
    qualityChecklist.sizeMultiplier = 0.4;
  }

  const score = Math.min(96, 78 + (passed * 2.5));
  const tp1 = finalTpPrice;
  const tp2 = isLong ? entryPrice + (riskDist * 5.0) : entryPrice - (riskDist * 5.0);
  const tp3 = isLong ? entryPrice + (riskDist * 7.0) : entryPrice - (riskDist * 7.0);

  const structuredExplanation = [
    `ORDER BLOCK ${direction} (Grade ${qualityChecklist.grade} | Size ${qualityChecklist.sizeMultiplier}x):`,
    `• Model: Liquidity Event -> Displacement (${candidateSetup.dispMoveAtr.toFixed(1)}x ATR) -> ${candidateSetup.bosType} -> Retest (${fastReactionType})`,
    `• Zone: [${obLow.toFixed(4)} - ${obHigh.toFixed(4)}] (${candidateSetup.obWidthAtr.toFixed(2)}x ATR ${candidateSetup.usedBodyOnly ? 'body' : 'range'})`,
    `• Quality Factors (${passed}/7):`,
    `  - Sweep: ${qualityChecklist.liquiditySweepConfirmed ? '✓ Confirmed' : '✗ None'}`,
    `  - Strong Displacement: ${qualityChecklist.strongDisplacement ? '✓ (>=2.0 ATR)' : '○ Standard (>=1.5 ATR)'}`,
    `  - Volume Support: ${qualityChecklist.supportiveVolume ? '✓ (>=1.3x)' : '○ Standard'}`,
    `  - Clean 1st Touch: ${qualityChecklist.cleanFirstTouch ? '✓ First touch' : '○ 2nd touch'}`,
    `  - CHOCH Break: ${qualityChecklist.chochStructure ? '✓ CHOCH' : '○ Trend BOS'}`,
    `  - HTF Alignment: ${qualityChecklist.htfAlignment ? '✓ Aligned' : '○ Neutral'}`,
    `  - Efficiency Ratio: ${efficiencyRatio.toFixed(2)} (${qualityChecklist.highEfficiency ? '✓ Clean trend' : '○ Moderate'})`,
    `• Entry: ${entryPrice.toFixed(4)} | Logical SL: ${logicalSl.toFixed(4)} (${slDistancePct.toFixed(2)}%, ${riskDistAtr.toFixed(2)}x ATR)`,
    `• Target: ${tp1.toFixed(4)} | R:R: 1:${finalRr.toFixed(2)} (>= 1:${minRr} min) | Cost: ${(costR * 100).toFixed(1)}% R`
  ].join('\n');

  return {
    strategy: 'ORDER_BLOCK',
    direction,
    finalDecision: 'EXECUTE',
    setupStatus: 'VALID',
    status: 'TRIGGERED',
    score,
    marketRegime: marketRegimeData.regime,
    coinRegime,
    marketRegimeScore: marketRegimeData.score,
    marketRegimeReason: marketRegimeData.reason,
    coinRegimeReason: `Efficiency Ratio: ${efficiencyRatio.toFixed(2)}`,
    efficiencyRatio,
    liquidityEvent: candidateSetup.sweepDetected ? 'DETECTED' : 'NOT_DETECTED',
    liquidityEventType: candidateSetup.sweepDetected ? (isLong ? 'SELL_SIDE_SWEEP' : 'BUY_SIDE_SWEEP') : undefined,
    liquidityLevelPrice: candidateSetup.sweepLevelPrice,
    sweepExtremePrice: isLong ? candidateSetup.sweepLow : candidateSetup.sweepHigh,
    displacementValid: 'VALID',
    displacementMagnitudeAtr: candidateSetup.dispMoveAtr,
    displacementVolumeRatio: candidateSetup.dispVolRatio,
    structureBreakValid: 'VALID',
    structureBreakType: candidateSetup.bosType,
    structureBreakLevel: candidateSetup.bosLevel,
    obType: isLong ? 'BULLISH' : 'BEARISH',
    obHigh,
    obLow,
    obMidpoint: candidateSetup.obMid,
    obFreshness: touchCount <= 1 ? 'FRESH' : 'TESTED',
    obTouchCount: touchCount,
    obCandleTime: candles[candidateSetup.obStartIndex].time,
    obWidthAtr: candidateSetup.obWidthAtr,
    entryPrice,
    stopLossPrice: logicalSl,
    slDistancePct,
    slDistanceAtr: riskDistAtr,
    targetPrice: tp1,
    riskRewardRatio: finalRr,
    costRatioR: costR,
    logicalSl,
    tp1,
    tp2,
    tp3,
    retestConfirmed: true,
    retestPrice: entryPrice,
    fastReactionType,
    isChasing: false,
    reason: `Order Block ${direction} — Displacement ${candidateSetup.dispMoveAtr.toFixed(1)}x ATR + ${candidateSetup.bosType} + Retest (1:${finalRr.toFixed(1)} R:R, Grade ${qualityChecklist.grade})`,
    rejectionReason: null,
    exactRejectionReason: null,
    structuredExplanation,
    explanation: `Confirmed ${direction} Order Block entry on retest reaction. SL: ${logicalSl.toFixed(4)}, TP: ${tp1.toFixed(4)} (1:${finalRr.toFixed(2)} R:R).`,
    qualityChecklist,
    sizeMultiplier: qualityChecklist.sizeMultiplier,
    atrValue: atr,
    signalTime,
    timestamp: Date.now(),
    opposingLiquidityPrice: tp1
  };
}

/**
 * Builds an exact Rejected Signal with standardized reason code
 */
function createRejectedSignal(
  direction: ObDirection,
  marketRegime: ObMarketRegime,
  coinRegime: ObCoinRegime,
  detailedReason: string,
  currentPrice: number,
  signalTime: number,
  exactReason: ObRejectionReason = 'NO_DISPLACEMENT',
  atr: number = 0,
  efficiencyRatio: number = 0.5
): OrderBlockSignal {
  return {
    strategy: 'ORDER_BLOCK',
    direction,
    finalDecision: 'REJECT',
    setupStatus: 'INVALID',
    status: 'REJECTED',
    score: 0,
    marketRegime,
    coinRegime,
    marketRegimeScore: 0,
    marketRegimeReason: detailedReason,
    coinRegimeReason: detailedReason,
    efficiencyRatio,
    liquidityEvent: 'NOT_DETECTED',
    displacementValid: 'INVALID',
    displacementMagnitudeAtr: 0,
    displacementVolumeRatio: 0,
    structureBreakValid: 'INVALID',
    obType: direction === 'LONG' ? 'BULLISH' : 'BEARISH',
    obHigh: currentPrice,
    obLow: currentPrice,
    obMidpoint: currentPrice,
    obFreshness: 'INVALIDATED',
    obTouchCount: 0,
    obWidthAtr: 0,
    entryPrice: currentPrice,
    stopLossPrice: currentPrice,
    slDistancePct: 0,
    slDistanceAtr: 0,
    targetPrice: currentPrice,
    riskRewardRatio: 0,
    costRatioR: 0,
    logicalSl: currentPrice,
    tp1: currentPrice,
    retestConfirmed: false,
    isChasing: false,
    reason: `REJECTED: ${exactReason}`,
    rejectionReason: detailedReason,
    exactRejectionReason: exactReason,
    structuredExplanation: `REJECTED: ${exactReason}\nReason: ${detailedReason}`,
    explanation: `REJECTED: ${exactReason} — ${detailedReason}`,
    sizeMultiplier: 0,
    atrValue: atr,
    signalTime,
    timestamp: Date.now()
  };
}

/**
 * Pine Script v6 Generator for TradingView Backtesting & Webhooks (Spec v2)
 */
export function generateOrderBlockPineScript(settings: AppSettings): string {
  const minRr = settings.obMinRr || 3.5;
  const minDispAtr = settings.obMinDisplacementAtr || 1.5;
  const slBufferAtr = settings.obSlBufferAtr || 0.15;
  const maxChasingAtr = settings.obMaxChasingAtr || 0.5;

  return `//@version=6
strategy("Autonomous Order Block Spec v2 (1:3.5+ RR)", overlay=true, initial_capital=10000, default_qty_type=strategy.percent_of_equity, default_qty_value=15, commission_type=strategy.commission.percent, commission_value=0.04)

// --- Inputs (Spec v2) ---
minRr = input.float(${minRr}, "Minimum Risk/Reward", minval=3.0, step=0.1)
minDispAtr = input.float(${minDispAtr}, "Min Displacement ATR", minval=1.0, step=0.1)
slBufferAtr = input.float(${slBufferAtr}, "SL Buffer ATR", minval=0.05, step=0.05)
maxChasingAtr = input.float(${maxChasingAtr}, "Max Chasing ATR", minval=0.2, step=0.1)
swingLookback = input.int(3, "Swing Pivot Lookback (Closed Bars)", minval=2, maxval=10)

// --- Indicators ---
atr14 = ta.atr(14)
medVol = ta.median(volume, 20)

// Kaufman Efficiency Ratio (20 bars)
netChg = math.abs(close - close[20])
sumChg = math.sum(math.abs(close - close[1]), 20)
er20 = sumChg > 0 ? (netChg / sumChg) : 0.5
isChop = er20 < 0.30

// --- Swings Detection (Closed Bars Only) ---
swingHigh = ta.pivothigh(high, swingLookback, swingLookback)
swingLow = ta.pivotlow(low, swingLookback, swingLookback)

var float lastSh = na
var float lastSl = na
if not na(swingHigh)
    lastSh := swingHigh
if not na(swingLow)
    lastSl := swingLow

// --- Displacement & BOS (Closed Bars Only) ---
dispBull = close > open and (close - open) >= (atr14 * minDispAtr) and not isChop
dispBear = close < open and (open - close) >= (atr14 * minDispAtr) and not isChop

var float obBullHigh = na
var float obBullLow = na
var float obBullSl = na
var float obBullTp = na
var bool obBullActive = false

var float obBearHigh = na
var float obBearLow = na
var float obBearSl = na
var float obBearTp = na
var bool obBearActive = false

// Bullish OB: Last bearish candle before bullish displacement + confirmed BOS above swing high
if dispBull and not na(lastSh) and close > lastSh and close[1] < open[1]
    obBullHigh := math.max(open[1], close[1])
    obBullLow := low[1]
    obBullSl := low[1] - (atr14 * slBufferAtr)
    risk = close - obBullSl
    target = not na(lastSh) and (lastSh - close) >= risk * minRr ? lastSh : close + (risk * minRr)
    if (target - close) / risk >= minRr and (close - obBullHigh) <= (atr14 * maxChasingAtr)
        obBullTp := target
        obBullActive := true

// Bearish OB: Last bullish candle before bearish displacement + confirmed BOS below swing low
if dispBear and not na(lastSl) and close < lastSl and close[1] > open[1]
    obBearHigh := high[1]
    obBearLow := math.min(open[1], close[1])
    obBearSl := high[1] + (atr14 * slBufferAtr)
    risk = obBearSl - close
    target = not na(lastSl) and (close - lastSl) >= risk * minRr ? lastSl : close - (risk * minRr)
    if (close - target) / risk >= minRr and (obBearLow - close) <= (atr14 * maxChasingAtr)
        obBearTp := target
        obBearActive := true

// --- Execution on Retest Reaction ---
longRetest = obBullActive and low <= obBullHigh and close >= obBullLow and close > open and strategy.position_size == 0
if longRetest
    strategy.entry("Long OB", strategy.long)
    strategy.exit("Exit Long", "Long OB", stop=obBullSl, limit=obBullTp)
    obBullActive := false

shortRetest = obBearActive and high >= obBearLow and close <= obBearHigh and close < open and strategy.position_size == 0
if shortRetest
    strategy.entry("Short OB", strategy.short)
    strategy.exit("Exit Short", "Short OB", stop=obBearSl, limit=obBearTp)
    obBearActive := false

// Invalidation: Price closes beyond far edge
if obBullActive and close < obBullLow
    obBullActive := false
if obBearActive and close > obBearHigh
    obBearActive := false

// --- Visual Plots ---
plot(obBullHigh, "Bullish OB High", color=color.new(color.teal, 30), style=plot.style_linebr)
plot(obBullLow, "Bullish OB Low", color=color.new(color.teal, 60), style=plot.style_linebr)
plot(obBearHigh, "Bearish OB High", color=color.new(color.maroon, 30), style=plot.style_linebr)
plot(obBearLow, "Bearish OB Low", color=color.new(color.maroon, 60), style=plot.style_linebr)
`;
}
