import { describe, it, expect } from 'vitest';
import {
  PARAMS,
  DEFAULTS,
  PRESETS,
  applyPreset,
  validate,
  feeShareOfStopDistance,
  calcBlendedNetR
} from '../../src/utils/strategies/rangeRegime.config';
import {
  evaluateRangeRegime,
  generateRangeRegimePineScript,
  Candle
} from '../../src/utils/strategies/rangeRegimeStrategy';

describe('RANGE_REGIME_V1 Config & Validation', () => {
  it('should have valid default configuration passing validate()', () => {
    const errors = validate(DEFAULTS);
    expect(errors).toEqual([]);
  });

  it('should apply strict, balanced, and loose presets cleanly', () => {
    const strict = applyPreset('strict');
    expect(validate(strict)).toEqual([]);
    expect(strict.regimeMinScore).toBe(70);
    expect(strict.minEdgeTouches).toBe(3);

    const loose = applyPreset('loose');
    expect(validate(loose)).toEqual([]);
    expect(loose.regimeMinScore).toBe(50);
    expect(loose.adxSoftMax).toBe(25);

    const balanced = applyPreset('balanced');
    expect(validate(balanced)).toEqual([]);
  });

  it('should catch invalid relationships in validate()', () => {
    // 1. directionTF / executionTF ratio < 3
    const badTf = { ...DEFAULTS, directionTF: '5m', executionTF: '5m' };
    expect(validate(badTf)).toContain('directionTF should be at least 3x executionTF');

    // 2. adxSoftMax >= adxHardMax
    const badAdx = { ...DEFAULTS, adxSoftMax: 35, adxHardMax: 30 };
    expect(validate(badAdx)).toContain('adxSoftMax must be below adxHardMax');

    // 3. tp1MinR >= tp2MinR
    const badTp = { ...DEFAULTS, tp1MinR: 2.5, tp2MinR: 2.0 };
    expect(validate(badTp)).toContain('tp1MinR must be below tp2MinR');

    // 4. minConfluence > gradeAMin
    const badConf = { ...DEFAULTS, minConfluence: 5, gradeAMin: 3 };
    expect(validate(badConf)).toContain('minConfluence cannot exceed gradeAMin');

    // 5. rsiOversold >= rsiOverbought
    const badRsi = { ...DEFAULTS, rsiOversold: 70, rsiOverbought: 65 };
    expect(validate(badRsi)).toContain('rsiOversold must be below rsiOverbought');

    // 6. minRangeAtr >= maxRangeAtr
    const badRange = { ...DEFAULTS, minRangeAtr: 10, maxRangeAtr: 5 };
    expect(validate(badRange)).toContain('minRangeAtr must be below maxRangeAtr');
  });

  it('should correctly calculate fee share of R', () => {
    const feePct = 0.118; // 0.118%
    const entry = 100;
    const sl = 99; // 1% stop distance
    const feeRatio = feeShareOfStopDistance(feePct, entry, sl);
    expect(feeRatio).toBeCloseTo(0.118, 3); // 11.8% of 1R

    const blended = calcBlendedNetR(1.0, 2.0, 50, feePct, 1.0);
    // Gross blended = 0.5 * 1.0 + 0.5 * 2.0 = 1.5R. Fee in R = 0.118R -> Net = 1.382R
    expect(blended).toBeCloseTo(1.382, 2);
  });
});

describe('RANGE_REGIME_V1 Strategy Engine', () => {
  const generateRangeCandles = (count: number, basePrice: number, rangeSpan: number): Candle[] => {
    const candles: Candle[] = [];
    const now = Date.now();
    for (let i = 0; i < count; i++) {
      const angle = (i / 10) * Math.PI;
      const mid = basePrice + Math.sin(angle) * (rangeSpan * 0.4);
      const high = mid + rangeSpan * 0.2;
      const low = mid - rangeSpan * 0.2;
      const open = mid - rangeSpan * 0.05;
      const close = mid + rangeSpan * 0.05;
      candles.push({
        time: now - (count - i) * 60000 * 5,
        open,
        high,
        low,
        close,
        volume: 1000 + Math.random() * 500
      });
    }
    return candles;
  };

  it('should reject with insufficient history', () => {
    const res = evaluateRangeRegime('BTCUSDT', [], []);
    expect(res.finalDecision).toBe('REJECT');
    expect(res.rejectCode).toBe('REGIME_SCORE_LOW');
  });

  it('should evaluate simulated range candles and produce structured signals', () => {
    const dirCandles = generateRangeCandles(100, 100, 4); // 4% range
    const execCandles = generateRangeCandles(100, 100, 4);

    const res = evaluateRangeRegime('TESTUSDT', dirCandles, execCandles);
    expect(res).toBeDefined();
    expect(res.symbol).toBe('TESTUSDT');
    expect(['EXECUTE', 'REJECT']).toContain(res.finalDecision);
  });

  it('should generate valid Pine Script v6', () => {
    const script = generateRangeRegimePineScript(DEFAULTS);
    expect(script).toContain('//@version=6');
    expect(script).toContain('Range Regime V1 — Institutional Fades');
    expect(script).toContain('strategy.entry("Long Fade"');
    expect(script).toContain('strategy.entry("Short Fade"');
  });
});
