/**
 * Unified Application Settings Schema & Default Source of Truth
 * Shared across Backend Trading Engine and Frontend React Dashboard
 */

import { DEFAULTS as RANGE_REGIME_DEFAULTS } from '../utils/strategies/rangeRegime.config.js';
import { BASE as LSR_BASE } from '../utils/strategies/lsr.config.js';
import { VCB_DEFAULTS } from '../utils/strategies/vcb.config.js';
import { STRATEGIES_BY_REGIME } from '../utils/strategyBucket.js';

export type SettingType = 'number' | 'boolean' | 'string' | 'select' | 'multiselect' | 'object';

export interface SettingDef {
  key: string;
  label: string;
  group: 'General' | 'Execution' | 'Fees' | 'Layer3' | 'Risk' | 'Regime' | 'Strategies' | 'TakeProfit' | 'TrendPullback' | 'OrderBlock' | 'LSR' | 'VCB' | 'RangeRegime' | 'Scalper' | 'Credentials' | 'Alerts';
  type: SettingType;
  default: any;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  options?: string[];
  help?: string;
  advanced?: boolean;
}

export const SETTINGS_SCHEMA: SettingDef[] = [
  // ── General System & Engine ──────────────────────────────────────
  { key: 'schemaVersion', label: 'Schema Version', group: 'General', type: 'number', default: 5, help: 'Settings migration version tracker' },
  { key: 'autoTradeEnabled', label: 'Autonomous Trading Engine', group: 'General', type: 'boolean', default: true, help: 'Master autonomous loop toggle' },
  { key: 'timeframe', label: 'Default Execution Timeframe', group: 'General', type: 'select', default: '15m', options: ['1m', '3m', '5m', '15m', '30m', '1H', '2H', '4H', '1D'], help: 'Base candle timeframe for technical scans' },
  { key: 'coinCount', label: 'Universe Coin Scan Limit', group: 'General', type: 'number', default: 50, min: 5, max: 250, step: 5, help: 'Number of top volume coins evaluated per cycle' },
  { key: 'scanInterval', label: 'Scan Interval Seconds', group: 'General', type: 'number', default: 15, min: 5, max: 300, step: 5, unit: 's', help: 'Frequency of background autonomous cycles' },
  { key: 'tradingMode', label: 'Trading Mode', group: 'General', type: 'select', default: 'LIVE', options: ['LIVE', 'TESTNET', 'PAPER'], help: 'Live broker execution or simulation' },
  { key: 'exchangeProvider', label: 'Exchange Provider', group: 'General', type: 'select', default: 'BINANCE', options: ['BINANCE', 'COINDCX'], help: 'Active exchange connection' },
  { key: 'activeStrategy', label: 'Primary Strategy Key', group: 'General', type: 'string', default: 'RANGE_REGIME_V1' },
  { key: 'activeStrategies', label: 'Active Strategies', group: 'General', type: 'multiselect', default: [
    'RANGE_REGIME_V1',
    'LIQUIDITY_SWEEP_REVERSAL',
    'ORDER_BLOCK',
    'TREND_PULLBACK',
    'COIL_BREAKOUT',
    'MULTICOIN_SCALPER_PRO'
  ], options: [
    'RANGE_REGIME_V1',
    'LIQUIDITY_SWEEP_REVERSAL',
    'ORDER_BLOCK',
    'TREND_PULLBACK',
    'COIL_BREAKOUT',
    'MULTICOIN_SCALPER_PRO',
    'BINANCE_COMPOSITE',
    'DELTA_CLIMAX',
    'VCB'
  ], help: 'Enabled portfolio strategies' },

  // ── Global Thresholds & Score Gates ─────────────────────────────
  { key: 'autoTradeThreshold', label: 'Global Auto-Trade Score Threshold', group: 'Execution', type: 'number', default: 72, min: 40, max: 95, step: 1, help: 'Minimum signal score required for order placement (72+ for high confluence)' },
  { key: 'strategyScoreThresholds', label: 'Per-Strategy Score Thresholds', group: 'Execution', type: 'object', default: {
    RANGE_REGIME_V1: 72,
    LIQUIDITY_SWEEP_REVERSAL: 72,
    ORDER_BLOCK: 75,
    TREND_PULLBACK: 72,
    COIL_BREAKOUT: 75,
    MULTICOIN_SCALPER_PRO: 70,
    BINANCE_COMPOSITE: 72,
    DELTA_CLIMAX: 72,
    VCB: 72
  }, help: 'Independent high-confluence score gate per strategy' },
  { key: 'htfAgreementMode', label: 'Higher Timeframe Agreement Mode', group: 'Execution', type: 'select', default: 'STRICT', options: ['OFF', 'OPPOSITE_ONLY', 'STRICT'], help: 'STRICT requires active 4H trend confirmation (filters out choppy/neutral traps). OPPOSITE_ONLY vetoes only on opposite 4H trend.' },
  { key: 'rangeMacroGate', label: 'Range Macro Regime Gate', group: 'Execution', type: 'select', default: 'ADX_ONLY', options: ['ADX_ONLY', 'STRICT', 'OFF'], help: 'ADX_ONLY vetoes on high ADX. STRICT requires macro range/compression. OFF disables.' },
  { key: 'rangeRequireTwoCandle', label: 'Range Require 2-Candle Reversal', group: 'Execution', type: 'boolean', default: true, help: 'Enforces 2-candle reversal confirmation before fading range edges, filtering runaway breakout traps' },
  { key: 'timeStopMinutes', label: 'Global Default Time Stop', group: 'Execution', type: 'number', default: 240, min: 5, max: 1440, step: 5, unit: 'min', help: 'Fallback maximum trade holding duration' },
  { key: 'minRRRatio', label: 'Minimum Risk-to-Reward Ratio', group: 'Execution', type: 'number', default: 2.0, min: 1.0, max: 10.0, step: 0.1, help: 'Rejects setups with structural reward/risk below 2.0:1 R:R' },
  { key: 'maxConcurrentTrades', label: 'Max Concurrent Positions', group: 'Execution', type: 'number', default: 5, min: 1, max: 20, step: 1, help: 'Portfolio concurrency limit' },
  { key: 'tradeCooldownMinutes', label: 'Post-Trade Symbol Cooldown', group: 'Execution', type: 'number', default: 15, min: 0, max: 180, step: 1, unit: 'min' },
  { key: 'postSlCooldownMinutes', label: 'Post-SL Quarantine Cooldown', group: 'Execution', type: 'number', default: 30, min: 0, max: 240, step: 5, unit: 'min' },

  // ── Centralised Take Profit Structure (TP1, TP2, TP3) ────────────
  { key: 'centralisedTpEnabled', label: 'Centralised Take Profit Engine', group: 'TakeProfit', type: 'boolean', default: true, help: 'Master toggle for centralized multi-target TP architecture' },
  { key: 'centralisedTpMode', label: 'Take Profit Calculation Mode', group: 'TakeProfit', type: 'select', default: 'R_MULTIPLE', options: ['R_MULTIPLE', 'PERCENTAGE', 'ATR_MULTIPLE'], help: 'R_MULTIPLE (Risk:Reward R-multiple), PERCENTAGE (Fixed %), ATR_MULTIPLE (Volatility ATR)' },
  { key: 'centralisedTp1Value', label: 'TP1 Target Multiplier/Value', group: 'TakeProfit', type: 'number', default: 2.0, min: 0.1, max: 20.0, step: 0.1, help: 'Target 1 distance: 2.0R (first target locks 2x risk)' },
  { key: 'centralisedTp2Value', label: 'TP2 Target Multiplier/Value', group: 'TakeProfit', type: 'number', default: 3.5, min: 0.2, max: 30.0, step: 0.1, help: 'Target 2 distance: 3.5R (second target captures 3.5x risk)' },
  { key: 'centralisedTp3Value', label: 'TP3 Target Multiplier/Value', group: 'TakeProfit', type: 'number', default: 5.0, min: 0.3, max: 50.0, step: 0.1, help: 'Target 3 runner distance: 5.0R (extended trend continuation)' },
  { key: 'centralisedTp1ClosePct', label: 'TP1 Position Scale-Out %', group: 'TakeProfit', type: 'number', default: 40, min: 1, max: 100, step: 1, unit: '%', help: 'Percentage of position quantity closed when TP1 is reached' },
  { key: 'centralisedTp2ClosePct', label: 'TP2 Position Scale-Out %', group: 'TakeProfit', type: 'number', default: 35, min: 0, max: 100, step: 1, unit: '%', help: 'Percentage of position quantity closed when TP2 is reached' },
  { key: 'centralisedTp3ClosePct', label: 'TP3 Position Scale-Out %', group: 'TakeProfit', type: 'number', default: 25, min: 0, max: 100, step: 1, unit: '%', help: 'Percentage of position quantity closed when TP3 is reached' },
  { key: 'centralisedTpMoveToBe', label: 'Move Stop Loss to Breakeven at TP1', group: 'TakeProfit', type: 'boolean', default: true, help: 'Automatically adjusts stop loss to entry price once TP1 is hit to de-risk position completely' },
  { key: 'centralisedTpOverrideStrategy', label: 'Force Centralised TP Over Strategy TP', group: 'TakeProfit', type: 'boolean', default: false, help: 'Default FALSE: strategy take profits override centralised take profit. Toggle ON to force centralised TP on all strategies.' },

  // ── Fees (Single Source of Truth) ────────────────────────────────
  { key: 'takerFeePct', label: 'Taker Fee Per Side', group: 'Fees', type: 'number', default: 0.05, min: 0.0, max: 0.5, step: 0.005, unit: '%', help: 'Exchange taker fee percentage per side' },
  { key: 'gstPct', label: 'GST on Fees', group: 'Fees', type: 'number', default: 18, min: 0, max: 30, step: 1, unit: '%', help: 'Taxes on exchange fees' },
  { key: 'slippageBps', label: 'Slippage Cushion (Per Side)', group: 'Fees', type: 'number', default: 2, min: 0, max: 50, step: 0.5, unit: 'bps', help: 'Conservative slippage expectation per execution side' },

  // ── Layer 3 Tradeability Gate ────────────────────────────────────
  { key: 'layer3TradeabilityGateEnabled', label: 'Layer 3 Tradeability Gate', group: 'Layer3', type: 'boolean', default: true, help: 'Pre-trade market-wide tradeability filter' },
  { key: 'bypassRegimeTradeabilityGate', label: 'Bypass Tradeability Gate', group: 'Layer3', type: 'boolean', default: false, help: 'Test bypass toggle for tradeability gate' },
  { key: 'layer3MinAtrPct', label: 'Layer 3 Minimum 1H ATR', group: 'Layer3', type: 'number', default: 0.12, min: 0.01, max: 0.5, step: 0.01, unit: '%', help: 'Below this ATR%, markets are deemed too flat to trade profitably' },
  { key: 'layer3MaxFeeToAtr', label: 'Layer 3 Max Fee-to-ATR Ratio', group: 'Layer3', type: 'number', default: 0.35, min: 0.1, max: 1.0, step: 0.05, help: 'Rejects when round-trip fees consume > 35% of average volatility' },
  { key: 'layer3MaxSpreadBps', label: 'Layer 3 Max Spread', group: 'Layer3', type: 'number', default: 10, min: 1, max: 100, step: 1, unit: 'bps', help: 'Max allowed live bid/ask spread (rejects illiquid orderbooks)' },
  { key: 'maxFeeDragPctOf1R', label: 'Max Fee Drag of 1R', group: 'Layer3', type: 'number', default: 15, min: 5, max: 100, step: 1, unit: '%', help: 'Rejects trades when round-trip fees exceed 15% of stop distance' },

  // ── Risk & Capital Protection ────────────────────────────────────
  { key: 'accountRiskPct', label: 'Account Risk Per Trade', group: 'Risk', type: 'number', default: 1.0, min: 0.1, max: 10.0, step: 0.1, unit: '%', help: '% of account equity risked per stop-loss' },
  { key: 'leverage', label: 'Default Leverage', group: 'Risk', type: 'number', default: 5, min: 1, max: 50, step: 1, unit: 'x' },
  { key: 'positionSizePct', label: 'Max Margin Allocation Cap', group: 'Risk', type: 'number', default: 5, min: 1, max: 50, step: 1, unit: '%' },
  { key: 'maxStopPct', label: 'Maximum Allowed Stop Loss %', group: 'Risk', type: 'number', default: 8.0, min: 1.0, max: 20.0, step: 0.5, unit: '%', help: 'Hard failsafe ceiling on stop distance' },
  { key: 'scalperMinStopPct', label: 'Scalper Minimum Stop Loss %', group: 'Risk', type: 'number', default: 0.15, min: 0.05, max: 2.0, step: 0.05, unit: '%' },
  { key: 'dailyLossLimitPct', label: 'Daily Loss Circuit Breaker', group: 'Risk', type: 'number', default: 5.0, min: 1.0, max: 20.0, step: 0.5, unit: '%', help: 'Halts new entries when reached' },
  { key: 'maxDrawdownPct', label: 'Max Drawdown Halt', group: 'Risk', type: 'number', default: 15.0, min: 2.0, max: 50.0, step: 1.0, unit: '%' },
  { key: 'killSwitchActive', label: 'Emergency Kill Switch', group: 'Risk', type: 'boolean', default: false },

  // ── BTC Macro Filter ─────────────────────────────────────────────
  { key: 'useGlobalBtcFilter', label: 'Enable BTC Filter', group: 'Regime', type: 'boolean', default: true },
  { key: 'globalFilterSymbol', label: 'BTC Filter Benchmark', group: 'Regime', type: 'select', default: 'BTCUSDT', options: ['BTCUSDT', 'BTC_ETH'] },
  { key: 'btcFilterStrategies', label: 'Strategies Using BTC Filter', group: 'Regime', type: 'multiselect', default: [
    'TREND_PULLBACK',
    'MULTICOIN_SCALPER_PRO',
    'COIL_BREAKOUT',
    'ORDER_BLOCK'
  ], options: [
    'TREND_PULLBACK',
    'MULTICOIN_SCALPER_PRO',
    'COIL_BREAKOUT',
    'ORDER_BLOCK',
    'LIQUIDITY_SWEEP_REVERSAL',
    'RANGE_REGIME_V1'
  ], help: 'BTC filter applied strictly to selected strategies' },

  // ── Regime Engine & Expectancy Matrix ────────────────────────────
  { key: 'matrixGateEnabled', label: 'Regime x Strategy Matrix Gate', group: 'Regime', type: 'boolean', default: true, help: 'Gates strategy execution based on matrix compatibility' },
  { key: 'regimeStrategyMatrix', label: 'Regime Strategy Matrix', group: 'Regime', type: 'object', default: STRATEGIES_BY_REGIME, help: 'Mapping of market regimes to permitted strategies' },
  { key: 'regimeAdxRangeThreshold', label: 'Layer 2 ADX Range Threshold', group: 'Regime', type: 'number', default: 18, min: 10, max: 35, step: 1 },
  { key: 'regimeAdxTrendThreshold', label: 'Layer 2 ADX Trend Threshold', group: 'Regime', type: 'number', default: 25, min: 15, max: 45, step: 1 },
  { key: 'regimeErRangeThreshold', label: 'Layer 2 ER Range Threshold', group: 'Regime', type: 'number', default: 0.20, min: 0.05, max: 0.50, step: 0.01 },
  { key: 'regimeErTrendThreshold', label: 'Layer 2 ER Trend Threshold', group: 'Regime', type: 'number', default: 0.35, min: 0.15, max: 0.70, step: 0.01 },
  { key: 'regimeBbwCompressionPct', label: 'Layer 2 BBW Compression %ile', group: 'Regime', type: 'number', default: 20, min: 5, max: 40, step: 1, unit: '%', help: 'Percentile threshold below which Bollinger Bandwidth votes Compression' },
  { key: 'regimeBbwCompressionWidth', label: 'BBW Compression Width Ratio', group: 'Regime', type: 'number', default: 0.03, min: 0.005, max: 0.10, step: 0.005, help: 'Bandwidth ratio threshold used by Strategy Bucket' },
  { key: 'breadthTopN', label: 'Market Breadth Sample Size (Top N Coins)', group: 'Regime', type: 'number', default: 100, min: 20, max: 200, step: 10, help: 'Number of top volume coins evaluated for market breadth and regime consensus' },
  { key: 'regimeDirectionEnforced', label: 'Enforce Regime Recommended Direction', group: 'Regime', type: 'boolean', default: true },

  // ── Strategy: Trend Pullback Parameters ──────────────────────────
  { key: 'tpExecutionTimeframe', label: 'TP Execution Timeframe', group: 'TrendPullback', type: 'select', default: '15m', options: ['1m', '3m', '5m', '15m', '30m', '1H', '2H', '4H', '1D'] },
  { key: 'tpHigherTimeframe', label: 'TP Higher Timeframe', group: 'TrendPullback', type: 'select', default: '1H', options: ['1m', '3m', '5m', '15m', '30m', '1H', '2H', '4H', '1D'] },
  { key: 'tpEmaMinSeparationPct', label: 'TP Min EMA Separation %', group: 'TrendPullback', type: 'number', default: 0.08, min: 0.01, max: 0.5, step: 0.01, unit: '%', help: 'Requires clear EMA separation to filter out sideways tangles' },
  { key: 'tpRequireSwingStructure', label: 'TP Require Swing Structure', group: 'TrendPullback', type: 'boolean', default: false, help: 'Scored point rather than a hard veto' },
  { key: 'tpDojiBodyPct', label: 'TP Doji Body % Cap', group: 'TrendPullback', type: 'number', default: 10, min: 2, max: 30, step: 1, unit: '%' },
  { key: 'tpRejectionWickPct', label: 'TP Rejection Wick % Floor', group: 'TrendPullback', type: 'number', default: 40, min: 20, max: 70, step: 1, unit: '%' },
  { key: 'tpUpperWickVetoPct', label: 'TP Opposing Wick Veto %', group: 'TrendPullback', type: 'number', default: 45, min: 20, max: 80, step: 1, unit: '%' },
  { key: 'tpOverextensionAtr', label: 'TP Overextension ATR Limit', group: 'TrendPullback', type: 'number', default: 3.0, min: 1.5, max: 6.0, step: 0.1 },
  { key: 'tpTargetR', label: 'TP Target R Multiple', group: 'TrendPullback', type: 'number', default: 2.5, min: 1.0, max: 5.0, step: 0.1, help: 'High 2.5:1 base target reward-to-risk ratio' },
  { key: 'tpStructuralStopBufferAtr', label: 'TP Structural Stop Buffer ATR', group: 'TrendPullback', type: 'number', default: 0.2, min: 0.05, max: 1.0, step: 0.05 },
  { key: 'tpMaxStopDistanceATR', label: 'TP Max Stop Distance ATR', group: 'TrendPullback', type: 'number', default: 2.5, min: 0.5, max: 5.0, step: 0.1 },

  // ── Strategy: Range Regime V1 ────────────────────────────────────
  { key: 'rangeRegimeParams', label: 'Range Regime V1 Config', group: 'RangeRegime', type: 'object', default: RANGE_REGIME_DEFAULTS },

  // ── Strategy: Liquidity Sweep Reversal (LSR) ─────────────────────
  { key: 'lsrExecutionTimeframe', label: 'LSR Execution Timeframe', group: 'LSR', type: 'select', default: '15m', options: ['1m', '3m', '5m', '15m', '30m', '1H', '2H', '4H', '1D'] },
  { key: 'lsrContextTimeframe', label: 'LSR Context Timeframe', group: 'LSR', type: 'select', default: '1H', options: ['1m', '3m', '5m', '15m', '30m', '1H', '2H', '4H', '1D'] },
  { key: 'lsrMinRewardRisk', label: 'LSR Min R:R', group: 'LSR', type: 'number', default: 3.0, min: 1.5, max: 6.0, step: 0.1, help: 'Minimum 3.0:1 reward-to-risk on liquidity sweep reversals' },
  { key: 'lsrPreset', label: 'LSR Mode Preset', group: 'LSR', type: 'select', default: 'Strict', options: ['Strict', 'Balanced', 'Aggressive'], help: 'Strict preset requires high-tier pools and volume spike' },

  // ── Strategy: Volatility Compression Breakout (VCB) ──────────────
  { key: 'vcbParams', label: 'VCB Parameters', group: 'VCB', type: 'object', default: VCB_DEFAULTS },

  // ── Credentials & External Alerts ────────────────────────────────
  { key: 'telegramBotToken', label: 'Telegram Bot Token', group: 'Credentials', type: 'string', default: '' },
  { key: 'telegramChatId', label: 'Telegram Chat ID', group: 'Credentials', type: 'string', default: '' },
  { key: 'binanceApiKey', label: 'Binance API Key', group: 'Credentials', type: 'string', default: '' },
  { key: 'binanceApiSecret', label: 'Binance API Secret', group: 'Credentials', type: 'string', default: '' },
  { key: 'binanceTestnet', label: 'Binance Futures Testnet', group: 'Credentials', type: 'boolean', default: false },
  { key: 'coindcxApiKey', label: 'CoinDCX API Key', group: 'Credentials', type: 'string', default: '' },
  { key: 'coindcxApiSecret', label: 'CoinDCX API Secret', group: 'Credentials', type: 'string', default: '' },
  { key: 'coindcxMarginCurrency', label: 'CoinDCX Margin Currency', group: 'Credentials', type: 'select', default: 'INR', options: ['INR', 'USDT'] },
  { key: 'coindcxProxyUrl', label: 'CoinDCX Outbound Proxy (Optional)', group: 'Credentials', type: 'string', default: '' },
  { key: 'githubPat', label: 'GitHub PAT', group: 'Credentials', type: 'string', default: '' },
  { key: 'githubRepoUrl', label: 'GitHub Repo URL', group: 'Credentials', type: 'string', default: 'https://github.com/danish7355/quant-stack.git' },

  // ── Alerts & Notifications ───────────────────────────────────────
  { key: 'alertOnTradeExecuted', label: 'Alert on Trade Executed', group: 'Alerts', type: 'boolean', default: true },
  { key: 'alertOnTpHit', label: 'Alert on TP Hit', group: 'Alerts', type: 'boolean', default: true },
  { key: 'alertOnSlHit', label: 'Alert on SL Hit', group: 'Alerts', type: 'boolean', default: true },
  { key: 'alertOnTsMoved', label: 'Alert on Breakeven / Trail Moved', group: 'Alerts', type: 'boolean', default: false },
  { key: 'alertOnDailyLossLimit', label: 'Alert on Daily Loss Trigger', group: 'Alerts', type: 'boolean', default: true }
];

export const DEFAULT_SETTINGS: Record<string, any> = Object.fromEntries(
  SETTINGS_SCHEMA.map(s => [s.key, s.default])
);

/**
 * One-time Schema Migrator for Phase 3 settings
 */
export function migrateSettings(rawSettings: any): any {
  if (!rawSettings || typeof rawSettings !== 'object') return rawSettings;
  const migrated = { ...rawSettings };
  const currentVer = Number(migrated.schemaVersion ?? 1);

  if (currentVer < 2) {
    if (migrated.maxFeeDragPctOf1R === 15 || migrated.maxFeeDragPctOf1R === 15.0) {
      migrated.maxFeeDragPctOf1R = 25;
    }
    if (migrated.layer3MinAtrPct === 0.15) {
      migrated.layer3MinAtrPct = 0.08;
    }
    if (migrated.layer3MaxFeeToAtr === 0.35) {
      migrated.layer3MaxFeeToAtr = 0.50;
    }
    if (migrated.layer3MaxSpreadBps === 10) {
      migrated.layer3MaxSpreadBps = 15;
    }
    if (migrated.maxStopPct === 4 || migrated.maxStopPct === 4.5) {
      migrated.maxStopPct = 8.0;
    }
    if (migrated.scalperMinStopPct === 0.20 || migrated.scalperMinStopPct === 0.30) {
      migrated.scalperMinStopPct = 0.15;
    }
    if (migrated.regimeAdxRangeThreshold === 20) {
      migrated.regimeAdxRangeThreshold = 18;
    }
    if (migrated.regimeErRangeThreshold === 0.25) {
      migrated.regimeErRangeThreshold = 0.20;
    }
    if (migrated.regimeErTrendThreshold === 0.30) {
      migrated.regimeErTrendThreshold = 0.35;
    }
    if (migrated.tpEmaMinSeparationPct === 0.10) {
      migrated.tpEmaMinSeparationPct = 0.05;
    }
    if (migrated.tpRequireSwingStructure === true) {
      migrated.tpRequireSwingStructure = false;
    }
    if (migrated.tpDojiBodyPct === 15) {
      migrated.tpDojiBodyPct = 10;
    }
    if (migrated.tpRejectionWickPct === 50) {
      migrated.tpRejectionWickPct = 40;
    }
    if (migrated.tpUpperWickVetoPct === 35) {
      migrated.tpUpperWickVetoPct = 45;
    }
    if (migrated.strategyScoreThresholds?.TREND_PULLBACK === 75) {
      migrated.strategyScoreThresholds.TREND_PULLBACK = 70;
    }
    // Migrate BBW settings
    if (migrated.regimeBandwidthCompressionCutoff !== undefined && migrated.regimeBbwCompressionWidth === undefined) {
      if (migrated.regimeBandwidthCompressionCutoff <= 1) {
        migrated.regimeBbwCompressionWidth = migrated.regimeBandwidthCompressionCutoff;
      }
    }
    if (migrated.regimeBbwCompressionThreshold !== undefined) {
      if (migrated.regimeBbwCompressionThreshold > 1 && migrated.regimeBbwCompressionPct === undefined) {
        migrated.regimeBbwCompressionPct = migrated.regimeBbwCompressionThreshold;
      } else if (migrated.regimeBbwCompressionThreshold <= 1 && migrated.regimeBbwCompressionWidth === undefined) {
        migrated.regimeBbwCompressionWidth = migrated.regimeBbwCompressionThreshold;
      }
    }
    migrated.regimeBbwCompressionPct = migrated.regimeBbwCompressionPct ?? 20;
    migrated.regimeBbwCompressionWidth = migrated.regimeBbwCompressionWidth ?? 0.03;
    migrated.htfAgreementMode = migrated.htfAgreementMode ?? 'OPPOSITE_ONLY';
    migrated.rangeMacroGate = migrated.rangeMacroGate ?? 'ADX_ONLY';
    migrated.rangeRequireTwoCandle = migrated.rangeRequireTwoCandle ?? false;
    migrated.breadthTopN = migrated.breadthTopN ?? 100;
    migrated.schemaVersion = 2;
  }
  if (currentVer < 3) {
    if (migrated.tpMaxStopDistanceATR === 1.5) migrated.tpMaxStopDistanceATR = 2.5;
    migrated.schemaVersion = 3;
  }
  if (currentVer < 4) {
    if (migrated.autoTradeThreshold === 75 || !migrated.autoTradeThreshold) {
      migrated.autoTradeThreshold = 60;
    }
    if (migrated.minRRRatio === 1.5 || !migrated.minRRRatio) {
      migrated.minRRRatio = 1.3;
    }
    if (migrated.strategyScoreThresholds) {
      if (migrated.strategyScoreThresholds.LIQUIDITY_SWEEP_REVERSAL === 75) migrated.strategyScoreThresholds.LIQUIDITY_SWEEP_REVERSAL = 60;
      if (migrated.strategyScoreThresholds.ORDER_BLOCK === 75) migrated.strategyScoreThresholds.ORDER_BLOCK = 60;
      if (migrated.strategyScoreThresholds.TREND_PULLBACK === 70 || migrated.strategyScoreThresholds.TREND_PULLBACK === 75) migrated.strategyScoreThresholds.TREND_PULLBACK = 60;
      if (migrated.strategyScoreThresholds.COIL_BREAKOUT === 75) migrated.strategyScoreThresholds.COIL_BREAKOUT = 60;
      if (migrated.strategyScoreThresholds.MULTICOIN_SCALPER_PRO === 75) migrated.strategyScoreThresholds.MULTICOIN_SCALPER_PRO = 55;
    }
    if (migrated.rangeRegimeParams) {
      if (migrated.rangeRegimeParams.edgeZonePct === 0.2) migrated.rangeRegimeParams.edgeZonePct = 0.28;
      if (migrated.rangeRegimeParams.tp1Mode === 'NEAREST_LEVEL') migrated.rangeRegimeParams.tp1Mode = 'MID';
      if (migrated.rangeRegimeParams.adxHardMax === 30) migrated.rangeRegimeParams.adxHardMax = 32;
    }
    migrated.schemaVersion = 4;
  }
  if (currentVer < 5) {
    // Phase 5: High Win-Rate & High R:R Optimization
    migrated.autoTradeThreshold = Math.max(72, Number(migrated.autoTradeThreshold || 72));
    migrated.minRRRatio = Math.max(2.0, Number(migrated.minRRRatio || 2.0));
    migrated.htfAgreementMode = 'STRICT';
    migrated.rangeRequireTwoCandle = true;
    migrated.maxFeeDragPctOf1R = 15;
    migrated.layer3MaxSpreadBps = 10;
    migrated.layer3MinAtrPct = 0.12;
    migrated.layer3MaxFeeToAtr = 0.35;
    migrated.min24hVolume = Math.max(20000000, Number(migrated.min24hVolume || 20000000));
    migrated.maxFundingRate = 0.05;
    migrated.tpTargetR = Math.max(2.5, Number(migrated.tpTargetR || 2.5));
    migrated.tpEmaMinSeparationPct = 0.08;
    migrated.lsrMinRewardRisk = Math.max(3.0, Number(migrated.lsrMinRewardRisk || 3.0));
    migrated.lsrPreset = 'Strict';
    if (!migrated.strategyScoreThresholds) {
      migrated.strategyScoreThresholds = {};
    }
    migrated.strategyScoreThresholds.RANGE_REGIME_V1 = Math.max(72, Number(migrated.strategyScoreThresholds.RANGE_REGIME_V1 || 72));
    migrated.strategyScoreThresholds.LIQUIDITY_SWEEP_REVERSAL = Math.max(72, Number(migrated.strategyScoreThresholds.LIQUIDITY_SWEEP_REVERSAL || 72));
    migrated.strategyScoreThresholds.ORDER_BLOCK = Math.max(75, Number(migrated.strategyScoreThresholds.ORDER_BLOCK || 75));
    migrated.strategyScoreThresholds.TREND_PULLBACK = Math.max(72, Number(migrated.strategyScoreThresholds.TREND_PULLBACK || 72));
    migrated.strategyScoreThresholds.COIL_BREAKOUT = Math.max(75, Number(migrated.strategyScoreThresholds.COIL_BREAKOUT || 75));
    migrated.strategyScoreThresholds.MULTICOIN_SCALPER_PRO = Math.max(70, Number(migrated.strategyScoreThresholds.MULTICOIN_SCALPER_PRO || 70));
    migrated.strategyScoreThresholds.BINANCE_COMPOSITE = Math.max(72, Number(migrated.strategyScoreThresholds.BINANCE_COMPOSITE || 72));
    migrated.strategyScoreThresholds.DELTA_CLIMAX = Math.max(72, Number(migrated.strategyScoreThresholds.DELTA_CLIMAX || 72));
    migrated.strategyScoreThresholds.VCB = Math.max(72, Number(migrated.strategyScoreThresholds.VCB || 72));

    // Centralised Take Profit Architecture (2.0R / 3.5R / 5.0R)
    migrated.centralisedTp1Value = Math.max(2.0, Number(migrated.centralisedTp1Value || 2.0));
    migrated.centralisedTp2Value = Math.max(3.5, Number(migrated.centralisedTp2Value || 3.5));
    migrated.centralisedTp3Value = Math.max(5.0, Number(migrated.centralisedTp3Value || 5.0));
    migrated.centralisedTp1ClosePct = 40;
    migrated.centralisedTp2ClosePct = 35;
    migrated.centralisedTp3ClosePct = 25;
    migrated.centralisedTpMoveToBe = true;
    migrated.schemaVersion = 5;
  }
  // Centralised Take Profit architecture fallback initialization
  migrated.centralisedTpEnabled = migrated.centralisedTpEnabled ?? true;
  migrated.centralisedTpMode = migrated.centralisedTpMode ?? 'R_MULTIPLE';
  migrated.centralisedTp1Value = migrated.centralisedTp1Value ?? 2.0;
  migrated.centralisedTp2Value = migrated.centralisedTp2Value ?? 3.5;
  migrated.centralisedTp3Value = migrated.centralisedTp3Value ?? 5.0;
  migrated.centralisedTp1ClosePct = migrated.centralisedTp1ClosePct ?? 40;
  migrated.centralisedTp2ClosePct = migrated.centralisedTp2ClosePct ?? 35;
  migrated.centralisedTp3ClosePct = migrated.centralisedTp3ClosePct ?? 25;
  migrated.centralisedTpMoveToBe = migrated.centralisedTpMoveToBe ?? true;
  migrated.centralisedTpOverrideStrategy = migrated.centralisedTpOverrideStrategy ?? false;
  return migrated;
}

/**
 * Universal Settings Validator and Clamper
 * Enforces boundaries and clamps out-of-bounds numeric parameters.
 */
export function validateSettings(input: any): { valid: boolean; errors: string[]; sanitized: Record<string, any> } {
  const errors: string[] = [];
  const migratedInput = migrateSettings(input);
  const sanitized: Record<string, any> = { ...migratedInput };

  for (const def of SETTINGS_SCHEMA) {
    const val = migratedInput[def.key];
    if (val === undefined || val === null) {
      continue;
    }

    if (def.type === 'number') {
      const num = Number(val);
      if (isNaN(num)) {
        errors.push(`${def.label} (${def.key}) must be a valid number`);
        continue;
      }
      if (def.min !== undefined && num < def.min) {
        sanitized[def.key] = def.min;
      } else if (def.max !== undefined && num > def.max) {
        sanitized[def.key] = def.max;
      } else {
        sanitized[def.key] = num;
      }
    } else if (def.type === 'boolean') {
      sanitized[def.key] = Boolean(val);
    } else if (def.type === 'select' && def.options) {
      const canonical = def.options.find(o => o.toLowerCase() === String(val).toLowerCase());
      sanitized[def.key] = canonical !== undefined ? canonical : def.default;
    } else if (def.type === 'multiselect' && Array.isArray(val) && def.options) {
      sanitized[def.key] = val
        .map(item => def.options!.find(o => o.toLowerCase() === String(item).toLowerCase()))
        .filter((item): item is string => item !== undefined);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    sanitized
  };
}
