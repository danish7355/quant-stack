// src/utils/strategies/core/cache.ts
// ─────────────────────────────────────────────────────────────────────────────
// Memoised EMA series.
// Cache key includes symbol + timeframe + period + candle count + last-close
// so stale values from an earlier candle set are never returned.
// ─────────────────────────────────────────────────────────────────────────────

const emaStore = new Map<string, number[]>();

/**
 * Build a deterministic cache key.
 * Using last close + candle count makes collisions essentially impossible while
 * keeping the key cheap to compute.
 */
function buildKey(
  closes: number[],
  period: number,
  symbol = "",
  timeframe = ""
): string {
  const last = closes[closes.length - 1]?.toFixed(6) ?? "0";
  return `${symbol}:${timeframe}:${period}:${closes.length}:${last}`;
}

function computeEma(closes: number[], period: number): number[] {
  if (!closes.length) return [];
  const k = 2 / (period + 1);
  const ema: number[] = [closes[0]];
  for (let i = 1; i < closes.length; i++) {
    ema.push(closes[i] * k + ema[i - 1] * (1 - k));
  }
  return ema;
}

/**
 * Return the EMA series for the given parameters, from cache if available.
 * @param closes  Close-price array (same order as candles)
 * @param period  EMA look-back period
 * @param symbol  Symbol identifier for the cache key
 * @param timeframe  Timeframe string for the cache key
 */
export function getEmaSeries(
  closes: number[],
  period: number,
  symbol = "",
  timeframe = ""
): number[] {
  const key = buildKey(closes, period, symbol, timeframe);
  if (emaStore.has(key)) return emaStore.get(key)!;
  const series = computeEma(closes, period);
  emaStore.set(key, series);
  return series;
}

/** Evict all cached series (call on new trading day or after data refresh) */
export function clearEmaCache(): void {
  emaStore.clear();
}
