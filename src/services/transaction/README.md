# TransactionService

The **TransactionService** is a comprehensive, production-ready service that handles all transaction-related operations for the Counterparty Web3 Wallet extension. It extracts and consolidates all transaction functionality from the ProviderService into a dedicated, well-architected service.

## Architecture

The TransactionService extends `BaseService` and integrates with:
- **ConnectionService** - for dApp permission validation
- **ApprovalService** - for user consent workflows  
- **BlockchainService** - for blockchain operations
- **WalletService** - for address management and signing

## Key Features

### 🔄 Transaction Composition
- **Send transactions** - Asset transfers with memo support
- **DEX Orders** - Decentralized exchange order creation
- **Dispensers** - Automated asset distribution
- **Dividends** - Asset holder rewards
- **Issuances** - New asset creation and management

### ✍️ Transaction Signing
- **Transaction signing** with user approval workflows
- **Message signing** for authentication and verification
- **Replay attack prevention** 
- **Address validation** and security checks

### 📡 Transaction Broadcasting  
- **Secure broadcasting** with idempotency guarantees
- **Rate limiting** to prevent abuse
- **Transaction tracking** and status monitoring
- **Error handling** with retry logic

### ⚡ Performance & Caching
- **Intelligent caching** with TTL management
- **Cache invalidation** strategies
- **Performance metrics** tracking
- **Circuit breaker** pattern for resilience

### 📊 Monitoring & Analytics
- **Transaction history** with searchable records
- **Success/failure rate** tracking  
- **Response time** monitoring
- **Security event** logging

## Usage Examples

### Basic Setup

```typescript
import { TransactionService } from '@/services/transaction';
import { ConnectionService } from '@/services/connection';
import { ApprovalService } from '@/services/approval';
import { BlockchainService } from '@/services/blockchain';

// Initialize dependencies
const connectionService = new ConnectionService();
const approvalService = new ApprovalService();
const blockchainService = new BlockchainService();

// Create TransactionService
const transactionService = new TransactionService(
  connectionService,
  approvalService,
  blockchainService
);

// Initialize the service
await transactionService.initialize();
```

### Transaction Composition

#### Send Transaction

```typescript
const sendComposition = await transactionService.composeSend(
  'https://example.com',
  {
    destination: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
    asset: 'XCP',
    quantity: 1000000, // 1.0 XCP (divisible asset)
    memo: 'Hello World',
    memo_is_hex: false,
    fee_rate: 2, // 2 sat/vbyte
    encoding: 'opreturn'
  }
);

console.log('Raw transaction:', sendComposition.rawtransaction);
console.log('PSBT:', sendComposition.psbt);
console.log('Fee:', sendComposition.fee);
```

#### DEX Order

```typescript
const orderComposition = await transactionService.composeOrder(
  'https://dex.example.com',
  {
    give_asset: 'XCP',
    give_quantity: 1000000, // 1.0 XCP
    get_asset: 'PEPECASH', 
    get_quantity: 100000000, // 100.0 PEPECASH
    expiration: 1000, // blocks
    fee_rate: 1
  }
);

// User approval is automatically requested for orders
console.log('Order composition:', orderComposition);
```

#### Asset Issuance

```typescript
const issuanceComposition = await transactionService.composeIssuance(
  'https://issuer.example.com',
  {
    asset: 'MYTOKEN',
    quantity: 1000000000000, // 10,000.0000 tokens
    divisible: true,
    description: 'My Custom Token for XYZ Platform',
    lock: false, // Allow future issuances
    fee_rate: 3
  }
);

console.log('Issuance composition:', issuanceComposition);
```

### Transaction Signing

#### Sign Transaction

```typescript
try {
  const result = await transactionService.signTransaction(
    'https://example.com',
    rawTransactionHex,
    '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa' // optional specific address
  );
  
  console.log('Signed transaction:', result.signedTransaction);
} catch (error) {
  if (error.message === 'User denied the transaction signing request') {
    console.log('User rejected the signing request');
  }
}
```

#### Sign Message

```typescript
try {
  const signature = await transactionService.signMessage(
    'https://example.com',
    'Please sign this message to authenticate',
    '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'
  );
  
  console.log('Message signature:', signature);
} catch (error) {
  console.error('Message signing failed:', error);
}
```

### Transaction Broadcasting

```typescript
try {
  const result = await transactionService.broadcastTransaction(
    'https://example.com',
    signedTransactionHex
  );
  
  console.log('Transaction broadcast:', {
    txid: result.txid,
    status: result.status,
    fees: result.fees
  });
} catch (error) {
  if (error.message.includes('Duplicate transaction')) {
    console.log('Transaction already broadcasted');
  }
}
```

### Monitoring & Analytics

#### Get Transaction History

```typescript
// Get all transaction history
const allHistory = transactionService.getTransactionHistory();

// Get history for specific origin
const dappHistory = transactionService.getTransactionHistory(
  'https://example.com',
  50 // limit to 50 entries
);

console.log('Transaction history:', dappHistory);
```

#### Get Performance Statistics

```typescript
const stats = transactionService.getTransactionStats();

console.log('Performance metrics:', {
  totalOperations: stats.totalOperations,
  successRate: stats.successRate, // 0.0 - 1.0
  cacheHitRate: stats.cacheHitRate, // 0.0 - 1.0  
  averageCompositionTime: stats.averageCompositionTime, // milliseconds
  pendingSignatures: stats.pendingSignatures,
  historyEntries: stats.historyEntries,
  cacheEntries: stats.cacheEntries
});
```

#### Health Monitoring

```typescript
const health = await transactionService.getHealth();

console.log('Service health:', {
  status: health.status, // 'healthy' | 'degraded' | 'unhealthy'
  message: health.message,
  metrics: health.metrics
});
```

### Cache Management

#### Clear Cache

```typescript
// Clear all transaction cache
transactionService.clearTransactionCache();

// Clear cache for specific pattern
transactionService.clearTransactionCache('send'); // Clear all send transaction cache
transactionService.clearTransactionCache('https://example.com'); // Clear cache for specific origin
```

## Error Handling

The TransactionService provides comprehensive error handling:

### Common Error Types

```typescript
// Connection errors
catch (error) {
  if (error.message === 'Unauthorized - not connected to wallet') {
    // dApp needs to call xcp_requestAccounts first
  }
}

// Rate limiting errors
catch (error) {
  if (error.message.includes('rate limit exceeded')) {
    // Too many requests, need to wait
  }
}

// User rejection errors
catch (error) {
  if (error.message === 'User denied the request') {
    // User rejected the approval in the UI
  }
}

// Replay prevention errors
catch (error) {
  if (error.message.includes('Duplicate transaction')) {
    // Transaction was already processed
  }
}

// Wallet state errors
catch (error) {
  if (error.message === 'No active address') {
    // Wallet is locked or no address selected
  }
}
```

## Configuration

### Cache Configuration

```typescript
// Cache TTL settings (in TransactionService.ts)
const CACHE_DEFAULT_TTL = 5 * 60 * 1000; // 5 minutes
const MAX_CACHE_ENTRIES = 100; // Maximum cached compositions
const MAX_HISTORY_ENTRIES = 1000; // Maximum history entries
```

### Rate Limiting

```typescript  
// Service-level rate limits
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute window
const RATE_LIMIT_MAX_REQUESTS = 10; // Max requests per window
```

## Security Features

### 🛡️ Replay Prevention
- **Idempotency keys** for broadcast operations
- **Transaction deduplication** based on content hash
- **Time-based expiration** of cached operations

### 🔐 User Approval Workflows
- **Interactive consent** for all sensitive operations
- **Parameter validation** before execution
- **Clear operation descriptions** in approval UI

### ⚡ Rate Limiting
- **Per-origin limits** for transaction composition
- **Sliding window** rate limiting algorithm
- **Graceful degradation** under load

### 📊 Audit Trail
- **Complete transaction history** with metadata
- **Success/failure tracking** for compliance
- **Performance metrics** for monitoring

## Integration with Other Services

### ConnectionService Integration
```typescript
// Validates dApp permissions before any transaction operation
await this.connectionService.hasPermission(origin);
```

### ApprovalService Integration  
```typescript
// Requests user consent for transaction operations
await this.approvalService.requestApproval(approvalRequest);
```

### BlockchainService Integration
```typescript
// Uses blockchain service for broadcasting with resilience
await this.blockchainService.broadcastTransaction(signedTx);
```

## Service Lifecycle

The TransactionService follows the BaseService lifecycle:

1. **Initialize** - Sets up caches, restores state, starts cleanup timers
2. **Operation** - Handles transaction requests with full monitoring
3. **Persistence** - Saves state every 5 minutes via BaseService
4. **Destruction** - Clears caches, saves final state, cleanup resources

## Best Practices

### For dApp Developers

1. **Always check permissions** before making transaction requests
2. **Handle rate limiting** gracefully with exponential backoff
3. **Provide clear transaction descriptions** for user approval
4. **Monitor transaction status** after broadcasting
5. **Cache transaction compositions** when possible

### For Extension Developers

1. **Monitor service health** regularly
2. **Set up proper error handling** for all operations  
3. **Use appropriate cache TTLs** based on operation type
4. **Track performance metrics** for optimization
5. **Implement proper cleanup** on service shutdown

## Performance Considerations

- **Composition caching** reduces redundant API calls
- **Efficient cache invalidation** maintains data freshness  
- **Rate limiting** prevents service overload
- **Circuit breakers** handle upstream failures
- **Async operations** maintain UI responsiveness

## Testing

The TransactionService is designed to be easily testable:

```typescript
// Mock dependencies for unit tests
const mockConnectionService = {
  hasPermission: jest.fn().mockResolvedValue(true)
};

const mockApprovalService = {
  requestApproval: jest.fn().mockResolvedValue(true)
};

const mockBlockchainService = {
  broadcastTransaction: jest.fn().mockResolvedValue({ txid: 'mock-txid' })
};

const transactionService = new TransactionService(
  mockConnectionService as any,
  mockApprovalService as any, 
  mockBlockchainService as any
);
```

## Future Enhancements

- **Multi-signature support** for enterprise wallets
- **Batch transaction processing** for efficiency
- **Advanced analytics** and reporting
- **Custom fee estimation** algorithms
- **Enhanced security scanning** for transactions