/**
 * Shared input preparation for transaction signing.
 *
 * Handles UTXO fetching/verification and attaches the correct signing data
 * (nonWitnessUtxo for legacy, witnessUtxo for SegWit) to each input.
 *
 * Used by both the standard signing path and the bare-multisig output path.
 */

import { Transaction, p2wpkh, SigHash } from '@scure/btc-signer';
import { hexToBytes, bytesToHex } from '@noble/hashes/utils.js';
import { fetchUTXOs, getUtxoByTxid, fetchPreviousRawTransaction } from '@/utils/blockchain/bitcoin/utxo';
import { AddressFormat } from '@/utils/blockchain/bitcoin/address';
import { UtxoError, ValidationError } from '@/utils/blockchain/errors';
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

/**
 * Prepare transaction inputs: fetch/verify UTXOs and attach signing data.
 *
 * Returns prevOutputScripts needed for uncompressed legacy signing.
 */
export async function prepareInputs(
  tx: Transaction,
  inputs: Array<{ txid: Uint8Array; index: number }>,
  wallet: Wallet,
  targetAddress: Address,
  pubkeyBytes: Uint8Array,
  inputValues?: number[],
  lockScripts?: string[],
): Promise<Uint8Array[]> {
  const isLegacy = wallet.addressFormat === AddressFormat.P2PKH ||
                   wallet.addressFormat === AddressFormat.Counterwallet;

  // Can use API-provided data for SegWit when available (avoids N network fetches)
  const hasApiData = inputValues && lockScripts &&
                     inputValues.length > 0 && lockScripts.length > 0;

  // Fetch UTXOs only when needed (legacy always needs it, SegWit only without API data)
  // When API data is provided, it's fresh from the compose call - no need to re-verify
  const needsUtxoFetch = isLegacy || !hasApiData;
  const utxos = needsUtxoFetch ? await fetchUTXOs(targetAddress.address) : [];

  const prevOutputScripts: Uint8Array[] = [];

  // Validate API data length matches input count (if using API data)
  if (hasApiData && !isLegacy) {
    if (inputValues.length !== inputs.length) {
      throw new ValidationError(
        'INVALID_TRANSACTION',
        `Input values count (${inputValues.length}) doesn't match transaction inputs (${inputs.length})`
      );
    }
    if (lockScripts.length !== inputs.length) {
      throw new ValidationError(
        'INVALID_TRANSACTION',
        `Lock scripts count (${lockScripts.length}) doesn't match transaction inputs (${inputs.length})`
      );
    }
  }

  for (let i = 0; i < inputs.length; i++) {
    const input = inputs[i];
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
      const prevTx = Transaction.fromRaw(hexToBytes(rawPrevTx), { allowUnknownInputs: true, allowUnknownOutputs: true, disableScriptCheck: true });
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
      const prevTx = Transaction.fromRaw(hexToBytes(rawPrevTx), { allowUnknownInputs: true, allowUnknownOutputs: true, disableScriptCheck: true });
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

  return prevOutputScripts;
}
