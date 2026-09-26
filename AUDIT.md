# Security Audit Checklist

Self-reported security assessment based on industry checklists.

**Legend:** ✅ Implemented | ⚠️ Partial/Limitation | ❌ Gap | ⚪ Not Applicable

---

## Audit Status

**Independent Audit:** Not yet completed. We intend to pursue a professional audit when funding allows.

**Internal Review:** July 2026 — code-verified review of the cryptography, session, storage, and secret-handling layers against this checklist. Findings were remediated and this document updated to match the code.

**Hardening update:** September 2026 — background-owned signing decisions, explicit RPC permissions,
serialized vault writes, session deadline consistency, and transaction integrity checks are described
in [ARCHITECTURE.md](ARCHITECTURE.md). This remains an internal review, not an independent audit.

August 2026 — review of the transaction construction, verification and signing path, ranked by how many files depend on each and by how often each has needed fixing. Findings were remediated and the Transaction Security section below rewritten to match: message verification is now byte equality against a locally rebuilt message rather than a field-by-field comparison against the request.

**Automated Analysis:** The encryption module has been analyzed with Trail of Bits security tools:

| Tool | Scope | Result |
|------|-------|--------|
| Semgrep | Static analysis (292 rules) | 0 findings |
| Constant-time analysis | Timing side-channels | Passed |
| Sharp edges analysis | API misuse resistance | Low risk |
| Variant analysis | Input validation bypasses | No variants found |
| Property-based testing | Roundtrip/validation properties | 17 properties verified |

**Vulnerability Reporting:** Report privately through [GitHub Security Advisories](https://github.com/XCP/extension/security/advisories/new). The bug bounty is paused; see [SECURITY.md](SECURITY.md) for what to report there and what to send as an issue or pull request.

---

## Threat Model

### What We Protect Against

| Threat | Mitigation |
|--------|------------|
| **Disk attacker** (stolen device, malware reading files) | All secrets encrypted at rest with AES-256-GCM |
| **Brute-force password attack** | PBKDF2 with 600K iterations, rate limiting |
| **Malicious dApp** | Origin validation, explicit approval for all signing |
| **Supply chain attack** | Minimal deps (14), exact version pins, npm audit CI |
| **Memory inspection** (while unlocked) | Auto-lock timeout, session cleared on lock |
| **Replay attacks** | Nonce tracking, transaction deduplication |
| **Compromised or spoofed Trezor Suite** | Under Trezor Connect 10, every Trezor approval is hosted by Trezor Suite Web (`suite.trezor.io`), which the manifest admits through `externally_connectable` and an optional host permission granted on first Trezor use. Suite relays requests to the device; it does not decide them. The device shows and confirms what it signs, and the wallet checks that the returned transaction preserves the reviewed serialization before using it |

### What We Do NOT Protect Against

| Threat | Reason |
|--------|--------|
| **Compromised browser/OS** | Platform trust required; no defense possible |
| **Physical access while unlocked** | User responsibility; we provide auto-lock |
| **Screenshots** | Browser API limitation; cannot prevent |
| **Advanced memory forensics** | JavaScript limitation (see [sessionManager.ts](src/platform/auth/sessionManager.ts)) |

### Trust Boundaries

```
┌─────────────────────────────────────────────────────────────┐
│  UNTRUSTED: dApps, user input, stored encrypted data,       │
│             the Counterparty compose API (verify.ts)        │
└──────────────────────────┬──────────────────────────────────┘
                           │ Validation + Origin checks
                           │ Structural verification of composed
                           │ transactions (verify.ts)
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

The compose API is inside the untrusted band deliberately. Counterparty transactions are composed
remotely, so the composer is a party to every transaction; the endpoint is user-configurable and may
be infrastructure this project does not run. Verification is therefore structural rather than
field-enumerated — see the design note in [verify.ts](src/core/counterparty/unpack/verify.ts).

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
| ⚪ | HKDF domain separation | Superseded by the unified keychain ([walletManager.ts](src/platform/walletManager.ts)): one master key, doubly-encrypted wallet secrets |
| ✅ | Random salt per password | 16-byte random salt at keychain creation and password change |
| ✅ | Random IV per encryption | 12-byte random IV for each operation |
| ✅ | Timing attack mitigation | Random delays (0-10ms) on decryption |
| ✅ | Key buffers zeroed after use | Password and signing key bytes zeroed in finally blocks |
| ⚠️ | Memory clearing | JS limitation—V8 may retain copies ([sessionManager.ts](src/platform/auth/sessionManager.ts)) |
| ⚪ | HSM/hardware key storage | Not applicable—browser extension |
| ⚪ | Key rotation | Not applicable—user controls keys |

### Input Validation Thresholds

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
| ✅ | Minimal permissions | `sidePanel`, `storage`, `alarms`; optional host access to `https://suite.trezor.io/*`, requested on first Trezor use; `externally_connectable` for `suite.trezor.io` only; content scripts on `https://*/*`, `http://localhost/*` and `http://127.0.0.1/*` |
| ✅ | Message origin validation | Background validates sender context |
| ✅ | CSP enforced | MV3 strict default, no unsafe-eval |
| ✅ | No hardcoded secrets | Scanned with gitleaks patterns |
| ✅ | Dependency version pinning | Exact versions in package.json |
| ✅ | npm audit clean | 0 high/critical in production dependencies; gated in CI |
| ✅ | Console stripping in prod | Rolldown `minify.compress.dropConsole` removes console.* calls from production builds |
| ✅ | Content script isolation | Separate injected.js, content.js contexts |
| ✅ | XSS protection | Input sanitization, no innerHTML with user data |
| ✅ | Clickjacking protection | postMessage origin validation |
| ⚠️ | Heap inspection resistance | Best-effort clear, JS limitations documented |
| ⚪ | Tamper/repackaging detection | Relies on browser store signatures |
| ⚪ | Certificate pinning | Not applicable—browser handles TLS |

## Provider API Security

| Status | Item | Implementation |
|--------|------|----------------|
| ✅ | Origin verification | Background derives the origin from the browser sender, checks the top frame and rejects opaque or mismatched origins |
| ✅ | Per-origin permissions | Connection approval required |
| ✅ | Approval for website signing | Website-supplied messages and transactions require a decision bound to the reviewed facts; state and permissions are rechecked at execution. Extension-generated connection proofs use the existing connection grant |
| ✅ | Locked state protection | Sensitive APIs blocked when locked |
| ✅ | WYSIWYS | Full transaction details shown before sign |
| ✅ | Rate limiting per origin | Tiered: 5 connections, 10 broadcasts, 100 API calls/min; signing requests are limited where they open a popup (below) |
| ✅ | Global rate limit | 500 requests/min backstop |
| ✅ | Pending-request bounds | 10-minute expiry; at most 3 open signing popups per origin, and 30 popups/min as a backstop, charged only when a popup opens |
| ✅ | Explicit capability consent | Paired-address access is opt-in and unchecked by default |
| ✅ | Paired-address identity binding | Paired-address grants are scoped to origin, wallet ID, and active address, then rechecked immediately before signing |
| ✅ | Multi-address signing constraints | Only the active address and its same-index Legacy/SegWit sibling pair are accepted; indices are unique and bounded, and each claimed signer must match the embedded prevout |
| ✅ | Effective sighash enforcement | The resolved sighash (explicit override, else embedded, else ALL) is enforced against an allowlist — DEFAULT, ALL, ALL\|ANYONECANPAY, SINGLE\|ANYONECANPAY — so SIGHASH_NONE and bare SINGLE are rejected whether requested explicitly or embedded in the PSBT. Verified by `psbt.test.ts` |
| ✅ | Uncommitted outputs priced as at-risk | SINGLE\|ANYONECANPAY commits to one output and leaves the rest free, so the approval summary counts only committed outputs as change and reports the remainder as at-risk; the headline shows the worst case and signing is gated on acknowledging that amount. Verified by `psbt.test.ts`, `money-movement.test.ts`, `marketplace-psbts.test.ts` |
| ✅ | `sighashTypes` coverage | Supplied entries are positional by absolute PSBT input index; a signed input with no entry is rejected rather than falling back to a different sighash. Verified by `providerService.test.ts` |
| ✅ | Legacy input amount integrity | Legacy (P2PKH) inputs must carry the full previous transaction; a bare witnessUtxo is rejected, so a declared amount can't be forged into a drain-to-fee |
| ✅ | Sign-flow origin binding | SHA-256 request correlation includes origin, method, parameters, wallet and address; recovery also rechecks origin, identity and permissions |
| ✅ | Result delivery authorization | Live completion, polling, and recovery use the persisted result and synchronously recheck current identity, grants, session generation, and expiry at background result exposure. A refused delivery preserves an already completed record; this is not an atomic guarantee of website receipt |
| ✅ | Attached-asset disclosure | On both PSBT and raw-transaction approval, each input's UTXO is checked for attached Counterparty assets, signed inputs first. Assets are shown per input and a warning is raised when a signed input carries them; an input the lookup cap displaced reports as unknown rather than as carrying nothing. Verified by `inputAssets.test.ts` |
| ✅ | Local address resolution | Input and output addresses are decoded from their scripts, so the money-movement summary can tell change from a stranger's output without an indexer call; an address that cannot be resolved marks the summary incomplete. Verified by `marketplace-psbts.test.ts` |

## Transaction Security

| Status | Item | Implementation |
|--------|------|----------------|
| ✅ | Local message verification | On every compose carrying a Counterparty OP_RETURN, the payload is decrypted (ARC4, first-input-txid key) and the message the request should produce is rebuilt locally and required to match byte for byte — sends, broadcasts, issuances, subasset issuances, ownership transfers, reissuances and MPMA batches. Where a field cannot be predicted from the request (a reissuance's divisibility, a server-drawn subasset asset id, a wallet-stamped broadcast timestamp) it is borrowed from the decoded message and the comparison drops to field level for that type, which is reported as a weaker check rather than presented as byte equality. Verified against a live node by `coreOracle.test.ts` and against real on-chain messages by `onchainRoundTrip.test.ts` (design note in [verify.ts](src/core/counterparty/unpack/verify.ts)) |
| ✅ | Signed-transaction integrity | The signer rebuilds the transaction rather than signing the parsed bytes, because it needs per-input prevout data the raw bytes do not carry. Version, lock time, per-input txid/index/sequence and per-output script/amount are compared against the parsed source before signing; a difference refuses to sign rather than producing a signature over bytes the user did not review (`transactionSigner.ts`) |
| ✅ | Display derived from decoded bytes | Amounts, assets, destinations, memos and fees on the compose review and dapp approval screens are decoded from the transaction's own bytes rather than read back from the API's echo of the request, which cannot testify about the API. The fee shown is resolved independently of the compose response. Asset divisibility remains a ledger fact read from `asset_info`, so the decimal point retains that dependency (design note in [verify.ts](src/core/counterparty/unpack/verify.ts)) |
| ✅ | Address display integrity | Output addresses on dapp approval screens are shown in full rather than abbreviated, so a lookalike address cannot match on a truncated prefix and suffix |
| ✅ | Fee bounding | Miner fee recomputed locally (inputs − outputs) and rejected before signing if it exceeds the user's selected rate or an absolute ceiling, or if outputs exceed inputs |
| ✅ | Broadcast txid integrity | Reported txid computed locally from the signed bytes, not the broadcast endpoint's echo |
| ✅ | Replay prevention | Nonce tracking, txid deduplication |
| ✅ | Race condition prevention | Mutex locks, `isComposing`/`isSigning` guards |
| ✅ | Stale transaction detection | 5-minute timeout on composed transactions |
| ✅ | Address checksum validation | Base58check (double-SHA256) and Bech32 checksums verified client-side |
| ✅ | Bitcoin output verification | Deny-by-default accounting: every output must be the Counterparty data output, an address the request names, or change to an address the signer controls — anything else rejects the transaction before the review screen, so an added recipient fails closed without any field-level check covering it. BTCPay is exempt (its payee is derived from the order match, not the request). Verified by `outputPolicy.test.ts` and `composer.test.tsx` (design note in [verify.ts](src/core/counterparty/unpack/verify.ts)) |

## Input Validation

| Status | Item | Implementation |
|--------|------|----------------|
| ✅ | Bitcoin address validation | Base58check and Bech32 checksum + format validation (network detected; wallet is mainnet-only) |
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
| ✅ | Logging stripped in prod | console.* removed by the production minifier |

## Privacy & Analytics

| Status | Item | Implementation |
|--------|------|----------------|
| ✅ | Opt-out available | Users can disable in Settings > Advanced |
| ⚪ | Browser consent integration | Not applicable—the extension ships for Chrome only |
| ✅ | Path sanitization | Dynamic params stripped (wallet IDs, asset names, tx hashes); data-shaped segments on unlisted routes truncated (fail closed) |
| ✅ | No query strings | Empty `qs: {}` sent; no UTM/marketing params |
| ✅ | No referrer tracking | Empty `r: ''` for all events |
| ✅ | No persistent user IDs | Random `cid` per request; no cookies/localStorage IDs |
| ✅ | Aggregate-level only | App-level patterns, not user journeys |
| ✅ | BTC amount bucketing | Transaction values bucketed for privacy |
| ✅ | Self-hosted script | Bundled directly; no third-party JS execution |
| ⚪ | User identification | Not supported—by design |

**Events tracked:** anonymized page views (sanitized paths, above) and these events, taken from
every `analytics.track` call in `src`:

- Compose and broadcast: `compose`, `compose_error_<category>`, `broadcast` (with a bucketed fee),
  `broadcast_error_<category>`
- Consolidation: `consolidate` (with a bucketed amount), `consolidate_eligible`,
  `consolidate_ineligible`, `consolidate_fetch_error`, `consolidate_stale_retry`,
  `consolidate_report_failed`, `consolidate_error_<category>`
- Wallets and addresses: `wallet_created`, `wallet_imported`, `private_key_imported`,
  `gift_card_imported`, `address_switched`
- Website connections and requests: `connection_request`, `connection_established`,
  `connection_disconnected`, `connection_disconnect_all` (with the number of sites),
  `request_approved`, `request_rejected`, `message_signed`, `transaction_signed`, `psbt_signed`,
  `psbt_bundle_signed`, `transaction_broadcasted`, `provider_error`
- Other interface actions: `settings_changed`, `copy_to_clipboard`, `asset_searched`,
  `asset_pinned`, `asset_unpinned`, `buy_bitcoin`, `buy_xcp`, `not_found`

`<category>` is one of `inputs_spent`, `mempool`, `fee`, `signature`, `insufficient_funds`,
`invalid_params`, `network` or `other` (`classifyTransactionError` in `fathom.ts`); error messages
are never sent.

**BTC bucketing:** Amounts are bucketed (dust/micro/tiny/small/medium/large/whale/mega) to understand volume without revealing exact values that could correlate with on-chain data.

## Supply Chain

| Status | Item | Implementation |
|--------|------|----------------|
| ✅ | Exact version pinning | No wildcards in package.json |
| ✅ | Lockfile integrity | package-lock.json with hashes |
| ✅ | npm audit CI | Runs on every PR |
| ✅ | Minimal dependencies | 14 direct runtime deps (most wallets have 50+) |
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
| ✅ | Sequence integrity | Software and hardware signers keep each input's reviewed sequence rather than forcing one; wallet-built UTXO consolidations set 0xfffffffd (RBF) |
| ✅ | Address derivation paths | Standard BIP-44/49/84/86 paths per address format |
| ✅ | Reference transaction fetching | Automatically fetches prev tx data for non-SegWit inputs |
| ✅ | Sidepanel-only access | Hardware wallet features require sidepanel context |
| ✅ | No extension trust required | Compromised extension cannot sign without device |
| ⚠️ | Trezor Suite UX | Every Trezor approval opens in Trezor Suite Web; adds friction but expected for hardware wallet security |
| ⚪ | Ledger support | Future enhancement—interface designed for multi-vendor |

---

## Known Limitations

### JavaScript Memory Clearing

Browser JavaScript cannot guarantee secure memory clearing:
- String immutability may retain original data
- V8 garbage collector timing is non-deterministic
- JIT optimizations may preserve copies

**Mitigation:** Defense-in-depth via short session timeouts (1-30 min configurable), auto-lock on idle, and the 8-hour absolute session cap. Service worker restarts keep the session by design (see [Service Worker Session Persistence](#service-worker-session-persistence)).

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

## Summary

| Category | ✅ | ⚠️ | ❌ | ⚪ |
|----------|-----|-----|-----|-----|
| Cryptography | 9 | 1 | 0 | 3 |
| Session | 6 | 0 | 0 | 2 |
| Password | 3 | 2 | 1 | 0 |
| Extension | 10 | 1 | 0 | 2 |
| Provider API | 19 | 0 | 0 | 0 |
| Transaction | 11 | 0 | 0 | 0 |
| Input Validation | 5 | 0 | 0 | 0 |
| UI/UX | 3 | 0 | 1 | 2 |
| Error Handling | 4 | 0 | 0 | 0 |
| Privacy & Analytics | 8 | 0 | 0 | 2 |
| Supply Chain | 4 | 0 | 0 | 1 |
| Hardware Wallet | 12 | 1 | 0 | 1 |
| **Total** | **94** | **5** | **2** | **13** |

**Gaps (❌):** Password strength meter, screenshot prevention (browser limitation)
