/**
 * Message verification validation utilities
 */

export interface MessageVerificationResult {
  isValid: boolean;
  error?: string;
  addressType?: string;
  signatureFormat?: string;
}

/**
 * Validates message input for signing/verification
 */
export function validateMessage(message: string): MessageVerificationResult {
  if (typeof message !== 'string') {
    return { isValid: false, error: 'Message must be a string' };
  }

  // Check for formula injection attempts
  const trimmed = message.trim();
  if (/^[=@+\-]/.test(trimmed)) {
    return { isValid: false, error: 'Invalid message format' };
  }

  // Check for control characters that could cause issues
  if (/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(message)) {
    return { isValid: false, error: 'Message contains invalid control characters' };
  }

  // Check message length (reasonable limits for memory safety)
  if (message.length > 100000) { // 100KB limit
    return { isValid: false, error: 'Message too long' };
  }

  // Empty message should be allowed (can sign empty messages)
  return { isValid: true };
}

/**
 * Validates Bitcoin signature format
 */
export function validateSignatureFormat(signature: string): MessageVerificationResult {
  if (typeof signature !== 'string') {
    return { isValid: false, error: 'Signature must be a string' };
  }

  const trimmed = signature.trim();
  if (!trimmed) {
    return { isValid: false, error: 'Signature cannot be empty' };
  }

  // Check for formula injection
  if (/^[=@+\-]/.test(trimmed)) {
    return { isValid: false, error: 'Invalid signature format' };
  }

  // Handle Taproot signatures
  if (trimmed.startsWith('tr:')) {
    const sigHex = trimmed.slice(3);
    
    // Validate hex format and length
    if (!/^[0-9a-fA-F]{128}$/.test(sigHex)) {
      return { isValid: false, error: 'Invalid Taproot signature format' };
    }
    
    return { 
      isValid: true, 
      signatureFormat: 'taproot',
      addressType: 'P2TR' 
    };
  }

  // Validate base64 signature format
  try {
    // Check if it looks like base64
    if (!/^[A-Za-z0-9+/=]+$/.test(trimmed)) {
      return { isValid: false, error: 'Invalid signature characters' };
    }

    // Decode and validate length
    const decoded = Buffer.from(trimmed, 'base64');
    if (decoded.length !== 65) {
      return { isValid: false, error: 'Invalid signature length' };
    }

    const flag = decoded[0];
    let addressType: string;

    if (flag >= 27 && flag <= 30) {
      addressType = 'P2PKH (uncompressed)';
    } else if (flag >= 31 && flag <= 34) {
      addressType = 'P2PKH (compressed)';
    } else if (flag >= 35 && flag <= 38) {
      addressType = 'P2SH-P2WPKH';
    } else if (flag >= 39 && flag <= 42) {
      addressType = 'P2WPKH';
    } else {
      return { isValid: false, error: 'Invalid signature recovery flag' };
    }

    return { 
      isValid: true, 
      signatureFormat: 'base64',
      addressType 
    };

  } catch (error) {
    return { isValid: false, error: 'Invalid base64 signature format' };
  }
}

/**
 * Validates Bitcoin address for message verification
 */
export function validateAddressForVerification(address: string): MessageVerificationResult {
  if (typeof address !== 'string') {
    return { isValid: false, error: 'Address must be a string' };
  }

  const trimmed = address.trim();
  if (!trimmed) {
    return { isValid: false, error: 'Address cannot be empty' };
  }

  // Check for formula injection
  if (/^[=@+\-]/.test(trimmed)) {
    return { isValid: false, error: 'Invalid address format' };
  }

  // Check for suspicious patterns
  if (trimmed.includes('..') || trimmed.includes('/')) {
    return { isValid: false, error: 'Invalid address format' };
  }

  // Validate address format patterns
  let addressType: string;

  if (/^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(trimmed)) {
    // P2PKH or P2SH
    addressType = trimmed.startsWith('1') ? 'P2PKH' : 'P2SH';
  } else if (/^bc1[a-z0-9]{39,59}$/.test(trimmed)) {
    // Bech32 (SegWit v0 or v1)
    addressType = trimmed.startsWith('bc1q') ? 'P2WPKH/P2WSH' : 'P2TR';
  } else if (/^tb1[a-z0-9]{39,59}$/.test(trimmed)) {
    // Testnet bech32
    addressType = 'Testnet';
  } else {
    return { isValid: false, error: 'Invalid Bitcoin address format' };
  }

  // Length validation
  if (trimmed.length < 26 || trimmed.length > 62) {
    return { isValid: false, error: 'Invalid address length' };
  }

  return { 
    isValid: true, 
    addressType 
  };
}

/**
 * Validates signature compatibility with address type
 */
export function validateSignatureAddressCompatibility(
  signature: string, 
  address: string
): MessageVerificationResult {
  const sigResult = validateSignatureFormat(signature);
  if (!sigResult.isValid) {
    return sigResult;
  }

  const addrResult = validateAddressForVerification(address);
  if (!addrResult.isValid) {
    return addrResult;
  }

  // Check Taproot compatibility
  if (sigResult.signatureFormat === 'taproot') {
    if (!address.startsWith('bc1p') && !address.startsWith('tb1p')) {
      return { 
        isValid: false, 
        error: 'Taproot signature requires Taproot address (bc1p... or tb1p...)' 
      };
    }
  }

  // Check legacy signature compatibility
  if (sigResult.signatureFormat === 'base64') {
    const flag = Buffer.from(signature.trim(), 'base64')[0];
    
    // P2PKH signatures with P2PKH addresses
    if ((flag >= 27 && flag <= 34) && !address.match(/^[13]/)) {
      return {
        isValid: false,
        error: 'P2PKH signature requires P2PKH address'
      };
    }
    
    // SegWit signatures with SegWit addresses
    if ((flag >= 35 && flag <= 42) && !address.match(/^(3|bc1q|tb1q)/)) {
      return {
        isValid: false,
        error: 'SegWit signature requires SegWit address'
      };
    }
  }

  return { isValid: true };
}

/**
 * Sanitizes message for safe processing
 */
export function sanitizeMessage(message: string): string {
  if (typeof message !== 'string') {
    return '';
  }

  // Remove control characters but preserve newlines and tabs
  return message.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}

/**
 * Sanitizes signature for safe processing
 */
export function sanitizeSignature(signature: string): string {
  if (typeof signature !== 'string') {
    return '';
  }

  return signature.trim();
}

/**
 * Checks for potential ReDoS vulnerabilities in message content
 */
export function checkMessageForReDoS(message: string): boolean {
  // Common ReDoS patterns
  const redosPatterns = [
    /(\w*)*\w*/, // Nested quantifiers
    /(a+)+b/, // Catastrophic backtracking
    /^(a|a)*$/, // Exponential alternation
  ];

  // Check message length - very long strings can trigger ReDoS
  if (message.length > 10000) {
    return true;
  }

  // Check for suspicious repeated patterns
  if (/(.{1,10})\1{10,}/.test(message)) {
    return true;
  }

  return false;
}

/**
 * Validates message verification parameters as a complete set
 */
export function validateMessageVerificationParams(
  message: string,
  signature: string,
  address: string
): MessageVerificationResult {
  // Validate message
  const messageResult = validateMessage(message);
  if (!messageResult.isValid) {
    return messageResult;
  }

  // Check for ReDoS vulnerability
  if (checkMessageForReDoS(message)) {
    return { isValid: false, error: 'Message contains patterns that may cause performance issues' };
  }

  // Validate signature
  const signatureResult = validateSignatureFormat(signature);
  if (!signatureResult.isValid) {
    return signatureResult;
  }

  // Validate address
  const addressResult = validateAddressForVerification(address);
  if (!addressResult.isValid) {
    return addressResult;
  }

  // Validate compatibility
  const compatibilityResult = validateSignatureAddressCompatibility(signature, address);
  if (!compatibilityResult.isValid) {
    return compatibilityResult;
  }

  return { 
    isValid: true,
    signatureFormat: signatureResult.signatureFormat,
    addressType: addressResult.addressType
  };
}