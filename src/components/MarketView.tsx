import React, { useState } from 'react';
import { List, Compass, RefreshCw } from 'lucide-react';
import ScannerList from './ScannerList.js';
import RegimeVisualizer from './RegimeVisualizer.js';
import { CoinDetail, AppSettings } from '../types.js';
import { Tabs } from './ui/Tabs.js';

interface MarketViewProps {
  coins: CoinDetail[];
  selectedSymbol: string;
  onSelectCoin: (symbol: string) => void;
  isLoading: boolean;
  onManualScan: () => void;
  scanTime: string;
  settings: AppSettings;
  onUpdateSettings: (newSettings: AppSettings | ((prev: AppSettings) => AppSettings)) => void;
  onToggleStrategy: (strategy: string) => void;
  onSelectStrategy: (strategy: string) => void;
  onSetMultipleStrategies: (strategies: string[]) => void;
  totalAccountValue: number;
  initialSubTab?: 'scanner' | 'regime';
}

export function MarketView({
  coins,
  selectedSymbol,
  onSelectCoin,
  isLoading,
  onManualScan,
  scanTime,
  settings,
  onUpdateSettings,
  onToggleStrategy,
  onSelectStrategy,
  onSetMultipleStrategies,
  totalAccountValue,
  initialSubTab = 'scanner',
}: MarketViewProps) {
  const [subTab, setSubTab] = useState<'scanner' | 'regime'>(initialSubTab);

  const tabs = [
    { id: 'scanner', label: '100-Pair Screener', icon: <List size={14} />, badge: coins.length },
    { id: 'regime', label: 'Regime Visualizer & Matrix', icon: <Compass size={14} /> },
  ];

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      {/* Top Switcher Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#161B22] p-2.5 rounded-xl border border-[#30363D]">
        <Tabs
          tabs={tabs}
          activeTab={subTab}
          onChange={(id) => setSubTab(id as any)}
          size="sm"
        />

        <div className="flex items-center gap-3 text-xs text-gray-400 font-mono">
          <span>Pairs: {coins.length}</span>
          <span className="text-gray-600">|</span>
          <span>Last Scan: {scanTime}</span>
        </div>
      </div>

      {/* Subtab Contents */}
      {subTab === 'scanner' && (
        <ScannerList
          coins={coins}
          selectedSymbol={selectedSymbol}
          onSelectCoin={onSelectCoin}
          isLoading={isLoading}
          onManualScan={onManualScan}
          autoTradeThreshold={settings.autoTradeThreshold}
          activeStrategies={settings.activeStrategies || [settings.activeStrategy || 'COIL_BREAKOUT']}
          deletedStrategies={settings.deletedStrategies || []}
          activeStrategy={settings.activeStrategy}
          onToggleStrategy={onToggleStrategy}
          onSelectStrategy={onSelectStrategy}
          onSetMultipleStrategies={onSetMultipleStrategies}
        />
      )}

      {subTab === 'regime' && (
        <RegimeVisualizer
          coins={coins}
          settings={settings}
          selectedSymbol={selectedSymbol || 'BTCUSDT'}
          onSelectSymbol={onSelectCoin}
          onUpdateSettings={onUpdateSettings}
          onSelectStrategy={onSelectStrategy}
          onSetMultipleStrategies={onSetMultipleStrategies}
          accountBalance={totalAccountValue}
        />
      )}
    </div>
  );
}
