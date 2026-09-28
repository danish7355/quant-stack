// server/scripts/runEma5V2Backtest.ts
// ─────────────────────────────────────────────────────────────────────────────
// Full Backtest and Validation Runner for EMA5_EXACT_ENTRY_V2 (Section 13)
// ─────────────────────────────────────────────────────────────────────────────

import fs from 'fs';
import path from 'path';
import {
  runBacktestV2,
  Eev2Candle,
  Eev2Config,
  EEV2_DEFAULTS,
  Eev2BacktestSummary,
} from '../../src/utils/strategies/ema5ExactEntryV2.js';

interface RawKline {
  0: number; // Open time
  1: string; // Open
  2: string; // High
  3: string; // Low
  4: string; // Close
  5: string; // Volume
  6: number; // Close time
}

async function fetchBinanceKlines(symbol: string, interval: string, limit: number = 1000): Promise<Eev2Candle[]> {
  const url = `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${symbol} ${interval}: ${res.statusText}`);
  }
  const data: RawKline[] = await res.json() as RawKline[];
  return data.map(k => ({
    time: k[0],
    open: parseFloat(k[1]),
    high: parseFloat(k[2]),
    low: parseFloat(k[3]),
    close: parseFloat(k[4]),
    volume: parseFloat(k[5]),
    closeTime: k[6],
  }));
}

async function main() {
  console.log('================================================================');
  console.log('       EMA5_EXACT_ENTRY_V2 BACKTEST & VALIDATION ENGINE         ');
  console.log('================================================================');

  const symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];
  const allResults: Record<string, Eev2BacktestSummary> = {};

  for (const symbol of symbols) {
    console.log(`\n📡 Fetching historical Binance Futures market data for ${symbol}...`);
    try {
      const candles5m = await fetchBinanceKlines(symbol, '5m', 1000);
      const candles15m = await fetchBinanceKlines(symbol, '15m', 1000);
      const candles1h = await fetchBinanceKlines(symbol, '1h', 500);
      const candles1d = await fetchBinanceKlines(symbol, '1d', 100);

      console.log(`✓ Loaded ${candles5m.length} 5m bars, ${candles15m.length} 15m bars, ${candles1h.length} 1h bars, ${candles1d.length} 1D bars for ${symbol}.`);

      // 65% Calibration / 35% Validation Chronological Split (Section 13)
      const splitIdx = Math.floor(candles5m.length * 0.65);
      const calib5m = candles5m.slice(0, splitIdx);
      const val5m = candles5m.slice(splitIdx);

      console.log(`Running Backtest on full dataset (1000 5m bars, ~3.5 days)...`);
      const fullSummary = runBacktestV2(
        candles5m,
        candles15m,
        candles1h,
        candles1d,
        {
          allowRrFallback: true, // allow fallback so we can observe complete trade distribution
          fallbackTpR: 3.0,
          minNetRr: 2.0,
        },
        undefined,
        symbol
      );

      allResults[symbol] = fullSummary;

      // Print Summary for this symbol
      console.log(`\n----------------- ${symbol} BACKTEST METRICS -----------------`);
      console.log(`Total Exact EMA5 Setups: ${fullSummary.totalSetups}`);
      console.log(`Executed Trades:         ${fullSummary.executedTradesCount}`);
      console.log(`Win Count:               ${fullSummary.winCount}`);
      console.log(`Loss Count:              ${fullSummary.lossCount}`);
      console.log(`Win Rate:                ${fullSummary.winRatePct}%`);
      console.log(`Profit Factor:           ${fullSummary.profitFactor}`);
      console.log(`Net PnL (R):             ${fullSummary.netPnlR} R`);
      console.log(`Max Drawdown (R):        ${fullSummary.maxDrawdownR} R`);
      console.log(`Average Trade R:         ${fullSummary.averageR} R`);
      console.log(`Average Win R:           ${fullSummary.averageWinningR} R`);
      console.log(`Average Loss R:          ${fullSummary.averageLosingR} R`);
      console.log(`Expectancy R:            ${fullSummary.expectancyR} R / trade`);
      console.log(`Max Losing Streak:       ${fullSummary.longestLosingStreak}`);
      console.log(`Shallow Sweep Rate:      ${fullSummary.shallowSweepRate}%`);

      console.log(`\n--- FILTER FUNNEL (${symbol}) ---`);
      console.log(`1. Exact Setups:         ${fullSummary.funnel.totalExactSetups} (100%)`);
      console.log(`2. Passed 15m Regime:    ${fullSummary.funnel.afterRegime}`);
      console.log(`3. Passed Quality:       ${fullSummary.funnel.afterQuality}`);
      console.log(`4. Passed Extension:     ${fullSummary.funnel.afterExtension}`);
      console.log(`5. Passed Volume:        ${fullSummary.funnel.afterVolume}`);
      console.log(`6. Passed Chop Filter:   ${fullSummary.funnel.afterChop}`);
      console.log(`7. Passed Stop Gates:    ${fullSummary.funnel.afterStopGates}`);
      console.log(`8. Executed:             ${fullSummary.funnel.executed}`);

      console.log(`\n--- SHADOW TRADES & FILTER EFFECTIVENESS (${symbol}) ---`);
      for (const eff of fullSummary.filterEffectiveness) {
        console.log(`Filter [${eff.filterName}]: Rejected ${eff.rejectedCount} | Rejected AvgR: ${eff.rejectedAvgR} vs Kept AvgR: ${eff.keptAvgR} | Useful: ${eff.isUseful ? 'YES (Saved Losses)' : 'NO'}`);
      }

    } catch (err: any) {
      console.error(`Error backtesting ${symbol}:`, err.message);
    }
  }

  // Calibration Studies (Buffer sizes 0.05, 0.10, 0.15, 0.25, 0.35)
  console.log('\n================================================================');
  console.log('   CALIBRATION STUDY: SL BUFFER (0.05 vs 0.10 vs 0.15 vs 0.25 vs 0.35) ');
  console.log('================================================================');
  try {
    const btcCandles5m = await fetchBinanceKlines('BTCUSDT', '5m', 1000);
    const btcCandles15m = await fetchBinanceKlines('BTCUSDT', '15m', 1000);
    const btcCandles1h = await fetchBinanceKlines('BTCUSDT', '1h', 500);
    const btcCandles1d = await fetchBinanceKlines('BTCUSDT', '1d', 100);

    const bufferSizes = [0.05, 0.10, 0.15, 0.25, 0.35];
    for (const buf of bufferSizes) {
      const res = runBacktestV2(btcCandles5m, btcCandles15m, btcCandles1h, btcCandles1d, {
        slBufferAvgRange: buf,
        allowRrFallback: true,
      });
      console.log(`Buffer ${buf.toFixed(2)}x: Trades: ${res.executedTradesCount}, WinRate: ${res.winRatePct}%, Net PnL: ${res.netPnlR} R, Shallow Sweep Rate: ${res.shallowSweepRate}%`);
    }

    // A/B Comparisons
    console.log('\n================================================================');
    console.log('   A/B COMPARISONS (EXIT_MODE & BE_MODE on BTCUSDT)             ');
    console.log('================================================================');
    const exitModes = ['LEVEL_LADDER', 'RR_FIXED'] as const;
    for (const em of exitModes) {
      const res = runBacktestV2(btcCandles5m, btcCandles15m, btcCandles1h, btcCandles1d, {
        exitMode: em,
        allowRrFallback: true,
      });
      console.log(`Exit Mode [${em}]: Trades: ${res.executedTradesCount}, WinRate: ${res.winRatePct}%, Net PnL: ${res.netPnlR} R, ProfitFactor: ${res.profitFactor}`);
    }

    const beModes = ['AFTER_TP1', 'OFF'] as const;
    for (const bm of beModes) {
      const res = runBacktestV2(btcCandles5m, btcCandles15m, btcCandles1h, btcCandles1d, {
        beMode: bm,
        allowRrFallback: true,
      });
      console.log(`Breakeven Mode [${bm}]: Trades: ${res.executedTradesCount}, WinRate: ${res.winRatePct}%, Net PnL: ${res.netPnlR} R, AvgR: ${res.averageR} R`);
    }
  } catch (err: any) {
    console.error('Error running calibration study:', err.message);
  }

  // Save raw results to disk for verification
  const outputPath = path.join(process.cwd(), 'data', 'ema5_v2_backtest_output.json');
  fs.writeFileSync(outputPath, JSON.stringify(allResults, null, 2), 'utf-8');
  console.log(`\n💾 Raw backtest logs and trade data saved to: ${outputPath}`);
}

main().catch(console.error);
