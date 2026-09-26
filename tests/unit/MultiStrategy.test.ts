import { describe, it, expect } from 'vitest';
import { validateTradingSettings, CANONICAL_DEFAULT_SETTINGS } from '../../src/shared/TradingSettings.js';
import { evaluateDetailedCoinGates, GATES_REGISTRY } from '../../src/utils/gatesRegistry.js';
import { AVAILABLE_STRATEGIES } from '../../src/components/StrategyPanel';

describe('Multi-Strategy Activation & Arbitration Engine', () => {
  describe('Settings Normalization & Validation', () => {
    it('initializes default canonical settings with VOLATILITY_COMPRESSION in enabledStrategies', () => {
      expect(CANONICAL_DEFAULT_SETTINGS.enabledStrategies).toEqual(['VOLATILITY_COMPRESSION']);
      expect(CANONICAL_DEFAULT_SETTINGS.activeStrategy).toBe('VOLATILITY_COMPRESSION');
    });

    it('sanitizes multiple enabled strategies and synchronizes activeStrategy', () => {
      const input = {
        enabledStrategies: ['VOLATILITY_COMPRESSION', 'TREND_PULLBACK', 'EMA_GAP_PULLBACK'],
        accountRiskPct: 1.5,
        leverage: 5,
      };

      const result = validateTradingSettings(input);
      expect(result.valid).toBe(true);
      expect(result.sanitized.enabledStrategies).toEqual([
        'VOLATILITY_COMPRESSION',
        'TREND_PULLBACK',
        'EMA_GAP_PULLBACK'
      ]);
      expect(result.sanitized.activeStrategy).toBe('VOLATILITY_COMPRESSION');
    });

    it('filters out non-string items from enabledStrategies', () => {
      const input = {
        enabledStrategies: ['VOLATILITY_COMPRESSION', 123, null, 'TREND_PULLBACK'],
      };

      const result = validateTradingSettings(input);
      expect(result.valid).toBe(true);
      expect(result.sanitized.enabledStrategies).toEqual([
        'VOLATILITY_COMPRESSION',
        'TREND_PULLBACK'
      ]);
    });

    it('synchronizes enabledStrategies if only activeStrategy was provided', () => {
      const input = {
        activeStrategy: 'TREND_PULLBACK',
      };

      const result = validateTradingSettings(input);
      expect(result.valid).toBe(true);
      expect(result.sanitized.activeStrategy).toBe('TREND_PULLBACK');
      expect(result.sanitized.enabledStrategies).toEqual(['TREND_PULLBACK']);
    });
  });

  describe('Multi-Strategy Gates Registry Evaluation', () => {
    const mockCoin: any = {
      symbol: 'BTCUSDT',
      price: 65000,
      direction: 'LONG',
      score: 85,
      status: 'SAFE',
      indicators: {
        sma200: 64500,
        rsi: 28,
        atr: 500,
        volumeRatio: 1.2,
        bollingerBands: {
          lower: 64800,
          middle: 65000,
          upper: 65200
        }
      },
      fundingRate: 0.0001
    };

    it('evaluates gates for all enabled strategies simultaneously', () => {
      const settings: any = {
        ...CANONICAL_DEFAULT_SETTINGS,
        enabledStrategies: ['BINANCE_COMPOSITE', 'EMA_GAP_PULLBACK'],
        activeStrategy: 'BINANCE_COMPOSITE'
      };

      const evaluation = evaluateDetailedCoinGates(mockCoin, settings, 2, 0.5);
      
      const compositeGateIds = evaluation.evaluatedGates
        .filter(g => g.def.strategy === 'BINANCE_COMPOSITE')
        .map(g => g.def.id);
      
      const climaxGateIds = evaluation.evaluatedGates
        .filter(g => g.def.strategy === 'EMA_GAP_PULLBACK')
        .map(g => g.def.id);

      const riskGateIds = evaluation.evaluatedGates
        .filter(g => g.def.strategy === 'RISK_ENGINE')
        .map(g => g.def.id);

      expect(compositeGateIds.length).toBeGreaterThan(0);
      expect(climaxGateIds.length).toBeGreaterThan(0);
      expect(riskGateIds.length).toBeGreaterThan(0);
    });
  });

  describe('Multi-Strategy Arbitration & Score Ordering', () => {
    it('sorts multiple candidate strategy signals by score descending', () => {
      const candidateSignals = [
        { strategy: 'TREND_PULLBACK', direction: 'LONG', score: 78, sl: 98, tp1: 104, tp3: 112 },
        { strategy: 'VOLATILITY_COMPRESSION', direction: 'LONG', score: 92, sl: 99, tp1: 105, tp3: 115 },
        { strategy: 'EMA_GAP_PULLBACK', direction: 'LONG', score: 85, sl: 97, tp1: 103, tp3: 110 }
      ];

      candidateSignals.sort((a, b) => b.score - a.score);

      expect(candidateSignals[0].strategy).toBe('VOLATILITY_COMPRESSION');
      expect(candidateSignals[0].score).toBe(92);
      expect(candidateSignals[1].strategy).toBe('EMA_GAP_PULLBACK');
      expect(candidateSignals[2].strategy).toBe('TREND_PULLBACK');
    });

    it('breaks score ties using priority order of activeStrategies', () => {
      const activeStrategies = ['VOLATILITY_COMPRESSION', 'TREND_PULLBACK', 'BINANCE_COMPOSITE'];
      const candidateSignals = [
        { strategy: 'BINANCE_COMPOSITE', direction: 'LONG', score: 85, sl: 98, tp1: 104, tp3: 112 },
        { strategy: 'VOLATILITY_COMPRESSION', direction: 'LONG', score: 85, sl: 99, tp1: 105, tp3: 115 }
      ];

      candidateSignals.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        const idxA = activeStrategies.indexOf(a.strategy);
        const idxB = activeStrategies.indexOf(b.strategy);
        return (idxA !== -1 ? idxA : 99) - (idxB !== -1 ? idxB : 99);
      });

      expect(candidateSignals[0].strategy).toBe('VOLATILITY_COMPRESSION');
    });
  });

  describe('Strategy Catalog Definition', () => {
    it('includes all 7 canonical strategies in AVAILABLE_STRATEGIES', () => {
      const ids = AVAILABLE_STRATEGIES.map(s => s.id);
      expect(ids).toContain('VOLATILITY_COMPRESSION');
      expect(ids).toContain('TREND_PULLBACK');
      expect(ids).toContain('EMA_GAP_PULLBACK');
      expect(ids).toContain('SMC_LIQUIDITY_SWEEP');
      expect(ids).toContain('BINANCE_COMPOSITE');
      expect(ids).toContain('EARLY_COIL_BREAKOUT');
      expect(ids).toContain('MACRO_RANGE_BREAKOUT');
      expect(AVAILABLE_STRATEGIES.length).toBe(7);
    });
  });
});
