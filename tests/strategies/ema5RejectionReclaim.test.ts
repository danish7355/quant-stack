import { describe, it, expect, beforeEach } from 'vitest';
import {
  evaluateEma5RejectionReclaim,
  createErrState,
  ErrState,
  ErrConfig,
  DEFAULT_ERR_CONFIG,
  backtestEma5RejectionReclaim,
} from '../../src/utils/strategies/ema5RejectionReclaim';

function makeCandle(open: number, high: number, low: number, close: number, volume = 1000, time = 0) {
  return { time, open, high, low, close, volume };
}

describe('EMA 5 Rejection → Reclaim → Displacement Strategy Engine', () => {
  let state: ErrState;

  beforeEach(() => {
    state = createErrState();
  });

  describe('Initial State & Configuration', () => {
    it('creates default state in IDLE phase', () => {
      expect(state.phase).toBe('IDLE');
      expect(state.rejectionCandleIndex).toBe(-1);
      expect(state.reclaimCandleIndex).toBe(-1);
      expect(state.displacementCandleIndex).toBe(-1);
      expect(state.cooldownRemaining).toBe(0);
    });

    it('has standard default configuration', () => {
      expect(DEFAULT_ERR_CONFIG.emaLength).toBe(5);
      expect(DEFAULT_ERR_CONFIG.minVolumeRatio).toBe(1.10);
      expect(DEFAULT_ERR_CONFIG.minRejectionWickBodyRatio).toBe(1.0);
      expect(DEFAULT_ERR_CONFIG.minDisplacementBodyRatio).toBe(0.50);
      expect(DEFAULT_ERR_CONFIG.minClosePosition).toBe(0.65);
      expect(DEFAULT_ERR_CONFIG.rejectionExpiryCandles).toBe(3);
      expect(DEFAULT_ERR_CONFIG.reclaimExpiryCandles).toBe(2);
      expect(DEFAULT_ERR_CONFIG.allowReclaimAsDisplacement).toBe(false);
    });
  });

  describe('Long Setup Sequence: Approach → Rejection → Reclaim → Displacement → Entry', () => {
    it('executes full sequence without premature entry', () => {
      // 15m bullish structure context candles (higher highs / higher lows)
      const candles15m = [
        makeCandle(95, 98, 94, 97, 5000, 0),
        makeCandle(97, 100, 96, 99, 5000, 900000),
        makeCandle(99, 102, 98, 101, 5000, 1800000),
        makeCandle(101, 105, 100, 104, 5000, 2700000),
      ];

      // 1. Build 25 baseline 5m bars around 100 with volume 1000
      const candles = Array.from({ length: 25 }, (_, i) =>
        makeCandle(100, 101, 99.5, 100.2, 1000, i * 300000)
      );

      // Bar 25: Pullback / Approach downward toward EMA 5
      candles.push(makeCandle(100.2, 100.3, 98.8, 99.0, 1000, 25 * 300000));
      let sig = evaluateEma5RejectionReclaim(candles, candles15m, {}, state, 'BTCUSDT');
      expect(sig).toBeNull();

      // Bar 26: Sweep / Rejection candle
      // Long lower wick: Open 99.0, Low 96.0, High 99.2, Close 98.5
      // Lower wick (2.5) / Body (0.5) = 5.0 >= 1.0. Sweep below EMA5!
      candles.push(makeCandle(99.0, 99.2, 96.0, 98.5, 1200, 26 * 300000));
      sig = evaluateEma5RejectionReclaim(candles, candles15m, {}, state, 'BTCUSDT');
      // Crucial: Must NOT enter immediately on rejection candle!
      expect(sig).toBeNull();
      expect(state.phase).toBe('WAITING_FOR_RECLAIM');
      expect(state.rejectionExtremePrice).toBe(96.0);

      // Bar 27: Reclaim candle (Close > EMA 5)
      candles.push(makeCandle(98.6, 100.0, 98.4, 99.8, 1100, 27 * 300000));
      sig = evaluateEma5RejectionReclaim(candles, candles15m, {}, state, 'BTCUSDT');
      // Crucial: Must NOT enter on reclaim candle! Must wait for distinct displacement
      expect(sig).toBeNull();
      expect(state.phase).toBe('WAITING_FOR_DISPLACEMENT');

      // Bar 28: Displacement candle with volume confirmation
      // Strong bullish body: Open 99.8, High 103.0, Low 99.6, Close 102.8
      // Volume: 1800 (vs 1000 baseline = 1.8x >= 1.10x)
      candles.push(makeCandle(99.8, 103.0, 99.6, 102.8, 1800, 28 * 300000));
      sig = evaluateEma5RejectionReclaim(candles, candles15m, {}, state, 'BTCUSDT');

      // Signal generated on close of displacement candle!
      expect(sig).not.toBeNull();
      expect(sig?.direction).toBe('LONG');
      expect(sig?.entryPrice).toBe(102.8);
      // SL placed beyond rejection extreme (96.0) minus buffer
      expect(sig?.sl).toBeLessThanOrEqual(96.0);
      expect(sig?.tp1).toBeGreaterThan(102.8);
      expect(sig?.strategy).toBe('EMA5_REJECTION_RECLAIM_V1');
      expect(state.phase).toBe('ENTRY_READY');
    });
  });

  describe('Short Setup Sequence: Approach → Rejection → Reclaim → Displacement → Entry', () => {
    it('executes full short sequence without premature entry', () => {
      // 15m bearish structure context candles (lower highs / lower lows)
      const candles15m = [
        makeCandle(105, 106, 103, 104, 5000, 0),
        makeCandle(104, 104.5, 101, 102, 5000, 900000),
        makeCandle(102, 102.5, 99, 100, 5000, 1800000),
        makeCandle(100, 100.5, 96, 97, 5000, 2700000),
      ];

      // 1. Build 25 baseline bars around 100 with volume 1000
      const candles = Array.from({ length: 25 }, (_, i) =>
        makeCandle(100, 100.5, 99.5, 100, 1000, i * 300000)
      );

      // Bar 25: Pullback / Approach upward toward EMA 5
      candles.push(makeCandle(100, 101.5, 99.8, 101.2, 1000, 25 * 300000));
      let sig = evaluateEma5RejectionReclaim(candles, candles15m, {}, state, 'ETHUSDT');
      expect(sig).toBeNull();

      // Bar 26: Sweep / Bearish rejection candle with long upper wick
      // Open: 101.2, High: 104.5, Low: 101.0, Close: 101.8
      candles.push(makeCandle(101.2, 104.5, 101.0, 101.8, 1300, 26 * 300000));
      sig = evaluateEma5RejectionReclaim(candles, candles15m, {}, state, 'ETHUSDT');
      expect(sig).toBeNull();
      expect(state.phase).toBe('WAITING_FOR_RECLAIM');
      expect(state.direction).toBe('SHORT');
      expect(state.rejectionExtremePrice).toBe(104.5);

      // Bar 27: Bearish Reclaim candle (Close < EMA 5)
      candles.push(makeCandle(101.8, 102.0, 99.8, 100.1, 1100, 27 * 300000));
      sig = evaluateEma5RejectionReclaim(candles, candles15m, {}, state, 'ETHUSDT');
      expect(sig).toBeNull();
      expect(state.phase).toBe('WAITING_FOR_DISPLACEMENT');

      // Bar 28: Strong Bearish Displacement candle with volume
      // Open 100.1, High 100.2, Low 97.0, Close 97.2, Volume 1600 >= 1.10x
      candles.push(makeCandle(100.1, 100.2, 97.0, 97.2, 1600, 28 * 300000));
      sig = evaluateEma5RejectionReclaim(candles, candles15m, {}, state, 'ETHUSDT');

      expect(sig).not.toBeNull();
      expect(sig?.direction).toBe('SHORT');
      expect(sig?.entryPrice).toBe(97.2);
      expect(sig?.sl).toBeGreaterThanOrEqual(104.5);
      expect(sig?.tp1).toBeLessThan(97.2);
      expect(state.phase).toBe('ENTRY_READY');
    });
  });

  describe('Fatal Error Prevention & Edge Case Invalidation', () => {
    it('NEVER enters merely because price crosses EMA 5 without prior sweep/rejection', () => {
      const candles = Array.from({ length: 30 }, (_, i) =>
        makeCandle(100, 100.5, 99.5, 100, 1000, i * 300000)
      );

      // Simple EMA crossover without rejection wick
      candles.push(makeCandle(99.8, 102.0, 99.7, 101.9, 1500, 30 * 300000));
      const sig = evaluateEma5RejectionReclaim(candles, [], {}, state);
      expect(sig).toBeNull();
      expect(state.phase).not.toBe('ENTRY_READY');
    });

    it('NEVER enters on the first candle after rejection (must wait for reclaim then displacement)', () => {
      const candles15m = [
        makeCandle(95, 98, 94, 97, 5000, 0),
        makeCandle(97, 100, 96, 99, 5000, 900000),
        makeCandle(99, 102, 98, 101, 5000, 1800000),
      ];
      const candles = Array.from({ length: 25 }, (_, i) =>
        makeCandle(100, 100.5, 99.5, 100, 1000, i * 300000)
      );

      // Rejection candle
      candles.push(makeCandle(100, 100.2, 97.0, 99.5, 1000, 25 * 300000));
      evaluateEma5RejectionReclaim(candles, candles15m, {}, state);
      expect(state.phase).toBe('WAITING_FOR_RECLAIM');

      // Next candle: Even if large green, it only acts as reclaim, NEVER entry
      candles.push(makeCandle(99.5, 103.0, 99.4, 102.8, 2000, 26 * 300000));
      const sig = evaluateEma5RejectionReclaim(candles, candles15m, {}, state);
      expect(sig).toBeNull();
      expect(state.phase).toBe('WAITING_FOR_DISPLACEMENT');
    });

    it('invalidates and resets to IDLE if reclaim does not occur within 3 candles', () => {
      const candles15m = [
        makeCandle(95, 98, 94, 97, 5000, 0),
        makeCandle(97, 100, 96, 99, 5000, 900000),
        makeCandle(99, 102, 98, 101, 5000, 1800000),
      ];
      const candles = Array.from({ length: 25 }, (_, i) =>
        makeCandle(100, 100.5, 99.5, 100, 1000, i * 300000)
      );

      // Rejection candle
      candles.push(makeCandle(100, 100.2, 97.0, 99.5, 1000, 25 * 300000));
      evaluateEma5RejectionReclaim(candles, candles15m, {}, state);
      expect(state.phase).toBe('WAITING_FOR_RECLAIM');

      // Candle 1: Stays below EMA 5
      candles.push(makeCandle(99.5, 99.6, 98.0, 98.2, 1000, 26 * 300000));
      evaluateEma5RejectionReclaim(candles, candles15m, {}, state);
      expect(state.phase).toBe('WAITING_FOR_RECLAIM');

      // Candle 2: Stays below EMA 5
      candles.push(makeCandle(98.2, 98.5, 97.8, 98.0, 1000, 27 * 300000));
      evaluateEma5RejectionReclaim(candles, candles15m, {}, state);
      expect(state.phase).toBe('WAITING_FOR_RECLAIM');

      // Candle 3: Stays below EMA 5 (hits expiry of 3 candles)
      candles.push(makeCandle(98.0, 98.2, 97.5, 97.8, 1000, 28 * 300000));
      evaluateEma5RejectionReclaim(candles, candles15m, {}, state);
      expect(state.phase).toBe('WAITING_FOR_RECLAIM');

      // Candle 4: Exceeded timeout -> Resets
      candles.push(makeCandle(97.8, 98.0, 97.0, 97.2, 1000, 29 * 300000));
      evaluateEma5RejectionReclaim(candles, candles15m, {}, state);
      expect(state.phase).toBe('IDLE');
    });

    it('rejects displacement if volume ratio is below threshold (< 1.10x)', () => {
      const candles15m = [
        makeCandle(95, 98, 94, 97, 5000, 0),
        makeCandle(97, 100, 96, 99, 5000, 900000),
        makeCandle(99, 102, 98, 101, 5000, 1800000),
      ];
      const candles = Array.from({ length: 25 }, (_, i) =>
        makeCandle(100, 100.5, 99.5, 100, 1000, i * 300000)
      );

      // Rejection
      candles.push(makeCandle(100, 100.2, 97.0, 99.5, 1000, 25 * 300000));
      evaluateEma5RejectionReclaim(candles, candles15m, {}, state);

      // Reclaim
      candles.push(makeCandle(99.5, 100.5, 99.4, 100.3, 1000, 26 * 300000));
      evaluateEma5RejectionReclaim(candles, candles15m, {}, state);
      expect(state.phase).toBe('WAITING_FOR_DISPLACEMENT');

      // Low volume displacement candle (volume 600 vs 1000 average = 0.6x)
      candles.push(makeCandle(100.3, 102.5, 100.2, 102.4, 600, 27 * 300000));
      const sig = evaluateEma5RejectionReclaim(candles, candles15m, {}, state);
      expect(sig).toBeNull();
      expect(state.phase).toBe('WAITING_FOR_DISPLACEMENT');
    });

    it('rejects displacement if body ratio is weak (< 50%)', () => {
      const candles15m = [
        makeCandle(95, 98, 94, 97, 5000, 0),
        makeCandle(97, 100, 96, 99, 5000, 900000),
        makeCandle(99, 102, 98, 101, 5000, 1800000),
      ];
      const candles = Array.from({ length: 25 }, (_, i) =>
        makeCandle(100, 100.5, 99.5, 100, 1000, i * 300000)
      );

      // Rejection
      candles.push(makeCandle(100, 100.2, 97.0, 99.5, 1000, 25 * 300000));
      evaluateEma5RejectionReclaim(candles, candles15m, {}, state);

      // Reclaim
      candles.push(makeCandle(99.5, 100.5, 99.4, 100.3, 1000, 26 * 300000));
      evaluateEma5RejectionReclaim(candles, candles15m, {}, state);

      // Doji / spinning top with high volume: Open 100.3, High 103.0, Low 100.0, Close 100.6 (Body = 0.3 / Range 3.0 = 10%)
      candles.push(makeCandle(100.3, 103.0, 100.0, 100.6, 2000, 27 * 300000));
      const sig = evaluateEma5RejectionReclaim(candles, candles15m, {}, state);
      expect(sig).toBeNull();
    });
  });

  describe('A/B/C Backtest Runner', () => {
    it('runs backtest variants A, B, and C cleanly on synthetic data', () => {
      const candles = Array.from({ length: 120 }, (_, i) => {
        const c = 100 + Math.sin(i * 0.2) * 5;
        return makeCandle(c - 0.2, c + 0.8, c - 0.8, c, 1000 + (i % 3) * 200, i * 300000);
      });

      const resA = backtestEma5RejectionReclaim(candles, [], 'A');
      expect(resA).toHaveProperty('version', 'A');
      expect(typeof resA.totalTrades).toBe('number');

      const resB = backtestEma5RejectionReclaim(candles, [], 'B');
      expect(resB).toHaveProperty('version', 'B');

      const resC = backtestEma5RejectionReclaim(candles, [], 'C');
      expect(resC).toHaveProperty('version', 'C');
    });
  });
});
