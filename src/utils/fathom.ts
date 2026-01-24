/**
 * Fathom Analytics implementation for XCP Wallet
 * Provides privacy-focused analytics without relying on WXT modules
 *
 * ## Architecture Decision Records
 *
 * ### ADR-016: Privacy-Focused Analytics with Fathom
 *
 * **Context**: We need usage analytics to understand feature usage and error rates,
 * but as a cryptocurrency wallet, user privacy is paramount. Traditional analytics
 * (Google Analytics, Mixpanel) collect identifying information that conflicts with
 * our privacy principles.
 *
 * **Decision**: Use Fathom Analytics with additional privacy safeguards:
 * - Opt-out available: Users can disable in Settings > Advanced
 * - Path sanitization: Dynamic params stripped (wallet IDs, asset names, tx hashes)
 * - No query strings: Empty `qs: {}` sent (no UTM/marketing params)
 * - No referrer: Empty `r: ''` for all events
 * - No persistent IDs: Random `cid` per request (no cookies/localStorage tracking)
 * - BTC bucketing: Transaction values bucketed to prevent on-chain correlation
 * - Self-hosted script: Bundled directly, no third-party JS execution
 * - Firefox 140+: Respects browser's built-in data collection consent
 *
 * **Consequences**:
 * - Cannot track individual user journeys or correlate events across sessions
 * - Limited debugging for user-reported issues (no user context)
 * - Aggregate-only insights (feature usage, error rates, volume buckets)
 * - Aligns with cryptocurrency ecosystem privacy values
 */

import { walletManager } from '@/utils/wallet/walletManager';

// Fathom configuration constants
export const FATHOM_SITE_ID = 'PEMZGNDB';
export const TRACKER_URL = 'https://cdn.usefathom.com/';
export const VIRTUAL_DOMAIN = 'xcp-wallet.ext';

/**
 * Get a privacy-safe bucket for BTC amounts.
 * Returns bucket floor in units of 0.00001 BTC (1000 sats).
 * Divide sum by 100000 to get rough BTC total.
 */
export function getBtcBucket(btcAmount: number): number {
  if (btcAmount < 0.00001) return 0;        // dust: < 1000 sats
  if (btcAmount < 0.0001) return 1;         // micro: 0.00001-0.0001 BTC
  if (btcAmount < 0.001) return 10;         // tiny: 0.0001-0.001 BTC
  if (btcAmount < 0.01) return 100;         // small: 0.001-0.01 BTC
  if (btcAmount < 0.1) return 1000;         // medium: 0.01-0.1 BTC
  if (btcAmount < 1) return 10000;          // large: 0.1-1 BTC
  if (btcAmount < 10) return 100000;        // whale: 1-10 BTC
  return 1000000;                           // mega: > 10 BTC
}

// Path sanitization mappings - strips dynamic params to protect privacy
// All routes with :params must be listed here or handled by generic handlers below
const SENSITIVE_PATH_MAPPINGS: Record<string, string> = {
  // Wallet management (contain wallet IDs, address paths)
  '/wallet/show-private-key/': '/wallet/show-private-key',
  '/wallet/show-passphrase/': '/wallet/show-passphrase',
  '/wallet/remove/': '/wallet/remove',

  // Viewing pages (contain asset names, tx hashes, UTXOs)
  '/assets/': '/assets',
  '/utxo/': '/utxo',
  '/transaction/': '/transaction',

  // Market pages (contain asset names)
  '/market/dispensers/': '/market/dispensers',
  '/market/orders/': '/market/orders',
};

/**
 * Sanitize the path to remove sensitive information like wallet IDs, asset names, etc.
 * This ensures user privacy while still tracking page views.
 */
export const sanitizePath = (path: string): string => {
  // Check for sensitive paths
  for (const [prefix, replacement] of Object.entries(SENSITIVE_PATH_MAPPINGS)) {
    if (path.startsWith(prefix)) {
      return replacement;
    }
  }

  // Handle action paths
  if (path.startsWith('/actions/')) {
    const pathParts = path.split('/').filter(Boolean);
    if (pathParts.length > 2) {
      return `/${pathParts[0]}/${pathParts[1]}`;
    }
  }

  // Handle compose paths
  if (path.startsWith('/compose/')) {
    const pathParts = path.split('/').filter(Boolean);
    if (pathParts.length > 2) {
      return `/${pathParts[0]}/${pathParts[1]}`;
    }
  }

  return path;
};

/**
 * Check if we're in an extension context with browser APIs available.
 * Real Chrome extension IDs are 32-char alphanumeric strings.
 * Test environments (fakeBrowser) use short IDs like 'test-extension-id'.
 */
const isExtensionContext = (): boolean => {
  if (typeof browser === 'undefined' || browser?.runtime?.id === undefined) {
    return false;
  }

  // Real extension IDs are 32-char alphanumeric (e.g., 'abcdefghijklmnopqrstuvwxyz123456')
  // fakeBrowser uses 'test-extension-id' which is shorter and contains hyphens
  const runtimeId = browser.runtime.id;
  if (runtimeId.length < 32) {
    return false;
  }

  return true;
};

/**
 * Check if Firefox's built-in data collection consent system is available
 * and whether the user has granted the technicalAndInteraction permission.
 * Returns: true if granted, false if denied, null if not available (Chrome/older Firefox)
 */
async function checkFirefoxDataCollectionPermission(): Promise<boolean | null> {
  try {
    const perms = await browser.permissions.getAll();
    // data_collection key only exists in Firefox 140+ with built-in consent
    if (!('data_collection' in perms)) {
      return null; // Not available, fall back to settings
    }
    // Check if technicalAndInteraction was granted
    const dataCollection = (perms as { data_collection?: string[] }).data_collection;
    return dataCollection?.includes('technicalAndInteraction') ?? false;
  } catch {
    return null; // API not available
  }
}

/**
 * Get analytics settings from storage
 * Returns false if we can't access storage (e.g., in injected scripts)
 *
 * On Firefox 140+: Uses Firefox's built-in data collection consent
 * On Chrome/older Firefox: Uses our analyticsAllowed setting
 */
async function isAnalyticsEnabled(): Promise<boolean> {
  if (!isExtensionContext()) {
    return false;
  }

  try {
    // First check Firefox's built-in consent system (Firefox 140+)
    const firefoxPermission = await checkFirefoxDataCollectionPermission();
    if (firefoxPermission !== null) {
      // Firefox has built-in consent - use that permission
      return firefoxPermission;
    }

    // Fall back to our settings (Chrome and older Firefox)
    const settings = walletManager.getSettings();
    return settings.analyticsAllowed;
  } catch (error) {
    // If we can't get settings, don't track
    if (process.env.NODE_ENV === 'development') {
      console.debug('Failed to get analytics settings:', error);
    }
    return false;
  }
}

/**
 * Encode parameters for tracking URLs
 */
function encodeParameters(params: Record<string, any>): string {
  params.cid = Math.floor(Math.random() * 1e8) + 1;
  return '?' + Object.keys(params)
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`)
    .join('&');
}

/**
 * Send tracking data to Fathom
 */
async function sendToFathom(params: Record<string, any>): Promise<void> {
  const enabled = await isAnalyticsEnabled();
  if (!enabled) {
    return;
  }

  const url = TRACKER_URL + encodeParameters(params);

  try {
    // Try using sendBeacon first (preferred for analytics)
    if (navigator.sendBeacon) {
      navigator.sendBeacon(url);
    } else {
      // Fallback to fetch for older browsers
      await fetch(url, {
        method: 'GET',
        mode: 'no-cors',
        credentials: 'omit',
      });
    }
  } catch (error) {
    // Silently fail - analytics should never break the app
    if (process.env.NODE_ENV === 'development') {
      console.debug('Analytics send failed:', error);
    }
  }
}

/**
 * Analytics API compatible with WXT analytics module interface
 * This can be used as a drop-in replacement for #analytics
 */
export const analytics = {
  /**
   * Track a page view
   * @param path - The path to track (will be sanitized)
   */
  async page(path: string): Promise<void> {
    if (!isExtensionContext()) {
      return;
    }

    const sanitizedPath = sanitizePath(path);
    await sendToFathom({
      h: `https://${VIRTUAL_DOMAIN}`,
      p: sanitizedPath,
      r: '', // No referrer for extension pages
      sid: FATHOM_SITE_ID,
      qs: JSON.stringify({}),
    });
  },

  /**
   * Track a custom event
   * @param eventName - The name of the event to track
   * @param value - Optional numeric value (e.g., count, BTC bucket)
   */
  async track(eventName: string, value?: number): Promise<void> {
    if (!isExtensionContext()) {
      return;
    }

    await sendToFathom({
      name: eventName,
      payload: value !== undefined ? JSON.stringify({ value }) : JSON.stringify({}),
      p: '/',
      h: `https://${VIRTUAL_DOMAIN}`,
      r: '',
      sid: FATHOM_SITE_ID,
      qs: JSON.stringify({}),
    });
  },

  /**
   * Identify a user (not supported by Fathom, no-op)
   */
  async identify(): Promise<void> {
    // Fathom doesn't support user identification
  },
};

// Legacy exports for backward compatibility
export const trackEvent = async (eventId: string, opts?: { _value?: number }) => {
  await analytics.track(eventId, opts?._value);
};

export const trackPageview = async (opts?: { url?: string; referrer?: string }) => {
  await analytics.page(opts?.url || '/');
};

// Export a no-op version for non-extension contexts
export const noopAnalytics = {
  page: async () => {},
  track: async () => {},
  identify: async () => {},
};

// Default export based on context
export default isExtensionContext() ? analytics : noopAnalytics;