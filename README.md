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

### Architecture Decision Records

Security trade-offs and design decisions are documented inline as ADRs:
- **ADR-001**: JavaScript memory clearing limitations
- **ADR-002**: No automatic key refresh during session
- **ADR-005**: Promise-based write mutex for storage
- **ADR-010**: Key derivation pattern with HKDF domain separation
- **ADR-012**: Isolated wallet and settings storage

### Reporting Security Issues

If you discover a security vulnerability, please report it privately via GitHub Security Advisories rather than opening a public issue.

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
