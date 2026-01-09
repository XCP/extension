/**
 * PSBT (Partially Signed Bitcoin Transaction) utilities
 *
 * Pure Bitcoin PSBT operations - parsing, signing, and finalizing.
 * For Counterparty message decoding, see counterparty/transaction.ts
 */

import { Transaction, p2wpkh, SigHash } from '@scure/btc-signer';
import { hexToBytes, bytesToHex } from '@noble/hashes/utils.js';
import { getPublicKey } from '@noble/secp256k1';
import { AddressFormat } from '@/utils/blockchain/bitcoin/address';
import { SigningError, ValidationError } from '@/utils/blockchain/errors';

/**
 * Decoded output from a transaction
 */
export interface DecodedOutput {
  index: number;
  value: number;           // in satoshis
  address?: string;
  type: 'p2pkh' | 'p2wpkh' | 'p2sh' | 'p2tr' | 'op_return' | 'unknown';
  script: string;          // hex
  /** For OP_RETURN outputs, the data payload (without opcode) */
  opReturnData?: string;
}

/**
 * Decoded input from a transaction
 */
export interface DecodedInput {
  index: number;
  txid: string;
  vout: number;
  address?: string;
  value?: number;          // in satoshis, if known from witnessUtxo
}

/**
 * Basic PSBT details extracted via pure Bitcoin parsing
 */
export interface PsbtDetails {
  /** Raw transaction hex (if extractable) */
  rawTxHex: string;
  inputs: DecodedInput[];
  outputs: DecodedOutput[];
  /** Total input value (from witnessUtxo data in PSBT) */
  totalInputValue: number;
  /** Total output value */
  totalOutputValue: number;
  /** Calculated fee (inputs - outputs), 0 if input values unknown */
  fee: number;
  /** True if any output contains OP_RETURN */
  hasOpReturn: boolean;
}

/**
 * Sign PSBT request parameters
 */
export interface SignPsbtParams {
  /** PSBT in hex format */
  hex: string;
  /**
   * Optional: Map of address → input indices to sign
   * If omitted, wallet will sign all inputs it can (has private key for)
   */
  signInputs?: Record<string, number[]>;
  /**
   * Optional: Sighash types per input index
   * For atomic swaps, use SIGHASH_ALL | SIGHASH_ANYONECANPAY (0x81)
   * Default: SIGHASH_ALL (0x01) for all inputs
   */
  sighashTypes?: number[];
}

/**
 * Parse a PSBT hex string and return Transaction object
 */
export function parsePSBT(psbtHex: string): Transaction {
  try {
    const psbtBytes = hexToBytes(psbtHex);
    return Transaction.fromPSBT(psbtBytes, {
      allowUnknownInputs: true,
      allowUnknownOutputs: true,
      allowLegacyWitnessUtxo: true,
      disableScriptCheck: true,
    });
  } catch (err) {
    throw new ValidationError(
      'INVALID_TRANSACTION',
      `Failed to parse PSBT: ${err instanceof Error ? err.message : 'Unknown error'}`
    );
  }
}

/**
 * Determine output script type from script hex
 */
function getScriptType(scriptHex: string): DecodedOutput['type'] {
  if (scriptHex.startsWith('6a')) {
    return 'op_return';
  } else if (scriptHex.startsWith('76a914') && scriptHex.endsWith('88ac')) {
    return 'p2pkh';
  } else if (scriptHex.startsWith('0014') && scriptHex.length === 44) {
    return 'p2wpkh';
  } else if (scriptHex.startsWith('a914') && scriptHex.endsWith('87')) {
    return 'p2sh';
  } else if (scriptHex.startsWith('5120') && scriptHex.length === 68) {
    return 'p2tr';
  }
  return 'unknown';
}

/**
 * Extract details from a PSBT using pure Bitcoin parsing
 * Does not call any external APIs - just parses the PSBT structure
 */
export function extractPsbtDetails(psbtHex: string): PsbtDetails {
  const tx = parsePSBT(psbtHex);

  // Try to extract raw tx hex
  let rawTxHex = '';
  try {
    rawTxHex = tx.hex;
  } catch {
    // PSBT might not be complete enough to extract unsigned tx
  }

  // Decode inputs
  const inputs: DecodedInput[] = [];
  let totalInputValue = 0;

  for (let i = 0; i < tx.inputsLength; i++) {
    const input = tx.getInput(i);
    if (input?.txid) {
      const txidHex = bytesToHex(input.txid);
      const value = input.witnessUtxo?.amount ? Number(input.witnessUtxo.amount) : undefined;

      if (value !== undefined) {
        totalInputValue += value;
      }

      inputs.push({
        index: i,
        txid: txidHex,
        vout: input.index ?? 0,
        value,
      });
    }
  }

  // Decode outputs
  const outputs: DecodedOutput[] = [];
  let totalOutputValue = 0;
  let hasOpReturn = false;

  for (let i = 0; i < tx.outputsLength; i++) {
    const output = tx.getOutput(i);
    if (!output) continue;

    const scriptHex = output.script ? bytesToHex(output.script) : '';
    const value = output.amount ? Number(output.amount) : 0;
    const type = getScriptType(scriptHex);

    totalOutputValue += value;

    if (type === 'op_return') {
      hasOpReturn = true;
      // Extract OP_RETURN data (remove opcode byte)
      const opReturnData = scriptHex.slice(2);
      outputs.push({
        index: i,
        value,
        type,
        script: scriptHex,
        opReturnData,
      });
    } else {
      outputs.push({
        index: i,
        value,
        type,
        script: scriptHex,
      });
    }
  }

  // Calculate fee (only valid if all input values are known)
  const fee = totalInputValue > 0 ? totalInputValue - totalOutputValue : 0;

  return {
    rawTxHex,
    inputs,
    outputs,
    totalInputValue,
    totalOutputValue,
    fee,
    hasOpReturn,
  };
}

/**
 * Sign specified inputs of a PSBT
 *
 * @param psbtHex - PSBT in hex format
 * @param privateKeyHex - Private key to sign with
 * @param inputIndices - Which input indices to sign (if empty, tries all)
 * @param addressFormat - Address format for the signing key
 * @param sighashTypes - Optional sighash type per input (for atomic swaps use 0x81 = ALL|ANYONECANPAY)
 * @returns Signed PSBT hex (not finalized - caller can finalize or pass to next signer)
 */
export function signPSBT(
  psbtHex: string,
  privateKeyHex: string,
  inputIndices: number[],
  addressFormat: AddressFormat,
  sighashTypes?: number[]
): string {
  const psbtBytes = hexToBytes(psbtHex);
  const tx = Transaction.fromPSBT(psbtBytes, {
    allowUnknownInputs: true,
    allowUnknownOutputs: true,
    allowLegacyWitnessUtxo: true,
    disableScriptCheck: true,
  });

  const privateKeyBytes = hexToBytes(privateKeyHex);
  const pubkeyBytes = getPublicKey(privateKeyBytes, true);

  // If no specific indices provided, try to sign all inputs
  const indicesToSign = inputIndices.length > 0
    ? inputIndices
    : Array.from({ length: tx.inputsLength }, (_, i) => i);

  try {
    for (const inputIdx of indicesToSign) {
      // For P2SH-P2WPKH, we may need to add the redeem script
      if (addressFormat === AddressFormat.P2SH_P2WPKH) {
        const input = tx.getInput(inputIdx);
        if (input && !input.redeemScript) {
          const redeemScript = p2wpkh(pubkeyBytes).script;
          if (redeemScript) {
            tx.updateInput(inputIdx, { redeemScript });
          }
        }
      }

      // Get sighash type for this input (default: SIGHASH_ALL)
      const sighashType = sighashTypes?.[inputIdx] ?? SigHash.ALL;

      // Sign the input
      tx.signIdx(privateKeyBytes, inputIdx, [sighashType]);
    }

    // Return as PSBT (not finalized - allows chaining for multi-sig)
    return bytesToHex(tx.toPSBT());
  } catch (err) {
    throw new SigningError(
      `Failed to sign PSBT: ${err instanceof Error ? err.message : 'Unknown error'}`,
      {
        userMessage: 'Failed to sign the transaction. Please try again.',
        cause: err instanceof Error ? err : undefined,
      }
    );
  }
}

/**
 * Finalize a fully-signed PSBT and extract the raw transaction
 *
 * @param psbtHex - Signed PSBT hex
 * @returns Raw transaction hex ready for broadcast
 */
export function finalizePSBT(psbtHex: string): string {
  const psbtBytes = hexToBytes(psbtHex);
  const tx = Transaction.fromPSBT(psbtBytes, {
    allowUnknownInputs: true,
    allowUnknownOutputs: true,
    allowLegacyWitnessUtxo: true,
    disableScriptCheck: true,
  });

  tx.finalize();
  return tx.hex;
}

/**
 * Validate signInputs parameter - ensure addresses belong to wallet
 */
export function validateSignInputs(
  signInputs: Record<string, number[]>,
  walletAddresses: string[]
): { valid: boolean; error?: string } {
  const walletAddressSet = new Set(walletAddresses.map(a => a.toLowerCase()));

  for (const address of Object.keys(signInputs)) {
    if (!walletAddressSet.has(address.toLowerCase())) {
      return {
        valid: false,
        error: `Address ${address} is not in this wallet`,
      };
    }

    const indices = signInputs[address];
    if (!Array.isArray(indices) || indices.some(i => !Number.isInteger(i) || i < 0)) {
      return {
        valid: false,
        error: `Invalid input indices for address ${address}`,
      };
    }
  }

  return { valid: true };
}
