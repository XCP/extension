/**
 * PSBT (Partially Signed Bitcoin Transaction) validation utilities
 */

import { hex } from '@scure/base';

export interface PSBTValidationResult {
  isValid: boolean;
  error?: string;
  warnings?: string[];
  stats?: {
    inputCount: number;
    outputCount: number;
    signatureCount: number;
    isFinalized: boolean;
  };
}

/**
 * PSBT magic bytes
 */
const PSBT_MAGIC = new Uint8Array([0x70, 0x73, 0x62, 0x74, 0xff]); // "psbt" + 0xff

/**
 * PSBT global types
 */
const PSBT_GLOBAL_TYPES = {
  UNSIGNED_TX: 0x00,
  XPUB: 0x01,
  VERSION: 0xfb,
  PROPRIETARY: 0xfc,
};

/**
 * PSBT input types
 */
const PSBT_INPUT_TYPES = {
  NON_WITNESS_UTXO: 0x00,
  WITNESS_UTXO: 0x01,
  PARTIAL_SIG: 0x02,
  SIGHASH_TYPE: 0x03,
  REDEEM_SCRIPT: 0x04,
  WITNESS_SCRIPT: 0x05,
  BIP32_DERIVATION: 0x06,
  FINAL_SCRIPTSIG: 0x07,
  FINAL_SCRIPTWITNESS: 0x08,
  POR_COMMITMENT: 0x09,
  RIPEMD160: 0x0a,
  SHA256: 0x0b,
  HASH160: 0x0c,
  HASH256: 0x0d,
  TAP_KEY_SIG: 0x13,
  TAP_SCRIPT_SIG: 0x14,
  TAP_LEAF_SCRIPT: 0x15,
  TAP_BIP32_DERIVATION: 0x16,
  TAP_INTERNAL_KEY: 0x17,
  TAP_MERKLE_ROOT: 0x18,
};

/**
 * PSBT output types
 */
const PSBT_OUTPUT_TYPES = {
  REDEEM_SCRIPT: 0x00,
  WITNESS_SCRIPT: 0x01,
  BIP32_DERIVATION: 0x02,
  TAP_INTERNAL_KEY: 0x05,
  TAP_TREE: 0x06,
  TAP_BIP32_DERIVATION: 0x07,
};

/**
 * Validates a PSBT hex string or base64
 */
export function validatePSBT(psbtData: string): PSBTValidationResult {
  if (typeof psbtData !== 'string') {
    return { isValid: false, error: 'PSBT must be a string' };
  }

  const trimmed = psbtData.trim();
  
  if (!trimmed) {
    return { isValid: false, error: 'PSBT cannot be empty' };
  }

  let psbtBytes: Uint8Array;
  
  try {
    // Try to decode as base64 first
    if (isBase64(trimmed)) {
      psbtBytes = base64ToBytes(trimmed);
    } else if (/^[0-9a-fA-F]+$/.test(trimmed.replace(/^0x/, ''))) {
      // Try as hex
      const cleanHex = trimmed.startsWith('0x') ? trimmed.slice(2) : trimmed;
      if (cleanHex.length % 2 !== 0) {
        return { isValid: false, error: 'PSBT hex must have even length' };
      }
      psbtBytes = hex.decode(cleanHex);
    } else {
      return { isValid: false, error: 'PSBT must be valid hex or base64' };
    }
  } catch (error) {
    return { isValid: false, error: 'Failed to decode PSBT' };
  }

  // Validate PSBT structure
  return validatePSBTBytes(psbtBytes);
}

/**
 * Validates PSBT byte array
 */
function validatePSBTBytes(psbtBytes: Uint8Array): PSBTValidationResult {
  const warnings: string[] = [];
  const stats = {
    inputCount: 0,
    outputCount: 0,
    signatureCount: 0,
    isFinalized: false,
  };

  // Check minimum size (magic + separator)
  if (psbtBytes.length < 6) {
    return { isValid: false, error: 'PSBT too short' };
  }

  // Check magic bytes
  for (let i = 0; i < PSBT_MAGIC.length; i++) {
    if (psbtBytes[i] !== PSBT_MAGIC[i]) {
      return { isValid: false, error: 'Invalid PSBT magic bytes' };
    }
  }

  let offset = PSBT_MAGIC.length;
  let hasUnsignedTx = false;
  
  // Parse global section
  while (offset < psbtBytes.length) {
    const { key, value, nextOffset, error } = readKeyValue(psbtBytes, offset);
    
    if (error) {
      return { isValid: false, error: `Global section: ${error}` };
    }
    
    offset = nextOffset;
    
    // End of global section
    if (key.length === 0) {
      break;
    }
    
    const keyType = key[0];
    
    if (keyType === PSBT_GLOBAL_TYPES.UNSIGNED_TX) {
      if (hasUnsignedTx) {
        return { isValid: false, error: 'Duplicate unsigned transaction' };
      }
      hasUnsignedTx = true;
      
      // Validate transaction structure
      const txValidation = validateTransactionBytes(value);
      if (!txValidation.isValid) {
        return { isValid: false, error: `Invalid transaction: ${txValidation.error}` };
      }
      
      stats.inputCount = txValidation.inputCount || 0;
      stats.outputCount = txValidation.outputCount || 0;
    }
  }
  
  if (!hasUnsignedTx) {
    return { isValid: false, error: 'Missing unsigned transaction' };
  }
  
  // Parse inputs
  let finalizedInputs = 0;
  for (let i = 0; i < stats.inputCount; i++) {
    const inputResult = parseInput(psbtBytes, offset);
    if (!inputResult.isValid) {
      return { isValid: false, error: `Input ${i}: ${inputResult.error}` };
    }
    
    offset = inputResult.nextOffset;
    stats.signatureCount += inputResult.signatureCount;
    
    if (inputResult.isFinalized) {
      finalizedInputs++;
    }
    
    if (inputResult.warnings) {
      warnings.push(...inputResult.warnings);
    }
  }
  
  stats.isFinalized = finalizedInputs === stats.inputCount && stats.inputCount > 0;
  
  // Parse outputs
  for (let i = 0; i < stats.outputCount; i++) {
    const outputResult = parseOutput(psbtBytes, offset);
    if (!outputResult.isValid) {
      return { isValid: false, error: `Output ${i}: ${outputResult.error}` };
    }
    
    offset = outputResult.nextOffset;
    
    if (outputResult.warnings) {
      warnings.push(...outputResult.warnings);
    }
  }
  
  // Check for trailing data
  if (offset < psbtBytes.length) {
    warnings.push('PSBT contains trailing data');
  }
  
  // Additional security checks
  if (stats.inputCount === 0) {
    warnings.push('PSBT has no inputs');
  }
  
  if (stats.outputCount === 0) {
    warnings.push('PSBT has no outputs');
  }
  
  if (stats.inputCount > 100) {
    warnings.push(`Large number of inputs (${stats.inputCount}) may cause performance issues`);
  }
  
  if (stats.outputCount > 100) {
    warnings.push(`Large number of outputs (${stats.outputCount}) may cause performance issues`);
  }
  
  return {
    isValid: true,
    warnings: warnings.length > 0 ? warnings : undefined,
    stats
  };
}

/**
 * Reads a key-value pair from PSBT bytes
 */
function readKeyValue(bytes: Uint8Array, offset: number): {
  key: Uint8Array;
  value: Uint8Array;
  nextOffset: number;
  error?: string;
} {
  if (offset >= bytes.length) {
    return { key: new Uint8Array(), value: new Uint8Array(), nextOffset: offset, error: 'Unexpected end of data' };
  }
  
  // Read key length
  const keyLen = readCompactSize(bytes, offset);
  if (keyLen.error) {
    return { key: new Uint8Array(), value: new Uint8Array(), nextOffset: offset, error: keyLen.error };
  }
  
  offset = keyLen.nextOffset;
  
  // Separator (empty key)
  if (keyLen.value === 0) {
    return { key: new Uint8Array(), value: new Uint8Array(), nextOffset: offset };
  }
  
  // Read key
  if (offset + keyLen.value > bytes.length) {
    return { key: new Uint8Array(), value: new Uint8Array(), nextOffset: offset, error: 'Key extends beyond data' };
  }
  
  const key = bytes.slice(offset, offset + keyLen.value);
  offset += keyLen.value;
  
  // Read value length
  const valueLen = readCompactSize(bytes, offset);
  if (valueLen.error) {
    return { key: new Uint8Array(), value: new Uint8Array(), nextOffset: offset, error: valueLen.error };
  }
  
  offset = valueLen.nextOffset;
  
  // Read value
  if (offset + valueLen.value > bytes.length) {
    return { key: new Uint8Array(), value: new Uint8Array(), nextOffset: offset, error: 'Value extends beyond data' };
  }
  
  const value = bytes.slice(offset, offset + valueLen.value);
  offset += valueLen.value;
  
  return { key, value, nextOffset: offset };
}

/**
 * Reads a compact size integer
 */
function readCompactSize(bytes: Uint8Array, offset: number): {
  value: number;
  nextOffset: number;
  error?: string;
} {
  if (offset >= bytes.length) {
    return { value: 0, nextOffset: offset, error: 'Cannot read compact size' };
  }
  
  const first = bytes[offset];
  
  if (first < 0xfd) {
    return { value: first, nextOffset: offset + 1 };
  } else if (first === 0xfd) {
    if (offset + 3 > bytes.length) {
      return { value: 0, nextOffset: offset, error: 'Insufficient data for compact size' };
    }
    const value = bytes[offset + 1] | (bytes[offset + 2] << 8);
    return { value, nextOffset: offset + 3 };
  } else if (first === 0xfe) {
    if (offset + 5 > bytes.length) {
      return { value: 0, nextOffset: offset, error: 'Insufficient data for compact size' };
    }
    const value = bytes[offset + 1] | 
                 (bytes[offset + 2] << 8) | 
                 (bytes[offset + 3] << 16) | 
                 (bytes[offset + 4] << 24);
    return { value, nextOffset: offset + 5 };
  } else {
    return { value: 0, nextOffset: offset, error: 'Compact size too large' };
  }
}

/**
 * Parses a PSBT input
 */
function parseInput(bytes: Uint8Array, offset: number): {
  isValid: boolean;
  error?: string;
  warnings?: string[];
  nextOffset: number;
  signatureCount: number;
  isFinalized: boolean;
} {
  let signatureCount = 0;
  let isFinalized = false;
  const warnings: string[] = [];
  
  while (offset < bytes.length) {
    const { key, value, nextOffset, error } = readKeyValue(bytes, offset);
    
    if (error) {
      return { isValid: false, error, nextOffset: offset, signatureCount, isFinalized };
    }
    
    offset = nextOffset;
    
    // End of input
    if (key.length === 0) {
      break;
    }
    
    const keyType = key[0];
    
    if (keyType === PSBT_INPUT_TYPES.PARTIAL_SIG) {
      signatureCount++;
      
      // Validate signature format
      if (value.length < 64 || value.length > 73) {
        warnings.push('Unusual signature size');
      }
    } else if (keyType === PSBT_INPUT_TYPES.FINAL_SCRIPTSIG || 
               keyType === PSBT_INPUT_TYPES.FINAL_SCRIPTWITNESS) {
      isFinalized = true;
    } else if (keyType === PSBT_INPUT_TYPES.SIGHASH_TYPE) {
      // Validate sighash type
      if (value.length !== 4) {
        warnings.push('Invalid sighash type size');
      }
    }
  }
  
  return { isValid: true, nextOffset: offset, signatureCount, isFinalized, warnings: warnings.length > 0 ? warnings : undefined };
}

/**
 * Parses a PSBT output
 */
function parseOutput(bytes: Uint8Array, offset: number): {
  isValid: boolean;
  error?: string;
  warnings?: string[];
  nextOffset: number;
} {
  const warnings: string[] = [];
  
  while (offset < bytes.length) {
    const { key, value, nextOffset, error } = readKeyValue(bytes, offset);
    
    if (error) {
      return { isValid: false, error, nextOffset: offset };
    }
    
    offset = nextOffset;
    
    // End of output
    if (key.length === 0) {
      break;
    }
    
    const keyType = key[0];
    
    if (keyType === PSBT_OUTPUT_TYPES.WITNESS_SCRIPT) {
      // Check witness script size
      if (value.length > 10000) {
        warnings.push('Large witness script may cause issues');
      }
    }
  }
  
  return { isValid: true, nextOffset: offset, warnings: warnings.length > 0 ? warnings : undefined };
}

/**
 * Basic transaction structure validation
 */
function validateTransactionBytes(txBytes: Uint8Array): {
  isValid: boolean;
  error?: string;
  inputCount?: number;
  outputCount?: number;
} {
  if (txBytes.length < 10) {
    return { isValid: false, error: 'Transaction too short' };
  }
  
  let offset = 4; // Skip version
  
  // Read input count
  const inputCount = readCompactSize(txBytes, offset);
  if (inputCount.error) {
    return { isValid: false, error: inputCount.error };
  }
  
  offset = inputCount.nextOffset;
  
  // Skip inputs (simplified - just advance offset)
  offset += inputCount.value * 36; // Minimum input size
  
  if (offset >= txBytes.length) {
    return { isValid: false, error: 'Transaction truncated' };
  }
  
  // Read output count
  const outputCount = readCompactSize(txBytes, offset);
  if (outputCount.error) {
    return { isValid: false, error: outputCount.error };
  }
  
  return {
    isValid: true,
    inputCount: inputCount.value,
    outputCount: outputCount.value
  };
}

/**
 * Checks if a string is base64
 */
function isBase64(str: string): boolean {
  // Basic base64 check
  return /^[A-Za-z0-9+/]*={0,2}$/.test(str.replace(/\s/g, ''));
}

/**
 * Converts base64 to bytes
 */
function base64ToBytes(base64: string): Uint8Array {
  const binaryString = atob(base64.replace(/\s/g, ''));
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Estimates PSBT size and complexity
 */
export function estimatePSBTComplexity(psbtData: string): {
  sizeBytes: number;
  complexity: number;
  estimatedFee?: number;
} {
  let sizeBytes = 0;
  
  if (isBase64(psbtData)) {
    sizeBytes = Math.floor(psbtData.length * 0.75);
  } else {
    const cleanHex = psbtData.replace(/^0x/, '');
    sizeBytes = cleanHex.length / 2;
  }
  
  // Base complexity from size
  let complexity = sizeBytes;
  
  // Add complexity for estimated operations
  const estimatedInputs = Math.max(1, Math.floor(sizeBytes / 200));
  const estimatedOutputs = Math.max(1, Math.floor(sizeBytes / 100));
  
  complexity += estimatedInputs * 50; // Input complexity
  complexity += estimatedOutputs * 20; // Output complexity
  
  // Rough fee estimation (1 sat/byte for standard)
  const estimatedFee = Math.ceil(sizeBytes * 1.5);
  
  return { sizeBytes, complexity, estimatedFee };
}

/**
 * Validates PSBT for specific security concerns
 */
export function validatePSBTSecurity(psbtData: string): PSBTValidationResult {
  const basicValidation = validatePSBT(psbtData);
  
  if (!basicValidation.isValid) {
    return basicValidation;
  }
  
  const warnings = basicValidation.warnings || [];
  
  // Check for suspicious patterns
  if (psbtData.includes('=====')) {
    warnings.push('PSBT contains suspicious padding pattern');
  }
  
  // Check size concerns
  const { sizeBytes } = estimatePSBTComplexity(psbtData);
  
  if (sizeBytes > 100000) {
    warnings.push('Very large PSBT may cause performance issues');
  }
  
  // Check if finalized but has partial signatures
  if (basicValidation.stats?.isFinalized && basicValidation.stats.signatureCount > 0) {
    warnings.push('PSBT is finalized but contains partial signatures');
  }
  
  return {
    ...basicValidation,
    warnings: warnings.length > 0 ? warnings : undefined
  };
}