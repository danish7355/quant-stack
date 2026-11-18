import React, { useState, useMemo } from 'react';
import {
  Droplets,
  RotateCcw,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  Layers,
  Clock,
  Compass,
  Zap,
  Target,
  ShieldAlert,
  ShieldCheck,
  Percent,
  TrendingUp,
  BarChart3,
  Play,
  Info,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import {
  LsrV2Config,
  LsrPresetName,
  LSR_PRESETS,
  applyLsrPreset,
  resolveLsrConfig,
  validateLsrConfig,
  calcFeeShareOfR
} from '../utils/strategies/lsr.config';
import { runLsrBacktest, LsrBacktestResult } from '../utils/strategies/lsrBacktester';
import { AppSettings } from '../types';

interface LsrConfigSectionProps {
  settings: AppSettings;
  onUpdateSettings: (newSettings: Partial<AppSettings>) => void;
  candles?: any[];
  symbol?: string;
}

export const LsrConfigSection: React.FC<LsrConfigSectionProps> = ({
  settings,
  onUpdateSettings,
  candles = [],
  symbol = 'BTCUSDT'
}) => {
  const config = useMemo(() => resolveLsrConfig(settings), [settings]);
  const [activeSection, setActiveSection] = useState<string>('all');
  const [backtestResult, setBacktestResult] = useState<LsrBacktestResult | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    structure: true,
    locationPool: true,
    entry: true,
    stopTargets: true,
    exitRules: true,
    fees: true,
    funnel: true
  });

  const toggleSection = (sec: string) => {
    setExpandedSections(prev => ({ ...prev, [sec]: !prev[sec] }));
  };

  const validationErrors = useMemo(() => validateLsrConfig(config), [config]);

  // Handle Preset Change
  const handlePresetSelect = (preset: LsrPresetName) => {
    if (preset === 'Custom') return;
    const fresh = applyLsrPreset(preset);
    onUpdateSettings({
      lsrV2Config: fresh,
      lsrStrictMode: preset === 'Strict'
    });
  };

  // Reset to Current Preset
  const handleResetToPreset = () => {
    const targetPreset = config.preset === 'Custom' ? 'Balanced' : config.preset;
    const fresh = applyLsrPreset(targetPreset);
    onUpdateSettings({
      lsrV2Config: fresh,
      lsrStrictMode: targetPreset === 'Strict'
    });
  };

  // Update a nested configuration property and mark preset as Custom
  const updateField = (path: string, value: any) => {
    const next: any = JSON.parse(JSON.stringify(config));
    const parts = path.split('.');
    let cur = next;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!cur[parts[i]]) cur[parts[i]] = {};
      cur = cur[parts[i]];
    }
    cur[parts[parts.length - 1]] = value;
    next.preset = 'Custom';

    onUpdateSettings({
      lsrV2Config: next
    });
  };

  // Run Gate Funnel simulation
  const handleRunFunnelSimulation = () => {
    setIsSimulating(true);
    setTimeout(() => {
      try {
        // Generate fallback candles if not provided
        let testCandles = candles;
        if (!testCandles || testCandles.length < 50) {
          testCandles = [];
          const now = Date.now();
          for (let i = 0; i < 150; i++) {
            const price = 65000 + Math.sin(i / 8) * 1200 + (i % 15 === 0 ? -400 : 0);
            testCandles.push({
              time: now - (150 - i) * 300000,
              open: price,
              high: price + 180,
              low: price - 180,
              close: price + 25,
              volume: 1200 + Math.random() * 800
            });
          }
        }
        const res = runLsrBacktest(testCandles, config, symbol);
        setBacktestResult(res);
      } catch (e) {
        console.error('Error running gate funnel backtest:', e);
      } finally {
        setIsSimulating(false);
      }
    }, 100);
  };

  // Helper for Tooltips
  const TooltipLabel = ({ label, tooltip }: { label: string; tooltip: string }) => (
    <div className="flex items-center gap-1.5 mb-1">
      <span className="text-xs font-semibold text-gray-200">{label}</span>
      <span className="group relative cursor-help">
        <Info className="w-3.5 h-3.5 text-gray-500 hover:text-cyan-400 transition" />
        <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 hidden group-hover:block w-56 p-2 bg-[#161B22] border border-cyan-500/40 rounded-md text-[10px] text-gray-300 font-normal leading-tight z-50 shadow-xl">
          {tooltip}
        </span>
      </span>
    </div>
  );

  return (
    <div className="space-y-5">
      {/* ── 1. Presets Header ────────────────────────────────────────── */}
      <div className="bg-[#12161E] border border-cyan-500/40 rounded-xl p-4 shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-cyan-500/10 border border-cyan-500/30 rounded-xl text-cyan-400 shrink-0">
            <Droplets className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-extrabold text-white tracking-wide">
                LSR V2 CONFIGURATION & PRESETS
              </h3>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-950/80 text-cyan-300 border border-cyan-500/40 font-bold">
                {config.preset.toUpperCase()} PRESET
              </span>
            </div>
            <p className="text-xs text-gray-400 mt-0.5">
              Closed-candle institutional failed-breakout engine. Every value reads from a unified schema.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Preset Selector */}
          <div className="flex items-center gap-1.5 bg-[#0E1117] border border-[#30363D] rounded-lg p-1">
            {(['Strict', 'Balanced', 'Relaxed', 'Custom'] as LsrPresetName[]).map(p => (
              <button
                key={p}
                type="button"
                onClick={() => handlePresetSelect(p)}
                className={`px-3 py-1.5 rounded-md text-xs font-bold transition cursor-pointer ${
                  config.preset === p
                    ? 'bg-cyan-500 text-black shadow-sm'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`}
              >
                {p}
              </button>
            ))}
          </div>

          {/* Reset to Preset Button */}
          <button
            type="button"
            onClick={handleResetToPreset}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#161B22] border border-[#30363D] hover:border-gray-500 text-gray-300 hover:text-white text-xs font-semibold transition cursor-pointer"
            title="Reset all settings to preset defaults"
          >
            <RotateCcw className="w-3.5 h-3.5 text-cyan-400" />
            <span>Reset to Preset</span>
          </button>
        </div>
      </div>

      {/* Validation Banner if any errors */}
      {validationErrors.length > 0 && (
        <div className="p-3 bg-rose-950/40 border border-rose-500/50 rounded-xl space-y-1">
          <div className="flex items-center gap-2 text-rose-400 text-xs font-bold">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>Configuration Validation Errors</span>
          </div>
          <ul className="text-[11px] text-rose-300 pl-6 list-disc space-y-0.5 font-mono">
            {validationErrors.map((err, idx) => (
              <li key={idx}>{err}</li>
            ))}
          </ul>
        </div>
      )}

      {/* ── 2. Gate Funnel Diagnostic Panel (Nice-to-Have) ────────────── */}
      <div className="bg-[#0E1117] border border-indigo-500/30 rounded-xl overflow-hidden shadow-lg">
        <div 
          onClick={() => toggleSection('funnel')}
          className="p-3.5 bg-gradient-to-r from-indigo-950/40 via-purple-950/20 to-transparent border-b border-[#30363D] flex items-center justify-between cursor-pointer hover:bg-[#161B22]/50 transition"
        >
          <div className="flex items-center gap-2.5">
            <BarChart3 className="w-4 h-4 text-indigo-400" />
            <h4 className="text-xs font-extrabold text-white uppercase tracking-wider">
              Gate Funnel & Rejection Code Telemetry
            </h4>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-950/80 text-indigo-300 border border-indigo-500/40">
              AUDIT FUNNEL
            </span>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleRunFunnelSimulation();
              }}
              disabled={isSimulating}
              className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-bold transition shadow-sm cursor-pointer disabled:opacity-50"
            >
              <Play className="w-3 h-3" />
              <span>{isSimulating ? 'Simulating...' : 'Run Gate Funnel'}</span>
            </button>
            {expandedSections.funnel ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
          </div>
        </div>

        {expandedSections.funnel && (
          <div className="p-4 space-y-4">
            <p className="text-xs text-gray-400 leading-relaxed">
              Examines how many candidates each gate filtered out. Compare trade count vs net expectancy to identify gates that eliminate trades without improving outcomes.
            </p>

            {backtestResult ? (
              <div className="space-y-4">
                {/* Metric Summary */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono">
                  <div className="p-2.5 bg-[#161B22] border border-[#30363D] rounded-lg">
                    <span className="text-[10px] text-gray-400 block font-sans">Total Trades</span>
                    <span className="text-sm font-bold text-white">{backtestResult.totalTrades}</span>
                    <span className="text-[10px] text-gray-500 block">Win Rate: {backtestResult.winRatePct.toFixed(1)}%</span>
                  </div>
                  <div className="p-2.5 bg-[#161B22] border border-[#30363D] rounded-lg">
                    <span className="text-[10px] text-gray-400 block font-sans">Net PnL</span>
                    <span className={`text-sm font-bold ${backtestResult.netProfitR >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {backtestResult.netProfitR >= 0 ? `+${backtestResult.netProfitR.toFixed(2)}R` : `${backtestResult.netProfitR.toFixed(2)}R`}
                    </span>
                    <span className="text-[10px] text-gray-500 block">Exp: {backtestResult.expectancyR.toFixed(2)}R/tr</span>
                  </div>
                  <div className="p-2.5 bg-[#161B22] border border-[#30363D] rounded-lg">
                    <span className="text-[10px] text-gray-400 block font-sans">Max Drawdown</span>
                    <span className="text-sm font-bold text-amber-400">{backtestResult.maxDrawdownR.toFixed(2)}R</span>
                    <span className="text-[10px] text-gray-500 block">Profit Factor: {backtestResult.profitFactor.toFixed(2)}</span>
                  </div>
                  <div className="p-2.5 bg-[#161B22] border border-[#30363D] rounded-lg">
                    <span className="text-[10px] text-gray-400 block font-sans">Time Stop Exits</span>
                    <span className="text-sm font-bold text-cyan-400">{backtestResult.timeStops}</span>
                    <span className="text-[10px] text-gray-500 block">({((backtestResult.timeStops / (backtestResult.totalTrades || 1)) * 100).toFixed(0)}% of exits)</span>
                  </div>
                </div>

                {/* Funnel Breakdown Bars */}
                <div className="space-y-2 bg-[#161B22] p-3 rounded-xl border border-[#30363D]">
                  <span className="text-[11px] font-bold text-gray-300 uppercase tracking-wider block mb-2 font-mono">
                    Rejection Reasons Distribution
                  </span>

                  {[
                    { label: 'LOCATION_REJECT', count: backtestResult.gateFunnel.LOCATION_REJECT, color: 'bg-amber-500', desc: 'Swept level outside top/bottom range edge' },
                    { label: 'POOL_QUALITY_LOW', count: backtestResult.gateFunnel.POOL_QUALITY_LOW, color: 'bg-indigo-500', desc: 'Lone minor swing below minScore' },
                    { label: 'NO_ROOM_FOR_RR', count: backtestResult.gateFunnel.NO_ROOM_FOR_RR, color: 'bg-rose-500', desc: 'Opposing pool closer than minStructuralRR x risk' },
                    { label: 'FEE_FLOOR', count: backtestResult.gateFunnel.FEE_FLOOR, color: 'bg-orange-500', desc: 'Stop distance below roundTripFee / divisor' },
                    { label: 'VOLUME_REJECT', count: backtestResult.gateFunnel.VOLUME_REJECT, color: 'bg-blue-500', desc: 'Volume below multiplier threshold' },
                    { label: 'STAR_SHAPE_REJECT', count: backtestResult.gateFunnel.STAR_SHAPE_REJECT, color: 'bg-purple-500', desc: 'Rejection wick below star body/range threshold' },
                    { label: 'SWEEP_DEPTH_REJECT', count: backtestResult.gateFunnel.SWEEP_DEPTH_REJECT, color: 'bg-teal-500', desc: 'Sweep shallower than min ATR or runaway breakout' },
                    { label: 'REACCEPTANCE_REJECT', count: backtestResult.gateFunnel.REACCEPTANCE_REJECT, color: 'bg-cyan-500', desc: 'Took longer than max bars to close inside' }
                  ].map(row => {
                    const totalRejections = Math.max(1, backtestResult.gateFunnel.TOTAL_EVALUATED - backtestResult.gateFunnel.TOTAL_PASSED);
                    const pct = Math.min(100, (row.count / totalRejections) * 100);
                    return (
                      <div key={row.label} className="space-y-1">
                        <div className="flex items-center justify-between text-[11px] font-mono">
                          <span className="text-gray-300 flex items-center gap-1.5">
                            <span className="font-bold text-white">{row.label}</span>
                            <span className="text-[10px] text-gray-500 font-sans">({row.desc})</span>
                          </span>
                          <span className="font-bold text-gray-200">{row.count} ({pct.toFixed(1)}%)</span>
                        </div>
                        <div className="w-full h-1.5 bg-[#0E1117] rounded-full overflow-hidden">
                          <div className={`h-full ${row.color} rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="text-center py-6 border border-dashed border-[#30363D] rounded-xl space-y-2">
                <BarChart3 className="w-8 h-8 text-gray-600 mx-auto" />
                <span className="text-xs text-gray-400 block font-semibold">No Funnel Simulation Run Yet</span>
                <p className="text-[11px] text-gray-500 max-w-sm mx-auto">
                  Click &quot;Run Gate Funnel&quot; to test your current config against historical closed candles and see exact rejection counts.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── 3. Six Functional Parameter Groups ───────────────────────── */}
      <div className="space-y-4">
        {/* SECTION 1: STRUCTURE */}
        <div className="bg-[#0E1117] border border-[#30363D] rounded-xl overflow-hidden">
          <div 
            onClick={() => toggleSection('structure')}
            className="p-3.5 bg-[#161B22]/60 border-b border-[#30363D] flex items-center justify-between cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-cyan-400" />
              <h4 className="text-xs font-bold text-gray-200 uppercase tracking-wider">
                1. Structure Architecture & Sweep Depth
              </h4>
            </div>
            {expandedSections.structure ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
          </div>

          {expandedSections.structure && (
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <TooltipLabel label="Execution Timeframe" tooltip="Candle timeframe where the sweep and reclaim trigger occurs." />
                  <select
                    value={config.executionTimeframe}
                    onChange={(e) => updateField('executionTimeframe', e.target.value)}
                    className="w-full bg-[#161B22] border border-[#30363D] rounded-lg px-3 py-2 text-xs text-gray-200 focus:outline-none focus:border-cyan-500 font-mono"
                  >
                    <option value="5m">5m (Recommended for Tight Invalidation)</option>
                    <option value="15m">15m (Balanced Reversals)</option>
                    <option value="1H">1H (Macro Swing Sweeps)</option>
                  </select>
                </div>
                <div>
                  <TooltipLabel label="Context Timeframe" tooltip="Higher timeframe used for macro range boundaries and major liquidity pools." />
                  <select
                    value={config.contextTimeframe}
                    onChange={(e) => updateField('contextTimeframe', e.target.value)}
                    className="w-full bg-[#161B22] border border-[#30363D] rounded-lg px-3 py-2 text-xs text-gray-200 focus:outline-none focus:border-cyan-500 font-mono"
                  >
                    <option value="15m">15m (Primary Context)</option>
                    <option value="1H">1H (Macro Trend)</option>
                    <option value="4H">4H (Daily Bounds)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <TooltipLabel label="Structure Lookback (Bars)" tooltip="Closed bars scanned to identify swing pivots and equal level clusters." />
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min={20}
                      max={100}
                      step={5}
                      value={config.structureLookback}
                      onChange={(e) => updateField('structureLookback', parseInt(e.target.value))}
                      className="w-full accent-cyan-400"
                    />
                    <span className="text-xs font-mono font-bold text-cyan-300 w-10 text-right">{config.structureLookback}</span>
                  </div>
                </div>

                <div>
                  <TooltipLabel label="Min Sweep Depth (ATR)" tooltip="Minimum penetration beyond pool to qualify as a genuine sweep." />
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min={0.05}
                      max={0.50}
                      step={0.05}
                      value={config.sweepMinAtr}
                      onChange={(e) => updateField('sweepMinAtr', parseFloat(e.target.value))}
                      className="w-full accent-cyan-400"
                    />
                    <span className="text-xs font-mono font-bold text-cyan-300 w-10 text-right">{config.sweepMinAtr.toFixed(2)}x</span>
                  </div>
                </div>

                <div>
                  <TooltipLabel label="Max Sweep Depth (ATR)" tooltip="Maximum allowable sweep depth; sweeps exceeding this are rejected." />
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min={0.5}
                      max={2.5}
                      step={0.1}
                      value={config.sweepMaxAtr}
                      onChange={(e) => updateField('sweepMaxAtr', parseFloat(e.target.value))}
                      className="w-full accent-cyan-400"
                    />
                    <span className="text-xs font-mono font-bold text-cyan-300 w-10 text-right">{config.sweepMaxAtr.toFixed(1)}x</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                <div>
                  <TooltipLabel label="Max Reacceptance Bars" tooltip="Maximum closed bars allowed to close back inside the liquidity level." />
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min={1}
                      max={3}
                      step={1}
                      value={config.maxReacceptanceBars}
                      onChange={(e) => updateField('maxReacceptanceBars', parseInt(e.target.value))}
                      className="w-full accent-cyan-400"
                    />
                    <span className="text-xs font-mono font-bold text-cyan-300 w-10 text-right">{config.maxReacceptanceBars}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between p-2.5 bg-[#161B22] rounded-lg border border-[#30363D]">
                  <div className="flex flex-col">
                    <TooltipLabel label="Track Consumed Pools" tooltip="Retire liquidity levels after first sweep to prevent re-trading exhausted zones." />
                    <span className="text-[10px] text-gray-500">Single-use pool protection</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={config.trackConsumedPools}
                    onChange={(e) => updateField('trackConsumedPools', e.target.checked)}
                    className="w-4 h-4 accent-cyan-500 rounded cursor-pointer"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* SECTION 2: LOCATION AND POOL */}
        <div className="bg-[#0E1117] border border-[#30363D] rounded-xl overflow-hidden">
          <div 
            onClick={() => toggleSection('locationPool')}
            className="p-3.5 bg-[#161B22]/60 border-b border-[#30363D] flex items-center justify-between cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <Compass className="w-4 h-4 text-indigo-400" />
              <h4 className="text-xs font-bold text-gray-200 uppercase tracking-wider">
                2. Location Gate & Pool Quality Gate
              </h4>
            </div>
            {expandedSections.locationPool ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
          </div>

          {expandedSections.locationPool && (
            <div className="p-4 space-y-4">
              {/* Location Gate Toggle & Controls */}
              <div className="p-3.5 bg-[#161B22] border border-[#30363D] rounded-lg space-y-3">
                <div className="flex items-center justify-between border-b border-[#30363D]/60 pb-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={config.locationGate.enabled}
                      onChange={(e) => updateField('locationGate.enabled', e.target.checked)}
                      className="w-4 h-4 accent-cyan-500 rounded cursor-pointer"
                    />
                    <TooltipLabel label="Location Gate (Enable Toggle)" tooltip="Shorts only if level in top edgePct% of range; longs only in bottom edgePct%." />
                  </div>
                  <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold ${config.locationGate.enabled ? 'bg-cyan-950 text-cyan-300' : 'bg-gray-800 text-gray-500'}`}>
                    {config.locationGate.enabled ? 'ACTIVE' : 'BYPASSED'}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <TooltipLabel label="Range Edge Percentile (%)" tooltip="Range extreme threshold: Balanced default is 35% (top 35% for shorts, bottom 35% for longs)." />
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min={10}
                        max={50}
                        step={1}
                        value={config.locationGate.edgePct}
                        onChange={(e) => updateField('locationGate.edgePct', parseInt(e.target.value))}
                        disabled={!config.locationGate.enabled}
                        className="w-full accent-cyan-400 disabled:opacity-40"
                      />
                      <span className="text-xs font-mono font-bold text-cyan-300 w-12 text-right">{config.locationGate.edgePct}%</span>
                    </div>
                  </div>

                  <div>
                    <TooltipLabel label="Range Timeframe" tooltip="Measure range height on context TF (15m) to avoid 5m intraday noise." />
                    <select
                      value={config.locationGate.rangeTimeframe}
                      onChange={(e) => updateField('locationGate.rangeTimeframe', e.target.value)}
                      disabled={!config.locationGate.enabled}
                      className="w-full bg-[#0E1117] border border-[#30363D] rounded px-3 py-1.5 text-xs text-gray-200 font-mono disabled:opacity-40"
                    >
                      <option value="context">Context Timeframe (15m)</option>
                      <option value="execution">Execution Timeframe (5m)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Pool Quality Gate Toggle & Scores */}
              <div className="p-3.5 bg-[#161B22] border border-[#30363D] rounded-lg space-y-3">
                <div className="flex items-center justify-between border-b border-[#30363D]/60 pb-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={config.poolQuality.enabled}
                      onChange={(e) => updateField('poolQuality.enabled', e.target.checked)}
                      className="w-4 h-4 accent-cyan-500 rounded cursor-pointer"
                    />
                    <TooltipLabel label="Pool Quality Gate (Enable Toggle)" tooltip="Filters out lone minor swings; requires verified multi-touch or session pools." />
                  </div>
                  <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold ${config.poolQuality.enabled ? 'bg-cyan-950 text-cyan-300' : 'bg-gray-800 text-gray-500'}`}>
                    {config.poolQuality.enabled ? 'ACTIVE' : 'BYPASSED'}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <TooltipLabel label="Min Pool Score (1-4)" tooltip="Score threshold (1: allows all, 2: rejects lone swings, 3: requires equal highs/lows)." />
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min={1}
                        max={4}
                        step={1}
                        value={config.poolQuality.minScore}
                        onChange={(e) => updateField('poolQuality.minScore', parseInt(e.target.value))}
                        disabled={!config.poolQuality.enabled}
                        className="w-full accent-cyan-400 disabled:opacity-40"
                      />
                      <span className="text-xs font-mono font-bold text-cyan-300 w-8 text-right">{config.poolQuality.minScore}</span>
                    </div>
                  </div>

                  <div>
                    <TooltipLabel label="Equal High/Low Tol (ATR)" tooltip="Two swing pivots within this ATR distance count as institutional equal highs/lows." />
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min={0.02}
                        max={0.30}
                        step={0.01}
                        value={config.poolQuality.eqTolAtr}
                        onChange={(e) => updateField('poolQuality.eqTolAtr', parseFloat(e.target.value))}
                        disabled={!config.poolQuality.enabled}
                        className="w-full accent-cyan-400 disabled:opacity-40"
                      />
                      <span className="text-xs font-mono font-bold text-cyan-300 w-12 text-right">{config.poolQuality.eqTolAtr.toFixed(2)}x</span>
                    </div>
                  </div>

                  <div>
                    <TooltipLabel label="Pool Source Timeframe" tooltip="Identify high-probability institutional liquidity pools on context TF." />
                    <select
                      value={config.poolSource.timeframe}
                      onChange={(e) => updateField('poolSource.timeframe', e.target.value)}
                      className="w-full bg-[#0E1117] border border-[#30363D] rounded px-3 py-1.5 text-xs text-gray-200 font-mono"
                    >
                      <option value="context">Context Timeframe (15m)</option>
                      <option value="execution">Execution Timeframe (5m)</option>
                    </select>
                  </div>
                </div>

                {/* Editable Pool Scores */}
                <div className="pt-2 border-t border-[#30363D]/40">
                  <span className="text-[11px] font-bold text-gray-400 block mb-2 font-mono">Editable Pool Quality Point Values:</span>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                    {[
                      { key: 'equalHighsLows', label: 'Equal Highs/Lows', val: config.poolQuality.scores.equalHighsLows },
                      { key: 'prevDayHighLow', label: 'Prev Day H/L', val: config.poolQuality.scores.prevDayHighLow },
                      { key: 'sessionHighLow', label: 'Session H/L', val: config.poolQuality.scores.sessionHighLow },
                      { key: 'prevWeekHighLow', label: 'Prev Week H/L', val: config.poolQuality.scores.prevWeekHighLow },
                      { key: 'singleSwing', label: 'Single Swing', val: config.poolQuality.scores.singleSwing }
                    ].map(s => (
                      <div key={s.key} className="p-2 bg-[#0E1117] rounded border border-[#30363D]">
                        <span className="text-[10px] text-gray-400 block truncate">{s.label}</span>
                        <input
                          type="number"
                          min={1}
                          max={5}
                          value={s.val}
                          onChange={(e) => updateField(`poolQuality.scores.${s.key}`, parseInt(e.target.value) || 1)}
                          className="w-full bg-transparent text-xs font-mono font-bold text-cyan-300 focus:outline-none"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* SECTION 3: ENTRY */}
        <div className="bg-[#0E1117] border border-[#30363D] rounded-xl overflow-hidden">
          <div 
            onClick={() => toggleSection('entry')}
            className="p-3.5 bg-[#161B22]/60 border-b border-[#30363D] flex items-center justify-between cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-400" />
              <h4 className="text-xs font-bold text-gray-200 uppercase tracking-wider">
                3. Entry Modes & Candlestick Confirmation Gates
              </h4>
            </div>
            {expandedSections.entry ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
          </div>

          {expandedSections.entry && (
            <div className="p-4 space-y-4">
              <div>
                <TooltipLabel label="Entry Mode Selection" tooltip="All 5 institutional execution models remain supported." />
                <select
                  value={config.entryMode}
                  onChange={(e) => updateField('entryMode', e.target.value)}
                  className="w-full bg-[#161B22] border border-[#30363D] rounded-lg px-3 py-2 text-xs text-gray-200 font-mono"
                >
                  <option value="SWEPT_LEVEL">Swept Level Retest: Limit order at exact swept liquidity pool line</option>
                  <option value="MIDPOINT_LIMIT">C0 Midpoint: Limit order at 50% midpoint of rejection candle</option>
                  <option value="C0_CLOSE">Immediate: Market entry upon closed candle reacceptance back inside</option>
                  <option value="LITE_CLOSE">Lite: Market fill upon closed candle beyond C0 extreme within 3 bars</option>
                  <option value="DEFAULT_FVG">Default MSS+FVG: Closes beyond MSS + 50% FVG retest limit</option>
                </select>
              </div>

              {/* Star Shape Gate */}
              <div className="p-3.5 bg-[#161B22] border border-[#30363D] rounded-lg space-y-3">
                <div className="flex items-center justify-between border-b border-[#30363D]/60 pb-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={config.starShape.enabled}
                      onChange={(e) => updateField('starShape.enabled', e.target.checked)}
                      className="w-4 h-4 accent-cyan-500 rounded cursor-pointer"
                    />
                    <TooltipLabel label="Star Shape Gate (Enable Toggle)" tooltip="Candle C0 must form a shooting star / hammer with upper/lower wick threshold." />
                  </div>
                  <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold ${config.starShape.enabled ? 'bg-cyan-950 text-cyan-300' : 'bg-gray-800 text-gray-500'}`}>
                    {config.starShape.enabled ? 'ACTIVE' : 'BYPASSED'}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <TooltipLabel label="Min Wick-to-Body Ratio" tooltip="Wick must be at least this multiple of candle body (Balanced: 1.5x)." />
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min={1.0}
                        max={4.0}
                        step={0.1}
                        value={config.starShape.wickToBody}
                        onChange={(e) => updateField('starShape.wickToBody', parseFloat(e.target.value))}
                        disabled={!config.starShape.enabled}
                        className="w-full accent-cyan-400 disabled:opacity-40"
                      />
                      <span className="text-xs font-mono font-bold text-cyan-300 w-12 text-right">{config.starShape.wickToBody.toFixed(1)}x</span>
                    </div>
                  </div>

                  <div>
                    <TooltipLabel label="Min Wick-to-Range Ratio" tooltip="Wick must account for at least this share of full candle range (Balanced: 50%)." />
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min={0.30}
                        max={0.80}
                        step={0.05}
                        value={config.starShape.wickToRange}
                        onChange={(e) => updateField('starShape.wickToRange', parseFloat(e.target.value))}
                        disabled={!config.starShape.enabled}
                        className="w-full accent-cyan-400 disabled:opacity-40"
                      />
                      <span className="text-xs font-mono font-bold text-cyan-300 w-12 text-right">{(config.starShape.wickToRange * 100).toFixed(0)}%</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Volume Absorption Gate */}
              <div className="p-3.5 bg-[#161B22] border border-[#30363D] rounded-lg space-y-3">
                <div className="flex items-center justify-between border-b border-[#30363D]/60 pb-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={config.volumeGate.enabled}
                      onChange={(e) => updateField('volumeGate.enabled', e.target.checked)}
                      className="w-4 h-4 accent-cyan-500 rounded cursor-pointer"
                    />
                    <TooltipLabel label="Volume Gate (Enable Toggle)" tooltip="Rejection candle volume must exceed this multiple of 20-period volume SMA." />
                  </div>
                  <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold ${config.volumeGate.enabled ? 'bg-cyan-950 text-cyan-300' : 'bg-gray-800 text-gray-500'}`}>
                    {config.volumeGate.enabled ? 'ACTIVE' : 'BYPASSED'}
                  </span>
                </div>

                <div>
                  <TooltipLabel label="Volume Multiplier (x SMA20)" tooltip="Sweep candle volume must exceed this multiple of SMA20 volume (Balanced: 1.2x)." />
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min={1.0}
                      max={3.0}
                      step={0.1}
                      value={config.volumeGate.volMultiple}
                      onChange={(e) => updateField('volumeGate.volMultiple', parseFloat(e.target.value))}
                      disabled={!config.volumeGate.enabled}
                      className="w-full accent-cyan-400 disabled:opacity-40"
                    />
                    <span className="text-xs font-mono font-bold text-cyan-300 w-12 text-right">{config.volumeGate.volMultiple.toFixed(1)}x</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* SECTION 4: STOP AND TARGETS */}
        <div className="bg-[#0E1117] border border-[#30363D] rounded-xl overflow-hidden">
          <div 
            onClick={() => toggleSection('stopTargets')}
            className="p-3.5 bg-[#161B22]/60 border-b border-[#30363D] flex items-center justify-between cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <Target className="w-4 h-4 text-emerald-400" />
              <h4 className="text-xs font-bold text-gray-200 uppercase tracking-wider">
                4. Stop Loss, Structural Targets & Room Check
              </h4>
            </div>
            {expandedSections.stopTargets ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
          </div>

          {expandedSections.stopTargets && (
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <TooltipLabel label="Min Structural R:R (1.5 - 6.0)" tooltip="Nearest untapped opposing pool must be at least this R:R from actual entry and stop (Balanced: 3.5)." />
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min={1.5}
                      max={6.0}
                      step={0.1}
                      value={config.minStructuralRR}
                      onChange={(e) => updateField('minStructuralRR', parseFloat(e.target.value))}
                      className="w-full accent-cyan-400"
                    />
                    <span className="text-xs font-mono font-bold text-cyan-300 w-12 text-right">{config.minStructuralRR.toFixed(1)}R</span>
                  </div>
                </div>

                <div>
                  <TooltipLabel label="Final Take Profit R (1.5 - 6.0)" tooltip="Final TP at this R-multiple; existing TP1 logic stays active (Balanced: 3.5R)." />
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min={1.5}
                      max={6.0}
                      step={0.1}
                      value={config.finalTpR}
                      onChange={(e) => updateField('finalTpR', parseFloat(e.target.value))}
                      className="w-full accent-cyan-400"
                    />
                    <span className="text-xs font-mono font-bold text-cyan-300 w-12 text-right">{config.finalTpR.toFixed(1)}R</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
                <div className="flex items-center justify-between p-2.5 bg-[#161B22] rounded-lg border border-[#30363D]">
                  <div className="flex flex-col">
                    <TooltipLabel label="Room Check Gate" tooltip="Skip trade if nearest untapped opposing pool is closer than minStructuralRR x risk." />
                    <span className="text-[10px] text-gray-500">Opposing space check</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={config.roomCheck.enabled}
                    onChange={(e) => updateField('roomCheck.enabled', e.target.checked)}
                    className="w-4 h-4 accent-cyan-500 rounded cursor-pointer"
                  />
                </div>

                <div>
                  <TooltipLabel label="SL ATR Buffer (0 - 0.50)" tooltip="Buffer beyond sweep extreme: sweep extreme +- max(buffer x ATR, 3 ticks) (Balanced: 0.15)." />
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min={0.0}
                      max={0.50}
                      step={0.05}
                      value={config.sl.atrBuffer}
                      onChange={(e) => updateField('sl.atrBuffer', parseFloat(e.target.value))}
                      className="w-full accent-cyan-400"
                    />
                    <span className="text-xs font-mono font-bold text-cyan-300 w-12 text-right">{config.sl.atrBuffer.toFixed(2)}x</span>
                  </div>
                </div>

                <div>
                  <TooltipLabel label="SL Trigger Price" tooltip="Use Mark Price to prevent exchange wick liquidations if supported, otherwise Last Price." />
                  <select
                    value={config.sl.triggerPrice}
                    onChange={(e) => updateField('sl.triggerPrice', e.target.value)}
                    className="w-full bg-[#161B22] border border-[#30363D] rounded px-3 py-1.5 text-xs text-gray-200 font-mono"
                  >
                    <option value="mark">Mark Price (Anti-Wick)</option>
                    <option value="last">Last Traded Price</option>
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* SECTION 5: EXIT RULES */}
        <div className="bg-[#0E1117] border border-[#30363D] rounded-xl overflow-hidden">
          <div 
            onClick={() => toggleSection('exitRules')}
            className="p-3.5 bg-[#161B22]/60 border-b border-[#30363D] flex items-center justify-between cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-teal-400" />
              <h4 className="text-xs font-bold text-gray-200 uppercase tracking-wider">
                5. Exit Rules & Time Stop (Progress Exit)
              </h4>
            </div>
            {expandedSections.exitRules ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
          </div>

          {expandedSections.exitRules && (
            <div className="p-4 space-y-4">
              {/* Time Stop Toggle & Progress Params */}
              <div className="p-3.5 bg-[#161B22] border border-[#30363D] rounded-lg space-y-3">
                <div className="flex items-center justify-between border-b border-[#30363D]/60 pb-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={config.timeStop.enabled}
                      onChange={(e) => updateField('timeStop.enabled', e.target.checked)}
                      className="w-4 h-4 accent-cyan-500 rounded cursor-pointer"
                    />
                    <TooltipLabel label="Time Stop Progress Exit (Enable Toggle)" tooltip="After a fill, if best closed favorable excursion is still below minProgressR after N bars, exit at market." />
                  </div>
                  <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold ${config.timeStop.enabled ? 'bg-cyan-950 text-cyan-300' : 'bg-gray-800 text-gray-500'}`}>
                    {config.timeStop.enabled ? 'ACTIVE' : 'BYPASSED'}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <TooltipLabel label="Time Stop Bars (3 - 30)" tooltip="Number of closed bars before progress check evaluates (Balanced: 8 bars)." />
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min={3}
                        max={30}
                        step={1}
                        value={config.timeStop.bars}
                        onChange={(e) => updateField('timeStop.bars', parseInt(e.target.value))}
                        disabled={!config.timeStop.enabled}
                        className="w-full accent-cyan-400 disabled:opacity-40"
                      />
                      <span className="text-xs font-mono font-bold text-cyan-300 w-12 text-right">{config.timeStop.bars} bars</span>
                    </div>
                  </div>

                  <div>
                    <TooltipLabel label="Min Progress Threshold (R)" tooltip="If excursion is still below this R after N bars, trade is aborted (Balanced: 0.5R)." />
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min={0.1}
                        max={2.0}
                        step={0.1}
                        value={config.timeStop.minProgressR}
                        onChange={(e) => updateField('timeStop.minProgressR', parseFloat(e.target.value))}
                        disabled={!config.timeStop.enabled}
                        className="w-full accent-cyan-400 disabled:opacity-40"
                      />
                      <span className="text-xs font-mono font-bold text-cyan-300 w-12 text-right">{config.timeStop.minProgressR.toFixed(1)}R</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* TP1 Partials */}
              <div className="flex items-center justify-between p-2.5 bg-[#161B22] rounded-lg border border-[#30363D]">
                <div className="flex flex-col">
                  <TooltipLabel label="Partial TP1 Scale-Out (25%)" tooltip="Secures 25% profit at opposing liquidity pool and moves stop loss to breakeven." />
                  <span className="text-[10px] text-gray-500">Locks in initial gains on structural opposing pool</span>
                </div>
                <input
                  type="checkbox"
                  checked={config.partialTp1Enabled}
                  onChange={(e) => updateField('partialTp1Enabled', e.target.checked)}
                  className="w-4 h-4 accent-cyan-500 rounded cursor-pointer"
                />
              </div>
            </div>
          )}
        </div>

        {/* SECTION 6: FEES */}
        <div className="bg-[#0E1117] border border-[#30363D] rounded-xl overflow-hidden">
          <div 
            onClick={() => toggleSection('fees')}
            className="p-3.5 bg-[#161B22]/60 border-b border-[#30363D] flex items-center justify-between cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <Percent className="w-4 h-4 text-purple-400" />
              <h4 className="text-xs font-bold text-gray-200 uppercase tracking-wider">
                6. Fee Floor & Slippage Drag Protection
              </h4>
            </div>
            {expandedSections.fees ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
          </div>

          {expandedSections.fees && (
            <div className="p-4 space-y-4">
              <div className="p-3.5 bg-[#161B22] border border-[#30363D] rounded-lg space-y-3">
                <div className="flex items-center justify-between border-b border-[#30363D]/60 pb-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={config.feeFloor.enabled}
                      onChange={(e) => updateField('feeFloor.enabled', e.target.checked)}
                      className="w-4 h-4 accent-cyan-500 rounded cursor-pointer"
                    />
                    <TooltipLabel label="Fee Floor Gate (Enable Toggle)" tooltip="When enabled, skips trade if stop distance % < roundTripFeePct / divisor." />
                  </div>
                  <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold ${config.feeFloor.enabled ? 'bg-cyan-950 text-cyan-300' : 'bg-gray-800 text-gray-500'}`}>
                    {config.feeFloor.enabled ? 'ACTIVE' : 'DEFAULT OFF'}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <TooltipLabel label="Round-Trip Fee %" tooltip="Exchange futures taker fee + slippage allowance per round trip (default: 0.177%)." />
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min={0.0}
                        max={1.0}
                        step={0.01}
                        value={config.feeFloor.roundTripFeePct}
                        onChange={(e) => updateField('feeFloor.roundTripFeePct', parseFloat(e.target.value))}
                        className="w-full accent-cyan-400"
                      />
                      <span className="text-xs font-mono font-bold text-cyan-300 w-16 text-right">{config.feeFloor.roundTripFeePct.toFixed(3)}%</span>
                    </div>
                  </div>

                  <div>
                    <TooltipLabel label="Fee Floor Divisor" tooltip="Skip trade if stop distance % < fee / divisor (default: 0.20, requiring stop >= fee * 5)." />
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min={0.05}
                        max={0.50}
                        step={0.01}
                        value={config.feeFloor.divisor}
                        onChange={(e) => updateField('feeFloor.divisor', parseFloat(e.target.value))}
                        disabled={!config.feeFloor.enabled}
                        className="w-full accent-cyan-400 disabled:opacity-40"
                      />
                      <span className="text-xs font-mono font-bold text-cyan-300 w-12 text-right">{config.feeFloor.divisor.toFixed(2)}</span>
                    </div>
                  </div>
                </div>

                <div className="p-2.5 bg-[#0E1117] rounded border border-[#30363D] text-[11px] text-gray-400 font-mono flex items-center justify-between">
                  <span>Required Stop Distance to Pass:</span>
                  <span className="font-bold text-cyan-300">
                    &ge; {(config.feeFloor.roundTripFeePct / (config.feeFloor.divisor || 0.20)).toFixed(2)}%
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
