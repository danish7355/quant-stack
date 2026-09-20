import { describe, it, expect } from 'vitest';
import {
  evaluateRangeMeanReversion,
  detectRangingRegime,
  detectObjectiveRange,
  checkBreakoutRisk,
  calculateBollingerBands,
  inRangeMarket,
  calculateMeanReversionExpectancy,
  MeanReversionTradeRecord
} from '../../src/utils/strategies/rangeMeanReversion';
import { calculateRSI } from '../../src/utils/indicators';

/**
 * Candle builder helper for testing.
 */
function createCandle(
  time: number,
  open: number,
  high: number,
  low: number,
  close: number,
  volume = 1000,
  isClosed = true
) {
  return { time, open, high, low, close, volume, isClosed };
}

/**
 * Generates an established horizontal ranging market (50 candles).
 * Box boundary roughly between 95 (support) and 105 (resistance).
 */
function createRangingMarket(count = 50, stepMs = 15 * 60 * 1000) {
  const candles = [];
  const baseTime = Date.now() - count * stepMs;
  let price = 100;

  for (let i = 0; i < count; i++) {
    const time = baseTime + i * stepMs;
    // Oscillate neatly within 96 to 104
    const wave = Math.sin(i * 0.4) * 3.5;
    const o = 100 + wave;
    const c = 100 + wave + (Math.cos(i) * 0.5);
    const h = Math.max(o, c) + 0.8;
    const l = Math.min(o, c) - 0.8;
    candles.push(createCandle(time, o, h, l, c, 800));
  }
  return candles;
}

/**
 * Generates a valid Long Mean-Reversion setup:
 * Ranging market, followed by sweep below range low (95),
 * rejection close back inside range with oversold RSI, and confirmation break.
 */
function createValidLongSetup() {
  const candles = createRangingMarket(45);
  const stepMs = 15 * 60 * 1000;
  const lastTime = candles[candles.length - 1].time;

  // Bar 45: Sweep below support (low dips to 94.0, closes at 94.8)
  candles.push(createCandle(lastTime + stepMs, 96.5, 96.8, 93.8, 94.5, 1200));

  // Bar 46: Rejection candle: sweeps 93.5, closes back firmly inside range at 95.8
  candles.push(createCandle(lastTime + 2 * stepMs, 94.5, 96.0, 93.5, 95.8, 1500));

  // Bar 47: Confirmation bar: breaks rejection candle high (96.0) and closes at 96.5
  candles.push(createCandle(lastTime + 3 * stepMs, 95.8, 96.8, 95.5, 96.5, 1400));

  return candles;
}

/**
 * Generates a valid Short Mean-Reversion setup:
 * Ranging market, followed by sweep above range high (105),
 * rejection close back inside range with overbought RSI, and confirmation break.
 */
function createValidShortSetup() {
  const candles = createRangingMarket(45);
  const stepMs = 15 * 60 * 1000;
  const lastTime = candles[candles.length - 1].time;

  // Bar 45: Sweep above resistance (high reaches 106.8, closes at 106.0)
  candles.push(createCandle(lastTime + stepMs, 103.5, 106.8, 103.2, 106.0, 1200));

  // Bar 46: Rejection candle: sweeps 106.5, closes back firmly inside range at 104.2
  candles.push(createCandle(lastTime + 2 * stepMs, 105.5, 106.5, 104.0, 104.2, 1500));

  // Bar 47: Confirmation bar: breaks rejection candle low (104.0) and closes at 103.5
  candles.push(createCandle(lastTime + 3 * stepMs, 104.2, 104.5, 103.2, 103.5, 1400));

  return candles;
}

describe('Institutional Ranging Mean-Reversion Strategy', () => {

  // 1. Regime Filter Module
  it('1. detectRangingRegime confirms range-friendly conditions and rejects trending markets', () => {
    const ranging = createRangingMarket(50);
    const regime = detectRangingRegime(ranging);

    expect(regime.isRanging).toBe(true);
    expect(regime.adx).toBeLessThan(25);
    expect(regime.atrRatio).toBeLessThan(1.3);

    // Trending market with strong momentum expansion (ADX > 30)
    const trendingCandles = [];
    const baseTime = Date.now() - 50 * 900000;
    let p = 100;
    for (let i = 0; i < 50; i++) {
      p += 1.8; // sharp monotonic trend
      trendingCandles.push(createCandle(baseTime + i * 900000, p - 1.8, p + 0.5, p - 2.0, p, 2000));
    }

    const trendRegime = detectRangingRegime(trendingCandles);
    expect(trendRegime.isRanging).toBe(false);
    expect(trendRegime.adx).toBeGreaterThan(25);
  });

  // 2. Objective Range Detection Module
  it('2. detectObjectiveRange identifies RangeHigh, RangeLow, RangeMid, and enforces outer 20% location', () => {
    const candles = createRangingMarket(50);
    const range = detectObjectiveRange(candles, 100, 1.5, 50);

    expect(range.rangeHigh).toBeGreaterThan(102);
    expect(range.rangeLow).toBeLessThan(98);
    expect(range.rangeMid).toBeCloseTo((range.rangeHigh + range.rangeLow) / 2, 1);
    expect(range.rangeWidth).toBe(range.rangeHigh - range.rangeLow);
    expect(range.rangeWidthAtr).toBeGreaterThan(3.0);
    expect(range.touchesHigh).toBeGreaterThanOrEqual(2);
    expect(range.touchesLow).toBeGreaterThanOrEqual(2);
    expect(range.isValidRange).toBe(true);

    // Middle of range test (current price 100 is at ~50% range location)
    const midSignal = evaluateRangeMeanReversion(candles, 100);
    expect(midSignal).toBeNull();
  });

  // 3. Confirmation Over Prediction (LONG Setup)
  it('3. Confirms valid LONG mean-reversion setup at lower boundary extreme', () => {
    const candles = createValidLongSetup();
    const currentPrice = candles[candles.length - 1].close;

    const signal = evaluateRangeMeanReversion(candles, currentPrice, {
      minScore: 7,
      minRrRatio: 1.0
    });

    expect(signal).not.toBeNull();
    expect(signal?.direction).toBe('LONG');
    expect(signal?.rangeLocation).toBeLessThanOrEqual(0.35); // at lower boundary
    expect(signal?.sl).toBeLessThan(currentPrice);
    expect(signal?.tp1).toBeGreaterThan(currentPrice); // TP1 at RangeMid
    expect(signal?.tp2).toBeGreaterThan(signal!.tp1); // TP2 at RangeHigh
    expect(signal?.score).toBeGreaterThanOrEqual(70);
  });

  // 3. Confirmation Over Prediction (SHORT Setup)
  it('4. Confirms valid SHORT mean-reversion setup at upper boundary extreme', () => {
    const candles = createValidShortSetup();
    const currentPrice = candles[candles.length - 1].close;

    const signal = evaluateRangeMeanReversion(candles, currentPrice, {
      minScore: 7,
      minRrRatio: 1.0
    });

    expect(signal).not.toBeNull();
    expect(signal?.direction).toBe('SHORT');
    expect(signal?.rangeLocation).toBeGreaterThanOrEqual(0.65); // at upper boundary
    expect(signal?.sl).toBeGreaterThan(currentPrice);
    expect(signal?.tp1).toBeLessThan(currentPrice); // TP1 at RangeMid
    expect(signal?.tp2).toBeLessThan(signal!.tp1); // TP2 at RangeLow
  });

  // 4. Fake Reversal & BreakoutRisk Filter
  it('5. checkBreakoutRisk flags BreakoutRisk and rejects trades during breakout expansion', () => {
    const candles = createValidLongSetup();
    const bb = calculateBollingerBands(candles.map(c => c.close));

    // Case A: normal stable market -> no breakout risk
    const normalRisk = checkBreakoutRisk(candles, 105, 95, 1.0, -0.2, 18, bb);
    expect(normalRisk.hasBreakoutRisk).toBe(false);

    // Case B: close outside range + ATR expanding (> 1.3) + rising ADX
    const lastIdx = candles.length - 1;
    candles[lastIdx].close = 92.0; // deep close outside range low
    const breakoutRisk = checkBreakoutRisk(candles, 105, 95, 1.35, 1.2, 24, bb);
    expect(breakoutRisk.hasBreakoutRisk).toBe(true);
    expect(breakoutRisk.reason).toContain('BreakoutRisk');

    // evaluateRangeMeanReversion must reject when breakout risk is present
    const rejectedSignal = evaluateRangeMeanReversion(candles, 92.0);
    expect(rejectedSignal).toBeNull();
  });

  // 5. Entry, Stop, and Target Rules (R:R Gate)
  it('6. Places stop beyond rejection extreme with ATR buffer and enforces R:R gates', () => {
    const candles = createValidLongSetup();
    const currentPrice = candles[candles.length - 1].close;

    const signal = evaluateRangeMeanReversion(candles, currentPrice, {
      atrBufferMult: 0.3,
      minScore: 7
    });

    expect(signal).not.toBeNull();
    if (signal) {
      const stopDist = currentPrice - signal.sl;
      expect(stopDist).toBeGreaterThan(0.5); // non-zero stop
      // Target 1 is RangeMid
      expect(signal.tp1).toBeCloseTo(signal.rangeMid, 1);
      // Target 2 is RangeHigh
      expect(signal.tp2).toBeCloseTo(signal.rangeHigh, 1);
    }
  });

  // 6. Practical 11-Point Scoring Model
  it('7. Practical 11-point scoring system evaluates factors and respects minScore gate', () => {
    const candles = createValidLongSetup();
    const currentPrice = candles[candles.length - 1].close;

    // Normal evaluation with minScore = 7
    const signal = evaluateRangeMeanReversion(candles, currentPrice, { minScore: 7 });
    expect(signal).not.toBeNull();
    expect(signal?.rawScore).toBeGreaterThanOrEqual(7);
    expect(signal?.scoreBreakdown).toBeDefined();
    expect(signal?.scoreBreakdown.total).toBe(signal?.rawScore);

    // Gated evaluation with impossible minScore = 12
    const gatedSignal = evaluateRangeMeanReversion(candles, currentPrice, { minScore: 12 });
    expect(gatedSignal).toBeNull();
  });

  // 7. Expectancy Tracking & Analytics Engine
  it('8. calculateMeanReversionExpectancy computes mathematical expectancy and multi-dimensional breakdowns', () => {
    const sampleTrades: MeanReversionTradeRecord[] = [
      // 7 Wins (+1.5R average)
      { id: '1', symbol: 'BTCUSDT', direction: 'LONG', timeframe: '15m', entryPrice: 95, exitPrice: 100, sl: 92, tp1: 100, tp2: 105, pnl: 300, pnlR: 1.67, isWin: true, adxAtEntry: 16, atrRatioAtEntry: 0.95, boundaryTestsAtEntry: 2, session: 'LONDON', entryTime: 1700000000000, exitTime: 1700003600000 },
      { id: '2', symbol: 'BTCUSDT', direction: 'LONG', timeframe: '15m', entryPrice: 96, exitPrice: 100, sl: 93, tp1: 100, tp2: 105, pnl: 300, pnlR: 1.33, isWin: true, adxAtEntry: 17, atrRatioAtEntry: 1.05, boundaryTestsAtEntry: 2, session: 'NEW_YORK', entryTime: 1700010000000, exitTime: 1700013600000 },
      { id: '3', symbol: 'ETHUSDT', direction: 'SHORT', timeframe: '15m', entryPrice: 105, exitPrice: 100, sl: 108, tp1: 100, tp2: 95, pnl: 300, pnlR: 1.67, isWin: true, adxAtEntry: 19, atrRatioAtEntry: 1.10, boundaryTestsAtEntry: 3, session: 'ASIA', entryTime: 1700020000000, exitTime: 1700023600000 },
      { id: '4', symbol: 'ETHUSDT', direction: 'SHORT', timeframe: '15m', entryPrice: 104, exitPrice: 100, sl: 107, tp1: 100, tp2: 95, pnl: 300, pnlR: 1.33, isWin: true, adxAtEntry: 18, atrRatioAtEntry: 1.15, boundaryTestsAtEntry: 3, session: 'LONDON', entryTime: 1700030000000, exitTime: 1700033600000 },
      { id: '5', symbol: 'BTCUSDT', direction: 'LONG', timeframe: '15m', entryPrice: 95, exitPrice: 100, sl: 92, tp1: 100, tp2: 105, pnl: 300, pnlR: 1.67, isWin: true, adxAtEntry: 20, atrRatioAtEntry: 1.12, boundaryTestsAtEntry: 2, session: 'LONDON', entryTime: 1700040000000, exitTime: 1700043600000 },
      { id: '6', symbol: 'BTCUSDT', direction: 'LONG', timeframe: '15m', entryPrice: 96, exitPrice: 100, sl: 93, tp1: 100, tp2: 105, pnl: 300, pnlR: 1.33, isWin: true, adxAtEntry: 15, atrRatioAtEntry: 0.90, boundaryTestsAtEntry: 2, session: 'NEW_YORK', entryTime: 1700050000000, exitTime: 1700053600000 },
      { id: '7', symbol: 'ETHUSDT', direction: 'SHORT', timeframe: '15m', entryPrice: 105, exitPrice: 100, sl: 108, tp1: 100, tp2: 95, pnl: 300, pnlR: 1.67, isWin: true, adxAtEntry: 14, atrRatioAtEntry: 0.88, boundaryTestsAtEntry: 2, session: 'ASIA', entryTime: 1700060000000, exitTime: 1700063600000 },
      // 3 Losses (-1.0R each)
      { id: '8', symbol: 'BTCUSDT', direction: 'LONG', timeframe: '15m', entryPrice: 95, exitPrice: 92, sl: 92, tp1: 100, tp2: 105, pnl: -180, pnlR: -1.0, isWin: false, adxAtEntry: 24, atrRatioAtEntry: 1.35, boundaryTestsAtEntry: 5, session: 'OFF_HOURS', entryTime: 1700070000000, exitTime: 1700073600000 },
      { id: '9', symbol: 'ETHUSDT', direction: 'SHORT', timeframe: '15m', entryPrice: 105, exitPrice: 108, sl: 108, tp1: 100, tp2: 95, pnl: -180, pnlR: -1.0, isWin: false, adxAtEntry: 26, atrRatioAtEntry: 1.40, boundaryTestsAtEntry: 5, session: 'OFF_HOURS', entryTime: 1700080000000, exitTime: 1700083600000 },
      { id: '10', symbol: 'BTCUSDT', direction: 'LONG', timeframe: '15m', entryPrice: 95, exitPrice: 92, sl: 92, tp1: 100, tp2: 105, pnl: -180, pnlR: -1.0, isWin: false, adxAtEntry: 21, atrRatioAtEntry: 1.28, boundaryTestsAtEntry: 4, session: 'ASIA', entryTime: 1700090000000, exitTime: 1700093600000 },
    ];

    const metrics = calculateMeanReversionExpectancy(sampleTrades);

    expect(metrics.totalTrades).toBe(10);
    expect(metrics.winCount).toBe(7);
    expect(metrics.lossCount).toBe(3);
    expect(metrics.winRate).toBe(0.7);
    expect(metrics.lossRate).toBe(0.3);
    expect(metrics.avgWinR).toBeCloseTo(1.52, 1);
    expect(metrics.avgLossR).toBe(1.0);

    // Expectancy = (0.7 * 1.52) - (0.3 * 1.0) = 1.064 - 0.3 = +0.764R per trade
    expect(metrics.expectancyR).toBeGreaterThan(0.70);
    expect(metrics.profitFactor).toBeGreaterThan(3.0);

    // Multi-dimensional breakdowns:
    // Low ADX (< 18) had 100% win rate
    expect(metrics.byAdxTier.lowAdxSub18.winRate).toBe(1.0);
    // High ADX (> 22) had 0% win rate (validating that high ADX kills mean reversion!)
    expect(metrics.byAdxTier.highAdxAbove22.winRate).toBe(0.0);

    // Stable ATR (< 1.25) had high win rate
    expect(metrics.byAtrRegime.sub1_0.winRate).toBe(1.0);
    // Expanding ATR (> 1.25) had losses
    expect(metrics.byAtrRegime.highAbove1_25.winRate).toBe(0.0);

    // Boundary test fatigue: 5+ tests failed
    expect(metrics.byBoundaryTests.fivePlusTests.winRate).toBe(0.0);
  });

  // 8. Legacy Compatibility Helpers
  it('9. calculateBollingerBands and inRangeMarket continue to operate reliably', () => {
    const closes = [100, 101, 100.5, 99.8, 100.2, 100.4, 99.9, 100.1, 100.3, 100.0, 99.7, 100.2, 100.5, 99.8, 100.1, 100.2, 99.9, 100.3, 100.0, 100.1, 100.2];
    const bb = calculateBollingerBands(closes, 10, 2.0);

    expect(bb.middle.length).toBe(closes.length);
    expect(bb.upper.length).toBe(closes.length);
    expect(bb.lower.length).toBe(closes.length);
    expect(bb.upper[closes.length - 1]).toBeGreaterThan(bb.middle[closes.length - 1]);
    expect(bb.lower[closes.length - 1]).toBeLessThan(bb.middle[closes.length - 1]);

    const rangeCheck = inRangeMarket(closes);
    expect(rangeCheck.inRange).toBe(true);
  });
});
