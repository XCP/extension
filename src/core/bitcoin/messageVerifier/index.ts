/**
 * Bitcoin Message Verifier - Complete Implementation
 *
 * Structure:
 * 1. Core specs (BIP-322, BIP-137, Legacy)
 * 2. Platform-specific adaptations
 * 3. Verification chain with fallbacks
 */


// Compatibility layer
export * from '@/core/bitcoin/messageVerifier/compatibility/loose-bip137';
// Utilities
export * from '@/core/bitcoin/messageVerifier/secp-recovery';
export * from '@/core/bitcoin/messageVerifier/specs/bip137';
// Spec-compliant implementations
export * from '@/core/bitcoin/messageVerifier/specs/bip322';
export * from '@/core/bitcoin/messageVerifier/specs/legacy';
// Types
export * from '@/core/bitcoin/messageVerifier/types';
// Main verifier - clean architecture
export * from '@/core/bitcoin/messageVerifier/verifier';