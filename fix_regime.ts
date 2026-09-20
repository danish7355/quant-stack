import fs from 'fs';

let content = fs.readFileSync('src/utils/strategyBucket.ts', 'utf8');

// Replace types
content = content.replace(
  /export type TradableRegimeType = .*?;/g,
  ""
);

content = content.replace(
  /export type MarketRegimeType = .*?;/g,
  `export type MarketRegimeType = 
  | 'TRENDING_UP'
  | 'TRENDING_DOWN'
  | 'RANGING'
  | 'EXHAUSTION_UP'
  | 'EXHAUSTION_DOWN'
  | 'BREAKOUT_UP'
  | 'BREAKOUT_DOWN'
  | 'UNCLEAR'
  | 'DEAD_VOLUME'
  | 'PANIC';`
);

content = content.replace(
  /regimes: TradableRegimeType\[\];/g,
  `direction?: 'LONG' | 'SHORT';`
);

content = content.replace(
  /export const DEFAULT_STRATEGY_BUCKET: StrategyBucketItem\[\] = \[([\s\S]*?)\];/g,
  `export const DEFAULT_STRATEGY_BUCKET: StrategyBucketItem[] = [
    { id: 'TREND_PULLBACK', name: 'Trend EMA Pullback', description: '', priority: 1, direction: 'LONG', enabled: true },
    { id: 'SMC_LIQUIDITY_SWEEP', name: 'LSR', description: '', priority: 2, direction: 'LONG', enabled: true },
    { id: 'VOLATILITY_COMPRESSION', name: 'VCB Breakout', description: '', priority: 3, direction: 'LONG', enabled: true },
    { id: 'BINANCE_COMPOSITE', name: 'Range Mean Reversion', description: '', priority: 1, enabled: true },
    { id: 'DELTA_CLIMAX', name: 'Delta Climax', description: '', priority: 1, direction: 'SHORT', enabled: true },
    { id: 'EARLY_COIL_BREAKOUT', name: 'Early Coil Breakout', description: '', priority: 2, direction: 'LONG', enabled: true },
    { id: 'MACRO_RANGE_BREAKOUT', name: 'Macro Box', description: '', priority: 3, direction: 'LONG', enabled: true }
  ];

export const strategyBucketMap: Record<MarketRegimeType, StrategyBucketItem[]> = {
  TRENDING_UP: [
    { id: 'TREND_PULLBACK', name: 'Trend EMA Pullback', description: '', priority: 1, direction: 'LONG', enabled: true },
    { id: 'SMC_LIQUIDITY_SWEEP', name: 'LSR', description: '', priority: 2, direction: 'LONG', enabled: true },
    { id: 'VOLATILITY_COMPRESSION', name: 'VCB Breakout', description: '', priority: 3, direction: 'LONG', enabled: true }
  ],
  TRENDING_DOWN: [
    { id: 'TREND_PULLBACK', name: 'Trend EMA Pullback', description: '', priority: 1, direction: 'SHORT', enabled: true },
    { id: 'SMC_LIQUIDITY_SWEEP', name: 'LSR', description: '', priority: 2, direction: 'SHORT', enabled: true },
    { id: 'VOLATILITY_COMPRESSION', name: 'VCB Breakout', description: '', priority: 3, direction: 'SHORT', enabled: true }
  ],
  RANGING: [
    { id: 'BINANCE_COMPOSITE', name: 'Range Mean Reversion', description: '', priority: 1, enabled: true },
    { id: 'SMC_LIQUIDITY_SWEEP', name: 'LSR', description: '', priority: 2, enabled: true },
    { id: 'DELTA_CLIMAX', name: 'Delta Climax', description: '', priority: 3, enabled: true }
  ],
  EXHAUSTION_UP: [
    { id: 'DELTA_CLIMAX', name: 'Delta Climax', description: '', priority: 1, direction: 'SHORT', enabled: true },
    { id: 'SMC_LIQUIDITY_SWEEP', name: 'LSR', description: '', priority: 2, direction: 'SHORT', enabled: true }
  ],
  EXHAUSTION_DOWN: [
    { id: 'DELTA_CLIMAX', name: 'Delta Climax', description: '', priority: 1, direction: 'LONG', enabled: true },
    { id: 'SMC_LIQUIDITY_SWEEP', name: 'LSR', description: '', priority: 2, direction: 'LONG', enabled: true }
  ],
  BREAKOUT_UP: [
    { id: 'VOLATILITY_COMPRESSION', name: 'VCB Breakout', description: '', priority: 1, direction: 'LONG', enabled: true },
    { id: 'EARLY_COIL_BREAKOUT', name: 'Early Coil Breakout', description: '', priority: 2, direction: 'LONG', enabled: true },
    { id: 'MACRO_RANGE_BREAKOUT', name: 'Macro Box', description: '', priority: 3, direction: 'LONG', enabled: true }
  ],
  BREAKOUT_DOWN: [
    { id: 'VOLATILITY_COMPRESSION', name: 'VCB Breakout', description: '', priority: 1, direction: 'SHORT', enabled: true },
    { id: 'EARLY_COIL_BREAKOUT', name: 'Early Coil Breakout', description: '', priority: 2, direction: 'SHORT', enabled: true },
    { id: 'MACRO_RANGE_BREAKOUT', name: 'Macro Box', description: '', priority: 3, direction: 'SHORT', enabled: true }
  ],
  UNCLEAR: [],
  DEAD_VOLUME: [],
  PANIC: []
};`
);

content = content.replace(
  /export function getEligibleBucketStrategies\([\s\S]*?\}[\s\S]*?\}/g,
  `export function getEligibleBucketStrategies(
  bucket: StrategyBucketItem[],
  regime: MarketRegimeType,
  macroColor: 'GREEN' | 'AMBER' | 'RED' = 'GREEN'
): StrategyBucketItem[] {
  const mapped = strategyBucketMap[regime] || [];
  
  if (macroColor === 'AMBER') {
    return mapped.filter(m => m.priority === 1);
  }
  
  return mapped;
}`
);

// We need to rewrite classifyMarketRegime completely
const regexClassify = /export function classifyMarketRegime\([\s\S]*?\n\}\n/g;
const match = content.match(regexClassify);

const newClassify = `export function classifyMarketRegime(
  klines: any[],
  currentPrice: number,
  btcMacroColor: 'GREEN' | 'AMBER' | 'RED' = 'AMBER'
): RegimeClassificationResult {
  const dummyMetrics = {
    isTrending: false, isUptrend: false, isDowntrend: false, atr: 0, atrPct: 0,
    atrPercentile: 0, overextensionAtr: 0, isSqueezed: false, rsi: 50, adx: 0,
    pctFromSma200: 0, ema9: currentPrice, ema21: currentPrice, ema50: currentPrice,
    sma200: currentPrice, emaStackAligned: false, emaFlips: 0, avgWickRatio: 0, volumeRatio: 0
  };

  if (!klines || klines.length < 30) {
    return { regime: 'UNCLEAR', label: 'Insufficient Data', details: '', confidence: 0, macroColor: btcMacroColor, metrics: dummyMetrics };
  }

  const closes = klines.map((k) => k.close);
  const highs = klines.map((k) => k.high);
  const lows = klines.map((k) => k.low);
  const volumes = klines.map((k) => k.volume || 0);
  const lastIdx = closes.length - 1;

  const ema9Series = calculateEMA(closes, 9);
  const ema21Series = calculateEMA(closes, 21);
  const ema50Series = calculateEMA(closes, Math.min(50, closes.length));
  
  const ema9 = ema9Series[ema9Series.length - 1] || currentPrice;
  const ema21 = ema21Series[ema21Series.length - 1] || currentPrice;
  const ema50 = ema50Series[ema50Series.length - 1] || currentPrice;

  const smaPeriod = Math.min(200, closes.length);
  const smaSlice = closes.slice(-smaPeriod);
  const sma200 = smaSlice.reduce((a, b) => a + b, 0) / (smaSlice.length || 1);
  const pctFromSma200 = Math.abs(currentPrice - sma200) / (sma200 || 1);

  const atrSeries = calculateATR(highs, lows, closes, 14);
  const atr = atrSeries[atrSeries.length - 1] || currentPrice * 0.01;
  const atrPct = (atr / currentPrice) * 100;
  const atrPercentile = calculateAtrPercentile(atrSeries, atr, 200);

  const adxResult = calculateADX(highs, lows, closes, 14);
  const adx = adxResult.adx[adxResult.adx.length - 1] || 15;
  const plusDI = adxResult.plusDI[adxResult.plusDI.length - 1] || 0;
  const minusDI = adxResult.minusDI[adxResult.minusDI.length - 1] || 0;

  const rsiSeries = calculateRSI(closes, 14);
  const rsi = rsiSeries[rsiSeries.length - 1] || 50;
  
  const overextensionAtr = Math.abs(currentPrice - ema50) / (atr || 1);

  const recent20Closes = closes.slice(-20);
  const mean20 = recent20Closes.reduce((a, b) => a + b, 0) / (recent20Closes.length || 1);
  const variance = recent20Closes.reduce((acc, val) => acc + Math.pow(val - mean20, 2), 0) / (recent20Closes.length || 1);
  const stdDev20 = Math.sqrt(variance);
  const bbWidth = (stdDev20 * 2) / (mean20 || 1);
  const isSqueezed = bbWidth < 0.022 || (atrSeries.length >= 25 && atr < (atrSeries[atrSeries.length - 20] || atr) * 0.72);

  const emaFlips = calculateEmaFlips(ema9Series, ema21Series, 20);
  const avgWickRatio = calculateWickRatio(klines, 15);
  const smaCrossings = countSmaCrossings(closes, sma200, 30);

  const recent20Vol = volumes.slice(-20);
  const avgVol20 = recent20Vol.reduce((a, b) => a + b, 0) / (recent20Vol.length || 1);
  const currentVol = volumes[lastIdx] || 0;
  const volumeRatio = avgVol20 > 0 ? (currentVol / avgVol20) : 1;

  const isUptrend = ema9 > ema21 && ema21 > ema50 && currentPrice > ema21;
  const isDowntrend = ema9 < ema21 && ema21 < ema50 && currentPrice < ema21;
  const emaStackAligned = isUptrend || isDowntrend;
  
  dummyMetrics.isUptrend = isUptrend;
  dummyMetrics.isDowntrend = isDowntrend;
  dummyMetrics.atrPercentile = atrPercentile;
  dummyMetrics.atrPct = atrPct;
  dummyMetrics.volumeRatio = volumeRatio;

  // 1. PANIC
  if (atrPercentile > 0.84 || atrPct > 1.3 || btcMacroColor === 'RED') {
    return { regime: 'PANIC', label: 'Panic / Extreme Volatility', details: '', confidence: 100, macroColor: btcMacroColor, metrics: dummyMetrics };
  }

  // 2. DEAD_VOLUME
  if (avgVol20 > 0 && currentVol < (avgVol20 * 0.15)) {
    return { regime: 'DEAD_VOLUME', label: 'Dead Volume / Illiquid', details: '', confidence: 100, macroColor: btcMacroColor, metrics: dummyMetrics };
  }

  // 3. EXHAUSTION
  const lastRange = highs[lastIdx] - lows[lastIdx];
  const isClimaxCandle = lastRange > (1.8 * atr);
  if (isClimaxCandle || overextensionAtr >= 1.75) {
     const lastUpperWick = Math.max(0, highs[lastIdx] - Math.max(closes[lastIdx], klines[lastIdx].open));
     const lastLowerWick = Math.max(0, Math.min(closes[lastIdx], klines[lastIdx].open) - lows[lastIdx]);
     if (lastUpperWick > 0.4 * lastRange) return { regime: 'EXHAUSTION_UP', label: 'Exhaustion', details: '', confidence: 85, macroColor: btcMacroColor, metrics: dummyMetrics };
     if (lastLowerWick > 0.4 * lastRange) return { regime: 'EXHAUSTION_DOWN', label: 'Exhaustion', details: '', confidence: 85, macroColor: btcMacroColor, metrics: dummyMetrics };
  }

  // 4. BREAKOUT
  const hasPriorCompression = isSqueezed || bbWidth < 0.025;
  const recentHighs = highs.slice(-15, -1);
  const recentLows = lows.slice(-15, -1);
  if (hasPriorCompression && volumeRatio > 1.25) {
     if (recentHighs.length > 0 && closes[lastIdx] > Math.max(...recentHighs)) return { regime: 'BREAKOUT_UP', label: 'Breakout', details: '', confidence: 80, macroColor: btcMacroColor, metrics: dummyMetrics };
     if (recentLows.length > 0 && closes[lastIdx] < Math.min(...recentLows)) return { regime: 'BREAKOUT_DOWN', label: 'Breakout', details: '', confidence: 80, macroColor: btcMacroColor, metrics: dummyMetrics };
  }

  // 5. TRENDING
  const ema20Slope = (ema9Series[ema9Series.length - 1] - ema9Series[ema9Series.length - 5]) / 5;
  if (adx >= 22) {
      if (isUptrend && ema20Slope > 0 && plusDI > minusDI) return { regime: 'TRENDING_UP', label: 'Trend', details: '', confidence: 85, macroColor: btcMacroColor, metrics: dummyMetrics };
      if (isDowntrend && ema20Slope < 0 && minusDI > plusDI) return { regime: 'TRENDING_DOWN', label: 'Trend', details: '', confidence: 85, macroColor: btcMacroColor, metrics: dummyMetrics };
  }

  // 6. RANGING
  if (adx < 22 && pctFromSma200 < 0.025 && !hasPriorCompression && volumeRatio < 1.1) {
      return { regime: 'RANGING', label: 'Range', details: '', confidence: 75, macroColor: btcMacroColor, metrics: dummyMetrics };
  }

  // 7. UNCLEAR
  return { regime: 'UNCLEAR', label: 'Transition / Unclear', details: '', confidence: 0, macroColor: btcMacroColor, metrics: dummyMetrics };
}
`;

content = content.replace(regexClassify, newClassify);

fs.writeFileSync('src/utils/strategyBucket.ts', content);
