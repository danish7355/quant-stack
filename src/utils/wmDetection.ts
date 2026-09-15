export function detectWMFormation(ema9All: number[], closes: number[], lookback: number = 25): 'W_READY' | 'M_READY' | 'W_CONFIRMED' | 'M_CONFIRMED' | 'W_FORMING' | 'M_FORMING' | 'NONE' {
  if (ema9All.length < lookback) return 'NONE';
  // Simplified W/M detection
  return 'NONE';
}
