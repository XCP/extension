import { apiClient } from '@/utils/apiClient';
import { walletManager } from '@/utils/wallet/walletManager';
import { CounterpartyApiError } from '@/utils/blockchain/errors';

/**
 * Type guard to check if an error has a response with data
 */
function isApiErrorWithResponse(error: unknown): error is {
  response?: { data?: { error?: string } };
  code?: string;
  message?: string;
} {
  return typeof error === 'object' && error !== null;
}

/**
 * Convert a params object to a string record for URLSearchParams.
 * All values are explicitly converted to strings.
 */
function toStringParams(obj: Record<string, unknown>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined && value !== null) {
      result[key] = String(value);
    }
  }
  return result;
}

export interface SignedTxEstimatedSize {
  vsize: number;
  adjusted_vsize: number;
  sigops_count: number;
}

export interface ComposeAssetInfo {
  asset_longname: string | null;
  description: string;
  issuer: string;
  divisible: boolean;
  locked: boolean;
  owner: string;
}

export interface ComposeParams {
  source: string;
  destination: string;
  asset: string;
  quantity: number;
  memo: string | null;
  memo_is_hex: boolean;
  use_enhanced_send: boolean;
  no_dispense: boolean;
  skip_validation: boolean;
  asset_info: ComposeAssetInfo;
  quantity_normalized: string;
}

export interface ComposeResult {
  rawtransaction: string;
  btc_in: number;
  btc_out: number;
  btc_change: number;
  btc_fee: number;
  data: string;
  lock_scripts: string[];
  inputs_values: number[];
  signed_tx_estimated_size: SignedTxEstimatedSize;
  psbt: string;
  params: ComposeParams & {
    asset_dest_quant_list?: [string, string, string][];
    memos?: string[];
  };
  name: string;
}

export interface ApiResponse {
  result: ComposeResult;
}

// Base options shared across all transaction types
export interface BaseComposeOptions {
  sourceAddress: string;
  sat_per_vbyte: number;
  max_fee?: number;
  encoding?: 'auto' | 'opreturn' | 'multisig' | 'pubkeyhash' | 'taproot';
  change_address?: string;
  more_outputs?: string;
  use_all_inputs_set?: boolean;
  multisig_pubkey?: string;
}

// Transaction-specific options
export interface BroadcastOptions extends BaseComposeOptions {
  text: string;
  value?: string;
  fee_fraction?: string;
  timestamp?: string;
  inscription?: string;  // Base64 encoded inscription data
  mime_type?: string;   // MIME type for inscription (e.g., 'image/png', 'text/plain')
}

export interface BTCPayOptions extends BaseComposeOptions {
  order_match_id: string;
}

export interface BurnOptions extends BaseComposeOptions {
  quantity: number;
  overburn?: boolean;
}

export interface CancelOptions extends BaseComposeOptions {
  offer_hash: string;
}

export interface DestroyOptions extends BaseComposeOptions {
  asset: string;
  quantity: number;
  tag?: string;
}

export interface DispenserOptions extends BaseComposeOptions {
  asset: string;
  give_quantity: number;
  escrow_quantity: number;
  mainchainrate: number;
  status?: string;
  open_address?: string;
  oracle_address?: string;
}

export interface DispenseOptions extends BaseComposeOptions {
  dispenser: string;
  quantity: number;
  pubkeys?: string;
}

export interface DividendOptions extends BaseComposeOptions {
  asset: string;
  dividend_asset: string;
  quantity_per_unit: number;
}

export interface IssuanceOptions extends BaseComposeOptions {
  asset: string;
  quantity: number;
  divisible?: boolean;
  lock: boolean;
  reset: boolean;
  transfer_destination?: string;
  description?: string;
  pubkeys?: string;
  inscription?: string;  // Base64 encoded inscription data
  mime_type?: string;   // MIME type for inscription (e.g., 'image/png', 'text/plain')
}

export interface MPMAOptions extends BaseComposeOptions {
  assets: string[];
  destinations: string[];
  quantities: string[];
  memos?: string[];
  memos_are_hex?: boolean[];
}

export interface OrderOptions extends BaseComposeOptions {
  give_asset: string;
  give_quantity: number;
  get_asset: string;
  get_quantity: number;
  expiration: number;
  fee_required?: number;
}

export interface SendOptions extends BaseComposeOptions {
  destination: string;
  asset: string;
  quantity: number;
  memo?: string;
  memo_is_hex?: boolean;
}

export interface SweepOptions extends BaseComposeOptions {
  destination: string;
  flags: number;
  memo?: string;
}

export interface FairminterOptions extends BaseComposeOptions {
  asset: string;
  lot_price?: number;
  lot_size?: number;
  max_mint_per_tx?: number;
  hard_cap?: number;
  premint_quantity?: number;
  start_block?: number;
  end_block?: number;
  soft_cap?: number;
  soft_cap_deadline_block?: number;
  minted_asset_commission?: number;
  burn_payment?: boolean;
  lock_description?: boolean;
  lock_quantity?: boolean;
  divisible?: boolean;
  description?: string;
  pubkeys?: string;
  inscription?: string;  // Base64 encoded inscription data
  mime_type?: string;   // MIME type for inscription (e.g., 'image/png', 'text/plain')
}

export interface FairmintOptions extends BaseComposeOptions {
  asset: string;
  quantity?: number;
}

export interface AttachOptions extends BaseComposeOptions {
  asset: string;
  quantity: number;
  utxo_value?: number; // Optional value for the new UTXO (disabled after block 871900)
  destination_vout?: number; // Optional output to attach to
}

export interface DetachOptions extends BaseComposeOptions {
  sourceUtxo: string; // The UTXO to detach from (txid:vout)
  destination?: string; // Optional destination address (defaults to UTXO's address)
}

export interface MoveOptions extends BaseComposeOptions {
  sourceUtxo: string; // The UTXO to move from (txid:vout)
  destination: string; // Address to create new UTXO at
}

async function getApiBase() {
  const settings = walletManager.getSettings();
  return settings.counterpartyApiBase;
}

// Helper function for endpoints that need array parameters
async function composeTransactionWithArrays<T extends Record<string, unknown>>(
  endpoint: string,
  paramsObj: T,
  arrayParams: { [key: string]: (string | boolean | undefined)[] | undefined },
  sourceAddress: string,
  sat_per_vbyte: number,
  encoding?: string
): Promise<ApiResponse> {
  const base = await getApiBase();
  const apiUrl = `${base}/v2/addresses/${sourceAddress}/compose/${endpoint}`;

  // Get user's unconfirmed transaction preference
  const settings = walletManager.getSettings();

  const params = new URLSearchParams(toStringParams({
    ...paramsObj,
    sat_per_vbyte: sat_per_vbyte.toString(),
    exclude_utxos_with_balances: 'true',
    allow_unconfirmed_inputs: settings.allowUnconfirmedTxs.toString(),
    disable_utxo_locks: 'true',
    verbose: 'true',
    ...(encoding && { encoding }),
  }));

  // Build URL with array notation for array params
  let url = `${apiUrl}?${params.toString()}`;

  for (const [key, values] of Object.entries(arrayParams)) {
    if (values && Array.isArray(values)) {
      for (const value of values) {
        url += `&${key}[]=${encodeURIComponent(String(value ?? ''))}`;
      }
    }
  }

  try {
    // Use longApiClient for transaction composition (60 second timeout)
    const response = await apiClient.get<ApiResponse | { error: string }>(url, {
      headers: { 'Content-Type': 'application/json' },
    });

    // Check if the API returned an error response
    if ('error' in response.data) {
      throw new CounterpartyApiError(response.data.error, endpoint, {});
    }

    return response.data as ApiResponse;
  } catch (error: unknown) {
    if (error instanceof CounterpartyApiError) throw error;

    // Handle timeout errors specifically
    if (isApiErrorWithResponse(error)) {
      if (error.code === 'TIMEOUT') {
        throw new CounterpartyApiError(
          'Transaction composition timed out',
          endpoint,
          { cause: error instanceof Error ? error : undefined }
        );
      }
      if (error.response?.data?.error) {
        throw new CounterpartyApiError(error.response.data.error, endpoint, {
          cause: error instanceof Error ? error : undefined,
        });
      }
    }

    const message = error instanceof Error ? error.message : 'Transaction composition failed';
    throw new CounterpartyApiError(message, endpoint, {
      cause: error instanceof Error ? error : undefined,
    });
  }
}

export async function composeTransaction<T extends Record<string, unknown>>(
  endpoint: string,
  paramsObj: T,
  sourceAddress: string,
  sat_per_vbyte: number,
  encoding?: string
): Promise<ApiResponse> {
  const base = await getApiBase();
  const apiUrl = `${base}/v2/addresses/${sourceAddress}/compose/${endpoint}`;

  // Get user's unconfirmed transaction preference
  const settings = walletManager.getSettings();

  const params = new URLSearchParams(toStringParams({
    ...paramsObj,
    sat_per_vbyte: sat_per_vbyte.toString(),
    exclude_utxos_with_balances: 'true',
    allow_unconfirmed_inputs: settings.allowUnconfirmedTxs.toString(),
    disable_utxo_locks: 'true',
    verbose: 'true',
    ...(encoding && { encoding }),
  }));

  const url = `${apiUrl}?${params.toString()}`;

  try {
    // Use apiClient for automatic timeout (60s for /compose) and retry logic
    const response = await apiClient.get<ApiResponse | { error: string }>(url, {
      headers: { 'Content-Type': 'application/json' },
    });

    // Check if the API returned an error response
    if ('error' in response.data) {
      throw new CounterpartyApiError(response.data.error, endpoint, {});
    }

    return response.data as ApiResponse;
  } catch (error: unknown) {
    if (error instanceof CounterpartyApiError) throw error;

    // Handle timeout errors specifically
    if (isApiErrorWithResponse(error)) {
      if (error.code === 'TIMEOUT') {
        throw new CounterpartyApiError(
          'Transaction composition timed out',
          endpoint,
          { cause: error instanceof Error ? error : undefined }
        );
      }
      if (error.response?.data?.error) {
        throw new CounterpartyApiError(error.response.data.error, endpoint, {
          cause: error instanceof Error ? error : undefined,
        });
      }
    }

    const message = error instanceof Error ? error.message : 'Transaction composition failed';
    throw new CounterpartyApiError(message, endpoint, {
      cause: error instanceof Error ? error : undefined,
    });
  }
}

// New function for UTXO-based compose transactions (detach, move)
export async function composeUtxoTransaction<T extends Record<string, unknown>>(
  endpoint: string,
  paramsObj: T,
  sourceUtxo: string,
  sat_per_vbyte: number,
  encoding?: string
): Promise<ApiResponse> {
  const base = await getApiBase();
  const apiUrl = `${base}/v2/utxos/${sourceUtxo}/compose/${endpoint}`;

  // Get user's unconfirmed transaction preference
  const settings = walletManager.getSettings();

  const params = new URLSearchParams(toStringParams({
    ...paramsObj,
    sat_per_vbyte: sat_per_vbyte.toString(),
    exclude_utxos_with_balances: 'true',
    allow_unconfirmed_inputs: settings.allowUnconfirmedTxs.toString(),
    disable_utxo_locks: 'true',
    verbose: 'true',
    ...(encoding && { encoding }),
  }));

  const url = `${apiUrl}?${params.toString()}`;

  try {
    // Use apiClient for automatic timeout (60s for /compose) and retry logic
    const response = await apiClient.get<ApiResponse | { error: string }>(url, {
      headers: { 'Content-Type': 'application/json' },
    });

    // Check if the API returned an error response
    if ('error' in response.data) {
      throw new CounterpartyApiError(response.data.error, endpoint, {});
    }

    return response.data as ApiResponse;
  } catch (error: unknown) {
    if (error instanceof CounterpartyApiError) throw error;

    // Handle timeout errors specifically
    if (isApiErrorWithResponse(error)) {
      if (error.code === 'TIMEOUT') {
        throw new CounterpartyApiError(
          'Transaction composition timed out',
          endpoint,
          { cause: error instanceof Error ? error : undefined }
        );
      }
      if (error.response?.data?.error) {
        throw new CounterpartyApiError(error.response.data.error, endpoint, {
          cause: error instanceof Error ? error : undefined,
        });
      }
    }

    const message = error instanceof Error ? error.message : 'Transaction composition failed';
    throw new CounterpartyApiError(message, endpoint, {
      cause: error instanceof Error ? error : undefined,
    });
  }
}

export async function composeBroadcast(options: BroadcastOptions): Promise<ApiResponse> {
  const {
    sourceAddress,
    text,
    value = '0',
    fee_fraction = '0',
    timestamp = Math.floor(Date.now() / 1000).toString(),
    sat_per_vbyte,
    max_fee,
    encoding,
    inscription,
    mime_type,
  } = options;
  const paramsObj = {
    text,
    value,
    fee_fraction,
    timestamp,
    ...(inscription && { inscription }),
    ...(mime_type && { mime_type }),
    ...(max_fee !== undefined && { max_fee: max_fee.toString() }),
  };
  return composeTransaction('broadcast', paramsObj, sourceAddress, sat_per_vbyte, encoding);
}

export async function composeBTCPay(options: BTCPayOptions): Promise<ApiResponse> {
  const { sourceAddress, order_match_id, sat_per_vbyte, max_fee, encoding } = options;
  const paramsObj = {
    order_match_id,
    ...(max_fee !== undefined && { max_fee: max_fee.toString() }),
  };
  return composeTransaction('btcpay', paramsObj, sourceAddress, sat_per_vbyte, encoding);
}

export async function composeBurn(options: BurnOptions): Promise<ApiResponse> {
  const { sourceAddress, quantity, overburn = false, sat_per_vbyte, max_fee, encoding } = options;
  const paramsObj = {
    quantity: quantity.toString(),
    overburn: overburn.toString(),
    ...(max_fee !== undefined && { max_fee: max_fee.toString() }),
  };
  return composeTransaction('burn', paramsObj, sourceAddress, sat_per_vbyte, encoding);
}

export async function composeCancel(options: CancelOptions): Promise<ApiResponse> {
  const { sourceAddress, offer_hash, sat_per_vbyte, max_fee, encoding } = options;
  const paramsObj = {
    offer_hash: offer_hash.trim(),
    ...(max_fee !== undefined && { max_fee: max_fee.toString() }),
  };
  return composeTransaction('cancel', paramsObj, sourceAddress, sat_per_vbyte, encoding);
}

export async function composeDestroy(options: DestroyOptions): Promise<ApiResponse> {
  const { sourceAddress, asset, quantity, tag, sat_per_vbyte, max_fee, encoding } = options;
  const paramsObj = {
    asset,
    quantity: quantity.toString(),
    tag: tag || '', // Always include tag, even if empty
    ...(max_fee !== undefined && { max_fee: max_fee.toString() }),
  };
  return composeTransaction('destroy', paramsObj, sourceAddress, sat_per_vbyte, encoding);
}

export async function composeDispenser(options: DispenserOptions): Promise<ApiResponse> {
  const {
    sourceAddress,
    asset,
    give_quantity,
    escrow_quantity,
    mainchainrate,
    status = '0',
    open_address,
    oracle_address,
    sat_per_vbyte,
    max_fee,
    encoding,
  } = options;
  const paramsObj = {
    asset,
    give_quantity: give_quantity.toString(),
    escrow_quantity: escrow_quantity.toString(),
    mainchainrate: mainchainrate.toString(),
    status: status.toString(),
    ...(open_address && { open_address }),
    ...(oracle_address && { oracle_address }),
    ...(max_fee !== undefined && { max_fee: max_fee.toString() }),
  };
  return composeTransaction('dispenser', paramsObj, sourceAddress, sat_per_vbyte, encoding);
}

export async function composeDispense(options: DispenseOptions): Promise<ApiResponse> {
  const {
    sourceAddress,
    dispenser,
    quantity,
    encoding,
    pubkeys,
    sat_per_vbyte,
    max_fee,
  } = options;
  const paramsObj = {
    dispenser,
    quantity: quantity.toString(),
    ...(pubkeys && { pubkeys }),
    ...(max_fee !== undefined && { max_fee: max_fee.toString() }),
  };
  return composeTransaction('dispense', paramsObj, sourceAddress, sat_per_vbyte, encoding);
}

export async function composeDividend(options: DividendOptions): Promise<ApiResponse> {
  const {
    sourceAddress,
    asset,
    dividend_asset,
    quantity_per_unit,
    sat_per_vbyte,
    max_fee,
    encoding,
  } = options;
  const paramsObj = {
    asset,
    dividend_asset,
    quantity_per_unit: quantity_per_unit.toString(),
    ...(max_fee !== undefined && { max_fee: max_fee.toString() }),
  };
  return composeTransaction('dividend', paramsObj, sourceAddress, sat_per_vbyte, encoding);
}

export async function getDividendEstimateXcpFee(sourceAddress: string, asset: string): Promise<number> {
  const base = await getApiBase();
  const apiUrl = `${base}/v2/addresses/${sourceAddress}/compose/dividend/estimatexcpfees`;
  const params = new URLSearchParams({ asset });
  const response = await apiClient.get<{ result: number }>(`${apiUrl}?${params.toString()}`);
  return response.data.result;
}

export async function composeIssuance(options: IssuanceOptions): Promise<ApiResponse> {
  const {
    sourceAddress,
    asset,
    quantity,
    divisible,
    lock,
    reset,
    transfer_destination,
    description,
    sat_per_vbyte,
    max_fee,
    pubkeys,
    encoding,
    inscription,
    mime_type,
  } = options;
  const paramsObj = {
    asset,
    quantity: quantity.toString(),
    ...(divisible !== undefined && { divisible: divisible ? 'true' : 'false' }),
    lock: lock ? 'true' : 'false',
    reset: reset ? 'true' : 'false',
    ...(transfer_destination && { transfer_destination }),
    ...(description && { description }),
    ...(pubkeys && { pubkeys }),
    ...(inscription && { inscription }),
    ...(mime_type && { mime_type }),
    ...(max_fee !== undefined && { max_fee: max_fee.toString() }),
  };
  return composeTransaction('issuance', paramsObj, sourceAddress, sat_per_vbyte, encoding);
}

export async function composeMPMA(options: MPMAOptions): Promise<ApiResponse> {
  const {
    sourceAddress,
    assets,
    destinations,
    quantities,
    memos,
    memos_are_hex,
    sat_per_vbyte,
    max_fee,
    encoding,
  } = options;
  if (
    !Array.isArray(assets) ||
    !Array.isArray(destinations) ||
    !Array.isArray(quantities) ||
    assets.length !== destinations.length ||
    assets.length !== quantities.length
  ) {
    throw new Error('Assets, destinations, and quantities must be arrays of the same length.');
  }
  
  // Special handling for memos - need to use array notation in URL
  if (memos && memos.length > 0) {
    return composeTransactionWithArrays('mpma', {
      assets: assets.join(','),
      destinations: destinations.join(','),
      quantities: quantities.join(','),
      ...(max_fee !== undefined && { max_fee: max_fee.toString() }),
    }, {
      memos,
      memos_are_hex
    }, sourceAddress, sat_per_vbyte, encoding);
  }
  
  // No memos - use regular approach
  const paramsObj = {
    assets: assets.join(','),
    destinations: destinations.join(','),
    quantities: quantities.join(','),
    ...(max_fee !== undefined && { max_fee: max_fee.toString() }),
  };
  return composeTransaction('mpma', paramsObj, sourceAddress, sat_per_vbyte, encoding);
}

export async function composeOrder(options: OrderOptions): Promise<ApiResponse> {
  const {
    sourceAddress,
    give_asset,
    give_quantity,
    get_asset,
    get_quantity,
    expiration,
    fee_required = 0,
    sat_per_vbyte,
    max_fee,
    encoding,
  } = options;
  const paramsObj = {
    give_asset,
    give_quantity: give_quantity.toString(),
    get_asset,
    get_quantity: get_quantity.toString(),
    expiration: expiration.toString(),
    fee_required: fee_required.toString(),
    ...(max_fee !== undefined && { max_fee: max_fee.toString() }),
  };
  return composeTransaction('order', paramsObj, sourceAddress, sat_per_vbyte, encoding);
}

export async function composeSend(options: SendOptions): Promise<ApiResponse> {
  const { sourceAddress, destination, asset, quantity, memo, memo_is_hex, sat_per_vbyte, max_fee, encoding } = options;
  const paramsObj = {
    destination,
    asset,
    quantity: quantity.toString(),
    ...(memo !== undefined ? { memo } : {}),
    ...(memo_is_hex !== undefined ? { memo_is_hex: memo_is_hex.toString() } : {}),
    ...(max_fee !== undefined && { max_fee: max_fee.toString() }),
  };
  return composeTransaction('send', paramsObj, sourceAddress, sat_per_vbyte, encoding);
}

export async function composeSweep(options: SweepOptions): Promise<ApiResponse> {
  const {
    sourceAddress,
    destination,
    flags,
    memo = '',
    sat_per_vbyte,
    max_fee,
    encoding,
  } = options;
  const paramsObj = {
    destination,
    flags: flags.toString(),
    memo,
    ...(max_fee !== undefined && { max_fee: max_fee.toString() }),
  };
  return composeTransaction('sweep', paramsObj, sourceAddress, sat_per_vbyte, encoding);
}

export async function getSweepEstimateXcpFee(sourceAddress: string): Promise<number> {
  const base = await getApiBase();
  const apiUrl = `${base}/v2/addresses/${sourceAddress}/compose/sweep/estimatexcpfees`;
  const response = await apiClient.get<{ result: number }>(apiUrl);
  return response.data.result;
}

export async function composeFairminter(options: FairminterOptions): Promise<ApiResponse> {
  const {
    sourceAddress,
    asset,
    lot_price = 0,
    lot_size = 1,
    max_mint_per_tx = 0,
    hard_cap = 0,
    premint_quantity = 0,
    start_block = 0,
    end_block = 0,
    soft_cap = 0,
    soft_cap_deadline_block = 0,
    minted_asset_commission = 0.0,
    burn_payment = false,
    lock_description = false,
    lock_quantity = false,
    divisible = true,
    description = '',
    encoding = 'auto',
    sat_per_vbyte,
    max_fee,
    pubkeys,
    inscription,
    mime_type,
  } = options;
  const paramsObj = {
    asset,
    lot_price: lot_price.toString(),
    lot_size: lot_size.toString(),
    max_mint_per_tx: max_mint_per_tx.toString(),
    hard_cap: hard_cap.toString(),
    premint_quantity: premint_quantity.toString(),
    start_block: start_block.toString(),
    end_block: end_block.toString(),
    soft_cap: soft_cap.toString(),
    soft_cap_deadline_block: soft_cap_deadline_block.toString(),
    minted_asset_commission: minted_asset_commission.toString(),
    burn_payment: burn_payment.toString(),
    lock_description: lock_description.toString(),
    lock_quantity: lock_quantity.toString(),
    divisible: divisible ? 'true' : 'false',
    ...(description && { description }),
    ...(pubkeys && { pubkeys }),
    ...(inscription && { inscription }),
    ...(mime_type && { mime_type }),
    ...(max_fee !== undefined && { max_fee: max_fee.toString() }),
  };
  return composeTransaction('fairminter', paramsObj, sourceAddress, sat_per_vbyte, encoding);
}

export async function composeFairmint(options: FairmintOptions): Promise<ApiResponse> {
  const { sourceAddress, asset, quantity = 0, sat_per_vbyte, max_fee, encoding } = options;
  
  const paramsObj = {
    asset,
    quantity: quantity.toString(),
    ...(max_fee !== undefined && { max_fee: max_fee.toString() }),
  };
  
  return composeTransaction('fairmint', paramsObj, sourceAddress, sat_per_vbyte, encoding);
}

export async function composeAttach(options: AttachOptions): Promise<ApiResponse> {
  const {
    sourceAddress,
    asset,
    quantity,
    utxo_value,
    destination_vout,
    sat_per_vbyte,
    max_fee,
    encoding,
  } = options;
  const paramsObj = {
    asset,
    quantity: quantity.toString(),
    // Note: utxo_value is disabled after block 871900
    ...(utxo_value !== undefined ? { utxo_value: utxo_value.toString() } : {}),
    ...(destination_vout !== undefined ? { destination_vout: destination_vout.toString() } : {}),
    ...(max_fee !== undefined && { max_fee: max_fee.toString() }),
  };
  return composeTransaction('attach', paramsObj, sourceAddress, sat_per_vbyte, encoding);
}

export async function getAttachEstimateXcpFee(sourceAddress: string): Promise<number> {
  const base = await getApiBase();
  const apiUrl = `${base}/v2/addresses/${sourceAddress}/compose/attach/estimatexcpfees`;
  const response = await apiClient.get<{ result: number }>(apiUrl);
  return response.data.result;
}

export async function composeDetach(options: DetachOptions): Promise<ApiResponse> {
  const { sourceUtxo, destination, sat_per_vbyte, encoding } = options;
  const paramsObj = {
    ...(destination && { destination }),
  };
  return composeUtxoTransaction('detach', paramsObj, sourceUtxo, sat_per_vbyte, encoding);
}

export async function composeMove(options: MoveOptions): Promise<ApiResponse> {
  const { sourceUtxo, destination, sat_per_vbyte, encoding } = options;
  const paramsObj = {
    destination,
  };
  return composeUtxoTransaction('movetoutxo', paramsObj, sourceUtxo, sat_per_vbyte, encoding);
}
