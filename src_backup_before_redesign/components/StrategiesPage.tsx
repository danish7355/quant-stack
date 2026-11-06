import React, { useState, useMemo } from 'react';
import {
  Layers,
  Zap,
  CheckCircle2,
  AlertTriangle,
  Play,
  SlidersHorizontal,
  Code,
  Copy,
  Check,
  Trash2,
  Undo2,
  Plus,
  Activity,
  ArrowRight,
  TrendingUp,
  Target,
  Droplets,
  Clock,
  ShieldCheck,
  ShieldAlert,
  Search,
  RefreshCw,
  ExternalLink,
  Archive,
  BarChart2,
  ChevronRight,
  Eye,
  X,
  Box
} from 'lucide-react';
import { AppSettings, CoinDetail, StrategyItem } from '../types';
import { generateCoilBreakoutPineScript } from '../utils/strategies/coilBreakout';
import { generateMulticoinScalperPineScript } from '../utils/strategies/multicoinScalperPro';
import { generateTrendPullbackPineScript } from '../utils/strategies/trendPullback';
import { generateLsrPineScript } from '../utils/strategies/liquiditySweepReversal';
import { generateOrderBlockPineScript } from '../utils/strategies/orderBlockStrategy';
import { generateRangeRegimePineScript } from '../utils/strategies/rangeRegimeStrategy';
import { VcbStrategyControlPanel } from './VcbStrategyControlPanel';
import { RangeRegimeControlPanel } from './RangeRegimeControlPanel';

interface StrategiesPageProps {
  settings: AppSettings;
  onUpdateSettings: (settings: AppSettings) => void;
  coins?: CoinDetail[];
  onOpenDiagnostic?: () => void;
  onInspectCoin?: (symbol: string) => void;
}

export function StrategiesPage({
  settings,
  onUpdateSettings,
  coins = [],
  onOpenDiagnostic,
  onInspectCoin
}: StrategiesPageProps) {
  const [activeSubTab, setActiveSubTab] = useState<'overview' | 'coil' | 'scalper' | 'trendPullback' | 'lsr' | 'orderBlock' | 'rangeRegime' | 'archived'>('overview');
  const [copiedPineStrat, setCopiedPineStrat] = useState<string | null>(null);
  const [viewPineScriptCode, setViewPineScriptCode] = useState<{ title: string; code: string } | null>(null);
  const [strategyToDelete, setStrategyToDelete] = useState<StrategyItem | null>(null);
  const [statusNotification, setStatusNotification] = useState<string | null>(null);

  // Custom Strategy Modal State
  const [showAddCustomModal, setShowAddCustomModal] = useState(false);
  const [newStratName, setNewStratName] = useState('');
  const [newStratBadge, setNewStratBadge] = useState('');
  const [newStratDesc, setNewStratDesc] = useState('');
  const [newStratColor, setNewStratColor] = useState('indigo');

  const showNotification = (msg: string) => {
    setStatusNotification(msg);
    setTimeout(() => setStatusNotification(null), 3500);
  };

  const BASE_STRATEGIES: StrategyItem[] = [
    {
      id: 'COIL_BREAKOUT',
      name: 'Volatility Compression Breakout (VCB)',
      badge: 'Coil Squeeze & Retest (VCB)',
      color: 'purple',
      configTab: 'coil',
      desc: 'Institutional intraday Volatility Compression Breakout (VCB) engine. Single source of truth configuration with regime gates, multi-timeframe bias, boundary touches, chandelier trailing, and strict fee-to-risk drag gating.'
    },
    {
      id: 'MULTICOIN_SCALPER_PRO',
      name: 'Multicoin Scalper PRO (SwissAlgo)',
      badge: 'High-Volume Scalper (SwissAlgo)',
      color: 'amber',
      configTab: 'scalper',
      desc: 'Universal high-volume altcoin scalper inspired by 3Commas & SwissAlgo. Strict liquidity and spread filtering, EMA Ribbon stacks (9/21/55), Session VWAP confluence, RSI pullback confirmation, and dynamic ATR risk controls.'
    },
    {
      id: 'TREND_PULLBACK',
      name: 'Robust Trend-Pullback Strategy',
      badge: 'Retest-Aware (1:3+ R:R)',
      color: 'teal',
      configTab: 'trendPullback',
      desc: 'Multi-timeframe EMA trend alignment, dynamic pullback zones, and structural invalidation stop loss. Distinguishes normal retest noise from true invalidation with closed-bar validation.'
    },
    {
      id: 'LIQUIDITY_SWEEP_REVERSAL',
      name: 'Liquidity Sweep Reversal (LSR)',
      badge: 'Price Action & Strict Reclaim (2:1+ R:R)',
      color: 'cyan',
      configTab: 'lsr',
      desc: 'Institutional failed-breakout engine. Identifies true liquidity sweeps at major swing points, equal highs/lows and range boundaries, enforces mandatory candle close reclaims, micro-structure shifts (MSS), and early entry with tight invalidation.'
    },
    {
      id: 'RANGE_REGIME_V1',
      name: 'Range Regime V1 (RANGE_REGIME_V1)',
      badge: 'Single Source of Truth Fades (S1/S2/S3)',
      color: 'cyan',
      configTab: 'rangeRegime',
      desc: 'Single source of truth parameter schema for institutional range trading. Renders controls dynamically from PARAMS, enforces ADX trend veto, Kaufman ER, swing edge clusters, S1 rejection, S2 sweep & reclaim, S3 band snap-back, and fee drag risk limits.'
    },
    {
      id: 'ORDER_BLOCK',
      name: 'Order Block Strategy',
      badge: 'PA, Displacement & Retest (1:3.5+ R:R)',
      color: 'purple',
      configTab: 'orderBlock',
      desc: 'Pure price action, market structure, and liquidity engine. Identifies high-quality Order Blocks preceded by liquidity sweeps, verified by genuine volatility-adaptive displacement and structure breaks (BOS). Enters on first clean retest with tight logical invalidation and a hard minimum 1:3.5 Risk/Reward.'
    }
  ];

  const ALL_STRATEGIES: StrategyItem[] = [
    ...BASE_STRATEGIES,
    ...(settings.customStrategies || [])
  ];

  const deletedStrategies = settings.deletedStrategies || [];
  const installedStrategies = ALL_STRATEGIES.filter(s => !deletedStrategies.includes(s.id));
  const archivedStrategies = ALL_STRATEGIES.filter(s => deletedStrategies.includes(s.id));

  const activeStrategiesList = ((settings.activeStrategies && settings.activeStrategies.length > 0)
    ? settings.activeStrategies
    : [settings.activeStrategy || 'COIL_BREAKOUT']).filter(s => !deletedStrategies.includes(s));

  // Calculate live matching coins count for each strategy from the current scan
  const liveCoinMatches = useMemo(() => {
    const counts: Record<string, { count: number; symbols: string[] }> = {
      COIL_BREAKOUT: { count: 0, symbols: [] },
      MULTICOIN_SCALPER_PRO: { count: 0, symbols: [] },
      TREND_PULLBACK: { count: 0, symbols: [] },
      LIQUIDITY_SWEEP_REVERSAL: { count: 0, symbols: [] },
      RANGE_REGIME_V1: { count: 0, symbols: [] },
      ORDER_BLOCK: { count: 0, symbols: [] },
      CONFLUENCE: { count: 0, symbols: [] }
    };

    coins.forEach(coin => {
      let matchedAny = false;
      const strats = coin.matchedStrategies || [];

      if (coin.isMultiConfluence || strats.length > 1) {
        counts.CONFLUENCE.count++;
        counts.CONFLUENCE.symbols.push(coin.symbol);
      }

      if (coin.detectedStrategy === 'COIL_BREAKOUT' || strats.includes('COIL_BREAKOUT') || coin.coilBreakoutSignal?.finalDecision === 'EXECUTE') {
        counts.COIL_BREAKOUT.count++;
        counts.COIL_BREAKOUT.symbols.push(coin.symbol);
        matchedAny = true;
      }
      if (coin.detectedStrategy === 'MULTICOIN_SCALPER_PRO' || strats.includes('MULTICOIN_SCALPER_PRO') || coin.multicoinScalperSignal?.finalDecision === 'EXECUTE') {
        counts.MULTICOIN_SCALPER_PRO.count++;
        counts.MULTICOIN_SCALPER_PRO.symbols.push(coin.symbol);
        matchedAny = true;
      }
      if (coin.detectedStrategy === 'TREND_PULLBACK' || strats.includes('TREND_PULLBACK') || coin.trendPullbackSignal?.finalDecision === 'EXECUTE') {
        counts.TREND_PULLBACK.count++;
        counts.TREND_PULLBACK.symbols.push(coin.symbol);
        matchedAny = true;
      }
      if (coin.detectedStrategy === 'LIQUIDITY_SWEEP_REVERSAL' || strats.includes('LIQUIDITY_SWEEP_REVERSAL') || coin.lsrSignal?.finalDecision === 'EXECUTE' || coin.lsrSignal?.status === 'TRIGGERED' || coin.lsrSignal?.status === 'ARMED') {
        counts.LIQUIDITY_SWEEP_REVERSAL.count++;
        counts.LIQUIDITY_SWEEP_REVERSAL.symbols.push(coin.symbol);
        matchedAny = true;
      }
      if (coin.detectedStrategy === 'ORDER_BLOCK' || strats.includes('ORDER_BLOCK') || coin.orderBlockSignal?.finalDecision === 'EXECUTE' || coin.orderBlockSignal?.setupStatus === 'VALID' || coin.orderBlockSignal?.status === 'TRIGGERED' || coin.orderBlockSignal?.status === 'WAITING_FOR_RETEST') {
        counts.ORDER_BLOCK.count++;
        counts.ORDER_BLOCK.symbols.push(coin.symbol);
        matchedAny = true;
      }
    });

    return counts;
  }, [coins]);

  // Strategy Portfolio Mutations
  const toggleStrategyInPortfolio = (stratId: string) => {
    let next: string[];
    if (activeStrategiesList.includes(stratId)) {
      next = activeStrategiesList.filter(s => s !== stratId);
    } else {
      next = [...activeStrategiesList, stratId];
    }
    const updated = {
      ...settings,
      activeStrategies: next,
      activeStrategy: (next.length === 1 ? next[0] : (next.length > 1 ? next[0] : 'NONE')) as any
    };
    onUpdateSettings(updated);
    showNotification(`Portfolio updated: ${next.length} active strategies`);
  };

  const setSoloStrategy = (stratId: string) => {
    const updated = {
      ...settings,
      activeStrategies: [stratId],
      activeStrategy: stratId as any
    };
    onUpdateSettings(updated);
    showNotification(`Switched to Solo execution: ${stratId}`);
  };

  const setStrategyPreset = (stratIds: string[]) => {
    const filtered = stratIds.filter(s => !deletedStrategies.includes(s));
    const updated = {
      ...settings,
      activeStrategies: filtered,
      activeStrategy: (filtered.length > 0 ? filtered[0] : 'NONE') as any
    };
    onUpdateSettings(updated);
    showNotification(filtered.length === 0 ? 'All strategies paused (Standing Aside)' : `Preset applied: ${filtered.length} strategies active`);
  };

  const handleDeleteStrategy = (strat: StrategyItem) => {
    const nextDeleted = Array.from(new Set([...(settings.deletedStrategies || []), strat.id]));
    const nextActive = activeStrategiesList.filter(s => s !== strat.id);
    let nextSolo = settings.activeStrategy;
    if (nextSolo === strat.id) {
      nextSolo = nextActive.length > 0 ? (nextActive[0] as any) : 'NONE';
    }
    const updated: AppSettings = {
      ...settings,
      deletedStrategies: nextDeleted,
      activeStrategies: nextActive,
      activeStrategy: nextSolo
    };
    onUpdateSettings(updated);
    setStrategyToDelete(null);
    showNotification(`Strategy "${strat.name}" archived from active engine.`);
  };

  const handleRestoreStrategy = (stratId: string) => {
    const nextDeleted = (settings.deletedStrategies || []).filter(s => s !== stratId);
    const updated: AppSettings = {
      ...settings,
      deletedStrategies: nextDeleted
    };
    onUpdateSettings(updated);
    showNotification(`Strategy restored to active portfolio.`);
  };

  const handleRestoreAllStrategies = () => {
    const updated: AppSettings = {
      ...settings,
      deletedStrategies: []
    };
    onUpdateSettings(updated);
    showNotification(`All default strategies restored.`);
  };

  const handleCreateCustomStrategy = () => {
    if (!newStratName.trim()) return;
    const stratId = 'CUSTOM_' + newStratName.toUpperCase().replace(/[^A-Z0-9]/g, '_');
    const newStrat: StrategyItem = {
      id: stratId,
      name: newStratName.trim(),
      badge: newStratBadge.trim() || 'Custom Strategy',
      color: newStratColor,
      desc: newStratDesc.trim() || 'User-defined algorithmic trading strategy.',
      isCustom: true
    };
    const nextCustom = [...(settings.customStrategies || []), newStrat];
    const nextActive = [...activeStrategiesList, stratId];
    const updated: AppSettings = {
      ...settings,
      customStrategies: nextCustom,
      activeStrategies: nextActive
    };
    onUpdateSettings(updated);
    setShowAddCustomModal(false);
    setNewStratName('');
    setNewStratBadge('');
    setNewStratDesc('');
    showNotification(`Custom strategy "${newStrat.name}" added to portfolio.`);
  };

  const handleCopyPineScript = (stratId: string, title: string) => {
    let script = '';
    if (stratId === 'COIL_BREAKOUT') script = generateCoilBreakoutPineScript(settings);
    else if (stratId === 'MULTICOIN_SCALPER_PRO') script = generateMulticoinScalperPineScript(settings);
    else if (stratId === 'TREND_PULLBACK') script = generateTrendPullbackPineScript(settings);
    else if (stratId === 'LIQUIDITY_SWEEP_REVERSAL') script = generateLsrPineScript(settings);
    else if (stratId === 'RANGE_REGIME_V1' || stratId === 'RANGE_REGIME') script = generateRangeRegimePineScript((settings as any).rangeRegimeParams);
    else if (stratId === 'ORDER_BLOCK') script = generateOrderBlockPineScript(settings);

    if (script) {
      navigator.clipboard.writeText(script);
      setCopiedPineStrat(stratId);
      showNotification(`${title} Pine Script v6 copied to clipboard!`);
      setTimeout(() => setCopiedPineStrat(null), 3000);
    }
  };

  const handleViewPineScript = (stratId: string, title: string) => {
    let script = '';
    if (stratId === 'COIL_BREAKOUT') script = generateCoilBreakoutPineScript(settings);
    else if (stratId === 'MULTICOIN_SCALPER_PRO') script = generateMulticoinScalperPineScript(settings);
    else if (stratId === 'TREND_PULLBACK') script = generateTrendPullbackPineScript(settings);
    else if (stratId === 'LIQUIDITY_SWEEP_REVERSAL') script = generateLsrPineScript(settings);
    else if (stratId === 'RANGE_REGIME_V1' || stratId === 'RANGE_REGIME') script = generateRangeRegimePineScript((settings as any).rangeRegimeParams);
    else if (stratId === 'ORDER_BLOCK') script = generateOrderBlockPineScript(settings);

    if (script) {
      setViewPineScriptCode({ title, code: script });
    }
  };

  const handleSettingChange = (key: keyof AppSettings, val: any) => {
    onUpdateSettings({ ...settings, [key]: val });
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Toast Notification Banner */}
      {statusNotification && (
        <div className="bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 px-4 py-2.5 rounded-lg text-xs font-semibold flex items-center justify-between shadow-lg backdrop-blur-md">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
            <span>{statusNotification}</span>
          </div>
          <button onClick={() => setStatusNotification(null)} className="text-emerald-400 hover:text-white">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Top Executive Header */}
      <div className="bg-[#161B22] border border-[#30363D] rounded-xl p-5 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="p-3 bg-gradient-to-br from-indigo-500/20 to-cyan-500/20 border border-indigo-500/30 rounded-xl text-indigo-400 shrink-0 mt-0.5">
              <Layers size={22} className="animate-pulse" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <h2 className="text-base font-bold text-gray-100 tracking-tight">Strategy Portfolio Engine</h2>
                <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">
                  {activeStrategiesList.length} of {ALL_STRATEGIES.length} Active
                </span>
                {activeStrategiesList.length >= 2 && (
                  <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1">
                    <Zap size={12} className="text-emerald-400" /> Confluence Synergy (+12 Boost)
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-400 mt-1 max-w-2xl leading-relaxed">
                Autonomous quantitative execution suite for crypto futures. Manage multi-strategy concurrency, tune trigger math, inspect live signal matches, and export Pine Script v6 webhooks.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {onOpenDiagnostic && (
              <button
                type="button"
                onClick={onOpenDiagnostic}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-indigo-300 hover:text-white bg-indigo-950/40 hover:bg-indigo-900/50 border border-indigo-500/40 transition cursor-pointer"
                title="Run live diagnostic test on live candles"
              >
                <Activity size={14} className="text-indigo-400" />
                <span>Run Diagnostic</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowAddCustomModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-cyan-300 hover:text-white bg-cyan-950/40 hover:bg-cyan-900/50 border border-cyan-500/40 transition cursor-pointer"
            >
              <Plus size={14} className="text-cyan-400" />
              <span>+ Custom Strategy</span>
            </button>
          </div>
        </div>

        {/* Quick Portfolio Presets Bar */}
        <div className="mt-4 pt-4 border-t border-[#30363D] flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <span className="font-semibold text-gray-300 uppercase tracking-wider text-[11px]">Portfolio Presets:</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setStrategyPreset(['COIL_BREAKOUT', 'MULTICOIN_SCALPER_PRO', 'TREND_PULLBACK', 'LIQUIDITY_SWEEP_REVERSAL'])}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition border cursor-pointer ${
                activeStrategiesList.length >= 4
                  ? 'bg-gradient-to-r from-emerald-600 via-amber-600 to-cyan-600 text-white border-cyan-400 shadow-sm'
                  : 'bg-[#0E1117] text-gray-300 border-[#30363D] hover:border-gray-500 hover:text-white'
              }`}
              title="Activate all 4 core quantitative strategies"
            >
              ⚡ All 4 Active (Quad-Core)
            </button>
            <button
              type="button"
              onClick={() => setStrategyPreset(['COIL_BREAKOUT'])}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition border cursor-pointer ${
                activeStrategiesList.length === 1 && activeStrategiesList.includes('COIL_BREAKOUT')
                  ? 'bg-emerald-600 text-white border-emerald-400 shadow-sm'
                  : 'bg-[#0E1117] text-gray-300 border-[#30363D] hover:border-gray-500 hover:text-white'
              }`}
            >
              🌀 Coil Solo (1:5+)
            </button>
            <button
              type="button"
              onClick={() => setStrategyPreset(['MULTICOIN_SCALPER_PRO'])}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition border cursor-pointer ${
                activeStrategiesList.length === 1 && activeStrategiesList.includes('MULTICOIN_SCALPER_PRO')
                  ? 'bg-amber-600 text-white border-amber-400 shadow-sm'
                  : 'bg-[#0E1117] text-gray-300 border-[#30363D] hover:border-gray-500 hover:text-white'
              }`}
            >
              🔥 Scalper PRO Solo
            </button>
            <button
              type="button"
              onClick={() => setStrategyPreset(['TREND_PULLBACK'])}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition border cursor-pointer ${
                activeStrategiesList.length === 1 && activeStrategiesList.includes('TREND_PULLBACK')
                  ? 'bg-teal-600 text-white border-teal-400 shadow-sm'
                  : 'bg-[#0E1117] text-gray-300 border-[#30363D] hover:border-gray-500 hover:text-white'
              }`}
            >
              🎯 Trend-Pullback Solo
            </button>
            <button
              type="button"
              onClick={() => setStrategyPreset(['LIQUIDITY_SWEEP_REVERSAL'])}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition border cursor-pointer ${
                activeStrategiesList.length === 1 && (activeStrategiesList.includes('LIQUIDITY_SWEEP_REVERSAL') || activeStrategiesList.includes('SMC_LIQUIDITY'))
                  ? 'bg-cyan-600 text-white border-cyan-400 shadow-sm'
                  : 'bg-[#0E1117] text-gray-300 border-[#30363D] hover:border-gray-500 hover:text-white'
              }`}
            >
              💧 LSR Solo (2:1+)
            </button>
            <button
              type="button"
              onClick={() => setStrategyPreset([])}
              className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-rose-400 hover:text-rose-300 bg-rose-950/20 border border-rose-900/30 hover:bg-rose-900/40 transition cursor-pointer"
              title="Deactivate all strategies to stand aside"
            >
              Stand Aside
            </button>
          </div>
        </div>
      </div>

      {/* Strategies Navigation Sub-Bar */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 border-b border-[#30363D] text-xs">
        <button
          onClick={() => setActiveSubTab('overview')}
          className={`flex items-center gap-2 px-3.5 py-2 font-bold rounded-t-lg transition-colors cursor-pointer border-b-2 whitespace-nowrap ${
            activeSubTab === 'overview'
              ? 'bg-[#161B22] text-white border-indigo-500'
              : 'text-gray-400 hover:text-gray-200 border-transparent hover:bg-[#161B22]/50'
          }`}
        >
          <Layers size={15} />
          <span>Portfolio Overview</span>
          <span className="text-[10px] px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300 font-mono">
            {installedStrategies.length}
          </span>
        </button>

        {!deletedStrategies.includes('COIL_BREAKOUT') && (
          <button
            onClick={() => setActiveSubTab('coil')}
            className={`flex items-center gap-2 px-3.5 py-2 font-semibold rounded-t-lg transition-colors cursor-pointer border-b-2 whitespace-nowrap ${
              activeSubTab === 'coil'
                ? 'bg-[#161B22] text-white border-purple-500 font-bold'
                : 'text-gray-400 hover:text-gray-200 border-transparent hover:bg-[#161B22]/50'
            }`}
          >
            <span>🌀 Volatility Compression Breakout (VCB)</span>
            {(activeStrategiesList.includes('COIL_BREAKOUT') || activeStrategiesList.includes('VCB')) && (
              <span className="w-1.5 h-1.5 rounded-full bg-purple-400"></span>
            )}
          </button>
        )}

        {!deletedStrategies.includes('MULTICOIN_SCALPER_PRO') && (
          <button
            onClick={() => setActiveSubTab('scalper')}
            className={`flex items-center gap-2 px-3.5 py-2 font-semibold rounded-t-lg transition-colors cursor-pointer border-b-2 whitespace-nowrap ${
              activeSubTab === 'scalper'
                ? 'bg-[#161B22] text-white border-amber-500 font-bold'
                : 'text-gray-400 hover:text-gray-200 border-transparent hover:bg-[#161B22]/50'
            }`}
          >
            <span>⚡ Scalper PRO</span>
            {activeStrategiesList.includes('MULTICOIN_SCALPER_PRO') && (
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
            )}
          </button>
        )}

        {!deletedStrategies.includes('TREND_PULLBACK') && (
          <button
            onClick={() => setActiveSubTab('trendPullback')}
            className={`flex items-center gap-2 px-3.5 py-2 font-semibold rounded-t-lg transition-colors cursor-pointer border-b-2 whitespace-nowrap ${
              activeSubTab === 'trendPullback'
                ? 'bg-[#161B22] text-white border-teal-500 font-bold'
                : 'text-gray-400 hover:text-gray-200 border-transparent hover:bg-[#161B22]/50'
            }`}
          >
            <span>🎯 Trend-Pullback</span>
            {activeStrategiesList.includes('TREND_PULLBACK') && (
              <span className="w-1.5 h-1.5 rounded-full bg-teal-400"></span>
            )}
          </button>
        )}

        {!deletedStrategies.includes('LIQUIDITY_SWEEP_REVERSAL') && (
          <button
            onClick={() => setActiveSubTab('lsr')}
            className={`flex items-center gap-2 px-3.5 py-2 font-semibold rounded-t-lg transition-colors cursor-pointer border-b-2 whitespace-nowrap ${
              activeSubTab === 'lsr'
                ? 'bg-[#161B22] text-white border-cyan-500 font-bold'
                : 'text-gray-400 hover:text-gray-200 border-transparent hover:bg-[#161B22]/50'
            }`}
          >
            <span>💧 Liquidity Sweep (LSR)</span>
            {(activeStrategiesList.includes('LIQUIDITY_SWEEP_REVERSAL') || activeStrategiesList.includes('SMC_LIQUIDITY')) && (
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
            )}
          </button>
        )}

        {!deletedStrategies.includes('ORDER_BLOCK') && (
          <button
            onClick={() => setActiveSubTab('orderBlock')}
            className={`flex items-center gap-2 px-3.5 py-2 font-semibold rounded-t-lg transition-colors cursor-pointer border-b-2 whitespace-nowrap ${
              activeSubTab === 'orderBlock'
                ? 'bg-[#161B22] text-white border-indigo-500 font-bold'
                : 'text-gray-400 hover:text-gray-200 border-transparent hover:bg-[#161B22]/50'
            }`}
          >
            <span>🧱 Order Block (1:3.5+)</span>
            {activeStrategiesList.includes('ORDER_BLOCK') && (
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400"></span>
            )}
          </button>
        )}

        {!deletedStrategies.includes('RANGE_REGIME_V1') && (
          <button
            onClick={() => setActiveSubTab('rangeRegime')}
            className={`flex items-center gap-2 px-3.5 py-2 font-semibold rounded-t-lg transition-colors cursor-pointer border-b-2 whitespace-nowrap ${
              activeSubTab === 'rangeRegime'
                ? 'bg-[#161B22] text-white border-cyan-400 font-bold'
                : 'text-gray-400 hover:text-gray-200 border-transparent hover:bg-[#161B22]/50'
            }`}
          >
            <span>📊 Range Regime V1</span>
            {(activeStrategiesList.includes('RANGE_REGIME_V1') || activeStrategiesList.includes('RANGE_REGIME')) && (
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
            )}
          </button>
        )}

        {archivedStrategies.length > 0 && (
          <button
            onClick={() => setActiveSubTab('archived')}
            className={`flex items-center gap-2 px-3.5 py-2 font-semibold rounded-t-lg transition-colors cursor-pointer border-b-2 whitespace-nowrap ${
              activeSubTab === 'archived'
                ? 'bg-[#161B22] text-rose-300 border-rose-500 font-bold'
                : 'text-gray-400 hover:text-gray-200 border-transparent hover:bg-[#161B22]/50'
            }`}
          >
            <Archive size={14} className="text-rose-400" />
            <span>Archived ({archivedStrategies.length})</span>
          </button>
        )}
      </div>

      {/* SUB-VIEW 1: PORTFOLIO OVERVIEW */}
      {activeSubTab === 'overview' && (
        <div className="space-y-6">
          {/* Confluence Synergy Arbitration Card */}
          <div className="bg-[#12161E] border border-[#30363D] rounded-xl p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#30363D]/60 pb-3">
              <div>
                <div className="text-xs font-bold text-gray-200 flex items-center gap-1.5">
                  <Zap size={15} className="text-amber-400" />
                  <span>Multi-Strategy Confluence Routing Mode</span>
                </div>
                <div className="text-[11px] text-gray-400 mt-0.5">
                  Determines how the scanner and auto-trader arbitrate and size signals across active strategies.
                </div>
              </div>
              <div className="flex bg-[#0E1117] rounded-lg p-1 border border-[#30363D] flex-wrap gap-1">
                {[
                  { id: 'CONFLUENCE_BOOST', label: 'Confluence Boost (+12)' },
                  { id: 'BEST_SIGNAL', label: 'Best Single Signal' },
                  { id: 'CONCURRENT_INDEPENDENT', label: 'Concurrent Independent' }
                ].map((mode) => (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => handleSettingChange('multiStrategyMode', mode.id as any)}
                    className={`px-2.5 py-1 rounded text-xs font-semibold transition ${
                      (settings.multiStrategyMode || 'CONFLUENCE_BOOST') === mode.id
                        ? 'bg-indigo-600 text-white shadow-sm font-bold'
                        : 'text-gray-400 hover:text-gray-200'
                    }`}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="p-3 bg-indigo-950/20 border border-indigo-500/20 rounded-lg flex items-start gap-3 text-xs text-gray-300">
              <CheckCircle2 size={16} className="text-emerald-400 shrink-0 mt-0.5" />
              <div className="leading-relaxed text-[11px]">
                <strong className="text-white font-semibold">Institutional Confluence Arbitration:</strong> When multiple active strategies (e.g. Trend-Pullback + Liquidity Sweep Reversal) generate signals on the same coin in the same direction, the composite score receives an automatic <span className="text-emerald-400 font-bold">+12 point confluence boost</span>. The Trade Log and Scanner will tag the entry with <span className="text-emerald-300 font-mono font-bold">⚡ Confluence</span>.
              </div>
            </div>
          </div>

          {/* Strategy Cards Grid */}
          <div className="space-y-4">
            <div className="flex items-center justify-between text-xs text-gray-400 font-semibold px-1">
              <span>ACTIVE STRATEGIES ({installedStrategies.length})</span>
              <span className="text-[11px] text-gray-500 font-normal">Click any card control to activate, solo, or tune parameters</span>
            </div>

            <div className="grid grid-cols-1 gap-4">
              {installedStrategies.map((strat) => {
                const isActive = activeStrategiesList.includes(strat.id);
                const liveMatch = liveCoinMatches[strat.id] || { count: 0, symbols: [] };

                return (
                  <div
                    key={strat.id}
                    className={`p-5 rounded-xl border transition-all flex flex-col lg:flex-row lg:items-center justify-between gap-5 ${
                      isActive
                        ? 'bg-gradient-to-r from-[#161B22] to-[#12161E] border-indigo-500/40 shadow-md shadow-indigo-950/15'
                        : 'bg-[#12161E]/60 border-[#30363D] opacity-75 hover:opacity-100 hover:border-gray-500'
                    }`}
                  >
                    {/* Left: Info */}
                    <div className="flex items-start gap-4 flex-1 min-w-0">
                      <div
                        onClick={() => toggleStrategyInPortfolio(strat.id)}
                        className="cursor-pointer pt-1"
                        title={isActive ? 'Deactivate strategy' : 'Activate strategy'}
                      >
                        <input
                          type="checkbox"
                          checked={isActive}
                          onChange={() => {}}
                          className="w-4 h-4 rounded border-gray-600 text-indigo-600 focus:ring-0 cursor-pointer"
                        />
                      </div>

                      <div className="flex-1 min-w-0 space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3
                            onClick={() => toggleStrategyInPortfolio(strat.id)}
                            className="font-bold text-gray-100 text-sm cursor-pointer hover:text-indigo-300 transition"
                          >
                            {strat.name}
                          </h3>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                            strat.color === 'emerald' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' :
                            strat.color === 'amber' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' :
                            strat.color === 'teal' ? 'bg-teal-500/20 text-teal-300 border border-teal-500/30' :
                            'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                          }`}>
                            {strat.badge}
                          </span>
                          <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded ${
                            isActive
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                              : 'bg-gray-800 text-gray-500 border border-gray-700'
                          }`}>
                            {isActive ? 'ACTIVE IN ENGINE' : 'PAUSED'}
                          </span>

                          {/* Live Scan Matches Pill */}
                          <div className="flex items-center gap-1 text-[10px] font-mono text-gray-400 bg-[#0E1117] px-2 py-0.5 rounded border border-[#30363D]">
                            <Activity size={10} className={liveMatch.count > 0 ? "text-emerald-400 animate-pulse" : "text-gray-500"} />
                            <span>Live Matches: <strong className="text-gray-200">{liveMatch.count}</strong></span>
                            {liveMatch.count > 0 && liveMatch.symbols.length > 0 && onInspectCoin && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onInspectCoin(liveMatch.symbols[0]);
                                }}
                                className="text-indigo-400 hover:text-white ml-1 underline"
                                title={`Inspect ${liveMatch.symbols.slice(0, 3).join(', ')}`}
                              >
                                View ({liveMatch.symbols[0]})
                              </button>
                            )}
                          </div>
                        </div>

                        <p className="text-xs text-gray-400 leading-relaxed max-w-3xl">
                          {strat.desc}
                        </p>
                      </div>
                    </div>

                    {/* Right: Actions */}
                    <div className="flex flex-wrap items-center gap-2 shrink-0 self-end lg:self-center">
                      <button
                        type="button"
                        onClick={() => toggleStrategyInPortfolio(strat.id)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition border cursor-pointer ${
                          isActive
                            ? 'bg-rose-950/30 text-rose-300 border-rose-800/40 hover:bg-rose-900/40'
                            : 'bg-emerald-950/30 text-emerald-300 border-emerald-800/40 hover:bg-emerald-900/40'
                        }`}
                      >
                        {isActive ? 'Pause' : 'Activate'}
                      </button>

                      <button
                        type="button"
                        onClick={() => setSoloStrategy(strat.id)}
                        className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-gray-400 hover:text-white bg-[#0E1117] border border-[#30363D] hover:border-gray-500 transition cursor-pointer"
                        title="Deactivate all other strategies and trade this strategy exclusively"
                      >
                        Solo
                      </button>

                      {strat.configTab && (
                        <button
                          type="button"
                          onClick={() => setActiveSubTab(strat.configTab as any)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-indigo-400 hover:text-indigo-200 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 transition cursor-pointer"
                        >
                          <SlidersHorizontal size={13} />
                          <span>Tune Parameters</span>
                        </button>
                      )}

                      {strat.configTab && (
                        <button
                          type="button"
                          onClick={() => handleCopyPineScript(strat.id, strat.name)}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-gray-400 hover:text-cyan-300 bg-[#0E1117] border border-[#30363D] hover:border-cyan-500/50 transition cursor-pointer"
                          title="Copy TradingView Pine Script v6"
                        >
                          {copiedPineStrat === strat.id ? (
                            <>
                              <Check size={13} className="text-emerald-400" />
                              <span className="text-emerald-400">Copied!</span>
                            </>
                          ) : (
                            <>
                              <Code size={13} />
                              <span>Pine v6</span>
                            </>
                          )}
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => setStrategyToDelete(strat)}
                        className="px-2 py-1.5 rounded-lg text-xs text-rose-400 hover:text-rose-200 bg-rose-950/20 hover:bg-rose-900/40 border border-rose-800/30 hover:border-rose-600/50 transition cursor-pointer"
                        title={`Archive ${strat.name}`}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* SUB-VIEW 2: COIL BREAKOUT / VCB CONFIG */}
      {activeSubTab === 'coil' && (
        <div className="space-y-6">
          <VcbStrategyControlPanel
            settings={settings}
            onUpdateSettings={onUpdateSettings}
            onActivateStrategy={() => toggleStrategyInPortfolio('COIL_BREAKOUT')}
            isActive={activeStrategiesList.includes('COIL_BREAKOUT') || activeStrategiesList.includes('VCB')}
          />
          <div className="p-4 bg-gradient-to-r from-emerald-950/40 via-teal-950/30 to-blue-950/20 border border-emerald-500/30 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start space-x-3">
              <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-400 mt-0.5 shrink-0">
                <Target size={20} className="animate-pulse" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <h3 className="text-sm font-extrabold text-white tracking-wide">TWO-SIDED COIL BREAKOUT (1:5+ R:R)</h3>
                  {activeStrategiesList.includes('COIL_BREAKOUT') ? (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                      ACTIVE IN ENGINE
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-gray-700/50 text-gray-400 border border-gray-600/30">
                      PAUSED
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-400 mt-1 max-w-xl leading-relaxed">
                  Identifies structural consolidation coils with decreasing highs and rising lows. Enforces minimum 1:5 reward-risk and tight invalidation on breakout failure.
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-2 shrink-0">
              <button
                onClick={() => handleCopyPineScript('COIL_BREAKOUT', 'Coil Breakout')}
                className="flex items-center space-x-1.5 px-3 py-2 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 text-emerald-300 hover:text-white text-xs font-bold transition-all shadow-sm cursor-pointer"
              >
                <Code size={14} />
                <span>Copy Pine Script v6</span>
              </button>
              <button
                onClick={() => handleViewPineScript('COIL_BREAKOUT', 'Coil Breakout')}
                className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700 transition"
                title="View Pine Script Code"
              >
                <Eye size={14} />
              </button>
              <button
                onClick={() => toggleStrategyInPortfolio('COIL_BREAKOUT')}
                className={`px-3 py-2 rounded-lg text-xs font-bold transition ${
                  activeStrategiesList.includes('COIL_BREAKOUT')
                    ? 'bg-rose-950/30 text-rose-300 border border-rose-800/40 hover:bg-rose-900/40'
                    : 'bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold'
                }`}
              >
                {activeStrategiesList.includes('COIL_BREAKOUT') ? 'Pause Strategy' : 'Activate in Portfolio'}
              </button>
            </div>
          </div>

          {/* Coil Parameters Form */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-[#0E1117] border border-[#30363D] rounded-xl p-4 space-y-4">
              <h4 className="text-xs font-bold text-emerald-400 uppercase tracking-wider border-b border-[#30363D] pb-2">
                1. Coil Geometry & Lookback
              </h4>
              <div>
                <label className="text-xs font-bold text-gray-300 block mb-1">Max Coil Length (Candles)</label>
                <input
                  type="number"
                  value={settings.coilMaxLength ?? 20}
                  onChange={(e) => handleSettingChange('coilMaxLength', parseInt(e.target.value) || 20)}
                  className="w-full bg-[#161B22] border border-[#30363D] rounded px-3 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-emerald-500"
                />
                <span className="text-[10px] text-gray-500 mt-1 block">Default: 20 candles. Maximum length to detect narrowing coil consolidation.</span>
              </div>
              <div>
                <label className="text-xs font-bold text-gray-300 block mb-1">Max Coil Height (ATR Multiplier)</label>
                <input
                  type="number"
                  step="0.05"
                  value={settings.coilMaxHeightAtr ?? 1.25}
                  onChange={(e) => handleSettingChange('coilMaxHeightAtr', parseFloat(e.target.value) || 1.25)}
                  className="w-full bg-[#161B22] border border-[#30363D] rounded px-3 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-emerald-500"
                />
                <span className="text-[10px] text-gray-500 mt-1 block">Maximum total height allowed for the coil (default: 1.25x ATR).</span>
              </div>
              <div>
                <label className="text-xs font-bold text-gray-300 block mb-1">Median Range Threshold (ATR Multiplier)</label>
                <input
                  type="number"
                  step="0.05"
                  value={settings.coilMedianRangeAtr ?? 0.70}
                  onChange={(e) => handleSettingChange('coilMedianRangeAtr', parseFloat(e.target.value) || 0.70)}
                  className="w-full bg-[#161B22] border border-[#30363D] rounded px-3 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-emerald-500"
                />
                <span className="text-[10px] text-gray-500 mt-1 block">Compression indicator (default: 0.70x ATR).</span>
              </div>
            </div>

            <div className="bg-[#0E1117] border border-[#30363D] rounded-xl p-4 space-y-4">
              <h4 className="text-xs font-bold text-emerald-400 uppercase tracking-wider border-b border-[#30363D] pb-2">
                2. Breakout Confirmation & Targets
              </h4>
              <div>
                <label className="text-xs font-bold text-gray-300 block mb-1">Minimum Reward-to-Risk (R:R)</label>
                <input
                  type="number"
                  step="0.5"
                  value={settings.coilMinRewardRisk ?? 5.0}
                  onChange={(e) => handleSettingChange('coilMinRewardRisk', parseFloat(e.target.value) || 5.0)}
                  className="w-full bg-[#161B22] border border-[#30363D] rounded px-3 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-emerald-500"
                />
                <span className="text-[10px] text-gray-500 mt-1 block">Default: 5.0 (High-asymmetry target).</span>
              </div>
              <div>
                <label className="text-xs font-bold text-gray-300 block mb-1">Entry Execution Mode</label>
                <select
                  value={settings.coilEntryMode || 'limit_on_retest'}
                  onChange={(e) => handleSettingChange('coilEntryMode', e.target.value as any)}
                  className="w-full bg-[#161B22] border border-[#30363D] rounded px-3 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-emerald-500"
                >
                  <option value="limit_on_retest">Limit Order on Breakout Retest (Best R:R)</option>
                  <option value="market_on_breakout_close">Market Order on Confirmed Breakout Close</option>
                </select>
              </div>
              <div className="pt-2 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-gray-200 block">Require BTC Trend Alignment</span>
                  <span className="text-[10px] text-gray-400">Filters long breakouts if BTC is dumping</span>
                </div>
                <input
                  type="checkbox"
                  checked={settings.coilRequireBtcFilter ?? true}
                  onChange={(e) => handleSettingChange('coilRequireBtcFilter', e.target.checked)}
                  className="w-4 h-4 rounded border-gray-600 text-emerald-600 focus:ring-0 cursor-pointer"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUB-VIEW 3: SCALPER PRO CONFIG */}
      {activeSubTab === 'scalper' && (
        <div className="space-y-6">
          <div className="p-4 bg-gradient-to-r from-amber-950/40 via-yellow-950/30 to-indigo-950/20 border border-amber-500/30 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start space-x-3">
              <div className="p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-400 mt-0.5 shrink-0">
                <Zap size={20} className="animate-pulse" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <h3 className="text-sm font-extrabold text-white tracking-wide">3COMMAS MULTICOIN SCALPER PRO (SWISSALGO)</h3>
                  {activeStrategiesList.includes('MULTICOIN_SCALPER_PRO') ? (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                      ACTIVE IN ENGINE
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-gray-700/50 text-gray-400 border border-gray-600/30">
                      PAUSED
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-400 mt-1 max-w-xl leading-relaxed">
                  Fast EMA Ribbon stack (9/21/55), Session VWAP confluence, and RSI pullback confirmation for high-volume altcoins.
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-2 shrink-0">
              <button
                onClick={() => handleCopyPineScript('MULTICOIN_SCALPER_PRO', 'Scalper PRO')}
                className="flex items-center space-x-1.5 px-3 py-2 rounded-lg bg-amber-600/20 hover:bg-amber-600/30 border border-amber-500/40 text-amber-300 hover:text-white text-xs font-bold transition-all shadow-sm cursor-pointer"
              >
                <Code size={14} />
                <span>Copy Pine Script v6</span>
              </button>
              <button
                onClick={() => handleViewPineScript('MULTICOIN_SCALPER_PRO', 'Scalper PRO')}
                className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700 transition"
                title="View Pine Script Code"
              >
                <Eye size={14} />
              </button>
              <button
                onClick={() => toggleStrategyInPortfolio('MULTICOIN_SCALPER_PRO')}
                className={`px-3 py-2 rounded-lg text-xs font-bold transition ${
                  activeStrategiesList.includes('MULTICOIN_SCALPER_PRO')
                    ? 'bg-rose-950/30 text-rose-300 border border-rose-800/40 hover:bg-rose-900/40'
                    : 'bg-amber-500 hover:bg-amber-400 text-black font-extrabold'
                }`}
              >
                {activeStrategiesList.includes('MULTICOIN_SCALPER_PRO') ? 'Pause Strategy' : 'Activate in Portfolio'}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-[#0E1117] border border-[#30363D] rounded-xl p-4 space-y-4">
              <h4 className="text-xs font-bold text-amber-400 uppercase tracking-wider border-b border-[#30363D] pb-2">
                1. Execution Profile & Indicators
              </h4>
              <div>
                <label className="text-xs font-bold text-gray-300 block mb-1">Scalping Profile</label>
                <select
                  value={settings.multicoinProfile || '5m_SCALP'}
                  onChange={(e) => handleSettingChange('multicoinProfile', e.target.value as any)}
                  className="w-full bg-[#161B22] border border-[#30363D] rounded px-3 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-amber-500"
                >
                  <option value="5m_SCALP">5m Scalp (Recommended Intraday)</option>
                  <option value="1m_SCALP">1m Fast Scalp (Aggressive)</option>
                  <option value="15m_MOMENTUM">15m Momentum (Swing Scalp)</option>
                </select>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[11px] font-bold text-gray-400 block mb-1">Fast EMA</label>
                  <input
                    type="number"
                    value={settings.multicoinEmaFast ?? 9}
                    onChange={(e) => handleSettingChange('multicoinEmaFast', parseInt(e.target.value) || 9)}
                    className="w-full bg-[#161B22] border border-[#30363D] rounded px-2.5 py-1 text-xs text-gray-200"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-gray-400 block mb-1">Mid EMA</label>
                  <input
                    type="number"
                    value={settings.multicoinEmaMid ?? 21}
                    onChange={(e) => handleSettingChange('multicoinEmaMid', parseInt(e.target.value) || 21)}
                    className="w-full bg-[#161B22] border border-[#30363D] rounded px-2.5 py-1 text-xs text-gray-200"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-gray-400 block mb-1">Slow EMA</label>
                  <input
                    type="number"
                    value={settings.multicoinEmaSlow ?? 55}
                    onChange={(e) => handleSettingChange('multicoinEmaSlow', parseInt(e.target.value) || 55)}
                    className="w-full bg-[#161B22] border border-[#30363D] rounded px-2.5 py-1 text-xs text-gray-200"
                  />
                </div>
              </div>
              <div className="flex items-center justify-between pt-2">
                <div>
                  <span className="text-xs font-bold text-gray-200 block">Require Session VWAP Alignment</span>
                  <span className="text-[10px] text-gray-400">Price must be above VWAP for Longs</span>
                </div>
                <input
                  type="checkbox"
                  checked={settings.multicoinRequireVwap ?? true}
                  onChange={(e) => handleSettingChange('multicoinRequireVwap', e.target.checked)}
                  className="w-4 h-4 rounded border-gray-600 text-amber-600 focus:ring-0 cursor-pointer"
                />
              </div>
            </div>

            <div className="bg-[#0E1117] border border-[#30363D] rounded-xl p-4 space-y-4">
              <h4 className="text-xs font-bold text-amber-400 uppercase tracking-wider border-b border-[#30363D] pb-2">
                2. Profit Targets & Risk
              </h4>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-gray-300 block mb-1">TP1 Target (%)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={settings.multicoinTp1Pct ?? 0.8}
                    onChange={(e) => handleSettingChange('multicoinTp1Pct', parseFloat(e.target.value) || 0.8)}
                    className="w-full bg-[#161B22] border border-[#30363D] rounded px-3 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-amber-500"
                  />
                  <span className="text-[10px] text-gray-500 mt-1 block">Default: 0.8%</span>
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-300 block mb-1">TP2 Target (%)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={settings.multicoinTp2Pct ?? 1.5}
                    onChange={(e) => handleSettingChange('multicoinTp2Pct', parseFloat(e.target.value) || 1.5)}
                    className="w-full bg-[#161B22] border border-[#30363D] rounded px-3 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-amber-500"
                  />
                  <span className="text-[10px] text-gray-500 mt-1 block">Default: 1.5%</span>
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-gray-300 block mb-1">Min 24h Volume (USDT)</label>
                <input
                  type="number"
                  value={settings.multicoinMin24hVolumeUsdt ?? 20000000}
                  onChange={(e) => handleSettingChange('multicoinMin24hVolumeUsdt', parseInt(e.target.value) || 20000000)}
                  className="w-full bg-[#161B22] border border-[#30363D] rounded px-3 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-amber-500"
                />
                <span className="text-[10px] text-gray-500 mt-1 block">Filters out illiquid micro-caps. Default: $20,000,000</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUB-VIEW 4: TREND PULLBACK CONFIG */}
      {activeSubTab === 'trendPullback' && (
        <div className="space-y-6">
          <div className="p-4 bg-gradient-to-r from-teal-950/40 via-cyan-950/30 to-blue-950/20 border border-teal-500/30 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start space-x-3">
              <div className="p-2.5 bg-teal-500/10 border border-teal-500/30 rounded-lg text-teal-400 mt-0.5 shrink-0">
                <TrendingUp size={20} className="animate-pulse" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <h3 className="text-sm font-extrabold text-white tracking-wide">ROBUST TREND-PULLBACK STRATEGY (1:3+ R:R)</h3>
                  {activeStrategiesList.includes('TREND_PULLBACK') ? (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                      ACTIVE IN ENGINE
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-gray-700/50 text-gray-400 border border-gray-600/30">
                      PAUSED
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-400 mt-1 max-w-xl leading-relaxed">
                  Institutional trend alignment with dynamic EMA pullback zones. Uses structural invalidation stop loss to withstand normal retest noise.
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-2 shrink-0">
              <button
                onClick={() => handleCopyPineScript('TREND_PULLBACK', 'Trend-Pullback')}
                className="flex items-center space-x-1.5 px-3 py-2 rounded-lg bg-teal-600/20 hover:bg-teal-600/30 border border-teal-500/40 text-teal-300 hover:text-white text-xs font-bold transition-all shadow-sm cursor-pointer"
              >
                <Code size={14} />
                <span>Copy Pine Script v6</span>
              </button>
              <button
                onClick={() => handleViewPineScript('TREND_PULLBACK', 'Trend-Pullback')}
                className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700 transition"
                title="View Pine Script Code"
              >
                <Eye size={14} />
              </button>
              <button
                onClick={() => toggleStrategyInPortfolio('TREND_PULLBACK')}
                className={`px-3 py-2 rounded-lg text-xs font-bold transition ${
                  activeStrategiesList.includes('TREND_PULLBACK')
                    ? 'bg-rose-950/30 text-rose-300 border border-rose-800/40 hover:bg-rose-900/40'
                    : 'bg-teal-500 hover:bg-teal-400 text-black font-extrabold'
                }`}
              >
                {activeStrategiesList.includes('TREND_PULLBACK') ? 'Pause Strategy' : 'Activate in Portfolio'}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-[#0E1117] border border-[#30363D] rounded-xl p-4 space-y-4">
              <h4 className="text-xs font-bold text-teal-400 uppercase tracking-wider border-b border-[#30363D] pb-2">
                1. EMA Trend Structure
              </h4>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[11px] font-bold text-gray-400 block mb-1">Fast EMA</label>
                  <input
                    type="number"
                    value={settings.tpFastEma ?? 20}
                    onChange={(e) => handleSettingChange('tpFastEma', parseInt(e.target.value) || 20)}
                    className="w-full bg-[#161B22] border border-[#30363D] rounded px-2.5 py-1 text-xs text-gray-200"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-gray-400 block mb-1">Slow EMA</label>
                  <input
                    type="number"
                    value={settings.tpSlowEma ?? 50}
                    onChange={(e) => handleSettingChange('tpSlowEma', parseInt(e.target.value) || 50)}
                    className="w-full bg-[#161B22] border border-[#30363D] rounded px-2.5 py-1 text-xs text-gray-200"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-gray-400 block mb-1">Trend EMA</label>
                  <input
                    type="number"
                    value={settings.tpTrendEma ?? 200}
                    onChange={(e) => handleSettingChange('tpTrendEma', parseInt(e.target.value) || 200)}
                    className="w-full bg-[#161B22] border border-[#30363D] rounded px-2.5 py-1 text-xs text-gray-200"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-gray-300 block mb-1">Min Stop Distance (ATR Multiplier)</label>
                <input
                  type="number"
                  step="0.1"
                  value={settings.tpMinStopDistanceATR ?? 0.5}
                  onChange={(e) => handleSettingChange('tpMinStopDistanceATR', parseFloat(e.target.value) || 0.5)}
                  className="w-full bg-[#161B22] border border-[#30363D] rounded px-3 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-teal-500"
                />
                <span className="text-[10px] text-gray-500 mt-1 block">Minimum invalidation distance for stop loss (default: 0.5x ATR).</span>
              </div>
            </div>

            <div className="bg-[#0E1117] border border-[#30363D] rounded-xl p-4 space-y-4">
              <h4 className="text-xs font-bold text-teal-400 uppercase tracking-wider border-b border-[#30363D] pb-2">
                2. Invalidation & Filters
              </h4>
              <div>
                <label className="text-xs font-bold text-gray-300 block mb-1">Max Stop Distance (ATR Multiplier)</label>
                <input
                  type="number"
                  step="0.1"
                  value={settings.tpMaxStopDistanceATR ?? 3.0}
                  onChange={(e) => handleSettingChange('tpMaxStopDistanceATR', parseFloat(e.target.value) || 3.0)}
                  className="w-full bg-[#161B22] border border-[#30363D] rounded px-3 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-teal-500"
                />
                <span className="text-[10px] text-gray-500 mt-1 block">Upper bound for stop distance to prevent excessive risk (default: 3.0x ATR).</span>
              </div>
              <div>
                <label className="text-xs font-bold text-gray-300 block mb-1">ADX Minimum Trend Strength</label>
                <input
                  type="number"
                  value={settings.tpAdxThreshold ?? 25}
                  onChange={(e) => handleSettingChange('tpAdxThreshold', parseInt(e.target.value) || 25)}
                  className="w-full bg-[#161B22] border border-[#30363D] rounded px-3 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-teal-500"
                />
                <span className="text-[10px] text-gray-500 mt-1 block">Filters low-volatility chop. Default: 25</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUB-VIEW 5: LIQUIDITY SWEEP REVERSAL (LSR) CONFIG */}
      {activeSubTab === 'lsr' && (
        <div className="space-y-6">
          <div className="p-4 bg-gradient-to-r from-cyan-950/40 via-blue-950/30 to-indigo-950/20 border border-cyan-500/30 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start space-x-3">
              <div className="p-2.5 bg-cyan-500/10 border border-cyan-500/30 rounded-lg text-cyan-400 mt-0.5 shrink-0">
                <Droplets size={20} className="animate-pulse" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <h3 className="text-sm font-extrabold text-white tracking-wide">LIQUIDITY SWEEP REVERSAL (LSR) STRATEGY</h3>
                  {activeStrategiesList.includes('LIQUIDITY_SWEEP_REVERSAL') || activeStrategiesList.includes('SMC_LIQUIDITY') ? (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                      ACTIVE IN ENGINE
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-gray-700/50 text-gray-400 border border-gray-600/30">
                      PAUSED
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-400 mt-1 max-w-xl leading-relaxed">
                  Institutional failed-breakout engine: Obvious Liquidity &rarr; Sweep &rarr; True vs Continuation Check &rarr; Mandatory Reclaim &rarr; Micro-Structure Shift &rarr; Tight Stop & Opposing Target.
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-2 shrink-0">
              <button
                onClick={() => handleCopyPineScript('LIQUIDITY_SWEEP_REVERSAL', 'Liquidity Sweep (LSR)')}
                className="flex items-center space-x-1.5 px-3 py-2 rounded-lg bg-cyan-600/20 hover:bg-cyan-600/30 border border-cyan-500/40 text-cyan-300 hover:text-white text-xs font-bold transition-all shadow-sm cursor-pointer"
              >
                <Code size={14} />
                <span>Copy Pine Script v6</span>
              </button>
              <button
                onClick={() => handleViewPineScript('LIQUIDITY_SWEEP_REVERSAL', 'Liquidity Sweep (LSR)')}
                className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700 transition"
                title="View Pine Script Code"
              >
                <Eye size={14} />
              </button>
              <button
                onClick={() => toggleStrategyInPortfolio('LIQUIDITY_SWEEP_REVERSAL')}
                className={`px-3 py-2 rounded-lg text-xs font-bold transition ${
                  activeStrategiesList.includes('LIQUIDITY_SWEEP_REVERSAL') || activeStrategiesList.includes('SMC_LIQUIDITY')
                    ? 'bg-rose-950/30 text-rose-300 border border-rose-800/40 hover:bg-rose-900/40'
                    : 'bg-cyan-500 hover:bg-cyan-400 text-black font-extrabold'
                }`}
              >
                {activeStrategiesList.includes('LIQUIDITY_SWEEP_REVERSAL') || activeStrategiesList.includes('SMC_LIQUIDITY') ? 'Pause Strategy' : 'Activate in Portfolio'}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-[#0E1117] border border-[#30363D] rounded-xl p-4 space-y-4">
              <h4 className="text-xs font-bold text-cyan-400 uppercase tracking-wider border-b border-[#30363D] pb-2 flex items-center justify-between">
                <span>1. High-Significance Liquidity Levels</span>
                <span className="text-[10px] text-emerald-400 font-mono font-bold bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-500/30">
                  INSTITUTIONAL POOLS
                </span>
              </h4>

              <div className="flex items-center justify-between p-2.5 rounded-lg bg-[#161B22] border border-cyan-500/30">
                <div>
                  <span className="text-xs font-bold text-white block">Focus on Important Levels Only</span>
                  <span className="text-[10px] text-gray-400 block mt-0.5">
                    Filters out minor 1-2 bar intraday noise. Only tracks Major Range Boundaries, Equal Highs/Lows, and Prominent Swings to improve winning possibility.
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={settings.lsrFocusImportantLevels ?? true}
                  onChange={(e) => handleSettingChange('lsrFocusImportantLevels', e.target.checked)}
                  className="w-4 h-4 rounded border-gray-600 text-cyan-600 focus:ring-0 cursor-pointer ml-3 shrink-0"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-300 block mb-1">Execution Timeframe</label>
                <select
                  value={settings.lsrExecutionTimeframe || '15m'}
                  onChange={(e) => handleSettingChange('lsrExecutionTimeframe', e.target.value)}
                  className="w-full bg-[#161B22] border border-[#30363D] rounded px-3 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-cyan-500"
                >
                  <option value="5m">5m (Tight scalping & rapid invalidation)</option>
                  <option value="15m">15m (Balanced intraday institutional reversals — recommended)</option>
                  <option value="1h">1H (Major HTF swing high/low sweeps)</option>
                  <option value="4h">4H (Macro high-timeframe liquidity cycles)</option>
                </select>
                <span className="text-[10px] text-gray-500 mt-1 block">Timeframe used to detect liquidity sweeps, rejection candles, and trigger entries.</span>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-300 block mb-1">Structure Lookback (Bars)</label>
                <input
                  type="number"
                  value={settings.lsrStructureLookback ?? 50}
                  onChange={(e) => handleSettingChange('lsrStructureLookback', parseInt(e.target.value) || 50)}
                  className="w-full bg-[#161B22] border border-[#30363D] rounded px-3 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-cyan-500"
                />
                <span className="text-[10px] text-gray-500 mt-1 block">Number of candles scanned to identify macro swing highs/lows. Default: 50 bars</span>
              </div>
              <div>
                <label className="text-xs font-bold text-gray-300 block mb-1">Min Liquidity Quality Score (0 to 5)</label>
                <input
                  type="number"
                  min="2"
                  max="5"
                  value={settings.lsrMinLiquidityScore ?? 3}
                  onChange={(e) => handleSettingChange('lsrMinLiquidityScore', parseInt(e.target.value) || 3)}
                  className="w-full bg-[#161B22] border border-[#30363D] rounded px-3 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-cyan-500"
                />
                <span className="text-[10px] text-gray-500 mt-1 block">3 = Strong Structural Swing, 4 = Equal Highs/Lows (Double Bottom/Top), 5 = Major Macro Boundary. Default: 3</span>
              </div>
              <div>
                <label className="text-xs font-bold text-gray-300 block mb-1">Min Swing Prominence (ATR Clearance)</label>
                <input
                  type="number"
                  step="0.1"
                  min="0.2"
                  max="2.0"
                  value={settings.lsrMinSwingProminenceAtr ?? 0.5}
                  onChange={(e) => handleSettingChange('lsrMinSwingProminenceAtr', parseFloat(e.target.value) || 0.5)}
                  className="w-full bg-[#161B22] border border-[#30363D] rounded px-3 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-cyan-500"
                />
                <span className="text-[10px] text-gray-500 mt-1 block">Ensures level stands out with clear price rejection away from pivot (default: 0.5x ATR).</span>
              </div>
              <div>
                <label className="text-xs font-bold text-gray-300 block mb-1">Max Sweep Depth (ATR Multiplier)</label>
                <input
                  type="number"
                  step="0.1"
                  value={settings.lsrMaxSweepDepthAtr ?? 1.8}
                  onChange={(e) => handleSettingChange('lsrMaxSweepDepthAtr', parseFloat(e.target.value) || 1.8)}
                  className="w-full bg-[#161B22] border border-[#30363D] rounded px-3 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-cyan-500"
                />
                <span className="text-[10px] text-gray-500 mt-1 block">Maximum probe depth beyond liquidity (default: 1.8x ATR). Deeper sweeps are true breakouts and get rejected.</span>
              </div>
            </div>

            <div className="bg-[#0E1117] border border-[#30363D] rounded-xl p-4 space-y-4">
              <h4 className="text-xs font-bold text-cyan-400 uppercase tracking-wider border-b border-[#30363D] pb-2">
                2. Mandatory Reclaim & Target Math
              </h4>
              <div>
                <label className="text-xs font-bold text-gray-300 block mb-1">Max Reclaim Window (Candles)</label>
                <input
                  type="number"
                  value={settings.lsrMaxReclaimCandles ?? 4}
                  onChange={(e) => handleSettingChange('lsrMaxReclaimCandles', parseInt(e.target.value) || 4)}
                  className="w-full bg-[#161B22] border border-[#30363D] rounded px-3 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-cyan-500"
                />
                <span className="text-[10px] text-gray-500 mt-1 block">Must close back inside level within 1-4 candles (anti-trap). Default: 4</span>
              </div>
              <div>
                <label className="text-xs font-bold text-gray-300 block mb-1">Minimum Reward-to-Risk (R:R)</label>
                <input
                  type="number"
                  step="0.1"
                  value={settings.lsrMinRewardRisk ?? 2.0}
                  onChange={(e) => handleSettingChange('lsrMinRewardRisk', parseFloat(e.target.value) || 2.0)}
                  className="w-full bg-[#161B22] border border-[#30363D] rounded px-3 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-cyan-500"
                />
                <span className="text-[10px] text-gray-500 mt-1 block">Minimum structural R:R to opposing liquidity. Default: 2.0:1</span>
              </div>
              <div className="pt-2 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-gray-200 block">Reject Middle-of-Range Setups</span>
                  <span className="text-[10px] text-gray-400">Avoids low-probability chops in the center</span>
                </div>
                <input
                  type="checkbox"
                  checked={settings.lsrRejectMiddleOfRange ?? true}
                  onChange={(e) => handleSettingChange('lsrRejectMiddleOfRange', e.target.checked)}
                  className="w-4 h-4 rounded border-gray-600 text-cyan-600 focus:ring-0 cursor-pointer"
                />
              </div>
            </div>

            {/* 3. Circled Reversal Setup Confirmation (User Specific Rule) */}
            <div className="bg-[#0E1117] border border-cyan-500/40 rounded-xl p-4 space-y-4 md:col-span-2">
              <div className="flex items-center justify-between border-b border-[#30363D] pb-2">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse"></span>
                  <h4 className="text-xs font-bold text-cyan-300 uppercase tracking-wider">
                    3. Circled Reversal Setup Confirmation (Execution Gate)
                  </h4>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-500/30">
                  INSTITUTIONAL PRICE ACTION
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 rounded-lg bg-[#161B22] border border-[#30363D]">
                    <div>
                      <span className="text-xs font-bold text-white block">
                        Wait for Circled Reversal Setup Before Executing
                      </span>
                      <span className="text-[10px] text-gray-400 block mt-0.5">
                        After LSR trigger, wait for a Hammer / Pin Bar rejection, Bullish/Bearish Engulfing, or Retest & Higher Low hold before firing execution.
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={settings.lsrRequireCandleConfirmation ?? true}
                      onChange={(e) => handleSettingChange('lsrRequireCandleConfirmation', e.target.checked)}
                      className="w-4 h-4 rounded border-gray-600 text-cyan-600 focus:ring-0 cursor-pointer ml-3 shrink-0"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-gray-300 block mb-1">
                      Min Rejection Wick % (Hammer / Pin Bar)
                    </label>
                    <input
                      type="number"
                      min="20"
                      max="70"
                      value={settings.lsrMinRejectionWickPct ?? 35}
                      onChange={(e) => handleSettingChange('lsrMinRejectionWickPct', parseInt(e.target.value) || 35)}
                      className="w-full bg-[#161B22] border border-[#30363D] rounded px-3 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-cyan-500"
                    />
                    <span className="text-[10px] text-gray-500 mt-1 block">
                      Minimum wick size relative to candle range (default: 35%). Higher values require more aggressive rejection wicks.
                    </span>
                  </div>
                </div>

                <div className="p-3.5 rounded-lg bg-[#12161E] border border-cyan-500/20 text-xs space-y-2">
                  <span className="text-[11px] font-bold text-cyan-300 uppercase tracking-wide block">
                    Supported Circled Reversal Formations
                  </span>
                  <div className="space-y-1.5 text-[11px] text-gray-300 font-mono">
                    <div className="flex items-start gap-1.5">
                      <span className="text-emerald-400 font-bold shrink-0">✔</span>
                      <span><b className="text-white">Pin Bar / Hammer:</b> Lower wick &ge; 35% rejecting sweep low, body holding upper half.</span>
                    </div>
                    <div className="flex items-start gap-1.5">
                      <span className="text-emerald-400 font-bold shrink-0">✔</span>
                      <span><b className="text-white">Engulfing Reclaim:</b> Strong expansion bar decisively closing back above the swept liquidity level.</span>
                    </div>
                    <div className="flex items-start gap-1.5">
                      <span className="text-emerald-400 font-bold shrink-0">✔</span>
                      <span><b className="text-white">Retest & Higher Low Hold:</b> Multi-bar retest holding strictly above sweep extreme with rejection bounce.</span>
                    </div>
                    <div className="flex items-start gap-1.5">
                      <span className="text-emerald-400 font-bold shrink-0">✔</span>
                      <span><b className="text-white">Two-Bar Piercing:</b> Aggressive reversal piercing 50%+ into prior sweep candle.</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUB-VIEW: ORDER BLOCK STRATEGY (SPEC V2) */}
      {activeSubTab === 'orderBlock' && (
        <div className="space-y-6">
          <div className="bg-[#12161E] border border-indigo-500/30 rounded-xl p-5 shadow-lg">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#30363D] pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-extrabold text-white">ORDER BLOCK STRATEGY (1:3.5+ R:R)</h3>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                    SMC DISPLACEMENT & RETEST
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                    RR ≥ 1:3.5
                  </span>
                </div>
                <p className="text-xs text-gray-400 mt-1 max-w-3xl leading-relaxed">
                  Pure price-action and market structure strategy. Identifies genuine Order Blocks created by displacement + Break of Structure (BOS), confirms closed candle first retests, enforces tight logical invalidation, and demands an asymmetric minimum 1:3.5 Risk/Reward with zero opposing blocker swings inside 2.0R.
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => toggleStrategyInPortfolio('ORDER_BLOCK')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition border cursor-pointer ${
                    activeStrategiesList.includes('ORDER_BLOCK')
                      ? 'bg-rose-500/10 text-rose-300 border-rose-500/30 hover:bg-rose-500/20'
                      : 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40 hover:bg-indigo-500/30'
                  }`}
                >
                  {activeStrategiesList.includes('ORDER_BLOCK') ? 'Deactivate' : 'Activate'}
                </button>
                <button
                  type="button"
                  onClick={() => handleViewPineScript('ORDER_BLOCK', 'Order Block Strategy')}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold bg-[#161B22] text-gray-300 hover:text-white border border-[#30363D] hover:border-gray-500 transition cursor-pointer flex items-center gap-1.5"
                >
                  <Code size={14} />
                  <span>Pine Script v6</span>
                </button>
              </div>
            </div>

            {/* Core Model & Quality Checklist */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4">
              <div className="p-4 bg-[#0E1117] rounded-xl border border-[#30363D] space-y-2">
                <h4 className="text-xs font-bold text-indigo-400 uppercase tracking-wider">
                  Core Execution Architecture (Spec v2)
                </h4>
                <div className="p-2.5 bg-[#161B22] rounded border border-indigo-950/60 font-mono text-[11px] text-gray-300">
                  Liquidity Event → Displacement (≥1.5 ATR) → BOS → Order Block Formation → First Retest → Closed Bar Reaction → Fast Entry
                </div>
                <ul className="text-xs text-gray-400 space-y-1.5 pt-1 list-disc pl-4">
                  <li><strong>Closed candles only:</strong> Structure, swings, and entries never repaint.</li>
                  <li><strong>Hard Gate RR:</strong> Requires ≥ 1:3.5 to genuine structural swing targets.</li>
                  <li><strong>Blocker Rule:</strong> Rejects any trade with a major opposing swing inside 2.0R.</li>
                  <li><strong>Cost Filter:</strong> Fees + slippage + spread must be ≤ 0.20R.</li>
                  <li><strong>Anti-Chase Limit:</strong> Never enter if price fled &gt; 0.5 ATR from zone near edge.</li>
                </ul>
              </div>

              <div className="p-4 bg-[#0E1117] rounded-xl border border-[#30363D] space-y-2">
                <h4 className="text-xs font-bold text-purple-400 uppercase tracking-wider">
                  Transparent Quality Checklist & Sizing (Section 12)
                </h4>
                <p className="text-xs text-gray-400">
                  Position size is dynamically derived from verified market factors rather than hidden scores:
                </p>
                <div className="space-y-1.5 text-xs">
                  <div className="flex items-center justify-between p-2 rounded bg-[#161B22] border border-[#30363D]">
                    <span className="text-gray-300">Grade A+ (6-7 factors): Sweep + Strong Disp + Vol + 1st Touch</span>
                    <span className="font-mono font-bold text-emerald-400">1.0x Full Size</span>
                  </div>
                  <div className="flex items-center justify-between p-2 rounded bg-[#161B22] border border-[#30363D]">
                    <span className="text-gray-300">Grade A (4-5 factors): Solid structural displacement & BOS</span>
                    <span className="font-mono font-bold text-teal-400">0.85x Size</span>
                  </div>
                  <div className="flex items-center justify-between p-2 rounded bg-[#161B22] border border-[#30363D]">
                    <span className="text-gray-300">Grade B (3 factors): Base confluence</span>
                    <span className="font-mono font-bold text-amber-400">0.60x Size</span>
                  </div>
                  <div className="flex items-center justify-between p-2 rounded bg-[#161B22] border border-[#30363D]">
                    <span className="text-gray-300">Grade C (&lt;3 factors): Marginal quality</span>
                    <span className="font-mono font-bold text-rose-400">0.40x Size</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUB-VIEW: RANGE REGIME V1 (SINGLE SOURCE OF TRUTH) */}
      {activeSubTab === 'rangeRegime' && (
        <div className="space-y-6">
          <RangeRegimeControlPanel
            settings={settings}
            onUpdateSettings={onUpdateSettings}
            onActivateStrategy={() => toggleStrategyInPortfolio('RANGE_REGIME_V1')}
            isActive={activeStrategiesList.includes('RANGE_REGIME_V1') || activeStrategiesList.includes('RANGE_REGIME')}
          />
        </div>
      )}

      {/* SUB-VIEW 6: ARCHIVED / DELETED STRATEGIES */}
      {activeSubTab === 'archived' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-[#30363D] pb-3">
            <div>
              <h3 className="text-sm font-bold text-gray-200 flex items-center gap-2">
                <Archive size={16} className="text-rose-400" />
                <span>Archived Strategies ({archivedStrategies.length})</span>
              </h3>
              <p className="text-xs text-gray-400 mt-0.5">
                These strategies are disabled from scanning and automated execution. You can restore them anytime.
              </p>
            </div>
            {archivedStrategies.length > 0 && (
              <button
                type="button"
                onClick={handleRestoreAllStrategies}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-emerald-300 hover:text-white bg-emerald-950/40 hover:bg-emerald-900/50 border border-emerald-500/40 transition cursor-pointer"
              >
                <Undo2 size={13} />
                <span>Restore All Defaults</span>
              </button>
            )}
          </div>

          {archivedStrategies.length === 0 ? (
            <div className="bg-[#12161E] border border-[#30363D] rounded-xl p-8 text-center text-gray-400 text-xs">
              No strategies are currently archived. All strategies are active or installed.
            </div>
          ) : (
            <div className="space-y-3">
              {archivedStrategies.map((strat) => (
                <div
                  key={strat.id}
                  className="p-4 bg-[#12161E] border border-[#30363D] rounded-xl flex items-center justify-between gap-4"
                >
                  <div>
                    <h4 className="text-xs font-bold text-gray-200">{strat.name}</h4>
                    <p className="text-[11px] text-gray-400 mt-0.5">{strat.desc}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRestoreStrategy(strat.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-emerald-300 hover:text-white bg-emerald-950/40 hover:bg-emerald-900/50 border border-emerald-500/40 transition cursor-pointer shrink-0"
                  >
                    <Undo2 size={13} />
                    <span>Restore</span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Delete / Archive Confirmation Modal */}
      {strategyToDelete && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#161B22] border border-rose-500/40 rounded-xl p-5 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-rose-500/10 border border-rose-500/30 rounded-lg text-rose-400">
                <AlertTriangle size={20} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-gray-100">Archive Strategy?</h3>
                <p className="text-xs text-gray-400 mt-0.5">{strategyToDelete.name}</p>
              </div>
            </div>
            <p className="text-xs text-gray-300 leading-relaxed">
              This strategy will be removed from your active portfolio. It will not scan coins or place automated orders. You can restore it anytime from the Archived tab.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#30363D]">
              <button
                type="button"
                onClick={() => setStrategyToDelete(null)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-400 hover:text-white bg-[#0E1117] border border-[#30363D] transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleDeleteStrategy(strategyToDelete)}
                className="px-3.5 py-1.5 rounded-lg text-xs font-bold text-white bg-rose-600 hover:bg-rose-500 transition cursor-pointer shadow-sm"
              >
                Confirm Archive
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Custom Strategy Modal */}
      {showAddCustomModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#161B22] border border-[#30363D] rounded-xl p-5 max-w-lg w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[#30363D] pb-3">
              <div className="flex items-center gap-2">
                <Plus size={18} className="text-cyan-400" />
                <h3 className="text-sm font-bold text-gray-100">Add Custom Strategy</h3>
              </div>
              <button
                onClick={() => setShowAddCustomModal(false)}
                className="text-gray-400 hover:text-gray-200"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-gray-300 block mb-1">Strategy Name</label>
                <input
                  type="text"
                  placeholder="e.g. Volume Delta Scalper"
                  value={newStratName}
                  onChange={(e) => setNewStratName(e.target.value)}
                  className="w-full bg-[#0E1117] border border-[#30363D] rounded px-3 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-300 block mb-1">Badge / Tagline</label>
                <input
                  type="text"
                  placeholder="e.g. Order Flow (1:2+ R:R)"
                  value={newStratBadge}
                  onChange={(e) => setNewStratBadge(e.target.value)}
                  className="w-full bg-[#0E1117] border border-[#30363D] rounded px-3 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-300 block mb-1">Description / Rules</label>
                <textarea
                  rows={3}
                  placeholder="Describe entry conditions, stop loss rules, and target arbitration..."
                  value={newStratDesc}
                  onChange={(e) => setNewStratDesc(e.target.value)}
                  className="w-full bg-[#0E1117] border border-[#30363D] rounded px-3 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-cyan-500 resize-none"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-300 block mb-1">Color Theme</label>
                <select
                  value={newStratColor}
                  onChange={(e) => setNewStratColor(e.target.value)}
                  className="w-full bg-[#0E1117] border border-[#30363D] rounded px-3 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-cyan-500"
                >
                  <option value="indigo">Indigo / Violet</option>
                  <option value="cyan">Cyan / Blue</option>
                  <option value="emerald">Emerald / Green</option>
                  <option value="amber">Amber / Gold</option>
                  <option value="purple">Purple / Magenta</option>
                </select>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#30363D]">
              <button
                type="button"
                onClick={() => setShowAddCustomModal(false)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-400 hover:text-white bg-[#0E1117] border border-[#30363D]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateCustomStrategy}
                disabled={!newStratName.trim()}
                className="px-3.5 py-1.5 rounded-lg text-xs font-bold text-black bg-cyan-400 hover:bg-cyan-300 disabled:opacity-50 transition cursor-pointer shadow-sm"
              >
                Add to Portfolio
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View Pine Script Modal */}
      {viewPineScriptCode && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#161B22] border border-[#30363D] rounded-xl max-w-3xl w-full max-h-[85vh] flex flex-col shadow-2xl">
            <div className="p-4 border-b border-[#30363D] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Code size={16} className="text-cyan-400" />
                <h3 className="text-sm font-bold text-gray-100">{viewPineScriptCode.title} — TradingView Pine Script v6</h3>
              </div>
              <button
                onClick={() => setViewPineScriptCode(null)}
                className="text-gray-400 hover:text-gray-200"
              >
                <X size={16} />
              </button>
            </div>
            <div className="p-4 flex-1 overflow-y-auto bg-[#0E1117]">
              <pre className="font-mono text-[11px] text-gray-300 whitespace-pre-wrap select-all leading-relaxed">
                {viewPineScriptCode.code}
              </pre>
            </div>
            <div className="p-3 border-t border-[#30363D] flex items-center justify-between bg-[#161B22]">
              <span className="text-[11px] text-gray-500 font-mono">Compatible with TradingView Webhooks & Alerts</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(viewPineScriptCode.code);
                    showNotification('Pine Script copied to clipboard!');
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-black bg-cyan-400 hover:bg-cyan-300 transition"
                >
                  <Copy size={13} />
                  <span>Copy Code</span>
                </button>
                <button
                  onClick={() => setViewPineScriptCode(null)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-400 hover:text-white bg-[#0E1117] border border-[#30363D]"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
