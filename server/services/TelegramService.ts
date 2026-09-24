import { db } from '../firebase.js';
import { doc } from 'firebase/firestore';
import { safeGetDoc, readLocalJson } from './firestoreSafe.js';

/**
 * Escapes characters that are special in Telegram HTML format: &, <, >
 */
export function escapeHtml(str: string | number | undefined | null): string {
  if (str === undefined || str === null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Safe price formatter preventing TypeError on undefined/null values
 */
export function formatPrice(val: number | undefined | null): string {
  if (val === undefined || val === null || isNaN(Number(val))) return '0.00';
  return Number(val).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 });
}

/**
 * Safe numeric formatter preventing TypeError on undefined/null values
 */
export function formatNum(val: number | undefined | null, decimals: number = 2): string {
  if (val === undefined || val === null || isNaN(Number(val))) return '0.00';
  return Number(val).toFixed(decimals);
}

export class TelegramService {
  private botToken: string = '';
  private chatId: string = '';

  // Alert Settings
  public alertOnNewSignal: boolean = true;
  public alertOnTradeExecuted: boolean = true;
  public alertOnTpHit: boolean = true;
  public alertOnSlHit: boolean = true;
  public alertOnTsMoved: boolean = true;
  public alertOnDailyLossLimit: boolean = true;
  public alertOnRangingDetected: boolean = true;
  public alertSilentMode: boolean = false;
  public alertFormat: 'Verbose' | 'Minimal' = 'Verbose';

  private messageQueue: { text: string; resolve: (val: boolean) => void }[] = [];
  private isProcessingQueue: boolean = false;
  private lastSendTime: number = 0;
  private lastError: string = '';

  constructor(autoLoad: boolean = true) {
    this.botToken = this.sanitizeToken(process.env.TELEGRAM_BOT_TOKEN || '');
    this.chatId = this.sanitizeChatId(process.env.TELEGRAM_CHAT_ID || '');
    if (autoLoad && process.env.NODE_ENV !== 'test') {
      this.loadConfigFromDb().catch(() => {});
    }
  }

  /**
   * Cleans tokens: removes leading 'bot' prefix if user accidentally included it, strips whitespace
   */
  public sanitizeToken(token?: string): string {
    if (!token) return '';
    return token.trim().replace(/^bot/i, '');
  }

  /**
   * Cleans chat IDs: removes quotes, leading/trailing whitespace
   */
  public sanitizeChatId(chatId?: string): string {
    if (!chatId) return '';
    return chatId.trim().replace(/^["']|["']$/g, '');
  }

  public getLastError(): string {
    return this.lastError;
  }

  public async loadConfigFromDb() {
    // 1. Try local settings backup first
    try {
      const localSettings = readLocalJson<any>('settings.json', null);
      if (localSettings) {
        if (localSettings.telegramBotToken !== undefined) {
          this.botToken = this.sanitizeToken(localSettings.telegramBotToken);
        }
        if (localSettings.telegramChatId !== undefined) {
          this.chatId = this.sanitizeChatId(localSettings.telegramChatId);
        }
        this.updateSettings(localSettings);
      }
    } catch (e) {}

    // 2. Load from Firestore
    try {
      const snapRes = await safeGetDoc(doc(db, 'settings', 'bot_config'));
      if (snapRes.exists && snapRes.data) {
        const data = snapRes.data;
        if (data.telegramBotToken !== undefined) {
          this.botToken = this.sanitizeToken(data.telegramBotToken);
        }
        if (data.telegramChatId !== undefined) {
          this.chatId = this.sanitizeChatId(data.telegramChatId);
        }
        
        this.alertOnNewSignal = data.alertOnNewSignal ?? true;
        this.alertOnTradeExecuted = data.alertOnTradeExecuted ?? true;
        this.alertOnTpHit = data.alertOnTpHit ?? true;
        this.alertOnSlHit = data.alertOnSlHit ?? true;
        this.alertOnTsMoved = data.alertOnTsMoved ?? true;
        this.alertOnDailyLossLimit = data.alertOnDailyLossLimit ?? true;
        this.alertOnRangingDetected = data.alertOnRangingDetected ?? true;
        this.alertSilentMode = data.alertSilentMode ?? false;
        this.alertFormat = data.alertFormat ?? 'Verbose';
        
        console.log(`📱 [Telegram] Config loaded. Chat: ${this.chatId ? 'Configured' : 'Missing'}, Token: ${this.botToken ? 'Configured' : 'Missing'}`);
      }
    } catch (e) {
      console.warn('TelegramService: Could not load config from Firestore, using local fallback.');
    }
  }

  public updateConfig(token?: string, chatId?: string) {
    if (token !== undefined) this.botToken = this.sanitizeToken(token);
    if (chatId !== undefined) this.chatId = this.sanitizeChatId(chatId);
    console.log(`📱 [Telegram] Config updated. Chat: ${this.chatId ? 'Configured' : 'Missing'}, Token: ${this.botToken ? 'Configured' : 'Missing'}`);
  }

  public updateSettings(settings: any) {
    if (!settings || typeof settings !== 'object') return;
    if (settings.telegramBotToken !== undefined) this.botToken = this.sanitizeToken(settings.telegramBotToken);
    if (settings.telegramChatId !== undefined) this.chatId = this.sanitizeChatId(settings.telegramChatId);
    if (settings.alertOnNewSignal !== undefined) this.alertOnNewSignal = Boolean(settings.alertOnNewSignal);
    if (settings.alertOnTradeExecuted !== undefined) this.alertOnTradeExecuted = Boolean(settings.alertOnTradeExecuted);
    if (settings.alertOnTpHit !== undefined) this.alertOnTpHit = Boolean(settings.alertOnTpHit);
    if (settings.alertOnSlHit !== undefined) this.alertOnSlHit = Boolean(settings.alertOnSlHit);
    if (settings.alertOnTsMoved !== undefined) this.alertOnTsMoved = Boolean(settings.alertOnTsMoved);
    if (settings.alertOnDailyLossLimit !== undefined) this.alertOnDailyLossLimit = Boolean(settings.alertOnDailyLossLimit);
    if (settings.alertOnRangingDetected !== undefined) this.alertOnRangingDetected = Boolean(settings.alertOnRangingDetected);
    if (settings.alertSilentMode !== undefined) this.alertSilentMode = Boolean(settings.alertSilentMode);
    if (settings.alertFormat !== undefined) this.alertFormat = settings.alertFormat;
  }

  public isConfigured(): boolean {
    return Boolean(this.botToken && this.chatId);
  }

  /**
   * Queue-based message dispatcher:
   * 1. Guarantees >= 1100ms spacing between sends to strictly respect Telegram's rate limits (max 1 msg/sec per chat)
   * 2. Automatically handles 429 backoff
   * 3. Wrapped in try/finally so the queue processor NEVER freezes permanently on exceptions
   * 4. Automatic plain-text fallback if HTML entity parsing fails
   */
  public async sendMessage(text: string): Promise<boolean> {
    if (!this.botToken || !this.chatId) {
      await this.loadConfigFromDb();
    }

    if (!this.botToken || !this.chatId) {
      const errMsg = 'Bot token or Chat ID not configured.';
      this.lastError = errMsg;
      console.warn(`📱 [Telegram] Message skipped: ${errMsg}`);
      return false;
    }

    return new Promise<boolean>((resolve) => {
      this.messageQueue.push({ text, resolve });
      this.processQueue().catch((err) => {
        console.error('❌ [Telegram] processQueue top-level error:', err);
      });
    });
  }

  private async processQueue() {
    if (this.isProcessingQueue) return;
    this.isProcessingQueue = true;

    try {
      while (this.messageQueue.length > 0) {
        const item = this.messageQueue[0];
        let success = false;
        try {
          // Enforce >= 1100ms spacing between Telegram API requests
          const elapsed = Date.now() - this.lastSendTime;
          if (elapsed < 1100) {
            await new Promise(r => setTimeout(r, 1100 - elapsed));
          }

          success = await this.sendSingleMessage(item.text);
          this.lastSendTime = Date.now();
        } catch (err: any) {
          console.error('❌ [Telegram] Error processing message item:', err);
          this.lastError = err?.message || String(err);
          success = false;
        } finally {
          // Guaranteed shift and resolve: queue can never deadlock
          this.messageQueue.shift();
          try {
            item.resolve(success);
          } catch {}
        }
      }
    } finally {
      this.isProcessingQueue = false;
    }
  }

  private async sendSingleMessage(text: string, retryCount: number = 0): Promise<boolean> {
    const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;
    
    // Attempt 1: Send with parse_mode: 'HTML'
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: this.chatId,
          text,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
          disable_notification: this.alertSilentMode === true
        })
      });

      const resData: any = await response.json().catch(() => ({ ok: false, description: 'Non-JSON API response' }));

      if (resData.ok) {
        this.lastError = '';
        console.log(`✅ [Telegram] Alert delivered successfully to chat ${this.chatId}`);
        return true;
      }

      // Handle Rate Limit (429)
      if (resData.error_code === 429 && retryCount < 3) {
        const retryAfter = Math.min((resData.parameters?.retry_after || 2) * 1000, 10000);
        console.warn(`⏳ [Telegram] Rate limited (429). Retrying after ${retryAfter}ms (attempt ${retryCount + 1})...`);
        await new Promise(r => setTimeout(r, retryAfter));
        return this.sendSingleMessage(text, retryCount + 1);
      }

      // If HTML entity parsing failed, fallback immediately to plain text with HTML tags stripped
      const desc = resData.description || '';
      if (desc.includes("can't parse entities") || desc.includes('parse error') || desc.includes('tag')) {
        console.warn(`⚠️ [Telegram] HTML entity parse error (${desc}). Retrying with plain text...`);
        const plainText = text.replace(/<[^>]*>/g, '');
        const retryRes = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: this.chatId,
            text: plainText,
            disable_web_page_preview: true,
            disable_notification: this.alertSilentMode === true
          })
        });

        const retryData: any = await retryRes.json().catch(() => ({ ok: false, description: 'Plaintext fallback non-JSON response' }));
        if (retryData.ok) {
          this.lastError = '';
          console.log(`✅ [Telegram] Alert delivered via plain text fallback.`);
          return true;
        } else {
          this.lastError = retryData.description || desc;
        }
      } else {
        this.lastError = desc || `Telegram API Error (${resData.error_code || response.status})`;
      }

      console.error(`❌ [Telegram] API rejected message:`, resData);
      return false;
    } catch (e: any) {
      this.lastError = e?.message || 'Network dispatch exception';
      console.error('❌ [Telegram] Network dispatch exception:', e);
      return false;
    }
  }

  public async sendUrgentAlert(text: string): Promise<boolean> {
    return this.sendMessage(`🚨 <b>URGENT ALERT</b> 🚨\n\n${escapeHtml(text)}`);
  }

  public async notifyTradeOpen(pos: {
    id: string;
    symbol: string;
    direction: 'LONG' | 'SHORT';
    strategy?: string;
    market_regime?: string;
    is_auto_regime?: boolean;
    frequency_preset?: string;
    entry_price: number;
    quantity?: number;
    leverage?: number;
    allocated_balance?: number;
    sl?: number;
    tp1?: number;
    tp2?: number;
    tp3?: number;
  }, score?: number): Promise<boolean> {
    if (!this.alertOnTradeExecuted) return false;

    const isLong = pos.direction === 'LONG';
    const icon = isLong ? '🟢' : '🔴';
    const arrow = isLong ? '📈 LONG' : '📉 SHORT';

    let stratName = '📊 Composite 10-Gate';
    if (pos.strategy === 'TREND_PULLBACK') {
      stratName = '🎯 Trend Pullback (EMA Reversion)';
    } else if (pos.strategy === 'DELTA_CLIMAX') {
      stratName = '⚡ Climax Reversal';
    } else if (pos.strategy === 'VOLATILITY_COMPRESSION') {
      stratName = '💥 VCB Breakout (Squeeze)';
    } else if (pos.strategy === 'EARLY_COIL_BREAKOUT') {
      stratName = '🔥 Early Coil Breakout';
    } else if (pos.strategy === 'SMC_LIQUIDITY_SWEEP' || pos.strategy === 'SMC' || pos.strategy === 'LIQUIDITY_SWEEP_REVERSAL') {
      stratName = '💧 SMC Liquidity Sweep &amp; FVG';
    } else if (pos.strategy === 'RANGE_MEAN_REVERSION') {
      stratName = '🔄 Range Mean Reversion';
    } else if (pos.strategy === 'BINANCE_COMPOSITE') {
      stratName = '📊 Composite 10-Gate';
    } else if (pos.strategy) {
      stratName = escapeHtml(pos.strategy);
    }

    const freqBadge = pos.frequency_preset === 'HIGH' 
      ? '🚀 High Freq' 
      : pos.frequency_preset === 'LOW' 
      ? '🛡️ Low Freq (Strict)' 
      : '🎯 Medium Freq (Balanced)';
    
    const regimeLine = pos.market_regime ? `<b>Detected Regime:</b> <code>${escapeHtml(pos.market_regime)}</code>\n` : '';
    const modeBadge = pos.is_auto_regime 
      ? `<b>Selection Mode:</b> <code>🤖 Auto Regime-Adaptive (Best EV)</code>\n` 
      : `<b>Selection Mode:</b> <code>Manual / Default</code>\n`;

    const allocMargin = pos.allocated_balance || 0;
    const lev = pos.leverage || 1;
    const qty = pos.quantity || 0;

    const message = this.alertFormat === 'Minimal' 
      ? `${icon} <b>TRADE OPENED: ${escapeHtml(pos.symbol)}</b>\n` +
        `<b>Action:</b> ${arrow}\n` +
        `<b>Price:</b> <code>$${formatPrice(pos.entry_price)}</code>\n` +
        `<b>Leverage:</b> <code>${lev}x</code>\n` +
        `<b>Strategy:</b> <code>${stratName}</code>`
      : `${icon} <b>24/7 BOT: TRADE OPENED</b>\n\n` +
        `<b>Pair:</b> <code>${escapeHtml(pos.symbol)}</code>\n` +
        `<b>Action:</b> ${arrow}\n` +
        `<b>Strategy:</b> <code>${stratName}</code>\n` +
        regimeLine +
        modeBadge +
        `<b>Frequency Mode:</b> <code>${freqBadge}</code>\n` +
        `<b>Entry Price:</b> <code>$${formatPrice(pos.entry_price)}</code>\n` +
        `<b>Leverage:</b> <code>${lev}x</code>\n` +
        `<b>Allocated Margin:</b> <code>$${formatNum(allocMargin, 2)}</code>\n` +
        `<b>Position Size:</b> <code>$${formatNum(allocMargin * lev, 2)}</code> (<code>${formatNum(qty, 4)}</code>)\n` +
        (score !== undefined ? `<b>Strategy Score:</b> <code>${score}/100</code>\n` : '') +
        `----------------------------\n` +
        (pos.tp1 ? `🎯 <b>TP1:</b> <code>$${formatPrice(pos.tp1)}</code>\n` : '') +
        (pos.tp2 ? `🎯 <b>TP2:</b> <code>$${formatPrice(pos.tp2)}</code>\n` : '') +
        (pos.tp3 ? `🎯 <b>TP3:</b> <code>$${formatPrice(pos.tp3)}</code>\n` : '') +
        (pos.sl ? `🛑 <b>Stop Loss:</b> <code>$${formatPrice(pos.sl)}</code>\n\n` : '\n') +
        `⏰ <i>Time: ${new Date().toUTCString()}</i>`;

    return this.sendMessage(message);
  }

  public async notifyTradeClose(pos: {
    id: string;
    symbol: string;
    direction: 'LONG' | 'SHORT';
    strategy?: string;
    entry_price?: number;
    allocated_balance?: number;
    leverage?: number;
  }, closePrice: number, pnl: number, pctReturn: number, reason: string): Promise<boolean> {
    const isWin = pnl >= 0;
    
    // Check specific exit alert settings
    if (isWin && !this.alertOnTpHit) return false;
    if (!isWin && !this.alertOnSlHit) return false;

    const icon = isWin ? '🎯' : '🛑';
    const status = isWin ? 'PROFIT' : 'STOPPED';

    let stratName = '📊 Composite 10-Gate';
    if (pos.strategy === 'TREND_PULLBACK') {
      stratName = '🎯 Trend Pullback';
    } else if (pos.strategy === 'DELTA_CLIMAX') {
      stratName = '⚡ Climax Reversal';
    } else if (pos.strategy === 'VOLATILITY_COMPRESSION') {
      stratName = '💥 VCB Breakout';
    } else if (pos.strategy === 'EARLY_COIL_BREAKOUT') {
      stratName = '🔥 Early Coil Breakout';
    } else if (pos.strategy === 'SMC_LIQUIDITY_SWEEP' || pos.strategy === 'SMC' || pos.strategy === 'LIQUIDITY_SWEEP_REVERSAL') {
      stratName = '💧 SMC Liquidity Sweep';
    } else if (pos.strategy === 'RANGE_MEAN_REVERSION') {
      stratName = '🔄 Range Mean Reversion';
    } else if (pos.strategy === 'BINANCE_COMPOSITE') {
      stratName = '📊 Composite 10-Gate';
    } else if (pos.strategy) {
      stratName = escapeHtml(pos.strategy);
    }

    const cleanReason = escapeHtml((reason || 'Closed').replace(/[[\]]/g, ''));
    const message = this.alertFormat === 'Minimal'
      ? `${icon} <b>TRADE CLOSED: ${escapeHtml(pos.symbol)}</b>\n` +
        `<b>Status:</b> ${status} (${cleanReason})\n` +
        `<b>Net PnL:</b> <code>${pnl >= 0 ? '+' : ''}$${formatNum(pnl, 2)}</code> (<code>${pctReturn >= 0 ? '+' : ''}${formatNum(pctReturn, 2)}%</code>)`
      : `${icon} <b>24/7 BOT: TRADE CLOSED (${cleanReason})</b>\n\n` +
        `<b>Pair:</b> <code>${escapeHtml(pos.symbol)}</code> (${escapeHtml(pos.direction)})\n` +
        `<b>Strategy:</b> <code>${stratName}</code>\n` +
        `<b>Status:</b> <b>${status}</b>\n` +
        `<b>Entry Price:</b> <code>$${formatPrice(pos.entry_price)}</code>\n` +
        `<b>Exit Price:</b> <code>$${formatPrice(closePrice)}</code>\n` +
        `<b>Net PnL:</b> <code>${pnl >= 0 ? '+' : ''}$${formatNum(pnl, 2)}</code> (<code>${pctReturn >= 0 ? '+' : ''}${formatNum(pctReturn, 2)}%</code>)\n` +
        `<b>Exit Reason:</b> <code>${cleanReason}</code>\n\n` +
        `⏰ <i>Time: ${new Date().toUTCString()}</i>`;

    return this.sendMessage(message);
  }

  public async notifyPartialTp(pos: {
    id: string;
    symbol: string;
    direction: 'LONG' | 'SHORT';
    entry_price?: number;
    allocated_balance?: number;
    sl?: number;
  }, closePrice: number, pnl: number, pctReturn: number, closedQty: number, remainingQty: number): Promise<boolean> {
    if (!this.alertOnTpHit) return false;

    const message = this.alertFormat === 'Minimal'
      ? `🎯 <b>PARTIAL TP: ${escapeHtml(pos.symbol)}</b>\n` +
        `<b>Secured:</b> <code>+$${formatNum(pnl, 2)}</code> (<code>+${formatNum(pctReturn, 2)}%</code>)\n` +
        `<b>New SL:</b> <code>$${formatPrice(pos.sl)}</code>`
      : `🎯 <b>24/7 BOT: TAKE PROFIT PARTIAL HIT</b>\n\n` +
        `<b>Pair:</b> <code>${escapeHtml(pos.symbol)}</code> (${escapeHtml(pos.direction)})\n` +
        `<b>Action:</b> Banked partial profit, Stop moved toward Breakeven\n` +
        `<b>Entry Price:</b> <code>$${formatPrice(pos.entry_price)}</code>\n` +
        `<b>Exit Price:</b> <code>$${formatPrice(closePrice)}</code>\n` +
        `<b>Secured PnL:</b> <code>+$${formatNum(pnl, 2)}</code> (<code>+${formatNum(pctReturn, 2)}%</code>)\n` +
        `<b>Closed Contracts:</b> <code>${formatNum(closedQty, 4)}</code> | <b>Remaining:</b> <code>${formatNum(remainingQty, 4)}</code>\n` +
        `<b>New Stop (Chandelier / BE):</b> <code>$${formatPrice(pos.sl)}</code>\n\n` +
        `⏰ <i>Time: ${new Date().toUTCString()}</i>`;

    return this.sendMessage(message);
  }

  public async notifyTrailingStop(pos: {
    id: string;
    symbol: string;
    direction: 'LONG' | 'SHORT';
    entry_price?: number;
  }, oldSl: number, newSl: number, currentPrice: number): Promise<boolean> {
    if (!this.alertOnTsMoved) return false;

    const isLong = pos.direction === 'LONG';
    const isLockedProfit = isLong ? (newSl > (pos.entry_price || 0)) : (newSl < (pos.entry_price || 999999));
    const badge = isLockedProfit ? '🔒 PROFIT LOCKED' : '🛡️ BREAKEVEN PROTECTED';

    const message = this.alertFormat === 'Minimal'
      ? `🛡️ <b>TRAILING STOP MOVED: ${escapeHtml(pos.symbol)}</b>\n` +
        `<b>Old SL:</b> <code>$${formatPrice(oldSl)}</code> ➔ <b>New SL:</b> <code>$${formatPrice(newSl)}</code>`
      : `🛡️ <b>24/7 BOT: TRAILING STOP UPDATED</b>\n\n` +
        `<b>Pair:</b> <code>${escapeHtml(pos.symbol)}</code> (${escapeHtml(pos.direction)})\n` +
        `<b>Status:</b> <b>${badge}</b>\n` +
        `<b>Old Stop-Loss:</b> <code>$${formatPrice(oldSl)}</code>\n` +
        `<b>New Trailing Stop:</b> <code>$${formatPrice(newSl)}</code>\n` +
        `<b>Current Price:</b> <code>$${formatPrice(currentPrice)}</code>\n` +
        (pos.entry_price ? `<b>Entry Price:</b> <code>$${formatPrice(pos.entry_price)}</code>\n\n` : '\n') +
        `⏰ <i>Time: ${new Date().toUTCString()}</i>`;

    return this.sendMessage(message);
  }

  public async notifyDailyLossLimit(currentDailyLossPct: number, dailyLossLimitPct: number): Promise<boolean> {
    if (!this.alertOnDailyLossLimit) return false;

    const message = `🚨 <b>RISK ALERT: DAILY LOSS LIMIT REACHED</b> 🚨\n\n` +
      `<b>Current Daily Drawdown:</b> <code>${formatNum(currentDailyLossPct, 2)}%</code>\n` +
      `<b>Configured Daily Limit:</b> <code>${formatNum(dailyLossLimitPct, 2)}%</code>\n\n` +
      `🛡️ <b>Action:</b> New position entries have been automatically halted to protect trading capital.\n` +
      `Trading will resume after the 00:00 UTC daily risk reset.\n\n` +
      `⏰ <i>Time: ${new Date().toUTCString()}</i>`;

    return this.sendMessage(message);
  }

  public async notifyRangingMarket(symbol: string, regime: string, reason?: string): Promise<boolean> {
    if (!this.alertOnRangingDetected) return false;

    const message = `⚠️ <b>REGIME ADVISORY: RANGING / CHOPPY MARKET</b>\n\n` +
      `<b>Symbol:</b> <code>${escapeHtml(symbol)}</code>\n` +
      `<b>Regime:</b> <code>${escapeHtml(regime)}</code>\n` +
      (reason ? `<b>Details:</b> <code>${escapeHtml(reason)}</code>\n\n` : '\n') +
      `ℹ️ Breakout strategies automatically filtered to avoid chop.\n\n` +
      `⏰ <i>Time: ${new Date().toUTCString()}</i>`;

    return this.sendMessage(message);
  }

  public async notifySignal(signal: {
    symbol: string;
    direction: 'LONG' | 'SHORT';
    strategy: string;
    score: number;
    price: number;
    sl?: number;
    tp1?: number;
    tp2?: number;
    tp3?: number;
    reason?: string;
  }): Promise<boolean> {
    if (!this.alertOnNewSignal) return false;

    const isLong = signal.direction === 'LONG';
    const icon = isLong ? '🟢' : '🔴';
    const arrow = isLong ? '📈 LONG' : '📉 SHORT';

    const message = this.alertFormat === 'Minimal'
      ? `📡 <b>NEW SIGNAL: ${escapeHtml(signal.symbol)}</b>\n` +
        `<b>Action:</b> ${arrow} | <b>Score:</b> <code>${signal.score}/100</code>\n` +
        `<b>Price:</b> <code>$${formatPrice(signal.price)}</code>`
      : `📡 <b>24/7 BOT: HIGH-SCORE SIGNAL DETECTED</b>\n\n` +
        `<b>Pair:</b> <code>${escapeHtml(signal.symbol)}</code>\n` +
        `<b>Action:</b> ${arrow}\n` +
        `<b>Strategy:</b> <code>${escapeHtml(signal.strategy)}</code>\n` +
        `<b>Signal Score:</b> <code>${signal.score}/100</code>\n` +
        `<b>Price:</b> <code>$${formatPrice(signal.price)}</code>\n` +
        (signal.sl ? `<b>Stop Loss:</b> <code>$${formatPrice(signal.sl)}</code>\n` : '') +
        (signal.tp1 ? `<b>Target 1:</b> <code>$${formatPrice(signal.tp1)}</code>\n` : '') +
        (signal.tp2 ? `<b>Target 2:</b> <code>$${formatPrice(signal.tp2)}</code>\n` : '') +
        (signal.reason ? `<b>Reason:</b> <code>${escapeHtml(signal.reason)}</code>\n\n` : '\n') +
        `⏰ <i>Time: ${new Date().toUTCString()}</i>`;

    return this.sendMessage(message);
  }
}

export const telegramService = new TelegramService();
