/**
 * Common types for message verification
 */

export interface VerificationResult {
  valid: boolean;
  method?: string;
  details?: string;
}

export interface VerificationOptions {
  // Whether to try platform-specific workarounds
  tryPlatformQuirks?: boolean;
  // Whether to use strict spec compliance
  strict?: boolean;
  // Specific platform to assume (if known)
  platform?: 'bitcoin-core' | 'bitcore' | 'freewallet' | 'sparrow' | 'ledger' | 'electrum';
}

export type AddressType = 'P2PKH' | 'P2SH' | 'P2WPKH' | 'P2WSH' | 'P2TR' | 'Unknown';

/**
 * A parsed signature, passed as one value so its parts cannot be supplied in the wrong order.
 * Recovery previously took the signature and the message hash as adjacent `Uint8Array` arguments,
 * which swap silently.
 */
export interface SignatureInfo {
  /** Signature bytes without any flag prefix: 64 for ECDSA (r ‖ s). */
  raw: Uint8Array;
  /** The BIP-137 header byte, where one was present. */
  flag?: number;
  r?: Uint8Array;
  s?: Uint8Array;
  /** 0-3, required to recover a public key. */
  recoveryId?: number;
  /** Whether to return a compressed public key. Defaults to true. */
  compressed?: boolean;
  type?: 'ecdsa' | 'schnorr';
}