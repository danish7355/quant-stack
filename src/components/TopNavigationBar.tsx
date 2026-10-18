import React, { useState, useEffect, useRef } from 'react';
import {
  Wifi,
  ZapOff,
  Play,
  Clock,
  AlertTriangle,
  Menu,
  Volume2,
  VolumeX,
  Sparkles,
  Check,
  Search,
  Activity,
  ChevronDown,
  Zap,
} from 'lucide-react';
import { TradingMode, SystemHealth } from '../types.js';
import {
  loadAudioSettings,
  saveAudioSettings,
  playTradeExecutedSound,
  SoundStyle,
} from '../utils/audioNotification.js';

interface Props {
  mode: TradingMode;
  exchangeProvider?: 'BINANCE' | 'COINDCX';
  health: SystemHealth;
  dailyLossPct: number;
  openRiskPct: number;
  engineRunning: boolean;
  onToggleEngine: () => void;
  onToggleSidebar?: () => void;
  onTestNotification?: () => void;
  onOpenHealth?: () => void;
  onOpenCommandPalette?: () => void;
  onSwitchExchange?: (provider: 'BINANCE' | 'COINDCX', mode: 'LIVE' | 'PAPER' | 'TESTNET') => void;
  onOpenSettings?: () => void;
}

export function TopNavigationBar({
  mode,
  exchangeProvider = 'BINANCE',
  health,
  dailyLossPct,
  openRiskPct,
  engineRunning,
  onToggleEngine,
  onToggleSidebar,
  onTestNotification,
  onOpenHealth,
  onOpenCommandPalette,
  onSwitchExchange,
  onOpenSettings,
}: Props) {
  const isStale = health.marketData === 'STALE';
  const isBlocked = health.tradingBlocked;

  // Audio settings state
  const [audioSettings, setAudioSettings] = useState(loadAudioSettings());
  const [showAudioMenu, setShowAudioMenu] = useState(false);
  const audioMenuRef = useRef<HTMLDivElement>(null);

  // Exchange switcher dropdown state
  const [showExchangeMenu, setShowExchangeMenu] = useState(false);
  const exchangeMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (audioMenuRef.current && !audioMenuRef.current.contains(e.target as Node)) {
        setShowAudioMenu(false);
      }
      if (exchangeMenuRef.current && !exchangeMenuRef.current.contains(e.target as Node)) {
        setShowExchangeMenu(false);
      }
    };
    if (showAudioMenu || showExchangeMenu) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [showAudioMenu, showExchangeMenu]);

  const updateSetting = (key: string, val: any) => {
    const updated = saveAudioSettings({ [key]: val } as any);
    setAudioSettings(updated);
  };

  const handleTestAudioAndPopup = () => {
    playTradeExecutedSound('LONG', audioSettings);
    onTestNotification?.();
  };

  // Determine health dot color
  let healthDotColor = 'bg-emerald-500 shadow-emerald-500/50';
  let healthLabel = 'SYSTEM HEALTHY';
  if (isBlocked) {
    healthDotColor = 'bg-rose-500 shadow-rose-500/50';
    healthLabel = 'TRADING BLOCKED';
  } else if (isStale) {
    healthDotColor = 'bg-amber-500 shadow-amber-500/50';
    healthLabel = 'DATA STALE';
  } else if (!engineRunning) {
    healthDotColor = 'bg-gray-400';
    healthLabel = 'ENGINE PAUSED';
  }

  return (
    <div className="h-14 bg-[#161B22] border-b border-[#30363D] flex items-center justify-between px-3 md:px-5 shrink-0 z-40 relative">
      {/* Left: Hamburger (mobile) + Mode & Health */}
      <div className="flex items-center gap-2 sm:gap-4">
        {onToggleSidebar && (
          <button
            onClick={onToggleSidebar}
            className="md:hidden text-gray-400 hover:text-gray-200 p-1.5 rounded-lg bg-[#0E1117] border border-[#30363D] transition-colors"
            title="Toggle Navigation Menu"
            aria-label="Open navigation menu"
          >
            <Menu size={18} />
          </button>
        )}

        {/* Interactive Exchange & Mode Switcher */}
        <div className="relative" ref={exchangeMenuRef}>
          <button
            type="button"
            onClick={() => setShowExchangeMenu(!showExchangeMenu)}
            className={`px-2.5 py-1 text-[10px] font-bold rounded-md border tracking-wider flex items-center gap-1.5 transition-all cursor-pointer group hover:scale-[1.02] shadow-sm ${
              mode === 'LIVE'
                ? exchangeProvider === 'COINDCX'
                  ? 'border-emerald-500/60 text-emerald-300 bg-emerald-500/15 hover:bg-emerald-500/25 shadow-[0_0_12px_rgba(16,185,129,0.2)]'
                  : 'border-rose-500/60 text-rose-400 bg-rose-500/15 hover:bg-rose-500/25 shadow-[0_0_12px_rgba(244,63,94,0.2)]'
                : mode === 'TESTNET'
                ? 'border-amber-500/60 text-amber-400 bg-amber-500/15 hover:bg-amber-500/25'
                : exchangeProvider === 'COINDCX'
                ? 'border-sky-500/60 text-sky-300 bg-sky-500/15 hover:bg-sky-500/25 shadow-[0_0_12px_rgba(56,189,248,0.2)]'
                : 'border-blue-500/60 text-blue-400 bg-blue-500/15 hover:bg-blue-500/25'
            }`}
            title="Click to switch between CoinDCX (₹ INR) and Binance ($ USD) or toggle Live/Paper modes"
          >
            <span className="flex items-center gap-1">
              <span>{exchangeProvider === 'COINDCX' ? (mode === 'LIVE' ? 'COINDCX INR LIVE' : 'COINDCX SIM (₹ INR)') : 'BINANCE'}</span>
              <span className="opacity-50">•</span>
              <span>{mode}</span>
            </span>
            <ChevronDown size={11} className={`opacity-70 transition-transform duration-200 ${showExchangeMenu ? 'rotate-180' : ''}`} />
          </button>

          {/* Popover Dropdown */}
          {showExchangeMenu && (
            <div className="absolute left-0 top-full mt-2 w-72 bg-[#0E1117] border border-[#30363D] rounded-xl shadow-2xl p-2 z-50 text-xs space-y-2 animate-in fade-in zoom-in-95 duration-100">
              <div className="px-2 py-1 border-b border-[#30363D] flex items-center justify-between text-[11px] font-semibold text-gray-400">
                <span>SELECT ACTIVE EXCHANGE</span>
                <span className="text-[10px] text-gray-500 font-mono">2 Isolated Pools</span>
              </div>

              {/* CoinDCX Section */}
              <div className="space-y-1">
                <div className="px-2 pt-1 flex items-center justify-between text-[10px] font-bold text-sky-400 tracking-wider">
                  <span>🇮🇳 COINDCX FUTURES</span>
                  <span className="px-1 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-500/30 text-[9px]">₹ INR MARGIN</span>
                </div>
                
                {/* CoinDCX LIVE */}
                <button
                  type="button"
                  onClick={() => {
                    setShowExchangeMenu(false);
                    onSwitchExchange?.('COINDCX', 'LIVE');
                  }}
                  className={`w-full text-left px-2.5 py-2 rounded-lg flex items-center justify-between transition cursor-pointer ${
                    exchangeProvider === 'COINDCX' && mode === 'LIVE'
                      ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-300'
                      : 'hover:bg-[#21262D] text-gray-200'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Zap size={14} className={exchangeProvider === 'COINDCX' && mode === 'LIVE' ? 'text-emerald-400 animate-pulse' : 'text-emerald-400'} />
                    <div>
                      <div className="font-bold flex items-center gap-1.5">
                        <span>CoinDCX LIVE Mode</span>
                        <span className="text-[9px] px-1 py-0.2 rounded bg-emerald-500/20 text-emerald-300 font-mono font-bold">REAL ₹ INR</span>
                      </div>
                      <div className="text-[10px] text-gray-400">Execute real autonomous trades on CoinDCX</div>
                    </div>
                  </div>
                  {exchangeProvider === 'COINDCX' && mode === 'LIVE' && <Check size={14} className="text-emerald-400 shrink-0" />}
                </button>

                {/* CoinDCX Simulation */}
                <button
                  type="button"
                  onClick={() => {
                    setShowExchangeMenu(false);
                    onSwitchExchange?.('COINDCX', 'PAPER');
                  }}
                  className={`w-full text-left px-2.5 py-2 rounded-lg flex items-center justify-between transition cursor-pointer ${
                    exchangeProvider === 'COINDCX' && mode !== 'LIVE'
                      ? 'bg-sky-500/20 border border-sky-500/40 text-sky-300'
                      : 'hover:bg-[#21262D] text-gray-200'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-sky-400" />
                    <div>
                      <div className="font-bold">CoinDCX Paper Simulation</div>
                      <div className="text-[10px] text-gray-400">₹ INR virtual pool (1:1 CoinDCX live mirror)</div>
                    </div>
                  </div>
                  {exchangeProvider === 'COINDCX' && mode !== 'LIVE' && <Check size={14} className="text-sky-400 shrink-0" />}
                </button>
              </div>

              {/* Binance Section */}
              <div className="space-y-1 pt-1 border-t border-[#30363D]">
                <div className="px-2 pt-1 flex items-center justify-between text-[10px] font-bold text-indigo-400 tracking-wider">
                  <span>🌐 BINANCE FUTURES</span>
                  <span className="px-1 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-[9px]">$ USD / USDT</span>
                </div>

                {/* Binance LIVE */}
                <button
                  type="button"
                  onClick={() => {
                    setShowExchangeMenu(false);
                    onSwitchExchange?.('BINANCE', 'LIVE');
                  }}
                  className={`w-full text-left px-2.5 py-2 rounded-lg flex items-center justify-between transition cursor-pointer ${
                    exchangeProvider === 'BINANCE' && mode === 'LIVE'
                      ? 'bg-rose-500/20 border border-rose-500/40 text-rose-300'
                      : 'hover:bg-[#21262D] text-gray-200'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Zap size={14} className="text-rose-400" />
                    <div>
                      <div className="font-bold flex items-center gap-1.5">
                        <span>Binance LIVE Mode</span>
                        <span className="text-[9px] px-1 py-0.2 rounded bg-rose-500/20 text-rose-300 font-mono font-bold">REAL $ USD</span>
                      </div>
                      <div className="text-[10px] text-gray-400">Live production order execution</div>
                    </div>
                  </div>
                  {exchangeProvider === 'BINANCE' && mode === 'LIVE' && <Check size={14} className="text-rose-400 shrink-0" />}
                </button>

                {/* Binance TESTNET */}
                <button
                  type="button"
                  onClick={() => {
                    setShowExchangeMenu(false);
                    onSwitchExchange?.('BINANCE', 'TESTNET');
                  }}
                  className={`w-full text-left px-2.5 py-2 rounded-lg flex items-center justify-between transition cursor-pointer ${
                    exchangeProvider === 'BINANCE' && mode === 'TESTNET'
                      ? 'bg-amber-500/20 border border-amber-500/40 text-amber-300'
                      : 'hover:bg-[#21262D] text-gray-200'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-amber-400" />
                    <div>
                      <div className="font-bold">Binance Testnet</div>
                      <div className="text-[10px] text-gray-400">testnet.binancefuture.com ($ USDT)</div>
                    </div>
                  </div>
                  {exchangeProvider === 'BINANCE' && mode === 'TESTNET' && <Check size={14} className="text-amber-400 shrink-0" />}
                </button>

                {/* Binance Paper */}
                <button
                  type="button"
                  onClick={() => {
                    setShowExchangeMenu(false);
                    onSwitchExchange?.('BINANCE', 'PAPER');
                  }}
                  className={`w-full text-left px-2.5 py-2 rounded-lg flex items-center justify-between transition cursor-pointer ${
                    exchangeProvider === 'BINANCE' && mode === 'PAPER'
                      ? 'bg-blue-500/20 border border-blue-500/40 text-blue-300'
                      : 'hover:bg-[#21262D] text-gray-200'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-blue-400" />
                    <div>
                      <div className="font-bold">Binance Paper Mode</div>
                      <div className="text-[10px] text-gray-400">Simulated virtual pool in $ USD</div>
                    </div>
                  </div>
                  {exchangeProvider === 'BINANCE' && mode === 'PAPER' && <Check size={14} className="text-blue-400 shrink-0" />}
                </button>
              </div>

              {/* Quick Settings Link */}
              <div className="pt-1 border-t border-[#30363D]">
                <button
                  type="button"
                  onClick={() => {
                    setShowExchangeMenu(false);
                    onOpenSettings?.();
                  }}
                  className="w-full text-center py-1.5 text-[11px] text-indigo-400 hover:text-indigo-300 font-semibold transition"
                >
                  ⚙️ Open API Credentials & Risk Settings
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Clickable System Health Pill */}
        <button
          onClick={onOpenHealth}
          className="flex items-center gap-2 px-2.5 py-1 rounded-md bg-[#0E1117] hover:bg-[#21262D] border border-[#30363D] transition-all cursor-pointer group"
          title="Click to view full subsystem diagnostics and health grid"
        >
          <span
            className={`w-2 h-2 rounded-full ${healthDotColor} animate-pulse shadow-sm`}
          />
          <span className="text-[11px] font-semibold text-gray-300 group-hover:text-white transition-colors">
            {healthLabel}
          </span>
          <Activity size={12} className="text-gray-500 group-hover:text-indigo-400 transition-colors hidden sm:inline" />
        </button>

        {/* Data Feed Connection & Sync */}
        <div className="items-center gap-3 hidden xl:flex text-xs text-gray-400">
          <div
            className="flex items-center gap-1.5"
            title={isStale ? 'Market Data is STALE - No updates >10s' : 'Market Data Connected'}
          >
            <Wifi
              size={13}
              className={isStale ? 'text-amber-400 animate-pulse' : 'text-emerald-400'}
            />
            <span className="font-mono">{isStale ? 'FEED STALE' : 'LIVE FEED'}</span>
          </div>
          <div className="w-px h-3.5 bg-[#30363D]"></div>
          <div className="flex items-center gap-1.5 font-mono">
            <Clock size={13} className="text-gray-500" />
            <span className="text-[11px]">Sync: {health.lastReconciliationAt}</span>
          </div>
        </div>
      </div>

      {/* Center: Search / Command Palette Trigger */}
      <div className="flex items-center justify-center flex-1 max-w-xs mx-2">
        <button
          onClick={onOpenCommandPalette}
          className="w-full flex items-center justify-between px-3 py-1.5 rounded-lg bg-[#0E1117] hover:bg-[#21262D] border border-[#30363D] text-gray-400 hover:text-gray-200 text-xs transition-all cursor-pointer group"
          title="Open Command Palette (⌘K)"
        >
          <div className="flex items-center gap-2">
            <Search size={13} className="text-gray-500 group-hover:text-indigo-400 transition-colors" />
            <span className="text-[11px] font-sans">Search coins & pages...</span>
          </div>
          <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[9px] bg-[#21262D] text-gray-400 border border-[#30363D] rounded font-mono font-semibold">
            ⌘K
          </kbd>
        </button>
      </div>

      {/* Right: Sound Menu, Risk & Engine Control */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Audio Alerts & Notification Sound Control */}
        <div className="relative" ref={audioMenuRef}>
          <button
            onClick={() => setShowAudioMenu(!showAudioMenu)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-all cursor-pointer ${
              audioSettings.soundEnabled
                ? 'bg-indigo-500/10 border-indigo-500/40 text-indigo-300 hover:bg-indigo-500/20'
                : 'bg-gray-800/60 border-gray-700 text-gray-400 hover:bg-gray-800'
            }`}
            title={
              audioSettings.soundEnabled
                ? 'Trade Sound ON (Click to customize)'
                : 'Trade Sound MUTED (Click to enable)'
            }
          >
            {audioSettings.soundEnabled ? (
              <>
                <Volume2 size={14} className="text-indigo-400 animate-pulse" />
                <span className="hidden xl:inline text-[11px] font-semibold">SOUND ON</span>
              </>
            ) : (
              <>
                <VolumeX size={14} className="text-gray-400" />
                <span className="hidden xl:inline text-[11px] text-gray-400">MUTED</span>
              </>
            )}
          </button>

          {/* Sound & Alert Configuration Popover */}
          {showAudioMenu && (
            <div className="absolute right-0 mt-2 w-72 bg-[#0E1117] border border-[#30363D] shadow-2xl rounded-xl p-3.5 z-50 text-gray-200 animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-[#30363D]">
                <div className="flex items-center gap-2">
                  <Volume2 size={16} className="text-indigo-400" />
                  <span className="text-xs font-bold text-gray-100">Trade Sound & Alerts</span>
                </div>
                <button
                  onClick={() => updateSetting('soundEnabled', !audioSettings.soundEnabled)}
                  className={`text-[10px] font-bold px-2 py-0.5 rounded transition-colors cursor-pointer ${
                    audioSettings.soundEnabled
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                      : 'bg-gray-800 text-gray-400 border border-gray-700'
                  }`}
                >
                  {audioSettings.soundEnabled ? 'ENABLED' : 'MUTED'}
                </button>
              </div>

              {/* Volume Slider */}
              <div className="mb-3">
                <div className="flex items-center justify-between text-[11px] text-gray-400 mb-1">
                  <span>Chime Volume</span>
                  <span className="font-mono text-gray-300 font-bold">
                    {Math.round(audioSettings.volume * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0.1"
                  max="1.0"
                  step="0.05"
                  value={audioSettings.volume}
                  onChange={(e) => updateSetting('volume', parseFloat(e.target.value))}
                  className="w-full h-1.5 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                />
              </div>

              {/* Chime Style Selector */}
              <div className="mb-3">
                <label className="text-[11px] text-gray-400 block mb-1.5 font-medium">
                  Chime Tone Style
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  {[
                    { id: 'harmonic', label: 'Harmonic Bell' },
                    { id: 'cash', label: 'Cash Ding' },
                    { id: 'cyber', label: 'Cyber Ping' },
                    { id: 'crystal', label: 'Crystal Chime' },
                  ].map((style) => (
                    <button
                      key={style.id}
                      onClick={() => {
                        updateSetting('soundStyle', style.id as SoundStyle);
                        playTradeExecutedSound('LONG', {
                          ...audioSettings,
                          soundStyle: style.id as SoundStyle,
                          soundEnabled: true,
                        });
                      }}
                      className={`text-[10px] py-1 px-2 rounded border text-left transition-colors flex items-center justify-between cursor-pointer ${
                        audioSettings.soundStyle === style.id
                          ? 'bg-indigo-600/30 border-indigo-500 text-indigo-200 font-bold'
                          : 'bg-gray-900 border-[#30363D] text-gray-400 hover:text-gray-200'
                      }`}
                    >
                      <span>{style.label}</span>
                      {audioSettings.soundStyle === style.id && (
                        <Check size={11} className="text-indigo-400" />
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Voice Announcement Toggle */}
              <div className="flex items-center justify-between py-2 border-t border-[#30363D] text-[11px] text-gray-300">
                <span>Voice Speech Alert</span>
                <button
                  onClick={() => updateSetting('voiceAnnounce', !audioSettings.voiceAnnounce)}
                  className={`w-8 h-4 rounded-full transition-colors flex items-center px-0.5 cursor-pointer ${
                    audioSettings.voiceAnnounce ? 'bg-indigo-600' : 'bg-gray-800'
                  }`}
                >
                  <div
                    className={`w-3 h-3 rounded-full bg-white transition-transform ${
                      audioSettings.voiceAnnounce ? 'transform translate-x-4' : ''
                    }`}
                  />
                </button>
              </div>

              {/* Test Button */}
              <button
                onClick={handleTestAudioAndPopup}
                className="mt-2.5 w-full py-1.5 px-3 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs rounded-lg transition-colors shadow-sm flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Sparkles size={13} />
                <span>Test Notification & Sound</span>
              </button>
            </div>
          )}
        </div>

        {/* Risk Metrics */}
        <div className="flex flex-col items-end hidden lg:flex">
          <div className="text-[10px] text-gray-500 font-semibold tracking-wider">DAILY LOSS</div>
          <div
            className={`text-xs font-bold font-mono tabular-nums ${
              dailyLossPct < -4 ? 'text-rose-400' : 'text-gray-300'
            }`}
          >
            {dailyLossPct.toFixed(2)}% / -5.0%
          </div>
        </div>

        <div className="flex flex-col items-end hidden lg:flex">
          <div className="text-[10px] text-gray-500 font-semibold tracking-wider">OPEN RISK</div>
          <div className="text-xs font-bold font-mono tabular-nums text-gray-300">
            {openRiskPct.toFixed(2)}%
          </div>
        </div>

        <div className="w-px h-6 bg-[#30363D] mx-1 hidden sm:block"></div>

        {/* Engine Toggle */}
        <button
          onClick={onToggleEngine}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            engineRunning
              ? 'bg-rose-500/10 text-rose-400 border border-rose-500/40 hover:bg-rose-500/20'
              : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/40 hover:bg-emerald-500/20'
          }`}
          title={engineRunning ? 'Stop background trading engine' : 'Start background trading engine'}
        >
          {engineRunning ? (
            <>
              <ZapOff size={13} />
              <span className="hidden sm:inline">ENGINE ACTIVE</span>
            </>
          ) : (
            <>
              <Play size={13} />
              <span className="hidden sm:inline">START ENGINE</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
