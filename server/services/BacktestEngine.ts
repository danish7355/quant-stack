// server/services/BacktestEngine.ts
// ─────────────────────────────────────────────────────────────────────────────
// Production-grade Backtesting Engine for QUANT PRO.
// Replays historical candles without lookahead or repainting.
// Calls existing StrategySignal adapters directly.
// ─────────────────────────────────────────────────────────────────────────────

import { evaluateEarlyCoilBreakoutAdapter } from '../../src/utils/strategies/earlyCoilBreakoutAdapter.ts';
import { evaluateEma5ExactEntryAdapter } from '../../src/utils/strategies/ema5ExactEntryAdapter.ts';
import { evaluateEma5ExactEntryV2Adapter } from '../../src/utils/strategies/ema5ExactEntryV2Adapter.ts';
import { evaluateEma5PaVolumeAdapter } from '../../src/utils/strategies/ema5PaVolumeAdapter.ts';
import { evaluateEma5RejectionReclaimAdapter } from '../../src/utils/strategies/ema5RejectionReclaimAdapter.ts';
import { evaluateEmaGapPullbackAdapter } from '../../src/utils/strategies/emaGapPullbackAdapter.ts';
import { evaluateMacroRangeAdapter } from '../../src/utils/strategies/macroRangeAdapter.ts';
import { evaluateRangeMeanReversionAdapter } from '../../src/utils/strategies/rangeMeanReversionAdapter.ts';
import { evaluateSmcLiquidityAdapter } from '../../src/utils/strategies/smcLiquidityAdapter.ts';
import { evaluateTrendPullbackAdapter } from '../../src/utils/strategies/trendPullbackAdapter.ts';
import { evaluateTrendPullbackRetestAdapter } from '../../src/utils/strategies/trendPullbackRetestAdapter.ts';
import { evaluateTwoSidedCoilBreakoutAdapter } from '../../src/utils/strategies/twoSidedCoilBreakoutAdapter.ts';
import { evaluateVolatilityCompressionAdapter } from '../../src/utils/strategies/volatilityCompressionAdapter.ts';
import { createTprState } from '../../src/utils/strategies/trendPullbackRetest.ts';
import { createEeeState } from '../../src/utils/strategies/ema5ExactEntry.ts';
import { createErrState } from '../../src/utils/strategies/ema5RejectionReclaim.ts';
import { type StrategySignal } from '../../src/utils/strategies/core/StrategySignal.ts';

import {
  HistoricalCandle,
  historicalDataService
} from './HistoricalDataService.ts';

import {
  BacktestParams,
  BacktestRiskSettings,
  BacktestFeeSettings,
  BacktestTrade,
  BacktestResult,
  BacktestSummaryMetrics,
  EquityPoint,
  RDistributionBin,
  StrategyMetricSummary,
  SymbolMetricSummary
} from '../../src/types/backtest.ts';

interface ActivePosition {
  id: string;
  symbol: string;
  strategy: string;
  direction: 'LONG' | 'SHORT';
  entryBarIndex: number;
  entryTime: number;
  entryPrice: number;
  rawEntryPrice: number;
  quantity: number;
  initialSl: number;
  currentSl: number;
  tp1: number;
  tp2?: number;
  tp3?: number;
  riskDollars: number;
  riskPerUnit: number;
  atr: number;
  holdingBars: number;
  highestPrice: number;
  lowestPrice: number;
  peakR: number;
}

interface PendingOrder {
  symbol: string;
  strategy: string;
  direction: 'LONG' | 'SHORT';
  signalBarIndex: number;
  signalTime: number;
  orderType: 'MARKET' | 'LIMIT';
  limitPrice?: number;
  sl: number;
  tp1: number;
  tp2?: number;
  tp3?: number;
  score: number;
  atr: number;
  ttlBars: number;
  setupScore: number;
  priority: number;
}

const DEFAULT_RISK_SETTINGS: BacktestRiskSettings = {
  positionSizePct: 5,
  accountRiskPct: 1,
  leverage: 5,
  maxConcurrentTrades: 3,
  dailyLossLimitPct: 3,
  maxDrawdownPct: 10,
  trailingStopActivation: 'TP1',
  trailAtrMultiple: 1.5,
  tp1Ratio: 1.5,
  tp2Ratio: 2.5,
};

const DEFAULT_FEE_SETTINGS: BacktestFeeSettings = {
  takerPct: 0.05,
  gstPct: 18,
  makerPct: 0.02,
};

export class BacktestEngine {
  private params: BacktestParams;
  private riskSettings: BacktestRiskSettings;
  private feeSettings: BacktestFeeSettings;
  private slippagePct: number;

  // State machine caches per symbol for stateful strategies
  private tprStates: Map<string, any> = new Map();
  private eeeStates: Map<string, any> = new Map();
  private errStates: Map<string, any> = new Map();

  constructor(params: BacktestParams) {
    this.params = params;
    this.riskSettings = { ...DEFAULT_RISK_SETTINGS, ...(params.riskSettings || {}) };
    this.feeSettings = { ...DEFAULT_FEE_SETTINGS, ...(params.fees || {}) };
    this.slippagePct = (params.slippagePct ?? 0.05) / 100; // convert to fraction (e.g. 0.0005)
  }

  private getTimeframeMs(tf: string): number {
    const unit = tf.slice(-1).toLowerCase();
    const amount = parseInt(tf.slice(0, -1), 10) || 1;
    switch (unit) {
      case 'm': return amount * 60 * 1000;
      case 'h': return amount * 60 * 60 * 1000;
      case 'd': return amount * 24 * 60 * 60 * 1000;
      default: return 15 * 60 * 1000;
    }
  }

  /**
   * Evaluates a strategy adapter for a given symbol and closed candle history.
   * STRICT INTEGRITY: Uses existing adapters directly with closed candles only.
   */
  private evaluateAdapter(
    strategyId: string,
    symbol: string,
    execSlice: HistoricalCandle[],
    htfSlice: HistoricalCandle[],
    currentPrice: number
  ): StrategySignal | null {
    const settings = {
      symbol,
      timeframe: this.params.execTf,
      ...(this.params.strategyParams?.[strategyId] || {}),
      ...(this.params.strategyParams || {})
    };

    try {
      switch (strategyId) {
        case 'EMA_GAP_PULLBACK':
          return evaluateEmaGapPullbackAdapter(execSlice, htfSlice, currentPrice, settings);

        case 'VOLATILITY_COMPRESSION':
          return evaluateVolatilityCompressionAdapter(execSlice, htfSlice, currentPrice, settings);

        case 'TREND_PULLBACK':
          return evaluateTrendPullbackAdapter(execSlice, htfSlice, currentPrice, settings);

        case 'BINANCE_COMPOSITE':
        case 'RANGE_MEAN_REVERSION':
          return evaluateRangeMeanReversionAdapter(execSlice, htfSlice, currentPrice, settings);

        case 'EARLY_COIL_BREAKOUT':
          return evaluateEarlyCoilBreakoutAdapter(execSlice, htfSlice, currentPrice, settings);

        case 'TWO_SIDED_COIL_BREAKOUT':
          return evaluateTwoSidedCoilBreakoutAdapter(execSlice, htfSlice, currentPrice, settings);

        case 'SMC_LIQUIDITY_SWEEP':
        case 'LIQUIDITY_SWEEP_REVERSAL':
          return evaluateSmcLiquidityAdapter(execSlice, htfSlice, currentPrice, settings);

        case 'EMA5_PA_VOLUME_V1':
          return evaluateEma5PaVolumeAdapter(execSlice, htfSlice, currentPrice, settings);

        case 'TREND_PULLBACK_RETEST': {
          if (!this.tprStates.has(symbol)) {
            this.tprStates.set(symbol, createTprState());
          }
          const state = this.tprStates.get(symbol);
          return evaluateTrendPullbackRetestAdapter(execSlice, htfSlice, currentPrice, settings, state);
        }

        case 'EMA5_EXACT_ENTRY_V1': {
          if (!this.eeeStates.has(symbol)) {
            this.eeeStates.set(symbol, createEeeState());
          }
          const state = this.eeeStates.get(symbol);
          return evaluateEma5ExactEntryAdapter(execSlice, htfSlice, currentPrice, settings, state);
        }

        case 'EMA5_REJECTION_RECLAIM_V1': {
          if (!this.errStates.has(symbol)) {
            this.errStates.set(symbol, createErrState());
          }
          const state = this.errStates.get(symbol);
          return evaluateEma5RejectionReclaimAdapter(execSlice, htfSlice, currentPrice, settings, state);
        }

        case 'EMA5_EXACT_ENTRY_V2':
          return evaluateEma5ExactEntryV2Adapter(execSlice, htfSlice, currentPrice, settings);

        default:
          return null;
      }
    } catch (e) {
      return null;
    }
  }

  private getStrategyPriority(strategyId: string): number {
    switch (strategyId) {
      case 'EMA5_EXACT_ENTRY_V2':
      case 'TREND_PULLBACK':
      case 'TREND_PULLBACK_RETEST':
      case 'EMA_GAP_PULLBACK':
      case 'BINANCE_COMPOSITE':
      case 'RANGE_MEAN_REVERSION':
        return 1; // P1
      case 'EMA5_PA_VOLUME_V1':
      case 'EMA5_EXACT_ENTRY_V1':
      case 'EMA5_REJECTION_RECLAIM_V1':
      case 'VOLATILITY_COMPRESSION':
      case 'EARLY_COIL_BREAKOUT':
      case 'TWO_SIDED_COIL_BREAKOUT':
      case 'SMC_LIQUIDITY_SWEEP':
      case 'LIQUIDITY_SWEEP_REVERSAL':
        return 2; // P2
      default:
        return 3;
    }
  }

  /**
   * Main simulation execution method.
   */
  public async run(
    onProgress?: (percent: number, step: string, message: string) => void
  ): Promise<BacktestResult> {
    const runStartTime = Date.now();
    const { symbols, strategies, execTf, dirTf, from, to, capital, mode } = this.params;

    onProgress?.(5, 'fetch_data', `Loading historical klines for ${symbols.length} symbol(s)...`);

    const execTfMs = this.getTimeframeMs(execTf);
    const dirTfMs = this.getTimeframeMs(dirTf);

    // Provide 250 bars of warmup prior to the start time
    const warmupBars = 250;
    const execWarmupMs = from - (warmupBars * execTfMs);
    const dirWarmupMs = from - (warmupBars * dirTfMs);

    const execCandlesMap = new Map<string, HistoricalCandle[]>();
    const dirCandlesMap = new Map<string, HistoricalCandle[]>();

    let symbolIndex = 0;
    for (const sym of symbols) {
      symbolIndex++;
      const pct = 5 + Math.floor((symbolIndex / symbols.length) * 20);
      const [execCandles, dirCandles] = await Promise.all([
        historicalDataService.getKlines(sym, execTf, execWarmupMs, to, (count, msg) => {
          onProgress?.(pct, 'fetch_data', `${sym} [${execTf}]: ${msg}`);
        }),
        historicalDataService.getKlines(sym, dirTf, dirWarmupMs, to, (count, msg) => {
          onProgress?.(pct, 'fetch_data', `${sym} [${dirTf}]: ${msg}`);
        })
      ]);

      execCandlesMap.set(sym, execCandles);
      dirCandlesMap.set(sym, dirCandles);
    }

    onProgress?.(28, 'align_timeline', 'Building synchronized multi-symbol timeline...');

    // Collect all unique openTime timestamps across execution candles that fall within the range
    const timelineSet = new Set<number>();
    for (const [, candles] of execCandlesMap) {
      for (const c of candles) {
        if (c.openTime >= from && c.openTime <= to) {
          timelineSet.add(c.openTime);
        }
      }
    }
    const timeline = Array.from(timelineSet).sort((a, b) => a - b);

    if (timeline.length === 0) {
      throw new Error(`No historical candles found in specified range (${new Date(from).toISOString()} to ${new Date(to).toISOString()}). Check Binance connectivity or date range.`);
    }

    onProgress?.(30, 'replay', `Simulating ${timeline.length} bars across ${symbols.length} pair(s)...`);

    // Account and trade tracking state
    let balance = capital;
    let peakBalance = capital;
    const activePositions: ActivePosition[] = [];
    const pendingOrders: PendingOrder[] = [];
    const completedTrades: BacktestTrade[] = [];
    const rejectionCounts: Record<string, number> = {
      MAX_CONCURRENT_TRADES: 0,
      DAILY_LOSS_LIMIT: 0,
      MAX_DRAWDOWN_LIMIT: 0,
      MIN_RR_FAIL: 0,
      INSUFFICIENT_MARGIN: 0
    };

    // Daily loss tracking by UTC day
    let currentDayStr = '';
    let dayStartBalance = balance;
    let dayRealizedPnl = 0;
    let dailyLossTriggered = false;

    // Fee rate per side including GST: takerPct * (1 + gstPct / 100)
    const effectiveFeeRatePerSide = (this.feeSettings.takerPct / 100) * (1 + (this.feeSettings.gstPct / 100));

    // Pre-build index and candle lookup maps for O(1) bar access
    const execCandleByTime = new Map<string, Map<number, HistoricalCandle>>();
    const execIndexByTime = new Map<string, Map<number, number>>();
    for (const [sym, candles] of execCandlesMap) {
      const candleMap = new Map<number, HistoricalCandle>();
      const indexMap = new Map<number, number>();
      for (let i = 0; i < candles.length; i++) {
        const c = candles[i];
        candleMap.set(c.openTime, c);
        indexMap.set(c.openTime, i);
      }
      execCandleByTime.set(sym, candleMap);
      execIndexByTime.set(sym, indexMap);
    }

    // Moving pointers for HTF closed candle slices (monotonically non-decreasing)
    const dirSlicePointers = new Map<string, number>();
    for (const sym of symbols) {
      dirSlicePointers.set(sym, 0);
    }

    // Step-by-step chronological replay
    for (let tIdx = 0; tIdx < timeline.length; tIdx++) {
      const currentBarTime = timeline[tIdx];

      // Cooperative event loop yield to ensure main server / SSE stays responsive
      if (tIdx % 100 === 0) {
        await new Promise(r => setImmediate(r));
      }

      // Update progress periodically (every 100 bars or at end of timeline)
      if (tIdx % 100 === 0 || tIdx === timeline.length - 1) {
        const pct = 30 + Math.floor((tIdx / timeline.length) * 60);
        onProgress?.(pct, 'replay', `Replaying bar ${tIdx + 1}/${timeline.length} (${new Date(currentBarTime).toISOString().slice(0, 16)})...`);
      }

      // Check for UTC day change to reset daily loss tracker
      const barDateStr = new Date(currentBarTime).toISOString().slice(0, 10);
      if (barDateStr !== currentDayStr) {
        currentDayStr = barDateStr;
        dayStartBalance = balance;
        dayRealizedPnl = 0;
        dailyLossTriggered = false;
      }

      // ─── STEP 1: EVALUATE ACTIVE POSITIONS FOR INTRABAR EXITS ────────────────
      // Note: "if SL and TP are both touched in the same candle, count SL first."
      // "Trailing stops update on closed candles only."
      for (let pIdx = activePositions.length - 1; pIdx >= 0; pIdx--) {
        const pos = activePositions[pIdx];
        const candle = execCandleByTime.get(pos.symbol)?.get(currentBarTime);
        if (!candle) continue;

        pos.holdingBars++;
        pos.highestPrice = Math.max(pos.highestPrice, candle.high);
        pos.lowestPrice = Math.min(pos.lowestPrice, candle.low);

        let exitTriggered = false;
        let exitPrice = 0;
        let exitReason: BacktestTrade['exitReason'] = 'SL';

        if (pos.direction === 'LONG') {
          const slHit = candle.low <= pos.currentSl;
          const tp1Hit = candle.high >= pos.tp1;
          const tp2Hit = pos.tp2 ? candle.high >= pos.tp2 : false;
          const tp3Hit = pos.tp3 ? candle.high >= pos.tp3 : false;

          // Intrabar SL Priority: If both SL and TP touched in same candle, SL takes precedence
          if (slHit) {
            exitTriggered = true;
            exitReason = 'SL';
            // Price slippage worsens exit
            exitPrice = Math.min(pos.currentSl, candle.open) * (1 - this.slippagePct);
          } else if (tp3Hit && pos.tp3) {
            exitTriggered = true;
            exitReason = 'TP3';
            exitPrice = pos.tp3 * (1 - this.slippagePct);
          } else if (tp2Hit && pos.tp2) {
            exitTriggered = true;
            exitReason = 'TP2';
            exitPrice = pos.tp2 * (1 - this.slippagePct);
          } else if (tp1Hit) {
            exitTriggered = true;
            exitReason = 'TP1';
            exitPrice = pos.tp1 * (1 - this.slippagePct);
          }
        } else {
          // SHORT position
          const slHit = candle.high >= pos.currentSl;
          const tp1Hit = candle.low <= pos.tp1;
          const tp2Hit = pos.tp2 ? candle.low <= pos.tp2 : false;
          const tp3Hit = pos.tp3 ? candle.low <= pos.tp3 : false;

          // Intrabar SL Priority: If both SL and TP touched in same candle, SL takes precedence
          if (slHit) {
            exitTriggered = true;
            exitReason = 'SL';
            exitPrice = Math.max(pos.currentSl, candle.open) * (1 + this.slippagePct);
          } else if (tp3Hit && pos.tp3) {
            exitTriggered = true;
            exitReason = 'TP3';
            exitPrice = pos.tp3 * (1 + this.slippagePct);
          } else if (tp2Hit && pos.tp2) {
            exitTriggered = true;
            exitReason = 'TP2';
            exitPrice = pos.tp2 * (1 + this.slippagePct);
          } else if (tp1Hit) {
            exitTriggered = true;
            exitReason = 'TP1';
            exitPrice = pos.tp1 * (1 + this.slippagePct);
          }
        }

        if (exitTriggered) {
          // Close position and calculate exact PnL, fees, and R
          const rawPnl = pos.direction === 'LONG'
            ? (exitPrice - pos.entryPrice) * pos.quantity
            : (pos.entryPrice - exitPrice) * pos.quantity;

          const entryNotional = pos.entryPrice * pos.quantity;
          const exitNotional = exitPrice * pos.quantity;
          const entryFee = entryNotional * effectiveFeeRatePerSide;
          const exitFee = exitNotional * effectiveFeeRatePerSide;
          const totalFees = entryFee + exitFee;

          // Slippage cost is difference between ideal price and slippage price
          const slippageCost = (Math.abs(exitPrice - (exitReason === 'SL' ? pos.currentSl : pos.tp1)) +
            Math.abs(pos.entryPrice - pos.rawEntryPrice)) * pos.quantity;

          const grossPnl = pos.direction === 'LONG'
            ? (exitPrice - pos.entryPrice) * pos.quantity
            : (pos.entryPrice - exitPrice) * pos.quantity;

          const netPnl = grossPnl - totalFees;
          const grossR = pos.riskDollars > 0 ? grossPnl / pos.riskDollars : 0;
          const netR = pos.riskDollars > 0 ? netPnl / pos.riskDollars : 0;
          const feeDragPct = pos.riskDollars > 0 ? (totalFees / pos.riskDollars) * 100 : 0;

          balance += netPnl;
          peakBalance = Math.max(peakBalance, balance);
          dayRealizedPnl += netPnl;

          // Check if daily loss limit hit
          const dayLossPct = (dayRealizedPnl / dayStartBalance) * 100;
          if (dayLossPct <= -this.riskSettings.dailyLossLimitPct) {
            dailyLossTriggered = true;
          }

          const tradeRecord: BacktestTrade = {
            id: pos.id,
            symbol: pos.symbol,
            strategy: pos.strategy,
            direction: pos.direction,
            entryTime: pos.entryTime,
            entryPrice: pos.entryPrice,
            exitTime: candle.closeTime,
            exitPrice,
            exitReason,
            quantity: pos.quantity,
            notional: entryNotional,
            initialSl: pos.initialSl,
            initialTp1: pos.tp1,
            initialTp2: pos.tp2,
            initialTp3: pos.tp3,
            riskDollars: pos.riskDollars,
            riskPerUnit: pos.riskPerUnit,
            grossPnl,
            grossR,
            netPnl,
            netR,
            fees: totalFees,
            slippageCost,
            feeDragPct,
            holdingBars: pos.holdingBars,
            holdingDurationMs: candle.closeTime - pos.entryTime,
            accountBalanceAfter: balance,
          };

          completedTrades.push(tradeRecord);
          activePositions.splice(pIdx, 1);
        } else {
          // Trailing stop updates on CLOSED candle only:
          // If price moves favorably, ratchets up stop loss
          if (this.riskSettings.trailingStopActivation && this.riskSettings.trailingStopActivation !== 'OFF') {
            const currentR = pos.direction === 'LONG'
              ? (candle.close - pos.entryPrice) / pos.riskPerUnit
              : (pos.entryPrice - candle.close) / pos.riskPerUnit;

            pos.peakR = Math.max(pos.peakR, currentR);

            let shouldTrail = false;
            if (this.riskSettings.trailingStopActivation === 'TP1' && candle.high >= pos.tp1) {
              shouldTrail = true;
            } else if (this.riskSettings.trailingStopActivation === '1R' && pos.peakR >= 1.0) {
              shouldTrail = true;
            } else if (this.riskSettings.trailingStopActivation === '2R' && pos.peakR >= 2.0) {
              shouldTrail = true;
            }

            if (shouldTrail) {
              const trailMult = this.riskSettings.trailAtrMultiple || 1.5;
              const trailBuffer = pos.atr * trailMult;
              if (pos.direction === 'LONG') {
                const newSl = Math.max(pos.currentSl, candle.close - trailBuffer);
                // Never move stop loss down
                if (newSl > pos.currentSl) {
                  pos.currentSl = newSl;
                }
              } else {
                const newSl = Math.min(pos.currentSl, candle.close + trailBuffer);
                // Never move stop loss up
                if (newSl < pos.currentSl) {
                  pos.currentSl = newSl;
                }
              }
            }
          }
        }
      }

      // ─── STEP 2: FILL PENDING ORDERS FROM BAR i-1 AT BAR i OPEN ─────────────
      // "Signal on bar i close -> entry at bar i+1 open"
      for (let oIdx = pendingOrders.length - 1; oIdx >= 0; oIdx--) {
        const order = pendingOrders[oIdx];
        const candle = execCandleByTime.get(order.symbol)?.get(currentBarTime);
        if (!candle) continue;

        // Check if market or limit order fills on this bar
        let filled = false;
        let rawEntry = candle.open;

        if (order.orderType === 'MARKET') {
          filled = true;
          rawEntry = candle.open;
        } else if (order.orderType === 'LIMIT' && order.limitPrice) {
          if (order.direction === 'LONG' && candle.low <= order.limitPrice) {
            filled = true;
            rawEntry = Math.min(order.limitPrice, candle.open);
          } else if (order.direction === 'SHORT' && candle.high >= order.limitPrice) {
            filled = true;
            rawEntry = Math.max(order.limitPrice, candle.open);
          }
        }

        if (filled) {
          // Check Risk Gates before fill
          const currentDdPct = peakBalance > 0 ? ((peakBalance - balance) / peakBalance) * 100 : 0;
          if (currentDdPct >= this.riskSettings.maxDrawdownPct) {
            rejectionCounts.MAX_DRAWDOWN_LIMIT++;
            pendingOrders.splice(oIdx, 1);
            continue;
          }

          if (dailyLossTriggered) {
            rejectionCounts.DAILY_LOSS_LIMIT++;
            pendingOrders.splice(oIdx, 1);
            continue;
          }

          if (activePositions.length >= this.riskSettings.maxConcurrentTrades) {
            rejectionCounts.MAX_CONCURRENT_TRADES++;
            pendingOrders.splice(oIdx, 1);
            continue;
          }

          // In portfolio mode, check if we already have an open position on this symbol
          const symbolPositions = activePositions.filter(p => p.symbol === order.symbol);
          if (symbolPositions.length > 0) {
            pendingOrders.splice(oIdx, 1);
            continue;
          }

          // Apply slippage to entry price
          const entryPrice = order.direction === 'LONG'
            ? rawEntry * (1 + this.slippagePct)
            : rawEntry * (1 - this.slippagePct);

          const riskPerUnit = Math.abs(entryPrice - order.sl);
          if (riskPerUnit <= 0) {
            pendingOrders.splice(oIdx, 1);
            continue;
          }

          // Position Sizing: Live defaults (5% position size, 1% account risk, 5x leverage)
          const targetRiskDollars = balance * (this.riskSettings.accountRiskPct / 100);
          let quantity = targetRiskDollars / riskPerUnit;

          // Margin cap
          const maxNotional = balance * (this.riskSettings.positionSizePct / 100) * this.riskSettings.leverage;
          const notional = quantity * entryPrice;
          if (notional > maxNotional) {
            quantity = maxNotional / entryPrice;
          }

          const actualRiskDollars = quantity * riskPerUnit;
          if (actualRiskDollars <= 0 || quantity <= 0) {
            rejectionCounts.INSUFFICIENT_MARGIN++;
            pendingOrders.splice(oIdx, 1);
            continue;
          }

          const posId = `POS_${order.symbol}_${candle.openTime}_${Math.random().toString(36).slice(2, 6)}`;
          activePositions.push({
            id: posId,
            symbol: order.symbol,
            strategy: order.strategy,
            direction: order.direction,
            entryBarIndex: tIdx,
            entryTime: candle.openTime,
            entryPrice,
            rawEntryPrice: rawEntry,
            quantity,
            initialSl: order.sl,
            currentSl: order.sl,
            tp1: order.tp1,
            tp2: order.tp2,
            tp3: order.tp3,
            riskDollars: actualRiskDollars,
            riskPerUnit,
            atr: order.atr,
            holdingBars: 0,
            highestPrice: candle.high,
            lowestPrice: candle.low,
            peakR: 0,
          });

          pendingOrders.splice(oIdx, 1);
        } else {
          // Decrement order TTL
          order.ttlBars--;
          if (order.ttlBars <= 0) {
            pendingOrders.splice(oIdx, 1);
          }
        }
      }

      // ─── STEP 3: RUN STRATEGIES ON CLOSED BAR i (CANDLE CLOSE) ──────────────
      // "At bar i, the strategy receives only candles closed at or before i.
      // Higher-timeframe candles are exposed only after they close. No lookahead."
      const candidateSignals: PendingOrder[] = [];

      for (const sym of symbols) {
        const symCandles = execCandlesMap.get(sym);
        if (!symCandles) continue;

        // O(1) index lookup of current bar
        const barIndex = execIndexByTime.get(sym)?.get(currentBarTime);
        if (barIndex === undefined || barIndex < 35) continue; // Indicator warmup requirement

        const currentCandle = symCandles[barIndex];
        const currentPrice = currentCandle.close;

        // Rolling slice containing only closed candles up to bar i (max 350 lookback for O(1) performance)
        const maxLookback = 350;
        const execSliceStart = Math.max(0, barIndex + 1 - maxLookback);
        const execSlice = symCandles.slice(execSliceStart, barIndex + 1);

        // Amortized O(1) HTF candles: expose strictly those that have closed at or before current candle close
        const symDirCandles = dirCandlesMap.get(sym) || [];
        let dirPtr = dirSlicePointers.get(sym) || 0;
        while (dirPtr < symDirCandles.length && symDirCandles[dirPtr].closeTime <= currentCandle.closeTime) {
          dirPtr++;
        }
        dirSlicePointers.set(sym, dirPtr);
        const htfSliceStart = Math.max(0, dirPtr - maxLookback);
        const htfSlice = symDirCandles.slice(htfSliceStart, dirPtr);

        // In single mode, evaluate only the single selected strategy
        // In portfolio mode, evaluate all selected strategies
        for (const stratId of strategies) {
          const signal = this.evaluateAdapter(stratId, sym, execSlice, htfSlice, currentPrice);
          if (!signal || signal.rejectionReason) continue;

          // Convert StrategySignal to Candidate Pending Order
          const dir = signal.direction.toUpperCase() === 'LONG' ? 'LONG' : 'SHORT';
          const sl = signal.sl;
          const tp1 = signal.tp1;

          // Verify stop loss validity
          const riskPerUnit = Math.abs(currentPrice - sl);
          if (riskPerUnit <= 0) continue;

          const rr = Math.abs(tp1 - currentPrice) / riskPerUnit;
          if (rr < 1.0) {
            rejectionCounts.MIN_RR_FAIL++;
            continue;
          }

          candidateSignals.push({
            symbol: sym,
            strategy: stratId,
            direction: dir,
            signalBarIndex: tIdx,
            signalTime: currentCandle.closeTime,
            orderType: 'MARKET',
            sl,
            tp1,
            tp2: signal.tp2,
            tp3: signal.tp3,
            score: signal.setupScore || 70,
            atr: signal.atr || (currentPrice * 0.015),
            ttlBars: 3,
            setupScore: signal.setupScore || 70,
            priority: this.getStrategyPriority(stratId),
          });
        }
      }

      // ─── STEP 4: ARBITRATION & PRIORITY QUEUING ──────────────────────────────
      if (candidateSignals.length > 0) {
        if (mode === 'single') {
          // In single strategy mode: queue signals directly
          for (const sig of candidateSignals) {
            // Only queue if not already pending for symbol
            if (!pendingOrders.some(p => p.symbol === sig.symbol)) {
              pendingOrders.push(sig);
            }
          }
        } else {
          // In portfolio mode: sort by strategy priority (P1 first), then setup score (highest first)
          candidateSignals.sort((a, b) => {
            if (a.priority !== b.priority) return a.priority - b.priority;
            return b.score - a.score;
          });

          // Check how many slots are potentially available
          const availableSlots = Math.max(0, this.riskSettings.maxConcurrentTrades - activePositions.length - pendingOrders.length);
          const accepted = candidateSignals.slice(0, availableSlots);

          for (const sig of accepted) {
            if (!pendingOrders.some(p => p.symbol === sig.symbol) && !activePositions.some(p => p.symbol === sig.symbol)) {
              pendingOrders.push(sig);
            }
          }
        }
      }
    }

    // ─── STEP 5: CLOSE ANY OPEN POSITIONS AT END OF DATA ─────────────────────
    if (activePositions.length > 0) {
      const lastBarTime = timeline[timeline.length - 1];
      for (const pos of activePositions) {
        const symCandles = execCandlesMap.get(pos.symbol);
        const lastCandle = symCandles ? symCandles[symCandles.length - 1] : null;
        const exitPrice = lastCandle ? lastCandle.close : pos.entryPrice;

        const grossPnl = pos.direction === 'LONG'
          ? (exitPrice - pos.entryPrice) * pos.quantity
          : (pos.entryPrice - exitPrice) * pos.quantity;

        const entryNotional = pos.entryPrice * pos.quantity;
        const exitNotional = exitPrice * pos.quantity;
        const totalFees = (entryNotional + exitNotional) * effectiveFeeRatePerSide;
        const netPnl = grossPnl - totalFees;
        const grossR = pos.riskDollars > 0 ? grossPnl / pos.riskDollars : 0;
        const netR = pos.riskDollars > 0 ? netPnl / pos.riskDollars : 0;
        const feeDragPct = pos.riskDollars > 0 ? (totalFees / pos.riskDollars) * 100 : 0;

        balance += netPnl;

        completedTrades.push({
          id: pos.id,
          symbol: pos.symbol,
          strategy: pos.strategy,
          direction: pos.direction,
          entryTime: pos.entryTime,
          entryPrice: pos.entryPrice,
          exitTime: lastCandle ? lastCandle.closeTime : lastBarTime,
          exitPrice,
          exitReason: 'END_OF_DATA',
          quantity: pos.quantity,
          notional: entryNotional,
          initialSl: pos.initialSl,
          initialTp1: pos.tp1,
          initialTp2: pos.tp2,
          initialTp3: pos.tp3,
          riskDollars: pos.riskDollars,
          riskPerUnit: pos.riskPerUnit,
          grossPnl,
          grossR,
          netPnl,
          netR,
          fees: totalFees,
          slippageCost: 0,
          feeDragPct,
          holdingBars: pos.holdingBars,
          holdingDurationMs: (lastCandle ? lastCandle.closeTime : lastBarTime) - pos.entryTime,
          accountBalanceAfter: balance,
        });
      }
      activePositions.length = 0;
    }

    onProgress?.(95, 'compute_metrics', 'Calculating dynamic statistics and equity curves strictly from trade ledger...');

    // ─── STEP 6: COMPUTE ALL METRICS STRICTLY DERIVED FROM TRADE LEDGER ─────
    const summary = this.computeMetricsFromTrades(completedTrades, capital, timeline, rejectionCounts);

    const durationMs = Date.now() - runStartTime;
    onProgress?.(100, 'done', `Completed backtest in ${(durationMs / 1000).toFixed(1)}s (${completedTrades.length} trades generated).`);

    return {
      jobId: `bt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      params: this.params,
      startTime: from,
      endTime: to,
      durationMs,
      trades: completedTrades,
      summary,
    };
  }

  /**
   * Pure deterministic metrics calculator.
   * "All summary stats MUST be computed from the exported trade list only. No hardcoded or sample data anywhere."
   */
  public computeMetricsFromTrades(
    trades: BacktestTrade[],
    initialCapital: number,
    timeline: number[],
    rejectionCounts: Record<string, number>
  ): BacktestSummaryMetrics {
    const totalTrades = trades.length;
    let runningBalance = initialCapital;
    let peakBalance = initialCapital;
    let maxDdDollars = 0;
    let maxDdPct = 0;

    const equityCurve: EquityPoint[] = [
      {
        time: timeline.length > 0 ? timeline[0] : Date.now(),
        balance: initialCapital,
        drawdownPct: 0
      }
    ];

    let winningTrades = 0;
    let losingTrades = 0;
    let breakEvenTrades = 0;
    let grossPnl = 0;
    let netPnl = 0;
    let totalFees = 0;
    let totalSlippageCost = 0;
    let totalRiskDollars = 0;
    let grossProfit = 0;
    let grossLoss = 0;
    let sumNetR = 0;
    let sumWinR = 0;
    let sumLossR = 0;
    let totalHoldingBars = 0;
    let totalHoldingDurationMs = 0;

    const strategyMap = new Map<string, BacktestTrade[]>();
    const symbolMap = new Map<string, BacktestTrade[]>();

    for (const trade of trades) {
      runningBalance += trade.netPnl;
      if (runningBalance > peakBalance) {
        peakBalance = runningBalance;
      }
      const ddDollars = peakBalance - runningBalance;
      const ddPct = peakBalance > 0 ? (ddDollars / peakBalance) * 100 : 0;
      if (ddDollars > maxDdDollars) maxDdDollars = ddDollars;
      if (ddPct > maxDdPct) maxDdPct = ddPct;

      equityCurve.push({
        time: trade.exitTime,
        balance: runningBalance,
        drawdownPct: ddPct,
        tradeId: trade.id
      });

      grossPnl += trade.grossPnl;
      netPnl += trade.netPnl;
      totalFees += trade.fees;
      totalSlippageCost += trade.slippageCost;
      totalRiskDollars += trade.riskDollars;
      sumNetR += trade.netR;
      totalHoldingBars += trade.holdingBars;
      totalHoldingDurationMs += trade.holdingDurationMs;

      if (trade.netPnl > 0) {
        winningTrades++;
        grossProfit += trade.netPnl;
        sumWinR += trade.netR;
      } else if (trade.netPnl < 0) {
        losingTrades++;
        grossLoss += Math.abs(trade.netPnl);
        sumLossR += Math.abs(trade.netR);
      } else {
        breakEvenTrades++;
      }

      // Grouping by strategy
      if (!strategyMap.has(trade.strategy)) strategyMap.set(trade.strategy, []);
      strategyMap.get(trade.strategy)!.push(trade);

      // Grouping by symbol
      if (!symbolMap.has(trade.symbol)) symbolMap.set(trade.symbol, []);
      symbolMap.get(trade.symbol)!.push(trade);
    }

    const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;
    const lossRate = totalTrades > 0 ? (losingTrades / totalTrades) * 100 : 0;
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? 999 : 0);
    const avgTradePnl = totalTrades > 0 ? netPnl / totalTrades : 0;
    const avgR = totalTrades > 0 ? sumNetR / totalTrades : 0;
    const avgWinR = winningTrades > 0 ? sumWinR / winningTrades : 0;
    const avgLossR = losingTrades > 0 ? sumLossR / losingTrades : 0;
    const expectancyR = totalTrades > 0 ? ((winRate / 100) * avgWinR) - ((lossRate / 100) * avgLossR) : 0;
    const feeDragPct = totalRiskDollars > 0 ? (totalFees / totalRiskDollars) * 100 : 0;
    const totalReturnPct = initialCapital > 0 ? (netPnl / initialCapital) * 100 : 0;

    // Timeline duration in days
    const durationDays = timeline.length > 1
      ? Math.max(1, (timeline[timeline.length - 1] - timeline[0]) / (24 * 60 * 60 * 1000))
      : 1;
    const signalsPerDay = totalTrades / durationDays;
    const avgHoldingBars = totalTrades > 0 ? totalHoldingBars / totalTrades : 0;
    const avgHoldingDurationHours = totalTrades > 0 ? (totalHoldingDurationMs / totalTrades) / (60 * 60 * 1000) : 0;

    // R-Distribution Histogram Bins
    const binsDef = [
      { bin: '< -1R', check: (r: number) => r < -1 },
      { bin: '-1R to -0.5R', check: (r: number) => r >= -1 && r < -0.5 },
      { bin: '-0.5R to 0R', check: (r: number) => r >= -0.5 && r < 0 },
      { bin: '0R to 1R', check: (r: number) => r >= 0 && r < 1 },
      { bin: '1R to 2R', check: (r: number) => r >= 1 && r < 2 },
      { bin: '2R to 3R', check: (r: number) => r >= 2 && r < 3 },
      { bin: '> 3R', check: (r: number) => r >= 3 }
    ];

    const rDistribution: RDistributionBin[] = binsDef.map(b => {
      const count = trades.filter(t => b.check(t.netR)).length;
      return {
        bin: b.bin,
        count,
        percentage: totalTrades > 0 ? (count / totalTrades) * 100 : 0
      };
    });

    // Breakdown By Strategy
    const byStrategy: Record<string, StrategyMetricSummary> = {};
    for (const [strat, strTrades] of strategyMap) {
      const sTotal = strTrades.length;
      const sWins = strTrades.filter(t => t.netPnl > 0).length;
      const sLosses = strTrades.filter(t => t.netPnl < 0).length;
      const sGross = strTrades.reduce((a, t) => a + t.grossPnl, 0);
      const sNet = strTrades.reduce((a, t) => a + t.netPnl, 0);
      const sNetR = strTrades.reduce((a, t) => a + t.netR, 0);
      const sFees = strTrades.reduce((a, t) => a + t.fees, 0);
      const sRisk = strTrades.reduce((a, t) => a + t.riskDollars, 0);
      const sWinPnl = strTrades.filter(t => t.netPnl > 0).reduce((a, t) => a + t.netPnl, 0);
      const sLossPnl = Math.abs(strTrades.filter(t => t.netPnl < 0).reduce((a, t) => a + t.netPnl, 0));

      byStrategy[strat] = {
        strategy: strat,
        totalTrades: sTotal,
        wins: sWins,
        losses: sLosses,
        winRate: sTotal > 0 ? (sWins / sTotal) * 100 : 0,
        grossPnl: sGross,
        netPnl: sNet,
        netR: sNetR,
        profitFactor: sLossPnl > 0 ? sWinPnl / sLossPnl : (sWinPnl > 0 ? 999 : 0),
        avgR: sTotal > 0 ? sNetR / sTotal : 0,
        feeDragPct: sRisk > 0 ? (sFees / sRisk) * 100 : 0,
      };
    }

    // Breakdown By Symbol
    const bySymbol: Record<string, SymbolMetricSummary> = {};
    for (const [sym, symTrades] of symbolMap) {
      const symTotal = symTrades.length;
      const symWins = symTrades.filter(t => t.netPnl > 0).length;
      const symLosses = symTrades.filter(t => t.netPnl < 0).length;
      const symGross = symTrades.reduce((a, t) => a + t.grossPnl, 0);
      const symNet = symTrades.reduce((a, t) => a + t.netPnl, 0);
      const symNetR = symTrades.reduce((a, t) => a + t.netR, 0);
      const symWinPnl = symTrades.filter(t => t.netPnl > 0).reduce((a, t) => a + t.netPnl, 0);
      const symLossPnl = Math.abs(symTrades.filter(t => t.netPnl < 0).reduce((a, t) => a + t.netPnl, 0));

      bySymbol[sym] = {
        symbol: sym,
        totalTrades: symTotal,
        wins: symWins,
        losses: symLosses,
        winRate: symTotal > 0 ? (symWins / symTotal) * 100 : 0,
        grossPnl: symGross,
        netPnl: symNet,
        netR: symNetR,
        profitFactor: symLossPnl > 0 ? symWinPnl / symLossPnl : (symWinPnl > 0 ? 999 : 0),
        avgR: symTotal > 0 ? symNetR / symTotal : 0,
      };
    }

    return {
      initialCapital,
      finalCapital: runningBalance,
      totalReturnPct,
      netPnl,
      grossPnl,
      totalTrades,
      winningTrades,
      losingTrades,
      breakEvenTrades,
      winRate,
      profitFactor,
      totalFees,
      totalSlippageCost,
      feeDragPct,
      avgTradePnl,
      avgR,
      avgWinR,
      avgLossR,
      expectancyR,
      maxDrawdownDollars: maxDdDollars,
      maxDrawdownPct: maxDdPct,
      signalsPerDay,
      avgHoldingBars,
      avgHoldingDurationHours,
      equityCurve,
      rDistribution,
      byStrategy,
      bySymbol,
      rejectionCounts,
    };
  }
}
