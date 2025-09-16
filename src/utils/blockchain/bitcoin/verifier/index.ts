/**
 * Bitcoin Message Verifier - Complete Implementation
 *
 * Structure:
 * 1. Core specs (BIP-322, BIP-137, Legacy)
 * 2. Platform-specific adaptations
 * 3. Verification chain with fallbacks
 */

// Main verifier - clean architecture
export {
  verifyMessage,
  verifyMessageWithMethod,
  isSpecCompliant,
  getVerificationReport
} from './verifier';

// Types
export type {
  VerificationResult,
  VerificationOptions,
  AddressType,
  SignatureInfo
} from './types';

// Spec-compliant implementations
export { verifyBIP322 } from './specs/bip322';
export { verifyBIP137 } from './specs/bip137';
export { verifyLegacy } from './specs/legacy';

// Compatibility layer
export { verifyLooseBIP137 } from './compatibility/loose-bip137';

// Utilities
export { recoverPublicKeyFromSignature } from './secp-recovery';