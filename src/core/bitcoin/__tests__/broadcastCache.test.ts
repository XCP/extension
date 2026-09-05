import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { getPublicKey } from '@noble/secp256k1';
import { p2wpkh, Transaction } from '@scure/btc-signer';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { apiClient } from '@/core/api/client';
import {
  cacheSuccessfulBroadcast,
  clearBitcoinCaches,
  fetchPreviousRawTransaction,
  fetchUTXOs,
  getCachedBroadcastPrevout,
} from '@/core/bitcoin/utxo';

const key = hexToBytes('22'.repeat(32));
const payment = p2wpkh(getPublicKey(key, true));

function signedParent(amount = 80_000n) {
  const tx = new Transaction();
  tx.addInput({ txid: hexToBytes('ab'.repeat(32)), index: 0, witnessUtxo: { script: payment.script, amount: 100_000n } });
  tx.addOutput({ script: payment.script, amount });
  tx.sign(key);
  tx.finalize();
  return { txid: tx.id, raw: tx.hex };
}

beforeEach(() => clearBitcoinCaches());
afterEach(() => vi.restoreAllMocks());

it('serves immutable signed-parent facts without advertising an output as unspent', async () => {
  const parent = signedParent();
  expect(cacheSuccessfulBroadcast(parent.raw, parent.txid)).toBe(true);
  const get = vi.spyOn(apiClient, 'get').mockResolvedValue({ data: [], status: 200, statusText: 'OK', headers: {} });
  expect(getCachedBroadcastPrevout(parent.txid, 0)).toEqual({
    value: 80_000,
    scriptPubKey: bytesToHex(payment.script),
    address: payment.address,
  });
  expect(await fetchPreviousRawTransaction(parent.txid)).toBe(parent.raw);
  expect(get).not.toHaveBeenCalled();
  expect(await fetchUTXOs(payment.address!)).toEqual([]);
  expect(get).toHaveBeenCalledTimes(1);
});

it('rejects a claimed id that does not commit to the exact supplied bytes', () => {
  const parent = signedParent();
  const changed = signedParent(79_000n);
  expect(cacheSuccessfulBroadcast(changed.raw, parent.txid)).toBe(false);
  expect(getCachedBroadcastPrevout(parent.txid, 0)).toBeNull();
  expect(getCachedBroadcastPrevout(changed.txid, 0)).toBeNull();
  expect(cacheSuccessfulBroadcast('not a transaction', parent.txid)).toBe(false);
  expect(cacheSuccessfulBroadcast(parent.raw, 'dev_mock_tx_fixture')).toBe(false);
});

it('keeps cached values isolated from caller mutation and clears them with Bitcoin caches', () => {
  const parent = signedParent();
  cacheSuccessfulBroadcast(parent.raw, parent.txid);
  getCachedBroadcastPrevout(parent.txid, 0)!.value = 1;
  expect(getCachedBroadcastPrevout(parent.txid, 0)?.value).toBe(80_000);
  expect(getCachedBroadcastPrevout(parent.txid, 1)).toBeNull();
  clearBitcoinCaches();
  expect(getCachedBroadcastPrevout(parent.txid, 0)).toBeNull();
});
