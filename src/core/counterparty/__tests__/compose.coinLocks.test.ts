/**
 * The wallet's locked coins as the compose path honors them.
 *
 * Selection leaves them out of `inputs_set`, but the composer also runs without one: the retry
 * ladder's last attempt, and every detach and move. So each request names the locked coins in
 * `exclude_utxos`, and each composed transaction is checked for them afterwards.
 */

import { secp256k1 } from '@noble/curves/secp256k1.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { p2wpkh, Transaction } from '@scure/btc-signer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as apiClientUtils from '@/core/api/client';
import { setCoinLockStore } from '@/core/bitcoin/coinLockStore';
import type { CoinLock } from '@/core/bitcoin/coinLocks';
import { getActiveSettings } from '@/core/settings';
import { composeDetach, composeMove, composeSend } from '../compose';
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
vi.mock('@/core/bitcoin/utxo', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/core/bitcoin/utxo')>(),
  fetchUTXOs: vi.fn(async () => []),
}));
// The empty UTXO read makes every lock a candidate; the chain lookup is covered in coinLockStore.test.ts.
vi.mock('@/core/bitcoin/outspend', () => ({ checkOutspends: vi.fn(async () => ({ spent: [], unknown: [] })) }));
vi.mock('@/core/counterparty/utxoSelection', () => ({
  selectUtxosForTransaction: vi.fn().mockResolvedValue({
    utxos: [{ txid: 'aa'.repeat(32), vout: 0, value: 100000, status: { confirmed: true } }],
    inputsSet: `${'aa'.repeat(32)}:0`,
    totalValue: 100000,
    excludedWithAssets: 0,
    excludedValue: 0,
    excludedLocked: 1,
    excludedLockedValue: 25000,
  }),
}));
// ZELD's own recompose and lookups are covered in compose.zeldGuard.test.ts.
vi.mock('@/core/zeld/composeGuard', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/core/zeld/composeGuard')>(),
  guardZeldExposure: vi.fn(async (composed: unknown) => composed),
  withDetachZeldKept: vi.fn(async (composed: unknown) => composed),
  assertUtxoCarriesNoZeld: vi.fn(async () => {}),
}));

const OFFERED_TXID = 'aa'.repeat(32);
const LOCKED_TXID = 'cc'.repeat(32);
const LOCKED = `${LOCKED_TXID}:0`;
const ATTACHED = `${'dd'.repeat(32)}:1`;

const OWNER_PUBKEY = secp256k1.getPublicKey(hexToBytes('11'.repeat(32)), true);

function rawTxSpending(txids: string[]): string {
  const tx = new Transaction({ allowUnknownOutputs: true, allowLegacyWitnessUtxo: true });
  for (const txid of txids) {
    tx.addInput({ txid: hexToBytes(txid), index: 0, witnessUtxo: { script: p2wpkh(OWNER_PUBKEY).script, amount: 100_000n } });
  }
  tx.addOutput({ script: p2wpkh(OWNER_PUBKEY).script, amount: 90_000n });
  return bytesToHex(tx.unsignedTx);
}

const lock = (kind: CoinLock['kind'] = 'offer_slot'): CoinLock => ({
  outpoint: LOCKED, address: mockAddress, kind, manual: kind === 'manual', refs: kind === 'manual' ? [] : ['offer-1'],
  valueSats: 25_000, origin: kind === 'manual' ? null : 'https://market.example', expiresAt: null,
  // Not seen on chain yet and fresh, so the empty UTXO read below neither spends nor orphans it.
  createdAt: Math.floor(Date.now() / 1000), seenAt: null, unlocked: false,
});

const mockedApiClient = vi.mocked(apiClientUtils.apiClient, true);
const requestedUrls = () => mockedApiClient.get.mock.calls.map(([url]) => new URL(String(url)));
const excluded = (url: URL) => url.searchParams.get('exclude_utxos')?.split(',') ?? [];

const sendArgs = () => ({ sourceAddress: mockAddress, destination: mockDestAddress, asset: 'XCP', quantity: 1000, sat_per_vbyte: mockSatPerVbyte });
const composeError = (error: string) => ({ data: { error }, status: 200, statusText: 'OK', headers: {}, config: {} });

describe('compose leaves locked coins alone', () => {
  let locks: CoinLock[];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getActiveSettings).mockReturnValue(mockSettings as never);
    locks = [lock()];
    setCoinLockStore({ read: async () => locks, update: async () => {} });
  });
  afterEach(() => setCoinLockStore(null));

  it('names every locked coin in exclude_utxos, on the fallback that sends no inputs_set too', async () => {
    mockedApiClient.get
      .mockResolvedValueOnce(composeError(`invalid UTXOs: ${OFFERED_TXID}:0 (transaction not found)`) as never)
      .mockResolvedValueOnce(createMockApiResponse({ result: createMockComposeResult({ rawtransaction: rawTxSpending(['bb'.repeat(32)]) }) }));

    await composeSend(sendArgs());

    const [first, fallback] = requestedUrls();
    expect(first!.searchParams.get('inputs_set')).toBe(`${OFFERED_TXID}:0`);
    expect(excluded(first!)).toEqual([LOCKED]);
    expect(fallback!.searchParams.get('inputs_set')).toBeNull();
    expect(excluded(fallback!)).toEqual([LOCKED]);
  });

  it('sends no exclude_utxos when nothing is locked', async () => {
    locks = [];
    mockedApiClient.get.mockResolvedValue(createMockApiResponse({ result: createMockComposeResult() }));
    await composeSend(sendArgs());
    expect(requestedUrls()[0]!.searchParams.has('exclude_utxos')).toBe(false);
  });

  it('refuses a composed transaction that spends a locked coin anyway, without asking again', async () => {
    mockedApiClient.get.mockResolvedValue(createMockApiResponse({
      result: createMockComposeResult({ rawtransaction: rawTxSpending([OFFERED_TXID, LOCKED_TXID]) }),
    }));

    await expect(composeSend(sendArgs())).rejects.toThrow('Uses a locked coin. Unlock it in Coin Control or cancel the offer.');
    expect(mockedApiClient.get).toHaveBeenCalledTimes(1);
  });

  it('names a hand lock as the user\'s own', async () => {
    locks = [lock('manual')];
    mockedApiClient.get.mockResolvedValue(createMockApiResponse({
      result: createMockComposeResult({ rawtransaction: rawTxSpending([LOCKED_TXID]) }),
    }));
    await expect(composeSend(sendArgs())).rejects.toThrow('Uses a locked coin. Unlock it in Coin Control.');
  });

  it('states the split when the locks are why the funds fall short', async () => {
    mockedApiClient.get.mockResolvedValue(composeError(`Insufficient BTC at address ${mockAddress}. Need: 0.002 BTC`) as never);
    await expect(composeSend(sendArgs())).rejects.toThrow(
      'Not enough available BTC: 100,000 sats free · 25,000 locked in offers.',
    );
  });

  it('passes a shortfall through unchanged when nothing is locked', async () => {
    locks = [];
    mockedApiClient.get.mockResolvedValue(composeError('Insufficient BTC at address x') as never);
    await expect(composeSend(sendArgs())).rejects.toThrow('Insufficient BTC at address x');
  });

  it('excludes locked coins from the fee inputs of a detach and a move', async () => {
    mockedApiClient.get.mockResolvedValue(createMockApiResponse({ result: createMockComposeResult() }));
    await composeDetach({ sourceUtxo: ATTACHED, sourceAddress: mockAddress, sat_per_vbyte: mockSatPerVbyte });
    await composeMove({ sourceUtxo: ATTACHED, sourceAddress: mockAddress, destination: mockDestAddress, sat_per_vbyte: mockSatPerVbyte });
    expect(requestedUrls().map(excluded)).toEqual([[LOCKED], [LOCKED]]);
  });

  it('refuses a detach of a locked coin rather than excluding the coin it names', async () => {
    locks = [{ ...lock('manual'), outpoint: `${OFFERED_TXID}:0` }];
    mockedApiClient.get.mockResolvedValue(createMockApiResponse({ result: createMockComposeResult() }));
    await expect(composeDetach({ sourceUtxo: `${OFFERED_TXID}:0`, sourceAddress: mockAddress, sat_per_vbyte: mockSatPerVbyte }))
      .rejects.toThrow('Uses a locked coin. Unlock it in Coin Control.');
    expect(requestedUrls()[0]!.searchParams.has('exclude_utxos')).toBe(false);
  });
});
