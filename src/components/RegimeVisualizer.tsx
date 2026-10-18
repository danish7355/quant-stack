import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Compass, TrendingUp, TrendingDown, Activity, AlertTriangle, ShieldCheck, 
  ShieldAlert, RefreshCw, Zap, CheckCircle2, ArrowUpRight, 
  ArrowDownRight, Scale, Info, CheckSquare, Square,
  Clock, Flame, Layers, Lock, ChevronRight, BarChart3,
  Calendar, Percent, DollarSign, Database, Check, Sliders, Server, Filter,
  ChevronDown, ChevronUp, AlertCircle, HelpCircle
} from 'lucide-react';
import { CoinDetail, AppSettings, HtfBiasData } from '../types';
import { formatPrice } from '../utils/format';
import {
  KlineBar,
  FourHourRegime,
  ExtendedRegime,
  VolatilityState,
  TradeabilityStatus,
  evaluateDirectionBias,
  evaluateRegimeLayer2,
  evaluateTradeabilityLayer3,
  getRecommendedRegimeDirection,
  buildRegimeStrategyMatrix,
  rankStrategiesByBlendedExpectancy,
  calcRangeZoneAction,
  computeLiquidMarketBreadth,
  CANONICAL_STRATEGIES,
  DirectionBiasResult,
  RegimeResultLayer2,
  TradeabilityResultLayer3,
  StrategyMatrixCell,
  RankedStrategy
} from '../utils/regimeEngine';
import { MarketBreadthStats } from '../types';

interface Props {
  coins: CoinDetail[];
  settings: AppSettings;
  selectedSymbol?: string;
  onSelectSymbol?: (symbol: string) => void;
  onUpdateSettings?: (settings: AppSettings) => void;
  onSelectStrategy?: (strategy: string) => void;
  onSetMultipleStrategies?: (strategies: string[]) => void;
  accountBalance?: number;
}

interface ServerRegimeData {
  regime: string;
  label: string;
  details: string;
  symbol: string;
  timestamp: number;
  isTradable: boolean;
  macroColor: 'GREEN' | 'AMBER' | 'RED';
  recommendedDirection?: 'LONG' | 'SHORT';
  directionBiasScore?: number;
  directionBiasLabel?: string;
  btcPrice?: number;
  adx?: number;
  breadth?: MarketBreadthStats;
  activeStrategies?: string[];
  notTradableReason?: string | null;
  targetStrategies?: string[];
  lastSwitchTime?: number;
}

export function RegimeVisualizer({
  coins = [],
  settings,
  selectedSymbol: propSelectedSymbol,
  onSelectSymbol,
  onUpdateSettings,
  onSelectStrategy,
  onSetMultipleStrategies,
  accountBalance = 1000
}: Props) {
  // Selected Symbol for Analysis
  const [selectedSymbol, setSelectedSymbol] = useState<string>(propSelectedSymbol || 'BTCUSDT');

  // Navigation / Collapsible sections
  const [openSections, setOpenSections] = useState<{ [key: string]: boolean }>({
    summary: true,
    layer1: true,
    layer2: true,
    layer3: true,
    matrix: true,
    checklist: false
  });

  const toggleSection = (sec: string) => {
    setOpenSections(prev => ({ ...prev, [sec]: !prev[sec] }));
  };

  // Sync internal selectedSymbol with incoming prop
  useEffect(() => {
    if (propSelectedSymbol && propSelectedSymbol !== selectedSymbol) {
      setSelectedSymbol(propSelectedSymbol);
    }
  }, [propSelectedSymbol]);

  const handleSelectSymbol = useCallback((sym: string) => {
    const clean = sym.toUpperCase();
    setSelectedSymbol(clean);
    if (onSelectSymbol) {
      onSelectSymbol(clean);
    }
  }, [onSelectSymbol]);

  // Klines & Live Feeds (Updated on closed candles)
  const [klines1D, setKlines1D] = useState<KlineBar[]>([]);
  const [klines4H, setKlines4H] = useState<KlineBar[]>([]);
  const [klines1H, setKlines1H] = useState<KlineBar[]>([]);
  const [ethKlines4H, setEthKlines4H] = useState<KlineBar[]>([]);
  const [fundingHistory, setFundingHistory] = useState<number[]>([]);
  const [currentFundingRate, setCurrentFundingRate] = useState<number>(0.0001);
  const [openInterestData, setOpenInterestData] = useState<{ timestamp: number; oi: number; price: number }[]>([]);
  const [tradeLogs, setTradeLogs] = useState<any[]>([]);
  const [serverRegime, setServerRegime] = useState<ServerRegimeData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<number>(Date.now());
  const [feedTimestamps, setFeedTimestamps] = useState<{
    priceTime: number;
    klines4HTime: number;
    klines1DTime: number;
  }>({
    priceTime: Date.now(),
    klines4HTime: Date.now(),
    klines1DTime: Date.now()
  });

  const [symbolSearchQuery, setSymbolSearchQuery] = useState<string>('');

  // Interactive Checklist
  const [checklist, setChecklist] = useState<{ [key: string]: boolean }>(() => {
    try {
      const saved = localStorage.getItem('regime_pretrade_checklist');
      if (saved) return JSON.parse(saved);
    } catch {}
    return { step1: false, step2: false, step3: false, step4: false, step5: false };
  });

  const toggleChecklist = (stepKey: string) => {
    setChecklist(prev => {
      const updated = { ...prev, [stepKey]: !prev[stepKey] };
      try {
        localStorage.setItem('regime_pretrade_checklist', JSON.stringify(updated));
      } catch {}
      return updated;
    });
  };

  // Find selected coin in current live coins array
  const currentCoin = useMemo(() => {
    return coins.find(c => c.symbol === selectedSymbol) || coins.find(c => c.symbol === 'BTCUSDT') || coins[0];
  }, [coins, selectedSymbol]);

  // FIX 10: Single Price Source of Truth
  const canonicalPrice = useMemo(() => {
    if (currentCoin && currentCoin.price && currentCoin.price > 0) return currentCoin.price;
    if (klines4H.length > 0 && klines4H[klines4H.length - 1].close > 0) return klines4H[klines4H.length - 1].close;
    if (klines1D.length > 0 && klines1D[klines1D.length - 1].close > 0) return klines1D[klines1D.length - 1].close;
    return 85000;
  }, [currentCoin, klines4H, klines1D]);

  // Fetch Multi-Timeframe Data
  const fetchAllMarketData = useCallback(async () => {
    setIsLoading(true);
    try {
      const targetSym = (selectedSymbol || 'BTCUSDT').toUpperCase();
      const now = Date.now();

      const [
        resRegimeResult,
        res1DResult,
        res4HResult,
        res1HResult,
        resEthResult,
        resFundResult,
        resOIResult,
        resTradeLogsResult
      ] = await Promise.allSettled([
        fetch('/api/bot/regime'),
        fetch('/api/binance/proxy?path=/fapi/v1/klines&symbol=BTCUSDT&interval=1d&limit=220'),
        fetch('/api/binance/proxy?path=/fapi/v1/klines&symbol=BTCUSDT&interval=4h&limit=220'),
        fetch('/api/binance/proxy?path=/fapi/v1/klines&symbol=BTCUSDT&interval=1h&limit=220'),
        fetch('/api/binance/proxy?path=/fapi/v1/klines&symbol=ETHUSDT&interval=4h&limit=220'),
        fetch('/api/binance/proxy?path=/fapi/v1/fundingRate&symbol=BTCUSDT&limit=90'),
        fetch('/api/binance/proxy?path=/futures/data/openInterestHist&symbol=BTCUSDT&period=4h&limit=30'),
        fetch('/api/trade_logs')
      ]);

      if (resRegimeResult.status === 'fulfilled' && resRegimeResult.value.ok) {
        try {
          const srvData = await resRegimeResult.value.json();
          setServerRegime(srvData);
        } catch (e) {}
      }

      if (res1DResult.status === 'fulfilled' && res1DResult.value.ok) {
        try {
          const raw = await res1DResult.value.json();
          if (Array.isArray(raw)) {
            setKlines1D(raw.map((k: any) => ({
              time: Math.floor(k[0] / 1000),
              open: parseFloat(k[1]),
              high: parseFloat(k[2]),
              low: parseFloat(k[3]),
              close: parseFloat(k[4]),
              volume: parseFloat(k[5]),
              closeTime: Math.floor(k[6] / 1000)
            })));
            setFeedTimestamps(prev => ({ ...prev, klines1DTime: now }));
          }
        } catch (e) {}
      }

      if (res4HResult.status === 'fulfilled' && res4HResult.value.ok) {
        try {
          const raw = await res4HResult.value.json();
          if (Array.isArray(raw)) {
            setKlines4H(raw.map((k: any) => ({
              time: Math.floor(k[0] / 1000),
              open: parseFloat(k[1]),
              high: parseFloat(k[2]),
              low: parseFloat(k[3]),
              close: parseFloat(k[4]),
              volume: parseFloat(k[5]),
              closeTime: Math.floor(k[6] / 1000),
              takerBuyBaseVolume: parseFloat(k[9] || '0'),
              takerBuyQuoteVolume: parseFloat(k[10] || '0')
            })));
            setFeedTimestamps(prev => ({ ...prev, klines4HTime: now, priceTime: now }));
          }
        } catch (e) {}
      }

      if (res1HResult.status === 'fulfilled' && res1HResult.value.ok) {
        try {
          const raw = await res1HResult.value.json();
          if (Array.isArray(raw)) {
            setKlines1H(raw.map((k: any) => ({
              time: Math.floor(k[0] / 1000),
              open: parseFloat(k[1]),
              high: parseFloat(k[2]),
              low: parseFloat(k[3]),
              close: parseFloat(k[4]),
              volume: parseFloat(k[5]),
              closeTime: Math.floor(k[6] / 1000)
            })));
          }
        } catch (e) {}
      }

      if (resEthResult.status === 'fulfilled' && resEthResult.value.ok) {
        try {
          const raw = await resEthResult.value.json();
          if (Array.isArray(raw)) {
            setEthKlines4H(raw.map((k: any) => ({
              time: Math.floor(k[0] / 1000),
              open: parseFloat(k[1]),
              high: parseFloat(k[2]),
              low: parseFloat(k[3]),
              close: parseFloat(k[4]),
              volume: parseFloat(k[5])
            })));
          }
        } catch (e) {}
      }

      if (resFundResult.status === 'fulfilled' && resFundResult.value.ok) {
        try {
          const raw = await resFundResult.value.json();
          if (Array.isArray(raw) && raw.length > 0) {
            const hist = raw.map((f: any) => parseFloat(f.fundingRate));
            setFundingHistory(hist);
            setCurrentFundingRate(hist[hist.length - 1]);
          }
        } catch (e) {}
      }

      if (resOIResult.status === 'fulfilled' && resOIResult.value.ok) {
        try {
          const raw = await resOIResult.value.json();
          if (Array.isArray(raw) && raw.length > 0) {
            setOpenInterestData(raw.map((item: any) => ({
              timestamp: item.timestamp,
              oi: parseFloat(item.sumOpenInterestValue || item.sumOpenInterest || '0'),
              price: parseFloat(item.close || item.price || '0')
            })));
          }
        } catch (e) {}
      }

      if (resTradeLogsResult.status === 'fulfilled' && resTradeLogsResult.value.ok) {
        try {
          const logs = await resTradeLogsResult.value.json();
          if (Array.isArray(logs)) setTradeLogs(logs);
        } catch (e) {}
      }

      setLastRefreshedAt(Date.now());
    } finally {
      setIsLoading(false);
    }
  }, [selectedSymbol]);

  // E13: Signature of regime & tradeability settings to trigger instant visualizer re-fetch
  const regimeSettingsSignature = useMemo(() => {
    if (!settings) return '';
    return [
      settings.maxFeeDragPctOf1R,
      settings.maxSpread,
      settings.takerFeePct,
      settings.gstPct,
      settings.slippageBps,
      settings.min24hVolume,
      settings.autoRegimeStrategySync,
      settings.layer3TradeabilityGateEnabled,
      settings.regimeAdxTrendThreshold,
      settings.regimeAdxRangeThreshold,
      settings.regimeErTrendThreshold,
      settings.regimeErRangeThreshold,
      settings.regimeBbwCompressionThreshold,
      settings.regimeBbwExpansionThreshold,
      settings.regimeAtrExpansionThreshold,
      settings.regimeAtrCompressionThreshold
    ].map(v => String(v ?? '')).join('|');
  }, [settings]);

  // E13: Poll every 15s instead of 60s
  useEffect(() => {
    fetchAllMarketData();
    const interval = setInterval(() => fetchAllMarketData(), 15000);
    return () => clearInterval(interval);
  }, [fetchAllMarketData]);

  // E13: Instant re-fetch /api/bot/regime ~1.5s after settings changes
  useEffect(() => {
    if (!regimeSettingsSignature) return;
    const timer = setTimeout(() => {
      fetch('/api/bot/regime?refresh=true')
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (data) setServerRegime(data);
        })
        .catch(() => {});
    }, 1500);
    return () => clearTimeout(timer);
  }, [regimeSettingsSignature]);

  // FIX 9: Liquid Market Breadth (Top N, Quiet Range vs Violent Chop)
  const marketBreadth = useMemo(() => {
    return computeLiquidMarketBreadth(coins, settings?.breadthTopN ?? 40, settings?.breadthMinVolumeUsdt ?? 10_000_000);
  }, [coins, settings?.breadthTopN, settings?.breadthMinVolumeUsdt]);

  // FIX 1: Layer 1 Direction Bias Evaluation (Single Score, Merged Gate 5 Row)
  const biasResult: DirectionBiasResult = useMemo(() => {
    return evaluateDirectionBias(
      klines1D,
      klines4H,
      ethKlines4H,
      fundingHistory,
      currentFundingRate,
      openInterestData,
      55,
      canonicalPrice,
      serverRegime?.breadth || marketBreadth,
      settings
    );
  }, [klines1D, klines4H, ethKlines4H, fundingHistory, currentFundingRate, openInterestData, canonicalPrice, serverRegime?.breadth, marketBreadth, settings]);

  // FIX 2, 3, 4: Layer 2 Regime Classifier with Probabilities & Squeeze
  const regimeResult: RegimeResultLayer2 = useMemo(() => {
    return evaluateRegimeLayer2(klines4H, klines1H, settings);
  }, [klines4H, klines1H, settings]);

  // FIX 5 & 6: Layer 3 Tradeability Gate with Single Fee Source of Truth & UNGATED Honesty
  const tradeabilityResult: TradeabilityResultLayer3 = useMemo(() => {
    const spreadBps = currentCoin?.spreadBps || 2.5;
    return evaluateTradeabilityLayer3(klines1H, settings, { spreadBps, quoteVolume: currentCoin?.quoteVolume });
  }, [klines1H, settings, currentCoin]);

  // FIX 7: Strategy Matrix & Blended Expectancy Ranking (Canonical Strategies with Centralized Deleted Filter)
  const deletedStrategies = useMemo(() => settings?.deletedStrategies || [], [settings?.deletedStrategies]);

  const strategyMatrix: StrategyMatrixCell[] = useMemo(() => {
    return buildRegimeStrategyMatrix(
      regimeResult.primaryRegime,
      tradeLogs,
      settings?.matrixMinSampleCount ?? 30,
      deletedStrategies
    );
  }, [regimeResult.primaryRegime, tradeLogs, settings?.matrixMinSampleCount, deletedStrategies]);

  const rankedStrategies: RankedStrategy[] = useMemo(() => {
    return rankStrategiesByBlendedExpectancy(
      strategyMatrix,
      regimeResult.probabilities,
      settings?.matrixMinExpectancyR ?? 0.3,
      settings?.matrixMinSampleCount ?? 30,
      deletedStrategies
    );
  }, [strategyMatrix, regimeResult.probabilities, settings?.matrixMinExpectancyR, settings?.matrixMinSampleCount, deletedStrategies]);

  // Both Auto-Selected Portfolio and Bucket Card draw from ONE single ranking
  const topRankedStrategies = useMemo(() => {
    return rankedStrategies.slice(0, 3);
  }, [rankedStrategies]);

  const topStrategyIds = useMemo(() => {
    return topRankedStrategies.map(s => s.bucketStrategyId);
  }, [topRankedStrategies]);

  // FIX 8: Actionable Direction with Range Zones
  const actionableGuidance = useMemo(() => {
    return calcRangeZoneAction(
      canonicalPrice,
      biasResult.keyLevels.rangeHigh,
      biasResult.keyLevels.rangeLow,
      regimeResult.primaryRegime,
      regimeResult.isRangeSqueeze
    );
  }, [canonicalPrice, biasResult.keyLevels.rangeHigh, biasResult.keyLevels.rangeLow, regimeResult.primaryRegime, regimeResult.isRangeSqueeze]);

  // FIX 11: Top Summary Confidence
  const confidenceScore = useMemo(() => {
    const finalDir = actionableGuidance.direction === 'LONG' ? 1 : actionableGuidance.direction === 'SHORT' ? -1 : 0;
    const agreeingRows = biasResult.components.filter(c => finalDir !== 0 && c.score === finalDir).length;
    let baseConf = (agreeingRows / Math.max(1, biasResult.components.length)) * 100;
    if (finalDir === 0) baseConf = 65;

    // Reduce confidence when layers conflict
    if (regimeResult.isRangeSqueeze || tradeabilityResult.displayStatus !== 'TRADABLE' || biasResult.ethConfirmation.status === 'DIVERGENCE') {
      baseConf = Math.round(baseConf * 0.85);
    }
    return Math.min(95, Math.max(25, Math.round(baseConf)));
  }, [actionableGuidance.direction, biasResult.components, regimeResult.isRangeSqueeze, tradeabilityResult.displayStatus, biasResult.ethConfirmation.status]);

  // FIX 10: Data Stale Checks
  const now = Date.now();
  const isTickerStale = (now - feedTimestamps.priceTime) > 60_000;
  const is4HStale = (now - feedTimestamps.klines4HTime) > (8 * 3600_000);
  const is1DStale = (now - feedTimestamps.klines1DTime) > (48 * 3600_000);
  const hasStaleFeed = isTickerStale || is4HStale || is1DStale;

  // Auto-Sync and Server Strategy Reflection (100% Server Authoritative)
  const isAutoSyncActive = Boolean(settings?.autoRegimeStrategySync);
  const currentActiveList = useMemo(() => {
    if (isAutoSyncActive && serverRegime?.targetStrategies !== undefined) {
      return serverRegime.targetStrategies;
    }
    if (Array.isArray(settings?.activeStrategies)) {
      return settings.activeStrategies;
    }
    return settings?.activeStrategy && settings.activeStrategy !== 'NONE' ? [settings.activeStrategy] : [];
  }, [isAutoSyncActive, serverRegime?.targetStrategies, settings?.activeStrategies, settings?.activeStrategy]);
  const [justAppliedMessage, setJustAppliedMessage] = useState<string | null>(null);

  const isAlreadyAligned = useMemo(() => {
    const recStr = [...topStrategyIds].sort().join(',');
    const curStr = [...currentActiveList].sort().join(',');
    return recStr === curStr;
  }, [topStrategyIds, currentActiveList]);

  const handleApplyStrategies = () => {
    if (onUpdateSettings && settings) {
      onUpdateSettings({
        ...settings,
        activeStrategies: topStrategyIds,
        activeStrategy: topStrategyIds[0] as any,
        lastAutoRegimeApplied: regimeResult.primaryRegime,
        lastAutoRegimeSwitchTime: Date.now(),
        autoRegimeStrategySync: false
      });
    }
    setJustAppliedMessage(`Applied: ${topRankedStrategies.map(s => s.strategyName).join(', ')}`);
    setTimeout(() => setJustAppliedMessage(null), 4000);
  };

  const handleToggleAutoSync = (enabled: boolean) => {
    if (!onUpdateSettings || !settings) return;
    onUpdateSettings({
      ...settings,
      autoRegimeStrategySync: enabled,
      lastAutoRegimeApplied: regimeResult.primaryRegime,
      lastAutoRegimeSwitchTime: Date.now()
    });
  };

  return (
    <div className="space-y-5 max-w-7xl mx-auto pb-12 text-gray-200">
      
      {/* ============================================================== */}
      {/* 0. HEADER & DATA FRESHNESS BAR (FIX 10)                        */}
      {/* ============================================================== */}
      <div className="bg-[#12161F] border border-[#232B3B] rounded-xl p-4 sm:p-5 shadow-lg">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Compass className="w-5 h-5 text-cyan-400" />
              <h2 className="text-base sm:text-lg font-bold text-white tracking-wide flex items-center gap-2">
                Market (BTCUSDT)
              </h2>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-cyan-950 text-cyan-300 border border-cyan-500/40">
                Single Source of Truth
              </span>
              {hasStaleFeed && (
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-950/80 text-amber-300 border border-amber-600/60 animate-pulse flex items-center gap-1">
                  <AlertTriangle size={11} /> Feed Stale
                </span>
              )}
            </div>
            <p className="text-xs text-gray-400 max-w-3xl">
              Unified institutional engine: Normalized Layer 1 Direction Bias + Vote-Based Layer 2 Regime Probabilities + Layer 3 Tradeability Gate with Blended Expectancy Portfolio Ranking.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Single Price Source */}
            <div className="bg-[#0E1117] border border-[#232B3B] px-3 py-1.5 rounded-lg text-right">
              <span className="text-[10px] text-gray-400 uppercase font-semibold block">{selectedSymbol} Price</span>
              <span className="text-sm sm:text-base font-bold text-white font-mono">
                ${canonicalPrice.toLocaleString(undefined, { maximumFractionDigits: canonicalPrice < 10 ? 4 : 2 })}
              </span>
            </div>

            {/* Symbol Switcher */}
            <div className="flex items-center bg-[#0E1117] border border-[#232B3B] rounded-lg p-1 text-xs">
              {['BTCUSDT', 'ETHUSDT', 'SOLUSDT'].map(sym => (
                <button
                  key={sym}
                  onClick={() => handleSelectSymbol(sym)}
                  className={`px-2.5 py-1 rounded text-xs font-mono font-bold transition cursor-pointer ${
                    selectedSymbol === sym ? 'bg-cyan-600 text-white' : 'text-gray-400 hover:text-gray-200'
                  }`}
                >
                  {sym.replace('USDT', '')}
                </button>
              ))}
            </div>

            <button
              onClick={() => fetchAllMarketData()}
              disabled={isLoading}
              className="p-2 rounded-lg bg-[#161B22] border border-[#30363D] hover:bg-[#21262D] text-gray-300 transition cursor-pointer"
              title="Refresh closed candle feeds"
            >
              <RefreshCw size={14} className={isLoading ? 'animate-spin text-cyan-400' : ''} />
            </button>
          </div>
        </div>

        {/* Data Freshness Timestamps (FIX 10) */}
        <div className="mt-3 pt-3 border-t border-[#1F2430] flex flex-wrap items-center justify-between text-[11px] text-gray-400 gap-2 font-mono">
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex items-center gap-1">
              <span className={`w-1.5 h-1.5 rounded-full ${isTickerStale ? 'bg-amber-400 animate-ping' : 'bg-emerald-400'}`} />
              <span>Ticker: <b className="text-gray-200">{Math.round((now - feedTimestamps.priceTime) / 1000)}s ago</b></span>
            </span>
            <span className="flex items-center gap-1">
              <span className={`w-1.5 h-1.5 rounded-full ${is4HStale ? 'bg-amber-400' : 'bg-emerald-400'}`} />
              <span>4H Closed Feed: <b className="text-gray-200">{klines4H.length} bars</b></span>
            </span>
            <span className="flex items-center gap-1">
              <span className={`w-1.5 h-1.5 rounded-full ${is1DStale ? 'bg-amber-400' : 'bg-emerald-400'}`} />
              <span>1D Closed Feed: <b className="text-gray-200">{klines1D.length} bars</b></span>
            </span>
            {selectedSymbol && selectedSymbol !== 'BTCUSDT' && (
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-950 text-cyan-300 border border-cyan-500/30">
                Computed on {selectedSymbol}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-950 text-cyan-300 border border-cyan-500/30 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
              Top 100 Coins Breadth
            </span>
            <span className="text-cyan-300/90 font-medium truncate max-w-xl">
              {serverRegime?.breadth?.summary || marketBreadth.summary}
            </span>
          </div>
        </div>
      </div>

      {/* Compact Engine Status Strip */}
      <div className="bg-[#12161F] border border-[#232B3B] rounded-xl px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs font-mono shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="text-gray-400 font-semibold uppercase text-[10px]">Engine (top-100 breadth + BTC):</span>
            <span className="font-bold text-white bg-[#0E1117] border border-[#232B3B] px-2 py-0.5 rounded text-[11px]">
              {serverRegime?.label || serverRegime?.regime || 'Loading...'}
            </span>
            {serverRegime && (serverRegime.regime !== regimeResult.primaryRegime && serverRegime.label !== regimeResult.primaryRegime) && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-950/80 text-amber-300 border border-amber-600/60 flex items-center gap-1">
                differs from engine
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-gray-400 font-semibold uppercase text-[10px]">Tradable:</span>
            {serverRegime?.isTradable ? (
              <span className="text-emerald-400 font-bold bg-emerald-950/50 border border-emerald-500/30 px-2 py-0.5 rounded text-[10px]">
                YES
              </span>
            ) : (
              <span className="text-rose-400 font-bold bg-rose-950/50 border border-rose-500/30 px-2 py-0.5 rounded text-[10px] flex items-center gap-1">
                NO {serverRegime?.notTradableReason && <span className="text-gray-300 font-normal">({serverRegime.notTradableReason})</span>}
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="text-gray-400 font-semibold uppercase text-[10px]">Engine target:</span>
            {(!serverRegime?.targetStrategies || serverRegime.targetStrategies.length === 0) ? (
              <span className="text-rose-400 font-semibold text-[11px] bg-rose-950/40 border border-rose-500/30 px-2 py-0.5 rounded">
                none (OFF) {serverRegime?.notTradableReason ? `(${serverRegime.notTradableReason})` : ''}
              </span>
            ) : (
              <span className="text-amber-300 font-semibold text-[11px] bg-amber-950/40 border border-amber-500/30 px-2 py-0.5 rounded">
                {serverRegime.targetStrategies.join(', ')}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 truncate max-w-md">
            <span className="text-gray-400 font-semibold uppercase text-[10px]">Active:</span>
            {(!serverRegime?.isTradable || (settings?.activeStrategies && settings.activeStrategies.length === 0)) ? (
              <span className="text-rose-400 font-semibold truncate text-[11px] bg-rose-950/50 border border-rose-500/30 px-2 py-0.5 rounded">
                OFF: {serverRegime?.notTradableReason || 'Safety Lockout Active'}
              </span>
            ) : (
              <span className="text-cyan-300 font-semibold truncate text-[11px]">
                {settings?.activeStrategies && settings.activeStrategies.length > 0
                  ? settings.activeStrategies.join(', ')
                  : (settings?.activeStrategy || 'None')}
              </span>
            )}
          </div>

          {/* Sync status badge */}
          {(() => {
            const isSyncOn = Boolean(settings?.autoRegimeStrategySync);
            if (!isSyncOn) {
              return (
                <div className="flex items-center gap-1.5">
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-gray-800 text-gray-300 border border-gray-600">
                    Auto-sync OFF
                  </span>
                  <button
                    onClick={() => onUpdateSettings && onUpdateSettings({ ...settings, autoRegimeStrategySync: true })}
                    className="px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-900/60 text-cyan-300 border border-cyan-500/40 hover:bg-cyan-800/80 cursor-pointer transition"
                  >
                    Turn auto-sync ON
                  </button>
                </div>
              );
            }
            const targetList = serverRegime?.targetStrategies || serverRegime?.breadth?.recommendedStrategies || [];
            const activeList = settings?.activeStrategies || [settings?.activeStrategy || ''];
            const targetStr = [...targetList].filter(Boolean).sort().join(',');
            const activeStr = [...activeList].filter(Boolean).sort().join(',');
            if (targetStr !== activeStr) {
              return (
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-950/90 text-amber-300 border border-amber-500/40 animate-pulse">
                  switching (hysteresis up to 120s)
                </span>
              );
            }
            return null;
          })()}
        </div>
      </div>

      {/* ============================================================== */}
      {/* 1. TOP SUMMARY STRIP (FIX 11)                                  */}
      {/* Direction | Regime (+age, prob) | Top Strategies | Confidence  */}
      {/* ============================================================== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Strip 1: Actionable Direction */}
        <div className="bg-[#12161F] border border-[#232B3B] rounded-xl p-3.5 space-y-1 shadow-sm">
          <div className="flex items-center justify-between text-[11px] font-bold text-gray-400 uppercase tracking-wider">
            <span>Actionable Direction</span>
            {actionableGuidance.direction === 'LONG' ? (
              <ArrowUpRight size={15} className="text-emerald-400" />
            ) : actionableGuidance.direction === 'SHORT' ? (
              <ArrowDownRight size={15} className="text-rose-400" />
            ) : (
              <Scale size={15} className="text-amber-400" />
            )}
          </div>
          <div className={`text-base font-bold font-mono ${
            actionableGuidance.direction === 'LONG' ? 'text-emerald-400' :
            actionableGuidance.direction === 'SHORT' ? 'text-rose-400' :
            actionableGuidance.direction === 'NO_TRADE' ? 'text-rose-300' : 'text-amber-300'
          }`}>
            {actionableGuidance.actionText}
          </div>
          <div className="text-[10px] text-gray-400 truncate">
            {actionableGuidance.detail}
          </div>
        </div>

        {/* Strip 2: Regime + Age + Squeeze */}
        <div className="bg-[#12161F] border border-[#232B3B] rounded-xl p-3.5 space-y-1 shadow-sm">
          <div className="flex items-center justify-between text-[11px] font-bold text-gray-400 uppercase tracking-wider">
            <span>Primary Regime (4H/1H)</span>
            {regimeResult.isRangeSqueeze && (
              <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-purple-950 text-purple-300 border border-purple-500/50">
                SQUEEZE
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-base font-bold text-white font-mono">
              {regimeResult.primaryRegime}
            </span>
            <span className="text-[10px] text-cyan-300 bg-cyan-950/60 px-1.5 py-0.5 rounded font-mono border border-cyan-500/30">
              {regimeResult.regimeAgeDurationStr}
            </span>
            {serverRegime && (serverRegime.regime !== regimeResult.primaryRegime && serverRegime.label !== regimeResult.primaryRegime) && (
              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-950/80 text-amber-300 border border-amber-600/60">
                differs from engine
              </span>
            )}
          </div>
          {/* Mini probability gauge */}
          <div className="w-full bg-[#0E1117] h-1.5 rounded-full overflow-hidden flex gap-0.5 mt-1">
            <div style={{ width: `${(regimeResult.probabilities.TREND_UP + regimeResult.probabilities.TREND_DOWN) * 100}%` }} className="bg-emerald-500" title="Trend" />
            <div style={{ width: `${regimeResult.probabilities.RANGE * 100}%` }} className="bg-cyan-500" title="Range" />
            <div style={{ width: `${regimeResult.probabilities.COMPRESSION * 100}%` }} className="bg-purple-500" title="Compression" />
            <div style={{ width: `${regimeResult.probabilities.TRANSITION * 100}%` }} className="bg-amber-500" title="Transition" />
          </div>
        </div>

        {/* Strip 3: Top Blended Strategies */}
        <div className="bg-[#12161F] border border-[#232B3B] rounded-xl p-3.5 space-y-1 shadow-sm">
          <div className="flex items-center justify-between text-[11px] font-bold text-gray-400 uppercase tracking-wider">
            <span>Top Blended Strategy</span>
            <span className="text-emerald-400 text-xs font-mono font-bold">
              +{topRankedStrategies[0]?.blendedExpectancyR.toFixed(2)}R
            </span>
          </div>
          <div className="text-sm font-bold text-white truncate font-mono">
            {topRankedStrategies[0]?.strategyName || CANONICAL_STRATEGIES[0]?.name || 'Volatility Compression Breakout (VCB)'}
          </div>
          <div className="text-[10px] text-gray-400 truncate">
            {topRankedStrategies[1] ? `Rank 2: ${topRankedStrategies[1].strategyName} (+${topRankedStrategies[1].blendedExpectancyR.toFixed(2)}R)` : 'Standby / Single Portfolio'}
          </div>
        </div>

        {/* Strip 4: Agreement Confidence */}
        <div className="bg-[#12161F] border border-[#232B3B] rounded-xl p-3.5 space-y-1 shadow-sm">
          <div className="flex items-center justify-between text-[11px] font-bold text-gray-400 uppercase tracking-wider">
            <span>Confluence Confidence</span>
            <span className="text-[10px] text-gray-400 font-mono">Layer 1-3</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-base font-bold font-mono ${
              confidenceScore >= 70 ? 'text-emerald-400' : confidenceScore >= 50 ? 'text-amber-400' : 'text-rose-400'
            }`}>
              {confidenceScore}%
            </span>
            <span className="text-[10px] text-gray-400">
              ({biasResult.components.filter(c => c.score !== 0).length}/7 rows aligned)
            </span>
          </div>
          <div className="w-full bg-[#0E1117] h-1.5 rounded-full overflow-hidden">
            <div 
              className={`h-full transition-all ${
                confidenceScore >= 70 ? 'bg-emerald-500' : confidenceScore >= 50 ? 'bg-amber-500' : 'bg-rose-500'
              }`}
              style={{ width: `${confidenceScore}%` }}
            />
          </div>
        </div>
      </div>

      {/* ============================================================== */}
      {/* 2. AUTO-SELECTED PORTFOLIO & BUCKET CARD (FIX 7 IDENTICAL)     */}
      {/* ============================================================== */}
      <div className="bg-[#12161F] border border-cyan-500/30 rounded-xl p-4 sm:p-5 shadow-lg space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#232B3B] pb-3">
          <div>
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-cyan-400" />
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                Optimal Blended Portfolio &amp; Bucket Strategies ({regimeResult.primaryRegime})
              </h3>
            </div>
            <p className="text-xs text-gray-400 mt-0.5">
              Ranked from pure blended empirical expectancy (Σ P(regime) × shrunk Expectancy). Both Auto-Selected and Bucket cards match this one source.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => handleToggleAutoSync(!isAutoSyncActive)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition cursor-pointer flex items-center gap-1.5 ${
                isAutoSyncActive
                  ? 'bg-cyan-950 text-cyan-300 border-cyan-500/60'
                  : 'bg-[#161B22] text-gray-400 border-[#30363D]'
              }`}
            >
              <span>Auto-Sync: {isAutoSyncActive ? 'ON' : 'OFF'}</span>
            </button>
            <button
              onClick={handleApplyStrategies}
              disabled={isAlreadyAligned || isAutoSyncActive}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                isAutoSyncActive
                  ? 'bg-gray-900 text-gray-500 border border-gray-800 cursor-not-allowed'
                  : isAlreadyAligned
                  ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-700/60 cursor-default'
                  : 'bg-cyan-600 hover:bg-cyan-500 text-white shadow cursor-pointer'
              }`}
              title={isAutoSyncActive ? 'Auto-sync is ON: strategy activation is managed automatically by the engine' : undefined}
            >
              {isAutoSyncActive ? <Lock size={13} /> : (isAlreadyAligned ? <Check size={13} /> : <Zap size={13} />)}
              <span>{isAutoSyncActive ? 'Managed by Auto-Sync' : (isAlreadyAligned ? 'Portfolio Aligned' : 'Apply Portfolio')}</span>
            </button>
          </div>
        </div>

        {justAppliedMessage && (
          <div className="p-2.5 rounded bg-emerald-950/70 border border-emerald-500/60 text-xs text-emerald-300 flex items-center gap-2">
            <CheckCircle2 size={14} />
            <span>{justAppliedMessage}</span>
          </div>
        )}

        {/* 3 Ranked Strategies Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {topRankedStrategies.map((strat, idx) => {
            const isInstalled = CANONICAL_STRATEGIES.some(s => s.id === strat.bucketStrategyId);
            const isCurrentlyActive = isAutoSyncActive
              ? (serverRegime?.targetStrategies || []).includes(strat.bucketStrategyId)
              : currentActiveList.includes(strat.bucketStrategyId);

            return (
              <div 
                key={strat.bucketStrategyId}
                className={`p-3.5 rounded-xl border transition ${
                  isCurrentlyActive
                    ? 'bg-[#151C28] border-cyan-500/50 shadow-md'
                    : 'bg-[#0E1117] border-[#232B3B]'
                }`}
              >
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="font-mono text-cyan-400 font-bold">Rank #{strat.rank}</span>
                  <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${
                    isCurrentlyActive
                      ? 'bg-emerald-950 text-emerald-300 border border-emerald-600/50'
                      : 'bg-gray-800 text-gray-400'
                  }`}>
                    {isCurrentlyActive ? (isAutoSyncActive ? 'ACTIVE (AUTO-SYNC)' : 'ACTIVE IN BOT') : 'STANDBY'}
                  </span>
                </div>

                <div className="font-bold text-white text-xs sm:text-sm line-clamp-1 mb-1">
                  {strat.strategyName}
                </div>

                <div className="flex items-center justify-between text-xs font-mono mt-2 pt-2 border-t border-[#1F2430]">
                  <div>
                    <span className="text-[10px] text-gray-400 block">Blended Exp</span>
                    <span className="text-emerald-400 font-bold">+{strat.blendedExpectancyR.toFixed(2)}R</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-gray-400 block">Win Rate</span>
                    <span className="text-gray-200">{strat.winRatePct}%</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-gray-400 block">Sample n</span>
                    <span className={strat.isReliable ? 'text-gray-200' : 'text-amber-400'}>
                      {strat.totalTrades} {strat.isReliable ? '✓' : '(Unreliable)'}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ============================================================== */}
      {/* 3. KEY LEVELS & RANGE ZONES CARD (FIX 8 & 10)                  */}
      {/* ============================================================== */}
      <div className="bg-[#12161F] border border-[#232B3B] rounded-xl p-4 sm:p-5 space-y-3 shadow-lg">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#232B3B] pb-2">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-cyan-400" />
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              Range Reference Levels &amp; Action Zones ({selectedSymbol})
            </h3>
            <span className="text-[10px] px-2 py-0.2 rounded bg-[#0E1117] text-gray-400 border border-[#232B3B] font-mono">
              Ref: {biasResult.keyLevels.rangeReferenceType}
            </span>
          </div>
          <div className="text-xs font-mono text-gray-300">
            Anchor Price: <b className="text-white">${canonicalPrice.toLocaleString(undefined, { maximumFractionDigits: canonicalPrice < 10 ? 4 : 2 })}</b>
          </div>
        </div>

        {/* 5 Levels Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center text-xs">
          <div className="bg-[#0E1117] border border-[#232B3B] p-2 rounded-lg">
            <span className="text-[10px] text-gray-400 block">Daily Open (DO)</span>
            <span className="text-xs font-bold text-white font-mono block mt-0.5">${biasResult.keyLevels.dailyOpen.toFixed(1)}</span>
            <span className={`text-[9px] font-bold ${canonicalPrice >= biasResult.keyLevels.dailyOpen ? 'text-emerald-400' : 'text-rose-400'}`}>
              {canonicalPrice >= biasResult.keyLevels.dailyOpen ? 'Above DO' : 'Below DO'}
            </span>
          </div>

          <div className="bg-[#0E1117] border border-[#232B3B] p-2 rounded-lg">
            <span className="text-[10px] text-gray-400 block">Weekly Open (WO)</span>
            <span className="text-xs font-bold text-white font-mono block mt-0.5">${biasResult.keyLevels.weeklyOpen.toFixed(1)}</span>
            <span className={`text-[9px] font-bold ${canonicalPrice >= biasResult.keyLevels.weeklyOpen ? 'text-emerald-400' : 'text-rose-400'}`}>
              {canonicalPrice >= biasResult.keyLevels.weeklyOpen ? 'Above WO' : 'Below WO'}
            </span>
          </div>

          <div className="bg-[#0E1117] border border-[#232B3B] p-2 rounded-lg">
            <span className="text-[10px] text-gray-400 block">Range High ({biasResult.keyLevels.rangeReferenceType})</span>
            <span className="text-xs font-bold text-cyan-300 font-mono block mt-0.5">${biasResult.keyLevels.rangeHigh.toFixed(1)}</span>
            <span className="text-[9px] text-gray-400">Resistance Zone</span>
          </div>

          <div className="bg-[#0E1117] border border-[#232B3B] p-2 rounded-lg">
            <span className="text-[10px] text-gray-400 block">Range Low ({biasResult.keyLevels.rangeReferenceType})</span>
            <span className="text-xs font-bold text-amber-300 font-mono block mt-0.5">${biasResult.keyLevels.rangeLow.toFixed(1)}</span>
            <span className="text-[9px] text-gray-400">Support Zone</span>
          </div>

          <div className="bg-[#0E1117] border border-[#232B3B] p-2 rounded-lg col-span-2 sm:col-span-1">
            <span className="text-[10px] text-gray-400 block">24H VWAP</span>
            <span className="text-xs font-bold text-purple-300 font-mono block mt-0.5">${biasResult.keyLevels.vwap.toFixed(1)}</span>
            <span className={`text-[9px] font-bold ${canonicalPrice >= biasResult.keyLevels.vwap ? 'text-emerald-400' : 'text-rose-400'}`}>
              {canonicalPrice >= biasResult.keyLevels.vwap ? 'Institutional Premium' : 'Discount'}
            </span>
          </div>
        </div>

        {/* Range Position Progress Bar */}
        <div className="space-y-1 pt-1">
          <div className="flex justify-between text-[10px] text-gray-400 font-mono">
            <span>Support (0-25%: Long)</span>
            <span>Chop (25-75%: No Trade)</span>
            <span>Resistance (75-100%: Short)</span>
          </div>
          <div className="relative w-full h-3 bg-[#0E1117] rounded-full overflow-hidden border border-[#232B3B] flex">
            <div className="w-1/4 bg-emerald-950/50 border-r border-[#232B3B]" />
            <div className="w-2/4 bg-gray-900 border-r border-[#232B3B]" />
            <div className="w-1/4 bg-rose-950/50" />
            {/* Position Pointer */}
            <div 
              className="absolute top-0 bottom-0 w-2 bg-cyan-400 shadow-md transform -translate-x-1"
              style={{ left: `${biasResult.keyLevels.rangePositionPct}%` }}
              title={`Current Position: ${biasResult.keyLevels.rangePositionPct.toFixed(1)}%`}
            />
          </div>
          <div className="text-right text-[10px] font-mono text-cyan-300">
            Position in Range: <b>{biasResult.keyLevels.rangePositionPct.toFixed(1)}%</b>
          </div>
        </div>
      </div>

      {/* ============================================================== */}
      {/* 4. COLLAPSIBLE DEEP DIVES: LAYERS 1, 2, 3, MATRIX & CHECKLIST  */}
      {/* ============================================================== */}

      {/* DEEP DIVE 1: LAYER 1 DIRECTION BIAS & 4H SLOPES (FIX 1 & 3) */}
      <div className="bg-[#12161F] border border-[#232B3B] rounded-xl overflow-hidden shadow-lg">
        <button
          onClick={() => toggleSection('layer1')}
          className="w-full p-4 flex items-center justify-between bg-[#151C28] hover:bg-[#182130] transition cursor-pointer text-left"
        >
          <div className="flex items-center gap-2">
            <Compass className="w-4 h-4 text-cyan-400" />
            <h3 className="text-xs sm:text-sm font-bold text-white uppercase tracking-wider">
              Layer 1: Direction Bias &amp; 4H Slopes (Merged Gate 5)
            </h3>
            <span className={`px-2 py-0.5 rounded text-xs font-mono font-bold ${
              biasResult.totalScore >= 18 ? 'bg-emerald-950 text-emerald-300 border border-emerald-600/50' :
              biasResult.totalScore <= -18 ? 'bg-rose-950 text-rose-300 border border-rose-600/50' :
              'bg-amber-950 text-amber-300 border border-amber-600/50'
            }`}>
              Score: {biasResult.totalScore >= 0 ? `+${biasResult.totalScore}` : biasResult.totalScore} / 100 ({biasResult.label})
            </span>
          </div>
          {openSections.layer1 ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>

        {openSections.layer1 && (
          <div className="p-4 sm:p-5 space-y-4">
            <div className="text-xs text-gray-400">
              Normalized formula: <code className="text-cyan-300 font-mono">clamp(Σ(score_i × weight_i) / Σ(weight_i) × 100, -100, 100)</code>. Raw weighted sum: {biasResult.rawSum} / Total weight: {biasResult.sumWeights}.
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[#232B3B] text-[10px] text-gray-400 uppercase font-mono">
                    <th className="py-2 px-3">Component</th>
                    <th className="py-2 px-2">TF</th>
                    <th className="py-2 px-2">Weight</th>
                    <th className="py-2 px-2">Score</th>
                    <th className="py-2 px-3">Live Analysis &amp; Signed Slopes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1F2430]">
                  {biasResult.components.map((c, idx) => (
                    <tr key={idx} className="hover:bg-[#161B22]/50 transition">
                      <td className="py-2.5 px-3 font-semibold text-gray-200">{c.name}</td>
                      <td className="py-2.5 px-2 font-mono text-cyan-400">{c.timeframe}</td>
                      <td className="py-2.5 px-2 font-mono text-gray-400">{c.weight}%</td>
                      <td className="py-2.5 px-2">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                          c.score === 1 ? 'bg-emerald-950 text-emerald-300 border border-emerald-700/50' :
                          c.score === -1 ? 'bg-rose-950 text-rose-300 border border-rose-700/50' :
                          'bg-gray-800 text-gray-300'
                        }`}>
                          {c.score === 1 ? '+1' : c.score === -1 ? '-1' : '0'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-gray-300 font-mono text-[11px]">{c.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* DEEP DIVE 2: LAYER 2 VOTE-BASED REGIME & PROBABILITIES (FIX 4) */}
      <div className="bg-[#12161F] border border-[#232B3B] rounded-xl overflow-hidden shadow-lg">
        <button
          onClick={() => toggleSection('layer2')}
          className="w-full p-4 flex items-center justify-between bg-[#151C28] hover:bg-[#182130] transition cursor-pointer text-left"
        >
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-cyan-400" />
            <h3 className="text-xs sm:text-sm font-bold text-white uppercase tracking-wider">
              Layer 2: Vote-Based Regime Classifier &amp; Probabilities
            </h3>
            <span className="px-2 py-0.5 rounded text-xs font-mono font-bold bg-indigo-950 text-indigo-300 border border-indigo-500/50">
              {regimeResult.primaryRegime} (Argmax)
            </span>
            {regimeResult.isRangeSqueeze && (
              <span className="px-2 py-0.5 rounded text-xs font-bold bg-purple-950 text-purple-300 border border-purple-500/60 animate-pulse">
                🎯 RANGE_SQUEEZE
              </span>
            )}
          </div>
          {openSections.layer2 ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>

        {openSections.layer2 && (
          <div className="p-4 sm:p-5 space-y-4">
            {/* Probability Stack Bar */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs font-mono text-gray-300">
                <span>Normalized Vote Probabilities:</span>
                <span>Age: <b>{regimeResult.regimeAgeDurationStr}</b></span>
              </div>
              <div className="w-full h-4 bg-[#0E1117] rounded-lg overflow-hidden flex font-mono text-[10px] text-white font-bold">
                {regimeResult.probabilities.TREND_UP > 0 && (
                  <div 
                    style={{ width: `${regimeResult.probabilities.TREND_UP * 100}%` }}
                    className="bg-emerald-600 flex items-center justify-center truncate px-1"
                    title={`Trend Up: ${(regimeResult.probabilities.TREND_UP * 100).toFixed(1)}%`}
                  >
                    Up {(regimeResult.probabilities.TREND_UP * 100).toFixed(0)}%
                  </div>
                )}
                {regimeResult.probabilities.TREND_DOWN > 0 && (
                  <div 
                    style={{ width: `${regimeResult.probabilities.TREND_DOWN * 100}%` }}
                    className="bg-rose-600 flex items-center justify-center truncate px-1"
                    title={`Trend Down: ${(regimeResult.probabilities.TREND_DOWN * 100).toFixed(1)}%`}
                  >
                    Down {(regimeResult.probabilities.TREND_DOWN * 100).toFixed(0)}%
                  </div>
                )}
                {regimeResult.probabilities.RANGE > 0 && (
                  <div 
                    style={{ width: `${regimeResult.probabilities.RANGE * 100}%` }}
                    className="bg-cyan-600 flex items-center justify-center truncate px-1"
                    title={`Range: ${(regimeResult.probabilities.RANGE * 100).toFixed(1)}%`}
                  >
                    Range {(regimeResult.probabilities.RANGE * 100).toFixed(0)}%
                  </div>
                )}
                {regimeResult.probabilities.COMPRESSION > 0 && (
                  <div 
                    style={{ width: `${regimeResult.probabilities.COMPRESSION * 100}%` }}
                    className="bg-purple-600 flex items-center justify-center truncate px-1"
                    title={`Compression: ${(regimeResult.probabilities.COMPRESSION * 100).toFixed(1)}%`}
                  >
                    Comp {(regimeResult.probabilities.COMPRESSION * 100).toFixed(0)}%
                  </div>
                )}
                {regimeResult.probabilities.EXPANSION > 0 && (
                  <div 
                    style={{ width: `${regimeResult.probabilities.EXPANSION * 100}%` }}
                    className="bg-amber-600 flex items-center justify-center truncate px-1"
                    title={`Expansion: ${(regimeResult.probabilities.EXPANSION * 100).toFixed(1)}%`}
                  >
                    Exp {(regimeResult.probabilities.EXPANSION * 100).toFixed(0)}%
                  </div>
                )}
                {regimeResult.probabilities.TRANSITION > 0 && (
                  <div 
                    style={{ width: `${regimeResult.probabilities.TRANSITION * 100}%` }}
                    className="bg-gray-600 flex items-center justify-center truncate px-1"
                    title={`Transition: ${(regimeResult.probabilities.TRANSITION * 100).toFixed(1)}%`}
                  >
                    Trans {(regimeResult.probabilities.TRANSITION * 100).toFixed(0)}%
                  </div>
                )}
              </div>
            </div>

            {/* Metric Breakdown Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[#232B3B] text-[10px] text-gray-400 uppercase font-mono">
                    <th className="py-2 px-3">Metric</th>
                    <th className="py-2 px-2">Value</th>
                    <th className="py-2 px-2">Trend Vote</th>
                    <th className="py-2 px-2">Range Vote</th>
                    <th className="py-2 px-2">Compression Vote</th>
                    <th className="py-2 px-2">Current Vote</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1F2430]">
                  {regimeResult.metricBreakdown.map((m, idx) => (
                    <tr key={idx} className="hover:bg-[#161B22]/50 transition">
                      <td className="py-2 px-3 font-semibold text-gray-200">{m.name}</td>
                      <td className="py-2 px-2 font-mono text-cyan-400 font-bold">{m.displayValue}</td>
                      <td className="py-2 px-2 text-gray-400 text-[11px]">{m.trendCondition}</td>
                      <td className="py-2 px-2 text-gray-400 text-[11px]">{m.rangeCondition}</td>
                      <td className="py-2 px-2 text-gray-400 text-[11px]">{m.compressionCondition}</td>
                      <td className="py-2 px-2">
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-[#161B22] text-white border border-[#30363D]">
                          {m.currentMatch}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* DEEP DIVE 3: LAYER 3 TRADEABILITY GATE & SINGLE FEE (FIX 5 & 6) */}
      <div className="bg-[#12161F] border border-[#232B3B] rounded-xl overflow-hidden shadow-lg">
        <button
          onClick={() => toggleSection('layer3')}
          className="w-full p-4 flex items-center justify-between bg-[#151C28] hover:bg-[#182130] transition cursor-pointer text-left"
        >
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-cyan-400" />
            <h3 className="text-xs sm:text-sm font-bold text-white uppercase tracking-wider">
              Layer 3: Tradeability Gate &amp; Single Fee Truth
            </h3>
            <span className={`px-2 py-0.5 rounded text-xs font-mono font-bold ${
              tradeabilityResult.displayStatus === 'UNGATED' ? 'bg-amber-950 text-amber-300 border border-amber-500/60' :
              tradeabilityResult.displayStatus === 'TRADABLE' ? 'bg-emerald-950 text-emerald-300 border border-emerald-600/50' :
              tradeabilityResult.displayStatus === 'CAUTION' ? 'bg-amber-950 text-amber-300 border border-amber-600/50' :
              'bg-rose-950 text-rose-300 border border-rose-600/50'
            }`}>
              {tradeabilityResult.displayStatus}
            </span>
          </div>
          {openSections.layer3 ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>

        {openSections.layer3 && (
          <div className="p-4 sm:p-5 space-y-4">
            {/* Status Honesty Box (FIX 6) */}
            {tradeabilityResult.isBypassed && (
              <div className="p-3 rounded-lg bg-amber-950/40 border border-amber-500/50 text-xs text-amber-300 flex items-start gap-2">
                <AlertTriangle size={15} className="shrink-0 mt-0.5" />
                <div>
                  <b className="font-bold">STATUS HONESTY: UNGATED MODE ACTIVE</b>
                  <p className="mt-0.5">{tradeabilityResult.wouldSay} ({tradeabilityResult.wouldReason})</p>
                </div>
              </div>
            )}

            {/* Fee drag metrics */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div className="bg-[#0E1117] border border-[#232B3B] p-3 rounded-lg">
                <span className="text-[10px] text-gray-400 block font-semibold">Round-Trip Fee %</span>
                <span className="text-sm font-bold text-white font-mono block mt-1">
                  {tradeabilityResult.roundTripFeePct.toFixed(3)}%
                </span>
                <span className="text-[9px] text-gray-400 block mt-0.5 font-mono">
                  {tradeabilityResult.feeBreakdown.formula}
                </span>
              </div>

              <div className="bg-[#0E1117] border border-[#232B3B] p-3 rounded-lg">
                <span className="text-[10px] text-gray-400 block font-semibold">Typical Stop Distance</span>
                <span className="text-sm font-bold text-cyan-300 font-mono block mt-1">
                  {tradeabilityResult.typicalStopDistancePct.toFixed(3)}%
                </span>
                <span className="text-[9px] text-gray-400 block mt-0.5 font-mono">
                  1.5 × Median 1H ATR%
                </span>
              </div>

              <div className="bg-[#0E1117] border border-[#232B3B] p-3 rounded-lg">
                <span className="text-[10px] text-gray-400 block font-semibold">Fee Drag Share of 1R</span>
                <span className={`text-sm font-bold font-mono block mt-1 ${
                  tradeabilityResult.feeDragShareOf1R <= 15 ? 'text-emerald-400' : 'text-rose-400'
                }`}>
                  {tradeabilityResult.feeDragShareOf1R.toFixed(1)}%
                </span>
                <span className="text-[9px] text-gray-400 block mt-0.5 font-mono">
                  Threshold: &le; {settings.maxFeeDragPctOf1R ?? 15.0}%
                </span>
              </div>

              <div className="bg-[#0E1117] border border-[#232B3B] p-3 rounded-lg">
                <span className="text-[10px] text-gray-400 block font-semibold">Spread Status</span>
                <span className={`text-sm font-bold font-mono block mt-1 ${
                  tradeabilityResult.isSpreadSafe ? 'text-emerald-400' : 'text-rose-400'
                }`}>
                  {tradeabilityResult.spreadPct.toFixed(3)}%
                </span>
                <span className="text-[9px] text-gray-400 block mt-0.5 font-mono">
                  {tradeabilityResult.spreadBps} bps (Safe &le; 0.15%)
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* DEEP DIVE 4: REGIME X STRATEGY MATRIX (FIX 7 BLENDED & SHRUNK) */}
      <div className="bg-[#12161F] border border-[#232B3B] rounded-xl overflow-hidden shadow-lg">
        <button
          onClick={() => toggleSection('matrix')}
          className="w-full p-4 flex items-center justify-between bg-[#151C28] hover:bg-[#182130] transition cursor-pointer text-left"
        >
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-cyan-400" />
            <h3 className="text-xs sm:text-sm font-bold text-white uppercase tracking-wider">
              Regime × Strategy Matrix (6 Canonical Strategies)
            </h3>
            <span className="px-2 py-0.5 rounded text-xs font-mono font-bold bg-cyan-950 text-cyan-300 border border-cyan-500/40">
              Shrinkage Estimator: E × n / (n + 20)
            </span>
          </div>
          {openSections.matrix ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>

        {openSections.matrix && (
          <div className="p-4 sm:p-5 space-y-4">
            <div className="flex items-center justify-between text-xs text-gray-400 border-b border-[#232B3B] pb-2">
              <span>Pure empirical backtest and closed-candle trade log cells. Cells with n &lt; {settings.matrixMinSampleCount ?? 30} marked UNRELIABLE.</span>
              <span className="px-2 py-0.5 rounded bg-[#0E1117] text-gray-400 border border-[#232B3B] text-[10px] font-mono">
                SAMPLE DATA BADGE ACTIVE
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[#232B3B] text-[10px] text-gray-400 uppercase font-mono">
                    <th className="py-2 px-3">Canonical Strategy</th>
                    <th className="py-2 px-2">Regime</th>
                    <th className="py-2 px-2">Raw Exp (R)</th>
                    <th className="py-2 px-2">Shrunk Exp (R)</th>
                    <th className="py-2 px-2">Win Rate</th>
                    <th className="py-2 px-2">Trade Count</th>
                    <th className="py-2 px-2">Sample Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1F2430]">
                  {strategyMatrix.map((cell, idx) => (
                    <tr key={idx} className={`hover:bg-[#161B22]/50 transition ${cell.regime === regimeResult.primaryRegime ? 'bg-cyan-950/20' : ''}`}>
                      <td className="py-2.5 px-3 font-semibold text-gray-200">{cell.strategyName}</td>
                      <td className="py-2.5 px-2 font-mono text-cyan-400">{cell.regime}</td>
                      <td className="py-2.5 px-2 font-mono text-gray-300">{cell.expectancyR >= 0 ? `+${cell.expectancyR.toFixed(2)}` : cell.expectancyR.toFixed(2)}R</td>
                      <td className="py-2.5 px-2 font-mono font-bold text-emerald-400">
                        {cell.shrunkExpectancyR >= 0 ? `+${cell.shrunkExpectancyR.toFixed(2)}` : cell.shrunkExpectancyR.toFixed(2)}R
                      </td>
                      <td className="py-2.5 px-2 font-mono text-gray-300">{cell.winRatePct}%</td>
                      <td className="py-2.5 px-2 font-mono text-gray-400">{cell.tradeCount}</td>
                      <td className="py-2.5 px-2">
                        {cell.isUnreliable ? (
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-950 text-amber-300 border border-amber-600/50">
                            UNRELIABLE (n&lt;30)
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-cyan-950 text-cyan-300 border border-cyan-600/40">
                            SAMPLE DATA
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* DEEP DIVE 5: PRE-TRADE CHECKLIST */}
      <div className="bg-[#12161F] border border-[#232B3B] rounded-xl overflow-hidden shadow-lg">
        <button
          onClick={() => toggleSection('checklist')}
          className="w-full p-4 flex items-center justify-between bg-[#151C28] hover:bg-[#182130] transition cursor-pointer text-left"
        >
          <div className="flex items-center gap-2">
            <CheckSquare className="w-4 h-4 text-cyan-400" />
            <h3 className="text-xs sm:text-sm font-bold text-white uppercase tracking-wider">
              Pre-Trade Execution Checklist
            </h3>
          </div>
          {openSections.checklist ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>

        {openSections.checklist && (
          <div className="p-4 sm:p-5 space-y-2.5 text-xs text-gray-300">
            {[
              { id: 'step1', title: '1. Layer 1 Bias Aligned', desc: 'Normalized bias score >= +18 for Long or <= -18 for Short.' },
              { id: 'step2', title: '2. Layer 2 Regime Identified', desc: 'Argmax regime confirmed with 2 closed candle hysteresis.' },
              { id: 'step3', title: '3. Layer 3 Fee Drag Safe', desc: 'Fee drag share of 1R is <= 15% (or gate bypassed with caution).' },
              { id: 'step4', title: '4. Action Zone Verified', desc: 'Price not located in middle 50% chop zone.' },
              { id: 'step5', title: '5. Blended Strategy Matched', desc: 'Setup belongs to optimal ranked portfolio.' }
            ].map(item => (
              <div 
                key={item.id} 
                onClick={() => toggleChecklist(item.id)}
                className="flex items-start gap-3 p-2.5 rounded-lg bg-[#0E1117] border border-[#232B3B] hover:border-[#30363D] transition cursor-pointer"
              >
                <div className="mt-0.5">
                  {checklist[item.id] ? (
                    <CheckSquare size={16} className="text-emerald-400" />
                  ) : (
                    <Square size={16} className="text-gray-500" />
                  )}
                </div>
                <div>
                  <b className={checklist[item.id] ? 'text-white font-bold' : 'text-gray-300'}>{item.title}</b>
                  <p className="text-[11px] text-gray-400 mt-0.5">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}

export default RegimeVisualizer;
