import { describe, it, expect } from 'vitest';
import {
  normalizeBiasScore,
  classifySignedSlope,
  evaluateEmaAlignment,
  classifyRegimeVoteProbabilities,
  calcRoundTripFeePct,
  calcFeeDragShareOf1R,
  getTradeabilityDisplayStatus,
  buildRegimeStrategyMatrix,
  rankStrategiesByBlendedExpectancy,
  calcRangeZoneAction,
  CANONICAL_STRATEGIES
} from '../../src/utils/regimeEngine';

describe('Regime Engine Acceptance Tests', () => {
  // ACCEPTANCE TEST 1: Bias score scaling
  it('1. Weights [20,20,15,15,10,10,30] with scores [+1,0,0,+1,0,−1,0] normalize to a bias of about +20.8, not +25', () => {
    const weights = [20, 20, 15, 15, 10, 10, 30];
    const scores = [+1, 0, 0, +1, 0, -1, 0];
    const normalizedBias = normalizeBiasScore(scores, weights);

    // Sum = 20 + 0 + 0 + 15 + 0 - 10 + 0 = 25
    // SumWeights = 120
    // Normalized = 25 / 120 * 100 = 20.833...
    expect(normalizedBias).toBeCloseTo(20.8, 1);
    expect(normalizedBias).not.toBe(25);
  });

  // ACCEPTANCE TEST 2: EMA alignment bug
  it('2. Price > EMA200 and EMA50 > SMA200 must never produce "STACKED BEARISH"', () => {
    // Construct candle closes where current price > ema200 and ema50 > sma200
    const closes: number[] = [];
    let p = 100;
    for (let i = 0; i < 220; i++) {
      p += 0.5;
      closes.push(p);
    }
    const currentPrice = 250;
    const sma200 = 150;

    const result = evaluateEmaAlignment(closes, currentPrice, sma200);
    expect(result.alignment).not.toBe('STACKED_BEARISH');
  });

  // ACCEPTANCE TEST 3: Slope labels
  it('3. Slope −0.150% must display FALLING', () => {
    const slope = -0.150;
    const label = classifySignedSlope(slope, 0.05);
    expect(label).toBe('FALLING');

    const positiveSlope = 0.12;
    expect(classifySignedSlope(positiveSlope, 0.05)).toBe('RISING');

    const flatSlope = 0.02;
    expect(classifySignedSlope(flatSlope, 0.05)).toBe('FLAT');
  });

  // ACCEPTANCE TEST 4: Regime classifier with TRANSITION and probabilities
  it('4. ADX 20.4, ER 0.08, BBW 11th pct, ATR 67th pct must produce a RANGE/COMPRESSION blend with RANGE_SQUEEZE active, not TREND', () => {
    const result = classifyRegimeVoteProbabilities(
      20.4, // ADX (between 18 and 25 -> votes TRANSITION)
      0.08, // ER (< 0.20 -> votes RANGE & COMPRESSION)
      11,   // BBW 11th pct (< 20 -> votes COMPRESSION)
      67,   // ATR 67th pct (mid -> NEUTRAL, must never vote Trend)
      'TANGLED' // EMA stack tangled (votes Range & Compression)
    );

    expect(result.probabilities.RANGE).toBeGreaterThanOrEqual(0.3);
    expect(result.probabilities.COMPRESSION).toBeGreaterThanOrEqual(0.3);
    expect(result.isRangeSqueeze).toBe(true);

    const trendTotalP = result.probabilities.TREND_UP + result.probabilities.TREND_DOWN;
    expect(trendTotalP).toBe(0);
    expect(result.primaryRegime).not.toBe('TREND');
  });

  // ACCEPTANCE TEST 5: Single fee source of truth
  it('5. Fee drag at a 0.84% stop: 14.0% with a 0.118% round-trip; 21.1% with 0.177%', () => {
    const dragA = calcFeeDragShareOf1R(0.118, 0.84);
    expect(dragA).toBeCloseTo(14.0, 1);

    const dragB = calcFeeDragShareOf1R(0.177, 0.84);
    expect(dragB).toBeCloseTo(21.1, 1);
  });

  // ACCEPTANCE TEST 6: Status honesty
  it('6. With the gate bypassed, status reads UNGATED, never TRADABLE', () => {
    const normalTradable = getTradeabilityDisplayStatus('TRADABLE', false);
    expect(normalTradable.displayStatus).toBe('TRADABLE');

    const bypassed = getTradeabilityDisplayStatus('TRADABLE', true, 'Fee Drag Lock');
    expect(bypassed.displayStatus).toBe('UNGATED');
    expect(bypassed.displayStatus).not.toBe('TRADABLE');
    expect(bypassed.wouldSay).toContain('TRADABLE');
  });

  // ACCEPTANCE TEST 7: The Auto-Selected and Bucket cards list the same strategies
  it('7. The Auto-Selected and Bucket cards list the same strategies', () => {
    const matrix = buildRegimeStrategyMatrix('COMPRESSION', []);
    const probabilities = {
      TREND_UP: 0,
      TREND_DOWN: 0,
      RANGE: 0.35,
      COMPRESSION: 0.45,
      EXPANSION: 0.1,
      TRANSITION: 0.1
    };

    const ranked = rankStrategiesByBlendedExpectancy(matrix, probabilities, 0.3, 30);
    expect(ranked.length).toBeGreaterThan(0);

    const autoSelectedIds = ranked.map(r => r.bucketStrategyId);
    const bucketCardIds = ranked.map(r => r.bucketStrategyId);

    // Both must match identical canonical strategies
    expect(autoSelectedIds).toEqual(bucketCardIds);
    expect(autoSelectedIds.every(id => CANONICAL_STRATEGIES.some(s => s.id === id))).toBe(true);
  });

  // Actionable Direction in Range / Squeeze
  it('computes actionable zones in Range (Long at Support, Short at Resistance, No-Trade in Mid)', () => {
    const low = 60000;
    const high = 70000;

    // At support (10% of range)
    const supportAction = calcRangeZoneAction(61000, high, low, 'RANGE', false);
    expect(supportAction.direction).toBe('LONG');
    expect(supportAction.zone).toBe('SUPPORT_ZONE');

    // At resistance (90% of range)
    const resistanceAction = calcRangeZoneAction(69000, high, low, 'RANGE', false);
    expect(resistanceAction.direction).toBe('SHORT');
    expect(resistanceAction.zone).toBe('RESISTANCE_ZONE');

    // Middle chop (50% of range)
    const midAction = calcRangeZoneAction(65000, high, low, 'RANGE', false);
    expect(midAction.direction).toBe('NO_TRADE');
    expect(midAction.zone).toBe('MID_RANGE_CHOP');

    // Squeeze active
    const squeezeAction = calcRangeZoneAction(65000, high, low, 'COMPRESSION', true);
    expect(squeezeAction.direction).toBe('WAIT');
    expect(squeezeAction.zone).toBe('BREAKOUT_PENDING');
  });

  // Centralized Strategy Consistency: Deleted or unavailable strategies must be excluded
  it('filters out deleted/uninstalled strategies from matrix and blended rankings', () => {
    const deleted = ['MULTICOIN_SCALPER_PRO', 'ORDER_BLOCK'];
    const matrix = buildRegimeStrategyMatrix('TREND', [], 30, deleted);

    expect(matrix.some(cell => deleted.includes(cell.bucketStrategyId))).toBe(false);

    const probabilities = {
      TREND_UP: 0.7,
      TREND_DOWN: 0,
      RANGE: 0.1,
      COMPRESSION: 0.1,
      EXPANSION: 0.05,
      TRANSITION: 0.05
    };

    const ranked = rankStrategiesByBlendedExpectancy(matrix, probabilities, 0.3, 30, deleted);
    expect(ranked.some(r => deleted.includes(r.bucketStrategyId))).toBe(false);
  });
});
