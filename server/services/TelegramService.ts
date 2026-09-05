import { db } from '../firebase.js';
import { doc, getDoc, setDoc } from 'firebase/firestore';

export class TelegramService {
  private botToken: string = process.env.TELEGRAM_BOT_TOKEN || '';
  private chatId: string = process.env.TELEGRAM_CHAT_ID || '';

  constructor() {
    this.loadConfigFromDb();
  }

  public async loadConfigFromDb() {
    try {
      const docSnap = await getDoc(doc(db, 'settings', 'bot_config'));
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.telegramBotToken) this.botToken = data.telegramBotToken;
        if (data.telegramChatId) this.chatId = data.telegramChatId;
      }
    } catch (e) {
      console.warn('TelegramService: Could not load config from Firestore yet.');
    }
  }

  public updateConfig(token?: string, chatId?: string) {
    if (token !== undefined) this.botToken = token;
    if (chatId !== undefined) this.chatId = chatId;
  }

  public isConfigured(): boolean {
    return Boolean(this.botToken && this.chatId);
  }

  public async sendMessage(text: string): Promise<boolean> {
    if (!this.botToken || !this.chatId) {
      return false;
    }
    try {
      const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: this.chatId,
          text,
          parse_mode: 'Markdown',
          disable_web_page_preview: true
        })
      });
      const resData: any = await response.json();
      return Boolean(resData.ok);
    } catch (e) {
      console.error('TelegramService: Failed to send Telegram alert:', e);
      return false;
    }
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
    quantity: number;
    leverage: number;
    allocated_balance: number;
    sl: number;
    tp1: number;
    tp2: number;
    tp3: number;
  }, score?: number) {
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
    } else if (pos.strategy === 'SMC_LIQUIDITY_SWEEP' || pos.strategy === 'SMC') {
      stratName = '💧 SMC Liquidity Sweep & FVG';
    } else if (pos.strategy === 'BINANCE_COMPOSITE') {
      stratName = '📊 Composite 10-Gate';
    } else if (pos.strategy) {
      stratName = pos.strategy;
    }

    const freqBadge = pos.frequency_preset === 'HIGH' 
      ? '🚀 High Freq' 
      : pos.frequency_preset === 'LOW' 
      ? '🛡️ Low Freq (Strict)' 
      : '🎯 Medium Freq (Balanced)';
    
    const regimeLine = pos.market_regime ? `*Detected Regime:* \`${pos.market_regime}\`\n` : '';
    const modeBadge = pos.is_auto_regime 
      ? `*Selection Mode:* \`🤖 Auto Regime-Adaptive (Best EV)\`\n` 
      : `*Selection Mode:* \`Manual / Default\`\n`;

    const message = `${icon} *24/7 BOT: TRADE OPENED*\n\n` +
      `*Pair:* \`${pos.symbol}\`\n` +
      `*Action:* ${arrow}\n` +
      `*Strategy:* \`${stratName}\`\n` +
      regimeLine +
      modeBadge +
      `*Frequency Mode:* \`${freqBadge}\`\n` +
      `*Entry Price:* \`$${pos.entry_price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}\`\n` +
      `*Leverage:* \`${pos.leverage}x\`\n` +
      `*Allocated Margin:* \`$${pos.allocated_balance.toFixed(2)}\`\n` +
      `*Position Size:* \`$${(pos.allocated_balance * pos.leverage).toFixed(2)}\` (\`${pos.quantity.toFixed(4)}\`)\n` +
      (score ? `*Strategy Score:* \`${score}/100\`\n` : '') +
      `----------------------------\n` +
      `🎯 *TP1:* \`$${pos.tp1.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}\`\n` +
      `🎯 *TP2:* \`$${pos.tp2.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}\`\n` +
      `🎯 *TP3:* \`$${pos.tp3.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}\`\n` +
      `🛑 *Stop Loss:* \`$${pos.sl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}\`\n\n` +
      `⏰ _Time: ${new Date().toUTCString()}_`;

    return this.sendMessage(message);
  }

  public async notifyTradeClose(pos: {
    id: string;
    symbol: string;
    direction: 'LONG' | 'SHORT';
    strategy?: string;
    entry_price: number;
    allocated_balance: number;
  }, closePrice: number, pnl: number, pctReturn: number, reason: string) {
    const isWin = pnl >= 0;
    const icon = isWin ? '🎯' : '🛑';
    const status = isWin ? 'PROFIT' : 'STOPPED';

    let stratName = '📊 Composite 10-Gate';
    if (pos.strategy === 'TREND_PULLBACK') {
      stratName = '🎯 Trend Pullback';
    } else if (pos.strategy === 'DELTA_CLIMAX') {
      stratName = '⚡ Climax Reversal';
    } else if (pos.strategy === 'VOLATILITY_COMPRESSION') {
      stratName = '💥 VCB Breakout';
    } else if (pos.strategy === 'SMC_LIQUIDITY_SWEEP' || pos.strategy === 'SMC') {
      stratName = '💧 SMC Liquidity Sweep';
    } else if (pos.strategy === 'BINANCE_COMPOSITE') {
      stratName = '📊 Composite 10-Gate';
    } else if (pos.strategy) {
      stratName = pos.strategy;
    }

    const message = `${icon} *24/7 BOT: TRADE CLOSED [${reason}]*\n\n` +
      `*Pair:* \`${pos.symbol}\` (${pos.direction})\n` +
      `*Strategy:* \`${stratName}\`\n` +
      `*Status:* *${status}*\n` +
      `*Entry Price:* \`$${pos.entry_price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}\`\n` +
      `*Exit Price:* \`$${closePrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}\`\n` +
      `*Net PnL:* \`${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}\` (\`${pctReturn >= 0 ? '+' : ''}${pctReturn.toFixed(2)}%\`)\n` +
      `*Exit Reason:* \`${reason}\`\n\n` +
      `⏰ _Time: ${new Date().toUTCString()}_`;

    return this.sendMessage(message);
  }

  public async notifyPartialTp(pos: {
    id: string;
    symbol: string;
    direction: 'LONG' | 'SHORT';
    entry_price: number;
    allocated_balance: number;
    sl: number;
  }, closePrice: number, pnl: number, pctReturn: number, closedQty: number, remainingQty: number) {
    const message = `🎯 *24/7 BOT: VCB INITIAL TP HIT (25% SECURED)*\n\n` +
      `*Pair:* \`${pos.symbol}\` (${pos.direction})\n` +
      `*Action:* Banked 25% partial profit, Stop moved to Breakeven + Fee buffer\n` +
      `*Entry Price:* \`$${pos.entry_price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}\`\n` +
      `*Exit Price:* \`$${closePrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}\`\n` +
      `*Secured PnL:* \`+$${pnl.toFixed(2)}\` (\`+${pctReturn.toFixed(2)}%\`)\n` +
      `*Closed Contracts:* \`${closedQty.toFixed(4)}\` | *Remaining:* \`${remainingQty.toFixed(4)}\` (75%)\n` +
      `*New Trailing Stop (Chandelier):* \`$${pos.sl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}\`\n\n` +
      `⏰ _Time: ${new Date().toUTCString()}_`;

    return this.sendMessage(message);
  }
}

export const telegramService = new TelegramService();
