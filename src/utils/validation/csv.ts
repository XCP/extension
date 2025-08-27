/**
 * CSV parsing and validation utilities
 * Pure functions with no external dependencies
 */

export interface CSVRow {
  address: string;
  asset: string;
  quantity: string;
  memo?: string;
}

export interface ParsedCSVRow extends CSVRow {
  lineNumber: number;
  quantityNum: number;
}

export interface CSVParseResult {
  success: boolean;
  rows?: ParsedCSVRow[];
  error?: string;
  errorLine?: number;
}

/**
 * Parse a CSV line handling quoted values
 * Handles: "quoted, values", unquoted, "mixed", values
 */
export function parseCSVLine(line: string): string[] {
  if (!line) return [];
  
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];
    
    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // Escaped quote
        current += '"';
        i++; // Skip next quote
      } else {
        // Toggle quote state
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      // End of field
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  
  // Always add the last field
  result.push(current.trim());
  
  return result;
}

/**
 * Detect if a line is a header row
 */
export function isHeaderRow(line: string): boolean {
  const normalized = line.toLowerCase();
  return (
    normalized.includes('address') &&
    normalized.includes('asset') &&
    normalized.includes('quantity')
  );
}

/**
 * Validate a Bitcoin address (basic validation for CSV processing)
 */
export function validateBitcoinAddressFormat(address: string): boolean {
  if (!address) return false;
  
  // Legacy (P2PKH) - starts with 1
  if (/^1[a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(address)) return true;
  
  // P2SH - starts with 3
  if (/^3[a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(address)) return true;
  
  // Native SegWit (P2WPKH) - starts with bc1q (42 chars total)
  if (/^bc1q[a-z0-9]{38}$/.test(address)) return true;
  
  // Taproot (P2TR) - starts with bc1p (62 chars total)
  if (/^bc1p[a-z0-9]{58}$/.test(address)) return true;
  
  // Testnet addresses
  if (/^[mn2][a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(address)) return true;
  if (/^tb1q[a-z0-9]{38}$/.test(address)) return true; // Testnet P2WPKH
  if (/^tb1p[a-z0-9]{58}$/.test(address)) return true; // Testnet P2TR
  
  return false;
}

/**
 * Validate a quantity value
 */
export function validateQuantity(quantity: string): { valid: boolean; value?: number; error?: string } {
  if (!quantity || quantity.trim() === '') {
    return { valid: false, error: 'Quantity is required' };
  }
  
  const trimmed = quantity.trim();
  
  // Check for injection attempts at the start
  if (trimmed && '=@+-'.includes(trimmed[0])) {
    return { valid: false, error: 'Invalid quantity format' };
  }
  
  // Check if it's a valid number format first
  if (!/^-?\d*\.?\d+$/.test(trimmed)) {
    return { valid: false, error: 'Quantity must be a number' };
  }
  
  const num = parseFloat(trimmed);
  
  if (isNaN(num)) {
    return { valid: false, error: 'Quantity must be a number' };
  }
  
  if (num <= 0) {
    return { valid: false, error: 'Quantity must be greater than 0' };
  }
  
  if (num > Number.MAX_SAFE_INTEGER) {
    return { valid: false, error: 'Quantity exceeds maximum value' };
  }
  
  return { valid: true, value: num };
}

/**
 * Check for CSV injection attempts
 */
export function detectCSVInjection(value: string): boolean {
  if (!value) return false;
  
  // Check for formula injection
  const firstChar = value.trim()[0];
  if ('=@+-'.includes(firstChar)) {
    return true;
  }
  
  // Check for common injection patterns
  const injectionPatterns = [
    /^=.*\(/,  // Excel formula
    /^@.*\(/,  // Lotus formula
    /^\+.*\(/, // Google Sheets
    /^-.*\(/,  // OpenOffice
    /\|.*cmd/i, // Command injection
    /\$\{.*\}/, // Template injection
  ];
  
  return injectionPatterns.some(pattern => pattern.test(value));
}

/**
 * Parse CSV text into rows
 */
export function parseCSV(text: string, options?: {
  skipHeader?: boolean;
  maxRows?: number;
  validateAddresses?: boolean;
  detectInjection?: boolean;
}): CSVParseResult {
  const opts = {
    skipHeader: true,
    maxRows: 10000,
    validateAddresses: true,
    detectInjection: true,
    ...options
  };
  
  if (!text || text.trim() === '') {
    return { success: false, error: 'CSV is empty' };
  }
  
  // Normalize line endings
  const normalizedText = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalizedText.split('\n');
  
  if (lines.length === 0) {
    return { success: false, error: 'No data found' };
  }
  
  const rows: ParsedCSVRow[] = [];
  let startIndex = 0;
  
  // Check for header
  if (opts.skipHeader && lines.length > 0 && isHeaderRow(lines[0])) {
    startIndex = 1;
  }
  
  // Check row limit
  const dataLines = lines.length - startIndex;
  if (dataLines > opts.maxRows) {
    return { 
      success: false, 
      error: `Too many rows (${dataLines}). Maximum allowed: ${opts.maxRows}` 
    };
  }
  
  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Skip empty lines
    if (!line) continue;
    
    const lineNumber = i + 1;
    const parts = parseCSVLine(line);
    
    // Validate minimum columns
    if (parts.length < 3) {
      return { 
        success: false, 
        error: `Invalid format. Expected at least Address, Asset, Quantity`,
        errorLine: lineNumber
      };
    }
    
    const [address, asset, quantity, memo = ''] = parts;
    
    // Check for injection
    if (opts.detectInjection) {
      const fields = [address, asset, quantity, memo];
      for (const field of fields) {
        if (detectCSVInjection(field)) {
          return {
            success: false,
            error: `Potential injection detected`,
            errorLine: lineNumber
          };
        }
      }
    }
    
    // Validate address
    if (opts.validateAddresses && !validateBitcoinAddressFormat(address)) {
      return {
        success: false,
        error: `Invalid Bitcoin address: ${address}`,
        errorLine: lineNumber
      };
    }
    
    // Validate asset
    if (!asset || asset.trim() === '') {
      return {
        success: false,
        error: 'Asset is required',
        errorLine: lineNumber
      };
    }
    
    // Validate quantity
    const quantityValidation = validateQuantity(quantity);
    if (!quantityValidation.valid) {
      return {
        success: false,
        error: quantityValidation.error,
        errorLine: lineNumber
      };
    }
    
    rows.push({
      address,
      asset,
      quantity,
      memo,
      lineNumber,
      quantityNum: quantityValidation.value!
    });
  }
  
  if (rows.length === 0) {
    return { success: false, error: 'No valid data rows found' };
  }
  
  return { success: true, rows };
}

/**
 * Sanitize CSV value for safe display
 */
export function sanitizeCSVValue(value: string): string {
  if (!value) return '';
  
  // Remove potential injection characters from start
  let sanitized = value;
  while (sanitized && '=@+-'.includes(sanitized[0])) {
    sanitized = sanitized.slice(1);
  }
  
  // Remove control characters
  sanitized = sanitized.replace(/[\x00-\x1F\x7F]/g, '');
  
  return sanitized;
}