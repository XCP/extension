# Manifest Configuration Recommendations

## Current Manifest Analysis

### Current Configuration (from wxt.config.ts)
```json
{
  "name": "XCP Wallet",
  "permissions": [
    "sidePanel",
    "storage",
    "tabs",
    "activeTab",
    "alarms"
  ],
  "web_accessible_resources": [
    {
      "resources": ["injected.js"],
      "matches": ["<all_urls>"]
    }
  ]
}
```

## Recommended Manifest Additions

### 1. ✅ **Add Required Store Metadata**
```json
{
  "description": "Secure non-custodial wallet for Bitcoin and Counterparty assets",
  "version": "0.0.1",
  "icons": {
    "16": "icon-16.png",
    "48": "icon-48.png",
    "128": "icon-128.png"
  },
  "homepage_url": "https://github.com/XCP/extension"
}
```
**Why**: Required by both Chrome and Firefox for store listings.

### 2. ✅ **Add Short Name**
```json
{
  "short_name": "XCP"
}
```
**Why**: Displays in space-constrained areas (max 12 chars). Better than truncated "XCP Wallet".

### 3. ✅ **Add Minimum Chrome Version**
```json
{
  "minimum_chrome_version": "102"
}
```
**Why**: Ensures users have a compatible version. MV3 requires Chrome 88+, but we should target 102+ for stable APIs.

### 4. ✅ **Add Firefox-Specific Settings**
```json
{
  "browser_specific_settings": {
    "gecko": {
      "id": "xcpwallet@xcp.io",
      "strict_min_version": "109.0"
    }
  }
}
```
**Why**: Firefox requires this for consistent extension ID and version compatibility.

### 5. ⚠️ **Consider Host Permissions (Currently Missing)**
```json
{
  "host_permissions": [
    "https://counterpartycore.io/*",
    "https://mempool.space/*",
    "https://xcp.io/*"
  ]
}
```
**Why**: More secure than broad permissions. Users see exactly which sites you access.
**Note**: May require refactoring if dynamic API endpoints are used.

### 6. ✅ **Add Incognito Mode Setting**
```json
{
  "incognito": "not_allowed"
}
```
**Why**: Wallets shouldn't run in incognito mode for security (no persistent storage).

### 7. ✅ **Add Commands for Keyboard Shortcuts**
```json
{
  "commands": {
    "_execute_action": {
      "suggested_key": {
        "default": "Alt+Shift+X"
      }
    },
    "toggle-lock": {
      "suggested_key": {
        "default": "Alt+L"
      },
      "description": "Lock/unlock wallet"
    }
  }
}
```
**Why**: Improves accessibility and power user experience.

## Permissions Analysis

### Current Permissions Review

| Permission | Required? | Justification | Recommendation |
|------------|-----------|--------------|----------------|
| `storage` | ✅ Yes | Store encrypted wallets | Keep |
| `tabs` | ⚠️ Maybe | dApp connection management | Consider replacing with `activeTab` only |
| `activeTab` | ✅ Yes | Current tab interaction | Keep |
| `alarms` | ✅ Yes | Service worker keep-alive | Keep |
| `sidePanel` | ⚠️ Optional | UI enhancement | Keep but mark as optional |

### Recommended Permission Changes

1. **Remove `tabs` if possible**
   - `activeTab` is more privacy-friendly
   - Only grants access when user actively clicks extension
   - Test if dApp connections work with just `activeTab`

2. **Consider Optional Permissions**
```json
{
  "optional_permissions": [
    "sidePanel"
  ]
}
```
**Why**: Let users choose enhanced features without blocking core functionality.

## Security Enhancements

### 1. ✅ **Add Content Security Policy**
```json
{
  "content_security_policy": {
    "extension_pages": "script-src 'self'; object-src 'none'; base-uri 'none';"
  }
}
```
**Why**: Prevents XSS attacks and injection vulnerabilities.

### 2. ✅ **Restrict Web Accessible Resources**
Current:
```json
{
  "web_accessible_resources": [
    {
      "resources": ["injected.js"],
      "matches": ["<all_urls>"]  // Too broad!
    }
  ]
}
```

Recommended:
```json
{
  "web_accessible_resources": [
    {
      "resources": ["injected.js"],
      "matches": [
        "https://*.xcp.io/*",
        "http://localhost/*",
        "http://127.0.0.1/*"
      ]
    }
  ]
}
```
**Why**: Limits exposure of extension resources to only necessary domains.

## Complete Recommended Manifest Updates

Add to `wxt.config.ts`:

```typescript
export default defineConfig({
  manifest: {
    name: "XCP Wallet",
    short_name: "XCP",
    description: "Secure non-custodial wallet for Bitcoin and Counterparty assets",
    version: "0.0.1",
    homepage_url: "https://github.com/XCP/extension",
    
    icons: {
      "16": "icon-16.png",
      "48": "icon-48.png",
      "128": "icon-128.png"
    },
    
    permissions: [
      "storage",
      "activeTab",
      "alarms"
    ],
    
    optional_permissions: [
      "sidePanel"
    ],
    
    host_permissions: [
      "https://counterpartycore.io/*",
      "https://mempool.space/*"
    ],
    
    web_accessible_resources: [
      {
        resources: ["injected.js"],
        matches: [
          "https://*.xcp.io/*",
          "http://localhost/*",
          "http://127.0.0.1/*"
        ]
      }
    ],
    
    content_security_policy: {
      extension_pages: "script-src 'self'; object-src 'none'; base-uri 'none';"
    },
    
    incognito: "not_allowed",
    minimum_chrome_version: "102",
    
    browser_specific_settings: {
      gecko: {
        id: "xcpwallet@xcp.io",
        strict_min_version: "109.0"
      }
    },
    
    commands: {
      "_execute_action": {
        suggested_key: {
          default: "Alt+Shift+X"
        }
      }
    }
  }
});
```

## Implementation Priority

### High Priority (Required for Store)
1. Add description, version, icons
2. Add homepage_url
3. Fix web_accessible_resources scope
4. Add browser_specific_settings for Firefox

### Medium Priority (Security/UX)
1. Add content_security_policy
2. Set incognito mode
3. Add minimum browser versions
4. Consider host_permissions

### Low Priority (Nice to Have)
1. Add keyboard shortcuts
2. Move sidePanel to optional
3. Add short_name

## Testing Checklist

After implementing changes:
- [ ] Extension loads in Chrome 102+
- [ ] Extension loads in Firefox 109+
- [ ] dApp connections work on xcp.io
- [ ] Content script doesn't inject on unrelated sites
- [ ] Storage operations work correctly
- [ ] Service worker stays alive
- [ ] Icons display correctly at all sizes
- [ ] Store metadata displays properly

## Notes

1. **Version Numbering**: Follow semantic versioning (major.minor.patch)
2. **Icon Requirements**: Need 16x16, 48x48, and 128x128 PNG files
3. **Firefox ID**: Use consistent ID format (extension@domain)
4. **CSP Testing**: Test thoroughly as it can break functionality
5. **Permission Justification**: Document why each permission is needed for store review