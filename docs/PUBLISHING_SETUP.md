# Extension Publishing Setup Guide

This guide will help you set up automated publishing for your browser extension to Chrome Web Store and Firefox Add-on Store.

## Prerequisites

1. Have your extension listed on the stores (first-time listing must be done manually)
2. GitHub repository with Actions enabled
3. API credentials for each store you want to publish to

## Setting Up Store Credentials

### Chrome Web Store

1. **Get your Extension ID**:
   - Go to [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/developer/dashboard)
   - Find your extension and copy its ID

2. **Create OAuth2 Credentials**:
   - Follow [this guide](https://github.com/fregante/chrome-webstore-upload/blob/main/How%20to%20generate%20Google%20API%20keys.md)
   - You'll need:
     - Client ID
     - Client Secret
     - Refresh Token

### Firefox Add-on Store

1. **Get your Extension ID**:
   - Go to [Firefox Add-on Developer Hub](https://addons.mozilla.org/en-US/developers/addons)
   - Find your add-on and copy its ID (or GUID)

2. **Generate API Credentials**:
   - Visit [API Key Management](https://addons.mozilla.org/en-US/developers/addon/api/key/)
   - Generate new credentials
   - Save the JWT Issuer and JWT Secret

## GitHub Repository Setup

### 1. Add Secrets to GitHub

Go to your repository's Settings → Secrets and variables → Actions, and add:

**Chrome Web Store:**
- `CHROME_EXTENSION_ID`
- `CHROME_CLIENT_ID`
- `CHROME_CLIENT_SECRET`
- `CHROME_REFRESH_TOKEN`

**Firefox Add-on Store:**
- `FIREFOX_EXTENSION_ID`
- `FIREFOX_JWT_ISSUER`
- `FIREFOX_JWT_SECRET`

### 2. Local Development Setup

For local testing, create a `.env.submit` file (copy from `.env.submit.example`):

```bash
cp .env.submit.example .env.submit
```

Fill in your credentials in `.env.submit`. This file is git-ignored for security.

## Running the Publishing Workflow

### Manual Trigger via GitHub UI

1. Go to Actions tab in your GitHub repository
2. Select "Publish Extension" workflow
3. Click "Run workflow"
4. Configure options:
   - **Dry Run**: Test without actually submitting (recommended for first run)
   - **Publish Chrome**: Enable/disable Chrome Web Store submission
   - **Publish Firefox**: Enable/disable Firefox submission

### Local Testing

Test the submission process locally:

```bash
# Dry run (recommended first)
npx wxt submit init  # Interactive setup
npx wxt submit --dry-run

# Actual submission
npm run build
npm run zip
npm run zip:firefox
npx wxt submit \
  --chrome-zip .output/*-chrome.zip \
  --firefox-zip .output/*-firefox.zip \
  --firefox-sources-zip .output/*-sources.zip
```

## Troubleshooting

### Chrome Web Store Issues
- Ensure your OAuth app has the Chrome Web Store API enabled
- Refresh token expires after 6 months of inactivity
- Check that your extension ID matches exactly

### Firefox Add-on Issues
- Source code ZIP is required for minified/bundled code
- Ensure your build is reproducible
- Check that all dependencies are included in sources

## Best Practices

1. **Always do a dry run first** when setting up or after making changes
2. **Version your extension properly** in manifest.json before publishing
3. **Test locally** before running the GitHub Action
4. **Keep your secrets secure** - never commit them to the repository
5. **Monitor the workflow logs** for any warnings or errors
6. **Update your release notes** on each store after publishing

## Additional Resources

- [WXT Publishing Documentation](https://wxt.dev/guide/publishing.html)
- [Chrome Web Store API](https://developer.chrome.com/docs/webstore/using_webstore_api/)
- [Firefox Add-on Submission API](https://extensionworkshop.com/documentation/develop/web-ext-command-reference/#web-ext-sign)