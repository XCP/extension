# Store Compliance Analysis for XCP Wallet Extension

This document analyzes our extension's compliance with Chrome Web Store and Firefox Add-on Store policies for Web3 wallets.

## Compliance Summary

| Requirement | Chrome | Firefox | Status | Notes |
|------------|--------|---------|--------|-------|
| MV3/Self-contained build | ✅ Required | ✅ Required | ✅ **PASS** | All code bundled, no remote execution |
| Minimum permissions | ✅ Required | ✅ Required | ✅ **PASS** | Only essential permissions requested |
| Privacy policy | ✅ Required | ✅ Required | ⚠️ **NEEDS WORK** | Need to add privacy policy URL |
| No browsing history collection | ✅ Required | ✅ Required | ✅ **PASS** | No history access requested |
| No cryptomining | ✅ Required | ✅ Required | ✅ **PASS** | Wallet only, no mining code |
| Security basics (HTTPS) | ✅ Required | ✅ Required | ✅ **PASS** | All APIs use HTTPS |
| Reviewable source (Firefox) | N/A | ✅ Required | ✅ **PASS** | Source ZIP generated with build |
| Clear disclaimers | ✅ Required | ✅ Required | ⚠️ **NEEDS WORK** | Add non-custodial disclaimers |

## Detailed Analysis

### ✅ FULLY COMPLIANT AREAS

#### 1. No Remote Code Execution (MV3 Compliant)
**Status**: PASS
- No `eval()` or `Function()` constructor usage found
- No dynamic script loading from CDNs
- All JavaScript bundled in the extension package
- No `innerHTML` or `document.write` for script injection
- Content script properly uses `injectScript()` for local files only

#### 2. No Cryptomining
**Status**: PASS
- "Fairminter" references are for Counterparty protocol fair minting (token distribution)
- No actual mining code, hashrate calculations, or mining pools
- Only wallet and token management functionality

#### 3. Minimum Permissions
**Status**: PASS
- **Current permissions**:
  - `storage`: Required for wallet data persistence
  - `tabs`: Required for dApp connection management
  - `activeTab`: Required for current tab interaction
  - `alarms`: Required for service worker keep-alive
  - `sidePanel`: Optional UI enhancement
- All permissions are justified for core wallet functionality

#### 4. Self-Contained Build
**Status**: PASS
- Uses WXT build system with Vite
- All dependencies bundled at build time
- No runtime fetching of executable code
- Firefox source ZIP automatically generated

#### 5. Security Implementation
**Status**: PASS
- **Encryption**: PBKDF2 (420,690 iterations) + AES-GCM
- **HTTPS only**: All API calls use HTTPS (counterpartycore.io, mempool.space)
- **Client-side keys**: Private keys never leave the device
- **No external key storage**: Keys stored encrypted locally only

#### 6. No Browsing History Collection
**Status**: PASS
- No `history` permission requested
- No `webNavigation` permission requested
- No tracking of user browsing activity
- Content script limited to user-initiated connections

### ⚠️ AREAS NEEDING IMPROVEMENT

#### 1. Privacy Policy
**Status**: NEEDS WORK
**Required Actions**:
1. Create comprehensive privacy policy covering:
   - Fathom Analytics usage (already privacy-focused)
   - API calls to blockchain services
   - Local storage of encrypted wallet data
   - No personal data collection
2. Host privacy policy on GitHub Pages or project website
3. Add privacy policy URL to:
   - Extension manifest
   - Store listings
   - In-app settings page

#### 2. Clear Disclaimers
**Status**: NEEDS WORK
**Required Actions**:
1. Add prominent disclaimers in:
   - Store listing description
   - First-run experience
   - Transaction confirmation screens
2. Required disclaimer text:
   - "This is a non-custodial wallet - you control your keys"
   - "Network fees apply to all transactions"
   - "Not a bank or financial institution"
   - "Transactions are irreversible"
   - "Beta software - use at your own risk"

#### 3. Analytics Consent
**Status**: GOOD (but can improve)
**Current Implementation**:
- Fathom Analytics with path sanitization
- No personal data collection
- Privacy-first analytics

**Improvements**:
1. Add explicit opt-in during onboarding
2. Make analytics toggle more prominent in settings
3. Document analytics in privacy policy

### ✅ STORE-SPECIFIC REQUIREMENTS

#### Chrome Web Store
1. **User Data "Limited Use"**: ✅ COMPLIANT
   - Only collect wallet-specific data
   - No browsing activity collection
   - Clear user-facing features

2. **No Deceptive UI**: ✅ COMPLIANT
   - Clear wallet interface
   - Standard Web3 patterns
   - No misleading claims

#### Firefox Add-on Store
1. **Reviewable Source**: ✅ COMPLIANT
   - `npm run zip:firefox` generates source ZIP
   - Build instructions in README
   - All dependencies in package.json

2. **Clear Data Consent**: ✅ COMPLIANT
   - Local storage only
   - Encrypted data
   - No external data transmission without user action

## Implementation Checklist

### Immediate Actions Required

- [ ] **Create Privacy Policy**
  ```markdown
  # Privacy Policy for XCP Wallet
  
  ## Data Collection
  - No personal information collected
  - Wallet data encrypted locally
  - Optional analytics (Fathom) with consent
  
  ## Third-Party Services
  - Counterparty API: Blockchain data only
  - Mempool.space: Fee estimation
  - No data sold or shared
  ```

- [ ] **Update Manifest**
  ```json
  {
    "homepage_url": "https://github.com/XCP/extension",
    "privacy_policy": "https://github.com/XCP/extension/blob/main/PRIVACY.md"
  }
  ```

- [ ] **Add Disclaimers to UI**
  - Onboarding: Non-custodial wallet warning
  - Send page: Transaction irreversibility warning
  - Settings: Beta software disclaimer

### Store Listing Requirements

#### Chrome Web Store Description Template
```
XCP Wallet - Counterparty Web3 Browser Extension

⚠️ IMPORTANT: This is a non-custodial wallet. You are responsible for your keys and funds.

Features:
✓ Secure Bitcoin & Counterparty asset management
✓ Built-in DEX access
✓ Hardware wallet support (coming soon)
✓ Open source and auditable

Security:
• Your keys never leave your device
• Military-grade encryption (PBKDF2 + AES-GCM)
• No tracking or personal data collection
• All network calls use HTTPS

Disclaimer:
This extension is beta software. Transactions are irreversible. We are not a bank or financial institution. Network fees apply to all transactions. Use at your own risk.

Privacy:
Optional analytics via Fathom (privacy-first). See our privacy policy for details.
```

#### Firefox Add-on Description
(Similar to Chrome, with emphasis on open source and privacy)

## Compliance Maintenance

### Regular Audits
1. **Before each release**:
   - Run permission audit
   - Check for new remote code
   - Verify HTTPS usage
   - Update privacy policy if needed

2. **Dependency Updates**:
   - Review new dependencies for compliance
   - Check for analytics or tracking code
   - Verify no mining libraries

3. **Code Review Checklist**:
   - [ ] No `eval()` or `Function()` usage
   - [ ] No remote script loading
   - [ ] All APIs use HTTPS
   - [ ] Permissions match functionality
   - [ ] Privacy policy current

## Firefox Source Code Submission

### Build Instructions for Reviewers
```bash
# Install dependencies
npm install

# Build for Firefox
npm run build:firefox

# Create distribution ZIP
npm run zip:firefox

# The source code ZIP is automatically created
```

### Source ZIP Contents
- All source files (src/)
- Build configuration (vite.config.mts, wxt.config.ts)
- Package files (package.json, package-lock.json)
- Build instructions (README.md)
- Excludes: node_modules, test files, .git

## Risk Assessment

### Low Risk
- Open source code
- Standard wallet functionality
- No monetization
- No ads or tracking

### Medium Risk
- Beta software status
- Blockchain interaction
- Financial application

### Mitigation
- Clear warnings and disclaimers
- Comprehensive testing
- Regular security audits
- Responsive support

## Conclusion

The XCP Wallet extension is largely compliant with both Chrome and Firefox store policies. The main requirements are:

1. **Add privacy policy** (required)
2. **Add clear disclaimers** (required)
3. **Document analytics consent** (recommended)

Once these items are addressed, the extension should pass store review without issues.