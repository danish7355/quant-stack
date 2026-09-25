import { describe, it, expect } from 'vitest';
import { mapRawPositionsToFrontend, mergeServerSettingsWithLocal } from '../../src/App';
import { AppSettings, CANONICAL_DEFAULT_SETTINGS } from '../../src/types';

describe('Frontend-Backend Synchronization & Integration Suite', () => {
  describe('mapRawPositionsToFrontend', () => {
    it('gracefully handles empty, null, or undefined array inputs', () => {
      expect(mapRawPositionsToFrontend([])).toEqual([]);
      expect(mapRawPositionsToFrontend(null as any)).toEqual([]);
      expect(mapRawPositionsToFrontend(undefined as any)).toEqual([]);
    });

    it('correctly maps raw backend positions to frontend models with accurate PnL for LONG positions', () => {
      const rawPositions = [
        {
          id: 'pos-btc-1',
          symbol: 'BTCUSDT',
          direction: 'LONG',
          entry_price: 60000,
          current_price: 63000, // +5%
          quantity: 0.1,
          leverage: 10,
          allocated_balance: 600,
          tp1: 62000,
          tp2: 64000,
          tp3: 66000,
          sl: 59000,
          trailing_stop_active: 1,
          time_open: '2026-09-25T10:00:00.000Z',
          score_at_entry: 85,
          strategy: 'TREND_PULLBACK',
          market_regime: 'Trending [EMA Pullback]',
          is_auto_regime: true,
          frequency_preset: 'MEDIUM'
        }
      ];

      const mapped = mapRawPositionsToFrontend(rawPositions);
      expect(mapped).toHaveLength(1);
      const pos = mapped[0];

      expect(pos.id).toBe('pos-btc-1');
      expect(pos.symbol).toBe('BTCUSDT');
      expect(pos.direction).toBe('LONG');
      expect(pos.entryPrice).toBe(60000);
      expect(pos.currentPrice).toBe(63000);
      expect(pos.leverage).toBe(10);
      expect(pos.allocatedBalance).toBe(600);
      expect(pos.trailingStopActive).toBe(true);
      expect(pos.isAutoRegime).toBe(true);

      // Price delta = (63000 - 60000) / 60000 = 0.05 (+5%)
      // PnL = 0.05 * 600 * 10 = 300
      expect(pos.unrealizedPnl).toBeCloseTo(300, 2);
    });

    it('correctly maps raw backend positions with accurate PnL for SHORT positions', () => {
      const rawPositions = [
        {
          id: 'pos-eth-1',
          symbol: 'ETHUSDT',
          direction: 'SHORT',
          entry_price: 3000,
          current_price: 2850, // -5% (profitable for short)
          quantity: 1,
          leverage: 5,
          allocated_balance: 600,
          tp1: 2900,
          tp2: 2800,
          tp3: 2700,
          sl: 3100,
          trailing_stop_active: 0,
          time_open: '2026-09-25T10:15:00.000Z',
          score_at_entry: 90,
          strategy: 'VOLATILITY_COMPRESSION',
          market_regime: 'Consolidation Squeeze',
          is_auto_regime: false,
          frequency_preset: 'LOW'
        }
      ];

      const mapped = mapRawPositionsToFrontend(rawPositions);
      expect(mapped).toHaveLength(1);
      const pos = mapped[0];

      expect(pos.id).toBe('pos-eth-1');
      expect(pos.direction).toBe('SHORT');
      expect(pos.trailingStopActive).toBe(false);
      // Price delta for SHORT = (3000 - 2850) / 3000 = +0.05
      // PnL = 0.05 * 600 * 5 = 150
      expect(pos.unrealizedPnl).toBeCloseTo(150, 2);
    });

    it('handles camelCase and fallback fields from client/adapter formats', () => {
      const rawPositions = [
        {
          id: 'pos-sol-1',
          symbol: 'SOLUSDT',
          direction: 'LONG',
          entryPrice: 150,
          currentPrice: 150,
          quantity: 2,
          leverage: 2,
          allocatedBalance: 150,
          trailingStop: 145,
          trailingStopActive: true,
          isAutoRegime: false,
          score: 78
        }
      ];

      const mapped = mapRawPositionsToFrontend(rawPositions);
      expect(mapped).toHaveLength(1);
      expect(mapped[0].entryPrice).toBe(150);
      expect(mapped[0].currentPrice).toBe(150);
      expect(mapped[0].unrealizedPnl).toBe(0);
      expect(mapped[0].trailingStopActive).toBe(true);
      expect(mapped[0].trailingStop).toBe(145);
      expect(mapped[0].scoreAtEntry).toBe(78);
    });
  });

  describe('mergeServerSettingsWithLocal', () => {
    it('preserves existing local unmasked credentials when server returns masked values', () => {
      const localSettings: AppSettings = {
        ...CANONICAL_DEFAULT_SETTINGS,
        telegramBotToken: '1234567890:ABCdefGHIjklMNOpqrsTUVwxyz',
        telegramChatId: '987654321',
        binanceApiKey: 'my_real_binance_api_key_12345678',
        binanceApiSecret: 'my_real_secret_key_87654321'
      };

      const serverSettings: Partial<AppSettings> = {
        accountRiskPct: 2.5,
        leverage: 15,
        telegramBotToken: '123456****',
        binanceApiKey: 'my_r****5678',
        binanceApiSecret: '••••••••',
        autoTradeEnabled: true
      };

      const merged = mergeServerSettingsWithLocal(localSettings, serverSettings);

      // Trading parameters updated
      expect(merged.accountRiskPct).toBe(2.5);
      expect(merged.leverage).toBe(15);
      expect(merged.autoTradeEnabled).toBe(true);

      // Credentials preserved as local unmasked strings
      expect(merged.telegramBotToken).toBe('1234567890:ABCdefGHIjklMNOpqrsTUVwxyz');
      expect(merged.binanceApiKey).toBe('my_real_binance_api_key_12345678');
      expect(merged.binanceApiSecret).toBe('my_real_secret_key_87654321');
      expect(merged.telegramChatId).toBe('987654321');
    });

    it('accepts new credentials when server provides unmasked values and local had empty credentials', () => {
      const localSettings: AppSettings = {
        ...CANONICAL_DEFAULT_SETTINGS,
        telegramBotToken: '',
        telegramChatId: '',
        binanceApiKey: '',
        binanceApiSecret: ''
      };

      const serverSettings: Partial<AppSettings> = {
        telegramBotToken: '9898989898:XYZ',
        telegramChatId: '11223344',
        binanceApiKey: 'new_api_key_12345',
        binanceApiSecret: 'new_secret_key_54321'
      };

      const merged = mergeServerSettingsWithLocal(localSettings, serverSettings);

      expect(merged.telegramBotToken).toBe('9898989898:XYZ');
      expect(merged.telegramChatId).toBe('11223344');
      expect(merged.binanceApiKey).toBe('new_api_key_12345');
      expect(merged.binanceApiSecret).toBe('new_secret_key_54321');
    });
  });

  describe('Parameter & Payload Discrepancy Resolution', () => {
    it('resolves close payload arguments whether sent as id or positionId, currentPrice or closePrice, reason or exitReason', () => {
      const resolveCloseArgs = (body: any) => {
        const id = body?.id || body?.positionId;
        const currentPrice = body?.currentPrice ?? body?.closePrice;
        const reason = body?.reason || body?.exitReason || 'MANUAL';
        return { id, currentPrice, reason };
      };

      // Standard format
      const std = resolveCloseArgs({ id: 'pos-123', currentPrice: 65000, reason: 'TP3' });
      expect(std).toEqual({ id: 'pos-123', currentPrice: 65000, reason: 'TP3' });

      // Alternative UI format
      const alt = resolveCloseArgs({ positionId: 'pos-456', closePrice: 3200, exitReason: 'SL' });
      expect(alt).toEqual({ id: 'pos-456', currentPrice: 3200, reason: 'SL' });

      // Default fallback reason
      const fallback = resolveCloseArgs({ id: 'pos-789', currentPrice: 150 });
      expect(fallback).toEqual({ id: 'pos-789', currentPrice: 150, reason: 'MANUAL' });
    });
  });
});
