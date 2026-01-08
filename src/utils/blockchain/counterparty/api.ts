import { apiClient, API_TIMEOUTS } from '@/utils/axios';
import { fetchBTCBalance } from '@/utils/blockchain/bitcoin/balance';
import { CounterpartyApiError } from '@/utils/blockchain/errors';
import { formatAmount } from '@/utils/format';
import { fromSatoshis } from '@/utils/numeric';
import { getSettings } from '@/utils/storage/settingsStorage';

// Status constants for type-safe filtering
export const OrderStatus = {
  OPEN: 'open',
  COMPLETED: 'completed',
  EXPIRED: 'expired',
  CANCELLED: 'cancelled',
} as const;
export type OrderStatusType = typeof OrderStatus[keyof typeof OrderStatus];

export const DispenserStatus = {
  OPEN: 0,
  CLOSED: 10,
  CLOSING: 11,
  OPEN_EMPTY_ADDRESS: 'open_empty_address',
} as const;
export type DispenserStatusType = typeof DispenserStatus[keyof typeof DispenserStatus];

export const BetStatus = {
  OPEN: 'open',
  FILLED: 'filled',
  CANCELLED: 'cancelled',
  EXPIRED: 'expired',
} as const;
export type BetStatusType = typeof BetStatus[keyof typeof BetStatus];

// Generic paginated response from API
export interface PaginatedResponse<T> {
  result: T[];
  next_cursor: string | number | null;
  result_count: number;
}

// Common pagination options
export interface PaginationOptions {
  limit?: number;
  offset?: number;
  cursor?: string | number; // Optional cursor for sequential pagination
  verbose?: boolean;
}

export interface AssetInfo {
  asset: string;
  asset_longname: string | null;
  description?: string;
  issuer?: string;
  divisible: boolean;
  locked: boolean;
  supply?: string | number;
  supply_normalized: string;
  fair_minting?: boolean;
} 

/**
 * Interface representing an order from the Counterparty API
 */
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

/**
 * Interface representing detailed order information from the Counterparty API
 */
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

/**
 * Interface representing a token balance for an address.
 */
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
  // Optional fields used internally by Counterparty API
  address?: string | null;
  utxo?: string | null;
  utxo_address?: string | null;
}

/**
 * Interface representing a Counterparty transaction
 */
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

export interface TransactionResponse {
  result: Transaction[];
  result_count: number;
}

/**
 * Interface representing a dispenser from the Counterparty API
 */
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

export interface UtxoBalance extends TokenBalance {
  utxo: string;
  utxo_address: string;
}

export interface UtxoBalancesResponse {
  result: UtxoBalance[];
  next_cursor: string | null;
  result_count: number;
}

async function getApiBase() {
  const settings = await getSettings();
  return settings.counterpartyApiBase;
}

/**
 * Helper function to make Counterparty API calls with proper error handling.
 * Throws CounterpartyApiError on API errors, letting the error message flow through.
 *
 * @param path - The API path (will be appended to base URL)
 * @param params - Optional query parameters
 * @returns The response data
 */
async function cpApiGet<T = any>(
  path: string,
  params?: Record<string, any>
): Promise<T> {
  const base = await getApiBase();
  const url = `${base}${path}`;

  try {
    const response = await apiClient.get<T | { error: string }>(url, { params });

    // Check if the API returned an error response
    if (response.data && typeof response.data === 'object' && 'error' in response.data) {
      throw new CounterpartyApiError(
        (response.data as { error: string }).error,
        path,
        { statusCode: response.status }
      );
    }

    return response.data as T;
  } catch (error: any) {
    // Re-throw CounterpartyApiError as-is
    if (error instanceof CounterpartyApiError) {
      throw error;
    }

    // Handle axios errors - extract API error message if available
    if (error.response?.data?.error) {
      throw new CounterpartyApiError(
        error.response.data.error,
        path,
        { statusCode: error.response.status, cause: error }
      );
    }

    // Network/timeout errors
    throw new CounterpartyApiError(
      error.message || 'API request failed',
      path,
      { cause: error }
    );
  }
}

/**
 * Fetches the token balances for a given address.
 *
 * @param address - The Bitcoin address to fetch balances for.
 * @param options - Optional parameters for limit and offset.
 * @returns A promise that resolves to an array of TokenBalance objects.
 */
export async function fetchTokenBalances(
  address: string,
  options: PaginationOptions & { sort?: string } = {}
): Promise<TokenBalance[]> {
  const data = await cpApiGet<PaginatedResponse<TokenBalance>>(
    `/v2/addresses/${address}/balances`,
    {
      verbose: options.verbose ?? true,
      limit: options.limit ?? 100,
      offset: options.offset ?? 0,
      cursor: options.cursor,
      sort: options.sort,
    }
  );

  // Ensure we always return an array
  if (!data.result || !Array.isArray(data.result)) {
    return [];
  }

  return data.result;
}

/**
 * Fetches the balance of a specific token for a given address.
 * Aggregates across all balance entries (address + UTXOs) unless excludeUtxos is true.
 *
 * @param address - The Bitcoin address to fetch the token balance for.
 * @param asset - The asset (token) name to fetch the balance of.
 * @param options - Optional parameters.
 * @returns A promise that resolves to a TokenBalance object or null if not found.
 */
export async function fetchTokenBalance(
  address: string,
  asset: string,
  options: {
    excludeUtxos?: boolean;
    verbose?: boolean;
  } = {}
): Promise<TokenBalance | null> {
  const excludeUtxos = options.excludeUtxos ?? false;
  const verbose = options.verbose ?? true;

  const data = await cpApiGet<PaginatedResponse<TokenBalance>>(
    `/v2/addresses/${address}/balances/${asset}`,
    { verbose }
  );

  if (!data.result || data.result.length === 0) {
    // Return a zero balance if the asset is not held by the address
    return {
      asset: asset,
      quantity: 0,
      quantity_normalized: '0',
      asset_info: {
        asset_longname: null,
        description: '',
        issuer: '',
        divisible: true,
        locked: false,
      },
    };
  }

  let balances = data.result;

  if (excludeUtxos) {
    // Filter out balances that have utxo information
    balances = balances.filter((balance: TokenBalance) => !balance.utxo);
  }

  if (balances.length === 0) {
    // After filtering, if no balances are left, return zero balance
    return {
      asset: asset,
      quantity: 0,
      quantity_normalized: '0',
      asset_info: {
        asset_longname: null,
        description: '',
        issuer: '',
        divisible: true,
        locked: false,
      },
    };
  }

  // Aggregate the quantities
  const totalQuantity = balances.reduce(
    (sum: number, entry: TokenBalance) => sum + (entry.quantity || 0),
    0
  );
  const totalQuantityNormalized = balances
    .reduce(
      (sum: number, entry: TokenBalance) =>
        sum + parseFloat(entry.quantity_normalized),
      0
    )
    .toString();

  const firstEntry = balances[0];
  return {
    asset: asset,
    quantity: totalQuantity,
    asset_info: firstEntry.asset_info,
    quantity_normalized: totalQuantityNormalized,
  };
}

/**
 * Fetches token balances that are locked in UTXOs for a given address and asset.
 *
 * @param address - The Bitcoin address to fetch UTXO balances for.
 * @param asset - The asset name to fetch UTXOs for.
 * @param options - Optional parameters.
 * @returns A promise that resolves to an array of TokenBalance objects with UTXO information.
 */
export async function fetchTokenUtxos(
  address: string,
  asset: string,
  options: { verbose?: boolean } = {}
): Promise<TokenBalance[]> {
  const data = await cpApiGet<PaginatedResponse<TokenBalance>>(
    `/v2/addresses/${address}/balances/${asset}`,
    { verbose: options.verbose ?? true }
  );

  if (!data.result) {
    return [];
  }

  // Filter to only include balances with UTXO information
  return data.result.filter((balance: TokenBalance) => balance.utxo !== null);
}

/**
 * Fetches detailed information about a specific asset.
 *
 * @param asset - The asset (token) name to fetch details for.
 * @param options - Optional parameters.
 * @returns A promise that resolves to the asset information or null if not found.
 */
export async function fetchAssetDetails(
  asset: string,
  options: { verbose?: boolean } = {}
): Promise<AssetInfo | null> {
  const data = await cpApiGet<{ result: Omit<AssetInfo, 'asset'> | null }>(
    `/v2/assets/${asset}`,
    { verbose: options.verbose ?? true }
  );

  if (!data.result) {
    return null;
  }

  return {
    asset,
    ...data.result,
  };
}

/**
 * Fetches the asset details and the available balance for a given asset and address.
 *
 * @param asset - The asset (token) name.
 * @param address - The Bitcoin address.
 * @param options - Optional parameters.
 * @returns A promise that resolves to an object containing isDivisible, assetInfo, and availableBalance.
 */
export async function fetchAssetDetailsAndBalance(
  asset: string,
  address: string,
  options: { verbose?: boolean } = {}
): Promise<{
  isDivisible: boolean;
  assetInfo: AssetInfo;
  availableBalance: string;
}> {
  const verbose = options.verbose ?? true;

  if (asset === 'BTC') {
    // Handle BTC separately
    const assetInfo: AssetInfo = {
      asset: 'BTC',
      asset_longname: null,
      description: 'Bitcoin',
      issuer: '',
      divisible: true,
      locked: true,
      supply: '2100000000000000',
      supply_normalized: '21000000',
    };

    // Fetch BTC balance
    const balanceSats = await fetchBTCBalance(address);
    const balanceBTC = fromSatoshis(balanceSats, true);
    const availableBalance = formatAmount({
      value: balanceBTC,
      maximumFractionDigits: 8,
      minimumFractionDigits: 8,
    });

    return {
      isDivisible: true,
      assetInfo,
      availableBalance,
    };
  }

  // Fetch asset details from Counterparty API
  const assetData = await cpApiGet<{ result: AssetInfo }>(
    `/v2/assets/${asset}`,
    { verbose }
  );
  const assetInfo = assetData.result;

  // Fetch token balance for the asset, excluding UTXO balances
  const balance = await fetchTokenBalance(address, asset, {
    excludeUtxos: true,
    verbose,
  });

  return {
    isDivisible: assetInfo.divisible,
    assetInfo,
    availableBalance: balance?.quantity_normalized ?? '0',
  };
}

/**
 * Fetches all token balances for a specific UTXO.
 *
 * @param utxo - The UTXO identifier (txid:vout).
 * @param options - Optional parameters.
 * @returns A promise that resolves to the UTXO balances response.
 */
export async function fetchUtxoBalances(
  utxo: string,
  options: PaginationOptions & { show_unconfirmed?: boolean } = {}
): Promise<UtxoBalancesResponse> {
  return cpApiGet<UtxoBalancesResponse>(`/v2/utxos/${utxo}/balances`, {
    cursor: options.cursor,
    limit: options.limit,
    offset: options.offset,
    verbose: options.verbose ?? true,
    show_unconfirmed: options.show_unconfirmed ?? false,
  });
}

/**
 * Fetches orders for a given address with optional filtering and pagination.
 *
 * @param address - The Bitcoin address to fetch orders for.
 * @param options - Optional parameters for filtering and pagination.
 * @returns A promise that resolves to an object containing orders and total count.
 */
export async function fetchOrders(
  address: string,
  options: PaginationOptions & { status?: OrderStatusType } = {}
): Promise<{ orders: Order[]; total: number }> {
  const data = await cpApiGet<PaginatedResponse<Order>>(
    `/v2/addresses/${address}/orders`,
    {
      verbose: options.verbose ?? true,
      status: options.status,
      limit: options.limit,
      offset: options.offset,
      cursor: options.cursor,
    }
  );

  return {
    orders: data.result,
    total: data.result_count,
  };
}

/**
 * Fetches detailed information about a specific order.
 *
 * @param orderHash - The transaction hash of the order.
 * @param options - Optional parameters.
 * @returns A promise that resolves to the order details or null if not found.
 */
export async function fetchOrder(
  orderHash: string,
  options: { verbose?: boolean; showUnconfirmed?: boolean } = {}
): Promise<OrderDetails | null> {
  const data = await cpApiGet<{ result: OrderDetails | null }>(
    `/v2/orders/${orderHash}`,
    {
      verbose: options.verbose ?? true,
      show_unconfirmed: options.showUnconfirmed ?? false,
    }
  );

  return data.result;
}

/**
 * Fetches detailed information about a specific transaction.
 *
 * @param txHash - The transaction hash to fetch details for.
 * @param options - Optional parameters.
 * @returns A promise that resolves to the transaction details or null if not found.
 */
export async function fetchTransaction(
  txHash: string,
  options: { verbose?: boolean; show_unconfirmed?: boolean } = {}
): Promise<Transaction | null> {
  const data = await cpApiGet<{ result: Transaction | null }>(
    `/v2/transactions/${txHash}`,
    {
      verbose: options.verbose ?? true,
      show_unconfirmed: options.show_unconfirmed ?? true,
    }
  );

  return data.result;
}

/**
 * Fetches transactions for a given address.
 *
 * @param address - The Bitcoin address to fetch transactions for.
 * @param options - Optional parameters for pagination and verbosity.
 * @returns A promise that resolves to a TransactionResponse object.
 */
export async function fetchTransactions(
  address: string,
  options: PaginationOptions & { show_unconfirmed?: boolean } = {}
): Promise<TransactionResponse> {
  return cpApiGet<TransactionResponse>(
    `/v2/addresses/${address}/transactions`,
    {
      verbose: options.verbose ?? true,
      show_unconfirmed: options.show_unconfirmed ?? true,
      limit: options.limit ?? 20,
      offset: options.offset ?? 0,
      cursor: options.cursor,
    }
  );
}

/**
 * Interface for credit and debit events
 */
export interface CreditDebit {
  tx_hash: string;
  block_index: number;
  block_time: number;
  asset: string;
  quantity: number;
  quantity_normalized: string;
  calling_function: string;
  event: string;
  tx_index?: number;
  confirmed?: boolean;
}

interface CreditDebitResponse {
  result: CreditDebit[];
  result_count: number;
}


/**
 * Fetches dispensers for a given address with optional status filter.
 */
export async function fetchAddressDispensers(
  address: string,
  options: PaginationOptions & { status?: 'open' | 'closed' | 'closing' | 'open_empty_address' } = {}
): Promise<{ dispensers: Dispenser[]; total: number }> {
  const data = await cpApiGet<PaginatedResponse<Dispenser>>(
    `/v2/addresses/${address}/dispensers`,
    {
      verbose: options.verbose ?? true,
      status: options.status,
      limit: options.limit,
      offset: options.offset,
      cursor: options.cursor,
    }
  );

  return {
    dispensers: data.result,
    total: data.result_count,
  };
}

/**
 * Fetches detailed information about a specific dispenser.
 *
 * @param txHash - The transaction hash of the dispenser.
 * @param options - Optional parameters.
 * @returns A promise that resolves to the dispenser details or null if not found.
 */
export async function fetchDispenserByHash(
  txHash: string,
  options: { verbose?: boolean } = {}
): Promise<Dispenser | null> {
  const data = await cpApiGet<{ result: Dispenser | null }>(
    `/v2/dispensers/${txHash}`,
    { verbose: options.verbose ?? true }
  );

  return data.result;
}

/**
 * Dispense event representing a purchase from a dispenser.
 */
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

/**
 * Fetches dispenses for a specific dispenser transaction.
 *
 * @param dispenserHash The transaction hash of the dispenser
 * @param options Optional parameters including show_unconfirmed
 * @returns Promise with dispenses array
 */
export async function fetchDispenserDispenses(
  dispenserHash: string,
  options: PaginationOptions & { show_unconfirmed?: boolean } = {}
): Promise<{ dispenses: Dispense[] }> {
  const data = await cpApiGet<PaginatedResponse<Dispense>>(
    `/v2/dispensers/${dispenserHash}/dispenses`,
    {
      show_unconfirmed: options.show_unconfirmed ?? false,
      verbose: options.verbose ?? false,
      limit: options.limit,
      offset: options.offset,
      cursor: options.cursor,
    }
  );

  return { dispenses: data.result ?? [] };
}

export interface OwnedAsset {
  asset: string;
  asset_longname: string | null;
  supply_normalized: string;
  description: string;
  locked: boolean;
}

/**
 * Fetches assets owned by a given address.
 *
 * @param address - The Bitcoin address to fetch owned assets for.
 * @param options - Optional parameters.
 * @returns A promise that resolves to an array of OwnedAsset objects.
 */
export async function fetchOwnedAssets(
  address: string,
  options: PaginationOptions = {}
): Promise<OwnedAsset[]> {
  const data = await cpApiGet<PaginatedResponse<OwnedAsset>>(
    `/v2/addresses/${address}/assets/owned`,
    {
      verbose: options.verbose ?? true,
      limit: options.limit,
      offset: options.offset,
      cursor: options.cursor,
    }
  );

  return data.result ?? [];
}

/**
 * Interface representing a bet from the Counterparty API
 */
export interface Bet {
  tx_index: number;
  tx_hash: string;
  block_index: number;
  source: string;
  feed_address: string;
  bet_type: number;
  deadline: number;
  wager_quantity: number;
  wager_remaining: number;
  counterwager_quantity: number;
  counterwager_remaining: number;
  target_value: number;
  leverage: number;
  expiration: number;
  expire_index: number;
  fee_fraction_int: number;
  status: string;
}

/**
 * Interface representing the response from the bets API endpoint
 */
export interface BetsResponse {
  result: Bet[];
  next_cursor: string | null;
  result_count: number;
}

/**
 * Interface representing aggregated open interest for bets
 */
export interface OpenInterest {
  yesTotal: number;  // Total XCP wagered on "Yes" (bet_type 2)
  noTotal: number;   // Total XCP wagered on "No" (bet_type 3)
  betsCount: number; // Total number of bets
}

/**
 * Fetches bets for a given feed address with optional status filter.
 *
 * @param feedAddress - The feed address to fetch bets for
 * @param options - Optional parameters for filtering
 * @returns A promise that resolves to a BetsResponse object
 */
export async function fetchBets(
  feedAddress: string,
  options: PaginationOptions & { status?: BetStatusType } = {}
): Promise<BetsResponse> {
  return cpApiGet<BetsResponse>(`/v2/addresses/${feedAddress}/bets`, {
    status: options.status,
    limit: options.limit,
    offset: options.offset,
    cursor: options.cursor,
    verbose: options.verbose ?? true,
  });
}

/**
 * Calculates open interest from an array of bets
 * 
 * @param bets - Array of Bet objects
 * @param targetValue - Optional target value to filter by
 * @returns OpenInterest object with aggregated totals
 */
export function calculateOpenInterest(bets: Bet[], targetValue?: number): OpenInterest {
  let yesTotal = 0;
  let noTotal = 0;
  let betsCount = 0;
  
  for (const bet of bets) {
    // If targetValue is specified, only count bets with matching target value
    if (targetValue !== undefined && bet.target_value !== targetValue) {
      continue;
    }
    
    // Only count open or filled bets (not expired/cancelled)
    if (bet.status !== 'open' && bet.status !== 'filled') {
      continue;
    }
    
    // bet_type 2 = Equal (betting "Yes" - value will equal target)
    // bet_type 3 = NotEqual (betting "No" - value won't equal target)
    if (bet.bet_type === 2) {
      yesTotal += fromSatoshis(bet.wager_quantity, true); // Convert satoshis to XCP
    } else if (bet.bet_type === 3) {
      noTotal += fromSatoshis(bet.wager_quantity, true);
    }
    betsCount++;
  }
  
  return {
    yesTotal,
    noTotal,
    betsCount
  };
}

/**
 * Fetches open interest for a feed address
 * 
 * @param feedAddress - The feed address to calculate open interest for
 * @param targetValue - Optional target value to filter by
 * @returns A promise that resolves to OpenInterest totals
 */
export async function fetchOpenInterest(
  feedAddress: string,
  targetValue?: number
): Promise<OpenInterest> {
  try {
    // Fetch all open and filled bets
    const openBets = await fetchBets(feedAddress, { status: 'open' });
    const filledBets = await fetchBets(feedAddress, { status: 'filled' });
    
    // Combine both arrays
    const allBets = [...openBets.result, ...filledBets.result];
    
    // Calculate and return open interest
    return calculateOpenInterest(allBets, targetValue);
  } catch (error) {
    console.error('Error fetching open interest:', error);
    return {
      yesTotal: 0,
      noTotal: 0,
      betsCount: 0
    };
  }
}

/**
 * Interface for dividend events
 */
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

export interface DividendResponse {
  result: Dividend[];
  result_count: number;
}

/**
 * Fetches dividend history for a given asset.
 */
export async function fetchDividendsByAsset(
  asset: string,
  options: PaginationOptions = {}
): Promise<DividendResponse> {
  return cpApiGet<DividendResponse>(`/v2/assets/${asset}/dividends`, {
    limit: options.limit ?? 10,
    offset: options.offset ?? 0,
    cursor: options.cursor,
    verbose: options.verbose ?? true,
  });
}

// =============================================================================
// DEX / Trading Endpoints
// =============================================================================

/**
 * Interface representing an order match (trade fill).
 */
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

/**
 * Fetches orders for a specific trading pair (order book).
 *
 * @param giveAsset - The asset being offered (e.g., "XCP")
 * @param getAsset - The asset being requested (e.g., "PEPECASH")
 * @param options - Optional parameters for filtering and pagination
 * @returns A promise that resolves to an object containing orders and total count
 */
export async function fetchOrdersByPair(
  giveAsset: string,
  getAsset: string,
  options: PaginationOptions & { status?: OrderStatusType } = {}
): Promise<{ orders: Order[]; total: number }> {
  const data = await cpApiGet<PaginatedResponse<Order>>(
    `/v2/orders/${giveAsset}/${getAsset}`,
    {
      verbose: options.verbose ?? true,
      status: options.status,
      limit: options.limit,
      offset: options.offset,
      cursor: options.cursor,
    }
  );

  return {
    orders: data.result,
    total: data.result_count,
  };
}

/**
 * Fetches order matches (trade fills) for a specific order.
 *
 * @param orderHash - The transaction hash of the order
 * @param options - Optional parameters for pagination
 * @returns A promise that resolves to an object containing matches and total count
 */
export async function fetchOrderMatches(
  orderHash: string,
  options: PaginationOptions = {}
): Promise<{ matches: OrderMatch[]; total: number }> {
  const data = await cpApiGet<PaginatedResponse<OrderMatch>>(
    `/v2/orders/${orderHash}/matches`,
    {
      verbose: options.verbose ?? true,
      limit: options.limit,
      offset: options.offset,
      cursor: options.cursor,
    }
  );

  return {
    matches: data.result,
    total: data.result_count,
  };
}

/**
 * Fetches order matches (trade fills) for a specific trading pair.
 *
 * @param giveAsset - The asset being offered
 * @param getAsset - The asset being requested
 * @param options - Optional parameters for pagination
 * @returns A promise that resolves to an object containing matches and total count
 */
export async function fetchOrderMatchesByPair(
  giveAsset: string,
  getAsset: string,
  options: PaginationOptions = {}
): Promise<{ matches: OrderMatch[]; total: number }> {
  const data = await cpApiGet<PaginatedResponse<OrderMatch>>(
    `/v2/orders/${giveAsset}/${getAsset}/matches`,
    {
      verbose: options.verbose ?? true,
      limit: options.limit,
      offset: options.offset,
      cursor: options.cursor,
    }
  );

  return {
    matches: data.result,
    total: data.result_count,
  };
}

// =============================================================================
// Server / Utility Endpoints
// =============================================================================

/**
 * Server info returned from the API root endpoint.
 */
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

/**
 * Fetches server information including version, network, and sync status.
 * Useful for health checks and determining which network the API is connected to.
 *
 * @returns A promise that resolves to the server info
 */
export async function fetchServerInfo(): Promise<ServerInfo> {
  const data = await cpApiGet<{ result: ServerInfo }>('/v2/');
  return data.result;
}
