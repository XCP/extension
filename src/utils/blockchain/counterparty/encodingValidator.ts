/**
 * Counterparty Transaction Encoding Validator
 *
 * Analyzes transactions to detect what Counterparty encoding method is used
 * and validates compatibility with different wallet types (software, Trezor, Ledger).
 *
 * Encoding types:
 * - opreturn: Data embedded in OP_RETURN output (most common, universally supported)
 * - multisig: Data encoded in fake 1-of-3 multisig pubkeys (legacy, limited HW support)
 * - pubkeyhash: Data encoded in fake P2PKH outputs (deprecated)
 * - taproot: Data encoded in Taproot script path (modern, requires Taproot support)
 */

import { hexToBytes } from '@noble/hashes/utils.js';
import type { DecodedOutput } from '@/utils/blockchain/bitcoin/psbt';

/**
 * Counterparty encoding types
 */
export type CounterpartyEncoding = 'opreturn' | 'multisig' | 'pubkeyhash' | 'taproot' | 'unknown';

/**
 * Wallet types for compatibility checking
 */
export type WalletType = 'software' | 'trezor' | 'ledger';

/**
 * Result of encoding analysis
 */
export interface EncodingAnalysis {
  /** Detected encoding type */
  encoding: CounterpartyEncoding;
  /** Human-readable description */
  description: string;
  /** Whether this encoding contains Counterparty data */
  hasCounterpartyData: boolean;
  /** Raw Counterparty data if extractable (hex) */
  counterpartyData?: string;
  /** Additional details about the encoding */
  details: {
    /** Number of data-carrying outputs */
    dataOutputCount: number;
    /** Whether encoding uses non-standard scripts */
    usesNonStandardScripts: boolean;
    /** Estimated data size in bytes */
    estimatedDataSize: number;
  };
}

/**
 * Wallet compatibility result
 */
export interface WalletCompatibility {
  /** Whether the wallet can sign this transaction */
  canSign: boolean;
  /** Warning message if there are potential issues */
  warning?: string;
  /** Error message if signing is not supported */
  error?: string;
  /** Suggestions for the user */
  suggestions?: string[];
}

/**
 * Counterparty message prefix (CNTRPRTY in hex, often ARC4 encrypted)
 */
const COUNTERPARTY_PREFIX = '434e545250525459'; // 'CNTRPRTY' in hex
const COUNTERPARTY_PREFIX_BYTES = hexToBytes(COUNTERPARTY_PREFIX);

/**
 * Check if data starts with Counterparty prefix
 * Note: Data may be ARC4 encrypted, so this only works for unencrypted OP_RETURN
 */
function hasCounterpartyPrefix(dataHex: string): boolean {
  return dataHex.toUpperCase().startsWith(COUNTERPARTY_PREFIX);
}

/**
 * Check if a script is a bare multisig (1-of-2 or 1-of-3)
 * Format: OP_1 <pubkey1> <pubkey2> [<pubkey3>] OP_2|OP_3 OP_CHECKMULTISIG
 */
function isBareMultisig(scriptHex: string): boolean {
  // OP_1 = 0x51, OP_2 = 0x52, OP_3 = 0x53, OP_CHECKMULTISIG = 0xae
  const script = scriptHex.toLowerCase();

  // Check for 1-of-2: 51 <33-byte pubkey> <33-byte pubkey> 52 ae
  // Each pubkey is prefixed with 0x21 (33 bytes length)
  const multisig1of2Pattern = /^51(21[0-9a-f]{66})(21[0-9a-f]{66})52ae$/;

  // Check for 1-of-3: 51 <33-byte pubkey> <33-byte pubkey> <33-byte pubkey> 53 ae
  const multisig1of3Pattern = /^51(21[0-9a-f]{66})(21[0-9a-f]{66})(21[0-9a-f]{66})53ae$/;

  return multisig1of2Pattern.test(script) || multisig1of3Pattern.test(script);
}

/**
 * Extract pubkeys from a bare multisig script
 */
function extractMultisigPubkeys(scriptHex: string): string[] {
  const script = scriptHex.toLowerCase();
  const pubkeys: string[] = [];

  // Match 33-byte pubkeys (prefixed with 0x21 length byte)
  const pubkeyPattern = /21([0-9a-f]{66})/g;
  let match;
  while ((match = pubkeyPattern.exec(script)) !== null) {
    pubkeys.push(match[1]);
  }

  return pubkeys;
}

/**
 * Check if pubkeys in multisig look like fake Counterparty data carriers
 * Real pubkeys start with 02 or 03 (compressed) or 04 (uncompressed)
 * Counterparty uses pubkeys that may have data embedded
 */
function areFakeMultisigPubkeys(pubkeys: string[]): boolean {
  // Skip the first pubkey (usually the real one for signing)
  // Check if remaining pubkeys look like data carriers
  for (let i = 1; i < pubkeys.length; i++) {
    const pubkey = pubkeys[i];
    // Real compressed pubkeys start with 02 or 03
    // Counterparty often uses pubkeys that don't follow this pattern
    // or uses specific byte patterns for data encoding
    if (!pubkey.startsWith('02') && !pubkey.startsWith('03') && !pubkey.startsWith('04')) {
      return true;
    }
  }
  return false;
}

/**
 * Analyze a transaction's outputs to detect Counterparty encoding
 */
export function analyzeEncoding(outputs: DecodedOutput[]): EncodingAnalysis {
  let encoding: CounterpartyEncoding = 'unknown';
  let hasCounterpartyData = false;
  let counterpartyData: string | undefined;
  let dataOutputCount = 0;
  let usesNonStandardScripts = false;
  let estimatedDataSize = 0;

  // Check for OP_RETURN encoding (most common)
  const opReturnOutputs = outputs.filter(o => o.type === 'op_return' && o.opReturnData);
  if (opReturnOutputs.length > 0) {
    encoding = 'opreturn';
    dataOutputCount = opReturnOutputs.length;

    // Concatenate OP_RETURN data
    const allData = opReturnOutputs.map(o => o.opReturnData!).join('');
    estimatedDataSize = allData.length / 2; // hex to bytes

    // Check for Counterparty prefix (may be encrypted)
    if (hasCounterpartyPrefix(allData) || estimatedDataSize > 8) {
      hasCounterpartyData = true;
      counterpartyData = allData;
    }
  }

  // Check for bare multisig encoding
  const multisigOutputs = outputs.filter(o => {
    if (o.type === 'unknown' && o.script) {
      return isBareMultisig(o.script);
    }
    return false;
  });

  if (multisigOutputs.length > 0) {
    // Check if these are Counterparty data carriers
    for (const output of multisigOutputs) {
      const pubkeys = extractMultisigPubkeys(output.script);
      if (areFakeMultisigPubkeys(pubkeys)) {
        encoding = 'multisig';
        hasCounterpartyData = true;
        usesNonStandardScripts = true;
        dataOutputCount += 1;

        // Estimate data size from pubkeys (each fake pubkey carries ~31 bytes of data)
        estimatedDataSize += (pubkeys.length - 1) * 31;
      }
    }
  }

  // Check for Taproot encoding (P2TR with data)
  const taprootOutputs = outputs.filter(o => o.type === 'p2tr');
  if (taprootOutputs.length > 1 && encoding === 'unknown') {
    // Multiple Taproot outputs might indicate Taproot encoding
    // This is harder to detect without seeing the witness data
    encoding = 'taproot';
    dataOutputCount = taprootOutputs.length;
  }

  // Build description
  let description: string;
  switch (encoding) {
    case 'opreturn':
      description = 'Standard OP_RETURN encoding - data embedded in transaction outputs';
      break;
    case 'multisig':
      description = 'Bare multisig encoding - data encoded in fake multisig pubkeys (legacy format)';
      break;
    case 'taproot':
      description = 'Taproot encoding - data encoded in Taproot script path';
      break;
    case 'pubkeyhash':
      description = 'P2PKH encoding - data encoded in fake pubkey hashes (deprecated)';
      break;
    default:
      description = 'No Counterparty encoding detected or standard Bitcoin transaction';
  }

  return {
    encoding,
    description,
    hasCounterpartyData,
    counterpartyData,
    details: {
      dataOutputCount,
      usesNonStandardScripts,
      estimatedDataSize,
    },
  };
}

/**
 * Check if a wallet type can sign a transaction with the given encoding
 */
export function checkWalletCompatibility(
  encoding: CounterpartyEncoding,
  walletType: WalletType,
  analysis?: EncodingAnalysis
): WalletCompatibility {
  // Software wallets can sign anything
  if (walletType === 'software') {
    return {
      canSign: true,
      warning: encoding === 'multisig'
        ? 'This transaction uses bare multisig encoding which may appear unusual in some wallet software.'
        : undefined,
    };
  }

  // Hardware wallet compatibility
  switch (encoding) {
    case 'opreturn':
      // OP_RETURN is universally supported
      return {
        canSign: true,
      };

    case 'multisig':
      // Bare multisig with fake pubkeys is problematic for hardware wallets
      if (walletType === 'trezor') {
        return {
          canSign: true,
          warning: 'This transaction uses bare multisig encoding. Trezor will show multiple outputs with unusual scripts. Review carefully before signing.',
          suggestions: [
            'The outputs containing encoded data will appear as multisig addresses',
            'This is expected behavior for Counterparty transactions with large data payloads',
          ],
        };
      }
      if (walletType === 'ledger') {
        return {
          canSign: true,
          warning: 'This transaction uses bare multisig encoding. Ledger may display unusual output information. Review carefully before signing.',
          suggestions: [
            'Make sure to verify the transaction details match what you expect',
            'Some outputs contain encoded Counterparty data, not actual payments',
          ],
        };
      }
      break;

    case 'taproot':
      // Taproot requires firmware support
      if (walletType === 'trezor') {
        return {
          canSign: true,
          warning: 'Taproot encoding requires Trezor firmware 2.4.3+ (Model T) or 1.10.4+ (Model One).',
          suggestions: [
            'Update your Trezor firmware if you encounter signing issues',
          ],
        };
      }
      if (walletType === 'ledger') {
        return {
          canSign: true,
          warning: 'Taproot encoding requires recent Ledger firmware and Bitcoin app version.',
          suggestions: [
            'Update your Ledger firmware and Bitcoin app if you encounter signing issues',
          ],
        };
      }
      break;

    case 'pubkeyhash':
      // Deprecated encoding - may have issues
      return {
        canSign: false,
        error: 'P2PKH (pubkeyhash) encoding is deprecated and may not be supported by hardware wallets.',
        suggestions: [
          'Request the transaction be re-composed using OP_RETURN encoding',
          'Use a software wallet if you must sign this transaction',
        ],
      };

    case 'unknown':
      // Standard Bitcoin transaction or unrecognized encoding
      return {
        canSign: true,
      };
  }

  // Default: allow but warn
  return {
    canSign: true,
    warning: 'Unable to fully validate encoding compatibility. Proceed with caution.',
  };
}

/**
 * Get recommended encoding for a wallet type and data size
 */
export function getRecommendedEncoding(
  walletType: WalletType,
  dataSizeBytes: number,
  supportsSegwit: boolean = true
): CounterpartyEncoding {
  // OP_RETURN max is ~80 bytes
  const OP_RETURN_MAX = 80;

  if (dataSizeBytes <= OP_RETURN_MAX) {
    // OP_RETURN is always preferred when data fits
    return 'opreturn';
  }

  // For larger data, depends on wallet type
  if (walletType === 'software') {
    // Software can handle multisig
    return 'multisig';
  }

  // For hardware wallets with large data, Taproot is preferred if supported
  if (supportsSegwit) {
    return 'taproot';
  }

  // Fallback to multisig with warning
  return 'multisig';
}

/**
 * Validate that a composed transaction matches the requested encoding
 */
export function validateComposedTransaction(
  outputs: DecodedOutput[],
  requestedEncoding: CounterpartyEncoding | 'auto'
): { valid: boolean; actualEncoding: CounterpartyEncoding; message?: string } {
  const analysis = analyzeEncoding(outputs);

  if (requestedEncoding === 'auto') {
    // Auto encoding always validates
    return {
      valid: true,
      actualEncoding: analysis.encoding,
      message: `Transaction was composed with ${analysis.encoding} encoding`,
    };
  }

  if (analysis.encoding === requestedEncoding) {
    return {
      valid: true,
      actualEncoding: analysis.encoding,
    };
  }

  // Mismatch between requested and actual
  return {
    valid: false,
    actualEncoding: analysis.encoding,
    message: `Requested ${requestedEncoding} encoding but transaction uses ${analysis.encoding} encoding`,
  };
}

/**
 * Get a user-friendly message about the encoding for display in UI
 */
export function getEncodingDisplayInfo(analysis: EncodingAnalysis): {
  title: string;
  description: string;
  severity: 'info' | 'warning' | 'error';
} {
  switch (analysis.encoding) {
    case 'opreturn':
      return {
        title: 'Standard Encoding',
        description: 'This transaction uses OP_RETURN encoding, which is widely supported by all wallets.',
        severity: 'info',
      };

    case 'multisig':
      return {
        title: 'Legacy Multisig Encoding',
        description: 'This transaction uses bare multisig encoding to store larger data. Hardware wallets will display additional outputs that contain encoded data, not actual payments.',
        severity: 'warning',
      };

    case 'taproot':
      return {
        title: 'Taproot Encoding',
        description: 'This transaction uses modern Taproot encoding. Requires recent firmware on hardware wallets.',
        severity: 'info',
      };

    case 'pubkeyhash':
      return {
        title: 'Deprecated Encoding',
        description: 'This transaction uses deprecated P2PKH encoding which may not be supported by all wallets.',
        severity: 'error',
      };

    default:
      return {
        title: 'Standard Transaction',
        description: 'This appears to be a standard Bitcoin transaction.',
        severity: 'info',
      };
  }
}
