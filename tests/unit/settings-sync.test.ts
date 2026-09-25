import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { isQuotaError, isQuotaExhausted, markQuotaExhausted, clearQuotaExhausted } from '../../server/services/firestoreSafe.js';
import { AutoTrader } from '../../server/services/AutoTrader.js';
import { CANONICAL_DEFAULT_SETTINGS } from '../../src/shared/TradingSettings.js';

describe('Settings Synchronization & Cloud Persistence', () => {
  let autoTrader: AutoTrader;

  beforeEach(() => {
    clearQuotaExhausted();
    autoTrader = new AutoTrader();
  });

  afterEach(() => {
    clearQuotaExhausted();
  });

  describe('Credential Protection during Merge', () => {
    it('does not overwrite non-empty credentials with empty strings or whitespace', () => {
      const base = {
        ...CANONICAL_DEFAULT_SETTINGS,
        telegramBotToken: '123456:REAL_TOKEN',
        telegramChatId: '987654321',
        binanceApiKey: 'API_KEY_123',
        binanceApiSecret: 'API_SECRET_456'
      };

      const incoming = {
        telegramBotToken: '',
        telegramChatId: '   ',
        binanceApiKey: '',
        binanceApiSecret: ''
      };

      const result = autoTrader.mergeSettingsPreservingCredentials(base as any, incoming as any);
      expect(result.telegramBotToken).toBe('123456:REAL_TOKEN');
      expect(result.telegramChatId).toBe('987654321');
      expect(result.binanceApiKey).toBe('API_KEY_123');
      expect(result.binanceApiSecret).toBe('API_SECRET_456');
    });

    it('does not overwrite non-empty credentials with masked tokens (**** or ••••)', () => {
      const base = {
        ...CANONICAL_DEFAULT_SETTINGS,
        telegramBotToken: '123456:REAL_TOKEN',
        telegramChatId: '987654321',
        binanceApiKey: 'REAL_API_KEY_XYZ',
        binanceApiSecret: 'REAL_SECRET_XYZ'
      };

      const incoming = {
        telegramBotToken: '123456****',
        telegramChatId: '987654****',
        binanceApiKey: 'REAL****XYZ',
        binanceApiSecret: '••••••••'
      };

      const result = autoTrader.mergeSettingsPreservingCredentials(base as any, incoming as any);
      expect(result.telegramBotToken).toBe('123456:REAL_TOKEN');
      expect(result.telegramChatId).toBe('987654321');
      expect(result.binanceApiKey).toBe('REAL_API_KEY_XYZ');
      expect(result.binanceApiSecret).toBe('REAL_SECRET_XYZ');
    });

    it('allows updating credentials with new valid strings', () => {
      const base = {
        ...CANONICAL_DEFAULT_SETTINGS,
        telegramBotToken: '123456:OLD_TOKEN',
        telegramChatId: '111111'
      };

      const incoming = {
        telegramBotToken: '888888:NEW_VALID_TOKEN',
        telegramChatId: '222222'
      };

      const result = autoTrader.mergeSettingsPreservingCredentials(base as any, incoming as any);
      expect(result.telegramBotToken).toBe('888888:NEW_VALID_TOKEN');
      expect(result.telegramChatId).toBe('222222');
    });

    it('correctly updates non-credential fields', () => {
      const base = {
        ...CANONICAL_DEFAULT_SETTINGS,
        accountRiskPct: 1.0,
        leverage: 5,
        activeStrategy: 'VOLATILITY_COMPRESSION' as const
      };

      const incoming = {
        accountRiskPct: 2.5,
        leverage: 10,
        activeStrategy: 'TREND_PULLBACK' as const
      };

      const result = autoTrader.mergeSettingsPreservingCredentials(base as any, incoming as any);
      expect(result.accountRiskPct).toBe(2.5);
      expect(result.leverage).toBe(10);
      expect(result.activeStrategy).toBe('TREND_PULLBACK');
    });
  });

  describe('Firestore Quota & Timeout Separation', () => {
    it('does NOT treat network timeout as quota exhaustion', () => {
      const timeoutError = new Error('Firestore timeout');
      expect(isQuotaError(timeoutError)).toBe(false);
      expect(isQuotaExhausted()).toBe(false);
    });

    it('treats resource-exhausted and quota errors as quota exhaustion', () => {
      const quotaErr1 = new Error('RESOURCE_EXHAUSTED: Quota limit exceeded');
      const quotaErr2 = { code: 'resource-exhausted', message: 'Quota exceeded' };

      expect(isQuotaError(quotaErr1)).toBe(true);
      expect(isQuotaError(quotaErr2)).toBe(true);

      markQuotaExhausted(60000);
      expect(isQuotaExhausted()).toBe(true);

      clearQuotaExhausted();
      expect(isQuotaExhausted()).toBe(false);
    });
  });
});
