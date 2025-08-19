# XCP Wallet - Counterparty Web3 Browser Extension

A secure, feature-rich browser extension wallet for Bitcoin and Counterparty assets, enabling seamless interaction with the Counterparty ecosystem.

![Version](https://img.shields.io/badge/version-0.0.1-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Chrome](https://img.shields.io/badge/Chrome-Compatible-success)
![Firefox](https://img.shields.io/badge/Firefox-Compatible-success)
![Tests](https://github.com/XCP/extension/actions/workflows/pr-tests.yml/badge.svg)
![Security](https://img.shields.io/badge/vulnerabilities-0-success)

## 🎯 Features

### Core Wallet Features
- **Multi-Wallet Support**: Manage up to 20 wallets with HD (mnemonic) or single private key import
- **Multiple Address Types**: 
  - Legacy (P2PKH) - Traditional Bitcoin addresses
  - Native SegWit (P2WPKH) - Lower fees, better performance
  - Nested SegWit (P2SH-P2WPKH) - Maximum compatibility
  - Taproot (P2TR) - Latest Bitcoin technology
  - Counterwallet - Legacy Counterparty compatibility
- **HD Wallet Management**: Generate up to 100 addresses per wallet
- **Advanced Security**: PBKDF2 + AES-GCM encryption with 420,690 iterations

### Counterparty Features
- **Full Token Support**: Send, receive, and manage XCP and all Counterparty assets
- **Dispenser Integration**: Interact with token dispensers directly
- **Order Management**: Create and manage decentralized exchange orders
- **Asset Information**: Detailed asset metadata and ownership information
- **MPMA Support**: Multi-Party Multi-Asset send capabilities

### User Experience
- **Auto-Lock Security**: Configurable timeout (1m, 5m, 15m, 30m, or disabled)
- **Drag & Drop**: Organize pinned assets with intuitive drag-and-drop
- **QR Codes**: Generate QR codes for easy address sharing
- **Transaction History**: Complete transaction and event history
- **Advanced Search**: Filter and search through assets and balances

### Developer Features
- **Web3 Provider**: EIP-1193-like provider for dApp integration
- **XCP.io Integration**: Automatic provider injection on supported sites
- **Privacy-First Analytics**: Optional Fathom Analytics with consent

## 📦 Installation

### From Browser Store (Coming Soon)
- Chrome Web Store: [Coming Soon]
- Firefox Add-ons: [Coming Soon]

### Manual Installation (Development)

#### Prerequisites
- Node.js 18+ and npm
- Git

#### Build from Source
```bash
# Clone the repository
git clone https://github.com/XCP/extension.git
cd xcp-wallet

# Install dependencies
npm install

# Build for Chrome
npm run build

# Build for Firefox
npm run build:firefox
```

#### Load in Browser

**Chrome/Brave/Edge:**
1. Navigate to `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `.output/chrome-mv3` directory

**Firefox:**
1. Navigate to `about:debugging`
2. Click "This Firefox"
3. Click "Load Temporary Add-on"
4. Select any file in `.output/firefox-mv3` directory

## 🚀 Usage Guide

### Getting Started
1. **Create or Import Wallet**
   - Create new wallet with secure mnemonic phrase
   - Import existing wallet (mnemonic or private key)
   - Choose your preferred address type

2. **Secure Your Wallet**
   - Set a strong password
   - Safely backup your mnemonic phrase
   - Configure auto-lock preferences

3. **Manage Assets**
   - View Bitcoin and token balances
   - Send and receive assets
   - Pin frequently used tokens
   - Track transaction history

### Advanced Features
- **Multiple Addresses**: Generate additional addresses for privacy
- **MPMA Sends**: Send multiple assets to multiple recipients
- **Dispenser Interaction**: Buy tokens from dispensers
- **Order Creation**: Trade on the decentralized exchange

## 👨‍💻 Development

### Tech Stack
- **Framework**: WXT (Web Extension Toolkit)
- **Frontend**: React 19 + TypeScript
- **Styling**: Tailwind CSS v4
- **Build Tool**: Vite
- **Testing**: Vitest + Playwright
- **Routing**: React Router v7

### Development Setup

```bash
# Install dependencies
npm install

# Start development server (Chrome)
npm run dev

# Start development server (Firefox)
npm run dev:firefox

# Run tests
npm test              # All tests
npm run test:unit    # Unit tests only
npm run test:e2e     # E2E tests only

# Type checking
npm run compile

# Build for production
npm run build        # Chrome
npm run build:firefox # Firefox

# Create distribution packages
npm run zip          # Chrome
npm run zip:firefox  # Firefox
```

### Project Structure
```
extension/
├── src/
│   ├── components/       # React components
│   ├── contexts/         # React contexts (7 specialized contexts)
│   ├── entrypoints/      # Extension entry points
│   ├── hooks/            # Custom React hooks
│   ├── pages/           # Route components
│   ├── services/        # Background services
│   └── utils/           # Utilities and helpers
│       ├── blockchain/  # Bitcoin/Counterparty integration
│       ├── encryption/  # Security utilities
│       └── storage/     # Persistent storage
├── e2e/                 # End-to-end tests
├── public/              # Static assets
└── wxt.config.ts        # Extension configuration
```

### Key Development Files
- `CLAUDE.md` - AI assistant instructions and architecture details
- `wxt.config.ts` - Extension manifest and build configuration
- `tailwind.config.js` - Styling configuration
- `vite.config.mts` - Build optimization settings

## 🔒 Security

### Encryption
- **Password Protection**: PBKDF2 key derivation with 420,690 iterations
- **AES-GCM Encryption**: Military-grade encryption for wallet data
- **Memory-Only Secrets**: Decrypted data never written to disk
- **Auto-Lock**: Automatic wallet locking on inactivity

### Best Practices
- Never share your mnemonic phrase or private keys
- Use a strong, unique password
- Enable auto-lock for additional security
- Regularly backup your wallet data
- Verify transaction details before signing

### Security Audits
- Code is open source for community review
- Regular dependency updates
- No external tracking without consent

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### Development Workflow
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add/update tests
5. Ensure all tests pass
6. Submit a pull request

### Code Style
- TypeScript with strict mode
- React functional components
- Tailwind CSS for styling
- Comprehensive test coverage

## 📊 Testing

### Unit Tests
- Framework: Vitest
- Coverage: Encryption, storage, blockchain utilities
- Location: `__tests__` directories alongside source files

### E2E Tests
- Framework: Playwright
- Coverage: User flows, wallet operations
- Location: `/e2e` directory

Run tests:
```bash
npm test              # All tests
npm run test:unit    # Unit tests only
npm run test:e2e     # E2E tests only
```

## 🆘 Support

### Documentation
- [User Guide](docs/user-guide.md) (Coming Soon)
- [Developer Documentation](CLAUDE.md)
- [API Reference](docs/api.md) (Coming Soon)

### Get Help
- [GitHub Issues](https://github.com/XCP/extension/issues)
- [Discord Community](https://discord.gg/counterparty) (Coming Soon)
- [Twitter/X](https://twitter.com/xcpwallet) (Coming Soon)

### Report Issues
Found a bug or have a feature request? Please [open an issue](https://github.com/XCP/extension/issues/new).

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Counterparty](https://counterparty.io/) - The protocol this wallet supports
- [WXT Framework](https://wxt.dev/) - Modern web extension development
- [Bitcoin](https://bitcoin.org/) - The foundation of it all
- Community contributors and testers

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guidelines](https://github.com/XCP/extension/blob/main/CONTRIBUTING.md) for details.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Reporting Issues

Found a bug or have a suggestion? Please [open an issue](https://github.com/XCP/extension/issues) on GitHub.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](https://github.com/XCP/extension/blob/main/LICENSE) file for details.

## ⚠️ Disclaimer

This software is provided "as is" without warranty of any kind. Users are responsible for securing their own wallet data and private keys. Always verify transaction details before signing. This wallet has not been audited - use at your own risk.

## 🔗 Links

- **Repository**: [https://github.com/XCP/extension](https://github.com/XCP/extension)
- **Issues**: [https://github.com/XCP/extension/issues](https://github.com/XCP/extension/issues)
- **Pull Requests**: [https://github.com/XCP/extension/pulls](https://github.com/XCP/extension/pulls)

---

**XCP Wallet** - Empowering the Counterparty ecosystem, one transaction at a time. 🚀
