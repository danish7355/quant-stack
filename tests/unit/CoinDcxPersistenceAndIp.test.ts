import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { executionAdapter } from '../../server/services/ExecutionAdapter';
import { autoTrader } from '../../server/services/AutoTrader';

describe('CoinDCX Credentials Persistence & Outbound IP Integration', () => {
  let originalKey = '';
  let originalSecret = '';
  let originalMarginCurrency = 'INR';

  beforeAll(() => {
    const s = autoTrader.getSettings();
    originalKey = s.coindcxApiKey || '';
    originalSecret = s.coindcxApiSecret || '';
    originalMarginCurrency = s.coindcxMarginCurrency || 'INR';
  });

  afterAll(async () => {
    if (originalKey || originalSecret) {
      await autoTrader.saveSettings({
        coindcxApiKey: originalKey,
        coindcxApiSecret: originalSecret,
        coindcxMarginCurrency: originalMarginCurrency
      });
    }
  });
  it('resolves outbound egress IP without error', async () => {
    const ipInfo = await executionAdapter.getPublicOutboundIp();
    expect(ipInfo).toBeDefined();
    expect(typeof ipInfo.ip).toBe('string');
    expect(ipInfo.ip.length).toBeGreaterThan(0);
    expect(ipInfo.isDynamic).toBe(true);
  });

  it('safeguards stored credentials against empty overwrite during settings updates', async () => {
    // Save valid CoinDCX credentials
    const initialKey = 'test_coindcx_key_1234567890abcdef';
    const initialSecret = 'test_coindcx_secret_1234567890abcdef';
    
    await autoTrader.saveSettings({
      coindcxApiKey: initialKey,
      coindcxApiSecret: initialSecret,
      coindcxMarginCurrency: 'INR'
    });

    const settingsAfterSave = autoTrader.getSettings();
    expect(settingsAfterSave.coindcxApiKey).toBe(initialKey);
    expect(settingsAfterSave.coindcxApiSecret).toBe(initialSecret);

    // Simulate an incoming settings update where secret is masked or empty string
    await autoTrader.saveSettings({
      coindcxApiKey: '',
      coindcxApiSecret: '',
      maxTradeMarginInr: 250
    });

    // Keys must remain intact and NOT be cleared
    const settingsAfterEmptyUpdate = autoTrader.getSettings();
    expect(settingsAfterEmptyUpdate.coindcxApiKey).toBe(initialKey);
    expect(settingsAfterEmptyUpdate.coindcxApiSecret).toBe(initialSecret);
    expect(settingsAfterEmptyUpdate.maxTradeMarginInr).toBe(250);
  });

  it('provides actionable guidance on CoinDCX authentication failure with mandatory IP whitelist details', async () => {
    const dummyKey = 'invalid_dummy_key_000000000000';
    const dummySecret = 'invalid_dummy_secret_000000000000';
    const res = await executionAdapter.testCoinDcxCredentials(dummyKey, dummySecret);
    expect(res.success).toBe(false);
    expect(res.guidance).toBeDefined();
    expect(res.guidance).toContain("MANDATORY IP WHITELIST");
    expect(res.guidance).toContain("Bind IP Address");
  });
});
