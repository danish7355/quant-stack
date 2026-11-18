import fetch from 'node-fetch';

export interface LiquidityFeatures {
  universalLiquidityGate: boolean;
  spreadPercent: number;
  depthImbalanceScore: number;
  persistenceScore: number;
  executedDeltaScore: number;
  absorptionScore: number;
  cancellationQualityScore: number;
  spreadAndSlippageScore: number;
  
  // Strategy specific mocked/inferred features
  absorptionConfirmed: boolean;
  reclaimConfirmed: boolean;
  breakoutVolumeConfirmed: boolean;
  spreadNormal: boolean;
}

export interface HeatmapGateResult {
  valid: boolean;
  reason: string;
  score: number;
  features: LiquidityFeatures;
}

export class HeatmapService {
  private depthCache = new Map<string, { timestamp: number, data: any }>();

  public async fetchDepth(symbol: string): Promise<{ bids: [string, string][], asks: [string, string][] } | null> {
    const cached = this.depthCache.get(symbol);
    const now = Date.now();
    if (cached && now - cached.timestamp < 3000) {
      return cached.data;
    }
    
    try {
      // @ts-ignore
      const url = `https://fapi.binance.com/fapi/v1/depth?symbol=${symbol}&limit=50`;
      const response = await fetch(url);
      const data = await response.json() as { bids: [string, string][], asks: [string, string][] };
      if (data.bids && data.asks) {
        this.depthCache.set(symbol, { timestamp: now, data });
        return data;
      }
      return null;
    } catch (e) {
      console.error(`[HeatmapService] Error fetching depth for ${symbol}:`, e);
      return null;
    }
  }

  private calculateDepthVolume(bookSide: [string, string][], midPrice: number, maxPctAway: number): number {
    let vol = 0;
    for (const [p, q] of bookSide) {
      const price = parseFloat(p);
      const qty = parseFloat(q);
      const pctAway = Math.abs(price - midPrice) / midPrice;
      if (pctAway <= maxPctAway) {
        vol += qty * price; // Quote asset volume
      }
    }
    return vol;
  }

  public async analyzeLiquidity(
    symbol: string, 
    strategy: string, 
    direction: 'LONG' | 'SHORT', 
    klines: any[] // optional recent klines for volume/delta estimation
  ): Promise<HeatmapGateResult> {
    const depth = await this.fetchDepth(symbol);
    
    // Default features if depth fails
    const features: LiquidityFeatures = {
      universalLiquidityGate: false,
      spreadPercent: 999,
      depthImbalanceScore: 0,
      persistenceScore: 0,
      executedDeltaScore: 0,
      absorptionScore: 0,
      cancellationQualityScore: 0,
      spreadAndSlippageScore: 0,
      absorptionConfirmed: false,
      reclaimConfirmed: false,
      breakoutVolumeConfirmed: false,
      spreadNormal: false
    };

    if (!depth || !depth.bids || !depth.asks || depth.bids.length === 0 || depth.asks.length === 0) {
      return { valid: false, reason: "depth_fetch_failed", score: 0, features };
    }

    const bestBid = parseFloat(depth.bids[0][0]);
    const bestAsk = parseFloat(depth.asks[0][0]);
    const midPrice = (bestBid + bestAsk) / 2;
    const spreadPercent = ((bestAsk - bestBid) / midPrice) * 100;
    features.spreadPercent = spreadPercent;

    // Calculate depths at multiple levels (0.1%, 0.25%, 0.5%, 1.0%)
    const bidVol01 = this.calculateDepthVolume(depth.bids, midPrice, 0.001);
    const askVol01 = this.calculateDepthVolume(depth.asks, midPrice, 0.001);
    const bidVol05 = this.calculateDepthVolume(depth.bids, midPrice, 0.005);
    const askVol05 = this.calculateDepthVolume(depth.asks, midPrice, 0.005);
    const bidVol10 = this.calculateDepthVolume(depth.bids, midPrice, 0.01);
    const askVol10 = this.calculateDepthVolume(depth.asks, midPrice, 0.01);

    const totalBidVol = bidVol05;
    const totalAskVol = askVol05;
    const totalVol = totalBidVol + totalAskVol;

    let imbalance = 0;
    if (totalVol > 0) {
      imbalance = (totalBidVol - totalAskVol) / totalVol;
    }
    
    // Normalize to -100 to +100
    features.depthImbalanceScore = imbalance * 100;

    // Simulate order flow features based on klines (last 3 candles)
    if (klines && klines.length >= 3) {
      const recentKlines = klines.slice(-3);
      const totalVolume = recentKlines.reduce((acc, k) => acc + parseFloat(k.volume), 0);
      const lastCandle = recentKlines[recentKlines.length - 1];
      const prevCandle = recentKlines[recentKlines.length - 2];
      
      // Rough delta proxy: (close - open) / (high - low) * volume
      const range = lastCandle.high - lastCandle.low;
      const deltaProxy = range > 0 ? ((lastCandle.close - lastCandle.open) / range) : 0;
      features.executedDeltaScore = deltaProxy * 100;
      
      // Breakout volume confirmed
      const avgVol = totalVolume / 3;
      features.breakoutVolumeConfirmed = parseFloat(lastCandle.volume) > avgVol * 1.5;
      
      // Absorption proxy: high volume but small body
      const bodyPct = Math.abs(lastCandle.close - lastCandle.open) / (range || 1);
      if (bodyPct < 0.3 && parseFloat(lastCandle.volume) > avgVol) {
        features.absorptionConfirmed = true;
        features.absorptionScore = direction === 'LONG' && lastCandle.close > (lastCandle.high+lastCandle.low)/2 ? 80 : 
                                   direction === 'SHORT' && lastCandle.close < (lastCandle.high+lastCandle.low)/2 ? -80 : 0;
      }
    }

    // Spread and Slippage Score
    features.spreadNormal = spreadPercent <= 0.15;
    if (spreadPercent <= 0.05) features.spreadAndSlippageScore = 100;
    else if (spreadPercent <= 0.15) features.spreadAndSlippageScore = 50;
    else if (spreadPercent <= 0.30) features.spreadAndSlippageScore = 0;
    else features.spreadAndSlippageScore = -100;

    // Universal Liquidity Gate
    // 1. Spread < 0.3%
    // 2. Minimum Depth Available (arbitrary $10k equivalent, assuming quote asset)
    const minDepth = 10000;
    features.universalLiquidityGate = spreadPercent <= 0.3 && (bidVol10 + askVol10) >= minDepth;

    // Calculate Heatmap Score
    const heatmapScore = 
      0.20 * features.depthImbalanceScore +
      0.20 * features.persistenceScore +
      0.20 * features.executedDeltaScore +
      0.15 * features.absorptionScore +
      0.15 * features.cancellationQualityScore +
      0.10 * features.spreadAndSlippageScore;
      
    // The score represents directional support (-100 = strong short, +100 = strong long)
    // Adjust score based on our requested direction so positive means "supports our trade"
    const directionalScore = direction === 'LONG' ? heatmapScore : -heatmapScore;

    if (!features.universalLiquidityGate) {
      return { valid: false, reason: "universal_gate_failed_poor_execution_conditions", score: directionalScore, features };
    }

    // Strategy-specific gates
    if (strategy === "LIQUIDITY_SWEEP") {
      const valid = directionalScore >= 25 && features.absorptionConfirmed;
      return {
        valid,
        reason: valid ? "liquidity_sweep_confirmed" : "heatmap_rejected_sweep_conditions",
        score: directionalScore,
        features
      };
    }

    if (strategy === "VOLATILITY_COMPRESSION") {
      const valid = directionalScore >= 10 && features.breakoutVolumeConfirmed && features.spreadNormal;
      return {
        valid,
        reason: valid ? "breakout_heatmap_confirmed" : "heatmap_rejected_breakout_conditions",
        score: directionalScore,
        features
      };
    }

    if (strategy === "TREND_PULLBACK") {
      const valid = directionalScore >= -20; // Don't reject unless severe opposition
      return {
        valid,
        reason: valid ? "ema_pullback_heatmap_ok" : "heatmap_rejected_severe_opposition",
        score: directionalScore,
        features
      };
    }
    
    if (strategy === "BINANCE_COMPOSITE") { // Mean reversion
      const valid = directionalScore >= 10;
      return {
        valid,
        reason: valid ? "mean_reversion_heatmap_ok" : "heatmap_rejected_mean_reversion_conditions",
        score: directionalScore,
        features
      };
    }

    // Default Gate
    const valid = directionalScore >= -10;
    return {
      valid,
      reason: valid ? "default_heatmap_ok" : "heatmap_rejected_default_conditions",
      score: directionalScore,
      features
    };
  }
}

export const heatmapService = new HeatmapService();
