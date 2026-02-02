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
 * Normalize PSBT string to hex format.
 *
 * PSBTs can be provided in either hex or base64 format:
 * - Hex: starts with "70736274" (ASCII "psbt")
 * - Base64: starts with "cHNidP" (base64 of "psbt")
 *
 * The Counterparty API returns PSBTs in base64 format, while our internal
 * functions expect hex. This normalizes to hex.
 *
 * @param psbt - PSBT in either hex or base64 format
 * @returns PSBT in hex format
 */
export function normalizePsbtToHex(psbt: string): string {
  if (!psbt || typeof psbt !== 'string') {
    throw new ValidationError('INVALID_PSBT', 'PSBT must be a non-empty string');
  }

  // Check if it's already hex (starts with PSBT magic bytes in hex)
  // PSBT magic: 0x70736274 = "psbt" in ASCII
  if (psbt.startsWith('70736274')) {
    return psbt;
  }

  // Check if it looks like base64 (PSBT magic in base64 is "cHNidP")
  if (psbt.startsWith('cHNidP')) {
    try {
      // Decode base64 to bytes, then convert to hex
      const binary = atob(psbt);
      let hex = '';
      for (let i = 0; i < binary.length; i++) {
        hex += binary.charCodeAt(i).toString(16).padStart(2, '0');
      }
      return hex;
    } catch {
      throw new ValidationError('INVALID_PSBT', 'Failed to decode base64 PSBT');
    }
  }

  // Try to determine format by checking if it's valid hex with PSBT magic
  if (/^[0-9a-fA-F]*$/.test(psbt) && psbt.length % 2 === 0) {
    const lowercased = psbt.toLowerCase();
    // Must start with PSBT magic bytes
    if (lowercased.startsWith('70736274')) {
      return lowercased;
    }
    // Valid hex but not a PSBT - fall through to error
  }

  // Last resort: try base64 decode
  try {
    const binary = atob(psbt);
    let hex = '';
    for (let i = 0; i < binary.length; i++) {
      hex += binary.charCodeAt(i).toString(16).padStart(2, '0');
    }
    // Verify it starts with PSBT magic
    if (hex.startsWith('70736274')) {
      return hex;
    }
  } catch {
    // Not valid base64
  }

  throw new ValidationError('INVALID_PSBT', 'PSBT must be in hex or base64 format');
}

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
 * Parse a PSBT string and return Transaction object.
 * Accepts both hex and base64 formats - normalizes internally.
 *
 * @param psbt - PSBT in hex or base64 format
 * @returns Parsed Transaction object
 */
export function parsePSBT(psbt: string): Transaction {
  try {
    // Normalize to hex (handles both hex and base64 input)
    const psbtHex = normalizePsbtToHex(psbt);
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
 * Extract raw data from an OP_RETURN script.
 *
 * OP_RETURN scripts have the structure:
 *   6a [push_opcode] [data]
 *
 * Where push_opcode can be:
 *   - 0x01-0x4b: Direct push (opcode IS the length)
 *   - 0x4c (OP_PUSHDATA1): Next 1 byte is length
 *   - 0x4d (OP_PUSHDATA2): Next 2 bytes are length (little-endian)
 *   - 0x4e (OP_PUSHDATA4): Next 4 bytes are length (little-endian)
 *
 * This function strips the OP_RETURN opcode and push operation,
 * returning only the raw data bytes.
 *
 * @param scriptHex - Full OP_RETURN script in hex (starting with 6a)
 * @returns Raw data bytes in hex (without opcodes)
 */
function extractOpReturnData(scriptHex: string): string {
  // Remove OP_RETURN opcode (6a)
  const afterOpReturn = scriptHex.slice(2);

  if (afterOpReturn.length < 2) {
    return '';
  }

  // Parse the push opcode
  const pushOpcode = parseInt(afterOpReturn.slice(0, 2), 16);

  if (pushOpcode >= 0x01 && pushOpcode <= 0x4b) {
    // Direct push: opcode IS the length, data follows immediately
    return afterOpReturn.slice(2);
  } else if (pushOpcode === 0x4c) {
    // OP_PUSHDATA1: next 1 byte is length, then data
    return afterOpReturn.slice(4); // Skip 4c + 1 byte length
  } else if (pushOpcode === 0x4d) {
    // OP_PUSHDATA2: next 2 bytes are length (little-endian), then data
    return afterOpReturn.slice(6); // Skip 4d + 2 byte length
  } else if (pushOpcode === 0x4e) {
    // OP_PUSHDATA4: next 4 bytes are length (little-endian), then data
    return afterOpReturn.slice(10); // Skip 4e + 4 byte length
  }

  // Unknown format - return as-is (shouldn't happen for valid scripts)
  return afterOpReturn;
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
      // Extract raw data bytes (strip OP_RETURN opcode AND push operation)
      const opReturnData = extractOpReturnData(scriptHex);
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
 * @param psbt - PSBT in hex or base64 format
 * @param privateKeyHex - Private key to sign with
 * @param inputIndices - Which input indices to sign (if empty, tries all)
 * @param addressFormat - Address format for the signing key
 * @param sighashTypes - Optional sighash type per input (for atomic swaps use 0x81 = ALL|ANYONECANPAY)
 * @returns Signed PSBT hex (not finalized - caller can finalize or pass to next signer)
 */
export function signPSBT(
  psbt: string,
  privateKeyHex: string,
  inputIndices: number[],
  addressFormat: AddressFormat,
  sighashTypes?: number[]
): string {
  // Normalize to hex (handles both hex and base64 input)
  const psbtHex = normalizePsbtToHex(psbt);
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
 * @param psbt - Signed PSBT in hex or base64 format
 * @returns Raw transaction hex ready for broadcast
 */
export function finalizePSBT(psbt: string): string {
  // Normalize to hex (handles both hex and base64 input)
  const psbtHex = normalizePsbtToHex(psbt);
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
 * Complete a PSBT by adding witnessUtxo data for each input.
 *
 * The Counterparty API returns PSBTs without witnessUtxo data embedded.
 * Instead, it provides `inputs_values` (amounts) and `lock_scripts` (scriptPubKeys)
 * separately. This function combines them into the PSBT so hardware wallets
 * can properly verify and display transaction details.
 *
 * @param psbt - PSBT in hex or base64 format
 * @param inputValues - Array of satoshi values for each input (from inputs_values)
 * @param lockScripts - Array of scriptPubKey hex strings for each input (from lock_scripts)
 * @returns Completed PSBT in hex format with witnessUtxo data added
 */
export function completePsbtWithInputValues(
  psbt: string,
  inputValues: number[],
  lockScripts: string[]
): string {
  // Normalize to hex
  const psbtHex = normalizePsbtToHex(psbt);
  const psbtBytes = hexToBytes(psbtHex);
  const tx = Transaction.fromPSBT(psbtBytes, {
    allowUnknownInputs: true,
    allowUnknownOutputs: true,
    allowLegacyWitnessUtxo: true,
    disableScriptCheck: true,
  });

  // Validate arrays match input count
  if (inputValues.length !== tx.inputsLength) {
    throw new ValidationError(
      'INVALID_PSBT',
      `Input values count (${inputValues.length}) doesn't match PSBT inputs (${tx.inputsLength})`
    );
  }
  if (lockScripts.length !== tx.inputsLength) {
    throw new ValidationError(
      'INVALID_PSBT',
      `Lock scripts count (${lockScripts.length}) doesn't match PSBT inputs (${tx.inputsLength})`
    );
  }

  // Add witnessUtxo to each input
  for (let i = 0; i < tx.inputsLength; i++) {
    const amount = BigInt(inputValues[i]);
    const script = hexToBytes(lockScripts[i]);

    tx.updateInput(i, {
      witnessUtxo: {
        amount,
        script,
      },
    });
  }

  // Return updated PSBT as hex
  return bytesToHex(tx.toPSBT());
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
