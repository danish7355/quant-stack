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
      activeStrategyCount: activeStrategies.length
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
    activeStrategyCount: activeStrategies.length
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
  const coinCount = settings.coinCount || 100;
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
