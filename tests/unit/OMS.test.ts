import { describe, it, expect } from 'vitest';
import { oms } from '../../server/services/OMS';

describe('OMS', () => {
  it('instantiates correctly', () => {
    expect(oms).toBeDefined();
  });
});
