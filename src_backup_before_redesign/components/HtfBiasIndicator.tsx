import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  Activity, 
  RefreshCw, 
  ShieldAlert, 
  CheckCircle2, 
  XCircle, 
  HelpCircle, 
  ChevronDown, 
  ChevronUp, 
  Layers, 
  Compass, 
  ArrowUpRight, 
  ArrowDownRight, 
  ArrowRight,
  Filter,
  AlertTriangle,
  Sliders,
  ExternalLink,
  Info
} from 'lucide-react';
import { AppSettings, HtfBiasData, HtfSlopeStatus, HtfBiasType } from '../types';
import { evaluate4HHtfBias, calculateSlope, classifySlope } from '../utils/indicators';

interface Props {
  symbol?: string;
  settings?: AppSettings;
  onSelectSymbol?: (symbol: string) => void;
  onNavigateSettings?: () => void;
}

export function HtfBiasIndicator({
  symbol = 'BTCUSDT',
  settings,
  onSelectSymbol,
  onNavigateSettings
}: Props) {
  const [activeSymbol, setActiveSymbol] = useState<string>(symbol || 'BTCUSDT');
  const [biasData, setBiasData] = useState<HtfBiasData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number>(Date.now());
  const [showMatrix, setShowMatrix] = useState<boolean>(true);
  const [showRecentVetos, setShowRecentVetos] = useState<boolean>(false);
  const [showFormulaInfo, setShowFormulaInfo] = useState<boolean>(false);
  const [candles4H, setCandles4H] = useState<any[]>([]);

  // Keep active symbol synchronized when prop changes
  useEffect(() => {
    if (symbol && symbol !== activeSymbol) {
      setActiveSymbol(symbol);
    }
  }, [symbol]);

  // Fetch 4H klines and calculate/fetch bias details
  const fetch4HBias = useCallback(async (sym: string) => {
    setLoading(true);
    setError(null);
    try {
      const cleanSym = (sym || 'BTCUSDT').toUpperCase();
      
      // 1. Try server-side endpoint first (includes audit rejections and engine state)
      let fetchedFromServer = false;
      try {
        const srvRes = await fetch(`/api/bot/htf-bias?symbol=${cleanSym}`);
        if (srvRes.ok) {
          const data: HtfBiasData = await srvRes.json();
          if (data && data.bias) {
            setBiasData(data);
            setLastUpdated(Date.now());
            fetchedFromServer = true;
          }
        }
      } catch (e) {
        // Server endpoint fallback to direct proxy
      }

      // 2. Fetch 4H candles to ensure live client-side recalculation & sparkline rendering
      const proxyRes = await fetch(`/api/binance/proxy?path=/fapi/v1/klines&symbol=${cleanSym}&interval=4h&limit=60`);
      if (proxyRes.ok) {
        const raw = await proxyRes.json();
        if (Array.isArray(raw) && raw.length > 0) {
          const parsedCandles = raw.map((k: any) => ({
            time: Math.floor(k[0] / 1000),
            open: parseFloat(k[1]),
            high: parseFloat(k[2]),
            low: parseFloat(k[3]),
            close: parseFloat(k[4]),
            volume: parseFloat(k[5]),
          }));
          setCandles4H(parsedCandles);

          // If server didn't respond or to guarantee freshness:
          if (!fetchedFromServer) {
            const calculated = evaluate4HHtfBias(parsedCandles, cleanSym);
            setBiasData(calculated);
            setLastUpdated(Date.now());
          }
        }
      } else if (!fetchedFromServer) {
        throw new Error('Failed to retrieve 4H candle data from market stream');
      }
    } catch (err: any) {
      console.warn('[HtfBiasIndicator] Error fetching 4H HTF data:', err);
      setError(err?.message || 'Unable to sync 4H market data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch4HBias(activeSymbol);
    // Poll every 30 seconds for live updates
    const timer = setInterval(() => {
      fetch4HBias(activeSymbol);
    }, 30000);
    return () => clearInterval(timer);
  }, [activeSymbol, fetch4HBias]);

  const isGateBypassed = Boolean(settings?.disabledGates?.htfAgreement);

  // Styling derivations based on bias
  const bias = biasData?.bias || 'NEUTRAL';
  const isBullish = bias === 'BULLISH';
  const isBearish = bias === 'BEARISH';
  const isNeutral = bias === 'NEUTRAL';

  const themeColors = useMemo(() => {
    if (isBullish) {
      return {
        badgeBg: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400',
        cardBg: 'from-emerald-950/20 via-[#161B22] to-[#161B22] border-emerald-500/30',
        glow: 'shadow-[0_0_20px_rgba(16,185,129,0.12)]',
        accentText: 'text-emerald-400',
        progressBar: 'bg-emerald-500',
        permittedBadge: 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300',
        vetoedBadge: 'bg-red-500/10 border-red-500/20 text-red-400'
      };
    } else if (isBearish) {
      return {
        badgeBg: 'bg-rose-500/10 border-rose-500/30 text-rose-400',
        cardBg: 'from-rose-950/20 via-[#161B22] to-[#161B22] border-rose-500/30',
        glow: 'shadow-[0_0_20px_rgba(244,63,94,0.12)]',
        accentText: 'text-rose-400',
        progressBar: 'bg-rose-500',
        permittedBadge: 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300',
        vetoedBadge: 'bg-red-500/10 border-red-500/20 text-red-400'
      };
    }
    return {
      badgeBg: 'bg-amber-500/10 border-amber-500/30 text-amber-400',
      cardBg: 'from-amber-950/20 via-[#161B22] to-[#161B22] border-amber-500/30',
      glow: 'shadow-[0_0_20px_rgba(245,158,11,0.1)]',
      accentText: 'text-amber-400',
      progressBar: 'bg-amber-500',
      permittedBadge: 'bg-amber-500/20 border-amber-500/40 text-amber-300',
      vetoedBadge: 'bg-gray-500/10 border-gray-500/20 text-gray-400'
    };
  }, [isBullish, isBearish]);

  // Mini sparkline SVG data points for last 20 candles
  const sparklineData = useMemo(() => {
    if (!candles4H || candles4H.length < 10) return null;
    const slice = candles4H.slice(-20);
    const closes = slice.map(c => c.close);
    const min = Math.min(...closes);
    const max = Math.max(...closes);
    const range = max - min || 1;
    const width = 240;
    const height = 48;
    const points = closes.map((c, i) => {
      const x = (i / (closes.length - 1)) * width;
      const y = height - ((c - min) / range) * (height - 8) - 4;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
    return { points, min, max, last: closes[closes.length - 1], first: closes[0] };
  }, [candles4H]);

  const formatSlope = (slope: number) => {
    const sign = slope > 0 ? '+' : '';
    return `${sign}${slope.toFixed(2)}%/bar`;
  };

  const getSlopeIcon = (status: HtfSlopeStatus) => {
    if (status === 'RISING') return <ArrowUpRight className="w-3.5 h-3.5 text-emerald-400" />;
    if (status === 'FALLING') return <ArrowDownRight className="w-3.5 h-3.5 text-rose-400" />;
    return <ArrowRight className="w-3.5 h-3.5 text-gray-400" />;
  };

  return (
    <div className={`bg-[#161B22] border rounded-xl overflow-hidden transition-all duration-300 shadow-md ${themeColors.cardBg} ${themeColors.glow}`}>
      {/* Top Header Bar */}
      <div className="p-4 border-b border-[#30363D] flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center space-x-2.5">
          <div className="p-1.5 rounded-lg bg-[#21262D] border border-[#30363D] text-blue-400">
            <Compass className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-xs font-bold text-gray-100 uppercase tracking-wider">
                HTF Bias Indicator
              </span>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30">
                4H Macro
              </span>
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${
                isGateBypassed ? 'bg-amber-500/10 border-amber-500/30 text-amber-400' : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
              }`}>
                {isGateBypassed ? 'Gate 5: BYPASSED' : 'Gate 5: ACTIVE'}
              </span>
            </div>
            <p className="text-[10px] text-gray-400">
              Institutional SMA/EMA Slope & Direction Filter
            </p>
          </div>
        </div>

        {/* Quick symbol selectors & refresh */}
        <div className="flex items-center space-x-2">
          <div className="flex items-center bg-[#0D1117] rounded-lg border border-[#30363D] p-0.5 text-[11px]">
            {['BTCUSDT', 'ETHUSDT', 'SOLUSDT'].map((sym) => (
              <button
                key={sym}
                onClick={() => {
                  setActiveSymbol(sym);
                  if (onSelectSymbol) onSelectSymbol(sym);
                }}
                className={`px-2 py-0.5 rounded text-[10px] font-mono font-medium transition-colors ${
                  activeSymbol === sym 
                    ? 'bg-blue-600 text-white font-bold' 
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                {sym.replace('USDT', '')}
              </button>
            ))}
            {activeSymbol !== 'BTCUSDT' && activeSymbol !== 'ETHUSDT' && activeSymbol !== 'SOLUSDT' && (
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-blue-600/60 text-white">
                {activeSymbol.replace('USDT', '')}
              </span>
            )}
          </div>

          <button
            onClick={() => fetch4HBias(activeSymbol)}
            disabled={loading}
            title="Refresh 4H Market Slope"
            className="p-1.5 rounded-lg bg-[#21262D] hover:bg-[#30363D] text-gray-400 hover:text-gray-200 border border-[#30363D] transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-blue-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* Main Bias Status Card */}
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center space-x-3">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center border shadow-inner ${themeColors.badgeBg}`}>
              {isBullish && <TrendingUp className="w-6 h-6 stroke-[2.5]" />}
              {isBearish && <TrendingDown className="w-6 h-6 stroke-[2.5]" />}
              {isNeutral && <Activity className="w-6 h-6 stroke-[2.5]" />}
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className={`text-base font-black tracking-wide ${themeColors.accentText}`}>
                  {bias} BIAS
                </span>
                <span className="text-[11px] font-mono text-gray-400">
                  ({activeSymbol})
                </span>
              </div>
              <div className="text-xs text-gray-300 font-medium">
                {isBullish && 'Uptrend Momentum • Longs Favored'}
                {isBearish && 'Downtrend Momentum • Shorts Favored'}
                {isNeutral && 'Range / Mean-Reversion • Flat Slopes'}
              </div>
            </div>
          </div>

          {/* Conviction Score & Price */}
          <div className="text-right">
            <div className="text-[10px] text-gray-400 uppercase tracking-wider">
              Bias Conviction Score
            </div>
            <div className="flex items-baseline justify-end space-x-1">
              <span className={`text-lg font-mono font-bold ${
                (biasData?.score || 0) > 0 ? 'text-emerald-400' : (biasData?.score || 0) < 0 ? 'text-rose-400' : 'text-gray-300'
              }`}>
                {(biasData?.score || 0) > 0 ? `+${biasData?.score}` : biasData?.score || 0}
              </span>
              <span className="text-[10px] text-gray-500 font-mono">/ 100</span>
            </div>
            <div className="text-[10px] font-mono text-gray-400">
              4H Price: ${biasData?.price ? biasData.price.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '---'}
            </div>
          </div>
        </div>

        {/* Conviction Bar */}
        <div className="space-y-1">
          <div className="h-1.5 w-full bg-[#21262D] rounded-full overflow-hidden flex">
            {/* Left side (Bearish -100 to 0) */}
            <div className="w-1/2 h-full flex justify-end bg-[#21262D]">
              <div 
                className="h-full bg-rose-500 rounded-l transition-all duration-500" 
                style={{ 
                  width: `${Math.min(100, Math.max(0, -((biasData?.score || 0) * 1)))}%` 
                }} 
              />
            </div>
            {/* Center divider line */}
            <div className="w-0.5 h-full bg-[#484F58]" />
            {/* Right side (Bullish 0 to +100) */}
            <div className="w-1/2 h-full flex justify-start bg-[#21262D]">
              <div 
                className="h-full bg-emerald-500 rounded-r transition-all duration-500" 
                style={{ 
                  width: `${Math.min(100, Math.max(0, (biasData?.score || 0) * 1))}%` 
                }} 
              />
            </div>
          </div>
          <div className="flex justify-between text-[9px] font-mono text-gray-500">
            <span>-100 (Strong Bear)</span>
            <span>0 (Neutral / Chop)</span>
            <span>+100 (Strong Bull)</span>
          </div>
        </div>

        {/* --- CRITICAL SECTION: WHY THE ENGINE IS FILTERING TRADES --- */}
        <div className="bg-[#0D1117] border border-[#30363D] rounded-lg p-3 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-1.5">
              <Filter className="w-3.5 h-3.5 text-blue-400" />
              <span className="text-[11px] font-bold text-gray-200 uppercase tracking-wider">
                Why Is the Engine Filtering Trades?
              </span>
            </div>
            <span className="text-[10px] text-gray-400">
              Gate 5 Alignment Check
            </span>
          </div>

          <p className="text-xs text-gray-300 leading-relaxed font-sans">
            {biasData?.filtering.reason || (
              isBullish 
                ? '4H EMA50 slope is positive and price is above EMA50. The engine automatically vetoes SHORT signals to prevent counter-trend squeeze liquidations.'
                : isBearish
                ? '4H EMA50 slope is negative and price is below EMA50. The engine automatically vetoes LONG signals to prevent buying into macro distribution.'
                : '4H slopes are flat or tangled. Trend-continuation setups are paused or size-reduced to prevent getting chopped up in range bodies.'
            )}
          </p>

          {/* Trade Direction Execution Rules */}
          <div className="grid grid-cols-2 gap-2 pt-1">
            {/* Long Signals Status */}
            <div className={`p-2 rounded border flex items-center justify-between text-[11px] ${
              isBullish
                ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-300'
                : isBearish
                ? 'bg-rose-950/20 border-rose-500/30 text-rose-300'
                : 'bg-[#161B22] border-[#30363D] text-gray-300'
            }`}>
              <div className="flex items-center space-x-1.5">
                {isBullish ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                ) : isBearish ? (
                  <XCircle className="w-3.5 h-3.5 text-rose-400" />
                ) : (
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                )}
                <span className="font-semibold">LONG Signals</span>
              </div>
              <span className="text-[10px] font-mono uppercase font-bold">
                {isBullish ? 'PERMITTED' : isBearish ? (isGateBypassed ? 'BYPASSED' : 'VETOED') : 'STRICT ADX'}
              </span>
            </div>

            {/* Short Signals Status */}
            <div className={`p-2 rounded border flex items-center justify-between text-[11px] ${
              isBearish
                ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-300'
                : isBullish
                ? 'bg-rose-950/20 border-rose-500/30 text-rose-300'
                : 'bg-[#161B22] border-[#30363D] text-gray-300'
            }`}>
              <div className="flex items-center space-x-1.5">
                {isBearish ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                ) : isBullish ? (
                  <XCircle className="w-3.5 h-3.5 text-rose-400" />
                ) : (
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                )}
                <span className="font-semibold">SHORT Signals</span>
              </div>
              <span className="text-[10px] font-mono uppercase font-bold">
                {isBearish ? 'PERMITTED' : isBullish ? (isGateBypassed ? 'BYPASSED' : 'VETOED') : 'STRICT ADX'}
              </span>
            </div>
          </div>

          {/* Audit Rejection Counter & Drill-down */}
          {biasData?.recentRejections && biasData.recentRejections.count > 0 && (
            <div className="pt-1 border-t border-[#21262D]">
              <button
                onClick={() => setShowRecentVetos(!showRecentVetos)}
                className="w-full flex items-center justify-between text-[10px] text-gray-400 hover:text-gray-200 transition-colors"
              >
                <span className="flex items-center space-x-1">
                  <ShieldAlert className="w-3 h-3 text-amber-400" />
                  <span>
                    <strong>{biasData.recentRejections.count}</strong> signals recently filtered by Gate 5 / HTF bias
                  </span>
                </span>
                {showRecentVetos ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>

              {showRecentVetos && (
                <div className="mt-2 space-y-1 bg-[#161B22] p-2 rounded border border-[#30363D] max-h-36 overflow-y-auto font-mono text-[9px] text-gray-300">
                  {biasData.recentRejections.latestReasons.map((reasonStr, idx) => (
                    <div key={idx} className="border-b border-[#21262D] last:border-0 pb-1 pt-0.5">
                      {reasonStr}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* --- 4H MOVING AVERAGE & SLOPE MATRIX --- */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setShowMatrix(!showMatrix)}
              className="flex items-center space-x-1.5 text-xs font-semibold text-gray-300 hover:text-gray-100 transition-colors"
            >
              <Layers className="w-3.5 h-3.5 text-blue-400" />
              <span>4H Moving Average & Slope Matrix</span>
              {showMatrix ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
            <button
              onClick={() => setShowFormulaInfo(!showFormulaInfo)}
              title="Mathematical Formula Information"
              className="text-gray-400 hover:text-gray-200 transition-colors"
            >
              <Info className="w-3.5 h-3.5" />
            </button>
          </div>

          {showFormulaInfo && (
            <div className="bg-[#0D1117] border border-blue-500/30 rounded-lg p-2.5 text-[10px] text-gray-300 space-y-1 font-mono">
              <div className="text-blue-400 font-bold">Slope Formula:</div>
              <div>Slope = ((MA[t] - MA[t - 3]) / MA[t - 3]) * 100</div>
              <div className="text-gray-400 pt-0.5">
                • Rising: Slope &gt; +0.01% / bar<br />
                • Falling: Slope &lt; -0.01% / bar<br />
                • Flat (Chop): |Slope| &le; 0.01% / bar
              </div>
            </div>
          )}

          {showMatrix && biasData && (
            <div className="overflow-x-auto">
              <table className="w-full text-[11px] font-mono text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#30363D] text-[9px] uppercase tracking-wider text-gray-400">
                    <th className="py-1.5 px-2">Indicator</th>
                    <th className="py-1.5 px-2">4H Level</th>
                    <th className="py-1.5 px-2">Price Diff</th>
                    <th className="py-1.5 px-2">3-Bar Slope</th>
                    <th className="py-1.5 px-2 text-right">Trajectory</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#21262D]">
                  {/* EMA 20 */}
                  <tr className="hover:bg-[#21262D]/40 transition-colors">
                    <td className="py-1.5 px-2 font-bold text-cyan-400">EMA 20 (Fast)</td>
                    <td className="py-1.5 px-2">${biasData.ema20.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                    <td className={`py-1.5 px-2 ${biasData.price >= biasData.ema20 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {biasData.price >= biasData.ema20 ? '+' : ''}{(((biasData.price - biasData.ema20) / biasData.ema20) * 100).toFixed(2)}%
                    </td>
                    <td className={`py-1.5 px-2 ${biasData.ema20Slope > 0 ? 'text-emerald-400' : biasData.ema20Slope < 0 ? 'text-rose-400' : 'text-gray-400'}`}>
                      {formatSlope(biasData.ema20Slope)}
                    </td>
                    <td className="py-1.5 px-2 text-right">
                      <span className="inline-flex items-center space-x-1">
                        {getSlopeIcon(biasData.fastSlopeStatus)}
                        <span className="text-[10px]">{biasData.fastSlopeStatus}</span>
                      </span>
                    </td>
                  </tr>

                  {/* EMA 50 */}
                  <tr className="hover:bg-[#21262D]/40 transition-colors">
                    <td className="py-1.5 px-2 font-bold text-indigo-400">EMA 50 (Slow)</td>
                    <td className="py-1.5 px-2">${biasData.ema50.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                    <td className={`py-1.5 px-2 ${biasData.price >= biasData.ema50 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {biasData.price >= biasData.ema50 ? '+' : ''}{(((biasData.price - biasData.ema50) / biasData.ema50) * 100).toFixed(2)}%
                    </td>
                    <td className={`py-1.5 px-2 ${biasData.ema50Slope > 0 ? 'text-emerald-400' : biasData.ema50Slope < 0 ? 'text-rose-400' : 'text-gray-400'}`}>
                      {formatSlope(biasData.ema50Slope)}
                    </td>
                    <td className="py-1.5 px-2 text-right">
                      <span className="inline-flex items-center space-x-1">
                        {getSlopeIcon(biasData.slowSlopeStatus)}
                        <span className="text-[10px]">{biasData.slowSlopeStatus}</span>
                      </span>
                    </td>
                  </tr>

                  {/* SMA 50 */}
                  <tr className="hover:bg-[#21262D]/40 transition-colors">
                    <td className="py-1.5 px-2 font-bold text-purple-400">SMA 50 (Medium)</td>
                    <td className="py-1.5 px-2">${biasData.sma50.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                    <td className={`py-1.5 px-2 ${biasData.price >= biasData.sma50 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {biasData.price >= biasData.sma50 ? '+' : ''}{(((biasData.price - biasData.sma50) / biasData.sma50) * 100).toFixed(2)}%
                    </td>
                    <td className={`py-1.5 px-2 ${biasData.sma50Slope > 0 ? 'text-emerald-400' : biasData.sma50Slope < 0 ? 'text-rose-400' : 'text-gray-400'}`}>
                      {formatSlope(biasData.sma50Slope)}
                    </td>
                    <td className="py-1.5 px-2 text-right">
                      <span className="inline-flex items-center space-x-1">
                        {getSlopeIcon(classifySlope(biasData.sma50Slope, 0.01))}
                        <span className="text-[10px]">{classifySlope(biasData.sma50Slope, 0.01)}</span>
                      </span>
                    </td>
                  </tr>

                  {/* SMA 200 */}
                  <tr className="hover:bg-[#21262D]/40 transition-colors">
                    <td className="py-1.5 px-2 font-bold text-orange-400">SMA 200 (Macro)</td>
                    <td className="py-1.5 px-2">${biasData.sma200.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                    <td className={`py-1.5 px-2 ${biasData.price >= biasData.sma200 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {biasData.price >= biasData.sma200 ? '+' : ''}{(((biasData.price - biasData.sma200) / biasData.sma200) * 100).toFixed(2)}%
                    </td>
                    <td className={`py-1.5 px-2 ${biasData.sma200Slope > 0 ? 'text-emerald-400' : biasData.sma200Slope < 0 ? 'text-rose-400' : 'text-gray-400'}`}>
                      {formatSlope(biasData.sma200Slope)}
                    </td>
                    <td className="py-1.5 px-2 text-right">
                      <span className="inline-flex items-center space-x-1">
                        {getSlopeIcon(biasData.macroSlopeStatus)}
                        <span className="text-[10px]">{biasData.macroSlopeStatus}</span>
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* MA Stack Summary */}
              <div className="mt-2 text-[10px] text-gray-400 bg-[#0D1117] p-2 rounded border border-[#30363D] flex items-center justify-between">
                <span>Structure Stack Alignment:</span>
                <span className={`font-mono font-bold ${
                  biasData.alignment === 'STACKED_BULLISH' ? 'text-emerald-400' :
                  biasData.alignment === 'STACKED_BEARISH' ? 'text-rose-400' : 'text-amber-400'
                }`}>
                  {biasData.alignment.replace('_', ' ')}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Mini 4H Sparkline Visualizer */}
        {sparklineData && (
          <div className="bg-[#0D1117] border border-[#30363D] rounded-lg p-2.5 space-y-1">
            <div className="flex items-center justify-between text-[10px] text-gray-400">
              <span className="font-semibold text-gray-300">4H Price & Trend Curve (Last 20 Bars)</span>
              <span className="font-mono">
                ${sparklineData.min.toLocaleString(undefined, { maximumFractionDigits: 1 })} - ${sparklineData.max.toLocaleString(undefined, { maximumFractionDigits: 1 })}
              </span>
            </div>
            <div className="relative h-12 w-full flex items-center justify-center">
              <svg className="w-full h-full overflow-visible" viewBox="0 0 240 48" preserveAspectRatio="none">
                <polyline
                  fill="none"
                  stroke={isBullish ? '#10B981' : isBearish ? '#F43F5E' : '#F59E0B'}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points={sparklineData.points}
                />
              </svg>
            </div>
          </div>
        )}

        {/* Footer / Controls */}
        <div className="pt-2 border-t border-[#30363D] flex items-center justify-between text-[10px] text-gray-500">
          <div className="flex items-center space-x-2">
            <span>Last 4H check: {new Date(lastUpdated).toLocaleTimeString()}</span>
            {biasData?.metrics.adx && (
              <span className="text-gray-400">| ADX: <strong>{biasData.metrics.adx}</strong></span>
            )}
          </div>
          {onNavigateSettings && (
            <button
              onClick={onNavigateSettings}
              className="flex items-center space-x-1 text-blue-400 hover:text-blue-300 transition-colors"
            >
              <Sliders className="w-3 h-3" />
              <span>Configure Gates</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
export default HtfBiasIndicator;
