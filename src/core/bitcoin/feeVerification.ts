/**
 * Independent fee sanity check for composed transactions.
 *
 * The miner fee is recomputed locally as inputs minus outputs, then bounded against the fee rate
 * the user chose (which the API cannot influence) and an absolute ceiling, so a response that
 * drains the balance to fees is rejected before signing.
 *
 * Neither the API's fee figure nor its input values are trusted: input values are always resolved
 * independently, and a fee that cannot be established is refused.
 *
 * An earlier version accepted the response's values for SegWit wallets, reasoning that BIP-143 makes
 * a signature commit to the amount it spends, so an understated value could not also produce a valid
 * signature. That reasoning is exactly what Trezor and Ledger shipped, and Saleem Rashid broke it in
 * 2020 by mixing signatures across two confirmation rounds to burn funds as fees; both vendors
 * responded by resolving amounts from the previous transactions instead of trusting the host. The
 * check is cheap — signing already fetches these prevouts — so the assumption is deleted rather than
 * reasoned about. See ADR-019.
 */

import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { Transaction } from '@scure/btc-signer';
import { divide, maximum, multiply, roundDown, roundUp, toFiniteNumber, toSafeInteger } from "@/core/numeric";

/**
 * A fee rate above this (sat/vByte) is treated as never legitimate, and *blocks* on the compose
 * path — where the wallet built the transaction, so an absurd fee means the response misbehaved.
 */
export const MAX_SANE_FEE_RATE = 5000;

/**
 * A fee rate above this (sat/vByte) is worth *warning* about on a transaction the wallet did not
 * build.
 *
 * Separate from the blocking threshold because the two answer different questions. Blocking asks
 * whether a rate could ever be legitimate, so it sits far above any the network has demanded.
 * Warning asks whether someone should look, and at 5000 that arrived too late: a 250-vByte
 * transaction at 4,999 sat/vB burns ~0.0125 BTC while staying under both that rate and the 0.1 BTC
 * ceiling.
 *
 * 500 is roughly fifty times a busy-day rate — above ordinary urgency such as a fee bump or CPFP,
 * below anything nobody intended. It only warns; a site-built transaction can be expensive for
 * reasons the wallet cannot see (see `transaction/approve.tsx`).
 */
export const HIGH_FEE_RATE_WARNING = 500;
/** When the user chose a fee rate, reject fees beyond this multiple of it. */
export const USER_FEE_RATE_TOLERANCE = 10;
/** Absolute floor so tiny transactions aren't rejected by rate rounding. */
const MIN_BOUND_SATS = 10_000;

/**
 * Whether a fee is high enough for the transaction's size to be worth flagging to the user.
 *
 * The compose path bounds fees by recomputing them from resolved input values, but a transaction
 * handed over by a connected site is already built, and its fee only had an absolute ceiling — so a
 * fee just under that ceiling passed unremarked however small the transaction was. This is the rate
 * bound for those paths: it needs no network, since a decoded transaction already yields both
 * numbers.
 *
 * @param fee - Miner fee in sats, or null when it could not be established.
 * @param vsize - Transaction virtual size in vbytes.
 */
export function exceedsSaneFeeRate(fee: number | null | undefined, vsize: number | undefined): boolean {
  if (fee == null || !Number.isFinite(fee) || fee <= 0) return false;
  if (!vsize || !Number.isFinite(vsize) || vsize <= 0) return false;
  return fee / vsize > HIGH_FEE_RATE_WARNING;
}

export interface FeeCheckInput {
  rawTransaction: string;
  /**
   * User-selected fee rate in sat/vByte, or null for network default. Accepts
   * a string because it arrives from a form field; coerced internally so a
   * caller passing the raw value can't silently disable the bound.
   */
  userFeeRate: number | string | null;
}

export interface FeeCheckResult {
  ok: boolean;
  error?: string;
  /** The miner fee implied by inputs minus outputs. */
  computedFee?: number;
}

/** Resolves "txid:vout" → satoshi value for inputs the compose response did not cover. */
export type InputValueResolver = (
  inputs: Array<{ txid: string; vout: number }>
) => Promise<Map<string, number>>;

/**
 * Rough signed vsize: the (unsigned) serialized size plus a signature
 * allowance per input large enough to cover a legacy P2PKH scriptSig (~107 B),
 * so the estimate is never below the real signed size and the fee bound never
 * falsely rejects a legitimate transaction.
 */
function estimateVsize(tx: Transaction, rawBytesLength: number): number {
  const perInputSignatureAllowance = 110;
  return rawBytesLength + tx.inputsLength * perInputSignatureAllowance;
}

/**
 * Total input value in sats, always resolved independently of the compose response. A failure says
 * which kind it was, so the caller's error can distinguish a transaction whose inputs cannot be
 * read from a value lookup that did not answer.
 */
async function resolveInputsTotal(
  tx: Transaction,
  resolveInputValues: InputValueResolver
): Promise<{ total: bigint } | { failed: 'unreadable-inputs' | 'lookup' }> {
  const outpoints: Array<{ txid: string; vout: number }> = [];
  for (let i = 0; i < tx.inputsLength; i++) {
    const txInput = tx.getInput(i);
    // A missing outpoint half cannot be guessed: pricing a different prevout would bound the
    // fee against the wrong value.
    if (!txInput?.txid || txInput.index == null) return { failed: 'unreadable-inputs' };
    outpoints.push({ txid: bytesToHex(txInput.txid), vout: txInput.index });
  }
  if (outpoints.length === 0) return { failed: 'unreadable-inputs' };

  let resolved: Map<string, number>;
  try {
    resolved = await resolveInputValues(outpoints);
  } catch {
    return { failed: 'lookup' };
  }

  let total = 0n;
  for (const { txid, vout } of outpoints) {
    const value = resolved.get(`${txid}:${vout}`);
    // A partial answer cannot bound the fee; treat it as unresolved.
    if (value === undefined) return { failed: 'lookup' };
    total += BigInt(value);
  }
  return { total };
}

export async function checkTransactionFee(
  input: FeeCheckInput,
  resolveInputValues: InputValueResolver
): Promise<FeeCheckResult> {
  const { rawTransaction, userFeeRate } = input;

  let tx: Transaction;
  let rawBytes: Uint8Array;
  try {
    rawBytes = hexToBytes(rawTransaction);
    tx = Transaction.fromRaw(rawBytes, {
      allowUnknownInputs: true,
      allowUnknownOutputs: true,
      allowLegacyWitnessUtxo: true,
      disableScriptCheck: true,
    });
  } catch {
    // An unparseable transaction can't be signed either (the signer uses the
    // same parser), so it is not a drain risk — skip the fee check rather than
    // block, and let signing surface the real error.
    return { ok: true };
  }

  const inputsTotal = await resolveInputsTotal(tx, resolveInputValues);
  if ('failed' in inputsTotal) {
    return {
      ok: false,
      error: inputsTotal.failed === 'lookup'
        ? 'Could not establish this transaction\'s fee: the values of the inputs it spends could '
          + 'not be fetched. Check your connection and try again.'
        : 'Could not establish this transaction\'s fee: its inputs could not be read, so it was '
          + 'not accepted.',
    };
  }

  let outputsTotal = 0n;
  for (let i = 0; i < tx.outputsLength; i++) {
    outputsTotal += tx.getOutput(i)?.amount ?? 0n;
  }
  const fee = inputsTotal.total - outputsTotal;
  if (fee < 0n) {
    return { ok: false, error: 'Transaction outputs exceed inputs — refusing to sign.' };
  }
  // A fee is satoshis, so it fits a number exactly — but only while it really does.
  const computedFee = toSafeInteger(fee);
  if (computedFee === undefined) {
    return { ok: false, error: 'Transaction fee is out of range — refusing to sign.' };
  }

  const vsize = Math.max(1, estimateVsize(tx, rawBytes.length));
  const impliedRate = divide(computedFee, vsize);

  if (impliedRate.isGreaterThan(MAX_SANE_FEE_RATE)) {
    return {
      ok: false,
      error: `Transaction fee (${computedFee} sats, ~${roundDown(impliedRate).toFixed()} sat/vB) is abnormally high and was blocked.`,
      computedFee,
    };
  }

  // The rate arrives as a form string; a value that is not a number leaves the bound unapplied
  // rather than silently becoming zero.
  const rate = toFiniteNumber(userFeeRate);
  if (rate !== undefined && rate > 0) {
    const bound = maximum(MIN_BOUND_SATS, roundUp(multiply(multiply(rate, vsize), USER_FEE_RATE_TOLERANCE)));
    if (bound.isLessThan(computedFee)) {
      return {
        ok: false,
        error: `Transaction fee (${computedFee} sats) far exceeds your selected rate of ${rate} sat/vB.`,
        computedFee,
      };
    }
  }

  return { ok: true, computedFee };
}
