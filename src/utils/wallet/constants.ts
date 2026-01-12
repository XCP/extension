/**
 * Wallet constants
 *
 * Standalone constants file to avoid circular dependencies.
 * These values are imported by walletManager.ts, session.ts, and other modules.
 */

/** Maximum number of wallets that can be stored */
export const MAX_WALLETS = 20;

/** Maximum number of addresses per wallet */
export const MAX_ADDRESSES_PER_WALLET = 100;
