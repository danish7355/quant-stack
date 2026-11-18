/**
 * LSR V2 Backtester and Gate Funnel Simulation Engine
 *
 * Evaluates closed candles only with swing confirmation lag.
 * Reads single LsrV2Config object.
 * Simulates entry modes, stop loss, TP1 partials, final TP, and Time Stop progress exits.
 * Records gate funnel rejection counts for optimization analysis.
 */

import { Candle, evaluateLiquiditySweepReversal, identifyLiquidityLevels } from './liquiditySweepReversal';
import { LsrV2Config, resolveLsrConfig } from './lsr.config';
import { LiquiditySweepReversalSignal, AppSettings } from '../../types';

export interface LsrBacktestTrade {
  id: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  entryBar: number;
  entryTime: number;
  entryPrice: number;
  stopLossPrice: number;
  tp1Price: number;
  tp2Price: number;
  exitBar?: number;
  exitTime?: number;
  exitPrice?: number;
  exitReason?: 'TP1' | 'TP2' | 'SL' | 'TIME_STOP' | 'TIMEOUT';
  pnlR: number;
  fee_share_of_R: number;
  mfeR: number;
  maeR: number;
  barsHeld: number;
  preset: string;
  configVersion: string;
  poolType: string;
  poolScore: number;
  locationPercentile: number;
  entryMode: string;
}

export interface LsrGateFunnel {
  TOTAL_EVALUATED: number;
  LOCATION_REJECT: number;
  POOL_QUALITY_LOW: number;
  NO_ROOM_FOR_RR: number;
  FEE_FLOOR: number;
  VOLUME_REJECT: number;
  STAR_SHAPE_REJECT: number;
  SWEEP_DEPTH_REJECT: number;
  REACCEPTANCE_REJECT: number;
  WAITING_FOR_CONFIRMATION: number;
  TOTAL_PASSED: number;
  TIME_STOP_EXITS: number;
}

export interface LsrBacktestResult {
  trades: LsrBacktestTrade[];
  totalTrades: number;
  wins: number;
  losses: number;
  timeStops: number;
  winRatePct: number;
  netProfitR: number;
  expectancyR: number;
  maxDrawdownR: number;
  profitFactor: number;
  gateFunnel: LsrGateFunnel;
}

/**
 * Runs a deterministic, closed-candle backtest for LSR V2 on historical candles
 */
export function runLsrBacktest(
  candles: Candle[],
  config: LsrV2Config,
  symbol: string = 'BTCUSDT',
  contextCandles: Candle[] = []
): LsrBacktestResult {
  const cfg = resolveLsrConfig({ lsrV2Config: config });
  const appSettings: AppSettings = {
    lsrV2Config: cfg
  } as any;

  const funnel: LsrGateFunnel = {
    TOTAL_EVALUATED: 0,
    LOCATION_REJECT: 0,
    POOL_QUALITY_LOW: 0,
    NO_ROOM_FOR_RR: 0,
    FEE_FLOOR: 0,
    VOLUME_REJECT: 0,
    STAR_SHAPE_REJECT: 0,
    SWEEP_DEPTH_REJECT: 0,
    REACCEPTANCE_REJECT: 0,
    WAITING_FOR_CONFIRMATION: 0,
    TOTAL_PASSED: 0,
    TIME_STOP_EXITS: 0
  };

  const trades: LsrBacktestTrade[] = [];
  const minCandles = Math.max(50, cfg.structureLookback + 10);
  if (candles.length < minCandles) {
    return {
      trades: [],
      totalTrades: 0,
      wins: 0,
      losses: 0,
      timeStops: 0,
      winRatePct: 0,
      netProfitR: 0,
      expectancyR: 0,
      maxDrawdownR: 0,
      profitFactor: 0,
      gateFunnel: funnel
    };
  }

  let activeTrade: LsrBacktestTrade | null = null;
  let partialTp1Taken = false;

  // Candle-by-candle simulation on strictly closed bars
  for (let barIdx = minCandles; barIdx < candles.length; barIdx++) {
    const historicalSlice = candles.slice(0, barIdx + 1);
    const curCandle = candles[barIdx];

    // 1. Manage Active Trade (on closed candle)
    if (activeTrade) {
      activeTrade.barsHeld++;
      const isLong = activeTrade.direction === 'LONG';
      const risk = Math.abs(activeTrade.entryPrice - activeTrade.stopLossPrice) || 1;

      // Track MFE (Maximum Favorable Excursion) and MAE (Maximum Adverse Excursion) in R
      const curMfe = isLong
        ? (curCandle.high - activeTrade.entryPrice) / risk
        : (activeTrade.entryPrice - curCandle.low) / risk;
      const curMae = isLong
        ? (activeTrade.entryPrice - curCandle.low) / risk
        : (curCandle.high - activeTrade.entryPrice) / risk;

      activeTrade.mfeR = Math.max(activeTrade.mfeR, curMfe);
      activeTrade.maeR = Math.max(activeTrade.maeR, curMae);

      // Check Stop Loss
      const slHit = isLong
        ? curCandle.low <= activeTrade.stopLossPrice
        : curCandle.high >= activeTrade.stopLossPrice;

      // Check TP1
      const tp1Hit = isLong
        ? curCandle.high >= activeTrade.tp1Price
        : curCandle.low <= activeTrade.tp1Price;

      // Check TP2 (Final TP)
      const tp2Hit = isLong
        ? curCandle.high >= activeTrade.tp2Price
        : curCandle.low <= activeTrade.tp2Price;

      // Check Time Stop Progress Exit
      // "After a fill, if the best closed-candle favorable excursion is still below minProgressR after N closed bars, exit at market. Exit reason code: TIME_STOP."
      const closedCandleProgressR = isLong
        ? (curCandle.close - activeTrade.entryPrice) / risk
        : (activeTrade.entryPrice - curCandle.close) / risk;
      (activeTrade as any).closedMfeR = Math.max((activeTrade as any).closedMfeR ?? -Infinity, closedCandleProgressR);

      const timeStopFired = cfg.timeStop.enabled &&
        activeTrade.barsHeld >= cfg.timeStop.bars &&
        (activeTrade as any).closedMfeR < cfg.timeStop.minProgressR;

      if (slHit) {
        activeTrade.exitBar = barIdx;
        activeTrade.exitTime = curCandle.time;
        activeTrade.exitPrice = activeTrade.stopLossPrice;
        activeTrade.exitReason = 'SL';
        activeTrade.pnlR = partialTp1Taken ? -0.5 : -1.0;
        trades.push(activeTrade);
        activeTrade = null;
        partialTp1Taken = false;
        continue;
      } else if (tp2Hit) {
        activeTrade.exitBar = barIdx;
        activeTrade.exitTime = curCandle.time;
        activeTrade.exitPrice = activeTrade.tp2Price;
        activeTrade.exitReason = 'TP2';
        const finalR = (Math.abs(activeTrade.tp2Price - activeTrade.entryPrice) / risk);
        activeTrade.pnlR = partialTp1Taken ? (0.25 * 1.5 + 0.75 * finalR) : finalR;
        trades.push(activeTrade);
        activeTrade = null;
        partialTp1Taken = false;
        continue;
      } else if (timeStopFired) {
        activeTrade.exitBar = barIdx;
        activeTrade.exitTime = curCandle.time;
        activeTrade.exitPrice = curCandle.close;
        activeTrade.exitReason = 'TIME_STOP';
        activeTrade.pnlR = closedCandleProgressR;
        funnel.TIME_STOP_EXITS++;
        trades.push(activeTrade);
        activeTrade = null;
        partialTp1Taken = false;
        continue;
      } else if (tp1Hit && !partialTp1Taken && cfg.partialTp1Enabled) {
        partialTp1Taken = true;
        // Move stop to breakeven after TP1
        activeTrade.stopLossPrice = activeTrade.entryPrice;
      }
    }

    // 2. Scan for New Signals (only if no active position)
    if (!activeTrade) {
      funnel.TOTAL_EVALUATED++;
      const currentPrice = curCandle.close;
      const signal = evaluateLiquiditySweepReversal(
        historicalSlice,
        [],
        currentPrice,
        appSettings
      );

      if (signal) {
        if (signal.finalDecision === 'EXECUTE') {
          funnel.TOTAL_PASSED++;
          const risk = Math.abs(signal.entryPrice - signal.stopLossPrice) || 1;
          const stopDistPct = currentPrice > 0 ? (risk / currentPrice) * 100 : 1;
          const feeShareOfR = cfg.feeFloor.roundTripFeePct / stopDistPct;

          activeTrade = {
            id: signal.setupId || `TRADE_${barIdx}`,
            symbol,
            direction: signal.direction,
            entryBar: barIdx,
            entryTime: curCandle.time,
            entryPrice: signal.entryPrice,
            stopLossPrice: signal.stopLossPrice,
            tp1Price: signal.tp1 || (signal.entryPrice + (signal.direction === 'LONG' ? 1.5 * risk : -1.5 * risk)),
            tp2Price: signal.tp2 || (signal.entryPrice + (signal.direction === 'LONG' ? cfg.finalTpR * risk : -cfg.finalTpR * risk)),
            pnlR: 0,
            fee_share_of_R: feeShareOfR,
            mfeR: 0,
            maeR: 0,
            barsHeld: 0,
            preset: cfg.preset,
            configVersion: cfg.configVersion,
            poolType: signal.liquidityType || 'SWING',
            poolScore: signal.liquidityQualityScore || 1,
            locationPercentile: signal.locationPercentile ?? 50,
            entryMode: cfg.entryMode
          };
        } else {
          // Record gate rejection in funnel
          const reason = signal.exactRejectionReason || '';
          if (reason === 'LOCATION_REJECT') funnel.LOCATION_REJECT++;
          else if (reason === 'POOL_QUALITY_LOW') funnel.POOL_QUALITY_LOW++;
          else if (reason === 'NO_ROOM_FOR_RR') funnel.NO_ROOM_FOR_RR++;
          else if (reason === 'FEE_FLOOR') funnel.FEE_FLOOR++;
          else if (reason === 'VOLUME_REJECT') funnel.VOLUME_REJECT++;
          else if (reason === 'STAR_SHAPE_REJECT') funnel.STAR_SHAPE_REJECT++;
          else if (reason === 'SWEEP_DEPTH_REJECT') funnel.SWEEP_DEPTH_REJECT++;
          else if (reason === 'REACCEPTANCE_REJECT') funnel.REACCEPTANCE_REJECT++;
          else if (reason === 'WAITING_FOR_CANDLE_CONFIRMATION') funnel.WAITING_FOR_CONFIRMATION++;
        }
      }
    }
  }

  // Calculate statistics
  const totalTrades = trades.length;
  const wins = trades.filter(t => t.pnlR > 0).length;
  const losses = trades.filter(t => t.pnlR <= 0).length;
  const timeStops = trades.filter(t => t.exitReason === 'TIME_STOP').length;
  const winRatePct = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;
  const netProfitR = trades.reduce((sum, t) => sum + t.pnlR, 0);
  const expectancyR = totalTrades > 0 ? netProfitR / totalTrades : 0;

  // Max drawdown calculation in R
  let peak = 0;
  let runningR = 0;
  let maxDd = 0;
  for (const t of trades) {
    runningR += t.pnlR;
    if (runningR > peak) peak = runningR;
    const dd = peak - runningR;
    if (dd > maxDd) maxDd = dd;
  }

  const grossWins = trades.filter(t => t.pnlR > 0).reduce((sum, t) => sum + t.pnlR, 0);
  const grossLosses = Math.abs(trades.filter(t => t.pnlR < 0).reduce((sum, t) => sum + t.pnlR, 0));
  const profitFactor = grossLosses > 0 ? grossWins / grossLosses : (grossWins > 0 ? 99 : 1);

  return {
    trades,
    totalTrades,
    wins,
    losses,
    timeStops,
    winRatePct,
    netProfitR,
    expectancyR,
    maxDrawdownR: maxDd,
    profitFactor,
    gateFunnel: funnel
  };
}
