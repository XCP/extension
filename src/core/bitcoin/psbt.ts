/**
 * PSBT (Partially Signed Bitcoin Transaction) utilities
 *
 * Pure Bitcoin PSBT operations - parsing, signing, and finalizing.
 * For Counterparty message decoding, see counterparty/transaction.ts
 */

import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { getPublicKey } from '@noble/secp256k1';
import { Address, p2wpkh, SigHash, Transaction } from '@scure/btc-signer';
import { taprootTweakPrivKey } from '@scure/btc-signer/utils.js';
import { AddressFormat, decodeAddressFromScript, encodeAddress, normalizeAddressForComparison } from '@/core/bitcoin/address';
import { SigningError, ValidationError } from '@/core/errors';
import { toSafeInteger } from '@/core/numeric';

/** Resolve the exact sighash the signer will use for one PSBT input. */
export function resolvePsbtSighashType(
  explicitSighashType?: number,
  embeddedSighashType?: number
): number {
  return explicitSighashType ?? embeddedSighashType ?? SigHash.ALL;
}

/**
 * Sighash flags a dApp PSBT signing request may use. Excludes SIGHASH_NONE
 * (commits to no outputs) and bare SIGHASH_SINGLE without ANYONECANPAY, so a
 * PSBT-embedded sighash cannot obtain a signature over outputs the approval
 * screen did not reflect.
 */
export const ALLOWED_PSBT_SIGHASH_TYPES: ReadonlySet<number> = new Set([
  SigHash.DEFAULT,               // 0x00 (taproot key-path)
  SigHash.ALL,                   // 0x01
  SigHash.ALL_ANYONECANPAY,      // 0x81
  SigHash.SINGLE_ANYONECANPAY,   // 0x83 (marketplace listings)
]);

/**
 * Which output indices a set of signatures commits to. `null` means every output is committed, so
 * the outputs cannot change without invalidating a signature.
 *
 * A signature binds only transactions that contain its own input. Without ANYONECANPAY it commits
 * to the whole input set, so the reviewed transaction is the only broadcastable one. ANYONECANPAY
 * lifts that restriction: such an input can be moved into a transaction built by whoever holds the
 * PSBT, and the signatures left behind go with their inputs.
 *
 * Any one detachable input can therefore be kept while the rest are dropped, so only the outputs
 * every detachable input covers on its own are guaranteed. SINGLE|ANYONECANPAY covers the output
 * sharing its input's index and nothing when there is no such output; ALL|ANYONECANPAY covers
 * every output.
 */
export function committedOutputIndices(
  signedInputs: Array<{ index: number; sighashType: number }>,
  outputCount: number
): Set<number> | null {
  if (signedInputs.length === 0) return null;

  const isDetachable = (sighashType: number) => (sighashType & 0x80) !== 0;
  const commitsToEveryOutput = (sighashType: number) => {
    const base = sighashType & 0x1f;
    return base === SigHash.DEFAULT || base === SigHash.ALL;
  };

  /** Outputs one signature covers alone: SINGLE takes the output at its index, NONE takes none. */
  const ownCommitment = ({ index, sighashType }: { index: number; sighashType: number }) =>
    (sighashType & 0x1f) === SigHash.SINGLE && index < outputCount
      ? new Set([index])
      : new Set<number>();

  const detachable = signedInputs.filter(({ sighashType }) => isDetachable(sighashType));

  // With nothing detachable the whole input set has to be kept, so every signature keeps binding
  // and their commitments combine.
  if (detachable.length === 0) {
    if (signedInputs.some(({ sighashType }) => commitsToEveryOutput(sighashType))) return null;
    const committed = new Set<number>();
    for (const signedInput of signedInputs) {
      for (const index of ownCommitment(signedInput)) committed.add(index);
    }
    return committed;
  }

  // Only what every detachable input covers survives. An ALL|ANYONECANPAY input covers every
  // output, so it constrains nothing; when every detachable input is of that kind, the whole
  // output set is committed.
  const constraining = detachable.filter(({ sighashType }) => !commitsToEveryOutput(sighashType));
  if (constraining.length === 0) return null;
  return constraining
    .map(ownCommitment)
    .reduce((intersection, own) => new Set([...intersection].filter((index) => own.has(index))));
}

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
  sighashType?: number;    // sighash type from PSBT input (e.g. 0x83 for SINGLE|ANYONECANPAY)
  /**
   * Tapleaf scripts this input would reveal, hex, leaf-version byte stripped. An inscription
   * reveal carries its ord envelope — and therefore its Counterparty message — here rather than
   * in any output, so approval-side decoding needs the leaves the signature will commit to.
   */
  tapLeafScripts?: string[];
}

/**
 * Basic PSBT details extracted via pure Bitcoin parsing
 */
export interface PsbtDetails {
  /** Raw transaction hex (if extractable) */
  rawTxHex: string;
  inputs: DecodedInput[];
  outputs: DecodedOutput[];
  /** Total input value from embedded witness or non-witness prevout data */
  totalInputValue: number;
  /** Total output value */
  totalOutputValue: number;
  /** Calculated fee (inputs - outputs), 0 if input values are unknown or the outputs exceed them */
  fee: number;
  /**
   * Outputs exceed inputs, so `fee` is not yet knowable. Normal for a marketplace listing, where the
   * counterparty supplies the funding inputs.
   */
  unfunded: boolean;
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
      // Prefer the full prev tx (authoritative for legacy); fall back to
      // witnessUtxo for SegWit.
      const prevout = (input.index !== undefined ? input.nonWitnessUtxo?.outputs[input.index] : undefined)
        ?? input.witnessUtxo;
      const value = prevout?.amount !== undefined ? Number(prevout.amount) : undefined;
      const address = prevout?.script
        ? decodeAddressFromScript(bytesToHex(prevout.script)) ?? undefined
        : undefined;

      if (value !== undefined) {
        totalInputValue += value;
      }

      // The PSBT stores each leaf as script bytes with the leaf version appended.
      const tapLeafScripts = input.tapLeafScript?.map(([, scriptWithVersion]) =>
        bytesToHex(scriptWithVersion.subarray(0, -1))
      );

      inputs.push({
        index: i,
        txid: txidHex,
        vout: input.index ?? 0,
        address,
        value,
        sighashType: input.sighashType,
        ...(tapLeafScripts && tapLeafScripts.length > 0 ? { tapLeafScripts } : {}),
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
    const value = output.amount ? (toSafeInteger(output.amount) ?? 0) : 0;
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
        // Resolved from the script, as inputs are. Callers may still enrich from an indexer, but the
        // approval summary needs to tell your change from someone else's output without a network
        // round-trip that can fail.
        address: decodeAddressFromScript(scriptHex) ?? undefined,
        type,
        script: scriptHex,
      });
    }
  }

  // A fee only exists once the inputs cover the outputs.
  const unfunded = totalInputValue > 0 && totalOutputValue > totalInputValue;
  const fee = totalInputValue > 0 && !unfunded ? totalInputValue - totalOutputValue : 0;

  return {
    rawTxHex,
    inputs,
    outputs,
    totalInputValue,
    totalOutputValue,
    fee,
    unfunded,
    hasOpReturn,
  };
}

/**
 * The address a tapleaf-bearing input is spendable by, when that can be read from the PSBT.
 *
 * An inscription reveal spends a P2TR commit whose *address* belongs to nobody — it is derived
 * from the envelope — but whose single leaf ends in `<key> OP_CHECKSIG`. The address whose
 * witness program is that key is the leaf's owner: the spending condition names it directly.
 * Ownership validation uses this so a reveal counts as the signer's own input, without any
 * blanket exemption — a declared leaf that is not really in the commit's tree yields a signature
 * that finalizes into an unbroadcastable transaction, never someone else's coins.
 *
 * Only single-leaf inputs resolve: with several leaves the one that will be revealed is unknown,
 * and no ownership claim can be made.
 */
export function tapLeafOwnerAddress(input: DecodedInput): string | undefined {
  if (input.tapLeafScripts?.length !== 1) return undefined;
  const script = input.tapLeafScripts[0]!;
  // The leaf must end `20 <32-byte key> ac` — a push of the x-only key, then OP_CHECKSIG.
  if (script.length < 68 || !script.endsWith('ac')) return undefined;
  if (script.slice(-68, -66) !== '20') return undefined;
  try {
    const key = hexToBytes(script.slice(-66, -2));
    return Address().encode({ type: 'tr', pubkey: key });
  } catch {
    return undefined;
  }
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
    // Require the full prev tx for legacy inputs: a bare witnessUtxo lets a
    // dApp declare a false amount and drain the real UTXO to fees.
    allowLegacyWitnessUtxo: false,
    disableScriptCheck: true,
  });

  const privateKeyBytes = hexToBytes(privateKeyHex);
  const pubkeyBytes = getPublicKey(privateKeyBytes, true);

  // If no specific indices provided, try to sign all inputs
  const indicesToSign = inputIndices.length > 0
    ? inputIndices
    : Array.from({ length: tx.inputsLength }, (_, i) => i);

  // When specific indices are requested, failures are real errors.
  // When trying all inputs (no signInputs specified), gracefully skip
  // inputs that don't belong to us (e.g., other party's input in an atomic swap).
  const bestEffort = inputIndices.length === 0;

  // In best-effort mode, restrict signing to the active address's OWN inputs. This key can also
  // sign a paired address's inputs — Counterwallet/Freewallet legacy and SegWit are one key in two
  // encodings (derivation m/0'/0) — but signing those must go through the explicit signInputs path,
  // which alone gates on paired-address permission. Without this scope a PSBT that omits signInputs
  // would sign a paired UTXO with no permission check and no at-risk pricing (the paired input is
  // dropped from the approval summary). Deriving the address here fails closed: if it throws, the
  // whole sign throws and nothing is signed. The check is strictly subtractive — it can only skip
  // inputs, never sign one that was not already going to be signed.
  const ownScopeAddress = bestEffort
    ? normalizeAddressForComparison(encodeAddress(pubkeyBytes, addressFormat))
    : null;
  const belongsToActiveAddress = (inputIdx: number): boolean => {
    const input = tx.getInput(inputIdx);
    const prevout = (input.index !== undefined ? input.nonWitnessUtxo?.outputs[input.index] : undefined)
      ?? input.witnessUtxo;
    const inputAddress = prevout?.script
      ? decodeAddressFromScript(bytesToHex(prevout.script))
      : undefined;
    // An input whose script can't be attributed is not provably ours, so skip it (fail closed).
    return inputAddress != null && normalizeAddressForComparison(inputAddress) === ownScopeAddress;
  };

  let signedCount = 0;

  try {
    for (const inputIdx of indicesToSign) {
      // Best-effort mode signs only the active address's own inputs; a paired or foreign input is
      // silently skipped, exactly as a co-signer's input in an atomic swap is.
      if (bestEffort && !belongsToActiveAddress(inputIdx)) continue;

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

      // A key-path taproot input can only be matched to a key via tapInternalKey, and dApp PSBTs
      // routinely omit it (a site cannot know the internal key behind an address). When the
      // prevout provably pays this signer's own taproot address, supplying the key is completion,
      // not trust: the signer re-derives tweak(internalKey) and refuses to sign unless it equals
      // the prevout's witness program, so a wrong or foreign input stays unsigned.
      if (addressFormat === AddressFormat.P2TR) {
        const input = tx.getInput(inputIdx);
        const prevout = (input.index !== undefined ? input.nonWitnessUtxo?.outputs[input.index] : undefined)
          ?? input.witnessUtxo;
        const prevoutAddress = prevout?.script
          ? decodeAddressFromScript(bytesToHex(prevout.script))
          : undefined;
        const ownAddress = encodeAddress(pubkeyBytes, addressFormat);
        if (
          input && !input.tapInternalKey && prevoutAddress
          && normalizeAddressForComparison(prevoutAddress) === normalizeAddressForComparison(ownAddress)
        ) {
          tx.updateInput(inputIdx, { tapInternalKey: pubkeyBytes.slice(1, 33) });
        }
      }

      // Determine sighash: use the explicit sighashTypes param if provided,
      // then fall back to the sighash embedded in the PSBT input, then default to ALL
      const input = tx.getInput(inputIdx);
      const requestedSighashType = sighashTypes?.[inputIdx];
      const sighashType = resolvePsbtSighashType(requestedSighashType, input.sighashType);
      // Enforce the allowlist on the EFFECTIVE sighash, so an embedded
      // SIGHASH_NONE/SINGLE can't bypass the explicit-parameter check. In
      // best-effort mode the input may be a co-signer's, so skip it; with
      // explicit indices the caller asked to sign it, so fail closed.
      if (!ALLOWED_PSBT_SIGHASH_TYPES.has(sighashType)) {
        if (bestEffort) continue;
        throw new ValidationError(
          'INVALID_PSBT',
          `Refusing to sign input ${inputIdx} with unsupported sighash type 0x${sighashType.toString(16)}`
        );
      }
      if (requestedSighashType !== undefined) {
        tx.updateInput(inputIdx, { sighashType: requestedSighashType });
      }

      try {
        tx.signIdx(privateKeyBytes, inputIdx, [sighashType]);
        signedCount++;
      } catch (inputErr) {
        // A tapscript spend of this signer's own taproot address — an inscription reveal — names
        // the address's *output* key in the leaf, and that key is the tweak of the private key
        // held here. The signer only matches raw keys against leaf scripts, so retry with the
        // tweaked key. This can only produce a signature verifying against the signer's own
        // tweaked key; a leaf naming anyone else's key still finds no match and stays unsigned.
        const input = tx.getInput(inputIdx);
        if (addressFormat === AddressFormat.P2TR && input?.tapLeafScript?.length) {
          const tweakedKey = taprootTweakPrivKey(privateKeyBytes);
          try {
            tx.signIdx(tweakedKey, inputIdx, [sighashType]);
            signedCount++;
          } catch (leafErr) {
            if (!bestEffort) throw leafErr;
          } finally {
            tweakedKey.fill(0);
          }
        } else if (!bestEffort) {
          throw inputErr;
        }
        // Best-effort mode: skip inputs we can't sign (e.g., other party's UTXO)
      }
    }

    if (signedCount === 0) {
      throw new Error('No inputs could be signed with the provided key');
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
  } finally {
    // Zero out private key bytes after use (defense in depth)
    // See ADR-001 in sessionManager.ts for JS memory limitation context
    privateKeyBytes.fill(0);
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
    const amount = BigInt(inputValues[i]!);
    const script = hexToBytes(lockScripts[i]!);

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
 * Validate signInputs and bind each requested index to its actual prevout address
 */
export function validateSignInputs(
  signInputs: Record<string, number[]>,
  walletAddresses: string[],
  inputCount?: number,
  inputAddresses?: Array<string | undefined>
): { valid: boolean; error?: string } {
  if (Object.keys(signInputs).length === 0) {
    return { valid: false, error: 'signInputs must identify at least one input' };
  }

  const walletAddressSet = new Set(walletAddresses.map(normalizeAddressForComparison));
  const seenIndices = new Set<number>();

  for (const address of Object.keys(signInputs)) {
    if (!walletAddressSet.has(normalizeAddressForComparison(address))) {
      return {
        valid: false,
        error: `Address ${address} is not in this wallet`,
      };
    }

    const indices = signInputs[address];
    if (!Array.isArray(indices) || indices.length === 0) {
      return { valid: false, error: `No input indices provided for address ${address}` };
    }
    for (const index of indices) {
      if (!Number.isSafeInteger(index) || index < 0 || (inputCount !== undefined && index >= inputCount)) {
        return { valid: false, error: `Invalid input index ${index} for address ${address}` };
      }
      if (seenIndices.has(index)) {
        return { valid: false, error: `Input index ${index} was requested more than once` };
      }
      if (inputAddresses) {
        const inputAddress = inputAddresses[index];
        if (!inputAddress || normalizeAddressForComparison(inputAddress) !== normalizeAddressForComparison(address)) {
          return { valid: false, error: `Input index ${index} does not belong to address ${address}` };
        }
      }
      seenIndices.add(index);
    }
  }

  return { valid: true };
}
