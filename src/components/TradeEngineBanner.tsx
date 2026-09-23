import React, { useState } from 'react';
import { 
  Zap, AlertTriangle, ShieldAlert, Play, Square, Settings as SettingsIcon, 
  RefreshCw, GitBranch, ChevronDown, ChevronUp, CheckCircle2, XCircle, Clock
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

export function getStrategyDisplayName(strategyKey?: string): { name: string; tag: string; description: string } {
  switch (strategyKey) {
    case 'VOLATILITY_COMPRESSION':
      return {
        name: 'Volatility Compression Breakout (VCB)',
        tag: 'BREAKOUT',
        description: 'Bollinger/Keltner squeeze compression to directional volume expansion with retest & follow-through gates.'
      };
    case 'SMC_LIQUIDITY_SWEEP':
    case 'LIQUIDITY_SWEEP_REVERSAL':
      return {
        name: 'Smart Money Concepts (SMC Liquidity Sweep)',
        tag: 'INSTITUTIONAL',
        description: 'Liquidity pool sweeps, MSS displacement shifts, and Fair Value Gap (FVG) / Order Block retests.'
      };
    case 'TREND_PULLBACK':
      return {
        name: 'Trend Pullback Continuation',
        tag: 'TREND-FOLLOWING',
        description: 'Controlled pullback to rising/falling moving averages with ADX trend strength and structural retest.'
      };
    case 'DELTA_CLIMAX':
      return {
        name: 'Delta Climax Reversal',
        tag: 'REVERSAL',
        description: 'Exhaustion volume spikes with rejection wicks and momentum divergence at macro extremes.'
      };
    case 'EARLY_COIL_BREAKOUT':
      return {
        name: 'Early Coil Breakout',
        tag: 'MOMENTUM',
        description: 'Pre-blast micro-consolidation detection for early high-conviction breakout entries.'
      };
    case 'AUTO_REGIME':
      return {
        name: 'Autonomous Multi-Regime Auto-Selector',
        tag: 'HYBRID',
        description: 'Dynamically routes market conditions to the optimal strategy algorithm per asset regime.'
      };
    case 'BINANCE_COMPOSITE':
    default:
      return {
        name: 'Binance Composite Technical Scoring',
        tag: 'COMPOSITE',
        description: 'Multi-factor technical consensus combining EMAs, RSI, MACD, ADX, SuperTrend, and Volume.'
      };
  }
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
  const strat = getStrategyDisplayName(settings.activeStrategy);

  // 1. Critical Errors
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

  const isActive = reasons.length === 0;

  if (isActive) {
    return {
      isActive: true,
      primaryReason: `Trading Engine is ACTIVE and executing ${strat.name}.`,
      allReasons: [],
      severity: 'ACTIVE',
      strategyName: strat.name,
      strategyTag: strat.tag,
      strategyDescription: strat.description
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
    strategyName: strat.name,
    strategyTag: strat.tag,
    strategyDescription: strat.description
  };
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
  const coinCount = settings.coinCount || 30;
  const scanInterval = settings.scanInterval || 15;

  // ==========================================
  // 1. ACTIVE STATE BANNER
  // ==========================================
  if (evaluation.isActive) {
    return (
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
              <span>•</span>
              <span className="text-emerald-400 flex items-center gap-1">
                <CheckCircle2 size={12} />
                Gates Armed
              </span>
            </div>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="text-gray-400 hover:text-gray-200 px-2 py-1 text-[11px] flex items-center gap-1 transition"
              title="Toggle operational details"
            >
              <span>{showDetails ? 'Hide' : 'Details'}</span>
              {showDetails ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
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
              <span className="text-gray-500 uppercase tracking-wider text-[10px] block font-bold">Active Engine Architecture</span>
              <p className="mt-0.5 text-gray-300 leading-relaxed">{evaluation.strategyDescription}</p>
            </div>
            <div>
              <span className="text-gray-500 uppercase tracking-wider text-[10px] block font-bold">Scanning & Sizing Parameters</span>
              <p className="mt-0.5 text-gray-300">
                Risk Per Trade: <strong className="text-emerald-400">{settings.accountRiskPct || 1}%</strong> • Leverage: <strong className="text-indigo-400">{settings.leverage || 1}x</strong> • Max Positions: <strong className="text-gray-200">{settings.maxConcurrentTrades || 3}</strong>
              </p>
            </div>
            <div>
              <span className="text-gray-500 uppercase tracking-wider text-[10px] block font-bold">Institutional Hard Gates</span>
              <p className="mt-0.5 text-gray-300">
                ATR Ratio &ge; {settings.vcbLocalAtrRatioMin ?? 1.2}x • Volume &ge; {settings.vcbBreakoutVolumeMin ?? 1.5}x • ADX &ge; {settings.vcbLocalAdxMin ?? 20} • Body &ge; {((settings.vcbBodyDominanceMin ?? 0.6) * 100).toFixed(0)}%
              </p>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ==========================================
  // 2. INACTIVE / BLOCKED STATE BANNER
  // ==========================================
  const isCritical = evaluation.severity === 'CRITICAL';
  const bannerBg = isCritical 
    ? 'bg-gradient-to-r from-rose-950/80 via-[#0E1117] to-rose-950/60 border-b-2 border-rose-600/80 text-rose-200' 
    : 'bg-gradient-to-r from-amber-950/70 via-[#0E1117] to-amber-950/50 border-b border-amber-600/60 text-amber-200';

  const badgeBg = isCritical
    ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
    : 'bg-amber-500/20 text-amber-300 border-amber-500/40';

  return (
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
            <span>Configured Strategy:</span>
            <span className="font-bold text-gray-300">{evaluation.strategyName}</span>
          </div>
        </div>

        {/* Right: Direct Action Buttons */}
        <div className="flex items-center gap-2 shrink-0">
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
  );
}
