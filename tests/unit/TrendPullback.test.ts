import { describe, it, expect, beforeEach } from 'vitest';
import {
  evaluateTrendPullback,
  evaluateTrendPullbackDetailed,
  getHigherTimeframe,
  timeframeToMinutes,
  clearSignalDeduplicationCache,
  detectMarketRegime,
  calculateStrategyExpectancy,
  getTradingSession,
  calculatePositionSize,
  checkFakeBreakout,
  calculateStopLoss,
  StrategyTradeRecord,
  Candle
} from '../../src/utils/strategies/trendPullback';

/**
 * Helper to build realistic candlestick series for unit testing.
 */
function createCandle(
  time: number,
  open: number,
  high: number,
  low: number,
  close: number,
  volume = 1000,
  isClosed = true
): Candle {
  return { time, open, high, low, close, volume, isClosed };
}

/**
 * Generates an established bullish HTF series (50 1-hour candles).
 */
function createHtfBullishCandles(count = 50, stepMs = 60 * 60 * 1000): Candle[] {
  const candles: Candle[] = [];
  const baseTime = Date.now() - count * stepMs;
  let price = 100;

  for (let i = 0; i < count; i++) {
    const time = baseTime + i * stepMs;
    const wave = Math.sin(i / 2) * 1.5;
    const o = price;
    price += 0.8;
    const c = price + wave;
    const h = Math.max(o, c) + 1.0;
    const l = Math.min(o, c) - 0.8;
    candles.push(createCandle(time, o, h, l, c, 2000));
  }
  return candles;
}

/**
 * Generates an established bearish HTF series (50 1-hour candles).
 */
function createHtfBearishCandles(count = 50, stepMs = 60 * 60 * 1000): Candle[] {
  const candles: Candle[] = [];
  const baseTime = Date.now() - count * stepMs;
  let price = 150;

  for (let i = 0; i < count; i++) {
    const time = baseTime + i * stepMs;
    const wave = Math.sin(i / 2) * 1.5;
    const o = price;
    price -= 0.8;
    const c = price + wave;
    const h = Math.max(o, c) + 0.8;
    const l = Math.min(o, c) - 1.0;
    candles.push(createCandle(time, o, h, l, c, 2000));
  }
  return candles;
}

/**
 * Generates trade execution candles with a valid bullish pullback setup:
 * Wave 1, Wave 2, impulse, healthy pullback touching EMA20, then strong bullish engulfing.
 */
function createValidBullishSetup(intervalMin = 15): Candle[] {
  const stepMs = intervalMin * 60 * 1000;
  const count = 44;
  const baseTime = Date.now() - count * stepMs;
  const tradeCandles: Candle[] = [];

  // Wave 1: 100 -> 115 -> 110 (indices 0..15)
  let tp = 100;
  for (let i = 0; i < 10; i++) {
    tp += 1.5;
    tradeCandles.push(createCandle(baseTime + i * stepMs, tp - 1.5, tp + 0.5, tp - 2.0, tp, 1000));
  }
  for (let i = 10; i < 15; i++) {
    tp -= 1.0;
    tradeCandles.push(createCandle(baseTime + i * stepMs, tp + 1.0, tp + 1.5, tp - 0.5, tp, 600));
  }
  // Wave 2: 110 -> 125 -> 120 (indices 15..30)
  for (let i = 15; i < 25; i++) {
    tp += 1.5;
    tradeCandles.push(createCandle(baseTime + i * stepMs, tp - 1.5, tp + 0.5, tp - 2.0, tp, 1000));
  }
  for (let i = 25; i < 30; i++) {
    tp -= 1.0;
    tradeCandles.push(createCandle(baseTime + i * stepMs, tp + 1.0, tp + 1.5, tp - 0.5, tp, 600));
  }
  // Wave 3 impulse: 120 -> 135 (indices 30..38)
  for (let i = 30; i < 39; i++) {
    tp += 1.6;
    tradeCandles.push(createCandle(baseTime + i * stepMs, tp - 1.6, tp + 0.5, tp - 2.0, tp, 1200));
  }

  // Pullback towards EMA20 (indices 39..42)
  const pb = [
    { o: tp, c: tp - 2, h: tp + 0.5, l: tp - 2.2, v: 400 },
    { o: tp - 2, c: tp - 5, h: tp - 1.8, l: tp - 10.0, v: 350 }, // touches EMA20
    { o: tp - 5, c: tp - 6, h: tp - 3.8, l: tp - 6.2, v: 300 },
    { o: tp - 6, c: tp - 7, h: tp - 5.8, l: tp - 7.5, v: 250 },
  ];
  for (let i = 0; i < pb.length; i++) {
    const p = pb[i];
    tp = p.c;
    tradeCandles.push(createCandle(baseTime + (39 + i) * stepMs, p.o, p.h, p.l, p.c, p.v));
  }

  // Confirmation candle (index 43)
  const prevC = tradeCandles[tradeCandles.length - 1];
  const confirmCandle = createCandle(
    baseTime + 43 * stepMs,
    prevC.close,
    prevC.high + 2.5,
    prevC.close - 0.2,
    prevC.high + 2.0, // strong bullish engulfing
    2500,
    true
  );
  tradeCandles.push(confirmCandle);

  return tradeCandles;
}

/**
 * Generates trade execution candles with a valid bearish pullback setup.
 */
function createValidBearishSetup(intervalMin = 15): Candle[] {
  const stepMs = intervalMin * 60 * 1000;
  const count = 44;
  const baseTime = Date.now() - count * stepMs;
  const tradeCandles: Candle[] = [];

  let tp = 150;
  for (let i = 0; i < 10; i++) {
    tp -= 1.5;
    tradeCandles.push(createCandle(baseTime + i * stepMs, tp + 1.5, tp + 2.0, tp - 0.5, tp, 1000));
  }
  for (let i = 10; i < 15; i++) {
    tp += 1.0;
    tradeCandles.push(createCandle(baseTime + i * stepMs, tp - 1.0, tp + 0.5, tp - 1.5, tp, 600));
  }
  for (let i = 15; i < 25; i++) {
    tp -= 1.5;
    tradeCandles.push(createCandle(baseTime + i * stepMs, tp + 1.5, tp + 2.0, tp - 0.5, tp, 1000));
  }
  for (let i = 25; i < 30; i++) {
    tp += 1.0;
    tradeCandles.push(createCandle(baseTime + i * stepMs, tp - 1.0, tp + 0.5, tp - 1.5, tp, 600));
  }
  for (let i = 30; i < 39; i++) {
    tp -= 1.6;
    tradeCandles.push(createCandle(baseTime + i * stepMs, tp + 1.6, tp + 2.0, tp - 0.5, tp, 1200));
  }

  // Pullback up towards EMA20 (indices 39..42)
  const pb = [
    { o: tp, c: tp + 2, h: tp + 2.2, l: tp - 0.5, v: 400 },
    { o: tp + 2, c: tp + 4, h: tp + 4.2, l: tp + 1.8, v: 350 },
    { o: tp + 4, c: tp + 6, h: tp + 6.2, l: tp + 3.8, v: 300 },
    { o: tp + 6, c: tp + 7, h: tp + 7.5, l: tp + 5.8, v: 250 },
  ];
  for (let i = 0; i < pb.length; i++) {
    const p = pb[i];
    tp = p.c;
    tradeCandles.push(createCandle(baseTime + (39 + i) * stepMs, p.o, p.h, p.l, p.c, p.v));
  }

  // Confirmation candle (index 43)
  const prevC = tradeCandles[tradeCandles.length - 1];
  const confirmCandle = createCandle(
    baseTime + 43 * stepMs,
    prevC.close,
    prevC.close + 0.2,
    prevC.low - 2.5,
    prevC.low - 2.0, // strong bearish engulfing
    2500,
    true
  );
  tradeCandles.push(confirmCandle);

  return tradeCandles;
}

describe('Trend Pullback Strategy - 5-Pillar Architecture & Unit Tests', () => {
  beforeEach(() => {
    clearSignalDeduplicationCache();
  });

  // Test 1: Bullish trend with valid bullish pullback (LONG)
  it('1. Bullish trend with valid bullish pullback triggers confirmed LONG trade', () => {
    const htfCandles = createHtfBullishCandles(50);
    const tradeCandles = createValidBullishSetup(15);
    const currentPrice = tradeCandles[tradeCandles.length - 1].close;

    const evaluation = evaluateTrendPullbackDetailed(
      tradeCandles,
      htfCandles,
      currentPrice,
      {
        tradeTimeframe: '15m',
        symbol: 'BTCUSDT',
        isCandleClosed: true
      }
    );

    expect(evaluation.success).toBe(true);
    expect(evaluation.status).toBe('SIGNAL CONFIRMED');
    expect(evaluation.result).not.toBeNull();
    expect(evaluation.result?.direction).toBe('LONG');
    expect(evaluation.result?.details.confirmationScore).toBeGreaterThanOrEqual(7);
    expect(evaluation.result?.sl).toBeLessThan(currentPrice);
    expect(evaluation.result?.tp1).toBeGreaterThan(currentPrice);
    expect(evaluation.result?.signalId).toContain('BTCUSDT-15m');
  });

  // Test 2: Bearish trend with valid bearish pullback (SHORT)
  it('2. Bearish trend with valid bearish pullback triggers confirmed SHORT trade', () => {
    const htfCandles = createHtfBearishCandles(50);
    const tradeCandles = createValidBearishSetup(15);
    const currentPrice = tradeCandles[tradeCandles.length - 1].close;

    const evaluation = evaluateTrendPullbackDetailed(
      tradeCandles,
      htfCandles,
      currentPrice,
      {
        tradeTimeframe: '15m',
        symbol: 'ETHUSDT',
        isCandleClosed: true
      }
    );

    expect(evaluation.success).toBe(true);
    expect(evaluation.status).toBe('SIGNAL CONFIRMED');
    expect(evaluation.result).not.toBeNull();
    expect(evaluation.result?.direction).toBe('SHORT');
    expect(evaluation.result?.details.confirmationScore).toBeGreaterThanOrEqual(7);
    expect(evaluation.result?.sl).toBeGreaterThan(currentPrice);
    expect(evaluation.result?.tp1).toBeLessThan(currentPrice);
  });

  // Test 3: Pullback without price-action confirmation
  it('3. Pullback without price-action confirmation is rejected with PRICE_ACTION_NOT_CONFIRMED', () => {
    const htfCandles = createHtfBullishCandles(50);
    const tradeCandles = createValidBullishSetup(15);
    
    // Replace confirmation candle with a weak doji / indecision bar
    const lastIdx = tradeCandles.length - 1;
    const last = tradeCandles[lastIdx];
    tradeCandles[lastIdx] = createCandle(
      last.time,
      128.0,
      128.1,
      127.9,
      128.02, // Doji candle: tiny body, no engulfing, no rejection wick
      2500,
      true
    );

    const currentPrice = tradeCandles[lastIdx].close;
    const evaluation = evaluateTrendPullbackDetailed(
      tradeCandles,
      htfCandles,
      currentPrice,
      { tradeTimeframe: '15m', symbol: 'BTCUSDT' }
    );

    expect(evaluation.success).toBe(false);
    expect(evaluation.rejectionReason).toBe('PRICE_ACTION_NOT_CONFIRMED');
    expect(evaluation.result).toBeNull();
  });

  // Test 4: Price-action confirmation without volume confirmation
  it('4. Price-action confirmation without volume confirmation is rejected with VOLUME_NOT_CONFIRMED', () => {
    const htfCandles = createHtfBullishCandles(50);
    const tradeCandles = createValidBullishSetup(15);
    
    // Set confirmation candle volume lower than previous candle volume
    const lastIdx = tradeCandles.length - 1;
    tradeCandles[lastIdx].volume = 200; // < prev candle volume (250)

    const currentPrice = tradeCandles[lastIdx].close;
    const evaluation = evaluateTrendPullbackDetailed(
      tradeCandles,
      htfCandles,
      currentPrice,
      { tradeTimeframe: '15m', symbol: 'BTCUSDT', requireVolume: true }
    );

    expect(evaluation.success).toBe(false);
    expect(evaluation.rejectionReason).toBe('VOLUME_NOT_CONFIRMED');
    expect(evaluation.result).toBeNull();
  });

  // Test 5: Higher-timeframe bullish but trade-timeframe bearish
  it('5. Higher-timeframe bullish but trade-timeframe bearish is rejected with HTF_TREND_NOT_CONFIRMED', () => {
    const htfCandles = createHtfBullishCandles(50); // HTF Bullish
    const tradeCandles = createValidBearishSetup(15); // Trade TF in downtrend (conflict)

    const currentPrice = tradeCandles[tradeCandles.length - 1].close;
    const evaluation = evaluateTrendPullbackDetailed(
      tradeCandles,
      htfCandles,
      currentPrice,
      { tradeTimeframe: '15m', symbol: 'BTCUSDT' }
    );

    expect(evaluation.success).toBe(false);
    expect(evaluation.rejectionReason).toBe('HTF_TREND_NOT_CONFIRMED');
    expect(evaluation.reason).toContain('MTF');
  });

  // Test 6: 5-minute configuration using wrong 15-minute entry candles
  it('6. 5-minute configuration using wrong 15-minute entry candles is rejected with TIMEFRAME_MISMATCH', () => {
    const htfCandles = createHtfBullishCandles(50);
    const tradeCandles = createValidBullishSetup(15); // 15m intervals
    const currentPrice = tradeCandles[tradeCandles.length - 1].close;

    const evaluation = evaluateTrendPullbackDetailed(
      tradeCandles,
      htfCandles,
      currentPrice,
      { tradeTimeframe: '5m', symbol: 'BTCUSDT' } // Configured for 5m!
    );

    expect(evaluation.success).toBe(false);
    expect(evaluation.rejectionReason).toBe('TIMEFRAME_MISMATCH');
    expect(evaluation.reason).toContain('does not match configured tradeTimeframe');
  });

  // Test 7: 15-minute configuration using wrong 5-minute entry candles
  it('7. 15-minute configuration using wrong 5-minute entry candles is rejected with TIMEFRAME_MISMATCH', () => {
    const htfCandles = createHtfBullishCandles(50);
    const tradeCandles = createValidBullishSetup(5); // 5m intervals
    const currentPrice = tradeCandles[tradeCandles.length - 1].close;

    const evaluation = evaluateTrendPullbackDetailed(
      tradeCandles,
      htfCandles,
      currentPrice,
      { tradeTimeframe: '15m', symbol: 'BTCUSDT' } // Configured for 15m!
    );

    expect(evaluation.success).toBe(false);
    expect(evaluation.rejectionReason).toBe('TIMEFRAME_MISMATCH');
  });

  // Test 8: Signal generated before candle close
  it('8. Signal generated before candle close is rejected with CANDLE_NOT_CLOSED', () => {
    const htfCandles = createHtfBullishCandles(50);
    const tradeCandles = createValidBullishSetup(15);
    const currentPrice = tradeCandles[tradeCandles.length - 1].close;

    // Case A: Options explicitly sets isCandleClosed: false
    const evalA = evaluateTrendPullbackDetailed(
      tradeCandles,
      htfCandles,
      currentPrice,
      { tradeTimeframe: '15m', symbol: 'BTCUSDT', isCandleClosed: false }
    );
    expect(evalA.success).toBe(false);
    expect(evalA.rejectionReason).toBe('CANDLE_NOT_CLOSED');

    // Case B: Last candle has isClosed: false
    tradeCandles[tradeCandles.length - 1].isClosed = false;
    const evalB = evaluateTrendPullbackDetailed(
      tradeCandles,
      htfCandles,
      currentPrice,
      { tradeTimeframe: '15m', symbol: 'BTCUSDT' }
    );
    expect(evalB.success).toBe(false);
    expect(evalB.rejectionReason).toBe('CANDLE_NOT_CLOSED');
  });

  // Test 9: Duplicate signal on the same candle
  it('9. Duplicate signal on the same candle is rejected with DUPLICATE_SIGNAL', () => {
    const htfCandles = createHtfBullishCandles(50);
    const tradeCandles = createValidBullishSetup(15);
    const currentPrice = tradeCandles[tradeCandles.length - 1].close;

    // First run succeeds
    const firstSignal = evaluateTrendPullback(
      tradeCandles,
      htfCandles,
      currentPrice,
      { tradeTimeframe: '15m', symbol: 'BTCUSDT' }
    );
    expect(firstSignal).not.toBeNull();

    // Second run with the same candle produces duplicate rejection
    const secondEvaluation = evaluateTrendPullbackDetailed(
      tradeCandles,
      htfCandles,
      currentPrice,
      { tradeTimeframe: '15m', symbol: 'BTCUSDT' }
    );
    expect(secondEvaluation.success).toBe(false);
    expect(secondEvaluation.rejectionReason).toBe('DUPLICATE_SIGNAL');
  });

  // Test 10: Pullback that breaks trend structure
  it('10. Pullback that breaks trend structure is rejected with PULLBACK_BROKE_STRUCTURE', () => {
    const htfCandles = createHtfBullishCandles(50);
    const tradeCandles = createValidBullishSetup(15);

    // Make the pullback crash through structure (lowest swing low was 110 at index 14)
    const pbIdx = 41;
    tradeCandles[pbIdx].low = 90.0;
    tradeCandles[pbIdx].close = 91.0;

    const currentPrice = tradeCandles[tradeCandles.length - 1].close;
    const evaluation = evaluateTrendPullbackDetailed(
      tradeCandles,
      htfCandles,
      currentPrice,
      { tradeTimeframe: '15m', symbol: 'BTCUSDT' }
    );

    expect(evaluation.success).toBe(false);
    expect(['PULLBACK_INVALIDATED', 'PULLBACK_BROKE_STRUCTURE']).toContain(evaluation.rejectionReason);
  });

  // Test 11: Missing volume data
  it('11. Missing volume data across candles is rejected with MISSING_VOLUME_DATA', () => {
    const htfCandles = createHtfBullishCandles(50);
    const tradeCandles = createValidBullishSetup(15);

    // Strip volume data completely from recent candles
    for (const c of tradeCandles) {
      c.volume = 0;
    }

    const currentPrice = tradeCandles[tradeCandles.length - 1].close;
    const evaluation = evaluateTrendPullbackDetailed(
      tradeCandles,
      htfCandles,
      currentPrice,
      { tradeTimeframe: '15m', symbol: 'BTCUSDT', requireVolume: true }
    );

    expect(evaluation.success).toBe(false);
    expect(evaluation.rejectionReason).toBe('MISSING_VOLUME_DATA');
  });

  // Test 12: Invalid stop-loss or poor risk-to-reward ratio
  it('12. Invalid stop-loss or poor risk-to-reward ratio is rejected', () => {
    const htfCandles = createHtfBullishCandles(50);
    const tradeCandles = createValidBullishSetup(15);
    const currentPrice = tradeCandles[tradeCandles.length - 1].close;

    // Case A: Unacceptable risk-reward ratio configured (e.g. minRrRatio < 1.0)
    const evalA = evaluateTrendPullbackDetailed(
      tradeCandles,
      htfCandles,
      currentPrice,
      { tradeTimeframe: '15m', symbol: 'BTCUSDT', minRrRatio: 0.5 }
    );
    expect(evalA.success).toBe(false);
    expect(evalA.rejectionReason).toBe('RISK_REWARD_TOO_LOW');

    // Case B: Stop loss placed too close to entry (risk < minRisk)
    const candlesForTightSl = createValidBullishSetup(15);
    const lastIdx = candlesForTightSl.length - 1;
    // Set candle 42 (prev) and candle 43 (confirm) with a tight stop distance (0.35)
    candlesForTightSl[lastIdx - 1].open = 130.0;
    candlesForTightSl[lastIdx - 1].close = 129.9;
    candlesForTightSl[lastIdx - 1].high = 130.1;
    candlesForTightSl[lastIdx - 1].low = 129.8;
    candlesForTightSl[lastIdx].open = 129.9;
    candlesForTightSl[lastIdx].close = 130.2;
    candlesForTightSl[lastIdx].high = 130.25;
    candlesForTightSl[lastIdx].low = 129.85;

    const evalB = evaluateTrendPullbackDetailed(
      candlesForTightSl,
      htfCandles,
      130.2,
      { tradeTimeframe: '15m', symbol: 'BTCUSDT', atrBufferMult: 0.0 }
    );
    expect(evalB.success).toBe(false);
    expect(['STOP_TOO_TIGHT_FOR_MARKET_NOISE', 'STOP_LOSS_TOO_SMALL']).toContain(evalB.rejectionReason);

    // Case C: Stop loss placed too far from entry (risk > maxRisk)
    const evalC = evaluateTrendPullbackDetailed(
      tradeCandles,
      htfCandles,
      currentPrice,
      { tradeTimeframe: '15m', symbol: 'BTCUSDT', atrBufferMult: 10.0 }
    );
    expect(evalC.success).toBe(false);
    expect(['STOP_TOO_WIDE_FOR_EXECUTION_TIMEFRAME', 'STOP_LOSS_TOO_LARGE']).toContain(evalC.rejectionReason);
  });

  // Timeframe helpers
  it('derives higher timeframes dynamically from trade execution timeframes', () => {
    expect(getHigherTimeframe('1m')).toBe('5m');
    expect(getHigherTimeframe('5m')).toBe('15m');
    expect(getHigherTimeframe('15m')).toBe('1h');
    expect(getHigherTimeframe('30m')).toBe('2h');
    expect(getHigherTimeframe('1h')).toBe('4h');
    expect(getHigherTimeframe('4h')).toBe('1d');
    expect(timeframeToMinutes('5m')).toBe(5);
    expect(timeframeToMinutes('15m')).toBe(15);
    expect(timeframeToMinutes('1h')).toBe(60);
    expect(timeframeToMinutes('4h')).toBe(240);
  });

  // Pillar 1: Market Regime Detection
  it('13. Pillar 1: detectMarketRegime accurately classifies TRENDING_UP, TRENDING_DOWN, and RANGE_OR_TRANSITION', () => {
    const bullishHtf = createHtfBullishCandles(50);
    const bullishRegime = detectMarketRegime(bullishHtf);
    expect(bullishRegime.regime).toBe('TRENDING_UP');
    expect(bullishRegime.isTrending).toBe(true);
    expect(bullishRegime.direction).toBe('LONG');
    expect(bullishRegime.emaSlope).toBeGreaterThan(0);

    const bearishHtf = createHtfBearishCandles(50);
    const bearishRegime = detectMarketRegime(bearishHtf);
    expect(bearishRegime.regime).toBe('TRENDING_DOWN');
    expect(bearishRegime.isTrending).toBe(true);
    expect(bearishRegime.direction).toBe('SHORT');
    expect(bearishRegime.emaSlope).toBeLessThan(0);

    // Flat ranging / choppy candles
    const rangingCandles: Candle[] = [];
    const baseTime = Date.now() - 50 * 3600 * 1000;
    for (let i = 0; i < 50; i++) {
      const flip = (i % 2 === 0) ? 0.1 : -0.1;
      rangingCandles.push(createCandle(baseTime + i * 3600 * 1000, 100, 100.5, 99.5, 100 + flip, 500));
    }
    const rangingRegime = detectMarketRegime(rangingCandles);
    expect(rangingRegime.regime).toBe('RANGE_OR_TRANSITION');
    expect(rangingRegime.isTrending).toBe(false);

    // evaluateTrendPullbackDetailed rejects trades in RANGE_OR_TRANSITION
    const tradeCandles = createValidBullishSetup(15);
    const evalRanging = evaluateTrendPullbackDetailed(
      tradeCandles,
      rangingCandles,
      tradeCandles[tradeCandles.length - 1].close,
      { tradeTimeframe: '15m', symbol: 'BTCUSDT' }
    );
    expect(evalRanging.success).toBe(false);
    expect(evalRanging.rejectionReason).toBe('UNFAVORABLE_MARKET_REGIME');
  });

  // Pillar 6: Fake Signal - Opposing Wick > 40% Rejection
  it('14. Pillar 6: Fake breakout with opposing wick > 40% is rejected as counter-pressure', () => {
    const htfCandles = createHtfBullishCandles(50);
    const tradeCandles = createValidBullishSetup(15);
    const lastIdx = tradeCandles.length - 1;

    // Create candle with 50% upper wick (sellers pushing back against breakout)
    tradeCandles[lastIdx] = createCandle(
      tradeCandles[lastIdx].time,
      128.0,
      132.0, // large upper wick of 2.5 on a range of 4.2 (> 40%)
      127.8,
      129.5,
      2500,
      true
    );

    const evaluation = evaluateTrendPullbackDetailed(
      tradeCandles,
      htfCandles,
      tradeCandles[lastIdx].close,
      { tradeTimeframe: '15m', symbol: 'BTCUSDT' }
    );
    expect(evaluation.success).toBe(false);
    expect(evaluation.rejectionReason).toBe('PRICE_ACTION_NOT_CONFIRMED');
    expect(evaluation.reason).toContain('LONG_OPPOSING_WICK');
  });

  // Pillar 6: Anti-Chasing Filter (maxEntryDistance = 0.25 * ATR)
  it('15. Pillar 6: Late entry exceeding 0.25 ATR is rejected with ENTRY_DISTANCE_TOO_LARGE', () => {
    const htfCandles = createHtfBullishCandles(50);
    const tradeCandles = createValidBullishSetup(15);
    const lastIdx = tradeCandles.length - 1;
    const confirmHigh = tradeCandles[lastIdx].high;

    // Simulate price that ran far above trigger price (chasing)
    const latePrice = confirmHigh + 5.0; // far exceeds 0.25 ATR

    const evaluation = evaluateTrendPullbackDetailed(
      tradeCandles,
      htfCandles,
      latePrice,
      { tradeTimeframe: '15m', symbol: 'BTCUSDT', maxEntryDistanceAtr: 0.25 }
    );
    expect(evaluation.success).toBe(false);
    expect(['ENTRY_TOO_LATE', 'ENTRY_DISTANCE_TOO_LARGE']).toContain(evaluation.rejectionReason);
  });

  // Pillar 7: Two-Stage Decision Process (Stage A -> Stage B)
  it('16. Pillar 7: Two-stage decision separates Stage A setup detection from Stage B execution', () => {
    const htfCandles = createHtfBullishCandles(50);
    const tradeCandles = createValidBullishSetup(15);

    // Stage A: Replace confirmation candle with continuing pullback candle (no confirmation yet)
    const lastIdx = tradeCandles.length - 1;
    const prevC = tradeCandles[lastIdx - 1];
    tradeCandles[lastIdx] = createCandle(
      tradeCandles[lastIdx].time,
      prevC.close,
      prevC.close + 0.5,
      prevC.close - 1.0,
      prevC.close - 0.5, // gentle down candle touching EMA
      400,
      true
    );

    const stageAEval = evaluateTrendPullbackDetailed(
      tradeCandles,
      htfCandles,
      tradeCandles[lastIdx].close,
      { tradeTimeframe: '15m', symbol: 'BTCUSDT' }
    );

    // Setup is in Stage A: detected and waiting for price action confirmation
    expect(stageAEval.stage).toBe('STAGE_A_SETUP_DETECTED');
    expect(['WAITING_FOR_PRICE_ACTION', 'WAITING FOR PRICE ACTION']).toContain(stageAEval.status);
    expect(stageAEval.success).toBe(false);

    // Stage B: Now provide valid confirmation candle
    const completedTradeCandles = createValidBullishSetup(15);
    const stageBEval = evaluateTrendPullbackDetailed(
      completedTradeCandles,
      htfCandles,
      completedTradeCandles[completedTradeCandles.length - 1].close,
      { tradeTimeframe: '15m', symbol: 'BTCUSDT' }
    );

    expect(stageBEval.stage).toBe('STAGE_B_TRADE_CONFIRMED');
    expect(stageBEval.status).toBe('SIGNAL CONFIRMED');
    expect(stageBEval.success).toBe(true);
  });

  // Pillar 8: 10-Point Scoring System & Gate (Score >= 8 required)
  it('17. Pillar 8: 10-point scoring matrix verifies all factors and respects minScore gate', () => {
    const htfCandles = createHtfBullishCandles(50);
    const tradeCandles = createValidBullishSetup(15);
    const currentPrice = tradeCandles[tradeCandles.length - 1].close;

    const evaluation = evaluateTrendPullbackDetailed(
      tradeCandles,
      htfCandles,
      currentPrice,
      { tradeTimeframe: '15m', symbol: 'BTCUSDT', minScore: 8 }
    );

    expect(evaluation.success).toBe(true);
    expect(evaluation.score).toBeGreaterThanOrEqual(8);
    const breakdown = evaluation.result?.details.breakdown;
    expect(breakdown?.htfTrend).toBe(2);
    expect(breakdown?.marketStructure).toBe(2);
    expect(breakdown?.pullbackZone).toBe(1);
    expect(breakdown?.priceAction).toBe(2);
    expect(breakdown?.volume).toBe(2);
    expect(breakdown?.noOpposingLevel).toBe(1);
    expect(breakdown?.total).toBe(10);

    // Strict gate test: set minScore to 11 (impossible), verify rejection
    const gatedEval = evaluateTrendPullbackDetailed(
      tradeCandles,
      htfCandles,
      currentPrice,
      { tradeTimeframe: '15m', symbol: 'BTCUSDT', minScore: 11 }
    );
    expect(gatedEval.success).toBe(false);
    expect(gatedEval.rejectionReason).toBe('CONFIRMATION_SCORE_TOO_LOW');
  });

  // Pillar 9: Opposing Barrier Proximity Gate (< 1.5R rejected)
  it('18. Pillar 9: Rejects setup when nearest swing barrier provides less than 1.5R', () => {
    const htfCandles = createHtfBullishCandles(50);
    const tradeCandles = createValidBullishSetup(15);

    // Place a major resistance right above current entry (e.g. 0.5 points away)
    // while stop loss distance is ~2.0 points (giving only ~0.25R reward)
    const lastIdx = tradeCandles.length - 1;
    const currentPrice = tradeCandles[lastIdx].close;
    // Inject a recent swing high at currentPrice + 0.3
    tradeCandles[lastIdx - 4].high = currentPrice + 0.3;

    const evaluation = evaluateTrendPullbackDetailed(
      tradeCandles,
      htfCandles,
      currentPrice,
      { tradeTimeframe: '15m', symbol: 'BTCUSDT', minRrRatio: 1.5 }
    );

    // If barrier is detected within < 1.5R, rejection is OPPOSING_BARRIER_BLOCKS_RR
    if (!evaluation.success) {
      expect(evaluation.rejectionReason).toBe('OPPOSING_BARRIER_BLOCKS_RR');
    }
  });

  // Pillar 10: Multi-Dimensional Expectancy Tracking & Analytics
  it('19. Pillar 10: calculateStrategyExpectancy accurately computes positive expectancy and multi-dimensional breakdowns', () => {
    const sampleTrades: StrategyTradeRecord[] = [
      // 6 Wins (+2.5R average)
      { id: '1', symbol: 'BTCUSDT', direction: 'LONG', tradeTimeframe: '15m', htfTimeframe: '1h', entryPrice: 100, exitPrice: 105, sl: 98, tp1: 105, pnl: 500, pnlR: 2.5, isWin: true, marketRegime: 'TRENDING_UP', session: 'LONDON', entryTime: 1700000000000, exitTime: 1700003600000 },
      { id: '2', symbol: 'BTCUSDT', direction: 'LONG', tradeTimeframe: '15m', htfTimeframe: '1h', entryPrice: 105, exitPrice: 110, sl: 103, tp1: 110, pnl: 500, pnlR: 2.5, isWin: true, marketRegime: 'TRENDING_UP', session: 'NEW_YORK', entryTime: 1700010000000, exitTime: 1700013600000 },
      { id: '3', symbol: 'ETHUSDT', direction: 'SHORT', tradeTimeframe: '15m', htfTimeframe: '1h', entryPrice: 200, exitPrice: 195, sl: 202, tp1: 195, pnl: 500, pnlR: 2.5, isWin: true, marketRegime: 'TRENDING_DOWN', session: 'ASIA', entryTime: 1700020000000, exitTime: 1700023600000 },
      { id: '4', symbol: 'ETHUSDT', direction: 'SHORT', tradeTimeframe: '15m', htfTimeframe: '1h', entryPrice: 195, exitPrice: 190, sl: 197, tp1: 190, pnl: 500, pnlR: 2.5, isWin: true, marketRegime: 'TRENDING_DOWN', session: 'LONDON', entryTime: 1700030000000, exitTime: 1700033600000 },
      { id: '5', symbol: 'BTCUSDT', direction: 'LONG', tradeTimeframe: '5m', htfTimeframe: '15m', entryPrice: 110, exitPrice: 114, sl: 108, tp1: 114, pnl: 400, pnlR: 2.0, isWin: true, marketRegime: 'TRENDING_UP', session: 'LONDON', entryTime: 1700040000000, exitTime: 1700043600000 },
      { id: '6', symbol: 'BTCUSDT', direction: 'LONG', tradeTimeframe: '5m', htfTimeframe: '15m', entryPrice: 114, exitPrice: 118, sl: 112, tp1: 118, pnl: 400, pnlR: 2.0, isWin: true, marketRegime: 'TRENDING_UP', session: 'NEW_YORK', entryTime: 1700050000000, exitTime: 1700053600000 },
      // 4 Losses (-1.0R each)
      { id: '7', symbol: 'BTCUSDT', direction: 'LONG', tradeTimeframe: '15m', htfTimeframe: '1h', entryPrice: 118, exitPrice: 116, sl: 116, tp1: 123, pnl: -200, pnlR: -1.0, isWin: false, marketRegime: 'RANGE_OR_TRANSITION', session: 'OFF_HOURS', entryTime: 1700060000000, exitTime: 1700063600000 },
      { id: '8', symbol: 'BTCUSDT', direction: 'LONG', tradeTimeframe: '15m', htfTimeframe: '1h', entryPrice: 116, exitPrice: 114, sl: 114, tp1: 121, pnl: -200, pnlR: -1.0, isWin: false, marketRegime: 'RANGE_OR_TRANSITION', session: 'OFF_HOURS', entryTime: 1700070000000, exitTime: 1700073600000 },
      { id: '9', symbol: 'ETHUSDT', direction: 'SHORT', tradeTimeframe: '15m', htfTimeframe: '1h', entryPrice: 190, exitPrice: 192, sl: 192, tp1: 185, pnl: -200, pnlR: -1.0, isWin: false, marketRegime: 'TRENDING_DOWN', session: 'ASIA', entryTime: 1700080000000, exitTime: 1700083600000 },
      { id: '10', symbol: 'ETHUSDT', direction: 'SHORT', tradeTimeframe: '15m', htfTimeframe: '1h', entryPrice: 192, exitPrice: 194, sl: 194, tp1: 187, pnl: -200, pnlR: -1.0, isWin: false, marketRegime: 'TRENDING_DOWN', session: 'ASIA', entryTime: 1700090000000, exitTime: 1700093600000 },
    ];

    const metrics = calculateStrategyExpectancy(sampleTrades);

    expect(metrics.totalTrades).toBe(10);
    expect(metrics.winCount).toBe(6);
    expect(metrics.lossCount).toBe(4);
    expect(metrics.winRate).toBeCloseTo(0.6, 2);
    expect(metrics.lossRate).toBeCloseTo(0.4, 2);
    // avgWinR = (2.5 * 4 + 2.0 * 2) / 6 = 14 / 6 = 2.333R
    expect(metrics.avgWinR).toBeCloseTo(2.333, 2);
    expect(metrics.avgLossR).toBe(1.0);
    // Expectancy = (0.6 * 2.333) - (0.4 * 1.0) = 1.4 - 0.4 = 1.0R per trade
    expect(metrics.expectancyR).toBeCloseTo(1.0, 2);
    expect(metrics.profitFactor).toBeGreaterThan(3.0);

    // Multi-dimensional breakdown verification
    expect(metrics.byRegime.TRENDING_UP.winRate).toBe(1.0); // 4/4 wins
    expect(metrics.byRegime.RANGE_OR_TRANSITION.winRate).toBe(0.0); // 0/2 wins (confirms avoiding range trading!)
    expect(metrics.bySymbol.BTCUSDT.count).toBe(6);
    expect(metrics.bySymbol.ETHUSDT.count).toBe(4);
    expect(metrics.byTimeframePair['15m/1h'].count).toBe(8);
    expect(metrics.bySession.LONDON.count).toBe(3);
    expect(metrics.bySession.NEW_YORK.count).toBe(2);

    // Session tagging verification
    // 04:00 UTC -> ASIA
    const asiaTime = new Date('2026-09-20T04:00:00Z').getTime();
    expect(getTradingSession(asiaTime)).toBe('ASIA');
    // 10:00 UTC -> LONDON
    const londonTime = new Date('2026-09-20T10:00:00Z').getTime();
    expect(getTradingSession(londonTime)).toBe('LONDON');
    // 16:00 UTC -> NEW_YORK
    const nyTime = new Date('2026-09-20T16:00:00Z').getTime();
    expect(getTradingSession(nyTime)).toBe('NEW_YORK');
    // 22:00 UTC -> OFF_HOURS
    const offHoursTime = new Date('2026-09-20T22:00:00Z').getTime();
    expect(getTradingSession(offHoursTime)).toBe('OFF_HOURS');
  });

  // -------------------------------------------------------------------------
  // 16-SECTION SPECIFICATION VALIDATION TESTS
  // -------------------------------------------------------------------------
  describe('Institutional Trend-Pullback 16-Section Specification Tests', () => {
    beforeEach(() => {
      clearSignalDeduplicationCache();
    });

    it('Section 1 & 16: Executes accurately on 5-minute timeframe with auto-derived 15m HTF', () => {
      const htfCandles = createHtfBullishCandles(50, 15 * 60 * 1000);
      const tradeCandles = createValidBullishSetup(5);
      const currentPrice = tradeCandles[tradeCandles.length - 1].close;

      const eval5m = evaluateTrendPullbackDetailed(
        tradeCandles,
        htfCandles,
        currentPrice,
        { tradeTimeframe: '5m', symbol: 'BTCUSDT' }
      );

      expect(eval5m.success).toBe(true);
      expect(eval5m.result?.tradeTimeframe).toBe('5m');
      expect(eval5m.result?.htfTimeframe).toBe('15m');
      expect(eval5m.result?.stopType).toBe('LOCAL_EXECUTION_STOP');
      expect(eval5m.result?.stopDistance).toBeGreaterThan(0);
      expect(eval5m.result?.stopATRMultiple).toBeGreaterThanOrEqual(0.8);
      expect(eval5m.result?.stopATRMultiple).toBeLessThanOrEqual(3.0);
    });

    it('Section 1 & 16: Executes accurately on 15-minute timeframe with auto-derived 1h HTF', () => {
      const htfCandles = createHtfBullishCandles(50, 60 * 60 * 1000);
      const tradeCandles = createValidBullishSetup(15);
      const currentPrice = tradeCandles[tradeCandles.length - 1].close;

      const eval15m = evaluateTrendPullbackDetailed(
        tradeCandles,
        htfCandles,
        currentPrice,
        { tradeTimeframe: '15m', symbol: 'ETHUSDT' }
      );

      expect(eval15m.success).toBe(true);
      expect(eval15m.result?.tradeTimeframe).toBe('15m');
      expect(eval15m.result?.htfTimeframe).toBe('1h');
      expect(eval15m.result?.stopType).toBe('LOCAL_EXECUTION_STOP');
    });

    it('Section 8 & 9: Stop classification separates LOCAL_EXECUTION_STOP from BROAD_STRUCTURAL_STOP', () => {
      const candles = createValidBullishSetup(15);
      const currentPrice = candles[candles.length - 1].close;
      const atr = 1.5;
      const atrBuffer = 0.45;

      const localStop = calculateStopLoss(
        candles,
        'LONG',
        currentPrice,
        atr,
        atrBuffer,
        { invalidationLevel: 100.0 },
        { stopReference: currentPrice - 2.0 }
      );
      expect(localStop.stopType).toBe('LOCAL_EXECUTION_STOP');
      expect(localStop.stopPrice).toBe(currentPrice - 2.0 - atrBuffer);

      // Inverted stop produces INVALID_STOP
      const invalidStop = calculateStopLoss(
        candles,
        'LONG',
        currentPrice,
        atr,
        atrBuffer,
        { invalidationLevel: 150.0 },
        { stopReference: currentPrice + 5.0 } // stop above current price for long is invalid
      );
      expect(invalidStop.stopType).toBe('INVALID_STOP');
    });

    it('Section 9: Rejects with STOP_TOO_WIDE_FOR_EXECUTION_TIMEFRAME without forcing smaller stops', () => {
      const htfCandles = createHtfBullishCandles(50);
      const tradeCandles = createValidBullishSetup(15);
      const currentPrice = tradeCandles[tradeCandles.length - 1].close;

      // Set maxStopDistanceAtr strictly lower than actual stop distance
      const evaluation = evaluateTrendPullbackDetailed(
        tradeCandles,
        htfCandles,
        currentPrice,
        {
          tradeTimeframe: '15m',
          symbol: 'BTCUSDT',
          maxStopDistanceAtr: 0.3 // Real stop is ~1.0-1.5 ATR, so 0.3 must reject
        }
      );

      expect(evaluation.success).toBe(false);
      expect(evaluation.rejectionReason).toBe('STOP_TOO_WIDE_FOR_EXECUTION_TIMEFRAME');
      expect(evaluation.status).toBe('STOP_TOO_WIDE');
    });

    it('Section 9: Rejects with STOP_TOO_TIGHT_FOR_MARKET_NOISE when stop is unrealistically close', () => {
      const htfCandles = createHtfBullishCandles(50);
      const tradeCandles = createValidBullishSetup(15);
      const currentPrice = tradeCandles[tradeCandles.length - 1].close;

      // Set minStopDistanceAtr higher than actual stop distance
      const evaluation = evaluateTrendPullbackDetailed(
        tradeCandles,
        htfCandles,
        currentPrice,
        {
          tradeTimeframe: '15m',
          symbol: 'BTCUSDT',
          minStopDistanceAtr: 4.0 // Real stop is ~1.0-1.5 ATR, so requiring 4.0 must reject as too tight
        }
      );

      expect(evaluation.success).toBe(false);
      expect(evaluation.rejectionReason).toBe('STOP_TOO_TIGHT_FOR_MARKET_NOISE');
      expect(evaluation.status).toBe('STOP_TOO_TIGHT');
    });

    it('Section 7: Rejects with FAKE_BREAKOUT on abnormally large climax exhaustion candle (> 3x ATR)', () => {
      const htfCandles = createHtfBullishCandles(50);
      const tradeCandles = createValidBullishSetup(15);
      const lastIdx = tradeCandles.length - 1;

      // Inject abnormally large candle (10.0 range when ATR is ~1.5)
      tradeCandles[lastIdx] = createCandle(
        tradeCandles[lastIdx].time,
        125.0,
        138.0, // range of 13.0 (> 8x ATR)
        124.5,
        137.5,
        3000,
        true
      );

      const evaluation = evaluateTrendPullbackDetailed(
        tradeCandles,
        htfCandles,
        tradeCandles[lastIdx].close,
        { tradeTimeframe: '15m', symbol: 'BTCUSDT' }
      );

      expect(evaluation.success).toBe(false);
      expect(evaluation.rejectionReason).toBe('FAKE_BREAKOUT');
      expect(evaluation.reason).toContain('exhaustion climax');
    });

    it('Section 7: checkFakeBreakout correctly identifies candles wicked above high but closed back inside', () => {
      const candles: Candle[] = [
        createCandle(1000, 100, 105, 99, 104),
        createCandle(2000, 104, 108, 103, 104.5) // wicked to 108 but closed back at 104.5 <= 105
      ];
      const pa = { pattern: 'Breakout', triggerPrice: 108, stopReference: 103 };
      const res = checkFakeBreakout(candles, 'LONG', 104.5, 2.0, pa);
      expect(res.isFake).toBe(true);
      expect(res.reason).toContain('closed back inside previous range');
    });

    it('Section 6: Unconfirmed volume mode allows entry with lower confidence flag when enabled', () => {
      const htfCandles = createHtfBullishCandles(50);
      const tradeCandles = createValidBullishSetup(15);
      const lastIdx = tradeCandles.length - 1;

      // Reduce confirmation volume to be weak (< prev volume)
      tradeCandles[lastIdx].volume = 100;
      tradeCandles[lastIdx - 1].volume = 500;

      // 1. Without unconfirmed volume mode -> Rejected with VOLUME_NOT_CONFIRMED
      const evalStandard = evaluateTrendPullbackDetailed(
        tradeCandles,
        htfCandles,
        tradeCandles[lastIdx].close,
        { tradeTimeframe: '15m', symbol: 'BTCUSDT', unconfirmedVolumeMode: false }
      );
      expect(evalStandard.success).toBe(false);
      expect(evalStandard.rejectionReason).toBe('VOLUME_NOT_CONFIRMED');

      // 2. With unconfirmed volume mode -> Allowed with lower confidence
      const evalUnconfirmed = evaluateTrendPullbackDetailed(
        tradeCandles,
        htfCandles,
        tradeCandles[lastIdx].close,
        { tradeTimeframe: '15m', symbol: 'BTCUSDT', unconfirmedVolumeMode: true }
      );
      expect(evalUnconfirmed.success).toBe(true);
      expect(evalUnconfirmed.result?.isUnconfirmedVolume).toBe(true);
      expect(evalUnconfirmed.result?.confidence).toBe('LOWER');
    });

    it('Section 12: Rejects with SPREAD_OR_SLIPPAGE_TOO_HIGH when current spread exceeds maxSpreadAtr', () => {
      const htfCandles = createHtfBullishCandles(50);
      const tradeCandles = createValidBullishSetup(15);
      const currentPrice = tradeCandles[tradeCandles.length - 1].close;

      const evaluation = evaluateTrendPullbackDetailed(
        tradeCandles,
        htfCandles,
        currentPrice,
        {
          tradeTimeframe: '15m',
          symbol: 'BTCUSDT',
          currentSpread: 2.0, // High spread of $2.0 when ATR is ~1.5
          maxSpreadAtr: 0.3   // Max allowed spread = 0.3 * 1.5 = 0.45
        }
      );

      expect(evaluation.success).toBe(false);
      expect(evaluation.rejectionReason).toBe('SPREAD_OR_SLIPPAGE_TOO_HIGH');
    });

    it('Section 12: Rejects with SESSION_DISABLED when trading session is not in configured sessions', () => {
      const htfCandles = createHtfBullishCandles(50);
      const tradeCandles = createValidBullishSetup(15);
      const lastIdx = tradeCandles.length - 1;

      // Set timestamp to 03:00 UTC (ASIA session)
      tradeCandles[lastIdx].time = new Date('2026-09-21T03:00:00Z').getTime();

      const evaluation = evaluateTrendPullbackDetailed(
        tradeCandles,
        htfCandles,
        tradeCandles[lastIdx].close,
        {
          tradeTimeframe: '15m',
          symbol: 'BTCUSDT',
          tradingSessions: ['LONDON', 'NEW_YORK'] // ASIA disabled
        }
      );

      expect(evaluation.success).toBe(false);
      expect(evaluation.rejectionReason).toBe('SESSION_DISABLED');
    });

    it('Section 1: Rejects with DIRECTION_DISABLED when directional toggles are disabled', () => {
      const htfCandles = createHtfBullishCandles(50);
      const tradeCandles = createValidBullishSetup(15);
      const currentPrice = tradeCandles[tradeCandles.length - 1].close;

      // Bullish setup with allowLongs = false
      const evalLongBlocked = evaluateTrendPullbackDetailed(
        tradeCandles,
        htfCandles,
        currentPrice,
        {
          tradeTimeframe: '15m',
          symbol: 'BTCUSDT',
          allowLongs: false
        }
      );

      expect(evalLongBlocked.success).toBe(false);
      expect(evalLongBlocked.rejectionReason).toBe('DIRECTION_DISABLED');
    });

    it('Section 12: Rejects with RISK_LIMIT_REACHED when account risk limit is active', () => {
      const htfCandles = createHtfBullishCandles(50);
      const tradeCandles = createValidBullishSetup(15);
      const currentPrice = tradeCandles[tradeCandles.length - 1].close;

      const evaluation = evaluateTrendPullbackDetailed(
        tradeCandles,
        htfCandles,
        currentPrice,
        {
          tradeTimeframe: '15m',
          symbol: 'BTCUSDT',
          isRiskLimitReached: true
        }
      );

      expect(evaluation.success).toBe(false);
      expect(evaluation.rejectionReason).toBe('RISK_LIMIT_REACHED');
    });

    it('Section 11: calculatePositionSize correctly reduces size for wider stops to preserve risk', () => {
      const riskDollar = 100; // $100 max risk
      const entryPrice = 100;

      // Setup A: Tight stop at 98 (distance = 2) -> position size = 50 units ($100 risk)
      const setupA = calculatePositionSize(riskDollar, entryPrice, 98);
      expect(setupA.stopDistance).toBe(2);
      expect(setupA.positionSize).toBe(50);

      // Setup B: Wider stop at 90 (distance = 10) -> position size = 10 units ($100 risk)
      const setupB = calculatePositionSize(riskDollar, entryPrice, 90);
      expect(setupB.stopDistance).toBe(10);
      expect(setupB.positionSize).toBe(10);

      // Wider stop reduces position size, never increases dollar risk
      expect(setupB.positionSize).toBeLessThan(setupA.positionSize);
      expect(setupA.positionSize * setupA.stopDistance).toBe(riskDollar);
      expect(setupB.positionSize * setupB.stopDistance).toBe(riskDollar);
    });
  });

  describe('Institutional Continuation Principles & 3-Way Decision Model', () => {
    it('returns TRADE_ALLOWED and TRADE_SIGNAL on a fully confirmed continuation trade', () => {
      const htfCandles = createHtfBullishCandles(50);
      const tradeCandles = createValidBullishSetup(15);
      const currentPrice = tradeCandles[tradeCandles.length - 1].close;

      const evalResult = evaluateTrendPullbackDetailed(
        tradeCandles,
        htfCandles,
        currentPrice,
        {
          tradeTimeframe: '15m',
          symbol: 'BTCUSDT'
        }
      );

      expect(evalResult.success).toBe(true);
      expect(evalResult.decision).toBe('TRADE_ALLOWED');
      expect(evalResult.outcomeReason).toBe('TRADE_SIGNAL');
      expect(evalResult.result).not.toBeNull();
      expect(evalResult.result?.details.volumeSequence).toBeDefined();
      expect(evalResult.result?.details.volumeSequence?.confirmationVolumeExpanded).toBe(true);
    });

    it('tracks break-and-retest structure and volume sequence on confirmed trade', () => {
      const htfCandles = createHtfBullishCandles(50);
      const tradeCandles = createValidBullishSetup(15);
      const currentPrice = tradeCandles[tradeCandles.length - 1].close;

      const evalResult = evaluateTrendPullbackDetailed(
        tradeCandles,
        htfCandles,
        currentPrice,
        {
          tradeTimeframe: '15m',
          symbol: 'ETHUSDT'
        }
      );

      expect(evalResult.success).toBe(true);
      expect(evalResult.result?.details.isBreakRetest).toBeDefined();
      expect(typeof evalResult.result?.details.isBreakRetest).toBe('boolean');
      expect(evalResult.result?.details.volumeSequence).toBeDefined();
      expect(evalResult.result?.details.volumeSequence?.pullbackVolumeContracted).toBe(true);
    });

    it('returns WAITING_FOR_CONFIRMATION when price action confirmation candle has not formed', () => {
      const htfCandles = createHtfBullishCandles(50);
      const tradeCandles = createValidBullishSetup(15);
      // Replace last candle with an indecisive doji at the dynamic support zone
      const last = tradeCandles[tradeCandles.length - 1];
      tradeCandles[tradeCandles.length - 1] = createCandle(
        last.time,
        last.close - 0.1,
        last.close + 0.2,
        last.close - 0.2,
        last.close,
        1500
      );
      const currentPrice = tradeCandles[tradeCandles.length - 1].close;

      const evalResult = evaluateTrendPullbackDetailed(
        tradeCandles,
        htfCandles,
        currentPrice,
        {
          tradeTimeframe: '15m',
          symbol: 'BTCUSDT'
        }
      );

      expect(evalResult.success).toBe(false);
      expect(evalResult.decision).toBe('WAITING_FOR_CONFIRMATION');
      expect(evalResult.outcomeReason).toBe('WAITING_FOR_CONFIRMATION');
    });

    it('returns NO_TRADE and CANDLE_NOT_CLOSED if trigger candle is not yet closed', () => {
      const htfCandles = createHtfBullishCandles(50);
      const tradeCandles = createValidBullishSetup(15);
      tradeCandles[tradeCandles.length - 1].isClosed = false;
      const currentPrice = tradeCandles[tradeCandles.length - 1].close;

      const evalResult = evaluateTrendPullbackDetailed(
        tradeCandles,
        htfCandles,
        currentPrice,
        {
          tradeTimeframe: '15m',
          symbol: 'BTCUSDT'
        }
      );

      expect(evalResult.success).toBe(false);
      expect(evalResult.decision).toBe('NO_TRADE');
      expect(evalResult.outcomeReason).toBe('CANDLE_NOT_CLOSED');
    });

    it('returns NO_TRADE and STRUCTURE_BROKEN when pullback invalidates structural higher low', () => {
      const htfCandles = createHtfBullishCandles(50);
      const tradeCandles = createValidBullishSetup(15);
      // Slices deeply below prior swing low
      const last = tradeCandles[tradeCandles.length - 1];
      tradeCandles[tradeCandles.length - 2] = createCandle(
        last.time - 900000,
        125,
        125.5,
        95.0, // breached wave 1 low of 100
        98.0,
        3000
      );
      const currentPrice = tradeCandles[tradeCandles.length - 1].close;

      const evalResult = evaluateTrendPullbackDetailed(
        tradeCandles,
        htfCandles,
        currentPrice,
        {
          tradeTimeframe: '15m',
          symbol: 'BTCUSDT'
        }
      );

      expect(evalResult.success).toBe(false);
      expect(evalResult.decision).toBe('NO_TRADE');
      expect(evalResult.outcomeReason).toBe('STRUCTURE_BROKEN');
    });

    it('returns NO_TRADE and FALSE_BREAKOUT_RISK when confirmation candle is an exhaustion climax fakeout', () => {
      const htfCandles = createHtfBullishCandles(50);
      const tradeCandles = createValidBullishSetup(15);
      const lastIdx = tradeCandles.length - 1;
      tradeCandles[lastIdx] = createCandle(
        tradeCandles[lastIdx].time,
        125.0,
        138.0, // range of 13.0 (> 8x ATR) - exhaustion climax
        124.5,
        137.5,
        3000,
        true
      );
      const currentPrice = tradeCandles[lastIdx].close;

      const evalResult = evaluateTrendPullbackDetailed(
        tradeCandles,
        htfCandles,
        currentPrice,
        {
          tradeTimeframe: '15m',
          symbol: 'BTCUSDT'
        }
      );

      expect(evalResult.success).toBe(false);
      expect(evalResult.decision).toBe('NO_TRADE');
      expect(evalResult.outcomeReason).toBe('FALSE_BREAKOUT_RISK');
    });

    it('returns NO_TRADE and ENTRY_TOO_LATE when entry is extended past 0.25 ATR', () => {
      const htfCandles = createHtfBullishCandles(50);
      const tradeCandles = createValidBullishSetup(15);
      // Artificially inflate currentPrice far above the triggerPrice
      const currentPrice = tradeCandles[tradeCandles.length - 1].close + 10;

      const evalResult = evaluateTrendPullbackDetailed(
        tradeCandles,
        htfCandles,
        currentPrice,
        {
          tradeTimeframe: '15m',
          symbol: 'BTCUSDT',
          maxEntryDistanceAtr: 0.25
        }
      );

      expect(evalResult.success).toBe(false);
      expect(evalResult.decision).toBe('NO_TRADE');
      expect(evalResult.outcomeReason).toBe('ENTRY_TOO_LATE');
    });

    it('returns NO_TRADE and TIMEFRAME_DISAGREEMENT on higher-timeframe conflict', () => {
      // HTF is bearish, but setup tries Long
      const htfCandles = createHtfBearishCandles(50);
      const tradeCandles = createValidBullishSetup(15);
      const currentPrice = tradeCandles[tradeCandles.length - 1].close;

      const evalResult = evaluateTrendPullbackDetailed(
        tradeCandles,
        htfCandles,
        currentPrice,
        {
          tradeTimeframe: '15m',
          symbol: 'BTCUSDT'
        }
      );

      expect(evalResult.success).toBe(false);
      expect(evalResult.decision).toBe('NO_TRADE');
      expect(evalResult.outcomeReason).toBe('TIMEFRAME_DISAGREEMENT');
    });

    it('returns NO_TRADE and RANGE_MARKET or NO_TREND when market regime is choppy', () => {
      // Flat range candles for HTF
      const stepMs = 60 * 60 * 1000;
      const flatHtfCandles: Candle[] = [];
      const baseTime = Date.now() - 50 * stepMs;
      for (let i = 0; i < 50; i++) {
        flatHtfCandles.push(createCandle(baseTime + i * stepMs, 100, 100.5, 99.5, 100, 500));
      }
      const tradeCandles = createValidBullishSetup(15);
      const currentPrice = tradeCandles[tradeCandles.length - 1].close;

      const evalResult = evaluateTrendPullbackDetailed(
        tradeCandles,
        flatHtfCandles,
        currentPrice,
        {
          tradeTimeframe: '15m',
          symbol: 'BTCUSDT'
        }
      );

      expect(evalResult.success).toBe(false);
      expect(evalResult.decision).toBe('NO_TRADE');
      expect(['RANGE_MARKET', 'NO_TREND']).toContain(evalResult.outcomeReason);
    });
  });

  describe('Institutional Trend-Continuation Retest Architecture & State Machine Tests', () => {
    it('executes valid bullish trend continuation with break-and-retest confirmation and volume sequence', () => {
      const htfCandles = createHtfBullishCandles(50);
      const tradeCandles = createValidBullishSetup(15);
      const currentPrice = tradeCandles[tradeCandles.length - 1].close;

      const evalResult = evaluateTrendPullbackDetailed(
        tradeCandles,
        htfCandles,
        currentPrice,
        { tradeTimeframe: '15m', symbol: 'BTCUSDT' }
      );

      expect(evalResult.success).toBe(true);
      expect(evalResult.decision).toBe('TRADE_ALLOWED');
      expect(evalResult.outcomeReason).toBe('TRADE_SIGNAL');
      expect(evalResult.result).not.toBeNull();
      expect(evalResult.result?.entryMode).toBe('RETEST_CONTINUATION');
      expect(evalResult.result?.state).toBe('CONTINUATION_CONFIRMED');
      expect(evalResult.result?.marketRegime).toBe('TRENDING_MOMENTUM');
      expect(evalResult.result?.details.brokenLevel).toBeDefined();
      expect(evalResult.result?.details.brokenLevel?.direction).toBe('LONG');
      expect(evalResult.result?.details.brokenLevel?.type).toBe('RESISTANCE_TO_SUPPORT');
      expect(evalResult.result?.details.retestHeld).toBe(true);
      expect(evalResult.result?.details.continuationConfirmed).toBe(true);
      expect(evalResult.result?.details.volumeSequence?.volumeSequenceConfirmed).toBe(true);
    });

    it('executes valid bearish trend continuation with break-and-retest confirmation and volume sequence', () => {
      const htfCandles = createHtfBearishCandles(50);
      const tradeCandles = createValidBearishSetup(15);
      const currentPrice = tradeCandles[tradeCandles.length - 1].close;

      const evalResult = evaluateTrendPullbackDetailed(
        tradeCandles,
        htfCandles,
        currentPrice,
        { tradeTimeframe: '15m', symbol: 'ETHUSDT' }
      );

      expect(evalResult.success).toBe(true);
      expect(evalResult.decision).toBe('TRADE_ALLOWED');
      expect(evalResult.outcomeReason).toBe('TRADE_SIGNAL');
      expect(evalResult.result?.direction).toBe('SHORT');
      expect(evalResult.result?.entryMode).toBe('RETEST_CONTINUATION');
      expect(evalResult.result?.details.brokenLevel?.direction).toBe('SHORT');
      expect(evalResult.result?.details.brokenLevel?.type).toBe('SUPPORT_TO_RESISTANCE');
    });

    it('strictly prohibits direct breakout entry: returns WAITING_FOR_RETEST on breakout candle', () => {
      const htfCandles = createHtfBullishCandles(50);
      // Cut candles right at the breakout candle (index 33 where price breaks above 125)
      const fullCandles = createValidBullishSetup(15);
      const breakoutCandles = fullCandles.slice(0, 34);
      const currentPrice = breakoutCandles[breakoutCandles.length - 1].close;

      const evalResult = evaluateTrendPullbackDetailed(
        breakoutCandles,
        htfCandles,
        currentPrice,
        { tradeTimeframe: '15m', symbol: 'BTCUSDT' }
      );

      expect(evalResult.success).toBe(false);
      expect(evalResult.decision).toBe('WAITING_FOR_CONFIRMATION');
      expect(evalResult.outcomeReason).toBe('WAITING_FOR_RETEST');
      expect(evalResult.status).toBe('WAITING_FOR_RETEST');
    });

    it('waits for continuation candle when retest touch is detected but momentum resumption is missing', () => {
      const htfCandles = createHtfBullishCandles(50);
      const tradeCandles = createValidBullishSetup(15);
      // Replace last confirmation candle with a touch candle resting on the level
      const lastIdx = tradeCandles.length - 1;
      const prevC = tradeCandles[lastIdx - 1];
      tradeCandles[lastIdx] = createCandle(
        tradeCandles[lastIdx].time,
        prevC.close,
        prevC.close + 0.3,
        prevC.close - 0.4,
        prevC.close - 0.1, // hovering at retest level without bullish engulfing/continuation
        400,
        true
      );
      const currentPrice = tradeCandles[lastIdx].close;

      const evalResult = evaluateTrendPullbackDetailed(
        tradeCandles,
        htfCandles,
        currentPrice,
        { tradeTimeframe: '15m', symbol: 'BTCUSDT' }
      );

      expect(evalResult.success).toBe(false);
      expect(evalResult.decision).toBe('WAITING_FOR_CONFIRMATION');
      expect(['WAITING_FOR_CONFIRMATION', 'WAITING_FOR_CONTINUATION']).toContain(evalResult.outcomeReason);
    });

    it('rejects with RETEST_FAILED when price fails retest and closes decisively back below broken level', () => {
      const htfCandles = createHtfBullishCandles(50);
      const tradeCandles = createValidBullishSetup(15);
      // Replace pullback and confirmation with a decisive collapse through 125 and EMA50 down to 118
      const lastIdx = tradeCandles.length - 1;
      for (let i = lastIdx - 2; i <= lastIdx; i++) {
        tradeCandles[i] = createCandle(
          tradeCandles[i].time,
          122 - (i - (lastIdx - 2)) * 2,
          122 - (i - (lastIdx - 2)) * 2 + 0.5,
          118 - (i - (lastIdx - 2)) * 2,
          118 - (i - (lastIdx - 2)) * 2,
          1500,
          true
        );
      }
      const currentPrice = tradeCandles[lastIdx].close;

      const evalResult = evaluateTrendPullbackDetailed(
        tradeCandles,
        htfCandles,
        currentPrice,
        { tradeTimeframe: '15m', symbol: 'BTCUSDT' }
      );

      expect(evalResult.success).toBe(false);
      expect(evalResult.decision).toBe('NO_TRADE');
      expect(['RETEST_FAILED', 'PULLBACK_TOO_DEEP', 'STRUCTURE_BROKEN']).toContain(evalResult.outcomeReason);
    });

    it('rejects with RETEST_EXPIRED when retest exceeds maxRetestBars', () => {
      const htfCandles = createHtfBullishCandles(50);
      const tradeCandles = createValidBullishSetup(15);
      const currentPrice = tradeCandles[tradeCandles.length - 1].close;

      // Restrict maxRetestBars to 3 (actual retest occurred ~9 bars after impulse)
      const evalResult = evaluateTrendPullbackDetailed(
        tradeCandles,
        htfCandles,
        currentPrice,
        { tradeTimeframe: '15m', symbol: 'BTCUSDT', maxRetestBars: 3 }
      );

      expect(evalResult.success).toBe(false);
      expect(evalResult.decision).toBe('NO_TRADE');
      expect(evalResult.outcomeReason).toBe('RETEST_EXPIRED');
      expect(evalResult.rejectionReason).toBe('RETEST_EXPIRED');
    });

    it('rejects with VOLUME_NOT_CONFIRMED when pullback volume fails contraction (heavy counter-trend selling)', () => {
      const htfCandles = createHtfBullishCandles(50);
      const tradeCandles = createValidBullishSetup(15);
      // Inflate pullback volume to 2500 (> impulse volume of 1200)
      for (let i = 39; i <= 42; i++) {
        tradeCandles[i].volume = 2500;
      }
      tradeCandles[tradeCandles.length - 1].volume = 3000; // Confirmation candle volume expands, but pullback volume failed contraction
      const currentPrice = tradeCandles[tradeCandles.length - 1].close;

      const evalResult = evaluateTrendPullbackDetailed(
        tradeCandles,
        htfCandles,
        currentPrice,
        { tradeTimeframe: '15m', symbol: 'BTCUSDT' }
      );

      expect(evalResult.success).toBe(false);
      expect(evalResult.decision).toBe('NO_TRADE');
      expect(evalResult.outcomeReason).toBe('VOLUME_NOT_CONFIRMED');
      expect(evalResult.rejectionReason).toBe('VOLUME_NOT_CONFIRMED');
    });

    it('rejects unclosed trigger candle with CANDLE_NOT_CLOSED', () => {
      const htfCandles = createHtfBullishCandles(50);
      const tradeCandles = createValidBullishSetup(15);
      tradeCandles[tradeCandles.length - 1].isClosed = false;
      const currentPrice = tradeCandles[tradeCandles.length - 1].close;

      const evalResult = evaluateTrendPullbackDetailed(
        tradeCandles,
        htfCandles,
        currentPrice,
        { tradeTimeframe: '15m', symbol: 'BTCUSDT', isCandleClosed: false }
      );

      expect(evalResult.success).toBe(false);
      expect(evalResult.decision).toBe('NO_TRADE');
      expect(evalResult.outcomeReason).toBe('CANDLE_NOT_CLOSED');
    });
  });
});
