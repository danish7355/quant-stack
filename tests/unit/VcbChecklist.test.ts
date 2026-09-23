import { describe, it, expect } from 'vitest';
import {
  evaluateVcbChecklist,
  evaluateVcbDetailed,
  VcbChecklistResult,
  Candle,
  BreakoutMetrics,
  CompressionState
} from '../../src/utils/strategies/volatilityCompression';

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

function createHtfBullishCandles(count = 50): Candle[] {
  const candles: Candle[] = [];
  const baseTime = Date.now() - count * 60 * 60 * 1000;
  let price = 100;
  for (let i = 0; i < count; i++) {
    const time = baseTime + i * 3600000;
    const o = price;
    price += 1.0;
    const c = price;
    const h = c + 1.5;
    const l = o - 0.5;
    candles.push(createCandle(time, o, h, l, c, 5000));
  }
  return candles;
}

function createHtfBearishCandles(count = 50): Candle[] {
  const candles: Candle[] = [];
  const baseTime = Date.now() - count * 60 * 60 * 1000;
  let price = 200;
  for (let i = 0; i < count; i++) {
    const time = baseTime + i * 3600000;
    const o = price;
    price -= 1.0;
    const c = price;
    const h = o + 0.5;
    const l = c - 1.5;
    candles.push(createCandle(time, o, h, l, c, 5000));
  }
  return candles;
}

describe('VCB Strategy Final Gate Checklist ("Before Executing a VCB Trade - Quick Checklist")', () => {
  const atr = 2.0;
  const compression: CompressionState = {
    isCompressed: true,
    windowHigh: 105.0,
    windowLow: 98.0,
    microHigh: 104.0,
    microLow: 99.0,
    windowAvgRange: 2.0,
    windowAvgVolume: 1000,
    compressionRatio: 0.70,
    windowRangeToAtrRatio: 3.5,
    isSqueezed: true,
    squeezeCount: 5,
    hasVolumeContraction: true,
    hasPriorImpulse: true,
    priorTrend: 'UPTREND',
    priorImpulseMove: 10.0
  };

  const perfectBreakout: BreakoutMetrics = {
    direction: 'LONG',
    boundaryBreakAtr: 0.15, // within 0.20 ATR (sniper retest)
    rangeExpansion: 1.8,
    volumeExpansion: 2.2,
    rvol: 2.5,
    closeStrength: 0.85,
    closeLocationValue: 0.85,
    bodyDominance: 0.70,
    isSniper: true,
    isPreBlastCoil: true,
    isOverextended: false,
    isWickRejection: false
  };

  // Build 40 execution timeframe candles with a sweep before breakout
  function buildExecutionCandles(direction: 'LONG' | 'SHORT' = 'LONG'): Candle[] {
    const candles: Candle[] = [];
    const baseTime = 1700000000000; // Fixed timestamp
    for (let i = 0; i < 40; i++) {
      const time = baseTime + i * 900000; // 15m intervals
      // Candle 35 sweeps stops below compression.windowLow (98.0) and closes inside
      if (i === 35 && direction === 'LONG') {
        candles.push(createCandle(time, 99.0, 101.0, 97.2, 100.5, 1200)); // Sweeps below 98.0
      } else if (i === 35 && direction === 'SHORT') {
        candles.push(createCandle(time, 104.0, 106.2, 102.5, 103.0, 1200)); // Sweeps above 105.0
      } else {
        candles.push(createCandle(time, 100.0, 103.0, 99.0, 101.5, 1000));
      }
    }
    return candles;
  }

  it('passes all 7 checklist gates with perfect 11/11 score and EXECUTE recommendation', () => {
    const candles = buildExecutionCandles('LONG');
    const htfCandles = createHtfBullishCandles(50);
    const entryPrice = 105.3; // 0.15 ATR above 105
    const sl = 97.0;          // below 98.0
    const tp1 = 122.0;        // ~2R
    const tp2 = 130.0;        // ~3R

    const result: VcbChecklistResult = evaluateVcbChecklist(
      candles,
      htfCandles,
      perfectBreakout,
      compression,
      entryPrice,
      sl,
      tp1,
      tp2,
      atr,
      { vcbChecklistMinScore: 8, vcbMinRrRatio: 2.0 }
    );

    expect(result.passed).toBe(true);
    expect(result.score).toBe(11);
    expect(result.maxScore).toBe(11);
    expect(result.gatePassed).toBe(true);
    expect(result.failedGates).toHaveLength(0);
    expect(result.recommendation).toBe('EXECUTE');
    expect(result.summary).toContain('Execute with confidence');

    // Verify individual items
    const htfItem = result.items.find(i => i.id === 'htf_bias_liquidity');
    expect(htfItem?.passed).toBe(true);
    expect(htfItem?.points).toBe(1);

    const locItem = result.items.find(i => i.id === 'location_discount_premium');
    expect(locItem?.passed).toBe(true);
    expect(locItem?.points).toBe(2);

    const sweepItem = result.items.find(i => i.id === 'liquidity_sweep_inducement');
    expect(sweepItem?.passed).toBe(true);
    expect(sweepItem?.points).toBe(2);

    const shiftItem = result.items.find(i => i.id === 'structure_shift_displacement');
    expect(shiftItem?.passed).toBe(true);
    expect(shiftItem?.points).toBe(2);

    const retestItem = result.items.find(i => i.id === 'retest_entry_zone');
    expect(retestItem?.passed).toBe(true);
    expect(retestItem?.points).toBe(2);

    const rrItem = result.items.find(i => i.id === 'risk_reward_defined');
    expect(rrItem?.passed).toBe(true);
    expect(rrItem?.points).toBe(2);
  });

  it('rejects trade with SKIP recommendation when 2+ key items are missing (Score <= 7)', () => {
    // 1. Candlestick series without any liquidity sweep
    const candles: Candle[] = [];
    for (let i = 0; i < 40; i++) {
      candles.push(createCandle(1700000000000 + i * 900000, 101.0, 103.0, 100.0, 102.0, 1000));
    }
    const htfCandles = createHtfBullishCandles(50);

    // 2. Chasing entry: 0.60 ATR beyond boundary (fails retest zone)
    const chasedBreakout: BreakoutMetrics = {
      ...perfectBreakout,
      boundaryBreakAtr: 0.60 // > 0.42 ATR chasing!
    };
    const compressionNoSqueeze: CompressionState = {
      ...compression,
      isSqueezed: false
    };

    const entryPrice = 106.2;
    const sl = 97.0;
    const tp1 = 120.0;
    const tp2 = 128.0;

    const result = evaluateVcbChecklist(
      candles,
      htfCandles,
      chasedBreakout,
      compressionNoSqueeze,
      entryPrice,
      sl,
      tp1,
      tp2,
      atr,
      { vcbChecklistMinScore: 8, vcbRequireSweep: false, vcbRequireRetest: false }
    );

    // Loses 2 pts for sweep and 2 pts for retest -> Max score is 7/11
    expect(result.score).toBeLessThanOrEqual(7);
    expect(result.passed).toBe(false);
    expect(result.recommendation).toBe('SKIP');
  });

  it('fails mandatory gate when displacement candle has weak body and low volume', () => {
    const candles = buildExecutionCandles('LONG');
    const htfCandles = createHtfBullishCandles(50);

    const weakBreakout: BreakoutMetrics = {
      ...perfectBreakout,
      bodyDominance: 0.30, // weak body (doji/wick)
      closeStrength: 0.50,
      rvol: 0.9,           // low volume drift
      volumeExpansion: 1.0
    };

    const result = evaluateVcbChecklist(
      candles,
      htfCandles,
      weakBreakout,
      compression,
      105.3,
      97.0,
      122.0,
      130.0,
      atr
    );

    expect(result.passed).toBe(false);
    expect(result.gatePassed).toBe(false);
    expect(result.failedGates).toContain('STRUCTURE_DISPLACEMENT');
  });

  it('fails mandatory gate when R:R is below minimum (1.5:1)', () => {
    const candles = buildExecutionCandles('LONG');
    const htfCandles = createHtfBullishCandles(50);

    const entryPrice = 105.0;
    const sl = 100.0; // risk = 5.0
    const tp1 = 106.0; // reward = 1.0 -> R:R = 0.2:1 (insufficient)
    const tp2 = 108.0;

    const result = evaluateVcbChecklist(
      candles,
      htfCandles,
      perfectBreakout,
      compression,
      entryPrice,
      sl,
      tp1,
      tp2,
      atr
    );

    expect(result.passed).toBe(false);
    expect(result.gatePassed).toBe(false);
    expect(result.failedGates).toContain('RISK_REWARD_INSUFFICIENT');
  });

  it('enforces London and NY kill zone session filter when vcbEnforceKillZone is enabled', () => {
    const htfCandles = createHtfBullishCandles(50);

    // Candle at 08:30 UTC (London Open - inside kill zone)
    const londonTime = new Date(Date.UTC(2026, 8, 20, 8, 30, 0)).getTime();
    const londonCandles = buildExecutionCandles('LONG');
    londonCandles[londonCandles.length - 1].time = londonTime;

    const passResult = evaluateVcbChecklist(
      londonCandles,
      htfCandles,
      perfectBreakout,
      compression,
      105.3,
      97.0,
      122.0,
      130.0,
      atr,
      { vcbEnforceKillZone: true }
    );
    expect(passResult.items.find(i => i.id === 'session_news_filter')?.passed).toBe(true);

    // Candle at 22:00 UTC (Dead zone - outside kill zones)
    const deadTime = new Date(Date.UTC(2026, 8, 20, 22, 0, 0)).getTime();
    const deadCandles = buildExecutionCandles('LONG');
    deadCandles[deadCandles.length - 1].time = deadTime;

    const failResult = evaluateVcbChecklist(
      deadCandles,
      htfCandles,
      perfectBreakout,
      compression,
      105.3,
      97.0,
      122.0,
      130.0,
      atr,
      { vcbEnforceKillZone: true }
    );
    expect(failResult.items.find(i => i.id === 'session_news_filter')?.passed).toBe(false);
    expect(failResult.failedGates).toContain('SESSION_KILL_ZONE');
    expect(failResult.passed).toBe(false);
  });

  it('correctly evaluates SHORT breakdown checklist', () => {
    const candles = buildExecutionCandles('SHORT');
    const htfCandles = createHtfBearishCandles(50);

    const shortBreakout: BreakoutMetrics = {
      direction: 'SHORT',
      boundaryBreakAtr: 0.15,
      rangeExpansion: 1.8,
      volumeExpansion: 2.2,
      rvol: 2.2,
      closeStrength: 0.85,
      closeLocationValue: 0.15,
      bodyDominance: 0.70,
      isSniper: true,
      isPreBlastCoil: true,
      isOverextended: false,
      isWickRejection: false
    };

    const shortCompression: CompressionState = {
      ...compression,
      priorTrend: 'DOWNTREND'
    };

    const entryPrice = 97.7; // 0.15 ATR below 98.0
    const sl = 106.0;        // above 105.0
    const tp1 = 81.0;        // ~2R
    const tp2 = 73.0;        // ~3R

    const result = evaluateVcbChecklist(
      candles,
      htfCandles,
      shortBreakout,
      shortCompression,
      entryPrice,
      sl,
      tp1,
      tp2,
      atr,
      { vcbChecklistMinScore: 8 }
    );

    expect(result.passed).toBe(true);
    expect(result.score).toBe(11);
    expect(result.recommendation).toBe('EXECUTE');
    expect(result.items.find(i => i.id === 'htf_bias_liquidity')?.passed).toBe(true);
    expect(result.items.find(i => i.id === 'location_discount_premium')?.passed).toBe(true);
    expect(result.items.find(i => i.id === 'liquidity_sweep_inducement')?.passed).toBe(true);
  });

  it('respects user-customized thresholds in checklist gates', () => {
    const candles = buildExecutionCandles('LONG');
    const htfCandles = createHtfBullishCandles(50);

    // Baseline breakout has body 0.70 and rvol 2.5
    // Set custom strict body requirement 0.75 -> should fail Gate 4
    const strictResult = evaluateVcbChecklist(
      candles,
      htfCandles,
      perfectBreakout,
      compression,
      105.3,
      97.0,
      122.0,
      130.0,
      atr,
      { vcbBodyDominanceMin: 0.75 }
    );
    expect(strictResult.failedGates).toContain('STRUCTURE_DISPLACEMENT');
    expect(strictResult.passed).toBe(false);

    // Set custom strict volume requirement 3.0x -> should fail Gate 0 VCB Regime Filter (rvol 2.5 < 3.0)
    const strictVolResult = evaluateVcbChecklist(
      candles,
      htfCandles,
      perfectBreakout,
      compression,
      105.3,
      97.0,
      122.0,
      130.0,
      atr,
      { vcbBreakoutVolumeMin: 3.0 }
    );
    expect(strictVolResult.failedGates).toContain('VCB_REGIME_FILTER_REJECTED');
    expect(strictVolResult.passed).toBe(false);
  });

  describe('evaluateVcbDetailed 3-way decision taxonomy', () => {
    it('returns NO_TRADE when candle count is insufficient', () => {
      const detailed = evaluateVcbDetailed([]);
      expect(detailed.decision).toBe('NO_TRADE');
      expect(detailed.direction).toBeNull();
      expect(detailed.outcomeReason).toContain('Insufficient candle data');
    });

    it('returns NO_TRADE when market is not compressed', () => {
      // Build 40 wide oscillating candles that exceed compression thresholds
      const wideCandles: Candle[] = [];
      const baseTime = 1700000000000;
      for (let i = 0; i < 40; i++) {
        wideCandles.push(createCandle(baseTime + i * 900000, 100 + i * 2, 115 + i * 2, 90 + i * 2, 105 + i * 2, 1000));
      }
      const detailed = evaluateVcbDetailed(wideCandles);
      expect(detailed.decision).toBe('NO_TRADE');
      expect(detailed.outcomeReason).toContain('not in compression');
    });
  });
});
