import { normalizeAddressForComparison } from '@/utils/blockchain/bitcoin/address';

export interface MovementDestination {
  /** Destination address, or null if the decode couldn't resolve it. */
  address: string | null;
  /** Value in sats. */
  value: number;
}

export interface MoneyMovement {
  /** Sats spent from your addresses. */
  spent: number;
  /** Sats returned to your addresses that the signature commits to — change you are promised. */
  backToYou: number;
  /**
   * Sats sent back to your addresses that the signature does *not* commit to. Whoever completes the
   * transaction can redirect these and the signature still verifies, so this is money you may not
   * keep. Non-zero only under a sighash that leaves outputs free (SINGLE|ANYONECANPAY).
   */
  atRisk: number;
  /** Outputs to addresses that aren't yours (OP_RETURN excluded). */
  external: MovementDestination[];
  /** Network fee in sats. */
  fee: number;
  /** Net change to your balance in sats: positive = you receive, negative = you send. */
  net: number;
  /**
   * True if an input/output value or an input address couldn't be resolved, so
   * `net`/`spent` are not fully reliable and the UI should say so rather than
   * present a confident number.
   */
  incomplete: boolean;
}

interface MovementInput {
  address?: string;
  value?: number;
}
interface MovementOutput {
  address?: string;
  value: number;
  type?: string;
}

/**
 * Compute the net effect of a transaction on the signer's wallet, structurally
 * (no heuristics): what leaves your addresses, what returns as change, and what
 * goes to others. Works for any transaction shape — plain sends, atomic swaps,
 * multi-party — because it is computed relative to your addresses, not the tx's
 * form. This is the anti-blind-signing summary: it answers "what leaves my
 * wallet, and to whom?".
 */
export function computeMoneyMovement(params: {
  inputs: MovementInput[];
  outputs: MovementOutput[];
  /** Your address(es) — active plus any paired signer. */
  myAddresses: string[];
  /** Network fee in sats. */
  fee: number;
  /**
   * Output indices the signature commits to (see `committedOutputIndices`); omit when every output
   * is committed. An uncommitted output back to you is reported as at-risk, not counted as change.
   */
  committedOutputs?: Set<number> | null;
}): MoneyMovement {
  const mine = new Set(params.myAddresses.map(normalizeAddressForComparison));
  const isMine = (address?: string) =>
    address != null && mine.has(normalizeAddressForComparison(address));

  let spent = 0;
  let backToYou = 0;
  let incomplete = false;

  for (const input of params.inputs) {
    // An input with no address can't be classified; one with no value can't be summed.
    if (input.address === undefined || input.value === undefined) {
      incomplete = true;
      continue;
    }
    if (isMine(input.address)) spent += input.value;
  }

  const external: MovementDestination[] = [];
  let atRisk = 0;
  params.outputs.forEach((output, index) => {
    if (output.type === 'op_return') return; // data, not money movement
    const committed = !params.committedOutputs || params.committedOutputs.has(index);
    if (isMine(output.address)) {
      // Only a committed output is change you are promised; an uncommitted one can be repointed by
      // whoever completes the transaction.
      if (committed) backToYou += output.value;
      else atRisk += output.value;
    } else {
      // An output with no resolvable address can't be classified as yours or theirs, so the totals
      // below are a lower bound on what comes back to you.
      if (output.address === undefined) incomplete = true;
      // Already leaving either way, so not also counted as at-risk.
      external.push({ address: output.address ?? null, value: output.value });
    }
  });

  return {
    spent,
    backToYou,
    external,
    fee: params.fee,
    net: backToYou - spent,
    atRisk,
    incomplete,
  };
}
