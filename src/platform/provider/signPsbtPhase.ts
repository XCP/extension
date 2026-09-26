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

export interface DependentListingOutpoint {
  txid: string;
  vout: number;
}

const txidHex = (value: string, label: string): string => {
  const normalized = value.toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(normalized)) throw new Error(`${label} must be 32-byte hex`);
  return normalized;
};

const unsignedTransactionHex = (psbtHex: string): string =>
  bytesToHex(parsePSBT(psbtHex).toBytes(true, false));

/** Replace only the dependent listing's asset-input parent after a Legacy attach is signed. */
export function rebindDependentListingPsbt(
  listingPsbtHex: string,
  expectedOutpoint: DependentListingOutpoint,
  finalAttachTxid: string,
  finalAttachRawTx?: string,
): string {
  const transaction = parsePSBT(listingPsbtHex);
  if (transaction.inputsLength !== 2 || transaction.outputsLength !== 2) {
    throw new Error('dependent listing must remain a 2-input/2-output authorization');
  }
  const assetInput = transaction.getInput(1);
  if (
    !assetInput?.txid
    || bytesToHex(assetInput.txid) !== txidHex(expectedOutpoint.txid, 'expected attach txid')
    || assetInput.index !== expectedOutpoint.vout
  ) {
    throw new Error('dependent listing does not spend the reviewed attach outpoint');
  }
  if (
    assetInput.partialSig?.length
    || assetInput.tapKeySig
    || assetInput.finalScriptSig?.length
    || assetInput.finalScriptWitness?.length
  ) {
    throw new Error('dependent listing asset input must be unsigned before rebinding');
  }
  transaction.updateInput(1, {
    txid: hexToBytes(txidHex(finalAttachTxid, 'final attach txid')),
    // Package children cannot fetch an unbroadcast parent. Carry the exact signed parent so the
    // wallet can verify this input independently when the listing reaches its signing boundary.
    ...(finalAttachRawTx ? { nonWitnessUtxo: hexToBytes(finalAttachRawTx) } : {}),
  }, true);
  return bytesToHex(transaction.toPSBT());
}

import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { finalizePSBT, parsePSBT } from '@/core/bitcoin/psbt';
import { computeTxid } from '@/core/bitcoin/transactionBroadcaster';

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
  // The listing was proved against the attach's own unsigned bytes, never against a claimed txid.
  // Refuse to rebind unless the outpoint being replaced is exactly that reviewed attach output.
  if (parsePSBT(attach.psbtHex).id !== txidHex(expectedOutpoint.txid, 'expected attach txid')) {
    throw new Error('attach-and-list outpoint is not the reviewed attach transaction');
  }

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
