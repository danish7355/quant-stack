import WebSocket from 'ws';

export type PriceUpdateListener = (prices: Map<string, number>, batch: Array<{ s: string; p: number }>) => void;

export class PriceStream {
  private futuresWs: WebSocket | null = null;
  private spotWs: WebSocket | null = null;
  private prices = new Map<string, number>();
  private priceArray: Array<{ s: string; p: number }> = [];
  private listeners = new Set<PriceUpdateListener>();
  private isRunning = false;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private fallbackInterval: NodeJS.Timeout | null = null;
  private lastWsMessageTime = 0;
  private lastRestMessageTime = 0;
  private isRestPollingActive = false;
  private rateLimitBackoffUntil = 0;
  
  public isStale = false;

  constructor() {
    this.start();
  }

  public start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.connectStreams();
    this.startHealthCheck();
  }

  private connectStreams() {
    this.connectFuturesWs();
    this.connectSpotWs();
  }

  /**
   * Primary: Binance Futures perpetual miniTicker stream
   */
  private connectFuturesWs() {
    try {
      if (this.futuresWs) {
        this.futuresWs.removeAllListeners();
        this.futuresWs.on('error', () => {});
        try { this.futuresWs.terminate(); } catch (e) {}
        this.futuresWs = null;
      }

      this.futuresWs = new WebSocket('wss://fstream.binance.com/ws/!miniTicker@arr');

      this.futuresWs.on('open', () => {
        console.log('📡 [PriceStream] Binance Futures stream connected.');
        this.lastWsMessageTime = Date.now();
        this.isStale = false;
      });

      this.futuresWs.on('ping', () => {
        if (this.futuresWs) this.futuresWs.pong();
        this.lastWsMessageTime = Date.now();
      });

      this.futuresWs.on('message', (data: WebSocket.Data) => {
        this.processTickerArray(data);
      });

      this.futuresWs.on('error', (err) => {
        // Silently handled; spotWs provides instant seamless redundancy
      });

      this.futuresWs.on('close', () => {
        this.futuresWs = null;
        this.scheduleReconnect();
      });
    } catch (e) {
      this.scheduleReconnect();
    }
  }

  /**
   * Redundant High-Availability: Binance Spot miniTicker stream
   * Unrestricted globally, low latency, 1-second continuous broadcast
   */
  private connectSpotWs() {
    try {
      if (this.spotWs) {
        this.spotWs.removeAllListeners();
        this.spotWs.on('error', () => {});
        try { this.spotWs.terminate(); } catch (e) {}
        this.spotWs = null;
      }

      this.spotWs = new WebSocket('wss://stream.binance.com:9443/ws/!miniTicker@arr');

      this.spotWs.on('open', () => {
        console.log('⚡ [PriceStream] Binance Spot HA redundancy stream connected.');
        this.lastWsMessageTime = Date.now();
        this.isStale = false;
      });

      this.spotWs.on('ping', () => {
        if (this.spotWs) this.spotWs.pong();
        this.lastWsMessageTime = Date.now();
      });

      this.spotWs.on('message', (data: WebSocket.Data) => {
        this.processTickerArray(data);
      });

      this.spotWs.on('error', () => {});

      this.spotWs.on('close', () => {
        this.spotWs = null;
        setTimeout(() => {
          if (this.isRunning && !this.spotWs) this.connectSpotWs();
        }, 5000);
      });
    } catch (e) {
      setTimeout(() => {
        if (this.isRunning && !this.spotWs) this.connectSpotWs();
      }, 5000);
    }
  }

  private processTickerArray(data: WebSocket.Data) {
    try {
      const parsed = JSON.parse(data.toString());
      if (Array.isArray(parsed)) {
        this.lastWsMessageTime = Date.now();
        this.isStale = false;
        const batch: Array<{ s: string; p: number }> = [];

        for (const item of parsed) {
          if (item.s && (item.c || item.p)) {
            const p = parseFloat(item.c || item.p);
            if (!isNaN(p) && p > 0) {
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
    } catch (err) {}
  }

  private scheduleReconnect() {
    if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
    this.reconnectTimeout = setTimeout(() => {
      if (this.isRunning && !this.futuresWs) this.connectFuturesWs();
    }, 5000);
  }

  /**
   * Health check and multi-source resilient REST fallback
   */
  private startHealthCheck() {
    if (this.fallbackInterval) clearInterval(this.fallbackInterval);

    this.fallbackInterval = setInterval(async () => {
      const now = Date.now();
      const timeSinceWs = now - this.lastWsMessageTime;
      const timeSinceRest = now - this.lastRestMessageTime;

      // Resilient Stale Condition: Only declare stale if BOTH WebSockets and REST have been silent for > 20s
      if (timeSinceWs > 20000 && timeSinceRest > 20000) {
        if (!this.isStale) {
          console.warn(`🚨 [PriceStream] Market data paused (silent > 20s). Triggering multi-source recovery.`);
        }
        this.isStale = true;
      } else {
        this.isStale = false;
      }

      // Reconnect WebSockets if silent for > 25s
      if (timeSinceWs > 25000) {
        console.log('🔄 [PriceStream] Reconnecting dual WebSocket streams...');
        this.lastWsMessageTime = now;
        this.connectStreams();
      }

      // If WebSockets have been quiet for > 8s, trigger fallback REST poll (with rate-limit backoff)
      if (timeSinceWs > 8000 && timeSinceRest > 6000 && !this.isRestPollingActive && now > this.rateLimitBackoffUntil) {
        this.isRestPollingActive = true;
        try {
          await this.executeMultiSourcePoll();
        } finally {
          this.isRestPollingActive = false;
        }
      }
    }, 3000);
  }

  /**
   * Multi-Source REST Poll: Uses low-weight Spot API, Bybit, or CoinDCX to avoid 429 IP bans
   */
  private async executeMultiSourcePoll() {
    const endpoints = [
      // 1. Binance Spot Tickers (Weight = 2, much lighter than futures weight 40)
      {
        url: 'https://api.binance.com/api/v3/ticker/price',
        extract: (d: any) => d.map((x: any) => ({ s: x.symbol, p: parseFloat(x.price) }))
      },
      // 2. Binance API3 Mirror
      {
        url: 'https://api3.binance.com/api/v3/ticker/price',
        extract: (d: any) => d.map((x: any) => ({ s: x.symbol, p: parseFloat(x.price) }))
      },
      // 3. Bybit Perpetual Tickers
      {
        url: 'https://api.bybit.com/v5/market/tickers?category=linear',
        extract: (d: any) => (d.result?.list || []).map((x: any) => ({ s: x.symbol, p: parseFloat(x.lastPrice) }))
      },
      // 4. CoinDCX Ticker API
      {
        url: 'https://api.coindcx.com/exchange/ticker',
        extract: (d: any) => d.map((x: any) => ({ s: x.market, p: parseFloat(x.last_price) }))
      }
    ];

    for (const ep of endpoints) {
      try {
        const res = await fetch(ep.url, { signal: AbortSignal.timeout(3500) });
        if (res.status === 429 || res.status === 418) {
          this.rateLimitBackoffUntil = Date.now() + 30000;
          continue;
        }

        if (res.ok) {
          const raw = await res.json();
          const batch = ep.extract(raw).filter((x: any) => x.s && !isNaN(x.p) && x.p > 0);
          if (batch.length > 0) {
            for (const item of batch) {
              this.prices.set(item.s, item.p);
            }
            this.priceArray = batch;
            this.lastRestMessageTime = Date.now();
            this.isStale = false;
            this.notifyListeners(batch);
            return;
          }
        }
      } catch (e) {
        // Try next fallback endpoint
      }
    }
  }

  private notifyListeners(batch: Array<{ s: string; p: number }>) {
    for (const listener of this.listeners) {
      try {
        listener(this.prices, batch);
      } catch (err) {
        console.error('Price update listener error:', err);
      }
    }
  }

  public subscribe(listener: PriceUpdateListener) {
    this.listeners.add(listener);
    if (this.priceArray.length > 0) {
      try {
        listener(this.prices, this.priceArray);
      } catch (e) {}
    }
    return () => this.listeners.delete(listener);
  }

  public getPrice(symbol: string): number | undefined {
    return this.prices.get(symbol);
  }

  public getAllPrices(): Array<{ s: string; p: number }> {
    return this.priceArray;
  }
}

export const priceStream = new PriceStream();
