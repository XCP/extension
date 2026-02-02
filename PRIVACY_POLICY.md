# Privacy Policy

**Effective Date:** February 2, 2025
**Last Updated:** February 2, 2025

Family Media LLC d.b.a. 21e14 Labs ("we," "us," or "our") operates the XCP Wallet browser extension ("the Extension"). This Privacy Policy explains how we collect, use, and protect your information when you use our Extension.

## Summary

XCP Wallet is a self-custodial cryptocurrency wallet. **Your private keys and recovery phrases never leave your device.** We do not have access to your funds, cannot recover your wallet, and cannot reverse transactions.

## Information We Collect

### Information Stored Locally on Your Device

The following data is stored **only on your device** and is **never transmitted** to our servers or any third party:

- **Encrypted Wallet Data:** Recovery phrases and private keys are encrypted using AES-256-GCM encryption before being stored in your browser's local storage. We cannot access this data.
- **Authentication Information:** Your wallet password is used to encrypt/decrypt your wallet data locally. We never receive or store your password.
- **User Preferences:** Settings such as currency display preferences, auto-lock timeout duration, and UI preferences.
- **Approved dApp Connections:** A list of websites you have authorized to connect to your wallet, which you can revoke at any time in Settings.

### Information We Do Not Collect

We do **not** collect, store, or transmit:

- Your private keys or recovery phrases
- Your wallet password
- Your transaction history
- Your IP address (through the Extension)
- Browsing history or web activity
- Keystrokes, form inputs, or page content
- Personal identification information

## Browser Permissions

The Extension requires certain browser permissions to function. Here is how each permission is used:

| Permission | Purpose |
|------------|---------|
| **sidePanel** | Provides a persistent wallet interface that remains open while you browse Counterparty dApps, allowing you to monitor your portfolio and manage transactions without repeatedly reopening the wallet. |
| **storage** | Stores your encrypted wallet data and preferences locally on your device. All sensitive data is encrypted before storage. No data is synced or transmitted externally. |
| **tabs** | Routes dApp request/response messages to the correct browser tab. Used only to identify the requesting tab and deliver approval results. No page titles, URLs, or browsing history are collected. |
| **alarms** | Enables auto-lock after user-configured inactivity (1–30 minutes) and schedules periodic refresh tasks (e.g., updating displayed prices) when the wallet UI is open. No background activity is performed for tracking. |
| **Host permissions** | Injects the minimal `window.xcp` provider API for dApp connectivity. The Extension does NOT read page content, keystrokes, or form fields. Each site must be explicitly approved by you before it can request addresses or signatures. |

## Website Analytics

For our marketing website (not the Extension), we use [Fathom Analytics](https://usefathom.com), a privacy-focused analytics service that:

- Does not use cookies
- Does not collect personal data
- Complies with GDPR, ePrivacy (including PECR), COPPA, and CCPA
- Only briefly processes IP addresses, which are then discarded
- Makes it impossible for us to identify individual visitors

The purpose of using Fathom Analytics is to understand our website traffic in the most privacy-friendly way possible so we can improve our website and services. The lawful basis under GDPR is "Article 6(1)(f)" (legitimate interests to improve our website and business). No personal data is stored over time.

**The Extension allows you to opt-out of anonymous analytics under Advanced Settings.**

## Third-Party Services

The Extension connects to the following external services to function:

- **Counterparty API servers:** To fetch your wallet balances, transaction history, and broadcast signed transactions to the network.
- **Bitcoin network nodes:** To retrieve Bitcoin blockchain data and broadcast Bitcoin transactions.
- **Price data providers:** To display current cryptocurrency prices (optional feature).

These connections transmit only the minimum data necessary (such as your public addresses) to retrieve blockchain information. Your private keys are never transmitted.

## Data Security

We implement security measures to protect your data:

- **Encryption:** All sensitive wallet data is encrypted with AES-256-GCM before storage.
- **Local Storage Only:** Your encrypted data is stored only in your browser's local storage and is never transmitted to external servers.
- **Auto-Lock:** The wallet automatically locks after a configurable period of inactivity.
- **No Remote Code:** The Extension does not load or execute any remote code.

## Data Sharing

We do **not** sell, trade, or transfer your data to third parties.

We do **not** use your data for:
- Advertising or marketing purposes
- Determining creditworthiness
- Lending purposes
- Any purpose unrelated to the Extension's core functionality

## Your Rights

You have full control over your data:

- **Access:** All your wallet data is stored locally on your device and can be viewed within the Extension.
- **Export:** You can export your recovery phrase at any time to back up or migrate your wallet.
- **Deletion:** You can delete all Extension data by removing the Extension from your browser or clearing its storage in browser settings.
- **dApp Permissions:** You can view and revoke website permissions at any time in the Extension's Settings.

## Children's Privacy

The Extension is not intended for use by children under 13 years of age. We do not knowingly collect information from children under 13.

## Changes to This Policy

We may update this Privacy Policy from time to time. We will notify you of any changes by updating the "Last Updated" date at the top of this policy. We encourage you to review this Privacy Policy periodically.

## Contact Us

If you have questions about this Privacy Policy or our privacy practices, please contact us at:

**Family Media LLC d.b.a. 21e14 Labs**
Email: privacy@21e14.com

## Compliance

This Privacy Policy is designed to comply with:

- General Data Protection Regulation (GDPR)
- California Consumer Privacy Act (CCPA)
- Children's Online Privacy Protection Act (COPPA)
- ePrivacy Directive (including PECR)

---

*This privacy policy was last reviewed on February 2, 2025.*
