import ccxt from 'ccxt';
import crypto from 'crypto';
import https from 'https';
import { priceStream } from './PriceStream.js';
import { coinDcxSimulator } from './CoinDcxSimulator.js';

export class ExecutionAdapter {
  private exchange: any;
  private isLive = false;
  private isTestnet = false;
  private apiKey = '';
  private apiSecret = '';
  private provider: 'BINANCE' | 'COINDCX' = 'BINANCE';
  private coindcxApiKey = '';
  private coindcxApiSecret = '';
  private coindcxMarginCurrency: 'INR' | 'USDT' = 'INR';
  private maxTradeMarginInr: number = 200;
  private maxRiskPerTradeInr: number = 100;
  private usdtToInrRate: number = 99.26;
  private lastRateFetchTime: number = 0;
  private liveModeUnlocked = false;
  private exchangeInfoCache: Record<string, any> = {};
  private coindcxMaxLeverageCache: Record<string, number> = {};
  private coindcxPositionsCache: { timestamp: number; positions: any[] } = { timestamp: 0, positions: [] };
  public symbolActiveLeverageCache: Record<string, number> = {};
  public symbolActiveMarginCurrencyCache: Record<string, string> = {};
  private lastLiveBalance: {
    walletBalance: number;
    availableBalance: number;
    inrBalance?: number;
    usdtBalance?: number;
    futuresInr?: number;
    futuresUsdt?: number;
    spotInr?: number;
    spotUsdt?: number;
    usdtEquivalent?: number;
    details?: string;
  } | null = null;
  public lastCredentialError: string | null = null;
  public isValidCredentials: boolean = true;
  public isValidCoinDcxCredentials: boolean = true;
  public coindcxCredentialError: string | null = null;
  private untradableSymbols: Set<string> = new Set();

  constructor() {
    const ExchangeClass = (ccxt as any).binanceusdm || (ccxt as any).binance;
    this.exchange = new ExchangeClass({
      enableRateLimit: true,
      options: { defaultType: 'future' }
    });
    if (this.exchange.urls?.api) {
      this.exchange.urls.api.public = 'https://fapi.binance.com/fapi/v1';
    }
    // Proactively pre-populate contract specifications (tick/lot sizes) immediately
    this.loadExchangeInfo().catch(e => console.warn('ExecutionAdapter: Initial exchange info fetch deferred:', e));
    // Fetch live CoinDCX USDT/INR conversion rate immediately and keep it fresh every 30 seconds
    this.fetchLiveUsdtToInrRate().catch(() => {});
    setInterval(() => {
      this.fetchLiveUsdtToInrRate().catch(() => {});
    }, 30000);
  }

  // Phase 2 Requirement: Double confirmation flow to enable real live (production money) mode
  public unlockLiveMode(confirmationPhrase: string): boolean {
    if (confirmationPhrase === 'I_ACKNOWLEDGE_RISK_AND_ENABLE_LIVE_TRADING') {
      this.liveModeUnlocked = true;
      return true;
    }
    return false;
  }

  public setMode(live: boolean, apiKey?: string, secret?: string, isTestnet: boolean = false): boolean {
    if (live) {
      if (!isTestnet && !this.liveModeUnlocked) {
        console.warn("ExecutionAdapter: Attempted to enable LIVE PRODUCTION MODE without double-confirmation unlock. BLOCKED.");
        return false;
      }
      this.isLive = true;
      this.isTestnet = isTestnet;
      this.apiKey = (apiKey || '').trim();
      this.apiSecret = (secret || '').trim();
      this.exchange.apiKey = this.apiKey;
      this.exchange.secret = this.apiSecret;
      this.loadExchangeInfo();
      console.log(`ExecutionAdapter: 🚀 ${isTestnet ? 'BINANCE FUTURES TESTNET' : 'BINANCE FUTURES LIVE'} MODE ENABLED`);
      
      // Proactively verify credentials against exchange in background
      this.testCredentials().then(result => {
        if (result.success) {
          console.log(`ExecutionAdapter: ✅ Credentials verified (${isTestnet ? 'Testnet' : 'Live'} balance: $${result.balance?.toFixed(2)} USDT)`);
        } else {
          this.isLive = false;
          this.isValidCredentials = false;
          this.lastCredentialError = result.error || 'Invalid API credentials';
          console.log(`[ExecutionAdapter] Exchange credentials inactive (${result.error}). Operating in simulated Paper mode.`);
        }
      }).catch(err => {
        this.isLive = false;
        this.isValidCredentials = false;
        this.lastCredentialError = err.message || String(err);
        console.log('[ExecutionAdapter] Credentials check inactive. Operating in simulated Paper mode.');
      });
      return true;
    } else {
      this.isLive = false;
      this.isTestnet = false;
      this.apiKey = '';
      this.apiSecret = '';
      this.isValidCredentials = true;
      this.lastCredentialError = null;
      this.liveModeUnlocked = false;
      return true;
    }
  }

  public setExchangeProvider(provider: 'BINANCE' | 'COINDCX') {
    this.provider = provider;
  }

  public getExchangeProvider(): 'BINANCE' | 'COINDCX' {
    return this.provider;
  }

  public getMarginCurrency(): 'INR' | 'USDT' {
    return this.coindcxMarginCurrency;
  }

  public setMarginCurrency(curr: 'INR' | 'USDT') {
    this.coindcxMarginCurrency = curr;
  }

  public getLastLiveBalance() {
    return this.lastLiveBalance;
  }

  public getUsdtToInrRate(): number {
    return this.usdtToInrRate || 99.26;
  }

  public async fetchLiveUsdtToInrRate(forceFresh = false): Promise<number> {
    const now = Date.now();
    if (!forceFresh && now - this.lastRateFetchTime < 30000 && this.usdtToInrRate > 50) {
      return this.usdtToInrRate;
    }
    try {
      const res = await fetch('https://api.coindcx.com/exchange/ticker', {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(4000)
      });
      if (res.ok) {
        const tickers = await res.json() as any[];
        if (Array.isArray(tickers)) {
          const usdtInr = tickers.find((t: any) => t.market === 'USDTINR');
          if (usdtInr) {
            const rawPrice = parseFloat(usdtInr.last_price || usdtInr.ask || usdtInr.bid || '0');
            if (rawPrice > 60 && rawPrice < 150) {
              const oldRate = this.usdtToInrRate;
              this.usdtToInrRate = rawPrice;
              this.lastRateFetchTime = now;
              if (Math.abs(oldRate - rawPrice) >= 0.1) {
                console.log(`⚡ [ExecutionAdapter] Live CoinDCX USDT/INR rate updated: ₹${rawPrice.toFixed(2)} (was ₹${oldRate.toFixed(2)})`);
              }
              return this.usdtToInrRate;
            }
          }
        }
      }
    } catch (e: any) {
      // Non-fatal, keep existing rate
    }
    return this.usdtToInrRate;
  }

  public setUsdtToInrRate(rate: number) {
    if (rate > 50 && rate < 150) {
      this.usdtToInrRate = rate;
      this.lastRateFetchTime = Date.now();
    }
  }

  public setInrRiskCaps(maxMarginInr: number, maxRiskInr: number) {
    if (maxMarginInr && maxMarginInr > 0) {
      this.maxTradeMarginInr = maxMarginInr;
    }
    if (maxRiskInr && maxRiskInr > 0) {
      this.maxRiskPerTradeInr = maxRiskInr;
    }
  }

  public getMaxTradeMarginInr(): number {
    return this.maxTradeMarginInr || 200;
  }

  public getMaxRiskPerTradeInr(): number {
    return this.maxRiskPerTradeInr || 100;
  }

  public setCoinDcxMode(live: boolean, apiKey?: string, secret?: string, marginCurrency: 'INR' | 'USDT' = 'INR'): boolean {
    if (live) {
      this.isLive = true;
      this.provider = 'COINDCX';
      this.coindcxApiKey = (apiKey || '').trim();
      this.coindcxApiSecret = (secret || '').trim();
      this.coindcxMarginCurrency = marginCurrency || 'INR';
      console.log(`ExecutionAdapter: 🚀 COINDCX API TRADING MODE ENABLED (Margin Currency: ${this.coindcxMarginCurrency})`);
      this.loadExchangeInfo().catch(e => console.warn('ExecutionAdapter: CoinDCX exchange info fetch deferred:', e));
      this.testCoinDcxCredentials().then(res => {
        if (res.success) {
          const displayBal = this.coindcxMarginCurrency === 'INR' 
            ? `₹${res.inrBalance?.toFixed(2)} INR (Futures: ₹${res.futuresInr?.toFixed(2)})` 
            : `$${res.balance?.toFixed(2)} USDT`;
          console.log(`ExecutionAdapter: ✅ CoinDCX credentials verified (${displayBal})`);
        } else {
          this.isLive = false;
          this.isValidCoinDcxCredentials = false;
          this.coindcxCredentialError = res.error || 'Invalid credentials';
          console.log(`[ExecutionAdapter] CoinDCX credentials inactive (${res.error}). Operating in simulated Paper mode.`);
        }
      }).catch(() => {
        this.isLive = false;
      });
      return true;
    } else {
      this.isLive = false;
      this.coindcxApiKey = '';
      this.coindcxApiSecret = '';
      this.isValidCoinDcxCredentials = true;
      this.coindcxCredentialError = null;
      return true;
    }
  }

  public async enableCoinDcxLive(apiKey: string, secret: string, marginCurrency: 'INR' | 'USDT' = 'INR'): Promise<{ success: boolean; error?: string; balance?: number; inrBalance?: number; futuresInr?: number }> {
    const key = (apiKey || '').trim();
    const sec = (secret || '').trim();
    if (!key || !sec) {
      return { success: false, error: 'CoinDCX API Key and Secret are required.' };
    }
    const testRes = await this.testCoinDcxCredentials(key, sec);
    if (!testRes.success) {
      return { success: false, error: testRes.error || 'Failed to authenticate with CoinDCX API' };
    }
    this.isLive = true;
    this.provider = 'COINDCX';
    this.coindcxApiKey = key;
    this.coindcxApiSecret = sec;
    this.coindcxMarginCurrency = marginCurrency || 'INR';
    this.isValidCoinDcxCredentials = true;
    this.coindcxCredentialError = null;
    this.loadExchangeInfo().catch(() => {});
    console.log(`ExecutionAdapter: 🚀 COINDCX LIVE MODE ENABLED & VERIFIED (Margin: ${this.coindcxMarginCurrency}, Futures: ₹${testRes.futuresInr?.toFixed(2)} INR)`);
    return {
      success: true,
      balance: testRes.balance,
      inrBalance: testRes.inrBalance,
      futuresInr: testRes.futuresInr
    };
  }


  public getMaxAllowedLeverage(symbol: string): number {
    const sym = symbol.toUpperCase().trim();
    const pair = this.toCoinDcxFuturesPair(sym);
    if (this.coindcxMaxLeverageCache[pair]) {
      return this.coindcxMaxLeverageCache[pair];
    }
    if (this.coindcxMaxLeverageCache[sym]) {
      return this.coindcxMaxLeverageCache[sym];
    }
    // Bitcoin and Ethereum support 50x-100x on CoinDCX/Binance
    if (sym.includes('BTC') || sym.includes('ETH')) {
      return 50;
    }
    // High-leverage majors
    if (sym.includes('SOL') || sym.includes('BNB') || sym.includes('XRP') || sym.includes('DOGE')) {
      return 50;
    }
    // Safe standard cap for altcoins/memecoins on CoinDCX derivatives (e.g. PUMP, WLD, NEIRO)
    return 30;
  }

  public getSymbolMinNotional(symbol: string): number {
    const sym = symbol.toUpperCase();
    const cleanSym = sym.replace(/^B-/, '').replace(/_/g, '').replace('USDT', '') + 'USDT';
    const market = this.exchangeInfoCache[cleanSym] || this.exchangeInfoCache[sym];
    if (market?.minNotional) return market.minNotional;
    if (cleanSym === 'BTCUSDT' || sym.includes('BTC')) return 50.0;
    if (cleanSym === 'ETHUSDT' || sym.includes('ETH')) return 20.0;
    return 5.0;
  }

  public ensureCoinDcxMinQuantity(symbol: string, quantity: number, price: number): number {
    const sym = symbol.toUpperCase();
    const cleanSym = sym.replace(/^B-/, '').replace(/_/g, '').replace('USDT', '') + 'USDT';
    const market = this.exchangeInfoCache[cleanSym] || this.exchangeInfoCache[sym];

    // Minimum order notional per Binance perpetual spec mirrored on CoinDCX ($5 for alts, $20 ETH, $50 BTC)
    const minNotionalUsd = this.getSymbolMinNotional(symbol);
    let minQty = price > 0 ? (minNotionalUsd / price) : 1;

    if (market?.limits?.amount?.min) {
      minQty = Math.max(minQty, market.limits.amount.min);
    }

    const adjusted = Math.max(quantity, minQty);
    return this.formatQuantity(symbol, adjusted);
  }

  public toCoinDcxFuturesPair(symbol: string): string {
    const upper = symbol.toUpperCase().trim();
    if (upper.startsWith('B-') && upper.includes('_')) return upper;
    if (upper.endsWith('USDT')) {
      const base = upper.replace('USDT', '');
      return `B-${base}_USDT`;
    }
    return `B-${upper}_USDT`;
  }

  public async getCoinDcxPositionDetails(symbol: string, forceFresh = false): Promise<{ leverage: number; marginCurrency: 'INR' | 'USDT'; activePos: number; avgPrice: number } | null> {
    if (this.provider !== 'COINDCX') return null;
    const now = Date.now();
    const futuresPair = this.toCoinDcxFuturesPair(symbol);
    const normalizedSymbol = symbol.toUpperCase().replace(/^BM?-/, '').replace(/_/g, '').replace('USDT', '') + 'USDT';

    try {
      if (forceFresh || now - this.coindcxPositionsCache.timestamp > 3000 || this.coindcxPositionsCache.positions.length === 0) {
        const res = await this.sendCoinDcxSignedRequest('/exchange/v1/derivatives/futures/positions', {
          margin_currency_short_name: ['INR', 'USDT'],
          page: 1,
          size: 100
        });
        if (res.status === 200 && Array.isArray(res.body)) {
          this.coindcxPositionsCache = { timestamp: now, positions: res.body };
        }
      }

      const list = this.coindcxPositionsCache.positions || [];
      const match = list.find((p: any) => {
        if (!p.pair) return false;
        if (p.pair === futuresPair) return true;
        const pNorm = p.pair.replace(/^BM?-/, '').replace(/_/g, '').replace('USDT', '') + 'USDT';
        return pNorm === normalizedSymbol;
      });

      if (match) {
        const lev = parseFloat(match.leverage || '0');
        const curr: 'INR' | 'USDT' = match.margin_currency_short_name?.toUpperCase() === 'USDT' ? 'USDT' : 'INR';
        if (lev > 0) {
          this.symbolActiveLeverageCache[normalizedSymbol] = lev;
          this.symbolActiveLeverageCache[futuresPair] = lev;
        }
        this.symbolActiveMarginCurrencyCache[normalizedSymbol] = curr;
        this.symbolActiveMarginCurrencyCache[futuresPair] = curr;
        return {
          leverage: lev > 0 ? lev : 10,
          marginCurrency: curr,
          activePos: parseFloat(match.active_pos || '0'),
          avgPrice: parseFloat(match.avg_price || '0')
        };
      }
    } catch (e) {
      console.warn('ExecutionAdapter: getCoinDcxPositionDetails error:', e);
    }

    const cachedLev = this.symbolActiveLeverageCache[normalizedSymbol] || this.symbolActiveLeverageCache[futuresPair] || 0;
    const rawCachedCurr = this.symbolActiveMarginCurrencyCache[normalizedSymbol] || this.symbolActiveMarginCurrencyCache[futuresPair] || this.coindcxMarginCurrency || 'INR';
    const cachedCurr: 'INR' | 'USDT' = rawCachedCurr?.toUpperCase() === 'USDT' ? 'USDT' : 'INR';

    return cachedLev > 0 ? { leverage: cachedLev, marginCurrency: cachedCurr, activePos: 0, avgPrice: 0 } : null;
  }

  public sendCoinDcxSignedRequest(endpoint: string, params: Record<string, any> = {}): Promise<{ status: number; body: any }> {
    return new Promise((resolve, reject) => {
      const ts = params.timestamp !== undefined ? params.timestamp : Math.floor(Date.now() / 1000);
      const bodyObj = { ...params, timestamp: ts };
      const bodyStr = JSON.stringify(bodyObj);
      const signature = crypto.createHmac('sha256', this.coindcxApiSecret).update(bodyStr).digest('hex');

      const req = https.request({
        hostname: 'api.coindcx.com',
        path: endpoint,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-AUTH-APIKEY': this.coindcxApiKey,
          'X-AUTH-SIGNATURE': signature
        }
      }, res => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          let parsed: any;
          try {
            parsed = JSON.parse(data);
          } catch (e) {
            parsed = data;
          }
          if (res.statusCode === 401 || (parsed && (parsed.code === 401 || parsed.status === 'error'))) {
            this.isValidCoinDcxCredentials = false;
            this.coindcxCredentialError = parsed?.message || 'Invalid credentials';
          } else if (res.statusCode === 200) {
            this.isValidCoinDcxCredentials = true;
            this.coindcxCredentialError = null;
          }
          resolve({ status: res.statusCode || 500, body: parsed });
        });
      });
      req.on('error', reject);
      req.write(bodyStr);
      req.end();
    });
  }

  public async testCoinDcxCredentials(apiKey?: string, secret?: string): Promise<{ 
    success: boolean; 
    balance?: number; 
    walletBalance?: number;
    availableBalance?: number;
    inrBalance?: number;
    usdtBalance?: number;
    usdtEquivalent?: number;
    futuresInr?: number;
    futuresUsdt?: number;
    spotInr?: number;
    spotUsdt?: number;
    details?: string;
    balances?: any[]; 
    error?: string; 
    guidance?: string 
  }> {
    const key = (apiKey || this.coindcxApiKey || '').trim();
    const sec = (secret || this.coindcxApiSecret || '').trim();
    if (!key || !sec) {
      return { success: false, error: 'CoinDCX API Key and Secret are required.' };
    }

    try {
      // 1. Fetch Futures Wallets (where Futures margin & trading INR/USDT funds are stored)
      const fetchFuturesWallets = () => new Promise<{ status: number; body: any }>((resolve) => {
        const sig = crypto.createHmac('sha256', sec).update('').digest('hex');
        const req = https.request({
          hostname: 'api.coindcx.com',
          path: '/exchange/v1/derivatives/futures/wallets',
          method: 'GET',
          headers: {
            'X-AUTH-APIKEY': key,
            'X-AUTH-SIGNATURE': sig
          }
        }, res => {
          let data = '';
          res.on('data', c => data += c);
          res.on('end', () => {
            try { resolve({ status: res.statusCode || 500, body: JSON.parse(data) }); }
            catch (e) { resolve({ status: res.statusCode || 500, body: data }); }
          });
        });
        req.on('error', (err) => resolve({ status: 500, body: err.message }));
        req.end();
      });

      // 2. Fetch Spot Balances
      const fetchSpotBalances = () => new Promise<{ status: number; body: any }>((resolve) => {
        const ts = Math.floor(Date.now());
        const bodyStr = JSON.stringify({ timestamp: ts });
        const signature = crypto.createHmac('sha256', sec).update(bodyStr).digest('hex');
        const req = https.request({
          hostname: 'api.coindcx.com',
          path: '/exchange/v1/users/balances',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-AUTH-APIKEY': key,
            'X-AUTH-SIGNATURE': signature
          }
        }, res => {
          let data = '';
          res.on('data', c => data += c);
          res.on('end', () => {
            try { resolve({ status: res.statusCode || 500, body: JSON.parse(data) }); }
            catch (e) { resolve({ status: res.statusCode || 500, body: data }); }
          });
        });
        req.on('error', (err) => resolve({ status: 500, body: err.message }));
        req.write(bodyStr);
        req.end();
      });

      const [futuresRes, spotRes] = await Promise.all([fetchFuturesWallets(), fetchSpotBalances()]);

      const futuresOk = futuresRes.status === 200 && Array.isArray(futuresRes.body);
      const spotOk = spotRes.status === 200 && Array.isArray(spotRes.body);

      if (futuresOk || spotOk) {
        this.isValidCoinDcxCredentials = true;
        this.coindcxCredentialError = null;

        let futuresInr = 0;
        let futuresUsdt = 0;
        if (futuresOk) {
          futuresRes.body.forEach((w: any) => {
            const bal = parseFloat(w.balance || '0') + parseFloat(w.locked_balance || '0');
            if (w.currency_short_name === 'INR') futuresInr += bal;
            if (w.currency_short_name === 'USDT') futuresUsdt += bal;
          });
        }

        let spotInr = 0;
        let spotUsdt = 0;
        if (spotOk) {
          spotRes.body.forEach((b: any) => {
            const bal = parseFloat(b.balance || '0') + parseFloat(b.locked_balance || '0');
            if (b.currency === 'INR') spotInr += bal;
            if (b.currency === 'USDT') spotUsdt += bal;
          });
        }

        const totalInr = futuresInr + spotInr;
        const totalUsdt = futuresUsdt + spotUsdt;
        const currentRate = this.getUsdtToInrRate();
        const usdtEquivalent = totalUsdt > 0 ? totalUsdt : (currentRate > 0 ? totalInr / currentRate : totalInr / 99.26);
        const isMarginInr = this.coindcxMarginCurrency === 'INR';
        const primaryBalance = isMarginInr && totalInr > 0 ? totalInr : usdtEquivalent;
        const primaryAvailable = isMarginInr && totalInr > 0 ? (futuresInr > 0 ? futuresInr : totalInr) : usdtEquivalent;

        this.lastLiveBalance = {
          walletBalance: primaryBalance,
          availableBalance: primaryAvailable,
          inrBalance: totalInr,
          usdtBalance: totalUsdt,
          usdtEquivalent,
          futuresInr,
          futuresUsdt,
          spotInr,
          spotUsdt,
          details: `Total: ₹${totalInr.toFixed(2)} INR (Futures: ₹${futuresInr.toFixed(2)}, Spot: ₹${spotInr.toFixed(2)})`
        };

        return {
          success: true,
          balance: primaryBalance,
          walletBalance: primaryBalance,
          availableBalance: primaryAvailable,
          inrBalance: totalInr,
          usdtBalance: totalUsdt,
          usdtEquivalent,
          futuresInr,
          futuresUsdt,
          spotInr,
          spotUsdt,
          details: `Total: ₹${totalInr.toFixed(2)} INR (Futures: ₹${futuresInr.toFixed(2)}, Spot: ₹${spotInr.toFixed(2)})`,
          balances: spotOk ? spotRes.body.filter((b: any) => parseFloat(b.balance || '0') > 0) : []
        };
      }

      this.isValidCoinDcxCredentials = false;
      const primaryErr = spotRes.body?.message || futuresRes.body?.message || `CoinDCX returned HTTP ${spotRes.status}`;
      const codeMsg = (spotRes.body?.errorCode || futuresRes.body?.errorCode) ? ` (${spotRes.body?.errorCode || futuresRes.body?.errorCode})` : '';
      const errMsg = primaryErr + codeMsg;
      this.coindcxCredentialError = errMsg;
      return {
        success: false,
        error: errMsg,
        guidance: 'CoinDCX rejected authentication. Check: 1) IP Restriction: In CoinDCX API Management, if "Bind IP Address" is enabled, turn IP restriction OFF or whitelist server IP (34.34.254.204). 2) Secret mismatch: CoinDCX reveals the Secret key only once upon generation; generate a new key and copy both immediately. 3) Permissions: Ensure Trade & Balances are checked.'
      };
    } catch (e: any) {
      this.isValidCoinDcxCredentials = false;
      this.coindcxCredentialError = e.message || String(e);
      return {
        success: false,
        error: e.message || String(e),
        guidance: 'Network or configuration error connecting to CoinDCX API.'
      };
    }
  }

  public getIsLive(): boolean {
    return this.isLive;
  }

  public getIsTestnet(): boolean {
    return this.isTestnet;
  }

  public getExchangeInstance(): any {
    return this.exchange;
  }

  /**
   * Generates a safe, alphanumeric ASCII-only client order ID strictly <= 32 characters.
   * Prevents Binance "-1102" and "Client order id length should be less than 36 chars",
   * and prevents URL-encoding inflation caused by unicode symbols (e.g. 币安人生USDT).
   */
  public static sanitizeClientOrderId(id?: string, prefix: string = 'O'): string {
    if (!id || typeof id !== 'string') {
      const rnd = Math.random().toString(36).substring(2, 8);
      return `${prefix}_${Date.now()}_${rnd}`.substring(0, 32);
    }
    // Retain only pure ASCII alphanumeric, underscore, and hyphen characters
    const ascii = id.replace(/[^a-zA-Z0-9_-]/g, '');
    if (ascii.length >= 4) {
      return ascii.substring(0, 32);
    }
    // If stripped ID is too short (e.g. was Chinese unicode like 币安人生)
    const hash = crypto.createHash('md5').update(id).digest('hex').substring(0, 8);
    const safePrefix = prefix.replace(/[^a-zA-Z0-9]/g, '').substring(0, 3) || 'O';
    return `${safePrefix}_${Date.now()}_${hash}`.substring(0, 32);
  }

  /**
   * Direct signed HTTPS request helper for Binance Futures (Testnet & Production)
   */
  private sendSignedRequest(method: 'GET' | 'POST' | 'DELETE', endpoint: string, params: Record<string, any> = {}): Promise<{ status: number; body: any }> {
    return new Promise((resolve, reject) => {
      const host = this.isTestnet ? 'testnet.binancefuture.com' : 'fapi.binance.com';
      const ts = Date.now();
      const allParams = { ...params, timestamp: ts };
      const queryParts = Object.entries(allParams)
        .filter(([_, v]) => v !== undefined && v !== null)
        .map(([k, v]) => `${k}=${encodeURIComponent(v)}`);
      const queryString = queryParts.join('&');
      const signature = crypto.createHmac('sha256', this.apiSecret).update(queryString).digest('hex');
      const fullPath = `${endpoint}?${queryString}&signature=${signature}`;

      const req = https.request({
        hostname: host,
        path: fullPath,
        method: method,
        headers: {
          'X-MBX-APIKEY': this.apiKey
        }
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          let parsed: any;
          try {
            parsed = JSON.parse(data);
          } catch (e) {
            parsed = data;
          }
          if (res.statusCode === 401 || (parsed && parsed.code === -2015)) {
            this.isValidCredentials = false;
            this.lastCredentialError = parsed?.msg || 'Invalid API-key, IP, or permissions for action (-2015)';
          } else if (res.statusCode === 200) {
            this.isValidCredentials = true;
            this.lastCredentialError = null;
          }
          resolve({ status: res.statusCode || 500, body: parsed });
        });
      });
      req.on('error', reject);
      req.end();
    });
  }

  public async fetchBalance(): Promise<{ walletBalance: number; availableBalance: number; inrBalance?: number; futuresInr?: number; spotInr?: number; usdtEquivalent?: number; details?: string } | null> {
    if (!this.isLive) return null;

    if (this.provider === 'COINDCX') {
      try {
        const credCheck = await this.testCoinDcxCredentials();
        if (credCheck.success) {
          const rate = this.getUsdtToInrRate();
          const usdtEquiv = credCheck.usdtEquivalent || ((credCheck.inrBalance || 0) / (rate || 99.26));
          const isMarginInr = this.coindcxMarginCurrency === 'INR';
          const primaryBalance = isMarginInr && (credCheck.inrBalance || 0) > 0 ? (credCheck.inrBalance || 0) : usdtEquiv;
          const primaryAvailable = isMarginInr && (credCheck.futuresInr || 0) > 0 ? (credCheck.futuresInr || 0) : (isMarginInr && (credCheck.inrBalance || 0) > 0 ? credCheck.inrBalance! : usdtEquiv);
          return {
            walletBalance: primaryBalance,
            availableBalance: primaryAvailable,
            inrBalance: credCheck.inrBalance,
            futuresInr: credCheck.futuresInr,
            spotInr: credCheck.spotInr,
            usdtEquivalent: usdtEquiv,
            details: credCheck.details
          };
        }
      } catch (e) {
        console.error('ExecutionAdapter: CoinDCX fetchBalance error:', e);
      }
      return null;
    }

    if (!this.apiKey || !this.apiSecret) return null;
    try {
      const res = await this.sendSignedRequest('GET', '/fapi/v2/account');
      if (res.status === 200 && res.body) {
        const wb = parseFloat(res.body.totalWalletBalance || '0');
        const ab = parseFloat(res.body.availableBalance || '0');
        this.lastLiveBalance = { walletBalance: wb, availableBalance: ab };
        return {
          walletBalance: wb,
          availableBalance: ab
        };
      }
    } catch (e) {
      console.error('ExecutionAdapter: fetchBalance error:', e);
    }
    return null;
  }

  public async testCredentials(): Promise<{ success: boolean; balance?: number; error?: string }> {
    if (!this.apiKey || !this.apiSecret) {
      return { success: false, error: 'API Key or Secret is missing.' };
    }
    try {
      const res = await this.sendSignedRequest('GET', '/fapi/v2/account');
      if (res.status === 200 && res.body) {
        this.isValidCredentials = true;
        this.lastCredentialError = null;
        const bal = parseFloat(res.body.totalWalletBalance || '0');
        const avail = parseFloat(res.body.availableBalance || '0');
        this.lastLiveBalance = { walletBalance: bal, availableBalance: avail };
        return {
          success: true,
          balance: bal
        };
      }
      this.isValidCredentials = false;
      this.lastCredentialError = res.body?.msg || `Binance returned HTTP ${res.status}`;
      return {
        success: false,
        error: res.body?.msg || `Binance returned HTTP ${res.status}`
      };
    } catch (e: any) {
      this.isValidCredentials = false;
      this.lastCredentialError = e.message || String(e);
      return { success: false, error: e.message || String(e) };
    }
  }

  public getCredentialStatus() {
    return {
      valid: this.isValidCredentials,
      error: this.lastCredentialError,
      isLive: this.isLive,
      isTestnet: this.isTestnet
    };
  }

  public async setLeverage(symbol: string, leverage: number): Promise<any> {
    if (!this.isLive) return { leverage };
    try {
      const res = await this.sendSignedRequest('POST', '/fapi/v1/leverage', { symbol, leverage });
      return res.body;
    } catch (e) {
      console.warn(`ExecutionAdapter: setLeverage error on ${symbol}:`, e);
      return null;
    }
  }

  public async fetchPositionRisk(): Promise<any[]> {
    if (!this.isLive) return [];

    if (this.provider === 'COINDCX') {
      try {
        const res = await this.sendCoinDcxSignedRequest('/exchange/v1/derivatives/futures/positions', {
          margin_currency_short_name: ['INR', 'USDT'],
          page: 1,
          size: 100
        });
        if (res.status === 200 && Array.isArray(res.body)) {
          this.coindcxPositionsCache = { timestamp: Date.now(), positions: res.body };
          return res.body
            .filter((p: any) => parseFloat(p.active_pos || '0') !== 0)
            .map((p: any) => {
              const symbol = p.pair ? p.pair.replace(/^BM?-/, '').replace(/_/g, '') : '';
              const amt = parseFloat(p.active_pos || '0');
              const entry = parseFloat(p.avg_price || '0');
              const rawMark = parseFloat(p.mark_price || '0');
              const mark = rawMark > 0 ? rawMark : (priceStream.getPrice(symbol) || entry);
              const usdtPnl = amt > 0 ? (mark - entry) * amt : (entry - mark) * Math.abs(amt);
              const inrRate = this.getUsdtToInrRate();
              const curr = p.margin_currency_short_name || 'INR';
              const pnl = curr === 'INR' ? usdtPnl * inrRate : usdtPnl;
              const lev = parseFloat(p.leverage || '10');
              const norm = symbol.toUpperCase().replace('USDT', '') + 'USDT';
              this.symbolActiveLeverageCache[norm] = lev;
              if (p.pair) this.symbolActiveLeverageCache[p.pair] = lev;
              this.symbolActiveMarginCurrencyCache[norm] = curr;
              if (p.pair) this.symbolActiveMarginCurrencyCache[p.pair] = curr;
              return {
                symbol,
                positionAmt: amt.toString(),
                entryPrice: entry.toString(),
                markPrice: mark.toString(),
                unRealizedProfit: pnl.toFixed(4),
                liquidationPrice: (p.liquidation_price || '0').toString(),
                leverage: lev.toString(),
                marginType: p.position_margin_type || 'isolated',
                marginCurrency: curr
              };
            });
        }
      } catch (e) {
        console.warn('ExecutionAdapter: CoinDCX fetchPositionRisk error:', e);
      }
      return [];
    }

    try {
      const res = await this.sendSignedRequest('GET', '/fapi/v2/positionRisk');
      if (res.status === 200 && Array.isArray(res.body)) {
        return res.body;
      }
    } catch (e) {
      console.warn('ExecutionAdapter: fetchPositionRisk error:', e);
    }
    return [];
  }

  public async fetchOpenOrders(symbol?: string): Promise<any[]> {
    if (!this.isLive) return [];

    if (this.provider === 'COINDCX') {
      try {
        const [openRes, untrigRes] = await Promise.all([
          this.sendCoinDcxSignedRequest('/exchange/v1/derivatives/futures/orders', {
            status: 'open',
            margin_currency_short_name: ['INR', 'USDT']
          }),
          this.sendCoinDcxSignedRequest('/exchange/v1/derivatives/futures/orders', {
            status: 'untriggered',
            margin_currency_short_name: ['INR', 'USDT']
          })
        ]);
        const o1 = (openRes.status === 200 && Array.isArray(openRes.body)) ? openRes.body : [];
        const o2 = (untrigRes.status === 200 && Array.isArray(untrigRes.body)) ? untrigRes.body : [];
        return [...o1, ...o2].map((o: any) => ({
          symbol: o.pair ? o.pair.replace(/^BM?-/, '').replace(/_/g, '') : '',
          side: o.side ? o.side.toUpperCase() : 'BUY',
          type: o.order_type ? o.order_type.toUpperCase() : 'MARKET',
          stopPrice: parseFloat(o.stop_price || '0'),
          price: parseFloat(o.price || '0'),
          origQty: parseFloat(o.total_quantity || '0'),
          orderId: o.id,
          marginCurrency: o.margin_currency_short_name || 'INR'
        }));
      } catch (e) {
        console.warn('ExecutionAdapter: CoinDCX fetchOpenOrders error:', e);
        return [];
      }
    }

    try {
      const [regRes, algoRes] = await Promise.all([
        this.sendSignedRequest('GET', '/fapi/v1/openOrders', symbol ? { symbol } : {}),
        this.sendSignedRequest('GET', '/fapi/v1/openAlgoOrders', symbol ? { symbol } : {})
      ]);

      const regularOrders = (regRes.status === 200 && Array.isArray(regRes.body)) ? regRes.body : [];
      const algoOrders = (algoRes.status === 200 && Array.isArray(algoRes.body)) ? algoRes.body.map(a => ({
        symbol: a.symbol,
        side: a.side,
        type: a.orderType || 'STOP_MARKET',
        stopPrice: a.triggerPrice,
        price: a.price,
        origQty: a.quantity,
        algoId: a.algoId
      })) : [];

      return [...regularOrders, ...algoOrders];
    } catch (e) {
      console.warn('ExecutionAdapter: fetchOpenOrders error:', e);
    }
    return [];
  }

  public async cancelOrder(symbol: string, orderId: string): Promise<any> {
    if (!this.isLive) return { status: 'cancelled' };
    if (this.provider === 'COINDCX') {
      try {
        const res = await this.sendCoinDcxSignedRequest('/exchange/v1/derivatives/futures/orders/cancel', { id: orderId });
        return res.body;
      } catch (e) {
        console.warn(`ExecutionAdapter: Failed to cancel CoinDCX order ${orderId}:`, e);
        return null;
      }
    }
    try {
      const res = await this.sendSignedRequest('DELETE', '/fapi/v1/order', { symbol, orderId });
      return res.body;
    } catch (e) {
      return null;
    }
  }

  public async cancelAllOpenOrders(symbol: string): Promise<boolean> {
    if (!this.isLive) return true;
    try {
      if (this.provider === 'COINDCX') {
        const futuresPair = this.toCoinDcxFuturesPair(symbol);
        const normSym = symbol.toUpperCase().replace(/^B-/, '').replace(/_/g, '').replace('USDT', '') + 'USDT';
        try {
          await this.sendCoinDcxSignedRequest('/exchange/v1/derivatives/futures/orders/cancel_all', { pair: futuresPair });
        } catch (e) {}

        const orders = await this.fetchOpenOrders(symbol);
        const matching = orders.filter((o: any) => {
          const symNorm = (o.symbol || '').toUpperCase().replace(/_/g, '').replace('USDT', '') + 'USDT';
          return symNorm === normSym && o.orderId;
        });
        for (const order of matching) {
          await this.cancelOrder(symbol, order.orderId);
        }
        return true;
      } else {
        await this.sendSignedRequest('DELETE', '/fapi/v1/allOpenOrders', { symbol });
        return true;
      }
    } catch (err) {
      console.warn(`ExecutionAdapter: Error cancelling orders for ${symbol}:`, err);
      return false;
    }
  }

  public getExchangeInfoCache(): Record<string, any> {
    return this.exchangeInfoCache;
  }

  public isSymbolTradable(symbol: string): boolean {
    if (!symbol) return false;
    const cleanSym = symbol.toUpperCase().replace(/^B-/, '').replace(/_/g, '').replace(':USDT', '');
    const standardSym = cleanSym.endsWith('USDT') ? cleanSym : `${cleanSym}USDT`;
    
    // Check if quarantined
    if (this.untradableSymbols.has(standardSym) || this.untradableSymbols.has(symbol) || this.untradableSymbols.has(cleanSym)) {
      return false;
    }

    // If cache is populated, check whether symbol is actively registered with TRADING status
    if (Object.keys(this.exchangeInfoCache).length > 0) {
      const match = this.exchangeInfoCache[symbol] || 
                    this.exchangeInfoCache[standardSym] || 
                    this.exchangeInfoCache[`B-${cleanSym.replace('USDT', '')}_USDT`] ||
                    this.exchangeInfoCache[`${cleanSym.replace('USDT', '')}_USDT`];
      return Boolean(match && match.active !== false);
    }

    return true;
  }

  public markSymbolUntradable(symbol: string, reason?: string): void {
    if (!symbol) return;
    const cleanSym = symbol.toUpperCase().replace(/^B-/, '').replace(/_/g, '').replace(':USDT', '');
    const standardSym = cleanSym.endsWith('USDT') ? cleanSym : `${cleanSym}USDT`;
    this.untradableSymbols.add(standardSym);
    this.untradableSymbols.add(symbol);
    this.untradableSymbols.add(cleanSym);

    delete this.exchangeInfoCache[symbol];
    delete this.exchangeInfoCache[standardSym];
    delete this.exchangeInfoCache[`B-${cleanSym.replace('USDT', '')}_USDT`];
    delete this.exchangeInfoCache[`${cleanSym.replace('USDT', '')}_USDT`];

    console.warn(`⚠️ [ExecutionAdapter] Symbol ${symbol} quarantined as UNTRADABLE${reason ? `: ${reason}` : ''}`);
  }

  public getUntradableSymbols(): string[] {
    return Array.from(this.untradableSymbols);
  }

  public async loadExchangeInfo() {
    try {
      const host = (this.provider === 'COINDCX' || !this.isTestnet) ? 'fapi.binance.com' : 'testnet.binancefuture.com';
      let res = await fetch(`https://${host}/fapi/v1/exchangeInfo`);
      if (!res.ok && host !== 'fapi.binance.com') {
        res = await fetch('https://fapi.binance.com/fapi/v1/exchangeInfo');
      }
      if (res.ok) {
        const data = await res.json() as any;
        const markets: Record<string, any> = {};
        for (const s of (data.symbols || [])) {
          if (s.status !== 'TRADING' && s.symbol) {
            this.untradableSymbols.add(s.symbol);
            continue;
          }
          if (s.status === 'TRADING' && s.quoteAsset === 'USDT' && (s.contractType === 'PERPETUAL' || !s.contractType)) {
            // If symbol was previously quarantined, restore it now that exchange reports TRADING
            this.untradableSymbols.delete(s.symbol);

            const priceFilter = s.filters?.find((f: any) => f.filterType === 'PRICE_FILTER');
            const lotFilter = s.filters?.find((f: any) => f.filterType === 'LOT_SIZE');
            const marketLotFilter = s.filters?.find((f: any) => f.filterType === 'MARKET_LOT_SIZE');

            const tickSize = priceFilter ? parseFloat(priceFilter.tickSize) : 0.01;
            const stepSize = marketLotFilter?.stepSize ? parseFloat(marketLotFilter.stepSize) : (lotFilter ? parseFloat(lotFilter.stepSize) : 0.001);
            const minQty = marketLotFilter?.minQty ? parseFloat(marketLotFilter.minQty) : (lotFilter ? parseFloat(lotFilter.minQty) : 0.001);
            const maxQty = marketLotFilter?.maxQty ? parseFloat(marketLotFilter.maxQty) : (lotFilter ? parseFloat(lotFilter.maxQty) : 999999999);

            const precisionPrice = s.pricePrecision !== undefined 
              ? s.pricePrecision 
              : (tickSize > 0 ? Math.max(0, Math.round(-Math.log10(tickSize))) : 2);
            const precisionAmount = s.quantityPrecision !== undefined 
              ? s.quantityPrecision 
              : (stepSize > 0 ? Math.max(0, Math.round(-Math.log10(stepSize))) : 3);

            const notionalFilter = s.filters?.find((f: any) => f.filterType === 'MIN_NOTIONAL');
            const minNotional = notionalFilter?.notional ? parseFloat(notionalFilter.notional) : (s.baseAsset === 'BTC' ? 50.0 : s.baseAsset === 'ETH' ? 20.0 : 5.0);

            const info = {
              id: s.symbol,
              symbol: `${s.baseAsset}/USDT:USDT`,
              base: s.baseAsset,
              quote: s.quoteAsset,
              active: true,
              swap: true,
              stepSize,
              tickSize,
              minNotional,
              precision: { price: precisionPrice, amount: precisionAmount },
              limits: {
                amount: { min: minQty, max: maxQty },
                price: { min: priceFilter ? parseFloat(priceFilter.minPrice) : 0.01 },
                cost: { min: minNotional }
              }
            };

            markets[s.symbol] = info;
            markets[`B-${s.baseAsset}_${s.quoteAsset}`] = info;
            markets[`${s.baseAsset}_${s.quoteAsset}`] = info;
          }
        }
        this.exchangeInfoCache = markets;
        return;
      }
    } catch (fallbackErr) {
      console.error("ExecutionAdapter: Failed to load exchange info:", fallbackErr);
    }
  }

  public formatPriceString(symbol: string, price: number): string {
    const rawSym = symbol.toUpperCase().replace(/^B-/, '').replace(/_/g, '').replace('USDT', '') + 'USDT';
    const pairSym = symbol.toUpperCase().startsWith('B-') ? symbol.toUpperCase() : `B-${symbol.toUpperCase().replace('USDT', '')}_USDT`;
    const market = this.exchangeInfoCache[rawSym] || this.exchangeInfoCache[symbol] || this.exchangeInfoCache[pairSym] || this.exchangeInfoCache[`${rawSym}:USDT`];
    if (market) {
      const rawTick = market.tickSize || 0.01;
      const tick = typeof rawTick === 'string' ? parseFloat(rawTick) : rawTick;
      const tickStr = tick.toString();
      let tickDecimals = 0;
      if (tickStr.includes('e-')) {
        tickDecimals = parseInt(tickStr.split('e-')[1], 10);
      } else if (tickStr.includes('.')) {
        tickDecimals = tickStr.split('.')[1].length;
      }
      const ticks = Math.round(price / tick);
      const rounded = ticks * tick;
      return rounded.toFixed(tickDecimals);
    }
    if (price >= 1000) return price.toFixed(1);
    if (price >= 10) return price.toFixed(2);
    if (price >= 1) return price.toFixed(4);
    if (price >= 0.01) return price.toFixed(5);
    return price.toFixed(7);
  }

  public formatQuantityString(symbol: string, quantity: number): string {
    const rawSym = symbol.toUpperCase().replace(/^B-/, '').replace(/_/g, '').replace('USDT', '') + 'USDT';
    const pairSym = symbol.toUpperCase().startsWith('B-') ? symbol.toUpperCase() : `B-${symbol.toUpperCase().replace('USDT', '')}_USDT`;
    const market = this.exchangeInfoCache[rawSym] || this.exchangeInfoCache[symbol] || this.exchangeInfoCache[pairSym] || this.exchangeInfoCache[`${rawSym}:USDT`];
    if (market) {
      const rawStep = market.stepSize || 0.001;
      const step = typeof rawStep === 'string' ? parseFloat(rawStep) : rawStep;
      const minQty = market.limits?.amount?.min || step;
      const maxQty = market.limits?.amount?.max || 999999999;

      const stepStr = step.toString();
      let stepDecimals = 0;
      if (stepStr.includes('e-')) {
        stepDecimals = parseInt(stepStr.split('e-')[1], 10);
      } else if (stepStr.includes('.')) {
        stepDecimals = stepStr.split('.')[1].length;
      }

      // Clamp quantity strictly within exchange limits [minQty, maxQty] to prevent -4005 errors
      const clamped = Math.max(minQty, Math.min(quantity, maxQty));
      let steps = Math.floor(clamped / step);
      if (steps * step < minQty) {
        steps = Math.ceil(clamped / step);
      }
      const stepped = steps * step;
      return stepped.toFixed(stepDecimals);
    }
    const symUpper = symbol.toUpperCase();
    if (symUpper.includes('ZK') || symUpper.includes('DOGE') || symUpper.includes('XRP') || symUpper.includes('PUMP') || symUpper.includes('NOT') || symUpper.includes('PEPE')) {
      return Math.max(1, Math.round(quantity)).toString();
    }
    if (quantity >= 10) return Math.floor(quantity).toString();
    if (quantity >= 1) return quantity.toFixed(1);
    return quantity.toFixed(3);
  }

  public formatPrice(symbol: string, price: number): number {
    return parseFloat(this.formatPriceString(symbol, price));
  }

  public formatQuantity(symbol: string, quantity: number): number {
    return parseFloat(this.formatQuantityString(symbol, quantity));
  }

  public async getActivePerpetualSymbols(): Promise<string[]> {
    try {
      if (Object.keys(this.exchangeInfoCache).length === 0) {
        await this.loadExchangeInfo();
      }
      const symbols: string[] = [];
      for (const [key, market] of Object.entries(this.exchangeInfoCache)) {
        const m = market as any;
        if (m.swap && m.active !== false && m.quote === 'USDT') {
          symbols.push(m.id || key);
        }
      }
      if (symbols.length > 0) return Array.from(new Set(symbols));
    } catch (e) {}

    try {
      const host = this.isTestnet ? 'testnet.binancefuture.com' : 'fapi.binance.com';
      const res = await fetch(`https://${host}/fapi/v1/exchangeInfo`);
      if (res.ok) {
        const data = await res.json() as any;
        return (data.symbols || [])
          .filter((s: any) => s.status === 'TRADING' && s.quoteAsset === 'USDT')
          .map((s: any) => s.symbol);
      }
    } catch (e) {}
    return [];
  }

  public async checkOrderStatusByClientOrderId(symbol: string, clientOrderId: string): Promise<any> {
    if (!this.isLive) return { status: 'closed', filled: 1 };
    try {
      const res = await this.sendSignedRequest('GET', '/fapi/v1/order', {
        symbol,
        origClientOrderId: ExecutionAdapter.sanitizeClientOrderId(clientOrderId)
      });
      if (res.status === 200) {
        return res.body;
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  public async createMarketOrder(symbol: string, side: 'buy' | 'sell', amount: number, leverage: number = 1, clientOrderId?: string) {
    if (!this.isLive) {
      if (this.provider === 'COINDCX') {
        const currentPrice = priceStream.getPrice(symbol) || 100;
        const usdtRate = this.getUsdtToInrRate();
        const maxLev = this.getMaxAllowedLeverage(symbol);
        const orderLev = Math.min(leverage || 10, maxLev);
        const sim = coinDcxSimulator.simulateOrderFill(
          symbol,
          side === 'buy' ? 'LONG' : 'SHORT',
          amount,
          currentPrice,
          orderLev,
          usdtRate,
          clientOrderId
        );
        return {
          id: sim.order.id,
          order_id: sim.order.id,
          pair: sim.order.pair,
          side: sim.order.side,
          status: 'filled',
          filled: sim.order.filled_quantity,
          filled_quantity: sim.order.filled_quantity,
          total_quantity: sim.order.total_quantity,
          avg_price: sim.fillPrice,
          price: sim.fillPrice,
          leverage: sim.order.leverage,
          fee_inr: sim.feeEntryInr,
          notional_inr: sim.notionalInr,
          margin_inr: sim.allocatedMarginInr,
          is_simulation: true
        };
      }
      return { id: clientOrderId || ('paper-' + Math.random().toString(36).substring(7)), status: 'closed', filled: amount };
    }

    if (this.provider === 'COINDCX') {
      if (!this.isValidCoinDcxCredentials) {
        throw new Error(`CoinDCX credentials invalid: ${this.coindcxCredentialError || 'Credentials rejected by CoinDCX'}`);
      }
      try {
        if (Object.keys(this.exchangeInfoCache).length === 0) {
          await this.loadExchangeInfo();
        }
        const futuresPair = this.toCoinDcxFuturesPair(symbol);
        const maxLev = this.getMaxAllowedLeverage(symbol);
        let orderLev = Math.min(leverage || 10, maxLev);
        let marginCurr = this.coindcxMarginCurrency || 'INR';

        // CoinDCX strict requirement: Order leverage must match existing position leverage
        const existingPos = await this.getCoinDcxPositionDetails(symbol);
        if (existingPos && existingPos.leverage > 0 && Math.abs(existingPos.activePos) > 0) {
          orderLev = existingPos.leverage;
          marginCurr = existingPos.marginCurrency || marginCurr;
          console.log(`⚡ [ExecutionAdapter] Existing CoinDCX position detected on ${futuresPair} (${existingPos.activePos} qty). Aligning order leverage to ${orderLev}x (Margin: ${marginCurr})`);
        }

        let orderQty = this.formatQuantity(symbol, amount);

        const payload: any = {
          timestamp: Math.floor(Date.now() / 1000),
          order: {
            pair: futuresPair,
            side: side.toLowerCase(),
            order_type: 'market_order',
            total_quantity: orderQty,
            leverage: orderLev,
            margin_currency_short_name: marginCurr,
            notification: 'no_notification'
          }
        };
        // Enforce hard user margin ceiling on CoinDCX INR orders (e.g. max ₹200 margin)
        if (marginCurr === 'INR' && this.maxTradeMarginInr > 0) {
          const inrRate = await this.fetchLiveUsdtToInrRate();
          const currentPrice = priceStream.getPrice(symbol) || priceStream.getPrice(futuresPair) || 0;
          if (currentPrice && currentPrice > 0) {
            let notionalInr = payload.order.total_quantity * currentPrice * inrRate;
            let projectedMarginInr = notionalInr / orderLev;
            if (projectedMarginInr > (this.maxTradeMarginInr + 0.5)) {
              const neededLev = Math.ceil(notionalInr / this.maxTradeMarginInr);
              if (neededLev <= maxLev) {
                orderLev = neededLev;
                payload.order.leverage = orderLev;
                console.log(`⚡ [ExecutionAdapter] Adjusted leverage on ${futuresPair} to ${orderLev}x to keep margin under ₹${this.maxTradeMarginInr}`);
              } else {
                // If neededLev exceeds maxLev, try clamping quantity down to max allowed under maxLev
                const maxAllowedAmount = (this.maxTradeMarginInr * maxLev) / (currentPrice * inrRate);
                let formattedClamped = this.formatQuantity(symbol, maxAllowedAmount);
                const minRequired = this.ensureCoinDcxMinQuantity(symbol, 0, currentPrice);
                if (formattedClamped >= minRequired && formattedClamped > 0) {
                  console.warn(`⚡ [ExecutionAdapter] Clamping CoinDCX ${futuresPair} quantity from ${payload.order.total_quantity} to ${formattedClamped} (Lev: ${maxLev}x) to strictly enforce ₹${this.maxTradeMarginInr} max margin limit`);
                  payload.order.total_quantity = formattedClamped;
                  orderLev = maxLev;
                  payload.order.leverage = orderLev;
                } else {
                  // If even minRequired exceeds maxTradeMarginInr at maxLev, prevent violating user cap
                  const finalMargin = (minRequired * currentPrice * inrRate) / maxLev;
                  if (finalMargin > (this.maxTradeMarginInr * 1.05)) {
                    throw new Error(`Order rejected: ${symbol} minimum trade size requires ₹${finalMargin.toFixed(2)} margin at max ${maxLev}x leverage, which exceeds strict ₹${this.maxTradeMarginInr} threshold.`);
                  }
                  orderLev = maxLev;
                  payload.order.leverage = orderLev;
                  payload.order.total_quantity = minRequired;
                }
              }
            }
          }
        }

        let res = await this.sendCoinDcxSignedRequest('/exchange/v1/derivatives/futures/orders/create', payload);

        // Auto-handle CoinDCX max allowed leverage error: e.g. "Max allowed leverage for current position size = 30.0x"
        if (res.status !== 200 && res.body?.message) {
          const levMatch = res.body.message.match(/Max allowed leverage.*?=\s*([\d.]+)x/i) ||
                           res.body.message.match(/leverage.*?([0-9]+(\.[0-9]+)?)\s*x/i);
          if (levMatch && levMatch[1]) {
            const parsedMax = Math.floor(parseFloat(levMatch[1]));
            if (parsedMax > 0 && parsedMax < orderLev) {
              console.warn(`⚡ [ExecutionAdapter] Clamping CoinDCX leverage for ${futuresPair} from ${orderLev}x to max allowed ${parsedMax}x and retrying order submission...`);
              this.coindcxMaxLeverageCache[futuresPair] = parsedMax;
              this.coindcxMaxLeverageCache[symbol.toUpperCase()] = parsedMax;
              payload.timestamp = Math.floor(Date.now() / 1000);
              payload.order.leverage = parsedMax;
              orderLev = parsedMax;
              if (marginCurr === 'INR' && this.maxTradeMarginInr > 0) {
                const currentPrice = priceStream.getPrice(symbol);
                if (currentPrice && currentPrice > 0) {
                  const maxAllowedAmount = (this.maxTradeMarginInr * orderLev) / (currentPrice * this.getUsdtToInrRate());
                  const formattedClamped = this.formatQuantity(symbol, maxAllowedAmount);
                  if (formattedClamped > 0 && formattedClamped < payload.order.total_quantity) {
                    console.warn(`⚡ [ExecutionAdapter] Re-clamping ${futuresPair} quantity to ${formattedClamped} after leverage drop to strictly maintain ₹${this.maxTradeMarginInr} margin`);
                    payload.order.total_quantity = formattedClamped;
                  }
                }
              }
              res = await this.sendCoinDcxSignedRequest('/exchange/v1/derivatives/futures/orders/create', payload);
            }
          }
        }

        // Auto-handle CoinDCX "Order leverage must be equal to position leverage"
        if (res.status !== 200 && res.body?.message?.toLowerCase().includes('position leverage')) {
          console.warn(`⚡ [ExecutionAdapter] CoinDCX requires order leverage to equal position leverage on ${futuresPair}. Fetching exact position leverage...`);
          const posDet = await this.getCoinDcxPositionDetails(symbol, true);
          if (posDet && posDet.leverage > 0) {
            console.log(`⚡ [ExecutionAdapter] Re-submitting CoinDCX market order with matching position leverage ${posDet.leverage}x (Margin: ${posDet.marginCurrency})...`);
            payload.timestamp = Math.floor(Date.now() / 1000);
            payload.order.leverage = posDet.leverage;
            payload.order.margin_currency_short_name = posDet.marginCurrency;
            res = await this.sendCoinDcxSignedRequest('/exchange/v1/derivatives/futures/orders/create', payload);
          }
        }

        // Auto-handle CoinDCX 422 "Client order is invalid" (e.g. integer step required, client_order_id format, or min notional)
        if (res.status !== 200 && (res.status === 422 || res.body?.message?.toLowerCase().includes('order is invalid'))) {
          console.warn(`⚡ [ExecutionAdapter] CoinDCX reported "Client order is invalid" on ${futuresPair} for quantity ${payload.order.total_quantity}. Auto-remedying contract step, min value, and order params...`);
          try {
            if (Object.keys(this.exchangeInfoCache).length === 0) {
              await this.loadExchangeInfo();
            }
            let fixedQty = this.formatQuantity(symbol, payload.order.total_quantity);
            if (fixedQty % 1 !== 0 && (fixedQty >= 10 || ['ZK', 'DOGE', 'XRP', 'NOT', 'PUMP'].some(s => symbol.toUpperCase().includes(s)))) {
              fixedQty = Math.round(fixedQty);
            }
            const curP = priceStream.getPrice(symbol) || 0;
            if (curP > 0) {
              const minAllowed = this.ensureCoinDcxMinQuantity(symbol, fixedQty, curP);
              if (minAllowed > fixedQty) fixedQty = minAllowed;
            }
            payload.timestamp = Math.floor(Date.now() / 1000);
            payload.order.total_quantity = fixedQty;
            delete payload.order.client_order_id;
            console.log(`⚡ [ExecutionAdapter] Retrying CoinDCX ${futuresPair} market order with remedied quantity ${fixedQty} (Lev: ${payload.order.leverage}x, Margin: ${payload.order.margin_currency_short_name})...`);
            res = await this.sendCoinDcxSignedRequest('/exchange/v1/derivatives/futures/orders/create', payload);
          } catch (autoRemedyErr) {
            console.error(`⚡ [ExecutionAdapter] Auto-remedy for invalid order error failed:`, autoRemedyErr);
          }
        }

        // Auto-handle CoinDCX Insufficient funds error by refreshing balance and scaling down order quantity
        if (res.status !== 200 && res.body?.message?.toLowerCase().includes('insufficient funds')) {
          console.warn(`⚡ [ExecutionAdapter] CoinDCX reported "Insufficient funds" on ${futuresPair} for quantity ${payload.order.total_quantity}. Refreshing balance and retrying with safe sizing...`);
          try {
            await this.testCoinDcxCredentials();
            const currInr = this.lastLiveBalance?.futuresInr || this.lastLiveBalance?.inrBalance || 0;
            if (currInr >= 600) {
              // Try with 20% of previous size first
              const safeReduced = this.formatQuantity(symbol, Math.max(1, Math.floor(payload.order.total_quantity * 0.2)));
              if (safeReduced > 0 && safeReduced < payload.order.total_quantity) {
                console.warn(`⚡ [ExecutionAdapter] Retrying ${futuresPair} market order with scaled quantity ${safeReduced} (Margin: ${marginCurr})`);
                payload.timestamp = Math.floor(Date.now() / 1000);
                payload.order.total_quantity = safeReduced;
                res = await this.sendCoinDcxSignedRequest('/exchange/v1/derivatives/futures/orders/create', payload);
              }

              // If still insufficient, retry with exchange minimum quantity
              if (res.status !== 200 && res.body?.message?.toLowerCase().includes('insufficient funds')) {
                const minQty = this.ensureCoinDcxMinQuantity(symbol, 1, 0);
                if (minQty > 0 && minQty < payload.order.total_quantity) {
                  console.warn(`⚡ [ExecutionAdapter] Retrying ${futuresPair} market order with minimum allowed quantity ${minQty} (Margin: ${marginCurr})`);
                  payload.timestamp = Math.floor(Date.now() / 1000);
                  payload.order.total_quantity = minQty;
                  res = await this.sendCoinDcxSignedRequest('/exchange/v1/derivatives/futures/orders/create', payload);
                }
              }
            }
          } catch (retryErr) {
            console.error(`⚡ [ExecutionAdapter] Retry after insufficient funds encountered error:`, retryErr);
          }
        }

        if (res.status === 200) {
          const orderData = Array.isArray(res.body) ? res.body[0] : res.body;
          const orderId = orderData?.id || orderData?.order_id || 'OK';
          const actualFilled = payload.order.total_quantity;
          console.log(`⚡ [ExecutionAdapter] COINDCX INR FUTURES Market Order FILLED: ${futuresPair} ${side.toUpperCase()} ${actualFilled} (Lev: ${orderLev}x, Margin: ${marginCurr}, ID: ${orderId})`);
          return {
            ...orderData,
            filled_quantity: actualFilled,
            total_quantity: actualFilled,
            id: orderId
          };
        } else {
          console.error(`ExecutionAdapter: CoinDCX error submitting futures order on ${futuresPair}:`, res.body);
          throw new Error(res.body?.message || `CoinDCX returned HTTP ${res.status}`);
        }
      } catch (e) {
        console.error(`ExecutionAdapter: Failed to execute CoinDCX Futures ${side} order on ${symbol}:`, e);
        throw e;
      }
    }

    if (!this.isValidCredentials) {
      throw new Error(`Invalid API-key, IP, or permissions for action (-2015): ${this.lastCredentialError || 'Credentials rejected by Binance'}`);
    }

    try {
      if (!this.isSymbolTradable(symbol)) {
        await this.loadExchangeInfo();
        if (!this.isSymbolTradable(symbol)) {
          throw new Error(`Invalid symbol status for opening position: ${symbol} is not active or TRADING on exchange.`);
        }
      }

      await this.setLeverage(symbol, leverage);

      if (!this.exchangeInfoCache[symbol]) {
        await this.loadExchangeInfo();
      }
      const formattedAmountStr = this.formatQuantityString(symbol, amount);

      const params: any = {
        symbol,
        side: side.toUpperCase(),
        type: 'MARKET',
        quantity: formattedAmountStr
      };
      if (clientOrderId) {
        params.newClientOrderId = ExecutionAdapter.sanitizeClientOrderId(clientOrderId, 'E');
      }

      const res = await this.sendSignedRequest('POST', '/fapi/v1/order', params);
      if (res.status === 200) {
        console.log(`⚡ [ExecutionAdapter] ${this.isTestnet ? 'TESTNET' : 'LIVE'} Market Order FILLED: ${symbol} ${side.toUpperCase()} ${formattedAmountStr} (OrderID: ${res.body.orderId})`);
        return res.body;
      } else {
        const errCode = res.body?.code;
        const errMsg = res.body?.msg || `Binance returned HTTP ${res.status}`;
        if (errCode === -4140 || errMsg.includes('Invalid symbol status') || errMsg.includes('opening position')) {
          this.markSymbolUntradable(symbol, errMsg);
        }
        console.error(`ExecutionAdapter: Error submitting market order on ${symbol}:`, res.body);
        throw new Error(errMsg);
      }
    } catch (e: any) {
      if (e.message?.includes('-4140') || e.message?.includes('Invalid symbol status') || e.message?.includes('opening position')) {
        this.markSymbolUntradable(symbol, e.message);
      }
      console.error(`ExecutionAdapter: Failed to execute ${side} order on ${symbol}:`, e);
      throw e;
    }
  }

  public async createStopMarketOrder(symbol: string, side: 'buy' | 'sell', amount: number, stopPrice: number, clientOrderId?: string, leverage?: number) {
    if (!this.isLive) {
      if (this.provider === 'COINDCX') {
        const futuresPair = this.toCoinDcxFuturesPair(symbol);
        const formattedStopPrice = this.formatPrice(symbol, stopPrice);
        console.log(`🛡️ [CoinDcxSimulator] Stop Order PLACED: ${futuresPair} ${side.toUpperCase()} at $${formattedStopPrice} (Qty: ${amount}, Lev: ${leverage || 10}x)`);
        return { 
          id: clientOrderId || ('sim-stop-' + Math.random().toString(36).substring(7)), 
          status: 'open', 
          pair: futuresPair, 
          stop_price: formattedStopPrice,
          is_simulation: true 
        };
      }
      return { id: clientOrderId || ('paper-sl-' + Math.random().toString(36).substring(7)), status: 'open' };
    }

    if (this.provider === 'COINDCX') {
      try {
        if (!this.exchangeInfoCache[symbol]) {
          await this.loadExchangeInfo();
        }
        const futuresPair = this.toCoinDcxFuturesPair(symbol);
        const maxLev = this.getMaxAllowedLeverage(symbol);
        
        // Find existing position leverage and margin currency to guarantee compliance with CoinDCX rules
        const posDetails = await this.getCoinDcxPositionDetails(symbol);
        let orderLev = (posDetails && posDetails.leverage > 0)
          ? posDetails.leverage
          : (leverage && leverage > 0 ? Math.min(leverage, maxLev) : Math.min(10, maxLev));
        let marginCurr = posDetails?.marginCurrency || this.symbolActiveMarginCurrencyCache[symbol] || this.coindcxMarginCurrency || 'INR';

        const formattedAmount = this.formatQuantity(symbol, amount);
        const formattedStopPrice = this.formatPrice(symbol, stopPrice);

        const payload: any = {
          timestamp: Math.floor(Date.now() / 1000),
          order: {
            pair: futuresPair,
            side: side.toLowerCase(),
            order_type: 'stop_market',
            stop_price: formattedStopPrice,
            total_quantity: formattedAmount,
            leverage: orderLev,
            margin_currency_short_name: marginCurr,
            notification: 'no_notification'
          }
        };
        let res = await this.sendCoinDcxSignedRequest('/exchange/v1/derivatives/futures/orders/create', payload);

        // Auto-heal if CoinDCX returns leverage mismatch error
        if (res.status !== 200 && res.body?.message?.toLowerCase().includes('position leverage')) {
          console.warn(`⚡ [ExecutionAdapter] CoinDCX Stop Loss leverage mismatch on ${futuresPair}. Refreshing position leverage...`);
          const freshDetails = await this.getCoinDcxPositionDetails(symbol, true);
          if (freshDetails && freshDetails.leverage > 0) {
            console.log(`🛡️ [ExecutionAdapter] Retrying Stop Loss with confirmed position leverage ${freshDetails.leverage}x (Margin: ${freshDetails.marginCurrency})...`);
            payload.timestamp = Math.floor(Date.now() / 1000);
            payload.order.leverage = freshDetails.leverage;
            payload.order.margin_currency_short_name = freshDetails.marginCurrency;
            res = await this.sendCoinDcxSignedRequest('/exchange/v1/derivatives/futures/orders/create', payload);
          }
        }

        // Auto-heal if CoinDCX returns 422 "Client order is invalid"
        if (res.status !== 200 && (res.status === 422 || res.body?.message?.toLowerCase().includes('order is invalid'))) {
          console.warn(`⚡ [ExecutionAdapter] CoinDCX Stop Loss rejected as invalid on ${futuresPair}. Auto-remedying parameters...`);
          try {
            let fixedQty = this.formatQuantity(symbol, payload.order.total_quantity);
            if (fixedQty % 1 !== 0 && (fixedQty >= 10 || ['ZK', 'DOGE', 'XRP', 'NOT', 'PUMP'].some(s => symbol.toUpperCase().includes(s)))) {
              fixedQty = Math.round(fixedQty);
            }
            payload.timestamp = Math.floor(Date.now() / 1000);
            payload.order.total_quantity = fixedQty;
            payload.order.stop_price = this.formatPrice(symbol, stopPrice);
            delete payload.order.client_order_id;
            res = await this.sendCoinDcxSignedRequest('/exchange/v1/derivatives/futures/orders/create', payload);
          } catch (autoErr) {}
        }

        if (res.status === 200) {
          console.log(`🛡️ [ExecutionAdapter] COINDCX FUTURES Stop Order PLACED: ${futuresPair} ${side.toUpperCase()} at ${formattedStopPrice} (Qty: ${formattedAmount}, Lev: ${payload.order.leverage}x, Margin: ${payload.order.margin_currency_short_name})`);
          return Array.isArray(res.body) ? res.body[0] : res.body;
        } else {
          console.error(`🚨 [ExecutionAdapter] CoinDCX Stop Loss failed on ${futuresPair}:`, res.body);
          throw new Error(res.body?.message || `CoinDCX Stop Loss returned HTTP ${res.status}`);
        }
      } catch (e) {
        console.error(`ExecutionAdapter: CoinDCX stop loss order error on ${symbol}:`, e);
        throw e;
      }
    }

    try {
      if (!this.exchangeInfoCache[symbol]) {
        await this.loadExchangeInfo();
      }
      const formattedAmountStr = this.formatQuantityString(symbol, amount);
      const formattedPriceStr = this.formatPriceString(symbol, stopPrice);

      // Attempt 1: Standard Binance Futures conditional STOP_MARKET order
      const stdParams: any = {
        symbol,
        side: side.toUpperCase(),
        type: 'STOP_MARKET',
        stopPrice: formattedPriceStr,
        quantity: formattedAmountStr,
        reduceOnly: 'true'
      };
      if (clientOrderId) {
        stdParams.newClientOrderId = ExecutionAdapter.sanitizeClientOrderId(clientOrderId, 'S');
      }

      let res = await this.sendSignedRequest('POST', '/fapi/v1/order', stdParams);
      if (res.status === 200) {
        console.log(`🛡️ [ExecutionAdapter] ${this.isTestnet ? 'TESTNET' : 'LIVE'} Stop-Market Order PLACED: ${symbol} ${side.toUpperCase()} at $${formattedPriceStr} (Qty: ${formattedAmountStr})`);
        return res.body;
      }

      // Attempt 2: Binance Futures Algo Order API
      const algoParams: any = {
        symbol,
        side: side.toUpperCase(),
        type: 'STOP_MARKET',
        algoType: 'CONDITIONAL',
        triggerPrice: formattedPriceStr,
        reduceOnly: 'true',
        quantity: formattedAmountStr
      };
      if (clientOrderId) {
        algoParams.clientAlgoId = ExecutionAdapter.sanitizeClientOrderId(clientOrderId, 'SA');
      }

      res = await this.sendSignedRequest('POST', '/fapi/v1/algoOrder', algoParams);
      if (res.status === 200) {
        console.log(`🛡️ [ExecutionAdapter] ${this.isTestnet ? 'TESTNET' : 'LIVE'} Algo Stop-Market Order PLACED: ${symbol} ${side.toUpperCase()} at $${formattedPriceStr}`);
        return res.body;
      } else {
        console.warn(`ExecutionAdapter: Stop order placement notice on ${symbol}:`, res.body);
        return res.body;
      }
    } catch (e) {
      console.error(`ExecutionAdapter: Failed to place Stop Market on ${symbol}:`, e);
      throw e;
    }
  }

  public async createTakeProfitMarketOrder(symbol: string, side: 'buy' | 'sell', amount: number, stopPrice: number, clientOrderId?: string, leverage?: number) {
    if (!this.isLive) {
      if (this.provider === 'COINDCX') {
        const futuresPair = this.toCoinDcxFuturesPair(symbol);
        const formattedStopPrice = this.formatPrice(symbol, stopPrice);
        console.log(`🎯 [CoinDcxSimulator] Take Profit PLACED: ${futuresPair} ${side.toUpperCase()} at $${formattedStopPrice} (Qty: ${amount}, Lev: ${leverage || 10}x)`);
        return { 
          id: clientOrderId || ('sim-tp-' + Math.random().toString(36).substring(7)), 
          status: 'open', 
          pair: futuresPair, 
          stop_price: formattedStopPrice,
          is_simulation: true 
        };
      }
      return { id: clientOrderId || ('paper-tp-' + Math.random().toString(36).substring(7)), status: 'open' };
    }

    if (this.provider === 'COINDCX') {
      try {
        if (!this.exchangeInfoCache[symbol]) {
          await this.loadExchangeInfo();
        }
        const futuresPair = this.toCoinDcxFuturesPair(symbol);
        const maxLev = this.getMaxAllowedLeverage(symbol);
        
        // Find existing position leverage and margin currency
        const posDetails = await this.getCoinDcxPositionDetails(symbol);
        let orderLev = (posDetails && posDetails.leverage > 0)
          ? posDetails.leverage
          : (leverage && leverage > 0 ? Math.min(leverage, maxLev) : Math.min(10, maxLev));
        let marginCurr = posDetails?.marginCurrency || this.symbolActiveMarginCurrencyCache[symbol] || this.coindcxMarginCurrency || 'INR';

        const formattedAmount = this.formatQuantity(symbol, amount);
        const formattedStopPrice = this.formatPrice(symbol, stopPrice);

        const payload: any = {
          timestamp: Math.floor(Date.now() / 1000),
          order: {
            pair: futuresPair,
            side: side.toLowerCase(),
            order_type: 'take_profit_market',
            stop_price: formattedStopPrice,
            total_quantity: formattedAmount,
            leverage: orderLev,
            margin_currency_short_name: marginCurr,
            notification: 'no_notification'
          }
        };
        let res = await this.sendCoinDcxSignedRequest('/exchange/v1/derivatives/futures/orders/create', payload);

        // Auto-heal if CoinDCX returns leverage mismatch error
        if (res.status !== 200 && res.body?.message?.toLowerCase().includes('position leverage')) {
          console.warn(`⚡ [ExecutionAdapter] CoinDCX Take Profit leverage mismatch on ${futuresPair}. Refreshing position leverage...`);
          const freshDetails = await this.getCoinDcxPositionDetails(symbol, true);
          if (freshDetails && freshDetails.leverage > 0) {
            console.log(`🎯 [ExecutionAdapter] Retrying Take Profit with confirmed position leverage ${freshDetails.leverage}x (Margin: ${freshDetails.marginCurrency})...`);
            payload.timestamp = Math.floor(Date.now() / 1000);
            payload.order.leverage = freshDetails.leverage;
            payload.order.margin_currency_short_name = freshDetails.marginCurrency;
            res = await this.sendCoinDcxSignedRequest('/exchange/v1/derivatives/futures/orders/create', payload);
          }
        }

        // Auto-heal if CoinDCX returns 422 "Client order is invalid"
        if (res.status !== 200 && (res.status === 422 || res.body?.message?.toLowerCase().includes('order is invalid'))) {
          console.warn(`⚡ [ExecutionAdapter] CoinDCX Take Profit rejected as invalid on ${futuresPair}. Auto-remedying parameters...`);
          try {
            let fixedQty = this.formatQuantity(symbol, payload.order.total_quantity);
            if (fixedQty % 1 !== 0 && (fixedQty >= 10 || ['ZK', 'DOGE', 'XRP', 'NOT', 'PUMP'].some(s => symbol.toUpperCase().includes(s)))) {
              fixedQty = Math.round(fixedQty);
            }
            payload.timestamp = Math.floor(Date.now() / 1000);
            payload.order.total_quantity = fixedQty;
            payload.order.stop_price = this.formatPrice(symbol, stopPrice);
            delete payload.order.client_order_id;
            res = await this.sendCoinDcxSignedRequest('/exchange/v1/derivatives/futures/orders/create', payload);
          } catch (autoErr) {}
        }

        if (res.status === 200) {
          console.log(`🎯 [ExecutionAdapter] COINDCX FUTURES Take Profit PLACED: ${futuresPair} ${side.toUpperCase()} at ${formattedStopPrice} (Qty: ${formattedAmount}, Lev: ${payload.order.leverage}x, Margin: ${payload.order.margin_currency_short_name})`);
          return Array.isArray(res.body) ? res.body[0] : res.body;
        } else {
          console.error(`🚨 [ExecutionAdapter] CoinDCX Take Profit failed on ${futuresPair}:`, res.body);
          throw new Error(res.body?.message || `CoinDCX Take Profit returned HTTP ${res.status}`);
        }
      } catch (e) {
        console.error(`ExecutionAdapter: CoinDCX take profit order error on ${symbol}:`, e);
        throw e;
      }
    }

    try {
      if (!this.exchangeInfoCache[symbol]) {
        await this.loadExchangeInfo();
      }
      const formattedAmountStr = this.formatQuantityString(symbol, amount);
      const formattedPriceStr = this.formatPriceString(symbol, stopPrice);

      // Attempt 1: Standard Binance Futures TAKE_PROFIT_MARKET order
      const stdParams: any = {
        symbol,
        side: side.toUpperCase(),
        type: 'TAKE_PROFIT_MARKET',
        stopPrice: formattedPriceStr,
        quantity: formattedAmountStr,
        reduceOnly: 'true'
      };
      if (clientOrderId) {
        stdParams.newClientOrderId = ExecutionAdapter.sanitizeClientOrderId(clientOrderId, 'T');
      }

      let res = await this.sendSignedRequest('POST', '/fapi/v1/order', stdParams);
      if (res.status === 200) {
        console.log(`🎯 [ExecutionAdapter] ${this.isTestnet ? 'TESTNET' : 'LIVE'} Take-Profit Order PLACED: ${symbol} ${side.toUpperCase()} at $${formattedPriceStr}`);
        return res.body;
      }

      // Attempt 2: Binance Futures Algo Order API
      const algoParams: any = {
        symbol,
        side: side.toUpperCase(),
        type: 'TAKE_PROFIT_MARKET',
        algoType: 'CONDITIONAL',
        triggerPrice: formattedPriceStr,
        reduceOnly: 'true',
        quantity: formattedAmountStr
      };
      if (clientOrderId) {
        algoParams.clientAlgoId = ExecutionAdapter.sanitizeClientOrderId(clientOrderId, 'TA');
      }

      res = await this.sendSignedRequest('POST', '/fapi/v1/algoOrder', algoParams);
      return res.body;
    } catch (e) {
      console.error(`ExecutionAdapter: Failed to place Take Profit on ${symbol}:`, e);
      throw e;
    }
  }

  public async closeMarketPosition(symbol: string, side: 'buy' | 'sell', amount: number, clientOrderId?: string, leverage?: number) {
    if (!this.isLive) {
      if (this.provider === 'COINDCX') {
        const futuresPair = this.toCoinDcxFuturesPair(symbol);
        console.log(`🏁 [CoinDcxSimulator] Position CLOSED: ${futuresPair} ${side.toUpperCase()} ${amount}`);
        return { status: 'closed', pair: futuresPair, filled: amount, is_simulation: true };
      }
      return { status: 'closed' };
    }

    if (this.provider === 'COINDCX') {
      try {
        if (Object.keys(this.exchangeInfoCache).length === 0) {
          await this.loadExchangeInfo();
        }
        const futuresPair = this.toCoinDcxFuturesPair(symbol);
        const maxLev = this.getMaxAllowedLeverage(symbol);

        // CRITICAL PROTECTION 1: Cancel any open stop-loss or take-profit bracket orders FIRST.
        // This prevents pending exchange stop orders from triggering simultaneously with market close,
        // which would cause a double-fill and instantly flip the account into an accidental opposite position.
        await this.cancelAllOpenOrders(symbol).catch(() => {});

        const posDetails = await this.getCoinDcxPositionDetails(symbol, true);

        // CRITICAL PROTECTION 2: Check if position on CoinDCX is ALREADY 0 (e.g. stopped out by exchange stop loss order)
        if (!posDetails || Math.abs(posDetails.activePos) === 0) {
          console.log(`🛡️ [ExecutionAdapter] CoinDCX position on ${futuresPair} is ALREADY FLAT (0 active contracts, closed by exchange SL/TP). Redundant close market order skipped to prevent reverse ghost position.`);
          return { status: 'closed', message: 'Already closed on exchange' };
        }

        // Ensure closing side strictly opposes actual open position
        // If activePos > 0 (LONG), must SELL to close. If activePos < 0 (SHORT), must BUY to close.
        const actualClosingSide: 'buy' | 'sell' = posDetails.activePos > 0 ? 'sell' : 'buy';

        // Ensure closing amount NEVER exceeds active open contracts (never overshoot into opposite position)
        const maxCloseQty = Math.abs(posDetails.activePos);
        const closeQty = Math.min(amount, maxCloseQty);
        const formattedAmount = this.formatQuantity(symbol, closeQty);

        let orderLev = (posDetails && posDetails.leverage > 0)
          ? posDetails.leverage
          : (leverage && leverage > 0 ? Math.min(leverage, maxLev) : Math.min(10, maxLev));
        let marginCurr = posDetails?.marginCurrency || this.symbolActiveMarginCurrencyCache[symbol] || this.coindcxMarginCurrency || 'INR';

        const payload: any = {
          timestamp: Math.floor(Date.now() / 1000),
          order: {
            pair: futuresPair,
            side: actualClosingSide,
            order_type: 'market_order',
            total_quantity: formattedAmount,
            leverage: orderLev,
            margin_currency_short_name: marginCurr,
            notification: 'no_notification'
          }
        };
        let res = await this.sendCoinDcxSignedRequest('/exchange/v1/derivatives/futures/orders/create', payload);

        // Cancel remaining open SL/TP bracket orders for this symbol so they don't trigger later
        this.cancelAllOpenOrders(symbol).catch(() => {});

        // Auto-heal if CoinDCX returns leverage mismatch error
        if (res.status !== 200 && res.body?.message?.toLowerCase().includes('position leverage')) {
          console.warn(`⚡ [ExecutionAdapter] CoinDCX closeMarketPosition leverage mismatch on ${futuresPair}. Refreshing position details...`);
          const freshDetails = await this.getCoinDcxPositionDetails(symbol, true);
          if (freshDetails && freshDetails.leverage > 0) {
            console.log(`🏁 [ExecutionAdapter] Retrying position close with confirmed leverage ${freshDetails.leverage}x (Margin: ${freshDetails.marginCurrency})...`);
            payload.timestamp = Math.floor(Date.now() / 1000);
            payload.order.leverage = freshDetails.leverage;
            payload.order.margin_currency_short_name = freshDetails.marginCurrency;
            res = await this.sendCoinDcxSignedRequest('/exchange/v1/derivatives/futures/orders/create', payload);
          }
        }

        // Auto-heal if CoinDCX returns 422 "Client order is invalid"
        if (res.status !== 200 && (res.status === 422 || res.body?.message?.toLowerCase().includes('order is invalid'))) {
          try {
            let fixedQty = this.formatQuantity(symbol, payload.order.total_quantity);
            if (fixedQty % 1 !== 0 && (fixedQty >= 10 || ['ZK', 'DOGE', 'XRP', 'NOT', 'PUMP'].some(s => symbol.toUpperCase().includes(s)))) {
              fixedQty = Math.round(fixedQty);
            }
            payload.timestamp = Math.floor(Date.now() / 1000);
            payload.order.total_quantity = fixedQty;
            delete payload.order.client_order_id;
            res = await this.sendCoinDcxSignedRequest('/exchange/v1/derivatives/futures/orders/create', payload);
          } catch (autoErr) {}
        }

        console.log(`🏁 [ExecutionAdapter] COINDCX FUTURES Position CLOSED: ${futuresPair} ${side.toUpperCase()} ${amount} (Lev: ${payload.order.leverage}x, Margin: ${payload.order.margin_currency_short_name})`);
        return Array.isArray(res.body) ? res.body[0] : res.body;
      } catch (e) {
        console.error(`ExecutionAdapter: Failed to close CoinDCX Futures position on ${symbol}:`, e);
        return { status: 'closed' };
      }
    }

    try {
      if (!this.exchangeInfoCache[symbol]) {
        await this.loadExchangeInfo();
      }
      // Cancel open bracket orders first so pending SL does not linger or execute on top of market close
      await this.cancelAllOpenOrders(symbol).catch(() => {});
      const formattedAmountStr = this.formatQuantityString(symbol, amount);

      const params: any = {
        symbol,
        side: side.toUpperCase(),
        type: 'MARKET',
        reduceOnly: 'true',
        quantity: formattedAmountStr
      };
      if (clientOrderId) {
        params.newClientOrderId = ExecutionAdapter.sanitizeClientOrderId(clientOrderId, 'C');
      }

      const res = await this.sendSignedRequest('POST', '/fapi/v1/order', params);
      if (res.status === 200) {
        console.log(`🏁 [ExecutionAdapter] ${this.isTestnet ? 'TESTNET' : 'LIVE'} Position CLOSED: ${symbol} ${side.toUpperCase()} ${formattedAmountStr}`);
      }
      return res.body;
    } catch (e) {
      console.error(`ExecutionAdapter: Failed to close position on ${symbol}:`, e);
      throw e;
    }
  }
}

export const executionAdapter = new ExecutionAdapter();
