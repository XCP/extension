# XCP Wallet Distribution v0.0.2

## Downloads

- **Chrome Extension**: `xcp-wallet-chrome-0.0.2.zip`
- **Firefox Extension**: `xcp-wallet-firefox-0.0.2.zip`

## SHA256 Checksums

```
f5cca9d6892242bf0ccfd924b5c620223f3063d9ba44c32839cafe0f247faca3  xcp-wallet-chrome-0.0.2.zip
7ec1d86ac32fede64625fa68abec652c7ac8f7bcc097a0c66f4562c6943531c7  xcp-wallet-firefox-0.0.2.zip
```

## Verification

### Verify SHA256 Checksums

**Linux/Mac:**
```bash
sha256sum xcp-wallet-*.zip
```

**Windows:**
```cmd
certUtil -hashfile xcp-wallet-chrome-0.0.2.zip SHA256
certUtil -hashfile xcp-wallet-firefox-0.0.2.zip SHA256
```

Compare the output with the checksums listed above.

### Build Reproducibility

To verify the build yourself:

```bash
git clone https://github.com/XCP/extension.git
cd extension
git checkout v0.0.2
npm install
npm run dist
```

Then compare your locally generated checksums with the ones above.

## Installation

### Chrome/Chromium Browsers
1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (top right)
3. Click "Load unpacked" or drag the ZIP file
4. Select the extracted extension directory

### Firefox
1. Open Firefox and navigate to `about:debugging`
2. Click "This Firefox"
3. Click "Load Temporary Add-on"
4. Select the ZIP file or manifest file from extracted directory

---
*Generated on: 2025-09-22T17:22:32.536Z*
