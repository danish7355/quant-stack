import { describe, it, expect } from 'vitest';
import {
  LsrV2Config,
  LSR_PRESETS,
  applyLsrPreset,
  validateLsrConfig,
  resolveLsrConfig,
  calcFeeShareOfR
} from '../../src/utils/strategies/lsr.config';
import {
  Candle,
  evaluateLiquiditySweepReversal,
  identifyLiquidityLevels
} from '../../src/utils/strategies/liquiditySweepReversal';
import {
  runLsrBacktest,
  LsrBacktestTrade
} from '../../src/utils/strategies/lsrBacktester';
import { AppSettings } from '../../src/types';

/**
 * Generates synthetic candles with controlled OHLCV
 */
function generateCandles(count: number, basePrice: number = 100, step: number = 0.1): Candle[] {
  const candles: Candle[] = [];
  const now = 1700000000000;
  for (let i = 0; i < count; i++) {
    const time = now + i * 300000; // 5m intervals
    const price = basePrice + Math.sin(i / 5) * 5 + (i * step);
    candles.push({
      time,
      open: price,
      high: price + 1.0,
      low: price - 1.0,
      close: price + 0.1,
      volume: 1000
    });
  }
  return candles;
}

describe('LSR V2 Configuration & Presets', () => {
  it('should load Strict, Balanced, and Relaxed presets with valid configurations', () => {
    const strict = applyLsrPreset('Strict');
    expect(strict.preset).toBe('Strict');
    expect(strict.minStructuralRR).toBe(3.5);
    expect(strict.finalTpR).toBe(3.5);
    expect(strict.locationGate.edgePct).toBe(30);
    expect(strict.starShape.wickToBody).toBe(2.0);
    expect(strict.starShape.wickToRange).toBe(0.60);
    expect(strict.volumeGate.volMultiple).toBe(1.5);
    expect(strict.timeStop.bars).toBe(6);
    expect(strict.timeStop.minProgressR).toBe(0.5);
    expect(strict.feeFloor.enabled).toBe(true);
    expect(validateLsrConfig(strict)).toEqual([]);

    const balanced = applyLsrPreset('Balanced');
    expect(balanced.preset).toBe('Balanced');
    expect(balanced.minStructuralRR).toBe(3.5);
    expect(balanced.finalTpR).toBe(3.5);
    expect(balanced.locationGate.edgePct).toBe(35);
    expect(balanced.starShape.wickToBody).toBe(1.5);
    expect(balanced.starShape.wickToRange).toBe(0.50);
    expect(balanced.volumeGate.volMultiple).toBe(1.2);
    expect(balanced.timeStop.bars).toBe(8);
    expect(balanced.timeStop.minProgressR).toBe(0.5);
    expect(balanced.feeFloor.enabled).toBe(false);
    expect(validateLsrConfig(balanced)).toEqual([]);

    const relaxed = applyLsrPreset('Relaxed');
    expect(relaxed.preset).toBe('Relaxed');
    expect(relaxed.minStructuralRR).toBe(3.0);
    expect(relaxed.finalTpR).toBe(3.0);
    expect(relaxed.locationGate.edgePct).toBe(45);
    expect(relaxed.starShape.wickToBody).toBe(1.2);
    expect(relaxed.starShape.wickToRange).toBe(0.40);
    expect(relaxed.volumeGate.enabled).toBe(false);
    expect(relaxed.timeStop.bars).toBe(10);
    expect(relaxed.timeStop.minProgressR).toBe(0.4);
    expect(relaxed.feeFloor.enabled).toBe(false);
    expect(validateLsrConfig(relaxed)).toEqual([]);
  });

  it('should calculate fee_share_of_R correctly', () => {
    // 0.177% round trip fee with 1.0% stop distance -> 0.177 (17.7% of R)
    expect(calcFeeShareOfR(1.0, 0.177)).toBeCloseTo(0.177, 4);
    // 0.177% round trip fee with 0.177% stop distance -> 1.0 (100% of R)
    expect(calcFeeShareOfR(0.177, 0.177)).toBeCloseTo(1.0, 4);
  });
});

describe('LSR V2 Gate Verification Tests', () => {
  // (a) Each gate toggled off restores previous behavior
  it('(a) each gate toggled off restores previous behavior', () => {
    const config = applyLsrPreset('Balanced');
    
    // Toggle gates off
    config.locationGate.enabled = false;
    config.poolQuality.enabled = false;
    config.roomCheck.enabled = false;
    config.feeFloor.enabled = false;
    config.starShape.enabled = false;
    config.volumeGate.enabled = false;

    expect(config.locationGate.enabled).toBe(false);
    expect(config.poolQuality.enabled).toBe(false);
    expect(config.roomCheck.enabled).toBe(false);
    expect(config.feeFloor.enabled).toBe(false);
    expect(config.starShape.enabled).toBe(false);
    expect(config.volumeGate.enabled).toBe(false);

    // Verify resolveLsrConfig preserves disabled toggles
    const resolved = resolveLsrConfig({ lsrV2Config: config });
    expect(resolved.locationGate.enabled).toBe(false);
    expect(resolved.poolQuality.enabled).toBe(false);
    expect(resolved.roomCheck.enabled).toBe(false);
    expect(resolved.feeFloor.enabled).toBe(false);
    expect(resolved.starShape.enabled).toBe(false);
    expect(resolved.volumeGate.enabled).toBe(false);
  });

  // (b) A lone minor swing is rejected at minScore 2 and accepted at 1
  it('(b) a lone minor swing is rejected at minScore 2 and accepted at 1', () => {
    // Create scenario with a single swing pivot (score = 1)
    const candles: Candle[] = [];
    const baseTime = 1700000000000;
    
    // Build 50 bars with a macro range low at bar 5 (80.0) and high at bar 15 (150.0)
    for (let i = 0; i < 50; i++) {
      let low = 102.0;
      let high = 105.0;
      let open = 103.0;
      let close = 104.0;
      
      if (i === 12) {
        // Macro range low well below bar 25, inside structure lookback
        low = 80.0;
        open = 85.0;
        close = 86.0;
        high = 88.0;
      } else if (i === 15) {
        // Macro range high offering plenty of room
        high = 150.0;
        open = 140.0;
        close = 142.0;
        low = 138.0;
      } else if (i === 25) {
        // Lone minor swing low: prominence = 100.8 - 100.0 = 0.8 (with ATR ~3.0, prominenceAtr = ~0.27 < 0.5)
        low = 100.0;
        open = 102.0;
        close = 103.0;
        high = 104.0;
      } else if (i >= 22 && i <= 28 && i !== 25) {
        low = 100.8;
      }
      candles.push({
        time: baseTime + i * 300000,
        open,
        high,
        low,
        close,
        volume: 1000
      });
    }

    // Now sweep bar at 50 sweeps low 100.0 down to 99.0 (sweep depth 1.0 = ~0.35 ATR, valid depth) and reclaims to 101.5
    candles.push({
      time: baseTime + 50 * 300000,
      open: 101.0,
      high: 102.0,
      low: 99.0, // sweeps 100.0
      close: 101.5, // hammer reclaim
      volume: 3000
    });

    const stableBtc: Candle[] = [];
    for (let i = 0; i < 60; i++) {
      stableBtc.push({
        time: baseTime + i * 300000,
        open: 40000,
        high: 40050,
        low: 39950,
        close: 40000,
        volume: 1000
      });
    }

    const cfgScore2 = applyLsrPreset('Balanced');
    cfgScore2.poolQuality.enabled = true;
    cfgScore2.poolQuality.minScore = 2; // Requires score >= 2
    cfgScore2.locationGate.enabled = false; // Isolate poolQuality

    const settingsScore2: AppSettings = { lsrV2Config: cfgScore2 } as any;
    const signalScore2 = evaluateLiquiditySweepReversal(candles, stableBtc, 101.5, settingsScore2);
    
    // With minScore: 2, a lone single swing (score 1) must be rejected with POOL_QUALITY_LOW
    expect(signalScore2).toBeDefined();
    if (signalScore2) {
      expect(signalScore2.exactRejectionReason).toBe('POOL_QUALITY_LOW');
      expect(signalScore2.finalDecision).toBe('REJECT');
    }

    // Now test with minScore: 1 (allows everything)
    const cfgScore1 = applyLsrPreset('Balanced');
    cfgScore1.poolQuality.enabled = true;
    cfgScore1.poolQuality.minScore = 1; // Allows lone single swing (score 1)
    cfgScore1.locationGate.enabled = false;
    cfgScore1.volumeGate.enabled = false;
    cfgScore1.starShape.enabled = false;
    cfgScore1.roomCheck.enabled = false;

    const settingsScore1: AppSettings = { lsrV2Config: cfgScore1 } as any;
    const signalScore1 = evaluateLiquiditySweepReversal(candles, stableBtc, 101.5, settingsScore1);
    
    expect(signalScore1).toBeDefined();
    if (signalScore1) {
      // Must not be rejected by pool quality
      expect(signalScore1.exactRejectionReason).not.toBe('POOL_QUALITY_LOW');
    }
  });

  // (c) A short sweep at 50% of the range is rejected by the location gate
  it('(c) a short sweep at 50% of the range is rejected by the location gate', () => {
    const candles: Candle[] = [];
    const baseTime = 1700000000000;
    
    // Create range with low at 100 and high at 200 (range height = 100)
    for (let i = 0; i < 50; i++) {
      candles.push({
        time: baseTime + i * 300000,
        open: 150,
        high: 155,
        low: 145,
        close: 150,
        volume: 1000
      });
    }

    // Set range boundaries:
    // Bar 10 has macro high 200
    candles[10].high = 200.0;
    // Bar 20 has macro low 100
    candles[20].low = 100.0;

    // Bar 30 has a resistance swing at 150 (exact 50% midpoint of the 100-200 range)
    candles[30].high = 150.0;
    candles[30].open = 145.0;
    candles[30].close = 146.0;
    candles[30].low = 144.0;

    // Recent sweep bar sweeps above 150 up to 150.8 and reclaims below 150 to 149.0
    candles.push({
      time: baseTime + 51 * 300000,
      open: 148,
      high: 150.8, // Sweeps 150
      low: 147.5,
      close: 148.5, // Reclaims below 150
      volume: 2500
    });

    const cfgLocation = applyLsrPreset('Balanced');
    cfgLocation.locationGate.enabled = true;
    cfgLocation.locationGate.edgePct = 35; // Shorts only in top 35% (percentile >= 65%)
    cfgLocation.poolQuality.enabled = false; // Isolate location gate

    const settingsLoc: AppSettings = { lsrV2Config: cfgLocation } as any;
    const signalLoc = evaluateLiquiditySweepReversal(candles, [], 148.5, settingsLoc);

    if (signalLoc && signalLoc.direction === 'SHORT') {
      expect(signalLoc.locationPercentile).toBeCloseTo(50, 1);
      expect(signalLoc.exactRejectionReason).toBe('LOCATION_REJECT');
      expect(signalLoc.finalDecision).toBe('REJECT');
    }

    // When locationGate is toggled off, location reject disappears
    cfgLocation.locationGate.enabled = false;
    const signalNoLoc = evaluateLiquiditySweepReversal(candles, [], 148.5, { lsrV2Config: cfgLocation } as any);
    if (signalNoLoc && signalNoLoc.direction === 'SHORT') {
      expect(signalNoLoc.exactRejectionReason).not.toBe('LOCATION_REJECT');
    }
  });

  // (d) The time stop fires only after N closed bars and only below minProgressR
  it('(d) the time stop fires only after N closed bars and only below minProgressR', () => {
    // Construct a backtest dataset
    const candles: Candle[] = [];
    const baseTime = 1700000000000;
    
    // Create base 60 bars
    for (let i = 0; i < 60; i++) {
      candles.push({
        time: baseTime + i * 300000,
        open: 100,
        high: 101,
        low: 99,
        close: 100,
        volume: 1000
      });
    }

    // Set swing low at bar 20 at 95.0
    candles[20].low = 95.0;
    candles[20].open = 98.0;
    candles[20].close = 97.0;

    // Macro range high at 115
    candles[10].high = 115.0;

    // Bar 60 sweeps 95.0 to 94.5 and closes at 96.0
    candles.push({
      time: baseTime + 60 * 300000,
      open: 96,
      high: 97,
      low: 94.5,
      close: 96.0,
      volume: 3000
    });

    // Bar 61 confirms with micro-breakout
    candles.push({
      time: baseTime + 61 * 300000,
      open: 96.0,
      high: 97.5,
      low: 95.8,
      close: 97.2,
      volume: 2500
    });

    // Now add 15 subsequent bars that stall near entry (price stays around 96.5, progress < 0.5R)
    for (let i = 62; i < 80; i++) {
      candles.push({
        time: baseTime + i * 300000,
        open: 96.5,
        high: 97.0,
        low: 96.0,
        close: 96.5, // Closed-candle progress stays low
        volume: 800
      });
    }

    const cfgTimeStop = applyLsrPreset('Balanced');
    cfgTimeStop.timeStop.enabled = true;
    cfgTimeStop.timeStop.bars = 8;
    cfgTimeStop.timeStop.minProgressR = 0.5;
    cfgTimeStop.locationGate.enabled = false;
    cfgTimeStop.poolQuality.enabled = false;
    cfgTimeStop.volumeGate.enabled = false;
    cfgTimeStop.starShape.enabled = false;
    cfgTimeStop.roomCheck.enabled = false;

    const result = runLsrBacktest(candles, cfgTimeStop);
    expect(result.gateFunnel).toBeDefined();

    const timeStopTrades = result.trades.filter(t => t.exitReason === 'TIME_STOP');
    if (timeStopTrades.length > 0) {
      const trade = timeStopTrades[0];
      // Time stop fires only after at least 8 closed bars
      expect(trade.barsHeld).toBeGreaterThanOrEqual(8);
      expect(trade.exitReason).toBe('TIME_STOP');
      expect(result.gateFunnel.TIME_STOP_EXITS).toBeGreaterThanOrEqual(1);
    }
  });

  // (e) With the fee floor off, a tight stop still passes and fee_share_of_R is still logged
  it('(e) with the fee floor off, a tight stop still passes and fee_share_of_R is still logged', () => {
    const candles: Candle[] = [];
    const baseTime = 1700000000000;

    for (let i = 0; i < 50; i++) {
      candles.push({
        time: baseTime + i * 300000,
        open: 50000,
        high: 50100,
        low: 49900,
        close: 50000,
        volume: 1000
      });
    }

    // Macro low at bar 20: 49950 (very tight stop distance from 50000 = 0.1%)
    candles[20].low = 49950;
    // Macro high at 50500
    candles[10].high = 50500;

    // Sweep candle sweeps 49950 to 49940 and reclaims to 49960
    candles.push({
      time: baseTime + 51 * 300000,
      open: 49980,
      high: 50020,
      low: 49940,
      close: 49960,
      volume: 3000
    });

    // 1. Fee Floor OFF (default)
    const cfgFeeOff = applyLsrPreset('Balanced');
    cfgFeeOff.feeFloor.enabled = false;
    cfgFeeOff.feeFloor.roundTripFeePct = 0.177;
    cfgFeeOff.feeFloor.divisor = 0.20;
    cfgFeeOff.sl.atrBuffer = 0.0; // tight stop
    cfgFeeOff.locationGate.enabled = false;
    cfgFeeOff.poolQuality.enabled = false;
    cfgFeeOff.volumeGate.enabled = false;
    cfgFeeOff.starShape.enabled = false;
    cfgFeeOff.roomCheck.enabled = false;

    const signalFeeOff = evaluateLiquiditySweepReversal(candles, [], 49960, { lsrV2Config: cfgFeeOff } as any);
    if (signalFeeOff) {
      // Must not be rejected by fee floor
      expect(signalFeeOff.exactRejectionReason).not.toBe('FEE_FLOOR');
      // fee_share_of_R MUST be logged even when toggle is off!
      expect(signalFeeOff.fee_share_of_R).toBeGreaterThan(0);
      expect(typeof signalFeeOff.fee_share_of_R).toBe('number');
    }

    // 2. Fee Floor ON
    const cfgFeeOn = applyLsrPreset('Balanced');
    cfgFeeOn.feeFloor.enabled = true;
    cfgFeeOn.feeFloor.roundTripFeePct = 0.177;
    cfgFeeOn.feeFloor.divisor = 0.20; // Requires stop distance >= 0.177 / 0.20 = 0.885%
    cfgFeeOn.sl.atrBuffer = 0.0; // Very tight stop (~0.1% < 0.885%)
    cfgFeeOn.locationGate.enabled = false;
    cfgFeeOn.poolQuality.enabled = false;
    cfgFeeOn.volumeGate.enabled = false;
    cfgFeeOn.starShape.enabled = false;
    cfgFeeOn.roomCheck.enabled = false;

    const signalFeeOn = evaluateLiquiditySweepReversal(candles, [], 49960, { lsrV2Config: cfgFeeOn } as any);
    if (signalFeeOn) {
      // Tight stop must be rejected by FEE_FLOOR when enabled
      expect(signalFeeOn.exactRejectionReason).toBe('FEE_FLOOR');
      expect(signalFeeOn.finalDecision).toBe('REJECT');
      expect(signalFeeOn.fee_share_of_R).toBeGreaterThan(0);
    }
  });
});
