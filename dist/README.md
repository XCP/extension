# XCP Wallet Distribution v0.0.1

## Downloads

- **Chrome Extension**: `xcp-wallet-chrome-0.0.1.zip`
- **Firefox Extension**: `xcp-wallet-firefox-0.0.1.zip`

## SHA256 Checksums

```
f5bd97dfb10b3a09f74e9ff1006a5f3aefbdfeb5d93371f0d6d44420308e6b4f  xcp-wallet-chrome-0.0.1.zip
dae68f50ffff5a1d5e9017a6ca08938bf1ea362e48781a755b2daef4b8cc7bc5  xcp-wallet-firefox-0.0.1.zip
```

## Verification

### Verify SHA256 Checksums

**Linux/Mac:**
```bash
sha256sum xcp-wallet-*.zip
```

**Windows:**
```cmd
certUtil -hashfile xcp-wallet-chrome-0.0.1.zip SHA256
certUtil -hashfile xcp-wallet-firefox-0.0.1.zip SHA256
```

Compare the output with the checksums listed above.

### Build Reproducibility

To verify the build yourself:

```bash
git clone https://github.com/XCP/extension.git
cd extension
git checkout v0.0.1
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
*Generated on: 2025-09-21T15:37:42.076Z*
