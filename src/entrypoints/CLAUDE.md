# Entrypoints Directory

This directory contains the entry points for different extension contexts in the XCP Wallet browser extension.

## Extension Architecture

### Context Types
Browser extensions run code in isolated contexts:

1. **Background Script** (`background.ts`)
   - Persistent service worker (Manifest V3)
   - Manages wallet operations
   - Handles API requests
   - Maintains extension state

2. **Content Script** (`content.ts`)
   - Injected into web pages
   - Bridge between web pages and extension
   - Limited to specific domains (xcp.io)
   - Isolated from page JavaScript

3. **Injected Script** (`injected.ts`)
   - Runs in page context
   - Provides window.counterparty API
   - Communicates via postMessage

4. **Popup/UI** (React app in src/pages)
   - Extension popup interface
   - Full React application
   - Communicates with background

## Message Passing Architecture

### Communication Flow
```
Web Page <-> Injected Script <-> Content Script <-> Background Script <-> Popup UI
         postMessage          webext-bridge      webext-bridge
```

### Message Types
```typescript
// Provider messages (dApp communication)
interface ProviderMessage {
  type: 'PROVIDER_REQUEST';
  method: string;
  params: any[];
}

// Wallet operations
interface WalletMessage {
  type: 'WALLET_OPERATION';
  operation: 'unlock' | 'lock' | 'sign' | 'broadcast';
  payload: any;
}

// State updates
interface StateMessage {
  type: 'STATE_UPDATE';
  state: 'wallets' | 'settings' | 'session';
  data: any;
}
```

## File Details

### background.ts

**Purpose**: Core extension logic and state management

**Key Responsibilities**:
- Initialize wallet service
- Handle provider API requests
- Manage keep-alive mechanism
- Process cross-context messages

**Critical Code**:
```typescript
// Keep-alive mechanism
const KEEP_ALIVE_INTERVAL = 20000; // 20 seconds
browser.alarms.create('keep-alive', { periodInMinutes: 0.3 });

// Message handling
browser.runtime.onMessage.addListener(async (message, sender) => {
  switch (message.type) {
    case 'WALLET_OPERATION':
      return handleWalletOperation(message);
    case 'PROVIDER_REQUEST':
      return handleProviderRequest(message);
  }
});

// Provider service initialization
import { initializeProviderService } from '@/services/providerService';
initializeProviderService();
```

**Keep-Alive Pattern**:
Service workers in Manifest V3 can be terminated after 30 seconds of inactivity. The keep-alive mechanism prevents this:
```typescript
browser.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'keep-alive') {
    // Perform minimal operation to keep service worker active
    chrome.storage.local.get('ping');
  }
});
```

### content.ts

**Purpose**: Bridge between web pages and extension

**Key Responsibilities**:
- Inject provider script into page
- Relay messages between contexts
- Validate message origins
- Filter allowed domains

**Critical Code**:
```typescript
// Inject provider script
const script = document.createElement('script');
script.src = browser.runtime.getURL('injected.js');
script.onload = () => script.remove();
document.head.appendChild(script);

// Message relay from page to background
window.addEventListener('message', async (event) => {
  // Validate origin
  if (!isAllowedOrigin(event.origin)) return;
  
  // Validate message structure
  if (event.data?.target !== 'xcp-wallet-content') return;
  
  // Forward to background
  const response = await sendMessage('provider-request', event.data.payload);
  
  // Send response back to page
  window.postMessage({
    target: 'xcp-wallet-injected',
    payload: response
  }, event.origin);
});
```

**Domain Restrictions**:
Content script only runs on specified domains:
```json
// manifest.json
"content_scripts": [{
  "matches": ["*://xcp.io/*"],
  "js": ["content.js"]
}]
```

### injected.ts

**Purpose**: Provide window.counterparty API to web pages

**Key Responsibilities**:
- Expose provider API
- Handle dApp requests
- Emit provider events
- Manage connection state

**Critical Code**:
```typescript
// Provider API implementation
window.counterparty = {
  isConnected: () => Boolean(connectedAddress),
  
  request: async ({ method, params }) => {
    return sendToContent({
      type: 'PROVIDER_REQUEST',
      method,
      params
    });
  },
  
  on: (event, handler) => {
    eventEmitter.on(event, handler);
  },
  
  removeListener: (event, handler) => {
    eventEmitter.removeListener(event, handler);
  }
};

// EIP-1193 events
eventEmitter.emit('connect', { chainId: '0x1' });
eventEmitter.emit('accountsChanged', [address]);
eventEmitter.emit('chainChanged', '0x1');
```

## Message Passing Patterns

### Using webext-bridge

**Setup**:
```typescript
import { sendMessage, onMessage } from 'webext-bridge';

// Send message from popup to background
const response = await sendMessage('operation', payload, 'background');

// Listen for messages in background
onMessage('operation', async (message) => {
  return await handleOperation(message.data);
});
```

**Message Flow Examples**:

1. **Popup requests wallet unlock**:
```typescript
// In popup
const result = await sendMessage('unlock-wallet', { password }, 'background');

// In background
onMessage('unlock-wallet', async ({ data }) => {
  return await walletService.unlock(data.password);
});
```

2. **Content script relays provider request**:
```typescript
// In content
window.addEventListener('message', async (event) => {
  const result = await sendMessage('provider-request', event.data, 'background');
  window.postMessage(result, event.origin);
});
```

## Security Considerations

### Origin Validation
Always validate message origins:
```typescript
const ALLOWED_ORIGINS = ['https://xcp.io'];

function isAllowedOrigin(origin: string): boolean {
  return ALLOWED_ORIGINS.includes(origin);
}
```

### Message Sanitization
Validate and sanitize all incoming messages:
```typescript
function validateMessage(message: unknown): message is ValidMessage {
  return (
    typeof message === 'object' &&
    message !== null &&
    'type' in message &&
    'payload' in message
  );
}
```

### Permission Checks
Verify permissions before operations:
```typescript
async function checkPermission(origin: string, method: string): Promise<boolean> {
  const permissions = await getStoredPermissions();
  return permissions[origin]?.includes(method) ?? false;
}
```

## Testing Entrypoints

### Mock Browser APIs
```typescript
// Mock chrome.runtime
global.chrome = {
  runtime: {
    sendMessage: jest.fn(),
    onMessage: {
      addListener: jest.fn()
    }
  }
};
```

### Test Message Handling
```typescript
describe('Background message handler', () => {
  it('should handle wallet operations', async () => {
    const message = { type: 'WALLET_OPERATION', operation: 'unlock' };
    const result = await handleMessage(message);
    expect(result.success).toBe(true);
  });
});
```

## Performance Optimization

### Lazy Loading
Load heavy modules only when needed:
```typescript
// Lazy load wallet service
let walletService: WalletService | null = null;

async function getWalletService(): Promise<WalletService> {
  if (!walletService) {
    const { WalletService } = await import('@/services/walletService');
    walletService = new WalletService();
  }
  return walletService;
}
```

### Message Batching
Batch multiple operations:
```typescript
const messageQueue: Message[] = [];
const BATCH_INTERVAL = 100; // ms

const processBatch = debounce(async () => {
  const batch = [...messageQueue];
  messageQueue.length = 0;
  
  const results = await Promise.all(
    batch.map(msg => processMessage(msg))
  );
  
  batch.forEach((msg, i) => {
    msg.resolve(results[i]);
  });
}, BATCH_INTERVAL);
```

## Common Issues & Solutions

### Service Worker Termination
**Problem**: Service worker stops after 30 seconds
**Solution**: Implement keep-alive with chrome.alarms

### Message Port Closed
**Problem**: "Could not establish connection" errors
**Solution**: Check if target context exists before sending

### Content Script Not Injecting
**Problem**: Script doesn't run on page
**Solution**: Verify manifest permissions and matches

### Cross-Origin Errors
**Problem**: CORS errors when accessing resources
**Solution**: Use web_accessible_resources in manifest

## Debugging Tips

1. **Background Script**: 
   - Chrome: chrome://extensions -> Service Worker
   - Firefox: about:debugging -> Inspect

2. **Content Script**: 
   - Use regular DevTools console
   - Filter by extension context

3. **Message Logging**:
```typescript
// Add debug logging
onMessage('*', (message) => {
  console.log('Received:', message);
});
```

4. **State Inspection**:
```typescript
// Expose state for debugging
(globalThis as any).__wallet_state = walletService.getState();
```