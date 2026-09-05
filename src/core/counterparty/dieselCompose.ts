/**
 * Counterparty/Alkanes transaction integration.
 *
 * Generic Counterparty composition should only decide whether a host transaction is eligible and
 * delegate here. This module owns the DIESEL-specific output layouts, rolling UTXO selection,
 * two-pass +26 vB optimization, transfer coin selection, and byte-level post-compose proofs.
 */

import { fetchDieselBalance } from '@/core/alkanes/api';
import {
  buildDieselMintScript,
  buildDieselTransferScript,
  DIESEL_RUNESTONE_MARGINAL_VBYTES,
  dieselUtxoMinimumSats,
  isSupportedDieselUtxoAddress,
  shouldAttachDieselMint,
} from '@/core/alkanes/diesel';
import { isDieselMintHeightAllowed } from '@/core/alkanes/dieselMintPolicy';
import { normalizeAddressForComparison } from '@/core/bitcoin/address';
import { parseRawTransactionLocally } from '@/core/bitcoin/localTransactionParse';
import type { ApiResponse, BaseComposeOptions } from '@/core/counterparty/composeTypes';
import { packComposeMessage } from '@/core/counterparty/pack/messages';
import { arc4, bytesToHex, hexToBytes } from '@/core/counterparty/unpack/binary';
import { selectUtxosForTransaction } from '@/core/counterparty/utxoSelection';
import { CounterpartyApiError } from '@/core/errors';
import { multiply, roundUp, subtract, sum, toSafeInteger } from '@/core/numeric';
import { getActiveSettings } from '@/core/settings';
import { validateBitcoinAddress } from '@/core/validation/bitcoin';

interface ComposeControl {
  inputsSet: string;
  useAllInputsSet: boolean;
  excludedUtxos?: string[];
}

export type CounterpartyComposer = (
  endpoint: string,
  params: Record<string, unknown>,
  sourceAddress: string,
  satPerVbyte: number,
  encoding?: string,
  control?: ComposeControl,
) => Promise<ApiResponse>;

export interface DieselSendOptions extends BaseComposeOptions {
  destination: string;
  /** Exact DIESEL base units, not a display-unit decimal. */
  amountBaseUnits: string;
}

type DieselDataHost = 'order' | 'cancel' | 'broadcast';

/**
 * These Core composers have no positional BTC destination and return one short data output.
 * Validate the complete packed size before forcing OP_RETURN: an auto-encoded long broadcast
 * must keep its ordinary multisig path. The final data script must also match the user's message,
 * independently of the API's echoes and of agreement between its two responses.
 */
export async function composeDataTransactionWithDieselMint(
  compose: CounterpartyComposer,
  endpoint: DieselDataHost,
  params: Record<string, unknown>,
  sourceAddress: string,
  satPerVbyte: number,
  encoding?: string,
): Promise<ApiResponse> {
  const settings = getActiveSettings();
  const eligible = shouldAttachDieselMint({
    enabled: settings.enableDieselMinting,
    sourceAddress,
    feeRate: satPerVbyte,
    maximumFeeRate: settings.dieselMintMaxFeeRate,
    encoding,
  }) && !params.inscription
    && (!params.mime_type || params.mime_type === 'text/plain');
  const packed = eligible ? packComposeMessage(endpoint, params) : null;
  // Packed bytes already include CNTRPRTY. Core's current one-OP_RETURN limit is 80 bytes.
  if (!packed || packed.bytes.length > 80) {
    return compose(endpoint, params, sourceAddress, satPerVbyte, encoding);
  }

  const response = await composeCounterpartyWithDieselMint(
    compose, endpoint, params, sourceAddress, satPerVbyte, 1, undefined, encoding,
  );
  if (!response.result.diesel_mint) return response;
  const parsed = parseRawTransactionLocally(response.result.rawtransaction);
  const firstInput = parsed?.inputs[0];
  const hostOutput = parsed?.outputs[0];
  const encrypted = firstInput ? arc4(hexToBytes(firstInput.txid), packed.bytes) : null;
  const expectedScript = encrypted ? bytesToHex(Uint8Array.from([
    0x6a,
    ...(encrypted.length <= 75 ? [encrypted.length] : [0x4c, encrypted.length]),
    ...encrypted,
  ])) : null;
  if (!expectedScript || hostOutput?.value !== 0
    || hostOutput.opReturnData?.toLowerCase() !== expectedScript) {
    throw new CounterpartyApiError(
      'Counterparty compose did not preserve the requested DIESEL host message.', endpoint,
    );
  }
  return response;
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

type ParsedTransaction = NonNullable<ReturnType<typeof parseRawTransactionLocally>>;

/** Bound signed size using wallet input formats and the actual serialized output scripts. */
function maximumSignedVsize(parsed: ParsedTransaction, sourceAddress: string): number {
  const compactSize = (value: number) => value < 253 ? 1 : value <= 0xffff ? 3 : 5;
  const outputBytes = parsed.outputs.reduce((total, output) => {
    const script = output.script ?? output.opReturnData;
    if (script === undefined) throw new CounterpartyApiError('Unreadable DIESEL output script.', 'send');
    const size = script.length / 2;
    return total + 8 + compactSize(size) + size;
  }, 0);
  // Version, locktime, counts and at most one vbyte for the SegWit marker/flag. Input bounds
  // include maximum signatures for each supported wallet format, independently of API vsize.
  return 9 + compactSize(parsed.inputs.length) + compactSize(parsed.outputs.length)
    + parsed.inputs.length * conservativeWalletInputVbytes(sourceAddress) + outputBytes;
}

function proveFeeBound(
  parsed: ParsedTransaction,
  trustedInputTotal: number,
  sourceAddress: string,
  feeRate: number,
  maxFee: unknown,
  endpoint: string,
  dustRemainderAllowance = 0,
): number {
  const fee = toSafeInteger(subtract(trustedInputTotal, sum(parsed.outputs.map(({ value }) => value))).toFixed(0));
  const limit = maxFee === undefined ? undefined
    : typeof maxFee === 'string' || typeof maxFee === 'number' ? toSafeInteger(maxFee) : undefined;
  const bound = estimateDieselMarginalFee(maximumSignedVsize(parsed, sourceAddress), feeRate, endpoint)
    + dustRemainderAllowance;
  if (!Number.isFinite(feeRate) || feeRate <= 0 || fee === undefined || fee < 0 || fee > bound
    || (maxFee !== undefined && (limit === undefined || limit < 0 || fee > limit))) {
    throw new CounterpartyApiError('DIESEL transaction fee exceeds the independently verified fee limit.', endpoint);
  }
  return fee;
}

function counterpartyDataScript(txid: string, bytes: Uint8Array): string {
  const encrypted = arc4(hexToBytes(txid), bytes);
  return bytesToHex(Uint8Array.from([
    0x6a, ...(encrypted.length <= 75 ? [encrypted.length] : [0x4c, encrypted.length]), ...encrypted,
  ]));
}

function hasCallerRunestone(moreOutputs: unknown): boolean {
  return typeof moreOutputs === 'string' && moreOutputs.split(',').some((output) => {
    const separator = output.indexOf(':');
    return separator >= 0 && /^(?:0x)?6a5d/i.test(output.slice(separator + 1).trim());
  });
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
export async function composeCounterpartyWithDieselMint(
  compose: CounterpartyComposer,
  endpoint: 'send' | 'attach' | DieselDataHost,
  paramsObj: Record<string, unknown>,
  sourceAddress: string,
  satPerVbyte: number,
  dieselUtxoVout: number,
  precedingMoreOutputs?: string,
  encoding?: string,
): Promise<ApiResponse> {
  const ordinaryCompose = () => compose(endpoint, paramsObj, sourceAddress, satPerVbyte, encoding);
  const packed = endpoint === 'send' && paramsObj.asset === 'BTC'
    ? undefined : packComposeMessage(endpoint, paramsObj);
  if (hasCallerRunestone(paramsObj.more_outputs) || hasCallerRunestone(precedingMoreOutputs)
    || packed === null || (packed && packed.bytes.length > 80)) return ordinaryCompose();

  // The staged Alkanes activation changes mint funding semantics. Until that path is validated,
  // stop decorating at its earliest proposed height; an unavailable height also keeps the host.
  if (!await isDieselMintHeightAllowed()) return ordinaryCompose();
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
  let offeredUtxos = rolledUtxo ? [rolledUtxo] : selection.utxos;
  let response: ApiResponse;
  try {
    response = await compose(
      endpoint,
      firstParams,
      sourceAddress,
      satPerVbyte,
      'opreturn',
      {
        inputsSet: offeredUtxos.map(({ txid, vout }) => `${txid}:${vout}`).join(','),
        useAllInputsSet: !!rolledUtxo,
        excludedUtxos: selection.excludedUtxos,
      },
    );
  } catch (dieselUtxoError) {
    // A DIESEL UTXO with enough BTC replaces the ordinary funding input at no input-vbyte penalty.
    // Never add an underfunded DIESEL UTXO beside clean inputs merely to consolidate: that
    // would spend ~68 vB to save a future token transfer. Keep it protected and mint a new shard.
    if (!rolledUtxo || selection.utxos.length === 0) throw dieselUtxoError;
    rolledUtxo = undefined;
    offeredUtxos = selection.utxos;
    response = await compose(
      endpoint,
      firstParams,
      sourceAddress,
      satPerVbyte,
      'opreturn',
      { inputsSet: selection.inputsSet, useAllInputsSet: false, excludedUtxos: selection.excludedUtxos },
    );
  }

  const parsed = parseRawTransactionLocally(response.result.rawtransaction);
  if (!parsed) throw new CounterpartyApiError('Unreadable DIESEL transaction.', endpoint);
  const selectedByOutpoint = new Map(
    offeredUtxos.map((utxo) => [`${utxo.txid.toLowerCase()}:${utxo.vout}`, utxo.value]),
  );
  const actualInputs = parsed.inputs.map((input) => `${input.txid.toLowerCase()}:${input.vout}`);
  const actualInputValues = actualInputs.map((outpoint) => selectedByOutpoint.get(outpoint));
  if (actualInputs.length === 0 || new Set(actualInputs).size !== actualInputs.length
    || actualInputValues.some((value) => value === undefined)
    || (rolledUtxo && actualInputs.length !== offeredUtxos.length)) {
    throw new CounterpartyApiError(
      'Counterparty compose used an input whose value was not independently selected.', endpoint,
    );
  }
  const trustedInputTotal = toSafeInteger(sum(actualInputValues as number[]).toFixed(0));
  if (trustedInputTotal === undefined) throw new CounterpartyApiError('Invalid DIESEL input total.', endpoint);
  const hasFinalChange = ownedStandardOutputVbytes(parsed.outputs.at(-1), sourceAddress) !== undefined;
  const firstFee = proveFeeBound(parsed, trustedInputTotal, sourceAddress, satPerVbyte, paramsObj.max_fee,
    endpoint, hasFinalChange ? 0 : minimumDieselUtxoSats - 1);
  const firstSignedVsize = response.result.signed_tx_estimated_size.vsize;
  if (response.result.btc_fee !== firstFee || !Number.isSafeInteger(firstSignedVsize)
    || firstSignedVsize <= 0 || firstSignedVsize > maximumSignedVsize(parsed, sourceAddress)) {
    throw new CounterpartyApiError('Counterparty compose returned an unverified DIESEL fee or size.', endpoint);
  }

  // A BTC payment to an open dispenser adds Core's exact two-byte dispense message before
  // more_outputs. Recognize only that complete shifted layout, then recompose the original
  // payment without the mint or rolled token inputs. A malformed response never triggers fallback.
  const dispense = endpoint === 'send' && paramsObj.asset === 'BTC'
    && paramsObj.no_dispense !== true && paramsObj.no_dispense !== 'true'
    ? packComposeMessage('dispense', {}) : null;
  if (dispense && parsed.outputs[1]?.value === 0
    && parsed.outputs[1]?.opReturnData?.toLowerCase()
      === counterpartyDataScript(parsed.inputs[0]!.txid, dispense.bytes)
    && parsed.outputs[0]?.value === toSafeInteger(String(paramsObj.quantity))
    && parsed.outputs[0]?.address && typeof paramsObj.destination === 'string'
    && normalizeAddressForComparison(parsed.outputs[0].address)
      === normalizeAddressForComparison(paramsObj.destination)
    && parsed.outputs[dieselUtxoVout + 1]?.value === minimumDieselUtxoSats
    && ownedStandardOutputVbytes(parsed.outputs[dieselUtxoVout + 1], sourceAddress) !== undefined
    && parsed.outputs[runestoneVout + 1]?.value === 0
    && parsed.outputs[runestoneVout + 1]?.opReturnData?.toLowerCase() === dieselScript
    && (parsed.outputs.length === runestoneVout + 2
      || (parsed.outputs.length === runestoneVout + 3
        && ownedStandardOutputVbytes(parsed.outputs.at(-1), sourceAddress) !== undefined))) {
    return ordinaryCompose();
  }
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

  // Before Counterparty's proposed parser update the explicit dust carrier can become its
  // destination. Only the optimized change form is supported; keep a no-change host ordinary.
  const change = parsed.outputs[changeVout];
  if (parsed.outputs.length === runestoneVout + 1) return ordinaryCompose();
  if (
    parsed.outputs.length !== changeVout + 1
    || ownedStandardOutputVbytes(change, sourceAddress) !== walletOutputVbytes
    || !Number.isSafeInteger(firstSignedVsize)
    || firstSignedVsize <= walletOutputVbytes
  ) {
    throw new CounterpartyApiError('Counterparty compose returned an unsupported DIESEL output layout.', endpoint);
  }

  const optimizedVsize = toSafeInteger(
    subtract(firstSignedVsize, walletOutputVbytes).toFixed(0),
  );
  const exactFee = optimizedVsize === undefined
    ? undefined
    : estimateDieselMarginalFee(optimizedVsize, satPerVbyte, endpoint);
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
    return ordinaryCompose();
  }

  const optimizedOutputPair = `${optimizedDieselUtxoSats}:${sourceAddress},0:${dieselScript}`;
  const optimizedMoreOutputs = precedingMoreOutputs
    ? `${precedingMoreOutputs},${optimizedOutputPair}`
    : optimizedOutputPair;
  const optimized = await compose(
    endpoint,
    { ...paramsObj, more_outputs: optimizedMoreOutputs, exact_fee: exactFee.toString() },
    sourceAddress,
    satPerVbyte,
    'opreturn',
    { inputsSet: actualInputs.join(','), useAllInputsSet: true, excludedUtxos: selection.excludedUtxos },
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
    || optimized.result.btc_fee !== exactFee
    || optimized.result.btc_change !== 0
    || optimized.result.signed_tx_estimated_size.vsize !== optimizedVsize
  ) {
    throw new CounterpartyApiError(
      'Counterparty compose did not preserve the proven optimized DIESEL transaction shape.',
      endpoint,
    );
  }

  proveFeeBound(optimizedParsed, trustedInputTotal, sourceAddress, satPerVbyte, paramsObj.max_fee, endpoint);
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

/** Build and prove an edict spend from selected DIESEL-bearing inputs. */
export async function composeDieselSendTransaction(
  compose: CounterpartyComposer,
  options: DieselSendOptions,
): Promise<ApiResponse> {
  const { sourceAddress, destination, amountBaseUnits, sat_per_vbyte, max_fee } = options;
  if (!isSupportedDieselUtxoAddress(sourceAddress)) {
    throw new Error('DIESEL sends require a supported wallet source address.');
  }
  const minimumDieselUtxoSats = dieselUtxoMinimumSats(sourceAddress)!;
  const recipientSats = dieselUtxoMinimumSats(destination);
  if (recipientSats === undefined) {
    throw new Error('DIESEL sends require a supported recipient address.');
  }
  if (!/^\d+$/.test(amountBaseUnits) || BigInt(amountBaseUnits) <= 0n) {
    throw new Error('DIESEL amount must be positive.');
  }
  const requested = BigInt(amountBaseUnits);
  const settings = getActiveSettings();
  const [diesel, selection] = await Promise.all([
    fetchDieselBalance(sourceAddress),
    selectUtxosForTransaction(sourceAddress, {
      allowUnconfirmed: settings.allowUnconfirmedTxs,
      maxUtxos: 20,
      includeDieselUtxos: true,
    }),
  ]);
  if (requested > BigInt(diesel.baseUnits)) throw new Error('Insufficient DIESEL balance.');

  // Intersect the Alkanes address result with the asset-filtered Bitcoin selector. This prevents a
  // DIESEL send from consuming an outpoint that also holds a Counterparty attachment. The selector's
  // Bitcoin value is independently sourced and is the value used for fee reconciliation below.
  const routableByOutpoint = new Map((selection.dieselUtxos ?? []).map(
    (utxo) => [`${utxo.txid.toLowerCase()}:${utxo.vout}`, utxo],
  ));
  const available = diesel.utxos.flatMap((utxo) => {
    const routable = routableByOutpoint.get(`${utxo.txid.toLowerCase()}:${utxo.vout}`);
    return routable ? [{ ...utxo, value: routable.value }] : [];
  }).sort((a, b) => {
    const value = (utxo: typeof a) => utxo.balances
      .filter((item) => item.id === '2:0')
      .reduce((total, item) => total + BigInt(item.value), 0n);
    const left = value(a);
    const right = value(b);
    return left === right ? 0 : left > right ? -1 : 1;
  });
  const routableBalance = available.reduce((total, utxo) => total + utxo.balances
    .filter((item) => item.id === '2:0')
    .reduce((subtotal, item) => subtotal + BigInt(item.value), 0n), 0n);
  if (requested > routableBalance) {
    throw new Error('DIESEL is present, but its UTXO is not safe to spend from this screen.');
  }

  // Largest-first minimizes witness inputs. One of core's 20 input-set slots is reserved for a
  // normal BTC UTXO that funds dust and fees; token-bearing inputs are never offered to ordinary flows.
  const dieselUtxos: typeof available = [];
  let covered = 0n;
  for (const utxo of available) {
    if (dieselUtxos.length === 19 || covered >= requested) break;
    dieselUtxos.push(utxo);
    covered += utxo.balances
      .filter((item) => item.id === '2:0')
      .reduce((total, item) => total + BigInt(item.value), 0n);
  }
  if (covered < requested) {
    throw new Error('This send needs more than 19 DIESEL UTXOs; consolidate them first.');
  }
  const dieselInputs = dieselUtxos.map(({ txid, vout }) => `${txid}:${vout}`);
  const dieselInputSats = dieselUtxos.reduce((total, utxo) => total + (utxo.value ?? 0), 0);
  const inputVbytes = conservativeWalletInputVbytes(sourceAddress);
  const selectedFunding: typeof selection.utxos = [];
  let fundingSats = 0;
  for (const utxo of selection.utxos.slice(0, 20 - dieselUtxos.length)) {
    // Conservative budget: four outputs plus overhead and the source format's worst-case input
    // size per DIESEL/funding coin. Check the token inputs first so a funded carrier does not
    // pull in an unnecessary clean coin. Core computes the exact fee.
    const estimatedVsize = 160 + inputVbytes * (dieselUtxos.length + selectedFunding.length);
    const needed = recipientSats + minimumDieselUtxoSats
      + Math.ceil(estimatedVsize * sat_per_vbyte);
    if (dieselInputSats + fundingSats >= needed) break;
    selectedFunding.push(utxo);
    fundingSats += utxo.value;
  }
  const estimatedVsize = 160 + inputVbytes * (dieselUtxos.length + selectedFunding.length);
  if (dieselInputSats + fundingSats < recipientSats + minimumDieselUtxoSats
    + Math.ceil(estimatedVsize * sat_per_vbyte)) {
    throw new Error('Insufficient clean BTC to fund the DIESEL send fee.');
  }
  const fundingInputs = selectedFunding.map(({ txid, vout }) => `${txid}:${vout}`);
  const inputsSet = [...dieselInputs, ...fundingInputs].join(',');
  const transferScript = buildDieselTransferScript(requested, 0, 1);
  const response = await compose('send', {
    destination,
    asset: 'BTC',
    quantity: recipientSats.toString(),
    no_dispense: 'true',
    more_outputs: `${minimumDieselUtxoSats}:${sourceAddress},0:${transferScript}`,
    ...(max_fee !== undefined && { max_fee: max_fee.toString() }),
  }, sourceAddress, sat_per_vbyte, 'opreturn', { inputsSet, useAllInputsSet: true, excludedUtxos: selection.excludedUtxos });

  const parsed = parseRawTransactionLocally(response.result.rawtransaction);
  const offeredInputs = [...dieselInputs, ...fundingInputs].map((input) => input.toLowerCase());
  const actualInputs = parsed?.inputs.map(
    ({ txid, vout }) => `${txid.toLowerCase()}:${vout}`,
  );
  const offeredInputSet = new Set(offeredInputs);
  const actualInputSet = new Set(actualInputs ?? []);
  const recipient = parsed?.outputs[0];
  const remainder = parsed?.outputs[1];
  const runestone = parsed?.outputs[2];
  const inputTotal = dieselInputSats + fundingSats;
  const outputTotal = parsed ? sum(parsed.outputs.map((output) => output.value)) : null;
  const independentlyDerivedFee = outputTotal === null
    ? undefined
    : toSafeInteger(subtract(inputTotal, outputTotal).toFixed(0));
  const trailingOutputsOwned = parsed?.outputs.slice(3).every(
    (output) => ownedStandardOutputVbytes(output, sourceAddress) !== undefined,
  );
  if (
    !parsed
    || actualInputs?.length !== offeredInputs.length
    || offeredInputSet.size !== offeredInputs.length
    || actualInputSet.size !== actualInputs.length
    || offeredInputs.some((input) => !actualInputSet.has(input))
    || recipient?.value !== recipientSats
    || !recipient.address
    || normalizeAddressForComparison(recipient.address) !== normalizeAddressForComparison(destination)
    || remainder?.value !== minimumDieselUtxoSats
    || !remainder.address
    || normalizeAddressForComparison(remainder.address) !== normalizeAddressForComparison(sourceAddress)
    || runestone?.value !== 0
    || runestone.opReturnData?.toLowerCase() !== transferScript
    || trailingOutputsOwned !== true
    || independentlyDerivedFee === undefined
    || independentlyDerivedFee < 0
    || independentlyDerivedFee !== response.result.btc_fee
    || (max_fee !== undefined && independentlyDerivedFee > max_fee)
  ) {
    throw new CounterpartyApiError(
      'Counterparty compose did not preserve the required DIESEL transfer layout.',
      'send',
    );
  }
  proveFeeBound(parsed, inputTotal, sourceAddress, sat_per_vbyte, max_fee, 'send',
    parsed.outputs.length === 3 ? minimumDieselUtxoSats - 1 : 0);
  response.result.diesel_transfer = {
    amount_base_units: amountBaseUnits,
    input_utxos: dieselInputs,
    recipient_vout: 0,
    remainder_vout: 1,
    runestone_vout: 2,
  };
  return response;
}
