import express from "express";
import path from "path";
import fs from "fs";
import expressWs from "express-ws";
import { WebSocket } from "ws";
import { exec } from "child_process";
import { promisify } from "util";
const execAsync = promisify(exec);
import { db } from "./server/firebase.js";
import { collection, query, where, getDocs, orderBy, limit, writeBatch, deleteDoc, doc } from "firebase/firestore";
import { oms } from "./server/services/OMS.js";
import { executionAdapter } from "./server/services/ExecutionAdapter.js";
import { riskManager } from "./server/services/RiskManager.js";
import { priceStream } from "./server/services/PriceStream.js";
import { positionMonitor } from "./server/services/PositionMonitor.js";
import { telegramService } from "./server/services/TelegramService.js";
import { autoTrader } from "./server/services/AutoTrader.js";
import { getSignalAudits } from "./server/services/SignalAuditService.js";
import { getSettingsAudits } from "./server/services/SettingsAuditService.js";
import { validateTradingSettings } from "./src/shared/TradingSettings.js";
import { isQuotaExhausted, getRecentTradeLogsFromDisk, readLocalJson } from "./server/services/firestoreSafe.js";

async function startServer() {
  const { app } = expressWs(express());
  
  const PORT = 3000;
  
  console.log(`🔥 Starting Trading Engine on port ${PORT}...`);

  // Body parser
  app.use(express.json());

  // Connected browser UI WebSocket clients
  const clients = new Set<any>();

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
    res.json({ 
      status: "ok", 
      engine: autoTrader.isEngineActive() ? 'RUNNING' : 'PAUSED',
      marketData: priceStream.isStale ? 'STALE' : 'CONNECTED',
      userStream: executionAdapter.getIsLive() ? 'CONNECTED' : 'DISCONNECTED',
      lastReconciliationAt: 'N/A', // We can add real state tracking later
      tradingBlocked: priceStream.isStale,
      globalFilterActive: autoTrader.isGlobalFilterPausing(),
      globalFilterReason: autoTrader.getGlobalFilterBlockReason(),
      timestamp: new Date().toISOString(),
      activePositions: positionMonitor.getActivePositions().length,
      telegramConfigured: telegramService.isConfigured()
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
      // S3 fix: Never expose raw credentials to frontend
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
      // Never expose GitHub PAT
      if (safeSettings.githubPat) {
        safeSettings.githubPat = safeSettings.githubPat.slice(0, 4) + '****';
      }
      res.json(safeSettings);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  app.get("/api/bot/engine/status", (req, res) => {
    try {
      res.json({
        engineRunning: autoTrader.isEngineActive(),
        autoTradeEnabled: autoTrader.getSettings().autoTradeEnabled,
        globalFilterActive: autoTrader.isGlobalFilterPausing(),
        globalFilterReason: autoTrader.getGlobalFilterBlockReason()
      });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  app.post("/api/bot/engine/start", async (req, res) => {
    try {
      autoTrader.startLoop();
      await autoTrader.saveSettings({ autoTradeEnabled: true });
      res.json({ success: true, engineRunning: true, message: "Engine started. Autonomous scanning & new trade execution active." });
    } catch (e) {
      res.status(500).json({ success: false, error: String(e) });
    }
  });

  app.post("/api/bot/engine/stop", async (req, res) => {
    try {
      autoTrader.stopLoop();
      await autoTrader.saveSettings({ autoTradeEnabled: false });
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
      // Add metadata
      payload.updatedAt = new Date().toISOString();
      payload.settingsVersion = (autoTrader.getSettings().settingsVersion || 0) + 1;
      const updated = await autoTrader.saveSettings(payload);
      res.json({ 
        success: true, 
        settings: updated,
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
  app.post("/api/risk/toggle-kill-switch", (req, res) => {
    try {
      const active = req.body?.active !== undefined ? Boolean(req.body.active) : !riskManager.isKillSwitchActive();
      riskManager.setKillSwitch(active);
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
      res.json(safeSettings);
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

  app.post("/api/bot/telegram/test", async (req, res) => {
    try {
      const { botToken, chatId } = req.body;
      if (botToken && chatId) {
        telegramService.updateConfig(botToken, chatId);
      }
      const success = await telegramService.sendMessage(
        `🤖 *Telegram Alerts Connected!* 🚀\n\n` +
        `Your 24/7 Crypto Futures Auto-Trade Bot is online and actively monitoring live Binance markets.\n` +
        `You will receive real-time notifications whenever a trade is executed, take-profit is reached, or stop-loss is triggered.\n\n` +
        `⏰ _Connected at ${new Date().toUTCString()}_`
      );
      if (success) {
        res.json({ success: true, message: "Telegram test message sent successfully!" });
      } else {
        res.status(400).json({ success: false, error: "Failed to send message. Please verify your Bot Token and Chat ID." });
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
      res.json({ success });
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
        const q = query(collection(db, 'positions'), where('status', '==', 'OPEN'));
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
      const q = query(collection(db, 'trade_logs'), orderBy('time_close', 'desc'), limit(100));
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
      res.json({ success: true, posId });
    } catch(e: any) {
      console.error("Trade execution error:", e);
      res.status(500).json({ success: false, error: String(e?.message || e) });
    }
  });

  app.post("/api/bot/close", async (req, res) => {
    try {
      const { id, currentPrice, reason } = req.body;
      const pnl = await oms.closePosition(id, currentPrice, reason || 'MANUAL');
      await positionMonitor.refreshOpenPositions();
      res.json({ success: true, pnl });
    } catch(e) {
      res.status(500).json({ error: String(e) });
    }
  });

  app.post("/api/bot/reset", async (req, res) => {
    try {
      riskManager.reset();
      const posSnapshot = await getDocs(collection(db, 'positions'));
      const posBatch = writeBatch(db);
      posSnapshot.docs.forEach((doc) => {
        posBatch.delete(doc.ref);
      });
      await posBatch.commit();
      
      const logsSnapshot = await getDocs(collection(db, 'trade_logs'));
      const logsBatch = writeBatch(db);
      logsSnapshot.docs.forEach((doc) => {
        logsBatch.delete(doc.ref);
      });
      await logsBatch.commit();
      
      const settings = autoTrader.getSettings();
      settings.demoBalance = settings.startingBalance || 10000;
      settings.equitySnapshots = [];
      await autoTrader.saveSettings(settings);
      
      await positionMonitor.refreshOpenPositions();
      res.json({ success: true });
    } catch(e) {
      res.status(500).json({ error: String(e) });
    }
  });

  app.post("/api/bot/flatten", async (req, res) => {
    try {
      const q = query(collection(db, 'positions'), where('status', '==', 'OPEN'));
      const snapshot = await getDocs(q);
      const positions = snapshot.docs.map(doc => doc.data());
      for (const p of positions) {
        await oms.closePosition(p.id, p.current_price, "FLATTEN");
      }
      await positionMonitor.refreshOpenPositions();
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
