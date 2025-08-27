/**
 * Cryptographic validation utilities for key derivation, entropy, and seed phrases
 */

export interface CryptoValidationResult {
  isValid: boolean;
  error?: string;
  warnings?: string[];
  entropy?: {
    bits: number;
    strength: 'weak' | 'fair' | 'good' | 'strong';
  };
}

/**
 * BIP32 derivation path validation
 */
export function validateDerivationPath(path: string): CryptoValidationResult {
  if (typeof path !== 'string') {
    return { isValid: false, error: 'Derivation path must be a string' };
  }

  const trimmed = path.trim();
  
  if (!trimmed) {
    return { isValid: false, error: 'Derivation path cannot be empty' };
  }

  // Check for injection attempts
  if (/[<>{}();]/.test(trimmed)) {
    return { isValid: false, error: 'Invalid characters in derivation path' };
  }

  const warnings: string[] = [];
  
  // Standard BIP32 path format: m/purpose'/coin_type'/account'/change/address_index
  const pathRegex = /^m(\/\d+'?)*$/;
  
  if (!pathRegex.test(trimmed)) {
    return { isValid: false, error: 'Invalid derivation path format' };
  }

  const components = trimmed.split('/');
  
  // Check depth
  if (components.length > 10) {
    return { isValid: false, error: 'Derivation path too deep (max 10 levels)' };
  }
  
  if (components.length < 2) {
    warnings.push('Derivation path is very short');
  }

  // Validate each component
  for (let i = 1; i < components.length; i++) {
    const component = components[i];
    const isHardened = component.endsWith("'");
    const index = isHardened ? component.slice(0, -1) : component;
    
    // Check if it's a valid number
    if (!/^\d+$/.test(index)) {
      return { isValid: false, error: `Invalid index at position ${i}: ${component}` };
    }
    
    const indexNum = parseInt(index, 10);
    
    // Check bounds (2^31 for non-hardened, 2^31 - 1 for hardened)
    if (indexNum >= 2147483648) {
      return { isValid: false, error: `Index too large at position ${i}: ${component}` };
    }
    
    // Warn about non-standard paths
    if (i === 1) {
      // Purpose field
      const knownPurposes = [44, 49, 84, 86]; // BIP44, BIP49, BIP84, BIP86
      if (!knownPurposes.includes(indexNum)) {
        warnings.push(`Non-standard purpose: ${indexNum}`);
      }
      if (!isHardened) {
        warnings.push('Purpose field should be hardened');
      }
    } else if (i === 2) {
      // Coin type field
      if (indexNum !== 0 && indexNum !== 1) { // 0 = Bitcoin, 1 = Testnet
        warnings.push(`Non-Bitcoin coin type: ${indexNum}`);
      }
      if (!isHardened) {
        warnings.push('Coin type field should be hardened');
      }
    } else if (i === 3) {
      // Account field
      if (indexNum > 100) {
        warnings.push(`Large account index: ${indexNum}`);
      }
      if (!isHardened) {
        warnings.push('Account field should be hardened');
      }
    } else if (i === 4) {
      // Change field
      if (indexNum !== 0 && indexNum !== 1) {
        warnings.push(`Invalid change value: ${indexNum} (should be 0 or 1)`);
      }
      if (isHardened) {
        warnings.push('Change field should not be hardened');
      }
    } else if (i === 5) {
      // Address index field
      if (indexNum > 10000) {
        warnings.push(`Very large address index: ${indexNum}`);
      }
      if (isHardened) {
        warnings.push('Address index should not be hardened');
      }
    }
  }

  // Check for known vulnerable paths
  const vulnerablePaths = [
    'm/0',
    'm/0/0',
    'm/1',
    'm/1/1',
  ];
  
  if (vulnerablePaths.includes(trimmed)) {
    warnings.push('This derivation path is considered weak');
  }

  return {
    isValid: true,
    warnings: warnings.length > 0 ? warnings : undefined
  };
}

/**
 * Validates seed phrase (mnemonic) entropy and security
 */
export function validateSeedPhraseEntropy(seedPhrase: string): CryptoValidationResult {
  if (typeof seedPhrase !== 'string') {
    return { isValid: false, error: 'Seed phrase must be a string' };
  }

  const trimmed = seedPhrase.trim().toLowerCase();
  
  if (!trimmed) {
    return { isValid: false, error: 'Seed phrase cannot be empty' };
  }

  // Split into words
  const words = trimmed.split(/\s+/);
  const warnings: string[] = [];

  // Check word count (BIP39 allows 12, 15, 18, 21, or 24 words)
  const validWordCounts = [12, 15, 18, 21, 24];
  if (!validWordCounts.includes(words.length)) {
    return { 
      isValid: false, 
      error: `Invalid word count: ${words.length}. Must be one of: ${validWordCounts.join(', ')}` 
    };
  }

  // Calculate entropy bits
  const entropyBits = (words.length * 11) - (words.length / 3);
  
  // Determine entropy strength
  let strength: 'weak' | 'fair' | 'good' | 'strong';
  if (entropyBits < 128) {
    strength = 'weak';
    warnings.push('Seed phrase has weak entropy (< 128 bits)');
  } else if (entropyBits < 192) {
    strength = 'fair';
  } else if (entropyBits < 256) {
    strength = 'good';
  } else {
    strength = 'strong';
  }

  // Check for repeated words (reduces entropy)
  const uniqueWords = new Set(words);
  if (uniqueWords.size < words.length) {
    warnings.push('Seed phrase contains repeated words, reducing entropy');
  }

  // Check for sequential patterns
  if (hasSequentialPattern(words)) {
    warnings.push('Seed phrase appears to have a sequential pattern');
  }

  // Check for common weak patterns
  const weakPatterns = [
    'abandon '.repeat(11) + 'about',
    'abandon '.repeat(23) + 'art',
    'zoo '.repeat(23) + 'zone',
  ];
  
  if (weakPatterns.some(pattern => trimmed === pattern.trim())) {
    return { isValid: false, error: 'This is a known weak test seed phrase' };
  }

  // Check for all same word
  if (uniqueWords.size === 1) {
    return { isValid: false, error: 'Seed phrase cannot be all the same word' };
  }

  return {
    isValid: true,
    warnings: warnings.length > 0 ? warnings : undefined,
    entropy: {
      bits: entropyBits,
      strength
    }
  };
}

/**
 * Checks for sequential patterns in word list
 */
function hasSequentialPattern(words: string[]): boolean {
  // Check if words are alphabetically sequential
  for (let i = 1; i < words.length; i++) {
    if (words[i].localeCompare(words[i - 1]) !== 1) {
      return false;
    }
  }
  return true;
}

/**
 * Validates entropy source quality
 */
export function validateEntropySource(entropy: Uint8Array | string): CryptoValidationResult {
  let entropyBytes: Uint8Array;
  const warnings: string[] = [];

  if (typeof entropy === 'string') {
    // Convert hex string to bytes
    const cleanHex = entropy.replace(/^0x/, '');
    
    if (!/^[0-9a-fA-F]*$/.test(cleanHex)) {
      return { isValid: false, error: 'Entropy must be valid hexadecimal' };
    }
    
    if (cleanHex.length % 2 !== 0) {
      return { isValid: false, error: 'Entropy hex must have even length' };
    }
    
    entropyBytes = new Uint8Array(cleanHex.length / 2);
    for (let i = 0; i < cleanHex.length; i += 2) {
      entropyBytes[i / 2] = parseInt(cleanHex.substr(i, 2), 16);
    }
  } else if (entropy instanceof Uint8Array) {
    entropyBytes = entropy;
  } else {
    return { isValid: false, error: 'Entropy must be a hex string or Uint8Array' };
  }

  // Check minimum entropy (128 bits = 16 bytes)
  if (entropyBytes.length < 16) {
    return { isValid: false, error: 'Insufficient entropy (minimum 128 bits)' };
  }

  // Check maximum entropy (512 bits = 64 bytes)
  if (entropyBytes.length > 64) {
    warnings.push('Excessive entropy (> 512 bits) may be unnecessary');
  }

  // Calculate entropy quality metrics
  const entropyBits = entropyBytes.length * 8;
  const uniqueBytes = new Set(entropyBytes).size;
  const uniquenessRatio = uniqueBytes / entropyBytes.length;

  // Check for low entropy patterns
  if (uniquenessRatio < 0.5) {
    warnings.push('Low byte diversity in entropy');
  }

  // Check for all zeros or all ones
  const allZeros = entropyBytes.every(b => b === 0);
  const allOnes = entropyBytes.every(b => b === 0xFF);
  
  if (allZeros || allOnes) {
    return { isValid: false, error: 'Entropy appears to be all zeros or all ones' };
  }

  // Check for sequential bytes
  let sequential = true;
  for (let i = 1; i < entropyBytes.length; i++) {
    if (entropyBytes[i] !== (entropyBytes[i - 1] + 1) % 256) {
      sequential = false;
      break;
    }
  }
  
  if (sequential) {
    warnings.push('Entropy contains sequential byte pattern');
  }

  // Determine entropy strength
  let strength: 'weak' | 'fair' | 'good' | 'strong';
  if (entropyBits < 128 || uniquenessRatio < 0.3) {
    strength = 'weak';
  } else if (entropyBits < 192 || uniquenessRatio < 0.6) {
    strength = 'fair';
  } else if (entropyBits < 256 || uniquenessRatio < 0.8) {
    strength = 'good';
  } else {
    strength = 'strong';
  }

  return {
    isValid: true,
    warnings: warnings.length > 0 ? warnings : undefined,
    entropy: {
      bits: entropyBits,
      strength
    }
  };
}

/**
 * Validates hardware wallet communication parameters
 */
export function validateHardwareWalletParams(params: any): CryptoValidationResult {
  if (!params || typeof params !== 'object') {
    return { isValid: false, error: 'Hardware wallet params must be an object' };
  }

  const warnings: string[] = [];

  // Validate device type
  if (params.deviceType) {
    const supportedDevices = ['ledger', 'trezor', 'coldcard', 'bitbox', 'keepkey'];
    if (!supportedDevices.includes(params.deviceType.toLowerCase())) {
      warnings.push(`Unknown device type: ${params.deviceType}`);
    }
  }

  // Validate communication protocol
  if (params.protocol) {
    const supportedProtocols = ['webusb', 'webhid', 'u2f', 'webauthn'];
    if (!supportedProtocols.includes(params.protocol.toLowerCase())) {
      return { isValid: false, error: `Unsupported protocol: ${params.protocol}` };
    }
  }

  // Validate timeout
  if (params.timeout !== undefined) {
    if (typeof params.timeout !== 'number') {
      return { isValid: false, error: 'Timeout must be a number' };
    }
    
    if (params.timeout < 0) {
      return { isValid: false, error: 'Timeout cannot be negative' };
    }
    
    if (params.timeout > 300000) { // 5 minutes
      warnings.push('Very long timeout may cause UX issues');
    }
  }

  // Validate account index
  if (params.accountIndex !== undefined) {
    if (typeof params.accountIndex !== 'number') {
      return { isValid: false, error: 'Account index must be a number' };
    }
    
    if (params.accountIndex < 0) {
      return { isValid: false, error: 'Account index cannot be negative' };
    }
    
    if (params.accountIndex >= 2147483648) {
      return { isValid: false, error: 'Account index too large' };
    }
    
    if (params.accountIndex > 100) {
      warnings.push('Large account index may not be supported by all devices');
    }
  }

  // Validate PIN/passphrase policies
  if (params.requirePin === false) {
    warnings.push('Disabling PIN requirement reduces security');
  }

  if (params.skipPassphrase === true) {
    warnings.push('Skipping passphrase reduces security');
  }

  // Check for dangerous operations
  if (params.allowUnsafe === true) {
    warnings.push('Unsafe operations are enabled');
  }

  if (params.debugMode === true) {
    warnings.push('Debug mode should not be enabled in production');
  }

  return {
    isValid: true,
    warnings: warnings.length > 0 ? warnings : undefined
  };
}

/**
 * Estimates password strength based on entropy
 */
export function estimatePasswordStrength(password: string): CryptoValidationResult {
  if (typeof password !== 'string') {
    return { isValid: false, error: 'Password must be a string' };
  }

  if (password.length === 0) {
    return { isValid: false, error: 'Password cannot be empty' };
  }

  const warnings: string[] = [];
  
  // Calculate character set size
  let charsetSize = 0;
  if (/[a-z]/.test(password)) charsetSize += 26;
  if (/[A-Z]/.test(password)) charsetSize += 26;
  if (/[0-9]/.test(password)) charsetSize += 10;
  if (/[^a-zA-Z0-9]/.test(password)) charsetSize += 32; // Common special chars

  // Calculate entropy
  const entropyBits = Math.log2(Math.pow(charsetSize, password.length));
  
  // Check minimum length
  if (password.length < 8) {
    warnings.push('Password is shorter than recommended minimum (8 characters)');
  }

  // Check for common weak patterns
  const weakPatterns = [
    /^12345/,
    /^password/i,
    /^qwerty/i,
    /^admin/i,
    /^letmein/i,
    /^welcome/i,
    /^monkey/i,
    /^dragon/i,
  ];

  if (weakPatterns.some(pattern => pattern.test(password))) {
    warnings.push('Password contains common weak pattern');
  }

  // Check for repeated characters
  if (/(.)\1{2,}/.test(password)) {
    warnings.push('Password contains repeated characters');
  }

  // Check for sequential characters
  for (let i = 2; i < password.length; i++) {
    const prev2 = password.charCodeAt(i - 2);
    const prev1 = password.charCodeAt(i - 1);
    const curr = password.charCodeAt(i);
    
    if (prev1 - prev2 === 1 && curr - prev1 === 1) {
      warnings.push('Password contains sequential characters');
      break;
    }
  }

  // Determine strength
  let strength: 'weak' | 'fair' | 'good' | 'strong';
  if (entropyBits < 30) {
    strength = 'weak';
  } else if (entropyBits < 50) {
    strength = 'fair';
  } else if (entropyBits < 70) {
    strength = 'good';
  } else {
    strength = 'strong';
  }

  // Additional warnings based on entropy
  if (entropyBits < 40) {
    warnings.push('Password has low entropy (< 40 bits)');
  }

  return {
    isValid: true,
    warnings: warnings.length > 0 ? warnings : undefined,
    entropy: {
      bits: Math.floor(entropyBits),
      strength
    }
  };
}