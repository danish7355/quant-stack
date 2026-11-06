import React, { useState } from 'react';
import { 
  CheckCircle2, 
  XCircle, 
  Play, 
  RefreshCw, 
  Layers, 
  Eye, 
  TrendingUp, 
  Zap, 
  Activity, 
  ShieldCheck, 
  Clock, 
  ChevronRight, 
  HelpCircle,
  X
} from 'lucide-react';
import { AppSettings } from '../types.js';
import { evaluateLiquiditySweepReversal } from '../utils/strategies/liquiditySweepReversal.js';
import { evaluateTrendPullback } from '../utils/strategies/trendPullback.js';
import { evaluateSmcHighProbability } from '../utils/strategies/smcHighProbability.js';
import { evaluateMulticoinScalperPro } from '../utils/strategies/multicoinScalperPro.js';
import { evaluateCoilBreakout } from '../utils/strategies/coilBreakout.js';
import { evaluateOrderBlockStrategy } from '../utils/strategies/orderBlockStrategy.js';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onToggleStrategy?: (strat: string) => void;
  onSetMultipleStrategies?: (strats: string[]) => void;
  currentSymbol?: string;
}

export function StrategyHealthInspector({
  isOpen,
  onClose,
  settings,
  onToggleStrategy,
  onSetMultipleStrategies,
  currentSymbol = 'BTCUSDT'
}: Props) {
  const [testSymbol, setTestSymbol] = useState(currentSymbol);
  const [testing, setTesting] = useState(false);
  const [testResults, setTestResults] = useState<{
    symbol: string;
    candleTime: string;
    lastPrice: number;
    trendPullbackResult: any;
    lsrResult: any;
    smcResult: any;
    scalperResult: any;
    coilResult: any;
    orderBlockResult: any;
    hasConfluence: boolean;
    confluenceCount: number;
    candlesEvaluated: number;
  } | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  if (!isOpen) return null;

  const deletedStrats = settings.deletedStrategies || [];
  const activeStrats = ((settings.activeStrategies && settings.activeStrategies.length > 0)
    ? settings.activeStrategies
    : [settings.activeStrategy || 'COIL_BREAKOUT']).filter(s => !deletedStrats.includes(s));

  const isLsrActive = !deletedStrats.includes('LIQUIDITY_SWEEP_REVERSAL') && (activeStrats.includes('LIQUIDITY_SWEEP_REVERSAL') || activeStrats.includes('SMC_LIQUIDITY'));
  const isTpActive = !deletedStrats.includes('TREND_PULLBACK') && activeStrats.includes('TREND_PULLBACK');
  const isSmcActive = !deletedStrats.includes('SMC_LIQUIDITY') && activeStrats.includes('SMC_LIQUIDITY');
  const isScalperActive = !deletedStrats.includes('MULTICOIN_SCALPER_PRO') && activeStrats.includes('MULTICOIN_SCALPER_PRO');
  const isCoilActive = !deletedStrats.includes('COIL_BREAKOUT') && activeStrats.includes('COIL_BREAKOUT');
  const isObActive = !deletedStrats.includes('ORDER_BLOCK') && activeStrats.includes('ORDER_BLOCK');
  const isRangeRegimeActive = !deletedStrats.includes('RANGE_REGIME_V1') && (activeStrats.includes('RANGE_REGIME_V1') || activeStrats.includes('RANGE_REGIME'));
  const availableBaseStrats = ['ORDER_BLOCK', 'COIL_BREAKOUT', 'MULTICOIN_SCALPER_PRO', 'TREND_PULLBACK', 'LIQUIDITY_SWEEP_REVERSAL', 'RANGE_REGIME_V1'].filter(s => !deletedStrats.includes(s));

  const runDiagnosticTest = async () => {
    setTesting(true);
    setTestError(null);
    try {
      // Fetch 100 closed 15m candles from Binance
      const res = await fetch(`/api/binance/proxy?path=/fapi/v1/klines&symbol=${testSymbol}&interval=15m&limit=120`);
      let rawData: any[] = [];
      if (res.ok) {
        rawData = await res.json();
      } else {
        // Fallback to direct binance
        const directRes = await fetch(`https://fapi.binance.com/fapi/v1/klines?symbol=${testSymbol}&interval=15m&limit=120`);
        if (directRes.ok) {
          rawData = await directRes.json();
        } else {
          throw new Error('Could not retrieve live Binance candles. Check network connection.');
        }
      }

      if (!Array.isArray(rawData) || rawData.length < 50) {
        throw new Error('Insufficient candlestick history returned from Binance.');
      }

      const candles = rawData.map((k: any) => ({
        time: Math.floor(k[0] / 1000),
        open: parseFloat(k[1]),
        high: parseFloat(k[2]),
        low: parseFloat(k[3]),
        close: parseFloat(k[4]),
        volume: parseFloat(k[5]),
      }));

      // Evaluate all strategies on closed candles
      const lastCandle = candles[candles.length - 1];
      const tpResult = evaluateTrendPullback(candles, [], lastCandle.close, settings);
      const lsrResult = evaluateLiquiditySweepReversal(candles, [], lastCandle.close, settings);
      const smcResult = evaluateSmcHighProbability(candles, [], lastCandle.close, settings);
      const scalperResult = evaluateMulticoinScalperPro(candles, [], lastCandle.close, settings);
      const coilResult = evaluateCoilBreakout(candles, [], lastCandle.close, settings);
      const orderBlockResult = evaluateOrderBlockStrategy(candles, [], lastCandle.close, settings);

      const isTpValid = Boolean(tpResult && tpResult.finalDecision === 'EXECUTE');
      const isLsrValid = Boolean(lsrResult && (lsrResult.finalDecision === 'EXECUTE' || lsrResult.status === 'TRIGGERED' || lsrResult.status === 'ARMED'));
      const isSmcValid = Boolean(smcResult && (smcResult.status === 'TRIGGERED' || smcResult.status === 'ARMED' || smcResult.hasConfluence));
      const isScalperValid = Boolean(scalperResult && scalperResult.finalDecision === 'EXECUTE');
      const isCoilValid = Boolean(coilResult && coilResult.finalDecision === 'EXECUTE');
      const isObValid = Boolean(orderBlockResult && orderBlockResult.finalDecision === 'EXECUTE');

      const activeExecs = [
        isTpValid ? tpResult?.direction : null,
        isLsrValid ? lsrResult?.direction : null,
        isScalperValid ? scalperResult?.direction : null,
        isCoilValid ? coilResult?.direction : null,
        isObValid ? orderBlockResult?.direction : null
      ].filter(Boolean);

      const longCount = activeExecs.filter(d => d === 'LONG').length;
      const shortCount = activeExecs.filter(d => d === 'SHORT').length;
      const confluenceCount = Math.max(longCount, shortCount);
      const hasConfluence = confluenceCount >= 2;

      setTestResults({
        symbol: testSymbol,
        candleTime: new Date(lastCandle.time * 1000).toUTCString(),
        lastPrice: lastCandle.close,
        trendPullbackResult: tpResult,
        lsrResult,
        smcResult,
        scalperResult,
        coilResult,
        orderBlockResult,
        hasConfluence,
        confluenceCount,
        candlesEvaluated: candles.length
      });
    } catch (err: any) {
      setTestError(err.message || 'Error running live strategy test');
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/75 backdrop-blur-xs font-sans">
      <div className="bg-[#161B22] border border-[#30363D] rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden text-gray-200">
        
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-[#30363D] bg-[#0E1117] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
              <Activity size={20} />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-gray-100 flex items-center gap-2">
                Strategy Health & Diagnostics Inspector
              </h2>
              <p className="text-xs text-gray-400">
                Verify live execution status of your 2 custom-added strategies
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-200 hover:bg-gray-800 transition cursor-pointer"
            aria-label="Close modal"
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 custom-scrollbar">
          
          {/* Section 1: Overview of User's Configured Strategies */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold text-gray-300 uppercase tracking-wider flex items-center gap-2">
                <Layers size={14} className="text-indigo-400" />
                <span>Installed Strategies ({availableBaseStrats.length})</span>
                {deletedStrats.length > 0 && (
                  <span className="text-[10px] text-gray-500 font-mono">({deletedStrats.length} deleted)</span>
                )}
              </h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onSetMultipleStrategies?.(availableBaseStrats)}
                  className={`text-[11px] px-2.5 py-1 rounded-md font-bold transition border cursor-pointer ${
                    availableBaseStrats.length > 0 && availableBaseStrats.every(s => activeStrats.includes(s))
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                      : 'bg-gray-800 hover:bg-gray-700 text-gray-300 border-gray-600'
                  }`}
                >
                  ⚡ Run All Installed ({availableBaseStrats.length})
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
              {/* Strategy 0: Two-Sided Coil Breakout */}
              {!deletedStrats.includes('COIL_BREAKOUT') && (
              <div className={`p-3.5 rounded-xl border transition ${
                isCoilActive 
                  ? 'bg-emerald-950/20 border-emerald-500/40 shadow-sm' 
                  : 'bg-[#12161E] border-[#30363D] opacity-75'
              }`}>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-bold text-sm text-emerald-300">🌀 Coil Breakout</span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-semibold border border-emerald-500/30">
                        1:5+ R:R Strict
                      </span>
                    </div>
                    <div className="text-[11px] text-gray-400 mt-1">
                      Direction-neutral consolidation (5-20 bars) & confirmed boundary retests
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className={`w-2.5 h-2.5 rounded-full ${isCoilActive ? 'bg-emerald-400 animate-pulse' : 'bg-gray-600'}`}></span>
                    <span className={`text-[11px] font-bold font-mono ${isCoilActive ? 'text-emerald-400' : 'text-gray-500'}`}>
                      {isCoilActive ? 'ONLINE' : 'PAUSED'}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 mt-3 text-[11px] font-mono bg-[#0E1117] p-2.5 rounded-lg border border-[#30363D]">
                  <div className="col-span-2 pb-1 border-b border-[#30363D]/60 flex items-center justify-between">
                    <span className="text-gray-500 text-[10px]">REGIME FILTER</span>
                    <span className="text-emerald-400 font-bold text-[10px]">Compression Squeeze</span>
                  </div>
                  <div>
                    <span className="text-gray-500 block text-[10px]">COIL HEIGHT</span>
                    <span className="text-gray-200">&le; 1.25x ATR</span>
                  </div>
                  <div>
                    <span className="text-gray-500 block text-[10px]">MEDIAN RANGE</span>
                    <span className="text-gray-200">&lt; 0.70x ATR</span>
                  </div>
                  <div>
                    <span className="text-gray-500 block text-[10px]">DISPLACEMENT</span>
                    <span className="text-gray-200">&ge; 1.25x Range</span>
                  </div>
                  <div>
                    <span className="text-gray-500 block text-[10px]">MIN REWARD:RISK</span>
                    <span className="text-emerald-400">1 : 5.0 Strict</span>
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between">
                  <span className="text-[11px] text-gray-400">
                    {isCoilActive ? 'Active in portfolio' : 'Click to enable'}
                  </span>
                  <button
                    onClick={() => onToggleStrategy?.('COIL_BREAKOUT')}
                    className={`text-xs px-3 py-1 rounded font-bold transition cursor-pointer ${
                      isCoilActive 
                        ? 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40' 
                        : 'bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-600'
                    }`}
                  >
                    {isCoilActive ? 'Deactivate' : 'Activate'}
                  </button>
                </div>
              </div>
              )}
              
              {/* Strategy 1: Multicoin Scalper PRO */}
              {!deletedStrats.includes('MULTICOIN_SCALPER_PRO') && (
              <div className={`p-3.5 rounded-xl border transition ${
                isScalperActive 
                  ? 'bg-amber-950/20 border-amber-500/40 shadow-sm' 
                  : 'bg-[#12161E] border-[#30363D] opacity-75'
              }`}>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-bold text-sm text-amber-300">🚀 Scalper PRO</span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-semibold border border-amber-500/30">
                        Top 100 Volume
                      </span>
                    </div>
                    <div className="text-[11px] text-gray-400 mt-1">
                      EMA ribbon micro-trend, daily VWAP, RSI restful zone & ATR
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className={`w-2.5 h-2.5 rounded-full ${isScalperActive ? 'bg-amber-400 animate-pulse' : 'bg-gray-600'}`}></span>
                    <span className={`text-[11px] font-bold font-mono ${isScalperActive ? 'text-amber-400' : 'text-gray-500'}`}>
                      {isScalperActive ? 'ONLINE' : 'PAUSED'}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 mt-3 text-[11px] font-mono bg-[#0E1117] p-2.5 rounded-lg border border-[#30363D]">
                  <div className="col-span-2 pb-1 border-b border-[#30363D]/60 flex items-center justify-between">
                    <span className="text-gray-500 text-[10px]">REGIME FILTER</span>
                    <span className="text-amber-400 font-bold text-[10px]">Active Momentum</span>
                  </div>
                  <div>
                    <span className="text-gray-500 block text-[10px]">MICRO-RIBBON</span>
                    <span className="text-gray-200">EMA 9 &gt; 21 &gt; 55</span>
                  </div>
                  <div>
                    <span className="text-gray-500 block text-[10px]">SESSION VWAP</span>
                    <span className="text-gray-200">Price &gt; Daily VWAP</span>
                  </div>
                  <div>
                    <span className="text-gray-500 block text-[10px]">RSI PULLBACK</span>
                    <span className="text-gray-200">RSI(7) 35 - 55</span>
                  </div>
                  <div>
                    <span className="text-gray-500 block text-[10px]">VOLUME GATE</span>
                    <span className="text-emerald-400">&ge; 0.8x 20-MA</span>
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between">
                  <span className="text-[11px] text-gray-400">
                    {isScalperActive ? 'Active in portfolio' : 'Click to enable'}
                  </span>
                  <button
                    onClick={() => onToggleStrategy?.('MULTICOIN_SCALPER_PRO')}
                    className={`text-xs px-3 py-1 rounded font-bold transition cursor-pointer ${
                      isScalperActive 
                        ? 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40' 
                        : 'bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-600'
                    }`}
                  >
                    {isScalperActive ? 'Deactivate' : 'Activate'}
                  </button>
                </div>
              </div>
              )}

              {/* Strategy 2: Trend-Pullback */}
              {!deletedStrats.includes('TREND_PULLBACK') && (
              <div className={`p-3.5 rounded-xl border transition ${
                isTpActive 
                  ? 'bg-teal-950/20 border-teal-500/40 shadow-sm' 
                  : 'bg-[#12161E] border-[#30363D] opacity-75'
              }`}>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-bold text-sm text-teal-300">🎯 Trend-Pullback</span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-teal-500/20 text-teal-300 font-semibold border border-teal-500/30">
                        Retest-Aware
                      </span>
                    </div>
                    <div className="text-[11px] text-gray-400 mt-1">
                      Multi-EMA alignment, dynamic pullback zones & structural invalidation
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className={`w-2.5 h-2.5 rounded-full ${isTpActive ? 'bg-teal-400 animate-pulse' : 'bg-gray-600'}`}></span>
                    <span className={`text-[11px] font-bold font-mono ${isTpActive ? 'text-teal-400' : 'text-gray-500'}`}>
                      {isTpActive ? 'ONLINE' : 'PAUSED'}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 mt-3 text-[11px] font-mono bg-[#0E1117] p-2.5 rounded-lg border border-[#30363D]">
                  <div className="col-span-2 pb-1 border-b border-[#30363D]/60 flex items-center justify-between">
                    <span className="text-gray-500 text-[10px]">REGIME FILTER</span>
                    <span className="text-teal-400 font-bold text-[10px]">Trend Alignment (ADX &ge; 18)</span>
                  </div>
                  <div>
                    <span className="text-gray-500 block text-[10px]">HTF TREND FILTER</span>
                    <span className="text-gray-200">1H EMA 50 & 200</span>
                  </div>
                  <div>
                    <span className="text-gray-500 block text-[10px]">PULLBACK ZONE</span>
                    <span className="text-gray-200">EMA 9 to EMA 21</span>
                  </div>
                  <div>
                    <span className="text-gray-500 block text-[10px]">INVALIDATION</span>
                    <span className="text-gray-200">Structure Pivot SL</span>
                  </div>
                  <div>
                    <span className="text-gray-500 block text-[10px]">MIN TARGET R:R</span>
                    <span className="text-emerald-400">1 : 3.0 Minimum</span>
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between">
                  <span className="text-[11px] text-gray-400">
                    {isTpActive ? 'Active in portfolio' : 'Click to enable'}
                  </span>
                  <button
                    onClick={() => onToggleStrategy?.('TREND_PULLBACK')}
                    className={`text-xs px-3 py-1 rounded font-bold transition cursor-pointer ${
                      isTpActive 
                        ? 'bg-teal-500/20 hover:bg-teal-500/30 text-teal-300 border border-teal-500/40' 
                        : 'bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-600'
                    }`}
                  >
                    {isTpActive ? 'Deactivate' : 'Activate'}
                  </button>
                </div>
              </div>
              )}

              {/* Strategy 3: Liquidity Sweep Reversal (LSR) */}
              {!deletedStrats.includes('LIQUIDITY_SWEEP_REVERSAL') && !deletedStrats.includes('SMC_LIQUIDITY') && (
              <div className={`p-3.5 rounded-xl border transition ${
                isLsrActive 
                  ? 'bg-cyan-950/20 border-cyan-500/40 shadow-sm' 
                  : 'bg-[#12161E] border-[#30363D] opacity-75'
              }`}>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-bold text-sm text-cyan-300">💧 Liquidity Sweep Reversal</span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 font-semibold border border-cyan-500/30">
                        LSR & MSS (2:1+ R:R)
                      </span>
                    </div>
                    <div className="text-[11px] text-gray-400 mt-1">
                      Institutional failed-breakout engine: swing pivot sweep, mandatory candle close reclaim & micro-structure shift
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className={`w-2.5 h-2.5 rounded-full ${isLsrActive ? 'bg-cyan-400 animate-pulse' : 'bg-gray-600'}`}></span>
                    <span className={`text-[11px] font-bold font-mono ${isLsrActive ? 'text-cyan-400' : 'text-gray-500'}`}>
                      {isLsrActive ? 'ONLINE' : 'PAUSED'}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 mt-3 text-[11px] font-mono bg-[#0E1117] p-2.5 rounded-lg border border-[#30363D]">
                  <div className="col-span-2 pb-1 border-b border-[#30363D]/60 flex items-center justify-between">
                    <span className="text-gray-500 text-[10px]">REGIME FILTER</span>
                    <span className="text-cyan-400 font-bold text-[10px]">BTC Shock & Coin Range Check</span>
                  </div>
                  <div>
                    <span className="text-gray-500 block text-[10px]">SWEEP DETECTION</span>
                    <span className="text-gray-200">Wick Beyond Swing (≤1.8x ATR)</span>
                  </div>
                  <div>
                    <span className="text-gray-500 block text-[10px]">RECLAIM REQUIREMENT</span>
                    <span className="text-gray-200">Mandatory (≤4 Candles)</span>
                  </div>
                  <div>
                    <span className="text-gray-500 block text-[10px]">MICRO-STRUCTURE SHIFT</span>
                    <span className="text-gray-200">Confirmed Minor Break</span>
                  </div>
                  <div>
                    <span className="text-gray-500 block text-[10px]">MIN TARGET R:R</span>
                    <span className="text-emerald-400">1 : 2.0 Minimum</span>
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between">
                  <span className="text-[11px] text-gray-400">
                    {isLsrActive ? 'Active in portfolio' : 'Click to enable'}
                  </span>
                  <button
                    onClick={() => onToggleStrategy?.('LIQUIDITY_SWEEP_REVERSAL')}
                    className={`text-xs px-3 py-1 rounded font-bold transition cursor-pointer ${
                      isLsrActive 
                        ? 'bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40' 
                        : 'bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-600'
                    }`}
                  >
                    {isLsrActive ? 'Deactivate' : 'Activate'}
                  </button>
                </div>
              </div>
              )}

              {/* Strategy 4: Order Block Strategy */}
              {!deletedStrats.includes('ORDER_BLOCK') && (
              <div className={`p-3.5 rounded-xl border transition ${
                isObActive 
                  ? 'bg-purple-950/20 border-purple-500/40 shadow-sm' 
                  : 'bg-[#12161E] border-[#30363D] opacity-75'
              }`}>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-bold text-sm text-purple-300">🧱 Order Block</span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300 font-semibold border border-purple-500/30">
                        1:3.5+ R:R Strict
                      </span>
                    </div>
                    <div className="text-[11px] text-gray-400 mt-1">
                      Liquidity sweep, impulse displacement & confirmed BOS retests
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className={`w-2.5 h-2.5 rounded-full ${isObActive ? 'bg-purple-400 animate-pulse' : 'bg-gray-600'}`}></span>
                    <span className={`text-[11px] font-bold font-mono ${isObActive ? 'text-purple-400' : 'text-gray-500'}`}>
                      {isObActive ? 'ONLINE' : 'PAUSED'}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 mt-3 text-[11px] font-mono bg-[#0E1117] p-2.5 rounded-lg border border-[#30363D]">
                  <div className="col-span-2 pb-1 border-b border-[#30363D]/60 flex items-center justify-between">
                    <span className="text-gray-500 text-[10px]">REGIME FILTER</span>
                    <span className="text-purple-400 font-bold text-[10px]">Market Structure & Vol</span>
                  </div>
                  <div>
                    <span className="text-gray-500 block text-[10px]">DISPLACEMENT</span>
                    <span className="text-gray-200">&ge; 1.5x ATR</span>
                  </div>
                  <div>
                    <span className="text-gray-500 block text-[10px]">BOS LINKAGE</span>
                    <span className="text-gray-200">Confirmed Close</span>
                  </div>
                  <div>
                    <span className="text-gray-500 block text-[10px]">FRESHNESS</span>
                    <span className="text-gray-200">First Retest (0 touches)</span>
                  </div>
                  <div>
                    <span className="text-gray-500 block text-[10px]">MIN REWARD:RISK</span>
                    <span className="text-purple-400">1 : 3.5 Hard Minimum</span>
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between">
                  <span className="text-[11px] text-gray-400">
                    {isObActive ? 'Active in portfolio' : 'Click to enable'}
                  </span>
                  <button
                    onClick={() => onToggleStrategy?.('ORDER_BLOCK')}
                    className={`text-xs px-3 py-1 rounded font-bold transition cursor-pointer ${
                      isObActive 
                        ? 'bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/40' 
                        : 'bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-600'
                    }`}
                  >
                    {isObActive ? 'Deactivate' : 'Activate'}
                  </button>
                </div>
              </div>
              )}

              {/* Strategy: Range Regime V1 */}
              {!deletedStrats.includes('RANGE_REGIME_V1') && (
              <div className={`p-3.5 rounded-xl border transition ${
                isRangeRegimeActive 
                  ? 'bg-cyan-950/20 border-cyan-500/40 shadow-sm' 
                  : 'bg-[#12161E] border-[#30363D] opacity-75'
              }`}>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-bold text-sm text-cyan-300">📊 Range Regime V1</span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 font-semibold border border-cyan-500/30">
                        S1/S2/S3 Fades
                      </span>
                    </div>
                    <div className="text-[11px] text-gray-400 mt-1">
                      ADX trend veto, Kaufman ER, swing edge clusters & fee-to-risk limit
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className={`w-2.5 h-2.5 rounded-full ${isRangeRegimeActive ? 'bg-cyan-400 animate-pulse' : 'bg-gray-600'}`}></span>
                    <span className={`text-[11px] font-bold font-mono ${isRangeRegimeActive ? 'text-cyan-400' : 'text-gray-500'}`}>
                      {isRangeRegimeActive ? 'ONLINE' : 'PAUSED'}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 mt-3 text-[11px] font-mono bg-[#0E1117] p-2.5 rounded-lg border border-[#30363D]">
                  <div className="col-span-2 pb-1 border-b border-[#30363D]/60 flex items-center justify-between">
                    <span className="text-gray-500 text-[10px]">REGIME GATE</span>
                    <span className="text-cyan-400 font-bold text-[10px]">ADX &le; 30 + Mid Cross</span>
                  </div>
                  <div>
                    <span className="text-gray-500 block text-[10px]">MIN TOUCHES</span>
                    <span className="text-gray-200">&ge; 2 Tested Pivots</span>
                  </div>
                  <div>
                    <span className="text-gray-500 block text-[10px]">EDGE ZONE</span>
                    <span className="text-gray-200">Outer 20% Range</span>
                  </div>
                  <div>
                    <span className="text-gray-500 block text-[10px]">FEE DRAG GATE</span>
                    <span className="text-gray-200">&le; 30% of 1R</span>
                  </div>
                  <div>
                    <span className="text-gray-500 block text-[10px]">MIN BLENDED R</span>
                    <span className="text-cyan-400">&ge; 1.2R Net</span>
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between">
                  <span className="text-[11px] text-gray-400">
                    {isRangeRegimeActive ? 'Active in portfolio' : 'Click to enable'}
                  </span>
                  <button
                    onClick={() => onToggleStrategy?.('RANGE_REGIME_V1')}
                    className={`text-xs px-3 py-1 rounded font-bold transition cursor-pointer ${
                      isRangeRegimeActive 
                        ? 'bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40' 
                        : 'bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-600'
                    }`}
                  >
                    {isRangeRegimeActive ? 'Deactivate' : 'Activate'}
                  </button>
                </div>
              </div>
              )}

            </div>
          </div>

          {/* Section 2: Live Diagnostic Tester */}
          <div className="p-4 sm:p-5 rounded-xl bg-[#0E1117] border border-[#30363D]">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <div>
                <h3 className="text-sm font-bold text-gray-200 flex items-center gap-2">
                  <Zap size={16} className="text-amber-400" />
                  <span>Live Strategy Execution Diagnostic (Real Binance Data)</span>
                </h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  Execute all strategies in real-time against live market candles to inspect calculation gates
                </p>
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={testSymbol}
                  onChange={(e) => setTestSymbol(e.target.value)}
                  className="bg-[#161B22] border border-[#30363D] text-gray-200 text-xs rounded-lg px-2.5 py-1.5 font-mono focus:outline-hidden focus:border-indigo-500"
                >
                  <option value="BTCUSDT">BTCUSDT</option>
                  <option value="ETHUSDT">ETHUSDT</option>
                  <option value="SOLUSDT">SOLUSDT</option>
                  <option value="BNBUSDT">BNBUSDT</option>
                  <option value="DOGEUSDT">DOGEUSDT</option>
                  <option value="XRPUSDT">XRPUSDT</option>
                </select>

                <button
                  id="run-strategy-diagnostic-btn"
                  onClick={runDiagnosticTest}
                  disabled={testing}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-lg text-xs transition cursor-pointer disabled:opacity-50 shrink-0"
                >
                  <RefreshCw size={13} className={testing ? 'animate-spin' : ''} />
                  <span>{testing ? 'Testing...' : 'Run Live Test'}</span>
                </button>
              </div>
            </div>

            {testError && (
              <div className="p-3 mb-3 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                <XCircle size={15} />
                <span>{testError}</span>
              </div>
            )}

            {testResults ? (
              <div className="space-y-4 text-xs font-mono">
                {/* Candle summary */}
                <div className="p-3 rounded-lg bg-[#161B22] border border-[#30363D] flex flex-wrap items-center justify-between gap-2 text-gray-300">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-gray-100">{testResults.symbol}</span>
                    <span className="text-gray-500">|</span>
                    <span>Last Closed Bar: <strong>${testResults.lastPrice.toLocaleString()}</strong></span>
                  </div>
                  <div className="text-gray-400 text-[11px]">
                    Evaluated: {testResults.candleTime} (15m Interval)
                  </div>
                </div>

                {/* 5 diagnostic result cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
                  
                  {/* Two-Sided Coil Breakout Diagnostic */}
                  <div className="p-3 rounded-lg bg-[#161B22] border border-[#30363D] space-y-2">
                    <div className="flex items-center justify-between border-b border-[#30363D] pb-2">
                      <span className="font-bold text-emerald-300">🌀 Coil Breakout</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        testResults.coilResult?.strategyRegimeStatus === 'IN_FAVOR' || testResults.coilResult?.finalDecision === 'EXECUTE'
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                          : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                      }`}>
                        {testResults.coilResult?.strategyRegimeStatus === 'IN_FAVOR' || testResults.coilResult?.finalDecision === 'EXECUTE' ? 'REGIME: IN FAVOR' : 'REGIME: WAITING'}
                      </span>
                    </div>
                    
                    <div className="space-y-1 text-[11px]">
                      <div className="flex justify-between text-gray-400">
                        <span>Side / Setup:</span>
                        <span className="text-gray-200 font-bold">{testResults.coilResult?.direction || 'NEUTRAL'} ({testResults.coilResult?.setup || 'None'})</span>
                      </div>
                      <div className="flex justify-between text-gray-400">
                        <span>Regime Filter:</span>
                        <span className="text-emerald-300 font-semibold">{testResults.coilResult?.marketRegime || (testResults.coilResult?.finalDecision === 'EXECUTE' ? 'Compression Squeeze' : 'Awaiting Coil')}</span>
                      </div>
                      <div className="flex justify-between text-gray-400">
                        <span>Coil Range:</span>
                        <span className="text-gray-300 font-mono">
                          {testResults.coilResult?.coilHigh ? `$${testResults.coilResult.coilLow.toFixed(2)} - $${testResults.coilResult.coilHigh.toFixed(2)}` : 'N/A'}
                        </span>
                      </div>
                      <div className="flex justify-between text-gray-400">
                        <span>Execution State:</span>
                        <span className={`font-bold ${testResults.coilResult?.finalDecision === 'EXECUTE' ? 'text-emerald-400' : 'text-amber-400'}`}>
                          {testResults.coilResult?.finalDecision === 'EXECUTE' ? 'EXECUTE' : 'WAITING FOR SQUEEZE'}
                        </span>
                      </div>
                      <div className="flex justify-between text-gray-400">
                        <span>Condition Note:</span>
                        <span className="text-gray-300 truncate max-w-[150px]" title={testResults.coilResult?.reason || testResults.coilResult?.exactRejectionReason || 'Calculated'}>
                          {testResults.coilResult?.reason || testResults.coilResult?.exactRejectionReason || 'Active scanning'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Multicoin Scalper PRO Diagnostic */}
                  <div className="p-3 rounded-lg bg-[#161B22] border border-[#30363D] space-y-2">
                    <div className="flex items-center justify-between border-b border-[#30363D] pb-2">
                      <span className="font-bold text-amber-300">🚀 Scalper PRO</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        testResults.scalperResult?.strategyRegimeStatus === 'IN_FAVOR' || testResults.scalperResult?.finalDecision === 'EXECUTE'
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                          : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                      }`}>
                        {testResults.scalperResult?.strategyRegimeStatus === 'IN_FAVOR' || testResults.scalperResult?.finalDecision === 'EXECUTE' ? 'REGIME: IN FAVOR' : 'REGIME: WAITING'}
                      </span>
                    </div>
                    
                    <div className="space-y-1 text-[11px]">
                      <div className="flex justify-between text-gray-400">
                        <span>Direction / Profile:</span>
                        <span className="text-gray-200 font-bold">{testResults.scalperResult?.direction || 'NONE'} ({testResults.scalperResult?.profile || '5m'})</span>
                      </div>
                      <div className="flex justify-between text-gray-400">
                        <span>Regime Filter:</span>
                        <span className="text-amber-300 font-semibold">{testResults.scalperResult?.marketRegime || (testResults.scalperResult?.finalDecision === 'EXECUTE' ? 'Active Momentum' : 'Awaiting Momentum')}</span>
                      </div>
                      <div className="flex justify-between text-gray-400">
                        <span>Execution State:</span>
                        <span className={`font-bold ${testResults.scalperResult?.finalDecision === 'EXECUTE' ? 'text-emerald-400' : 'text-amber-400'}`}>
                          {testResults.scalperResult?.finalDecision === 'EXECUTE' ? 'EXECUTE' : 'WAITING FOR MOMENTUM'}
                        </span>
                      </div>
                      <div className="flex justify-between text-gray-400">
                        <span>Condition Note:</span>
                        <span className="text-gray-300 truncate max-w-[180px]" title={testResults.scalperResult?.reason || testResults.scalperResult?.exactRejectionReason || 'Calculated'}>
                          {testResults.scalperResult?.reason || testResults.scalperResult?.exactRejectionReason || 'Active scanning'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Trend-Pullback Diagnostic */}
                  <div className="p-3 rounded-lg bg-[#161B22] border border-[#30363D] space-y-2">
                    <div className="flex items-center justify-between border-b border-[#30363D] pb-2">
                      <span className="font-bold text-teal-300">🎯 Trend-Pullback</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        testResults.trendPullbackResult?.strategyRegimeStatus === 'IN_FAVOR' || testResults.trendPullbackResult?.finalDecision === 'EXECUTE'
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                          : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                      }`}>
                        {testResults.trendPullbackResult?.strategyRegimeStatus === 'IN_FAVOR' || testResults.trendPullbackResult?.finalDecision === 'EXECUTE' ? 'REGIME: IN FAVOR' : 'REGIME: WAITING'}
                      </span>
                    </div>
                    
                    <div className="space-y-1 text-[11px]">
                      <div className="flex justify-between text-gray-400">
                        <span>Direction / Setup:</span>
                        <span className="text-gray-200 font-bold">{testResults.trendPullbackResult?.direction || 'NONE'}</span>
                      </div>
                      <div className="flex justify-between text-gray-400">
                        <span>Regime Filter:</span>
                        <span className="text-teal-300 font-semibold">{testResults.trendPullbackResult?.marketRegime || 'Awaiting Trend'}</span>
                      </div>
                      <div className="flex justify-between text-gray-400">
                        <span>Execution State:</span>
                        <span className={`font-bold ${testResults.trendPullbackResult?.finalDecision === 'EXECUTE' ? 'text-emerald-400' : 'text-amber-400'}`}>
                          {testResults.trendPullbackResult?.finalDecision === 'EXECUTE' ? 'EXECUTE' : 'WAITING FOR TREND'}
                        </span>
                      </div>
                      <div className="flex justify-between text-gray-400">
                        <span>Condition Note:</span>
                        <span className="text-gray-300 truncate max-w-[180px]" title={testResults.trendPullbackResult?.rejectionDetails || testResults.trendPullbackResult?.exactRejectionReason || 'Calculated'}>
                          {testResults.trendPullbackResult?.rejectionDetails || testResults.trendPullbackResult?.exactRejectionReason || 'Active scanning'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Liquidity Sweep Reversal (LSR) Diagnostic */}
                  <div className="p-3 rounded-lg bg-[#161B22] border border-[#30363D] space-y-2">
                    <div className="flex items-center justify-between border-b border-[#30363D] pb-2">
                      <span className="font-bold text-cyan-300">💧 Liquidity Sweep (LSR)</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        testResults.lsrResult?.finalDecision === 'EXECUTE' || testResults.lsrResult?.status === 'TRIGGERED' || testResults.lsrResult?.status === 'ARMED'
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                          : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                      }`}>
                        {testResults.lsrResult?.finalDecision === 'EXECUTE' ? 'TRIGGERED' : (testResults.lsrResult?.status === 'ARMED' ? 'ARMED' : 'WAITING')}
                      </span>
                    </div>

                    <div className="space-y-1 text-[11px]">
                      <div className="flex justify-between text-gray-400">
                        <span>Direction / Grade:</span>
                        <span className="text-gray-200 font-bold">{testResults.lsrResult?.direction || 'NEUTRAL'} ({testResults.lsrResult?.grade ? `Grade ${testResults.lsrResult.grade}` : 'Scanning'})</span>
                      </div>
                      <div className="flex justify-between text-gray-400">
                        <span>Regime Filter:</span>
                        <span className="text-cyan-300 font-semibold">{testResults.lsrResult?.coinRegime || 'Scanning Levels'}</span>
                      </div>
                      <div className="flex justify-between text-gray-400">
                        <span>Execution State:</span>
                        <span className={`font-bold ${testResults.lsrResult?.finalDecision === 'EXECUTE' ? 'text-emerald-400' : 'text-amber-400'}`}>
                          {testResults.lsrResult?.finalDecision === 'EXECUTE' ? 'EXECUTE' : (testResults.lsrResult?.state || 'MONITORING')}
                        </span>
                      </div>
                      {testResults.lsrResult?.candleConfirmationSetup && testResults.lsrResult.candleConfirmationSetup !== 'NONE' && (
                        <div className="flex justify-between text-gray-400">
                          <span>Reversal Setup:</span>
                          <span className="text-emerald-400 font-semibold">{testResults.lsrResult.candleConfirmationSetup.replace(/_/g, ' ')}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-gray-400">
                        <span>Condition Note:</span>
                        <span className="text-gray-300 truncate max-w-[180px]" title={testResults.lsrResult?.explanation || testResults.lsrResult?.rejectionReason || 'Calculated'}>
                          {testResults.lsrResult?.explanation || testResults.lsrResult?.rejectionReason || 'Active scanning for sweep & reclaim'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Order Block Strategy Diagnostic */}
                  <div className="p-3 rounded-lg bg-[#161B22] border border-[#30363D] space-y-2">
                    <div className="flex items-center justify-between border-b border-[#30363D] pb-2">
                      <span className="font-bold text-purple-300">🧱 Order Block</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        testResults.orderBlockResult?.finalDecision === 'EXECUTE' || testResults.orderBlockResult?.status === 'TRIGGERED' || testResults.orderBlockResult?.status === 'ARMED'
                          ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                          : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                      }`}>
                        {testResults.orderBlockResult?.finalDecision === 'EXECUTE' ? 'TRIGGERED' : (testResults.orderBlockResult?.status === 'ARMED' ? 'ARMED' : 'WAITING')}
                      </span>
                    </div>

                    <div className="space-y-1 text-[11px]">
                      <div className="flex justify-between text-gray-400">
                        <span>Direction / Status:</span>
                        <span className="text-gray-200 font-bold">{testResults.orderBlockResult?.direction || 'NEUTRAL'} ({testResults.orderBlockResult?.setupStatus || 'Scanning'})</span>
                      </div>
                      <div className="flex justify-between text-gray-400">
                        <span>Regime Filter:</span>
                        <span className="text-purple-300 font-semibold">{testResults.orderBlockResult?.coinRegime || 'Structure & Vol'}</span>
                      </div>
                      <div className="flex justify-between text-gray-400">
                        <span>Displacement:</span>
                        <span className="text-gray-300 font-mono">
                          {testResults.orderBlockResult?.displacementMagnitudeAtr ? `${testResults.orderBlockResult.displacementMagnitudeAtr.toFixed(2)}x ATR` : 'Scanning'}
                        </span>
                      </div>
                      <div className="flex justify-between text-gray-400">
                        <span>Execution State:</span>
                        <span className={`font-bold ${testResults.orderBlockResult?.finalDecision === 'EXECUTE' ? 'text-emerald-400' : 'text-amber-400'}`}>
                          {testResults.orderBlockResult?.finalDecision === 'EXECUTE' ? 'EXECUTE' : (testResults.orderBlockResult?.status || 'AWAITING RETEST')}
                        </span>
                      </div>
                      <div className="flex justify-between text-gray-400">
                        <span>Condition Note:</span>
                        <span className="text-gray-300 truncate max-w-[180px]" title={testResults.orderBlockResult?.explanation || testResults.orderBlockResult?.rejectionReason || 'Calculated'}>
                          {testResults.orderBlockResult?.explanation || testResults.orderBlockResult?.rejectionReason || 'Active scanning for OB & retest'}
                        </span>
                      </div>
                    </div>
                  </div>

                </div>

                {/* Confluence status */}
                <div className={`p-3 rounded-lg border flex items-center justify-between ${
                  testResults.hasConfluence 
                    ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-300' 
                    : 'bg-[#161B22] border-[#30363D] text-gray-400'
                }`}>
                  <div className="flex items-center gap-2">
                    <Zap size={15} className={testResults.hasConfluence ? 'text-emerald-400' : 'text-gray-500'} />
                    <span className="font-bold text-xs">
                      {testResults.hasConfluence 
                        ? `⚡ MULTI-STRATEGY CONFLUENCE ACHIEVED (${testResults.confluenceCount}x Agreement, +12 Score Synergy Boost)` 
                        : 'Standalone Strategy Evaluation (Awaiting simultaneous alignment)'}
                    </span>
                  </div>
                  <span className="text-[11px]">
                    {testResults.hasConfluence ? 'HIGH PROBABILITY' : 'STANDALONE MODE'}
                  </span>
                </div>

              </div>
            ) : (
              <div className="text-center py-6 text-gray-500 text-xs">
                Click <strong>"Run Live Test"</strong> to fetch recent live candles from Binance and execute both strategy algorithms in real-time.
              </div>
            )}
          </div>

        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-[#30363D] bg-[#0E1117] flex items-center justify-between text-xs">
          <span className="text-gray-400 flex items-center gap-1.5">
            <ShieldCheck size={14} className="text-emerald-400" />
            <span>Strategies execute on <strong>closed candles only</strong> (no repainting).</span>
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-[#21262D] hover:bg-[#30363D] text-gray-200 font-bold transition cursor-pointer"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
}

export default StrategyHealthInspector;
