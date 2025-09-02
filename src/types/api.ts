/**
 * API Response Type Definitions
 * 
 * This file contains comprehensive TypeScript interfaces for all external API responses
 * used throughout the application to ensure type safety and prevent runtime errors.
 */

// ==================== Bitcoin/Blockchain APIs ====================

/**
 * Mempool.space UTXO response
 */
export interface MempoolUTXO {
  txid: string;
  vout: number;
  status: {
    confirmed: boolean;
    block_height: number;
    block_hash: string;
    block_time: number;
  };
  value: number;
}

/**
 * XCP.io UTXO response for bare multisig
 */
export interface XcpUtxoResponse {
  data: XcpUtxo[];
}

export interface XcpUtxo {
  txid: string;
  vout: number;
  amount: string; // BTC amount as string
  scriptPubKeyHex: string;
  scriptPubKeyType?: string;
  required_signatures?: number;
}

/**
 * Bitcoin transaction response from Counterparty API
 */
export interface BitcoinTransactionResponse {
  result: BitcoinTransaction;
}

export interface BitcoinTransaction {
  hex: string;
  txid: string;
  hash: string;
  size: number;
  vsize: number;
  weight: number;
  version: number;
  locktime: number;
  vin: TransactionInput[];
  vout: TransactionOutput[];
  blockhash?: string;
  confirmations?: number;
  blocktime?: number;
  time?: number;
}

export interface TransactionInput {
  txid: string;
  vout: number;
  scriptSig: {
    asm: string;
    hex: string;
  };
  txinwitness?: string[];
  sequence: number;
}

export interface TransactionOutput {
  value: number;
  n: number;
  scriptPubKey: {
    asm: string;
    hex: string;
    type: string;
    address?: string;
    addresses?: string[];
  };
}

/**
 * Transaction broadcast response
 */
export interface BroadcastResponse {
  result?: string; // Transaction ID if successful
  error?: string;
  message?: string;
}

// ==================== Counterparty API ====================

/**
 * Generic Counterparty API response wrapper
 */
export interface CounterpartyResponse<T> {
  result: T;
  error?: string;
  id?: number;
  jsonrpc?: string;
}

/**
 * Counterparty balance response
 */
export interface CounterpartyBalance {
  address: string;
  asset: string;
  quantity: number;
  normalized_quantity: number;
  divisible: boolean;
}

/**
 * Counterparty asset info response
 */
export interface CounterpartyAsset {
  asset: string;
  asset_longname: string | null;
  description: string;
  divisible: boolean;
  locked: boolean;
  owner: string;
  issuer: string;
  supply: number;
  normalized_supply: number;
  listed: boolean;
  status: string;
}

/**
 * Compose transaction size estimation
 */
export interface SignedTxEstimatedSize {
  vsize: number;
  adjusted_vsize: number;
  sigops_count: number;
}

/**
 * Asset info in compose parameters
 */
export interface ComposeAssetInfo {
  asset_longname: string | null;
  description: string;
  issuer: string;
  divisible: boolean;
  locked: boolean;
  owner: string;
}

/**
 * Compose transaction parameters
 */
export interface ComposeParams {
  source: string;
  destination?: string;
  asset?: string;
  quantity?: number;
  memo?: string | null;
  memo_is_hex?: boolean;
  use_enhanced_send?: boolean;
  no_dispense?: boolean;
  skip_validation?: boolean;
  asset_info?: ComposeAssetInfo;
  quantity_normalized?: string;
  asset_dest_quant_list?: [string, string, string][];
  memos?: string[];
  [key: string]: any; // Allow additional params for different transaction types
}

/**
 * Compose transaction result
 */
export interface ComposeResult {
  rawtransaction: string;
  btc_in: number;
  btc_out: number;
  btc_change: number;
  btc_fee: number;
  data?: string;
  lock_scripts?: string[];
  inputs_values?: number[];
  signed_tx_estimated_size?: SignedTxEstimatedSize;
  psbt?: string;
  params: ComposeParams;
  name?: string;
}

/**
 * Counterparty transaction composition response
 */
export interface ComposeResponse {
  result: ComposeResult;
  error?: string;
}

/**
 * Counterparty order response
 */
export interface CounterpartyOrder {
  tx_index: number;
  tx_hash: string;
  block_index: number;
  source: string;
  give_asset: string;
  give_quantity: number;
  give_remaining: number;
  get_asset: string;
  get_quantity: number;
  get_remaining: number;
  expiration: number;
  expire_index: number;
  fee_provided: number;
  fee_provided_remaining: number;
  fee_required: number;
  fee_required_remaining: number;
  status: string;
  normalized_give_quantity: number;
  normalized_give_remaining: number;
  normalized_get_quantity: number;
  normalized_get_remaining: number;
  normalized_fee_provided: number;
  normalized_fee_provided_remaining: number;
  normalized_fee_required: number;
  normalized_fee_required_remaining: number;
}

/**
 * Counterparty dispenser response
 */
export interface CounterpartyDispenser {
  tx_index: number;
  tx_hash: string;
  block_index: number;
  source: string;
  asset: string;
  give_quantity: number;
  escrow_quantity: number;
  satoshirate: number;
  status: number;
  give_remaining: number;
  normalized_give_quantity: number;
  normalized_escrow_quantity: number;
  normalized_give_remaining: number;
}

/**
 * Counterparty send transaction
 */
export interface CounterpartySend {
  tx_index: number;
  tx_hash: string;
  block_index: number;
  source: string;
  destination: string;
  asset: string;
  quantity: number;
  normalized_quantity: number;
  status: string;
  memo?: string;
}

/**
 * Counterparty issuance transaction
 */
export interface CounterpartyIssuance {
  tx_index: number;
  tx_hash: string;
  block_index: number;
  asset: string;
  asset_longname: string | null;
  quantity: number;
  divisible: boolean;
  source: string;
  issuer: string;
  transfer: boolean;
  callable: boolean;
  call_date: number;
  call_price: number;
  description: string;
  fee_paid: number;
  locked: boolean;
  reset: boolean;
  normalized_quantity: number;
  normalized_fee_paid: number;
}

/**
 * Counterparty bet transaction
 */
export interface CounterpartyBet {
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
  normalized_wager_quantity: number;
  normalized_wager_remaining: number;
  normalized_counterwager_quantity: number;
  normalized_counterwager_remaining: number;
}

/**
 * Counterparty broadcast transaction
 */
export interface CounterpartyBroadcast {
  tx_index: number;
  tx_hash: string;
  block_index: number;
  source: string;
  timestamp: number;
  value: number;
  fee_fraction_int: number;
  text: string;
  locked: boolean;
  status: string;
}

/**
 * Counterparty dividend transaction
 */
export interface CounterpartyDividend {
  tx_index: number;
  tx_hash: string;
  block_index: number;
  source: string;
  asset: string;
  dividend_asset: string;
  quantity_per_unit: number;
  fee_paid: number;
  status: string;
  normalized_quantity_per_unit: number;
  normalized_fee_paid: number;
}

/**
 * Counterparty sweep transaction
 */
export interface CounterpartySweep {
  tx_index: number;
  tx_hash: string;
  block_index: number;
  source: string;
  destination: string;
  flags: number;
  status: string;
  memo?: string;
  fee_paid: number;
  normalized_fee_paid: number;
}

/**
 * Counterparty transaction info
 */
export interface CounterpartyTransaction {
  tx_index: number;
  tx_hash: string;
  block_index: number;
  block_hash: string;
  block_time: number;
  source: string;
  destination?: string;
  btc_amount: number;
  fee: number;
  data: string;
  supported: boolean;
}

/**
 * Counterparty mempool response
 */
export interface CounterpartyMempool {
  tx_hash: string;
  command: string;
  category: string;
  bindings: Record<string, any>;
  timestamp: number;
}

/**
 * Counterparty block info
 */
export interface CounterpartyBlock {
  block_index: number;
  block_hash: string;
  block_time: number;
  previous_block_hash: string;
  difficulty: number;
  ledger_hash: string;
  txlist_hash: string;
  messages_hash: string;
}

// ==================== Price/Fee APIs ====================

/**
 * Fee rate response from mempool.space
 */
export interface FeeRateResponse {
  fastestFee: number;
  halfHourFee: number;
  hourFee: number;
  economyFee: number;
  minimumFee: number;
}

/**
 * Bitcoin price response
 */
export interface PriceResponse {
  bitcoin?: {
    usd?: number;
    eur?: number;
    gbp?: number;
    cad?: number;
    chf?: number;
    aud?: number;
    jpy?: number;
  };
  [key: string]: any;
}

// ==================== Error Responses ====================

/**
 * Standard API error response
 */
export interface ApiError {
  error: string;
  message?: string;
  code?: number;
  details?: any;
}

/**
 * Axios error response structure
 */
export interface AxiosErrorResponse {
  data?: ApiError;
  status: number;
  statusText: string;
  headers: Record<string, string>;
}

// ==================== Helper Types ====================

/**
 * Paginated API response
 */
export interface PaginatedResponse<T> {
  result: T[];
  next_cursor?: number | string | null;
  result_count: number;
}

/**
 * API request configuration
 */
export interface ApiRequestConfig {
  timeout?: number;
  signal?: AbortSignal;
  headers?: Record<string, string>;
  params?: Record<string, any>;
}

/**
 * Type guard to check if response has error
 */
export function hasApiError<T>(response: CounterpartyResponse<T> | ApiError): response is ApiError {
  return 'error' in response && response.error !== undefined;
}

/**
 * Type guard for broadcast response
 */
export function isBroadcastSuccess(response: BroadcastResponse): response is { result: string } {
  return 'result' in response && typeof response.result === 'string';
}

/**
 * Type guard for compose response
 */
export function isComposeSuccess(response: ComposeResponse | ApiError): response is ComposeResponse {
  return 'result' in response && 'rawtransaction' in (response as ComposeResponse).result;
}