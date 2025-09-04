import { defineAnalyticsProvider } from '@wxt-dev/analytics';

// Fathom configuration constants
export const FATHOM_SITE_ID = 'PEMZGNDB';
export const TRACKER_URL = 'https://cdn.usefathom.com/';

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
 * Fathom Analytics Provider Options
 */
export interface FathomProviderOptions {
  siteId: string;
  domain: string;
  trackerUrl?: string;
}

/**
 * Custom Fathom Analytics provider for WXT Analytics module.
 * Implements the Fathom API for browser extensions with path sanitization.
 */
export const fathom = defineAnalyticsProvider<FathomProviderOptions>(
  (_, config, options) => {
    const trackerUrl = options.trackerUrl || TRACKER_URL;
    
    // Helper to encode parameters for tracking URLs
    const encodeParameters = (params: Record<string, any>) => {
      params.cid = Math.floor(Math.random() * 1e8) + 1;
      return '?' + Object.keys(params)
        .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`)
        .join('&');
    };

    // Send tracking data using the Beacon API
    const send = async (params: Record<string, any>) => {
      if (config.debug) {
        console.debug('[@wxt-dev/analytics] Sending event to Fathom:', params);
      }
      
      const url = trackerUrl + encodeParameters(params);
      
      // Try using sendBeacon first (preferred for analytics)
      if (navigator.sendBeacon) {
        navigator.sendBeacon(url);
      } else {
        // Fallback to fetch for older browsers
        await fetch(url, {
          method: 'GET',
          mode: 'no-cors',
          credentials: 'omit',
        }).catch(err => {
          if (config.debug) {
            console.error('[@wxt-dev/analytics] Failed to send to Fathom:', err);
          }
        });
      }
    };

    return {
      identify: () => Promise.resolve(), // Fathom doesn't support user identification
      
      page: async (event) => {
        // For extensions, we use a virtual domain since they run on chrome-extension://
        const hostname = `https://${options.domain}`;
        // The 'location' field contains the string passed to analytics.page()
        // The 'url' field contains the actual location.href (chrome-extension://...)
        const pathname = sanitizePath(event.page.location || event.page.url || '/');
        
        await send({
          h: hostname,
          p: pathname,
          r: event.meta.referrer ? sanitizePath(event.meta.referrer) : '',
          sid: options.siteId,
          qs: JSON.stringify({}),
        });
      },
      
      track: async (event) => {
        // Fathom uses a different endpoint for events
        const hostname = `https://${options.domain}`;
        // Sanitize the pathname to remove sensitive information
        const pathname = sanitizePath(event.meta.url || '/');
        
        // Map event properties to Fathom's format
        const payload: Record<string, any> = {
          name: event.event.name,
          p: pathname,
          h: hostname,
          r: event.meta.referrer ? sanitizePath(event.meta.referrer) : '',
          sid: options.siteId,
        };
        
        // Include event properties as JSON payload
        if (event.event.properties && Object.keys(event.event.properties).length > 0) {
          payload.payload = JSON.stringify(event.event.properties);
        }
        
        // Add query string data if available
        payload.qs = JSON.stringify({});
        
        await send(payload);
      },
    };
  },
);