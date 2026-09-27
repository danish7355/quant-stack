import React, { useState } from 'react';
import { 
  Zap, AlertTriangle, ShieldAlert, Play, Square, Settings as SettingsIcon, 
  RefreshCw, GitBranch, ChevronDown, ChevronUp, CheckCircle2, XCircle, Clock,
  X, ShieldCheck, Activity, HelpCircle, Shield
} from 'lucide-react';
import { AppSettings, SystemHealth } from '../types';

export interface TradeEngineBannerProps {
  engineRunning: boolean;
  settings: AppSettings;
  connectionStatus: 'CONNECTED' | 'DISCONNECTED' | 'CONNECTING';
  isStale: boolean;
  settingsLoadError: string | null;
  globalFilterState: { isPausing: boolean; reason: string | null };
  systemHealth?: SystemHealth | null;
  onToggleEngine: () => void;
  onOpenSettings?: () => void;
  onOpenStrategy?: () => void;
  onRetrySettings?: () => void;
  onRefreshFeed?: () => void;
  onDisableKillSwitch?: () => void;
}

export interface StrategyMeta {
  id: string;
  name: string;
  shortName: string;
  tag: string;
  badgeBg: string;
  description: string;
}

export function getStrategyDisplayName(strategyKey?: string): { 
  name: string; 
  tag: string; 
  description: string;
  shortName: string;
  badgeBg: string;
} {
  switch (strategyKey) {
    case 'VOLATILITY_COMPRESSION':
      return {
        name: 'Volatility Compression Breakout (VCB)',
        shortName: 'VCB Breakout',
        tag: 'BREAKOUT',
        badgeBg: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
        description: 'Bollinger/Keltner squeeze compression to directional volume expansion with retest & follow-through gates.'
      };
    case 'SMC_LIQUIDITY_SWEEP':
    case 'LIQUIDITY_SWEEP_REVERSAL':
      return {
        name: 'Smart Money Concepts (SMC Liquidity Sweep)',
        shortName: 'SMC Liquidity',
        tag: 'INSTITUTIONAL',
        badgeBg: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
        description: 'Liquidity pool sweeps, MSS displacement shifts, and Fair Value Gap (FVG) / Order Block retests.'
      };
    case 'TREND_PULLBACK':
      return {
        name: 'Trend Pullback Continuation',
        shortName: 'Trend Pullback',
        tag: 'TREND-FOLLOWING',
        badgeBg: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
        description: 'Controlled pullback to rising/falling moving averages with ADX trend strength and structural retest.'
      };
    case 'EMA5_EXACT_ENTRY_V1':
      return {
        name: 'EMA 5 Exact Price Action Entry',
        shortName: 'EMA 5 Exact',
        tag: 'EXACT ENTRY',
        badgeBg: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
        description: 'Exact EMA 5 price-action pattern trigger with 15m structure regime and volume confirmation filter.'
      };
    case 'EMA5_REJECTION_RECLAIM_V1':
      return {
        name: 'EMA 5 Rejection → Reclaim → Displacement',
        shortName: 'EMA 5 Reclaim',
        tag: 'REVERSAL/RECLAIM',
        badgeBg: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
        description: 'Sequence: Approach → Sweep/Rejection wick → EMA 5 Reclaim → Displacement candle → Volume confirmation.'
      };
    case 'TREND_PULLBACK_RETEST':
      return {
        name: 'Trend Pullback Retest (State Machine)',
        shortName: 'Pullback Retest',
        tag: 'CONTINUATION',
        badgeBg: 'bg-sky-500/20 text-sky-300 border-sky-500/40',
        description: 'Full 5-stage state machine: trend detected → pullback → EMA retest → confirmation candle → entry.'
      };
    case 'EMA5_PA_VOLUME_V1':
      return {
        name: 'EMA 5 Price Action Gap + Volume',
        shortName: 'EMA 5 PA Vol',
        tag: 'PRICE ACTION',
        badgeBg: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
        description: 'Standalone 5m pure price action + volume gap strategy strictly filtered by 15m market structure swings.'
      };
    case 'EMA_GAP_PULLBACK':
      return {
        name: '5 EMA Gap Pullback Continuation',
        shortName: '5 EMA Gap',
        tag: 'PULLBACK',
        badgeBg: 'bg-teal-500/20 text-teal-300 border-teal-500/40',
        description: '5 EMA gap candle breakout following structured pullback with HTF 50 EMA trend alignment and anti-overextension guard.'
      };
    case 'DELTA_CLIMAX':
      return {
        name: 'Delta Climax Reversal',
        shortName: 'Delta Climax',
        tag: 'REVERSAL',
        badgeBg: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
        description: 'Exhaustion volume spikes with rejection wicks and momentum divergence at macro extremes.'
      };
    case 'EARLY_COIL_BREAKOUT':
      return {
        name: 'Early Coil Breakout',
        shortName: 'Early Coil',
        tag: 'MOMENTUM',
        badgeBg: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40',
        description: 'Pre-blast micro-consolidation detection for early high-conviction breakout entries.'
      };
    case 'MACRO_RANGE_BREAKOUT':
      return {
        name: 'Macro Range Box Breakout',
        shortName: 'Macro Box',
        tag: 'RANGE',
        badgeBg: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
        description: 'Darvas box accumulation breakout targeting long-term trending expansions above multi-week range highs.'
      };
    case 'AUTO_REGIME':
      return {
        name: 'Autonomous Multi-Regime Auto-Selector',
        shortName: 'Auto Regime',
        tag: 'HYBRID',
        badgeBg: 'bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-500/40',
        description: 'Dynamically routes market conditions to the optimal strategy algorithm per asset regime.'
      };
    case 'BINANCE_COMPOSITE':
    default:
      return {
        name: 'Binance Composite Technical Scoring',
        shortName: 'Composite Score',
        tag: 'COMPOSITE',
        badgeBg: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',
        description: 'Multi-factor technical consensus combining EMAs, RSI, MACD, ADX, SuperTrend, and Volume.'
      };
  }
}

export function getActiveStrategiesList(settings: AppSettings): StrategyMeta[] {
  let keys: string[] = [];
  if (settings.enabledStrategies && Array.isArray(settings.enabledStrategies) && settings.enabledStrategies.length > 0) {
    keys = settings.enabledStrategies;
  } else if (settings.activeStrategy) {
    keys = [settings.activeStrategy];
  } else {
    keys = ['VOLATILITY_COMPRESSION'];
  }

  // Deduplicate keys preserving order
  const uniqueKeys = Array.from(new Set(keys.filter((k): k is string => typeof k === 'string' && k.length > 0)));
  return uniqueKeys.map(k => ({
    id: k,
    ...getStrategyDisplayName(k)
  }));
}

export interface GateCheckItem {
  id: string;
  label: string;
  category: 'SYSTEM' | 'MARKET' | 'RISK';
  status: 'PASS' | 'BLOCK' | 'WARN';
  value: string;
  detail: string;
}

export interface EngineStatusEvaluation {
  isActive: boolean;
  primaryReason: string;
  allReasons: string[];
  severity: 'ACTIVE' | 'WARNING' | 'CRITICAL';
  actionType?: 'START_ENGINE' | 'DISABLE_KILL_SWITCH' | 'OPEN_SETTINGS' | 'RETRY_SETTINGS' | 'RECONNECT_FEED';
  strategyName: string;
  strategyTag: string;
  strategyDescription: string;
  activeStrategies: StrategyMeta[];
  activeStrategyCount: number;
  gateChecklist: GateCheckItem[];
}

export function evaluateEngineStatus(
  engineRunning: boolean,
  settings: AppSettings,
  connectionStatus: 'CONNECTED' | 'DISCONNECTED' | 'CONNECTING',
  isStale: boolean,
  settingsLoadError: string | null,
  globalFilterState: { isPausing: boolean; reason: string | null },
  systemHealth?: SystemHealth | null
): EngineStatusEvaluation {
  const reasons: string[] = [];
  const activeStrategies = getActiveStrategiesList(settings);
  const isMulti = activeStrategies.length > 1;
  const stratNames = activeStrategies.map(s => s.shortName).join(', ');
  const strategyName = isMulti
    ? `${activeStrategies.length} Strategies (${activeStrategies.map(s => s.shortName).join(' • ')})`
    : activeStrategies[0].name;
  const strategyTag = isMulti ? `${activeStrategies.length} ACTIVE` : activeStrategies[0].tag;
  const strategyDescription = isMulti
    ? `Active Multi-Strategy Suite (${activeStrategies.length} enabled): ${activeStrategies.map(s => `${s.shortName}: ${s.description}`).join(' | ')}`
    : activeStrategies[0].description;

  // 1. Critical Errors & Engine State
  if (settingsLoadError) {
    reasons.push('Configuration Error: Settings failed to load from server. Running display-only defaults.');
  }

  if (settings.killSwitchActive) {
    reasons.push('Emergency Kill Switch is ENGAGED. All autonomous and manual new orders are halted.');
  }

  if (!engineRunning || settings.autoTradeEnabled === false) {
    reasons.push('Trading Engine is STOPPED by operator. Autonomous scanning and new trade execution are paused.');
  }

  // 2. Feed & Connectivity
  if (connectionStatus === 'DISCONNECTED') {
    reasons.push('Market data feed is DISCONNECTED. Waiting for tick stream reconnection.');
  } else if (isStale || systemHealth?.marketData === 'STALE') {
    reasons.push('Price data stream is STALE (>10s without ticks). New entries paused for price integrity.');
  }

  // 3. Global Market Safety Filter
  if (globalFilterState.isPausing || systemHealth?.globalFilterActive) {
    const filterReason = globalFilterState.reason || systemHealth?.globalFilterReason || 'BTC volatility spike / market regime dump';
    reasons.push(`Global Market Safety Filter Active: ${filterReason}. Entries blocked to protect capital.`);
  }

  // 4. API Credentials for Live Trading
  if (settings.tradingMode === 'LIVE') {
    if (!settings.binanceApiKey || !settings.binanceApiSecret || settings.binanceApiKey.trim() === '' || settings.binanceApiSecret.trim() === '') {
      reasons.push('Live Trading is enabled but Binance API Key or Secret is missing or invalid.');
    }
  }

  // 5. Risk Limits (Max Positions, Daily Loss, Consecutive Losses)
  if (
    systemHealth?.activePositions !== undefined &&
    systemHealth?.maxConcurrentTrades !== undefined &&
    systemHealth.activePositions >= systemHealth.maxConcurrentTrades &&
    systemHealth.maxConcurrentTrades > 0
  ) {
    reasons.push(`Max concurrent positions limit reached (${systemHealth.activePositions}/${systemHealth.maxConcurrentTrades}). Order entry paused until a position closes.`);
  }

  if (
    systemHealth?.dailyLossPct !== undefined &&
    systemHealth?.dailyLossLimitPct !== undefined &&
    systemHealth.dailyLossPct <= systemHealth.dailyLossLimitPct
  ) {
    reasons.push(`Daily loss limit reached (${systemHealth.dailyLossPct.toFixed(2)}% / ${systemHealth.dailyLossLimitPct}%). Autonomous trading locked for capital preservation.`);
  }

  if (
    systemHealth?.consecutiveLosses !== undefined &&
    systemHealth?.maxConsecutiveLosses !== undefined &&
    systemHealth.consecutiveLosses >= systemHealth.maxConsecutiveLosses &&
    systemHealth.maxConsecutiveLosses > 0
  ) {
    reasons.push(`Consecutive loss limit reached (${systemHealth.consecutiveLosses}/${systemHealth.maxConsecutiveLosses} losses). Cooling down.`);
  }

  // Include any other server-reported active blockers
  if (systemHealth?.activeBlockers && Array.isArray(systemHealth.activeBlockers)) {
    for (const b of systemHealth.activeBlockers) {
      if (typeof b === 'string' && b.trim().length > 0) {
        const alreadyCovered = reasons.some(r => r.toLowerCase().includes(b.toLowerCase().slice(0, 15)));
        if (!alreadyCovered) {
          reasons.push(b);
        }
      }
    }
  }

  // Construct the 10-Gate Audit Checklist
  const isEngineOk = Boolean(engineRunning && settings.autoTradeEnabled !== false);
  const isFeedOk = connectionStatus === 'CONNECTED' && !isStale && systemHealth?.marketData !== 'STALE';
  const isKillSwitchOk = !settings.killSwitchActive;
  const isMacroFilterOk = !globalFilterState.isPausing && !systemHealth?.globalFilterActive;
  const isPositionsOk = !(
    systemHealth?.activePositions !== undefined &&
    systemHealth?.maxConcurrentTrades !== undefined &&
    systemHealth.activePositions >= systemHealth.maxConcurrentTrades &&
    systemHealth.maxConcurrentTrades > 0
  );
  const isDailyLossOk = !(
    systemHealth?.dailyLossPct !== undefined &&
    systemHealth?.dailyLossLimitPct !== undefined &&
    systemHealth.dailyLossPct <= systemHealth.dailyLossLimitPct
  );
  const isLossStreakOk = !(
    systemHealth?.consecutiveLosses !== undefined &&
    systemHealth?.maxConsecutiveLosses !== undefined &&
    systemHealth.consecutiveLosses >= systemHealth.maxConsecutiveLosses &&
    systemHealth.maxConsecutiveLosses > 0
  );
  const isLiveKeysOk = settings.tradingMode !== 'LIVE' || Boolean(
    settings.binanceApiKey && settings.binanceApiSecret &&
    settings.binanceApiKey.trim() !== '' && settings.binanceApiSecret.trim() !== ''
  );
  const isStrategiesOk = activeStrategies.length > 0;
  const isScannerOk = isEngineOk && isFeedOk;

  const gateChecklist: GateCheckItem[] = [
    {
      id: 'engine',
      label: 'Engine Master Switch',
      category: 'SYSTEM',
      status: isEngineOk ? 'PASS' : 'BLOCK',
      value: isEngineOk ? 'RUNNING (24/7)' : 'STOPPED',
      detail: isEngineOk ? 'Autonomous scanner & order placement pipeline active' : 'Engine paused by operator — no new orders'
    },
    {
      id: 'feed',
      label: 'Market Price Stream',
      category: 'SYSTEM',
      status: isFeedOk ? 'PASS' : 'BLOCK',
      value: isFeedOk ? 'LIVE (FRESH)' : (isStale ? 'STALE (>10s)' : connectionStatus),
      detail: isFeedOk ? 'Real-time WebSocket tick stream connected with sub-second latency' : 'Data feed disconnected or stale; orders gated for safety'
    },
    {
      id: 'scanner',
      label: 'Scanner Loop Activity',
      category: 'SYSTEM',
      status: isScannerOk ? 'PASS' : 'WARN',
      value: systemHealth?.lastScannedCoins ? `${systemHealth.lastScannedCoins} Pairs Active` : `${settings.coinCount || 100} Pairs / 5s`,
      detail: systemHealth?.lastScanTime 
        ? `Last scan cycle at ${new Date(systemHealth.lastScanTime).toLocaleTimeString()} (${systemHealth.lastScanDurationMs ? `${systemHealth.lastScanDurationMs}ms` : 'instant'})`
        : 'Continuous 5-second scan loop monitoring all top-volume pairs'
    },
    {
      id: 'macroFilter',
      label: 'Global BTC Macro Guard',
      category: 'MARKET',
      status: isMacroFilterOk ? 'PASS' : 'BLOCK',
      value: isMacroFilterOk ? 'CLEAR (TRADABLE)' : 'PAUSED (BTC SAFETY)',
      detail: isMacroFilterOk ? 'BTC macro regime tradable — altcoin new setups permitted' : (globalFilterState.reason || systemHealth?.globalFilterReason || 'BTC volatility spike / panic drop lockout')
    },
    {
      id: 'positionsLimit',
      label: 'Open Positions Capacity',
      category: 'RISK',
      status: isPositionsOk ? 'PASS' : 'BLOCK',
      value: (systemHealth?.activePositions !== undefined && systemHealth?.maxConcurrentTrades !== undefined)
        ? `${systemHealth.activePositions} / ${systemHealth.maxConcurrentTrades} in use`
        : `Max ${settings.maxConcurrentTrades || 3} Concurrent`,
      detail: isPositionsOk
        ? (systemHealth?.activePositions !== undefined && systemHealth?.maxConcurrentTrades !== undefined
            ? `${systemHealth.maxConcurrentTrades - systemHealth.activePositions} open slot(s) ready for new setups`
            : 'Sufficient open position capacity')
        : `All ${systemHealth?.maxConcurrentTrades} position slots full. Waiting for an open position to close (TP/SL).`
    },
    {
      id: 'dailyLoss',
      label: 'Daily Loss Circuit Breaker',
      category: 'RISK',
      status: isDailyLossOk ? (systemHealth?.dailyLossPct && systemHealth.dailyLossPct < 0 ? 'WARN' : 'PASS') : 'BLOCK',
      value: systemHealth?.dailyLossPct !== undefined
        ? `${systemHealth.dailyLossPct.toFixed(2)}% (Limit: ${systemHealth.dailyLossLimitPct ?? -Math.abs(settings.dailyLossLimitPct || 3)}%)`
        : `Limit: ${settings.dailyLossLimitPct || 3}%`,
      detail: isDailyLossOk
        ? 'Account is safely within the daily loss tolerance limit'
        : 'Daily loss limit reached. Trading halted until the daily reset to protect capital.'
    },
    {
      id: 'consecutiveLosses',
      label: 'Consecutive Loss Cooldown',
      category: 'RISK',
      status: isLossStreakOk ? 'PASS' : 'BLOCK',
      value: systemHealth?.consecutiveLosses !== undefined
        ? `${systemHealth.consecutiveLosses} / ${systemHealth.maxConsecutiveLosses ?? settings.maxConsecutiveLosses ?? 4} Losses`
        : `Max ${settings.maxConsecutiveLosses || 4} Losses`,
      detail: isLossStreakOk ? 'Loss streak counter clear; no cooldown enforced' : 'Loss streak cooldown active. Paused to prevent emotional drawdown.'
    },
    {
      id: 'killSwitch',
      label: 'Emergency Kill Switch',
      category: 'RISK',
      status: isKillSwitchOk ? 'PASS' : 'BLOCK',
      value: isKillSwitchOk ? 'DISARMED (NORMAL)' : 'ENGAGED (HALT)',
      detail: isKillSwitchOk ? 'Emergency kill switch is off; autonomous trades permitted' : 'Emergency kill switch active; all orders blocked'
    },
    {
      id: 'strategies',
      label: 'Strategy Suite Armed',
      category: 'MARKET',
      status: isStrategiesOk ? 'PASS' : 'BLOCK',
      value: `${activeStrategies.length} Active`,
      detail: activeStrategies.map(s => s.shortName).join(' • ')
    },
    {
      id: 'credentials',
      label: 'Execution Mode & Keys',
      category: 'SYSTEM',
      status: isLiveKeysOk ? 'PASS' : 'BLOCK',
      value: settings.tradingMode === 'LIVE' ? 'LIVE BINANCE' : (settings.binanceTestnet ? 'BINANCE TESTNET' : 'PAPER TRADING'),
      detail: settings.tradingMode === 'LIVE' 
        ? (isLiveKeysOk ? 'Binance Futures API keys configured' : 'API Key or Secret missing in Settings')
        : 'Paper trading with live tick book data'
    }
  ];

  const isActive = reasons.length === 0;

  if (isActive) {
    const primaryReason = isMulti
      ? `Trading Engine is ACTIVE and executing ${activeStrategies.length} strategies (${stratNames}).`
      : `Trading Engine is ACTIVE and executing ${activeStrategies[0].name}.`;

    return {
      isActive: true,
      primaryReason,
      allReasons: [],
      severity: 'ACTIVE',
      strategyName,
      strategyTag,
      strategyDescription,
      activeStrategies,
      activeStrategyCount: activeStrategies.length,
      gateChecklist
    };
  }

  let actionType: EngineStatusEvaluation['actionType'];
  if (!engineRunning || settings.autoTradeEnabled === false) {
    actionType = 'START_ENGINE';
  } else if (settings.killSwitchActive) {
    actionType = 'DISABLE_KILL_SWITCH';
  } else if (settingsLoadError) {
    actionType = 'RETRY_SETTINGS';
  } else if (isStale || connectionStatus === 'DISCONNECTED') {
    actionType = 'RECONNECT_FEED';
  } else {
    actionType = 'OPEN_SETTINGS';
  }

  const isCritical = Boolean(settingsLoadError || settings.killSwitchActive || !engineRunning || settings.autoTradeEnabled === false);

  return {
    isActive: false,
    primaryReason: reasons[0],
    allReasons: reasons,
    severity: isCritical ? 'CRITICAL' : 'WARNING',
    actionType,
    strategyName,
    strategyTag,
    strategyDescription,
    activeStrategies,
    activeStrategyCount: activeStrategies.length,
    gateChecklist
  };
}

export interface TradeDiagnosticsModalProps {
  evaluation: EngineStatusEvaluation;
  settings: AppSettings;
  systemHealth?: SystemHealth | null;
  coinCount: number;
  scanInterval: number;
  modeLabel: string;
  onClose: () => void;
  onOpenSettings?: () => void;
  onOpenStrategy?: () => void;
  onToggleEngine: () => void;
  onDisableKillSwitch?: () => void;
  onRefreshFeed?: () => void;
}

export function TradeDiagnosticsModal({
  evaluation,
  settings,
  systemHealth,
  coinCount,
  scanInterval,
  modeLabel,
  onClose,
  onOpenSettings,
  onOpenStrategy,
  onToggleEngine,
  onDisableKillSwitch,
  onRefreshFeed
}: TradeDiagnosticsModalProps) {
  const passedCount = evaluation.gateChecklist.filter(g => g.status === 'PASS').length;
  const blockedCount = evaluation.gateChecklist.filter(g => g.status === 'BLOCK').length;
  const isAllClear = evaluation.isActive && blockedCount === 0;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div 
        className="bg-[#0D1117] border border-[#30363D] rounded-xl max-w-2xl w-full shadow-2xl overflow-hidden my-8"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#30363D] bg-[#161B22]">
          <div className="flex items-center gap-2.5">
            <div className={`p-2 rounded-lg border ${isAllClear ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-amber-500/10 border-amber-500/30 text-amber-400'}`}>
              <ShieldCheck size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-100 flex items-center gap-2">
                <span>System Readiness & Trade Gate Diagnostics</span>
                <span className={`text-[10px] font-black px-2 py-0.5 rounded border ${isAllClear ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' : 'bg-rose-500/20 text-rose-300 border-rose-500/40'}`}>
                  {isAllClear ? `${passedCount}/10 GATES CLEAR` : `${blockedCount} BLOCKER${blockedCount > 1 ? 'S' : ''} DETECTED`}
                </span>
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">
                Real-time audit across all 10 autonomous execution gates and safety limits
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-white rounded-lg hover:bg-[#21262D] transition cursor-pointer"
            title="Close diagnostics modal"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* 1. Main Status Verdict Card */}
          {isAllClear ? (
            <div className="bg-gradient-to-r from-emerald-950/50 via-[#0D1117] to-emerald-950/30 border border-emerald-500/40 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <CheckCircle2 size={20} className="text-emerald-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-emerald-300">
                    EVERYTHING IS WORKING PROPERLY (0 BLOCKERS)
                  </h3>
                  <p className="text-xs text-gray-300 leading-relaxed">
                    The bot is active and continuously scanning <strong>{coinCount} cryptocurrency futures pairs</strong> every {scanInterval}s. All 10 risk filters, data streams, and execution gates are 100% operational.
                  </p>
                  <p className="text-xs text-emerald-300/80 leading-relaxed pt-1">
                    <strong>Why hasn't a trade opened yet?</strong> The engine is simply waiting for live candles to trigger the exact price action entry rules of your enabled strategies ({evaluation.activeStrategies.map(s => s.shortName).join(', ')}). No risk gate or technical error is stopping trades.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-gradient-to-r from-rose-950/60 via-[#0D1117] to-rose-950/40 border border-rose-500/50 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle size={20} className="text-rose-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-rose-300">
                    TRADES ARE CURRENTLY STOPPED BY SAFETY GATE
                  </h3>
                  <p className="text-xs text-rose-200 font-semibold leading-relaxed">
                    Primary Stopping Reason: {evaluation.primaryReason}
                  </p>
                  {evaluation.allReasons.length > 1 && (
                    <div className="mt-2 pt-2 border-t border-rose-500/30">
                      <span className="text-[11px] font-bold text-rose-300 block mb-1">
                        All Active Stopping Conditions ({evaluation.allReasons.length}):
                      </span>
                      <ul className="list-disc list-inside space-y-0.5 text-xs text-gray-300">
                        {evaluation.allReasons.map((r, i) => (
                          <li key={i} className="leading-snug">{r}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 2. The 10 Gates Checklist */}
          <div>
            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
              Trade Execution Gates Checklist (10 Checks)
            </h4>
            <div className="border border-[#30363D] rounded-lg divide-y divide-[#30363D]/60 bg-black/20 overflow-hidden text-xs">
              {evaluation.gateChecklist.map((gate) => {
                const isPass = gate.status === 'PASS';
                const isWarn = gate.status === 'WARN';
                return (
                  <div key={gate.id} className="p-3 flex items-start justify-between gap-3 hover:bg-[#161B22]/50 transition">
                    <div className="flex items-start gap-2.5 min-w-0">
                      <div className="mt-0.5 shrink-0">
                        {isPass ? (
                          <CheckCircle2 size={16} className="text-emerald-400" />
                        ) : isWarn ? (
                          <AlertTriangle size={16} className="text-amber-400" />
                        ) : (
                          <XCircle size={16} className="text-rose-400" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-gray-200">{gate.label}</span>
                          <span className={`text-[10px] px-1.5 py-0.2 rounded font-bold border ${
                            isPass 
                              ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' 
                              : isWarn 
                              ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                              : 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                          }`}>
                            {gate.value}
                          </span>
                        </div>
                        <p className="text-[11px] text-gray-400 mt-0.5 leading-relaxed">
                          {gate.detail}
                        </p>
                      </div>
                    </div>

                    <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded border shrink-0 ${
                      isPass 
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' 
                        : isWarn
                        ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                        : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                    }`}>
                      {gate.status}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 3. Educational / Strategy Assurance Note */}
          <div className="bg-[#161B22] border border-[#30363D] rounded-lg p-3.5 flex items-start gap-3">
            <HelpCircle size={18} className="text-indigo-400 shrink-0 mt-0.5" />
            <div className="text-xs text-gray-300 space-y-1">
              <strong className="text-indigo-300 font-semibold block">
                How Institutional Setups Work (Why trades aren't taken on random candles)
              </strong>
              <p className="text-gray-400 leading-relaxed text-[11px]">
                Quantitative strategies (like <strong>EMA 5 Exact Price Action Entry</strong>, <strong>Volatility Compression Breakout</strong>, or <strong>SMC Liquidity Sweep</strong>) are specifically engineered to enter ONLY when high-conviction mathematical conditions align (e.g. rejection wick touch on EMA 5, volume expansion surge, and structural swing confirmation).
              </p>
              <p className="text-gray-400 leading-relaxed text-[11px]">
                If the market is consolidating sideways, choppy, or failing volume filters, the bot patiently sits on cash. This disciplined selectivity is the primary hallmark of a profitable automated trading system.
              </p>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 border-t border-[#30363D] bg-[#161B22]">
          <div className="flex items-center gap-2">
            {!evaluation.isActive && evaluation.actionType === 'START_ENGINE' && (
              <button
                onClick={() => { onToggleEngine(); onClose(); }}
                className="px-3.5 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-black font-black rounded text-xs transition flex items-center gap-1.5 cursor-pointer"
              >
                <Play size={13} className="fill-black" />
                <span>START ENGINE NOW</span>
              </button>
            )}

            {!evaluation.isActive && evaluation.actionType === 'DISABLE_KILL_SWITCH' && onDisableKillSwitch && (
              <button
                onClick={() => { onDisableKillSwitch(); onClose(); }}
                className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded text-xs transition flex items-center gap-1.5 cursor-pointer"
              >
                <ShieldAlert size={13} />
                <span>DISABLE KILL SWITCH</span>
              </button>
            )}

            {!evaluation.isActive && evaluation.actionType === 'RECONNECT_FEED' && onRefreshFeed && (
              <button
                onClick={() => { onRefreshFeed(); onClose(); }}
                className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-500 text-black font-bold rounded text-xs transition flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw size={13} />
                <span>RECONNECT FEED</span>
              </button>
            )}

            {onOpenSettings && (
              <button
                onClick={() => { onOpenSettings(); onClose(); }}
                className="px-3 py-1.5 bg-[#21262D] hover:bg-[#30363D] text-gray-300 rounded border border-[#30363D] text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer"
              >
                <SettingsIcon size={13} />
                <span>Adjust Risk / Settings</span>
              </button>
            )}

            {onOpenStrategy && (
              <button
                onClick={() => { onOpenStrategy(); onClose(); }}
                className="px-3 py-1.5 bg-[#21262D] hover:bg-[#30363D] text-gray-300 rounded border border-[#30363D] text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer"
              >
                <GitBranch size={13} />
                <span>View Strategy Rules</span>
              </button>
            )}
          </div>

          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-[#21262D] hover:bg-[#30363D] text-gray-300 font-semibold rounded border border-[#30363D] text-xs transition cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export function TradeEngineBanner({
  engineRunning,
  settings,
  connectionStatus,
  isStale,
  settingsLoadError,
  globalFilterState,
  systemHealth,
  onToggleEngine,
  onOpenSettings,
  onOpenStrategy,
  onRetrySettings,
  onRefreshFeed,
  onDisableKillSwitch
}: TradeEngineBannerProps) {
  const [showDetails, setShowDetails] = useState(false);
  const [showDiagnosticsModal, setShowDiagnosticsModal] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('bt_trade_banner_collapsed') === 'true';
    } catch {
      return false;
    }
  });

  const toggleCollapsed = () => {
    setIsCollapsed(prev => {
      const next = !prev;
      try {
        localStorage.setItem('bt_trade_banner_collapsed', String(next));
      } catch {}
      return next;
    });
  };

  const evaluation = evaluateEngineStatus(
    engineRunning,
    settings,
    connectionStatus,
    isStale,
    settingsLoadError,
    globalFilterState,
    systemHealth
  );

  const isLive = settings.tradingMode === 'LIVE';
  const modeLabel = isLive ? 'LIVE BINANCE FUTURES' : (settings.binanceTestnet ? 'BINANCE TESTNET' : 'PAPER TRADING / DEMO');
  const timeframe = settings.timeframe || '15m';
  const coinCount = settings.coinCount || 100;
  const scanInterval = settings.scanInterval || 15;
  const isCritical = evaluation.severity === 'CRITICAL';

  // ==========================================
  // 1. COLLAPSED VIEW (MINIMAL SLIM BAR)
  // ==========================================
  if (isCollapsed) {
    return (
      <>
        <div 
          id="engine-banner-collapsed"
          className={`border-b px-4 py-1.5 text-xs shadow-sm transition-all ${
            evaluation.isActive 
              ? 'bg-gradient-to-r from-emerald-950/60 via-[#0E1117] to-emerald-950/40 border-emerald-500/30' 
              : isCritical
              ? 'bg-gradient-to-r from-rose-950/70 via-[#0E1117] to-rose-950/50 border-rose-600/50'
              : 'bg-gradient-to-r from-amber-950/60 via-[#0E1117] to-amber-950/40 border-amber-600/40'
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            {/* Left: Indicator dot + Status + Reassurance / Blocker */}
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="relative flex h-2.5 w-2.5 shrink-0">
                <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${evaluation.isActive ? 'bg-emerald-500' : (isCritical ? 'bg-rose-500 animate-pulse' : 'bg-amber-500')}`}></span>
              </span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-black tracking-wider border shrink-0 ${
                evaluation.isActive 
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' 
                  : isCritical
                  ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                  : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
              }`}>
                {evaluation.isActive ? 'ENGINE ACTIVE' : (isCritical ? 'ENGINE STOPPED' : 'TRADING BLOCKED')}
              </span>
              <span className={`hidden sm:inline-block px-1.5 py-0.5 rounded text-[10px] font-bold border shrink-0 ${isLive ? 'bg-red-500/10 text-red-400 border-red-500/30' : 'bg-blue-500/10 text-blue-400 border-blue-500/30'}`}>
                {modeLabel}
              </span>

              <div className="h-3.5 w-px bg-[#30363D] hidden md:block"></div>

              {/* Status / Working Fine / Blocker Text */}
              {evaluation.isActive ? (
                <button
                  onClick={() => setShowDiagnosticsModal(true)}
                  className="text-emerald-300/90 hover:text-emerald-200 text-[11px] font-medium flex items-center gap-1.5 truncate cursor-pointer text-left transition"
                  title="Everything is working fine! Click to inspect 10-gate readiness checklist"
                >
                  <CheckCircle2 size={13} className="text-emerald-400 shrink-0" />
                  <span className="truncate">
                    <strong>All Systems Operational:</strong> Scanning {coinCount} pairs • 0 blockers • Ready for setups
                  </span>
                </button>
              ) : (
                <button
                  onClick={() => setShowDiagnosticsModal(true)}
                  className="text-amber-300 hover:text-amber-200 text-[11px] font-medium flex items-center gap-1.5 truncate cursor-pointer text-left transition"
                  title="Click to view detailed trade blocker diagnostics"
                >
                  <AlertTriangle size={13} className={isCritical ? 'text-rose-400 shrink-0' : 'text-amber-400 shrink-0'} />
                  <span className="truncate">
                    <strong>Stopping Reason:</strong> {evaluation.primaryReason}
                  </span>
                </button>
              )}
            </div>

            {/* Right: Diagnostics / Action / Expand */}
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={() => setShowDiagnosticsModal(true)}
                className={`px-2 py-0.5 rounded border text-[11px] font-semibold flex items-center gap-1 transition cursor-pointer ${
                  evaluation.isActive 
                    ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300 hover:bg-emerald-900/50' 
                    : 'bg-amber-950/40 border-amber-500/30 text-amber-300 hover:bg-amber-900/50'
                }`}
                title="Open Trade Readiness & Gate Diagnostics"
              >
                <ShieldCheck size={12} />
                <span className="hidden sm:inline">Gates:</span>
                <span>{evaluation.isActive ? '10/10 Clear' : `${evaluation.allReasons.length} Blocked`}</span>
              </button>

              {evaluation.isActive ? (
                <button
                  id="engine-banner-stop-btn-collapsed"
                  onClick={onToggleEngine}
                  className="px-2.5 py-0.5 bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 font-bold rounded border border-rose-500/30 text-[11px] transition flex items-center gap-1 cursor-pointer"
                  title="Pause trading engine"
                >
                  <Square size={10} />
                  <span className="hidden sm:inline">Pause</span>
                </button>
              ) : (
                evaluation.actionType === 'START_ENGINE' ? (
                  <button
                    id="engine-banner-start-btn-collapsed"
                    onClick={onToggleEngine}
                    className="px-2.5 py-0.5 bg-emerald-500 hover:bg-emerald-400 text-black font-black rounded text-[11px] transition flex items-center gap-1 cursor-pointer"
                    title="Start trading engine"
                  >
                    <Play size={10} className="fill-black" />
                    <span>Start</span>
                  </button>
                ) : null
              )}

              <button
                onClick={toggleCollapsed}
                className="px-2.5 py-0.5 bg-[#161B22] hover:bg-[#21262D] text-gray-300 hover:text-white rounded border border-[#30363D] text-[11px] font-semibold transition flex items-center gap-1 cursor-pointer shadow-sm"
                title="Expand full trade engine banner"
              >
                <ChevronDown size={13} />
                <span>Expand</span>
              </button>
            </div>
          </div>
        </div>

        {showDiagnosticsModal && (
          <TradeDiagnosticsModal
            evaluation={evaluation}
            settings={settings}
            systemHealth={systemHealth}
            coinCount={coinCount}
            scanInterval={scanInterval}
            modeLabel={modeLabel}
            onClose={() => setShowDiagnosticsModal(false)}
            onOpenSettings={onOpenSettings}
            onOpenStrategy={onOpenStrategy}
            onToggleEngine={onToggleEngine}
            onDisableKillSwitch={onDisableKillSwitch}
            onRefreshFeed={onRefreshFeed}
          />
        )}
      </>
    );
  }

  // ==========================================
  // 2. EXPANDED ACTIVE STATE BANNER
  // ==========================================
  if (evaluation.isActive) {
    return (
      <>
        <div 
          id="engine-active-banner" 
          className="bg-gradient-to-r from-emerald-950/70 via-[#0E1117] to-emerald-950/50 border-b border-emerald-500/40 px-4 py-2.5 text-xs shadow-md transition-all"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Left: Status & Strategy */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-black tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                  TRADE ENGINE ACTIVE
                </span>
              </div>

              <div className="h-4 w-px bg-[#30363D] hidden sm:block"></div>

              {evaluation.activeStrategies.length > 1 ? (
                <div className="flex items-center flex-wrap gap-2">
                  <span className="text-gray-400 font-medium flex items-center gap-1.5">
                    <GitBranch size={13} className="text-emerald-400" />
                    <span>Strategies ({evaluation.activeStrategies.length} Active):</span>
                  </span>
                  <div className="flex items-center flex-wrap gap-1.5">
                    {evaluation.activeStrategies.map((s) => (
                      <button
                        key={s.id}
                        onClick={onOpenStrategy}
                        className={`px-2 py-0.5 rounded text-[11px] font-bold border flex items-center gap-1 hover:brightness-125 transition-all cursor-pointer shadow-sm ${s.badgeBg}`}
                        title={`Active Strategy: ${s.name}\n${s.description}\nClick to view strategy rules and configuration`}
                      >
                        <span>{s.shortName}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-gray-400 font-medium">Strategy:</span>
                  <button
                    onClick={onOpenStrategy}
                    className="font-bold text-emerald-300 hover:text-emerald-200 transition-colors flex items-center gap-1.5 underline decoration-emerald-500/50 underline-offset-2 cursor-pointer"
                    title="Click to view strategy rules and configuration"
                  >
                    <GitBranch size={13} className="text-emerald-400" />
                    <span>{evaluation.strategyName}</span>
                  </button>
                  <span className="text-[10px] px-1.5 py-0.2 rounded font-bold bg-[#161B22] text-gray-300 border border-[#30363D]">
                    {evaluation.strategyTag}
                  </span>
                </div>
              )}

              <div className="h-4 w-px bg-[#30363D] hidden lg:block"></div>

              {/* Badges / Metrics */}
              <div className="hidden lg:flex items-center gap-2 text-[11px] text-gray-400">
                <span className="px-1.5 py-0.5 rounded bg-black/40 border border-[#30363D] font-mono text-gray-300">
                  {timeframe} TF
                </span>
                <span>•</span>
                <span className="px-1.5 py-0.5 rounded bg-black/40 border border-[#30363D] text-gray-300">
                  {coinCount} Pairs / {scanInterval}s
                </span>
                <span>•</span>
                <span className={`px-1.5 py-0.5 rounded font-bold border ${isLive ? 'bg-red-500/10 text-red-400 border-red-500/40' : 'bg-blue-500/10 text-blue-400 border-blue-500/40'}`}>
                  {modeLabel}
                </span>
              </div>
            </div>

            {/* Right: Actions */}
            <div className="flex items-center gap-2 shrink-0">
              {/* Gate Readiness Badge & Modal Trigger */}
              <button
                onClick={() => setShowDiagnosticsModal(true)}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-emerald-950/60 hover:bg-emerald-900/60 border border-emerald-500/40 text-emerald-300 font-bold text-[11px] transition cursor-pointer shadow-sm"
                title="Click to view full 10-gate system readiness checklist"
              >
                <ShieldCheck size={12} className="text-emerald-400" />
                <span>10/10 Gates Clear</span>
              </button>

              <button
                onClick={() => setShowDetails(!showDetails)}
                className="text-gray-400 hover:text-gray-200 px-2 py-1 text-[11px] flex items-center gap-1 transition"
                title="Toggle operational details"
              >
                <span>{showDetails ? 'Hide' : 'Details'}</span>
                {showDetails ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              </button>

              <button
                onClick={toggleCollapsed}
                className="px-2 py-1 bg-[#161B22] hover:bg-[#21262D] text-gray-300 hover:text-white rounded border border-[#30363D] font-semibold text-[11px] transition flex items-center gap-1 cursor-pointer shadow-sm"
                title="Collapse banner to save screen space"
              >
                <ChevronUp size={12} />
                <span className="hidden sm:inline">Collapse</span>
              </button>

              {onOpenStrategy && (
                <button
                  onClick={onOpenStrategy}
                  className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 bg-[#161B22] hover:bg-[#21262D] text-gray-300 rounded border border-[#30363D] font-semibold text-[11px] transition cursor-pointer"
                >
                  <GitBranch size={12} />
                  <span>Strategy Rules</span>
                </button>
              )}

              <button
                id="engine-banner-stop-btn"
                onClick={onToggleEngine}
                className="px-3 py-1 bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 font-bold rounded border border-rose-500/30 transition-colors flex items-center gap-1.5 cursor-pointer"
                title="Pause trading engine"
              >
                <Square size={12} />
                <span>PAUSE ENGINE</span>
              </button>
            </div>
          </div>

          {/* Expandable Details Drawer */}
          {showDetails && (
            <div className="mt-2.5 pt-2.5 border-t border-[#30363D]/60 text-[11px] text-gray-300 grid grid-cols-1 md:grid-cols-3 gap-3 bg-black/30 p-2.5 rounded border border-[#30363D]/40">
              <div>
                <span className="text-gray-500 uppercase tracking-wider text-[10px] block font-bold">
                  {evaluation.activeStrategies.length > 1
                    ? `Active Engine Suite (${evaluation.activeStrategies.length} Strategies)`
                    : 'Active Engine Architecture'}
                </span>
                <div className="mt-1 space-y-1.5 max-h-36 overflow-y-auto pr-1">
                  {evaluation.activeStrategies.map((s) => (
                    <div key={s.id} className="text-[11px] leading-snug">
                      <div className="flex items-center gap-1.5">
                        <span className={`text-[9px] px-1.5 py-0.2 rounded font-bold border ${s.badgeBg}`}>
                          {s.tag}
                        </span>
                        <strong className="text-gray-200">{s.name}</strong>
                      </div>
                      <p className="text-gray-400 text-[10px] mt-0.5 leading-relaxed">{s.description}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <span className="text-gray-500 uppercase tracking-wider text-[10px] block font-bold">Scanning & Sizing Parameters</span>
                <p className="mt-0.5 text-gray-300">
                  Risk Per Trade: <strong className="text-emerald-400">{settings.accountRiskPct || 1}%</strong> • Leverage: <strong className="text-indigo-400">{settings.leverage || 1}x</strong> • Max Positions: <strong className="text-gray-200">{settings.maxConcurrentTrades || 3}</strong>
                </p>
                <p className="mt-1 text-gray-400 text-[10px]">
                  Scan: <strong className="text-gray-300">{coinCount} pairs / {scanInterval}s</strong> • Priority arbitration: Highest score wins, breaking ties by enabled strategy order.
                </p>
                <div className="mt-2 pt-2 border-t border-[#30363D]/40 flex items-center justify-between">
                  <span className="text-emerald-400 flex items-center gap-1 font-semibold text-[10px]">
                    <CheckCircle2 size={11} />
                    <span>All 10 Trade Gates Clear</span>
                  </span>
                  <button
                    onClick={() => setShowDiagnosticsModal(true)}
                    className="text-indigo-400 hover:text-indigo-300 underline text-[10px] cursor-pointer"
                  >
                    View Checklist
                  </button>
                </div>
              </div>
              <div>
                <span className="text-gray-500 uppercase tracking-wider text-[10px] block font-bold">Institutional Safeguards</span>
                <div className="mt-0.5 space-y-1 text-[10px] text-gray-300">
                  {evaluation.activeStrategies.some(s => s.id === 'VOLATILITY_COMPRESSION') && (
                    <p>
                      <strong className="text-emerald-400">VCB:</strong> ATR Ratio &ge; {settings.vcbLocalAtrRatioMin ?? 1.2}x • Vol &ge; {settings.vcbBreakoutVolumeMin ?? 1.5}x • ADX &ge; {settings.vcbLocalAdxMin ?? 20}
                    </p>
                  )}
                  {evaluation.activeStrategies.some(s => s.id === 'TREND_PULLBACK') && (
                    <p>
                      <strong className="text-blue-400">Trend Pullback:</strong> ADX &ge; {settings.tpbAdxMin ?? 25} • EMA {settings.tpbEmaFast ?? 20}/{settings.tpbEmaSlow ?? 50}
                    </p>
                  )}
                  {evaluation.activeStrategies.some(s => s.id === 'SMC_LIQUIDITY_SWEEP' || s.id === 'LIQUIDITY_SWEEP_REVERSAL') && (
                    <p>
                      <strong className="text-purple-400">SMC:</strong> Liquidity Sweep + MSS + FVG Retest • 1:{settings.smcRrRatio ?? 3.0} R:R Target
                    </p>
                  )}
                  {evaluation.activeStrategies.some(s => s.id === 'EMA_GAP_PULLBACK') && (
                    <p>
                      <strong className="text-teal-400">5 EMA Gap:</strong> HTF 50 EMA Trend Filter • Pullback Confirmation • Anti-Overextension Guard
                    </p>
                  )}
                  {evaluation.activeStrategies.some(s => s.id === 'EMA5_EXACT_ENTRY_V1') && (
                    <p>
                      <strong className="text-emerald-400">EMA 5 Exact:</strong> Exact PA pattern trigger • 15m structure filter • Dynamic RR
                    </p>
                  )}
                  {evaluation.activeStrategies.some(s => s.id === 'EMA5_REJECTION_RECLAIM_V1') && (
                    <p>
                      <strong className="text-amber-400">EMA 5 Reclaim:</strong> Rejection Wick &ge; {settings.errMinRejectionWickBodyRatio ?? 1.0}x • Vol &ge; {settings.errMinVolumeRatio ?? 1.10}x • 15m Confirmed Swing Structure
                    </p>
                  )}
                  {evaluation.activeStrategies.some(s => s.id === 'TREND_PULLBACK_RETEST') && (
                    <p>
                      <strong className="text-sky-400">Pullback Retest:</strong> 5-Stage State Machine • Retest &plusmn; {settings.tprRetestToleranceAtr ?? 0.20} ATR • Dynamic ATR Stop
                    </p>
                  )}
                  {evaluation.activeStrategies.some(s => s.id === 'EMA5_PA_VOLUME_V1') && (
                    <p>
                      <strong className="text-emerald-400">EMA 5 PA Vol:</strong> 15m Market Structure Swings • Vol &ge; {settings.ema5PaMinVolumeRatio ?? 1.10}x • Gap Range Gate
                    </p>
                  )}
                  {evaluation.activeStrategies.some(s => s.id === 'DELTA_CLIMAX') && (
                    <p>
                      <strong className="text-amber-400">Delta Climax:</strong> Capitulation Vol Spike • 3-Bar Exhaustion Reversal
                    </p>
                  )}
                  <p className="text-emerald-400 pt-0.5 flex items-center gap-1 font-medium">
                    <CheckCircle2 size={11} />
                    <span>All Active Strategy Safeguards Armed & Monitored</span>
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {showDiagnosticsModal && (
          <TradeDiagnosticsModal
            evaluation={evaluation}
            settings={settings}
            systemHealth={systemHealth}
            coinCount={coinCount}
            scanInterval={scanInterval}
            modeLabel={modeLabel}
            onClose={() => setShowDiagnosticsModal(false)}
            onOpenSettings={onOpenSettings}
            onOpenStrategy={onOpenStrategy}
            onToggleEngine={onToggleEngine}
            onDisableKillSwitch={onDisableKillSwitch}
            onRefreshFeed={onRefreshFeed}
          />
        )}
      </>
    );
  }

  // ==========================================
  // 3. EXPANDED INACTIVE / BLOCKED STATE BANNER
  // ==========================================
  const bannerBg = isCritical 
    ? 'bg-gradient-to-r from-rose-950/80 via-[#0E1117] to-rose-950/60 border-b-2 border-rose-600/80 text-rose-200' 
    : 'bg-gradient-to-r from-amber-950/70 via-[#0E1117] to-amber-950/50 border-b border-amber-600/60 text-amber-200';

  const badgeBg = isCritical
    ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
    : 'bg-amber-500/20 text-amber-300 border-amber-500/40';

  return (
    <>
      <div 
        id="engine-stopped-banner" 
        className={`${bannerBg} px-4 py-2.5 text-xs shadow-lg transition-all`}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Left: Status & Reason */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${isCritical ? 'bg-rose-500 animate-pulse' : 'bg-amber-500'}`}></span>
              </span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-black tracking-wider border ${badgeBg}`}>
                {isCritical ? 'TRADE ENGINE INACTIVE' : 'TRADING BLOCKED / PAUSED'}
              </span>
            </div>

            <div className="h-4 w-px bg-[#30363D] hidden sm:block"></div>

            {/* Primary Reason Display */}
            <div className="flex items-center gap-2">
              <AlertTriangle size={14} className={isCritical ? 'text-rose-400 shrink-0' : 'text-amber-400 shrink-0'} />
              <span className="font-semibold text-gray-100">
                <strong>Reason:</strong> {evaluation.primaryReason}
              </span>
            </div>

            {/* Strategy Context in Blocked State */}
            <div className="hidden xl:flex items-center gap-1.5 text-[11px] text-gray-400">
              <span>•</span>
              {evaluation.activeStrategies.length > 1 ? (
                <div className="flex items-center gap-1.5">
                  <span>Configured Strategies ({evaluation.activeStrategies.length}):</span>
                  <div className="flex items-center gap-1">
                    {evaluation.activeStrategies.map((s) => (
                      <span key={s.id} className={`text-[10px] px-1.5 py-0.2 rounded font-bold border ${s.badgeBg}`}>
                        {s.shortName}
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <span>Configured Strategy:</span>
                  <span className="font-bold text-gray-300">{evaluation.strategyName}</span>
                </div>
              )}
            </div>
          </div>

          {/* Right: Direct Action Buttons */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Gate Diagnostics Modal Button */}
            <button
              onClick={() => setShowDiagnosticsModal(true)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-rose-950/60 hover:bg-rose-900/60 border border-rose-500/40 text-rose-300 font-bold text-[11px] transition cursor-pointer shadow-sm"
              title="Click to view why trades are currently stopped and how to unblock"
            >
              <ShieldAlert size={12} className="text-rose-400" />
              <span>Gate Diagnostics ({evaluation.allReasons.length} Blocked)</span>
            </button>

            <button
              onClick={toggleCollapsed}
              className="px-2 py-1 bg-[#161B22] hover:bg-[#21262D] text-gray-300 hover:text-white rounded border border-[#30363D] font-semibold text-[11px] transition flex items-center gap-1 cursor-pointer shadow-sm"
              title="Collapse banner to compact mode to save space"
            >
              <ChevronUp size={12} />
              <span className="hidden sm:inline">Collapse</span>
            </button>

            {evaluation.actionType === 'START_ENGINE' && (
              <button
                id="engine-banner-start-btn"
                onClick={onToggleEngine}
                className="px-3.5 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-black font-black rounded shadow-md transition-all flex items-center gap-1.5 cursor-pointer text-xs uppercase tracking-wider"
                title="Click to activate trading engine"
              >
                <Play size={13} className="fill-black" />
                <span>START ENGINE</span>
              </button>
            )}

            {evaluation.actionType === 'DISABLE_KILL_SWITCH' && onDisableKillSwitch && (
              <button
                onClick={onDisableKillSwitch}
                className="px-3 py-1 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded shadow transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <ShieldAlert size={13} />
                <span>DISABLE KILL SWITCH</span>
              </button>
            )}

            {evaluation.actionType === 'RETRY_SETTINGS' && onRetrySettings && (
              <button
                onClick={onRetrySettings}
                className="px-3 py-1 bg-red-600 hover:bg-red-500 text-white font-bold rounded shadow transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw size={13} />
                <span>RETRY CONFIG</span>
              </button>
            )}

            {evaluation.actionType === 'RECONNECT_FEED' && onRefreshFeed && (
              <button
                onClick={onRefreshFeed}
                className="px-3 py-1 bg-amber-600 hover:bg-amber-500 text-black font-bold rounded shadow transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw size={13} />
                <span>RECONNECT FEED</span>
              </button>
            )}

            {onOpenSettings && (
              <button
                onClick={onOpenSettings}
                className="px-2.5 py-1 bg-[#161B22] hover:bg-[#21262D] text-gray-300 rounded border border-[#30363D] font-semibold text-[11px] transition flex items-center gap-1.5 cursor-pointer"
              >
                <SettingsIcon size={12} />
                <span>Settings</span>
              </button>
            )}
          </div>
        </div>

        {/* Multiple Secondary Reasons Warning List */}
        {evaluation.allReasons.length > 1 && (
          <div className="mt-2 pt-2 border-t border-[#30363D]/60 text-[11px] text-gray-300">
            <span className="font-bold text-gray-400">Additional Blocking Conditions ({evaluation.allReasons.length}):</span>
            <ul className="list-disc list-inside mt-1 space-y-0.5 text-gray-300">
              {evaluation.allReasons.map((r, i) => (
                <li key={i} className="leading-relaxed">
                  {r}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {showDiagnosticsModal && (
        <TradeDiagnosticsModal
          evaluation={evaluation}
          settings={settings}
          systemHealth={systemHealth}
          coinCount={coinCount}
          scanInterval={scanInterval}
          modeLabel={modeLabel}
          onClose={() => setShowDiagnosticsModal(false)}
          onOpenSettings={onOpenSettings}
          onOpenStrategy={onOpenStrategy}
          onToggleEngine={onToggleEngine}
          onDisableKillSwitch={onDisableKillSwitch}
          onRefreshFeed={onRefreshFeed}
        />
      )}
    </>
  );
}
