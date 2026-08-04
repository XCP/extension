/**
 * Bitcoin Message Verifier - Complete Implementation
 *
 * Structure:
 * 1. Core specs (BIP-322, BIP-137, Legacy)
 * 2. Platform-specific adaptations
 * 3. Verification chain with fallbacks
 */

// Main verifier - clean architecture
export * from '@/utils/blockchain/bitcoin/messageVerifier/verifier';

// Types
export * from '@/utils/blockchain/bitcoin/messageVerifier/types';

// Spec-compliant implementations
export * from '@/utils/blockchain/bitcoin/messageVerifier/specs/bip322';
export * from '@/utils/blockchain/bitcoin/messageVerifier/specs/bip137';
export * from '@/utils/blockchain/bitcoin/messageVerifier/specs/legacy';

// Compatibility layer
export * from '@/utils/blockchain/bitcoin/messageVerifier/compatibility/loose-bip137';

// Utilities
export * from '@/utils/blockchain/bitcoin/messageVerifier/secp-recovery';