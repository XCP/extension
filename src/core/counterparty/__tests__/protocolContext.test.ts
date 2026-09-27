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

import { getCurrentBlockHeight } from '@/core/bitcoin/blockHeight';
import { fetchAssetDetails, fetchAssetFairminter, fetchAssetHolderCount, fetchOrderMatch } from '@/core/counterparty/api';
import { packComposeMessage } from '@/core/counterparty/pack/messages';
import { unpackCounterpartyMessage } from '@/core/counterparty/unpack';
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
    it('does not turn global supply and holder count into a dividend payout or fee', async () => {
      vi.mocked(fetchAssetDetails).mockResolvedValue({ supply_normalized: '1000' } as any);
      vi.mocked(fetchAssetHolderCount).mockResolvedValue(3);

      const { context } = await resolveProtocolContext({
        messageType: 'dividend',
        data: { asset: 'MYASSET', quantityPerUnit: 100000 }, // 0.001 per unit
      });

      expect(context).toEqual({});
      expect(fetchAssetDetails).not.toHaveBeenCalled();
      expect(fetchAssetHolderCount).not.toHaveBeenCalled();
    });
  });

  describe('BTCPay time left', () => {
    it('reads the match the signed BTCPay names, as the local unpack names it', async () => {
      const matchId = `${'a'.repeat(64)}_${'b'.repeat(64)}`;
      const packed = packComposeMessage('btcpay', { order_match_id: matchId });
      const unpacked = unpackCounterpartyMessage(packed!.bytes);
      expect(unpacked.messageType).toBe('btcpay');
      vi.mocked(fetchOrderMatch).mockResolvedValueOnce({ id: matchId, match_expire_index: 900_020 } as any);
      vi.mocked(getCurrentBlockHeight).mockResolvedValueOnce(900_000);

      const { context } = await resolveProtocolContext({ messageType: 'btcpay', data: unpacked.data });
      expect(fetchOrderMatch).toHaveBeenCalledWith(matchId);
      expect(context.btcpayBlocksLeft).toBe(20);
    });
  });
});
