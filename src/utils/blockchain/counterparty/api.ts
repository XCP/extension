import axios from 'axios';
import { fetchBTCBalance } from '@/utils/blockchain/bitcoin';

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
  block_index: number;
  block_time: number;
  source: string;
  destination: string;
  type: string;
  status: string;
  data: Record<string, any>;
  supported: boolean;
  unpacked_data: {
    message_type: string;
    message_data?: any;
  };
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
    const sort = options.sort ?? 'asset:desc';

    const response = await axios.get(
      `https://api.counterparty.io:4000/v2/addresses/${address}/balances`,
      {
        params: {
          verbose: verbose,
          limit: limit,
          offset: offset,
          sort: sort,
        },
      }
    );
    const data = response.data;

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

    const response = await axios.get(
      `https://api.counterparty.io:4000/v2/addresses/${address}/balances/${asset}`,
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

    const response = await axios.get(
      `https://api.counterparty.io:4000/v2/addresses/${address}/balances/${asset}`,
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

    const response = await axios.get(
      `https://api.counterparty.io:4000/v2/assets/${asset}`,
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
    const balanceBTC = balanceSats / 1e8;
    availableBalance = balanceBTC.toFixed(8);
  } else {
    try {
      // Fetch asset details from Counterparty API.
      const assetResponse = await axios.get(
        `https://api.counterparty.io:4000/v2/assets/${asset}`,
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
 * @returns A promise that resolves to an array of TokenBalance objects.
 */
export async function fetchUtxoBalances(
  utxo: string,
  options: {
    verbose?: boolean;
  } = {}
): Promise<TokenBalance[]> {
  try {
    const verbose = options.verbose ?? true;

    const response = await axios.get(
      `https://api.counterparty.io:4000/v2/utxos/${utxo}/balances`,
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

    return data.result;
  } catch (error) {
    console.error('Error fetching UTXO balances:', error);
    return [];
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

    const response = await axios.get(
      `https://api.counterparty.io:4000/v2/addresses/${address}/orders`,
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

    const response = await axios.get(
      `https://api.counterparty.io:4000/v2/orders/${orderHash}`,
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

    const response = await axios.get(
      `https://api.counterparty.io:4000/v2/transactions/${txHash}?show_unconfirmed=true`,
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

    const response = await axios.get(
      `https://api.counterparty.io:4000/v2/addresses/${address}/transactions`,
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

    const response = await axios.get(
      `https://api.counterparty.io:4000/v2/addresses/${address}/dispensers`,
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
