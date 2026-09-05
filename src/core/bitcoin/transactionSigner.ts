import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { getPublicKey } from '@noble/secp256k1';
import { p2wpkh, SigHash, Transaction } from '@scure/btc-signer';
import { AddressFormat } from '@/core/bitcoin/address';
import { noTrustedPrevout, type TrustedPrevoutResolver } from '@/core/bitcoin/trustedPrevout';
import { hybridSignTransaction } from '@/core/bitcoin/uncompressedSigner';
import { fetchPreviousRawTransaction, fetchUTXOs, getUtxoByTxid } from '@/core/bitcoin/utxo';
import { SigningError, UtxoError, ValidationError } from '@/core/errors';
import type { Address, Wallet } from '@/types/wallet';

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
  /** X-only internal public key for Taproot key-path spends */
  tapInternalKey?: Uint8Array;
}

/**
 * Sequence used when the parsed transaction does not carry one. Shared by the rebuild and the
 * check below so the two cannot disagree about what "unset" means.
 */
const DEFAULT_SEQUENCE = 0xfffffffd;

/**
 * Require the transaction being signed to be structurally identical to the one that was reviewed.
 *
 * signTransaction does not sign the bytes it parsed — it builds a fresh Transaction and copies
 * fields across, because the signer needs per-input prevout data the raw bytes do not carry. Any
 * field missed in that copy is silently substituted by @scure's defaults, and the user ends up
 * signing something other than what they approved. That has happened twice: version and lockTime
 * were dropped (a timelocked transaction signed as immediately spendable), and sequence was
 * overwritten with 0xfffffffd (a final transaction signed as replaceable). Both were found in the
 * field rather than by the code.
 *
 * Everything a Bitcoin transaction serialises is compared here — version, lockTime, and per input
 * and output the fields that are not the signature itself — so a third omission fails loudly
 * instead of producing a signature over bytes nobody saw.
 */
function assertRebuildMatchesReviewed(signed: Transaction, reviewed: Transaction): void {
  const mismatch = (what: string, expected: unknown, actual: unknown): never => {
    throw new SigningError(
      `Refusing to sign: rebuilt transaction differs from the reviewed one (${what}: expected ${expected}, got ${actual})`,
      { userMessage: 'The transaction changed while being prepared, so it was not signed.' }
    );
  };

  if (signed.version !== reviewed.version) mismatch('version', reviewed.version, signed.version);
  if (signed.lockTime !== reviewed.lockTime) mismatch('lockTime', reviewed.lockTime, signed.lockTime);
  if (signed.inputsLength !== reviewed.inputsLength) {
    mismatch('input count', reviewed.inputsLength, signed.inputsLength);
  }
  if (signed.outputsLength !== reviewed.outputsLength) {
    mismatch('output count', reviewed.outputsLength, signed.outputsLength);
  }

  for (let i = 0; i < reviewed.inputsLength; i++) {
    const a = reviewed.getInput(i);
    const b = signed.getInput(i);
    if (bytesToHex(a.txid!) !== bytesToHex(b.txid!)) {
      mismatch(`input ${i} txid`, bytesToHex(a.txid!), bytesToHex(b.txid!));
    }
    if (a.index !== b.index) mismatch(`input ${i} index`, a.index, b.index);
    // Compared through the same default the rebuild applies. @scure omits sequence when it is
    // absent, and the rebuild fills 0xfffffffd there — reading the raw fields would call that a
    // mismatch and refuse a transaction that is fine. The check that matters is that a sequence
    // the composer *did* set survives, not that the field was spelled out.
    const seqA = a.sequence ?? DEFAULT_SEQUENCE;
    const seqB = b.sequence ?? DEFAULT_SEQUENCE;
    if (seqA !== seqB) mismatch(`input ${i} sequence`, seqA, seqB);
  }

  for (let i = 0; i < reviewed.outputsLength; i++) {
    const a = reviewed.getOutput(i);
    const b = signed.getOutput(i);
    if (a.amount !== b.amount) mismatch(`output ${i} amount`, a.amount, b.amount);
    if (bytesToHex(a.script!) !== bytesToHex(b.script!)) {
      mismatch(`output ${i} script`, bytesToHex(a.script!), bytesToHex(b.script!));
    }
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
  lockScripts?: string[],
  resolveTrustedPrevout: TrustedPrevoutResolver = noTrustedPrevout
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

    const rawTxBytes = hexToBytes(rawTransaction);
    const parsedTx = Transaction.fromRaw(rawTxBytes, {
      allowUnknownInputs: true,
      allowUnknownOutputs: true,
      allowLegacyWitnessUtxo: true,
      disableScriptCheck: true
    });

    // A provider transaction can spend change from a transaction this extension broadcast only
    // milliseconds earlier. Resolve those inputs from the trusted cross-context journal first;
    // public indexers are merely the fallback for inputs we did not create ourselves.
    const shouldResolvePrevouts = isLegacy || !hasApiData;
    const trustedPrevouts = shouldResolvePrevouts
      ? await Promise.all(Array.from({ length: parsedTx.inputsLength }, async (_, index) => {
          const input = parsedTx.getInput(index);
          if (!input?.txid || input.index === undefined) return null;
          return resolveTrustedPrevout(
            bytesToHex(input.txid),
            input.index,
            targetAddress.address
          );
        }))
      : [];
    const needsUtxoFetch = shouldResolvePrevouts
      && trustedPrevouts.some((prevout) => prevout === null);
    const utxos = needsUtxoFetch ? await fetchUTXOs(targetAddress.address) : [];
    // Carry the version and lock time across. Rebuilding without them silently rewrote the
    // transaction the user reviewed: @scure defaults to version 2 and lockTime 0, so a transaction
    // presented as "not valid until block N" was signed as immediately spendable, and the txid shown
    // on the approval screen was not the txid of the bytes being signed.
    const tx = new Transaction({
      version: parsedTx.version,
      lockTime: parsedTx.lockTime,
      allowUnknownInputs: true,
      allowUnknownOutputs: true,
      allowLegacyWitnessUtxo: true,
      disableScriptCheck: true,
      unknown: 'ignore'
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
      const trustedPrevout = trustedPrevouts[i] ?? null;

      // A locally journalled output was parsed from a transaction this extension successfully
      // broadcast and was classified as safe wallet-owned change. Other inputs retain the
      // existing live UTXO check.
      if (shouldResolvePrevouts && !trustedPrevout) {
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
        // Preserve the sequence the reviewed transaction carried. Forcing 0xfffffffd overrode any
        // relative timelock (BIP68) and re-enabled RBF on a transaction presented as final.
        sequence: input.sequence ?? DEFAULT_SEQUENCE,
        sighashType: SigHash.ALL,
      };

      if (wallet.addressFormat === AddressFormat.P2TR) {
        // Taproot key-path spend (BIP341): the signer matches the input by
        // tapInternalKey and tweaks the private key itself. SIGHASH_DEFAULT is
        // required — an explicit ALL is rejected for taproot inputs.
        inputData.sighashType = SigHash.DEFAULT;
        inputData.tapInternalKey = pubkeyBytes.slice(1, 33);
      }

      if (isLegacy) {
        // Legacy P2PKH needs full previous transaction for nonWitnessUtxo
        const rawPrevTx = trustedPrevout?.rawTxHex
          ?? await fetchPreviousRawTransaction(txidHex);
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
        // Assigned by index, not pushed. hybridSignTransaction reads prevOutputScripts[i] for
        // input i, so a conditional push would shift every later entry and sign an input against
        // another input's scriptPubKey — a valid-looking signature over the wrong preimage.
        if (prevOutput.script) {
          prevOutputScripts[i] = prevOutput.script;
        }
      } else if (hasApiData) {
        // SegWit with API-provided data - use directly, no fetch needed
        // This is more efficient: avoids N network requests for N inputs
        inputData.witnessUtxo = {
          script: hexToBytes(lockScripts[i]!),
          amount: BigInt(inputValues[i]!),
        };
        if (wallet.addressFormat === AddressFormat.P2SH_P2WPKH) {
          // Generate redeem script for nested SegWit
          const redeemScript = p2wpkh(pubkeyBytes).script;
          if (redeemScript) {
            inputData.redeemScript = redeemScript;
          }
        }
      } else if (trustedPrevout) {
        // SegWit prevout data comes directly from the parent bytes we already broadcast, so the
        // signature does not wait for mempool.space or blockstream.info to index that parent.
        inputData.witnessUtxo = {
          script: hexToBytes(trustedPrevout.scriptPubKey),
          amount: BigInt(trustedPrevout.value),
        };
        if (wallet.addressFormat === AddressFormat.P2SH_P2WPKH) {
          const redeemScript = p2wpkh(pubkeyBytes).script;
          if (redeemScript) inputData.redeemScript = redeemScript;
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

    for (let i = 0; i < parsedTx.outputsLength; i++) {
      const output = parsedTx.getOutput(i);
      tx.addOutput({
        script: output.script,
        amount: output.amount,
      });
    }

    // Checked before signing, so a mismatch costs nothing and no signature over the wrong bytes
    // is ever produced.
    assertRebuildMatchesReviewed(tx, parsedTx);

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
