export function detectMacroRangeBreakout(candles: any[], currentPrice: number, atr: number): any {
  if (!candles || candles.length < 45) return null;
  
  // Lookback for the macro box (e.g. 50-80 candles)
  const lookback = Math.min(candles.length - 2, 70);
  const boxCandles = candles.slice(-lookback - 1, -1); // Exclude the current live candle
  const prevCandle = boxCandles[boxCandles.length - 1];
  
  const boxHigh = Math.max(...boxCandles.map(c => c.high));
  const boxLow = Math.min(...boxCandles.map(c => c.low));
  const boxRange = boxHigh - boxLow;
  
  // Range should be a valid consolidation (between 2.5 and 15 ATR)
  if (boxRange < 2.5 * atr || boxRange > 18 * atr) return null;

  // Verify that the range is an established accumulation/distribution box
  // (at least 2 touches near upper boundary and 2 touches near lower boundary)
  let upperTouches = 0;
  let lowerTouches = 0;
  for (const c of boxCandles) {
    if (c.high >= boxHigh - (0.25 * atr)) upperTouches++;
    if (c.low <= boxLow + (0.25 * atr)) lowerTouches++;
  }
  if (upperTouches < 2 || lowerTouches < 2) return null;
  
  // Detect if we are breaking out of the box
  let direction: 'LONG' | 'SHORT' | null = null;
  
  // Require that the previous candle closed INSIDE the box, 
  // and the current price is breaking the extreme high/low
  if (prevCandle.close <= boxHigh && currentPrice > boxHigh && currentPrice < boxHigh + (atr * 0.45)) {
    direction = 'LONG';
  } else if (prevCandle.close >= boxLow && currentPrice < boxLow && currentPrice > boxLow - (atr * 0.45)) {
    direction = 'SHORT';
  }
  
  if (!direction) return null;

  // Pure Volume Confirmation: Breakout candle MUST have strong relative volume
  const recent20 = candles.slice(-21, -1);
  const avgVol20 = recent20.reduce((s, c) => s + (c.volume || 0), 0) / (recent20.length || 1);
  const currentVol = candles[candles.length - 1]?.volume || prevCandle.volume || 0;
  
  // Strict quality: must have at least 1.30x volume surge
  if (avgVol20 > 0 && currentVol < avgVol20 * 1.30) {
    return null; // Reject low-volume fakeout
  }
  
  // Stop loss below the local pre-breakout swing pivot (last 15 candles)
  const localCandles = candles.slice(-15, -1);
  let localSwingExtreme = 0;
  
  if (direction === 'LONG') {
    localSwingExtreme = Math.min(...localCandles.map(c => c.low));
    localSwingExtreme = localSwingExtreme - (atr * 0.25);
  } else {
    localSwingExtreme = Math.max(...localCandles.map(c => c.high));
    localSwingExtreme = localSwingExtreme + (atr * 0.25);
  }

  const risk = Math.abs(currentPrice - localSwingExtreme);
  if (risk <= 0) return null;
  
  return {
    direction,
    score: 95,
    atr,
    sl: localSwingExtreme,
    tp1: direction === 'LONG' ? currentPrice + (risk * 1.5) : currentPrice - (risk * 1.5),
    tp2: direction === 'LONG' ? currentPrice + (risk * 3.0) : currentPrice - (risk * 3.0),
    tp3: direction === 'LONG' ? currentPrice + (risk * 5.0) : currentPrice - (risk * 5.0),
    boxHigh,
    boxLow
  };
}
