import { Buffer } from 'buffer';
import { fromSatoshis, toBigNumber } from '@/utils/numeric';

interface ParsedTransaction {
  type: string;
  from?: string;
  to?: string;
  amount?: string;
  asset?: string;
  fee?: string;
  details: Record<string, any>;
  raw: string;
}

/**
 * Sanitize a string value for safe display
 */
function sanitizeString(value: any): string {
  if (value === undefined || value === null) {
    return '';
  }
  
  const str = String(value);
  
  // Remove null bytes and control characters
  return str.replace(/\x00/g, '').replace(/[\x01-\x1F\x7F]/g, '');
}

/**
 * Parse a raw transaction hex to extract human-readable details
 * This is critical for security - users must see what they're signing
 */
export function parseTransaction(rawTxHex: string, params?: any): ParsedTransaction {
  // Default parsed structure
  const parsed: ParsedTransaction = {
    type: 'Unknown Transaction',
    details: {},
    raw: rawTxHex
  };

  try {
    // If we have params from compose methods, use them
    if (params) {
      // Handle different transaction types based on params
      if (params.type === 'send' || params.method === 'send') {
        parsed.type = 'Send Asset';
        parsed.to = params.destination || params.to;
        parsed.asset = params.asset;
        parsed.amount = formatQuantity(params.quantity, params.divisible);
        parsed.details = {
          memo: sanitizeString(params.memo) || 'None',
          fee: params.fee || 'Standard'
        };
      } else if (params.type === 'order' || params.method === 'order') {
        parsed.type = 'Create DEX Order';
        parsed.details = {
          'Giving': `${formatQuantity(params.give_quantity, true)} ${sanitizeString(params.give_asset) || 'Unknown'}`,
          'Getting': `${formatQuantity(params.get_quantity, true)} ${sanitizeString(params.get_asset) || 'Unknown'}`,
          'Expiration': `${params.expiration || 1000} blocks`,
          'Fee': params.fee || 'Standard'
        };
      } else if (params.type === 'issuance' || params.method === 'issuance') {
        parsed.type = 'Issue Asset';
        parsed.asset = params.asset;
        parsed.amount = formatQuantity(params.quantity, params.divisible);
        parsed.details = {
          'Description': params.description || 'None',
          'Divisible': params.divisible ? 'Yes' : 'No',
          'Locked': params.lock ? 'Yes' : 'No',
          'Transfer To': params.transfer_destination || 'N/A'
        };
      } else if (params.type === 'dispenser' || params.method === 'dispenser') {
        parsed.type = 'Create Dispenser';
        parsed.asset = params.asset;
        parsed.details = {
          'Give Quantity': formatQuantity(params.give_quantity, true),
          'Escrow Amount': formatQuantity(params.escrow_quantity, true),
          'BTC Rate': params.mainchainrate ? `${params.mainchainrate} satoshis` : 'Unknown',
          'Status': params.status === '0' ? 'Open' : 'Closed'
        };
      } else if (params.type === 'dividend' || params.method === 'dividend') {
        parsed.type = 'Pay Dividend';
        parsed.details = {
          'Asset': params.asset,
          'Dividend Asset': params.dividend_asset,
          'Amount Per Unit': formatQuantity(params.quantity_per_unit, true)
        };
      }
    }

    // Try to extract basic Bitcoin transaction info from hex
    // This is a simplified parser - in production you'd use a proper Bitcoin library
    if (!params && rawTxHex) {
      try {
        const txBuffer = Buffer.from(rawTxHex, 'hex');
        // Basic structure parsing would go here
        // For now, show hex preview safely
        parsed.details['Transaction Hash'] = rawTxHex.substring(0, 64) + '...';
        parsed.details['Size'] = `${txBuffer.length} bytes`;
      } catch (e) {
        console.error('Failed to parse transaction hex:', e);
      }
    }

  } catch (error) {
    console.error('Error parsing transaction:', error);
    parsed.type = 'Unparseable Transaction';
    parsed.details = {
      'Error': 'Could not parse transaction details',
      'Raw Length': `${rawTxHex.length} characters`
    };
  }

  return parsed;
}

/**
 * Format a quantity based on divisibility
 */
function formatQuantity(quantity: number | string, divisible?: boolean): string {
  if (quantity === undefined || quantity === null) return 'Unknown';
  
  // Parse the quantity
  let qty: number;
  if (typeof quantity === 'string') {
    qty = parseFloat(quantity);
  } else {
    qty = quantity;
  }
  
  // Handle invalid numbers
  if (!isFinite(qty) || isNaN(qty)) {
    return 'Invalid';
  }
  
  // Handle extreme values
  if (Math.abs(qty) > Number.MAX_SAFE_INTEGER) {
    return 'Value too large';
  }
  
  // Handle negative values (which shouldn't happen in valid transactions)
  if (qty < 0) {
    return 'Invalid (negative)';
  }
  
  if (divisible === false) {
    // For non-divisible assets, ensure we're dealing with integers
    return Math.floor(qty).toString();
  }
  
  // Assume 8 decimals for divisible assets (standard for XCP)
  const normalized = fromSatoshis(qty);
  
  // Parse the normalized value to handle very small values
  const numValue = parseFloat(normalized);
  if (Math.abs(numValue) < 0.00000001) {
    return '0';
  }
  
  // Format without scientific notation
  let formatted = normalized;
  
  // Remove trailing zeros and unnecessary decimal point
  formatted = formatted.replace(/\.?0+$/, '');
  
  return formatted;
}

/**
 * Validate that a transaction is safe to sign
 */
export function validateTransactionSafety(parsed: ParsedTransaction): {
  isSafe: boolean;
  warnings: string[];
} {
  const warnings: string[] = [];
  
  // Check for common dangerous patterns
  if (parsed.type === 'Unknown Transaction') {
    warnings.push('⚠️ Cannot determine transaction type - proceed with caution');
  }
  
  if (parsed.amount) {
    const amount = parseFloat(parsed.amount);
    if (!isNaN(amount) && amount > 1000000) {
      warnings.push('⚠️ Large amount transfer detected');
    }
  }
  
  if (parsed.details['Transfer To']) {
    warnings.push('⚠️ This will transfer asset ownership');
  }
  
  if (parsed.type === 'Issue Asset' && parsed.details['Locked'] === 'Yes') {
    warnings.push('⚠️ Asset will be permanently locked after issuance');
  }
  
  return {
    isSafe: warnings.length === 0,
    warnings
  };
}