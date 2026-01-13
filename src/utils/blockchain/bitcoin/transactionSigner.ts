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
      return p2pkh(pubkeyBytes);
    case AddressFormat.P2WPKH:
    case AddressFormat.CounterwalletSegwit:
      return p2wpkh(pubkeyBytes);
    case AddressFormat.P2SH_P2WPKH:
      return p2sh(p2wpkh(pubkeyBytes));
    case AddressFormat.P2TR:
      return p2tr(pubkeyBytes);
    default:
      throw new ValidationError('INVALID_ADDRESS', `Unsupported address type: ${addressFormat}`);
  }
}

export async function signTransaction(
  rawTransaction: string,
  wallet: Wallet,
  targetAddress: Address,
  privateKeyHex: string,
  compressed: boolean = true
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

    // Retry fetching UTXOs with a small delay to handle timing issues
    let utxos = await fetchUTXOs(targetAddress.address);
    if (!utxos || utxos.length === 0) {
      // Wait a bit and retry once
      await new Promise(resolve => setTimeout(resolve, 1000));
      utxos = await fetchUTXOs(targetAddress.address);
      if (!utxos || utxos.length === 0) {
        throw new UtxoError('NO_UTXOS', 'No UTXOs found for the source address after retry', {
          address: targetAddress.address,
          userMessage: 'No spendable funds found for this address. Please ensure the address has confirmed transactions.',
        });
      }
    }

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

    const prevOutputScripts: Uint8Array[] = [];

    for (let i = 0; i < parsedTx.inputsLength; i++) {
      const input = parsedTx.getInput(i);
      if (!input?.txid || input.index === undefined) {
        throw new ValidationError('INVALID_TRANSACTION', `Invalid input at index ${i}: missing txid or index`);
      }
      const txidHex = bytesToHex(input.txid);
      let utxo = getUtxoByTxid(utxos, txidHex, input.index);

      // If UTXO not found, try fetching fresh UTXOs once
      if (!utxo) {
        console.warn(`UTXO not found for input ${i}: ${txidHex}:${input.index}, retrying...`);
        await new Promise(resolve => setTimeout(resolve, 1000));
        const freshUtxos = await fetchUTXOs(targetAddress.address);
        if (freshUtxos && freshUtxos.length > 0) {
          utxo = getUtxoByTxid(freshUtxos, txidHex, input.index);
          if (utxo) {
            // Update the utxos array with fresh data
            utxos.push(...freshUtxos.filter(u => !utxos.some(existing =>
              existing.txid === u.txid && existing.vout === u.vout
            )));
          }
        }
      }

      if (!utxo) {
        throw new UtxoError('UTXO_NOT_FOUND', `UTXO not found for input ${i}: ${txidHex}:${input.index}`, {
          txid: txidHex,
          userMessage: 'Transaction input could not be found. The funds may have already been spent.',
        });
      }
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

      if (prevOutput.script) {
        prevOutputScripts.push(prevOutput.script);
      }

      const inputData: TransactionInputData = {
        txid: input.txid,
        index: input.index,
        sequence: 0xfffffffd,
        sighashType: SigHash.ALL,
      };
      if (wallet.addressFormat === AddressFormat.P2PKH || wallet.addressFormat === AddressFormat.Counterwallet) {
        inputData.nonWitnessUtxo = hexToBytes(rawPrevTx);
      } else {
        // SegWit inputs require both script and amount
        if (!prevOutput.script || prevOutput.amount === undefined) {
          throw new ValidationError('INVALID_TRANSACTION', `Missing script or amount in previous output for input ${i}`);
        }
        inputData.witnessUtxo = {
          script: prevOutput.script,
          amount: prevOutput.amount,
        };
        if (wallet.addressFormat === AddressFormat.P2SH_P2WPKH) {
          // Generate redeem script for nested SegWit
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
