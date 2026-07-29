# Security Audit Checklist

Self-reported security assessment based on industry checklists.

**Legend:** ✅ Implemented | ⚠️ Partial/Limitation | ❌ Gap | ⚪ Not Applicable

---

## Audit Status

**Independent Audit:** Not yet completed. We intend to pursue a professional audit when funding allows.

**Internal Review:** July 2026 — code-verified review of the cryptography, session, storage, and secret-handling layers against this checklist. Findings were remediated and this document updated to match the code.

**Automated Analysis:** The encryption module has been analyzed with Trail of Bits security tools:

| Tool | Scope | Result |
|------|-------|--------|
| Semgrep | Static analysis (292 rules) | 0 findings |
| Constant-time analysis | Timing side-channels | Passed |
| Sharp edges analysis | API misuse resistance | Low risk |
| Variant analysis | Input validation bypasses | No variants found |
| Property-based testing | Roundtrip/validation properties | 17 properties verified |

**Vulnerability Reporting:** [GitHub Security Advisories](../../security/advisories/new) or see [bug bounty program](SECURITY.md).

---

## Threat Model

### What We Protect Against

| Threat | Mitigation |
|--------|------------|
| **Disk attacker** (stolen device, malware reading files) | All secrets encrypted at rest with AES-256-GCM |
| **Brute-force password attack** | PBKDF2 with 600K iterations, rate limiting |
| **Malicious dApp** | Origin validation, explicit approval for all signing |
| **Supply chain attack** | Minimal deps (13), exact version pins, npm audit CI |
| **Memory inspection** (while unlocked) | Auto-lock timeout, session cleared on lock |
| **Replay attacks** | Nonce tracking, transaction deduplication |

### What We Do NOT Protect Against

| Threat | Reason |
|--------|--------|
| **Compromised browser/OS** | Platform trust required; no defense possible |
| **Physical access while unlocked** | User responsibility; we provide auto-lock |
| **Screenshots** | Browser API limitation; cannot prevent |
| **Advanced memory forensics** | JavaScript limitation (see ADR-001) |

### Trust Boundaries

```
┌─────────────────────────────────────────────────────────────┐
│  UNTRUSTED: dApps, user input, stored encrypted data        │
└──────────────────────────┬──────────────────────────────────┘
                           │ Validation + Origin checks
                           v
┌─────────────────────────────────────────────────────────────┐
│  EXTENSION: Background service worker, popup UI             │
└──────────────────────────┬──────────────────────────────────┘
                           │ Web Crypto API
                           v
┌─────────────────────────────────────────────────────────────┐
│  TRUSTED: Browser crypto primitives, Chrome storage APIs    │
└─────────────────────────────────────────────────────────────┘
```

---

## Sources

- [OWASP Cheat Sheets](https://cheatsheetseries.owasp.org/) — Cryptographic Storage, Session Management, Key Management
- [Slowmist Wallet Security Audit](https://www.slowmist.com/service-wallet-security-audit.html) — Web3 auditor methodology
- [Certik Wallet Security Checklist](https://www.certik.com/resources/blog/cryptowalletsecurityassessmentchecklist) — Web3 security firm
- [Valkyri Extension Pentesting](https://blog.valkyri.xyz/posts/wallet-extension-pentesting/) — Browser extension methodology
- [BlockApex Web3 Wallet Checklist](https://blockapex.io/web3-wallet-security-checklist/) — Cross-platform wallet security

---

## Cryptography & Key Management

| Status | Item | Implementation |
|--------|------|----------------|
| ✅ | Use AES-256 for symmetric encryption | AES-256-GCM with authenticated encryption |
| ✅ | Use authenticated cipher modes (GCM/CCM) | GCM mode with authentication tag |
| ✅ | Use CSPRNG for all randomness | `crypto.getRandomValues()` for salts, IVs, keys |
| ✅ | High iteration key derivation | PBKDF2 with 600,000 iterations |
| ✅ | Use audited crypto libraries | Noble/Scure family (Cure53 audited) |
| ⚪ | HKDF domain separation | Superseded by the unified keychain (ADR-015): one PBKDF2 master key; each wallet secret individually encrypted, then the keychain blob encrypted again |
| ✅ | Random salt per password | 16-byte random salt at keychain creation and password change |
| ✅ | Random IV per encryption | 12-byte random IV for each operation |
| ✅ | Timing attack mitigation | Random delays (0-10ms) on decryption |
| ✅ | Key buffers zeroed after use | Password and signing key bytes zeroed in finally blocks |
| ⚠️ | Memory clearing | JS limitation—V8 may retain copies (ADR-001) |
| ⚪ | HSM/hardware key storage | Not applicable—browser extension |
| ⚪ | Key rotation | Not applicable—user controls keys |

### Input Validation Thresholds (ADR-014)

The encryption module enforces minimum security thresholds at the API boundary:

| Parameter | Minimum | Rationale |
|-----------|---------|-----------|
| Password length | 8 characters | NIST 800-63B guidance |
| PBKDF2 iterations | 500,000 | Brute-force resistance |
| Salt size | 16 bytes | 128-bit uniqueness |

Invalid inputs are rejected with exceptions (fail-closed), not silently accepted. This "pit of success" design ensures developers cannot accidentally weaken security.

## Session Management

| Status | Item | Implementation |
|--------|------|----------------|
| ✅ | Idle timeout | Configurable 1-30 minute auto-lock; alarm re-armed on service worker startup |
| ✅ | Absolute timeout | 8-hour maximum session duration |
| ✅ | Re-auth after browser restart | Session storage cleared on browser close; service worker restarts keep the session by design (see Known Limitations) |
| ✅ | Rate limiting on unlock | 5 failed attempts per minute, persisted across service worker restarts |
| ✅ | Secrets never on disk | Decrypted secrets in memory; master key in memory-backed chrome.storage.session |
| ✅ | Logout clears session | `clearAllUnlockedSecrets()` on lock |
| ⚪ | Cookie security attributes | Not applicable—no cookies used |
| ⚪ | Session ID entropy | Not applicable—no session tokens |

## Password & Authentication

| Status | Item | Implementation |
|--------|------|----------------|
| ✅ | Minimum password length | 8 characters enforced |
| ✅ | Rate limiting on attempts | Unlock: 5 failed/min persisted; provider API tiered 5-500 requests/min |
| ✅ | Generic error messages | No oracle attacks via error text |
| ⚠️ | Password complexity | Length only—no uppercase/symbol requirements |
| ⚠️ | 2FA/PIN for sensitive actions | Password required, no separate 2FA |
| ❌ | Password strength meter | Not implemented |

## Extension Security

| Status | Item | Implementation |
|--------|------|----------------|
| ✅ | Minimal permissions | `storage`, `alarms`, `sidePanel`, `scripting` only |
| ✅ | Message origin validation | Background validates sender context |
| ✅ | CSP enforced | MV3 strict default, no unsafe-eval |
| ✅ | No hardcoded secrets | Scanned with gitleaks patterns |
| ✅ | Dependency version pinning | Exact versions in package.json |
| ✅ | npm audit clean | 0 high/critical outside the documented @trezor/elliptic acceptance; gated in CI |
| ✅ | Console stripping in prod | esbuild `drop` removes all console.* calls |
| ✅ | Content script isolation | Separate injected.js, content.js contexts |
| ✅ | XSS protection | Input sanitization, no innerHTML with user data |
| ✅ | Clickjacking protection | postMessage origin validation |
| ⚠️ | Heap inspection resistance | Best-effort clear, JS limitations documented |
| ⚪ | Tamper/repackaging detection | Relies on browser store signatures |
| ⚪ | Certificate pinning | Not applicable—browser handles TLS |

## Provider API Security

| Status | Item | Implementation |
|--------|------|----------------|
| ✅ | Origin verification | Validated from content script context |
| ✅ | Per-origin permissions | Connection approval required |
| ✅ | No silent signing | All signing requires popup approval |
| ✅ | Locked state protection | Sensitive APIs blocked when locked |
| ✅ | WYSIWYS | Full transaction details shown before sign |
| ✅ | Rate limiting per origin | Tiered: 5 connections, 10 transactions, 100 API calls/min |
| ✅ | Global rate limit | 500 requests/min backstop |
| ✅ | Queue size limits | Max 100 pending requests, 10 per origin |
| ✅ | Explicit capability consent | Paired-address access is opt-in and unchecked by default |
| ✅ | Capability identity binding | Grants are scoped to origin, wallet ID, and active address, then rechecked immediately before signing |
| ✅ | Multi-address signing constraints | Only the active address and its same-index Legacy/SegWit sibling pair are accepted; indices are unique and bounded, and each claimed signer must match the embedded prevout |
| ✅ | Effective sighash disclosure | Override arrays use absolute PSBT input indices and require coverage; approval warnings use the effective override, embedded value, or SIGHASH_ALL default |

## Transaction Security

| Status | Item | Implementation |
|--------|------|----------------|
| ✅ | Local message verification | Counterparty messages unpacked and compared |
| ✅ | Replay prevention | Nonce tracking, txid deduplication |
| ✅ | Race condition prevention | Mutex locks, `isComposing`/`isSigning` guards |
| ✅ | Stale transaction detection | 5-minute timeout on composed transactions |
| ✅ | Address checksum validation | Base58/Bech32 checksum verified |

## Input Validation

| Status | Item | Implementation |
|--------|------|----------------|
| ✅ | Bitcoin address validation | Checksum, network, format validation |
| ✅ | QR code sanitization | XSS, protocol, path traversal protection |
| ✅ | Private key format validation | WIF, hex format with injection protection |
| ✅ | Fuzz testing | Property-based tests with fast-check |
| ✅ | API input validation | Type checking, bounds validation |

## UI/UX Security

| Status | Item | Implementation |
|--------|------|----------------|
| ✅ | Full message display | Transaction details shown before signing |
| ✅ | User-initiated clipboard | Copy only on explicit user action |
| ✅ | Clipboard auto-clear | 30-second auto-clear (including private key copy); a pending clear fires on navigation |
| ❌ | Screenshot prevention | Not possible in browser extensions |
| ⚪ | Custom keyboard blocking | Not applicable—browser extensions |
| ⚪ | Jailbreak/root detection | Not applicable—desktop browser |

## Error Handling

| Status | Item | Implementation |
|--------|------|----------------|
| ✅ | User vs internal errors | Separate `userMessage` field |
| ✅ | Generic decryption errors | Prevents padding oracle attacks |
| ✅ | Stack traces hidden | Never exposed to external callers |
| ✅ | Logging stripped in prod | console.log/error removed |

## Privacy & Analytics (ADR-016)

| Status | Item | Implementation |
|--------|------|----------------|
| ✅ | Opt-out available | Users can disable in Settings > Advanced |
| ✅ | Firefox consent integration | Respects Firefox 140+ built-in data collection consent |
| ✅ | Path sanitization | Dynamic params stripped (wallet IDs, asset names, tx hashes); data-shaped segments on unlisted routes truncated (fail closed) |
| ✅ | No query strings | Empty `qs: {}` sent; no UTM/marketing params |
| ✅ | No referrer tracking | Empty `r: ''` for all events |
| ✅ | No persistent user IDs | Random `cid` per request; no cookies/localStorage IDs |
| ✅ | Aggregate-level only | App-level patterns, not user journeys |
| ✅ | BTC amount bucketing | Transaction values bucketed for privacy |
| ✅ | Self-hosted script | Bundled directly; no third-party JS execution |
| ⚪ | User identification | Not supported—by design |

**Events tracked:** `compose`, `broadcast`, `consolidate` and its eligibility funnel, categorized error events (`compose_error_<category>`, `broadcast_error_<category>`, `consolidate_error_<category>` — categories only, never messages), `not_found`, connection events.

**BTC bucketing:** Amounts are bucketed (dust/micro/tiny/small/medium/large/whale/mega) to understand volume without revealing exact values that could correlate with on-chain data.

## Supply Chain

| Status | Item | Implementation |
|--------|------|----------------|
| ✅ | Exact version pinning | No wildcards in package.json |
| ✅ | Lockfile integrity | package-lock.json with hashes |
| ✅ | npm audit CI | Runs on every PR |
| ✅ | Minimal dependencies | 13 runtime deps (most wallets have 50+) |
| ⚪ | Dependency confusion | Not applicable—no private packages |

## Hardware Wallet Security

| Status | Item | Implementation |
|--------|------|----------------|
| ✅ | Device-bound keys | Private keys never leave hardware device |
| ✅ | Physical confirmation | User must confirm transactions on device display |
| ✅ | WYSIWYS enforcement | Device shows full transaction details before signing |
| ✅ | Vendor abstraction | IHardwareWalletAdapter interface isolates device-specific logic |
| ✅ | MV3 service worker compatibility | Uses @trezor/connect-webextension for service worker support |
| ✅ | PSBT signing flow | BIP-174 format for SegWit transaction signing |
| ✅ | PSBT input validation | Verifies witnessUtxo values match API-provided amounts |
| ✅ | RBF enabled by default | Sequence 0xfffffffd allows fee bumping |
| ✅ | Address derivation paths | Standard BIP-44/49/84/86 paths per address format |
| ✅ | Reference transaction fetching | Automatically fetches prev tx data for non-SegWit inputs |
| ✅ | Sidepanel-only access | Hardware wallet features require sidepanel context |
| ✅ | No extension trust required | Compromised extension cannot sign without device |
| ⚠️ | Trezor popup UX | Adds friction but expected for hardware wallet security |
| ⚪ | Ledger support | Future enhancement—interface designed for multi-vendor |

---

## Known Limitations

### JavaScript Memory Clearing (ADR-001)

Browser JavaScript cannot guarantee secure memory clearing:
- String immutability may retain original data
- V8 garbage collector timing is non-deterministic
- JIT optimizations may preserve copies

**Mitigation:** Defense-in-depth via short session timeouts (1-30 min configurable), auto-lock on idle, and re-authentication on service worker restart.

**Industry context:** MetaMask, UniSat, Xverse face identical constraints. True secure memory requires native code (libsodium), which browsers don't support.

### Screenshot Prevention

Browser extensions cannot prevent OS-level screenshots. Users should be aware that displayed seed phrases/private keys could be captured.

### Clipboard Auto-Clear

Clipboard is automatically cleared 30 seconds after copying, and a pending clear fires immediately when navigating within the extension. However, if the extension window is closed before the timer fires, the clear cannot run and the data remains in clipboard until manually overwritten.

### Service Worker Session Persistence

The derived master key is cached in memory-backed `chrome.storage.session` so MV3 service worker restarts (which occur after ~30 seconds of idle) do not prompt for the password — requiring re-auth per restart would mean password entry many times per hour. The cache never touches disk, is unreadable from web pages and content scripts, and is cleared on lock, auto-lock, and browser close. While unlocked it is password-equivalent capability; the mitigations are the auto-lock timeout and the 8-hour absolute session cap.

### Password Policy

We enforce minimum length (8 characters) but not complexity rules (uppercase, symbols, etc.). This follows [NIST 800-63B](https://pages.nist.gov/800-63-3/sp800-63b.html) guidance which found that complexity requirements often lead to predictable patterns (`Password1!`) without meaningfully improving security.

### Timing Attack Scope

The random delay (0-10ms) on decryption is a basic mitigation appropriate for browser extensions where:
- Attackers cannot make high-volume automated requests (UI-gated)
- Primary threat is disk attackers, not network timing analysis
- AES-GCM provides authenticated encryption

This is not true constant-time code. For higher-security applications, constant-time comparison would be preferred.

---

## Architecture Decision Records

| ADR | Decision | Location |
|-----|----------|----------|
| ADR-001 | JavaScript memory clearing limitations | [sessionManager.ts](src/utils/auth/sessionManager.ts) |
| ADR-002 | No automatic key refresh during session | [sessionManager.ts](src/utils/auth/sessionManager.ts) |
| ADR-003 | No distributed tracing (future enhancement) | [MessageBus.ts](src/services/core/MessageBus.ts) |
| ADR-004 | Promise-based write mutex for storage | [mutex.ts](src/utils/storage/mutex.ts) |
| ADR-005 | Explicit service dependency ordering | [BaseService.ts](src/services/core/BaseService.ts) |
| ADR-006 | Request callbacks lost on service worker restart | [RequestManager.ts](src/services/core/RequestManager.ts) |
| ADR-007 | Distributed request state design | [approvalService.ts](src/services/approvalService.ts) |
| ADR-008 | Storage error handling pattern | [walletStorage.ts](src/utils/storage/walletStorage.ts) |
| ADR-009 | Key derivation with HKDF domain separation — superseded by ADR-015 | [walletManager.ts](src/utils/wallet/walletManager.ts) |
| ADR-010 | Storage pattern decisions (class vs function) | [requestStorage.ts](src/utils/storage/requestStorage.ts) |
| ADR-011 | Isolated wallet and settings storage | [walletStorage.ts](src/utils/storage/walletStorage.ts) |
| ADR-012 | Type organization and extraction strategy | [types/index.ts](src/types/index.ts) |
| ADR-013 | Constants organization strategy | [wallet/constants.ts](src/utils/wallet/constants.ts) |
| ADR-014 | Input validation thresholds for encryption | [encryption.ts](src/utils/encryption/encryption.ts) |
| ADR-015 | Unified keychain architecture | [walletManager.ts](src/utils/wallet/walletManager.ts) |
| ADR-016 | Privacy-focused analytics with Fathom | [fathom.ts](src/utils/fathom.ts) |
| ADR-017 | Hardware wallet integration architecture | [trezorAdapter.ts](src/utils/hardware/trezorAdapter.ts) |
| ADR-018 | Explicit, identity-bound paired-address provider capability | [providerService.ts](src/services/providerService.ts) |

---

## Summary

| Category | ✅ | ⚠️ | ❌ | ⚪ |
|----------|-----|-----|-----|-----|
| Cryptography | 9 | 1 | 0 | 3 |
| Session | 6 | 0 | 0 | 2 |
| Password | 3 | 2 | 1 | 0 |
| Extension | 10 | 1 | 0 | 2 |
| Provider API | 11 | 0 | 0 | 0 |
| Transaction | 5 | 0 | 0 | 0 |
| Input Validation | 5 | 0 | 0 | 0 |
| UI/UX | 3 | 0 | 1 | 2 |
| Error Handling | 4 | 0 | 0 | 0 |
| Privacy & Analytics | 9 | 0 | 0 | 1 |
| Supply Chain | 4 | 0 | 0 | 1 |
| Hardware Wallet | 12 | 1 | 0 | 1 |
| **Total** | **81** | **5** | **2** | **12** |

**Gaps (❌):** Password strength meter, screenshot prevention (browser limitation)
