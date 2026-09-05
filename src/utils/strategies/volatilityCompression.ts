import { AppSettings } from '../../types';

export interface Candle {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  time: number;
}

export function calculateEMA(closes: number[], period: number): number[] {
  if (!closes.length) return [];
  const k = 2 / (period + 1);
  const ema: number[] = [closes[0]];
  for (let i = 1; i < closes.length; i++) {
    ema.push(closes[i] * k + ema[i - 1] * (1 - k));
  }
  return ema;
}

export function calculateATR(candles: Candle[], period: number): number[] {
  if (candles.length < period) return [];
  const tr = candles.map((c, i) => {
    if (i === 0) return c.high - c.low;
    const pc = candles[i - 1].close;
    return Math.max(c.high - c.low, Math.abs(c.high - pc), Math.abs(c.low - pc));
  });
  const firstAtr = tr.slice(0, period).reduce((a, b) => a + b, 0) / period;
  const atr: number[] = [firstAtr];
  for (let i = period; i < tr.length; i++) {
    atr.push((atr[atr.length - 1] * (period - 1) + tr[i]) / period);
  }
  return atr;
}

export function calculateBollingerBands(closes: number[], period: number = 20, mult: number = 2.0): { upper: number[]; middle: number[]; lower: number[] } {
  if (closes.length < period) return { upper: [], middle: [], lower: [] };
  const upper: number[] = [];
  const middle: number[] = [];
  const lower: number[] = [];

  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) {
      middle.push(closes[i]);
      upper.push(closes[i]);
      lower.push(closes[i]);
      continue;
    }
    const slice = closes.slice(i - period + 1, i + 1);
    const mean = slice.reduce((a, b) => a + b, 0) / period;
    const variance = slice.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / period;
    const stdDev = Math.sqrt(variance);

    middle.push(mean);
    upper.push(mean + mult * stdDev);
    lower.push(mean - mult * stdDev);
  }
  return { upper, middle, lower };
}

export function calculateKeltnerChannels(candles: Candle[], period: number = 20, atrMult: number = 1.5): { upper: number[]; middle: number[]; lower: number[] } {
  const closes = candles.map(c => c.close);
  const ema = calculateEMA(closes, period);
  const atr = calculateATR(candles, period);
  const upper: number[] = [];
  const lower: number[] = [];

  for (let i = 0; i < candles.length; i++) {
    const e = ema[i] || closes[i];
    const a = atr[i] || (candles[i].high - candles[i].low);
    upper.push(e + atrMult * a);
    lower.push(e - atrMult * a);
  }
  return { upper, middle: ema, lower };
}

function windowAvgRange(candles: Candle[]): number {
  if (!candles.length) return 0;
  return candles.reduce((s, c) => s + (c.high - c.low), 0) / candles.length;
}

function windowAvgVolume(candles: Candle[]): number {
  if (!candles.length) return 0;
  return candles.reduce((s, c) => s + c.volume, 0) / candles.length;
}

export interface CompressionState {
  isCompressed: boolean;
  windowHigh: number;
  windowLow: number;
  microHigh: number;
  microLow: number;
  windowAvgRange: number;
  windowAvgVolume: number;
  compressionRatio: number;
  windowRangeToAtrRatio: number;
  isSqueezed?: boolean;
  squeezeCount?: number;
  hasVolumeContraction?: boolean;
  hasPriorImpulse?: boolean;
}

export function detectCompression(recentCandles: Candle[], atr: number, atrAvg: number, settings: AppSettings): CompressionState {
  const lookback = settings.vcbCompressionLookback || 10;
  if (recentCandles.length < lookback + 20) {
    return { isCompressed: false, windowHigh: 0, windowLow: 0, microHigh: 0, microLow: 0, windowAvgRange: 0, windowAvgVolume: 0, compressionRatio: 0, windowRangeToAtrRatio: 0, isSqueezed: false, squeezeCount: 0, hasVolumeContraction: false, hasPriorImpulse: false };
  }
  
  const window = recentCandles.slice(-lookback);
  const preBox = recentCandles.slice(-(lookback + 20), -lookback);
  
  const windowHigh = Math.max(...window.map(c => c.high));
  const windowLow = Math.min(...window.map(c => c.low));
  const range = windowHigh - windowLow;
  
  // Micro-structure (last 3 candles of the box) for sniper entries
  const microWindow = window.slice(-3);
  const microHigh = Math.max(...microWindow.map(c => c.high));
  const microLow = Math.min(...microWindow.map(c => c.low));
  
  const compressionRatio = atrAvg > 0 ? atr / atrAvg : 0;
  const windowRangeToAtrRatio = atr > 0 ? range / atr : 0;
  
  const winAvgVol = windowAvgVolume(window);
  const preBoxAvgVol = windowAvgVolume(preBox);
  
  // Volume Contraction - Box avg volume <= 85% of pre-box 20-bar avg
  const hasVolumeContraction = winAvgVol <= 0.85 * preBoxAvgVol;
  
  // Prior Impulse - directional move in 20 bars before the box
  const hasPriorImpulse = Math.abs(preBox[preBox.length - 1].close - preBox[0].open) >= 1.5 * atr;

  // TTM Squeeze Detection (Bollinger Bands inside Keltner Channels)
  const closes = recentCandles.map(c => c.close);
  const bb = calculateBollingerBands(closes, 20, 2.0);
  const kc = calculateKeltnerChannels(recentCandles, 20, 1.5);
  
  let squeezeCount = 0;
  const startIndex = recentCandles.length - lookback;
  for (let i = startIndex; i < recentCandles.length; i++) {
    if (i >= 0 && bb.upper[i] !== undefined && kc.upper[i] !== undefined) {
      // Squeeze: Bollinger Band upper is inside Keltner Band upper AND lower is inside lower
      if (bb.upper[i] <= kc.upper[i] && bb.lower[i] >= kc.lower[i]) {
        squeezeCount++;
      }
    }
  }
  const isSqueezed = squeezeCount >= 1; // Active squeeze detected in recent window

  const standardCompression = (compressionRatio <= (settings.vcbCompressionAtrRatioMax || 0.85)) && 
                              (windowRangeToAtrRatio <= (settings.vcbWindowAtrMult || 4.2));

  // Compression is active if standard ATR criteria or TTM squeeze or volume-drying consolidation is present
  const isCompressed = standardCompression || isSqueezed || (compressionRatio <= 0.90 && hasVolumeContraction);

  return {
    isCompressed,
    windowHigh,
    windowLow,
    microHigh,
    microLow,
    windowAvgRange: windowAvgRange(window),
    windowAvgVolume: winAvgVol,
    compressionRatio,
    windowRangeToAtrRatio,
    isSqueezed,
    squeezeCount,
    hasVolumeContraction,
    hasPriorImpulse
  };
}

export interface BreakoutMetrics {
  direction: 'LONG' | 'SHORT' | null;
  boundaryBreakAtr: number;
  rangeExpansion: number;
  volumeExpansion: number;
  rvol: number;
  closeStrength: number;
  closeLocationValue: number;
  bodyDominance: number;
  isSniper: boolean;
  isPreBlastCoil: boolean;
  isOverextended: boolean;
  isWickRejection: boolean;
  // Price Action Enhanced Metrics
  hasSpringOrUpthrust?: boolean;
  hasPreBreakoutBuildup?: boolean;
  isMarubozuBreakout?: boolean;
  paQualityScore?: number;
  paReason?: string;
}

export function detectBreakout(candle: Candle, compression: CompressionState, atr: number, settings: AppSettings, recentCandles?: Candle[]): BreakoutMetrics | null {
  if (!compression.isCompressed) return null;

  const boundaryBufferAtr = (settings.vcbBoundaryBufferAtr ?? 0.25) * 0.3; // Tight threshold for early inception trigger
  const range = candle.high - candle.low;
  
  // 1. Traditional macro-boundary break
  const brokeMacroUp = candle.close > compression.windowHigh + boundaryBufferAtr * atr;
  const brokeMacroDown = candle.close < compression.windowLow - boundaryBufferAtr * atr;
  
  // 2. Pre-Blast Sniper Inception: Coiling against the boundary or breaking the immediate 3-candle micro-structure
  const brokeMicroUp = (candle.close > compression.microHigh || candle.high >= compression.windowHigh) && candle.close > candle.open;
  const brokeMicroDown = (candle.close < compression.microLow || candle.low <= compression.windowLow) && candle.close < candle.open;

  const brokeUp = brokeMacroUp || brokeMicroUp;
  const brokeDown = brokeMacroDown || brokeMicroDown;
  
  if (!brokeUp && !brokeDown) return null;

  const direction = brokeUp ? 'LONG' : 'SHORT';
  const body = Math.abs(candle.close - candle.open);
  
  // 3. Anti-Chasing Filter: Do NOT enter in the middle or after the blast!
  // If price has already extended more than 0.50x ATR beyond the compression boundary, or candle range is already blown out > 2.2x ATR, reject!
  const extensionFromBoundary = direction === 'LONG' 
    ? (candle.close - compression.windowHigh) / atr 
    : (compression.windowLow - candle.close) / atr;
  const isOverextended = extensionFromBoundary > 0.50 || (atr > 0 && range > 2.2 * atr);

  if (isOverextended) {
    return null; // Reject late entries
  }

  // Close Location Value (CLV): Measures where the candle closed within its High-Low range (0 = at Low, 1 = at High)
  const clv = range > 0 ? (candle.close - candle.low) / range : 0.5;
  const closeStrength = range > 0 ? (direction === 'LONG' ? (candle.close - candle.low) / range : (candle.high - candle.close) / range) : 0;
  
  // Reject wick reversals (e.g. Long breakout having a giant upper rejection wick > 35% of range)
  const upperWick = range > 0 ? (candle.high - Math.max(candle.open, candle.close)) / range : 0;
  const lowerWick = range > 0 ? (Math.min(candle.open, candle.close) - candle.low) / range : 0;
  const isWickRejection = direction === 'LONG' ? upperWick > 0.35 : lowerWick > 0.35;

  if (isWickRejection) {
    return null;
  }

  // Price Action Anti-Indecision Filter: A valid breakout or pre-blast coil requires body conviction (at least 35% body).
  // If the candle is >65% wick (doji / spinning top), reject it as an unreliable fakeout.
  const bodyDominance = range > 0 ? body / range : 0;
  if (bodyDominance < 0.35) {
    return null;
  }

  // Price Action Institutional Marubozu / Solid Body Check: Body >= 60% with closing wick <= 15%
  const closingWick = direction === 'LONG' ? upperWick : lowerWick;
  const isMarubozuBreakout = bodyDominance >= 0.60 && closingWick <= 0.15;

  // Price Action Wyckoff Spring / Upthrust Check: Sweep of the opposite side of the range within the last 10 candles
  let hasSpringOrUpthrust = false;
  let springReason = '';
  if (recentCandles && recentCandles.length >= 6) {
    const boxLookback = recentCandles.slice(-10, -1);
    if (direction === 'LONG') {
      const springCandle = boxLookback.find(c => c.low < compression.windowLow && c.close >= compression.windowLow);
      if (springCandle) {
        hasSpringOrUpthrust = true;
        springReason = 'Spring (Low Sweep)';
      }
    } else if (direction === 'SHORT') {
      const upthrustCandle = boxLookback.find(c => c.high > compression.windowHigh && c.close <= compression.windowHigh);
      if (upthrustCandle) {
        hasSpringOrUpthrust = true;
        springReason = 'Upthrust (High Sweep)';
      }
    }
  }

  // Price Action Pre-Breakout Buildup Check: Higher Lows (for LONG) or Lower Highs (for SHORT) coiling at boundary
  let hasPreBreakoutBuildup = false;
  let buildupReason = '';
  if (recentCandles && recentCandles.length >= 5) {
    const preCandles = recentCandles.slice(-5, -1);
    const boxMid = (compression.windowHigh + compression.windowLow) / 2;
    if (direction === 'LONG') {
      const lows = preCandles.map(c => c.low);
      const higherLows = lows.length >= 3 && lows[lows.length - 1] >= lows[lows.length - 2] && lows[lows.length - 2] >= lows[0];
      const holdingUpperHalf = preCandles.filter(c => c.close >= boxMid * 0.998).length >= 3;
      if (higherLows || holdingUpperHalf) {
        hasPreBreakoutBuildup = true;
        buildupReason = 'Bullish Buildup';
      }
    } else if (direction === 'SHORT') {
      const highs = preCandles.map(c => c.high);
      const lowerHighs = highs.length >= 3 && highs[highs.length - 1] <= highs[highs.length - 2] && highs[highs.length - 2] <= highs[0];
      const holdingLowerHalf = preCandles.filter(c => c.close <= boxMid * 1.002).length >= 3;
      if (lowerHighs || holdingLowerHalf) {
        hasPreBreakoutBuildup = true;
        buildupReason = 'Bearish Buildup';
      }
    }
  }

  // Combine Price Action Tags
  const paParts: string[] = [];
  let paQualityScore = 0;
  if (hasSpringOrUpthrust) {
    paParts.push(springReason);
    paQualityScore += 15;
  }
  if (hasPreBreakoutBuildup) {
    paParts.push(buildupReason);
    paQualityScore += 10;
  }
  if (isMarubozuBreakout) {
    paParts.push('Marubozu Close');
    paQualityScore += 10;
  }
  const paReason = paParts.join(' + ');

  // Relative Volume (RVOL) vs 20-period average volume
  let rvol = 1.0;
  if (recentCandles && recentCandles.length >= 20) {
    const vol20Avg = recentCandles.slice(-20).reduce((s, c) => s + c.volume, 0) / 20;
    rvol = vol20Avg > 0 ? candle.volume / vol20Avg : 1.0;
  } else if (compression.windowAvgVolume > 0) {
    rvol = candle.volume / compression.windowAvgVolume;
  }

  const isSniper = (brokeMicroUp && !brokeMacroUp) || (brokeMicroDown && !brokeMacroDown);
  const isPreBlastCoil = extensionFromBoundary <= 0.25 && (isSniper || compression.isSqueezed);

  return {
    direction,
    boundaryBreakAtr: extensionFromBoundary,
    rangeExpansion: compression.windowAvgRange > 0 ? range / compression.windowAvgRange : 0,
    volumeExpansion: compression.windowAvgVolume > 0 ? candle.volume / compression.windowAvgVolume : 0,
    rvol,
    closeStrength,
    closeLocationValue: clv,
    bodyDominance,
    isSniper,
    isPreBlastCoil,
    isOverextended: false,
    isWickRejection: false,
    hasSpringOrUpthrust,
    hasPreBreakoutBuildup,
    isMarubozuBreakout,
    paQualityScore,
    paReason
  };
}

export function isFakeBreakout(nextCandle: Candle, direction: 'LONG' | 'SHORT', compression: CompressionState): boolean {
  return direction === 'LONG'
    ? nextCandle.close < compression.windowHigh
    : nextCandle.close > compression.windowLow;
}

export function scoreBreakout(m: BreakoutMetrics, settings: AppSettings): number {
  if (m.direction === null || m.isOverextended || m.isWickRejection) return 0;
  
  const rangeExpMin = settings.vcbRangeExpansionMin ?? 1.4;
  const volExpMin = settings.vcbVolumeExpansionMin ?? 1.3;
  const closeStrMin = settings.vcbCloseStrengthMin ?? 0.60;

  const excess = (v: number, min: number) => Math.min(v / min, 2);
  const avgExcess = (excess(m.rangeExpansion, rangeExpMin) + excess(m.volumeExpansion, volExpMin) + excess(m.closeStrength, closeStrMin)) / 3;
  
  let score = Math.round(Math.max(35, Math.min(100, 30 + avgExcess * 50)));
  
  // Bonus for perfect pre-blast timing (catching at inception rather than after expansion)
  if (m.isPreBlastCoil) {
    score += 20;
  }

  // Close Location Ratio Bonus: Close in top 25% for Longs (CLV >= 0.75) or bottom 25% for Shorts (CLV <= 0.25)
  if ((m.direction === 'LONG' && m.closeLocationValue >= 0.75) || (m.direction === 'SHORT' && m.closeLocationValue <= 0.25)) {
    score = Math.min(100, score + 15);
  }

  // RVOL > 2.0x institutional surge bonus
  if (m.rvol >= 2.0) {
    score = Math.min(100, score + 15);
  } else if (m.rvol >= 1.3) {
    score = Math.min(100, score + 8);
  }
  
  // Micro-structure break sniper bonus
  if (m.isSniper) {
    score += 20;
  }

  // Body Dominance Bonus: Breakout candle body >= 50% of range
  if (m.bodyDominance >= 0.50) {
    score = Math.min(100, score + 10);
  }

  // Price Action Setup Bonuses:
  // 1. Wyckoff Spring / Upthrust (Opposite Liquidity Grab before breakout)
  if (m.hasSpringOrUpthrust) {
    score = Math.min(100, score + 15);
  }

  // 2. Pre-Breakout Buildup (Higher Lows / Lower Highs absorbing at boundary)
  if (m.hasPreBreakoutBuildup) {
    score = Math.min(100, score + 10);
  }

  // 3. Marubozu Solid Body Conviction Close (Body >= 60% with tiny closing wick)
  if (m.isMarubozuBreakout) {
    score = Math.min(100, score + 10);
  }
  
  return Math.min(100, score);
}

export function validateHigherTimeframeTrend(
  htfCandles: Candle[],
  direction: 'LONG' | 'SHORT'
): { isAligned: boolean; reason: string; penalty: number } {
  if (!htfCandles || htfCandles.length < 50) {
    return { isAligned: true, reason: 'HTF data insufficient; neutral alignment.', penalty: 0 };
  }

  const closes = htfCandles.map(c => c.close);
  const ema50Series = calculateEMA(closes, 50);
  const ema200Series = calculateEMA(closes, 200);

  const currentHtfPrice = closes[closes.length - 1];
  const htfEma50 = ema50Series[ema50Series.length - 1];
  const htfEma200 = ema200Series[ema200Series.length - 1] || htfEma50;

  if (direction === 'LONG') {
    // Bullish HTF: Price MUST be above BOTH HTF EMA 50 AND EMA 200 for VCB (Very Strict)
    const isBullish = currentHtfPrice >= htfEma50 && currentHtfPrice >= htfEma200;
    if (!isBullish) {
      return { isAligned: false, reason: `1H Trend Bearish/Mixed: Price ($${currentHtfPrice}) must be above BOTH 1H EMA 50 ($${htfEma50.toFixed(2)}) & 200`, penalty: -100 };
    }
    return { isAligned: true, reason: '1H Trend Bullish: Price above 1H EMAs', penalty: 0 };
  } else {
    // Bearish HTF: Price MUST be below BOTH HTF EMA 50 AND EMA 200 for VCB (Very Strict)
    const isBearish = currentHtfPrice <= htfEma50 && currentHtfPrice <= htfEma200;
    if (!isBearish) {
      return { isAligned: false, reason: `1H Trend Bullish/Mixed: Price ($${currentHtfPrice}) must be below BOTH 1H EMA 50 ($${htfEma50.toFixed(2)}) & 200`, penalty: -100 };
    }
    return { isAligned: true, reason: '1H Trend Bearish: Price below 1H EMAs', penalty: 0 };
  }
}

export function applyTrendAndMomentumBonus(
  score: number,
  direction: 'LONG' | 'SHORT',
  ema9: number,
  ema21: number,
  ema50: number,
  rsi: number,
  settings: AppSettings
): number {
  if (score === 0) return 0;
  
  let bonus = 0;
  
  // Trend Alignment (e.g. EMA9 > EMA21 > EMA50)
  const trendAligned = direction === 'LONG' 
    ? (ema9 > ema21 && ema21 > ema50) 
    : (ema9 < ema21 && ema21 < ema50);
  
  if (trendAligned) {
    bonus += 15; // Strong trend alignment bonus
  }

  // Momentum Confirmation
  const momentumAligned = direction === 'LONG'
    ? (rsi > 45 && rsi < 70)
    : (rsi < 55 && rsi > 30);
    
  if (momentumAligned) {
    bonus += 10; // Momentum bonus
  }
  
  // Penalize Counter-Trend trades
  const fightingTrend = direction === 'LONG'
    ? (ema21 < ema50)
    : (ema21 > ema50);
    
  if (fightingTrend) {
    score -= 25; // Critical: Penalize VCB breakouts against the primary trend
  }

  return Math.min(100, Math.max(0, score + bonus));
}

export function determineStopLoss(
  direction: 'LONG' | 'SHORT', 
  compression: CompressionState, 
  atr: number, 
  settings: AppSettings,
  recentCandles?: Candle[],
  entryPrice?: number
): number {
  const defaultBufferAtr = settings.vcbSlBufferAtrMult ?? 0.35;
  
  // 1. If recent candles are provided, anchor tightly to the lowest/highest wick of the local coiling base (last 3-5 candles)
  if (recentCandles && recentCandles.length >= 3) {
    const baseCandles = recentCandles.slice(-5);
    
    if (direction === 'LONG') {
      const lowestWick = Math.min(...baseCandles.map(c => c.low));
      // Protective cushion: 0.35 * ATR or 0.40% of entry price to avoid stop hunts
      const buffer = Math.max(0.35 * atr, (entryPrice || lowestWick) * 0.004);
      let sl = lowestWick - buffer;
      
      // Enforce minimum safety distance (0.60% from entry) to prevent spread/slippage noise from instant-triggering
      if (entryPrice && (entryPrice - sl) / entryPrice < 0.006) {
        sl = entryPrice * (1 - 0.006);
      }
      return Math.max(0.0001, sl);
    } else {
      const highestWick = Math.max(...baseCandles.map(c => c.high));
      const buffer = Math.max(0.35 * atr, (entryPrice || highestWick) * 0.004);
      let sl = highestWick + buffer;
      
      if (entryPrice && (sl - entryPrice) / entryPrice < 0.006) {
        sl = entryPrice * (1 + 0.006);
      }
      return sl;
    }
  }

  // Fallback to compression window low/high
  return direction === 'LONG'
    ? Math.max(0.0001, compression.windowLow - defaultBufferAtr * atr)
    : compression.windowHigh + defaultBufferAtr * atr;
}

export function calculateInitialTp(entryPrice: number, direction: 'LONG' | 'SHORT', atr: number, settings: AppSettings): number {
  return direction === 'LONG' 
    ? entryPrice + settings.vcbInitialTpAtrMult * atr 
    : Math.max(0.0001, entryPrice - settings.vcbInitialTpAtrMult * atr);
}

export function updateChandelierStop(trade: { direction: 'LONG' | 'SHORT'; extremeSinceEntry: number; stopPrice: number }, atr: number, settings: AppSettings): number {
  const candidate = trade.direction === 'LONG'
    ? trade.extremeSinceEntry - settings.vcbChandelierAtrMult * atr
    : trade.extremeSinceEntry + settings.vcbChandelierAtrMult * atr;
  return trade.direction === 'LONG' ? Math.max(trade.stopPrice, candidate) : Math.min(trade.stopPrice, candidate);
}

export function checkStall(barsOpen: number, unrealizedMoveInAtr: number, initialTpHit: boolean, settings: AppSettings): boolean {
  // only relevant before the initial TP — once it's hit, the chandelier trail is already doing its job
  return !initialTpHit && barsOpen >= settings.vcbStallCheckBar && unrealizedMoveInAtr < settings.vcbStallMinProgressAtr;
}

export interface ProductSpec {
  contractValue: number;
  maintenanceMarginRate: number;
  maxLeverage: number;
}

export interface SizeResult {
  contracts: number;
  leverage: number;
  liquidationPrice: number;
  allocatedBalance: number;
  rejected: boolean;
  reason?: string;
}

export function calculateSafePositionSize(
  accountEquity: number,
  entryPrice: number,
  stopPrice: number,
  direction: 'LONG' | 'SHORT',
  spec?: Partial<ProductSpec>,
  riskPercent: number = 0.01
): SizeResult {
  const stopDistancePct = Math.abs(entryPrice - stopPrice) / entryPrice;
  if (stopDistancePct === 0) {
    return { contracts: 0, leverage: 0, liquidationPrice: 0, allocatedBalance: 0, rejected: true, reason: 'Stop price identical to entry price.' };
  }

  const contractVal = spec?.contractValue || 1;
  const mmr = spec?.maintenanceMarginRate || 0.005; // 0.5% base MMR default
  const maxLev = spec?.maxLeverage || 20;
  const minLiqBuffer = 1.3;

  const desiredNotional = (accountEquity * riskPercent) / stopDistancePct;

  for (let lev = maxLev; lev >= 1; lev--) {
    const liqDistancePct = 1 / lev - mmr;
    if (liqDistancePct <= 0) continue;
    const liqPrice = direction === 'LONG' ? entryPrice * (1 - liqDistancePct) : entryPrice * (1 + liqDistancePct);
    const liqDistanceFromEntry = Math.abs(entryPrice - liqPrice) / entryPrice;

    if (liqDistanceFromEntry / stopDistancePct >= minLiqBuffer) {
      const contracts = Math.floor((desiredNotional / entryPrice) / contractVal);
      if (contracts < 1) {
        return { contracts: 0, leverage: 0, liquidationPrice: 0, allocatedBalance: 0, rejected: true, reason: 'Rounds to zero contracts at this risk %/equity.' };
      }
      const positionNotional = contracts * contractVal * entryPrice;
      const allocatedBalance = positionNotional / lev;
      return { contracts, leverage: lev, liquidationPrice: liqPrice, allocatedBalance, rejected: false };
    }
  }

  return { contracts: 0, leverage: 0, liquidationPrice: 0, allocatedBalance: 0, rejected: true, reason: 'Stop distance too wide to leverage safely.' };
}

export function pearsonCorrelation(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n === 0) return 0;
  const meanA = a.slice(0, n).reduce((x, y) => x + y, 0) / n;
  const meanB = b.slice(0, n).reduce((x, y) => x + y, 0) / n;
  let cov = 0, varA = 0, varB = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - meanA;
    const db = b[i] - meanB;
    cov += da * db;
    varA += da * da;
    varB += db * db;
  }
  const denom = Math.sqrt(varA * varB);
  return denom === 0 ? 0 : cov / denom;
}

export function correlationAllowsEntry(candidateReturns: number[], openPositions: { returns: number[] }[], max: number = 0.7): boolean {
  if (!candidateReturns.length || !openPositions.length) return true;
  return openPositions.every(p => Math.abs(pearsonCorrelation(candidateReturns, p.returns)) < max);
}

