/**
 * Counterparty API Client
 *
 * Provides typed functions for interacting with the Counterparty REST API.
 * All functions handle pagination, error handling, and response normalization.
 *
 * @see https://counterpartycore.docs.apiary.io/ for API documentation
 */

import { apiClient } from '@/utils/apiClient';
import { CounterpartyApiError } from '@/utils/blockchain/errors';
import { getSettings } from '@/utils/storage/settingsStorage';

// =============================================================================
// CONSTANTS
// =============================================================================

const DEFAULT_LIMIT = 10;

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
  supply_normalized: string;
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
  quantity?: number;
  quantity_normalized: string;
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
  supply_normalized: string;
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
  give_quantity_normalized: string;
  get_quantity_normalized: string;
  give_remaining_normalized: string;
  get_remaining_normalized: string;
  status: string;
  expire_index: number;
}

export interface OrderDetails extends Order {
  source: string;
  give_quantity: number;
  get_quantity: number;
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
  give_price_normalized?: string;
  get_price_normalized?: string;
  fee_provided_normalized?: string;
  fee_required_normalized?: string;
  fee_required_remaining_normalized?: string;
  fee_provided_remaining_normalized?: string;
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
  forward_quantity_normalized: string;
  backward_asset: string;
  backward_quantity: number;
  backward_quantity_normalized: string;
  tx0_block_index: number;
  tx1_block_index: number;
  block_index: number;
  block_time: number;
  match_expire_index: number;
  fee_paid: number;
  fee_paid_normalized: string;
  status: string;
  confirmed?: boolean;
}

// =============================================================================
// TYPES - Dispensers
// =============================================================================

export interface Dispenser {
  tx_hash: string;
  source: string;
  asset: string;
  status: number;
  give_remaining: number;
  give_remaining_normalized: string;
  asset_info?: {
    asset_longname: string | null;
    description: string;
    issuer: string | null;
    divisible: boolean;
    locked: boolean;
  };
}

export interface DispenserDetails extends Dispenser {
  give_quantity: number;
  give_quantity_normalized: string;
  satoshirate: number;
  satoshirate_normalized: string;
  escrow_quantity: number;
  escrow_quantity_normalized: string;
  block_index: number;
  block_time: number;
  confirmed?: boolean;
  price: number;
  satoshi_price: number;
}

export interface Dispense {
  tx_hash: string;
  tx_index: number;
  block_index: number;
  block_time: number;
  source: string;
  destination: string;
  asset: string;
  dispense_quantity: number;
  dispense_quantity_normalized: string;
  dispenser_tx_hash: string;
  btc_amount: number;
  btc_amount_normalized: string;
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
  btc_amount_normalized?: string;
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
  quantity_per_unit: number;
  quantity_per_unit_normalized: string;
  total_distributed: number;
  total_distributed_normalized: string;
  fee_paid: number;
  fee_paid_normalized: string;
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
  const settings = await getSettings();
  return settings.counterpartyApiBase;
}

/**
 * URL-encodes a path segment for safe URL construction.
 */
function encodePath(segment: string): string {
  return encodeURIComponent(segment);
}

/**
 * Generic API GET helper with proper error handling.
 * Uses unknown instead of any for type safety.
 */
async function cpApiGet<T = unknown>(
  path: string,
  params?: Record<string, string | number | boolean | undefined>
): Promise<T> {
  const base = await getApiBase();
  const url = `${base}${path}`;

  // Filter out undefined values from params
  const filteredParams = params
    ? Object.fromEntries(
        Object.entries(params).filter(([, v]) => v !== undefined)
      ) as Record<string, string | number | boolean>
    : undefined;

  try {
    const response = await apiClient.get<T | { error: string }>(url, { params: filteredParams });

    if (response.data && typeof response.data === 'object' && 'error' in response.data) {
      throw new CounterpartyApiError(
        (response.data as { error: string }).error,
        path,
        { statusCode: response.status }
      );
    }

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
 * @param options - Pagination and sorting options
 * @returns Array of token balances with asset info
 */
export async function fetchTokenBalances(
  address: string,
  options: PaginationOptions & { sort?: string } = {}
): Promise<TokenBalance[]> {
  const data = await cpApiGet<PaginatedResponse<TokenBalance>>(
    `/v2/addresses/${encodePath(address)}/balances`,
    {
      verbose: options.verbose ?? true,
      limit: options.limit ?? DEFAULT_LIMIT,
      offset: options.offset ?? 0,
      ...(options.sort && { sort: options.sort }),
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
  options: { excludeUtxos?: boolean; verbose?: boolean } = {}
): Promise<TokenBalance> {
  const data = await cpApiGet<PaginatedResponse<TokenBalance>>(
    `/v2/addresses/${encodePath(address)}/balances/${encodePath(asset)}`,
    { verbose: options.verbose ?? true }
  );

  const emptyBalance: TokenBalance = {
    asset,
    quantity: 0,
    quantity_normalized: '0',
    asset_info: { asset_longname: null, description: '', issuer: '', divisible: true, locked: false },
  };

  if (!data.result?.length) return emptyBalance;

  const balances = options.excludeUtxos ? data.result.filter((b) => !b.utxo) : data.result;
  if (!balances.length) return emptyBalance;

  return {
    asset,
    quantity: balances.reduce((sum, b) => sum + (b.quantity || 0), 0),
    quantity_normalized: balances.reduce((sum, b) => {
      const val = parseFloat(b.quantity_normalized);
      return sum + (Number.isNaN(val) ? 0 : val);
    }, 0).toString(),
    asset_info: balances[0].asset_info,
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
  options: PaginationOptions & { showUnconfirmed?: boolean } = {}
): Promise<PaginatedResponse<UtxoBalance>> {
  return cpApiGet<PaginatedResponse<UtxoBalance>>(`/v2/utxos/${encodePath(utxo)}/balances`, {
    verbose: options.verbose ?? true,
    limit: options.limit ?? DEFAULT_LIMIT,
    offset: options.offset ?? 0,
    show_unconfirmed: options.showUnconfirmed ?? false,
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
  options: { verbose?: boolean; showUnconfirmed?: boolean } = {}
): Promise<OrderDetails | null> {
  const data = await cpApiGet<{ result: OrderDetails | null }>(`/v2/orders/${encodePath(orderHash)}`, {
    verbose: options.verbose ?? true,
    show_unconfirmed: options.showUnconfirmed ?? false,
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
): Promise<PaginatedResponse<Dispenser>> {
  return cpApiGet<PaginatedResponse<Dispenser>>(`/v2/addresses/${encodePath(address)}/dispensers`, {
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
  options: PaginationOptions & { showUnconfirmed?: boolean } = {}
): Promise<PaginatedResponse<Dispense>> {
  return cpApiGet<PaginatedResponse<Dispense>>(`/v2/dispensers/${encodePath(dispenserHash)}/dispenses`, {
    verbose: options.verbose ?? true,
    limit: options.limit ?? DEFAULT_LIMIT,
    offset: options.offset ?? 0,
    show_unconfirmed: options.showUnconfirmed ?? false,
  });
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
  options: { verbose?: boolean; showUnconfirmed?: boolean } = {}
): Promise<Transaction | null> {
  const data = await cpApiGet<{ result: Transaction | null }>(`/v2/transactions/${encodePath(txHash)}`, {
    verbose: options.verbose ?? true,
    show_unconfirmed: options.showUnconfirmed ?? false,
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
