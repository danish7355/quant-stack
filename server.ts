import express from "express";
import dns from "node:dns";
try {
  dns.setDefaultResultOrder("ipv4first");
} catch (_) {}
import path from "path";
import fs from "fs";
import expressWs from "express-ws";
import { WebSocket } from "ws";
import { exec } from "child_process";
import { promisify } from "util";
const execAsync = promisify(exec);
import { db } from "./server/firebase.js";
import { COLLECTIONS } from "./server/dbCollections.js";
import { collection, query, where, getDocs, orderBy, limit, writeBatch, deleteDoc, doc } from "firebase/firestore";
import { oms } from "./server/services/OMS.js";
import { executionAdapter } from "./server/services/ExecutionAdapter.js";
import { riskManager } from "./server/services/RiskManager.js";
import { priceStream } from "./server/services/PriceStream.js";
import { positionMonitor } from "./server/services/PositionMonitor.js";
import { telegramService } from "./server/services/TelegramService.js";
import { autoTrader } from "./server/services/AutoTrader.js";
import { marketBreadthService } from "./server/services/MarketBreadthService.js";
import { userDataStreamService } from "./server/services/UserDataStreamService.js";
import { reconciliationWorker } from "./server/services/PositionReconciliationWorker.js";
import { getSignalAudits } from "./server/services/SignalAuditService.js";
import { getSettingsAudits } from "./server/services/SettingsAuditService.js";
import { validateTradingSettings } from "./src/shared/TradingSettings.js";
import { isQuotaExhausted, getRecentTradeLogsFromDisk, readLocalJson } from "./server/services/firestoreSafe.js";
import { backtestJobManager } from "./server/services/BacktestJobManager.js";

async function startServer() {
  const { app } = expressWs(express());
  
  const PORT = 3000;
  
  console.log(`🔥 Starting Trading Engine on port ${PORT}...`);

  // Body parser
  app.use(express.json());

  // Connected browser UI WebSocket clients
  const clients = new Set<any>();

  // Helper to mask sensitive credentials before transmitting over WebSocket / REST
  const sanitizeSettingsForClient = (settings: any) => {
    if (!settings) return {};
    const safeSettings = { ...settings };
    if (safeSettings.binanceApiKey) {
      safeSettings.binanceApiKey = safeSettings.binanceApiKey.slice(0, 4) + '****' + safeSettings.binanceApiKey.slice(-4);
    }
    if (safeSettings.binanceApiSecret) {
      safeSettings.binanceApiSecret = '••••••••';
    }
    if (safeSettings.telegramBotToken) {
      safeSettings.telegramBotToken = safeSettings.telegramBotToken.slice(0, 6) + '****';
    }
    if (safeSettings.githubPat) {
      safeSettings.githubPat = safeSettings.githubPat.slice(0, 4) + '****';
    }
    return safeSettings;
  };

  // Broadcast structured event to all active UI WebSocket clients
  const broadcastWsEvent = (type: string, data: any) => {
    if (clients.size === 0) return;
    const msg = JSON.stringify({ type, data, timestamp: Date.now() });
    for (const client of clients) {
      if (client.readyState === 1) { // OPEN
        try {
          client.send(msg);
        } catch (e) {}
      }
    }
  };

  // Wire PositionMonitor changes to instant WebSocket broadcasting
  positionMonitor.onPositionsChange((positions) => {
    broadcastWsEvent('POSITIONS_UPDATE', positions);
  });

  // Wire BacktestJobManager updates to instant WebSocket broadcasting
  backtestJobManager.onJobUpdate = (job) => {
    broadcastWsEvent('BACKTEST_PROGRESS', job);
  };

  // Synchronize ExecutionAdapter and UserDataStreamService with settings
  const syncExecutionModes = (settings: any) => {
    if (!settings) return;
    const isLive = settings.tradingMode === 'LIVE';
    const apiKey = settings.binanceApiKey || '';
    const secret = settings.binanceApiSecret || '';
    const isTestnet = settings.binanceTestnet !== false;

    if (isLive && apiKey && secret) {
      executionAdapter.unlockLiveMode('I_ACKNOWLEDGE_RISK_AND_ENABLE_LIVE_TRADING');
      executionAdapter.setMode(true, apiKey, secret);
      userDataStreamService.setMode(true, apiKey, isTestnet);
    } else {
      executionAdapter.setMode(false);
      userDataStreamService.setMode(false);
    }
  };

  // Initialize execution adapter & user stream modes from boot settings
  syncExecutionModes(autoTrader.getSettings());

  // Wire AutoTrader settings changes to instant WebSocket broadcasting
  autoTrader.onSettingsChanged = (newSettings: any) => {
    syncExecutionModes(newSettings);
    broadcastWsEvent('SETTINGS_UPDATE', sanitizeSettingsForClient(newSettings));
  };

  // Keepalive heartbeat ping for connected clients every 15s to prevent proxy timeouts
  setInterval(() => {
    for (const client of clients) {
      if (client.readyState === 1) {
        try {
          client.ping();
        } catch (e) {}
      }
    }
  }, 15000);

  // Subscribe server-side to the 24/7 Binance Futures price stream
  // and broadcast live price ticks to connected browser interfaces
  priceStream.subscribe((priceMap, batch) => {
    if (clients.size > 0 && batch.length > 0) {
      const msg = JSON.stringify(batch);
      for (const client of clients) {
        if (client.readyState === 1) { // OPEN
          try {
            client.send(msg);
          } catch (e) {}
        }
      }
    }
  });

  // Client WebSocket endpoint
  app.ws("/ws/binance", (ws, req) => {
    console.log(`[WS] UI Client connected from ${req.ip || 'unknown'}`);
    clients.add(ws);
    // Send immediate cached prices on connect
    const currentPrices = priceStream.getAllPrices();
    if (currentPrices.length > 0) {
      try {
        ws.send(JSON.stringify(currentPrices));
      } catch (e) {}
    }

    // Send immediate initial state snapshots
    try {
      ws.send(JSON.stringify({
        type: 'ENGINE_STATUS',
        data: {
          engineRunning: autoTrader.isEngineActive(),
          autoTradeEnabled: autoTrader.getSettings().autoTradeEnabled,
          globalFilterActive: autoTrader.isGlobalFilterPausing(),
          globalFilterReason: autoTrader.getGlobalFilterBlockReason()
        },
        timestamp: Date.now()
      }));

      ws.send(JSON.stringify({
        type: 'SETTINGS_UPDATE',
        data: sanitizeSettingsForClient(autoTrader.getSettings()),
        timestamp: Date.now()
      }));

      ws.send(JSON.stringify({
        type: 'POSITIONS_UPDATE',
        data: positionMonitor.getActivePositions(),
        timestamp: Date.now()
      }));
    } catch (e) {}

    ws.on('close', () => {
      console.log(`[WS] UI Client disconnected`);
      clients.delete(ws);
    });
    ws.on('error', () => clients.delete(ws));
  });

  // Cached symbols memory
  let cachedSymbols: string[] = [];
  let lastSymbolsFetchTime = 0;

  // Define API routes
  app.get("/api/debug", (req, res) => {
  res.json({
    pricesLength: priceStream.getAllPrices().length
  });
});
  app.get("/api/health", (req, res) => {
    const isEngineActive = autoTrader.isEngineActive();
    const isStale = priceStream.isStale;
    const globalFilterActive = autoTrader.isGlobalFilterPausing();
    const globalFilterReason = autoTrader.getGlobalFilterBlockReason();
    const activePositions = positionMonitor.getActivePositions().length;
    const currentSettings = autoTrader.getSettings();
    const maxConcurrentTrades = currentSettings.maxConcurrentTrades || 3;
    const dailyLossPct = riskManager.getDailyLossPct();
    const dailyLossLimitPct = riskManager.getDailyLossLimitPct();
    const consecutiveLosses = riskManager.getConsecutiveLosses();
    const maxConsecutiveLosses = riskManager.getMaxConsecutiveLosses();
    const killSwitchActive = Boolean(currentSettings.killSwitchActive);
    const scanDiag = autoTrader.getScanDiagnostics();

    const activeBlockers: string[] = [];
    if (!isEngineActive || currentSettings.autoTradeEnabled === false) {
      activeBlockers.push('Trade Engine is STOPPED. Autonomous scanning and order execution are paused.');
    }
    if (killSwitchActive) {
      activeBlockers.push('Emergency Kill Switch is ENGAGED. All order placement is halted.');
    }
    if (isStale) {
      activeBlockers.push('Market data stream is STALE (>10s without ticks). New entries paused for price integrity.');
    }
    if (globalFilterActive) {
      activeBlockers.push(globalFilterReason || 'Global BTC Macro Safety Filter is pausing altcoin entries.');
    }
    if (!currentSettings.bypassMaxPositions && activePositions >= maxConcurrentTrades) {
      activeBlockers.push(`Max concurrent positions reached (${activePositions}/${maxConcurrentTrades}). Order entry paused until a position closes.`);
    }
    if (!currentSettings.bypassDailyLossLimit && dailyLossPct <= dailyLossLimitPct) {
      activeBlockers.push(`Daily loss limit reached (${dailyLossPct.toFixed(2)}% / ${dailyLossLimitPct}%). Autonomous trading locked.`);
    }
    if (!currentSettings.bypassMaxConsecutiveLosses && consecutiveLosses >= maxConsecutiveLosses) {
      activeBlockers.push(`Consecutive loss limit reached (${consecutiveLosses}/${maxConsecutiveLosses} losses). Cooling down.`);
    }
    if (currentSettings.tradingMode === 'LIVE' && (!currentSettings.binanceApiKey || !currentSettings.binanceApiSecret)) {
      activeBlockers.push('Live Trading is active but Binance API Key or Secret is missing.');
    }

    const isLive = executionAdapter.getIsLive();
    const isPaper = currentSettings.tradingMode === 'PAPER';

    let userStreamStatus: 'CONNECTED' | 'STALE' | 'DISCONNECTED' = 'DISCONNECTED';
    let userStreamDetails = '';
    const userStreamMode: 'PAPER' | 'LIVE' = isPaper ? 'PAPER' : 'LIVE';

    if (isPaper) {
      userStreamStatus = 'CONNECTED';
      userStreamDetails = 'Paper Mode: Real-time internal OMS position & balance stream active';
    } else if (isLive) {
      userStreamStatus = userDataStreamService.isConnected() ? 'CONNECTED' : (userDataStreamService.isStale() ? 'STALE' : 'DISCONNECTED');
      userStreamDetails = userDataStreamService.getDetails();
    } else {
      userStreamStatus = 'DISCONNECTED';
      userStreamDetails = 'Live Trading: Missing or unauthenticated Binance API credentials';
    }

    const lastReconTime = reconciliationWorker.getLastReconciliationTime();
    const lastReconciliationAt = lastReconTime 
      ? new Date(lastReconTime).toLocaleTimeString() 
      : (isPaper ? 'Active (Paper OMS)' : 'Pending');

    res.json({ 
      status: "ok", 
      engine: isEngineActive ? 'RUNNING' : 'PAUSED',
      marketData: isStale ? 'STALE' : 'CONNECTED',
      userStream: userStreamStatus,
      userStreamDetails,
      userStreamMode,
      lastReconciliationAt,
      tradingBlocked: activeBlockers.length > 0 || autoTrader.isGlobalFilterPausing() || Boolean(currentSettings.killSwitchActive),
      blockReason: activeBlockers.length > 0 ? activeBlockers[0] : undefined,
      activeBlockers,
      globalFilterActive,
      globalFilterReason,
      timestamp: new Date().toISOString(),
      activePositions,
      maxConcurrentTrades,
      dailyLossPct,
      dailyLossLimitPct,
      consecutiveLosses,
      maxConsecutiveLosses,
      telegramConfigured: telegramService.isConfigured(),
      lastScanTime: scanDiag.lastScanCompletedTime,
      lastScanDurationMs: scanDiag.lastScanDurationMs,
      lastScannedCoins: scanDiag.lastScannedPairCount,
      lastScanQualifiedSignals: scanDiag.lastScanQualifiedCount
    });
  });

  app.get("/api/bot/prices", async (req, res) => {
    try {
      const prices = priceStream.getAllPrices();
      res.json(prices);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  app.get("/api/binance/proxy", async (req, res) => {
    try {
      const { path, ...queryParams } = req.query;
      const url = new URL(`https://fapi.binance.com${path || ''}`);
      for (const [key, val] of Object.entries(queryParams)) {
        if (typeof val === 'string') {
          url.searchParams.append(key, val);
        } else if (Array.isArray(val)) {
          val.forEach(v => url.searchParams.append(key, String(v)));
        } else if (val !== undefined && val !== null) {
          url.searchParams.append(key, String(val));
        }
      }
      const response = await fetch(url.toString());
      if (!response.ok) {
        return res.status(response.status).json({ error: 'Binance API error', statusText: response.statusText });
      }
      const data = await response.json();
      res.json(data);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  app.get("/api/regime/threelayer", async (req, res) => {
    try {
      const force = req.query.force === 'true';
      const regime = await autoTrader.getThreeLayerRegime(force);
      res.json(regime);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  app.get("/api/regime/breadth", async (req, res) => {
    try {
      const force = req.query.force === 'true';
      const breadth = await marketBreadthService.getCumulativeBreadth(autoTrader.getSettings().coinCount || 100, force);
      res.json(breadth);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });
  
  app.get("/api/bot/symbols", async (req, res) => {
    try {
      const now = Date.now();
      if (cachedSymbols.length > 0 && now - lastSymbolsFetchTime < 300000) { // 5 min cache
        return res.json(cachedSymbols);
      }
      const symbols = await executionAdapter.getActivePerpetualSymbols();
      if (symbols && symbols.length > 0) {
        cachedSymbols = symbols;
        lastSymbolsFetchTime = now;
      }
      res.json(cachedSymbols.length > 0 ? cachedSymbols : symbols);
    } catch(e) {
      res.status(500).json({ error: String(e) });
    }
  });

  app.get("/api/bot/settings", (req, res) => {
    try {
      const settings = autoTrader.getSettings();
      res.json(sanitizeSettingsForClient(settings));
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  app.get("/api/bot/engine/status", (req, res) => {
    try {
      const scanDiag = autoTrader.getScanDiagnostics();
      const settings = autoTrader.getSettings();
      const activePositions = positionMonitor.getActivePositions().length;
      const maxConcurrentTrades = settings.maxConcurrentTrades || 3;
      const globalFilterActive = autoTrader.isGlobalFilterPausing();
      const globalFilterReason = autoTrader.getGlobalFilterBlockReason();
      const isEngineActive = autoTrader.isEngineActive();
      const isStale = priceStream.isStale;

      const activeBlockers: string[] = [];
      if (!isEngineActive || settings.autoTradeEnabled === false) {
        activeBlockers.push('Trade Engine is STOPPED');
      }
      if (settings.killSwitchActive) {
        activeBlockers.push('Emergency Kill Switch is ENGAGED');
      }
      if (isStale) {
        activeBlockers.push('Market data stream is STALE');
      }
      if (globalFilterActive) {
        activeBlockers.push(globalFilterReason || 'Global BTC Macro Safety Filter active');
      }
      if (activePositions >= maxConcurrentTrades) {
        activeBlockers.push(`Max concurrent positions reached (${activePositions}/${maxConcurrentTrades})`);
      }

      res.json({
        engineRunning: isEngineActive,
        autoTradeEnabled: settings.autoTradeEnabled,
        globalFilterActive,
        globalFilterReason,
        activePositions,
        maxConcurrentTrades,
        activeBlockers,
        isBlocked: activeBlockers.length > 0,
        lastScanTime: scanDiag.lastScanCompletedTime,
        lastScannedCoins: scanDiag.lastScannedPairCount
      });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  app.post("/api/bot/engine/start", async (req, res) => {
    try {
      autoTrader.startLoop();
      const updated = await autoTrader.saveSettings({ autoTradeEnabled: true });
      broadcastWsEvent('ENGINE_STATUS', {
        engineRunning: true,
        autoTradeEnabled: true,
        globalFilterActive: autoTrader.isGlobalFilterPausing(),
        globalFilterReason: autoTrader.getGlobalFilterBlockReason()
      });
      broadcastWsEvent('SETTINGS_UPDATE', sanitizeSettingsForClient(updated));
      res.json({ success: true, engineRunning: true, message: "Engine started. Autonomous scanning & new trade execution active." });
    } catch (e) {
      res.status(500).json({ success: false, error: String(e) });
    }
  });

  app.post("/api/bot/engine/stop", async (req, res) => {
    try {
      autoTrader.stopLoop();
      const updated = await autoTrader.saveSettings({ autoTradeEnabled: false });
      broadcastWsEvent('ENGINE_STATUS', {
        engineRunning: false,
        autoTradeEnabled: false,
        globalFilterActive: autoTrader.isGlobalFilterPausing(),
        globalFilterReason: autoTrader.getGlobalFilterBlockReason()
      });
      broadcastWsEvent('SETTINGS_UPDATE', sanitizeSettingsForClient(updated));
      res.json({ success: true, engineRunning: false, message: "Engine stopped. All new trade execution halted." });
    } catch (e) {
      res.status(500).json({ success: false, error: String(e) });
    }
  });

  app.get("/api/bot/regime", async (req, res) => {
    try {
      const force = req.query.refresh === 'true';
      const regime = await autoTrader.getGlobalRegime(force);
      res.json(regime);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  app.get("/api/coindcx/regime", async (req, res) => {
    try {
      const symbol = (req.query.symbol as string) || autoTrader.getSettings().coindcxRegimeSymbol || 'BTCUSDT';
      const regimeData = await autoTrader.getCoinDcxRegime(symbol);
      res.json(regimeData);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  app.post("/api/coindcx/regime/apply", async (req, res) => {
    try {
      const { settingsToApply } = req.body;
      if (!settingsToApply || typeof settingsToApply !== 'object') {
        return res.status(400).json({ error: 'settingsToApply object required' });
      }
      const current = autoTrader.getSettings();
      const updated = await autoTrader.saveSettings({
        ...current,
        ...settingsToApply,
        updatedAt: new Date().toISOString()
      }, 'FRONTEND');
      res.json({ success: true, settings: updated });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  app.get("/api/bot/balance", async (req, res) => {
    try {
      const settings = autoTrader.getSettings();
      res.json({
        demoBalance: settings.demoBalance,
        startingBalance: settings.startingBalance,
        equitySnapshots: settings.equitySnapshots || []
      });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  app.post("/api/bot/settings", async (req, res) => {
    try {
      const payload = { ...req.body };
      delete payload.demoBalance;
      delete payload.equitySnapshots;
      // Strip masked credentials that came from the S3-masked GET response
      const maskedPatterns = ['****', '••••'];
      for (const credField of ['binanceApiKey', 'binanceApiSecret', 'telegramBotToken', 'githubPat']) {
        const val = payload[credField];
        if (typeof val === 'string' && maskedPatterns.some(p => val.includes(p))) {
          delete payload[credField];
        }
      }
      // Server-side validation: clamp numeric fields to safe ranges
      const numericBounds: Record<string, [number, number]> = {
        leverage: [1, 125],
        positionSizePct: [0.1, 100],
        accountRiskPct: [0.1, 10],
        maxConcurrentTrades: [1, 50],
        maxConsecutiveLosses: [1, 20],
        dailyLossLimitPct: [0.5, 25],
        maxPortfolioExposurePct: [10, 1000],
        minLiquidationBuffer: [1.01, 3.0],
        maxSinglePositionExposureMult: [1, 50],
        minStopDistancePct: [0.0005, 0.05],
        tradeCooldownSeconds: [0, 600],
        maxDrawdownPct: [1, 50],
        autoTradeThreshold: [50, 100],
        scanInterval: [5, 3600],
        coinCount: [5, 100],
        tp1AtrMultiple: [0.5, 10],
        tp2AtrMultiple: [1, 10],
        tp3FibLevel: [1, 5],
        slAtrMultiple: [0.3, 5],
        minRRRatio: [1, 10],
        trailActivationR: [0.5, 5],
        smcStructureLen: [3, 50],
        smcWickRatio: [0.2, 2.0],
        smcMinSweepWickPct: [0.0005, 0.05],
        smcDispAtrMult: [0.2, 5.0],
        smcSweepConfirmWindow: [3, 50],
        smcVolMult: [1.0, 5.0],
        smcFvgAfterMssWindow: [2, 30],
        smcObLookback: [10, 100],
        smcAtrStopMult: [0.5, 5.0],
        smcRrRatio: [1.5, 10.0],
        tpbEmaFast: [5, 100],
        tpbEmaSlow: [20, 200],
        tpbAdxMin: [10, 50],
        tpbMinVolumeRatio: [0.5, 5.0],
        tpbMaxEntryDistanceAtr: [0.1, 3.0],
        tpbMinStopDistanceAtr: [0.2, 2.0],
        tpbMaxStopDistanceAtr: [1.0, 6.0],
        tpbMaxSpreadAtr: [0.05, 1.0],
        tpbMinScore: [5, 10],
        rmrMaxAdx: [10, 40],
        rmrMaxAtrRatio: [1.0, 2.0],
        rmrMinScore: [5, 11],
        rmrOuterRangePct: [0.10, 0.35],
        rmrMinRrRatio: [1.0, 5.0],
        vcbChecklistMinScore: [5, 11],
        vcbMinRrRatio: [1.5, 5.0],
      };
      const validationErrors: string[] = [];
      for (const [field, [min, max]] of Object.entries(numericBounds)) {
        if (payload[field] !== undefined) {
          const val = Number(payload[field]);
          if (isNaN(val)) {
            validationErrors.push(`${field} must be a number, got: ${payload[field]}`);
            delete payload[field];
          } else {
            payload[field] = Math.max(min, Math.min(max, val));
          }
        }
      }
      if (validationErrors.length > 0) {
        console.warn('[Settings Validation]', validationErrors);
      }
      // Sync rule: If operator sets a custom score threshold (> 50), purge any stale RISK_threshold bypass
      const targetThreshold = payload.autoTradeThreshold !== undefined ? Number(payload.autoTradeThreshold) : autoTrader.getSettings().autoTradeThreshold;
      if (targetThreshold && targetThreshold > 50) {
        if (payload.disabledGates) {
          delete payload.disabledGates.RISK_threshold;
          delete payload.disabledGates.risk_threshold;
        }
        const currentDg = autoTrader.getSettings().disabledGates;
        if (currentDg && (currentDg.RISK_threshold || currentDg.risk_threshold)) {
          const cleanedDg = { ...currentDg };
          delete cleanedDg.RISK_threshold;
          delete cleanedDg.risk_threshold;
          payload.disabledGates = { ...(payload.disabledGates || {}), ...cleanedDg };
          delete payload.disabledGates.RISK_threshold;
          delete payload.disabledGates.risk_threshold;
        }
      }
      // Add metadata
      payload.updatedAt = new Date().toISOString();
      payload.settingsVersion = (autoTrader.getSettings().settingsVersion || 0) + 1;
      const updated = await autoTrader.saveSettings(payload);
      syncExecutionModes(updated);
      broadcastWsEvent('SETTINGS_UPDATE', sanitizeSettingsForClient(updated));
      if (payload.autoTradeEnabled !== undefined) {
        broadcastWsEvent('ENGINE_STATUS', {
          engineRunning: autoTrader.isEngineActive(),
          autoTradeEnabled: updated.autoTradeEnabled,
          globalFilterActive: autoTrader.isGlobalFilterPausing(),
          globalFilterReason: autoTrader.getGlobalFilterBlockReason()
        });
      }
      res.json({ 
        success: true, 
        settings: sanitizeSettingsForClient(updated),
        engineStatus: {
          applied: true,
          activeVersion: updated.settingsVersion || 1
        },
        ...(validationErrors.length > 0 && { validationWarnings: validationErrors })
      });
    } catch (e) {
      res.status(500).json({ success: false, error: String(e) });
    }
  });

  // Settings Audit Trail endpoint (Milestone 4 / Phase 13)
  app.get("/api/settings/audit", (req, res) => {
    try {
      const audits = getSettingsAudits(100);
      res.json(audits);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  // Settings Health & Version Alignment endpoint (Milestone 5 / Phase 12)
  app.get("/api/settings/health", (req, res) => {
    try {
      const current = autoTrader.getSettings();
      const activeVersion = autoTrader.getActiveSettingsVersion();
      res.json({
        dbVersion: activeVersion,
        engineVersion: activeVersion,
        engineRunning: autoTrader.isEngineActive(),
        lastSaved: current.updatedAt || new Date().toISOString(),
        lastApplied: current.updatedAt || new Date().toISOString(),
        status: "SYNCHRONIZED",
        tradingMode: current.tradingMode || 'PAPER',
        activeStrategy: current.activeStrategy,
        accountRiskPct: current.accountRiskPct,
        dailyLossLimitPct: current.dailyLossLimitPct,
        bypassDailyLossLimit: Boolean(current.bypassDailyLossLimit),
        currentDailyLossPct: riskManager.getDailyLossPct(),
        maxConcurrentTrades: current.maxConcurrentTrades,
        bypassMaxPositions: Boolean(current.bypassMaxPositions),
        maxConsecutiveLosses: current.maxConsecutiveLosses || 4,
        bypassMaxConsecutiveLosses: Boolean(current.bypassMaxConsecutiveLosses),
        consecutiveLosses: riskManager.getConsecutiveLosses(),
        maxPortfolioExposurePct: current.maxPortfolioExposurePct ?? 100,
        bypassExposureLimit: Boolean(current.bypassExposureLimit),
        minLiquidationBuffer: current.minLiquidationBuffer ?? 1.3,
        bypassLiquidationBuffer: Boolean(current.bypassLiquidationBuffer),
        maxSinglePositionExposureMult: current.maxSinglePositionExposureMult ?? 5,
        minStopDistancePct: current.minStopDistancePct ?? 0.005,
        tradeCooldownSeconds: current.tradeCooldownSeconds ?? 60,
        bypassTradeCooldown: Boolean(current.bypassTradeCooldown),
        allowFractionalContracts: current.allowFractionalContracts !== false,
        killSwitchActive: riskManager.isKillSwitchActive(),
        leverage: current.leverage
      });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  // Risk Manager Reset Consecutive Losses Endpoint
  app.post("/api/risk/reset-losses", (req, res) => {
    try {
      riskManager.resetConsecutiveLosses();
      console.log('🛡️ [RiskManager] Consecutive losses streak reset to 0 by user request.');
      res.json({ success: true, consecutiveLosses: 0 });
    } catch (e) {
      res.status(500).json({ success: false, error: String(e) });
    }
  });

  // Risk Manager Reset Daily Loss Stats Endpoint
  app.post("/api/risk/reset-daily-loss", (req, res) => {
    try {
      riskManager.resetDailyLoss();
      console.log('🛡️ [RiskManager] Daily loss stats reset to 0% by user request.');
      res.json({ success: true, dailyLossPct: 0 });
    } catch (e) {
      res.status(500).json({ success: false, error: String(e) });
    }
  });

  // Risk Manager Emergency Kill Switch Toggle Endpoint
  app.post("/api/risk/toggle-kill-switch", async (req, res) => {
    try {
      const active = req.body?.active !== undefined ? Boolean(req.body.active) : !riskManager.isKillSwitchActive();
      riskManager.setKillSwitch(active);
      const updated = await autoTrader.saveSettings({ killSwitchActive: active });
      broadcastWsEvent('SETTINGS_UPDATE', sanitizeSettingsForClient(updated));
      console.log(`🛡️ [RiskManager] Kill switch ${active ? 'ENGAGED' : 'DISENGAGED'} by user request.`);
      res.json({ success: true, killSwitchActive: active });
    } catch (e) {
      res.status(500).json({ success: false, error: String(e) });
    }
  });

  // Canonical Phase 6 endpoints
  app.get("/api/settings/trading", (req, res) => {
    try {
      const settings = autoTrader.getSettings();
      res.json(sanitizeSettingsForClient(settings));
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  app.post("/api/settings/trading/validate", (req, res) => {
    try {
      const result = validateTradingSettings(req.body);
      res.json(result);
    } catch (e) {
      res.status(400).json({ valid: false, errors: [String(e)], warnings: [], sanitized: {} });
    }
  });

  // ─── BACKTEST API ENDPOINTS ────────────────────────────────────────────────
  const AVAILABLE_BACKTEST_STRATEGIES = [
    { id: 'EMA5_EXACT_ENTRY_V2', name: 'EMA 5 Exact Entry V2', description: 'Exact Alert-Break entry with multi-timeframe level targets & fee-drag protection', priority: 1, regime: 'TRENDING' },
    { id: 'TREND_PULLBACK', name: 'Trend EMA Pullback', description: 'Confirmed pullback to dynamic value area in directional trend', priority: 1, regime: 'TRENDING' },
    { id: 'VOLATILITY_COMPRESSION', name: 'VCB Breakout', description: 'Volatility compression breakout with volume confirmation', priority: 1, regime: 'COMPRESSION' },
    { id: 'EARLY_COIL_BREAKOUT', name: 'Early Coil Breakout', description: 'Fractal compression breakout with structural trigger', priority: 2, regime: 'COMPRESSION' },
    { id: 'BINANCE_COMPOSITE', name: 'Range Mean Reversion', description: 'Bollinger Band extreme & RSI re-entry inside verified range', priority: 1, regime: 'RANGING' },
    { id: 'SMC_LIQUIDITY_SWEEP', name: 'LSR Liquidity Sweep', description: 'Protected structure sweep and institutional FVG retest', priority: 2, regime: 'EXHAUSTION' },
  ];

  app.get("/api/backtest/strategies", (req, res) => {
    res.json(AVAILABLE_BACKTEST_STRATEGIES);
  });

  app.post("/api/backtest/run", async (req, res) => {
    try {
      const {
        strategies,
        symbols,
        execTf = '15m',
        dirTf = '1h',
        from,
        to,
        capital = 10000,
        riskSettings,
        strategyParams,
        fees,
        slippagePct,
        mode = 'portfolio'
      } = req.body;

      if (!Array.isArray(strategies) || strategies.length === 0) {
        return res.status(400).json({ error: 'At least one strategy must be selected.' });
      }

      if (!Array.isArray(symbols) || symbols.length === 0) {
        return res.status(400).json({ error: 'At least one symbol must be selected.' });
      }

      const fromMs = Number(from) || (Date.now() - 30 * 24 * 3600 * 1000);
      const toMs = Number(to) || Date.now();

      if (fromMs >= toMs) {
        return res.status(400).json({ error: 'Start date must be earlier than end date.' });
      }

      const jobId = backtestJobManager.startJob({
        strategies,
        symbols,
        execTf,
        dirTf,
        from: fromMs,
        to: toMs,
        capital: Number(capital) || 10000,
        riskSettings,
        strategyParams,
        fees,
        slippagePct: slippagePct !== undefined ? Number(slippagePct) : 0.05,
        mode: mode === 'single' ? 'single' : 'portfolio'
      });

      res.json({ success: true, jobId });
    } catch (e: any) {
      console.error('[POST /api/backtest/run] Error:', e);
      res.status(500).json({ error: e?.message || String(e) });
    }
  });

  app.get("/api/backtest/jobs", (req, res) => {
    try {
      res.json(backtestJobManager.getAllJobs());
    } catch (e: any) {
      res.status(500).json({ error: String(e) });
    }
  });

  app.get("/api/backtest/:id", (req, res) => {
    try {
      const job = backtestJobManager.getJob(req.params.id);
      if (!job) {
        return res.status(404).json({ error: 'Backtest job not found.' });
      }
      res.json(job);
    } catch (e: any) {
      res.status(500).json({ error: String(e) });
    }
  });

  app.get("/api/backtest/:id/progress", (req, res) => {
    try {
      const job = backtestJobManager.getJob(req.params.id);
      if (!job) {
        return res.status(404).json({ error: 'Backtest job not found.' });
      }

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders?.();

      backtestJobManager.registerSseClient(req.params.id, res);
    } catch (e: any) {
      res.status(500).json({ error: String(e) });
    }
  });

  app.post("/api/backtest/:id/cancel", (req, res) => {
    try {
      const ok = backtestJobManager.cancelJob(req.params.id);
      res.json({ success: ok });
    } catch (e: any) {
      res.status(500).json({ error: String(e) });
    }
  });

  app.post("/api/bot/telegram/test", async (req, res) => {
    try {
      const { botToken, chatId } = req.body;
      if (botToken && !botToken.includes('****') && !botToken.includes('••••')) {
        telegramService.updateConfig(botToken, chatId);
      } else if (chatId) {
        telegramService.updateConfig(undefined, chatId);
      }
      const success = await telegramService.sendMessage(
        `🤖 <b>Telegram Alerts Connected!</b> 🚀\n\n` +
        `Your 24/7 Crypto Futures Auto-Trade Bot is online and actively monitoring live Binance markets.\n` +
        `You will receive real-time notifications whenever a trade is executed, take-profit is reached, or stop-loss is triggered.\n\n` +
        `⏰ <i>Connected at ${new Date().toUTCString()}</i>`
      );
      if (success) {
        res.json({ success: true, message: "Telegram test message sent successfully!" });
      } else {
        const errorDetail = telegramService.getLastError() || "Failed to send message. Please verify your Bot Token and Chat ID.";
        res.status(400).json({ success: false, error: errorDetail });
      }
    } catch (e) {
      res.status(500).json({ success: false, error: String(e) });
    }
  });

  app.post("/api/bot/telegram/notify", async (req, res) => {
    try {
      const { text } = req.body;
      if (!text) return res.status(400).json({ success: false, error: "Missing text parameter" });
      const success = await telegramService.sendMessage(text);
      res.json({ success, error: success ? undefined : telegramService.getLastError() });
    } catch (e) {
      res.status(500).json({ success: false, error: String(e) });
    }
  });

  app.get("/api/positions", async (req, res) => {
    try {
      // 1. Instant response from live in-memory PositionMonitor (with real-time WebSocket tick prices)
      const local = positionMonitor.getActivePositions();
      if (local && local.length > 0) {
        return res.json(local);
      }

      // 2. Check local disk store
      const onDisk = readLocalJson<any[]>('positions.json', []).filter((p: any) => p && p.status === 'OPEN');
      if (onDisk.length > 0) {
        return res.json(onDisk);
      }

      // 3. Fallback to Firestore with non-blocking safe timeout
      if (!isQuotaExhausted()) {
        const q = query(collection(db, COLLECTIONS.POSITIONS), where('status', '==', 'OPEN'));
        const { safeGetDocs } = await import('./server/services/firestoreSafe.js');
        const snap = await safeGetDocs(q);
        if (snap.success && snap.docs.length > 0) {
          const positions = snap.docs.map(doc => doc.data());
          return res.json(positions);
        }
      }

      res.json([]);
    } catch(e) {
      const local = positionMonitor.getActivePositions();
      res.json(local.length > 0 ? local : readLocalJson('positions.json', []));
    }
  });

  app.get("/api/trade_logs", async (req, res) => {
    try {
      if (isQuotaExhausted()) {
        return res.json(getRecentTradeLogsFromDisk(100));
      }
      const q = query(collection(db, COLLECTIONS.TRADE_LOGS), orderBy('time_close', 'desc'), limit(100));
      const snapshot = await getDocs(q);
      const logs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      res.json(logs);
    } catch(e) {
      res.json(getRecentTradeLogsFromDisk(100));
    }
  });

  app.get("/api/signal_audit", async (req, res) => {
    try {
      const limitParam = parseInt(req.query.limit as string) || 100;
      const logs = getSignalAudits(limitParam);
      res.json(logs);
    } catch(e) {
      res.status(500).json({ error: String(e) });
    }
  });

  app.post("/api/bot/trade", async (req, res) => {
    try {
      if (!autoTrader.isEngineActive()) {
        return res.status(403).json({ 
          success: false, 
          error: "Trading engine is STOPPED. New trade execution is blocked." 
        });
      }
      const { symbol, direction, price, quantity, leverage, allocatedBalance, score, atr, sl, tp1, tp2, tp3, strategy, frequencyPreset, marketRegime, isAutoRegime } = req.body;
      if (!symbol || !direction || !price) {
        return res.status(400).json({ success: false, error: "Missing required trade fields (symbol, direction, price)" });
      }
      const customOpts = { qty: quantity, leverage, allocatedBalance, sl, tp1, tp2, tp3, strategy, frequencyPreset: frequencyPreset || 'MEDIUM', marketRegime, isAutoRegime };
      const posId = await oms.placeOrder(symbol, direction, price, score || 100, atr || (price * 0.01), customOpts);
      if (!posId) {
        return res.status(400).json({ success: false, error: "Risk manager rejected or order already processing" });
      }
      await positionMonitor.refreshOpenPositions();
      broadcastWsEvent('POSITIONS_UPDATE', positionMonitor.getActivePositions());
      res.json({ success: true, posId });
    } catch(e: any) {
      console.error("Trade execution error:", e);
      res.status(500).json({ success: false, error: String(e?.message || e) });
    }
  });

  app.post("/api/bot/close", async (req, res) => {
    try {
      const id = req.body?.id || req.body?.positionId;
      const currentPrice = req.body?.currentPrice ?? req.body?.closePrice;
      const reason = req.body?.reason || req.body?.exitReason || 'MANUAL';
      if (!id) {
        return res.status(400).json({ success: false, error: "Missing position id" });
      }
      const pnl = await oms.closePosition(id, currentPrice, reason);
      await positionMonitor.refreshOpenPositions();
      broadcastWsEvent('POSITIONS_UPDATE', positionMonitor.getActivePositions());
      const s = autoTrader.getSettings();
      broadcastWsEvent('BALANCE_UPDATE', { demoBalance: s.demoBalance, startingBalance: s.startingBalance, equitySnapshots: s.equitySnapshots || [] });
      res.json({ success: true, pnl });
    } catch(e) {
      res.status(500).json({ error: String(e) });
    }
  });

  app.post("/api/bot/close-all-deleted", async (req, res) => {
    try {
      const settings = autoTrader.getSettings();
      const deleted = settings.deletedStrategies || [];
      const active = positionMonitor.getActivePositions();
      const targetPositions = active.filter(p => deleted.includes(p.strategy));
      const results = [];
      for (const pos of targetPositions) {
        const closePrice = pos.current_price || pos.entry_price || 0;
        const pnl = await oms.closePosition(pos.id, closePrice, 'STRATEGY_DELETED_MANUAL_CLOSE');
        results.push({ id: pos.id, symbol: pos.symbol, strategy: pos.strategy, pnl });
      }
      await positionMonitor.refreshOpenPositions();
      broadcastWsEvent('POSITIONS_UPDATE', positionMonitor.getActivePositions());
      const s = autoTrader.getSettings();
      broadcastWsEvent('BALANCE_UPDATE', { demoBalance: s.demoBalance, startingBalance: s.startingBalance, equitySnapshots: s.equitySnapshots || [] });
      res.json({ success: true, count: results.length, closed: results });
    } catch(e: any) {
      console.error("Error closing positions from deleted strategies:", e);
      res.status(500).json({ success: false, error: String(e?.message || e) });
    }
  });

  app.post("/api/bot/reset", async (req, res) => {
    try {
      riskManager.reset();
      const posSnapshot = await getDocs(collection(db, COLLECTIONS.POSITIONS));
      const posBatch = writeBatch(db);
      posSnapshot.docs.forEach((doc) => {
        posBatch.delete(doc.ref);
      });
      await posBatch.commit();
      
      const logsSnapshot = await getDocs(collection(db, COLLECTIONS.TRADE_LOGS));
      const logsBatch = writeBatch(db);
      logsSnapshot.docs.forEach((doc) => {
        logsBatch.delete(doc.ref);
      });
      await logsBatch.commit();
      
      const settings = autoTrader.getSettings();
      settings.demoBalance = settings.startingBalance || 10000;
      settings.equitySnapshots = [];
      const updated = await autoTrader.saveSettings(settings);
      
      await positionMonitor.refreshOpenPositions();
      broadcastWsEvent('POSITIONS_UPDATE', []);
      broadcastWsEvent('BALANCE_UPDATE', { demoBalance: updated.demoBalance, startingBalance: updated.startingBalance, equitySnapshots: [] });
      broadcastWsEvent('SETTINGS_UPDATE', sanitizeSettingsForClient(updated));
      res.json({ success: true });
    } catch(e) {
      res.status(500).json({ error: String(e) });
    }
  });

  app.post("/api/bot/flatten", async (req, res) => {
    try {
      const q = query(collection(db, COLLECTIONS.POSITIONS), where('status', '==', 'OPEN'));
      const snapshot = await getDocs(q);
      const positions = snapshot.docs.map(doc => doc.data());
      for (const p of positions) {
        await oms.closePosition(p.id, p.current_price, "FLATTEN");
      }
      await positionMonitor.refreshOpenPositions();
      broadcastWsEvent('POSITIONS_UPDATE', positionMonitor.getActivePositions());
      res.json({ success: true, message: `Flattened ${positions.length} positions.` });
    } catch(e) {
      res.status(500).json({ error: String(e) });
    }
  });

  app.get("/api/status", async (req, res) => {
    try {
      const globalRegime = await autoTrader.getGlobalRegime();
      res.json({ 
        status: autoTrader.isEngineActive() ? "24/7 Trading engine active." : "Trading engine STOPPED.", 
        engineRunning: autoTrader.isEngineActive(),
        stream: "Binance Futures Live WebSocket",
        activePositions: positionMonitor.getActivePositions().length,
        globalRegime
      });
    } catch (e) {
      res.json({
        status: autoTrader.isEngineActive() ? "24/7 Trading engine active." : "Trading engine STOPPED.",
        engineRunning: autoTrader.isEngineActive(),
        stream: "Binance Futures Live WebSocket",
        activePositions: positionMonitor.getActivePositions().length
      });
    }
  });

  app.post("/api/git/push", async (req, res) => {
    let { token, repoUrl, commitMessage = "Auto-commit from Trading Bot Settings UI", force = false } = req.body;
    
    // Resolve real token from stored settings if frontend sent masked/redacted value
    const storedSettings = autoTrader.getSettings();
    if (!token || typeof token !== 'string' || !token.trim() || token.includes('*') || token.includes('•')) {
      const diskSettings = readLocalJson<any>('settings.json', {});
      token = storedSettings.githubPat || diskSettings.githubPat || '';
    }

    if (!token || typeof token !== 'string' || !token.trim()) {
      return res.status(400).json({ success: false, error: "GitHub token required. Please provide a Personal Access Token with repo scope in Settings." });
    }

    const cleanToken = token.trim();

    if (!repoUrl || typeof repoUrl !== 'string' || !repoUrl.trim()) {
      const diskSettings = readLocalJson<any>('settings.json', {});
      repoUrl = storedSettings.githubRepoUrl || diskSettings.githubRepoUrl || 'https://github.com/danish7355/quant-stack.git';
    }

    const gitEnv = { ...process.env, GIT_TERMINAL_PROMPT: '0' };

    try {
      // 1. Ensure git global configuration is set universally
      await execAsync('git config --global --add safe.directory "*"', { env: gitEnv }).catch(() => {});
      await execAsync('git config --global user.name "AI Studio Bot"', { env: gitEnv }).catch(() => {});
      await execAsync('git config --global user.email "bot@aistudio.local"', { env: gitEnv }).catch(() => {});

      // 2. Ensure repository is initialized
      try {
        await execAsync('git rev-parse --is-inside-work-tree', { env: gitEnv });
      } catch {
        await execAsync('git init -b main', { env: gitEnv });
      }

      await execAsync('git config user.name "AI Studio Bot"', { env: gitEnv }).catch(() => {});
      await execAsync('git config user.email "bot@aistudio.local"', { env: gitEnv }).catch(() => {});
      await execAsync('git branch -M main', { env: gitEnv }).catch(() => {});

      // 3. Stage all files
      await execAsync('git add -A', { env: gitEnv });

      // 4. Commit changes if working tree is dirty, or ensure initial commit exists
      const statusRes = await execAsync('git status --porcelain', { env: gitEnv }).catch(() => ({ stdout: '' }));
      const hasChanges = statusRes.stdout && statusRes.stdout.trim().length > 0;
      
      if (hasChanges) {
        // Sanitize commit message to prevent command injection
        const safeMessage = (commitMessage || 'Auto-commit from Trading Bot Settings UI').replace(/[`$(){}|;&<>\\"]/g, '');
        await execAsync(`git commit -m "${safeMessage}"`, { env: gitEnv });
      } else {
        const hasCommits = await execAsync('git rev-parse --verify HEAD', { env: gitEnv }).then(() => true).catch(() => false);
        if (!hasCommits) {
          await execAsync('git commit --allow-empty -m "Initial commit from Trading Bot"', { env: gitEnv });
        }
      }

      // 5. Clean and format the repository URL with token authentication
      let rawRepo = (repoUrl || 'https://github.com/danish7355/quant-stack.git').trim();
      // Remove protocol and any existing embedded credentials
      let cleanRepo = rawRepo.replace(/^https?:\/\//i, '').replace(/^[^\/@]+@/i, '');
      if (!cleanRepo.startsWith('github.com/')) {
        cleanRepo = `github.com/${cleanRepo.replace(/^\/+/, '')}`;
      }
      if (!cleanRepo.endsWith('.git')) {
        cleanRepo = `${cleanRepo}.git`;
      }

      const authRepoUrl = `https://x-access-token:${encodeURIComponent(cleanToken)}@${cleanRepo}`;

      // 6. Set origin remote
      try {
        await execAsync(`git remote add origin ${authRepoUrl}`, { env: gitEnv });
      } catch {
        await execAsync(`git remote set-url origin ${authRepoUrl}`, { env: gitEnv });
      }

      // 7. Execute push with smart conflict resolution
      const pushCommand = force ? 'git push -u origin main --force' : 'git push -u origin main';
      
      try {
        await execAsync(pushCommand, { env: gitEnv });
      } catch (pushErr: any) {
        const errStr = pushErr.message || String(pushErr);
        if (errStr.includes('fetch first') || errStr.includes('non-fast-forward') || errStr.includes('Updates were rejected')) {
          if (force) {
            throw pushErr;
          }
          try {
            // Attempt to merge remote history with -X ours so local workspace code takes precedence without blocking conflicts
            await execAsync('git pull origin main --allow-unrelated-histories -X ours --no-edit', { env: gitEnv });
            await execAsync('git push -u origin main', { env: gitEnv });
          } catch (mergeErr) {
            await execAsync('git merge --abort', { env: gitEnv }).catch(() => {});
            throw new Error('Remote repository has conflicting commits. Enable "Force Push" in Settings to overwrite the remote repository.');
          }
        } else if (errStr.includes('Authentication failed') || errStr.includes('Invalid username or personal access token')) {
          throw new Error('GitHub Authentication failed: Please verify your Personal Access Token has the "repo" scope selected.');
        } else if (errStr.includes('Repository not found')) {
          throw new Error(`Repository not found or access denied: Please check that the repository exists on GitHub and your token has permission to access it.`);
        } else {
          throw pushErr;
        }
      }

      res.json({ success: true, message: "Code successfully pushed to GitHub main branch!" });
    } catch (error: any) {
      // Sanitize token from error messages before sending to client or logs
      const rawError = error.message || String(error);
      const sanitized = rawError.replace(new RegExp(cleanToken.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '***');
      console.error('Git push error:', sanitized);
      res.status(500).json({ success: false, error: sanitized });
    }
  });

  // Vite middleware for development or Static files for production
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      const indexPath = path.join(distPath, "index.html");
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(404).send("Application frontend build not found. Please ensure 'npm run build' has completed.");
      }
    });
  }

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`\n============================================================`);
    console.log(`  🚀 QUANT PRO Dashboard: http://localhost:${PORT}`);
    console.log(`  ⚡ Real-Time Trading Engine & WebSocket Active`);
    console.log(`============================================================\n`);

    // Auto-open browser on local startup once server is accepting connections
    if (process.env.AUTO_OPEN !== "false" && process.env.NODE_ENV !== "production") {
      const url = `http://localhost:${PORT}`;
      const openCmd = process.platform === "win32"
        ? `start ${url}`
        : process.platform === "darwin"
        ? `open ${url}`
        : `xdg-open ${url}`;
      exec(openCmd, (err) => {
        if (err && process.platform === "win32") {
          exec(`powershell -NoProfile -Command "Start-Process '${url}'"`);
        }
      });
    }
  });

  // Graceful shutdown handler for cloud providers (like Render)
  process.on('SIGTERM', () => {
    console.log('🛑 [SIGTERM] Received termination signal. Shutting down gracefully...');
    server.close(() => {
      console.log('✅ Server closed.');
      process.exit(0);
    });
  });

  process.on('SIGINT', () => {
    console.log('🛑 [SIGINT] Received interrupt signal. Shutting down...');
    server.close(() => {
      process.exit(0);
    });
  });
}

startServer();
