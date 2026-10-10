import React, { useState, useMemo } from 'react';
import { AppSettings } from '../types';
import {
  Mode,
  Habitat,
  PoolType,
  EngulfMode,
  SweepConfig,
  HabitatProfile,
  BASE,
  MODES,
  HABITATS,
  REGIME_MAP,
  resolveConfig,
  getPresetConfig,
  getEffectiveConfig,
  getNestedValue,
  setNestedOverride,
  deleteNestedOverride,
  validateSweepConfig,
  SUPPORTED_TIMEFRAMES,
  DeepPartial
} from '../utils/strategies/liquiditySweep/schema';
import {
  Sparkles, RotateCcw, AlertTriangle, Check, SlidersHorizontal,
  Layers, ShieldCheck, Activity, Target, Clock, ArrowRight, Compass
} from 'lucide-react';

interface LiquiditySweepPanelProps {
  settings: AppSettings;
  onUpdateSetting: (field: keyof AppSettings, value: any) => void;
  onSaveDirect?: (partialSettings: Partial<AppSettings>) => void;
}

const POOL_TYPES: { key: PoolType; label: string; desc: string }[] = [
  { key: 'prevWeekHL', label: 'Previous Week High / Low', desc: 'Major macro liquidity level' },
  { key: 'prevDayHL', label: 'Previous Day High / Low', desc: 'Daily high/low stop runs' },
  { key: 'rangeEdge', label: 'Range Edges', desc: 'Structural boundary liquidity' },
  { key: 'equalHL', label: 'Equal Highs / Lows', desc: 'Clustered stop liquidity' },
  { key: 'sessionHL', label: 'Session High / Low', desc: 'Intraday session pivots' },
  { key: 'swingHL', label: 'Swing High / Low', desc: 'Fractal pivot stop levels' },
];

const ALL_HABITATS: Habitat[] = ['range', 'trend', 'compression', 'expansion', 'chaos', 'transition'];

export const LiquiditySweepPanel: React.FC<LiquiditySweepPanelProps> = ({
  settings,
  onUpdateSetting,
  onSaveDirect,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'pipeline' | 'habitats' | 'regimemap'>('pipeline');
  const [newLabelInput, setNewLabelInput] = useState('');
  const [newLabelHabitat, setNewLabelHabitat] = useState<Habitat>('range');

  // 1. Current mode & regime
  const mode: Mode = (settings.liquiditySweepMode || 'balanced') as Mode;
  const currentRegime = settings.coindcxActiveRegime || settings.marketRegime || 'RANGE';
  const confidence = settings.regimeConfidence ?? 70;
  const stabilityBars = settings.regimeStableBars ?? 2;

  // 2. Custom stores from settings (with standard defaults fallback)
  const allOverrides = useMemo(() => settings.liquiditySweepOverrides || {}, [settings.liquiditySweepOverrides]);
  const currentModeOverrides = useMemo(() => (allOverrides[mode] || {}) as DeepPartial<SweepConfig>, [allOverrides, mode]);
  const customHabitats = useMemo(() => (settings.liquiditySweepHabitats || HABITATS) as Record<Habitat, HabitatProfile>, [settings.liquiditySweepHabitats]);
  const customRegimeMap = useMemo(() => (settings.liquiditySweepRegimeMap || REGIME_MAP) as Record<string, Habitat>, [settings.liquiditySweepRegimeMap]);

  // 3. Preset config (MODE + BASE only) & Effective config (Preset + Habitat adjust/overrides)
  const presetCfg = useMemo(() => getPresetConfig(mode), [mode]);
  const effectiveResult = useMemo(() => {
    return getEffectiveConfig(mode, currentRegime, customHabitats, customRegimeMap);
  }, [mode, currentRegime, customHabitats, customRegimeMap]);
  const effectiveCfg = effectiveResult.cfg;

  // 4. Fully resolved config (Effective + User sparse overrides)
  const resolvedResult = useMemo(() => {
    return resolveConfig({
      mode,
      regimeLabel: currentRegime,
      regimeConfidence: confidence,
      regimeStableBars: stabilityBars,
      regimeMap: customRegimeMap,
      habitats: customHabitats,
      uiOverrides: currentModeOverrides,
    });
  }, [mode, currentRegime, confidence, stabilityBars, customRegimeMap, customHabitats, currentModeOverrides]);

  const activeCfg = resolvedResult.status === 'ACTIVE' ? resolvedResult.cfg : effectiveCfg;

  // 5. Validation check
  const validation = useMemo(() => validateSweepConfig(activeCfg), [activeCfg]);

  // Handlers for sparse overrides
  const handleFieldChange = (path: string, val: any) => {
    const updatedForMode = setNestedOverride(currentModeOverrides, path, val);
    const updatedAll = {
      ...allOverrides,
      [mode]: updatedForMode,
    };
    onUpdateSetting('liquiditySweepOverrides', updatedAll);
    onSaveDirect?.({ liquiditySweepOverrides: updatedAll });
  };

  const handleFieldReset = (path: string) => {
    const updatedForMode = deleteNestedOverride(currentModeOverrides, path);
    const updatedAll = {
      ...allOverrides,
      [mode]: updatedForMode,
    };
    onUpdateSetting('liquiditySweepOverrides', updatedAll);
    onSaveDirect?.({ liquiditySweepOverrides: updatedAll });
  };

  const handleResetAllForMode = () => {
    const updatedAll = {
      ...allOverrides,
      [mode]: {},
    };
    onUpdateSetting('liquiditySweepOverrides', updatedAll);
    onSaveDirect?.({ liquiditySweepOverrides: updatedAll });
  };

  const handleModeSwitch = (newMode: Mode) => {
    onUpdateSetting('liquiditySweepMode', newMode);
    onSaveDirect?.({ liquiditySweepMode: newMode });
  };

  const handleHabitatChange = (habitat: Habitat, patch: Partial<HabitatProfile>) => {
    const updated = {
      ...customHabitats,
      [habitat]: {
        ...customHabitats[habitat],
        ...patch,
      },
    };
    onUpdateSetting('liquiditySweepHabitats', updated);
    onSaveDirect?.({ liquiditySweepHabitats: updated });
  };

  const handleRegimeMapChange = (label: string, mappedHabitat: Habitat) => {
    const updated = {
      ...customRegimeMap,
      [label]: mappedHabitat,
    };
    onUpdateSetting('liquiditySweepRegimeMap', updated);
    onSaveDirect?.({ liquiditySweepRegimeMap: updated });
  };

  const handleAddCustomLabel = () => {
    if (!newLabelInput.trim()) return;
    const formatted = newLabelInput.trim().toUpperCase();
    handleRegimeMapChange(formatted, newLabelHabitat);
    setNewLabelInput('');
  };

  // Helper row component that renders Preset, Effective, Badges, and Reset
  const ParamRow: React.FC<{
    path: string;
    label: string;
    desc: string;
    min?: number;
    max?: number;
    step?: number;
    unit?: string;
    type?: 'number' | 'text';
  }> = ({ path, label, desc, min, max, step = 1, unit, type = 'number' }) => {
    const presetVal = getNestedValue(presetCfg, path);
    const effectiveVal = getNestedValue(effectiveCfg, path);
    const overrideVal = getNestedValue(currentModeOverrides, path);
    const isEdited = overrideVal !== undefined;
    const isRegimeAdjusted = presetVal !== effectiveVal;
    const displayVal = isEdited ? overrideVal : effectiveVal;

    const [localStr, setLocalStr] = useState<string>(displayVal !== undefined ? String(displayVal) : '');
    React.useEffect(() => {
      setLocalStr(displayVal !== undefined ? String(displayVal) : '');
    }, [displayVal]);

    const handleCommit = () => {
      if (type === 'number') {
        let parsed = parseFloat(localStr);
        if (isNaN(parsed)) {
          handleFieldReset(path);
          return;
        }
        if (min !== undefined) parsed = Math.max(min, parsed);
        if (max !== undefined) parsed = Math.min(max, parsed);
        setLocalStr(String(parsed));
        handleFieldChange(path, parsed);
      } else {
        handleFieldChange(path, localStr);
      }
    };

    const hasError = validation.errors[path];

    return (
      <div className={`py-3 border-b border-[#30363D]/40 last:border-0 hover:bg-white/[0.01] px-2 rounded-lg transition-colors ${hasError ? 'bg-rose-950/20' : ''}`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex-1 pr-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs sm:text-sm font-semibold text-gray-200">{label}</span>
              {isEdited && (
                <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                  Edited
                </span>
              )}
              {isRegimeAdjusted && (
                <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">
                  Regime-Adjusted
                </span>
              )}
            </div>
            <p className="text-[11px] text-gray-500 mt-0.5 leading-relaxed">{desc}</p>
            <div className="flex items-center gap-3 text-[10px] text-gray-400 font-mono mt-1">
              <span>Preset: <strong className="text-gray-300">{presetVal ?? '—'}</strong></span>
              <span>Effective ({effectiveResult.habitat}): <strong className="text-purple-300">{effectiveVal ?? '—'}</strong></span>
            </div>
            {hasError && (
              <p className="text-[11px] text-rose-400 font-semibold mt-1 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                <span>{hasError}</span>
              </p>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
            {isEdited && (
              <button
                type="button"
                onClick={() => handleFieldReset(path)}
                title="Reset this field to preset/effective value"
                className="px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white text-xs flex items-center gap-1 transition-all cursor-pointer border border-gray-700"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset</span>
              </button>
            )}
            <div className="flex items-center gap-1">
              <input
                type={type}
                value={localStr}
                onChange={(e) => setLocalStr(e.target.value)}
                onBlur={handleCommit}
                onKeyDown={(e) => { if (e.key === 'Enter') { handleCommit(); e.currentTarget.blur(); } }}
                step={step}
                className={`w-24 bg-[#0E1117] border rounded-lg p-1.5 text-right font-mono text-xs sm:text-sm font-bold text-purple-300 focus:outline-none focus:ring-1 ${
                  hasError ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-500/40' : 'border-[#30363D] focus:border-purple-500 focus:ring-purple-500/40'
                }`}
              />
              {unit && <span className="text-[11px] text-gray-400 font-mono w-7 text-left">{unit}</span>}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const SelectRow: React.FC<{
    path: string;
    label: string;
    desc: string;
    options: { value: string; label: string }[];
  }> = ({ path, label, desc, options }) => {
    const presetVal = getNestedValue(presetCfg, path);
    const effectiveVal = getNestedValue(effectiveCfg, path);
    const overrideVal = getNestedValue(currentModeOverrides, path);
    const isEdited = overrideVal !== undefined;
    const isRegimeAdjusted = presetVal !== effectiveVal;
    const currentVal = isEdited ? overrideVal : effectiveVal;

    return (
      <div className="py-3 border-b border-[#30363D]/40 last:border-0 hover:bg-white/[0.01] px-2 rounded-lg transition-colors">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex-1 pr-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs sm:text-sm font-semibold text-gray-200">{label}</span>
              {isEdited && (
                <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                  Edited
                </span>
              )}
              {isRegimeAdjusted && (
                <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">
                  Regime-Adjusted
                </span>
              )}
            </div>
            <p className="text-[11px] text-gray-500 mt-0.5 leading-relaxed">{desc}</p>
            <div className="flex items-center gap-3 text-[10px] text-gray-400 font-mono mt-1">
              <span>Preset: <strong className="text-gray-300">{presetVal ?? '—'}</strong></span>
              <span>Effective ({effectiveResult.habitat}): <strong className="text-purple-300">{effectiveVal ?? '—'}</strong></span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
            {isEdited && (
              <button
                type="button"
                onClick={() => handleFieldReset(path)}
                title="Reset this select"
                className="px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white text-xs flex items-center gap-1 transition-all cursor-pointer border border-gray-700"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset</span>
              </button>
            )}
            <select
              value={currentVal ?? ''}
              onChange={(e) => handleFieldChange(path, e.target.value)}
              className="bg-[#0E1117] border border-[#30363D] rounded-lg p-1.5 text-xs sm:text-sm font-semibold text-purple-300 focus:outline-none focus:border-purple-500"
            >
              {options.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    );
  };

  const ToggleParamRow: React.FC<{
    path: string;
    label: string;
    desc: string;
  }> = ({ path, label, desc }) => {
    const presetVal = getNestedValue(presetCfg, path);
    const effectiveVal = getNestedValue(effectiveCfg, path);
    const overrideVal = getNestedValue(currentModeOverrides, path);
    const isEdited = overrideVal !== undefined;
    const isRegimeAdjusted = presetVal !== effectiveVal;
    const currentVal = isEdited ? overrideVal : effectiveVal;

    return (
      <div className="py-3 border-b border-[#30363D]/40 last:border-0 hover:bg-white/[0.01] px-2 rounded-lg transition-colors">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex-1 pr-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs sm:text-sm font-semibold text-gray-200">{label}</span>
              {isEdited && (
                <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                  Edited
                </span>
              )}
              {isRegimeAdjusted && (
                <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">
                  Regime-Adjusted
                </span>
              )}
            </div>
            <p className="text-[11px] text-gray-500 mt-0.5 leading-relaxed">{desc}</p>
          </div>

          <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
            {isEdited && (
              <button
                type="button"
                onClick={() => handleFieldReset(path)}
                title="Reset toggle"
                className="px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white text-xs flex items-center gap-1 transition-all cursor-pointer border border-gray-700"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => handleFieldChange(path, !currentVal)}
              className={`w-11 h-6 rounded-full transition-colors flex items-center px-1 cursor-pointer ${
                currentVal ? 'bg-purple-600' : 'bg-gray-700'
              }`}
            >
              <div
                className={`w-4 h-4 rounded-full bg-white transition-transform ${
                  currentVal ? 'transform translate-x-5' : ''
                }`}
              />
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="bg-[#161B22] rounded-xl p-5 sm:p-6 border border-purple-500/30 space-y-5 shadow-xl shadow-purple-950/10">
      {/* Header with Title and ACTIVE / STANDBY Status Badge */}
      <div className="flex items-center justify-between border-b border-[#30363D] pb-4 flex-wrap gap-3">
        <div>
          <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-purple-400" />
            <span>Liquidity Sweep Reversal (8-Stage Regime-Gated)</span>
          </h3>
          <p className="text-xs text-gray-400 mt-0.5">
            Institutional stop-run harvesting pipeline governed by hierarchical precedence:{' '}
            <span className="font-mono text-purple-300">BASE &lt; MODE &lt; HABITAT &lt; USER OVERRIDES</span>.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {resolvedResult.status === 'ACTIVE' ? (
            <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-xs font-bold shadow-sm">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>ACTIVE ({resolvedResult.habitat.toUpperCase()})</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/40 text-xs font-bold shadow-sm">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              <span>STANDBY: {resolvedResult.reason}</span>
            </div>
          )}
        </div>
      </div>

      {/* Mode Presets and Reset All Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-lg bg-gray-900/80 border border-gray-800 gap-3">
        <div>
          <span className="text-xs sm:text-sm font-semibold text-gray-200">Execution Mode Preset</span>
          <p className="text-[11px] text-gray-500 mt-0.5">
            Strict (15m/4h, selective) | Balanced (15m/1h, standard) | Aggressive (5m/1h, high frequency)
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex bg-gray-950 rounded-lg p-1 border border-gray-700">
            {(['strict', 'balanced', 'aggressive'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => handleModeSwitch(m)}
                className={`px-3 py-1 rounded text-xs font-bold capitalize transition-all cursor-pointer ${
                  mode === m
                    ? 'bg-purple-600 text-white shadow'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                {m}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={handleResetAllForMode}
            className="px-3 py-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white text-xs font-semibold flex items-center gap-1.5 border border-gray-700 transition-all cursor-pointer"
            title="Clear all overrides for the currently selected mode"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset All ({mode})</span>
          </button>
        </div>
      </div>

      {/* Sub Tabs: Pipeline Parameters | Regime Habitat Profiles | Label Mapping */}
      <div className="flex border-b border-[#30363D] space-x-2 text-xs font-bold">
        {[
          { id: 'pipeline', label: '1. Pipeline Parameters', icon: SlidersHorizontal },
          { id: 'habitats', label: '2. Regime Habitat Profiles', icon: Layers },
          { id: 'regimemap', label: '3. Regime Label Mapping', icon: Compass },
        ].map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveSubTab(t.id as any)}
              className={`pb-2.5 px-3 flex items-center gap-1.5 transition-colors border-b-2 cursor-pointer ${
                activeSubTab === t.id
                  ? 'text-purple-400 border-purple-500'
                  : 'text-gray-400 hover:text-gray-200 border-transparent'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* Validation Warning Alert */}
      {!validation.valid && (
        <div className="p-3.5 rounded-lg bg-rose-950/40 border border-rose-500/50 space-y-1.5 text-xs text-rose-300">
          <div className="flex items-center gap-2 font-bold text-rose-200">
            <AlertTriangle className="w-4 h-4 text-rose-400" />
            <span>Configuration Validation Errors (Save Blocked)</span>
          </div>
          <ul className="list-disc list-inside space-y-0.5 text-[11px] text-rose-300 font-mono">
            {validation.globalErrors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        </div>
      )}

      {/* SUB-TAB 1: PIPELINE PARAMETERS */}
      {activeSubTab === 'pipeline' && (
        <div className="space-y-6">
          {/* Section A: Timeframes & Global */}
          <div className="space-y-1">
            <div className="text-xs font-bold text-purple-400 uppercase tracking-wider py-1 border-b border-gray-800">
              Global Timeframes & ATR
            </div>
            <SelectRow
              path="timeframes.execution"
              label="Execution Timeframe"
              desc="Timeframe used to detect wicks, rejections, and confirmation candle close"
              options={SUPPORTED_TIMEFRAMES.map((tf) => ({ value: tf, label: tf }))}
            />
            <SelectRow
              path="timeframes.direction"
              label="Direction Timeframe"
              desc="Higher timeframe establishing market trend bias (must be higher than execution)"
              options={SUPPORTED_TIMEFRAMES.map((tf) => ({ value: tf, label: tf }))}
            />
            <ParamRow
              path="atrPeriod"
              label="Global ATR Period"
              desc="Period used for all ATR-based distance and stop calculations"
              min={5}
              max={50}
              step={1}
              unit="bars"
            />
          </div>

          {/* Section B: Stage 1 & 2: Regime & Direction Gates */}
          <div className="space-y-1">
            <div className="text-xs font-bold text-purple-400 uppercase tracking-wider py-1 border-b border-gray-800">
              Stage 1 & 2: Regime & Direction Gates
            </div>
            <ParamRow
              path="regime.minConfidence"
              label="Min Regime Confidence (%)"
              desc="Minimum regime confidence score from regime engine to activate"
              min={10}
              max={95}
              step={5}
              unit="%"
            />
            <ParamRow
              path="regime.stabilityBars"
              label="Regime Stability Bars"
              desc="Consecutive closed execution bars the current regime must persist before trading"
              min={1}
              max={10}
              step={1}
              unit="bars"
            />
            <SelectRow
              path="regime.btcEthAlignment"
              label="BTC/ETH Macro Alignment"
              desc="Directional alignment required between BTC and ETH macro trends"
              options={[
                { value: 'both_agree', label: 'Both Agree (Strict Trend Alignment)' },
                { value: 'btc_not_opposing', label: 'BTC Not Opposing (Standard)' },
                { value: 'off', label: 'Off (Independent Coin Execution)' },
              ]}
            />
            <SelectRow
              path="regime.onExit"
              label="On-Exit Behavior"
              desc="Action taken on open trades when the regime engine moves out of favour into standby"
              options={[
                { value: 'tighten', label: 'Tighten (Move SL to Break-Even / Halve Distance)' },
                { value: 'close', label: 'Close (Immediate Market Exit)' },
                { value: 'manage', label: 'Manage (Let Pre-Set SL/TP Play Out)' },
              ]}
            />
            <ParamRow
              path="universe.maxRank"
              label="Max Universe Rank"
              desc="Only scan and trade coins ranked within this top universe cutoff"
              min={1}
              max={100}
              step={1}
              unit="rank"
            />
            <ToggleParamRow
              path="direction.counterBiasAllowed"
              label="Allow Counter-Bias Setups"
              desc="Permit taking counter-trend liquidity sweeps against the direction timeframe"
            />
            <ParamRow
              path="direction.counterBiasRiskMult"
              label="Counter-Bias Risk Multiplier"
              desc="Risk reduction multiplier applied when taking allowed counter-bias setups"
              min={0.1}
              max={1.0}
              step={0.05}
              unit="x"
            />
            <ParamRow
              path="direction.edgeZonePct"
              label="Range Edge Zone (%)"
              desc="Width of outer range boundary zone where sweeps are eligible in range/compression habitats"
              min={5}
              max={50}
              step={5}
              unit="%"
            />
          </div>

          {/* Section C: Stage 3 & 4: Liquidity Pools & Sweep Criteria */}
          <div className="space-y-1">
            <div className="text-xs font-bold text-purple-400 uppercase tracking-wider py-1 border-b border-gray-800">
              Stage 3 & 4: Pools & Sweep Detection
            </div>
            <ParamRow
              path="pools.minScore"
              label="Min Pool Score"
              desc="Minimum untouched pool quality score (0-100) to qualify for sweep"
              min={20}
              max={95}
              step={5}
            />

            {/* Granular Pool Type Weights */}
            <div className="p-3 bg-gray-900/60 rounded-lg border border-gray-800 space-y-2 mt-2">
              <span className="text-xs font-bold text-gray-300">Untouched Pool Type Weights (0–100)</span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                {POOL_TYPES.map((pt) => (
                  <ParamRow
                    key={pt.key}
                    path={`pools.weights.${pt.key}`}
                    label={pt.label}
                    desc={pt.desc}
                    min={0}
                    max={100}
                    step={5}
                  />
                ))}
              </div>
            </div>

            <ParamRow
              path="pools.touchBonus"
              label="Pool Touch Bonus"
              desc="Bonus points added for each additional touch on equal highs/lows"
              min={0}
              max={20}
              step={1}
            />
            <ParamRow
              path="pools.equalLevelTolATR"
              label="Equal-Level Tolerance (ATR)"
              desc="Price tolerance in ATR to cluster swings into equal highs/lows"
              min={0.01}
              max={0.5}
              step={0.01}
              unit="ATR"
            />
            <ParamRow
              path="pools.pivotBars"
              label="Pivot Bars (Fractal Width)"
              desc="Number of bars on each side required to form a fractal swing high/low"
              min={1}
              max={10}
              step={1}
              unit="bars"
            />
            <ParamRow
              path="pools.maxAgeBars"
              label="Max Pool Age (Bars)"
              desc="Maximum lookback window for untouched liquidity pools"
              min={50}
              max={1000}
              step={50}
              unit="bars"
            />
            <ParamRow
              path="sweep.minDepthATR"
              label="Min Sweep Depth (ATR)"
              desc="Minimum penetration beyond pool price in ATR to count as real sweep"
              min={0.01}
              max={1.0}
              step={0.01}
              unit="ATR"
            />
            <ParamRow
              path="sweep.maxDepthATR"
              label="Max Sweep Depth (ATR)"
              desc="Maximum penetration allowed (deeper indicates breakout, not sweep)"
              min={0.5}
              max={5.0}
              step={0.1}
              unit="ATR"
            />
            <ParamRow
              path="sweep.reclaimWithinBars"
              label="Reclaim Within Bars"
              desc="Max bars for price to close back inside the swept level"
              min={1}
              max={10}
              step={1}
              unit="bars"
            />
            <ParamRow
              path="sweep.minRelVolume"
              label="Min Relative Volume"
              desc="Sweep candle volume vs lookback SMA volume multiplier"
              min={0.5}
              max={4.0}
              step={0.1}
              unit="x"
            />
            <ParamRow
              path="sweep.volumeLookback"
              label="Volume SMA Lookback"
              desc="Bars for SMA baseline to compare sweep volume against"
              min={5}
              max={100}
              step={5}
              unit="bars"
            />
          </div>

          {/* Section D: Stage 5 & 6: Rejection Candle & Engulf Confirmation */}
          <div className="space-y-1">
            <div className="text-xs font-bold text-purple-400 uppercase tracking-wider py-1 border-b border-gray-800">
              Stage 5 & 6: Rejection & Engulf Confirmation
            </div>
            <ParamRow
              path="trigger.minWickToRange"
              label="Min Wick/Range Ratio"
              desc="Rejection wick must comprise at least this proportion of the candle range"
              min={0.2}
              max={0.8}
              step={0.05}
            />
            <ParamRow
              path="trigger.maxOppWickToRange"
              label="Max Opposing Wick/Range"
              desc="Maximum permitted opposite wick proportion (prevent indecision candles)"
              min={0.1}
              max={0.5}
              step={0.05}
            />
            <ParamRow
              path="trigger.maxBodyToRange"
              label="Max Body/Range Ratio"
              desc="Maximum allowable candle body proportion for hammer/star trigger"
              min={0.2}
              max={0.7}
              step={0.05}
            />
            <ParamRow
              path="trigger.minCloseLocation"
              label="Min Close Location"
              desc="Close position from the swept extreme (0.6 = close in top 40% for long)"
              min={0.4}
              max={0.95}
              step={0.05}
            />
            <ParamRow
              path="trigger.minRangeATR"
              label="Min Rejection Range (ATR)"
              desc="Rejection candle range must be at least this multiple of ATR"
              min={0.2}
              max={2.0}
              step={0.1}
              unit="ATR"
            />
            <ParamRow
              path="confirm.windowBars"
              label="Confirm Window (Bars)"
              desc="Candles allowed for confirmation engulf after rejection candle"
              min={1}
              max={5}
              step={1}
              unit="bars"
            />
            <SelectRow
              path="confirm.engulf"
              label="Confirmation Engulf Mode"
              desc="Range = closes beyond rejection extreme; Body = engulfs body; Close Through = closes beyond body top"
              options={[
                { value: 'body', label: 'Body (Engulfs Rejection Candle Body)' },
                { value: 'range', label: 'Range (Closes Beyond High/Low)' },
                { value: 'close_through', label: 'Close Through (Closes Beyond Body Top)' },
              ]}
            />
            <ParamRow
              path="confirm.minBodyATR"
              label="Min Confirm Body (ATR)"
              desc="Confirmation candle body must be at least this multiple of ATR"
              min={0.1}
              max={1.5}
              step={0.05}
              unit="ATR"
            />
          </div>

          {/* Section E: Stage 7 & 8: Risk Gates, Fees & Exits */}
          <div className="space-y-1">
            <div className="text-xs font-bold text-purple-400 uppercase tracking-wider py-1 border-b border-gray-800">
              Stage 7 & 8: Risk Gates, Fees & Exits
            </div>
            <ParamRow
              path="risk.riskMult"
              label="Position Size Multiplier"
              desc="Multiplies the application's global per-trade risk setting"
              min={0.1}
              max={3.0}
              step={0.05}
              unit="x"
            />
            <ParamRow
              path="risk.stopBufferATR"
              label="Stop Buffer (ATR)"
              desc="Protective cushion added beyond sweep extreme in ATR"
              min={0.05}
              max={1.0}
              step={0.05}
              unit="ATR"
            />
            <ParamRow
              path="risk.minStopATR"
              label="Min Stop Distance (ATR)"
              desc="Minimum distance between entry and stop loss"
              min={0.2}
              max={2.0}
              step={0.1}
              unit="ATR"
            />
            <ParamRow
              path="risk.maxStopATR"
              label="Max Stop Distance (ATR)"
              desc="Maximum distance between entry and stop loss"
              min={1.0}
              max={6.0}
              step={0.1}
              unit="ATR"
            />
            <ParamRow
              path="risk.minRR"
              label="Min Risk:Reward Target"
              desc="Minimum structural target R:R required for trade execution"
              min={1.0}
              max={5.0}
              step={0.1}
              unit=":1"
            />
            <ParamRow
              path="risk.maxFeeToRisk"
              label="Max Fee Cost (in R)"
              desc="Maximum round-trip fee drag relative to stop loss risk (e.g. 0.2 = 20% of 1R)"
              min={0.05}
              max={0.5}
              step={0.01}
              unit="R"
            />
            <SelectRow
              path="exits.tp1.basis"
              label="TP1 Basis"
              desc="Method to calculate first take-profit target"
              options={[
                { value: 'r_multiple', label: 'R-Multiple (Fixed Multiple of Stop Distance)' },
                { value: 'range_mid', label: 'Range Mid (50% Center of Structural Range)' },
              ]}
            />
            <ParamRow
              path="exits.tp1.r"
              label="TP1 R-Multiple"
              desc="Target distance in R when TP1 basis is set to r_multiple"
              min={0.5}
              max={5.0}
              step={0.1}
              unit="R"
            />
            <ParamRow
              path="exits.tp1.closePct"
              label="TP1 Close Percentage (%)"
              desc="Percentage of open position closed at TP1"
              min={10}
              max={100}
              step={5}
              unit="%"
            />
            <SelectRow
              path="exits.tp2.basis"
              label="TP2 Basis"
              desc="Method to calculate second take-profit target"
              options={[
                { value: 'opposite_pool', label: 'Opposite Pool (Next Untouched Pool)' },
                { value: 'range_edge', label: 'Range Edge (Opposite Boundary of Range)' },
              ]}
            />
            <ToggleParamRow
              path="exits.moveToBEAfterTp1"
              label="Move to Break-Even After TP1"
              desc="Advance stop-loss to entry price + fee buffer upon reaching TP1"
            />
            <SelectRow
              path="exits.trail"
              label="Trailing Stop"
              desc="Trail runner portion along structural pivot levels"
              options={[
                { value: 'off', label: 'Off (Standard Target Exits)' },
                { value: 'structure', label: 'Structure (Trail Closed Bar Pivots)' },
              ]}
            />
            <ParamRow
              path="exits.timeStopBars"
              label="Time Stop (Bars)"
              desc="Maximum bars to hold position before mandatory close on lack of momentum"
              min={4}
              max={50}
              step={1}
              unit="bars"
            />
            <ParamRow
              path="frequency.cooldownBarsAfterLoss"
              label="Cooldown Bars After Loss"
              desc="Bars to pause trading the symbol after a losing trade"
              min={1}
              max={20}
              step={1}
              unit="bars"
            />
            <ParamRow
              path="frequency.maxPerSymbolPerDay"
              label="Daily Cap Per Symbol"
              desc="Maximum executed trades per symbol within a rolling 24-hour window"
              min={1}
              max={20}
              step={1}
              unit="trades"
            />
          </div>
        </div>
      )}

      {/* SUB-TAB 2: REGIME HABITAT PROFILES */}
      {activeSubTab === 'habitats' && (
        <div className="space-y-4">
          <div className="border-b border-[#30363D] pb-2">
            <span className="text-sm font-bold text-gray-200">Regime Habitat Profile Matrix</span>
            <p className="text-xs text-gray-400 mt-0.5">
              Defines which modes are eligible per habitat, along with dynamic parameter adjustments (min-RR delta, time-stop multiplier, and risk multiplier).
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border border-gray-800 rounded-lg overflow-hidden">
              <thead className="bg-gray-900 text-gray-400 font-mono">
                <tr>
                  <th className="p-3">Habitat</th>
                  <th className="p-3 text-center">Strict</th>
                  <th className="p-3 text-center">Balanced</th>
                  <th className="p-3 text-center">Aggressive</th>
                  <th className="p-3 text-right">Min-RR Delta</th>
                  <th className="p-3 text-right">Time-Stop Mult</th>
                  <th className="p-3 text-right">Risk Mult</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/60 font-mono">
                {ALL_HABITATS.map((hab) => {
                  const profile = customHabitats[hab] || HABITATS[hab];
                  const isCurrent = effectiveResult.habitat === hab;

                  const handleToggleMode = (targetMode: Mode) => {
                    const currentList = profile.enabledIn || [];
                    const updatedList = currentList.includes(targetMode)
                      ? currentList.filter((m) => m !== targetMode)
                      : [...currentList, targetMode];
                    handleHabitatChange(hab, { enabledIn: updatedList });
                  };

                  return (
                    <tr key={hab} className={`hover:bg-white/[0.02] ${isCurrent ? 'bg-purple-950/20' : ''}`}>
                      <td className="p-3 font-bold text-gray-200 capitalize">
                        <div className="flex items-center gap-1.5">
                          <span>{hab}</span>
                          {isCurrent && (
                            <span className="px-1.5 py-0.2 rounded text-[9px] bg-purple-500/20 text-purple-300 border border-purple-500/40">
                              CURRENT
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="p-3 text-center">
                        <input
                          type="checkbox"
                          checked={profile.enabledIn.includes('strict')}
                          onChange={() => handleToggleMode('strict')}
                          className="rounded border-gray-700 text-purple-600 focus:ring-purple-500 cursor-pointer"
                        />
                      </td>
                      <td className="p-3 text-center">
                        <input
                          type="checkbox"
                          checked={profile.enabledIn.includes('balanced')}
                          onChange={() => handleToggleMode('balanced')}
                          className="rounded border-gray-700 text-purple-600 focus:ring-purple-500 cursor-pointer"
                        />
                      </td>
                      <td className="p-3 text-center">
                        <input
                          type="checkbox"
                          checked={profile.enabledIn.includes('aggressive')}
                          onChange={() => handleToggleMode('aggressive')}
                          className="rounded border-gray-700 text-purple-600 focus:ring-purple-500 cursor-pointer"
                        />
                      </td>
                      <td className="p-3 text-right">
                        <input
                          type="number"
                          step={0.1}
                          value={profile.adjust?.minRRDelta ?? 0}
                          onChange={(e) =>
                            handleHabitatChange(hab, {
                              adjust: {
                                ...profile.adjust,
                                minRRDelta: parseFloat(e.target.value) || 0,
                              },
                            })
                          }
                          className="w-16 bg-[#0E1117] border border-[#30363D] rounded p-1 text-right text-xs text-purple-300 font-bold"
                        />
                      </td>
                      <td className="p-3 text-right">
                        <input
                          type="number"
                          step={0.05}
                          value={profile.adjust?.timeStopMult ?? 1}
                          onChange={(e) =>
                            handleHabitatChange(hab, {
                              adjust: {
                                ...profile.adjust,
                                timeStopMult: parseFloat(e.target.value) || 1,
                              },
                            })
                          }
                          className="w-16 bg-[#0E1117] border border-[#30363D] rounded p-1 text-right text-xs text-purple-300 font-bold"
                        />
                      </td>
                      <td className="p-3 text-right">
                        <input
                          type="number"
                          step={0.05}
                          value={profile.adjust?.riskMult ?? 1}
                          onChange={(e) =>
                            handleHabitatChange(hab, {
                              adjust: {
                                ...profile.adjust,
                                riskMult: parseFloat(e.target.value) || 1,
                              },
                            })
                          }
                          className="w-16 bg-[#0E1117] border border-[#30363D] rounded p-1 text-right text-xs text-purple-300 font-bold"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="button"
              onClick={() => {
                onUpdateSetting('liquiditySweepHabitats', HABITATS);
                onSaveDirect?.({ liquiditySweepHabitats: HABITATS });
              }}
              className="px-3 py-1.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white text-xs font-semibold flex items-center gap-1.5 border border-gray-700 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Habitats to Defaults</span>
            </button>
          </div>
        </div>
      )}

      {/* SUB-TAB 3: REGIME LABEL MAPPING EDITOR */}
      {activeSubTab === 'regimemap' && (
        <div className="space-y-4">
          <div className="border-b border-[#30363D] pb-2">
            <span className="text-sm font-bold text-gray-200">Engine Label Mapping Editor</span>
            <p className="text-xs text-gray-400 mt-0.5">
              Maps engine-emitted market regime classification labels to strategy habitats. Unmapped labels automatically default to <span className="font-mono text-amber-300">transition</span> (Standby).
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[460px] overflow-y-auto pr-1">
            {Object.entries(customRegimeMap).map(([lbl, hab]) => (
              <div key={lbl} className="flex items-center justify-between p-2.5 rounded-lg bg-gray-900 border border-gray-800">
                <span className="font-mono text-xs font-bold text-gray-200">{lbl}</span>
                <select
                  value={hab}
                  onChange={(e) => handleRegimeMapChange(lbl, e.target.value as Habitat)}
                  className="bg-[#0E1117] border border-[#30363D] rounded p-1 text-xs font-semibold text-purple-300 capitalize"
                >
                  {ALL_HABITATS.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          {/* Add custom label */}
          <div className="flex flex-col sm:flex-row items-center gap-2 p-3 bg-gray-900/60 rounded-lg border border-gray-800">
            <input
              type="text"
              placeholder="e.g. HIGH_VOLATILITY"
              value={newLabelInput}
              onChange={(e) => setNewLabelInput(e.target.value)}
              className="flex-1 bg-[#0E1117] border border-[#30363D] rounded-lg p-1.5 text-xs text-gray-200 uppercase font-mono"
            />
            <select
              value={newLabelHabitat}
              onChange={(e) => setNewLabelHabitat(e.target.value as Habitat)}
              className="bg-[#0E1117] border border-[#30363D] rounded-lg p-1.5 text-xs text-purple-300 capitalize"
            >
              {ALL_HABITATS.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleAddCustomLabel}
              className="px-3 py-1.5 rounded bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold cursor-pointer"
            >
              + Add Label
            </button>
          </div>

          <div className="flex justify-end pt-1">
            <button
              type="button"
              onClick={() => {
                onUpdateSetting('liquiditySweepRegimeMap', REGIME_MAP);
                onSaveDirect?.({ liquiditySweepRegimeMap: REGIME_MAP });
              }}
              className="px-3 py-1.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white text-xs font-semibold flex items-center gap-1.5 border border-gray-700 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Mappings to Defaults</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
