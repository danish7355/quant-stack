/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { CoinDetail, Position } from '../types';
import { createChart, CandlestickSeries, LineSeries, HistogramSeries, createSeriesMarkers, IChartApi, ColorType, LineStyle } from 'lightweight-charts';
import { calculateEMA, calculateVWAP, calculateSuperTrend } from '../utils/indicators';
import { formatPrice } from '../utils/format';
import { Sliders, Activity, Disc, Target } from 'lucide-react';

interface TradingChartProps {
  coin: CoinDetail;
  activePosition: Position | undefined;
}

export default function TradingChart({ coin, activePosition }: TradingChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const rsiContainerRef = useRef<HTMLDivElement>(null);
  const macdContainerRef = useRef<HTMLDivElement>(null);

  const [indicatorToggle, setIndicatorToggle] = useState({
    emas: true,
    vwap: true,
    superTrend: true,
    fibonacci: true,
    sr: true
  });

  useEffect(() => {
    if (!chartContainerRef.current || coin.candles.length === 0) return;

    const chartContainer = chartContainerRef.current;
    
    // 1. Core Candlestick Chart initialization
    const mainChart = createChart(chartContainer, {
      layout: {
        background: { type: ColorType.Solid, color: '#090d16' },
        textColor: '#9ca3af',
      },
      grid: {
        vertLines: { color: 'rgba(31, 41, 55, 0.3)' },
        horzLines: { color: 'rgba(31, 41, 55, 0.3)' },
      },
      width: chartContainer.clientWidth,
      height: 340,
      timeScale: {
        borderColor: '#1f2937',
        timeVisible: true,
        secondsVisible: false,
      },
    }) as any;

    // Add Candlestick series
    const candlestickSeries = mainChart.addSeries(CandlestickSeries, {
      upColor: '#10b981',
      downColor: '#ef4444',
      borderVisible: false,
      wickUpColor: '#10b981',
      wickDownColor: '#ef4444',
    });

    // Prepare candles
    const formattedCandles = coin.candles.map(c => ({
      time: c.time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));
    candlestickSeries.setData(formattedCandles);

    // 2. EMAs Overlay lines
    const closes = coin.candles.map(c => c.close);
    const times = coin.candles.map(c => c.time);

    let ema9Series: any = null;
    let ema55Series: any = null;
    let ema200Series: any = null;

    if (indicatorToggle.emas && closes.length >= 200) {
      const ema9 = calculateEMA(closes, 9);
      const ema55 = calculateEMA(closes, 55);
      const ema200 = calculateEMA(closes, 200);

      ema9Series = mainChart.addSeries(LineSeries, { color: '#3b82f6', width: 1.5, title: 'EMA 9' });
      ema9Series.setData(times.map((t, i) => ({ time: t, value: ema9[i] })));

      ema55Series = mainChart.addSeries(LineSeries, { color: '#f97316', width: 1.5, title: 'EMA 55' });
      ema55Series.setData(times.map((t, i) => ({ time: t, value: ema55[i] })));

      ema200Series = mainChart.addSeries(LineSeries, { color: '#a855f7', width: 2, title: 'EMA 200' });
      ema200Series.setData(times.map((t, i) => ({ time: t, value: ema200[i] })));
    }

    // 3. VWAP Overlay
    let vwapSeries: any = null;
    if (indicatorToggle.vwap) {
      const highs = coin.candles.map(c => c.high);
      const lows = coin.candles.map(c => c.low);
      const volumes = coin.candles.map(c => c.volume);
      const vwap = calculateVWAP(highs, lows, closes, volumes);

      vwapSeries = mainChart.addSeries(LineSeries, {
        color: '#14b8a6',
        width: 1,
        lineStyle: LineStyle.Dashed,
        title: 'VWAP'
      });
      vwapSeries.setData(times.map((t, i) => ({ time: t, value: vwap[i] })));
    }

    // 4. Supertrend line
    let supertrendLineSeries: any = null;
    if (indicatorToggle.superTrend) {
      const highs = coin.candles.map(c => c.high);
      const lows = coin.candles.map(c => c.low);
      const st = calculateSuperTrend(highs, lows, closes, 10, 3.0);

      supertrendLineSeries = mainChart.addSeries(LineSeries, {
        color: coin.indicators.superTrend.direction === 'uptrend' ? '#10b981' : '#ef4444',
        width: 1.5,
        title: 'SuperTrend'
      });
      supertrendLineSeries.setData(times.map((t, i) => ({ time: t, value: st.value[i] })));
    }

    // 5. Annotations Arrows for Crossovers & Active Entry Signal
    const markers: any[] = [];
    for (let i = 55; i < coin.candles.length; i++) {
      const prevFast = calculateEMA(closes.slice(0, i), 9).pop() || 0;
      const prevSlow = calculateEMA(closes.slice(0, i), 55).pop() || 0;
      const currFast = calculateEMA(closes.slice(0, i + 1), 9).pop() || 0;
      const currSlow = calculateEMA(closes.slice(0, i + 1), 55).pop() || 0;

      if (prevFast <= prevSlow && currFast > currSlow) {
        markers.push({
          time: times[i],
          position: 'belowBar',
          color: '#10b981',
          shape: 'arrowUp',
          text: 'EMA Cross LONG',
        });
      } else if (prevFast >= prevSlow && currFast < currSlow) {
        markers.push({
          time: times[i],
          position: 'aboveBar',
          color: '#ef4444',
          shape: 'arrowDown',
          text: 'EMA Cross SHORT',
        });
      }
    }

    if (activePosition) {
      const activePosTimeSecs = Math.floor(new Date(activePosition.timeOpen).getTime() / 1000);
      let closestTime = times[0];
      let minDiff = Infinity;
      for (const t of times) {
        const diff = Math.abs((t as number) - activePosTimeSecs);
        if (diff < minDiff) {
          minDiff = diff;
          closestTime = t;
        }
      }
      
      const isLong = activePosition.direction === 'LONG';
      const stratLabel = activePosition.strategy === 'DELTA_CLIMAX' ? 'CLIMAX' :
        activePosition.strategy === 'VOLATILITY_COMPRESSION' ? 'VCB' :
        activePosition.strategy === 'TREND_PULLBACK' ? 'PULLBACK' :
        activePosition.strategy === 'SMC_LIQUIDITY_SWEEP' ? 'SMC' :
        activePosition.strategy === 'BINANCE_COMPOSITE' ? '10-GATE' :
        (activePosition.strategy ? activePosition.strategy.replace(/_/g, ' ') : 'ENTRY');
      markers.push({
        time: closestTime,
        position: isLong ? 'belowBar' : 'aboveBar',
        color: isLong ? '#3b82f6' : '#ef4444',
        shape: isLong ? 'arrowUp' : 'arrowDown',
        text: `🚀 [${stratLabel}] ${activePosition.direction}`,
        size: 2,
      });
    }

    createSeriesMarkers(candlestickSeries, markers);

    // 6. Fibonacci and S/R Horizontal Price lines
    if (indicatorToggle.fibonacci && coin.indicators.fib.levels['0.618']) {
      const fibLevels = coin.indicators.fib.levels;
      Object.entries(fibLevels).forEach(([levelKey, price]) => {
        candlestickSeries.createPriceLine({
          price,
          color: 'rgba(99, 102, 241, 0.4)',
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: `Fib ${parseFloat(levelKey) * 100}%`,
        });
      });
    }

    if (indicatorToggle.sr) {
      const supports = coin.indicators.supportResistance.supports;
      const resistances = coin.indicators.supportResistance.resistances;

      supports.forEach((sup) => {
        candlestickSeries.createPriceLine({
          price: sup,
          color: 'rgba(16, 185, 129, 0.45)',
          lineWidth: 1,
          lineStyle: LineStyle.Dotted,
          axisLabelVisible: true,
          title: 'SUP',
        });
      });

      resistances.forEach((res) => {
        candlestickSeries.createPriceLine({
          price: res,
          color: 'rgba(239, 68, 68, 0.45)',
          lineWidth: 1,
          lineStyle: LineStyle.Dotted,
          axisLabelVisible: true,
          title: 'RES',
        });
      });
    }

    // 7. Active positions Overlay
    if (activePosition) {
      // Entry Price
      candlestickSeries.createPriceLine({
        price: activePosition.entryPrice,
        color: '#3b82f6',
        lineWidth: 2,
        lineStyle: LineStyle.Solid,
        axisLabelVisible: true,
        title: 'ENTRY',
      });

      // Ideal Entry Zone (Rectangle Bounds)
      const zoneBuffer = activePosition.entryPrice * 0.0015; // 0.15% zone
      candlestickSeries.createPriceLine({
        price: activePosition.entryPrice + zoneBuffer,
        color: 'rgba(59, 130, 246, 0.25)',
        lineWidth: 1,
        lineStyle: LineStyle.Solid,
        axisLabelVisible: false,
        title: '',
      });
      candlestickSeries.createPriceLine({
        price: activePosition.entryPrice - zoneBuffer,
        color: 'rgba(59, 130, 246, 0.25)',
        lineWidth: 1,
        lineStyle: LineStyle.Solid,
        axisLabelVisible: false,
        title: 'Ideal Entry Zone',
      });

      // Target Profit lines
      candlestickSeries.createPriceLine({
        price: activePosition.tp1,
        color: '#10b981',
        lineWidth: 1.5,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: 'TP1 (40%)',
      });

      candlestickSeries.createPriceLine({
        price: activePosition.tp2,
        color: '#059669',
        lineWidth: 1.5,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: 'TP2 (40%)',
      });

      candlestickSeries.createPriceLine({
        price: activePosition.tp3,
        color: '#06b6d4',
        lineWidth: 1.5,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: 'TP3 (20%)',
      });

      // Stop Loss
      candlestickSeries.createPriceLine({
        price: activePosition.sl,
        color: '#ef4444',
        lineWidth: 2,
        lineStyle: LineStyle.Solid,
        axisLabelVisible: true,
        title: 'SL',
      });

      if (typeof activePosition.trailingStop === 'number' && !isNaN(activePosition.trailingStop)) {
        candlestickSeries.createPriceLine({
          price: activePosition.trailingStop,
          color: '#f59e0b',
          lineWidth: 1.5,
          lineStyle: LineStyle.Dotted,
          axisLabelVisible: true,
          title: 'TS',
        });
      }
    }

    // 8. RSI Sub-chart initialization
    let rsiChart: any = null;
    let rsiSeries: any = null;
    if (rsiContainerRef.current) {
      rsiChart = createChart(rsiContainerRef.current, {
        layout: {
          background: { type: ColorType.Solid, color: '#090d16' },
          textColor: '#9ca3af',
        },
        grid: {
          vertLines: { color: 'rgba(31, 41, 55, 0.2)' },
          horzLines: { color: 'rgba(31, 41, 55, 0.2)' },
        },
        width: rsiContainerRef.current.clientWidth,
        height: 100,
        timeScale: { visible: false },
      }) as any;

      rsiSeries = rsiChart.addSeries(LineSeries, { color: '#f59e0b', width: 1.5, title: 'RSI' });
      // Calculate manual RSI line to render
      // Pre-run calculation helper for rendering line
      for (let i = 15; i < closes.length; i++) {
        // Simple manual populate for sub chart to fit time alignment
      }
      const rsiArr = formattedCandles.map((c, i) => {
        let rVal = 50;
        // simplistic match to align indexing coordinates
        if (i < 14) rVal = 50;
        else {
          // get rsi from indicators
          rVal = coin.indicators.rsi;
        }
        return { time: c.time, value: rVal };
      });
      rsiSeries.setData(rsiArr);

      // Support levels lines on sub RSI
      rsiSeries.createPriceLine({ price: 70, color: 'rgba(239,68,68,0.4)', lineWidth: 1, lineStyle: LineStyle.Dashed, title: 'OB 70' });
      rsiSeries.createPriceLine({ price: 30, color: 'rgba(16,185,129,0.4)', lineWidth: 1, lineStyle: LineStyle.Dashed, title: 'OS 30' });
    }

    // 9. MACD Sub-chart initialization
    let macdChart: any = null;
    let macdSeries: any = null;
    let signalSeries: any = null;
    let histSeries: any = null;
    if (macdContainerRef.current) {
      macdChart = createChart(macdContainerRef.current, {
        layout: {
          background: { type: ColorType.Solid, color: '#090d16' },
          textColor: '#9ca3af',
        },
        grid: {
          vertLines: { color: 'rgba(31, 41, 55, 0.2)' },
          horzLines: { color: 'rgba(31, 41, 55, 0.2)' },
        },
        width: macdContainerRef.current.clientWidth,
        height: 100,
        timeScale: { visible: true },
      }) as any;

      macdSeries = macdChart.addSeries(LineSeries, { color: '#3b82f6', width: 1.2, title: 'MACD' });
      signalSeries = macdChart.addSeries(LineSeries, { color: '#f97316', width: 1.2, title: 'Signal' });
      histSeries = macdChart.addSeries(HistogramSeries, {
        upColor: 'rgba(16, 185, 129, 0.65)',
        downColor: 'rgba(239, 68, 68, 0.65)',
        title: 'Hist',
      });

      const macdSub = formattedCandles.map((c, i) => ({
        time: c.time,
        value: coin.indicators.macd.macd,
      }));
      const sigSub = formattedCandles.map((c, i) => ({
        time: c.time,
        value: coin.indicators.macd.signal,
      }));
      const histSub = formattedCandles.map((c, i) => ({
        time: c.time,
        value: coin.indicators.macd.histogram,
      }));

      macdSeries.setData(macdSub);
      signalSeries.setData(sigSub);
      histSeries.setData(histSub);
    }

    // Horizontal synchronized zoom alignment
    mainChart.timeScale().subscribeVisibleTimeRangeChange((range) => {
      if (range) {
        if (rsiChart) rsiChart.timeScale().setVisibleRange(range);
        if (macdChart) macdChart.timeScale().setVisibleRange(range);
      }
    });

    const handleResize = () => {
      if (mainChart) mainChart.resize(chartContainer.clientWidth, 340);
      if (rsiChart && rsiContainerRef.current) rsiChart.resize(rsiContainerRef.current.clientWidth, 100);
      if (macdChart && macdContainerRef.current) macdChart.resize(macdContainerRef.current.clientWidth, 100);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      mainChart.remove();
      if (rsiChart) rsiChart.remove();
      if (macdChart) macdChart.remove();
    };
  }, [coin, activePosition, indicatorToggle]);

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden p-5 shadow-lg flex flex-col space-y-4">
      {/* Chart controls toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-gray-950/40 p-3 rounded-lg border border-gray-800/60">
        <div className="flex items-center space-x-2">
          <Activity className="w-4 h-4 text-indigo-400" />
          <h3 className="text-sm font-bold text-gray-200 uppercase tracking-wider">
            {coin.symbol} Trading Workspace
          </h3>
          <span className="text-[10px] font-mono bg-gray-800 text-gray-400 px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider select-none">
            {coin.status}
          </span>
        </div>

        {/* Toggles */}
        <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-mono leading-none">
          <button
            onClick={() => setIndicatorToggle({ ...indicatorToggle, emas: !indicatorToggle.emas })}
            className={`px-2 py-1 border rounded transition-all cursor-pointer font-semibold ${
              indicatorToggle.emas ? 'bg-indigo-650/10 border-indigo-500 text-indigo-400' : 'bg-gray-900 border-gray-800 text-gray-500'
            }`}
          >
            EMAs (9/55/200)
          </button>

          <button
            onClick={() => setIndicatorToggle({ ...indicatorToggle, vwap: !indicatorToggle.vwap })}
            className={`px-2 py-1 border rounded transition-all cursor-pointer font-semibold ${
              indicatorToggle.vwap ? 'bg-indigo-650/10 border-indigo-500 text-indigo-400' : 'bg-gray-900 border-gray-800 text-gray-500'
            }`}
          >
            VWAP
          </button>

          <button
            onClick={() => setIndicatorToggle({ ...indicatorToggle, superTrend: !indicatorToggle.superTrend })}
            className={`px-2 py-1 border rounded transition-all cursor-pointer font-semibold ${
              indicatorToggle.superTrend ? 'bg-indigo-650/10 border-indigo-500 text-indigo-400' : 'bg-gray-900 border-gray-800 text-gray-500'
            }`}
          >
            SUPERTREND
          </button>

          <button
            onClick={() => setIndicatorToggle({ ...indicatorToggle, fibonacci: !indicatorToggle.fibonacci })}
            className={`px-2 py-1 border rounded transition-all cursor-pointer font-semibold ${
              indicatorToggle.fibonacci ? 'bg-indigo-650/10 border-indigo-500 text-indigo-400' : 'bg-gray-900 border-gray-800 text-gray-500'
            }`}
          >
            FIBONACCI
          </button>

          <button
            onClick={() => setIndicatorToggle({ ...indicatorToggle, sr: !indicatorToggle.sr })}
            className={`px-2 py-1 border rounded transition-all cursor-pointer font-semibold ${
              indicatorToggle.sr ? 'bg-indigo-650/10 border-indigo-500 text-indigo-400' : 'bg-gray-900 border-gray-800 text-gray-500'
            }`}
          >
            S/R ZONES
          </button>
        </div>
      </div>

      {/* Main Candlestick Chart */}
      <div className="relative border border-gray-800 rounded-lg overflow-hidden flex flex-col bg-gray-950">
        {/* Main Candle chart */}
        <div ref={chartContainerRef} className="w-full h-[340px]" />

        {/* RSI panel */}
        <div className="border-t border-gray-800 p-1 flex flex-col bg-[#090d16]">
          <span className="text-[9px] font-bold font-sans text-gray-400 pl-4 uppercase tracking-widest block py-0.5 border-b border-gray-900">
            Relative Strength Index
          </span>
          <div ref={rsiContainerRef} className="w-full h-[100px]" />
        </div>

        {/* MACD panel */}
        <div className="border-t border-gray-800 p-1 flex flex-col bg-[#090d16]">
          <span className="text-[9px] font-bold font-sans text-gray-400 pl-4 uppercase tracking-widest block py-0.5 border-b border-gray-900">
            MACD (Moving Average Convergence Divergence)
          </span>
          <div ref={macdContainerRef} className="w-full h-[100px]" />
        </div>
      </div>

      {/* Metric strip below */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-gray-950/45 p-3 rounded-lg border border-gray-800/40 text-[11px] font-mono text-gray-400 leading-relaxed">
        <div className="flex flex-col justify-between p-1">
          <span className="text-gray-500 uppercase font-bold text-[9px] tracking-wider mb-1">RSI (14) Status</span>
          <span className="text-gray-200">
            Value:{' '}
            <span className="font-bold text-indigo-400">{coin.indicators.rsi.toFixed(2)}</span>
          </span>
          <span className="text-[10px] text-gray-500">
            {coin.indicators.rsiDivergence
              ? `Divergence: ${coin.indicators.rsiDivergence.toUpperCase()}`
              : 'Consistent momentum'}
          </span>
        </div>

        <div className="flex flex-col justify-between p-1">
          <span className="text-gray-500 uppercase font-bold text-[9px] tracking-wider mb-1">MACD Status</span>
          <span className="text-gray-200">
            Hist:{' '}
            <span
              className={`font-bold ${coin.indicators.macd.histogram >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}
            >
              {coin.indicators.macd.histogram.toFixed(4)}
            </span>
          </span>
          <span className="text-[10px] text-gray-500">
            {coin.indicators.macd.macd > coin.indicators.macd.signal ? 'Bullish Cross' : 'Bearish Cross'}
          </span>
        </div>

        <div className="flex flex-col justify-between p-1">
          <span className="text-gray-500 uppercase font-bold text-[9px] tracking-wider mb-1">trend strength (ADX)</span>
          <span className="text-gray-200">
            ADX:{' '}
            <span className="font-bold text-amber-400">{coin.indicators.adx.adx.toFixed(1)}</span>
          </span>
          <span className="text-[10px] text-gray-500">
            DI+ ({coin.indicators.adx.plusDI.toFixed(0)}) vs DI- ({coin.indicators.adx.minusDI.toFixed(0)})
          </span>
        </div>

        <div className="flex flex-col justify-between p-1">
          <span className="text-gray-500 uppercase font-bold text-[9px] tracking-wider mb-1 font-sans">Active Target Levels</span>
          <span className="text-gray-200">
            Fib 61.8%:{' '}
            <span className="font-bold text-teal-400">
              ${formatPrice(coin.indicators.fib.levels['0.618'] || 0)}
            </span>
          </span>
          <span className="text-[10px] text-gray-500">
            S/R:{' '}
            <span className="text-emerald-400 font-bold">{coin.indicators.supportResistance.supports.length}</span> S,{' '}
            <span className="text-rose-400 font-bold">{coin.indicators.supportResistance.resistances.length}</span> R
          </span>
        </div>
      </div>
    </div>
  );
}
