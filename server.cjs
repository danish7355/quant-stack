var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server.ts
var import_express = __toESM(require("express"), 1);
var import_path3 = __toESM(require("path"), 1);
var import_fs4 = __toESM(require("fs"), 1);
var import_express_ws = __toESM(require("express-ws"), 1);
var import_child_process = require("child_process");
var import_util = require("util");

// server/firebase.ts
var import_app = require("firebase/app");
var import_firestore = require("firebase/firestore");
var import_fs = __toESM(require("fs"), 1);
(0, import_firestore.setLogLevel)("error");
var configPath = "./firebase-applet-config.json";
var config = {};
if (import_fs.default.existsSync(configPath)) {
  try {
    config = JSON.parse(import_fs.default.readFileSync(configPath, "utf8"));
  } catch (e) {
    console.error("Failed to parse firebase-applet-config.json", e);
  }
} else if (process.env.FIREBASE_CONFIG) {
  try {
    config = JSON.parse(process.env.FIREBASE_CONFIG);
  } catch (e) {
    console.error("Failed to parse process.env.FIREBASE_CONFIG", e);
  }
} else if (process.env.FIREBASE_PROJECT_ID) {
  config = {
    projectId: process.env.FIREBASE_PROJECT_ID,
    apiKey: process.env.FIREBASE_API_KEY || "AIzaSyDummyKeyForPublicFirestore",
    appId: process.env.FIREBASE_APP_ID || "1:12345:web:abcdef",
    firestoreDatabaseId: process.env.FIREBASE_DATABASE_ID
  };
}
if (config.firestoreDatabaseId) {
  config.databaseURL = `https://${config.projectId}.firebaseio.com`;
}
var app = !(0, import_app.getApps)().length ? (0, import_app.initializeApp)(config) : (0, import_app.getApp)();
var db = (0, import_firestore.initializeFirestore)(app, {
  experimentalForceLongPolling: true
}, config.firestoreDatabaseId);

// server.ts
var import_firestore6 = require("firebase/firestore");

// server/services/OMS.ts
var import_fs2 = __toESM(require("fs"), 1);
var import_path = __toESM(require("path"), 1);
var import_firestore3 = require("firebase/firestore");

// server/services/RiskManager.ts
var RiskManager = class {
  constructor() {
    this.maxLeverage = 20;
    this.maxExposurePct = 0.8;
    // Allow up to 80% total exposure across concurrent positions
    this.currentExposure = 0;
    this.consecutiveLosses = 0;
    this.maxConsecutiveLosses = 4;
    this.dailyLossLimitPct = -10;
    this.currentDailyLossPct = 0;
    this.killSwitchActive = false;
    this.lastResetDate = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
  }
  updateSettings(limitPct, maxLosses, maxExposure) {
    if (limitPct !== void 0 && limitPct !== null) {
      this.dailyLossLimitPct = -Math.abs(limitPct);
    }
    if (maxLosses !== void 0 && maxLosses !== null) {
      this.maxConsecutiveLosses = maxLosses;
    }
    if (maxExposure !== void 0 && maxExposure !== null && maxExposure > 0) {
      this.maxExposurePct = maxExposure > 1 ? maxExposure / 100 : maxExposure;
    }
  }
  checkDailyReset() {
    const today = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
    if (this.lastResetDate !== today) {
      this.currentDailyLossPct = 0;
      this.consecutiveLosses = 0;
      this.lastResetDate = today;
      console.log("RiskManager: Daily stats reset");
    }
  }
  getDailyLossPct() {
    this.checkDailyReset();
    return this.currentDailyLossPct;
  }
  getRemainingExposure(balance = 1e4) {
    const maxAllowed = (balance || 1e4) * this.maxExposurePct;
    return Math.max(0, maxAllowed - this.currentExposure);
  }
  getCurrentExposure() {
    return this.currentExposure;
  }
  getMaxExposurePct() {
    return this.maxExposurePct;
  }
  checkEntryAllowed(balance, requestedAllocation, currentPositionsCount) {
    this.checkDailyReset();
    if (this.killSwitchActive) {
      return { allowed: false, reason: "Kill switch is active" };
    }
    if (this.currentDailyLossPct <= this.dailyLossLimitPct) {
      return { allowed: false, reason: `Daily loss limit reached (${this.currentDailyLossPct.toFixed(2)}%)` };
    }
    const proposedExposure = (this.currentExposure + requestedAllocation) / (balance || 1e4);
    if (proposedExposure > this.maxExposurePct) {
      return { allowed: false, reason: `Exposure limit exceeded. Max: ${(this.maxExposurePct * 100).toFixed(0)}%, Proposed: ${(proposedExposure * 100).toFixed(1)}%` };
    }
    return { allowed: true };
  }
  updateCurrentExposure(totalAllocated) {
    this.currentExposure = Math.max(0, totalAllocated);
  }
  calculatePositionSize(balance, riskPct, leverage, entryPrice) {
    const actualLeverage = Math.min(leverage, this.maxLeverage);
    const allocatedBalance = balance * (riskPct / 100);
    const totalPositionSize = allocatedBalance * actualLeverage;
    const quantity = totalPositionSize / entryPrice;
    return {
      allocatedBalance,
      quantity,
      actualLeverage
    };
  }
  calculateSafePositionSize(accountEquity, entryPrice, stopPrice, direction, spec, riskPercent = 0.01) {
    const stopDistancePct = Math.abs(entryPrice - stopPrice) / entryPrice;
    if (stopDistancePct === 0) {
      return { contracts: 0, leverage: 0, liquidationPrice: 0, allocatedBalance: 0, rejected: true, reason: "Stop price identical to entry price." };
    }
    const contractVal = spec?.contractValue || 1;
    const mmr = spec?.maintenanceMarginRate || 5e-3;
    const maxLev = spec?.maxLeverage ? Math.min(spec.maxLeverage, this.maxLeverage) : this.maxLeverage;
    const minLiqBuffer = 1.3;
    const MAX_ACCOUNT_EXPOSURE_MULTIPLIER = 5;
    const MIN_STOP_DISTANCE_PCT = 5e-3;
    const effectiveStopDistancePct = Math.max(stopDistancePct, MIN_STOP_DISTANCE_PCT);
    let desiredNotional = accountEquity * riskPercent / effectiveStopDistancePct;
    const maxNotional = accountEquity * MAX_ACCOUNT_EXPOSURE_MULTIPLIER;
    if (desiredNotional > maxNotional) {
      desiredNotional = maxNotional;
    }
    const maxAllocation = spec?.maxAllocation !== void 0 && spec.maxAllocation > 0 ? spec.maxAllocation : accountEquity * this.maxExposurePct;
    for (let lev = maxLev; lev >= 1; lev--) {
      const liqDistancePct = 1 / lev - mmr;
      if (liqDistancePct <= 0) continue;
      const liqPrice = direction === "LONG" ? entryPrice * (1 - liqDistancePct) : entryPrice * (1 + liqDistancePct);
      const liqDistanceFromEntry = Math.abs(entryPrice - liqPrice) / entryPrice;
      if (liqDistanceFromEntry / stopDistancePct >= minLiqBuffer) {
        let contracts = Math.floor(desiredNotional / entryPrice / contractVal);
        const maxContractsByAlloc = Math.floor(maxAllocation * lev / (contractVal * entryPrice));
        if (contracts > maxContractsByAlloc) {
          contracts = maxContractsByAlloc;
        }
        if (contracts < 1) {
          return { contracts: 0, leverage: 0, liquidationPrice: 0, allocatedBalance: 0, rejected: true, reason: "Position size exceeds allocation/exposure limit (rounds to 0 contracts)." };
        }
        const positionNotional = contracts * contractVal * entryPrice;
        const allocatedBalance = positionNotional / lev;
        return { contracts, leverage: lev, liquidationPrice: liqPrice, allocatedBalance, rejected: false };
      }
    }
    return { contracts: 0, leverage: 0, liquidationPrice: 0, allocatedBalance: 0, rejected: true, reason: "Stop distance too wide to leverage safely." };
  }
  recordTradeResult(pnl, totalBalance) {
    this.checkDailyReset();
    if (pnl < 0) {
      this.consecutiveLosses++;
      this.currentDailyLossPct += pnl / totalBalance * 100;
    } else {
      this.consecutiveLosses = 0;
      this.currentDailyLossPct += pnl / totalBalance * 100;
    }
  }
  reset() {
    this.currentExposure = 0;
    this.consecutiveLosses = 0;
    this.currentDailyLossPct = 0;
    this.killSwitchActive = false;
  }
  activateKillSwitch() {
    this.killSwitchActive = true;
  }
};
var riskManager = new RiskManager();

// server/services/TelegramService.ts
var import_firestore2 = require("firebase/firestore");
var TelegramService = class {
  constructor() {
    this.botToken = process.env.TELEGRAM_BOT_TOKEN || "";
    this.chatId = process.env.TELEGRAM_CHAT_ID || "";
    this.loadConfigFromDb();
  }
  async loadConfigFromDb() {
    try {
      const docSnap = await (0, import_firestore2.getDoc)((0, import_firestore2.doc)(db, "settings", "bot_config"));
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.telegramBotToken) this.botToken = data.telegramBotToken;
        if (data.telegramChatId) this.chatId = data.telegramChatId;
      }
    } catch (e) {
      console.warn("TelegramService: Could not load config from Firestore yet.");
    }
  }
  updateConfig(token, chatId) {
    if (token !== void 0) this.botToken = token;
    if (chatId !== void 0) this.chatId = chatId;
  }
  isConfigured() {
    return Boolean(this.botToken && this.chatId);
  }
  async sendMessage(text) {
    if (!this.botToken || !this.chatId) {
      return false;
    }
    try {
      const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: this.chatId,
          text,
          parse_mode: "Markdown",
          disable_web_page_preview: true
        })
      });
      const resData = await response.json();
      return Boolean(resData.ok);
    } catch (e) {
      console.error("TelegramService: Failed to send Telegram alert:", e);
      return false;
    }
  }
  async notifyTradeOpen(pos, score) {
    const isLong = pos.direction === "LONG";
    const icon = isLong ? "\u{1F7E2}" : "\u{1F534}";
    const arrow = isLong ? "\u{1F4C8} LONG" : "\u{1F4C9} SHORT";
    let stratName = "\u{1F4CA} Composite 10-Gate";
    if (pos.strategy === "TREND_PULLBACK") {
      stratName = "\u{1F3AF} Trend Pullback (EMA Reversion)";
    } else if (pos.strategy === "DELTA_CLIMAX") {
      stratName = "\u26A1 Climax Reversal";
    } else if (pos.strategy === "VOLATILITY_COMPRESSION") {
      stratName = "\u{1F4A5} VCB Breakout (Squeeze)";
    } else if (pos.strategy === "SMC_LIQUIDITY_SWEEP" || pos.strategy === "SMC") {
      stratName = "\u{1F4A7} SMC Liquidity Sweep & FVG";
    } else if (pos.strategy === "BINANCE_COMPOSITE") {
      stratName = "\u{1F4CA} Composite 10-Gate";
    } else if (pos.strategy) {
      stratName = pos.strategy;
    }
    const freqBadge = pos.frequency_preset === "HIGH" ? "\u{1F680} High Freq" : pos.frequency_preset === "LOW" ? "\u{1F6E1}\uFE0F Low Freq (Strict)" : "\u{1F3AF} Medium Freq (Balanced)";
    const regimeLine = pos.market_regime ? `*Detected Regime:* \`${pos.market_regime}\`
` : "";
    const modeBadge = pos.is_auto_regime ? `*Selection Mode:* \`\u{1F916} Auto Regime-Adaptive (Best EV)\`
` : `*Selection Mode:* \`Manual / Default\`
`;
    const message = `${icon} *24/7 BOT: TRADE OPENED*

*Pair:* \`${pos.symbol}\`
*Action:* ${arrow}
*Strategy:* \`${stratName}\`
` + regimeLine + modeBadge + `*Frequency Mode:* \`${freqBadge}\`
*Entry Price:* \`$${pos.entry_price.toLocaleString(void 0, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}\`
*Leverage:* \`${pos.leverage}x\`
*Allocated Margin:* \`$${pos.allocated_balance.toFixed(2)}\`
*Position Size:* \`$${(pos.allocated_balance * pos.leverage).toFixed(2)}\` (\`${pos.quantity.toFixed(4)}\`)
` + (score ? `*Strategy Score:* \`${score}/100\`
` : "") + `----------------------------
\u{1F3AF} *TP1:* \`$${pos.tp1.toLocaleString(void 0, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}\`
\u{1F3AF} *TP2:* \`$${pos.tp2.toLocaleString(void 0, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}\`
\u{1F3AF} *TP3:* \`$${pos.tp3.toLocaleString(void 0, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}\`
\u{1F6D1} *Stop Loss:* \`$${pos.sl.toLocaleString(void 0, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}\`

\u23F0 _Time: ${(/* @__PURE__ */ new Date()).toUTCString()}_`;
    return this.sendMessage(message);
  }
  async notifyTradeClose(pos, closePrice, pnl, pctReturn, reason) {
    const isWin = pnl >= 0;
    const icon = isWin ? "\u{1F3AF}" : "\u{1F6D1}";
    const status = isWin ? "PROFIT" : "STOPPED";
    let stratName = "\u{1F4CA} Composite 10-Gate";
    if (pos.strategy === "TREND_PULLBACK") {
      stratName = "\u{1F3AF} Trend Pullback";
    } else if (pos.strategy === "DELTA_CLIMAX") {
      stratName = "\u26A1 Climax Reversal";
    } else if (pos.strategy === "VOLATILITY_COMPRESSION") {
      stratName = "\u{1F4A5} VCB Breakout";
    } else if (pos.strategy === "SMC_LIQUIDITY_SWEEP" || pos.strategy === "SMC") {
      stratName = "\u{1F4A7} SMC Liquidity Sweep";
    } else if (pos.strategy === "BINANCE_COMPOSITE") {
      stratName = "\u{1F4CA} Composite 10-Gate";
    } else if (pos.strategy) {
      stratName = pos.strategy;
    }
    const message = `${icon} *24/7 BOT: TRADE CLOSED [${reason}]*

*Pair:* \`${pos.symbol}\` (${pos.direction})
*Strategy:* \`${stratName}\`
*Status:* *${status}*
*Entry Price:* \`$${pos.entry_price.toLocaleString(void 0, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}\`
*Exit Price:* \`$${closePrice.toLocaleString(void 0, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}\`
*Net PnL:* \`${pnl >= 0 ? "+" : ""}$${pnl.toFixed(2)}\` (\`${pctReturn >= 0 ? "+" : ""}${pctReturn.toFixed(2)}%\`)
*Exit Reason:* \`${reason}\`

\u23F0 _Time: ${(/* @__PURE__ */ new Date()).toUTCString()}_`;
    return this.sendMessage(message);
  }
  async notifyPartialTp(pos, closePrice, pnl, pctReturn, closedQty, remainingQty) {
    const message = `\u{1F3AF} *24/7 BOT: VCB INITIAL TP HIT (25% SECURED)*

*Pair:* \`${pos.symbol}\` (${pos.direction})
*Action:* Banked 25% partial profit, Stop moved to Breakeven + Fee buffer
*Entry Price:* \`$${pos.entry_price.toLocaleString(void 0, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}\`
*Exit Price:* \`$${closePrice.toLocaleString(void 0, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}\`
*Secured PnL:* \`+$${pnl.toFixed(2)}\` (\`+${pctReturn.toFixed(2)}%\`)
*Closed Contracts:* \`${closedQty.toFixed(4)}\` | *Remaining:* \`${remainingQty.toFixed(4)}\` (75%)
*New Trailing Stop (Chandelier):* \`$${pos.sl.toLocaleString(void 0, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}\`

\u23F0 _Time: ${(/* @__PURE__ */ new Date()).toUTCString()}_`;
    return this.sendMessage(message);
  }
};
var telegramService = new TelegramService();

// server/services/ExecutionAdapter.ts
var import_ccxt = __toESM(require("ccxt"), 1);
var ExecutionAdapter = class {
  constructor() {
    this.isLive = false;
    this.liveModeUnlocked = false;
    this.exchange = new import_ccxt.default.binance({
      enableRateLimit: true,
      options: { defaultType: "future" }
    });
    this.exchange.setSandboxMode(true);
  }
  // Phase 2 Requirement: Double confirmation flow to enable live mode
  unlockLiveMode(confirmationPhrase) {
    if (confirmationPhrase === "I_ACKNOWLEDGE_RISK_AND_ENABLE_LIVE_TRADING") {
      this.liveModeUnlocked = true;
      return true;
    }
    return false;
  }
  setMode(live, apiKey, secret) {
    if (live) {
      if (!this.liveModeUnlocked) {
        console.warn("ExecutionAdapter: Attempted to enable LIVE MODE without double-confirmation unlock. BLOCKED.");
        return false;
      }
      this.isLive = true;
      this.exchange.apiKey = apiKey || "";
      this.exchange.secret = secret || "";
      this.exchange.setSandboxMode(false);
      console.warn("ExecutionAdapter: \u{1F6A8} LIVE MODE ENABLED \u{1F6A8}");
      return true;
    } else {
      this.isLive = false;
      this.liveModeUnlocked = false;
      this.exchange.apiKey = "";
      this.exchange.secret = "";
      this.exchange.setSandboxMode(true);
      return true;
    }
  }
  async getActivePerpetualSymbols() {
    try {
      await this.exchange.loadMarkets();
      const symbols = [];
      for (const [symbol, market] of Object.entries(this.exchange.markets)) {
        const m = market;
        if (m.swap && m.active !== false && m.quote === "USDT") {
          symbols.push(m.id);
        }
      }
      return symbols;
    } catch (e) {
      console.error(`Error loading perpetual markets:`, e);
      return [];
    }
  }
  async getTicker(symbol) {
    try {
      return await this.exchange.fetchTicker(symbol);
    } catch (e) {
      console.error(`Error fetching ticker for ${symbol}:`, e);
      return null;
    }
  }
  async fetchOHLCV(symbol, timeframe, limit = 500) {
    try {
      return await this.exchange.fetchOHLCV(symbol, timeframe, void 0, limit);
    } catch (e) {
      console.error(`Error fetching OHLCV for ${symbol}:`, e);
      return [];
    }
  }
  async createMarketOrder(symbol, side, amount, leverage = 1) {
    if (!this.isLive) {
      return { id: "paper-" + Math.random().toString(36).substring(7), status: "closed", filled: amount };
    }
    try {
      try {
        await this.exchange.setLeverage(leverage, symbol);
      } catch (e) {
        console.warn(`Could not set leverage for ${symbol}:`, e);
      }
      if (!this.exchange.markets || !this.exchange.markets[symbol]) {
        await this.exchange.loadMarkets();
      }
      const formattedAmountStr = this.exchange.amountToPrecision(symbol, amount);
      const formattedAmount = parseFloat(formattedAmountStr);
      return await this.exchange.createOrder(symbol, "market", side, formattedAmount);
    } catch (e) {
      console.error(`ExecutionAdapter: Failed to execute live ${side} order on ${symbol}:`, e);
      throw e;
    }
  }
  async closeMarketPosition(symbol, side, amount) {
    if (!this.isLive) {
      return { status: "closed" };
    }
    try {
      if (!this.exchange.markets || !this.exchange.markets[symbol]) {
        await this.exchange.loadMarkets();
      }
      const formattedAmountStr = this.exchange.amountToPrecision(symbol, amount);
      const formattedAmount = parseFloat(formattedAmountStr);
      return await this.exchange.createOrder(symbol, "market", side, formattedAmount, void 0, {
        reduceOnly: true
      });
    } catch (e) {
      console.error(`ExecutionAdapter: Failed to close live position on ${symbol}:`, e);
      throw e;
    }
  }
  getIsLive() {
    return this.isLive;
  }
};
var executionAdapter = new ExecutionAdapter();

// server/services/OMS.ts
var OMS = class {
  constructor() {
    this.processingOrder = /* @__PURE__ */ new Set();
  }
  async placeOrder(symbol, direction, price, score, atr, customOpts) {
    if (!symbol || !direction || !price || isNaN(price) || price <= 0) {
      throw new Error(`Invalid order params for ${symbol}`);
    }
    if (this.processingOrder.has(symbol)) {
      throw new Error(`Order for ${symbol} already processing. Preventing duplicate.`);
    }
    this.processingOrder.add(symbol);
    try {
      const balance = 1e4;
      const riskPct = 2;
      const leverage = customOpts?.leverage || 1;
      const { allocatedBalance, quantity, actualLeverage } = riskManager.calculatePositionSize(
        balance,
        riskPct,
        leverage,
        price
      );
      const finalAllocated = customOpts?.allocatedBalance && customOpts.allocatedBalance > 0 ? customOpts.allocatedBalance : allocatedBalance;
      const finalQuantityResolved = customOpts?.qty && customOpts.qty > 0 ? customOpts.qty : quantity;
      const finalLeverageResolved = customOpts?.leverage && customOpts.leverage >= 1 ? customOpts.leverage : actualLeverage;
      const riskCheck = riskManager.checkEntryAllowed(balance, finalAllocated, 0);
      if (!riskCheck.allowed) {
        throw new Error(`Risk manager check disallowed trade for ${symbol}: ${riskCheck.reason}`);
      }
      if (executionAdapter.getIsLive()) {
        const side = direction === "LONG" ? "buy" : "sell";
        await executionAdapter.createMarketOrder(symbol, side, finalQuantityResolved, finalLeverageResolved);
      }
      const safeAtr = atr && atr > 0 ? atr : price * 0.015;
      const computedRisk = customOpts?.sl !== void 0 && customOpts.sl > 0 ? Math.abs(price - customOpts.sl) : safeAtr * 1;
      let sl = customOpts?.sl !== void 0 && customOpts.sl > 0 ? customOpts.sl : direction === "LONG" ? Math.max(1e-4, price - computedRisk) : price + computedRisk;
      const maxStopDistance = price * 0.04;
      if (direction === "LONG" && price - sl > maxStopDistance) {
        sl = price - maxStopDistance;
      } else if (direction === "SHORT" && sl - price > maxStopDistance) {
        sl = price + maxStopDistance;
      }
      const tp1 = customOpts?.tp1 !== void 0 && customOpts.tp1 > 0 ? customOpts.tp1 : direction === "LONG" ? price + computedRisk * 1 : Math.max(1e-4, price - computedRisk * 1);
      const tp2 = customOpts?.tp2 !== void 0 && customOpts.tp2 > 0 ? customOpts.tp2 : direction === "LONG" ? price + computedRisk * 2 : Math.max(1e-4, price - computedRisk * 2);
      const tp3 = customOpts?.tp3 !== void 0 && customOpts.tp3 > 0 ? customOpts.tp3 : direction === "LONG" ? price + computedRisk * 3 : Math.max(1e-4, price - computedRisk * 3);
      const posId = Math.random().toString(36).substring(7);
      const positionData = {
        id: posId,
        symbol,
        direction,
        strategy: customOpts?.strategy || "BINANCE_COMPOSITE",
        market_regime: customOpts?.marketRegime || null,
        is_auto_regime: !!customOpts?.isAutoRegime,
        frequency_preset: customOpts?.frequencyPreset || "LOW",
        entry_price: price,
        current_price: price,
        quantity: finalQuantityResolved,
        original_quantity: finalQuantityResolved,
        leverage: finalLeverageResolved,
        allocated_balance: finalAllocated,
        original_allocated: finalAllocated,
        tp1,
        tp2,
        tp3,
        sl,
        entryAtr: safeAtr,
        compression_high: customOpts?.compressionHigh ?? null,
        compression_low: customOpts?.compressionLow ?? null,
        trailing_stop_active: 0,
        initialTpHit: false,
        extremeSinceEntry: price,
        score_at_entry: score || 80,
        time_open: (/* @__PURE__ */ new Date()).toISOString(),
        status: "OPEN"
      };
      const docRef = (0, import_firestore3.doc)(db, "positions", posId);
      await (0, import_firestore3.setDoc)(docRef, positionData);
      telegramService.notifyTradeOpen({
        ...positionData,
        strategy: positionData.strategy,
        market_regime: positionData.market_regime,
        is_auto_regime: positionData.is_auto_regime,
        frequency_preset: positionData.frequency_preset
      }, score).catch((err) => {
        console.warn("OMS: Telegram dispatch failed", err);
      });
      return posId;
    } catch (e) {
      console.error(`OMS placeOrder error for ${symbol}:`, e);
      throw e;
    } finally {
      this.processingOrder.delete(symbol);
    }
  }
  async partialClosePosition(posId, currentPrice, partialRatio = 0.25, exitReason = "INITIAL_TP_PARTIAL") {
    const posRef = (0, import_firestore3.doc)(db, "positions", posId);
    const docSnap = await (0, import_firestore3.getDoc)(posRef);
    if (!docSnap.exists()) return null;
    const pos = docSnap.data();
    if (pos.status !== "OPEN" || !pos.quantity || pos.quantity <= 0) return null;
    const closeQty = Math.max(1e-4, pos.quantity * partialRatio);
    const remainingQty = Math.max(0, pos.quantity - closeQty);
    const closedAllocated = pos.allocated_balance * (closeQty / pos.quantity);
    const remainingAllocated = Math.max(0, pos.allocated_balance - closedAllocated);
    if (executionAdapter.getIsLive()) {
      try {
        const closeSide = pos.direction === "LONG" ? "sell" : "buy";
        await executionAdapter.closeMarketPosition(pos.symbol, closeSide, closeQty);
      } catch (err) {
        console.warn(`OMS: Live partial close warning on ${pos.symbol}:`, err);
      }
    }
    const isLong = pos.direction === "LONG";
    const priceDeltaPct = pos.entry_price > 0 ? isLong ? (currentPrice - pos.entry_price) / pos.entry_price : (pos.entry_price - currentPrice) / pos.entry_price : 0;
    const pnl = priceDeltaPct * closedAllocated * (pos.leverage || 1);
    const pctReturn = closedAllocated > 0 ? pnl / closedAllocated * 100 : 0;
    const buffer = pos.entry_price * 15e-4;
    const newSl = isLong ? pos.entry_price + buffer : pos.entry_price - buffer;
    await (0, import_firestore3.updateDoc)(posRef, {
      quantity: remainingQty,
      allocated_balance: remainingAllocated,
      sl: newSl,
      initialTpHit: true,
      current_price: currentPrice
    });
    const logId = `${posId}_tp1_${Date.now()}`;
    await (0, import_firestore3.setDoc)((0, import_firestore3.doc)(db, "trade_logs", logId), {
      id: logId,
      parent_position_id: posId,
      symbol: pos.symbol,
      direction: pos.direction,
      strategy: pos.strategy || "BINANCE_COMPOSITE",
      frequency_preset: pos.frequency_preset || "MEDIUM",
      leverage: pos.leverage || 1,
      score_at_entry: pos.score_at_entry || 80,
      entry_price: pos.entry_price,
      close_price: currentPrice,
      profit: pnl,
      pct_return: pctReturn,
      exit_reason: exitReason,
      closed_quantity: closeQty,
      remaining_quantity: remainingQty,
      time_open: pos.time_open,
      time_close: (/* @__PURE__ */ new Date()).toISOString()
    });
    riskManager.recordTradeResult(pnl, 1e4);
    this.onTradeClosed?.(pnl);
    telegramService.notifyPartialTp({
      id: pos.id,
      symbol: pos.symbol,
      direction: pos.direction,
      entry_price: pos.entry_price,
      allocated_balance: closedAllocated,
      sl: newSl
    }, currentPrice, pnl, pctReturn, closeQty, remainingQty).catch(() => {
    });
    return { pnl, newSl, remainingQty };
  }
  async closePosition(posId, currentPrice, exitReason) {
    const posRef = (0, import_firestore3.doc)(db, "positions", posId);
    const docSnap = await (0, import_firestore3.getDoc)(posRef);
    if (!docSnap.exists()) return null;
    const pos = docSnap.data();
    if (pos.status !== "OPEN") return null;
    if (executionAdapter.getIsLive()) {
      try {
        const closeSide = pos.direction === "LONG" ? "sell" : "buy";
        await executionAdapter.closeMarketPosition(pos.symbol, closeSide, pos.quantity);
      } catch (err) {
        console.warn(`OMS: Live close position warning on ${pos.symbol}:`, err);
      }
    }
    const isLong = pos.direction === "LONG";
    const priceDeltaPct = pos.entry_price > 0 ? isLong ? (currentPrice - pos.entry_price) / pos.entry_price : (pos.entry_price - currentPrice) / pos.entry_price : 0;
    const pnl = priceDeltaPct * pos.allocated_balance * (pos.leverage || 1);
    const pctReturn = pos.allocated_balance > 0 ? pnl / pos.allocated_balance * 100 : 0;
    await (0, import_firestore3.updateDoc)(posRef, {
      status: "CLOSED",
      current_price: currentPrice
    });
    await (0, import_firestore3.setDoc)((0, import_firestore3.doc)(db, "trade_logs", posId), {
      id: posId,
      symbol: pos.symbol,
      direction: pos.direction,
      strategy: pos.strategy || "BINANCE_COMPOSITE",
      market_regime: pos.market_regime || null,
      is_auto_regime: !!pos.is_auto_regime,
      frequency_preset: pos.frequency_preset || "MEDIUM",
      leverage: pos.leverage || 1,
      score_at_entry: pos.score_at_entry || 80,
      entry_price: pos.entry_price,
      close_price: currentPrice,
      profit: pnl,
      pct_return: pctReturn,
      exit_reason: exitReason,
      time_open: pos.time_open,
      time_close: (/* @__PURE__ */ new Date()).toISOString()
    });
    try {
      const riskAmount = Math.abs(pos.entry_price - (pos.sl || 0));
      const realized_r = riskAmount > 0 ? (isLong ? currentPrice - pos.entry_price : pos.entry_price - currentPrice) / riskAmount : 0;
      const logLine = JSON.stringify({
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        symbol: pos.symbol,
        direction: pos.direction,
        passed_gates: true,
        reject_reason: null,
        entry_price: pos.entry_price,
        sl: pos.sl,
        tp1: pos.tp1,
        tp2: pos.tp2,
        tp3: pos.tp3,
        score: pos.score_at_entry,
        exit_price: currentPrice,
        exit_reason: exitReason,
        realized_r: parseFloat(realized_r.toFixed(2)),
        strategy_version: "v2.1_closed_candles"
      }) + "\n";
      import_fs2.default.appendFileSync(import_path.default.join(process.cwd(), "data", "scan_logs.jsonl"), logLine);
    } catch (e) {
    }
    riskManager.recordTradeResult(pnl, 1e4);
    this.onTradeClosed?.(pnl);
    return pnl;
  }
};
var oms = new OMS();

// server/services/PriceStream.ts
var import_ws = __toESM(require("ws"), 1);
var PriceStream = class {
  constructor() {
    this.ws = null;
    this.prices = /* @__PURE__ */ new Map();
    this.priceArray = [];
    this.listeners = /* @__PURE__ */ new Set();
    this.isRunning = false;
    this.reconnectTimeout = null;
    this.fallbackInterval = null;
    this.lastWsMessageTime = 0;
    this.lastRestMessageTime = 0;
    this.start();
  }
  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.connectWs();
    this.startHealthCheck();
  }
  connectWs() {
    try {
      if (this.ws) {
        this.ws.removeAllListeners();
        this.ws.on("error", () => {
        });
        try {
          this.ws.terminate();
        } catch (e) {
        }
        this.ws = null;
      }
      this.ws = new import_ws.default("wss://fstream.binance.com/ws/!miniTicker@arr");
      this.ws.on("open", () => {
        console.log("\u{1F4E1} Binance Futures 24/7 WebSocket stream connected.");
        this.lastWsMessageTime = Date.now();
      });
      this.ws.on("ping", () => {
        if (this.ws) this.ws.pong();
        this.lastWsMessageTime = Date.now();
      });
      this.ws.on("message", (data) => {
        try {
          this.lastWsMessageTime = Date.now();
          const parsed = JSON.parse(data.toString());
          if (Array.isArray(parsed)) {
            const batch = [];
            for (const item of parsed) {
              if (item.s && item.c) {
                const p = parseFloat(item.c);
                if (!isNaN(p)) {
                  this.prices.set(item.s, p);
                  batch.push({ s: item.s, p });
                }
              }
            }
            if (batch.length > 0) {
              this.priceArray = batch;
              this.notifyListeners(batch);
            }
          }
        } catch (err) {
        }
      });
      this.ws.on("error", (err) => {
        console.warn("Binance WS error:", err.message);
      });
      this.ws.on("close", (code, reason) => {
        console.log(`Binance WS disconnected. Code: ${code}, Reason: ${reason}`);
        this.ws = null;
        this.scheduleReconnect();
      });
    } catch (e) {
      console.error("Failed to initiate Binance WS connection:", e);
      this.scheduleReconnect();
    }
  }
  scheduleReconnect() {
    if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
    this.reconnectTimeout = setTimeout(() => {
      if (this.isRunning) this.connectWs();
    }, 3e3);
  }
  startHealthCheck() {
    if (this.fallbackInterval) clearInterval(this.fallbackInterval);
    this.fallbackInterval = setInterval(async () => {
      const now = Date.now();
      const timeSinceWsMessage = now - this.lastWsMessageTime;
      const timeSinceRestMessage = now - this.lastRestMessageTime;
      if (timeSinceWsMessage > 6e3 && timeSinceRestMessage > 3e3) {
        try {
          const res = await fetch("https://fapi.binance.com/fapi/v1/ticker/price");
          if (res.ok) {
            const data = await res.json();
            const batch = [];
            for (const item of data) {
              const p = parseFloat(item.price);
              if (item.symbol && !isNaN(p)) {
                this.prices.set(item.symbol, p);
                batch.push({ s: item.symbol, p });
              }
            }
            if (batch.length > 0) {
              this.priceArray = batch;
              this.lastRestMessageTime = Date.now();
              this.notifyListeners(batch);
            }
          } else {
            await res.text().catch(() => {
            });
          }
        } catch (e) {
        }
      }
      if (timeSinceWsMessage > 25e3) {
        console.log("Binance WS silent for 25s, reconnecting WebSocket...");
        this.lastWsMessageTime = now;
        this.connectWs();
      }
    }, 2500);
  }
  notifyListeners(batch) {
    for (const listener of this.listeners) {
      try {
        listener(this.prices, batch);
      } catch (err) {
        console.error("Price update listener error:", err);
      }
    }
  }
  subscribe(listener) {
    this.listeners.add(listener);
    if (this.priceArray.length > 0) {
      try {
        listener(this.prices, this.priceArray);
      } catch (e) {
      }
    }
    return () => this.listeners.delete(listener);
  }
  getPrice(symbol) {
    return this.prices.get(symbol);
  }
  getAllPrices() {
    return this.priceArray;
  }
};
var priceStream = new PriceStream();

// server/services/PositionMonitor.ts
var import_firestore4 = require("firebase/firestore");
var PositionMonitor = class {
  constructor() {
    this.activePositions = [];
    this.isProcessing = false;
    this.syncInterval = null;
    this.closingSet = /* @__PURE__ */ new Set();
    this.init();
  }
  async init() {
    await this.refreshOpenPositions();
    priceStream.subscribe((prices) => {
      this.evaluatePositions(prices);
    });
    if (this.syncInterval) clearInterval(this.syncInterval);
    this.syncInterval = setInterval(() => {
      this.refreshOpenPositions();
    }, 4e3);
  }
  async refreshOpenPositions() {
    try {
      const q = (0, import_firestore4.query)((0, import_firestore4.collection)(db, "positions"), (0, import_firestore4.where)("status", "==", "OPEN"));
      const snapshot = await (0, import_firestore4.getDocs)(q);
      this.activePositions = snapshot.docs.map((doc6) => doc6.data());
      const totalAllocated = this.activePositions.reduce((sum, p) => sum + (p.allocated_balance || 0), 0);
      riskManager.updateCurrentExposure(totalAllocated);
    } catch (e) {
      console.warn("PositionMonitor: Error refreshing positions from Firestore:", e);
    }
  }
  async evaluatePositions(prices) {
    if (this.isProcessing || this.activePositions.length === 0) return;
    this.isProcessing = true;
    try {
      for (const pos of this.activePositions) {
        if (pos.status !== "OPEN" || this.closingSet.has(pos.id)) continue;
        const currentPrice = prices.get(pos.symbol);
        if (!currentPrice || isNaN(currentPrice) || currentPrice <= 0) continue;
        pos.current_price = currentPrice;
        const isLong = pos.direction === "LONG";
        const timeOpenMs = new Date(pos.time_open).getTime();
        const minutesOpen = (Date.now() - timeOpenMs) / (60 * 1e3);
        const barsOpen = Math.floor(minutesOpen / 15);
        let exitReason = null;
        if (pos.strategy === "VOLATILITY_COMPRESSION") {
          if (pos.extremeSinceEntry === void 0) pos.extremeSinceEntry = pos.entry_price;
          if (isLong) {
            if (currentPrice > pos.extremeSinceEntry) {
              pos.extremeSinceEntry = currentPrice;
            }
          } else {
            if (currentPrice < pos.extremeSinceEntry) {
              pos.extremeSinceEntry = currentPrice;
            }
          }
          const entryAtr = pos.entryAtr || Math.abs(pos.tp1 - pos.entry_price) / 1.5 || pos.entry_price * 0.015;
          if (!pos.initialTpHit && !exitReason) {
            const tpReached = isLong ? currentPrice >= pos.tp1 : currentPrice <= pos.tp1;
            if (tpReached) {
              pos.initialTpHit = true;
              console.log(`\u{1F3AF} [PositionMonitor] VCB Initial TP reached for ${pos.symbol}. Securing 25% profit.`);
              const feeSafeOffset = Math.max(pos.entry_price * 2e-3, 0.3 * entryAtr);
              pos.sl = isLong ? pos.entry_price + feeSafeOffset : pos.entry_price - feeSafeOffset;
              oms.partialClosePosition(pos.id, currentPrice, 0.25, "INITIAL_TP_25PCT").then(() => this.refreshOpenPositions()).catch((err) => console.error("PositionMonitor: Error in partialClosePosition:", err));
            } else {
              if (barsOpen >= 8) {
                const unrealizedMoveInAtr = isLong ? (currentPrice - pos.entry_price) / entryAtr : (pos.entry_price - currentPrice) / entryAtr;
                if (unrealizedMoveInAtr < 1) {
                  exitReason = "STALL_TIMEOUT";
                  console.log(`\u23F1\uFE0F [PositionMonitor] VCB Stall Exit triggered on ${pos.symbol} (${barsOpen} bars, move: ${unrealizedMoveInAtr.toFixed(2)} ATR)`);
                }
              }
            }
          } else if (pos.initialTpHit && !exitReason) {
            const chandelierAtrMult = 3;
            const candidate = isLong ? pos.extremeSinceEntry - chandelierAtrMult * entryAtr : pos.extremeSinceEntry + chandelierAtrMult * entryAtr;
            pos.sl = isLong ? Math.max(pos.sl || 0, candidate) : Math.min(pos.sl || 999999, candidate);
          }
          if (!exitReason) {
            const stopHit = isLong ? currentPrice <= pos.sl : currentPrice >= pos.sl;
            if (stopHit) {
              exitReason = pos.initialTpHit ? "CHANDELIER_SL" : "SL";
            }
          }
        } else {
          if (pos.extremeSinceEntry === void 0) pos.extremeSinceEntry = pos.entry_price;
          if (isLong) {
            if (currentPrice > pos.extremeSinceEntry) {
              pos.extremeSinceEntry = currentPrice;
            }
            if (pos.tp1 && currentPrice >= pos.tp1) {
              const entryAtr = pos.entryAtr || Math.abs(pos.tp1 - pos.entry_price) / 1.5 || pos.entry_price * 0.015;
              const chandelierMult = 2.5;
              const candidate = pos.extremeSinceEntry - chandelierMult * entryAtr;
              const newSl = Math.max(pos.entry_price, candidate, pos.sl || 0);
              if (newSl > (pos.sl || 0)) {
                pos.sl = newSl;
                pos.trailing_stop_active = 1;
                (0, import_firestore4.updateDoc)((0, import_firestore4.doc)(db, "positions", pos.id), { sl: newSl, trailing_stop_active: 1, extremeSinceEntry: pos.extremeSinceEntry }).catch(() => {
                });
              }
            }
            if (pos.sl && currentPrice <= pos.sl) {
              exitReason = pos.trailing_stop_active === 1 ? "TRAIL_BE" : "SL";
            }
          } else {
            if (currentPrice < pos.extremeSinceEntry) {
              pos.extremeSinceEntry = currentPrice;
            }
            if (pos.tp1 && currentPrice <= pos.tp1) {
              const entryAtr = pos.entryAtr || Math.abs(pos.tp1 - pos.entry_price) / 1.5 || pos.entry_price * 0.015;
              const chandelierMult = 2.5;
              const candidate = pos.extremeSinceEntry + chandelierMult * entryAtr;
              const newSl = Math.min(pos.entry_price, candidate, pos.sl || 999999);
              if (newSl < (pos.sl || 999999)) {
                pos.sl = newSl;
                pos.trailing_stop_active = 1;
                (0, import_firestore4.updateDoc)((0, import_firestore4.doc)(db, "positions", pos.id), { sl: newSl, trailing_stop_active: 1, extremeSinceEntry: pos.extremeSinceEntry }).catch(() => {
                });
              }
            }
            if (pos.sl && currentPrice >= pos.sl) {
              exitReason = pos.trailing_stop_active === 1 ? "TRAIL_BE" : "SL";
            }
          }
        }
        if (exitReason) {
          this.closingSet.add(pos.id);
          console.log(`\u26A1 [24/7 PositionMonitor] Triggering AUTO CLOSE for ${pos.symbol} (${pos.direction}) at $${currentPrice} [Reason: ${exitReason}]`);
          oms.closePosition(pos.id, currentPrice, exitReason).then(async (pnl) => {
            if (pnl !== null) {
              const pct = pnl / pos.allocated_balance * 100;
              await telegramService.notifyTradeClose(pos, currentPrice, pnl, pct, exitReason);
            }
            await this.refreshOpenPositions();
          }).catch((err) => {
            console.error(`PositionMonitor: Error closing position ${pos.id}:`, err);
          }).finally(() => {
            this.closingSet.delete(pos.id);
          });
        }
      }
    } finally {
      this.isProcessing = false;
    }
  }
  getActivePositions() {
    return this.activePositions;
  }
};
var positionMonitor = new PositionMonitor();

// server/services/AutoTrader.ts
var import_fs3 = __toESM(require("fs"), 1);
var import_path2 = __toESM(require("path"), 1);
var import_firestore5 = require("firebase/firestore");

// src/utils/strategies/volatilityCompression.ts
function calculateEMA(closes, period) {
  if (!closes.length) return [];
  const k = 2 / (period + 1);
  const ema = [closes[0]];
  for (let i = 1; i < closes.length; i++) {
    ema.push(closes[i] * k + ema[i - 1] * (1 - k));
  }
  return ema;
}
function calculateATR(candles, period) {
  if (candles.length < period) return [];
  const tr = candles.map((c, i) => {
    if (i === 0) return c.high - c.low;
    const pc = candles[i - 1].close;
    return Math.max(c.high - c.low, Math.abs(c.high - pc), Math.abs(c.low - pc));
  });
  const firstAtr = tr.slice(0, period).reduce((a, b) => a + b, 0) / period;
  const atr = [firstAtr];
  for (let i = period; i < tr.length; i++) {
    atr.push((atr[atr.length - 1] * (period - 1) + tr[i]) / period);
  }
  return atr;
}
function calculateBollingerBands(closes, period = 20, mult = 2) {
  if (closes.length < period) return { upper: [], middle: [], lower: [] };
  const upper = [];
  const middle = [];
  const lower = [];
  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) {
      middle.push(closes[i]);
      upper.push(closes[i]);
      lower.push(closes[i]);
      continue;
    }
    const slice = closes.slice(i - period + 1, i + 1);
    const mean = slice.reduce((a, b) => a + b, 0) / period;
    const variance = slice.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / period;
    const stdDev = Math.sqrt(variance);
    middle.push(mean);
    upper.push(mean + mult * stdDev);
    lower.push(mean - mult * stdDev);
  }
  return { upper, middle, lower };
}
function calculateKeltnerChannels(candles, period = 20, atrMult = 1.5) {
  const closes = candles.map((c) => c.close);
  const ema = calculateEMA(closes, period);
  const atr = calculateATR(candles, period);
  const upper = [];
  const lower = [];
  for (let i = 0; i < candles.length; i++) {
    const e = ema[i] || closes[i];
    const a = atr[i] || candles[i].high - candles[i].low;
    upper.push(e + atrMult * a);
    lower.push(e - atrMult * a);
  }
  return { upper, middle: ema, lower };
}
function windowAvgRange(candles) {
  if (!candles.length) return 0;
  return candles.reduce((s, c) => s + (c.high - c.low), 0) / candles.length;
}
function windowAvgVolume(candles) {
  if (!candles.length) return 0;
  return candles.reduce((s, c) => s + c.volume, 0) / candles.length;
}
function detectCompression(recentCandles, atr, atrAvg, settings) {
  const lookback = settings.vcbCompressionLookback || 10;
  if (recentCandles.length < lookback + 20) {
    return { isCompressed: false, windowHigh: 0, windowLow: 0, microHigh: 0, microLow: 0, windowAvgRange: 0, windowAvgVolume: 0, compressionRatio: 0, windowRangeToAtrRatio: 0, isSqueezed: false, squeezeCount: 0, hasVolumeContraction: false, hasPriorImpulse: false };
  }
  const window = recentCandles.slice(-lookback);
  const preBox = recentCandles.slice(-(lookback + 20), -lookback);
  const windowHigh = Math.max(...window.map((c) => c.high));
  const windowLow = Math.min(...window.map((c) => c.low));
  const range = windowHigh - windowLow;
  const microWindow = window.slice(-3);
  const microHigh = Math.max(...microWindow.map((c) => c.high));
  const microLow = Math.min(...microWindow.map((c) => c.low));
  const compressionRatio = atrAvg > 0 ? atr / atrAvg : 0;
  const windowRangeToAtrRatio = atr > 0 ? range / atr : 0;
  const winAvgVol = windowAvgVolume(window);
  const preBoxAvgVol = windowAvgVolume(preBox);
  const hasVolumeContraction = winAvgVol <= 0.85 * preBoxAvgVol;
  const hasPriorImpulse = Math.abs(preBox[preBox.length - 1].close - preBox[0].open) >= 1.5 * atr;
  const closes = recentCandles.map((c) => c.close);
  const bb = calculateBollingerBands(closes, 20, 2);
  const kc = calculateKeltnerChannels(recentCandles, 20, 1.5);
  let squeezeCount = 0;
  const startIndex = recentCandles.length - lookback;
  for (let i = startIndex; i < recentCandles.length; i++) {
    if (i >= 0 && bb.upper[i] !== void 0 && kc.upper[i] !== void 0) {
      if (bb.upper[i] <= kc.upper[i] && bb.lower[i] >= kc.lower[i]) {
        squeezeCount++;
      }
    }
  }
  const isSqueezed = squeezeCount >= 1;
  const standardCompression = compressionRatio <= (settings.vcbCompressionAtrRatioMax || 0.85) && windowRangeToAtrRatio <= (settings.vcbWindowAtrMult || 4.2);
  const isCompressed = standardCompression || isSqueezed || compressionRatio <= 0.9 && hasVolumeContraction;
  return {
    isCompressed,
    windowHigh,
    windowLow,
    microHigh,
    microLow,
    windowAvgRange: windowAvgRange(window),
    windowAvgVolume: winAvgVol,
    compressionRatio,
    windowRangeToAtrRatio,
    isSqueezed,
    squeezeCount,
    hasVolumeContraction,
    hasPriorImpulse
  };
}
function detectBreakout(candle, compression, atr, settings, recentCandles) {
  if (!compression.isCompressed) return null;
  const boundaryBufferAtr = settings.vcbBoundaryBufferAtr ?? 0.25;
  const range = candle.high - candle.low;
  const body = Math.abs(candle.close - candle.open);
  const brokeMacroUp = candle.close > compression.windowHigh + boundaryBufferAtr * atr;
  const brokeMacroDown = candle.close < compression.windowLow - boundaryBufferAtr * atr;
  const brokeMicroUp = (candle.close > compression.microHigh || candle.high >= compression.windowHigh) && candle.close > candle.open;
  const brokeMicroDown = (candle.close < compression.microLow || candle.low <= compression.windowLow) && candle.close < candle.open;
  const brokeUp = brokeMacroUp || brokeMicroUp;
  const brokeDown = brokeMacroDown || brokeMicroDown;
  if (!brokeUp && !brokeDown) return null;
  const direction = brokeUp ? "LONG" : "SHORT";
  const extensionFromBoundary = direction === "LONG" ? (candle.close - compression.windowHigh) / atr : (compression.windowLow - candle.close) / atr;
  const isOverextended = extensionFromBoundary > 0.45 || atr > 0 && range > 2.2 * atr;
  if (isOverextended) {
    return null;
  }
  const clv = range > 0 ? (candle.close - candle.low) / range : 0.5;
  const closeStrength = range > 0 ? direction === "LONG" ? (candle.close - candle.low) / range : (candle.high - candle.close) / range : 0;
  const isSniper = brokeMicroUp && !brokeMacroUp || brokeMicroDown && !brokeMacroDown;
  const isPreBlastCoil = extensionFromBoundary <= 0.25 && (isSniper || compression.isSqueezed);
  const upperWick = range > 0 ? (candle.high - Math.max(candle.open, candle.close)) / range : 0;
  const lowerWick = range > 0 ? (Math.min(candle.open, candle.close) - candle.low) / range : 0;
  const isWickRejection = direction === "LONG" ? upperWick > 0.35 : lowerWick > 0.35;
  if (isWickRejection && !isSniper) {
    return null;
  }
  const bodyDominance = range > 0 ? body / range : 0;
  if (bodyDominance < 0.3 && !isSniper) {
    return null;
  }
  let rvol = 1;
  if (recentCandles && recentCandles.length >= 20) {
    const vol20Avg = recentCandles.slice(-20).reduce((s, c) => s + c.volume, 0) / 20;
    rvol = vol20Avg > 0 ? candle.volume / vol20Avg : 1;
  } else if (compression.windowAvgVolume > 0) {
    rvol = candle.volume / compression.windowAvgVolume;
  }
  return {
    direction,
    boundaryBreakAtr: extensionFromBoundary,
    rangeExpansion: compression.windowAvgRange > 0 ? range / compression.windowAvgRange : 0,
    volumeExpansion: compression.windowAvgVolume > 0 ? candle.volume / compression.windowAvgVolume : 0,
    rvol,
    closeStrength,
    closeLocationValue: clv,
    bodyDominance,
    isSniper,
    isPreBlastCoil,
    isOverextended: false,
    isWickRejection: false
  };
}
function scoreBreakout(m, settings) {
  if (m.direction === null || m.isOverextended || m.isWickRejection) return 0;
  const rangeExpMin = settings.vcbRangeExpansionMin ?? 1.4;
  const volExpMin = settings.vcbVolumeExpansionMin ?? 1.3;
  const closeStrMin = settings.vcbCloseStrengthMin ?? 0.6;
  let avgExcess = 0;
  if (m.isSniper || m.isPreBlastCoil) {
    avgExcess = 1.5;
  } else {
    const excess = (v, min) => Math.min(v / min, 2);
    avgExcess = (excess(m.rangeExpansion, rangeExpMin) + excess(m.volumeExpansion, volExpMin) + excess(m.closeStrength, closeStrMin)) / 3;
  }
  let score = Math.round(Math.max(35, Math.min(100, 30 + avgExcess * 50)));
  if (m.isPreBlastCoil) {
    score += 20;
  }
  if (m.direction === "LONG" && m.closeLocationValue >= 0.7 || m.direction === "SHORT" && m.closeLocationValue <= 0.3) {
    score = Math.min(100, score + 15);
  }
  if (m.rvol >= 1.8) {
    score = Math.min(100, score + 15);
  } else if (m.rvol >= 1.15) {
    score = Math.min(100, score + 8);
  }
  if (m.isSniper) {
    score += 15;
  }
  if (m.bodyDominance >= 0.45) {
    score = Math.min(100, score + 10);
  }
  return Math.min(100, score);
}
function validateHigherTimeframeTrend(htfCandles, direction) {
  if (!htfCandles || htfCandles.length < 50) {
    return { isAligned: true, reason: "HTF data insufficient; neutral alignment.", penalty: 0 };
  }
  const closes = htfCandles.map((c) => c.close);
  const ema50Series = calculateEMA(closes, 50);
  const ema200Series = calculateEMA(closes, 200);
  const currentHtfPrice = closes[closes.length - 1];
  const htfEma50 = ema50Series[ema50Series.length - 1];
  const htfEma200 = ema200Series[ema200Series.length - 1] || htfEma50;
  if (direction === "LONG") {
    const isBullish = currentHtfPrice >= htfEma50 || currentHtfPrice >= htfEma200;
    if (!isBullish) {
      return { isAligned: false, reason: `1H Trend Bearish: Price ($${currentHtfPrice}) is below 1H EMA 50 ($${htfEma50.toFixed(2)}) & 200`, penalty: -35 };
    }
    return { isAligned: true, reason: "1H Trend Bullish: Price above 1H EMAs", penalty: 0 };
  } else {
    const isBearish = currentHtfPrice <= htfEma50 || currentHtfPrice <= htfEma200;
    if (!isBearish) {
      return { isAligned: false, reason: `1H Trend Bullish: Price ($${currentHtfPrice}) is above 1H EMA 50 ($${htfEma50.toFixed(2)}) & 200`, penalty: -35 };
    }
    return { isAligned: true, reason: "1H Trend Bearish: Price below 1H EMAs", penalty: 0 };
  }
}
function applyTrendAndMomentumBonus(score, direction, ema9, ema21, ema50, rsi, settings) {
  if (score === 0) return 0;
  let bonus = 0;
  const trendAligned = direction === "LONG" ? ema9 > ema21 && ema21 > ema50 : ema9 < ema21 && ema21 < ema50;
  if (trendAligned) {
    bonus += 15;
  }
  const momentumAligned = direction === "LONG" ? rsi > 45 && rsi < 70 : rsi < 55 && rsi > 30;
  if (momentumAligned) {
    bonus += 10;
  }
  const fightingTrend = direction === "LONG" ? ema21 < ema50 : ema21 > ema50;
  if (fightingTrend) {
    score -= 25;
  }
  return Math.min(100, Math.max(0, score + bonus));
}
function determineStopLoss(direction, compression, atr, settings, recentCandles, entryPrice) {
  const defaultBufferAtr = settings.vcbSlBufferAtrMult ?? 0.35;
  if (recentCandles && recentCandles.length >= 3) {
    const baseCandles = recentCandles.slice(-3);
    if (direction === "LONG") {
      const lowestWick = Math.min(...baseCandles.map((c) => c.low));
      const buffer = Math.max(0.15 * atr, (entryPrice || lowestWick) * 15e-4);
      let sl = lowestWick - buffer;
      if (entryPrice && (entryPrice - sl) / entryPrice < 25e-4) {
        sl = entryPrice * (1 - 25e-4);
      }
      return Math.max(1e-4, sl);
    } else {
      const highestWick = Math.max(...baseCandles.map((c) => c.high));
      const buffer = Math.max(0.15 * atr, (entryPrice || highestWick) * 15e-4);
      let sl = highestWick + buffer;
      if (entryPrice && (sl - entryPrice) / entryPrice < 25e-4) {
        sl = entryPrice * (1 + 25e-4);
      }
      return sl;
    }
  }
  return direction === "LONG" ? Math.max(1e-4, compression.windowLow - defaultBufferAtr * atr) : compression.windowHigh + defaultBufferAtr * atr;
}
function calculateInitialTp(entryPrice, direction, atr, settings) {
  return direction === "LONG" ? entryPrice + settings.vcbInitialTpAtrMult * atr : Math.max(1e-4, entryPrice - settings.vcbInitialTpAtrMult * atr);
}

// src/utils/strategies/trendPullback.ts
function calcEma(data, period) {
  const k = 2 / (period + 1);
  const ema = [data[0]];
  for (let i = 1; i < data.length; i++) {
    ema.push(data[i] * k + ema[i - 1] * (1 - k));
  }
  return ema;
}
function calcAtr(high, low, close, period) {
  const tr = [high[0] - low[0]];
  for (let i = 1; i < high.length; i++) {
    const hl = high[i] - low[i];
    const hc = Math.abs(high[i] - close[i - 1]);
    const lc = Math.abs(low[i] - close[i - 1]);
    tr.push(Math.max(hl, hc, lc));
  }
  const atr = [tr.slice(0, period).reduce((a, b) => a + b) / period];
  for (let i = period; i < tr.length; i++) {
    atr.push((atr[atr.length - 1] * (period - 1) + tr[i]) / period);
  }
  return Array(period - 1).fill(atr[0]).concat(atr);
}
function evaluateTrendPullback(candles, currentPrice, settings) {
  if (candles.length < 50) return null;
  const close = candles.map((c) => c.close);
  const high = candles.map((c) => c.high);
  const low = candles.map((c) => c.low);
  const volume = candles.map((c) => c.volume || 0);
  const ema9 = calcEma(close, 9);
  const ema21 = calcEma(close, 21);
  const ema50 = calcEma(close, 50);
  const atr = calcAtr(high, low, close, 14);
  const lastIdx = close.length - 1;
  const currentAtr = atr[lastIdx];
  const avgVol20 = volume.slice(Math.max(0, lastIdx - 20), lastIdx).reduce((a, b) => a + b, 0) / 20;
  const isUptrend = ema21[lastIdx] > ema50[lastIdx] && ema50[lastIdx] > ema50[lastIdx - 10];
  const isDowntrend = ema21[lastIdx] < ema50[lastIdx] && ema50[lastIdx] < ema50[lastIdx - 10];
  if (!isUptrend && !isDowntrend) return null;
  if (currentAtr / currentPrice > 0.035) {
    return null;
  }
  const currentHigh = high[lastIdx];
  const currentLow = low[lastIdx];
  const currentClose = close[lastIdx];
  const currentOpen = candles[lastIdx].open;
  const prevLow = low[lastIdx - 1];
  const prevHigh = high[lastIdx - 1];
  let direction = null;
  let score = 0;
  let reason = "";
  let sl = 0;
  if (isUptrend) {
    const touchedEMA = currentLow <= ema21[lastIdx] || prevLow <= ema21[lastIdx - 1];
    if (!touchedEMA) return null;
    const prevVolRatio = volume[lastIdx - 1] / (avgVol20 || 1);
    const prevBody = Math.abs(close[lastIdx - 1] - candles[lastIdx - 1].open);
    const prevRange = high[lastIdx - 1] - low[lastIdx - 1];
    const isPrevBearish = close[lastIdx - 1] < candles[lastIdx - 1].open;
    if (isPrevBearish && prevVolRatio > 2 && prevBody > prevRange * 0.7) {
      return null;
    }
    const recentLows = low.slice(Math.max(0, lastIdx - 20), lastIdx - 2);
    if (recentLows.length > 0) {
      const lowestRecent = Math.min(...recentLows);
      if (currentLow < lowestRecent * 0.998) {
        return null;
      }
    }
    const range = currentHigh - currentLow;
    const body = Math.abs(currentClose - currentOpen);
    const lowerWick = Math.min(currentOpen, currentClose) - currentLow;
    const isRejection = lowerWick > body * 1.5 && lowerWick > range * 0.4;
    const isBullishEngulfing = currentClose > currentOpen && currentClose > candles[lastIdx - 1].open && currentOpen < candles[lastIdx - 1].close;
    if (isRejection || isBullishEngulfing) {
      if (currentClose < ema50[lastIdx]) return null;
      direction = "LONG";
      score = isRejection ? 85 : 80;
      reason = isRejection ? "Trend Pullback + Rejection Wick at EMA" : "Trend Pullback + Bullish Engulfing at EMA";
      const localLow = Math.min(currentLow, prevLow, low[lastIdx - 2] || currentLow);
      sl = localLow - currentAtr * 1.5;
      if ((currentPrice - sl) / currentPrice < 75e-4) {
        sl = currentPrice * (1 - 75e-4);
      }
      if ((currentPrice - sl) / currentPrice > 0.035) {
        sl = currentPrice * (1 - 0.035);
      }
    }
  } else if (isDowntrend) {
    const touchedEMA = currentHigh >= ema21[lastIdx] || prevHigh >= ema21[lastIdx - 1];
    if (!touchedEMA) return null;
    const prevVolRatio = volume[lastIdx - 1] / (avgVol20 || 1);
    const prevBody = Math.abs(close[lastIdx - 1] - candles[lastIdx - 1].open);
    const prevRange = high[lastIdx - 1] - low[lastIdx - 1];
    const isPrevBullish = close[lastIdx - 1] > candles[lastIdx - 1].open;
    if (isPrevBullish && prevVolRatio > 2 && prevBody > prevRange * 0.7) {
      return null;
    }
    const recentHighs = high.slice(Math.max(0, lastIdx - 20), lastIdx - 2);
    if (recentHighs.length > 0) {
      const highestRecent = Math.max(...recentHighs);
      if (currentHigh > highestRecent * 1.002) {
        return null;
      }
    }
    const range = currentHigh - currentLow;
    const body = Math.abs(currentClose - currentOpen);
    const upperWick = currentHigh - Math.max(currentOpen, currentClose);
    const isRejection = upperWick > body * 1.5 && upperWick > range * 0.4;
    const isBearishEngulfing = currentClose < currentOpen && currentClose < candles[lastIdx - 1].open && currentOpen > candles[lastIdx - 1].close;
    if (isRejection || isBearishEngulfing) {
      if (currentClose > ema50[lastIdx]) return null;
      direction = "SHORT";
      score = isRejection ? 85 : 80;
      reason = isRejection ? "Trend Pullback + Rejection Wick at EMA" : "Trend Pullback + Bearish Engulfing at EMA";
      const localHigh = Math.max(currentHigh, prevHigh, high[lastIdx - 2] || currentHigh);
      sl = localHigh + currentAtr * 1.5;
      if ((sl - currentPrice) / currentPrice < 75e-4) {
        sl = currentPrice * (1 + 75e-4);
      }
      if ((sl - currentPrice) / currentPrice > 0.035) {
        sl = currentPrice * (1 + 0.035);
      }
    }
  }
  if (!direction) return null;
  const risk = Math.abs(currentPrice - sl);
  const tp1 = direction === "LONG" ? currentPrice + risk * 1.5 : currentPrice - risk * 1.5;
  const tp2 = direction === "LONG" ? currentPrice + risk * 2.5 : currentPrice - risk * 2.5;
  const tp3 = direction === "LONG" ? currentPrice + risk * 4 : currentPrice - risk * 4;
  return {
    direction,
    score,
    atr: currentAtr,
    sl,
    tp1,
    tp2,
    tp3,
    reason,
    signalTime: candles[lastIdx].time
  };
}

// src/utils/strategies/smcLiquidity.ts
function evaluateSmc(klines15m, klines1h, currentPrice) {
  if (!klines15m || klines15m.length < 20 || !klines1h || klines1h.length < 24) return null;
  const htfLookback = klines1h.slice(-25, -1);
  const pdh = Math.max(...htfLookback.map((k) => k.high));
  const pdl = Math.min(...htfLookback.map((k) => k.low));
  const recentKlines = klines15m.slice(-15, -1);
  for (let i = 0; i < recentKlines.length - 2; i++) {
    const sweepCandle = recentKlines[i];
    if (sweepCandle.high > pdh && sweepCandle.close < pdh) {
      const triggerLow = Math.min(sweepCandle.low, recentKlines[Math.max(0, i - 1)].low);
      let mssIndex = -1;
      for (let j = i + 1; j < Math.min(recentKlines.length, i + 4); j++) {
        if (recentKlines[j].close < triggerLow) {
          mssIndex = j;
          break;
        }
      }
      if (mssIndex !== -1) {
        for (let f = mssIndex - 1; f <= mssIndex; f++) {
          if (f >= 0 && f + 2 < recentKlines.length) {
            const c1 = recentKlines[f];
            const c3 = recentKlines[f + 2];
            if (c1.low > c3.high) {
              const entryZoneMin = c3.high;
              const entryZoneMax = c1.low;
              const sl = sweepCandle.high * 1.001;
              const risk = sl - entryZoneMin;
              const tp1 = entryZoneMin - risk * 2;
              return {
                direction: "SHORT",
                score: 95,
                sl,
                tp1,
                entryZoneMin,
                entryZoneMax,
                reason: "Bearish SMC Liquidity Sweep (PDH) + MSS + FVG",
                signalTime: sweepCandle.time
              };
            }
          }
        }
      }
    }
    if (sweepCandle.low < pdl && sweepCandle.close > pdl) {
      const triggerHigh = Math.max(sweepCandle.high, recentKlines[Math.max(0, i - 1)].high);
      let mssIndex = -1;
      for (let j = i + 1; j < Math.min(recentKlines.length, i + 4); j++) {
        if (recentKlines[j].close > triggerHigh) {
          mssIndex = j;
          break;
        }
      }
      if (mssIndex !== -1) {
        for (let f = mssIndex - 1; f <= mssIndex; f++) {
          if (f >= 0 && f + 2 < recentKlines.length) {
            const c1 = recentKlines[f];
            const c3 = recentKlines[f + 2];
            if (c1.high < c3.low) {
              const entryZoneMax = c3.low;
              const entryZoneMin = c1.high;
              const sl = sweepCandle.low * 0.999;
              const risk = entryZoneMax - sl;
              const tp1 = entryZoneMax + risk * 2;
              return {
                direction: "LONG",
                score: 95,
                sl,
                tp1,
                entryZoneMin,
                entryZoneMax,
                reason: "Bullish SMC Liquidity Sweep (PDL) + MSS + FVG",
                signalTime: sweepCandle.time
              };
            }
          }
        }
      }
    }
  }
  return null;
}

// src/utils/strategies/macroRange.ts
function detectMacroRangeBreakout(candles, currentPrice, atr) {
  if (candles.length < 200) return null;
  const lookback = 150;
  const boxCandles = candles.slice(-lookback - 1, -1);
  const prevCandle = boxCandles[boxCandles.length - 1];
  const boxHigh = Math.max(...boxCandles.map((c) => c.high));
  const boxLow = Math.min(...boxCandles.map((c) => c.low));
  const boxRange = boxHigh - boxLow;
  if (boxRange < 3 * atr) return null;
  let direction = null;
  if (prevCandle.close <= boxHigh && currentPrice > boxHigh && currentPrice < boxHigh + atr * 0.5) {
    direction = "LONG";
  } else if (prevCandle.close >= boxLow && currentPrice < boxLow && currentPrice > boxLow - atr * 0.5) {
    direction = "SHORT";
  }
  if (!direction) return null;
  const localCandles = candles.slice(-20, -1);
  let localSwingExtreme = 0;
  if (direction === "LONG") {
    localSwingExtreme = Math.min(...localCandles.map((c) => c.low));
    localSwingExtreme = localSwingExtreme - atr * 0.2;
  } else {
    localSwingExtreme = Math.max(...localCandles.map((c) => c.high));
    localSwingExtreme = localSwingExtreme + atr * 0.2;
  }
  return {
    direction,
    score: 95,
    atr,
    sl: localSwingExtreme,
    tp1: direction === "LONG" ? currentPrice + (currentPrice - localSwingExtreme) * 2 : currentPrice - (localSwingExtreme - currentPrice) * 2,
    tp2: direction === "LONG" ? currentPrice + (currentPrice - localSwingExtreme) * 4 : currentPrice - (localSwingExtreme - currentPrice) * 4,
    tp3: direction === "LONG" ? currentPrice + (currentPrice - localSwingExtreme) * 8 : currentPrice - (localSwingExtreme - currentPrice) * 8,
    boxHigh,
    boxLow
  };
}

// src/utils/indicators.ts
function calculateRSI(prices, period = 14) {
  const rsi = [];
  if (prices.length <= period) {
    return new Array(prices.length).fill(50);
  }
  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = prices[i] - prices[i - 1];
    if (diff > 0) gains += diff;
    else losses -= diff;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  rsi.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));
  const finalRsi = new Array(period).fill(50);
  finalRsi.push(rsi[0]);
  for (let i = period + 1; i < prices.length; i++) {
    const diff = prices[i] - prices[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    const rs = avgLoss === 0 ? 1e3 : avgGain / avgLoss;
    finalRsi.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + rs));
  }
  return finalRsi;
}

// server/services/AutoTrader.ts
var AutoTrader = class {
  constructor() {
    this.settings = {
      autoTradeEnabled: true,
      autoTradeThreshold: 75,
      tradeFrequency: "LOW",
      activeStrategy: "BINANCE_COMPOSITE",
      telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || "",
      telegramChatId: process.env.TELEGRAM_CHAT_ID || "",
      leverage: 5,
      positionSizePct: 3,
      maxConcurrentTrades: 5,
      timeframe: "15m"
    };
    this.isRunning = false;
    this.loopInterval = null;
    this.klineCache = /* @__PURE__ */ new Map();
    this.pendingSymbols = /* @__PURE__ */ new Set();
    this.pendingSmcSetups = /* @__PURE__ */ new Map();
    this.tradeCooldowns = /* @__PURE__ */ new Map();
    this.lastTradedSignal = /* @__PURE__ */ new Map();
    this.isScanning = false;
    this.init();
  }
  async init() {
    await this.loadSettings();
    this.startLoop();
  }
  async loadSettings() {
    try {
      const docSnap = await (0, import_firestore5.getDoc)((0, import_firestore5.doc)(db, "settings", "bot_config"));
      if (docSnap.exists()) {
        const data = docSnap.data();
        const updated = { ...this.settings };
        for (const [key, val] of Object.entries(data)) {
          if (val !== void 0 && val !== null) {
            updated[key] = val;
          }
        }
        this.settings = updated;
        if (this.settings.telegramBotToken && this.settings.telegramChatId) {
          telegramService.updateConfig(this.settings.telegramBotToken, this.settings.telegramChatId);
        }
        riskManager.updateSettings(this.settings.dailyLossLimitPct, void 0);
      }
    } catch (e) {
      console.warn("AutoTrader: Could not load settings from Firestore, using defaults.");
    }
    return this.settings;
  }
  async saveSettings(newSettings) {
    const updated = { ...this.settings };
    for (const [k, v] of Object.entries(newSettings)) {
      if (v !== void 0 && v !== null) {
        const isCredential = k === "telegramBotToken" || k === "telegramChatId" || k === "binanceApiKey" || k === "binanceApiSecret";
        if (isCredential && typeof v === "string" && v.trim() === "" && !newSettings.forceClearCredentials) {
          continue;
        }
        updated[k] = v;
      }
    }
    this.settings = updated;
    if (this.settings.telegramBotToken && this.settings.telegramChatId) {
      telegramService.updateConfig(this.settings.telegramBotToken, this.settings.telegramChatId);
    }
    riskManager.updateSettings(this.settings.dailyLossLimitPct, void 0);
    try {
      await (0, import_firestore5.setDoc)((0, import_firestore5.doc)(db, "settings", "bot_config"), this.settings, { merge: true });
    } catch (e) {
      console.error("AutoTrader: Failed to persist settings to Firestore:", e);
    }
    return this.settings;
  }
  getSettings() {
    return this.settings;
  }
  updateDemoBalance(pnl) {
    const current = this.settings.demoBalance !== void 0 ? this.settings.demoBalance : this.settings.startingBalance || 1e4;
    this.settings.demoBalance = current + pnl;
    this.settings.equitySnapshots = this.settings.equitySnapshots || [];
    this.settings.equitySnapshots.push({ time: (/* @__PURE__ */ new Date()).toISOString(), balance: this.settings.demoBalance });
    if (this.settings.equitySnapshots.length > 50) {
      this.settings.equitySnapshots = this.settings.equitySnapshots.slice(-50);
    }
    this.saveSettings(this.settings).catch(() => {
    });
  }
  processPendingSMC(prices) {
    const now = Date.now();
    for (const [symbol, setup] of this.pendingSmcSetups.entries()) {
      if (now > setup.expiryTime) {
        console.log(`\u{1F916} [SMC] Setup for ${symbol} expired.`);
        this.pendingSmcSetups.delete(symbol);
        continue;
      }
      const price = prices.get(symbol);
      if (!price) continue;
      let triggered = false;
      if (setup.direction === "LONG" && price <= setup.entryZoneMax && price >= setup.sl) {
        triggered = true;
      } else if (setup.direction === "SHORT" && price >= setup.entryZoneMin && price <= setup.sl) {
        triggered = true;
      }
      if (triggered) {
        console.log(`\u26A1 [SMC] Retracement confirmed for ${symbol}! Tapped FVG zone. Executing...`);
        this.pendingSmcSetups.delete(symbol);
        const accountEquity = 1e4;
        const riskPct = this.settings.accountRiskPct ? this.settings.accountRiskPct / 100 : 0.015;
        const userTargetAlloc = accountEquity * ((this.settings.positionSizePct || 10) / 100);
        const remainingExposure = riskManager.getRemainingExposure(accountEquity);
        const maxAllocation = Math.min(userTargetAlloc, remainingExposure);
        if (maxAllocation <= 0) {
          console.log(`\u{1F6E1}\uFE0F [SMC] Setup for ${symbol} skipped: Portfolio exposure limit reached.`);
          this.tradeCooldowns.set(symbol, Date.now() + 6e4);
          continue;
        }
        const safeSize = riskManager.calculateSafePositionSize(
          accountEquity,
          price,
          setup.sl,
          setup.direction,
          { maxLeverage: this.settings.leverage || 1, maxAllocation },
          riskPct
        );
        if (safeSize.rejected || safeSize.contracts <= 0) {
          console.log(`\u{1F6AB} [SMC] Setup for ${symbol} rejected by RiskManager: ${safeSize.reason}`);
          this.tradeCooldowns.set(symbol, Date.now() + 6e4);
          continue;
        }
        const activePositions = positionMonitor.getActivePositions();
        const riskCheck = riskManager.checkEntryAllowed(accountEquity, safeSize.allocatedBalance, activePositions.length);
        if (!riskCheck.allowed) {
          console.log(`\u{1F6E1}\uFE0F [SMC] Trade blocked by RiskManager for ${symbol}: ${riskCheck.reason}`);
          this.tradeCooldowns.set(symbol, Date.now() + 6e4);
          continue;
        }
        oms.placeOrder(symbol, setup.direction, price, setup.score, 0, {
          strategy: "SMC_LIQUIDITY_SWEEP",
          marketRegime: "Liquidity Hunt / FVG Reversal",
          qty: safeSize.contracts,
          allocatedBalance: safeSize.allocatedBalance,
          leverage: safeSize.leverage,
          sl: setup.sl,
          tp1: setup.tp1
        }).catch((err) => {
          console.error(`SMC error opening ${symbol}:`, err);
          this.tradeCooldowns.set(symbol, Date.now() + 6e4);
        });
      }
    }
  }
  startLoop() {
    if (this.isRunning) return;
    this.isRunning = true;
    priceStream.subscribe((prices, batch) => this.processPendingSMC(prices));
    if (this.loopInterval) clearInterval(this.loopInterval);
    this.loopInterval = setInterval(() => {
      this.runScanCycle();
    }, 5e3);
    setTimeout(() => this.runScanCycle(), 5e3);
  }
  async runScanCycle() {
    if (!this.settings.autoTradeEnabled) return;
    if (this.isScanning) return;
    this.isScanning = true;
    try {
      const activePositions = positionMonitor.getActivePositions();
      const openCount = activePositions.length;
      if (openCount >= this.settings.maxConcurrentTrades) {
        return;
      }
      const topSymbols = await this.getTopVolumeSymbols(this.settings.coinCount || 25);
      for (const symbol of topSymbols) {
        const cooldown = this.tradeCooldowns.get(symbol) || 0;
        const cdLimit = this.getCooldownMs(this.settings.timeframe);
        const inCooldown = Date.now() - cooldown < cdLimit;
        if (activePositions.some((p) => p.symbol === symbol) || this.pendingSymbols.has(symbol) || inCooldown) {
          continue;
        }
        const currentPrice = priceStream.getPrice(symbol);
        if (!currentPrice || currentPrice <= 0) continue;
        const klines = await this.getKlines(symbol, this.settings.timeframe || "15m");
        if (!klines || klines.length < 50) continue;
        const signal = await this.evaluateSignal(symbol, klines, currentPrice);
        const signalCandleTime = signal?.signalTime || 0;
        const lastTraded = this.lastTradedSignal.get(symbol) || 0;
        if (signalCandleTime > 0 && signalCandleTime === lastTraded) {
          continue;
        }
        if (signal) {
          const passes = signal.score >= this.settings.autoTradeThreshold;
          this.logScanResult(symbol, signal.direction, passes, signal.reason || (passes ? "Passed" : "Low Score"), currentPrice, signal.sl, signal.tp1, signal.score);
        } else {
          this.logScanResult(symbol, "NEUTRAL", false, "Failed Technical Gates (Climax/VCB/Composite)", currentPrice, 0, 0, 0);
        }
        if (signal && signal.score >= this.settings.autoTradeThreshold) {
          const currentTotal = positionMonitor.getActivePositions().length + this.pendingSymbols.size;
          if (currentTotal >= this.settings.maxConcurrentTrades) break;
          if (activePositions.length > 0) {
            const candidateCloses = klines.map((k) => k.close);
            const candidateReturns = [];
            for (let i = 1; i < candidateCloses.length; i++) {
              candidateReturns.push((candidateCloses[i] - candidateCloses[i - 1]) / candidateCloses[i - 1]);
            }
          }
          this.pendingSymbols.add(symbol);
          console.log(`\u{1F916} [24/7 AutoTrader] Triggering Autonomous Trade on ${symbol} (${signal.direction}) @ $${currentPrice} [Score: ${signal.score}]`);
          const dummyBalance = this.settings.demoBalance !== void 0 ? this.settings.demoBalance : this.settings.startingBalance || 1e4;
          let allocatedBalance = dummyBalance * ((this.settings.positionSizePct || 10) / 100);
          let leverage = this.settings.leverage || 1;
          let quantity = allocatedBalance * leverage / currentPrice;
          const finalStrat = signal.strategy || (this.settings.activeStrategy === "AUTO_REGIME" ? "BINANCE_COMPOSITE" : this.settings.activeStrategy);
          const marketRegime = signal.marketRegime || null;
          const isAutoRegime = this.settings.activeStrategy === "AUTO_REGIME" || !!signal.isAutoRegime;
          if (finalStrat === "VOLATILITY_COMPRESSION" && signal.sl) {
            const riskPct = (this.settings.accountRiskPct || 1) / 100;
            const userTargetAlloc = dummyBalance * ((this.settings.positionSizePct || 10) / 100);
            const remainingExposure = riskManager.getRemainingExposure(dummyBalance);
            const maxAllocation = Math.min(userTargetAlloc, remainingExposure);
            if (maxAllocation <= 0) {
              console.log(`\u{1F6E1}\uFE0F [AutoTrader] Sizing skipped for ${symbol}: Maximum exposure limit reached.`);
              this.logScanResult(symbol, signal.direction, false, "Risk Manager: Maximum exposure limit reached", currentPrice, signal.sl, signal.tp1, signal.score);
              this.tradeCooldowns.set(symbol, Date.now() + 6e4);
              this.pendingSymbols.delete(symbol);
              continue;
            }
            const sizeResult = riskManager.calculateSafePositionSize(
              dummyBalance,
              currentPrice,
              signal.sl,
              signal.direction,
              { maxLeverage: this.settings.leverage || 1, maxAllocation },
              riskPct
            );
            if (sizeResult.rejected || sizeResult.contracts <= 0) {
              console.log(`[AutoTrader] VCB sizing rejected for ${symbol}: ${sizeResult.reason}`);
              this.logScanResult(symbol, signal.direction, false, `Risk Manager: ${sizeResult.reason}`, currentPrice, signal.sl, signal.tp1, signal.score);
              this.tradeCooldowns.set(symbol, Date.now() + 6e4);
              this.pendingSymbols.delete(symbol);
              continue;
            }
            quantity = sizeResult.contracts;
            leverage = sizeResult.leverage;
            allocatedBalance = sizeResult.allocatedBalance;
          }
          const activePositionsNow = positionMonitor.getActivePositions();
          const riskCheck = riskManager.checkEntryAllowed(dummyBalance, allocatedBalance, activePositionsNow.length);
          if (!riskCheck.allowed) {
            console.log(`\u{1F6E1}\uFE0F [RiskManager] Entry blocked for ${symbol}: ${riskCheck.reason}`);
            this.logScanResult(symbol, signal.direction, false, `Risk Manager: ${riskCheck.reason}`, currentPrice, signal.sl, signal.tp1, signal.score);
            this.tradeCooldowns.set(symbol, Date.now() + 6e4);
            this.pendingSymbols.delete(symbol);
            continue;
          }
          oms.placeOrder(symbol, signal.direction, currentPrice, signal.score, signal.atr, {
            qty: quantity,
            leverage,
            allocatedBalance,
            sl: signal.sl,
            tp1: signal.tp1,
            tp2: signal.tp2,
            tp3: signal.tp3,
            strategy: finalStrat,
            marketRegime,
            isAutoRegime,
            frequencyPreset: this.settings.tradeFrequency || "MEDIUM",
            compressionHigh: signal.compressionHigh,
            compressionLow: signal.compressionLow
          }).then(async (posId) => {
            if (posId) {
              await positionMonitor.refreshOpenPositions();
              this.tradeCooldowns.set(symbol, Date.now());
              if (signal.signalTime) {
                this.lastTradedSignal.set(symbol, signal.signalTime);
              }
            }
          }).catch((err) => {
            console.error(`AutoTrader error opening ${symbol}:`, err);
            this.tradeCooldowns.set(symbol, Date.now() + 6e4);
          }).finally(() => {
            this.pendingSymbols.delete(symbol);
          });
        }
      }
    } catch (e) {
      console.warn("AutoTrader scan cycle error:", e);
    } finally {
      this.isScanning = false;
    }
  }
  getCooldownMs(tf) {
    console.log(`[AutoTrader] getCooldownMs called with tf="${tf}"`);
    switch (tf) {
      case "1m":
        return 6e4;
      case "5m":
        return 3e5;
      case "15m":
        return 9e5;
      case "30m":
        return 18e5;
      case "1H":
        return 36e5;
      case "2H":
        return 72e5;
      case "4H":
        return 144e5;
      case "1D":
        return 864e5;
      default:
        return 9e5;
    }
  }
  logScanResult(symbol, direction, passes, rejectReason, price, sl, tp1, score) {
    try {
      const logLine = JSON.stringify({
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        symbol,
        direction,
        passed_gates: passes,
        reject_reason: rejectReason || null,
        entry_price: price,
        sl,
        tp1,
        score,
        strategy_version: "v2.1_closed_candles"
      }) + "\n";
      import_fs3.default.appendFileSync(import_path2.default.join(process.cwd(), "data", "scan_logs.jsonl"), logLine);
    } catch (e) {
    }
  }
  async logBinanceVsDelta(symbol, klines, currentPrice) {
    try {
      if (klines.length < 2) return;
      const c2Binance = klines[klines.length - 2];
      const endTimeSec = Math.floor(Date.now() / 1e3);
      const startTimeSec = endTimeSec - 15 * 60 * 3;
      const res = await fetch(`https://api.delta.exchange/v2/history/candles?resolution=15m&symbol=${symbol}&start=${startTimeSec}&end=${endTimeSec}`);
      if (!res.ok) {
        await res.text().catch(() => {
        });
        return;
      }
      const deltaData = await res.json();
      if (!deltaData || !deltaData.result || deltaData.result.length === 0) return;
      const c2Delta = deltaData.result.find((c) => c.time === c2Binance.time);
      if (!c2Delta) return;
      const logLine = JSON.stringify({
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        symbol,
        binance: { open: c2Binance.open, high: c2Binance.high, low: c2Binance.low, close: c2Binance.close },
        delta: { open: parseFloat(c2Delta.open), high: parseFloat(c2Delta.high), low: parseFloat(c2Delta.low), close: parseFloat(c2Delta.close) }
      }) + "\n";
      import_fs3.default.appendFileSync(import_path2.default.join(process.cwd(), "data", "delta_forward.jsonl"), logLine);
    } catch (e) {
    }
  }
  async getTopVolumeSymbols(limit = 10) {
    try {
      if (this.settings.scanOnlyWatchlist && this.settings.customWatchlist) {
        const customSymbols = this.settings.customWatchlist.split(",").map((s) => s.trim().toUpperCase()).filter((s) => s.length > 0).map((s) => s.endsWith("USDT") ? s : `${s}USDT`);
        if (customSymbols.length > 0) {
          return customSymbols;
        }
      }
      const res = await fetch("https://fapi.binance.com/fapi/v1/ticker/24hr");
      if (!res.ok) {
        await res.text().catch(() => {
        });
        return ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT", "DOGEUSDT", "ADAUSDT"];
      }
      const data = await res.json();
      const minVolume = this.settings.min24hVolume && this.settings.min24hVolume > 0 ? this.settings.min24hVolume : 25e6;
      const usdtPairs = data.filter((d) => d.symbol.endsWith("USDT") && !d.symbol.includes("_")).filter((d) => parseFloat(d.quoteVolume || "0") >= minVolume).sort((a, b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume)).slice(0, limit).map((d) => d.symbol);
      return usdtPairs.length > 0 ? usdtPairs : ["BTCUSDT", "ETHUSDT", "SOLUSDT"];
    } catch (e) {
      return ["BTCUSDT", "ETHUSDT", "SOLUSDT"];
    }
  }
  async getKlines(symbol, timeframe) {
    const cacheKey = `${symbol}_${timeframe}`;
    const cached = this.klineCache.get(cacheKey);
    const now = Date.now();
    if (cached && now - cached.time < 6e4) {
      return cached.klines;
    }
    try {
      let interval = timeframe;
      if (interval === "1H") interval = "1h";
      if (interval === "4H") interval = "4h";
      if (interval === "1D") interval = "1d";
      const res = await fetch(`https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=60`);
      if (!res.ok) {
        await res.text().catch(() => {
        });
        return [];
      }
      const raw = await res.json();
      const klines = raw.map((k) => ({
        time: Math.floor(k[0] / 1e3),
        open: parseFloat(k[1]),
        high: parseFloat(k[2]),
        low: parseFloat(k[3]),
        close: parseFloat(k[4]),
        volume: parseFloat(k[5])
      }));
      this.klineCache.set(cacheKey, { time: now, klines });
      return klines;
    } catch (e) {
      return [];
    }
  }
  async evaluateSignal(symbol, klines, currentPrice) {
    if (klines.length < 30) return null;
    if (this.settings.activeStrategy === "AUTO_REGIME") {
      return await this.evaluateAutoRegimeSignal(symbol, klines, currentPrice);
    }
    if (this.settings.activeStrategy === "DELTA_CLIMAX") {
      const sig = this.evaluateClimaxReversal(klines, currentPrice);
      if (!sig) return null;
      return { ...sig, strategy: "DELTA_CLIMAX", marketRegime: "Exhaustion Climax" };
    }
    if (this.settings.activeStrategy === "VOLATILITY_COMPRESSION") {
      const sig = await this.evaluateVolatilityCompression(symbol, klines, currentPrice);
      if (!sig) return null;
      return { ...sig, strategy: "VOLATILITY_COMPRESSION", marketRegime: "Consolidation Squeeze" };
    }
    if (this.settings.activeStrategy === "TREND_PULLBACK") {
      const signal = evaluateTrendPullback(klines, currentPrice, this.settings);
      if (!signal) return null;
      try {
        const htfCandles = await this.getKlines(symbol, "1h");
        const htfCheck = validateHigherTimeframeTrend(htfCandles, signal.direction);
        if (!htfCheck.isAligned && htfCheck.penalty <= -35) {
          console.log(`[AutoTrader TREND_PULLBACK] ${symbol} skipped: counter to 1H macro trend (${htfCheck.reason})`);
          return null;
        }
      } catch (e) {
      }
      return { ...signal, strategy: "TREND_PULLBACK", marketRegime: "Trending [EMA Pullback]" };
    }
    if (this.settings.activeStrategy === "MACRO_RANGE_BREAKOUT") {
      const atrSeries = calculateATR(klines, 14);
      const currentAtr = atrSeries[atrSeries.length - 1];
      const sig = detectMacroRangeBreakout(klines, currentPrice, currentAtr);
      if (!sig) return null;
      return { ...sig, strategy: "MACRO_RANGE_BREAKOUT", marketRegime: "Macro Accumulation" };
    }
    if (this.settings.activeStrategy === "SMC_LIQUIDITY_SWEEP") {
      try {
        const htfCandles = await this.getKlines(symbol, "1h");
        const sig = evaluateSmc(klines, htfCandles, currentPrice);
        if (sig && sig.score >= this.settings.autoTradeThreshold) {
          const expiryTime = Date.now() + 15 * 60 * 1e3 * 4;
          this.pendingSmcSetups.set(symbol, { ...sig, expiryTime });
          console.log(`\u{1F916} [SMC] Pending limit setup found for ${symbol} (${sig.direction}). Waiting for FVG retracement. Zone: ${sig.entryZoneMin} - ${sig.entryZoneMax}`);
        }
      } catch (e) {
      }
      return null;
    }
    const compSig = this.evaluateCompositeStrategy(klines, currentPrice);
    if (!compSig) return null;
    return { ...compSig, strategy: "BINANCE_COMPOSITE", marketRegime: "Trending [10-Gate Momentum]" };
  }
  /**
   * Evaluates market regime (Trending, Consolidation Squeeze, or Exhaustion Climax)
   * and auto-selects the strategy with highest expected value (EV).
   */
  async evaluateAutoRegimeSignal(symbol, klines, currentPrice) {
    if (klines.length < 35) return null;
    const closes = klines.map((k) => k.close);
    const lastIdx = closes.length - 1;
    const calcEMA = (period) => {
      const k = 2 / (period + 1);
      let ema = closes[0];
      for (let i = 1; i < closes.length; i++) {
        ema = closes[i] * k + ema * (1 - k);
      }
      return ema;
    };
    const ema9 = calcEMA(9);
    const ema21 = calcEMA(21);
    const ema50 = calcEMA(Math.min(50, closes.length));
    let atrSum = 0;
    for (let i = lastIdx - 14; i < lastIdx; i++) {
      if (i <= 0) continue;
      const h = klines[i].high;
      const l = klines[i].low;
      const prevC = klines[i - 1].close;
      atrSum += Math.max(h - l, Math.abs(h - prevC), Math.abs(l - prevC));
    }
    const currentAtr = Math.max(atrSum / 14, currentPrice * 5e-3);
    const overextensionAtr = Math.abs(currentPrice - ema50) / currentAtr;
    const isUptrend = ema9 > ema21 && ema21 > ema50;
    const isDowntrend = ema9 < ema21 && ema21 < ema50;
    const isTrending = isUptrend || isDowntrend;
    if (overextensionAtr >= 1.8) {
      const climaxSignal = this.evaluateClimaxReversal(klines, currentPrice);
      if (climaxSignal && climaxSignal.score >= this.settings.autoTradeThreshold) {
        return {
          ...climaxSignal,
          strategy: "DELTA_CLIMAX",
          marketRegime: "Exhaustion Climax",
          isAutoRegime: true,
          reason: `Auto-Selected DELTA_CLIMAX (Exhaustion Regime, Overextension ${overextensionAtr.toFixed(1)}x ATR)`
        };
      }
    }
    try {
      const htfCandles = await this.getKlines(symbol, "1h");
      const smcSig = evaluateSmc(klines, htfCandles, currentPrice);
      if (smcSig && smcSig.score >= this.settings.autoTradeThreshold) {
        const expiryTime = Date.now() + 15 * 60 * 1e3 * 4;
        this.pendingSmcSetups.set(symbol, { ...smcSig, expiryTime });
        console.log(`\u{1F916} [AutoRegime -> SMC] Pending limit setup found for ${symbol} (${smcSig.direction}). Waiting for FVG retracement.`);
        return null;
      }
    } catch (e) {
    }
    if (isTrending) {
      const pullbackSignal = evaluateTrendPullback(klines, currentPrice, this.settings);
      if (pullbackSignal && pullbackSignal.score >= this.settings.autoTradeThreshold) {
        let htfAligned = true;
        try {
          const htfCandles = await this.getKlines(symbol, "1h");
          const htfCheck = validateHigherTimeframeTrend(htfCandles, pullbackSignal.direction);
          if (!htfCheck.isAligned && htfCheck.penalty <= -35) {
            htfAligned = false;
          }
        } catch (e) {
        }
        if (htfAligned) {
          return {
            ...pullbackSignal,
            strategy: "TREND_PULLBACK",
            marketRegime: "Trending [EMA Pullback]",
            isAutoRegime: true,
            reason: `Auto-Selected TREND_PULLBACK (Trending Regime with 1H Macro Alignment)`
          };
        }
      }
    }
    const macroSignal = detectMacroRangeBreakout(klines, currentPrice, currentAtr);
    if (macroSignal && macroSignal.score >= this.settings.autoTradeThreshold) {
      return {
        ...macroSignal,
        strategy: "MACRO_RANGE_BREAKOUT",
        marketRegime: "Macro Accumulation",
        isAutoRegime: true,
        reason: `Auto-Selected MACRO_RANGE_BREAKOUT (Massive 150-candle consolidation broken)`
      };
    }
    const vcbSignal = await this.evaluateVolatilityCompression(symbol, klines, currentPrice);
    if (vcbSignal && vcbSignal.score >= this.settings.autoTradeThreshold) {
      return {
        ...vcbSignal,
        strategy: "VOLATILITY_COMPRESSION",
        marketRegime: "Consolidation Squeeze",
        isAutoRegime: true,
        reason: `Auto-Selected VOLATILITY_COMPRESSION (Squeeze Compression Release)`
      };
    }
    const compositeSignal = this.evaluateCompositeStrategy(klines, currentPrice);
    if (compositeSignal && compositeSignal.score >= this.settings.autoTradeThreshold) {
      return {
        ...compositeSignal,
        strategy: "BINANCE_COMPOSITE",
        marketRegime: "Trending [10-Gate Momentum]",
        isAutoRegime: true,
        reason: `Auto-Selected BINANCE_COMPOSITE (Directional Momentum Expansion)`
      };
    }
    const candidates = [];
    const cs = this.evaluateClimaxReversal(klines, currentPrice);
    if (cs && cs.score >= this.settings.autoTradeThreshold) {
      candidates.push({ signal: cs, strategy: "DELTA_CLIMAX", regime: "Exhaustion Climax", priority: cs.score + 5 });
    }
    const ps = evaluateTrendPullback(klines, currentPrice, this.settings);
    if (ps && ps.score >= this.settings.autoTradeThreshold) {
      candidates.push({ signal: ps, strategy: "TREND_PULLBACK", regime: "Trending [EMA Pullback]", priority: ps.score + 3 });
    }
    const vs = await this.evaluateVolatilityCompression(symbol, klines, currentPrice);
    if (vs && vs.score >= this.settings.autoTradeThreshold) {
      candidates.push({ signal: vs, strategy: "VOLATILITY_COMPRESSION", regime: "Consolidation Squeeze", priority: vs.score });
    }
    const macroFallback = detectMacroRangeBreakout(klines, currentPrice, currentAtr);
    if (macroFallback && macroFallback.score >= this.settings.autoTradeThreshold) {
      candidates.push({ signal: macroFallback, strategy: "MACRO_RANGE_BREAKOUT", regime: "Macro Accumulation", priority: macroFallback.score + 10 });
    }
    const comp = this.evaluateCompositeStrategy(klines, currentPrice);
    if (comp && comp.score >= this.settings.autoTradeThreshold) {
      candidates.push({ signal: comp, strategy: "BINANCE_COMPOSITE", regime: "Trending [10-Gate Momentum]", priority: comp.score });
    }
    if (candidates.length > 0) {
      candidates.sort((a, b) => b.priority - a.priority);
      const winner = candidates[0];
      return {
        ...winner.signal,
        strategy: winner.strategy,
        marketRegime: winner.regime,
        isAutoRegime: true,
        reason: `Auto-Selected ${winner.strategy} (Highest EV in ${winner.regime})`
      };
    }
    return null;
  }
  /**
   * Internal Composite 10-Gate evaluator
   */
  evaluateCompositeStrategy(klines, currentPrice) {
    const closes = klines.map((k) => k.close);
    const lastIdx = closes.length - 1;
    const lastClose = closes[lastIdx];
    const calcEMA = (period) => {
      const k = 2 / (period + 1);
      let ema = closes[0];
      for (let i = 1; i < closes.length; i++) {
        ema = closes[i] * k + ema * (1 - k);
      }
      return ema;
    };
    const ema9 = calcEMA(9);
    const ema21 = calcEMA(21);
    const ema50 = calcEMA(Math.min(50, closes.length));
    let atrSum = 0;
    for (let i = lastIdx - 14; i < lastIdx; i++) {
      if (i <= 0) continue;
      const h = klines[i].high;
      const l = klines[i].low;
      const prevC = klines[i - 1].close;
      const tr = Math.max(h - l, Math.abs(h - prevC), Math.abs(l - prevC));
      atrSum += tr;
    }
    const atr = Math.max(atrSum / 14, currentPrice * 0.01);
    let gains = 0, losses = 0;
    for (let i = lastIdx - 14; i < lastIdx; i++) {
      if (i <= 0) continue;
      const diff = closes[i] - closes[i - 1];
      if (diff > 0) gains += diff;
      else losses -= diff;
    }
    const rs = losses === 0 ? 100 : gains / (losses || 1);
    const rsi = 100 - 100 / (1 + rs);
    let direction = null;
    let score = 50;
    const disabledGates = this.settings.disabledGates || {};
    const isBypassed = (id, key) => !!(disabledGates[id] || disabledGates[key]);
    const g4Bypassed = isBypassed("COMPOSITE_g4", "g4");
    const g6Bypassed = isBypassed("COMPOSITE_g6", "g6");
    if (lastClose > ema9 && ema9 > ema21 && ema21 > ema50 || g4Bypassed && lastClose > ema21) {
      direction = "LONG";
      score += 25;
      if (rsi > 45 && rsi < 70 || g6Bypassed) score += 15;
    } else if (lastClose < ema9 && ema9 < ema21 && ema21 < ema50 || g4Bypassed && lastClose < ema21) {
      direction = "SHORT";
      score += 25;
      if (rsi < 55 && rsi > 30 || g6Bypassed) score += 15;
    }
    if (!direction || score < this.settings.autoTradeThreshold) return null;
    const slDist = atr * 1;
    const sl = direction === "LONG" ? Math.max(1e-4, currentPrice - slDist) : currentPrice + slDist;
    const tp1 = direction === "LONG" ? currentPrice + slDist * 1 : Math.max(1e-4, currentPrice - slDist * 1);
    const tp2 = direction === "LONG" ? currentPrice + slDist * 2 : Math.max(1e-4, currentPrice - slDist * 2);
    const tp3 = direction === "LONG" ? currentPrice + slDist * 3 : Math.max(1e-4, currentPrice - slDist * 3);
    return {
      direction,
      score: Math.min(score, 99),
      atr,
      sl,
      tp1,
      tp2,
      tp3
    };
  }
  evaluateClimaxReversal(candles, currentPrice) {
    const lookback = this.settings.crClimaxLookback || 20;
    const emaBaselinePeriod = this.settings.crEmaBaseline || 200;
    const atrPeriod = this.settings.crAtrPeriod || 14;
    const atrAvgPeriod = this.settings.crAtrAveragePeriod || 50;
    const minOverextension = this.settings.crMinOverextensionAtr || 2;
    const minAtrVsAvg = this.settings.crMinAtrVsAverage || 1;
    const minRejectionWick = this.settings.crMinRejectionWickRatio || 0.45;
    const minClimaxRange = this.settings.crMinClimaxRangeRatio || 1.3;
    if (candles.length < Math.max(lookback, 30)) return null;
    const close = candles.map((c) => c.close);
    const high = candles.map((c) => c.high);
    const low = candles.map((c) => c.low);
    const open = candles.map((c) => c.open);
    const volume = candles.map((c) => c.volume || 0);
    const kBase = 2 / (Math.min(emaBaselinePeriod, candles.length) + 1);
    const kFast = 2 / (5 + 1);
    let emaBase = close[0];
    let emaFast = close[0];
    const emaBaselineArr = [emaBase];
    const emaFastArr = [emaFast];
    for (let i = 1; i < close.length; i++) {
      emaBase = close[i] * kBase + emaBase * (1 - kBase);
      emaFast = close[i] * kFast + emaFast * (1 - kFast);
      emaBaselineArr.push(emaBase);
      emaFastArr.push(emaFast);
    }
    const tr = [high[0] - low[0]];
    for (let i = 1; i < candles.length; i++) {
      tr.push(Math.max(high[i] - low[i], Math.abs(high[i] - close[i - 1]), Math.abs(low[i] - close[i - 1])));
    }
    const calcSMALocal = (arr, p) => {
      const res = [];
      for (let i = 0; i < arr.length; i++) {
        if (i < p - 1) {
          res.push(arr[i]);
        } else {
          let sum = 0;
          for (let j = 0; j < p; j++) sum += arr[i - j];
          res.push(sum / p);
        }
      }
      return res;
    };
    const atrArr = calcSMALocal(tr, atrPeriod);
    const atrAvgArr = calcSMALocal(atrArr, atrAvgPeriod);
    const rangeArr = candles.map((c) => c.high - c.low);
    const avgRangeArr = calcSMALocal(rangeArr, lookback);
    const avgVolArr = calcSMALocal(volume, lookback);
    const c1 = {
      open: open[candles.length - 3],
      high: high[candles.length - 3],
      low: low[candles.length - 3],
      close: close[candles.length - 3],
      volume: volume[candles.length - 3],
      range: rangeArr[candles.length - 3],
      avgRange: avgRangeArr[candles.length - 3],
      avgVolume: avgVolArr[candles.length - 3],
      atr: atrArr[candles.length - 3],
      atrAvg: atrAvgArr[candles.length - 3],
      emaBaseline: emaBaselineArr[candles.length - 3],
      emaFast: emaFastArr[candles.length - 3]
    };
    const c2 = {
      open: open[candles.length - 2],
      high: high[candles.length - 2],
      low: low[candles.length - 2],
      close: close[candles.length - 2],
      range: rangeArr[candles.length - 2],
      atr: atrArr[candles.length - 2] || c1.atr
    };
    const getRejectionWick = (c) => {
      const tot = c.high - c.low;
      if (tot === 0) return 0;
      const top = Math.max(c.open, c.close);
      const bot = Math.min(c.open, c.close);
      return c.close < c.open ? (c.high - top) / tot : (bot - c.low) / tot;
    };
    const disabledGates = this.settings.disabledGates || {};
    const isBypassed = (id, key) => !!(disabledGates[id] || disabledGates[key]);
    const bypassClimaxRange = isBypassed("CR_climaxRange", "cr_climaxRange") || c1.volume && c1.avgVolume && c1.volume >= c1.avgVolume * 2.5;
    const bypassOverext = isBypassed("CR_overextension", "cr_overextension");
    const bypassVol = isBypassed("CR_volatility", "cr_volatility");
    const bypassRejection = isBypassed("CR_rejectionWick", "cr_rejectionWick");
    const recentLows = low.slice(Math.max(0, low.length - 25), low.length - 2);
    const lowestRecentLow = recentLows.length > 0 ? Math.min(...recentLows) : c1.low;
    const recentHighs = high.slice(Math.max(0, high.length - 25), high.length - 2);
    const highestRecentHigh = recentHighs.length > 0 ? Math.max(...recentHighs) : c1.high;
    if (c1.close > c1.open && c1.close > (c1.emaBaseline || 0) && // MUST be above baseline in premium territory, not deep in a downtrend
    c1.high >= highestRecentHigh * 0.995 && // MUST be at the peak of the recent swing
    (bypassClimaxRange || c1.range >= minClimaxRange * c1.avgRange) && (bypassOverext || c1.close - c1.emaFast >= minOverextension * c1.atr || c1.close - c1.emaBaseline >= minOverextension * c1.atr) && (bypassVol || c1.volume >= c1.avgVolume * 2.5 || c1.atr >= minAtrVsAvg * c1.atrAvg) && c2.close < c2.open && (bypassRejection || c2.close < c1.open || getRejectionWick(c2) >= minRejectionWick) && c2.high >= c1.high * 0.998 && currentPrice > lowestRecentLow + c2.atr * 0.4) {
      const stopLevel = Math.max(c1.high, c2.high) + c2.atr * 0.2;
      const risk = Math.abs(currentPrice - stopLevel);
      if (risk <= c2.atr * 1.5) {
        return {
          signalTime: candles[candles.length - 2].time,
          direction: "SHORT",
          score: 95,
          atr: c2.atr,
          sl: stopLevel,
          tp1: Math.max(1e-4, currentPrice - 1.5 * risk),
          tp2: Math.max(1e-4, currentPrice - 3 * risk),
          // 1:3 RR
          tp3: Math.max(1e-4, currentPrice - 5 * risk)
          // 1:5 Extended runner
        };
      }
    }
    if (c1.close < c1.open && c1.close < (c1.emaBaseline || Infinity) && // MUST be below baseline in discount territory, not at the top of an uptrend
    c1.low <= lowestRecentLow * 1.005 && // MUST be at the trough of the recent swing
    (bypassClimaxRange || c1.range >= minClimaxRange * c1.avgRange) && (bypassOverext || c1.emaFast - c1.close >= minOverextension * c1.atr || c1.emaBaseline - c1.close >= minOverextension * c1.atr) && (bypassVol || c1.volume >= c1.avgVolume * 2.5 || c1.atr >= minAtrVsAvg * c1.atrAvg) && c2.close > c2.open && (bypassRejection || c2.close > c1.open || getRejectionWick(c2) >= minRejectionWick) && c2.low <= c1.low * 1.002 && currentPrice < highestRecentHigh - c2.atr * 0.4) {
      const stopLevel = Math.min(c1.low, c2.low) - c2.atr * 0.2;
      const risk = Math.abs(currentPrice - stopLevel);
      if (risk <= c2.atr * 1.5) {
        return {
          signalTime: candles[candles.length - 2].time,
          direction: "LONG",
          score: 95,
          atr: c2.atr,
          sl: stopLevel,
          tp1: currentPrice + 1.5 * risk,
          tp2: currentPrice + 3 * risk,
          // 1:3 RR
          tp3: currentPrice + 5 * risk
          // 1:5 Extended runner
        };
      }
    }
    return null;
  }
  async evaluateVolatilityCompression(symbol, candles, currentPrice) {
    if (candles.length < 50) return null;
    const candlesCopy = candles.map((c) => ({ ...c }));
    const lastCandle = candlesCopy[candlesCopy.length - 1];
    lastCandle.close = currentPrice;
    lastCandle.high = Math.max(lastCandle.high, currentPrice);
    lastCandle.low = Math.min(lastCandle.low, currentPrice);
    const previousCandles = candlesCopy.slice(0, -1);
    const atrSeries = calculateATR(previousCandles, 14);
    const atr = atrSeries[atrSeries.length - 1];
    const atrAvg = atrSeries.slice(-50).reduce((a, b) => a + b, 0) / 50;
    const settingsObj = this.settings;
    const compression = detectCompression(previousCandles, atr, atrAvg, settingsObj);
    const breakout = detectBreakout(lastCandle, compression, atr, settingsObj, candlesCopy);
    if (!breakout) return null;
    let htfPenalty = 0;
    let htfReason = "";
    try {
      const htfCandles = await this.getKlines(symbol, "1h");
      const htfCheck = validateHigherTimeframeTrend(htfCandles, breakout.direction);
      htfPenalty = htfCheck.penalty;
      htfReason = htfCheck.reason;
      if (!htfCheck.isAligned && htfPenalty <= -35) {
        console.log(`[AutoTrader VCB] ${symbol} skipped: counter to 1H macro trend (${htfReason})`);
        return null;
      }
    } catch (e) {
    }
    const closes = candles.map((c) => c.close);
    const ema9Series = calculateEMA(closes, 9);
    const ema21Series = calculateEMA(closes, 21);
    const ema50Series = calculateEMA(closes, 50);
    const rsiSeries = calculateRSI(closes, 14);
    const ema9 = ema9Series[ema9Series.length - 1];
    const ema21 = ema21Series[ema21Series.length - 1];
    const ema50 = ema50Series[ema50Series.length - 1];
    const rsi = rsiSeries[rsiSeries.length - 1];
    let score = scoreBreakout(breakout, settingsObj);
    score = applyTrendAndMomentumBonus(score, breakout.direction, ema9, ema21, ema50, rsi, settingsObj);
    score = Math.max(0, Math.min(100, score + htfPenalty));
    if (score < this.settings.autoTradeThreshold) return null;
    const sl = determineStopLoss(breakout.direction, compression, atr, settingsObj, candles, currentPrice);
    const tp1 = calculateInitialTp(currentPrice, breakout.direction, atr, settingsObj);
    return {
      direction: breakout.direction,
      score,
      atr,
      sl,
      tp1,
      tp2: tp1,
      // Will trail via chandelier
      tp3: tp1,
      compressionHigh: compression.windowHigh,
      compressionLow: compression.windowLow,
      signalTime: lastCandle.time,
      reason: `VCB Pre-Blast Inception (RVOL: ${breakout.rvol.toFixed(1)}x, CLV: ${(breakout.closeLocationValue * 100).toFixed(0)}%, Squeeze: ${compression.isSqueezed ? "YES" : "ATR"})`
    };
  }
};
var autoTrader = new AutoTrader();
oms.onTradeClosed = (pnl) => {
  autoTrader.updateDemoBalance(pnl);
};

// server.ts
var execAsync = (0, import_util.promisify)(import_child_process.exec);
async function startServer() {
  const { app: app2 } = (0, import_express_ws.default)((0, import_express.default)());
  const PORT = 3e3;
  console.log(`\u{1F525} Starting Trading Engine on port ${PORT}...`);
  app2.use(import_express.default.json());
  const clients = /* @__PURE__ */ new Set();
  setInterval(() => {
    for (const client of clients) {
      if (client.readyState === 1) {
        try {
          client.ping();
        } catch (e) {
        }
      }
    }
  }, 15e3);
  priceStream.subscribe((priceMap, batch) => {
    if (clients.size > 0 && batch.length > 0) {
      const msg = JSON.stringify(batch);
      for (const client of clients) {
        if (client.readyState === 1) {
          try {
            client.send(msg);
          } catch (e) {
          }
        }
      }
    }
  });
  app2.ws("/ws/binance", (ws, req) => {
    console.log(`[WS] UI Client connected from ${req.ip || "unknown"}`);
    clients.add(ws);
    const currentPrices = priceStream.getAllPrices();
    if (currentPrices.length > 0) {
      try {
        ws.send(JSON.stringify(currentPrices));
      } catch (e) {
      }
    }
    ws.on("close", () => {
      console.log(`[WS] UI Client disconnected`);
      clients.delete(ws);
    });
    ws.on("error", () => clients.delete(ws));
  });
  let cachedSymbols = [];
  let lastSymbolsFetchTime = 0;
  app2.get("/api/debug", (req, res) => {
    res.json({
      pricesLength: priceStream.getAllPrices().length
    });
  });
  app2.get("/api/health", (req, res) => {
    res.json({
      status: "ok",
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      activePositions: positionMonitor.getActivePositions().length,
      telegramConfigured: telegramService.isConfigured()
    });
  });
  app2.get("/api/bot/prices", async (req, res) => {
    try {
      const prices = priceStream.getAllPrices();
      res.json(prices);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });
  app2.get("/api/binance/proxy", async (req, res) => {
    try {
      const { path: path4, ...queryParams } = req.query;
      const url = new URL(`https://fapi.binance.com${path4 || ""}`);
      for (const [key, val] of Object.entries(queryParams)) {
        if (typeof val === "string") {
          url.searchParams.append(key, val);
        } else if (Array.isArray(val)) {
          val.forEach((v) => url.searchParams.append(key, String(v)));
        } else if (val !== void 0 && val !== null) {
          url.searchParams.append(key, String(val));
        }
      }
      const response = await fetch(url.toString());
      if (!response.ok) {
        return res.status(response.status).json({ error: "Binance API error", statusText: response.statusText });
      }
      const data = await response.json();
      res.json(data);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });
  app2.get("/api/bot/symbols", async (req, res) => {
    try {
      const now = Date.now();
      if (cachedSymbols.length > 0 && now - lastSymbolsFetchTime < 3e5) {
        return res.json(cachedSymbols);
      }
      const symbols = await executionAdapter.getActivePerpetualSymbols();
      if (symbols && symbols.length > 0) {
        cachedSymbols = symbols;
        lastSymbolsFetchTime = now;
      }
      res.json(cachedSymbols.length > 0 ? cachedSymbols : symbols);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });
  app2.get("/api/bot/settings", async (req, res) => {
    try {
      const settings = await autoTrader.loadSettings();
      res.json(settings);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });
  app2.get("/api/bot/balance", async (req, res) => {
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
  app2.post("/api/bot/settings", async (req, res) => {
    try {
      const payload = { ...req.body };
      delete payload.demoBalance;
      delete payload.equitySnapshots;
      const updated = await autoTrader.saveSettings(payload);
      res.json({ success: true, settings: updated });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });
  app2.post("/api/bot/telegram/test", async (req, res) => {
    try {
      const { botToken, chatId } = req.body;
      if (botToken && chatId) {
        telegramService.updateConfig(botToken, chatId);
      }
      const success = await telegramService.sendMessage(
        `\u{1F916} *Telegram Alerts Connected!* \u{1F680}

Your 24/7 Crypto Futures Auto-Trade Bot is online and actively monitoring live Binance markets.
You will receive real-time notifications whenever a trade is executed, take-profit is reached, or stop-loss is triggered.

\u23F0 _Connected at ${(/* @__PURE__ */ new Date()).toUTCString()}_`
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
  app2.get("/api/positions", async (req, res) => {
    try {
      const q = (0, import_firestore6.query)((0, import_firestore6.collection)(db, "positions"), (0, import_firestore6.where)("status", "==", "OPEN"));
      const snapshot = await (0, import_firestore6.getDocs)(q);
      const positions = snapshot.docs.map((doc6) => doc6.data());
      res.json(positions);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });
  app2.get("/api/trade_logs", async (req, res) => {
    try {
      const q = (0, import_firestore6.query)((0, import_firestore6.collection)(db, "trade_logs"), (0, import_firestore6.orderBy)("time_close", "desc"));
      const snapshot = await (0, import_firestore6.getDocs)(q);
      const logs = snapshot.docs.map((doc6) => doc6.data());
      res.json(logs);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });
  app2.post("/api/bot/trade", async (req, res) => {
    try {
      const { symbol, direction, price, quantity, leverage, allocatedBalance, score, atr, sl, tp1, tp2, tp3, strategy, frequencyPreset, marketRegime, isAutoRegime } = req.body;
      if (!symbol || !direction || !price) {
        return res.status(400).json({ success: false, error: "Missing required trade fields (symbol, direction, price)" });
      }
      const customOpts = { qty: quantity, leverage, allocatedBalance, sl, tp1, tp2, tp3, strategy, frequencyPreset: frequencyPreset || "MEDIUM", marketRegime, isAutoRegime };
      const posId = await oms.placeOrder(symbol, direction, price, score || 100, atr || price * 0.01, customOpts);
      if (!posId) {
        return res.status(400).json({ success: false, error: "Risk manager rejected or order already processing" });
      }
      await positionMonitor.refreshOpenPositions();
      res.json({ success: true, posId });
    } catch (e) {
      console.error("Trade execution error:", e);
      res.status(500).json({ success: false, error: String(e) });
    }
  });
  app2.post("/api/bot/close", async (req, res) => {
    try {
      const { id, currentPrice, reason } = req.body;
      const pnl = await oms.closePosition(id, currentPrice, reason || "MANUAL");
      await positionMonitor.refreshOpenPositions();
      res.json({ success: true, pnl });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });
  app2.post("/api/bot/reset", async (req, res) => {
    try {
      riskManager.reset();
      const posSnapshot = await (0, import_firestore6.getDocs)((0, import_firestore6.collection)(db, "positions"));
      const posBatch = (0, import_firestore6.writeBatch)(db);
      posSnapshot.docs.forEach((doc6) => {
        posBatch.delete(doc6.ref);
      });
      await posBatch.commit();
      const logsSnapshot = await (0, import_firestore6.getDocs)((0, import_firestore6.collection)(db, "trade_logs"));
      const logsBatch = (0, import_firestore6.writeBatch)(db);
      logsSnapshot.docs.forEach((doc6) => {
        logsBatch.delete(doc6.ref);
      });
      await logsBatch.commit();
      const settings = autoTrader.getSettings();
      settings.demoBalance = settings.startingBalance || 1e4;
      settings.equitySnapshots = [];
      await autoTrader.saveSettings(settings);
      await positionMonitor.refreshOpenPositions();
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });
  app2.post("/api/bot/flatten", async (req, res) => {
    try {
      const q = (0, import_firestore6.query)((0, import_firestore6.collection)(db, "positions"), (0, import_firestore6.where)("status", "==", "OPEN"));
      const snapshot = await (0, import_firestore6.getDocs)(q);
      const positions = snapshot.docs.map((doc6) => doc6.data());
      for (const p of positions) {
        await oms.closePosition(p.id, p.current_price, "FLATTEN");
      }
      await positionMonitor.refreshOpenPositions();
      res.json({ success: true, message: `Flattened ${positions.length} positions.` });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });
  app2.get("/api/status", (req, res) => {
    res.json({
      status: "24/7 Trading engine active.",
      stream: "Binance Futures Live WebSocket",
      activePositions: positionMonitor.getActivePositions().length
    });
  });
  app2.post("/api/git/push", async (req, res) => {
    const { token, repoUrl, commitMessage = "Auto-commit from Trading Bot Settings UI", force = false } = req.body;
    if (!token || typeof token !== "string" || !token.trim()) {
      return res.status(400).json({ success: false, error: "GitHub token required. Please provide a Personal Access Token with repo scope." });
    }
    const cleanToken = token.trim();
    try {
      await execAsync('git config --global --add safe.directory "*"').catch(() => {
      });
      await execAsync('git config --global user.name "AI Studio Bot"').catch(() => {
      });
      await execAsync('git config --global user.email "bot@aistudio.local"').catch(() => {
      });
      try {
        await execAsync("git rev-parse --is-inside-work-tree");
      } catch {
        await execAsync("git init -b main");
      }
      await execAsync('git config user.name "AI Studio Bot"').catch(() => {
      });
      await execAsync('git config user.email "bot@aistudio.local"').catch(() => {
      });
      await execAsync("git branch -M main").catch(() => {
      });
      await execAsync("git add -A");
      const statusRes = await execAsync("git status --porcelain").catch(() => ({ stdout: "" }));
      const hasChanges = statusRes.stdout && statusRes.stdout.trim().length > 0;
      if (hasChanges) {
        const safeCommitMsg = commitMessage.replace(/"/g, '\\"');
        await execAsync(`git commit -m "${safeCommitMsg}"`);
      } else {
        const hasCommits = await execAsync("git rev-parse --verify HEAD").then(() => true).catch(() => false);
        if (!hasCommits) {
          await execAsync('git commit --allow-empty -m "Initial commit from Trading Bot"');
        }
      }
      let rawRepo = (repoUrl || "https://github.com/danish7355/quant-stack.git").trim();
      let cleanRepo = rawRepo.replace(/^https?:\/\//i, "").replace(/^[^\/@]+@/i, "");
      if (!cleanRepo.startsWith("github.com/")) {
        cleanRepo = `github.com/${cleanRepo.replace(/^\/+/, "")}`;
      }
      if (!cleanRepo.endsWith(".git")) {
        cleanRepo = `${cleanRepo}.git`;
      }
      const authRepoUrl = `https://${encodeURIComponent(cleanToken)}@${cleanRepo}`;
      try {
        await execAsync(`git remote add origin ${authRepoUrl}`);
      } catch {
        await execAsync(`git remote set-url origin ${authRepoUrl}`);
      }
      const pushCommand = force ? "git push -u origin main --force" : "git push -u origin main";
      try {
        await execAsync(pushCommand);
      } catch (pushErr) {
        const errStr = pushErr.message || String(pushErr);
        if (errStr.includes("fetch first") || errStr.includes("non-fast-forward") || errStr.includes("Updates were rejected")) {
          if (force) {
            throw pushErr;
          }
          try {
            await execAsync("git pull origin main --allow-unrelated-histories -X ours --no-edit");
            await execAsync("git push -u origin main");
          } catch (mergeErr) {
            await execAsync("git merge --abort").catch(() => {
            });
            throw new Error('Remote repository has conflicting commits. Enable "Force Push" in Settings to overwrite the remote repository.');
          }
        } else if (errStr.includes("Authentication failed") || errStr.includes("Invalid username or personal access token")) {
          throw new Error('GitHub Authentication failed: Please verify your Personal Access Token has the "repo" scope selected.');
        } else if (errStr.includes("Repository not found")) {
          throw new Error(`Repository not found or access denied: Please check that the repository exists on GitHub and your token has permission to access it.`);
        } else {
          throw pushErr;
        }
      }
      res.json({ success: true, message: "Code successfully pushed to GitHub main branch!" });
    } catch (error) {
      const rawError = error.message || String(error);
      const sanitized = rawError.replace(new RegExp(cleanToken.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"), "***");
      console.error("Git push error:", sanitized);
      res.status(500).json({ success: false, error: sanitized });
    }
  });
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app2.use(vite.middlewares);
  } else {
    const distPath = import_path3.default.join(process.cwd(), "dist");
    app2.use(import_express.default.static(distPath));
    app2.get("*", (req, res) => {
      const indexPath = import_path3.default.join(distPath, "index.html");
      if (import_fs4.default.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(404).send("Application frontend build not found. Please ensure 'npm run build' has completed.");
      }
    });
  }
  const server = app2.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
  process.on("SIGTERM", () => {
    console.log("\u{1F6D1} [SIGTERM] Received termination signal. Shutting down gracefully...");
    server.close(() => {
      console.log("\u2705 Server closed.");
      process.exit(0);
    });
  });
  process.on("SIGINT", () => {
    console.log("\u{1F6D1} [SIGINT] Received interrupt signal. Shutting down...");
    server.close(() => {
      process.exit(0);
    });
  });
}
startServer();
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
//# sourceMappingURL=server.cjs.map
