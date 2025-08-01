import { settingsManager } from '@/utils/wallet/settingsManager';

// Define types for window.fathom and window.currentVirtualPath
declare global {
  interface Window {
    fathom?: {
      trackEvent: (eventId: string, opts?: { _value?: number }) => void;
      trackPageview: (opts?: { url?: string; referrer?: string }) => void;
      setSite: (siteId: string) => void;
    };
    currentVirtualPath?: string; // To store the sanitized path
  }
}

// Fathom configuration constants
const FATHOM_SITE_ID = 'PEMZGNDB';
const TRACKER_URL = 'https://cdn.usefathom.com/';

// Path sanitization mappings
const SENSITIVE_PATH_MAPPINGS: Record<string, string> = {
  '/show-private-key/': '/show-private-key',
  '/show-passphrase/': '/show-passphrase',
  '/remove-wallet/': '/remove-wallet',
  '/balance/': '/balance',
  '/asset/': '/asset',
  '/utxo/': '/utxo',
};

// Sanitize the path based on predefined mappings and patterns
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

// Initialize the Fathom tracker
if (typeof window !== 'undefined') {
  window.fathom = (() => {
  // Helper function to check if analytics is allowed
  async function checkAnalyticsAllowed(): Promise<boolean> {
    const settings = await settingsManager.loadSettings();
    return settings.analyticsAllowed;
  }

  // Encode parameters for tracking URLs
  function encodeParameters(params: Record<string, any>) {
    params.cid = Math.floor(Math.random() * 1e8) + 1;
    return (
      '?' +
      Object.keys(params)
        .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`)
        .join('&')
    );
  }

  // Get the location object, optionally based on a URL
  function getLocation(params: { url?: string } = {}) {
    if (params.url) {
      const location = document.createElement('a');
      location.href = params.url;
      return location;
    }
    return window.location;
  }

  // Send tracking data using an image beacon
  async function send(params: Record<string, any>) {
    const analyticsAllowed = await checkAnalyticsAllowed();
    if (!analyticsAllowed) return;

    const img = document.createElement('img');
    img.setAttribute('alt', '');
    img.setAttribute('aria-hidden', 'true');
    img.style.position = 'absolute';
    img.src = TRACKER_URL + encodeParameters(params);

    img.addEventListener('load', () => img.parentNode?.removeChild(img));
    img.addEventListener('error', () => img.parentNode?.removeChild(img));

    document.body.appendChild(img);
  }

  // Send tracking data using the Beacon API
  async function beacon(params: Record<string, any>) {
    const analyticsAllowed = await checkAnalyticsAllowed();
    if (!analyticsAllowed) return;

    navigator.sendBeacon(TRACKER_URL + encodeParameters(params));
  }

  return {
    /**
     * Track a pageview with an optional URL and referrer.
     * @param params Object containing optional URL and referrer.
     */
    trackPageview: async (params: { url?: string; referrer?: string } = {}) => {
      const analyticsAllowed = await checkAnalyticsAllowed();
      if (!analyticsAllowed) return;

      const location = getLocation(params);
      const hostname = location.protocol + '//' + location.hostname;
      const pathname = sanitizePath(location.pathname) || '/';

      // Update the global currentVirtualPath
      window.currentVirtualPath = pathname;

      send({
        h: hostname,
        p: pathname,
        r: params.referrer && params.referrer.indexOf(hostname) < 0 ? params.referrer : '',
        sid: FATHOM_SITE_ID,
      });
    },

    /**
     * Track an event with a name and optional payload.
     * @param name The event name.
     * @param payload Optional event payload.
     */
    trackEvent: async (name: string, payload: Record<string, any> = {}) => {
      const analyticsAllowed = await checkAnalyticsAllowed();
      if (!analyticsAllowed) return;

      const location = getLocation();
      const hostname = location.protocol + '//' + location.hostname;
      const pathname = window.currentVirtualPath || sanitizePath(location.pathname) || '/';

      beacon({
        name,
        payload: JSON.stringify(payload),
        p: pathname,
        h: hostname,
        r: document.referrer.indexOf(hostname) < 0 ? document.referrer : '',
        sid: FATHOM_SITE_ID,
      });
    },

    /**
     * Set a new site ID.
     * @param siteId The new Fathom site ID.
     */
    setSite: (siteId: string) => {
      // No-op implementation as per original script
    },
  };
  })();
}

// Export tracking functions that check analytics settings
export const trackEvent = async (eventId: string, opts?: { _value?: number }) => {
  if (typeof window === 'undefined') return;
  const settings = await settingsManager.loadSettings();
  if (settings.analyticsAllowed) {
    window.fathom?.trackEvent(eventId, opts);
  }
};

export const trackPageview = async (opts?: { url?: string; referrer?: string }) => {
  if (typeof window === 'undefined') return;
  const settings = await settingsManager.loadSettings();
  if (settings.analyticsAllowed) {
    window.fathom?.trackPageview(opts);
  }
};
