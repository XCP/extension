# XCP Wallet

Browser extension wallet for Counterparty on Bitcoin.

[![Chrome Web Store](https://img.shields.io/chrome-web-store/v/nicpjdbehgcjbjfjkobcidnfmfpijohg?label=Chrome%20Web%20Store)](https://chromewebstore.google.com/detail/xcp-wallet/nicpjdbehgcjbjfjkobcidnfmfpijohg)
[![Chrome Web Store Users](https://img.shields.io/chrome-web-store/users/nicpjdbehgcjbjfjkobcidnfmfpijohg)](https://chromewebstore.google.com/detail/xcp-wallet/nicpjdbehgcjbjfjkobcidnfmfpijohg)
[![Chrome Web Store Rating](https://img.shields.io/chrome-web-store/rating/nicpjdbehgcjbjfjkobcidnfmfpijohg)](https://chromewebstore.google.com/detail/xcp-wallet/nicpjdbehgcjbjfjkobcidnfmfpijohg)
[![CI](https://github.com/XCP/extension/actions/workflows/pr-tests.yml/badge.svg)](https://github.com/XCP/extension/actions/workflows/pr-tests.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## Features

- Multiple wallets and address types (SegWit, Taproot, Legacy)
- Send/receive BTC and Counterparty assets
- Create dispensers and DEX orders
- Provide liquidity to AMM pools (deposit/withdraw)
- UTXO consolidation
- Issue and manage assets
- Connect to dApps via [provider API](PROVIDER.md)
- BIP-322 message signing
- Hardware wallet support (Trezor)

## Install

[**Chrome Web Store**](https://chromewebstore.google.com/detail/xcp-wallet/nicpjdbehgcjbjfjkobcidnfmfpijohg)

## Security

Not yet independently audited. See [AUDIT.md](AUDIT.md) for our self-reported security feature checklist.

**Key protections:**
- AES-256-GCM encryption with PBKDF2 (600k iterations)
- Local transaction verification (detects malicious API responses)
- Audited crypto libraries ([noble](https://paulmillr.com/noble/) family, Cure53 audited)
- Minimal permissions, MV3 strict CSP, no remote code
- Hardware wallet support: private keys never leave device

**Does not protect against:** compromised OS, malicious extensions with higher privileges, physical access to unlocked device.

Report vulnerabilities via [GitHub Security Advisories](../../security/advisories/new) or see our [bug bounty](SECURITY.md).

## Dependencies

We intentionally minimized runtime dependencies—most wallets ship dozens, we ship 14. What remains is carefully vetted.

| Package | Purpose |
|---------|---------|
| [@noble/curves](https://github.com/paulmillr/noble-curves), [@noble/hashes](https://github.com/paulmillr/noble-hashes), [@scure/*](https://github.com/paulmillr/scure-bip32) | Audited cryptography |
| [bignumber.js](https://github.com/MikeMcl/bignumber.js) | Arbitrary precision arithmetic |
| [react](https://react.dev/), [react-router](https://reactrouter.com/) | UI framework |
| [@headlessui/react](https://headlessui.com/) | Accessible components |
| [webext-bridge](https://github.com/nickytonline/webext-bridge) | Extension messaging |

## Development

```bash
npm install        # plain install — never --legacy-peer-deps, it prunes @testing-library/dom
npm run dev        # Chrome
npm run dev:firefox
```

After changing `package.json` or `package-lock.json`, run:

```bash
npm run check:lockfile
```

CI installs with `npm ci`, which builds from the lockfile alone and fails if it
does not record everything the tree needs. `lint`, `compile` and the test suite
all run against your existing `node_modules`, so they pass either way — this is
the only local check that catches a lockfile drift before CI does.

## Build

```bash
npm run build      # Production build
npm run zip        # Create extension ZIP
```

## Release

```bash
npm version X.Y.Z --no-git-tag-version   # bumps package.json AND package-lock.json
npm run zip                              # .output/xcp-wallet-X.Y.Z-chrome.zip
```

Bump with `npm version`, not by editing `package.json`. The lockfile records the version
too, and CI builds from the lockfile alone.

The Chrome Web Store package is uploaded manually through the developer dashboard. Note
that a new submission replaces any pending review rather than queueing behind it, so check
that the previous version has published before uploading the next one.

## Test

```bash
npm test           # All tests
npm run test:unit  # Unit only
npm run test:e2e   # E2E only
```

## Community

[Telegram](https://t.me/xcpwallet) for support, feedback, and discussion.

## License

MIT
