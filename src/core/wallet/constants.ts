/**
 * Wallet constants
 *
 * Standalone constants file to avoid circular dependencies.
 * These values are imported by walletManager.ts, session.ts, and other modules.
 *
 * ---
 * ADR-013: Constants Organization Strategy
 * ---
 *
 * PRINCIPLE: Colocate constants by default, extract only for circular deps.
 *
 * WHEN TO CREATE a separate constants file:
 *
 * 1. Circular dependency prevention (PRIMARY reason)
 *    - When module A needs a constant from module B, but module B imports
 *      from module A, extract the constant to break the cycle.
 *    - This file exists because session.ts needed MAX_WALLETS but
 *      walletManager.ts imports from session.ts.
 *
 * 2. Truly cross-cutting values
 *    - Constants used by 5+ unrelated modules across different layers
 *      MAY benefit from a shared location. But prefer domain-specific
 *      files (e.g., messaging.ts for message constants) over a grab-bag.
 *
 * WHEN TO KEEP constants colocated (do NOT extract):
 *
 * 1. Module-specific constants
 *    - If a constant is only used within one module or its direct consumers,
 *      keep it in that module. Don't preemptively extract.
 *
 * 2. API/protocol constants
 *    - Constants that define an API contract (status codes, message types)
 *      belong with that API's implementation.
 *    - Example: OrderStatus, DispenserStatus in counterparty/api.ts
 *
 * 3. Const + type combos
 *    - When a const object is used to derive a type
 *      (`type X = typeof X[keyof typeof X]`), keep them together.
 *    - Example: AddressFormat const and type in bitcoin/address.ts
 *
 * 4. Configuration with defaults
 *    - Constants that serve as defaults for configurable values belong
 *      with the configuration logic, not in a separate file.
 *
 * AVOID:
 *   - Global constants.ts files that become grab-bags
 *   - Extracting constants "just in case" they might be needed elsewhere
 *   - Separating const from its derived type
 *
 * CURRENT EXTRACTIONS:
 *   - MAX_WALLETS, MAX_ADDRESSES_PER_WALLET: Circular dep with session.ts
 *   - src/constants/messaging.ts: Cross-layer message type definitions
 *
 * NOT EXTRACTED (by design):
 *   - AddressFormat: Const + type combo in bitcoin/address.ts
 *   - OrderStatus, DispenserStatus: API constants in counterparty/api.ts
 *   - DEFAULT_LIMIT: Local to api.ts, not exported
 */

/** Maximum number of wallets that can be stored */
export const MAX_WALLETS = 20;

/** Maximum number of addresses per wallet */
export const MAX_ADDRESSES_PER_WALLET = 100;
