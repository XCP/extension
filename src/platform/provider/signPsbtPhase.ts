import { finalizePSBT, parsePSBT } from '@/core/bitcoin/psbt';
import {
  assertReviewedAttachTransaction,
  type DependentListingOutpoint,
  rebindDependentListingPsbt,
  unsignedTransactionHex,
} from '@/core/bitcoin/psbtBundleTransactions';
import { computeTxid } from '@/core/bitcoin/transactionBroadcaster';
import { MAX_MARKETPLACE_BATCH_REQUESTS } from '@/core/counterparty/marketplaceBatch';

/**
 * Sign one already-proved phase in order, but disclose results only as a complete set.
 * Earlier signatures may exist in local memory if a later signer fails; callers cannot
 * observe them because the result array is returned only after every call completes.
 */
export async function signPsbtPhaseForDelivery<T>(
  items: T[],
  sign: (item: T, index: number) => Promise<string>,
  /** The phase kind's own bound (maxMarketplaceBatchRequests); 8 unless the kind allows more. */
  maxItems = MAX_MARKETPLACE_BATCH_REQUESTS,
): Promise<string[]> {
  if (items.length < 1 || items.length > maxItems) {
    throw new Error(`PSBT signing phase must contain 1..${maxItems} transactions`);
  }
  const results: string[] = [];
  for (const [index, item] of items.entries()) {
    results.push(await sign(item, index));
  }
  return results;
}

/**
 * Sign an offer funding and then the authorizations that spend one of its outputs, in one approved
 * decision. The authorizations commit to the funding's txid, so the funding is signed first and
 * must finalize to exactly the reviewed txid (the review admitted only P2WPKH and P2TR funding
 * inputs, whose signatures are witness data); any difference stops before a single authorization
 * is signed. Results are disclosed only as a complete set.
 */
export async function signFundAndAuthorizationsForDelivery<T extends { psbtHex: string }>(
  items: T[],
  sign: (item: T, index: number) => Promise<string>,
): Promise<string[]> {
  if (items.length < 2 || items.length > MAX_MARKETPLACE_BATCH_REQUESTS) {
    throw new Error(`fund-and-authorize-offers must contain 2..${MAX_MARKETPLACE_BATCH_REQUESTS} transactions`);
  }
  const [fund, ...authorizations] = items as [T, ...T[]];
  const signedFund = await sign(fund, 0);
  if (unsignedTransactionHex(signedFund) !== unsignedTransactionHex(fund.psbtHex)) {
    throw new Error('offer funding signer changed the reviewed transaction');
  }
  if (computeTxid(finalizePSBT(signedFund)) !== parsePSBT(fund.psbtHex).id) {
    throw new Error('the signed offer funding does not have the txid its authorizations spend');
  }
  const results = [signedFund];
  for (const [index, authorization] of authorizations.entries()) {
    results.push(await sign(authorization, index + 1));
  }
  return results;
}

/**
 * Sign one attach and its listing in a single approved decision. The listing is rebound only after
 * the fully signed attach establishes its final txid, which is essential for a Legacy source.
 */
export async function signAttachAndListingForDelivery<T extends { psbtHex: string }>(
  items: T[],
  expectedOutpoint: DependentListingOutpoint,
  sign: (item: T, index: number) => Promise<string>,
): Promise<string[]> {
  if (items.length !== 2) throw new Error('attach-and-list requires exactly two transactions');
  const attach = items[0]!;
  const listing = items[1]!;
  assertReviewedAttachTransaction(attach.psbtHex, expectedOutpoint.txid);

  const signedAttach = await sign(attach, 0);
  if (unsignedTransactionHex(signedAttach) !== unsignedTransactionHex(attach.psbtHex)) {
    throw new Error('attach signer changed the reviewed transaction');
  }
  const finalAttachRawTx = finalizePSBT(signedAttach);
  const finalAttachTxid = computeTxid(finalAttachRawTx);
  if (!finalAttachTxid) throw new Error('wallet could not derive the signed attach transaction id');

  const reboundListing = rebindDependentListingPsbt(
    listing.psbtHex,
    expectedOutpoint,
    finalAttachTxid,
    finalAttachRawTx,
  );
  const signedListing = await sign({ ...listing, psbtHex: reboundListing }, 1);
  if (unsignedTransactionHex(signedListing) !== unsignedTransactionHex(reboundListing)) {
    throw new Error('listing signer changed the resolved transaction');
  }
  return [signedAttach, signedListing];
}
