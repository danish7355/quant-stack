import React, { useState, useEffect, useMemo } from 'react';
import { 
  Compass, TrendingUp, TrendingDown, Activity, AlertTriangle, ShieldCheck, 
  ShieldAlert, RefreshCw, Zap, CheckCircle2, ArrowUpRight, 
  ArrowDownRight, Scale, Info, CheckSquare, Square,
  Clock, Flame, Layers, Lock, ChevronRight, BarChart3,
  Calendar, Percent, DollarSign, Database, Check
} from 'lucide-react';
import { CoinDetail, AppSettings } from '../types';
import { formatPrice } from '../utils/format';
import {
  KlineBar,
  FourHourRegime,
  VolatilityState,
  TradeabilityStatus,
  evaluateDirectionBias,
  evaluateRegimeLayer2,
  evaluateTradeabilityLayer3,
  getRecommendedRegimeDirection,
  buildRegimeStrategyMatrix,
  REGIME_STRATEGY_MAP,
  DirectionBiasResult,
  RegimeResultLayer2,
  TradeabilityResultLayer3,
  StrategyMatrixCell
} from '../utils/regimeEngine';

interface Props {
  coins: CoinDetail[];
  settings: AppSettings;
  onUpdateSettings?: (settings: AppSettings) => void;
  onSelectStrategy?: (strategy: string) => void;
  onSetMultipleStrategies?: (strategies: string[]) => void;
  accountBalance?: number;
}

export function RegimeVisualizer({
  coins,
  settings,
  onUpdateSettings,
  onSelectStrategy,
  onSetMultipleStrategies,
  accountBalance = 1000
}: Props) {
  // Selected Anchor Symbol (BTCUSDT is institutional benchmark anchor)
  const [selectedSymbol, setSelectedSymbol] = useState<string>('BTCUSDT');
  const [activeTab, setActiveTab] = useState<'OVERVIEW' | 'LAYER1_BIAS' | 'LAYER2_REGIME' | 'LAYER3_TRADEABILITY' | 'MATRIX' | 'CHECKLIST'>('OVERVIEW');

  // Klines & Live Feeds (Updated on closed candles)
  const [klines1D, setKlines1D] = useState<KlineBar[]>([]);
  const [klines4H, setKlines4H] = useState<KlineBar[]>([]);
  const [klines1H, setKlines1H] = useState<KlineBar[]>([]);
  const [ethKlines4H, setEthKlines4H] = useState<KlineBar[]>([]);
  const [fundingHistory, setFundingHistory] = useState<number[]>([]);
  const [currentFundingRate, setCurrentFundingRate] = useState<number>(0.0001);
  const [openInterestData, setOpenInterestData] = useState<{ timestamp: number; oi: number; price: number }[]>([]);
  const [signalAudits, setSignalAudits] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<number>(Date.now());

  // Interactive Checklist
  const [checklist, setChecklist] = useState<{ [key: string]: boolean }>(() => {
    try {
      const saved = localStorage.getItem('coindcx_regime_checklist');
      if (saved) return JSON.parse(saved);
    } catch {}
    return { step1: false, step2: false, step3: false, step4: false, step5: false };
  });

  const toggleChecklist = (stepKey: string) => {
    setChecklist(prev => {
      const updated = { ...prev, [stepKey]: !prev[stepKey] };
      try {
        localStorage.setItem('coindcx_regime_checklist', JSON.stringify(updated));
      } catch {}
      return updated;
    });
  };

  const resetChecklist = () => {
    const cleared = { step1: false, step2: false, step3: false, step4: false, step5: false };
    setChecklist(cleared);
    try {
      localStorage.setItem('coindcx_regime_checklist', JSON.stringify(cleared));
    } catch {}
  };

  // Find selected coin in current live coins array
  const currentCoin = useMemo(() => {
    return coins.find(c => c.symbol === selectedSymbol) || coins.find(c => c.symbol === 'BTCUSDT') || coins[0];
  }, [coins, selectedSymbol]);

  // Compute Top-30 Breadth (% above 4H EMA50)
  const top30BreadthPct = useMemo(() => {
    if (!coins || coins.length === 0) return 55;
    const sorted = [...coins].slice(0, 30);
    let aboveCount = 0;
    for (const c of sorted) {
      if (c.price && c.indicators?.emaTrend && c.price > c.indicators.emaTrend) {
        aboveCount++;
      } else if (c.change24h > 0) {
        aboveCount++;
      }
    }
    return sorted.length > 0 ? (aboveCount / sorted.length) * 100 : 55;
  }, [coins]);

  // Fetch Multi-Timeframe Data (1D, 4H, 1H for BTC; 4H for ETH; Funding; Open Interest; Audits)
  const fetchAllMarketData = async () => {
    setIsLoading(true);
    try {
      // 1. Fetch 1D BTC Klines (limit=200)
      const res1D = await fetch('/api/binance/proxy?path=/fapi/v1/klines&symbol=BTCUSDT&interval=1d&limit=200');
      if (res1D.ok) {
        const raw = await res1D.json();
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
        }
      }

      // 2. Fetch 4H BTC Klines (limit=120) with taker volumes
      const res4H = await fetch('/api/binance/proxy?path=/fapi/v1/klines&symbol=BTCUSDT&interval=4h&limit=120');
      if (res4H.ok) {
        const raw = await res4H.json();
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
        }
      }

      // 3. Fetch 1H BTC Klines (limit=100)
      const res1H = await fetch('/api/binance/proxy?path=/fapi/v1/klines&symbol=BTCUSDT&interval=1h&limit=100');
      if (res1H.ok) {
        const raw = await res1H.json();
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
      }

      // 4. Fetch 4H ETH Klines (limit=60 for confirmation)
      const resEth = await fetch('/api/binance/proxy?path=/fapi/v1/klines&symbol=ETHUSDT&interval=4h&limit=60');
      if (resEth.ok) {
        const raw = await resEth.json();
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
      }

      // 5. Fetch 30-Day Funding History for Percentile
      const resFund = await fetch('/api/binance/proxy?path=/fapi/v1/fundingRate&symbol=BTCUSDT&limit=90');
      if (resFund.ok) {
        const raw = await resFund.json();
        if (Array.isArray(raw) && raw.length > 0) {
          const rates = raw.map((r: any) => parseFloat(r.fundingRate || '0'));
          setFundingHistory(rates);
          setCurrentFundingRate(rates[rates.length - 1] || 0.0001);
        }
      }

      // 6. Fetch Open Interest History
      const resOI = await fetch('/api/binance/proxy?path=/futures/data/openInterestHist&symbol=BTCUSDT&period=4h&limit=30');
      if (resOI.ok) {
        const raw = await resOI.json();
        if (Array.isArray(raw) && raw.length > 0) {
          setOpenInterestData(raw.map((item: any) => ({
            timestamp: item.timestamp,
            oi: parseFloat(item.sumOpenInterest || '0'),
            price: parseFloat(item.sumOpenInterestValue || '0') / Math.max(1, parseFloat(item.sumOpenInterest || '1'))
          })));
        }
      }

      // 7. Fetch Signal Audit Logs for Matrix Expectancy
      const resAudit = await fetch('/api/signal_audit?limit=200');
      if (resAudit.ok) {
        const audits = await resAudit.json();
        if (Array.isArray(audits)) {
          setSignalAudits(audits);
        }
      }

      setLastRefreshedAt(Date.now());
    } catch (e) {
      console.warn('[RegimeVisualizer] Fetch error:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAllMarketData();
    const interval = setInterval(fetchAllMarketData, 45000); // 45s periodic refresh
    return () => clearInterval(interval);
  }, []);

  // Sync live coin funding if available
  useEffect(() => {
    if (currentCoin && typeof currentCoin.fundingRate === 'number') {
      setCurrentFundingRate(currentCoin.fundingRate);
    }
  }, [currentCoin]);

  // Execute Layer 1: Direction Bias
  const biasResult: DirectionBiasResult = useMemo(() => {
    return evaluateDirectionBias(
      klines1D,
      klines4H,
      ethKlines4H,
      fundingHistory,
      currentFundingRate,
      openInterestData,
      top30BreadthPct
    );
  }, [klines1D, klines4H, ethKlines4H, fundingHistory, currentFundingRate, openInterestData, top30BreadthPct]);

  // Execute Layer 2: Regime (4H confirmed by 1H)
  const regimeResult: RegimeResultLayer2 = useMemo(() => {
    return evaluateRegimeLayer2(klines4H, klines1H);
  }, [klines4H, klines1H]);

  // Execute Layer 3: Tradeability Gate
  const tradeabilityResult: TradeabilityResultLayer3 = useMemo(() => {
    const spreadBps = (currentCoin && currentCoin.spreadBps) ? currentCoin.spreadBps : 1.8;
    return evaluateTradeabilityLayer3(klines1H, spreadBps, Date.now());
  }, [klines1H, currentCoin]);

  // Execute Strategy Matrix Expectancy
  const strategyMatrix: StrategyMatrixCell[] = useMemo(() => {
    return buildRegimeStrategyMatrix(regimeResult.primaryRegime, signalAudits);
  }, [regimeResult.primaryRegime, signalAudits]);

  // Top 2-3 Strategies by Matrix Expectancy for Current Regime
  const topStrategiesForRegime = useMemo(() => {
    const currentRegimeCells = strategyMatrix.filter(c => c.regime === regimeResult.primaryRegime);
    currentRegimeCells.sort((a, b) => b.expectancyR - a.expectancyR);
    return currentRegimeCells.slice(0, 3);
  }, [strategyMatrix, regimeResult.primaryRegime]);

  // Resolve the actual executable bucket strategy IDs recognized by AutoTrader
  const recommendedBucketStrategyIds = useMemo(() => {
    const ids = topStrategiesForRegime.map(s => s.bucketStrategyId).filter(Boolean);
    const unique = Array.from(new Set(ids));
    return unique.length > 0 ? unique : ['COIL_BREAKOUT'];
  }, [topStrategiesForRegime]);

  // Evaluate recommended trade direction based on Layer 1 Bias + Layer 2 Regime
  const dirEval = useMemo(() => {
    return getRecommendedRegimeDirection(biasResult, regimeResult);
  }, [biasResult, regimeResult]);

  // Auto-Sync and Manual Activation Handling
  const isAutoSyncActive = Boolean(settings.autoRegimeStrategySync);
  const currentActiveList = settings.activeStrategies || [settings.activeStrategy || ''];
  const [justAppliedMessage, setJustAppliedMessage] = useState<string | null>(null);

  const isAlreadyAligned = useMemo(() => {
    return (
      recommendedBucketStrategyIds.length === currentActiveList.length &&
      recommendedBucketStrategyIds.every(s => currentActiveList.includes(s))
    );
  }, [recommendedBucketStrategyIds, currentActiveList]);

  // Stability Guard: 10-minute cooldown
  const SWITCH_COOLDOWN_MS = 10 * 60 * 1000;
  const timeSinceLastSwitch = Date.now() - (settings.lastAutoRegimeSwitchTime || 0);
  const isCooldownLocked = Boolean(settings.lastAutoRegimeSwitchTime && timeSinceLastSwitch < SWITCH_COOLDOWN_MS);
  const cooldownRemainingMin = Math.max(0, Math.ceil((SWITCH_COOLDOWN_MS - timeSinceLastSwitch) / 60000));

  // Auto Strategy Activation (Aligns with genuine bucket strategies)
  useEffect(() => {
    if (!settings.autoRegimeStrategySync) return;
    if (isAlreadyAligned) return;
    if (isCooldownLocked) return;
    if (recommendedBucketStrategyIds.length === 0) return;

    const now = Date.now();
    console.log(`⚡ [AutoRegimeSync] Activating canonical bucket strategies: [${recommendedBucketStrategyIds.join(', ')}] for regime: ${regimeResult.primaryRegime}`);

    if (onSetMultipleStrategies) {
      onSetMultipleStrategies(recommendedBucketStrategyIds);
    }

    if (onUpdateSettings && settings) {
      onUpdateSettings({
        ...settings,
        activeStrategies: recommendedBucketStrategyIds,
        activeStrategy: recommendedBucketStrategyIds[0] as any,
        lastAutoRegimeApplied: regimeResult.primaryRegime,
        lastAutoRegimeSwitchTime: now
      });
    }

    fetch('/api/bot/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        activeStrategies: recommendedBucketStrategyIds,
        activeStrategy: recommendedBucketStrategyIds[0],
        lastAutoRegimeApplied: regimeResult.primaryRegime,
        lastAutoRegimeSwitchTime: now
      })
    }).catch(() => {});
  }, [regimeResult.primaryRegime, settings.autoRegimeStrategySync, isAlreadyAligned, recommendedBucketStrategyIds, isCooldownLocked]);

  const handleApplyStrategies = () => {
    const now = Date.now();
    if (onSetMultipleStrategies) {
      onSetMultipleStrategies(recommendedBucketStrategyIds);
    }
    if (onUpdateSettings && settings) {
      onUpdateSettings({
        ...settings,
        activeStrategies: recommendedBucketStrategyIds,
        activeStrategy: recommendedBucketStrategyIds[0] as any,
        lastAutoRegimeApplied: regimeResult.primaryRegime,
        lastAutoRegimeSwitchTime: now
      });
    }
    setJustAppliedMessage(`Activated: ${recommendedBucketStrategyIds.join(', ')}`);
    setTimeout(() => setJustAppliedMessage(null), 4000);

    fetch('/api/bot/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        activeStrategies: recommendedBucketStrategyIds,
        activeStrategy: recommendedBucketStrategyIds[0],
        lastAutoRegimeApplied: regimeResult.primaryRegime,
        lastAutoRegimeSwitchTime: now
      })
    }).catch(() => {});
  };

  const handleToggleAutoSync = (enabled: boolean) => {
    const now = Date.now();
    const updated = enabled ? recommendedBucketStrategyIds : currentActiveList;
    const newSettings = {
      ...settings,
      autoRegimeStrategySync: enabled,
      ...(enabled ? {
        activeStrategies: updated,
        activeStrategy: updated[0] as any,
        lastAutoRegimeApplied: regimeResult.primaryRegime,
        lastAutoRegimeSwitchTime: now
      } : {})
    };
    if (enabled && onSetMultipleStrategies) {
      onSetMultipleStrategies(updated);
    }
    if (onUpdateSettings) {
      onUpdateSettings(newSettings);
    }
    fetch('/api/bot/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newSettings)
    }).catch(() => {});
  };

  const isLayer3Enabled = settings.layer3TradeabilityGateEnabled !== false;

  const handleToggleLayer3Gate = (enabled: boolean) => {
    const newSettings = {
      ...settings,
      layer3TradeabilityGateEnabled: enabled
    };
    if (onUpdateSettings) {
      onUpdateSettings(newSettings);
    }
    fetch('/api/bot/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...newSettings,
        layer3TradeabilityGateEnabled: enabled
      })
    }).catch(() => {});
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16 font-mono text-gray-200">
      
      {/* ============================================================== */}
      {/* 1. TOP CARD: SINGLE LINE SUMMARY & KEY INVALIDATION LEVELS    */}
      {/* ============================================================== */}
      <div className="bg-[#161B22] border border-[#30363D] rounded-2xl p-5 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none"></div>

        {/* Header Title with Anchor and Sync State */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-4 border-b border-[#30363D] relative z-10">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-950 text-cyan-300 border border-cyan-800 uppercase tracking-widest flex items-center gap-1">
                <Compass size={12} className="text-cyan-400" /> Three-Layer Institutional Engine
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-950 text-indigo-300 border border-indigo-800 uppercase tracking-wider">
                BTC Anchor · ETH Confirmation
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-gray-800 text-gray-300 border border-gray-700">
                Closed Candles Only
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-extrabold text-white flex items-center gap-2">
              Market Regime & Tradeability Visualizer
            </h2>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={fetchAllMarketData}
              disabled={isLoading}
              className="px-3 py-1.5 bg-[#21262D] hover:bg-[#30363D] text-gray-300 rounded-lg text-xs font-bold border border-[#30363D] flex items-center gap-1.5 transition cursor-pointer"
            >
              <RefreshCw size={13} className={isLoading ? 'animate-spin text-cyan-400' : ''} />
              <span>{isLoading ? 'Syncing...' : 'Refresh Feed'}</span>
            </button>
            <span className="text-[11px] text-gray-500">
              {new Date(lastRefreshedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          </div>
        </div>

        {/* --- REGIME TRADE DIRECTION ENFORCEMENT BANNER --- */}
        <div className={`mt-3 p-3 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
          dirEval.recommendedDirection === 'LONG'
            ? 'bg-gradient-to-r from-emerald-950/60 via-[#161B22] to-[#161B22] border-emerald-500/40 text-emerald-200'
            : 'bg-gradient-to-r from-rose-950/60 via-[#161B22] to-[#161B22] border-rose-500/40 text-rose-200'
        }`}>
          <div className="flex items-start sm:items-center gap-3">
            <div className={`p-2 rounded-lg shrink-0 mt-0.5 sm:mt-0 ${
              dirEval.recommendedDirection === 'LONG'
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                : 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
            }`}>
              {dirEval.recommendedDirection === 'LONG' ? <TrendingUp size={20} /> : <TrendingDown size={20} />}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs uppercase font-bold tracking-wider text-gray-300">
                  REGIME RECOMMENDED DIRECTION:
                </span>
                <span className={`text-xs font-extrabold px-2 py-0.5 rounded font-mono ${
                  dirEval.recommendedDirection === 'LONG'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                }`}>
                  {dirEval.recommendedDirection} ONLY
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-500/40 font-bold uppercase tracking-wider">
                  STRICT FILTER ENFORCED
                </span>
              </div>
              <p className="text-xs text-gray-300 mt-1 leading-relaxed">
                <strong>Enforcement Rule:</strong> {dirEval.reason}. Autonomous trade execution will <strong>ONLY open {dirEval.recommendedDirection} trades</strong>. Opposing signals will be automatically vetoed at Gate 4.
              </p>
            </div>
          </div>
        </div>

        {/* --- THE MASTER ONE-LINE EXECUTIVE SUMMARY --- */}
        <div className="py-4 my-2 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 border-b border-[#30363D]">
          {/* Item 1: Bias Score */}
          <div className="bg-[#0E1117] border border-[#30363D] rounded-xl p-3">
            <span className="text-[10px] uppercase font-bold text-gray-400 block tracking-wider">1. Direction Bias</span>
            <div className="flex items-center gap-2 mt-1">
              <span className={`text-sm font-extrabold ${biasResult.totalScore > 0 ? 'text-emerald-400' : biasResult.totalScore < 0 ? 'text-rose-400' : 'text-gray-300'}`}>
                {biasResult.totalScore > 0 ? `+${biasResult.totalScore}` : biasResult.totalScore}
              </span>
              <span className="text-xs font-bold text-white px-2 py-0.5 rounded bg-gray-800 truncate" title={biasResult.conflictLabel}>
                {biasResult.conflictLabel}
              </span>
            </div>
            <span className="text-[10px] text-gray-400 mt-1 block font-sans truncate">
              {biasResult.ethConfirmation.status === 'CONFIRMED' ? '✔ ETH Confirmed' : '⚠ ETH Divergence'}
            </span>
          </div>

          {/* Item 2: Regime & Age */}
          <div className="bg-[#0E1117] border border-[#30363D] rounded-xl p-3">
            <span className="text-[10px] uppercase font-bold text-gray-400 block tracking-wider">2. Regime & Age</span>
            <div className="flex items-center gap-1.5 mt-1">
              <span className={`text-sm font-extrabold px-2 py-0.5 rounded ${
                regimeResult.primaryRegime === 'TREND' ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/40' :
                regimeResult.primaryRegime === 'RANGE' ? 'bg-amber-950 text-amber-300 border border-amber-500/40' :
                regimeResult.primaryRegime === 'COMPRESSION' ? 'bg-purple-950 text-purple-300 border border-purple-500/40' :
                'bg-rose-950 text-rose-300 border border-rose-500/40'
              }`}>
                {regimeResult.primaryRegime} (4H)
              </span>
            </div>
            <span className="text-[10px] text-cyan-300 mt-1 block font-mono">
              Age: {regimeResult.regimeAgeDurationStr} · {regimeResult.trendStage}
            </span>
          </div>

          {/* Item 3: Volatility State */}
          <div className="bg-[#0E1117] border border-[#30363D] rounded-xl p-3">
            <span className="text-[10px] uppercase font-bold text-gray-400 block tracking-wider">3. Volatility State</span>
            <div className="text-sm font-extrabold text-white mt-1 flex items-center gap-1.5">
              <Activity size={14} className={regimeResult.volatilityState === 'EXPANSION' ? 'text-rose-400 animate-pulse' : regimeResult.volatilityState === 'COMPRESSION' ? 'text-purple-400' : 'text-cyan-400'} />
              <span>{regimeResult.volatilityState}</span>
            </div>
            <span className="text-[10px] text-gray-400 mt-1 block font-sans">
              BBW {regimeResult.metrics.bbBandwidthPercentile.toFixed(0)}th %ile · ATR {regimeResult.metrics.atrPercentile.toFixed(0)}th
            </span>
          </div>

          {/* Item 4: Tradeability Gate */}
          <div className={`border rounded-xl p-3 ${
            !isLayer3Enabled
              ? 'bg-[#0E1117] border-gray-700'
              : tradeabilityResult.isLowEdgeDay 
              ? 'bg-rose-950/40 border-rose-500/50' 
              : 'bg-[#0E1117] border-[#30363D]'
          }`}>
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-bold text-gray-400 block tracking-wider">4. Tradeability</span>
              <button
                type="button"
                onClick={() => handleToggleLayer3Gate(!isLayer3Enabled)}
                className={`text-[9px] font-bold px-1.5 py-0.5 rounded cursor-pointer transition ${
                  isLayer3Enabled ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-gray-800 text-gray-400 border border-gray-600'
                }`}
                title="Click to toggle Layer 3 Gate ON / OFF"
              >
                {isLayer3Enabled ? 'GATE: ON' : 'GATE: OFF'}
              </button>
            </div>
            <div className="flex items-center gap-1.5 mt-1">
              <span className={`text-xs font-extrabold px-2 py-0.5 rounded ${
                !isLayer3Enabled
                  ? 'bg-gray-800 text-gray-300 border border-gray-600'
                  : tradeabilityResult.isLowEdgeDay 
                  ? 'bg-rose-900 text-rose-200 animate-pulse' 
                  : 'bg-emerald-950 text-emerald-300 border border-emerald-500/30'
              }`}>
                {!isLayer3Enabled ? 'BYPASSED (OFF)' : tradeabilityResult.isLowEdgeDay ? 'LOW EDGE DAY' : 'HIGH EDGE'}
              </span>
            </div>
            <span className="text-[10px] text-gray-400 mt-1 block font-mono truncate">
              {!isLayer3Enabled ? `Permissive (Drag: ${tradeabilityResult.feeDragShareOf1R.toFixed(1)}%)` : `Fee Drag: ${tradeabilityResult.feeDragShareOf1R.toFixed(1)}% of 1R`}
            </span>
          </div>

          {/* Item 5: Top 2-3 Strategies by Matrix Expectancy */}
          <div className="col-span-2 sm:col-span-1 bg-[#0E1117] border border-[#30363D] rounded-xl p-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-bold text-cyan-400 block tracking-wider">Bucket Strategy</span>
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-indigo-950 text-indigo-300 font-mono font-bold border border-indigo-500/30">
                {recommendedBucketStrategyIds[0] || 'COIL_BREAKOUT'}
              </span>
            </div>
            <div className="space-y-0.5 mt-1.5">
              {topStrategiesForRegime.slice(0, 2).map((s, idx) => (
                <div key={idx} className="text-[11px] font-bold text-gray-200 flex items-center justify-between">
                  <span className="truncate pr-1 text-gray-300">{s.strategyName}</span>
                  <span className="text-emerald-400 shrink-0 font-mono">+{s.expectancyR.toFixed(2)}R</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* --- KEY INVALIDATION & ANCHOR LEVELS --- */}
        <div className="pt-2">
          <div className="flex items-center justify-between text-xs font-bold text-gray-400 mb-2">
            <span className="flex items-center gap-1.5 text-gray-300">
              <Layers size={13} className="text-cyan-400" /> Key Invalidation & Bias Anchor Levels (BTC/USDT)
            </span>
            <span className="text-[11px] text-gray-400 font-mono">
              Current: <b className="text-white">${biasResult.keyLevels.currentPrice.toFixed(2)}</b>
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center text-xs">
            {/* Daily Open */}
            <div className="bg-[#0E1117] border border-[#30363D] p-2 rounded-lg">
              <span className="text-[10px] text-gray-400 block font-semibold">Daily Open (DO)</span>
              <span className="text-xs font-bold text-white font-mono block mt-0.5">
                ${biasResult.keyLevels.dailyOpen.toFixed(1)}
              </span>
              <span className={`text-[10px] font-bold ${biasResult.keyLevels.currentPrice >= biasResult.keyLevels.dailyOpen ? 'text-emerald-400' : 'text-rose-400'}`}>
                {biasResult.keyLevels.currentPrice >= biasResult.keyLevels.dailyOpen ? 'Holding Above' : 'Holding Below'}
              </span>
            </div>

            {/* Weekly Open */}
            <div className="bg-[#0E1117] border border-[#30363D] p-2 rounded-lg">
              <span className="text-[10px] text-gray-400 block font-semibold">Weekly Open (WO)</span>
              <span className="text-xs font-bold text-white font-mono block mt-0.5">
                ${biasResult.keyLevels.weeklyOpen.toFixed(1)}
              </span>
              <span className={`text-[10px] font-bold ${biasResult.keyLevels.currentPrice >= biasResult.keyLevels.weeklyOpen ? 'text-emerald-400' : 'text-rose-400'}`}>
                {biasResult.keyLevels.currentPrice >= biasResult.keyLevels.weeklyOpen ? 'Holding Above' : 'Holding Below'}
              </span>
            </div>

            {/* Prior-Day High */}
            <div className="bg-[#0E1117] border border-[#30363D] p-2 rounded-lg">
              <span className="text-[10px] text-gray-400 block font-semibold">Prior-Day High (PDH)</span>
              <span className="text-xs font-bold text-cyan-300 font-mono block mt-0.5">
                ${biasResult.keyLevels.priorDayHigh.toFixed(1)}
              </span>
              <span className="text-[10px] text-gray-400">
                {biasResult.keyLevels.currentPrice > biasResult.keyLevels.priorDayHigh ? 'Swept / Above' : 'Resistance Pivot'}
              </span>
            </div>

            {/* Prior-Day Low */}
            <div className="bg-[#0E1117] border border-[#30363D] p-2 rounded-lg">
              <span className="text-[10px] text-gray-400 block font-semibold">Prior-Day Low (PDL)</span>
              <span className="text-xs font-bold text-amber-300 font-mono block mt-0.5">
                ${biasResult.keyLevels.priorDayLow.toFixed(1)}
              </span>
              <span className="text-[10px] text-gray-400">
                {biasResult.keyLevels.currentPrice < biasResult.keyLevels.priorDayLow ? 'Swept / Below' : 'Support Invalidation'}
              </span>
            </div>

            {/* 24H VWAP */}
            <div className="bg-[#0E1117] border border-[#30363D] p-2 rounded-lg col-span-2 sm:col-span-1">
              <span className="text-[10px] text-gray-400 block font-semibold">24H VWAP</span>
              <span className="text-xs font-bold text-purple-300 font-mono block mt-0.5">
                ${biasResult.keyLevels.vwap.toFixed(1)}
              </span>
              <span className={`text-[10px] font-bold ${biasResult.keyLevels.currentPrice >= biasResult.keyLevels.vwap ? 'text-emerald-400' : 'text-rose-400'}`}>
                {biasResult.keyLevels.currentPrice >= biasResult.keyLevels.vwap ? 'Institutional Premium' : 'Institutional Discount'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ============================================================== */}
      {/* NAVIGATION TABS: THE 3 DECOUPLED LAYERS + MATRIX + CHECKLIST   */}
      {/* ============================================================== */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#30363D] pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setActiveTab('OVERVIEW')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'OVERVIEW'
                ? 'bg-cyan-600 text-white shadow-md'
                : 'bg-[#161B22] text-gray-400 hover:text-gray-200 border border-[#30363D]'
            }`}
          >
            <Compass size={13} /> Complete 3-Layer Deck
          </button>
          <button
            onClick={() => setActiveTab('LAYER1_BIAS')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'LAYER1_BIAS'
                ? 'bg-cyan-600 text-white shadow-md'
                : 'bg-[#161B22] text-gray-400 hover:text-gray-200 border border-[#30363D]'
            }`}
          >
            <span>Layer 1: Direction Bias</span>
          </button>
          <button
            onClick={() => setActiveTab('LAYER2_REGIME')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'LAYER2_REGIME'
                ? 'bg-cyan-600 text-white shadow-md'
                : 'bg-[#161B22] text-gray-400 hover:text-gray-200 border border-[#30363D]'
            }`}
          >
            <span>Layer 2: Regime (4H/1H)</span>
          </button>
          <button
            onClick={() => setActiveTab('LAYER3_TRADEABILITY')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'LAYER3_TRADEABILITY'
                ? 'bg-cyan-600 text-white shadow-md'
                : 'bg-[#161B22] text-gray-400 hover:text-gray-200 border border-[#30363D]'
            }`}
          >
            <span>Layer 3: Tradeability Gate</span>
            <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${
              isLayer3Enabled ? 'bg-emerald-500/20 text-emerald-300' : 'bg-gray-700 text-gray-300'
            }`}>
              {isLayer3Enabled ? 'ON' : 'OFF'}
            </span>
          </button>
          <button
            onClick={() => setActiveTab('MATRIX')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'MATRIX'
                ? 'bg-cyan-600 text-white shadow-md'
                : 'bg-[#161B22] text-gray-400 hover:text-gray-200 border border-[#30363D]'
            }`}
          >
            <BarChart3 size={13} /> Regime × Strategy Matrix
          </button>
          <button
            onClick={() => setActiveTab('CHECKLIST')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'CHECKLIST'
                ? 'bg-cyan-600 text-white shadow-md'
                : 'bg-[#161B22] text-gray-400 hover:text-gray-200 border border-[#30363D]'
            }`}
          >
            <CheckSquare size={13} /> Pre-Session Gate
          </button>
        </div>

        {/* Strategy Auto-Sync Controls */}
        <div className="flex items-center gap-2">
          {justAppliedMessage && (
            <span className="text-[11px] font-bold text-emerald-400 bg-emerald-950/80 border border-emerald-500/40 px-2 py-1 rounded font-mono">
              ✔ {justAppliedMessage}
            </span>
          )}
          <button
            onClick={handleApplyStrategies}
            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold shadow-md transition cursor-pointer flex items-center gap-1"
          >
            <Zap size={12} /> Apply Regime Strategies
          </button>
          <button
            onClick={() => handleToggleAutoSync(!isAutoSyncActive)}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border transition cursor-pointer ${
              isAutoSyncActive
                ? 'bg-cyan-950 text-cyan-300 border-cyan-500/60'
                : 'bg-[#161B22] text-gray-400 border-[#30363D]'
            }`}
          >
            Auto-Sync: {isAutoSyncActive ? 'ON' : 'OFF'}
          </button>
        </div>
      </div>

      {/* ============================================================== */}
      {/* LAYER 1: DIRECTION BIAS (1D and 4H)                            */}
      {/* ============================================================== */}
      {(activeTab === 'OVERVIEW' || activeTab === 'LAYER1_BIAS') && (
        <div className="bg-[#161B22] border border-[#30363D] rounded-xl p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-[#30363D] gap-2">
            <div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse"></span>
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                  Layer 1: Direction Bias (1D & 4H Structure)
                </h3>
              </div>
              <p className="text-xs text-gray-400 mt-0.5">
                Answers one question: <i>Which direction has macro edge right now?</i> Updates only on closed candles.
              </p>
            </div>

            {/* Total Bias Score Gauge */}
            <div className="flex items-center gap-3">
              <div className="text-right">
                <span className="text-[10px] text-gray-400 uppercase font-semibold block">Net Weighted Bias</span>
                <span className={`text-base font-extrabold ${biasResult.totalScore > 0 ? 'text-emerald-400' : biasResult.totalScore < 0 ? 'text-rose-400' : 'text-gray-300'}`}>
                  {biasResult.totalScore > 0 ? `+${biasResult.totalScore}` : biasResult.totalScore} / 100
                </span>
              </div>
              <div className="w-24 bg-gray-800 h-3 rounded-full overflow-hidden border border-gray-700 relative">
                <div 
                  className={`h-full transition-all duration-500 ${biasResult.totalScore >= 0 ? 'bg-emerald-500' : 'bg-rose-500'}`}
                  style={{ width: `${Math.abs(biasResult.totalScore)}%` }}
                ></div>
              </div>
            </div>
          </div>

          {/* Conflict Surface Banner */}
          <div className="p-3 rounded-lg bg-[#0E1117] border border-cyan-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <Info size={16} className="text-cyan-400 shrink-0" />
              <div>
                <span className="text-gray-300">Market Consensus State: </span>
                <span className="text-cyan-300 font-extrabold font-mono text-sm">{biasResult.conflictLabel}</span>
                <span className="text-[11px] text-gray-400 block mt-0.5">
                  Conflicts are never averaged away. If structure is bullish but derivatives indicate crowded longs, execution flags squeeze risk.
                </span>
              </div>
            </div>
            <div className="px-3 py-1 rounded bg-[#161B22] border border-[#30363D] text-[11px] shrink-0 font-mono">
              <span className="text-gray-400">ETH Confirmation: </span>
              <span className={biasResult.ethConfirmation.status === 'CONFIRMED' ? 'text-emerald-400 font-bold' : 'text-amber-400 font-bold'}>
                {biasResult.ethConfirmation.status}
              </span>
            </div>
          </div>

          {/* 7 Parameter Evaluation Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border border-[#30363D] rounded-lg">
              <thead className="bg-[#0E1117] text-gray-400 uppercase text-[10px] tracking-wider border-b border-[#30363D]">
                <tr>
                  <th className="py-2.5 px-3">Parameter</th>
                  <th className="py-2.5 px-2">TF</th>
                  <th className="py-2.5 px-2">Bullish Criterion</th>
                  <th className="py-2.5 px-2">Bearish Criterion</th>
                  <th className="py-2.5 px-3">Live Condition & Observation</th>
                  <th className="py-2.5 px-2 text-center">Score</th>
                  <th className="py-2.5 px-2 text-right">Weight</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#30363D] bg-[#161B22]">
                {biasResult.components.map((comp, idx) => (
                  <tr key={idx} className="hover:bg-[#1C2128] transition">
                    <td className="py-2.5 px-3 font-bold text-white flex items-center gap-1.5">
                      <span>{comp.name}</span>
                    </td>
                    <td className="py-2.5 px-2 font-mono text-cyan-400">{comp.timeframe}</td>
                    <td className="py-2.5 px-2 text-gray-400 text-[11px]">{comp.bullishCriterion}</td>
                    <td className="py-2.5 px-2 text-gray-400 text-[11px]">{comp.bearishCriterion}</td>
                    <td className="py-2.5 px-3 font-mono text-gray-200">{comp.detail}</td>
                    <td className="py-2.5 px-2 text-center">
                      <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                        comp.score === 1 ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/40' :
                        comp.score === -1 ? 'bg-rose-950 text-rose-300 border border-rose-500/40' :
                        'bg-gray-800 text-gray-300 border border-gray-700'
                      }`}>
                        {comp.score === 1 ? '+1' : comp.score === -1 ? '-1' : '0'}
                      </span>
                    </td>
                    <td className="py-2.5 px-2 text-right font-mono text-gray-400 font-bold">
                      {comp.weight}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* LAYER 2: REGIME (4H confirmed by 1H)                           */}
      {/* ============================================================== */}
      {(activeTab === 'OVERVIEW' || activeTab === 'LAYER2_REGIME') && (
        <div className="bg-[#161B22] border border-[#30363D] rounded-xl p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-[#30363D] gap-2">
            <div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-purple-400 animate-pulse"></span>
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                  Layer 2: Regime Classification (4H Confirmed by 1H)
                </h3>
              </div>
              <p className="text-xs text-gray-400 mt-0.5">
                Answers one question: <i>How does price travel (trend vs range vs compression vs expansion)?</i>
              </p>
            </div>

            {/* 2-Consecutive Closed Candle Anti-Flicker Rule Status */}
            <div className="flex items-center gap-2">
              <span className={`px-2.5 py-1 rounded text-[11px] font-bold border flex items-center gap-1.5 ${
                regimeResult.isConsecutivelyConfirmed 
                  ? 'bg-emerald-950 text-emerald-300 border-emerald-500/40' 
                  : 'bg-amber-950 text-amber-300 border-amber-500/40'
              }`}>
                <CheckCircle2 size={13} />
                <span>{regimeResult.isConsecutivelyConfirmed ? '2-Candle Hysteresis Locked' : 'Provisional Transition'}</span>
              </span>
              <span className="px-2.5 py-1 rounded text-[11px] font-bold bg-[#0E1117] border border-[#30363D] text-cyan-300 font-mono">
                Regime Age: {regimeResult.regimeAgeDurationStr}
              </span>
            </div>
          </div>

          {/* Regime Badges & Stage Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-[#0E1117] border border-[#30363D] p-3 rounded-xl">
              <span className="text-[10px] uppercase font-bold text-gray-400 block tracking-wider">Primary 4H Regime</span>
              <div className="text-lg font-extrabold text-white mt-1 flex items-center gap-2">
                <span className="text-cyan-400 font-mono">{regimeResult.primaryRegime}</span>
              </div>
              <span className="text-[10px] text-gray-400 mt-1 block">
                Stage: <b className="text-cyan-300">{regimeResult.trendStage}</b> ({regimeResult.regimeAgeBars} bars on 4H)
              </span>
            </div>

            <div className="bg-[#0E1117] border border-[#30363D] p-3 rounded-xl">
              <span className="text-[10px] uppercase font-bold text-gray-400 block tracking-wider">Confirming 1H Regime</span>
              <div className="text-lg font-extrabold text-white mt-1 flex items-center gap-2">
                <span className="text-purple-400 font-mono">{regimeResult.confirmingRegime1H}</span>
              </div>
              <span className="text-[10px] text-gray-400 mt-1 block">
                {regimeResult.confirmingRegime1H === regimeResult.primaryRegime 
                  ? '✔ 1H aligns perfectly with 4H structural state' 
                  : '⚠ 1H shows local divergence from 4H primary'}
              </span>
            </div>

            <div className="bg-[#0E1117] border border-[#30363D] p-3 rounded-xl">
              <span className="text-[10px] uppercase font-bold text-gray-400 block tracking-wider">Anti-Flicker Rule</span>
              <div className="text-xs font-mono text-gray-300 mt-1">
                A regime flips strictly after <b>two consecutive closed 4H candles</b> meet its criteria to prevent false whipsaws.
              </div>
              <span className="text-[10px] text-emerald-400 mt-1 block">
                Active & Enforced
              </span>
            </div>
          </div>

          {/* Technical Regime Thresholds Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border border-[#30363D] rounded-lg">
              <thead className="bg-[#0E1117] text-gray-400 uppercase text-[10px] tracking-wider border-b border-[#30363D]">
                <tr>
                  <th className="py-2.5 px-3">Metric</th>
                  <th className="py-2.5 px-2 text-cyan-300 font-bold">Trend</th>
                  <th className="py-2.5 px-2 text-amber-300 font-bold">Range</th>
                  <th className="py-2.5 px-2 text-purple-300 font-bold">Compression</th>
                  <th className="py-2.5 px-2 text-rose-300 font-bold">Expansion / Climax</th>
                  <th className="py-2.5 px-3 text-right">Current Live 4H Value</th>
                  <th className="py-2.5 px-2 text-center">Match</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#30363D] bg-[#161B22]">
                {regimeResult.metricBreakdown.map((m, idx) => (
                  <tr key={idx} className="hover:bg-[#1C2128] transition">
                    <td className="py-2.5 px-3 font-bold text-white">{m.name}</td>
                    <td className="py-2.5 px-2 text-gray-300 font-mono">{m.trendCondition}</td>
                    <td className="py-2.5 px-2 text-gray-300 font-mono">{m.rangeCondition}</td>
                    <td className="py-2.5 px-2 text-gray-300 font-mono">{m.compressionCondition}</td>
                    <td className="py-2.5 px-2 text-gray-300 font-mono">{m.expansionCondition}</td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-cyan-300">
                      {m.displayValue}
                    </td>
                    <td className="py-2.5 px-2 text-center">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#0E1117] border border-[#30363D] text-white font-mono">
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

      {/* ============================================================== */}
      {/* LAYER 3: TRADEABILITY GATE (FEES & LIQUIDITY MATTER)          */}
      {/* ============================================================== */}
      {(activeTab === 'OVERVIEW' || activeTab === 'LAYER3_TRADEABILITY') && (
        <div className="bg-[#161B22] border border-[#30363D] rounded-xl p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-[#30363D] gap-2">
            <div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                  Layer 3: Tradeability Gate (Fee Drag & Liquidity)
                </h3>
              </div>
              <p className="text-xs text-gray-400 mt-0.5">
                Answers one question: <i>Do market volatility & exchange fee math leave enough edge to trade?</i>
              </p>
            </div>

            <div className="flex items-center gap-3">
              {/* Layer 3 Gate Enforce Toggle */}
              <div className="flex items-center gap-2 bg-[#0E1117] border border-[#30363D] px-2.5 py-1 rounded-lg">
                <span className="text-[11px] font-semibold text-gray-300">Gate Filter:</span>
                <button
                  type="button"
                  onClick={() => handleToggleLayer3Gate(!isLayer3Enabled)}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    isLayer3Enabled ? 'bg-emerald-500' : 'bg-gray-700'
                  }`}
                  role="switch"
                  aria-checked={isLayer3Enabled}
                  title={isLayer3Enabled ? 'Click to Turn Off Layer 3 Gate' : 'Click to Turn On Layer 3 Gate'}
                >
                  <span
                    aria-hidden="true"
                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                      isLayer3Enabled ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </button>
                <span className={`text-[10px] font-bold ${isLayer3Enabled ? 'text-emerald-400' : 'text-gray-400'}`}>
                  {isLayer3Enabled ? 'ENFORCED (ON)' : 'BYPASSED (OFF)'}
                </span>
              </div>

              <span className={`px-3 py-1 rounded text-xs font-extrabold border ${
                !isLayer3Enabled
                  ? 'bg-gray-800 text-gray-400 border-gray-600'
                  : tradeabilityResult.isLowEdgeDay 
                  ? 'bg-rose-950 text-rose-300 border-rose-500/50 animate-pulse' 
                  : 'bg-emerald-950 text-emerald-300 border-emerald-500/50'
              }`}>
                {!isLayer3Enabled ? 'BYPASSED' : tradeabilityResult.status.replace(/_/g, ' ')}
              </span>
            </div>
          </div>

          {/* LOW EDGE DAY WARNING BANNER */}
          {tradeabilityResult.isLowEdgeDay && (
            <div className={`p-4 rounded-xl border flex items-start gap-3 ${
              isLayer3Enabled ? 'bg-rose-950/40 border-rose-500/60' : 'bg-amber-950/30 border-amber-500/40'
            }`}>
              <AlertTriangle className={isLayer3Enabled ? 'text-rose-400 shrink-0 mt-0.5' : 'text-amber-400 shrink-0 mt-0.5'} size={20} />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h4 className={`text-sm font-extrabold uppercase tracking-wide ${isLayer3Enabled ? 'text-rose-300' : 'text-amber-300'}`}>
                    {isLayer3Enabled ? 'LOW EDGE DAY — EXECUTION LOCK ACTIVE' : 'LOW EDGE DAY DETECTED — GATE BYPASSED BY USER'}
                  </h4>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                    isLayer3Enabled ? 'bg-rose-500/20 text-rose-300 border-rose-500/30' : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                  }`}>
                    {isLayer3Enabled ? 'NEW TRADES BLOCKED' : 'ENTRIES PERMITTED (PERMISSIVE)'}
                  </span>
                </div>
                <p className="text-xs text-gray-300 mt-1">
                  {tradeabilityResult.lowEdgeReason}
                </p>
                <div className="mt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <p className="text-[11px] text-gray-400">
                    {isLayer3Enabled 
                      ? 'Rule: When fee drag exceeds 15% of 1R stop distance, edge bleeds into exchange taker fees. Turn gate OFF to trade anyway.'
                      : 'Notice: Layer 3 Tradeability Gate is turned OFF. The trading bot will proceed to execute setups regardless of fee drag.'}
                  </p>
                  <button
                    type="button"
                    onClick={() => handleToggleLayer3Gate(!isLayer3Enabled)}
                    className="text-xs px-3 py-1 rounded font-bold transition cursor-pointer shrink-0 border border-gray-600 bg-gray-800 hover:bg-gray-700 text-gray-200"
                  >
                    {isLayer3Enabled ? 'Bypass Gate (Allow Trades)' : 'Enable Gate Protection'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Fee Drag & Volatility Math Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Round-Trip Cost */}
            <div className="bg-[#0E1117] border border-[#30363D] p-3.5 rounded-xl space-y-1">
              <span className="text-[10px] uppercase font-bold text-gray-400 block">Round-Trip Taker Cost</span>
              <div className="text-base font-extrabold text-white font-mono">
                {tradeabilityResult.roundTripFeePct}%
              </div>
              <span className="text-[10px] text-gray-500 block font-sans">
                0.05% × 2 + 18% GST = ~0.118% of notional
              </span>
            </div>

            {/* Typical Stop & Fee Drag Share */}
            <div className="bg-[#0E1117] border border-[#30363D] p-3.5 rounded-xl space-y-1">
              <span className="text-[10px] uppercase font-bold text-gray-400 block">Typical Stop & Fee Drag</span>
              <div className="text-base font-extrabold text-cyan-300 font-mono">
                {tradeabilityResult.feeDragShareOf1R.toFixed(1)}% of 1R
              </div>
              <span className="text-[10px] text-gray-400 block font-sans">
                At {tradeabilityResult.typicalStopDistancePct.toFixed(2)}% stop (1.2× 1H ATR%)
              </span>
            </div>

            {/* RVOL vs 20-Day Time of Day */}
            <div className="bg-[#0E1117] border border-[#30363D] p-3.5 rounded-xl space-y-1">
              <span className="text-[10px] uppercase font-bold text-gray-400 block">RVOL vs 20D Time of Day</span>
              <div className="text-base font-extrabold text-emerald-400 font-mono flex items-center gap-1">
                <span>{tradeabilityResult.rvolTimeOfDay.toFixed(2)}×</span>
                <span className="text-xs font-sans text-gray-400 font-normal">({tradeabilityResult.rvolRating})</span>
              </div>
              <span className="text-[10px] text-gray-500 block font-sans">
                Volume compared to identical hour over 20 days
              </span>
            </div>

            {/* Spread & Liquidity */}
            <div className="bg-[#0E1117] border border-[#30363D] p-3.5 rounded-xl space-y-1">
              <span className="text-[10px] uppercase font-bold text-gray-400 block">Spread & Liquidity</span>
              <div className="text-base font-extrabold text-white font-mono flex items-center gap-1">
                <span>{tradeabilityResult.spreadBps.toFixed(1)} bps</span>
                <span className="text-xs text-emerald-400 font-normal">({tradeabilityResult.isSpreadSafe ? 'Tight' : 'Wide'})</span>
              </div>
              <span className="text-[10px] text-gray-500 block font-sans">
                Spread impact: {tradeabilityResult.spreadPct.toFixed(3)}%
              </span>
            </div>
          </div>

          {/* Event Flags Grid (Funding, Expiries, Macro) */}
          <div className="bg-[#0E1117] border border-[#30363D] rounded-xl p-4">
            <span className="text-xs font-bold text-gray-300 uppercase tracking-wider block mb-3 flex items-center gap-1.5">
              <Calendar size={13} className="text-cyan-400" /> Event & Liquidity Catalyst Flags
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
              {tradeabilityResult.eventFlags.map((ev, idx) => (
                <div key={idx} className="p-3 rounded-lg bg-[#161B22] border border-[#30363D] space-y-1">
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span className="text-white">{ev.name}</span>
                    <span className={`text-[10px] px-1.5 py-0.2 rounded font-mono ${
                      ev.impact === 'HIGH' ? 'bg-rose-950 text-rose-300' : 'bg-gray-800 text-gray-400'
                    }`}>
                      {ev.impact}
                    </span>
                  </div>
                  <span className="text-xs font-extrabold text-cyan-300 font-mono block">
                    {ev.timeRemainingStr}
                  </span>
                  <span className="text-[10px] text-gray-400 block font-sans">
                    {ev.detail}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* REGIME × STRATEGY MATRIX (EXPECTANCY IN R, WIN RATE, COUNT)    */}
      {/* ============================================================== */}
      {(activeTab === 'OVERVIEW' || activeTab === 'MATRIX') && (
        <div className="bg-[#161B22] border border-[#30363D] rounded-xl p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-[#30363D] gap-2">
            <div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse"></span>
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                  Regime × Strategy Matrix (Empirical Expectancy in R)
                </h3>
              </div>
              <p className="text-xs text-gray-400 mt-0.5">
                Dynamic cross-matrix of expectancy in R, win rate %, and trade count. Cells with few trades (&lt; 10) are flagged as unreliable.
              </p>
            </div>

            <div className="text-xs font-mono text-gray-400">
              Active Focus: <b className="text-cyan-300">{regimeResult.primaryRegime}</b>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border border-[#30363D] rounded-lg">
              <thead className="bg-[#0E1117] text-gray-400 uppercase text-[10px] tracking-wider border-b border-[#30363D]">
                <tr>
                  <th className="py-2.5 px-3">Strategy</th>
                  <th className={`py-2.5 px-3 text-center ${regimeResult.primaryRegime === 'TREND' ? 'bg-cyan-950/60 text-cyan-300 font-bold border-b-2 border-cyan-400' : ''}`}>
                    Trend
                  </th>
                  <th className={`py-2.5 px-3 text-center ${regimeResult.primaryRegime === 'RANGE' ? 'bg-cyan-950/60 text-cyan-300 font-bold border-b-2 border-cyan-400' : ''}`}>
                    Range
                  </th>
                  <th className={`py-2.5 px-3 text-center ${regimeResult.primaryRegime === 'COMPRESSION' ? 'bg-cyan-950/60 text-cyan-300 font-bold border-b-2 border-cyan-400' : ''}`}>
                    Compression
                  </th>
                  <th className={`py-2.5 px-3 text-center ${regimeResult.primaryRegime === 'EXPANSION' ? 'bg-cyan-950/60 text-cyan-300 font-bold border-b-2 border-cyan-400' : ''}`}>
                    Expansion / Climax
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#30363D] bg-[#161B22]">
                {[
                  'Trend Pullback',
                  'Trend Pullback Retest',
                  'EMA Gap Pullback',
                  'EMA5 PA Volume',
                  'EMA5 Exact Entry V1',
                  'EMA5 Exact Entry V2',
                  'Range Mean Reversion',
                  'SMC Liquidity Sweep',
                  'EMA5 Rejection Reclaim',
                  'VCB (Volatility Contraction Breakout)',
                  'Early Coil Breakout',
                  'Macro Range Breakout',
                  'Climax Reversal'
                ].map((stratName, sIdx) => {
                  const cells = strategyMatrix.filter(c => c.strategyName === stratName);
                  const trendCell = cells.find(c => c.regime === 'TREND');
                  const rangeCell = cells.find(c => c.regime === 'RANGE');
                  const compCell = cells.find(c => c.regime === 'COMPRESSION');
                  const expCell = cells.find(c => c.regime === 'EXPANSION');

                  return (
                    <tr key={sIdx} className="hover:bg-[#1C2128] transition">
                      <td className="py-2.5 px-3 font-bold text-white flex items-center justify-between">
                        <span>{stratName}</span>
                        {cells.some(c => c.isRecommendedForCurrentRegime) && (
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-300 border border-emerald-500/40 font-mono">
                            RECOMMENDED
                          </span>
                        )}
                      </td>

                      {[trendCell, rangeCell, compCell, expCell].map((cell, cIdx) => {
                        const regimeName: FourHourRegime = cIdx === 0 ? 'TREND' : cIdx === 1 ? 'RANGE' : cIdx === 2 ? 'COMPRESSION' : 'EXPANSION';
                        const isCurrentActiveCol = regimeName === regimeResult.primaryRegime;

                        if (!cell) {
                          return <td key={cIdx} className="py-2 px-3 text-center text-gray-600">-</td>;
                        }

                        return (
                          <td 
                            key={cIdx} 
                            className={`py-2.5 px-3 text-center font-mono ${
                              isCurrentActiveCol ? 'bg-[#0E1117]/80' : ''
                            }`}
                          >
                            <div className="flex flex-col items-center">
                              <span className={`font-extrabold ${cell.expectancyR > 1.0 ? 'text-emerald-400' : cell.expectancyR > 0 ? 'text-cyan-300' : 'text-rose-400'}`}>
                                {cell.expectancyR > 0 ? `+${cell.expectancyR.toFixed(2)}R` : `${cell.expectancyR.toFixed(2)}R`}
                              </span>
                              <span className="text-[10px] text-gray-400">
                                {cell.winRatePct}% WR · {cell.tradeCount}T
                              </span>
                              {cell.isUnreliable && (
                                <span className="text-[8px] px-1 rounded bg-amber-950/80 text-amber-300 border border-amber-600/40 mt-0.5">
                                  Unreliable (N &lt; 10)
                                </span>
                              )}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* PRE-SESSION GATE CHECKLIST & DISCIPLINE                       */}
      {/* ============================================================== */}
      {(activeTab === 'CHECKLIST') && (
        <div className="bg-[#161B22] border border-[#30363D] rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-[#30363D]">
            <div>
              <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <CheckSquare size={16} className="text-cyan-400" /> Pre-Session Execution Checklist
              </h3>
              <p className="text-xs text-gray-400 mt-0.5">
                Mandatory operational gates before initiating live algorithmic or manual positions.
              </p>
            </div>
            <button
              onClick={resetChecklist}
              className="text-xs text-gray-400 hover:text-white underline cursor-pointer"
            >
              Reset Checklist
            </button>
          </div>

          <div className="space-y-2.5">
            {[
              { id: 'step1', title: 'Layer 1: Direction Bias Confirmed', desc: '1D EMA50/200, 4H swing structure, and daily/weekly open alignment verified.' },
              { id: 'step2', title: 'Layer 2: Primary Regime Unambiguous', desc: '4H regime confirmed by consecutive closed candles and aligned with 1H sub-structure.' },
              { id: 'step3', title: 'Layer 3: Fee Drag < 15% of 1R', desc: 'Typical stop size leaves healthy edge after exchange taker fees & GST.' },
              { id: 'step4', title: 'Event Catalysts Checked', desc: 'No impending funding reset or high-impact macro print within active trade duration.' },
              { id: 'step5', title: 'Strategy Aligned with Matrix', desc: 'Active execution limited exclusively to top 2-3 expectancy strategies for this regime.' }
            ].map(item => (
              <div 
                key={item.id}
                onClick={() => toggleChecklist(item.id)}
                className={`p-3.5 rounded-xl border transition flex items-start gap-3 cursor-pointer ${
                  checklist[item.id]
                    ? 'bg-emerald-950/30 border-emerald-500/50'
                    : 'bg-[#0E1117] border-[#30363D] hover:border-gray-500'
                }`}
              >
                <div className="mt-0.5">
                  {checklist[item.id] ? (
                    <CheckSquare size={18} className="text-emerald-400" />
                  ) : (
                    <Square size={18} className="text-gray-500" />
                  )}
                </div>
                <div>
                  <div className={`text-xs font-bold ${checklist[item.id] ? 'text-emerald-300' : 'text-gray-200'}`}>
                    {item.title}
                  </div>
                  <div className="text-[11px] text-gray-400 font-sans mt-0.5">
                    {item.desc}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}
