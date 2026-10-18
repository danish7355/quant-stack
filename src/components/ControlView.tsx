import React, { useState } from 'react';
import { ShieldAlert, Settings as SettingsIcon } from 'lucide-react';
import { RiskCenter } from './RiskCenter.js';
import SettingsPanel from './SettingsPanel.js';
import { AppSettings } from '../types.js';
import { Tabs } from './ui/Tabs.js';

interface ControlViewProps {
  settings: AppSettings;
  onUpdateSettings: (newSettings: AppSettings | ((prev: AppSettings) => AppSettings)) => void;
  onResetBalance?: () => void;
  onResetSettings?: () => void;
  initialSubTab?: 'risk' | 'settings';
}

export function ControlView({
  settings,
  onUpdateSettings,
  onResetBalance,
  onResetSettings,
  initialSubTab = 'risk',
}: ControlViewProps) {
  const [subTab, setSubTab] = useState<'risk' | 'settings'>(initialSubTab);

  const tabs = [
    { id: 'risk', label: 'Risk Center & Gates', icon: <ShieldAlert size={14} /> },
    { id: 'settings', label: 'Engine & API Settings', icon: <SettingsIcon size={14} /> },
  ];

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      {/* Subtab Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#161B22] p-2.5 rounded-xl border border-[#30363D]">
        <Tabs
          tabs={tabs}
          activeTab={subTab}
          onChange={(id) => setSubTab(id as any)}
          size="sm"
        />

        <div className="text-xs text-gray-400 font-mono">
          Environment: <span className="font-bold text-gray-200">{settings.binanceTestnet ? 'Binance Futures Testnet' : 'Paper Trading'}</span>
        </div>
      </div>

      {/* Subtab Body */}
      {subTab === 'risk' && (
        <RiskCenter
          settings={settings}
          onUpdateSettings={onUpdateSettings as any}
        />
      )}

      {subTab === 'settings' && (
        <SettingsPanel
          settings={settings}
          onUpdateSettings={onUpdateSettings}
          onResetBalance={onResetBalance}
          onResetSettings={onResetSettings}
        />
      )}
    </div>
  );
}
