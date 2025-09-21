/**
 * BlockchainService - Comprehensive blockchain operations service
 * 
 * Consolidates all blockchain utilities into a single, production-ready service:
 * - Bitcoin operations (balance, UTXO, fees, broadcasting)
 * - Counterparty API integration
 * - Price feed management
 * - Block height tracking
 * - Caching layer with TTL and invalidation
 * - Circuit breakers for reliability
 * - Retry logic with exponential backoff
 * - Rate limiting awareness
 * - Health monitoring
 */

import { BaseService } from '@/services/core/BaseService';
import { 
  fetchBTCBalance, 
  getFeeRates, 
  FeeRates,
  getCurrentBlockHeight,
  getBtcPrice,
  broadcastTransaction,
  TransactionResponse,
  fetchUTXOs,
  UTXO,
  formatInputsSet,
  getUtxoByTxid,
  fetchPreviousRawTransaction,
  fetchBitcoinTransaction
} from '@/utils/blockchain/bitcoin';
import { 
  fetchTokenBalances,
  fetchAssetDetails,
  fetchAssetDetailsAndBalance,
  fetchTokenBalance,
  fetchTransactions,
  fetchOrders,
  fetchAddressDispensers,
  AssetInfo,
  TokenBalance,
  Transaction,
  Order,
  OrderDetails
} from '@/utils/blockchain/counterparty/api';
import axios from 'axios';

// Cache interfaces
interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

interface CircuitBreakerState {
  failureCount: number;
  lastFailure: number;
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  nextAttempt: number;
}

// Configuration constants
const CACHE_DEFAULTS = {
  BALANCE: 30 * 1000,        // 30 seconds
  UTXOS: 60 * 1000,          // 1 minute
  FEE_RATES: 5 * 60 * 1000,  // 5 minutes
  BLOCK_HEIGHT: 10 * 60 * 1000, // 10 minutes
  PRICE: 2 * 60 * 1000,      // 2 minutes
  ASSET_INFO: 30 * 60 * 1000, // 30 minutes
  TOKEN_BALANCE: 30 * 1000,   // 30 seconds
  TRANSACTIONS: 60 * 1000,    // 1 minute
} as const;

const CIRCUIT_BREAKER_CONFIG = {
  FAILURE_THRESHOLD: 5,
  RECOVERY_TIMEOUT: 60 * 1000, // 1 minute
  HALF_OPEN_MAX_CALLS: 3,
} as const;

const RATE_LIMIT_CONFIG = {
  WINDOW_SIZE: 60 * 1000, // 1 minute
  MAX_REQUESTS: 100,      // requests per window
} as const;

const RETRY_CONFIG = {
  MAX_ATTEMPTS: 3,
  BASE_DELAY: 1000,       // 1 second
  MAX_DELAY: 30 * 1000,   // 30 seconds
  EXPONENTIAL_BASE: 2,
} as const;

export interface BlockchainServiceState {
  cacheStats: {
    hits: number;
    misses: number;
    evictions: number;
  };
  rateLimitStats: {
    requestCount: number;
    throttledCount: number;
  };
  circuitBreakerStats: Record<string, CircuitBreakerState>;
  healthMetrics: {
    lastSuccessfulRequest: number;
    totalRequests: number;
    failedRequests: number;
    averageResponseTime: number;
  };
}

export class BlockchainService extends BaseService {
  // Cache layers
  private cache = new Map<string, CacheEntry<any>>();
  private rateLimits = new Map<string, RateLimitEntry>();
  private circuitBreakers = new Map<string, CircuitBreakerState>();

  // Service state
  private state: BlockchainServiceState = {
    cacheStats: { hits: 0, misses: 0, evictions: 0 },
    rateLimitStats: { requestCount: 0, throttledCount: 0 },
    circuitBreakerStats: {},
    healthMetrics: {
      lastSuccessfulRequest: 0,
      totalRequests: 0,
      failedRequests: 0,
      averageResponseTime: 0,
    },
  };

  // Performance tracking
  private responseTimes: number[] = [];

  constructor() {
    super('BlockchainService');
  }

  protected async onInitialize(): Promise<void> {
    console.log('BlockchainService initialized');
    
    // Set up periodic cache cleanup
    setInterval(() => this.cleanupExpiredCache(), 5 * 60 * 1000); // Every 5 minutes
    
    // Initialize circuit breakers for critical endpoints
    this.initializeCircuitBreakers();
  }

  protected async onDestroy(): Promise<void> {
    this.cache.clear();
    this.rateLimits.clear();
    this.circuitBreakers.clear();
    console.log('BlockchainService destroyed');
  }

  protected getSerializableState(): BlockchainServiceState {
    return {
      ...this.state,
      circuitBreakerStats: Object.fromEntries(this.circuitBreakers),
    };
  }

  protected hydrateState(state: BlockchainServiceState): void {
    this.state = { ...state };
    
    // Restore circuit breakers
    if (state.circuitBreakerStats) {
      this.circuitBreakers = new Map(Object.entries(state.circuitBreakerStats));
    }
  }

  protected getStateVersion(): number {
    return 1;
  }


  // ============================================================================
  // BITCOIN OPERATIONS
  // ============================================================================

  /**
   * Get Bitcoin balance for an address with caching
   */
  async getBTCBalance(address: string, timeoutMs = 5000): Promise<number> {
    const cacheKey = `btc_balance_${address}`;
    
    const cached = this.getFromCache<number>(cacheKey);
    if (cached !== null) return cached;

    const balance = await this.executeWithResilience(
      'btc_balance',
      () => fetchBTCBalance(address, timeoutMs)
    );

    this.setCache(cacheKey, balance, CACHE_DEFAULTS.BALANCE);
    return balance;
  }

  /**
   * Get UTXOs for an address with caching
   */
  async getUTXOs(address: string, signal?: AbortSignal): Promise<UTXO[]> {
    const cacheKey = `utxos_${address}`;
    
    const cached = this.getFromCache<UTXO[]>(cacheKey);
    if (cached !== null) return cached;

    const utxos = await this.executeWithResilience(
      'utxos',
      () => fetchUTXOs(address, signal)
    );

    this.setCache(cacheKey, utxos, CACHE_DEFAULTS.UTXOS);
    return utxos;
  }

  /**
   * Get fee rates with caching
   */
  async getFeeRates(): Promise<FeeRates> {
    const cacheKey = 'fee_rates';
    
    const cached = this.getFromCache<FeeRates>(cacheKey);
    if (cached !== null) return cached;

    const feeRates = await this.executeWithResilience(
      'fee_rates',
      () => getFeeRates()
    );

    this.setCache(cacheKey, feeRates, CACHE_DEFAULTS.FEE_RATES);
    return feeRates;
  }

  /**
   * Get current block height with caching
   */
  async getBlockHeight(forceRefresh = false): Promise<number> {
    const cacheKey = 'block_height';
    
    if (!forceRefresh) {
      const cached = this.getFromCache<number>(cacheKey);
      if (cached !== null) return cached;
    }

    // Clear the utility's internal cache if forcing refresh
    if (forceRefresh) {
      // Block height cache cleared
    }

    const blockHeight = await this.executeWithResilience(
      'block_height',
      () => getCurrentBlockHeight(forceRefresh)
    );

    this.setCache(cacheKey, blockHeight, CACHE_DEFAULTS.BLOCK_HEIGHT);
    return blockHeight;
  }

  /**
   * Get Bitcoin price with caching
   */
  async getBTCPrice(): Promise<number | null> {
    const cacheKey = 'btc_price';
    
    const cached = this.getFromCache<number | null>(cacheKey);
    if (cached !== null) return cached;

    const price = await this.executeWithResilience(
      'btc_price',
      () => getBtcPrice(),
      false // Don't throw on failure, return null
    );

    this.setCache(cacheKey, price, CACHE_DEFAULTS.PRICE);
    return price;
  }

  /**
   * Broadcast transaction with retry logic
   */
  async broadcastTransaction(signedTxHex: string): Promise<TransactionResponse> {
    return await this.executeWithResilience(
      'broadcast_transaction',
      () => broadcastTransaction(signedTxHex)
    );
  }

  /**
   * Get previous raw transaction
   */
  async getPreviousRawTransaction(txid: string): Promise<string | null> {
    const cacheKey = `raw_tx_${txid}`;
    
    const cached = this.getFromCache<string | null>(cacheKey);
    if (cached !== null) return cached;

    const rawTx = await this.executeWithResilience(
      'raw_transaction',
      () => fetchPreviousRawTransaction(txid),
      false
    );

    // Cache for longer since raw transactions don't change
    this.setCache(cacheKey, rawTx, 60 * 60 * 1000); // 1 hour
    return rawTx;
  }

  /**
   * Get Bitcoin transaction details
   */
  async getBitcoinTransaction(txid: string): Promise<any | null> {
    const cacheKey = `btc_tx_${txid}`;
    
    const cached = this.getFromCache<any>(cacheKey);
    if (cached !== null) return cached;

    const transaction = await this.executeWithResilience(
      'bitcoin_transaction',
      () => fetchBitcoinTransaction(txid),
      false
    );

    // Cache for longer since confirmed transactions don't change
    this.setCache(cacheKey, transaction, 60 * 60 * 1000); // 1 hour
    return transaction;
  }

  // ============================================================================
  // COUNTERPARTY OPERATIONS
  // ============================================================================

  /**
   * Get token balances with caching
   */
  async getTokenBalances(
    address: string, 
    options: { 
      excludeUtxos?: boolean; 
      verbose?: boolean; 
      assetLongname?: string;
    } = {}
  ): Promise<TokenBalance[]> {
    const cacheKey = `token_balances_${address}_${JSON.stringify(options)}`;
    
    const cached = this.getFromCache<TokenBalance[]>(cacheKey);
    if (cached !== null) return cached;

    const balances = await this.executeWithResilience(
      'token_balances',
      () => fetchTokenBalances(address, options)
    );

    this.setCache(cacheKey, balances, CACHE_DEFAULTS.TOKEN_BALANCE);
    return balances;
  }

  /**
   * Get asset details with caching
   */
  async getAssetDetails(asset: string, verbose = true): Promise<AssetInfo | null> {
    const cacheKey = `asset_details_${asset}_${verbose}`;
    
    const cached = this.getFromCache<AssetInfo | null>(cacheKey);
    if (cached !== null) return cached;

    const assetInfo = await this.executeWithResilience(
      'asset_details',
      () => fetchAssetDetails(asset, { verbose }),
      false
    );

    this.setCache(cacheKey, assetInfo, CACHE_DEFAULTS.ASSET_INFO);
    return assetInfo;
  }

  /**
   * Get asset details and balance with caching
   */
  async getAssetDetailsAndBalance(
    asset: string, 
    address: string, 
    options: { verbose?: boolean } = {}
  ): Promise<{
    isDivisible: boolean;
    assetInfo: AssetInfo;
    availableBalance: string;
  }> {
    const cacheKey = `asset_details_balance_${asset}_${address}_${JSON.stringify(options)}`;
    
    const cached = this.getFromCache<{
      isDivisible: boolean;
      assetInfo: AssetInfo;
      availableBalance: string;
    }>(cacheKey);
    if (cached !== null) return cached;

    const result = await this.executeWithResilience(
      'asset_details_balance',
      () => fetchAssetDetailsAndBalance(asset, address, options)
    );

    this.setCache(cacheKey, result, CACHE_DEFAULTS.TOKEN_BALANCE);
    return result;
  }

  /**
   * Get single token balance with caching
   */
  async getTokenBalance(
    address: string, 
    asset: string, 
    options: { 
      excludeUtxos?: boolean; 
      verbose?: boolean;
    } = {}
  ): Promise<TokenBalance | null> {
    const cacheKey = `token_balance_${address}_${asset}_${JSON.stringify(options)}`;
    
    const cached = this.getFromCache<TokenBalance | null>(cacheKey);
    if (cached !== null) return cached;

    const balance = await this.executeWithResilience(
      'token_balance',
      () => fetchTokenBalance(address, asset, options),
      false
    );

    this.setCache(cacheKey, balance, CACHE_DEFAULTS.TOKEN_BALANCE);
    return balance;
  }

  /**
   * Get transactions with caching
   */
  async getTransactions(
    address: string,
    options: {
      action?: string;
      limit?: number;
      offset?: number;
      verbose?: boolean;
    } = {}
  ): Promise<Transaction[]> {
    const cacheKey = `transactions_${address}_${JSON.stringify(options)}`;
    
    const cached = this.getFromCache<Transaction[]>(cacheKey);
    if (cached !== null) return cached;

    const response = await this.executeWithResilience(
      'transactions',
      () => fetchTransactions(address, options)
    ) as unknown as { result: Transaction[], result_count: number };

    const transactions = response.result;
    this.setCache(cacheKey, transactions, CACHE_DEFAULTS.TRANSACTIONS);
    return transactions;
  }

  /**
   * Get orders with caching
   */
  async getOrders(
    address?: string,
    options: {
      status?: string;
      limit?: number;
      offset?: number;
      verbose?: boolean;
    } = {}
  ): Promise<Order[] | OrderDetails[]> {
    const cacheKey = `orders_${address || 'all'}_${JSON.stringify(options)}`;
    
    const cached = this.getFromCache<Order[] | OrderDetails[]>(cacheKey);
    if (cached !== null) return cached;

    const response = await this.executeWithResilience(
      'orders',
      () => fetchOrders(address || '', options as any)
    ) as unknown as { orders: Order[], total: number };

    const orders = response.orders;
    this.setCache(cacheKey, orders, CACHE_DEFAULTS.TRANSACTIONS);
    return orders;
  }

  /**
   * Get dispensers with caching
   */
  async getDispensers(
    address?: string,
    options: {
      status?: string;
      limit?: number;
      offset?: number;
      verbose?: boolean;
    } = {}
  ): Promise<any[]> {
    const cacheKey = `dispensers_${address || 'all'}_${JSON.stringify(options)}`;
    
    const cached = this.getFromCache<any[]>(cacheKey);
    if (cached !== null) return cached;

    const dispensers = await this.executeWithResilience(
      'dispensers',
      () => fetchAddressDispensers(address || '', options as any)
    ) as unknown as any[];

    this.setCache(cacheKey, dispensers, CACHE_DEFAULTS.TRANSACTIONS);
    return dispensers;
  }

  /**
   * Get asset history with caching
   */
  async getAssetHistory(
    asset: string,
    options: {
      limit?: number;
      offset?: number;
      verbose?: boolean;
    } = {}
  ): Promise<Transaction[]> {
    const cacheKey = `asset_history_${asset}_${JSON.stringify(options)}`;
    
    const cached = this.getFromCache<Transaction[]>(cacheKey);
    if (cached !== null) return cached;

    // Asset history needs to be fetched from transactions endpoint
    const history = await this.executeWithResilience(
      'asset_history',
      () => fetchTransactions(asset, options)
    ) as unknown as Transaction[];

    this.setCache(cacheKey, history, CACHE_DEFAULTS.TRANSACTIONS);
    return history;
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  /**
   * Format inputs set from UTXOs
   */
  formatInputsSet(utxos: UTXO[]): string {
    return formatInputsSet(utxos);
  }

  /**
   * Get specific UTXO by transaction ID and output index
   */
  getUtxoByTxid(utxos: UTXO[], txid: string, vout: number): UTXO | undefined {
    return getUtxoByTxid(utxos, txid, vout);
  }

  // ============================================================================
  // CACHE MANAGEMENT
  // ============================================================================

  /**
   * Clear all caches
   */
  clearAllCaches(): void {
    this.cache.clear();
    // Clear all cached data
    this.state.cacheStats.evictions += this.cache.size;
  }

  /**
   * Clear cache for specific key pattern
   */
  clearCachePattern(pattern: string): void {
    const keysToDelete = Array.from(this.cache.keys()).filter(key => 
      key.includes(pattern)
    );
    
    keysToDelete.forEach(key => this.cache.delete(key));
    this.state.cacheStats.evictions += keysToDelete.length;
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      ...this.state.cacheStats,
      totalEntries: this.cache.size,
      hitRate: this.state.cacheStats.hits / 
        (this.state.cacheStats.hits + this.state.cacheStats.misses),
    };
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private initializeCircuitBreakers(): void {
    const endpoints = [
      'btc_balance', 'utxos', 'fee_rates', 'block_height', 'btc_price',
      'broadcast_transaction', 'token_balances', 'asset_details', 'transactions'
    ];

    endpoints.forEach(endpoint => {
      this.circuitBreakers.set(endpoint, {
        failureCount: 0,
        lastFailure: 0,
        state: 'CLOSED',
        nextAttempt: 0,
      });
    });
  }

  private async executeWithResilience<T>(
    operation: string,
    fn: () => Promise<T>,
    throwOnError = true
  ): Promise<T> {
    // Check rate limiting
    if (!this.checkRateLimit(operation)) {
      this.state.rateLimitStats.throttledCount++;
      throw new Error('Rate limit exceeded');
    }

    // Check circuit breaker
    if (!this.checkCircuitBreaker(operation)) {
      throw new Error('Circuit breaker is open');
    }

    const startTime = Date.now();

    try {
      const result = await this.retryWithExponentialBackoff(fn);
      
      // Record success
      this.recordSuccess(operation, Date.now() - startTime);
      
      return result;
    } catch (error) {
      // Record failure
      this.recordFailure(operation);
      
      if (throwOnError) {
        throw error;
      }
      
      return null as T;
    }
  }

  private async retryWithExponentialBackoff<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 1; attempt <= RETRY_CONFIG.MAX_ATTEMPTS; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;
        
        // Don't retry on certain errors
        if (this.isNonRetryableError(error)) {
          throw error;
        }
        
        if (attempt < RETRY_CONFIG.MAX_ATTEMPTS) {
          const delay = Math.min(
            RETRY_CONFIG.BASE_DELAY * Math.pow(RETRY_CONFIG.EXPONENTIAL_BASE, attempt - 1),
            RETRY_CONFIG.MAX_DELAY
          );
          
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    throw lastError!;
  }

  private isNonRetryableError(error: any): boolean {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      // Don't retry on 4xx errors (except 429 - rate limited)
      return status !== undefined && status >= 400 && status < 500 && status !== 429;
    }
    
    // Don't retry on abort errors
    return error.name === 'AbortError';
  }

  private checkRateLimit(operation: string): boolean {
    const now = Date.now();
    const key = `rate_limit_${operation}`;
    const entry = this.rateLimits.get(key);

    if (!entry || now - entry.windowStart >= RATE_LIMIT_CONFIG.WINDOW_SIZE) {
      this.rateLimits.set(key, { count: 1, windowStart: now });
      return true;
    }

    if (entry.count >= RATE_LIMIT_CONFIG.MAX_REQUESTS) {
      return false;
    }

    entry.count++;
    return true;
  }

  private checkCircuitBreaker(operation: string): boolean {
    const breaker = this.circuitBreakers.get(operation);
    if (!breaker) return true;

    const now = Date.now();

    switch (breaker.state) {
      case 'CLOSED':
        return true;
        
      case 'OPEN':
        if (now >= breaker.nextAttempt) {
          breaker.state = 'HALF_OPEN';
          return true;
        }
        return false;
        
      case 'HALF_OPEN':
        return true;
        
      default:
        return true;
    }
  }

  private recordSuccess(operation: string, responseTime: number): void {
    const breaker = this.circuitBreakers.get(operation);
    if (breaker) {
      breaker.failureCount = 0;
      breaker.state = 'CLOSED';
    }

    // Update metrics
    this.state.healthMetrics.lastSuccessfulRequest = Date.now();
    this.state.healthMetrics.totalRequests++;
    this.state.rateLimitStats.requestCount++;
    
    // Track response time
    this.responseTimes.push(responseTime);
    if (this.responseTimes.length > 100) {
      this.responseTimes.shift(); // Keep only last 100 measurements
    }
    
    this.state.healthMetrics.averageResponseTime = 
      this.responseTimes.reduce((a, b) => a + b, 0) / this.responseTimes.length;
  }

  private recordFailure(operation: string): void {
    let breaker = this.circuitBreakers.get(operation);
    if (!breaker) {
      // Create new circuit breaker if it doesn't exist
      breaker = {
        failureCount: 0,
        lastFailure: 0,
        state: 'CLOSED',
        nextAttempt: 0,
      };
      this.circuitBreakers.set(operation, breaker);
    }

    breaker.failureCount++;
    breaker.lastFailure = Date.now();
    
    if (breaker.failureCount >= CIRCUIT_BREAKER_CONFIG.FAILURE_THRESHOLD) {
      breaker.state = 'OPEN';
      breaker.nextAttempt = Date.now() + CIRCUIT_BREAKER_CONFIG.RECOVERY_TIMEOUT;
    }

    // Update metrics
    this.state.healthMetrics.totalRequests++;
    this.state.healthMetrics.failedRequests++;
    this.state.rateLimitStats.requestCount++;
  }

  private getFromCache<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) {
      this.state.cacheStats.misses++;
      return null;
    }

    const now = Date.now();
    if (now - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      this.state.cacheStats.misses++;
      this.state.cacheStats.evictions++;
      return null;
    }

    this.state.cacheStats.hits++;
    return entry.data;
  }

  private setCache<T>(key: string, data: T, ttl: number): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl,
    });
  }

  private cleanupExpiredCache(): void {
    const now = Date.now();
    let evicted = 0;
    
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
        evicted++;
      }
    }
    
    this.state.cacheStats.evictions += evicted;
    
    if (evicted > 0) {
      console.log(`BlockchainService: Cleaned up ${evicted} expired cache entries`);
    }
  }
}