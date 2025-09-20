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

export interface SignatureInfo {
  raw: Uint8Array;
  flag?: number;
  r?: Uint8Array;
  s?: Uint8Array;
  recoveryId?: number;
  compressed?: boolean;
  type?: 'ecdsa' | 'schnorr';
}