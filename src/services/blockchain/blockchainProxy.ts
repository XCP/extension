/**
 * Blockchain Service Proxy
 * 
 * Provides a bridge for using BlockchainService across different extension contexts
 * (background, popup, content scripts) using webext-bridge for communication.
 * 
 * This follows the same pattern as walletService and providerService.
 */

import { sendMessage } from 'webext-bridge/popup';
import type { 
  FeeRates, 
  TransactionResponse, 
  UTXO
} from '@/utils/blockchain/bitcoin';
import type {
  TokenBalance,
  AssetInfo,
  Transaction,
  Order,
  OrderDetails
} from '@/utils/blockchain/counterparty/api';

// Message types for blockchain service communication
export type BlockchainServiceMessage = 
  | { type: 'GET_BTC_BALANCE'; data: { address: string; timeoutMs?: number } }
  | { type: 'GET_UTXOS'; data: { address: string } }
  | { type: 'GET_FEE_RATES'; data: {} }
  | { type: 'GET_BLOCK_HEIGHT'; data: { forceRefresh?: boolean } }
  | { type: 'GET_BTC_PRICE'; data: {} }
  | { type: 'BROADCAST_TRANSACTION'; data: { signedTxHex: string } }
  | { type: 'GET_PREVIOUS_RAW_TRANSACTION'; data: { txid: string } }
  | { type: 'GET_BITCOIN_TRANSACTION'; data: { txid: string } }
  | { type: 'GET_TOKEN_BALANCES'; data: { address: string; options?: any } }
  | { type: 'GET_ASSET_DETAILS'; data: { asset: string; verbose?: boolean } }
  | { type: 'GET_ASSET_DETAILS_AND_BALANCE'; data: { asset: string; address: string; options?: any } }
  | { type: 'GET_TOKEN_BALANCE'; data: { address: string; asset: string; options?: any } }
  | { type: 'GET_TRANSACTIONS'; data: { address: string; options?: any } }
  | { type: 'GET_ORDERS'; data: { address?: string; options?: any } }
  | { type: 'GET_DISPENSERS'; data: { address?: string; options?: any } }
  | { type: 'GET_ASSET_HISTORY'; data: { asset: string; options?: any } }
  | { type: 'FORMAT_INPUTS_SET'; data: { utxos: UTXO[] } }
  | { type: 'GET_UTXO_BY_TXID'; data: { utxos: UTXO[]; txid: string; vout: number } }
  | { type: 'CLEAR_ALL_CACHES'; data: {} }
  | { type: 'CLEAR_CACHE_PATTERN'; data: { pattern: string } }
  | { type: 'GET_CACHE_STATS'; data: {} };

/**
 * Proxy class for accessing BlockchainService from popup/content contexts
 */
export class BlockchainServiceProxy {
  
  // ============================================================================
  // BITCOIN OPERATIONS
  // ============================================================================

  async getBTCBalance(address: string, timeoutMs = 5000): Promise<number> {
    const response = await sendMessage('blockchain-service', {
      type: 'GET_BTC_BALANCE',
      data: { address, timeoutMs },
    }) as any;
    return response?.data || 0;
  }

  async getUTXOs(address: string): Promise<UTXO[]> {
    const response = await sendMessage('blockchain-service', {
      type: 'GET_UTXOS',
      data: { address },
    }) as any;
    return response?.data || [];
  }

  async getFeeRates(): Promise<FeeRates> {
    const response = await sendMessage('blockchain-service', {
      type: 'GET_FEE_RATES',
      data: {},
    }) as any;
    return response?.data;
  }

  async getBlockHeight(forceRefresh = false): Promise<number> {
    const response = await sendMessage('blockchain-service', {
      type: 'GET_BLOCK_HEIGHT',
      data: { forceRefresh },
    }) as any;
    return response?.data || 0;
  }

  async getBTCPrice(): Promise<number | null> {
    const response = await sendMessage('blockchain-service', {
      type: 'GET_BTC_PRICE',
      data: {},
    }) as any;
    return response?.data;
  }

  async broadcastTransaction(signedTxHex: string): Promise<TransactionResponse> {
    const response = await sendMessage('blockchain-service', {
      type: 'BROADCAST_TRANSACTION',
      data: { signedTxHex },
    }) as any;
    return response?.data;
  }

  async getPreviousRawTransaction(txid: string): Promise<string | null> {
    const response = await sendMessage('blockchain-service', {
      type: 'GET_PREVIOUS_RAW_TRANSACTION',
      data: { txid },
    }) as any;
    return response?.data;
  }

  async getBitcoinTransaction(txid: string): Promise<any | null> {
    const response = await sendMessage('blockchain-service', {
      type: 'GET_BITCOIN_TRANSACTION',
      data: { txid },
    }) as any;
    return response?.data;
  }

  // ============================================================================
  // COUNTERPARTY OPERATIONS
  // ============================================================================

  async getTokenBalances(
    address: string, 
    options: { 
      excludeUtxos?: boolean; 
      verbose?: boolean; 
      assetLongname?: string;
    } = {}
  ): Promise<TokenBalance[]> {
    const response = await sendMessage('blockchain-service', {
      type: 'GET_TOKEN_BALANCES',
      data: { address, options },
    }) as any;
    return response?.data;
  }

  async getAssetDetails(asset: string, verbose = true): Promise<AssetInfo | null> {
    const response = await sendMessage('blockchain-service', {
      type: 'GET_ASSET_DETAILS',
      data: { asset, verbose },
    }) as any;
    return response?.data;
  }

  async getAssetDetailsAndBalance(
    asset: string, 
    address: string, 
    options: { verbose?: boolean } = {}
  ): Promise<{
    isDivisible: boolean;
    assetInfo: AssetInfo;
    availableBalance: string;
  }> {
    const response = await sendMessage('blockchain-service', {
      type: 'GET_ASSET_DETAILS_AND_BALANCE',
      data: { asset, address, options },
    }) as any;
    return response?.data;
  }

  async getTokenBalance(
    address: string, 
    asset: string, 
    options: { 
      excludeUtxos?: boolean; 
      verbose?: boolean;
    } = {}
  ): Promise<TokenBalance | null> {
    const response = await sendMessage('blockchain-service', {
      type: 'GET_TOKEN_BALANCE',
      data: { address, asset, options },
    }) as any;
    return response?.data;
  }

  async getTransactions(
    address: string,
    options: {
      action?: string;
      limit?: number;
      offset?: number;
      verbose?: boolean;
    } = {}
  ): Promise<Transaction[]> {
    const response = await sendMessage('blockchain-service', {
      type: 'GET_TRANSACTIONS',
      data: { address, options },
    }) as any;
    return response?.data;
  }

  async getOrders(
    address?: string,
    options: {
      status?: string;
      limit?: number;
      offset?: number;
      verbose?: boolean;
    } = {}
  ): Promise<Order[] | OrderDetails[]> {
    const response = await sendMessage('blockchain-service', {
      type: 'GET_ORDERS',
      data: { address, options },
    }) as any;
    return response?.data;
  }

  async getDispensers(
    address?: string,
    options: {
      status?: string;
      limit?: number;
      offset?: number;
      verbose?: boolean;
    } = {}
  ): Promise<any[]> {
    const response = await sendMessage('blockchain-service', {
      type: 'GET_DISPENSERS',
      data: { address, options },
    }) as any;
    return response?.data;
  }

  async getAssetHistory(
    asset: string,
    options: {
      limit?: number;
      offset?: number;
      verbose?: boolean;
    } = {}
  ): Promise<Transaction[]> {
    const response = await sendMessage('blockchain-service', {
      type: 'GET_ASSET_HISTORY',
      data: { asset, options },
    }) as any;
    return response?.data;
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  async formatInputsSet(utxos: UTXO[]): Promise<string> {
    const response = await sendMessage('blockchain-service', {
      type: 'FORMAT_INPUTS_SET',
      data: { utxos } as any,
    }) as any;
    return response?.data;
  }

  async getUtxoByTxid(utxos: UTXO[], txid: string, vout: number): Promise<UTXO | undefined> {
    const response = await sendMessage('blockchain-service', {
      type: 'GET_UTXO_BY_TXID',
      data: { utxos, txid, vout } as any,
    }) as any;
    return response?.data;
  }

  // ============================================================================
  // CACHE MANAGEMENT
  // ============================================================================

  async clearAllCaches(): Promise<void> {
    await sendMessage('blockchain-service', {
      type: 'CLEAR_ALL_CACHES',
      data: {},
    });
  }

  async clearCachePattern(pattern: string): Promise<void> {
    await sendMessage('blockchain-service', {
      type: 'CLEAR_CACHE_PATTERN',
      data: { pattern },
    });
  }

  async getCacheStats(): Promise<{
    hits: number;
    misses: number;
    evictions: number;
    totalEntries: number;
    hitRate: number;
  }> {
    const response = await sendMessage('blockchain-service', {
      type: 'GET_CACHE_STATS',
      data: {},
    }) as any;
    return response?.data;
  }

}

// Create singleton instance for use across the extension
export const blockchainService = new BlockchainServiceProxy();