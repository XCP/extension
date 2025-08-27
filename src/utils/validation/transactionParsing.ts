/**
 * Transaction parsing validation utilities for security
 */

export interface TransactionValidationResult {
  isValid: boolean;
  error?: string;
  warnings?: string[];
}

export interface SafeTransactionParams {
  type?: string;
  method?: string;
  asset?: string;
  quantity?: number | string;
  destination?: string;
  to?: string;
  [key: string]: any;
}

/**
 * Validates raw transaction hex string
 */
export function validateRawTransactionHex(rawTxHex: string): TransactionValidationResult {
  if (typeof rawTxHex !== 'string') {
    return { isValid: false, error: 'Raw transaction must be a string' };
  }

  const trimmed = rawTxHex.trim();
  
  if (!trimmed) {
    return { isValid: false, error: 'Raw transaction cannot be empty' };
  }

  // Check for formula injection attempts
  if (/^[=@+\-]/.test(trimmed)) {
    return { isValid: false, error: 'Invalid transaction format' };
  }

  // Validate hex format
  if (!/^[0-9a-fA-F]+$/.test(trimmed)) {
    return { isValid: false, error: 'Transaction must be valid hexadecimal' };
  }

  // Check length constraints (reasonable Bitcoin transaction limits)
  if (trimmed.length < 60) { // Minimum realistic transaction size
    return { isValid: false, error: 'Transaction too short to be valid' };
  }

  if (trimmed.length > 2000000) { // 1MB limit * 2 (hex encoding)
    return { isValid: false, error: 'Transaction exceeds maximum size' };
  }

  // Length must be even (valid hex encoding)
  if (trimmed.length % 2 !== 0) {
    return { isValid: false, error: 'Invalid hex encoding - odd length' };
  }

  return { isValid: true };
}

/**
 * Validates transaction parameters for safety
 */
export function validateTransactionParams(params: any): TransactionValidationResult {
  if (!params || typeof params !== 'object') {
    return { isValid: true }; // Params are optional
  }

  const warnings: string[] = [];
  
  // Check for dangerous parameter values
  if (params.quantity) {
    const qty = typeof params.quantity === 'string' ? 
      parseFloat(params.quantity) : params.quantity;
    
    if (isNaN(qty)) {
      return { isValid: false, error: 'Invalid quantity format' };
    }
    
    if (qty < 0) {
      return { isValid: false, error: 'Quantity cannot be negative' };
    }
    
    if (qty > Number.MAX_SAFE_INTEGER) {
      return { isValid: false, error: 'Quantity exceeds maximum safe value' };
    }

    // Warn about large amounts
    if (qty > 1000000) {
      warnings.push('Large quantity detected');
    }
  }

  // Validate asset name if present
  if (params.asset) {
    if (typeof params.asset !== 'string') {
      return { isValid: false, error: 'Asset name must be a string' };
    }

    const asset = params.asset.trim();
    
    // Check for injection attempts
    if (/^[=@+\-]/.test(asset)) {
      return { isValid: false, error: 'Invalid asset name format' };
    }

    // Basic asset name validation
    if (asset.length === 0) {
      return { isValid: false, error: 'Asset name cannot be empty' };
    }

    if (asset.length > 250) {
      return { isValid: false, error: 'Asset name too long' };
    }
  }

  // Validate addresses if present
  const addressFields = ['destination', 'to', 'transfer_destination'];
  for (const field of addressFields) {
    if (params[field]) {
      const addrResult = validateTransactionAddress(params[field]);
      if (!addrResult.isValid) {
        return { isValid: false, error: `Invalid ${field}: ${addrResult.error}` };
      }
    }
  }

  // Check for potentially dangerous operations
  if (params.lock === true || params.lock === 'true') {
    warnings.push('Asset will be permanently locked');
  }

  if (params.transfer_destination) {
    warnings.push('Asset ownership will be transferred');
  }

  if (params.status === '10' || params.status === 10) {
    warnings.push('Dispenser will be closed');
  }

  return { 
    isValid: true, 
    warnings: warnings.length > 0 ? warnings : undefined 
  };
}

/**
 * Validates Bitcoin addresses in transaction parameters
 */
function validateTransactionAddress(address: string): TransactionValidationResult {
  if (typeof address !== 'string') {
    return { isValid: false, error: 'Address must be a string' };
  }

  const trimmed = address.trim();
  
  if (!trimmed) {
    return { isValid: false, error: 'Address cannot be empty' };
  }

  // Check for injection attempts
  if (/^[=@+\-]/.test(trimmed)) {
    return { isValid: false, error: 'Invalid address format' };
  }

  // Check for path traversal
  if (trimmed.includes('..') || trimmed.includes('/')) {
    return { isValid: false, error: 'Invalid address format' };
  }

  // Basic Bitcoin address format validation
  const addressPatterns = [
    /^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/, // Legacy
    /^bc1[a-z0-9]{39,59}$/, // Bech32
    /^tb1[a-z0-9]{39,59}$/, // Testnet
  ];

  const isValidFormat = addressPatterns.some(pattern => pattern.test(trimmed));
  if (!isValidFormat) {
    return { isValid: false, error: 'Invalid Bitcoin address format' };
  }

  return { isValid: true };
}

/**
 * Validates transaction type and method parameters
 */
export function validateTransactionType(type: string, method?: string): TransactionValidationResult {
  const allowedTypes = [
    'send', 'order', 'issuance', 'dispenser', 'dividend', 
    'destroy', 'broadcast', 'bet', 'cancel'
  ];

  const allowedMethods = [
    'send', 'order', 'issuance', 'dispenser', 'dividend',
    'destroy', 'broadcast', 'bet', 'cancel'
  ];

  if (type && !allowedTypes.includes(type)) {
    return { isValid: false, error: `Unknown transaction type: ${type}` };
  }

  if (method && !allowedMethods.includes(method)) {
    return { isValid: false, error: `Unknown transaction method: ${method}` };
  }

  return { isValid: true };
}

/**
 * Sanitizes transaction parameters to remove potentially dangerous values
 */
export function sanitizeTransactionParams(params: any): SafeTransactionParams {
  if (!params || typeof params !== 'object') {
    return {};
  }

  const sanitized: SafeTransactionParams = {};
  
  // List of allowed parameter keys
  const allowedKeys = [
    'type', 'method', 'asset', 'quantity', 'destination', 'to',
    'give_quantity', 'get_quantity', 'give_asset', 'get_asset',
    'description', 'divisible', 'lock', 'transfer_destination',
    'escrow_quantity', 'mainchainrate', 'status', 'dividend_asset',
    'quantity_per_unit', 'expiration', 'fee', 'memo'
  ];

  for (const [key, value] of Object.entries(params)) {
    if (!allowedKeys.includes(key)) {
      continue; // Skip unknown parameters
    }

    // Sanitize string values
    if (typeof value === 'string') {
      // Remove potential injection attempts
      let sanitizedValue = value.replace(/^[=@+\-]/, '');
      
      // Remove control characters
      sanitizedValue = sanitizedValue.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
      
      // Limit string length
      if (sanitizedValue.length > 1000) {
        sanitizedValue = sanitizedValue.substring(0, 1000);
      }
      
      sanitized[key] = sanitizedValue;
    } else if (typeof value === 'number') {
      // Validate numeric values
      if (Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER) {
        sanitized[key] = value;
      }
    } else if (typeof value === 'boolean') {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Checks for potential ReDoS vulnerabilities in transaction data
 */
export function checkTransactionForReDoS(rawTxHex: string, params?: any): boolean {
  // Check raw transaction hex
  if (rawTxHex && rawTxHex.length > 1000000) { // 1MB limit
    return true;
  }

  // Check for suspicious patterns in parameters
  if (params && typeof params === 'object') {
    for (const [key, value] of Object.entries(params)) {
      if (typeof value === 'string') {
        // Very long strings
        if (value.length > 50000) {
          return true;
        }
        
        // Repeated patterns that could cause ReDoS
        if (/(.{1,10})\1{100,}/.test(value)) {
          return true;
        }
      }
    }
  }

  return false;
}

/**
 * Validates complete transaction parsing request
 */
export function validateTransactionParsingRequest(
  rawTxHex: string, 
  params?: any
): TransactionValidationResult {
  // Validate raw transaction hex
  const hexResult = validateRawTransactionHex(rawTxHex);
  if (!hexResult.isValid) {
    return hexResult;
  }

  // Check for ReDoS vulnerabilities
  if (checkTransactionForReDoS(rawTxHex, params)) {
    return { 
      isValid: false, 
      error: 'Transaction data contains patterns that may cause performance issues' 
    };
  }

  // Validate parameters if present
  const paramsResult = validateTransactionParams(params);
  if (!paramsResult.isValid) {
    return paramsResult;
  }

  // Validate transaction type if specified
  if (params && (params.type || params.method)) {
    const typeResult = validateTransactionType(params.type, params.method);
    if (!typeResult.isValid) {
      return typeResult;
    }
  }

  return { 
    isValid: true, 
    warnings: paramsResult.warnings 
  };
}

/**
 * Estimates memory usage of transaction parsing
 */
export function estimateTransactionParsingMemory(rawTxHex: string, params?: any): number {
  let estimatedBytes = 0;

  // Raw hex string memory
  estimatedBytes += rawTxHex.length * 2; // UTF-16 encoding

  // Buffer conversion memory
  estimatedBytes += rawTxHex.length / 2; // Binary representation

  // Parameters memory
  if (params) {
    const paramsJson = JSON.stringify(params);
    estimatedBytes += paramsJson.length * 2;
  }

  // Parsing overhead (approximate)
  estimatedBytes += 10000; // 10KB overhead

  return estimatedBytes;
}