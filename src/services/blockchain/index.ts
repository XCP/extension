/**
 * Blockchain Service Module
 * 
 * Provides consolidated blockchain operations for the extension:
 * - Bitcoin operations (balance, UTXO, fees, broadcasting, block height)
 * - Counterparty API integration (tokens, assets, transactions, orders)
 * - Price feed management
 * - Production-ready with caching, circuit breakers, retry logic
 * - Health monitoring and rate limiting
 */

// Core service
export { BlockchainService } from './BlockchainService';
export type { BlockchainServiceState } from './BlockchainService';

// Service proxy for cross-context communication
export { BlockchainServiceProxy, blockchainService } from './blockchainProxy';
export type { BlockchainServiceMessage } from './blockchainProxy';

// Re-export types from blockchain utilities for convenience
export type {
  FeeRates,
  TransactionResponse,
  UTXO
} from '@/utils/blockchain/bitcoin';

export type {
  AssetInfo,
  TokenBalance,
  Transaction,
  Order,
  OrderDetails
} from '@/utils/blockchain/counterparty/api';
