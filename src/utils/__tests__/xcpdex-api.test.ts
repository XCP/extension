/**
 * Tests for xcpdex.com Swap API Client
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  prepareListing,
  completeListing,
  fetchSwapListings,
  fetchSwapListing,
  prepareFill,
  completeFill,
  prepareCancel,
  cancelListing,
  type PrepareListingRequest,
  type CompleteListingRequest,
  type SwapListing,
} from '../xcpdex-api';
import { apiClient } from '@/utils/apiClient';

vi.mock('@/utils/apiClient');
const mockedApiClient = vi.mocked(apiClient, true);

const XCPDEX_API_BASE = 'https://api.xcpdex.com';

const mockListing: SwapListing = {
  id: 'listing-1',
  status: 'active',
  seller_address: 'bc1qseller',
  utxo_txid: 'abc123',
  utxo_vout: 0,
  asset: 'PEPECASH',
  asset_longname: null,
  asset_quantity: 1000,
  price_sats: 50000,
  created_at: '2026-01-01T00:00:00Z',
  expires_at: null,
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ── prepareListing ──────────────────────────────────────────────────

describe('prepareListing', () => {
  const request: PrepareListingRequest = {
    seller_address: 'bc1qseller',
    utxo_txid: 'abc123',
    utxo_vout: 0,
    asset: 'PEPECASH',
    price_sats: 50000,
  };

  it('posts to /swaps/prepare-listing and returns psbt_hex', async () => {
    mockedApiClient.post.mockResolvedValueOnce({
      data: { psbt_hex: 'deadbeef' },
    } as any);

    const result = await prepareListing(request);
    expect(result.psbt_hex).toBe('deadbeef');
    expect(mockedApiClient.post).toHaveBeenCalledWith(
      `${XCPDEX_API_BASE}/swaps/prepare-listing`,
      request,
      expect.objectContaining({ timeout: expect.any(Number) })
    );
  });

  it('propagates API errors', async () => {
    mockedApiClient.post.mockRejectedValueOnce(new Error('Network error'));
    await expect(prepareListing(request)).rejects.toThrow('Network error');
  });
});

// ── completeListing ─────────────────────────────────────────────────

describe('completeListing', () => {
  const request: CompleteListingRequest = {
    seller_address: 'bc1qseller',
    utxo_txid: 'abc123',
    utxo_vout: 0,
    asset: 'PEPECASH',
    asset_longname: null,
    asset_quantity: 1000,
    price_sats: 50000,
    signed_psbt_hex: 'signed_hex',
    expires_at: null,
  };

  it('posts to /swaps/complete-listing and returns listing', async () => {
    mockedApiClient.post.mockResolvedValueOnce({ data: mockListing } as any);

    const result = await completeListing(request);
    expect(result.id).toBe('listing-1');
    expect(result.status).toBe('active');
    expect(mockedApiClient.post).toHaveBeenCalledWith(
      `${XCPDEX_API_BASE}/swaps/complete-listing`,
      request,
      expect.objectContaining({ timeout: expect.any(Number) })
    );
  });

  it('sends expires_at when provided', async () => {
    const withExpiry = { ...request, expires_at: '2026-02-01T00:00:00Z' };
    mockedApiClient.post.mockResolvedValueOnce({ data: mockListing } as any);

    await completeListing(withExpiry);
    const body = mockedApiClient.post.mock.calls[0][1] as CompleteListingRequest;
    expect(body.expires_at).toBe('2026-02-01T00:00:00Z');
  });

  it('sends asset_longname when provided', async () => {
    const withLongname = { ...request, asset_longname: 'PARENT.CHILD' };
    mockedApiClient.post.mockResolvedValueOnce({ data: mockListing } as any);

    await completeListing(withLongname);
    const body = mockedApiClient.post.mock.calls[0][1] as CompleteListingRequest;
    expect(body.asset_longname).toBe('PARENT.CHILD');
  });
});

// ── fetchSwapListings ───────────────────────────────────────────────

describe('fetchSwapListings', () => {
  it('defaults status to active', async () => {
    mockedApiClient.get.mockResolvedValueOnce({
      data: { listings: [mockListing], total: 1 },
    } as any);

    const result = await fetchSwapListings();
    expect(result).toEqual([mockListing]);

    const callOpts = mockedApiClient.get.mock.calls[0][1] as any;
    expect(callOpts.params.status).toBe('active');
  });

  it('passes seller filter', async () => {
    mockedApiClient.get.mockResolvedValueOnce({
      data: { listings: [], total: 0 },
    } as any);

    await fetchSwapListings({ seller: 'bc1qseller' });
    const callOpts = mockedApiClient.get.mock.calls[0][1] as any;
    expect(callOpts.params.seller).toBe('bc1qseller');
  });

  it('passes asset filter', async () => {
    mockedApiClient.get.mockResolvedValueOnce({
      data: { listings: [], total: 0 },
    } as any);

    await fetchSwapListings({ asset: 'PEPECASH' });
    const callOpts = mockedApiClient.get.mock.calls[0][1] as any;
    expect(callOpts.params.asset).toBe('PEPECASH');
  });

  it('allows overriding status', async () => {
    mockedApiClient.get.mockResolvedValueOnce({
      data: { listings: [], total: 0 },
    } as any);

    await fetchSwapListings({ status: 'completed' });
    const callOpts = mockedApiClient.get.mock.calls[0][1] as any;
    expect(callOpts.params.status).toBe('completed');
  });

  it('does not include seller/asset params when not provided', async () => {
    mockedApiClient.get.mockResolvedValueOnce({
      data: { listings: [], total: 0 },
    } as any);

    await fetchSwapListings();
    const callOpts = mockedApiClient.get.mock.calls[0][1] as any;
    expect(callOpts.params).not.toHaveProperty('seller');
    expect(callOpts.params).not.toHaveProperty('asset');
  });

  it('returns empty array when listings field is missing', async () => {
    mockedApiClient.get.mockResolvedValueOnce({
      data: { total: 0 },
    } as any);

    const result = await fetchSwapListings();
    expect(result).toEqual([]);
  });

  it('calls the correct endpoint', async () => {
    mockedApiClient.get.mockResolvedValueOnce({
      data: { listings: [], total: 0 },
    } as any);

    await fetchSwapListings();
    expect(mockedApiClient.get).toHaveBeenCalledWith(
      `${XCPDEX_API_BASE}/swaps`,
      expect.any(Object)
    );
  });
});

// ── fetchSwapListing ────────────────────────────────────────────────

describe('fetchSwapListing', () => {
  it('returns listing on success', async () => {
    mockedApiClient.get.mockResolvedValueOnce({ data: mockListing } as any);

    const result = await fetchSwapListing('listing-1');
    expect(result).toEqual(mockListing);
    expect(mockedApiClient.get).toHaveBeenCalledWith(
      `${XCPDEX_API_BASE}/swaps/listing-1`,
      expect.objectContaining({ timeout: expect.any(Number) })
    );
  });

  it('returns null on error', async () => {
    mockedApiClient.get.mockRejectedValueOnce(new Error('Not found'));

    const result = await fetchSwapListing('bad-id');
    expect(result).toBeNull();
  });

  it('URL-encodes the listing ID', async () => {
    mockedApiClient.get.mockResolvedValueOnce({ data: mockListing } as any);

    await fetchSwapListing('id with spaces/slash');
    const url = mockedApiClient.get.mock.calls[0][0];
    expect(url).toContain('id%20with%20spaces%2Fslash');
  });
});

// ── prepareFill ─────────────────────────────────────────────────────

describe('prepareFill', () => {
  it('posts buyer_address and returns fill response', async () => {
    const fillResponse = {
      fill_request_id: 'fill-1',
      psbt_hex: 'buyer_psbt',
      buyer_input_indices: [1, 2],
      platform_fee_sats: 500,
    };
    mockedApiClient.post.mockResolvedValueOnce({ data: fillResponse } as any);

    const result = await prepareFill('listing-1', 'bc1qbuyer');
    expect(result).toEqual(fillResponse);
    expect(mockedApiClient.post).toHaveBeenCalledWith(
      `${XCPDEX_API_BASE}/swaps/listing-1/prepare-fill`,
      { buyer_address: 'bc1qbuyer' },
      expect.any(Object)
    );
  });

  it('URL-encodes listing ID', async () => {
    mockedApiClient.post.mockResolvedValueOnce({ data: {} } as any);

    await prepareFill('id/special', 'bc1q');
    const url = mockedApiClient.post.mock.calls[0][0];
    expect(url).toContain('id%2Fspecial');
  });
});

// ── completeFill ────────────────────────────────────────────────────

describe('completeFill', () => {
  it('posts fill data and returns completion response', async () => {
    const completeResponse = {
      fill_id: 'fill-1',
      swap_listing_id: 'listing-1',
      buyer_address: 'bc1qbuyer',
      tx_id: 'broadcast_txid',
      status: 'completed',
    };
    mockedApiClient.post.mockResolvedValueOnce({ data: completeResponse } as any);

    const result = await completeFill('listing-1', 'fill-req-1', 'signed_hex');
    expect(result).toEqual(completeResponse);
    expect(mockedApiClient.post).toHaveBeenCalledWith(
      `${XCPDEX_API_BASE}/swaps/listing-1/complete-fill`,
      { fill_request_id: 'fill-req-1', signed_psbt_hex: 'signed_hex' },
      expect.any(Object)
    );
  });
});

// ── prepareCancel ───────────────────────────────────────────────────

describe('prepareCancel', () => {
  it('posts to prepare-cancel and returns challenge', async () => {
    const cancelResponse = {
      challenge: 'sign-this-message',
      seller_address: 'bc1qseller',
    };
    mockedApiClient.post.mockResolvedValueOnce({ data: cancelResponse } as any);

    const result = await prepareCancel('listing-1');
    expect(result.challenge).toBe('sign-this-message');
    expect(result.seller_address).toBe('bc1qseller');
    expect(mockedApiClient.post).toHaveBeenCalledWith(
      `${XCPDEX_API_BASE}/swaps/listing-1/prepare-cancel`,
      undefined,
      expect.any(Object)
    );
  });
});

// ── cancelListing ───────────────────────────────────────────────────

describe('cancelListing', () => {
  it('posts cancellation data and returns result', async () => {
    const cancelResult = { ok: true, id: 'listing-1', status: 'cancelled' };
    mockedApiClient.post.mockResolvedValueOnce({ data: cancelResult } as any);

    const result = await cancelListing('listing-1', 'bc1qseller', 'challenge', 'sig');
    expect(result).toEqual(cancelResult);
    expect(mockedApiClient.post).toHaveBeenCalledWith(
      `${XCPDEX_API_BASE}/swaps/listing-1/cancel`,
      { seller_address: 'bc1qseller', challenge: 'challenge', signature: 'sig' },
      expect.any(Object)
    );
  });

  it('propagates server errors', async () => {
    mockedApiClient.post.mockRejectedValueOnce(new Error('Forbidden'));
    await expect(
      cancelListing('listing-1', 'bc1q', 'c', 's')
    ).rejects.toThrow('Forbidden');
  });
});
