import { describe, it, expect, vi } from 'vitest';
import { AutoTrader } from '../../server/services/AutoTrader.js';
import { oms } from '../../server/services/OMS.js';

describe('Trade Execution Governance: 4-Hour Higher Timeframe (4H HTF) Directional Alignment', () => {
  // Helper to generate synthetic 4-hour klines
  function generate4hKlines(count: number, trend: 'BULLISH' | 'BEARISH' | 'CHOP'): any[] {
    const klines: any[] = [];
    let price = 50000;
    const now = Date.now();
    const intervalMs = 4 * 60 * 60 * 1000; // 4 hours in ms

    for (let i = 0; i < count; i++) {
      let open = price;
      let change = 0;
      if (trend === 'BULLISH') {
        change = price * 0.008; // Steady 4H upward push
      } else if (trend === 'BEARISH') {
        change = -price * 0.008; // Steady 4H downward push
      } else {
        change = (i % 2 === 0 ? 1 : -1) * price * 0.001; // tight flat chop
      }

      let close = open + change;
      let high = Math.max(open, close) + price * 0.002;
      let low = Math.min(open, close) - price * 0.002;
      let volume = 5000;
      const openTimeMs = now - (count - 1 - i) * intervalMs;
      const closeTimeMs = openTimeMs + intervalMs;

      klines.push({
        time: Math.floor(openTimeMs / 1000),
        open,
        high,
        low,
        close,
        volume,
        closeTime: Math.floor(closeTimeMs / 1000)
      });
      price = close;
    }
    return klines;
  }

  it('permits LONG trades ONLY when 4H HTF direction is confirmed BULLISH', async () => {
    const autoTrader = new AutoTrader();
    const bullishKlines = generate4hKlines(60, 'BULLISH');

    // Mock getKlines on autoTrader to return our synthetic 4H klines
    vi.spyOn(autoTrader as any, 'getKlines').mockResolvedValue(bullishKlines);

    const longCheck = await autoTrader.checkHtfAgreement('BTCUSDT', 'LONG');
    expect(longCheck.passed).toBe(true);
    expect(longCheck.htfBias).toBe('BULLISH');

    // In a BULLISH 4H HTF, SHORT trades must be strictly vetoed
    const shortCheck = await autoTrader.checkHtfAgreement('BTCUSDT', 'SHORT');
    expect(shortCheck.passed).toBe(false);
    expect(shortCheck.reason).toContain('BULLISH');
  });

  it('permits SHORT trades ONLY when 4H HTF direction is confirmed BEARISH', async () => {
    const autoTrader = new AutoTrader();
    const bearishKlines = generate4hKlines(60, 'BEARISH');

    vi.spyOn(autoTrader as any, 'getKlines').mockResolvedValue(bearishKlines);

    const shortCheck = await autoTrader.checkHtfAgreement('ETHUSDT', 'SHORT');
    expect(shortCheck.passed).toBe(true);
    expect(shortCheck.htfBias).toBe('BEARISH');

    // In a BEARISH 4H HTF, LONG trades must be strictly vetoed
    const longCheck = await autoTrader.checkHtfAgreement('ETHUSDT', 'LONG');
    expect(longCheck.passed).toBe(false);
    expect(longCheck.reason).toContain('BEARISH');
  });

  it('vetoes ALL trades (both LONG and SHORT) when 4H HTF is NEUTRAL/CHOPPY', async () => {
    const autoTrader = new AutoTrader();
    const chopKlines = generate4hKlines(60, 'CHOP');

    vi.spyOn(autoTrader as any, 'getKlines').mockResolvedValue(chopKlines);

    const longCheck = await autoTrader.checkHtfAgreement('SOLUSDT', 'LONG');
    expect(longCheck.passed).toBe(false);
    expect(longCheck.htfBias).toBe('NEUTRAL');

    const shortCheck = await autoTrader.checkHtfAgreement('SOLUSDT', 'SHORT');
    expect(shortCheck.passed).toBe(false);
    expect(shortCheck.htfBias).toBe('NEUTRAL');
  });

  it('vetoes trades when 4H HTF candle data is insufficient (<30 bars)', async () => {
    const autoTrader = new AutoTrader();
    const shortKlines = generate4hKlines(15, 'BULLISH');

    vi.spyOn(autoTrader as any, 'getKlines').mockResolvedValue(shortKlines);

    const check = await autoTrader.checkHtfAgreement('NEWCOIN', 'LONG');
    expect(check.passed).toBe(false);
    expect(check.reason).toContain('<30 bars');
  });
});

describe('Trade Execution Governance: Accurate Setup Verification', () => {
  const autoTrader = new AutoTrader();
  (autoTrader as any).settings.autoTradeThreshold = 70;

  it('approves a mathematically accurate LONG setup', () => {
    const currentPrice = 100;
    const signal = {
      direction: 'LONG' as const,
      score: 85,
      sl: 98,    // 2% stop loss below entry
      tp1: 104,  // 4% target above entry (1:2 R:R)
      tp3: 106,  // 6% target (1:3 R:R)
      strategy: 'TREND_PULLBACK'
    };

    const result = autoTrader.validateAccurateSetup(signal, currentPrice, []);
    expect(result.accurate).toBe(true);
  });

  it('approves a mathematically accurate SHORT setup', () => {
    const currentPrice = 100;
    const signal = {
      direction: 'SHORT' as const,
      score: 80,
      sl: 102,   // 2% stop loss above entry
      tp1: 96,   // 4% target below entry (1:2 R:R)
      tp3: 94,   // 6% target (1:3 R:R)
      strategy: 'ORDER_BLOCK'
    };

    const result = autoTrader.validateAccurateSetup(signal, currentPrice, []);
    expect(result.accurate).toBe(true);
  });

  it('rejects inaccurate LONG setup where Stop-Loss is above entry price', () => {
    const currentPrice = 100;
    const invalidSignal = {
      direction: 'LONG' as const,
      score: 85,
      sl: 103, // Inaccurate: SL above entry on a Long
      tp1: 108
    };

    const result = autoTrader.validateAccurateSetup(invalidSignal, currentPrice, []);
    expect(result.accurate).toBe(false);
    expect(result.reason).toContain('Stop-Loss ($103) must be below current price');
  });

  it('rejects inaccurate SHORT setup where Stop-Loss is below entry price', () => {
    const currentPrice = 100;
    const invalidSignal = {
      direction: 'SHORT' as const,
      score: 85,
      sl: 97, // Inaccurate: SL below entry on a Short
      tp1: 90
    };

    const result = autoTrader.validateAccurateSetup(invalidSignal, currentPrice, []);
    expect(result.accurate).toBe(false);
    expect(result.reason).toContain('Stop-Loss ($97) must be above current price');
  });

  it('rejects inaccurate LONG setup where Take-Profit is below entry price', () => {
    const currentPrice = 100;
    const invalidSignal = {
      direction: 'LONG' as const,
      score: 85,
      sl: 98,
      tp1: 95 // Inaccurate: Target below entry on a Long
    };

    const result = autoTrader.validateAccurateSetup(invalidSignal, currentPrice, []);
    expect(result.accurate).toBe(false);
    expect(result.reason).toContain('Take-Profit target ($95) must be above current price');
  });

  it('rejects inaccurate SHORT setup where Take-Profit is above entry price', () => {
    const currentPrice = 100;
    const invalidSignal = {
      direction: 'SHORT' as const,
      score: 85,
      sl: 102,
      tp1: 105 // Inaccurate: Target above entry on a Short
    };

    const result = autoTrader.validateAccurateSetup(invalidSignal, currentPrice, []);
    expect(result.accurate).toBe(false);
    expect(result.reason).toContain('Take-Profit target ($105) must be below current price');
  });

  it('rejects setups with sub-minimum Risk:Reward ratio (<1.5)', () => {
    const currentPrice = 100;
    const poorRrSignal = {
      direction: 'LONG' as const,
      score: 85,
      sl: 97,   // Risk = 3
      tp1: 101, // Reward = 1 (R:R = 0.33)
      tp3: 101
    };

    const result = autoTrader.validateAccurateSetup(poorRrSignal, currentPrice, []);
    expect(result.accurate).toBe(false);
    expect(result.reason).toContain('Insufficient setup R:R ratio');
  });

  it('rejects setups with score below autoTradeThreshold', () => {
    const currentPrice = 100;
    const lowScoreSignal = {
      direction: 'LONG' as const,
      score: 55, // below default 70 threshold
      sl: 98,
      tp1: 105
    };

    const result = autoTrader.validateAccurateSetup(lowScoreSignal, currentPrice, []);
    expect(result.accurate).toBe(false);
    expect(result.reason).toContain('below minimum threshold');
  });

  it('OMS placeOrder rejects order with inverted Stop-Loss or Take-Profit', async () => {
    await expect(oms.placeOrder('BTCUSDT', 'LONG', 50000, 85, 500, {
      sl: 52000, // Inverted: SL above entry for Long
      tp1: 55000
    })).rejects.toThrow('Inaccurate setup: Long SL ($52000) must be strictly below entry price ($50000)');

    await expect(oms.placeOrder('BTCUSDT', 'SHORT', 50000, 85, 500, {
      sl: 48000, // Inverted: SL below entry for Short
      tp1: 45000
    })).rejects.toThrow('Inaccurate setup: Short SL ($48000) must be strictly above entry price ($50000)');
  });
});
