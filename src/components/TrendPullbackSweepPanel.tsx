import React, { useState, useMemo } from 'react';
import { AppSettings } from '../types';
import {
  TpsrMode,
  RegimeTier,
  PARAM_REGISTRY,
  PIPELINE_GROUPS,
  resolveTpsrConfig,
  validateTpsrConfig,
  ParamDef
} from '../utils/strategies/trendPullbackSweep/schema';
import { TpsrFunnelTracker } from '../utils/strategies/trendPullbackSweep/engine';
import {
  TrendingUp, RotateCcw, AlertTriangle, Check, Pin, PinOff,
  ShieldCheck, Layers, Activity, Target, SlidersHorizontal, Zap,
  BarChart2, HelpCircle
} from 'lucide-react';

interface TrendPullbackSweepPanelProps {
  settings: AppSettings;
  onUpdateSetting: (field: keyof AppSettings, value: any) => void;
  onSaveDirect?: (partialSettings: Partial<AppSettings>) => void;
}

export const TrendPullbackSweepPanel: React.FC<TrendPullbackSweepPanelProps> = ({
  settings,
  onUpdateSetting,
  onSaveDirect
}) => {
  const mode: TpsrMode = settings.tpsrMode || 'balanced';
  const pinnedOverrides = useMemo(() => (settings.tpsrOverrides || {}) as Record<string, any>, [settings.tpsrOverrides]);
  const customScalers = useMemo(() => settings.tpsrCustomScalers, [settings.tpsrCustomScalers]);

  // Determine current regime tier from app settings
  const regimeConfidence = settings.regimeConfidence ?? 65;
  const regimeTier: RegimeTier = regimeConfidence >= 75 ? 'strong' : regimeConfidence >= 55 ? 'moderate' : 'emerging';

  // Resolve effective config and metadata
  const resolved = useMemo(() => {
    return resolveTpsrConfig({
      mode,
      regimeTier,
      pinnedOverrides,
      customScalers
    });
  }, [mode, regimeTier, pinnedOverrides, customScalers]);

  // Validate current config
  const validation = useMemo(() => validateTpsrConfig(resolved.values), [resolved.values]);

  // Funnel stats
  const [funnelMode, setFunnelMode] = useState<TpsrMode>(mode);
  const funnelStats = useMemo(() => TpsrFunnelTracker.get().statsByMode[funnelMode], [funnelMode]);
  const bottleneck = useMemo(() => TpsrFunnelTracker.get().getBottleneck(funnelMode), [funnelMode]);

  const [activeGroup, setActiveGroup] = useState<string>(PIPELINE_GROUPS[0]);
  const [viewTab, setViewTab] = useState<'parameters' | 'funnel'>('parameters');

  const pinnedKeys = Object.keys(pinnedOverrides);
  const pinnedCount = pinnedKeys.length;

  const handleModeChange = (newMode: TpsrMode) => {
    onUpdateSetting('tpsrMode', newMode);
    onSaveDirect?.({ tpsrMode: newMode });
  };

  const handleFieldChange = (key: string, value: any) => {
    const updated = { ...pinnedOverrides, [key]: value };
    const updatedKeys = Array.from(new Set([...(settings.tpsrPinnedKeys || []), key]));
    onUpdateSetting('tpsrOverrides', updated);
    onUpdateSetting('tpsrPinnedKeys', updatedKeys);
    onSaveDirect?.({ tpsrOverrides: updated, tpsrPinnedKeys: updatedKeys });
  };

  const handleUnpinField = (key: string) => {
    const updated = { ...pinnedOverrides };
    delete updated[key];
    const updatedKeys = (settings.tpsrPinnedKeys || []).filter(k => k !== key);
    onUpdateSetting('tpsrOverrides', updated);
    onUpdateSetting('tpsrPinnedKeys', updatedKeys);
    onSaveDirect?.({ tpsrOverrides: updated, tpsrPinnedKeys: updatedKeys });
  };

  const handleResetAllToPreset = () => {
    if (pinnedCount === 0) return;
    if (window.confirm(`Reset all ${pinnedCount} pinned parameters to ${mode.toUpperCase()} preset defaults?`)) {
      onUpdateSetting('tpsrOverrides', {});
      onUpdateSetting('tpsrPinnedKeys', []);
      onSaveDirect?.({ tpsrOverrides: {}, tpsrPinnedKeys: [] });
    }
  };

  // Filter params by active group
  const groupParams = useMemo(() => {
    return PARAM_REGISTRY.filter(p => p.group === activeGroup);
  }, [activeGroup]);

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-cyan-950/40 via-blue-950/30 to-purple-950/40 border border-cyan-800/40 rounded-xl p-5 shadow-lg relative overflow-hidden">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="p-1.5 rounded-lg bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
                <TrendingUp className="w-5 h-5" />
              </span>
              <h2 className="text-lg font-bold text-slate-100 tracking-wide">
                Trend Pullback Sweep Reversal (TPSR)
              </h2>
              <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-cyan-900/60 text-cyan-300 border border-cyan-700/50">
                Primary Strategy 4
              </span>
            </div>
            <p className="text-xs text-slate-400 max-w-2xl">
              11-stage institutional execution model: Prevailing trend alignment → Value zone pullback → Liquidity pool sweep → Hammer/Star rejection → Engulf confirmation → Structural exit ladder.
            </p>
          </div>

          {/* Mode Selector */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center bg-slate-900/90 border border-slate-800 rounded-lg p-1 shadow-inner">
              {(['strict', 'balanced', 'aggressive'] as TpsrMode[]).map(m => (
                <button
                  key={m}
                  onClick={() => handleModeChange(m)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all capitalize ${
                    mode === m
                      ? 'bg-cyan-500 text-slate-950 shadow-md font-bold'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>

            {/* Reset All Button */}
            <button
              onClick={handleResetAllToPreset}
              disabled={pinnedCount === 0}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all ${
                pinnedCount > 0
                  ? 'bg-rose-950/30 border-rose-800/50 text-rose-300 hover:bg-rose-900/50 hover:border-rose-700'
                  : 'bg-slate-900/40 border-slate-800/50 text-slate-500 cursor-not-allowed'
              }`}
              title="Reset all user-pinned overrides back to mode presets"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset All ({pinnedCount})</span>
            </button>
          </div>
        </div>

        {/* Status Sub-bar */}
        <div className="mt-4 pt-3 border-t border-slate-800/60 flex flex-wrap items-center gap-4 text-xs text-slate-400">
          <div className="flex items-center gap-1.5">
            <span className="text-slate-500">Regime Tier:</span>
            <span className="px-2 py-0.5 rounded bg-blue-950/60 text-blue-300 border border-blue-800/50 font-medium uppercase text-[11px]">
              {regimeTier} ({regimeConfidence}%)
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-slate-500">Config Hash:</span>
            <span className="font-mono text-cyan-400 text-[11px] bg-slate-900/80 px-2 py-0.5 rounded border border-slate-800">
              {resolved.configHash}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-slate-500">Pinned Fields:</span>
            <span className={`font-semibold ${pinnedCount > 0 ? 'text-amber-400' : 'text-slate-400'}`}>
              {pinnedCount} / {PARAM_REGISTRY.length}
            </span>
          </div>
          <div className="ml-auto flex items-center gap-1 bg-slate-900/80 p-0.5 rounded-lg border border-slate-800">
            <button
              onClick={() => setViewTab('parameters')}
              className={`px-2.5 py-1 text-xs rounded-md transition-all ${
                viewTab === 'parameters'
                  ? 'bg-cyan-500/20 text-cyan-300 font-semibold border border-cyan-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Parameters
            </button>
            <button
              onClick={() => setViewTab('funnel')}
              className={`px-2.5 py-1 text-xs rounded-md transition-all ${
                viewTab === 'funnel'
                  ? 'bg-cyan-500/20 text-cyan-300 font-semibold border border-cyan-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Funnel Inspector
            </button>
          </div>
        </div>
      </div>

      {/* Cross-Field Validation Alert */}
      {!validation.valid && (
        <div className="bg-rose-950/40 border border-rose-800/80 rounded-xl p-4 text-rose-200 shadow-lg">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            <div className="space-y-1 text-xs">
              <h4 className="font-bold text-rose-300">Cross-Field Validation Issues Detected</h4>
              <ul className="list-disc pl-4 space-y-0.5 text-rose-300/90">
                {validation.globalErrors.map((err, idx) => (
                  <li key={idx}>{err}</li>
                ))}
              </ul>
              <p className="text-[11px] text-rose-400 pt-1">
                Trading engine will hold off signals until cross-parameter mathematical contradictions are corrected.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Main Tab Content */}
      {viewTab === 'parameters' ? (
        <div className="space-y-4">
          {/* Group Navigation Bar */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
            {PIPELINE_GROUPS.map((group, idx) => {
              const countInGroup = PARAM_REGISTRY.filter(p => p.group === group).length;
              const pinnedInGroup = PARAM_REGISTRY.filter(p => p.group === group && pinnedOverrides[p.key] !== undefined).length;
              const isSelected = activeGroup === group;

              return (
                <button
                  key={group}
                  onClick={() => setActiveGroup(group)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-all border ${
                    isSelected
                      ? 'bg-slate-800 text-cyan-300 border-cyan-500/50 shadow-sm'
                      : 'bg-slate-900/60 text-slate-400 border-slate-800/80 hover:bg-slate-800/40 hover:text-slate-200'
                  }`}
                >
                  <span>{idx + 1}. {group}</span>
                  {pinnedInGroup > 0 && (
                    <span className="w-4 h-4 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] flex items-center justify-center font-bold">
                      {pinnedInGroup}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Active Group Parameters Card */}
          <div className="bg-slate-900/80 border border-slate-800/80 rounded-xl p-5 shadow-lg">
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-800">
              <div>
                <h3 className="text-sm font-bold text-slate-200">{activeGroup}</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Parameters affecting pipeline stages in {activeGroup.toLowerCase()}.
                </p>
              </div>
              <span className="text-xs text-slate-400">
                {groupParams.length} parameters
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {groupParams.map(param => (
                <ParameterControl
                  key={param.key}
                  param={param}
                  mode={mode}
                  currentVal={resolved.values[param.key]}
                  source={resolved.sources[param.key]}
                  error={validation.errors[param.key]}
                  onChange={val => handleFieldChange(param.key, val)}
                  onUnpin={() => handleUnpinField(param.key)}
                />
              ))}
            </div>
          </div>
        </div>
      ) : (
        /* Funnel Inspector Tab */
        <div className="bg-slate-900/80 border border-slate-800/80 rounded-xl p-6 shadow-lg space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800">
            <div>
              <div className="flex items-center gap-2">
                <BarChart2 className="w-5 h-5 text-cyan-400" />
                <h3 className="text-sm font-bold text-slate-100">Pipeline Conversion Funnel</h3>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Tracks candidate coin progression through all 11 stages and identifies exact dropoff bottlenecks.
              </p>
            </div>

            <div className="flex items-center bg-slate-950/80 border border-slate-800 rounded-lg p-1">
              {(['strict', 'balanced', 'aggressive'] as TpsrMode[]).map(m => (
                <button
                  key={m}
                  onClick={() => setFunnelMode(m)}
                  className={`px-3 py-1 text-xs font-semibold rounded-md transition-all capitalize ${
                    funnelMode === m
                      ? 'bg-cyan-500 text-slate-950 shadow-md font-bold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          {/* Bottleneck Callout */}
          <div className="bg-amber-950/20 border border-amber-800/40 rounded-xl p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="p-2 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30">
                <AlertTriangle className="w-4 h-4" />
              </span>
              <div>
                <h4 className="text-xs font-bold text-amber-300">Dominant Pipeline Bottleneck</h4>
                <p className="text-xs text-slate-300">
                  <span className="font-semibold text-amber-400">{bottleneck.stage}</span> stage causes the largest candidate dropoff ({bottleneck.dropoffPct}% elimination rate).
                </p>
              </div>
            </div>
            <span className="text-xs text-slate-400 font-mono">
              Mode: {funnelMode}
            </span>
          </div>

          {/* Funnel Stage Bars */}
          <div className="space-y-3">
            {[
              { stage: 'Stage 0: Universe & Volume Filters', count: funnelStats.universePass },
              { stage: 'Stage 1: Regime Gating', count: funnelStats.regimePass },
              { stage: 'Stage 2: Higher-TF Trend Alignment', count: funnelStats.trendPass },
              { stage: 'Stage 3: Impulse & Pullback Structure', count: funnelStats.pullbackPass },
              { stage: 'Stage 4: Value Zone Confluence', count: funnelStats.zonePass },
              { stage: 'Stage 5: Liquidity Sweep Detection', count: funnelStats.sweepPass },
              { stage: 'Stage 6: Rejection Candle Trigger', count: funnelStats.rejectionPass },
              { stage: 'Stage 7: Engulf Confirmation', count: funnelStats.engulfPass },
              { stage: 'Stage 8-10: Qualified Trade Signals', count: funnelStats.signals }
            ].map((row, idx, arr) => {
              const maxCount = Math.max(1, arr[0].count);
              const pctOfTop = ((row.count / maxCount) * 100).toFixed(1);
              const prev = idx > 0 ? arr[idx - 1].count : row.count;
              const stepRetention = prev > 0 ? ((row.count / prev) * 100).toFixed(0) : '100';

              return (
                <div key={row.stage} className="space-y-1">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-300 font-medium">{row.stage}</span>
                    <div className="flex items-center gap-2 font-mono">
                      <span className="text-slate-400">{row.count} candidates</span>
                      <span className="text-cyan-400 font-semibold">{pctOfTop}%</span>
                      {idx > 0 && (
                        <span className="text-[10px] text-slate-500">({stepRetention}% retained)</span>
                      )}
                    </div>
                  </div>
                  <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-800">
                    <div
                      className="bg-gradient-to-r from-cyan-500 to-blue-500 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${Math.max(2, Number(pctOfTop))}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Stage Veto Reasons Table */}
          {Object.keys(funnelStats.vetoed).length > 0 && (
            <div className="pt-4 border-t border-slate-800 space-y-2">
              <h4 className="text-xs font-bold text-slate-300">Veto Reasons Logged in Scan Cycles</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                {Object.entries(funnelStats.vetoed).map(([reason, count]) => (
                  <div key={reason} className="p-2 rounded bg-slate-950/60 border border-slate-800/80 flex justify-between items-center text-xs">
                    <span className="text-slate-400 font-mono text-[11px] truncate pr-2" title={reason}>
                      {reason}
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-rose-950/60 text-rose-300 border border-rose-800/50 text-[10px] font-bold">
                      {count}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

interface ParameterControlProps {
  param: ParamDef;
  mode: TpsrMode;
  currentVal: any;
  source: 'pinned' | 'regime-adjusted' | 'preset';
  error?: string;
  onChange: (val: any) => void;
  onUnpin: () => void;
}

const ParameterControl: React.FC<ParameterControlProps> = ({
  param,
  mode,
  currentVal,
  source,
  error,
  onChange,
  onUnpin
}) => {
  const isPinned = source === 'pinned';
  const isRegimeAdjusted = source === 'regime-adjusted';
  const presetVal = param.presets[mode] ?? param.presets.balanced;

  return (
    <div className={`p-3 rounded-lg border transition-all ${
      error
        ? 'bg-rose-950/20 border-rose-800/80 shadow-sm'
        : isPinned
        ? 'bg-purple-950/20 border-purple-800/50 shadow-sm'
        : isRegimeAdjusted
        ? 'bg-blue-950/20 border-blue-800/40'
        : 'bg-slate-950/50 border-slate-800/70 hover:border-slate-700'
    }`}>
      {/* Control Header */}
      <div className="flex items-start justify-between gap-1 mb-2">
        <div>
          <label className="text-xs font-semibold text-slate-200 block truncate" title={param.label}>
            {param.label}
          </label>
          <span className="text-[10px] text-slate-500 font-mono block truncate" title={param.key}>
            {param.key}
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {/* Source Badge */}
          {isPinned ? (
            <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-purple-900/60 text-purple-300 border border-purple-700/60">
              <Pin className="w-2.5 h-2.5" />
              Pinned
            </span>
          ) : isRegimeAdjusted ? (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-900/50 text-blue-300 border border-blue-700/50">
              Scaled
            </span>
          ) : (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-800 text-slate-400">
              Preset
            </span>
          )}

          {/* Unpin Button */}
          {isPinned && (
            <button
              onClick={onUnpin}
              className="p-1 rounded text-purple-400 hover:text-purple-200 hover:bg-purple-900/50 transition-colors"
              title="Unpin and revert to preset"
            >
              <PinOff className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Input Field */}
      <div className="mt-2">
        {param.type === 'bool' ? (
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">Enabled</span>
            <button
              type="button"
              onClick={() => onChange(!currentVal)}
              className={`w-10 h-5 flex items-center rounded-full p-0.5 transition-colors ${
                currentVal ? 'bg-cyan-500' : 'bg-slate-800'
              }`}
            >
              <div
                className={`bg-slate-950 w-4 h-4 rounded-full shadow-md transform transition-transform ${
                  currentVal ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        ) : param.type === 'enum' ? (
          <select
            value={currentVal ?? ''}
            onChange={e => onChange(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
          >
            {(param.options || []).map(opt => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        ) : param.type === 'enumList' ? (
          <div className="text-xs text-slate-400 font-mono">
            {Array.isArray(currentVal) ? currentVal.join(', ') : String(currentVal)}
          </div>
        ) : (
          <div className="relative">
            <input
              type="number"
              step={param.step ?? (param.type === 'int' ? 1 : 0.05)}
              min={param.min}
              max={param.max}
              value={currentVal ?? ''}
              onChange={e => {
                const val = param.type === 'int' ? parseInt(e.target.value, 10) : parseFloat(e.target.value);
                onChange(isNaN(val) ? '' : val);
              }}
              className={`w-full bg-slate-900 border rounded px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none font-mono ${
                error ? 'border-rose-500 focus:border-rose-400' : 'border-slate-700 focus:border-cyan-500'
              } ${param.unit ? 'pr-8' : ''}`}
            />
            {param.unit && (
              <span className="absolute right-2.5 top-1.5 text-[11px] text-slate-500 pointer-events-none">
                {param.unit}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Preset Reference & Error */}
      <div className="mt-2 flex items-center justify-between text-[10px]">
        <span className="text-slate-500">
          Preset: <span className="font-mono text-slate-400">{String(presetVal)}</span>
        </span>
        {error && (
          <span className="text-rose-400 font-semibold truncate max-w-[150px]" title={error}>
            {error}
          </span>
        )}
      </div>

      {/* Help tooltip */}
      <p className="mt-1 text-[11px] text-slate-400 line-clamp-2" title={param.help}>
        {param.help}
      </p>
    </div>
  );
};
