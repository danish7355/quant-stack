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
import { getSignalAudits, getAuditAnalytics } from "./server/services/SignalAuditService.js";
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

  // Central broadcast helper to push events to all connected frontend clients
  const broadcastToClients = (payload: any) => {
    if (clients.size > 0) {
      const msg = JSON.stringify(payload);
      for (const client of clients) {
        if (client.readyState === 1) { // OPEN
          try {
            client.send(msg);
          } catch (e) {}
        }
      }
    }
  };

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

  // Broadcast trade execution events to connected browser UI interfaces for instant popup notifications & sound
  oms.onTradePlaced = (tradeData: any) => {
    console.log(`[WS] Broadcasting TRADE_EXECUTED for ${tradeData.symbol} (${tradeData.direction}) to ${clients.size} clients`);
    broadcastToClients({
      type: 'TRADE_EXECUTED',
      trade: tradeData
    });
    broadcastToClients({
      type: 'POSITIONS_CHANGED',
      activeCount: positionMonitor.getActivePositions().length
    });
  };

  // Broadcast trade closure events, balance updates, and position state updates in real-time
  const prevOnTradeClosed = oms.onTradeClosed;
  oms.onTradeClosed = (pnl: number) => {
    try {
      if (prevOnTradeClosed) prevOnTradeClosed(pnl);
    } catch (e) {}
    const curSettings = autoTrader.getSettings();
    broadcastToClients({
      type: 'BALANCE_UPDATED',
      demoBalance: curSettings.demoBalance,
      startingBalance: curSettings.startingBalance,
      equitySnapshots: curSettings.equitySnapshots || [],
      pnl
    });
    broadcastToClients({
      type: 'POSITIONS_CHANGED',
      activeCount: positionMonitor.getActivePositions().length
    });
  };

  // Broadcast position state updates (opened, closed, SL/TP triggered)
  positionMonitor.onPositionsChanged = () => {
    broadcastToClients({
      type: 'POSITIONS_CHANGED',
      activeCount: positionMonitor.getActivePositions().length
    });
  };

  // Client WebSocket endpoint with 2-way real-time command & sync support
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
    // Send immediate system & settings synchronization on connect
    const activeSettings = autoTrader.getSettings();
    const balance = activeSettings.demoBalance || activeSettings.startingBalance || 10000;
    try {
      ws.send(JSON.stringify({
        type: 'INITIAL_SYNC',
        engineRunning: autoTrader.isEngineActive(),
        autoTradeEnabled: activeSettings.autoTradeEnabled,
        settings: activeSettings,
        balance,
        activePositionsCount: positionMonitor.getActivePositions().length
      }));
    } catch (e) {}

    // Handle incoming client messages for low-latency bidirectional sync
    ws.on('message', async (rawMsg: any) => {
      try {
        const msg = JSON.parse(rawMsg.toString());
        if (!msg || typeof msg !== 'object') return;

        if (msg.type === 'PING') {
          ws.send(JSON.stringify({ type: 'PONG', timestamp: Date.now() }));
          return;
        }

        if (msg.type === 'REQUEST_SYNC') {
          const s = autoTrader.getSettings();
          ws.send(JSON.stringify({
            type: 'INITIAL_SYNC',
            engineRunning: autoTrader.isEngineActive(),
            autoTradeEnabled: s.autoTradeEnabled,
            settings: s,
            balance: s.demoBalance || s.startingBalance || 10000,
            activePositionsCount: positionMonitor.getActivePositions().length
          }));
          return;
        }

        if (msg.type === 'TOGGLE_ENGINE') {
          const run = Boolean(msg.enabled);
          if (run) autoTrader.startLoop();
          else autoTrader.stopLoop();
          await autoTrader.saveSettings({ autoTradeEnabled: run });
          broadcastToClients({ type: 'ENGINE_STATUS', engineRunning: run, autoTradeEnabled: run });
          return;
        }

        if (msg.type === 'UPDATE_SETTINGS' && msg.settings) {
          const updated = await autoTrader.saveSettings(msg.settings);
          broadcastToClients({ type: 'SETTINGS_UPDATED', settings: updated });
          return;
        }
      } catch (err) {}
    });

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
    const execStatus = autoTrader.getTradeExecutionStatus();
    const settings = autoTrader.getSettings();
    const balance = settings.demoBalance || settings.startingBalance || 10000;
    const riskStatus = riskManager.getRiskStatus(balance);
    res.json({ 
      status: "ok", 
      engine: autoTrader.isEngineActive() ? 'RUNNING' : 'PAUSED',
      marketData: priceStream.isStale ? 'STALE' : 'CONNECTED',
      userStream: executionAdapter.getIsLive() ? 'CONNECTED' : 'DISCONNECTED',
      lastReconciliationAt: 'N/A',
      tradingBlocked: execStatus.blocked,
      blockReason: execStatus.reason,
      blockCode: execStatus.code,
      blockAction: execStatus.actionType,
      guardrails: execStatus.guardrails,
      summary: execStatus.summary,
      timestamp: new Date().toISOString(),
      activePositions: positionMonitor.getActivePositions().length,
      telegramConfigured: telegramService.isConfigured(),
      riskStatus
    });
  });

  app.get("/api/bot/execution-status", (req, res) => {
    try {
      const execStatus = autoTrader.getTradeExecutionStatus();
      res.json(execStatus);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
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
      res.json(settings);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  app.get("/api/bot/engine/status", (req, res) => {
    try {
      res.json({
        engineRunning: autoTrader.isEngineActive(),
        autoTradeEnabled: autoTrader.getSettings().autoTradeEnabled
      });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  app.post("/api/bot/engine/start", async (req, res) => {
    try {
      autoTrader.startLoop();
      await autoTrader.saveSettings({ autoTradeEnabled: true });
      broadcastToClients({ type: 'ENGINE_STATUS', engineRunning: true, autoTradeEnabled: true });
      res.json({ success: true, engineRunning: true, message: "Engine started. Autonomous scanning & new trade execution active." });
    } catch (e) {
      res.status(500).json({ success: false, error: String(e) });
    }
  });

  app.post("/api/bot/engine/stop", async (req, res) => {
    try {
      autoTrader.stopLoop();
      await autoTrader.saveSettings({ autoTradeEnabled: false });
      broadcastToClients({ type: 'ENGINE_STATUS', engineRunning: false, autoTradeEnabled: false });
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
      const updated = await autoTrader.saveSettings(payload);
      broadcastToClients({ type: 'SETTINGS_UPDATED', settings: updated });
      res.json({ success: true, settings: updated });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  app.get("/api/risk/status", (req, res) => {
    try {
      const settings = autoTrader.getSettings();
      const balance = settings.demoBalance || settings.startingBalance || 10000;
      res.setHeader('Content-Type', 'application/json');
      res.json(riskManager.getRiskStatus(balance));
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  app.post("/api/risk/kill-switch", async (req, res) => {
    try {
      const { active } = req.body;
      riskManager.setKillSwitch(Boolean(active));
      await autoTrader.saveSettings({ killSwitchActive: Boolean(active) });
      broadcastToClients({ type: 'KILL_SWITCH_UPDATED', killSwitchActive: Boolean(active) });
      res.json({ success: true, killSwitchActive: Boolean(active) });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  app.post("/api/risk/reset-circuit-breaker", (req, res) => {
    try {
      riskManager.resetCircuitBreakers();
      broadcastToClients({ type: 'CIRCUIT_BREAKER_RESET' });
      res.json({ success: true, message: "Circuit breakers and daily loss stats reset successfully." });
    } catch (e) {
      res.status(500).json({ error: String(e) });
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
      if (isQuotaExhausted()) {
        const local = positionMonitor.getActivePositions();
        return res.json(local.length > 0 ? local : readLocalJson('positions.json', []));
      }
      const q = query(collection(db, 'positions'), where('status', '==', 'OPEN'));
      const snapshot = await getDocs(q);
      const positions = snapshot.docs.map(doc => doc.data());
      res.json(positions);
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
      res.setHeader('Content-Type', 'application/json');
      res.json(logs);
    } catch(e) {
      res.setHeader('Content-Type', 'application/json');
      res.status(500).json({ error: String(e) });
    }
  });

  app.get("/api/signal_audit/analytics", async (req, res) => {
    try {
      const stats = getAuditAnalytics();
      res.setHeader('Content-Type', 'application/json');
      res.json(stats);
    } catch(e) {
      res.setHeader('Content-Type', 'application/json');
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
      broadcastToClients({ type: 'POSITIONS_CHANGED' });
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
      broadcastToClients({ type: 'POSITIONS_CHANGED' });
      broadcastToClients({ type: 'BALANCE_RESET', balance: settings.startingBalance });
      broadcastToClients({ type: 'SETTINGS_UPDATED', settings: autoTrader.getSettings() });
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
      broadcastToClients({ type: 'POSITIONS_CHANGED' });
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
    const { token, repoUrl, commitMessage = "Auto-commit from Trading Bot Settings UI", force = false } = req.body;
    if (!token || typeof token !== 'string' || !token.trim()) {
      return res.status(400).json({ success: false, error: "GitHub token required. Please provide a Personal Access Token with repo scope." });
    }

    const cleanToken = token.trim();

    try {
      // 1. Ensure git global configuration is set universally
      await execAsync('git config --global --add safe.directory "*"').catch(() => {});
      await execAsync('git config --global user.name "AI Studio Bot"').catch(() => {});
      await execAsync('git config --global user.email "bot@aistudio.local"').catch(() => {});

      // 2. Ensure repository is initialized
      try {
        await execAsync('git rev-parse --is-inside-work-tree');
      } catch {
        await execAsync('git init -b main');
      }

      await execAsync('git config user.name "AI Studio Bot"').catch(() => {});
      await execAsync('git config user.email "bot@aistudio.local"').catch(() => {});
      await execAsync('git branch -M main').catch(() => {});

      // 3. Stage all files (respecting .gitignore and untracking data/)
      await execAsync('git rm -r --cached data/ 2>/dev/null || true').catch(() => {});
      await execAsync('git add -A');

      // 4. Commit changes if working tree is dirty, or ensure initial commit exists
      const statusRes = await execAsync('git status --porcelain').catch(() => ({ stdout: '' }));
      const hasChanges = statusRes.stdout && statusRes.stdout.trim().length > 0;
      
      if (hasChanges) {
        const safeCommitMsg = commitMessage.replace(/"/g, '\\"');
        await execAsync(`git commit -m "${safeCommitMsg}"`);
      } else {
        const hasCommits = await execAsync('git rev-parse --verify HEAD').then(() => true).catch(() => false);
        if (!hasCommits) {
          await execAsync('git commit --allow-empty -m "Initial commit from Trading Bot"');
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

      const authRepoUrl = `https://${encodeURIComponent(cleanToken)}@${cleanRepo}`;

      // 6. Set origin remote
      try {
        await execAsync(`git remote add origin ${authRepoUrl}`);
      } catch {
        await execAsync(`git remote set-url origin ${authRepoUrl}`);
      }

      // 7. Execute push with smart conflict resolution
      const pushCommand = force ? 'git push -u origin main --force' : 'git push -u origin main';
      
      try {
        await execAsync(pushCommand);
      } catch (pushErr: any) {
        const errStr = pushErr.message || String(pushErr);
        if (errStr.includes('fetch first') || errStr.includes('non-fast-forward') || errStr.includes('Updates were rejected')) {
          if (force) {
            throw pushErr;
          }
          try {
            // Attempt to merge remote history with -s ours so local workspace code takes precedence without blocking conflicts
            await execAsync('git fetch origin main');
            await execAsync('git merge origin/main -s ours -m "Sync remote repository" --no-edit');
            await execAsync('git push -u origin main');
          } catch (mergeErr: any) {
            await execAsync('git merge --abort').catch(() => {});
            throw new Error('Remote repository has divergent commits that could not be automatically reconciled: ' + (mergeErr.message || mergeErr));
          }
        } else if (errStr.includes('GH013') || errStr.includes('Repository rule violations') || errStr.includes('push protection')) {
          throw new Error('GitHub Push Rejected (GH013): A repository rule or secret protection policy blocked the push. Ensure force-push is allowed on main or that branch protection rules are satisfied.');
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
    console.log(`Server running on port ${PORT}`);
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
