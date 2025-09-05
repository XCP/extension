/**
 * TransactionService - Manages transaction composition, signing, and broadcasting
 * 
 * Extracted from ProviderService to handle:
 * - Transaction composition (all Counterparty types)
 * - Transaction and message signing with user approval
 * - Transaction broadcasting with replay prevention
 * - Transaction status tracking and history
 * - Integration with approval workflows
 */

import { BaseService } from '@/services/core/BaseService';
import { getConnectionService } from '@/services/connection';
import { getApprovalService } from '@/services/approval';
import { getBlockchainService } from '@/services/blockchain';
import { getWalletService } from '@/services/walletService';
import { transactionRateLimiter } from '@/utils/provider/rateLimiter';
import { withReplayPrevention, recordTransaction, markTransactionBroadcasted } from '@/utils/security/replayPrevention';
import { composeTransaction } from '@/utils/blockchain/counterparty/compose';
import type { OrderOptions, SendOptions, DispenserOptions, DividendOptions, IssuanceOptions } from '@/utils/blockchain/counterparty/compose';
import { analytics } from '#analytics';

export interface TransactionComposition {
  rawtransaction: string;
  psbt: string;
  fee: number;
  params: any;
}

export interface SignedTransactionResult {
  signedTransaction: string;
  txid?: string;
}

export interface BroadcastResult {
  txid: string;
  fees?: number;
}

export interface TransactionRecord {
  id: string;
  origin: string;
  method: string;
  params: any;
  status: 'pending' | 'signed' | 'broadcasted' | 'confirmed' | 'failed';
  timestamp: number;
  txid?: string;
  error?: string;
  responseTime?: number;
}

interface TransactionCache {
  composition: TransactionComposition;
  timestamp: number;
  ttl: number;
}

interface TransactionServiceState {
  transactionCache: Map<string, TransactionCache>;
  transactionHistory: Map<string, TransactionRecord>;
  performanceMetrics: {
    totalRequests: number;
    successfulRequests: number;
    averageResponseTime: number;
  };
}

interface SerializedTransactionState {
  cache: Array<{ key: string; composition: TransactionComposition; timestamp: number; ttl: number }>;
  history: Array<TransactionRecord>;
  metrics: {
    totalRequests: number;
    successfulRequests: number;
    averageResponseTime: number;
  };
}

export class TransactionService extends BaseService {
  private state: TransactionServiceState = {
    transactionCache: new Map(),
    transactionHistory: new Map(),
    performanceMetrics: {
      totalRequests: 0,
      successfulRequests: 0,
      averageResponseTime: 0,
    },
  };

  private static readonly STATE_VERSION = 1;
  private static readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  private static readonly MAX_CACHE_SIZE = 100;
  private static readonly MAX_HISTORY_SIZE = 1000;

  constructor() {
    super('TransactionService');
  }

  /**
   * Compose a send transaction
   */
  async composeSend(origin: string, params: SendOptions): Promise<TransactionComposition> {
    await this.checkPermissionAndRateLimit(origin, 'xcp_composeSend');
    
    const startTime = Date.now();
    const cacheKey = this.generateCacheKey('send', params);
    
    try {
      // Check cache first
      const cached = this.getCachedComposition(cacheKey);
      if (cached) {
        return cached;
      }

      // Get wallet service for address
      const walletService = getWalletService();
      const activeAddress = await walletService.getActiveAddress();
      
      if (!activeAddress) {
        throw new Error('No active address');
      }

      // Use replay prevention for compose operations
      const composition = await withReplayPrevention(
        origin,
        'xcp_composeSend',
        [params],
        async () => {
          const composeResult = await composeTransaction(
            'send',
            {
              destination: params.destination,
              asset: params.asset,
              quantity: params.quantity,
              memo: params.memo || null,
              memo_is_hex: params.memo_is_hex || false,
            },
            activeAddress.address,
            params.sat_per_vbyte || 1,
            params.encoding
          );

          return {
            rawtransaction: composeResult.result.rawtransaction,
            psbt: composeResult.result.psbt,
            fee: composeResult.result.btc_fee,
            params: composeResult.result.params,
          };
        },
        {
          generateIdempotencyKey: true,
          idempotencyTtlMinutes: 5,
        }
      );

      // Cache the composition
      this.cacheComposition(cacheKey, composition);

      // Record transaction
      this.recordTransaction({
        id: this.generateTransactionId(),
        origin,
        method: 'xcp_composeSend',
        params,
        status: 'pending',
        timestamp: Date.now(),
        responseTime: Date.now() - startTime,
      });

      // Update metrics
      this.updateMetrics(true, Date.now() - startTime);

      return composition;
    } catch (error) {
      this.updateMetrics(false, Date.now() - startTime);
      throw error;
    }
  }

  /**
   * Compose an order transaction with user approval
   */
  async composeOrder(origin: string, params: OrderOptions): Promise<TransactionComposition> {
    await this.checkPermissionAndRateLimit(origin, 'xcp_composeOrder');
    
    const startTime = Date.now();
    const walletService = getWalletService();
    const activeAddress = await walletService.getActiveAddress();
    
    if (!activeAddress) {
      throw new Error('No active address');
    }

    try {
      // Request user approval for the compose operation
      const approvalService = getApprovalService();
      const approved = await approvalService.requestApproval({
        id: `compose-order-${origin}-${Date.now()}`,
        origin,
        method: 'xcp_composeOrder',
        params: [params],
        type: 'compose',
        metadata: {
          domain: new URL(origin).hostname,
          title: 'Create DEX Order',
          description: `Trade ${params.give_asset} for ${params.get_asset}`,
        },
      });

      if (!approved) {
        throw new Error('User denied the request');
      }

      // Compose the transaction
      const composeResult = await composeTransaction(
        'order',
        {
          give_asset: params.give_asset,
          give_quantity: params.give_quantity,
          get_asset: params.get_asset,
          get_quantity: params.get_quantity,
          expiration: params.expiration || 1000,
        },
        activeAddress.address,
        params.sat_per_vbyte || 1,
        params.encoding
      );

      const composition = {
        rawtransaction: composeResult.result.rawtransaction,
        psbt: composeResult.result.psbt,
        fee: composeResult.result.btc_fee,
        params: composeResult.result.params,
      };

      // Record transaction
      this.recordTransaction({
        id: this.generateTransactionId(),
        origin,
        method: 'xcp_composeOrder',
        params,
        status: 'pending',
        timestamp: Date.now(),
        responseTime: Date.now() - startTime,
      });

      this.updateMetrics(true, Date.now() - startTime);
      return composition;
    } catch (error) {
      this.updateMetrics(false, Date.now() - startTime);
      throw error;
    }
  }

  /**
   * Compose a dispenser transaction
   */
  async composeDispenser(origin: string, params: DispenserOptions): Promise<TransactionComposition> {
    await this.checkPermissionAndRateLimit(origin, 'xcp_composeDispenser');
    
    const walletService = getWalletService();
    const activeAddress = await walletService.getLastActiveAddress();
    
    if (!activeAddress) {
      throw new Error('No active address');
    }

    const composeResult = await composeTransaction(
      'dispenser',
      {
        asset: params.asset,
        give_quantity: params.give_quantity,
        escrow_quantity: params.escrow_quantity,
        mainchainrate: params.mainchainrate,
        status: params.status || '0',
      },
      activeAddress,
      params.sat_per_vbyte || 1,
      params.encoding
    );

    return {
      rawtransaction: composeResult.result.rawtransaction,
      psbt: composeResult.result.psbt,
      fee: composeResult.result.btc_fee,
      params: composeResult.result.params,
    };
  }

  /**
   * Compose a dividend transaction
   */
  async composeDividend(origin: string, params: DividendOptions): Promise<TransactionComposition> {
    await this.checkPermissionAndRateLimit(origin, 'xcp_composeDividend');
    
    const walletService = getWalletService();
    const activeAddress = await walletService.getLastActiveAddress();
    
    if (!activeAddress) {
      throw new Error('No active address');
    }

    const composeResult = await composeTransaction(
      'dividend',
      {
        asset: params.asset,
        dividend_asset: params.dividend_asset,
        quantity_per_unit: params.quantity_per_unit,
      },
      activeAddress,
      params.sat_per_vbyte || 1,
      params.encoding
    );

    return {
      rawtransaction: composeResult.result.rawtransaction,
      psbt: composeResult.result.psbt,
      fee: composeResult.result.btc_fee,
      params: composeResult.result.params,
    };
  }

  /**
   * Compose an issuance transaction
   */
  async composeIssuance(origin: string, params: IssuanceOptions): Promise<TransactionComposition> {
    await this.checkPermissionAndRateLimit(origin, 'xcp_composeIssuance');
    
    const walletService = getWalletService();
    const activeAddress = await walletService.getActiveAddress();
    
    if (!activeAddress) {
      throw new Error('No active address');
    }

    const composeResult = await composeTransaction(
      'issuance',
      {
        asset: params.asset,
        quantity: params.quantity,
        divisible: params.divisible,
        lock: params.lock || false,
        reset: params.reset || false,
        description: params.description,
        transfer_destination: params.transfer_destination,
      },
      activeAddress.address,
      params.sat_per_vbyte || 1,
      params.encoding
    );

    return {
      rawtransaction: composeResult.result.rawtransaction,
      psbt: composeResult.result.psbt,
      fee: composeResult.result.btc_fee,
      params: composeResult.result.params,
    };
  }

  /**
   * Sign a transaction with user approval
   */
  async signTransaction(origin: string, rawTx: string): Promise<SignedTransactionResult> {
    await this.checkPermissionAndRateLimit(origin, 'xcp_signTransaction');
    
    const walletService = getWalletService();
    const activeAddress = await walletService.getLastActiveAddress();
    
    if (!activeAddress) {
      throw new Error('No active address');
    }

    // Request user approval for signing
    const approvalService = getApprovalService();
    const approved = await approvalService.requestApproval({
      id: `sign-${origin}-${Date.now()}`,
      origin,
      method: 'xcp_signTransaction',
      params: [rawTx],
      type: 'signature',
      metadata: {
        domain: new URL(origin).hostname,
        title: 'Sign Transaction',
        description: 'Sign a transaction with your wallet',
      },
    });

    if (!approved) {
      throw new Error('User denied the request');
    }

    // Sign the transaction
    const signedTx = await walletService.signTransaction(rawTx, activeAddress);
    
    // Track signing event
    await analytics.track('transaction_signed', { value: '1' });

    return { signedTransaction: signedTx };
  }

  /**
   * Sign a message with user approval
   */
  async signMessage(origin: string, message: string, address: string): Promise<string> {
    await this.checkPermissionAndRateLimit(origin, 'xcp_signMessage');

    // Request user approval for message signing
    const approvalService = getApprovalService();
    const approved = await approvalService.requestApproval({
      id: `sign-msg-${origin}-${Date.now()}`,
      origin,
      method: 'xcp_signMessage',
      params: [message, address],
      type: 'signature',
      metadata: {
        domain: new URL(origin).hostname,
        title: 'Sign Message',
        description: `Sign a message with address ${address}`,
      },
    });

    if (!approved) {
      throw new Error('User denied the request');
    }

    // Sign the message using wallet service
    const walletService = getWalletService();
    const result = await walletService.signMessage(message, address);

    // Track successful signature
    await analytics.track('message_signed', { value: '1' });

    return result.signature;
  }

  /**
   * Broadcast a transaction with replay prevention
   */
  async broadcastTransaction(origin: string, signedTx: string): Promise<BroadcastResult> {
    await this.checkPermissionAndRateLimit(origin, 'xcp_broadcastTransaction');
    
    // Use replay prevention wrapper
    return withReplayPrevention(
      origin,
      'xcp_broadcastTransaction',
      [signedTx],
      async () => {
        // Broadcast the transaction
        const walletService = getWalletService();
        const result = await walletService.broadcastTransaction(signedTx);

        // Record the transaction to prevent replay
        recordTransaction(
          result.txid,
          origin,
          'xcp_broadcastTransaction',
          [signedTx],
          { status: 'pending' }
        );

        // Mark as broadcasted after successful broadcast
        markTransactionBroadcasted(result.txid);

        return {
          txid: result.txid,
          fees: result.fees,
        };
      },
      {
        generateIdempotencyKey: true,
        idempotencyTtlMinutes: 10,
      }
    );
  }

  /**
   * Get transaction history for an origin
   */
  getTransactionHistory(origin?: string): TransactionRecord[] {
    const history = Array.from(this.state.transactionHistory.values());
    
    if (origin) {
      return history.filter(record => record.origin === origin);
    }
    
    return history;
  }

  /**
   * Get transaction statistics
   */
  getTransactionStats(): {
    totalRequests: number;
    successfulRequests: number;
    successRate: number;
    averageResponseTime: number;
    cacheHitRate: number;
    transactionCount: number;
  } {
    const { totalRequests, successfulRequests, averageResponseTime } = this.state.performanceMetrics;
    const successRate = totalRequests > 0 ? (successfulRequests / totalRequests) * 100 : 0;
    
    return {
      totalRequests,
      successfulRequests,
      successRate,
      averageResponseTime,
      cacheHitRate: 0, // Would need to track cache hits
      transactionCount: this.state.transactionHistory.size,
    };
  }

  // Private helper methods

  private async checkPermissionAndRateLimit(origin: string, method: string): Promise<void> {
    // Check connection permission
    const connectionService = getConnectionService();
    if (!await connectionService.hasPermission(origin)) {
      throw new Error('Unauthorized - not connected to wallet');
    }

    // Check rate limiting
    if (!transactionRateLimiter.isAllowed(origin)) {
      const resetTime = transactionRateLimiter.getResetTime(origin);
      throw new Error(
        `Transaction rate limit exceeded. Please wait ${Math.ceil(resetTime / 1000)} seconds.`
      );
    }
  }

  private generateCacheKey(type: string, params: any): string {
    return `${type}_${JSON.stringify(params)}`;
  }

  private getCachedComposition(key: string): TransactionComposition | null {
    const cached = this.state.transactionCache.get(key);
    
    if (cached && Date.now() - cached.timestamp < cached.ttl) {
      return cached.composition;
    }
    
    // Remove expired cache entry
    if (cached) {
      this.state.transactionCache.delete(key);
    }
    
    return null;
  }

  private cacheComposition(key: string, composition: TransactionComposition): void {
    // Cleanup cache if too large
    if (this.state.transactionCache.size >= TransactionService.MAX_CACHE_SIZE) {
      const oldestKey = Array.from(this.state.transactionCache.keys())[0];
      this.state.transactionCache.delete(oldestKey);
    }

    this.state.transactionCache.set(key, {
      composition,
      timestamp: Date.now(),
      ttl: TransactionService.CACHE_TTL,
    });
  }

  private recordTransaction(record: TransactionRecord): void {
    // Cleanup history if too large
    if (this.state.transactionHistory.size >= TransactionService.MAX_HISTORY_SIZE) {
      const oldestKey = Array.from(this.state.transactionHistory.keys())[0];
      this.state.transactionHistory.delete(oldestKey);
    }

    this.state.transactionHistory.set(record.id, record);
  }

  private updateMetrics(success: boolean, responseTime: number): void {
    const metrics = this.state.performanceMetrics;
    metrics.totalRequests++;
    
    if (success) {
      metrics.successfulRequests++;
    }

    // Update rolling average
    metrics.averageResponseTime = 
      (metrics.averageResponseTime * (metrics.totalRequests - 1) + responseTime) / metrics.totalRequests;
  }

  private generateTransactionId(): string {
    return `tx_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  // BaseService implementation methods

  protected async onInitialize(): Promise<void> {
    console.log('TransactionService initialized');
  }

  protected async onDestroy(): Promise<void> {
    // Clear caches and history
    this.state.transactionCache.clear();
    this.state.transactionHistory.clear();
    
    console.log('TransactionService destroyed');
  }

  protected getSerializableState(): SerializedTransactionState | null {
    if (
      this.state.transactionCache.size === 0 &&
      this.state.transactionHistory.size === 0 &&
      this.state.performanceMetrics.totalRequests === 0
    ) {
      return null;
    }

    return {
      cache: Array.from(this.state.transactionCache.entries()).map(
        ([key, cached]) => ({
          key,
          composition: cached.composition,
          timestamp: cached.timestamp,
          ttl: cached.ttl,
        })
      ),
      history: Array.from(this.state.transactionHistory.values()),
      metrics: { ...this.state.performanceMetrics },
    };
  }

  protected hydrateState(state: SerializedTransactionState): void {
    // Restore cache
    for (const { key, composition, timestamp, ttl } of state.cache) {
      // Only restore non-expired cache entries
      if (Date.now() - timestamp < ttl) {
        this.state.transactionCache.set(key, { composition, timestamp, ttl });
      }
    }

    // Restore history
    for (const record of state.history) {
      this.state.transactionHistory.set(record.id, record);
    }

    // Restore metrics
    this.state.performanceMetrics = { ...state.metrics };

    console.log('TransactionService state restored', {
      cacheEntries: this.state.transactionCache.size,
      historyEntries: this.state.transactionHistory.size,
      totalRequests: this.state.performanceMetrics.totalRequests,
    });
  }

  protected getStateVersion(): number {
    return TransactionService.STATE_VERSION;
  }

}