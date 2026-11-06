/**
 * Candle utilities: idempotent forming-candle detection and management.
 */

export function parseTimeframeToMs(timeframe: string): number {
  if (!timeframe) return 60_000;
  const str = timeframe.trim().toLowerCase();
  const num = parseInt(str, 10);
  if (isNaN(num)) return 60_000;
  if (str.endsWith('m')) return num * 60_000;
  if (str.endsWith('h')) return num * 3_600_000;
  if (str.endsWith('d')) return num * 86_400_000;
  if (str.endsWith('w')) return num * 7 * 86_400_000;
  return 60_000;
}

/**
 * Time-based and idempotent: drops the last candle only if it is still open / forming.
 * If the last candle has already closed, returns the array unchanged.
 */
export function dropFormingCandle<T = any>(candles: T[], timeframe: string = '15m'): T[] {
  if (!candles || candles.length === 0) return candles || [];
  const last: any = candles[candles.length - 1];
  if (!last) return candles;

  const now = Date.now();
  const nowSec = Math.floor(now / 1000);

  // 1. Explicit closeTime check
  if (last.closeTime !== undefined && last.closeTime !== null) {
    const isCloseInMs = last.closeTime > 1e11;
    const isStillOpen = isCloseInMs ? (last.closeTime > now) : (last.closeTime > nowSec);
    if (isStillOpen) {
      return candles.slice(0, -1);
    }
    return candles;
  }

  // 2. Open time + timeframe check
  const openTimeRaw = last.openTime ?? last.time ?? last.timestamp;
  if (openTimeRaw !== undefined && openTimeRaw !== null) {
    const openTimeMs = openTimeRaw > 1e11 ? openTimeRaw : openTimeRaw * 1000;
    const tfMs = parseTimeframeToMs(timeframe);
    const estimatedCloseMs = openTimeMs + tfMs;
    // Allow 1000ms grace period for clock skew
    if (estimatedCloseMs > now - 1000) {
      return candles.slice(0, -1);
    }
    return candles;
  }

  // Fallback: if candle does not have timestamp info, return as-is to guarantee idempotency
  return candles;
}
