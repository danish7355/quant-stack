import React, { useState, useEffect, useRef } from 'react';
import { Activity, ShieldAlert, Wifi, ZapOff, Play, Clock, AlertTriangle, Menu, Volume2, VolumeX, Settings2, Sparkles, Check } from 'lucide-react';
import { TradingMode, SystemHealth } from '../types.js';
import { loadAudioSettings, saveAudioSettings, playTradeExecutedSound, SoundStyle } from '../utils/audioNotification.js';

interface Props {
  mode: TradingMode;
  health: SystemHealth;
  dailyLossPct: number;
  openRiskPct: number;
  engineRunning: boolean;
  onToggleEngine: () => void;
  onToggleSidebar?: () => void;
  onTestNotification?: () => void;
}

export function TopNavigationBar({ mode, health, dailyLossPct, openRiskPct, engineRunning, onToggleEngine, onToggleSidebar, onTestNotification }: Props) {
  const isStale = health.marketData === 'STALE';
  const isBlocked = health.tradingBlocked;

  // Audio settings state
  const [audioSettings, setAudioSettings] = useState(loadAudioSettings());
  const [showAudioMenu, setShowAudioMenu] = useState(false);
  const audioMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (audioMenuRef.current && !audioMenuRef.current.contains(e.target as Node)) {
        setShowAudioMenu(false);
      }
    };
    if (showAudioMenu) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [showAudioMenu]);

  const updateSetting = (key: string, val: any) => {
    const updated = saveAudioSettings({ [key]: val } as any);
    setAudioSettings(updated);
  };

  const handleTestAudioAndPopup = () => {
    playTradeExecutedSound('LONG', audioSettings);
    onTestNotification?.();
  };

  return (
    <div className="h-14 bg-[#161B22] border-b border-[#30363D] flex items-center justify-between px-3 md:px-4 shrink-0 z-40 relative">
      
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

        <div className={`px-2 py-1 text-[10px] font-bold rounded-sm border ${
          mode === 'LIVE' ? 'border-red-500/50 text-red-400 bg-red-500/10' :
          mode === 'TESTNET' ? 'border-amber-500/50 text-amber-400 bg-amber-500/10' :
          'border-blue-500/50 text-blue-400 bg-blue-500/10'
        }`}>
          {mode} MODE
        </div>

        <div className="flex items-center gap-3 hidden md:flex">
          <div className="flex items-center gap-1.5" title={isStale ? "Market Data is STALE - No updates >10s" : "Market Data Connected"}>
            <Wifi size={14} className={isStale ? "text-amber-400 animate-pulse" : "text-emerald-400"} />
            <span className="text-xs text-gray-400">{isStale ? "DATA STALE" : "DATA OK"}</span>
          </div>
          <div className="w-px h-4 bg-[#30363D]"></div>
          <div className="flex items-center gap-1.5">
            <Clock size={14} className="text-gray-500" />
            <span className="text-xs text-gray-400">Sync: {health.lastReconciliationAt}</span>
          </div>
        </div>
      </div>

      {/* Center: Warnings */}
      <div className="hidden lg:flex items-center justify-center flex-1 px-4">
        {isBlocked && (
          <div 
            className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 text-red-400 px-3 py-1 rounded-sm text-xs font-bold truncate max-w-lg"
            title={health.blockReason || 'Trading Blocked'}
          >
            <AlertTriangle size={14} className="shrink-0 animate-pulse" />
            <span className="truncate">EXECUTION STOPPED: {health.blockReason || 'Risk Limit Reached'}</span>
          </div>
        )}
      </div>

      {/* Right: Sound Menu, Risk & Kill Switch */}
      <div className="flex items-center gap-2 sm:gap-4">
        {/* Audio Alerts & Notification Sound Control */}
        <div className="relative" ref={audioMenuRef}>
          <button
            onClick={() => setShowAudioMenu(!showAudioMenu)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-all ${
              audioSettings.soundEnabled
                ? 'bg-indigo-500/10 border-indigo-500/40 text-indigo-300 hover:bg-indigo-500/20'
                : 'bg-gray-800/60 border-gray-700 text-gray-400 hover:bg-gray-800'
            }`}
            title={audioSettings.soundEnabled ? 'Trade Execution Sound is ON (Click to configure)' : 'Trade Sound Muted (Click to enable)'}
          >
            {audioSettings.soundEnabled ? (
              <>
                <Volume2 size={15} className="text-indigo-400 animate-pulse" />
                <span className="hidden xl:inline text-[11px] font-semibold">SOUND ON</span>
              </>
            ) : (
              <>
                <VolumeX size={15} className="text-gray-400" />
                <span className="hidden xl:inline text-[11px] text-gray-400">MUTED</span>
              </>
            )}
          </button>

          {/* Sound & Alert Configuration Popover */}
          {showAudioMenu && (
            <div className="absolute right-0 mt-2 w-72 bg-[#0E1117] border border-[#30363D] shadow-2xl rounded-xl p-3.5 z-50 text-gray-200">
              <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-[#30363D]">
                <div className="flex items-center gap-2">
                  <Volume2 size={16} className="text-indigo-400" />
                  <span className="text-xs font-bold text-gray-100">Trade Sound & Alert</span>
                </div>
                <button
                  onClick={() => updateSetting('soundEnabled', !audioSettings.soundEnabled)}
                  className={`text-[10px] font-bold px-2 py-0.5 rounded transition-colors ${
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
                  <span className="font-mono text-gray-300 font-bold">{Math.round(audioSettings.volume * 100)}%</span>
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
                <label className="text-[11px] text-gray-400 block mb-1.5">Chime Tone Style</label>
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
                        playTradeExecutedSound('LONG', { ...audioSettings, soundStyle: style.id as SoundStyle, soundEnabled: true });
                      }}
                      className={`text-[10px] py-1 px-2 rounded border text-left transition-colors flex items-center justify-between ${
                        audioSettings.soundStyle === style.id
                          ? 'bg-indigo-600/30 border-indigo-500 text-indigo-200 font-bold'
                          : 'bg-gray-900 border-[#30363D] text-gray-400 hover:text-gray-200'
                      }`}
                    >
                      <span>{style.label}</span>
                      {audioSettings.soundStyle === style.id && <Check size={11} className="text-indigo-400" />}
                    </button>
                  ))}
                </div>
              </div>

              {/* Voice Announcement Toggle */}
              <div className="flex items-center justify-between py-2 border-t border-[#30363D] text-[11px] text-gray-300">
                <span>Voice Speech Alert</span>
                <button
                  onClick={() => updateSetting('voiceAnnounce', !audioSettings.voiceAnnounce)}
                  className={`w-8 h-4 rounded-full transition-colors flex items-center px-0.5 ${
                    audioSettings.voiceAnnounce ? 'bg-indigo-600' : 'bg-gray-800'
                  }`}
                >
                  <div className={`w-3 h-3 rounded-full bg-white transition-transform ${
                    audioSettings.voiceAnnounce ? 'transform translate-x-4' : ''
                  }`} />
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

        <div className="flex flex-col items-end hidden md:flex">
          <div className="text-[10px] text-gray-500 font-medium">DAILY LOSS</div>
          <div className={`text-xs font-bold ${dailyLossPct < -4 ? 'text-red-400' : 'text-gray-300'}`}>
            {dailyLossPct.toFixed(2)}% / -5.0%
          </div>
        </div>
        <div className="flex flex-col items-end hidden md:flex">
          <div className="text-[10px] text-gray-500 font-medium">OPEN RISK</div>
          <div className="text-xs font-bold text-gray-300">{openRiskPct.toFixed(2)}%</div>
        </div>

        <div className="w-px h-6 bg-[#30363D] mx-1"></div>

        <button
          onClick={onToggleEngine}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
            engineRunning 
              ? 'bg-red-500/10 text-red-400 border border-red-500/50 hover:bg-red-500/20 shadow-[0_0_10px_rgba(239,68,68,0.2)]'
              : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/50 hover:bg-emerald-500/20'
          }`}
        >
          {engineRunning ? (
            <>
              <ZapOff size={14} />
              <span className="hidden sm:inline">KILL SWITCH</span>
            </>
          ) : (
            <>
              <Play size={14} />
              <span className="hidden sm:inline">START ENGINE</span>
            </>
          )}
        </button>
      </div>

    </div>
  );
}

