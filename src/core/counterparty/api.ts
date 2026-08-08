/**
 * Counterparty API Client
 *
 * Provides typed functions for interacting with the Counterparty REST API.
 * All functions handle pagination, error handling, and response normalization.
 *
 * @see https://counterpartycore.docs.apiary.io/ for API documentation
 */

import { apiClient } from '@/core/api/client';
import { CounterpartyApiError } from '@/core/errors';
import { asBaseUnits, asDisplayUnits, type BaseUnits, type DisplayUnits, toBigNumber } from '@/core/numeric';
import { getActiveSettings } from '@/core/settings';

// =============================================================================
// CONSTANTS
// =============================================================================

const DEFAULT_LIMIT = 10;
const CACHE_TTL_MS = 60_000; // 60 seconds

// =============================================================================
// CACHE
// =============================================================================

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const cache = new Map<string, CacheEntry<unknown>>();

/**
 * Generate a cache key from URL and params.
 * Params are sorted for consistent keys regardless of object property order.
 */
function getCacheKey(url: string, params?: Record<string, string | number | boolean>): string {
  if (!params || Object.keys(params).length === 0) return url;
  // Values are encoded so a value containing & or = cannot forge a separator. Without it
  // { cursor: '1&limit=2' } and { cursor: '1', limit: '2' } produce the same key, and whichever
  // ran first has its response served to the other. Cursors come from the API, so their contents
  // are not ours to assume.
  const sortedParams = Object.entries(params)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
  return `${url}?${sortedParams}`;
}

/**
 * Get cached data if still valid.
 */
function getFromCache<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry.data as T;
}

/**
 * Largest number of entries kept. Expired entries are only dropped when their key is read again,
 * so without a bound anything fetched once and never revisited stays for the life of the context.
 */
const MAX_CACHE_ENTRIES = 500;

/**
 * Store data in cache.
 */
function setInCache<T>(key: string, data: T): void {
  // Re-setting an existing key must not count as growth, so delete first: Map preserves insertion
  // order, and deleting then setting also moves the entry to the newest position.
  cache.delete(key);
  if (cache.size >= MAX_CACHE_ENTRIES) {
    // Map iterates in insertion order, so the first key is the oldest.
    const oldest = cache.keys().next();
    if (!oldest.done) cache.delete(oldest.value);
  }
  cache.set(key, { data, timestamp: Date.now() });
}

/**
 * Clear the API cache. Call after mutations (send, create order, etc.)
 * to ensure fresh data on next read.
 */
export function clearApiCache(): void {
  cache.clear();
}

/**
 * Clear cache entries matching a pattern (e.g., for a specific address).
 */
export function clearApiCacheMatching(pattern: string): void {
  for (const key of cache.keys()) {
    if (key.includes(pattern)) {
      cache.delete(key);
    }
  }
}

export const OrderStatus = {
  OPEN: 'open',
  COMPLETED: 'completed',
  EXPIRED: 'expired',
  CANCELLED: 'cancelled',
} as const;
export type OrderStatusType = (typeof OrderStatus)[keyof typeof OrderStatus];

export const DispenserStatus = {
  OPEN: 0,
  CLOSED: 10,
  CLOSING: 11,
} as const;
export type DispenserStatusType = (typeof DispenserStatus)[keyof typeof DispenserStatus];

// =============================================================================
// TYPES - Generic
// =============================================================================

/**
 * An integer field the API may return above JavaScript's safe range.
 *
 * Counterparty quantities are unsigned 64-bit. Values above 2^53-1 arrive as strings so that no
 * digits are lost in parsing (see core/api/losslessJson.ts); smaller ones stay numbers. Pass these
 * to numeric.ts — toBigNumber and fromSatoshis accept either and are exact with both — rather than
 * doing arithmetic on them directly, where a string would concatenate instead of add.
 */
export type ApiQuantity = BaseUnits;

export interface PaginatedResponse<T> {
  result: T[];
  result_count: number;
}

export interface PaginationOptions {
  limit?: number;
  offset?: number;
  verbose?: boolean;
}

// =============================================================================
// TYPES - Assets & Balances
// =============================================================================

export interface AssetInfo {
  asset: string;
  asset_longname: string | null;
  description?: string;
  issuer?: string;
  owner?: string;
  divisible: boolean;
  locked: boolean;
  description_locked?: boolean;
  supply?: string | number;
  supply_normalized: DisplayUnits;
  fair_minting?: boolean;
  first_issuance_block_index?: number;
  last_issuance_block_index?: number;
  first_issuance_block_time?: number;
  last_issuance_block_time?: number;
}

export interface TokenBalance {
  asset: string;
  asset_info?: {
    asset_longname: string | null;
    description: string;
    issuer: string;
    divisible: boolean;
    locked: boolean;
    supply?: number | string;
  };
  quantity?: ApiQuantity;
  quantity_normalized: DisplayUnits;
  address?: string | null;
  utxo?: string | null;
  utxo_address?: string | null;
}

export interface UtxoBalance extends TokenBalance {
  utxo: string;
  utxo_address: string;
}

export interface OwnedAsset {
  asset: string;
  asset_longname: string | null;
  supply_normalized: DisplayUnits;
  description: string;
  locked: boolean;
}

// =============================================================================
// TYPES - Orders & Trading
// =============================================================================

export interface Order {
  tx_hash: string;
  block_time: number;
  give_asset: string;
  get_asset: string;
  give_quantity_normalized: DisplayUnits;
  get_quantity_normalized: DisplayUnits;
  give_remaining_normalized: DisplayUnits;
  get_remaining_normalized: DisplayUnits;
  status: string;
  expire_index: number;
  market_price_normalized?: DisplayUnits;
}

export interface OrderDetails extends Order {
  source: string;
  give_quantity: ApiQuantity;
  get_quantity: ApiQuantity;
  fee_required: number;
  fee_provided: number;
  fee_required_remaining: number;
  fee_provided_remaining: number;
  give_price: number;
  get_price: number;
  confirmed: boolean;
  give_asset_info?: {
    divisible: boolean;
    asset_longname: string | null;
    description: string;
    locked: boolean;
    issuer: string | null;
  };
  get_asset_info?: {
    asset_longname: string | null;
    description: string;
    issuer: string;
    divisible: boolean;
    locked: boolean;
  };
  give_price_normalized?: DisplayUnits;
  get_price_normalized?: DisplayUnits;
  fee_provided_normalized?: DisplayUnits;
  fee_required_normalized?: DisplayUnits;
  fee_required_remaining_normalized?: DisplayUnits;
  fee_provided_remaining_normalized?: DisplayUnits;
}

export interface OrderMatch {
  id: string;
  tx0_hash: string;
  tx0_index: number;
  tx0_address: string;
  tx1_hash: string;
  tx1_index: number;
  tx1_address: string;
  forward_asset: string;
  forward_quantity: number;
  forward_quantity_normalized: DisplayUnits;
  backward_asset: string;
  backward_quantity: number;
  backward_quantity_normalized: DisplayUnits;
  tx0_block_index: number;
  tx1_block_index: number;
  block_index: number;
  block_time: number;
  match_expire_index: number;
  fee_paid: number;
  fee_paid_normalized: DisplayUnits;
  status: string;
  confirmed?: boolean;
  market_price_normalized?: DisplayUnits;
}

// =============================================================================
// TYPES - AMM Pools
// =============================================================================

export interface Pool {
  tx_hash?: string;
  tx_index?: number;
  block_index?: number;
  block_time?: number;
  source?: string;
  asset_a: string;
  asset_b: string;
  reserve_a: number;
  reserve_b: number;
  lp_asset: string;
  status?: string;
  reserve_a_normalized?: DisplayUnits;
  reserve_b_normalized?: DisplayUnits;
  confirmed?: boolean;
  [key: string]: unknown;
}

export interface PoolPosition extends Pool {
  quantity: ApiQuantity;
  quantity_normalized?: DisplayUnits;
}

export interface PoolQuote {
  estimated_output?: number;
  pool_output?: number;
  book_output?: number;
  book_orders_matched?: number;
  give_remaining?: ApiQuantity;
  effective_price?: number;
  price_impact?: number;
  pool_exists?: boolean;
  fee_bps?: number;
  fee_amount?: number;
  message?: string;
  [key: string]: unknown;
}

export interface PoolDepositQuote {
  first_deposit: boolean;
  asset_a?: string;
  asset_b?: string;
  quantity_a_required?: number | null;
  quantity_b_required?: number | null;
  quantity_minted_estimate?: number | null;
  message?: string;
  [key: string]: unknown;
}

export interface PoolWithdrawQuote {
  pool_exists: boolean;
  asset_a?: string;
  asset_b?: string;
  quantity?: ApiQuantity;
  supply?: ApiQuantity;
  quantity_a_estimate?: number;
  quantity_b_estimate?: number;
  reserve_a?: number;
  reserve_b?: number;
  message?: string;
  [key: string]: unknown;
}

// =============================================================================
// TYPES - Dispensers
// =============================================================================

export interface Dispenser {
  tx_hash: string;
  source: string;
  asset: string;
  status: number;
  give_remaining: ApiQuantity;
  give_remaining_normalized: DisplayUnits;
  asset_info?: {
    asset_longname: string | null;
    description: string;
    issuer: string | null;
    divisible: boolean;
    locked: boolean;
  };
}

export interface DispenserDetails extends Dispenser {
  give_quantity: ApiQuantity;
  give_quantity_normalized: DisplayUnits;
  satoshirate: ApiQuantity;
  satoshirate_normalized: DisplayUnits;
  escrow_quantity: ApiQuantity;
  escrow_quantity_normalized: DisplayUnits;
  block_index: number;
  block_time: number;
  confirmed?: boolean;
  price: ApiQuantity;
  satoshi_price: number;
}

export interface Dispense {
  tx_hash: string;
  tx_index: number;
  block_index: number | null;
  block_time: number;
  source: string;
  destination: string;
  asset: string;
  dispense_quantity: number;
  dispense_quantity_normalized: DisplayUnits;
  dispenser_tx_hash: string;
  btc_amount: number;
  btc_amount_normalized: DisplayUnits;
  confirmed?: boolean;
}

// =============================================================================
// TYPES - Transactions
// =============================================================================

export interface Transaction {
  tx_hash: string;
  tx_index?: number;
  block_index: number;
  block_time: number;
  block_hash?: string;
  source: string;
  destination: string;
  type?: string;
  status?: string;
  transaction_type?: string;
  btc_amount?: number;
  btc_amount_normalized?: DisplayUnits;
  fee?: number;
  data: Record<string, any>;
  supported: boolean;
  confirmed?: boolean;
  unpacked_data: {
    message_type: string;
    message_type_id?: number;
    message_data?: any;
    params?: any;
  };
  events?: Array<{
    event_index: number;
    event: string;
    params: any;
    tx_hash: string;
    block_index: number;
    block_time: number;
  }>;
}

// =============================================================================
// TYPES - Dividends
// =============================================================================

export interface Dividend {
  tx_hash: string;
  block_index: number;
  block_time: number;
  source: string;
  asset: string;
  dividend_asset: string;
  quantity_per_unit: ApiQuantity;
  quantity_per_unit_normalized: DisplayUnits;
  total_distributed: number;
  total_distributed_normalized: DisplayUnits;
  fee_paid: number;
  fee_paid_normalized: DisplayUnits;
  status?: string;
  confirmed?: boolean;
}

// =============================================================================
// TYPES - Server
// =============================================================================

export interface ServerInfo {
  server_ready: boolean;
  network: 'mainnet' | 'testnet' | 'regtest';
  version: string;
  backend_height: number;
  counterparty_height: number;
  documentation: string;
  routes: string;
  blueprint: string;
}

// =============================================================================
// INTERNAL HELPERS
// =============================================================================

async function getApiBase(): Promise<string> {
  const settings = getActiveSettings();
  return settings.counterpartyApiBase;
}

/**
 * URL-encodes a path segment for safe URL construction.
 */
function encodePath(segment: string): string {
  return encodeURIComponent(segment);
}

/**
 * Generic API GET helper with proper error handling and caching.
 * Uses unknown instead of any for type safety.
 *
 * @param path - API path (e.g., '/v2/addresses/...')
 * @param params - Query parameters
 * @param options - Options including skipCache to bypass caching
 */
async function cpApiGet<T = unknown>(
  path: string,
  params?: Record<string, string | number | boolean | undefined>,
  options?: { skipCache?: boolean }
): Promise<T> {
  const base = await getApiBase();
  const url = `${base}${path}`;

  // Filter out undefined values from params
  const filteredParams = params
    ? Object.fromEntries(
        Object.entries(params).filter(([, v]) => v !== undefined)
      ) as Record<string, string | number | boolean>
    : undefined;

  // Check cache first (unless explicitly skipped)
  const cacheKey = getCacheKey(url, filteredParams);
  if (!options?.skipCache) {
    const cached = getFromCache<T>(cacheKey);
    if (cached !== null) {
      return cached;
    }
  }

  try {
    const response = await apiClient.get<T | { error: string }>(url, { params: filteredParams });

    if (response.data && typeof response.data === 'object' && 'error' in response.data) {
      throw new CounterpartyApiError(
        (response.data as { error: string }).error,
        path,
        { statusCode: response.status }
      );
    }

    // Cache successful response
    setInCache(cacheKey, response.data as T);

    return response.data as T;
  } catch (error: unknown) {
    if (error instanceof CounterpartyApiError) throw error;

    // Handle errors with response data
    const err = error as { response?: { data?: { error?: string }; status?: number }; message?: string };
    if (err.response?.data?.error) {
      throw new CounterpartyApiError(err.response.data.error, path, {
        statusCode: err.response.status,
        cause: error instanceof Error ? error : undefined,
      });
    }

    const message = error instanceof Error ? error.message : 'API request failed';
    throw new CounterpartyApiError(message, path, {
      cause: error instanceof Error ? error : undefined,
    });
  }
}

// =============================================================================
// API - Balances & Assets
// =============================================================================

/**
 * Fetch all token balances for an address.
 * @param address - Bitcoin address to query
 * @param options - Pagination, sorting, and type filter options
 * @returns Array of token balances with asset info
 */
export async function fetchTokenBalances(
  address: string,
  options: PaginationOptions & { sort?: string; type?: 'all' | 'utxo' | 'address' } = {}
): Promise<TokenBalance[]> {
  const data = await cpApiGet<PaginatedResponse<TokenBalance>>(
    `/v2/addresses/${encodePath(address)}/balances`,
    {
      verbose: options.verbose ?? true,
      limit: options.limit ?? DEFAULT_LIMIT,
      offset: options.offset ?? 0,
      ...(options.sort && { sort: options.sort }),
      ...(options.type && { type: options.type }),
    }
  );
  return data.result ?? [];
}

/**
 * Fetch balance for a specific token at an address.
 * @param address - Bitcoin address to query
 * @param asset - Asset name (e.g., 'XCP', 'PEPECASH')
 * @param options - Options for excluding UTXOs and verbosity
 * @returns Token balance with aggregated quantity
 */
export async function fetchTokenBalance(
  address: string,
  asset: string,
  options: { type?: 'all' | 'utxo' | 'address'; verbose?: boolean } = {}
): Promise<TokenBalance> {
  const data = await cpApiGet<PaginatedResponse<TokenBalance>>(
    `/v2/addresses/${encodePath(address)}/balances/${encodePath(asset)}`,
    {
      verbose: options.verbose ?? true,
      ...(options.type && { type: options.type }),
    }
  );

  const emptyBalance: TokenBalance = {
    asset,
    quantity: asBaseUnits(0),
    quantity_normalized: asDisplayUnits('0'),
    asset_info: { asset_longname: null, description: '', issuer: '', divisible: true, locked: false },
  };

  if (!data.result?.length) return emptyBalance;

  const balances = data.result;
  if (!balances.length) return emptyBalance;

  return {
    asset,
    // Summed as BigNumber and kept as a string: these are 64-bit asset quantities, and adding
    // them as doubles loses digits for exactly the large balances where the total matters most.
    quantity: asBaseUnits(
      balances
        .reduce((sum, b) => sum.plus(toBigNumber(b.quantity ?? 0)), toBigNumber(0))
        .toFixed(0)
    ),
    quantity_normalized: asDisplayUnits(
      balances
        .reduce((sum, b) => sum.plus(toBigNumber(b.quantity_normalized)), toBigNumber(0))
        .toString()
    ),
    asset_info: balances[0]!.asset_info,
  };
}

/**
 * Fetch UTXO-attached balances for a specific token.
 * @param address - Bitcoin address to query
 * @param asset - Asset name
 * @param options - Verbosity options
 * @returns Array of UTXO-attached token balances
 */
export async function fetchTokenUtxos(
  address: string,
  asset: string,
  options: { verbose?: boolean } = {}
): Promise<TokenBalance[]> {
  const data = await cpApiGet<PaginatedResponse<TokenBalance>>(
    `/v2/addresses/${encodePath(address)}/balances/${encodePath(asset)}`,
    { verbose: options.verbose ?? true }
  );
  return (data.result ?? []).filter((b) => b.utxo !== null);
}

/**
 * Fetch detailed information about an asset.
 * @param asset - Asset name to query
 * @param options - Verbosity options
 * @returns Asset details or null if not found
 */
export async function fetchAssetDetails(
  asset: string,
  options: { verbose?: boolean } = {}
): Promise<AssetInfo | null> {
  const data = await cpApiGet<{ result: Omit<AssetInfo, 'asset'> | null }>(
    `/v2/assets/${encodePath(asset)}`,
    { verbose: options.verbose ?? true }
  );
  return data.result ? { asset, ...data.result } : null;
}

/**
 * Fetch all token balances attached to a specific UTXO.
 * @param utxo - UTXO identifier (txid:vout)
 * @param options - Pagination and unconfirmed options
 * @returns Paginated UTXO balances
 */
export async function fetchUtxoBalances(
  utxo: string,
  options: PaginationOptions = {}
): Promise<PaginatedResponse<UtxoBalance>> {
  return cpApiGet<PaginatedResponse<UtxoBalance>>(`/v2/utxos/${encodePath(utxo)}/balances`, {
    verbose: options.verbose ?? true,
    limit: options.limit ?? DEFAULT_LIMIT,
    offset: options.offset ?? 0,
  });
}

/**
 * Fetch assets owned (issued) by an address.
 * @param address - Bitcoin address to query
 * @param options - Pagination options
 * @returns Array of owned assets
 */
export async function fetchOwnedAssets(
  address: string,
  options: PaginationOptions = {}
): Promise<OwnedAsset[]> {
  const data = await cpApiGet<PaginatedResponse<OwnedAsset>>(
    `/v2/addresses/${encodePath(address)}/assets/owned`,
    {
      verbose: options.verbose ?? true,
      limit: options.limit ?? DEFAULT_LIMIT,
      offset: options.offset ?? 0,
    }
  );
  return data.result ?? [];
}

// =============================================================================
// API - Orders
// =============================================================================

/**
 * Fetch orders for an address.
 * @param address - Bitcoin address to query
 * @param options - Pagination and status filter options
 * @returns Paginated order list
 */
export async function fetchOrders(
  address: string,
  options: PaginationOptions & { status?: OrderStatusType } = {}
): Promise<PaginatedResponse<Order>> {
  return cpApiGet<PaginatedResponse<Order>>(`/v2/addresses/${encodePath(address)}/orders`, {
    verbose: options.verbose ?? true,
    limit: options.limit ?? DEFAULT_LIMIT,
    offset: options.offset ?? 0,
    ...(options.status && { status: options.status }),
  });
}

/**
 * Fetch details for a specific order by hash.
 * @param orderHash - Order transaction hash
 * @param options - Verbosity and unconfirmed options
 * @returns Order details or null if not found
 */
export async function fetchOrder(
  orderHash: string,
  options: { verbose?: boolean } = {}
): Promise<OrderDetails | null> {
  const data = await cpApiGet<{ result: OrderDetails | null }>(`/v2/orders/${encodePath(orderHash)}`, {
    verbose: options.verbose ?? true,
  });
  return data.result ?? null;
}

/**
 * Fetch orders for a specific trading pair.
 * @param giveAsset - Asset being offered (e.g., 'XCP', 'PEPECASH')
 * @param getAsset - Asset being requested (e.g., 'BTC', 'XCP')
 * @param options - Pagination and status filter options
 * @returns Paginated list of orders for the trading pair
 */
export async function fetchOrdersByPair(
  giveAsset: string,
  getAsset: string,
  options: PaginationOptions & { status?: OrderStatusType } = {}
): Promise<PaginatedResponse<Order>> {
  return cpApiGet<PaginatedResponse<Order>>(`/v2/orders/${encodePath(giveAsset)}/${encodePath(getAsset)}`, {
    verbose: options.verbose ?? true,
    limit: options.limit ?? DEFAULT_LIMIT,
    offset: options.offset ?? 0,
    ...(options.status && { status: options.status }),
  });
}

/**
 * Fetch matches for a specific order.
 * @param orderHash - Transaction hash of the order
 * @param options - Pagination options
 * @returns Paginated list of order matches
 */
export async function fetchOrderMatches(
  orderHash: string,
  options: PaginationOptions = {}
): Promise<PaginatedResponse<OrderMatch>> {
  return cpApiGet<PaginatedResponse<OrderMatch>>(`/v2/orders/${encodePath(orderHash)}/matches`, {
    verbose: options.verbose ?? true,
    limit: options.limit ?? DEFAULT_LIMIT,
    offset: options.offset ?? 0,
  });
}

/**
 * Fetch order matches for a specific trading pair.
 * @param giveAsset - Asset being offered in the pair
 * @param getAsset - Asset being requested in the pair
 * @param options - Pagination options
 * @returns Paginated list of order matches for the pair
 */
export async function fetchOrderMatchesByPair(
  giveAsset: string,
  getAsset: string,
  options: PaginationOptions = {}
): Promise<PaginatedResponse<OrderMatch>> {
  return cpApiGet<PaginatedResponse<OrderMatch>>(`/v2/orders/${encodePath(giveAsset)}/${encodePath(getAsset)}/matches`, {
    verbose: options.verbose ?? true,
    limit: options.limit ?? DEFAULT_LIMIT,
    offset: options.offset ?? 0,
  });
}

/**
 * Fetch all order matches across all trading pairs.
 * @param options - Pagination and status filter options
 * @returns Paginated list of all order matches
 */
export async function fetchAllOrderMatches(
  options: PaginationOptions & { status?: 'pending' | 'completed' | 'expired' } = {}
): Promise<PaginatedResponse<OrderMatch>> {
  return cpApiGet<PaginatedResponse<OrderMatch>>('/v2/order_matches', {
    verbose: options.verbose ?? true,
    limit: options.limit ?? DEFAULT_LIMIT,
    offset: options.offset ?? 0,
    ...(options.status && { status: options.status }),
  });
}

/**
 * Fetch a single order match by its id (`tx0Hash_tx1Hash`).
 *
 * Used by the approval screen for a BTCPay: the match carries `match_expire_index`, and a payment
 * landing after it does nothing at all — the match is gone and the BTC is spent for no effect.
 */
export async function fetchOrderMatch(matchId: string): Promise<OrderMatch | null> {
  const data = await cpApiGet<{ result: OrderMatch | null }>(
    `/v2/order_matches/${encodePath(matchId)}`,
    { verbose: true }
  );
  return data.result ?? null;
}

/**
 * Count of distinct addresses holding an asset.
 *
 * Core bills a dividend at `0.0002 XCP × holder_count` (`messages/dividend.py`), so this is what
 * decides the XCP half of what a dividend costs.
 */
export async function fetchAssetHolderCount(asset: string): Promise<number | null> {
  const data = await cpApiGet<{ result_count?: number }>(
    `/v2/assets/${encodePath(asset)}/holders`,
    { verbose: true, limit: 1, offset: 0 }
  );
  return typeof data.result_count === 'number' ? data.result_count : null;
}

export interface FairminterDetails {
  tx_hash: string;
  asset: string;
  status: string;
  /** The address that opened the fairminter, and where the payment goes unless it is burned. */
  source?: string;
  /** XCP charged per lot, in base units. */
  price: ApiQuantity;
  price_normalized?: DisplayUnits;
  /** Assets released per lot paid for. */
  quantity_by_price: ApiQuantity;
  quantity_by_price_normalized?: DisplayUnits;
  /** True burns the payment, false sends it to `source`. Not whether the mint is free. */
  burn_payment?: boolean;
  /** While this is unmet, core escrows both the payment and the minted assets. */
  soft_cap?: ApiQuantity;
  soft_cap_normalized?: DisplayUnits;
}

/**
 * The fairminter behind an asset, whose price is what a fairmint of it costs.
 */
export async function fetchAssetFairminter(asset: string): Promise<FairminterDetails | null> {
  const data = await cpApiGet<{ result: FairminterDetails[] | null }>(
    `/v2/assets/${encodePath(asset)}/fairminters`,
    { verbose: true, limit: 5, offset: 0 }
  );
  const open = (data.result ?? []).find((f) => f.status === 'open');
  return open ?? data.result?.[0] ?? null;
}

/**
 * Fetch all orders across all addresses.
 * @param options - Pagination and status filter options (defaults to 'open' status)
 * @returns Paginated list of orders with full details
 */
export async function fetchAllOrders(
  options: PaginationOptions & { status?: OrderStatusType } = {}
): Promise<PaginatedResponse<OrderDetails>> {
  return cpApiGet<PaginatedResponse<OrderDetails>>('/v2/orders', {
    verbose: options.verbose ?? true,
    status: options.status ?? 'open',
    limit: options.limit ?? DEFAULT_LIMIT,
    offset: options.offset ?? 0,
  });
}

/**
 * Fetch orders for a specific asset.
 * @param asset - Asset name to query orders for
 * @param options - Pagination and status filter options (defaults to 'open' status)
 * @returns Paginated list of orders involving the asset
 */
export async function fetchAssetOrders(
  asset: string,
  options: PaginationOptions & { status?: OrderStatusType } = {}
): Promise<PaginatedResponse<OrderDetails>> {
  return cpApiGet<PaginatedResponse<OrderDetails>>(`/v2/assets/${encodePath(asset)}/orders`, {
    verbose: options.verbose ?? true,
    status: options.status ?? 'open',
    limit: options.limit ?? DEFAULT_LIMIT,
    offset: options.offset ?? 0,
  });
}

// =============================================================================
// API - AMM Pools
// =============================================================================

export async function fetchPools(
  options: PaginationOptions = {}
): Promise<PaginatedResponse<Pool>> {
  return cpApiGet<PaginatedResponse<Pool>>('/v2/pools', {
    verbose: options.verbose ?? true,
    limit: options.limit ?? DEFAULT_LIMIT,
    offset: options.offset ?? 0,
  });
}

export async function fetchPool(
  asset1: string,
  asset2: string,
  options: { verbose?: boolean } = {}
): Promise<Pool | null> {
  const data = await cpApiGet<{ result: Pool | null }>(
    `/v2/pools/${encodePath(asset1)}/${encodePath(asset2)}`,
    { verbose: options.verbose ?? true }
  );
  return data.result ?? null;
}

export async function fetchPoolQuote(
  asset1: string,
  asset2: string,
  quantity: number | string
): Promise<PoolQuote> {
  const data = await cpApiGet<{ result: PoolQuote }>(
    `/v2/pools/${encodePath(asset1)}/${encodePath(asset2)}/quote`,
    { quantity: quantity.toString() },
    { skipCache: true }
  );
  return data.result;
}

export async function fetchPoolDepositQuote(
  asset1: string,
  asset2: string,
  quantity: number | string
): Promise<PoolDepositQuote> {
  const data = await cpApiGet<{ result: PoolDepositQuote }>(
    `/v2/pools/${encodePath(asset1)}/${encodePath(asset2)}/quote/deposit`,
    { quantity: quantity.toString() },
    { skipCache: true }
  );
  return data.result;
}

export async function fetchPoolWithdrawQuote(
  asset1: string,
  asset2: string,
  quantity: number | string
): Promise<PoolWithdrawQuote> {
  const data = await cpApiGet<{ result: PoolWithdrawQuote }>(
    `/v2/pools/${encodePath(asset1)}/${encodePath(asset2)}/quote/withdraw`,
    { quantity: quantity.toString() },
    { skipCache: true }
  );
  return data.result;
}

export async function fetchAddressPools(
  address: string,
  options: PaginationOptions = {}
): Promise<PaginatedResponse<PoolPosition>> {
  return cpApiGet<PaginatedResponse<PoolPosition>>(
    `/v2/addresses/${encodePath(address)}/pools`,
    {
      verbose: options.verbose ?? true,
      limit: options.limit ?? 100,
      offset: options.offset ?? 0,
    }
  );
}

export async function fetchAddressPoolByLpAsset(
  address: string,
  lpAsset: string,
  options: PaginationOptions = {}
): Promise<PoolPosition | null> {
  const limit = options.limit ?? 100;
  let offset = options.offset ?? 0;

  while (true) {
    const page = await fetchAddressPools(address, { ...options, limit, offset });
    const pool = page.result.find((position) => position.lp_asset === lpAsset);
    if (pool) return pool;

    offset += limit;
    if (page.result.length < limit || offset >= page.result_count) {
      return null;
    }
  }
}

// =============================================================================
// API - Dispensers
// =============================================================================

/**
 * Fetch dispensers owned by an address.
 * @param address - Bitcoin address to query
 * @param options - Pagination and status filter options
 * @returns Paginated list of dispensers owned by the address
 */
export async function fetchAddressDispensers(
  address: string,
  options: PaginationOptions & { status?: 'open' | 'closed' | 'closing' | 'open_empty_address' } = {}
): Promise<PaginatedResponse<DispenserDetails>> {
  return cpApiGet<PaginatedResponse<DispenserDetails>>(`/v2/addresses/${encodePath(address)}/dispensers`, {
    verbose: options.verbose ?? true,
    limit: options.limit ?? DEFAULT_LIMIT,
    offset: options.offset ?? 0,
    ...(options.status && { status: options.status }),
  });
}

/**
 * Fetch dispenser details by transaction hash.
 * @param txHash - Transaction hash of the dispenser creation
 * @param options - Verbosity options
 * @returns Dispenser details or null if not found
 */
export async function fetchDispenserByHash(
  txHash: string,
  options: { verbose?: boolean } = {}
): Promise<Dispenser | null> {
  const data = await cpApiGet<{ result: Dispenser | null }>(`/v2/dispensers/${encodePath(txHash)}`, {
    verbose: options.verbose ?? true,
  });
  return data.result ?? null;
}

/**
 * Fetch dispenses (purchases) for a specific dispenser.
 * @param dispenserHash - Transaction hash of the dispenser
 * @param options - Pagination and unconfirmed options
 * @returns Paginated list of dispense records
 */
export async function fetchDispenserDispenses(
  dispenserHash: string,
  options: PaginationOptions = {}
): Promise<PaginatedResponse<Dispense>> {
  return cpApiGet<PaginatedResponse<Dispense>>(`/v2/dispensers/${encodePath(dispenserHash)}/dispenses`, {
    verbose: options.verbose ?? true,
    limit: options.limit ?? DEFAULT_LIMIT,
    offset: options.offset ?? 0,
  });
}

export async function fetchMempoolDispenses(dispenserAddress: string): Promise<Dispense[]> {
  const data = await cpApiGet<PaginatedResponse<{ params: Dispense }>>('/v2/mempool/events/DISPENSE', {
    verbose: true,
    limit: 100,
  }, { skipCache: true });
  return (data.result ?? [])
    .map((event) => event.params)
    .filter((dispense) => dispense.source === dispenserAddress);
}

/**
 * Fetch all dispenses across all dispensers.
 * @param options - Pagination options
 * @returns Paginated list of all dispense records
 */
export async function fetchAllDispenses(
  options: PaginationOptions = {}
): Promise<PaginatedResponse<Dispense>> {
  return cpApiGet<PaginatedResponse<Dispense>>('/v2/dispenses', {
    verbose: options.verbose ?? true,
    limit: options.limit ?? DEFAULT_LIMIT,
    offset: options.offset ?? 0,
  });
}

/**
 * Fetch dispenses for a specific asset.
 * @param asset - Asset name to query dispenses for
 * @param options - Pagination options
 * @returns Paginated list of dispenses for the asset
 */
export async function fetchAssetDispenses(
  asset: string,
  options: PaginationOptions = {}
): Promise<PaginatedResponse<Dispense>> {
  return cpApiGet<PaginatedResponse<Dispense>>(`/v2/assets/${encodePath(asset)}/dispenses`, {
    verbose: options.verbose ?? true,
    limit: options.limit ?? DEFAULT_LIMIT,
    offset: options.offset ?? 0,
  });
}

/**
 * Fetch all dispensers across all addresses.
 * @param options - Pagination, status filter, and sort options (defaults to 'open' status)
 * @returns Paginated list of all dispensers with full details
 */
export async function fetchAllDispensers(
  options: PaginationOptions & { status?: 'open' | 'closed' | 'closing'; sort?: string } = {}
): Promise<PaginatedResponse<DispenserDetails>> {
  return cpApiGet<PaginatedResponse<DispenserDetails>>('/v2/dispensers', {
    verbose: options.verbose ?? true,
    status: options.status ?? 'open',
    limit: options.limit ?? DEFAULT_LIMIT,
    offset: options.offset ?? 0,
    ...(options.sort && { sort: options.sort }),
  });
}

/**
 * Fetch dispensers for a specific asset.
 * @param asset - Asset name to query dispensers for
 * @param options - Pagination and status filter options (defaults to 'open' status)
 * @returns Paginated list of dispensers for the asset
 */
export async function fetchAssetDispensers(
  asset: string,
  options: PaginationOptions & { status?: 'open' | 'closed' | 'closing' } = {}
): Promise<PaginatedResponse<DispenserDetails>> {
  return cpApiGet<PaginatedResponse<DispenserDetails>>(`/v2/assets/${encodePath(asset)}/dispensers`, {
    verbose: options.verbose ?? true,
    status: options.status ?? 'open',
    limit: options.limit ?? DEFAULT_LIMIT,
    offset: options.offset ?? 0,
  });
}

// =============================================================================
// API - Transactions
// =============================================================================

/**
 * Fetch a Counterparty transaction by hash.
 * @param txHash - Transaction hash
 * @param options - Verbosity and unconfirmed options
 * @returns Transaction details or null if not found
 */
export async function fetchTransaction(
  txHash: string,
  options: { verbose?: boolean } = {}
): Promise<Transaction | null> {
  const data = await cpApiGet<{ result: Transaction | null }>(`/v2/transactions/${encodePath(txHash)}`, {
    verbose: options.verbose ?? true,
  });
  return data.result ?? null;
}

/**
 * Fetch Counterparty transactions for an address.
 * @param address - Bitcoin address to query
 * @param options - Pagination and unconfirmed options
 * @returns Paginated transaction list
 */
export async function fetchTransactions(
  address: string,
  options: PaginationOptions & { showUnconfirmed?: boolean } = {}
): Promise<PaginatedResponse<Transaction>> {
  return cpApiGet<PaginatedResponse<Transaction>>(`/v2/addresses/${encodePath(address)}/transactions`, {
    verbose: options.verbose ?? true,
    show_unconfirmed: options.showUnconfirmed ?? false,
    limit: options.limit ?? DEFAULT_LIMIT,
    offset: options.offset ?? 0,
  });
}

// =============================================================================
// API - Dividends
// =============================================================================

/**
 * Fetch dividends distributed for a specific asset.
 * @param asset - Asset name that received dividends
 * @param options - Pagination options
 * @returns Paginated list of dividend distributions
 */
export async function fetchDividendsByAsset(
  asset: string,
  options: PaginationOptions = {}
): Promise<PaginatedResponse<Dividend>> {
  return cpApiGet<PaginatedResponse<Dividend>>(`/v2/assets/${encodePath(asset)}/dividends`, {
    verbose: options.verbose ?? true,
    limit: options.limit ?? DEFAULT_LIMIT,
    offset: options.offset ?? 0,
  });
}

// =============================================================================
// API - Server
// =============================================================================

/**
 * Fetch Counterparty server information.
 * @returns Server info including version and network status
 * @throws CounterpartyApiError if server is unavailable
 */
export async function fetchServerInfo(): Promise<ServerInfo> {
  const data = await cpApiGet<{ result: ServerInfo }>('/v2/');
  if (!data.result) {
    throw new CounterpartyApiError('Invalid API response: missing result', '/v2/');
  }
  return data.result;
}
