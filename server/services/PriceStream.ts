import WebSocket from 'ws';

export type PriceUpdateListener = (prices: Map<string, number>, batch: Array<{ s: string; p: number }>) => void;

export class PriceStream {
  private ws: WebSocket | null = null;
  private prices = new Map<string, number>();
  private priceArray: Array<{ s: string; p: number }> = [];
  private listeners = new Set<PriceUpdateListener>();
  private isRunning = false;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private fallbackInterval: NodeJS.Timeout | null = null;
  private lastWsMessageTime = 0;
  private lastRestMessageTime = 0;

  constructor() {
    this.start();
  }

  public start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.connectWs();
    this.startHealthCheck();
  }

  private connectWs() {
    try {
      if (this.ws) {
        this.ws.removeAllListeners(); // Prevent old close events from triggering
        this.ws.on('error', () => {}); // Catch unhandled errors during terminate
        try { this.ws.terminate(); } catch (e) {}
        this.ws = null;
      }

      // Binance Futures Mini-Ticker stream: receives all perpetual contract tickers (~1-2KB/sec)
      this.ws = new WebSocket('wss://fstream.binance.com/ws/!miniTicker@arr');

      this.ws.on('open', () => {
        console.log('📡 Binance Futures 24/7 WebSocket stream connected.');
        this.lastWsMessageTime = Date.now();
      });

      this.ws.on('ping', () => {
        if (this.ws) this.ws.pong();
        this.lastWsMessageTime = Date.now();
      });

      this.ws.on('message', (data: WebSocket.Data) => {
        try {
          this.lastWsMessageTime = Date.now();
          const parsed = JSON.parse(data.toString());
          if (Array.isArray(parsed)) {
            const batch: Array<{ s: string; p: number }> = [];
            for (const item of parsed) {
              if (item.s && item.c) { // 's' = symbol, 'c' = close/current price
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
          // ignore malformed packets
        }
      });

      this.ws.on('error', (err) => {
        console.warn('Binance WS error:', err.message);
      });

      this.ws.on('close', (code, reason) => {
        console.log(`Binance WS disconnected. Code: ${code}, Reason: ${reason}`);
        this.ws = null;
        this.scheduleReconnect();
      });
    } catch (e) {
      console.error('Failed to initiate Binance WS connection:', e);
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
    this.reconnectTimeout = setTimeout(() => {
      if (this.isRunning) this.connectWs();
    }, 3000);
  }

  private startHealthCheck() {
    // If WS has not received messages in 6s, execute fallback REST poll
    // If WS silent for > 20s, force WS reconnect
    if (this.fallbackInterval) clearInterval(this.fallbackInterval);
    this.fallbackInterval = setInterval(async () => {
      const now = Date.now();
      const timeSinceWsMessage = now - this.lastWsMessageTime;
      const timeSinceRestMessage = now - this.lastRestMessageTime;

      if (timeSinceWsMessage > 6000 && timeSinceRestMessage > 3000) {
        try {
          const res = await fetch('https://fapi.binance.com/fapi/v1/ticker/price');
          if (res.ok) {
            const data: any = await res.json();
            const batch: Array<{ s: string; p: number }> = [];
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
            await res.text().catch(() => {});
          }
        } catch (e) {
          // ignore transient network glitch
        }
      }
      
      // Trigger WS reconnection if persistently silent
      if (timeSinceWsMessage > 25000) {
        console.log('Binance WS silent for 25s, reconnecting WebSocket...');
        this.lastWsMessageTime = now;
        this.connectWs();
      }
    }, 2500);
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
    // Send current snapshot immediately
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
