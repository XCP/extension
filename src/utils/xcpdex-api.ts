/**
 * xcpdex.com Swap API Client
 *
 * Handles atomic swap listing, cancellation, and browsing via the
 * xcpdex.com exchange API.
 */

import { apiClient, API_TIMEOUTS } from '@/utils/apiClient';

const XCPDEX_API_BASE = 'https://api.xcpdex.com';

// =============================================================================
// TYPES
// =============================================================================

export interface PrepareListingRequest {
  seller_address: string;
  utxo_txid: string;
  utxo_vout: number;
  asset: string;
  price_sats: number;
}

export interface PrepareListingResponse {
  psbt_hex: string;
}

export interface CompleteListingRequest {
  seller_address: string;
  utxo_txid: string;
  utxo_vout: number;
  asset: string;
  asset_longname: string | null;
  asset_quantity: number | string;
  price_sats: number;
  signed_psbt_hex: string;
  expires_at: string | null;
}

export interface SwapListing {
  id: string;
  status: 'active' | 'completed' | 'cancelled' | 'expired';
  seller_address: string;
  utxo_txid: string;
  utxo_vout: number;
  asset: string;
  asset_longname: string | null;
  asset_quantity: number | string;
  price_sats: number;
  created_at: string;
  expires_at: string | null;
}

export interface PrepareFillRequest {
  buyer_address: string;
}

export interface PrepareFillResponse {
  fill_request_id: string;
  psbt_hex: string;
  buyer_input_indices: number[];
  platform_fee_sats: number;
}

export interface CompleteFillResponse {
  fill_id: string;
  swap_listing_id: string;
  buyer_address: string;
  tx_id: string;
  status: string;
}

export interface PrepareCancelResponse {
  challenge: string;
  seller_address: string;
}

// =============================================================================
// API FUNCTIONS
// =============================================================================

/**
 * Step 1 of listing: get a PSBT from the server for the seller to sign.
 */
export async function prepareListing(
  request: PrepareListingRequest
): Promise<PrepareListingResponse> {
  const response = await apiClient.post<PrepareListingResponse>(
    `${XCPDEX_API_BASE}/swaps/prepare-listing`,
    request,
    { timeout: API_TIMEOUTS.DEFAULT }
  );
  return response.data;
}

/**
 * Step 3 of listing: submit the signed PSBT to complete the listing.
 */
export async function completeListing(
  request: CompleteListingRequest
): Promise<SwapListing> {
  const response = await apiClient.post<SwapListing>(
    `${XCPDEX_API_BASE}/swaps/complete-listing`,
    request,
    { timeout: API_TIMEOUTS.DEFAULT }
  );
  return response.data;
}

/**
 * Fetch active swap listings, optionally filtered by seller, asset, or status.
 * API returns { listings: [...], total, limit, offset }.
 */
export async function fetchSwapListings(
  options: { seller?: string; asset?: string; status?: string } = {}
): Promise<SwapListing[]> {
  const params: Record<string, string> = { status: options.status ?? 'active' };
  if (options.seller) params.seller = options.seller;
  if (options.asset) params.asset = options.asset;
  const response = await apiClient.get<{ listings: SwapListing[]; total: number }>(
    `${XCPDEX_API_BASE}/swaps`,
    { params, timeout: API_TIMEOUTS.DEFAULT }
  );
  return response.data.listings ?? [];
}

/**
 * Fetch a single swap listing by ID.
 * API returns the listing object directly.
 */
export async function fetchSwapListing(
  id: string
): Promise<SwapListing | null> {
  try {
    const response = await apiClient.get<SwapListing>(
      `${XCPDEX_API_BASE}/swaps/${encodeURIComponent(id)}`,
      { timeout: API_TIMEOUTS.QUICK }
    );
    return response.data;
  } catch {
    return null;
  }
}

/**
 * Prepare a fill (buy): server constructs buyer's PSBT.
 */
export async function prepareFill(
  listingId: string,
  buyerAddress: string
): Promise<PrepareFillResponse> {
  const response = await apiClient.post<PrepareFillResponse>(
    `${XCPDEX_API_BASE}/swaps/${encodeURIComponent(listingId)}/prepare-fill`,
    { buyer_address: buyerAddress },
    { timeout: API_TIMEOUTS.DEFAULT }
  );
  return response.data;
}

/**
 * Complete a fill (buy): submit buyer's signed PSBT, server merges + broadcasts.
 */
export async function completeFill(
  listingId: string,
  fillRequestId: string,
  signedPsbtHex: string
): Promise<CompleteFillResponse> {
  const response = await apiClient.post<CompleteFillResponse>(
    `${XCPDEX_API_BASE}/swaps/${encodeURIComponent(listingId)}/complete-fill`,
    { fill_request_id: fillRequestId, signed_psbt_hex: signedPsbtHex },
    { timeout: API_TIMEOUTS.BROADCAST }
  );
  return response.data;
}

/**
 * Step 1 of cancel: get a challenge string to sign.
 */
export async function prepareCancel(
  listingId: string
): Promise<PrepareCancelResponse> {
  const response = await apiClient.post<PrepareCancelResponse>(
    `${XCPDEX_API_BASE}/swaps/${encodeURIComponent(listingId)}/prepare-cancel`,
    undefined,
    { timeout: API_TIMEOUTS.DEFAULT }
  );
  return response.data;
}

/**
 * Step 2 of cancel: submit the signed challenge to cancel the listing.
 */
export async function cancelListing(
  listingId: string,
  sellerAddress: string,
  challenge: string,
  signature: string
): Promise<{ ok: boolean; id: string; status: string }> {
  const response = await apiClient.post<{ ok: boolean; id: string; status: string }>(
    `${XCPDEX_API_BASE}/swaps/${encodeURIComponent(listingId)}/cancel`,
    { seller_address: sellerAddress, challenge, signature },
    { timeout: API_TIMEOUTS.DEFAULT }
  );
  return response.data;
}

