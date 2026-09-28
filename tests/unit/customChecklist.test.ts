import { describe, it, expect } from 'vitest';
import { computeStrategyLiveAudit } from '../../src/components/StrategyChecklistPanel';
import { CANONICAL_DEFAULT_SETTINGS } from '../../src/shared/TradingSettings';
import { CoinDetail } from '../../src/types';

describe('Strategy Checklist Customization & Live Audit Engine', () => {
  const mockCoin: CoinDetail = {
    symbol: 'BTCUSDT',
    price: 65000,
    change24h: 2.5,
    score: 85,
    direction: 'LONG',
    status: 'ARMED',
    statusReason: 'Breakout setup qualified',
    fundingRate: 0.0001,
    indicators: {
      emaFast: 65200,
      emaSlow: 64800,
      emaTrend: 64000,
      rsi: 55,
      rsiDivergence: null,
      macd: { macd: 50, signal: 40, histogram: 10 },
      adx: { adx: 28, plusDI: 30, minusDI: 15 },
      superTrend: { direction: 'uptrend', value: 64500 },
      volume20Ma: 500,
      volumeRatio: 1.45,
      vwap: 64900,
      vwapDeviationPct: 0.15,
      atr: 450,
      fib: { swingHigh: 66000, swingLow: 64000, levels: {} },
      supportResistance: { supports: [64000], resistances: [66000] }
    },
    gates: {
      g1: true,
      g2: true,
      g3: true,
      g4: true,
      g1Reason: 'Boundary test valid',
      g2Reason: 'Compression tight',
      g3Reason: 'Volume high',
      g4Reason: 'Room to target',
      g5: true,
      g6: true,
      g7: true,
      g8: true,
      g9: true,
      g10: true,
      blockReasons: []
    },
    wmPattern: 'NONE',
    candles: [
      { time: 1000, open: 64800, high: 64950, low: 64750, close: 64900, volume: 400 },
      { time: 2000, open: 64900, high: 65300, low: 64850, close: 65200, volume: 800 }
    ]
  };

  it('evaluates standard quant spec defaults when no customizations exist', () => {
    const audit = computeStrategyLiveAudit('EMA5_EXACT_ENTRY_V2', mockCoin, CANONICAL_DEFAULT_SETTINGS);
    expect(audit.strategyId).toBe('EMA5_EXACT_ENTRY_V2');
    expect(audit.minScoreRequired).toBe(CANONICAL_DEFAULT_SETTINGS.eev2ChecklistMinScore ?? 7);
    expect(audit.maxScore).toBe(12);
    expect(audit.items.length).toBeGreaterThan(0);
    expect(audit.items.every(it => it.enabled !== false)).toBe(true);
  });

  it('allows user to customize minimum passing score', () => {
    const customizedSettings = {
      ...CANONICAL_DEFAULT_SETTINGS,
      customChecklists: {
        EMA5_EXACT_ENTRY_V2: {
          strategyId: 'EMA5_EXACT_ENTRY_V2',
          minScore: 10,
          gates: {}
        }
      }
    };

    const audit = computeStrategyLiveAudit('EMA5_EXACT_ENTRY_V2', mockCoin, customizedSettings);
    expect(audit.minScoreRequired).toBe(10);
  });

  it('allows user to disable a gate, reducing maxScore and preventing vetoes', () => {
    const customizedSettings = {
      ...CANONICAL_DEFAULT_SETTINGS,
      customChecklists: {
        EMA5_EXACT_ENTRY_V2: {
          strategyId: 'EMA5_EXACT_ENTRY_V2',
          minScore: 6,
          gates: {
            eev2_15m_regime: {
              enabled: false,
              isMandatory: false,
              points: 0
            }
          }
        }
      }
    };

    const audit = computeStrategyLiveAudit('EMA5_EXACT_ENTRY_V2', mockCoin, customizedSettings);
    const disabledItem = audit.items.find(it => it.id === 'eev2_15m_regime');
    expect(disabledItem).toBeDefined();
    expect(disabledItem?.enabled).toBe(false);
    expect(disabledItem?.points).toBe(0);
    expect(disabledItem?.maxPoints).toBe(0);
    // Dynamic maxScore should be reduced by 2 pts from 12 to 10
    expect(audit.maxScore).toBe(10);
  });

  it('allows user to increase point weight of a gate', () => {
    const customizedSettings = {
      ...CANONICAL_DEFAULT_SETTINGS,
      customChecklists: {
        EMA5_EXACT_ENTRY_V2: {
          strategyId: 'EMA5_EXACT_ENTRY_V2',
          minScore: 8,
          gates: {
            eev2_volume_ratio: {
              enabled: true,
              isMandatory: false,
              points: 3 // boosted from 1 pt to 3 pts
            }
          }
        }
      }
    };

    const audit = computeStrategyLiveAudit('EMA5_EXACT_ENTRY_V2', mockCoin, customizedSettings);
    const volItem = audit.items.find(it => it.id === 'eev2_volume_ratio');
    expect(volItem?.maxPoints).toBe(3);
    if (volItem?.passed) {
      expect(volItem.points).toBe(3);
    }
    // maxScore increases from 12 to 14
    expect(audit.maxScore).toBe(14);
  });

  it('allows user to convert a mandatory veto gate to scored-only', () => {
    // Failing coin for regime
    const bearishCoin: CoinDetail = {
      ...mockCoin,
      indicators: {
        ...mockCoin.indicators,
        emaFast: 64000,
        emaSlow: 65000,
        superTrend: { direction: 'downtrend', value: 65500 }
      }
    };

    // With default settings, 15m regime is mandatory veto -> recommendation should be SKIP or gatePassed false
    const defaultAudit = computeStrategyLiveAudit('EMA5_EXACT_ENTRY_V2', bearishCoin, CANONICAL_DEFAULT_SETTINGS);
    expect(defaultAudit.gatePassed).toBe(false);

    // With custom setting making 15m regime scored-only:
    const customizedSettings = {
      ...CANONICAL_DEFAULT_SETTINGS,
      customChecklists: {
        EMA5_EXACT_ENTRY_V2: {
          strategyId: 'EMA5_EXACT_ENTRY_V2',
          minScore: 4, // low enough to pass other gates
          gates: {
            eev2_15m_regime: {
              enabled: true,
              isMandatory: false, // relaxed from mandatory veto to scored only
              points: 2
            }
          }
        }
      }
    };

    const customAudit = computeStrategyLiveAudit('EMA5_EXACT_ENTRY_V2', bearishCoin, customizedSettings);
    const regimeItem = customAudit.items.find(it => it.id === 'eev2_15m_regime');
    expect(regimeItem?.isMandatoryGate).toBe(false);
  });

  it('evaluates dedicated checklist items for EMA5_PA_VOLUME_V1, EARLY_COIL_BREAKOUT, and MACRO_RANGE_BREAKOUT', () => {
    const paAudit = computeStrategyLiveAudit('EMA5_PA_VOLUME_V1', mockCoin, CANONICAL_DEFAULT_SETTINGS);
    expect(paAudit.items.some(i => i.id === 'epa_15m_regime')).toBe(true);

    const coilAudit = computeStrategyLiveAudit('EARLY_COIL_BREAKOUT', mockCoin, CANONICAL_DEFAULT_SETTINGS);
    expect(coilAudit.items.some(i => i.id === 'ecb_compression')).toBe(true);

    const macroAudit = computeStrategyLiveAudit('MACRO_RANGE_BREAKOUT', mockCoin, CANONICAL_DEFAULT_SETTINGS);
    expect(macroAudit.items.some(i => i.id === 'mrb_accumulation')).toBe(true);
  });
});
