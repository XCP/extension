/**
 * Fathom Analytics implementation for XCP Wallet
 * Provides privacy-focused analytics without relying on WXT modules
 */

import { getKeychainSettings } from '@/utils/storage/settingsStorage';

// Fathom configuration constants
export const FATHOM_SITE_ID = 'PEMZGNDB';
export const TRACKER_URL = 'https://cdn.usefathom.com/';
export const VIRTUAL_DOMAIN = 'xcp-wallet.ext';

// Path sanitization mappings
const SENSITIVE_PATH_MAPPINGS: Record<string, string> = {
  '/show-private-key/': '/show-private-key',
  '/show-passphrase/': '/show-passphrase',
  '/remove-wallet/': '/remove-wallet',
  '/balance/': '/balance',
  '/asset/': '/asset',
  '/utxo/': '/utxo',
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
 * Check if we're in an extension context with browser APIs available
 */
const isExtensionContext = (): boolean => {
  return typeof browser !== 'undefined' && browser?.runtime?.id !== undefined;
};

/**
 * Get analytics settings from storage
 * Returns false if we can't access storage (e.g., in injected scripts)
 */
async function isAnalyticsEnabled(): Promise<boolean> {
  if (!isExtensionContext()) {
    return false;
  }

  try {
    const settings = await getKeychainSettings();
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
   * @param properties - Optional properties to include with the event
   */
  async track(eventName: string, properties?: { value?: string; [key: string]: any }): Promise<void> {
    if (!isExtensionContext()) {
      return;
    }

    const payload: Record<string, any> = {
      name: eventName,
      p: '/', // Default path for events
      h: `https://${VIRTUAL_DOMAIN}`,
      r: '',
      sid: FATHOM_SITE_ID,
      qs: JSON.stringify({}),
    };

    // Include event properties if provided
    if (properties && Object.keys(properties).length > 0) {
      payload.payload = JSON.stringify(properties);
    }

    await sendToFathom(payload);
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
  await analytics.track(eventId, { value: opts?._value?.toString() });
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