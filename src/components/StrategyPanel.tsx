import React, { useState, useMemo, useEffect } from 'react';
import { AppSettings, StrategyBucketItem, MarketRegimeType, CoinDetail } from '../types';
import { GATES_REGISTRY, GateImportance } from '../utils/gatesRegistry';
import { DEFAULT_STRATEGY_BUCKET } from '../utils/strategyBucket';
import { StrategyChecklistPanel } from './StrategyChecklistPanel';
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
  id: 'EMA5_EXACT_ENTRY_V2' | 'EMA5_EXACT_ENTRY_V1' | 'VOLATILITY_COMPRESSION' | 'TREND_PULLBACK' | 'TREND_PULLBACK_RETEST' | 'EMA5_REJECTION_RECLAIM_V1' | 'EMA_GAP_PULLBACK' | 'EMA5_PA_VOLUME_V1' | 'SMC_LIQUIDITY_SWEEP' | 'BINANCE_COMPOSITE' | 'EARLY_COIL_BREAKOUT' | 'MACRO_RANGE_BREAKOUT';
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
    id: 'EMA5_EXACT_ENTRY_V1',
    name: 'EMA 5 Exact Price Action Entry (V1)',
    shortName: 'EMA 5 Exact V1',
    type: 'Exact Price Action Entry',
    badgeBg: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
    description: 'Exact EMA 5 price-action entry pattern with raw OHLC, EMA 5, volume confirmation, and 15m market structure regime filter.',
    icon: Zap,
  },
  {
    id: 'EMA5_REJECTION_RECLAIM_V1',
    name: 'EMA 5 Rejection → Reclaim → Displacement',
    shortName: 'EMA 5 Rejection Reclaim',
    type: 'Reversal / Reclaim & Displacement',
    badgeBg: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
    description: 'Requires full sequence: Approach → Sweep/Rejection wick → EMA5 Reclaim → Strong Displacement candle → Volume confirmation. Never enters on simple crossover.',
    icon: Zap,
  },
  {
    id: 'VOLATILITY_COMPRESSION',
    name: 'Volatility Compression Breakout (VCB)',
    shortName: 'VCB Breakout',
    type: 'Breakout / Squeeze',
    badgeBg: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
    description: 'Identifies tight Bollinger Band squeeze & range compression, enforcing the 7-gate checklist on explosive volume breakouts.',
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
    description: 'Full 5-stage state machine: trend detected → pullback → EMA retest → confirmation candle → entry. Requires ALL stages in order. No premature entries.',
    icon: Target,
  },
  {
    id: 'EMA_GAP_PULLBACK',
    name: '5 EMA Gap Pullback (Trend Continuation)',
    shortName: '5 EMA Gap',
    type: 'Trend Continuation',
    badgeBg: 'bg-teal-500/20 text-teal-300 border-teal-500/40',
    description: 'Trades high-quality 5 EMA gap candles after structured pullbacks with HTF 50 EMA trend alignment and anti-overextension filter.',
    icon: Zap,
  },
  {
    id: 'EMA5_PA_VOLUME_V1',
    name: 'EMA 5 Price Action Gap + Volume',
    shortName: 'EMA 5 PA Vol',
    type: 'Pure Price Action & Volume',
    badgeBg: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
    description: 'Standalone 5m pure price action + volume gap strategy with zero lagging indicators, strictly filtered by 15m market structure swings.',
    icon: Zap,
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
    id: 'MACRO_RANGE_BREAKOUT',
    name: 'Macro Range Box Breakout',
    shortName: 'Macro Range',
    type: 'Accumulation Breakout',
    badgeBg: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
    description: 'Darvas box accumulation breakout targeting long-term trending expansions above multi-week range highs.',
    icon: Compass,
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
      if (value === 'EMA_GAP_PULLBACK' || value === 'DELTA_CLIMAX') {
        nextSettings.egpEnabled = true;
        nextSettings.crEnabled = true;
      }
      if (value === 'EMA5_REJECTION_RECLAIM_V1') {
        nextSettings.errEnabled = true;
      }
      if (value === 'TREND_PULLBACK_RETEST') {
        nextSettings.tprEnabled = true;
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
      activeStrategy: (nextEnabled[0] || visibleStrategies[0]?.id || 'VOLATILITY_COMPRESSION') as any,
      egpEnabled: nextEnabled.includes('EMA_GAP_PULLBACK'),
      errEnabled: nextEnabled.includes('EMA5_REJECTION_RECLAIM_V1'),
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
      ? (nextEnabled[0] || remaining[0]?.id || 'VOLATILITY_COMPRESSION')
      : settings.activeStrategy) as any;

    const nextSettings: AppSettings = {
      ...settings,
      deletedStrategies: nextDeleted,
      enabledStrategies: nextEnabled,
      strategyBucket: nextBucket,
      activeStrategy: nextActive,
      egpEnabled: nextEnabled.includes('EMA_GAP_PULLBACK'),
      errEnabled: nextEnabled.includes('EMA5_REJECTION_RECLAIM_V1'),
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
      nextEnabled = ['EMA5_EXACT_ENTRY_V2', 'EMA5_EXACT_ENTRY_V1', 'VOLATILITY_COMPRESSION', 'TREND_PULLBACK', 'TREND_PULLBACK_RETEST', 'EMA_GAP_PULLBACK', 'EMA5_PA_VOLUME_V1', 'EARLY_COIL_BREAKOUT'].filter(s => !deletedStrategies.includes(s));
    } else if (preset === 'REVERSAL') {
      nextEnabled = ['EMA5_REJECTION_RECLAIM_V1', 'EMA_GAP_PULLBACK', 'BINANCE_COMPOSITE', 'SMC_LIQUIDITY_SWEEP'].filter(s => !deletedStrategies.includes(s));
    } else if (preset === 'CLEAR') {
      nextEnabled = [];
    }
    const nextSettings = {
      ...settings,
      enabledStrategies: nextEnabled,
      activeStrategy: (nextEnabled[0] || visibleStrategies[0]?.id || 'EMA5_EXACT_ENTRY_V2') as any,
      eev2Enabled: nextEnabled.includes('EMA5_EXACT_ENTRY_V2'),
      egpEnabled: nextEnabled.includes('EMA_GAP_PULLBACK'),
      errEnabled: nextEnabled.includes('EMA5_REJECTION_RECLAIM_V1'),
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
                      setSelectedChecklistStrategyId(settings.activeStrategy || 'EMA5_EXACT_ENTRY_V1');
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

            {/* SMC High-Probability Strategy Parameters */}
            <div className="bg-[#161B22] rounded-xl p-6 border border-purple-500/30 space-y-4 shadow-xl shadow-purple-950/10">
              <div className="flex items-center justify-between border-b border-[#30363D] pb-3">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-purple-400" />
                    <span>Smart Money Concepts (SMC) Liquidity Sweep Parameters</span>
                  </h3>
                  <p className="text-xs text-gray-400 mt-0.5">High-probability institutional price-action strategy targeting liquidity sweeps, MSS displacement, and FVG/OB confluence.</p>
                </div>
                <span className="px-2.5 py-0.5 rounded text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/40">
                  INSTITUTIONAL
                </span>
              </div>

              <div className="space-y-1">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between py-3 border-b border-gray-800/50 gap-4">
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-gray-200">Higher-Timeframe (HTF) Resolution</span>
                    <span className="text-xs text-gray-500 mt-1">Resolution used to establish institutional HTF market structure & trend direction</span>
                  </div>
                  <div className="flex bg-gray-900 rounded p-1 border border-gray-700">
                    {['15m', '1h', '4h', '1d'].map((res) => (
                      <button
                        key={res}
                        type="button"
                        onClick={() => handleInputChange('smcHtfResolution', res)}
                        className={`px-2.5 py-1 rounded text-xs font-bold transition-all ${
                          (settings.smcHtfResolution || '1h') === res
                            ? 'bg-purple-600 text-white'
                            : 'text-gray-400 hover:text-gray-200'
                        }`}
                      >
                        {res}
                      </button>
                    ))}
                  </div>
                </div>

                <InputRow label="Structure Pivot Length (Bars)" desc="Bars on left/right to confirm Swing High/Low pivot" value={settings.smcStructureLen ?? 10} onChange={(v: any) => handleInputChange('smcStructureLen', v)} min={3} max={50} />
                <InputRow label="Min Sweep Wick/Body Ratio" desc="Minimum ratio of wick extension to candle body size for stop hunt" value={settings.smcWickRatio ?? 0.6} onChange={(v: any) => handleInputChange('smcWickRatio', v)} step={0.1} min={0.2} max={2.0} />
                <InputRow label="Min Sweep Extension (%)" desc="Percentage beyond swing pivot required (e.g. 0.0015 = 0.15%)" value={settings.smcMinSweepWickPct ?? 0.0015} onChange={(v: any) => handleInputChange('smcMinSweepWickPct', v)} step={0.0005} min={0.0005} max={0.05} />
                <InputRow label="MSS Displacement ATR Multiplier" desc="Displacement candle body must exceed this multiple of ATR" value={settings.smcDispAtrMult ?? 0.5} onChange={(v: any) => handleInputChange('smcDispAtrMult', v)} step={0.1} min={0.2} max={5.0} />
                <InputRow label="Sweep-to-MSS Max Bars Window" desc="Max candles allowed between liquidity sweep and displacement MSS" value={settings.smcSweepConfirmWindow ?? 10} onChange={(v: any) => handleInputChange('smcSweepConfirmWindow', v)} min={3} max={50} />
                <InputRow label="MSS Volume Multiplier" desc="Displacement candle volume vs 20 SMA multiplier" value={settings.smcVolMult ?? 1.5} onChange={(v: any) => handleInputChange('smcVolMult', v)} step={0.1} min={1.0} max={5.0} />
                <InputRow label="MSS-to-FVG Max Bars Window" desc="Max candles after MSS displacement to find Fair Value Gap" value={settings.smcFvgAfterMssWindow ?? 5} onChange={(v: any) => handleInputChange('smcFvgAfterMssWindow', v)} min={2} max={30} />
                <InputRow label="Order Block Lookback Bars" desc="Candles searched back from MSS to detect origin Order Block" value={settings.smcObLookback ?? 30} onChange={(v: any) => handleInputChange('smcObLookback', v)} min={10} max={100} />
                <InputRow label="Stop Loss ATR Multiplier" desc="Protective stop buffer beyond sweep extreme in multiples of ATR" value={settings.smcAtrStopMult ?? 1.5} onChange={(v: any) => handleInputChange('smcAtrStopMult', v)} step={0.1} min={0.5} max={5.0} />
                <InputRow label="Target Risk:Reward Ratio" desc="Fixed structural take-profit target multiple vs initial risk" value={settings.smcRrRatio ?? 3.0} onChange={(v: any) => handleInputChange('smcRrRatio', v)} step={0.5} min={1.5} max={10.0} />

                <div className="flex items-center justify-between py-3 border-b border-gray-800/50">
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-gray-200">Session Kill Zone Filter</span>
                    <span className="text-xs text-gray-500 mt-1">Restrict execution to London (07-10 UTC) and NY (12-15 UTC) hours</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={Boolean(settings.smcUseKillZone)}
                    onChange={(e) => handleInputChange('smcUseKillZone', e.target.checked)}
                    className="w-4 h-4 rounded bg-gray-800 border-gray-700 text-purple-600 focus:ring-0 cursor-pointer"
                  />
                </div>

                <div className="flex items-center justify-between py-3 border-b border-gray-800/50">
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-gray-200">Strict HTF Structure Alignment</span>
                    <span className="text-xs text-gray-500 mt-1">Block Longs in Bearish HTF and Shorts in Bullish HTF</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={Boolean(settings.smcStrictHtfRegime)}
                    onChange={(e) => handleInputChange('smcStrictHtfRegime', e.target.checked)}
                    className="w-4 h-4 rounded bg-gray-800 border-gray-700 text-purple-600 focus:ring-0 cursor-pointer"
                  />
                </div>
              </div>
            </div>

            {/* Trend Pullback Strategy Parameters */}
            <div className="bg-[#161B22] rounded-xl p-6 border border-blue-500/30 space-y-4 shadow-xl shadow-blue-950/10">
              <div className="flex items-center justify-between border-b border-[#30363D] pb-3">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <Target className="w-4 h-4 text-blue-400" />
                    <span>Trend Pullback (HTF + MTF Retest) Parameters</span>
                  </h3>
                  <p className="text-xs text-gray-400 mt-0.5">Trend-following retest strategy with EMA20/50 alignment, ADX momentum, and volume surge filtering.</p>
                </div>
                <span className="px-2.5 py-0.5 rounded text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/40">
                  TREND FOLLOWING
                </span>
              </div>

              <div className="space-y-1">
                <InputRow label="Fast Trend EMA Period" desc="Fast EMA period for dynamic pullback detection (default: 20)" value={settings.tpbEmaFast ?? 20} onChange={(v: any) => handleInputChange('tpbEmaFast', v)} min={5} max={100} />
                <InputRow label="Slow Baseline EMA Period" desc="Slow baseline EMA period for trend direction (default: 50)" value={settings.tpbEmaSlow ?? 50} onChange={(v: any) => handleInputChange('tpbEmaSlow', v)} min={20} max={200} />
                <InputRow label="Minimum ADX Momentum" desc="ADX must be above this threshold to confirm trend (default: 18)" value={settings.tpbAdxMin ?? 18} onChange={(v: any) => handleInputChange('tpbAdxMin', v)} min={10} max={50} />
                <InputRow label="Volume SMA Lookback Period" desc="Lookback period for baseline volume moving average (default: 20)" value={settings.tpbVolumeSmaPeriod ?? 20} onChange={(v: any) => handleInputChange('tpbVolumeSmaPeriod', v)} min={5} max={50} />
                <InputRow label="Min Volume Surge Ratio" desc="Retest bounce candle volume vs SMA ratio (default: 1.0x)" value={settings.tpbMinVolumeRatio ?? 1.0} onChange={(v: any) => handleInputChange('tpbMinVolumeRatio', v)} step={0.1} min={0.5} max={5.0} />
                <InputRow label="Max Entry Distance from EMA (x ATR)" desc="Max allowable price extension from Fast EMA (default: 0.25)" value={settings.tpbMaxEntryDistanceAtr ?? 0.25} onChange={(v: any) => handleInputChange('tpbMaxEntryDistanceAtr', v)} step={0.05} min={0.1} max={3.0} />
                <InputRow label="Min Stop Distance (x ATR)" desc="Minimum stop distance in ATR units to reject market noise (default: 0.8)" value={settings.tpbMinStopDistanceAtr ?? 0.8} onChange={(v: any) => handleInputChange('tpbMinStopDistanceAtr', v)} step={0.1} min={0.2} max={2.0} />
                <InputRow label="Max Stop Distance (x ATR)" desc="Maximum allowable stop distance in ATR units for timeframe (default: 3.0)" value={settings.tpbMaxStopDistanceAtr ?? 3.0} onChange={(v: any) => handleInputChange('tpbMaxStopDistanceAtr', v)} step={0.1} min={1.0} max={6.0} />
                <InputRow label="Max Spread / Slippage (x ATR)" desc="Maximum allowable spread in ATR units before entry is blocked (default: 0.3)" value={settings.tpbMaxSpreadAtr ?? 0.3} onChange={(v: any) => handleInputChange('tpbMaxSpreadAtr', v)} step={0.05} min={0.05} max={1.0} />
                <InputRow label="Minimum Risk-to-Reward Ratio" desc="Required minimum asymmetric target multiple (default: 1.5)" value={settings.tpbMinRrRatio ?? 1.5} onChange={(v: any) => handleInputChange('tpbMinRrRatio', v)} step={0.1} min={1.0} max={5.0} />
                <InputRow label="Min Confirmation Score" desc="Minimum 5-pillar confirmation score to enter trade (default: 8/10)" value={settings.tpbMinScore ?? 8} onChange={(v: any) => handleInputChange('tpbMinScore', v)} min={5} max={10} />
                <InputRow label="Stop Loss ATR Buffer" desc="Buffer added beyond recent swing low/high in ATR (default: 0.3)" value={settings.tpbAtrBuffer ?? 0.3} onChange={(v: any) => handleInputChange('tpbAtrBuffer', v)} step={0.1} min={0.1} max={2.0} />

                <div className="flex items-center justify-between py-3 border-b border-gray-800/50">
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-gray-200">Allow Long Setups</span>
                    <span className="text-xs text-gray-500 mt-1">Enable bullish trend-pullback trade execution</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.tpbAllowLongs !== false}
                    onChange={(e) => handleInputChange('tpbAllowLongs', e.target.checked)}
                    className="w-4 h-4 rounded bg-gray-800 border-gray-700 text-blue-500 focus:ring-0 cursor-pointer"
                  />
                </div>

                <div className="flex items-center justify-between py-3 border-b border-gray-800/50">
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-gray-200">Allow Short Setups</span>
                    <span className="text-xs text-gray-500 mt-1">Enable bearish trend-pullback trade execution</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.tpbAllowShorts !== false}
                    onChange={(e) => handleInputChange('tpbAllowShorts', e.target.checked)}
                    className="w-4 h-4 rounded bg-gray-800 border-gray-700 text-blue-500 focus:ring-0 cursor-pointer"
                  />
                </div>

                <div className="flex items-center justify-between py-3 border-b border-gray-800/50">
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-gray-200">Allow Broad Structural Stops</span>
                    <span className="text-xs text-gray-500 mt-1">If unchecked, prefers Local Execution Stop and rejects distant HTF stops</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.tpbAllowBroadStop === true}
                    onChange={(e) => handleInputChange('tpbAllowBroadStop', e.target.checked)}
                    className="w-4 h-4 rounded bg-gray-800 border-gray-700 text-blue-500 focus:ring-0 cursor-pointer"
                  />
                </div>

                <div className="flex items-center justify-between py-3 border-b border-gray-800/50">
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-gray-200">Unconfirmed Volume Mode</span>
                    <span className="text-xs text-gray-500 mt-1">Allow signal execution when exchange volume is unconfirmed (marked lower confidence)</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.tpbAllowUnconfirmedVolume === true}
                    onChange={(e) => handleInputChange('tpbAllowUnconfirmedVolume', e.target.checked)}
                    className="w-4 h-4 rounded bg-gray-800 border-gray-700 text-blue-500 focus:ring-0 cursor-pointer"
                  />
                </div>

                <div className="flex items-center justify-between py-3 border-b border-gray-800/50">
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-gray-200">Require Volume Surge</span>
                    <span className="text-xs text-gray-500 mt-1">Block retest setups that lack confirmed volume expansion</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.tpbRequireVolume !== false}
                    onChange={(e) => handleInputChange('tpbRequireVolume', e.target.checked)}
                    className="w-4 h-4 rounded bg-gray-800 border-gray-700 text-blue-500 focus:ring-0 cursor-pointer"
                  />
                </div>
              </div>
            </div>

            {/* Ranging 1:3 R:R Mean-Reversion Parameters */}
            <div className="bg-[#161B22] rounded-xl p-6 border border-[#30363D] space-y-4">
              <div>
                <h3 className="text-base font-bold text-white">Ranging 1:3 R:R Strategy Parameters</h3>
                <p className="text-xs text-gray-400 mt-0.5">Bollinger Bands (20,2) + RSI(14) Mean-Reversion with strict 1:3 Risk-to-Reward ratio.</p>
              </div>
              <div className="space-y-1">
                <InputRow label="Bollinger Bands Period" desc="Moving average period for band center" value={settings.rmrBbPeriod ?? 20} onChange={(v: any) => handleInputChange('rmrBbPeriod', v)} min={10} max={50} />
                <InputRow label="Bollinger Bands StdDev" desc="Standard deviations for upper and lower bands" value={settings.rmrBbStdDev ?? 2.0} onChange={(v: any) => handleInputChange('rmrBbStdDev', v)} step={0.1} min={1.0} max={3.5} />
                <InputRow label="RSI Oversold Level (Long Entry)" desc="RSI must dip below this and cross back above to trigger Long" value={settings.rmrRsiOversold ?? 30} onChange={(v: any) => handleInputChange('rmrRsiOversold', v)} min={15} max={45} />
                <InputRow label="RSI Overbought Level (Short Entry)" desc="RSI must pierce above this and cross back below to trigger Short" value={settings.rmrRsiOverbought ?? 70} onChange={(v: any) => handleInputChange('rmrRsiOverbought', v)} min={55} max={85} />
                <InputRow label="Risk:Reward Ratio (Fixed Multiple)" desc="Take-Profit = Entry ± (Multiple × Stop Distance)" value={settings.rmrRiskRewardRatio ?? 3.0} onChange={(v: any) => handleInputChange('rmrRiskRewardRatio', v)} step={0.5} min={1.5} max={6.0} />
                <InputRow label="Stop-Loss Structure Buffer (%)" desc="Additional buffer beyond candle swing low/high" value={settings.rmrStopBufferPct ?? 0.15} onChange={(v: any) => handleInputChange('rmrStopBufferPct', v)} step={0.05} min={0.05} max={1.0} />
              </div>
            </div>

            {/* 5 EMA Gap Pullback Parameters */}
            <div className="bg-[#161B22] rounded-xl p-6 border border-[#30363D] space-y-4">
              <div>
                <h3 className="text-base font-bold text-white">5 EMA Gap Pullback Parameters</h3>
                <p className="text-xs text-gray-400 mt-0.5">HTF-aligned trend continuation on structured pullbacks with 5 EMA gap candle confirmation.</p>
              </div>
              <div className="space-y-1">
                <InputRow label="Min Pullback Bars" desc="Minimum candles pulling back toward 5 EMA (flag/wedge structure)" value={settings.egpMinPullbackBars ?? 3} onChange={(v: any) => handleInputChange('egpMinPullbackBars', v)} step={1} min={2} max={10} />
                <InputRow label="Gap Candle Volume Multiplier" desc="Current volume vs 20-period SMA required for gap confirmation" value={settings.egpVolumeMultiplier ?? 1.5} onChange={(v: any) => handleInputChange('egpVolumeMultiplier', v)} step={0.1} min={1.1} max={4.0} />
                <InputRow label="Max Overextension (x ATR from 21 EMA)" desc="Maximum allowable distance from 21 EMA in ATR multiples" value={settings.egpMaxDistToEma21Atr ?? 1.0} onChange={(v: any) => handleInputChange('egpMaxDistToEma21Atr', v)} step={0.1} min={0.5} max={3.0} />
                <InputRow label="Min Gap Body Ratio" desc="Minimum percentage of gap candle body beyond 5 EMA" value={settings.egpMinGapBodyPct ?? 0.60} onChange={(v: any) => handleInputChange('egpMinGapBodyPct', v)} step={0.05} min={0.4} max={0.95} />
{/* Institutional filters */}
<InputRow label="Execution Model" type="select" value={settings.egpExecutionModel ?? 'MODEL_A_NEXT_OPEN'} onChange={(v: any) => handleInputChange('egpExecutionModel', v)} options={['MODEL_A_NEXT_OPEN','MODEL_B_RETEST_LIMIT']} />
<InputRow label="Max Signal Range (ATR)" desc="Maximum allowed candle range in ATR multiples" value={settings.egpMaxSignalRangeAtr ?? 2.0} onChange={(v: any) => handleInputChange('egpMaxSignalRangeAtr', v)} step={0.1} min={0.5} max={5.0} />
<InputRow label="CLV Threshold" desc="Minimum close location value (CLV)" value={settings.egpMinCloseLocation ?? 0.7} onChange={(v: any) => handleInputChange('egpMinCloseLocation', v)} step={0.05} min={0.4} max={0.95} />
<InputRow label="Min Stop‑Distance (ATR)" desc="Minimum stop distance in ATR multiples" value={settings.egpMinStopDistanceAtr ?? 0.2} onChange={(v: any) => handleInputChange('egpMinStopDistanceAtr', v)} step={0.05} min={0.1} max={1.0} />
<InputRow label="Max Stop‑Distance (ATR)" desc="Maximum stop distance in ATR multiples" value={settings.egpMaxStopDistanceAtr ?? 1.0} onChange={(v: any) => handleInputChange('egpMaxStopDistanceAtr', v)} step={0.1} min={0.5} max={2.0} />
<InputRow label="Require Real‑3R‑Room" type="checkbox" checked={settings.egpRequireReal3RRoom ?? false} onChange={(e: any) => handleInputChange('egpRequireReal3RRoom', e.target.checked)} />
<InputRow label="Strict Gap Only" type="checkbox" checked={settings.egpStrictGapOnly ?? false} onChange={(e: any) => handleInputChange('egpStrictGapOnly', e.target.checked)} />
              </div>
            </div>

            {/* EMA 5 Price Action Gap + Volume Parameters */}
            <div className="bg-[#161B22] rounded-xl p-6 border border-emerald-500/30 space-y-4 shadow-xl shadow-emerald-950/10">
              <div className="flex items-center justify-between border-b border-[#30363D] pb-3">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <Zap className="w-4 h-4 text-emerald-400" />
                    <span>EMA 5 Price Action Gap + Volume Parameters</span>
                  </h3>
                  <p className="text-xs text-gray-400 mt-0.5">Standalone 5m pure price action + volume expansion strategy filtered by 15m market structure swings without lagging indicators.</p>
                </div>
                <span className="px-2.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                  PURE PA &amp; VOL
                </span>
              </div>

              <div className="space-y-1">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between py-3 border-b border-gray-800/50 gap-4">
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-gray-200">Strategy Version</span>
                    <span className="text-xs text-gray-500 mt-1">A: PA+EMA5 | B: +Vol | C: +15m Structure (Default) | D: +5m Breakout</span>
                  </div>
                  <div className="flex bg-gray-900 rounded p-1 border border-gray-700">
                    {(['A', 'B', 'C', 'D'] as const).map((ver) => (
                      <button
                        key={ver}
                        type="button"
                        onClick={() => handleInputChange('ema5PaVersion', ver)}
                        className={`px-3 py-1 rounded text-xs font-bold transition-all ${
                          (settings.ema5PaVersion || 'C') === ver
                            ? 'bg-emerald-600 text-white shadow'
                            : 'text-gray-400 hover:text-gray-200'
                        }`}
                      >
                        v{ver}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between py-3 border-b border-gray-800/50 gap-4">
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-gray-200">Execution Entry Mode</span>
                    <span className="text-xs text-gray-500 mt-1">MOMENTUM (Market on confirmation) vs LIMIT (Retest of gap)</span>
                  </div>
                  <div className="flex bg-gray-900 rounded p-1 border border-gray-700">
                    {(['MOMENTUM', 'LIMIT'] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => handleInputChange('ema5PaEntryMode', mode)}
                        className={`px-2.5 py-1 rounded text-xs font-bold transition-all ${
                          (settings.ema5PaEntryMode || 'MOMENTUM') === mode
                            ? 'bg-emerald-600 text-white shadow'
                            : 'text-gray-400 hover:text-gray-200'
                        }`}
                      >
                        {mode}
                      </button>
                    ))}
                  </div>
                </div>

                <InputRow label="Min Volume Multiplier" desc="Setup candle volume vs 20 SMA ratio (Rule 14: default 1.10x)" value={settings.ema5PaMinVolumeRatio ?? 1.10} onChange={(v: any) => handleInputChange('ema5PaMinVolumeRatio', v)} step={0.05} min={0.5} max={3.0} />
                <InputRow label="Min Gap / Range Ratio" desc="Normalized gap vs recent 5-candle average range (Rule 16: default 0.20)" value={settings.ema5PaMinGapRangeRatio ?? 0.20} onChange={(v: any) => handleInputChange('ema5PaMinGapRangeRatio', v)} step={0.05} min={0.05} max={0.80} />
                <InputRow label="Max Gap / Range Ratio" desc="Anti-overextension gap ceiling vs average range (Rule 17: default 1.00)" value={settings.ema5PaMaxGapRangeRatio ?? 1.00} onChange={(v: any) => handleInputChange('ema5PaMaxGapRangeRatio', v)} step={0.05} min={0.50} max={2.50} />
                <InputRow label="Max Chop EMA Crosses" desc="Max EMA5 crosses in last 10 candles before flagging chop (Rule 23: default 3)" value={settings.ema5PaMaxEmaCrosses ?? 3} onChange={(v: any) => handleInputChange('ema5PaMaxEmaCrosses', v)} min={1} max={8} />
                <InputRow label="Min Body / Range Ratio" desc="Minimum candle body dominance (Rule 9: default 0.50 = 50%)" value={settings.ema5PaMinBodyRatio ?? 0.50} onChange={(v: any) => handleInputChange('ema5PaMinBodyRatio', v)} step={0.05} min={0.30} max={0.90} />
                <InputRow label="Min Close Location (CLV)" desc="Close position in top/bottom quartile (Rule 10: default 0.65)" value={settings.ema5PaMinClosePosition ?? 0.65} onChange={(v: any) => handleInputChange('ema5PaMinClosePosition', v)} step={0.05} min={0.50} max={0.95} />
                <InputRow label="Max Setup Range Ratio" desc="Max setup candle range vs recent average (Rule 18: default 2.0x)" value={settings.ema5PaMaxSetupRangeRatio ?? 2.0} onChange={(v: any) => handleInputChange('ema5PaMaxSetupRangeRatio', v)} step={0.1} min={1.0} max={5.0} />
                <InputRow label="Target Risk:Reward Ratio" desc="Primary take-profit multiple vs initial stop distance (Rule 29: default 1.5R)" value={settings.ema5PaRiskReward ?? 1.5} onChange={(v: any) => handleInputChange('ema5PaRiskReward', v)} step={0.1} min={1.0} max={5.0} />

                <div className="flex items-center justify-between py-3 border-b border-gray-800/50">
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-gray-200">Move Stop to Breakeven at 1.0R</span>
                    <span className="text-xs text-gray-500 mt-1">Lock entry price after price advances 1.0x initial risk (Rule 31)</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.ema5PaBreakevenEnabled !== false}
                    onChange={(e) => handleInputChange('ema5PaBreakevenEnabled', e.target.checked)}
                    className="w-4 h-4 rounded bg-gray-800 border-gray-700 text-emerald-500 focus:ring-0 cursor-pointer"
                  />
                </div>

                <div className="flex items-center justify-between py-3 border-b border-gray-800/50">
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-gray-200">Require 15m Structure Break</span>
                    <span className="text-xs text-gray-500 mt-1">Only trade on fresh breaks of 15m swing highs/lows</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={Boolean(settings.ema5PaRequireStructureBreak)}
                    onChange={(e) => handleInputChange('ema5PaRequireStructureBreak', e.target.checked)}
                    className="w-4 h-4 rounded bg-gray-800 border-gray-700 text-emerald-500 focus:ring-0 cursor-pointer"
                  />
                </div>
              </div>
            </div>

            {/* EMA 5 Rejection → Reclaim → Displacement (EMA5_REJECTION_RECLAIM_V1) Parameters */}
            <div className="bg-[#161B22] rounded-xl p-6 border border-amber-500/30 space-y-4 shadow-xl shadow-amber-950/10">
              <div className="flex items-center justify-between border-b border-[#30363D] pb-3 flex-wrap gap-2">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <Zap className="w-4 h-4 text-amber-400" />
                    <span>EMA 5 Rejection → Reclaim → Displacement Parameters</span>
                  </h3>
                  <p className="text-xs text-gray-400 mt-0.5">Strict sequence: Approach → Sweep/Rejection Wick → EMA 5 Reclaim → Displacement Candle → Volume Confirmation. Never enters on simple crossover.</p>
                </div>
                <span className="px-2.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                  REJECTION &amp; RECLAIM
                </span>
              </div>

              <div className="space-y-1">
                <InputRow label="EMA Period" desc="Moving average period for rejection and reclaim detection (default 5)" value={settings.errEmaLength ?? 5} onChange={(v: any) => handleInputChange('errEmaLength', v)} min={3} max={20} />
                <InputRow label="Min Volume Multiplier" desc="Displacement candle volume vs 20-period baseline volume (default 1.10x)" value={settings.errMinVolumeRatio ?? 1.10} onChange={(v: any) => handleInputChange('errMinVolumeRatio', v)} step={0.05} min={0.5} max={3.0} />
                <InputRow label="Min Rejection Wick/Body Ratio" desc="Minimum rejection wick vs body ratio to confirm sweep (default 1.0 = 100%)" value={settings.errMinRejectionWickBodyRatio ?? 1.0} onChange={(v: any) => handleInputChange('errMinRejectionWickBodyRatio', v)} step={0.1} min={0.5} max={3.0} />
                <InputRow label="Strong Rejection Wick Ratio" desc="Wick/body ratio for higher conviction setup score (default 1.5)" value={settings.errStrongRejectionWickBodyRatio ?? 1.5} onChange={(v: any) => handleInputChange('errStrongRejectionWickBodyRatio', v)} step={0.1} min={1.0} max={4.0} />
                <InputRow label="Min Displacement Body Ratio" desc="Minimum body vs full range for displacement candle (default 0.50 = 50%)" value={settings.errMinDisplacementBodyRatio ?? 0.50} onChange={(v: any) => handleInputChange('errMinDisplacementBodyRatio', v)} step={0.05} min={0.30} max={0.90} />
                <InputRow label="Min Close Location (CLV)" desc="Displacement close position in candle range: ≥0.65 for Long, ≤0.35 for Short" value={settings.errMinClosePosition ?? 0.65} onChange={(v: any) => handleInputChange('errMinClosePosition', v)} step={0.05} min={0.50} max={0.95} />
                <InputRow label="Rejection Expiry Candles" desc="Max candles allowed after rejection to reclaim EMA 5 (default 3 candles)" value={settings.errRejectionExpiryCandles ?? 3} onChange={(v: any) => handleInputChange('errRejectionExpiryCandles', v)} min={1} max={10} />
                <InputRow label="Reclaim Expiry Candles" desc="Max candles allowed after reclaim to produce displacement candle (default 2 candles)" value={settings.errReclaimExpiryCandles ?? 2} onChange={(v: any) => handleInputChange('errReclaimExpiryCandles', v)} min={1} max={6} />
                <InputRow label="Max Displacement Range Ratio" desc="Anti-blowout ceiling: max displacement candle range vs 5-bar average (default 2.0x)" value={settings.errMaxDisplacementRangeRatio ?? 2.0} onChange={(v: any) => handleInputChange('errMaxDisplacementRangeRatio', v)} step={0.1} min={1.0} max={5.0} />
                <InputRow label="Max Stop Range Ratio" desc="Max distance between entry and SL vs 5-bar average range (default 3.5x)" value={settings.errMaxStopRangeRatio ?? 3.5} onChange={(v: any) => handleInputChange('errMaxStopRangeRatio', v)} step={0.1} min={1.0} max={6.0} />
                <InputRow label="Max Chop EMA Crosses" desc="Max EMA 5 crosses in last 10 candles before flagging choppy market (default 3)" value={settings.errMaxEmaCrosses ?? 3} onChange={(v: any) => handleInputChange('errMaxEmaCrosses', v)} min={1} max={8} />
                <InputRow label="Target Risk:Reward Ratio" desc="Take-profit multiple vs initial stop distance (default 1.5R)" value={settings.errRiskReward ?? 1.5} onChange={(v: any) => handleInputChange('errRiskReward', v)} step={0.1} min={1.0} max={5.0} />
                <InputRow label="Cooldown Candles" desc="Candles to wait after trade exit before seeking new setup (default 2)" value={settings.errCooldownCandles ?? 2} onChange={(v: any) => handleInputChange('errCooldownCandles', v)} min={1} max={10} />

                <div className="flex items-center justify-between py-3 border-b border-gray-800/50">
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-gray-200">Move Stop to Breakeven at 1.0R</span>
                    <span className="text-xs text-gray-500 mt-1">Automatically lock entry price after +1.0R unrealized profit</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.errBreakevenEnabled !== false}
                    onChange={(e) => handleInputChange('errBreakevenEnabled', e.target.checked)}
                    className="w-4 h-4 rounded bg-gray-800 border-gray-700 text-amber-500 focus:ring-0 cursor-pointer"
                  />
                </div>

                <div className="flex items-center justify-between py-3 border-b border-gray-800/50">
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-gray-200">Require 15m Structure Alignment</span>
                    <span className="text-xs text-gray-500 mt-1">Block Longs in Bearish 15m structure and Shorts in Bullish 15m structure</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={Boolean(settings.errRequireStructureBreak)}
                    onChange={(e) => handleInputChange('errRequireStructureBreak', e.target.checked)}
                    className="w-4 h-4 rounded bg-gray-800 border-gray-700 text-amber-500 focus:ring-0 cursor-pointer"
                  />
                </div>

                <div className="flex items-center justify-between py-3">
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-gray-200">Allow Reclaim Candle as Displacement</span>
                    <span className="text-xs text-gray-500 mt-1">If enabled, a single massive candle can count as both reclaim and displacement</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={Boolean(settings.errAllowReclaimAsDisplacement)}
                    onChange={(e) => handleInputChange('errAllowReclaimAsDisplacement', e.target.checked)}
                    className="w-4 h-4 rounded bg-gray-800 border-gray-700 text-amber-500 focus:ring-0 cursor-pointer"
                  />
                </div>
              </div>
            </div>

            {/* EMA 5 Exact Price Action Entry V2 (EMA5_EXACT_ENTRY_V2) Parameters */}
            <div className="bg-[#161B22] rounded-xl p-6 border border-emerald-500/40 space-y-4 shadow-xl shadow-emerald-950/20">
              <div className="flex items-center justify-between border-b border-[#30363D] pb-3 flex-wrap gap-2">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <Zap className="w-4 h-4 text-emerald-400" />
                    <span>EMA 5 Exact Price Action Entry V2 Parameters</span>
                  </h3>
                  <p className="text-xs text-gray-400 mt-0.5">Exact 5m EMA 5 Alert → Break trigger with 15m structure regime, multi-timeframe level ladder targets (15m, 1h, 1D, 1W), and fee-drag floor.</p>
                </div>
                <span className="px-2.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                  EXACT ALERT-BREAK V2
                </span>
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between py-3 border-b border-gray-800/50">
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-gray-200">Enable Strategy</span>
                    <span className="text-xs text-gray-500 mt-1">Allow EMA5_EXACT_ENTRY_V2 to generate live signals</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.eev2Enabled !== false}
                    onChange={(e) => handleInputChange('eev2Enabled', e.target.checked)}
                    className="w-4 h-4 rounded bg-gray-800 border-gray-700 text-emerald-500 focus:ring-0 cursor-pointer"
                  />
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between py-3 border-b border-gray-800/50 gap-4">
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-gray-200">Entry Mode</span>
                    <span className="text-xs text-gray-500 mt-1">CLOSE_CONFIRM (Conservative) vs TOUCH_LIMIT (Retest limit) vs AGGRESSIVE_CLOSE</span>
                  </div>
                  <div className="flex bg-gray-900 rounded p-1 border border-gray-700">
                    {(['CLOSE_CONFIRM', 'TOUCH_LIMIT', 'AGGRESSIVE_CLOSE'] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => handleInputChange('eev2EntryMode', mode)}
                        className={`px-2.5 py-1 rounded text-[11px] font-bold transition-all ${
                          (settings.eev2EntryMode || 'CLOSE_CONFIRM') === mode
                            ? 'bg-emerald-600 text-white shadow'
                            : 'text-gray-400 hover:text-gray-200'
                        }`}
                      >
                        {mode.replace('_', ' ')}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between py-3 border-b border-gray-800/50 gap-4">
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-gray-200">Exit Mode</span>
                    <span className="text-xs text-gray-500 mt-1">LEVEL_LADDER (TP1 40%, TP2 40%, Runner 20%) vs RR_FALLBACK</span>
                  </div>
                  <div className="flex bg-gray-900 rounded p-1 border border-gray-700">
                    {(['LEVEL_LADDER', 'RR_FALLBACK'] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => handleInputChange('eev2ExitMode', mode)}
                        className={`px-2.5 py-1 rounded text-[11px] font-bold transition-all ${
                          (settings.eev2ExitMode || 'LEVEL_LADDER') === mode
                            ? 'bg-emerald-600 text-white shadow'
                            : 'text-gray-400 hover:text-gray-200'
                        }`}
                      >
                        {mode.replace('_', ' ')}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between py-3 border-b border-gray-800/50 gap-4">
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-gray-200">Breakeven Mode</span>
                    <span className="text-xs text-gray-500 mt-1">AFTER_TP1 (Lock entry when TP1 hit) vs AT_1R vs OFF</span>
                  </div>
                  <div className="flex bg-gray-900 rounded p-1 border border-gray-700">
                    {(['AFTER_TP1', 'AT_1R', 'OFF'] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => handleInputChange('eev2BeMode', mode)}
                        className={`px-2.5 py-1 rounded text-[11px] font-bold transition-all ${
                          (settings.eev2BeMode || 'AFTER_TP1') === mode
                            ? 'bg-emerald-600 text-white shadow'
                            : 'text-gray-400 hover:text-gray-200'
                        }`}
                      >
                        {mode.replace('_', ' ')}
                      </button>
                    ))}
                  </div>
                </div>

                <InputRow label="Min Relative Volume Ratio" desc="Trigger candle volume vs 20-period baseline volume (default 1.10x)" value={settings.eev2MinVolumeRatio ?? 1.10} onChange={(v: any) => handleInputChange('eev2MinVolumeRatio', v)} step={0.05} min={0.5} max={3.0} />
                <InputRow label="Minimum Net R:R" desc="Required net reward-to-risk ratio to allow entry (default 2.5)" value={settings.eev2MinNetRr ?? 2.5} onChange={(v: any) => handleInputChange('eev2MinNetRr', v)} step={0.1} min={1.5} max={6.0} />
                <InputRow label="Max Fee Drag Floor (feeR)" desc="Maximum fee drag as fraction of stop risk (rejects if feeR > 0.20, default 0.20)" value={settings.eev2MaxFeeR ?? 0.20} onChange={(v: any) => handleInputChange('eev2MaxFeeR', v)} step={0.01} min={0.05} max={0.50} />
                <InputRow label="SL Anchor Buffer (x AvgRange)" desc="Stop buffer added beyond alert candle extreme (default 0.15)" value={settings.eev2SlBufferAvgRange ?? 0.15} onChange={(v: any) => handleInputChange('eev2SlBufferAvgRange', v)} step={0.05} min={0.05} max={0.50} />
                <InputRow label="Max Stop Distance (x AvgRange)" desc="Maximum allowable stop distance vs recent average range (default 2.0x)" value={settings.eev2MaxStopAvgRange ?? 2.0} onChange={(v: any) => handleInputChange('eev2MaxStopAvgRange', v)} step={0.1} min={1.0} max={5.0} />
                <InputRow label="Min Stop Distance (x AvgRange)" desc="Minimum allowable stop distance vs recent average range (default 0.5x)" value={settings.eev2MinStopAvgRange ?? 0.5} onChange={(v: any) => handleInputChange('eev2MinStopAvgRange', v)} step={0.05} min={0.1} max={1.5} />
                <InputRow label="Fallback Target (R Multiple)" desc="Take-profit multiple when structural levels are unavailable (default 3.0R)" value={settings.eev2FallbackTpR ?? 3.0} onChange={(v: any) => handleInputChange('eev2FallbackTpR', v)} step={0.1} min={1.5} max={6.0} />
                <InputRow label="Max Entry Drift Cap (in R)" desc="Maximum execution slip beyond trigger level (default 0.15R)" value={settings.eev2MaxEntryDriftR ?? 0.15} onChange={(v: any) => handleInputChange('eev2MaxEntryDriftR', v)} step={0.05} min={0.05} max={0.50} />
                <InputRow label="15m Regime Pivot Confirmation Bars" desc="Right-bar confirmation lag for 15m swing pivot detection (default 3 bars)" value={settings.eev2RegimePivotN ?? 3} onChange={(v: any) => handleInputChange('eev2RegimePivotN', v)} min={2} max={6} />
                <InputRow label="Max Position Hold Time (Hours)" desc="Maximum duration before closing stagnant position (default 24h)" value={settings.eev2MaxHoldHours ?? 24} onChange={(v: any) => handleInputChange('eev2MaxHoldHours', v)} min={1} max={72} />
              </div>
            </div>

            {/* EMA 5 Exact Price Action Entry (EMA5_EXACT_ENTRY_V1) Parameters */}
            <div className="bg-[#161B22] rounded-xl p-6 border border-emerald-500/30 space-y-4 shadow-xl shadow-emerald-950/10">
              <div className="flex items-center justify-between border-b border-[#30363D] pb-3 flex-wrap gap-2">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <Zap className="w-4 h-4 text-[#00e696]" />
                    <span>EMA 5 Exact Price Action Entry (V1) Parameters</span>
                  </h3>
                  <p className="text-xs text-gray-400 mt-0.5">Strict 2-stage architecture: Stage A (exact PA setup trigger around EMA 5) + Stage B (15m regime, volume, chop, extension, stop &amp; opposing structure filters).</p>
                </div>
                <span className="px-2.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                  EXACT PA TRIGGER
                </span>
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between py-3 border-b border-gray-800/50">
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-gray-200">Enable Strategy</span>
                    <span className="text-xs text-gray-500 mt-1">Allow EMA5_EXACT_ENTRY_V1 to generate entry signals</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.eeeEnabled !== false}
                    onChange={(e) => handleInputChange('eeeEnabled', e.target.checked)}
                    className="w-4 h-4 rounded bg-gray-800 border-gray-700 text-[#00e696] focus:ring-0 cursor-pointer"
                  />
                </div>
                <InputRow label="EMA Period" desc="Moving average period (ONLY EMA 5 is used, default 5)" value={settings.eeeEmaLength ?? 5} onChange={(v: any) => handleInputChange('eeeEmaLength', v)} min={3} max={20} />
                <InputRow label="Min Volume Ratio" desc="Candle volume vs 20-period baseline volume (Filter 2, default 1.05x)" value={settings.eeeMinVolumeRatio ?? 1.05} onChange={(v: any) => handleInputChange('eeeMinVolumeRatio', v)} step={0.05} min={0.5} max={3.0} />
                <InputRow label="Min Candle Body Ratio" desc="Body vs total candle range ratio (default 0.50 = 50%)" value={settings.eeeMinBodyRatio ?? 0.50} onChange={(v: any) => handleInputChange('eeeMinBodyRatio', v)} step={0.05} min={0.20} max={0.90} />
                <InputRow label="Min Close Location" desc="Close position in range: ≥0.60 for Long, ≤0.40 for Short (default 0.60)" value={settings.eeeMinClosePosition ?? 0.60} onChange={(v: any) => handleInputChange('eeeMinClosePosition', v)} step={0.05} min={0.50} max={0.95} />
                <InputRow label="Max EMA Distance Ratio" desc="Proximity filter: max distance from EMA 5 vs average range (default 1.2x)" value={settings.eeeMaxEmaDistanceRatio ?? 1.2} onChange={(v: any) => handleInputChange('eeeMaxEmaDistanceRatio', v)} step={0.1} min={0.5} max={3.0} />
                <InputRow label="Max Stop Range Ratio" desc="Filter 5: max stop distance vs average range (default 2.0x)" value={settings.eeeMaxStopRangeRatio ?? 2.0} onChange={(v: any) => handleInputChange('eeeMaxStopRangeRatio', v)} step={0.1} min={0.5} max={5.0} />
                <InputRow label="Max Chop EMA Crosses" desc="Filter 3: max EMA 5 crosses in last 10 candles before flagging chop (default 3)" value={settings.eeeMaxEmaCrosses ?? 3} onChange={(v: any) => handleInputChange('eeeMaxEmaCrosses', v)} min={1} max={8} />
                <InputRow label="Risk:Reward Ratio" desc="Take profit R:R multiple vs initial stop distance (default 1.5R)" value={settings.eeeRiskReward ?? 1.5} onChange={(v: any) => handleInputChange('eeeRiskReward', v)} step={0.1} min={0.5} max={5.0} />
                <InputRow label="Cooldown Candles" desc="Candles to wait after entry before evaluating new setups (default 2)" value={settings.eeeCooldownCandles ?? 2} onChange={(v: any) => handleInputChange('eeeCooldownCandles', v)} min={0} max={10} />

                <div className="flex items-center justify-between py-3 border-b border-gray-800/50">
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-gray-200">Move Stop to Breakeven at 1.0R</span>
                    <span className="text-xs text-gray-500 mt-1">Automatically lock entry price after +1.0R unrealized profit</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.eeeBreakevenEnabled !== false}
                    onChange={(e) => handleInputChange('eeeBreakevenEnabled', e.target.checked)}
                    className="w-4 h-4 rounded bg-gray-800 border-gray-700 text-[#00e696] focus:ring-0 cursor-pointer"
                  />
                </div>

                <div className="flex items-center justify-between py-3">
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-gray-200">Require Opposing Structure Space</span>
                    <span className="text-xs text-gray-500 mt-1">Filter 6: require at least 1.5R clear room before major opposing support/resistance</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.eeeRequireOpposingSpace !== false}
                    onChange={(e) => handleInputChange('eeeRequireOpposingSpace', e.target.checked)}
                    className="w-4 h-4 rounded bg-gray-800 border-gray-700 text-[#00e696] focus:ring-0 cursor-pointer"
                  />
                </div>
              </div>
            </div>

            {/* Trend Pullback Retest (TPR) Parameters */}
            <div className="bg-[#161B22] rounded-xl p-6 border border-[#30363D] space-y-4">
              <div>
                <h3 className="text-base font-bold text-white">Trend Pullback Retest (TPR) Parameters</h3>
                <p className="text-xs text-gray-400 mt-0.5">Full state-machine strategy: trend → pullback → retest → confirmation → entry. All 5 stages required.</p>
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between py-3 border-b border-gray-800/50">
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-gray-200">Enable TPR Strategy</span>
                    <span className="text-xs text-gray-500 mt-1">Allow TREND_PULLBACK_RETEST to generate signals</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.tprEnabled !== false}
                    onChange={(e) => handleInputChange('tprEnabled', e.target.checked)}
                    className="w-4 h-4 rounded bg-gray-800 border-gray-700 text-sky-500 focus:ring-0 cursor-pointer"
                  />
                </div>
                <InputRow label="Fast EMA Period" desc="EMA used for pullback zone and retest level (default 20)" value={settings.tprEmaFast ?? 20} onChange={(v: any) => handleInputChange('tprEmaFast', v)} min={5} max={100} />
                <InputRow label="Slow EMA Period" desc="EMA defining the trend boundary (default 50)" value={settings.tprEmaSlow ?? 50} onChange={(v: any) => handleInputChange('tprEmaSlow', v)} min={20} max={200} />
                <InputRow label="HTF EMA Period" desc="Optional higher-timeframe trend EMA (default 200, set 0 to disable)" value={settings.tprEmaHtf ?? 200} onChange={(v: any) => handleInputChange('tprEmaHtf', v)} min={50} max={500} />
                <InputRow label="Min ADX" desc="Minimum ADX value to classify market as trending (default 20)" value={settings.tprMinAdx ?? 20} onChange={(v: any) => handleInputChange('tprMinAdx', v)} min={10} max={50} />
                <InputRow label="Min Trend Score (1-6)" desc="Minimum trend quality score required to enter TREND_DETECTED phase (default 5)" value={settings.tprMinTrendScore ?? 5} onChange={(v: any) => handleInputChange('tprMinTrendScore', v)} min={1} max={6} />
                <InputRow label="Max Pullback Depth (ATR)" desc="Maximum allowed pullback depth in ATR units before invalidating (default 1.5)" value={settings.tprMaxPullbackAtr ?? 1.5} onChange={(v: any) => handleInputChange('tprMaxPullbackAtr', v)} step={0.1} min={0.3} max={4.0} />
                <InputRow label="Max Pullback Candles" desc="Setup timeout — max candles to wait in pullback phase (default 10)" value={settings.tprMaxPullbackCandles ?? 10} onChange={(v: any) => handleInputChange('tprMaxPullbackCandles', v)} min={3} max={30} />
                <InputRow label="Retest Tolerance (ATR)" desc="How close to EMA counts as a valid retest in ATR units (default 0.20)" value={settings.tprRetestToleranceAtr ?? 0.20} onChange={(v: any) => handleInputChange('tprRetestToleranceAtr', v)} step={0.05} min={0.05} max={1.0} />
                <InputRow label="Min Confirmation Body Ratio" desc="Min body/range ratio for the confirmation candle (default 0.40 = 40%)" value={settings.tprMinConfBodyRatio ?? 0.40} onChange={(v: any) => handleInputChange('tprMinConfBodyRatio', v)} step={0.05} min={0.20} max={0.80} />
                <InputRow label="Max Chase Distance (ATR)" desc="Chase filter: reject if price is too far from EMA after confirmation (default 0.75)" value={settings.tprMaxChaseAtr ?? 0.75} onChange={(v: any) => handleInputChange('tprMaxChaseAtr', v)} step={0.05} min={0.20} max={2.0} />
                <InputRow label="Max Confirmation Candle Range (ATR)" desc="Extreme candle filter: reject if confirmation candle range exceeds this ATR multiple (default 2.0)" value={settings.tprMaxConfCandleAtr ?? 2.0} onChange={(v: any) => handleInputChange('tprMaxConfCandleAtr', v)} step={0.1} min={0.5} max={5.0} />
                <InputRow label="Min EMA Separation (ATR ratio)" desc="EMA separation filter: |EMA slow - EMA fast| / ATR must be ≥ this value (default 0.20)" value={settings.tprMinEmaGapAtrRatio ?? 0.20} onChange={(v: any) => handleInputChange('tprMinEmaGapAtrRatio', v)} step={0.05} min={0.05} max={1.0} />
                <InputRow label="SL ATR Multiple" desc="Stop-loss placed at EMA fast ± SL_ATR × ATR (default 1.5)" value={settings.tprSlAtrMultiple ?? 1.5} onChange={(v: any) => handleInputChange('tprSlAtrMultiple', v)} step={0.1} min={0.5} max={4.0} />
                <InputRow label="R:R Ratio" desc="TP2 risk-to-reward ratio (default 2.0)" value={settings.tprRrRatio ?? 2.0} onChange={(v: any) => handleInputChange('tprRrRatio', v)} step={0.1} min={1.0} max={5.0} />
                <InputRow label="Cooldown Candles" desc="Candles to wait after exit or invalidation before looking for new setup (default 5)" value={settings.tprCooldownCandles ?? 5} onChange={(v: any) => handleInputChange('tprCooldownCandles', v)} min={1} max={20} />
                <InputRow label="Setup Timeout Candles" desc="Maximum candles to remain in any pending phase before invalidating (default 10)" value={settings.tprSetupTimeout ?? 10} onChange={(v: any) => handleInputChange('tprSetupTimeout', v)} min={3} max={30} />
                <div className="flex items-center justify-between py-3 border-b border-gray-800/50">
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-gray-200">Enable Break-even</span>
                    <span className="text-xs text-gray-500 mt-1">Move SL to breakeven when trade reaches +1R</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.tprBreakevenEnabled !== false}
                    onChange={(e) => handleInputChange('tprBreakevenEnabled', e.target.checked)}
                    className="w-4 h-4 rounded bg-gray-800 border-gray-700 text-sky-500 focus:ring-0 cursor-pointer"
                  />
                </div>
                <div className="flex items-center justify-between py-3 border-b border-gray-800/50">
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-gray-200">Enable Trailing Stop</span>
                    <span className="text-xs text-gray-500 mt-1">Activate ATR-based trailing stop after +1.5R</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.tprTrailingEnabled !== false}
                    onChange={(e) => handleInputChange('tprTrailingEnabled', e.target.checked)}
                    className="w-4 h-4 rounded bg-gray-800 border-gray-700 text-sky-500 focus:ring-0 cursor-pointer"
                  />
                </div>
                <div className="flex items-center justify-between py-3 border-b border-gray-800/50">
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-gray-200">Allow Long Trades</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.tprAllowLongs !== false}
                    onChange={(e) => handleInputChange('tprAllowLongs', e.target.checked)}
                    className="w-4 h-4 rounded bg-gray-800 border-gray-700 text-sky-500 focus:ring-0 cursor-pointer"
                  />
                </div>
                <div className="flex items-center justify-between py-3">
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-gray-200">Allow Short Trades</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.tprAllowShorts !== false}
                    onChange={(e) => handleInputChange('tprAllowShorts', e.target.checked)}
                    className="w-4 h-4 rounded bg-gray-800 border-gray-700 text-sky-500 focus:ring-0 cursor-pointer"
                  />
                </div>
              </div>
            </div>

            {/* VCB Parameters */}
            <div className="bg-[#161B22] rounded-xl p-6 border border-[#30363D] space-y-4">
              <div>
                <h3 className="text-base font-bold text-white">Volatility Compression (VCB) Parameters</h3>
                <p className="text-xs text-gray-400 mt-0.5">Bollinger/Keltner squeeze release with price buildup confirmation.</p>
              </div>
              <div className="space-y-1">
                <InputRow label="Squeeze Lookback Bars" desc="Number of candles evaluated for low volatility compression" value={settings.vcbSqueezeLookback ?? 20} onChange={(v: any) => handleInputChange('vcbSqueezeLookback', v)} min={10} max={50} />
                <InputRow label="Minimum Squeeze Ratio" desc="Bollinger Band width percentile qualifying as a valid squeeze" value={settings.vcbMinSqueezeRatio ?? 0.15} onChange={(v: any) => handleInputChange('vcbMinSqueezeRatio', v)} step={0.01} min={0.05} max={0.3} />
                <InputRow label="Volume Surge Trigger" desc="Expansion candle volume multiple over moving average" value={settings.vcbVolumeSurgeTrigger ?? 1.5} onChange={(v: any) => handleInputChange('vcbVolumeSurgeTrigger', v)} step={0.1} min={1.1} max={3.0} />
              </div>
            </div>

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
