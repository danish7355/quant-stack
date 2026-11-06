import React from 'react';
import { 
  Zap, Flame, TrendingUp, Sliders, ShieldCheck, 
  Layers, Clock, Filter, Activity, BarChart2 
} from 'lucide-react';
import { AppSettings } from '../types';

interface Props {
  settings: AppSettings;
  onUpdateSettings: (settings: AppSettings | Partial<AppSettings>) => void;
  onActivateStrategy?: () => void;
  isActive?: boolean;
}

export const MulticoinScalperControlPanel: React.FC<Props> = ({
  settings,
  onUpdateSettings,
  onActivateStrategy,
  isActive
}) => {
  const safeSettings = (settings || {}) as AppSettings;

  const handleInputChange = (field: keyof AppSettings, value: any) => {
    onUpdateSettings({
      ...safeSettings,
      [field]: value
    });
  };

  const applyProfile = (profile: '5m_SCALP' | '15m_SWING') => {
    if (profile === '5m_SCALP') {
      onUpdateSettings({
        ...safeSettings,
        multicoinProfile: '5m_SCALP',
        multicoinTp1Pct: 0.8,
        multicoinTp2Pct: 1.5,
        multicoinSlAtrMult: 1.5,
        multicoinRiskPerTrade: 0.5,
        multicoinTimeExitMinutes: 20
      });
    } else {
      onUpdateSettings({
        ...safeSettings,
        multicoinProfile: '15m_SWING',
        multicoinTp1Pct: 2.5,
        multicoinTp2Pct: 4.5,
        multicoinSlAtrMult: 2.2,
        multicoinRiskPerTrade: 1.0,
        multicoinTimeExitMinutes: 120
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Preset Profiles */}
      <div className="bg-[#12161E] border border-amber-500/30 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <span className="text-xs font-bold text-amber-300 uppercase tracking-wider block">Active Strategy Profile</span>
          <span className="text-[11px] text-gray-400">Quick-switch between high-frequency scalp and structural swing trading parameters.</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => applyProfile('5m_SCALP')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition border cursor-pointer ${
              safeSettings.multicoinProfile === '5m_SCALP' || !safeSettings.multicoinProfile
                ? 'bg-amber-500 text-black border-amber-400 shadow-sm'
                : 'bg-[#161B22] text-gray-300 border-[#30363D] hover:text-white'
            }`}
          >
            ⚡ 5m Intraday Scalp
          </button>
          <button
            type="button"
            onClick={() => applyProfile('15m_SWING')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition border cursor-pointer ${
              safeSettings.multicoinProfile === '15m_SWING'
                ? 'bg-amber-500 text-black border-amber-400 shadow-sm'
                : 'bg-[#161B22] text-gray-300 border-[#30363D] hover:text-white'
            }`}
          >
            🌊 15m Swing Trend
          </button>
        </div>
      </div>

      {/* 1. Top 100 Liquidity & Altcoin Filters */}
      <div className="bg-[#0E1117] border border-[#30363D] rounded-xl p-4 space-y-3">
        <div className="flex items-center space-x-2 border-b border-[#30363D] pb-2">
          <Filter className="w-4 h-4 text-amber-400" />
          <h4 className="text-xs font-bold text-gray-200 uppercase tracking-wider">1. Top 100 Liquidity & Spread Filters</h4>
        </div>
        <p className="text-[11px] text-gray-400 leading-relaxed">
          Protects against illiquid micro-caps, excessive bid-ask slippage, and stablecoin pairs.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-3 bg-[#161B22] rounded-lg border border-[#30363D]">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-bold text-white">Filter Stables</span>
              <input
                type="checkbox"
                checked={safeSettings.multicoinFilterStables ?? true}
                onChange={(e) => handleInputChange('multicoinFilterStables', e.target.checked)}
                className="w-4 h-4 rounded text-amber-500"
              />
            </div>
            <span className="text-[10px] text-gray-400">Excludes USDC, BUSD, DAI, FDUSD, etc.</span>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-300 block mb-1">Min 24h Volume (USDT)</label>
            <input
              type="number"
              value={safeSettings.multicoinMin24hVolumeUsdt ?? 20000000}
              onChange={(e) => handleInputChange('multicoinMin24hVolumeUsdt', parseFloat(e.target.value) || 20000000)}
              className="w-full bg-[#161B22] border border-[#30363D] rounded px-3 py-1.5 text-xs text-gray-200 font-mono focus:outline-none focus:border-amber-500"
            />
            <span className="text-[10px] text-gray-500 mt-0.5 block">Minimum volume floor (default: 20M)</span>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-300 block mb-1">Max Spread %</label>
            <input
              type="number"
              step="0.01"
              value={safeSettings.multicoinMaxSpreadPct ?? 0.08}
              onChange={(e) => handleInputChange('multicoinMaxSpreadPct', parseFloat(e.target.value) || 0.08)}
              className="w-full bg-[#161B22] border border-[#30363D] rounded px-3 py-1.5 text-xs text-gray-200 font-mono focus:outline-none focus:border-amber-500"
            />
            <span className="text-[10px] text-gray-500 mt-0.5 block">Rejects pairs with wide spreads (default: 0.08%)</span>
          </div>
        </div>
      </div>

      {/* 2. EMA Ribbon & Momentum Stacks */}
      <div className="bg-[#0E1117] border border-[#30363D] rounded-xl p-4 space-y-3">
        <div className="flex items-center space-x-2 border-b border-[#30363D] pb-2">
          <TrendingUp className="w-4 h-4 text-orange-400" />
          <h4 className="text-xs font-bold text-gray-200 uppercase tracking-wider">2. EMA Ribbon & Session VWAP</h4>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="text-xs font-semibold text-gray-300 block mb-1">Fast EMA (Trigger)</label>
            <input
              type="number"
              value={safeSettings.multicoinEmaFast ?? 9}
              onChange={(e) => handleInputChange('multicoinEmaFast', parseInt(e.target.value) || 9)}
              className="w-full bg-[#161B22] border border-[#30363D] rounded px-3 py-1.5 text-xs text-gray-200 font-mono focus:outline-none focus:border-amber-500"
            />
            <span className="text-[10px] text-gray-500 mt-0.5 block">Leading trigger EMA (default: 9)</span>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-300 block mb-1">Mid EMA (Support)</label>
            <input
              type="number"
              value={safeSettings.multicoinEmaMid ?? 21}
              onChange={(e) => handleInputChange('multicoinEmaMid', parseInt(e.target.value) || 21)}
              className="w-full bg-[#161B22] border border-[#30363D] rounded px-3 py-1.5 text-xs text-gray-200 font-mono focus:outline-none focus:border-amber-500"
            />
            <span className="text-[10px] text-gray-500 mt-0.5 block">Intermediate momentum baseline (default: 21)</span>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-300 block mb-1">Slow EMA (Trend Anchor)</label>
            <input
              type="number"
              value={safeSettings.multicoinEmaSlow ?? 55}
              onChange={(e) => handleInputChange('multicoinEmaSlow', parseInt(e.target.value) || 55)}
              className="w-full bg-[#161B22] border border-[#30363D] rounded px-3 py-1.5 text-xs text-gray-200 font-mono focus:outline-none focus:border-amber-500"
            />
            <span className="text-[10px] text-gray-500 mt-0.5 block">Anchor structural boundary (default: 55)</span>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          <div className="p-3 bg-[#161B22] rounded-lg border border-[#30363D]">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-bold text-white">Require Session VWAP Alignment</span>
              <input
                type="checkbox"
                checked={safeSettings.multicoinRequireVwap ?? true}
                onChange={(e) => handleInputChange('multicoinRequireVwap', e.target.checked)}
                className="w-4 h-4 rounded text-amber-500"
              />
            </div>
            <span className="text-[10px] text-gray-400">Longs must be above VWAP; Shorts must be below</span>
          </div>
          <div className="p-3 bg-[#161B22] rounded-lg border border-[#30363D]">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-bold text-white">HTF 89/200 EMA Filter</span>
              <input
                type="checkbox"
                checked={safeSettings.multicoinUseHtfFilter ?? true}
                onChange={(e) => handleInputChange('multicoinUseHtfFilter', e.target.checked)}
                className="w-4 h-4 rounded text-amber-500"
              />
            </div>
            <span className="text-[10px] text-gray-400">Verifies macro 1H/4H trend alignment</span>
          </div>
        </div>
      </div>

      {/* 3. Dynamic ATR Stops & Multi-tier Profit Taking */}
      <div className="bg-[#0E1117] border border-[#30363D] rounded-xl p-4 space-y-3">
        <div className="flex items-center space-x-2 border-b border-[#30363D] pb-2">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <h4 className="text-xs font-bold text-gray-200 uppercase tracking-wider">3. Risk Management & Profit Targets</h4>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="text-xs font-semibold text-gray-300 block mb-1">Take Profit 1 (%)</label>
            <input
              type="number"
              step="0.1"
              value={safeSettings.multicoinTp1Pct ?? 0.8}
              onChange={(e) => handleInputChange('multicoinTp1Pct', parseFloat(e.target.value) || 0.8)}
              className="w-full bg-[#161B22] border border-[#30363D] rounded px-3 py-1.5 text-xs text-gray-200 font-mono focus:outline-none focus:border-amber-500"
            />
            <span className="text-[10px] text-gray-500 mt-0.5 block">TP1 partial close (default: 0.8%)</span>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-300 block mb-1">Take Profit 2 (%)</label>
            <input
              type="number"
              step="0.1"
              value={safeSettings.multicoinTp2Pct ?? 1.5}
              onChange={(e) => handleInputChange('multicoinTp2Pct', parseFloat(e.target.value) || 1.5)}
              className="w-full bg-[#161B22] border border-[#30363D] rounded px-3 py-1.5 text-xs text-gray-200 font-mono focus:outline-none focus:border-amber-500"
            />
            <span className="text-[10px] text-gray-500 mt-0.5 block">TP2 full target (default: 1.5%)</span>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-300 block mb-1">Stop Loss (ATR Multiplier)</label>
            <input
              type="number"
              step="0.1"
              value={safeSettings.multicoinSlAtrMult ?? 1.5}
              onChange={(e) => handleInputChange('multicoinSlAtrMult', parseFloat(e.target.value) || 1.5)}
              className="w-full bg-[#161B22] border border-[#30363D] rounded px-3 py-1.5 text-xs text-gray-200 font-mono focus:outline-none focus:border-amber-500"
            />
            <span className="text-[10px] text-gray-500 mt-0.5 block">Buffer beyond EMA 55 / VWAP (default: 1.5x)</span>
          </div>
        </div>
      </div>
    </div>
  );
};
