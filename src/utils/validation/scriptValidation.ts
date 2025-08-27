/**
 * Bitcoin Script validation utilities for security
 */

import { hex } from '@scure/base';

export interface ScriptValidationResult {
  isValid: boolean;
  error?: string;
  warnings?: string[];
  scriptType?: string;
}

/**
 * Bitcoin Script opcodes for validation
 */
const OPCODES = {
  OP_0: 0x00,
  OP_FALSE: 0x00,
  OP_1: 0x51,
  OP_TRUE: 0x51,
  OP_DUP: 0x76,
  OP_HASH160: 0xa9,
  OP_EQUALVERIFY: 0x88,
  OP_CHECKSIG: 0xac,
  OP_EQUAL: 0x87,
  OP_CHECKMULTISIG: 0xae,
  OP_RETURN: 0x6a,
  OP_PUSHDATA1: 0x4c,
  OP_PUSHDATA2: 0x4d,
  OP_PUSHDATA4: 0x4e,
};

/**
 * Validates a Bitcoin script hex string
 */
export function validateScript(scriptHex: string): ScriptValidationResult {
  if (typeof scriptHex !== 'string') {
    return { isValid: false, error: 'Script must be a string' };
  }

  const trimmed = scriptHex.trim().toLowerCase();
  
  // Remove 0x prefix if present
  const cleanHex = trimmed.startsWith('0x') ? trimmed.slice(2) : trimmed;
  
  // Check for empty script
  if (!cleanHex) {
    return { isValid: false, error: 'Script cannot be empty' };
  }

  // Validate hex format
  if (!/^[0-9a-f]*$/.test(cleanHex)) {
    return { isValid: false, error: 'Script must be valid hexadecimal' };
  }

  // Check even length
  if (cleanHex.length % 2 !== 0) {
    return { isValid: false, error: 'Script hex must have even length' };
  }

  // Check maximum script size (10KB)
  if (cleanHex.length > 20000) {
    return { isValid: false, error: 'Script exceeds maximum size (10KB)' };
  }

  const warnings: string[] = [];
  
  try {
    const scriptBytes = hex.decode(cleanHex);
    const scriptType = identifyScriptType(scriptBytes);
    
    // Validate based on script type
    if (scriptType === 'P2PKH') {
      const result = validateP2PKHScript(scriptBytes);
      if (!result.isValid) return result;
    } else if (scriptType === 'P2SH') {
      const result = validateP2SHScript(scriptBytes);
      if (!result.isValid) return result;
    } else if (scriptType === 'P2WPKH') {
      const result = validateP2WPKHScript(scriptBytes);
      if (!result.isValid) return result;
    } else if (scriptType === 'P2WSH') {
      const result = validateP2WSHScript(scriptBytes);
      if (!result.isValid) return result;
    } else if (scriptType === 'P2TR') {
      const result = validateP2TRScript(scriptBytes);
      if (!result.isValid) return result;
    } else if (scriptType === 'MULTISIG') {
      const result = validateMultisigScript(scriptBytes);
      if (!result.isValid) return result;
      if (result.warnings) warnings.push(...result.warnings);
    } else if (scriptType === 'OP_RETURN') {
      const result = validateOpReturnScript(scriptBytes);
      if (!result.isValid) return result;
      if (result.warnings) warnings.push(...result.warnings);
    }

    // Check for dangerous opcodes
    const dangerousOps = checkDangerousOpcodes(scriptBytes);
    if (dangerousOps.length > 0) {
      warnings.push(`Script contains potentially dangerous opcodes: ${dangerousOps.join(', ')}`);
    }

    return {
      isValid: true,
      scriptType,
      warnings: warnings.length > 0 ? warnings : undefined
    };
  } catch (error) {
    return { isValid: false, error: 'Failed to parse script' };
  }
}

/**
 * Identifies the type of Bitcoin script
 */
function identifyScriptType(scriptBytes: Uint8Array): string {
  const len = scriptBytes.length;
  
  // P2PKH: OP_DUP OP_HASH160 <20 bytes> OP_EQUALVERIFY OP_CHECKSIG
  if (len === 25 && 
      scriptBytes[0] === OPCODES.OP_DUP &&
      scriptBytes[1] === OPCODES.OP_HASH160 &&
      scriptBytes[2] === 20 &&
      scriptBytes[23] === OPCODES.OP_EQUALVERIFY &&
      scriptBytes[24] === OPCODES.OP_CHECKSIG) {
    return 'P2PKH';
  }
  
  // P2SH: OP_HASH160 <20 bytes> OP_EQUAL
  if (len === 23 &&
      scriptBytes[0] === OPCODES.OP_HASH160 &&
      scriptBytes[1] === 20 &&
      scriptBytes[22] === OPCODES.OP_EQUAL) {
    return 'P2SH';
  }
  
  // P2WPKH: OP_0 <20 bytes>
  if (len === 22 &&
      scriptBytes[0] === OPCODES.OP_0 &&
      scriptBytes[1] === 20) {
    return 'P2WPKH';
  }
  
  // P2WSH: OP_0 <32 bytes>
  if (len === 34 &&
      scriptBytes[0] === OPCODES.OP_0 &&
      scriptBytes[1] === 32) {
    return 'P2WSH';
  }
  
  // P2TR: OP_1 <32 bytes>
  if (len === 34 &&
      scriptBytes[0] === OPCODES.OP_1 &&
      scriptBytes[1] === 32) {
    return 'P2TR';
  }
  
  // OP_RETURN
  if (scriptBytes[0] === OPCODES.OP_RETURN) {
    return 'OP_RETURN';
  }
  
  // Check for multisig pattern
  if (scriptBytes[scriptBytes.length - 1] === OPCODES.OP_CHECKMULTISIG) {
    return 'MULTISIG';
  }
  
  return 'UNKNOWN';
}

/**
 * Validates P2PKH script structure
 */
function validateP2PKHScript(scriptBytes: Uint8Array): ScriptValidationResult {
  if (scriptBytes.length !== 25) {
    return { isValid: false, error: 'Invalid P2PKH script length' };
  }
  
  // Check structure
  if (scriptBytes[0] !== OPCODES.OP_DUP ||
      scriptBytes[1] !== OPCODES.OP_HASH160 ||
      scriptBytes[2] !== 20 ||
      scriptBytes[23] !== OPCODES.OP_EQUALVERIFY ||
      scriptBytes[24] !== OPCODES.OP_CHECKSIG) {
    return { isValid: false, error: 'Invalid P2PKH script structure' };
  }
  
  return { isValid: true };
}

/**
 * Validates P2SH script structure
 */
function validateP2SHScript(scriptBytes: Uint8Array): ScriptValidationResult {
  if (scriptBytes.length !== 23) {
    return { isValid: false, error: 'Invalid P2SH script length' };
  }
  
  if (scriptBytes[0] !== OPCODES.OP_HASH160 ||
      scriptBytes[1] !== 20 ||
      scriptBytes[22] !== OPCODES.OP_EQUAL) {
    return { isValid: false, error: 'Invalid P2SH script structure' };
  }
  
  return { isValid: true };
}

/**
 * Validates P2WPKH script structure
 */
function validateP2WPKHScript(scriptBytes: Uint8Array): ScriptValidationResult {
  if (scriptBytes.length !== 22) {
    return { isValid: false, error: 'Invalid P2WPKH script length' };
  }
  
  if (scriptBytes[0] !== OPCODES.OP_0 || scriptBytes[1] !== 20) {
    return { isValid: false, error: 'Invalid P2WPKH script structure' };
  }
  
  return { isValid: true };
}

/**
 * Validates P2WSH script structure
 */
function validateP2WSHScript(scriptBytes: Uint8Array): ScriptValidationResult {
  if (scriptBytes.length !== 34) {
    return { isValid: false, error: 'Invalid P2WSH script length' };
  }
  
  if (scriptBytes[0] !== OPCODES.OP_0 || scriptBytes[1] !== 32) {
    return { isValid: false, error: 'Invalid P2WSH script structure' };
  }
  
  return { isValid: true };
}

/**
 * Validates P2TR (Taproot) script structure
 */
function validateP2TRScript(scriptBytes: Uint8Array): ScriptValidationResult {
  if (scriptBytes.length !== 34) {
    return { isValid: false, error: 'Invalid P2TR script length' };
  }
  
  if (scriptBytes[0] !== OPCODES.OP_1 || scriptBytes[1] !== 32) {
    return { isValid: false, error: 'Invalid P2TR script structure' };
  }
  
  return { isValid: true };
}

/**
 * Validates multisig script structure
 */
export function validateMultisigScript(scriptBytes: Uint8Array): ScriptValidationResult {
  const warnings: string[] = [];
  
  // Minimum: <m> <pubkey> <n> OP_CHECKMULTISIG
  if (scriptBytes.length < 37) {
    return { isValid: false, error: 'Multisig script too short' };
  }
  
  // Check last opcode
  if (scriptBytes[scriptBytes.length - 1] !== OPCODES.OP_CHECKMULTISIG) {
    return { isValid: false, error: 'Multisig script must end with OP_CHECKMULTISIG' };
  }
  
  // Extract m and n values
  const m = scriptBytes[0] - 0x50; // OP_1 = 0x51, OP_2 = 0x52, etc.
  const n = scriptBytes[scriptBytes.length - 2] - 0x50;
  
  // Validate m and n
  if (m < 1 || m > 15) {
    return { isValid: false, error: 'Invalid m value in multisig (must be 1-15)' };
  }
  
  if (n < 1 || n > 15) {
    return { isValid: false, error: 'Invalid n value in multisig (must be 1-15)' };
  }
  
  if (m > n) {
    return { isValid: false, error: 'Invalid multisig: m cannot be greater than n' };
  }
  
  // Warn about large multisig
  if (n > 3) {
    warnings.push(`Large multisig (${m}-of-${n}) may have higher fees`);
  }
  
  return { 
    isValid: true,
    warnings: warnings.length > 0 ? warnings : undefined
  };
}

/**
 * Validates OP_RETURN script
 */
function validateOpReturnScript(scriptBytes: Uint8Array): ScriptValidationResult {
  const warnings: string[] = [];
  
  if (scriptBytes[0] !== OPCODES.OP_RETURN) {
    return { isValid: false, error: 'OP_RETURN script must start with OP_RETURN' };
  }
  
  // Standard OP_RETURN data limit is 80 bytes
  if (scriptBytes.length > 83) { // OP_RETURN + push op + 80 bytes
    warnings.push('OP_RETURN data exceeds standard limit (80 bytes)');
  }
  
  // Check for null data
  if (scriptBytes.length === 1) {
    warnings.push('OP_RETURN script contains no data');
  }
  
  return {
    isValid: true,
    warnings: warnings.length > 0 ? warnings : undefined
  };
}

/**
 * Checks for dangerous or non-standard opcodes
 */
function checkDangerousOpcodes(scriptBytes: Uint8Array): string[] {
  const dangerous: string[] = [];
  
  // Disabled opcodes that should not be used
  const DISABLED_OPS: Record<number, string> = {
    0x7e: 'OP_CAT',
    0x7f: 'OP_SUBSTR',
    0x80: 'OP_LEFT',
    0x81: 'OP_RIGHT',
    0x83: 'OP_INVERT',
    0x84: 'OP_AND',
    0x85: 'OP_OR',
    0x86: 'OP_XOR',
    0x8d: 'OP_2MUL',
    0x8e: 'OP_2DIV',
    0x95: 'OP_MUL',
    0x96: 'OP_DIV',
    0x97: 'OP_MOD',
    0x98: 'OP_LSHIFT',
    0x99: 'OP_RSHIFT',
  };
  
  for (let i = 0; i < scriptBytes.length; i++) {
    const op = scriptBytes[i];
    if (DISABLED_OPS[op]) {
      dangerous.push(DISABLED_OPS[op]);
    }
  }
  
  return dangerous;
}

/**
 * Validates script size for different contexts
 */
export function validateScriptSize(scriptHex: string, context: 'scriptSig' | 'scriptPubKey' | 'witnessScript'): ScriptValidationResult {
  const cleanHex = scriptHex.startsWith('0x') ? scriptHex.slice(2) : scriptHex;
  const sizeBytes = cleanHex.length / 2;
  
  // Different size limits for different contexts
  const limits = {
    scriptSig: 1650,      // Standard scriptSig limit
    scriptPubKey: 10000,  // Maximum scriptPubKey size
    witnessScript: 10000, // Maximum witness script size
  };
  
  const limit = limits[context];
  
  if (sizeBytes > limit) {
    return { 
      isValid: false, 
      error: `Script size (${sizeBytes} bytes) exceeds ${context} limit (${limit} bytes)` 
    };
  }
  
  return { isValid: true };
}

/**
 * Validates witness data
 */
export function validateWitnessData(witness: string[]): ScriptValidationResult {
  if (!Array.isArray(witness)) {
    return { isValid: false, error: 'Witness must be an array' };
  }
  
  const warnings: string[] = [];
  
  // Check witness item count
  if (witness.length === 0) {
    return { isValid: false, error: 'Witness cannot be empty' };
  }
  
  if (witness.length > 100) {
    return { isValid: false, error: 'Too many witness items (max 100)' };
  }
  
  // Validate each witness item
  for (let i = 0; i < witness.length; i++) {
    const item = witness[i];
    
    if (typeof item !== 'string') {
      return { isValid: false, error: `Witness item ${i} must be a string` };
    }
    
    // Check hex format
    const cleanHex = item.startsWith('0x') ? item.slice(2) : item;
    if (!/^[0-9a-fA-F]*$/.test(cleanHex)) {
      return { isValid: false, error: `Witness item ${i} must be valid hex` };
    }
    
    // Check size
    if (cleanHex.length > 10000) {
      return { isValid: false, error: `Witness item ${i} exceeds maximum size` };
    }
  }
  
  return {
    isValid: true,
    warnings: warnings.length > 0 ? warnings : undefined
  };
}

/**
 * Estimates script complexity for fee calculation
 */
export function estimateScriptComplexity(scriptHex: string): number {
  const cleanHex = scriptHex.startsWith('0x') ? scriptHex.slice(2) : scriptHex;
  const scriptBytes = hex.decode(cleanHex);
  
  let complexity = 0;
  
  // Base complexity from size
  complexity += scriptBytes.length;
  
  // Add complexity for signature operations
  for (const byte of scriptBytes) {
    if (byte === OPCODES.OP_CHECKSIG || byte === OPCODES.OP_CHECKMULTISIG) {
      complexity += 50; // Signature operations are expensive
    }
  }
  
  return complexity;
}