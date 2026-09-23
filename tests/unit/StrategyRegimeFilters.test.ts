/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  allowVCB,
  allowSMCLiquidity,
  allowEMAMeanReversion,
  allowTrendPullback,
  VcbRegimeMetrics,
  SmcRegimeMetrics,
  EmaMeanReversionRegimeMetrics,
  TrendPullbackRegimeMetrics,
  StrategyRegimeTracker,
  evaluateMasterRegimeDecision,
  extractVcbRegimeMetrics,
  extractSmcRegimeMetrics,
  extractEmaMeanReversionRegimeMetrics,
  extractTrendPullbackRegimeMetrics
} from '../../src/utils/strategies/strategyRegimeFilters';

describe('Strategy Dedicated Regime Filters & Master Decision Engine', () => {
  let tracker: StrategyRegimeTracker;

  beforeEach(() => {
    tracker = new StrategyRegimeTracker();
  });

  // =========================================================================
  // 1. VCB REGIME FILTER
  // =========================================================================
  describe('1. VCB Regime Filter (allowVCB)', () => {
    const validVcbLong: VcbRegimeMetrics = {
      wasCompressed: true,
      volumeRatio: 1.8,
      atr: 2.2,
      atrMovingAverage: 1.8,
      breakoutConfirmed: true,
      extremeVolatility: false,
      breakoutIntoMajorLevel: false,
      close: 105,
      rangeHigh: 100,
      rangeLow: 90,
      closeLocation: 0.85,
      htfBias: 'BULLISH'
    };

    const validVcbShort: VcbRegimeMetrics = {
      wasCompressed: true,
      volumeRatio: 1.9,
      atr: 2.1,
      atrMovingAverage: 1.7,
      breakoutConfirmed: true,
      extremeVolatility: false,
      breakoutIntoMajorLevel: false,
      close: 88,
      rangeHigh: 100,
      rangeLow: 90,
      closeLocation: 0.15,
      htfBias: 'BEARISH'
    };

    it('allows valid VCB Long when all compression, expansion, and close conditions pass', () => {
      expect(allowVCB(validVcbLong, 'LONG')).toBe(true);
    });

    it('allows valid VCB Short when close breaks below range with lower 30% close', () => {
      expect(allowVCB(validVcbShort, 'SHORT')).toBe(true);
    });

    it('rejects VCB if prior compression was absent', () => {
      expect(allowVCB({ ...validVcbLong, wasCompressed: false }, 'LONG')).toBe(false);
    });

    it('rejects VCB if volume expansion is below 1.5x threshold', () => {
      expect(allowVCB({ ...validVcbLong, volumeRatio: 1.4 }, 'LONG')).toBe(false);
    });

    it('rejects VCB if ATR is not expanding above moving average', () => {
      expect(allowVCB({ ...validVcbLong, atr: 1.5, atrMovingAverage: 1.8 }, 'LONG')).toBe(false);
    });

    it('rejects VCB Long if close does not exceed range high', () => {
      expect(allowVCB({ ...validVcbLong, close: 99.5, rangeHigh: 100 }, 'LONG')).toBe(false);
    });

    it('rejects VCB Long if close location is not in upper 30% of range (closeLocation < 0.70)', () => {
      expect(allowVCB({ ...validVcbLong, closeLocation: 0.65 }, 'LONG')).toBe(false);
    });

    it('rejects VCB Short if close location is not in lower 30% of range (closeLocation > 0.30)', () => {
      expect(allowVCB({ ...validVcbShort, closeLocation: 0.35 }, 'SHORT')).toBe(false);
    });

    it('rejects VCB during extreme volatility climax bars', () => {
      expect(allowVCB({ ...validVcbLong, extremeVolatility: true }, 'LONG')).toBe(false);
    });

    it('rejects VCB if breakout is directly into major higher timeframe resistance', () => {
      expect(allowVCB({ ...validVcbLong, breakoutIntoMajorLevel: true }, 'LONG')).toBe(false);
    });

    it('rejects VCB Long if HTF bias is bearish', () => {
      expect(allowVCB({ ...validVcbLong, htfBias: 'BEARISH' }, 'LONG')).toBe(false);
    });

    it('allows VCB Long when HTF bias is neutral', () => {
      expect(allowVCB({ ...validVcbLong, htfBias: 'NEUTRAL' }, 'LONG')).toBe(true);
    });

    it('rejects VCB Long if entry timeframe ADX is below threshold (< 20)', () => {
      expect(allowVCB({ ...validVcbLong, adx: 17 }, 'LONG')).toBe(false);
      expect(allowVCB({ ...validVcbLong, adx: 25 }, 'LONG')).toBe(true);
    });

    it('rejects VCB if candle real body is less than 60% of candle range', () => {
      expect(allowVCB({ ...validVcbLong, bodyRatio: 0.45 }, 'LONG')).toBe(false);
      expect(allowVCB({ ...validVcbLong, bodyRatio: 0.72 }, 'LONG')).toBe(true);
    });

    it('rejects VCB Long if RSI momentum is not sufficiently bullish (< 55)', () => {
      expect(allowVCB({ ...validVcbLong, rsi: 48 }, 'LONG')).toBe(false);
      expect(allowVCB({ ...validVcbLong, rsi: 62 }, 'LONG')).toBe(true);
    });

    it('rejects VCB Short if RSI momentum is not sufficiently bearish (> 45)', () => {
      expect(allowVCB({ ...validVcbShort, rsi: 52 }, 'SHORT')).toBe(false);
      expect(allowVCB({ ...validVcbShort, rsi: 38 }, 'SHORT')).toBe(true);
    });

    it('rejects VCB if HTF ADX indicates non-trending chop (< 20)', () => {
      expect(allowVCB({ ...validVcbLong, htfAdx: 14 }, 'LONG')).toBe(false);
      expect(allowVCB({ ...validVcbLong, htfAdx: 28 }, 'LONG')).toBe(true);
    });

    it('enforces HTF structure when requireHtfStructure is enabled', () => {
      expect(allowVCB({ ...validVcbLong, requireHtfStructure: true, htfStructure: 'LH_LL' }, 'LONG')).toBe(false);
      expect(allowVCB({ ...validVcbLong, requireHtfStructure: true, htfStructure: 'HH_HL' }, 'LONG')).toBe(true);
      expect(allowVCB({ ...validVcbShort, requireHtfStructure: true, htfStructure: 'HH_HL' }, 'SHORT')).toBe(false);
      expect(allowVCB({ ...validVcbShort, requireHtfStructure: true, htfStructure: 'LH_LL' }, 'SHORT')).toBe(true);
    });

    it('enforces retest or follow-through requirement when enabled', () => {
      const baseWithReq = { ...validVcbLong, requireRetestOrFollowThrough: true };
      expect(allowVCB({ ...baseWithReq, retestConfirmed: false, followThroughConfirmed: false }, 'LONG')).toBe(false);
      expect(allowVCB({ ...baseWithReq, retestConfirmed: true, followThroughConfirmed: false }, 'LONG')).toBe(true);
      expect(allowVCB({ ...baseWithReq, retestConfirmed: false, followThroughConfirmed: true }, 'LONG')).toBe(true);
    });

    it('rejects trade outside active session kill zones when sessionAllowed is false', () => {
      expect(allowVCB({ ...validVcbLong, sessionAllowed: false }, 'LONG')).toBe(false);
      expect(allowVCB({ ...validVcbLong, sessionAllowed: true }, 'LONG')).toBe(true);
    });

    it('respects user-customized threshold overrides', () => {
      // With custom lower threshold, 1.3x volume passes
      expect(allowVCB({ ...validVcbLong, volumeRatio: 1.3, minVolumeRatio: 1.25 }, 'LONG')).toBe(true);
      // With custom higher threshold, 1.6x volume is rejected
      expect(allowVCB({ ...validVcbLong, volumeRatio: 1.6, minVolumeRatio: 1.8 }, 'LONG')).toBe(false);
      // Custom body dominance
      expect(allowVCB({ ...validVcbLong, bodyRatio: 0.50, minBodyRatio: 0.45 }, 'LONG')).toBe(true);
      // Custom ATR ratio
      expect(allowVCB({ ...validVcbLong, atrRatio: 1.15, minAtrRatio: 1.10 }, 'LONG')).toBe(true);
    });
  });

  // =========================================================================
  // 2. SMC LIQUIDITY REGIME FILTER
  // =========================================================================
  describe('2. SMC Liquidity Regime Filter (allowSMCLiquidity)', () => {
    const validSmcLong: SmcRegimeMetrics = {
      clearLiquidityPool: true,
      sweepDetected: true,
      rejectionClose: true,
      mssConfirmed: true,
      displacementConfirmed: true,
      fvgConfirmed: true,
      rewardRisk: 2.2,
      extremeVolatility: false,
      middleOfRange: false,
      sweptLevelType: 'EQUAL_LOWS',
      sweptLevel: 98.0,
      close: 99.5,
      htfBias: 'BULLISH',
      intoMajorResistance: false,
      intoMajorSupport: false
    };

    const validSmcShort: SmcRegimeMetrics = {
      clearLiquidityPool: true,
      sweepDetected: true,
      rejectionClose: true,
      mssConfirmed: true,
      displacementConfirmed: true,
      fvgConfirmed: true,
      rewardRisk: 2.5,
      extremeVolatility: false,
      middleOfRange: false,
      sweptLevelType: 'PREVIOUS_DAY_HIGH',
      sweptLevel: 105.0,
      close: 103.5,
      htfBias: 'BEARISH',
      intoMajorResistance: false,
      intoMajorSupport: false
    };

    it('allows valid SMC Long on sweep of equal lows with MSS and FVG displacement', () => {
      expect(allowSMCLiquidity(validSmcLong, 'LONG')).toBe(true);
    });

    it('allows valid SMC Short on sweep of PDH with rejection and room to target', () => {
      expect(allowSMCLiquidity(validSmcShort, 'SHORT')).toBe(true);
    });

    it('rejects SMC trade if no clear liquidity pool was swept', () => {
      expect(allowSMCLiquidity({ ...validSmcLong, clearLiquidityPool: false }, 'LONG')).toBe(false);
    });

    it('rejects SMC trade if candle did not reject or close back across swept level', () => {
      expect(allowSMCLiquidity({ ...validSmcLong, rejectionClose: false }, 'LONG')).toBe(false);
    });

    it('rejects SMC trade if lower timeframe MSS did not confirm', () => {
      expect(allowSMCLiquidity({ ...validSmcLong, mssConfirmed: false }, 'LONG')).toBe(false);
    });

    it('rejects SMC trade if displacement was absent', () => {
      expect(allowSMCLiquidity({ ...validSmcLong, displacementConfirmed: false }, 'LONG')).toBe(false);
    });

    it('rejects SMC trade if no FVG was left in the displacement leg', () => {
      expect(allowSMCLiquidity({ ...validSmcLong, fvgConfirmed: false }, 'LONG')).toBe(false);
    });

    it('rejects SMC trade if reward-to-risk to opposing liquidity is < 1.5R', () => {
      expect(allowSMCLiquidity({ ...validSmcLong, rewardRisk: 1.2 }, 'LONG')).toBe(false);
    });

    it('rejects SMC trade occurring in the middle of a range', () => {
      expect(allowSMCLiquidity({ ...validSmcLong, middleOfRange: true }, 'LONG')).toBe(false);
    });

    it('rejects SMC Long trade if entry is directly below major HTF resistance', () => {
      expect(allowSMCLiquidity({ ...validSmcLong, intoMajorResistance: true }, 'LONG')).toBe(false);
    });
  });

  // =========================================================================
  // 3. EMA MEAN REVERSION REGIME FILTER
  // =========================================================================
  describe('3. EMA Mean Reversion Regime Filter (allowEMAMeanReversion)', () => {
    const validEmaMrLong: EmaMeanReversionRegimeMetrics = {
      adx15: 18,
      ema20Slope15: 0.008,
      emaCrosses: 4,
      distanceFromEmaAtr: 1.4,
      volumeRatio: 1.1,
      strongHTFTrend: false,
      recentBreakout: false,
      priceBelowEma20: true,
      priceAboveEma20: false,
      reversalUp: true,
      reversalDown: false
    };

    const validEmaMrShort: EmaMeanReversionRegimeMetrics = {
      adx15: 16,
      ema20Slope15: -0.005,
      emaCrosses: 5,
      distanceFromEmaAtr: 1.3,
      volumeRatio: 1.0,
      strongHTFTrend: false,
      recentBreakout: false,
      priceBelowEma20: false,
      priceAboveEma20: true,
      reversalUp: false,
      reversalDown: true
    };

    it('allows valid EMA Mean Reversion Long in flat chop with 1.4 ATR deviation', () => {
      expect(allowEMAMeanReversion(validEmaMrLong, 'LONG')).toBe(true);
    });

    it('allows valid EMA Mean Reversion Short when price is 1.3 ATR above flat EMA20', () => {
      expect(allowEMAMeanReversion(validEmaMrShort, 'SHORT')).toBe(true);
    });

    it('rejects EMA Mean Reversion when ADX >= 22 (trend developing)', () => {
      expect(allowEMAMeanReversion({ ...validEmaMrLong, adx15: 23 }, 'LONG')).toBe(false);
    });

    it('rejects EMA Mean Reversion when EMA slope is steep (acting as trend guide, not magnet)', () => {
      expect(allowEMAMeanReversion({ ...validEmaMrLong, ema20Slope15: 0.05 }, 'LONG')).toBe(false);
    });

    it('rejects EMA Mean Reversion when price has crossed EMA fewer than 3 times', () => {
      expect(allowEMAMeanReversion({ ...validEmaMrLong, emaCrosses: 2 }, 'LONG')).toBe(false);
    });

    it('rejects EMA Mean Reversion when deviation is too tight (< 0.8 ATR)', () => {
      expect(allowEMAMeanReversion({ ...validEmaMrLong, distanceFromEmaAtr: 0.5 }, 'LONG')).toBe(false);
    });

    it('rejects EMA Mean Reversion when deviation is overextended (> 2.0 ATR runaway move)', () => {
      expect(allowEMAMeanReversion({ ...validEmaMrLong, distanceFromEmaAtr: 2.4 }, 'LONG')).toBe(false);
    });

    it('rejects EMA Mean Reversion on strong volume expansion (volumeRatio >= 1.5)', () => {
      expect(allowEMAMeanReversion({ ...validEmaMrLong, volumeRatio: 1.7 }, 'LONG')).toBe(false);
    });

    it('rejects EMA Mean Reversion when higher timeframe trend is strong', () => {
      expect(allowEMAMeanReversion({ ...validEmaMrLong, strongHTFTrend: true }, 'LONG')).toBe(false);
    });
  });

  // =========================================================================
  // 4. TREND PULLBACK REGIME FILTER
  // =========================================================================
  describe('4. Trend Pullback Regime Filter (allowTrendPullback)', () => {
    const validTrendLong: TrendPullbackRegimeMetrics = {
      adx15: 28,
      adxRisingOrStable: true,
      pullbackVolume: 750,
      impulseVolume: 1400,
      structureBroken: false,
      timeframeConflict: false,
      diPlus: 28,
      diMinus: 14,
      ema20: 104,
      ema50: 100,
      ema50Slope: 0.04,
      htfBias: 'BULLISH',
      higherHighHigherLow: true,
      lowerHighLowerLow: false,
      pullbackHeldStructure: true
    };

    const validTrendShort: TrendPullbackRegimeMetrics = {
      adx15: 31,
      adxRisingOrStable: true,
      pullbackVolume: 600,
      impulseVolume: 1200,
      structureBroken: false,
      timeframeConflict: false,
      diPlus: 12,
      diMinus: 30,
      ema20: 96,
      ema50: 100,
      ema50Slope: -0.04,
      htfBias: 'BEARISH',
      higherHighHigherLow: false,
      lowerHighLowerLow: true,
      pullbackHeldStructure: true
    };

    it('allows valid Trend Pullback Long in established bullish trend with light pullback volume', () => {
      expect(allowTrendPullback(validTrendLong, 'LONG')).toBe(true);
    });

    it('allows valid Trend Pullback Short in established bearish trend with negative EMA slope', () => {
      expect(allowTrendPullback(validTrendShort, 'SHORT')).toBe(true);
    });

    it('rejects Trend Pullback when ADX < 25 (insufficient trend momentum)', () => {
      expect(allowTrendPullback({ ...validTrendLong, adx15: 22 }, 'LONG')).toBe(false);
    });

    it('rejects Trend Pullback when ADX is falling sharply', () => {
      expect(allowTrendPullback({ ...validTrendLong, adxRisingOrStable: false }, 'LONG')).toBe(false);
    });

    it('rejects Trend Pullback when pullback volume exceeds impulse volume (aggressive counter-trend pressure)', () => {
      expect(allowTrendPullback({ ...validTrendLong, pullbackVolume: 1600, impulseVolume: 1200 }, 'LONG')).toBe(false);
    });

    it('rejects Trend Pullback when market structure was broken (invalidated higher low)', () => {
      expect(allowTrendPullback({ ...validTrendLong, structureBroken: true }, 'LONG')).toBe(false);
    });

    it('rejects Trend Pullback when higher timeframe conflicts with execution direction', () => {
      expect(allowTrendPullback({ ...validTrendLong, timeframeConflict: true }, 'LONG')).toBe(false);
    });

    it('rejects Trend Pullback Long when -DI > +DI', () => {
      expect(allowTrendPullback({ ...validTrendLong, diPlus: 15, diMinus: 25 }, 'LONG')).toBe(false);
    });

    it('rejects Trend Pullback Long when EMA50 slope is flat or negative', () => {
      expect(allowTrendPullback({ ...validTrendLong, ema50Slope: 0.005 }, 'LONG')).toBe(false);
    });
  });

  // =========================================================================
  // 5. MASTER DECISION ENGINE & CONFLICT RESOLUTION
  // =========================================================================
  describe('5. Master Decision Engine & Conflict Resolution', () => {
    it('outputs explicit NO_TRADE state when no strategy filters match', () => {
      const decision = evaluateMasterRegimeDecision([], null, {
        tracker,
        vcbMetrics: { wasCompressed: false },
        smcMetrics: { clearLiquidityPool: false },
        emaMrMetrics: { adx15: 35 },
        trendMetrics: { adx15: 15 }
      });

      expect(decision.rawCandidateState).toBe('NO_TRADE');
      expect(decision.state).toBe('NO_TRADE');
      expect(decision.direction).toBe('NONE');
      expect(decision.hasConflict).toBe(false);
    });

    it('detects directional conflict and forces immediate NO_TRADE state', () => {
      // Mock Trend Pullback LONG active alongside EMA Mean Reversion SHORT active
      const decision = evaluateMasterRegimeDecision([], null, {
        tracker,
        trendMetrics: {
          adx15: 28,
          adxRisingOrStable: true,
          pullbackVolume: 700,
          impulseVolume: 1400,
          structureBroken: false,
          timeframeConflict: false,
          diPlus: 30,
          diMinus: 15,
          ema20: 105,
          ema50: 100,
          ema50Slope: 0.04,
          htfBias: 'BULLISH',
          higherHighHigherLow: true,
          pullbackHeldStructure: true
        },
        emaMrMetrics: {
          adx15: 18,
          ema20Slope15: 0.005,
          emaCrosses: 4,
          distanceFromEmaAtr: 1.2,
          volumeRatio: 1.1,
          strongHTFTrend: false,
          recentBreakout: false,
          priceBelowEma20: false,
          priceAboveEma20: true,
          reversalUp: false,
          reversalDown: true
        }
      });

      expect(decision.hasConflict).toBe(true);
      expect(decision.rawCandidateState).toBe('NO_TRADE');
      expect(decision.state).toBe('NO_TRADE');
      expect(decision.reason).toContain('Conflict');
    });
  });

  // =========================================================================
  // 6. TWO-CANDLE CONFIRMATION HYSTERESIS
  // =========================================================================
  describe('6. Two-Candle Confirmation Hysteresis', () => {
    const passingTrendLongMetrics: Partial<TrendPullbackRegimeMetrics> = {
      adx15: 28,
      adxRisingOrStable: true,
      pullbackVolume: 700,
      impulseVolume: 1400,
      structureBroken: false,
      timeframeConflict: false,
      diPlus: 30,
      diMinus: 15,
      ema20: 105,
      ema50: 100,
      ema50Slope: 0.04,
      htfBias: 'BULLISH',
      higherHighHigherLow: true,
      pullbackHeldStructure: true
    };

    it('requires 2 consecutive completed candles to confirm a regime change', () => {
      // Candle 1: First appearance of Trend Pullback Long
      const decision1 = evaluateMasterRegimeDecision([], null, {
        symbol: 'BTCUSDT',
        tracker,
        candleTime: 1000,
        trendMetrics: passingTrendLongMetrics
      });

      expect(decision1.rawCandidateState).toBe('TREND_PULLBACK');
      expect(decision1.confirmationCount).toBe(1);
      expect(decision1.isConfirmed).toBe(false);
      expect(decision1.state).toBe('NO_TRADE'); // Unconfirmed on single bar

      // Candle 2: Second consecutive completed candle confirms the regime
      const decision2 = evaluateMasterRegimeDecision([], null, {
        symbol: 'BTCUSDT',
        tracker,
        candleTime: 2000,
        trendMetrics: passingTrendLongMetrics
      });

      expect(decision2.rawCandidateState).toBe('TREND_PULLBACK');
      expect(decision2.confirmationCount).toBe(2);
      expect(decision2.isConfirmed).toBe(true);
      expect(decision2.state).toBe('TREND_PULLBACK');
      expect(decision2.direction).toBe('LONG');
    });

    it('does not increment counter if called multiple times on the same candle timestamp', () => {
      const decision1 = evaluateMasterRegimeDecision([], null, {
        symbol: 'ETHUSDT',
        tracker,
        candleTime: 1000,
        trendMetrics: passingTrendLongMetrics
      });
      expect(decision1.confirmationCount).toBe(1);

      // Re-query within same candle time (e.g. scan loop tick)
      const decision1Repeat = evaluateMasterRegimeDecision([], null, {
        symbol: 'ETHUSDT',
        tracker,
        candleTime: 1000,
        trendMetrics: passingTrendLongMetrics
      });
      expect(decision1Repeat.confirmationCount).toBe(1);
      expect(decision1Repeat.isConfirmed).toBe(false);
    });

    it('resets candidate counter if a new candle invalidates the regime before confirmation', () => {
      // Candle 1: Trend candidate
      const decision1 = evaluateMasterRegimeDecision([], null, {
        symbol: 'SOLUSDT',
        tracker,
        candleTime: 1000,
        trendMetrics: passingTrendLongMetrics
      });
      expect(decision1.confirmationCount).toBe(1);

      // Candle 2: Broken structure (fails filter)
      const decision2 = evaluateMasterRegimeDecision([], null, {
        symbol: 'SOLUSDT',
        tracker,
        candleTime: 2000,
        trendMetrics: { ...passingTrendLongMetrics, adx15: 15 }
      });
      expect(decision2.rawCandidateState).toBe('NO_TRADE');
      expect(decision2.confirmationCount).toBe(1);
      expect(decision2.isConfirmed).toBe(false);
    });
  });
});
