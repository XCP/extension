/**
 * Hardware Wallet Types
 *
 * Common types used across all hardware wallet integrations.
 */

import { AddressFormat } from '@/utils/blockchain/bitcoin/address';

/**
 * Supported hardware wallet vendors
 */
export type HardwareWalletVendor = 'trezor' | 'ledger';

/**
 * Input script types for hardware wallet transaction signing.
 * These correspond to Bitcoin script types:
 * - SPENDADDRESS: P2PKH (legacy)
 * - SPENDWITNESS: P2WPKH (native SegWit)
 * - SPENDP2SHWITNESS: P2SH-P2WPKH (wrapped SegWit)
 * - SPENDTAPROOT: P2TR (Taproot)
 */
export type InputScriptType = 'SPENDADDRESS' | 'SPENDWITNESS' | 'SPENDP2SHWITNESS' | 'SPENDTAPROOT';

/**
 * Output script types for hardware wallet transaction signing.
 * These correspond to Bitcoin script types:
 * - PAYTOADDRESS: P2PKH (legacy)
 * - PAYTOWITNESS: P2WPKH (native SegWit)
 * - PAYTOP2SHWITNESS: P2SH-P2WPKH (wrapped SegWit)
 * - PAYTOTAPROOT: P2TR (Taproot)
 * - PAYTOOPRETURN: OP_RETURN data output
 */
export type OutputScriptType = 'PAYTOADDRESS' | 'PAYTOWITNESS' | 'PAYTOP2SHWITNESS' | 'PAYTOTAPROOT' | 'PAYTOOPRETURN';

/**
 * Connection status for hardware wallets
 */
export type HardwareConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'error';

/**
 * Hardware wallet device information
 */
export interface HardwareDeviceInfo {
  vendor: HardwareWalletVendor;
  model?: string;
  label?: string;
  firmwareVersion?: string;
  connected: boolean;
}

/**
 * Result of getting an address from hardware wallet
 */
export interface HardwareAddress {
  address: string;
  publicKey: string;
  path: string;
}

/**
 * Input for hardware wallet transaction signing
 */
export interface HardwareSignInput {
  /** BIP32 derivation path as array (e.g., [44 | 0x80000000, 0 | 0x80000000, 0, 0]) */
  addressPath: number[];
  /** Previous transaction hash */
  prevTxHash: string;
  /** Output index in the previous transaction */
  prevIndex: number;
  /** Amount in satoshis */
  amount: string;
  /** Script type for the input */
  scriptType: InputScriptType;
}

/**
 * Output for hardware wallet transaction signing
 */
export interface HardwareSignOutput {
  /** Destination address (for external outputs) */
  address?: string;
  /** BIP32 path for change outputs (when sending back to our wallet) */
  addressPath?: number[];
  /** Amount in satoshis */
  amount: string;
  /** Script type for the output */
  scriptType: OutputScriptType;
  /** OP_RETURN data (hex string, only for PAYTOOPRETURN outputs) */
  opReturnData?: string;
}

/**
 * Transaction signing request for hardware wallet
 */
export interface HardwareSignRequest {
  inputs: HardwareSignInput[];
  outputs: HardwareSignOutput[];
  /** Optional: referenced transactions data */
  refTxs?: HardwareRefTx[];
}

/**
 * Referenced transaction for hardware signing (required by some devices)
 */
export interface HardwareRefTx {
  hash: string;
  version: number;
  locktime: number;
  inputs: Array<{
    prevHash: string;
    prevIndex: number;
    script: string;
    sequence: number;
  }>;
  outputs: Array<{
    amount: string;
    script: string;
  }>;
}

/**
 * Result of transaction signing
 */
export interface HardwareSignResult {
  /** Signed transaction hex */
  signedTxHex: string;
  /** Transaction hash/txid */
  txid?: string;
}

/**
 * Message signing request
 */
export interface HardwareMessageSignRequest {
  message: string;
  path: number[];
  /** Coin name for the signing (default: 'Bitcoin') */
  coin?: string;
}

/**
 * PSBT signing request for hardware wallet
 */
export interface HardwarePsbtSignRequest {
  /** PSBT in hex format */
  psbtHex: string;
  /** Map of input index to derivation path (for inputs to sign) */
  inputPaths: Map<number, number[]>;
  /** Optional sighash types per input */
  sighashTypes?: number[];
}

/**
 * PSBT signing result
 *
 * Note: For hardware wallets like Trezor, this is actually a fully signed
 * raw transaction hex, not a PSBT. The hardware wallet signs completely
 * in one operation and returns a finalized transaction ready for broadcast.
 */
export interface HardwarePsbtSignResult {
  /** Signed transaction hex (fully signed raw transaction, ready for broadcast) */
  signedTxHex: string;
}

/**
 * Message signing result
 */
export interface HardwareMessageSignResult {
  signature: string;
  address: string;
}

/**
 * Error thrown by hardware wallet operations
 */
export class HardwareWalletError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly vendor: HardwareWalletVendor,
    public readonly userMessage?: string
  ) {
    super(message);
    this.name = 'HardwareWalletError';
  }
}

/**
 * BIP44 derivation path helpers
 */
export const DerivationPaths = {
  /** Hardened bit for BIP32 derivation */
  HARDENED: 0x80000000,

  /** Get BIP44 path for Bitcoin */
  getBip44Path(addressFormat: AddressFormat, account: number = 0, change: number = 0, index: number = 0): number[] {
    // Validate path indices are non-negative to prevent malformed derivation paths
    if (account < 0 || change < 0 || index < 0) {
      throw new Error(`Invalid derivation path indices: account=${account}, change=${change}, index=${index}. All values must be non-negative.`);
    }

    // Validate indices are within valid BIP32 range (31-bit unsigned for hardened)
    const MAX_INDEX = 0x7FFFFFFF; // 2^31 - 1
    if (account > MAX_INDEX || change > MAX_INDEX || index > MAX_INDEX) {
      throw new Error(`Derivation path index out of range. Maximum value is ${MAX_INDEX}.`);
    }

    const purpose = this.getPurpose(addressFormat);
    const coinType = 0; // Bitcoin mainnet

    // Use >>> 0 to convert to unsigned 32-bit (JS bitwise ops return signed)
    return [
      (purpose | this.HARDENED) >>> 0,
      (coinType | this.HARDENED) >>> 0,
      (account | this.HARDENED) >>> 0,
      change,
      index,
    ];
  },

  /** Get purpose number for address format */
  getPurpose(addressFormat: AddressFormat): number {
    switch (addressFormat) {
      case AddressFormat.P2PKH:
      case AddressFormat.Counterwallet:
      case AddressFormat.FreewalletBIP39:
        return 44;
      case AddressFormat.P2SH_P2WPKH:
        return 49;
      case AddressFormat.P2WPKH:
      case AddressFormat.CounterwalletSegwit:
        return 84;
      case AddressFormat.P2TR:
        return 86;
      default:
        return 44;
    }
  },

  /** Convert path array to string format (e.g., "m/44'/0'/0'/0/0") */
  pathToString(path: number[]): string {
    return 'm/' + path.map(n => {
      const isHardened = (n & this.HARDENED) !== 0;
      const value = n & ~this.HARDENED;
      return isHardened ? `${value}'` : `${value}`;
    }).join('/');
  },

  /** Parse string path to array format */
  stringToPath(pathStr: string): number[] {
    const parts = pathStr.replace('m/', '').split('/');
    return parts.map(part => {
      const isHardened = part.endsWith("'") || part.endsWith('h');
      const value = parseInt(part.replace(/['h]/g, ''), 10);
      // Use >>> 0 to convert to unsigned 32-bit (JS bitwise ops return signed)
      return isHardened ? ((value | this.HARDENED) >>> 0) : value;
    });
  },

  /**
   * Parse and validate a BIP44 account path from hardware wallet discovery.
   * Expected format: m/purpose'/coin'/account'[/change/index]
   *
   * Handles both apostrophe (') and 'h' notation for hardened derivation.
   *
   * @param path - Path string from hardware wallet (e.g., "m/84'/0'/0'" or "m/84h/0h/0h")
   * @returns Parsed path components or null if invalid
   */
  parseAccountPath(path: string): {
    purpose: number;
    coinType: number;
    accountIndex: number;
    addressFormat: AddressFormat;
  } | null {
    // Validate path format: must start with m/ and have at least 3 hardened components
    // Supports both ' and h notation for hardened derivation
    const pathRegex = /^m\/(\d+)['h]\/(\d+)['h]\/(\d+)['h](?:\/\d+\/\d+)?$/;
    const match = path.match(pathRegex);

    if (!match) {
      return null;
    }

    const purpose = parseInt(match[1], 10);
    const coinType = parseInt(match[2], 10);
    const accountIndex = parseInt(match[3], 10);

    // Validate coin type (0 = Bitcoin mainnet, 1 = testnet)
    if (coinType !== 0 && coinType !== 1) {
      return null;
    }

    // Validate purpose and determine address format
    let addressFormat: AddressFormat;
    switch (purpose) {
      case 44:
        addressFormat = AddressFormat.P2PKH;
        break;
      case 49:
        addressFormat = AddressFormat.P2SH_P2WPKH;
        break;
      case 84:
        addressFormat = AddressFormat.P2WPKH;
        break;
      case 86:
        addressFormat = AddressFormat.P2TR;
        break;
      default:
        return null; // Unknown purpose
    }

    // Validate account index is within valid BIP32 range
    if (accountIndex < 0 || accountIndex > 0x7FFFFFFF) {
      return null;
    }

    return {
      purpose,
      coinType,
      accountIndex,
      addressFormat,
    };
  },
};
