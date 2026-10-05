import React, { useState, useMemo, useEffect } from 'react';
import { AppSettings, StrategyBucketItem, MarketRegimeType, CoinDetail } from '../types';
import { GATES_REGISTRY, GateImportance } from '../utils/gatesRegistry';
import { DEFAULT_STRATEGY_BUCKET } from '../utils/strategyBucket';
import { StrategyChecklistPanel } from './StrategyChecklistPanel';
import { RangeStrategyConfigPanel } from './RangeStrategyConfigPanel';
import { UnifiedStrategyParams } from './UnifiedStrategyParams';
import { ShieldAlert, ShieldCheck, Zap, AlertTriangle, Flame, Info, Check, Cpu, Sparkles, RotateCcw, Layers, ArrowUpRight, Filter, Activity, Target, Compass, Trash2, RefreshCw, Plus } from 'lucide-react';

interface StrategyPanelProps {
  settings: AppSettings;
  setSettings: (s: AppSettings) => void;
  globalFilterState?: { isPausing: boolean; reason: string | null };
  coins?: CoinDetail[];
  selectedSymbol?: string;
  onSelectCoin?: (symbol: string) => void;
}

export const AVAILABLE_STRATEGIES: {
  id: 'EMA5_EXACT_ENTRY_V2' | 'VOLATILITY_COMPRESSION' | 'TREND_PULLBACK' | 'TREND_PULLBACK_RETEST' | 'SMC_LIQUIDITY_SWEEP' | 'BINANCE_COMPOSITE' | 'EARLY_COIL_BREAKOUT' | 'TWO_SIDED_COIL_BREAKOUT' | 'MACRO_RANGE_BREAKOUT' | 'EMA_GAP_PULLBACK' | 'EMA5_PA_VOLUME_V1' | 'EMA5_REJECTION_RECLAIM_V1';
  name: string;
  shortName: string;
  type: string;
  badgeBg: string;
  description: string;
  icon: any;
}[] = [
  {
    id: 'EMA5_EXACT_ENTRY_V2',
    name: 'EMA 5 Exact Price Action Entry V2',
    shortName: 'EMA 5 Exact V2',
    type: 'Exact Alert-Break Entry',
    badgeBg: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
    description: 'Exact 5m EMA 5 Alert → Break trigger with 15m structure regime, multi-timeframe level targets (15m, 1h, 1D, 1W), and fee-drag floor.',
    icon: Zap,
  },
  {
    id: 'VOLATILITY_COMPRESSION',
    name: 'Volatility Compression Breakout (VCB)',
    shortName: 'VCB Breakout',
    type: 'Breakout / Squeeze',
    badgeBg: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
    description: 'Identifies tight Bollinger Band squeeze & range compression, enforcing the 11-gate checklist on explosive volume breakouts.',
    icon: ShieldCheck,
  },
  {
    id: 'TREND_PULLBACK',
    name: 'Trend Pullback (HTF + MTF Retest)',
    shortName: 'Trend Pullback',
    type: 'Trend Following',
    badgeBg: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
    description: 'Higher-timeframe trend alignment with 5-point confirmation on EMA20/50 pullbacks, ADX momentum, and closed-candle structure.',
    icon: Target,
  },
  {
    id: 'TREND_PULLBACK_RETEST',
    name: 'Trend Pullback Retest (State Machine)',
    shortName: 'Pullback Retest',
    type: 'Trend Continuation',
    badgeBg: 'bg-sky-500/20 text-sky-300 border-sky-500/40',
    description: 'Full 5-stage state machine: trend detected → pullback → EMA retest → confirmation candle → entry. Requires ALL stages in order.',
    icon: Target,
  },
  {
    id: 'SMC_LIQUIDITY_SWEEP',
    name: 'Smart Money Liquidity Sweep (SMC)',
    shortName: 'SMC Liquidity',
    type: 'Liquidity & FVG',
    badgeBg: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
    description: 'Exploits stop hunts beyond prior swing highs/lows with Fair Value Gap (FVG) retest entries and asymmetric 1:3+ targets.',
    icon: Sparkles,
  },
  {
    id: 'BINANCE_COMPOSITE',
    name: 'Ranging 1:3 R:R Mean-Reversion',
    shortName: 'Ranging 1:3 R:R',
    type: 'Mean-Reversion',
    badgeBg: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',
    description: 'Mean-reversion at Bollinger Band extremes and RSI overbought/oversold levels within ±5% of 200-SMA in sideways markets.',
    icon: Activity,
  },
  {
    id: 'EARLY_COIL_BREAKOUT',
    name: 'Early Coil Breakout (Fractal)',
    shortName: 'Early Coil',
    type: 'Fractal Squeeze',
    badgeBg: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40',
    description: 'Fractal coil compression that triggers early at the boundary of narrowing consolidation triangles.',
    icon: Flame,
  },
  {
    id: 'TWO_SIDED_COIL_BREAKOUT',
    name: 'Two-Sided Coil Breakout',
    shortName: 'Coil Breakout',
    type: 'Squeeze Breakout',
    badgeBg: 'bg-orange-500/20 text-orange-300 border-orange-500/40',
    description: 'Symmetrical triangular compression breakout targeting 1:2+ to 1:5+ asymmetric expansion moves.',
    icon: Layers,
  },
  {
    id: 'MACRO_RANGE_BREAKOUT',
    name: 'Macro Range Breakout',
    shortName: 'Macro Breakout',
    type: 'Range Expansion',
    badgeBg: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40',
    description: 'Multi-day range boundary expansion breakout on institutional volume surge.',
    icon: Compass,
  },
  {
    id: 'EMA_GAP_PULLBACK',
    name: '5 EMA Gap Pullback (Impulse)',
    shortName: '5 EMA Gap',
    type: 'Gap Continuation',
    badgeBg: 'bg-teal-500/20 text-teal-300 border-teal-500/40',
    description: 'Trend continuation impulse when price gaps cleanly away from 5 EMA with confirmed 1h alignment.',
    icon: Zap,
  },
  {
    id: 'EMA5_PA_VOLUME_V1',
    name: 'EMA 5 PA Gap + Volume (Momentum)',
    shortName: 'EMA 5 PA Vol',
    type: 'Pure Price Action',
    badgeBg: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
    description: 'Pure price action gap and volume momentum on 5m EMA 5 with 15m structure alignment.',
    icon: Flame,
  },
  {
    id: 'EMA5_REJECTION_RECLAIM_V1',
    name: 'EMA 5 Rejection → Reclaim (Displacement)',
    shortName: 'EMA 5 Rejection',
    type: 'Trap Reversal',
    badgeBg: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
    description: 'Captures false breakout traps: wick rejection beyond 5 EMA followed by impulsive reclaim displacement.',
    icon: RotateCcw,
  },
];

const StrategyPanel: React.FC<StrategyPanelProps> = ({ 
  settings, 
  setSettings, 
  globalFilterState,
  coins = [],
  selectedSymbol,
  onSelectCoin
}) => {
  const [expandedGateId, setExpandedGateId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'checklist' | 'parameters' | 'gates' | 'bucket'>('checklist');
  const [activeChecklistSymbol, setActiveChecklistSymbol] = useState<string>(selectedSymbol || coins[0]?.symbol || 'BTCUSDT');
  const [selectedChecklistStrategyId, setSelectedChecklistStrategyId] = useState<string>(
    settings.activeStrategy || 'EMA5_EXACT_ENTRY_V2'
  );

  useEffect(() => {
    if (selectedSymbol) {
      setActiveChecklistSymbol(selectedSymbol);
    }
  }, [selectedSymbol]);

  useEffect(() => {
    if (settings.activeStrategy) {
      setSelectedChecklistStrategyId(settings.activeStrategy);
    }
  }, [settings.activeStrategy]);

  const activeCoin = coins.find(c => c.symbol === activeChecklistSymbol) || coins[0];

  const selectedCoinVcbChecklist = useMemo(() => {
    if (!activeCoin) return null;
    const minScoreRequired = settings.vcbChecklistMinScore ?? 8;
    const inds = activeCoin.indicators;
    const gates = activeCoin.gates;

    const htfPass = inds ? (inds.emaFast > inds.emaSlow || inds.superTrend?.direction === 'uptrend') : true;
    const locPass = gates ? Boolean(gates.g1) : true;
    const compPass = activeCoin.status === 'ARMED' || activeCoin.status === 'RANGING' || (gates ? Boolean(gates.g2) : false);
    const volPass = inds ? (inds.volumeRatio >= (settings.vcbBreakoutVolumeMin ?? 1.25)) : false;
    const retestPass = activeCoin.score >= (settings.autoTradeThreshold ?? 60);
    const rrPass = gates ? Boolean(gates.g4 !== false) : true;
    const sessionPass = !globalFilterState?.isPausing;

    const items = [
      {
        id: 'htf_bias',
        name: 'Higher-timeframe bias & liquidity draw',
        points: htfPass ? 1 : 0,
        maxPoints: 1,
        passed: htfPass,
        detail: htfPass ? 'EMA 20/50 and HTF trend aligned with bias' : 'HTF structure not cleanly aligned',
      },
      {
        id: 'location',
        name: 'Location: discount/premium & key level',
        points: locPass ? 2 : 0,
        maxPoints: 2,
        passed: locPass,
        detail: gates?.g1Reason || (locPass ? 'Price positioned at structural boundary' : 'Price adrift in middle of range'),
      },
      {
        id: 'compression',
        name: 'Volatility compression (VCB / Coil)',
        points: compPass ? 2 : 0,
        maxPoints: 2,
        passed: compPass,
        detail: gates?.g2Reason || (compPass ? 'Tight compression / coil identified within ATR limits' : 'Volatility wide / no contraction detected'),
      },
      {
        id: 'breakout_impulse',
        name: 'Impulse breakout expansion',
        points: volPass ? 2 : 0,
        maxPoints: 2,
        passed: volPass,
        detail: inds ? `Volume ratio: ${inds.volumeRatio.toFixed(2)}x (min ${(settings.vcbBreakoutVolumeMin ?? 1.25).toFixed(2)}x)` : 'Volume expansion pending',
      },
      {
        id: 'retest_confirmation',
        name: 'Retest / Trigger confirmation',
        points: retestPass ? 2 : 0,
        maxPoints: 2,
        passed: retestPass,
        detail: `Composite setup score: ${activeCoin.score}/100 (threshold: ${settings.autoTradeThreshold ?? 60})`,
      },
      {
        id: 'risk_reward',
        name: 'Risk & R:R defined (≥5.0R for Coil)',
        points: rrPass ? 2 : 0,
        maxPoints: 2,
        passed: rrPass,
        detail: rrPass ? 'Target structure qualifies ≥3.0R (or ≥5.0R coil target)' : 'Target structure below threshold',
      },
      {
        id: 'session_macro',
        name: 'Session & macro market filter',
        points: 0,
        maxPoints: 0,
        passed: sessionPass,
        isMandatoryGate: true,
        detail: sessionPass ? 'Global market macro regime tradable' : (globalFilterState?.reason || 'Macro filter lockout active'),
      },
    ];

    const score = items.reduce((sum, it) => sum + it.points, 0);
    const passed = score >= minScoreRequired && sessionPass;
    const recommendation: 'EXECUTE' | 'WAIT' | 'SKIP' = passed ? 'EXECUTE' : score >= 6 ? 'WAIT' : 'SKIP';
    const failedGates = items.filter(i => !i.passed).map(i => i.name);
    const summary = `${score} / 11 pts – ${passed ? 'Setup fully qualified for breakout execution' : score >= 6 ? 'Setup developing; wait for volume surge or boundary retest' : 'Insufficient compression score; setup skipped'}`;

    return {
      symbol: activeCoin.symbol,
      score,
      maxScore: 11,
      passed,
      gatePassed: sessionPass,
      failedGates,
      summary,
      recommendation,
      items
    };
  }, [activeCoin, settings, globalFilterState]);

  const [strategyToDelete, setStrategyToDelete] = useState<string | null>(null);
  const [showRestoreModal, setShowRestoreModal] = useState<boolean>(false);

  const deletedStrategies: string[] = settings.deletedStrategies || [];

  const bucket: StrategyBucketItem[] = (settings.strategyBucket && settings.strategyBucket.length > 0)
    ? settings.strategyBucket
    : DEFAULT_STRATEGY_BUCKET;

  const visibleStrategies = useMemo(() => {
    return AVAILABLE_STRATEGIES.filter(s => !deletedStrategies.includes(s.id));
  }, [deletedStrategies]);

  const visibleBucket = useMemo(() => {
    return bucket.filter(item => !deletedStrategies.includes(item.id));
  }, [bucket, deletedStrategies]);

  const enabledStrategies: string[] = (settings.enabledStrategies && settings.enabledStrategies.length > 0)
    ? settings.enabledStrategies.filter(s => !deletedStrategies.includes(s))
    : [settings.activeStrategy && !deletedStrategies.includes(settings.activeStrategy) ? settings.activeStrategy : (visibleStrategies[0]?.id || 'VOLATILITY_COMPRESSION')];

  const handleInputChange = (field: keyof AppSettings, value: any) => {
    const nextSettings = { ...settings, [field]: value };
    if (field === 'activeStrategy') {
      if (value === 'TREND_PULLBACK_RETEST') {
        nextSettings.tprEnabled = true;
      }
      if (value === 'EMA5_EXACT_ENTRY_V2') {
        nextSettings.eev2Enabled = true;
      }
    }
    setSettings(nextSettings);

    // Direct immediate dispatch to backend 24/7 engine
    fetch('/api/bot/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(nextSettings)
    }).then(() => {
      setSaveStatus(field === 'activeStrategy' ? `Strategy set to ${value}` : 'Settings updated');
      setTimeout(() => setSaveStatus(null), 2500);
    }).catch(console.error);
  };

  const handleToggleStrategy = (stratId: any) => {
    let nextEnabled: any[];
    if (enabledStrategies.includes(stratId)) {
      nextEnabled = enabledStrategies.filter(s => s !== stratId);
    } else {
      nextEnabled = [...enabledStrategies, stratId];
    }
    const nextSettings = {
      ...settings,
      enabledStrategies: nextEnabled,
      activeStrategy: (nextEnabled[0] || visibleStrategies[0]?.id || 'EMA5_EXACT_ENTRY_V2') as any,
      eev2Enabled: nextEnabled.includes('EMA5_EXACT_ENTRY_V2'),
      tprEnabled: nextEnabled.includes('TREND_PULLBACK_RETEST'),
    };
    setSettings(nextSettings);
    fetch('/api/bot/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(nextSettings)
    }).catch(console.error);
    setSaveStatus(`Active strategies updated (${nextEnabled.length} active)`);
    setTimeout(() => setSaveStatus(null), 2500);
  };

  const handleConfirmDelete = (stratId: string) => {
    const nextDeleted = Array.from(new Set([...deletedStrategies, stratId]));
    const nextEnabled = enabledStrategies.filter(id => id !== stratId);
    const nextBucket = bucket.filter(item => item.id !== stratId);
    const remaining = visibleStrategies.filter(s => s.id !== stratId);
    const nextActive = (settings.activeStrategy === stratId
      ? (nextEnabled[0] || remaining[0]?.id || 'EMA5_EXACT_ENTRY_V2')
      : settings.activeStrategy) as any;

    const nextSettings: AppSettings = {
      ...settings,
      deletedStrategies: nextDeleted,
      enabledStrategies: nextEnabled,
      strategyBucket: nextBucket,
      activeStrategy: nextActive,
      eev2Enabled: nextEnabled.includes('EMA5_EXACT_ENTRY_V2'),
      tprEnabled: nextEnabled.includes('TREND_PULLBACK_RETEST'),
    };

    setSettings(nextSettings);
    fetch('/api/bot/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(nextSettings)
    }).catch(console.error);

    setSaveStatus(`Strategy removed from engine`);
    setStrategyToDelete(null);
    setTimeout(() => setSaveStatus(null), 3000);
  };

  const handleRestoreStrategy = (stratId: string) => {
    const nextDeleted = deletedStrategies.filter(id => id !== stratId);
    const defaultItem = DEFAULT_STRATEGY_BUCKET.find(b => b.id === stratId);
    const nextBucket = bucket.some(b => b.id === stratId)
      ? bucket
      : defaultItem
        ? [...bucket, defaultItem]
        : bucket;

    const nextSettings: AppSettings = {
      ...settings,
      deletedStrategies: nextDeleted,
      strategyBucket: nextBucket,
    };

    setSettings(nextSettings);
    fetch('/api/bot/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(nextSettings)
    }).catch(console.error);

    setSaveStatus(`Restored strategy`);
    setTimeout(() => setSaveStatus(null), 2500);
  };

  const handleRestoreAllStrategies = () => {
    const nextSettings: AppSettings = {
      ...settings,
      deletedStrategies: [],
      strategyBucket: DEFAULT_STRATEGY_BUCKET,
    };

    setSettings(nextSettings);
    fetch('/api/bot/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(nextSettings)
    }).catch(console.error);

    setSaveStatus(`All strategies restored to default`);
    setShowRestoreModal(false);
    setTimeout(() => setSaveStatus(null), 2500);
  };

  const handleSetPresets = (preset: 'ALL' | 'VCB' | 'TREND' | 'REVERSAL' | 'CLEAR') => {
    let nextEnabled: any[] = [];
    if (preset === 'ALL') {
      nextEnabled = visibleStrategies.map(s => s.id);
    } else if (preset === 'VCB') {
      nextEnabled = ['VOLATILITY_COMPRESSION'].filter(s => !deletedStrategies.includes(s));
    } else if (preset === 'TREND') {
      nextEnabled = ['EMA5_EXACT_ENTRY_V2', 'VOLATILITY_COMPRESSION', 'TREND_PULLBACK', 'TREND_PULLBACK_RETEST', 'EARLY_COIL_BREAKOUT'].filter(s => !deletedStrategies.includes(s));
    } else if (preset === 'REVERSAL') {
      nextEnabled = ['BINANCE_COMPOSITE', 'SMC_LIQUIDITY_SWEEP'].filter(s => !deletedStrategies.includes(s));
    } else if (preset === 'CLEAR') {
      nextEnabled = [];
    }
    const nextSettings = {
      ...settings,
      enabledStrategies: nextEnabled,
      activeStrategy: (nextEnabled[0] || visibleStrategies[0]?.id || 'EMA5_EXACT_ENTRY_V2') as any,
      eev2Enabled: nextEnabled.includes('EMA5_EXACT_ENTRY_V2'),
      tprEnabled: nextEnabled.includes('TREND_PULLBACK_RETEST'),
    };
    setSettings(nextSettings);
    fetch('/api/bot/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(nextSettings)
    }).catch(console.error);
    setSaveStatus(`Applied preset (${nextEnabled.length} active)`);
    setTimeout(() => setSaveStatus(null), 2500);
  };

  const handleUpdateBucket = (newBucket: StrategyBucketItem[]) => {
    handleInputChange('strategyBucket', newBucket);
  };

  const handleToggleBucketStrategy = (id: string) => {
    const updated = bucket.map(item => item.id === id ? { ...item, enabled: !item.enabled } : item);
    handleUpdateBucket(updated);
  };

  const handleChangePriority = (id: string, priority: number) => {
    const updated = bucket.map(item => item.id === id ? { ...item, priority } : item);
    handleUpdateBucket(updated);
  };

  const handleResetBucket = () => {
    handleUpdateBucket(DEFAULT_STRATEGY_BUCKET.filter(b => !deletedStrategies.includes(b.id)));
    setSaveStatus('Strategy bucket reset to defaults');
    setTimeout(() => setSaveStatus(null), 2500);
  };

  const handleToggleGate = (gateId: string) => {
    const currentDisabled = { ...(settings.disabledGates || {}) };
    if (currentDisabled[gateId]) {
      delete currentDisabled[gateId];
    } else {
      currentDisabled[gateId] = true;
    }
    const nextSettings = {
      ...settings,
      disabledGates: currentDisabled,
    };
    setSettings(nextSettings);
    fetch('/api/bot/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(nextSettings)
    }).catch(console.error);
  };

  const strategyGates = GATES_REGISTRY.filter(
    (g) => enabledStrategies.includes(g.strategy as any) || g.strategy === 'RISK_ENGINE'
  );

  const getImportanceBadge = (importance: GateImportance, score: number) => {
    switch (importance) {
      case 'CRITICAL':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-500/20 text-rose-400 border border-rose-500/40 text-[10px] font-bold uppercase tracking-wider">
            <Flame className="w-3 h-3 text-rose-400" /> CRITICAL ({score}%)
          </span>
        );
      case 'HIGH':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/40 text-[10px] font-bold uppercase tracking-wider">
            <AlertTriangle className="w-3 h-3 text-amber-400" /> HIGH ({score}%)
          </span>
        );
      case 'MEDIUM':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-400 border border-cyan-500/40 text-[10px] font-bold uppercase tracking-wider">
            <Info className="w-3 h-3 text-cyan-400" /> MEDIUM ({score}%)
          </span>
        );
      case 'LOW':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-gray-700/50 text-gray-300 border border-gray-600 text-[10px] font-semibold uppercase tracking-wider">
            OPTIONAL ({score}%)
          </span>
        );
    }
  };

  const InputRow = ({ label, desc, value, onChange, type = "number", min, max, step }: any) => (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between py-3 border-b border-gray-800/50 gap-4">
      <div className="flex flex-col">
        <span className="text-sm font-medium text-gray-200">{label}</span>
        {desc && <span className="text-xs text-gray-500 mt-1">{desc}</span>}
      </div>
      <input
        type={type}
        value={value}
        onChange={e => onChange(type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value)}
        className="w-full sm:w-24 bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-sm text-right text-gray-200 focus:outline-none focus:border-[#00e696]"
        min={min} max={max} step={step}
      />
    </div>
  );

  return (
    <div className="h-full overflow-y-auto custom-scrollbar p-3.5 sm:p-6 space-y-6 sm:space-y-8 pb-32 font-mono text-xs">
      <div className="max-w-4xl mx-auto space-y-6 sm:space-y-8">
        
        {/* Global Market & BTC Safety Filter Warning Banner */}
        {settings.useGlobalBtcFilter !== false && globalFilterState?.isPausing && (
          <div className="rounded-xl p-4 border bg-amber-950/40 border-amber-500/50 shadow-xl flex items-start gap-3.5">
            <div className="p-2.5 rounded-lg shrink-0 bg-amber-500/20 text-amber-400 border border-amber-500/30">
              <AlertTriangle className="w-6 h-6 text-amber-400 animate-pulse" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-bold text-amber-300">
                  Global Market & BTC Safety Filter Active
                </h3>
                <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-bold tracking-wider uppercase">
                  Macro Risk Management Active
                </span>
              </div>
              <p className="text-xs text-amber-200/90 mt-1 leading-relaxed">
                Macro risk management to pause trading during extreme market distress. This pauses new trade entries across all coins.
              </p>
              {globalFilterState.reason && (
                <p className="text-[11px] font-mono text-amber-300/80 mt-1.5 bg-black/30 px-2.5 py-1 rounded border border-amber-500/20">
                  {globalFilterState.reason}
                </p>
              )}
              <p className="text-[10.5px] text-gray-400 mt-1">
                Existing open positions remain actively monitored by the risk engine with trailing stops and take-profits.
              </p>
            </div>
          </div>
        )}

        {/* CoinDCX Regime Auto-Pilot Callout */}
        {settings.autoActivateRegimeStrategies && (
          <div className="rounded-xl p-3.5 border bg-emerald-950/25 border-emerald-500/40 shadow-md flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                <Compass className="w-5 h-5 text-emerald-400 animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-xs font-bold text-emerald-300 uppercase tracking-wide">CoinDCX Regime Auto-Pilot Active</h4>
                  <span className="text-[10px] px-1.5 py-0.2 rounded font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                    {settings.coindcxActiveRegime?.replace('_', ' ') || 'CALIBRATING'}
                  </span>
                </div>
                <p className="text-[11px] text-gray-400 mt-0.5 font-sans">
                  The trading bot automatically adapts active strategies to match the multi-timeframe regime of {settings.coindcxRegimeSymbol || 'BTCUSDT'}.
                </p>
              </div>
            </div>
            <span className="text-[11px] text-emerald-400 font-bold bg-[#161B22] px-2.5 py-1 rounded border border-emerald-500/30 hidden sm:inline">
              1–2 Core Setups Coordinated
            </span>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-[#30363D] pb-3 gap-2.5">
          <div className="flex items-center gap-2 overflow-x-auto pb-1 max-w-full no-scrollbar touch-pan-x shrink-0">
            <button
              onClick={() => setActiveTab('checklist')}
              className={`px-3.5 py-2 sm:py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 whitespace-nowrap ${
                activeTab === 'checklist' 
                  ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/30' 
                  : 'bg-[#161B22] text-gray-400 hover:text-white border border-[#30363D]'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> Strategy Checklist & Live Audit
            </button>
            <button
              onClick={() => setActiveTab('parameters')}
              className={`px-3.5 py-2 sm:py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 whitespace-nowrap ${
                activeTab === 'parameters' 
                  ? 'bg-[#00e696] text-black font-semibold' 
                  : 'bg-[#161B22] text-gray-400 hover:text-white border border-[#30363D]'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" /> Strategy Parameters
            </button>
            <button
              onClick={() => setActiveTab('gates')}
              className={`px-3.5 py-2 sm:py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 whitespace-nowrap ${
                activeTab === 'gates' 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-[#161B22] text-gray-400 hover:text-white border border-[#30363D]'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" /> Gate Management ({strategyGates.length})
            </button>
            <button
              onClick={() => setActiveTab('bucket')}
              className={`px-3.5 py-2 sm:py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 whitespace-nowrap ${
                activeTab === 'bucket' 
                  ? 'bg-purple-600 text-white shadow-lg shadow-purple-900/30' 
                  : 'bg-[#161B22] text-gray-400 hover:text-white border border-[#30363D]'
              }`}
            >
              <Layers className="w-3.5 h-3.5" /> Strategy Registry
            </button>
          </div>
          {saveStatus && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#00e696]/20 border border-[#00e696]/40 text-[#00e696] text-xs font-semibold animate-pulse">
              <Check className="w-3.5 h-3.5" /> {saveStatus}
            </span>
          )}
        </div>

        {/* TAB 0: STRATEGY CHECKLIST & LIVE AUDIT (ALL STRATEGIES) */}
        {activeTab === 'checklist' && (
          <StrategyChecklistPanel 
            settings={settings} 
            onUpdateSetting={handleInputChange}
            selectedStrategyId={selectedChecklistStrategyId}
            onSelectStrategy={setSelectedChecklistStrategyId}
            coins={coins}
            selectedSymbol={activeChecklistSymbol}
            onSelectSymbol={(sym) => {
              setActiveChecklistSymbol(sym);
              if (onSelectCoin) onSelectCoin(sym);
            }}
            globalFilterState={globalFilterState}
          />
        )}

        {/* TAB 1: STRATEGY REGISTRY & ACTIVATION */}
        {activeTab === 'bucket' && (
          <div className="space-y-6">
            
            {/* Active Multi-Strategy Overview Banner */}
            <div className="rounded-xl p-5 border bg-emerald-950/20 border-emerald-500/40 shadow-xl">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-start gap-3.5">
                  <div className="p-2.5 rounded-lg shrink-0 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    <ShieldCheck className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-base font-bold text-white">
                        Active Strategies: {enabledStrategies.length} / {visibleStrategies.length} Selected
                      </h3>
                      <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold tracking-wider">
                        MULTI-STRATEGY ENGINE
                      </span>
                    </div>
                    <p className="text-xs text-gray-300 mt-1 leading-relaxed max-w-2xl">
                      The bot scans pairs across all enabled strategies simultaneously. When multiple strategies generate a signal on the same candle, the engine executes the highest-confidence setup.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-center">
                  <button
                    onClick={() => {
                      setSelectedChecklistStrategyId(settings.activeStrategy || 'EMA5_EXACT_ENTRY_V2');
                      setActiveTab('checklist');
                    }}
                    className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs cursor-pointer transition-colors flex items-center gap-1.5 shadow-lg shadow-emerald-900/40"
                  >
                    <ShieldCheck className="w-3.5 h-3.5" /> OPEN STRATEGY CHECKLIST & LIVE AUDIT
                  </button>
                </div>
              </div>
            </div>

            {/* Multi-Strategy Activation Grid */}
            <div className="bg-[#161B22] rounded-xl p-5 border border-[#30363D] space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-[#00e696]" />
                    <h4 className="text-sm font-bold text-white">Selective Strategy Selection</h4>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      enabledStrategies.length > 0
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                    }`}>
                      {enabledStrategies.length} Active
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">
                    Toggle individual strategies on or off. Delete unwanted strategies directly or restore anytime.
                  </p>
                </div>

                {/* Preset Actions */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setShowRestoreModal(true)}
                    className="px-2.5 py-1 text-[11px] rounded bg-emerald-950/60 hover:bg-emerald-900/80 text-emerald-300 border border-emerald-700/50 cursor-pointer font-semibold transition-colors flex items-center gap-1"
                    title="Add or restore strategies"
                  >
                    <Plus className="w-3 h-3 text-emerald-400" />
                    {deletedStrategies.length > 0 ? `Add / Restore (${deletedStrategies.length})` : 'Add / Restore Strategy'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetPresets('ALL')}
                    className="px-2.5 py-1 text-[11px] rounded bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-700 cursor-pointer font-semibold transition-colors"
                  >
                    All
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetPresets('VCB')}
                    className="px-2.5 py-1 text-[11px] rounded bg-gray-800 hover:bg-gray-700 text-emerald-300 border border-gray-700 cursor-pointer font-semibold transition-colors"
                  >
                    VCB Only
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetPresets('TREND')}
                    className="px-2.5 py-1 text-[11px] rounded bg-gray-800 hover:bg-gray-700 text-blue-300 border border-gray-700 cursor-pointer font-semibold transition-colors"
                  >
                    Trend Following
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetPresets('REVERSAL')}
                    className="px-2.5 py-1 text-[11px] rounded bg-gray-800 hover:bg-gray-700 text-amber-300 border border-gray-700 cursor-pointer font-semibold transition-colors"
                  >
                    Mean Reversion
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetPresets('CLEAR')}
                    className="px-2.5 py-1 text-[11px] rounded bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-800/40 cursor-pointer font-semibold transition-colors"
                  >
                    Clear All
                  </button>
                </div>
              </div>

              {/* Strategy Cards Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pt-1">
                {visibleStrategies.map(strat => {
                  const isActive = enabledStrategies.includes(strat.id);
                  const Icon = strat.icon;
                  return (
                    <div
                      key={strat.id}
                      onClick={() => handleToggleStrategy(strat.id)}
                      className={`p-3.5 rounded-xl border transition-all cursor-pointer flex flex-col justify-between select-none relative group ${
                        isActive
                          ? 'bg-gray-900/90 border-[#00e696] shadow-md shadow-emerald-950/20'
                          : 'bg-gray-950/50 border-gray-800/80 hover:border-gray-700 opacity-60'
                      }`}
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="flex items-center gap-2">
                            <div className={`p-1.5 rounded-lg shrink-0 ${
                              isActive ? 'bg-[#00e696]/20 text-[#00e696]' : 'bg-gray-800 text-gray-500'
                            }`}>
                              <Icon className="w-4 h-4" />
                            </div>
                            <span className="font-bold text-xs text-white leading-tight">
                              {strat.shortName}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              title={`Delete ${strat.shortName}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                setStrategyToDelete(strat.id);
                              }}
                              className="p-1 rounded text-gray-500 hover:text-rose-400 hover:bg-rose-950/50 transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                            <div className={`w-4 h-4 rounded flex items-center justify-center border transition-colors ${
                              isActive ? 'bg-[#00e696] border-[#00e696] text-black' : 'border-gray-600 bg-gray-800'
                            }`}>
                              {isActive && <Check className="w-3 h-3 stroke-[3]" />}
                            </div>
                          </div>
                        </div>

                        <div className="mb-2">
                          <span className={`inline-block px-1.5 py-0.5 rounded text-[9.5px] font-bold border ${strat.badgeBg}`}>
                            {strat.type}
                          </span>
                        </div>

                        <p className="text-[11px] text-gray-400 leading-snug line-clamp-2">
                          {strat.description}
                        </p>
                      </div>

                      <div className="mt-3 pt-2 border-t border-gray-800/80 flex items-center justify-between text-[10px]">
                        <span className={isActive ? 'text-[#00e696] font-semibold' : 'text-gray-500'}>
                          {isActive ? '● Active in Engine' : '○ Disabled'}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedChecklistStrategyId(strat.id);
                            setActiveTab('checklist');
                          }}
                          className="text-emerald-400 hover:text-emerald-300 font-semibold flex items-center gap-1 cursor-pointer bg-emerald-950/40 hover:bg-emerald-900/60 px-2 py-0.5 rounded border border-emerald-500/30 transition-colors"
                          title={`Open ${strat.shortName} Checklist & Live Audit`}
                        >
                          <ShieldCheck className="w-3 h-3" /> Audit Checklist
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Strategy Priority & Execution Tuning */}
            <div className="bg-[#161B22] rounded-xl p-5 border border-[#30363D] space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-white">Execution Priority Tuning</h4>
                  <p className="text-xs text-gray-400">Configure tie-breaker execution priority (P1 highest, P4 lowest) when multiple strategies trigger simultaneously.</p>
                </div>
                <button
                  onClick={handleResetBucket}
                  className="text-xs text-gray-400 hover:text-white flex items-center gap-1 px-2.5 py-1 rounded bg-gray-800 border border-gray-700 cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" /> Reset Defaults
                </button>
              </div>

              <div className="space-y-3">
                {visibleBucket.map(strat => {
                  const isActive = enabledStrategies.includes(strat.id as any);
                  return (
                    <div
                      key={strat.id}
                      className={`rounded-xl p-4 border transition-all ${
                        isActive
                          ? 'bg-[#161B22] border-[#30363D] hover:border-gray-600'
                          : 'bg-gray-900/40 border-gray-800/60 opacity-60'
                      }`}
                    >
                      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                        {/* Left: Checkbox + Name + Description */}
                        <div className="flex items-start gap-3">
                          <input
                            type="checkbox"
                            checked={isActive}
                            onChange={() => handleToggleStrategy(strat.id)}
                            className="mt-1 w-4 h-4 rounded text-purple-600 bg-gray-900 border-gray-700 focus:ring-purple-500 cursor-pointer"
                            id={`bucket-check-${strat.id}`}
                          />
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <label
                                htmlFor={`bucket-check-${strat.id}`}
                                className={`text-sm font-bold cursor-pointer ${isActive ? 'text-white' : 'text-gray-400 line-through'}`}
                              >
                                {strat.name}
                              </label>
                              {isActive ? (
                                <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold">
                                  ACTIVE
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20 text-[10px]">
                                  PAUSED
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-gray-400 leading-relaxed max-w-xl">
                              {strat.description}
                            </p>
                          </div>
                        </div>

                        {/* Right: Priority Selector + Quick Toggle + Delete */}
                        <div className="flex flex-wrap items-center gap-3 self-start lg:self-center pl-7 lg:pl-0">
                          <div className="flex items-center gap-1.5 bg-gray-900 border border-gray-800 rounded-lg px-2.5 py-1">
                            <span className="text-[10px] text-gray-400 font-semibold uppercase">Tie-Breaker:</span>
                            <select
                              value={strat.priority}
                              onChange={e => handleChangePriority(strat.id, parseInt(e.target.value) || 1)}
                              className="bg-transparent text-white text-xs font-bold focus:outline-none cursor-pointer"
                            >
                              <option value={1} className="bg-gray-900 text-white">#1 (Highest)</option>
                              <option value={2} className="bg-gray-900 text-white">#2 (High)</option>
                              <option value={3} className="bg-gray-900 text-white">#3 (Medium)</option>
                              <option value={4} className="bg-gray-900 text-white">#4 (Fallback)</option>
                            </select>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleToggleStrategy(strat.id)}
                            className={`px-2.5 py-1 rounded text-[10px] font-semibold border transition-all cursor-pointer ${
                              isActive
                                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                                : 'bg-gray-800/80 hover:bg-gray-700 text-gray-300 border-gray-700'
                            }`}
                          >
                            {isActive ? 'Enabled' : 'Disabled'}
                          </button>

                          <button
                            type="button"
                            title="Delete Strategy"
                            onClick={(e) => {
                              e.stopPropagation();
                              setStrategyToDelete(strat.id);
                            }}
                            className="p-1.5 rounded text-gray-500 hover:text-rose-400 hover:bg-rose-950/40 border border-transparent hover:border-rose-900/50 transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

          </div>
        )}

        {/* TAB 2: INDICATOR & STRATEGY PARAMETERS */}
        {activeTab === 'parameters' && (
          <div className="space-y-6">
            
            {/* Multi-Strategy Activation Grid */}
            <div className="bg-[#161B22] rounded-xl p-5 border border-[#30363D] space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-[#00e696]" />
                    <h4 className="text-sm font-bold text-white">Active Selective Strategies</h4>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      enabledStrategies.length > 0
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                    }`}>
                      {enabledStrategies.length} / {visibleStrategies.length} Active
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">
                    Activate any combination of strategies. Delete unwanted strategies directly or restore anytime.
                  </p>
                </div>

                {/* Preset Actions */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setShowRestoreModal(true)}
                    className="px-2.5 py-1 text-[11px] rounded bg-emerald-950/60 hover:bg-emerald-900/80 text-emerald-300 border border-emerald-700/50 cursor-pointer font-semibold transition-colors flex items-center gap-1"
                    title="Add or restore strategies"
                  >
                    <Plus className="w-3 h-3 text-emerald-400" />
                    {deletedStrategies.length > 0 ? `Add / Restore (${deletedStrategies.length})` : 'Add / Restore Strategy'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetPresets('ALL')}
                    className="px-2.5 py-1 text-[11px] rounded bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-700 cursor-pointer font-semibold transition-colors"
                  >
                    All
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetPresets('VCB')}
                    className="px-2.5 py-1 text-[11px] rounded bg-gray-800 hover:bg-gray-700 text-emerald-300 border border-gray-700 cursor-pointer font-semibold transition-colors"
                  >
                    VCB Only
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetPresets('TREND')}
                    className="px-2.5 py-1 text-[11px] rounded bg-gray-800 hover:bg-gray-700 text-blue-300 border border-gray-700 cursor-pointer font-semibold transition-colors"
                  >
                    Trend Following
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetPresets('REVERSAL')}
                    className="px-2.5 py-1 text-[11px] rounded bg-gray-800 hover:bg-gray-700 text-amber-300 border border-gray-700 cursor-pointer font-semibold transition-colors"
                  >
                    Mean Reversion
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetPresets('CLEAR')}
                    className="px-2.5 py-1 text-[11px] rounded bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-800/40 cursor-pointer font-semibold transition-colors"
                  >
                    Clear All
                  </button>
                </div>
              </div>

              {/* Strategy Cards Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pt-1">
                {visibleStrategies.map(strat => {
                  const isActive = enabledStrategies.includes(strat.id);
                  const Icon = strat.icon;
                  return (
                    <div
                      key={strat.id}
                      onClick={() => handleToggleStrategy(strat.id)}
                      className={`p-3.5 rounded-xl border transition-all cursor-pointer flex flex-col justify-between select-none relative group ${
                        isActive
                          ? 'bg-gray-900/90 border-[#00e696] shadow-md shadow-emerald-950/20'
                          : 'bg-gray-950/50 border-gray-800/80 hover:border-gray-700 opacity-60'
                      }`}
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="flex items-center gap-2">
                            <div className={`p-1.5 rounded-lg shrink-0 ${
                              isActive ? 'bg-[#00e696]/20 text-[#00e696]' : 'bg-gray-800 text-gray-500'
                            }`}>
                              <Icon className="w-4 h-4" />
                            </div>
                            <span className="font-bold text-xs text-white leading-tight">
                              {strat.shortName}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              title={`Delete ${strat.shortName}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                setStrategyToDelete(strat.id);
                              }}
                              className="p-1 rounded text-gray-500 hover:text-rose-400 hover:bg-rose-950/50 transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                            <div className={`w-4 h-4 rounded flex items-center justify-center border transition-colors ${
                              isActive ? 'bg-[#00e696] border-[#00e696] text-black' : 'border-gray-600 bg-gray-800'
                            }`}>
                              {isActive && <Check className="w-3 h-3 stroke-[3]" />}
                            </div>
                          </div>
                        </div>

                        <div className="mb-2">
                          <span className={`inline-block px-1.5 py-0.5 rounded text-[9.5px] font-bold border ${strat.badgeBg}`}>
                            {strat.type}
                          </span>
                        </div>

                        <p className="text-[11px] text-gray-400 leading-snug line-clamp-2">
                          {strat.description}
                        </p>
                      </div>

                      <div className="mt-3 pt-2 border-t border-gray-800/80 flex items-center justify-between text-[10px]">
                        <span className={isActive ? 'text-[#00e696] font-semibold' : 'text-gray-500'}>
                          {isActive ? '● Active in Engine' : '○ Disabled'}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedChecklistStrategyId(strat.id);
                            setActiveTab('checklist');
                          }}
                          className="text-emerald-400 hover:text-emerald-300 font-semibold flex items-center gap-1 cursor-pointer bg-emerald-950/40 hover:bg-emerald-900/60 px-2 py-0.5 rounded border border-emerald-500/30 transition-colors"
                          title={`Open ${strat.shortName} Checklist & Live Audit`}
                        >
                          <ShieldCheck className="w-3 h-3" /> Audit Checklist
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Canonical Unified Strategy Parameters */}
            <UnifiedStrategyParams
              settings={settings}
              onUpdateSetting={handleInputChange}
              onSaveDirect={(partial) => {
                fetch('/api/bot/settings', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ ...settings, ...partial })
                }).catch(console.error);
              }}
              sourceContext="strategy"
            />

            {/* Global Market & BTC Safety Filter */}
            <div className="bg-[#161B22] rounded-xl p-6 border border-[#30363D] space-y-4">
              <div>
                <h3 className="text-base font-bold text-white">Global Market & BTC Safety Filter</h3>
                <p className="text-xs text-gray-400 mt-0.5">Macro risk management to pause trading during extreme market distress.</p>
              </div>
              <div className="space-y-3">
                <label className="flex items-center gap-2.5 text-xs text-gray-200 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={settings.useGlobalBtcFilter !== false}
                    onChange={(e) => handleInputChange('useGlobalBtcFilter', e.target.checked)}
                    className="w-4 h-4 rounded bg-gray-800 border-gray-700 text-blue-500 focus:ring-0 cursor-pointer"
                  />
                  <span>Enforce BTC Global Safety Filter (pauses new entries during high-risk macro volatility)</span>
                </label>
                <div className="flex items-center gap-3 pt-1">
                  <span className="text-xs text-gray-400">Reference Benchmark:</span>
                  <select
                    value={settings.globalFilterSymbol || 'BTCUSDT'}
                    onChange={(e) => handleInputChange('globalFilterSymbol', e.target.value)}
                    disabled={settings.useGlobalBtcFilter === false}
                    className="bg-gray-800 border border-gray-700 text-white text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-blue-500 cursor-pointer disabled:opacity-50"
                  >
                    <option value="BTCUSDT">BTC Only (BTCUSDT)</option>
                    <option value="BTC_ETH">BTC + ETH Consensus</option>
                  </select>
                </div>
              </div>
            </div>

          </div>
        )}

        {/* TAB 3: GATE MANAGEMENT & BYPASS MATRIX */}
        {activeTab === 'gates' && (
          <div className="space-y-6">
            <div className="bg-[#161B22] rounded-xl p-6 border border-[#30363D] space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="text-base font-bold text-white">Execution Gates & Strategy Bypass Matrix</h3>
                  <p className="text-xs text-gray-400 mt-0.5">Toggle individual confirmation gates or adjust sensitivity thresholds.</p>
                </div>
                <span className="text-xs px-2.5 py-1 rounded bg-gray-800 text-gray-300 border border-gray-700">
                  {strategyGates.filter(g => !(settings.disabledGates || {})[g.id]).length} of {strategyGates.length} Active
                </span>
              </div>

              <div className="divide-y divide-[#30363D]/60 pt-2">
                {strategyGates.map((gate) => {
                  const isDisabled = !!(settings.disabledGates || {})[gate.id];
                  const isExpanded = expandedGateId === gate.id;

                  return (
                    <div key={gate.id} className="py-3.5 flex flex-col gap-2">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={!isDisabled}
                            onChange={() => handleToggleGate(gate.id)}
                            className="w-4 h-4 rounded text-[#00e696] bg-gray-900 border-gray-700 focus:ring-[#00e696] cursor-pointer"
                            id={`gate-check-${gate.id}`}
                          />
                          <div>
                            <label
                              htmlFor={`gate-check-${gate.id}`}
                              className={`text-sm font-bold cursor-pointer ${isDisabled ? 'text-gray-500 line-through' : 'text-gray-200'}`}
                            >
                              {gate.name}
                            </label>
                            <div className="flex items-center gap-2 mt-0.5">
                              {getImportanceBadge(gate.importance, gate.importanceScore)}
                              <span className="text-[11px] text-gray-500 font-mono">[{gate.strategy}]</span>
                            </div>
                          </div>
                        </div>

                        <button
                          onClick={() => setExpandedGateId(isExpanded ? null : gate.id)}
                          className="text-xs text-gray-400 hover:text-white px-2 py-1 rounded bg-gray-800/80 border border-gray-700 cursor-pointer"
                        >
                          {isExpanded ? 'Less' : 'Details'}
                        </button>
                      </div>

                      {isExpanded && (
                        <div className="pl-7 pr-2 py-2 text-xs text-gray-400 bg-gray-900/60 rounded-lg border border-gray-800 mt-1">
                          <p className="leading-relaxed">{gate.description}</p>
                          <div className="mt-1 text-[11px] text-gray-500">
                            Failure mode: {gate.importance === 'CRITICAL' ? 'Blocks trade immediately' : 'Deducts score weight from total conviction'}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {strategyToDelete && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-[#161B22] border border-rose-500/40 rounded-xl p-5 max-w-md w-full shadow-2xl space-y-4">
              <div className="flex items-start gap-3">
                <div className="p-2.5 rounded-lg bg-rose-500/20 text-rose-400 border border-rose-500/30 shrink-0">
                  <Trash2 className="w-5 h-5 text-rose-400" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Delete Strategy</h3>
                  <p className="text-xs text-gray-300 mt-1">
                    Are you sure you want to delete <span className="font-bold text-rose-300">{AVAILABLE_STRATEGIES.find(s => s.id === strategyToDelete)?.name || strategyToDelete}</span>?
                  </p>
                  <p className="text-[11px] text-gray-400 mt-1.5 leading-relaxed">
                    This will immediately remove it from the active trading engine, multi-strategy scanning, and bucket priority. You can restore it anytime from "Restore Strategies".
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-800">
                <button
                  type="button"
                  onClick={() => setStrategyToDelete(null)}
                  className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-gray-800 text-gray-300 hover:bg-gray-700 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleConfirmDelete(strategyToDelete)}
                  className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white transition-colors cursor-pointer flex items-center gap-1.5 shadow-lg shadow-rose-950/50"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Confirm Delete
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Restore Deleted Strategies Modal */}
        {showRestoreModal && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-[#161B22] border border-[#30363D] rounded-xl p-5 max-w-lg w-full shadow-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-[#30363D] pb-3">
                <div className="flex items-center gap-2">
                  <Plus className="w-4 h-4 text-emerald-400" />
                  <h3 className="text-base font-bold text-white">Add / Restore Strategies</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowRestoreModal(false)}
                  className="text-gray-400 hover:text-white text-xs px-2 py-1 rounded bg-gray-800 cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-2 max-h-72 overflow-y-auto custom-scrollbar">
                {deletedStrategies.length === 0 ? (
                  <div className="py-6 px-4 text-center space-y-2">
                    <p className="text-xs text-gray-300 font-medium">All 10 strategies are present in your active engine registry.</p>
                    <p className="text-[11px] text-gray-500">To enable or disable any strategy, use the toggle checkboxes on the strategy cards.</p>
                  </div>
                ) : (
                  deletedStrategies.map(stratId => {
                    const stratMeta = AVAILABLE_STRATEGIES.find(s => s.id === stratId);
                    return (
                      <div key={stratId} className="flex items-center justify-between p-3 bg-gray-900/80 rounded-lg border border-gray-800 gap-3">
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-white truncate">{stratMeta?.name || stratId}</div>
                          <div className="text-[10px] text-gray-500 font-mono">{stratId}</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRestoreStrategy(stratId)}
                          className="px-2.5 py-1 text-xs font-semibold rounded bg-emerald-600 hover:bg-emerald-500 text-white transition-colors flex items-center gap-1 shrink-0 cursor-pointer"
                        >
                          <Plus className="w-3 h-3" /> Add Back
                        </button>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-gray-800">
                <button
                  type="button"
                  onClick={handleRestoreAllStrategies}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-800 hover:bg-gray-700 text-amber-300 border border-amber-800/40 transition-colors cursor-pointer"
                >
                  Restore All Defaults
                </button>
                <button
                  type="button"
                  onClick={() => setShowRestoreModal(false)}
                  className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-[#00e696] text-black hover:bg-[#00e696]/90 transition-colors cursor-pointer"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default StrategyPanel;
