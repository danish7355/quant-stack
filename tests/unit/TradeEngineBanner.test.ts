import { describe, it, expect } from 'vitest';
import { 
  evaluateEngineStatus, 
  getStrategyDisplayName 
} from '../../src/components/TradeEngineBanner';
import { AppSettings, CANONICAL_DEFAULT_SETTINGS } from '../../src/types';

describe('TradeEngineBanner - Strategy & Trade Engine Active Evaluation', () => {
  const baseSettings: AppSettings = {
    ...CANONICAL_DEFAULT_SETTINGS,
    activeStrategy: 'VOLATILITY_COMPRESSION',
    autoTradeEnabled: true,
    killSwitchActive: false,
    tradingMode: 'PAPER'
  };

  it('evaluates as ACTIVE when engine is running with valid settings and connected feed', () => {
    const status = evaluateEngineStatus(
      true,
      baseSettings,
      'CONNECTED',
      false,
      null,
      { isPausing: false, reason: null },
      null
    );

    expect(status.isActive).toBe(true);
    expect(status.severity).toBe('ACTIVE');
    expect(status.strategyName).toBe('Volatility Compression Breakout (VCB)');
    expect(status.strategyTag).toBe('BREAKOUT');
    expect(status.allReasons).toHaveLength(0);
    expect(status.primaryReason).toContain('Trading Engine is ACTIVE');
  });

  it('evaluates as INACTIVE and provides reason when engine is stopped by operator', () => {
    const status = evaluateEngineStatus(
      false, // Engine stopped
      baseSettings,
      'CONNECTED',
      false,
      null,
      { isPausing: false, reason: null },
      null
    );

    expect(status.isActive).toBe(false);
    expect(status.severity).toBe('CRITICAL');
    expect(status.actionType).toBe('START_ENGINE');
    expect(status.primaryReason).toContain('Trading Engine is STOPPED by operator');
    expect(status.strategyName).toBe('Volatility Compression Breakout (VCB)');
  });

  it('evaluates as INACTIVE and provides reason when autoTradeEnabled is false in settings', () => {
    const status = evaluateEngineStatus(
      true,
      { ...baseSettings, autoTradeEnabled: false },
      'CONNECTED',
      false,
      null,
      { isPausing: false, reason: null },
      null
    );

    expect(status.isActive).toBe(false);
    expect(status.actionType).toBe('START_ENGINE');
    expect(status.primaryReason).toContain('Trading Engine is STOPPED by operator');
  });

  it('evaluates as INACTIVE and provides reason when Emergency Kill Switch is engaged', () => {
    const status = evaluateEngineStatus(
      true,
      { ...baseSettings, killSwitchActive: true },
      'CONNECTED',
      false,
      null,
      { isPausing: false, reason: null },
      null
    );

    expect(status.isActive).toBe(false);
    expect(status.severity).toBe('CRITICAL');
    expect(status.actionType).toBe('DISABLE_KILL_SWITCH');
    expect(status.primaryReason).toContain('Emergency Kill Switch is ENGAGED');
  });

  it('evaluates as INACTIVE and provides reason when settings failed to load from server', () => {
    const status = evaluateEngineStatus(
      true,
      baseSettings,
      'CONNECTED',
      false,
      'Server returned 500: Database timeout',
      { isPausing: false, reason: null },
      null
    );

    expect(status.isActive).toBe(false);
    expect(status.severity).toBe('CRITICAL');
    expect(status.actionType).toBe('RETRY_SETTINGS');
    expect(status.primaryReason).toContain('Configuration Error');
  });

  it('evaluates as INACTIVE and provides reason when market data feed is disconnected or stale', () => {
    const disconnectedStatus = evaluateEngineStatus(
      true,
      baseSettings,
      'DISCONNECTED',
      false,
      null,
      { isPausing: false, reason: null },
      null
    );
    expect(disconnectedStatus.isActive).toBe(false);
    expect(disconnectedStatus.primaryReason).toContain('Market data feed is DISCONNECTED');
    expect(disconnectedStatus.actionType).toBe('RECONNECT_FEED');

    const staleStatus = evaluateEngineStatus(
      true,
      baseSettings,
      'CONNECTED',
      true, // isStale
      null,
      { isPausing: false, reason: null },
      null
    );
    expect(staleStatus.isActive).toBe(false);
    expect(staleStatus.primaryReason).toContain('Price data stream is STALE');
    expect(staleStatus.actionType).toBe('RECONNECT_FEED');
  });

  it('evaluates as INACTIVE and provides reason when Global Market Safety Filter is active', () => {
    const status = evaluateEngineStatus(
      true,
      baseSettings,
      'CONNECTED',
      false,
      null,
      { isPausing: true, reason: 'BTC extreme flash crash -3.2% in 5m' },
      null
    );

    expect(status.isActive).toBe(false);
    expect(status.primaryReason).toContain('Global Market Safety Filter Active');
    expect(status.primaryReason).toContain('BTC extreme flash crash');
  });

  it('evaluates as INACTIVE when Live Trading is enabled but Binance API keys are missing', () => {
    const status = evaluateEngineStatus(
      true,
      {
        ...baseSettings,
        tradingMode: 'LIVE',
        binanceApiKey: '',
        binanceApiSecret: ''
      },
      'CONNECTED',
      false,
      null,
      { isPausing: false, reason: null },
      null
    );

    expect(status.isActive).toBe(false);
    expect(status.actionType).toBe('OPEN_SETTINGS');
    expect(status.primaryReason).toContain('Live Trading is enabled but Binance API Key or Secret is missing');
  });

  it('correctly maps all strategy display names and metadata', () => {
    expect(getStrategyDisplayName('VOLATILITY_COMPRESSION').name).toBe('Volatility Compression Breakout (VCB)');
    expect(getStrategyDisplayName('SMC_LIQUIDITY_SWEEP').name).toBe('Smart Money Concepts (SMC Liquidity Sweep)');
    expect(getStrategyDisplayName('TREND_PULLBACK').name).toBe('Trend Pullback Continuation');
    expect(getStrategyDisplayName('EMA_GAP_PULLBACK').name).toBe('5 EMA Gap Pullback Continuation');
    expect(getStrategyDisplayName('DELTA_CLIMAX').name).toBe('Delta Climax Reversal');
    expect(getStrategyDisplayName('EARLY_COIL_BREAKOUT').name).toBe('Early Coil Breakout');
    expect(getStrategyDisplayName('AUTO_REGIME').name).toBe('Autonomous Multi-Regime Auto-Selector');
    expect(getStrategyDisplayName('BINANCE_COMPOSITE').name).toBe('Binance Composite Technical Scoring');
  });

  it('lists all multiple simultaneous blocking conditions when several exist', () => {
    const status = evaluateEngineStatus(
      false, // stopped
      { ...baseSettings, killSwitchActive: true }, // kill switch on
      'DISCONNECTED', // feed down
      true,
      null,
      { isPausing: true, reason: 'High volatility' },
      null
    );

    expect(status.isActive).toBe(false);
    expect(status.allReasons.length).toBeGreaterThanOrEqual(3);
    expect(status.allReasons).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Emergency Kill Switch is ENGAGED'),
        expect.stringContaining('Trading Engine is STOPPED by operator'),
        expect.stringContaining('Market data feed is DISCONNECTED')
      ])
    );
  });

  it('evaluates multi-strategy configuration and displays all 4 active strategies', () => {
    const multiSettings: AppSettings = {
      ...baseSettings,
      enabledStrategies: ['VOLATILITY_COMPRESSION', 'TREND_PULLBACK', 'EMA_GAP_PULLBACK', 'SMC_LIQUIDITY_SWEEP']
    };

    const status = evaluateEngineStatus(
      true,
      multiSettings,
      'CONNECTED',
      false,
      null,
      { isPausing: false, reason: null },
      null
    );

    expect(status.isActive).toBe(true);
    expect(status.severity).toBe('ACTIVE');
    expect(status.activeStrategyCount).toBe(4);
    expect(status.activeStrategies.map(s => s.id)).toEqual([
      'VOLATILITY_COMPRESSION',
      'TREND_PULLBACK',
      'EMA_GAP_PULLBACK',
      'SMC_LIQUIDITY_SWEEP'
    ]);
    expect(status.strategyTag).toBe('4 ACTIVE');
    expect(status.strategyName).toContain('4 Strategies');
    expect(status.strategyName).toContain('VCB Breakout');
    expect(status.strategyName).toContain('Trend Pullback');
    expect(status.strategyName).toContain('5 EMA Gap');
    expect(status.strategyName).toContain('SMC Liquidity');
    expect(status.primaryReason).toContain('Trading Engine is ACTIVE and executing 4 strategies (VCB Breakout, Trend Pullback, 5 EMA Gap, SMC Liquidity)');
  });

  it('displays configured multi-strategy information when trading is stopped', () => {
    const multiSettings: AppSettings = {
      ...baseSettings,
      enabledStrategies: ['VOLATILITY_COMPRESSION', 'TREND_PULLBACK', 'EMA_GAP_PULLBACK', 'SMC_LIQUIDITY_SWEEP']
    };

    const status = evaluateEngineStatus(
      false, // engine stopped
      multiSettings,
      'CONNECTED',
      false,
      null,
      { isPausing: false, reason: null },
      null
    );

    expect(status.isActive).toBe(false);
    expect(status.severity).toBe('CRITICAL');
    expect(status.activeStrategyCount).toBe(4);
    expect(status.primaryReason).toContain('Trading Engine is STOPPED by operator');
    expect(status.strategyTag).toBe('4 ACTIVE');
  });
});
