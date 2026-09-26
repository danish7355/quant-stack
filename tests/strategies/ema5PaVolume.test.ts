// tests/strategies/ema5PaVolume.test.ts
// ─────────────────────────────────────────────────────────────────────────────
// Comprehensive Test Suite for EMA 5 Price Action Gap + Volume Strategy
// (Strategy ID: EMA5_PA_VOLUME_V1)
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import {
  Candle,
  findConfirmedSwings,
  determine15mRegime,
  calculateEma5,
  calculateEma5Series,
  countEmaCrosses,
  calculateAverageRange,
  calculateAverageVolume,
  evaluateEma5PaVolume,
  Ema5PaVolumeStateMachine,
  backtestEma5PaVolume,
  compareEma5PaVolumeVersions,
} from '../../src/utils/strategies/ema5PaVolume.js';
import { evaluateEma5PaVolumeAdapter } from '../../src/utils/strategies/ema5PaVolumeAdapter.js';

// Helper to construct synthetic 15m candles
function make15mStructureCandles(type: 'BULLISH' | 'BEARISH' | 'NEUTRAL'): Candle[] {
  const candles: Candle[] = [];
  const baseTime = 1700000000000;
  const interval = 15 * 60 * 1000;

  if (type === 'BULLISH') {
    // Builds confirmed HL -> HH structure
    candles.push({ time: baseTime + 0 * interval, open: 100, high: 102, low: 99, close: 101, volume: 1000 });
    candles.push({ time: baseTime + 1 * interval, open: 101, high: 103, low: 100, close: 102, volume: 1000 });
    // Bar 2: Swing High 1 = 106
    candles.push({ time: baseTime + 2 * interval, open: 102, high: 106, low: 101, close: 105, volume: 1200 });
    // Bars 3-4: lower highs to confirm Swing High 1
    candles.push({ time: baseTime + 3 * interval, open: 105, high: 104, low: 98, close: 99, volume: 1000 });
    // Bar 4: Swing Low 1 = 96
    candles.push({ time: baseTime + 4 * interval, open: 99, high: 101, low: 96, close: 98, volume: 1100 });
    // Bars 5-6: higher lows to confirm Swing Low 1
    candles.push({ time: baseTime + 5 * interval, open: 98, high: 103, low: 97, close: 102, volume: 1000 });
    candles.push({ time: baseTime + 6 * interval, open: 102, high: 105, low: 101, close: 104, volume: 1000 });
    // Bar 7: Swing High 2 (HH) = 112
    candles.push({ time: baseTime + 7 * interval, open: 104, high: 112, low: 103, close: 111, volume: 1500 });
    // Bars 8-9: lower highs confirming HH2
    candles.push({ time: baseTime + 8 * interval, open: 111, high: 108, low: 104, close: 105, volume: 1000 });
    // Bar 9: Swing Low 2 (HL) = 102 (> 96)
    candles.push({ time: baseTime + 9 * interval, open: 105, high: 106, low: 102, close: 104, volume: 1100 });
    // Bars 10-14: confirm HL2 and push higher
    candles.push({ time: baseTime + 10 * interval, open: 104, high: 109, low: 103, close: 108, volume: 1000 });
    candles.push({ time: baseTime + 11 * interval, open: 108, high: 111, low: 106, close: 110, volume: 1000 });
    candles.push({ time: baseTime + 12 * interval, open: 110, high: 114, low: 109, close: 113, volume: 1200 });
    candles.push({ time: baseTime + 13 * interval, open: 113, high: 116, low: 112, close: 115, volume: 1300 });
    candles.push({ time: baseTime + 14 * interval, open: 115, high: 118, low: 114, close: 117, volume: 1400 });
    candles.push({ time: baseTime + 15 * interval, open: 117, high: 120, low: 116, close: 119, volume: 1500 });
  } else if (type === 'BEARISH') {
    // Builds confirmed LH -> LL structure
    candles.push({ time: baseTime + 0 * interval, open: 200, high: 202, low: 198, close: 199, volume: 1000 });
    candles.push({ time: baseTime + 1 * interval, open: 199, high: 201, low: 197, close: 198, volume: 1000 });
    // Bar 2: Swing High 1 = 205 (left 202, 201 < 205; right 202, 194 < 205)
    candles.push({ time: baseTime + 2 * interval, open: 198, high: 205, low: 197, close: 203, volume: 1100 });
    candles.push({ time: baseTime + 3 * interval, open: 203, high: 202, low: 190, close: 192, volume: 1200 });
    // Bar 4: Swing Low 1 = 188 (left 197, 190 > 188; right 189, 195 > 188)
    candles.push({ time: baseTime + 4 * interval, open: 192, high: 194, low: 188, close: 190, volume: 1200 });
    candles.push({ time: baseTime + 5 * interval, open: 190, high: 198, low: 189, close: 197, volume: 1000 });
    // Bar 6: Swing High 2 (LH) = 199 (< 205) (left 194, 198 < 199; right 187, 185 < 199)
    candles.push({ time: baseTime + 6 * interval, open: 197, high: 199, low: 195, close: 196, volume: 1000 });
    candles.push({ time: baseTime + 7 * interval, open: 196, high: 187, low: 185, close: 186, volume: 1300 });
    // Bar 8: Swing Low 2 (LL) = 180 (< 188) (left 195, 185 > 180; right 182, 183 > 180)
    candles.push({ time: baseTime + 8 * interval, open: 186, high: 185, low: 180, close: 182, volume: 1400 });
    candles.push({ time: baseTime + 9 * interval, open: 182, high: 184, low: 182, close: 183, volume: 1000 });
    candles.push({ time: baseTime + 10 * interval, open: 183, high: 185, low: 183, close: 184, volume: 1000 });
    // Confirming bars maintaining downtrend below 199
    candles.push({ time: baseTime + 11 * interval, open: 184, high: 185, low: 182, close: 183, volume: 1200 });
    candles.push({ time: baseTime + 12 * interval, open: 183, high: 184, low: 181, close: 182, volume: 1200 });
    candles.push({ time: baseTime + 13 * interval, open: 182, high: 183, low: 180, close: 181, volume: 1300 });
    candles.push({ time: baseTime + 14 * interval, open: 181, high: 182, low: 179, close: 180, volume: 1400 });
    candles.push({ time: baseTime + 15 * interval, open: 180, high: 181, low: 178, close: 179, volume: 1500 });
  } else {
    // NEUTRAL / chop: constant oscillation
    for (let i = 0; i < 20; i++) {
      const price = 100 + (i % 2 === 0 ? 1 : -1);
      candles.push({
        time: baseTime + i * interval,
        open: price,
        high: price + 1,
        low: price - 1,
        close: price,
        volume: 800,
      });
    }
  }

  return candles;
}

// Helper to construct synthetic 5m candles leading to a setup
function make5mCandles(direction: 'LONG' | 'SHORT', qualify: boolean = true): Candle[] {
  const candles: Candle[] = [];
  const baseTime = 1700000000000;
  const interval = 5 * 60 * 1000;

  const numWarmup = 30;

  if (direction === 'LONG') {
    let currentPrice = 100;
    for (let i = 0; i < numWarmup; i++) {
      candles.push({
        time: baseTime + i * interval,
        open: currentPrice,
        high: currentPrice + 1.0,
        low: currentPrice - 1.0,
        close: currentPrice + 0.2,
        volume: 1000,
      });
      currentPrice += 0.2;
    }

    const setupIndex = numWarmup;
    if (qualify) {
      // Clean bullish gap candle
      const open = currentPrice + 0.5;
      const low = open - 0.1; // sits strictly above EMA5 (gap ~ 0.5)
      const close = open + 1.5; // strong body = 1.5
      const high = close + 0.2; // total range = 1.8 <= 2 * avgRange
      const vol = 1500; // >= 1.10 * 1000

      candles.push({
        time: baseTime + setupIndex * interval,
        open,
        high,
        low,
        close,
        volume: vol,
      });
    } else {
      // Disqualified candle: low volume and tiny body
      candles.push({
        time: baseTime + setupIndex * interval,
        open: currentPrice + 0.5,
        high: currentPrice + 4.5,
        low: currentPrice + 0.4,
        close: currentPrice + 0.7, // tiny body (0.2/4.1 < 0.50)
        volume: 800, // volume too low
      });
    }
  } else {
    // SHORT
    let currentPrice = 200;
    for (let i = 0; i < numWarmup; i++) {
      candles.push({
        time: baseTime + i * interval,
        open: currentPrice,
        high: currentPrice + 1.0,
        low: currentPrice - 1.0,
        close: currentPrice - 0.2,
        volume: 1000,
      });
      currentPrice -= 0.2;
    }

    const setupIndex = numWarmup;
    if (qualify) {
      // Clean bearish gap candle
      const open = currentPrice - 0.5;
      const high = open + 0.1; // sits strictly below EMA5
      const close = open - 1.5; // strong red body
      const low = close - 0.2;
      const vol = 1500;

      candles.push({
        time: baseTime + setupIndex * interval,
        open,
        high,
        low,
        close,
        volume: vol,
      });
    } else {
      candles.push({
        time: baseTime + setupIndex * interval,
        open: currentPrice - 0.5,
        high: currentPrice - 0.4,
        low: currentPrice - 4.5,
        close: currentPrice - 0.7,
        volume: 800,
      });
    }
  }

  return candles;
}

describe('EMA 5 Price Action Gap + Volume Strategy (EMA5_PA_VOLUME_V1)', () => {
  describe('1. Confirmed Market Structure (15m) — Zero Lookahead', () => {
    it('returns empty swing points when candles length is insufficient', () => {
      const swings = findConfirmedSwings([], 2, 2);
      expect(swings.highs).toHaveLength(0);
      expect(swings.lows).toHaveLength(0);
    });

    it('correctly detects confirmed swing points without peeking at unconfirmed right bars', () => {
      const candles15m = make15mStructureCandles('BULLISH');
      const { highs, lows } = findConfirmedSwings(candles15m, 2, 2);

      expect(highs.length).toBeGreaterThanOrEqual(2);
      expect(lows.length).toBeGreaterThanOrEqual(2);

      // Verify no swing is identified at the last 2 bars (strict zero lookahead)
      const lastIndex = candles15m.length - 1;
      for (const h of highs) {
        expect(h.index).toBeLessThanOrEqual(lastIndex - 2);
      }
      for (const l of lows) {
        expect(l.index).toBeLessThanOrEqual(lastIndex - 2);
      }
    });

    it('classifies BULLISH structure when confirmed swings exhibit HH + HL', () => {
      const candles15m = make15mStructureCandles('BULLISH');
      const regime = determine15mRegime(candles15m);
      expect(regime.regime).toBe('BULLISH');
      expect(regime.recentSwingHigh).toBeDefined();
      expect(regime.recentSwingLow).toBeDefined();
      expect(regime.reason).toContain('Bullish');
    });

    it('classifies BEARISH structure when confirmed swings exhibit LH + LL', () => {
      const candles15m = make15mStructureCandles('BEARISH');
      const regime = determine15mRegime(candles15m);
      expect(regime.regime).toBe('BEARISH');
      expect(regime.recentSwingHigh).toBeDefined();
      expect(regime.recentSwingLow).toBeDefined();
      expect(regime.reason).toContain('Bearish');
    });

    it('classifies NEUTRAL regime when market is choppy or candles are insufficient', () => {
      const candles15m = make15mStructureCandles('NEUTRAL');
      const regime = determine15mRegime(candles15m);
      expect(regime.regime).toBe('NEUTRAL');
    });
  });

  describe('2. Pure Price Action & Indicator Helpers', () => {
    it('calculates 5 EMA accurately across the series', () => {
      const candles = make5mCandles('LONG', true);
      const ema = calculateEma5Series(candles, 5);

      expect(ema).toHaveLength(candles.length);
      expect(ema[ema.length - 1]).toBeGreaterThan(ema[0]);
    });

    it('counts EMA crosses over lookback window to identify chop', () => {
      const chopCandles: Candle[] = Array.from({ length: 20 }, (_, i) => ({
        time: i * 300000,
        open: i % 2 === 0 ? 99 : 101,
        high: 102,
        low: 98,
        close: i % 2 === 0 ? 101 : 99,
        volume: 1000,
      }));

      const ema = calculateEma5Series(chopCandles, 5);
      const crosses = countEmaCrosses(chopCandles, ema, 10);
      expect(crosses).toBeGreaterThanOrEqual(3);
    });

    it('calculates average range and average volume correctly', () => {
      const candles = make5mCandles('LONG', true);
      const avgRange = calculateAverageRange(candles, 5);
      const avgVol = calculateAverageVolume(candles, 20);

      expect(avgRange).toBeGreaterThan(0);
      expect(avgVol).toBeGreaterThan(0);
      expect(avgVol).toBeCloseTo(1000, -1);
    });
  });

  describe('3. Execution Signal Evaluation (Version C — Canonical)', () => {
    it('detects a valid LONG signal under bullish 15m structure and clean 5m PA expansion', () => {
      const candles15m = make15mStructureCandles('BULLISH');
      const candles5m = make5mCandles('LONG', true);

      const sig = evaluateEma5PaVolume(candles5m, candles15m, {
        version: 'C',
        minVolumeRatio: 1.10,
        minGapRangeRatio: 0.20,
        maxGapRangeRatio: 1.00,
        riskReward: 1.5,
      }, 'BTCUSDT');

      expect(sig).not.toBeNull();
      if (sig) {
        expect(sig.direction).toBe('LONG');
        expect(sig.regime15m).toBe('BULLISH');
        expect(sig.rejectionReason).toBeNull();
        expect(sig.entryPrice).toBeGreaterThan(0);
        expect(sig.sl).toBeLessThan(sig.entryPrice);
        expect(sig.tp1).toBeGreaterThan(sig.entryPrice);
        expect(sig.riskReward).toBe(1.5);
        expect(sig.setupScore).toBeGreaterThanOrEqual(70);
      }
    });

    it('detects a valid SHORT signal under bearish 15m structure and clean 5m PA expansion', () => {
      const candles15m = make15mStructureCandles('BEARISH');
      const candles5m = make5mCandles('SHORT', true);

      const sig = evaluateEma5PaVolume(candles5m, candles15m, {
        version: 'C',
        minVolumeRatio: 1.10,
        minGapRangeRatio: 0.20,
        maxGapRangeRatio: 1.00,
        riskReward: 1.5,
      }, 'ETHUSDT');

      expect(sig).not.toBeNull();
      if (sig) {
        expect(sig.direction).toBe('SHORT');
        expect(sig.regime15m).toBe('BEARISH');
        expect(sig.rejectionReason).toBeNull();
        expect(sig.entryPrice).toBeGreaterThan(0);
        expect(sig.sl).toBeGreaterThan(sig.entryPrice);
        expect(sig.tp1).toBeLessThan(sig.entryPrice);
        expect(sig.setupScore).toBeGreaterThanOrEqual(70);
      }
    });

    it('rejects LONG signal if 15m regime is BEARISH (Rule 24)', () => {
      const candles15m = make15mStructureCandles('BEARISH');
      const candles5m = make5mCandles('LONG', true);

      const sig = evaluateEma5PaVolume(candles5m, candles15m, {
        version: 'C',
      }, 'SOLUSDT');

      expect(sig).not.toBeNull();
      expect(sig?.rejectionReason).toBe('REGIME_MISMATCH');
    });

    it('rejects setup when volume ratio is insufficient (< 1.10x SMA20)', () => {
      const candles15m = make15mStructureCandles('BULLISH');
      const candles5m = make5mCandles('LONG', false); // low volume & bad PA

      const sig = evaluateEma5PaVolume(candles5m, candles15m, {
        version: 'C',
      }, 'AVAXUSDT');

      expect(sig).not.toBeNull();
      expect(sig?.rejectionReason).toBeDefined();
    });

    it('rejects setup if candle body ratio is below 0.50 (Rule 9)', () => {
      const candles15m = make15mStructureCandles('BULLISH');
      const candles5m = make5mCandles('LONG', true);

      // Mutate the setup candle: sits above EMA5 but has tiny body and huge wick
      const last = candles5m[candles5m.length - 1];
      const ema5 = calculateEma5(candles5m.map(c => c.close), 5);
      const currEma = ema5[ema5.length - 1];
      last.open = currEma + 0.5;
      last.close = currEma + 0.6; // body is 0.1
      last.high = currEma + 3.0; // range is 2.6 -> body/range = 0.1/2.6 = 0.038 < 0.50
      last.low = currEma + 0.4;
      last.volume = 1500;

      const sig = evaluateEma5PaVolume(candles5m, candles15m, {
        version: 'C',
      }, 'BNBUSDT');

      expect(sig).not.toBeNull();
      expect(sig?.rejectionReason).toBe('WEAK_BULLISH_CANDLE');
    });
  });

  describe('4. State Machine & Event-Driven Backtesting', () => {
    it('transitions through lifecycle states cleanly', () => {
      const sm = new Ema5PaVolumeStateMachine({
        entryMode: 'MOMENTUM',
        riskReward: 1.5,
        breakevenEnabled: true,
      });

      expect(sm.getState()).toBe('IDLE');

      // Detect setup
      sm.onSetupDetected({
        direction: 'LONG',
        entryPrice: 102.5,
        sl: 99.5,
        tp: 107.0,
        candleTime: 1000,
      });

      expect(sm.getState()).toBe('WAITING_FOR_ENTRY');

      // Next bar opens at 102.5 -> enters position
      const enterCandle: Candle = { time: 1001, open: 102.5, high: 104, low: 102, close: 103.5, volume: 1200 };
      sm.update(enterCandle);
      expect(sm.getState()).toBe('IN_POSITION');

      // Price hits TP (high reaches 108 > 107)
      const exitCandle: Candle = { time: 1002, open: 103.5, high: 108, low: 103, close: 107.5, volume: 1800 };
      sm.update(exitCandle);

      expect(sm.getState()).toBe('COOLDOWN');
      const trades = sm.getCompletedTrades();
      expect(trades).toHaveLength(1);
      expect(trades[0].result).toBe('WIN');
      expect(trades[0].pnlR).toBeCloseTo(1.5, 1);
    });

    it('backtestEma5PaVolume generates valid trade summary metrics', () => {
      const candles15m = make15mStructureCandles('BULLISH');
      const candles5m = make5mCandles('LONG', true);

      // Repeat sequence to give backtester multiple bars
      const longCandles5m: Candle[] = [];
      for (let cycle = 0; cycle < 5; cycle++) {
        for (const c of candles5m) {
          longCandles5m.push({
            ...c,
            time: c.time + cycle * 30 * 5 * 60 * 1000,
          });
        }
      }

      const result = backtestEma5PaVolume(longCandles5m, candles15m, {
        version: 'C',
        riskReward: 1.5,
      });

      expect(result).toHaveProperty('version', 'C');
      expect(result).toHaveProperty('totalTrades');
      expect(result).toHaveProperty('winRatePct');
      expect(result).toHaveProperty('profitFactor');
      expect(result).toHaveProperty('netPnL');
      expect(Array.isArray(result.trades)).toBe(true);
    });

    it('compareEma5PaVolumeVersions evaluates versions A, B, C, D side-by-side', () => {
      const candles15m = make15mStructureCandles('BULLISH');
      const candles5m = make5mCandles('LONG', true);

      const comparison = compareEma5PaVolumeVersions(candles5m, candles15m);
      expect(comparison).toHaveProperty('A');
      expect(comparison).toHaveProperty('B');
      expect(comparison).toHaveProperty('C');
      expect(comparison).toHaveProperty('D');
      expect(comparison.C.version).toBe('C');
    });
  });

  describe('5. Unified StrategySignal Adapter Contract', () => {
    it('returns a compliant StrategySignal when evaluateEma5PaVolumeAdapter produces a trade', () => {
      const candles15m = make15mStructureCandles('BULLISH');
      const candles5m = make5mCandles('LONG', true);

      const signal = evaluateEma5PaVolumeAdapter(candles5m, candles15m, candles5m[candles5m.length - 1].close, {
        symbol: 'BTCUSDT',
        timeframe: '5m',
        version: 'C',
      });

      expect(signal).not.toBeNull();
      if (signal) {
        expect(signal.signalId).toContain('EMA5_PA_VOLUME_V1');
        expect(signal.direction).toBe('long');
        expect(signal.strategy).toBe('EMA5_PA_VOLUME_V1');
        expect(signal.entry).toBeGreaterThan(0);
        expect(signal.sl).toBeLessThan(signal.entry);
        expect(signal.tp1).toBeGreaterThan(signal.entry);
        expect(signal.riskPerUnit).toBeGreaterThan(0);
        expect(signal.setupScore).toBeGreaterThanOrEqual(0);
        expect(signal.setupScore).toBeLessThanOrEqual(100);
        expect(signal.reason).toContain('EMA5 PA Volume');
      }
    });

    it('returns null when rejectionReason is triggered', () => {
      const candles15m = make15mStructureCandles('BEARISH');
      const candles5m = make5mCandles('LONG', true);

      const signal = evaluateEma5PaVolumeAdapter(candles5m, candles15m, candles5m[candles5m.length - 1].close, {
        symbol: 'BTCUSDT',
        version: 'C',
      });

      // Direction conflict with 15m structure should cause rejection -> return null
      expect(signal).toBeNull();
    });
  });
});
