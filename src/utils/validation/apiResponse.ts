/**
 * API Response validation utilities for external API calls
 */

export interface ValidationResult {
  isValid: boolean;
  error?: string;
  sanitized?: any;
}

export interface UTXOResponse {
  txid: string;
  vout: number;
  status: {
    confirmed: boolean;
    block_height: number;
    block_hash: string;
    block_time: number;
  };
  value: number;
}

export interface BalanceResponse {
  chain_stats?: {
    funded_txo_sum: string | number;
    spent_txo_sum: string | number;
  };
  mempool_stats?: {
    funded_txo_sum: string | number;
    spent_txo_sum: string | number;
  };
  final_balance?: number;
  data?: {
    confirmed_balance: string | number;
  };
}

/**
 * Validates UTXO response from external APIs
 */
export function validateUTXOResponse(response: any): ValidationResult {
  if (!Array.isArray(response)) {
    return { isValid: false, error: 'UTXO response must be an array' };
  }

  const sanitized: UTXOResponse[] = [];

  for (let i = 0; i < response.length; i++) {
    const utxo = response[i];
    
    if (!utxo || typeof utxo !== 'object') {
      return { isValid: false, error: `Invalid UTXO at index ${i}: not an object` };
    }

    // Validate txid
    if (!utxo.txid || typeof utxo.txid !== 'string') {
      return { isValid: false, error: `Invalid UTXO at index ${i}: missing or invalid txid` };
    }

    if (!/^[0-9a-fA-F]{64}$/.test(utxo.txid)) {
      return { isValid: false, error: `Invalid UTXO at index ${i}: txid must be 64-character hex` };
    }

    // Validate vout
    if (typeof utxo.vout !== 'number' || utxo.vout < 0 || !Number.isInteger(utxo.vout)) {
      return { isValid: false, error: `Invalid UTXO at index ${i}: vout must be non-negative integer` };
    }

    if (utxo.vout > 4294967295) { // 2^32 - 1
      return { isValid: false, error: `Invalid UTXO at index ${i}: vout exceeds maximum value` };
    }

    // Validate status
    if (!utxo.status || typeof utxo.status !== 'object') {
      return { isValid: false, error: `Invalid UTXO at index ${i}: missing or invalid status` };
    }

    // Validate confirmed flag
    if (typeof utxo.status.confirmed !== 'boolean') {
      return { isValid: false, error: `Invalid UTXO at index ${i}: confirmed must be boolean` };
    }

    // Validate block_height
    if (typeof utxo.status.block_height !== 'number' || 
        utxo.status.block_height < 0 || 
        !Number.isInteger(utxo.status.block_height)) {
      return { isValid: false, error: `Invalid UTXO at index ${i}: invalid block_height` };
    }

    // Validate block_hash
    if (!utxo.status.block_hash || typeof utxo.status.block_hash !== 'string') {
      return { isValid: false, error: `Invalid UTXO at index ${i}: missing or invalid block_hash` };
    }

    if (!/^[0-9a-fA-F]{64}$/.test(utxo.status.block_hash)) {
      return { isValid: false, error: `Invalid UTXO at index ${i}: block_hash must be 64-character hex` };
    }

    // Validate block_time
    if (typeof utxo.status.block_time !== 'number' || utxo.status.block_time < 0) {
      return { isValid: false, error: `Invalid UTXO at index ${i}: invalid block_time` };
    }

    // Validate value
    if (typeof utxo.value !== 'number' || utxo.value < 0) {
      return { isValid: false, error: `Invalid UTXO at index ${i}: value must be non-negative number` };
    }

    if (utxo.value > 2100000000000000) { // Max Bitcoin supply in satoshis
      return { isValid: false, error: `Invalid UTXO at index ${i}: value exceeds maximum Bitcoin supply` };
    }

    sanitized.push({
      txid: utxo.txid,
      vout: utxo.vout,
      status: {
        confirmed: utxo.status.confirmed,
        block_height: utxo.status.block_height,
        block_hash: utxo.status.block_hash,
        block_time: utxo.status.block_time,
      },
      value: utxo.value,
    });
  }

  // Limit array size to prevent DoS
  if (sanitized.length > 10000) {
    return { isValid: false, error: 'Too many UTXOs in response' };
  }

  return { isValid: true, sanitized };
}

/**
 * Validates balance response from external APIs
 */
export function validateBalanceResponse(response: any, endpoint: string): ValidationResult {
  if (!response || typeof response !== 'object') {
    return { isValid: false, error: 'Response must be an object' };
  }

  try {
    let balance: number | null = null;
    
    // Parse endpoint URL to extract hostname for secure comparison
    let hostname: string;
    try {
      const url = new URL(endpoint);
      hostname = url.hostname;
    } catch (e) {
      return { isValid: false, error: 'Invalid endpoint URL' };
    }
    
    // Define allowed hosts for each API provider
    const blockstreamHosts = ['blockstream.info', 'mempool.space'];
    const blockcypherHosts = ['blockcypher.com', 'api.blockcypher.com'];
    const blockchainInfoHosts = ['blockchain.info', 'api.blockchain.info'];
    const sochainHosts = ['sochain.com', 'api.sochain.com', 'chain.so'];

    // Handle different API formats
    if (blockstreamHosts.includes(hostname)) {
      if (!response.chain_stats || typeof response.chain_stats !== 'object') {
        return { isValid: false, error: 'Missing chain_stats in response' };
      }

      const funded = parseBalanceValue(response.chain_stats.funded_txo_sum);
      const spent = parseBalanceValue(response.chain_stats.spent_txo_sum);

      if (funded === null || spent === null) {
        return { isValid: false, error: 'Invalid chain_stats values' };
      }

      let memFunded = 0;
      let memSpent = 0;

      if (response.mempool_stats) {
        const mf = parseBalanceValue(response.mempool_stats.funded_txo_sum);
        const ms = parseBalanceValue(response.mempool_stats.spent_txo_sum);
        if (mf !== null && ms !== null) {
          memFunded = mf;
          memSpent = ms;
        }
      }

      balance = funded - spent + memFunded - memSpent;
    } else if (blockcypherHosts.includes(hostname) || blockchainInfoHosts.includes(hostname)) {
      balance = parseBalanceValue(response.final_balance);
    } else if (sochainHosts.includes(hostname)) {
      if (!response.data || typeof response.data !== 'object') {
        return { isValid: false, error: 'Missing data object in sochain response' };
      }

      const confirmedBalance = parseBalanceValue(response.data.confirmed_balance);
      if (confirmedBalance === null) {
        return { isValid: false, error: 'Invalid confirmed_balance in sochain response' };
      }

      balance = Math.round(confirmedBalance * 1e8);
    }

    if (balance === null) {
      return { isValid: false, error: 'Could not parse balance from response' };
    }

    if (balance < 0) {
      return { isValid: false, error: 'Balance cannot be negative' };
    }

    if (balance > 2100000000000000) { // Max Bitcoin supply in satoshis
      return { isValid: false, error: 'Balance exceeds maximum Bitcoin supply' };
    }

    return { isValid: true, sanitized: balance };
  } catch (error) {
    return { isValid: false, error: `Error parsing balance response: ${error}` };
  }
}

/**
 * Parses a balance value that could be string or number
 */
function parseBalanceValue(value: any): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === 'string') {
    // Check for potential injection
    if (/^[=@+\-]/.test(value.trim())) {
      return null;
    }

    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

/**
 * Validates URL to prevent SSRF attacks
 */
export function validateAPIURL(url: string): ValidationResult {
  if (!url || typeof url !== 'string') {
    return { isValid: false, error: 'URL must be a string' };
  }

  // Remove potential whitespace
  const trimmedUrl = url.trim();

  // Check for formula injection
  if (/^[=@+\-]/.test(trimmedUrl)) {
    return { isValid: false, error: 'Invalid URL format' };
  }

  // Check for path traversal in raw URL before parsing (URL parser normalizes these)
  if (trimmedUrl.includes('..') || trimmedUrl.includes('%2e%2e')) {
    return { isValid: false, error: 'Path traversal detected' };
  }

  try {
    const urlObj = new URL(trimmedUrl);

    // Only allow HTTPS
    if (urlObj.protocol !== 'https:') {
      return { isValid: false, error: 'Only HTTPS URLs are allowed' };
    }

    // Check for localhost/private IPs to prevent SSRF (before domain whitelist)
    const hostname = urlObj.hostname.toLowerCase();
    const privateIPPatterns = [
      /^127\./,
      /^10\./,
      /^172\.(1[6-9]|2[0-9]|3[01])\./,
      /^192\.168\./,
      /^169\.254\./, // Link-local
      /^::1$/, // IPv6 localhost
      /^fc00:/, // IPv6 private
    ];

    if (hostname === 'localhost' || privateIPPatterns.some(pattern => pattern.test(hostname))) {
      return { isValid: false, error: 'Private/local addresses not allowed' };
    }

    // Whitelist allowed domains
    const allowedDomains = [
      'blockstream.info',
      'mempool.space',
      'api.blockcypher.com',
      'blockchain.info',
      'sochain.com',
    ];

    if (!allowedDomains.some(domain => urlObj.hostname === domain || urlObj.hostname.endsWith('.' + domain))) {
      return { isValid: false, error: 'Domain not in whitelist' };
    }

    return { isValid: true, sanitized: trimmedUrl };
  } catch (error) {
    return { isValid: false, error: 'Invalid URL format' };
  }
}

/**
 * Validates response size to prevent DoS
 */
export function validateResponseSize(data: any): ValidationResult {
  const jsonString = JSON.stringify(data);
  
  if (jsonString.length > 10 * 1024 * 1024) { // 10MB limit
    return { isValid: false, error: 'Response too large' };
  }

  return { isValid: true };
}

/**
 * Sanitizes API response by removing dangerous properties
 */
export function sanitizeAPIResponse(response: any, visited = new WeakSet()): any {
  if (!response || typeof response !== 'object') {
    return response;
  }

  // Handle circular references
  if (visited.has(response)) {
    return {}; // Return empty object for circular references
  }
  visited.add(response);

  if (Array.isArray(response)) {
    return response.map(item => sanitizeAPIResponse(item, visited));
  }

  const sanitized: any = {};
  
  for (const [key, value] of Object.entries(response)) {
    // Skip potentially dangerous keys
    if (typeof key === 'string' && /^(__proto__|constructor|prototype)$/.test(key)) {
      continue;
    }

    // Skip functions
    if (typeof value === 'function') {
      continue;
    }

    // Recursively sanitize objects
    if (value && typeof value === 'object') {
      sanitized[key] = sanitizeAPIResponse(value, visited);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}