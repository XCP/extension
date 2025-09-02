import { apiClient, quickApiClient, API_TIMEOUTS } from '@/utils/api/axiosConfig';
import { fetchBTCBalance } from '@/utils/blockchain/bitcoin';
import { formatAmount } from '@/utils/format';
import { fromSatoshis } from '@/utils/numeric';
import { getKeychainSettings } from '@/utils/storage/settingsStorage';

export interface AssetInfo {
  asset: string;
  asset_longname: string | null;
  description?: string;
  issuer?: string;
  divisible: boolean;
  locked: boolean;
  supply?: string | number;
  supply_normalized: string;
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
  const settings = await getKeychainSettings();
  return settings.counterpartyApiBase;
}

/**
 * Helper function to make Counterparty API calls with proper timeout handling
 * @param path - The API path (will be appended to base URL)
 * @param params - Optional query parameters
 * @param useQuickTimeout - Use quick timeout (10s) instead of default (30s)
 * @returns The response data
 */
async function cpApiGet<T = any>(
  path: string,
  params?: Record<string, any>,
  useQuickTimeout: boolean = false
): Promise<T> {
  const base = await getApiBase();
  const url = `${base}${path}`;
  const client = useQuickTimeout ? quickApiClient : apiClient;
  
  const response = await client.get<T>(url, { params });
  return response.data;
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
  options: {
    limit?: number;
    offset?: number;
    verbose?: boolean;
    sort?: string;
  } = {}
): Promise<TokenBalance[]> {
  try {
    const limit = options.limit ?? 100;
    const offset = options.offset ?? 0;
    const verbose = options.verbose ?? true;
    const sort = options.sort ?? null;

    // Use cpApiGet helper with proper timeout
    const data = await cpApiGet<any>(
      `/v2/addresses/${address}/balances`,
      {
        verbose: verbose,
        limit: limit,
        offset: offset,
        sort: sort,
      },
      true // Use quick timeout for balance lookups
    );

    if (!data.result || !Array.isArray(data.result)) {
      return [];
    }

    return data.result;
  } catch (error) {
    console.error('Error fetching token balances:', error);
    return [];
  }
}

/**
 * Fetches the balance of a specific token for a given address.
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
  try {
    const excludeUtxos = options.excludeUtxos ?? false;
    const verbose = options.verbose ?? true;

    const base = await getApiBase();
    const response = await axios.get(
      `${base}/v2/addresses/${address}/balances/${asset}`,
      {
        params: {
          verbose: verbose,
        },
      }
    );
    const data = response.data;

    if (!data.result) {
      return null;
    }

    if (Array.isArray(data.result) && data.result.length === 0) {
      // Return a zero balance if the asset is not held by the address.
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
  } catch (error) {
    console.error('Error fetching token balance:', error);
    return null;
  }
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
  options: {
    verbose?: boolean;
  } = {}
): Promise<TokenBalance[]> {
  try {
    const verbose = options.verbose ?? true;

    const base = await getApiBase();
    const response = await axios.get(
      `${base}/v2/addresses/${address}/balances/${asset}`,
      {
        params: {
          verbose: verbose,
        },
      }
    );
    const data = response.data;

    if (!data.result || !Array.isArray(data.result)) {
      return [];
    }

    // Filter to only include balances with UTXO information
    return data.result.filter((balance: TokenBalance) => balance.utxo !== null);
  } catch (error) {
    console.error('Error fetching token UTXOs:', error);
    return [];
  }
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
  options: {
    verbose?: boolean;
  } = {}
): Promise<AssetInfo | null> {
  try {
    const verbose = options.verbose ?? true;

    const base = await getApiBase();
    const response = await axios.get(
      `${base}/v2/assets/${asset}`,
      {
        params: {
          verbose: verbose,
        },
      }
    );
    const data = response.data;

    if (!data.result) {
      return null;
    }

    return {
      asset,
      ...data.result,
    };
  } catch (error) {
    console.error('Error fetching asset details:', error);
    return null;
  }
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
  options: {
    verbose?: boolean;
  } = {}
): Promise<{
  isDivisible: boolean;
  assetInfo: AssetInfo;
  availableBalance: string;
}> {
  let isDivisible = false;
  let assetInfo: AssetInfo | null = null;
  let availableBalance = '0';
  const verbose = options.verbose ?? true;

  if (asset === 'BTC') {
    // Handle BTC separately.
    isDivisible = true;
    assetInfo = {
      asset: 'BTC',
      asset_longname: null,
      description: 'Bitcoin',
      issuer: '',
      divisible: true,
      locked: true,
      supply: '2100000000000000',
      supply_normalized: '21000000'
    };

    // Fetch BTC balance.
    const balanceSats = await fetchBTCBalance(address);
    const balanceBTC = fromSatoshis(balanceSats, true);
    availableBalance = formatAmount({
      value: balanceBTC,
      maximumFractionDigits: 8,
      minimumFractionDigits: 8
    });
  } else {
    try {
      const base = await getApiBase();

      // Fetch asset details from Counterparty API.
      const assetResponse = await axios.get(
        `${base}/v2/assets/${asset}`,
        {
          params: {
            verbose: verbose,
          },
        }
      );
      const assetData = assetResponse.data.result;
      isDivisible = assetData.divisible;
      assetInfo = assetData;

      // Fetch token balance for the asset, excluding UTXO balances
      const balance = await fetchTokenBalance(address, asset, {
        excludeUtxos: true,
        verbose: verbose,
      }); // excludeUtxos = true
      if (balance) {
        availableBalance = balance.quantity_normalized;
      }
    } catch (error) {
      console.error('Error fetching asset details or token balance:', error);
      // Defaults are already set to zero and false
    }
  }

  return {
    isDivisible,
    assetInfo: assetInfo as AssetInfo,
    availableBalance,
  };
}

/**
 * Fetches all token balances for a specific UTXO.
 *
 * @param utxo - The UTXO identifier (txid:vout).
 * @param options - Optional parameters.
 * @returns A promise that resolves to an array of UtxoBalance objects.
 */
export async function fetchUtxoBalances(
  utxo: string,
  options: {
    cursor?: string;
    limit?: number;
    offset?: number;
    verbose?: boolean;
    show_unconfirmed?: boolean;
  } = {}
): Promise<UtxoBalancesResponse> {
  try {
    const verbose = options.verbose ?? true;
    const show_unconfirmed = options.show_unconfirmed ?? false;

    const base = await getApiBase();
    const response = await axios.get(
      `${base}/v2/utxos/${utxo}/balances`,
      {
        params: {
          cursor: options.cursor,
          limit: options.limit,
          offset: options.offset,
          verbose,
          show_unconfirmed,
        },
      }
    );

    return response.data;
  } catch (error) {
    console.error('Error fetching UTXO balances:', error);
    return {
      result: [],
      next_cursor: null,
      result_count: 0
    };
  }
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
  options: {
    status?: 'open' | 'completed' | 'expired' | 'cancelled';
    limit?: number;
    offset?: number;
    verbose?: boolean;
  } = {}
): Promise<{ orders: Order[]; total: number }> {
  try {
    const verbose = options.verbose ?? true;

    const base = await getApiBase();
    const response = await axios.get(
      `${base}/v2/addresses/${address}/orders`,
      {
        params: {
          verbose: verbose,
          status: options.status,
          limit: options.limit,
          offset: options.offset,
        },
      }
    );

    return {
      orders: response.data.result,
      total: response.data.result_count,
    };
  } catch (error) {
    console.error('Failed to fetch orders:', error);
    throw new Error('Failed to fetch orders');
  }
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
  options: {
    verbose?: boolean;
    showUnconfirmed?: boolean;
  } = {}
): Promise<OrderDetails | null> {
  try {
    const verbose = options.verbose ?? true;
    const showUnconfirmed = options.showUnconfirmed ?? false;

    const base = await getApiBase();
    const response = await axios.get(
      `${base}/v2/orders/${orderHash}`,
      {
        params: {
          verbose: verbose,
          show_unconfirmed: showUnconfirmed,
        },
      }
    );

    if (!response.data.result) {
      return null;
    }

    return response.data.result;
  } catch (error) {
    console.error('Error fetching order details:', error);
    return null;
  }
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
  options: {
    verbose?: boolean;
  } = {}
): Promise<Transaction | null> {
  try {
    const verbose = options.verbose ?? true;

    const base = await getApiBase();
    const response = await axios.get(
      `${base}/v2/transactions/${txHash}`,
      {
        params: {
          show_unconfirmed: true,
          verbose: verbose,
        },
      }
    );

    if (!response.data.result) {
      return null;
    }

    return response.data.result;
  } catch (error) {
    console.error('Error fetching transaction:', error);
    throw new Error('Failed to fetch transaction');
  }
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
  options: {
    limit?: number;
    offset?: number;
    verbose?: boolean;
    show_unconfirmed?: boolean;
  } = {}
): Promise<TransactionResponse> {
  try {
    const limit = options.limit ?? 20;
    const offset = options.offset ?? 0;
    const verbose = options.verbose ?? true;
    const show_unconfirmed = options.show_unconfirmed ?? true;

    const base = await getApiBase();
    const response = await axios.get(
      `${base}/v2/addresses/${address}/transactions`,
      {
        params: {
          verbose,
          show_unconfirmed,
          limit,
          offset,
        },
      }
    );
    return response.data;
  } catch (error) {
    console.error("Error fetching transactions:", error);
    throw error;
  }
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

export interface CreditDebitResponse {
  result: CreditDebit[];
  result_count: number;
}

/**
 * Fetches credit events for a given address
 * Credits are when an address receives assets
 */
export async function fetchCredits(
  address: string,
  options: {
    limit?: number;
    offset?: number;
    asset?: string;
  } = {}
): Promise<CreditDebitResponse> {
  try {
    const limit = options.limit ?? 5;
    const offset = options.offset ?? 0;
    
    const base = await getApiBase();
    const params: any = {
      limit,
      offset,
      verbose: true, // Re-enabled with lower limit
    };
    
    if (options.asset) {
      params.asset = options.asset;
    }
    
    const response = await axios.get(
      `${base}/v2/addresses/${address}/credits`,
      { params }
    );
    return response.data;
  } catch (error) {
    console.error("Error fetching credits:", error);
    throw error;
  }
}

/**
 * Fetches debit events for a given address
 * Debits are when an address sends/spends assets
 */
export async function fetchDebits(
  address: string,
  options: {
    limit?: number;
    offset?: number;
    asset?: string;
  } = {}
): Promise<CreditDebitResponse> {
  try {
    const limit = options.limit ?? 5;
    const offset = options.offset ?? 0;
    
    const base = await getApiBase();
    const params: any = {
      limit,
      offset,
      verbose: true, // Re-enabled with lower limit
    };
    
    if (options.asset) {
      params.asset = options.asset;
    }
    
    const response = await axios.get(
      `${base}/v2/addresses/${address}/debits`,
      { params }
    );
    return response.data;
  } catch (error) {
    console.error("Error fetching debits:", error);
    throw error;
  }
}

/**
 * Fetches dispensers for a given address with optional status filter
 */
export async function fetchAddressDispensers(
  address: string,
  options: {
    status?: 'open' | 'closed' | 'closing' | 'open_empty_address';
    limit?: number;
    offset?: number;
    verbose?: boolean;
  } = {}
): Promise<{ dispensers: Dispenser[]; total: number }> {
  try {
    const verbose = options.verbose ?? true;

    const base = await getApiBase();
    const response = await axios.get(
      `${base}/v2/addresses/${address}/dispensers`,
      {
        params: {
          verbose: verbose,
          status: options.status,
          limit: options.limit,
          offset: options.offset,
        },
      }
    );

    return {
      dispensers: response.data.result,
      total: response.data.result_count,
    };
  } catch (error) {
    console.error('Failed to fetch dispensers:', error);
    throw new Error('Failed to fetch dispensers');
  }
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
  options: {
    verbose?: boolean;
  } = {}
): Promise<Dispenser | null> {
  try {
    const verbose = options.verbose ?? true;

    const base = await getApiBase();
    const response = await axios.get(
      `${base}/v2/dispensers/${txHash}`,
      {
        params: {
          verbose: verbose,
        },
      }
    );

    if (!response.data.result) {
      return null;
    }

    return response.data.result;
  } catch (error) {
    console.error('Error fetching dispenser details:', error);
    return null;
  }
}

/**
 * Fetches dispenses for a specific dispenser transaction
 * @param dispenserHash The transaction hash of the dispenser
 * @param options Optional parameters including show_unconfirmed
 * @returns Promise with dispenses array
 */
export async function fetchDispenserDispenses(
  dispenserHash: string,
  options: {
    show_unconfirmed?: boolean;
    verbose?: boolean;
    limit?: number;
  } = {}
): Promise<{ dispenses: any[] }> {
  try {
    const base = await getApiBase();
    const response = await axios.get(
      `${base}/v2/dispensers/${dispenserHash}/dispenses`,
      {
        params: {
          show_unconfirmed: options.show_unconfirmed ?? false,
          verbose: options.verbose ?? false,
          limit: options.limit,
        },
      }
    );

    if (!response.data.result) {
      return { dispenses: [] };
    }

    return { dispenses: response.data.result };
  } catch (error) {
    console.error('Error fetching dispenser dispenses:', error);
    return { dispenses: [] };
  }
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
  options: {
    verbose?: boolean;
  } = {}
): Promise<OwnedAsset[]> {
  try {
    const verbose = options.verbose ?? true;

    const base = await getApiBase();
    const response = await axios.get(
      `${base}/v2/addresses/${address}/assets/owned`,
      {
        params: {
          verbose: verbose,
        },
      }
    );

    if (!response.data.result) {
      return [];
    }

    return response.data.result;
  } catch (error) {
    console.error('Error fetching owned assets:', error);
    return [];
  }
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
 * Fetches bets for a given feed address with optional status filter
 * 
 * @param feedAddress - The feed address to fetch bets for
 * @param options - Optional parameters for filtering
 * @returns A promise that resolves to a BetsResponse object
 */
export async function fetchBets(
  feedAddress: string,
  options: {
    status?: 'open' | 'filled' | 'cancelled' | 'expired';
    limit?: number;
    offset?: number;
    verbose?: boolean;
  } = {}
): Promise<BetsResponse> {
  try {
    const verbose = options.verbose ?? true;

    const base = await getApiBase();
    const params = new URLSearchParams();
    
    if (options.status) params.append('status', options.status);
    if (options.limit) params.append('limit', options.limit.toString());
    if (options.offset) params.append('offset', options.offset.toString());
    params.append('verbose', verbose.toString());

    const response = await axios.get(
      `${base}/v2/addresses/${feedAddress}/bets?${params.toString()}`
    );

    return response.data;
  } catch (error) {
    console.error('Error fetching bets:', error);
    return {
      result: [],
      next_cursor: null,
      result_count: 0
    };
  }
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
 * Fetches dividend history for a given asset
 */
export async function fetchDividendsByAsset(
  asset: string,
  options: {
    limit?: number;
    offset?: number;
  } = {}
): Promise<DividendResponse> {
  try {
    const limit = options.limit ?? 10;
    const offset = options.offset ?? 0;
    
    const base = await getApiBase();
    const response = await axios.get(
      `${base}/v2/assets/${asset}/dividends`,
      {
        params: {
          limit,
          offset,
          verbose: true,
        },
      }
    );
    return response.data;
  } catch (error) {
    console.error("Error fetching asset dividends:", error);
    throw error;
  }
}
