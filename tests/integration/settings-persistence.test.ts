import { describe, it, expect } from 'vitest';
import { validateTradingSettings, CANONICAL_DEFAULT_SETTINGS } from '../../src/shared/TradingSettings.js';
import { recordSettingsAudit, getSettingsAudits } from '../../server/services/SettingsAuditService.js';

describe('Settings Overhaul & Persistence Integration', () => {
  it('validates and clamps out-of-bound numeric settings', () => {
    const invalidPayload = {
      leverage: 500,           // Max is 125
      accountRiskPct: -5,       // Min is 0.1
      maxConcurrentTrades: 99,  // Max is 50
      dailyLossLimitPct: 50,    // Max is 25
      scanInterval: 2,          // Min is 5
      autoTradeThreshold: 120   // Max is 100
    };

    const res = validateTradingSettings(invalidPayload);
    expect(res.valid).toBe(true);
    expect(res.warnings.length).toBeGreaterThan(0);
    expect(res.sanitized.leverage).toBe(125);
    expect(res.sanitized.accountRiskPct).toBe(0.1);
    expect(res.sanitized.maxConcurrentTrades).toBe(50);
    expect(res.sanitized.dailyLossLimitPct).toBe(25);
    expect(res.sanitized.scanInterval).toBe(5);
    expect(res.sanitized.autoTradeThreshold).toBe(100);
  });

  it('rejects completely invalid non-numeric inputs', () => {
    const badTypes = {
      leverage: 'not-a-number'
    };
    const res = validateTradingSettings(badTypes);
    expect(res.valid).toBe(false);
    expect(res.errors.length).toBeGreaterThan(0);
  });

  it('provides identical canonical defaults for frontend and backend', () => {
    expect(CANONICAL_DEFAULT_SETTINGS.accountRiskPct).toBe(1);
    expect(CANONICAL_DEFAULT_SETTINGS.leverage).toBe(1);
    expect(CANONICAL_DEFAULT_SETTINGS.positionSizePct).toBe(10);
    expect(CANONICAL_DEFAULT_SETTINGS.maxConcurrentTrades).toBe(10);
    expect(CANONICAL_DEFAULT_SETTINGS.autoTradeThreshold).toBe(75);
    expect(CANONICAL_DEFAULT_SETTINGS.timeframe).toBe('5m');
  });

  it('records settings changes into audit trail with redacting credentials', () => {
    const before = {
      accountRiskPct: 1.0,
      leverage: 1,
      binanceApiKey: 'my-super-secret-key',
      binanceApiSecret: 'my-super-secret-pass'
    };

    const after = {
      accountRiskPct: 2.0,
      leverage: 5,
      binanceApiKey: 'my-new-secret-key',
      binanceApiSecret: 'my-new-secret-pass'
    };

    const record = recordSettingsAudit(before, after, 99, 'FRONTEND');
    expect(record.action).toBe('SETTINGS_UPDATED');
    expect(record.version).toBe(99);
    expect(record.changedFields).toContain('accountRiskPct');
    expect(record.changedFields).toContain('leverage');
    expect(record.changedFields).toContain('binanceApiKey');

    // Secrets MUST be redacted
    expect(record.before.binanceApiKey).toBe('[REDACTED]');
    expect(record.after.binanceApiKey).toBe('[REDACTED]');
    expect(record.before.binanceApiSecret).toBe('[REDACTED]');
    expect(record.after.binanceApiSecret).toBe('[REDACTED]');

    // Unredacted numbers preserved
    expect(record.before.accountRiskPct).toBe(1.0);
    expect(record.after.accountRiskPct).toBe(2.0);

    const audits = getSettingsAudits();
    expect(audits.some(a => a.auditId === record.auditId)).toBe(true);
  });
});
