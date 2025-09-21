/**
 * Main Message Verifier - Clean Architecture
 *
 * Verification order:
 * 1. Spec-compliant verifiers (if strict mode or always try first)
 * 2. Compatibility layer (if not strict mode)
 */

import type { VerificationResult, VerificationOptions } from './types';
import { validateMessage, detectAndNormalizeSignature, validateSignatureFormat } from './utils';

// Spec-compliant verifiers
import { verifyBIP322 } from './specs/bip322';
import { verifyBIP137 } from './specs/bip137';
import { verifyLegacy } from './specs/legacy';

// Compatibility layer
import { verifyLooseBIP137 } from './compatibility/loose-bip137';

/**
 * Main verification function
 *
 * @param message - The message to verify
 * @param signature - The signature to verify
 * @param address - The Bitcoin address
 * @param options - Verification options
 */
export async function verifyMessage(
  message: string,
  signature: string,
  address: string,
  options: VerificationOptions = {}
): Promise<VerificationResult> {
  const { strict = false } = options;

  // First, try verification with original inputs (no normalization)
  const originalResult = await tryVerificationSequence(message, signature, address, strict);
  if (originalResult.valid) {
    return originalResult;
  }

  // If original failed and we're not in strict mode, try with normalization
  if (!strict) {
    const messageValidation = validateMessage(message);
    const signatureValidation = detectAndNormalizeSignature(signature);

    // Only try normalization if we have actual normalization to apply
    const hasMessageNormalization = messageValidation.normalized !== message;
    const hasSignatureNormalization = signatureValidation.normalized !== signature && signatureValidation.valid;

    if (hasMessageNormalization || hasSignatureNormalization) {
      const normalizedMessage = messageValidation.normalized;
      const normalizedSignature = hasSignatureNormalization ? signatureValidation.normalized : signature;

      const normalizedResult = await tryVerificationSequence(normalizedMessage, normalizedSignature, address, strict);
      if (normalizedResult.valid) {
        return {
          ...normalizedResult,
          method: `${normalizedResult.method} (normalized)`,
          details: `Succeeded with normalization: ${hasMessageNormalization ? 'message' : ''}${hasMessageNormalization && hasSignatureNormalization ? '+' : ''}${hasSignatureNormalization ? 'signature' : ''}`
        };
      }
    }
  }

  // Return the original failure result
  return originalResult;
}

/**
 * Try the complete verification sequence with given inputs
 */
async function tryVerificationSequence(
  message: string,
  signature: string,
  address: string,
  strict: boolean
): Promise<VerificationResult> {
  // Always try spec-compliant verifiers first

  // 1. Try BIP-322 (most modern, supports all address types)
  const bip322Result = await verifyBIP322(message, signature, address);
  if (bip322Result.valid) {
    return bip322Result;
  }

  // 2. Try BIP-137 (spec-compliant)
  const bip137Result = await verifyBIP137(message, signature, address);
  if (bip137Result.valid) {
    return bip137Result;
  }

  // 3. Try Legacy (Bitcoin Core for P2PKH)
  const legacyResult = await verifyLegacy(message, signature, address);
  if (legacyResult.valid) {
    return legacyResult;
  }

  // If strict mode, stop here
  if (strict) {
    return {
      valid: false,
      details: `Strict mode: No spec-compliant verifier succeeded.\nBIP-322: ${bip322Result.details}\nBIP-137: ${bip137Result.details}\nLegacy: ${legacyResult.details}`
    };
  }

  // Try compatibility layer for cross-platform support

  // 4. Try Loose BIP-137 (handles wrong flags, Taproot with BIP-137, etc.)
  const looseResult = await verifyLooseBIP137(message, signature, address);
  if (looseResult.valid) {
    return looseResult;
  }

  // Nothing worked
  return {
    valid: false,
    details: `All verification methods failed.\nBIP-322: ${bip322Result.details}\nBIP-137: ${bip137Result.details}\nLegacy: ${legacyResult.details}\nLoose BIP-137: ${looseResult.details}`
  };
}

/**
 * Verify and return which method succeeded
 */
export async function verifyMessageWithMethod(
  message: string,
  signature: string,
  address: string,
  options: VerificationOptions = {}
): Promise<VerificationResult> {
  return verifyMessage(message, signature, address, options);
}

/**
 * Test if a signature is spec-compliant
 */
export async function isSpecCompliant(
  message: string,
  signature: string,
  address: string
): Promise<boolean> {
  const result = await verifyMessage(message, signature, address, { strict: true });
  return result.valid;
}

/**
 * Get detailed verification report
 */
export async function getVerificationReport(
  message: string,
  signature: string,
  address: string
): Promise<{
  specCompliant: boolean;
  compatibilityMode: boolean;
  method?: string;
  details?: string;
}> {
  // Check spec compliance
  const strictResult = await verifyMessage(message, signature, address, { strict: true });

  // Check with compatibility
  const compatResult = await verifyMessage(message, signature, address, { strict: false });

  return {
    specCompliant: strictResult.valid,
    compatibilityMode: !strictResult.valid && compatResult.valid,
    method: compatResult.method,
    details: compatResult.details
  };
}