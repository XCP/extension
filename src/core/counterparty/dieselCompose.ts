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
} from '@/core/alkanes/diesel';
import { normalizeAddressForComparison } from '@/core/bitcoin/address';
import { parseRawTransactionLocally } from '@/core/bitcoin/localTransactionParse';
import type { ApiResponse, BaseComposeOptions } from '@/core/counterparty/composeTypes';
import { selectUtxosForTransaction } from '@/core/counterparty/utxoSelection';
import { CounterpartyApiError } from '@/core/errors';
import { multiply, roundUp, subtract, sum, toSafeInteger } from '@/core/numeric';
import { getActiveSettings } from '@/core/settings';
import { validateBitcoinAddress } from '@/core/validation/bitcoin';

interface ComposeControl {
  inputsSet: string;
  useAllInputsSet: boolean;
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

/** Safe dust value for every address type accepted by the send form. */
const DIESEL_RECIPIENT_SATS = 546;

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
export async function composeCounterpartyWithDieselMint(
  compose: CounterpartyComposer,
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
  const optimized = await compose(
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
  const response = await compose('send', {
    destination,
    asset: 'BTC',
    quantity: DIESEL_RECIPIENT_SATS.toString(),
    no_dispense: 'true',
    more_outputs: `${minimumDieselUtxoSats}:${sourceAddress},0:${transferScript}`,
    ...(max_fee !== undefined && { max_fee: max_fee.toString() }),
  }, sourceAddress, sat_per_vbyte, 'opreturn', { inputsSet, useAllInputsSet: true });

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
    || recipient?.value !== DIESEL_RECIPIENT_SATS
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
  response.result.diesel_transfer = {
    amount_base_units: amountBaseUnits,
    input_utxos: dieselInputs,
    recipient_vout: 0,
    remainder_vout: 1,
    runestone_vout: 2,
  };
  return response;
}
