import React from 'react';
import { TrendingUp, TrendingDown, ChevronDown, Compass, Activity, Layers, Zap, Clock, Gauge } from 'lucide-react';
import { CoinDetail, AppSettings, Timeframe } from '../../types';
import { formatPrice } from '../../utils/format';

interface MarketContextBarProps {
  currentCoin: CoinDetail | undefined;
  coins: CoinDetail[];
  selectedSymbol: string;
  onSelectSymbol: (symbol: string) => void;
  macroColor?: 'GREEN' | 'AMBER' | 'RED';
  settings?: AppSettings;
  onOpenSettings?: () => void;
  onSelectTimeframe?: (tf: Timeframe) => void;
  onNavigateRegime?: () => void;
}

export function MarketContextBar({
  currentCoin,
  coins,
  selectedSymbol,
  onSelectSymbol,
  macroColor = 'GREEN',
  settings,
  onOpenSettings,
  onSelectTimeframe,
  onNavigateRegime,
}: MarketContextBarProps) {
  const isPositiveChange = (currentCoin?.change24h || 0) >= 0;
  const popularSymbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT', 'BNBUSDT'];

  const regimeLabel = currentCoin?.status === 'STRONG_TREND' || currentCoin?.status === 'TRENDING'
    ? 'Trending'
    : currentCoin?.status === 'RANGE' || currentCoin?.status === 'RANGING'
    ? 'Consolidating / Range'
    : currentCoin?.status === 'ARMED'
    ? 'Setup Armed'
    : 'Transition';

  const trendDirection = currentCoin?.direction === 'LONG'
    ? 'Bullish'
    : currentCoin?.direction === 'SHORT'
    ? 'Bearish'
    : 'Neutral';

  // Compute trend strength description from score/indicators
  const score = currentCoin?.score || 0;
  const trendStrength = score >= 75
    ? 'Strong'
    : score >= 50
    ? 'Moderate'
    : 'Consolidating';

  return (
    <div className="bg-[#121721] border border-[#232B3B] rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 shadow-sm">
      
      {/* Left: Coin Selector & Live Price */}
      <div className="flex flex-wrap items-center gap-3 sm:gap-4">
        
        {/* Symbol Select Dropdown */}
        <div className="relative inline-block">
          <select
            value={selectedSymbol}
            onChange={(e) => onSelectSymbol(e.target.value)}
            className="appearance-none bg-[#0B0E14] text-gray-100 font-bold text-sm px-3 py-1.5 pr-8 rounded-lg border border-[#232B3B] hover:border-[#38BDF8]/50 focus:border-[#38BDF8] focus:outline-hidden transition-colors cursor-pointer"
          >
            {coins.map((c) => (
              <option key={c.symbol} value={c.symbol}>
                {c.symbol}
              </option>
            ))}
          </select>
          <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
        </div>

        {/* Quick Picker shortcuts */}
        <div className="hidden lg:flex items-center gap-1">
          {popularSymbols.map((sym) => (
            <button
              key={sym}
              onClick={() => onSelectSymbol(sym)}
              className={`px-2 py-1 rounded-md text-[11px] font-semibold transition-colors cursor-pointer ${
                selectedSymbol === sym
                  ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-[#1A202E]'
              }`}
            >
              {sym.replace('USDT', '')}
            </button>
          ))}
        </div>

        {/* Price & 24h Delta */}
        {currentCoin && (
          <div className="flex items-baseline gap-2 pl-1 border-l border-[#232B3B]">
            <span className="text-base font-bold font-mono tabular-nums text-gray-100">
              ${formatPrice(currentCoin.price)}
            </span>
            <span className={`flex items-center gap-0.5 text-xs font-semibold font-mono tabular-nums ${
              isPositiveChange ? 'text-emerald-400' : 'text-rose-400'
            }`}>
              {isPositiveChange ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
              {isPositiveChange ? '+' : ''}{currentCoin.change24h.toFixed(2)}%
            </span>
          </div>
        )}
      </div>

      {/* Right: Technical Context & Regime Metadata */}
      <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-xs">
        
        {/* Timeframe */}
        <div className="flex items-center gap-1.5 text-gray-300">
          <Clock size={13} className="text-gray-400" />
          <span className="text-gray-400 text-[11px]">TF:</span>
          <span className="font-mono font-semibold text-gray-200 px-1.5 py-0.5 rounded bg-[#1A202E] border border-[#2A3447] text-[11px]">
            {settings?.timeframe || '4H'}
          </span>
        </div>

        {/* Coin Regime */}
        <button
          onClick={onNavigateRegime}
          className={`flex items-center gap-1.5 text-gray-300 rounded px-1.5 py-0.5 transition-colors ${
            onNavigateRegime ? 'hover:bg-[#1A202E] hover:text-sky-300 cursor-pointer' : ''
          }`}
          title="Open 3-Layer Regime Visualizer"
        >
          <Compass size={14} className="text-sky-400" />
          <span className="text-gray-400 text-[11px]">Coin Regime:</span>
          <span className="font-semibold text-gray-200">{regimeLabel}</span>
        </button>

        {/* Trend Direction & Strength */}
        <div className="hidden sm:flex items-center gap-1.5 text-gray-300">
          <Activity size={14} className="text-purple-400" />
          <span className="text-gray-400 text-[11px]">Trend:</span>
          <span className={`font-semibold ${
            trendDirection === 'Bullish' ? 'text-emerald-400' : trendDirection === 'Bearish' ? 'text-rose-400' : 'text-gray-300'
          }`}>
            {trendDirection}
          </span>
          <span className="text-gray-500 text-[11px]">({trendStrength})</span>
        </div>

        {/* Macro Regime Indicator */}
        <button
          onClick={onNavigateRegime}
          className={`flex items-center gap-1.5 pl-2 border-l border-[#232B3B] rounded px-1.5 py-0.5 transition-colors ${
            onNavigateRegime ? 'hover:bg-[#1A202E] cursor-pointer' : ''
          }`}
          title="Open Macro Regime Breakdown"
        >
          <span className={`w-2 h-2 rounded-full ${
            macroColor === 'GREEN' ? 'bg-emerald-400 animate-pulse' : macroColor === 'AMBER' ? 'bg-amber-400' : 'bg-rose-400'
          }`} />
          <span className="text-gray-400 text-[11px]">Market Regime:</span>
          <span className={`font-bold text-[11px] ${
            macroColor === 'GREEN' ? 'text-emerald-400' : macroColor === 'AMBER' ? 'text-amber-400' : 'text-rose-400'
          }`}>
            {macroColor === 'GREEN' ? 'FAVORABLE' : macroColor === 'AMBER' ? 'CAUTION' : 'DEFENSIVE'}
          </span>
        </button>

      </div>

    </div>
  );
}
