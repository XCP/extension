import { fetchDieselBalance } from '@/core/alkanes/api';
import {
  buildDieselMintScript,
  buildDieselTransferScript,
  DIESEL_RUNESTONE_MARGINAL_VBYTES,
  dieselUtxoMinimumSats,
  isSupportedDieselUtxoAddress,
} from '@/core/alkanes/diesel';
import { fetchInputsAlkanes } from '@/core/alkanes/inputAssets';
import { apiClient } from '@/core/api/client';
import { normalizeAddressForComparison } from '@/core/bitcoin/address';
import { parseRawTransactionLocally } from '@/core/bitcoin/localTransactionParse';
import { requireCounterpartyFeature } from '@/core/counterparty/capabilities';
import { checkInputPolicy } from '@/core/counterparty/inputPolicy';
import { getSourcePubkey } from '@/core/counterparty/sourcePubkey';
import { selectUtxosForTransaction } from '@/core/counterparty/utxoSelection';
import { CounterpartyApiError } from '@/core/errors';
import { multiply, roundUp, subtract, sum, toSafeInteger } from '@/core/numeric';
import { validateBitcoinAddress } from '@/core/validation/bitcoin';
import {
  getActiveSettings,
  LEGACY_MAX_ORDER_EXPIRATION,
  MAX_ORDER_EXPIRATION,
} from '@/core/settings';

/**
 * A composed transaction spent a UTXO the request never offered.
 *
 * Its own type so the UTXO fallback below cannot mistake it for the composer rejecting a selection
 * and retry — the last retry sends no `inputs_set` at all, which would answer a composer that
 * ignored the set by letting it choose freely.
 */
class UnofferedInputsError extends CounterpartyApiError {}

/** Safe dust value for every address type accepted by the send form. */
const DIESEL_RECIPIENT_SATS = 546;

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

/**
 * Attempt to select UTXOs from mempool.space for better reliability.
 * Falls back gracefully if selection fails, allowing the Counterparty API to handle it.
 *
 * @param sourceAddress - The address to select UTXOs from
 * @param allowUnconfirmed - Whether to include unconfirmed UTXOs
 * @returns The inputs_set string if successful, undefined otherwise
 */
async function trySelectUtxos(
  sourceAddress: string,
  allowUnconfirmed: boolean
): Promise<string | undefined> {
  try {
    const selection = await selectUtxosForTransaction(sourceAddress, { allowUnconfirmed });
    return selection.inputsSet;
  } catch (error) {
    // Falling back to server-selected inputs would bypass the separate Alkanes indexer entirely.
    const settings = getActiveSettings();
    if (settings.protectAlkanesUtxos || settings.enableDieselMinting) throw error;
    return undefined;
  }
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
  supply?: string;
  supply_normalized?: string;
}

export interface ComposeParams {
  source?: string;
  destination?: string;
  address?: string;
  dispenser?: string;
  asset: string;
  quantity: string | number;
  memo: string | null;
  memo_is_hex: boolean;
  use_enhanced_send: boolean;
  no_dispense: boolean;
  skip_validation: boolean;
  asset_info: ComposeAssetInfo;
  quantity_normalized: string;
  more_outputs?: string;
  lp_asset?: string;
}

export interface ComposeResult {
  rawtransaction: string;
  btc_in: number;
  btc_out: number;
  btc_change: number;
  btc_fee: number;
  xcp_fee?: number;
  data: string;
  lock_scripts: string[];
  inputs_values: number[];
  signed_tx_estimated_size: SignedTxEstimatedSize;
  psbt: string;
  /**
   * Present only for `encoding=taproot` composes. The ord envelope script carrying the message,
   * and the reveal transaction — already signed by the composer's ephemeral key — that spends the
   * commit output and publishes the content. `rawtransaction` is only the commit, so an
   * inscription is not complete until the reveal is broadcast too.
   */
  envelope_script?: string;
  signed_reveal_rawtransaction?: string;
  params: ComposeParams & {
    asset_dest_quant_list?: [string, string, string | number][];
    memos?: string[];
  };
  name: string;
  /** Present only when the final bytes were locally proved to contain the requested mint. */
  diesel_mint?: {
    utxo_vout: number;
    runestone_vout: number;
    utxo_sats: number;
    /** Exact added output vbytes for this allow-listed shape. */
    marginal_vbytes: number;
    /** Fee-rate-based estimate; the composer can round the whole transaction fee. */
    estimated_marginal_fee_sats: number;
    fee_rate_sat_vbyte: number;
    /** `change` means ordinary wallet change was reshaped into the DIESEL UTXO. */
    utxo_kind: 'change' | 'explicit';
    /** Previous DIESEL UTXO deliberately consumed and routed into this successor. */
    rolled_utxo?: string;
    /** Predicted position of this transaction in the wallet's unconfirmed dependency chain. */
    pending_chain_position?: number;
  };
  diesel_transfer?: {
    amount_base_units: string;
    input_utxos: string[];
    recipient_vout: number;
    remainder_vout: number;
    runestone_vout: number;
  };
}

export interface ApiResponse {
  result: ComposeResult;
}

// Base options shared across all transaction types
export interface BaseComposeOptions {
  sourceAddress: string;
  sat_per_vbyte: number;
  max_fee?: number;
  encoding?: 'auto' | 'opreturn' | 'multisig' | 'taproot';
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
  quantity: string | number;
  overburn?: boolean;
}

export interface CancelOptions extends BaseComposeOptions {
  offer_hash: string;
}

export interface DestroyOptions extends BaseComposeOptions {
  asset: string;
  quantity: string | number;
  tag?: string;
}

export interface DispenserOptions extends BaseComposeOptions {
  asset: string;
  give_quantity: string | number;
  escrow_quantity: string | number;
  mainchainrate: string | number;
  status?: string;
  open_address?: string;
  oracle_address?: string;
}

export interface DispenseOptions extends BaseComposeOptions {
  dispenser: string;
  quantity: string | number;
  pubkeys?: string;
}

export interface DividendOptions extends BaseComposeOptions {
  asset: string;
  dividend_asset: string;
  quantity_per_unit: string | number;
}

export interface IssuanceOptions extends BaseComposeOptions {
  asset: string;
  quantity: string | number;
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
  /** Per-send memos, one entry per send; empty string means no memo for that send. */
  memos?: string[];
  /** Hex flags for `memos`. Core applies a single flag to every memo, so these must agree. */
  memos_are_hex?: boolean[];
  /** Whole-send memo, used for every send when `memos` is not given; encoded once. */
  memo?: string;
  memo_is_hex?: boolean;
}

export interface OrderOptions extends BaseComposeOptions {
  give_asset: string;
  give_quantity: string | number;
  get_asset: string;
  get_quantity: string | number;
  expiration: number;
  fee_required?: number;
}

export interface SendOptions extends BaseComposeOptions {
  destination: string;
  asset: string;
  quantity: string | number;
  memo?: string;
  memo_is_hex?: boolean;
  no_dispense?: boolean;
  more_outputs?: string;
}

export interface SweepOptions extends BaseComposeOptions {
  destination: string;
  flags: number;
  memo?: string;
  more_outputs?: string;
}

export interface FairminterOptions extends BaseComposeOptions {
  asset: string;
  asset_parent?: string;
  lot_price?: number;
  lot_size?: string | number;
  max_mint_per_tx?: string | number;
  max_mint_per_address?: string | number;
  hard_cap?: string | number;
  premint_quantity?: string | number;
  start_block?: number;
  end_block?: number;
  soft_cap?: string | number;
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
  pool_quantity?: number;
  lp_asset?: string;
}

export interface FairmintOptions extends BaseComposeOptions {
  asset: string;
  quantity?: string | number;
}

export interface PoolDepositOptions extends BaseComposeOptions {
  asset_a: string;
  asset_b: string;
  quantity_a: number | string;
  quantity_b: number | string;
  min_lp_quantity?: number | string;
  lp_asset?: string;
}

export interface PoolWithdrawOptions extends BaseComposeOptions {
  asset_a?: string;
  asset_b?: string;
  quantity: number | string;
  min_quantity_a?: number | string;
  min_quantity_b?: number | string;
  lp_asset?: string;
}

export interface AttachOptions extends BaseComposeOptions {
  asset: string;
  quantity: string | number;
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
  const settings = getActiveSettings();
  return settings.counterpartyApiBase;
}

// ============================================================================
// UTXO Fallback Logic
// ============================================================================
//
// When composing transactions, we fetch UTXOs from mempool.space for better
// reliability. However, the Counterparty API may reject some UTXOs if:
// - The transaction was dropped from mempool (RBF, low fee, etc.)
// - Different Bitcoin nodes have different mempool views
// - The UTXO was spent between our fetch and the API call
//
// We handle this with a 3-attempt fallback strategy:
// 1. Try with all UTXOs from mempool.space
// 2. If "invalid UTXOs" error, remove those UTXOs and retry
// 3. If still failing, let Counterparty API select UTXOs itself

/**
 * Extract error message from error (handles Axios errors and CounterpartyApiError).
 */
function getApiErrorMessage(error: unknown): string | undefined {
  if (error instanceof CounterpartyApiError) {
    return error.message;
  }
  if (isApiErrorWithResponse(error)) {
    return error.response?.data?.error;
  }
  return undefined;
}

/**
 * Check if error message indicates a UTXO-related failure that we should retry.
 * Handles multiple error formats from the Counterparty API:
 * - "invalid UTXOs: txid:vout (transaction not found)"
 * - "UTXO not found for input 0: txid:vout"
 */
function isUtxoError(errorMessage: string | undefined): boolean {
  if (!errorMessage) return false;
  return (
    errorMessage.includes('invalid UTXOs') ||
    errorMessage.includes('UTXO not found') ||
    errorMessage.includes('transaction not found')
  );
}

/**
 * Parse UTXO references from error message.
 * Extracts any txid:vout patterns found in the message.
 */
function parseUtxosFromError(errorMessage: string): string[] {
  const utxoPattern = /([a-f0-9]{64}:\d+)/gi;
  return errorMessage.match(utxoPattern) || [];
}

/**
 * Remove specific UTXOs from inputs_set string.
 */
function removeUtxosFromInputsSet(inputsSet: string, utxosToRemove: string[]): string | undefined {
  const removeSet = new Set(utxosToRemove.map(u => u.toLowerCase()));
  const filtered = inputsSet.split(',').filter(utxo => !removeSet.has(utxo.toLowerCase()));
  return filtered.length > 0 ? filtered.join(',') : undefined;
}

/**
 * Wrap errors in CounterpartyApiError.
 */
function wrapComposeError(error: unknown, endpoint: string): CounterpartyApiError {
  if (error instanceof CounterpartyApiError) return error;

  const message = getApiErrorMessage(error);
  if (message) {
    return new CounterpartyApiError(message, endpoint, {
      cause: error instanceof Error ? error : undefined,
    });
  }

  return new CounterpartyApiError(
    error instanceof Error ? error.message : 'Transaction composition failed',
    endpoint,
    { cause: error instanceof Error ? error : undefined }
  );
}

/**
 * Options for making a compose request.
 */
interface ComposeRequestOptions {
  inputsSet: string | undefined;
  allowUnconfirmed: boolean;
}

interface ComposeControl {
  inputsSet: string;
  useAllInputsSet: boolean;
}

/**
 * Execute a compose request with automatic UTXO fallback.
 *
 * Strategy:
 * 1. Try with inputs_set from mempool.space (respects user's unconfirmed setting)
 * 2. If "invalid UTXOs" error, remove those UTXOs and retry
 * 3. If still failing, retry without inputs_set but force confirmed-only
 *    (avoids Counterparty selecting stale unconfirmed UTXOs from its mempool)
 */
async function executeWithUtxoFallback(
  makeRequest: (options: ComposeRequestOptions) => Promise<ApiResponse>,
  inputsSet: string | undefined,
  allowUnconfirmed: boolean,
  endpoint: string,
  requireOfferedInputs = false,
): Promise<ApiResponse> {
  // No inputs_set - just make the request with confirmed-only for safety
  if (!inputsSet) {
    if (requireOfferedInputs) {
      throw new CounterpartyApiError(
        'Alkanes protection requires wallet-selected inputs, but no safe input set was available.',
        endpoint,
      );
    }
    try {
      return await makeRequest({ inputsSet: undefined, allowUnconfirmed: false });
    } catch (error) {
      throw wrapComposeError(error, endpoint);
    }
  }

  // Attempt 1: Try with full inputs_set (respects user's unconfirmed setting)
  try {
    return await makeRequest({ inputsSet, allowUnconfirmed });
  } catch (error) {
    // Not a composer complaining about the selection, so retrying with a different one — or with
    // none — would only widen what it is allowed to spend.
    if (error instanceof UnofferedInputsError) throw error;

    const errorMessage = getApiErrorMessage(error);

    // If it's a UTXO-related error, try fallbacks
    if (isUtxoError(errorMessage)) {
      const badUtxos = parseUtxosFromError(errorMessage || '');
      const filteredInputsSet = removeUtxosFromInputsSet(inputsSet, badUtxos);

      // Attempt 2: Try with filtered inputs_set (still respects user's setting)
      if (filteredInputsSet) {
        try {
          return await makeRequest({ inputsSet: filteredInputsSet, allowUnconfirmed });
        } catch {
          // Fall through to attempt 3
        }
      }

      // Attempt 3: Let Counterparty API select, but force confirmed-only. This is never allowed
      // while Alkanes protection is active because Counterparty cannot identify those UTXOs.
      // This avoids issues where Counterparty's mempool has stale unconfirmed UTXOs
      if (requireOfferedInputs) throw wrapComposeError(error, endpoint);
      try {
        return await makeRequest({ inputsSet: undefined, allowUnconfirmed: false });
      } catch (finalError) {
        throw wrapComposeError(finalError, endpoint);
      }
    }

    // Not a UTXO error - throw immediately
    throw wrapComposeError(error, endpoint);
  }
}

// ============================================================================
// Compose Functions
// ============================================================================

/**
 * Compose a transaction via the Counterparty API.
 */
export async function composeTransaction<T extends Record<string, unknown>>(
  endpoint: string,
  paramsObj: T,
  sourceAddress: string,
  sat_per_vbyte: number,
  encoding?: string,
  control?: ComposeControl,
): Promise<ApiResponse> {
  const base = await getApiBase();
  const apiUrl = `${base}/v2/addresses/${sourceAddress}/compose/${endpoint}`;
  const settings = getActiveSettings();
  // Sent on every compose, read by core only when the message overflows an OP_RETURN and falls
  // back to bare multisig — where it becomes each data output's recovery key. Without it, core
  // scans the address's spends for a key, and a never-spent address has revealed none: every
  // long-data compose from a fresh wallet failed on "Pubkey not found". Harmless otherwise, and
  // it also pins the recovery key to a value the wallet chose, which is what lets verification
  // check it (`transactionSafety.ts`) instead of trusting whatever key the composer embedded.
  const multisigPubkey = getSourcePubkey(sourceAddress);

  const makeRequest = async ({ inputsSet, allowUnconfirmed }: ComposeRequestOptions): Promise<ApiResponse> => {
    const params = new URLSearchParams(toStringParams({
      ...paramsObj,
      sat_per_vbyte: sat_per_vbyte.toString(),
      exclude_utxos_with_balances: 'true',
      allow_unconfirmed_inputs: allowUnconfirmed.toString(),
      disable_utxo_locks: 'true',
      verbose: 'true',
      ...(encoding && { encoding }),
      ...(inputsSet && { inputs_set: inputsSet }),
      ...(control?.useAllInputsSet && { use_all_inputs_set: 'true' }),
      ...(multisigPubkey && { multisig_pubkey: multisigPubkey }),
    }));

    const response = await apiClient.get<ApiResponse | { error: string }>(
      `${apiUrl}?${params.toString()}`,
      { headers: { 'Content-Type': 'application/json' } }
    );

    if ('error' in response.data) {
      throw new CounterpartyApiError(response.data.error, endpoint, {});
    }

    const composed = response.data as ApiResponse;
    // Checked here, where the set actually sent is in scope: the fallbacks below send different
    // ones, and the last sends none at all.
    const inputCheck = checkInputPolicy({
      rawTransaction: composed.result?.rawtransaction ?? '',
      offeredInputs: inputsSet,
    });
    if (!inputCheck.ok) {
      throw new UnofferedInputsError(inputCheck.error ?? 'Unoffered inputs', endpoint);
    }
    return composed;
  };

  const inputsSet = control?.inputsSet
    ?? await trySelectUtxos(sourceAddress, settings.allowUnconfirmedTxs);
  if (control) {
    try {
      return await makeRequest({ inputsSet, allowUnconfirmed: settings.allowUnconfirmedTxs });
    } catch (error) {
      throw wrapComposeError(error, endpoint);
    }
  }
  return executeWithUtxoFallback(
    makeRequest,
    inputsSet,
    settings.allowUnconfirmedTxs,
    endpoint,
    settings.protectAlkanesUtxos || settings.enableDieselMinting,
  );
}

/**
 * Compose a transaction with array parameters (e.g., MPMA sends).
 */
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
  const settings = getActiveSettings();
  // Same as composeTransaction: the recovery key for multisig-encoded data, which MPMA — this
  // path's caller — produces on almost every send.
  const multisigPubkey = getSourcePubkey(sourceAddress);

  const makeRequest = async ({ inputsSet, allowUnconfirmed }: ComposeRequestOptions): Promise<ApiResponse> => {
    const params = new URLSearchParams(toStringParams({
      ...paramsObj,
      sat_per_vbyte: sat_per_vbyte.toString(),
      exclude_utxos_with_balances: 'true',
      allow_unconfirmed_inputs: allowUnconfirmed.toString(),
      disable_utxo_locks: 'true',
      verbose: 'true',
      ...(encoding && { encoding }),
      ...(inputsSet && { inputs_set: inputsSet }),
      ...(multisigPubkey && { multisig_pubkey: multisigPubkey }),
    }));

    // Array params must be repeated plain keys: core's `query_params()` builds lists from
    // repeated keys and treats a PHP-style `memos[]` as a different, ignored parameter.
    let url = `${apiUrl}?${params.toString()}`;
    for (const [key, values] of Object.entries(arrayParams)) {
      if (Array.isArray(values)) {
        for (const value of values) {
          url += `&${key}=${encodeURIComponent(String(value ?? ''))}`;
        }
      }
    }

    const response = await apiClient.get<ApiResponse | { error: string }>(url, {
      headers: { 'Content-Type': 'application/json' },
    });

    if ('error' in response.data) {
      throw new CounterpartyApiError(response.data.error, endpoint, {});
    }

    const composed = response.data as ApiResponse;
    // Checked here, where the set actually sent is in scope: the fallbacks below send different
    // ones, and the last sends none at all.
    const inputCheck = checkInputPolicy({
      rawTransaction: composed.result?.rawtransaction ?? '',
      offeredInputs: inputsSet,
    });
    if (!inputCheck.ok) {
      throw new UnofferedInputsError(inputCheck.error ?? 'Unoffered inputs', endpoint);
    }
    return composed;
  };

  const inputsSet = await trySelectUtxos(sourceAddress, settings.allowUnconfirmedTxs);
  return executeWithUtxoFallback(
    makeRequest,
    inputsSet,
    settings.allowUnconfirmedTxs,
    endpoint,
    settings.protectAlkanesUtxos || settings.enableDieselMinting,
  );
}

/**
 * Compose a UTXO-based transaction (detach, move).
 * These don't use inputs_set since the source UTXO is specified directly.
 */
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
  const settings = getActiveSettings();

  if (settings.protectAlkanesUtxos || settings.enableDieselMinting) {
    const match = /^([0-9a-f]{64}):(\d+)$/i.exec(sourceUtxo);
    if (!match) throw new CounterpartyApiError('Invalid source UTXO', endpoint);
    const status = await fetchInputsAlkanes([{
      index: 0,
      txid: match[1]!,
      vout: Number(match[2]),
    }], [0]);
    if (status.length > 0) {
      const unknown = status.some(entry => entry.lookupFailed);
      throw new CounterpartyApiError(
        unknown
          ? 'The Alkanes status of the source UTXO could not be verified.'
          : 'The source UTXO carries Alkanes and is protected from this operation.',
        endpoint,
      );
    }
  }

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
    text, value, fee_fraction, timestamp,
    ...(inscription && { inscription }),
    ...(mime_type && { mime_type }),
    ...(max_fee !== undefined && { max_fee: max_fee.toString() }),
  };
  return composeTransaction('broadcast', paramsObj, sourceAddress, sat_per_vbyte, encoding);
}

export async function composeBTCPay(options: BTCPayOptions): Promise<ApiResponse> {
  const {
    sourceAddress,
    order_match_id,
    sat_per_vbyte,
    max_fee,
    encoding,
  } = options;
  const paramsObj = {
    order_match_id,
    ...(max_fee !== undefined && { max_fee: max_fee.toString() }),
  };
  return composeTransaction('btcpay', paramsObj, sourceAddress, sat_per_vbyte, encoding);
}

export async function composeBurn(options: BurnOptions): Promise<ApiResponse> {
  const {
    sourceAddress,
    quantity,
    overburn = false,
    sat_per_vbyte,
    max_fee,
    encoding,
  } = options;
  const paramsObj = {
    quantity: quantity.toString(),
    overburn: overburn.toString(),
    ...(max_fee !== undefined && { max_fee: max_fee.toString() }),
  };
  return composeTransaction('burn', paramsObj, sourceAddress, sat_per_vbyte, encoding);
}

export async function composeCancel(options: CancelOptions): Promise<ApiResponse> {
  const {
    sourceAddress,
    offer_hash,
    sat_per_vbyte,
    max_fee,
    encoding,
  } = options;
  const paramsObj = {
    offer_hash: offer_hash.trim(),
    ...(max_fee !== undefined && { max_fee: max_fee.toString() }),
  };
  return composeTransaction('cancel', paramsObj, sourceAddress, sat_per_vbyte, encoding);
}

export async function composeDestroy(options: DestroyOptions): Promise<ApiResponse> {
  const {
    sourceAddress,
    asset,
    quantity,
    tag,
    sat_per_vbyte,
    max_fee,
    encoding,
  } = options;
  const paramsObj = {
    asset,
    quantity: quantity.toString(),
    tag: tag || '',
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
    // When closing a dispenser (status != 0), these values may be undefined - default to 0
    give_quantity: (give_quantity ?? 0).toString(),
    escrow_quantity: (escrow_quantity ?? 0).toString(),
    mainchainrate: (mainchainrate ?? 0).toString(),
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
  // Boolean values are normalized upstream - convert to API string format
  // Always include divisible to avoid API defaulting to true when we want false
  const paramsObj = {
    asset,
    quantity: quantity.toString(),
    divisible: divisible ? 'true' : 'false',
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
    memo,
    memo_is_hex,
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

  if (memos && memos.some((memo) => memo !== '')) {
    // Core applies one `memos_are_hex` flag to every memo in the list, so a mix of hex and text
    // memos cannot be expressed over the API and must be rejected before compose.
    const hexFlags = new Set((memos_are_hex ?? []).filter((_, i) => memos[i] !== ''));
    if (hexFlags.size > 1) {
      throw new Error(
        'MPMA memos must be all hex or all text: the API applies a single memos_are_hex flag to every memo.'
      );
    }
    // Core requires exactly one memos entry per send; empty entries mean "no memo for this send".
    if (memos.length !== assets.length) {
      throw new Error('The number of memos must equal the number of sends.');
    }
    return composeTransactionWithArrays('mpma', {
      assets: assets.join(','),
      destinations: destinations.join(','),
      quantities: quantities.join(','),
      memos_are_hex: (hexFlags.values().next().value ?? false).toString(),
      ...(max_fee !== undefined && { max_fee: max_fee.toString() }),
    }, { memos }, sourceAddress, sat_per_vbyte, encoding);
  }

  const paramsObj = {
    assets: assets.join(','),
    destinations: destinations.join(','),
    quantities: quantities.join(','),
    ...(memo && { memo, memo_is_hex: (memo_is_hex ?? false).toString() }),
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
  if (expiration < 0 || expiration > MAX_ORDER_EXPIRATION) {
    throw new Error(`Order expiration must be between 0 and ${MAX_ORDER_EXPIRATION} blocks.`);
  }
  // The v11.1 indefinite_orders gate covers both never-expiring orders and
  // finite expirations above the old 8064-block policy cap.
  if (expiration === 0 || expiration > LEGACY_MAX_ORDER_EXPIRATION) {
    await requireCounterpartyFeature('indefiniteOrders');
  }

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

function ownedStandardOutputVbytes(
  output: NonNullable<ReturnType<typeof parseRawTransactionLocally>>['outputs'][number] | undefined,
  sourceAddress: string,
): number | undefined {
  if (
    !output?.script
    || !output.address
    || normalizeAddressForComparison(output.address) !== normalizeAddressForComparison(sourceAddress)
  ) return undefined;

  const script = output.script.toLowerCase();
  const isP2pkh = /^76a914[0-9a-f]{40}88ac$/.test(script);
  const isP2sh = /^a914[0-9a-f]{40}87$/.test(script);
  const isP2wpkh = /^0014[0-9a-f]{40}$/.test(script);
  const isP2tr = /^5120[0-9a-f]{64}$/.test(script);
  if (!isP2pkh && !isP2sh && !isP2wpkh && !isP2tr) return undefined;
  // An output serializes as 8 value bytes + one compact-size byte + its script bytes. Every
  // allowed script is below the 253-byte compact-size boundary.
  return 9 + script.length / 2;
}

function conservativeWalletInputVbytes(address: string): number {
  const format = validateBitcoinAddress(address).addressFormat;
  if (format === 'P2PKH') return 149;
  if (format === 'P2SH') return 92;
  if (format === 'P2TR') return 58;
  return 69;
}

function outputsMatch(
  left: NonNullable<ReturnType<typeof parseRawTransactionLocally>>['outputs'][number] | undefined,
  right: NonNullable<ReturnType<typeof parseRawTransactionLocally>>['outputs'][number] | undefined,
): boolean {
  if (!left || !right || left.value !== right.value || left.type !== right.type) return false;
  if (left.opReturnData || right.opReturnData) {
    return left.opReturnData?.toLowerCase() === right.opReturnData?.toLowerCase();
  }
  return left.script?.toLowerCase() === right.script?.toLowerCase();
}

function estimateDieselMarginalFee(
  marginalVbytes: number,
  feeRate: number,
  endpoint = 'send',
): number {
  const estimate = toSafeInteger(roundUp(multiply(marginalVbytes, feeRate)).toFixed(0));
  if (estimate === undefined) {
    throw new CounterpartyApiError('Invalid DIESEL marginal fee estimate.', endpoint);
  }
  return estimate;
}

function annotateDieselMint(
  response: ApiResponse,
  moreOutputs: string,
  dieselUtxoSats: number,
  marginalVbytes: number,
  feeRate: number,
  utxoKind: 'change' | 'explicit',
  endpoint: string,
  dieselUtxoVout: number,
  runestoneVout: number,
  rolledUtxo?: string,
  pendingChainPosition?: number,
): ApiResponse {
  response.result.params.more_outputs = moreOutputs;
  response.result.diesel_mint = {
    utxo_vout: dieselUtxoVout,
    runestone_vout: runestoneVout,
    utxo_sats: dieselUtxoSats,
    marginal_vbytes: marginalVbytes,
    estimated_marginal_fee_sats: estimateDieselMarginalFee(marginalVbytes, feeRate, endpoint),
    fee_rate_sat_vbyte: feeRate,
    utxo_kind: utxoKind,
    ...(rolledUtxo ? { rolled_utxo: rolledUtxo } : {}),
    ...(pendingChainPosition ? { pending_chain_position: pendingChainPosition } : {}),
  };
  return response;
}

/**
 * Add a DIESEL mint to a compose shape whose host outputs precede `more_outputs` and whose final
 * output is ordinary wallet change. Both sends and attaches satisfy this contract, but at
 * different indices: send `[host, DIESEL UTXO, runestone, change]`; attach
 * `[attachment, host data, DIESEL UTXO, runestone, change]`.
 */
async function composeWithDieselMint(
  endpoint: 'send' | 'attach',
  paramsObj: Record<string, unknown>,
  sourceAddress: string,
  satPerVbyte: number,
  dieselUtxoVout: number,
  precedingMoreOutputs?: string,
): Promise<ApiResponse> {
  const settings = getActiveSettings();
  const minimumDieselUtxoSats = dieselUtxoMinimumSats(sourceAddress);
  if (minimumDieselUtxoSats === undefined) {
    throw new CounterpartyApiError('Unsupported DIESEL UTXO address.', endpoint);
  }
  const runestoneVout = dieselUtxoVout + 1;
  const changeVout = runestoneVout + 1;
  const dieselScript = buildDieselMintScript(dieselUtxoVout);
  const dieselOutputPair = `${minimumDieselUtxoSats}:${sourceAddress},0:${dieselScript}`;
  const dieselMoreOutputs = precedingMoreOutputs
    ? `${precedingMoreOutputs},${dieselOutputPair}`
    : dieselOutputPair;
  const firstParams = { ...paramsObj, more_outputs: dieselMoreOutputs };

  // The optimization must know the value of every input independently of the compose response.
  // Offer a locally selected, asset-filtered set, then derive the exact subset core chose from the
  // first transaction's bytes. The second pass is forced to use that subset in full.
  const selection = await selectUtxosForTransaction(sourceAddress, {
    allowUnconfirmed: settings.allowUnconfirmedTxs,
    includeDieselUtxos: true,
  });
  let rolledUtxo = selection.dieselUtxos?.[0];
  if (selection.pendingDieselChainAtLimit) {
    throw new CounterpartyApiError(
      `DIESEL chain has ${selection.pendingDieselChainAtLimit.chainDepth} unconfirmed `
        + 'transactions. Wait for its tip to confirm before continuing.',
      endpoint,
    );
  }
  let offeredUtxos = rolledUtxo ? [rolledUtxo] : selection.utxos;
  let response: ApiResponse;
  try {
    response = await composeTransaction(
      endpoint,
      firstParams,
      sourceAddress,
      satPerVbyte,
      'opreturn',
      {
        inputsSet: offeredUtxos.map(({ txid, vout }) => `${txid}:${vout}`).join(','),
        useAllInputsSet: !!rolledUtxo,
      },
    );
  } catch (dieselUtxoError) {
    // A DIESEL UTXO with enough BTC replaces the ordinary funding input at no input-vbyte penalty.
    // Never add an underfunded DIESEL UTXO beside clean inputs merely to consolidate: that
    // would spend ~68 vB to save a future token transfer. Keep it protected and mint a new shard.
    if (!rolledUtxo || selection.utxos.length === 0) throw dieselUtxoError;
    rolledUtxo = undefined;
    offeredUtxos = selection.utxos;
    response = await composeTransaction(
      endpoint,
      firstParams,
      sourceAddress,
      satPerVbyte,
      'opreturn',
      { inputsSet: selection.inputsSet, useAllInputsSet: false },
    );
  }

  const parsed = parseRawTransactionLocally(response.result.rawtransaction);
  const dieselUtxoOutput = parsed?.outputs[dieselUtxoVout];
  const runestone = parsed?.outputs[runestoneVout];
  const walletOutputVbytes = ownedStandardOutputVbytes(dieselUtxoOutput, sourceAddress);
  if (
    !parsed
    || dieselUtxoOutput?.value !== minimumDieselUtxoSats
    || walletOutputVbytes === undefined
    || runestone?.value !== 0
    || runestone.opReturnData?.toLowerCase() !== dieselScript
  ) {
    throw new CounterpartyApiError(
      'Counterparty compose did not preserve the required DIESEL UTXO and runestone outputs.',
      endpoint,
    );
  }

  // Removing the redundant final wallet change leaves the already-required wallet-return output
  // as the DIESEL UTXO. Any unfamiliar topology retains the proven explicit-output form.
  const change = parsed.outputs[changeVout];
  const firstSignedVsize = response.result.signed_tx_estimated_size.vsize;
  if (
    parsed.outputs.length !== changeVout + 1
    || ownedStandardOutputVbytes(change, sourceAddress) !== walletOutputVbytes
    || !Number.isSafeInteger(firstSignedVsize)
    || firstSignedVsize <= walletOutputVbytes
  ) {
    return annotateDieselMint(
      response,
      dieselMoreOutputs,
      minimumDieselUtxoSats,
      walletOutputVbytes + DIESEL_RUNESTONE_MARGINAL_VBYTES,
      satPerVbyte,
      'explicit',
      endpoint,
      dieselUtxoVout,
      runestoneVout,
      rolledUtxo ? `${rolledUtxo.txid}:${rolledUtxo.vout}` : undefined,
      rolledUtxo?.pendingChainDepth ? rolledUtxo.pendingChainDepth + 1 : undefined,
    );
  }

  const selectedByOutpoint = new Map(
    offeredUtxos.map((utxo) => [`${utxo.txid.toLowerCase()}:${utxo.vout}`, utxo.value]),
  );
  const actualInputs = parsed.inputs.map((input) => `${input.txid.toLowerCase()}:${input.vout}`);
  const actualInputValues = actualInputs.map((outpoint) => selectedByOutpoint.get(outpoint));
  if (actualInputValues.some((value) => value === undefined)) {
    throw new CounterpartyApiError(
      'Counterparty compose used an input whose value was not independently selected.',
      endpoint,
    );
  }

  const optimizedVsize = toSafeInteger(
    subtract(firstSignedVsize, walletOutputVbytes).toFixed(0),
  );
  const exactFee = optimizedVsize === undefined
    ? undefined
    : estimateDieselMarginalFee(optimizedVsize, satPerVbyte, endpoint);
  const trustedInputTotal = sum(actualInputValues as number[]);
  const otherOutputTotal = sum(parsed.outputs
    .filter((output) => ![dieselUtxoVout, runestoneVout, changeVout].includes(output.index))
    .map((output) => output.value));
  const optimizedDieselUtxoSats = exactFee === undefined
    ? undefined
    : toSafeInteger(subtract(subtract(trustedInputTotal, otherOutputTotal), exactFee).toFixed(0));
  if (
    optimizedVsize === undefined
    || exactFee === undefined
    || optimizedDieselUtxoSats === undefined
    || optimizedDieselUtxoSats < minimumDieselUtxoSats
  ) {
    return annotateDieselMint(
      response,
      dieselMoreOutputs,
      minimumDieselUtxoSats,
      walletOutputVbytes + DIESEL_RUNESTONE_MARGINAL_VBYTES,
      satPerVbyte,
      'explicit',
      endpoint,
      dieselUtxoVout,
      runestoneVout,
      rolledUtxo ? `${rolledUtxo.txid}:${rolledUtxo.vout}` : undefined,
      rolledUtxo?.pendingChainDepth ? rolledUtxo.pendingChainDepth + 1 : undefined,
    );
  }

  const optimizedOutputPair = `${optimizedDieselUtxoSats}:${sourceAddress},0:${dieselScript}`;
  const optimizedMoreOutputs = precedingMoreOutputs
    ? `${precedingMoreOutputs},${optimizedOutputPair}`
    : optimizedOutputPair;
  const optimized = await composeTransaction(
    endpoint,
    { ...paramsObj, more_outputs: optimizedMoreOutputs, exact_fee: exactFee.toString() },
    sourceAddress,
    satPerVbyte,
    'opreturn',
    { inputsSet: actualInputs.join(','), useAllInputsSet: true },
  );
  const optimizedParsed = parseRawTransactionLocally(optimized.result.rawtransaction);
  const optimizedInputs = optimizedParsed?.inputs
    .map((input) => `${input.txid.toLowerCase()}:${input.vout}`);
  const actualInputSet = new Set(actualInputs);
  const optimizedInputSet = new Set(optimizedInputs ?? []);
  const optimizedOutputTotal = optimizedParsed
    ? sum(optimizedParsed.outputs.map(({ value }) => value))
    : null;
  const independentlyDerivedFee = optimizedOutputTotal !== null
    ? toSafeInteger(subtract(trustedInputTotal, optimizedOutputTotal).toFixed(0))
    : undefined;
  const hostOutputsMatch = Array.from({ length: dieselUtxoVout }, (_, index) => index)
    .every((index) => outputsMatch(parsed.outputs[index], optimizedParsed?.outputs[index]));

  if (
    !optimizedParsed
    || optimizedParsed.outputs.length !== runestoneVout + 1
    || !hostOutputsMatch
    || optimizedParsed.outputs[dieselUtxoVout]?.value !== optimizedDieselUtxoSats
    || ownedStandardOutputVbytes(optimizedParsed.outputs[dieselUtxoVout], sourceAddress)
      !== walletOutputVbytes
    || optimizedParsed.outputs[runestoneVout]?.value !== 0
    || optimizedParsed.outputs[runestoneVout]?.opReturnData?.toLowerCase() !== dieselScript
    || optimizedInputs?.length !== actualInputs.length
    || actualInputSet.size !== actualInputs.length
    || optimizedInputSet.size !== optimizedInputs.length
    || actualInputs.some((outpoint) => !optimizedInputSet.has(outpoint))
    || independentlyDerivedFee !== exactFee
    || optimized.result.btc_change !== 0
    || optimized.result.signed_tx_estimated_size.vsize !== optimizedVsize
  ) {
    throw new CounterpartyApiError(
      'Counterparty compose did not preserve the proven optimized DIESEL transaction shape.',
      endpoint,
    );
  }

  return annotateDieselMint(
    optimized,
    optimizedMoreOutputs,
    optimizedDieselUtxoSats,
    DIESEL_RUNESTONE_MARGINAL_VBYTES,
    satPerVbyte,
    'change',
    endpoint,
    dieselUtxoVout,
    runestoneVout,
    rolledUtxo ? `${rolledUtxo.txid}:${rolledUtxo.vout}` : undefined,
    rolledUtxo?.pendingChainDepth ? rolledUtxo.pendingChainDepth + 1 : undefined,
  );
}

export async function composeSend(options: SendOptions): Promise<ApiResponse> {
  const {
    sourceAddress,
    destination,
    asset,
    quantity,
    memo,
    memo_is_hex,
    no_dispense,
    more_outputs,
    sat_per_vbyte,
    max_fee,
    encoding,
  } = options;
  const settings = getActiveSettings();
  // In BTC and enhanced Counterparty sends Core emits exactly one destination/data output before
  // `more_outputs`. Caller-supplied outputs remain byte-identical and precede the wallet-owned
  // DIESEL output, so its pointer is derived from their count instead of guessed.
  const attachDieselMint = settings.enableDieselMinting
    && isSupportedDieselUtxoAddress(sourceAddress)
    && (encoding === undefined || encoding === 'auto' || encoding === 'opreturn');
  const paramsObj = {
    destination,
    asset,
    quantity: quantity.toString(),
    ...(memo !== undefined ? { memo } : {}),
    ...(memo_is_hex !== undefined ? { memo_is_hex: memo_is_hex.toString() } : {}),
    ...(no_dispense !== undefined ? { no_dispense: no_dispense.toString() } : {}),
    ...(more_outputs ? { more_outputs } : {}),
    ...(max_fee !== undefined && { max_fee: max_fee.toString() }),
  };
  if (!attachDieselMint) {
    return composeTransaction('send', paramsObj, sourceAddress, sat_per_vbyte, encoding);
  }

  const precedingOutputCount = more_outputs
    ? more_outputs.split(',').filter(Boolean).length
    : 0;
  return composeWithDieselMint(
    'send',
    paramsObj,
    sourceAddress,
    sat_per_vbyte,
    1 + precedingOutputCount,
    more_outputs,
  );
}

export interface DieselSendOptions extends BaseComposeOptions {
  destination: string;
  /** Exact DIESEL base units, not a display-unit decimal. */
  amountBaseUnits: string;
}

/** Build and prove an edict spend from selected DIESEL-bearing inputs. */
export async function composeDieselSend(options: DieselSendOptions): Promise<ApiResponse> {
  const { sourceAddress, destination, amountBaseUnits, sat_per_vbyte, max_fee } = options;
  if (!isSupportedDieselUtxoAddress(sourceAddress)) {
    throw new Error('DIESEL sends require a supported wallet source address.');
  }
  const minimumDieselUtxoSats = dieselUtxoMinimumSats(sourceAddress)!;
  if (!/^\d+$/.test(amountBaseUnits) || BigInt(amountBaseUnits) <= 0n) {
    throw new Error('DIESEL amount must be positive.');
  }
  const requested = BigInt(amountBaseUnits);
  const diesel = await fetchDieselBalance(sourceAddress);
  if (requested > BigInt(diesel.baseUnits)) throw new Error('Insufficient DIESEL balance.');

  // Largest-first minimizes witness inputs. One of core's 20 input-set slots is reserved for a
  // normal BTC UTXO that funds dust and fees; token-bearing inputs are never offered to ordinary flows.
  const available = [...diesel.utxos].sort((a, b) => {
    const value = (utxo: typeof a) => utxo.balances
      .filter((item) => item.id === '2:0')
      .reduce((sum, item) => sum + BigInt(item.value), 0n);
    const left = value(a);
    const right = value(b);
    return left === right ? 0 : left > right ? -1 : 1;
  });
  const dieselUtxos: typeof available = [];
  let covered = 0n;
  for (const utxo of available) {
    if (dieselUtxos.length === 19 || covered >= requested) break;
    dieselUtxos.push(utxo);
    covered += utxo.balances
      .filter((item) => item.id === '2:0')
      .reduce((sum, item) => sum + BigInt(item.value), 0n);
  }
  if (covered < requested) {
    throw new Error('This send needs more than 19 DIESEL UTXOs; consolidate them first.');
  }

  const funding = await selectUtxosForTransaction(sourceAddress, {
    allowUnconfirmed: getActiveSettings().allowUnconfirmedTxs,
    maxUtxos: 20 - dieselUtxos.length,
  });
  const dieselInputs = dieselUtxos.map(({ txid, vout }) => `${txid}:${vout}`);
  const dieselInputSats = dieselUtxos.reduce((sum, utxo) => sum + (utxo.value ?? 0), 0);
  const inputVbytes = conservativeWalletInputVbytes(sourceAddress);
  const selectedFunding: typeof funding.utxos = [];
  let fundingSats = 0;
  for (const utxo of funding.utxos) {
    selectedFunding.push(utxo);
    fundingSats += utxo.value;
    // Conservative budget: four outputs plus overhead and the source format's worst-case input
    // size per DIESEL/funding coin. Core computes the exact fee; this only chooses enough coins.
    const estimatedVsize = 160 + inputVbytes * (dieselUtxos.length + selectedFunding.length);
    const needed = DIESEL_RECIPIENT_SATS + minimumDieselUtxoSats
      + Math.ceil(estimatedVsize * sat_per_vbyte);
    if (dieselInputSats + fundingSats >= needed) break;
  }
  const estimatedVsize = 160 + inputVbytes * (dieselUtxos.length + selectedFunding.length);
  if (dieselInputSats + fundingSats < DIESEL_RECIPIENT_SATS + minimumDieselUtxoSats
    + Math.ceil(estimatedVsize * sat_per_vbyte)) {
    throw new Error('Insufficient clean BTC to fund the DIESEL send fee.');
  }
  const fundingInputs = selectedFunding.map(({ txid, vout }) => `${txid}:${vout}`);
  const inputsSet = [...dieselInputs, ...fundingInputs].join(',');
  const transferScript = buildDieselTransferScript(requested, 0, 1);
  const response = await composeTransaction('send', {
    destination,
    asset: 'BTC',
    quantity: DIESEL_RECIPIENT_SATS.toString(),
    no_dispense: 'true',
    more_outputs: `${minimumDieselUtxoSats}:${sourceAddress},0:${transferScript}`,
    ...(max_fee !== undefined && { max_fee: max_fee.toString() }),
  }, sourceAddress, sat_per_vbyte, 'opreturn', { inputsSet, useAllInputsSet: true });

  const parsed = parseRawTransactionLocally(response.result.rawtransaction);
  const actualInputs = new Set(parsed?.inputs.map(({ txid, vout }) => `${txid}:${vout}`));
  const recipient = parsed?.outputs[0];
  const remainder = parsed?.outputs[1];
  const runestone = parsed?.outputs[2];
  if (
    !parsed
    || dieselInputs.some((input) => !actualInputs.has(input))
    || recipient?.value !== DIESEL_RECIPIENT_SATS
    || !recipient.address
    || normalizeAddressForComparison(recipient.address) !== normalizeAddressForComparison(destination)
    || remainder?.value !== minimumDieselUtxoSats
    || !remainder.address
    || normalizeAddressForComparison(remainder.address) !== normalizeAddressForComparison(sourceAddress)
    || runestone?.value !== 0
    || runestone.opReturnData?.toLowerCase() !== transferScript
  ) {
    throw new CounterpartyApiError(
      'Counterparty compose did not preserve the required DIESEL transfer layout.',
      'send',
    );
  }
  response.result.diesel_transfer = {
    amount_base_units: amountBaseUnits,
    input_utxos: dieselInputs,
    recipient_vout: 0,
    remainder_vout: 1,
    runestone_vout: 2,
  };
  return response;
}

/**
 * Extended send options that support multiple destinations (MPMA convenience).
 * When `destinations` contains multiple comma-separated addresses, automatically
 * converts to an MPMA transaction with the same asset/quantity/memo for each.
 */
export interface SendOrMPMAOptions extends SendOptions {
  destinations?: string; // Comma-separated list for MPMA
}

/**
 * Compose a send transaction, automatically using MPMA when multiple destinations provided.
 * This provides a convenient UX where users can add multiple destinations in the send form.
 */
export async function composeSendOrMPMA(options: SendOrMPMAOptions): Promise<ApiResponse> {
  const { destinations, ...sendOptions } = options;

  // Check if we have multiple destinations (MPMA)
  if (destinations && destinations.includes(',')) {
    const destArray = destinations.split(',').map((d: string) => d.trim());

    // Same asset/quantity for each destination; a memo shared by every send travels once as the
    // whole-send `memo` param.
    const mpmaOptions: MPMAOptions = {
      sourceAddress: options.sourceAddress,
      assets: destArray.map(() => options.asset),
      destinations: destArray,
      quantities: destArray.map(() => options.quantity.toString()),
      sat_per_vbyte: options.sat_per_vbyte,
      ...(options.memo && {
        memo: options.memo,
        memo_is_hex: options.memo_is_hex ?? false,
      })
    };

    const response = await composeMPMA(mpmaOptions);
    response.result.name = 'mpma';
    return response;
  }

  // Single destination - regular send
  const response = await composeSend(sendOptions);
  response.result.name = 'send';
  // Preserve more_outputs in result for review page display
  if (sendOptions.more_outputs) {
    response.result.params.more_outputs = sendOptions.more_outputs;
  }
  return response;
}

export async function composeSweep(options: SweepOptions): Promise<ApiResponse> {
  const {
    sourceAddress,
    destination,
    flags,
    memo = '',
    more_outputs,
    sat_per_vbyte,
    max_fee,
    encoding,
  } = options;
  const paramsObj = {
    destination,
    flags: flags.toString(),
    memo,
    ...(more_outputs ? { more_outputs } : {}),
    ...(max_fee !== undefined && { max_fee: max_fee.toString() }),
  };
  const response = await composeTransaction('sweep', paramsObj, sourceAddress, sat_per_vbyte, encoding);
  if (more_outputs && response.result?.params) {
    response.result.params.more_outputs = more_outputs;
  }
  return response;
}

export async function composeFairminter(options: FairminterOptions): Promise<ApiResponse> {
  const {
    sourceAddress,
    asset,
    asset_parent,
    lot_price = 0,
    lot_size = 1,
    max_mint_per_tx = 0,
    max_mint_per_address = 0,
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
    pool_quantity = 0,
    lp_asset,
  } = options;
  // Boolean values are normalized upstream - convert to API string format
  const paramsObj = {
    asset,
    ...(asset_parent && { asset_parent }),
    lot_price: lot_price.toString(),
    lot_size: lot_size.toString(),
    max_mint_per_tx: max_mint_per_tx.toString(),
    max_mint_per_address: max_mint_per_address.toString(),
    hard_cap: hard_cap.toString(),
    premint_quantity: premint_quantity.toString(),
    start_block: start_block.toString(),
    end_block: end_block.toString(),
    soft_cap: soft_cap.toString(),
    soft_cap_deadline_block: soft_cap_deadline_block.toString(),
    minted_asset_commission: minted_asset_commission.toString(),
    burn_payment: burn_payment ? 'true' : 'false',
    lock_description: lock_description ? 'true' : 'false',
    lock_quantity: lock_quantity ? 'true' : 'false',
    divisible: divisible ? 'true' : 'false',
    ...(pool_quantity > 0 && { pool_quantity: pool_quantity.toString() }),
    ...(lp_asset && { lp_asset }),
    ...(description && { description }),
    ...(pubkeys && { pubkeys }),
    ...(inscription && { inscription }),
    ...(mime_type && { mime_type }),
    ...(max_fee !== undefined && { max_fee: max_fee.toString() }),
  };
  return composeTransaction('fairminter', paramsObj, sourceAddress, sat_per_vbyte, encoding);
}

export async function composeFairmint(options: FairmintOptions): Promise<ApiResponse> {
  const {
    sourceAddress,
    asset,
    quantity = 0,
    sat_per_vbyte,
    max_fee,
    encoding,
  } = options;
  const paramsObj = {
    asset,
    quantity: quantity.toString(),
    ...(max_fee !== undefined && { max_fee: max_fee.toString() }),
  };
  return composeTransaction('fairmint', paramsObj, sourceAddress, sat_per_vbyte, encoding);
}

export async function composePoolDeposit(options: PoolDepositOptions): Promise<ApiResponse> {
  await requireCounterpartyFeature('ammPools');

  const {
    sourceAddress,
    asset_a,
    asset_b,
    quantity_a,
    quantity_b,
    min_lp_quantity = 0,
    lp_asset,
    sat_per_vbyte,
    max_fee,
    encoding,
  } = options;
  const paramsObj = {
    asset_a,
    asset_b,
    quantity_a: quantity_a.toString(),
    quantity_b: quantity_b.toString(),
    min_lp_quantity: min_lp_quantity.toString(),
    ...(lp_asset && { lp_asset }),
    ...(max_fee !== undefined && { max_fee: max_fee.toString() }),
  };
  return composeTransaction('pooldeposit', paramsObj, sourceAddress, sat_per_vbyte, encoding);
}

export async function composePoolWithdraw(options: PoolWithdrawOptions): Promise<ApiResponse> {
  await requireCounterpartyFeature('ammPools');

  const {
    sourceAddress,
    asset_a,
    asset_b,
    quantity,
    min_quantity_a = 0,
    min_quantity_b = 0,
    lp_asset,
    sat_per_vbyte,
    max_fee,
    encoding,
  } = options;
  const paramsObj = {
    ...(asset_a && { asset_a }),
    ...(asset_b && { asset_b }),
    quantity: quantity.toString(),
    min_quantity_a: min_quantity_a.toString(),
    min_quantity_b: min_quantity_b.toString(),
    ...(lp_asset && { lp_asset }),
    ...(max_fee !== undefined && { max_fee: max_fee.toString() }),
  };
  const response = await composeTransaction('poolwithdraw', paramsObj, sourceAddress, sat_per_vbyte, encoding);
  if (lp_asset && response.result?.params) {
    response.result.params.lp_asset = lp_asset;
  }
  return response;
}

export async function composeAttach(options: AttachOptions): Promise<ApiResponse> {
  const {
    sourceAddress,
    asset,
    quantity,
    utxo_value, // Note: utxo_value is disabled after block 871900
    destination_vout,
    sat_per_vbyte,
    max_fee,
    encoding,
  } = options;
  const paramsObj = {
    asset,
    quantity: quantity.toString(),
    ...(utxo_value !== undefined ? { utxo_value: utxo_value.toString() } : {}),
    ...(destination_vout !== undefined ? { destination_vout: destination_vout.toString() } : {}),
    ...(max_fee !== undefined && { max_fee: max_fee.toString() }),
  };
  const settings = getActiveSettings();
  // Current Core emits `[546-sat attachment, data, more_outputs..., change]` when the attach target
  // is implicit. Keep explicit/legacy output controls on the ordinary path until independently
  // proven; for the default current-height shape the DIESEL UTXO is vout 2.
  const attachDieselMint = settings.enableDieselMinting
    && isSupportedDieselUtxoAddress(sourceAddress)
    && utxo_value === undefined
    && destination_vout === undefined
    && (encoding === undefined || encoding === 'auto' || encoding === 'opreturn');
  if (!attachDieselMint) {
    return composeTransaction('attach', paramsObj, sourceAddress, sat_per_vbyte, encoding);
  }
  return composeWithDieselMint('attach', paramsObj, sourceAddress, sat_per_vbyte, 2);
}

export async function composeDetach(options: DetachOptions): Promise<ApiResponse> {
  const {
    sourceUtxo,
    destination,
    sat_per_vbyte,
    encoding,
  } = options;
  const paramsObj = {
    ...(destination && { destination }),
  };
  return composeUtxoTransaction('detach', paramsObj, sourceUtxo, sat_per_vbyte, encoding);
}

export async function composeMove(options: MoveOptions): Promise<ApiResponse> {
  const {
    sourceUtxo,
    destination,
    sat_per_vbyte,
    encoding,
  } = options;
  const paramsObj = {
    destination,
  };
  return composeUtxoTransaction('movetoutxo', paramsObj, sourceUtxo, sat_per_vbyte, encoding);
}
