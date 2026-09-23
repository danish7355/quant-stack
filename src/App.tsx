/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
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
import { findCRSetup } from './utils/strategies/climaxReversal';
import { 
  detectCompression, detectBreakout, scoreBreakout, applyTrendAndMomentumBonus, 
  calculateATR, calculateEMA, determineStopLoss, calculateVcbTargets
} from './utils/strategies/volatilityCompression';
import { evaluateSmc } from './utils/strategies/smcLiquidity';
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

  useEffect(() => {
    // Initial fetch of server settings from Firestore
    const loadSettings = async (retryCount = 0) => {
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
          setSettings(prev => {
            const merged = { ...prev };
            // Merge server settings, but never wipe existing non-empty credentials with empty strings
            for (const [key, val] of Object.entries(serverSettings)) {
              if (val !== undefined && val !== null) {
                const isCredentialField = key === 'telegramBotToken' || key === 'telegramChatId' || key === 'binanceApiKey' || key === 'binanceApiSecret';
                if (isCredentialField && typeof val === 'string' && val.trim() === '') {
                  // Keep whatever local credentials we already have
                  if (!merged[key as keyof AppSettings]) {
                    (merged as any)[key] = val;
                  }
                } else {
                  (merged as any)[key] = val;
                }
              }
            }
            return merged;
          });
        }
        setSettingsLoadError(null);
        setHasLoadedServerSettings(true);
      } catch (err) {
        console.warn('AutoTrader: Could not load initial server settings', err);
        if (retryCount < 3) {
          // Retry with exponential backoff
          const delay = Math.pow(2, retryCount) * 1000;
          addTerminalLog(`⚠️ Settings load failed (attempt ${retryCount + 1}/3). Retrying in ${delay / 1000}s...`);
          setTimeout(() => loadSettings(retryCount + 1), delay);
        } else {
          // D1 fix: Do NOT set hasLoadedServerSettings = true on failure.
          // This prevents the auto-sync from firing and wiping server settings with defaults.
          setSettingsLoadError(String(err));
          addTerminalLog(`🚨 CRITICAL: Failed to load settings after 3 attempts. Trading engine paused. Using display-only defaults.`);
        }
      }
    };
    loadSettings();
  }, []);

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

            let crSignal = null;
            if (settingsRef.current.activeStrategy === 'DELTA_CLIMAX') {
              crSignal = findCRSetup(candles, settingsRef.current);
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

            if (settingsRef.current.activeStrategy === 'DELTA_CLIMAX') {
              if (crSignal && crSignal.status === 'confirmed') {
                finalScore = 95;
                finalDirection = crSignal.direction || 'NEUTRAL';
                finalStatus = 'STRONG_TREND';
                finalReason = 'Climax Reversal (' + (crSignal.reason || 'Confirmed') + ')';
              } else if (crSignal && (crSignal.status === 'forming' || crSignal.status === 'exhaustion')) {
                finalScore = 65;
                finalDirection = crSignal.direction || 'NEUTRAL';
                finalStatus = 'TRANSITION';
                finalReason = 'Climax Forming (' + (crSignal.reason || 'Volume Exhaustion') + ')';
              } else {
                finalScore = Math.max(20, Math.min(48, Math.round((results.regime?.score || 30) * 0.4 + 15)));
                finalDirection = results.direction || 'NEUTRAL';
                finalStatus = results.status || 'RANGE';
                finalReason = crSignal ? crSignal.reason : 'Scanning for climax exhaustion';
              }
            } else if (settingsRef.current.activeStrategy === 'VOLATILITY_COMPRESSION') {
              if (candles.length >= 50) {
                const lastCandle = candles[candles.length - 1];
                const previousCandles = candles.slice(0, -1);
                const atrSeries = calculateATR(previousCandles, 14);
                const atr = atrSeries[atrSeries.length - 1];
                const atrAvg = atrSeries.slice(-50).reduce((a, b) => a + b, 0) / 50;
                
                const compression = detectCompression(previousCandles, atr, atrAvg, settingsRef.current);
                const breakout = detectBreakout(lastCandle, compression, atr, settingsRef.current, candles);
                
                const closes = candles.map(c => c.close);
                const ema9 = calculateEMA(closes, 9).pop() || 0;
                const ema21 = calculateEMA(closes, 21).pop() || 0;
                const ema50 = calculateEMA(closes, 50).pop() || 0;
                const rsi = results.indicators?.rsi || 50;

                if (breakout && breakout.direction) {
                  let vcbScore = scoreBreakout(breakout, settingsRef.current);
                  vcbScore = applyTrendAndMomentumBonus(vcbScore, breakout.direction, ema9, ema21, ema50, rsi, settingsRef.current);
                  
                  finalScore = vcbScore;
                  finalDirection = breakout.direction;
                  finalStatus = vcbScore >= settingsRef.current.autoTradeThreshold ? 'STRONG_TREND' : 'WEAK_TREND';
                  finalReason = breakout.isPreBlastCoil
                    ? `VCB Pre-Blast Inception (RVOL: ${breakout.rvol.toFixed(1)}x, Squeeze: ${compression.isSqueezed ? 'YES' : 'ATR'})`
                    : `VCB Breakout Inception (RVOL: ${breakout.rvol.toFixed(1)}x, Squeeze: ${compression.isSqueezed ? 'YES' : 'ATR'})`;

                  finalSl = determineStopLoss(breakout.direction, compression, atr, settingsRef.current, candles, pair.price);
                  const vcbRisk = Math.abs(pair.price - finalSl);
                  const targets = calculateVcbTargets(pair.price, breakout.direction, vcbRisk, compression);
                  finalTp1 = targets.tp1;
                  finalTp2 = targets.tp2;
                  finalTp3 = targets.tp3;
                  
                  if (!loggedTriggerStatesRef.current.has(pair.symbol)) {
                    loggedTriggerStatesRef.current.add(pair.symbol);
                    const riskPerUnit = Math.abs(pair.price - finalSl).toFixed(5);
                    const tp1R = (Math.abs(finalTp1 - pair.price) / Math.abs(pair.price - finalSl)).toFixed(1);
                    const msg = `[VCB PAPER TRADE — ${breakout.direction}]
Symbol: ${pair.symbol}
Setup Timeframe: ${settingsRef.current.timeframe}
Status: TRIGGERED

HTF Context: ${compression.priorTrend}
Compression: ${compression.squeezeCount || 5}+ bars
RH: ${compression.windowHigh} | RL: ${compression.windowLow}
ATR: ${atr.toFixed(5)} | ATR Ratio: ${(compression.compressionRatio || 0).toFixed(2)}
Volume: Trigger RVOL ${breakout.rvol.toFixed(2)}x

Entry Mode: CONFIRMED_CLOSE
Entry: ${pair.price}
Stop-Loss: ${finalSl.toFixed(5)}
Risk per Unit: ${riskPerUnit}

TP1: ${finalTp1.toFixed(5)} (${tp1R}R, 40%)
TP2: ${finalTp2.toFixed(5)} (3.0R, 40%)
TP3 / Runner: ${finalTp3.toFixed(5)} (Runner, 20%)

Exposure Status: APPROVED\nReason Passed: ${finalReason}`;
                    addTerminalLog(msg);
                    addToast('info', 'New Signal Triggered', `VCB ${breakout.direction} on ${pair.symbol}`, { label: 'View Chart', onClick: () => { setSelectedSymbol(pair.symbol); setActiveTab('chart'); } });
                  }
                } else if (compression.isCompressed) {
                  let coilingScore = 48;
                  if (compression.isSqueezed) coilingScore += 12 + Math.min(8, (compression.squeezeCount || 1) * 2);
                  if (compression.hasVolumeContraction) coilingScore += 5;
                  if (compression.hasPriorImpulse) coilingScore += 5;
                  
                  let coilingDir: 'LONG' | 'SHORT' | 'NEUTRAL' = 'NEUTRAL';
                  if (ema9 > ema21 && ema21 > ema50) {
                    coilingDir = 'LONG';
                    coilingScore += 4;
                  } else if (ema9 < ema21 && ema21 < ema50) {
                    coilingDir = 'SHORT';
                    coilingScore += 4;
                  }

                  finalScore = Math.min(74, Math.round(coilingScore));
                  finalDirection = coilingDir;
                  finalStatus = 'ARMED';
                  finalReason = `VCB ARMED (${compression.isSqueezed ? `Squeeze ${compression.squeezeCount || 1}b` : 'ATR Contraction'}) - Awaiting Breakout`;
                  
                  if (!loggedArmedStatesRef.current.has(pair.symbol)) {
                    loggedArmedStatesRef.current.add(pair.symbol);
                    const msg = `[VCB ARMED — NO PAPER TRADE YET]
Symbol: ${pair.symbol}
Setup Timeframe: ${settingsRef.current.timeframe}
Compression Bars: ${compression.squeezeCount || 5}+ bars
RH: ${compression.windowHigh} | RL: ${compression.windowLow}
Box Width: ${(compression.windowHigh - compression.windowLow).toFixed(5)}
ATR: ${atr.toFixed(5)} | ATR Ratio: ${(compression.compressionRatio || 0).toFixed(2)}
Volume: Contraction ${compression.hasVolumeContraction ? 'Yes' : 'No'}
Potential Long Trigger: ${compression.windowHigh + atr * 0.15}
Potential Short Trigger: ${compression.windowLow - atr * 0.15}
Status: ARMED — WAIT FOR USER-CONFIGURED ENTRY RULE`;
                    addTerminalLog(msg);
                    addToast('info', 'Signal Armed', `VCB Armed on ${pair.symbol}`, { label: 'View Chart', onClick: () => { setSelectedSymbol(pair.symbol); setActiveTab('chart'); } });
                  }
                } else {
                  const compRatio = compression.compressionRatio || 1.0;
                  const proximityScore = Math.max(0, Math.min(20, (1.2 - compRatio) * 25));
                  finalScore = Math.max(18, Math.min(45, Math.round(20 + proximityScore + ((results.regime?.score || 30) / 100) * 15)));
                  finalDirection = results.direction || 'NEUTRAL';
                  finalStatus = results.status || 'RANGE';
                  finalReason = `Awaiting Squeeze (ATR Ratio: ${(compRatio * 100).toFixed(0)}%)`;
                }

                vcbData = {
                  isCompressed: compression.isCompressed,
                  windowHigh: compression.windowHigh,
                  windowLow: compression.windowLow,
                  startTime: compression.startTime,
                  endTime: compression.endTime,
                  priorTrend: compression.priorTrend,
                  priorImpulseMove: compression.priorImpulseMove,
                  breakout: breakout ? {
                    direction: breakout.direction as 'LONG' | 'SHORT',
                    entryPrice: pair.price,
                    sl: finalSl || 0,
                    tp1: finalTp1 || 0,
                    tp2: finalTp2 || 0,
                    tp3: finalTp3 || 0,
                    rvol: breakout.rvol,
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
              crSignal,
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
      if (settingsRef.current.activeStrategy === 'DELTA_CLIMAX') {
         if (c.crSignal && c.crSignal.status === 'confirmed') {
            return true;
         }
         return false;
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
      let sl = (coin.crSignal as any)?.stop;
      let tp1 = (coin.crSignal as any)?.tp1;
      let tp2 = (coin.crSignal as any)?.tp2;
      let tp3 = (coin.crSignal as any)?.tp3;

      if (activeStrat === 'DELTA_CLIMAX' && coin.crSignal && coin.crSignal.status === 'confirmed') {
         marketRegime = 'Exhaustion Climax';
         finalDirection = coin.crSignal.direction;
         finalScore = 100; // Force high score since it's a dedicated signal
         finalAtr = (coin.crSignal as any).atr || finalAtr;
         
         // In CR strategy, risk is calculated per unit.
         const riskPerUnit = (coin.crSignal as any).riskPerUnit || (coin.price * 0.01);
         riskAmt = balance * (settingsRef.current.accountRiskPct / 100); // use CR risk
         qty = riskAmt / riskPerUnit;
      } else if (activeStrat === 'VOLATILITY_COMPRESSION') {
         marketRegime = 'Consolidation Squeeze';
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
        const mapped = data.map((p: any) => {
          const isLong = p.direction === 'LONG';
          const currentP = p.current_price || p.entry_price || 0;
          const entryP = p.entry_price || 0;
          const qty = p.quantity || 0;
          const leverage = p.leverage || 1;
          const allocated = p.allocated_balance || (entryP * qty) / leverage || 0;
          
          const priceDeltaPct = entryP > 0 ? (isLong ? (currentP - entryP) / entryP : (entryP - currentP) / entryP) : 0;
          const pnl = priceDeltaPct * allocated * leverage;

          return {
            id: p.id,
            symbol: p.symbol,
            direction: p.direction,
            entryPrice: entryP,
            currentPrice: currentP,
            quantity: qty,
            leverage: p.leverage || 1,
            allocatedBalance: p.allocated_balance || (entryP * qty) / (p.leverage || 1) || 0,
            tp1: p.tp1 || 0,
            tp2: p.tp2 || 0,
            tp3: p.tp3 || 0,
            sl: p.sl || 0,
            trailingStop: typeof p.trailing_stop === 'number' ? p.trailing_stop : null,
            trailingStopActive: p.trailing_stop_active === 1,
            timeOpen: p.time_open || new Date().toISOString(),
            scoreAtEntry: p.score_at_entry || p.score || 0,
            strategy: p.strategy || 'BINANCE_COMPOSITE',
            marketRegime: p.market_regime || undefined,
            isAutoRegime: !!p.is_auto_regime,
            frequencyPreset: p.frequency_preset || 'LOW',
            unrealizedPnl: pnl,
            realizedPnl: 0,
            sizeRemainingPct: 100,
            lastUpdated: Date.now(),
            stopStatus: p.stopStatus || 'UNKNOWN'
          };
        });
        setPositions(mapped);
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
            handlePriceBatch(data);
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
          if (isMounted && data.globalFilterActive !== undefined) {
            setGlobalFilterState({
              isPausing: !!data.globalFilterActive,
              reason: data.globalFilterReason || null
            });
          }
        }
      } catch (e) {
        // silent
      }
    };
    fetchStatus();
    const interval = setInterval(fetchStatus, 8000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

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
          dailyLossPct={0}
          openRiskPct={0}
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
            />
          )}
          {activeTab === 'strategy' && (
            <StrategyPanel settings={settings} setSettings={setSettings} globalFilterState={globalFilterState} />
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
             <SignalsPage signals={[]} />
          )}

          {activeTab === 'health' && (
             <SystemHealthPage initialHealth={systemHealth || undefined} />
          )}

          {activeTab === 'risk' && (
             <RiskCenter />
          )}
        </main>
      </div>
    </div>
  );
}
