import WebSocket from 'ws';

export type UserStreamStatus = 'CONNECTED' | 'STALE' | 'DISCONNECTED';

export class UserDataStreamService {
  private ws: WebSocket | null = null;
  private listenKey: string | null = null;
  private keepAliveTimer: NodeJS.Timeout | null = null;
  private isLive = false;
  private status: UserStreamStatus = 'CONNECTED';
  private details = 'Paper Mode: Internal OMS position & balance stream active';
  private lastMessageTime = Date.now();
  private isTestnet = false;
  private apiKey: string = '';

  constructor() {
    // Default to paper mode (internal OMS stream)
    this.status = 'CONNECTED';
  }

  public setMode(isLive: boolean, apiKey?: string, isTestnet: boolean = false) {
    this.isLive = isLive;
    this.apiKey = apiKey || '';
    this.isTestnet = isTestnet;

    if (!isLive) {
      this.disconnectWs();
      this.status = 'CONNECTED';
      this.details = 'Paper Mode: Internal OMS position & balance stream active';
      return;
    }

    if (!this.apiKey) {
      this.disconnectWs();
      this.status = 'DISCONNECTED';
      this.details = 'Live Trading: Missing Binance API credentials';
      return;
    }

    // Connect live Binance user stream
    this.connectLiveStream();
  }

  private async connectLiveStream() {
    this.disconnectWs();
    this.status = 'DISCONNECTED';
    this.details = 'Connecting to Binance Futures user data stream...';

    try {
      const baseUrl = this.isTestnet ? 'https://testnet.binancefuture.com' : 'https://fapi.binance.com';
      const res = await fetch(`${baseUrl}/fapi/v1/listenKey`, {
        method: 'POST',
        headers: {
          'X-MBX-APIKEY': this.apiKey
        }
      });

      if (!res.ok) {
        const errText = await res.text();
        console.warn(`[UserDataStream] Failed to obtain listenKey: ${res.status} ${errText}`);
        this.status = 'DISCONNECTED';
        this.details = `Binance API error (${res.status}): Unable to open User Data Stream`;
        return;
      }

      const data = await res.json() as { listenKey?: string };
      if (!data.listenKey) {
        this.status = 'DISCONNECTED';
        this.details = 'Invalid listenKey response from Binance';
        return;
      }

      this.listenKey = data.listenKey;
      const wsUrl = this.isTestnet
        ? `wss://stream.binancefuture.com/ws/${this.listenKey}`
        : `wss://fstream.binance.com/ws/${this.listenKey}`;

      this.ws = new WebSocket(wsUrl);

      this.ws.on('open', () => {
        console.log('📡 [UserDataStream] Connected to Binance Futures User Data Stream.');
        this.status = 'CONNECTED';
        this.details = 'Live Binance Futures WebSocket user data stream active';
        this.lastMessageTime = Date.now();
        this.startKeepAlive(baseUrl);
      });

      this.ws.on('message', (msgData: WebSocket.Data) => {
        this.lastMessageTime = Date.now();
        try {
          const parsed = JSON.parse(msgData.toString());
          if (parsed.e === 'ACCOUNT_UPDATE' || parsed.e === 'ORDER_TRADE_UPDATE') {
            console.log(`📡 [UserDataStream] Event: ${parsed.e}`);
          }
        } catch (_) {}
      });

      this.ws.on('ping', () => {
        if (this.ws) this.ws.pong();
        this.lastMessageTime = Date.now();
      });

      this.ws.on('error', (err) => {
        console.warn('[UserDataStream] WebSocket error:', err.message);
      });

      this.ws.on('close', () => {
        console.log('[UserDataStream] Connection closed.');
        if (this.isLive && this.apiKey) {
          this.status = 'DISCONNECTED';
          this.details = 'Reconnecting to Binance Futures user data stream...';
          setTimeout(() => this.connectLiveStream(), 5000);
        }
      });
    } catch (e: any) {
      console.warn('[UserDataStream] Error connecting:', e.message);
      this.status = 'DISCONNECTED';
      this.details = `Connection failed: ${e.message}`;
    }
  }

  private startKeepAlive(baseUrl: string) {
    if (this.keepAliveTimer) clearInterval(this.keepAliveTimer);
    // Ping listenKey every 25 minutes
    this.keepAliveTimer = setInterval(async () => {
      if (!this.listenKey || !this.apiKey) return;
      try {
        await fetch(`${baseUrl}/fapi/v1/listenKey`, {
          method: 'PUT',
          headers: { 'X-MBX-APIKEY': this.apiKey }
        });
      } catch (e) {
        console.warn('[UserDataStream] Failed to keepalive listenKey:', e);
      }
    }, 25 * 60 * 1000);
  }

  private disconnectWs() {
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
    if (this.ws) {
      this.ws.removeAllListeners();
      try { this.ws.terminate(); } catch (_) {}
      this.ws = null;
    }
    this.listenKey = null;
  }

  public getStatus(): UserStreamStatus {
    return this.status;
  }

  public getDetails(): string {
    return this.details;
  }

  public isConnected(): boolean {
    return this.status === 'CONNECTED';
  }

  public isStale(): boolean {
    return this.isLive && (Date.now() - this.lastMessageTime > 60000);
  }
}

export const userDataStreamService = new UserDataStreamService();
