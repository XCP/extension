# Security Audit Checklist

Self-reported security assessment based on industry checklists. Not independently audited.

**Legend:** ✅ Implemented | ⚠️ Partial/Limitation | ❌ Gap | ⚪ Not Applicable

## Sources

- [OWASP Cheat Sheets](https://cheatsheetseries.owasp.org/) — Industry standard for web security (Cryptographic Storage, Session Management, Key Management)
- [Slowmist Wallet Security Audit](https://www.slowmist.com/service-wallet-security-audit.html) — Major Web3 auditor (2000+ audits including Binance, OKX, Crypto.com)
- [Certik Wallet Security Checklist](https://www.certik.com/resources/blog/cryptowalletsecurityassessmentchecklist) — Leading Web3 security firm
- [Valkyri Extension Pentesting](https://blog.valkyri.xyz/posts/wallet-extension-pentesting/) — Browser extension specific methodology
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
| ✅ | Domain separation for keys | HKDF with distinct contexts per key type |
| ✅ | Random salt per encryption | 16-byte random salt generated each time |
| ✅ | Random IV per encryption | 12-byte random IV for each operation |
| ✅ | Timing attack mitigation | Random delays (0-10ms) on decryption |
| ✅ | Keys zeroed after use | Best-effort overwrite with zeros |
| ⚠️ | Memory clearing | JS limitation—V8 may retain copies (ADR-001) |
| ⚪ | HSM/hardware key storage | Not applicable—browser extension |
| ⚪ | Key rotation | Not applicable—user controls keys |

## Session Management

| Status | Item | Implementation |
|--------|------|----------------|
| ✅ | Idle timeout | Configurable 1-30 minute auto-lock |
| ✅ | Absolute timeout | 8-hour maximum session duration |
| ✅ | Re-auth after restart | Service worker restart requires unlock |
| ✅ | Rate limiting on unlock | 5 attempts per minute per origin |
| ✅ | Session stored server-side only | Keys in memory, never in storage unlocked |
| ✅ | Logout clears session | `clearAllUnlockedSecrets()` on lock |
| ⚪ | Cookie security attributes | Not applicable—no cookies used |
| ⚪ | Session ID entropy | Not applicable—no session tokens |

## Password & Authentication

| Status | Item | Implementation |
|--------|------|----------------|
| ✅ | Minimum password length | 8 characters enforced |
| ✅ | Rate limiting on attempts | Tiered: 5-500 requests/min |
| ✅ | Generic error messages | No oracle attacks via error text |
| ⚠️ | Password complexity | Length only—no uppercase/symbol requirements |
| ⚠️ | 2FA/PIN for sensitive actions | Password required, no separate 2FA |
| ❌ | Password strength meter | Not implemented |

## Extension Security (Certik/Valkyri)

| Status | Item | Implementation |
|--------|------|----------------|
| ✅ | Minimal permissions | `storage`, `tabs`, `alarms`, `sidePanel` only |
| ✅ | Message origin validation | Background validates sender context |
| ✅ | CSP enforced | MV3 strict default, no unsafe-eval |
| ✅ | No hardcoded secrets | Scanned with gitleaks patterns |
| ✅ | Dependency version pinning | Exact versions in package.json |
| ✅ | npm audit clean | 0 vulnerabilities |
| ✅ | Console stripping in prod | `vite-plugin-remove-console` removes log/error |
| ✅ | Content script isolation | Separate injected.js, content.js contexts |
| ✅ | XSS protection | Input sanitization, no innerHTML with user data |
| ✅ | Clickjacking protection | postMessage origin validation |
| ⚠️ | Heap inspection resistance | Best-effort clear, JS limitations documented |
| ⚪ | Tamper/repackaging detection | Relies on browser store signatures (self-checks are bypassable) |
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
| ✅ | Clipboard auto-clear | 30-second auto-clear after copy |
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

## Supply Chain

| Status | Item | Implementation |
|--------|------|----------------|
| ✅ | Exact version pinning | No wildcards in package.json |
| ✅ | Lockfile integrity | package-lock.json with hashes |
| ✅ | npm audit CI | Runs on every PR |
| ✅ | Minimal dependencies | 12 runtime deps (most wallets have 50+) |
| ⚪ | Dependency confusion | Not applicable—no private packages |

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

Clipboard is automatically cleared 30 seconds after copying. However, if the extension is closed before the timer fires, the data remains in clipboard until manually overwritten.

### Password Policy

We enforce minimum length (8 characters) but not complexity rules (uppercase, symbols, etc.). This follows [NIST 800-63B](https://pages.nist.gov/800-63-3/sp800-63b.html) guidance which found that complexity requirements often lead to predictable patterns (`Password1!`) without meaningfully improving security. Length and uniqueness matter more than character variety.

A password strength meter would provide better user feedback and may be added in a future release.

---

## Architecture Decision Records

| ADR | Decision | Location |
|-----|----------|----------|
| ADR-001 | JavaScript memory clearing limitations | [sessionManager.ts](src/utils/auth/sessionManager.ts) |
| ADR-002 | No automatic key refresh during session | [sessionManager.ts](src/utils/auth/sessionManager.ts) |
| ADR-003 | No distributed tracing (future enhancement) | [MessageBus.ts](src/services/core/MessageBus.ts) |
| ADR-004 | Promise-based write mutex for storage | [storage.ts](src/utils/storage/storage.ts) |
| ADR-005 | Explicit service dependency ordering | [BaseService.ts](src/services/core/BaseService.ts) |
| ADR-006 | Request callbacks lost on service worker restart | [RequestManager.ts](src/services/core/RequestManager.ts) |
| ADR-007 | Distributed request state design | [approvalService.ts](src/services/approvalService.ts) |
| ADR-008 | Storage error handling pattern | [storage.ts](src/utils/storage/storage.ts) |
| ADR-009 | Key derivation with HKDF domain separation | [settings.ts](src/utils/encryption/settings.ts) |
| ADR-010 | Storage pattern decisions (class vs function) | [requestStorage.ts](src/utils/storage/requestStorage.ts) |
| ADR-011 | Isolated wallet and settings storage | [storage.ts](src/utils/storage/storage.ts) |

---

## Summary

| Category | ✅ | ⚠️ | ❌ | ⚪ |
|----------|-----|-----|-----|-----|
| Cryptography | 10 | 1 | 0 | 2 |
| Session | 6 | 0 | 0 | 2 |
| Password | 3 | 2 | 1 | 0 |
| Extension | 10 | 1 | 0 | 2 |
| Provider API | 8 | 0 | 0 | 0 |
| Transaction | 5 | 0 | 0 | 0 |
| Input Validation | 5 | 0 | 0 | 0 |
| UI/UX | 3 | 0 | 1 | 2 |
| Error Handling | 4 | 0 | 0 | 0 |
| Supply Chain | 4 | 0 | 0 | 1 |
| **Total** | **58** | **4** | **2** | **9** |

**Gaps (❌):** Password strength meter, screenshot prevention (browser limitation)

---

## Audit Status

This wallet has not been independently audited. We intend to pursue an audit when funding allows.

Report vulnerabilities via [GitHub Security Advisories](../../security/advisories/new) or see our [bug bounty program](SECURITY.md).
