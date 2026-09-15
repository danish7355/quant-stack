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
  startTime?: number;
  endTime?: number;
  priorTrend?: 'UPTREND' | 'DOWNTREND' | 'NEUTRAL';
  priorImpulseMove?: number;
}

export function detectCompression(recentCandles: Candle[], atr: number, atrAvg: number, settings: AppSettings): CompressionState {
  const lookback = Math.max(16, settings.vcbCompressionLookback || 24);
  if (recentCandles.length < lookback + 20) {
    return { 
      isCompressed: false, 
      windowHigh: 0, 
      windowLow: 0, 
      microHigh: 0, 
      microLow: 0, 
      windowAvgRange: 0, 
      windowAvgVolume: 0, 
      compressionRatio: 0, 
      windowRangeToAtrRatio: 0, 
      isSqueezed: false, 
      squeezeCount: 0, 
      hasVolumeContraction: false, 
      hasPriorImpulse: false,
      priorTrend: 'NEUTRAL',
      priorImpulseMove: 0
    };
  }
  
  const window = recentCandles.slice(-lookback);
  const preBox = recentCandles.slice(-(lookback + 20), -lookback);
  
  // Upper boundary = highest high in compression
  const windowHigh = Math.max(...window.map(c => c.high));
  // Lower boundary = lowest low in compression
  const windowLow = Math.min(...window.map(c => c.low));
  const range = windowHigh - windowLow;

  const startTime = window[0]?.time;
  const endTime = window[window.length - 1]?.time;
  
  // Micro-structure (last 3 candles of the box)
  const microWindow = window.slice(-3);
  const microHigh = Math.max(...microWindow.map(c => c.high));
  const microLow = Math.min(...microWindow.map(c => c.low));
  
  const compressionRatio = atrAvg > 0 ? atr / atrAvg : 0;
  const windowRangeToAtrRatio = atr > 0 ? range / atr : 0;
  
  const winAvgVol = windowAvgVolume(window);
  const preBoxAvgVol = windowAvgVolume(preBox);
  
  // Volume Contraction - Box avg volume <= 85% of pre-box 20-bar avg
  const hasVolumeContraction = winAvgVol <= 0.85 * preBoxAvgVol;
  
  // Prior Impulse & Trend Context before compression
  const preBoxStartPrice = preBox[0].open;
  const preBoxEndPrice = preBox[preBox.length - 1].close;
  const preBoxNetMove = preBoxEndPrice - preBoxStartPrice;
  const priorImpulseMove = Math.abs(preBoxNetMove);
  const hasPriorImpulse = priorImpulseMove >= 1.2 * atr;

  // Higher highs & higher lows check in pre-box
  let higherHighsCount = 0;
  let lowerLowsCount = 0;
  for (let i = 1; i < preBox.length; i++) {
    if (preBox[i].high >= preBox[i - 1].high && preBox[i].low >= preBox[i - 1].low) higherHighsCount++;
    if (preBox[i].high <= preBox[i - 1].high && preBox[i].low <= preBox[i - 1].low) lowerLowsCount++;
  }

  let priorTrend: 'UPTREND' | 'DOWNTREND' | 'NEUTRAL' = 'NEUTRAL';
  if (preBoxNetMove > 0.4 * atr && higherHighsCount >= lowerLowsCount) {
    priorTrend = 'UPTREND';
  } else if (preBoxNetMove < -0.4 * atr && lowerLowsCount >= higherHighsCount) {
    priorTrend = 'DOWNTREND';
  } else if (preBoxNetMove > 0) {
    priorTrend = 'UPTREND';
  } else if (preBoxNetMove < 0) {
    priorTrend = 'DOWNTREND';
  }

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
  // Require persistent squeeze (at least 3 bars of BB inside KC)
  const isSqueezed = squeezeCount >= 3;

  const standardCompression = (compressionRatio <= (settings.vcbCompressionAtrRatioMax || 0.85)) && 
                              (windowRangeToAtrRatio <= (settings.vcbWindowAtrMult || 4.2));

  // Compression is active if genuine persistent squeeze or ATR compression with narrow range is present
  const isCompressed = (isSqueezed && (compressionRatio <= 0.92 || hasVolumeContraction)) || 
                       (standardCompression && (hasVolumeContraction || compressionRatio <= 0.80));

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
    hasPriorImpulse,
    startTime,
    endTime,
    priorTrend,
    priorImpulseMove
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
}

export function detectBreakout(candle: Candle, compression: CompressionState, atr: number, settings: AppSettings, recentCandles?: Candle[]): BreakoutMetrics | null {
  if (!compression.isCompressed) return null;

  const range = candle.high - candle.low;
  if (range <= 0) return null;
  const body = Math.abs(candle.close - candle.open);

  // Structural Breakout: Must decisively break and close OUTSIDE the consolidation boundary
  const brokeUp = candle.close > compression.windowHigh;
  const brokeDown = candle.close < compression.windowLow;
  
  if (!brokeUp && !brokeDown) return null;

  const direction: 'LONG' | 'SHORT' = brokeUp ? 'LONG' : 'SHORT';

  // Context:
  // Long: Prior trend: uptrend or at least higher highs/lows before compression.
  // Short: Prior trend: downtrend or lower highs/lows before compression.
  if (direction === 'LONG' && compression.priorTrend === 'DOWNTREND') {
    return null; // Invalidate long breakout if pre-compression context was an active downtrend
  }
  if (direction === 'SHORT' && compression.priorTrend === 'UPTREND') {
    return null; // Invalidate short breakdown if pre-compression context was an active uptrend
  }

  // Anti-Chasing: Breakout must be caught at inception (within 0.45 ATR of boundary)
  const extensionFromBoundary = direction === 'LONG' 
    ? (candle.close - compression.windowHigh) / (atr || 1) 
    : (compression.windowLow - candle.close) / (atr || 1);
  
  if (extensionFromBoundary > 0.45 || (atr > 0 && range > 2.2 * atr)) {
    return null; // Reject late/exhausted moves
  }

  // Directional Conviction & Anti-Wick Filtering
  if (direction === 'LONG') {
    if (candle.close <= candle.open) return null; // Must be bullish candle
    const closeLocation = (candle.close - candle.low) / range;
    if (closeLocation < 0.70) return null; // Close must be in upper 30% of bar
    const upperWick = (candle.high - candle.close) / range;
    if (upperWick > 0.25) return null; // Reject heavy overhead rejection
  } else {
    if (candle.close >= candle.open) return null; // Must be bearish candle
    const closeLocation = (candle.high - candle.close) / range;
    if (closeLocation < 0.70) return null; // Close must be in lower 30% of bar
    const lowerWick = (candle.close - candle.low) / range;
    if (lowerWick > 0.25) return null; // Reject heavy bottom rejection
  }

  // Candle Body Conviction: Solid body required (at least 45% of total candle range)
  const bodyDominance = body / range;
  if (bodyDominance < 0.45) {
    return null;
  }

  // Relative Volume (RVOL) & Volume Expansion Confirmation
  let rvol = 1.0;
  if (recentCandles && recentCandles.length >= 20) {
    const vol20Avg = recentCandles.slice(-20).reduce((s, c) => s + c.volume, 0) / 20;
    rvol = vol20Avg > 0 ? candle.volume / vol20Avg : 1.0;
  } else if (compression.windowAvgVolume > 0) {
    rvol = candle.volume / compression.windowAvgVolume;
  }

  const volumeExpansion = compression.windowAvgVolume > 0 ? candle.volume / compression.windowAvgVolume : 1.0;

  // Strict Institutional Volume: Must have high volume (RVOL >= 1.35 or 50%+ expansion over box)
  const hasVolumeConfirmation = rvol >= 1.35 || volumeExpansion >= 1.50;
  if (!hasVolumeConfirmation) {
    return null; // Reject low-volume fakeouts
  }

  const clv = (candle.close - candle.low) / range;
  const closeStrength = direction === 'LONG' ? (candle.close - candle.low) / range : (candle.high - candle.close) / range;
  const isPreBlastCoil = extensionFromBoundary <= 0.25 && (compression.isSqueezed || false);

  return {
    direction,
    boundaryBreakAtr: extensionFromBoundary,
    rangeExpansion: compression.windowAvgRange > 0 ? range / compression.windowAvgRange : 1.0,
    volumeExpansion,
    rvol,
    closeStrength,
    closeLocationValue: clv,
    bodyDominance,
    isSniper: extensionFromBoundary <= 0.20,
    isPreBlastCoil,
    isOverextended: false,
    isWickRejection: false
  };
}

export function isFakeBreakout(nextCandle: Candle, direction: 'LONG' | 'SHORT', compression: CompressionState): boolean {
  return direction === 'LONG'
    ? nextCandle.close < compression.windowHigh
    : nextCandle.close > compression.windowLow;
}

export function scoreBreakout(m: BreakoutMetrics, settings: AppSettings): number {
  if (m.direction === null || m.isOverextended || m.isWickRejection) return 0;
  
  // Base score for pristine setup + volume confirmation
  let score = 84;
  
  // Inception / Micro-Box sniper bonus
  if (m.isPreBlastCoil || m.isSniper) {
    score += 6;
  }

  // Volume Surge bonus (Quality indicator)
  if (m.rvol >= 1.8) {
    score += 8;
  } else if (m.rvol >= 1.4) {
    score += 4;
  }

  // Strong close in extreme 25% of candle
  if ((m.direction === 'LONG' && m.closeLocationValue >= 0.75) || (m.direction === 'SHORT' && m.closeLocationValue <= 0.25)) {
    score += 4;
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
    // Bullish HTF: Price must be above HTF EMA 50 or EMA 200
    const isBullish = currentHtfPrice >= htfEma50 || currentHtfPrice >= htfEma200;
    if (!isBullish) {
      return { isAligned: false, reason: `1H Trend Bearish: Price ($${currentHtfPrice}) is below 1H EMA 50 ($${htfEma50.toFixed(2)}) & 200`, penalty: -35 };
    }
    return { isAligned: true, reason: '1H Trend Bullish: Price above 1H EMAs', penalty: 0 };
  } else {
    // Bearish HTF: Price must be below HTF EMA 50 or EMA 200
    const isBearish = currentHtfPrice <= htfEma50 || currentHtfPrice <= htfEma200;
    if (!isBearish) {
      return { isAligned: false, reason: `1H Trend Bullish: Price ($${currentHtfPrice}) is above 1H EMA 50 ($${htfEma50.toFixed(2)}) & 200`, penalty: -35 };
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
  const price = entryPrice || (recentCandles && recentCandles.length > 0 ? recentCandles[recentCandles.length - 1].close : 0);
  // Buffer can be 0.1–0.2% or ~0.5×ATR
  const defaultBufferAtr = settings.vcbSlBufferAtrMult ?? 0.5;
  const buffer = Math.max(
    (price || compression.windowHigh || 1) * 0.0015, // 0.15% cushion
    defaultBufferAtr * atr
  );

  const breakoutCandle = recentCandles && recentCandles.length > 0 ? recentCandles[recentCandles.length - 1] : null;

  if (direction === 'LONG') {
    // L_comp = lowest low inside compression
    const lComp = compression.windowLow;
    // L_break = low of the breakout candle
    const lBreak = breakoutCandle ? breakoutCandle.low : lComp;
    
    // SL_long = min(L_comp, L_break) - buffer
    let sl = Math.min(lComp, lBreak) - buffer;

    // Invalidation safeguard: ensure SL is below entry price
    if (price > 0 && sl >= price) {
      sl = price * (1 - 0.0035);
    }
    return Math.max(0.0001, sl);
  } else {
    // H_comp = highest high inside compression
    const hComp = compression.windowHigh;
    // H_break = high of the breakdown candle
    const hBreak = breakoutCandle ? breakoutCandle.high : hComp;

    // SL_short = max(H_comp, H_break) + buffer
    let sl = Math.max(hComp, hBreak) + buffer;

    // Invalidation safeguard: ensure SL is above entry price
    if (price > 0 && sl <= price) {
      sl = price * (1 + 0.0035);
    }
    return sl;
  }
}

/**
 * Calculates VCB Targets according to user specification:
 * 1. R-multiple target:
 *    R = Entry_long - SL_long (or SL_short - Entry_short)
 *    TP1 = Entry ± 2R
 *    TP2 = Entry ± 3R (or trail beyond)
 * 2. Structure-based target:
 *    Next clear resistance / prior swing high above breakout (or support / swing low for short)
 *    Or measured move equal to prior impulsive leg before compression.
 */
export function calculateVcbTargets(
  entryPrice: number,
  direction: 'LONG' | 'SHORT',
  risk: number,
  compression: CompressionState,
  structureLevel?: number
): { tp1: number; tp2: number; tp3: number } {
  // Measured move equal to prior impulsive leg before compression (or compression box width)
  const measuredMove = compression.priorImpulseMove && compression.priorImpulseMove > 0
    ? compression.priorImpulseMove
    : (compression.windowHigh - compression.windowLow);

  if (direction === 'LONG') {
    // TP1_long = Entry_long + 2R
    const tp1 = entryPrice + 2.0 * risk;

    // TP2_long = Entry_long + 3R or structure-based (next resistance / prior swing high / measured move)
    let tp2 = entryPrice + 3.0 * risk;
    if (structureLevel && structureLevel > entryPrice && structureLevel >= tp1) {
      tp2 = structureLevel;
    } else if (entryPrice + measuredMove > tp1) {
      tp2 = Math.max(tp2, entryPrice + measuredMove);
    }

    // TP3_long = Runner / Trail beyond (4.5R or extended impulse leg)
    const tp3 = entryPrice + Math.max(4.5 * risk, measuredMove * 1.5);
    return { tp1, tp2, tp3 };
  } else {
    // TP1_short = Entry_short - 2R
    const tp1 = Math.max(0.0001, entryPrice - 2.0 * risk);

    // TP2_short = Entry_short - 3R or structure-based (next support / prior swing low / measured move)
    let tp2 = Math.max(0.0001, entryPrice - 3.0 * risk);
    if (structureLevel && structureLevel < entryPrice && structureLevel <= tp1) {
      tp2 = structureLevel;
    } else if (entryPrice - measuredMove < tp1 && entryPrice - measuredMove > 0) {
      tp2 = Math.min(tp2, entryPrice - measuredMove);
    }

    // TP3_short = Runner / Trail beyond (4.5R or extended impulse leg)
    const tp3 = Math.max(0.0001, entryPrice - Math.max(4.5 * risk, measuredMove * 1.5));
    return { tp1, tp2, tp3 };
  }
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
  spec?: Partial<ProductSpec> & { maxAllocation?: number },
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

  const MAX_ACCOUNT_EXPOSURE_MULTIPLIER = 5;
  const MIN_STOP_DISTANCE_PCT = 0.005;

  const effectiveStopDistancePct = Math.max(stopDistancePct, MIN_STOP_DISTANCE_PCT);
  let desiredNotional = (accountEquity * riskPercent) / effectiveStopDistancePct;

  const maxNotional = accountEquity * MAX_ACCOUNT_EXPOSURE_MULTIPLIER;
  if (desiredNotional > maxNotional) {
    desiredNotional = maxNotional;
  }

  const maxAllocation = spec?.maxAllocation !== undefined && spec.maxAllocation > 0
    ? spec.maxAllocation
    : (accountEquity * 0.80);

  for (let lev = maxLev; lev >= 1; lev--) {
    const liqDistancePct = 1 / lev - mmr;
    if (liqDistancePct <= 0) continue;
    const liqPrice = direction === 'LONG' ? entryPrice * (1 - liqDistancePct) : entryPrice * (1 + liqDistancePct);
    const liqDistanceFromEntry = Math.abs(entryPrice - liqPrice) / entryPrice;

    if (liqDistanceFromEntry / stopDistancePct >= minLiqBuffer) {
      let contracts = Math.floor((desiredNotional / entryPrice) / contractVal);

      const maxContractsByAlloc = Math.floor((maxAllocation * lev) / (contractVal * entryPrice));
      if (contracts > maxContractsByAlloc) {
        contracts = maxContractsByAlloc;
      }

      if (contracts < 1) {
        return { contracts: 0, leverage: 0, liquidationPrice: 0, allocatedBalance: 0, rejected: true, reason: 'Position size exceeds allocation/exposure limit (rounds to 0 contracts).' };
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

