import { describe, it, expect } from 'vitest';
import {
  evaluateSmc,
  findPivots,
  detectHtfRegime,
  detectLiquiditySweep,
  detectMssDisplacement,
  detectFvg,
  detectOrderBlock,
  checkConfluence,
  isInKillZone,
  calculateSmcLevels,
  generateSmcWebhookPayload,
  Candle,
  FvgZone,
  OrderBlockZone
} from '../../src/utils/strategies/smcLiquidity';

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

describe('SMC High-Probability Auto-Trading Strategy', () => {
  describe('1. Pivot Points & HTF Regime Filter', () => {
    it('detects confirmed pivot highs and lows with N-bar window', () => {
      const candles: Candle[] = [];
      const baseTime = 1700000000000;
      for (let i = 0; i < 30; i++) {
        let h = 100;
        let l = 95;
        if (i === 10) {
          h = 110; // Pivot High
          l = 98;
        } else if (i === 20) {
          h = 98;
          l = 85; // Pivot Low
        }
        candles.push(createCandle(baseTime + i * 3600000, 97, h, l, 98, 1000));
      }

      const { highs, lows } = findPivots(candles, 5, 5);
      expect(highs.length).toBeGreaterThanOrEqual(1);
      expect(lows.length).toBeGreaterThanOrEqual(1);
      expect(highs[0].price).toBe(110);
      expect(lows[0].price).toBe(85);
    });

    it('classifies HTF regime as BULLISH on confirmed HH + HL', () => {
      const candles: Candle[] = [];
      const baseTime = 1700000000000;
      for (let i = 0; i < 50; i++) {
        const trend = i * 2;
        let h = 100 + trend;
        let l = 90 + trend;
        if (i === 15) h = 145; // Pivot High 1
        if (i === 25) l = 125; // Pivot Low 1
        if (i === 35) h = 175; // Pivot High 2 (HH)
        if (i === 42) l = 150; // Pivot Low 2 (HL)
        candles.push(createCandle(baseTime + i * 3600000, 95 + trend, h, l, 96 + trend, 1000));
      }

      const regimeResult = detectHtfRegime(candles, 5);
      expect(regimeResult.regime).toBe('BULLISH');
    });

    it('classifies HTF regime as BEARISH on confirmed LH + LL', () => {
      const candles: Candle[] = [];
      const baseTime = 1700000000000;
      for (let i = 0; i < 50; i++) {
        const trend = (50 - i) * 2;
        let h = 100 + trend;
        let l = 90 + trend;
        if (i === 15) h = 200; // Pivot High 1
        if (i === 25) l = 170; // Pivot Low 1
        if (i === 35) h = 160; // Pivot High 2 (LH)
        if (i === 42) l = 130; // Pivot Low 2 (LL)
        candles.push(createCandle(baseTime + i * 3600000, 95 + trend, h, l, 94 + trend, 1000));
      }

      const regimeResult = detectHtfRegime(candles, 5);
      expect(regimeResult.regime).toBe('BEARISH');
    });
  });

  describe('2. Liquidity Sweep Detection', () => {
    it('detects a valid Bullish liquidity sweep with material wick and close-back', () => {
      const liqLow = 100.0;
      // Candle sweeps below 100 to 98.5 (1.5% extension >= 0.15%), lower wick is 1.6, body is 0.5 (ratio > 0.6), closes at 100.5 > liqLow
      const sweepCandle = createCandle(1700000000000, 100.1, 101.0, 98.5, 100.5, 2000);

      const result = detectLiquiditySweep(sweepCandle, 10, undefined, liqLow, {
        wickRatio: 0.6,
        minSweepWickPct: 0.0015
      });

      expect(result.isSweep).toBe(true);
      expect(result.direction).toBe('LONG');
      expect(result.sweepPrice).toBe(98.5);
      expect(result.sweptLevel).toBe(liqLow);
      expect(result.wickRatio).toBeGreaterThanOrEqual(0.6);
    });

    it('detects a valid Bearish liquidity sweep with material wick and close-back', () => {
      const liqHigh = 200.0;
      // Candle sweeps above 200 to 203.0 (1.5% extension >= 0.15%), upper wick is 3.1, body is 0.8, closes at 199.1 < liqHigh
      const sweepCandle = createCandle(1700000000000, 198.5, 203.0, 197.5, 199.1, 2000);

      const result = detectLiquiditySweep(sweepCandle, 12, liqHigh, undefined, {
        wickRatio: 0.6,
        minSweepWickPct: 0.0015
      });

      expect(result.isSweep).toBe(true);
      expect(result.direction).toBe('SHORT');
      expect(result.sweepPrice).toBe(203.0);
      expect(result.sweptLevel).toBe(liqHigh);
    });

    it('rejects a fake sweep if candle fails to close back inside the level', () => {
      const liqLow = 100.0;
      // Candle breaks below 100 and closes at 98.0 (outside prior level)
      const breakoutCandle = createCandle(1700000000000, 99.5, 100.2, 97.0, 98.0, 3000);

      const result = detectLiquiditySweep(breakoutCandle, 10, undefined, liqLow);
      expect(result.isSweep).toBe(false);
    });

    it('rejects a sweep if wick-to-body ratio is too small', () => {
      const liqLow = 100.0;
      // Candle penetrates to 99.8 (tiny wick 0.05, body 2.0)
      const stubbyCandle = createCandle(1700000000000, 102.0, 103.0, 99.8, 100.1, 1000);

      const result = detectLiquiditySweep(stubbyCandle, 10, undefined, liqLow, { wickRatio: 0.6 });
      expect(result.isSweep).toBe(false);
    });
  });

  describe('3. Market Structure Shift (MSS) with Displacement', () => {
    it('detects a Bullish MSS with displacement and volume confirmation', () => {
      const candles: Candle[] = [];
      const baseTime = 1700000000000;
      // 10 bars before sweep: structHigh = 105.0
      for (let i = 0; i < 15; i++) {
        candles.push(createCandle(baseTime + i * 900000, 100, i === 5 ? 105.0 : 103, 98, 101, 1000));
      }
      const sweepIndex = 11;
      // At index 14, strong displacement candle closes at 108.0 (displacement = 3.0 >= 0.5 * ATR 2.0) with 2500 volume
      candles.push(createCandle(baseTime + 15 * 900000, 103, 108.5, 102.5, 108.0, 2500));

      const result = detectMssDisplacement(candles, candles.length - 1, sweepIndex, 'LONG', 2.0, {
        structureLen: 10,
        dispAtrMult: 0.5,
        sweepConfirmWindow: 10,
        volMult: 1.5
      });

      expect(result.hasMss).toBe(true);
      expect(result.direction).toBe('LONG');
      expect(result.brokenLevel).toBe(105.0);
      expect(result.displacementAtr).toBeGreaterThanOrEqual(0.5);
    });

    it('rejects MSS if confirmation window has expired', () => {
      const candles: Candle[] = [];
      const baseTime = 1700000000000;
      for (let i = 0; i < 25; i++) {
        candles.push(createCandle(baseTime + i * 900000, 100, 104, 98, 101, 1000));
      }
      const sweepIndex = 2; // 22 bars ago (> max 10)
      candles.push(createCandle(baseTime + 25 * 900000, 103, 110, 102, 109, 3000));

      const result = detectMssDisplacement(candles, candles.length - 1, sweepIndex, 'LONG', 2.0, {
        sweepConfirmWindow: 10
      });

      expect(result.hasMss).toBe(false);
    });
  });

  describe('4. Fair Value Gap (FVG) & Order Block (OB)', () => {
    it('detects a Bullish 3-candle FVG', () => {
      // Candle 0: high = 100
      // Candle 1: large impulsive candle 101 -> 108
      // Candle 2: low = 104 -> gap between candle 0 high (100) and candle 2 low (104)
      const candles = [
        createCandle(1000, 98, 100, 97, 99),
        createCandle(2000, 99, 108, 99, 107),
        createCandle(3000, 106, 110, 104, 109)
      ];

      const fvg = detectFvg(candles, 2, 'LONG', 5);
      expect(fvg).not.toBeNull();
      expect(fvg!.top).toBe(104);
      expect(fvg!.bottom).toBe(100);
      expect(fvg!.midpoint).toBe(102); // Consequent encroachment
    });

    it('detects an Order Block in the displacement leg', () => {
      const candles = [
        createCandle(1000, 99, 100, 98.5, 99.5), // base
        createCandle(2000, 99.5, 106, 99.5, 105.5), // strong up body (105.5 - 99.5 = 6.0 >= 0.75 * ATR 2.0)
        createCandle(3000, 105.5, 109, 105, 108.5)
      ];

      const ob = detectOrderBlock(candles, 0, 2, 'LONG', 2.0);
      expect(ob).not.toBeNull();
      expect(ob!.bottom).toBe(99.5);
      expect(ob!.top).toBe(105.5);
    });

    it('validates confluence when FVG and OB overlap', () => {
      const fvg: FvgZone = { top: 104, bottom: 100, midpoint: 102, candleIndex: 2, direction: 'LONG' };
      const overlappingOb: OrderBlockZone = { top: 103, bottom: 99, midpoint: 101, candleIndex: 1, direction: 'LONG' };
      const nonOverlappingOb: OrderBlockZone = { top: 98, bottom: 95, midpoint: 96.5, candleIndex: 1, direction: 'LONG' };

      expect(checkConfluence(fvg, overlappingOb)).toBe(true);
      expect(checkConfluence(fvg, nonOverlappingOb)).toBe(false);
    });
  });

  describe('5. Kill Zone Filter & Risk Management Levels', () => {
    it('correctly identifies London and NY kill zones', () => {
      // 08:30 UTC -> London kill zone (07:00 - 10:00)
      const londonTime = Date.UTC(2026, 8, 21, 8, 30);
      expect(isInKillZone(londonTime)).toBe(true);

      // 13:30 UTC -> New York kill zone (12:00 - 15:00)
      const nyTime = Date.UTC(2026, 8, 21, 13, 30);
      expect(isInKillZone(nyTime)).toBe(true);

      // 21:00 UTC -> Off-hours
      const offTime = Date.UTC(2026, 8, 21, 21, 0);
      expect(isInKillZone(offTime)).toBe(false);
    });

    it('calculates entry at consequent encroachment and 1:3 R:R targets with structural stop', () => {
      const fvg: FvgZone = { top: 104, bottom: 100, midpoint: 102, candleIndex: 5, direction: 'LONG' };
      const sweepLow = 97.0;
      const atr = 2.0;

      const levels = calculateSmcLevels('LONG', fvg, sweepLow, atr, {
        atrStopMult: 1.5,
        rrRatio: 3.0
      });

      expect(levels.entryPrice).toBe(102);
      // base stop = 102 - 3.0 = 99.0; structural stop = 97 * 0.9995 = 96.9515 -> min(99.0, 96.9515) = 96.9515
      expect(levels.sl).toBeCloseTo(96.9515, 2);
      const risk = levels.entryPrice - levels.sl;
      expect(levels.tp2).toBeCloseTo(levels.entryPrice + risk * 3.0, 2);
    });

    it('generates machine-readable webhook payload matching specification', () => {
      const payloadStr = generateSmcWebhookPayload('BTCUSDT', 'LONG', 64250.5, 63820.0, 65542.0, 2);
      const payload = JSON.parse(payloadStr);

      expect(payload.action).toBe('buy');
      expect(payload.symbol).toBe('BTCUSDT');
      expect(payload.type).toBe('limit');
      expect(payload.price).toBe(64250.5);
      expect(payload.sl).toBe(63820.0);
      expect(payload.tp).toBe(65542.0);
      expect(payload.qty_type).toBe('equity_pct');
      expect(payload.qty_value).toBe(2);
      expect(payload.comment).toBe('SMC_Long_FVG_OB');
    });
  });

  describe('6. End-to-End Strategy Evaluation', () => {
    it('triggers a complete high-probability Long SMC signal', () => {
      const candles: Candle[] = [];
      const baseTime = Date.UTC(2026, 8, 21, 8, 0); // London session

      // 1. Establish prior structure and liquidity level (swing low at candle 15 = 95.0)
      for (let i = 0; i < 35; i++) {
        let l = 98;
        let h = 104;
        if (i === 15) {
          l = 95.0; // Confirmed Swing Low Pivot (surrounded by lows of 98)
        }
        candles.push(createCandle(baseTime + i * 900000, 100, h, l, 101, 1000));
      }

      // 2. Liquidity Sweep at candle 35: low drops to 93.0 (< 95.0), wicks back and closes at 96.0 (> 95.0)
      candles.push(createCandle(baseTime + 35 * 900000, 96.5, 97.0, 93.0, 96.0, 2500));

      // 3. Displacement candles causing MSS (breaks prior structure high 104.0) + creating FVG
      candles.push(createCandle(baseTime + 36 * 900000, 96.0, 100.0, 95.8, 99.5, 2000)); // C1
      candles.push(createCandle(baseTime + 37 * 900000, 99.5, 106.0, 99.5, 105.5, 3500)); // C2: Displacement & Order Block
      candles.push(createCandle(baseTime + 38 * 900000, 105.5, 108.5, 103.0, 108.0, 3000)); // C3: MSS close > 104.0; FVG gap [100.0, 103.0]

      // Current live candle
      candles.push(createCandle(baseTime + 39 * 900000, 108.0, 108.5, 107.5, 108.0, 1000));

      const signal = evaluateSmc(candles, null, 108.0, {
        structureLen: 5,
        sweepConfirmWindow: 10,
        useKillZone: false
      });

      expect(signal).not.toBeNull();
      expect(signal!.direction).toBe('LONG');
      expect(signal!.confluence).toBe(true);
      expect(signal!.score).toBeGreaterThanOrEqual(85);
      expect(signal!.entryPrice).toBeGreaterThan(0);
      expect(signal!.sl).toBeLessThan(signal!.entryPrice);
      expect(signal!.tp2).toBeGreaterThan(signal!.entryPrice);
      expect(signal!.webhookPayload).toBeDefined();
    });
  });
});
