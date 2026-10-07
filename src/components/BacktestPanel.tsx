// src/components/BacktestPanel.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Operator Backtest Interface for QUANT PRO.
// Backtests strategy registry against historical Binance USDT-M futures data.
// Computes all statistics and charts purely from the completed trade ledger.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Play, Square, Download, RefreshCw, BarChart2, TrendingUp, TrendingDown,
  ShieldAlert, DollarSign, Percent, Clock, AlertTriangle, Filter, ChevronDown,
  ChevronUp, CheckSquare, Square as SquareOutline, Layers, Activity, Zap
} from 'lucide-react';

import {
  BacktestParams,
  BacktestTrade,
  BacktestResult,
  BacktestJobStatus,
  EquityPoint,
  StrategyMetricSummary,
  SymbolMetricSummary
} from '../types/backtest.js';

interface StrategyInfo {
  id: string;
  name: string;
  description: string;
  priority: number;
  regime: string;
}

const DEFAULT_SYMBOLS = [
  'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'DOGEUSDT',
  'XRPUSDT', 'ADAUSDT', 'AVAXUSDT', 'LINKUSDT', 'NEARUSDT'
];

export default function BacktestPanel() {
  // Strategy Registry
  const [availableStrategies, setAvailableStrategies] = useState<StrategyInfo[]>([]);
  const [selectedStrategies, setSelectedStrategies] = useState<string[]>([
    'EMA_GAP_PULLBACK', 'VOLATILITY_COMPRESSION', 'BINANCE_COMPOSITE'
  ]);

  // Symbols
  const [selectedSymbols, setSelectedSymbols] = useState<string[]>(['BTCUSDT', 'ETHUSDT', 'SOLUSDT']);
  const [customSymbolInput, setCustomSymbolInput] = useState('');

  // Timeframes
  const [execTf, setExecTf] = useState('15m');
  const [dirTf, setDirTf] = useState('1h');

  // Date Range (default last 14 days)
  const defaultToDate = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const defaultFromDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 14);
    return d.toISOString().slice(0, 10);
  }, []);

  const [fromDateStr, setFromDateStr] = useState(defaultFromDate);
  const [toDateStr, setToDateStr] = useState(defaultToDate);

  // Capital & Risk Settings
  const [capital, setCapital] = useState(10000);
  const [positionSizePct, setPositionSizePct] = useState(5);
  const [accountRiskPct, setAccountRiskPct] = useState(1);
  const [leverage, setLeverage] = useState(5);
  const [maxConcurrentTrades, setMaxConcurrentTrades] = useState(3);
  const [dailyLossLimitPct, setDailyLossLimitPct] = useState(3);
  const [maxDrawdownPct, setMaxDrawdownPct] = useState(10);
  const [trailingStopActivation, setTrailingStopActivation] = useState<'TP1' | '1R' | '2R' | 'OFF'>('TP1');
  const [trailAtrMultiple, setTrailAtrMultiple] = useState(1.5);

  // Fees & Slippage
  const [enableFees, setEnableFees] = useState(true);
  const [takerFeePct, setTakerFeePct] = useState(0.05);
  const [gstPct, setGstPct] = useState(18);
  const [enableSlippage, setEnableSlippage] = useState(true);
  const [slippagePct, setSlippagePct] = useState(0.05);

  // Mode
  const [mode, setMode] = useState<'single' | 'portfolio'>('portfolio');

  // Advanced parameters accordion
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Job Execution & State
  const [jobStatus, setJobStatus] = useState<BacktestJobStatus | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Trade Table Filter & Sort
  const [tradeFilterSymbol, setTradeFilterSymbol] = useState<string>('ALL');
  const [tradeFilterStrategy, setTradeFilterStrategy] = useState<string>('ALL');
  const [tradeFilterOutcome, setTradeFilterOutcome] = useState<'ALL' | 'WIN' | 'LOSS'>('ALL');
  const [tradeSortColumn, setTradeSortColumn] = useState<keyof BacktestTrade>('entryTime');
  const [tradeSortDirection, setTradeSortDirection] = useState<'asc' | 'desc'>('desc');

  const sseRef = useRef<EventSource | null>(null);

  const subscribeToJob = (jobId: string) => {
    if (sseRef.current) {
      sseRef.current.close();
      sseRef.current = null;
    }

    const sse = new EventSource(`/api/backtest/${jobId}/progress`);
    sseRef.current = sse;

    sse.onmessage = (event) => {
      try {
        const update: BacktestJobStatus = JSON.parse(event.data);
        setJobStatus(update);

        if (update.status === 'completed' && update.result) {
          setResult(update.result);
          setIsRunning(false);
          sse.close();
          sseRef.current = null;
        } else if (update.status === 'failed') {
          setErrorMsg(update.error || 'Backtest failed.');
          setIsRunning(false);
          sse.close();
          sseRef.current = null;
        }
      } catch (e) {}
    };

    sse.onerror = () => {
      // Check job status if SSE disconnects or finishes
      fetch(`/api/backtest/${jobId}`)
        .then(r => r.json())
        .then((statusData: BacktestJobStatus) => {
          setJobStatus(statusData);
          if (statusData.status === 'completed' && statusData.result) {
            setResult(statusData.result);
            setIsRunning(false);
            sse.close();
            sseRef.current = null;
          } else if (statusData.status === 'failed') {
            setErrorMsg(statusData.error || 'Backtest failed.');
            setIsRunning(false);
            sse.close();
            sseRef.current = null;
          }
        })
        .catch(() => {});
    };
  };

  // Load available strategies and restore latest or running job on mount
  useEffect(() => {
    fetch('/api/backtest/strategies')
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) {
          setAvailableStrategies(data);
        }
      })
      .catch(err => console.warn('Could not load backtest strategies:', err));

    fetch('/api/backtest/jobs')
      .then(r => r.json())
      .then(jobs => {
        if (Array.isArray(jobs) && jobs.length > 0) {
          const active = jobs.find((j: any) => j.status === 'running');
          if (active) {
            setJobStatus(active);
            setIsRunning(true);
            subscribeToJob(active.jobId);
          } else if (jobs[0].status === 'completed' && jobs[0].result) {
            setJobStatus(jobs[0]);
            setResult(jobs[0].result);
          }
        }
      })
      .catch(err => console.warn('Could not load existing backtest jobs:', err));
  }, []);

  // Clean up SSE on unmount
  useEffect(() => {
    return () => {
      if (sseRef.current) {
        sseRef.current.close();
      }
    };
  }, []);

  // Quick preset helpers
  const handleSelectAllStrategies = () => {
    setSelectedStrategies(availableStrategies.map(s => s.id));
  };

  const handleClearStrategies = () => {
    setSelectedStrategies([]);
  };

  const handlePresetStrategies = (type: 'trend' | 'range' | 'breakout' | 'ema5') => {
    if (type === 'trend') {
      setSelectedStrategies(['TREND_PULLBACK', 'TREND_PULLBACK_RETEST', 'EMA_GAP_PULLBACK']);
    } else if (type === 'range') {
      setSelectedStrategies(['BINANCE_COMPOSITE', 'SMC_LIQUIDITY_SWEEP']);
    } else if (type === 'breakout') {
      setSelectedStrategies(['VOLATILITY_COMPRESSION', 'EARLY_COIL_BREAKOUT', 'TWO_SIDED_COIL_BREAKOUT']);
    } else if (type === 'ema5') {
      setSelectedStrategies(['EMA5_EXACT_ENTRY_V2', 'EMA5_PA_VOLUME_V1', 'EMA5_EXACT_ENTRY_V1', 'EMA5_REJECTION_RECLAIM_V1']);
    }
  };

  const handleSetDays = (days: number) => {
    const to = new Date();
    const from = new Date();
    from.setDate(to.getDate() - days);
    setFromDateStr(from.toISOString().slice(0, 10));
    setToDateStr(to.toISOString().slice(0, 10));
  };

  const handleAddCustomSymbol = () => {
    const sym = customSymbolInput.trim().toUpperCase();
    if (!sym) return;
    const clean = sym.endsWith('USDT') ? sym : `${sym}USDT`;
    if (!selectedSymbols.includes(clean)) {
      setSelectedSymbols(prev => [...prev, clean]);
    }
    setCustomSymbolInput('');
  };

  const handleToggleSymbol = (sym: string) => {
    setSelectedSymbols(prev =>
      prev.includes(sym) ? prev.filter(s => s !== sym) : [...prev, sym]
    );
  };

  // Run Backtest
  const handleRunBacktest = async () => {
    if (selectedStrategies.length === 0) {
      setErrorMsg('Please select at least one strategy.');
      return;
    }
    if (selectedSymbols.length === 0) {
      setErrorMsg('Please select at least one symbol.');
      return;
    }

    const fromMs = new Date(fromDateStr).getTime();
    const toMs = new Date(toDateStr).getTime() + (24 * 60 * 60 * 1000 - 1); // end of day

    if (isNaN(fromMs) || isNaN(toMs) || fromMs >= toMs) {
      setErrorMsg('Invalid date range. Start date must be before end date.');
      return;
    }

    setErrorMsg(null);
    setIsRunning(true);
    setResult(null);

    const payload: BacktestParams = {
      strategies: selectedStrategies,
      symbols: selectedSymbols,
      execTf,
      dirTf,
      from: fromMs,
      to: toMs,
      capital,
      riskSettings: {
        positionSizePct,
        accountRiskPct,
        leverage,
        maxConcurrentTrades,
        dailyLossLimitPct,
        maxDrawdownPct,
        trailingStopActivation,
        trailAtrMultiple
      },
      fees: {
        takerPct: enableFees ? takerFeePct : 0,
        gstPct: enableFees ? gstPct : 0,
      },
      slippagePct: enableSlippage ? slippagePct : 0,
      mode: selectedStrategies.length === 1 && mode === 'single' ? 'single' : mode,
    };

    try {
      const res = await fetch('/api/backtest/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      const jobId = data.jobId;

      setJobStatus({
        jobId,
        status: 'running',
        progress: 0,
        message: 'Initializing backtest worker...',
        createdAt: Date.now(),
        updatedAt: Date.now()
      });

      subscribeToJob(jobId);

    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to start backtest.');
      setIsRunning(false);
    }
  };

  const handleCancelBacktest = async () => {
    if (!jobStatus?.jobId) return;
    try {
      await fetch(`/api/backtest/${jobStatus.jobId}/cancel`, { method: 'POST' });
      setIsRunning(false);
      setJobStatus(prev => prev ? { ...prev, status: 'failed', message: 'Cancelled by operator.' } : null);
      if (sseRef.current) {
        sseRef.current.close();
        sseRef.current = null;
      }
    } catch (e) {}
  };

  // CSV Export
  const handleExportCSV = () => {
    if (!result?.trades || result.trades.length === 0) return;

    const headers = [
      'Trade ID', 'Symbol', 'Strategy', 'Direction',
      'Entry Time', 'Entry Price', 'Exit Time', 'Exit Price',
      'Exit Reason', 'Quantity', 'Notional ($)', 'Risk ($)',
      'Gross PnL ($)', 'Gross R', 'Net PnL ($)', 'Net R',
      'Fees ($)', 'Slippage ($)', 'Fee Drag (%)', 'Holding Bars',
      'Balance After ($)'
    ];

    const rows = result.trades.map(t => [
      t.id,
      t.symbol,
      t.strategy,
      t.direction,
      new Date(t.entryTime).toISOString(),
      t.entryPrice.toFixed(4),
      new Date(t.exitTime).toISOString(),
      t.exitPrice.toFixed(4),
      t.exitReason,
      t.quantity.toFixed(4),
      t.notional.toFixed(2),
      t.riskDollars.toFixed(2),
      t.grossPnl.toFixed(2),
      t.grossR.toFixed(2),
      t.netPnl.toFixed(2),
      t.netR.toFixed(2),
      t.fees.toFixed(2),
      t.slippageCost.toFixed(2),
      t.feeDragPct.toFixed(1),
      t.holdingBars,
      t.accountBalanceAfter.toFixed(2)
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `backtest_trades_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // JSONL Export
  const handleExportJSONL = () => {
    if (!result?.trades || result.trades.length === 0) return;
    const jsonlContent = result.trades.map(t => JSON.stringify(t)).join('\n');
    const blob = new Blob([jsonlContent], { type: 'application/x-ndjson;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `backtest_trades_${Date.now()}.jsonl`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Filtered & Sorted Trade List
  const filteredTrades = useMemo(() => {
    if (!result?.trades) return [];

    let list = [...result.trades];

    if (tradeFilterSymbol !== 'ALL') {
      list = list.filter(t => t.symbol === tradeFilterSymbol);
    }
    if (tradeFilterStrategy !== 'ALL') {
      list = list.filter(t => t.strategy === tradeFilterStrategy);
    }
    if (tradeFilterOutcome === 'WIN') {
      list = list.filter(t => t.netPnl > 0);
    } else if (tradeFilterOutcome === 'LOSS') {
      list = list.filter(t => t.netPnl < 0);
    }

    list.sort((a, b) => {
      const aVal = a[tradeSortColumn] ?? 0;
      const bVal = b[tradeSortColumn] ?? 0;
      if (aVal < bVal) return tradeSortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return tradeSortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return list;
  }, [result?.trades, tradeFilterSymbol, tradeFilterStrategy, tradeFilterOutcome, tradeSortColumn, tradeSortDirection]);

  // Derived unique symbols & strategies from actual trade list
  const tradeSymbols = useMemo(() => {
    if (!result?.trades) return [];
    return Array.from(new Set(result.trades.map(t => t.symbol)));
  }, [result?.trades]);

  const tradeStrategies = useMemo(() => {
    if (!result?.trades) return [];
    return Array.from(new Set(result.trades.map(t => t.strategy)));
  }, [result?.trades]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12 font-mono text-gray-200">
      {/* Top Banner */}
      <div className="bg-[#161B22] border border-[#30363D] rounded-xl p-5 shadow-lg flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-emerald-400 flex items-center gap-2">
            <BarChart2 className="w-5 h-5" /> HISTORICAL STRATEGY BACKTESTER
          </h2>
          <p className="text-xs text-gray-400 mt-1">
            Simulate identical live StrategySignal adapters across historical Binance USDT-M candles. Zero lookahead, intrabar SL priority, and exact fee/GST drag.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {isRunning ? (
            <button
              onClick={handleCancelBacktest}
              className="flex items-center gap-2 px-4 py-2 bg-rose-500/20 border border-rose-500/40 text-rose-400 rounded-md text-xs font-bold hover:bg-rose-500/30 transition cursor-pointer"
            >
              <Square size={14} /> CANCEL RUN
            </button>
          ) : (
            <button
              onClick={handleRunBacktest}
              className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-md text-xs font-bold transition shadow-lg cursor-pointer"
            >
              <Play size={14} /> RUN BACKTEST
            </button>
          )}
        </div>
      </div>

      {/* Progress Bar & Status */}
      {isRunning && jobStatus && (
        <div className="bg-[#161B22] border border-blue-500/40 rounded-xl p-5 shadow-lg space-y-3 animate-pulse">
          <div className="flex items-center justify-between text-xs font-semibold">
            <span className="text-blue-400 flex items-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin text-blue-400" />
              {jobStatus.message || 'Running simulation...'}
            </span>
            <span className="text-gray-300 font-bold">{jobStatus.progress}%</span>
          </div>
          <div className="w-full bg-[#21262D] rounded-full h-2.5 overflow-hidden">
            <div
              className="bg-gradient-to-r from-blue-500 to-emerald-400 h-2.5 rounded-full transition-all duration-300"
              style={{ width: `${Math.max(5, jobStatus.progress)}%` }}
            />
          </div>
        </div>
      )}

      {errorMsg && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-xs text-red-400 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Configuration Form */}
      <div className="bg-[#161B22] border border-[#30363D] rounded-xl p-5 shadow-md space-y-5">
        <div className="text-xs font-bold text-gray-300 uppercase tracking-wider flex items-center gap-2 pb-2 border-b border-[#30363D]">
          <Layers size={14} className="text-blue-400" /> Backtest Parameters
        </div>

        {/* 1. Strategy Multi-Select */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="text-xs font-bold text-gray-300">
              Strategies ({selectedStrategies.length} selected)
            </label>
            <div className="flex items-center gap-2 text-[10px]">
              <button onClick={handleSelectAllStrategies} className="text-blue-400 hover:underline cursor-pointer">Select All</button>
              <span className="text-gray-600">|</span>
              <button onClick={handleClearStrategies} className="text-gray-400 hover:underline cursor-pointer">Clear</button>
              <span className="text-gray-600">|</span>
              <button onClick={() => handlePresetStrategies('trend')} className="text-emerald-400 hover:underline cursor-pointer">Trend</button>
              <span className="text-gray-600">|</span>
              <button onClick={() => handlePresetStrategies('breakout')} className="text-indigo-400 hover:underline cursor-pointer">Breakout</button>
              <span className="text-gray-600">|</span>
              <button onClick={() => handlePresetStrategies('range')} className="text-cyan-400 hover:underline cursor-pointer">Range</button>
              <span className="text-gray-600">|</span>
              <button onClick={() => handlePresetStrategies('ema5')} className="text-amber-400 hover:underline cursor-pointer">EMA5</button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {availableStrategies.map(strat => {
              const active = selectedStrategies.includes(strat.id);
              return (
                <button
                  key={strat.id}
                  onClick={() => {
                    setSelectedStrategies(prev =>
                      prev.includes(strat.id) ? prev.filter(id => id !== strat.id) : [...prev, strat.id]
                    );
                  }}
                  className={`flex items-start gap-2 p-2 rounded text-left text-xs border transition cursor-pointer ${
                    active
                      ? 'bg-blue-500/10 border-blue-500/40 text-blue-300 font-semibold'
                      : 'bg-[#21262D] border-[#30363D] text-gray-400 hover:bg-[#282E37]'
                  }`}
                >
                  <div className="mt-0.5">
                    {active ? <CheckSquare size={13} className="text-blue-400" /> : <SquareOutline size={13} />}
                  </div>
                  <div className="overflow-hidden">
                    <div className="truncate text-[11px]">{strat.name}</div>
                    <div className="text-[9px] text-gray-500 uppercase">{strat.regime} (P{strat.priority})</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* 2. Symbols Multi-Select */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-gray-300">
              Symbols ({selectedSymbols.length} selected)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="ADD PAIR (e.g. SOL)"
                value={customSymbolInput}
                onChange={e => setCustomSymbolInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddCustomSymbol()}
                className="px-2 py-0.5 bg-[#21262D] border border-[#30363D] text-[10px] rounded text-gray-200 focus:outline-hidden focus:border-blue-400"
              />
              <button
                onClick={handleAddCustomSymbol}
                className="px-2 py-0.5 bg-[#30363D] hover:bg-[#3C444D] text-[10px] rounded text-gray-300 cursor-pointer"
              >
                + Add
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {DEFAULT_SYMBOLS.map(sym => {
              const active = selectedSymbols.includes(sym);
              return (
                <button
                  key={sym}
                  onClick={() => handleToggleSymbol(sym)}
                  className={`px-2.5 py-1 text-[11px] rounded border transition cursor-pointer ${
                    active
                      ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300 font-bold'
                      : 'bg-[#21262D] border-[#30363D] text-gray-400 hover:bg-[#282E37]'
                  }`}
                >
                  {sym.replace('USDT', '')}
                </button>
              );
            })}
            {selectedSymbols.filter(s => !DEFAULT_SYMBOLS.includes(s)).map(sym => (
              <button
                key={sym}
                onClick={() => handleToggleSymbol(sym)}
                className="px-2.5 py-1 text-[11px] rounded border bg-emerald-500/20 border-emerald-500/40 text-emerald-300 font-bold cursor-pointer"
              >
                {sym.replace('USDT', '')}
              </button>
            ))}
          </div>
        </div>

        {/* 3. Timeframes & Date Range */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="text-[11px] text-gray-400 font-semibold">Execution Timeframe</label>
            <select
              value={execTf}
              onChange={e => setExecTf(e.target.value)}
              className="mt-1 w-full bg-[#21262D] border border-[#30363D] text-xs p-2 rounded text-gray-200 focus:border-blue-400"
            >
              <option value="5m">5m (Intraday Momentum)</option>
              <option value="15m">15m (Standard Execution)</option>
              <option value="30m">30m (Swing Entry)</option>
              <option value="1h">1h (Macro Setup)</option>
            </select>
          </div>

          <div>
            <label className="text-[11px] text-gray-400 font-semibold">Direction / HTF Frame</label>
            <select
              value={dirTf}
              onChange={e => setDirTf(e.target.value)}
              className="mt-1 w-full bg-[#21262D] border border-[#30363D] text-xs p-2 rounded text-gray-200 focus:border-blue-400"
            >
              <option value="15m">15m</option>
              <option value="1h">1h (Standard HTF)</option>
              <option value="4h">4h (Macro Trend)</option>
              <option value="1d">1D (Daily Structure)</option>
            </select>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label className="text-[11px] text-gray-400 font-semibold">Start Date</label>
              <div className="flex gap-1 text-[9px] text-blue-400">
                <button onClick={() => handleSetDays(7)} className="hover:underline cursor-pointer">7d</button>
                <button onClick={() => handleSetDays(14)} className="hover:underline cursor-pointer">14d</button>
                <button onClick={() => handleSetDays(30)} className="hover:underline cursor-pointer">30d</button>
                <button onClick={() => handleSetDays(90)} className="hover:underline cursor-pointer">90d</button>
              </div>
            </div>
            <input
              type="date"
              value={fromDateStr}
              onChange={e => setFromDateStr(e.target.value)}
              className="mt-1 w-full bg-[#21262D] border border-[#30363D] text-xs p-2 rounded text-gray-200"
            />
          </div>

          <div>
            <label className="text-[11px] text-gray-400 font-semibold">End Date</label>
            <input
              type="date"
              value={toDateStr}
              onChange={e => setToDateStr(e.target.value)}
              className="mt-1 w-full bg-[#21262D] border border-[#30363D] text-xs p-2 rounded text-gray-200"
            />
          </div>
        </div>

        {/* 4. Sizing, Capital & Mode */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <label className="text-[11px] text-gray-400 font-semibold">Initial Capital ($)</label>
            <input
              type="number"
              value={capital}
              onChange={e => setCapital(parseFloat(e.target.value) || 0)}
              className="mt-1 w-full bg-[#21262D] border border-[#30363D] text-xs p-2 rounded text-gray-200"
            />
          </div>

          <div>
            <label className="text-[11px] text-gray-400 font-semibold">Account Risk (%)</label>
            <input
              type="number"
              step="0.1"
              value={accountRiskPct}
              onChange={e => setAccountRiskPct(parseFloat(e.target.value) || 0)}
              className="mt-1 w-full bg-[#21262D] border border-[#30363D] text-xs p-2 rounded text-gray-200"
            />
          </div>

          <div>
            <label className="text-[11px] text-gray-400 font-semibold">Leverage (x)</label>
            <input
              type="number"
              value={leverage}
              onChange={e => setLeverage(parseInt(e.target.value, 10) || 1)}
              className="mt-1 w-full bg-[#21262D] border border-[#30363D] text-xs p-2 rounded text-gray-200"
            />
          </div>

          <div>
            <label className="text-[11px] text-gray-400 font-semibold">Simulation Mode</label>
            <select
              value={mode}
              onChange={e => setMode(e.target.value as 'single' | 'portfolio')}
              className="mt-1 w-full bg-[#21262D] border border-[#30363D] text-xs p-2 rounded text-gray-200"
            >
              <option value="portfolio">Portfolio Mode (AutoTrader Priority & Concurrency)</option>
              <option value="single">Single Mode (Direct Strategy Execution)</option>
            </select>
          </div>
        </div>

        {/* 5. Advanced Risk & Costs Accordion */}
        <div>
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-200 cursor-pointer"
          >
            {showAdvanced ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            <span>Risk Controls & Friction Settings ({enableFees ? 'Fees ON' : 'Fees OFF'}, {enableSlippage ? 'Slippage ON' : 'Slippage OFF'})</span>
          </button>

          {showAdvanced && (
            <div className="mt-3 p-4 bg-[#0E1117] border border-[#30363D] rounded-lg grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="text-[11px] text-gray-400">Max Concurrent Trades</label>
                <input
                  type="number"
                  value={maxConcurrentTrades}
                  onChange={e => setMaxConcurrentTrades(parseInt(e.target.value, 10) || 1)}
                  className="mt-1 w-full bg-[#21262D] border border-[#30363D] text-xs p-2 rounded text-gray-200"
                />
              </div>

              <div>
                <label className="text-[11px] text-gray-400">Daily Loss Limit (%)</label>
                <input
                  type="number"
                  step="0.5"
                  value={dailyLossLimitPct}
                  onChange={e => setDailyLossLimitPct(parseFloat(e.target.value) || 0)}
                  className="mt-1 w-full bg-[#21262D] border border-[#30363D] text-xs p-2 rounded text-gray-200"
                />
              </div>

              <div>
                <label className="text-[11px] text-gray-400">Trailing Stop Trigger</label>
                <select
                  value={trailingStopActivation}
                  onChange={e => setTrailingStopActivation(e.target.value as any)}
                  className="mt-1 w-full bg-[#21262D] border border-[#30363D] text-xs p-2 rounded text-gray-200"
                >
                  <option value="TP1">After TP1 Hit</option>
                  <option value="1R">After 1R Gain</option>
                  <option value="2R">After 2R Gain</option>
                  <option value="OFF">Disabled</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] text-gray-400">Trail ATR Multiple</label>
                <input
                  type="number"
                  step="0.1"
                  value={trailAtrMultiple}
                  onChange={e => setTrailAtrMultiple(parseFloat(e.target.value) || 1.5)}
                  className="mt-1 w-full bg-[#21262D] border border-[#30363D] text-xs p-2 rounded text-gray-200"
                />
              </div>

              <div>
                <label className="text-[11px] text-gray-400 flex items-center justify-between">
                  <span>Taker Fee (%)</span>
                  <input
                    type="checkbox"
                    checked={enableFees}
                    onChange={e => setEnableFees(e.target.checked)}
                    className="cursor-pointer"
                  />
                </label>
                <input
                  type="number"
                  step="0.01"
                  disabled={!enableFees}
                  value={takerFeePct}
                  onChange={e => setTakerFeePct(parseFloat(e.target.value) || 0)}
                  className="mt-1 w-full bg-[#21262D] border border-[#30363D] text-xs p-2 rounded text-gray-200 disabled:opacity-40"
                />
              </div>

              <div>
                <label className="text-[11px] text-gray-400">GST on Fees (%)</label>
                <input
                  type="number"
                  disabled={!enableFees}
                  value={gstPct}
                  onChange={e => setGstPct(parseFloat(e.target.value) || 0)}
                  className="mt-1 w-full bg-[#21262D] border border-[#30363D] text-xs p-2 rounded text-gray-200 disabled:opacity-40"
                />
              </div>

              <div>
                <label className="text-[11px] text-gray-400 flex items-center justify-between">
                  <span>Slippage (%)</span>
                  <input
                    type="checkbox"
                    checked={enableSlippage}
                    onChange={e => setEnableSlippage(e.target.checked)}
                    className="cursor-pointer"
                  />
                </label>
                <input
                  type="number"
                  step="0.01"
                  disabled={!enableSlippage}
                  value={slippagePct}
                  onChange={e => setSlippagePct(parseFloat(e.target.value) || 0)}
                  className="mt-1 w-full bg-[#21262D] border border-[#30363D] text-xs p-2 rounded text-gray-200 disabled:opacity-40"
                />
              </div>

              <div>
                <label className="text-[11px] text-gray-400">Max Drawdown Halt (%)</label>
                <input
                  type="number"
                  value={maxDrawdownPct}
                  onChange={e => setMaxDrawdownPct(parseFloat(e.target.value) || 0)}
                  className="mt-1 w-full bg-[#21262D] border border-[#30363D] text-xs p-2 rounded text-gray-200"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* RESULTS DASHBOARD */}
      {result && result.summary && (
        <div className="space-y-6">
          {/* Header & Export Actions */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-gray-200 flex items-center gap-2">
                <Activity size={18} className="text-emerald-400" />
                SIMULATION RESULTS
              </h3>
              <div className="text-xs text-gray-400 mt-0.5">
                Processed in {(result.durationMs / 1000).toFixed(1)}s • Total Trades: {result.summary.totalTrades}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleExportCSV}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#21262D] hover:bg-[#30363D] border border-[#30363D] rounded text-xs text-gray-200 cursor-pointer"
              >
                <Download size={13} /> Export CSV
              </button>
              <button
                onClick={handleExportJSONL}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#21262D] hover:bg-[#30363D] border border-[#30363D] rounded text-xs text-gray-200 cursor-pointer"
              >
                <Download size={13} /> Export JSONL
              </button>
            </div>
          </div>

          {/* KPI Cards Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {/* 1. Net P&L */}
            <div className="bg-[#161B22] border border-[#30363D] rounded-xl p-3.5">
              <div className="text-[10px] text-gray-500 font-bold uppercase">Net P&L</div>
              <div className={`text-base font-bold mt-1 ${result.summary.netPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {result.summary.netPnl >= 0 ? '+' : ''}${result.summary.netPnl.toFixed(2)}
              </div>
              <div className="text-[10px] text-gray-400 mt-0.5">
                {result.summary.totalReturnPct >= 0 ? '+' : ''}{result.summary.totalReturnPct.toFixed(2)}% return
              </div>
            </div>

            {/* 2. Win Rate */}
            <div className="bg-[#161B22] border border-[#30363D] rounded-xl p-3.5">
              <div className="text-[10px] text-gray-500 font-bold uppercase">Win Rate</div>
              <div className="text-base font-bold text-gray-200 mt-1">
                {result.summary.winRate.toFixed(1)}%
              </div>
              <div className="text-[10px] text-gray-400 mt-0.5">
                {result.summary.winningTrades}W / {result.summary.losingTrades}L
              </div>
            </div>

            {/* 3. Profit Factor */}
            <div className="bg-[#161B22] border border-[#30363D] rounded-xl p-3.5">
              <div className="text-[10px] text-gray-500 font-bold uppercase">Profit Factor</div>
              <div className={`text-base font-bold mt-1 ${result.summary.profitFactor >= 1.5 ? 'text-emerald-400' : result.summary.profitFactor >= 1.0 ? 'text-gray-200' : 'text-rose-400'}`}>
                {result.summary.profitFactor.toFixed(2)}
              </div>
              <div className="text-[10px] text-gray-400 mt-0.5">
                Gross: ${result.summary.grossPnl.toFixed(2)}
              </div>
            </div>

            {/* 4. Expectancy (R) */}
            <div className="bg-[#161B22] border border-[#30363D] rounded-xl p-3.5">
              <div className="text-[10px] text-gray-500 font-bold uppercase">Expectancy (R)</div>
              <div className={`text-base font-bold mt-1 ${result.summary.expectancyR >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {result.summary.expectancyR >= 0 ? '+' : ''}{result.summary.expectancyR.toFixed(2)}R
              </div>
              <div className="text-[10px] text-gray-400 mt-0.5">
                Avg R: {result.summary.avgR.toFixed(2)}R
              </div>
            </div>

            {/* 5. Max Drawdown */}
            <div className="bg-[#161B22] border border-[#30363D] rounded-xl p-3.5">
              <div className="text-[10px] text-gray-500 font-bold uppercase">Max Drawdown</div>
              <div className="text-base font-bold text-rose-400 mt-1">
                -{result.summary.maxDrawdownPct.toFixed(2)}%
              </div>
              <div className="text-[10px] text-gray-400 mt-0.5">
                -${result.summary.maxDrawdownDollars.toFixed(2)}
              </div>
            </div>

            {/* 6. Fee Drag */}
            <div className="bg-[#161B22] border border-[#30363D] rounded-xl p-3.5">
              <div className="text-[10px] text-gray-500 font-bold uppercase">Fee Drag %</div>
              <div className="text-base font-bold text-amber-400 mt-1">
                {result.summary.feeDragPct.toFixed(1)}%
              </div>
              <div className="text-[10px] text-gray-400 mt-0.5">
                Fees: ${result.summary.totalFees.toFixed(2)}
              </div>
            </div>
          </div>

          {/* Equity & Drawdown Chart (SVG) */}
          <div className="bg-[#161B22] border border-[#30363D] rounded-xl p-5 shadow-md space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-xs font-bold text-gray-300 uppercase tracking-wider flex items-center gap-2">
                <TrendingUp size={14} className="text-emerald-400" /> Dynamic Equity Curve & Drawdown
              </div>
              <div className="text-[10px] text-gray-400">
                Start: ${result.summary.initialCapital.toFixed(2)} ➔ End: ${result.summary.finalCapital.toFixed(2)}
              </div>
            </div>

            {/* SVG Chart */}
            <EquityChart equityCurve={result.summary.equityCurve} />
          </div>

          {/* Middle Row: R-Distribution & Gross vs Net Comparison */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* R-Distribution Histogram */}
            <div className="bg-[#161B22] border border-[#30363D] rounded-xl p-4 shadow-md space-y-3">
              <div className="text-xs font-bold text-gray-300 uppercase tracking-wider">
                R-Distribution Histogram
              </div>
              <div className="space-y-2 pt-1">
                {result.summary.rDistribution.map((bin, i) => (
                  <div key={i} className="flex items-center gap-3 text-xs">
                    <span className="w-24 text-[10px] text-gray-400 truncate">{bin.bin}</span>
                    <div className="flex-1 bg-[#21262D] rounded-sm h-3.5 overflow-hidden flex items-center">
                      <div
                        className={`h-full ${
                          bin.bin.includes('-') || bin.bin.startsWith('<') ? 'bg-rose-500/70' : 'bg-emerald-500/70'
                        }`}
                        style={{ width: `${Math.max(bin.percentage > 0 ? 4 : 0, bin.percentage)}%` }}
                      />
                    </div>
                    <span className="w-12 text-right text-[10px] text-gray-300 font-semibold">
                      {bin.count} ({bin.percentage.toFixed(0)}%)
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Friction & Rejections Card */}
            <div className="bg-[#161B22] border border-[#30363D] rounded-xl p-4 shadow-md space-y-4">
              <div className="text-xs font-bold text-gray-300 uppercase tracking-wider">
                Costs & Risk Gating Breakdown
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3 bg-[#0E1117] border border-[#30363D] rounded-lg">
                  <div className="text-[10px] text-gray-500 font-semibold">GROSS PROFIT</div>
                  <div className="text-sm font-bold text-emerald-400 mt-0.5">
                    +${(result.summary.grossPnl + result.summary.totalFees).toFixed(2)}
                  </div>
                </div>

                <div className="p-3 bg-[#0E1117] border border-[#30363D] rounded-lg">
                  <div className="text-[10px] text-gray-500 font-semibold">TOTAL FEES (0.05% + GST)</div>
                  <div className="text-sm font-bold text-amber-400 mt-0.5">
                    -${result.summary.totalFees.toFixed(2)}
                  </div>
                </div>

                <div className="p-3 bg-[#0E1117] border border-[#30363D] rounded-lg">
                  <div className="text-[10px] text-gray-500 font-semibold">SLIPPAGE FRICTION</div>
                  <div className="text-sm font-bold text-gray-300 mt-0.5">
                    -${result.summary.totalSlippageCost.toFixed(2)}
                  </div>
                </div>

                <div className="p-3 bg-[#0E1117] border border-[#30363D] rounded-lg">
                  <div className="text-[10px] text-gray-500 font-semibold">AVG HOLDING BARS</div>
                  <div className="text-sm font-bold text-gray-300 mt-0.5">
                    {result.summary.avgHoldingBars.toFixed(1)} bars ({result.summary.avgHoldingDurationHours.toFixed(1)}h)
                  </div>
                </div>
              </div>

              {/* Rejection counts */}
              <div>
                <div className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-2">
                  Signal Gating Rejections:
                </div>
                <div className="flex flex-wrap gap-2 text-[10px]">
                  <span className="px-2 py-1 bg-[#21262D] rounded border border-[#30363D] text-gray-300">
                    Max Concurrent: {result.summary.rejectionCounts.MAX_CONCURRENT_TRADES || 0}
                  </span>
                  <span className="px-2 py-1 bg-[#21262D] rounded border border-[#30363D] text-gray-300">
                    Daily Loss: {result.summary.rejectionCounts.DAILY_LOSS_LIMIT || 0}
                  </span>
                  <span className="px-2 py-1 bg-[#21262D] rounded border border-[#30363D] text-gray-300">
                    Drawdown: {result.summary.rejectionCounts.MAX_DRAWDOWN_LIMIT || 0}
                  </span>
                  <span className="px-2 py-1 bg-[#21262D] rounded border border-[#30363D] text-gray-300">
                    Min R:R: {result.summary.rejectionCounts.MIN_RR_FAIL || 0}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Breakdown Tables: Per Strategy & Per Symbol */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* By Strategy */}
            <div className="bg-[#161B22] border border-[#30363D] rounded-xl p-4 shadow-md space-y-3">
              <div className="text-xs font-bold text-gray-300 uppercase tracking-wider">
                Performance By Strategy
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[11px]">
                  <thead>
                    <tr className="border-b border-[#30363D] text-gray-400">
                      <th className="py-2">Strategy</th>
                      <th className="py-2 text-right">Trades</th>
                      <th className="py-2 text-right">Win Rate</th>
                      <th className="py-2 text-right">Net P&L</th>
                      <th className="py-2 text-right">Net R</th>
                      <th className="py-2 text-right">PF</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#21262D]">
                    {(Object.values(result.summary.byStrategy) as StrategyMetricSummary[]).map(s => (
                      <tr key={s.strategy} className="hover:bg-[#21262D]/50">
                        <td className="py-2 font-medium text-gray-200">{s.strategy}</td>
                        <td className="py-2 text-right">{s.totalTrades}</td>
                        <td className="py-2 text-right">{s.winRate.toFixed(1)}%</td>
                        <td className={`py-2 text-right font-bold ${s.netPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          ${s.netPnl.toFixed(2)}
                        </td>
                        <td className="py-2 text-right">{s.netR >= 0 ? '+' : ''}{s.netR.toFixed(1)}R</td>
                        <td className="py-2 text-right">{s.profitFactor.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* By Symbol */}
            <div className="bg-[#161B22] border border-[#30363D] rounded-xl p-4 shadow-md space-y-3">
              <div className="text-xs font-bold text-gray-300 uppercase tracking-wider">
                Performance By Symbol
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[11px]">
                  <thead>
                    <tr className="border-b border-[#30363D] text-gray-400">
                      <th className="py-2">Symbol</th>
                      <th className="py-2 text-right">Trades</th>
                      <th className="py-2 text-right">Win Rate</th>
                      <th className="py-2 text-right">Net P&L</th>
                      <th className="py-2 text-right">Net R</th>
                      <th className="py-2 text-right">PF</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#21262D]">
                    {(Object.values(result.summary.bySymbol) as SymbolMetricSummary[]).map(sym => (
                      <tr key={sym.symbol} className="hover:bg-[#21262D]/50">
                        <td className="py-2 font-bold text-emerald-400">{sym.symbol}</td>
                        <td className="py-2 text-right">{sym.totalTrades}</td>
                        <td className="py-2 text-right">{sym.winRate.toFixed(1)}%</td>
                        <td className={`py-2 text-right font-bold ${sym.netPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          ${sym.netPnl.toFixed(2)}
                        </td>
                        <td className="py-2 text-right">{sym.netR >= 0 ? '+' : ''}{sym.netR.toFixed(1)}R</td>
                        <td className="py-2 text-right">{sym.profitFactor.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Trade List Table */}
          <div className="bg-[#161B22] border border-[#30363D] rounded-xl p-5 shadow-md space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="text-xs font-bold text-gray-300 uppercase tracking-wider flex items-center gap-2">
                <Layers size={14} className="text-blue-400" />
                Completed Trade Ledger ({filteredTrades.length} of {result.trades.length})
              </div>

              {/* Filters */}
              <div className="flex flex-wrap items-center gap-2 text-xs">
                {/* Symbol filter */}
                <select
                  value={tradeFilterSymbol}
                  onChange={e => setTradeFilterSymbol(e.target.value)}
                  className="bg-[#21262D] border border-[#30363D] text-[11px] p-1.5 rounded text-gray-300"
                >
                  <option value="ALL">All Symbols</option>
                  {tradeSymbols.map(s => <option key={s} value={s}>{s}</option>)}
                </select>

                {/* Strategy filter */}
                <select
                  value={tradeFilterStrategy}
                  onChange={e => setTradeFilterStrategy(e.target.value)}
                  className="bg-[#21262D] border border-[#30363D] text-[11px] p-1.5 rounded text-gray-300"
                >
                  <option value="ALL">All Strategies</option>
                  {tradeStrategies.map(s => <option key={s} value={s}>{s}</option>)}
                </select>

                {/* Outcome filter */}
                <select
                  value={tradeFilterOutcome}
                  onChange={e => setTradeFilterOutcome(e.target.value as any)}
                  className="bg-[#21262D] border border-[#30363D] text-[11px] p-1.5 rounded text-gray-300"
                >
                  <option value="ALL">All Outcomes</option>
                  <option value="WIN">Winners Only</option>
                  <option value="LOSS">Losses Only</option>
                </select>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto max-h-[500px]">
              <table className="w-full text-left text-[11px]">
                <thead className="sticky top-0 bg-[#161B22] border-b border-[#30363D] text-gray-400">
                  <tr>
                    <th className="py-2.5 px-2">Symbol</th>
                    <th className="py-2.5 px-2">Strategy</th>
                    <th className="py-2.5 px-2">Side</th>
                    <th className="py-2.5 px-2">Entry Time</th>
                    <th className="py-2.5 px-2 text-right">Entry ($)</th>
                    <th className="py-2.5 px-2 text-right">Exit ($)</th>
                    <th className="py-2.5 px-2">Reason</th>
                    <th className="py-2.5 px-2 text-right">Bars</th>
                    <th className="py-2.5 px-2 text-right">Gross ($)</th>
                    <th className="py-2.5 px-2 text-right">Fees ($)</th>
                    <th className="py-2.5 px-2 text-right">Net P&L ($)</th>
                    <th className="py-2.5 px-2 text-right">Net R</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#21262D]">
                  {filteredTrades.map(trade => (
                    <tr key={trade.id} className="hover:bg-[#21262D]/50 transition">
                      <td className="py-2 px-2 font-bold text-gray-200">{trade.symbol}</td>
                      <td className="py-2 px-2 text-gray-400 max-w-[140px] truncate" title={trade.strategy}>
                        {trade.strategy}
                      </td>
                      <td className="py-2 px-2">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          trade.direction === 'LONG' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                        }`}>
                          {trade.direction}
                        </span>
                      </td>
                      <td className="py-2 px-2 text-gray-400 whitespace-nowrap">
                        {new Date(trade.entryTime).toISOString().slice(5, 16).replace('T', ' ')}
                      </td>
                      <td className="py-2 px-2 text-right text-gray-300">{trade.entryPrice.toFixed(4)}</td>
                      <td className="py-2 px-2 text-right text-gray-300">{trade.exitPrice.toFixed(4)}</td>
                      <td className="py-2 px-2">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                          trade.exitReason === 'SL' ? 'bg-rose-500/20 text-rose-400' :
                          trade.exitReason.startsWith('TP') ? 'bg-emerald-500/20 text-emerald-400' :
                          'bg-gray-500/20 text-gray-400'
                        }`}>
                          {trade.exitReason}
                        </span>
                      </td>
                      <td className="py-2 px-2 text-right text-gray-400">{trade.holdingBars}</td>
                      <td className="py-2 px-2 text-right text-gray-400">${trade.grossPnl.toFixed(2)}</td>
                      <td className="py-2 px-2 text-right text-amber-400/80">-${trade.fees.toFixed(2)}</td>
                      <td className={`py-2 px-2 text-right font-bold ${trade.netPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {trade.netPnl >= 0 ? '+' : ''}${trade.netPnl.toFixed(2)}
                      </td>
                      <td className={`py-2 px-2 text-right font-bold ${trade.netR >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {trade.netR >= 0 ? '+' : ''}{trade.netR.toFixed(2)}R
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Pure Dynamic SVG Equity Curve & Drawdown Component
// ─────────────────────────────────────────────────────────────────────────────
function EquityChart({ equityCurve }: { equityCurve: EquityPoint[] }) {
  if (!equityCurve || equityCurve.length < 2) {
    return (
      <div className="h-48 flex items-center justify-center text-xs text-gray-500">
        Insufficient trade data to plot equity curve.
      </div>
    );
  }

  const width = 800;
  const height = 240;
  const padding = { top: 20, right: 30, bottom: 40, left: 60 };

  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;

  const minBalance = Math.min(...equityCurve.map(e => e.balance));
  const maxBalance = Math.max(...equityCurve.map(e => e.balance));
  const balanceRange = maxBalance - minBalance || 1;

  // Scale functions
  const getX = (index: number) => padding.left + (index / (equityCurve.length - 1)) * innerWidth;
  const getY = (val: number) => padding.top + innerHeight - ((val - minBalance) / balanceRange) * innerHeight;

  // Polyline points
  const points = equityCurve.map((pt, i) => `${getX(i)},${getY(pt.balance)}`).join(' ');

  // Area under curve points
  const areaPoints = `${getX(0)},${padding.top + innerHeight} ${points} ${getX(equityCurve.length - 1)},${padding.top + innerHeight}`;

  const isProfitable = equityCurve[equityCurve.length - 1].balance >= equityCurve[0].balance;
  const strokeColor = isProfitable ? '#34D399' : '#F87171';
  const fillColor = isProfitable ? 'rgba(52, 211, 153, 0.15)' : 'rgba(248, 113, 113, 0.15)';

  return (
    <div className="w-full overflow-hidden">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto select-none">
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((pct, i) => {
          const y = padding.top + innerHeight * pct;
          const val = maxBalance - pct * balanceRange;
          return (
            <g key={i}>
              <line
                x1={padding.left}
                y1={y}
                x2={width - padding.right}
                y2={y}
                stroke="#21262D"
                strokeDasharray="4 4"
              />
              <text
                x={padding.left - 8}
                y={y + 3}
                fill="#6E7681"
                fontSize="9"
                textAnchor="end"
                fontFamily="monospace"
              >
                ${val.toFixed(0)}
              </text>
            </g>
          );
        })}

        {/* Shaded Area */}
        <polygon points={areaPoints} fill={fillColor} />

        {/* Equity Line */}
        <polyline
          points={points}
          fill="none"
          stroke={strokeColor}
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* Baseline (start capital) */}
        <line
          x1={padding.left}
          y1={getY(equityCurve[0].balance)}
          x2={width - padding.right}
          y2={getY(equityCurve[0].balance)}
          stroke="#484F58"
          strokeWidth="1"
          strokeDasharray="2 2"
        />

        {/* Start / End Markers */}
        <circle cx={getX(0)} cy={getY(equityCurve[0].balance)} r="3" fill="#9CA3AF" />
        <circle cx={getX(equityCurve.length - 1)} cy={getY(equityCurve[equityCurve.length - 1].balance)} r="4" fill={strokeColor} />

        {/* X axis labels */}
        <text
          x={padding.left}
          y={height - 10}
          fill="#6E7681"
          fontSize="9"
          fontFamily="monospace"
        >
          {new Date(equityCurve[0].time).toLocaleDateString()}
        </text>
        <text
          x={width - padding.right}
          y={height - 10}
          fill="#6E7681"
          fontSize="9"
          textAnchor="end"
          fontFamily="monospace"
        >
          {new Date(equityCurve[equityCurve.length - 1].time).toLocaleDateString()}
        </text>
      </svg>
    </div>
  );
}
