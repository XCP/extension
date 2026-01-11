# Layer 1: Storage - Deep Analysis

> **Last Updated**: January 2026
> **Status**: Review Complete
> **Scope**: All storage modules, isolation boundaries, security analysis

This document provides a comprehensive analysis of Layer 1: Storage in the XCP Wallet extension.

---

## Table of Contents

1. [Overview](#overview)
2. [Storage Architecture](#storage-architecture)
3. [Storage Key Map](#storage-key-map)
4. [Consumer Analysis](#consumer-analysis)
5. [Isolation Analysis](#isolation-analysis)
6. [Security Analysis](#security-analysis)
7. [Pattern Consistency Review](#pattern-consistency-review)
8. [Issues & Recommendations](#issues--recommendations)

---

## Overview

The storage layer provides persistence for the wallet extension. It's designed around three distinct consumer domains:

| Domain | Data | Storage Type | Sensitivity |
|--------|------|--------------|-------------|
| **Wallet** | Encrypted mnemonics, private keys | Local | CRITICAL |
| **Settings** | User preferences, connected sites | Local (encrypted) | HIGH |
| **Requests** | Pending dApp approval requests | Session | LOW |

**Design Decision**: Uses `chrome.storage.local` instead of IndexedDB because:
- Wallet data is small (encrypted strings)
- No need for complex queries
- Simpler API, fewer failure modes
- 5MB quota is sufficient for wallet use case

---

## Storage Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                      STORAGE ARCHITECTURE                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  LOCAL STORAGE (chrome.storage.local)                               │
│  ════════════════════════════════════                               │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  local:appRecords (via wxt storage.defineItem)              │   │
│  │  ┌───────────────────────┐ ┌───────────────────────────┐   │   │
│  │  │  Wallet Records       │ │  Settings Record          │   │   │
│  │  │  type: 'mnemonic' |   │ │  id: 'keychain-settings'  │   │   │
│  │  │        'privateKey'   │ │  encryptedSettings: ...   │   │   │
│  │  │  id: SHA-256(pubkey)  │ │                           │   │   │
│  │  │  encryptedSecret: ... │ │                           │   │   │
│  │  └───────────────────────┘ └───────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  ┌────────────────────────┐  ┌────────────────────────┐            │
│  │  settingsEncryptionSalt│  │  update_service_state  │            │
│  │  (PBKDF2 salt)         │  │  (update availability) │            │
│  └────────────────────────┘  └────────────────────────┘            │
│                                                                      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  SESSION STORAGE (chrome.storage.session)                           │
│  ═════════════════════════════════════════                          │
│  Cleared on browser close - not persisted to disk                   │
│                                                                      │
│  ┌────────────────────────┐  ┌────────────────────────┐            │
│  │  settingsEncryptionKey │  │  sessionMetadata       │            │
│  │  (SENSITIVE: AES key)  │  │  (unlock time, timeout)│            │
│  └────────────────────────┘  └────────────────────────┘            │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Request Storage (pending dApp approvals)                    │   │
│  │  ┌───────────────────┐┌───────────────────┐┌──────────────┐ │   │
│  │  │pending_sign_      ││pending_sign_      ││pending_sign_ │ │   │
│  │  │message_requests   ││transaction_reqs   ││psbt_requests │ │   │
│  │  └───────────────────┘└───────────────────┘└──────────────┘ │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  ┌────────────────────────┐                                         │
│  │  ${serviceName}_state  │  (per-service state persistence)       │
│  └────────────────────────┘                                         │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Storage Key Map

### Local Storage Keys

| Key | Module | Purpose | Write Lock |
|-----|--------|---------|------------|
| `local:appRecords` | storage.ts | Wallet + Settings records | YES |
| `settingsEncryptionSalt` | keyStorage.ts | PBKDF2 salt for settings | YES |
| `update_service_state` | updateStorage.ts | Update availability | NO |
| `${service}-keepalive` | serviceStateStorage.ts | Keep-alive ping (read only) | N/A |

### Session Storage Keys

| Key | Module | Purpose | Write Lock |
|-----|--------|---------|------------|
| `settingsEncryptionKey` | keyStorage.ts | AES key for settings | NO |
| `sessionMetadata` | sessionMetadataStorage.ts | Session timing | NO |
| `pending_sign_message_requests` | signMessageRequestStorage.ts | dApp requests | YES |
| `pending_sign_transaction_requests` | signTransactionRequestStorage.ts | dApp requests | YES |
| `pending_sign_psbt_requests` | signPsbtRequestStorage.ts | dApp requests | YES |
| `${serviceName}_state` | serviceStateStorage.ts | Service state | NO |

---

## Consumer Analysis

### Who Imports What

```
walletStorage.ts
└── Imported by: walletManager.ts (ONLY)
    └── Used for: Wallet CRUD operations

settingsStorage.ts
└── Imported by:
    ├── walletManager.ts (settings sync)
    ├── walletService.ts (active wallet)
    ├── connectionService.ts (connected sites)
    ├── contexts/settings-context.tsx (UI state)
    ├── Various UI components (read only)
    └── Blockchain utilities (API URL, feature flags)

requestStorage.ts (via specific storages)
└── Imported by:
    ├── providerService.ts (create requests)
    ├── useSign*Request.ts hooks (read/cleanup)
    └── popupMonitorService.ts (cleanup on close)

storage.ts (base layer)
└── Imported by: walletStorage.ts, settingsStorage.ts ONLY
    └── NOT directly accessible to other code
```

### Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                        DATA FLOW                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  WALLET DOMAIN                                                   │
│  ─────────────                                                   │
│  walletManager.ts                                                │
│       │                                                          │
│       ▼                                                          │
│  walletStorage.ts ──► storage.ts ──► chrome.storage.local       │
│       │                   │                                      │
│       │              (via wxt)                                   │
│       │                                                          │
│  SETTINGS DOMAIN                                                 │
│  ───────────────                                                 │
│  settings-context.tsx                                            │
│       │                                                          │
│       ▼                                                          │
│  settingsStorage.ts ──► storage.ts ──► chrome.storage.local     │
│       │                                                          │
│       ▼                                                          │
│  encryption/settings.ts ──► keyStorage.ts                        │
│                                  │                               │
│                                  ├──► chrome.storage.local (salt)│
│                                  └──► chrome.storage.session(key)│
│                                                                  │
│  REQUEST DOMAIN                                                  │
│  ──────────────                                                  │
│  providerService.ts                                              │
│       │                                                          │
│       ▼                                                          │
│  sign*RequestStorage.ts ──► requestStorage.ts                    │
│       │                          │                               │
│       ▼                          ▼                               │
│  useSign*Request.ts         chrome.storage.session               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Isolation Analysis

### Physical Isolation

| Domain A | Domain B | Isolation | Assessment |
|----------|----------|-----------|------------|
| Wallet | Requests | LOCAL vs SESSION | **STRONG** - Different storage APIs |
| Settings | Requests | LOCAL vs SESSION | **STRONG** - Different storage APIs |
| Wallet | Settings | Same array | **MODERATE** - Same `local:appRecords` |

### Logical Isolation (Wallet ↔ Settings)

Wallet and Settings share the same `local:appRecords` array, differentiated by:

| Data | Identifier |
|------|-----------|
| Wallet records | `type === 'mnemonic' \|\| 'privateKey'` |
| Settings record | `id === 'keychain-settings'` |

**Mitigations in place:**
1. Only `walletStorage.ts` and `settingsStorage.ts` import from `storage.ts`
2. External code uses typed wrappers with proper filtering
3. Wallet IDs are SHA-256 hashes of public keys (unpredictable)

**Risk**: If code imports directly from `storage.ts` and calls `getAllRecords()`, it would get both wallet and settings data.

**Current Status**: ✅ SAFE - No external code imports `storage.ts`

### Session Storage Co-location Risk

Both sensitive key material and dApp requests live in session storage:

| Key | Content | Risk if Leaked |
|-----|---------|----------------|
| `settingsEncryptionKey` | AES key | Could decrypt settings |
| `pending_sign_*_requests` | dApp data | Low (just message/tx data) |

**Why this is acceptable:**
1. Request storage code ONLY accesses its specific key
2. No API to enumerate all session storage keys
3. Session storage is per-extension isolated

---

## Security Analysis

### Critical Question: Can Requests Access Secrets?

**Threat Model**: Malicious dApp tries to access wallet secrets via request manipulation.

**Comprehensive Security Review**: January 2026 - **NO CRITICAL VULNERABILITIES FOUND**

**Attack Vectors Analyzed:**

| Vector | Assessment |
|--------|------------|
| Request code reading wallet data | **BLOCKED** - Different storage APIs |
| Request ID collision/prediction | **LOW RISK** - IDs are `sign-*-${Date.now()}`, dApps can't write to storage |
| Request manipulating storage keys | **BLOCKED** - dApps only call provider API |
| Leaked encryption key in request | **BLOCKED** - Keys never flow through request path |
| Origin spoofing | **BLOCKED** - Origin captured in content script context |
| Direct private key request | **BLOCKED** - No method exposes keys |
| Session hijacking | **PROTECTED** - Auto-lock on inactivity |
| Timing attacks on password | **PROTECTED** - Random delays mask timing |

### Malicious Provider Request Flow Security

**Request Flow Chain:**
```
Malicious Website
    ↓ window.postMessage (isolated)
Content Script (origin captured here - cannot be spoofed)
    ↓ chrome.runtime.sendMessage
Background Service Worker
    ↓ Validation: rate limiting, param size, permissions
ProviderService.handleRequest()
    ↓ Only request ID sent to popup
Popup (user approval required)
    ↓ Private key accessed ONLY after password auth
Signing happens locally
    ↓
Signature returned (never keys)
```

**Key Security Properties:**
1. **Private keys NEVER transmitted** over message passing
2. **Origin validation** in content script (cannot be spoofed by page)
3. **User approval required** before any signing operation
4. **Encryption required** before wallet unlock
5. **TTL-based cleanup** prevents request queue attacks
6. **Rate limiting** prevents DOS and brute force

### Request ID Generation

```typescript
// providerService.ts
const signMessageRequestId = `sign-message-${Date.now()}`;
```

**Assessment**: Uses `Date.now()` - not cryptographically random, but:
- dApps cannot write to session storage
- Request IDs are internal to extension
- No security benefit from random IDs in this context

### Wallet ID Generation

```typescript
// walletManager.ts
private async generateWalletId(mnemonic, addressFormat): Promise<string> {
  // SHA-256 hash of public key + address format
}
```

**Assessment**: ✅ Strong - requires knowledge of private key material

---

## Pattern Consistency Review

### API Patterns by Module

| Module | Pattern | Get | Set/Add | Update | Remove | Clear |
|--------|---------|-----|---------|--------|--------|-------|
| storage.ts | Functions | `getAll*`, `getById` | `add*` | `update*` | `remove*` | `clearAll*` |
| walletStorage.ts | Functions | `getAll*` | `add*` | `update*` | `remove*` | - |
| settingsStorage.ts | Functions | `get*` | - | `update*` | - | - |
| keyStorage.ts | Functions | `get*` | `set*` | - | - | `clear*` |
| sessionMetadataStorage.ts | Functions | `get*` | `set*` | - | - | `clear*` |
| serviceStateStorage.ts | Functions | `get*` | `set*` | - | - | - |
| updateStorage.ts | Functions | `get*` | `set*` | - | - | `clear*` |
| requestStorage.ts | **Class** | `get`, `getAll` | `store` | - | `remove` | `clear` |

### Inconsistencies Identified and Decisions (ADR-010)

#### 1. Function vs Class Pattern - DECISION: Keep Both

```
Most modules:  export async function get*()
RequestStorage: export class RequestStorage { store(), get() }
```

**Decision**: Keep the class pattern for RequestStorage. The class is justified because:
- Generic type support (`T extends BaseRequest`) allows type-safe request storage
- Write lock is per-instance (each storage type has its own lock)
- TTL management logic is encapsulated
- Related functionality (store, get, remove, clear) grouped together

Functions are appropriate for simple key-value storage where you just need get/set/clear.

#### 2. Naming: add vs set vs store - DECISION: Document Convention

```
storage.ts:      addRecord()     - Adding to a collection (array)
settingsStorage: updateSettings() - Upsert (update or insert)
keyStorage:      setSettingsSalt() - Single value set
requestStorage:  store()          - Complex storage with TTL/cleanup
```

**Convention:**
- `get` / `set` - For single-item key-value storage
- `add` / `remove` - For array/collection operations
- `update` - For upsert operations (update existing or create)
- `store` - For complex storage with side effects (TTL cleanup)
- `clear` - For removing all data

**Assessment**: Current naming follows semantic meaning. No change needed.

#### 3. Write Lock Coverage - DECISION: Not Needed for Single Values

| Module | Has Write Lock | Reason |
|--------|---------------|--------|
| storage.ts | YES | Concurrent wallet operations (array) |
| keyStorage.ts | YES (salt only) | Race condition on first creation |
| requestStorage.ts | YES | Concurrent request operations (array) |
| sessionMetadataStorage.ts | NO | Single value, atomic, last-write-wins |
| serviceStateStorage.ts | NO | Per-service isolation, single writer |
| updateStorage.ts | NO | Single value, atomic, last-write-wins |

**Decision**: Write locks are only needed for array/collection storage where concurrent modifications could cause data loss. Single-value stores are atomic - the last write wins, which is acceptable for these use cases.

#### 4. Error Handling Patterns - CONSISTENT (ADR-008)

| Module | On Get Error | On Set Error |
|--------|-------------|--------------|
| storage.ts | Return [] | Throw |
| keyStorage.ts | Return null | Throw |
| sessionMetadataStorage.ts | Return null | Throw |
| updateStorage.ts | Return null | Throw |
| requestStorage.ts | Return [] | Throw |

**Pattern**: Get operations swallow errors (return default), Set operations throw
**Assessment**: ✅ CONSISTENT and INTENTIONAL (documented in ADR-008)

---

## Issues & Recommendations

### Critical Issues

None identified. The storage layer has good isolation between domains.

### High Priority - Resolved

| Issue | Status | Resolution |
|-------|--------|------------|
| Malicious provider vulnerability | ✅ REVIEWED | Comprehensive security audit found no vulnerabilities |
| Wallet+Settings in same array | ⚠️ ACCEPTABLE | Current logical isolation is working, separation not urgent |

**Analysis of separating wallet and settings:**

Current:
```
local:appRecords = [
  { id: 'wallet-123', type: 'mnemonic', encryptedSecret: '...' },
  { id: 'keychain-settings', encryptedSettings: '...' }
]
```

Alternative:
```
local:walletRecords = [{ id: 'wallet-123', ... }]
local:settingsRecord = { encryptedSettings: '...' }
```

**Trade-offs:**
- Pro: Stronger isolation
- Pro: Clearer data model
- Con: Migration required
- Con: More storage keys to manage
- Con: Current isolation is working

**Verdict**: Current isolation is secure. No external code imports `storage.ts`. Document as future improvement if data model grows.

### Medium Priority - Resolved

| Issue | Status | Resolution |
|-------|--------|------------|
| Inconsistent API patterns | ✅ DOCUMENTED | ADR-010 documents naming conventions |
| RequestStorage is class-based | ✅ JUSTIFIED | Class pattern appropriate for complex storage with TTL/generics |
| Some modules lack write locks | ✅ EVALUATED | Single-value stores don't need locks (ADR-010) |
| Storage abstraction consistency | ✅ EVALUATED | Different patterns justified by use case |

**Storage Pattern Decision (ADR-010):**
- `keyStorage.ts`, `updateStorage.ts` - Migrated to wxt ✅
- `sessionMetadataStorage.ts`, `serviceStateStorage.ts` - Raw chrome.storage (acceptable)
- `requestStorage.ts` - Raw chrome.storage with TTL (wxt doesn't support TTL)

### Low Priority

| Issue | Status | Recommendation |
|-------|--------|----------------|
| Request IDs use Date.now() | ⚠️ ACCEPTABLE | No security benefit from random IDs (internal only) |
| Storage key naming inconsistent | 📋 OPTIONAL | Create constants file for all keys (nice-to-have) |

---

## Storage Key Constants (Proposed)

```typescript
// src/utils/storage/keys.ts

export const STORAGE_KEYS = {
  // Local Storage
  LOCAL: {
    APP_RECORDS: 'local:appRecords',
    SETTINGS_SALT: 'settingsEncryptionSalt',
    UPDATE_STATE: 'update_service_state',
  },

  // Session Storage
  SESSION: {
    SETTINGS_KEY: 'settingsEncryptionKey',
    SESSION_METADATA: 'sessionMetadata',
    SIGN_MESSAGE_REQUESTS: 'pending_sign_message_requests',
    SIGN_TX_REQUESTS: 'pending_sign_transaction_requests',
    SIGN_PSBT_REQUESTS: 'pending_sign_psbt_requests',
    serviceState: (name: string) => `${name}_state`,
  },

  // Record IDs
  RECORD_IDS: {
    SETTINGS: 'keychain-settings',
  },
} as const;
```

---

## Quick Reference

### Consumer → Storage Mapping

| Consumer | Allowed Storage Access |
|----------|----------------------|
| walletManager.ts | walletStorage, settingsStorage |
| settings-context.tsx | settingsStorage (via service) |
| providerService.ts | requestStorage, settingsStorage (read) |
| useSign*Request.ts | requestStorage (read, cleanup) |
| connectionService.ts | settingsStorage |
| Blockchain utilities | settingsStorage (read only) |

### Storage → Consumer Mapping

| Storage Module | Allowed Consumers |
|----------------|------------------|
| storage.ts | walletStorage, settingsStorage ONLY |
| walletStorage.ts | walletManager.ts |
| settingsStorage.ts | Any (via typed API) |
| requestStorage.ts | providerService, hooks |
| keyStorage.ts | encryption/settings.ts |

---

## Changelog

| Date | Change |
|------|--------|
| 2026-01 | Initial comprehensive analysis |
| 2026-01 | COMPLETED: Malicious provider security audit - no vulnerabilities found |
| 2026-01 | DOCUMENTED: ADR-010 - Storage pattern decisions (class vs function, naming, write locks) |
| 2026-01 | MIGRATED: keyStorage.ts and updateStorage.ts to wxt storage |
| 2026-01 | EVALUATED: Wallet+Settings separation - current isolation acceptable |
| 2026-01 | EVALUATED: RequestStorage class pattern - justified for TTL/generics |
| 2026-01 | EVALUATED: Write lock coverage - single-value stores don't need locks |
