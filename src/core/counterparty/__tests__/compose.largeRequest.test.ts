/**
 * A compose whose parameters outgrow a URL.
 *
 * Everything a compose names travels in the query string, and an inscription carries its file
 * there too — hex-encoded, so the file costs twice its size. Past 32,768 bytes the node's front
 * door rejects the request before the application sees it, and the rejection carries no CORS
 * headers, so the browser blocks the response and `fetch` rejects. The wallet read that as
 * "Network error. Please check your internet connection." and a user went looking at their router
 * over a 150KB image.
 *
 * These tests pin the switch to a POST body, and that the switch is confined to the requests that
 * need it: an ordinary send must still be the GET it has always been.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as apiClientUtils from '@/core/api/client';
import { getActiveSettings } from '@/core/settings';
import { composeIssuance, composeMPMA, composeSend, MAX_INSCRIPTION_FILE_BYTES } from '../compose';
import {
  createMockComposeResponse,
  mockAddress,
  mockApiBase,
  mockDestAddress,
  mockSatPerVbyte,
  mockSettings,
  testQuantities,
} from './helpers/composeTestHelpers';

vi.mock('@/core/api/client');
vi.mock('@/core/counterparty/capabilities', () => ({
  requireCounterpartyFeature: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/core/settings', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/core/settings')>();
  return { ...actual, getActiveSettings: vi.fn().mockReturnValue(actual.DEFAULT_SETTINGS) };
});

// The txid is spelled out rather than imported as `mockInputTxid`: this factory is hoisted above
// the imports and cannot read them. It must stay in step with composeTestHelpers, or the input
// policy check has nothing to match and stops testing anything.
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

/** Hex for a file of `bytes` bytes, the way `encodeInscriptionContent` produces it for binary. */
const inscriptionHex = (bytes: number) => 'ab'.repeat(bytes);

const issuanceWithFile = (bytes: number) =>
  composeIssuance({
    sourceAddress: mockAddress,
    asset: 'A9999999999999999999',
    quantity: testQuantities.SMALL,
    divisible: false,
    lock: false,
    reset: false,
    description: inscriptionHex(bytes),
    inscription: 'true',
    mime_type: 'image/jpeg',
    sat_per_vbyte: mockSatPerVbyte,
    encoding: 'taproot',
  });

describe('Compose requests too large for a URL', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetSettings.mockReturnValue(mockSettings as any);
    mockedApiClient.get.mockResolvedValue(createMockComposeResponse());
    mockedApiClient.post.mockResolvedValue(createMockComposeResponse());
  });

  it('sends an ordinary compose as a GET', async () => {
    await composeSend({
      sourceAddress: mockAddress,
      destination: mockDestAddress,
      asset: 'XCP',
      quantity: testQuantities.MEDIUM,
      sat_per_vbyte: mockSatPerVbyte,
    });

    expect(mockedApiClient.get).toHaveBeenCalledTimes(1);
    expect(mockedApiClient.post).not.toHaveBeenCalled();
  });

  it('keeps a small inscription on the GET path', async () => {
    await issuanceWithFile(2 * 1024);

    expect(mockedApiClient.get).toHaveBeenCalledTimes(1);
    expect(mockedApiClient.post).not.toHaveBeenCalled();
  });

  it('posts a form body once the URL would overflow, and sends no query string with it', async () => {
    await issuanceWithFile(64 * 1024);

    expect(mockedApiClient.get).not.toHaveBeenCalled();
    expect(mockedApiClient.post).toHaveBeenCalledTimes(1);

    const [url, body, config] = mockedApiClient.post.mock.calls[0]!;
    expect(url).toBe(`${mockApiBase}/v2/addresses/${mockAddress}/compose/issuance`);
    expect(url).not.toContain('?');
    expect(config?.headers?.['Content-Type']).toBe('application/x-www-form-urlencoded');

    // The body must carry everything the query string did, the file included.
    const sent = new URLSearchParams(body as string);
    expect(sent.get('description')).toBe(inscriptionHex(64 * 1024));
    expect(sent.get('inscription')).toBe('true');
    expect(sent.get('mime_type')).toBe('image/jpeg');
    expect(sent.get('encoding')).toBe('taproot');
    expect(sent.get('sat_per_vbyte')).toBe(String(mockSatPerVbyte));
    expect(sent.get('verbose')).toBe('true');
    expect(sent.get('inputs_set')).toBe(`${'aa'.repeat(32)}:0`);
  });

  it('carries MPMA repeated array keys through the body unchanged', async () => {
    // `memos` is the one parameter core reads as a list of repeated plain keys — the others are
    // comma-joined scalars. A body has to preserve that shape, or an MPMA long enough to cross
    // the threshold would silently compose as a different send.
    const memo = 'm'.repeat(20 * 1024);
    await composeMPMA({
      sourceAddress: mockAddress,
      assets: ['XCP', 'PEPECASH'],
      destinations: [mockDestAddress, mockDestAddress],
      quantities: ['1000', '2000'],
      memos: [memo, memo],
      memos_are_hex: [false, false],
      sat_per_vbyte: mockSatPerVbyte,
    });

    expect(mockedApiClient.get).not.toHaveBeenCalled();
    const [, body] = mockedApiClient.post.mock.calls[0]!;
    const sent = new URLSearchParams(body as string);
    expect(sent.getAll('memos')).toEqual([memo, memo]);
    expect(sent.get('assets')).toBe('XCP,PEPECASH');
    expect(sent.get('destinations')).toBe(`${mockDestAddress},${mockDestAddress}`);
    expect(sent.get('memos_are_hex')).toBe('false');
  });

  it('refuses a file past what a body can hold, without asking the node', async () => {
    await expect(issuanceWithFile(MAX_INSCRIPTION_FILE_BYTES + 64 * 1024)).rejects.toThrow(
      /too large for the Counterparty API/
    );

    expect(mockedApiClient.get).not.toHaveBeenCalled();
    expect(mockedApiClient.post).not.toHaveBeenCalled();
  });

  it('still composes a file at the advertised maximum', async () => {
    await issuanceWithFile(MAX_INSCRIPTION_FILE_BYTES);

    expect(mockedApiClient.post).toHaveBeenCalledTimes(1);
  });
});
