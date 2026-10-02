/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Comprehensive Unit Tests for 3-Layer Quantitative Regime Engine
 */

import { describe, it, expect } from 'vitest';
import { 
  analyzeThreeLayerRegime, 
  evaluateDirectionBias, 
  evaluateMarketRegime, 
  evaluateTradeabilityGate,
  calculateInvalidationLevels,
  mapRegimeToStrategies,
  ROUND_TRIP_FEE_PCT,
  FEE_DRAG_MAX_R_PCT
} from '../../src/utils/regime/threeLayerRegime';

function makeKlines(count: number, basePrice: number, step: number = 0, vol: number = 1000) {
  const klines: any[] = [];
  let price = basePrice;
  for (let i = 0; i < count; i++) {
    price += step;
    klines.push({
      time: 1700000000 + i * 3600,
      open: price - 5,
      high: price + 15,
      low: price - 15,
      close: price,
      volume: vol
    });
  }
  return {
    closes: klines.map(k => k.close),
    highs: klines.map(k => k.high),
    lows: klines.map(k => k.low),
    volumes: klines.map(k => k.volume),
    open: klines[0].open,
    klines
  };
}

describe('3-Layer Quantitative Regime Engine', () => {

  describe('Layer 1: Direction Bias (-100 to +100)', () => {
    it('produces strong bullish score on stacked uptrend with expanding OI', () => {
      const btc1d = makeKlines(60, 60000, 200);
      const btc4h = makeKlines(60, 70000, 50);
      const levels = calculateInvalidationLevels(73000, btc1d.klines, btc4h.klines);

      const bias = evaluateDirectionBias({
        btc1d,
        btc4h,
        currentFundingRate: 0.0001, // Healthy mild positive funding (50th percentile)
        fundingRate30dHistory: [0.00005, 0.00008, 0.0001, 0.00012, 0.00015],
        openInterest4h: { priceChangePct: 1.5, oiChangePct: 3.0 }, // Organic trend: Price UP + OI UP
        takerCvd4h: { isRising: true, netDelta: 120 },
        breadthTop30PctAboveEma50: 75,
        levels
      });

      expect(bias.numericScore).toBeGreaterThan(30);
      expect(bias.biasDirection).toBe('BULLISH');
      expect(bias.nuance).toBe('BULLISH_CLEAN');
      expect(bias.factors).toHaveLength(7);
    });

    it('identifies BULLISH_CROWDED when funding is in top decile despite uptrend', () => {
      const btc1d = makeKlines(60, 60000, 200);
      const btc4h = makeKlines(60, 70000, 50);
      const levels = calculateInvalidationLevels(73000, btc1d.klines, btc4h.klines);

      // 30d funding history where 0.0008 is in the 98th percentile
      const history = new Array(85).fill(0.0001);
      history.push(0.0008);

      const bias = evaluateDirectionBias({
        btc1d,
        btc4h,
        currentFundingRate: 0.0008, // Extreme positive funding -> squeeze risk
        fundingRate30dHistory: history,
        openInterest4h: { priceChangePct: 1.0, oiChangePct: 5.0 },
        takerCvd4h: { isRising: true, netDelta: 50 },
        breadthTop30PctAboveEma50: 70,
        levels
      });

      expect(bias.biasDirection).toBe('BULLISH');
      expect(bias.nuance).toBe('BULLISH_CROWDED');
      expect(bias.nuanceLabel).toContain('Crowded');
    });

    it('identifies BULLISH_SHORT_COVERING when price rises while open interest drops', () => {
      const btc1d = makeKlines(60, 60000, 100);
      const btc4h = makeKlines(60, 65000, 50);
      const levels = calculateInvalidationLevels(68000, btc1d.klines, btc4h.klines);

      const bias = evaluateDirectionBias({
        btc1d,
        btc4h,
        currentFundingRate: 0.0001,
        fundingRate30dHistory: [0.00005, 0.00008, 0.0001, 0.00012, 0.00015],
        openInterest4h: { priceChangePct: 2.0, oiChangePct: -4.0 }, // Short squeeze / covering
        takerCvd4h: { isRising: true, netDelta: 20 },
        breadthTop30PctAboveEma50: 65,
        levels
      });

      expect(bias.nuance).toBe('BULLISH_SHORT_COVERING');
    });
  });

  describe('Layer 2: Market Regime (2-Bar Hysteresis & Age)', () => {
    it('enforces 2 consecutive closed candles before flipping regime from RANGE to TREND', () => {
      const btc4h = makeKlines(60, 60000, 150); // Trending data

      // Bar 1 meeting condition: consecutiveCandles = 1
      const eval1 = evaluateMarketRegime({
        btc4h,
        lastConfirmedRegime: 'RANGE',
        lastCandidateRegime: 'TREND',
        consecutiveCandles: 1,
        regimeAgeBars: 10
      });

      // After 2nd bar meeting condition, regime is confirmed locked
      expect(eval1.confirmedRegime).toBe('TREND');
      expect(eval1.consecutiveCandles).toBe(2);
      expect(eval1.isHysteresisConfirmed).toBe(true);
      expect(eval1.regimeAgeBars).toBe(1); // Fresh trend age reset
    });

    it('tracks regime age in bars when regime remains steady', () => {
      const btc4h = makeKlines(60, 60000, 0); // Flat ranging / compression data

      const eval2 = evaluateMarketRegime({
        btc4h,
        lastConfirmedRegime: 'RANGE',
        lastCandidateRegime: 'RANGE',
        consecutiveCandles: 2,
        regimeAgeBars: 14
      });

      expect(eval2.confirmedRegime).toBe('RANGE');
      expect(eval2.regimeAgeBars).toBe(15);
      expect(eval2.isHysteresisConfirmed).toBe(true);
    });
  });

  describe('Layer 3: Tradeability Gate & 0.118% Fee Drag', () => {
    it('flags Low Edge Day when typical stop is tight (<0.7%) and fee drag exceeds 15% of 1R', () => {
      // Very low volatility: price 80,000, daily high-low difference is tiny ($150 = ~0.2%)
      const btc1h = makeKlines(30, 80000, 0);
      for (let i = 0; i < 30; i++) {
        btc1h.highs[i] = 80100;
        btc1h.lows[i] = 79900;
      }

      const tradeability = evaluateTradeabilityGate({
        btc1hCloses: btc1h.closes,
        btc1hHighs: btc1h.highs,
        btc1hLows: btc1h.lows,
        currentPrice: 80000
      });

      // Stop distance will be around 0.3% -> 0.118% / 0.30% * 100 = ~39% of 1R
      expect(tradeability.feeDragPctOfR).toBeGreaterThan(15.0);
      expect(tradeability.isTradeable).toBe(false);
      expect(tradeability.isLowEdgeDay).toBe(true);
      expect(tradeability.blockedReason).toContain('Fee drag');
    });

    it('approves tradeability gate when stop distance is wide enough (>=1.0%) to keep fee drag <= 15%', () => {
      // Normal/healthy crypto intraday volatility: price 60,000, 1H ATR is ~$600 (1.0%)
      const btc1h = makeKlines(30, 60000, 0);
      for (let i = 0; i < 30; i++) {
        btc1h.highs[i] = 60600;
        btc1h.lows[i] = 59400;
      }

      const tradeability = evaluateTradeabilityGate({
        btc1hCloses: btc1h.closes,
        btc1hHighs: btc1h.highs,
        btc1hLows: btc1h.lows,
        currentPrice: 60000,
        relativeVolume20: 1.25,
        spreadPct: 0.015
      });

      expect(tradeability.feeDragPctOfR).toBeLessThanOrEqual(15.0);
      expect(tradeability.isTradeable).toBe(true);
      expect(tradeability.isLowEdgeDay).toBe(false);
      expect(tradeability.isLayer3Enabled).toBe(true);
      expect(tradeability.isGateBypassed).toBe(false);
    });

    it('allows turning OFF Layer 3 gate so low edge fee drag days are bypassed and tradeable', () => {
      // Compressed candles where fee drag would ordinarily block entries
      const btc1h = makeKlines(30, 80000, 0);
      for (let i = 0; i < 30; i++) {
        btc1h.highs[i] = 80100;
        btc1h.lows[i] = 79900;
      }

      const tradeabilityBypassed = evaluateTradeabilityGate({
        btc1hCloses: btc1h.closes,
        btc1hHighs: btc1h.highs,
        btc1hLows: btc1h.lows,
        currentPrice: 80000,
        enableLayer3Gate: false // User turned Layer 3 gate OFF
      });

      // Even with fee drag > 15%, isTradeable is permitted because gate is turned OFF
      expect(tradeabilityBypassed.feeDragPctOfR).toBeGreaterThan(15.0);
      expect(tradeabilityBypassed.isTradeable).toBe(true);
      expect(tradeabilityBypassed.isLayer3Enabled).toBe(false);
      expect(tradeabilityBypassed.isGateBypassed).toBe(true);
      expect(tradeabilityBypassed.blockedReason).toBeUndefined();
      expect(tradeabilityBypassed.gateReason).toContain('BYPASSED');
    });
  });

  describe('Regime -> Strategy Matrix Mapping', () => {
    it('maps only active production strategies to TREND regime', () => {
      const strategies = mapRegimeToStrategies('TREND', 'BULLISH');
      const ids = strategies.map(s => s.strategyId);

      expect(ids).toContain('TREND_PULLBACK');
      expect(ids).toContain('TREND_PULLBACK_RETEST');
      expect(ids).toContain('EMA5_EXACT_ENTRY_V2');
      // Ensure permanently deleted strategies are NOT present
      expect(ids).not.toContain('EMA5_EXACT_ENTRY_V1');
      expect(ids).not.toContain('EMA_GAP_PULLBACK');
      expect(ids).not.toContain('MACRO_RANGE_BREAKOUT');
    });

    it('maps VCB Breakout and Early Coil Breakout to COMPRESSION regime', () => {
      const strategies = mapRegimeToStrategies('COMPRESSION', 'NEUTRAL');
      const ids = strategies.map(s => s.strategyId);

      expect(ids).toContain('VOLATILITY_COMPRESSION');
      expect(ids).toContain('EARLY_COIL_BREAKOUT');
      expect(strategies[0].suitability).toBe('FAVORED');
    });
  });

  describe('Master analyzeThreeLayerRegime Integration', () => {
    it('returns complete structured state with levels, bias, regime, tradeability, and strategies', () => {
      const btc1d = makeKlines(60, 65000, 50);
      const btc4h = makeKlines(60, 68000, 20);
      const btc1h = makeKlines(40, 69000, 10);

      const result = analyzeThreeLayerRegime({
        btc1d,
        btc4h,
        btc1h,
        currentPrice: 69200
      });

      expect(result.symbol).toBe('BTCUSDT');
      expect(result.bias).toBeDefined();
      expect(result.regime).toBeDefined();
      expect(result.tradeability).toBeDefined();
      expect(result.levels).toBeDefined();
      expect(result.recommendedStrategies.length).toBeGreaterThan(0);
      expect(result.levels.dailyOpen).toBeGreaterThan(0);
      expect(result.levels.vwap4h).toBeGreaterThan(0);
    });
  });

});
