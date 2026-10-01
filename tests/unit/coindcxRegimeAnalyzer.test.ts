import { describe, it, expect } from 'vitest';
import { 
  analyzeCoinDcxRegime, 
  calculateCoinDcxEffectiveFees,
  COINDCX_FEES
} from '../../src/utils/coindcxRegimeAnalyzer';

describe('CoinDCX Regime Analyzer & Strategy Auto-Pilot', () => {

  describe('CoinDCX Fee & Breakeven Structure', () => {
    it('accurately computes maker and taker fees including 18% GST', () => {
      const fees = calculateCoinDcxEffectiveFees();
      
      // Base maker is 0.025%
      expect(fees.makerFeePct).toBe(0.025);
      // Effective maker with 18% GST = 0.025 * 1.18 = 0.0295%
      expect(fees.effectiveMakerPct).toBeCloseTo(0.0295, 4);

      // Base taker is 0.075%
      expect(fees.takerFeePct).toBe(0.075);
      // Effective taker with 18% GST = 0.075 * 1.18 = 0.0885%
      expect(fees.effectiveTakerPct).toBeCloseTo(0.0885, 4);

      // Round-trip taker = 0.0885 * 2 = 0.1770%
      expect(fees.roundTripTakerPct).toBeCloseTo(0.1770, 4);

      // Round-trip maker entry + taker exit = 0.0295 + 0.0885 = 0.1180%
      expect(fees.roundTripMakerTakerPct).toBeCloseTo(0.1180, 4);
    });
  });

  describe('15m Trend & Regime Classification', () => {
    // Helper to generate trending candle series
    function generateCandles(basePrice: number, count: number, trendSlope: number, volatility: number) {
      const candles: any[] = [];
      let current = basePrice;
      const now = Math.floor(Date.now() / 1000) - (count * 900);

      for (let i = 0; i < count; i++) {
        current += trendSlope + (Math.sin(i / 2) * volatility * 0.1);
        const open = current;
        const high = current + volatility;
        const low = current - volatility;
        const close = current + (trendSlope > 0 ? volatility * 0.5 : -volatility * 0.5);
        candles.push({
          time: now + (i * 900),
          open,
          high,
          low,
          close,
          volume: 1000 + (i * 10)
        });
      }
      return candles;
    }

    it('classifies strong Bull Trend when Price > 50/200 EMA and ADX > 25 with upward slopes', () => {
      // 120 bars of strong upward trend
      const klines15m = generateCandles(50000, 120, 200, 50);
      const klines5m = generateCandles(70000, 120, 50, 20);

      const result = analyzeCoinDcxRegime(klines15m, klines5m, 0.0001, 'BTCUSDT');

      expect(result.regime).toBe('BULL_TREND');
      expect(result.bias).toBe('LONG_ONLY');
      expect(result.trend.isBullTrend).toBe(true);
      expect(result.trend.priceVsEma50).toBe('ABOVE');
      expect(result.trend.priceVsEma200).toBe('ABOVE');
      expect(result.trend.ema50SlopeDirection).toBe('UP');

      // Verifies suggested settings auto-activation configuration
      expect(result.suggestedSettings.activeStrategy).toBe('TREND_PULLBACK');
      expect(result.suggestedSettings.enabledStrategies).toContain('TREND_PULLBACK');
      expect(result.suggestedSettings.enabledStrategies).toContain('VOLATILITY_COMPRESSION');
      expect(result.suggestedSettings.tpbAllowLongs).toBe(true);
      expect(result.suggestedSettings.tpbAllowShorts).toBe(false); // No counter-trend shorts in bull trend
      expect(result.suggestedSettings.leverage).toBe(4);
      expect(result.suggestedSettings.accountRiskPct).toBe(0.5);
      expect(result.suggestedSettings.dailyLossLimitPct).toBe(2.0);

      // Verifies the 2 core setups are provided
      expect(result.setups).toHaveLength(2);
      expect(result.setups[0].id).toBe('BULL_PULLBACK_LONG');
      expect(result.setups[1].id).toBe('BULL_BREAKOUT_CONTINUATION');
    });

    it('classifies strong Bear Trend when Price < 50/200 EMA and ADX > 25 with downward slopes', () => {
      // 120 bars of strong downward trend
      const klines15m = generateCandles(70000, 120, -200, 50);
      const klines5m = generateCandles(50000, 120, -50, 20);

      const result = analyzeCoinDcxRegime(klines15m, klines5m, -0.0001, 'BTCUSDT');

      expect(result.regime).toBe('BEAR_TREND');
      expect(result.bias).toBe('SHORT_ONLY');
      expect(result.trend.isBearTrend).toBe(true);
      expect(result.trend.priceVsEma50).toBe('BELOW');
      expect(result.trend.priceVsEma200).toBe('BELOW');
      expect(result.trend.ema50SlopeDirection).toBe('DOWN');

      // Verifies suggested settings auto-activation configuration
      expect(result.suggestedSettings.activeStrategy).toBe('TREND_PULLBACK');
      expect(result.suggestedSettings.tpbAllowLongs).toBe(false); // No counter-trend longs in bear trend
      expect(result.suggestedSettings.tpbAllowShorts).toBe(true);
      expect(result.suggestedSettings.leverage).toBe(4);
      expect(result.suggestedSettings.accountRiskPct).toBe(0.5);

      // Verifies the 2 core setups are provided
      expect(result.setups).toHaveLength(2);
      expect(result.setups[0].id).toBe('BEAR_RALLY_FADE_SHORT');
      expect(result.setups[1].id).toBe('BEAR_BREAKDOWN_CONTINUATION');
    });

    it('classifies Range / Chop when ADX < 20 and EMAs are flat or price oscillates', () => {
      // 100 bars oscillating sideways around 60000
      const klines15m: any[] = [];
      const base = 60000;
      for (let i = 0; i < 100; i++) {
        const offset = Math.sin(i * 0.4) * 50;
        klines15m.push({
          time: i * 900,
          open: base + offset,
          high: base + offset + 20,
          low: base + offset - 20,
          close: base + offset + (i % 2 === 0 ? 5 : -5),
          volume: 500
        });
      }

      const result = analyzeCoinDcxRegime(klines15m, klines15m, 0.0001, 'BTCUSDT');

      expect(result.regime).toBe('RANGE_CHOP');
      expect(result.bias).toBe('MEAN_REVERSION');
      expect(result.trend.isRangeChop).toBe(true);
      expect(result.recommendedLeverage).toBe(3); // Lower leverage in ranges
      expect(result.suggestedSettings.activeStrategy).toBe('SMC_LIQUIDITY_SWEEP');
      expect(result.setups[0].id).toBe('RANGE_FADE_EDGES');
    });

    it('classifies High Volatility / News event when ATR surges or wide news expansion occurs', () => {
      // 80 normal candles followed by massive volatility spike
      const klines15m: any[] = [];
      const base = 60000;
      for (let i = 0; i < 80; i++) {
        klines15m.push({
          time: i * 900,
          open: base,
          high: base + 30,
          low: base - 30,
          close: base,
          volume: 500
        });
      }
      // Add giant candle with 15x normal range
      klines15m.push({
        time: 81 * 900,
        open: base,
        high: base + 3000,
        low: base - 1000,
        close: base + 2500,
        volume: 25000
      });

      const result = analyzeCoinDcxRegime(klines15m, klines15m, 0.0005, 'BTCUSDT');

      expect(result.regime).toBe('HIGH_VOL');
      expect(result.bias).toBe('CAPITAL_PRESERVATION');
      expect(result.recommendedLeverage).toBe(2); // Reduced leverage for capital defense
      expect(result.recommendedRiskPct).toBe(0.25);
    });

    it('identifies long and short squeeze risks based on funding rates', () => {
      const klines15m = generateCandles(60000, 60, 10, 20);

      // Elevated positive funding (+0.05%)
      const longSqueezeResult = analyzeCoinDcxRegime(klines15m, klines15m, 0.0005, 'BTCUSDT');
      expect(longSqueezeResult.funding.squeezeRisk).toBe('LONG_SQUEEZE_RISK');

      // Elevated negative funding (-0.05%)
      const shortSqueezeResult = analyzeCoinDcxRegime(klines15m, klines15m, -0.0005, 'BTCUSDT');
      expect(shortSqueezeResult.funding.squeezeRisk).toBe('SHORT_SQUEEZE_RISK');

      // Balanced funding (0.01%)
      const balancedResult = analyzeCoinDcxRegime(klines15m, klines15m, 0.0001, 'BTCUSDT');
      expect(balancedResult.funding.squeezeRisk).toBe('BALANCED');
    });
  });
});
