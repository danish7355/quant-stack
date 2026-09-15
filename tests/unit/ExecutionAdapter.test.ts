import { describe, it, expect, beforeEach } from 'vitest';
import { ExecutionAdapter } from '../../server/services/ExecutionAdapter';

describe('ExecutionAdapter - Security & Live Mode', () => {
  let adapter: ExecutionAdapter;

  beforeEach(() => {
    adapter = new ExecutionAdapter();
  });

  it('blocks live mode if double-confirmation is missing', () => {
    // Attempt to set live directly
    const success = adapter.setMode(true, 'dummy_key', 'dummy_secret');
    expect(success).toBe(false);
    
    // Verify it remained in sandbox mode
    // (ccxt sandbox URLs usually contain 'testnet' or sandbox flags, but internally we can check behavior if needed)
    // We'll rely on the boolean return for this test.
  });

  it('allows live mode ONLY after correct unlock phrase', () => {
    // Incorrect phrase
    adapter.unlockLiveMode('yes please');
    expect(adapter.setMode(true, 'dummy', 'dummy')).toBe(false);

    // Correct phrase
    const unlocked = adapter.unlockLiveMode('I_ACKNOWLEDGE_RISK_AND_ENABLE_LIVE_TRADING');
    expect(unlocked).toBe(true);
    
    const success = adapter.setMode(true, 'dummy', 'dummy');
    expect(success).toBe(true);
  });
});
