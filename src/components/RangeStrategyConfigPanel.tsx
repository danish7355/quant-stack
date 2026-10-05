import React, { useState, useMemo } from 'react';
import {
  PARAMS,
  Group,
  ParamDef,
  NumParam,
  BoolParam,
  SelParam,
  RangeConfig,
  DEFAULTS,
  PRESETS,
  applyPreset,
  validate,
  REJECT,
  RejectCode,
} from '../utils/strategies/rangeRegime/index.js';
import {
  Layers,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  Save,
  HelpCircle,
  Eye,
  EyeOff,
  Flame,
  Shield,
  Activity,
  Info
} from 'lucide-react';

interface RangeStrategyConfigPanelProps {
  currentConfig?: Partial<RangeConfig>;
  onChange: (updatedConfig: RangeConfig) => void;
  onSave?: (savedConfig: RangeConfig) => Promise<void> | void;
  disabled?: boolean;
}

const GROUPS: Group[] = [
  'Timeframes',
  'Direction',
  'Regime',
  'Range',
  'Setups',
  'Confluence',
  'Stop loss',
  'Take profit',
  'Management',
  'Risk',
];

const GROUP_ICONS: Record<Group, string> = {
  Timeframes: '⏱️',
  Direction: '🧭',
  Regime: '🌊',
  Range: '📏',
  Setups: '🎯',
  Confluence: '✨',
  'Stop loss': '🛑',
  'Take profit': '🎯',
  Management: '⚙️',
  Risk: '🛡️',
};

export const RangeStrategyConfigPanel: React.FC<RangeStrategyConfigPanelProps> = ({
  currentConfig = {},
  onChange,
  onSave,
  disabled = false,
}) => {
  const [activeGroup, setActiveGroup] = useState<Group>('Regime');
  const [showAdvanced, setShowAdvanced] = useState<boolean>(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [showRejectLegend, setShowRejectLegend] = useState<boolean>(false);

  // Merge provided config with schema defaults
  const config: RangeConfig = useMemo(() => {
    return { ...DEFAULTS, ...currentConfig };
  }, [currentConfig]);

  // Run validation
  const validationErrors = useMemo(() => {
    return validate(config);
  }, [config]);

  // Group params by their group definition
  const groupedParams = useMemo(() => {
    const map: Record<Group, ParamDef[]> = {
      Timeframes: [],
      Direction: [],
      Regime: [],
      Range: [],
      Setups: [],
      Confluence: [],
      'Stop loss': [],
      'Take profit': [],
      Management: [],
      Risk: [],
    };
    for (const p of PARAMS) {
      if (map[p.group]) {
        map[p.group].push(p);
      }
    }
    return map;
  }, []);

  const handleValueChange = (key: string, val: number | boolean | string) => {
    const updated = { ...config, [key]: val };
    onChange(updated);
  };

  const handleApplyPreset = (presetName: 'strict' | 'balanced' | 'loose') => {
    const updated = applyPreset(presetName);
    onChange(updated);
    setSaveStatus(`Applied "${presetName.toUpperCase()}" preset`);
    setTimeout(() => setSaveStatus(null), 3000);
  };

  const handleSave = async () => {
    if (disabled || isSaving) return;
    setIsSaving(true);
    setSaveStatus('Saving settings to server...');
    try {
      if (onSave) {
        await onSave(config);
      } else {
        // Direct POST to /api/bot/settings
        const res = await fetch('/api/bot/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rangeConfig: config }),
        });
        if (!res.ok) {
          throw new Error(`Server returned HTTP ${res.status}`);
        }
      }
      setSaveStatus('✓ Saved & Synced to Trading Engine');
      setTimeout(() => setSaveStatus(null), 3500);
    } catch (e: any) {
      setSaveStatus(`✗ Save error: ${e?.message || 'Network failure'}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="bg-[#0B0E14] border border-[#1E293B] rounded-2xl overflow-hidden shadow-2xl">
      {/* Header Banner */}
      <div className="p-5 border-b border-[#1E293B] bg-gradient-to-r from-[#0F172A] via-[#111827] to-[#0F172A]">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="text-2xl">🌊</span>
              <h2 className="text-lg font-bold text-gray-100 flex items-center gap-2">
                <span>RANGE REGIME V1</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-500/15 text-cyan-400 border border-cyan-500/30">
                  INSTITUTIONAL SCHEMA
                </span>
              </h2>
            </div>
            <p className="text-xs text-gray-400 mt-1 max-w-2xl leading-relaxed">
              Dual-timeframe range fade architecture (Direction TF edges + Execution TF triggers) with
              ADX/ER regime score gating, S1/S2/S3 setups, Grade A/B confluence, and fee-drag resistance.
            </p>
          </div>

          {/* Preset Buttons & Advanced Toggle */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center bg-[#1E293B]/60 p-1 rounded-xl border border-[#334155]/60">
              <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-2">
                Presets:
              </span>
              <button
                type="button"
                onClick={() => handleApplyPreset('strict')}
                className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-all border border-emerald-500/20"
                title="Strict: 70 min regime score, 3 edge touches, min confluence 3, snapback off"
              >
                Strict
              </button>
              <button
                type="button"
                onClick={() => handleApplyPreset('balanced')}
                className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-all border border-blue-500/20 ml-1"
                title="Balanced: Standard institutional defaults"
              >
                Balanced
              </button>
              <button
                type="button"
                onClick={() => handleApplyPreset('loose')}
                className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 transition-all border border-amber-500/20 ml-1"
                title="Loose: 50 min regime score, wider zones, min confluence 0 (more signals)"
              >
                Loose
              </button>
            </div>

            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl border transition-all ${
                showAdvanced
                  ? 'bg-purple-500/20 text-purple-300 border-purple-500/40'
                  : 'bg-[#1E293B] text-gray-300 border-[#334155] hover:bg-[#334155]'
              }`}
            >
              {showAdvanced ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
              <span>{showAdvanced ? 'Advanced: ON' : 'Advanced: OFF'}</span>
            </button>

            <button
              type="button"
              onClick={handleSave}
              disabled={disabled || isSaving}
              className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white shadow-lg shadow-cyan-600/30 transition-all disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{isSaving ? 'Saving...' : 'Save Settings'}</span>
            </button>
          </div>
        </div>

        {/* Feedback Bar */}
        {saveStatus && (
          <div className="mt-3 px-3 py-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-xs text-cyan-300 flex items-center justify-between">
            <span>{saveStatus}</span>
            <button
              type="button"
              onClick={() => setSaveStatus(null)}
              className="text-[10px] text-cyan-400 hover:text-white"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Live Validation Warnings */}
        {validationErrors.length > 0 && (
          <div className="mt-3 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-300 space-y-1">
            <div className="flex items-center gap-1.5 font-bold text-red-400">
              <AlertTriangle className="w-4 h-4" />
              <span>Validation Warnings ({validationErrors.length})</span>
            </div>
            <ul className="list-disc pl-5 space-y-0.5 text-[11px] text-red-200">
              {validationErrors.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Group Navigation Tabs */}
      <div className="flex items-center gap-1 px-4 py-2 bg-[#0F172A]/80 border-b border-[#1E293B] overflow-x-auto no-scrollbar">
        {GROUPS.map((grp) => {
          const isSelected = activeGroup === grp;
          const paramCount = groupedParams[grp].length;
          return (
            <button
              key={grp}
              type="button"
              onClick={() => setActiveGroup(grp)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition-all ${
                isSelected
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-[#1E293B]/60'
              }`}
            >
              <span>{GROUP_ICONS[grp]}</span>
              <span>{grp}</span>
              <span className="text-[10px] opacity-60">({paramCount})</span>
            </button>
          );
        })}
      </div>

      {/* Parameter Controls for Active Group */}
      <div className="p-5 space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-[#1E293B]/70">
          <div className="flex items-center gap-2">
            <span className="text-xl">{GROUP_ICONS[activeGroup]}</span>
            <h3 className="text-sm font-bold text-gray-200">{activeGroup} Configuration</h3>
          </div>
          <span className="text-[11px] text-gray-500">
            {groupedParams[activeGroup].filter((p) => showAdvanced || !p.advanced).length} controls visible
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {groupedParams[activeGroup]
            .filter((p) => showAdvanced || !p.advanced)
            .map((param) => {
              const currentValue = config[param.key];
              return (
                <div
                  key={param.key}
                  className="bg-[#111827]/70 border border-[#1E293B] rounded-xl p-3.5 space-y-2 hover:border-[#334155] transition-all"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <label className="text-xs font-semibold text-gray-200">{param.label}</label>
                        {param.advanced && (
                          <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-purple-500/15 text-purple-300 border border-purple-500/30">
                            ADV
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-gray-400 mt-0.5 leading-snug">{param.help}</p>
                    </div>
                  </div>

                  {/* Render based on parameter type */}
                  {param.type === 'number' && (
                    <div className="pt-1">
                      <div className="flex items-center justify-between text-xs text-gray-300 mb-1">
                        <span className="font-mono text-cyan-400 font-bold">
                          {currentValue}
                          {(param as NumParam).unit ? ` ${(param as NumParam).unit}` : ''}
                        </span>
                        <span className="text-[10px] text-gray-500 font-mono">
                          [{(param as NumParam).min} - {(param as NumParam).max}] step {(param as NumParam).step}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="range"
                          min={(param as NumParam).min}
                          max={(param as NumParam).max}
                          step={(param as NumParam).step}
                          value={Number(currentValue)}
                          onChange={(e) => handleValueChange(param.key, parseFloat(e.target.value))}
                          disabled={disabled}
                          className="flex-1 accent-cyan-400 bg-gray-700 h-1.5 rounded-lg cursor-pointer"
                        />
                        <input
                          type="number"
                          min={(param as NumParam).min}
                          max={(param as NumParam).max}
                          step={(param as NumParam).step}
                          value={Number(currentValue)}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            if (!isNaN(val)) handleValueChange(param.key, val);
                          }}
                          disabled={disabled}
                          className="w-18 bg-[#0B0E14] border border-[#334155] rounded-lg px-2 py-1 text-xs text-right font-mono text-cyan-300 focus:outline-none focus:border-cyan-400"
                        />
                      </div>
                    </div>
                  )}

                  {param.type === 'boolean' && (
                    <div className="pt-1 flex items-center justify-between">
                      <span className="text-[11px] text-gray-400">
                        {Boolean(currentValue) ? 'Enabled' : 'Disabled'}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleValueChange(param.key, !currentValue)}
                        disabled={disabled}
                        className={`relative inline-flex h-5 w-10 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                          Boolean(currentValue) ? 'bg-cyan-500' : 'bg-gray-700'
                        }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                            Boolean(currentValue) ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>
                  )}

                  {param.type === 'select' && (
                    <div className="pt-1">
                      <select
                        value={String(currentValue)}
                        onChange={(e) => handleValueChange(param.key, e.target.value)}
                        disabled={disabled}
                        className="w-full bg-[#0B0E14] border border-[#334155] rounded-lg px-2.5 py-1.5 text-xs text-gray-200 font-mono focus:outline-none focus:border-cyan-400"
                      >
                        {(param as SelParam).options.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      </div>

      {/* Reject Codes Diagnostic Accordion */}
      <div className="border-t border-[#1E293B] bg-[#0A0D13] p-4">
        <button
          type="button"
          onClick={() => setShowRejectLegend(!showRejectLegend)}
          className="flex items-center justify-between w-full text-xs font-semibold text-gray-400 hover:text-gray-200 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Info className="w-3.5 h-3.5 text-cyan-400" />
            <span>Diagnostics: 18 Strategy Reject Codes & Gate Descriptions</span>
          </div>
          <span className="text-[10px] text-cyan-400 font-mono">
            {showRejectLegend ? 'Hide' : 'Show'}
          </span>
        </button>

        {showRejectLegend && (
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 pt-2 border-t border-[#1E293B]">
            {REJECT.map((code) => (
              <div
                key={code}
                className="bg-[#111827] border border-[#1E293B] rounded-lg p-2 text-center"
              >
                <div className="text-[10px] font-mono font-bold text-amber-300 break-all">
                  {code}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default RangeStrategyConfigPanel;
