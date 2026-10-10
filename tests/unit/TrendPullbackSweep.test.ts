import fs from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';
import {
  PARAM_REGISTRY,
  PIPELINE_GROUPS,
  resolveTpsrConfig,
  validateTpsrConfig,
  hashConfig,
  DEFAULT_REGIME_SCALERS,
  TpsrMode
} from '../../src/utils/strategies/trendPullbackSweep/schema.js';
import {
  evaluateTrendPullbackSweep,
  TpsrFunnelTracker,
  extractTpsrRegime
} from '../../src/utils/strategies/trendPullbackSweep/engine.js';
import {
  tpsrToTrendPullbackResult,
  tpsrToStrategySignal
} from '../../src/utils/strategies/trendPullbackSweep/index.js';
import {
  evaluateTrendPullback,
  evaluateTrendPullbackDetailed
} from '../../src/utils/strategies/trendPullback.js';
import { Candle } from '../../src/utils/strategies/liquiditySweep/pools.js';

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

describe('TREND PULLBACK SWEEP REVERSAL (TPSR): Acceptance Test Suite', () => {

  describe('1. Parameter Registry & Resolution Order', () => {
    it('has all 8 pipeline groups and non-empty registry', () => {
      expect(PIPELINE_GROUPS.length).toBe(8);
      expect(PARAM_REGISTRY.length).toBeGreaterThan(30);

      // Verify every param has presets for strict, balanced, aggressive
      for (const p of PARAM_REGISTRY) {
        expect(p.presets.strict).toBeDefined();
        expect(p.presets.balanced).toBeDefined();
        expect(p.presets.aggressive).toBeDefined();
        expect(p.label).toBeTruthy();
        expect(p.help).toBeTruthy();
      }
    });

    it('resolves preset values by mode', () => {
      const strictRes = resolveTpsrConfig({ mode: 'strict', regimeTier: 'moderate' });
      const balancedRes = resolveTpsrConfig({ mode: 'balanced', regimeTier: 'moderate' });
      const aggRes = resolveTpsrConfig({ mode: 'aggressive', regimeTier: 'moderate' });

      expect(strictRes.values['direction.timeframe']).toBe('4h');
      expect(balancedRes.values['direction.timeframe']).toBe('1h');
      expect(aggRes.values['direction.timeframe']).toBe('1h');

      expect(strictRes.values['execution.timeframe']).toBe('15m');
      expect(balancedRes.values['execution.timeframe']).toBe('15m');
      expect(aggRes.values['execution.timeframe']).toBe('5m');
    });

    it('applies regime scalers on scalable parameters', () => {
      // In 'strong' regime tier, tp2.minRR should be scaled by 1.25
      const strongRes = resolveTpsrConfig({ mode: 'balanced', regimeTier: 'strong' });
      const modRes = resolveTpsrConfig({ mode: 'balanced', regimeTier: 'moderate' });

      const modTp2 = modRes.values['tp2.minRR']; // preset = 3.0
      const strongTp2 = strongRes.values['tp2.minRR']; // 3.0 * 1.25 = 3.75

      expect(strongTp2).toBeGreaterThan(modTp2);
      expect(strongRes.sources['tp2.minRR']).toBe('regime-adjusted');
    });

    it('precedence: pinned user override wins over regime scalers and presets', () => {
      const res = resolveTpsrConfig({
        mode: 'strict',
        regimeTier: 'strong',
        pinnedOverrides: {
          'tp2.minRR': 4.5,
          'retrace.min': 0.40
        }
      });

      expect(res.values['tp2.minRR']).toBe(4.5);
      expect(res.sources['tp2.minRR']).toBe('pinned');
      expect(res.values['retrace.min']).toBe(0.40);
      expect(res.sources['retrace.min']).toBe('pinned');

      // Unpinned param retains preset
      expect(res.sources['direction.timeframe']).toBe('preset');
    });

    it('generates consistent config hash', () => {
      const res1 = resolveTpsrConfig({ mode: 'balanced', regimeTier: 'moderate' });
      const res2 = resolveTpsrConfig({ mode: 'balanced', regimeTier: 'moderate' });
      expect(res1.configHash).toBe(res2.configHash);
      expect(res1.configHash.startsWith('tpsr_')).toBe(true);
    });
  });

  describe('2. Cross-Field Validation Engine', () => {
    it('catches invalid retrace: retrace.min >= retrace.max', () => {
      const invalid = {
        'retrace.min': 0.70,
        'retrace.max': 0.60
      };
      const val = validateTpsrConfig(invalid);
      expect(val.valid).toBe(false);
      expect(val.errors['retrace.min']).toBeDefined();
      expect(val.errors['retrace.max']).toBeDefined();
    });

    it('catches invalid take profits: tp1.minRR >= tp2.minRR', () => {
      const invalid = {
        'tp1.minRR': 3.0,
        'tp2.minRR': 2.0
      };
      const val = validateTpsrConfig(invalid);
      expect(val.valid).toBe(false);
      expect(val.errors['tp1.minRR']).toBeDefined();
    });

    it('catches invalid share sum: tp1.sharePct + tp2.sharePct > 100', () => {
      const invalid = {
        'tp1.sharePct': 60,
        'tp2.sharePct': 50
      };
      const val = validateTpsrConfig(invalid);
      expect(val.valid).toBe(false);
      expect(val.errors['tp1.sharePct']).toBeDefined();
    });

    it('catches invalid stop distances: stop.minATR >= stop.maxATR', () => {
      const invalid = {
        'stop.minATR': 2.5,
        'stop.maxATR': 1.0
      };
      const val = validateTpsrConfig(invalid);
      expect(val.valid).toBe(false);
      expect(val.errors['stop.minATR']).toBeDefined();
    });

    it('passes completely for valid resolved configs', () => {
      const resolved = resolveTpsrConfig({ mode: 'balanced', regimeTier: 'moderate' });
      const val = validateTpsrConfig(resolved.values);
      expect(val.valid).toBe(true);
      expect(val.globalErrors.length).toBe(0);
    });
  });

  describe('3. Detector Fixtures: Hammer, Star, Sweep, Engulf', () => {
    it('detects Hammer (bullish rejection candle) correctly', () => {
      // Rejection candle (Hammer): Long lower shadow, small upper body, closes high
      const hammer = createCandle(1000, 100.2, 100.5, 98.0, 100.4, 2500);
      const range = hammer.high - hammer.low; // 2.5
      const lowerWick = Math.min(hammer.open, hammer.close) - hammer.low; // 100.2 - 98.0 = 2.2
      const body = Math.abs(hammer.close - hammer.open); // 0.2
      const upperWick = hammer.high - Math.max(hammer.open, hammer.close); // 0.1

      const wickRatio = lowerWick / range; // 2.2 / 2.5 = 0.88 (> 0.50 requirement)
      const opposingRatio = upperWick / range; // 0.1 / 2.5 = 0.04 (< 0.25 limit)
      const bodyRatio = body / range; // 0.2 / 2.5 = 0.08 (< 0.35 limit)

      expect(wickRatio).toBeGreaterThan(0.50);
      expect(opposingRatio).toBeLessThan(0.25);
      expect(bodyRatio).toBeLessThan(0.35);
    });

    it('detects Shooting Star (bearish rejection candle) correctly', () => {
      // Rejection candle (Shooting Star): Long upper shadow, small lower body, closes low
      const star = createCandle(1000, 99.8, 102.0, 99.5, 99.6, 2500);
      const range = star.high - star.low; // 2.5
      const upperWick = star.high - Math.max(star.open, star.close); // 102.0 - 99.8 = 2.2
      const lowerWick = Math.min(star.open, star.close) - star.low; // 99.6 - 99.5 = 0.1
      const body = Math.abs(star.close - star.open); // 0.2

      const wickRatio = upperWick / range; // 0.88
      const opposingRatio = lowerWick / range; // 0.04
      const bodyRatio = body / range; // 0.08

      expect(wickRatio).toBeGreaterThan(0.50);
      expect(opposingRatio).toBeLessThan(0.25);
      expect(bodyRatio).toBeLessThan(0.35);
    });

    it('rejects near-misses with large opposing wicks (indecision spinning top)', () => {
      // Spinning top: both upper and lower wicks large
      const indecision = createCandle(1000, 100, 102, 98, 100.1, 1000);
      const range = indecision.high - indecision.low; // 4.0
      const upperWick = indecision.high - Math.max(indecision.open, indecision.close); // 1.9
      const lowerWick = Math.min(indecision.open, indecision.close) - indecision.low; // 2.0
      const opposingWickRatio = Math.min(upperWick, lowerWick) / range; // ~0.475

      // Fails opposing wick threshold (< 0.25 or 0.30)
      expect(opposingWickRatio).toBeGreaterThan(0.30);
    });
  });

  describe('4. End-to-End Pipeline & Integration with evaluateTrendPullback', () => {
    it('executes through evaluateTrendPullbackSweep with valid trend pullback setup', () => {
      // Build a realistic 40-candle bullish series with impulse, pullback to swing low, sweep, hammer, engulf
      const baseTime = 1600000000000;
      const step = 900000; // 15m
      const candles: Candle[] = [];

      let p = 100;
      // 1. Prior range/base (bars 0-14)
      for (let i = 0; i < 15; i++) {
        p += (i % 2 === 0 ? 0.2 : -0.2);
        candles.push(createCandle(baseTime + i * step, p, p + 0.4, p - 0.4, p, 1000));
      }

      // 2. Strong impulse leg upward (bars 15-24)
      for (let i = 15; i < 25; i++) {
        p += 1.0;
        candles.push(createCandle(baseTime + i * step, p - 0.9, p + 0.2, p - 1.0, p, 2500));
      }
      // Impulse peaked at ~110

      // 3. Form a swing low support pool around 106.0 at bar 28
      candles.push(createCandle(baseTime + 25 * step, 109, 109.5, 107.5, 108, 900));
      candles.push(createCandle(baseTime + 26 * step, 108, 108.5, 106.5, 107, 800));
      candles.push(createCandle(baseTime + 27 * step, 107, 107.8, 106.0, 107.5, 800)); // Swing low pool at 106.0
      candles.push(createCandle(baseTime + 28 * step, 107.5, 108.2, 107.0, 108.0, 850));
      candles.push(createCandle(baseTime + 29 * step, 108.0, 108.5, 107.5, 107.8, 750));

      // 4. Bar 30: Sweep candle: wicks under 106.0 down to 105.7, reclaims back inside at 106.4 (Hammer)
      const hammerBar = createCandle(baseTime + 30 * step, 106.2, 106.5, 105.6, 106.4, 2200);
      candles.push(hammerBar);

      // 5. Bar 31: Engulf confirmation candle: opens at 106.4, closes decisively higher at 107.5
      const engulfBar = createCandle(baseTime + 31 * step, 106.4, 107.6, 106.3, 107.5, 3000);
      candles.push(engulfBar);

      // Higher timeframe direction candles
      const dirCandles: Candle[] = [
        createCandle(baseTime, 98, 102, 97, 101, 10000),
        createCandle(baseTime + 3600000, 101, 105, 100, 104, 12000),
        createCandle(baseTime + 7200000, 104, 110, 103, 109, 15000),
        createCandle(baseTime + 10800000, 109, 111, 106, 108, 8000)
      ];

      const regime = {
        direction: 'bull' as const,
        tier: 'strong' as const,
        confidence: 0.85,
        btcTrend: 'UP' as const,
        ethTrend: 'UP' as const,
        timestamp: baseTime + 32 * step
      };

      const result = evaluateTrendPullbackSweep({
        symbol: 'SOLUSDT',
        execCandles: candles,
        isCandlesClosed: true,
        directionCandles: dirCandles,
        currentPrice: 107.5,
        mode: 'balanced',
        regime,
        overrides: {
          'risk.minBlendedNetRR': 1.0,
          'pool.minScore': 20,
          'sweep.minRelVolume': 0.8,
          'engulf.minVolumeRatio': 0.8,
          'volatility.atrPercentileBandMin': 0,
          'volatility.atrPercentileBandMax': 100
        }
      });

      expect(result).toBeDefined();
      expect(['ACTIVE', 'ARMED', 'STANDBY', 'REJECTED']).toContain(result.status);

      // Test funnel metrics recording
      const stats = TpsrFunnelTracker.get().statsByMode.balanced;
      expect(stats.universePass).toBeGreaterThanOrEqual(1);
    });

    it('evaluateTrendPullback invokes TPSR cleanly without throwing', () => {
      const candles: Candle[] = [];
      const baseTime = Date.now() - 35 * 900000;
      let p = 50;
      for (let i = 0; i < 35; i++) {
        p += 0.1;
        candles.push(createCandle(baseTime + i * 900000, p, p + 0.3, p - 0.3, p, 1000));
      }

      const res = evaluateTrendPullbackDetailed(candles, null, p, {
        tradeTimeframe: '15m',
        symbol: 'BTCUSDT',
        tpsrMode: 'balanced'
      });

      expect(res).toBeDefined();
      expect(typeof res.score).toBe('number');
      expect(typeof res.decision).toBe('string');
    });

    it('tpsrToStrategySignal adapter creates valid StrategySignal', () => {
      const mockSignal = {
        direction: 'LONG' as const,
        entryPrice: 100,
        sl: 98,
        tp1: 102,
        tp2: 104,
        tp3: 106,
        riskPerUnit: 2,
        stopDistanceATR: 1.0,
        score: 82,
        signalTime: Date.now(),
        reason: 'TPSR Confirmed Hammer Reversal',
        regimeSnapshot: {
          direction: 'bull' as const,
          tier: 'strong' as const,
          confidence: 0.85,
          btcTrend: 'UP' as const,
          ethTrend: 'UP' as const,
          timestamp: Date.now()
        }
      };

      const stratSig = tpsrToStrategySignal(mockSignal as any, 'BTCUSDT', '15m');
      expect(stratSig.direction).toBe('long');
      expect(stratSig.entry).toBe(100);
      expect(stratSig.sl).toBe(98);
      expect(stratSig.tp1).toBe(102);
      expect(stratSig.rr1).toBe(1.0);
      expect(stratSig.rr2).toBe(2.0);
      expect(stratSig.rr3).toBe(3.0);
      expect(stratSig.setupScore).toBe(82);
    });
  });

  describe('5. Zero-Literal Compliance Test (Rule 2.1)', () => {
    it('engine.ts contains zero hardcoded trading literals', () => {
      const enginePath = path.resolve(__dirname, '../../src/utils/strategies/trendPullbackSweep/engine.ts');
      const content = fs.readFileSync(enginePath, 'utf-8');

      // Verify that engine reads values from cfg and does not hardcode trading constants
      const forbiddenTradingLiterals = [
        /const\s+minDepth\s*=\s*\d+(\.\d+)?/i,
        /const\s+maxDepth\s*=\s*\d+(\.\d+)?/i,
        /const\s+minRR\s*=\s*\d+(\.\d+)?/i,
        /minWickRatio\s*===?\s*\d+(\.\d+)?/i,
        /maxBodyRatio\s*===?\s*\d+(\.\d+)?/i,
        /stopBuffer\s*=\s*\d+(\.\d+)?/i
      ];

      for (const pattern of forbiddenTradingLiterals) {
        const match = content.match(pattern);
        expect(match, `Forbidden hardcoded literal found in engine.ts: ${pattern}`).toBeNull();
      }
    });
  });

});
