import React, { useState } from 'react';
import { AppSettings } from '../types';
import { GATES_REGISTRY, GateImportance } from '../utils/gatesRegistry';
import { ShieldAlert, ShieldCheck, Zap, AlertTriangle, Flame, Info, Check, Cpu, Sparkles } from 'lucide-react';

interface StrategyPanelProps {
  settings: AppSettings;
  setSettings: (s: AppSettings) => void;
}

const StrategyPanel: React.FC<StrategyPanelProps> = ({ settings, setSettings }) => {
  const [expandedGateId, setExpandedGateId] = useState<string | null>(null);

  const handleInputChange = (field: keyof AppSettings, value: any) => {
    setSettings({ ...settings, [field]: value });
  };

  const handleToggleGate = (gateId: string) => {
    const currentDisabled = { ...(settings.disabledGates || {}) };
    if (currentDisabled[gateId]) {
      delete currentDisabled[gateId];
    } else {
      currentDisabled[gateId] = true;
    }
    setSettings({
      ...settings,
      disabledGates: currentDisabled,
    });
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
        
        {/* Active Strategy Selector */}
        <div className="bg-[#161B22] rounded-xl p-6 border border-[#30363D] space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h3 className="text-base font-bold text-white">Active Strategy Selection</h3>
              <p className="text-xs text-gray-400 mt-0.5">Select a specialized strategy or enable automatic regime-adaptive strategy selection.</p>
            </div>
          </div>

          {/* Featured Auto-Regime Button */}
          <button
            onClick={() => handleInputChange('activeStrategy', 'AUTO_REGIME')}
            className={`w-full p-4 rounded-xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 transition-all cursor-pointer text-left ${
              settings.activeStrategy === 'AUTO_REGIME' 
                ? 'border-purple-500 bg-purple-950/40 text-purple-200 shadow-lg shadow-purple-950/40' 
                : 'border-purple-900/40 bg-gray-900/90 text-gray-300 hover:border-purple-700'
            }`}
          >
            <div className="flex items-start sm:items-center gap-3">
              <div className={`p-2.5 rounded-lg ${settings.activeStrategy === 'AUTO_REGIME' ? 'bg-purple-500/20 text-purple-400' : 'bg-gray-800 text-purple-400'}`}>
                <Cpu className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm text-white">Auto-Select by Market Regime</span>
                  <span className="px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 text-[10px] font-bold">
                    RECOMMENDED • HIGHEST EV
                  </span>
                </div>
                <div className="text-xs text-gray-400 mt-1">
                  Dynamically detects market condition per coin (Trending, Consolidation Squeeze, Exhaustion Climax) and deploys the optimal strategy. Displays active strategy on each position card and in Telegram alerts.
                </div>
              </div>
            </div>
            <span className={`text-xs font-bold px-3 py-1.5 rounded-lg border whitespace-nowrap self-end sm:self-center ${
              settings.activeStrategy === 'AUTO_REGIME'
                ? 'bg-purple-600 text-white border-purple-400'
                : 'bg-gray-800 text-gray-400 border-gray-700'
            }`}>
              {settings.activeStrategy === 'AUTO_REGIME' ? 'ACTIVE' : 'SELECT AUTO'}
            </span>
          </button>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <button
              onClick={() => handleInputChange('activeStrategy', 'BINANCE_COMPOSITE')}
              className={`p-4 rounded-xl border flex flex-col items-start justify-between gap-2 transition-all cursor-pointer text-left ${
                settings.activeStrategy === 'BINANCE_COMPOSITE' 
                  ? 'border-[#00e696] bg-[#00e696]/10 text-[#00e696]' 
                  : 'border-[#30363D] bg-[#161B22] text-gray-400 hover:border-gray-500'
              }`}
            >
              <div className="font-bold text-sm">Composite 10-Gate</div>
              <div className="text-[11px] opacity-80 leading-relaxed">Multi-indicator trend scoring (EMA stacking, ADX, RSI, Volume)</div>
            </button>
            <button
              onClick={() => handleInputChange('activeStrategy', 'DELTA_CLIMAX')}
              className={`p-4 rounded-xl border flex flex-col items-start justify-between gap-2 transition-all cursor-pointer text-left ${
                settings.activeStrategy === 'DELTA_CLIMAX' 
                  ? 'border-[#00e696] bg-[#00e696]/10 text-[#00e696]' 
                  : 'border-[#30363D] bg-[#161B22] text-gray-400 hover:border-gray-500'
              }`}
            >
              <div className="font-bold text-sm">Delta Climax Reversal</div>
              <div className="text-[11px] opacity-80 leading-relaxed">Capitulation candle & wick rejection mean-reversion algorithm</div>
            </button>
            <button
              onClick={() => handleInputChange('activeStrategy', 'VOLATILITY_COMPRESSION')}
              className={`p-4 rounded-xl border flex flex-col items-start justify-between gap-2 transition-all cursor-pointer text-left ${
                settings.activeStrategy === 'VOLATILITY_COMPRESSION' 
                  ? 'border-[#00e696] bg-[#00e696]/10 text-[#00e696]' 
                  : 'border-[#30363D] bg-[#161B22] text-gray-400 hover:border-gray-500'
              }`}
            >
              <div className="font-bold text-sm">VCB Breakout + Price Action</div>
              <div className="text-[11px] opacity-80 leading-relaxed">Squeeze release with Spring/Upthrust & Buildup Price Action filters</div>
            </button>


            <button
              onClick={() => handleInputChange('activeStrategy', 'TREND_PULLBACK')}
              className={`p-4 rounded-xl border flex flex-col items-start justify-between gap-2 transition-all cursor-pointer text-left ${
                settings.activeStrategy === 'TREND_PULLBACK' 
                  ? 'border-blue-400 bg-blue-400/10 text-blue-400' 
                  : 'border-[#30363D] bg-[#161B22] text-gray-400 hover:border-gray-500'
              }`}
            >
              <div className="font-bold text-sm">Trend Pullback</div>
              <div className="text-[11px] opacity-80 leading-relaxed">Rides macro trend, enters on pullback rejection at moving averages</div>
            </button>

            {/* SMC Liquidity Sweep */}
            <button
              onClick={() => handleInputChange('activeStrategy', 'SMC_LIQUIDITY_SWEEP')}
              className={`p-4 rounded-xl border text-left transition-all hover:border-cyan-500/50 ${
                settings.activeStrategy === 'SMC_LIQUIDITY_SWEEP' 
                  ? 'bg-[#1F2937] border-cyan-500/80' 
                  : 'bg-[#161B22] border-[#30363D] hover:border-gray-500'
              }`}
            >
              <div className="flex justify-between items-start mb-3">
                <div className={`p-2.5 rounded-lg ${settings.activeStrategy === 'SMC_LIQUIDITY_SWEEP' ? 'bg-cyan-500/20 text-cyan-400' : 'bg-gray-800 text-cyan-400'}`}>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                {settings.activeStrategy === 'SMC_LIQUIDITY_SWEEP' && (
                  <span className="flex items-center gap-1 text-[10px] font-bold tracking-wider text-cyan-400 bg-cyan-500/10 px-2 py-1 rounded-md uppercase">
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse"></span>
                    ACTIVE
                  </span>
                )}
              </div>
              <div className={`font-bold text-sm mb-1 ${settings.activeStrategy === 'SMC_LIQUIDITY_SWEEP' ? 'text-white' : 'text-gray-300'}`}>
                SMC + Liquidity Sweeps
              </div>
              <div className="text-[11px] opacity-80 leading-relaxed">
                Maps 1H Liquidity Pools, hunts for 15m stop sweeps, confirms MSS and queues Limit entries at FVG.
              </div>
            </button>

          </div>
        </div>

        {/* Trade Frequency & Execution Sensitivity Selector */}
        <div className="bg-[#161B22] rounded-xl p-6 border border-[#30363D] space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Zap className="w-5 h-5 text-indigo-400" />
                Execution Mode & Target Ratio
              </h3>
              <p className="text-xs text-gray-400 mt-0.5">
                Optimized for high-confidence setups with tight stop loss and asymmetric 1:3 targets (~4-5 trades/day).
              </p>
            </div>
            <span className="text-xs font-bold text-indigo-400 bg-indigo-950/40 border border-indigo-800/50 px-2.5 py-1 rounded w-fit">
              Current: {(settings.tradeFrequency || 'LOW')} Mode (1:3 Target)
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
            {/* Confirmed 1:3 Sniper (Recommended) */}
            <button
              type="button"
              onClick={() => {
                setSettings({
                  ...settings,
                  tradeFrequency: 'LOW',
                  autoTradeThreshold: 75,
                  disabledGates: {}
                });
              }}
              className={`p-4 rounded-xl border flex flex-col items-start text-left gap-2 transition-all cursor-pointer relative ${
                (settings.tradeFrequency || 'LOW') === 'LOW'
                  ? 'border-indigo-500 bg-indigo-950/40 text-indigo-200 ring-1 ring-indigo-400/50'
                  : 'border-gray-700 bg-gray-900/80 text-gray-400 hover:border-gray-600'
              }`}
            >
              <div className="flex items-center justify-between w-full">
                <span className="font-bold text-xs uppercase tracking-wider text-indigo-300">🛡️ 1:3 Sniper (Confirmed)</span>
                <span className="text-[9px] bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 px-1.5 py-0.2 rounded font-bold">RECOMMENDED</span>
              </div>
              <p className="text-[11px] opacity-90 leading-relaxed">
                Fully confirmed high-conviction trades. Requires 100% gate alignment, Score ≥ 75, tight SL (1R) and 1:3 asymmetric target (~4-5 trades/day).
              </p>
            </button>

            {/* Medium / Balanced */}
            <button
              type="button"
              onClick={() => {
                setSettings({
                  ...settings,
                  tradeFrequency: 'MEDIUM',
                  autoTradeThreshold: 60,
                  disabledGates: {
                    COMPOSITE_g6: true,
                    COMPOSITE_g7: true,
                    CR_stopDistance: true
                  }
                });
              }}
              className={`p-4 rounded-xl border flex flex-col items-start text-left gap-2 transition-all cursor-pointer ${
                settings.tradeFrequency === 'MEDIUM'
                  ? 'border-teal-400 bg-teal-950/30 text-teal-200'
                  : 'border-gray-700 bg-gray-900/80 text-gray-400 hover:border-gray-600'
              }`}
            >
              <div className="flex items-center justify-between w-full">
                <span className="font-bold text-xs uppercase tracking-wider text-teal-300">🎯 Medium (Balanced)</span>
                {settings.tradeFrequency === 'MEDIUM' && <Check className="w-4 h-4 text-teal-400" />}
              </div>
              <p className="text-[11px] opacity-80 leading-relaxed">
                Balanced frequency. Bypasses secondary RSI noise filters with Score ≥ 60 for moderate signal flow.
              </p>
            </button>

            {/* High / Aggressive */}
            <button
              type="button"
              onClick={() => {
                setSettings({
                  ...settings,
                  tradeFrequency: 'HIGH',
                  autoTradeThreshold: 50,
                  disabledGates: {
                    COMPOSITE_g6: true,
                    COMPOSITE_g7: true,
                    COMPOSITE_g8: true,
                    CR_volatility: true,
                    CR_stopDistance: true
                  }
                });
              }}
              className={`p-4 rounded-xl border flex flex-col items-start text-left gap-2 transition-all cursor-pointer ${
                settings.tradeFrequency === 'HIGH'
                  ? 'border-rose-500 bg-rose-950/30 text-rose-200'
                  : 'border-gray-700 bg-gray-900/80 text-gray-400 hover:border-gray-600'
              }`}
            >
              <div className="flex items-center justify-between w-full">
                <span className="font-bold text-xs uppercase tracking-wider text-rose-300">🚀 High (Aggressive)</span>
                {settings.tradeFrequency === 'HIGH' && <Check className="w-4 h-4 text-rose-400" />}
              </div>
              <p className="text-[11px] opacity-80 leading-relaxed">
                High-speed scalping. Enters on rapid momentum breaks with Score ≥ 50 for very active markets.
              </p>
            </button>
          </div>
        </div>

        {/* Strategy-Wise Gate Management Section */}
        <div className="bg-[#161B22] rounded-xl p-6 border border-[#30363D] space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-gray-700 pb-3">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
                Strategy Execution Gates & Bypass Controls
              </h3>
              <p className="text-xs text-gray-400 mt-0.5">
                Enable or bypass individual logic gates for the current {settings.activeStrategy} strategy.
              </p>
            </div>
            <div className="text-xs text-purple-400 font-bold bg-purple-950/30 border border-purple-800/40 px-2.5 py-1 rounded">
              {Object.keys(settings.disabledGates || {}).length} Gates Bypassed
            </div>
          </div>

          <div className="space-y-3">
            {strategyGates.map((gate) => {
              const isBypassed = !!settings.disabledGates?.[gate.id];
              const isExpanded = expandedGateId === gate.id;

              return (
                <div
                  key={gate.id}
                  className={`border rounded-lg p-3.5 transition ${
                    isBypassed ? 'bg-purple-950/10 border-purple-800/50' : 'bg-gray-900/60 border-gray-800'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-gray-200 text-xs">{gate.name}</span>
                        {getImportanceBadge(gate.importance, gate.importanceScore)}
                        <span className="text-[10px] text-gray-500 font-semibold uppercase">
                          {gate.isMandatory ? 'Mandatory' : 'Confirmation'}
                        </span>
                      </div>
                      <div className="text-[11px] text-gray-400">{gate.description}</div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <button
                        onClick={() => setExpandedGateId(isExpanded ? null : gate.id)}
                        className="text-[11px] text-blue-400 hover:text-blue-300 underline cursor-pointer"
                      >
                        {isExpanded ? 'Hide Hazard' : 'View Risk'}
                      </button>

                      <button
                        onClick={() => handleToggleGate(gate.id)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer border ${
                          isBypassed
                            ? 'bg-purple-600/30 text-purple-300 border-purple-500 hover:bg-purple-600/40'
                            : 'bg-emerald-950/30 text-emerald-300 border-emerald-800 hover:bg-emerald-950/50'
                        }`}
                      >
                        {isBypassed ? '⚡ Bypassed' : '✓ Enforcing'}
                      </button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="mt-3 pt-3 border-t border-gray-800 text-[11px] space-y-1 bg-gray-950/40 p-2.5 rounded">
                      <div className="text-gray-300">
                        <strong className="text-gray-400">Condition:</strong> {gate.formulaOrCondition}
                      </div>
                      <div className="text-rose-400">
                        <strong className="text-rose-300">Hazard if bypassed:</strong> {gate.riskIfBypassed}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Strategy Specific Parameters */}
        {settings.activeStrategy === 'DELTA_CLIMAX' && (
          <div className="bg-gray-800/30 rounded-xl p-6 border border-gray-700/50">
            <h3 className="text-base font-bold text-white mb-4">Climax Reversal Fine-Tuning Parameters</h3>
            <InputRow label="Climax Lookback" desc="Candles used to judge climax" value={settings.crClimaxLookback} onChange={(v: any) => handleInputChange('crClimaxLookback', v)} />
            <InputRow label="EMA Baseline" desc="EMA Baseline Period" value={settings.crEmaBaseline} onChange={(v: any) => handleInputChange('crEmaBaseline', v)} />
            <InputRow label="ATR Period" desc="Period for ATR calculation" value={settings.crAtrPeriod} onChange={(v: any) => handleInputChange('crAtrPeriod', v)} />
            <InputRow label="Min Overextension ATR" desc="Multiple of ATR for overextension" value={settings.crMinOverextensionAtr} onChange={(v: any) => handleInputChange('crMinOverextensionAtr', v)} />
            <InputRow label="ATR Average Period" desc="Period for ATR moving average" value={settings.crAtrAveragePeriod} onChange={(v: any) => handleInputChange('crAtrAveragePeriod', v)} />
            <InputRow label="Min ATR vs Average" desc="Multiplier for minimum ATR expansion" value={settings.crMinAtrVsAverage} onChange={(v: any) => handleInputChange('crMinAtrVsAverage', v)} />
            <InputRow label="Min Rejection Wick Ratio" desc="Minimum ratio for rejection wick" value={settings.crMinRejectionWickRatio} step="0.05" onChange={(v: any) => handleInputChange('crMinRejectionWickRatio', v)} />
            <InputRow label="Min Climax Range Ratio" desc="Minimum ratio for climax candle range" value={settings.crMinClimaxRangeRatio} step="0.1" onChange={(v: any) => handleInputChange('crMinClimaxRangeRatio', v)} />
            <InputRow label="Min Stop Distance ATR" desc="Minimum SL distance in ATR" value={settings.crMinStopDistanceAtr} step="0.1" onChange={(v: any) => handleInputChange('crMinStopDistanceAtr', v)} />
            <InputRow label="Min Reward Risk" desc="Minimum reward to risk ratio" value={settings.crMinRewardRisk} step="0.1" onChange={(v: any) => handleInputChange('crMinRewardRisk', v)} />
          </div>
        )}

        {settings.activeStrategy === 'VOLATILITY_COMPRESSION' && (
          <div className="bg-gray-800/30 rounded-xl p-6 border border-gray-700/50">
            <h3 className="text-base font-bold text-white mb-4">Volatility Compression Breakout Parameters</h3>
            <InputRow label="Compression Lookback" desc="Candles forming the box" value={settings.vcbCompressionLookback} onChange={(v: any) => handleInputChange('vcbCompressionLookback', v)} />
            <InputRow label="Compression ATR Ratio Max" desc="Current ATR vs. its 50-avg" value={settings.vcbCompressionAtrRatioMax} step="0.05" onChange={(v: any) => handleInputChange('vcbCompressionAtrRatioMax', v)} />
            <InputRow label="Window ATR Mult" desc="Whole window contained within" value={settings.vcbWindowAtrMult} step="0.1" onChange={(v: any) => handleInputChange('vcbWindowAtrMult', v)} />
            <InputRow label="Boundary Buffer ATR" desc="Past the box edge to count as real break" value={settings.vcbBoundaryBufferAtr} step="0.1" onChange={(v: any) => handleInputChange('vcbBoundaryBufferAtr', v)} />
            <InputRow label="Range Expansion Min" desc="vs. compression window avg range" value={settings.vcbRangeExpansionMin} step="0.1" onChange={(v: any) => handleInputChange('vcbRangeExpansionMin', v)} />
            <InputRow label="Volume Expansion Min" desc="vs. compression window avg volume" value={settings.vcbVolumeExpansionMin} step="0.1" onChange={(v: any) => handleInputChange('vcbVolumeExpansionMin', v)} />
            <InputRow label="Close Strength Min" desc="Close position within its own range" value={settings.vcbCloseStrengthMin} step="0.05" onChange={(v: any) => handleInputChange('vcbCloseStrengthMin', v)} />
            <InputRow label="HTF Bonus Points" desc="Bonus if breakout aligns with HTF trend" value={settings.vcbHtfBonus} onChange={(v: any) => handleInputChange('vcbHtfBonus', v)} />
            <InputRow label="SL Buffer ATR Mult" desc="Beyond the compression box edge" value={settings.vcbSlBufferAtrMult} step="0.1" onChange={(v: any) => handleInputChange('vcbSlBufferAtrMult', v)} />
            <InputRow label="Initial TP ATR Mult" desc="Initial take profit distance" value={settings.vcbInitialTpAtrMult} step="0.1" onChange={(v: any) => handleInputChange('vcbInitialTpAtrMult', v)} />
            <InputRow label="Initial TP Close %" desc="Percentage to close on initial TP" value={settings.vcbInitialTpClosePct} step="0.05" onChange={(v: any) => handleInputChange('vcbInitialTpClosePct', v)} />
            <InputRow label="Chandelier ATR Mult" desc="Trail distance behind the extreme" value={settings.vcbChandelierAtrMult} step="0.1" onChange={(v: any) => handleInputChange('vcbChandelierAtrMult', v)} />
          </div>
        )}

      </div>
    </div>
  );
};

export default StrategyPanel;
