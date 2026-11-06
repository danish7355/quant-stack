import React, { useState, useEffect } from 'react';
import { 
  ShieldAlert, TrendingDown, AlertTriangle, RotateCcw, AlertOctagon, 
  CheckCircle2, XCircle, ShieldCheck, Zap, Target, TrendingUp, Sliders,
  Lock, Unlock, ArrowRight
} from 'lucide-react';
import { AppSettings, RiskStatus } from '../types';

interface RiskCenterProps {
  settings?: AppSettings;
  onUpdateSettings?: (newSettings: AppSettings) => void;
}

export function RiskCenter({ settings, onUpdateSettings }: RiskCenterProps) {
  const [riskStatus, setRiskStatus] = useState<RiskStatus | null>(null);
  const [resetting, setResetting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/risk/status');
      if (res.ok) {
        const text = await res.text();
        try {
          const data = JSON.parse(text);
          setRiskStatus(data);
        } catch {
          // not json
        }
      }
    } catch {
      // Ignore transient errors
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 4000);
    return () => clearInterval(interval);
  }, []);

  const handleKillSwitch = async (active: boolean) => {
    if (onUpdateSettings && settings) {
      onUpdateSettings({ ...settings, killSwitchActive: active });
    }
    try {
      await fetch('/api/risk/kill-switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active })
      });
      fetchStatus();
    } catch (e) {
      console.error('Failed to update kill switch:', e);
    }
  };

  const handleResetCircuitBreakers = async () => {
    setResetting(true);
    try {
      const res = await fetch('/api/risk/reset-circuit-breaker', { method: 'POST' });
      if (res.ok) {
        setMessage('Circuit breakers and daily loss stats successfully reset!');
        fetchStatus();
        setTimeout(() => setMessage(null), 4000);
      }
    } catch {
      setMessage('Failed to reset circuit breakers.');
    } finally {
      setResetting(false);
    }
  };

  const handleParamChange = (key: keyof AppSettings, val: any) => {
    if (onUpdateSettings && settings) {
      onUpdateSettings({ ...settings, [key]: val });
    }
  };

  // Derive current system state
  const isKillSwitch = settings?.killSwitchActive || riskStatus?.killSwitchActive;
  const dailyLossPct = Math.abs(riskStatus?.currentDailyLossPct ?? 0);
  const dailyLossLimit = Math.abs(settings?.dailyLossLimitPct ?? riskStatus?.dailyLossLimitPct ?? 5);
  const dailyLossProgress = Math.min(100, (dailyLossPct / (dailyLossLimit || 1)) * 100);

  const drawdownPct = riskStatus?.currentDrawdownPct ?? 0;
  const drawdownLimit = settings?.maxDrawdownPct ?? riskStatus?.maxDrawdownPct ?? 10;
  const drawdownProgress = Math.min(100, (drawdownPct / (drawdownLimit || 1)) * 100);

  const consecutiveLosses = riskStatus?.consecutiveLosses ?? 0;
  const maxConsecutive = settings?.maxConsecutiveLosses ?? riskStatus?.maxConsecutiveLosses ?? 4;
  const isConsecutiveTripped = consecutiveLosses >= maxConsecutive;

  const tradesToday = riskStatus?.tradesToday ?? 0;
  const maxTrades = settings?.maxTradesPerDay ?? riskStatus?.maxTradesPerDay ?? 25;
  const isTradeQuotaReached = tradesToday >= maxTrades;

  const isExecutionBlocked = isKillSwitch || (dailyLossPct >= dailyLossLimit) || (drawdownPct >= drawdownLimit) || isConsecutiveTripped || isTradeQuotaReached;

  return (
    <div className="p-4 sm:p-6 md:p-8 h-full overflow-y-auto space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#30363D]">
        <div className="flex items-center gap-3">
          <div className={`p-2.5 rounded-lg border ${isExecutionBlocked ? 'bg-red-500/20 text-red-400 border-red-500/40' : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'}`}>
            <ShieldAlert size={28} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl sm:text-2xl font-black text-gray-100 uppercase tracking-wider">Risk Management Center</h2>
              <span className={`text-[11px] font-mono px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider border ${
                isExecutionBlocked 
                  ? 'bg-red-950/80 text-red-400 border-red-500/50' 
                  : 'bg-emerald-950/80 text-emerald-400 border-emerald-500/50'
              }`}>
                {isExecutionBlocked ? '● EXECUTION HALTED' : '● ALL GATES CLEAR'}
              </span>
            </div>
            <p className="text-xs text-gray-400 mt-0.5">
              Live inspection and custom control of every risk parameter that can halt or reject autonomous trade execution.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleResetCircuitBreakers}
            disabled={resetting}
            className="flex items-center gap-2 px-3.5 py-2 bg-[#21262D] hover:bg-[#30363D] text-gray-200 border border-[#30363D] rounded-lg text-xs font-bold transition shadow-sm"
          >
            <RotateCcw size={14} className={resetting ? 'animate-spin text-emerald-400' : ''} />
            <span>{resetting ? 'Resetting...' : 'Reset Breakers'}</span>
          </button>

          <button
            type="button"
            onClick={() => handleKillSwitch(!isKillSwitch)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-black tracking-wider uppercase transition shadow ${
              isKillSwitch 
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white' 
                : 'bg-red-600 hover:bg-red-500 text-white'
            }`}
          >
            {isKillSwitch ? <Unlock size={14} /> : <Lock size={14} />}
            <span>{isKillSwitch ? 'Resume Trading' : 'Emergency Halt'}</span>
          </button>
        </div>
      </div>

      {message && (
        <div className="p-3 bg-emerald-950/40 border border-emerald-500/40 rounded-lg text-xs text-emerald-300 flex items-center gap-2">
          <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
          <span>{message}</span>
        </div>
      )}

      {/* Execution Halting Alert Banner if Blocked */}
      {isExecutionBlocked && (
        <div className="p-4 bg-red-950/40 border border-red-500/50 rounded-lg space-y-2">
          <div className="flex items-center gap-2 text-red-400 font-bold text-sm">
            <AlertOctagon size={18} />
            <span>Autonomous Execution Currently Stopped</span>
          </div>
          <div className="text-xs text-red-300 space-y-1 pl-6">
            {isKillSwitch && <div>• <strong>Emergency Master Kill Switch</strong> is engaged. All automated orders are blocked.</div>}
            {dailyLossPct >= dailyLossLimit && <div>• <strong>Daily Loss Limit</strong> reached ({dailyLossPct.toFixed(2)}% vs {dailyLossLimit}% cap). Trading locked until 00:00 UTC.</div>}
            {drawdownPct >= drawdownLimit && <div>• <strong>Max Account Drawdown</strong> reached ({drawdownPct.toFixed(2)}% vs {drawdownLimit}% limit). Capital preservation lock engaged.</div>}
            {isConsecutiveTripped && <div>• <strong>Consecutive Loss Circuit Breaker</strong> tripped ({consecutiveLosses} losses in a row). Hit Reset Breakers to resume.</div>}
            {isTradeQuotaReached && <div>• <strong>Daily Trade Quota</strong> reached ({tradesToday}/{maxTrades} trades executed today).</div>}
          </div>
        </div>
      )}

      {/* Top Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Daily Loss */}
        <div className="bg-[#161B22] border border-[#30363D] rounded-lg p-4 space-y-2.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-400 font-semibold flex items-center gap-1.5">
              <TrendingDown size={14} className="text-red-400" />
              Daily Drawdown
            </span>
            <span className={`font-mono font-bold ${dailyLossPct >= dailyLossLimit ? 'text-red-400' : 'text-gray-200'}`}>
              {dailyLossPct.toFixed(2)}% / {dailyLossLimit}%
            </span>
          </div>
          <div className="w-full bg-[#0E1117] rounded-full h-2 border border-[#30363D] overflow-hidden">
            <div 
              className={`h-full transition-all duration-300 ${dailyLossPct >= dailyLossLimit ? 'bg-red-500' : dailyLossPct > dailyLossLimit * 0.7 ? 'bg-amber-400' : 'bg-emerald-400'}`}
              style={{ width: `${dailyLossProgress}%` }}
            />
          </div>
          <div className="text-[11px] text-gray-500 flex justify-between">
            <span>Circuit Breaker Limit</span>
            <span className="text-gray-400 font-mono">-{dailyLossLimit.toFixed(1)}% max</span>
          </div>
        </div>

        {/* Total Drawdown */}
        <div className="bg-[#161B22] border border-[#30363D] rounded-lg p-4 space-y-2.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-400 font-semibold flex items-center gap-1.5">
              <AlertTriangle size={14} className="text-amber-400" />
              Peak-to-Trough Drawdown
            </span>
            <span className={`font-mono font-bold ${drawdownPct >= drawdownLimit ? 'text-red-400' : 'text-gray-200'}`}>
              {drawdownPct.toFixed(2)}% / {drawdownLimit}%
            </span>
          </div>
          <div className="w-full bg-[#0E1117] rounded-full h-2 border border-[#30363D] overflow-hidden">
            <div 
              className={`h-full transition-all duration-300 ${drawdownPct >= drawdownLimit ? 'bg-red-500' : 'bg-amber-400'}`}
              style={{ width: `${drawdownProgress}%` }}
            />
          </div>
          <div className="text-[11px] text-gray-500 flex justify-between">
            <span>Capital Preservation Cap</span>
            <span className="text-gray-400 font-mono">{drawdownLimit.toFixed(1)}%</span>
          </div>
        </div>

        {/* Consecutive Losses */}
        <div className="bg-[#161B22] border border-[#30363D] rounded-lg p-4 space-y-2.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-400 font-semibold flex items-center gap-1.5">
              <ShieldAlert size={14} className="text-cyan-400" />
              Consecutive Losses
            </span>
            <span className={`font-mono font-bold ${isConsecutiveTripped ? 'text-red-400' : 'text-gray-200'}`}>
              {consecutiveLosses} / {maxConsecutive}
            </span>
          </div>
          <div className="grid grid-cols-4 gap-1.5 pt-1">
            {Array.from({ length: maxConsecutive }).map((_, idx) => (
              <div 
                key={idx} 
                className={`h-2 rounded-full border border-[#30363D] transition-colors ${
                  idx < consecutiveLosses ? 'bg-red-500' : 'bg-[#0E1117]'
                }`} 
              />
            ))}
          </div>
          <div className="text-[11px] text-gray-500 flex justify-between">
            <span>Streak Halt Threshold</span>
            <span className="text-gray-400 font-mono">{maxConsecutive} losses</span>
          </div>
        </div>

        {/* Trades Today */}
        <div className="bg-[#161B22] border border-[#30363D] rounded-lg p-4 space-y-2.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-400 font-semibold flex items-center gap-1.5">
              <Target size={14} className="text-purple-400" />
              24h Executed Trades
            </span>
            <span className={`font-mono font-bold ${isTradeQuotaReached ? 'text-red-400' : 'text-gray-200'}`}>
              {tradesToday} / {maxTrades}
            </span>
          </div>
          <div className="w-full bg-[#0E1117] rounded-full h-2 border border-[#30363D] overflow-hidden">
            <div 
              className={`h-full transition-all duration-300 ${isTradeQuotaReached ? 'bg-red-500' : 'bg-purple-500'}`}
              style={{ width: `${Math.min(100, (tradesToday / (maxTrades || 1)) * 100)}%` }}
            />
          </div>
          <div className="text-[11px] text-gray-500 flex justify-between">
            <span>Daily Volume Quota</span>
            <span className="text-gray-400 font-mono">{maxTrades} orders</span>
          </div>
        </div>
      </div>

      {/* Real-Time Risk Gatekeeper Checklist */}
      <div className="bg-[#161B22] border border-[#30363D] rounded-lg p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-[#30363D] pb-3">
          <div className="flex items-center gap-2">
            <Sliders size={18} className="text-emerald-400" />
            <h3 className="text-sm font-bold text-gray-100 uppercase tracking-wider">
              Autonomous Trade Execution Gatekeepers
            </h3>
          </div>
          <span className="text-xs text-gray-400">
            Every candidate trade signal is evaluated against these strict rules before an order is placed.
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {/* Gate 1: Kill Switch */}
          <div className="p-3.5 bg-[#0E1117] border border-[#30363D] rounded-lg space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-gray-300">1. Emergency Master Switch</span>
              {isKillSwitch ? (
                <span className="flex items-center gap-1 text-[11px] font-bold text-red-400 bg-red-950/60 px-2 py-0.5 rounded border border-red-500/40">
                  <XCircle size={12} /> BLOCKED
                </span>
              ) : (
                <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-500/40">
                  <CheckCircle2 size={12} /> ALLOWED
                </span>
              )}
            </div>
            <p className="text-[11px] text-gray-500">Master circuit switch to immediately stop all incoming trades.</p>
          </div>

          {/* Gate 2: Daily Loss Cap */}
          <div className="p-3.5 bg-[#0E1117] border border-[#30363D] rounded-lg space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-gray-300">2. Daily Loss Limit</span>
              <span className="text-[11px] font-mono text-gray-300 font-bold bg-[#161B22] px-2 py-0.5 rounded border border-[#30363D]">
                -{dailyLossLimit.toFixed(1)}% Max
              </span>
            </div>
            <p className="text-[11px] text-gray-500">Halts orders if 24h cumulative losses breach this percentage.</p>
          </div>

          {/* Gate 3: Max Drawdown */}
          <div className="p-3.5 bg-[#0E1117] border border-[#30363D] rounded-lg space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-gray-300">3. Max Account Drawdown</span>
              <span className="text-[11px] font-mono text-gray-300 font-bold bg-[#161B22] px-2 py-0.5 rounded border border-[#30363D]">
                {drawdownLimit.toFixed(1)}% Max
              </span>
            </div>
            <p className="text-[11px] text-gray-500">Stops entries if total account equity drops this far from peak.</p>
          </div>

          {/* Gate 4: Minimum R:R Ratio */}
          <div className="p-3.5 bg-[#0E1117] border border-[#30363D] rounded-lg space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-gray-300">4. Minimum Risk-to-Reward</span>
              <span className="text-[11px] font-mono text-emerald-400 font-bold bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-500/30">
                1:{settings?.minRRRatio ?? 1.5} R:R
              </span>
            </div>
            <p className="text-[11px] text-gray-500">Rejects any signal whose TP1 distance / SL distance is below this ratio.</p>
          </div>

          {/* Gate 5: Bid/Ask Spread Cap */}
          <div className="p-3.5 bg-[#0E1117] border border-[#30363D] rounded-lg space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-gray-300">5. Bid/Ask Spread Filter</span>
              <span className="text-[11px] font-mono text-cyan-400 font-bold bg-cyan-950/40 px-2 py-0.5 rounded border border-cyan-500/30">
                &le; {((settings?.maxSpread ?? 0.2) * (settings?.maxSpread && settings.maxSpread > 1 ? 1 : 1)).toFixed(2)}%
              </span>
            </div>
            <p className="text-[11px] text-gray-500">Rejects illiquid pairs with wide spreads to prevent slippage losses.</p>
          </div>

          {/* Gate 6: Funding Rate Filter */}
          <div className="p-3.5 bg-[#0E1117] border border-[#30363D] rounded-lg space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-gray-300">6. Funding Rate Gate</span>
              <span className="text-[11px] font-mono text-amber-400 font-bold bg-amber-950/40 px-2 py-0.5 rounded border border-amber-500/30">
                &le; {(settings?.maxFundingRate ?? 0.05).toFixed(3)}%
              </span>
            </div>
            <p className="text-[11px] text-gray-500">Rejects coins with excessive funding fees that eat into profits.</p>
          </div>

          {/* Gate 7: Strict SL Requirement */}
          <div className="p-3.5 bg-[#0E1117] border border-[#30363D] rounded-lg space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-gray-300">7. Strict Stop-Loss Gate</span>
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded border ${
                settings?.enforceStrictSl !== false 
                  ? 'text-emerald-400 bg-emerald-950/40 border-emerald-500/30' 
                  : 'text-gray-400 bg-gray-800 border-gray-700'
              }`}>
                {settings?.enforceStrictSl !== false ? 'ENFORCED' : 'OFF'}
              </span>
            </div>
            <p className="text-[11px] text-gray-500">Rejects trade execution if the setup does not have a verified SL.</p>
          </div>

          {/* Gate 8: Liquidation Buffer */}
          <div className="p-3.5 bg-[#0E1117] border border-[#30363D] rounded-lg space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-gray-300">8. Liquidation Buffer</span>
              <span className="text-[11px] font-mono text-emerald-400 font-bold bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-500/30">
                &ge; {settings?.minLiqBuffer ?? 1.3}x SL
              </span>
            </div>
            <p className="text-[11px] text-gray-500">Requires liquidation distance to be at least Nx the stop-loss distance.</p>
          </div>

          {/* Gate 9: Stop Distance Bounds */}
          <div className="p-3.5 bg-[#0E1117] border border-[#30363D] rounded-lg space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-gray-300">9. Stop Distance Window</span>
              <span className="text-[11px] font-mono text-purple-400 font-bold bg-purple-950/40 px-2 py-0.5 rounded border border-purple-500/30">
                {(settings?.minStopDistancePct ?? 0.5)}% - {(settings?.maxStopDistancePct ?? 4.0)}%
              </span>
            </div>
            <p className="text-[11px] text-gray-500">Rejects stops that are too narrow (&lt; min) or too wide (&gt; max).</p>
          </div>

          {/* Gate 10: Portfolio Correlation */}
          <div className="p-3.5 bg-[#0E1117] border border-[#30363D] rounded-lg space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-gray-300">10. Correlation Veto</span>
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded border ${
                settings?.correlationFilterEnabled !== false 
                  ? 'text-cyan-400 bg-cyan-950/40 border-cyan-500/30' 
                  : 'text-gray-400 bg-gray-800 border-gray-700'
              }`}>
                {settings?.correlationFilterEnabled !== false ? `MAX ${settings?.maxCorrelation ?? 0.75}` : 'OFF'}
              </span>
            </div>
            <p className="text-[11px] text-gray-500">Blocks new coins highly correlated with existing open positions.</p>
          </div>

          {/* Gate 11: Asset Cooldown */}
          <div className="p-3.5 bg-[#0E1117] border border-[#30363D] rounded-lg space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-gray-300">11. Post-Trade Cooldown</span>
              <span className="text-[11px] font-mono text-gray-300 font-bold bg-[#161B22] px-2 py-0.5 rounded border border-[#30363D]">
                {settings?.tradeCooldownMinutes ?? 15} Mins
              </span>
            </div>
            <p className="text-[11px] text-gray-500">Enforces a mandatory quiet period on a coin after order or loss.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
