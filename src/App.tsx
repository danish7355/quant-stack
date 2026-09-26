/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Menu, PanelLeftOpen, PanelLeftClose,
  TrendingUp, TrendingDown, LayoutDashboard, Settings as SettingsIcon, LineChart, History, ShieldAlert, Terminal,
  CircleCheck, ChevronRight, AlertTriangle, RefreshCw, Bell, Sun, Moon, Play, Square, Search, Activity, BarChart2, List, GitPullRequest, Zap, GitBranch
} from 'lucide-react';
import { Timeframe, CoinDetail, Position, TradeLog, AppSettings, EquitySnapshot } from './types';
import ScannerList from './components/ScannerList';
import SettingsPanel from './components/SettingsPanel';
import ActiveTrades from './components/ActiveTrades';
import TradingChart from './components/TradingChart';
import PerformancePage from './components/PerformancePage';
import StrategyPanel from './components/StrategyPanel';
import GateManager from './components/GateManager';
import { runScoringEngine } from './utils/indicators';
import { findEmaGapSetup } from './utils/strategies/emaGapPullback';
import { 
  detectCompression, detectBreakout, scoreBreakout, applyTrendAndMomentumBonus, 
  calculateATR, calculateEMA, determineStopLoss, calculateVcbTargets
} from './utils/strategies/volatilityCompression';
import { evaluateTwoSidedCoilBreakout } from './utils/strategies/twoSidedCoilBreakout';
import { evaluateSmc } from './utils/strategies/smcLiquidity';
import { evaluateTrendPullbackDetailed } from './utils/strategies/trendPullback';
import { formatPrice } from './utils/format';
import { useToast } from './components/ToastContext';
import { SystemHealthPage } from './components/SystemHealth';
import { TopNavigationBar } from './components/TopNavigationBar';
import { SignalsPage } from './components/SignalsPage';
import { RiskCenter } from './components/RiskCenter';
import { TradeEngineBanner } from './components/TradeEngineBanner';
import { SystemHealth, SignalView, TradingMode, CANONICAL_DEFAULT_SETTINGS } from './types';

// Default initial settings derived from the canonical shared settings model
const INITIAL_SETTINGS: AppSettings = { ...CANONICAL_DEFAULT_SETTINGS };


// Check local storage for initial values
const safeGetLocal = (key: string) => {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(key);
  } catch (e) {
    console.warn(`LocalStorage blocked or failed for ${key}`, e);
    return null;
  }
};

const safeSetLocal = (key: string, value: string) => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, value);
  } catch (e) {
    console.warn(`LocalStorage blocked or failed for ${key}`, e);
  }
};

const getInitialSettings = (): AppSettings => {
  return INITIAL_SETTINGS;
};

const getInitialBalance = (): number => {
  return 10000;
};

const getInitialPositions = (): Position[] => {
  return [];
};

const getInitialTradeLogs = (): TradeLog[] => {
  return [];
};

const getInitialEquitySnapshots = (): EquitySnapshot[] => {
  return [];
};

const getInitialSidebarCollapsed = (): boolean => {
  const local = safeGetLocal('bt_sidebar_collapsed');
  if (local) { try { return JSON.parse(local); } catch (e) {} }
  return false;
};

export const mergeServerSettingsWithLocal = (prev: AppSettings, serverSettings: Partial<AppSettings>): AppSettings => {
  const merged = { ...prev };
  for (const [key, val] of Object.entries(serverSettings)) {
    if (val !== undefined && val !== null) {
      const isCredentialField = key === 'telegramBotToken' || key === 'telegramChatId' || key === 'binanceApiKey' || key === 'binanceApiSecret' || key === 'githubPat';
      const isMaskedVal = typeof val === 'string' && (val.includes('****') || val.includes('••••'));
      const isEmptyVal = typeof val === 'string' && val.trim() === '';
      if (isCredentialField && (isEmptyVal || isMaskedVal)) {
        const existing = merged[key as keyof AppSettings];
        if (!existing || (typeof existing === 'string' && (existing.includes('****') || existing.includes('••••')))) {
          (merged as any)[key] = val;
        }
      } else {
        (merged as any)[key] = val;
      }
    }
  }
  return merged;
};

export const mapRawPositionsToFrontend = (data: any[]): Position[] => {
  if (!Array.isArray(data)) return [];
  return data.map((p: any) => {
    const isLong = p.direction === 'LONG';
    const currentP = p.current_price || p.currentPrice || p.entry_price || p.entryPrice || 0;
    const entryP = p.entry_price || p.entryPrice || 0;
    const qty = p.quantity || 0;
    const leverage = p.leverage || 1;
    const allocated = p.allocated_balance || p.allocatedBalance || (entryP * qty) / leverage || 0;
    
    const priceDeltaPct = entryP > 0 ? (isLong ? (currentP - entryP) / entryP : (entryP - currentP) / entryP) : 0;
    const pnl = priceDeltaPct * allocated * leverage;

    return {
      id: p.id,
      symbol: p.symbol,
      direction: p.direction,
      entryPrice: entryP,
      currentPrice: currentP,
      quantity: qty,
      leverage: leverage,
      allocatedBalance: allocated,
      tp1: p.tp1 || 0,
      tp2: p.tp2 || 0,
      tp3: p.tp3 || 0,
      sl: p.sl || 0,
      trailingStop: typeof p.trailing_stop === 'number' ? p.trailing_stop : (typeof p.trailingStop === 'number' ? p.trailingStop : null),
      trailingStopActive: p.trailing_stop_active === 1 || p.trailingStopActive === true,
      entryAtr: p.entry_atr || p.entryAtr || (entryP * 0.015),
      timeOpen: p.time_open || p.timeOpen || new Date().toISOString(),
      scoreAtEntry: p.score_at_entry || p.scoreAtEntry || p.score || 0,
      strategy: p.strategy || 'BINANCE_COMPOSITE',
      marketRegime: p.market_regime || p.marketRegime || undefined,
      isAutoRegime: !!(p.is_auto_regime ?? p.isAutoRegime),
      frequencyPreset: p.frequency_preset || p.frequencyPreset || 'LOW',
      unrealizedPnl: pnl,
      realizedPnl: p.realizedPnl || 0,
      sizeRemainingPct: p.sizeRemainingPct ?? 100,
      lastUpdated: Date.now(),
      stopStatus: p.stopStatus || 'UNKNOWN',
      mfe: p.mfe,
      mae: p.mae
    };
  });
};

export default function App() {
  const { addToast } = useToast();

  // --- STATE ---
  const [activeTab, setActiveTab] = useState('scanner');
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(getInitialSidebarCollapsed);
  const [settings, setSettings] = useState<AppSettings>(getInitialSettings);
  
  // Demo Balance Tracking
  const [balance, setBalance] = useState(getInitialBalance);
  const [positions, setPositions] = useState<Position[]>(getInitialPositions);
  const [tradeLogs, setTradeLogs] = useState<TradeLog[]>(getInitialTradeLogs);
  const [equitySnapshots, setEquitySnapshots] = useState<EquitySnapshot[]>(getInitialEquitySnapshots);
  
  // Market Data Scanner
  const [coins, setCoins] = useState<CoinDetail[]>([]);
  const [selectedSymbol, setSelectedSymbol] = useState<'BTCUSDT' | string>('BTCUSDT');
  const [scanning, setScanning] = useState(false);
  const [scanTime, setScanTime] = useState<string>('N/A');
  const [connectionStatus, setConnectionStatus] = useState<'CONNECTED' | 'DISCONNECTED' | 'CONNECTING'>('CONNECTING');
  const [terminalLogs, setTerminalLogs] = useState<string[]>([]);
  const [hasLoadedServerSettings, setHasLoadedServerSettings] = useState(false);
  const [settingsLoadError, setSettingsLoadError] = useState<string | null>(null);
  const [systemHealth, setSystemHealth] = useState<SystemHealth | null>(null);

  // Refs for WebSockets/Loops
  const wsRef = useRef<WebSocket | null>(null);
  const scanTimerRef = useRef<NodeJS.Timeout | null>(null);
  const positionsRef = useRef<Position[]>(positions);
  const loggedArmedStatesRef = useRef<Set<string>>(new Set());
  const loggedTriggerStatesRef = useRef<Set<string>>(new Set());
  const settingsRef = useRef<AppSettings>(settings);
  const activeTabRef = useRef(activeTab);
  const isPollingUpdateRef = useRef(false);

  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  // --- LOCAL STORAGE HANDLING ---
  useEffect(() => {
    addTerminalLog('📡 Algorithmic Crypto Terminal boot cycle finished. Standby ready.');
  }, []);

  // Sync settingsRef to latest state (used by async callbacks to avoid stale closures)
  useEffect(() => {
    if (settingsRef.current.timeframe !== settings.timeframe) {
      loggedArmedStatesRef.current.clear();
      loggedTriggerStatesRef.current.clear();
      addTerminalLog(`⏱️ Timeframe changed to ${settings.timeframe} - Resetting VCB tracking states`);
    }
    settingsRef.current = settings;
    // D3 fix: Auto-sync POST removed. Settings are saved only via explicit Save button.
    // The old auto-sync caused: (1) settings wipe on GET failure, (2) double-POST races,
    // (3) stale data overwriting newer saves. All settings persistence now goes through
    // SettingsPanel.handleSaveSettings() → POST /api/bot/settings.
  }, [settings]);

  useEffect(() => {
    safeSetLocal('bt_sidebar_collapsed', JSON.stringify(sidebarCollapsed));
  }, [sidebarCollapsed]);

  useEffect(() => {
  }, [balance]);

  useEffect(() => {
    positionsRef.current = positions;
  }, [positions]);

  // Reusable fetch of server settings from backend / Firestore
  const reloadSettings = useCallback(async (retryCount = 0) => {
    try {
      const res = await fetch('/api/bot/settings');
      if (!res.ok) {
        throw new Error(`Server returned ${res.status}: ${res.statusText}`);
      }
      const serverSettings = await res.json();
      if (serverSettings && typeof serverSettings === 'object' && Object.keys(serverSettings).length > 0) {
        if (serverSettings.autoTradeEnabled !== undefined) {
          setEngineRunning(serverSettings.autoTradeEnabled !== false);
        }
        setSettings(prev => mergeServerSettingsWithLocal(prev, serverSettings));
      }
      setSettingsLoadError(null);
      setHasLoadedServerSettings(true);
    } catch (err) {
      console.warn('AutoTrader: Could not load initial server settings', err);
      if (retryCount < 3) {
        // Retry with exponential backoff
        const delay = Math.pow(2, retryCount) * 1000;
        addTerminalLog(`⚠️ Settings load failed (attempt ${retryCount + 1}/3). Retrying in ${delay / 1000}s...`);
        setTimeout(() => reloadSettings(retryCount + 1), delay);
      } else {
        // D1 fix: Do NOT set hasLoadedServerSettings = true on failure.
        // This prevents the auto-sync from firing and wiping server settings with defaults.
        setSettingsLoadError(String(err));
        addTerminalLog(`🚨 CRITICAL: Failed to load settings after 3 attempts. Trading engine paused. Using display-only defaults.`);
      }
    }
  }, []);

  useEffect(() => {
    reloadSettings();
  }, [reloadSettings]);

  useEffect(() => {
  }, [equitySnapshots]);

  // Terminal logging helper
  const addTerminalLog = (msg: string) => {
    const timeStr = new Date().toLocaleTimeString(undefined, { hour12: false });
    setTerminalLogs((prev) => [`[${timeStr}] ${msg}`, ...prev.slice(0, 49)]);
  };

  // --- TELEGRAM DISPATCH SUITE ---
  const dispatchTelegramAlert = async (text: string) => {
    try {
      await fetch('/api/bot/telegram/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      });
    } catch (e) {
      console.error('Failed to dispatch telegram signal', e);
    }
  };

  // --- SCANNED MARKET DATA FETCHING (BINANCE FUTURES REST) ---
  const fetchTopFuturesPairs = async () => {
    try {
      // Query 24h ticker to extract all USDT futures pairs sorted by 24h volume
      const response = await fetch('/api/binance/proxy?path=/fapi/v1/ticker/24hr');
      if (!response.ok) throw new Error('Rest error');
      const tickers = await response.json();

      if (!Array.isArray(tickers) || tickers.length === 0) {
        throw new Error('Invalid tickers array');
      }

      // Try fetching active exchange symbols to exclude non-perpetuals
      let validSymbols: string[] = [];
      try {
        const symRes = await fetch('/api/bot/symbols');
        if (symRes.ok) {
          validSymbols = await symRes.json();
        }
      } catch (e) {}

      const hasValidList = Array.isArray(validSymbols) && validSymbols.length > 0;

      // Filter only active USDT contracts, excluding quarterly expiry contracts and invalid pairs
      const usdtPairs = tickers
        .filter((ticker: any) => {
          const sym = ticker.symbol || '';
          const isUsdt = sym.endsWith('USDT') && !sym.includes('_');
          return hasValidList ? isUsdt && validSymbols.includes(sym) : isUsdt;
        })
        .sort((a: any, b: any) => parseFloat(b.quoteVolume || b.volume) - parseFloat(a.quoteVolume || a.volume))
        .slice(0, Math.max(10, Math.min(settingsRef.current.coinCount || 30, 100)))
        .map((ticker: any) => ({
          symbol: ticker.symbol,
          price: parseFloat(ticker.lastPrice),
          change24h: parseFloat(ticker.priceChangePercent),
        }));

      return usdtPairs.length > 0 ? usdtPairs : [
        { symbol: 'BTCUSDT', price: 68420.50, change24h: 3.42 },
        { symbol: 'ETHUSDT', price: 3410.20, change24h: -1.25 },
        { symbol: 'SOLUSDT', price: 154.60, change24h: 8.94 },
      ];
    } catch (err) {
      addTerminalLog('⚠️ Live Binance ticker fetch fallback active.');
      return [
        { symbol: 'BTCUSDT', price: 68420.50, change24h: 3.42 },
        { symbol: 'ETHUSDT', price: 3410.20, change24h: -1.25 },
        { symbol: 'SOLUSDT', price: 154.60, change24h: 8.94 },
        { symbol: 'BNBUSDT', price: 585.30, change24h: 0.12 },
        { symbol: 'ADAUSDT', price: 0.485, change24h: -2.31 },
        { symbol: 'XRPUSDT', price: 0.521, change24h: 1.05 },
        { symbol: 'DOGEUSDT', price: 0.142, change24h: 4.12 },
        { symbol: 'AVAXUSDT', price: 29.80, change24h: -0.45 },
        { symbol: 'DOTUSDT', price: 6.12, change24h: -3.85 },
        { symbol: 'MATICUSDT', price: 0.655, change24h: 0.54 },
        { symbol: 'NEARUSDT', price: 5.42, change24h: 2.15 },
        { symbol: 'SUIUSDT', price: 1.88, change24h: 6.40 },
        { symbol: 'APTUSDT', price: 8.90, change24h: -1.10 },
        { symbol: 'LINKUSDT', price: 14.25, change24h: 1.80 },
        { symbol: 'OPUSDT', price: 1.62, change24h: -0.90 },
        { symbol: 'ARBUSDT', price: 0.58, change24h: -2.40 },
        { symbol: 'PEPEUSDT', price: 0.0000095, change24h: 5.30 },
        { symbol: 'SHIBUSDT', price: 0.0000185, change24h: 1.20 },
        { symbol: 'FETUSDT', price: 1.34, change24h: 4.50 },
        { symbol: 'RENDERUSDT', price: 5.60, change24h: 3.10 },
      ];
    }
  };

  const fetchKlines = async (symbol: string, timeframe: Timeframe) => {
    // Convert timeframe to Binance formatting
    let binanceTf = timeframe.toLowerCase();
    if (binanceTf === '1h') binanceTf = '1h';
    if (binanceTf === '2h') binanceTf = '2h';
    if (binanceTf === '4h') binanceTf = '4h';
    if (binanceTf === '1d') binanceTf = '1d';

    try {
      // 250 candles is plenty for EMA 200 and indicators while saving 50% bandwidth
      const response = await fetch(
        `/api/binance/proxy?path=/fapi/v1/klines&symbol=${symbol}&interval=${binanceTf}&limit=250`
      );
      if (!response.ok) throw new Error();
      const klines = await response.json();

      return klines.map((k: any) => ({
        time: Math.floor(k[0] / 1000), // convert to seconds
        open: parseFloat(k[1]),
        high: parseFloat(k[2]),
        low: parseFloat(k[3]),
        close: parseFloat(k[4]),
        volume: parseFloat(k[5]),
      }));
    } catch (e) {
      // offline fallback builder with clear trends to trigger EMAs
      const now = Math.floor(Date.now() / 1000) - 250 * 14400;
      const arr = [];
      let lastPrice = symbol === 'BTCUSDT' ? 68000 : symbol === 'ETHUSDT' ? 3400 : 150;
      let trendCycle = Math.random() * Math.PI * 2;
      for (let i = 0; i < 250; i++) {
        trendCycle += 0.15; // advance oscillator
        const baseTrend = Math.sin(trendCycle) * lastPrice * 0.02; // 2% cyclical trend
        const noise = (Math.random() - 0.5) * lastPrice * 0.015; // 1.5% volatility
        const change = baseTrend + noise;
        const nextPrice = lastPrice + change;
        
        arr.push({
          time: now + i * 14400,
          open: lastPrice,
          high: Math.max(lastPrice, nextPrice) + Math.abs(noise),
          low: Math.min(lastPrice, nextPrice) - Math.abs(noise),
          close: nextPrice,
          volume: Math.random() * 10000 + 1000,
        });
        lastPrice = nextPrice;
      }
      return arr;
    }
  };

  const triggerUnifiedScan = async () => {
    if (scanning) return;
    setScanning(true);
    const countToScan = Math.max(10, Math.min(settingsRef.current.coinCount || 30, 100));
    addTerminalLog(`🔄 Initiating composite algorithmic scan over Top ${countToScan} pairs...`);

    const pairs = await fetchTopFuturesPairs();
    const finalCoinsList: CoinDetail[] = [];

    // Pre-fetch BTC klines on the user's configured timeframe for strategy context filtering
    let btcCandles: any[] = [];
    try {
      btcCandles = await fetchKlines('BTCUSDT', settingsRef.current.timeframe);
    } catch (e) {
      btcCandles = [];
    }

    // Process pairs in concurrent batches of 6 for lightning-fast scan waves
    const BATCH_SIZE = 6;
    for (let i = 0; i < pairs.length; i += BATCH_SIZE) {
      const batch = pairs.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map(async (pair) => {
          try {
            const candles = await fetchKlines(pair.symbol, settingsRef.current.timeframe);
            const fundingResponse = await fetch(`/api/binance/proxy?path=/fapi/v1/premiumIndex&symbol=${pair.symbol}`).catch(() => null);
            let fundingRate = 0.0001; // default 0.01%
            if (fundingResponse?.ok) {
              const premiumIdx = await fundingResponse.json();
              fundingRate = parseFloat(premiumIdx.lastFundingRate) || 0.0001;
            }

            // Run composite technical scoring checks
            const results = runScoringEngine(candles, {
              emaFast: settingsRef.current.emaFastPeriod,
              emaSlow: settingsRef.current.emaSlowPeriod,
              emaTrend: settingsRef.current.emaTrendPeriod,
              rsiPeriod: settingsRef.current.rsiPeriod,
              rsiOverbought: settingsRef.current.rsiLongMax, // Maps to RSI High Bound
              rsiOversold: settingsRef.current.rsiLongMin, // Maps to RSI Low Bound
              macdFast: settingsRef.current.macdFast,
              macdSlow: settingsRef.current.macdSlow,
              macdSignal: settingsRef.current.macdSignal,
              adxPeriod: settingsRef.current.adxPeriod,
              adxTrendThreshold: settingsRef.current.adxTrendThreshold,
              superTrendPeriod: settingsRef.current.superTrendPeriod,
              superTrendMultiplier: settingsRef.current.superTrendMultiplier,
              volumeMultiplier: settingsRef.current.volumeMultiplier,
              fibLookback: settingsRef.current.fibLookback,
            });

            let egpSignal = null;
            if (settingsRef.current.activeStrategy === 'EMA_GAP_PULLBACK') {
              egpSignal = findEmaGapSetup(candles, btcCandles, settingsRef.current);
            }

            let finalScore = results.score;
            let finalDirection = results.direction;
            let finalStatus = results.status;
            let finalReason = results.reason;
            let finalSl: number | undefined;
            let finalTp1: number | undefined;
            let finalTp2: number | undefined;
            let finalTp3: number | undefined;
            let vcbData: any = undefined;

            if (settingsRef.current.activeStrategy === 'EMA_GAP_PULLBACK') {
              if (egpSignal && egpSignal.status === 'confirmed') {
                finalScore = egpSignal.score || 85;
                finalDirection = egpSignal.direction || 'NEUTRAL';
                finalStatus = 'STRONG_TREND';
                finalReason = '5 EMA Gap (' + (egpSignal.reason || 'Confirmed') + ')';
              } else if (egpSignal && egpSignal.status === 'pullback_forming') {
                finalScore = 55;
                finalDirection = egpSignal.direction || 'NEUTRAL';
                finalStatus = 'TRANSITION';
                finalReason = 'Pullback Forming (' + (egpSignal.reason || 'Awaiting gap candle') + ')';
              } else {
                finalScore = Math.max(20, Math.min(48, Math.round((results.regime?.score || 30) * 0.4 + 15)));
                finalDirection = results.direction || 'NEUTRAL';
                finalStatus = results.status || 'RANGE';
                finalReason = egpSignal ? egpSignal.reason : 'Scanning for 5 EMA gap pullback';
              }
            } else if (settingsRef.current.activeStrategy === 'VOLATILITY_COMPRESSION' || settingsRef.current.activeStrategy === 'EARLY_COIL_BREAKOUT') {
              if (candles.length >= 30) {
                const coilSig = evaluateTwoSidedCoilBreakout(
                  candles,
                  btcCandles,
                  {
                    symbol: pair.symbol,
                    timeframe: settingsRef.current.timeframe,
                    minRrRatio: 5.0, // Strictly enforce genuine 1:5 reward-to-risk minimum
                    aggressiveBreakoutMode: (settingsRef.current as any).coilAggressiveBreakout === true
                  }
                );

                if (coilSig.status.startsWith('VALID')) {
                  finalScore = coilSig.score;
                  finalDirection = coilSig.side;
                  finalStatus = 'STRONG_TREND';
                  finalReason = `${coilSig.setup} (${coilSig.status}) - R:R 1:${coilSig.rrRatio.toFixed(1)}`;
                  finalSl = coilSig.stop;
                  finalTp1 = coilSig.target;
                  finalTp2 = coilSig.target;
                  finalTp3 = coilSig.target;

                  if (!loggedTriggerStatesRef.current.has(pair.symbol)) {
                    loggedTriggerStatesRef.current.add(pair.symbol);
                    addTerminalLog(coilSig.formattedOutput);
                    addToast('info', 'New Signal Triggered', `${coilSig.setup} ${coilSig.side} on ${pair.symbol} (1:${coilSig.rrRatio.toFixed(1)} RR)`, {
                      label: 'View Chart',
                      onClick: () => { setSelectedSymbol(pair.symbol); setActiveTab('chart'); }
                    });
                    if (settingsRef.current.alertOnNewSignal !== false) {
                      dispatchTelegramAlert(`📡 <b>NEW COIL SIGNAL: ${pair.symbol}</b>\n\n<pre>${coilSig.formattedOutput.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>`);
                    }
                  }
                } else if (coilSig.status.startsWith('WATCHLIST') || coilSig.status.startsWith('STATUS: WATCHLIST')) {
                  finalScore = coilSig.score;
                  finalDirection = 'NEUTRAL';
                  finalStatus = 'ARMED';
                  finalReason = coilSig.status;

                  if (!loggedArmedStatesRef.current.has(pair.symbol)) {
                    loggedArmedStatesRef.current.add(pair.symbol);
                    addTerminalLog(coilSig.formattedOutput);
                    addToast('info', 'Coil Watchlist', `Coil detected on ${pair.symbol} — awaiting breakout`, {
                      label: 'View Chart',
                      onClick: () => { setSelectedSymbol(pair.symbol); setActiveTab('chart'); }
                    });
                  }
                } else {
                  finalScore = coilSig.score;
                  finalDirection = coilSig.side || 'NEUTRAL';
                  finalStatus = 'RANGE';
                  finalReason = coilSig.rejectionReason || coilSig.status;
                }

                vcbData = {
                  isCompressed: coilSig.coil.isCoil,
                  windowHigh: coilSig.coil.coilHigh,
                  windowLow: coilSig.coil.coilLow,
                  startTime: candles[coilSig.coil.coilStartIndex]?.time || 0,
                  endTime: candles[coilSig.coil.coilEndIndex]?.time || 0,
                  priorTrend: coilSig.marketFilter,
                  priorImpulseMove: coilSig.coil.higherLowsPreference ? 'BULLISH' : (coilSig.coil.lowerHighsPreference ? 'BEARISH' : 'NEUTRAL'),
                  breakout: coilSig.status.startsWith('VALID') ? {
                    direction: coilSig.side,
                    entryPrice: coilSig.entry,
                    sl: coilSig.stop,
                    tp1: coilSig.target,
                    tp2: coilSig.target,
                    tp3: coilSig.target,
                    rvol: 1.5,
                  } : undefined,
                };
              }
            } else if (settingsRef.current.activeStrategy === 'SMC_LIQUIDITY_SWEEP' || settingsRef.current.activeStrategy === 'LIQUIDITY_SWEEP_REVERSAL') {
              const smcSig = evaluateSmc(candles, [], pair.price, {
                structureLen: settingsRef.current.smcStructureLen,
                wickRatio: settingsRef.current.smcWickRatio,
                minSweepWickPct: settingsRef.current.smcMinSweepWickPct,
                dispAtrMult: settingsRef.current.smcDispAtrMult,
                sweepConfirmWindow: settingsRef.current.smcSweepConfirmWindow,
                volMult: settingsRef.current.smcVolMult,
                fvgAfterMssWindow: settingsRef.current.smcFvgAfterMssWindow,
                obLookback: settingsRef.current.smcObLookback,
                useKillZone: settingsRef.current.smcUseKillZone,
                atrStopMult: settingsRef.current.smcAtrStopMult,
                rrRatio: settingsRef.current.smcRrRatio,
                symbol: pair.symbol
              });
              if (smcSig) {
                const inZone = pair.price >= smcSig.entryZoneMin * 0.999 && pair.price <= smcSig.entryZoneMax * 1.001;
                if (inZone) {
                  finalScore = smcSig.score;
                  finalDirection = smcSig.direction;
                  finalStatus = 'STRONG_TREND';
                  finalReason = smcSig.reason;
                  finalSl = smcSig.sl;
                  finalTp1 = smcSig.tp1;
                  finalTp2 = smcSig.tp2;
                  const risk = smcSig.risk || Math.abs(pair.price - finalSl);
                  finalTp3 = smcSig.tp3 || (finalDirection === 'LONG' ? pair.price + (risk * 5) : pair.price - (risk * 5));

                  if (!loggedTriggerStatesRef.current.has(pair.symbol)) {
                    loggedTriggerStatesRef.current.add(pair.symbol);
                    const riskPerUnit = risk.toFixed(5);
                    const tp1R = (Math.abs(finalTp1 - pair.price) / risk).toFixed(1);
                    const msg = `[LSR PAPER TRADE — ${finalDirection}]
Symbol: ${pair.symbol}
Setup Timeframe: ${settingsRef.current.timeframe}
Status: TRIGGERED

Entry Mode: FVG_RETEST
Entry: ${pair.price}
Stop-Loss: ${finalSl.toFixed(5)}
Risk per Unit: ${riskPerUnit}

TP1: ${finalTp1.toFixed(5)} (${tp1R}R, 40%)
TP2: ${finalTp2.toFixed(5)} (3.0R, 40%)
TP3 / Runner: ${finalTp3.toFixed(5)} (Runner, 20%)

Exposure Status: APPROVED\nReason Passed: ${finalReason}`;
                    addTerminalLog(msg);
                    addToast('info', 'New Signal Triggered', `LSR ${finalDirection} on ${pair.symbol}`, { label: 'View Chart', onClick: () => { setSelectedSymbol(pair.symbol); setActiveTab('chart'); } });
                    if (settingsRef.current.alertOnNewSignal !== false) {
                      dispatchTelegramAlert(`📡 <b>NEW SIGNAL: ${pair.symbol}</b>\n\n<pre>${msg.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>`);
                    }
                  }
                } else {
                  finalScore = 65;
                  finalDirection = smcSig.direction;
                  finalStatus = 'ARMED';
                  finalReason = `LSR ARMED (${smcSig.direction}) - Waiting for FVG Retest (${smcSig.entryZoneMin.toFixed(2)} - ${smcSig.entryZoneMax.toFixed(2)})`;
                  
                  if (!loggedArmedStatesRef.current.has(pair.symbol)) {
                    loggedArmedStatesRef.current.add(pair.symbol);
                    const msg = `[LSR ARMED — NO PAPER TRADE YET]
Symbol: ${pair.symbol}
Setup Timeframe: ${settingsRef.current.timeframe}
Setup Detected: ${smcSig.reason}
FVG Entry Zone: ${smcSig.entryZoneMin.toFixed(5)} to ${smcSig.entryZoneMax.toFixed(5)}
Current Price: ${pair.price}
Status: ARMED — WAIT FOR RETEST INTO ENTRY ZONE`;
                    addTerminalLog(msg);
                    addToast('info', 'Signal Armed', `LSR Armed on ${pair.symbol}`, { label: 'View Chart', onClick: () => { setSelectedSymbol(pair.symbol); setActiveTab('chart'); } });
                  }
                }
              } else {
                finalScore = Math.max(20, Math.min(48, Math.round((results.regime?.score || 30) * 0.4 + 15)));
                finalDirection = results.direction || 'NEUTRAL';
                finalStatus = 'RANGE';
                finalReason = 'Scanning for Liquidity Sweep (LSR)';
              }
            } else if (settingsRef.current.activeStrategy === 'TREND_PULLBACK') {
              if (candles.length >= 35) {
                const previousCandles = candles.slice(0, -1);
                const tpbEval = evaluateTrendPullbackDetailed(
                  previousCandles,
                  null,
                  pair.price,
                  {
                    tradeTimeframe: settingsRef.current.timeframe,
                    symbol: pair.symbol,
                    emaFast: settingsRef.current.tpbEmaFast || 20,
                    emaSlow: settingsRef.current.tpbEmaSlow || 50,
                    adxMin: settingsRef.current.tpbAdxMin || 18,
                    volSmaPeriod: settingsRef.current.tpbVolumeSmaPeriod || 20,
                    minVolumeRatio: settingsRef.current.tpbMinVolumeRatio || 1.0,
                    requireVolume: settingsRef.current.tpbRequireVolume !== false,
                    unconfirmedVolumeMode: settingsRef.current.tpbAllowUnconfirmedVolume === true,
                    maxEntryDistanceAtr: settingsRef.current.tpbMaxEntryDistanceAtr ?? 0.25,
                    minStopDistanceAtr: settingsRef.current.tpbMinStopDistanceAtr ?? 0.8,
                    maxStopDistanceAtr: settingsRef.current.tpbMaxStopDistanceAtr ?? 3.0,
                    allowBroadStop: settingsRef.current.tpbAllowBroadStop === true,
                    atrBufferMult: settingsRef.current.tpbAtrBuffer ?? 0.3,
                    maxSpreadAtr: settingsRef.current.tpbMaxSpreadAtr ?? 0.3,
                    allowLongs: settingsRef.current.tpbAllowLongs !== false,
                    allowShorts: settingsRef.current.tpbAllowShorts !== false,
                    minRrRatio: settingsRef.current.tpbMinRrRatio || 1.5,
                    minScore: settingsRef.current.tpbMinScore || 8
                  }
                );

                if (tpbEval.success && tpbEval.result) {
                  finalScore = Math.min(100, Math.round((tpbEval.score / 15) * 100));
                  finalDirection = tpbEval.result.direction;
                  finalStatus = 'STRONG_TREND';
                  finalReason = tpbEval.reason;
                  finalSl = tpbEval.result.sl;
                  finalTp1 = tpbEval.result.tp1;
                  finalTp2 = tpbEval.result.tp2;
                  finalTp3 = tpbEval.result.tp3;

                  if (!loggedTriggerStatesRef.current.has(pair.symbol)) {
                    loggedTriggerStatesRef.current.add(pair.symbol);
                    const riskPerUnit = Math.abs(pair.price - finalSl).toFixed(5);
                    const tp1R = (Math.abs(finalTp1 - pair.price) / Math.abs(pair.price - finalSl)).toFixed(1);
                    const msg = `[TREND PULLBACK PAPER TRADE — ${finalDirection}]
Symbol: ${pair.symbol}
Setup Timeframe: ${settingsRef.current.timeframe}
Status: TRIGGERED

Reason: ${finalReason}
Entry: ${pair.price}
Stop-Loss: ${finalSl.toFixed(5)}
Risk per Unit: ${riskPerUnit}

TP1: ${finalTp1.toFixed(5)} (${tp1R}R, 40%)
TP2: ${finalTp2.toFixed(5)} (2.5R, 40%)
TP3 / Runner: ${finalTp3.toFixed(5)} (Runner, 20%)`;
                    addTerminalLog(msg);
                    addToast('info', 'New Signal Triggered', `Trend Pullback ${finalDirection} on ${pair.symbol}`, { label: 'View Chart', onClick: () => { setSelectedSymbol(pair.symbol); setActiveTab('chart'); } });
                    if (settingsRef.current.alertOnNewSignal !== false) {
                      dispatchTelegramAlert(`📡 <b>NEW SIGNAL: ${pair.symbol}</b>\n\n<pre>${msg.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>`);
                    }
                  }
                } else if (tpbEval.stage === 'STAGE_A_SETUP_DETECTED' || tpbEval.state === 'RETEST_HELD' || tpbEval.state === 'RETEST_DETECTED') {
                  finalScore = 65;
                  finalDirection = results.direction || 'NEUTRAL';
                  finalStatus = 'ARMED';
                  finalReason = `TPB ARMED: ${tpbEval.reason}`;
                } else {
                  finalScore = Math.max(20, Math.min(48, Math.round((results.regime?.score || 30) * 0.4 + 15)));
                  finalDirection = results.direction || 'NEUTRAL';
                  finalStatus = 'RANGE';
                  finalReason = tpbEval.reason || 'Scanning for Trend Retest';
                }
              }
            }

            if (!vcbData && candles.length >= 35) {
              const previousCandles = candles.slice(0, -1);
              const atr = results.indicators?.atr || pair.price * 0.015;
              const compression = detectCompression(previousCandles, atr, atr, settingsRef.current);
              vcbData = {
                isCompressed: compression.isCompressed,
                windowHigh: compression.windowHigh,
                windowLow: compression.windowLow,
                startTime: compression.startTime,
                endTime: compression.endTime,
                priorTrend: compression.priorTrend,
                priorImpulseMove: compression.priorImpulseMove,
              };
            }

            return {
              symbol: pair.symbol,
              price: pair.price,
              change24h: pair.change24h,
              score: finalScore,
              direction: finalDirection,
              status: finalStatus,
              statusReason: finalReason,
              fundingRate,
              indicators: results.indicators,
              gates: results.gates,
              wmPattern: results.wmPattern,
              egpSignal,
              candles,
              sl: finalSl,
              tp1: finalTp1,
              tp2: finalTp2,
              tp3: finalTp3,
              vcb: vcbData,
            } as CoinDetail;
          } catch (e) {
            return null;
          }
        })
      );

      batchResults.forEach((res) => {
        if (res) finalCoinsList.push(res);
      });
    }

    setCoins(finalCoinsList);
    setScanTime(new Date().toLocaleTimeString());
    setScanning(false);
    addTerminalLog(`⚡ Scan complete: Analyzed ${finalCoinsList.length} cryptocurrency pairs.`);

    // Check if auto-trade applies
    // processAutoTradingRules(finalCoinsList); // Disabled on frontend to prevent conflict with 24/7 backend
  };

  
  // --- AUTOMATED FUTURES TRADE EXECUTION ---
  const pendingOrdersRef = useRef<Set<string>>(new Set());

  const processAutoTradingRules = (scannedList: CoinDetail[]) => {
    if (!engineRunning || !settingsRef.current.autoTradeEnabled) return;
    const triggers = scannedList.filter((c) => {
      const hasActive = positionsRef.current.some((p) => p.symbol === c.symbol);
      if (hasActive || pendingOrdersRef.current.has(c.symbol)) return false;
      
      // Use active strategy to determine triggers
      if (settingsRef.current.activeStrategy === 'EMA_GAP_PULLBACK') {
         if (c.egpSignal && c.egpSignal.status === 'confirmed') {
            return true;
         }
         return false;
      }

      if (settingsRef.current.activeStrategy === 'VOLATILITY_COMPRESSION' || settingsRef.current.activeStrategy === 'EARLY_COIL_BREAKOUT') {
         return c.score >= settingsRef.current.autoTradeThreshold && (c.direction === 'LONG' || c.direction === 'SHORT') && c.status === 'STRONG_TREND' && !!c.sl && !!c.tp1;
      }
      
      const allGatesPassed = c.statusReason === 'All gates passed';
      return allGatesPassed && c.score >= settingsRef.current.autoTradeThreshold && (c.direction === 'LONG' || c.direction === 'SHORT');
    });

    triggers.forEach(t => {
      if (positionsRef.current.length + pendingOrdersRef.current.size < settingsRef.current.maxConcurrentTrades) {
        openPosition(t);
      }
    });
  };

  const openPosition = async (coin: CoinDetail) => {
    if (!engineRunning || !settingsRef.current.autoTradeEnabled) {
      addTerminalLog(`🛑 Execution blocked: Trading engine is STOPPED. Cannot execute trade for ${coin.symbol}.`);
      return;
    }
    if (pendingOrdersRef.current.has(coin.symbol)) return;
    pendingOrdersRef.current.add(coin.symbol);

    try {
      let riskAmt = balance * (settingsRef.current.positionSizePct / 100);
      const leverage = settingsRef.current.leverage || 1;
      let posSize = riskAmt * leverage;
      let qty = posSize / coin.price;
      
      let finalDirection = coin.direction;
      let finalScore = coin.score;
      let finalAtr = coin.indicators.atr;
      
      let activeStrat = settingsRef.current.activeStrategy || 'BINANCE_COMPOSITE';
      let marketRegime: string | undefined = undefined;
      let isAutoRegime = activeStrat === 'AUTO_REGIME';
      let sl = (coin.egpSignal as any)?.stop;
      let tp1 = (coin.egpSignal as any)?.tp1;
      let tp2 = (coin.egpSignal as any)?.tp2;
      let tp3 = (coin.egpSignal as any)?.tp3;

      if (activeStrat === 'EMA_GAP_PULLBACK' && coin.egpSignal && coin.egpSignal.status === 'confirmed') {
         marketRegime = '5 EMA Trend Continuation';
         finalDirection = coin.egpSignal.direction;
         finalScore = coin.egpSignal.score || 95;
         finalAtr = (coin.egpSignal as any).atr || finalAtr;
         
         // In 5 EMA Gap strategy, risk is calculated per unit.
         const riskPerUnit = (coin.egpSignal as any).riskPerUnit || (coin.price * 0.01);
         riskAmt = balance * (settingsRef.current.accountRiskPct / 100);
         qty = riskAmt / riskPerUnit;
      } else if (activeStrat === 'VOLATILITY_COMPRESSION' || activeStrat === 'EARLY_COIL_BREAKOUT') {
         marketRegime = 'Two-Sided Coil Breakout';
         sl = (coin as any)?.sl || sl;
         tp1 = (coin as any)?.tp1 || tp1;
         tp2 = (coin as any)?.tp2 || tp2;
         tp3 = (coin as any)?.tp3 || tp3;
      } else if (activeStrat === 'TREND_PULLBACK') {
         marketRegime = 'Trending [EMA Pullback]';
         sl = (coin as any)?.sl || sl;
         tp1 = (coin as any)?.tp1 || tp1;
      } else if (activeStrat === 'SMC_LIQUIDITY_SWEEP') {
         marketRegime = 'Liquidity Hunt / FVG Reversal';
         sl = (coin as any)?.sl || sl;
         tp1 = (coin as any)?.tp1 || tp1;
      } else if (activeStrat === 'AUTO_REGIME') {
         marketRegime = (coin as any)?.marketRegime || 'Auto Dynamic Regime';
         activeStrat = (coin as any)?.strategy || 'BINANCE_COMPOSITE';
      } else {
         activeStrat = 'BINANCE_COMPOSITE';
         marketRegime = 'Trending [10-Gate Momentum]';
      }

      if (!finalDirection || (finalDirection !== 'LONG' && finalDirection !== 'SHORT')) {
        addTerminalLog(`⚠️ Cannot trade ${coin.symbol}: direction is ${finalDirection || 'undefined'}`);
        return;
      }

      if (!coin.price || coin.price <= 0 || !qty || isNaN(qty) || qty <= 0) {
        addTerminalLog(`⚠️ Cannot trade ${coin.symbol}: invalid price or quantity`);
        return;
      }
      
      const res = await fetch('/api/bot/trade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: coin.symbol,
          direction: finalDirection,
          price: coin.price,
          quantity: qty,
          leverage,
          allocatedBalance: riskAmt,
          score: finalScore,
          atr: finalAtr,
          sl,
          tp1,
          tp2,
          tp3,
          strategy: activeStrat,
          marketRegime,
          isAutoRegime,
          frequencyPreset: settingsRef.current.tradeFrequency || 'MEDIUM'
        })
      });
      const data = await res.json();
      if (data.success) {
        addTerminalLog(`🟢 OPEN ${finalDirection} on ${coin.symbol} @ ${formatPrice(coin.price)} [ID: ${data.posId}]`);
        addToast('trade', 'Trade Executed', `Opened ${finalDirection} on ${coin.symbol} at ${formatPrice(coin.price)}`, { label: 'View Position', onClick: () => setActiveTab('positions') });
        fetchPositions();
      } else {
        addTerminalLog(`🔴 FAILED TO OPEN ${coin.symbol}: ${data.error || 'Unknown error'}`);
        addToast('error', 'Execution Failed', `Failed to open ${coin.symbol}: ${data.error}`);
      }
    } catch (e) {
      addTerminalLog(`🔴 FAILED TO OPEN ${coin.symbol}: Network/API error`);
      addToast('error', 'Execution Failed', `API error while opening ${coin.symbol}`);
    } finally {
      pendingOrdersRef.current.delete(coin.symbol);
    }
  };

  const handleManualClose = async (id: string) => {
    try {
      const pos = positions.find(p => p.id === id);
      if (!pos) return;
      const res = await fetch('/api/bot/close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          currentPrice: pos.currentPrice,
          reason: 'MANUAL'
        })
      });
      if (res.ok) {
         addToast('success', 'Manual Exit', `Successfully submitted market close order for ${pos.symbol}`);
         fetchPositions();
      } else {
         const data = await res.json();
         addToast('error', 'Exit Failed', `Failed to close ${pos.symbol}: ${data.error || 'Unknown error'}`);
      }
    } catch(e) {
      console.error(e);
      addToast('error', 'Exit Failed', 'Network or API error occurred while closing position.');
    }
  };

  const handleFlatten = async () => {
    try {
      await fetch('/api/bot/flatten', { method: 'POST' });
      fetchPositions();
    } catch(e) {
      console.error(e);
    }
  };

  const fetchTradeLogs = async () => {
    try {
      const res = await fetch('/api/trade_logs');
      if (res.ok) {
        const data = await res.json();
        const mapped = data.map((p: any, idx: number) => ({
          id: p.id || `log-${p.symbol || 'SYM'}-${p.time_close || p.timestamp || Date.now()}-${idx}`,
          symbol: p.symbol,
          direction: p.direction,
          strategy: p.strategy || 'BINANCE_COMPOSITE',
          marketRegime: p.market_regime || undefined,
          isAutoRegime: !!p.is_auto_regime,
          frequencyPreset: p.frequency_preset || 'LOW',
          entryPrice: p.entry_price,
          closePrice: p.close_price,
          leverage: p.leverage,
          profit: p.profit,
          pctReturn: p.pct_return || 0,
          exitReason: p.exit_reason,
          timeOpen: p.time_open || p.timestamp,
          timeClose: p.time_close || p.timestamp,
          scoreAtEntry: p.score_at_entry || 0,
          scoreAtClose: 0
        }));
        setTradeLogs(mapped);
      }
    } catch(e) {}
  };

  const fetchPositions = async () => {
    try {
      const res = await fetch('/api/positions');
      if (res.ok) {
        const data = await res.json();
        setPositions(mapRawPositionsToFrontend(data));
      }
    } catch (e) {}
  };

  const fetchBalance = async () => {
    try {
      const res = await fetch('/api/bot/balance');
      if (res.ok) {
        const data = await res.json();
        if (data.demoBalance !== undefined) setBalance(data.demoBalance);
        if (data.equitySnapshots) setEquitySnapshots(data.equitySnapshots);
      }
    } catch (e) {}
  };

  const fetchHealth = async () => {
    try {
      const res = await fetch('/api/health');
      if (res.ok) {
        const data = await res.json();
        setSystemHealth(data);
      }
    } catch (e) {}
  };

  const handleResetBalance = async () => {
    try {
      await fetch('/api/bot/reset', { method: 'POST' });
    } catch (e) {}
    setBalance(settings.startingBalance);
    setPositions([]);
    setTradeLogs([]);
    setEquitySnapshots([]);
  };

  const handleResetSettings = () => {
    // D2 fix: Require confirmation before wiping all settings to defaults
    const confirmed = window.confirm(
      '⚠️ RESET ALL SETTINGS TO DEFAULTS?\n\n' +
      'This will reset ALL trading parameters (risk, strategy, indicators, gates) to factory defaults.\n' +
      'Your API credentials will be preserved.\n\n' +
      'This action is immediate and will be saved to the server.'
    );
    if (!confirmed) return;

    const resetSettings: AppSettings = {
      ...INITIAL_SETTINGS,
      telegramBotToken: settings.telegramBotToken || '',
      telegramChatId: settings.telegramChatId || '',
      binanceApiKey: settings.binanceApiKey || '',
      binanceApiSecret: settings.binanceApiSecret || '',
    };
    setSettings(resetSettings);
    // Since auto-sync was removed (D3), explicitly save the reset to server
    fetch('/api/bot/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(resetSettings)
    }).then(res => {
      if (res.ok) {
        addToast('info', 'Settings Reset', 'All settings restored to defaults and saved.');
      } else {
        addToast('error', 'Reset Error', 'Settings reset locally but failed to save to server.');
      }
    }).catch(() => {
      addToast('error', 'Reset Error', 'Settings reset locally but failed to save to server.');
    });
  };

  const handleDisableKillSwitch = async () => {
    const updated = { ...settings, killSwitchActive: false };
    setSettings(updated);
    try {
      await fetch('/api/bot/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ killSwitchActive: false })
      });
      addToast('info', 'Kill Switch Disengaged', 'Emergency kill switch deactivated.');
    } catch (e) {
      console.error(e);
    }
  };

  const handleRefreshFeed = () => {
    fetch('/api/binance/proxy?path=/fapi/v1/ticker/price')
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) {
          setIsStale(false);
          setConnectionStatus('CONNECTED');
          addToast('success', 'Feed Connected', 'Market data ticks synchronized.');
        }
      })
      .catch(() => {
        addToast('error', 'Feed Error', 'Unable to reconnect to price stream.');
      });
  };

  const handleRetrySettings = () => {
    setSettingsLoadError(null);
    window.location.reload();
  };

  // Load initial backend state & Poll positions/balance
  useEffect(() => {
    fetchPositions();
    fetchTradeLogs();
    fetchBalance();
    fetchHealth();
    
    // Poll backend every 4 seconds to sync positions closed/opened by 24/7 background engine
    const syncInterval = setInterval(() => {
      fetchPositions();
      fetchBalance();
      fetchHealth();
    }, 4000);

    // Poll trade history every 10 seconds
    const logsInterval = setInterval(() => {
      fetchTradeLogs();
    }, 10000);
    
    return () => {
      clearInterval(syncInterval);
      clearInterval(logsInterval);
    };
  }, []);

  // Multi-source Resilient WebSocket & Polling Price Sync Engine
  useEffect(() => {
    let active = true;
    let binanceWs: WebSocket | null = null;
    let serverWs: WebSocket | null = null;
    let pollTimeout: NodeJS.Timeout | null = null;
    let lastUpdateTime = Date.now();

    const handlePriceBatch = (data: any) => {
      if (!data) return;
      lastUpdateTime = Date.now();
      setIsStale(false);
      setConnectionStatus('CONNECTED');
      const priceMap = new Map<string, number>();

      if (Array.isArray(data)) {
        for (const item of data) {
          const sym = item.s || item.symbol;
          const rawPrice = item.p !== undefined ? item.p : (item.c !== undefined ? item.c : item.price);
          if (sym && rawPrice !== undefined) {
            const num = typeof rawPrice === 'number' ? rawPrice : parseFloat(rawPrice);
            if (!isNaN(num) && num > 0) {
              priceMap.set(sym, num);
            }
          }
        }
      }

      if (priceMap.size === 0) return;

      setCoins((prevCoins) => {
        let changed = false;
        const next = prevCoins.map((c) => {
          if (priceMap.has(c.symbol)) {
            const newP = priceMap.get(c.symbol)!;
            if (Math.abs(c.price - newP) > 0.00000001) {
              changed = true;
              return { ...c, price: newP };
            }
          }
          return c;
        });
        return changed ? next : prevCoins;
      });

      setPositions((prev) => {
        const next = [...prev];
        let changed = false;
        next.forEach((p) => {
          if (priceMap.has(p.symbol)) {
            const newPrice = priceMap.get(p.symbol)!;
            if (Math.abs(newPrice - p.currentPrice) > 0.00000001) {
              const isLong = p.direction === 'LONG';
              const priceDeltaPct = p.entryPrice > 0 ? (isLong ? (newPrice - p.entryPrice) / p.entryPrice : (p.entryPrice - newPrice) / p.entryPrice) : 0;
              const pnl = priceDeltaPct * p.allocatedBalance * p.leverage;
              p.currentPrice = newPrice;
              p.unrealizedPnl = pnl;
              p.lastUpdated = Date.now();
              changed = true;

              // Check SL / TP
              let exitReason = null;
              if (isLong) {
                if (newPrice <= p.sl) exitReason = 'SL';
                else if (p.tp3 > 0 && newPrice >= p.tp3) exitReason = 'TP3';
              } else {
                if (newPrice >= p.sl) exitReason = 'SL';
                else if (p.tp3 > 0 && newPrice <= p.tp3) exitReason = 'TP3';
              }

              if (exitReason) {
                fetch('/api/bot/close', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ id: p.id, currentPrice: newPrice, reason: exitReason }),
                }).then(() => {
                  if (exitReason === 'SL') addToast('error', 'Stop Loss Hit', `Closed ${p.symbol} at ${formatPrice(newPrice)}`);
                  else if (exitReason === 'TP3') addToast('success', 'Take Profit Hit', `Closed ${p.symbol} at ${formatPrice(newPrice)}`);
                  addTerminalLog(`🔴 CLOSED ${p.symbol} [${exitReason}]`);
                  fetchPositions();
                  fetchTradeLogs();
                });
              }
            }
          }
        });
        return changed ? next : prev;
      });
    };

    // 1. Direct Binance Futures WebSocket connection (Browser -> Binance)
    const connectBinanceWs = () => {
      if (!active) return;
      try {
        binanceWs = new WebSocket('wss://fstream.binance.com/ws/!miniTicker@arr');

        binanceWs.onopen = () => {
          if (active) {
            setConnectionStatus('CONNECTED');
            setIsStale(false);
          }
        };

        binanceWs.onmessage = (event) => {
          if (!active) return;
          try {
            const data = JSON.parse(event.data);
            handlePriceBatch(data);
          } catch (err) {}
        };

        binanceWs.onerror = () => {
          // If direct WebSocket is blocked or fails, server WebSocket and polling seamlessly handle it
        };

        binanceWs.onclose = () => {
          if (active) {
            setTimeout(connectBinanceWs, 3000);
          }
        };
      } catch (e) {}
    };

    // 2. Server bridge WebSocket connection (Browser -> Express Server)
    const connectServerWs = () => {
      if (!active) return;
      try {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws/binance`;
        serverWs = new WebSocket(wsUrl);

        serverWs.onopen = () => {
          if (active) {
            setConnectionStatus('CONNECTED');
            setIsStale(false);
          }
        };

        serverWs.onmessage = (event) => {
          if (!active) return;
          try {
            const data = JSON.parse(event.data);
            if (Array.isArray(data)) {
              handlePriceBatch(data);
            } else if (data && typeof data === 'object') {
              if (data.type === 'PRICE_BATCH' && Array.isArray(data.data)) {
                handlePriceBatch(data.data);
              } else if (data.type === 'SETTINGS_UPDATE' && data.data) {
                const s = data.data;
                if (s.autoTradeEnabled !== undefined) {
                  setEngineRunning(s.autoTradeEnabled !== false);
                }
                setSettings((prev) => mergeServerSettingsWithLocal(prev, s));
              } else if (data.type === 'ENGINE_STATUS' && data.data) {
                if (data.data.engineRunning !== undefined) {
                  setEngineRunning(data.data.engineRunning);
                }
                if (data.data.autoTradeEnabled !== undefined) {
                  setSettings(prev => prev.autoTradeEnabled === data.data.autoTradeEnabled ? prev : { ...prev, autoTradeEnabled: data.data.autoTradeEnabled });
                }
                if (data.data.globalFilterActive !== undefined) {
                  setGlobalFilterState({
                    isPausing: !!data.data.globalFilterActive,
                    reason: data.data.globalFilterReason || null
                  });
                }
              } else if (data.type === 'POSITIONS_UPDATE' && Array.isArray(data.data)) {
                setPositions(mapRawPositionsToFrontend(data.data));
              } else if (data.type === 'BALANCE_UPDATE' && data.data) {
                if (data.data.demoBalance !== undefined) {
                  setBalance(data.data.demoBalance);
                }
                if (Array.isArray(data.data.equitySnapshots)) {
                  setEquitySnapshots(data.data.equitySnapshots);
                }
              }
            }
          } catch (err) {}
        };

        serverWs.onerror = () => {};

        serverWs.onclose = () => {
          if (active) {
            setTimeout(connectServerWs, 4000);
          }
        };
      } catch (e) {}
    };

    connectBinanceWs();
    connectServerWs();

    // 3. Fallback active poller: ensures non-stop fresh prices even in restricted networks
    const runFallbackPoll = async () => {
      if (!active) return;
      const isHidden = typeof document !== 'undefined' && document.hidden;
      const pollDelay = isHidden ? 8000 : 2500;

      const timeSinceUpdate = Date.now() - lastUpdateTime;
      
      // If WebSockets are silently hanging (no updates for 15s), force reconnect them
      if (timeSinceUpdate > 15000) {
        if (binanceWs) {
          try { binanceWs.close(); } catch (e) {}
        }
        if (serverWs) {
          try { serverWs.close(); } catch (e) {}
        }
        // Force reset the last update time so we don't spam reconnects
        lastUpdateTime = Date.now();
      } else if (timeSinceUpdate > 3000) {
        // If no updates in last 3 seconds from WebSocket, poll directly via Public Market APIs 
        // Bypassing Render's network routing entirely to prevent stale drops
        let success = false;
        
        try {
          // Attempt 1: Direct Browser-to-Binance (CORS allowed)
          const binanceDirectRes = await fetch('https://fapi.binance.com/fapi/v1/ticker/price');
          if (binanceDirectRes.ok) {
            const data = await binanceDirectRes.json();
            handlePriceBatch(data);
            success = true;
          }
        } catch(e) { }

        if (!success) {
          try {
            // Attempt 2: Binance Proxy through our backend
            const proxyRes = await fetch('/api/binance/proxy?path=/fapi/v1/ticker/price');
            if (proxyRes.ok) {
              const data = await proxyRes.json();
              handlePriceBatch(data);
              success = true;
            }
          } catch(e) { }
        }

        if (!success) {
          try {
            // Attempt 3: Bot's internal price memory (which includes CoinDCX fallback)
            const botRes = await fetch('/api/bot/prices');
            if (botRes.ok) {
              const data = await botRes.json();
              handlePriceBatch(data);
            }
          } catch(e) { }
        }
      }

      if (active) {
        pollTimeout = setTimeout(runFallbackPoll, pollDelay);
      }
    };

    // Initial immediate price fetch
    fetch('/api/binance/proxy?path=/fapi/v1/ticker/price')
      .then(r => r.json())
      .then(data => handlePriceBatch(data))
      .catch(() => {
        fetch('/api/bot/prices')
          .then(r => r.json())
          .then(data => handlePriceBatch(data))
          .catch(() => {});
      });

    pollTimeout = setTimeout(runFallbackPoll, 2500);

    const heartbeatInterval = setInterval(() => {
      const diff = Date.now() - lastUpdateTime;
      if (diff > 25000) {
        setIsStale(true);
      } else {
        setIsStale(false);
      }
    }, 2000);

    return () => {
      active = false;
      if (binanceWs) {
        binanceWs.close();
        binanceWs = null;
      }
      if (serverWs) {
        serverWs.close();
        serverWs = null;
      }
      if (pollTimeout) clearTimeout(pollTimeout);
      clearInterval(heartbeatInterval);
    };
  }, []);

  const [engineRunning, setEngineRunning] = useState(true);
  const [isStale, setIsStale] = useState(false);
  const [globalFilterState, setGlobalFilterState] = useState<{
    isPausing: boolean;
    reason: string | null;
  }>({ isPausing: false, reason: null });

  // Periodically check engine status and Global Market Safety Filter state
  useEffect(() => {
    let isMounted = true;
    const fetchStatus = async () => {
      try {
        const res = await fetch('/api/bot/engine/status');
        if (res.ok) {
          const data = await res.json();
          if (isMounted) {
            if (data.globalFilterActive !== undefined) {
              setGlobalFilterState({
                isPausing: !!data.globalFilterActive,
                reason: data.globalFilterReason || null
              });
            }
            if (data.engineRunning !== undefined) {
              setEngineRunning(data.engineRunning);
            }
            if (data.autoTradeEnabled !== undefined) {
              setSettings(prev => prev.autoTradeEnabled === data.autoTradeEnabled ? prev : { ...prev, autoTradeEnabled: data.autoTradeEnabled });
            }
          }
        }
      } catch (e) {
        // silent
      }
    };
    fetchStatus();
    const interval = setInterval(() => {
      fetchStatus();
      reloadSettings();
    }, 8000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [reloadSettings]);

  // Synchronize engine state with settings.autoTradeEnabled
  useEffect(() => {
    if (settings.autoTradeEnabled !== undefined && settings.autoTradeEnabled !== engineRunning) {
      setEngineRunning(settings.autoTradeEnabled);
    }
  }, [settings.autoTradeEnabled]);

  // Master engine control: toggles backend and frontend scanning & execution
  const toggleEngine = async () => {
    const nextState = !engineRunning;
    setEngineRunning(nextState);
    setSettings((prev) => ({ ...prev, autoTradeEnabled: nextState }));

    addTerminalLog(
      nextState
        ? '▶️ Trading Engine STARTED. Autonomous scanning & new trade execution active.'
        : '🛑 Trading Engine STOPPED. All new trade executions immediately halted. Existing positions remain actively monitored.'
    );

    try {
      const endpoint = nextState ? '/api/bot/engine/start' : '/api/bot/engine/stop';
      await fetch(endpoint, { method: 'POST' });
    } catch (e) {
      console.warn('Failed to toggle engine on backend:', e);
    }
  };

  // Main scanner loop — waits for server settings to load before first scan
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    if (engineRunning && hasLoadedServerSettings) {
      triggerUnifiedScan();
      interval = setInterval(() => {
        triggerUnifiedScan();
      }, settings.scanInterval * 1000);
    }
    return () => clearInterval(interval);
  }, [engineRunning, settings.scanInterval, hasLoadedServerSettings]);

  const currentCoinDetail = coins.find(c => c.symbol === selectedSymbol) || coins[0];
  const totalAccountValue = balance + positions.reduce((acc, p) => acc + p.allocatedBalance + p.unrealizedPnl, 0);

  // Live dynamic risk & daily loss metrics
  const totalOpenRiskDollars = positions.reduce((acc, p) => {
    const lev = p.leverage || settings.leverage || 1;
    const notional = (p.allocatedBalance || 0) * lev;
    if (p.stopLoss && p.entryPrice && p.entryPrice > 0) {
      const slDist = Math.abs(p.entryPrice - p.stopLoss) / p.entryPrice;
      return acc + (notional * slDist);
    }
    return acc + (p.allocatedBalance || 0);
  }, 0);
  const openRiskPct = totalAccountValue > 0 ? (totalOpenRiskDollars / totalAccountValue) * 100 : 0;
  const currentDailyLossPct = systemHealth?.dailyLossPct ?? 0;

  const TABS = [
    { id: 'dashboard', label: 'Overview', icon: LayoutDashboard },
    { id: 'scanner', label: 'Scanner', icon: List },
    { id: 'positions', label: 'Positions & Orders', icon: Activity },
    { id: 'signals', label: 'Signals & Rejects', icon: Activity },
    { id: 'history', label: 'Analytics & Journal', icon: History },
    { id: 'strategy', label: 'Strategies & Gates', icon: GitBranch },
    { id: 'risk', label: 'Risk Center', icon: ShieldAlert },
    { id: 'settings', label: 'Settings', icon: SettingsIcon },
    { id: 'health', label: 'System Health', icon: Terminal },
    { id: 'chart', label: 'Chart Explorer', icon: BarChart2 },
  ];

  return (
    <div className="flex h-screen bg-[#0E1117] text-gray-200 font-mono overflow-hidden">
      {/* Sidebar */}
      <div className={`${sidebarCollapsed ? 'w-0 md:w-16 -ml-64 md:ml-0' : 'w-64'} bg-[#161B22] border-r border-[#30363D] flex flex-col transition-all duration-300 z-50 shrink-0 absolute md:relative h-full overflow-hidden`}>
        <div className="p-4 border-b border-[#30363D] flex items-center justify-between">
          {!sidebarCollapsed && (
            <div>
              <h1 className="text-sm font-bold text-emerald-400 flex items-center gap-2 whitespace-nowrap overflow-hidden">
                <Zap size={16} className="shrink-0" /> QUANT-STACK V1
              </h1>
              <div className="text-[10px] text-gray-500 mt-1 whitespace-nowrap">ARM Oracle VM Build</div>
            </div>
          )}
          <button 
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="text-gray-400 hover:text-gray-200 p-1"
          >
            {sidebarCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto py-4">
          <nav className="space-y-1 px-2">
            {TABS.map(t => {
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  onClick={() => setActiveTab(t.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2 text-xs rounded-md transition-colors ${sidebarCollapsed ? 'justify-center' : ''} ${
                    activeTab === t.id 
                      ? 'bg-[#21262D] text-gray-200 font-bold border border-[#30363D]' 
                      : 'text-gray-400 hover:bg-[#21262D] hover:text-gray-200'
                  }`}
                  title={sidebarCollapsed ? t.label : undefined}
                >
                  <Icon size={16} className="shrink-0" />
                  {!sidebarCollapsed && <span>{t.label}</span>}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="p-4 border-t border-[#30363D]">
          <button
            id="engine-sidebar-toggle-btn"
            onClick={toggleEngine}
            className={`w-full flex items-center justify-center gap-2 px-4 py-2 rounded text-xs font-bold transition-colors cursor-pointer ${
              engineRunning ? 'bg-rose-500/20 text-rose-400 hover:bg-rose-500/30' : 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30'
            }`}
          >
            {engineRunning ? <Square size={14} /> : <Play size={14} />}
            {engineRunning ? 'STOP ENGINE' : 'START ENGINE'}
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden relative">
        <TopNavigationBar 
          mode={settings.binanceTestnet ? 'TESTNET' : 'PAPER'} 
          health={systemHealth || {
            engine: engineRunning ? 'RUNNING' : 'PAUSED',
            marketData: isStale ? 'STALE' : 'CONNECTED',
            userStream: 'CONNECTED',
            lastReconciliationAt: 'N/A',
            tradingBlocked: isStale
          }}
          dailyLossPct={currentDailyLossPct}
          openRiskPct={openRiskPct}
          engineRunning={engineRunning}
          onToggleEngine={toggleEngine}
        />

        {/* Deprecated header logic starts here - we can replace this completely or just hide it */}
        {/* We keep the old header strictly for balance displays if needed, but TopNav takes precedence */}
        <header className="h-14 border-b border-[#30363D] bg-[#0E1117] flex items-center px-6 justify-between shrink-0 hidden">
          <div className="flex items-center gap-3">
            <button 
              className="md:hidden text-gray-400 hover:text-gray-200"
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            >
              <Menu size={20} />
            </button>
            <h2 className="text-sm font-bold uppercase tracking-wider text-gray-300">
              {TABS.find(t => t.id === activeTab)?.label}
            </h2>
          </div>
          <div className="flex items-center gap-4 text-xs">
             <button
               id="engine-header-status-btn"
               onClick={toggleEngine}
               className={`flex items-center gap-2 px-2.5 py-1 rounded border transition-colors cursor-pointer ${
                 engineRunning
                   ? 'bg-emerald-950/30 border-emerald-800/50 hover:bg-emerald-900/40 text-emerald-300'
                   : 'bg-rose-950/30 border-rose-800/50 hover:bg-rose-900/40 text-rose-300'
               }`}
               title="Click to toggle trading engine"
             >
                <span className={`w-2 h-2 rounded-full ${engineRunning ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`}></span>
                <span className="font-bold tracking-wider text-[11px]">{engineRunning ? 'ENGINE ACTIVE' : 'ENGINE STOPPED'}</span>
             </button>
             <span className="flex items-center gap-1.5 text-gray-400">
               <span className={`w-1.5 h-1.5 rounded-full ${connectionStatus === 'CONNECTED' ? 'bg-emerald-400' : 'bg-amber-400 animate-ping'}`}></span>
               <span>{connectionStatus === 'CONNECTED' ? 'FEED: LIVE' : 'FEED: CONNECTING'}</span>
             </span>
          </div>
        </header>

        {/* Dynamic Strategy & Trade Engine Status Banner */}
        <TradeEngineBanner 
          engineRunning={engineRunning}
          settings={settings}
          connectionStatus={connectionStatus}
          isStale={isStale}
          settingsLoadError={settingsLoadError}
          globalFilterState={globalFilterState}
          systemHealth={systemHealth}
          onToggleEngine={toggleEngine}
          onOpenSettings={() => setActiveTab('settings')}
          onOpenStrategy={() => setActiveTab('strategy')}
          onRetrySettings={handleRetrySettings}
          onRefreshFeed={handleRefreshFeed}
          onDisableKillSwitch={handleDisableKillSwitch}
        />

        {/* Scrollable Area */}
        <main className="flex-1 overflow-auto p-6">
          {activeTab === 'scanner' && (
            <div className="space-y-4 max-w-7xl mx-auto">
              <div className="flex items-center justify-between">
                <div className="text-xs text-gray-500">
                  Total Pairs: {coins.length} | Last Scan: {scanTime}
                </div>
              </div>
              <ScannerList 
                  coins={coins} 
                  selectedSymbol={selectedSymbol}
                  onSelectCoin={setSelectedSymbol}
                  isLoading={scanning}
                  onManualScan={triggerUnifiedScan}
                  autoTradeThreshold={settings.autoTradeThreshold}
              />
            </div>
          )}
          {activeTab === 'settings' && (
            <SettingsPanel 
                settings={settings} 
                onUpdateSettings={setSettings} 
                onResetBalance={handleResetBalance}
                onResetSettings={handleResetSettings}
                hasLoadedServerSettings={hasLoadedServerSettings}
                settingsLoadError={settingsLoadError}
                onReloadServerSettings={reloadSettings}
            />
          )}
          {activeTab === 'strategy' && (
            <StrategyPanel 
              settings={settings} 
              setSettings={setSettings} 
              globalFilterState={globalFilterState} 
              coins={coins}
              selectedSymbol={selectedSymbol}
              onSelectCoin={setSelectedSymbol}
            />
          )}
          {activeTab === 'gates' && (
            <GateManager
              settings={settings}
              setSettings={setSettings}
              coins={coins}
              positions={positions}
              selectedSymbol={selectedSymbol}
              onSelectCoin={(sym) => {
                setSelectedSymbol(sym);
              }}
            />
          )}

          {activeTab === 'dashboard' && (
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
              <div className="xl:col-span-2 space-y-6">
                <ActiveTrades positions={positions} onManualClose={handleManualClose} settings={settings} globalFilterState={globalFilterState} />
                {currentCoinDetail ? (
                  <TradingChart coin={currentCoinDetail} activePosition={positions.find((p) => p.symbol === currentCoinDetail.symbol)} />
                ) : (
                  <div className="h-96 flex flex-col items-center justify-center bg-[#161B22] border border-[#30363D] rounded-xl relative p-6">
                    <RefreshCw className="w-10 h-10 stroke-blue-400 mb-2 animate-spin" />
                    <span className="text-gray-400 text-sm font-semibold uppercase tracking-wider">Synchronizing market data...</span>
                  </div>
                )}
              </div>
              <div className="space-y-6">
                 <div className="bg-[#161B22] border border-[#30363D] rounded-xl p-4 shadow-inner">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-bold text-blue-400 uppercase tracking-widest flex items-center">
                      <Terminal className="w-3.5 h-3.5 mr-1.5" /> Recent Event Log
                    </span>
                  </div>
                  <div className="h-96 overflow-y-auto font-mono text-[10px] text-gray-400 space-y-1.5 divide-y divide-[#30363D] pr-2">
                    {terminalLogs.length === 0 ? (
                      <span className="text-gray-600">Console empty. Boot stream ready.</span>
                    ) : (
                      terminalLogs.map((logStr, index) => (
                        <div key={index} className="pt-1.5">{logStr}</div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'history' && (
             <PerformancePage
              logs={tradeLogs}
              snapshots={equitySnapshots}
              currentBalance={totalAccountValue}
              startingBalance={settings.startingBalance}
            />
          )}
          
          {activeTab === 'chart' && (
            <div className="h-full">
              {currentCoinDetail ? (
                <TradingChart coin={currentCoinDetail} activePosition={positions.find((p) => p.symbol === currentCoinDetail.symbol)} />
              ) : (
                <div className="h-full flex flex-col items-center justify-center bg-[#161B22] border border-[#30363D] rounded-xl relative p-6">
                  <RefreshCw className="w-10 h-10 stroke-blue-400 mb-2 animate-spin" />
                  <span className="text-gray-400 text-sm font-semibold uppercase tracking-wider">Synchronizing market data...</span>
                </div>
              )}
            </div>
          )}

          {activeTab === 'positions' && (
            <div className="h-full">
               <ActiveTrades positions={positions} onManualClose={handleManualClose} settings={settings} globalFilterState={globalFilterState} />
            </div>
          )}

          {activeTab === 'signals' && (
             <SignalsPage />
          )}

          {activeTab === 'health' && (
             <SystemHealthPage initialHealth={systemHealth || undefined} onRefresh={fetchHealth} />
          )}

          {activeTab === 'risk' && (
             <RiskCenter 
               positions={positions}
               balance={balance}
               settings={settings}
               systemHealth={systemHealth}
               onFlattenAll={handleFlatten}
               onManualClose={handleManualClose}
               onOpenSettings={() => setActiveTab('settings')}
             />
          )}
        </main>
      </div>
    </div>
  );
}
