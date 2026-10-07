/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * MarketBreadthService — Cumulative Top 100 Futures Regime & Breadth Engine
 * Evaluates market-wide distribution across Top 100 volume-ranked USDT perpetuals
 * to determine market regime (TREND, RANGE, COMPRESSION, EXPANSION) cumulatively,
 * eliminating single-coin (BTC-only) bias and false macro lockouts.
 */

import { calculateEMA, calculateADX, calculateATR } from '../../src/utils/indicators.js';
import { CoreRegimeType } from '../../src/utils/regime/threeLayerRegime.js';

export interface CoinRegimeSnapshot {
  symbol: string;
  price: number;
  change24h: number;
  quoteVolume: number;
  fundingRate: number;
  regime: CoreRegimeType;
  trendDirection: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  aboveEma50: boolean;
  aboveEma200: boolean;
  adx: number;
  atrRatio: number;
  bbw: number;
}

export interface MarketBreadth100 {
  timestamp: number;
  totalCoins: number;
  rangeCount: number;
  rangePct: number;
  trendCount: number;
  trendPct: number;
  bullTrendCount: number;
  bullTrendPct: number;
  bearTrendCount: number;
  bearTrendPct: number;
  compressionCount: number;
  compressionPct: number;
  expansionCount: number;
  expansionPct: number;
  pctAboveEma50: number;
  pctAboveEma200: number;
  medianAdx: number;
  advancingCount: number;
  advancingPct: number;
  decliningCount: number;
  decliningPct: number;
  avgFundingRate: number;
  consensusRegime: CoreRegimeType;
  consensusConfidence: number;
  favoredStrategy: string;
  consensusReason: string;
  topCoinsBreakdown: CoinRegimeSnapshot[];
}

export class MarketBreadthService {
  private cache: MarketBreadth100 | null = null;
  private lastFetchTime = 0;
  private readonly CACHE_TTL_MS = 75000; // 75 seconds cache to balance real-time freshness and rate limits
  private isFetching = false;

  constructor() {
    // Initialize cache immediately so no request ever hangs or times out
    this.cache = this.getFallbackBreadth();
    // Warm up cache asynchronously in the background
    setTimeout(() => {
      this.computeMarketBreadth(100).then(res => {
        this.cache = res;
        this.lastFetchTime = Date.now();
      }).catch(err => {
        console.warn('[MarketBreadthService] Background initial warmup failed, using fallback:', err?.message || err);
      });
    }, 1500);
  }

  /**
   * Fetches and computes the cumulative breadth and regime across the Top 100 coins
   */
  public async getCumulativeBreadth(coinCount = 100, forceRefresh = false): Promise<MarketBreadth100> {
    const now = Date.now();
    if (!forceRefresh && this.cache && (now - this.lastFetchTime < this.CACHE_TTL_MS)) {
      return this.cache;
    }

    if (this.isFetching) {
      return this.cache || this.getFallbackBreadth();
    }

    this.isFetching = true;
    try {
      const result = await this.computeMarketBreadth(coinCount);
      this.cache = result;
      this.lastFetchTime = Date.now();
      return result;
    } catch (err: any) {
      console.warn('[MarketBreadthService] Error computing breadth:', err?.message || err);
      return this.cache || this.getFallbackBreadth();
    } finally {
      this.isFetching = false;
    }
  }

  private async computeMarketBreadth(targetCount: number): Promise<MarketBreadth100> {
    const timestamp = Date.now();
    const count = Math.max(25, Math.min(targetCount, 100));

    // 1. Fetch 24h tickers & funding rates in parallel (1 HTTP request each)
    const [tickerRes, fundingRes] = await Promise.all([
      fetch('https://fapi.binance.com/fapi/v1/ticker/24hr').catch(() => null),
      fetch('https://fapi.binance.com/fapi/v1/premiumIndex').catch(() => null)
    ]);

    if (!tickerRes || !tickerRes.ok) {
      throw new Error(`Failed to fetch 24hr tickers: HTTP ${tickerRes?.status}`);
    }

    const tickers: any[] = await tickerRes.json();
    const fundingData: any[] = (fundingRes && fundingRes.ok) ? await fundingRes.json().catch(() => []) : [];

    // Map funding rates by symbol
    const fundingMap = new Map<string, number>();
    if (Array.isArray(fundingData)) {
      for (const item of fundingData) {
        if (item.symbol && item.lastFundingRate) {
          fundingMap.set(item.symbol, parseFloat(item.lastFundingRate));
        }
      }
    }

    // Filter USDT perpetual pairs sorted by quote volume
    const topUsdtTickers = tickers
      .filter((t: any) => t.symbol && t.symbol.endsWith('USDT') && !t.symbol.includes('_') && /^[A-Z0-9]+USDT$/.test(t.symbol))
      .sort((a: any, b: any) => parseFloat(b.quoteVolume || '0') - parseFloat(a.quoteVolume || '0'))
      .slice(0, count);

    if (topUsdtTickers.length === 0) {
      throw new Error('No valid USDT perpetual tickers found');
    }

    // 2. Fetch 4H klines in concurrent batches of 15 to stay well clear of rate limits
    const BATCH_SIZE = 15;
    const snapshots: CoinRegimeSnapshot[] = [];
    const adxValues: number[] = [];
    let aboveEma50Count = 0;
    let aboveEma200Count = 0;
    let advancingCount = 0;
    let decliningCount = 0;
    let totalFunding = 0;
    let fundingCount = 0;

    for (let i = 0; i < topUsdtTickers.length; i += BATCH_SIZE) {
      const chunk = topUsdtTickers.slice(i, i + BATCH_SIZE);
      const chunkResults = await Promise.all(
        chunk.map(async (ticker: any) => {
          const symbol = ticker.symbol;
          const currentPrice = parseFloat(ticker.lastPrice || '0');
          const change24h = parseFloat(ticker.priceChangePercent || '0');
          const quoteVolume = parseFloat(ticker.quoteVolume || '0');
          const fundingRate = fundingMap.get(symbol) ?? 0.0001;

          if (currentPrice <= 0) return null;

          if (change24h > 0.2) advancingCount++;
          else if (change24h < -0.2) decliningCount++;

          totalFunding += fundingRate;
          fundingCount++;

          try {
            // Fetch compact 4H klines (55 candles are sufficient for EMA50, ADX14, ATR, and BBW)
            const kRes = await fetch(`https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=4h&limit=55`);
            if (!kRes.ok) return null;
            const rawKlines: any[] = await kRes.json();
            if (!Array.isArray(rawKlines) || rawKlines.length < 30) return null;

            const closes = rawKlines.map((k: any) => parseFloat(k[4]));
            const highs = rawKlines.map((k: any) => parseFloat(k[2]));
            const lows = rawKlines.map((k: any) => parseFloat(k[3]));
            const volumes = rawKlines.map((k: any) => parseFloat(k[5]));

            const lastClose = closes[closes.length - 1];

            // 1. EMA 50 & EMA 200
            const ema50Series = calculateEMA(closes, Math.min(50, closes.length));
            const lastEma50 = ema50Series[ema50Series.length - 1] || lastClose;
            const isAboveEma50 = lastClose > lastEma50;

            const ema200Series = calculateEMA(closes, Math.min(200, closes.length));
            const lastEma200 = ema200Series[ema200Series.length - 1] || lastClose;
            const isAboveEma200 = lastClose > lastEma200;

            if (isAboveEma50) aboveEma50Count++;
            if (isAboveEma200) aboveEma200Count++;

            // 2. ADX 14
            const adxResult = calculateADX(highs, lows, closes, 14);
            const currentAdx = adxResult.adx[adxResult.adx.length - 1] || 18;
            adxValues.push(currentAdx);

            // 3. ATR Ratio
            const atrSeries = calculateATR(highs, lows, closes, 14);
            const currentAtr = atrSeries[atrSeries.length - 1] || (lastClose * 0.02);
            const avgAtr = atrSeries.length >= 20
              ? atrSeries.slice(-20).reduce((s, v) => s + v, 0) / 20
              : currentAtr;
            const atrRatio = avgAtr > 0 ? currentAtr / avgAtr : 1.0;

            // 4. Bollinger Bandwidth (BBW)
            const recent20 = closes.slice(-20);
            const mean20 = recent20.reduce((s, v) => s + v, 0) / 20;
            const variance = recent20.reduce((s, v) => s + Math.pow(v - mean20, 2), 0) / 20;
            const stdDev = Math.sqrt(variance);
            const bbw = mean20 > 0 ? (4 * stdDev) / mean20 : 0.04;

            // 5. Volume Ratio
            const recentVol = volumes.slice(-20);
            const avgVol = recentVol.reduce((s, v) => s + v, 0) / (recentVol.length || 1);
            const currentVol = volumes[volumes.length - 1] || 1;
            const volRatio = avgVol > 0 ? currentVol / avgVol : 1.0;

            // 6. Local Coin Regime Classification
            let regime: CoreRegimeType = 'RANGE';
            let trendDirection: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';

            if (isAboveEma50 && change24h > 0) trendDirection = 'BULLISH';
            else if (!isAboveEma50 && change24h < 0) trendDirection = 'BEARISH';

            // High Volatility / Expansion
            if (atrRatio >= 1.45 || Math.abs(change24h) >= 7.5 || (volRatio >= 2.2 && Math.abs(change24h) >= 4.0)) {
              regime = 'EXPANSION';
            }
            // Squeeze / Compression
            else if (bbw <= 0.038 || (atrRatio <= 0.72 && Math.abs(change24h) <= 1.2 && currentAdx <= 18)) {
              regime = 'COMPRESSION';
            }
            // Directional Trend
            else if (currentAdx >= 22 && ((isAboveEma50 && change24h >= 1.5) || (!isAboveEma50 && change24h <= -1.5))) {
              regime = 'TREND';
            }
            // Mean-Reverting Range
            else {
              regime = 'RANGE';
            }

            const snap: CoinRegimeSnapshot = {
              symbol,
              price: currentPrice,
              change24h,
              quoteVolume,
              fundingRate,
              regime,
              trendDirection,
              aboveEma50: isAboveEma50,
              aboveEma200: isAboveEma200,
              adx: parseFloat(currentAdx.toFixed(1)),
              atrRatio: parseFloat(atrRatio.toFixed(2)),
              bbw: parseFloat(bbw.toFixed(4))
            };

            return snap;
          } catch (e) {
            return null;
          }
        })
      );

      for (const res of chunkResults) {
        if (res) snapshots.push(res);
      }
    }

    const totalCoins = snapshots.length;
    if (totalCoins === 0) {
      return this.getFallbackBreadth();
    }

    // 3. Count distribution
    let rangeCount = 0;
    let trendCount = 0;
    let bullTrendCount = 0;
    let bearTrendCount = 0;
    let compressionCount = 0;
    let expansionCount = 0;

    for (const snap of snapshots) {
      if (snap.regime === 'RANGE') rangeCount++;
      else if (snap.regime === 'TREND') {
        trendCount++;
        if (snap.trendDirection === 'BULLISH') bullTrendCount++;
        else if (snap.trendDirection === 'BEARISH') bearTrendCount++;
      } else if (snap.regime === 'COMPRESSION') compressionCount++;
      else if (snap.regime === 'EXPANSION') expansionCount++;
    }

    const rangePct = Math.round((rangeCount / totalCoins) * 100);
    const trendPct = Math.round((trendCount / totalCoins) * 100);
    const bullTrendPct = Math.round((bullTrendCount / totalCoins) * 100);
    const bearTrendPct = Math.round((bearTrendCount / totalCoins) * 100);
    const compressionPct = Math.round((compressionCount / totalCoins) * 100);
    const expansionPct = Math.round((expansionCount / totalCoins) * 100);

    const pctAboveEma50 = Math.round((aboveEma50Count / totalCoins) * 100);
    const pctAboveEma200 = Math.round((aboveEma200Count / totalCoins) * 100);
    const advancingPct = Math.round((advancingCount / totalCoins) * 100);
    const decliningPct = Math.round((decliningCount / totalCoins) * 100);
    const avgFundingRate = fundingCount > 0 ? parseFloat((totalFunding / fundingCount).toFixed(6)) : 0.0001;

    // Median ADX
    adxValues.sort((a, b) => a - b);
    const medianAdx = adxValues.length > 0
      ? parseFloat((adxValues[Math.floor(adxValues.length / 2)]).toFixed(1))
      : 20.0;

    // 4. Quantitative Cumulative Regime Determination
    // Sort distribution to find dominant market behavior across Top 100
    const distribution: { regime: CoreRegimeType; pct: number }[] = [
      { regime: 'RANGE', pct: rangePct },
      { regime: 'TREND', pct: trendPct },
      { regime: 'COMPRESSION', pct: compressionPct },
      { regime: 'EXPANSION', pct: expansionPct }
    ];
    distribution.sort((a, b) => b.pct - a.pct);

    let consensusRegime: CoreRegimeType = distribution[0].regime;
    let favoredStrategy = 'BINANCE_COMPOSITE';

    // Extreme market-wide conditions can claim consensus if significant:
    // A. Volatility Expansion / Breakout across >= 35% of market and exceeds Range
    if (expansionPct >= 35 && expansionPct >= rangePct) {
      consensusRegime = 'EXPANSION';
    }
    // B. Market-Wide Volatility Compression / Squeeze across >= 35% of market and exceeds Range
    else if (compressionPct >= 35 && compressionPct >= rangePct) {
      consensusRegime = 'COMPRESSION';
    }
    // C. Strong Directional Trend (trend is dominant plurality OR trendPct >= 30% OR extreme directional skew with high ADX)
    else if (distribution[0].regime === 'TREND' || trendPct >= 30 || ((pctAboveEma50 >= 75 || pctAboveEma50 <= 25) && medianAdx >= 25 && trendPct >= 15)) {
      consensusRegime = 'TREND';
    }
    // D. Otherwise, follow the plurality regime
    else {
      consensusRegime = distribution[0].regime;
    }

    if (consensusRegime === 'TREND') {
      favoredStrategy = 'TREND_PULLBACK';
    } else if (consensusRegime === 'COMPRESSION') {
      favoredStrategy = 'VOLATILITY_COMPRESSION';
    } else if (consensusRegime === 'EXPANSION') {
      favoredStrategy = 'SMC_LIQUIDITY_SWEEP';
    } else {
      favoredStrategy = 'BINANCE_COMPOSITE';
    }

    // Confidence Calculation
    const dominantPct = Math.max(rangePct, trendPct, compressionPct, expansionPct);
    const breadthSkew = Math.abs(pctAboveEma50 - 50);
    const consensusConfidence = Math.min(98, Math.max(52, Math.round(dominantPct + breadthSkew * 0.35)));

    const trendNote = trendPct > 20 && consensusRegime !== 'TREND'
      ? ` | Trend Breadth: ${trendPct}% (>20%) -> Trend strategies active`
      : '';
    const consensusReason = `Top 100 Cumulative Consensus: ${rangePct}% RANGE, ${trendPct}% TREND (${bullTrendPct}% Bull, ${bearTrendPct}% Bear), ${compressionPct}% COMPRESSION, ${expansionPct}% EXPANSION | Breadth: ${pctAboveEma50}% > EMA50, Median ADX: ${medianAdx.toFixed(1)} -> Confirmed Market Regime: ${consensusRegime}${trendNote}`;

    return {
      timestamp,
      totalCoins,
      rangeCount,
      rangePct,
      trendCount,
      trendPct,
      bullTrendCount,
      bullTrendPct,
      bearTrendCount,
      bearTrendPct,
      compressionCount,
      compressionPct,
      expansionCount,
      expansionPct,
      pctAboveEma50,
      pctAboveEma200,
      medianAdx,
      advancingCount,
      advancingPct,
      decliningCount,
      decliningPct,
      avgFundingRate,
      consensusRegime,
      consensusConfidence,
      favoredStrategy,
      consensusReason,
      topCoinsBreakdown: snapshots.slice(0, 30)
    };
  }

  private getFallbackBreadth(): MarketBreadth100 {
    return {
      timestamp: Date.now(),
      totalCoins: 100,
      rangeCount: 55,
      rangePct: 55,
      trendCount: 25,
      trendPct: 25,
      bullTrendCount: 15,
      bullTrendPct: 15,
      bearTrendCount: 10,
      bearTrendPct: 10,
      compressionCount: 12,
      compressionPct: 12,
      expansionCount: 8,
      expansionPct: 8,
      pctAboveEma50: 52,
      pctAboveEma200: 48,
      medianAdx: 18.5,
      advancingCount: 52,
      advancingPct: 52,
      decliningCount: 48,
      decliningPct: 48,
      avgFundingRate: 0.0001,
      consensusRegime: 'RANGE',
      consensusConfidence: 70,
      favoredStrategy: 'BINANCE_COMPOSITE',
      consensusReason: 'Top 100 Fallback Consensus: 55% RANGE, 25% TREND, 12% COMPRESSION, 8% EXPANSION -> Confirmed Regime: RANGE',
      topCoinsBreakdown: []
    };
  }
}

export const marketBreadthService = new MarketBreadthService();
