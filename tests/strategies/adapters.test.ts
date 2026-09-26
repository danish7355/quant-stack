// tests/strategies/adapters.test.ts
// ─────────────────────────────────────────────────────────────────────────────
// Integration tests for all 9 strategy adapters.
// Verifies that every adapter adheres to the unified StrategySignal contract.
// ─────────────────────────────────────────────────────────────────────────────
import {
  evaluateEmaGapPullbackAdapter,
  evaluateTrendPullbackAdapter,
  evaluateVolatilityCompressionAdapter,
  evaluateEarlyCoilBreakoutAdapter,
  evaluateTwoSidedCoilBreakoutAdapter,
  evaluateMacroRangeAdapter,
  evaluateRangeMeanReversionAdapter,
  evaluateSmcLiquidityAdapter,
  evaluateStrategyRegimeFiltersAdapter,
  evaluateEma5PaVolumeAdapter,
  evaluateTrendPullbackRetestAdapter,
  StrategySignal,
} from '../../src/utils/strategies/index';

function makeTrendingCandles(n = 60, start = 100, step = 0.5) {
  return Array.from({ length: n }, (_, i) => {
    const c = start + i * step;
    return {
      time: i * 60000,
      open: c - 0.2,
      high: c + 0.4,
      low: c - 0.3,
      close: c,
      volume: 1000 + (i % 5) * 100,
    };
  });
}

function makeRangingCandles(n = 60, mid = 100, amplitude = 1) {
  return Array.from({ length: n }, (_, i) => {
    const c = mid + Math.sin(i * 0.4) * amplitude;
    return {
      time: i * 60000,
      open: c - 0.1,
      high: c + 0.3,
      low: c - 0.3,
      close: c,
      volume: 800,
    };
  });
}

function validateSignalShape(signal: StrategySignal) {
  expect(signal).toHaveProperty('signalId');
  expect(typeof signal.signalId).toBe('string');
  expect(['long', 'short']).toContain(signal.direction);
  expect(typeof signal.entry).toBe('number');
  expect(typeof signal.sl).toBe('number');
  expect(typeof signal.tp1).toBe('number');
  expect(typeof signal.tp2).toBe('number');
  expect(typeof signal.riskPerUnit).toBe('number');
  expect(signal.riskPerUnit).toBeGreaterThan(0);
  expect(typeof signal.setupScore).toBe('number');
  expect(signal.setupScore).toBeGreaterThanOrEqual(0);
  expect(signal.setupScore).toBeLessThanOrEqual(100);
  expect(typeof signal.regimeConfidence).toBe('number');
  expect(typeof signal.riskQualityScore).toBe('number');
  expect(typeof signal.strategy).toBe('string');
  expect(typeof signal.reason).toBe('string');
}

describe('Strategy Adapters — Contract Verification', () => {
  const candles = makeTrendingCandles(80);
  const rangeCandles = makeRangingCandles(80);

  test('evaluateEmaGapPullbackAdapter handles candles and returns valid shape or null', () => {
    const sig = evaluateEmaGapPullbackAdapter(candles, candles, candles[candles.length - 1].close, {
      symbol: 'BTCUSDT',
      timeframe: '15m',
    });
    if (sig) validateSignalShape(sig);
    expect(sig === null || typeof sig === 'object').toBe(true);
  });

  test('evaluateTrendPullbackAdapter handles candles and returns valid shape or null', () => {
    const sig = evaluateTrendPullbackAdapter(candles, candles, candles[candles.length - 1].close, {
      symbol: 'ETHUSDT',
      tradeTimeframe: '15m',
    });
    if (sig) validateSignalShape(sig);
    expect(sig === null || typeof sig === 'object').toBe(true);
  });

  test('evaluateVolatilityCompressionAdapter handles candles and returns valid shape or null', () => {
    const sig = evaluateVolatilityCompressionAdapter(rangeCandles, rangeCandles, 100, {
      symbol: 'SOLUSDT',
      timeframe: '15m',
    });
    if (sig) validateSignalShape(sig);
    expect(sig === null || typeof sig === 'object').toBe(true);
  });

  test('evaluateEarlyCoilBreakoutAdapter handles candles and returns valid shape or null', () => {
    const sig = evaluateEarlyCoilBreakoutAdapter(rangeCandles, rangeCandles, 100, {
      symbol: 'AVAXUSDT',
      timeframe: '15m',
    });
    if (sig) validateSignalShape(sig);
    expect(sig === null || typeof sig === 'object').toBe(true);
  });

  test('evaluateTwoSidedCoilBreakoutAdapter handles candles and returns valid shape or null', () => {
    const sig = evaluateTwoSidedCoilBreakoutAdapter(rangeCandles, rangeCandles, 100, {
      symbol: 'BNBUSDT',
      timeframe: '15m',
    });
    if (sig) validateSignalShape(sig);
    expect(sig === null || typeof sig === 'object').toBe(true);
  });

  test('evaluateMacroRangeAdapter handles candles and returns valid shape or null', () => {
    const sig = evaluateMacroRangeAdapter(rangeCandles, rangeCandles, 100, {
      symbol: 'ADAUSDT',
      timeframe: '15m',
      atr: 1.5,
    });
    if (sig) validateSignalShape(sig);
    expect(sig === null || typeof sig === 'object').toBe(true);
  });

  test('evaluateRangeMeanReversionAdapter handles candles and returns valid shape or null', () => {
    const sig = evaluateRangeMeanReversionAdapter(rangeCandles, rangeCandles, 100, {
      symbol: 'DOGEUSDT',
      timeframe: '15m',
    });
    if (sig) validateSignalShape(sig);
    expect(sig === null || typeof sig === 'object').toBe(true);
  });

  test('evaluateSmcLiquidityAdapter handles candles and returns valid shape or null', () => {
    const sig = evaluateSmcLiquidityAdapter(candles, candles, candles[candles.length - 1].close, {
      symbol: 'LINKUSDT',
      timeframe: '15m',
    });
    if (sig) validateSignalShape(sig);
    expect(sig === null || typeof sig === 'object').toBe(true);
  });

  test('evaluateEma5PaVolumeAdapter handles candles and returns valid shape or null', () => {
    const sig = evaluateEma5PaVolumeAdapter(candles, candles, candles[candles.length - 1].close, {
      symbol: 'BTCUSDT',
      timeframe: '5m',
    });
    if (sig) validateSignalShape(sig);
    expect(sig === null || typeof sig === 'object').toBe(true);
  });

  test('evaluateTrendPullbackRetestAdapter handles candles and returns valid shape or null', () => {
    const sig = evaluateTrendPullbackRetestAdapter(candles, candles, candles[candles.length - 1].close, {
      symbol: 'ETHUSDT',
      timeframe: '15m',
    });
    if (sig) validateSignalShape(sig);
    expect(sig === null || typeof sig === 'object').toBe(true);
  });

  test('evaluateStrategyRegimeFiltersAdapter returns MarketContext', () => {
    const res = evaluateStrategyRegimeFiltersAdapter(candles, candles);
    expect(res).toHaveProperty('context');
    expect(['trend', 'range', 'neutral']).toContain(res.context.regime);
    expect(['bullish', 'bearish', 'mixed']).toContain(res.context.trendDirection);
  });
});
