/**
 * The input check as the compose path actually runs it.
 *
 * `inputPolicy.test.ts` covers the rule; this covers the wiring, which is where it could fail
 * quietly. The composer is asked up to three times when a selection is rejected, and the last
 * attempt sends no `inputs_set` at all — so a refusal that the fallback mistook for "that selection
 * did not work" would be answered by letting the composer choose freely, which is the opposite of
 * what the check is for.
 */

import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { getPublicKey } from '@noble/secp256k1';
import { p2wpkh, Transaction } from '@scure/btc-signer';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as apiClientUtils from '@/core/api/client';
import { AddressFormat, encodeAddress } from '@/core/bitcoin/address';
import { getActiveSettings } from '@/core/settings';
import { composeSend } from '../compose';
import {
  createMockApiResponse,
  createMockComposeResult,
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

const OFFERED_TXID = 'aa'.repeat(32);
/** A coin the wallet held back, as an attached-asset UTXO would be. */
const WITHHELD_TXID = 'cc'.repeat(32);

vi.mock('@/core/counterparty/utxoSelection', () => ({
  selectUtxosForTransaction: vi.fn().mockResolvedValue({
    utxos: [{ txid: 'aa'.repeat(32), vout: 0, value: 100000, status: { confirmed: true } }],
    inputsSet: `${'aa'.repeat(32)}:0`,
    totalValue: 100000,
    excludedWithAssets: 1,
  }),
}));

const OWNER_PUBKEY = getPublicKey(hexToBytes('11'.repeat(32)), true);
const OWNER = encodeAddress(OWNER_PUBKEY, AddressFormat.P2WPKH);

/** A real, parseable composed transaction spending the given coins. */
function rawTxSpending(txids: string[]): string {
  const tx = new Transaction({ allowUnknownOutputs: true, allowLegacyWitnessUtxo: true });
  for (const txid of txids) {
    tx.addInput({
      txid: hexToBytes(txid),
      index: 0,
      witnessUtxo: { script: p2wpkh(OWNER_PUBKEY).script, amount: 100_000n },
    });
  }
  tx.addOutputAddress(OWNER, 90_000n);
  return bytesToHex(tx.unsignedTx);
}

const mockedApiClient = vi.mocked(apiClientUtils.apiClient, true);
const mockedGetSettings = vi.mocked(getActiveSettings);

function sendArgs() {
  return {
    sourceAddress: mockAddress,
    destination: mockDestAddress,
    asset: 'XCP',
    quantity: 1000,
    sat_per_vbyte: mockSatPerVbyte,
  };
}

describe('compose refuses inputs the wallet did not offer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetSettings.mockReturnValue(mockSettings as any);
  });

  it('rejects a composed transaction spending a withheld coin', async () => {
    mockedApiClient.get.mockResolvedValue(createMockApiResponse({
      result: createMockComposeResult({
        rawtransaction: rawTxSpending([OFFERED_TXID, WITHHELD_TXID]),
      }),
    }));

    await expect(composeSend(sendArgs())).rejects.toThrow(/did not offer/);
  });

  it('does not answer that refusal by asking again without a selection', async () => {
    // The property that matters: one request, not three. Retrying would end at an attempt that
    // sends no inputs_set, letting the composer spend whatever it likes.
    mockedApiClient.get.mockResolvedValue(createMockApiResponse({
      result: createMockComposeResult({ rawtransaction: rawTxSpending([WITHHELD_TXID]) }),
    }));

    await expect(composeSend(sendArgs())).rejects.toThrow(/did not offer/);
    expect(mockedApiClient.get).toHaveBeenCalledTimes(1);
  });

  it('accepts a composed transaction spending only what was offered', async () => {
    mockedApiClient.get.mockResolvedValue(createMockApiResponse({
      result: createMockComposeResult({ rawtransaction: rawTxSpending([OFFERED_TXID]) }),
    }));

    await expect(composeSend(sendArgs())).resolves.toBeDefined();
  });
});
