import express from "express";
import path from "path";
import fs from "fs";
import expressWs from "express-ws";
import { WebSocket } from "ws";
import { exec } from "child_process";
import { promisify } from "util";
const execAsync = promisify(exec);
import { db } from "./server/firebase.js";
import { collection, query, where, getDocs, orderBy, writeBatch, deleteDoc, doc } from "firebase/firestore";
import { oms } from "./server/services/OMS.js";
import { executionAdapter } from "./server/services/ExecutionAdapter.js";
import { riskManager } from "./server/services/RiskManager.js";
import { priceStream } from "./server/services/PriceStream.js";
import { positionMonitor } from "./server/services/PositionMonitor.js";
import { telegramService } from "./server/services/TelegramService.js";
import { autoTrader } from "./server/services/AutoTrader.js";

async function startServer() {
  const { app } = expressWs(express());
  
  // Environment-aware port resolution:
  // - In Google AI Studio: The container NGINX proxy runs on 8080 and forwards to internal port 3000.
  // - In Render / Heroku / Docker: The hosting platform provides process.env.PORT (e.g. Render assigns 10000).
  const isAiStudio = Boolean(process.env.APPLET_ID || process.env.NGINX_PORT);
  const PORT = isAiStudio 
    ? 3000 
    : (process.env.PORT ? parseInt(process.env.PORT, 10) : 3000);
  
  console.log(`🔥 Starting Trading Engine on port ${PORT} (Environment: ${isAiStudio ? 'AI Studio' : (process.env.RENDER ? 'Render' : 'Standard')})...`);

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

  app.get("/api/bot/settings", async (req, res) => {
    try {
      const settings = await autoTrader.loadSettings();
      res.json(settings);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  app.post("/api/bot/settings", async (req, res) => {
    try {
      const updated = await autoTrader.saveSettings(req.body);
      res.json({ success: true, settings: updated });
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

  app.get("/api/positions", async (req, res) => {
    try {
      const q = query(collection(db, 'positions'), where('status', '==', 'OPEN'));
      const snapshot = await getDocs(q);
      const positions = snapshot.docs.map(doc => doc.data());
      positions.sort((a, b) => new Date(b.time_open).getTime() - new Date(a.time_open).getTime());
      res.json(positions);
    } catch(e) {
      res.status(500).json({ error: String(e) });
    }
  });

  app.get("/api/trade_logs", async (req, res) => {
    try {
      const q = query(collection(db, 'trade_logs'), orderBy('time_close', 'desc'));
      const snapshot = await getDocs(q);
      const logs = snapshot.docs.map(doc => doc.data());
      res.json(logs);
    } catch(e) {
      res.status(500).json({ error: String(e) });
    }
  });

  app.post("/api/bot/trade", async (req, res) => {
    try {
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
    } catch(e) {
      console.error("Trade execution error:", e);
      res.status(500).json({ success: false, error: String(e) });
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

  app.get("/api/status", (req, res) => {
    const settings = autoTrader.getSettings();
    const activeCount = positionMonitor.getActivePositions().length;
    const maxTrades = settings.maxConcurrentTrades || 5;
    const isAtCapacity = activeCount >= maxTrades;
    res.json({ 
      status: isAtCapacity 
        ? `Holding ${activeCount}/${maxTrades} positions (At maximum concurrent limit)`
        : `Active & scanning (${activeCount}/${maxTrades} slots used)`, 
      stream: "Binance Futures Live WebSocket",
      activePositions: activeCount,
      maxConcurrentTrades: maxTrades,
      slotsAvailable: Math.max(0, maxTrades - activeCount),
      activeStrategy: settings.activeStrategy || 'AUTO_REGIME'
    });
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

      // 3. Stage all files
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
            // Attempt to merge remote history with -X ours so local workspace code takes precedence without blocking conflicts
            await execAsync('git pull origin main --allow-unrelated-histories -X ours --no-edit');
            await execAsync('git push -u origin main');
          } catch (mergeErr) {
            await execAsync('git merge --abort').catch(() => {});
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
    const distPath = fs.existsSync(path.join(process.cwd(), "dist"))
      ? path.join(process.cwd(), "dist")
      : path.resolve(__dirname, "..", "dist");
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
