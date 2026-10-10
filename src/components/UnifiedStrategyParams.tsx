import React, { useState } from 'react';
import { AppSettings, NUMERIC_BOUNDS } from '../types';
import { RangeStrategyConfigPanel } from './RangeStrategyConfigPanel';
import { LiquiditySweepPanel } from './LiquiditySweepPanel';
import { 
  Zap, ShieldCheck, Target, Sparkles, Activity, Flame, RotateCcw, 
  Layers, Compass, Check, SlidersHorizontal, Info, AlertTriangle, ChevronRight, Eye
} from 'lucide-react';

interface UnifiedStrategyParamsProps {
  settings: AppSettings;
  onUpdateSetting: (field: keyof AppSettings, value: any) => void;
  onSaveDirect?: (partialSettings: Partial<AppSettings>) => void;
  activeStrategyFilter?: string | null;
  sourceContext?: 'settings' | 'strategy';
}

const InputRow: React.FC<{
  label: string;
  desc: string;
  value: number | undefined;
  onChange: (val: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
}> = ({ label, desc, value, onChange, min, max, step = 1, unit }) => {
  const [localVal, setLocalVal] = useState<string>(value !== undefined && value !== null ? String(value) : '');

  React.useEffect(() => {
    setLocalVal(value !== undefined && value !== null ? String(value) : '');
  }, [value]);

  const handleBlur = () => {
    let parsed = parseFloat(localVal);
    if (isNaN(parsed)) parsed = min ?? 0;
    const clamped = Math.max(min ?? -Infinity, Math.min(max ?? Infinity, parsed));
    setLocalVal(String(clamped));
    onChange(clamped);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleBlur();
      e.currentTarget.blur();
    }
  };

  return (
    <div className="flex justify-between items-center py-3 border-b border-[#30363D]/40 last:border-0 hover:bg-white/[0.01] px-2 rounded-lg transition-colors">
      <div className="flex flex-col pr-4">
        <span className="text-xs sm:text-sm font-semibold text-gray-200">{label}</span>
        <span className="text-[11px] text-gray-500 mt-0.5 leading-relaxed">{desc}</span>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <input
          type="number"
          value={localVal}
          onChange={(e) => setLocalVal(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          step={step}
          className="w-24 bg-[#0E1117] border border-[#30363D] rounded-lg p-1.5 text-right font-mono text-xs sm:text-sm font-bold text-emerald-400 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/40"
        />
        {unit && <span className="text-[11px] text-gray-400 font-mono w-6 text-left">{unit}</span>}
      </div>
    </div>
  );
};

const ToggleRow: React.FC<{
  label: string;
  desc: string;
  checked: boolean;
  onChange: (val: boolean) => void;
  accentColor?: string;
}> = ({ label, desc, checked, onChange, accentColor = 'bg-emerald-500' }) => {
  return (
    <div className="flex justify-between items-center py-3 border-b border-[#30363D]/40 last:border-0 hover:bg-white/[0.01] px-2 rounded-lg transition-colors">
      <div className="flex flex-col pr-4">
        <div className="flex items-center gap-2">
          <span className="text-xs sm:text-sm font-semibold text-gray-200">{label}</span>
          <span className={`text-[9.5px] font-bold px-1.5 py-0.2 rounded border ${
            checked 
              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' 
              : 'bg-gray-800 text-gray-500 border-gray-700'
          }`}>
            {checked ? 'ACTIVE' : 'OFF'}
          </span>
        </div>
        <span className="text-[11px] text-gray-500 mt-0.5 leading-relaxed">{desc}</span>
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`w-11 h-6 rounded-full transition-colors flex items-center px-0.5 shrink-0 cursor-pointer ${
          checked ? accentColor : 'bg-gray-700'
        }`}
      >
        <div className={`w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${checked ? 'transform translate-x-5' : ''}`} />
      </button>
    </div>
  );
};

export const UnifiedStrategyParams: React.FC<UnifiedStrategyParamsProps> = ({
  settings,
  onUpdateSetting,
  onSaveDirect,
  activeStrategyFilter = null,
  sourceContext = 'strategy'
}) => {
  const [selectedFilter, setSelectedFilter] = useState<string>(activeStrategyFilter || 'ALL');

  const STRATEGY_FILTERS = [
    { id: 'ALL', name: 'All 6 Strategies', count: 6 },
    { id: 'EMA5_EXACT_ENTRY_V2', name: 'EMA 5 Exact V2', icon: Zap, color: 'text-emerald-400' },
    { id: 'VOLATILITY_COMPRESSION', name: 'VCB Breakout', icon: ShieldCheck, color: 'text-emerald-400' },
    { id: 'TREND_PULLBACK', name: 'Trend Pullback', icon: Target, color: 'text-blue-400' },
    { id: 'SMC_LIQUIDITY_SWEEP', name: 'SMC Liquidity', icon: Sparkles, color: 'text-purple-400' },
    { id: 'BINANCE_COMPOSITE', name: 'Range Mean Reversion', icon: Activity, color: 'text-cyan-400' },
    { id: 'EARLY_COIL_BREAKOUT', name: 'Early Coil Breakout', icon: Flame, color: 'text-orange-400' }
  ];

  const CORE_STRATEGY_IDS = new Set([
    'EMA5_EXACT_ENTRY_V2',
    'VOLATILITY_COMPRESSION',
    'TREND_PULLBACK',
    'SMC_LIQUIDITY_SWEEP',
    'BINANCE_COMPOSITE',
    'EARLY_COIL_BREAKOUT'
  ]);

  const shouldShow = (id: string) => {
    if (!CORE_STRATEGY_IDS.has(id)) return false;
    if (selectedFilter === 'ALL') return true;
    return selectedFilter === id;
  };

  const handleFieldChange = (field: keyof AppSettings, val: any) => {
    onUpdateSetting(field, val);
    if (onSaveDirect) {
      onSaveDirect({ [field]: val });
    }
  };

  return (
    <div className="space-y-6">
      {/* Synchronization & Authority Banner */}
      <div className="bg-gradient-to-r from-emerald-950/40 via-[#161B22] to-blue-950/30 border border-emerald-500/40 rounded-xl p-4 sm:p-5 shadow-xl">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shrink-0">
              <Zap className="w-5 h-5 text-emerald-400 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm sm:text-base font-bold text-white">
                  ⚡ Live Auto-Execution Parameters — Canonical Engine Configuration
                </h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold">
                  AUTOTRADER v{settings.settingsVersion || 1}
                </span>
              </div>
              <p className="text-xs text-gray-300 mt-1 leading-relaxed max-w-3xl">
                Single Source of Truth: Every parameter configured below is synchronized 1:1 between both UI panels and respected unconditionally by the backend trading engine during live scan & execution cycles.
              </p>
            </div>
          </div>
          <span className="text-[11px] font-bold px-2.5 py-1 rounded bg-[#0E1117] text-emerald-300 border border-emerald-500/30 shrink-0">
            {sourceContext === 'settings' ? 'SETTINGS PANEL SURFACE' : 'STRATEGIES PANEL SURFACE'}
          </span>
        </div>
      </div>

      {/* Strategy Selector / Filter Tabs */}
      <div className="bg-[#161B22] border border-[#30363D] rounded-xl p-2.5 overflow-x-auto no-scrollbar">
        <div className="flex items-center gap-1.5 min-w-max">
          {STRATEGY_FILTERS.map(f => {
            const isSelected = selectedFilter === f.id;
            const Icon = f.icon;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setSelectedFilter(f.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                  isSelected
                    ? 'bg-emerald-600 text-white shadow-md shadow-emerald-950/40'
                    : 'bg-gray-900/80 text-gray-400 hover:text-gray-200 hover:bg-gray-800 border border-gray-800'
                }`}
              >
                {Icon && <Icon className={`w-3.5 h-3.5 ${isSelected ? 'text-white' : f.color}`} />}
                <span>{f.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* STRATEGY 1: EMA 5 Exact Price Action Entry V2 (EMA5_EXACT_ENTRY_V2) */}
      {shouldShow('EMA5_EXACT_ENTRY_V2') && (
        <div className="bg-[#161B22] rounded-xl p-5 sm:p-6 border border-emerald-500/40 space-y-4 shadow-xl shadow-emerald-950/10">
          <div className="flex items-center justify-between border-b border-[#30363D] pb-3 flex-wrap gap-2">
            <div>
              <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                <Zap className="w-4 h-4 text-emerald-400" />
                <span>1. EMA 5 Exact Price Action Entry V2 Parameters</span>
              </h3>
              <p className="text-xs text-gray-400 mt-0.5">Exact 5m EMA 5 Alert → Break trigger with 15m structure regime, multi-timeframe level ladder targets (15m, 1h, 1D, 1W), and fee-drag floor.</p>
            </div>
            <span className="px-2.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
              EXACT ALERT-BREAK V2
            </span>
          </div>

          <div className="space-y-1">
            <ToggleRow
              label="Enable EMA5_EXACT_ENTRY_V2 Strategy"
              desc="Allow the 5m EMA 5 Alert-Break engine to evaluate and execute live signals"
              checked={settings.eev2Enabled !== false}
              onChange={(v) => handleFieldChange('eev2Enabled', v)}
            />

            <div className="flex flex-col sm:flex-row sm:items-center justify-between py-3 border-b border-gray-800/50 gap-4">
              <div className="flex flex-col">
                <span className="text-xs sm:text-sm font-semibold text-gray-200">Execution Entry Mode</span>
                <span className="text-[11px] text-gray-500 mt-0.5">CLOSE_CONFIRM (Conservative closed candle) vs STOP_ENTRY (Breakout stop order)</span>
              </div>
              <div className="flex bg-gray-900 rounded-lg p-1 border border-gray-700">
                {(['CLOSE_CONFIRM', 'STOP_ENTRY'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => handleFieldChange('eev2EntryMode', mode)}
                    className={`px-3 py-1 rounded text-xs font-bold transition-all cursor-pointer ${
                      (settings.eev2EntryMode || 'CLOSE_CONFIRM') === mode
                        ? 'bg-emerald-600 text-white shadow'
                        : 'text-gray-400 hover:text-gray-200'
                    }`}
                  >
                    {mode.replace('_', ' ')}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between py-3 border-b border-gray-800/50 gap-4">
              <div className="flex flex-col">
                <span className="text-xs sm:text-sm font-semibold text-gray-200">Take Profit Exit Mode</span>
                <span className="text-[11px] text-gray-500 mt-0.5">LEVEL_LADDER (TP1 40%, TP2 40%, Runner 20%) vs RR_FIXED</span>
              </div>
              <div className="flex bg-gray-900 rounded-lg p-1 border border-gray-700">
                {(['LEVEL_LADDER', 'RR_FIXED'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => handleFieldChange('eev2ExitMode', mode)}
                    className={`px-3 py-1 rounded text-xs font-bold transition-all cursor-pointer ${
                      (settings.eev2ExitMode || 'LEVEL_LADDER') === mode
                        ? 'bg-emerald-600 text-white shadow'
                        : 'text-gray-400 hover:text-gray-200'
                    }`}
                  >
                    {mode.replace('_', ' ')}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between py-3 border-b border-gray-800/50 gap-4">
              <div className="flex flex-col">
                <span className="text-xs sm:text-sm font-semibold text-gray-200">Breakeven Mode</span>
                <span className="text-[11px] text-gray-500 mt-0.5">AFTER_TP1 (Lock entry when TP1 hit) vs R_TRIGGER (+1R) vs OFF</span>
              </div>
              <div className="flex bg-gray-900 rounded-lg p-1 border border-gray-700">
                {(['AFTER_TP1', 'R_TRIGGER', 'OFF'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => handleFieldChange('eev2BeMode', mode)}
                    className={`px-3 py-1 rounded text-xs font-bold transition-all cursor-pointer ${
                      (settings.eev2BeMode || 'AFTER_TP1') === mode
                        ? 'bg-emerald-600 text-white shadow'
                        : 'text-gray-400 hover:text-gray-200'
                    }`}
                  >
                    {mode.replace('_', ' ')}
                  </button>
                ))}
              </div>
            </div>

            <InputRow label="Min Relative Volume Ratio" desc="Trigger candle volume vs 20-period baseline volume (default: 1.10x)" value={settings.eev2MinVolumeRatio ?? 1.10} onChange={(v) => handleFieldChange('eev2MinVolumeRatio', v)} step={0.05} min={0.5} max={3.0} unit="x" />
            <InputRow label="Minimum Net R:R" desc="Required net reward-to-risk ratio to allow entry (default: 2.5)" value={settings.eev2MinNetRr ?? 2.5} onChange={(v) => handleFieldChange('eev2MinNetRr', v)} step={0.1} min={1.5} max={6.0} unit=":1" />
            <InputRow label="Max Fee Drag Floor (feeR)" desc="Maximum fee drag as fraction of stop risk (rejects if feeR > 0.20, default: 0.20)" value={settings.eev2MaxFeeR ?? 0.20} onChange={(v) => handleFieldChange('eev2MaxFeeR', v)} step={0.01} min={0.05} max={0.50} unit="R" />
            <InputRow label="SL Anchor Buffer (x AvgRange)" desc="Stop buffer added beyond alert candle extreme (default: 0.15)" value={settings.eev2SlBufferAvgRange ?? 0.15} onChange={(v) => handleFieldChange('eev2SlBufferAvgRange', v)} step={0.05} min={0.05} max={0.50} unit="x" />
            <InputRow label="Max Stop Distance (x AvgRange)" desc="Maximum allowable stop distance vs recent average range (default: 2.0x)" value={settings.eev2MaxStopAvgRange ?? 2.0} onChange={(v) => handleFieldChange('eev2MaxStopAvgRange', v)} step={0.1} min={1.0} max={5.0} unit="x" />
            <InputRow label="Min Stop Distance (x AvgRange)" desc="Minimum allowable stop distance vs recent average range (default: 0.5x)" value={settings.eev2MinStopAvgRange ?? 0.5} onChange={(v) => handleFieldChange('eev2MinStopAvgRange', v)} step={0.05} min={0.1} max={1.5} unit="x" />
            <InputRow label="Fallback Target (R Multiple)" desc="Take-profit multiple when structural levels are unavailable (default: 3.0R)" value={settings.eev2FallbackTpR ?? 3.0} onChange={(v) => handleFieldChange('eev2FallbackTpR', v)} step={0.1} min={1.5} max={6.0} unit="R" />
            <InputRow label="Max Entry Drift Cap (in R)" desc="Maximum execution slip beyond trigger level (default: 0.15R)" value={settings.eev2MaxEntryDriftR ?? 0.15} onChange={(v) => handleFieldChange('eev2MaxEntryDriftR', v)} step={0.05} min={0.05} max={0.50} unit="R" />
            <InputRow label="15m Regime Pivot Confirmation Bars" desc="Right-bar confirmation lag for 15m swing pivot detection (default: 3 bars)" value={settings.eev2RegimePivotN ?? 3} onChange={(v) => handleFieldChange('eev2RegimePivotN', v)} min={2} max={6} unit="bars" />
            <InputRow label="Max Position Hold Time (Hours)" desc="Maximum duration before closing stagnant position (default: 24h)" value={settings.eev2MaxHoldHours ?? 24} onChange={(v) => handleFieldChange('eev2MaxHoldHours', v)} min={1} max={72} unit="hrs" />
          </div>
        </div>
      )}

      {/* STRATEGY 2: Volatility Compression Breakout (VOLATILITY_COMPRESSION) */}
      {shouldShow('VOLATILITY_COMPRESSION') && (
        <div className="bg-[#161B22] rounded-xl p-5 sm:p-6 border border-emerald-500/40 space-y-4 shadow-xl shadow-emerald-950/10">
          <div className="flex items-center justify-between border-b border-[#30363D] pb-3 flex-wrap gap-2">
            <div>
              <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>2. Volatility Compression Breakout (VCB) Parameters</span>
              </h3>
              <p className="text-xs text-gray-400 mt-0.5">Bollinger/Keltner compression squeeze and explosive expansion engine with 11-point gate checklist.</p>
            </div>
            <span className="px-2.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
              BREAKOUT / SQUEEZE
            </span>
          </div>

          <div className="space-y-1">
            <InputRow label="Compression Lookback Bars" desc="Candles evaluated for low volatility compression (default: 10)" value={settings.vcbCompressionLookback ?? 10} onChange={(v) => handleFieldChange('vcbCompressionLookback', v)} min={5} max={50} unit="bars" />
            <InputRow label="Consolidation Window ATR Multiplier" desc="Range ceiling for tight consolidation structure (default: 3.0)" value={settings.vcbWindowAtrMult ?? 3.0} onChange={(v) => handleFieldChange('vcbWindowAtrMult', v)} min={1.0} max={6.0} unit="x" />
            <InputRow label="Checklist Minimum Score" desc="Minimum required 11-point gate checklist score to trigger breakout entry (default: 8)" value={settings.vcbChecklistMinScore ?? 8} onChange={(v) => handleFieldChange('vcbChecklistMinScore', v)} min={5} max={11} unit="pts" />
            <InputRow label="Minimum Risk-to-Reward Ratio" desc="Required asymmetric target multiple for breakout (default: 2.0)" value={settings.vcbMinRrRatio ?? 2.0} onChange={(v) => handleFieldChange('vcbMinRrRatio', v)} step={0.1} min={1.5} max={5.0} unit=":1" />
            <InputRow label="Local ATR Expansion Ratio (Min)" desc="Minimum current ATR / 20-period ATR MA expansion ratio to confirm market expansion (default: 1.20)" value={settings.vcbLocalAtrRatioMin ?? 1.20} onChange={(v) => handleFieldChange('vcbLocalAtrRatioMin', v)} step={0.05} min={1.0} max={2.5} unit="x" />
            <InputRow label="Entry Timeframe Minimum ADX" desc="Minimum ADX on entry timeframe ensuring trend momentum over range chop (default: 20)" value={settings.vcbLocalAdxMin ?? 20} onChange={(v) => handleFieldChange('vcbLocalAdxMin', v)} min={10} max={40} />
            <InputRow label="Breakout Volume Multiplier (RVOL)" desc="Minimum breakout volume relative to 20-period volume SMA (default: 1.50x)" value={settings.vcbBreakoutVolumeMin ?? 1.50} onChange={(v) => handleFieldChange('vcbBreakoutVolumeMin', v)} step={0.1} min={1.1} max={3.5} unit="x" />
            <InputRow label="Candle Body Dominance Ratio" desc="Minimum real body / total candle range to reject indecision wicks (default: 0.60 = 60%)" value={settings.vcbBodyDominanceMin ?? 0.60} onChange={(v) => handleFieldChange('vcbBodyDominanceMin', v)} step={0.05} min={0.40} max={0.90} />
            <InputRow label="Close Location Value" desc="Minimum close location within candle range in breakout direction (default: 0.70)" value={settings.vcbCloseLocationMin ?? 0.70} onChange={(v) => handleFieldChange('vcbCloseLocationMin', v)} step={0.05} min={0.50} max={0.95} />
            <InputRow label="HTF Minimum ADX" desc="Minimum ADX on Higher Timeframe to ensure institutional directional bias (default: 20)" value={settings.vcbHtfAdxMin ?? 20} onChange={(v) => handleFieldChange('vcbHtfAdxMin', v)} min={10} max={40} />
            <InputRow label="Bullish RSI Minimum" desc="Minimum RSI on entry timeframe for Long breakouts (default: 55)" value={settings.vcbRsiBullishMin ?? 55} onChange={(v) => handleFieldChange('vcbRsiBullishMin', v)} min={50} max={70} />
            <InputRow label="Bearish RSI Maximum" desc="Maximum RSI on entry timeframe for Short breakdowns (default: 45)" value={settings.vcbRsiBearishMax ?? 45} onChange={(v) => handleFieldChange('vcbRsiBearishMax', v)} min={30} max={50} />

            <ToggleRow
              label="Require Liquidity Sweep Before Breakout"
              desc="Only execute breakouts that cleared liquidity before the expansion candle"
              checked={settings.vcbRequireSweep !== false}
              onChange={(v) => handleFieldChange('vcbRequireSweep', v)}
            />
            <ToggleRow
              label="Require Retest into Consolidation"
              desc="Wait for price pullback into breakout zone before entry"
              checked={settings.vcbRequireRetest !== false}
              onChange={(v) => handleFieldChange('vcbRequireRetest', v)}
            />
            <ToggleRow
              label="Require HTF Structure Alignment"
              desc="Require Higher-High/Higher-Low for Longs, Lower-High/Lower-Low for Shorts on HTF"
              checked={settings.vcbRequireHtfStructure !== false}
              onChange={(v) => handleFieldChange('vcbRequireHtfStructure', v)}
            />
            <ToggleRow
              label="Require Retest or Follow-Through Confirmation"
              desc="Only execute after broken level retest holds OR decisive follow-through candle confirmed"
              checked={settings.vcbRequireFollowThroughOrRetest !== false}
              onChange={(v) => handleFieldChange('vcbRequireFollowThroughOrRetest', v)}
            />
            <ToggleRow
              label="Enforce London & NY Kill Zones"
              desc="Only execute breakouts during London (07:00-11:00 UTC) and NY (13:00-17:00 UTC) peak sessions"
              checked={Boolean(settings.vcbEnforceKillZone)}
              onChange={(v) => handleFieldChange('vcbEnforceKillZone', v)}
            />
          </div>
        </div>
      )}

      {/* STRATEGY 3: Liquidity Sweep Reversal & SMC (SMC_LIQUIDITY_SWEEP / LIQUIDITY_SWEEP_REVERSAL) */}
      {(shouldShow('SMC_LIQUIDITY_SWEEP') || shouldShow('LIQUIDITY_SWEEP_REVERSAL')) && (
        <LiquiditySweepPanel
          settings={settings}
          onUpdateSetting={onUpdateSetting}
          onSaveDirect={onSaveDirect}
        />
      )}

      {/* STRATEGY 4: Trend Pullback (TREND_PULLBACK) */}
      {shouldShow('TREND_PULLBACK') && (
        <div className="bg-[#161B22] rounded-xl p-5 sm:p-6 border border-blue-500/30 space-y-4 shadow-xl shadow-blue-950/10">
          <div className="flex items-center justify-between border-b border-[#30363D] pb-3 flex-wrap gap-2">
            <div>
              <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                <Target className="w-4 h-4 text-blue-400" />
                <span>4. Trend Pullback (HTF + MTF Retest) Parameters</span>
              </h3>
              <p className="text-xs text-gray-400 mt-0.5">Trend-following retest strategy with EMA20/50 alignment, ADX momentum, and volume surge filtering.</p>
            </div>
            <span className="px-2.5 py-0.5 rounded text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/40">
              TREND FOLLOWING
            </span>
          </div>

          <div className="space-y-1">
            <InputRow label="Fast Trend EMA Period" desc="Fast EMA period for dynamic pullback detection (default: 20)" value={settings.tpbEmaFast ?? 20} onChange={(v) => handleFieldChange('tpbEmaFast', v)} min={5} max={100} />
            <InputRow label="Slow Baseline EMA Period" desc="Slow baseline EMA period for trend direction (default: 50)" value={settings.tpbEmaSlow ?? 50} onChange={(v) => handleFieldChange('tpbEmaSlow', v)} min={20} max={200} />
            <InputRow label="Minimum ADX Momentum" desc="ADX must be above this threshold to confirm strong trend (default: 22)" value={settings.tpbAdxMin ?? 22} onChange={(v) => handleFieldChange('tpbAdxMin', v)} min={10} max={50} />
            <InputRow label="EMA Slope Lookback (Bars)" desc="Bars back to compare Fast EMA for trend slope confirmation (default: 5)" value={settings.tpbSlopeLookbackBars ?? 5} onChange={(v) => handleFieldChange('tpbSlopeLookbackBars', v)} min={2} max={20} unit="bars" />
            <InputRow label="Pullback Depth Tolerance (x ATR)" desc="Tolerance band around EMA 20 in ATR units (default: 0.25)" value={settings.tpbPullbackDepthAtr ?? 0.25} onChange={(v) => handleFieldChange('tpbPullbackDepthAtr', v)} step={0.05} min={0.05} max={1.5} unit="x" />
            <InputRow label="Volume SMA Lookback Period" desc="Lookback period for baseline volume moving average (default: 20)" value={settings.tpbVolumeSmaPeriod ?? 20} onChange={(v) => handleFieldChange('tpbVolumeSmaPeriod', v)} min={5} max={50} unit="bars" />
            <InputRow label="Min Volume Surge Ratio" desc="Retest bounce candle volume vs SMA ratio (default: 1.0x)" value={settings.tpbMinVolumeRatio ?? 1.0} onChange={(v) => handleFieldChange('tpbMinVolumeRatio', v)} step={0.1} min={0.5} max={5.0} unit="x" />
            <InputRow label="Max Entry Distance from EMA (x ATR)" desc="Max allowable price extension from Fast EMA (default: 0.25)" value={settings.tpbMaxEntryDistanceAtr ?? 0.25} onChange={(v) => handleFieldChange('tpbMaxEntryDistanceAtr', v)} step={0.05} min={0.1} max={3.0} unit="x" />
            <InputRow label="Min Stop Distance (x ATR)" desc="Minimum stop distance in ATR units to reject noise (default: 0.8)" value={settings.tpbMinStopDistanceAtr ?? 0.8} onChange={(v) => handleFieldChange('tpbMinStopDistanceAtr', v)} step={0.1} min={0.2} max={2.0} unit="x" />
            <InputRow label="Max Stop Distance (x ATR)" desc="Maximum allowable stop distance in ATR units for timeframe (default: 3.0)" value={settings.tpbMaxStopDistanceAtr ?? 3.0} onChange={(v) => handleFieldChange('tpbMaxStopDistanceAtr', v)} step={0.1} min={1.0} max={6.0} unit="x" />
            <InputRow label="Max Spread / Slippage (x ATR)" desc="Maximum allowable spread in ATR units before entry is blocked (default: 0.3)" value={settings.tpbMaxSpreadAtr ?? 0.3} onChange={(v) => handleFieldChange('tpbMaxSpreadAtr', v)} step={0.05} min={0.05} max={1.0} unit="x" />
            <InputRow label="Minimum Risk-to-Reward Ratio" desc="Required minimum asymmetric target multiple (default: 1.5)" value={settings.tpbMinRrRatio ?? 1.5} onChange={(v) => handleFieldChange('tpbMinRrRatio', v)} step={0.1} min={1.0} max={5.0} unit=":1" />
            <InputRow label="Min Confirmation Score" desc="Minimum 5-pillar confirmation score to enter trade (default: 8/10)" value={settings.tpbMinScore ?? 8} onChange={(v) => handleFieldChange('tpbMinScore', v)} min={5} max={10} unit="pts" />
            <InputRow label="Stop Loss ATR Buffer" desc="Buffer added beyond recent swing low/high in ATR (default: 0.3)" value={settings.tpbAtrBuffer ?? 0.3} onChange={(v) => handleFieldChange('tpbAtrBuffer', v)} step={0.1} min={0.1} max={2.0} unit="x" />

            <ToggleRow label="Allow Long Setups" desc="Enable bullish trend-pullback trade execution" checked={settings.tpbAllowLongs !== false} onChange={(v) => handleFieldChange('tpbAllowLongs', v)} accentColor="bg-blue-600" />
            <ToggleRow label="Allow Short Setups" desc="Enable bearish trend-pullback trade execution" checked={settings.tpbAllowShorts !== false} onChange={(v) => handleFieldChange('tpbAllowShorts', v)} accentColor="bg-blue-600" />
            <ToggleRow label="Allow Broad Structural Stops" desc="If unchecked, prefers Local Execution Stop and rejects distant HTF stops" checked={settings.tpbAllowBroadStop === true} onChange={(v) => handleFieldChange('tpbAllowBroadStop', v)} accentColor="bg-blue-600" />
            <ToggleRow label="Unconfirmed Volume Mode" desc="Allow signal execution when exchange volume is unconfirmed" checked={settings.tpbAllowUnconfirmedVolume === true} onChange={(v) => handleFieldChange('tpbAllowUnconfirmedVolume', v)} accentColor="bg-blue-600" />
            <ToggleRow label="Require Volume Surge" desc="Block retest setups that lack confirmed volume expansion" checked={settings.tpbRequireVolume !== false} onChange={(v) => handleFieldChange('tpbRequireVolume', v)} accentColor="bg-blue-600" />
          </div>
        </div>
      )}

      {/* STRATEGY 5: Trend Pullback Retest (TREND_PULLBACK_RETEST) */}
      {shouldShow('TREND_PULLBACK_RETEST') && (
        <div className="bg-[#161B22] rounded-xl p-5 sm:p-6 border border-sky-500/30 space-y-4 shadow-xl shadow-sky-950/10">
          <div className="flex items-center justify-between border-b border-[#30363D] pb-3 flex-wrap gap-2">
            <div>
              <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                <Target className="w-4 h-4 text-sky-400" />
                <span>5. Trend Pullback Retest (TPR State Machine) Parameters</span>
              </h3>
              <p className="text-xs text-gray-400 mt-0.5">Full 5-stage state-machine: trend → pullback → retest → confirmation → entry. All 5 stages required in order.</p>
            </div>
            <span className="px-2.5 py-0.5 rounded text-[10px] font-bold bg-sky-500/20 text-sky-300 border border-sky-500/40">
              STATE MACHINE
            </span>
          </div>

          <div className="space-y-1">
            <ToggleRow
              label="Enable TPR Strategy"
              desc="Allow TREND_PULLBACK_RETEST to track state and execute trades"
              checked={settings.tprEnabled !== false}
              onChange={(v) => handleFieldChange('tprEnabled', v)}
              accentColor="bg-sky-600"
            />
            <InputRow label="Fast EMA Period" desc="EMA used for pullback zone and retest level (default: 20)" value={settings.tprEmaFast ?? 20} onChange={(v) => handleFieldChange('tprEmaFast', v)} min={5} max={100} />
            <InputRow label="Slow EMA Period" desc="EMA defining the trend boundary (default: 50)" value={settings.tprEmaSlow ?? 50} onChange={(v) => handleFieldChange('tprEmaSlow', v)} min={20} max={200} />
            <InputRow label="HTF EMA Period" desc="Optional higher-timeframe trend EMA (default: 200, set 0 to disable)" value={settings.tprEmaHtf ?? 200} onChange={(v) => handleFieldChange('tprEmaHtf', v)} min={50} max={500} />
            <InputRow label="Min ADX" desc="Minimum ADX value to classify market as trending (default: 20)" value={settings.tprMinAdx ?? 20} onChange={(v) => handleFieldChange('tprMinAdx', v)} min={10} max={50} />
            <InputRow label="Min Trend Score (1-6)" desc="Minimum trend quality score required to enter TREND_DETECTED phase (default: 5)" value={settings.tprMinTrendScore ?? 5} onChange={(v) => handleFieldChange('tprMinTrendScore', v)} min={1} max={6} unit="pts" />
            <InputRow label="Max Pullback Depth (ATR)" desc="Maximum allowed pullback depth in ATR units before invalidating (default: 1.5)" value={settings.tprMaxPullbackAtr ?? 1.5} onChange={(v) => handleFieldChange('tprMaxPullbackAtr', v)} step={0.1} min={0.3} max={4.0} unit="x" />
            <InputRow label="Max Pullback Candles" desc="Setup timeout — max candles to wait in pullback phase (default: 10)" value={settings.tprMaxPullbackCandles ?? 10} onChange={(v) => handleFieldChange('tprMaxPullbackCandles', v)} min={3} max={30} unit="bars" />
            <InputRow label="Retest Tolerance (ATR)" desc="How close to EMA counts as a valid retest in ATR units (default: 0.20)" value={settings.tprRetestToleranceAtr ?? 0.20} onChange={(v) => handleFieldChange('tprRetestToleranceAtr', v)} step={0.05} min={0.05} max={1.0} unit="x" />
            <InputRow label="Min Confirmation Body Ratio" desc="Min body/range ratio for the confirmation candle (default: 0.40 = 40%)" value={settings.tprMinConfBodyRatio ?? 0.40} onChange={(v) => handleFieldChange('tprMinConfBodyRatio', v)} step={0.05} min={0.20} max={0.80} />
            <InputRow label="Max Chase Distance (ATR)" desc="Chase filter: reject if price is too far from EMA after confirmation (default: 0.75)" value={settings.tprMaxChaseAtr ?? 0.75} onChange={(v) => handleFieldChange('tprMaxChaseAtr', v)} step={0.05} min={0.20} max={2.0} unit="x" />
            <InputRow label="Max Confirmation Candle Range (ATR)" desc="Extreme candle filter: reject if confirmation candle range exceeds this ATR multiple (default: 2.0)" value={settings.tprMaxConfCandleAtr ?? 2.0} onChange={(v) => handleFieldChange('tprMaxConfCandleAtr', v)} step={0.1} min={0.5} max={5.0} unit="x" />
            <InputRow label="Min EMA Separation (ATR ratio)" desc="EMA separation filter: |EMA slow - EMA fast| / ATR must be ≥ this value (default: 0.20)" value={settings.tprMinEmaGapAtrRatio ?? 0.20} onChange={(v) => handleFieldChange('tprMinEmaGapAtrRatio', v)} step={0.05} min={0.05} max={1.0} unit="x" />
            <InputRow label="SL ATR Multiple" desc="Stop-loss placed at EMA fast ± SL_ATR × ATR (default: 1.5)" value={settings.tprSlAtrMultiple ?? 1.5} onChange={(v) => handleFieldChange('tprSlAtrMultiple', v)} step={0.1} min={0.5} max={4.0} unit="x" />
            <InputRow label="R:R Ratio" desc="TP2 risk-to-reward ratio (default: 2.0)" value={settings.tprRrRatio ?? 2.0} onChange={(v) => handleFieldChange('tprRrRatio', v)} step={0.1} min={1.0} max={5.0} unit=":1" />
            <InputRow label="Cooldown Candles" desc="Candles to wait after exit or invalidation before looking for new setup (default: 5)" value={settings.tprCooldownCandles ?? 5} onChange={(v) => handleFieldChange('tprCooldownCandles', v)} min={1} max={20} unit="bars" />
            <InputRow label="Setup Timeout Candles" desc="Maximum candles to remain in any pending phase before invalidating (default: 10)" value={settings.tprSetupTimeout ?? 10} onChange={(v) => handleFieldChange('tprSetupTimeout', v)} min={3} max={30} unit="bars" />

            <ToggleRow label="Enable Break-even (+1R)" desc="Move SL to entry when trade reaches +1R" checked={settings.tprBreakevenEnabled !== false} onChange={(v) => handleFieldChange('tprBreakevenEnabled', v)} accentColor="bg-sky-600" />
            <ToggleRow label="Enable Trailing Stop (+1.5R)" desc="Activate ATR-based trailing stop after +1.5R" checked={settings.tprTrailingEnabled !== false} onChange={(v) => handleFieldChange('tprTrailingEnabled', v)} accentColor="bg-sky-600" />
            <ToggleRow label="Allow Long Trades" desc="Allow bullish state machine trades" checked={settings.tprAllowLongs !== false} onChange={(v) => handleFieldChange('tprAllowLongs', v)} accentColor="bg-sky-600" />
            <ToggleRow label="Allow Short Trades" desc="Allow bearish state machine trades" checked={settings.tprAllowShorts !== false} onChange={(v) => handleFieldChange('tprAllowShorts', v)} accentColor="bg-sky-600" />
          </div>
        </div>
      )}

      {/* STRATEGY 5: Range Mean Reversion (BINANCE_COMPOSITE) */}
      {shouldShow('BINANCE_COMPOSITE') && (
        <div className="space-y-4">
          <RangeStrategyConfigPanel
            currentConfig={settings.rangeConfig}
            onChange={(updatedConfig) => {
              handleFieldChange('rangeConfig', updatedConfig);
              if (typeof updatedConfig.adxSoftMax === 'number') handleFieldChange('rmrMaxAdx', updatedConfig.adxSoftMax);
              if (typeof updatedConfig.atrExpansionMax === 'number') handleFieldChange('rmrMaxAtrRatio', updatedConfig.atrExpansionMax);
              if (typeof updatedConfig.minRrRatio === 'number') handleFieldChange('rmrMinRrRatio', updatedConfig.minRrRatio);
              if (typeof updatedConfig.edgeZonePct === 'number') handleFieldChange('rmrOuterRangePct', updatedConfig.edgeZonePct);
            }}
            onSave={async (savedConfig) => {
              handleFieldChange('rangeConfig', savedConfig);
              await fetch('/api/bot/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ rangeConfig: savedConfig }),
              });
            }}
          />
        </div>
      )}

      {/* STRATEGY 7: EMA 5 Price Action Gap + Volume (EMA5_PA_VOLUME_V1) */}
      {shouldShow('EMA5_PA_VOLUME_V1') && (
        <div className="bg-[#161B22] rounded-xl p-5 sm:p-6 border border-amber-500/30 space-y-4 shadow-xl shadow-amber-950/10">
          <div className="flex items-center justify-between border-b border-[#30363D] pb-3 flex-wrap gap-2">
            <div>
              <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                <Flame className="w-4 h-4 text-amber-400" />
                <span>7. EMA 5 Price Action Gap + Volume (EMA5_PA_VOLUME_V1) Parameters</span>
              </h3>
              <p className="text-xs text-gray-400 mt-0.5">Pure price action gap and volume momentum on 5m EMA 5 with 15m structure alignment.</p>
            </div>
            <span className="px-2.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
              PURE PA MOMENTUM
            </span>
          </div>

          <div className="space-y-1">
            <ToggleRow
              label="Enable EMA5_PA_VOLUME_V1 Strategy"
              desc="Allow pure price action gap and volume strategy to run"
              checked={settings.ema5PaEnabled !== false}
              onChange={(v) => handleFieldChange('ema5PaEnabled', v)}
              accentColor="bg-amber-500"
            />

            <div className="flex flex-col sm:flex-row sm:items-center justify-between py-3 border-b border-gray-800/50 gap-4">
              <div className="flex flex-col">
                <span className="text-xs sm:text-sm font-semibold text-gray-200">Engine Version</span>
                <span className="text-[11px] text-gray-500 mt-0.5">Version C (Conservative volume & gap) vs Version D (Aggressive momentum)</span>
              </div>
              <div className="flex bg-gray-900 rounded-lg p-1 border border-gray-700">
                {(['A', 'B', 'C', 'D'] as const).map((ver) => (
                  <button
                    key={ver}
                    type="button"
                    onClick={() => handleFieldChange('ema5PaVersion', ver)}
                    className={`px-3 py-1 rounded text-xs font-bold transition-all cursor-pointer ${
                      (settings.ema5PaVersion || 'C') === ver
                        ? 'bg-amber-600 text-white shadow'
                        : 'text-gray-400 hover:text-gray-200'
                    }`}
                  >
                    Ver {ver}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between py-3 border-b border-gray-800/50 gap-4">
              <div className="flex flex-col">
                <span className="text-xs sm:text-sm font-semibold text-gray-200">Entry Trigger Mode</span>
                <span className="text-[11px] text-gray-500 mt-0.5">MOMENTUM (Instant breakout expansion) vs RETEST (Wait for pullback to EMA)</span>
              </div>
              <div className="flex bg-gray-900 rounded-lg p-1 border border-gray-700">
                {(['MOMENTUM', 'RETEST'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => handleFieldChange('ema5PaEntryMode', mode)}
                    className={`px-3 py-1 rounded text-xs font-bold transition-all cursor-pointer ${
                      (settings.ema5PaEntryMode || 'MOMENTUM') === mode
                        ? 'bg-amber-600 text-white shadow'
                        : 'text-gray-400 hover:text-gray-200'
                    }`}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </div>

            <InputRow label="Min Volume Ratio" desc="Trigger candle volume vs baseline SMA (default: 1.10x)" value={settings.ema5PaMinVolumeRatio ?? 1.10} onChange={(v) => handleFieldChange('ema5PaMinVolumeRatio', v)} step={0.05} min={0.5} max={5.0} unit="x" />
            <InputRow label="Min Gap/Range Ratio" desc="Minimum gap between EMA 5 and candle body vs range (default: 0.20)" value={settings.ema5PaMinGapRangeRatio ?? 0.20} onChange={(v) => handleFieldChange('ema5PaMinGapRangeRatio', v)} step={0.05} min={0.05} max={0.80} />
            <InputRow label="Max Gap/Range Ratio" desc="Maximum allowable gap before rejecting overextended candles (default: 1.00)" value={settings.ema5PaMaxGapRangeRatio ?? 1.00} onChange={(v) => handleFieldChange('ema5PaMaxGapRangeRatio', v)} step={0.05} min={0.50} max={2.50} />
            <InputRow label="Max EMA Crosses in Lookback" desc="Reject consolidating chop if EMA crossed price too frequently (default: 3)" value={settings.ema5PaMaxEmaCrosses ?? 3} onChange={(v) => handleFieldChange('ema5PaMaxEmaCrosses', v)} min={1} max={10} />
            <InputRow label="Min Real Body Ratio" desc="Minimum candle real body / range ratio (default: 0.50 = 50%)" value={settings.ema5PaMinBodyRatio ?? 0.50} onChange={(v) => handleFieldChange('ema5PaMinBodyRatio', v)} step={0.05} min={0.20} max={0.90} />
            <InputRow label="Min Close Location Position" desc="Trigger candle close must sit in top/bottom quartile (default: 0.65)" value={settings.ema5PaMinClosePosition ?? 0.65} onChange={(v) => handleFieldChange('ema5PaMinClosePosition', v)} step={0.05} min={0.40} max={0.95} />
            <InputRow label="Risk:Reward Ratio Target" desc="Fixed structural target multiple vs stop risk (default: 1.5)" value={settings.ema5PaRiskReward ?? 1.5} onChange={(v) => handleFieldChange('ema5PaRiskReward', v)} step={0.1} min={1.0} max={5.0} unit=":1" />

            <ToggleRow label="Enable Breakeven Protection" desc="Move stop to entry price after +1R progress" checked={settings.ema5PaBreakevenEnabled !== false} onChange={(v) => handleFieldChange('ema5PaBreakevenEnabled', v)} accentColor="bg-amber-500" />
            <ToggleRow label="Require 15m Structure Break" desc="Only enter when 15m swing pivot structure is explicitly broken" checked={settings.ema5PaRequireStructureBreak === true} onChange={(v) => handleFieldChange('ema5PaRequireStructureBreak', v)} accentColor="bg-amber-500" />
          </div>
        </div>
      )}

      {/* STRATEGY 8: EMA 5 Rejection Reclaim (EMA5_REJECTION_RECLAIM_V1) */}
      {shouldShow('EMA5_REJECTION_RECLAIM_V1') && (
        <div className="bg-[#161B22] rounded-xl p-5 sm:p-6 border border-teal-500/30 space-y-4 shadow-xl shadow-teal-950/10">
          <div className="flex items-center justify-between border-b border-[#30363D] pb-3 flex-wrap gap-2">
            <div>
              <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                <RotateCcw className="w-4 h-4 text-teal-400" />
                <span>8. EMA 5 Rejection → Reclaim Displacement Parameters</span>
              </h3>
              <p className="text-xs text-gray-400 mt-0.5">Captures false breakout traps: wick rejection beyond 5 EMA followed by impulsive reclaim displacement.</p>
            </div>
            <span className="px-2.5 py-0.5 rounded text-[10px] font-bold bg-teal-500/20 text-teal-300 border border-teal-500/40">
              REJECTION & RECLAIM
            </span>
          </div>

          <div className="space-y-1">
            <ToggleRow
              label="Enable EMA5_REJECTION_RECLAIM_V1 Strategy"
              desc="Allow rejection and reclaim displacement signals to execute"
              checked={settings.errEnabled !== false}
              onChange={(v) => handleFieldChange('errEnabled', v)}
              accentColor="bg-teal-500"
            />
            <InputRow label="EMA Length" desc="EMA baseline for rejection and reclaim detection (default: 5)" value={settings.errEmaLength ?? 5} onChange={(v) => handleFieldChange('errEmaLength', v)} min={3} max={20} />
            <InputRow label="Min Volume Ratio" desc="Reclaim candle volume multiple over moving average (default: 1.10x)" value={settings.errMinVolumeRatio ?? 1.10} onChange={(v) => handleFieldChange('errMinVolumeRatio', v)} step={0.05} min={1.0} max={3.0} unit="x" />
            <InputRow label="Min Rejection Wick/Body Ratio" desc="Minimum rejection wick size relative to candle body (default: 1.0)" value={settings.errMinRejectionWickBodyRatio ?? 1.0} onChange={(v) => handleFieldChange('errMinRejectionWickBodyRatio', v)} step={0.1} min={0.5} max={3.0} />
            <InputRow label="Min Displacement Body Ratio" desc="Minimum real body / candle range for displacement candle (default: 0.50)" value={settings.errMinDisplacementBodyRatio ?? 0.50} onChange={(v) => handleFieldChange('errMinDisplacementBodyRatio', v)} step={0.05} min={0.30} max={0.80} />
            <InputRow label="Min Close Position Value" desc="Displacement candle close position in favorable direction (default: 0.65)" value={settings.errMinClosePosition ?? 0.65} onChange={(v) => handleFieldChange('errMinClosePosition', v)} step={0.05} min={0.50} max={0.90} />
            <InputRow label="Rejection Expiry Window" desc="Max candles between rejection wick and reclaim candle (default: 3 bars)" value={settings.errRejectionExpiryCandles ?? 3} onChange={(v) => handleFieldChange('errRejectionExpiryCandles', v)} min={1} max={10} unit="bars" />
            <InputRow label="Risk:Reward Ratio Target" desc="Fixed structural target multiple vs stop risk (default: 1.5)" value={settings.errRiskReward ?? 1.5} onChange={(v) => handleFieldChange('errRiskReward', v)} step={0.1} min={1.0} max={5.0} unit=":1" />
            <InputRow label="Cooldown Candles" desc="Candles to wait after invalidation or exit before new setup (default: 2)" value={settings.errCooldownCandles ?? 2} onChange={(v) => handleFieldChange('errCooldownCandles', v)} min={1} max={20} unit="bars" />

            <ToggleRow label="Enable Breakeven Protection" desc="Move stop to entry price once trade reaches +1R" checked={settings.errBreakevenEnabled !== false} onChange={(v) => handleFieldChange('errBreakevenEnabled', v)} accentColor="bg-teal-500" />
            <ToggleRow label="Require 15m Structure Break" desc="Require 15m market structure break before displacement entry" checked={settings.errRequireStructureBreak === true} onChange={(v) => handleFieldChange('errRequireStructureBreak', v)} accentColor="bg-teal-500" />
            <ToggleRow label="Allow Reclaim as Displacement" desc="Allow single strong reclaim candle to serve as displacement trigger" checked={settings.errAllowReclaimAsDisplacement === true} onChange={(v) => handleFieldChange('errAllowReclaimAsDisplacement', v)} accentColor="bg-teal-500" />
          </div>
        </div>
      )}

      {/* STRATEGY 9: 5 EMA Gap Pullback (EMA_GAP_PULLBACK) */}
      {shouldShow('EMA_GAP_PULLBACK') && (
        <div className="bg-[#161B22] rounded-xl p-5 sm:p-6 border border-indigo-500/30 space-y-4 shadow-xl shadow-indigo-950/10">
          <div className="flex items-center justify-between border-b border-[#30363D] pb-3 flex-wrap gap-2">
            <div>
              <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                <Zap className="w-4 h-4 text-indigo-400" />
                <span>9. 5 EMA Gap Pullback (Impulse Continuation) Parameters</span>
              </h3>
              <p className="text-xs text-gray-400 mt-0.5">Captures high-velocity trend continuation impulses when price gaps away from 5 EMA with confirmed HTF alignment.</p>
            </div>
            <span className="px-2.5 py-0.5 rounded text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">
              GAP CONTINUATION
            </span>
          </div>

          <div className="space-y-1">
            <ToggleRow
              label="Enable EMA_GAP_PULLBACK Strategy"
              desc="Allow 5 EMA Gap Pullback signals to execute"
              checked={settings.egpEnabled !== false}
              onChange={(v) => handleFieldChange('egpEnabled', v)}
              accentColor="bg-indigo-600"
            />
            <InputRow label="5 EMA Fast Period" desc="Fast moving average period (default: 5)" value={settings.egpEma5Period ?? 5} onChange={(v) => handleFieldChange('egpEma5Period', v)} min={2} max={20} />
            <InputRow label="21 EMA Baseline Period" desc="Slow baseline moving average period (default: 21)" value={settings.egpEma21Period ?? 21} onChange={(v) => handleFieldChange('egpEma21Period', v)} min={10} max={50} />
            <InputRow label="HTF 50 EMA Period" desc="Higher timeframe trend baseline period (default: 50)" value={settings.egpHtfEma50Period ?? 50} onChange={(v) => handleFieldChange('egpHtfEma50Period', v)} min={20} max={200} />
            <InputRow label="Min Pullback Bars" desc="Minimum bars in pullback before gap impulse trigger (default: 3)" value={settings.egpMinPullbackBars ?? 3} onChange={(v) => handleFieldChange('egpMinPullbackBars', v)} min={2} max={15} unit="bars" />
            <InputRow label="Min Gap Body Ratio" desc="Minimum body size relative to range for gap candle (default: 0.40)" value={settings.egpMinGapBodyPct ?? 0.40} onChange={(v) => handleFieldChange('egpMinGapBodyPct', v)} step={0.05} min={0.10} max={0.99} />
            <InputRow label="Gap Volume Multiplier" desc="Impulse candle volume vs baseline SMA (default: 1.20x)" value={settings.egpVolumeMultiplier ?? 1.20} onChange={(v) => handleFieldChange('egpVolumeMultiplier', v)} step={0.1} min={0.5} max={5.0} unit="x" />
            <InputRow label="Max Overextension from 21 EMA (ATR)" desc="Maximum allowable distance from 21 EMA before rejecting as overextended (default: 1.5)" value={settings.egpMaxDistToEma21Atr ?? 1.5} onChange={(v) => handleFieldChange('egpMaxDistToEma21Atr', v)} step={0.1} min={0.2} max={5.0} unit="x" />
            <InputRow label="TP1 R Multiple" desc="Target 1 multiple of initial risk (default: 1.0R)" value={settings.egpTp1RMultiple ?? 1.0} onChange={(v) => handleFieldChange('egpTp1RMultiple', v)} step={0.1} min={0.5} max={5.0} unit="R" />
            <InputRow label="TP2 R Multiple" desc="Target 2 multiple of initial risk (default: 2.0R)" value={settings.egpTp2RMultiple ?? 2.0} onChange={(v) => handleFieldChange('egpTp2RMultiple', v)} step={0.1} min={1.0} max={10.0} unit="R" />
            <InputRow label="TP3 R Multiple" desc="Target 3 structural runner multiple (default: 3.0R)" value={settings.egpTp3RMultiple ?? 3.0} onChange={(v) => handleFieldChange('egpTp3RMultiple', v)} step={0.1} min={1.5} max={15.0} unit="R" />

            <ToggleRow label="Require Real 3R Structural Room" desc="Verify no immediate opposing HTF support/resistance level within 3R distance" checked={settings.egpRequireReal3RRoom === true} onChange={(v) => handleFieldChange('egpRequireReal3RRoom', v)} accentColor="bg-indigo-600" />
            <ToggleRow label="Strict Gap Only Mode" desc="Require price to strictly float completely detached from 5 EMA" checked={settings.egpStrictGapOnly === true} onChange={(v) => handleFieldChange('egpStrictGapOnly', v)} accentColor="bg-indigo-600" />
          </div>
        </div>
      )}

      {/* STRATEGY 6: Early Coil Breakout */}
      {shouldShow('EARLY_COIL_BREAKOUT') && (
        <div className="bg-[#161B22] rounded-xl p-5 sm:p-6 border border-orange-500/30 space-y-4 shadow-xl shadow-orange-950/10">
          <div className="flex items-center justify-between border-b border-[#30363D] pb-3 flex-wrap gap-2">
            <div>
              <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                <Layers className="w-4 h-4 text-orange-400" />
                <span>6. Early Coil Breakout Parameters</span>
              </h3>
              <p className="text-xs text-gray-400 mt-0.5">Detects multi-bar fractal triangular contraction and executes explosive expansion breakouts with high R:R targets.</p>
            </div>
            <span className="px-2.5 py-0.5 rounded text-[10px] font-bold bg-orange-500/20 text-orange-300 border border-orange-500/40">
              FRACTAL COIL SQUEEZE
            </span>
          </div>

          <div className="space-y-1">
            <InputRow
              label="Coil Breakout Minimum R:R Ratio"
              desc="Required structural target multiple relative to coil boundary width (default: 2.0)"
              value={(settings as any)?.coilMinRrRatio ?? 2.0}
              onChange={(v) => handleFieldChange('coilMinRrRatio' as any, v)}
              step={0.5}
              min={1.5}
              max={6.0}
              unit=":1"
            />
            <ToggleRow
              label="Aggressive Breakout Trigger Mode"
              desc="Execute on first closed candle outside coil boundary rather than waiting for multi-bar retest"
              checked={(settings as any)?.coilAggressiveBreakout === true}
              onChange={(v) => handleFieldChange('coilAggressiveBreakout' as any, v)}
              accentColor="bg-orange-500"
            />
          </div>
        </div>
      )}
    </div>
  );
};
