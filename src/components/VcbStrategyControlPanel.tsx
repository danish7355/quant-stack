import React, { useState, useMemo } from 'react';
import {
  VcbParams,
  VCB_DEFAULTS,
  VCB_PRESETS,
  VCB_UI,
  PresetName,
  applyPreset,
  validateVcb,
  roundTripFeePct,
  feeToRiskRatio,
  netRR,
  Group,
  ParamUi
} from '../utils/strategies/vcb.config';
import { AppSettings } from '../types';
import {
  Zap,
  Sliders,
  AlertTriangle,
  CheckCircle2,
  DollarSign,
  ShieldAlert,
  Percent,
  Layers,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Sparkles,
  Info
} from 'lucide-react';

interface Props {
  settings: AppSettings;
  onUpdateSettings?: (newSettings: AppSettings) => void;
  onActivateStrategy?: () => void;
  isActive?: boolean;
}

export const VcbStrategyControlPanel: React.FC<Props> = ({
  settings,
  onUpdateSettings,
  onActivateStrategy,
  isActive = false
}) => {
  // Local or saved params
  const [params, setParams] = useState<VcbParams>(() => {
    return (settings.vcbParams as VcbParams) || VCB_DEFAULTS;
  });

  const [activeGroup, setActiveGroup] = useState<Group>('Timeframes & Direction');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  // Group definitions
  const groups: Group[] = [
    'Timeframes & Direction',
    'Regime',
    'Setup (Coil)',
    'Trigger & Entry',
    'Stop Loss',
    'Take Profit',
    'Fees & Gates',
    'Signal Flow'
  ];

  // Validation messages
  const validationErrors = useMemo(() => validateVcb(params), [params]);

  // Fee math calculations
  const rtFee = useMemo(() => roundTripFeePct(params), [params]);
  const exampleStop = 0.8; // 0.8% stop distance example
  const feeRiskShare = useMemo(() => feeToRiskRatio(exampleStop, params) * 100, [params]);
  const sampleNetRr = useMemo(() => netRR(2.0, 1.0, params), [params]);

  const handleParamChange = <K extends keyof VcbParams>(key: K, value: VcbParams[K]) => {
    const updated = { ...params, [key]: value };
    setParams(updated);
  };

  const handleApplyPreset = (presetName: PresetName) => {
    const updated = applyPreset(presetName);
    setParams(updated);
    commitChanges(updated);
  };

  const handleResetDefaults = () => {
    setParams(VCB_DEFAULTS);
    commitChanges(VCB_DEFAULTS);
  };

  const commitChanges = (newParams: VcbParams) => {
    const updatedSettings: AppSettings = {
      ...settings,
      vcbParams: newParams
    };
    if (onUpdateSettings) {
      onUpdateSettings(updatedSettings);
    }
    fetch('/api/bot/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vcbParams: newParams })
    }).catch(() => {});

    setSaveStatus('Settings Saved');
    setTimeout(() => setSaveStatus(null), 2500);
  };

  // Grouped params
  const currentGroupParams = useMemo(() => {
    const entries = Object.entries(VCB_UI) as [keyof VcbParams, ParamUi][];
    return entries.filter(([_, ui]) => {
      if (ui.group !== activeGroup) return false;
      if (ui.advanced && !showAdvanced) return false;
      return true;
    });
  }, [activeGroup, showAdvanced]);

  return (
    <div className="bg-[#161B22] border border-[#30363D] rounded-2xl p-5 shadow-2xl relative overflow-hidden">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-4 border-b border-[#30363D]">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-950 text-purple-300 border border-purple-800 uppercase tracking-widest flex items-center gap-1">
              <Zap size={12} className="text-purple-400" /> Volatility Compression Breakout
            </span>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-950 text-cyan-300 border border-cyan-800 uppercase tracking-wider">
              VCB Intraday Engine
            </span>
            {isActive && (
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-800 flex items-center gap-1">
                <CheckCircle2 size={11} /> Armed & Active
              </span>
            )}
          </div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-white flex items-center gap-2">
            VCB Strategy Single Source of Truth
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Configures coil detection, direction policies, trigger validation, and fee-drag gates.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {onActivateStrategy && (
            <button
              onClick={onActivateStrategy}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-md ${
                isActive
                  ? 'bg-emerald-600/30 text-emerald-300 border border-emerald-500/50 hover:bg-emerald-600/40'
                  : 'bg-purple-600 hover:bg-purple-500 text-white'
              }`}
            >
              <Zap size={13} /> {isActive ? 'Strategy Active in Portfolio' : 'Activate VCB in Portfolio'}
            </button>
          )}

          <button
            onClick={() => commitChanges(params)}
            className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-bold transition cursor-pointer shadow-md flex items-center gap-1.5"
          >
            <span>Save Configuration</span>
          </button>

          {saveStatus && (
            <span className="text-[11px] font-bold text-emerald-400 bg-emerald-950 border border-emerald-500/30 px-2 py-1 rounded font-mono">
              ✔ {saveStatus}
            </span>
          )}
        </div>
      </div>

      {/* Preset Selector & Fee Math Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 my-4">
        {/* Preset Selector */}
        <div className="bg-[#0E1117] border border-[#30363D] rounded-xl p-3">
          <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider block mb-2">
            Preset Selection
          </span>
          <div className="grid grid-cols-3 gap-1.5">
            {(['AGGRESSIVE', 'BALANCED', 'STRICT'] as PresetName[]).map(pName => (
              <button
                key={pName}
                onClick={() => handleApplyPreset(pName)}
                className="px-2 py-1.5 rounded bg-[#161B22] hover:bg-purple-950/60 hover:text-purple-300 hover:border-purple-700 border border-[#30363D] text-[11px] font-bold text-gray-300 transition cursor-pointer text-center"
              >
                {pName}
              </button>
            ))}
          </div>
          <button
            onClick={handleResetDefaults}
            className="mt-2 text-[10px] text-gray-400 hover:text-gray-200 flex items-center gap-1 cursor-pointer transition"
          >
            <RotateCcw size={11} /> Reset to VCB Defaults
          </button>
        </div>

        {/* Live Fee Math Preview */}
        <div className="bg-[#0E1117] border border-[#30363D] rounded-xl p-3">
          <span className="text-[10px] uppercase font-bold text-cyan-400 tracking-wider block mb-1 flex items-center gap-1">
            <DollarSign size={12} /> Fee Math & Drag Gate
          </span>
          <div className="grid grid-cols-3 gap-2 mt-2">
            <div>
              <span className="text-[10px] text-gray-400 block">Round-Trip Fee</span>
              <span className="text-xs font-mono font-bold text-white">{rtFee.toFixed(3)}%</span>
            </div>
            <div>
              <span className="text-[10px] text-gray-400 block">Fee / 0.8% Risk</span>
              <span className={`text-xs font-mono font-bold ${feeRiskShare > 20 ? 'text-amber-400' : 'text-emerald-400'}`}>
                {feeRiskShare.toFixed(1)}%
              </span>
            </div>
            <div>
              <span className="text-[10px] text-gray-400 block">Net RR (1:2 R:R)</span>
              <span className="text-xs font-mono font-bold text-purple-300">{sampleNetRr.toFixed(2)}R</span>
            </div>
          </div>
          <span className="text-[9px] text-gray-400 block mt-2">
            Max allowed fee/risk: <b>{(params.maxFeeToRiskRatio * 100).toFixed(0)}%</b> (Taker {params.takerFeePct}% + GST {params.gstOnFeePct}%)
          </span>
        </div>

        {/* Strategy Validation Status */}
        <div className="bg-[#0E1117] border border-[#30363D] rounded-xl p-3">
          <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider block mb-1">
            Configuration Integrity
          </span>
          {validationErrors.length === 0 ? (
            <div className="flex items-center gap-2 mt-2 text-emerald-400">
              <CheckCircle2 size={16} />
              <span className="text-xs font-semibold">All parameters mathematically valid</span>
            </div>
          ) : (
            <div className="space-y-1 mt-1 max-h-20 overflow-y-auto">
              {validationErrors.map((err, idx) => (
                <div key={idx} className="text-[11px] text-rose-400 flex items-start gap-1 font-mono">
                  <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                  <span>{err}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Group Navigation Tabs */}
      <div className="flex items-center justify-between border-b border-[#30363D] pb-2 mb-4 overflow-x-auto gap-1">
        <div className="flex items-center gap-1">
          {groups.map(g => (
            <button
              key={g}
              onClick={() => setActiveGroup(g)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                activeGroup === g
                  ? 'bg-purple-600 text-white shadow'
                  : 'bg-[#0E1117] text-gray-400 hover:text-gray-200 border border-[#30363D]'
              }`}
            >
              {g}
            </button>
          ))}
        </div>

        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="text-xs text-gray-400 hover:text-gray-200 flex items-center gap-1 px-2 py-1 rounded bg-[#0E1117] border border-[#30363D] shrink-0 cursor-pointer transition ml-2"
        >
          <Sliders size={12} />
          <span>{showAdvanced ? 'Hide Advanced' : 'Show Advanced'}</span>
        </button>
      </div>

      {/* Parameters Form for Active Group */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {currentGroupParams.map(([key, ui]) => {
          const val = params[key];

          return (
            <div key={key} className="bg-[#0E1117] border border-[#30363D] rounded-xl p-3 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-gray-200 flex items-center gap-1">
                    {ui.label}
                    {ui.advanced && (
                      <span className="text-[9px] px-1 rounded bg-gray-800 text-gray-400 font-mono">ADV</span>
                    )}
                  </label>
                  {'unit' in ui && ui.unit && (
                    <span className="text-[10px] text-cyan-400 font-mono">{ui.unit}</span>
                  )}
                </div>
                <p className="text-[10px] text-gray-400 mb-2 leading-tight">{ui.help}</p>
              </div>

              {/* Dynamic Field Renderer */}
              <div className="mt-2">
                {ui.kind === 'number' && (
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={ui.min}
                      max={ui.max}
                      step={ui.step}
                      value={val as number}
                      onChange={e => handleParamChange(key, parseFloat(e.target.value) || 0)}
                      className="w-full bg-[#161B22] border border-[#30363D] rounded-lg px-2.5 py-1 text-xs text-white font-mono focus:border-purple-500 focus:outline-none"
                    />
                    <input
                      type="range"
                      min={ui.min}
                      max={ui.max}
                      step={ui.step}
                      value={val as number}
                      onChange={e => handleParamChange(key, parseFloat(e.target.value) || 0)}
                      className="w-24 accent-purple-500 hidden sm:block"
                    />
                  </div>
                )}

                {ui.kind === 'select' && (
                  <select
                    value={val as string}
                    onChange={e => handleParamChange(key, e.target.value as any)}
                    className="w-full bg-[#161B22] border border-[#30363D] rounded-lg px-2.5 py-1 text-xs text-white font-mono focus:border-purple-500 focus:outline-none"
                  >
                    {ui.options.map(opt => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                )}

                {ui.kind === 'toggle' && (
                  <button
                    onClick={() => handleParamChange(key, !val as any)}
                    className={`w-full py-1.5 px-3 rounded-lg text-xs font-bold border transition cursor-pointer flex items-center justify-between ${
                      val
                        ? 'bg-purple-950/60 text-purple-300 border-purple-600'
                        : 'bg-[#161B22] text-gray-400 border-[#30363D]'
                    }`}
                  >
                    <span>{val ? 'ENABLED' : 'DISABLED'}</span>
                    <span className={`h-2 w-2 rounded-full ${val ? 'bg-purple-400' : 'bg-gray-600'}`} />
                  </button>
                )}

                {ui.kind === 'multi' && (
                  <div className="flex flex-wrap gap-1">
                    {ui.options.map(opt => {
                      const list = (val as string[]) || [];
                      const isSelected = list.includes(opt);
                      return (
                        <button
                          key={opt}
                          onClick={() => {
                            const next = isSelected
                              ? list.filter(item => item !== opt)
                              : [...list, opt];
                            handleParamChange(key, next as any);
                          }}
                          className={`text-[10px] font-bold px-2 py-0.5 rounded border transition cursor-pointer ${
                            isSelected
                              ? 'bg-purple-950 text-purple-200 border-purple-600'
                              : 'bg-[#161B22] text-gray-500 border-[#30363D]'
                          }`}
                        >
                          {opt}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
