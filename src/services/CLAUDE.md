# Services Directory

This directory contains service classes that manage cross-context communication in the XCP Wallet extension.

## Service Architecture

### Proxy Service Pattern
The extension uses `@webext-core/proxy-service` to enable seamless communication between different extension contexts (popup, background, content script).

```typescript
// Service runs in background
class WalletService {
  async unlockWallet(password: string): Promise<boolean> {
    // Implementation in background context
  }
}

// Proxy allows calling from popup
const walletService = proxyService<WalletService>('WalletService');
await walletService.unlockWallet(password); // Calls background method
```

## Available Services

### walletService.ts

**Purpose**: Core wallet operations and state management
**Context**: Background service worker
**Key Methods**:

```typescript
class WalletService {
  // Authentication
  async createWallet(params: CreateWalletParams): Promise<Wallet>
  async importWallet(params: ImportWalletParams): Promise<Wallet>
  async unlockWallet(password: string): Promise<boolean>
  async lockWallet(): Promise<void>
  
  // Wallet Management
  async getWallets(): Promise<Wallet[]>
  async removeWallet(walletId: string): Promise<void>
  async renameWallet(walletId: string, name: string): Promise<void>
  async switchWallet(walletId: string): Promise<void>
  
  // Address Management
  async addAddress(walletId: string): Promise<Address>
  async getAddresses(walletId: string): Promise<Address[]>
  async switchAddress(addressId: string): Promise<void>
  
  // Transaction Operations
  async signTransaction(psbt: string): Promise<string>
  async broadcastTransaction(hex: string): Promise<string>
  async signMessage(message: string): Promise<string>
  
  // State Queries
  async getAuthState(): Promise<AuthState>
  async getActiveWallet(): Promise<Wallet | null>
  async getActiveAddress(): Promise<Address | null>
}
```

**Usage from Popup**:
```typescript
import { proxyService } from '@webext-core/proxy-service';
import type { WalletService } from '@/services/walletService';

const walletService = proxyService<WalletService>('WalletService', {
  namespace: 'wallet',
});

// Use in React component
export function WalletComponent() {
  const handleUnlock = async (password: string) => {
    const success = await walletService.unlockWallet(password);
    if (success) {
      // Handle success
    }
  };
}
```

### providerService.ts

**Purpose**: Web3 provider API for dApp integration
**Context**: Background service worker
**Key Methods**:

```typescript
class ProviderService {
  // Connection Management
  async connect(origin: string): Promise<string[]>
  async disconnect(origin: string): Promise<void>
  async isConnected(origin: string): Promise<boolean>
  
  // Account Methods
  async getAccounts(origin: string): Promise<string[]>
  async requestAccounts(origin: string): Promise<string[]>
  
  // Transaction Methods
  async sendTransaction(params: TransactionParams): Promise<string>
  async signTransaction(params: TransactionParams): Promise<string>
  async signMessage(message: string, origin: string): Promise<string>
  
  // Counterparty Methods
  async composeTransaction(type: string, params: any): Promise<ComposedTx>
  async broadcastTransaction(signedTx: string): Promise<string>
  
  // Permission Management
  async requestPermission(origin: string, method: string): Promise<boolean>
  async getPermissions(origin: string): Promise<string[]>
  async revokePermission(origin: string, method: string): Promise<void>
}
```

**Provider API Interface** (EIP-1193-like):
```typescript
interface CounterpartyProvider {
  isConnected(): boolean;
  request(args: RequestArguments): Promise<any>;
  on(event: string, handler: Function): void;
  removeListener(event: string, handler: Function): void;
}

// Injected into web pages as window.counterparty
window.counterparty = {
  request: async ({ method, params }) => {
    return providerService.request(method, params);
  },
  // ... other methods
};
```

## Service Patterns

### Creating a Service

**1. Define Service Class** (runs in background):
```typescript
// services/myService.ts
export class MyService {
  private state: ServiceState = initialState;
  
  async performAction(params: ActionParams): Promise<ActionResult> {
    // Validate params
    if (!this.validateParams(params)) {
      throw new Error('Invalid parameters');
    }
    
    // Perform action
    const result = await this.executeAction(params);
    
    // Update state
    this.state = { ...this.state, lastAction: Date.now() };
    
    // Persist if needed
    await this.persistState();
    
    return result;
  }
  
  private async persistState(): Promise<void> {
    await chrome.storage.local.set({ serviceState: this.state });
  }
}
```

**2. Register in Background**:
```typescript
// entrypoints/background.ts
import { registerService } from '@webext-core/proxy-service';
import { MyService } from '@/services/myService';

const myService = new MyService();
registerService('MyService', myService);
```

**3. Create Proxy for Popup**:
```typescript
// services/myService.proxy.ts
import { proxyService } from '@webext-core/proxy-service';
import type { MyService } from './myService';

export const myService = proxyService<MyService>('MyService');
```

**4. Use in Components**:
```typescript
// components/MyComponent.tsx
import { myService } from '@/services/myService.proxy';

export function MyComponent() {
  const handleAction = async () => {
    try {
      const result = await myService.performAction(params);
      // Handle result
    } catch (error) {
      // Handle error
    }
  };
}
```

### Error Handling

**Service-Level Errors**:
```typescript
export class ServiceWithErrors {
  async riskyOperation(): Promise<Result> {
    try {
      const data = await fetchExternalData();
      return processData(data);
    } catch (error) {
      // Log for debugging
      console.error('Service operation failed:', error);
      
      // Throw user-friendly error
      throw new Error('Operation failed. Please try again.');
    }
  }
}
```

**Consumer-Level Handling**:
```typescript
const handleServiceCall = async () => {
  try {
    const result = await service.riskyOperation();
    setData(result);
  } catch (error) {
    setError(error.message);
    // Show user notification
  }
};
```

### State Synchronization

**Keeping UI in Sync**:
```typescript
// Service emits events
export class StatefulService extends EventEmitter {
  private state: State;
  
  async updateState(newState: Partial<State>): Promise<void> {
    this.state = { ...this.state, ...newState };
    
    // Notify all contexts
    this.emit('stateChanged', this.state);
    
    // Persist
    await this.saveState();
  }
}

// UI subscribes to changes
useEffect(() => {
  const handleStateChange = (newState: State) => {
    setState(newState);
  };
  
  service.on('stateChanged', handleStateChange);
  return () => service.off('stateChanged', handleStateChange);
}, []);
```

## Testing Services

### Unit Testing
```typescript
describe('WalletService', () => {
  let service: WalletService;
  
  beforeEach(() => {
    service = new WalletService();
    // Mock chrome.storage
    global.chrome = {
      storage: {
        local: {
          get: jest.fn(),
          set: jest.fn(),
        },
      },
    };
  });
  
  it('should unlock wallet with correct password', async () => {
    const mockWallet = createMockWallet();
    chrome.storage.local.get.mockResolvedValue({ wallets: [mockWallet] });
    
    const result = await service.unlockWallet('correct-password');
    
    expect(result).toBe(true);
    expect(service.getAuthState()).toBe('unlocked');
  });
});
```

### Integration Testing
```typescript
describe('Service Integration', () => {
  it('should handle cross-service communication', async () => {
    const wallet = await walletService.createWallet(params);
    const provider = await providerService.connect('https://dapp.com');
    
    const accounts = await provider.getAccounts();
    expect(accounts).toContain(wallet.address);
  });
});
```

## Performance Considerations

### Caching
```typescript
export class CachedService {
  private cache = new Map<string, CacheEntry>();
  private readonly CACHE_TTL = 60000; // 1 minute
  
  async getData(key: string): Promise<Data> {
    // Check cache
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.data;
    }
    
    // Fetch fresh data
    const data = await this.fetchData(key);
    
    // Update cache
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
    });
    
    return data;
  }
}
```

### Batching Operations
```typescript
export class BatchedService {
  private queue: Operation[] = [];
  private timer: NodeJS.Timeout | null = null;
  
  async queueOperation(op: Operation): Promise<void> {
    this.queue.push(op);
    
    if (!this.timer) {
      this.timer = setTimeout(() => this.processBatch(), 100);
    }
  }
  
  private async processBatch(): Promise<void> {
    const batch = [...this.queue];
    this.queue = [];
    this.timer = null;
    
    await this.executeBatch(batch);
  }
}
```

## Security Best Practices

### Permission Checking
```typescript
export class SecureService {
  async performRestrictedAction(origin: string, action: string): Promise<void> {
    // Check permission
    if (!await this.hasPermission(origin, action)) {
      throw new Error('Permission denied');
    }
    
    // Log action for audit
    await this.logAction(origin, action);
    
    // Perform action
    return this.executeAction(action);
  }
  
  private async hasPermission(origin: string, action: string): Promise<boolean> {
    const permissions = await this.getPermissions(origin);
    return permissions.includes(action);
  }
}
```

### Input Validation
```typescript
export class ValidatedService {
  async processInput(input: unknown): Promise<Result> {
    // Validate structure
    if (!this.isValidInput(input)) {
      throw new Error('Invalid input format');
    }
    
    // Sanitize data
    const sanitized = this.sanitizeInput(input);
    
    // Process
    return this.process(sanitized);
  }
  
  private isValidInput(input: unknown): input is ValidInput {
    return (
      typeof input === 'object' &&
      input !== null &&
      'requiredField' in input
    );
  }
}
```

## Common Patterns

### Singleton Services
```typescript
class SingletonService {
  private static instance: SingletonService | null = null;
  
  static getInstance(): SingletonService {
    if (!this.instance) {
      this.instance = new SingletonService();
    }
    return this.instance;
  }
  
  private constructor() {
    // Private constructor prevents direct instantiation
  }
}
```

### Service Factory
```typescript
export function createService(config: ServiceConfig): Service {
  switch (config.type) {
    case 'wallet':
      return new WalletService(config);
    case 'provider':
      return new ProviderService(config);
    default:
      throw new Error(`Unknown service type: ${config.type}`);
  }
}
```

## Anti-Patterns to Avoid

1. **Don't store sensitive data in service state** - Use secure storage
2. **Don't skip permission checks** - Always validate access
3. **Don't ignore service boundaries** - Keep services focused
4. **Don't create circular dependencies** - Use events for loose coupling
5. **Don't block the event loop** - Use async operations
6. **Don't expose internal state directly** - Use getter methods