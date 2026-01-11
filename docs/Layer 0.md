# Layer 0: Browser APIs - Deep Analysis

> **Last Updated**: January 2026
> **Status**: Review Complete
> **Scope**: chrome.storage, chrome.runtime, chrome.alarms, crypto.subtle

This document provides a comprehensive analysis of Layer 0 browser API usage in the XCP Wallet extension, identifying patterns, issues, and recommendations.

---

## Table of Contents

1. [Overview](#overview)
2. [chrome.storage](#chromestorage)
3. [chrome.runtime](#chromeruntime)
4. [chrome.alarms](#chromealarms)
5. [crypto.subtle (Web Crypto API)](#cryptosubtle-web-crypto-api)
6. [Missing APIs Analysis](#missing-apis-analysis)
7. [Anti-Patterns & Footguns](#anti-patterns--footguns)
8. [Recommendations](#recommendations)

---

## Overview

Layer 0 represents the browser platform APIs that the wallet extension builds upon. These are the lowest-level primitives and must be used correctly to ensure security, performance, and reliability.

### APIs in Scope

| API | Purpose in Wallet |
|-----|-------------------|
| `chrome.storage.local` | Persistent encrypted data (wallets, settings salt) |
| `chrome.storage.session` | Temporary session keys (cleared on browser close) |
| `chrome.runtime` | Cross-context messaging, lifecycle events |
| `chrome.alarms` | Keep-alive, session expiry timers |
| `crypto.subtle` | Web Crypto API for encryption |

---

## chrome.storage

### Local Storage (`chrome.storage.local`)

Used for data that must persist across browser sessions.

| Location | Usage | Pattern |
|----------|-------|---------|
| `src/utils/storage/storage.ts:58` | Wallet records | wxt `storage.defineItem()` |
| `src/utils/storage/keyStorage.ts:25,40` | Settings salt | Direct API |
| `src/utils/storage/updateStorage.ts:28,45,61` | Update state | Direct API |

### Session Storage (`chrome.storage.session`)

Used for sensitive data that should be cleared when browser closes.

| Location | Usage | Pattern |
|----------|-------|---------|
| `src/utils/storage/keyStorage.ts:54,68,81` | Encryption key cache | Direct API |
| `src/utils/storage/requestStorage.ts:74,106,123,139` | Pending dApp requests | Direct API |
| `src/utils/storage/sessionMetadataStorage.ts` | Session metadata | Direct API |
| `src/utils/storage/serviceStateStorage.ts:29,72` | Service state | Direct API |

### Issues Identified

#### Issue 1: Inconsistent Abstraction Layer

**Severity**: Medium

```
Local Storage:
  - storage.ts uses wxt storage.defineItem() abstraction
  - keyStorage.ts uses raw chrome.storage.local
  - updateStorage.ts uses raw chrome.storage.local

Session Storage:
  - All files use raw chrome.storage.session (no abstraction)
```

**Impact**: Maintenance burden, inconsistent error handling, harder to test.

**Recommendation**: Create unified abstraction for session storage similar to wxt's `storage.defineItem()`.

#### Issue 2: No Quota Monitoring

**Severity**: Low

`chrome.storage.local.QUOTA_BYTES` (5MB limit) is never checked. While wallet data is small, transaction history or cached data could grow.

**Recommendation**: Add quota monitoring that warns when approaching 80% capacity.

```typescript
// Proposed utility
async function getStorageUsage(): Promise<{ used: number; total: number; percentage: number }> {
  const bytesInUse = await chrome.storage.local.getBytesInUse();
  const total = chrome.storage.local.QUOTA_BYTES;
  return {
    used: bytesInUse,
    total,
    percentage: (bytesInUse / total) * 100
  };
}
```

#### Issue 3: Inconsistent Error Handling

**Severity**: Medium

```typescript
// keyStorage.ts - Swallows error, returns null (caller unaware of failure)
} catch (err) {
  console.error('Failed to get settings salt:', err);
  return null;
}

// requestStorage.ts - Throws error (caller must handle)
} catch (err) {
  console.error(`Failed to store ${this.requestName}:`, err);
  throw new Error('Storage operation failed');
}
```

**Recommendation**: Standardize on one pattern. Prefer throwing for critical operations (key storage), returning null for non-critical reads.

---

## chrome.runtime

### Access Patterns

| Pattern | Locations | Assessment |
|---------|-----------|------------|
| `sendMessage()` | proxy.ts, browser.ts, hooks/*.ts, providerService.ts | Good |
| `onMessage.addListener()` | background.ts, proxy.ts, hooks/*.ts | Good |
| `lastError` checking | proxy.ts:172, browser.ts:50,86, background.ts:40,62,76,109 | Excellent |
| `getManifest()` | version.ts:40, updateService.ts:24 | Good |
| `getURL()` | providerService.ts:225,257,435,539,644 | Good |
| `onConnect/onSuspend/onInstalled` | background.ts | Good |

### lastError Handling - Excellent Pattern

The codebase correctly checks `chrome.runtime.lastError` before accessing responses:

```typescript
// proxy.ts:171-173 - Correct pattern
chrome.runtime.sendMessage(message, (response: ProxyResponse) => {
  const error = chrome.runtime.lastError;  // Check FIRST, always
  if (error) {
    // Handle error
  } else {
    // Safe to use response
  }
});
```

**Why this matters**: Chrome logs "Unchecked runtime.lastError" warnings if you access the response before checking lastError. This pattern prevents console spam and ensures errors are properly handled.

### Duplicate Listener Prevention - Good Pattern

```typescript
// proxy.ts:40 - Module-level Set prevents duplicate registration
const registeredServices = new Set<string>();

// proxy.ts:69 - Checks before adding listener
if (registeredServices.has(serviceName)) {
  console.log(`${serviceName} already registered, skipping listener setup`);
  serviceInstance = factory();
  return serviceInstance;  // Return instance without adding duplicate listener
}
```

**Why this matters**: Service workers can restart, re-running initialization code. Without this check, each restart would add another `onMessage` listener, causing duplicate handler invocations.

### Minor Issues

#### Multiple onMessage Listeners in background.ts

Lines 38 and 83 add separate `onMessage` listeners:
- Line 38: Error consumer (catches early connection errors)
- Line 83: Actual message handler

This is intentional but could be consolidated into a single listener with early error checking.

---

## chrome.alarms

### Access Patterns

| Location | Alarm Name(s) | Purpose |
|----------|---------------|---------|
| `src/entrypoints/background.ts:324` | `keep-alive` | Service worker keep-alive |
| `src/entrypoints/background.ts:320` | `session-expiry` | Session timeout (background) |
| `src/services/core/BaseService.ts:103,108` | `${name}-keepalive`, `${name}-persist` | Per-service alarms |
| `src/services/updateService.ts:122` | `update-check` | Update polling |
| `src/utils/auth/sessionManager.ts:238,241` | `session-expiry` | Session timeout |
| `src/utils/wallet/walletManager.ts:421,424` | `session-expiry` | Session timeout |

### Issues Identified

#### Issue: Potential Alarm Name Collision

**Severity**: High

The `session-expiry` alarm is created in **three different places**:
1. `background.ts`
2. `sessionManager.ts`
3. `walletManager.ts`

If these overwrite each other's alarms, session timeout behavior becomes unpredictable.

**Recommendation**:
1. Centralize alarm name constants
2. Designate single owner for each alarm
3. Add namespace prefix to prevent collisions

```typescript
// Proposed: src/constants/alarms.ts
export const ALARM_NAMES = {
  KEEP_ALIVE: 'xcp:keep-alive',
  SESSION_EXPIRY: 'xcp:session-expiry',
  UPDATE_CHECK: 'xcp:update-check',
  // Per-service pattern
  serviceKeepAlive: (name: string) => `xcp:${name}:keepalive`,
  servicePersist: (name: string) => `xcp:${name}:persist`,
} as const;
```

### Good Pattern: O(1) Alarm Dispatch

```typescript
// BaseService.ts:51-62 - Static Map for efficient dispatch
private static alarmHandlers = new Map<string, () => Promise<void>>();
private static listenerRegistered = false;

private static ensureAlarmListener(): void {
  if (this.listenerRegistered) return;

  chrome.alarms.onAlarm.addListener((alarm) => {
    const handler = BaseService.alarmHandlers.get(alarm.name);  // O(1) lookup
    handler?.();
  });
  this.listenerRegistered = true;
}
```

**Why this is good**: Instead of each service adding its own `onAlarm` listener (O(n) listeners), this pattern uses a single shared listener with a Map for O(1) dispatch. This prevents listener accumulation as services are created.

---

## crypto.subtle (Web Crypto API)

### Access Patterns

| File | Operations | Purpose |
|------|------------|---------|
| `src/utils/encryption/encryption.ts` | importKey, deriveBits, deriveKey, encrypt, decrypt, sign, verify | Wallet encryption |
| `src/utils/encryption/settings.ts` | importKey, deriveKey, exportKey, encrypt, decrypt | Settings encryption |
| `src/utils/security/replayPrevention.ts:167` | digest('SHA-256') | Idempotency key hashing |
| `src/utils/encryption/buffer.ts:47` | getRandomValues | IV/salt generation |

### Detailed Analysis

#### encryption.ts - Well Designed

```
Password
    |
    v
PBKDF2 (600K iterations, SHA-256)
    |
    v
Master Key (32 bytes)
    |
    v
   HKDF
   /   \
  v     v
Encryption Key    Authentication Key
(AES-GCM-256)     (HMAC-SHA-256)
```

**Strengths**:
- 600K PBKDF2 iterations (OWASP 2024 compliant)
- HKDF for key separation (cryptographic best practice)
- AES-GCM provides authenticated encryption
- Timing attack mitigations (random delays, constant-time patterns)

#### settings.ts - Simpler but Acceptable

```
Password
    |
    v
PBKDF2 (600K iterations, SHA-256)
    |
    v
AES-GCM Key (used directly)
```

**Why simpler is acceptable here**:
- Single-purpose key (only encrypts settings)
- No need for key separation
- Still uses proper PBKDF2 iteration count

### Issues Identified

#### Issue 1: Inconsistent crypto.subtle Availability Check

**Severity**: Low

```typescript
// replayPrevention.ts:163 - Defensive check
if (typeof crypto !== 'undefined' && crypto.subtle) {
  // Use crypto.subtle
}

// encryption.ts, settings.ts - No check, assumes available
const encryptedBuffer = await crypto.subtle.encrypt(...)
```

**Assessment**: In a Chrome extension context, `crypto.subtle` is **guaranteed** to be available (Chrome requires secure context). The check in replayPrevention.ts is unnecessary but harmless.

**Recommendation**: Remove the check for consistency, or add a comment explaining why it exists (e.g., for testing environments).

#### Issue 2: Exported Key in Session Storage

**Severity**: Documented Limitation (ADR-001)

```typescript
// settings.ts:113
const exportedKey = await crypto.subtle.exportKey('raw', derivedKey);
await setCachedSettingsKey(keyBase64);  // Stored in session storage
```

**Why this exists**:
- Service worker restarts lose in-memory state
- Session storage survives restarts within browser session
- Better UX than re-entering password after SW restart

**Known limitations**:
- Chrome may write session storage to disk during hibernation
- Compromised extension has access to the key

**Mitigations in place**:
- Session storage clears on browser close
- Auto-lock timer clears key after inactivity
- Key is derived (not raw password)

#### Issue 3: Two Different Key Derivation Patterns

**Severity**: Low (Code Clarity)

| File | Pattern | Reason |
|------|---------|--------|
| encryption.ts | PBKDF2 → HKDF → (Enc Key + Auth Key) | Wallet data needs key separation |
| settings.ts | PBKDF2 → Single Key | Settings only need encryption |

**Recommendation**: Add comment in settings.ts explaining why HKDF isn't used:

```typescript
/**
 * Note: Unlike encryption.ts, we don't use HKDF here because:
 * 1. Single-purpose key (settings encryption only)
 * 2. No authentication key needed (AES-GCM provides integrity)
 * 3. Simpler key management for session storage
 */
```

---

## Missing APIs Analysis

### APIs to Consider Adding

| API | Purpose | Recommendation |
|-----|---------|----------------|
| `chrome.storage.onChanged` | React to storage changes across contexts | **Consider** for settings sync |
| `chrome.storage.local.getBytesInUse()` | Monitor quota usage | **Consider** for quota warnings |

### APIs Correctly Avoided

| API | Why Avoided | Assessment |
|-----|-------------|------------|
| Web Locks API | Adds complexity for cross-tab locking we don't need | Correct (ADR-004) |
| IndexedDB | chrome.storage.local sufficient for wallet data model | Correct |
| `chrome.storage.sync` | Would sync secrets to cloud | Correct to avoid |
| `chrome.permissions` | No optional permissions needed | Correct |

---

## Anti-Patterns & Footguns

### Critical

| Issue | Location | Risk | Status |
|-------|----------|------|--------|
| Session-expiry alarm created in 3 places | sessionManager.ts, walletManager.ts, background.ts | Race condition on timeout | **FIXED** - Consolidated to sessionManager.ts |

### Medium

| Issue | Location | Risk | Status |
|-------|----------|------|--------|
| Inconsistent storage abstraction | local vs session patterns | Maintenance burden | **FIXED** - Migrated to wxt |
| Error swallowing vs throwing | keyStorage vs requestStorage | Silent failures | **FIXED** - Documented as ADR-008 |
| Two key derivation patterns | encryption.ts vs settings.ts | Developer confusion | **Document** |

### Low / Acceptable

| Pattern | Location | Assessment |
|---------|----------|------------|
| Exported key in session storage | settings.ts | Documented limitation (ADR-001) |
| setInterval in replayPrevention | replayPrevention.ts | Recreated on SW restart, acceptable |
| crypto.subtle availability check | replayPrevention.ts | Unnecessary but harmless |

---

## Recommendations

### High Priority

1. **~~Consolidate session-expiry alarm ownership~~** ✅ DONE
   - sessionManager.ts now owns the alarm
   - Exports `scheduleSessionExpiry()` and `clearSessionExpiry()`
   - walletManager.ts calls these functions

### Medium Priority

2. **Create session storage abstraction**
   - Similar to wxt's `storage.defineItem()`
   - Consistent error handling
   - Type safety

3. **~~Standardize error handling patterns~~** ✅ DONE
   - Pattern documented in ADR-008 (storage.ts)
   - GET operations: return safe default
   - SET operations: throw error

### Low Priority

4. **Add storage quota monitoring**
   - Warn at 80% capacity
   - Log current usage periodically

5. **Document crypto pattern differences**
   - Add comments explaining why settings.ts is simpler
   - Update architecture documentation

---

## Related ADRs

| ADR | Decision | Relevance |
|-----|----------|-----------|
| ADR-001 | JS memory clearing limitation - acceptable | Explains session storage key caching |
| ADR-004 | Promise-based write mutex | Explains why Web Locks not used |

---

## Changelog

| Date | Change |
|------|--------|
| 2026-01 | Initial analysis complete |
| 2026-01 | FIXED: Session-expiry alarm consolidated to sessionManager.ts |
| 2026-01 | FIXED: Multiple onMessage listeners consolidated in background.ts |
| 2026-01 | DOCUMENTED: Error handling pattern (ADR-008) |
| 2026-01 | MIGRATED: keyStorage.ts and updateStorage.ts to wxt storage |
| 2026-01 | FIXED: Inconsistent crypto.subtle availability check in replayPrevention.ts |
| 2026-01 | DOCUMENTED: Key derivation pattern differences (ADR-009 in settings.ts) |
| 2026-01 | EVALUATED: chrome.storage.onChanged - wxt provides .watch() method |
| 2026-01 | EVALUATED: chrome.storage.getBytesInUse - not needed (0.3% max usage) |
