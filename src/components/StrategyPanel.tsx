import React, { useState } from 'react';
import { AppSettings, StrategyBucketItem, TradableRegimeType } from '../types';
import { GATES_REGISTRY, GateImportance } from '../utils/gatesRegistry';
import { DEFAULT_STRATEGY_BUCKET } from '../utils/strategyBucket';
import { ShieldAlert, ShieldCheck, Zap, AlertTriangle, Flame, Info, Check, Cpu, Sparkles, RotateCcw, Layers, ArrowUpRight, Filter } from 'lucide-react';

interface StrategyPanelProps {
  settings: AppSettings;
  setSettings: (s: AppSettings) => void;
}

const ALL_REGIMES: { key: TradableRegimeType; label: string; desc: string; color: string; badgeBg: string }[] = [
  { key: 'trending', label: 'Trending', desc: 'Directional EMA stack & ADX > 20', color: 'text-blue-400', badgeBg: 'bg-blue-500/10 border-blue-500/30 text-blue-300' },
  { key: 'ranging', label: 'Ranging', desc: 'Mean reversion, oscillating near 200 SMA', color: 'text-emerald-400', badgeBg: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' },
  { key: 'exhaustion', label: 'Exhaustion', desc: 'Climax capitulation > 1.8x ATR, delta divergence', color: 'text-amber-400', badgeBg: 'bg-amber-500/10 border-amber-500/30 text-amber-300' },
  { key: 'breakout', label: 'Breakout', desc: 'Volatility compression & Darvas box release', color: 'text-purple-400', badgeBg: 'bg-purple-500/10 border-purple-500/30 text-purple-300' }
];

const StrategyPanel: React.FC<StrategyPanelProps> = ({ settings, setSettings }) => {
  const [expandedGateId, setExpandedGateId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'bucket' | 'parameters' | 'gates'>('bucket');

  const bucket: StrategyBucketItem[] = (settings.strategyBucket && settings.strategyBucket.length > 0)
    ? settings.strategyBucket
    : DEFAULT_STRATEGY_BUCKET;

  const handleInputChange = (field: keyof AppSettings, value: any) => {
    const nextSettings = { ...settings, [field]: value };
    if (field === 'activeStrategy' && value === 'DELTA_CLIMAX') {
      nextSettings.crEnabled = true;
    }
    setSettings(nextSettings);

    // Direct immediate dispatch to backend 24/7 engine
    fetch('/api/bot/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(nextSettings)
    }).then(() => {
      setSaveStatus(field === 'activeStrategy' ? `Strategy set to ${value}` : 'Settings updated');
      setTimeout(() => setSaveStatus(null), 2500);
    }).catch(console.error);
  };

  const handleUpdateBucket = (newBucket: StrategyBucketItem[]) => {
    handleInputChange('strategyBucket', newBucket);
  };

  const handleToggleBucketStrategy = (id: string) => {
    const updated = bucket.map(item => item.id === id ? { ...item, enabled: !item.enabled } : item);
    handleUpdateBucket(updated);
  };

  const handleToggleRegimeForStrategy = (id: string, regime: TradableRegimeType) => {
    const updated = bucket.map(item => {
      if (item.id !== id) return item;
      const exists = item.regimes.includes(regime);
      const newRegimes = exists 
        ? item.regimes.filter(r => r !== regime)
        : [...item.regimes, regime];
      return { ...item, regimes: newRegimes };
    });
    handleUpdateBucket(updated);
  };

  const handleChangePriority = (id: string, priority: number) => {
    const updated = bucket.map(item => item.id === id ? { ...item, priority } : item);
    handleUpdateBucket(updated);
  };

  const handleResetBucket = () => {
    handleUpdateBucket(DEFAULT_STRATEGY_BUCKET);
    setSaveStatus('Strategy bucket reset to defaults');
    setTimeout(() => setSaveStatus(null), 2500);
  };

  const handleToggleGate = (gateId: string) => {
    const currentDisabled = { ...(settings.disabledGates || {}) };
    if (currentDisabled[gateId]) {
      delete currentDisabled[gateId];
    } else {
      currentDisabled[gateId] = true;
    }
    const nextSettings = {
      ...settings,
      disabledGates: currentDisabled,
    };
    setSettings(nextSettings);
    fetch('/api/bot/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(nextSettings)
    }).catch(console.error);
  };

  const strategyGates = GATES_REGISTRY.filter(
    (g) => settings.activeStrategy === 'AUTO_REGIME' || g.strategy === settings.activeStrategy || g.strategy === 'RISK_ENGINE'
  );

  const getImportanceBadge = (importance: GateImportance, score: number) => {
    switch (importance) {
      case 'CRITICAL':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-500/20 text-rose-400 border border-rose-500/40 text-[10px] font-bold uppercase tracking-wider">
            <Flame className="w-3 h-3 text-rose-400" /> CRITICAL ({score}%)
          </span>
        );
      case 'HIGH':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/40 text-[10px] font-bold uppercase tracking-wider">
            <AlertTriangle className="w-3 h-3 text-amber-400" /> HIGH ({score}%)
          </span>
        );
      case 'MEDIUM':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-400 border border-cyan-500/40 text-[10px] font-bold uppercase tracking-wider">
            <Info className="w-3 h-3 text-cyan-400" /> MEDIUM ({score}%)
          </span>
        );
      case 'LOW':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-gray-700/50 text-gray-300 border border-gray-600 text-[10px] font-semibold uppercase tracking-wider">
            OPTIONAL ({score}%)
          </span>
        );
    }
  };

  const InputRow = ({ label, desc, value, onChange, type = "number", min, max, step }: any) => (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between py-3 border-b border-gray-800/50 gap-4">
      <div className="flex flex-col">
        <span className="text-sm font-medium text-gray-200">{label}</span>
        {desc && <span className="text-xs text-gray-500 mt-1">{desc}</span>}
      </div>
      <input
        type={type}
        value={value}
        onChange={e => onChange(type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value)}
        className="w-full sm:w-24 bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-sm text-right text-gray-200 focus:outline-none focus:border-[#00e696]"
        min={min} max={max} step={step}
      />
    </div>
  );

  return (
    <div className="h-full overflow-y-auto custom-scrollbar p-6 space-y-8 pb-32 font-mono text-xs">
      <div className="max-w-4xl mx-auto space-y-8">
        
        {/* Navigation Tabs */}
        <div className="flex items-center justify-between border-b border-[#30363D] pb-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('bucket')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeTab === 'bucket' 
                  ? 'bg-purple-600 text-white shadow-lg shadow-purple-900/30' 
                  : 'bg-[#161B22] text-gray-400 hover:text-white border border-[#30363D]'
              }`}
            >
              <Layers className="w-3.5 h-3.5" /> Strategy Bucket & Regimes
            </button>
            <button
              onClick={() => setActiveTab('parameters')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeTab === 'parameters' 
                  ? 'bg-[#00e696] text-black font-semibold' 
                  : 'bg-[#161B22] text-gray-400 hover:text-white border border-[#30363D]'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" /> Indicator Parameters
            </button>
            <button
              onClick={() => setActiveTab('gates')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeTab === 'gates' 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-[#161B22] text-gray-400 hover:text-white border border-[#30363D]'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" /> Gate Management ({strategyGates.length})
            </button>
          </div>
          {saveStatus && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#00e696]/20 border border-[#00e696]/40 text-[#00e696] text-xs font-semibold animate-pulse">
              <Check className="w-3.5 h-3.5" /> {saveStatus}
            </span>
          )}
        </div>

        {/* TAB 1: STRATEGY BUCKET & REGIME FILTER */}
        {activeTab === 'bucket' && (
          <div className="space-y-6">
            
            {/* Auto-Regime Banner / Selector */}
            <div className={`rounded-xl p-5 border transition-all ${
              settings.activeStrategy === 'AUTO_REGIME'
                ? 'bg-purple-950/30 border-purple-500/60 shadow-xl shadow-purple-950/20'
                : 'bg-[#161B22] border-[#30363D]'
            }`}>
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-start gap-3.5">
                  <div className={`p-2.5 rounded-lg shrink-0 ${
                    settings.activeStrategy === 'AUTO_REGIME' ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30' : 'bg-gray-800 text-gray-400'
                  }`}>
                    <Cpu className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-bold text-white">Auto-Select by Market Regime</h3>
                      <span className="px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 text-[10px] font-bold tracking-wider">
                        CURATED BUCKET ROUTER
                      </span>
                    </div>
                    <p className="text-xs text-gray-300 mt-1 leading-relaxed max-w-2xl">
                      The bot strictly restricts execution to the enabled strategies in your bucket below. When a market regime occurs (Trending, Ranging, Exhaustion, or Breakout), only strategies assigned to that regime are evaluated, prioritized by your rank.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-center">
                  {settings.activeStrategy === 'AUTO_REGIME' ? (
                    <span className="px-3.5 py-1.5 rounded-lg bg-purple-600 text-white font-bold text-xs border border-purple-400 flex items-center gap-1.5 shadow-lg shadow-purple-600/30">
                      <Check className="w-3.5 h-3.5" /> BUCKET ACTIVE
                    </span>
                  ) : (
                    <button
                      onClick={() => handleInputChange('activeStrategy', 'AUTO_REGIME')}
                      className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs cursor-pointer transition-colors flex items-center gap-1.5 shadow-lg shadow-purple-900/40"
                    >
                      <Cpu className="w-3.5 h-3.5" /> ENABLE AUTO BUCKET
                    </button>
                  )}
                </div>
              </div>

              {settings.activeStrategy !== 'AUTO_REGIME' && (
                <div className="mt-4 pt-3 border-t border-gray-800 flex items-center justify-between text-xs text-amber-400">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>Bot currently locked to single manual strategy: <strong>{settings.activeStrategy}</strong></span>
                  </div>
                  <button
                    onClick={() => handleInputChange('activeStrategy', 'AUTO_REGIME')}
                    className="text-purple-400 hover:text-purple-300 underline font-semibold text-xs ml-2 cursor-pointer"
                  >
                    Switch back to Curated Bucket Router
                  </button>
                </div>
              )}
            </div>

            {/* Regime Mapping Overview Matrix */}
            <div className="bg-[#161B22] rounded-xl p-5 border border-[#30363D] space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Filter className="w-4 h-4 text-purple-400" />
                  <h4 className="text-sm font-bold text-white">Live Regime Routing Matrix</h4>
                </div>
                <span className="text-[11px] text-gray-400">Strategies permitted per regime</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
                {ALL_REGIMES.map(regime => {
                  const eligible = bucket
                    .filter(s => s.enabled && s.regimes.includes(regime.key))
                    .sort((a, b) => a.priority - b.priority);

                  return (
                    <div key={regime.key} className="bg-gray-900/80 rounded-lg p-3 border border-gray-800 flex flex-col justify-between">
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className={`font-bold text-xs ${regime.color}`}>{regime.label}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-400">
                            {eligible.length} active
                          </span>
                        </div>
                        <p className="text-[10px] text-gray-500 mb-2 leading-tight">{regime.desc}</p>
                      </div>

                      <div className="space-y-1 mt-2 pt-2 border-t border-gray-800/80">
                        {eligible.length > 0 ? (
                          eligible.map(s => (
                            <div key={s.id} className="flex items-center justify-between text-[11px] text-gray-300">
                              <span className="truncate pr-1">• {s.name}</span>
                              <span className="text-[9px] px-1 rounded bg-gray-800 text-gray-400 shrink-0 font-mono">P{s.priority}</span>
                            </div>
                          ))
                        ) : (
                          <div className="text-[10px] text-rose-400 italic">No strategies assigned (Sits in cash)</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-2 pt-2 border-t border-gray-800/60 flex items-center justify-between text-[11px] text-gray-400">
                <span className="flex items-center gap-1.5 text-gray-400">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  <strong>Non-Tradable / Dead Volume:</strong> Stand Aside in Cash (0 trades executed)
                </span>
                <button
                  onClick={handleResetBucket}
                  className="text-xs text-gray-400 hover:text-white flex items-center gap-1 px-2.5 py-1 rounded bg-gray-800 border border-gray-700 cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" /> Reset Defaults
                </button>
              </div>
            </div>

            {/* Strategy Bucket Items List */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-white">Your Strategy Bucket</h4>
                  <p className="text-xs text-gray-400">Enable or disable strategies, assign valid regimes, and adjust execution priority.</p>
                </div>
              </div>

              <div className="space-y-3">
                {bucket.map(strat => (
                  <div
                    key={strat.id}
                    className={`rounded-xl p-4 border transition-all ${
                      strat.enabled
                        ? 'bg-[#161B22] border-[#30363D] hover:border-gray-600'
                        : 'bg-gray-900/40 border-gray-800/60 opacity-60'
                    }`}
                  >
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                      
                      {/* Left: Checkbox + Name + Description */}
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked={strat.enabled}
                          onChange={() => handleToggleBucketStrategy(strat.id)}
                          className="mt-1 w-4 h-4 rounded text-purple-600 bg-gray-900 border-gray-700 focus:ring-purple-500 cursor-pointer"
                          id={`bucket-check-${strat.id}`}
                        />
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <label
                              htmlFor={`bucket-check-${strat.id}`}
                              className={`text-sm font-bold cursor-pointer ${strat.enabled ? 'text-white' : 'text-gray-400 line-through'}`}
                            >
                              {strat.name}
                            </label>
                            {settings.activeStrategy === strat.id && (
                              <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold">
                                CURRENTLY FORCED ACTIVE
                              </span>
                            )}
                            {!strat.enabled && (
                              <span className="px-2 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20 text-[10px]">
                                EXCLUDED FROM BOT
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-400 leading-relaxed max-w-xl">
                            {strat.description}
                          </p>
                        </div>
                      </div>

                      {/* Right: Regimes Selector + Priority + Force Button */}
                      <div className="flex flex-wrap items-center gap-3 self-start lg:self-center pl-7 lg:pl-0">
                        {/* Priority Selector */}
                        <div className="flex items-center gap-1.5 bg-gray-900 border border-gray-800 rounded-lg px-2.5 py-1">
                          <span className="text-[10px] text-gray-400 font-semibold uppercase">Priority:</span>
                          <select
                            value={strat.priority}
                            onChange={e => handleChangePriority(strat.id, parseInt(e.target.value) || 1)}
                            className="bg-transparent text-white text-xs font-bold focus:outline-none cursor-pointer"
                          >
                            <option value={1} className="bg-gray-900 text-white">#1 (Highest)</option>
                            <option value={2} className="bg-gray-900 text-white">#2 (High)</option>
                            <option value={3} className="bg-gray-900 text-white">#3 (Medium)</option>
                            <option value={4} className="bg-gray-900 text-white">#4 (Fallback)</option>
                          </select>
                        </div>

                        {/* Allowed Regimes Checkboxes */}
                        <div className="flex items-center gap-1">
                          {ALL_REGIMES.map(reg => {
                            const isSelected = strat.regimes.includes(reg.key);
                            return (
                              <button
                                key={reg.key}
                                type="button"
                                onClick={() => handleToggleRegimeForStrategy(strat.id, reg.key)}
                                className={`px-2 py-1 rounded text-[10px] font-bold border transition-all cursor-pointer ${
                                  isSelected 
                                    ? reg.badgeBg
                                    : 'bg-gray-900/60 border-gray-800 text-gray-500 hover:text-gray-300'
                                }`}
                                title={`Toggle eligibility for ${reg.label} markets`}
                              >
                                {reg.label}
                              </button>
                            );
                          })}
                        </div>

                        {/* Force Single Strategy Button */}
                        <button
                          type="button"
                          onClick={() => handleInputChange('activeStrategy', strat.id)}
                          className={`px-2.5 py-1 rounded text-[10px] font-semibold border transition-all cursor-pointer ${
                            settings.activeStrategy === strat.id
                              ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                              : 'bg-gray-800/80 hover:bg-gray-700 text-gray-300 border-gray-700'
                          }`}
                          title="Force the bot to trade ONLY this strategy (bypasses auto-regime)"
                        >
                          {settings.activeStrategy === strat.id ? 'Forced' : 'Force'}
                        </button>

                      </div>

                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        )}

        {/* TAB 2: INDICATOR & STRATEGY PARAMETERS */}
        {activeTab === 'parameters' && (
          <div className="space-y-6">
            
            {/* Quick Strategy Lock Buttons */}
            <div className="bg-[#161B22] rounded-xl p-5 border border-[#30363D] space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-white">Active Strategy Lock</h4>
                  <p className="text-xs text-gray-400">Lock the bot to run a specific strategy across all symbols or use Auto-Regime.</p>
                </div>
                <span className="text-xs px-2.5 py-1 rounded bg-gray-800 border border-gray-700 text-gray-300 font-mono">
                  Active: <strong>{settings.activeStrategy}</strong>
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                <button
                  onClick={() => handleInputChange('activeStrategy', 'AUTO_REGIME')}
                  className={`p-3 rounded-lg border text-left cursor-pointer transition-all ${
                    settings.activeStrategy === 'AUTO_REGIME'
                      ? 'bg-purple-950/40 border-purple-500 text-purple-300'
                      : 'bg-gray-900 border-gray-800 text-gray-400 hover:border-gray-700'
                  }`}
                >
                  <div className="font-bold text-xs flex items-center gap-1.5">
                    <Cpu className="w-3.5 h-3.5" /> Auto-Regime
                  </div>
                  <div className="text-[10px] text-gray-500 mt-0.5">Dynamic bucket selection</div>
                </button>

                <button
                  onClick={() => handleInputChange('activeStrategy', 'BINANCE_COMPOSITE')}
                  className={`p-3 rounded-lg border text-left cursor-pointer transition-all ${
                    settings.activeStrategy === 'BINANCE_COMPOSITE'
                      ? 'bg-emerald-950/40 border-[#00e696] text-[#00e696]'
                      : 'bg-gray-900 border-gray-800 text-gray-400 hover:border-gray-700'
                  }`}
                >
                  <div className="font-bold text-xs">Ranging 1:3 R:R</div>
                  <div className="text-[10px] text-gray-500 mt-0.5">BB + RSI mean reversion</div>
                </button>

                <button
                  onClick={() => handleInputChange('activeStrategy', 'DELTA_CLIMAX')}
                  className={`p-3 rounded-lg border text-left cursor-pointer transition-all ${
                    settings.activeStrategy === 'DELTA_CLIMAX'
                      ? 'bg-emerald-950/40 border-[#00e696] text-[#00e696]'
                      : 'bg-gray-900 border-gray-800 text-gray-400 hover:border-gray-700'
                  }`}
                >
                  <div className="font-bold text-xs">Delta Climax</div>
                  <div className="text-[10px] text-gray-500 mt-0.5">Capitulation reversal</div>
                </button>

                <button
                  onClick={() => handleInputChange('activeStrategy', 'VOLATILITY_COMPRESSION')}
                  className={`p-3 rounded-lg border text-left cursor-pointer transition-all ${
                    settings.activeStrategy === 'VOLATILITY_COMPRESSION'
                      ? 'bg-emerald-950/40 border-[#00e696] text-[#00e696]'
                      : 'bg-gray-900 border-gray-800 text-gray-400 hover:border-gray-700'
                  }`}
                >
                  <div className="font-bold text-xs">VCB Breakout</div>
                  <div className="text-[10px] text-gray-500 mt-0.5">Squeeze expansion</div>
                </button>

                <button
                  onClick={() => handleInputChange('activeStrategy', 'TREND_PULLBACK')}
                  className={`p-3 rounded-lg border text-left cursor-pointer transition-all ${
                    settings.activeStrategy === 'TREND_PULLBACK'
                      ? 'bg-blue-950/40 border-blue-400 text-blue-300'
                      : 'bg-gray-900 border-gray-800 text-gray-400 hover:border-gray-700'
                  }`}
                >
                  <div className="font-bold text-xs">Trend Pullback</div>
                  <div className="text-[10px] text-gray-500 mt-0.5">EMA trend bounce</div>
                </button>

                <button
                  onClick={() => handleInputChange('activeStrategy', 'SMC_LIQUIDITY_SWEEP')}
                  className={`p-3 rounded-lg border text-left cursor-pointer transition-all ${
                    settings.activeStrategy === 'SMC_LIQUIDITY_SWEEP'
                      ? 'bg-cyan-950/40 border-cyan-400 text-cyan-300'
                      : 'bg-gray-900 border-gray-800 text-gray-400 hover:border-gray-700'
                  }`}
                >
                  <div className="font-bold text-xs">SMC Liquidity</div>
                  <div className="text-[10px] text-gray-500 mt-0.5">Sweep + FVG retest</div>
                </button>

                <button
                  onClick={() => handleInputChange('activeStrategy', 'MACRO_RANGE_BREAKOUT')}
                  className={`p-3 rounded-lg border text-left cursor-pointer transition-all ${
                    settings.activeStrategy === 'MACRO_RANGE_BREAKOUT'
                      ? 'bg-purple-950/40 border-purple-400 text-purple-300'
                      : 'bg-gray-900 border-gray-800 text-gray-400 hover:border-gray-700'
                  }`}
                >
                  <div className="font-bold text-xs">Macro Range Box</div>
                  <div className="text-[10px] text-gray-500 mt-0.5">Darvas accumulation</div>
                </button>

                <button
                  onClick={() => handleInputChange('activeStrategy', 'EARLY_COIL_BREAKOUT')}
                  className={`p-3 rounded-lg border text-left cursor-pointer transition-all ${
                    settings.activeStrategy === 'EARLY_COIL_BREAKOUT'
                      ? 'bg-indigo-950/40 border-indigo-400 text-indigo-300'
                      : 'bg-gray-900 border-gray-800 text-gray-400 hover:border-gray-700'
                  }`}
                >
                  <div className="font-bold text-xs">Early Coil</div>
                  <div className="text-[10px] text-gray-500 mt-0.5">Fractal breakout</div>
                </button>
              </div>
            </div>

            {/* Ranging 1:3 R:R Mean-Reversion Parameters */}
            <div className="bg-[#161B22] rounded-xl p-6 border border-[#30363D] space-y-4">
              <div>
                <h3 className="text-base font-bold text-white">Ranging 1:3 R:R Strategy Parameters</h3>
                <p className="text-xs text-gray-400 mt-0.5">Bollinger Bands (20,2) + RSI(14) Mean-Reversion with strict 1:3 Risk-to-Reward ratio.</p>
              </div>
              <div className="space-y-1">
                <InputRow label="Bollinger Bands Period" desc="Moving average period for band center" value={settings.rmrBbPeriod ?? 20} onChange={(v: any) => handleInputChange('rmrBbPeriod', v)} min={10} max={50} />
                <InputRow label="Bollinger Bands StdDev" desc="Standard deviations for upper and lower bands" value={settings.rmrBbStdDev ?? 2.0} onChange={(v: any) => handleInputChange('rmrBbStdDev', v)} step={0.1} min={1.0} max={3.5} />
                <InputRow label="RSI Oversold Level (Long Entry)" desc="RSI must dip below this and cross back above to trigger Long" value={settings.rmrRsiOversold ?? 30} onChange={(v: any) => handleInputChange('rmrRsiOversold', v)} min={15} max={45} />
                <InputRow label="RSI Overbought Level (Short Entry)" desc="RSI must pierce above this and cross back below to trigger Short" value={settings.rmrRsiOverbought ?? 70} onChange={(v: any) => handleInputChange('rmrRsiOverbought', v)} min={55} max={85} />
                <InputRow label="Risk:Reward Ratio (Fixed Multiple)" desc="Take-Profit = Entry ± (Multiple × Stop Distance)" value={settings.rmrRiskRewardRatio ?? 3.0} onChange={(v: any) => handleInputChange('rmrRiskRewardRatio', v)} step={0.5} min={1.5} max={6.0} />
                <InputRow label="Stop-Loss Structure Buffer (%)" desc="Additional buffer beyond candle swing low/high" value={settings.rmrStopBufferPct ?? 0.15} onChange={(v: any) => handleInputChange('rmrStopBufferPct', v)} step={0.05} min={0.05} max={1.0} />
              </div>
            </div>

            {/* Climax Reversal Parameters */}
            <div className="bg-[#161B22] rounded-xl p-6 border border-[#30363D] space-y-4">
              <div>
                <h3 className="text-base font-bold text-white">Delta Climax Reversal Parameters</h3>
                <p className="text-xs text-gray-400 mt-0.5">Exhaustion spike & capitulation mean-reversion algorithm.</p>
              </div>
              <div className="space-y-1">
                <InputRow label="Climax Volume Spike Multiplier" desc="Current volume vs 20-period SMA required for climax confirmation" value={settings.crVolumeSpikeMultiplier ?? 2.0} onChange={(v: any) => handleInputChange('crVolumeSpikeMultiplier', v)} step={0.1} min={1.2} max={5.0} />
                <InputRow label="Minimum Wick Ratio" desc="Wick size relative to total candle range" value={settings.crMinWickRatio ?? 0.4} onChange={(v: any) => handleInputChange('crMinWickRatio', v)} step={0.05} min={0.2} max={0.8} />
                <InputRow label="Minimum Overextension (x ATR)" desc="Distance from 50 EMA measured in multiples of ATR" value={settings.crMinAtrDistance ?? 1.8} onChange={(v: any) => handleInputChange('crMinAtrDistance', v)} step={0.1} min={1.0} max={4.0} />
                <InputRow label="Minimum Risk-to-Reward Ratio" desc="Expected minimum profit multiple vs risk distance" value={settings.crMinRewardRisk ?? 2.5} onChange={(v: any) => handleInputChange('crMinRewardRisk', v)} step={0.1} min={1.5} max={5.0} />
              </div>
            </div>

            {/* VCB Parameters */}
            <div className="bg-[#161B22] rounded-xl p-6 border border-[#30363D] space-y-4">
              <div>
                <h3 className="text-base font-bold text-white">Volatility Compression (VCB) Parameters</h3>
                <p className="text-xs text-gray-400 mt-0.5">Bollinger/Keltner squeeze release with price buildup confirmation.</p>
              </div>
              <div className="space-y-1">
                <InputRow label="Squeeze Lookback Bars" desc="Number of candles evaluated for low volatility compression" value={settings.vcbSqueezeLookback ?? 20} onChange={(v: any) => handleInputChange('vcbSqueezeLookback', v)} min={10} max={50} />
                <InputRow label="Minimum Squeeze Ratio" desc="Bollinger Band width percentile qualifying as a valid squeeze" value={settings.vcbMinSqueezeRatio ?? 0.15} onChange={(v: any) => handleInputChange('vcbMinSqueezeRatio', v)} step={0.01} min={0.05} max={0.3} />
                <InputRow label="Volume Surge Trigger" desc="Expansion candle volume multiple over moving average" value={settings.vcbVolumeSurgeTrigger ?? 1.5} onChange={(v: any) => handleInputChange('vcbVolumeSurgeTrigger', v)} step={0.1} min={1.1} max={3.0} />
              </div>
            </div>

          </div>
        )}

        {/* TAB 3: GATE MANAGEMENT & BYPASS MATRIX */}
        {activeTab === 'gates' && (
          <div className="space-y-6">
            <div className="bg-[#161B22] rounded-xl p-6 border border-[#30363D] space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="text-base font-bold text-white">Execution Gates & Strategy Bypass Matrix</h3>
                  <p className="text-xs text-gray-400 mt-0.5">Toggle individual confirmation gates or adjust sensitivity thresholds.</p>
                </div>
                <span className="text-xs px-2.5 py-1 rounded bg-gray-800 text-gray-300 border border-gray-700">
                  {strategyGates.filter(g => !(settings.disabledGates || {})[g.id]).length} of {strategyGates.length} Active
                </span>
              </div>

              <div className="divide-y divide-[#30363D]/60 pt-2">
                {strategyGates.map((gate) => {
                  const isDisabled = !!(settings.disabledGates || {})[gate.id];
                  const isExpanded = expandedGateId === gate.id;

                  return (
                    <div key={gate.id} className="py-3.5 flex flex-col gap-2">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={!isDisabled}
                            onChange={() => handleToggleGate(gate.id)}
                            className="w-4 h-4 rounded text-[#00e696] bg-gray-900 border-gray-700 focus:ring-[#00e696] cursor-pointer"
                            id={`gate-check-${gate.id}`}
                          />
                          <div>
                            <label
                              htmlFor={`gate-check-${gate.id}`}
                              className={`text-sm font-bold cursor-pointer ${isDisabled ? 'text-gray-500 line-through' : 'text-gray-200'}`}
                            >
                              {gate.name}
                            </label>
                            <div className="flex items-center gap-2 mt-0.5">
                              {getImportanceBadge(gate.importance, gate.importanceScore)}
                              <span className="text-[11px] text-gray-500 font-mono">[{gate.strategy}]</span>
                            </div>
                          </div>
                        </div>

                        <button
                          onClick={() => setExpandedGateId(isExpanded ? null : gate.id)}
                          className="text-xs text-gray-400 hover:text-white px-2 py-1 rounded bg-gray-800/80 border border-gray-700 cursor-pointer"
                        >
                          {isExpanded ? 'Less' : 'Details'}
                        </button>
                      </div>

                      {isExpanded && (
                        <div className="pl-7 pr-2 py-2 text-xs text-gray-400 bg-gray-900/60 rounded-lg border border-gray-800 mt-1">
                          <p className="leading-relaxed">{gate.description}</p>
                          <div className="mt-1 text-[11px] text-gray-500">
                            Failure mode: {gate.importance === 'CRITICAL' ? 'Blocks trade immediately' : 'Deducts score weight from total conviction'}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default StrategyPanel;
