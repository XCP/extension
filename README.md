# XCP Wallet

Browser extension wallet for Counterparty on Bitcoin.

[![Chrome Web Store](https://img.shields.io/chrome-web-store/v/nicpjdbehgcjbjfjkobcidnfmfpijohg?label=Chrome%20Web%20Store)](https://chromewebstore.google.com/detail/xcp-wallet/nicpjdbehgcjbjfjkobcidnfmfpijohg)
[![Chrome Web Store Users](https://img.shields.io/chrome-web-store/users/nicpjdbehgcjbjfjkobcidnfmfpijohg)](https://chromewebstore.google.com/detail/xcp-wallet/nicpjdbehgcjbjfjkobcidnfmfpijohg)
[![Chrome Web Store Rating](https://img.shields.io/chrome-web-store/rating/nicpjdbehgcjbjfjkobcidnfmfpijohg)](https://chromewebstore.google.com/detail/xcp-wallet/nicpjdbehgcjbjfjkobcidnfmfpijohg)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## Features

- Multiple wallets and address types (SegWit, Taproot, Legacy)
- Send/receive BTC and Counterparty assets
- Create dispensers and DEX orders
- Provide liquidity to AMM pools (deposit/withdraw)
- UTXO consolidation
- Issue and manage assets
- ZELD balances and sends, and an optional, time-limited ZELD hunt when you sign a transaction
- Connect to dApps via [provider API](PROVIDER.md)
- Marketplace signing for connected sites: listings, offers and purchases, each proved against the
  transaction before it is shown for approval
- BIP-322 message signing
- Hardware wallet support (Trezor)

XCP Wallet is built for Chrome (Chromium).

## Install

[**Chrome Web Store**](https://chromewebstore.google.com/detail/xcp-wallet/nicpjdbehgcjbjfjkobcidnfmfpijohg)

### Trezor

Trezor support uses Trezor Connect, which shows every device approval in Trezor Suite Web
(`suite.trezor.io`). The first time you use a Trezor, Chrome asks you to allow the wallet to access
`suite.trezor.io`. The wallet does not ask for it at install or update, and works without it if
you never use a Trezor.

## Security

Not yet independently audited. See [AUDIT.md](AUDIT.md) for our self-reported security feature checklist.

**Key protections:**
- AES-256-GCM encryption with PBKDF2 (600k iterations)
- Local transaction verification (detects malicious API responses)
- Audited crypto libraries ([noble](https://paulmillr.com/noble/) family, Cure53 audited)
- Minimal permissions, MV3 strict CSP, no remote code
- Hardware wallet support: private keys never leave device

**Does not protect against:** compromised OS, malicious extensions with higher privileges, physical access to unlocked device.

Report vulnerabilities privately through
[GitHub Security Advisories](https://github.com/XCP/extension/security/advisories/new). The bug
bounty is currently paused; see [SECURITY.md](SECURITY.md) for scope and what to send as an issue
or pull request instead.

## Dependencies

The wallet has 13 direct runtime dependencies, pinned to exact versions in `package.json`.

| Package | Purpose |
|---------|---------|
| [@noble/secp256k1](https://github.com/paulmillr/noble-secp256k1), [@noble/hashes](https://github.com/paulmillr/noble-hashes), [@scure/*](https://github.com/paulmillr/scure-bip32) | Cryptography and Bitcoin serialization |
| [@trezor/connect-webextension](https://github.com/trezor/trezor-suite) | Hardware wallet connection |
| [events](https://github.com/browserify/events) | Node's `EventEmitter` for the browser, required by Trezor Connect 10 |
| [bignumber.js](https://github.com/MikeMcl/bignumber.js) | Arbitrary precision arithmetic |
| [react](https://react.dev/), [react-dom](https://react.dev/), [react-router](https://reactrouter.com/) | UI framework |
| [@headlessui/react](https://headlessui.com/) | Accessible components |

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, building, testing, translations and releases,
and [ARCHITECTURE.md](ARCHITECTURE.md) for the code map, trust boundaries, and signing lifecycle.

## Languages

XCP Wallet follows the browser's language: English, Japanese, Simplified Chinese, and
Traditional Chinese (Taiwan and Hong Kong). There is no language setting in the wallet;
change Chrome's language to switch. Anything missing falls back to English.

The Japanese and Chinese text is machine-translated and has not yet been reviewed by
native speakers. Corrections are welcome; see
[CONTRIBUTING.md](CONTRIBUTING.md#languages) for how to change or review a translation.

## Community

[Telegram](https://t.me/xcpwallet) for support, feedback, and discussion.

## License

MIT
