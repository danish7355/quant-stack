import React from 'react';
import { 
  ShieldCheck, CheckCircle2, XCircle, AlertTriangle, 
  TrendingUp, Crosshair, Zap, ArrowDownUp, Compass, Clock, 
  Sliders, Info, HelpCircle
} from 'lucide-react';
import { AppSettings } from '../types';

interface VcbChecklistPanelProps {
  settings: AppSettings;
  onUpdateSetting: (key: keyof AppSettings, value: any) => void;
  selectedCoinVcbChecklist?: {
    symbol?: string;
    score: number;
    maxScore: number;
    passed: boolean;
    gatePassed: boolean;
    failedGates: string[];
    summary: string;
    recommendation: 'EXECUTE' | 'WAIT' | 'SKIP';
    items: Array<{
      id: string;
      name: string;
      points: number;
      maxPoints: number;
      passed: boolean;
      detail: string;
      isMandatoryGate?: boolean;
    }>;
  } | null;
}

export const VcbChecklistPanel: React.FC<VcbChecklistPanelProps> = ({
  settings,
  onUpdateSetting,
  selectedCoinVcbChecklist
}) => {
  const minScore = settings.vcbChecklistMinScore ?? 8;
  const requireSweep = settings.vcbRequireSweep ?? true;
  const requireRetest = settings.vcbRequireRetest ?? true;
  const minRr = settings.vcbMinRrRatio ?? 2.0;
  const enforceKillZone = settings.vcbEnforceKillZone ?? false;

  return (
    <div className="space-y-6 font-mono text-xs">
      {/* HEADER BANNER */}
      <div className="bg-gradient-to-r from-emerald-950/40 via-cyan-950/30 to-gray-900 border border-emerald-500/40 rounded-xl p-5 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shrink-0">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white tracking-wide">
                  Before Executing a VCB Trade – Quick Checklist
                </h3>
                <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold">
                  FINAL ENTRY GATE
                </span>
              </div>
              <p className="text-xs text-gray-300 mt-1.5 leading-relaxed max-w-2xl">
                Use this as your &ldquo;final gate&rdquo; before clicking entry. If all (or almost all) are checked &rarr; 
                <span className="text-emerald-400 font-semibold"> execute with confidence</span>. If 2+ key items are missing &rarr; 
                <span className="text-amber-400 font-semibold"> skip or wait for better development</span>.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 self-end md:self-center shrink-0">
            <div className="bg-black/50 border border-gray-800 rounded-lg px-3 py-2 text-right">
              <div className="text-[10px] text-gray-400 uppercase tracking-wider">Required Score</div>
              <div className="text-emerald-400 font-bold text-sm">
                &ge; {minScore} / 11 pts
              </div>
            </div>
          </div>
        </div>

        {/* DECISION MATRIX PILLS */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mt-4 pt-3 border-t border-gray-800/80">
          <div className="bg-emerald-950/30 border border-emerald-500/30 rounded-lg p-2.5 flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <div>
              <div className="text-emerald-300 font-bold text-[11px]">Score &ge; {minScore} (8-11 pts)</div>
              <div className="text-[10px] text-gray-400">Execute trade with high confidence</div>
            </div>
          </div>

          <div className="bg-amber-950/30 border border-amber-500/30 rounded-lg p-2.5 flex items-center gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <div>
              <div className="text-amber-300 font-bold text-[11px]">Score 6-7 pts</div>
              <div className="text-[10px] text-gray-400">Wait for retest or sweep development</div>
            </div>
          </div>

          <div className="bg-rose-950/30 border border-rose-500/30 rounded-lg p-2.5 flex items-center gap-2.5">
            <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <div>
              <div className="text-rose-300 font-bold text-[11px]">Score &le; 5 pts (2+ Missing)</div>
              <div className="text-[10px] text-gray-400">Hard reject & skip setup completely</div>
            </div>
          </div>
        </div>
      </div>

      {/* LIVE AUDIT STATUS (IF CANDIDATE DETECTED) */}
      {selectedCoinVcbChecklist && (
        <div className={`rounded-xl p-4 border transition-all ${
          selectedCoinVcbChecklist.passed 
            ? 'bg-emerald-950/20 border-emerald-500/50' 
            : 'bg-rose-950/20 border-rose-500/50'
        }`}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="font-bold text-white text-sm">
                Live Audit: {selectedCoinVcbChecklist.symbol || 'Latest Signal'}
              </span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                selectedCoinVcbChecklist.passed 
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' 
                  : 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
              }`}>
                {selectedCoinVcbChecklist.recommendation} ({selectedCoinVcbChecklist.score} / {selectedCoinVcbChecklist.maxScore} pts)
              </span>
            </div>
            <span className="text-xs text-gray-400">
              {selectedCoinVcbChecklist.summary}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {selectedCoinVcbChecklist.items.map((item) => (
              <div 
                key={item.id} 
                className={`p-2 rounded border text-[11px] ${
                  item.passed 
                    ? 'bg-emerald-900/10 border-emerald-500/30 text-emerald-300' 
                    : 'bg-rose-900/10 border-rose-500/30 text-rose-300'
                }`}
              >
                <div className="flex items-center justify-between font-bold">
                  <span className="truncate">{item.name}</span>
                  <span className="shrink-0 font-mono ml-1">+{item.points}/{item.maxPoints}</span>
                </div>
                <div className="text-[10px] text-gray-400 mt-1 truncate" title={item.detail}>
                  {item.detail}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 7 CHECKLIST GATE CARDS */}
      <div className="space-y-3">
        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          The 7 Mandatory VCB Strategy Gates
        </h4>

        {/* ITEM 1 */}
        <div className="bg-[#161B22] border border-[#30363D] hover:border-emerald-500/40 rounded-xl p-4 transition-all space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20">
                <TrendingUp className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-white">1. Higher‑timeframe bias & draw on liquidity</span>
                  <span className="px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 text-[10px] font-bold font-mono">+1 pt</span>
                </div>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  Daily/4H trend and key levels support your direction. You know where price is likely drawn (prior high/low, liquidity pool).
                </p>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded bg-gray-800 text-gray-300 text-[10px] border border-gray-700">
              1H / 4H Alignment
            </span>
          </div>
        </div>

        {/* ITEM 2 */}
        <div className="bg-[#161B22] border border-[#30363D] hover:border-emerald-500/40 rounded-xl p-4 transition-all space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <Compass className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-white">2. Location: discount/premium & key level</span>
                  <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-bold font-mono">+2 pts</span>
                </div>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  Longs from discount near support/order block; shorts from premium near resistance. Price is at a meaningful level (prior breakout, consolidation boundary, OB/FVG).
                </p>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded bg-gray-800 text-gray-300 text-[10px] border border-gray-700">
              Equilibrium &plusmn;10%
            </span>
          </div>
        </div>

        {/* ITEM 3 */}
        <div className="bg-[#161B22] border border-[#30363D] hover:border-emerald-500/40 rounded-xl p-4 transition-all space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
                <Zap className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-white">3. Liquidity sweep / inducement</span>
                  <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px] font-bold font-mono">+2 pts</span>
                </div>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  A clear sweep of stops (high/low) has occurred in your direction or against weak hands. Avoid entries before the sweep; wait for the trap to complete.
                </p>
              </div>
            </div>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={requireSweep}
                onChange={(e) => onUpdateSetting('vcbRequireSweep', e.target.checked)}
                className="w-4 h-4 rounded border-gray-700 text-emerald-500 focus:ring-emerald-500 bg-gray-900"
              />
              <span className="text-[11px] font-semibold text-gray-300">Mandatory Gate</span>
            </label>
          </div>
        </div>

        {/* ITEM 4 */}
        <div className="bg-[#161B22] border border-[#30363D] hover:border-emerald-500/40 rounded-xl p-4 transition-all space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/20">
                <ArrowDownUp className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-white">4. Structure shift + displacement</span>
                  <span className="px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 text-[10px] font-bold font-mono">+2 pts</span>
                  <span className="px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-300 text-[9px] font-bold uppercase">Mandatory</span>
                </div>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  Lower timeframe shows a break of structure (BOS/MSS) with a strong impulsive candle. Volume/momentum confirms the move (not a slow drift).
                </p>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded bg-gray-800 text-gray-300 text-[10px] border border-gray-700 font-mono">
              Body &ge;45% &bull; RVOL &ge;1.35x
            </span>
          </div>
        </div>

        {/* ITEM 5 */}
        <div className="bg-[#161B22] border border-[#30363D] hover:border-emerald-500/40 rounded-xl p-4 transition-all space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                <Crosshair className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-white">5. Retest into entry zone</span>
                  <span className="px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 text-[10px] font-bold font-mono">+2 pts</span>
                </div>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  Price pulls back to a defined POI (FVG, order block, broken level/retest). Enter on the reaction / continuation, not in the middle of nowhere.
                </p>
              </div>
            </div>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={requireRetest}
                onChange={(e) => onUpdateSetting('vcbRequireRetest', e.target.checked)}
                className="w-4 h-4 rounded border-gray-700 text-emerald-500 focus:ring-emerald-500 bg-gray-900"
              />
              <span className="text-[11px] font-semibold text-gray-300">Anti-Chase Gate</span>
            </label>
          </div>
        </div>

        {/* ITEM 6 */}
        <div className="bg-[#161B22] border border-[#30363D] hover:border-emerald-500/40 rounded-xl p-4 transition-all space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <Sliders className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-white">6. Risk & R:R defined</span>
                  <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-bold font-mono">+2 pts</span>
                  <span className="px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-300 text-[9px] font-bold uppercase">Mandatory</span>
                </div>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  Stop-loss placed beyond structural swing/sweep (not arbitrary $ amount). Take-profit targets clear liquidity; minimum 2:1 or 3:1 R:R available.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[10px] text-gray-400">Min R:R:</span>
              <input
                type="number"
                min={1.5}
                max={5.0}
                step={0.1}
                value={minRr}
                onChange={(e) => onUpdateSetting('vcbMinRrRatio', parseFloat(e.target.value) || 2.0)}
                className="w-16 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-center font-bold text-emerald-400 focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>
        </div>

        {/* ITEM 7 */}
        <div className="bg-[#161B22] border border-[#30363D] hover:border-emerald-500/40 rounded-xl p-4 transition-all space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
                <Clock className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-white">7. Session & news filter</span>
                  <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px] font-bold font-mono">GATE</span>
                </div>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  Trading during London/NY open; avoid low-volume dead zones unless specific setup. No high-impact news in next 15–30 minutes.
                </p>
              </div>
            </div>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={enforceKillZone}
                onChange={(e) => onUpdateSetting('vcbEnforceKillZone', e.target.checked)}
                className="w-4 h-4 rounded border-gray-700 text-emerald-500 focus:ring-emerald-500 bg-gray-900"
              />
              <span className="text-[11px] font-semibold text-gray-300">Enforce London/NY Kill Zones</span>
            </label>
          </div>
        </div>
      </div>

      {/* CHECKLIST CONFIGURATION CONTROLS */}
      <div className="bg-[#161B22] border border-[#30363D] rounded-xl p-5 space-y-4">
        <h4 className="text-xs font-bold text-white flex items-center gap-2">
          <Sliders className="w-4 h-4 text-emerald-400" />
          Checklist Engine Tuning
        </h4>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <div className="flex justify-between items-center">
              <label className="text-gray-300 text-[11px] font-semibold">Minimum Checklist Score Required</label>
              <span className="font-bold text-emerald-400 font-mono">{minScore} / 11 pts</span>
            </div>
            <input
              type="range"
              min={6}
              max={11}
              step={1}
              value={minScore}
              onChange={(e) => onUpdateSetting('vcbChecklistMinScore', parseInt(e.target.value, 10))}
              className="w-full accent-emerald-500 cursor-pointer"
            />
            <p className="text-[10px] text-gray-500">
              Default 8 points requires passing all or almost all key criteria before trade execution.
            </p>
          </div>

          <div className="bg-gray-900/60 rounded-lg p-3 border border-gray-800 flex items-start gap-2.5">
            <Info className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
            <p className="text-[10px] text-gray-400 leading-relaxed">
              When auto-trading is enabled with VCB Breakout strategy, every candidate breakout candle is passed through this 7-item checklist in real-time. Only setups meeting the threshold score and passing all mandatory gates will generate orders.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
