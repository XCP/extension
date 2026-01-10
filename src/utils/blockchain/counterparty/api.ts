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

async function cpApiGet<T = any>(path: string, params?: Record<string, any>): Promise<T> {
  const base = await getApiBase();
  const url = `${base}${path}`;

  try {
    const response = await apiClient.get<T | { error: string }>(url, { params });

    if (response.data && typeof response.data === 'object' && 'error' in response.data) {
      throw new CounterpartyApiError(
        (response.data as { error: string }).error,
        path,
        { statusCode: response.status }
      );
    }

    return response.data as T;
  } catch (error: any) {
    if (error instanceof CounterpartyApiError) throw error;

    if (error.response?.data?.error) {
      throw new CounterpartyApiError(error.response.data.error, path, {
        statusCode: error.response.status,
        cause: error,
      });
    }

    throw new CounterpartyApiError(error.message || 'API request failed', path, { cause: error });
  }
}

// =============================================================================
// API - Balances & Assets
// =============================================================================

export async function fetchTokenBalances(
  address: string,
  options: PaginationOptions & { sort?: string } = {}
): Promise<TokenBalance[]> {
  const data = await cpApiGet<PaginatedResponse<TokenBalance>>(
    `/v2/addresses/${address}/balances`,
    {
      verbose: options.verbose ?? true,
      limit: options.limit ?? DEFAULT_LIMIT,
      offset: options.offset ?? 0,
      ...(options.sort && { sort: options.sort }),
    }
  );
  return data.result ?? [];
}

export async function fetchTokenBalance(
  address: string,
  asset: string,
  options: { excludeUtxos?: boolean; verbose?: boolean } = {}
): Promise<TokenBalance> {
  const data = await cpApiGet<PaginatedResponse<TokenBalance>>(
    `/v2/addresses/${address}/balances/${asset}`,
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
    quantity_normalized: balances.reduce((sum, b) => sum + parseFloat(b.quantity_normalized), 0).toString(),
    asset_info: balances[0].asset_info,
  };
}

export async function fetchTokenUtxos(
  address: string,
  asset: string,
  options: { verbose?: boolean } = {}
): Promise<TokenBalance[]> {
  const data = await cpApiGet<PaginatedResponse<TokenBalance>>(
    `/v2/addresses/${address}/balances/${asset}`,
    { verbose: options.verbose ?? true }
  );
  return (data.result ?? []).filter((b) => b.utxo !== null);
}

export async function fetchAssetDetails(
  asset: string,
  options: { verbose?: boolean } = {}
): Promise<AssetInfo | null> {
  const data = await cpApiGet<{ result: Omit<AssetInfo, 'asset'> | null }>(
    `/v2/assets/${asset}`,
    { verbose: options.verbose ?? true }
  );
  return data.result ? { asset, ...data.result } : null;
}

export async function fetchUtxoBalances(
  utxo: string,
  options: PaginationOptions & { show_unconfirmed?: boolean } = {}
): Promise<PaginatedResponse<UtxoBalance>> {
  return cpApiGet<PaginatedResponse<UtxoBalance>>(`/v2/utxos/${utxo}/balances`, {
    verbose: options.verbose ?? true,
    limit: options.limit ?? DEFAULT_LIMIT,
    offset: options.offset ?? 0,
    show_unconfirmed: options.show_unconfirmed ?? false,
  });
}

export async function fetchOwnedAssets(
  address: string,
  options: PaginationOptions = {}
): Promise<OwnedAsset[]> {
  const data = await cpApiGet<PaginatedResponse<OwnedAsset>>(
    `/v2/addresses/${address}/assets/owned`,
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

export async function fetchOrders(
  address: string,
  options: PaginationOptions & { status?: OrderStatusType } = {}
): Promise<PaginatedResponse<Order>> {
  return cpApiGet<PaginatedResponse<Order>>(`/v2/addresses/${address}/orders`, {
    verbose: options.verbose ?? true,
    limit: options.limit ?? DEFAULT_LIMIT,
    offset: options.offset ?? 0,
    ...(options.status && { status: options.status }),
  });
}

export async function fetchOrder(
  orderHash: string,
  options: { verbose?: boolean; showUnconfirmed?: boolean } = {}
): Promise<OrderDetails | null> {
  const data = await cpApiGet<{ result: OrderDetails | null }>(`/v2/orders/${orderHash}`, {
    verbose: options.verbose ?? true,
    show_unconfirmed: options.showUnconfirmed ?? false,
  });
  return data.result;
}

export async function fetchOrdersByPair(
  giveAsset: string,
  getAsset: string,
  options: PaginationOptions & { status?: OrderStatusType } = {}
): Promise<PaginatedResponse<Order>> {
  return cpApiGet<PaginatedResponse<Order>>(`/v2/orders/${giveAsset}/${getAsset}`, {
    verbose: options.verbose ?? true,
    limit: options.limit ?? DEFAULT_LIMIT,
    offset: options.offset ?? 0,
    ...(options.status && { status: options.status }),
  });
}

export async function fetchOrderMatches(
  orderHash: string,
  options: PaginationOptions = {}
): Promise<PaginatedResponse<OrderMatch>> {
  return cpApiGet<PaginatedResponse<OrderMatch>>(`/v2/orders/${orderHash}/matches`, {
    verbose: options.verbose ?? true,
    limit: options.limit ?? DEFAULT_LIMIT,
    offset: options.offset ?? 0,
  });
}

export async function fetchOrderMatchesByPair(
  giveAsset: string,
  getAsset: string,
  options: PaginationOptions = {}
): Promise<PaginatedResponse<OrderMatch>> {
  return cpApiGet<PaginatedResponse<OrderMatch>>(`/v2/orders/${giveAsset}/${getAsset}/matches`, {
    verbose: options.verbose ?? true,
    limit: options.limit ?? DEFAULT_LIMIT,
    offset: options.offset ?? 0,
  });
}

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

export async function fetchAssetOrders(
  asset: string,
  options: PaginationOptions & { status?: OrderStatusType } = {}
): Promise<PaginatedResponse<OrderDetails>> {
  return cpApiGet<PaginatedResponse<OrderDetails>>(`/v2/assets/${asset}/orders`, {
    verbose: options.verbose ?? true,
    status: options.status ?? 'open',
    limit: options.limit ?? DEFAULT_LIMIT,
    offset: options.offset ?? 0,
  });
}

// =============================================================================
// API - Dispensers
// =============================================================================

export async function fetchAddressDispensers(
  address: string,
  options: PaginationOptions & { status?: 'open' | 'closed' | 'closing' | 'open_empty_address' } = {}
): Promise<PaginatedResponse<Dispenser>> {
  return cpApiGet<PaginatedResponse<Dispenser>>(`/v2/addresses/${address}/dispensers`, {
    verbose: options.verbose ?? true,
    limit: options.limit ?? DEFAULT_LIMIT,
    offset: options.offset ?? 0,
    ...(options.status && { status: options.status }),
  });
}

export async function fetchDispenserByHash(
  txHash: string,
  options: { verbose?: boolean } = {}
): Promise<Dispenser | null> {
  const data = await cpApiGet<{ result: Dispenser | null }>(`/v2/dispensers/${txHash}`, {
    verbose: options.verbose ?? true,
  });
  return data.result;
}

export async function fetchDispenserDispenses(
  dispenserHash: string,
  options: PaginationOptions & { show_unconfirmed?: boolean } = {}
): Promise<PaginatedResponse<Dispense>> {
  return cpApiGet<PaginatedResponse<Dispense>>(`/v2/dispensers/${dispenserHash}/dispenses`, {
    verbose: options.verbose ?? false,
    limit: options.limit ?? DEFAULT_LIMIT,
    offset: options.offset ?? 0,
    show_unconfirmed: options.show_unconfirmed ?? false,
  });
}

export async function fetchAllDispenses(
  options: PaginationOptions = {}
): Promise<PaginatedResponse<Dispense>> {
  return cpApiGet<PaginatedResponse<Dispense>>('/v2/dispenses', {
    verbose: options.verbose ?? true,
    limit: options.limit ?? DEFAULT_LIMIT,
    offset: options.offset ?? 0,
  });
}

export async function fetchAssetDispenses(
  asset: string,
  options: PaginationOptions = {}
): Promise<PaginatedResponse<Dispense>> {
  return cpApiGet<PaginatedResponse<Dispense>>(`/v2/assets/${asset}/dispenses`, {
    verbose: options.verbose ?? true,
    limit: options.limit ?? DEFAULT_LIMIT,
    offset: options.offset ?? 0,
  });
}

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

export async function fetchAssetDispensers(
  asset: string,
  options: PaginationOptions & { status?: 'open' | 'closed' | 'closing' } = {}
): Promise<PaginatedResponse<DispenserDetails>> {
  return cpApiGet<PaginatedResponse<DispenserDetails>>(`/v2/assets/${asset}/dispensers`, {
    verbose: options.verbose ?? true,
    status: options.status ?? 'open',
    limit: options.limit ?? DEFAULT_LIMIT,
    offset: options.offset ?? 0,
  });
}

// =============================================================================
// API - Transactions
// =============================================================================

export async function fetchTransaction(
  txHash: string,
  options: { verbose?: boolean; show_unconfirmed?: boolean } = {}
): Promise<Transaction | null> {
  const data = await cpApiGet<{ result: Transaction | null }>(`/v2/transactions/${txHash}`, {
    verbose: options.verbose ?? true,
    show_unconfirmed: options.show_unconfirmed ?? true,
  });
  return data.result;
}

export async function fetchTransactions(
  address: string,
  options: PaginationOptions & { show_unconfirmed?: boolean } = {}
): Promise<PaginatedResponse<Transaction>> {
  return cpApiGet<PaginatedResponse<Transaction>>(`/v2/addresses/${address}/transactions`, {
    verbose: options.verbose ?? true,
    show_unconfirmed: options.show_unconfirmed ?? true,
    limit: options.limit ?? DEFAULT_LIMIT,
    offset: options.offset ?? 0,
  });
}

// =============================================================================
// API - Dividends
// =============================================================================

export async function fetchDividendsByAsset(
  asset: string,
  options: PaginationOptions = {}
): Promise<PaginatedResponse<Dividend>> {
  return cpApiGet<PaginatedResponse<Dividend>>(`/v2/assets/${asset}/dividends`, {
    verbose: options.verbose ?? true,
    limit: options.limit ?? DEFAULT_LIMIT,
    offset: options.offset ?? 0,
  });
}

// =============================================================================
// API - Server
// =============================================================================

export async function fetchServerInfo(): Promise<ServerInfo> {
  const data = await cpApiGet<{ result: ServerInfo }>('/v2/');
  return data.result;
}
