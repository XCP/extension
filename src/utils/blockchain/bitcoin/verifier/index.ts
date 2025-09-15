/**
 * Bitcoin Message Verifier - Complete Implementation
 *
 * Structure:
 * 1. Core specs (BIP-322, BIP-137, Legacy)
 * 2. Platform-specific adaptations
 * 3. Verification chain with fallbacks
 */

export { verifyBIP137 } from './bip137';
export { verifyBIP322 } from './bip322';
export { verifyLegacy } from './legacy';
export { verifyMessage, VerificationResult } from './verifier';

// Platform-specific verifiers
export { verifyBitcoinCore } from './platforms/bitcoin-core';
export { verifyBitcore } from './platforms/bitcore';
export { verifyFreeWallet } from './platforms/freewallet';
export { verifySparrow } from './platforms/sparrow';
export { verifyLedger } from './platforms/ledger';
export { verifyElectrum } from './platforms/electrum';