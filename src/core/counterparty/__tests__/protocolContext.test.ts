import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/core/counterparty/api', () => ({
  fetchAssetDetails: vi.fn(),
  fetchAssetFairminter: vi.fn(),
  fetchAssetHolderCount: vi.fn(),
  fetchOrder: vi.fn(),
  fetchOrderMatch: vi.fn(),
  fetchUtxoBalances: vi.fn(),
}));
vi.mock('@/core/counterparty/dispenseOutcome', () => ({
  describePayout: vi.fn(),
  resolveDispensersAt: vi.fn(),
}));
vi.mock('@/core/bitcoin/blockHeight', () => ({
  getCurrentBlockHeight: vi.fn(async () => 0),
}));

import { fetchAssetDetails, fetchAssetFairminter, fetchAssetHolderCount } from '@/core/counterparty/api';
import { resolveProtocolContext } from '../protocolContext';

/** A fairmint of `asset`, the shape the approval screen resolves context from. */
const fairmintOf = (asset: string) => ({ messageType: 'fairmint', data: { asset } });

describe('resolveProtocolContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('XCP figures', () => {
    it('trims a fairminter price to its significant digits', async () => {
      // What core actually sends: the normalized figure at full working precision.
      vi.mocked(fetchAssetFairminter).mockResolvedValue({
        price_normalized: '0.00001000000000000',
      } as any);

      const { context } = await resolveProtocolContext(fairmintOf('MYASSET'));
      expect(context.protocolFeeXcp).toBe('0.00001');
    });

    it('keeps every one of the eight places XCP is divisible to', async () => {
      vi.mocked(fetchAssetFairminter).mockResolvedValue({
        price_normalized: '1.23456789000000000',
      } as any);

      const { context } = await resolveProtocolContext(fairmintOf('MYASSET'));
      expect(context.protocolFeeXcp).toBe('1.23456789');
    });

    it('states a price too small to show as a bound rather than as zero', async () => {
      vi.mocked(fetchAssetFairminter).mockResolvedValue({
        price_normalized: '0.000000001',
      } as any);

      const { context } = await resolveProtocolContext(fairmintOf('MYASSET'));
      // "0 XCP" on a price row would read as a free mint.
      expect(context.protocolFeeXcp).toBe('<0.00000001');
    });

    it('trims the protocol fee carried by the message itself', async () => {
      const { context } = await resolveProtocolContext({
        messageType: 'attach',
        data: { asset: 'MYASSET' },
        apiMessageData: { fee: 50000000 },
      });

      expect(context.protocolFeeXcp).toBe('0.5');
    });

    it('leaves a fairminter with no price unpriced', async () => {
      vi.mocked(fetchAssetFairminter).mockResolvedValue({ price_normalized: null } as any);

      const { context } = await resolveProtocolContext(fairmintOf('MYASSET'));
      expect(context.protocolFeeXcp).toBeUndefined();
    });
  });

  describe('dividend figures', () => {
    it('trims the total payout and the XCP fee', async () => {
      vi.mocked(fetchAssetDetails).mockResolvedValue({ supply_normalized: '1000' } as any);
      vi.mocked(fetchAssetHolderCount).mockResolvedValue(3);

      const { context } = await resolveProtocolContext({
        messageType: 'dividend',
        data: { asset: 'MYASSET', quantityPerUnit: 100000 }, // 0.001 per unit
      });

      expect(context.dividendTotal).toBe('1');
      expect(context.dividendFeeXcp).toBe('0.0006');
    });
  });
});
