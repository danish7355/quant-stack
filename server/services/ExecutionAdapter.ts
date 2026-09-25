import ccxt from 'ccxt';

export class ExecutionAdapter {
  private exchange: any;
  private isLive = false;
  private liveModeUnlocked = false;
  private exchangeInfoCache: Record<string, any> = {};

  constructor() {
    this.exchange = new ccxt.binance({
      enableRateLimit: true,
      options: { defaultType: 'future' }
    });
    try {
      this.exchange.setSandboxMode(true);
    } catch (e) {}
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
      try {
        this.exchange.setSandboxMode(false);
      } catch (e) {}
      this.loadExchangeInfo();
      console.warn("ExecutionAdapter: 🚨 LIVE MODE ENABLED 🚨");
      return true;
    } else {
      this.isLive = false;
      this.liveModeUnlocked = false;
      this.exchange.apiKey = '';
      this.exchange.secret = '';
      try {
        this.exchange.setSandboxMode(true);
      } catch (e) {}
      return true;
    }
  }

  public async loadExchangeInfo() {
    try {
      await this.exchange.loadMarkets();
      this.exchangeInfoCache = this.exchange.markets;
    } catch (e) {
      console.error("ExecutionAdapter: Failed to load exchange info", e);
    }
  }

  public formatPrice(symbol: string, price: number): number {
    return this.exchangeInfoCache[symbol] ? parseFloat(this.exchange.priceToPrecision(symbol, price)) : price;
  }

  public formatQuantity(symbol: string, quantity: number): number {
    return this.exchangeInfoCache[symbol] ? parseFloat(this.exchange.amountToPrecision(symbol, quantity)) : quantity;
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

  public async checkOrderStatusByClientOrderId(symbol: string, clientOrderId: string): Promise<any> {
    if (!this.isLive) return { status: 'closed', filled: 1 };
    try {
      // In CCXT Binance Futures, you can fetch an order using the generated clientOrderId by passing origClientOrderId in params
      return await this.exchange.fetchOrder(clientOrderId, symbol, { origClientOrderId: clientOrderId });
    } catch (e: any) {
      if (e.message.includes('Order does not exist')) {
        return null;
      }
      throw e;
    }
  }

  public async createMarketOrder(symbol: string, side: 'buy' | 'sell', amount: number, leverage: number = 1, clientOrderId?: string) {
    if (!this.isLive) {
      return { id: clientOrderId || ('paper-' + Math.random().toString(36).substring(7)), status: 'closed', filled: amount };
    }

    try {
      // Set leverage on Binance
      try {
        await this.exchange.setLeverage(leverage, symbol);
      } catch (e) {
        console.warn(`Could not set leverage for ${symbol}:`, e);
      }
      
      // Ensure market is loaded to format precision
      if (!this.exchangeInfoCache[symbol]) {
        await this.loadExchangeInfo();
      }
      
      // Format amount to exchange allowed precision
      const formattedAmount = this.formatQuantity(symbol, amount);
      
      const params: any = {};
      if (clientOrderId) {
        params.newClientOrderId = clientOrderId;
      }
      
      return await this.exchange.createOrder(symbol, 'market', side, formattedAmount, undefined, params);
    } catch (e) {
      console.error(`ExecutionAdapter: Failed to execute live ${side} order on ${symbol}:`, e);
      throw e;
    }
  }

  public async createStopMarketOrder(symbol: string, side: 'buy' | 'sell', amount: number, stopPrice: number, clientOrderId?: string) {
    if (!this.isLive) {
      return { id: clientOrderId || ('paper-sl-' + Math.random().toString(36).substring(7)), status: 'open' };
    }
    
    try {
      if (!this.exchangeInfoCache[symbol]) {
        await this.loadExchangeInfo();
      }
      
      const formattedAmount = this.formatQuantity(symbol, amount);
      const formattedPrice = this.formatPrice(symbol, stopPrice);
      
      const params: any = { stopPrice: formattedPrice, reduceOnly: true };
      if (clientOrderId) {
        params.newClientOrderId = clientOrderId;
      }
      
      return await this.exchange.createOrder(symbol, 'stop_market', side, formattedAmount, undefined, params);
    } catch (e) {
      console.error(`ExecutionAdapter: Failed to place Stop Market on ${symbol}:`, e);
      throw e;
    }
  }

  public async createTakeProfitMarketOrder(symbol: string, side: 'buy' | 'sell', amount: number, stopPrice: number, clientOrderId?: string) {
    if (!this.isLive) {
      return { id: clientOrderId || ('paper-tp-' + Math.random().toString(36).substring(7)), status: 'open' };
    }
    
    try {
      if (!this.exchangeInfoCache[symbol]) {
        await this.loadExchangeInfo();
      }
      
      const formattedAmount = this.formatQuantity(symbol, amount);
      const formattedPrice = this.formatPrice(symbol, stopPrice);
      
      const params: any = { stopPrice: formattedPrice, reduceOnly: true };
      if (clientOrderId) {
        params.newClientOrderId = clientOrderId;
      }
      
      return await this.exchange.createOrder(symbol, 'take_profit_market', side, formattedAmount, undefined, params);
    } catch (e) {
      console.error(`ExecutionAdapter: Failed to place Take Profit Market on ${symbol}:`, e);
      throw e;
    }
  }

  public async closeMarketPosition(symbol: string, side: 'buy' | 'sell', amount: number, clientOrderId?: string) {
    if (!this.isLive) {
      return { status: 'closed' };
    }

    try {
      if (!this.exchangeInfoCache[symbol]) {
        await this.loadExchangeInfo();
      }
      const formattedAmount = this.formatQuantity(symbol, amount);
      
      const params: any = { reduceOnly: true };
      if (clientOrderId) {
        params.newClientOrderId = clientOrderId;
      }

      return await this.exchange.createOrder(symbol, 'market', side, formattedAmount, undefined, params);
    } catch (e) {
      console.error(`ExecutionAdapter: Failed to close live position on ${symbol}:`, e);
      throw e;
    }
  }

  // C5 support: Cancel all open conditional orders (stop-loss, take-profit) for a symbol
  public async cancelAllOpenOrders(symbol: string) {
    if (!this.isLive) return;
    try {
      await this.exchange.cancelAllOrders(symbol);
    } catch (e: any) {
      // Silently handle 'no open orders' — not an error
      if (e.message && (e.message.includes('Unknown order') || e.message.includes('No open orders'))) return;
      console.warn(`ExecutionAdapter: cancelAllOpenOrders for ${symbol}:`, e);
    }
  }

  // C4 support: Replace a stop-loss order with a new one at a different price
  public async replaceStopOrder(symbol: string, side: 'buy' | 'sell', quantity: number, newStopPrice: number, newClientOrderId?: string) {
    if (!this.isLive) return;
    try {
      // Cancel all existing stop orders for this symbol first
      await this.cancelAllOpenOrders(symbol);
      // Place new stop at updated price
      return await this.createStopMarketOrder(symbol, side, quantity, newStopPrice, newClientOrderId);
    } catch (e) {
      console.error(`ExecutionAdapter: Failed to replace stop order on ${symbol}:`, e);
      throw e;
    }
  }

  public getIsLive(): boolean {
    return this.isLive;
  }

  public getExchangeInstance(): any {
    return this.exchange;
  }
}

export const executionAdapter = new ExecutionAdapter();
