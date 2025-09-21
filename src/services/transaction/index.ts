/**
 * TransactionService exports
 *
 * Provides comprehensive transaction operations for the extension:
 * - Transaction composition (all Counterparty types)
 * - Transaction and message signing
 * - Transaction broadcasting
 * - Caching and performance optimization
 * - History tracking and analytics
 */

export * from './TransactionService';
export * from './transactionProxy';

// Re-export transaction option types from compose utility
export type {
  SendOptions,
  OrderOptions,
  DispenserOptions,
  DividendOptions,
  IssuanceOptions,
} from '@/utils/blockchain/counterparty/compose';