import React, { useEffect, useState } from 'react';
import { Command } from 'cmdk';
import {
  LayoutDashboard,
  Compass,
  Layers,
  List,
  Activity,
  Radio,
  Ban,
  History,
  ShieldAlert,
  Settings as SettingsIcon,
  Terminal,
  BarChart2,
  Search,
  Play,
  Square,
  Sparkles,
} from 'lucide-react';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (viewId: string) => void;
  coins?: Array<{ symbol: string; price: number; change24h: number }>;
  onSelectCoin?: (symbol: string) => void;
  engineRunning?: boolean;
  onToggleEngine?: () => void;
  onOpenInspector?: () => void;
}

export function CommandPalette({
  isOpen,
  onClose,
  onNavigate,
  coins = [],
  onSelectCoin,
  engineRunning,
  onToggleEngine,
  onOpenInspector,
}: CommandPaletteProps) {
  const [search, setSearch] = useState('');

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (isOpen) {
          onClose();
        } else {
          // Open handled by parent or shortcut listener
        }
      }
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const pages = [
    { id: 'dashboard', label: 'Dashboard / Overview', icon: LayoutDashboard, group: 'Pages' },
    { id: 'market', label: 'Market (Regime & Scanner)', icon: Compass, group: 'Pages' },
    { id: 'trade', label: 'Trade (Chart Explorer & Positions)', icon: BarChart2, group: 'Pages' },
    { id: 'signals', label: 'Signals & Rejects Audit', icon: Radio, group: 'Pages' },
    { id: 'strategies', label: 'Strategies Hub', icon: Layers, group: 'Pages' },
    { id: 'performance', label: 'Performance & Analytics', icon: History, group: 'Pages' },
    { id: 'control', label: 'Control (Risk & Settings)', icon: ShieldAlert, group: 'Pages' },
    { id: 'scanner', label: 'Scanner Only', icon: List, group: 'Direct Views' },
    { id: 'regime', label: 'Regime Visualizer Only', icon: Compass, group: 'Direct Views' },
    { id: 'positions', label: 'Positions & Orders Ledger', icon: Activity, group: 'Direct Views' },
    { id: 'rejects', label: 'Rejects Stream Only', icon: Ban, group: 'Direct Views' },
    { id: 'risk', label: 'Risk Center', icon: ShieldAlert, group: 'Direct Views' },
    { id: 'settings', label: 'Settings', icon: SettingsIcon, group: 'Direct Views' },
    { id: 'health', label: 'System Health Status', icon: Terminal, group: 'Direct Views' },
  ];

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto p-4 sm:p-6 md:p-20 flex items-start justify-center">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Palette Container */}
      <div className="relative w-full max-w-xl bg-[#161B22] border border-[#30363D] rounded-xl shadow-2xl overflow-hidden z-10 animate-in fade-in zoom-in-95 duration-150">
        <Command
          className="w-full flex flex-col font-mono text-xs"
          value={search}
          onValueChange={setSearch}
        >
          {/* Search Input */}
          <div className="flex items-center px-4 border-b border-[#30363D] bg-[#0E1117]/80">
            <Search className="w-4 h-4 text-gray-400 shrink-0 mr-3" />
            <Command.Input
              value={search}
              onValueChange={setSearch}
              placeholder="Type a command, page, or search coins (e.g. BTC, Trade, Risk)..."
              className="w-full h-12 bg-transparent text-gray-100 placeholder-gray-500 text-sm focus:outline-hidden font-sans"
              autoFocus
            />
            <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] bg-[#21262D] text-gray-400 border border-[#30363D] rounded font-mono">
              ESC
            </kbd>
          </div>

          {/* List of Results */}
          <Command.List className="max-h-80 overflow-y-auto p-2 space-y-1">
            <Command.Empty className="py-8 text-center text-gray-500 font-sans">
              No matching commands or coins found.
            </Command.Empty>

            {/* Actions */}
            <Command.Group heading="Quick Actions" className="text-[10px] text-gray-500 uppercase tracking-wider font-bold px-2 py-1">
              {onToggleEngine && (
                <Command.Item
                  onSelect={() => {
                    onToggleEngine();
                    onClose();
                  }}
                  className="flex items-center justify-between px-3 py-2 rounded-lg text-gray-300 hover:bg-[#21262D] hover:text-white cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-2">
                    {engineRunning ? (
                      <Square size={14} className="text-rose-400" />
                    ) : (
                      <Play size={14} className="text-emerald-400" />
                    )}
                    <span className="font-sans text-xs">
                      {engineRunning ? 'Stop Trading Engine' : 'Start Trading Engine'}
                    </span>
                  </div>
                  <span className="text-[10px] text-gray-500 font-mono">
                    {engineRunning ? 'PAUSE' : 'START'}
                  </span>
                </Command.Item>
              )}

              {onOpenInspector && (
                <Command.Item
                  onSelect={() => {
                    onOpenInspector();
                    onClose();
                  }}
                  className="flex items-center justify-between px-3 py-2 rounded-lg text-gray-300 hover:bg-[#21262D] hover:text-white cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Sparkles size={14} className="text-indigo-400" />
                    <span className="font-sans text-xs">Check Strategies (Live Inspector)</span>
                  </div>
                  <span className="text-[10px] text-gray-500 font-mono">DIAGNOSTIC</span>
                </Command.Item>
              )}
            </Command.Group>

            {/* Navigation Pages */}
            <Command.Group heading="Navigation" className="text-[10px] text-gray-500 uppercase tracking-wider font-bold px-2 py-1 mt-2">
              {pages.map((item) => {
                const Icon = item.icon;
                return (
                  <Command.Item
                    key={item.id}
                    onSelect={() => {
                      onNavigate(item.id);
                      onClose();
                    }}
                    className="flex items-center justify-between px-3 py-2 rounded-lg text-gray-300 hover:bg-[#21262D] hover:text-white cursor-pointer transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <Icon size={14} className="text-indigo-400" />
                      <span className="font-sans text-xs">{item.label}</span>
                    </div>
                    <span className="text-[10px] text-gray-500 font-mono">{item.group}</span>
                  </Command.Item>
                );
              })}
            </Command.Group>

            {/* Scanned Coins */}
            {coins.length > 0 && (
              <Command.Group heading="Scanned Coins" className="text-[10px] text-gray-500 uppercase tracking-wider font-bold px-2 py-1 mt-2">
                {coins.slice(0, 20).map((coin) => (
                  <Command.Item
                    key={coin.symbol}
                    onSelect={() => {
                      if (onSelectCoin) onSelectCoin(coin.symbol);
                      onNavigate('trade');
                      onClose();
                    }}
                    className="flex items-center justify-between px-3 py-2 rounded-lg text-gray-300 hover:bg-[#21262D] hover:text-white cursor-pointer transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-gray-200">{coin.symbol}</span>
                      <span className="text-[11px] text-gray-400 font-mono tabular-nums">
                        ${coin.price > 1 ? coin.price.toFixed(2) : coin.price.toFixed(4)}
                      </span>
                    </div>
                    <span
                      className={`text-[11px] font-semibold font-mono tabular-nums ${
                        coin.change24h >= 0 ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {coin.change24h >= 0 ? '+' : ''}
                      {coin.change24h.toFixed(2)}%
                    </span>
                  </Command.Item>
                ))}
              </Command.Group>
            )}
          </Command.List>

          {/* Palette Footer */}
          <div className="px-4 py-2 border-t border-[#30363D] bg-[#0E1117]/80 flex items-center justify-between text-[11px] text-gray-500 font-sans">
            <div className="flex items-center gap-3">
              <span>Navigate <kbd className="px-1 py-0.5 bg-[#21262D] rounded text-[9px] text-gray-400 font-mono">↑</kbd> <kbd className="px-1 py-0.5 bg-[#21262D] rounded text-[9px] text-gray-400 font-mono">↓</kbd></span>
              <span>Select <kbd className="px-1 py-0.5 bg-[#21262D] rounded text-[9px] text-gray-400 font-mono">↵</kbd></span>
            </div>
            <span>Press <kbd className="px-1 py-0.5 bg-[#21262D] rounded text-[9px] text-gray-400 font-mono">⌘K</kbd> to toggle</span>
          </div>
        </Command>
      </div>
    </div>
  );
}
