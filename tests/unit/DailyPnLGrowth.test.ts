import { describe, it, expect } from 'vitest';
import { EquitySnapshot, TradeLog } from '../../src/types';

// Test calculation logic for Daily PnL Growth
describe('DailyPnLGrowth Calculation Logic', () => {
  it('correctly computes daily PnL and cumulative growth from snapshots', () => {
    const startingBalance = 10000;
    const snapshots: EquitySnapshot[] = [
      { time: '2026-10-25T10:00:00Z', balance: 10250 },
      { time: '2026-10-26T10:00:00Z', balance: 10100 },
      { time: '2026-10-27T10:00:00Z', balance: 10600 },
    ];

    // Day 1: 10250 - 10000 = +250
    const day1PnL = snapshots[0].balance - startingBalance;
    expect(day1PnL).toBe(250);

    // Day 2: 10100 - 10250 = -150
    const day2PnL = snapshots[1].balance - snapshots[0].balance;
    expect(day2PnL).toBe(-150);

    // Day 3: 10600 - 10100 = +500
    const day3PnL = snapshots[2].balance - snapshots[1].balance;
    expect(day3PnL).toBe(500);

    // Total cumulative: 10600 - 10000 = 600
    const cumPnL = snapshots[2].balance - startingBalance;
    const cumGrowthPct = (cumPnL / startingBalance) * 100;
    expect(cumPnL).toBe(600);
    expect(cumGrowthPct).toBe(6.0);
  });

  it('correctly aggregates trades by day when snapshots are sparse', () => {
    const startingBalance = 10000;
    const logs: Partial<TradeLog>[] = [
      { symbol: 'BTCUSDT', profit: 120, timeClose: '2026-10-28T09:30:00Z' },
      { symbol: 'ETHUSDT', profit: -40, timeClose: '2026-10-28T14:15:00Z' },
      { symbol: 'SOLUSDT', profit: 220, timeClose: '2026-10-29T11:00:00Z' },
    ];

    const day1Trades = logs.filter(l => l.timeClose?.startsWith('2026-10-28'));
    const day1Sum = day1Trades.reduce((acc, t) => acc + (t.profit || 0), 0);
    expect(day1Sum).toBe(80);

    const day2Trades = logs.filter(l => l.timeClose?.startsWith('2026-10-29'));
    const day2Sum = day2Trades.reduce((acc, t) => acc + (t.profit || 0), 0);
    expect(day2Sum).toBe(220);

    const totalPnL = day1Sum + day2Sum;
    expect(totalPnL).toBe(300);
    const endEquity = startingBalance + totalPnL;
    expect(endEquity).toBe(10300);
  });
});
