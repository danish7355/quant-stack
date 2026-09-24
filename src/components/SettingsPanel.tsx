import React, { useState, useEffect, useMemo } from 'react';
import { AppSettings, Timeframe, NUMERIC_BOUNDS } from '../types';
import { RefreshCw, Eye, EyeOff, Github, UploadCloud, AlertTriangle, CheckCircle2, ArrowRight, ShieldAlert, Activity, History } from 'lucide-react';
import { SettingsHealthPanel } from './SettingsHealthPanel';
import { SettingsAuditLog } from './SettingsAuditLog';

interface SettingsPanelProps {
  settings: AppSettings;
  onUpdateSettings: (newSettings: AppSettings) => void;
  onResetBalance: (amount: number) => void;
  onResetSettings: () => void;
  hasLoadedServerSettings?: boolean;
  settingsLoadError?: string | null;
  onReloadServerSettings?: () => Promise<void>;
}

const LocalNumberInput = ({ value, onChange, className }: any) => {
  const [localValue, setLocalValue] = React.useState(value?.toString() ?? "");

  React.useEffect(() => {
    setLocalValue(value?.toString() ?? "");
  }, [value]);

  const handleBlur = () => {
    let finalValue = parseFloat(localValue);
    if (isNaN(finalValue)) finalValue = 0;
    setLocalValue(finalValue.toString());
    onChange(finalValue);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleBlur();
      e.currentTarget.blur();
    }
  };

  return (
    <input
      type="number"
      value={localValue}
      onChange={(e) => setLocalValue(e.target.value)}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      className={className}
    />
  );
};

const InputRow = ({ label, desc, value, onChange, type = "number", className="", min, max }: any) => {
  const [localValue, setLocalValue] = React.useState(value?.toString() ?? "");

  React.useEffect(() => {
    setLocalValue(value?.toString() ?? "");
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalValue(e.target.value);
    if (type !== 'number') {
      onChange(e.target.value);
    }
  };

  const handleBlur = () => {
    if (type === 'number') {
      let finalValue = parseFloat(localValue);
      if (isNaN(finalValue)) finalValue = 0;
      const clamped = Math.max(min ?? -Infinity, Math.min(max ?? Infinity, finalValue));
      setLocalValue(clamped.toString());
      onChange(clamped);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleBlur();
      e.currentTarget.blur();
    }
  };

  return (
    <div className={`flex justify-between items-center py-4 border-b border-[#30363D]/50 last:border-0 ${className}`}>
      <div className="flex flex-col">
        <span className="text-sm font-bold text-gray-200">{label}</span>
        <span className="text-[11px] text-gray-500 max-w-sm leading-relaxed">{desc}</span>
      </div>
      <div className="flex items-center space-x-2">
        <input
          type={type}
          value={localValue}
          onChange={handleChange}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          className="w-24 bg-[#0E1117] border border-[#30363D] rounded p-1.5 text-right font-mono text-sm font-semibold text-gray-400 focus:outline-none focus:border-indigo-500"
        />

        
      </div>
    </div>

  );
};

const ToggleRow = ({ label, desc, checked, onChange, activeBadgeText = 'ACTIVE (BYPASSED)', inactiveBadgeText = 'ENFORCED', highRisk = true }: any) => {
  return (
    <div className="flex justify-between items-center py-3.5 border-b border-[#30363D]/40 last:border-0">
      <div className="flex flex-col pr-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-gray-100">{label}</span>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded border transition-colors ${
            checked 
              ? (highRisk ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' : 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40') 
              : 'bg-gray-800 text-gray-400 border-gray-700'
          }`}>
            {checked ? activeBadgeText : inactiveBadgeText}
          </span>
        </div>
        <span className="text-[11px] text-gray-400 mt-0.5 leading-relaxed">
          {desc}
        </span>
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`w-12 h-6 rounded-full transition-colors flex items-center px-1 shrink-0 cursor-pointer ${
          checked ? (highRisk ? 'bg-amber-500' : 'bg-indigo-600') : 'bg-gray-700'
        }`}
      >
        <div
          className={`w-4 h-4 rounded-full bg-white transition-transform ${
            checked ? 'transform translate-x-6' : ''
          }`}
        />
      </button>
    </div>
  );
};

export default function SettingsPanel({
  settings,
  onUpdateSettings,
  onResetBalance,
  onResetSettings,
  hasLoadedServerSettings = true,
  settingsLoadError = null,
  onReloadServerSettings
}: SettingsPanelProps) {
  const [activeTab, setActiveTab] = useState<'general' | 'filters' | 'risk' | 'strategies' | 'autotrade' | 'alerts' | 'credentials' | 'github' | 'health' | 'audit'>('general');
  const [showBotToken, setShowBotToken] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [showApiSecret, setShowApiSecret] = useState(false);
  const [telegramStatus, setTelegramStatus] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isResettingLosses, setIsResettingLosses] = useState(false);
  const [resetLossStatus, setResetLossStatus] = useState<string | null>(null);
  const [isResettingDailyLoss, setIsResettingDailyLoss] = useState(false);
  const [resetDailyLossStatus, setResetDailyLossStatus] = useState<string | null>(null);
  const [isTogglingKillSwitch, setIsTogglingKillSwitch] = useState(false);
  const [killSwitchStatus, setKillSwitchStatus] = useState<string | null>(null);

  // Snapshot of last-saved configuration to detect exact diffs
  const [savedSnapshot, setSavedSnapshot] = useState<AppSettings>(settings);

  // Sync snapshot when remote settings load or when settings version changes from remote
  useEffect(() => {
    if (settings.settingsVersion && settings.settingsVersion !== savedSnapshot.settingsVersion) {
      setSavedSnapshot(settings);
    }
  }, [settings.settingsVersion]);

  // Compute exact diffs between current form state and last-saved snapshot
  const diffs = useMemo(() => {
    const list: Array<{ key: string; label: string; oldVal: string; newVal: string; highRisk?: boolean }> = [];
    const allKeys = new Set([...Object.keys(savedSnapshot), ...Object.keys(settings)]) as Set<keyof AppSettings>;
    for (const k of allKeys) {
      if (k === 'updatedAt' || k === 'settingsVersion') continue;
      const oldV = (savedSnapshot as any)[k];
      const newV = (settings as any)[k];
      if (JSON.stringify(oldV) !== JSON.stringify(newV)) {
        const bound = NUMERIC_BOUNDS[k as string];
        const isHighRisk = bound?.highRisk || k === 'leverage' || k === 'accountRiskPct' || k === 'dailyLossLimitPct' || k === 'autoTradeEnabled';
        list.push({
          key: k as string,
          label: bound?.label || String(k),
          oldVal: oldV !== undefined ? String(oldV) : '—',
          newVal: newV !== undefined ? String(newV) : '—',
          highRisk: Boolean(isHighRisk)
        });
      }
    }
    return list;
  }, [savedSnapshot, settings]);

  const isDirty = diffs.length > 0;
  const hasHighRiskChanges = diffs.some(d => d.highRisk);

  // Warn on navigation/close with unsaved changes
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [isDirty]);

  const [isPushing, setIsPushing] = useState(false);
  const [gitStatus, setGitStatus] = useState<string | null>(null);
  const [forcePush, setForcePush] = useState(false);

  const handleGitPush = async (overrideForce?: boolean) => {
    const isForce = overrideForce !== undefined ? overrideForce : forcePush;
    if (overrideForce !== undefined) {
      setForcePush(overrideForce);
    }
    if (!settings.githubPat) {
      setGitStatus('Error: Please enter a GitHub Personal Access Token (PAT).');
      return;
    }
    setIsPushing(true);
    setGitStatus(isForce ? 'Force pushing to GitHub (overwriting remote)...' : 'Pushing to GitHub...');
    try {
      const res = await fetch('/api/git/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          token: settings.githubPat,
          repoUrl: settings.githubRepoUrl,
          force: isForce
        })
      });
      const data = await res.json();
      if (data.success) {
        setGitStatus('✓ Successfully pushed all code to GitHub!');
      } else {
        setGitStatus(`Failed: ${data.error || 'Unknown error'}`);
      }
    } catch (err: any) {
      setGitStatus(`Network error: ${err.message}`);
    } finally {
      setIsPushing(false);
    }
  };

  const handleSaveSettings = () => {
    // Force blur on active element to flush pending input
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }

    if (diffs.length === 0) {
      // If there are no pending input changes, execute save directly to sync version with engine
      executeActualSave();
      return;
    }

    // Open confirmation diff modal
    setShowConfirmModal(true);
  };

  const executeActualSave = async () => {
    setIsSaving(true);
    try {
      const res = await fetch('/api/bot/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        setSaveStatus(`✗ Save failed: ${errData.error || res.statusText}`);
        return;
      }
      const data = await res.json();
      if (data.settings) {
        onUpdateSettings(data.settings);
        setSavedSnapshot(data.settings);
      }
      setShowConfirmModal(false);
      setSaveStatus(`✓ Saved (v${data.engineStatus?.activeVersion || data.settings?.settingsVersion || '?'})`);
    } catch (e) {
      setSaveStatus('✗ Network error — settings NOT saved');
    } finally {
      setIsSaving(false);
      setTimeout(() => setSaveStatus(null), 3500);
    }
  };

  const handleInputChange = (category: keyof AppSettings | string, value: string | number | boolean) => {
    const updated = { ...settings, [category]: value } as AppSettings;
    onUpdateSettings(updated);
  };

  const testTelegramConnection = async () => {
    if (!settings.telegramBotToken || !settings.telegramChatId) {
      setTelegramStatus('Please define Bot Token and Chat ID first.');
      return;
    }
    setTelegramStatus('Sending test alert...');

    try {
      // First ensure server has latest token & chat ID
      await fetch('/api/bot/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });

      const isMaskedToken = !settings.telegramBotToken || settings.telegramBotToken.includes('****') || settings.telegramBotToken.includes('••••');
      const res = await fetch('/api/bot/telegram/test', { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          botToken: isMaskedToken ? undefined : settings.telegramBotToken,
          chatId: settings.telegramChatId
        })
      });
      const data = await res.json();
      if (data.success) {
        setTelegramStatus('✓ Test alert delivered via server bot engine!');
      } else {
        setTelegramStatus(`Error: ${data.error || 'Check token/permissions'}`);
      }
    } catch (e: any) {
      setTelegramStatus(`Network error: ${e.message}`);
    }
  };

  const handleResetLossStreak = async () => {
    setIsResettingLosses(true);
    setResetLossStatus(null);
    try {
      const res = await fetch('/api/risk/reset-losses', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setResetLossStatus('✓ Streak reset to 0');
        setTimeout(() => setResetLossStatus(null), 3500);
      } else {
        setResetLossStatus(`Failed: ${data.error || 'Server error'}`);
      }
    } catch (e: any) {
      setResetLossStatus(`Network error: ${e.message}`);
    } finally {
      setIsResettingLosses(false);
    }
  };

  const handleResetDailyLoss = async () => {
    setIsResettingDailyLoss(true);
    setResetDailyLossStatus(null);
    try {
      const res = await fetch('/api/risk/reset-daily-loss', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setResetDailyLossStatus('✓ Daily loss reset to 0%');
        setTimeout(() => setResetDailyLossStatus(null), 3500);
      } else {
        setResetDailyLossStatus(`Failed: ${data.error || 'Server error'}`);
      }
    } catch (e: any) {
      setResetDailyLossStatus(`Network error: ${e.message}`);
    } finally {
      setIsResettingDailyLoss(false);
    }
  };

  const handleToggleKillSwitch = async () => {
    setIsTogglingKillSwitch(true);
    setKillSwitchStatus(null);
    try {
      const nextActive = !settings.killSwitchActive;
      const res = await fetch('/api/risk/toggle-kill-switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: nextActive })
      });
      const data = await res.json();
      if (data.success) {
        handleInputChange('killSwitchActive', data.killSwitchActive);
        setKillSwitchStatus(data.killSwitchActive ? '⚠️ Kill Switch ENGAGED' : '✓ Kill Switch DISENGAGED');
        setTimeout(() => setKillSwitchStatus(null), 3500);
      } else {
        setKillSwitchStatus(`Failed: ${data.error || 'Server error'}`);
      }
    } catch (e: any) {
      setKillSwitchStatus(`Network error: ${e.message}`);
    } finally {
      setIsTogglingKillSwitch(false);
    }
  };

  if (!hasLoadedServerSettings && !settingsLoadError) {
    return (
      <div className="bg-[#161B22] border border-[#30363D] rounded-xl p-8 space-y-6">
        <div className="flex items-center gap-3">
          <RefreshCw className="w-6 h-6 animate-spin text-indigo-400" />
          <div>
            <h3 className="text-base font-bold text-white">Loading Configuration from Cloud Database...</h3>
            <p className="text-xs text-gray-400">Fetching persisted parameters from Firestore settings/bot_config</p>
          </div>
        </div>
        <div className="space-y-3 animate-pulse pt-4">
          <div className="h-12 bg-[#0E1117] rounded-lg border border-[#30363D]" />
          <div className="h-12 bg-[#0E1117] rounded-lg border border-[#30363D]" />
          <div className="h-12 bg-[#0E1117] rounded-lg border border-[#30363D]" />
        </div>
      </div>
    );
  }

  if (settingsLoadError) {
    return (
      <div className="bg-[#161B22] border border-rose-800/60 rounded-xl p-8 space-y-4">
        <div className="flex items-center gap-3 text-rose-400">
          <AlertTriangle className="w-6 h-6" />
          <div>
            <h3 className="text-base font-bold text-white">Configuration Load Error</h3>
            <p className="text-xs text-rose-300/80">{settingsLoadError}</p>
          </div>
        </div>
        <p className="text-xs text-gray-400">
          Automated trading is paused. Settings cannot be edited or saved until the database connection is restored.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-rose-600/30 hover:bg-rose-600/40 text-rose-200 text-xs font-bold rounded border border-rose-500/50"
        >
          Retry Connection
        </button>
      </div>
    );
  }

  return (
    <div className="bg-[#161B22] border border-[#30363D] rounded-xl overflow-hidden shadow-lg h-full flex flex-col">
      <div className="bg-[#0E1117] border-b border-[#30363D] px-6 py-4 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center space-x-3">
          <h2 className="text-xl font-extrabold text-white tracking-widest uppercase">STRATEGY & BOT SETTINGS</h2>
          <span className="hidden sm:inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
            ● Cloud Firestore Sync Active
          </span>
          {isDirty && (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse">
              ● {diffs.length} Unsaved Changes
            </span>
          )}
        </div>
        <div className="flex space-x-3">
          {onReloadServerSettings && (
            <button 
              onClick={onReloadServerSettings}
              className="flex items-center space-x-2 px-3 py-1.5 rounded-lg border border-[#30363D] text-gray-400 hover:bg-[#21262D] text-sm font-semibold transition-colors"
              title="Pull latest active configuration from trading engine"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Pull from Engine</span>
            </button>
          )}
          <button 
            onClick={onResetSettings}
            className="flex items-center space-x-2 px-3 py-1.5 rounded-lg border border-[#30363D] text-gray-400 hover:bg-[#21262D] text-sm font-semibold transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Reset Defaults</span>
          </button>
          <button 
            onClick={handleSaveSettings}
            className={`flex items-center space-x-2 px-4 py-1.5 rounded-lg text-sm font-bold transition-all shadow-md ${
              isDirty
                ? 'bg-indigo-500 hover:bg-indigo-400 text-white ring-2 ring-indigo-400/50'
                : 'bg-gray-200 text-[#0E1117] hover:bg-white'
            }`}
          >
            <span>{saveStatus || (isDirty ? `Review & Save (${diffs.length})` : 'Save Settings')}</span>
          </button>
        </div>
      </div>

      <div className="flex border-b border-[#30363D] px-4 pt-2 space-x-6 overflow-x-auto bg-[#0E1117]">
        {[
          { id: 'general', label: 'General System' },
          { id: 'credentials', label: '🔑 Bot Credentials' },
          { id: 'github', label: '🐙 GitHub Integration' },
          { id: 'filters', label: 'Filters' },
          { id: 'risk', label: 'Risk Management' },
          { id: 'strategies', label: '⚡ Strategies & SMC' },
          { id: 'autotrade', label: 'Auto-Trade' },
          { id: 'alerts', label: 'Alerts' },
          { id: 'health', label: '⚡ Sync & Health' },
          { id: 'audit', label: '📜 Audit Trail' }
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`pb-3 text-sm font-semibold transition-colors whitespace-nowrap ${
              activeTab === tab.id 
                ? 'text-gray-200 border-b-2 border-gray-200' 
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="p-6 flex-1 overflow-y-auto">
        {activeTab === 'credentials' && (
          <div className="space-y-6 max-w-2xl">
            {/* Persistent Notice */}
            <div className="p-4 bg-emerald-950/30 border border-emerald-500/30 rounded-lg flex items-start space-x-3">
              <div className="w-2 h-2 rounded-full bg-emerald-400 mt-1.5 shrink-0" />
              <div className="text-xs text-gray-400 leading-relaxed">
                <strong className="text-emerald-400 font-semibold">Automatic Cloud Persistence:</strong> All API keys, Telegram tokens, indicator settings, and risk thresholds are automatically saved to your Firestore database and cached locally. Your configuration persists across device restarts and browser sessions.
              </div>
            </div>

            {/* Telegram Bot Credentials */}
            <div className="bg-[#0E1117]/90 border border-[#30363D] rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-[#30363D] pb-3">
                <div>
                  <h3 className="text-sm font-bold text-gray-100 flex items-center gap-2">
                    <span>🤖 Telegram Alert Bot</span>
                  </h3>
                  <p className="text-[11px] text-gray-400 mt-0.5">Receive instant push notifications for trade executions, TP hits, and stop losses.</p>
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${settings.telegramBotToken && settings.telegramChatId ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-gray-800 text-gray-400'}`}>
                  {settings.telegramBotToken && settings.telegramChatId ? 'CONFIGURED' : 'NOT SET'}
                </span>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-xs font-semibold text-gray-400 block mb-1">Telegram Bot Token</label>
                  <div className="relative">
                    <input 
                      type={showBotToken ? 'text' : 'password'} 
                      value={settings.telegramBotToken || ''} 
                      onChange={(e) => handleInputChange('telegramBotToken', e.target.value)} 
                      placeholder="e.g. 123456789:ABCdefGHIjklMNOpqrsTUVwxyz"
                      className="w-full bg-gray-950 border border-[#30363D] rounded-lg p-2.5 text-sm font-mono text-gray-200 pr-10 focus:border-gray-200 focus:outline-none" 
                    />
                    <button 
                      type="button"
                      onClick={() => setShowBotToken(!showBotToken)} 
                      className="absolute right-2.5 top-2.5 text-gray-500 hover:text-gray-400"
                    >
                      {showBotToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-400 block mb-1">Telegram Chat ID / User ID</label>
                  <input 
                    type="text" 
                    value={settings.telegramChatId || ''} 
                    onChange={(e) => handleInputChange('telegramChatId', e.target.value)} 
                    placeholder="e.g. 987654321 or -100123456789"
                    className="w-full bg-gray-950 border border-[#30363D] rounded-lg p-2.5 text-sm font-mono text-gray-200 focus:border-gray-200 focus:outline-none" 
                  />
                </div>

                <div className="pt-2">
                  <button 
                    type="button"
                    onClick={testTelegramConnection} 
                    className="w-full py-2.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 font-bold rounded-lg text-xs transition duration-200 flex items-center justify-center space-x-2"
                  >
                    <span>📡 TEST NOTIFICATION PING</span>
                  </button>
                  {telegramStatus && (
                    <p className="text-xs text-indigo-300 mt-2 font-mono bg-indigo-900/20 py-2 px-3 rounded border border-indigo-500/20">
                      {telegramStatus}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Exchange API Credentials */}
            <div className="bg-[#0E1117]/90 border border-[#30363D] rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-[#30363D] pb-3">
                <div>
                  <h3 className="text-sm font-bold text-gray-100 flex items-center gap-2">
                    <span>⚡ Binance Futures API Credentials</span>
                  </h3>
                  <p className="text-[11px] text-gray-400 mt-0.5">Stored securely in your private cloud document for autonomous execution.</p>
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${settings.binanceApiKey ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30' : 'bg-gray-800 text-gray-400'}`}>
                  {settings.binanceApiKey ? 'KEY SAVED' : 'OPTIONAL'}
                </span>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-xs font-semibold text-gray-400 block mb-1">Binance API Key</label>
                  <div className="relative">
                    <input 
                      type={showApiKey ? 'text' : 'password'} 
                      value={settings.binanceApiKey || ''} 
                      onChange={(e) => handleInputChange('binanceApiKey', e.target.value)} 
                      placeholder="Paste your Binance API Key"
                      className="w-full bg-gray-950 border border-[#30363D] rounded-lg p-2.5 text-sm font-mono text-gray-200 pr-10 focus:border-gray-200 focus:outline-none" 
                    />
                    <button 
                      type="button"
                      onClick={() => setShowApiKey(!showApiKey)} 
                      className="absolute right-2.5 top-2.5 text-gray-500 hover:text-gray-400"
                    >
                      {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-400 block mb-1">Binance Secret Key</label>
                  <div className="relative">
                    <input 
                      type={showApiSecret ? 'text' : 'password'} 
                      value={settings.binanceApiSecret || ''} 
                      onChange={(e) => handleInputChange('binanceApiSecret', e.target.value)} 
                      placeholder="Paste your Binance Secret Key"
                      className="w-full bg-gray-950 border border-[#30363D] rounded-lg p-2.5 text-sm font-mono text-gray-200 pr-10 focus:border-gray-200 focus:outline-none" 
                    />
                    <button 
                      type="button"
                      onClick={() => setShowApiSecret(!showApiSecret)} 
                      className="absolute right-2.5 top-2.5 text-gray-500 hover:text-gray-400"
                    >
                      {showApiSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="flex justify-between items-center py-2 px-1 border-t border-[#30363D]/60">
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-gray-200">Sandbox / Testnet Mode</span>
                    <span className="text-[11px] text-gray-500">Run simulations on Binance Futures testnet vs paper wallet</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleInputChange('binanceTestnet', settings.binanceTestnet !== false ? false : true)}
                    className={`w-10 h-5 rounded-full transition-colors flex items-center px-1 ${
                      settings.binanceTestnet !== false ? 'bg-[#00e696]' : 'bg-gray-700'
                    }`}
                  >
                    <div className={`w-3 h-3 rounded-full bg-white transition-transform ${
                      settings.binanceTestnet !== false ? 'transform translate-x-5' : ''
                    }`} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
        {activeTab === 'github' && (
          <div className="space-y-6 max-w-2xl">
            <div className="p-4 bg-indigo-950/30 border border-indigo-500/30 rounded-lg flex items-start space-x-3">
              <div className="w-2 h-2 rounded-full bg-indigo-400 mt-1.5 shrink-0" />
              <div className="text-xs text-gray-400 leading-relaxed">
                <strong className="text-indigo-400 font-semibold">One-Click GitHub Sync:</strong> You can push all trading engine code, settings, and strategies directly to your GitHub repository with a single click. Enter your Personal Access Token below to authorize the push.
              </div>
            </div>

            <div className="bg-[#0E1117]/90 border border-[#30363D] rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-[#30363D] pb-3">
                <div>
                  <h3 className="text-sm font-bold text-gray-100 flex items-center gap-2">
                    <Github className="w-4 h-4 text-indigo-400" />
                    <span>GitHub Integration</span>
                  </h3>
                  <p className="text-[11px] text-gray-400 mt-0.5">Push your code directly to your remote repository.</p>
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${settings.githubPat ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30' : 'bg-gray-800 text-gray-400'}`}>
                  {settings.githubPat ? 'TOKEN SAVED' : 'NOT SET'}
                </span>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-gray-400 block mb-1">GitHub Personal Access Token</label>
                  <input 
                    type="password"
                    value={settings.githubPat || ''} 
                    onChange={(e) => handleInputChange('githubPat', e.target.value)} 
                    placeholder="ghp_..."
                    className="w-full bg-gray-950 border border-[#30363D] rounded-lg p-2.5 text-sm font-mono text-gray-200 focus:border-gray-200 focus:outline-none" 
                  />
                  <p className="text-[10px] text-gray-500 mt-1">Requires 'repo' scope.</p>
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-400 block mb-1">Repository URL</label>
                  <input 
                    type="text"
                    value={settings.githubRepoUrl || ''} 
                    onChange={(e) => handleInputChange('githubRepoUrl', e.target.value)} 
                    placeholder="https://github.com/danish7355/quant-stack.git"
                    className="w-full bg-gray-950 border border-[#30363D] rounded-lg p-2.5 text-sm font-mono text-gray-200 focus:border-gray-200 focus:outline-none" 
                  />
                </div>

                <div className="flex items-center space-x-2 pt-2">
                  <input 
                    type="checkbox" 
                    id="forcePush" 
                    checked={forcePush} 
                    onChange={(e) => setForcePush(e.target.checked)}
                    className="w-4 h-4 rounded border-[#30363D] bg-[#0E1117] text-indigo-500 focus:ring-indigo-500 focus:ring-offset-gray-900"
                  />
                  <label htmlFor="forcePush" className="text-xs font-semibold text-gray-400">
                    Force Push (Overwrite remote changes)
                  </label>
                </div>

                <div className="pt-2">
                  <button 
                    type="button"
                    onClick={() => handleGitPush()}
                    disabled={isPushing}
                    className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold rounded-lg text-xs transition duration-200 flex items-center justify-center space-x-2 shadow-md shadow-indigo-950"
                  >
                    {isPushing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
                    <span>{isPushing ? 'PUSHING TO GITHUB...' : 'PUSH CODE TO GITHUB'}</span>
                  </button>
                  {gitStatus && (
                    <div className={`text-xs mt-3 font-mono py-2.5 px-3 rounded border space-y-2 ${
                      gitStatus.includes('Error') || gitStatus.includes('Failed') 
                        ? 'bg-red-900/20 text-red-300 border-red-500/30' 
                        : 'bg-emerald-900/20 text-emerald-300 border-emerald-500/30'
                    }`}>
                      <p className="leading-relaxed">{gitStatus}</p>
                      {gitStatus.includes('Force Push') && (
                        <button
                          type="button"
                          onClick={() => handleGitPush(true)}
                          disabled={isPushing}
                          className="w-full py-2 px-3 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded text-xs transition duration-150 flex items-center justify-center space-x-1.5 shadow"
                        >
                          <UploadCloud className="w-3.5 h-3.5" />
                          <span>⚡ Overwrite Remote & Force Push Now</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
        {activeTab === 'general' && (
          <div className="space-y-2">
            <InputRow label="Scan Interval (Secs)" desc="How often the scanner runs" value={settings.scanInterval} onChange={(v: any) => handleInputChange('scanInterval', v)} min={5} max={3600} />
            
            <div className="flex justify-between items-center py-4 border-b border-[#30363D]/50">
              <div className="flex flex-col">
                <span className="text-sm font-bold text-gray-200">Coins to Scan</span>
                <span className="text-[11px] text-gray-500">Number of top volume Binance Futures pairs to scan (10 - 100).</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="flex bg-[#161B22] rounded p-1 border border-[#30363D] mr-2">
                  {[10, 20, 30, 50, 100].map((count) => (
                    <button
                      key={count}
                      type="button"
                      onClick={() => handleInputChange('coinCount', count)}
                      className={`px-2.5 py-1 rounded text-xs font-bold transition-all ${
                        settings.coinCount === count
                          ? 'bg-gray-200 text-[#0E1117]'
                          : 'text-gray-400 hover:text-gray-200'
                      }`}
                    >
                      {count}
                    </button>
                  ))}
                </div>
                <LocalNumberInput
                  value={settings.coinCount}
                  onChange={(v: any) => handleInputChange('coinCount', Math.max(10, Math.min(v || 10, 100)))}
                  className="w-16 bg-[#0E1117] border border-[#30363D] rounded p-1.5 text-right font-mono text-sm font-semibold text-gray-400 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>
            
            <div className="flex justify-between items-center py-4 border-b border-[#30363D]/50">
              <div className="flex flex-col">
                <span className="text-sm font-bold text-gray-200">Timeframe</span>
                <span className="text-[11px] text-gray-500">Base timeframe for all algorithmic indicators.</span>
              </div>
              <div className="flex bg-[#161B22] rounded p-1 border border-[#30363D]">
                {['1m', '5m', '15m', '1H', '4H', '1D'].map((tf) => (
                  <button
                    key={tf}
                    onClick={() => handleInputChange('timeframe', tf)}
                    className={`px-3 py-1 rounded text-xs font-bold transition-all ${settings.timeframe === tf ? 'bg-gray-200 text-[#0E1117]' : 'text-gray-400 hover:text-gray-200'}`}
                  >
                    {tf}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex justify-between items-center py-4 border-b border-[#30363D]/50">
              <div className="flex flex-col">
                <span className="text-sm font-bold text-gray-200">Auto Trade Execution Engine</span>
                <span className="text-[11px] text-gray-500">Allow bot to automatically open paper positions on strict trigger.</span>
              </div>
              <button
                onClick={() => handleInputChange('autoTradeEnabled', !settings.autoTradeEnabled)}
                className={`w-12 h-6 rounded-full transition-colors flex items-center px-1 ${settings.autoTradeEnabled ? 'bg-[#00e696]' : 'bg-gray-700'}`}
              >
                <div className={`w-4 h-4 rounded-full bg-white transition-transform ${settings.autoTradeEnabled ? 'transform translate-x-6' : ''}`} />
              </button>
            </div>
            
            <div className="flex justify-between items-center py-4 border-b border-[#30363D]/50">
              <div className="flex flex-col">
                <span className="text-sm font-bold text-gray-200">Starting Paper Balance</span>
                <span className="text-[11px] text-gray-500">Wipe current performance data and reset equity.</span>
              </div>
              <div className="flex items-center space-x-2">
                <LocalNumberInput
                  value={settings.startingBalance}
                  onChange={(v: any) => handleInputChange('startingBalance', v)}
                  className="w-24 bg-[#0E1117] border border-[#30363D] rounded p-1.5 text-right font-mono text-sm font-semibold text-gray-400 focus:outline-none focus:border-indigo-500"
                />
                <button
                  onClick={() => onResetBalance(settings.startingBalance)}
                  className="px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 font-bold text-xs rounded border border-rose-500/30 transition-colors"
                >
                  RESET
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'filters' && (
          <div className="space-y-4">
            <div className="bg-[#0E1117]/90 rounded-xl border border-[#30363D] p-5 divide-y divide-[#30363D]/40">
              <ToggleRow
                label="Global BTC Macro Trend & Volatility Filter"
                desc="Pauses altcoin trade entries during BTC flash-crashes or extreme macro bear regimes. Disable to trade altcoins completely independently."
                checked={settings.useGlobalBtcFilter}
                onChange={(v: boolean) => handleInputChange('useGlobalBtcFilter', v)}
                activeBadgeText="FILTER ACTIVE"
                inactiveBadgeText="BYPASSED (OFF)"
                highRisk={false}
              />
              <InputRow label="Minimum 24h Volume (USDT)" desc="Skip coins with 24h volume below this threshold (e.g. $25,000,000)" value={settings.min24hVolume} onChange={(v: any) => handleInputChange('min24hVolume', v)} />
              <InputRow label="Max Funding Rate %" desc="Skip coins with extreme perpetual funding rates (e.g. 0.15%)" value={settings.maxFundingRate} onChange={(v: any) => handleInputChange('maxFundingRate', v)} />
              <InputRow label="Max Bid/Ask Spread %" desc="Skip coins with wide bid/ask spreads to avoid high slippage (e.g. 0.3%)" value={settings.maxSpread} onChange={(v: any) => handleInputChange('maxSpread', v)} />
            </div>
          </div>
        )}

        {activeTab === 'risk' && (
          <div className="space-y-6">
            {/* Risk Control Notice Banner */}
            {(() => {
              const bypassedList = [
                settings.bypassMaxPositions && 'Max Positions',
                settings.bypassMaxConsecutiveLosses && 'Loss Streak',
                settings.bypassDailyLossLimit && 'Daily Loss',
                settings.bypassExposureLimit && 'Total Exposure',
                settings.bypassLiquidationBuffer && 'Liquidation Buffer',
                settings.bypassTradeCooldown && 'Cooldown Timer',
              ].filter(Boolean) as string[];
              const isBypassed = bypassedList.length > 0;

              return (
                <div className={`p-4 rounded-xl border flex flex-col lg:flex-row lg:items-center justify-between gap-4 transition-all ${
                  settings.killSwitchActive
                    ? 'bg-rose-950/40 border-rose-500/60 shadow-lg shadow-rose-950/30'
                    : isBypassed
                    ? 'bg-amber-950/30 border-amber-500/50 shadow-lg shadow-amber-950/20'
                    : 'bg-indigo-950/20 border-indigo-500/30'
                }`}>
                  <div className="flex items-start space-x-3.5">
                    <div className={`w-3 h-3 rounded-full mt-1 shrink-0 ${
                      settings.killSwitchActive
                        ? 'bg-rose-500 animate-ping'
                        : isBypassed
                        ? 'bg-amber-400 animate-pulse'
                        : 'bg-indigo-400'
                    }`} />
                    <div className="text-xs text-gray-300 leading-relaxed">
                      <strong className={
                        settings.killSwitchActive
                          ? 'text-rose-400 font-bold'
                          : isBypassed
                          ? 'text-amber-400 font-bold'
                          : 'text-indigo-300 font-bold'
                      }>
                        {settings.killSwitchActive
                          ? '🚨 EMERGENCY KILL SWITCH ACTIVE:'
                          : isBypassed
                          ? `⚡ Circuit Breakers Bypassed (${bypassedList.length}):`
                          : '🛡️ Risk Circuit Breakers Enforced:'}
                      </strong>{' '}
                      {settings.killSwitchActive
                        ? 'All automated trade entries are strictly halted by the emergency interrupter. Click Disengage below to resume trading.'
                        : isBypassed
                        ? `Bypasses active for: ${bypassedList.join(', ')}. Qualified signals will bypass these gating checks directly into order execution.`
                        : `RiskManager enforces max ${settings.maxConcurrentTrades || 10} positions, max ${settings.maxConsecutiveLosses ?? 4} consecutive losses, and ${settings.dailyLossLimitPct ?? 3}% daily loss limit.`}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0 self-end lg:self-center pl-6 lg:pl-0">
                    {resetLossStatus && (
                      <span className="text-[11px] font-mono text-emerald-400 font-bold px-2 py-0.5 rounded bg-emerald-950/50 border border-emerald-500/30">
                        {resetLossStatus}
                      </span>
                    )}
                    {resetDailyLossStatus && (
                      <span className="text-[11px] font-mono text-emerald-400 font-bold px-2 py-0.5 rounded bg-emerald-950/50 border border-emerald-500/30">
                        {resetDailyLossStatus}
                      </span>
                    )}
                    {killSwitchStatus && (
                      <span className="text-[11px] font-mono text-amber-300 font-bold px-2 py-0.5 rounded bg-amber-950/50 border border-amber-500/30">
                        {killSwitchStatus}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={handleResetLossStreak}
                      disabled={isResettingLosses}
                      className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold text-xs flex items-center gap-1.5 transition-colors shadow cursor-pointer"
                      title="Reset consecutive loss counter back to 0"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isResettingLosses ? 'animate-spin' : ''}`} />
                      <span>{isResettingLosses ? 'Resetting...' : 'Reset Losses'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleResetDailyLoss}
                      disabled={isResettingDailyLoss}
                      className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold text-xs flex items-center gap-1.5 transition-colors shadow cursor-pointer"
                      title="Reset today's recorded loss % back to 0%"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isResettingDailyLoss ? 'animate-spin' : ''}`} />
                      <span>{isResettingDailyLoss ? 'Resetting...' : 'Reset Daily Loss'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleToggleKillSwitch}
                      disabled={isTogglingKillSwitch}
                      className={`px-3 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1.5 transition-colors shadow cursor-pointer text-white ${
                        settings.killSwitchActive
                          ? 'bg-rose-600 hover:bg-rose-500 ring-2 ring-rose-400'
                          : 'bg-gray-800 hover:bg-gray-700 border border-gray-700'
                      }`}
                    >
                      <ShieldAlert className="w-3.5 h-3.5" />
                      <span>{settings.killSwitchActive ? 'Disengage Kill Switch' : 'Kill Switch'}</span>
                    </button>
                  </div>
                </div>
              );
            })()}

            {/* SECTION 1: Circuit Breakers & Execution Bypass Switches */}
            <div className="bg-[#0E1117]/90 rounded-xl border border-[#30363D] p-5 space-y-4">
              <div className="border-b border-[#30363D] pb-3">
                <h3 className="text-sm font-bold text-gray-100 flex items-center gap-2">
                  <span>⚡ Execution Circuit Breakers & Bypass Switches</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    UNBLOCK TRADES
                  </span>
                </h3>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  Toggle individual risk filters and circuit breakers OFF to allow automated trade entries without being stopped by risk safety rules.
                </p>
              </div>

              <div className="divide-y divide-[#30363D]/40">
                <ToggleRow
                  label="Bypass Max Positions Limit"
                  desc="Bypasses the 'Max simultaneous positions reached' block in RiskManager. Enables entering new trade signals regardless of how many positions are currently open."
                  checked={settings.bypassMaxPositions}
                  onChange={(v: boolean) => handleInputChange('bypassMaxPositions', v)}
                />
                <ToggleRow
                  label="Bypass Max Consecutive Losses"
                  desc="Bypasses the 'Max consecutive losses reached' block. Enables continuing autonomous entries without pausing after losing streaks."
                  checked={settings.bypassMaxConsecutiveLosses}
                  onChange={(v: boolean) => handleInputChange('bypassMaxConsecutiveLosses', v)}
                />
                <ToggleRow
                  label="Bypass Daily Loss Limit"
                  desc="Bypasses the 'Daily loss limit reached' circuit breaker. Allows new trade entries even if net PnL drops below the daily loss limit threshold."
                  checked={settings.bypassDailyLossLimit}
                  onChange={(v: boolean) => handleInputChange('bypassDailyLossLimit', v)}
                />
                <ToggleRow
                  label="Bypass Portfolio Total Exposure Limit"
                  desc="Bypasses the 'Exposure limit exceeded' / 'Portfolio exposure limit reached' gates. Allows placing new trades regardless of total active margin allocation."
                  checked={settings.bypassExposureLimit}
                  onChange={(v: boolean) => handleInputChange('bypassExposureLimit', v)}
                />
                <ToggleRow
                  label="Bypass Liquidation Safety Buffer"
                  desc="Bypasses strict liquidation distance buffer (1.3x). Automatically scales down to 1x unleveraged entry instead of rejecting wide stop distances."
                  checked={settings.bypassLiquidationBuffer}
                  onChange={(v: boolean) => handleInputChange('bypassLiquidationBuffer', v)}
                />
                <ToggleRow
                  label="Bypass Trade Rejection Cooldown"
                  desc="Bypasses the 60-second cooldown timer on symbols after skipped or rejected signals, allowing instant re-evaluation on every scanning cycle."
                  checked={settings.bypassTradeCooldown}
                  onChange={(v: boolean) => handleInputChange('bypassTradeCooldown', v)}
                />
                <ToggleRow
                  label="Allow Fractional Contracts / Micro Sizing"
                  desc="Allows sub-unit contract quantities (e.g. 0.005 BTC) so trades are not rejected with 'rounds to 0 contracts' on high-priced assets."
                  checked={settings.allowFractionalContracts !== false}
                  onChange={(v: boolean) => handleInputChange('allowFractionalContracts', v)}
                  activeBadgeText="ENABLED"
                  inactiveBadgeText="INTEGER ONLY"
                  highRisk={false}
                />
              </div>
            </div>

            {/* SECTION 2: Granular Risk Limits & Thresholds */}
            <div className="bg-[#0E1117]/90 rounded-xl border border-[#30363D] p-5 space-y-4">
              <div className="border-b border-[#30363D] pb-3">
                <h3 className="text-sm font-bold text-gray-100 flex items-center gap-2">
                  <span>⚙️ Risk Limits & Position Sizing Parameters</span>
                </h3>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  Fine-tune risk ceilings, account allocation percentages, leverage multipliers, and liquidation buffers.
                </p>
              </div>

              <div className="divide-y divide-[#30363D]/40">
                <InputRow 
                  label="Max Open Trades / Positions" 
                  desc="Ceiling of simultaneous positions enforced by RiskManager (1 - 50). Ignored if Bypass Max Positions is ON." 
                  value={settings.maxConcurrentTrades} 
                  onChange={(v: any) => handleInputChange('maxConcurrentTrades', v)} 
                  min={1} 
                  max={50} 
                />
                <InputRow 
                  label="Max Consecutive Losses" 
                  desc="Pause new entries after this many consecutive losing trades (1 - 20, default: 4). Ignored if Bypass Losses is ON." 
                  value={settings.maxConsecutiveLosses ?? 4} 
                  onChange={(v: any) => handleInputChange('maxConsecutiveLosses', v)} 
                  min={1} 
                  max={20} 
                />
                <InputRow 
                  label="Max Daily Loss %" 
                  desc="Circuit breaker threshold (0.5% - 25%). Halts new entries for the day if net PnL drops below this. Ignored if Daily Loss Bypass is ON." 
                  value={settings.dailyLossLimitPct} 
                  onChange={(v: any) => handleInputChange('dailyLossLimitPct', v)} 
                  min={0.5} 
                  max={25} 
                />
                <InputRow 
                  label="Max Portfolio Total Exposure %" 
                  desc="Maximum aggregate margin exposure across all active positions relative to account equity (10% - 1000%, default: 100%). Ignored if Exposure Bypass is ON." 
                  value={settings.maxPortfolioExposurePct ?? 100} 
                  onChange={(v: any) => handleInputChange('maxPortfolioExposurePct', v)} 
                  min={10} 
                  max={1000} 
                />
                <InputRow 
                  label="Account Risk Per Trade %" 
                  desc="% of account equity risked on stop-loss distance (e.g. 1.0% = 0.01)" 
                  value={settings.accountRiskPct} 
                  onChange={(v: any) => handleInputChange('accountRiskPct', v)} 
                  min={0.1} 
                  max={10} 
                />
                <InputRow 
                  label="Position Margin per Trade %" 
                  desc="Maximum capital allocation ceiling % of balance per single position" 
                  value={settings.positionSizePct} 
                  onChange={(v: any) => handleInputChange('positionSizePct', v)} 
                  min={0.1} 
                  max={100} 
                />
                <InputRow 
                  label="Leverage Multiplier" 
                  desc="Cross margin leverage multiplier (1x - 125x)" 
                  value={settings.leverage} 
                  onChange={(v: any) => handleInputChange('leverage', v)} 
                  min={1} 
                  max={125} 
                />
                <InputRow 
                  label="Min Liquidation Safety Buffer" 
                  desc="Minimum required ratio between liquidation distance and stop-loss distance (1.01x - 3.0x, default: 1.30x). Lower values allow tighter leverage." 
                  value={settings.minLiquidationBuffer ?? 1.3} 
                  onChange={(v: any) => handleInputChange('minLiquidationBuffer', v)} 
                  min={1.01} 
                  max={3.0} 
                />
                <InputRow 
                  label="Max Single Position Exposure Multiplier" 
                  desc="Maximum notional value of a single position as a multiple of account equity (1x - 50x, default: 5x)" 
                  value={settings.maxSinglePositionExposureMult ?? 5} 
                  onChange={(v: any) => handleInputChange('maxSinglePositionExposureMult', v)} 
                  min={1} 
                  max={50} 
                />
                <InputRow 
                  label="Min Viable Stop Distance %" 
                  desc="Minimum viable stop-loss distance used for position sizing math (0.0005 - 0.05, default: 0.005 = 0.5%)" 
                  value={settings.minStopDistancePct ?? 0.005} 
                  onChange={(v: any) => handleInputChange('minStopDistancePct', v)} 
                  min={0.0005} 
                  max={0.05} 
                />
                <InputRow 
                  label="Trade Rejection Cooldown (Seconds)" 
                  desc="Cooldown wait duration on a symbol after a trade is rejected or skipped (0 - 600s, default: 60s). Set to 0 or use bypass to eliminate wait." 
                  value={settings.tradeCooldownSeconds ?? 60} 
                  onChange={(v: any) => handleInputChange('tradeCooldownSeconds', v)} 
                  min={0} 
                  max={600} 
                />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'strategies' && (
          <div className="space-y-6 max-w-4xl">
            {/* Strategy Selection Callout */}
            <div className="p-4 bg-purple-950/20 border border-purple-500/30 rounded-xl flex items-start space-x-3">
              <div className="w-2.5 h-2.5 rounded-full bg-purple-400 mt-1 shrink-0" />
              <div className="text-xs text-gray-300 leading-relaxed">
                <strong className="text-purple-300 font-semibold">Institutional Multi-Strategy Parameters:</strong> Configure granular indicators, entry gates, confirmation thresholds, and risk-to-reward ratios for all 4 algorithmic engines. Changes take effect on the very next scanning cycle.
              </div>
            </div>

            {/* SECTION 1: SMC High-Probability Strategy */}
            <div className="bg-[#0E1117]/90 border border-[#30363D] rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-[#30363D] pb-3">
                <div>
                  <h3 className="text-sm font-bold text-gray-100 flex items-center gap-2">
                    <span>💧 Smart Money Concepts (SMC) Liquidity Sweep Parameters</span>
                  </h3>
                  <p className="text-[11px] text-gray-400 mt-0.5">High-probability price-action algorithm targeting liquidity sweeps, MSS displacement, and FVG/OB retests.</p>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                  INSTITUTIONAL
                </span>
              </div>

              <div className="divide-y divide-[#30363D]/40">
                <div className="flex justify-between items-center py-3">
                  <div className="flex flex-col">
                    <span className="text-sm font-bold text-gray-200">Higher-Timeframe (HTF) Resolution</span>
                    <span className="text-[11px] text-gray-500">Timeframe used to establish institutional HTF market structure & trend direction.</span>
                  </div>
                  <div className="flex bg-[#161B22] rounded p-1 border border-[#30363D]">
                    {['15m', '1h', '4h', '1d'].map((res) => (
                      <button
                        key={res}
                        type="button"
                        onClick={() => handleInputChange('smcHtfResolution', res)}
                        className={`px-3 py-1 rounded text-xs font-bold transition-all ${
                          (settings.smcHtfResolution || '1h') === res
                            ? 'bg-purple-600 text-white'
                            : 'text-gray-400 hover:text-gray-200'
                        }`}
                      >
                        {res}
                      </button>
                    ))}
                  </div>
                </div>

                <InputRow 
                  label="Structure Pivot Length (Bars)" 
                  desc="Number of left/right bars required to confirm a Swing High or Swing Low pivot" 
                  value={settings.smcStructureLen ?? 10} 
                  onChange={(v: any) => handleInputChange('smcStructureLen', v)} 
                  min={3} 
                  max={50} 
                />
                <InputRow 
                  label="Min Sweep Wick/Body Ratio" 
                  desc="Minimum ratio of wick extension to candle body size confirming a stop hunt" 
                  value={settings.smcWickRatio ?? 0.6} 
                  onChange={(v: any) => handleInputChange('smcWickRatio', v)} 
                  min={0.2} 
                  max={2.0} 
                />
                <InputRow 
                  label="Min Sweep Extension (%)" 
                  desc="Minimum percentage beyond swing pivot high/low required to trigger a sweep (e.g. 0.0015 = 0.15%)" 
                  value={settings.smcMinSweepWickPct ?? 0.0015} 
                  onChange={(v: any) => handleInputChange('smcMinSweepWickPct', v)} 
                  min={0.0005} 
                  max={0.05} 
                />
                <InputRow 
                  label="MSS Displacement ATR Multiplier" 
                  desc="Displacement body size must exceed this multiple of ATR to confirm Market Structure Shift" 
                  value={settings.smcDispAtrMult ?? 0.5} 
                  onChange={(v: any) => handleInputChange('smcDispAtrMult', v)} 
                  min={0.2} 
                  max={5.0} 
                />
                <InputRow 
                  label="Sweep-to-MSS Max Bars Window" 
                  desc="Maximum candles allowed between liquidity sweep and displacement MSS confirmation" 
                  value={settings.smcSweepConfirmWindow ?? 10} 
                  onChange={(v: any) => handleInputChange('smcSweepConfirmWindow', v)} 
                  min={3} 
                  max={50} 
                />
                <InputRow 
                  label="MSS Volume Confirmation Multiplier" 
                  desc="Displacement candle volume must be at least this multiple of the 20-period volume SMA" 
                  value={settings.smcVolMult ?? 1.5} 
                  onChange={(v: any) => handleInputChange('smcVolMult', v)} 
                  min={1.0} 
                  max={5.0} 
                />
                <InputRow 
                  label="MSS-to-FVG Max Bars Window" 
                  desc="Maximum candles after MSS displacement to identify an active Fair Value Gap (FVG)" 
                  value={settings.smcFvgAfterMssWindow ?? 5} 
                  onChange={(v: any) => handleInputChange('smcFvgAfterMssWindow', v)} 
                  min={2} 
                  max={30} 
                />
                <InputRow 
                  label="Order Block Lookback Bars" 
                  desc="Number of candles searched back from MSS to detect origin Order Block (OB)" 
                  value={settings.smcObLookback ?? 30} 
                  onChange={(v: any) => handleInputChange('smcObLookback', v)} 
                  min={10} 
                  max={100} 
                />
                <InputRow 
                  label="Stop Loss ATR Multiplier" 
                  desc="Protective buffer added beyond sweep extreme in multiples of ATR" 
                  value={settings.smcAtrStopMult ?? 1.5} 
                  onChange={(v: any) => handleInputChange('smcAtrStopMult', v)} 
                  min={0.5} 
                  max={5.0} 
                />
                <InputRow 
                  label="Target Risk:Reward Ratio" 
                  desc="Fixed structural take-profit target multiple relative to initial risk distance" 
                  value={settings.smcRrRatio ?? 3.0} 
                  onChange={(v: any) => handleInputChange('smcRrRatio', v)} 
                  min={1.5} 
                  max={10.0} 
                />

                <div className="flex justify-between items-center py-3">
                  <div className="flex flex-col">
                    <span className="text-sm font-bold text-gray-200">Session Kill Zone Enforcement</span>
                    <span className="text-[11px] text-gray-500">Only execute during London (07:00-10:00 UTC) & New York (12:00-15:00 UTC) peak liquidity sessions.</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleInputChange('smcUseKillZone', !settings.smcUseKillZone)}
                    className={`w-12 h-6 rounded-full transition-colors flex items-center px-1 shrink-0 ${
                      settings.smcUseKillZone ? 'bg-purple-600' : 'bg-gray-700'
                    }`}
                  >
                    <div className={`w-4 h-4 rounded-full bg-white transition-transform ${settings.smcUseKillZone ? 'transform translate-x-6' : ''}`} />
                  </button>
                </div>

                <div className="flex justify-between items-center py-3">
                  <div className="flex flex-col">
                    <span className="text-sm font-bold text-gray-200">Strict HTF Structure Alignment</span>
                    <span className="text-[11px] text-gray-500">Block Longs when HTF is Bearish, block Shorts when HTF is Bullish.</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleInputChange('smcStrictHtfRegime', !settings.smcStrictHtfRegime)}
                    className={`w-12 h-6 rounded-full transition-colors flex items-center px-1 shrink-0 ${
                      settings.smcStrictHtfRegime ? 'bg-purple-600' : 'bg-gray-700'
                    }`}
                  >
                    <div className={`w-4 h-4 rounded-full bg-white transition-transform ${settings.smcStrictHtfRegime ? 'transform translate-x-6' : ''}`} />
                  </button>
                </div>
              </div>
            </div>

            {/* SECTION 2: Trend Pullback Strategy */}
            <div className="bg-[#0E1117]/90 border border-[#30363D] rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-[#30363D] pb-3">
                <div>
                  <h3 className="text-sm font-bold text-gray-100 flex items-center gap-2">
                    <span>🎯 Trend Pullback (HTF + MTF Retest) Parameters</span>
                  </h3>
                  <p className="text-[11px] text-gray-400 mt-0.5">Trend-following retest engine with EMA alignment, ADX momentum, and volume surge filtering.</p>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30">
                  TREND FOLLOWING
                </span>
              </div>

              <div className="divide-y divide-[#30363D]/40">
                <InputRow label="Fast EMA Period" desc="Fast EMA period for dynamic pullback detection (default: 20)" value={settings.tpbEmaFast ?? 20} onChange={(v: any) => handleInputChange('tpbEmaFast', v)} min={5} max={100} />
                <InputRow label="Slow EMA Period" desc="Slow baseline EMA period for trend direction (default: 50)" value={settings.tpbEmaSlow ?? 50} onChange={(v: any) => handleInputChange('tpbEmaSlow', v)} min={20} max={200} />
                <InputRow label="Minimum ADX Momentum" desc="ADX must be above this threshold to confirm strong directional trend (default: 18)" value={settings.tpbAdxMin ?? 18} onChange={(v: any) => handleInputChange('tpbAdxMin', v)} min={10} max={50} />
                <InputRow label="Volume SMA Lookback Period" desc="Lookback period for baseline volume moving average (default: 20)" value={settings.tpbVolumeSmaPeriod ?? 20} onChange={(v: any) => handleInputChange('tpbVolumeSmaPeriod', v)} min={5} max={50} />
                <InputRow label="Min Volume Surge Ratio" desc="Retest bounce candle volume vs SMA ratio (default: 1.0x)" value={settings.tpbMinVolumeRatio ?? 1.0} onChange={(v: any) => handleInputChange('tpbMinVolumeRatio', v)} min={0.5} max={5.0} />
                <InputRow label="Max Entry Distance from EMA (x ATR)" desc="Maximum allowable price extension from Fast EMA to trigger entry (default: 0.25)" value={settings.tpbMaxEntryDistanceAtr ?? 0.25} onChange={(v: any) => handleInputChange('tpbMaxEntryDistanceAtr', v)} min={0.1} max={3.0} />
                <InputRow label="Min Stop Distance (x ATR)" desc="Minimum stop distance in ATR units to reject market noise (default: 0.8)" value={settings.tpbMinStopDistanceAtr ?? 0.8} onChange={(v: any) => handleInputChange('tpbMinStopDistanceAtr', v)} min={0.2} max={2.0} />
                <InputRow label="Max Stop Distance (x ATR)" desc="Maximum allowable stop distance in ATR units for timeframe (default: 3.0)" value={settings.tpbMaxStopDistanceAtr ?? 3.0} onChange={(v: any) => handleInputChange('tpbMaxStopDistanceAtr', v)} min={1.0} max={6.0} />
                <InputRow label="Max Spread / Slippage (x ATR)" desc="Maximum allowable spread in ATR units before entry is blocked (default: 0.3)" value={settings.tpbMaxSpreadAtr ?? 0.3} onChange={(v: any) => handleInputChange('tpbMaxSpreadAtr', v)} min={0.05} max={1.0} />
                <InputRow label="Minimum Risk-to-Reward Ratio" desc="Required minimum asymmetric target multiple (default: 1.5)" value={settings.tpbMinRrRatio ?? 1.5} onChange={(v: any) => handleInputChange('tpbMinRrRatio', v)} min={1.0} max={5.0} />
                <InputRow label="Min Confirmation Score" desc="Minimum 5-pillar confirmation score required to enter trade (default: 8/10)" value={settings.tpbMinScore ?? 8} onChange={(v: any) => handleInputChange('tpbMinScore', v)} min={5} max={10} />
                <InputRow label="Stop Loss ATR Buffer" desc="Buffer added beyond recent swing low/high in multiples of ATR (default: 0.3)" value={settings.tpbAtrBuffer ?? 0.3} onChange={(v: any) => handleInputChange('tpbAtrBuffer', v)} min={0.1} max={2.0} />

                <div className="flex justify-between items-center py-3">
                  <div className="flex flex-col">
                    <span className="text-sm font-bold text-gray-200">Allow Long Setups</span>
                    <span className="text-[11px] text-gray-500">Enable bullish trend-pullback trade execution.</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleInputChange('tpbAllowLongs', settings.tpbAllowLongs === false)}
                    className={`w-12 h-6 rounded-full transition-colors flex items-center px-1 shrink-0 ${
                      settings.tpbAllowLongs !== false ? 'bg-blue-600' : 'bg-gray-700'
                    }`}
                  >
                    <div className={`w-4 h-4 rounded-full bg-white transition-transform ${settings.tpbAllowLongs !== false ? 'transform translate-x-6' : ''}`} />
                  </button>
                </div>

                <div className="flex justify-between items-center py-3">
                  <div className="flex flex-col">
                    <span className="text-sm font-bold text-gray-200">Allow Short Setups</span>
                    <span className="text-[11px] text-gray-500">Enable bearish trend-pullback trade execution.</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleInputChange('tpbAllowShorts', settings.tpbAllowShorts === false)}
                    className={`w-12 h-6 rounded-full transition-colors flex items-center px-1 shrink-0 ${
                      settings.tpbAllowShorts !== false ? 'bg-blue-600' : 'bg-gray-700'
                    }`}
                  >
                    <div className={`w-4 h-4 rounded-full bg-white transition-transform ${settings.tpbAllowShorts !== false ? 'transform translate-x-6' : ''}`} />
                  </button>
                </div>

                <div className="flex justify-between items-center py-3">
                  <div className="flex flex-col">
                    <span className="text-sm font-bold text-gray-200">Allow Broad Structural Stops</span>
                    <span className="text-[11px] text-gray-500">If false, prefers Local Execution Stop and rejects distant HTF stops.</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleInputChange('tpbAllowBroadStop', !settings.tpbAllowBroadStop)}
                    className={`w-12 h-6 rounded-full transition-colors flex items-center px-1 shrink-0 ${
                      settings.tpbAllowBroadStop ? 'bg-blue-600' : 'bg-gray-700'
                    }`}
                  >
                    <div className={`w-4 h-4 rounded-full bg-white transition-transform ${settings.tpbAllowBroadStop ? 'transform translate-x-6' : ''}`} />
                  </button>
                </div>

                <div className="flex justify-between items-center py-3">
                  <div className="flex flex-col">
                    <span className="text-sm font-bold text-gray-200">Unconfirmed Volume Mode</span>
                    <span className="text-[11px] text-gray-500">Allow signal execution when exchange volume is unconfirmed (marked lower confidence).</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleInputChange('tpbAllowUnconfirmedVolume', !settings.tpbAllowUnconfirmedVolume)}
                    className={`w-12 h-6 rounded-full transition-colors flex items-center px-1 shrink-0 ${
                      settings.tpbAllowUnconfirmedVolume ? 'bg-blue-600' : 'bg-gray-700'
                    }`}
                  >
                    <div className={`w-4 h-4 rounded-full bg-white transition-transform ${settings.tpbAllowUnconfirmedVolume ? 'transform translate-x-6' : ''}`} />
                  </button>
                </div>

                <div className="flex justify-between items-center py-3">
                  <div className="flex flex-col">
                    <span className="text-sm font-bold text-gray-200">Require Volume Surge</span>
                    <span className="text-[11px] text-gray-500">Block retest setups that lack confirmed volume expansion.</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleInputChange('tpbRequireVolume', !settings.tpbRequireVolume)}
                    className={`w-12 h-6 rounded-full transition-colors flex items-center px-1 shrink-0 ${
                      settings.tpbRequireVolume !== false ? 'bg-blue-600' : 'bg-gray-700'
                    }`}
                  >
                    <div className={`w-4 h-4 rounded-full bg-white transition-transform ${settings.tpbRequireVolume !== false ? 'transform translate-x-6' : ''}`} />
                  </button>
                </div>
              </div>
            </div>

            {/* SECTION 3: Ranging 1:3 R:R Mean-Reversion */}
            <div className="bg-[#0E1117]/90 border border-[#30363D] rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-[#30363D] pb-3">
                <div>
                  <h3 className="text-sm font-bold text-gray-100 flex items-center gap-2">
                    <span>🌊 Ranging 1:3 R:R Mean-Reversion Parameters</span>
                  </h3>
                  <p className="text-[11px] text-gray-400 mt-0.5">Bollinger Band extremes and RSI overbought/oversold mean-reversion algorithm.</p>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                  MEAN-REVERSION
                </span>
              </div>

              <div className="divide-y divide-[#30363D]/40">
                <InputRow label="Bollinger Bands Period" desc="Moving average period for band center (default: 20)" value={settings.rmrBbPeriod ?? 20} onChange={(v: any) => handleInputChange('rmrBbPeriod', v)} min={10} max={50} />
                <InputRow label="Bollinger Bands StdDev" desc="Standard deviations for upper and lower bands (default: 2.0)" value={settings.rmrBbStdDev ?? 2.0} onChange={(v: any) => handleInputChange('rmrBbStdDev', v)} min={1.0} max={3.5} />
                <InputRow label="RSI Oversold Level" desc="RSI must dip below this to trigger Long mean-reversion (default: 35)" value={settings.rmrRsiOversold ?? 35} onChange={(v: any) => handleInputChange('rmrRsiOversold', v)} min={15} max={45} />
                <InputRow label="RSI Overbought Level" desc="RSI must pierce above this to trigger Short mean-reversion (default: 65)" value={settings.rmrRsiOverbought ?? 65} onChange={(v: any) => handleInputChange('rmrRsiOverbought', v)} min={55} max={85} />
                <InputRow label="Max ADX for Range Regime" desc="Market is classified as ranging only if ADX is below this (default: 22)" value={settings.rmrMaxAdx ?? 22} onChange={(v: any) => handleInputChange('rmrMaxAdx', v)} min={10} max={40} />
                <InputRow label="Target Risk:Reward Ratio" desc="Fixed multiple for take-profit vs risk distance (default: 1.5)" value={settings.rmrMinRrRatio ?? 1.5} onChange={(v: any) => handleInputChange('rmrMinRrRatio', v)} min={1.0} max={5.0} />
              </div>
            </div>

            {/* SECTION 4: Volatility Compression Breakout (VCB) */}
            <div className="bg-[#0E1117]/90 border border-[#30363D] rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-[#30363D] pb-3">
                <div>
                  <h3 className="text-sm font-bold text-gray-100 flex items-center gap-2">
                    <span>⚡ Volatility Compression Breakout (VCB) Parameters</span>
                  </h3>
                  <p className="text-[11px] text-gray-400 mt-0.5">Bollinger/Keltner compression squeeze and breakout expansion engine.</p>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  BREAKOUT / SQUEEZE
                </span>
              </div>

              <div className="divide-y divide-[#30363D]/40">
                <InputRow label="Compression Lookback Bars" desc="Candles evaluated for low volatility compression (default: 10)" value={settings.vcbCompressionLookback ?? 10} onChange={(v: any) => handleInputChange('vcbCompressionLookback', v)} min={5} max={50} />
                <InputRow label="Consolidation Window ATR Multiplier" desc="Range ceiling for tight consolidation structure (default: 3.0)" value={settings.vcbWindowAtrMult ?? 3.0} onChange={(v: any) => handleInputChange('vcbWindowAtrMult', v)} min={1.0} max={6.0} />
                <InputRow label="Checklist Minimum Score" desc="Minimum required 11-point gate checklist score to trigger breakout entry (default: 8)" value={settings.vcbChecklistMinScore ?? 8} onChange={(v: any) => handleInputChange('vcbChecklistMinScore', v)} min={5} max={11} />
                <InputRow label="Minimum Risk-to-Reward Ratio" desc="Required asymmetric target multiple for breakout (default: 2.0)" value={settings.vcbMinRrRatio ?? 2.0} onChange={(v: any) => handleInputChange('vcbMinRrRatio', v)} min={1.5} max={5.0} />
                
                {/* 5 Institutional Breakout Pillars Controls */}
                <InputRow label="Local ATR Expansion Ratio (Min)" desc="Minimum current ATR / 20-period ATR MA expansion ratio to confirm market expansion (default: 1.20)" value={settings.vcbLocalAtrRatioMin ?? 1.20} onChange={(v: any) => handleInputChange('vcbLocalAtrRatioMin', v)} min={1.0} max={2.5} />
                <InputRow label="Entry Timeframe Minimum ADX" desc="Minimum ADX on entry timeframe ensuring trend momentum over range chop (default: 20)" value={settings.vcbLocalAdxMin ?? 20} onChange={(v: any) => handleInputChange('vcbLocalAdxMin', v)} min={10} max={40} />
                <InputRow label="Breakout Volume Multiplier (RVOL)" desc="Minimum breakout volume relative to 20-period volume SMA (default: 1.50x)" value={settings.vcbBreakoutVolumeMin ?? 1.50} onChange={(v: any) => handleInputChange('vcbBreakoutVolumeMin', v)} min={1.1} max={3.5} />
                <InputRow label="Candle Body Dominance Ratio" desc="Minimum real body / total candle range to reject indecision wicks (default: 0.60 = 60%)" value={settings.vcbBodyDominanceMin ?? 0.60} onChange={(v: any) => handleInputChange('vcbBodyDominanceMin', v)} min={0.40} max={0.90} />
                <InputRow label="Close Location Value" desc="Minimum close location within candle range in breakout direction (default: 0.70 = top/bottom 30%)" value={settings.vcbCloseLocationMin ?? 0.70} onChange={(v: any) => handleInputChange('vcbCloseLocationMin', v)} min={0.50} max={0.95} />
                <InputRow label="HTF Minimum ADX" desc="Minimum ADX on Higher Timeframe to ensure institutional directional bias (default: 20)" value={settings.vcbHtfAdxMin ?? 20} onChange={(v: any) => handleInputChange('vcbHtfAdxMin', v)} min={10} max={40} />
                <InputRow label="Bullish RSI Minimum" desc="Minimum RSI on entry timeframe for Long breakouts (default: 55)" value={settings.vcbRsiBullishMin ?? 55} onChange={(v: any) => handleInputChange('vcbRsiBullishMin', v)} min={50} max={70} />
                <InputRow label="Bearish RSI Maximum" desc="Maximum RSI on entry timeframe for Short breakdowns (default: 45)" value={settings.vcbRsiBearishMax ?? 45} onChange={(v: any) => handleInputChange('vcbRsiBearishMax', v)} min={30} max={50} />

                <div className="flex justify-between items-center py-3">
                  <div className="flex flex-col">
                    <span className="text-sm font-bold text-gray-200">Require Liquidity Sweep Before Breakout</span>
                    <span className="text-[11px] text-gray-500">Only execute breakouts that cleared liquidity before the expansion candle.</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleInputChange('vcbRequireSweep', !settings.vcbRequireSweep)}
                    className={`w-12 h-6 rounded-full transition-colors flex items-center px-1 shrink-0 ${
                      settings.vcbRequireSweep !== false ? 'bg-emerald-600' : 'bg-gray-700'
                    }`}
                  >
                    <div className={`w-4 h-4 rounded-full bg-white transition-transform ${settings.vcbRequireSweep !== false ? 'transform translate-x-6' : ''}`} />
                  </button>
                </div>

                <div className="flex justify-between items-center py-3">
                  <div className="flex flex-col">
                    <span className="text-sm font-bold text-gray-200">Require Retest into Consolidation</span>
                    <span className="text-[11px] text-gray-500">Wait for price pullback into breakout zone before entry.</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleInputChange('vcbRequireRetest', !settings.vcbRequireRetest)}
                    className={`w-12 h-6 rounded-full transition-colors flex items-center px-1 shrink-0 ${
                      settings.vcbRequireRetest !== false ? 'bg-emerald-600' : 'bg-gray-700'
                    }`}
                  >
                    <div className={`w-4 h-4 rounded-full bg-white transition-transform ${settings.vcbRequireRetest !== false ? 'transform translate-x-6' : ''}`} />
                  </button>
                </div>

                <div className="flex justify-between items-center py-3">
                  <div className="flex flex-col">
                    <span className="text-sm font-bold text-gray-200">Require HTF Structure Alignment</span>
                    <span className="text-[11px] text-gray-500">Require Higher-High/Higher-Low for Longs, Lower-High/Lower-Low for Shorts on HTF.</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleInputChange('vcbRequireHtfStructure', settings.vcbRequireHtfStructure !== false ? false : true)}
                    className={`w-12 h-6 rounded-full transition-colors flex items-center px-1 shrink-0 ${
                      settings.vcbRequireHtfStructure !== false ? 'bg-emerald-600' : 'bg-gray-700'
                    }`}
                  >
                    <div className={`w-4 h-4 rounded-full bg-white transition-transform ${settings.vcbRequireHtfStructure !== false ? 'transform translate-x-6' : ''}`} />
                  </button>
                </div>

                <div className="flex justify-between items-center py-3">
                  <div className="flex flex-col">
                    <span className="text-sm font-bold text-gray-200">Require Retest or Follow-Through Confirmation</span>
                    <span className="text-[11px] text-gray-500">Only execute after broken level retest holds OR decisive follow-through candle confirmed.</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleInputChange('vcbRequireFollowThroughOrRetest', settings.vcbRequireFollowThroughOrRetest !== false ? false : true)}
                    className={`w-12 h-6 rounded-full transition-colors flex items-center px-1 shrink-0 ${
                      settings.vcbRequireFollowThroughOrRetest !== false ? 'bg-emerald-600' : 'bg-gray-700'
                    }`}
                  >
                    <div className={`w-4 h-4 rounded-full bg-white transition-transform ${settings.vcbRequireFollowThroughOrRetest !== false ? 'transform translate-x-6' : ''}`} />
                  </button>
                </div>

                <div className="flex justify-between items-center py-3">
                  <div className="flex flex-col">
                    <span className="text-sm font-bold text-gray-200">Enforce London & NY Kill Zones</span>
                    <span className="text-[11px] text-gray-500">Only execute breakouts during London (07:00-11:00 UTC) and NY (13:00-17:00 UTC) sessions.</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleInputChange('vcbEnforceKillZone', !settings.vcbEnforceKillZone)}
                    className={`w-12 h-6 rounded-full transition-colors flex items-center px-1 shrink-0 ${
                      settings.vcbEnforceKillZone ? 'bg-emerald-600' : 'bg-gray-700'
                    }`}
                  >
                    <div className={`w-4 h-4 rounded-full bg-white transition-transform ${settings.vcbEnforceKillZone ? 'transform translate-x-6' : ''}`} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'autotrade' && (
          <div className="space-y-2">
            <div className="flex justify-between items-center py-4 border-b border-[#30363D]/50">
              <div className="flex flex-col">
                <span className="text-sm font-bold text-gray-200">Trade Frequency & Sensitivity</span>
                <span className="text-[11px] text-gray-500">Controls automated signal trigger sensitivity and gate bypass presets.</span>
              </div>
              <div className="flex bg-[#161B22] rounded p-1 border border-[#30363D]">
                {(['LOW', 'MEDIUM', 'HIGH'] as const).map((freq) => (
                  <button
                    key={freq}
                    type="button"
                    onClick={() => {
                      if (freq === 'LOW') {
                        onUpdateSettings({
                          ...settings,
                          tradeFrequency: 'LOW',
                          autoTradeThreshold: 75,
                          disabledGates: {}
                        });
                      } else if (freq === 'MEDIUM') {
                        onUpdateSettings({
                          ...settings,
                          tradeFrequency: 'MEDIUM',
                          autoTradeThreshold: 60,
                          disabledGates: {
                            COMPOSITE_g6: true,
                            COMPOSITE_g7: true,
                            CR_stopDistance: true
                          }
                        });
                      } else {
                        onUpdateSettings({
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
                      }
                    }}
                    className={`px-3 py-1 rounded text-xs font-bold transition-all ${
                      (settings.tradeFrequency || 'LOW') === freq
                        ? 'bg-gray-200 text-[#0E1117]'
                        : 'text-gray-400 hover:text-gray-200'
                    }`}
                  >
                    {freq === 'LOW' ? '🛡️ 1:3 SNIPER' : freq === 'MEDIUM' ? '🎯 MEDIUM' : '🚀 HIGH'}
                  </button>
                ))}
              </div>
            </div>

            <InputRow label="Min Trade Score Threshold" desc="Minimum composite score to execute automated order" value={settings.autoTradeThreshold} onChange={(v: any) => handleInputChange('autoTradeThreshold', v)} min={50} max={100} />
            <InputRow label="Max Drawdown %" desc="Pause trading above this total drawdown" value={settings.maxDrawdownPct} onChange={(v: any) => handleInputChange('maxDrawdownPct', v)} min={1} max={50} />
            
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mt-6 mb-2">ADDITIONAL TARGETS</h3>
            <InputRow label="Take Profit 2 ATR Multiple" desc="Take Profit 2 (optional)" value={settings.tp2AtrMultiple} onChange={(v: any) => handleInputChange('tp2AtrMultiple', v)} min={1} max={10} />
            <InputRow label="Take Profit 3 Fib Level" desc="Take Profit 3 (optional)" value={settings.tp3FibLevel} onChange={(v: any) => handleInputChange('tp3FibLevel', v)} min={1} max={5} />
            
            <div className="flex justify-between items-center py-4 border-b border-[#30363D]/50">
              <div className="flex flex-col">
                <span className="text-sm font-bold text-gray-200">Time-Based Exit Enabled</span>
                <span className="text-[11px] text-gray-500">Enable time-based exit mechanism</span>
              </div>
              <button
                onClick={() => handleInputChange('timeBasedExitEnabled', !settings.timeBasedExitEnabled)}
                className={`w-12 h-6 rounded-full transition-colors flex items-center px-1 ${settings.timeBasedExitEnabled ? 'bg-[#00e696]' : 'bg-gray-700'}`}
              >
                <div className={`w-4 h-4 rounded-full bg-white transition-transform ${settings.timeBasedExitEnabled ? 'transform translate-x-6' : ''}`} />
              </button>
            </div>
            {settings.timeBasedExitEnabled && (
               <InputRow label="Time-Based Exit Candles" desc="Close positions after N candles if not profitable" value={settings.timeBasedExitCandles} onChange={(v: any) => handleInputChange('timeBasedExitCandles', v)} />
            )}

            <div className="flex justify-between items-center py-4 border-b border-[#30363D]/50">
              <div className="flex flex-col">
                <span className="text-sm font-bold text-gray-200">Use Trailing Stop</span>
                <span className="text-[11px] text-gray-500">Enable trailing stop loss for open trades</span>
              </div>
              <button
                onClick={() => handleInputChange('trailingStopActivation', settings.trailingStopActivation === 'NEVER' ? 'TP1' : 'NEVER')}
                className={`w-12 h-6 rounded-full transition-colors flex items-center px-1 ${settings.trailingStopActivation !== 'NEVER' ? 'bg-[#00e696]' : 'bg-gray-700'}`}
              >
                <div className={`w-4 h-4 rounded-full bg-white transition-transform ${settings.trailingStopActivation !== 'NEVER' ? 'transform translate-x-6' : ''}`} />
              </button>
            </div>
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mt-6 mb-2">SUPERTREND TRAILING STOP</h3>
            <InputRow label="SuperTrend ATR Period" desc="ATR window used for SuperTrend bands (default: 12)" value={settings.superTrendPeriod} onChange={(v: any) => handleInputChange('superTrendPeriod', v)} />
            <InputRow label="SuperTrend Multiplier" desc="Band width = ATR × multiplier (default: 3.0)" value={settings.superTrendMultiplier} onChange={(v: any) => handleInputChange('superTrendMultiplier', v)} />
            <InputRow label="Trail Activation R" desc="Activate trailing exit after this many R earned (default: 1.0)" value={settings.trailActivationR} onChange={(v: any) => handleInputChange('trailActivationR', v)} min={0.5} max={5} />
          </div>
        )}

        {activeTab === 'alerts' && (
           <div className="space-y-4 max-w-lg">
             <div className="bg-[#0E1117] border border-[#30363D] rounded p-4">
               <h3 className="text-sm font-bold text-gray-200 mb-4">Telegram Bot Integration</h3>
               <div className="space-y-3">
                 <div>
                   <label className="text-xs font-semibold text-gray-400 block mb-1">Bot Token</label>
                   <div className="relative">
                     <input type={showBotToken ? 'text' : 'password'} value={settings.telegramBotToken} onChange={(e) => handleInputChange('telegramBotToken', e.target.value)} className="w-full bg-gray-950 border border-[#30363D] rounded p-2 text-sm text-gray-400 pr-10" />
                     <button onClick={() => setShowBotToken(!showBotToken)} className="absolute right-2 top-2 text-gray-500 hover:text-gray-400">
                       {showBotToken ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                     </button>
                   </div>
                 </div>
                 <div>
                   <label className="text-xs font-semibold text-gray-400 block mb-1">Chat ID</label>
                   <input type="text" value={settings.telegramChatId} onChange={(e) => handleInputChange('telegramChatId', e.target.value)} className="w-full bg-gray-950 border border-[#30363D] rounded p-2 text-sm text-gray-400" />
                 </div>
                 <button onClick={testTelegramConnection} className="w-full py-2 bg-[#00e696] hover:bg-white text-[#0f172a] font-bold rounded text-xs transition duration-200">
                   TEST NOTIFICATION PING
                 </button>
                 {telegramStatus && <p className="text-xs text-indigo-300 mt-2 font-mono bg-indigo-900/20 py-2 px-3 rounded border border-indigo-500/20">{telegramStatus}</p>}
               </div>
             </div>
             
             <div className="space-y-2 mt-4">
               <h3 className="text-sm font-bold text-gray-200 mb-2">Message Preferences</h3>
               <div className="flex justify-between items-center py-2 px-3 bg-gray-800/20 rounded border border-[#30363D]">
                 <span className="text-sm text-gray-400">Silent Notifications (No sound on phone)</span>
                 <button
                   onClick={() => handleInputChange('alertSilentMode', !settings.alertSilentMode)}
                   className={`w-10 h-5 rounded-full transition-colors flex items-center px-1 ${
                     settings.alertSilentMode ? 'bg-[#00e696]' : 'bg-gray-700'
                   }`}
                 >
                   <div className={`w-3 h-3 rounded-full bg-white transition-transform ${
                     settings.alertSilentMode ? 'transform translate-x-5' : ''
                   }`} />
                 </button>
               </div>
               <div className="flex flex-col py-2 px-3 bg-gray-800/20 rounded border border-[#30363D] gap-2">
                 <span className="text-sm text-gray-400">Alert Formatting Style</span>
                 <select
                   value={settings.alertFormat || 'Verbose'}
                   onChange={(e) => handleInputChange('alertFormat', e.target.value)}
                   className="w-full bg-gray-900 border border-[#30363D] rounded px-2 py-1.5 text-xs text-gray-300 focus:outline-none"
                 >
                   <option value="Verbose">Verbose (Include all trade details & metadata)</option>
                   <option value="Minimal">Minimal (Action & Price only)</option>
                 </select>
               </div>
             </div>

             <div className="space-y-2 mt-4">
               <h3 className="text-sm font-bold text-gray-200 mb-2">Event Triggers</h3>
               {[
                 { id: 'alertOnNewSignal', label: 'New High-Score Signal Detected' },
                 { id: 'alertOnTradeExecuted', label: 'Trade Automatically Executed' },
                 { id: 'alertOnTpHit', label: 'Take Profit Hit' },
                 { id: 'alertOnSlHit', label: 'Stop Loss Hit' },
                 { id: 'alertOnTsMoved', label: 'Trailing Stop Moved' },
                 { id: 'alertOnDailyLossLimit', label: 'Daily Loss Limit Reached' },
                 { id: 'alertOnRangingDetected', label: 'Ranging Market Detected' },
               ].map((setting) => (
                 <div key={setting.id} className="flex justify-between items-center py-2 px-3 bg-gray-800/20 rounded border border-[#30363D]">
                   <span className="text-sm text-gray-400">{setting.label}</span>
                   <button
                     onClick={() => handleInputChange(setting.id, !(settings as any)[setting.id])}
                     className={`w-10 h-5 rounded-full transition-colors flex items-center px-1 ${
                       (settings as any)[setting.id] ? 'bg-[#00e696]' : 'bg-gray-700'
                     }`}
                   >
                     <div className={`w-3 h-3 rounded-full bg-white transition-transform ${
                       (settings as any)[setting.id] ? 'transform translate-x-5' : ''
                     }`} />
                   </button>
                 </div>
               ))}
              </div>
            </div>
         )}

        {activeTab === 'health' && (
          <SettingsHealthPanel
            currentSettings={settings}
            isDirty={isDirty}
            hasLoadedServerSettings={Boolean(hasLoadedServerSettings)}
            settingsLoadError={settingsLoadError || null}
            onReloadServerSettings={onReloadServerSettings}
            onForceSyncToEngine={executeActualSave}
          />
        )}

        {activeTab === 'audit' && (
          <SettingsAuditLog />
        )}

      </div>

      {/* Settings Change Review & Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#161B22] border border-[#30363D] rounded-xl max-w-lg w-full p-6 space-y-4 shadow-2xl animate-in fade-in zoom-in duration-150">
            <div className="flex items-center justify-between border-b border-[#30363D] pb-3">
              <div className="flex items-center gap-2 text-indigo-400">
                <CheckCircle2 className="w-5 h-5" />
                <h3 className="text-base font-bold text-white">Review & Confirm Settings</h3>
              </div>
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-gray-800 text-gray-300 border border-[#30363D]">
                v{settings.settingsVersion || 1} → v{(settings.settingsVersion || 1) + 1}
              </span>
            </div>

            {hasHighRiskChanges && (
              <div className="p-3 bg-amber-950/40 border border-amber-800/50 rounded-lg flex items-start gap-2.5 text-amber-300 text-xs">
                <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <p className="font-bold">High-Risk Parameters Modified</p>
                  <p className="text-amber-400/90 text-[11px]">
                    You have adjusted critical risk limits (leverage, risk %, or daily loss limit). These parameters immediately impact live trade execution sizing.
                  </p>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-300">
                Pending changes to apply ({diffs.length}):
              </p>
              <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                {diffs.map((d) => (
                  <div
                    key={d.key}
                    className="bg-[#0E1117] p-2.5 rounded border border-[#30363D] flex items-center justify-between gap-2 text-xs font-mono"
                  >
                    <span className="text-gray-300 font-semibold truncate" title={d.key}>
                      {d.label}
                    </span>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-rose-400 line-through opacity-80 max-w-[90px] truncate" title={d.oldVal}>
                        {d.oldVal}
                      </span>
                      <ArrowRight className="w-3 h-3 text-gray-500 shrink-0" />
                      <span className="text-emerald-400 font-bold max-w-[90px] truncate" title={d.newVal}>
                        {d.newVal}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#30363D]">
              <button
                onClick={() => setShowConfirmModal(false)}
                disabled={isSaving}
                className="px-4 py-2 rounded-lg border border-[#30363D] text-gray-400 hover:text-white text-xs font-semibold transition"
              >
                Cancel
              </button>
              <button
                onClick={executeActualSave}
                disabled={isSaving}
                className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition flex items-center gap-1.5 shadow"
              >
                {isSaving && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                <span>{isSaving ? 'Saving & Syncing...' : 'Confirm & Apply'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
