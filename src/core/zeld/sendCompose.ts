/**
 * Compose a ZELD send locally.
 *
 * ZELD moves with the Bitcoin outputs that carry it, so a send is a plain Bitcoin transaction
 * that spends the wallet's ZELD-bearing outputs and tells the protocol how to split what they
 * carry. Counterparty is not involved; this never touches its composer.
 *
 * Output order is the safety mechanism:
 *
 *   0. change to the source (all remaining BTC)          ← receives the ZELD remainder
 *   1. a dust output to the recipient                     ← receives the amount sent
 *   2. OP_RETURN `ZELD` + CBOR([remainder, amount])
 *
 * The protocol routes an unlisted remainder to output 0 and, if the listed amounts exceed what
 * the inputs really carry, ignores the list and sends everything to output 0. With change first,
 * a stale or wrong indexer balance can therefore only make a send fall short, never send ZELD to
 * the wrong place. The same layout is what makes the transaction eligible for a hunt.
 */

import { hexToBytes } from '@noble/hashes/utils.js';
import { Transaction } from '@scure/btc-signer';
import { getInputSizeForAddress } from '@/core/bitcoin/feeEstimation';
import { isUtxoRecentlySpent } from '@/core/bitcoin/spentUtxoCache';
import { fetchUTXOs, type UTXO } from '@/core/bitcoin/utxo';
import { fetchTokenBalances } from '@/core/counterparty/api';
import type { ApiResponse } from '@/core/counterparty/compose';
import { bytesToHex } from '@/core/counterparty/unpack/binary';
import { selectUtxosForTransaction } from '@/core/counterparty/utxoSelection';
import { asDisplayUnits, fromSatoshis, toSafeInteger } from '@/core/numeric';
import { getActiveSettings } from '@/core/settings';
import { fetchZeldBalance, type ZeldUtxo } from '@/core/zeld/api';
import { zeldDistributionScript } from '@/core/zeld/cbor';
import { scriptHexForAddress } from '@/core/zeld/huntTemplate';
import type { ZeldSendMetadata } from '@/core/zeld/types';

export interface ZeldSendOptions {
  sourceAddress: string;
  destination: string;
  /** ZELD base units to send, as a decimal string. */
  amountBaseUnits: string;
  sat_per_vbyte: number;
}

export interface ZeldParkOptions {
  sourceAddress: string;
  sat_per_vbyte: number;
}

interface ZeldMoveOptions {
  sourceAddress: string;
  destination: string;
  amountBaseUnits: string;
  sat_per_vbyte: number;
  park: boolean;
}

/** What the recipient's dust output must carry for its script type to be relayed. */
export function zeldRecipientDustSats(destination: string): number {
  const lower = destination.toLowerCase();
  if (lower.startsWith('bc1p') || lower.startsWith('tb1p') || lower.startsWith('bcrt1p')) return 330;
  if (lower.startsWith('bc1q') || lower.startsWith('tb1q') || lower.startsWith('bcrt1q')) return 330;
  if (lower.startsWith('3') || lower.startsWith('2')) return 540;
  return 546;
}

function outputVbytes(scriptLength: number): number {
  return 8 + 1 + scriptLength;
}

/** A satoshi total as the number the compose result carries; every total here is far below 2^53. */
function satsAsNumber(value: bigint): number {
  const safe = toSafeInteger(value);
  if (safe === undefined) throw new RangeError('satoshi total is not a safe integer');
  return safe;
}

function outpointKey(utxo: { txid: string; vout: number }): string {
  return `${utxo.txid.toLowerCase()}:${utxo.vout}`;
}

export function composeZeldSend(options: ZeldSendOptions): Promise<ApiResponse> {
  return composeZeldMove({ ...options, park: false });
}

/**
 * Park: spend every ZELD-bearing output and put all the ZELD on one small output of the wallet's
 * own, leaving the rest of the BTC as clean change. The escape hatch for an address whose whole
 * balance sits on ZELD outputs when it needs to pay a positional recipient (a BTCPay, a burn).
 *
 *   0. dust to the source                ← all ZELD (and any reward from a hunt) lands here
 *   1. change to the source (clean)
 *   2. OP_RETURN ZELD + CBOR([carried, 0])
 *
 * Output 0 is still the wallet's own, so a wrong balance in the distribution changes nothing.
 */
export function composeZeldPark(options: ZeldParkOptions): Promise<ApiResponse> {
  return composeZeldMove({ ...options, destination: options.sourceAddress, amountBaseUnits: 'all', park: true });
}

async function composeZeldMove(options: ZeldMoveOptions): Promise<ApiResponse> {
  const { sourceAddress, destination, amountBaseUnits, sat_per_vbyte, park } = options;
  if (!park && (!/^\d+$/.test(amountBaseUnits) || BigInt(amountBaseUnits) <= 0n)) {
    throw new Error('ZELD amount must be positive.');
  }
  if (!Number.isFinite(sat_per_vbyte) || sat_per_vbyte <= 0) throw new Error('Fee rate must be positive.');
  const sourceScript = scriptHexForAddress(sourceAddress);
  const destinationScript = scriptHexForAddress(destination);
  if (!sourceScript) throw new Error('The source address could not be decoded.');
  if (!destinationScript) throw new Error('The recipient address could not be decoded.');
  const settings = getActiveSettings();
  const [zeld, bitcoinUtxos, attachedBalances] = await Promise.all([
    fetchZeldBalance(sourceAddress),
    fetchUTXOs(sourceAddress),
    fetchTokenBalances(sourceAddress, { type: 'utxo', limit: 1000, verbose: false }),
  ]);
  const amount = park ? zeld.baseUnits : BigInt(amountBaseUnits);
  if (amount > zeld.baseUnits) throw new Error('Insufficient ZELD balance.');

  // Spend every ZELD output the wallet can spend right now. Consolidating is free here, and it
  // means the remainder lands on one output rather than being scattered by repeated sends.
  const bitcoinByOutpoint = new Map(bitcoinUtxos.map(utxo => [outpointKey(utxo), utxo]));
  const attached = new Set(attachedBalances.flatMap(balance => (balance.utxo ? [balance.utxo.toLowerCase()] : [])));
  const spendable: Array<ZeldUtxo & { value: number }> = [];
  let unspendable = 0n;
  for (const utxo of zeld.utxos) {
    const key = outpointKey(utxo);
    const bitcoin = bitcoinByOutpoint.get(key);
    const usable = bitcoin
      && (settings.allowUnconfirmedTxs || bitcoin.status.confirmed)
      && !isUtxoRecentlySpent(utxo.txid, utxo.vout)
      // A Counterparty attachment on the same output would ride along; leave it where it is.
      && !attached.has(key);
    if (usable) spendable.push({ ...utxo, value: bitcoin.value });
    else unspendable += utxo.balance;
  }
  const carried = spendable.reduce((sum, utxo) => sum + utxo.balance, 0n);
  if (park && carried === 0n) throw new Error('No spendable ZELD to move.');
  if (!park && amount > carried) {
    throw new Error(
      unspendable > 0n
        ? 'Some ZELD sits on outputs the wallet cannot spend yet (unconfirmed, just spent, or carrying a Counterparty attachment).'
        : 'Insufficient spendable ZELD.',
    );
  }

  const recipientSats = BigInt(zeldRecipientDustSats(destination));
  const changeDust = BigInt(zeldRecipientDustSats(sourceAddress));
  // Send: [change, recipient]. Park: [small own output, change]. Either way output 0 is the
  // wallet's own, and the distribution lists every spendable output in order.
  const remainder = park ? 0n : carried - amount;
  const opReturn = zeldDistributionScript(park ? [carried, 0n] : [remainder, amount]);

  const inputs: UTXO[] = spendable.map(utxo => ({
    txid: utxo.txid,
    vout: utxo.vout,
    value: utxo.value,
    status: { confirmed: true, block_height: 0, block_hash: '', block_time: 0 },
  }));
  // Virtual size is protocol arithmetic over byte counts, never an asset quantity.
  const vbytesFor = (inputCount: number): number => Math.ceil(
    10.5
      + inputCount * getInputSizeForAddress(sourceAddress)
      + outputVbytes(sourceScript.length / 2)
      + outputVbytes(destinationScript.length / 2)
      + outputVbytes(opReturn.length),
  );
  const costOf = (vbytes: number): bigint => BigInt(Math.ceil(vbytes * sat_per_vbyte));
  let inputSats = inputs.reduce((sum, utxo) => sum + BigInt(utxo.value), 0n);
  let vsize = vbytesFor(inputs.length);
  let fee = costOf(vsize);

  // ZELD outputs are usually change from ordinary sends, so they carry real BTC; but a run of
  // small ones may not cover the fee. Top up from clean outputs, largest first.
  if (inputSats < recipientSats + changeDust + fee) {
    const clean = await selectUtxosForTransaction(sourceAddress, {
      allowUnconfirmed: settings.allowUnconfirmedTxs,
      minUtxos: 0,
      maxUtxos: 20,
    });
    const zeldOutpoints = new Set(inputs.map(outpointKey));
    for (const utxo of clean.utxos) {
      if (zeldOutpoints.has(outpointKey(utxo))) continue;
      inputs.push(utxo);
      inputSats += BigInt(utxo.value);
      vsize = vbytesFor(inputs.length);
      fee = costOf(vsize);
      if (inputSats >= recipientSats + changeDust + fee) break;
    }
    if (inputSats < recipientSats + changeDust + fee) {
      throw new Error('Insufficient BTC to pay the recipient output and the fee.');
    }
  }
  const change = inputSats - recipientSats - fee;

  const tx = new Transaction({ allowUnknownOutputs: true, allowUnknownInputs: true });
  for (const input of inputs) {
    tx.addInput({
      txid: hexToBytes(input.txid),
      index: input.vout,
      sequence: 0xffffffff,
      witnessUtxo: { script: hexToBytes(sourceScript), amount: BigInt(input.value) },
    });
  }
  if (park) {
    tx.addOutput({ script: hexToBytes(sourceScript), amount: recipientSats });
    tx.addOutput({ script: hexToBytes(sourceScript), amount: change });
  } else {
    tx.addOutput({ script: hexToBytes(sourceScript), amount: change });
    tx.addOutput({ script: hexToBytes(destinationScript), amount: recipientSats });
  }
  tx.addOutput({ script: opReturn, amount: 0n });
  const rawtransaction = bytesToHex(tx.toBytes(true, false));
  const psbt = bytesToHex(tx.toPSBT());

  const zeld_send: ZeldSendMetadata = {
    amount_base_units: (park ? carried : amount).toString(),
    remainder_base_units: remainder.toString(),
    spent_outpoints: spendable.map(outpointKey),
    change_vout: park ? 1 : 0,
    recipient_vout: park ? 0 : 1,
    ...(park ? { park: true } : {}),
  };

  return {
    result: {
      rawtransaction,
      psbt,
      btc_in: satsAsNumber(inputSats),
      btc_out: satsAsNumber(recipientSats),
      btc_change: satsAsNumber(change),
      btc_fee: satsAsNumber(fee),
      data: '',
      lock_scripts: inputs.map(() => sourceScript),
      inputs_values: inputs.map(input => input.value),
      signed_tx_estimated_size: { vsize, adjusted_vsize: vsize, sigops_count: 0 },
      params: {
        source: sourceAddress,
        destination,
        // Verified as a BTC spend: the recipient's dust output is pinned to this quantity and the
        // ZELD amount is committed by the distribution script the review shows.
        asset: 'BTC',
        quantity: satsAsNumber(recipientSats),
        quantity_normalized: asDisplayUnits(fromSatoshis(recipientSats.toString())),
        memo: null,
        memo_is_hex: false,
        use_enhanced_send: false,
        no_dispense: true,
        skip_validation: false,
        asset_info: {
          asset_longname: null,
          description: 'Bitcoin',
          issuer: '',
          divisible: true,
          locked: true,
          owner: '',
        },
      },
      name: 'send',
      zeld_send,
    },
  };
}
