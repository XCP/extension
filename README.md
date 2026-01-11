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

Not yet independently audited. See [AUDIT.md](AUDIT.md) for our self-reported security feature checklist.

**Key protections:**
- AES-256-GCM encryption with PBKDF2 (600k iterations)
- Local transaction verification (detects malicious API responses)
- Audited crypto libraries ([noble](https://paulmillr.com/noble/) family, Cure53 audited)
- Minimal permissions, MV3 strict CSP, no remote code

**Does not protect against:** compromised OS, malicious extensions with higher privileges, physical access to unlocked device.

Report vulnerabilities via [GitHub Security Advisories](../../security/advisories/new) or see our [bug bounty](SECURITY.md).

## Dependencies

We intentionally minimized runtime dependencies—most wallets ship dozens, we ship 12. What remains is carefully vetted.

| Package | Purpose |
|---------|---------|
| [@noble/curves](https://github.com/paulmillr/noble-curves), [@noble/hashes](https://github.com/paulmillr/noble-hashes), [@scure/*](https://github.com/paulmillr/scure-bip32) | Audited cryptography |
| [bignumber.js](https://github.com/MikeMcl/bignumber.js) | Arbitrary precision arithmetic |
| [react](https://react.dev/), [react-router-dom](https://reactrouter.com/) | UI framework |
| [@headlessui/react](https://headlessui.com/) | Accessible components |
| [webext-bridge](https://github.com/nickytonline/webext-bridge) | Extension messaging |

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
