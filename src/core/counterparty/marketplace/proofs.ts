/** Checks shared by every marketplace intent analyzer. */

import type { InputLike, MarketplaceBlockKind, MarketplaceOutpointClaim } from '@/core/counterparty/marketplace/intentTypes';
import {
  POLICY_OFFER_LOCKTIME,
  POLICY_OFFER_PROTOCOL_VERSION,
  POLICY_OFFER_TX_VERSION,
} from '@/core/counterparty/policyOffer';

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
    && (transactionVersion !== POLICY_OFFER_TX_VERSION || lockTime !== POLICY_OFFER_LOCKTIME)
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
