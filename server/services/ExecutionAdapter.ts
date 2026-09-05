import ccxt from 'ccxt';

export class ExecutionAdapter {
  private exchange: any;
  private isLive = false;
  private liveModeUnlocked = false;

  constructor() {
    this.exchange = new ccxt.binance({
      enableRateLimit: true,
      options: { defaultType: 'future' }
    });
    this.exchange.setSandboxMode(true);
  }

  // Phase 2 Requirement: Double confirmation flow to enable live mode
  public unlockLiveMode(confirmationPhrase: string): boolean {
    if (confirmationPhrase === 'I_ACKNOWLEDGE_RISK_AND_ENABLE_LIVE_TRADING') {
      this.liveModeUnlocked = true;
      return true;
    }
    return false;
  }

  public setMode(live: boolean, apiKey?: string, secret?: string): boolean {
    if (live) {
      if (!this.liveModeUnlocked) {
        console.warn("ExecutionAdapter: Attempted to enable LIVE MODE without double-confirmation unlock. BLOCKED.");
        return false;
      }
      this.isLive = true;
      this.exchange.apiKey = apiKey || '';
      this.exchange.secret = secret || '';
      this.exchange.setSandboxMode(false);
      console.warn("ExecutionAdapter: 🚨 LIVE MODE ENABLED 🚨");
      return true;
    } else {
      this.isLive = false;
      this.liveModeUnlocked = false;
      this.exchange.apiKey = '';
      this.exchange.secret = '';
      this.exchange.setSandboxMode(true);
      return true;
    }
  }

  public async getActivePerpetualSymbols(): Promise<string[]> {
    try {
      await this.exchange.loadMarkets();
      const symbols = [];
      for (const [symbol, market] of Object.entries(this.exchange.markets)) {
        const m = market as any;
        // Verify it is a swap/perpetual and active
        if (m.swap && m.active !== false && m.quote === 'USDT') {
          symbols.push(m.id);
        }
      }
      return symbols;
    } catch (e) {
      console.error(`Error loading perpetual markets:`, e);
      return [];
    }
  }

  public async getTicker(symbol: string) {
    try {
      return await this.exchange.fetchTicker(symbol);
    } catch (e) {
      console.error(`Error fetching ticker for ${symbol}:`, e);
      return null;
    }
  }

  public async fetchOHLCV(symbol: string, timeframe: string, limit = 500) {
    try {
      return await this.exchange.fetchOHLCV(symbol, timeframe, undefined, limit);
    } catch (e) {
      console.error(`Error fetching OHLCV for ${symbol}:`, e);
      return [];
    }
  }

  public async createMarketOrder(symbol: string, side: 'buy' | 'sell', amount: number, leverage: number = 1) {
    if (!this.isLive) {
      return { id: 'paper-' + Math.random().toString(36).substring(7), status: 'closed', filled: amount };
    }
    try {
      // Set leverage on Binance
      try {
        await this.exchange.setLeverage(leverage, symbol);
      } catch (e) {
        console.warn(`Could not set leverage for ${symbol}:`, e);
      }
      
      // Ensure market is loaded to format precision
      if (!this.exchange.markets || !this.exchange.markets[symbol]) {
        await this.exchange.loadMarkets();
      }
      
      // Format amount to exchange allowed precision
      const formattedAmountStr = this.exchange.amountToPrecision(symbol, amount);
      const formattedAmount = parseFloat(formattedAmountStr);
      
      return await this.exchange.createOrder(symbol, 'market', side, formattedAmount);
    } catch (e) {
      console.error(`ExecutionAdapter: Failed to execute live ${side} order on ${symbol}:`, e);
      throw e;
    }
  }

  public async closeMarketPosition(symbol: string, side: 'buy' | 'sell', amount: number) {
    if (!this.isLive) {
      return { status: 'closed' };
    }
    try {
      if (!this.exchange.markets || !this.exchange.markets[symbol]) {
        await this.exchange.loadMarkets();
      }
      const formattedAmountStr = this.exchange.amountToPrecision(symbol, amount);
      const formattedAmount = parseFloat(formattedAmountStr);

      return await this.exchange.createOrder(symbol, 'market', side, formattedAmount, undefined, {
        reduceOnly: true
      });
    } catch (e) {
      console.error(`ExecutionAdapter: Failed to close live position on ${symbol}:`, e);
      throw e;
    }
  }

  public getIsLive(): boolean {
    return this.isLive;
  }
}

export const executionAdapter = new ExecutionAdapter();
