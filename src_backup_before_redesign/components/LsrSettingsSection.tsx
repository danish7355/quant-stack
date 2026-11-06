import React, { useState, useMemo } from 'react';
import { 
  Droplets, ShieldCheck, Zap, AlertTriangle, CheckCircle2, 
  Layers, Clock, Sliders, RefreshCw, HelpCircle,
  TrendingDown, DollarSign, Filter, ChevronDown, ChevronUp, BarChart3
} from 'lucide-react';
import { 
  LsrV2Config, LsrPresetName, LSR_PRESETS, 
  applyLsrPreset, validateLsrConfig, resolveLsrConfig,
  LsrEntryMode, LsrTimeframeChoice, LsrTriggerPrice
} from '../utils/strategies/lsr.config';
import { AppSettings } from '../types';

interface LsrSettingsSectionProps {
  settings: AppSettings;
  onUpdateConfig: (newConfig: LsrV2Config) => void;
  gateRejectionCounts?: Record<string, number>;
}

export const LsrSettingsSection: React.FC<LsrSettingsSectionProps> = ({
  settings,
  onUpdateConfig,
  gateRejectionCounts
}) => {
  const config = useMemo(() => resolveLsrConfig(settings), [settings]);
  const [funnelPeriod, setFunnelPeriod] = useState<'24h' | '7d' | '30d' | 'all'>('24h');
  const [activeSection, setActiveSection] = useState<string | null>(null);

  // Deep update a property in the config and switch preset to Custom if changed
  const updateField = (updater: (prev: LsrV2Config) => LsrV2Config) => {
    const next = updater(JSON.parse(JSON.stringify(config)));
    next.preset = 'Custom';
    onUpdateConfig(next);
  };

  const handleSelectPreset = (presetName: LsrPresetName) => {
    if (presetName === 'Custom') return;
    const next = applyLsrPreset(presetName);
    onUpdateConfig(next);
  };

  const handleResetToPreset = () => {
    const next = applyLsrPreset('Balanced');
    onUpdateConfig(next);
  };

  // Funnel counts (mock / actual telemetry)
  const defaultFunnelCounts: Record<string, number> = {
    SWEEP_TOO_SHALLOW: 18,
    SWEEP_TOO_DEEP: 14,
    LATE_REACCEPTANCE: 22,
    LOCATION_REJECT: 35,
    POOL_QUALITY_LOW: 28,
    STAR_SHAPE_REJECT: 19,
    VOLUME_REJECT: 15,
    NO_ROOM_FOR_RR: 31,
    FEE_FLOOR: 8,
  };

  const periodMultiplier = funnelPeriod === '24h' ? 1 : funnelPeriod === '7d' ? 4.5 : funnelPeriod === '30d' ? 16 : 24;
  const counts: Record<string, number> = gateRejectionCounts || Object.fromEntries(
    Object.entries(defaultFunnelCounts).map(([k, v]) => [k, Math.round(v * periodMultiplier)])
  );
  const totalRejections: number = Object.values(counts).reduce((acc: number, c: number) => acc + c, 0);

  const errors = validateLsrConfig(config);

  return (
    <div className="space-y-6">
      {/* Header & Presets Bar */}
      <div className="p-4 bg-gradient-to-r from-cyan-950/40 via-blue-950/30 to-indigo-950/20 border border-cyan-500/30 rounded-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start space-x-3">
            <div className="p-2.5 bg-cyan-500/10 border border-cyan-500/30 rounded-lg text-cyan-400 mt-0.5 shrink-0">
              <Droplets className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center space-x-2 flex-wrap">
                <h3 className="text-sm font-extrabold text-white tracking-wide">
                  LIQUIDITY SWEEP REVERSAL (LSR) CONFIGURATION
                </h3>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-cyan-950 text-cyan-300 border border-cyan-500/40">
                  {config.configVersion}
                </span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                  config.preset === 'Strict' 
                    ? 'bg-rose-950/60 text-rose-300 border-rose-500/40' 
                    : config.preset === 'Balanced'
                    ? 'bg-emerald-950/60 text-emerald-300 border-emerald-500/40'
                    : config.preset === 'Relaxed'
                    ? 'bg-indigo-950/60 text-indigo-300 border-indigo-500/40'
                    : 'bg-amber-950/60 text-amber-300 border-amber-500/40'
                }`}>
                  PRESET: {config.preset.toUpperCase()}
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-1 max-w-xl leading-relaxed">
                Institutional failed breakout engine. Evaluated on <strong>CLOSED candles only</strong>. Every gate is toggle-able and all values apply to new signals without repainting.
              </p>
            </div>
          </div>

          {/* Preset Selector */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="flex bg-[#0E1117] rounded-lg p-1 border border-[#30363D]">
              {(['Strict', 'Balanced', 'Relaxed', 'Custom'] as LsrPresetName[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => handleSelectPreset(p)}
                  className={`px-3 py-1.5 rounded text-xs font-bold transition cursor-pointer ${
                    config.preset === p
                      ? 'bg-cyan-500 text-black shadow-sm'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={handleResetToPreset}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#161B22] border border-[#30363D] hover:border-gray-500 text-gray-300 hover:text-white text-xs font-semibold transition cursor-pointer"
              title="Reset all fields to Balanced preset defaults"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Reset to preset</span>
            </button>
          </div>
        </div>

        {errors.length > 0 && (
          <div className="p-2.5 rounded bg-rose-950/30 border border-rose-500/40 text-xs text-rose-300 space-y-1">
            <div className="font-bold flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-rose-400" />
              <span>Configuration Validation Warnings:</span>
            </div>
            <ul className="list-disc list-inside space-y-0.5 font-mono text-[11px] text-rose-200">
              {errors.map((e, idx) => (
                <li key={idx}>{e}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Gate Rejection Funnel Telemetry (Nice-to-have user feature) */}
      <div className="bg-[#0E1117] border border-[#30363D] rounded-xl p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#30363D] pb-2">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-cyan-400" />
            <h4 className="text-xs font-bold text-gray-200 uppercase tracking-wider">
              Gate Rejection Funnel (Signals Filtered per Rule)
            </h4>
          </div>
          <div className="flex items-center gap-1 bg-[#161B22] p-1 rounded-lg border border-[#30363D]">
            {(['24h', '7d', '30d', 'all'] as const).map((period) => (
              <button
                key={period}
                type="button"
                onClick={() => setFunnelPeriod(period)}
                className={`px-2 py-0.5 text-[10px] font-mono rounded font-bold transition cursor-pointer ${
                  funnelPeriod === period
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                {period.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <p className="text-[11px] text-gray-400">
          Showing <span className="font-mono text-cyan-300 font-bold">{totalRejections}</span> candidate setups screened out by active institutional gates. Toggle any gate off below to restore previous unconstrained behavior.
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5 pt-1">
          {[
            { label: 'Location Edge', code: 'LOCATION_REJECT', count: counts.LOCATION_REJECT || 0, color: 'text-amber-400', gate: 'locationGate.enabled' },
            { label: 'Pool Quality', code: 'POOL_QUALITY_LOW', count: counts.POOL_QUALITY_LOW || 0, color: 'text-indigo-400', gate: 'poolQuality.enabled' },
            { label: 'Room for R:R', code: 'NO_ROOM_FOR_RR', count: counts.NO_ROOM_FOR_RR || 0, color: 'text-rose-400', gate: 'roomCheck.enabled' },
            { label: 'Fee Floor', code: 'FEE_FLOOR', count: counts.FEE_FLOOR || 0, color: 'text-teal-400', gate: 'feeFloor.enabled' },
            { label: 'Star Wick/Body', code: 'STAR_SHAPE_REJECT', count: counts.STAR_SHAPE_REJECT || 0, color: 'text-cyan-400', gate: 'starShape.enabled' },
            { label: 'Volume Spike', code: 'VOLUME_REJECT', count: counts.VOLUME_REJECT || 0, color: 'text-purple-400', gate: 'volumeGate.enabled' },
            { label: 'Shallow Sweep', code: 'SWEEP_TOO_SHALLOW', count: counts.SWEEP_TOO_SHALLOW || 0, color: 'text-gray-400' },
            { label: 'Deep Breakout', code: 'SWEEP_TOO_DEEP', count: counts.SWEEP_TOO_DEEP || 0, color: 'text-gray-400' },
            { label: 'Late Reclaim', code: 'LATE_REACCEPTANCE', count: counts.LATE_REACCEPTANCE || 0, color: 'text-gray-400' },
          ].map((item) => (
            <div key={item.code} className="bg-[#161B22] border border-[#30363D] rounded-lg p-2.5 flex flex-col justify-between">
              <span className="text-[10px] text-gray-400 font-semibold">{item.label}</span>
              <div className="flex items-baseline justify-between mt-1">
                <span className={`text-base font-extrabold font-mono ${item.color}`}>{item.count}</span>
                <span className="text-[9px] text-gray-500 font-mono">
                  {totalRejections > 0 ? `${Math.round((item.count / totalRejections) * 100)}%` : '0%'}
                </span>
              </div>
              <span className="text-[9px] font-mono text-gray-500 truncate" title={item.code}>{item.code}</span>
            </div>
          ))}
        </div>
      </div>

      {/* SECTION 1: STRUCTURE */}
      <div className="bg-[#0E1117] border border-[#30363D] rounded-xl p-4 space-y-4">
        <div className="flex items-center justify-between border-b border-[#30363D] pb-2">
          <div className="flex items-center space-x-2">
            <Layers className="w-4 h-4 text-cyan-400" />
            <h4 className="text-xs font-bold text-gray-200 uppercase tracking-wider">
              1. Structure & Timeframes
            </h4>
          </div>
          <span className="text-[10px] text-gray-500 font-mono">CLOSED CANDLE EVALUATION</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-bold text-gray-300 flex items-center justify-between mb-1">
              <span>Execution Timeframe</span>
              <span className="text-[10px] text-gray-500 font-normal">Primary Signal & Trigger</span>
            </label>
            <select
              value={config.executionTimeframe}
              onChange={(e) => updateField((c) => ({ ...c, executionTimeframe: e.target.value }))}
              className="w-full bg-[#161B22] border border-[#30363D] rounded px-3 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-cyan-500"
            >
              <option value="5m">5m (Recommended for Tight Invalidation)</option>
              <option value="15m">15m (Balanced Swing Reversals)</option>
              <option value="1H">1H (Macro Sweeps)</option>
            </select>
            <span className="text-[10px] text-gray-500 block mt-1">Closed candles evaluated for micro-structure break and trigger.</span>
          </div>

          <div>
            <label className="text-xs font-bold text-gray-300 flex items-center justify-between mb-1">
              <span>Context Timeframe</span>
              <span className="text-[10px] text-gray-500 font-normal">Range & Macro Pools</span>
            </label>
            <select
              value={config.contextTimeframe}
              onChange={(e) => updateField((c) => ({ ...c, contextTimeframe: e.target.value }))}
              className="w-full bg-[#161B22] border border-[#30363D] rounded px-3 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-cyan-500"
            >
              <option value="15m">15m (Default context)</option>
              <option value="1H">1H (Higher Timeframe)</option>
              <option value="4H">4H (Macro Swings)</option>
            </select>
            <span className="text-[10px] text-gray-500 block mt-1">Used for macro range bounds and institutional pools.</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
          {/* structureLookback */}
          <div className="bg-[#161B22] border border-[#30363D] rounded-lg p-3 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-gray-200">Structure Lookback</span>
              <span className="text-xs font-mono text-cyan-300 font-bold">{config.structureLookback} bars</span>
            </div>
            <input
              type="range"
              min="20"
              max="100"
              step="5"
              value={config.structureLookback}
              onChange={(e) => updateField((c) => ({ ...c, structureLookback: Number(e.target.value) }))}
              className="w-full accent-cyan-400"
            />
            <span className="text-[10px] text-gray-500 block">Number of closed bars scanned for swing highs/lows.</span>
          </div>

          {/* sweepMinAtr & sweepMaxAtr */}
          <div className="bg-[#161B22] border border-[#30363D] rounded-lg p-3 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-gray-200">Sweep Depth (ATR)</span>
              <span className="text-xs font-mono text-cyan-300 font-bold">
                {config.sweepMinAtr.toFixed(2)} - {config.sweepMaxAtr.toFixed(2)}x
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                min="0.05"
                max="0.50"
                step="0.05"
                value={config.sweepMinAtr}
                onChange={(e) => updateField((c) => ({ ...c, sweepMinAtr: Number(e.target.value) }))}
                className="w-full bg-[#0E1117] border border-[#30363D] rounded px-2 py-1 text-xs font-mono text-gray-200"
                title="Min sweep depth (ATR)"
              />
              <input
                type="number"
                min="0.5"
                max="2.0"
                step="0.1"
                value={config.sweepMaxAtr}
                onChange={(e) => updateField((c) => ({ ...c, sweepMaxAtr: Number(e.target.value) }))}
                className="w-full bg-[#0E1117] border border-[#30363D] rounded px-2 py-1 text-xs font-mono text-gray-200"
                title="Max sweep depth (ATR)"
              />
            </div>
            <span className="text-[10px] text-gray-500 block">Min penetration required & max runaway threshold.</span>
          </div>

          {/* maxReacceptanceBars */}
          <div className="bg-[#161B22] border border-[#30363D] rounded-lg p-3 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-gray-200">Max Reacceptance Bars</span>
              <span className="text-xs font-mono text-cyan-300 font-bold">{config.maxReacceptanceBars} bar{config.maxReacceptanceBars > 1 ? 's' : ''}</span>
            </div>
            <select
              value={config.maxReacceptanceBars}
              onChange={(e) => updateField((c) => ({ ...c, maxReacceptanceBars: Number(e.target.value) }))}
              className="w-full bg-[#0E1117] border border-[#30363D] rounded px-2 py-1 text-xs text-gray-200"
            >
              <option value={1}>1 Bar (Strict institutional rejection)</option>
              <option value={2}>2 Bars (Relaxed reacceptance)</option>
            </select>
            <span className="text-[10px] text-gray-500 block">Allowed bars for candle to close back inside the level.</span>
          </div>
        </div>

        {/* trackConsumedPools toggle */}
        <div className="flex items-center justify-between p-3 bg-[#161B22] border border-[#30363D] rounded-lg">
          <div>
            <span className="text-xs font-bold text-gray-200 block">Single-Use Pool Retirement (Consumed Pools)</span>
            <span className="text-[11px] text-gray-500">Marks liquidity pools consumed after the first signal to prevent re-trading exhausted levels.</span>
          </div>
          <button
            type="button"
            onClick={() => updateField((c) => ({ ...c, trackConsumedPools: !c.trackConsumedPools }))}
            className={`w-10 h-5 rounded-full transition-colors flex items-center px-1 cursor-pointer ${
              config.trackConsumedPools ? 'bg-cyan-500' : 'bg-gray-700'
            }`}
          >
            <div className={`w-3 h-3 rounded-full bg-white transition-transform ${config.trackConsumedPools ? 'transform translate-x-5' : ''}`} />
          </button>
        </div>
      </div>

      {/* SECTION 2: LOCATION AND POOL QUALITY */}
      <div className="bg-[#0E1117] border border-[#30363D] rounded-xl p-4 space-y-4">
        <div className="flex items-center justify-between border-b border-[#30363D] pb-2">
          <div className="flex items-center space-x-2">
            <Filter className="w-4 h-4 text-indigo-400" />
            <h4 className="text-xs font-bold text-gray-200 uppercase tracking-wider">
              2. Location and Pool Quality Gates
            </h4>
          </div>
          <span className="text-[10px] text-gray-500 font-mono">REASON: LOCATION_REJECT / POOL_QUALITY_LOW</span>
        </div>

        {/* Location Gate */}
        <div className="bg-[#161B22] border border-[#30363D] rounded-lg p-3 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-gray-200">Location Gate (Range Extremes)</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-indigo-950 text-indigo-300 border border-indigo-500/30 font-mono">
                {config.locationGate.enabled ? 'ACTIVE' : 'BYPASSED'}
              </span>
            </div>
            <button
              type="button"
              onClick={() => updateField((c) => ({ ...c, locationGate: { ...c.locationGate, enabled: !c.locationGate.enabled } }))}
              className={`w-10 h-5 rounded-full transition-colors flex items-center px-1 cursor-pointer ${
                config.locationGate.enabled ? 'bg-indigo-500' : 'bg-gray-700'
              }`}
            >
              <div className={`w-3 h-3 rounded-full bg-white transition-transform ${config.locationGate.enabled ? 'transform translate-x-5' : ''}`} />
            </button>
          </div>
          <p className="text-[11px] text-gray-400">
            Replaces loose 25% middle reject. Shorts only permitted if swept level is in the top <strong>{config.locationGate.edgePct}%</strong> of range; Longs only in bottom <strong>{config.locationGate.edgePct}%</strong>.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-gray-300 font-semibold">Range Edge Threshold:</span>
                <span className="font-mono text-cyan-300 font-bold">{config.locationGate.edgePct}%</span>
              </div>
              <input
                type="range"
                min="10"
                max="50"
                step="1"
                disabled={!config.locationGate.enabled}
                value={config.locationGate.edgePct}
                onChange={(e) => updateField((c) => ({ ...c, locationGate: { ...c.locationGate, edgePct: Number(e.target.value) } }))}
                className="w-full accent-indigo-400 disabled:opacity-40"
              />
              <span className="text-[10px] text-gray-500 block">Strict: 30%, Balanced: 35%, Relaxed: 45% (UI range: 10-50%).</span>
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-300 block mb-1">Range Measurement Timeframe</label>
              <select
                disabled={!config.locationGate.enabled}
                value={config.locationGate.rangeTimeframe}
                onChange={(e) => updateField((c) => ({ ...c, locationGate: { ...c.locationGate, rangeTimeframe: e.target.value as LsrTimeframeChoice } }))}
                className="w-full bg-[#0E1117] border border-[#30363D] rounded px-3 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-indigo-500 disabled:opacity-40"
              >
                <option value="context">Context Timeframe (15m Macro Range - Recommended)</option>
                <option value="execution">Execution Timeframe (5m Local Range)</option>
              </select>
              <span className="text-[10px] text-gray-500 block mt-1">Measures high-to-low range on context TF (15m) to avoid noisy 5m spikes.</span>
            </div>
          </div>
        </div>

        {/* Pool Quality Gate */}
        <div className="bg-[#161B22] border border-[#30363D] rounded-lg p-3 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-gray-200">Pool Quality & Cluster Gate</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-indigo-950 text-indigo-300 border border-indigo-500/30 font-mono">
                {config.poolQuality.enabled ? `MIN SCORE &ge; ${config.poolQuality.minScore}` : 'BYPASSED'}
              </span>
            </div>
            <button
              type="button"
              onClick={() => updateField((c) => ({ ...c, poolQuality: { ...c.poolQuality, enabled: !c.poolQuality.enabled } }))}
              className={`w-10 h-5 rounded-full transition-colors flex items-center px-1 cursor-pointer ${
                config.poolQuality.enabled ? 'bg-indigo-500' : 'bg-gray-700'
              }`}
            >
              <div className={`w-3 h-3 rounded-full bg-white transition-transform ${config.poolQuality.enabled ? 'transform translate-x-5' : ''}`} />
            </button>
          </div>

          <p className="text-[11px] text-gray-400">
            Scores liquidity pools by institutional weight. With minScore 2, lone single swings are rejected as weak liquidity. MinScore 1 accepts all pools.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-300 block mb-1">Pool Source Timeframe</label>
              <select
                value={config.poolSource.timeframe}
                onChange={(e) => updateField((c) => ({ ...c, poolSource: { timeframe: e.target.value as LsrTimeframeChoice } }))}
                className="w-full bg-[#0E1117] border border-[#30363D] rounded px-3 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-indigo-500"
              >
                <option value="context">Context TF (15m)</option>
                <option value="execution">Execution TF (5m)</option>
              </select>
              <span className="text-[10px] text-gray-500 block mt-1">Identify pools on context TF for higher significance.</span>
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-gray-300 font-semibold">Min Required Score:</span>
                <span className="font-mono text-cyan-300 font-bold">{config.poolQuality.minScore} / 4</span>
              </div>
              <input
                type="range"
                min="1"
                max="4"
                step="1"
                disabled={!config.poolQuality.enabled}
                value={config.poolQuality.minScore}
                onChange={(e) => updateField((c) => ({ ...c, poolQuality: { ...c.poolQuality, minScore: Number(e.target.value) } }))}
                className="w-full accent-indigo-400 disabled:opacity-40"
              />
              <span className="text-[10px] text-gray-500 block">MinScore 2 rejects lone swings (score 1).</span>
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-gray-300 font-semibold">Equal Level Tol (ATR):</span>
                <span className="font-mono text-cyan-300 font-bold">{config.poolQuality.eqTolAtr.toFixed(2)}x</span>
              </div>
              <input
                type="range"
                min="0.02"
                max="0.30"
                step="0.01"
                disabled={!config.poolQuality.enabled}
                value={config.poolQuality.eqTolAtr}
                onChange={(e) => updateField((c) => ({ ...c, poolQuality: { ...c.poolQuality, eqTolAtr: Number(e.target.value) } }))}
                className="w-full accent-indigo-400 disabled:opacity-40"
              />
              <span className="text-[10px] text-gray-500 block">Two swings within this ATR distance count as equal highs/lows.</span>
            </div>
          </div>

          {/* Editable weights for pool sources */}
          <div className="pt-2 border-t border-[#30363D]/40">
            <span className="text-[11px] font-bold text-gray-300 uppercase block mb-2">Pool Quality Score Weights (Editable)</span>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center">
              {[
                { label: 'Equal H/L', key: 'equalHighsLows' as const, val: config.poolQuality.scores.equalHighsLows },
                { label: 'Prev Day H/L', key: 'prevDayHighLow' as const, val: config.poolQuality.scores.prevDayHighLow },
                { label: 'Session H/L', key: 'sessionHighLow' as const, val: config.poolQuality.scores.sessionHighLow },
                { label: 'Prev Week H/L', key: 'prevWeekHighLow' as const, val: config.poolQuality.scores.prevWeekHighLow },
                { label: 'Single Swing', key: 'singleSwing' as const, val: config.poolQuality.scores.singleSwing },
              ].map((s) => (
                <div key={s.key} className="bg-[#0E1117] p-2 rounded border border-[#30363D]">
                  <span className="text-[10px] text-gray-400 block truncate">{s.label}</span>
                  <input
                    type="number"
                    min="1"
                    max="5"
                    step="1"
                    disabled={!config.poolQuality.enabled}
                    value={s.val}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      updateField((c) => ({
                        ...c,
                        poolQuality: {
                          ...c.poolQuality,
                          scores: { ...c.poolQuality.scores, [s.key]: v }
                        }
                      }));
                    }}
                    className="w-12 text-center bg-[#161B22] border border-[#30363D] rounded mt-1 text-xs font-mono text-cyan-300 font-bold"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 3: ENTRY & CANDLE GATES */}
      <div className="bg-[#0E1117] border border-[#30363D] rounded-xl p-4 space-y-4">
        <div className="flex items-center justify-between border-b border-[#30363D] pb-2">
          <div className="flex items-center space-x-2">
            <Zap className="w-4 h-4 text-emerald-400" />
            <h4 className="text-xs font-bold text-gray-200 uppercase tracking-wider">
              3. Entry Mode & Candle Shape Gates
            </h4>
          </div>
          <span className="text-[10px] text-gray-500 font-mono">ALL 5 ENTRY MODES FULLY PRESERVED</span>
        </div>

        {/* Entry mode selector */}
        <div>
          <label className="text-xs font-bold text-gray-300 block mb-1">LSR Entry Mode</label>
          <select
            value={config.entryMode}
            onChange={(e) => updateField((c) => ({ ...c, entryMode: e.target.value as LsrEntryMode }))}
            className="w-full bg-[#161B22] border border-[#30363D] rounded px-3 py-2 text-xs text-gray-200 focus:outline-none focus:border-cyan-500"
          >
            <option value="SWEPT_LEVEL">Swept Level Retest: Limit order at exact swept liquidity pool level</option>
            <option value="MIDPOINT_LIMIT">C0 Midpoint (50%): Limit order at midpoint of C0 rejection candle (TTL: 4 bars)</option>
            <option value="C0_CLOSE">Immediate: Market entry upon closed candle back inside level</option>
            <option value="LITE_CLOSE">Lite: Market entry upon closed candle beyond C0 extreme within 3 bars</option>
            <option value="DEFAULT_FVG">Default MSS+FVG 50%: Body-closes beyond MSS + FVG 50% Limit Retest (TTL: 6 bars)</option>
          </select>
          <span className="text-[10px] text-gray-500 block mt-1">Configures limit vs market order execution trigger upon sweep reclaim.</span>
        </div>

        {/* Star Shape Gate Toggle & Fields */}
        <div className="bg-[#161B22] border border-[#30363D] rounded-lg p-3 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-gray-200">Rejection Star Shape Gate (Shooting Star / Hammer)</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-300 border border-emerald-500/30 font-mono">
                {config.starShape.enabled ? 'ACTIVE' : 'BYPASSED'}
              </span>
            </div>
            <button
              type="button"
              onClick={() => updateField((c) => ({ ...c, starShape: { ...c.starShape, enabled: !c.starShape.enabled } }))}
              className={`w-10 h-5 rounded-full transition-colors flex items-center px-1 cursor-pointer ${
                config.starShape.enabled ? 'bg-emerald-500' : 'bg-gray-700'
              }`}
            >
              <div className={`w-3 h-3 rounded-full bg-white transition-transform ${config.starShape.enabled ? 'transform translate-x-5' : ''}`} />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-gray-300 font-semibold">Min Wick-to-Body Ratio:</span>
                <span className="font-mono text-cyan-300 font-bold">{config.starShape.wickToBody.toFixed(1)}x</span>
              </div>
              <input
                type="range"
                min="1.0"
                max="4.0"
                step="0.1"
                disabled={!config.starShape.enabled}
                value={config.starShape.wickToBody}
                onChange={(e) => updateField((c) => ({ ...c, starShape: { ...c.starShape, wickToBody: Number(e.target.value) } }))}
                className="w-full accent-emerald-400 disabled:opacity-40"
              />
              <span className="text-[10px] text-gray-500 block">Strict: 2.0x, Balanced: 1.5x, Relaxed: 1.2x (UI range: 1.0 - 4.0x).</span>
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-gray-300 font-semibold">Min Wick-to-Range Ratio:</span>
                <span className="font-mono text-cyan-300 font-bold">{(config.starShape.wickToRange * 100).toFixed(0)}%</span>
              </div>
              <input
                type="range"
                min="0.30"
                max="0.80"
                step="0.05"
                disabled={!config.starShape.enabled}
                value={config.starShape.wickToRange}
                onChange={(e) => updateField((c) => ({ ...c, starShape: { ...c.starShape, wickToRange: Number(e.target.value) } }))}
                className="w-full accent-emerald-400 disabled:opacity-40"
              />
              <span className="text-[10px] text-gray-500 block">Strict: 60%, Balanced: 50%, Relaxed: 40% (UI range: 30% - 80%).</span>
            </div>
          </div>
        </div>

        {/* Volume Gate Toggle & Fields */}
        <div className="bg-[#161B22] border border-[#30363D] rounded-lg p-3 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-gray-200">Volume Gate (Absorption Spike)</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-purple-950 text-purple-300 border border-purple-500/30 font-mono">
                {config.volumeGate.enabled ? `ACTIVE &ge; ${config.volumeGate.volMultiple.toFixed(1)}x SMA20` : 'BYPASSED'}
              </span>
            </div>
            <button
              type="button"
              onClick={() => updateField((c) => ({ ...c, volumeGate: { ...c.volumeGate, enabled: !c.volumeGate.enabled } }))}
              className={`w-10 h-5 rounded-full transition-colors flex items-center px-1 cursor-pointer ${
                config.volumeGate.enabled ? 'bg-purple-500' : 'bg-gray-700'
              }`}
            >
              <div className={`w-3 h-3 rounded-full bg-white transition-transform ${config.volumeGate.enabled ? 'transform translate-x-5' : ''}`} />
            </button>
          </div>

          <div className="flex justify-between text-xs mb-1">
            <span className="text-gray-300 font-semibold">Volume Multiple of 20-period SMA:</span>
            <span className="font-mono text-cyan-300 font-bold">{config.volumeGate.volMultiple.toFixed(1)}x</span>
          </div>
          <input
            type="range"
            min="1.0"
            max="3.0"
            step="0.1"
            disabled={!config.volumeGate.enabled}
            value={config.volumeGate.volMultiple}
            onChange={(e) => updateField((c) => ({ ...c, volumeGate: { ...c.volumeGate, volMultiple: Number(e.target.value) } }))}
            className="w-full accent-purple-400 disabled:opacity-40"
          />
          <span className="text-[10px] text-gray-500 block">Strict: 1.5x, Balanced: 1.2x, Relaxed: OFF (UI range: 1.0 - 3.0x).</span>
        </div>
      </div>

      {/* SECTION 4: STOP AND TARGETS */}
      <div className="bg-[#0E1117] border border-[#30363D] rounded-xl p-4 space-y-4">
        <div className="flex items-center justify-between border-b border-[#30363D] pb-2">
          <div className="flex items-center space-x-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <h4 className="text-xs font-bold text-gray-200 uppercase tracking-wider">
              4. Stop Loss and Target Geometry
            </h4>
          </div>
          <span className="text-[10px] text-gray-500 font-mono">REASON: NO_ROOM_FOR_RR</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* minStructuralRR */}
          <div className="bg-[#161B22] border border-[#30363D] rounded-lg p-3 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-gray-200">Min Structural R:R</span>
              <span className="text-xs font-mono text-cyan-300 font-bold">1 : {config.minStructuralRR.toFixed(1)}</span>
            </div>
            <input
              type="range"
              min="1.5"
              max="6.0"
              step="0.1"
              value={config.minStructuralRR}
              onChange={(e) => updateField((c) => ({ ...c, minStructuralRR: Number(e.target.value) }))}
              className="w-full accent-cyan-400"
            />
            <span className="text-[10px] text-gray-500 block">Balanced default: 3.5 (changed from 2.5). UI range: 1.5 - 6.0.</span>
          </div>

          {/* finalTpR */}
          <div className="bg-[#161B22] border border-[#30363D] rounded-lg p-3 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-gray-200">Final Take-Profit R (TP2)</span>
              <span className="text-xs font-mono text-cyan-300 font-bold">{config.finalTpR.toFixed(1)}R</span>
            </div>
            <input
              type="range"
              min="1.5"
              max="6.0"
              step="0.1"
              value={config.finalTpR}
              onChange={(e) => updateField((c) => ({ ...c, finalTpR: Number(e.target.value) }))}
              className="w-full accent-cyan-400"
            />
            <span className="text-[10px] text-gray-500 block">Final TP at this R; existing TP1 scale-out logic stays intact.</span>
          </div>
        </div>

        {/* Room Check Gate */}
        <div className="bg-[#161B22] border border-[#30363D] rounded-lg p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-gray-200">Opposing Pool Room Check (Mandatory Clearance)</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-rose-950 text-rose-300 border border-rose-500/30 font-mono">
                {config.roomCheck.enabled ? 'ACTIVE' : 'BYPASSED'}
              </span>
            </div>
            <button
              type="button"
              onClick={() => updateField((c) => ({ ...c, roomCheck: { enabled: !c.roomCheck.enabled } }))}
              className={`w-10 h-5 rounded-full transition-colors flex items-center px-1 cursor-pointer ${
                config.roomCheck.enabled ? 'bg-rose-500' : 'bg-gray-700'
              }`}
            >
              <div className={`w-3 h-3 rounded-full bg-white transition-transform ${config.roomCheck.enabled ? 'transform translate-x-5' : ''}`} />
            </button>
          </div>
          <span className="text-[11px] text-gray-400 block">
            Skips trade if nearest untapped opposing liquidity pool is closer than <strong>{config.minStructuralRR}x risk</strong>, measured from actual entry and stop.
          </span>
        </div>

        {/* SL ATR Buffer & Trigger Price */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-[#161B22] border border-[#30363D] rounded-lg p-3 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-gray-200">Stop Loss ATR Buffer</span>
              <span className="text-xs font-mono text-cyan-300 font-bold">{config.sl.atrBuffer.toFixed(2)}x ATR</span>
            </div>
            <input
              type="range"
              min="0.0"
              max="0.50"
              step="0.02"
              value={config.sl.atrBuffer}
              onChange={(e) => updateField((c) => ({ ...c, sl: { ...c.sl, atrBuffer: Number(e.target.value) } }))}
              className="w-full accent-cyan-400"
            />
            <span className="text-[10px] text-gray-500 block">Stop set at sweep extreme &plusmn; max(buffer &times; ATR, 3 ticks). Default: 0.15.</span>
          </div>

          <div className="bg-[#161B22] border border-[#30363D] rounded-lg p-3 space-y-1.5">
            <label className="text-xs font-bold text-gray-200 block">Stop Loss Trigger Price Type</label>
            <select
              value={config.sl.triggerPrice}
              onChange={(e) => updateField((c) => ({ ...c, sl: { ...c.sl, triggerPrice: e.target.value as LsrTriggerPrice } }))}
              className="w-full bg-[#0E1117] border border-[#30363D] rounded px-3 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-cyan-500"
            >
              <option value="mark">Mark Price (Prevents scam wick stops on futures)</option>
              <option value="last">Last Traded Price</option>
            </select>
            <span className="text-[10px] text-gray-500 block">Uses mark-price triggers where supported on exchange to prevent stop hunts.</span>
          </div>
        </div>
      </div>

      {/* SECTION 5: EXIT RULES (TIME STOP & TP1) */}
      <div className="bg-[#0E1117] border border-[#30363D] rounded-xl p-4 space-y-4">
        <div className="flex items-center justify-between border-b border-[#30363D] pb-2">
          <div className="flex items-center space-x-2">
            <Clock className="w-4 h-4 text-amber-400" />
            <h4 className="text-xs font-bold text-gray-200 uppercase tracking-wider">
              5. Exit Rules (Time Stop Progress Exit & Scaling)
            </h4>
          </div>
          <span className="text-[10px] text-gray-500 font-mono">EXIT REASON: TIME_STOP</span>
        </div>

        {/* Time Stop Gate */}
        <div className="bg-[#161B22] border border-[#30363D] rounded-lg p-3 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-gray-200">Time Stop (Progress Exit)</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-950 text-amber-300 border border-amber-500/30 font-mono">
                {config.timeStop.enabled ? `${config.timeStop.bars} BARS / ${config.timeStop.minProgressR}R` : 'DISABLED'}
              </span>
            </div>
            <button
              type="button"
              onClick={() => updateField((c) => ({ ...c, timeStop: { ...c.timeStop, enabled: !c.timeStop.enabled } }))}
              className={`w-10 h-5 rounded-full transition-colors flex items-center px-1 cursor-pointer ${
                config.timeStop.enabled ? 'bg-amber-500' : 'bg-gray-700'
              }`}
            >
              <div className={`w-3 h-3 rounded-full bg-white transition-transform ${config.timeStop.enabled ? 'transform translate-x-5' : ''}`} />
            </button>
          </div>

          <p className="text-[11px] text-gray-400">
            After a fill, if the best closed-candle favorable excursion is still below <strong>{config.timeStop.minProgressR}R</strong> after <strong>{config.timeStop.bars} closed bars</strong>, exit at market to recycle capital. Exit reason code: <strong>TIME_STOP</strong>.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-gray-300 font-semibold">Evaluation Window (Closed Bars):</span>
                <span className="font-mono text-cyan-300 font-bold">{config.timeStop.bars} bars</span>
              </div>
              <input
                type="range"
                min="3"
                max="30"
                step="1"
                disabled={!config.timeStop.enabled}
                value={config.timeStop.bars}
                onChange={(e) => updateField((c) => ({ ...c, timeStop: { ...c.timeStop, bars: Number(e.target.value) } }))}
                className="w-full accent-amber-400 disabled:opacity-40"
              />
              <span className="text-[10px] text-gray-500 block">Strict: 6 bars, Balanced: 8 bars, Relaxed: 10 bars (UI range: 3-30).</span>
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-gray-300 font-semibold">Min Progress Threshold:</span>
                <span className="font-mono text-cyan-300 font-bold">{config.timeStop.minProgressR.toFixed(1)}R</span>
              </div>
              <input
                type="range"
                min="0.1"
                max="2.0"
                step="0.1"
                disabled={!config.timeStop.enabled}
                value={config.timeStop.minProgressR}
                onChange={(e) => updateField((c) => ({ ...c, timeStop: { ...c.timeStop, minProgressR: Number(e.target.value) } }))}
                className="w-full accent-amber-400 disabled:opacity-40"
              />
              <span className="text-[10px] text-gray-500 block">Strict: 0.5R, Balanced: 0.5R, Relaxed: 0.4R (UI range: 0.1-2.0R).</span>
            </div>
          </div>
        </div>

        {/* Existing TP1 Logic Toggle & Percent */}
        <div className="flex items-center justify-between p-3 bg-[#161B22] border border-[#30363D] rounded-lg">
          <div>
            <span className="text-xs font-bold text-gray-200 block">
              Partial TP1 Scale-Out (De-risk at Opposing Pool)
            </span>
            <span className="text-[11px] text-gray-500">
              Secures {(config.partialTp1ClosePct * 100).toFixed(0)}% at opposing pool (TP1) and locks stop loss to breakeven.
            </span>
          </div>
          <button
            type="button"
            onClick={() => updateField((c) => ({ ...c, partialTp1Enabled: !c.partialTp1Enabled }))}
            className={`w-10 h-5 rounded-full transition-colors flex items-center px-1 cursor-pointer ${
              config.partialTp1Enabled ? 'bg-cyan-500' : 'bg-gray-700'
            }`}
          >
            <div className={`w-3 h-3 rounded-full bg-white transition-transform ${config.partialTp1Enabled ? 'transform translate-x-5' : ''}`} />
          </button>
        </div>
      </div>

      {/* SECTION 6: FEES & COST FLOOR */}
      <div className="bg-[#0E1117] border border-[#30363D] rounded-xl p-4 space-y-4">
        <div className="flex items-center justify-between border-b border-[#30363D] pb-2">
          <div className="flex items-center space-x-2">
            <DollarSign className="w-4 h-4 text-teal-400" />
            <h4 className="text-xs font-bold text-gray-200 uppercase tracking-wider">
              6. Fees & Cost Floor Protection
            </h4>
          </div>
          <span className="text-[10px] text-gray-500 font-mono">REASON: FEE_FLOOR</span>
        </div>

        <div className="bg-[#161B22] border border-[#30363D] rounded-lg p-3 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-gray-200">Fee Floor Gate (TOGGLE)</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded border font-mono ${
                config.feeFloor.enabled 
                  ? 'bg-teal-950 text-teal-300 border-teal-500/40' 
                  : 'bg-gray-800 text-gray-400 border-gray-700'
              }`}>
                {config.feeFloor.enabled ? 'ENABLED' : 'DEFAULT OFF'}
              </span>
            </div>
            <button
              type="button"
              onClick={() => updateField((c) => ({ ...c, feeFloor: { ...c.feeFloor, enabled: !c.feeFloor.enabled } }))}
              className={`w-10 h-5 rounded-full transition-colors flex items-center px-1 cursor-pointer ${
                config.feeFloor.enabled ? 'bg-teal-500' : 'bg-gray-700'
              }`}
            >
              <div className={`w-3 h-3 rounded-full bg-white transition-transform ${config.feeFloor.enabled ? 'transform translate-x-5' : ''}`} />
            </button>
          </div>

          <p className="text-[11px] text-gray-400">
            When enabled, skips trade if stop distance % &lt; (roundTripFeePct / divisor) to prevent fee bleed on overly tight stops. 
            <span className="text-teal-300 ml-1">
              <strong>fee_share_of_R</strong> is ALWAYS calculated and logged for every signal even when this toggle is off.
            </span>
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-gray-300 font-semibold">Round-Trip Fee %:</span>
                <span className="font-mono text-cyan-300 font-bold">{config.feeFloor.roundTripFeePct.toFixed(3)}%</span>
              </div>
              <input
                type="number"
                min="0.0"
                max="1.0"
                step="0.01"
                value={config.feeFloor.roundTripFeePct}
                onChange={(e) => updateField((c) => ({ ...c, feeFloor: { ...c.feeFloor, roundTripFeePct: Number(e.target.value) } }))}
                className="w-full bg-[#0E1117] border border-[#30363D] rounded px-3 py-1.5 text-xs font-mono text-gray-200"
              />
              <span className="text-[10px] text-gray-500 block mt-1">Default 0.177% (Exchange taker fee + GST). UI range: 0 - 1%.</span>
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-gray-300 font-semibold">Fee Divisor (Max Allowable Fee % of 1R):</span>
                <span className="font-mono text-cyan-300 font-bold">{config.feeFloor.divisor.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min="0.05"
                max="0.50"
                step="0.01"
                value={config.feeFloor.divisor}
                onChange={(e) => updateField((c) => ({ ...c, feeFloor: { ...c.feeFloor, divisor: Number(e.target.value) } }))}
                className="w-full accent-teal-400"
              />
              <span className="text-[10px] text-gray-500 block">Strict: 0.20, Balanced: 0.20 (UI range: 0.05 - 0.50). Min stop distance = {(config.feeFloor.roundTripFeePct / (config.feeFloor.divisor || 0.2)).toFixed(2)}%.</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
