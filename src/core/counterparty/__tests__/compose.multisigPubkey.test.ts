/**
 * The multisig_pubkey parameter on compose requests.
 *
 * Core encodes any message over 80 bytes as bare multisig and embeds the source's public key in
 * each data output as its recovery key. It finds that key by scanning the address's spends, which
 * fails for an address that has never spent — reproduced live: a long-data compose from a fresh
 * address returns "Pubkey not found for …, please provide it with the `multisig_pubkey`
 * parameter", and succeeds with it. The wallet holds the key, so it sends it on every compose;
 * core reads it only on the multisig path, so for everything else the parameter is inert.
 *
 * `multisig_pubkey`, not `pubkeys`: core validates `pubkeys` entries by deriving a P2PKH address
 * and comparing it to the source, so that route can never match a segwit or taproot source.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as apiClientUtils from '@/core/api/client';
import { getActiveSettings } from '@/core/settings';
import { composeBroadcast, composeSend } from '../compose';
import { setSourcePubkeyProvider } from '../sourcePubkey';
import {
  createMockComposeResponse,
  mockAddress,
  mockDestAddress,
  mockSatPerVbyte,
  mockSettings,
} from './helpers/composeTestHelpers';

vi.mock('@/core/api/client');
vi.mock('@/core/settings', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/core/settings')>();
  return { ...actual, getActiveSettings: vi.fn().mockReturnValue(actual.DEFAULT_SETTINGS) };
});
vi.mock('@/core/counterparty/utxoSelection', () => ({
  selectUtxosForTransaction: vi.fn().mockResolvedValue({
    utxos: [{ txid: 'aa'.repeat(32), vout: 0, value: 100000, status: { confirmed: true } }],
    inputsSet: `${'aa'.repeat(32)}:0`,
    totalValue: 100000,
    excludedWithAssets: 0,
  }),
}));

const mockedApiClient = vi.mocked(apiClientUtils.apiClient, true);
const mockedGetSettings = vi.mocked(getActiveSettings);

const PUBKEY = '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798';

const composedUrl = (): string => mockedApiClient.get.mock.calls[0]![0] as string;

describe('multisig_pubkey on compose requests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetSettings.mockReturnValue(mockSettings as any);
    mockedApiClient.get.mockResolvedValue(createMockComposeResponse());
  });

  afterEach(() => setSourcePubkeyProvider(null));

  it('sends the source pubkey when the wallet holds it', async () => {
    setSourcePubkeyProvider((address) => (address === mockAddress ? PUBKEY : null));

    await composeBroadcast({
      sourceAddress: mockAddress,
      text: 'hello',
      sat_per_vbyte: mockSatPerVbyte,
    });

    expect(composedUrl()).toContain(`multisig_pubkey=${PUBKEY}`);
  });

  // The pre-existing behaviour, kept exactly: contexts that never register a provider — the
  // background, tests, anything outside the popup — compose the same requests they always did,
  // and core falls back to its own history scan.
  it('omits the parameter when no provider is registered', async () => {
    await composeBroadcast({
      sourceAddress: mockAddress,
      text: 'hello',
      sat_per_vbyte: mockSatPerVbyte,
    });

    expect(composedUrl()).not.toContain('multisig_pubkey');
  });

  it('omits the parameter for an address the wallet does not hold', async () => {
    setSourcePubkeyProvider(() => null);

    await composeSend({
      sourceAddress: mockAddress,
      destination: mockDestAddress,
      asset: 'XCP',
      quantity: 100,
      sat_per_vbyte: mockSatPerVbyte,
    });

    expect(composedUrl()).not.toContain('multisig_pubkey');
  });

  it('sends it on ordinary sends too, where core simply ignores it', async () => {
    // Deliberate: whether a message overflows into multisig encoding depends on its size, which
    // the wallet does not compute. Sending the key unconditionally means the boundary lives in
    // exactly one place — core — instead of being re-derived here and drifting.
    setSourcePubkeyProvider(() => PUBKEY);

    await composeSend({
      sourceAddress: mockAddress,
      destination: mockDestAddress,
      asset: 'XCP',
      quantity: 100,
      sat_per_vbyte: mockSatPerVbyte,
    });

    expect(composedUrl()).toContain(`multisig_pubkey=${PUBKEY}`);
  });
});
