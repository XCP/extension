/**
 * Bitcoin Message Verifier - Complete Implementation
 *
 * Structure:
 * 1. Core specs (BIP-322, BIP-137, Legacy)
 * 2. Platform-specific adaptations
 * 3. Verification chain with fallbacks
 */

// Main verifier - clean architecture
export * from './verifier';

// Types
export * from './types';

// Spec-compliant implementations
export * from './specs/bip322';
export * from './specs/bip137';
export * from './specs/legacy';

// Compatibility layer
export * from './compatibility/loose-bip137';

// Utilities
export * from './secp-recovery';