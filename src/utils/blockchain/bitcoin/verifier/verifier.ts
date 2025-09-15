/**
 * Main Message Verifier
 *
 * Verification order:
 * 1. BIP-322 (most modern, supports all address types)
 * 2. BIP-137 (widely supported, P2PKH/P2WPKH/P2SH-P2WPKH)
 * 3. Legacy (Bitcoin Core style, P2PKH only)
 * 4. Platform-specific quirks (if enabled)
 */

import { VerificationResult, VerificationOptions } from './types';
import { verifyBIP322 } from './bip322';
import { verifyBIP137 } from './bip137';
import { verifyLegacy } from './legacy';

// Platform-specific verifiers (to be implemented)
import { verifyBitcoinCore } from './platforms/bitcoin-core';
import { verifyBitcore } from './platforms/bitcore';
import { verifyFreeWallet } from './platforms/freewallet';
import { verifySparrow } from './platforms/sparrow';
import { verifyLedger } from './platforms/ledger';
import { verifyElectrum } from './platforms/electrum';

export { VerificationResult, VerificationOptions };

/**
 * Main verification function
 * Tries all methods in order until one succeeds
 */
export async function verifyMessage(
  message: string,
  signature: string,
  address: string,
  options: VerificationOptions = {}
): Promise<VerificationResult> {
  const { strict = false, tryPlatformQuirks = true, platform } = options;

  // If a specific platform is specified, try that first
  if (platform) {
    const platformResult = await verifyWithPlatform(message, signature, address, platform);
    if (platformResult.valid) {
      return platformResult;
    }
    // If platform-specific fails and strict mode, return the failure
    if (strict) {
      return platformResult;
    }
  }

  // 1. Try BIP-322 (most modern)
  const bip322Result = await verifyBIP322(message, signature, address);
  if (bip322Result.valid) {
    return bip322Result;
  }

  // 2. Try BIP-137 (widely supported)
  const bip137Result = await verifyBIP137(message, signature, address, strict);
  if (bip137Result.valid) {
    return bip137Result;
  }

  // 3. Try Legacy (Bitcoin Core for P2PKH)
  const legacyResult = await verifyLegacy(message, signature, address);
  if (legacyResult.valid) {
    return legacyResult;
  }

  // 4. Try platform-specific quirks if enabled
  if (tryPlatformQuirks && !strict) {
    const quirksResult = await tryAllPlatformQuirks(message, signature, address);
    if (quirksResult.valid) {
      return quirksResult;
    }
  }

  // Nothing worked, return the most informative error
  return {
    valid: false,
    details: combineErrors([
      bip322Result,
      bip137Result,
      legacyResult
    ])
  };
}

/**
 * Try platform-specific verification
 */
async function verifyWithPlatform(
  message: string,
  signature: string,
  address: string,
  platform: string
): Promise<VerificationResult> {
  switch (platform) {
    case 'bitcoin-core':
      return await verifyBitcoinCore(message, signature, address);
    case 'bitcore':
      return await verifyBitcore(message, signature, address);
    case 'freewallet':
      return await verifyFreeWallet(message, signature, address);
    case 'sparrow':
      return await verifySparrow(message, signature, address);
    case 'ledger':
      return await verifyLedger(message, signature, address);
    case 'electrum':
      return await verifyElectrum(message, signature, address);
    default:
      return { valid: false, details: `Unknown platform: ${platform}` };
  }
}

/**
 * Try all platform-specific quirks
 */
async function tryAllPlatformQuirks(
  message: string,
  signature: string,
  address: string
): Promise<VerificationResult> {
  // Try each platform's specific quirks
  const platforms = [
    { name: 'FreeWallet', verify: verifyFreeWallet },
    { name: 'Bitcore', verify: verifyBitcore },
    { name: 'Electrum', verify: verifyElectrum },
    { name: 'Ledger', verify: verifyLedger },
    { name: 'Sparrow', verify: verifySparrow },
    { name: 'Bitcoin Core', verify: verifyBitcoinCore }
  ];

  for (const { name, verify } of platforms) {
    try {
      const result = await verify(message, signature, address);
      if (result.valid) {
        return {
          ...result,
          method: `${result.method} (${name} quirks)`
        };
      }
    } catch (error) {
      console.debug(`${name} quirks failed:`, error);
    }
  }

  return { valid: false, details: 'No platform-specific quirks matched' };
}

/**
 * Combine error messages from multiple results
 */
function combineErrors(results: VerificationResult[]): string {
  const errors = results
    .filter(r => !r.valid && r.details)
    .map(r => r.details)
    .filter(Boolean);

  if (errors.length === 0) {
    return 'Verification failed for all methods';
  }

  return 'Verification failed:\n' + errors.join('\n');
}