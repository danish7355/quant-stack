// src/utils/strategies/strictGapPullback/gates.ts
// ─────────────────────────────────────────────────────────────────────────────
// The seven independent gate functions.
// Each gate receives pre-computed indicator series and returns a typed result.
// A gate returns { passed: false } on any violation — the engine stops there.
// ─────────────────────────────────────────────────────────────────────────────
import {
  Candle, Direction, BtcRegime, StrictGapSettings,
  Gate1Result, Gate2Result, Gate3Result, Gate4Result, Gate5Result, Gate6Result,
} from "./types";
import {
  ema, atr, volumeSma, slope, isRising, isFalling,
  isHHHL, isLHLL, hasAbnormalCandle, nearestResistance,
  nearestSupport, swingLow, swingHigh,
} from "./indicators";

// ═══════════════════════════════════════════════════════════════════════════
// GATE 1 — OVERALL CRYPTO MARKET REGIME
// ═══════════════════════════════════════════════════════════════════════════
export function runGate1(
  btc1h: Candle[],
  btc4h: Candle[],
  settings: StrictGapSettings = {}
): Gate1Result {
  const abnMult = settings.btcAbnormalVolatilityAtrMult ?? 2.0;

  const ema50_1h = ema(btc1h.map(c => c.close), 50);
  const ema50_4h = ema(btc4h.map(c => c.close), 50);
  const atr1h = atr(btc1h, 14);
  const atr4h = atr(btc4h, 14);

  const last1h = btc1h[btc1h.length - 1];
  const last4h = btc4h[btc4h.length - 1];
  const e50_1h = ema50_1h[ema50_1h.length - 1];
  const e50_4h = ema50_4h[ema50_4h.length - 1];

  const abnormal1h = hasAbnormalCandle(btc1h, atr1h, abnMult, 3);
  const abnormal4h = hasAbnormalCandle(btc4h, atr4h, abnMult, 3);

  // Conflict check: 1H and 4H disagree
  const above1h = last1h.close > e50_1h;
  const above4h = last4h.close > e50_4h;
  if (above1h !== above4h) {
    return {
      passed: false, btcRegime: "RANGE_OR_CHOP", allowedDirection: null,
      reason: "BTC 1H and 4H EMA50 direction conflicts — no trade.",
    };
  }

  // Abnormal volatility
  if (abnormal1h || abnormal4h) {
    return {
      passed: false, btcRegime: "HIGH_RISK_VOLATILE", allowedDirection: null,
      reason: `Abnormal candle detected (>${abnMult}×ATR) on BTC ${abnormal1h ? "1H" : "4H"}.`,
    };
  }

  const rising1h = isRising(ema50_1h, 5);
  const rising4h = isRising(ema50_4h, 5);
  const falling1h = isFalling(ema50_1h, 5);
  const falling4h = isFalling(ema50_4h, 5);
  const hhhl = isHHHL(btc1h, 30);
  const lhll = isLHLL(btc1h, 30);

  // STRONG_BULL: both EMAs rising + HH/HL
  if (above1h && above4h && rising1h && rising4h && hhhl) {
    return { passed: true, btcRegime: "STRONG_BULL_TREND", allowedDirection: "LONG", reason: "BTC strongly bullish on both timeframes with HH/HL structure." };
  }
  // BULL: above EMA50 on both, at least one rising
  if (above1h && above4h && (rising1h || rising4h)) {
    return { passed: true, btcRegime: "BULL_TREND", allowedDirection: "LONG", reason: "BTC bullish on both timeframes." };
  }
  // STRONG_BEAR
  if (!above1h && !above4h && falling1h && falling4h && lhll) {
    return { passed: true, btcRegime: "STRONG_BEAR_TREND", allowedDirection: "SHORT", reason: "BTC strongly bearish on both timeframes with LH/LL structure." };
  }
  // BEAR
  if (!above1h && !above4h && (falling1h || falling4h)) {
    return { passed: true, btcRegime: "BEAR_TREND", allowedDirection: "SHORT", reason: "BTC bearish on both timeframes." };
  }

  return {
    passed: false, btcRegime: "RANGE_OR_CHOP", allowedDirection: null,
    reason: "BTC EMA50 is flat or price is consolidating — no clear trend.",
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// GATE 2 — COIN ELIGIBILITY AND COIN REGIME
// ═══════════════════════════════════════════════════════════════════════════
export function runGate2(
  coin1h: Candle[],
  coin4h: Candle[],
  direction: Direction,
  settings: StrictGapSettings = {}
): Gate2Result {
  const extMult = settings.coinExtensionAtrMult ?? 2.0;

  const ema50_1h = ema(coin1h.map(c => c.close), 50);
  const ema50_4h = ema(coin4h.map(c => c.close), 50);
  const ema20_1h = ema(coin1h.map(c => c.close), 20);
  const atr1h = atr(coin1h, 14);
  const atr4h = atr(coin4h, 14);

  const last1h = coin1h[coin1h.length - 1];
  const last4h = coin4h[coin4h.length - 1];
  const e50_1h = ema50_1h[ema50_1h.length - 1];
  const e50_4h = ema50_4h[ema50_4h.length - 1];
  const e20_1h = ema20_1h[ema20_1h.length - 1];
  const atrLast1h = atr1h[atr1h.length - 1];
  const atrLast4h = atr4h[atr4h.length - 1];

  // Check 1H and 4H agree
  const above1h = last1h.close > e50_1h;
  const above4h = last4h.close > e50_4h;
  if (above1h !== above4h) {
    return { passed: false, coinRegime: "conflicting", relativeStrength: "neutral", reason: "Coin 1H and 4H EMA50 trend conflict." };
  }

  // Over-extension check (price too far from EMA20/EMA50)
  const distEma20 = Math.abs(last1h.close - e20_1h);
  if (distEma20 > extMult * atrLast1h) {
    return { passed: false, coinRegime: "overextended", relativeStrength: "neutral", reason: `Coin is ${(distEma20 / atrLast1h).toFixed(2)}×ATR from 1H EMA20 — overextended.` };
  }

  // Abnormal candle check
  if (hasAbnormalCandle(coin1h, atr1h, 2.0, 3)) {
    return { passed: false, coinRegime: "volatile", relativeStrength: "neutral", reason: "Abnormal volatility candle on coin 1H." };
  }

  if (direction === "LONG") {
    if (!above1h || !above4h) {
      return { passed: false, coinRegime: "bearish", relativeStrength: "weak", reason: "Coin is below EMA50 on 1H or 4H — long not valid." };
    }
    if (!isRising(ema50_1h, 5) && !isRising(ema50_4h, 5)) {
      return { passed: false, coinRegime: "flat", relativeStrength: "neutral", reason: "EMA50 not rising on 1H or 4H." };
    }
    if (!isHHHL(coin1h, 30)) {
      return { passed: false, coinRegime: "choppy", relativeStrength: "neutral", reason: "Coin 1H structure is not showing higher highs / higher lows." };
    }
    return { passed: true, coinRegime: "bullish", relativeStrength: "strong", reason: "Coin 4H and 1H are bullish with rising EMA50 and HH/HL structure." };
  } else {
    if (above1h || above4h) {
      return { passed: false, coinRegime: "bullish", relativeStrength: "strong", reason: "Coin is above EMA50 — short not valid." };
    }
    if (!isFalling(ema50_1h, 5) && !isFalling(ema50_4h, 5)) {
      return { passed: false, coinRegime: "flat", relativeStrength: "neutral", reason: "EMA50 not falling on 1H or 4H." };
    }
    if (!isLHLL(coin1h, 30)) {
      return { passed: false, coinRegime: "choppy", relativeStrength: "neutral", reason: "Coin 1H structure is not showing lower highs / lower lows." };
    }
    return { passed: true, coinRegime: "bearish", relativeStrength: "weak", reason: "Coin 4H and 1H are bearish with falling EMA50 and LH/LL structure." };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// GATE 3 — 15-MINUTE CONTROLLED PULLBACK
// ═══════════════════════════════════════════════════════════════════════════
export function runGate3(
  candles15m: Candle[],
  direction: Direction,
  settings: StrictGapSettings = {}
): Gate3Result {
  const minBars = settings.pullbackMinBars ?? 3;
  const maxBars = settings.pullbackMaxBars ?? 8;
  const minCloseRatio = settings.pullbackMinCloseRatio ?? 0.60;

  const ema21 = ema(candles15m.map(c => c.close), 21);
  const atrSeries = atr(candles15m, 14);
  const n = candles15m.length;
  const lastAtr = atrSeries[n - 1];

  // Work backwards from the last completed candle to find a pullback window
  for (let end = n - 2; end >= minBars; end--) {
    // Determine the number of pullback candles ending at `end`
    for (let len = minBars; len <= Math.min(maxBars, end); len++) {
      const start = end - len + 1;
      const pullback = candles15m.slice(start, end + 1);
      const ema21Slice = ema21.slice(start, end + 1);

      if (direction === "LONG") {
        // Each candle should be below the previous (downward movement)
        let closingLower = 0;
        for (let j = 1; j < pullback.length; j++) {
          if (pullback[j].close < pullback[j - 1].close) closingLower++;
        }
        const ratio = closingLower / (pullback.length - 1);
        if (ratio < minCloseRatio) continue;

        // Price must stay above EMA21 throughout
        const breakEma21 = pullback.some((c, j) => c.close < ema21Slice[j] - 0.3 * lastAtr);
        if (breakEma21) continue;

        // No V-shape or violent reversal candle
        const hasViolentCandle = pullback.some(c => (c.high - c.low) > 1.5 * lastAtr);
        if (hasViolentCandle) continue;

        return { passed: true, pullbackBars: len, pullbackType: "flag", reason: `${len}-bar controlled downward pullback above 15m EMA21.` };
      } else {
        // SHORT: candles close higher (upward pullback in a downtrend)
        let closingHigher = 0;
        for (let j = 1; j < pullback.length; j++) {
          if (pullback[j].close > pullback[j - 1].close) closingHigher++;
        }
        const ratio = closingHigher / (pullback.length - 1);
        if (ratio < minCloseRatio) continue;

        // Price must stay below EMA21 throughout
        const breakEma21 = pullback.some((c, j) => c.close > ema21Slice[j] + 0.3 * lastAtr);
        if (breakEma21) continue;

        const hasViolentCandle = pullback.some(c => (c.high - c.low) > 1.5 * lastAtr);
        if (hasViolentCandle) continue;

        return { passed: true, pullbackBars: len, pullbackType: "flag", reason: `${len}-bar controlled upward pullback below 15m EMA21.` };
      }
    }
  }

  return { passed: false, pullbackBars: 0, pullbackType: "unknown", reason: "No valid controlled pullback found (3–8 bars, ≥60% directional closes, no EMA21 breach, no violent candle)." };
}

// ═══════════════════════════════════════════════════════════════════════════
// GATE 4 — STRICT 5 EMA GAP SIGNAL CANDLE
// ═══════════════════════════════════════════════════════════════════════════
export function runGate4(
  candles15m: Candle[],
  direction: Direction,
  settings: StrictGapSettings = {}
): Gate4Result {
  const minCloseLoc = settings.minCloseLocation ?? 0.70;
  const maxRangeAtr = settings.maxRangeAtr ?? 1.2;
  const minVolMult = settings.minVolumeMultiplier ?? 1.5;
  const maxDistEma21 = settings.maxDistToEma21Atr ?? 1.0;

  const closes = candles15m.map(c => c.close);
  const ema5Series = ema(closes, 5);
  const ema21Series = ema(closes, 21);
  const atrSeries = atr(candles15m, 14);
  const volSma20 = volumeSma(candles15m, 20);
  const n = candles15m.length;

  // Signal candle is the LAST COMPLETED candle (n-2; n-1 is the forming candle)
  // If we are called at candle close, use n-1
  const sigIdx = n - 1;
  const sig = candles15m[sigIdx];
  const e5 = ema5Series[sigIdx];
  const e21 = ema21Series[sigIdx];
  const atrVal = atrSeries[sigIdx];
  const volAvg = volSma20[sigIdx];

  if (!isFinite(e5) || !isFinite(e21) || !atrVal) {
    return { passed: false, closeLocation: 0, volumeRatio: 0, rangeAtr: 0, distToEma21Atr: 0, reason: "Indicator values not ready (insufficient history)." };
  }

  const candleRange = sig.high - sig.low;
  const closeLocation = candleRange > 0 ? (sig.close - sig.low) / candleRange : 0.5;
  const volumeRatio = volAvg > 0 ? sig.volume / volAvg : 0;
  const rangeAtr = atrVal > 0 ? candleRange / atrVal : 0;
  const distToEma21Atr = atrVal > 0 ? Math.abs(sig.close - e21) / atrVal : 0;

  if (direction === "LONG") {
    // Strict: entire candle above EMA5 (both low AND high > EMA5)
    if (sig.low <= e5) {
      return { passed: false, closeLocation, volumeRatio, rangeAtr, distToEma21Atr, reason: `LONG: signal candle low (${sig.low.toFixed(4)}) is not strictly above EMA5 (${e5.toFixed(4)}) — wick touch not allowed.` };
    }
    if (sig.close <= sig.open) {
      return { passed: false, closeLocation, volumeRatio, rangeAtr, distToEma21Atr, reason: "LONG: signal candle is not bullish (close ≤ open)." };
    }
    if (closeLocation < minCloseLoc) {
      return { passed: false, closeLocation, volumeRatio, rangeAtr, distToEma21Atr, reason: `LONG: close location ${closeLocation.toFixed(2)} < required ${minCloseLoc} (must be in top 30% of range).` };
    }
  } else {
    // Strict: entire candle below EMA5 (both high AND low < EMA5)
    if (sig.high >= e5) {
      return { passed: false, closeLocation, volumeRatio, rangeAtr, distToEma21Atr, reason: `SHORT: signal candle high (${sig.high.toFixed(4)}) is not strictly below EMA5 (${e5.toFixed(4)}) — wick touch not allowed.` };
    }
    if (sig.close >= sig.open) {
      return { passed: false, closeLocation, volumeRatio, rangeAtr, distToEma21Atr, reason: "SHORT: signal candle is not bearish (close ≥ open)." };
    }
    if (closeLocation > (1 - minCloseLoc)) {
      return { passed: false, closeLocation, volumeRatio, rangeAtr, distToEma21Atr, reason: `SHORT: close location ${closeLocation.toFixed(2)} > required ${(1 - minCloseLoc).toFixed(2)} (must be in bottom 30% of range).` };
    }
  }

  if (rangeAtr > maxRangeAtr) {
    return { passed: false, closeLocation, volumeRatio, rangeAtr, distToEma21Atr, reason: `Signal candle range ${rangeAtr.toFixed(2)}×ATR exceeds max ${maxRangeAtr}×ATR — candle too large.` };
  }
  if (volumeRatio < minVolMult) {
    return { passed: false, closeLocation, volumeRatio, rangeAtr, distToEma21Atr, reason: `Volume ratio ${volumeRatio.toFixed(2)} < required ${minVolMult}×SMA20.` };
  }
  if (distToEma21Atr > maxDistEma21) {
    return { passed: false, closeLocation, volumeRatio, rangeAtr, distToEma21Atr, reason: `Distance to EMA21 is ${distToEma21Atr.toFixed(2)}×ATR > max ${maxDistEma21}×ATR.` };
  }

  return {
    passed: true, closeLocation, volumeRatio, rangeAtr, distToEma21Atr,
    reason: `Valid strict-gap candle. close-loc=${closeLocation.toFixed(2)}, vol=${volumeRatio.toFixed(2)}×, range=${rangeAtr.toFixed(2)}×ATR, distEMA21=${distToEma21Atr.toFixed(2)}×ATR.`,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// GATE 5 — RISK, TARGET, AND STRUCTURAL ROOM
// ═══════════════════════════════════════════════════════════════════════════
export function runGate5(
  candles15m: Candle[],
  htfCandles: Candle[],      // 1H candles for resistance/support
  direction: Direction,
  entry: number,
  settings: StrictGapSettings = {}
): Gate5Result {
  const slBuffer = settings.slAtrBuffer ?? 0.2;
  const minStopAtr = settings.minStopAtr ?? 0.5;
  const maxStopAtr = settings.maxStopAtr ?? 1.5;
  const minRoom = settings.minStructuralRoom ?? 3.0;
  const minNetReward = settings.minNetRewardAfterCosts ?? 2.5;
  const feesAtr = settings.feesAtrFraction ?? 0.05;
  const slippageAtr = settings.slippageAtrFraction ?? 0.05;
  const spreadAtr = settings.spreadAtrFraction ?? 0.03;

  const atrSeries = atr(candles15m, 14);
  const n = candles15m.length;
  const atrVal = atrSeries[n - 1];

  // Stop placement from pullback swing
  const swLow = swingLow(candles15m, n - 1, 12);
  const swHigh = swingHigh(candles15m, n - 1, 12);

  let stop: number;
  if (direction === "LONG") {
    stop = swLow - slBuffer * atrVal;
  } else {
    stop = swHigh + slBuffer * atrVal;
  }

  const riskPerUnit = Math.abs(entry - stop);

  if (riskPerUnit <= 0) {
    return { passed: false, entry, stop, riskPerUnit: 0, tp1: 0, tp2: 0, tp3: 0, nearestObstacle: 0, structuralRoom: 0, reason: "Risk per unit is zero or negative." };
  }

  // Stop distance validation
  const stopAtr = riskPerUnit / atrVal;
  if (stopAtr < minStopAtr) {
    return { passed: false, entry, stop, riskPerUnit, tp1: 0, tp2: 0, tp3: 0, nearestObstacle: 0, structuralRoom: 0, reason: `Stop too narrow: ${stopAtr.toFixed(2)}×ATR < min ${minStopAtr}×ATR.` };
  }
  if (stopAtr > maxStopAtr) {
    return { passed: false, entry, stop, riskPerUnit, tp1: 0, tp2: 0, tp3: 0, nearestObstacle: 0, structuralRoom: 0, reason: `Stop too wide: ${stopAtr.toFixed(2)}×ATR > max ${maxStopAtr}×ATR — entry is late.` };
  }

  const sign = direction === "LONG" ? 1 : -1;
  const tp1 = entry + sign * riskPerUnit;
  const tp2 = entry + sign * 2 * riskPerUnit;
  const tp3 = entry + sign * 3 * riskPerUnit;

  // Nearest structural obstacle (HTF)
  let nearestObstacle: number;
  if (direction === "LONG") {
    nearestObstacle = nearestResistance(htfCandles, 3, 80);
  } else {
    nearestObstacle = nearestSupport(htfCandles, 3, 80);
  }

  const distToObstacle = Math.abs(entry - nearestObstacle);
  const structuralRoom = distToObstacle / riskPerUnit;

  if (structuralRoom < minRoom) {
    return { passed: false, entry, stop, riskPerUnit, tp1, tp2, tp3, nearestObstacle, structuralRoom, reason: `Structural room to obstacle is ${structuralRoom.toFixed(2)}R — need at least ${minRoom}R.` };
  }

  // Cost deduction
  const totalCostAtr = feesAtr + slippageAtr + spreadAtr;
  const totalCostR = (totalCostAtr * atrVal) / riskPerUnit;
  const netReward = 3.0 - totalCostR;

  if (netReward < minNetReward) {
    return { passed: false, entry, stop, riskPerUnit, tp1, tp2, tp3, nearestObstacle, structuralRoom, reason: `Net reward after costs is ${netReward.toFixed(2)}R < required ${minNetReward}R.` };
  }

  return {
    passed: true, entry, stop, riskPerUnit, tp1, tp2, tp3,
    nearestObstacle, structuralRoom,
    reason: `Risk ${stopAtr.toFixed(2)}×ATR. Structural room ${structuralRoom.toFixed(2)}R. Net reward ${netReward.toFixed(2)}R after costs.`,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// GATE 6 — EXECUTION PLAN
// ═══════════════════════════════════════════════════════════════════════════
export function runGate6(
  candles15m: Candle[],
  direction: Direction,
  g5: Gate5Result,
  settings: StrictGapSettings = {}
): Gate6Result {
  const maxChaseAtr = settings.maxChaseAtr ?? 0.25;
  const atrSeries = atr(candles15m, 14);
  const n = candles15m.length;
  const atrVal = atrSeries[n - 1];
  const closes = candles15m.map(c => c.close);
  const ema5Val = ema(closes, 5)[n - 1];

  // Option B: retest limit price = max(EMA5, 50% retracement of signal candle body) for LONG
  const sigCandle = candles15m[n - 1];
  const bodyHigh = Math.max(sigCandle.open, sigCandle.close);
  const bodyLow = Math.min(sigCandle.open, sigCandle.close);
  const bodyMid = (bodyHigh + bodyLow) / 2;

  let limitPrice: number;
  if (direction === "LONG") {
    limitPrice = Math.max(ema5Val, bodyMid);
  } else {
    limitPrice = Math.min(ema5Val, bodyMid);
  }

  // Option A: Next-open entry – check for chase
  // (In live mode, nextOpenPrice is provided separately; here we estimate using close)
  const nextOpenEstimate = sigCandle.close;
  const chaseDistance = Math.abs(nextOpenEstimate - sigCandle.close);

  if (chaseDistance > maxChaseAtr * atrVal) {
    // Fallback to Option B
    return {
      passed: true,
      method: "MODEL_B_RETEST_LIMIT",
      entryZone: limitPrice,
      limitPrice,
      reason: `Next-open is >${maxChaseAtr}×ATR beyond signal close — using retest limit @ ${limitPrice.toFixed(4)}.`,
    };
  }

  // Default: prefer Option A (next open market entry)
  return {
    passed: true,
    method: "MODEL_A_NEXT_OPEN",
    entryZone: nextOpenEstimate,
    limitPrice,
    reason: `Next-open market entry @ ~${nextOpenEstimate.toFixed(4)}. Retest limit @ ${limitPrice.toFixed(4)} as alternative.`,
  };
}
