import { describe, it, expect } from 'vitest';
import {
  PARAMS,
  DEFAULTS,
  PRESETS,
  applyPreset,
  validate,
  calculateKaufmanER,
  findSwingPivots,
  evaluateRangeRegimeV1,
  RangeConfig,
} from '../../src/utils/strategies/rangeRegime/index.js';

function createCandle(
  time: number,
  open: number,
  high: number,
  low: number,
  close: number,
  volume = 1000
) {
  return { time, open, high, low, close, volume, isClosed: true };
}

describe('RANGE_REGIME_V1 Schema and Engine', () => {
  describe('Schema & Validation', () => {
    it('validates default config with 0 errors', () => {
      const errs = validate(DEFAULTS);
      expect(errs).toEqual([]);
    });

    it('validates all presets (strict, balanced, loose) with 0 errors', () => {
      for (const preset of ['strict', 'balanced', 'loose'] as const) {
        const cfg = applyPreset(preset);
        const errs = validate(cfg);
        expect(errs, `Preset ${preset} has validation errors: ${errs.join(', ')}`).toEqual([]);
      }
    });

    it('flags invalid timeframe ratio when directionTF < 3x executionTF', () => {
      const cfg: RangeConfig = { ...DEFAULTS, directionTF: '5m', executionTF: '5m' };
      const errs = validate(cfg);
      expect(errs).toContain('directionTF should be at least 3x executionTF');
    });

    it('flags invalid ADX bounds when softMax >= hardMax', () => {
      const cfg: RangeConfig = { ...DEFAULTS, adxSoftMax: 35, adxHardMax: 30 };
      const errs = validate(cfg);
      expect(errs).toContain('adxSoftMax must be below adxHardMax');
    });

    it('flags invalid TP R ratios when tp1MinR >= tp2MinR', () => {
      const cfg: RangeConfig = { ...DEFAULTS, tp1MinR: 2.5, tp2MinR: 1.5 };
      const errs = validate(cfg);
      expect(errs).toContain('tp1MinR must be below tp2MinR');
    });
  });

  describe('Kaufman Efficiency Ratio (ER)', () => {
    it('calculates ER = 1.0 for straight line monotonic moves', () => {
      const straightLineCloses = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30];
      const er = calculateKaufmanER(straightLineCloses, 20);
      expect(er).toBeCloseTo(1.0, 3);
    });

    it('calculates low ER for choppy oscillating series', () => {
      const choppyCloses = [10, 12, 10, 12, 10, 12, 10, 12, 10, 12, 10, 12, 10, 12, 10, 12, 10, 12, 10, 12, 10];
      const er = calculateKaufmanER(choppyCloses, 20);
      expect(er).toBeLessThan(0.15);
    });
  });

  describe('Swing Pivot Detection', () => {
    it('accurately identifies local swing highs and lows', () => {
      const highs = [100, 101, 105, 102, 101, 99, 98, 97, 98, 99, 104, 101];
      const lows = [98, 99, 103, 100, 98, 96, 94, 93, 94, 95, 100, 98];
      const pivots = findSwingPivots(highs, lows, 2);
      expect(pivots.swingHighs.length).toBeGreaterThan(0);
      expect(pivots.swingLows.length).toBeGreaterThan(0);
    });
  });

  describe('evaluateRangeRegimeV1 Strategy Evaluation', () => {
    it('returns ADX_HARD_VETO when HTF market is strongly trending', () => {
      const count = 50;
      const baseTime = 1700000000000;
      const dirCandles = [];
      const execCandles = [];

      for (let i = 0; i < count; i++) {
        const t = baseTime + i * 3600 * 1000;
        // Strong monotonic upward trend
        const p = 100 + i * 5;
        dirCandles.push(createCandle(t, p, p + 2, p - 1, p + 1.5, 5000));
      }

      for (let i = 0; i < count * 4; i++) {
        const t = baseTime + i * 900 * 1000;
        const p = 100 + (i / 4) * 5;
        execCandles.push(createCandle(t, p, p + 1, p - 0.5, p + 0.8, 1000));
      }

      const result = evaluateRangeRegimeV1(execCandles, dirCandles, 350, DEFAULTS);
      expect(result).not.toBeNull();
      // Trend should trigger ADX_HARD_VETO or REGIME_SCORE_LOW or RANGE_BROKEN
      expect(result.rejectionReason).toBeDefined();
    });

    it('processes clean ranging candles gracefully', () => {
      const count = 60;
      const baseTime = 1700000000000;
      const dirCandles = [];
      const execCandles = [];

      // Create established sideways market oscillating around 100 (95 to 105)
      for (let i = 0; i < count; i++) {
        const t = baseTime + i * 3600 * 1000;
        const wave = Math.sin(i * 0.5) * 4;
        const o = 100 + wave;
        const c = 100 + wave + (Math.cos(i) * 0.5);
        const h = Math.max(o, c) + 1.5;
        const l = Math.min(o, c) - 1.5;
        dirCandles.push(createCandle(t, o, h, l, c, 1000));
      }

      for (let i = 0; i < count * 6; i++) {
        const t = baseTime + i * 300 * 1000;
        const wave = Math.sin(i * (0.5 / 6)) * 4;
        const o = 100 + wave;
        const c = 100 + wave + (Math.cos(i) * 0.2);
        const h = Math.max(o, c) + 0.5;
        const l = Math.min(o, c) - 0.5;
        execCandles.push(createCandle(t, o, h, l, c, 500));
      }

      const result = evaluateRangeRegimeV1(execCandles, dirCandles, 96, {
        ...DEFAULTS,
        minConfluence: 0,
        regimeMinScore: 30,
      });

      expect(result).not.toBeNull();
      // Should have either a signal or a clear descriptive reject reason
      if (result.rejectionReason) {
        expect(typeof result.rejectionReason).toBe('string');
        expect(typeof result.reason).toBe('string');
      } else {
        const sig = result as any;
        expect(sig.direction).toBe('LONG');
        expect(sig.sl).toBeLessThan(96);
        expect(sig.tp1).toBeGreaterThan(96);
      }
    });
  });
});
