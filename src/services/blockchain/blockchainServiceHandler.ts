/**
 * Blockchain Service Handler
 * 
 * Handles message communication between BlockchainService and other contexts
 * using webext-bridge. This follows the same pattern as walletService handlers.
 */

import { onMessage } from 'webext-bridge/background';
import { BlockchainService } from './BlockchainService';
import { ServiceRegistry } from '@/services/core/ServiceRegistry';
import type { BlockchainServiceMessage } from './blockchainProxy';

let blockchainServiceInstance: BlockchainService | null = null;

/**
 * Initialize and register the blockchain service
 */
export async function registerBlockchainService(): Promise<void> {
  if (blockchainServiceInstance) {
    console.warn('BlockchainService already registered');
    return;
  }

  try {
    // Create and register the service
    blockchainServiceInstance = new BlockchainService();
    const serviceRegistry = ServiceRegistry.getInstance();
    await serviceRegistry.register(blockchainServiceInstance);
    
    // Set up message handlers
    setupMessageHandlers();
    
    console.log('BlockchainService registered and handlers set up');
  } catch (error) {
    console.error('Failed to register BlockchainService:', error);
    throw error;
  }
}

/**
 * Get the blockchain service instance
 */
export function getBlockchainService(): BlockchainService {
  if (!blockchainServiceInstance) {
    throw new Error('BlockchainService not initialized. Call registerBlockchainService() first.');
  }
  return blockchainServiceInstance;
}

/**
 * Set up webext-bridge message handlers
 */
function setupMessageHandlers(): void {
  onMessage('blockchain-service', async (message: BlockchainServiceMessage) => {
    const service = getBlockchainService();
    
    try {
      switch (message.type) {
        // Bitcoin operations
        case 'GET_BTC_BALANCE':
          return {
            success: true,
            data: await service.getBTCBalance(
              message.data.address,
              message.data.timeoutMs
            )
          };

        case 'GET_UTXOS':
          return {
            success: true,
            data: await service.getUTXOs(message.data.address)
          };

        case 'GET_FEE_RATES':
          return {
            success: true,
            data: await service.getFeeRates()
          };

        case 'GET_BLOCK_HEIGHT':
          return {
            success: true,
            data: await service.getBlockHeight(message.data.forceRefresh)
          };

        case 'GET_BTC_PRICE':
          return {
            success: true,
            data: await service.getBTCPrice()
          };

        case 'BROADCAST_TRANSACTION':
          return {
            success: true,
            data: await service.broadcastTransaction(message.data.signedTxHex)
          };

        case 'GET_PREVIOUS_RAW_TRANSACTION':
          return {
            success: true,
            data: await service.getPreviousRawTransaction(message.data.txid)
          };

        case 'GET_BITCOIN_TRANSACTION':
          return {
            success: true,
            data: await service.getBitcoinTransaction(message.data.txid)
          };

        // Counterparty operations
        case 'GET_TOKEN_BALANCES':
          return {
            success: true,
            data: await service.getTokenBalances(
              message.data.address,
              message.data.options
            )
          };

        case 'GET_ASSET_DETAILS':
          return {
            success: true,
            data: await service.getAssetDetails(
              message.data.asset,
              message.data.verbose
            )
          };

        case 'GET_ASSET_DETAILS_AND_BALANCE':
          return {
            success: true,
            data: await service.getAssetDetailsAndBalance(
              message.data.asset,
              message.data.address,
              message.data.options
            )
          };

        case 'GET_TOKEN_BALANCE':
          return {
            success: true,
            data: await service.getTokenBalance(
              message.data.address,
              message.data.asset,
              message.data.options
            )
          };

        case 'GET_TRANSACTIONS':
          return {
            success: true,
            data: await service.getTransactions(
              message.data.address,
              message.data.options
            )
          };

        case 'GET_ORDERS':
          return {
            success: true,
            data: await service.getOrders(
              message.data.address,
              message.data.options
            )
          };

        case 'GET_DISPENSERS':
          return {
            success: true,
            data: await service.getDispensers(
              message.data.address,
              message.data.options
            )
          };

        case 'GET_ASSET_HISTORY':
          return {
            success: true,
            data: await service.getAssetHistory(
              message.data.asset,
              message.data.options
            )
          };

        // Utility methods
        case 'FORMAT_INPUTS_SET':
          return {
            success: true,
            data: service.formatInputsSet(message.data.utxos)
          };

        case 'GET_UTXO_BY_TXID':
          return {
            success: true,
            data: service.getUtxoByTxid(
              message.data.utxos,
              message.data.txid,
              message.data.vout
            )
          };

        // Cache management
        case 'CLEAR_ALL_CACHES':
          service.clearAllCaches();
          return { success: true, data: null };

        case 'CLEAR_CACHE_PATTERN':
          service.clearCachePattern(message.data.pattern);
          return { success: true, data: null };

        case 'GET_CACHE_STATS':
          return {
            success: true,
            data: service.getCacheStats()
          };

        case 'GET_SERVICE_HEALTH':
          return {
            success: true,
            data: await service.getHealth()
          };

        default:
          throw new Error(`Unknown blockchain service message type: ${(message as any).type}`);
      }
    } catch (error) {
      console.error('BlockchainService message handler error:', error);
      return {
        success: false,
        error: {
          message: (error as Error).message,
          stack: (error as Error).stack,
        }
      };
    }
  });
}