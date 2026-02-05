import { Transaction, RawTx, OutScript } from '@scure/btc-signer';
import { hexToBytes } from '@noble/hashes/utils.js';
import { getPublicKey } from '@noble/secp256k1';
import { hybridSignTransaction } from '@/utils/blockchain/bitcoin/uncompressedSigner';
import { signWithBareMultisigOutputs } from '@/utils/blockchain/bitcoin/multisigOutputs';
import { prepareInputs } from '@/utils/blockchain/bitcoin/prepareInputs';
import { AddressFormat } from '@/utils/blockchain/bitcoin/address';
import { SigningError, ValidationError } from '@/utils/blockchain/errors';
import type { Wallet, Address } from '@/types/wallet';

/**
 * Sign a Bitcoin transaction.
 *
 * For SegWit transactions, can optionally use API-provided input data (inputValues + lockScripts)
 * to avoid fetching previous transactions from the network. This is more efficient and reduces
 * dependency on mempool.space availability.
 *
 * For Legacy P2PKH transactions, always fetches previous transactions (needed for nonWitnessUtxo).
 *
 * @param rawTransaction - Raw transaction hex to sign
 * @param wallet - Wallet containing address format info
 * @param targetAddress - Address to sign with
 * @param privateKeyHex - Private key in hex format
 * @param compressed - Whether to use compressed public key (default: true)
 * @param inputValues - Optional array of input values in satoshis (from Counterparty API inputs_values)
 * @param lockScripts - Optional array of input lock scripts in hex (from Counterparty API lock_scripts)
 * @returns Signed transaction hex
 */
export async function signTransaction(
  rawTransaction: string,
  wallet: Wallet,
  targetAddress: Address,
  privateKeyHex: string,
  compressed: boolean = true,
  inputValues?: number[],
  lockScripts?: string[]
): Promise<string> {
  if (!wallet) {
    throw new ValidationError('INVALID_TRANSACTION', 'Wallet not provided');
  }
  if (!targetAddress) {
    throw new ValidationError('INVALID_ADDRESS', 'Target address not provided');
  }

  const privateKeyBytes = hexToBytes(privateKeyHex);

  try {
    const pubkeyBytes = getPublicKey(privateKeyBytes, compressed);

    // Detect bare multisig output scripts before any network fetches.
    // btc-signer rejects these via checkScript ("non-wrapped ms"),
    // so route to a dedicated signing path that bypasses that validation.
    const rawTxBytes = hexToBytes(rawTransaction);
    const rawParsed = RawTx.decode(rawTxBytes);
    const hasBareMultisigOutput = rawParsed.outputs.some(o => {
      try {
        const decoded = OutScript.decode(o.script);
        return decoded.type === 'ms' || decoded.type === 'tr_ms';
      } catch {
        return false;
      }
    });
    if (hasBareMultisigOutput) {
      return signWithBareMultisigOutputs(
        rawTransaction, wallet, targetAddress, privateKeyHex, compressed,
        inputValues, lockScripts
      );
    }

    const parsedTx = Transaction.fromRaw(rawTxBytes, {
      allowUnknownInputs: true,
      allowUnknownOutputs: true,
      allowLegacyWitnessUtxo: true,
      disableScriptCheck: true
    });
    const tx = new Transaction({
      allowUnknownInputs: true,
      allowUnknownOutputs: true,
      allowLegacyWitnessUtxo: true,
      disableScriptCheck: true,
      allowUnknown: true
    });

    // Extract inputs from parsedTx
    const inputs: Array<{ txid: Uint8Array; index: number }> = [];
    for (let i = 0; i < parsedTx.inputsLength; i++) {
      const input = parsedTx.getInput(i);
      if (!input?.txid || input.index === undefined) {
        throw new ValidationError('INVALID_TRANSACTION', `Invalid input at index ${i}: missing txid or index`);
      }
      inputs.push({ txid: input.txid, index: input.index });
    }

    const prevOutputScripts = await prepareInputs(
      tx, inputs, wallet, targetAddress, pubkeyBytes,
      inputValues, lockScripts
    );

    for (let i = 0; i < parsedTx.outputsLength; i++) {
      const output = parsedTx.getOutput(i);
      tx.addOutput({
        script: output.script,
        amount: output.amount,
      });
    }

    // Sign and finalize the transaction
    try {
      if (!compressed && (wallet.addressFormat === AddressFormat.P2PKH || wallet.addressFormat === AddressFormat.Counterwallet)) {
        // Uncompressed P2PKH - use hybrid signing approach
        const compressedPubkey = getPublicKey(privateKeyBytes, true);
        hybridSignTransaction(
          tx,
          privateKeyBytes,
          compressedPubkey,
          pubkeyBytes, // uncompressed pubkey
          prevOutputScripts,
          () => true // All inputs need uncompressed signing in this case
        );
      } else {
        // Standard signing for all compressed keys
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
    // Zero out private key bytes after use (defense in depth)
    // See ADR-001 in sessionManager.ts for JS memory limitation context
    privateKeyBytes.fill(0);
  }
}
