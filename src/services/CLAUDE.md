# Services Directory

This directory contains the refactored service architecture for the XCP Wallet browser extension, providing a clean separation of concerns and robust cross-context communication.

## Service Architecture Overview

The extension follows a **service-oriented architecture** with four layers:

1. **Core Services** (`core/`) - Base infrastructure and utilities
2. **Domain Services** - Specialized services for specific functionality
3. **Legacy Service** (`providerService.ts`) - Main dApp interface (being refactored)
4. **Utility Services** (`eventEmitterService.ts`, `walletService.ts`) - Supporting services

### Key Design Principles

- **BaseService Pattern**: All services extend `BaseService` for lifecycle management
- **Dependency Injection**: ServiceRegistry manages service dependencies
- **State Persistence**: Services survive service worker restarts
- **Health Monitoring**: All services provide health status
- **Proxy Communication**: Cross-context communication via `@webext-core/proxy-service`

## Core Infrastructure

### BaseService (`core/BaseService.ts`)

**Purpose**: Abstract foundation for all services with lifecycle management, state persistence, and health monitoring.

```typescript
export abstract class BaseService {
  protected serviceName: string;
  protected serviceStartTime: number;
  private initialized: boolean = false;

  // Lifecycle methods
  async initialize(): Promise<void>;
  async destroy(): Promise<void>;
  
  // State management
  protected abstract getSerializableState(): any;
  protected abstract hydrateState(state: any): void;
  
  // Health monitoring
  async getHealth(): Promise<ServiceHealthStatus>;
  protected abstract checkHealth(): Promise<ServiceHealthStatus>;
  
  // Utility methods
  isInitialized(): boolean;
  getServiceName(): string;
  getStartTime(): number;
}
```

**Key Features**:
- **Automatic state persistence** every 5 minutes
- **Service worker keep-alive** mechanism
- **Health status tracking** (healthy/degraded/unhealthy)
- **Lifecycle hooks** for initialization and cleanup
- **Version-aware state** with migration support

### ServiceRegistry (`core/ServiceRegistry.ts`)

**Purpose**: Centralized service management with dependency injection and lifecycle coordination.

```typescript
class ServiceRegistry {
  async register(service: BaseService): Promise<void>;
  get<T extends BaseService>(name: string): T;
  async initialize(serviceName: string): Promise<void>;
  async destroy(serviceName: string): Promise<void>;
  async destroyAll(): Promise<void>;
  getServiceNames(): string[];
  async getSystemHealth(): Promise<SystemHealthStatus>;
}
```

**Usage**:
```typescript
// In background.ts
const serviceRegistry = ServiceRegistry.getInstance();

// Register services
await serviceRegistry.register(new ConnectionService());
await serviceRegistry.register(new ApprovalService());
await serviceRegistry.register(new TransactionService());
await serviceRegistry.register(new BlockchainService());

// Get services
const connectionService = serviceRegistry.get<ConnectionService>('ConnectionService');
```

### RequestManager (`core/RequestManager.ts`)

**Purpose**: Memory-safe request handling with automatic cleanup and timeout management.

```typescript
export class RequestManager {
  createManagedPromise<T>(id: string, metadata?: Partial<PendingRequest>): Promise<T>;
  resolve(id: string, result: any): boolean;
  reject(id: string, error: Error): boolean;
  remove(id: string): boolean;
  getStats(): RequestManagerStats;
  cleanupExpired(): number;
  destroy(): void;
}
```

**Key Features**:
- **Automatic timeout handling** (default 5 minutes)
- **Memory leak prevention** via periodic cleanup
- **Request tracking** and statistics
- **Graceful promise resolution**

### MessageBus (`core/MessageBus.ts`)

**Purpose**: Standardized cross-context messaging system replacing direct `browser.runtime.sendMessage` calls.

```typescript
export class MessageBus {
  static async send<K extends keyof MessageProtocol>(
    message: K, 
    data: MessageProtocol[K]['input'], 
    target: MessageTarget = 'background'
  ): Promise<MessageProtocol[K]['output']>;
  
  static setupMessageHandler<K extends keyof MessageProtocol>(
    message: K,
    handler: MessageHandler<MessageProtocol[K]['input'], MessageProtocol[K]['output']>
  ): void;
}
```

## Domain Services

### ConnectionService (`connection/ConnectionService.ts`)

**Purpose**: dApp connection and permission management with security validation.

```typescript
export class ConnectionService extends BaseService {
  async hasPermission(origin: string): Promise<boolean>;
  async connect(origin: string, address: string, walletId: string): Promise<string[]>;
  async disconnect(origin: string): Promise<void>;
  async getConnectedSites(): Promise<string[]>;
  async validateOrigin(origin: string): Promise<ValidationResult>;
}
```

**Key Features**:
- **Permission validation** before operations
- **Security checks** (CSP analysis)
- **Rate limiting** per origin
- **Connection state persistence**
- **Approval workflow integration**

**Usage**:
```typescript
const connectionService = getConnectionService();

// Check if dApp is connected
const hasPermission = await connectionService.hasPermission('https://dapp.com');

// Connect dApp (triggers user approval)
const accounts = await connectionService.connect(
  'https://dapp.com',
  '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
  'wallet-123'
);

// Disconnect dApp
await connectionService.disconnect('https://dapp.com');
```

### ApprovalService (`approval/ApprovalService.ts`)

**Purpose**: User approval workflow management for all extension operations requiring consent.

```typescript
export class ApprovalService extends BaseService {
  async requestApproval<T>(options: ApprovalRequestOptions): Promise<T>;
  resolveApproval(id: string, result: ApprovalResult): boolean;
  async getApprovalQueue(): Promise<ApprovalRequest[]>;
  async removeApprovalRequest(id: string): Promise<boolean>;
}
```

**Approval Types**:
- **Connection requests** - dApp wants to connect to wallet
- **Transaction signing** - User must approve transaction
- **Message signing** - Authentication message approval
- **Transaction composition** - DEX orders, sends, etc.

**Usage**:
```typescript
const approvalService = getApprovalService();

// Request user approval for transaction
const result = await approvalService.requestApproval({
  type: 'transaction',
  origin: 'https://dapp.com',
  metadata: {
    domain: 'dapp.com',
    title: 'Sign Transaction',
    description: 'Send 1.0 XCP to address',
    rawTransaction: '0x123456...',
    fee: 2000,
  },
});

if (result.approved) {
  // User approved - proceed with signing
  const signedTx = result.signedTransaction;
}
```

### TransactionService (`transaction/TransactionService.ts`)

**Purpose**: Comprehensive transaction operations including composition, signing, and broadcasting.

```typescript
export class TransactionService extends BaseService {
  // Transaction Composition
  async composeSend(origin: string, params: SendOptions): Promise<TransactionComposition>;
  async composeOrder(origin: string, params: OrderOptions): Promise<TransactionComposition>;
  async composeDispenser(origin: string, params: DispenserOptions): Promise<TransactionComposition>;
  async composeDividend(origin: string, params: DividendOptions): Promise<TransactionComposition>;
  async composeIssuance(origin: string, params: IssuanceOptions): Promise<TransactionComposition>;
  
  // Transaction Signing
  async signTransaction(origin: string, rawTx: string, address?: string): Promise<SignedTransactionResult>;
  async signMessage(origin: string, message: string, address: string): Promise<string>;
  
  // Transaction Broadcasting
  async broadcastTransaction(origin: string, signedTx: string): Promise<TransactionBroadcastResult>;
  
  // History and Analytics
  getTransactionHistory(origin?: string, limit?: number): TransactionHistoryEntry[];
  getTransactionStats(): TransactionStats;
  clearTransactionCache(pattern?: string): void;
}
```

**Key Features**:
- **All Counterparty transaction types** (Send, Order, Dispenser, Dividend, Issuance)
- **User approval integration** for sensitive operations
- **Intelligent caching** with TTL management
- **Replay prevention** for broadcast operations
- **Performance tracking** and statistics
- **Rate limiting** per origin

**Usage**:
```typescript
const transactionService = getTransactionService();

// Compose a send transaction
const composition = await transactionService.composeSend('https://dapp.com', {
  destination: '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2',
  asset: 'XCP',
  quantity: 100000000, // 1.0 XCP
  memo: 'Hello World',
  fee_rate: 2,
});

// Sign transaction (requires user approval)
const signResult = await transactionService.signTransaction(
  'https://dapp.com',
  composition.rawtransaction
);

// Broadcast transaction
const broadcastResult = await transactionService.broadcastTransaction(
  'https://dapp.com',
  signResult.signedTransaction
);
```

### BlockchainService (`blockchain/BlockchainService.ts`)

**Purpose**: Consolidated blockchain operations and API integration for Bitcoin and Counterparty.

```typescript
export class BlockchainService extends BaseService {
  // Bitcoin Operations
  async fetchBTCBalance(address: string): Promise<number>;
  async fetchUTXOs(address: string): Promise<UTXO[]>;
  async getCurrentBlockHeight(): Promise<number>;
  async estimateFeeRate(targetBlocks: number): Promise<number>;
  async broadcastTransaction(rawTx: string): Promise<BroadcastResult>;
  
  // Counterparty Operations
  async fetchTokenBalances(address: string, options?: BalanceOptions): Promise<TokenBalance[]>;
  async fetchTransactions(address: string, options?: TransactionOptions): Promise<Transaction[]>;
  async fetchOrders(address: string, options?: OrderOptions): Promise<Order[]>;
  async fetchAssetInfo(asset: string): Promise<AssetInfo>;
  
  // Transaction Composition
  async composeSend(params: SendOptions): Promise<TransactionComposition>;
  async composeOrder(params: OrderOptions): Promise<TransactionComposition>;
  async composeDispenser(params: DispenserOptions): Promise<TransactionComposition>;
  async composeDividend(params: DividendOptions): Promise<TransactionComposition>;
  async composeIssuance(params: IssuanceOptions): Promise<TransactionComposition>;
}
```

**Key Features**:
- **Multi-layer caching** with different TTLs by data type
- **Circuit breaker pattern** for API resilience
- **Retry logic** with exponential backoff
- **Performance metrics** tracking
- **Health monitoring** of external APIs

## Legacy Services

### ProviderService (`providerService.ts`)

**Purpose**: Main dApp interface implementing EIP-1193-like provider API.

**Status**: 🔄 **Being Refactored** - Currently delegates some operations to new focused services.

```typescript
interface ProviderService {
  handleRequest(origin: string, method: string, params?: any[], metadata?: any): Promise<any>;
  isConnected(origin: string): Promise<boolean>;
  disconnect(origin: string): Promise<void>;
  getApprovalQueue(): Promise<ApprovalRequest[]>;
  removeApprovalRequest(id: string): Promise<boolean>;
  getRequestStats(): Promise<any>;
  destroy(): Promise<void>;
}
```

**Supported Methods**:
- `xcp_requestAccounts` - Connect to wallet
- `xcp_accounts` - Get connected accounts
- `xcp_chainId` / `xcp_getNetwork` - Network info
- `xcp_signMessage` - Sign authentication messages
- `xcp_getBalances` - Get BTC/XCP balances
- `xcp_compose*` - Transaction composition (Send, Order, Dispenser, Dividend, Issuance)
- `xcp_signTransaction` - Sign composed transactions
- `xcp_broadcastTransaction` - Broadcast signed transactions

### WalletService (`walletService.ts`)

**Purpose**: Core wallet and cryptographic operations.

```typescript
interface WalletService {
  // Wallet Management
  createWallet(params: CreateWalletParams): Promise<Wallet>;
  importWallet(params: ImportWalletParams): Promise<Wallet>;
  getWallets(): Promise<Wallet[]>;
  switchWallet(walletId: string): Promise<void>;
  
  // Authentication
  unlockWallet(password: string): Promise<boolean>;
  lockWallet(): Promise<void>;
  isAnyWalletUnlocked(): Promise<boolean>;
  
  // Address Management
  addAddress(walletId: string): Promise<Address>;
  getAddresses(walletId: string): Promise<Address[]>;
  switchAddress(addressId: string): Promise<void>;
  
  // Signing Operations
  signTransaction(rawTx: string, address?: string): Promise<SignedTransactionResult>;
  signMessage(message: string, address?: string): Promise<MessageSignatureResult>;
}
```

### EventEmitterService (`eventEmitterService.ts`)

**Purpose**: Cross-context event communication and coordination.

```typescript
class EventEmitterService extends BaseService {
  emit(event: string, data?: any): void;
  on(event: string, handler: Function): void;
  off(event: string, handler: Function): void;
  emitProviderEvent(origin: string, event: string, data?: any): void;
  emitProviderEvent(event: string, data?: any): void;
}
```

## Service Integration and Usage

### Service Registration

Services are registered in the background script with proper dependency injection:

```typescript
// entrypoints/background.ts
export default defineBackground(() => {
  const serviceRegistry = ServiceRegistry.getInstance();
  
  // Initialize core services
  serviceRegistry.register(eventEmitterService)
    .then(() => console.log('Core services initialized'))
    .catch(console.error);
  
  // Register proxy services
  registerWalletService();
  registerProviderService();
  registerBlockchainService();
  registerConnectionService();
  registerApprovalService();
  registerTransactionService();
  
  // Cleanup on service worker termination
  chrome.runtime.onSuspend.addListener(() => {
    serviceRegistry.destroyAll().catch(console.error);
  });
});
```

### Service Dependencies

Services follow a clear dependency hierarchy:

```
BlockchainService (foundational)
    ↓
ConnectionService → ApprovalService → TransactionService
    ↓                    ↓                 ↓
EventEmitterService ← ProviderService ← WalletService
```

### Cross-Context Communication

Services use proxy pattern for popup/content script access:

```typescript
// In popup components
import { getConnectionService } from '@/services/connection';
import { getTransactionService } from '@/services/transaction';

export function DAppConnection() {
  const handleConnect = async () => {
    const connectionService = getConnectionService();
    const accounts = await connectionService.connect(
      'https://dapp.com',
      selectedAddress,
      walletId
    );
  };
  
  const handleSendTransaction = async () => {
    const transactionService = getTransactionService();
    const composition = await transactionService.composeSend('https://dapp.com', {
      destination: recipientAddress,
      asset: 'XCP',
      quantity: amount,
    });
  };
}
```

## Testing

All services include comprehensive unit tests using Vitest:

```typescript
// Example test structure
describe('TransactionService', () => {
  let transactionService: TransactionService;
  
  beforeEach(async () => {
    // Mock dependencies
    const mockConnectionService = createMockConnectionService();
    const mockApprovalService = createMockApprovalService();
    const mockBlockchainService = createMockBlockchainService();
    
    transactionService = new TransactionService(
      mockConnectionService,
      mockApprovalService,
      mockBlockchainService
    );
    
    await transactionService.initialize();
  });
  
  it('should compose send transaction with permission check', async () => {
    mockConnectionService.hasPermission.mockResolvedValue(true);
    mockBlockchainService.composeSend.mockResolvedValue(mockComposition);
    
    const result = await transactionService.composeSend('https://dapp.com', sendParams);
    
    expect(result).toEqual(mockComposition);
    expect(mockConnectionService.hasPermission).toHaveBeenCalledWith('https://dapp.com');
  });
});
```

### Running Tests

```bash
# Run specific service tests
npx vitest src/services/connection/__tests__/ConnectionService.test.ts
npx vitest src/services/approval/__tests__/ApprovalService.test.ts
npx vitest src/services/transaction/__tests__/TransactionService.test.ts
npx vitest src/services/blockchain/__tests__/BlockchainService.unit.test.ts
npx vitest src/services/core/__tests__/BaseService.test.ts

# Run all service tests
npx vitest src/services/
```

## Performance and Monitoring

### Health Monitoring

All services provide health status:

```typescript
const health = await service.getHealth();
// Returns:
// {
//   status: 'healthy' | 'degraded' | 'unhealthy',
//   message: 'Service is operating normally',
//   metrics: {
//     uptime: 123456,
//     cacheSize: 42,
//     // ... service-specific metrics
//   }
// }
```

### System Health Dashboard

```typescript
const serviceRegistry = ServiceRegistry.getInstance();
const systemHealth = await serviceRegistry.getSystemHealth();
// Returns health status for all registered services
```

### Caching Strategy

Services implement intelligent caching with different TTLs:

- **Asset Info**: 1 hour (static data)
- **Block Height**: 10 minutes (slow-changing)
- **BTC Balance**: 30 seconds (frequent updates)
- **Transaction Composition**: 5 minutes (user workflow)

### Performance Metrics

Services track key performance indicators:

```typescript
const transactionService = getTransactionService();
const stats = transactionService.getTransactionStats();
// Returns:
// {
//   totalOperations: 1234,
//   successRate: 0.98,
//   cacheHitRate: 0.85,
//   averageCompositionTime: 450,
//   pendingSignatures: 2,
//   historyEntries: 100,
//   cacheEntries: 25
// }
```

## Security Features

### Rate Limiting

All services implement per-origin rate limiting:

- **Connection requests**: 5 per minute
- **Transaction operations**: 10 per minute  
- **API requests**: 60 per minute

### Permission Validation

Every operation validates origin permissions:

```typescript
// Before any operation
if (!await connectionService.hasPermission(origin)) {
  throw new Error('Unauthorized - not connected to wallet');
}
```

### Replay Prevention

Transaction broadcasting includes replay protection:

```typescript
// Automatically prevents duplicate transactions
const result = await transactionService.broadcastTransaction(origin, signedTx);
// Second identical broadcast throws: "Duplicate transaction detected"
```

### User Approval Integration

Sensitive operations require explicit user consent:

```typescript
// Automatically triggers approval UI
const result = await transactionService.signTransaction(origin, rawTx);
// User must approve in popup before signing occurs
```

## Migration and Future Plans

### Current Status
- ✅ **Core infrastructure** implemented and tested
- ✅ **Domain services** implemented and tested  
- ✅ **Service registration** complete
- 🔄 **ProviderService refactoring** in progress
- ⏳ **Full integration testing** pending

### Planned Improvements
- **Multi-signature support** for enterprise wallets
- **Batch transaction processing** for efficiency
- **Advanced analytics** and reporting
- **Custom fee estimation** algorithms
- **Enhanced security scanning** for transactions
- **Service mesh monitoring** for production debugging

This architecture provides a solid foundation for the XCP Wallet extension with clear separation of concerns, comprehensive testing, and robust error handling.