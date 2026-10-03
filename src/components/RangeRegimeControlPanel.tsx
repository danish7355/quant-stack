import React, { useState, useMemo } from 'react';
import {
  PARAMS,
  DEFAULTS,
  PRESETS,
  GROUPS,
  Group,
  ParamDef,
  RangeConfig,
  applyPreset,
  validate
} from '../utils/strategies/rangeRegime.config';
import { generateRangeRegimePineScript } from '../utils/strategies/rangeRegimeStrategy';
import { AppSettings } from '../types';
import {
  Sliders,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  Layers,
  Code,
  Copy,
  Check,
  Percent,
  Compass,
  Activity,
  Maximize2,
  ShieldAlert,
  Info
} from 'lucide-react';

interface Props {
  settings: AppSettings;
  onUpdateSettings?: (newSettings: AppSettings) => void;
  onActivateStrategy?: () => void;
  isActive?: boolean;
}

export const RangeRegimeControlPanel: React.FC<Props> = ({
  settings,
  onUpdateSettings,
  onActivateStrategy,
  isActive = false
}) => {
  const [config, setConfig] = useState<RangeConfig>(() => {
    return (settings as any).rangeRegimeParams || DEFAULTS;
  });

  const [activeGroup, setActiveGroup] = useState<Group>('Timeframes');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [copiedPine, setCopiedPine] = useState(false);
  const [showPineModal, setShowPineModal] = useState(false);

  // Real-time validation
  const validationErrors = useMemo(() => validate(config), [config]);
  const isValid = validationErrors.length === 0;

  // Filter params for current group
  const groupParams = useMemo(() => {
    return PARAMS.filter(p => {
      if (p.group !== activeGroup) return false;
      if (!showAdvanced && p.advanced) return false;
      return true;
    });
  }, [activeGroup, showAdvanced]);

  const handleChange = (key: string, value: number | boolean | string) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  };

  const handleApplyPreset = (name: 'strict' | 'balanced' | 'loose') => {
    const updated = applyPreset(name);
    setConfig(updated);
    setSaveStatus(`Applied ${name.toUpperCase()} preset`);
    setTimeout(() => setSaveStatus(null), 3000);
  };

  const handleResetDefaults = () => {
    setConfig({ ...DEFAULTS });
    setSaveStatus('Reset to defaults');
    setTimeout(() => setSaveStatus(null), 3000);
  };

  const handleSave = () => {
    const errs = validate(config);
    if (errs.length > 0) {
      setSaveStatus(`Cannot save: ${errs[0]}`);
      return;
    }

    if (onUpdateSettings) {
      const updated: AppSettings = {
        ...settings,
        rangeRegimeParams: config
      } as any;
      onUpdateSettings(updated);
      fetch('/api/bot/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rangeRegimeParams: config })
      }).catch(() => {});
      setSaveStatus('Configuration saved successfully');
      setTimeout(() => setSaveStatus(null), 3000);
    }
  };

  const handleCopyPine = () => {
    const script = generateRangeRegimePineScript(config);
    navigator.clipboard.writeText(script);
    setCopiedPine(true);
    setTimeout(() => setCopiedPine(false), 2000);
  };

  return (
    <div className="bg-[#161B22] border border-[#30363D] rounded-xl overflow-hidden shadow-xl text-gray-200">
      {/* Header Banner */}
      <div className="p-4 bg-gradient-to-r from-cyan-950/40 via-[#161B22] to-indigo-950/30 border-b border-[#30363D] flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
            <Compass size={24} />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-bold text-base text-white">RANGE_REGIME_V1 Engine</h3>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-500/40 font-bold uppercase">
                Institutional Range Fades
              </span>
              {isActive ? (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-500/40 flex items-center gap-1">
                  <CheckCircle2 size={11} /> ACTIVE STRATEGY
                </span>
              ) : (
                onActivateStrategy && (
                  <button
                    onClick={onActivateStrategy}
                    className="text-[10px] font-bold px-2.5 py-0.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white transition cursor-pointer"
                  >
                    Set as Active
                  </button>
                )
              )}
            </div>
            <p className="text-xs text-gray-400 mt-0.5">
              ADX trend veto, Kaufman Efficiency Ratio, Swing pivot boundaries, S1 rejection, S2 sweep &amp; S3 snap-back.
            </p>
          </div>
        </div>

        {/* Quick Presets & Pine Export */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 bg-[#0E1117] p-1 rounded-lg border border-[#30363D] text-xs">
            <span className="text-[10px] uppercase font-bold text-gray-400 px-2 flex items-center gap-1">
              <Sparkles size={11} className="text-amber-400" /> Presets:
            </span>
            <button
              onClick={() => handleApplyPreset('strict')}
              className="px-2 py-1 rounded hover:bg-gray-800 text-[11px] font-medium transition cursor-pointer"
              title="Higher quality, lower frequency (Grade A only)"
            >
              Strict
            </button>
            <button
              onClick={() => handleApplyPreset('balanced')}
              className="px-2 py-1 rounded bg-indigo-950/80 text-indigo-300 border border-indigo-500/30 text-[11px] font-bold transition cursor-pointer"
              title="Recommended balance of frequency and quality"
            >
              Balanced
            </button>
            <button
              onClick={() => handleApplyPreset('loose')}
              className="px-2 py-1 rounded hover:bg-gray-800 text-[11px] font-medium transition cursor-pointer"
              title="More frequent signals across wider range tolerances"
            >
              Loose
            </button>
          </div>

          <button
            onClick={() => setShowPineModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0E1117] border border-[#30363D] hover:border-gray-600 text-xs font-semibold text-gray-200 transition cursor-pointer"
          >
            <Code size={13} className="text-emerald-400" />
            <span>Pine Script v6</span>
          </button>
        </div>
      </div>

      {/* Validation Banner if errors */}
      {!isValid && (
        <div className="p-3 bg-rose-950/50 border-b border-rose-500/30 flex items-start gap-2.5 text-xs text-rose-300">
          <AlertTriangle size={15} className="shrink-0 mt-0.5 text-rose-400" />
          <div>
            <span className="font-bold">Validation Warnings: </span>
            <span>{validationErrors.join(' • ')}</span>
          </div>
        </div>
      )}

      {/* Group Navigation Tabs */}
      <div className="flex items-center justify-between border-b border-[#30363D] bg-[#0E1117] px-4 overflow-x-auto scrollbar-thin">
        <div className="flex items-center gap-1 py-1.5">
          {GROUPS.map(g => (
            <button
              key={g}
              onClick={() => setActiveGroup(g)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                activeGroup === g
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/60'
              }`}
            >
              {g}
            </button>
          ))}
        </div>

        {/* Advanced Toggle */}
        <div className="flex items-center gap-2 shrink-0 py-1.5 pl-3 border-l border-[#30363D]">
          <label className="flex items-center gap-1.5 text-xs text-gray-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showAdvanced}
              onChange={e => setShowAdvanced(e.target.checked)}
              className="rounded bg-gray-900 border-gray-700 text-cyan-500 focus:ring-0 cursor-pointer"
            />
            <span className="text-[11px] font-semibold">Advanced</span>
          </label>
        </div>
      </div>

      {/* Group Parameter Controls */}
      <div className="p-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {groupParams.map(p => {
            const val = config[p.key];

            return (
              <div
                key={p.key}
                className="p-3.5 rounded-xl bg-[#0E1117] border border-[#30363D] hover:border-gray-700 transition flex flex-col justify-between"
              >
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <div>
                    <label className="text-xs font-bold text-white flex items-center gap-1.5">
                      {p.label}
                      {p.advanced && (
                        <span className="text-[9px] px-1 py-0.2 rounded bg-gray-800 text-gray-400 font-mono">
                          ADV
                        </span>
                      )}
                    </label>
                    <p className="text-[11px] text-gray-400 mt-0.5 leading-snug">{p.help}</p>
                  </div>

                  {/* Render value display */}
                  <div className="shrink-0 text-right">
                    <span className="text-xs font-mono font-bold text-cyan-300">
                      {typeof val === 'boolean'
                        ? (val ? 'ON' : 'OFF')
                        : val}
                      {p.type === 'number' && p.unit ? ` ${p.unit}` : ''}
                    </span>
                  </div>
                </div>

                {/* Input control */}
                <div className="mt-2 pt-2 border-t border-[#30363D]/60">
                  {p.type === 'number' && (
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min={p.min}
                        max={p.max}
                        step={p.step}
                        value={Number(val) || p.default}
                        onChange={e => handleChange(p.key, parseFloat(e.target.value))}
                        className="w-full accent-cyan-400 bg-gray-800 h-1.5 rounded-lg cursor-pointer"
                      />
                      <input
                        type="number"
                        min={p.min}
                        max={p.max}
                        step={p.step}
                        value={val !== undefined ? val : p.default}
                        onChange={e => handleChange(p.key, parseFloat(e.target.value))}
                        className="w-20 px-2 py-1 rounded bg-[#161B22] border border-[#30363D] text-xs font-mono text-right text-white focus:outline-none focus:border-cyan-500"
                      />
                    </div>
                  )}

                  {p.type === 'boolean' && (
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-gray-400">Toggle Feature</span>
                      <button
                        type="button"
                        onClick={() => handleChange(p.key, !val)}
                        className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                          val ? 'bg-cyan-500' : 'bg-gray-800'
                        }`}
                        role="switch"
                        aria-checked={Boolean(val)}
                      >
                        <span
                          className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                            val ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>
                  )}

                  {p.type === 'select' && (
                    <select
                      value={String(val || p.default)}
                      onChange={e => handleChange(p.key, e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded bg-[#161B22] border border-[#30363D] text-xs font-medium text-white focus:outline-none focus:border-cyan-500 cursor-pointer"
                    >
                      {p.options.map(opt => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer Actions */}
        <div className="mt-6 pt-4 border-t border-[#30363D] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={handleResetDefaults}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-xs font-medium text-gray-300 transition cursor-pointer"
            >
              <RotateCcw size={13} />
              <span>Reset Defaults</span>
            </button>
            {saveStatus && (
              <span className={`text-xs font-semibold ${saveStatus.includes('Cannot') ? 'text-rose-400' : 'text-emerald-400'}`}>
                {saveStatus}
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={!isValid}
              className={`flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold transition shadow-lg cursor-pointer ${
                isValid
                  ? 'bg-cyan-500 hover:bg-cyan-400 text-black shadow-cyan-500/20'
                  : 'bg-gray-800 text-gray-500 cursor-not-allowed'
              }`}
            >
              <Check size={14} />
              <span>Save Range Parameters</span>
            </button>
          </div>
        </div>
      </div>

      {/* Pine Script Modal */}
      {showPineModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-[#161B22] border border-[#30363D] rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh]">
            <div className="p-4 border-b border-[#30363D] flex items-center justify-between bg-[#0E1117]">
              <div className="flex items-center gap-2">
                <Code size={18} className="text-emerald-400" />
                <h4 className="font-bold text-sm text-white">TradingView Pine Script v6 (Range Regime V1)</h4>
              </div>
              <button
                onClick={() => setShowPineModal(false)}
                className="text-gray-400 hover:text-white text-xs px-2 py-1 rounded bg-gray-800"
              >
                Close
              </button>
            </div>
            <div className="p-4 flex-1 overflow-auto bg-[#0A0D12] font-mono text-xs text-gray-300">
              <pre className="whitespace-pre-wrap">{generateRangeRegimePineScript(config)}</pre>
            </div>
            <div className="p-3 border-t border-[#30363D] bg-[#0E1117] flex justify-between items-center">
              <span className="text-[11px] text-gray-400">Copy and paste into TradingView Pine Editor</span>
              <button
                onClick={handleCopyPine}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition"
              >
                {copiedPine ? <Check size={14} /> : <Copy size={14} />}
                <span>{copiedPine ? 'Copied to Clipboard!' : 'Copy Script'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
