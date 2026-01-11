# Security Audit Checklist

This document tracks security implementations based on industry best practices:
- [OWASP Cheat Sheet Series](https://cheatsheetseries.owasp.org/)
- [Certik Wallet Security Checklist](https://www.certik.com/resources/blog/cryptowalletsecurityassessmentchecklist)
- [Slowmist Wallet Audit](https://www.slowmist.com/service-wallet-security-audit.html)
- [Valkyri Extension Pentesting](https://blog.valkyri.xyz/posts/wallet-extension-pentesting/)
- [BlockApex Web3 Wallet Checklist](https://blockapex.io/web3-wallet-security-checklist/)

## Implementation Status

| Category | Area | Implementation | Status |
|----------|------|----------------|--------|
| **Cryptography** | Key Derivation | PBKDF2 with 600,000 iterations | ✅ |
| | Encryption | AES-256-GCM with HKDF domain separation | ✅ |
| | Crypto Libraries | Audited `@noble/*` and `@scure/*` libraries | ✅ |
| | Private Key Zeroing | Keys zeroed after signing operations | ✅ |
| | Memory Clearing | Best-effort with documented JS limitations (ADR-001) | ✅ |
| | Timing Attack Mitigation | Constant-time operations + random delays | ✅ |
| **Session** | Idle Timeout | Configurable 1-30 minute auto-lock | ✅ |
| | Absolute Timeout | 8-hour maximum session duration | ✅ |
| | Session Recovery | Re-authentication required after service worker restart | ✅ |
| | Rate Limiting | Protection against brute-force unlock attempts | ✅ |
| **Provider API** | Origin Verification | Origins validated from content script context | ✅ |
| | Permission System | Per-origin connection approval required | ✅ |
| | Silent Signing Prevention | All signing requires user approval via popup | ✅ |
| | Locked State Protection | Sensitive APIs blocked when wallet locked | ✅ |
| | WYSIWYS | Transaction details shown before signing | ✅ |
| **Transactions** | Local Message Verification | Counterparty messages unpacked locally and compared against API | ✅ |
| | Replay Prevention | Nonce tracking, idempotency keys, txid deduplication | ✅ |
| | Race Condition Prevention | Mutex locks for wallet state operations | ✅ |
| | Deep Clone Protection | Cached data immutability enforced | ✅ |
| **Input Validation** | QR Code Validation | XSS, protocol, and path traversal protection | ✅ |
| | Private Key Validation | Format and injection protection | ✅ |
| | Fuzz Testing | Property-based testing with fast-check | ✅ |
| **Extension** | Manifest Permissions | Minimal: `storage`, `tabs`, `alarms`, `sidePanel` | ✅ |
| | Content Security Policy | MV3 strict default (no eval, no remote scripts) | ✅ |
| | Message Sender Validation | Background script validates extension context | ✅ |
| | Console Stripping | `console.log/error` removed in production builds | ✅ |
| | Dependency Pinning | All versions pinned, lockfile with integrity hashes | ✅ |
| | Security Audit CI | `npm audit` runs on every PR | ✅ |
| **Error Handling** | User vs Internal Errors | Separate `userMessage` field prevents info leakage | ✅ |
| | Decryption Errors | Generic messages prevent oracle attacks | ✅ |
| | Stack Traces | Never exposed to external callers | ✅ |

## Local Transaction Verification

When signing Counterparty transactions, the wallet independently verifies transaction contents rather than trusting API responses. This defends against compromised or malicious API servers.

**How it works:**
1. The wallet decodes OP_RETURN data and unpacks the Counterparty message locally
2. Critical fields (asset, quantity, destination) are extracted and compared against the API response
3. Any mismatch triggers a warning or blocks signing (configurable via Settings > Advanced)

**Supported message types:** Send, Enhanced Send, Order, Dispenser, Cancel, Destroy, Sweep, Issuance

## Security Assumptions

This wallet does **not** protect against:

- **Compromised operating system** — Malware with kernel access can read memory
- **Malicious browser extensions** — Extensions with higher privileges can intercept data
- **Physical access to unlocked device** — No defense against shoulder surfing or unlocked sessions
- **Compromised browser** — Modified browser binaries can bypass all protections
- **Supply chain attacks** — We pin versions and verify hashes, but cannot guarantee upstream integrity

## Architecture Decision Records

Security trade-offs and design decisions are documented inline as ADRs:

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

## Audit Status

This wallet has not been independently audited. We intend to pursue an audit when funding allows.

In the meantime, we welcome responsible disclosure via our [bug bounty program](SECURITY.md).
