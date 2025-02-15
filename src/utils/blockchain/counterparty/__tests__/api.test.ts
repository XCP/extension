import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { fetchTokenBalances } from '@/utils/blockchain/counterparty/api';

vi.mock('axios');

describe('Counterparty API Utilities', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should return token balances array on a valid response', async () => {
    const mockData = { result: [{ asset: 'XCP', quantity_normalized: '100.00000000' }] };
    (axios.get as any).mockResolvedValue({ data: mockData });
    const balances = await fetchTokenBalances('dummy-address', { verbose: true });
    expect(Array.isArray(balances)).toBe(true);
    expect(balances[0].asset).toBe('XCP');
  });

  it('should return an empty array if response format is invalid', async () => {
    (axios.get as any).mockResolvedValue({ data: { result: null } });
    const balances = await fetchTokenBalances('dummy-address');
    expect(balances).toEqual([]);
  });
});
