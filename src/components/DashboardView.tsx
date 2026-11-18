import React from 'react';
import { RefreshCw, Terminal, TrendingUp, TrendingDown, DollarSign, Activity, ShieldCheck, Zap } from 'lucide-react';
import ActiveTrades from './ActiveTrades.js';
import TradingChart from './TradingChart.js';
import { HtfBiasIndicator } from './HtfBiasIndicator.js';
import { Position, CoinDetail, AppSettings, SystemHealth } from '../types.js';
import { StatCard } from './ui/StatCard.js';
import { Card, CardHeader, CardTitle, CardContent } from './ui/Card.js';

interface DashboardViewProps {
  positions: Position[];
  coins: CoinDetail[];
  currentCoinDetail?: CoinDetail;
  selectedSymbol: string;
  onSelectSymbol: (symbol: string) => void;
  onManualClose: (id: string) => void;
  settings: AppSettings;
  terminalLogs: string[];
  totalAccountValue: number;
  engineRunning: boolean;
  systemHealth?: SystemHealth | null;
  onNavigateSettings?: () => void;
}

export function DashboardView({
  positions,
  coins,
  currentCoinDetail,
  selectedSymbol,
  onSelectSymbol,
  onManualClose,
  settings,
  terminalLogs,
  totalAccountValue,
  engineRunning,
  systemHealth,
  onNavigateSettings,
}: DashboardViewProps) {
  // Aggregate position metrics
  const totalUnrealizedPnl = positions.reduce((acc, p) => acc + p.unrealizedPnl, 0);
  const totalAllocatedMargin = positions.reduce((acc, p) => acc + p.allocatedBalance, 0);
  const isCoinDcx = settings.exchangeProvider === 'COINDCX';
  const isCoinDcxInr = isCoinDcx && settings.coindcxMarginCurrency !== 'USDT';
  const currSymbol = isCoinDcxInr ? '₹' : '$';
  const openRiskPct = totalAccountValue > 0 ? (totalAllocatedMargin / totalAccountValue) * 100 : 0;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Stat Row */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard
          label="Account Balance"
          value={
            isCoinDcxInr
              ? `₹${totalAccountValue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} INR`
              : `$${totalAccountValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`
          }
          subValue={
            isCoinDcx
              ? (settings.tradingMode === 'LIVE' ? 'CoinDCX INR Futures (Live Margin)' : 'CoinDCX Simulation Paper Pool (₹ INR)')
              : settings.binanceTestnet 
              ? (settings.tradingMode === 'LIVE' ? 'Binance Futures Testnet (Live Orders)' : 'Binance Testnet Paper Pool ($ USDT)') 
              : (settings.tradingMode === 'LIVE' ? 'Binance Live Futures ($ USD)' : 'Binance Paper Pool ($ USDT)')
          }
          icon={<DollarSign size={16} className="text-emerald-400" />}
          variant="default"
        />

        <StatCard
          label="Unrealized PnL"
          value={`${totalUnrealizedPnl >= 0 ? '+' : ''}${currSymbol}${totalUnrealizedPnl.toFixed(2)}`}
          subValue={`${positions.length} Active Position${positions.length === 1 ? '' : 's'}`}
          icon={totalUnrealizedPnl >= 0 ? <TrendingUp size={16} className="text-emerald-400" /> : <TrendingDown size={16} className="text-rose-400" />}
          variant={totalUnrealizedPnl > 0 ? 'success' : totalUnrealizedPnl < 0 ? 'danger' : 'default'}
        />

        <StatCard
          label="Risk Exposure"
          value={`${openRiskPct.toFixed(2)}%`}
          subValue={`Allocated: ${currSymbol}${totalAllocatedMargin.toFixed(0)}`}
          icon={<ShieldCheck size={16} className="text-indigo-400" />}
          variant={openRiskPct > 20 ? 'warning' : 'default'}
        />

        <StatCard
          label="Engine Status"
          value={engineRunning ? 'AUTONOMOUS' : 'PAUSED'}
          subValue={`Scan Loop: ${settings.scanInterval || 15}s | Pairs: ${settings.coinCount || 100}`}
          icon={<Zap size={16} className={engineRunning ? 'text-emerald-400 animate-pulse' : 'text-gray-500'} />}
          variant={engineRunning ? 'default' : 'warning'}
        />
      </div>

      {/* CoinDCX Exact Simulation Environment Status Banner */}
      {isCoinDcxInr && settings.tradingMode !== 'LIVE' && (
        <div className="bg-gradient-to-r from-sky-950/40 via-[#101926] to-[#0E1117] border border-sky-500/30 rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs shadow-sm">
          <div className="flex items-center gap-2.5">
            <span className="w-2 h-2 rounded-full bg-sky-400 animate-pulse shadow-[0_0_8px_rgba(56,189,248,0.8)]" />
            <div className="flex items-center gap-2">
              <span className="font-bold text-gray-100 flex items-center gap-1.5">
                <span className="text-sky-300">CoinDCX Exact Simulation Paper Mode</span>
              </span>
              <span className="text-gray-500 hidden sm:inline">•</span>
              <span className="text-[11px] text-gray-400 hidden sm:inline">
                Live 1:1 Mirror: 1,010+ INR Futures | 0.05% Taker Fee | 8h Pro-Rata Funding Rates | Real INR Margin
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-sky-500/10 text-sky-300 border border-sky-500/30 font-semibold">
              Max Margin: ₹{settings.maxTradeMarginInr ?? 200}
            </span>
            {onNavigateSettings && (
              <button
                onClick={onNavigateSettings}
                className="text-[11px] font-semibold text-sky-400 hover:text-sky-300 underline underline-offset-2 transition-colors cursor-pointer"
              >
                Configure
              </button>
            )}
          </div>
        </div>
      )}

      {/* Main Content Layout */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Left Column: Active Positions & Interactive Chart */}
        <div className="xl:col-span-2 space-y-6">
          <ActiveTrades
            positions={positions}
            onManualClose={onManualClose}
            settings={settings}
          />

          {currentCoinDetail ? (
            <TradingChart
              coin={currentCoinDetail}
              activePosition={positions.find((p) => p.symbol === currentCoinDetail.symbol)}
            />
          ) : (
            <div className="h-96 flex flex-col items-center justify-center bg-[#161B22] border border-[#30363D] rounded-xl relative p-6">
              <RefreshCw className="w-10 h-10 stroke-indigo-400 mb-2 animate-spin" />
              <span className="text-gray-400 text-sm font-semibold uppercase tracking-wider">
                Synchronizing market data...
              </span>
            </div>
          )}
        </div>

        {/* Right Column: Multi-Timeframe Bias & Event Terminal */}
        <div className="space-y-6">
          <HtfBiasIndicator
            symbol={currentCoinDetail?.symbol || selectedSymbol || 'BTCUSDT'}
            settings={settings}
            onSelectSymbol={onSelectSymbol}
            onNavigateSettings={onNavigateSettings}
          />

          {/* Event Stream Terminal */}
          <Card className="shadow-inner">
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-xs uppercase tracking-widest text-indigo-400">
                <Terminal className="w-3.5 h-3.5 mr-1" /> Event Stream
              </CardTitle>
              <span className="text-[10px] text-gray-500 font-mono">Live Buffer (50)</span>
            </CardHeader>
            <CardContent className="p-3">
              <div className="h-72 overflow-y-auto font-mono text-[10px] text-gray-400 space-y-1.5 divide-y divide-[#30363D]/60 pr-1">
                {terminalLogs.length === 0 ? (
                  <span className="text-gray-600 block py-4 text-center">
                    Console empty. Boot stream ready.
                  </span>
                ) : (
                  terminalLogs.map((logStr, index) => (
                    <div key={index} className="pt-1.5 leading-relaxed break-words">
                      {logStr}
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
