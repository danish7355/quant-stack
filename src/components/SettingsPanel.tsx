import React, { useState, useEffect } from 'react';
import { AppSettings, Timeframe, RiskStatus, StrategyItem } from '../types';
import { 
  RefreshCw, Eye, EyeOff, Github, UploadCloud, Code, Code2, Copy, Check, Shield, ShieldCheck, 
  Flame, Droplets, BookOpen, ExternalLink, X, Clock, Zap, Target, TrendingUp, 
  AlertTriangle, ShieldAlert, RotateCcw, AlertOctagon, Power, CheckCircle2, Layers,
  Volume2, VolumeX, Sparkles, Trash2, Plus, Archive, Undo2, Compass, Activity
} from 'lucide-react';
import { loadAudioSettings, saveAudioSettings, playTradeExecutedSound, SoundStyle } from '../utils/audioNotification';
import { generateSMCStrategyPineScript } from '../utils/strategies/smcHighProbability';
import { generateLsrPineScript } from '../utils/strategies/liquiditySweepReversal';
import { generateTrendPullbackPineScript } from '../utils/strategies/trendPullback';
import { generateMulticoinScalperPineScript } from '../utils/strategies/multicoinScalperPro';
import { generateCoilBreakoutPineScript } from '../utils/strategies/coilBreakout';
import { generateOrderBlockPineScript } from '../utils/strategies/orderBlockStrategy';

interface SettingsPanelProps {
  settings: AppSettings;
  onUpdateSettings: (newSettings: AppSettings) => void;
  onResetBalance: (amount: number) => void;
  onResetSettings: () => void;
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

const InputRow = ({ label, desc, value, onChange, type = "number", className="" }: any) => {
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
      setLocalValue(finalValue.toString());
      onChange(finalValue);
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

export default function SettingsPanel({ settings, onUpdateSettings, onResetBalance, onResetSettings }: SettingsPanelProps) {
  const [activeTab, setActiveTab] = useState<'general' | 'strategies' | 'coilBreakout' | 'multicoinScalper' | 'trendPullback' | 'smc' | 'lsr' | 'orderBlock' | 'filters' | 'risk' | 'autotrade' | 'alerts' | 'credentials' | 'github'>('strategies');
  const [showBotToken, setShowBotToken] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [showApiSecret, setShowApiSecret] = useState(false);
  const [telegramStatus, setTelegramStatus] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [showPineScriptModal, setShowPineScriptModal] = useState(false);
  const [pineModalStrategy, setPineModalStrategy] = useState<'SMC' | 'TREND_PULLBACK' | 'MULTICOIN_SCALPER' | 'COIL_BREAKOUT' | 'ORDER_BLOCK'>('ORDER_BLOCK');
  const [copiedPine, setCopiedPine] = useState(false);
  const [panelAudioSettings, setPanelAudioSettings] = useState(loadAudioSettings());

  const updatePanelAudio = (key: string, val: any) => {
    const next = saveAudioSettings({ [key]: val } as any);
    setPanelAudioSettings(next);
  };

  // Strategy Portfolio Definition & Helpers
  const deletedStrategies = settings.deletedStrategies || [];
  const [strategyToDelete, setStrategyToDelete] = useState<any | null>(null);
  const [showAddCustomModal, setShowAddCustomModal] = useState(false);
  const [newStratName, setNewStratName] = useState('');
  const [newStratBadge, setNewStratBadge] = useState('');
  const [newStratDesc, setNewStratDesc] = useState('');
  const [newStratColor, setNewStratColor] = useState('cyan');

  const BASE_STRATEGIES: StrategyItem[] = [
    {
      id: 'ORDER_BLOCK',
      name: 'Order Block Strategy (Spec v2)',
      badge: '1:3.5+ R:R Strict (SMC PA)',
      color: 'indigo',
      configTab: 'orderBlock',
      desc: 'Displacement + Structure Break (BOS) -> Order Block Formation -> Controlled First Retest Reaction. Strict 1:3.5+ RR hard gate, structural targets, blocker rule (2.0R), cost filter (<=0.20R), and visible quality sizing.'
    },
    {
      id: 'COIL_BREAKOUT',
      name: 'Two-Sided Coil Breakout Strategy',
      badge: '1:5+ R:R Strict (Direction-Neutral)',
      color: 'emerald',
      configTab: 'coilBreakout',
      desc: 'Direction-neutral volatility compression breakout. Identifies 5-20 candle coils (height <= 1.25x ATR, median range < 0.70x ATR, declining ATR), verifies displacement break and retest hold/reject, and enforces strict 1:5 Reward-to-Risk.'
    },
    {
      id: 'MULTICOIN_SCALPER_PRO',
      name: '3Commas Multicoin Scalper PRO (SwissAlgo)',
      badge: '5m Scalp / 15m Swing (Top 100 Volume)',
      color: 'amber',
      configTab: 'multicoinScalper',
      desc: 'Universal high-volume altcoin strategy inspired by 3Commas & SwissAlgo. Strict liquidity & spread filtering, EMA Ribbon stacks (9/21/55 or 20/50/200), Session VWAP, RSI pullback confirmation, and dynamic ATR risk controls.'
    },
    {
      id: 'TREND_PULLBACK',
      name: 'Robust Trend-Pullback Strategy',
      badge: 'Retest-Aware (1:3+ R:R)',
      color: 'teal',
      configTab: 'trendPullback',
      desc: 'Multi-timeframe EMA trend alignment, dynamic pullback zones, and structural invalidation stop loss. Distinguishes normal retest noise from true invalidation.'
    },
    {
      id: 'LIQUIDITY_SWEEP_REVERSAL',
      name: 'Liquidity Sweep Reversal (LSR)',
      badge: 'Price Action & Strict Reclaim (2:1+ R:R)',
      color: 'cyan',
      configTab: 'lsr',
      desc: 'Institutional failed-breakout engine. Identifies true liquidity sweeps at major swing points, equal highs/lows and range boundaries, enforces mandatory price reclaims, micro-structure shifts (MSS), and early entry with tight invalidation.'
    },
    {
      id: 'RANGE_REGIME_V1',
      name: 'Range Regime V1 (RANGE_REGIME_V1)',
      badge: 'Single Source of Truth Fades (S1/S2/S3)',
      color: 'cyan',
      configTab: 'rangeRegime',
      desc: 'Single source of truth parameter schema for institutional range trading. Renders controls dynamically from PARAMS, enforces ADX trend veto, Kaufman ER, swing edge clusters, S1 rejection, S2 sweep & reclaim, S3 band snap-back, and fee drag risk limits.'
    }
  ];

  const ALL_STRATEGIES = [
    ...BASE_STRATEGIES,
    ...(settings.customStrategies || [])
  ];

  const installedStrategies = ALL_STRATEGIES.filter(s => !deletedStrategies.includes(s.id));
  const archivedStrategies = ALL_STRATEGIES.filter(s => deletedStrategies.includes(s.id));

  const activeStrategiesList = ((settings.activeStrategies && settings.activeStrategies.length > 0)
    ? settings.activeStrategies
    : [settings.activeStrategy || 'COIL_BREAKOUT']).filter(s => !deletedStrategies.includes(s));

  const toggleStrategyInPortfolio = (stratId: string) => {
    let next: string[];
    if (activeStrategiesList.includes(stratId)) {
      next = activeStrategiesList.filter(s => s !== stratId);
    } else {
      next = [...activeStrategiesList, stratId];
    }
    const updated = {
      ...settings,
      activeStrategies: next,
      activeStrategy: (next.length === 1 ? next[0] : (next.length > 1 ? next[0] : 'NONE')) as any
    };
    onUpdateSettings(updated);
  };

  const setSoloStrategy = (stratId: string) => {
    const updated = {
      ...settings,
      activeStrategies: [stratId],
      activeStrategy: stratId as any
    };
    onUpdateSettings(updated);
  };

  const setStrategyPreset = (stratIds: string[]) => {
    const filtered = stratIds.filter(s => !deletedStrategies.includes(s));
    const updated = {
      ...settings,
      activeStrategies: filtered,
      activeStrategy: (filtered.length > 0 ? filtered[0] : 'NONE') as any
    };
    onUpdateSettings(updated);
  };

  const handleDeleteStrategy = (strat: any) => {
    const nextDeleted = Array.from(new Set([...(settings.deletedStrategies || []), strat.id]));
    const nextActive = activeStrategiesList.filter(s => s !== strat.id);
    let nextSolo = settings.activeStrategy;
    if (nextSolo === strat.id) {
      nextSolo = nextActive.length > 0 ? (nextActive[0] as any) : 'NONE';
    }
    const updated: AppSettings = {
      ...settings,
      deletedStrategies: nextDeleted,
      activeStrategies: nextActive,
      activeStrategy: nextSolo
    };
    onUpdateSettings(updated);
    if (activeTab === strat.configTab) {
      setActiveTab('strategies');
    }
    setStrategyToDelete(null);
    setSaveStatus(`Strategy "${strat.name}" deleted from bot.`);
    setTimeout(() => setSaveStatus(null), 3500);
  };

  const handleRestoreStrategy = (stratId: string) => {
    const nextDeleted = (settings.deletedStrategies || []).filter(s => s !== stratId);
    const updated: AppSettings = {
      ...settings,
      deletedStrategies: nextDeleted
    };
    onUpdateSettings(updated);
    setSaveStatus(`Strategy restored to portfolio.`);
    setTimeout(() => setSaveStatus(null), 3000);
  };

  const handleRestoreAllStrategies = () => {
    const updated: AppSettings = {
      ...settings,
      deletedStrategies: []
    };
    onUpdateSettings(updated);
    setSaveStatus(`All default strategies restored.`);
    setTimeout(() => setSaveStatus(null), 3000);
  };

  const handleAddCustomStrategy = () => {
    if (!newStratName.trim()) return;
    const stratId = 'CUSTOM_' + newStratName.toUpperCase().replace(/[^A-Z0-9]/g, '_');
    const newStrat = {
      id: stratId,
      name: newStratName.trim(),
      badge: newStratBadge.trim() || 'Custom Strategy',
      color: newStratColor,
      desc: newStratDesc.trim() || 'User-defined algorithmic trading strategy.',
      isCustom: true
    };
    const nextCustom = [...(settings.customStrategies || []), newStrat];
    const nextActive = [...activeStrategiesList, stratId];
    const updated: AppSettings = {
      ...settings,
      customStrategies: nextCustom,
      activeStrategies: nextActive
    };
    onUpdateSettings(updated);
    setShowAddCustomModal(false);
    setNewStratName('');
    setNewStratBadge('');
    setNewStratDesc('');
    setSaveStatus(`Custom strategy "${newStrat.name}" added successfully.`);
    setTimeout(() => setSaveStatus(null), 3500);
  };

  // Risk Management & Circuit Breakers state
  const [riskStatus, setRiskStatus] = useState<RiskStatus | null>(null);
  const [resettingBreakers, setResettingBreakers] = useState(false);
  const [breakerMessage, setBreakerMessage] = useState<string | null>(null);

  const fetchRiskStatus = async () => {
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
      // Ignore transient network errors
    }
  };

  useEffect(() => {
    fetchRiskStatus();
    const interval = setInterval(fetchRiskStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleResetCircuitBreakers = async () => {
    setResettingBreakers(true);
    try {
      const res = await fetch('/api/risk/reset-circuit-breaker', { method: 'POST' });
      if (res.ok) {
        setBreakerMessage('Circuit breakers, daily losses, and consecutive loss counters reset successfully!');
        fetchRiskStatus();
        setTimeout(() => setBreakerMessage(null), 4000);
      }
    } catch {
      setBreakerMessage('Failed to reset circuit breakers.');
    } finally {
      setResettingBreakers(false);
    }
  };

  const handleKillSwitchToggle = async (active: boolean) => {
    handleInputChange('killSwitchActive', active);
    try {
      await fetch('/api/risk/kill-switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active })
      });
      fetchRiskStatus();
    } catch (e) {
      console.error('Failed to toggle kill switch:', e);
    }
  };

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

  const handleSaveSettings = async () => {
    // Force blur on the active element to trigger any pending local updates
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }

    try {
      // Direct explicit sync to server Firestore endpoint
      await fetch('/api/bot/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });
      setSaveStatus('✓ Saved to Cloud Database & Synced!');
    } catch (e) {
      setSaveStatus('✓ Saved locally & Queueing sync');
    }
    setTimeout(() => setSaveStatus(null), 3000);
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

      const res = await fetch('/api/bot/telegram/test', { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          botToken: settings.telegramBotToken,
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

  return (
    <div className="bg-[#161B22] border border-[#30363D] rounded-xl overflow-hidden shadow-lg h-full flex flex-col">
      <div className="bg-[#0E1117] border-b border-[#30363D] px-4 sm:px-6 py-3 sm:py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center space-x-2 sm:space-x-3">
          <h2 className="text-base sm:text-xl font-extrabold text-white tracking-wider sm:tracking-widest uppercase">STRATEGY & BOT SETTINGS</h2>
          <span className="hidden sm:inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
            ● Cloud Firestore Sync Active
          </span>
        </div>
        <div className="flex items-center space-x-2 sm:space-x-3 self-end sm:self-auto">
          <button 
            onClick={onResetSettings}
            className="flex items-center space-x-1.5 sm:space-x-2 px-2.5 sm:px-3 py-1.5 rounded-lg border border-[#30363D] text-gray-400 hover:bg-[#21262D] text-xs sm:text-sm font-semibold transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span>Reset Defaults</span>
          </button>
          <button 
            onClick={handleSaveSettings}
            className="flex items-center space-x-2 px-3 sm:px-4 py-1.5 rounded-lg bg-gray-200 text-[#0E1117] hover:bg-white text-xs sm:text-sm font-bold transition-all shadow-sm"
          >
            <span>{saveStatus || 'Save Settings'}</span>
          </button>
        </div>
      </div>

      <div className="flex border-b border-[#30363D] px-3 sm:px-4 pt-2 space-x-3 sm:space-x-6 overflow-x-auto bg-[#0E1117] custom-scrollbar">
        {[
          { id: 'general', label: 'General System' },
          { id: 'strategies', label: '⚡ Active Strategies' },
          ...(!deletedStrategies.includes('ORDER_BLOCK') ? [{ id: 'orderBlock', label: '🧱 Order Block (1:3.5+)' }] : []),
          ...(!deletedStrategies.includes('COIL_BREAKOUT') ? [{ id: 'coilBreakout', label: '🌀 Coil Breakout (1:5+)' }] : []),
          ...(!deletedStrategies.includes('MULTICOIN_SCALPER_PRO') ? [{ id: 'multicoinScalper', label: '🔥 Top 100 Scalper PRO' }] : []),
          ...(!deletedStrategies.includes('TREND_PULLBACK') ? [{ id: 'trendPullback', label: '🎯 Trend-Pullback' }] : []),
          ...(!deletedStrategies.includes('LIQUIDITY_SWEEP_REVERSAL') && !deletedStrategies.includes('SMC_LIQUIDITY') ? [{ id: 'lsr', label: '💧 Liquidity Sweep (LSR)' }] : []),
          { id: 'credentials', label: '🔑 Bot Credentials' },
          { id: 'github', label: '🐙 GitHub Integration' },
          { id: 'filters', label: 'Filters' },
          { id: 'risk', label: 'Risk Management' },
          { id: 'autotrade', label: 'Auto-Trade' },
          { id: 'alerts', label: 'Alerts' }
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
        {activeTab === 'trendPullback' && (
          <div className="space-y-6">
            {/* Strategy Banner */}
            <div className="p-4 bg-gradient-to-r from-emerald-950/40 via-teal-950/30 to-cyan-950/20 border border-emerald-500/30 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-start space-x-3">
                <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-400 mt-0.5 shrink-0">
                  <Target className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <h3 className="text-sm font-extrabold text-white tracking-wide">ROBUST TREND-PULLBACK INTRADAY STRATEGY</h3>
                    {activeStrategiesList.includes('TREND_PULLBACK') ? (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                        ACTIVE IN PORTFOLIO
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-gray-700/50 text-gray-400 border border-gray-600/30">
                        INACTIVE
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mt-1 max-w-xl leading-relaxed">
                    Rejection-first intraday execution: HTF Regime & Multi-EMA Alignment → Orderly Retracement to Dynamic EMA/VWAP Zones → Countertrend Exhaustion → Closed Bar Confirmation → Volume Expansion → Technical Invalidation Stop Loss → 1:2+ R:R.
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-2 shrink-0">
                <button
                  onClick={() => {
                    setPineModalStrategy('TREND_PULLBACK');
                    setShowPineScriptModal(true);
                  }}
                  className="flex items-center space-x-1.5 px-3 py-2 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 text-emerald-300 hover:text-white text-xs font-bold transition-all shadow-sm"
                >
                  <Code className="w-4 h-4" />
                  <span>TradingView Pine Script v6</span>
                </button>
                {!activeStrategiesList.includes('TREND_PULLBACK') ? (
                  <button
                    onClick={() => toggleStrategyInPortfolio('TREND_PULLBACK')}
                    className="px-3.5 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-extrabold transition-all shadow-sm"
                  >
                    + Activate in Portfolio
                  </button>
                ) : (
                  <button
                    onClick={() => toggleStrategyInPortfolio('TREND_PULLBACK')}
                    className="px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-rose-300 border border-gray-700 text-xs font-semibold transition-all"
                  >
                    Deactivate
                  </button>
                )}
              </div>
            </div>

            {/* Sub-section 1: Timeframe & Alignment */}
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
                    value={settings.tpExecutionTimeframe || '15m'}
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
                    value={settings.tpHigherTimeframe || '1H'}
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
                  <label className="text-xs font-bold text-gray-300 block mb-1">Optional Lower Trigger TF</label>
                  <select
                    value={settings.tpOptionalLowerTriggerTimeframe || '5m'}
                    onChange={(e) => handleInputChange('tpOptionalLowerTriggerTimeframe', e.target.value)}
                    className="w-full bg-[#161B22] border border-[#30363D] rounded px-3 py-1.5 text-xs text-gray-200 font-mono focus:outline-none focus:border-emerald-500 cursor-pointer"
                  >
                    <option value="none">Disabled (Execute on Base TF)</option>
                    <option value="1m">1m Micro Trigger</option>
                    <option value="3m">3m Micro Trigger</option>
                    <option value="5m">5m Sub-structure</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Sub-section 2: Moving Averages & Trend Strength */}
            <div className="bg-[#0E1117] border border-[#30363D] rounded-xl p-4 space-y-3">
              <div className="flex items-center space-x-2 border-b border-[#30363D] pb-2">
                <TrendingUp className="w-4 h-4 text-cyan-400" />
                <h4 className="text-xs font-bold text-gray-200 uppercase tracking-wider">2. Moving Averages & Trend Strength</h4>
              </div>
              <p className="text-[11px] text-gray-400 leading-relaxed">
                Identifies clear bull/bear momentum. Requires Fast EMA &gt; Slow EMA &gt; 200 EMA for longs, and ADX above threshold to reject non-trending chop.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <InputRow
                  label="Fast EMA Period"
                  desc="Leading momentum baseline (default: 20)"
                  value={settings.tpFastEma ?? 20}
                  onChange={(v: any) => handleInputChange('tpFastEma', v)}
                />
                <InputRow
                  label="Slow EMA Period"
                  desc="Secondary pullback support level (default: 50)"
                  value={settings.tpSlowEma ?? 50}
                  onChange={(v: any) => handleInputChange('tpSlowEma', v)}
                />
                <InputRow
                  label="Trend EMA Period"
                  desc="Macro directional baseline (default: 200)"
                  value={settings.tpTrendEma ?? 200}
                  onChange={(v: any) => handleInputChange('tpTrendEma', v)}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <InputRow
                  label="ADX Lookback Period"
                  desc="Directional movement index length (default: 14)"
                  value={settings.tpAdxPeriod ?? 14}
                  onChange={(v: any) => handleInputChange('tpAdxPeriod', v)}
                />
                <InputRow
                  label="Minimum ADX Threshold"
                  desc="Rejects chop when ADX is below this value (default: 25)"
                  value={settings.tpAdxThreshold ?? 25}
                  onChange={(v: any) => handleInputChange('tpAdxThreshold', v)}
                />
              </div>
            </div>

            {/* Sub-section 3: Rejection-First Pullback Zones */}
            <div className="bg-[#0E1117] border border-[#30363D] rounded-xl p-4 space-y-3">
              <div className="flex items-center space-x-2 border-b border-[#30363D] pb-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <h4 className="text-xs font-bold text-gray-200 uppercase tracking-wider">3. Dynamic Pullback Zones & Rejection Filters</h4>
              </div>
              <p className="text-[11px] text-gray-400 leading-relaxed">
                Validates controlled retracements into 20 EMA, 50 EMA, Session VWAP, or prior broken swing levels. Instantly rejects sharp countertrend blowouts.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <InputRow
                  label="ATR Lookback Period"
                  desc="Volatility measurement period for dynamic boundaries (default: 14)"
                  value={settings.tpAtrPeriod ?? 14}
                  onChange={(v: any) => handleInputChange('tpAtrPeriod', v)}
                />
                <InputRow
                  label="Max Entry Distance from Trigger (ATR)"
                  desc="Rejects trade if price has drifted away from signal close (default: 0.5 ATR)"
                  value={settings.tpMaxEntryDistanceATR ?? 0.5}
                  onChange={(v: any) => handleInputChange('tpMaxEntryDistanceATR', v)}
                />
              </div>
              <div className="p-3 bg-gray-900/60 border border-[#30363D] rounded-lg text-xs space-y-1 text-gray-300">
                <span className="font-semibold text-emerald-400">Strict Rejection Safeguards:</span>
                <ul className="list-disc list-inside text-[11px] text-gray-400 space-y-0.5">
                  <li>Countertrend bar exceeding 2.5 ATR triggers immediate setup rejection.</li>
                  <li>Candle closing beyond the 50 EMA or violating swing structure invalidates the pullback.</li>
                  <li>Overextended candles (&gt; 3.5 ATR from 20 EMA) are rejected to prevent buying tops.</li>
                </ul>
              </div>
            </div>

            {/* Sub-section 4: Closed Price-Action Confirmation & Volume */}
            <div className="bg-[#0E1117] border border-[#30363D] rounded-xl p-4 space-y-3">
              <div className="flex items-center space-x-2 border-b border-[#30363D] pb-2">
                <Zap className="w-4 h-4 text-yellow-400" />
                <h4 className="text-xs font-bold text-gray-200 uppercase tracking-wider">4. Confirmation Rules & Volume Expansion</h4>
              </div>
              <p className="text-[11px] text-gray-400 leading-relaxed">
                Signals are evaluated ONLY on closed bars (no repainting). Requires candlestick confirmation (Engulfing, Pinbar/Rejection wick &ge; 45%, or Break of prior bar) accompanied by volume expansion.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <InputRow
                  label="Volume SMA Period"
                  desc="Moving average length for volume baseline (default: 20)"
                  value={settings.tpVolMaPeriod ?? 20}
                  onChange={(v: any) => handleInputChange('tpVolMaPeriod', v)}
                />
                <InputRow
                  label="Minimum Confirmation Volume Ratio"
                  desc="Confirmation candle volume / Volume SMA (default: 1.0x)"
                  value={settings.tpMinVolRatio ?? 1.0}
                  onChange={(v: any) => handleInputChange('tpMinVolRatio', v)}
                />
              </div>
              <div className="flex justify-between items-center py-2 border-t border-[#30363D]/40">
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-gray-200">Allow Entry Without Volume Expansion</span>
                  <span className="text-[11px] text-gray-500">Only enable if trading illiquid pairs where volume spikes are rare (default: OFF).</span>
                </div>
                <button
                  onClick={() => handleInputChange('tpAllowNoVolume', !settings.tpAllowNoVolume)}
                  className={`w-10 h-5 rounded-full transition-colors flex items-center px-1 ${
                    settings.tpAllowNoVolume ? 'bg-[#00e696]' : 'bg-gray-700'
                  }`}
                >
                  <div
                    className={`w-3 h-3 rounded-full bg-white transition-transform ${
                      settings.tpAllowNoVolume ? 'transform translate-x-5' : ''
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* Sub-section 5: Invalidation-Based Stop-Loss Placement */}
            <div className="bg-[#0E1117] border border-[#30363D] rounded-xl p-4 space-y-3">
              <div className="flex items-center space-x-2 border-b border-[#30363D] pb-2">
                <AlertTriangle className="w-4 h-4 text-rose-400" />
                <h4 className="text-xs font-bold text-gray-200 uppercase tracking-wider">5. Invalidation-Based Stop-Loss Placement</h4>
              </div>
              <p className="text-[11px] text-gray-400 leading-relaxed">
                Stops are placed where the trade idea is structurally proven false (below pullback swing low for longs + 0.3 ATR buffer). Rejects setups where the stop is too tight (noise) or too wide (ruining R:R).
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <InputRow
                  label="Min Allowed Stop Distance (ATR)"
                  desc="Rejects stop if tighter than this, preventing noise-outs (default: 0.5 ATR)"
                  value={settings.tpMinStopDistanceATR ?? 0.5}
                  onChange={(v: any) => handleInputChange('tpMinStopDistanceATR', v)}
                />
                <InputRow
                  label="Max Allowed Stop Distance (ATR)"
                  desc="Rejects stop if wider than this, protecting account capital (default: 3.0 ATR)"
                  value={settings.tpMaxStopDistanceATR ?? 3.0}
                  onChange={(v: any) => handleInputChange('tpMaxStopDistanceATR', v)}
                />
              </div>
            </div>

            {/* Sub-section 6: Risk-to-Reward & Targets */}
            <div className="bg-[#0E1117] border border-[#30363D] rounded-xl p-4 space-y-3">
              <div className="flex items-center space-x-2 border-b border-[#30363D] pb-2">
                <BookOpen className="w-4 h-4 text-blue-400" />
                <h4 className="text-xs font-bold text-gray-200 uppercase tracking-wider">6. Risk-to-Reward & Setup Scoring</h4>
              </div>
              <p className="text-[11px] text-gray-400 leading-relaxed">
                Targets are placed at recent swing highs/lows with partial scaling at TP1, TP2, and runner TP3, strictly requiring a minimum 1:2 Risk-to-Reward ratio.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <InputRow
                  label="Minimum Risk-to-Reward Ratio"
                  desc="Minimum structural R:R required to execute (default: 2.0 = 1:2)"
                  value={settings.tpMinRiskRewardRatio ?? 2.0}
                  onChange={(v: any) => handleInputChange('tpMinRiskRewardRatio', v)}
                />
                <InputRow
                  label="Risk % Per Trade"
                  desc="Calculates exact position size based on stop loss distance (default: 1.0%)"
                  value={settings.tpRiskPctPerTrade ?? 1.0}
                  onChange={(v: any) => handleInputChange('tpRiskPctPerTrade', v)}
                />
                <InputRow
                  label="Minimum Setup Score"
                  desc="Quality score out of 10 required to fire a signal (default: 7)"
                  value={settings.tpMinSetupScore ?? 7}
                  onChange={(v: any) => handleInputChange('tpMinSetupScore', v)}
                />
              </div>
            </div>

            {/* Sub-section 7: Session Timing & Trade Frequency */}
            <div className="bg-[#0E1117] border border-[#30363D] rounded-xl p-4 space-y-3">
              <div className="flex items-center space-x-2 border-b border-[#30363D] pb-2">
                <Clock className="w-4 h-4 text-purple-400" />
                <h4 className="text-xs font-bold text-gray-200 uppercase tracking-wider">7. Session Timing, Cooldown & Limits</h4>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-[#30363D]/40">
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-gray-200">Enable Session Time Filter</span>
                  <span className="text-[11px] text-gray-500">Confine trades to active market hours (London/NY overlap).</span>
                </div>
                <button
                  onClick={() => handleInputChange('tpSessionsEnabled', !settings.tpSessionsEnabled)}
                  className={`w-10 h-5 rounded-full transition-colors flex items-center px-1 ${
                    settings.tpSessionsEnabled ? 'bg-[#00e696]' : 'bg-gray-700'
                  }`}
                >
                  <div
                    className={`w-3 h-3 rounded-full bg-white transition-transform ${
                      settings.tpSessionsEnabled ? 'transform translate-x-5' : ''
                    }`}
                  />
                </button>
              </div>
              {settings.tpSessionsEnabled && (
                <div className="grid grid-cols-2 gap-4 pt-1">
                  <div>
                    <label className="text-xs font-bold text-gray-300 block mb-1">Session Start (UTC)</label>
                    <input
                      type="text"
                      value={settings.tpSessionStart || '07:00'}
                      onChange={(e) => handleInputChange('tpSessionStart', e.target.value)}
                      className="w-full bg-[#161B22] border border-[#30363D] rounded px-3 py-1.5 text-xs text-gray-200 font-mono focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-300 block mb-1">Session End (UTC)</label>
                    <input
                      type="text"
                      value={settings.tpSessionEnd || '20:00'}
                      onChange={(e) => handleInputChange('tpSessionEnd', e.target.value)}
                      className="w-full bg-[#161B22] border border-[#30363D] rounded px-3 py-1.5 text-xs text-gray-200 font-mono focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <InputRow
                  label="Cooldown Period (Minutes)"
                  desc="Waiting window after a closed trade before re-entering same symbol (default: 15 min)"
                  value={settings.tpCooldownPeriodMin ?? 15}
                  onChange={(v: any) => handleInputChange('tpCooldownPeriodMin', v)}
                />
                <InputRow
                  label="Max Trades Per Session"
                  desc="Prevents overtrading during high volatility (default: 5)"
                  value={settings.tpMaxTradesPerSession ?? 5}
                  onChange={(v: any) => handleInputChange('tpMaxTradesPerSession', v)}
                />
              </div>
              <div className="grid grid-cols-2 gap-4 pt-2 border-t border-[#30363D]/40">
                <div className="flex justify-between items-center py-1">
                  <span className="text-xs font-semibold text-gray-300">Allow Long Trades</span>
                  <button
                    onClick={() => handleInputChange('tpLongsEnabled', !(settings.tpLongsEnabled ?? true))}
                    className={`w-9 h-4.5 rounded-full transition-colors flex items-center px-0.5 ${
                      (settings.tpLongsEnabled ?? true) ? 'bg-[#00e696]' : 'bg-gray-700'
                    }`}
                  >
                    <div className={`w-3.5 h-3.5 rounded-full bg-white transition-transform ${
                      (settings.tpLongsEnabled ?? true) ? 'transform translate-x-4' : ''
                    }`} />
                  </button>
                </div>
                <div className="flex justify-between items-center py-1">
                  <span className="text-xs font-semibold text-gray-300">Allow Short Trades</span>
                  <button
                    onClick={() => handleInputChange('tpShortsEnabled', !(settings.tpShortsEnabled ?? true))}
                    className={`w-9 h-4.5 rounded-full transition-colors flex items-center px-0.5 ${
                      (settings.tpShortsEnabled ?? true) ? 'bg-[#00e696]' : 'bg-gray-700'
                    }`}
                  >
                    <div className={`w-3.5 h-3.5 rounded-full bg-white transition-transform ${
                      (settings.tpShortsEnabled ?? true) ? 'transform translate-x-4' : ''
                    }`} />
                  </button>
                </div>
              </div>
            </div>

            {/* Sub-section 8: Retest-Aware Entry & Invalidation Architecture */}
            <div className="bg-[#0E1117] border border-[#30363D] rounded-xl p-4 space-y-4">
              <div className="flex items-center space-x-2 border-b border-[#30363D] pb-2">
                <ShieldAlert className="w-4 h-4 text-emerald-400" />
                <h4 className="text-xs font-bold text-gray-200 uppercase tracking-wider">
                  8. Retest-Aware Entry & Two-Level Structural Invalidation
                </h4>
              </div>
              <p className="text-[11px] text-gray-400 leading-relaxed">
                Separates the <strong className="text-cyan-400">Entry Trigger</strong> (breakout/confirmation candle pivot) from the <strong className="text-rose-400">Invalidation Level</strong> (pullback swing low/high + ATR buffer). A retest of the entry level is a normal phase, not a failure.
              </p>

              {/* Mode Selection */}
              <div className="bg-[#161B22] border border-[#30363D] rounded-lg p-3 space-y-2">
                <label className="text-xs font-bold text-gray-200 block">Entry Confirmation Mode</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => handleInputChange('tpEntryMode', 'BREAK_RETEST')}
                    className={`p-3 rounded-lg border text-left transition-all ${
                      (settings.tpEntryMode ?? 'BREAK_RETEST') === 'BREAK_RETEST'
                        ? 'bg-emerald-500/10 border-emerald-500/50 text-gray-100 ring-1 ring-emerald-500/30'
                        : 'bg-gray-900/60 border-gray-800 text-gray-400 hover:border-gray-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-emerald-400">Conservative Mode</span>
                      <span className="text-[9px] uppercase px-1.5 py-0.5 rounded font-mono font-bold bg-emerald-500/20 text-emerald-300">
                        Break &amp; Retest
                      </span>
                    </div>
                    <p className="text-[10.5px] leading-relaxed text-gray-400">
                      Entry only after break, retest into trigger area, and closed continuation candle. Minimizes false breakouts and premature signals.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleInputChange('tpEntryMode', 'BALANCED')}
                    className={`p-3 rounded-lg border text-left transition-all ${
                      (settings.tpEntryMode ?? 'BREAK_RETEST') === 'BALANCED' || (settings.tpEntryMode as any) === 'EARLY_CONFIRMATION'
                        ? 'bg-blue-500/10 border-blue-500/50 text-gray-100 ring-1 ring-blue-500/30'
                        : 'bg-gray-900/60 border-gray-800 text-gray-400 hover:border-gray-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-blue-400">Balanced Mode</span>
                      <span className="text-[9px] uppercase px-1.5 py-0.5 rounded font-mono font-bold bg-blue-500/20 text-blue-300">
                        Retest Tolerance
                      </span>
                    </div>
                    <p className="text-[10.5px] leading-relaxed text-gray-400">
                      Entry on closed confirmation candle with a defined ATR retest tolerance zone. Allows normal retests while holding structural stop.
                    </p>
                  </button>
                </div>
              </div>

              {/* Two-Level Tolerances & Buffers */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <InputRow
                  label="Retest Tolerance Zone (ATR)"
                  desc="Acceptable retest depth beyond trigger before flagging danger (default: 0.5 ATR)"
                  value={settings.tpRetestToleranceAtr ?? 0.5}
                  onChange={(v: any) => handleInputChange('tpRetestToleranceAtr', v)}
                />
                <InputRow
                  label="Structural Stop Invalidation Buffer (ATR)"
                  desc="Volatility buffer placed beyond pullback swing low/high (default: 0.2 ATR)"
                  value={settings.tpStructuralStopBufferAtr ?? 0.2}
                  onChange={(v: any) => handleInputChange('tpStructuralStopBufferAtr', v)}
                />
              </div>

              {/* Retest Safeguards Toggles */}
              <div className="space-y-2 pt-2 border-t border-[#30363D]/40">
                <div className="flex justify-between items-center py-2">
                  <div className="flex flex-col pr-4">
                    <span className="text-xs font-bold text-gray-200">Dangerous Retest Early Safeguard</span>
                    <span className="text-[11px] text-gray-500">
                      Flag warning or exit early if countertrend volume aggressively expands and breaks structural invalidation during retest.
                    </span>
                  </div>
                  <button
                    onClick={() => handleInputChange('tpDangerousRetestEarlyExit', !(settings.tpDangerousRetestEarlyExit ?? true))}
                    className={`w-10 h-5 rounded-full transition-colors flex items-center px-1 shrink-0 ${
                      (settings.tpDangerousRetestEarlyExit ?? true) ? 'bg-[#00e696]' : 'bg-gray-700'
                    }`}
                  >
                    <div
                      className={`w-3 h-3 rounded-full bg-white transition-transform ${
                        (settings.tpDangerousRetestEarlyExit ?? true) ? 'transform translate-x-5' : ''
                      }`}
                    />
                  </button>
                </div>

                <div className="flex justify-between items-center py-2 border-t border-[#30363D]/40">
                  <div className="flex flex-col pr-4">
                    <span className="text-xs font-bold text-gray-200">Preserve Structural Stop During Retest</span>
                    <span className="text-[11px] text-gray-500">
                      When enabled, never move stop loss to breakeven prematurely during the retest phase. Prevents normal retests from triggering stop-outs.
                    </span>
                  </div>
                  <button
                    onClick={() => handleInputChange('tpAllowBreakevenDuringRetest', !(settings.tpAllowBreakevenDuringRetest ?? false))}
                    className={`w-10 h-5 rounded-full transition-colors flex items-center px-1 shrink-0 ${
                      !(settings.tpAllowBreakevenDuringRetest ?? false) ? 'bg-[#00e696]' : 'bg-gray-700'
                    }`}
                  >
                    <div
                      className={`w-3 h-3 rounded-full bg-white transition-transform ${
                        !(settings.tpAllowBreakevenDuringRetest ?? false) ? 'transform translate-x-5' : ''
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* 8 Tracked Outcome Statistics Reference Card */}
              <div className="p-3 bg-gray-900/60 border border-[#30363D] rounded-lg text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-gray-200">Automated Post-Trade Statistical Classifications</span>
                  <span className="text-[10px] text-gray-400 font-mono">8 Failure &amp; Exit Types</span>
                </div>
                <p className="text-[11px] text-gray-400 leading-relaxed">
                  The bot records Maximum Adverse Excursion (MAE) and tags every closed trade with its precise technical classification instead of treating every stop as the same failure:
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 pt-1 text-[10px] font-mono">
                  <span className="px-2 py-1 rounded bg-blue-950/60 text-blue-300 border border-blue-800/40 text-center">
                    CONTINUED_WITHOUT_RETEST
                  </span>
                  <span className="px-2 py-1 rounded bg-emerald-950/60 text-emerald-300 border border-emerald-800/40 text-center">
                    HEALTHY_RETEST_THEN_CONTINUATION
                  </span>
                  <span className="px-2 py-1 rounded bg-amber-950/60 text-amber-300 border border-amber-800/40 text-center">
                    STOPPED_BY_NORMAL_NOISE
                  </span>
                  <span className="px-2 py-1 rounded bg-purple-950/60 text-purple-300 border border-purple-800/40 text-center">
                    STOPPED_BY_LIQUIDITY_SWEEP
                  </span>
                  <span className="px-2 py-1 rounded bg-rose-950/60 text-rose-300 border border-rose-800/40 text-center">
                    FAILED_CONFIRMATION
                  </span>
                  <span className="px-2 py-1 rounded bg-red-950/60 text-red-300 border border-red-800/40 text-center">
                    TRUE_STRUCTURE_INVALIDATION
                  </span>
                  <span className="px-2 py-1 rounded bg-orange-950/60 text-orange-300 border border-orange-800/40 text-center">
                    LATE_ENTRY
                  </span>
                  <span className="px-2 py-1 rounded bg-gray-800 text-gray-300 border border-gray-700 text-center">
                    WRONG_MARKET_REGIME
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
        {activeTab === 'orderBlock' && (
          <div className="space-y-6">
            {/* Strategy Banner */}
            <div className="p-4 bg-gradient-to-r from-indigo-950/40 via-purple-950/30 to-blue-950/20 border border-indigo-500/30 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-start space-x-3">
                <div className="p-2.5 bg-indigo-500/10 border border-indigo-500/30 rounded-lg text-indigo-400 mt-0.5 shrink-0">
                  <Shield className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <h3 className="text-sm font-extrabold text-white tracking-wide">ORDER BLOCK STRATEGY (1:3.5+ R:R) — SPEC V2</h3>
                    {activeStrategiesList.includes('ORDER_BLOCK') ? (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                        ACTIVE IN PORTFOLIO
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-gray-700/50 text-gray-400 border border-gray-600/30">
                        INACTIVE
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mt-1 max-w-2xl leading-relaxed">
                    Closed candles only. Identifies genuine Order Blocks formed by displacement + Break of Structure (BOS), filters out chop via Efficiency Ratio (ER), requires clean first retest reaction, enforces strict 1:3.5+ structural target with no opposing blocker swings inside 2.0R, and sizes positions based on a visible quality checklist.
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-2 shrink-0">
                <button
                  type="button"
                  onClick={() => toggleStrategyInPortfolio('ORDER_BLOCK')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition border cursor-pointer ${
                    activeStrategiesList.includes('ORDER_BLOCK')
                      ? 'bg-rose-500/10 text-rose-300 border-rose-500/30 hover:bg-rose-500/20'
                      : 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40 hover:bg-indigo-500/30'
                  }`}
                >
                  {activeStrategiesList.includes('ORDER_BLOCK') ? 'Deactivate Strategy' : 'Activate Strategy'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPineModalStrategy('ORDER_BLOCK');
                    setShowPineScriptModal(true);
                  }}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold bg-[#161B22] text-gray-300 hover:text-white border border-[#30363D] hover:border-gray-500 transition cursor-pointer flex items-center space-x-1.5"
                >
                  <Code2 className="w-3.5 h-3.5" />
                  <span>Pine Script</span>
                </button>
              </div>
            </div>

            {/* Core R:R & Target Parameters */}
            <div className="bg-[#12161E] border border-[#30363D] rounded-xl p-4 sm:p-5 space-y-4">
              <div className="border-b border-[#30363D]/60 pb-2">
                <h4 className="text-xs font-bold text-gray-200 uppercase tracking-wider flex items-center gap-2">
                  <Target className="w-4 h-4 text-indigo-400" />
                  <span>1. Risk / Reward & Structural Target Geometry</span>
                </h4>
                <p className="text-[11px] text-gray-500 mt-0.5">
                  Strict hard gates. Every trade must have a verified structural path to &gt;= 1:3.5 R:R without opposing blockers.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <InputRow
                  label="Minimum Risk/Reward"
                  desc="Hard gate: minimum structural R:R (Default 3.5)"
                  value={settings.obMinRr ?? 3.5}
                  onChange={(v: number) => handleInputChange('obMinRr', v)}
                />
                <InputRow
                  label="Blocker Zone (R)"
                  desc="Reject if major opposing swing sits within this distance (Default 2.0R)"
                  value={settings.obBlockerZoneR ?? 2.0}
                  onChange={(v: number) => handleInputChange('obBlockerZoneR', v)}
                />
                <InputRow
                  label="Max Cost Ratio (R)"
                  desc="Max fees + slippage + spread as fraction of risk R (Default 0.20R)"
                  value={settings.obMaxCostR ?? 0.20}
                  onChange={(v: number) => handleInputChange('obMaxCostR', v)}
                />
                <InputRow
                  label="Target Search Distance"
                  desc="Max distance in ATR to look for structural targets (Default 15 ATR)"
                  value={settings.obTargetSearchMaxAtr ?? 15.0}
                  onChange={(v: number) => handleInputChange('obTargetSearchMaxAtr', v)}
                />
                <InputRow
                  label="Minimum Swing Leg ATR"
                  desc="Minimum leg into pivot high/low to count as meaningful swing (Default 1.0 ATR)"
                  value={settings.obMinSwingAtr ?? 1.0}
                  onChange={(v: number) => handleInputChange('obMinSwingAtr', v)}
                />
                <InputRow
                  label="Major Swing Leg ATR"
                  desc="Leg size to classify swing as major blocker level (Default 2.0 ATR)"
                  value={settings.obMajorLegAtr ?? 2.0}
                  onChange={(v: number) => handleInputChange('obMajorLegAtr', v)}
                />
              </div>
            </div>

            {/* Displacement & BOS Controls */}
            <div className="bg-[#12161E] border border-[#30363D] rounded-xl p-4 sm:p-5 space-y-4">
              <div className="border-b border-[#30363D]/60 pb-2">
                <h4 className="text-xs font-bold text-gray-200 uppercase tracking-wider flex items-center gap-2">
                  <Zap className="w-4 h-4 text-amber-400" />
                  <span>2. Displacement & Structure Break (BOS) Parameters</span>
                </h4>
                <p className="text-[11px] text-gray-500 mt-0.5">
                  Filters out drifting candles, tiny wiggles, and chop. Mandatory impulse that produces a confirmed closed BOS.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <InputRow
                  label="Min Displacement ATR"
                  desc="Minimum 1-3 bar net move in ATR (Default 1.5 ATR)"
                  value={settings.obMinDisplacementAtr ?? 1.5}
                  onChange={(v: number) => handleInputChange('obMinDisplacementAtr', v)}
                />
                <InputRow
                  label="Strong Displacement ATR"
                  desc="Threshold for Strong Displacement quality factor (Default 2.0 ATR)"
                  value={settings.obStrongDispAtr ?? 2.0}
                  onChange={(v: number) => handleInputChange('obStrongDispAtr', v)}
                />
                <InputRow
                  label="Min Body / Range Ratio"
                  desc="Average body to total range ratio for impulse bars (Default 0.55)"
                  value={settings.obDispBodyRatio ?? 0.55}
                  onChange={(v: number) => handleInputChange('obDispBodyRatio', v)}
                />
                <InputRow
                  label="Supportive Relative Vol"
                  desc="Impulse candle volume vs 20-bar median volume (Default 1.3x)"
                  value={settings.obRelvolSupportive ?? 1.3}
                  onChange={(v: number) => handleInputChange('obRelvolSupportive', v)}
                />
                <InputRow
                  label="Max OB Cluster Bars"
                  desc="Max consecutive opposite candles forming base (Default 3)"
                  value={settings.obMaxCluster ?? 3}
                  onChange={(v: number) => handleInputChange('obMaxCluster', v)}
                />
                <InputRow
                  label="Max OB Width ATR"
                  desc="If width > 1.5 ATR uses body only; if still > 1.5 ATR rejects (Default 1.5)"
                  value={settings.obMaxWidthAtr ?? 1.5}
                  onChange={(v: number) => handleInputChange('obMaxWidthAtr', v)}
                />
              </div>
            </div>

            {/* Retest, Reaction & Anti-Chasing */}
            <div className="bg-[#12161E] border border-[#30363D] rounded-xl p-4 sm:p-5 space-y-4">
              <div className="border-b border-[#30363D]/60 pb-2">
                <h4 className="text-xs font-bold text-gray-200 uppercase tracking-wider flex items-center gap-2">
                  <Shield className="w-4 h-4 text-emerald-400" />
                  <span>3. Retest, Freshness & Anti-Chase Gates</span>
                </h4>
                <p className="text-[11px] text-gray-500 mt-0.5">
                  Controls entry timing, invalidation on deep wick penetration, and strict anti-chasing limits.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <InputRow
                  label="Max Chasing Distance ATR"
                  desc="Reject if entry price moved beyond near edge (Default 0.5 ATR)"
                  value={settings.obMaxChasingAtr ?? 0.5}
                  onChange={(v: number) => handleInputChange('obMaxChasingAtr', v)}
                />
                <InputRow
                  label="SL Invalidation Buffer ATR"
                  desc="Buffer beyond OB far edge / sweep low for SL (Default 0.15 ATR)"
                  value={settings.obSlBufferAtr ?? 0.15}
                  onChange={(v: number) => handleInputChange('obSlBufferAtr', v)}
                />
                <InputRow
                  label="Min Stop Loss ATR"
                  desc="Rejects stop loss if tighter than this threshold (Default 0.6 ATR)"
                  value={settings.obMinSlAtr ?? 0.6}
                  onChange={(v: number) => handleInputChange('obMinSlAtr', v)}
                />
                <InputRow
                  label="Max Stop Loss ATR"
                  desc="Rejects stop loss if wider than this threshold (Default 3.0 ATR)"
                  value={settings.obMaxSlAtr ?? 3.0}
                  onChange={(v: number) => handleInputChange('obMaxSlAtr', v)}
                />
                <InputRow
                  label="Max Touches Allowed"
                  desc="Retest is touch #1. 3rd touch invalidates zone (Default 2)"
                  value={settings.obMaxTouches ?? 2}
                  onChange={(v: number) => handleInputChange('obMaxTouches', v)}
                />
                <InputRow
                  label="Max OB Age (Bars)"
                  desc="Maximum candles since BOS before OB expires (Default 40 bars)"
                  value={settings.obMaxAgeBars ?? 40}
                  onChange={(v: number) => handleInputChange('obMaxAgeBars', v)}
                />
                <InputRow
                  label="Chop ER Threshold"
                  desc="Efficiency Ratio below this indicates chop (Default 0.30)"
                  value={settings.obChopErThreshold ?? 0.30}
                  onChange={(v: number) => handleInputChange('obChopErThreshold', v)}
                />
                <div className="flex flex-col justify-between py-2 border-b border-[#30363D]/50">
                  <div className="flex flex-col mb-1.5">
                    <span className="text-xs font-bold text-gray-200">Liquidity Sweep Requirement</span>
                    <span className="text-[10px] text-gray-500">Preferred (adds quality factor) vs Mandatory</span>
                  </div>
                  <select
                    value={settings.obLiquidityMode || 'preferred'}
                    onChange={(e) => handleInputChange('obLiquidityMode', e.target.value)}
                    className="bg-[#0E1117] border border-[#30363D] rounded p-1.5 text-xs font-mono font-semibold text-gray-200 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="preferred">Preferred (Recommended)</option>
                    <option value="required">Required (Hard Gate)</option>
                    <option value="off">Off (Ignore Sweep)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Quality Checklist & Sizing Information */}
            <div className="bg-[#12161E] border border-indigo-500/20 rounded-xl p-4 sm:p-5 space-y-3">
              <h4 className="text-xs font-bold text-indigo-300 uppercase tracking-wider">
                Visible Quality Checklist & Sizing (Section 12)
              </h4>
              <p className="text-xs text-gray-400 leading-relaxed">
                Rather than an opaque black-box score, trade size is transparently derived from the number of passed quality factors:
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-[11px] font-mono">
                <div className="p-2 rounded bg-[#0E1117] border border-[#30363D] text-gray-300">
                  <strong className="text-emerald-400">Grade A+ (6-7 factors):</strong> 1.0x Full Size
                </div>
                <div className="p-2 rounded bg-[#0E1117] border border-[#30363D] text-gray-300">
                  <strong className="text-teal-400">Grade A (4-5 factors):</strong> 0.85x Size
                </div>
                <div className="p-2 rounded bg-[#0E1117] border border-[#30363D] text-gray-300">
                  <strong className="text-amber-400">Grade B (3 factors):</strong> 0.6x Size
                </div>
                <div className="p-2 rounded bg-[#0E1117] border border-[#30363D] text-gray-300">
                  <strong className="text-rose-400">Grade C (&lt;3 factors):</strong> 0.4x Size
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'coilBreakout' && (
          <div className="space-y-6">
            {/* Strategy Banner */}
            <div className="p-4 bg-gradient-to-r from-emerald-950/40 via-teal-950/30 to-indigo-950/20 border border-emerald-500/30 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-start space-x-3">
                <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-400 mt-0.5 shrink-0">
                  <Layers className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <h3 className="text-sm font-extrabold text-white tracking-wide">TWO-SIDED COIL BREAKOUT STRATEGY (1:5+ R:R)</h3>
                    {activeStrategiesList.includes('COIL_BREAKOUT') ? (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                        ACTIVE IN PORTFOLIO
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-gray-700/50 text-gray-400 border border-gray-600/30">
                        INACTIVE
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mt-1 max-w-xl leading-relaxed">
                    Direction-neutral volatility compression scanner. Does not predict direction while coil forms; waits for confirmed displacement close outside coil boundary, verifies retest hold/reject, and enforces strict 1:5 Reward-to-Risk against market liquidity.
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setPineModalStrategy('COIL_BREAKOUT');
                    setShowPineScriptModal(true);
                  }}
                  className="flex items-center space-x-1.5 px-3 py-2 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 text-emerald-300 hover:text-white text-xs font-bold transition-all shadow-sm cursor-pointer"
                >
                  <Code className="w-4 h-4" />
                  <span>TradingView Pine Script v6</span>
                </button>
                {!activeStrategiesList.includes('COIL_BREAKOUT') ? (
                  <button
                    type="button"
                    onClick={() => toggleStrategyInPortfolio('COIL_BREAKOUT')}
                    className="px-3.5 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-extrabold transition-all shadow-sm cursor-pointer"
                  >
                    + Activate in Portfolio
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => toggleStrategyInPortfolio('COIL_BREAKOUT')}
                    className="px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-rose-300 border border-gray-700 text-xs font-semibold transition-all cursor-pointer"
                  >
                    Deactivate
                  </button>
                )}
              </div>
            </div>

            {/* Sub-section 1: Strict Coil Compression Detector */}
            <div className="bg-[#0E1117] border border-[#30363D] rounded-xl p-4 space-y-4">
              <div className="flex items-center space-x-2 border-b border-[#30363D] pb-2">
                <Target className="w-4 h-4 text-emerald-400" />
                <h4 className="text-xs font-bold text-gray-200 uppercase tracking-wider">1. Strict Coil Detector (Consolidation Geometry)</h4>
              </div>
              <p className="text-[11px] text-gray-400 leading-relaxed">
                Measures whether the range has objectively compressed relative to historical volatility. Avoids forcing arbitrary triangle interpretations.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <InputRow
                  label="Minimum Coil Length (Candles)"
                  desc="Minimum consolidation bars required (default: 5)"
                  value={settings.coilMinLength ?? 5}
                  onChange={(v: any) => handleInputChange('coilMinLength', v)}
                />
                <InputRow
                  label="Maximum Coil Length (Candles)"
                  desc="Maximum consolidation bars allowed (default: 20)"
                  value={settings.coilMaxLength ?? 20}
                  onChange={(v: any) => handleInputChange('coilMaxLength', v)}
                />
                <InputRow
                  label="Max Coil Height vs ATR(14)"
                  desc="Coil High - Coil Low <= N × ATR (default: 1.25)"
                  value={settings.coilMaxHeightAtr ?? 1.25}
                  onChange={(v: any) => handleInputChange('coilMaxHeightAtr', v)}
                />
                <InputRow
                  label="Max Median Candle Range vs ATR"
                  desc="Median candle range inside coil < N × ATR (default: 0.70)"
                  value={settings.coilMedianRangeAtr ?? 0.70}
                  onChange={(v: any) => handleInputChange('coilMedianRangeAtr', v)}
                />
                <InputRow
                  label="Min Body Containment Ratio"
                  desc="Fraction of candle bodies inside coil boundaries (default: 0.70 = 70%)"
                  value={settings.coilMinBodyContainment ?? 0.70}
                  onChange={(v: any) => handleInputChange('coilMinBodyContainment', v)}
                />
              </div>
              <div className="p-3 bg-emerald-950/20 border border-emerald-500/20 rounded-lg text-xs space-y-1 text-gray-300">
                <span className="font-semibold text-emerald-400">Strict Coil Rules Enforced:</span>
                <ul className="list-disc list-inside text-[11px] text-gray-400 space-y-0.5">
                  <li>ATR(14) must be declining or flat across the coil duration.</li>
                  <li>No large opposite breakout candle (&gt; 1.55 × ATR) permitted inside the coil.</li>
                  <li>Coil High = highest wick in window; Coil Low = lowest wick in window.</li>
                </ul>
              </div>
            </div>

            {/* Sub-section 2: Breakout Displacement & Volume */}
            <div className="bg-[#0E1117] border border-[#30363D] rounded-xl p-4 space-y-3">
              <div className="flex items-center space-x-2 border-b border-[#30363D] pb-2">
                <Zap className="w-4 h-4 text-yellow-400" />
                <h4 className="text-xs font-bold text-gray-200 uppercase tracking-wider">2. Breakout Displacement & Volume Expansion</h4>
              </div>
              <p className="text-[11px] text-gray-400 leading-relaxed">
                Breakout bar must close strictly outside coil boundary with strong candle body displacement and volume expansion.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <InputRow
                  label="Breakout Body vs Median Body"
                  desc="Breakout body >= N × median coil body (default: 1.20x)"
                  value={settings.coilBreakoutBodyMult ?? 1.20}
                  onChange={(v: any) => handleInputChange('coilBreakoutBodyMult', v)}
                />
                <InputRow
                  label="Breakout Range vs Median Range"
                  desc="Breakout range >= N × median coil range (default: 1.25x)"
                  value={settings.coilBreakoutRangeMult ?? 1.25}
                  onChange={(v: any) => handleInputChange('coilBreakoutRangeMult', v)}
                />
                <InputRow
                  label="Breakout Volume vs Mean Coil Volume"
                  desc="Volume >= N × mean coil volume (default: 1.25x)"
                  value={settings.coilBreakoutVolMult ?? 1.25}
                  onChange={(v: any) => handleInputChange('coilBreakoutVolMult', v)}
                />
              </div>
            </div>

            {/* Sub-section 3: Entry Mode & Retest Logic */}
            <div className="bg-[#0E1117] border border-[#30363D] rounded-xl p-4 space-y-4">
              <div className="flex items-center space-x-2 border-b border-[#30363D] pb-2">
                <ShieldCheck className="w-4 h-4 text-cyan-400" />
                <h4 className="text-xs font-bold text-gray-200 uppercase tracking-wider">3. Entry Execution Mode & Retest Rules</h4>
              </div>
              <p className="text-[11px] text-gray-400 leading-relaxed">
                Choose between waiting for a verified boundary retest or entering directly upon breakout bar close.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div 
                  onClick={() => handleInputChange('coilEntryMode', 'limit_on_retest')}
                  className={`p-3 rounded-lg border cursor-pointer transition ${
                    (settings.coilEntryMode ?? 'limit_on_retest') === 'limit_on_retest'
                      ? 'bg-emerald-500/10 border-emerald-500/50 text-gray-100 ring-1 ring-emerald-500/30'
                      : 'bg-gray-900/60 border-gray-800 text-gray-400 hover:border-gray-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-emerald-400">Limit on Retest (Recommended)</span>
                    <span className="text-[9px] uppercase px-1.5 py-0.5 rounded font-mono font-bold bg-emerald-500/20 text-emerald-300">
                      Standard Mode
                    </span>
                  </div>
                  <p className="text-[10.5px] leading-relaxed text-gray-400">
                    Waits for pullback into coil high (long) or coil low (short) with rejection wick. Once long triggers, pending short is cancelled.
                  </p>
                </div>

                <div 
                  onClick={() => handleInputChange('coilEntryMode', 'aggressive_breakout')}
                  className={`p-3 rounded-lg border cursor-pointer transition ${
                    settings.coilEntryMode === 'aggressive_breakout'
                      ? 'bg-amber-500/10 border-amber-500/50 text-gray-100 ring-1 ring-amber-500/30'
                      : 'bg-gray-900/60 border-gray-800 text-gray-400 hover:border-gray-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-amber-400">Aggressive Breakout Mode</span>
                    <span className="text-[9px] uppercase px-1.5 py-0.5 rounded font-mono font-bold bg-amber-500/20 text-amber-300">
                      Immediate
                    </span>
                  </div>
                  <p className="text-[10.5px] leading-relaxed text-gray-400">
                    Executes immediately on breakout candle close without waiting for retest. Higher fill rate, wider initial stop distance.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-[#30363D]/40">
                <InputRow
                  label="Stop Loss ATR Buffer"
                  desc="Buffer beyond coil boundary for structural invalidation (default: 0.20 ATR)"
                  value={settings.coilSlAtrBuffer ?? 0.20}
                  onChange={(v: any) => handleInputChange('coilSlAtrBuffer', v)}
                />
              </div>
            </div>

            {/* Sub-section 4: Strict 1:5 Reward-to-Risk & Market Filters */}
            <div className="bg-[#0E1117] border border-[#30363D] rounded-xl p-4 space-y-4">
              <div className="flex items-center space-x-2 border-b border-[#30363D] pb-2">
                <Target className="w-4 h-4 text-emerald-400" />
                <h4 className="text-xs font-bold text-gray-200 uppercase tracking-wider">4. Strict 1:5 Reward-to-Risk & Regime Filters</h4>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <InputRow
                  label="Minimum Target Reward-to-Risk"
                  desc="Strict rule: net R:R must be at least 1:5.0 (default: 5.0)"
                  value={settings.coilMinRewardRisk ?? 5.0}
                  onChange={(v: any) => handleInputChange('coilMinRewardRisk', v)}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-[#30363D]/40">
                <div className="flex justify-between items-center py-1">
                  <div className="flex flex-col">
                    <span className="text-xs font-semibold text-gray-300">Require BTC Trend Alignment Filter</span>
                    <span className="text-[10px] text-gray-500">Longs require neutral-bullish BTC; shorts require neutral-bearish BTC.</span>
                  </div>
                  <button
                    onClick={() => handleInputChange('coilRequireBtcFilter', !(settings.coilRequireBtcFilter ?? true))}
                    className={`w-9 h-4.5 rounded-full transition-colors flex items-center px-0.5 ${
                      (settings.coilRequireBtcFilter ?? true) ? 'bg-[#00e696]' : 'bg-gray-700'
                    }`}
                  >
                    <div className={`w-3.5 h-3.5 rounded-full bg-white transition-transform ${
                      (settings.coilRequireBtcFilter ?? true) ? 'transform translate-x-4' : ''
                    }`} />
                  </button>
                </div>

                <div className="flex justify-between items-center py-1">
                  <div className="flex flex-col">
                    <span className="text-xs font-semibold text-gray-300">Require Relative Strength / Weakness vs BTC</span>
                    <span className="text-[10px] text-gray-500">Coin must outperform BTC for long, or underperform BTC for short.</span>
                  </div>
                  <button
                    onClick={() => handleInputChange('coilRequireRelStrength', !(settings.coilRequireRelStrength ?? true))}
                    className={`w-9 h-4.5 rounded-full transition-colors flex items-center px-0.5 ${
                      (settings.coilRequireRelStrength ?? true) ? 'bg-[#00e696]' : 'bg-gray-700'
                    }`}
                  >
                    <div className={`w-3.5 h-3.5 rounded-full bg-white transition-transform ${
                      (settings.coilRequireRelStrength ?? true) ? 'transform translate-x-4' : ''
                    }`} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
        {activeTab === 'multicoinScalper' && (
          <div className="space-y-6">
            {/* Strategy Banner */}
            <div className="p-4 bg-gradient-to-r from-amber-950/40 via-orange-950/30 to-yellow-950/20 border border-amber-500/30 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-start space-x-3">
                <div className="p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-400 mt-0.5 shrink-0">
                  <Flame className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <h3 className="text-sm font-extrabold text-white tracking-wide">3COMMAS MULTICOIN SCALPER PRO (SWISSALGO)</h3>
                    {activeStrategiesList.includes('MULTICOIN_SCALPER_PRO') ? (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30">
                        ACTIVE IN PORTFOLIO
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-gray-700/50 text-gray-400 border border-gray-600/30">
                        INACTIVE
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mt-1 max-w-xl leading-relaxed">
                    Universal bot setup optimized across the Top 100 USDT volume altcoins: Stables & Spread Filtering → ATR Volatility Bands → EMA Ribbon Stacks → Session VWAP → RSI Pullback Resting Zone → Dynamic ATR Stops & Multi-tier TPs.
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setPineModalStrategy('MULTICOIN_SCALPER');
                    setShowPineScriptModal(true);
                  }}
                  className="flex items-center space-x-1.5 px-3 py-2 rounded-lg bg-amber-600/20 hover:bg-amber-600/30 border border-amber-500/40 text-amber-300 hover:text-white text-xs font-bold transition-all shadow-sm cursor-pointer"
                >
                  <Code className="w-4 h-4" />
                  <span>TradingView Pine Script v6</span>
                </button>
                {!activeStrategiesList.includes('MULTICOIN_SCALPER_PRO') ? (
                  <button
                    type="button"
                    onClick={() => toggleStrategyInPortfolio('MULTICOIN_SCALPER_PRO')}
                    className="px-3.5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-xs font-extrabold transition-all shadow-sm cursor-pointer"
                  >
                    + Activate in Portfolio
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => toggleStrategyInPortfolio('MULTICOIN_SCALPER_PRO')}
                    className="px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-rose-300 border border-gray-700 text-xs font-semibold transition-all cursor-pointer"
                  >
                    Deactivate
                  </button>
                )}
              </div>
            </div>

            {/* Profile Selection Tabs (5m Scalp vs 15m Swing) */}
            <div className="bg-[#0E1117] border border-[#30363D] rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-[#30363D] pb-2">
                <div className="flex items-center space-x-2">
                  <Zap className="w-4 h-4 text-amber-400" />
                  <h4 className="text-xs font-bold text-gray-200 uppercase tracking-wider">Trading Profile Mode</h4>
                </div>
                <span className="text-[11px] text-amber-400 font-mono font-bold">
                  {settings.multicoinProfile === '15m_SWING' ? '15m Swing Profile Active' : '5m Scalp Profile Active'}
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    handleInputChange('multicoinProfile', '5m_SCALP');
                    handleInputChange('multicoinEmaFast', 9);
                    handleInputChange('multicoinEmaMid', 21);
                    handleInputChange('multicoinEmaSlow', 55);
                    handleInputChange('multicoinRsiPeriod', 7);
                    handleInputChange('multicoinRsiLongMin', 35);
                    handleInputChange('multicoinRsiLongMax', 55);
                    handleInputChange('multicoinRsiShortMin', 45);
                    handleInputChange('multicoinRsiShortMax', 65);
                    handleInputChange('multicoinTp1Pct', 0.8);
                    handleInputChange('multicoinTp2Pct', 1.5);
                    handleInputChange('multicoinMinAtrPct', 0.15);
                    handleInputChange('multicoinMaxAtrPct', 2.5);
                  }}
                  className={`p-3.5 rounded-lg border text-left transition cursor-pointer ${
                    (settings.multicoinProfile || '5m_SCALP') === '5m_SCALP'
                      ? 'bg-amber-950/30 border-amber-500/50 shadow-sm'
                      : 'bg-[#161B22]/50 border-[#30363D] hover:border-gray-500'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-extrabold text-white flex items-center gap-1.5">
                      <Zap className="w-3.5 h-3.5 text-amber-400" />
                      <span>5m Scalp Profile (High-Frequency Micro-Trends)</span>
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono font-bold">
                      RECOMMENDED
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-400 leading-relaxed">
                    Uses EMA 9 / 21 / 55 Ribbon, Session VWAP, RSI(7) resting zone (35-55), 0.4-0.8% dynamic stop loss, 0.8% TP1, 1.5% TP2, and 15-20m time-based exit for rapid turnover.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    handleInputChange('multicoinProfile', '15m_SWING');
                    handleInputChange('multicoinEmaFast', 20);
                    handleInputChange('multicoinEmaMid', 50);
                    handleInputChange('multicoinEmaSlow', 200);
                    handleInputChange('multicoinRsiPeriod', 14);
                    handleInputChange('multicoinRsiLongMin', 40);
                    handleInputChange('multicoinRsiLongMax', 50);
                    handleInputChange('multicoinRsiShortMin', 50);
                    handleInputChange('multicoinRsiShortMax', 60);
                    handleInputChange('multicoinTp1Pct', 2.5);
                    handleInputChange('multicoinTp2Pct', 4.5);
                    handleInputChange('multicoinMinAtrPct', 0.3);
                    handleInputChange('multicoinMaxAtrPct', 4.5);
                  }}
                  className={`p-3.5 rounded-lg border text-left transition cursor-pointer ${
                    settings.multicoinProfile === '15m_SWING'
                      ? 'bg-orange-950/30 border-orange-500/50 shadow-sm'
                      : 'bg-[#161B22]/50 border-[#30363D] hover:border-gray-500'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-extrabold text-white flex items-center gap-1.5">
                      <TrendingUp className="w-3.5 h-3.5 text-orange-400" />
                      <span>15m Swing Profile (Macro Waves & Swings)</span>
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-300 font-mono font-bold">
                      SWING
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-400 leading-relaxed">
                    Uses EMA 20 / 50 / 200 Stack, optional 1H/4H HTF EMA 89 & 200 filter, RSI(14), 2-4% structural stop loss, 2.5% TP1, 4.5% TP2, and trailing stops for extended runners.
                  </p>
                </button>
              </div>
            </div>

            {/* Sub-section 1: Universe & Pre-Filters */}
            <div className="bg-[#0E1117] border border-[#30363D] rounded-xl p-4 space-y-3">
              <div className="flex items-center space-x-2 border-b border-[#30363D] pb-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <h4 className="text-xs font-bold text-gray-200 uppercase tracking-wider">1. Universe & Pre-Filters (Top 100 Volume Quality)</h4>
              </div>
              <p className="text-[11px] text-gray-400 leading-relaxed">
                Pre-scan qualification executed every scan cycle. Eliminates illiquid tokens, wide spreads, dead volume, and manipulative spikes before evaluating indicator setups.
              </p>

              <div className="flex justify-between items-center py-2 border-b border-[#30363D]/40">
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-gray-200">Filter Out Stablecoins & Wrapped Tokens</span>
                  <span className="text-[11px] text-gray-500">Automatically blacklist USDC, FDUSD, TUSD, BUSD, USDP, DAI, stETH, WBTC, etc.</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleInputChange('multicoinFilterStables', !(settings.multicoinFilterStables ?? true))}
                  className={`w-10 h-5 rounded-full transition-colors flex items-center px-1 cursor-pointer ${
                    (settings.multicoinFilterStables ?? true) ? 'bg-[#00e696]' : 'bg-gray-700'
                  }`}
                >
                  <div
                    className={`w-3 h-3 rounded-full bg-white transition-transform ${
                      (settings.multicoinFilterStables ?? true) ? 'transform translate-x-5' : ''
                    }`}
                  />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <InputRow
                  label="Minimum 24h Volume (USDT)"
                  desc="Minimum 24h quote volume required (default: $20,000,000 for alts)"
                  value={settings.multicoinMin24hVolumeUsdt ?? 20000000}
                  onChange={(v: any) => handleInputChange('multicoinMin24hVolumeUsdt', v)}
                />
                <InputRow
                  label="Maximum Bid-Ask Spread %"
                  desc="Rejects coins with wide spreads on order book (default: 0.08%)"
                  value={settings.multicoinMaxSpreadPct ?? 0.08}
                  onChange={(v: any) => handleInputChange('multicoinMaxSpreadPct', v)}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                <InputRow
                  label="Min ATR % (Avoid Dead Markets)"
                  desc="ATR(14)/close must be >= this % to ensure coin has tradable volatility (default: 0.15% on 5m)"
                  value={settings.multicoinMinAtrPct ?? 0.15}
                  onChange={(v: any) => handleInputChange('multicoinMinAtrPct', v)}
                />
                <InputRow
                  label="Max ATR % (Avoid Crazy Markets)"
                  desc="Rejects pairs with extreme chaos or manipulation (default: 2.5% on 5m)"
                  value={settings.multicoinMaxAtrPct ?? 2.5}
                  onChange={(v: any) => handleInputChange('multicoinMaxAtrPct', v)}
                />
                <InputRow
                  label="Max Single-Bar Move % (News Filter)"
                  desc="Vetoes trades if last candle jumped > this % to avoid news pump-and-dumps (default: 5.0%)"
                  value={settings.multicoinMaxSingleBarPct ?? 5.0}
                  onChange={(v: any) => handleInputChange('multicoinMaxSingleBarPct', v)}
                />
              </div>
            </div>

            {/* Sub-section 2: Trend Moving Averages & Session VWAP */}
            <div className="bg-[#0E1117] border border-[#30363D] rounded-xl p-4 space-y-3">
              <div className="flex items-center space-x-2 border-b border-[#30363D] pb-2">
                <TrendingUp className="w-4 h-4 text-cyan-400" />
                <h4 className="text-xs font-bold text-gray-200 uppercase tracking-wider">2. Trend Ribbon (EMA Stack) & Session VWAP</h4>
              </div>
              <p className="text-[11px] text-gray-400 leading-relaxed">
                Defines directional bias. For Longs: Fast EMA &gt; Mid EMA &gt; Slow EMA, and price above Session VWAP. For Shorts: Fast &lt; Mid &lt; Slow, and price below VWAP.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <InputRow
                  label="Fast Micro-Trend EMA"
                  desc="Fastest EMA line (default: 9 for 5m, 20 for 15m)"
                  value={settings.multicoinEmaFast ?? 9}
                  onChange={(v: any) => handleInputChange('multicoinEmaFast', v)}
                />
                <InputRow
                  label="Mid Pullback Anchor EMA"
                  desc="Dynamic support/resistance retest zone (default: 21 for 5m, 50 for 15m)"
                  value={settings.multicoinEmaMid ?? 21}
                  onChange={(v: any) => handleInputChange('multicoinEmaMid', v)}
                />
                <InputRow
                  label="Slow Baseline EMA"
                  desc="Trend foundation baseline (default: 55 for 5m, 200 for 15m)"
                  value={settings.multicoinEmaSlow ?? 55}
                  onChange={(v: any) => handleInputChange('multicoinEmaSlow', v)}
                />
              </div>

              <div className="flex justify-between items-center py-2 border-b border-[#30363D]/40">
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-gray-200">Require Daily Session VWAP Alignment</span>
                  <span className="text-[11px] text-gray-500">Longs must be above Session VWAP; shorts must be below Session VWAP.</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleInputChange('multicoinRequireVwap', !(settings.multicoinRequireVwap ?? true))}
                  className={`w-10 h-5 rounded-full transition-colors flex items-center px-1 cursor-pointer ${
                    (settings.multicoinRequireVwap ?? true) ? 'bg-[#00e696]' : 'bg-gray-700'
                  }`}
                >
                  <div
                    className={`w-3 h-3 rounded-full bg-white transition-transform ${
                      (settings.multicoinRequireVwap ?? true) ? 'transform translate-x-5' : ''
                    }`}
                  />
                </button>
              </div>

              {settings.multicoinProfile === '15m_SWING' && (
                <div className="p-3 bg-indigo-950/20 border border-indigo-500/20 rounded-lg space-y-3">
                  <div className="flex justify-between items-center">
                    <div className="flex flex-col">
                      <span className="text-xs font-bold text-gray-200">Higher Timeframe (1H/4H) Trend Filter</span>
                      <span className="text-[11px] text-gray-500">Only permit 15m swings aligned with 1H/4H macro EMAs.</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleInputChange('multicoinUseHtfFilter', !(settings.multicoinUseHtfFilter ?? true))}
                      className={`w-10 h-5 rounded-full transition-colors flex items-center px-1 cursor-pointer ${
                        (settings.multicoinUseHtfFilter ?? true) ? 'bg-[#00e696]' : 'bg-gray-700'
                      }`}
                    >
                      <div
                        className={`w-3 h-3 rounded-full bg-white transition-transform ${
                          (settings.multicoinUseHtfFilter ?? true) ? 'transform translate-x-5' : ''
                        }`}
                      />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <InputRow
                      label="HTF Fast EMA Period"
                      desc="Default: 89"
                      value={settings.multicoinHtfEmaFast ?? 89}
                      onChange={(v: any) => handleInputChange('multicoinHtfEmaFast', v)}
                    />
                    <InputRow
                      label="HTF Slow EMA Period"
                      desc="Default: 200"
                      value={settings.multicoinHtfEmaSlow ?? 200}
                      onChange={(v: any) => handleInputChange('multicoinHtfEmaSlow', v)}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Sub-section 3: Momentum & Pullback Confirmation */}
            <div className="bg-[#0E1117] border border-[#30363D] rounded-xl p-4 space-y-3">
              <div className="flex items-center space-x-2 border-b border-[#30363D] pb-2">
                <Target className="w-4 h-4 text-purple-400" />
                <h4 className="text-xs font-bold text-gray-200 uppercase tracking-wider">3. Pullback Mechanics & RSI Resting Zone</h4>
              </div>
              <p className="text-[11px] text-gray-400 leading-relaxed">
                Prevents FOMO buying tops or panic selling bottoms. Price must retrace to touch or test EMA 21 / VWAP, show rejection wicks, and print RSI in a resting zone before triggering.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <InputRow
                  label="RSI Period"
                  desc="Relative Strength Index calculation period (default: 7 for 5m, 14 for 15m)"
                  value={settings.multicoinRsiPeriod ?? 7}
                  onChange={(v: any) => handleInputChange('multicoinRsiPeriod', v)}
                />
                <InputRow
                  label="Min Volume Ratio (vs 20-MA)"
                  desc="Current candle volume must be >= this fraction of 20-candle MA (default: 0.8x)"
                  value={settings.multicoinMinVolRatio ?? 0.8}
                  onChange={(v: any) => handleInputChange('multicoinMinVolRatio', v)}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div className="p-3 bg-[#161B22] border border-[#30363D] rounded-lg space-y-2">
                  <span className="text-xs font-bold text-emerald-400 block">Long Pullback RSI Band (35 - 55)</span>
                  <div className="grid grid-cols-2 gap-2">
                    <InputRow
                      label="Long Min RSI"
                      desc="Pullback floor"
                      value={settings.multicoinRsiLongMin ?? 35}
                      onChange={(v: any) => handleInputChange('multicoinRsiLongMin', v)}
                    />
                    <InputRow
                      label="Long Max RSI"
                      desc="Not overbought"
                      value={settings.multicoinRsiLongMax ?? 55}
                      onChange={(v: any) => handleInputChange('multicoinRsiLongMax', v)}
                    />
                  </div>
                </div>

                <div className="p-3 bg-[#161B22] border border-[#30363D] rounded-lg space-y-2">
                  <span className="text-xs font-bold text-rose-400 block">Short Pullback RSI Band (45 - 65)</span>
                  <div className="grid grid-cols-2 gap-2">
                    <InputRow
                      label="Short Min RSI"
                      desc="Not oversold"
                      value={settings.multicoinRsiShortMin ?? 45}
                      onChange={(v: any) => handleInputChange('multicoinRsiShortMin', v)}
                    />
                    <InputRow
                      label="Short Max RSI"
                      desc="Pullback ceiling"
                      value={settings.multicoinRsiShortMax ?? 65}
                      onChange={(v: any) => handleInputChange('multicoinRsiShortMax', v)}
                    />
                  </div>
                </div>
              </div>

              <InputRow
                label="ADX Trend Filter Threshold"
                desc="ADX(14) >= 20 confirms active trending regime. Below 18 flags choppy range (default: 20)"
                value={settings.multicoinAdxThreshold ?? 20}
                onChange={(v: any) => handleInputChange('multicoinAdxThreshold', v)}
              />
            </div>

            {/* Sub-section 4: Exits, Targets & Risk Controls */}
            <div className="bg-[#0E1117] border border-[#30363D] rounded-xl p-4 space-y-3">
              <div className="flex items-center space-x-2 border-b border-[#30363D] pb-2">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                <h4 className="text-xs font-bold text-gray-200 uppercase tracking-wider">4. Risk Management, Dynamic Targets & Time Exits</h4>
              </div>
              <p className="text-[11px] text-gray-400 leading-relaxed">
                Stops are positioned beyond the recent swing low/high and dynamic ATR buffer (0.4-0.8% away on alts). Take profits are structured in two tiers: 50% partial at TP1 (move SL to breakeven), and runner at TP2.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <InputRow
                  label="Take Profit 1 (%)"
                  desc="Target 1 partial close (default: 0.8% for scalp, 2.5% for swing)"
                  value={settings.multicoinTp1Pct ?? 0.8}
                  onChange={(v: any) => handleInputChange('multicoinTp1Pct', v)}
                />
                <InputRow
                  label="Take Profit 2 (%)"
                  desc="Target 2 exit (default: 1.5% for scalp, 4.5% for swing)"
                  value={settings.multicoinTp2Pct ?? 1.5}
                  onChange={(v: any) => handleInputChange('multicoinTp2Pct', v)}
                />
                <InputRow
                  label="Stop Loss ATR Multiplier"
                  desc="Buffer beyond EMA 55 / VWAP / swing extreme (default: 1.5x)"
                  value={settings.multicoinSlAtrMult ?? 1.5}
                  onChange={(v: any) => handleInputChange('multicoinSlAtrMult', v)}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <InputRow
                  label="Risk % Per Trade"
                  desc="Capital at risk per entry (default: 0.25-0.5% for scalp, 0.5-1.0% for swing)"
                  value={settings.multicoinRiskPerTrade ?? 0.5}
                  onChange={(v: any) => handleInputChange('multicoinRiskPerTrade', v)}
                />
                <InputRow
                  label="Time-Based Exit (Minutes)"
                  desc="If price does not move favorably within this window, exits sluggish scalp (default: 20 min)"
                  value={settings.multicoinTimeExitMinutes ?? 20}
                  onChange={(v: any) => handleInputChange('multicoinTimeExitMinutes', v)}
                />
              </div>
            </div>
          </div>
        )}
        {(activeTab === 'lsr' || activeTab === 'smc') && (
          <div className="space-y-6">
            {/* Strategy Banner */}
            <div className="p-4 bg-gradient-to-r from-cyan-950/40 via-blue-950/30 to-indigo-950/20 border border-cyan-500/30 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-start space-x-3">
                <div className="p-2.5 bg-cyan-500/10 border border-cyan-500/30 rounded-lg text-cyan-400 mt-0.5 shrink-0">
                  <Droplets className="w-5 h-5 animate-pulse" />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <h3 className="text-sm font-extrabold text-white tracking-wide">LIQUIDITY SWEEP REVERSAL (LSR) STRATEGY</h3>
                    {activeStrategiesList.includes('LIQUIDITY_SWEEP_REVERSAL') || activeStrategiesList.includes('SMC_LIQUIDITY') ? (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                        ACTIVE IN PORTFOLIO
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-gray-700/50 text-gray-400 border border-gray-600/30">
                        INACTIVE
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mt-1 max-w-xl leading-relaxed">
                    Institutional failed-breakout engine: Obvious Liquidity &rarr; Sweep &rarr; True vs Continuation Check &rarr; Mandatory Reclaim &rarr; Micro-Structure Shift &rarr; Tight Stop & Opposing Target.
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-2 shrink-0">
                <button
                  onClick={() => {
                    const pine = generateLsrPineScript(settings);
                    navigator.clipboard.writeText(pine);
                    setSaveStatus('Pine Script v6 copied to clipboard!');
                    setTimeout(() => setSaveStatus(null), 3000);
                  }}
                  className="flex items-center space-x-1.5 px-3 py-2 rounded-lg bg-cyan-600/20 hover:bg-cyan-600/30 border border-cyan-500/40 text-cyan-300 hover:text-white text-xs font-bold transition-all shadow-sm cursor-pointer"
                >
                  <Code className="w-4 h-4" />
                  <span>Copy Pine Script v6</span>
                </button>
                {!(activeStrategiesList.includes('LIQUIDITY_SWEEP_REVERSAL') || activeStrategiesList.includes('SMC_LIQUIDITY')) ? (
                  <button
                    onClick={() => toggleStrategyInPortfolio('LIQUIDITY_SWEEP_REVERSAL')}
                    className="px-3.5 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-black text-xs font-extrabold transition-all shadow-sm cursor-pointer"
                  >
                    + Activate in Portfolio
                  </button>
                ) : (
                  <button
                    onClick={() => toggleStrategyInPortfolio(activeStrategiesList.includes('LIQUIDITY_SWEEP_REVERSAL') ? 'LIQUIDITY_SWEEP_REVERSAL' : 'SMC_LIQUIDITY')}
                    className="px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-rose-300 border border-gray-700 text-xs font-semibold transition-all cursor-pointer"
                  >
                    Deactivate
                  </button>
                )}
              </div>
            </div>

            {/* Sub-section 1: Multi-Timeframe Architecture */}
            <div className="bg-[#0E1117] border border-[#30363D] rounded-xl p-4 space-y-3">
              <div className="flex items-center space-x-2 border-b border-[#30363D] pb-2">
                <Clock className="w-4 h-4 text-cyan-400" />
                <h4 className="text-xs font-bold text-gray-200 uppercase tracking-wider">1. Timeframe Architecture & Lookback</h4>
              </div>
              <p className="text-[11px] text-gray-400 leading-relaxed">
                Uses 15m for context and 5m for primary execution. Fast micro-structure verification prevents late entries.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-gray-300 block mb-1">Execution Timeframe</label>
                  <select
                    value={settings.lsrExecutionTimeframe || '5m'}
                    onChange={(e) => handleInputChange('lsrExecutionTimeframe', e.target.value)}
                    className="w-full bg-[#161B22] border border-[#30363D] rounded px-3 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-cyan-500"
                  >
                    <option value="5m">5m (Recommended for Tight Invalidation)</option>
                    <option value="15m">15m (Balanced Intraday Reversals)</option>
                    <option value="1H">1H (Swing High/Low Sweeps)</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-300 block mb-1">Context / HTF Timeframe</label>
                  <select
                    value={settings.lsrContextTimeframe || '15m'}
                    onChange={(e) => handleInputChange('lsrContextTimeframe', e.target.value)}
                    className="w-full bg-[#161B22] border border-[#30363D] rounded px-3 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-cyan-500"
                  >
                    <option value="15m">15m</option>
                    <option value="1H">1H</option>
                    <option value="4H">4H</option>
                  </select>
                </div>
              </div>
              <InputRow
                label="Liquidity Structure Lookback (Bars)"
                desc="Number of candles scanned to identify key swing highs/lows and equal level clusters (default: 35 bars)"
                value={settings.lsrStructureLookback ?? 35}
                onChange={(v: any) => handleInputChange('lsrStructureLookback', v)}
              />
            </div>

            {/* Sub-section 2: Strict Mode & Sweep Boundaries */}
            <div className="bg-[#0E1117] border border-[#30363D] rounded-xl p-4 space-y-3">
              <div className="flex items-center space-x-2 border-b border-[#30363D] pb-2">
                <Layers className="w-4 h-4 text-indigo-400" />
                <h4 className="text-xs font-bold text-gray-200 uppercase tracking-wider">2. Upgraded Strict Mode & Sweep Boundaries</h4>
              </div>
              <p className="text-[11px] text-gray-400 leading-relaxed">
                Evaluated strictly on closed candles: Enforces strict shooting star/hammer rejection wicks, volume absorption, fee floor caps, and 2.5R minimum target distance.
              </p>

              <div className="flex justify-between items-center py-2 border-b border-[#30363D]/40">
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-gray-200">Strict Mode (All Hard Gates)</span>
                  <span className="text-[11px] text-gray-500">Enforce strict 0.10-1.0x ATR sweep, strict star shape, 1-bar reacceptance, and fee floor protection.</span>
                </div>
                <button
                  onClick={() => handleInputChange('lsrStrictMode', !(settings.lsrStrictMode ?? true))}
                  className={`w-10 h-5 rounded-full transition-colors flex items-center px-1 ${
                    (settings.lsrStrictMode ?? true) ? 'bg-[#00e696]' : 'bg-gray-700'
                  }`}
                >
                  <div
                    className={`w-3 h-3 rounded-full bg-white transition-transform ${
                      (settings.lsrStrictMode ?? true) ? 'transform translate-x-5' : ''
                    }`}
                  />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <InputRow
                  label="Min Sweep Depth (ATR)"
                  desc="Minimum penetration beyond pool to qualify as a genuine sweep (default: 0.10x ATR)"
                  value={settings.lsrSweepMinAtr ?? 0.10}
                  onChange={(v: any) => handleInputChange('lsrSweepMinAtr', v)}
                />
                <InputRow
                  label="Max Sweep Depth (ATR)"
                  desc="Maximum allowable penetration beyond pool. Excessively deep sweeps are rejected (default: 1.0x ATR)"
                  value={settings.lsrSweepMaxAtr ?? 1.0}
                  onChange={(v: any) => handleInputChange('lsrSweepMaxAtr', v)}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <InputRow
                  label="Max Reacceptance Bars"
                  desc="Maximum bars to close back inside the level: 1 = strict mode, 2 = relaxed mode (default: 1)"
                  value={settings.lsrMaxReacceptanceBars ?? 1}
                  onChange={(v: any) => handleInputChange('lsrMaxReacceptanceBars', v)}
                />
                <InputRow
                  label="C0 Volume Multiplier (x SMA20)"
                  desc="Rejection candle volume must exceed this multiple of 20-period SMA volume (default: 1.5x)"
                  value={settings.lsrVolMult ?? 1.5}
                  onChange={(v: any) => handleInputChange('lsrVolMult', v)}
                />
              </div>
            </div>

            {/* Sub-section 3: Rejection Candle Star & Confirmation Mode */}
            <div className="bg-[#0E1117] border border-[#30363D] rounded-xl p-4 space-y-3">
              <div className="flex items-center space-x-2 border-b border-[#30363D] pb-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <h4 className="text-xs font-bold text-gray-200 uppercase tracking-wider">3. Rejection Star Shape & Confirmation Trigger</h4>
              </div>
              <p className="text-[11px] text-gray-400 leading-relaxed">
                Candle C0 must form a strict shooting star (short) or hammer (long) with upper/lower wick &ge; 2x body and &ge; 60% range.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <InputRow
                  label="Min Wick-to-Body Ratio"
                  desc="Upper wick (short) or lower wick (long) must be at least this multiple of body size (default: 2.0x)"
                  value={settings.lsrMinWickBodyRatio ?? 2.0}
                  onChange={(v: any) => handleInputChange('lsrMinWickBodyRatio', v)}
                />
                <InputRow
                  label="Min Wick-to-Range Ratio"
                  desc="Wick must account for at least this percentage of the total candle range (default: 0.60 = 60%)"
                  value={settings.lsrMinWickRangeRatio ?? 0.60}
                  onChange={(v: any) => handleInputChange('lsrMinWickRangeRatio', v)}
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-300 block mb-1">Confirmation & Entry Trigger Mode</label>
                <select
                  value={settings.lsrConfirmationTrigger || 'MIDPOINT_LIMIT'}
                  onChange={(e) => handleInputChange('lsrConfirmationTrigger', e.target.value)}
                  className="w-full bg-[#161B22] border border-[#30363D] rounded px-3 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-cyan-500"
                >
                  <option value="SWEPT_LEVEL">Swept Level Retest: Limit order at exact swept liquidity pool level</option>
                  <option value="MIDPOINT_LIMIT">C0 Midpoint (50%): Limit order at midpoint of C0 rejection candle (TTL: 4 bars)</option>
                  <option value="C0_CLOSE">Immediate: Market entry as soon as C0 rejection candle closes back inside level</option>
                  <option value="LITE_CLOSE">Lite: Market entry upon closed candle beyond C0 extreme within 3 bars</option>
                  <option value="DEFAULT_FVG">Default: Body-closes beyond MSS + FVG 50% Limit Retest (TTL: 6 bars)</option>
                </select>
              </div>
            </div>

            {/* Sub-section 4: Location & Anti-Trap Filters */}
            <div className="bg-[#0E1117] border border-[#30363D] rounded-xl p-4 space-y-3">
              <div className="flex items-center space-x-2 border-b border-[#30363D] pb-2">
                <ShieldAlert className="w-4 h-4 text-amber-400" />
                <h4 className="text-xs font-bold text-gray-200 uppercase tracking-wider">4. Location Quality & Anti-Trap Protection</h4>
              </div>
              <p className="text-[11px] text-gray-400 leading-relaxed">
                Reversals in the middle of a range are low-probability chop. Enforces strict boundary locations and single-use pool tracking.
              </p>
              <div className="flex justify-between items-center py-2 border-b border-[#30363D]/40">
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-gray-200">Track Consumed Pools (Single-Use)</span>
                  <span className="text-[11px] text-gray-500">Mark liquidity level consumed after the first signal to avoid re-trading exhausted levels.</span>
                </div>
                <button
                  onClick={() => handleInputChange('lsrTrackConsumedPools', !(settings.lsrTrackConsumedPools ?? true))}
                  className={`w-10 h-5 rounded-full transition-colors flex items-center px-1 ${
                    (settings.lsrTrackConsumedPools ?? true) ? 'bg-[#00e696]' : 'bg-gray-700'
                  }`}
                >
                  <div
                    className={`w-3 h-3 rounded-full bg-white transition-transform ${
                      (settings.lsrTrackConsumedPools ?? true) ? 'transform translate-x-5' : ''
                    }`}
                  />
                </button>
              </div>

              <div className="flex justify-between items-center py-2 border-b border-[#30363D]/40">
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-gray-200">Reject Middle-of-Range Setups</span>
                  <span className="text-[11px] text-gray-500">Automatically filter out and reject sweeps that occur in the middle 25% of recent range.</span>
                </div>
                <button
                  onClick={() => handleInputChange('lsrRejectMiddleOfRange', !(settings.lsrRejectMiddleOfRange ?? true))}
                  className={`w-10 h-5 rounded-full transition-colors flex items-center px-1 ${
                    (settings.lsrRejectMiddleOfRange ?? true) ? 'bg-[#00e696]' : 'bg-gray-700'
                  }`}
                >
                  <div
                    className={`w-3 h-3 rounded-full bg-white transition-transform ${
                      (settings.lsrRejectMiddleOfRange ?? true) ? 'transform translate-x-5' : ''
                    }`}
                  />
                </button>
              </div>

              <InputRow
                label="Minimum Range Width (ATR)"
                desc="Coarse pre-filter: Skip scanning if recent range is narrower than this multiple of ATR (default: 2.5x ATR)"
                value={settings.lsrMinRangeWidthAtr ?? 2.5}
                onChange={(v: any) => handleInputChange('lsrMinRangeWidthAtr', v)}
              />
            </div>

            {/* Sub-section 5: Risk / Reward, Fee Floor & Tight Invalidation */}
            <div className="bg-[#0E1117] border border-[#30363D] rounded-xl p-4 space-y-3">
              <div className="flex items-center space-x-2 border-b border-[#30363D] pb-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <h4 className="text-xs font-bold text-gray-200 uppercase tracking-wider">5. Risk Management, Fee Floor & Structural Targets</h4>
              </div>
              <p className="text-[11px] text-gray-400 leading-relaxed">
                Stop loss is placed directly beyond the sweep extreme plus a small ATR buffer. Requires opposing pool &ge; 2.5R and TP1 &ge; 1.0R.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <InputRow
                  label="Minimum Structural Risk-to-Reward (R:R)"
                  desc="Nearest untapped opposing pool must be at least this R:R from actual entry and stop (default: 2.5)"
                  value={settings.lsrMinRR ?? 2.5}
                  onChange={(v: any) => handleInputChange('lsrMinRR', v)}
                />
                <InputRow
                  label="Stop Loss ATR Buffer Multiple"
                  desc="Volatility buffer beyond the sweep extreme wick: sweep_extreme +- max(0.15 ATR, 3 ticks) (default: 0.15)"
                  value={settings.lsrSlBufferAtr ?? 0.15}
                  onChange={(v: any) => handleInputChange('lsrSlBufferAtr', v)}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <InputRow
                  label="Fee Floor Divisor"
                  desc="Skips trade if stop distance < round_trip_fee / 0.12 to prevent fee bleed on tight stops (default: 0.12)"
                  value={settings.lsrFeeStopFactor ?? 0.12}
                  onChange={(v: any) => handleInputChange('lsrFeeStopFactor', v)}
                />
                <InputRow
                  label="Round-Trip Fee %"
                  desc="CoinDCX Futures taker fee + GST estimate per round trip (default: 0.177%)"
                  value={settings.lsrRoundTripFeePct ?? 0.177}
                  onChange={(v: any) => handleInputChange('lsrRoundTripFeePct', v)}
                />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'strategies' && (
          <div className="space-y-6">
            {/* Header / Portfolio Summary Banner */}
            <div className="p-4 bg-gradient-to-r from-indigo-950/40 via-purple-950/30 to-teal-950/30 border border-indigo-500/40 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-start space-x-3">
                <div className="p-2.5 bg-indigo-500/10 border border-indigo-500/30 rounded-lg text-indigo-400 mt-0.5 shrink-0">
                  <Layers className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-extrabold text-white tracking-wide">ACTIVE MULTI-STRATEGY PORTFOLIO</h3>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                      {activeStrategiesList.length} of {ALL_STRATEGIES.length} Active
                    </span>
                    {activeStrategiesList.length >= 2 && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        ⚡ Confluence Synergy Enabled (+12 Boost)
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mt-1 max-w-2xl leading-relaxed">
                    Activate multiple strategies to scan and trade simultaneously. When multiple strategies align on the same coin and direction, the engine automatically grants a +12 score boost and flags it as a high-conviction confluence trade.
                  </p>
                </div>
              </div>

              {/* Quick Presets */}
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setStrategyPreset(['ORDER_BLOCK', 'COIL_BREAKOUT', 'MULTICOIN_SCALPER_PRO', 'TREND_PULLBACK', 'LIQUIDITY_SWEEP_REVERSAL'])}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition border cursor-pointer ${
                    activeStrategiesList.length >= 5
                      ? 'bg-gradient-to-r from-indigo-600 via-emerald-600 to-cyan-600 text-white border-cyan-400 shadow-sm'
                      : 'bg-[#0E1117] text-gray-300 border-[#30363D] hover:border-gray-500 hover:text-white'
                  }`}
                  title="Full institutional 5-strategy portfolio"
                >
                  ⚡ All 5 Active (Penta-Core)
                </button>
                <button
                  type="button"
                  onClick={() => setStrategyPreset(['ORDER_BLOCK'])}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition border cursor-pointer ${
                    activeStrategiesList.length === 1 && activeStrategiesList.includes('ORDER_BLOCK')
                      ? 'bg-indigo-600 text-white border-indigo-400 shadow-sm'
                      : 'bg-[#0E1117] text-gray-300 border-[#30363D] hover:border-gray-500 hover:text-white'
                  }`}
                >
                  🧱 Order Block Solo (1:3.5+)
                </button>
                <button
                  type="button"
                  onClick={() => setStrategyPreset(['COIL_BREAKOUT'])}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition border cursor-pointer ${
                    activeStrategiesList.length === 1 && activeStrategiesList.includes('COIL_BREAKOUT')
                      ? 'bg-emerald-600 text-white border-emerald-400 shadow-sm'
                      : 'bg-[#0E1117] text-gray-300 border-[#30363D] hover:border-gray-500 hover:text-white'
                  }`}
                >
                  🌀 Coil Solo (1:5+)
                </button>
                <button
                  type="button"
                  onClick={() => setStrategyPreset(['MULTICOIN_SCALPER_PRO'])}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition border cursor-pointer ${
                    activeStrategiesList.length === 1 && activeStrategiesList.includes('MULTICOIN_SCALPER_PRO')
                      ? 'bg-amber-600 text-white border-amber-400 shadow-sm'
                      : 'bg-[#0E1117] text-gray-300 border-[#30363D] hover:border-gray-500 hover:text-white'
                  }`}
                >
                  🔥 Scalper PRO Solo
                </button>
                <button
                  type="button"
                  onClick={() => setStrategyPreset(['TREND_PULLBACK'])}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition border cursor-pointer ${
                    activeStrategiesList.length === 1 && activeStrategiesList.includes('TREND_PULLBACK')
                      ? 'bg-teal-600 text-white border-teal-400 shadow-sm'
                      : 'bg-[#0E1117] text-gray-300 border-[#30363D] hover:border-gray-500 hover:text-white'
                  }`}
                >
                  🎯 Trend-Pullback Solo
                </button>
                <button
                  type="button"
                  onClick={() => setStrategyPreset(['LIQUIDITY_SWEEP_REVERSAL'])}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition border cursor-pointer ${
                    activeStrategiesList.length === 1 && (activeStrategiesList.includes('LIQUIDITY_SWEEP_REVERSAL') || activeStrategiesList.includes('SMC_LIQUIDITY'))
                      ? 'bg-cyan-600 text-white border-cyan-400 shadow-sm'
                      : 'bg-[#0E1117] text-gray-300 border-[#30363D] hover:border-gray-500 hover:text-white'
                  }`}
                >
                  💧 LSR Solo (2:1+)
                </button>
                <button
                  type="button"
                  onClick={() => setStrategyPreset([])}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-rose-400 hover:text-rose-300 bg-rose-950/20 border border-rose-900/30 hover:bg-rose-900/40 transition cursor-pointer"
                  title="Deactivate all strategies to stand aside"
                >
                  Stand Aside
                </button>
              </div>
            </div>

            {/* Execution / Confluence Mode Settings */}
            <div className="bg-[#12161E] border border-[#30363D] rounded-xl p-4 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#30363D]/50 pb-3">
                <div>
                  <div className="text-xs font-bold text-gray-200 flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5 text-amber-400" />
                    <span>Multi-Strategy Confluence Routing Mode</span>
                  </div>
                  <div className="text-[11px] text-gray-400 mt-0.5">
                    Determines how the scanner and auto-trader arbitrate and size signals across active strategies.
                  </div>
                </div>
                <div className="flex bg-[#0E1117] rounded-lg p-1 border border-[#30363D] flex-wrap gap-1">
                  {[
                    { id: 'CONFLUENCE_BOOST', label: 'Confluence Boost (+12)' },
                    { id: 'BEST_SIGNAL', label: 'Best Single Signal' },
                    { id: 'CONCURRENT_INDEPENDENT', label: 'Concurrent Independent' }
                  ].map((mode) => (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() => handleInputChange('multiStrategyMode', mode.id)}
                      className={`px-2.5 py-1 rounded text-xs font-semibold transition ${
                        (settings.multiStrategyMode || 'CONFLUENCE_BOOST') === mode.id
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'text-gray-400 hover:text-gray-200'
                      }`}
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Dynamic Auto-Regime Strategy Sync Setting */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-[#0E1117] border border-[#30363D] rounded-lg">
                <div>
                  <div className="text-xs font-bold text-gray-200 flex items-center gap-1.5">
                    <Compass className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Auto-Activate Strategies as per CoinDCX Regime</span>
                    {settings.autoRegimeStrategySync && (
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-950/60 text-emerald-300 border border-emerald-700/60">
                        ACTIVE
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-gray-400 mt-0.5">
                    Automatically switches active portfolio setups when market regime shifts (Bull Trend → Trend Pullback + Order Block | Range → Liquidity Sweep Reversal).
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleInputChange('autoRegimeStrategySync', !settings.autoRegimeStrategySync)}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    settings.autoRegimeStrategySync ? 'bg-emerald-500' : 'bg-gray-700'
                  }`}
                  role="switch"
                  aria-checked={Boolean(settings.autoRegimeStrategySync)}
                  title="Toggle Auto-Activate by Regime"
                >
                  <span
                    aria-hidden="true"
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      settings.autoRegimeStrategySync ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Layer 3 Tradeability Gate Setting */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-[#0E1117] border border-[#30363D] rounded-lg">
                <div>
                  <div className="text-xs font-bold text-gray-200 flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5 text-purple-400" />
                    <span>Layer 3: Tradeability Gate (Fee Drag & Low-Edge Lock)</span>
                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                      settings.layer3TradeabilityGateEnabled !== false
                        ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-700/60'
                        : 'bg-gray-800 text-gray-400 border border-gray-600'
                    }`}>
                      {settings.layer3TradeabilityGateEnabled !== false ? 'ENFORCED (ON)' : 'BYPASSED (OFF)'}
                    </span>
                  </div>
                  <div className="text-[11px] text-gray-400 mt-0.5">
                    Blocks trade executions when volatility is compressed and taker fees exceed 15% of your 1R stop distance. Toggle OFF to allow executions during low-edge market conditions.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleInputChange('layer3TradeabilityGateEnabled', settings.layer3TradeabilityGateEnabled === false ? true : false)}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    settings.layer3TradeabilityGateEnabled !== false ? 'bg-emerald-500' : 'bg-gray-700'
                  }`}
                  role="switch"
                  aria-checked={settings.layer3TradeabilityGateEnabled !== false}
                  title="Toggle Layer 3 Tradeability Gate"
                >
                  <span
                    aria-hidden="true"
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      settings.layer3TradeabilityGateEnabled !== false ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Regime Recommended Direction Enforcement Setting */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-[#0E1117] border border-[#30363D] rounded-lg">
                <div>
                  <div className="text-xs font-bold text-gray-200 flex items-center gap-1.5">
                    <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Only Trade in Regime Recommended Direction</span>
                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                      settings.regimeDirectionEnforced !== false
                        ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-700/60'
                        : 'bg-gray-800 text-gray-400 border border-gray-600'
                    }`}>
                      {settings.regimeDirectionEnforced !== false ? 'ENFORCED (STRICT)' : 'ALLOW BOTH'}
                    </span>
                  </div>
                  <div className="text-[11px] text-gray-400 mt-0.5">
                    Strictly prevents opening trades that oppose the directional bias evaluated by Layer 1 &amp; Layer 2 Regime (e.g. only Longs during Bull Trend, only Shorts during Bear Trend).
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleInputChange('regimeDirectionEnforced', settings.regimeDirectionEnforced === false ? true : false)}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    settings.regimeDirectionEnforced !== false ? 'bg-emerald-500' : 'bg-gray-700'
                  }`}
                  role="switch"
                  aria-checked={settings.regimeDirectionEnforced !== false}
                  title="Toggle Regime Recommended Direction Enforcement"
                >
                  <span
                    aria-hidden="true"
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      settings.regimeDirectionEnforced !== false ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Confluence Synergy Callout */}
              <div className="p-3 bg-indigo-950/20 border border-indigo-500/20 rounded-lg flex items-start gap-3 text-xs text-gray-300">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div className="leading-relaxed text-[11px]">
                  <strong className="text-white font-semibold">Dual Strategy Synergy Rules:</strong> When multiple active strategies (e.g. <span className="text-teal-300 font-semibold">Trend-Pullback</span> + <span className="text-indigo-300 font-semibold">SMC Liquidity</span>) align on the same coin in the same direction, the composite score receives an automatic <span className="text-emerald-400 font-bold">+12 point confluence boost</span>. The Trade Log and Scanner will tag the entry with <span className="text-emerald-300 font-mono font-bold">⚡ Confluence</span>.
                </div>
              </div>
            </div>

            {/* Strategy Cards Grid */}
            <div className="space-y-3">
              <div className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center justify-between">
                <span>Installed Strategies ({installedStrategies.length})</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowAddCustomModal(true)}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold text-indigo-300 hover:text-white bg-indigo-950/40 hover:bg-indigo-900/50 border border-indigo-500/40 transition cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ Add Custom Strategy</span>
                  </button>
                  <span className="text-[11px] text-gray-500 font-normal hidden sm:inline">Click toggle to activate / deactivate</span>
                </div>
              </div>

              {installedStrategies.map((strat) => {
                const isActive = activeStrategiesList.includes(strat.id);
                return (
                  <div
                    key={strat.id}
                    className={`p-4 rounded-xl border transition flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                      isActive
                        ? 'bg-gradient-to-r from-[#161B22] to-[#12161E] border-indigo-500/50 shadow-md shadow-indigo-950/20'
                        : 'bg-[#12161E]/70 border-[#30363D] opacity-75 hover:opacity-100 hover:border-gray-500'
                    }`}
                  >
                    <div className="flex items-start gap-3.5 flex-1 min-w-0">
                      <div 
                        onClick={() => toggleStrategyInPortfolio(strat.id)}
                        className="cursor-pointer pt-0.5"
                      >
                        <input
                          type="checkbox"
                          checked={isActive}
                          onChange={() => {}}
                          className="w-4 h-4 rounded border-gray-600 text-indigo-600 focus:ring-0 cursor-pointer"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <h4 
                            onClick={() => toggleStrategyInPortfolio(strat.id)}
                            className="font-bold text-gray-100 text-sm cursor-pointer hover:text-indigo-300 transition"
                          >
                            {strat.name}
                          </h4>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                            strat.color === 'teal' ? 'bg-teal-500/20 text-teal-300 border border-teal-500/30' :
                            strat.color === 'indigo' ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30' :
                            strat.color === 'amber' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' :
                            strat.color === 'emerald' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' :
                            strat.color === 'purple' ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30' :
                            'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                          }`}>
                            {strat.badge}
                          </span>
                          <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded ${
                            isActive
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                              : 'bg-gray-800 text-gray-500 border border-gray-700'
                          }`}>
                            {isActive ? 'ENABLED' : 'DISABLED'}
                          </span>
                          {strat.isCustom && (
                            <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                              CUSTOM
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400 leading-relaxed max-w-3xl">
                          {strat.desc}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
                      <button
                        type="button"
                        onClick={() => toggleStrategyInPortfolio(strat.id)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition border cursor-pointer ${
                          isActive
                            ? 'bg-rose-950/30 text-rose-300 border-rose-800/40 hover:bg-rose-900/40'
                            : 'bg-emerald-950/30 text-emerald-300 border-emerald-800/40 hover:bg-emerald-900/40'
                        }`}
                      >
                        {isActive ? 'Turn Off' : 'Activate'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setSoloStrategy(strat.id)}
                        className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-gray-400 hover:text-white bg-[#0E1117] border border-[#30363D] hover:border-gray-500 transition cursor-pointer"
                        title="Deactivate all other strategies and run this strategy solo"
                      >
                        Solo
                      </button>
                      {strat.configTab && (
                        <button
                          type="button"
                          onClick={() => setActiveTab(strat.configTab as any)}
                          className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-indigo-400 hover:text-indigo-300 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 transition cursor-pointer"
                        >
                          Parameters →
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setStrategyToDelete(strat)}
                        className="px-2 py-1.5 rounded-lg text-xs font-semibold text-rose-400 hover:text-rose-200 bg-rose-950/20 hover:bg-rose-900/40 border border-rose-800/30 hover:border-rose-600/50 transition cursor-pointer flex items-center gap-1"
                        title={`Delete ${strat.name} from bot`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Delete</span>
                      </button>
                    </div>
                  </div>
                );
              })}

              {/* Archived / Deleted Strategies Section */}
              {archivedStrategies.length > 0 && (
                <div className="bg-[#0E1117] border border-rose-900/30 rounded-xl p-4 space-y-3 mt-6">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#30363D]/60 pb-2">
                    <div className="flex items-center gap-2">
                      <Archive className="w-4 h-4 text-rose-400" />
                      <h4 className="text-xs font-bold text-gray-200 uppercase tracking-wider">
                        Deleted Strategies ({archivedStrategies.length})
                      </h4>
                    </div>
                    <button
                      type="button"
                      onClick={handleRestoreAllStrategies}
                      className="px-2.5 py-1 rounded-md text-[11px] font-bold text-emerald-300 bg-emerald-950/30 border border-emerald-600/40 hover:bg-emerald-900/40 transition flex items-center gap-1.5 cursor-pointer self-start sm:self-auto"
                    >
                      <Undo2 className="w-3.5 h-3.5" />
                      <span>Restore All Defaults</span>
                    </button>
                  </div>
                  <p className="text-[11px] text-gray-500 leading-relaxed">
                    The following strategies were deleted by you. They will not scan markets or execute automated trades. Click &quot;Restore&quot; to re-enable them in your portfolio.
                  </p>
                  <div className="space-y-2 pt-1">
                    {archivedStrategies.map((strat) => (
                      <div
                        key={strat.id}
                        className="p-3 bg-[#12161E] border border-[#30363D] rounded-lg flex items-center justify-between gap-3 opacity-80 hover:opacity-100 transition"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-gray-300">{strat.name}</span>
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-rose-950/30 text-rose-400 border border-rose-900/40 font-mono font-bold">
                              DELETED
                            </span>
                          </div>
                          <div className="text-[11px] text-gray-500 truncate max-w-xl mt-0.5">{strat.desc}</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRestoreStrategy(strat.id)}
                          className="px-3 py-1.5 rounded-lg text-xs font-bold text-emerald-400 bg-emerald-950/20 hover:bg-emerald-900/30 border border-emerald-500/30 hover:border-emerald-500 transition cursor-pointer flex items-center gap-1.5 shrink-0"
                        >
                          <Undo2 className="w-3.5 h-3.5" />
                          <span>Restore</span>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Delete Strategy Confirmation Modal */}
            {strategyToDelete && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4">
                <div className="bg-[#161B22] border border-rose-500/40 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
                  <div className="flex items-start gap-3">
                    <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 shrink-0">
                      <Trash2 className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-white">Delete Strategy?</h3>
                      <p className="text-xs text-gray-400 mt-1">
                        Are you sure you want to delete <strong className="text-gray-200">{strategyToDelete.name}</strong>?
                      </p>
                    </div>
                  </div>
                  <div className="p-3 bg-[#0E1117] rounded-lg border border-[#30363D] text-[11px] text-gray-400 space-y-1">
                    <div className="flex items-center gap-1.5 text-rose-400 font-semibold mb-1">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      <span>Consequences of deletion:</span>
                    </div>
                    <ul className="list-disc pl-4 space-y-1 text-gray-400">
                      <li>The strategy will be removed from your active scanner and portfolio tabs.</li>
                      <li>Auto-trader will not enter any new trades for this strategy.</li>
                      <li>You can restore it at any time from the Deleted Strategies section below.</li>
                    </ul>
                  </div>
                  <div className="flex items-center justify-end gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setStrategyToDelete(null)}
                      className="px-4 py-2 rounded-lg text-xs font-semibold text-gray-400 hover:text-white bg-[#0E1117] border border-[#30363D] hover:border-gray-500 transition cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteStrategy(strategyToDelete)}
                      className="px-4 py-2 rounded-lg text-xs font-bold text-white bg-rose-600 hover:bg-rose-500 transition shadow-lg shadow-rose-900/30 cursor-pointer flex items-center gap-1.5"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Confirm Delete</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Add Custom Strategy Modal */}
            {showAddCustomModal && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4">
                <div className="bg-[#161B22] border border-indigo-500/40 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
                  <div className="flex items-center justify-between pb-2 border-b border-[#30363D]">
                    <div className="flex items-center gap-2">
                      <Plus className="w-5 h-5 text-indigo-400" />
                      <h3 className="text-sm font-bold text-white">Create Custom Strategy</h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowAddCustomModal(false)}
                      className="text-gray-400 hover:text-white cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <label className="text-[11px] font-bold text-gray-300 block mb-1">Strategy Name</label>
                      <input
                        type="text"
                        value={newStratName}
                        onChange={(e) => setNewStratName(e.target.value)}
                        placeholder="e.g. Order Flow Delta Divergence"
                        className="w-full bg-[#0E1117] border border-[#30363D] focus:border-indigo-500 rounded-lg px-3 py-2 text-xs text-white outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-gray-300 block mb-1">Badge / Tagline</label>
                      <input
                        type="text"
                        value={newStratBadge}
                        onChange={(e) => setNewStratBadge(e.target.value)}
                        placeholder="e.g. 15m Delta / 1:3 R:R"
                        className="w-full bg-[#0E1117] border border-[#30363D] focus:border-indigo-500 rounded-lg px-3 py-2 text-xs text-white outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-gray-300 block mb-1">Description</label>
                      <textarea
                        value={newStratDesc}
                        onChange={(e) => setNewStratDesc(e.target.value)}
                        rows={2}
                        placeholder="Describe entry triggers, indicators, and risk management criteria..."
                        className="w-full bg-[#0E1117] border border-[#30363D] focus:border-indigo-500 rounded-lg px-3 py-2 text-xs text-white outline-none resize-none"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-gray-300 block mb-1">Color Theme</label>
                      <select
                        value={newStratColor}
                        onChange={(e) => setNewStratColor(e.target.value)}
                        className="w-full bg-[#0E1117] border border-[#30363D] rounded-lg px-3 py-2 text-xs text-white outline-none"
                      >
                        <option value="cyan">Cyan</option>
                        <option value="emerald">Emerald</option>
                        <option value="amber">Amber</option>
                        <option value="indigo">Indigo</option>
                        <option value="teal">Teal</option>
                        <option value="purple">Purple</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowAddCustomModal(false)}
                      className="px-4 py-2 rounded-lg text-xs font-semibold text-gray-400 hover:text-white bg-[#0E1117] border border-[#30363D] transition cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleAddCustomStrategy}
                      disabled={!newStratName.trim()}
                      className="px-4 py-2 rounded-lg text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 transition cursor-pointer flex items-center gap-1.5"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Strategy</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'general' && (
          <div className="space-y-2">
            {/* Multi-Strategy Portfolio Quick Selector in General */}
            <div className="py-4 border-b border-[#30363D]/50 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <span className="text-sm font-bold text-gray-200 flex items-center gap-2">
                    <Layers className="w-4 h-4 text-indigo-400" />
                    <span>Active Multi-Strategy Portfolio</span>
                  </span>
                  <span className="text-[11px] text-gray-500">
                    Activate multiple strategies simultaneously for auto-trading and confluence scanning.
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 font-bold border border-indigo-500/30">
                    {activeStrategiesList.length} Active
                  </span>
                  <button
                    type="button"
                    onClick={() => setActiveTab('strategies')}
                    className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold px-2 py-1 rounded bg-indigo-500/10 hover:bg-indigo-500/20 transition border border-indigo-500/30 cursor-pointer"
                  >
                    Configure Strategies →
                  </button>
                </div>
              </div>

              {/* Quick Strategy Checkboxes */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 pt-1">
                {installedStrategies.map((strat) => {
                  const isActive = activeStrategiesList.includes(strat.id);
                  return (
                    <div
                      key={strat.id}
                      onClick={() => toggleStrategyInPortfolio(strat.id)}
                      className={`p-2.5 rounded-lg border transition cursor-pointer flex items-center justify-between gap-2 ${
                        isActive
                          ? 'bg-indigo-950/30 border-indigo-500/50 text-gray-100 shadow-sm'
                          : 'bg-[#0E1117]/60 border-[#30363D] text-gray-400 opacity-60 hover:opacity-90'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <input
                          type="checkbox"
                          checked={isActive}
                          onChange={() => {}}
                          className="rounded border-gray-600 text-indigo-600 focus:ring-0 cursor-pointer"
                        />
                        <div className="truncate text-xs font-bold text-gray-200">
                          {strat.name}
                        </div>
                      </div>
                      <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded font-bold shrink-0 ${
                        isActive ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-gray-800 text-gray-500'
                      }`}>
                        {isActive ? 'ACTIVE' : 'OFF'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <InputRow label="Scan Interval (Secs)" desc="How often the scanner runs" value={settings.scanInterval} onChange={(v: any) => handleInputChange('scanInterval', v)} />
            
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
          <div className="space-y-2">
            <InputRow label="Minimum 24h Volume (USDT)" desc="Skip coins with volume below this threshold" value={settings.min24hVolume} onChange={(v: any) => handleInputChange('min24hVolume', v)} />
            <InputRow label="Max Funding Rate %" desc="Skip coins with extreme funding rates" value={settings.maxFundingRate} onChange={(v: any) => handleInputChange('maxFundingRate', v)} />
            <InputRow label="Max Bid/Ask Spread %" desc="Skip coins with wide spreads" value={settings.maxSpread} onChange={(v: any) => handleInputChange('maxSpread', v)} />
          </div>
        )}

        {activeTab === 'risk' && (
          <div className="space-y-6">
            {/* Live Safety Status & Circuit Breaker Dashboard */}
            <div className="p-4 bg-[#161B22] border border-[#30363D] rounded-lg space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#30363D]/70">
                <div className="flex items-center space-x-2.5">
                  <div className={`p-1.5 rounded-md ${settings.killSwitchActive ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'}`}>
                    <ShieldAlert className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-gray-100 flex items-center space-x-2">
                      <span>Execution Safety & Circuit Breakers</span>
                      <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                        settings.killSwitchActive 
                          ? 'bg-red-900/60 text-red-300 border border-red-500/50' 
                          : (riskStatus?.consecutiveLosses && riskStatus.consecutiveLosses >= (settings.maxConsecutiveLosses ?? 4))
                            ? 'bg-amber-900/60 text-amber-300 border border-amber-500/50'
                            : 'bg-emerald-900/60 text-emerald-300 border border-emerald-500/50'
                      }`}>
                        {settings.killSwitchActive ? 'STOPPED (KILL SWITCH)' : 'SYSTEM HEALTHY'}
                      </span>
                    </h3>
                    <p className="text-[11px] text-gray-400">
                      Real-time gatekeepers that actively block orders when risk thresholds or adverse volatility are detected.
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={handleResetCircuitBreakers}
                    disabled={resettingBreakers}
                    className="flex items-center space-x-1.5 px-3 py-1.5 bg-[#21262D] hover:bg-[#30363D] text-gray-300 hover:text-white border border-[#30363D] rounded text-xs font-semibold transition"
                    title="Reset consecutive loss counter, daily loss drawdown stats, and trade quota"
                  >
                    <RotateCcw className={`w-3.5 h-3.5 ${resettingBreakers ? 'animate-spin text-emerald-400' : ''}`} />
                    <span>{resettingBreakers ? 'Resetting...' : 'Reset Circuit Breakers'}</span>
                  </button>
                </div>
              </div>

              {breakerMessage && (
                <div className="p-2.5 bg-emerald-950/40 border border-emerald-500/30 rounded text-xs text-emerald-300 flex items-center space-x-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>{breakerMessage}</span>
                </div>
              )}

              {/* Status metrics grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
                <div className="p-2.5 bg-[#0E1117] border border-[#30363D] rounded">
                  <div className="text-[10px] text-gray-500 uppercase tracking-wider">Current Daily Loss</div>
                  <div className="text-sm font-bold font-mono text-gray-200 mt-0.5">
                    {riskStatus?.currentDailyLossPct ? `${riskStatus.currentDailyLossPct.toFixed(2)}%` : '0.00%'}
                    <span className="text-[11px] text-gray-500 font-normal"> / {settings.dailyLossLimitPct ?? -5}%</span>
                  </div>
                </div>
                <div className="p-2.5 bg-[#0E1117] border border-[#30363D] rounded">
                  <div className="text-[10px] text-gray-500 uppercase tracking-wider">Current Drawdown</div>
                  <div className="text-sm font-bold font-mono text-gray-200 mt-0.5">
                    {riskStatus?.currentDrawdownPct ? `${riskStatus.currentDrawdownPct.toFixed(2)}%` : '0.00%'}
                    <span className="text-[11px] text-gray-500 font-normal"> / {settings.maxDrawdownPct ?? 10}%</span>
                  </div>
                </div>
                <div className="p-2.5 bg-[#0E1117] border border-[#30363D] rounded">
                  <div className="text-[10px] text-gray-500 uppercase tracking-wider">Consecutive Losses</div>
                  <div className="text-sm font-bold font-mono text-gray-200 mt-0.5">
                    {riskStatus?.consecutiveLosses ?? 0}
                    <span className="text-[11px] text-gray-500 font-normal"> / {settings.maxConsecutiveLosses ?? 4} max</span>
                  </div>
                </div>
                <div className="p-2.5 bg-[#0E1117] border border-[#30363D] rounded">
                  <div className="text-[10px] text-gray-500 uppercase tracking-wider">Trades Executed Today</div>
                  <div className="text-sm font-bold font-mono text-gray-200 mt-0.5">
                    {riskStatus?.tradesToday ?? 0}
                    <span className="text-[11px] text-gray-500 font-normal"> / {settings.maxTradesPerDay ?? 25}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Category 1: Emergency Stops & Circuit Breakers */}
            <div className="space-y-2">
              <div className="flex items-center space-x-2 pt-2 border-b border-[#30363D]/60 pb-2">
                <AlertOctagon className="w-4 h-4 text-red-400" />
                <h3 className="text-xs font-bold text-gray-300 uppercase tracking-wider">1. Emergency Stops & Circuit Breakers</h3>
              </div>

              {/* Master Kill Switch Row */}
              <div className="flex justify-between items-center py-3.5 border-b border-[#30363D]/50">
                <div className="flex flex-col pr-4">
                  <span className="text-sm font-bold text-gray-200 flex items-center space-x-2">
                    <span>Emergency Master Kill Switch</span>
                    {settings.killSwitchActive && <span className="px-1.5 py-0.5 bg-red-900/60 text-red-400 text-[10px] rounded border border-red-500/40">TRIGGERED</span>}
                  </span>
                  <span className="text-[11px] text-gray-400">Instantly halt all automated order placements. Existing open positions continue managing their SL/TP targets.</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleKillSwitchToggle(!settings.killSwitchActive)}
                  className={`w-12 h-6 rounded-full transition-colors flex items-center px-1 shrink-0 ${settings.killSwitchActive ? 'bg-red-500' : 'bg-gray-700'}`}
                >
                  <div className={`w-4 h-4 rounded-full bg-white transition-transform ${settings.killSwitchActive ? 'transform translate-x-6' : ''}`} />
                </button>
              </div>

              <InputRow 
                label="Max Daily Loss Limit %" 
                desc="Cease new trade executions for the day when cumulative daily losses reach this threshold (e.g. -5.0%). Resets at 00:00 UTC." 
                value={settings.dailyLossLimitPct} 
                onChange={(v: any) => handleInputChange('dailyLossLimitPct', -Math.abs(v))} 
              />
              <InputRow 
                label="Max Account Drawdown %" 
                desc="Hard capital-preservation ceiling. Completely halts new trade entries if total balance drops by this percentage from all-time peak." 
                value={settings.maxDrawdownPct ?? 10} 
                onChange={(v: any) => handleInputChange('maxDrawdownPct', Math.abs(v))} 
              />
              <InputRow 
                label="Max Consecutive Losses Circuit Breaker" 
                desc="Freeze trade executions if N losing trades occur in a row. Protects against adverse trending or choppy market regimes." 
                value={settings.maxConsecutiveLosses ?? 4} 
                onChange={(v: any) => handleInputChange('maxConsecutiveLosses', Math.max(1, v))} 
              />
              <InputRow 
                label="Max Daily Trades Quota" 
                desc="Hard cap on total automated orders executed per rolling 24-hour day to prevent overtrading churn." 
                value={settings.maxTradesPerDay ?? 25} 
                onChange={(v: any) => handleInputChange('maxTradesPerDay', Math.max(1, v))} 
              />
            </div>

            {/* Category 2: Portfolio Exposure & Sizing Limits */}
            <div className="space-y-2">
              <div className="flex items-center space-x-2 pt-4 border-b border-[#30363D]/60 pb-2">
                <Target className="w-4 h-4 text-emerald-400" />
                <h3 className="text-xs font-bold text-gray-300 uppercase tracking-wider">2. Portfolio Exposure & Sizing Limits</h3>
              </div>

              <InputRow 
                label="Max Total Portfolio Exposure %" 
                desc="Upper ceiling on cumulative margin allocated across all open positions (e.g. 80%). Rejects new orders if exposure limit is reached." 
                value={settings.maxExposurePct !== undefined ? (settings.maxExposurePct > 1 ? settings.maxExposurePct : settings.maxExposurePct * 100) : 80} 
                onChange={(v: any) => handleInputChange('maxExposurePct', v > 1 ? v / 100 : v)} 
              />
              <InputRow 
                label="Max Simultaneous Open Trades" 
                desc="Maximum number of active concurrent positions permitted across all coins simultaneously (e.g. 5)." 
                value={settings.maxConcurrentTrades} 
                onChange={(v: any) => handleInputChange('maxConcurrentTrades', Math.max(1, v))} 
              />
              <InputRow 
                label="Max Position Notional Multiplier" 
                desc="Caps single position notional value as a multiple of total account equity (e.g. 5x) to prevent outsized concentration." 
                value={settings.maxAccountExposureMultiplier ?? 5} 
                onChange={(v: any) => handleInputChange('maxAccountExposureMultiplier', Math.max(1, v))} 
              />
              <InputRow 
                label="Account Risk Per Trade %" 
                desc="Exact percentage of account equity risked between Entry and Stop Loss (e.g. 1.5%) for dynamic position sizing math." 
                value={settings.accountRiskPct} 
                onChange={(v: any) => handleInputChange('accountRiskPct', v)} 
              />
              <InputRow 
                label="Fallback Margin Per Trade %" 
                desc="Base percentage of equity used for sizing if a setup enters without dynamic ATR/SL calculations." 
                value={settings.positionSizePct} 
                onChange={(v: any) => handleInputChange('positionSizePct', v)} 
              />
              <InputRow 
                label="Max Leverage Ceiling" 
                desc="Absolute upper leverage ceiling enforced by RiskManager during automated dynamic contract sizing." 
                value={settings.leverage} 
                onChange={(v: any) => handleInputChange('leverage', Math.max(1, v))} 
              />
            </div>

            {/* Category 3: Stop-Loss & Liquidation Protection Gates */}
            <div className="space-y-2">
              <div className="flex items-center space-x-2 pt-4 border-b border-[#30363D]/60 pb-2">
                <ShieldCheck className="w-4 h-4 text-cyan-400" />
                <h3 className="text-xs font-bold text-gray-300 uppercase tracking-wider">3. Stop-Loss & Liquidation Protection Gates</h3>
              </div>

              {/* Strict SL Gate Toggle */}
              <div className="flex justify-between items-center py-3.5 border-b border-[#30363D]/50">
                <div className="flex flex-col pr-4">
                  <span className="text-sm font-bold text-gray-200">Enforce Strict Stop-Loss Gate</span>
                  <span className="text-[11px] text-gray-400">Strictly reject any trade setup that lacks a verified, calculated Stop-Loss price. Prevents unhedged naked exposure.</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleInputChange('enforceStrictSl', settings.enforceStrictSl !== false ? false : true)}
                  className={`w-12 h-6 rounded-full transition-colors flex items-center px-1 shrink-0 ${settings.enforceStrictSl !== false ? 'bg-[#00e696]' : 'bg-gray-700'}`}
                >
                  <div className={`w-4 h-4 rounded-full bg-white transition-transform ${settings.enforceStrictSl !== false ? 'transform translate-x-6' : ''}`} />
                </button>
              </div>

              <InputRow 
                label="Minimum Stop Distance %" 
                desc="Reject trade entries where Stop-Loss distance is narrower than this percentage (e.g. 0.50%). Prevents immediate noise stop-outs." 
                value={settings.minStopDistancePct !== undefined ? (settings.minStopDistancePct > 1 ? settings.minStopDistancePct : settings.minStopDistancePct * 100) : 0.5} 
                onChange={(v: any) => handleInputChange('minStopDistancePct', v > 1 ? v / 100 : v)} 
              />
              <InputRow 
                label="Maximum Stop Distance %" 
                desc="Reject trade entries where Stop-Loss distance is wider than this threshold (e.g. 4.00%). Avoids excessive tail risk." 
                value={settings.maxStopDistancePct !== undefined ? (settings.maxStopDistancePct > 1 ? settings.maxStopDistancePct : settings.maxStopDistancePct * 100) : 4.0} 
                onChange={(v: any) => handleInputChange('maxStopDistancePct', v > 1 ? v / 100 : v)} 
              />
              <InputRow 
                label="Liquidation Buffer Multiplier" 
                desc="Enforce that the liquidation price distance must be at least Nx the Stop-Loss distance (e.g. 1.30x). If no safe leverage meets this buffer, the trade is rejected." 
                value={settings.minLiqBuffer ?? 1.3} 
                onChange={(v: any) => handleInputChange('minLiqBuffer', Math.max(1.0, v))} 
              />
            </div>

            {/* Category 4: Execution & Market Quality Gates */}
            <div className="space-y-2">
              <div className="flex items-center space-x-2 pt-4 border-b border-[#30363D]/60 pb-2">
                <Zap className="w-4 h-4 text-amber-400" />
                <h3 className="text-xs font-bold text-gray-300 uppercase tracking-wider">4. Execution & Market Quality Gates</h3>
              </div>

              <InputRow 
                label="Minimum Risk-to-Reward Ratio (R:R)" 
                desc="Reject setups where potential reward (TP1 distance) divided by risk (SL distance) is below this minimum ratio (e.g. 1.5)." 
                value={settings.minRRRatio ?? 1.5} 
                onChange={(v: any) => handleInputChange('minRRRatio', Math.max(0.5, v))} 
              />
              <InputRow 
                label="Maximum Bid/Ask Spread %" 
                desc="Reject trade execution on coins whose live top-of-book spread exceeds this percentage (e.g. 0.20%). Protects against illiquidity slippage." 
                value={settings.maxSpread ?? 0.2} 
                onChange={(v: any) => handleInputChange('maxSpread', v)} 
              />
              <InputRow 
                label="Maximum Funding Rate %" 
                desc="Reject trade execution on symbols whose 8h funding rate exceeds this threshold (e.g. 0.05%) to avoid excessive holding fees." 
                value={settings.maxFundingRate ?? 0.05} 
                onChange={(v: any) => handleInputChange('maxFundingRate', v)} 
              />
              <InputRow 
                label="Asset Trade Cooldown Period (Minutes)" 
                desc="Post-trade timeout window in minutes applied to any coin after an order or stop-out (e.g. 15m) to prevent rapid churn during chop." 
                value={settings.tradeCooldownMinutes ?? 15} 
                onChange={(v: any) => handleInputChange('tradeCooldownMinutes', Math.max(1, v))} 
              />
            </div>

            {/* Category 5: Portfolio Correlation Protection */}
            <div className="space-y-2">
              <div className="flex items-center space-x-2 pt-4 border-b border-[#30363D]/60 pb-2">
                <TrendingUp className="w-4 h-4 text-purple-400" />
                <h3 className="text-xs font-bold text-gray-300 uppercase tracking-wider">5. Portfolio Correlation Protection</h3>
              </div>

              {/* Correlation Filter Toggle */}
              <div className="flex justify-between items-center py-3.5 border-b border-[#30363D]/50">
                <div className="flex flex-col pr-4">
                  <span className="text-sm font-bold text-gray-200">Portfolio Correlation Veto</span>
                  <span className="text-[11px] text-gray-400">Block entering new coins that exhibit high statistical correlation with currently open positions. Prevents correlated liquidation dominoes.</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleInputChange('correlationFilterEnabled', settings.correlationFilterEnabled !== false ? false : true)}
                  className={`w-12 h-6 rounded-full transition-colors flex items-center px-1 shrink-0 ${settings.correlationFilterEnabled !== false ? 'bg-[#00e696]' : 'bg-gray-700'}`}
                >
                  <div className={`w-4 h-4 rounded-full bg-white transition-transform ${settings.correlationFilterEnabled !== false ? 'transform translate-x-6' : ''}`} />
                </button>
              </div>

              <InputRow 
                label="Max Correlation Threshold" 
                desc="Pearson correlation cap (e.g. 0.75). If correlation between candidate coin and any active trade exceeds this, the new entry is blocked." 
                value={settings.maxCorrelation ?? 0.75} 
                onChange={(v: any) => handleInputChange('maxCorrelation', Math.min(1.0, Math.max(0.1, v)))} 
              />
            </div>
          </div>
        )}

        {activeTab === 'autotrade' && (
          <div className="space-y-2">
            <div className="flex justify-between items-center py-4 border-b border-[#30363D]/50">
              <div className="flex flex-col">
                <span className="text-sm font-bold text-gray-200">Trade Frequency & Sensitivity</span>
                <span className="text-[11px] text-gray-500">Controls automated trade score thresholds and trigger sensitivity presets.</span>
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

            <InputRow label="Min Trade Score Threshold" desc="Minimum composite score to execute automated order" value={settings.autoTradeThreshold} onChange={(v: any) => handleInputChange('autoTradeThreshold', v)} />
            <InputRow label="Max Drawdown %" desc="Pause trading above this total drawdown" value={settings.maxDrawdownPct} onChange={(v: any) => handleInputChange('maxDrawdownPct', v)} />
            
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mt-6 mb-2">ADDITIONAL TARGETS</h3>
            <InputRow label="Take Profit 2 ATR Multiple" desc="Take Profit 2 (optional)" value={settings.tp2AtrMultiple} onChange={(v: any) => handleInputChange('tp2AtrMultiple', v)} />
            <InputRow label="Take Profit 3 Fib Level" desc="Take Profit 3 (optional)" value={settings.tp3FibLevel} onChange={(v: any) => handleInputChange('tp3FibLevel', v)} />
            
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
            <InputRow label="Trail Activation R" desc="Activate trailing exit after this many R earned (default: 1.0)" value={settings.trailActivationR} onChange={(v: any) => handleInputChange('trailActivationR', v)} />
          </div>
        )}

        {activeTab === 'alerts' && (
           <div className="space-y-4 max-w-lg">
             {/* Audio Chime & Popup Notification Settings */}
             <div className="bg-[#0E1117] border border-[#30363D] rounded-xl p-5 space-y-4">
               <div className="flex items-center justify-between border-b border-[#30363D] pb-3">
                 <div>
                   <h3 className="text-sm font-bold text-gray-100 flex items-center gap-2">
                     <Volume2 className="w-4 h-4 text-indigo-400" />
                     <span>Sound & Popup Execution Alerts</span>
                   </h3>
                   <p className="text-[11px] text-gray-400 mt-0.5">
                     Play high-fidelity audio chimes and display instant popups whenever a trade is executed.
                   </p>
                 </div>
                 <button
                   onClick={() => updatePanelAudio('soundEnabled', !panelAudioSettings.soundEnabled)}
                   className={`text-[10px] font-bold px-2.5 py-1 rounded transition-colors ${
                     panelAudioSettings.soundEnabled
                       ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                       : 'bg-gray-800 text-gray-400 border border-gray-700'
                   }`}
                 >
                   {panelAudioSettings.soundEnabled ? 'SOUND ON' : 'MUTED'}
                 </button>
               </div>

               <div className="space-y-3">
                 <div>
                   <div className="flex justify-between items-center text-xs text-gray-300 mb-1">
                     <span>Chime Volume</span>
                     <span className="font-mono text-indigo-400 font-bold">{Math.round(panelAudioSettings.volume * 100)}%</span>
                   </div>
                   <input
                     type="range"
                     min="0.1"
                     max="1.0"
                     step="0.05"
                     value={panelAudioSettings.volume}
                     onChange={(e) => updatePanelAudio('volume', parseFloat(e.target.value))}
                     className="w-full h-1.5 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                   />
                 </div>

                 <div>
                   <label className="text-xs text-gray-300 block mb-1.5">Audio Tone Style</label>
                   <div className="grid grid-cols-2 gap-2">
                     {[
                       { id: 'harmonic', label: 'Harmonic Bell (Default)' },
                       { id: 'cash', label: 'Cash Register Ding' },
                       { id: 'cyber', label: 'Cyber Radar Ping' },
                       { id: 'crystal', label: 'Crystal Harmonic' },
                     ].map((style) => (
                       <button
                         key={style.id}
                         onClick={() => {
                           updatePanelAudio('soundStyle', style.id as SoundStyle);
                           playTradeExecutedSound('LONG', { ...panelAudioSettings, soundStyle: style.id as SoundStyle, soundEnabled: true });
                         }}
                         className={`text-xs py-1.5 px-2.5 rounded border text-left transition-colors flex items-center justify-between ${
                           panelAudioSettings.soundStyle === style.id
                             ? 'bg-indigo-600/30 border-indigo-500 text-indigo-200 font-bold'
                             : 'bg-gray-900 border-[#30363D] text-gray-400 hover:text-gray-200'
                         }`}
                       >
                         <span>{style.label}</span>
                         {panelAudioSettings.soundStyle === style.id && <Check className="w-3.5 h-3.5 text-indigo-400" />}
                       </button>
                     ))}
                   </div>
                 </div>

                 <div className="flex justify-between items-center py-2 px-3 bg-gray-800/30 rounded-lg border border-[#30363D]">
                   <div>
                     <span className="text-xs font-semibold text-gray-200 block">Voice Synthesizer Announcement</span>
                     <span className="text-[10px] text-gray-400">Speak trade direction and symbol via browser audio</span>
                   </div>
                   <button
                     onClick={() => updatePanelAudio('voiceAnnounce', !panelAudioSettings.voiceAnnounce)}
                     className={`w-9 h-5 rounded-full transition-colors flex items-center px-0.5 ${
                       panelAudioSettings.voiceAnnounce ? 'bg-indigo-600' : 'bg-gray-700'
                     }`}
                   >
                     <div className={`w-3.5 h-3.5 rounded-full bg-white transition-transform ${
                       panelAudioSettings.voiceAnnounce ? 'transform translate-x-4' : ''
                     }`} />
                   </button>
                 </div>

                 <button
                   onClick={() => {
                     playTradeExecutedSound('LONG', panelAudioSettings);
                   }}
                   className="w-full py-2 bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/40 text-indigo-300 font-bold rounded-lg text-xs transition duration-200 flex items-center justify-center gap-2"
                 >
                   <Sparkles className="w-4 h-4" />
                   <span>TEST EXECUTION SOUND CHIME</span>
                 </button>
               </div>
             </div>

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

      </div>

      {/* TradingView Pine Script v6 Modal */}
      {showPineScriptModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#161B22] border border-[#30363D] rounded-xl max-w-4xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="px-6 py-4 bg-[#0E1117] border-b border-[#30363D] flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <Code className="w-5 h-5 text-emerald-400" />
                <div>
                  <h3 className="text-sm font-extrabold text-white">
                    {pineModalStrategy === 'ORDER_BLOCK'
                      ? 'TradingView Pine Script v6: Order Block Strategy (1:3.5+ R:R Spec v2)'
                      : pineModalStrategy === 'COIL_BREAKOUT'
                      ? 'TradingView Pine Script v6: Two-Sided Coil Breakout Strategy (1:5+ R:R)'
                      : pineModalStrategy === 'MULTICOIN_SCALPER' 
                      ? 'TradingView Pine Script v6: 3Commas Multicoin Scalper PRO (SwissAlgo)'
                      : pineModalStrategy === 'TREND_PULLBACK' 
                      ? 'TradingView Pine Script v6: Robust Trend-Pullback Strategy' 
                      : 'TradingView Pine Script v6: SMC High-Probability Strategy'}
                  </h3>
                  <p className="text-[11px] text-gray-400">
                    {pineModalStrategy === 'ORDER_BLOCK'
                      ? 'Displacement + BOS -> Order Block Formation -> Closed Bar Retest Reaction with 1:3.5+ structural R:R'
                      : pineModalStrategy === 'COIL_BREAKOUT'
                      ? 'Direction-neutral compression detection, displacement breakout, boundary retests, and structural 1:5 reward-to-risk'
                      : pineModalStrategy === 'MULTICOIN_SCALPER'
                      ? 'Top 100 Volume Altcoin Scalper & Swing system with EMA Ribbon, Session VWAP, RSI resting zones, and 3Commas webhook JSON alerts'
                      : pineModalStrategy === 'TREND_PULLBACK' 
                      ? 'Multi-timeframe regime alignment + EMA/VWAP pullback + closed bar confirmation with webhook JSON alerts' 
                      : 'Systematic SMC strategy with built-in webhook JSON alerts'}
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => {
                    const code = pineModalStrategy === 'ORDER_BLOCK'
                      ? generateOrderBlockPineScript(settings)
                      : pineModalStrategy === 'COIL_BREAKOUT'
                      ? generateCoilBreakoutPineScript(settings)
                      : pineModalStrategy === 'MULTICOIN_SCALPER'
                      ? generateMulticoinScalperPineScript(settings)
                      : pineModalStrategy === 'TREND_PULLBACK' 
                      ? generateTrendPullbackPineScript(settings) 
                      : generateSMCStrategyPineScript(settings);
                    navigator.clipboard.writeText(code);
                    setCopiedPine(true);
                    setTimeout(() => setCopiedPine(false), 2500);
                  }}
                  className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all shadow cursor-pointer"
                >
                  {copiedPine ? <Check className="w-4 h-4 text-emerald-300" /> : <Copy className="w-4 h-4" />}
                  <span>{copiedPine ? 'Copied to Clipboard!' : 'Copy Script'}</span>
                </button>
                <button
                  onClick={() => setShowPineScriptModal(false)}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-6 overflow-y-auto space-y-4">
              {/* How-To Alert Setup Box */}
              <div className="p-3.5 bg-emerald-950/30 border border-emerald-500/30 rounded-lg text-xs space-y-1.5 text-gray-300">
                <div className="font-bold text-emerald-300 flex items-center space-x-1.5">
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>How to Automate with TradingView / 3Commas Webhooks:</span>
                </div>
                <ol className="list-decimal list-inside space-y-1 text-[11px] text-gray-400 pl-1 leading-relaxed">
                  <li>In TradingView, open the <strong>Pine Editor</strong> tab at the bottom, paste this code, and click <strong>Add to chart</strong>.</li>
                  <li>Click <strong>Create Alert</strong> on the indicator.</li>
                  <li>Set Condition to <strong>{pineModalStrategy === 'MULTICOIN_SCALPER' ? '3Commas Multicoin Scalper PRO (SwissAlgo)' : pineModalStrategy === 'TREND_PULLBACK' ? 'Robust Trend-Pullback Strategy' : 'SMC High-Probability Strategy'}</strong>.</li>
                  <li>Check <strong>Webhook URL</strong> and enter your server webhook endpoint: <code className="text-emerald-300 bg-[#0E1117] px-1 py-0.5 rounded font-mono">/api/webhook/tradingview</code> (or 3Commas custom bot URL).</li>
                  <li>In the alert message box, enter: <code className="text-emerald-300 bg-[#0E1117] px-1 py-0.5 rounded font-mono">{'{{strategy.order.alert_message}}'}</code>.</li>
                </ol>
              </div>

              {/* Code display */}
              <div className="relative bg-[#0E1117] border border-[#30363D] rounded-lg p-4 font-mono text-xs text-gray-300 overflow-x-auto">
                <pre className="whitespace-pre">
                  {pineModalStrategy === 'MULTICOIN_SCALPER' 
                    ? generateMulticoinScalperPineScript(settings)
                    : pineModalStrategy === 'TREND_PULLBACK' 
                    ? generateTrendPullbackPineScript(settings) 
                    : generateSMCStrategyPineScript(settings)}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
