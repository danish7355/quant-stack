/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Menu, PanelLeftOpen, PanelLeftClose,
  TrendingUp, TrendingDown, LayoutDashboard, Settings as SettingsIcon, LineChart, History, ShieldAlert, Terminal,
  CircleCheck, ChevronRight, AlertTriangle, RefreshCw, Bell, Sun, Moon, Play, Square, Search, Activity, BarChart2, List, GitPullRequest, Zap, GitBranch,
  Radio, Ban, Layers, Compass
} from 'lucide-react';
import { Timeframe, CoinDetail, Position, TradeLog, AppSettings, EquitySnapshot } from './types';
import ScannerList from './components/ScannerList';
import SettingsPanel from './components/SettingsPanel';
import ActiveTrades from './components/ActiveTrades';
import TradingChart from './components/TradingChart';
import PerformancePage from './components/PerformancePage';
import { StrategiesPage } from './components/StrategiesPage';
import { RegimeVisualizer } from './components/RegimeVisualizer';
import { runScoringEngine } from './utils/indicators';
import { evaluateLiquiditySweepReversal } from './utils/strategies/liquiditySweepReversal';
import { evaluateSmcHighProbability } from './utils/strategies/smcHighProbability';
import { evaluateTrendPullback } from './utils/strategies/trendPullback';
import { evaluateMulticoinScalperPro } from './utils/strategies/multicoinScalperPro';
import { evaluateCoilBreakout } from './utils/strategies/coilBreakout';
import { evaluateOrderBlockStrategy } from './utils/strategies/orderBlockStrategy';
import { OrderBlockStrategyPanel } from './components/OrderBlockStrategyPanel';
import { formatPrice } from './utils/format';
import { useToast } from './components/ToastContext';
import { SystemHealthPage } from './components/SystemHealth';
import { TopNavigationBar } from './components/TopNavigationBar';
import { SignalsPage } from './components/SignalsPage';
import { RiskCenter } from './components/RiskCenter';
import { ExecutionGuardBanner } from './components/ExecutionGuardBanner';
import { StrategyHealthInspector } from './components/StrategyHealthInspector';
import { LsrStrategyPanel } from './components/LsrStrategyPanel';
import { TradeExecutionPopup, ExecutedTradeNotice } from './components/TradeExecutionPopup';
import { initAudioUnlock, playTradeExecutedSound, speakTradeAnnouncement } from './utils/audioNotification';
import { SystemHealth, SignalView, TradingMode, ExecutionStatus } from './types';


// Default initial settings - 5-Strategy Core Portfolio
const INITIAL_SETTINGS: AppSettings = {
  activeStrategy: 'COIL_BREAKOUT',
  activeStrategies: ['COIL_BREAKOUT', 'MULTICOIN_SCALPER_PRO', 'TREND_PULLBACK', 'LIQUIDITY_SWEEP_REVERSAL', 'ORDER_BLOCK'],
  deletedStrategies: [],
  customStrategies: [],
  tradeFrequency: 'LOW',
  timeframe: '4H',
  autoTradeThreshold: 75, // Fully confirmed confident setup threshold
  coinCount: 100,
  autoTradeEnabled: true,
  layer3TradeabilityGateEnabled: true,
  maxFeeDragPctOf1R: 15.0,
  // Order Block Strategy Defaults (1:3.5+ R:R Spec v2)
  obMinRr: 3.5,
  obMaxSlPct: 3.5,
  obMinDisplacementAtr: 1.5,
  obStrongDispAtr: 2.0,
  obDispBodyRatio: 0.55,
  obRelvolSupportive: 1.3,
  obSlBufferAtr: 0.15,
  obMaxRetestCandles: 25,
  obMaxChasingAtr: 0.5,
  obLiquidityMode: 'preferred',
  obRequireLiquiditySweep: true,
  obRequireBtcFilter: true,
  obMinSlAtr: 0.6,
  obMaxSlAtr: 3.0,
  obMaxCostR: 0.20,
  obBlockerZoneR: 2.0,
  obChopErThreshold: 0.30,
  obMinSwingAtr: 1.0,
  obMajorLegAtr: 2.0,
  obTargetSearchMaxAtr: 15.0,
  obMaxCluster: 3,
  obMaxWidthAtr: 1.5,
  obMaxAgeBars: 40,
  obMaxTouches: 2,
  obWickTolAtr: 0.25,
  obMaxBarsInsideZone: 4,
  obReactionWindowBars: 3,
  // Upgraded Liquidity Sweep Reversal (LSR) Strict Mode Defaults
  lsrExecutionTimeframe: '5m',
  lsrContextTimeframe: '15m',
  lsrStructureLookback: 35,
  lsrMinLiquidityScore: 2,
  lsrMaxSweepDepthAtr: 1.0,
  lsrMaxSweepDepthPct: 2.0,
  lsrMaxReclaimCandles: 4,
  lsrMinRewardRisk: 2.5,
  lsrSlBufferAtr: 0.15,
  lsrAllowGradeB: false,
  lsrRejectMiddleOfRange: true,
  lsrMiddleRangeTolerancePct: 15,
  lsrRequireVolumeSpike: true,
  lsrStrictMode: true,
  lsrSweepMinAtr: 0.10,
  lsrSweepMaxAtr: 1.0,
  lsrMaxReacceptanceBars: 1,
  lsrMinWickBodyRatio: 2.0,
  lsrMinWickRangeRatio: 0.60,
  lsrMaxOppositeWickRatio: 0.20,
  lsrVolMult: 1.5,
  lsrConfirmationTrigger: 'MIDPOINT_LIMIT',
  lsrConfirmWindowBars: 3,
  lsrEntryOrderTTL: 4,
  lsrMinRR: 3.5,
  lsrMinRangeWidthAtr: 2.5,
  lsrRoundTripFeePct: 0.177,
  lsrFeeStopFactor: 0.12,
  lsrMaxStopAtr: 1.5,
  lsrTrackConsumedPools: true,
  // SMC Strategy Defaults
  smcHtfResolution: '4H',
  smcStructureLen: 8,
  smcWickRatio: 0.6,
  smcMinSweepWickPct: 0.15,
  smcDispAtrMult: 0.5,
  smcAtrLen: 14,
  smcSweepConfirmWindow: 10,
  smcVolAvgLen: 20,
  smcVolMult: 1.25,
  smcFvgAfterMssWindow: 5,
  smcObLookback: 30,
  smcUseKillZone: false,
  smcKillZoneStart: '07:00',
  smcKillZoneEnd: '16:00',
  smcAtrStopMult: 1.5,
  smcRrRatio: 3.0,
  smcRequireStrictOverlap: true,

  // Robust Trend-Pullback Strategy Defaults
  tpExecutionTimeframe: '15m',
  tpHigherTimeframe: '1H',
  tpOptionalLowerTriggerTimeframe: '5m',
  tpFastEma: 20,
  tpSlowEma: 50,
  tpTrendEma: 200,
  tpAtrPeriod: 14,
  tpAdxPeriod: 14,
  tpAdxThreshold: 25,
  tpVolMaPeriod: 20,
  tpMinVolRatio: 1.0,
  tpMaxStopDistanceATR: 3.0,
  tpMinStopDistanceATR: 0.5,
  tpMinRiskRewardRatio: 2.0,
  tpMaxEntryDistanceATR: 0.5,
  tpMaxSpreadPct: 0.08,
  tpMaxSlippagePct: 0.05,
  tpSessionsEnabled: false,
  tpSessionStart: '07:00',
  tpSessionEnd: '20:00',
  tpMaxTradesPerSession: 5,
  tpMaxDailyLossPct: 3.0,
  tpRiskPctPerTrade: 1.0,
  tpMinSetupScore: 7,
  tpCooldownPeriodMin: 15,
  tpLongsEnabled: true,
  tpShortsEnabled: true,
  tpAllowNoVolume: false,
  tpAllowBroadStructuralStop: false,
  tpEntryMode: 'BREAK_RETEST',
  tpRetestToleranceAtr: 0.5,
  tpStructuralStopBufferAtr: 0.2,
  tpDangerousRetestEarlyExit: true,
  tpAllowBreakevenDuringRetest: false,

  // Two-Sided Coil / Compression Breakout Strategy Defaults (1:5+ R:R)
  coilMinLength: 5,
  coilMaxLength: 20,
  coilMaxHeightAtr: 1.25,
  coilMedianRangeAtr: 0.70,
  coilMinBodyContainment: 0.70,
  coilBreakoutBodyMult: 1.20,
  coilBreakoutRangeMult: 1.25,
  coilBreakoutVolMult: 1.25,
  coilMinRewardRisk: 5.0,
  coilEntryMode: 'limit_on_retest',
  coilSlAtrBuffer: 0.20,
  coilRequireBtcFilter: true,
  coilRequireRelStrength: true,

  scanInterval: 300, // 5 minutes default
  theme: 'dark',

  min24hVolume: 10000000,
  maxFundingRate: 0.15,
  maxSpread: 0.3,

  emaFastPeriod: 9,
  emaSlowPeriod: 55,
  emaTrendPeriod: 200,
  emaCrossLookback: 3,

  rsiPeriod: 14,
  rsiLongMin: 30,
  rsiLongMax: 65,
  rsiShortMin: 30,
  rsiShortMax: 55,

  macdFast: 12,
  macdSlow: 26,
  macdSignal: 9,
  adxPeriod: 14,
  adxTrendThreshold: 20,
  superTrendPeriod: 10,
  superTrendMultiplier: 3.0,
  volumeMultiplier: 1.5,
  fibLookback: 100,

  atrPeriod: 14,

  startingBalance: 10000,
  positionSizePct: 10, // user wants to use only 10%
  accountRiskPct: 1,
  leverage: 1, // user said: "i don't want to use leverage" -> means 1x leverage
  maxConcurrentTrades: 10,
  dailyLossLimitPct: 3,
  maxDrawdownPct: 10,
  maxExposurePct: 0.8,
  maxAccountExposureMultiplier: 5,
  maxConsecutiveLosses: 4,
  minLiqBuffer: 1.3,
  minStopDistancePct: 0.5,
  maxStopDistancePct: 4.0,
  killSwitchActive: false,
  enforceStrictSl: true,
  maxTradesPerDay: 25,
  tradeCooldownMinutes: 15,
  correlationFilterEnabled: true,
  maxCorrelation: 0.75,
  btcMacroRegimeFilter: false,

  tp1AtrMultiple: 2.0, // ATR Take Profit
  tp2AtrMultiple: 3.5,
  tp3FibLevel: 1.618,
  slAtrMultiple: 1.5, // ATR Stop Loss
  minRRRatio: 1.5,

  trailingStopActivation: 'TP1',
  trailActivationR: 1,
  timeBasedExitEnabled: true,
  timeBasedExitCandles: 3,
  regimeDirectionEnforced: true, // Only take trades in the recommended direction by regime

  telegramBotToken: '',
  telegramChatId: '',
  binanceApiKey: '',
  binanceApiSecret: '',
  binanceTestnet: true,
  alertOnNewSignal: true,
  alertOnTradeExecuted: true,
  alertOnTpHit: true,
  alertOnSlHit: true,
  alertOnTsMoved: true,
  alertOnDailyLossLimit: true,
  alertOnRangingDetected: false,
  // Climax Reversal Strategy settings
  crEnabled: false,
  crClimaxLookback: 20,
  crEmaFast: 5,
  crEmaContext: 55,
  crEmaBaseline: 200,
  crAtrPeriod: 14,
  crMinOverextensionAtr: 2.0,
  crMinAtrVsAverage: 1.0,
  crAtrAveragePeriod: 50,
  crMinRejectionWickRatio: 0.45,
  crMinClimaxRangeRatio: 1.3,
  crMinStopDistanceAtr: 0.5,
  crMinRewardRisk: 1.5,
  // Volatility Compression Breakout settings
  vcbCompressionLookback: 10,
  vcbCompressionAtrRatioMax: 0.70,
  vcbWindowAtrMult: 3.0,
  vcbBoundaryBufferAtr: 0.25,
  vcbRangeExpansionMin: 1.5,
  vcbVolumeExpansionMin: 1.5,
  vcbCloseStrengthMin: 0.60,
  vcbHtfBonus: 10,
  vcbSlBufferAtrMult: 0.15,
  vcbInitialTpAtrMult: 1.5,
  vcbInitialTpClosePct: 0.25,
  vcbChandelierAtrMult: 3.0,
  vcbStallCheckBar: 8,
  vcbStallMinProgressAtr: 1.0,
  useMtfAlignment: true,
  useVpvrFilter: false,
  useAtrTrailingStop: true,
  trailingStopAtrMultiplier: 3.0,
  // 3Commas Multicoin Scalper PRO (SwissAlgo)
  multicoinProfile: '5m_SCALP',
  multicoinFilterStables: true,
  multicoinMin24hVolumeUsdt: 20000000,
  multicoinMaxSpreadPct: 0.08,
  multicoinMinAtrPct: 0.15,
  multicoinMaxAtrPct: 2.5,
  multicoinMaxSingleBarPct: 5.0,
  multicoinEmaFast: 9,
  multicoinEmaMid: 21,
  multicoinEmaSlow: 55,
  multicoinRequireVwap: true,
  multicoinRsiPeriod: 7,
  multicoinRsiLongMin: 35,
  multicoinRsiLongMax: 55,
  multicoinRsiShortMin: 45,
  multicoinRsiShortMax: 65,
  multicoinMinVolRatio: 0.8,
  multicoinAdxThreshold: 20,
  multicoinTp1Pct: 0.8,
  multicoinTp2Pct: 1.5,
  multicoinSlAtrMult: 1.5,
  multicoinRiskPerTrade: 0.5,
  multicoinTimeExitMinutes: 20,
  multicoinUseHtfFilter: true,
  multicoinHtfEmaFast: 89,
  multicoinHtfEmaSlow: 200,
};


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
  const local = safeGetLocal('bt_app_settings');
  if (local) {
    try {
      const parsed = JSON.parse(local);
      return { ...INITIAL_SETTINGS, ...parsed, coinCount: parsed.coinCount || 100 };
    } catch (e) {}
  }
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
  const [systemHealth, setSystemHealth] = useState<SystemHealth | null>(null);
  const [executionStatus, setExecutionStatus] = useState<ExecutionStatus | null>(null);
  const [strategyInspectorOpen, setStrategyInspectorOpen] = useState(false);
  const [engineRunning, setEngineRunning] = useState(true);
  const [isStale, setIsStale] = useState(false);

  // Synchronize engine state with settings.autoTradeEnabled
  useEffect(() => {
    if (settings.autoTradeEnabled !== undefined && settings.autoTradeEnabled !== engineRunning) {
      setEngineRunning(settings.autoTradeEnabled);
    }
  }, [settings.autoTradeEnabled]);

  // Refs for WebSockets/Loops
  const wsRef = useRef<WebSocket | null>(null);
  const scanTimerRef = useRef<NodeJS.Timeout | null>(null);
  const positionsRef = useRef<Position[]>(positions);
  const loggedArmedStatesRef = useRef<Set<string>>(new Set());
  const loggedTriggerStatesRef = useRef<Set<string>>(new Set());
  const settingsRef = useRef<AppSettings>(settings);
  const activeTabRef = useRef(activeTab);
  const isPollingUpdateRef = useRef(false);

  // Real-Time Trade Execution Popup Notifications & Audio Alerts
  const [executedTradeNotices, setExecutedTradeNotices] = useState<ExecutedTradeNotice[]>([]);
  const knownPositionIdsRef = useRef<Set<string>>(new Set());
  const closingPositionsRef = useRef<Set<string>>(new Set());
  const isInitialPositionsLoadRef = useRef(true);

  // Initialize AudioContext unlock listener on user gestures
  useEffect(() => {
    initAudioUnlock();
  }, []);

  const handleTradeExecutedNotice = useCallback((trade: ExecutedTradeNotice) => {
    // 1. Play audio chime synthesized with Web Audio API
    playTradeExecutedSound(trade.direction);

    // 2. Speak announcement if voice enabled
    speakTradeAnnouncement(trade.symbol, trade.direction, trade.entryPrice);

    // 3. Add to prominent floating execution popup modal notices
    setExecutedTradeNotices((prev) => {
      if (prev.some((n) => n.id === trade.id)) return prev;
      return [trade, ...prev.slice(0, 3)];
    });

    // 4. Also register in the toast notifications
    addToast(
      'trade',
      `⚡ ${trade.direction} Order Executed: ${trade.symbol}`,
      `Filled @ ${formatPrice(trade.entryPrice)} • ${trade.strategy || 'Auto-Strategy'}`,
      {
        label: 'View Position',
        onClick: () => setActiveTab('positions'),
      }
    );
  }, [addToast]);

  const handleDismissNotice = useCallback((id: string) => {
    setExecutedTradeNotices((prev) => prev.filter((n) => n.id !== id));
  }, []);

  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  // --- LOCAL STORAGE HANDLING ---
  useEffect(() => {
    addTerminalLog('📡 Algorithmic Crypto Terminal boot cycle finished. Standby ready.');
  }, []);

  const isUpdatingFromServerRef = useRef(false);
  const lastUserSettingEditRef = useRef<number>(0);

  // Permanent Rule: Any setting changed in frontend is immediately sent and enforced on backend
  const handleUpdateSettings = useCallback((newSettingsOrFn: AppSettings | ((prev: AppSettings) => AppSettings)) => {
    lastUserSettingEditRef.current = Date.now();
    setHasLoadedServerSettings(true);
    setSettings((prev) => {
      const next = typeof newSettingsOrFn === 'function' ? newSettingsOrFn(prev) : newSettingsOrFn;
      // Immediately transmit over WebSocket with 0ms latency if connected
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        try {
          wsRef.current.send(JSON.stringify({ type: 'UPDATE_SETTINGS', settings: next }));
        } catch (e) {}
      }
      return next;
    });
  }, []);

  // Apply server settings cleanly, preserving active user input and non-empty credentials
  const applyServerSettings = useCallback((serverSettings: any) => {
    if (!serverSettings || typeof serverSettings !== 'object') return;

    // Permanent Rule: Protect recent user edits from being clobbered by stale polled server responses
    if (Date.now() - lastUserSettingEditRef.current < 4000) {
      return;
    }

    // If user is actively typing in a form input, avoid disrupting them
    if (typeof document !== 'undefined') {
      const activeEl = document.activeElement;
      if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'SELECT')) {
        return;
      }
    }

    if (serverSettings.autoTradeEnabled !== undefined) {
      setEngineRunning(serverSettings.autoTradeEnabled !== false);
    }

    isUpdatingFromServerRef.current = true;
    setSettings((prev) => {
      const merged = { ...prev };
      for (const [key, val] of Object.entries(serverSettings)) {
        if (val !== undefined && val !== null) {
          const isCredentialField = key === 'telegramBotToken' || key === 'telegramChatId' || key === 'binanceApiKey' || key === 'binanceApiSecret';
          if (isCredentialField && typeof val === 'string' && val.trim() === '') {
            if (!merged[key as keyof AppSettings]) {
              (merged as any)[key] = val;
            }
          } else {
            (merged as any)[key] = val;
          }
        }
      }
      settingsRef.current = merged;
      return merged;
    });
  }, []);

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/bot/settings');
      if (res.ok) {
        const data = await res.json();
        applyServerSettings(data);
        setHasLoadedServerSettings(true);
      }
    } catch (e) {
      setHasLoadedServerSettings(true);
    }
  }, [applyServerSettings]);

  // Sync state modifications from frontend to server 24/7 bot engine
  useEffect(() => {
    settingsRef.current = settings;
    safeSetLocal('bt_app_settings', JSON.stringify(settings));

    if (isUpdatingFromServerRef.current) {
      isUpdatingFromServerRef.current = false;
      return;
    }

    // Immediately push via WebSocket if open
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      try {
        wsRef.current.send(JSON.stringify({ type: 'UPDATE_SETTINGS', settings }));
      } catch (e) {}
    }

    if (settingsRef.current.timeframe !== settings.timeframe) {
      loggedArmedStatesRef.current.clear();
      loggedTriggerStatesRef.current.clear();
      addTerminalLog(`⏱️ Timeframe changed to ${settings.timeframe} - Resetting VCB tracking states`);
    }
    
    // Do not overwrite server settings until we have loaded initial settings
    if (!hasLoadedServerSettings) return;

    // Sync full settings & credentials to server 24/7 background bot & Firestore document
    const timer = setTimeout(() => {
      fetch('/api/bot/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      }).catch((err) => {
        console.warn('AutoTrader: Settings sync error', err);
      });
    }, 150);

    return () => clearTimeout(timer);
  }, [settings, hasLoadedServerSettings]);

  useEffect(() => {
    safeSetLocal('bt_sidebar_collapsed', JSON.stringify(sidebarCollapsed));
  }, [sidebarCollapsed]);

  useEffect(() => {
    positionsRef.current = positions;
  }, [positions]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

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

      // Filter only active USDT perpetual contracts, excluding quarterly expiry contracts
      const usdtPairs = tickers
        .filter((ticker: any) => {
          const sym = ticker.symbol || '';
          return sym.endsWith('USDT') && !sym.includes('_');
        })
        .sort((a: any, b: any) => parseFloat(b.quoteVolume || b.volume || 0) - parseFloat(a.quoteVolume || a.volume || 0))
        .slice(0, Math.max(10, Math.min(settingsRef.current.coinCount || 100, 100)))
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
    const countToScan = Math.max(10, Math.min(settingsRef.current.coinCount || 100, 100));
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

            let finalScore = results.score;
            let finalDirection = results.direction;
            let finalStatus = results.status;
            let finalReason = results.reason;
            let finalSl: number | undefined;
            let finalTp1: number | undefined;
            let finalTp2: number | undefined;
            let finalTp3: number | undefined;
            let crSignal = null;
            let vcbData: any = undefined;

            // Evaluate LSR, SMC, Trend-Pullback, Multicoin Scalper PRO & Coil Breakout Strategies according to active selection
            const deletedStrats = settingsRef.current.deletedStrategies || [];
            const rawActiveList = (settingsRef.current.activeStrategies && settingsRef.current.activeStrategies.length > 0)
              ? settingsRef.current.activeStrategies
              : [settingsRef.current.activeStrategy || 'COIL_BREAKOUT'];
            const activeList = rawActiveList.filter(s => !deletedStrats.includes(s));

            const isLsrActive = !deletedStrats.includes('LIQUIDITY_SWEEP_REVERSAL') && (activeList.includes('LIQUIDITY_SWEEP_REVERSAL') || activeList.includes('SMC_LIQUIDITY') || settingsRef.current.activeStrategy === 'LIQUIDITY_SWEEP_REVERSAL');
            const isSmcActive = !deletedStrats.includes('SMC_LIQUIDITY') && (activeList.includes('SMC_LIQUIDITY') || activeList.includes('SMC_LIQUIDITY_SWEEP') || settingsRef.current.activeStrategy === 'SMC_LIQUIDITY');
            const isTpActive = !deletedStrats.includes('TREND_PULLBACK') && (activeList.includes('TREND_PULLBACK') || settingsRef.current.activeStrategy === 'TREND_PULLBACK');
            const isScalperActive = !deletedStrats.includes('MULTICOIN_SCALPER_PRO') && (activeList.includes('MULTICOIN_SCALPER_PRO') || settingsRef.current.activeStrategy === 'MULTICOIN_SCALPER_PRO');
            const isCoilActive = !deletedStrats.includes('COIL_BREAKOUT') && (activeList.includes('COIL_BREAKOUT') || settingsRef.current.activeStrategy === 'COIL_BREAKOUT');
            const isObActive = !deletedStrats.includes('ORDER_BLOCK') && (activeList.includes('ORDER_BLOCK') || settingsRef.current.activeStrategy === 'ORDER_BLOCK');

            let orderBlockSignal = null;
            if (isObActive) {
              orderBlockSignal = evaluateOrderBlockStrategy(candles, [], pair.price, settingsRef.current);
            }

            let lsrSignal = null;
            if (isLsrActive) {
              lsrSignal = evaluateLiquiditySweepReversal(candles, [], pair.price, settingsRef.current);
            }

            let smcSignal = null;
            if (isSmcActive && !isLsrActive) {
              smcSignal = evaluateSmcHighProbability(candles, [], pair.price, settingsRef.current);
            }

            let trendPullbackSignal = null;
            if (isTpActive) {
              trendPullbackSignal = evaluateTrendPullback(candles, [], pair.price, settingsRef.current);
            }

            let multicoinScalperSignal = null;
            if (isScalperActive) {
              multicoinScalperSignal = evaluateMulticoinScalperPro(candles, [], pair.price, settingsRef.current);
            }

            let coilBreakoutSignal = null;
            if (isCoilActive) {
              coilBreakoutSignal = evaluateCoilBreakout(candles, [], pair.price, settingsRef.current);
            }

            let detectedStrategy: string | undefined = undefined;
            const matchedStrategies: string[] = [];

            if (lsrSignal && (lsrSignal.finalDecision === 'EXECUTE' || lsrSignal.status === 'TRIGGERED' || lsrSignal.status === 'ARMED')) {
              matchedStrategies.push('LIQUIDITY_SWEEP_REVERSAL');
            } else if (smcSignal && smcSignal.hasConfluence) {
              matchedStrategies.push('SMC_LIQUIDITY');
            }
            if (trendPullbackSignal && trendPullbackSignal.finalDecision !== 'REJECT') {
              matchedStrategies.push('TREND_PULLBACK');
            }
            if (multicoinScalperSignal && multicoinScalperSignal.finalDecision !== 'REJECT') {
              matchedStrategies.push('MULTICOIN_SCALPER_PRO');
            }
            if (coilBreakoutSignal && coilBreakoutSignal.status !== 'REJECTED') {
              matchedStrategies.push('COIL_BREAKOUT');
            }
            if (orderBlockSignal && (orderBlockSignal.finalDecision === 'EXECUTE' || orderBlockSignal.status === 'TRIGGERED' || orderBlockSignal.status === 'WAITING_FOR_RETEST' || orderBlockSignal.status === 'ARMED')) {
              matchedStrategies.push('ORDER_BLOCK');
            }

            const obExecutable = orderBlockSignal && orderBlockSignal.finalDecision === 'EXECUTE';
            const lsrExecutable = lsrSignal && lsrSignal.finalDecision === 'EXECUTE';
            const lsrArmed = lsrSignal && (lsrSignal.status === 'TRIGGERED' || lsrSignal.status === 'ARMED');
            const tpExecutable = trendPullbackSignal && trendPullbackSignal.finalDecision === 'EXECUTE';
            const smcTriggered = smcSignal && smcSignal.status === 'TRIGGERED';
            const scalperExecutable = multicoinScalperSignal && multicoinScalperSignal.finalDecision === 'EXECUTE';
            const coilExecutable = coilBreakoutSignal && coilBreakoutSignal.finalDecision === 'EXECUTE';
            const isMultiConfluence = matchedStrategies.length >= 2;

            if (obExecutable || (isObActive && activeList.length === 1 && orderBlockSignal && orderBlockSignal.status !== 'REJECTED')) {
              detectedStrategy = 'ORDER_BLOCK';
              finalDirection = orderBlockSignal!.direction;
              finalScore = isMultiConfluence ? Math.min(98, orderBlockSignal!.score + 12) : orderBlockSignal!.score;
              finalStatus = orderBlockSignal!.status === 'TRIGGERED' ? 'ARMED' : (orderBlockSignal!.status === 'WAITING_FOR_RETEST' ? 'MONITORING' : 'TRANSITION');
              finalReason = isMultiConfluence
                ? `⚡ Confluence [Order Block + Others]: ${orderBlockSignal!.reason}`
                : orderBlockSignal!.reason;
              finalSl = orderBlockSignal!.stopLossPrice;
              finalTp1 = orderBlockSignal!.targetPrice;
              finalTp2 = orderBlockSignal!.tp2 || orderBlockSignal!.targetPrice;
              finalTp3 = orderBlockSignal!.tp3 || orderBlockSignal!.targetPrice;
            } else if (coilExecutable || (isCoilActive && activeList.length === 1 && coilBreakoutSignal && coilBreakoutSignal.status !== 'REJECTED')) {
              detectedStrategy = 'COIL_BREAKOUT';
              finalDirection = coilBreakoutSignal!.direction;
              finalScore = isMultiConfluence ? Math.min(98, coilBreakoutSignal!.score + 12) : coilBreakoutSignal!.score;
              finalStatus = coilBreakoutSignal!.status === 'TRIGGERED' ? 'ARMED' : (coilBreakoutSignal!.status === 'WAITING_FOR_RETEST' ? 'MONITORING' : 'TRANSITION');
              finalReason = isMultiConfluence
                ? `⚡ Confluence [Coil Breakout + Others]: ${coilBreakoutSignal!.reason}`
                : coilBreakoutSignal!.reason;
              finalSl = coilBreakoutSignal!.stopLossPrice;
              finalTp1 = coilBreakoutSignal!.targetPrice;
              finalTp2 = coilBreakoutSignal!.targetPrice;
              finalTp3 = coilBreakoutSignal!.targetPrice;
            } else if (scalperExecutable && (!tpExecutable && !lsrExecutable && !smcTriggered)) {
              detectedStrategy = 'MULTICOIN_SCALPER_PRO';
              finalDirection = multicoinScalperSignal.direction;
              finalScore = isMultiConfluence ? Math.min(98, multicoinScalperSignal.score + 12) : multicoinScalperSignal.score;
              finalStatus = 'ARMED';
              finalReason = isMultiConfluence
                ? `⚡ Confluence [Scalper PRO + Others]: ${multicoinScalperSignal.reason}`
                : multicoinScalperSignal.reason;
              finalSl = multicoinScalperSignal.stopLossPrice;
              finalTp1 = multicoinScalperSignal.tp1;
              finalTp2 = multicoinScalperSignal.tp2;
              finalTp3 = multicoinScalperSignal.tp2 * (multicoinScalperSignal.direction === 'LONG' ? 1.008 : 0.992);
            } else if (lsrExecutable || (isLsrActive && activeList.length === 1 && lsrSignal && lsrSignal.status !== 'REJECTED')) {
              detectedStrategy = 'LIQUIDITY_SWEEP_REVERSAL';
              finalDirection = lsrSignal!.direction;
              finalScore = isMultiConfluence ? Math.min(98, lsrSignal!.score + 10) : lsrSignal!.score;
              finalStatus = lsrSignal!.status === 'TRIGGERED' ? 'ARMED' : (lsrSignal!.status === 'ARMED' ? 'ARMED' : 'MONITORING');
              finalReason = isMultiConfluence
                ? `⚡ Confluence [LSR + Others]: ${lsrSignal!.explanation}`
                : lsrSignal!.explanation;
              finalSl = lsrSignal!.stopLossPrice;
              finalTp1 = lsrSignal!.tp1;
              finalTp2 = lsrSignal!.tp2;
              finalTp3 = lsrSignal!.tp3;
            } else if (tpExecutable && (!lsrArmed && !smcTriggered)) {
              detectedStrategy = 'TREND_PULLBACK';
              finalDirection = trendPullbackSignal.direction;
              finalScore = isMultiConfluence ? Math.min(98, (trendPullbackSignal.score * 10) + 12) : trendPullbackSignal.score * 10;
              finalStatus = 'ARMED';
              finalReason = isMultiConfluence
                ? `⚡ Dual Confluence (Trend PB + Others): ${trendPullbackSignal.rejectionDetails || trendPullbackSignal.marketRegime}`
                : (trendPullbackSignal.rejectionDetails || `Trend-Pullback (${trendPullbackSignal.marketRegime} | ${trendPullbackSignal.retestClassification || 'Healthy'})`);
              finalSl = trendPullbackSignal.stopLossPrice;
              finalTp1 = trendPullbackSignal.targetPrice;
              finalTp2 = trendPullbackSignal.tp2;
              finalTp3 = trendPullbackSignal.tp3;
            } else if (lsrSignal && isLsrActive && (lsrArmed || !isTpActive || !trendPullbackSignal)) {
              detectedStrategy = 'LIQUIDITY_SWEEP_REVERSAL';
              finalDirection = lsrSignal.direction;
              finalScore = isMultiConfluence ? Math.min(98, lsrSignal.score + 10) : lsrSignal.score;
              finalStatus = lsrSignal.status === 'TRIGGERED' || lsrSignal.status === 'ARMED' ? 'ARMED' : 'TRANSITION';
              finalReason = isMultiConfluence
                ? `⚡ Dual Confluence (LSR + Others): ${lsrSignal.explanation}`
                : lsrSignal.explanation;
              finalSl = lsrSignal.stopLossPrice;
              finalTp1 = lsrSignal.tp1;
              finalTp2 = lsrSignal.tp2;
              finalTp3 = lsrSignal.tp3;
            } else if (smcSignal && isSmcActive && (smcTriggered || !isTpActive || !trendPullbackSignal)) {
              detectedStrategy = 'SMC_LIQUIDITY';
              finalDirection = smcSignal.direction;
              finalScore = isMultiConfluence ? Math.min(98, smcSignal.score + 12) : smcSignal.score;
              finalStatus = smcSignal.status === 'TRIGGERED' ? 'ARMED' : 'TRANSITION';
              finalReason = isMultiConfluence
                ? `⚡ Dual Confluence (SMC + Trend PB): ${smcSignal.reason}`
                : smcSignal.reason;
              finalSl = smcSignal.sl;
              finalTp1 = smcSignal.tp1;
              finalTp2 = smcSignal.tp2;
              finalTp3 = smcSignal.tp3;
            } else if (trendPullbackSignal && isTpActive) {
              detectedStrategy = 'TREND_PULLBACK';
              finalDirection = trendPullbackSignal.direction;
              finalScore = trendPullbackSignal.score * 10;
              finalStatus = trendPullbackSignal.finalDecision === 'EXECUTE'
                ? 'ARMED'
                : (trendPullbackSignal.finalDecision === 'WAIT' ? 'MONITORING' : 'TRANSITION');
              finalReason = trendPullbackSignal.rejectionDetails || `Trend-Pullback (${trendPullbackSignal.marketRegime})`;
              finalSl = trendPullbackSignal.stopLossPrice;
              finalTp1 = trendPullbackSignal.targetPrice;
              finalTp2 = trendPullbackSignal.tp2;
              finalTp3 = trendPullbackSignal.tp3;
            } else if (multicoinScalperSignal && isScalperActive) {
              detectedStrategy = 'MULTICOIN_SCALPER_PRO';
              finalDirection = multicoinScalperSignal.direction;
              finalScore = multicoinScalperSignal.score;
              finalStatus = multicoinScalperSignal.finalDecision === 'EXECUTE' ? 'ARMED' : 'MONITORING';
              finalReason = multicoinScalperSignal.reason;
              finalSl = multicoinScalperSignal.stopLossPrice;
              finalTp1 = multicoinScalperSignal.tp1;
              finalTp2 = multicoinScalperSignal.tp2;
              finalTp3 = multicoinScalperSignal.tp2 * (multicoinScalperSignal.direction === 'LONG' ? 1.008 : 0.992);
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
              lsrSignal,
              smcSignal,
              trendPullbackSignal,
              multicoinScalperSignal,
              coilBreakoutSignal,
              orderBlockSignal,
              strategy: detectedStrategy,
              detectedStrategy,
              matchedStrategies,
              isMultiConfluence,
              confluenceCount: matchedStrategies.length,
              tpSignal: trendPullbackSignal,
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
    const deletedStrats = settingsRef.current.deletedStrategies || [];
    const rawActiveList = (settingsRef.current.activeStrategies && settingsRef.current.activeStrategies.length > 0)
      ? settingsRef.current.activeStrategies
      : (settingsRef.current.activeStrategy && settingsRef.current.activeStrategy !== 'NONE' ? [settingsRef.current.activeStrategy] : ['COIL_BREAKOUT', 'MULTICOIN_SCALPER_PRO', 'TREND_PULLBACK', 'LIQUIDITY_SWEEP_REVERSAL']);
    const activeList = rawActiveList.filter(s => !deletedStrats.includes(s));

    if (!engineRunning || !settingsRef.current.autoTradeEnabled || activeList.length === 0 || activeList.includes('NONE')) return;
    const triggers = scannedList.filter((c) => {
      const hasActive = positionsRef.current.some((p) => p.symbol === c.symbol);
      if (hasActive || pendingOrdersRef.current.has(c.symbol)) return false;
      
      const isArmed = c.status === 'ARMED' || c.statusReason === 'All gates passed';
      const meetsThreshold = c.score >= (settingsRef.current.autoTradeThreshold || 70);
      const hasDirection = c.direction === 'LONG' || c.direction === 'SHORT';

      return isArmed && meetsThreshold && hasDirection;
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
      
      // Accurately assign the specific strategy that triggered this setup
      let activeStrat = coin.detectedStrategy || (coin as any).strategy || 'COIL_BREAKOUT';
      let marketRegime: string | undefined = undefined;
      let isAutoRegime = activeStrat === 'AUTO_REGIME';
      let sl = coin.sl;
      let tp1 = coin.tp1;
      let tp2 = coin.tp2;
      let tp3 = coin.tp3;

      if (activeStrat === 'COIL_BREAKOUT') {
        marketRegime = 'Two-Sided Coil Breakout (1:5+ R:R)';
      } else if (activeStrat === 'MULTICOIN_SCALPER_PRO') {
        marketRegime = 'Multicoin Scalper PRO (SwissAlgo)';
      } else if (activeStrat === 'TREND_PULLBACK') {
        marketRegime = 'Trending [EMA Pullback]';
      } else if (activeStrat === 'LIQUIDITY_SWEEP_REVERSAL' || activeStrat === 'SMC_LIQUIDITY' || activeStrat === 'SMC_LIQUIDITY_SWEEP') {
        marketRegime = `Liquidity Sweep Reversal [LSR: ${coin.lsrSignal?.grade || 'A'}]`;
      } else if (activeStrat === 'DELTA_CLIMAX') {
        marketRegime = 'Exhaustion Climax';
      } else if (activeStrat === 'VOLATILITY_COMPRESSION') {
        marketRegime = 'Consolidation Squeeze';
      } else {
        marketRegime = 'Technical Confluence';
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
        if (data.posId) {
          knownPositionIdsRef.current.add(data.posId);
        }
        handleTradeExecutedNotice({
          id: data.posId || `pos-${Date.now()}`,
          symbol: coin.symbol,
          direction: finalDirection,
          entryPrice: coin.price,
          quantity: qty,
          allocatedBalance: riskAmt,
          leverage,
          strategy: activeStrat,
          sl,
          tp1,
          tp2,
          tp3,
          score: finalScore,
          timestamp: Date.now(),
          marketRegime
        });
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
      closingPositionsRef.current.add(id);
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
         fetchBalance();
         fetchTradeLogs();
      } else {
         closingPositionsRef.current.delete(id);
         const data = await res.json();
         addToast('error', 'Exit Failed', `Failed to close ${pos.symbol}: ${data.error || 'Unknown error'}`);
      }
    } catch(e) {
      closingPositionsRef.current.delete(id);
      console.error(e);
      addToast('error', 'Exit Failed', 'Network or API error occurred while closing position.');
    }
  };

  const handleFlatten = async () => {
    try {
      await fetch('/api/bot/flatten', { method: 'POST' });
      fetchPositions();
      fetchBalance();
      fetchTradeLogs();
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
            stopStatus: p.stopStatus || (p.sl ? 'CONFIRMED' : 'MISSING')
          };
        });

        // Detect new trade executions executed by the 24/7 autonomous backend engine
        if (isInitialPositionsLoadRef.current) {
          mapped.forEach((p: any) => knownPositionIdsRef.current.add(p.id));
          isInitialPositionsLoadRef.current = false;
        } else {
          mapped.forEach((p: any) => {
            if (p.id && !knownPositionIdsRef.current.has(p.id)) {
              knownPositionIdsRef.current.add(p.id);
              handleTradeExecutedNotice({
                id: p.id,
                symbol: p.symbol,
                direction: p.direction,
                entryPrice: p.entryPrice,
                quantity: p.quantity,
                allocatedBalance: p.allocatedBalance,
                leverage: p.leverage,
                strategy: p.strategy,
                sl: p.sl,
                tp1: p.tp1,
                tp2: p.tp2,
                tp3: p.tp3,
                score: p.scoreAtEntry,
                timestamp: Date.now(),
                marketRegime: p.marketRegime,
              });
            }
          });
        }

        // Clean up resolved positions from closingPositionsRef
        const activeIdSet = new Set(mapped.map((m: any) => m.id));
        closingPositionsRef.current.forEach((id) => {
          if (!activeIdSet.has(id)) closingPositionsRef.current.delete(id);
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
        if (data.engine !== undefined) {
          const isEngineRunning = data.engine === 'RUNNING';
          setEngineRunning(isEngineRunning);
        }
        if (data.guardrails) {
          setExecutionStatus({
            blocked: Boolean(data.tradingBlocked),
            reason: data.blockReason || null,
            code: data.blockCode || 'OK',
            actionType: data.blockAction || 'NONE',
            guardrails: data.guardrails || [],
            summary: data.summary || {
              positionsCount: 0,
              maxPositions: 5,
              activeStrategiesCount: 0,
              activeStrategies: [],
              isStale: false,
              circuitBreakerTripped: false,
              killSwitchActive: false
            }
          });
        }
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
    knownPositionIdsRef.current.clear();
    closingPositionsRef.current.clear();
  };

  const handleResetSettings = () => {
    // Reset general and strategy settings to defaults, but keep user's configured credentials
    setSettings(prev => ({
      ...INITIAL_SETTINGS,
      telegramBotToken: prev.telegramBotToken || '',
      telegramChatId: prev.telegramChatId || '',
      binanceApiKey: prev.binanceApiKey || '',
      binanceApiSecret: prev.binanceApiSecret || '',
    }));
  };

  // Load initial backend state & Poll positions/balance
  useEffect(() => {
    fetchPositions();
    fetchTradeLogs();
    fetchBalance();
    fetchHealth();
    fetchSettings();
    
    // Poll backend every 4 seconds to sync positions closed/opened by 24/7 background engine & server settings
    const syncInterval = setInterval(() => {
      fetchPositions();
      fetchBalance();
      fetchHealth();
      fetchSettings();
    }, 4000);

    // Poll trade history every 10 seconds
    const logsInterval = setInterval(() => {
      fetchTradeLogs();
    }, 10000);
    
    return () => {
      clearInterval(syncInterval);
      clearInterval(logsInterval);
    };
  }, [fetchSettings]);

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

              if (exitReason && !closingPositionsRef.current.has(p.id)) {
                closingPositionsRef.current.add(p.id);
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
                  fetchBalance();
                }).catch(() => {
                  closingPositionsRef.current.delete(p.id);
                });
              }
            }
          }
        });
        return changed ? next : prev;
      });
    };

    // 1. Direct Binance High-Availability WebSocket connection (Browser -> Binance Spot Ticker Stream)
    const connectBinanceWs = () => {
      if (!active) return;
      try {
        binanceWs = new WebSocket('wss://stream.binance.com:9443/ws/!miniTicker@arr');

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
        wsRef.current = serverWs;

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

            if (data && typeof data === 'object') {
              if (data.type === 'INITIAL_SYNC') {
                if (data.engineRunning !== undefined) {
                  setEngineRunning(Boolean(data.engineRunning));
                }
                if (data.settings) {
                  applyServerSettings(data.settings);
                }
                if (data.balance !== undefined) {
                  setBalance(data.balance);
                }
                fetchPositions();
                return;
              }

              if (data.type === 'SETTINGS_UPDATED') {
                if (data.settings) {
                  applyServerSettings(data.settings);
                }
                return;
              }

              if (data.type === 'ENGINE_STATUS') {
                if (data.engineRunning !== undefined) {
                  setEngineRunning(Boolean(data.engineRunning));
                  isUpdatingFromServerRef.current = true;
                  setSettings((prev) => ({ ...prev, autoTradeEnabled: Boolean(data.engineRunning) }));
                }
                fetchHealth();
                return;
              }

              if (data.type === 'POSITIONS_CHANGED') {
                fetchPositions();
                fetchTradeLogs();
                fetchBalance();
                return;
              }

              if (data.type === 'KILL_SWITCH_UPDATED') {
                isUpdatingFromServerRef.current = true;
                setSettings((prev) => ({ ...prev, killSwitchActive: Boolean(data.killSwitchActive) }));
                fetchHealth();
                return;
              }

              if (data.type === 'CIRCUIT_BREAKER_RESET') {
                fetchHealth();
                return;
              }

              if (data.type === 'BALANCE_RESET') {
                if (data.balance !== undefined) setBalance(data.balance);
                setPositions([]);
                setTradeLogs([]);
                setEquitySnapshots([]);
                knownPositionIdsRef.current.clear();
                closingPositionsRef.current.clear();
                return;
              }

              if (data.type === 'BALANCE_UPDATED') {
                if (data.demoBalance !== undefined) setBalance(data.demoBalance);
                if (data.equitySnapshots) setEquitySnapshots(data.equitySnapshots);
                fetchTradeLogs();
                return;
              }

              if (data.type === 'TRADE_EXECUTED' && data.trade) {
                const t = data.trade;
                if (t.id && !knownPositionIdsRef.current.has(t.id)) {
                  knownPositionIdsRef.current.add(t.id);
                  handleTradeExecutedNotice({
                    id: t.id,
                    symbol: t.symbol,
                    direction: t.direction,
                    entryPrice: t.entry_price || t.entryPrice || 0,
                    quantity: t.quantity,
                    allocatedBalance: t.allocated_balance || t.allocatedBalance,
                    leverage: t.leverage,
                    strategy: t.strategy,
                    sl: t.sl,
                    tp1: t.tp1,
                    tp2: t.tp2,
                    tp3: t.tp3,
                    score: t.score_at_entry || t.score,
                    timestamp: Date.now(),
                    marketRegime: t.market_regime || t.marketRegime,
                  });
                  fetchPositions();
                }
                return;
              }
            }

            handlePriceBatch(data);
          } catch (err) {}
        };

        serverWs.onerror = () => {};

        serverWs.onclose = () => {
          if (wsRef.current === serverWs) wsRef.current = null;
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
      const pollDelay = isHidden ? 8000 : 3000;

      const timeSinceUpdate = Date.now() - lastUpdateTime;
      
      // If WebSockets are silently hanging (no updates for 20s), force reconnect them
      if (timeSinceUpdate > 20000) {
        if (binanceWs) {
          try { binanceWs.close(); } catch (e) {}
        }
        if (serverWs) {
          try { serverWs.close(); } catch (e) {}
        }
        lastUpdateTime = Date.now();
      } else if (timeSinceUpdate > 4000) {
        let success = false;
        
        try {
          // Attempt 1: Bot's internal price cache (instant, zero rate limits)
          const botRes = await fetch('/api/bot/prices');
          if (botRes.ok) {
            const data = await botRes.json();
            if (Array.isArray(data) && data.length > 0) {
              handlePriceBatch(data);
              success = true;
            }
          }
        } catch(e) { }

        if (!success) {
          try {
            // Attempt 2: Direct Browser-to-Binance Spot (lightweight, CORS enabled)
            const spotRes = await fetch('https://api.binance.com/api/v3/ticker/price');
            if (spotRes.ok) {
              const data = await spotRes.json();
              handlePriceBatch(data);
              success = true;
            }
          } catch(e) { }
        }

        if (!success) {
          try {
            // Attempt 3: Backend Spot proxy
            const proxyRes = await fetch('/api/binance/proxy?path=/api/v3/ticker/price');
            if (proxyRes.ok) {
              const data = await proxyRes.json();
              handlePriceBatch(data);
              success = true;
            }
          } catch(e) { }
        }
      }

      if (active) {
        pollTimeout = setTimeout(runFallbackPoll, pollDelay);
      }
    };

    // Initial immediate price fetch from bot internal prices
    fetch('/api/bot/prices')
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          handlePriceBatch(data);
        } else {
          fetch('/api/binance/proxy?path=/api/v3/ticker/price')
            .then(r => r.json())
            .then(d => handlePriceBatch(d))
            .catch(() => {});
        }
      })
      .catch(() => {
        fetch('/api/binance/proxy?path=/api/v3/ticker/price')
          .then(r => r.json())
          .then(d => handlePriceBatch(d))
          .catch(() => {});
      });

    pollTimeout = setTimeout(runFallbackPoll, 2500);

    const heartbeatInterval = setInterval(() => {
      const diff = Date.now() - lastUpdateTime;
      if (diff > 35000) {
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
      wsRef.current = null;
      if (pollTimeout) clearTimeout(pollTimeout);
      clearInterval(heartbeatInterval);
    };
  }, []);

  // Master engine control: toggles backend and frontend scanning & execution
  const toggleEngine = async () => {
    const nextState = !engineRunning;
    setEngineRunning(nextState);
    handleUpdateSettings((prev) => ({ ...prev, autoTradeEnabled: nextState }));

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

  // Quick-switch & Multi-Strategy Handlers
  const handleToggleStrategy = (strat: string) => {
    handleUpdateSettings(prev => {
      const currentList = (prev.activeStrategies && prev.activeStrategies.length > 0)
        ? [...prev.activeStrategies]
        : [prev.activeStrategy || 'LIQUIDITY_SWEEP_REVERSAL'];

      let updatedList: string[];
      if (currentList.includes(strat)) {
        updatedList = currentList.filter(s => s !== strat);
      } else {
        updatedList = [...currentList, strat];
      }

      const newPrimary = (updatedList[0] || 'NONE') as any;
      addTerminalLog(`🔄 Strategy updated: [${updatedList.length > 0 ? updatedList.join(', ') : 'NONE (Stand Aside)'}] active`);
      return {
        ...prev,
        activeStrategies: updatedList,
        activeStrategy: newPrimary,
      };
    });
  };

  const handleSelectStrategy = (strat: string) => {
    handleUpdateSettings(prev => {
      addTerminalLog(`🎯 Switched active strategy to: ${strat}`);
      return {
        ...prev,
        activeStrategies: [strat],
        activeStrategy: strat as any,
      };
    });
  };

  const handleSetMultipleStrategies = (strats: string[]) => {
    if (!strats || strats.length === 0) return;
    handleUpdateSettings(prev => {
      addTerminalLog(`⚡ Multi-Strategy Mode activated: [${strats.join(' + ')}]`);
      return {
        ...prev,
        activeStrategies: strats,
        activeStrategy: strats[0] as any,
      };
    });
  };

  // Main scanner loop
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (engineRunning) {
      triggerUnifiedScan();
      interval = setInterval(() => {
        triggerUnifiedScan();
      }, (settings.scanInterval || 15) * 1000);
    }
    return () => clearInterval(interval);
  }, [engineRunning, settings.scanInterval, settings.coinCount]);

  const currentCoinDetail = coins.find(c => c.symbol === selectedSymbol) || coins[0];
  const totalAccountValue = balance + positions.reduce((acc, p) => acc + p.allocatedBalance + p.unrealizedPnl, 0);

  const TABS = [
    { id: 'dashboard', label: 'Overview', icon: LayoutDashboard },
    { id: 'regime', label: 'Regime Visualizer', icon: Compass },
    { id: 'strategies', label: 'Strategies', icon: Layers },
    { id: 'scanner', label: 'Scanner', icon: List },
    { id: 'positions', label: 'Positions & Orders', icon: Activity },
    { id: 'signals', label: 'Signals', icon: Radio },
    { id: 'rejects', label: 'Rejects', icon: Ban },
    { id: 'history', label: 'Analytics & Journal', icon: History },
    { id: 'risk', label: 'Risk Center', icon: ShieldAlert },
    { id: 'settings', label: 'Settings', icon: SettingsIcon },
    { id: 'health', label: 'System Health', icon: Terminal },
    { id: 'chart', label: 'Chart Explorer', icon: BarChart2 },
  ];

  return (
    <div className="flex h-screen bg-[#0E1117] text-gray-200 font-mono overflow-hidden relative">
      {/* Mobile Drawer Backdrop Overlay */}
      {!sidebarCollapsed && (
        <div
          onClick={() => setSidebarCollapsed(true)}
          className="fixed inset-0 bg-black/60 backdrop-blur-xs z-40 md:hidden transition-opacity duration-300"
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <div className={`${sidebarCollapsed ? 'w-0 md:w-16 -translate-x-full md:translate-x-0' : 'w-64 translate-x-0'} bg-[#161B22] border-r border-[#30363D] flex flex-col transition-all duration-300 z-50 shrink-0 fixed md:relative h-full overflow-hidden shadow-2xl md:shadow-none`}>
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
            className="text-gray-400 hover:text-gray-200 p-1 rounded hover:bg-gray-800 transition"
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
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
                  onClick={() => {
                    setActiveTab(t.id);
                    if (window.innerWidth < 768) {
                      setSidebarCollapsed(true);
                    }
                  }}
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

        <div className="p-4 border-t border-[#30363D] space-y-2">
          <button
            id="strategy-inspector-sidebar-btn"
            type="button"
            onClick={() => setStrategyInspectorOpen(true)}
            className={`w-full flex items-center justify-center gap-2 px-3 py-1.5 rounded text-[11px] font-bold border border-indigo-500/40 bg-indigo-950/40 text-indigo-300 hover:bg-indigo-900/50 hover:text-white transition cursor-pointer ${
              sidebarCollapsed ? 'px-1' : ''
            }`}
            title="Inspect strategy logic and verify live signal calculation"
          >
            <Activity size={13} className="shrink-0 text-indigo-400" />
            {!sidebarCollapsed && <span>CHECK STRATEGIES</span>}
          </button>

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
      <div className="flex-1 flex flex-col h-screen overflow-hidden relative min-w-0">
        <TopNavigationBar 
          mode={settings.binanceTestnet ? 'TESTNET' : 'PAPER'} 
          health={systemHealth || {
            engine: engineRunning ? 'RUNNING' : 'PAUSED',
            marketData: isStale ? 'STALE' : 'CONNECTED',
            userStream: 'CONNECTED',
            lastReconciliationAt: 'N/A',
            tradingBlocked: isStale
          }}
          dailyLossPct={systemHealth?.riskStatus?.currentDailyLossPct ?? 0}
          openRiskPct={systemHealth?.riskStatus?.currentExposure ?? 0}
          engineRunning={engineRunning}
          onToggleEngine={toggleEngine}
          onToggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)}
          onTestNotification={() => {
            handleTradeExecutedNotice({
              id: `test-${Date.now()}`,
              symbol: 'SOLUSDT',
              direction: 'LONG',
              entryPrice: 143.10,
              quantity: 5.5,
              allocatedBalance: 787,
              leverage: 1,
              strategy: 'COIL_BREAKOUT',
              sl: 142.55,
              tp1: 145.85,
              score: 95,
              timestamp: Date.now(),
              marketRegime: 'Coil Breakout (1:5+ R:R)',
            });
          }}
        />

        {/* Real-Time Execution Guard Banner - Shows Why Any Trade Execution Is Blocked */}
        <ExecutionGuardBanner
          status={executionStatus}
          engineRunning={engineRunning}
          onStartEngine={toggleEngine}
          onActivateBothStrategies={() => handleSetMultipleStrategies(['ORDER_BLOCK', 'COIL_BREAKOUT', 'MULTICOIN_SCALPER_PRO', 'TREND_PULLBACK', 'LIQUIDITY_SWEEP_REVERSAL'])}
          onResetCircuitBreaker={async () => {
            try {
              const res = await fetch('/api/risk/reset-circuit-breaker', { method: 'POST' });
              if (res.ok) {
                addToast('success', 'Circuit Breaker Reset', 'Daily loss limit and consecutive loss breaker cleared.');
                fetchHealth();
              }
            } catch (e) {
              addToast('error', 'Reset Failed', 'Could not reset circuit breaker.');
            }
          }}
          onDeactivateKillSwitch={async () => {
            try {
              const res = await fetch('/api/risk/kill-switch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ active: false })
              });
              if (res.ok) {
                addToast('success', 'Kill-Switch Disarmed', 'Emergency stop disarmed. Trade execution resumed.');
                fetchHealth();
              }
            } catch (e) {
              addToast('error', 'Action Failed', 'Could not disarm kill-switch.');
            }
          }}
          onNavigateTab={(tab) => setActiveTab(tab)}
          onOpenStrategyChecker={() => setStrategyInspectorOpen(true)}
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

        {isStale && (
          <div className="bg-amber-500/20 border-b border-amber-500/30 px-3 sm:px-6 py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-amber-400 text-xs shadow-sm">
            <div className="flex items-center gap-2">
              <AlertTriangle size={14} className="shrink-0" />
              <span><strong>Warning:</strong> Price data stream paused. Reconnecting to live market ticks...</span>
            </div>
            <button
              onClick={() => {
                fetch('/api/bot/prices')
                  .then(r => r.json())
                  .then(data => {
                    if (Array.isArray(data) && data.length > 0) {
                      setIsStale(false);
                    } else {
                      fetch('/api/binance/proxy?path=/api/v3/ticker/price')
                        .then(r => r.json())
                        .then(d => {
                          if (Array.isArray(d)) {
                            setIsStale(false);
                          }
                        })
                        .catch(() => {});
                    }
                  })
                  .catch(() => {});
              }}
              className="px-2.5 py-1 bg-amber-500/30 hover:bg-amber-500/40 text-amber-200 rounded text-[11px] font-bold transition flex items-center gap-1 self-start sm:self-auto shrink-0 cursor-pointer"
            >
              <RefreshCw size={11} /> Refresh Ticks
            </button>
          </div>
        )}

        {/* Scrollable Area */}
        <main className="flex-1 overflow-auto p-3 sm:p-4 md:p-6">
          {activeTab === 'regime' && (
            <RegimeVisualizer
              coins={coins}
              settings={settings}
              onUpdateSettings={setSettings}
              onSelectStrategy={handleSelectStrategy}
              onSetMultipleStrategies={handleSetMultipleStrategies}
              accountBalance={totalAccountValue}
            />
          )}
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
                  activeStrategies={settings.activeStrategies || [settings.activeStrategy || 'COIL_BREAKOUT']}
                  deletedStrategies={settings.deletedStrategies || []}
                  activeStrategy={settings.activeStrategy}
                  onToggleStrategy={handleToggleStrategy}
                  onSelectStrategy={handleSelectStrategy}
                  onSetMultipleStrategies={handleSetMultipleStrategies}
              />
            </div>
          )}
          {activeTab === 'strategies' && (
            <StrategiesPage
              settings={settings}
              onUpdateSettings={handleUpdateSettings}
              coins={coins}
              onOpenDiagnostic={() => setStrategyInspectorOpen(true)}
              onInspectCoin={(symbol) => {
                setSelectedSymbol(symbol);
                setActiveTab('chart');
              }}
            />
          )}
          {activeTab === 'settings' && (
            <SettingsPanel 
                settings={settings} 
                onUpdateSettings={handleUpdateSettings} 
                onResetBalance={handleResetBalance}
                onResetSettings={handleResetSettings}
            />
          )}

          {activeTab === 'dashboard' && (
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
              <div className="xl:col-span-2 space-y-6">
                <ActiveTrades positions={positions} onManualClose={handleManualClose} settings={settings} />
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
            <div className="space-y-6">
              {currentCoinDetail ? (
                <>
                  <TradingChart coin={currentCoinDetail} activePosition={positions.find((p) => p.symbol === currentCoinDetail.symbol)} />
                  <OrderBlockStrategyPanel
                    signal={currentCoinDetail.orderBlockSignal}
                    symbol={currentCoinDetail.symbol}
                    settings={settings}
                    onOpenDiagnostic={() => setStrategyInspectorOpen(true)}
                  />
                  <LsrStrategyPanel
                    signal={currentCoinDetail.lsrSignal}
                    symbol={currentCoinDetail.symbol}
                    currentPrice={currentCoinDetail.price}
                    candles={currentCoinDetail.candles}
                    settings={settings}
                    isActive={Boolean((settings.activeStrategies && settings.activeStrategies.includes('LIQUIDITY_SWEEP_REVERSAL')) || settings.activeStrategy === 'LIQUIDITY_SWEEP_REVERSAL')}
                    onToggleActive={() => handleToggleStrategy('LIQUIDITY_SWEEP_REVERSAL')}
                    onOpenSettings={() => setActiveTab('settings')}
                    onUpdateSettings={handleUpdateSettings}
                  />
                </>
              ) : (
                <div className="h-full flex flex-col items-center justify-center bg-[#161B22] border border-[#30363D] rounded-xl relative p-6 min-h-[400px]">
                  <RefreshCw className="w-10 h-10 stroke-blue-400 mb-2 animate-spin" />
                  <span className="text-gray-400 text-sm font-semibold uppercase tracking-wider">Synchronizing market data...</span>
                </div>
              )}
            </div>
          )}

          {activeTab === 'positions' && (
            <div className="h-full">
               <ActiveTrades positions={positions} onManualClose={handleManualClose} settings={settings} />
            </div>
          )}

          {activeTab === 'signals' && (
             <SignalsPage initialSubTab="signals" />
          )}

          {activeTab === 'rejects' && (
             <SignalsPage initialSubTab="rejects" />
          )}

          {activeTab === 'health' && (
             <SystemHealthPage initialHealth={systemHealth || undefined} />
          )}

          {activeTab === 'risk' && (
             <RiskCenter settings={settings} onUpdateSettings={handleUpdateSettings} />
          )}
        </main>
      </div>

      {/* Live Strategy Health & Calculation Diagnostic Inspector */}
      <StrategyHealthInspector
        isOpen={strategyInspectorOpen}
        onClose={() => setStrategyInspectorOpen(false)}
        settings={settings}
        onToggleStrategy={handleToggleStrategy}
        onSetMultipleStrategies={handleSetMultipleStrategies}
        currentSymbol={selectedSymbol}
      />
      {/* Real-Time Trade Execution Popup Notification with Sound */}
      <TradeExecutionPopup
        notices={executedTradeNotices}
        onDismiss={handleDismissNotice}
        onViewPosition={(id, symbol) => {
          setActiveTab('positions');
          setExecutedTradeNotices((prev) => prev.filter((n) => n.id !== id));
        }}
        onInspectChart={(symbol) => {
          setSelectedSymbol(symbol);
          setActiveTab('chart');
          setExecutedTradeNotices((prev) => prev.filter((n) => n.symbol !== symbol));
        }}
      />
    </div>
  );
}
