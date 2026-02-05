/**
 * Signing path for transactions with bare multisig output scripts.
 *
 * btc-signer's Transaction class rejects bare multisig in output scripts
 * via checkScript() ("non-wrapped ms"). This module bypasses that by using
 * RawTx.decode() for low-level parsing and pushing outputs directly to the
 * Transaction outputs array.
 *
 * Same pattern as consolidateBatch.ts / multisigSigner.ts which bypass
 * btc-signer's validation for bare multisig inputs.
 *
 * Used when bare multisig output scripts are detected.
 */

import { Transaction, RawTx } from '@scure/btc-signer';
import { hexToBytes } from '@noble/hashes/utils.js';
import { getPublicKey } from '@noble/secp256k1';
import { hybridSignTransaction } from '@/utils/blockchain/bitcoin/uncompressedSigner';
import { prepareInputs } from '@/utils/blockchain/bitcoin/prepareInputs';
import { AddressFormat } from '@/utils/blockchain/bitcoin/address';
import { SigningError } from '@/utils/blockchain/errors';
import type { Wallet, Address } from '@/types/wallet';

/**
 * Sign a transaction that contains bare multisig output scripts.
 *
 * Uses RawTx.decode() instead of Transaction.fromRaw() to avoid btc-signer's
 * script validation, then pushes bare multisig outputs directly to bypass
 * checkScript().
 */
export async function signWithBareMultisigOutputs(
  rawTransaction: string,
  wallet: Wallet,
  targetAddress: Address,
  privateKeyHex: string,
  compressed: boolean,
  inputValues?: number[],
  lockScripts?: string[],
): Promise<string> {
  const privateKeyBytes = hexToBytes(privateKeyHex);

  try {
    const pubkeyBytes = getPublicKey(privateKeyBytes, compressed);

    // Low-level parse — no script validation
    const rawTxBytes = hexToBytes(rawTransaction);
    const parsed = RawTx.decode(rawTxBytes);

    const tx = new Transaction({
      allowUnknownInputs: true,
      allowUnknownOutputs: true,
      allowLegacyWitnessUtxo: true,
      disableScriptCheck: true,
      allowUnknown: true,
      version: parsed.version,
      lockTime: parsed.lockTime,
    });

    const prevOutputScripts = await prepareInputs(
      tx, parsed.inputs, wallet, targetAddress, pubkeyBytes,
      inputValues, lockScripts
    );

    // Bypass addOutput() entirely — assign raw outputs directly.
    // This skips normalizeOutput() and checkScript(), which reject bare multisig.
    // Same pattern as Transaction.fromRaw() (transaction.js:324: tx.outputs = parsed.outputs).
    (tx as any).outputs = parsed.outputs;

    // Sign and finalize
    try {
      if (!compressed && (wallet.addressFormat === AddressFormat.P2PKH || wallet.addressFormat === AddressFormat.Counterwallet)) {
        const compressedPubkey = getPublicKey(privateKeyBytes, true);
        hybridSignTransaction(
          tx, privateKeyBytes, compressedPubkey, pubkeyBytes,
          prevOutputScripts, () => true
        );
      } else {
        tx.sign(privateKeyBytes);
      }
      tx.finalize();
    } catch (err) {
      throw new SigningError(
        err instanceof Error ? err.message : 'Unknown signing error',
        {
          userMessage: 'Failed to sign the transaction. Please try again.',
          cause: err instanceof Error ? err : undefined,
        }
      );
    }

    return tx.hex;
  } finally {
    privateKeyBytes.fill(0);
  }
}
