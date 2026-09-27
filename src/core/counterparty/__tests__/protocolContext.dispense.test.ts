/**
 * The dispenser lookup behind a dispense gates signing in both directions: an oracle-priced
 * dispenser is refused, and a dispenser that could not be read waits for a retry rather than
 * passing unchecked. A transaction that is not a dispense never looks dispensers up, so a lookup
 * failure cannot touch it.
 *
 * Runs the real payout arithmetic and policy; only the API is stubbed.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/core/counterparty/api', () => ({
  fetchAllAddressDispensers: vi.fn(),
  fetchAssetDetails: vi.fn(),
  fetchAssetFairminter: vi.fn(),
  fetchOrder: vi.fn(),
  fetchOrderMatch: vi.fn(),
  fetchPool: vi.fn(),
  fetchUtxoBalances: vi.fn(),
}));
vi.mock('@/core/bitcoin/blockHeight', () => ({
  getCurrentBlockHeight: vi.fn(async () => 0),
}));

import { fetchAllAddressDispensers } from '@/core/counterparty/api';
import { resolveProtocolContext } from '../protocolContext';

const mocked = vi.mocked(fetchAllAddressDispensers);

const DISPENSER = 'bc1qdispenser';
const SIGNER = 'bc1qsigner';

const dispenser = (overrides: Record<string, unknown> = {}) => ({
  tx_hash: 'a'.repeat(64),
  source: DISPENSER,
  asset: 'PEPECASH',
  status: 0,
  satoshirate: 10_000,
  give_quantity: 100_000_000,
  give_quantity_normalized: '1.00000000',
  give_remaining: 1_000_000_000,
  give_remaining_normalized: '10.00000000',
  oracle_address: null,
  ...overrides,
});

/** A transaction paying the dispenser 50,000 sats, with change back to the signer. */
const paying = (messageType: string | undefined) => ({
  messageType,
  data: messageType === 'dispense' ? { data: 0 } : undefined,
  outputs: [
    { address: DISPENSER, value: 50_000 },
    { address: SIGNER, value: 100_000 },
  ],
  signerAddresses: [SIGNER],
});

const failLookup = () =>
  // mockImplementation, not mockRejectedValue: the latter builds the rejected promise eagerly.
  mocked.mockImplementation(async () => {
    throw new Error('offline');
  });

describe('the dispenser lookup behind a dispense', () => {
  beforeEach(() => {
    mocked.mockReset();
  });

  it('asks for a retry when the paid dispenser could not be looked up', async () => {
    failLookup();
    const { context, warnings } = await resolveProtocolContext(paying('dispense'));

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({ severity: 'block', code: 'dispenser_lookup_retry' });
    expect(warnings[0]!.message).toContain(DISPENSER);
    expect(context.dispensePayouts).toBeUndefined();
  });

  it('looks up only the paid address, never the signer’s change', async () => {
    failLookup();
    await resolveProtocolContext(paying('dispense'));
    expect(mocked).toHaveBeenCalledTimes(1);
    expect(mocked.mock.calls[0]![0]).toBe(DISPENSER);
  });

  it('passes a fixed-rate dispenser with its payout, as before', async () => {
    mocked.mockResolvedValue({ result: [dispenser()] } as never);
    const { context, warnings } = await resolveProtocolContext(paying('dispense'));

    expect(warnings).toEqual([]);
    expect(context.dispensePayouts).toEqual(['5 PEPECASH']);
  });

  it('passes an address with no open dispenser, as before', async () => {
    mocked.mockResolvedValue({ result: [] } as never);
    const { context, warnings } = await resolveProtocolContext(paying('dispense'));

    expect(warnings).toEqual([]);
    expect(context.dispensePayouts).toBeUndefined();
  });

  it('still refuses an oracle-priced dispenser, without a retry', async () => {
    mocked.mockResolvedValue({ result: [dispenser({ oracle_address: 'bc1qfeed' })] } as never);
    const { warnings } = await resolveProtocolContext(paying('dispense'));

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({ severity: 'block', title: 'Blocked: Oracle-Priced Dispenser' });
    expect(warnings[0]!.code).toBeUndefined();
  });

  it('never looks dispensers up for a transaction that is not a dispense', async () => {
    failLookup();
    for (const messageType of [undefined, 'enhanced_send', 'order']) {
      const { warnings } = await resolveProtocolContext(paying(messageType));
      expect(warnings).toEqual([]);
    }
    expect(mocked).not.toHaveBeenCalled();
  });
});
