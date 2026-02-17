import { Transaction, p2pkh, p2wpkh, p2sh, p2tr, SigHash } from '@scure/btc-signer';
import { hexToBytes, bytesToHex } from '@noble/hashes/utils.js';
import { getPublicKey } from '@noble/secp256k1';
import { fetchUTXOs, getUtxoByTxid, fetchPreviousRawTransaction } from '@/utils/blockchain/bitcoin/utxo';
import { hybridSignTransaction } from '@/utils/blockchain/bitcoin/uncompressedSigner';
import { AddressFormat } from '@/utils/blockchain/bitcoin/address';
import { UtxoError, SigningError, ValidationError } from '@/utils/blockchain/errors';
import type { Wallet, Address } from '@/types/wallet';

/**
 * Transaction input data for signing.
 * Supports both legacy (nonWitnessUtxo) and SegWit (witnessUtxo) inputs.
 */
interface TransactionInputData {
  txid: Uint8Array;
  index: number;
  sequence: number;
  sighashType: number;
  /** Full previous transaction for legacy P2PKH inputs */
  nonWitnessUtxo?: Uint8Array;
  /** Previous output for SegWit inputs (both script and amount required) */
  witnessUtxo?: {
    script: Uint8Array;
    amount: bigint;
  };
  /** Redeem script for P2SH-P2WPKH (nested SegWit) */
  redeemScript?: Uint8Array;
}

function paymentScript(pubkeyBytes: Uint8Array, addressFormat: AddressFormat) {
  switch (addressFormat) {
    case AddressFormat.P2PKH:
    case AddressFormat.Counterwallet:
    case AddressFormat.FreewalletBIP39:
      return p2pkh(pubkeyBytes);
    case AddressFormat.P2WPKH:
    case AddressFormat.CounterwalletSegwit:
    case AddressFormat.FreewalletBIP39Segwit:
      return p2wpkh(pubkeyBytes);
    case AddressFormat.P2SH_P2WPKH:
      return p2sh(p2wpkh(pubkeyBytes));
    case AddressFormat.P2TR:
      return p2tr(pubkeyBytes);
    default:
      throw new ValidationError('INVALID_ADDRESS', `Unsupported address type: ${addressFormat}`);
  }
}

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

    // Determine if this is a legacy (non-SegWit) wallet
    const isLegacy = wallet.addressFormat === AddressFormat.P2PKH ||
                     wallet.addressFormat === AddressFormat.Counterwallet ||
                     wallet.addressFormat === AddressFormat.FreewalletBIP39;

    // Can use API-provided data for SegWit when available (avoids N network fetches)
    const hasApiData = inputValues && lockScripts &&
                       inputValues.length > 0 && lockScripts.length > 0;

    // Fetch UTXOs only when needed (legacy always needs it, SegWit only without API data)
    // When API data is provided, it's fresh from the compose call - no need to re-verify
    const needsUtxoFetch = isLegacy || !hasApiData;
    const utxos = needsUtxoFetch ? await fetchUTXOs(targetAddress.address) : [];

    const rawTxBytes = hexToBytes(rawTransaction);
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

    // For legacy uncompressed key signing, we need previous output scripts
    const prevOutputScripts: Uint8Array[] = [];

    // Validate API data length matches input count (if using API data)
    if (hasApiData && !isLegacy) {
      if (inputValues.length !== parsedTx.inputsLength) {
        throw new ValidationError(
          'INVALID_TRANSACTION',
          `Input values count (${inputValues.length}) doesn't match transaction inputs (${parsedTx.inputsLength})`
        );
      }
      if (lockScripts.length !== parsedTx.inputsLength) {
        throw new ValidationError(
          'INVALID_TRANSACTION',
          `Lock scripts count (${lockScripts.length}) doesn't match transaction inputs (${parsedTx.inputsLength})`
        );
      }
    }

    for (let i = 0; i < parsedTx.inputsLength; i++) {
      const input = parsedTx.getInput(i);
      if (!input?.txid || input.index === undefined) {
        throw new ValidationError('INVALID_TRANSACTION', `Invalid input at index ${i}: missing txid or index`);
      }
      const txidHex = bytesToHex(input.txid);

      // Verify UTXO exists when we fetched UTXOs (legacy or no API data)
      // Skip check when using API data - it's fresh from the compose call
      if (needsUtxoFetch) {
        const utxo = getUtxoByTxid(utxos, txidHex, input.index);
        if (!utxo) {
          throw new UtxoError('UTXO_NOT_FOUND', `UTXO not found for input ${i}: ${txidHex}:${input.index}`, {
            txid: txidHex,
            userMessage: 'Transaction input not found. Please go back and try again.',
          });
        }
      }

      const inputData: TransactionInputData = {
        txid: input.txid,
        index: input.index,
        sequence: 0xfffffffd,
        sighashType: SigHash.ALL,
      };

      if (isLegacy) {
        // Legacy P2PKH needs full previous transaction for nonWitnessUtxo
        const rawPrevTx = await fetchPreviousRawTransaction(txidHex);
        if (!rawPrevTx) {
          throw new UtxoError('UTXO_NOT_FOUND', `Failed to fetch previous transaction: ${txidHex}`, {
            txid: txidHex,
            userMessage: 'Could not retrieve transaction data from the network. Please try again.',
          });
        }
        const prevTx = Transaction.fromRaw(hexToBytes(rawPrevTx), { allowUnknownInputs: true, allowUnknownOutputs: true });
        const prevOutput = prevTx.getOutput(input.index);
        if (!prevOutput) {
          throw new UtxoError('UTXO_NOT_FOUND', `Output not found in previous transaction: ${txidHex}:${input.index}`, {
            txid: txidHex,
            userMessage: 'Transaction output not found. The transaction data may be incomplete.',
          });
        }

        inputData.nonWitnessUtxo = hexToBytes(rawPrevTx);
        if (prevOutput.script) {
          prevOutputScripts.push(prevOutput.script);
        }
      } else if (hasApiData) {
        // SegWit with API-provided data - use directly, no fetch needed
        // This is more efficient: avoids N network requests for N inputs
        inputData.witnessUtxo = {
          script: hexToBytes(lockScripts[i]),
          amount: BigInt(inputValues[i]),
        };
        if (wallet.addressFormat === AddressFormat.P2SH_P2WPKH) {
          // Generate redeem script for nested SegWit
          const redeemScript = p2wpkh(pubkeyBytes).script;
          if (redeemScript) {
            inputData.redeemScript = redeemScript;
          }
        }
      } else {
        // SegWit without API data - fetch previous transaction (fallback)
        const rawPrevTx = await fetchPreviousRawTransaction(txidHex);
        if (!rawPrevTx) {
          throw new UtxoError('UTXO_NOT_FOUND', `Failed to fetch previous transaction: ${txidHex}`, {
            txid: txidHex,
            userMessage: 'Could not retrieve transaction data from the network. Please try again.',
          });
        }
        const prevTx = Transaction.fromRaw(hexToBytes(rawPrevTx), { allowUnknownInputs: true, allowUnknownOutputs: true });
        const prevOutput = prevTx.getOutput(input.index);
        if (!prevOutput) {
          throw new UtxoError('UTXO_NOT_FOUND', `Output not found in previous transaction: ${txidHex}:${input.index}`, {
            txid: txidHex,
            userMessage: 'Transaction output not found. The transaction data may be incomplete.',
          });
        }

        if (!prevOutput.script || prevOutput.amount === undefined) {
          throw new ValidationError('INVALID_TRANSACTION', `Missing script or amount in previous output for input ${i}`);
        }
        inputData.witnessUtxo = {
          script: prevOutput.script,
          amount: prevOutput.amount,
        };
        if (wallet.addressFormat === AddressFormat.P2SH_P2WPKH) {
          const redeemScript = p2wpkh(pubkeyBytes).script;
          if (redeemScript) {
            inputData.redeemScript = redeemScript;
          }
        }
      }

      tx.addInput(inputData);
    }

    for (let i = 0; i < parsedTx.outputsLength; i++) {
      const output = parsedTx.getOutput(i);
      tx.addOutput({
        script: output.script,
        amount: output.amount,
      });
    }

    // Sign and finalize the transaction
    try {
      if (!compressed && (wallet.addressFormat === AddressFormat.P2PKH || wallet.addressFormat === AddressFormat.Counterwallet || wallet.addressFormat === AddressFormat.FreewalletBIP39)) {
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
