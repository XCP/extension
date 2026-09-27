/**
 * Main Message Verifier - Clean Architecture
 *
 * Verification order:
 * 1. Spec-compliant verifiers (if strict mode or always try first)
 * 2. Compatibility layer (if not strict mode)
 */


// Compatibility layer
import { verifyLooseBIP137 } from '@/core/bitcoin/messageVerifier/compatibility/loose-bip137';
import { verifyBIP137 } from '@/core/bitcoin/messageVerifier/specs/bip137';

// Spec-compliant verifiers
import { verifyBIP322 } from '@/core/bitcoin/messageVerifier/specs/bip322';
import { verifyLegacy } from '@/core/bitcoin/messageVerifier/specs/legacy';
import type { VerificationOptions, VerificationResult } from '@/core/bitcoin/messageVerifier/types';
import { detectAndNormalizeSignature, validateMessage, } from '@/core/bitcoin/messageVerifier/utils';

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

  // If original failed and we're not in strict mode, retry with normalized inputs. Every signing
  // scheme here hashes the message's exact bytes, so a line-ending change is a different message;
  // it is tolerated only here, and the result says so.
  if (!strict) {
    const signatureValidation = detectAndNormalizeSignature(signature);
    const hasSignatureNormalization = signatureValidation.normalized !== signature && signatureValidation.valid;
    const normalizedSignature = hasSignatureNormalization ? signatureValidation.normalized : signature;

    // CRLF -> LF for text signed on Unix and pasted from Windows, and LF -> CRLF for the reverse:
    // a browser textarea hands back LF only, so a signature made over CRLF text can only be
    // checked by putting the CRs back.
    const messageVariants = [...new Set([
      validateMessage(message).normalized,
      message.replace(/\r?\n/g, '\r\n'),
    ])].filter(variant => variant !== message);

    const attempts: { message: string; normalizedMessage: boolean }[] =
      messageVariants.map(variant => ({ message: variant, normalizedMessage: true }));
    if (hasSignatureNormalization) attempts.unshift({ message, normalizedMessage: false });

    for (const attempt of attempts) {
      const normalizedResult = await tryVerificationSequence(attempt.message, normalizedSignature, address, strict);
      if (normalizedResult.valid) {
        const what = [
          attempt.normalizedMessage ? 'message' : '',
          hasSignatureNormalization ? 'signature' : '',
        ].filter(Boolean).join('+');
        return {
          ...normalizedResult,
          method: `${normalizedResult.method} (normalized)`,
          details: `Succeeded with normalization: ${what}`
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
