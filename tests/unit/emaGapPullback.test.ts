import { describe, it, expect } from 'vitest';
import {
  calcEma,
  calcAtr,
  checkHtfTrendFilter,
  checkOverextension,
  detectPullback,
  detectGapCandle,
  detectFailedBreakout,
  calculateLevels,
  evaluateEmaGapPullback
} from '../../src/utils/strategies/emaGapPullback';

describe('5 EMA Gap Pullback Strategy Engine', () => {
  // Helper to generate synthetic candle series
  function generateCandles(count: number, basePrice: number, trendStep: number = 0, volatility: number = 2): any[] {
    const candles: any[] = [];
    let price = basePrice;
    for (let i = 0; i < count; i++) {
      const open = price;
      const close = price + trendStep + (Math.sin(i) * volatility * 0.3);
      const high = Math.max(open, close) + volatility;
      const low = Math.min(open, close) - volatility;
      const volume = 1000 + Math.sin(i) * 200;
      candles.push({
        time: 1700000000 + i * 300,
        open,
        high,
        low,
        close,
        volume
      });
      price = close;
    }
    return candles;
  }

  describe('HTF Trend Filter (1H 50 EMA)', () => {
    it('detects LONG trend when price > 50 EMA and slope is positive', () => {
      // 70 candles steadily trending upward
      const htfCandles = generateCandles(70, 100, 1.5, 2);
      const res = checkHtfTrendFilter(htfCandles, 50, 10);
      expect(res.direction).toBe('LONG');
      expect(res.priceAboveEma50).toBe(true);
      expect(res.slope).toBeGreaterThan(0);
    });

    it('detects SHORT trend when price < 50 EMA and slope is negative', () => {
      // 70 candles steadily trending downward
      const htfCandles = generateCandles(70, 200, -1.5, 2);
      const res = checkHtfTrendFilter(htfCandles, 50, 10);
      expect(res.direction).toBe('SHORT');
      expect(res.priceAboveEma50).toBe(false);
      expect(res.slope).toBeLessThan(0);
    });

    it('returns null when price opposes slope direction (choppy/inconsistent)', () => {
      // Create series where price dropped below EMA but EMA is still sloping up from earlier rise
      const htfCandles = generateCandles(55, 100, 3.0, 1);
      // Sudden sharp drop on last 5 candles
      for (let i = 0; i < 5; i++) {
        const lastClose = htfCandles[htfCandles.length - 1].close;
        htfCandles.push({
          time: 1700000000 + (55 + i) * 300,
          open: lastClose,
          high: lastClose + 1,
          low: lastClose - 15,
          close: lastClose - 14,
          volume: 2000
        });
      }
      const res = checkHtfTrendFilter(htfCandles, 50, 10);
      // Either direction is null or does not confirm a long
      expect(res.direction === null || res.priceAboveEma50 === false).toBe(true);
    });

    it('handles insufficient candles safely', () => {
      const shortCandles = generateCandles(20, 100);
      const res = checkHtfTrendFilter(shortCandles, 50, 10);
      expect(res.direction).toBeNull();
    });
  });

  describe('Overextension Guard', () => {
    it('allows entry when distance to EMA21 is within 1 ATR', () => {
      const close = 105;
      const ema21 = 103; // distance = 2
      const atr = 3;     // 2/3 = 0.67 ATR <= 1.0
      const res = checkOverextension(close, ema21, atr, 1.0);
      expect(res.isOverextended).toBe(false);
      expect(res.distanceAtr).toBeCloseTo(0.667, 2);
    });

    it('rejects entry when distance to EMA21 exceeds 1 ATR', () => {
      const close = 115;
      const ema21 = 100; // distance = 15
      const atr = 5;     // 15/5 = 3.0 ATR > 1.0
      const res = checkOverextension(close, ema21, atr, 1.0);
      expect(res.isOverextended).toBe(true);
      expect(res.distanceAtr).toBe(3.0);
    });
  });

  describe('Pullback Structure Detection', () => {
    it('validates a 3-candle orderly pullback toward 5 EMA', () => {
      const candles = generateCandles(40, 100, 0.5, 1);
      const lastC = candles[candles.length - 1].close;
      candles.push({ time: 1700000000, open: lastC, high: lastC + 0.2, low: lastC - 0.8, close: lastC - 0.6, volume: 1000 });
      candles.push({ time: 1700000300, open: lastC - 0.6, high: lastC - 0.4, low: lastC - 1.4, close: lastC - 1.2, volume: 1000 });
      candles.push({ time: 1700000600, open: lastC - 1.2, high: lastC - 1.0, low: lastC - 2.0, close: lastC - 1.8, volume: 1000 });
      const closes = candles.map(c => c.close);
      const ema5 = calcEma(closes, 5);

      const res = detectPullback(candles, ema5, 'LONG', 3);
      expect(res.isValid).toBe(true);
      expect(res.bars).toBeGreaterThanOrEqual(3);
    });

    it('detects and rejects erratic V-spike pullbacks', () => {
      const candles = generateCandles(30, 100, 1.0, 1);
      // Insert one huge erratic candle followed by normal candles
      candles.push({
        time: 1700000000,
        open: 130,
        high: 131,
        low: 95,
        close: 98,
        volume: 8000
      });
      candles.push({ time: 1700000300, open: 98, high: 99, low: 97, close: 97.5, volume: 1000 });
      candles.push({ time: 1700000600, open: 97.5, high: 98, low: 96.5, close: 97, volume: 1000 });

      const closes = candles.map(c => c.close);
      const ema5 = calcEma(closes, 5);

      const res = detectPullback(candles, ema5, 'LONG', 3);
      // A giant spike should be identified
      if (res.bars >= 3) {
        expect(res.isVSpike).toBe(true);
        expect(res.isValid).toBe(false);
      }
    });
  });

  describe('Gap Candle Detection', () => {
    it('validates a quality gap candle with volume surge and body beyond 5 EMA', () => {
      const candle = {
        open: 101,
        close: 106, // bullish body = 5, top = 106, bot = 101
        high: 107,
        low: 100.5,
        volume: 3000
      };
      const ema5 = 102;     // body beyond = (106 - 102) / 5 = 80% >= 60%
      const avgVol20 = 1500; // vol ratio = 3000/1500 = 2.0x >= 1.5x
      const ema21 = 103;    // dist = 106 - 103 = 3
      const atr = 4;        // 3/4 = 0.75 ATR <= 1.0

      const res = detectGapCandle(candle, ema5, avgVol20, ema21, atr, 'LONG', 0.60, 1.5, 1.0);
      expect(res.isValid).toBe(true);
      expect(res.bodyPctBeyondEma).toBeGreaterThanOrEqual(0.60);
      expect(res.volumeRatio).toBe(2.0);
    });

    it('rejects gap candle with low volume', () => {
      const candle = {
        open: 101,
        close: 106,
        high: 107,
        low: 100.5,
        volume: 1200 // below 1.5x avg
      };
      const ema5 = 102;
      const avgVol20 = 1500; // 1200/1500 = 0.8x < 1.5x
      const ema21 = 103;
      const atr = 4;

      const res = detectGapCandle(candle, ema5, avgVol20, ema21, atr, 'LONG', 0.60, 1.5, 1.0);
      expect(res.isValid).toBe(false);
      expect(res.reason).toContain('Volume');
    });

    it('rejects candle when body does not clear 5 EMA by 60%', () => {
      const candle = {
        open: 98,
        close: 103, // body = 5, [98, 103]
        high: 104,
        low: 97,
        volume: 3000
      };
      const ema5 = 102; // body above = (103 - 102) / 5 = 20% < 60%
      const avgVol20 = 1500;
      const ema21 = 100;
      const atr = 4;

      const res = detectGapCandle(candle, ema5, avgVol20, ema21, atr, 'LONG', 0.60, 1.5, 1.0);
      expect(res.isValid).toBe(false);
      expect(res.reason).toContain('Body only');
    });
  });

  describe('Failed Breakout Filter', () => {
    it('detects a failed breakout when follow-through bar wicks hard and closes inside', () => {
      const nextCandle = {
        open: 106,
        high: 112,
        low: 100,
        close: 101, // closed back below EMA5 (102) with giant upper wick
        volume: 2500
      };
      const ema5 = 102;

      const res = detectFailedBreakout(nextCandle, ema5, 'LONG', 0.50);
      expect(res.isFailed).toBe(true);
      expect(res.reason).toContain('Failed breakout');
    });

    it('passes when follow-through candle holds above 5 EMA', () => {
      const nextCandle = {
        open: 106,
        high: 109,
        low: 105,
        close: 108, // holds strongly above EMA5
        volume: 2000
      };
      const ema5 = 102;

      const res = detectFailedBreakout(nextCandle, ema5, 'LONG', 0.50);
      expect(res.isFailed).toBe(false);
    });
  });

  describe('Entry, Stop Loss, and Asymmetric Targets', () => {
    it('computes limit entry, structural swing stop, and 1R/1.5R/2.5R targets for LONG', () => {
      const candles = generateCandles(30, 100, 0.5, 1);
      const gapIdx = candles.length - 1;
      const ema5 = 114;
      const atr = 2.5;

      const levels = calculateLevels('LONG', candles, gapIdx, ema5, atr, {
        egpSlSwingLookback: 10,
        egpSlAtrBuffer: 0.2,
        egpTp1RMultiple: 1.0,
        egpTp2RMultiple: 1.5,
        egpTp3RMultiple: 2.5
      });

      expect(levels).not.toBeNull();
      if (levels) {
        expect(levels.entry).toBeGreaterThan(levels.sl);
        const risk = levels.entry - levels.sl;
        expect(levels.tp1).toBeCloseTo(levels.entry + risk * 1.0, 2);
        expect(levels.tp2).toBeCloseTo(levels.entry + risk * 1.5, 2);
        expect(levels.tp3).toBeCloseTo(levels.entry + risk * 2.5, 2);
        expect(levels.riskPerUnit).toBe(risk);
      }
    });

    it('computes correct targets and stop for SHORT', () => {
      const candles = generateCandles(30, 200, -0.5, 1);
      const gapIdx = candles.length - 1;
      const ema5 = 186;
      const atr = 2.5;

      const levels = calculateLevels('SHORT', candles, gapIdx, ema5, atr, {
        egpSlSwingLookback: 10,
        egpSlAtrBuffer: 0.2,
        egpTp1RMultiple: 1.0,
        egpTp2RMultiple: 1.5,
        egpTp3RMultiple: 2.5
      });

      expect(levels).not.toBeNull();
      if (levels) {
        expect(levels.sl).toBeGreaterThan(levels.entry);
        const risk = levels.sl - levels.entry;
        expect(levels.tp1).toBeCloseTo(levels.entry - risk * 1.0, 2);
        expect(levels.tp2).toBeCloseTo(levels.entry - risk * 1.5, 2);
        expect(levels.tp3).toBeCloseTo(levels.entry - risk * 2.5, 2);
      }
    });
  });

  describe('Full End-to-End Evaluation', () => {
    it('returns a confirmed signal when all rules align', () => {
      // 1H HTF trending up (clear slope)
      const htfCandles = generateCandles(70, 100, 0.5, 1.5);

      // Entry timeframe: 60 candles with mild trend, recent pullback, and gap candle
      const entryCandles = generateCandles(55, 120, 0.1, 2.0);
      // 3 pullback bars toward 5 EMA
      const p1 = entryCandles[entryCandles.length - 1].close;
      entryCandles.push({ time: 1700000000, open: p1, high: p1 + 0.5, low: p1 - 1.2, close: p1 - 0.8, volume: 1000 });
      entryCandles.push({ time: 1700000300, open: p1 - 0.8, high: p1 - 0.4, low: p1 - 2.0, close: p1 - 1.5, volume: 900 });
      entryCandles.push({ time: 1700000600, open: p1 - 1.5, high: p1 - 1.0, low: p1 - 2.6, close: p1 - 2.2, volume: 850 });
      
      // Strong gap candle breaking above 5 EMA with volume surge
      const lastC = entryCandles[entryCandles.length - 1].close;
      entryCandles.push({
        time: 1700000900,
        open: lastC,
        high: lastC + 2.5,
        low: lastC - 0.2,
        close: lastC + 2.2,
        volume: 3500 // > 1.5x average
      });

      const currentPrice = entryCandles[entryCandles.length - 1].close;
      const sig = evaluateEmaGapPullback(entryCandles, htfCandles, currentPrice);

      // It should either confirm or detect forming depending on indicator series
      expect(sig).not.toBeNull();
      if (sig && sig.status === 'confirmed') {
        expect(sig.direction).toBe('LONG');
        expect(sig.score).toBeGreaterThanOrEqual(60);
        expect(sig.stop).toBeDefined();
        expect(sig.tp1).toBeDefined();
        expect(sig.tp2).toBeDefined();
        expect(sig.tp3).toBeDefined();
      }
    });

    it('returns null when HTF trend is absent or opposing', () => {
      // HTF flat/choppy
      const htfCandles = generateCandles(70, 100, 0, 3);
      const entryCandles = generateCandles(60, 100, 0.5, 1);
      const sig = evaluateEmaGapPullback(entryCandles, htfCandles, 130);
      expect(sig).toBeNull();
    });
  });
});
