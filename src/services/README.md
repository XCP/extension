# Services

Background-resident, stateful services that power the extension. These run in the service worker context and handle cross-context communication with the popup UI.

## Structure

```
services/
  approvalService.ts      # User consent workflows
  connectionService.ts    # dApp permissions
  eventEmitterService.ts  # Cross-context pub/sub
  popupMonitorService.ts  # Popup lifecycle cleanup
  providerService.ts      # Web3 provider API (main dApp interface)
  updateService.ts        # Extension update coordination
  walletService.ts        # Wallet operations proxy
  core/                   # Infrastructure
    BaseService.ts        # Service base class with lifecycle
    MessageBus.ts         # Message passing abstraction
    RequestManager.ts     # Promise lifecycle management
    ServiceRegistry.ts    # Dependency injection
  __tests__/              # Colocated tests
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│ POPUP (React UI)                                                        │
│   Uses: getXxxService() proxies to call background services             │
└─────────────────────────────────────────────────────────────────────────┘
                                    ▲
                         chrome.runtime.sendMessage
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ BACKGROUND (Service Worker)                                             │
│   Registers services via ServiceRegistry                                │
│   Services extend BaseService for lifecycle management                  │
└─────────────────────────────────────────────────────────────────────────┘
```

## Service Categories

### Core Domain Services

| Service | Purpose |
|---------|---------|
| `providerService` | Web3 provider API - main dApp interface. Handles `xcp_*` methods, compose requests, signing flows. |
| `walletService` | Wallet operations proxy - unlock, lock, sign, broadcast. Thin wrapper over `walletManager`. |
| `ApprovalService` | User consent workflows - manages approval queue, popup orchestration, badge notifications. |
| `ConnectionService` | dApp permissions - connect/disconnect sites, permission caching, security checks. |

### Support Services

| Service | Purpose |
|---------|---------|
| `eventEmitterService` | Cross-context pub/sub - decouples services, enables event-driven approval resolution. |
| `popupMonitorService` | Popup lifecycle - cancels abandoned requests when popup closes unexpectedly. |
| `updateService` | Extension updates - defers `chrome.runtime.reload()` during critical operations. |

### Infrastructure (`core/`)

| Module | Purpose |
|--------|---------|
| `BaseService` | Abstract base - lifecycle (`initialize`/`destroy`), state persistence, keep-alive alarms. |
| `ServiceRegistry` | Dependency injection - validates dependencies, orders initialization, enables health checks. |
| `MessageBus` | Message passing - wraps `webext-bridge` with timeouts, retries, background readiness checks. |
| `RequestManager` | Promise lifecycle - prevents memory leaks from orphaned requests, enforces size limits. |

## Patterns

### Proxy Pattern

Services use `defineProxyService()` for cross-context access:

```typescript
// In service file
export const [registerXxxService, getXxxService] = defineProxyService(
  'XxxService',
  () => new XxxService()
);

// In background.ts
registerXxxService();

// In popup (React component)
const service = getXxxService();
await service.someMethod();
```

### BaseService Lifecycle

Services extending `BaseService` get:
- **State persistence**: Survives service worker restarts via `chrome.storage.session`
- **Keep-alive**: Alarms every 24s prevent Chrome's 30s termination
- **Dependency ordering**: Declare via `getDependencies()`, validated at registration

### Event-Driven Approvals

Approval resolution uses events (not direct promises) because popup and background are different contexts:

```
ProviderService              ApprovalService              Popup
     │                            │                         │
     │ requestApproval()          │                         │
     ├───────────────────────────►│ openPopup()             │
     │                            ├────────────────────────►│
     │                            │                         │ user clicks approve
     │                            │◄────────────────────────┤
     │ eventEmitter.emit()        │                         │
     │◄───────────────────────────┤                         │
     │ promise resolves           │                         │
```

## What Doesn't Belong Here

| Type | Location | Example |
|------|----------|---------|
| API clients (stateless HTTP) | `utils/blockchain/` | `counterparty/api.ts`, `bitcoin/consolidationApi.ts` |
| Storage utilities | `utils/storage/` | `settingsStorage.ts` |
| Pure functions | `utils/` | `format.ts`, `numeric.ts` |
| React hooks | `hooks/` | `useWallet.ts` |

## ADRs (Architecture Decision Records)

Key decisions are documented inline in the code:

- **ADR-004**: No distributed tracing (deferred) - `MessageBus.ts`
- **ADR-006**: Explicit service dependency ordering - `BaseService.ts`
- **ADR-007**: Request callbacks lost on restart (acceptable) - `RequestManager.ts`
- **ADR-008**: Distributed request state (intentional) - `ApprovalService.ts`

## Testing

```bash
# Run service tests
npx vitest run src/services/

# Run with coverage
npx vitest run src/services/ --coverage
```

Test files are colocated: `__tests__/XxxService.test.ts`
