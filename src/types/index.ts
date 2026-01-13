/**
 * Centralized type exports
 *
 * Import types from here for cleaner imports:
 *   import type { Wallet, Address } from '@/types';
 *   import type { ApprovalRequest } from '@/types';
 *
 * ---
 * ADR-012: Type Organization and Extraction Strategy
 * ---
 *
 * PRINCIPLE: Colocate types by default, extract only when necessary.
 *
 * WHEN TO EXTRACT types to this directory:
 *
 * 1. Circular dependency prevention
 *    - When Type A is in module X, and module Y needs Type A but module X
 *      imports from module Y, extract Type A here to break the cycle.
 *    - Example: Wallet/Address were in walletManager.ts which had many deps.
 *
 * 2. Heavy implementation files
 *    - When a type is defined in a large file (500+ lines) with significant
 *      implementation logic, and the type is imported by 10+ other files.
 *    - Extracting reduces parse time for type-only consumers and clarifies
 *      that the type is a shared contract, not an implementation detail.
 *
 * 3. Cross-layer domain types
 *    - Types that represent core domain concepts used across multiple layers
 *      (storage, services, UI) benefit from a single source of truth.
 *
 * WHEN TO KEEP types colocated (do NOT extract):
 *
 * 1. Clean utility modules
 *    - If the source file IS the type definitions plus pure functions
 *      (e.g., counterparty/api.ts with AssetInfo, Transaction types),
 *      the types belong there. The module's purpose IS to define the interface.
 *
 * 2. Const + derived type combos
 *    - Types derived from const objects (e.g., `type X = typeof X[keyof typeof X]`)
 *      cannot be cleanly separated. Importers need runtime values too.
 *    - Example: AddressFormat is a const object with a derived type.
 *
 * 3. Single-file or few-file usage
 *    - Types used by only 1-3 files should stay with their implementation.
 *    - Extraction adds indirection without benefit.
 *
 * 4. Component/hook-specific types
 *    - Props interfaces, hook return types, and other UI-specific types
 *      belong with their components. They're implementation details.
 *
 * ANALYSIS METHOD:
 *   1. Count imports: `grep -r "import.*{.*TypeName.*}" src/ | wc -l`
 *   2. Check source file size: `wc -l source-file.ts`
 *   3. Check if source has heavy deps that could cause cycles
 *   4. If imports > 10 AND (file > 500 lines OR circular dep risk) → extract
 *
 * CURRENT EXTRACTIONS:
 *   - Wallet, Address: 20+ importers, from 1000+ line walletManager.ts
 *   - ApprovalRequest family: Cross-layer provider domain types
 *
 * NOT EXTRACTED (by design):
 *   - AssetInfo, Transaction, TokenBalance: Clean API module (api.ts)
 *   - AddressFormat: Const + type combo, can't separate
 *   - Compose options (30+ types): Clean utility module (compose.ts)
 *   - Hook/component types: UI-specific, colocated
 */

// Wallet domain
export type { Address, Wallet } from './wallet';

// Provider domain
export type {
  ApprovalRequest,
  ApprovalRequestOptions,
  ApprovalResult,
} from './provider';
