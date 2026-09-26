/** Checks shared by every marketplace intent analyzer. */

import type { InputAttachedAssets } from '@/core/counterparty/inputAssets';
import type {
  InputLike,
  MarketplaceBlockKind,
  MarketplaceOutpointClaim,
} from '@/core/counterparty/marketplace/intentTypes';
import {
  POLICY_OFFER_LOCKTIME,
  POLICY_OFFER_PROTOCOL_VERSION,
  POLICY_OFFER_TX_VERSION,
} from '@/core/counterparty/policyOffer';

/** A `funded_policy_offer_v1` parent or child header: TRUC version 3, locktime 0. */
export const isPolicyOfferHeader = (
  transactionVersion: number | undefined,
  lockTime: number | undefined,
): boolean => transactionVersion === POLICY_OFFER_TX_VERSION && lockTime === POLICY_OFFER_LOCKTIME;

/**
 * Enforce transaction-header invariants that belong to the marketplace protocol itself.
 * These values are decoded from the PSBT and are never trusted from the requesting site.
 * A future zero-fee TRUC offer protocol must declare and validate its v3 parent/child shape
 * separately; exact_offer_v1 deliberately remains version 2 with locktime 0.
 */
export function marketplaceTransactionHeaderProblem(
  intent: { action: string; protocolVersion?: string },
  transactionVersion: number,
  lockTime: number,
): string | null {
  if (
    intent.protocolVersion === 'exact_offer_v1'
    && (transactionVersion !== 2 || lockTime !== 0)
  ) {
    return 'exact_offer_v1 requires Bitcoin transaction version 2 with locktime 0';
  }
  // A TRUC (BIP431) parent and child: a v2 child of the v3 parent is refused by every node.
  if (
    intent.protocolVersion === POLICY_OFFER_PROTOCOL_VERSION
    && !isPolicyOfferHeader(transactionVersion, lockTime)
  ) {
    return 'funded_policy_offer_v1 requires Bitcoin transaction version 3 with locktime 0';
  }
  return null;
}

/** A block whose every reason is the ledger disagreeing with the claimed asset: the listing changed. */
export const ledgerBlockKind = (blockers: string[], ledger: ReadonlySet<string>): { blockKind?: Extract<MarketplaceBlockKind, 'ledger'> } =>
  blockers.length > 0 && blockers.every(problem => ledger.has(problem)) ? { blockKind: 'ledger' } : {};

export const sameOutpoint = (
  input: InputLike | undefined,
  claim: MarketplaceOutpointClaim,
): boolean => input?.txid.toLowerCase() === claim.txid && input.vout === claim.vout;

export const safeSum = (values: number[]): number | null => {
  const sum = values.reduce((total, value) => total + value, 0);
  return Number.isSafeInteger(sum) ? sum : null;
};

/** Run one derivation; a site value that cannot even be parsed is the site's contradiction. */
export const attempt = <T>(blockers: string[], run: () => T): T | undefined => {
  try {
    return run();
  } catch (error) {
    blockers.push(error instanceof Error ? error.message : String(error));
    return undefined;
  }
};

/**
 * What one analyzer has found so far. `blockers` contradict the claim; `retry` are facts the wallet
 * could not establish yet. `ledger` marks the blockers that are only the ledger disagreeing with
 * the claimed asset (see `ledgerBlockKind`).
 */
export interface ProofLog {
  blockers: string[];
  retry: string[];
  ledger: Set<string>;
}

export const newProofLog = (): ProofLog => ({ blockers: [], retry: [], ledger: new Set() });

/** A blocker that is the ledger disagreeing with the claimed asset, not the transaction. */
export const blockOnLedger = (log: ProofLog, problem: string): void => {
  log.ledger.add(problem);
  log.blockers.push(problem);
};

/** Any blocker blocks; otherwise anything unestablished asks for a retry. */
export const reviewStatus = <Proved extends 'proved' | 'caution'>(
  log: Pick<ProofLog, 'blockers' | 'retry'>,
  proved: Proved,
): 'blocked' | 'retry' | Proved =>
  log.blockers.length > 0 ? 'blocked' : log.retry.length > 0 ? 'retry' : proved;

/** The unsigned transaction id the wallet computed must be the one the site claimed. */
export function proveTxidClaim(
  log: Pick<ProofLog, 'blockers' | 'retry'>,
  transactionId: string | undefined,
  claimedTxid: string,
  messages: { unknown: string; differs: string },
): void {
  if (!transactionId) {
    log.retry.push(messages.unknown);
  } else if (transactionId.toLowerCase() !== claimedTxid) {
    log.blockers.push(messages.differs);
  }
}

/**
 * The wallet signs exactly `expectedIndices` (ascending), each once, each with one of
 * `allowedSighashes`.
 */
export function signsExactly(
  signedInputs: ReadonlyArray<{ index: number; sighashType: number }>,
  expectedIndices: readonly number[],
  allowedSighashes: readonly number[],
): boolean {
  const sorted = [...signedInputs].sort((left, right) => left.index - right.index);
  return sorted.length === expectedIndices.length
    && sorted.every((signed, position) =>
      signed.index === expectedIndices[position] && allowedSighashes.includes(signed.sighashType))
    && new Set(signedInputs.map(signed => signed.index)).size === signedInputs.length;
}

/**
 * The actual miner fee — every authenticated input value less every output — equals the claim.
 * With any input value unknown the fee cannot be proven: `unauthenticated`, when given, is the
 * retry that says so (callers that already asked for a retry per input pass none).
 */
export function proveActualFee(
  log: Pick<ProofLog, 'blockers' | 'retry'>,
  inputValues: ReadonlyArray<number | undefined>,
  outputs: ReadonlyArray<{ value: number }>,
  claimedFeeSats: number,
  messages: { unauthenticated?: string; differs: string },
): void {
  if (inputValues.some(value => value === undefined)) {
    if (messages.unauthenticated !== undefined) log.retry.push(messages.unauthenticated);
    return;
  }
  const inputTotal = safeSum(inputValues as number[]);
  const outputTotal = safeSum(outputs.map(output => output.value));
  const actualFee = inputTotal === null || outputTotal === null ? null : inputTotal - outputTotal;
  if (actualFee === null || actualFee < 0 || actualFee !== claimedFeeSats) {
    log.blockers.push(messages.differs);
  }
}

export interface AttachedAssetMessages {
  lookupFailed: string;
  notExactlyOne: string;
  assetDiffers: string;
  noRawQuantity: string;
  quantityDiffers: string;
}

/** The messages for seller input `index`, as the exact-offer and policy-offer proofs word them. */
export const sellerInputAssetMessages = (index: number): AttachedAssetMessages => ({
  lookupFailed: `the attached-asset lookup for seller input ${index} failed`,
  notExactlyOne: `seller input ${index} does not independently resolve to exactly one attached asset`,
  assetDiffers: `seller input ${index} attached asset differs from the claim`,
  noRawQuantity: `seller input ${index} has no exact raw attached quantity`,
  quantityDiffers: `seller input ${index} raw attached quantity differs from the claim`,
});

/**
 * The input's ledger balance is exactly one attached asset: the claimed name, the claimed raw
 * quantity. Returns the ledger-normalized quantity once proved, for display, else null.
 */
export function proveAttachedAsset(
  log: ProofLog,
  balance: InputAttachedAssets | undefined,
  claim: { asset: string; quantityRaw: string },
  messages: AttachedAssetMessages,
): string | null {
  if (balance?.lookupFailed) {
    log.retry.push(messages.lookupFailed);
    return null;
  }
  if (!balance || balance.assets.length !== 1) {
    blockOnLedger(log, messages.notExactlyOne);
    return null;
  }
  const actual = balance.assets[0]!;
  if (actual.asset !== claim.asset) blockOnLedger(log, messages.assetDiffers);
  if (actual.quantity === undefined) {
    log.retry.push(messages.noRawQuantity);
    return null;
  }
  if (actual.quantity !== claim.quantityRaw) {
    blockOnLedger(log, messages.quantityDiffers);
    return null;
  }
  return actual.quantity_normalized;
}
