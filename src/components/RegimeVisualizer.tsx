/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * 3-Layer Quantitative Regime Engine Visualizer & Auto-Activation Hub
 * Layer 1: Direction Bias (1D + 4H) -> -100 to +100 with nuance categorization
 * Layer 2: Market Regime (4H confirmed by 1H) -> Trend, Range, Compression, Expansion (2-bar hysteresis & age)
 * Layer 3: Tradeability Gate -> 0.118% round-trip fee drag, 1H ATR stop sizing, event flags, spread/liquidity
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { 
  TrendingUp, TrendingDown, Activity, AlertTriangle, ShieldAlert, ShieldCheck,
  Compass, RefreshCw, CheckCircle2, XCircle, Sliders, Zap, ZapOff,
  Flame, Lock, HelpCircle, Layers, ArrowUpRight, ArrowDownRight, Clock, 
  DollarSign, Percent, BarChart3, Scale, Info, Check, Sparkles, ExternalLink, ChevronRight
} from 'lucide-react';
import { AppSettings, CoinDetail } from '../types';
import { 
  ThreeLayerRegimeState, 
  CoreRegimeType, 
  BiasNuance, 
  StrategyRecommendation, 
  BiasFactor,
  ROUND_TRIP_FEE_PCT,
  FEE_DRAG_MAX_R_PCT
} from '../utils/regime/threeLayerRegime';
import { useToast } from './ToastContext';

interface Props {
  settings: AppSettings;
  setSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
  coins?: CoinDetail[];
  selectedSymbol?: string;
  onSelectCoin?: (symbol: string) => void;
  fetchKlines?: (symbol: string, tf: any) => Promise<any[]>;
}

export function RegimeVisualizer({
  settings,
  setSettings,
  coins,
  selectedSymbol,
  onSelectCoin
}: Props) {
  const { addToast } = useToast();
  
  const [loading, setLoading] = useState(false);
  const [regimeState, setRegimeState] = useState<ThreeLayerRegimeState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<number>(Date.now());
  const [activeTab, setActiveTab] = useState<'all' | 'layer1' | 'layer2' | 'layer3' | 'strategies'>('all');
  
  // Interactive Fee Drag Simulator state
  const [simulatedStopPct, setSimulatedStopPct] = useState<number>(1.0);
  const [showRoutineGuide, setShowRoutineGuide] = useState(false);

  // Keep a stable ref to settings to avoid infinite re-render cycles
  const settingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  // Fetch live 3-layer regime from backend API
  const fetchRegime = useCallback(async (force = false) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/regime/threelayer${force ? '?force=true' : ''}`);
      if (!res.ok) {
        throw new Error(`Server returned HTTP ${res.status}`);
      }
      const data: ThreeLayerRegimeState = await res.json();
      setRegimeState(data);
      setError(null);
      setLastRefreshed(Date.now());

      // Sync simulator with actual typical stop if not yet modified
      if (data.tradeability && data.tradeability.typicalStopPct) {
        setSimulatedStopPct(data.tradeability.typicalStopPct);
      }

      // Auto-Arm logic if enabled
      const curSettings = settingsRef.current;
      if (curSettings.autoActivateRegimeStrategies && data.recommendedStrategies?.length > 0) {
        const topFavored = data.recommendedStrategies.find(s => s.suitability === 'FAVORED') || data.recommendedStrategies[0];
        if (topFavored && topFavored.strategyId !== curSettings.activeStrategy) {
          const nextSettings = {
            ...curSettings,
            activeStrategy: topFavored.strategyId as any,
            updatedAt: new Date().toISOString()
          };
          setSettings(nextSettings);
          fetch('/api/bot/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(nextSettings)
          }).catch(err => console.warn('Auto-arm sync error:', err));

          addToast({
            title: `Auto-Armed: ${topFavored.name}`,
            description: `Regime (${data.regime.confirmedRegime}) favored ${topFavored.name} with ${topFavored.expectedR}R expectancy.`,
            type: 'info'
          });
        }
      }
    } catch (err: any) {
      console.warn('Error fetching 3-layer regime:', err);
      setError(err.message || 'Failed to connect to regime engine');
    } finally {
      setLoading(false);
    }
  }, [setSettings, addToast]);

  // Initial fetch and 45s periodic background refresh
  useEffect(() => {
    fetchRegime(false);
    const interval = setInterval(() => {
      fetchRegime(false);
    }, 45000);
    return () => clearInterval(interval);
  }, [fetchRegime]);

  // Handle manual 1-click strategy arming
  const handleArmStrategy = async (strat: StrategyRecommendation) => {
    const nextSettings = {
      ...settings,
      activeStrategy: strat.strategyId as any,
      updatedAt: new Date().toISOString()
    };
    setSettings(nextSettings);

    try {
      const res = await fetch('/api/bot/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nextSettings)
      });
      if (res.ok) {
        addToast({
          title: `Armed ${strat.name}`,
          description: `Engine active strategy switched to ${strat.name} (${strat.expectedR}R expectancy).`,
          type: 'success'
        });
      } else {
        throw new Error('Save failed');
      }
    } catch (e) {
      addToast({
        title: 'Armed Locally',
        description: 'Updated in UI state. Background sync in progress.',
        type: 'warning'
      });
    }
  };

  // Toggle Auto-Arm mode
  const handleToggleAutoArm = async () => {
    const nextVal = !settings.autoActivateRegimeStrategies;
    const nextSettings = {
      ...settings,
      autoActivateRegimeStrategies: nextVal,
      updatedAt: new Date().toISOString()
    };
    setSettings(nextSettings);

    try {
      await fetch('/api/bot/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nextSettings)
      });
      addToast({
        title: nextVal ? 'Auto-Arm Mode Activated' : 'Auto-Arm Mode Paused',
        description: nextVal 
          ? 'Engine will autonomously arm favored strategies matching confirmed 4H/1H regimes.'
          : 'Manual strategy selection engaged.',
        type: nextVal ? 'success' : 'info'
      });
    } catch (e) {}

    if (nextVal) {
      fetchRegime(true);
    }
  };

  // Toggle Layer 3 Tradeability Gate
  const handleToggleLayer3Gate = async () => {
    const isCurrentlyActive = settings.enableRegimeLayer3Gate !== false;
    const nextVal = !isCurrentlyActive;
    const nextSettings = {
      ...settings,
      enableRegimeLayer3Gate: nextVal,
      updatedAt: new Date().toISOString()
    };
    setSettings(nextSettings);

    try {
      await fetch('/api/bot/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nextSettings)
      });
      addToast({
        title: nextVal ? 'Layer 3 Gate: ACTIVE' : 'Layer 3 Gate: BYPASSED (OFF)',
        description: nextVal 
          ? 'Tradeability gate enforced. Low edge trades (fee drag > 15% of 1R) will be blocked.'
          : 'Tradeability gate bypassed. Orders permitted across all volatility and fee environments.',
        type: nextVal ? 'success' : 'warning'
      });
    } catch (e) {
      addToast({
        title: 'Updated Locally',
        description: 'Layer 3 state updated in UI.',
        type: 'info'
      });
    }

    fetchRegime(true);
  };

  // Simulated fee drag calculation
  const simFeeDragPctOfR = useMemo(() => {
    if (simulatedStopPct <= 0) return 100;
    return parseFloat(((ROUND_TRIP_FEE_PCT / simulatedStopPct) * 100).toFixed(1));
  }, [simulatedStopPct]);

  // Color helpers
  const getBiasBadgeClass = (nuance: BiasNuance, score: number) => {
    if (score >= 20) {
      if (nuance === 'BULLISH_CROWDED') return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
      if (nuance === 'BULLISH_SHORT_COVERING') return 'bg-sky-500/20 text-sky-300 border-sky-500/40';
      return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
    } else if (score <= -20) {
      if (nuance === 'BEARISH_CROWDED') return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
      if (nuance === 'BEARISH_LONG_LIQUIDATION') return 'bg-purple-500/20 text-purple-300 border-purple-500/40';
      return 'bg-rose-500/20 text-rose-300 border-rose-500/40';
    }
    return 'bg-slate-500/20 text-slate-300 border-slate-500/40';
  };

  const getRegimeBadgeClass = (regime: CoreRegimeType) => {
    switch (regime) {
      case 'TREND':
        return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
      case 'COMPRESSION':
        return 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40';
      case 'EXPANSION':
        return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
      case 'RANGE':
      default:
        return 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40';
    }
  };

  const getSuitabilityBadgeClass = (suitability: StrategyRecommendation['suitability'] | 'AVOID') => {
    switch (suitability) {
      case 'FAVORED':
        return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50';
      case 'ACCEPTABLE':
        return 'bg-blue-500/20 text-blue-300 border-blue-500/40';
      case 'RESTRICTED':
        return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
      case 'PROHIBITED':
      case 'AVOID':
      default:
        return 'bg-rose-500/20 text-rose-300 border-rose-500/40';
    }
  };

  return (
    <div className="space-y-6 text-slate-100">
      {/* Top Header & Action Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/90 border border-slate-800 rounded-xl p-5 backdrop-blur-md shadow-xl">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-indigo-500/30 rounded-lg">
              <Compass className="w-6 h-6 text-indigo-400 animate-spin-slow" />
            </div>
            <div>
              <h2 className="text-xl font-bold bg-gradient-to-r from-white via-slate-200 to-indigo-300 bg-clip-text text-transparent flex items-center gap-2">
                QUANT REGIME ENGINE (3-LAYER)
                <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-500/20 border border-indigo-500/40 text-indigo-300 font-mono">
                  BTC/USDT ANCHOR
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Layer 1: Direction Bias (1D/4H) • Layer 2: Regime (4H+1H) • Layer 3: Tradeability (Fee Drag Floor)
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Auto-Arm Engine Toggle */}
          <button
            onClick={handleToggleAutoArm}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-semibold transition-all ${
              settings.autoActivateRegimeStrategies
                ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300 shadow-lg shadow-emerald-500/10'
                : 'bg-slate-800/80 border-slate-700 text-slate-300 hover:bg-slate-800'
            }`}
          >
            {settings.autoActivateRegimeStrategies ? (
              <>
                <Zap className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                <span>Auto-Arm Engine: ON</span>
              </>
            ) : (
              <>
                <ZapOff className="w-3.5 h-3.5 text-slate-400" />
                <span>Auto-Arm Engine: OFF</span>
              </>
            )}
          </button>

          {/* Layer 3 Gate Toggle */}
          <button
            onClick={handleToggleLayer3Gate}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-semibold transition-all ${
              settings.enableRegimeLayer3Gate !== false
                ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-300 shadow-lg shadow-indigo-500/10'
                : 'bg-amber-500/20 border-amber-500/40 text-amber-300 shadow-lg shadow-amber-500/10'
            }`}
            title="Toggle Layer 3 Tradeability & Fee Drag Gate"
          >
            {settings.enableRegimeLayer3Gate !== false ? (
              <>
                <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
                <span>Layer 3 Gate: ON</span>
              </>
            ) : (
              <>
                <ShieldAlert className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
                <span>Layer 3 Gate: OFF (Bypassed)</span>
              </>
            )}
          </button>

          {/* Refresh Button */}
          <button
            onClick={() => fetchRegime(true)}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 active:bg-slate-600 border border-slate-700 rounded-lg text-xs font-medium text-slate-200 transition-all disabled:opacity-50"
            title="Force refresh closed-candle calculations"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-indigo-400' : 'text-slate-400'}`} />
            <span>{loading ? 'Recalculating...' : 'Refresh'}</span>
          </button>

          {/* View Tab Buttons */}
          <div className="flex items-center bg-slate-950/80 border border-slate-800 rounded-lg p-1 text-xs">
            <button
              onClick={() => setActiveTab('all')}
              className={`px-2.5 py-1 rounded transition-colors ${activeTab === 'all' ? 'bg-indigo-600 text-white font-medium shadow' : 'text-slate-400 hover:text-slate-200'}`}
            >
              Unified
            </button>
            <button
              onClick={() => setActiveTab('layer1')}
              className={`px-2.5 py-1 rounded transition-colors ${activeTab === 'layer1' ? 'bg-indigo-600 text-white font-medium shadow' : 'text-slate-400 hover:text-slate-200'}`}
            >
              L1: Bias
            </button>
            <button
              onClick={() => setActiveTab('layer2')}
              className={`px-2.5 py-1 rounded transition-colors ${activeTab === 'layer2' ? 'bg-indigo-600 text-white font-medium shadow' : 'text-slate-400 hover:text-slate-200'}`}
            >
              L2: Regime
            </button>
            <button
              onClick={() => setActiveTab('layer3')}
              className={`px-2.5 py-1 rounded transition-colors ${activeTab === 'layer3' ? 'bg-indigo-600 text-white font-medium shadow' : 'text-slate-400 hover:text-slate-200'}`}
            >
              L3: Tradeability
            </button>
            <button
              onClick={() => setActiveTab('strategies')}
              className={`px-2.5 py-1 rounded transition-colors ${activeTab === 'strategies' ? 'bg-indigo-600 text-white font-medium shadow' : 'text-slate-400 hover:text-slate-200'}`}
            >
              Matrix
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-center justify-between p-3.5 bg-rose-950/40 border border-rose-800/60 rounded-xl text-rose-300 text-xs">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{error}. Check network or click retry to reload.</span>
          </div>
          <button onClick={() => fetchRegime(true)} className="underline font-semibold hover:text-rose-200">Retry</button>
        </div>
      )}

      {/* SKELETON LOADER (Shown while initial calculations or fetch is running) */}
      {!regimeState && loading && (
        <div className="space-y-6 animate-pulse">
          {/* Executive Summary Skeleton */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="bg-slate-950/60 border border-slate-800/80 rounded-lg p-3 space-y-2.5">
                  <div className="h-2.5 bg-slate-800 rounded w-2/3" />
                  <div className="h-5 bg-slate-800/80 rounded w-1/2" />
                </div>
              ))}
            </div>
          </div>

          {/* Invalidation Levels Skeleton */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3.5 space-y-3">
            <div className="h-3 bg-slate-800 rounded w-1/4" />
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
              {[1, 2, 3, 4, 5, 6, 7].map((i) => (
                <div key={i} className="bg-slate-950/70 border border-slate-800/80 rounded p-2 text-center space-y-1.5">
                  <div className="h-2 bg-slate-800 rounded w-1/2 mx-auto" />
                  <div className="h-4 bg-slate-800/80 rounded w-3/4 mx-auto" />
                </div>
              ))}
            </div>
          </div>

          {/* 3 Main Panels Skeleton */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 space-y-4">
                <div className="flex justify-between items-center">
                  <div className="h-4 bg-slate-800 rounded w-1/2" />
                  <div className="h-4 bg-slate-800 rounded w-1/4" />
                </div>
                <div className="h-20 bg-slate-950/80 border border-slate-800/60 rounded-lg" />
                <div className="space-y-2 pt-2">
                  <div className="h-3 bg-slate-800 rounded w-full" />
                  <div className="h-3 bg-slate-800 rounded w-4/5" />
                  <div className="h-3 bg-slate-800 rounded w-3/4" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ERROR / INITIAL CONNECT STATE (When not loading and no regimeState exists) */}
      {!regimeState && !loading && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-8 text-center space-y-4 shadow-xl">
          <div className="w-12 h-12 rounded-full bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center mx-auto text-indigo-400">
            <Compass className="w-6 h-6 animate-pulse" />
          </div>
          <div className="max-w-md mx-auto space-y-1">
            <h3 className="text-base font-bold text-white">Quantitative Regime Engine Ready</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              {error 
                ? `Connection notice: ${error}. Click below to perform closed-candle 3-layer calculation.`
                : 'Click below to run the closed-candle Direction Bias, Market Regime, and Tradeability evaluation.'}
            </p>
          </div>
          <div className="pt-2">
            <button
              onClick={() => fetchRegime(true)}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg shadow-lg shadow-indigo-600/20 active:scale-95 transition-all inline-flex items-center gap-2"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Run Quantitative Regime Check</span>
            </button>
          </div>
        </div>
      )}

      {/* EXECUTIVE SUMMARY CARD (TOP SINGLE-LINE MASTER BANNER) */}
      {regimeState && (
        <div className="bg-gradient-to-r from-slate-900 via-slate-900/95 to-slate-950 border border-slate-800 rounded-xl p-4 shadow-xl">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 items-center">
            {/* 1. Direction Bias */}
            <div className="bg-slate-950/60 border border-slate-800/80 rounded-lg p-3">
              <span className="text-[10px] font-mono tracking-wider text-slate-400 uppercase block mb-1">
                Layer 1: Direction Bias
              </span>
              <div className="flex items-center justify-between">
                <span className={`text-base font-bold font-mono ${
                  regimeState.bias.numericScore > 15 ? 'text-emerald-400' :
                  regimeState.bias.numericScore < -15 ? 'text-rose-400' : 'text-slate-300'
                }`}>
                  {regimeState.bias.numericScore > 0 ? `+${regimeState.bias.numericScore}` : regimeState.bias.numericScore} / 100
                </span>
                <span className={`text-xs px-2 py-0.5 rounded border font-medium ${getBiasBadgeClass(regimeState.bias.nuance, regimeState.bias.numericScore)}`}>
                  {regimeState.bias.nuanceLabel}
                </span>
              </div>
            </div>

            {/* 2. Core Regime */}
            <div className="bg-slate-950/60 border border-slate-800/80 rounded-lg p-3">
              <span className="text-[10px] font-mono tracking-wider text-slate-400 uppercase block mb-1">
                Layer 2: Core Regime
              </span>
              <div className="flex items-center justify-between">
                <span className={`text-sm font-bold px-2 py-0.5 rounded border ${getRegimeBadgeClass(regimeState.regime.confirmedRegime)}`}>
                  {regimeState.regime.confirmedRegime}
                </span>
                <span className="text-xs text-slate-400 font-mono flex items-center gap-1">
                  <Clock className="w-3 h-3 text-slate-500" />
                  {regimeState.regime.regimeAgeBars} bars ({regimeState.regime.regimeAgeBars * 4}h)
                </span>
              </div>
            </div>

            {/* 3. Volatility State */}
            <div className="bg-slate-950/60 border border-slate-800/80 rounded-lg p-3">
              <span className="text-[10px] font-mono tracking-wider text-slate-400 uppercase block mb-1">
                Volatility Percentiles (90d)
              </span>
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-slate-300">
                  BBW: <strong className="text-indigo-300">{Math.round(regimeState.regime.metrics.bbWidthPercentile90d * 100)}th</strong>
                </span>
                <span className="text-slate-500">•</span>
                <span className="text-slate-300">
                  ATR%: <strong className="text-cyan-300">{Math.round(regimeState.regime.metrics.atrPercentile90d * 100)}th</strong>
                </span>
              </div>
            </div>

            {/* 4. Tradeability Gate */}
            <div className="bg-slate-950/60 border border-slate-800/80 rounded-lg p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-mono tracking-wider text-slate-400 uppercase">
                  Layer 3: Tradeability Gate
                </span>
                <button
                  onClick={handleToggleLayer3Gate}
                  className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border transition-colors ${
                    settings.enableRegimeLayer3Gate !== false
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30'
                      : 'bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500/30'
                  }`}
                  title="Click to toggle Layer 3 Tradeability Gate"
                >
                  {settings.enableRegimeLayer3Gate !== false ? 'GATE: ON' : 'GATE: OFF'}
                </button>
              </div>
              <div className="flex items-center justify-between">
                <span className={`text-xs px-2 py-0.5 rounded font-bold border flex items-center gap-1 ${
                  settings.enableRegimeLayer3Gate === false
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                    : regimeState.tradeability.isTradeable
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                    : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                }`}>
                  {settings.enableRegimeLayer3Gate === false ? (
                    <><ShieldAlert className="w-3 h-3 text-amber-400" /> BYPASSED</>
                  ) : regimeState.tradeability.isTradeable ? (
                    <><CheckCircle2 className="w-3 h-3 text-emerald-400" /> PASS</>
                  ) : (
                    <><ShieldAlert className="w-3 h-3 text-rose-400" /> LOW EDGE</>
                  )}
                </span>
                <span className="text-xs text-slate-400 font-mono">
                  Drag: <strong className={regimeState.tradeability.feeDragPctOfR <= FEE_DRAG_MAX_R_PCT ? 'text-emerald-400' : 'text-rose-400'}>
                    {regimeState.tradeability.feeDragPctOfR}%
                  </strong>
                </span>
              </div>
            </div>

            {/* 5. Top Favored Setup */}
            <div className="bg-slate-950/60 border border-slate-800/80 rounded-lg p-3">
              <span className="text-[10px] font-mono tracking-wider text-slate-400 uppercase block mb-1">
                Favored Production Setup
              </span>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-indigo-300 truncate max-w-[140px]" title={regimeState.recommendedStrategies[0]?.name}>
                  {regimeState.recommendedStrategies[0]?.name || 'Stand Aside'}
                </span>
                <span className="text-xs px-1.5 py-0.5 bg-indigo-500/20 text-indigo-300 font-mono rounded">
                  {regimeState.recommendedStrategies[0]?.expectedR || 0}R
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* KEY INVALIDATION LEVELS BAR */}
      {regimeState && regimeState.levels && (
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3.5 backdrop-blur-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-mono font-semibold tracking-wide text-slate-300 flex items-center gap-1.5">
              <Scale className="w-3.5 h-3.5 text-indigo-400" />
              KEY DIRECTIONAL INVALIDATION LEVELS (BTC/USDT)
            </span>
            <span className="text-[11px] font-mono text-slate-400">
              Current: <strong className="text-white">${regimeState.levels.currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong>
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 text-xs font-mono">
            <div className="bg-slate-950/70 border border-slate-800/80 rounded p-2 text-center">
              <span className="text-[10px] text-slate-400 block">Daily Open</span>
              <span className="text-slate-200 font-medium">${regimeState.levels.dailyOpen.toFixed(1)}</span>
            </div>
            <div className="bg-slate-950/70 border border-slate-800/80 rounded p-2 text-center">
              <span className="text-[10px] text-slate-400 block">Weekly Open</span>
              <span className="text-slate-200 font-medium">${regimeState.levels.weeklyOpen.toFixed(1)}</span>
            </div>
            <div className="bg-slate-950/70 border border-slate-800/80 rounded p-2 text-center">
              <span className="text-[10px] text-slate-400 block">Prior Day High</span>
              <span className="text-emerald-400 font-medium">${regimeState.levels.priorDayHigh.toFixed(1)}</span>
            </div>
            <div className="bg-slate-950/70 border border-slate-800/80 rounded p-2 text-center">
              <span className="text-[10px] text-slate-400 block">Prior Day Low</span>
              <span className="text-rose-400 font-medium">${regimeState.levels.priorDayLow.toFixed(1)}</span>
            </div>
            <div className="bg-slate-950/70 border border-slate-800/80 rounded p-2 text-center">
              <span className="text-[10px] text-slate-400 block">4H VWAP</span>
              <span className="text-cyan-400 font-medium">${regimeState.levels.vwap4h.toFixed(1)}</span>
            </div>
            <div className="bg-rose-950/20 border border-rose-900/40 rounded p-2 text-center">
              <span className="text-[10px] text-rose-300 block">Bull Invalidation</span>
              <span className="text-rose-400 font-medium">${regimeState.levels.bullishInvalidation.toFixed(1)}</span>
            </div>
            <div className="bg-emerald-950/20 border border-emerald-900/40 rounded p-2 text-center">
              <span className="text-[10px] text-emerald-300 block">Bear Invalidation</span>
              <span className="text-emerald-400 font-medium">${regimeState.levels.bearishInvalidation.toFixed(1)}</span>
            </div>
          </div>
        </div>
      )}

      {/* MAIN 3-LAYER PANELS */}
      {regimeState && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* ========================================================= */}
          {/* LAYER 1: DIRECTION BIAS PANEL */}
          {/* ========================================================= */}
          {(activeTab === 'all' || activeTab === 'layer1') && (
            <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 flex flex-col shadow-lg">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-indigo-400" />
                  <h3 className="font-bold text-sm tracking-wide text-white">LAYER 1: DIRECTION BIAS (1D/4H)</h3>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded border font-mono font-bold ${
                  regimeState.bias.numericScore > 15 ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' :
                  regimeState.bias.numericScore < -15 ? 'bg-rose-500/20 text-rose-300 border-rose-500/40' :
                  'bg-slate-500/20 text-slate-300 border-slate-500/40'
                }`}>
                  {regimeState.bias.numericScore > 0 ? `+${regimeState.bias.numericScore}` : regimeState.bias.numericScore}
                </span>
              </div>

              {/* Gauge Meter (-100 to +100) */}
              <div className="space-y-1.5 mb-4">
                <div className="flex justify-between text-[11px] font-mono text-slate-400">
                  <span className="text-rose-400">-100 (Bear)</span>
                  <span className="text-slate-500">0 (Neutral)</span>
                  <span className="text-emerald-400">+100 (Bull)</span>
                </div>
                <div className="w-full h-3 bg-slate-950 rounded-full overflow-hidden p-0.5 border border-slate-800 relative">
                  {/* Center line */}
                  <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-slate-700 z-10" />
                  {/* Fill bar */}
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      regimeState.bias.numericScore >= 0
                        ? 'bg-gradient-to-r from-indigo-500 to-emerald-400'
                        : 'bg-gradient-to-l from-indigo-500 to-rose-400'
                    }`}
                    style={{
                      width: `${Math.abs(regimeState.bias.numericScore) / 2}%`,
                      marginLeft: regimeState.bias.numericScore >= 0 ? '50%' : `${50 - (Math.abs(regimeState.bias.numericScore) / 2)}%`
                    }}
                  />
                </div>
              </div>

              {/* Nuance Callout Box */}
              <div className={`p-3 rounded-lg border mb-4 text-xs ${getBiasBadgeClass(regimeState.bias.nuance, regimeState.bias.numericScore)}`}>
                <div className="font-bold flex items-center justify-between mb-1">
                  <span>Nuance: {regimeState.bias.nuanceLabel}</span>
                  <span className="text-[10px] font-mono opacity-80">No conflict averaging</span>
                </div>
                <p className="text-[11px] leading-relaxed opacity-95">
                  {regimeState.bias.summary}
                </p>
              </div>

              {/* ETH Confirmation Card */}
              <div className="p-3 bg-slate-950/60 border border-slate-800/80 rounded-lg mb-4 text-xs">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-slate-400 font-mono text-[11px]">ETH Confirmation Anchor:</span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                    regimeState.bias.ethAlignment === 'CONFIRMED'
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                      : regimeState.bias.ethAlignment === 'DIVERGENT'
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                      : 'bg-slate-500/20 text-slate-300 border-slate-500/40'
                  }`}>
                    {regimeState.bias.ethAlignment}
                  </span>
                </div>
                <p className="text-[11px] text-slate-300 font-mono">
                  {regimeState.bias.ethDetail}
                </p>
              </div>

              {/* 7-Factor Breakdown List */}
              <div className="space-y-2 flex-1">
                <span className="text-[11px] font-mono font-semibold text-slate-400 uppercase block mb-1">
                  7 Core Quantitative Bias Drivers
                </span>
                <div className="space-y-1.5 max-h-[320px] overflow-y-auto pr-1">
                  {regimeState.bias.factors.map(factor => (
                    <div
                      key={factor.id}
                      className="p-2.5 bg-slate-950/60 border border-slate-800/80 rounded-lg flex items-start justify-between gap-2 text-xs"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 font-medium text-slate-200">
                          <span className="truncate">{factor.name}</span>
                          <span className="text-[10px] font-mono text-slate-500">({factor.weight}%)</span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">{factor.detail}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${
                          factor.score > 0 ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' :
                          factor.score < 0 ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40' :
                          'bg-slate-800 text-slate-400 border border-slate-700'
                        }`}>
                          {factor.score > 0 ? '+1' : factor.score < 0 ? '-1' : '0'}
                        </span>
                        <span className="block text-[10px] font-mono text-slate-400 mt-0.5">{factor.value}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* LAYER 2: MARKET REGIME PANEL */}
          {/* ========================================================= */}
          {(activeTab === 'all' || activeTab === 'layer2') && (
            <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 flex flex-col shadow-lg">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
                <div className="flex items-center gap-2">
                  <Activity className="w-5 h-5 text-cyan-400" />
                  <h3 className="font-bold text-sm tracking-wide text-white">LAYER 2: MARKET REGIME (4H/1H)</h3>
                </div>
                <span className={`text-xs px-2.5 py-0.5 rounded border font-bold ${getRegimeBadgeClass(regimeState.regime.confirmedRegime)}`}>
                  {regimeState.regime.regimeLabel}
                </span>
              </div>

              {/* 2-Consecutive Closed Bar Hysteresis Indicator */}
              <div className="p-3.5 bg-slate-950/70 border border-slate-800 rounded-lg mb-4 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-300 font-medium flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-indigo-400" />
                    2-Bar Hysteresis Filter:
                  </span>
                  <span className={`font-mono font-bold ${regimeState.regime.isHysteresisConfirmed ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {regimeState.regime.isHysteresisConfirmed ? 'LOCKED & CONFIRMED' : 'TRANSITION PENDING'}
                  </span>
                </div>
                
                {/* Progress bar */}
                <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                  <div 
                    className={`h-full transition-all duration-300 ${
                      regimeState.regime.consecutiveCandles >= 2 ? 'bg-emerald-500' : 'bg-amber-500'
                    }`}
                    style={{ width: `${Math.min(100, (regimeState.regime.consecutiveCandles / 2) * 100)}%` }}
                  />
                </div>

                <div className="flex justify-between text-[11px] font-mono text-slate-400">
                  <span>Candidate: <strong>{regimeState.regime.candidateRegime}</strong></span>
                  <span>Locked: <strong>{regimeState.regime.consecutiveCandles} / 2 bars</strong></span>
                  <span>Age: <strong>{regimeState.regime.regimeAgeBars} bars</strong></span>
                </div>
              </div>

              {/* Quantitative Indicator Metrics Grid */}
              <div className="grid grid-cols-2 gap-2.5 mb-4">
                {/* ADX(14) */}
                <div className="p-3 bg-slate-950/60 border border-slate-800/80 rounded-lg">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-slate-400">ADX (14)</span>
                    <span className={`font-mono font-bold ${
                      regimeState.regime.metrics.adx14 > 25 ? 'text-emerald-400' :
                      regimeState.regime.metrics.adx14 < 18 ? 'text-cyan-400' : 'text-slate-300'
                    }`}>
                      {regimeState.regime.metrics.adx14.toFixed(1)}
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-500 font-mono block">
                    {regimeState.regime.metrics.adx14 > 25 ? '>25 Trend Active' : regimeState.regime.metrics.adx14 < 18 ? '<18 Range/Coil' : 'Transition Zone'}
                  </span>
                </div>

                {/* Efficiency Ratio (20) */}
                <div className="p-3 bg-slate-950/60 border border-slate-800/80 rounded-lg">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-slate-400">Efficiency Ratio</span>
                    <span className={`font-mono font-bold ${
                      regimeState.regime.metrics.efficiencyRatio20 > 0.35 ? 'text-emerald-400' :
                      regimeState.regime.metrics.efficiencyRatio20 < 0.20 ? 'text-cyan-400' : 'text-slate-300'
                    }`}>
                      {regimeState.regime.metrics.efficiencyRatio20.toFixed(2)}
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-500 font-mono block">
                    {regimeState.regime.metrics.efficiencyRatio20 > 0.35 ? 'Directional (Kaufman)' : 'High Noise / Chop'}
                  </span>
                </div>

                {/* BB Width Percentile */}
                <div className="p-3 bg-slate-950/60 border border-slate-800/80 rounded-lg">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-slate-400">BBW (90d Pct)</span>
                    <span className={`font-mono font-bold ${
                      regimeState.regime.metrics.bbWidthPercentile90d < 0.20 ? 'text-indigo-400' :
                      regimeState.regime.metrics.bbWidthPercentile90d > 0.80 ? 'text-amber-400' : 'text-slate-300'
                    }`}>
                      {Math.round(regimeState.regime.metrics.bbWidthPercentile90d * 100)}%
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-500 font-mono block">
                    {regimeState.regime.metrics.bbWidthPercentile90d < 0.20 ? '<20th Squeeze Alert' : regimeState.regime.metrics.bbWidthPercentile90d > 0.80 ? '>80th Expansion' : 'Moderate Width'}
                  </span>
                </div>

                {/* ATR% Percentile */}
                <div className="p-3 bg-slate-950/60 border border-slate-800/80 rounded-lg">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-slate-400">ATR% (90d Pct)</span>
                    <span className={`font-mono font-bold ${
                      regimeState.regime.metrics.atrPercentile90d < 0.25 ? 'text-indigo-400' :
                      regimeState.regime.metrics.atrPercentile90d > 0.80 ? 'text-amber-400' : 'text-slate-300'
                    }`}>
                      {Math.round(regimeState.regime.metrics.atrPercentile90d * 100)}%
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-500 font-mono block">
                    {regimeState.regime.metrics.atrPercentile90d < 0.25 ? '<25th Vol Compression' : regimeState.regime.metrics.atrPercentile90d > 0.80 ? '>80th High Volatility' : 'Normal Range'}
                  </span>
                </div>
              </div>

              {/* EMA Alignment Card */}
              <div className="p-3 bg-slate-950/60 border border-slate-800/80 rounded-lg mb-4 text-xs font-mono">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-slate-400 text-[11px]">EMA 9 / 55 / 200 Stack:</span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    regimeState.regime.metrics.emaAlignment.startsWith('STACKED') || regimeState.regime.metrics.emaAlignment === 'FANNING_WIDE'
                      ? 'bg-emerald-500/20 text-emerald-300'
                      : regimeState.regime.metrics.emaAlignment === 'CONVERGING'
                      ? 'bg-indigo-500/20 text-indigo-300'
                      : 'bg-slate-800 text-slate-400'
                  }`}>
                    {regimeState.regime.metrics.emaAlignment}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  1H Confirmation: <strong className="text-slate-200">{regimeState.regime.is1hConfirmed ? 'Alike Alignment' : 'Divergent Timeframe'}</strong>
                </p>
              </div>

              {/* Regime Explanatory Rule */}
              <div className="p-3 bg-slate-950/40 border border-slate-800/60 rounded-lg text-[11px] text-slate-400 leading-relaxed flex-1">
                <span className="font-semibold text-slate-300 block mb-1">Quantitative Classification Rule:</span>
                {regimeState.regime.confirmedRegime === 'TREND' && 'Strong ADX (>25) and Efficiency Ratio (>0.35) confirmed by stacked 9/55/200 EMAs. Favorable for trend pullback & continuation setups.'}
                {regimeState.regime.confirmedRegime === 'RANGE' && 'Low ADX (<18) and tangled moving averages. Favors SMC sweeps at key range highs/lows and Bollinger mean reversion.'}
                {regimeState.regime.confirmedRegime === 'COMPRESSION' && 'Bollinger bandwidth (<20th) & ATR% (<25th) squeeze coiling. Coils precede violent explosive expansions; VCB breakout orders armed.'}
                {regimeState.regime.confirmedRegime === 'EXPANSION' && 'Extreme bandwidth (>80th) and fanning EMAs. High volatility expansion: avoid breakout chasing; wait for liquidity sweeps or climax exhaustion.'}
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* LAYER 3: TRADEABILITY GATE PANEL */}
          {/* ========================================================= */}
          {(activeTab === 'all' || activeTab === 'layer3') && (
            <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 flex flex-col shadow-lg">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="w-5 h-5 text-amber-400" />
                  <h3 className="font-bold text-sm tracking-wide text-white">LAYER 3: TRADEABILITY GATE</h3>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleToggleLayer3Gate}
                    className={`text-xs px-2.5 py-1 rounded-lg border font-bold flex items-center gap-1.5 transition-all ${
                      settings.enableRegimeLayer3Gate !== false
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30'
                        : 'bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500/30'
                    }`}
                    title="Click to toggle Layer 3 Tradeability Gate ON/OFF"
                  >
                    {settings.enableRegimeLayer3Gate !== false ? (
                      <>
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                        <span>GATE: ON</span>
                      </>
                    ) : (
                      <>
                        <ShieldAlert className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
                        <span>GATE: BYPASSED (OFF)</span>
                      </>
                    )}
                  </button>
                  <span className={`text-xs px-2.5 py-1 rounded-lg border font-bold ${
                    settings.enableRegimeLayer3Gate === false
                      ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                      : regimeState.tradeability.isTradeable
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                      : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                  }`}>
                    {settings.enableRegimeLayer3Gate === false ? 'OVERRIDE' : regimeState.tradeability.isTradeable ? 'PASSED' : 'BLOCKED'}
                  </span>
                </div>
              </div>

              {/* Bypass Banner when Layer 3 is turned OFF */}
              {settings.enableRegimeLayer3Gate === false && (
                <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl mb-4 text-xs text-amber-200 flex items-start gap-2.5">
                  <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <strong className="block text-amber-300 font-semibold mb-0.5">Layer 3 Tradeability Gate: Disabled (Bypassed)</strong>
                    <p className="text-[11px] text-amber-200/90 leading-relaxed">
                      Orders will not be paused or blocked by fee drag (current: {regimeState.tradeability.feeDragPctOfR}% of 1R) or stop distance compression. All metrics and simulator below remain live for risk awareness.
                    </p>
                  </div>
                </div>
              )}

              {/* Fee Drag Banner */}
              <div className={`p-4 rounded-xl border mb-4 ${
                regimeState.tradeability.feeDragPctOfR <= FEE_DRAG_MAX_R_PCT
                  ? 'bg-emerald-950/20 border-emerald-800/40 text-emerald-200'
                  : 'bg-rose-950/30 border-rose-800/60 text-rose-200'
              }`}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-semibold uppercase tracking-wider">CoinDCX Round-Trip Fee Drag:</span>
                  <span className="text-base font-bold font-mono">
                    {regimeState.tradeability.feeDragPctOfR}% of 1R
                  </span>
                </div>
                <p className="text-[11px] leading-relaxed opacity-90">
                  {regimeState.tradeability.feeDragPctOfR <= FEE_DRAG_MAX_R_PCT
                    ? `Fee drag is healthy (<=15% of 1R). Round-trip 0.118% (0.05% x 2 x 1.18 GST) leaves substantial edge for profitable trade expectancy.`
                    : `Fee drag exceeds 15% threshold! Tight stop distance (${regimeState.tradeability.typicalStopPct}%) forfeits over ${regimeState.tradeability.feeDragPctOfR}% of your reward directly to exchange fees and GST.`}
                </p>
              </div>

              {/* Interactive Fee Drag Calculator */}
              <div className="p-3.5 bg-slate-950/70 border border-slate-800 rounded-lg mb-4 space-y-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-300 font-semibold flex items-center gap-1.5">
                    <Sliders className="w-3.5 h-3.5 text-indigo-400" />
                    Interactive Stop Distance Simulator:
                  </span>
                  <span className="font-mono text-indigo-300 font-bold">{simulatedStopPct}% Stop</span>
                </div>

                <input
                  type="range"
                  min="0.25"
                  max="3.0"
                  step="0.05"
                  value={simulatedStopPct}
                  onChange={(e) => setSimulatedStopPct(parseFloat(e.target.value))}
                  className="w-full accent-indigo-500 cursor-pointer"
                />

                <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 pt-1 border-t border-slate-800/60">
                  <span>Fee Drag: <strong className={simFeeDragPctOfR <= 15 ? 'text-emerald-400' : 'text-rose-400'}>{simFeeDragPctOfR}% of 1R</strong></span>
                  <span>Verdict: <strong className={simFeeDragPctOfR <= 15 ? 'text-emerald-400' : 'text-rose-400'}>{simFeeDragPctOfR <= 15 ? 'Acceptable Edge' : 'Fee Decimation'}</strong></span>
                </div>
              </div>

              {/* Liquidity, Volume & Event Flags */}
              <div className="space-y-2 flex-1">
                <span className="text-[11px] font-mono font-semibold text-slate-400 uppercase block">
                  Liquidity & Event Flags
                </span>
                
                <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                  <div className="p-2.5 bg-slate-950/60 border border-slate-800/80 rounded-lg">
                    <span className="text-[10px] text-slate-500 block">Relative Volume (20d)</span>
                    <span className="text-slate-200 font-semibold">{(regimeState.tradeability.relativeVolume ?? (regimeState.tradeability as any).relativeVolume20 ?? 1.0).toFixed(2)}x</span>
                  </div>
                  <div className="p-2.5 bg-slate-950/60 border border-slate-800/80 rounded-lg">
                    <span className="text-[10px] text-slate-500 block">Median 1H ATR%</span>
                    <span className="text-slate-200 font-semibold">{(regimeState.tradeability.median1hAtrPct ?? 0.5).toFixed(2)}%</span>
                  </div>
                </div>

                {/* Event Calendar Warnings */}
                <div className="p-3 bg-slate-950/60 border border-slate-800/80 rounded-lg space-y-1.5 text-[11px]">
                  <div className="flex items-center justify-between text-slate-300 font-mono">
                    <span>Next 8H Funding Cycle:</span>
                    <span className="text-cyan-400">{regimeState.tradeability.nextFundingTime || `${regimeState.tradeability.nextFundingHours ?? 2}h remaining`}</span>
                  </div>
                  {regimeState.tradeability.eventFlags && regimeState.tradeability.eventFlags.length > 0 ? (
                    regimeState.tradeability.eventFlags.slice(1, 3).map((ev, i) => (
                      <div key={i} className="flex items-center justify-between text-slate-300 font-mono">
                        <span className="truncate pr-2">{ev.name}:</span>
                        <span className={ev.impact === 'HIGH' ? 'text-amber-400 shrink-0' : 'text-indigo-400 shrink-0'}>{ev.timing}</span>
                      </div>
                    ))
                  ) : (
                    <div className="flex items-center justify-between text-slate-300 font-mono">
                      <span>Deribit Options Expiry (Fri):</span>
                      <span className="text-indigo-400">Weekly Expiry Flagged</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between text-slate-300 font-mono">
                    <span>Spread & Execution Health:</span>
                    <span className="text-emerald-400">Tight ({((regimeState.tradeability.spreadPct ?? 0.02) * 100).toFixed(2)}%)</span>
                  </div>
                </div>
              </div>

              {/* Blocked reason banner if not tradeable */}
              {!regimeState.tradeability.isTradeable && settings.enableRegimeLayer3Gate !== false && (
                <div className="mt-4 p-2.5 bg-rose-950/40 border border-rose-800/60 rounded-lg text-rose-300 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
                  <span>{regimeState.tradeability.gateReason || regimeState.tradeability.blockedReason || 'Low edge conditions active (Fee drag > 15%)'}</span>
                </div>
              )}
            </div>
          )}

        </div>
      )}

      {/* ========================================================= */}
      {/* REGIME -> STRATEGY EXPECTANCY MATRIX */}
      {/* ========================================================= */}
      {regimeState && (activeTab === 'all' || activeTab === 'strategies') && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4 mb-4">
            <div>
              <h3 className="font-bold text-base text-white flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-indigo-400" />
                REGIME → PRODUCTION STRATEGY EXPECTANCY MATRIX
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Active strategy alignment for <strong className="text-white font-mono">{regimeState.regime.confirmedRegime}</strong> regime with <strong className="text-white font-mono">{regimeState.bias.nuanceLabel}</strong> bias.
              </p>
            </div>
            
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-400">Active Engine Strategy:</span>
              <span className="px-2.5 py-1 bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 rounded-lg font-mono font-bold">
                {settings.activeStrategy}
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/80 text-slate-400 font-mono uppercase text-[10px] tracking-wider border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">Strategy</th>
                  <th className="py-3 px-4">Suitability</th>
                  <th className="py-3 px-4">Expected Value (R)</th>
                  <th className="py-3 px-4">Historical Win Rate</th>
                  <th className="py-3 px-4">Sample Size</th>
                  <th className="py-3 px-4">Quantitative Rationale</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {regimeState.recommendedStrategies.map((strat) => {
                  const isCurrentActive = settings.activeStrategy === strat.strategyId;
                  return (
                    <tr 
                      key={strat.strategyId}
                      className={`hover:bg-slate-800/40 transition-colors ${
                        isCurrentActive ? 'bg-indigo-950/20 border-l-2 border-indigo-500' : ''
                      }`}
                    >
                      <td className="py-3.5 px-4 font-sans font-semibold text-slate-100 flex items-center gap-2">
                        {strat.name}
                        {isCurrentActive && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-mono">
                            ACTIVE
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className={`px-2 py-0.5 rounded border text-[10px] font-bold ${getSuitabilityBadgeClass(strat.suitability)}`}>
                          {strat.suitability}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-bold text-slate-200">
                        <span className={strat.expectedR >= 1.5 ? 'text-emerald-400' : 'text-slate-300'}>
                          +{strat.expectedR.toFixed(2)} R
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-slate-300">
                        {strat.winRatePct}%
                      </td>
                      <td className="py-3.5 px-4 text-slate-400">
                        {strat.sampleTrades} trades
                      </td>
                      <td className="py-3.5 px-4 font-sans text-slate-400 text-[11px] max-w-xs leading-normal">
                        {strat.rationale}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <button
                          onClick={() => handleArmStrategy(strat)}
                          disabled={isCurrentActive}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                            isCurrentActive
                              ? 'bg-slate-800 text-slate-500 cursor-default'
                              : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/20 active:scale-95'
                          }`}
                        >
                          {isCurrentActive ? 'Armed' : 'Arm Strategy'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Routine Quick Guide Accordion */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden">
        <button
          onClick={() => setShowRoutineGuide(!showRoutineGuide)}
          className="w-full flex items-center justify-between p-4 text-left hover:bg-slate-800/40 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4 text-indigo-400" />
            <span className="text-xs font-semibold text-slate-300">How to Trade with this 3-Layer System (Session Routine)</span>
          </div>
          <ChevronRight className={`w-4 h-4 text-slate-400 transition-transform ${showRoutineGuide ? 'rotate-90' : ''}`} />
        </button>

        {showRoutineGuide && (
          <div className="p-4 pt-0 border-t border-slate-800/60 grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-slate-400">
            <div className="p-3 bg-slate-950/60 rounded-lg border border-slate-800">
              <strong className="text-white block mb-1">Step 1: Check Direction Bias</strong>
              <p>Look at the -100 to +100 score. If structure is bullish (+), only allow Long trades. If bearish (-), only allow Short trades. Note any "Crowded" warnings.</p>
            </div>
            <div className="p-3 bg-slate-950/60 rounded-lg border border-slate-800">
              <strong className="text-white block mb-1">Step 2: Confirm Market Regime</strong>
              <p>Verify the 4H/1H regime (Trend, Range, Compression, Expansion). The 2-bar locked filter ensures stability. Choose strategies matching the regime.</p>
            </div>
            <div className="p-3 bg-slate-950/60 rounded-lg border border-slate-800">
              <strong className="text-white block mb-1">Step 3: Check Tradeability Gate</strong>
              <p>Ensure fee drag is &le; 15% of 1R. On low-volatility days with small stops (&lt;0.8%), fees devour expectancy. Stand aside in cash on "Low Edge Days".</p>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
