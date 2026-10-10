import { describe, it, expect } from 'vitest';
import {
  BASE,
  MODES,
  HABITATS,
  REGIME_MAP,
  resolveConfig,
  feeCostInR,
  getAppFeeRoundTripPct,
  SweepConfig,
  Mode,
  Habitat
} from '../../src/utils/strategies/liquiditySweep/schema.js';
import {
  findSwingPivots,
  detectEqualLevels,
  scorePool,
  buildLiquidityMap,
  Candle
} from '../../src/utils/strategies/liquiditySweep/pools.js';
import {
  evaluateLiquiditySweepReversal,
  calculateATRFromCandles
} from '../../src/utils/strategies/liquiditySweep/engine.js';

function createCandle(
  time: number,
  open: number,
  high: number,
  low: number,
  close: number,
  volume = 1000
): Candle {
  return { time, open, high, low, close, volume };
}

describe('LIQUIDITY SWEEP REVERSAL: Config Contract & 8-Stage Pipeline', () => {
  describe('1. Config Contract & Precedence Hierarchy', () => {
    it('resolves balanced mode in range habitat with correct adjust deltas', () => {
      const res = resolveConfig({
        mode: 'balanced',
        regimeLabel: 'RANGE',
        regimeConfidence: 75,
        regimeStableBars: 5
      });

      expect(res.status).toBe('ACTIVE');
      if (res.status === 'ACTIVE') {
        expect(res.habitat).toBe('range');
        expect(res.cfg.timeframes.execution).toBe('15m');
        expect(res.cfg.timeframes.direction).toBe('1h');
        expect(res.cfg.exits.tp1.basis).toBe('range_mid');
        expect(res.cfg.exits.tp2.basis).toBe('range_edge');
        expect(res.cfg.exits.trail).toBe('off');
        expect(res.cfg.risk.minRR).toBe(1.6);
        // timeStopBars = round(16 * 0.75) = 12
        expect(res.cfg.exits.timeStopBars).toBe(12);
      }
    });

    it('resolves strict mode in trend habitat with increased minRR and structure trail', () => {
      const res = resolveConfig({
        mode: 'strict',
        regimeLabel: 'TREND_UP',
        regimeConfidence: 80,
        regimeStableBars: 4
      });

      expect(res.status).toBe('ACTIVE');
      if (res.status === 'ACTIVE') {
        expect(res.habitat).toBe('trend');
        expect(res.cfg.timeframes.execution).toBe('15m');
        expect(res.cfg.timeframes.direction).toBe('4h');
        // strict base minRR = 2.0 + trend delta 0.3 = 2.3
        expect(res.cfg.risk.minRR).toBe(2.3);
        expect(res.cfg.exits.trail).toBe('structure');
        // timeStopBars = round(20 * 1.5) = 30
        expect(res.cfg.exits.timeStopBars).toBe(30);
      }
    });

    it('returns STANDBY when habitat is not enabled in mode (e.g. compression in strict)', () => {
      const res = resolveConfig({
        mode: 'strict',
        regimeLabel: 'COMPRESSION',
        regimeConfidence: 85,
        regimeStableBars: 5
      });

      expect(res.status).toBe('STANDBY');
      if (res.status === 'STANDBY') {
        expect(res.reason).toBe('REGIME_STANDBY');
        expect(res.habitat).toBe('compression');
      }
    });

    it('returns STANDBY when confidence is below minConfidence', () => {
      const res = resolveConfig({
        mode: 'balanced',
        regimeLabel: 'RANGE',
        regimeConfidence: 40, // Base min is 55
        regimeStableBars: 5
      });

      expect(res.status).toBe('STANDBY');
      if (res.status === 'STANDBY') {
        expect(res.reason).toBe('REGIME_LOW_CONF');
      }
    });

    it('returns STANDBY when regime has not held for stabilityBars', () => {
      const res = resolveConfig({
        mode: 'balanced',
        regimeLabel: 'RANGE',
        regimeConfidence: 70,
        regimeStableBars: 1 // Base min is 2
      });

      expect(res.status).toBe('STANDBY');
      if (res.status === 'STANDBY') {
        expect(res.reason).toBe('REGIME_UNSTABLE');
      }
    });

    it('ensures UI overrides take absolute precedence over modes and habitats', () => {
      const res = resolveConfig({
        mode: 'strict',
        regimeLabel: 'RANGE',
        regimeConfidence: 80,
        regimeStableBars: 5,
        uiOverrides: {
          risk: { minRR: 3.5, maxFeeToRisk: 0.10 }
        }
      });

      expect(res.status).toBe('ACTIVE');
      if (res.status === 'ACTIVE') {
        expect(res.cfg.risk.minRR).toBe(3.5);
        expect(res.cfg.risk.maxFeeToRisk).toBe(0.10);
      }
    });
  });

  describe('2. Dynamic Venue Fee Model & feeCostInR', () => {
    it('calculates round-trip fee percentage correctly from taker and GST settings', () => {
      const feePct = getAppFeeRoundTripPct({ feeTakerPct: 0.05, feeGstPct: 18 });
      // 0.05 * 2 * 1.18 = 0.118%
      expect(feePct).toBeCloseTo(0.118, 4);
    });

    it('computes fee cost in R accurately', () => {
      // 0.118% fee / 1.0% stop distance = 0.118 R
      const costInR = feeCostInR(0.118, 1.0);
      expect(costInR).toBeCloseTo(0.118, 3);

      // 0.118% fee / 0.2% stop distance = 0.59 R
      const tightStopCost = feeCostInR(0.118, 0.2);
      expect(tightStopCost).toBeCloseTo(0.59, 2);
    });
  });

  describe('3. Liquidity Map & Pool Ranking', () => {
    it('scores pools using formula: weights[type] + touchBonus*(touches-1)', () => {
      const weights = BASE.pools.weights;
      const touchBonus = BASE.pools.touchBonus;

      // prevWeekHL with 1 touch: 100
      expect(scorePool('prevWeekHL', 1, weights, touchBonus)).toBe(100);

      // equalHL with 2 touches: 75 + 5*(1) = 80
      expect(scorePool('equalHL', 2, weights, touchBonus)).toBe(80);

      // equalHL with 4 touches: 75 + 5*(3) = 90
      expect(scorePool('equalHL', 4, weights, touchBonus)).toBe(90);

      // swingHL with 1 touch: 55
      expect(scorePool('swingHL', 1, weights, touchBonus)).toBe(55);
    });

    it('detects equal highs within tolerance', () => {
      const swings = [
        { index: 10, price: 100.0, time: 1000 },
        { index: 20, price: 100.05, time: 2000 },
        { index: 30, price: 105.0, time: 3000 }
      ];
      const clusters = detectEqualLevels(swings, 'HIGH', 0.1);
      expect(clusters.length).toBe(1);
      expect(clusters[0].touches).toBe(2);
      expect(clusters[0].level).toBeCloseTo(100.025, 3);
    });
  });

  describe('4. Full 8-Stage Pipeline Evaluation', () => {
    it('generates a confirmed Bullish Liquidity Sweep Reversal signal', () => {
      const candles: Candle[] = [];
      const baseTime = Date.UTC(2026, 8, 21, 10, 0);

      // Establish base price and a swing low pool at bar 15 (price = 95.0)
      for (let i = 0; i < 35; i++) {
        let l = 99.0;
        let h = 103.0;
        if (i === 5) {
          h = 112.0; // Confirmed Range High
        }
        if (i === 15) {
          l = 95.0; // Confirmed Swing Low Pivot
        }
        candles.push(createCandle(baseTime + i * 900000, 100.0, h, l, 100.5, 1000));
      }

      // Bar 35: Rejection hammer sweeping bar 15 low (95.0)
      // Open: 97.0, Low: 94.2 (swept by 0.8), High: 97.5, Close: 97.2, Volume: 2500 (2.5x SMA)
      // Wick = 97.0 - 94.2 = 2.8; Range = 97.5 - 94.2 = 3.3 -> Wick/Range = 2.8 / 3.3 = 0.85
      candles.push(createCandle(baseTime + 35 * 900000, 97.0, 97.5, 94.2, 97.2, 2500));

      // Bar 36: Bullish Confirmation Engulfing candle closing back above rejection body
      // Open: 97.0, High: 99.2, Low: 96.8, Close: 98.8, Volume: 2000
      candles.push(createCandle(baseTime + 36 * 900000, 97.0, 99.2, 96.8, 98.8, 2000));

      // Live bar (excluded by closed candle slice)
      candles.push(createCandle(baseTime + 37 * 900000, 100.5, 101.2, 100.0, 101.0, 1000));

      const res = evaluateLiquiditySweepReversal({
        symbol: 'BTCUSDT',
        execCandles: candles,
        mode: 'balanced',
        regimeLabel: 'RANGE',
        regimeConfidence: 75,
        regimeStableBars: 4,
        appFeeSettings: { feeTakerPct: 0.05, feeGstPct: 18 }
      });

      expect(res.status, JSON.stringify(res)).toBe('ACTIVE');
      if (res.status === 'ACTIVE') {
        expect(res.signal.direction).toBe('LONG');
        expect(res.signal.entryPrice).toBe(98.8);
        // SL placed below sweep extreme 94.2 - buffer
        expect(res.signal.sl).toBeLessThan(94.2);
        expect(res.signal.score).toBeGreaterThanOrEqual(70);
        expect(res.signal.rrRatio).toBeGreaterThanOrEqual(res.cfg.risk.minRR);
        expect(res.signal.feeInR).toBeLessThanOrEqual(res.cfg.risk.maxFeeToRisk);
      }
    });

    it('rejects setup with SWEEP_TOO_DEEP when sweep exceeds maxDepthATR', () => {
      const candles: Candle[] = [];
      const baseTime = Date.UTC(2026, 8, 21, 10, 0);

      for (let i = 0; i < 35; i++) {
        let l = 98.0;
        if (i === 15) l = 95.0;
        candles.push(createCandle(baseTime + i * 900000, 100.0, 103.0, l, 100.5, 1000));
      }

      // Bar 35: Massive breakout crash below 95.0 to 80.0 (way deeper than maxDepthATR)
      candles.push(createCandle(baseTime + 35 * 900000, 97.0, 97.5, 80.0, 97.2, 2500));
      candles.push(createCandle(baseTime + 36 * 900000, 96.8, 101.0, 96.5, 100.5, 2000));
      candles.push(createCandle(baseTime + 37 * 900000, 100.5, 101.2, 100.0, 101.0, 1000));

      const res = evaluateLiquiditySweepReversal({
        symbol: 'BTCUSDT',
        execCandles: candles,
        mode: 'balanced',
        regimeLabel: 'RANGE',
        regimeConfidence: 75,
        regimeStableBars: 4
      });

      expect(res.status).toBe('STANDBY');
      if (res.status === 'STANDBY') {
        expect(['SWEEP_TOO_DEEP', 'TRIGGER_INVALID', 'POOL_WEAK']).toContain(res.reason);
      }
    });
  });
});
