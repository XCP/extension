/** Pure transaction transforms and checks for linked PSBT bundles; no signing or delivery state. */
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { parsePSBT } from '@/core/bitcoin/psbt';
import type { PsbtBundleKind } from '@/core/bitcoin/psbtBundleTypes';

export interface DependentListingOutpoint {
  txid: string;
  vout: number;
}

const txidHex = (value: string, label: string): string => {
  const normalized = value.toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(normalized)) throw new Error(`${label} must be 32-byte hex`);
  return normalized;
};

export const unsignedTransactionHex = (psbtHex: string): string =>
  bytesToHex(parsePSBT(psbtHex).toBytes(true, false));

/**
 * Bundle kinds whose later items spend the first item's outputs before it is broadcast, and whose
 * review proved that spend against the first item's own bytes. (attach-and-list is not one: its
 * listing is rebound to the signed attach, which then travels as the input's nonWitnessUtxo.)
 */
export const bundleSpendsItsParent = (kind: PsbtBundleKind): boolean =>
  kind === 'acceptance-cpfp' || kind === 'fund-and-authorize-offers';

/**
 * The unsigned bytes of a bundle's first transaction, keyed by its txid, for the later items that
 * spend its outputs before it is broadcast. The prevout check hashes these bytes and binds them to
 * each input's txid. Unsigned bytes carry the final txid only when every parent input is P2WPKH or
 * P2TR (a scriptSig is part of the txid), so review refuses any other parent.
 */
export function packageParentOf(parentPsbtHex: string): Record<string, string> {
  return { [parsePSBT(parentPsbtHex).id]: unsignedTransactionHex(parentPsbtHex) };
}

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

/** Refuse a listing parent that was not the attach transaction reviewed in this bundle. */
export function assertReviewedAttachTransaction(attachPsbtHex: string, expectedTxid: string): void {
  // The listing was proved against the attach's own unsigned bytes, never against a claimed txid.
  // Refuse to rebind unless the outpoint being replaced is exactly that reviewed attach output.
  if (parsePSBT(attachPsbtHex).id !== txidHex(expectedTxid, 'expected attach txid')) {
    throw new Error('attach-and-list outpoint is not the reviewed attach transaction');
  }
}
