# XCP Wallet Extension - Messaging Architecture

## Overview

The XCP Wallet extension uses a multi-layered messaging architecture to enable communication between different contexts (web pages, content scripts, background service worker, and popup/sidepanel). This document explains the message flows, their purposes, and how we handle Chrome runtime errors.

## Extension Contexts

1. **Injected Script** ([`src/entrypoints/injected.ts`](../src/entrypoints/injected.ts))
   - Runs in the web page context
   - Exposes `window.xcpwallet` provider API
   - Cannot directly access extension APIs

2. **Content Script** ([`src/entrypoints/content.ts`](../src/entrypoints/content.ts))
   - Runs in isolated world with access to DOM
   - Bridge between web page and extension
   - Can access both `window` and Chrome extension APIs

3. **Background Service Worker** ([`src/entrypoints/background.ts`](../src/entrypoints/background.ts))
   - Central hub for all extension logic
   - Handles provider requests, manages wallet state
   - Only context that can access sensitive wallet operations

4. **Popup/Sidepanel** ([`src/entrypoints/popup`](../src/entrypoints/popup), [`src/entrypoints/sidepanel`](../src/entrypoints/sidepanel))
   - User interface for wallet management
   - Communicates with background for all operations

## Message Flow Architecture

### 1. Web3 Provider Flow (DApp → Wallet)

```
Web Page (DApp)
    ↓ window.xcpwallet.request()
Injected Script (injected.ts)
    ↓ window.postMessage()
Content Script (content.ts)
    ↓ MessageBus (webext-bridge)
Background Service Worker (background.ts)
    ↓ ProviderService handles request
    ↓ May show approval UI in popup
    ↓ Returns result
Content Script
    ↓ window.postMessage()
Injected Script
    ↓ Resolves promise
Web Page (DApp) receives result
```

**Purpose**: Allows DApps to interact with the wallet using the standard Web3 provider interface.

**Key Files**:
- [`injected.ts`](../src/entrypoints/injected.ts): Implements EIP-1193 provider interface
- [`content.ts`](../src/entrypoints/content.ts): Relays messages between page and background
- [`providerService.ts`](../src/services/providerService.ts): Handles provider method implementations

### 2. Service Proxy Flow (Popup ↔ Background)

```
Popup/Sidepanel UI
    ↓ getWalletService() / getProviderService()
Proxy Layer (proxy.ts)
    ↓ chrome.runtime.sendMessage()
Background Service Worker
    ↓ Service instance handles request
    ↓ Returns result
Proxy Layer
    ↓ Returns to UI
Popup/Sidepanel UI updates
```

**Purpose**: Allows UI components to call background services as if they were local functions.

**Key Files**:
- [`proxy.ts`](../src/utils/proxy.ts): Custom service proxy implementation (replaced @webext-core/proxy-service for security)
- [`walletService.ts`](../src/services/walletService.ts), [`providerService.ts`](../src/services/providerService.ts): Service definitions
- Services are registered in background, accessed via proxy in UI

### 3. Event Broadcasting Flow (Background → All Contexts)

```
Background Service Worker (event occurs)
    ↓ broadcastToTabs() or MessageBus
Content Scripts (all tabs)
    ↓ window.postMessage()
Injected Scripts
    ↓ EventEmitter
DApps (receive events like 'accountsChanged')
```

**Purpose**: Notifies all connected DApps of wallet state changes.

**Common Events**:
- `accountsChanged`: When user switches accounts
- `disconnect`: When user disconnects from DApp
- `chainChanged`: When network changes

## Messaging Systems

### 1. Native Chrome APIs
**Used by**: [`proxy.ts`](../src/utils/proxy.ts), some utilities in [`browser.ts`](../src/utils/browser.ts)
**Purpose**: Service proxy pattern for popup ↔ background communication
**Why native**: Direct, synchronous-feeling API for service calls

```javascript
// In proxy.ts
chrome.runtime.sendMessage(message, (response) => {
  // Handle response
});
```

### 2. webext-bridge
**Used by**: [`MessageBus.ts`](../src/services/core/MessageBus.ts), content ↔ background messaging
**Purpose**: Type-safe, promise-based messaging with better error handling
**Why webext-bridge**: Handles browser differences, provides better DX

```javascript
// In MessageBus.ts
import { sendMessage, onMessage } from 'webext-bridge/background';
```

### 3. window.postMessage
**Used by**: injected ↔ content script communication
**Purpose**: Only way to communicate between web page and extension contexts
**Why postMessage**: Browser security model requires this for page ↔ extension

```javascript
// In content.ts
window.postMessage({ target: 'xcp-wallet-injected', ... });
```

## Chrome runtime.lastError Handling

### The Problem

Chrome immediately attempts to establish connections when an extension loads or updates. If message listeners aren't registered fast enough, Chrome logs "Unchecked runtime.lastError: Could not establish connection" errors to the console.

### The Solution

We use a multi-layered approach to prevent runtime.lastError warnings:

1. **Background**: First lines of [`defineBackground()`](../src/entrypoints/background.ts) register listeners that immediately check `chrome.runtime.lastError`
2. **Content Script Readiness**: Content scripts send a ready signal on load, background tracks which tabs have active listeners
3. **Content Script**: Main handler in [`content.ts`](../src/entrypoints/content.ts) checks errors before processing
4. **Proxy Service**: [`proxy.ts`](../src/utils/proxy.ts) always checks `lastError` before accessing response and includes retry logic
5. **Browser Utils**: [`browser.ts`](../src/utils/browser.ts) functions gracefully handle missing content scripts

### Key Principles

1. **Always check `chrome.runtime.lastError` FIRST** in any Chrome API callback
2. **Just accessing lastError is enough** - You don't need to handle it, just check it
3. **Don't let error consumers interfere** - Early error checkers should NOT send responses
4. **Each handler checks its own errors** - Every callback should check lastError independently

### Understanding chrome.runtime.lastError

Based on Chrome's documentation:
- **lastError only exists within callback scope** - It's not persistent
- **Chrome checks if you ACCESS it** - Just `if (chrome.runtime.lastError)` prevents warnings
- **The warning is thrown AFTER callback completes** - Doesn't break execution
- **You don't need to respond** - Just accessing the variable is sufficient

### Example Patterns

```javascript
// CORRECT - Check lastError first
chrome.runtime.sendMessage(message, (response) => {
  // Always check lastError first
  if (chrome.runtime.lastError) {
    // Just checking it prevents the warning
    // You can handle it or ignore it based on your needs
    return;
  }
  // Now safe to use response
  processResponse(response);
});

// CORRECT - Early error consumer pattern (for background script)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Just check lastError to consume it
  if (chrome.runtime.lastError) {
    // Error consumed - prevents console spam
  }
  // DON'T send a response here - let actual handlers respond
  return false; // Allow other handlers to process
});

// INCORRECT - Accessing response before checking lastError
chrome.runtime.sendMessage(message, (response) => {
  if (response) { // Can trigger "Unchecked runtime.lastError"
    processResponse(response);
  }
});

// INCORRECT - Early consumer that responds
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (chrome.runtime.lastError) { }
  sendResponse({ received: true }); // BAD - breaks actual handlers
  return false;
});
```

## Service Architecture

### Core Services

1. **WalletService**: Manages wallet operations (create, import, unlock, sign)
2. **ProviderService**: Handles Web3 provider methods
3. **BlockchainService**: Blockchain interactions and data fetching
4. **ConnectionService**: Manages DApp connections
5. **ApprovalService**: Handles user approval flows
6. **TransactionService**: Transaction building and management

### Service Registration Pattern

Services are registered in background and accessed via proxy:

```javascript
// In background.ts
registerWalletService();  // Creates service instance in background

// In popup/content
const walletService = getWalletService();  // Returns proxy to background service
await walletService.getWallets();  // Proxied to background via chrome.runtime.sendMessage
```

## Security Considerations

1. **Sensitive operations ONLY in background**: Private keys, mnemonics never leave background context
2. **Origin validation**: All provider requests include and validate origin
3. **User approval**: Sensitive operations require explicit user approval
4. **Message validation**: All messages are validated for structure and content
5. **Minimal dependencies**: Custom proxy implementation reduces attack surface

## Debugging Tips

1. **Check message flow**: Use console.log at each step to trace message path
2. **Verify listeners are registered**: Check that listeners exist before sending messages
3. **Check for lastError**: Always check `chrome.runtime.lastError` in callbacks
4. **Use development mode logging**: Many components have dev-only logging
5. **Check service worker status**: Ensure background script is running

## Common Issues and Solutions

### "Could not establish connection" / "Unchecked runtime.lastError"
- **Cause**: Chrome tries to message tabs before listeners are ready, or callbacks don't check lastError
- **Solution**:
  - Background script has early error consumer that checks lastError
  - All callbacks check `chrome.runtime.lastError` before using response
  - Just accessing the variable is enough: `if (chrome.runtime.lastError) { }`

### "The message port closed before a response was received"
- **Cause**: Listener didn't send response or didn't return true
- **Solution**: Always send response and return true for async responses

### Service not available in popup
- **Cause**: Service not registered or background not ready
- **Solution**: Ensure services are registered before use

### DApp can't connect
- **Cause**: Content script not injected or message relay broken
- **Solution**: Check content script is loaded and message handlers are set up

### Early error consumer breaks actual handlers
- **Cause**: Error consumer sends a response, preventing real handlers from responding
- **Solution**: Error consumers should ONLY check lastError, not send responses:
  ```javascript
  // Good - just check error
  if (chrome.runtime.lastError) { }
  return false;

  // Bad - sends response that breaks real handlers
  sendResponse({ received: true });
  return false;
  ```