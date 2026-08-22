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

/** A fairmint of `quantity` base units of `asset`, the shape the approval screen resolves context from. */
const fairmintOf = (asset: string, quantity: number = 1) => ({
  messageType: 'fairmint',
  data: { asset, quantity },
});

describe('resolveProtocolContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('XCP figures', () => {
    it('charges the whole mint, not one unit of it', async () => {
      // 10 XCP buys a lot of 1,000,000 (divisible) units. price_normalized is per unit — 0.00001 —
      // and that is what a 10 XCP mint was being shown as costing.
      vi.mocked(fetchAssetFairminter).mockResolvedValue({
        price: 1000000000,
        price_normalized: '0.00001000000000000',
        quantity_by_price: 100000000000000,
        quantity_by_price_normalized: '1000000.00000000',
        pool_quantity: 500000000000,
      } as any);

      const { context } = await resolveProtocolContext(fairmintOf('FAFOMFERS', 100000000000000));
      expect(context.protocolFeeXcp).toBe('10');
      expect(context.fairmintPaymentModel).toBe('pool');
    });

    it('charges by the lot for several lots', async () => {
      vi.mocked(fetchAssetFairminter).mockResolvedValue({
        price: 150000000,
        quantity_by_price: 1000,
        burn_payment: true,
      } as any);

      const { context } = await resolveProtocolContext(fairmintOf('MYASSET', 3000));
      expect(context.protocolFeeXcp).toBe('4.5');
      expect(context.fairmintPaymentModel).toBe('burned');
    });

    it('trims a fairminter price to its significant digits', async () => {
      vi.mocked(fetchAssetFairminter).mockResolvedValue({
        price: 1000,
        quantity_by_price: 1,
      } as any);

      const { context } = await resolveProtocolContext(fairmintOf('MYASSET'));
      expect(context.protocolFeeXcp).toBe('0.00001');
      expect(context.fairmintPaymentModel).toBe('paid');
    });

    it('keeps every one of the eight places XCP is divisible to', async () => {
      vi.mocked(fetchAssetFairminter).mockResolvedValue({
        price: 123456789,
        quantity_by_price: 1,
      } as any);

      const { context } = await resolveProtocolContext(fairmintOf('MYASSET'));
      expect(context.protocolFeeXcp).toBe('1.23456789');
    });

    it('trims the protocol fee carried by the message itself', async () => {
      const { context } = await resolveProtocolContext({
        messageType: 'attach',
        data: { asset: 'MYASSET' },
        apiMessageData: { fee: 50000000 },
      });

      expect(context.protocolFeeXcp).toBe('0.5');
    });

    it('leaves a free fairminter unpriced and unrouted', async () => {
      vi.mocked(fetchAssetFairminter).mockResolvedValue({ price: 0, quantity_by_price: 1 } as any);

      const { context } = await resolveProtocolContext(fairmintOf('MYASSET'));
      expect(context.protocolFeeXcp).toBeUndefined();
      expect(context.fairmintPaymentModel).toBeUndefined();
    });

    it('leaves a fairminter whose lot size is unknown unpriced', async () => {
      vi.mocked(fetchAssetFairminter).mockResolvedValue({ price: 1000 } as any);

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
