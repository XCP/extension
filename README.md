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

## Security

This wallet has not been independently audited. However, we have implemented security best practices based on OWASP guidelines and wallet security checklists from Certik, Slowmist, and Valkyri.

### Cryptography

| Area | Implementation | Status |
|------|---------------|--------|
| Key Derivation | PBKDF2 with 600,000 iterations | ✅ |
| Encryption | AES-256-GCM with HKDF domain separation | ✅ |
| Crypto Libraries | Audited `@noble/*` and `@scure/*` libraries | ✅ |
| Private Key Zeroing | Keys zeroed after signing operations | ✅ |
| Memory Clearing | Best-effort with documented JS limitations (ADR-001) | ✅ |

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
| Console Stripping | `console.log/error` removed in production builds | ✅ |
| Dependency Pinning | All versions pinned, lockfile with integrity hashes | ✅ |
| Security Audit CI | `npm audit` runs on every PR | ✅ |

### Error Handling

| Area | Implementation | Status |
|------|---------------|--------|
| User vs Internal Errors | Separate `userMessage` field prevents info leakage | ✅ |
| Decryption Errors | Generic messages prevent oracle attacks | ✅ |
| Stack Traces | Never exposed to external callers | ✅ |

## License

MIT
