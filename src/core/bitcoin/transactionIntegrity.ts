import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { Transaction } from '@scure/btc-signer';
import { SigningError } from '@/core/errors';

/** Parse bytes for comparison without rejecting Counterparty's nonstandard output scripts. */
export function parseTransactionForIntegrity(rawTxHex: string): Transaction {
  return Transaction.fromRaw(hexToBytes(rawTxHex), {
    allowUnknownInputs: true,
    allowUnknownOutputs: true,
    disableScriptCheck: true,
  });
}

/**
 * A signer may add scriptSig and witness data, but must preserve everything else the user
 * reviewed. Comparing the unsigned serialization covers version, locktime, every outpoint and
 * sequence, and every output's script and amount. This applies to PSBT conversion, software
 * reconstruction and hardware responses alike, rather than maintaining a list in each adapter.
 */
export function assertTransactionMatchesReviewed(candidate: Transaction, reviewed: Transaction): void {
  if (bytesToHex(candidate.unsignedTx) !== bytesToHex(reviewed.unsignedTx)) {
    throw new SigningError('The transaction differs from the reviewed transaction', {
      userMessage: 'The transaction changed while being prepared or signed. No result was accepted.',
    });
  }
}
