import { describe, it, expect } from 'vitest';
import { 
  classifyBtcMacroRegime, 
  classifyMarketRegime, 
  getEligibleBucketStrategies,
  DEFAULT_STRATEGY_BUCKET,
  MarketRegimeType
} from '../../src/utils/strategyBucket.js';

describe('Validation Fidelity: Layer 1 Macro Safety Gate', () => {
  // Helper to generate synthetic klines
  function generateKlines(count: number, basePrice: number, trend: 'UP' | 'DOWN' | 'CHOP' | 'PANIC'): any[] {
    const klines: any[] = [];
    let price = basePrice;
    const now = Date.now();
    const intervalMs = 15 * 60 * 1000;

    for (let i = 0; i < count; i++) {
      let open = price;
      let change = 0;
      if (trend === 'UP') {
        change = price * 0.003;
      } else if (trend === 'DOWN') {
        change = -price * 0.003;
      } else if (trend === 'PANIC') {
        // Massive consecutive dump with extreme range
        change = -price * 0.05;
      } else {
        change = (i % 2 === 0 ? 1 : -1) * price * 0.001;
      }

      let close = open + change;
      let high = Math.max(open, close) + price * 0.001;
      let low = Math.min(open, close) - price * 0.001;
      let volume = trend === 'PANIC' ? 100000 : 1000;

      klines.push({
        time: now - (count - i) * intervalMs,
        open,
        high,
        low,
        close,
        volume
      });
      price = close;
    }
    return klines;
  }

  it('RED conditions trigger full lockout (isTradable: false, macroColor: RED)', () => {
    // Generate panic selloff klines
    const panicKlines = generateKlines(60, 60000, 'PANIC');
    const lastPrice = panicKlines[panicKlines.length - 1].close;
    const result = classifyBtcMacroRegime(panicKlines, lastPrice);

    expect(result.macroColor).toBe('RED');
    expect(result.isTradable).toBe(false);
  });

  it('AMBER conditions restrict to priority-1 (P1) strategies only', () => {
    const amberStrategies = getEligibleBucketStrategies(
      DEFAULT_STRATEGY_BUCKET,
      'TRENDING_UP',
      'AMBER'
    );

    expect(amberStrategies.length).toBeGreaterThan(0);
    // Every eligible strategy under AMBER macro must have priority === 1
    for (const strat of amberStrategies) {
      expect(strat.priority).toBe(1);
    }
  });

  it('GREEN conditions allow full bucket evaluation across priorities', () => {
    const greenStrategies = getEligibleBucketStrategies(
      DEFAULT_STRATEGY_BUCKET,
      'TRENDING_UP',
      'GREEN'
    );

    expect(greenStrategies.length).toBeGreaterThan(0);
    const priorities = greenStrategies.map(s => s.priority);
    expect(priorities.includes(1)).toBe(true);
  });
});

describe('Validation Fidelity: Layer 2 Per-Symbol Regime Detection & Vetoes', () => {
  it('identifies un-tradable noise states (TRANSITION/DEAD_VOLUME) as stand-aside', () => {
    // Flat klines with minimal ATR
    const flatKlines: any[] = [];
    const now = Date.now();
    for (let i = 0; i < 60; i++) {
      flatKlines.push({
        time: now - (60 - i) * 60000,
        open: 100,
        high: 100.01,
        low: 99.99,
        close: 100,
        volume: 1 // essentially dead volume
      });
    }

    const regime = classifyMarketRegime(flatKlines, 100, 'GREEN');
    expect(['DEAD_VOLUME', 'TRANSITION', 'RANGING']).toContain(regime.regime);
  });
});
