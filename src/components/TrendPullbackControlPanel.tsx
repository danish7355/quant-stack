import React from 'react';
import { 
  Target, TrendingUp, Clock, ShieldCheck, Zap, Layers, 
  BarChart2, Activity, Sliders, CheckCircle2, ChevronRight, Info
} from 'lucide-react';
import { AppSettings } from '../types';
import { SchemaSettingsGroup } from './SchemaSettingsGroup';

interface Props {
  settings: AppSettings;
  onUpdateSettings: (settings: AppSettings | Partial<AppSettings>) => void;
  onActivateStrategy?: () => void;
  isActive?: boolean;
}

export const TrendPullbackControlPanel: React.FC<Props> = ({
  settings,
  onUpdateSettings,
  onActivateStrategy,
  isActive
}) => {
  const safeSettings = (settings || {}) as AppSettings;

  const handleInputChange = (field: keyof AppSettings | string, value: any) => {
    onUpdateSettings({
      ...safeSettings,
      [field]: value
    });
  };

  return (
    <div className="space-y-6">
      {/* 1. Multi-Timeframe Alignment & Regimes */}
      <div className="bg-[#0E1117] border border-[#30363D] rounded-xl p-4 space-y-3">
        <div className="flex items-center space-x-2 border-b border-[#30363D] pb-2">
          <Clock className="w-4 h-4 text-emerald-400" />
          <h4 className="text-xs font-bold text-gray-200 uppercase tracking-wider">1. Multi-Timeframe Alignment & Regimes</h4>
        </div>
        <p className="text-[11px] text-gray-400 leading-relaxed">
          Adapts fully to any configurable intraday timeframe (5m or 15m). Signals only trigger when higher timeframe structure agrees with the trade direction.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
          <div>
            <label className="text-xs font-bold text-gray-300 block mb-1">Execution Timeframe</label>
            <select
              value={safeSettings.tpExecutionTimeframe || '15m'}
              onChange={(e) => handleInputChange('tpExecutionTimeframe', e.target.value)}
              className="w-full bg-[#161B22] border border-[#30363D] rounded px-3 py-1.5 text-xs text-gray-200 font-mono focus:outline-none focus:border-emerald-500 cursor-pointer"
            >
              <option value="3m">3m (High-Frequency Intraday)</option>
              <option value="5m">5m (Active Intraday)</option>
              <option value="15m">15m (Recommended Standard)</option>
              <option value="30m">30m (Swing-Day)</option>
              <option value="1H">1H (Major Intraday)</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-gray-300 block mb-1">Higher Timeframe (HTF)</label>
            <select
              value={safeSettings.tpHigherTimeframe || '1H'}
              onChange={(e) => handleInputChange('tpHigherTimeframe', e.target.value)}
              className="w-full bg-[#161B22] border border-[#30363D] rounded px-3 py-1.5 text-xs text-gray-200 font-mono focus:outline-none focus:border-emerald-500 cursor-pointer"
            >
              <option value="15m">15m</option>
              <option value="30m">30m</option>
              <option value="1H">1H (Standard)</option>
              <option value="4H">4H (Macro Trend Filter)</option>
              <option value="1D">1D (Daily Structural Bias)</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-gray-300 block mb-1">Entry Execution Mode</label>
            <select
              value={safeSettings.tpEntryMode || 'BALANCED'}
              onChange={(e) => handleInputChange('tpEntryMode', e.target.value)}
              className="w-full bg-[#161B22] border border-[#30363D] rounded px-3 py-1.5 text-xs text-gray-200 font-mono focus:outline-none focus:border-emerald-500 cursor-pointer"
            >
              <option value="BALANCED">Balanced (Confirmed Bar + Retest)</option>
              <option value="BREAK_RETEST">Break & Retest (Conservative)</option>
              <option value="EARLY_CONFIRMATION">Early Confirmation (Aggressive)</option>
            </select>
          </div>
        </div>
      </div>

      {/* 2. Moving Averages & Trend Strength */}
      <div className="bg-[#0E1117] border border-[#30363D] rounded-xl p-4 space-y-3">
        <div className="flex items-center space-x-2 border-b border-[#30363D] pb-2">
          <TrendingUp className="w-4 h-4 text-cyan-400" />
          <h4 className="text-xs font-bold text-gray-200 uppercase tracking-wider">2. Moving Averages & Trend Strength</h4>
        </div>
        <p className="text-[11px] text-gray-400 leading-relaxed">
          Identifies clear bull/bear momentum. Requires Fast EMA &gt; Slow EMA &gt; 200 EMA for longs, and ADX above threshold to reject non-trending chop.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="text-xs font-semibold text-gray-300 block mb-1">Fast EMA Period</label>
            <input
              type="number"
              value={safeSettings.tpFastEma ?? 20}
              onChange={(e) => handleInputChange('tpFastEma', parseInt(e.target.value) || 20)}
              className="w-full bg-[#161B22] border border-[#30363D] rounded px-3 py-1.5 text-xs text-gray-200 font-mono focus:outline-none focus:border-emerald-500"
            />
            <span className="text-[10px] text-gray-500 mt-0.5 block">Leading momentum baseline (default: 20)</span>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-300 block mb-1">Slow EMA Period</label>
            <input
              type="number"
              value={safeSettings.tpSlowEma ?? 50}
              onChange={(e) => handleInputChange('tpSlowEma', parseInt(e.target.value) || 50)}
              className="w-full bg-[#161B22] border border-[#30363D] rounded px-3 py-1.5 text-xs text-gray-200 font-mono focus:outline-none focus:border-emerald-500"
            />
            <span className="text-[10px] text-gray-500 mt-0.5 block">Secondary pullback support (default: 50)</span>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-300 block mb-1">Trend EMA Period</label>
            <input
              type="number"
              value={safeSettings.tpTrendEma ?? 200}
              onChange={(e) => handleInputChange('tpTrendEma', parseInt(e.target.value) || 200)}
              className="w-full bg-[#161B22] border border-[#30363D] rounded px-3 py-1.5 text-xs text-gray-200 font-mono focus:outline-none focus:border-emerald-500"
            />
            <span className="text-[10px] text-gray-500 mt-0.5 block">Macro directional baseline (default: 200)</span>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          <div>
            <label className="text-xs font-semibold text-gray-300 block mb-1">ADX Lookback Period</label>
            <input
              type="number"
              value={safeSettings.tpAdxPeriod ?? 14}
              onChange={(e) => handleInputChange('tpAdxPeriod', parseInt(e.target.value) || 14)}
              className="w-full bg-[#161B22] border border-[#30363D] rounded px-3 py-1.5 text-xs text-gray-200 font-mono focus:outline-none focus:border-emerald-500"
            />
            <span className="text-[10px] text-gray-500 mt-0.5 block">Directional index length (default: 14)</span>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-300 block mb-1">Minimum ADX Threshold</label>
            <input
              type="number"
              value={safeSettings.tpAdxThreshold ?? 25}
              onChange={(e) => handleInputChange('tpAdxThreshold', parseInt(e.target.value) || 25)}
              className="w-full bg-[#161B22] border border-[#30363D] rounded px-3 py-1.5 text-xs text-gray-200 font-mono focus:outline-none focus:border-emerald-500"
            />
            <span className="text-[10px] text-gray-500 mt-0.5 block">Rejects chop below this value (default: 25)</span>
          </div>
        </div>
      </div>

      {/* 3. Retest & Structural Filters */}
      <div className="bg-[#0E1117] border border-[#30363D] rounded-xl p-4 space-y-3">
        <div className="flex items-center space-x-2 border-b border-[#30363D] pb-2">
          <Layers className="w-4 h-4 text-amber-400" />
          <h4 className="text-xs font-bold text-gray-200 uppercase tracking-wider">3. Retest Behavior & Confirmation</h4>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-3 bg-[#161B22] rounded-lg border border-[#30363D]">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-bold text-white">Dangerous Retest Early Exit</span>
              <input
                type="checkbox"
                checked={safeSettings.tpDangerousRetestEarlyExit ?? true}
                onChange={(e) => handleInputChange('tpDangerousRetestEarlyExit', e.target.checked)}
                className="w-4 h-4 rounded text-emerald-500"
              />
            </div>
            <span className="text-[10px] text-gray-400">Exits early if strong opposing volume invalidates retest</span>
          </div>
          <div className="p-3 bg-[#161B22] rounded-lg border border-[#30363D]">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-bold text-white">Breakeven During Retest</span>
              <input
                type="checkbox"
                checked={safeSettings.tpAllowBreakevenDuringRetest ?? false}
                onChange={(e) => handleInputChange('tpAllowBreakevenDuringRetest', e.target.checked)}
                className="w-4 h-4 rounded text-emerald-500"
              />
            </div>
            <span className="text-[10px] text-gray-400">Prevents premature breakeven moves during natural noise</span>
          </div>
          <div className="p-3 bg-[#161B22] rounded-lg border border-[#30363D]">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-bold text-white">Broad Structural Stop</span>
              <input
                type="checkbox"
                checked={safeSettings.tpAllowBroadStructuralStop ?? false}
                onChange={(e) => handleInputChange('tpAllowBroadStructuralStop', e.target.checked)}
                className="w-4 h-4 rounded text-emerald-500"
              />
            </div>
            <span className="text-[10px] text-gray-400">Allows stops to anchor behind major swing high/low</span>
          </div>
        </div>
      </div>

      {/* 4. Risk Controls & Asymmetric Targets */}
      <div className="bg-[#0E1117] border border-[#30363D] rounded-xl p-4 space-y-3">
        <div className="flex items-center space-x-2 border-b border-[#30363D] pb-2">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <h4 className="text-xs font-bold text-gray-200 uppercase tracking-wider">4. Invalidation Stop-Loss & Profit Targets</h4>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="text-xs font-semibold text-gray-300 block mb-1">Minimum R:R Ratio</label>
            <input
              type="number"
              step="0.1"
              value={safeSettings.tpMinRiskRewardRatio ?? 2.0}
              onChange={(e) => handleInputChange('tpMinRiskRewardRatio', parseFloat(e.target.value) || 2.0)}
              className="w-full bg-[#161B22] border border-[#30363D] rounded px-3 py-1.5 text-xs text-gray-200 font-mono focus:outline-none focus:border-emerald-500"
            />
            <span className="text-[10px] text-gray-500 mt-0.5 block">Hard minimum profit to risk ratio (default: 2.0)</span>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-300 block mb-1">Stop Loss Buffer (ATR)</label>
            <input
              type="number"
              step="0.05"
              value={safeSettings.tpStructuralStopBufferAtr ?? 0.20}
              onChange={(e) => handleInputChange('tpStructuralStopBufferAtr', parseFloat(e.target.value) || 0.20)}
              className="w-full bg-[#161B22] border border-[#30363D] rounded px-3 py-1.5 text-xs text-gray-200 font-mono focus:outline-none focus:border-emerald-500"
            />
            <span className="text-[10px] text-gray-500 mt-0.5 block">Wiggle room beyond structural swing (default: 0.20x ATR)</span>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-300 block mb-1">Retest Tolerance (ATR)</label>
            <input
              type="number"
              step="0.1"
              value={safeSettings.tpRetestToleranceAtr ?? 0.5}
              onChange={(e) => handleInputChange('tpRetestToleranceAtr', parseFloat(e.target.value) || 0.5)}
              className="w-full bg-[#161B22] border border-[#30363D] rounded px-3 py-1.5 text-xs text-gray-200 font-mono focus:outline-none focus:border-emerald-500"
            />
            <span className="text-[10px] text-gray-500 mt-0.5 block">Maximum penetration depth into zone (default: 0.5x ATR)</span>
          </div>
        </div>
      </div>

      {/* 5. Complete Schema Gates: EMA separation, doji, rejection wick, upper-wick veto, overextension ATR, target R */}
      <div className="bg-[#0E1117] border border-teal-500/30 rounded-xl p-4 space-y-3">
        <div className="flex items-center space-x-2 border-b border-[#30363D] pb-2">
          <Sliders className="w-4 h-4 text-teal-400" />
          <h4 className="text-xs font-bold text-gray-200 uppercase tracking-wider">
            5. Trend Pullback Schema Gates &amp; Thresholds
          </h4>
        </div>
        <SchemaSettingsGroup
          group="TrendPullback"
          settings={safeSettings as any}
          onUpdateSetting={handleInputChange}
        />
      </div>
    </div>
  );
};
