import { describe, it, expect } from 'vitest';
import {
  Candle,
  calculateATR,
  calculateMedian,
  detectStrictCoil,
  evaluateBreakoutQuality,
  evaluateRetest,
  findStructuralTarget,
  formatCoilSignalOutput,
  evaluateTwoSidedCoilBreakout
} from '../../src/utils/strategies/twoSidedCoilBreakout';

function makeCandle(
  time: number,
  open: number,
  high: number,
  low: number,
  close: number,
  volume: number = 1000
): Candle {
  return { time, open, high, low, close, volume };
}

describe('Two-Sided Coil Breakout Strategy Engine', () => {

  describe('calculateATR & calculateMedian utilities', () => {
    it('calculates Wilder ATR accurately', () => {
      const candles: Candle[] = [];
      for (let i = 0; i < 30; i++) {
        candles.push(makeCandle(i * 900, 100, 105, 95, 102, 1000));
      }
      const atr = calculateATR(candles, 14);
      expect(atr.length).toBe(30);
      expect(atr[atr.length - 1]).toBeCloseTo(10, 1);
    });

    it('calculates median of odd and even arrays', () => {
      expect(calculateMedian([5, 1, 3])).toBe(3);
      expect(calculateMedian([10, 20, 30, 40])).toBe(25);
      expect(calculateMedian([])).toBe(0);
    });
  });

  describe('detectStrictCoil - Strict Consolidation & Compression', () => {
    it('identifies a tight coil meeting all compression rules (5-20 bars, height <= 1.25 ATR, median range < 0.70 ATR)', () => {
      const candles: Candle[] = [];
      const baseTime = 1700000000;
      
      // Warmup 25 bars with normal volatility (ATR ~ 4.0)
      for (let i = 0; i < 25; i++) {
        candles.push(makeCandle(baseTime + i * 900, 100, 104, 96, 101, 2000));
      }

      // 10-bar coil with tight consolidation around 100 (height = 3.0, <= 1.25 * ATR)
      for (let i = 25; i < 35; i++) {
        candles.push(makeCandle(baseTime + i * 900, 99.5, 101.5, 98.5, 100.5, 800));
      }

      const atr = calculateATR(candles, 14);
      const coil = detectStrictCoil(candles, 34, atr);

      expect(coil).not.toBeNull();
      expect(coil!.isCoil).toBe(true);
      expect(coil!.coilLength).toBeGreaterThanOrEqual(5);
      expect(coil!.coilLength).toBeLessThanOrEqual(20);
      expect(coil!.coilHigh).toBeLessThanOrEqual(101.5);
      expect(coil!.coilLow).toBeGreaterThanOrEqual(98.5);
      expect(coil!.coilHeight).toBeLessThanOrEqual(3.0);
      expect(coil!.structureValid).toBe(true);
      expect(coil!.bodiesInsideRatio).toBeGreaterThanOrEqual(0.70);
    });

    it('rejects coil if height exceeds 1.25x ATR', () => {
      const candles: Candle[] = [];
      const baseTime = 1700000000;
      for (let i = 0; i < 25; i++) {
        candles.push(makeCandle(baseTime + i * 900, 100, 102, 98, 100, 2000)); // ATR ~ 4
      }
      // Coil height = 10 (exceeds 1.25 * 4 = 5.0)
      for (let i = 25; i < 35; i++) {
        candles.push(makeCandle(baseTime + i * 900, 100, 105, 95, 101, 800));
      }

      const atr = calculateATR(candles, 14);
      const coil = detectStrictCoil(candles, 34, atr);
      expect(coil).toBeNull();
    });

    it('rejects coil if any candle range exceeds 1.5x ATR (structure invalid)', () => {
      const candles: Candle[] = [];
      const baseTime = 1700000000;
      for (let i = 0; i < 25; i++) {
        candles.push(makeCandle(baseTime + i * 900, 100, 102, 98, 100, 2000)); // ATR ~ 4
      }
      // 9 tight candles + 1 huge spike (range = 8 > 1.5 * 4 = 6)
      for (let i = 25; i < 34; i++) {
        candles.push(makeCandle(baseTime + i * 900, 99.5, 101, 99, 100, 800));
      }
      candles.push(makeCandle(baseTime + 34 * 900, 99, 106, 98, 105, 1000));

      const atr = calculateATR(candles, 14);
      const coil = detectStrictCoil(candles, 34, atr);
      expect(coil).toBeNull();
    });

    it('rejects coil if candidate length is outside [5, 20] candles', () => {
      const candles: Candle[] = [];
      const baseTime = 1700000000;
      // Only 3 candles
      for (let i = 0; i < 3; i++) {
        candles.push(makeCandle(baseTime + i * 900, 100, 102, 98, 100, 2000));
      }
      const atr = calculateATR(candles, 14);
      const tooShort = detectStrictCoil(candles, 2, atr);
      expect(tooShort).toBeNull();
    });
  });

  describe('evaluateBreakoutQuality - Displacement & Volume Confirmation', () => {
    it('confirms strong bullish breakout with expanded body, range, and volume >= 1.25x mean', () => {
      const coil: any = {
        isCoil: true,
        coilHigh: 100,
        coilLow: 95,
        medianCandleBody: 1.0,
        medianCandleRange: 2.0,
        meanCoilVolume: 1000,
        atrAtCoil: 3.0
      };

      // Bullish breakout candle: Close above coilHigh (103), body 2.5 (>= 1.2*1), range 4 (>= 1.25*2), vol 1800 (>= 1.25*1000)
      const breakoutCandle = makeCandle(1700010000, 100.5, 103.5, 99.5, 103.0, 1800);
      const result = evaluateBreakoutQuality(breakoutCandle, 35, coil);

      expect(result.isBreakout).toBe(true);
      expect(result.direction).toBe('LONG');
      expect(result.isValidQuality).toBe(true);
      expect(result.bodyRatio).toBeGreaterThanOrEqual(1.2);
      expect(result.volumeRatio).toBeGreaterThanOrEqual(1.25);
    });

    it('confirms strong bearish breakdown with expanded body, range, and volume', () => {
      const coil: any = {
        isCoil: true,
        coilHigh: 100,
        coilLow: 95,
        medianCandleBody: 1.0,
        medianCandleRange: 2.0,
        meanCoilVolume: 1000,
        atrAtCoil: 3.0
      };

      // Bearish breakdown candle: Close below coilLow (92.5), body 2.5, range 4.5, vol 2000
      const breakdownCandle = makeCandle(1700010000, 95.0, 95.5, 91.0, 92.5, 2000);
      const result = evaluateBreakoutQuality(breakdownCandle, 35, coil);

      expect(result.isBreakout).toBe(true);
      expect(result.direction).toBe('SHORT');
      expect(result.isValidQuality).toBe(true);
    });

    it('rejects breakout lacking volume expansion (< 1.25x mean volume)', () => {
      const coil: any = {
        isCoil: true,
        coilHigh: 100,
        coilLow: 95,
        medianCandleBody: 1.0,
        medianCandleRange: 2.0,
        meanCoilVolume: 1000,
        atrAtCoil: 3.0
      };

      // Volume is only 900 (< 1250)
      const weakVolCandle = makeCandle(1700010000, 100.5, 103.5, 99.5, 103.0, 900);
      const result = evaluateBreakoutQuality(weakVolCandle, 35, coil);

      expect(result.isValidQuality).toBe(false);
      expect(result.rejectionReason).toContain('volume expansion');
    });
  });

  describe('evaluateRetest - Retest of Broken Coil Boundary', () => {
    it('detects a held bullish retest with boundary touch and bounce', () => {
      const coil: any = { coilHigh: 100, coilLow: 95, atrAtCoil: 2.0 };
      const candles: Candle[] = [
        makeCandle(1000, 99, 104, 99, 103, 2000), // Breakout bar (index 0)
        makeCandle(2000, 103, 103.5, 99.8, 102.5, 1200) // Retest bar (index 1): touches 99.8 (~ coilHigh 100), closes at 102.5
      ];

      const retest = evaluateRetest(candles, 0, coil, 'LONG', 2.0);
      expect(retest.hasRetest).toBe(true);
      expect(retest.retestHeld).toBe(true);
      expect(retest.isInvalidated).toBe(false);
      expect(retest.status).toBe('RETEST_HELD');
    });

    it('flags invalidation when retest deeply penetrates and closes past opposite coil boundary', () => {
      const coil: any = { coilHigh: 100, coilLow: 95, atrAtCoil: 2.0 };
      const candles: Candle[] = [
        makeCandle(1000, 99, 104, 99, 103, 2000), // Breakout bar (index 0)
        makeCandle(2000, 103, 103, 93, 94, 2500)   // Failed retest (index 1): collapses through coilLow (95) and closes at 94
      ];

      const retest = evaluateRetest(candles, 0, coil, 'LONG', 2.0);
      expect(retest.isInvalidated).toBe(true);
      expect(retest.retestHeld).toBe(false);
      expect(retest.status).toBe('INVALIDATED');
    });
  });

  describe('findStructuralTarget & 1:5 Structural Reward-to-Risk Rule', () => {
    it('finds genuine prior swing high resistance preceding the coil for LONG target', () => {
      const candles: Candle[] = [];
      const baseTime = 1700000000;
      
      // Index 10: Swing high pivot at 135
      for (let i = 0; i < 40; i++) {
        if (i === 10) {
          candles.push(makeCandle(baseTime + i * 900, 120, 135, 118, 130, 2000));
        } else {
          candles.push(makeCandle(baseTime + i * 900, 105, 112, 100, 108, 1000));
        }
      }

      // Coil starts at index 25, entry at 105
      const target = findStructuralTarget(candles, 'LONG', 105, 25);
      expect(target).toBe(135);
    });

    it('strictly REJECTS trade if prior structural liquidity does not yield at least 1:5 R:R', () => {
      const candles: Candle[] = [];
      const baseTime = 1700000000;

      // Prior resistance at only 106 (index 10)
      for (let i = 0; i < 25; i++) {
        if (i === 10) {
          candles.push(makeCandle(baseTime + i * 900, 102, 106, 100, 103, 1500));
        } else {
          candles.push(makeCandle(baseTime + i * 900, 100, 102, 98, 100, 800));
        }
      }

      // 10-bar coil from index 25 to 34 (range [99, 101], ATR ~ 2.0)
      for (let i = 25; i < 35; i++) {
        candles.push(makeCandle(baseTime + i * 900, 99.5, 101, 99, 100.5, 500));
      }

      // Breakout bar at index 35: Closes at 103 (> 101), vol 2500 (> 1.25 * 500)
      // Stop is at 99 - 0.3 = 98.7 -> Risk = 103 - 98.7 = 4.3
      // Prior structural resistance is only at 106 -> Reward = 106 - 103 = 3.0 -> R:R = 3.0 / 4.3 = 0.70 (< 5.0)
      candles.push(makeCandle(baseTime + 35 * 900, 100.5, 103.5, 100.0, 103.0, 2500));

      const signal = evaluateTwoSidedCoilBreakout(
        candles,
        [],
        { minRrRatio: 5.0, aggressiveBreakoutMode: true }
      );

      // Must be rejected because authentic structure doesn't offer 1:5
      expect(signal).not.toBeNull();
      expect(signal!.status).toContain('REJECTED');
      expect(signal!.formattedOutput).toContain('Status: REJECTED');
      expect(signal!.formattedOutput).toContain('1:5');
    });
  });

  describe('Full End-to-End Two-Sided Coil Breakout with Dynamic User Timeframe', () => {
    it('evaluates and executes a qualifying 1:5 LONG coil breakout on user-specified timeframe', () => {
      const candles: Candle[] = [];
      const baseTime = 1700000000;

      // 1. Prior structural high at 145 (bars 5-15)
      for (let i = 0; i < 20; i++) {
        if (i === 10) {
          candles.push(makeCandle(baseTime + i * 900, 120, 145, 118, 140, 2000));
        } else {
          candles.push(makeCandle(baseTime + i * 900, 105, 110, 102, 106, 1000));
        }
      }

      // 2. Coil compression from bar 20 to 29 (range [100, 103], ATR ~ 3.0)
      for (let i = 20; i < 30; i++) {
        candles.push(makeCandle(baseTime + i * 900, 101, 103, 100, 102, 600));
      }

      // 3. Breakout bar at bar 30: Closes at 105.5 (> coilHigh 103), range = 5.5 (>= 1.25 * 3), vol 2500 (> 1.25 * 600)
      // Stop is at coilLow (100) - buffer (0.45) = 99.55 -> Risk = 105.5 - 99.55 = 5.95
      // Prior target = 145 -> Reward = 145 - 105.5 = 39.5 -> R:R = 39.5 / 5.95 = 6.63 (> 5.0)
      candles.push(makeCandle(baseTime + 30 * 900, 101.5, 106.5, 101.0, 105.5, 2500));

      const signal = evaluateTwoSidedCoilBreakout(
        candles,
        [],
        {
          symbol: 'ETHUSDT',
          timeframe: '5m', // User's custom timeframe
          minRrRatio: 5.0,
          aggressiveBreakoutMode: true
        }
      );

      expect(signal).not.toBeNull();
      expect(signal!.symbol).toBe('ETHUSDT');
      expect(signal!.timeframe).toBe('5m');
      expect(signal!.side).toBe('LONG');
      expect(signal!.setup).toBe('Coil breakout');
      expect(signal!.status).toContain('VALID');
      expect(signal!.rrRatio).toBeGreaterThanOrEqual(5.0);
      expect(signal!.target).toBe(145);
      expect(signal!.formattedOutput).toContain('Signal: ETHUSDT');
      expect(signal!.formattedOutput).toContain('Timeframe: 5m');
      expect(signal!.formattedOutput).toContain('R:R: 1:');
    });

    it('outputs WATCHLIST status when a coil is detected but no breakout candle has occurred yet', () => {
      const candles: Candle[] = [];
      const baseTime = 1700000000;

      // Warmup
      for (let i = 0; i < 20; i++) {
        candles.push(makeCandle(baseTime + i * 900, 100, 104, 96, 100, 1500));
      }

      // Tight coil still in progress (range [99, 101])
      for (let i = 20; i < 30; i++) {
        candles.push(makeCandle(baseTime + i * 900, 99.5, 101, 99, 100.5, 500));
      }

      const signal = evaluateTwoSidedCoilBreakout(
        candles,
        [],
        { symbol: 'SOLUSDT', timeframe: '1H' }
      );

      expect(signal).not.toBeNull();
      expect(signal!.status).toContain('WATCHLIST');
      expect(signal!.formattedOutput).toContain('WATCHLIST — coil detected; no confirmed breakout.');
    });
  });

  describe('Signal Output Format', () => {
    it('formats exact output matching the user requested template', () => {
      const output = formatCoilSignalOutput({
        symbol: 'BTCUSDT',
        setup: 'Long coil breakout',
        side: 'LONG',
        timeframe: '15m',
        coilRange: { low: 95000, high: 96000 },
        entry: 96200,
        stop: 94800,
        target: 103200,
        risk: 1400,
        reward: 7000,
        rrRatio: 5.0,
        marketFilter: 'BTC neutral-to-bullish',
        coinFilter: 'Relative strength confirmed',
        status: 'VALID / WAITING FOR RETEST'
      });

      expect(output).toContain('Signal: BTCUSDT');
      expect(output).toContain('Setup: Long coil breakout');
      expect(output).toContain('Timeframe: 15m');
      expect(output).toContain('Coil: 95000.00 - 96000.00');
      expect(output).toContain('Entry: 96200.00');
      expect(output).toContain('Stop: 94800.00');
      expect(output).toContain('Target: 103200.00');
      expect(output).toContain('Risk: 1400.00');
      expect(output).toContain('Reward: 7000.00');
      expect(output).toContain('R:R: 1:5');
      expect(output).toContain('Market filter: BTC neutral-to-bullish');
      expect(output).toContain('Coin filter: Relative strength confirmed');
      expect(output).toContain('Status: VALID / WAITING FOR RETEST');
    });
  });
});

