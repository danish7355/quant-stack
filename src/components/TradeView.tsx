import React, { useState } from 'react';
import { RefreshCw, BarChart2, Activity, Layers, Maximize2 } from 'lucide-react';
import TradingChart from './TradingChart.js';
import ActiveTrades from './ActiveTrades.js';
import { OrderBlockStrategyPanel } from './OrderBlockStrategyPanel.js';
import { LsrStrategyPanel } from './LsrStrategyPanel.js';
import { CoinDetail, Position, AppSettings } from '../types.js';
import { Tabs } from './ui/Tabs.js';

interface TradeViewProps {
  currentCoinDetail?: CoinDetail;
  positions: Position[];
  onManualClose: (id: string) => void;
  settings: AppSettings;
  onUpdateSettings: (newSettings: AppSettings | ((prev: AppSettings) => AppSettings)) => void;
  onToggleStrategy: (strategy: string) => void;
  onOpenDiagnostic: () => void;
  onOpenSettings: () => void;
  initialSubTab?: 'chart' | 'positions';
}

export function TradeView({
  currentCoinDetail,
  positions,
  onManualClose,
  settings,
  onUpdateSettings,
  onToggleStrategy,
  onOpenDiagnostic,
  onOpenSettings,
  initialSubTab = 'chart',
}: TradeViewProps) {
  const [subTab, setSubTab] = useState<'chart' | 'positions' | 'split'>(initialSubTab);

  const tabs = [
    { id: 'chart', label: 'Chart & Setup Panels', icon: <BarChart2 size={14} /> },
    {
      id: 'positions',
      label: 'Positions & Orders',
      icon: <Activity size={14} />,
      badge: positions.length > 0 ? positions.length : undefined,
    },
    { id: 'split', label: 'Pro Split View', icon: <Maximize2 size={14} /> },
  ];

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      {/* Top Switcher Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#161B22] p-2.5 rounded-xl border border-[#30363D]">
        <div className="flex items-center gap-3">
          <Tabs
            tabs={tabs}
            activeTab={subTab}
            onChange={(id) => setSubTab(id as any)}
            size="sm"
          />
        </div>

        {currentCoinDetail && (
          <div className="flex items-center gap-3 text-xs font-mono">
            <span className="text-gray-400">Pair:</span>
            <span className="font-bold text-gray-100">{currentCoinDetail.symbol}</span>
            <span className="text-gray-500">|</span>
            <span className="text-gray-400">Price:</span>
            <span className="font-bold text-gray-100 tabular-nums">
              ${currentCoinDetail.price > 1 ? currentCoinDetail.price.toFixed(2) : currentCoinDetail.price.toFixed(4)}
            </span>
            <span
              className={`font-semibold tabular-nums ${
                currentCoinDetail.change24h >= 0 ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {currentCoinDetail.change24h >= 0 ? '+' : ''}
              {currentCoinDetail.change24h.toFixed(2)}%
            </span>
          </div>
        )}
      </div>

      {/* Main Content Area */}
      {subTab === 'chart' && (
        <div className="space-y-6">
          {currentCoinDetail ? (
            <>
              <TradingChart
                coin={currentCoinDetail}
                activePosition={positions.find((p) => p.symbol === currentCoinDetail.symbol)}
              />

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <OrderBlockStrategyPanel
                  signal={currentCoinDetail.orderBlockSignal}
                  symbol={currentCoinDetail.symbol}
                  settings={settings}
                  onOpenDiagnostic={onOpenDiagnostic}
                />

                <LsrStrategyPanel
                  signal={currentCoinDetail.lsrSignal}
                  symbol={currentCoinDetail.symbol}
                  currentPrice={currentCoinDetail.price}
                  candles={currentCoinDetail.candles}
                  settings={settings}
                  isActive={Boolean(
                    (settings.activeStrategies &&
                      settings.activeStrategies.includes('LIQUIDITY_SWEEP_REVERSAL')) ||
                      settings.activeStrategy === 'LIQUIDITY_SWEEP_REVERSAL'
                  )}
                  onToggleActive={() => onToggleStrategy('LIQUIDITY_SWEEP_REVERSAL')}
                  onOpenSettings={onOpenSettings}
                  onUpdateSettings={onUpdateSettings}
                />
              </div>
            </>
          ) : (
            <div className="h-96 flex flex-col items-center justify-center bg-[#161B22] border border-[#30363D] rounded-xl p-6">
              <RefreshCw className="w-10 h-10 stroke-indigo-400 mb-2 animate-spin" />
              <span className="text-gray-400 text-sm font-semibold uppercase tracking-wider">
                Synchronizing market chart...
              </span>
            </div>
          )}
        </div>
      )}

      {subTab === 'positions' && (
        <div className="space-y-6">
          <ActiveTrades
            positions={positions}
            onManualClose={onManualClose}
            settings={settings}
          />
        </div>
      )}

      {subTab === 'split' && (
        <div className="space-y-6">
          {currentCoinDetail && (
            <TradingChart
              coin={currentCoinDetail}
              activePosition={positions.find((p) => p.symbol === currentCoinDetail.symbol)}
            />
          )}

          <ActiveTrades
            positions={positions}
            onManualClose={onManualClose}
            settings={settings}
          />

          {currentCoinDetail && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <OrderBlockStrategyPanel
                signal={currentCoinDetail.orderBlockSignal}
                symbol={currentCoinDetail.symbol}
                settings={settings}
                onOpenDiagnostic={onOpenDiagnostic}
              />
              <LsrStrategyPanel
                signal={currentCoinDetail.lsrSignal}
                symbol={currentCoinDetail.symbol}
                currentPrice={currentCoinDetail.price}
                candles={currentCoinDetail.candles}
                settings={settings}
                isActive={Boolean(
                  (settings.activeStrategies &&
                    settings.activeStrategies.includes('LIQUIDITY_SWEEP_REVERSAL')) ||
                    settings.activeStrategy === 'LIQUIDITY_SWEEP_REVERSAL'
                )}
                onToggleActive={() => onToggleStrategy('LIQUIDITY_SWEEP_REVERSAL')}
                onOpenSettings={onOpenSettings}
                onUpdateSettings={onUpdateSettings}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
