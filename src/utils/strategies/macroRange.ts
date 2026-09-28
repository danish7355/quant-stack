// src/utils/strategies/macroRange.ts
// ─────────────────────────────────────────────────────────────────────────────
// MACRO_RANGE_BREAKOUT Strategy (Darvas Accumulation Box & Distribution Filter)
// ─────────────────────────────────────────────────────────────────────────────

export interface MacroRangeConfig {
  minBoxCandles?: number;      // 45
  maxBoxCandles?: number;      // 70
  minBoxWidthAtr?: number;     // 2.5
  maxBoxWidthAtr?: number;     // 18.0 (Distribution filter)
  minTouches?: number;         // 2
  volumeSurge?: number;        // 1.30
  slBufferAtr?: number;        // 0.30
}

export interface MacroRangeSignal {
  direction: 'LONG' | 'SHORT';
  entry?: number;
  score: number;
  atr: number;
  sl: number;
  tp1: number;
  tp2: number;
  tp3: number;
  boxHigh: number;
  boxLow: number;
  confidence?: number;
  setupType?: 'MACRO_RANGE_BREAKOUT';
  boxWidthAtr?: number;
}

export function detectMacroRangeBreakout(
  candles: any[],
  currentPriceOrHtf?: number | any[],
  atrOrConfig?: number | MacroRangeConfig
): MacroRangeSignal | null {
  if (!candles || candles.length < 45) return null;

  // Handle both signatures:
  // 1) (candles, currentPrice, atr)
  // 2) (candles, htfCandles, config)
  let currentPrice: number;
  let atr: number;
  let config: Required<MacroRangeConfig>;

  if (typeof currentPriceOrHtf === 'number') {
    currentPrice = currentPriceOrHtf;
    atr = typeof atrOrConfig === 'number' ? atrOrConfig : (currentPrice * 0.015);
    config = {
      minBoxCandles: 45,
      maxBoxCandles: 70,
      minBoxWidthAtr: 2.5,
      maxBoxWidthAtr: 18.0,
      minTouches: 2,
      volumeSurge: 1.30,
      slBufferAtr: 0.25
    };
  } else {
    currentPrice = candles[candles.length - 1]?.close || 0;
    const userCfg = (typeof atrOrConfig === 'object' && atrOrConfig !== null ? atrOrConfig : {}) as MacroRangeConfig;
    config = {
      minBoxCandles: userCfg.minBoxCandles ?? 45,
      maxBoxCandles: userCfg.maxBoxCandles ?? 70,
      minBoxWidthAtr: userCfg.minBoxWidthAtr ?? 2.5,
      maxBoxWidthAtr: userCfg.maxBoxWidthAtr ?? 18.0,
      minTouches: userCfg.minTouches ?? 2,
      volumeSurge: userCfg.volumeSurge ?? 1.30,
      slBufferAtr: userCfg.slBufferAtr ?? 0.30
    };

    // Calculate ATR(14)
    let trSum = 0;
    const atrLookback = Math.min(14, candles.length - 1);
    for (let i = candles.length - atrLookback; i < candles.length; i++) {
      const c = candles[i];
      const p = candles[i - 1];
      trSum += Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close));
    }
    atr = atrLookback > 0 ? trSum / atrLookback : (currentPrice * 0.015);
  }

  // Lookback for the macro box (45-70 candles)
  const lookback = Math.min(candles.length - 2, config.maxBoxCandles);
  const boxCandles = candles.slice(-lookback - 1, -1); // Exclude the current live candle
  if (boxCandles.length < config.minBoxCandles) return null;

  const prevCandle = boxCandles[boxCandles.length - 1];

  const boxHigh = Math.max(...boxCandles.map(c => c.high));
  const boxLow = Math.min(...boxCandles.map(c => c.low));
  const boxWidth = boxHigh - boxLow;

  // === DISTRIBUTION ZONE FILTER & MIN WIDTH FILTER ===
  const boxWidthAtr = atr > 0 ? boxWidth / atr : 4.0;
  if (boxWidthAtr > config.maxBoxWidthAtr) {
    return null; // Reject: Distribution zone, not accumulation
  }
  if (boxWidthAtr < config.minBoxWidthAtr) {
    return null; // Box too narrow
  }

  // === BOX TOUCH VALIDATION ===
  let upperTouches = 0;
  let lowerTouches = 0;
  for (const c of boxCandles) {
    if (c.high >= boxHigh - (0.25 * atr)) upperTouches++;
    if (c.low <= boxLow + (0.25 * atr)) lowerTouches++;
  }
  if (upperTouches < config.minTouches || lowerTouches < config.minTouches) {
    return null;
  }

  // === DETECT BREAKOUT ===
  let direction: 'LONG' | 'SHORT' | null = null;
  if (prevCandle.close <= boxHigh && currentPrice > boxHigh && currentPrice < boxHigh + (atr * 0.45)) {
    direction = 'LONG';
  } else if (prevCandle.close >= boxLow && currentPrice < boxLow && currentPrice > boxLow - (atr * 0.45)) {
    direction = 'SHORT';
  }

  if (!direction) return null;

  // === VOLUME SURGE CONFIRMATION ===
  const recent20 = candles.slice(-21, -1);
  const avgVol20 = recent20.reduce((s, c) => s + (c.volume || 0), 0) / (recent20.length || 1);
  const currentVol = candles[candles.length - 1]?.volume || prevCandle.volume || 0;

  if (avgVol20 > 0 && currentVol < avgVol20 * config.volumeSurge) {
    return null; // Reject low-volume fakeout
  }

  // === STOP LOSS PLACEMENT ===
  const localCandles = candles.slice(-15, -1);
  let localSwingExtreme = 0;

  if (direction === 'LONG') {
    localSwingExtreme = Math.min(...localCandles.map(c => c.low));
    localSwingExtreme = localSwingExtreme - (atr * config.slBufferAtr);
  } else {
    localSwingExtreme = Math.max(...localCandles.map(c => c.high));
    localSwingExtreme = localSwingExtreme + (atr * config.slBufferAtr);
  }

  // Inverted stop guard
  if ((direction === 'LONG' && localSwingExtreme >= currentPrice) || (direction === 'SHORT' && localSwingExtreme <= currentPrice)) {
    return null;
  }

  const risk = Math.abs(currentPrice - localSwingExtreme);
  if (risk <= 0) return null;

  const stopDistance = risk;
  const boxHeightProjection = boxWidth;

  return {
    direction,
    entry: currentPrice,
    score: 95,
    confidence: 0.71,
    setupType: 'MACRO_RANGE_BREAKOUT',
    atr,
    sl: localSwingExtreme,
    tp1: direction === 'LONG' ? currentPrice + (stopDistance * 1.5) : Math.max(0.0001, currentPrice - (stopDistance * 1.5)),
    tp2: direction === 'LONG' ? currentPrice + (stopDistance * 3.0) : Math.max(0.0001, currentPrice - (stopDistance * 3.0)),
    tp3: direction === 'LONG' ? currentPrice + Math.max(stopDistance * 5.0, boxHeightProjection) : Math.max(0.0001, currentPrice - Math.max(stopDistance * 5.0, boxHeightProjection)),
    boxHigh,
    boxLow,
    boxWidthAtr
  };
}
