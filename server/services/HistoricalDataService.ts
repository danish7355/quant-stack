import fs from 'node:fs';
import path from 'node:path';

export interface HistoricalCandle {
  time: number; // in seconds (for strategy compatibility)
  openTime: number; // in milliseconds
  closeTime: number; // in milliseconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export class HistoricalDataService {
  private cacheDir: string;

  constructor(cacheDir = path.resolve('data/klines_cache')) {
    this.cacheDir = cacheDir;
    try {
      if (!fs.existsSync(this.cacheDir)) {
        fs.mkdirSync(this.cacheDir, { recursive: true });
      }
    } catch (e) {
      console.warn('[HistoricalDataService] Could not create cache directory:', e);
    }
  }

  private getCacheFilePath(symbol: string, interval: string): string {
    const cleanSym = symbol.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const cleanInt = interval.toLowerCase();
    return path.join(this.cacheDir, `${cleanSym}_${cleanInt}.json`);
  }

  private loadCacheFromDisk(symbol: string, interval: string): HistoricalCandle[] {
    const filePath = this.getCacheFilePath(symbol, interval);
    if (!fs.existsSync(filePath)) return [];
    try {
      const data = fs.readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    } catch (e) {
      console.warn(`[HistoricalDataService] Failed to read cache for ${symbol} ${interval}:`, e);
    }
    return [];
  }

  private saveCacheToDisk(symbol: string, interval: string, candles: HistoricalCandle[]): void {
    const filePath = this.getCacheFilePath(symbol, interval);
    try {
      fs.writeFileSync(filePath, JSON.stringify(candles), 'utf8');
    } catch (e) {
      console.warn(`[HistoricalDataService] Failed to write cache for ${symbol} ${interval}:`, e);
    }
  }

  /**
   * Fetches historical Binance USDT-M Futures klines with automatic pagination and local disk caching.
   * Rate limits are respected with a staggered delay between chunk requests.
   */
  public async getKlines(
    symbol: string,
    interval: string,
    fromMs: number,
    toMs: number,
    onProgress?: (fetchedCount: number, message: string) => void
  ): Promise<HistoricalCandle[]> {
    const sym = symbol.toUpperCase();
    const int = interval.toLowerCase();
    const effectiveTo = Math.min(toMs, Date.now());

    // 1. Check local disk cache
    let cached = this.loadCacheFromDisk(sym, int);
    
    // Check if cache already contains the required range (with 5 min tolerance for latest closed bar)
    if (cached.length > 0) {
      const cachedMin = cached[0].openTime;
      const cachedMax = cached[cached.length - 1].closeTime;

      if (cachedMin <= fromMs && cachedMax >= (effectiveTo - 5 * 60 * 1000)) {
        const slice = cached.filter(c => c.openTime >= fromMs && c.openTime <= effectiveTo);
        if (slice.length > 0) {
          onProgress?.(slice.length, `Loaded ${slice.length} candles from local cache for ${sym} (${int})`);
          return slice;
        }
      }
    }

    // 2. Fetch missing ranges from Binance API
    onProgress?.(0, `Fetching historical ${int} candles from Binance for ${sym}...`);
    const fetchedMap = new Map<number, HistoricalCandle>();
    for (const c of cached) {
      fetchedMap.set(c.openTime, c);
    }

    let currentStart = fromMs;
    // If cache already covers fromMs up to a certain point, only fetch the missing suffix
    if (cached.length > 0 && cached[0].openTime <= fromMs && cached[cached.length - 1].closeTime > fromMs) {
      currentStart = cached[cached.length - 1].closeTime + 1;
    }

    const limit = 1000;
    let fetchedChunks = 0;

    while (currentStart < effectiveTo) {
      const url = `https://fapi.binance.com/fapi/v1/klines?symbol=${sym}&interval=${int}&startTime=${currentStart}&endTime=${effectiveTo}&limit=${limit}`;
      
      try {
        const res = await fetch(url);
        if (!res.ok) {
          const errText = await res.text().catch(() => '');
          throw new Error(`Binance API error ${res.status}: ${errText}`);
        }

        const raw: any[] = await res.json();
        if (!Array.isArray(raw) || raw.length === 0) {
          break;
        }

        for (const item of raw) {
          const openTime = Number(item[0]);
          const closeTime = Number(item[6]);
          const candle: HistoricalCandle = {
            time: Math.floor(openTime / 1000),
            openTime,
            closeTime,
            open: parseFloat(item[1]),
            high: parseFloat(item[2]),
            low: parseFloat(item[3]),
            close: parseFloat(item[4]),
            volume: parseFloat(item[5])
          };
          fetchedMap.set(openTime, candle);
        }

        fetchedChunks++;
        onProgress?.(fetchedMap.size, `Fetched chunk ${fetchedChunks} (${raw.length} bars) for ${sym} ${int}`);

        const lastBar = raw[raw.length - 1];
        const lastCloseTime = Number(lastBar[6]);
        if (lastCloseTime >= effectiveTo || raw.length < limit) {
          break;
        }
        currentStart = lastCloseTime + 1;

        // Polite rate-limit delay
        await new Promise(r => setTimeout(r, 60));
      } catch (err: any) {
        console.error(`[HistoricalDataService] Fetch error for ${sym} ${int} at ${currentStart}:`, err?.message || err);
        // Break out to preserve whatever we have fetched
        break;
      }
    }

    // 3. Sort, cache, and slice requested range
    const merged = Array.from(fetchedMap.values()).sort((a, b) => a.openTime - b.openTime);
    if (merged.length > 0) {
      this.saveCacheToDisk(sym, int, merged);
    }

    const finalSlice = merged.filter(c => c.openTime >= fromMs && c.openTime <= effectiveTo);
    onProgress?.(finalSlice.length, `Ready: ${finalSlice.length} candles for ${sym} (${int})`);
    return finalSlice;
  }
}

export const historicalDataService = new HistoricalDataService();
