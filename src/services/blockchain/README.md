# BlockchainService

A comprehensive, production-ready blockchain service that consolidates all blockchain utilities into a single, efficient service. Built on top of `BaseService` with advanced features like caching, circuit breakers, retry logic, and health monitoring.

## Features

- **Unified API**: Single service for all Bitcoin and Counterparty operations
- **Advanced Caching**: TTL-based caching with pattern-based invalidation
- **Circuit Breakers**: Automatic failure detection and recovery
- **Retry Logic**: Exponential backoff for transient failures
- **Rate Limiting**: Configurable request throttling
- **Health Monitoring**: Real-time service health tracking
- **Cross-Context Communication**: Proxy service for popup/content script access
- **Type Safety**: Full TypeScript support with comprehensive type exports

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Popup/UI      │    │  Background     │    │  External APIs  │
│                 │    │                 │    │                 │
│ BlockchainProxy ├────┤ BlockchainService├────┤ Bitcoin/CP APIs │
│                 │    │                 │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                              │
                              ▼
                       ┌─────────────┐
                       │ Cache Layer │
                       │ Circuit     │
                       │ Breakers    │
                       │ Rate Limits │
                       └─────────────┘
```

## Quick Start

### 1. Background Script (Automatic)
The service is automatically registered in the background script:

```typescript
import { registerBlockchainService } from '@/services/blockchain';

// Automatically called during background initialization
registerBlockchainService();
```

### 2. Using from Popup/UI
```typescript
import { blockchainService } from '@/services/blockchain';

// Bitcoin operations
const balance = await blockchainService.getBTCBalance(address);
const feeRates = await blockchainService.getFeeRates();
const utxos = await blockchainService.getUTXOs(address);
const txResult = await blockchainService.broadcastTransaction(signedHex);

// Counterparty operations
const tokenBalances = await blockchainService.getTokenBalances(address);
const assetDetails = await blockchainService.getAssetDetails('PEPECASH');
const transactions = await blockchainService.getTransactions(address);

// Cache management
const cacheStats = await blockchainService.getCacheStats();
await blockchainService.clearCachePattern('btc_balance');
```

### 3. Using from Background (Direct Access)
```typescript
import { getBlockchainService } from '@/services/blockchain';

const service = getBlockchainService();
const balance = await service.getBTCBalance(address);
```

## API Reference

### Bitcoin Operations

#### `getBTCBalance(address: string, timeoutMs?: number): Promise<number>`
Fetches Bitcoin balance in satoshis with caching (30s TTL).

#### `getUTXOs(address: string): Promise<UTXO[]>`
Fetches UTXOs for an address with caching (1 minute TTL).

#### `getFeeRates(): Promise<FeeRates>`
Gets current fee rates with caching (5 minutes TTL).

#### `getBlockHeight(forceRefresh?: boolean): Promise<number>`
Gets current block height with caching (10 minutes TTL).

#### `getBTCPrice(): Promise<number | null>`
Gets Bitcoin price in USD with caching (2 minutes TTL).

#### `broadcastTransaction(signedTxHex: string): Promise<TransactionResponse>`
Broadcasts a signed transaction with retry logic.

### Counterparty Operations

#### `getTokenBalances(address: string, options?: object): Promise<TokenBalance[]>`
Gets all token balances for an address.

#### `getAssetDetails(asset: string, verbose?: boolean): Promise<AssetInfo | null>`
Gets detailed asset information with long-term caching (30 minutes TTL).

#### `getTransactions(address: string, options?: object): Promise<Transaction[]>`
Gets transaction history for an address.

#### `getOrders(address?: string, options?: object): Promise<Order[]>`
Gets trading orders.

#### `getDispensers(address?: string, options?: object): Promise<any[]>`
Gets dispenser information.

### Cache Management

#### `clearAllCaches(): Promise<void>`
Clears all cached data.

#### `clearCachePattern(pattern: string): Promise<void>`
Clears cache entries matching a pattern.

#### `getCacheStats(): Promise<CacheStats>`
Gets cache performance statistics.

### Health & Monitoring

#### `getServiceHealth(): Promise<ServiceHealthStatus>`
Gets current service health status.

## Configuration

The service uses these default configurations:

```typescript
const CACHE_DEFAULTS = {
  BALANCE: 30 * 1000,        // 30 seconds
  UTXOS: 60 * 1000,          // 1 minute  
  FEE_RATES: 5 * 60 * 1000,  // 5 minutes
  BLOCK_HEIGHT: 10 * 60 * 1000, // 10 minutes
  PRICE: 2 * 60 * 1000,      // 2 minutes
  ASSET_INFO: 30 * 60 * 1000, // 30 minutes
};

const CIRCUIT_BREAKER_CONFIG = {
  FAILURE_THRESHOLD: 5,
  RECOVERY_TIMEOUT: 60 * 1000, // 1 minute
};

const RATE_LIMIT_CONFIG = {
  WINDOW_SIZE: 60 * 1000, // 1 minute
  MAX_REQUESTS: 100,      // requests per window
};
```

## Error Handling

The service provides comprehensive error handling:

- **Circuit Breakers**: Automatically detect failing endpoints and temporarily disable them
- **Retry Logic**: Exponential backoff for transient failures (network timeouts, 5xx errors)
- **Rate Limiting**: Prevents overwhelming external APIs
- **Non-Retryable Errors**: Client errors (4xx) are not retried except for 429 (rate limited)

```typescript
try {
  const balance = await blockchainService.getBTCBalance(address);
} catch (error) {
  if (error.message.includes('Rate limit')) {
    // Handle rate limiting
  } else if (error.message.includes('Circuit breaker')) {
    // Handle service degradation
  } else {
    // Handle other errors
  }
}
```

## Health Monitoring

The service provides real-time health monitoring:

```typescript
const health = await blockchainService.getServiceHealth();

switch (health.status) {
  case 'healthy':
    console.log('All services operational');
    break;
  case 'degraded':
    console.warn('Some issues detected:', health.message);
    break;
  case 'unhealthy':
    console.error('Service issues:', health.message);
    break;
}
```

## Performance Monitoring

Track cache performance and service metrics:

```typescript
const stats = await blockchainService.getCacheStats();
console.log(`Cache hit rate: ${(stats.hitRate * 100).toFixed(1)}%`);
console.log(`Total entries: ${stats.totalEntries}`);

const health = await blockchainService.getServiceHealth();
console.log(`Average response time: ${health.metrics.avgResponseTime}ms`);
console.log(`Failure rate: ${health.metrics.failureRate}%`);
```

## Migration Guide

If you're currently using the scattered blockchain utilities directly:

### Before (Scattered Utilities)
```typescript
import { fetchBTCBalance } from '@/utils/blockchain/bitcoin/balance';
import { getFeeRates } from '@/utils/blockchain/bitcoin/feeRate';
import { fetchTokenBalances } from '@/utils/blockchain/counterparty/api';

// No caching, no error handling, no monitoring
const balance = await fetchBTCBalance(address);
const feeRates = await getFeeRates();
const tokens = await fetchTokenBalances(address);
```

### After (BlockchainService)
```typescript
import { blockchainService } from '@/services/blockchain';

// With caching, error handling, monitoring, and more
const balance = await blockchainService.getBTCBalance(address);
const feeRates = await blockchainService.getFeeRates();
const tokens = await blockchainService.getTokenBalances(address);
```

## Testing

The service includes comprehensive unit tests with mocking:

```bash
# Run specific blockchain service tests
npx vitest src/services/blockchain/__tests__/BlockchainService.test.ts
```

## Best Practices

1. **Use the Proxy**: Always use `blockchainService` from popup/UI contexts
2. **Handle Errors**: Implement proper error handling for network issues
3. **Monitor Health**: Check service health in critical paths
4. **Cache Awareness**: Understand cache TTLs for your use case
5. **Rate Limiting**: Be aware of rate limits when making bulk requests
6. **Clear Cache**: Clear relevant cache when data freshness is critical

## Troubleshooting

### High Failure Rate
Check circuit breaker status and external API availability.

### Cache Issues  
Use `clearCachePattern()` to clear specific cache entries.

### Rate Limiting
Implement request batching or increase delays between requests.

### Service Not Available
Ensure `registerBlockchainService()` is called in background script.