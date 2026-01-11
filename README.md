# XCP Wallet

Browser extension wallet for Counterparty on Bitcoin.

## Features

- Multiple wallets and address types (SegWit, Taproot, Legacy)
- Send/receive BTC and Counterparty assets
- Create dispensers and DEX orders
- Issue and manage assets
- Connect to dApps via provider API
- BIP-322 message signing

## Install

Coming soon to Chrome Web Store.

## Security

This wallet has not been independently audited. However, we have implemented security best practices based on:
- [OWASP Cheat Sheet Series](https://cheatsheetseries.owasp.org/) (Cryptographic Storage, Session Management, Input Validation, Error Handling, Key Management)
- Wallet security checklists from [Certik](https://www.certik.com/resources/blog/cryptowalletsecurityassessmentchecklist), [Slowmist](https://www.slowmist.com/service-wallet-security-audit.html), and [Valkyri](https://blog.valkyri.xyz/posts/wallet-extension-pentesting/)
- [BlockApex Web3 Wallet Security Checklist](https://blockapex.io/web3-wallet-security-checklist/)

### Cryptography

| Area | Implementation | Status |
|------|---------------|--------|
| Key Derivation | PBKDF2 with 600,000 iterations | ✅ |
| Encryption | AES-256-GCM with HKDF domain separation | ✅ |
| Crypto Libraries | Audited `@noble/*` and `@scure/*` libraries | ✅ |
| Private Key Zeroing | Keys zeroed after signing operations | ✅ |
| Memory Clearing | Best-effort with documented JS limitations (ADR-001) | ✅ |
| Timing Attack Mitigation | Constant-time operations + random delays | ✅ |

### Session Management

| Area | Implementation | Status |
|------|---------------|--------|
| Idle Timeout | Configurable 1-30 minute auto-lock | ✅ |
| Absolute Timeout | 8-hour maximum session duration | ✅ |
| Session Recovery | Re-authentication required after service worker restart | ✅ |
| Rate Limiting | Protection against brute-force unlock attempts | ✅ |

### Provider API Security

| Area | Implementation | Status |
|------|---------------|--------|
| Origin Verification | Origins validated from content script context | ✅ |
| Permission System | Per-origin connection approval required | ✅ |
| Silent Signing Prevention | All signing requires user approval via popup | ✅ |
| Locked State Protection | Sensitive APIs blocked when wallet locked | ✅ |
| WYSIWYS | Transaction details shown before signing | ✅ |

### Transaction Security

| Area | Implementation | Status |
|------|---------------|--------|
| Local Message Verification | Counterparty messages unpacked locally and compared against API | ✅ |
| Replay Prevention | Nonce tracking, idempotency keys, txid deduplication | ✅ |
| Race Condition Prevention | Mutex locks for wallet state operations | ✅ |
| Deep Clone Protection | Cached data immutability enforced | ✅ |

#### Local Transaction Verification

When signing Counterparty transactions, the wallet independently verifies transaction contents rather than trusting API responses. This defends against compromised or malicious API servers that could return transactions different from what was requested.

**How it works:**
1. The wallet decodes OP_RETURN data and unpacks the Counterparty message locally
2. Critical fields (asset, quantity, destination) are extracted and compared against the API response
3. Any mismatch triggers a warning or blocks signing (configurable via Settings > Advanced)

**Supported message types:** Send, Enhanced Send, Order, Dispenser, Cancel, Destroy, Sweep, Issuance

### Input Validation

| Area | Implementation | Status |
|------|---------------|--------|
| QR Code Validation | XSS, protocol, and path traversal protection | ✅ |
| Private Key Validation | Format and injection protection | ✅ |
| Fuzz Testing | Property-based testing with fast-check | ✅ |

### Extension Security

| Area | Implementation | Status |
|------|---------------|--------|
| Manifest Permissions | Minimal: `storage`, `tabs`, `alarms`, `sidePanel` | ✅ |
| Content Security Policy | MV3 strict default (no eval, no remote scripts) | ✅ |
| Message Sender Validation | Background script validates extension context | ✅ |
| Console Stripping | `console.log/error` removed in production builds | ✅ |
| Dependency Pinning | All versions pinned, lockfile with integrity hashes | ✅ |
| Security Audit CI | `npm audit` runs on every PR | ✅ |

### Error Handling

| Area | Implementation | Status |
|------|---------------|--------|
| User vs Internal Errors | Separate `userMessage` field prevents info leakage | ✅ |
| Decryption Errors | Generic messages prevent oracle attacks | ✅ |
| Stack Traces | Never exposed to external callers | ✅ |

### Security Assumptions

This wallet does **not** protect against:

- **Compromised operating system** — Malware with kernel access can read memory
- **Malicious browser extensions** — Extensions with higher privileges can intercept data
- **Physical access to unlocked device** — No defense against shoulder surfing or unlocked sessions
- **Compromised browser** — Modified browser binaries can bypass all protections
- **Supply chain attacks on dependencies** — We pin versions and verify hashes, but cannot guarantee upstream integrity

### Architecture Decision Records

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

### Future Audit

We intend to pursue an independent security audit when funding allows. In the meantime, we welcome responsible disclosure via our [bug bounty program](SECURITY.md).

### Reporting Security Issues

If you discover a security vulnerability, please report it privately via [GitHub Security Advisories](../../security/advisories/new) rather than opening a public issue.

## Dependencies

Runtime dependencies are minimal and carefully selected:

| Package | Version | Purpose |
|---------|---------|---------|
| [@noble/curves](https://github.com/paulmillr/noble-curves) | 2.0.1 | Elliptic curve cryptography (audited) |
| [@noble/hashes](https://github.com/paulmillr/noble-hashes) | 2.0.1 | Hash functions (audited) |
| [@noble/secp256k1](https://github.com/paulmillr/noble-secp256k1) | 3.0.0 | secp256k1 operations (audited) |
| [@scure/base](https://github.com/paulmillr/scure-base) | 2.0.0 | Base encoding (audited) |
| [@scure/bip32](https://github.com/paulmillr/scure-bip32) | 2.0.1 | HD wallet derivation (audited) |
| [@scure/bip39](https://github.com/paulmillr/scure-bip39) | 2.0.1 | Mnemonic phrases (audited) |
| [@scure/btc-signer](https://github.com/paulmillr/scure-btc-signer) | 2.0.1 | Bitcoin transaction signing (audited) |
| [bignumber.js](https://github.com/MikeMcl/bignumber.js) | 9.3.1 | Arbitrary precision arithmetic |
| [@headlessui/react](https://headlessui.com/) | 2.2.9 | Accessible UI components |
| [react](https://react.dev/) | 19.2.3 | UI framework |
| [react-dom](https://react.dev/) | 19.2.3 | React DOM bindings |
| [react-router-dom](https://reactrouter.com/) | 7.12.0 | Client-side routing |
| [webext-bridge](https://github.com/nickytonline/webext-bridge) | 6.0.1 | Extension messaging |

All cryptographic libraries are from the [paulmillr/noble](https://paulmillr.com/noble/) family, which have been independently audited by Cure53.

## Development

```bash
npm install
npm run dev        # Chrome
npm run dev:firefox
```

## Build

```bash
npm run build      # Production build
npm run zip        # Create extension ZIP
```

## Test

```bash
npm test           # All tests
npm run test:unit  # Unit only
npm run test:e2e   # E2E only
```

## License

MIT
