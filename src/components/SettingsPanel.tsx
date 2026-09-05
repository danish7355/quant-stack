import React, { useState } from 'react';
import { AppSettings, Timeframe } from '../types';
import { RefreshCw, Eye, EyeOff, Github, UploadCloud } from 'lucide-react';

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
  const [activeTab, setActiveTab] = useState<'general' | 'filters' | 'risk' | 'autotrade' | 'alerts' | 'credentials' | 'github'>('general');
  const [showBotToken, setShowBotToken] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [showApiSecret, setShowApiSecret] = useState(false);
  const [telegramStatus, setTelegramStatus] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

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

    // First ensure server has latest token & chat ID
    try {
      await fetch('/api/bot/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });
    } catch (e) {}

    try {
      const text = encodeURIComponent(`🤖 *CryptoBot Pro*\n\n📡 Connection Verified & Credentials Saved Successfully!\n\n⏰ _${new Date().toUTCString()}_`);
      const response = await fetch(`https://api.telegram.org/bot${settings.telegramBotToken}/sendMessage?chat_id=${settings.telegramChatId}&text=${text}&parse_mode=Markdown`);
      if (response.ok) {
        setTelegramStatus('✓ Test alert delivered! Telegram credentials are confirmed and active.');
      } else {
        const errJson = await response.json().catch(() => ({}));
        setTelegramStatus(`Failed: ${errJson.description || 'Check token/permissions'}`);
      }
    } catch (e: any) {
      // Fallback to server-side test alert endpoint
      try {
        const res = await fetch('/api/bot/telegram/test', { method: 'POST' });
        const data = await res.json();
        if (data.success) {
          setTelegramStatus('✓ Test alert delivered via server bot engine!');
        } else {
          setTelegramStatus(`Error: ${data.error || e.message}`);
        }
      } catch (err: any) {
        setTelegramStatus(`Network error: ${e.message}`);
      }
    }
  };

  return (
    <div className="bg-[#161B22] border border-[#30363D] rounded-xl overflow-hidden shadow-lg h-full flex flex-col">
      <div className="bg-[#0E1117] border-b border-[#30363D] px-6 py-4 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center space-x-3">
          <h2 className="text-xl font-extrabold text-white tracking-widest uppercase">STRATEGY & BOT SETTINGS</h2>
          <span className="hidden sm:inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
            ● Cloud Firestore Sync Active
          </span>
        </div>
        <div className="flex space-x-3">
          <button 
            onClick={onResetSettings}
            className="flex items-center space-x-2 px-3 py-1.5 rounded-lg border border-[#30363D] text-gray-400 hover:bg-[#21262D] text-sm font-semibold transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Reset Defaults</span>
          </button>
          <button 
            onClick={handleSaveSettings}
            className="flex items-center space-x-2 px-4 py-1.5 rounded-lg bg-gray-200 text-[#0E1117] hover:bg-white text-sm font-bold transition-all shadow-md shadow-sm"
          >
            <span>{saveStatus || 'Save Settings'}</span>
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
        {activeTab === 'general' && (
          <div className="space-y-2">
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
                {['5m', '15m', '1H', '4H', '1D'].map((tf) => (
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
          <div className="space-y-2">
            <InputRow label="Position Margin per Trade %" desc="% of total balance per trade (old setting)" value={settings.positionSizePct} onChange={(v: any) => handleInputChange('positionSizePct', v)} />
            <InputRow label="Account Risk Per Trade %" desc="% of account to risk per trade (new setting)" value={settings.accountRiskPct} onChange={(v: any) => handleInputChange('accountRiskPct', v)} />
            <InputRow label="Max Open Trades" desc="Maximum simultaneous positions" value={settings.maxConcurrentTrades} onChange={(v: any) => handleInputChange('maxConcurrentTrades', v)} />
            <InputRow label="Leverage" desc="Default leverage for new positions" value={settings.leverage} onChange={(v: any) => handleInputChange('leverage', v)} />
            <InputRow label="Max Daily Loss %" desc="Stop trading for the day above this loss" value={settings.dailyLossLimitPct} onChange={(v: any) => handleInputChange('dailyLossLimitPct', v)} />
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
    </div>
  );
};
