/**
 * The Trezor Suite Web origins the wallet needs host access to. Kept free of imports so
 * wxt.config.ts can read it while building the manifest; suiteAccess.ts re-exports it.
 */
export const TREZOR_SUITE_ORIGINS = ['https://suite.trezor.io/*'];
