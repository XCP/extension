import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sanitizePath, trackEvent, trackPageview } from '../fathom';

// Mock the settings manager
vi.mock('@/utils/wallet/settingsManager', () => ({
  settingsManager: {
    loadSettings: vi.fn().mockResolvedValue({ analyticsAllowed: true }),
  },
}));

describe('fathom utilities', () => {
  let originalWindow: any;
  let originalDocument: any;

  beforeEach(() => {
    // Store original globals
    originalWindow = global.window;
    originalDocument = global.document;
    
    // jsdom environment is already set up by Vitest
    // Just need to ensure document.body exists
    document.body.innerHTML = '<div></div>';
    
    // Mock Image constructor
    global.Image = class MockImage {
      src = '';
      alt = '';
      style: any = { position: '' };
      listeners: { [key: string]: Function[] } = {};
      parentNode = {
        removeChild: vi.fn(),
      };
      
      setAttribute(name: string, value: string) {
        (this as any)[name] = value;
      }
      
      addEventListener(event: string, handler: Function) {
        if (!this.listeners[event]) {
          this.listeners[event] = [];
        }
        this.listeners[event].push(handler);
      }
      
      trigger(event: string) {
        if (this.listeners[event]) {
          this.listeners[event].forEach(handler => handler());
        }
      }
    } as any;

    // Mock navigator.sendBeacon
    global.navigator.sendBeacon = vi.fn().mockReturnValue(true);
    
    // Reinitialize fathom by re-importing the module
    vi.resetModules();
  });

  afterEach(() => {
    // Restore original globals
    global.window = originalWindow;
    global.document = originalDocument;
    global.navigator = originalWindow?.navigator;
    vi.clearAllMocks();
    
    // Clean up document
    document.body.innerHTML = '';
  });

  describe('sanitizePath', () => {
    it('should sanitize sensitive paths', () => {
      expect(sanitizePath('/show-private-key/wallet-123')).toBe('/show-private-key');
      expect(sanitizePath('/show-passphrase/some-id')).toBe('/show-passphrase');
      expect(sanitizePath('/remove-wallet/wallet-456')).toBe('/remove-wallet');
      expect(sanitizePath('/balance/address-789')).toBe('/balance');
      expect(sanitizePath('/asset/PEPECASH')).toBe('/asset');
      expect(sanitizePath('/utxo/utxo-id')).toBe('/utxo');
    });

    it('should sanitize action paths', () => {
      expect(sanitizePath('/actions/consolidate/review')).toBe('/actions/consolidate');
      expect(sanitizePath('/actions/sign-message/extra/params')).toBe('/actions/sign-message');
    });

    it('should sanitize compose paths', () => {
      expect(sanitizePath('/compose/send/btc/review')).toBe('/compose/send');
      expect(sanitizePath('/compose/order/form/extra')).toBe('/compose/order');
    });

    it('should return original path for non-sensitive paths', () => {
      expect(sanitizePath('/dashboard')).toBe('/dashboard');
      expect(sanitizePath('/settings')).toBe('/settings');
      expect(sanitizePath('/')).toBe('/');
      expect(sanitizePath('/wallet')).toBe('/wallet');
    });

    it('should handle edge cases', () => {
      expect(sanitizePath('')).toBe('');
      expect(sanitizePath('/actions/')).toBe('/actions/');
      expect(sanitizePath('/compose/')).toBe('/compose/');
      expect(sanitizePath('/actions/single')).toBe('/actions/single');
    });
  });

  describe('window.fathom integration', () => {
    beforeEach(async () => {
      // Re-import to get fresh fathom initialization
      await import('../fathom');
    });

    it('should initialize window.fathom object', () => {
      expect(window.fathom).toBeDefined();
      expect(window.fathom?.trackEvent).toBeDefined();
      expect(window.fathom?.trackPageview).toBeDefined();
      expect(window.fathom?.setSite).toBeDefined();
    });

    it('should track pageview with sanitized path', async () => {
      const { settingsManager } = await import('@/utils/wallet/settingsManager');
      vi.mocked(settingsManager.loadSettings).mockResolvedValue({ analyticsAllowed: true } as any);
      
      const appendChildSpy = vi.spyOn(document.body, 'appendChild');
      
      // Set location
      Object.defineProperty(window, 'location', {
        value: {
          protocol: 'https:',
          hostname: 'example.com',
          pathname: '/balance/bc1qtest123',
        },
        writable: true,
      });

      await window.fathom?.trackPageview();

      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(appendChildSpy).toHaveBeenCalled();
      const img = appendChildSpy.mock.calls[0][0] as any;
      expect(img.src).toContain('sid=PEMZGNDB');
      expect(img.src).toContain('p=%2Fbalance'); // Sanitized path
      expect(img.src).not.toContain('bc1qtest123'); // Sensitive data removed
    });

    it('should track event with current virtual path', async () => {
      const { settingsManager } = await import('@/utils/wallet/settingsManager');
      vi.mocked(settingsManager.loadSettings).mockResolvedValue({ analyticsAllowed: true } as any);
      
      const sendBeaconSpy = vi.spyOn(navigator, 'sendBeacon');
      
      // Set virtual path
      window.currentVirtualPath = '/dashboard';
      
      await window.fathom?.trackEvent('button_click', { button: 'submit' } as any);

      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(sendBeaconSpy).toHaveBeenCalled();
      const url = sendBeaconSpy.mock.calls[0][0] as string;
      expect(url).toContain('name=button_click');
      expect(url).toContain('p=%2Fdashboard');
      expect(url).toContain('payload=%7B%22button%22%3A%22submit%22%7D');
    });

    it('should not track when analytics is disabled', async () => {
      const { settingsManager } = await import('@/utils/wallet/settingsManager');
      vi.mocked(settingsManager.loadSettings).mockResolvedValue({ analyticsAllowed: false } as any);
      
      const appendChildSpy = vi.spyOn(document.body, 'appendChild');
      const sendBeaconSpy = vi.spyOn(navigator, 'sendBeacon');
      
      await window.fathom?.trackPageview();
      await window.fathom?.trackEvent('test_event');

      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(appendChildSpy).not.toHaveBeenCalled();
      expect(sendBeaconSpy).not.toHaveBeenCalled();
    });

    it('should handle referrer correctly', async () => {
      const { settingsManager } = await import('@/utils/wallet/settingsManager');
      vi.mocked(settingsManager.loadSettings).mockResolvedValue({ analyticsAllowed: true } as any);
      
      const appendChildSpy = vi.spyOn(document.body, 'appendChild');
      
      Object.defineProperty(window, 'location', {
        value: {
          protocol: 'https:',
          hostname: 'example.com',
          pathname: '/',
        },
        writable: true,
      });

      await window.fathom?.trackPageview({ referrer: 'https://google.com' });

      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 0));

      const img = appendChildSpy.mock.calls[0][0] as any;
      expect(img.src).toContain('r=https%3A%2F%2Fgoogle.com');
    });

    it('should not include same-site referrer', async () => {
      const { settingsManager } = await import('@/utils/wallet/settingsManager');
      vi.mocked(settingsManager.loadSettings).mockResolvedValue({ analyticsAllowed: true } as any);
      
      const appendChildSpy = vi.spyOn(document.body, 'appendChild');
      
      Object.defineProperty(window, 'location', {
        value: {
          protocol: 'https:',
          hostname: 'example.com',
          pathname: '/',
        },
        writable: true,
      });

      await window.fathom?.trackPageview({ referrer: 'https://example.com/other-page' });

      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 0));

      const img = appendChildSpy.mock.calls[0][0] as any;
      expect(img.src).toContain('r='); // Should have empty referrer parameter
      expect(img.src).toContain('h=https%3A%2F%2Fexample.com'); // Should have hostname in h parameter
      // Check that referrer parameter is empty (no referrer value after r=)
      expect(img.src).toMatch(/r=(&|$)/);
    });
  });

  describe('exported tracking functions', () => {
    it('should call window.fathom.trackEvent when analytics is allowed', async () => {
      const { settingsManager } = await import('@/utils/wallet/settingsManager');
      vi.mocked(settingsManager.loadSettings).mockResolvedValue({ analyticsAllowed: true } as any);
      
      // Re-import to get fresh module
      const fathomModule = await import('../fathom');
      
      window.fathom = {
        trackEvent: vi.fn(),
        trackPageview: vi.fn(),
        setSite: vi.fn(),
      };

      await fathomModule.trackEvent('test_event', { _value: 100 });

      expect(window.fathom.trackEvent).toHaveBeenCalledWith('test_event', { _value: 100 });
    });

    it('should not call window.fathom.trackEvent when analytics is disabled', async () => {
      const { settingsManager } = await import('@/utils/wallet/settingsManager');
      vi.mocked(settingsManager.loadSettings).mockResolvedValue({ analyticsAllowed: false } as any);
      
      // Re-import to get fresh module
      const fathomModule = await import('../fathom');
      
      window.fathom = {
        trackEvent: vi.fn(),
        trackPageview: vi.fn(),
        setSite: vi.fn(),
      };

      await fathomModule.trackEvent('test_event');

      expect(window.fathom.trackEvent).not.toHaveBeenCalled();
    });

    it('should call window.fathom.trackPageview when analytics is allowed', async () => {
      const { settingsManager } = await import('@/utils/wallet/settingsManager');
      vi.mocked(settingsManager.loadSettings).mockResolvedValue({ analyticsAllowed: true } as any);
      
      // Re-import to get fresh module
      const fathomModule = await import('../fathom');
      
      window.fathom = {
        trackEvent: vi.fn(),
        trackPageview: vi.fn(),
        setSite: vi.fn(),
      };

      await fathomModule.trackPageview({ url: '/test' });

      expect(window.fathom.trackPageview).toHaveBeenCalledWith({ url: '/test' });
    });

    it('should handle undefined window gracefully', async () => {
      const originalWindow = global.window;
      delete (global as any).window;
      
      // Re-import to test undefined window
      vi.resetModules();
      const fathomModule = await import('../fathom');
      
      // Should not throw
      await expect(fathomModule.trackEvent('test')).resolves.not.toThrow();
      await expect(fathomModule.trackPageview()).resolves.not.toThrow();
      
      global.window = originalWindow;
    });
  });

  describe('Image beacon cleanup', () => {
    it('should attach load and error event listeners to image', async () => {
      const { settingsManager } = await import('@/utils/wallet/settingsManager');
      vi.mocked(settingsManager.loadSettings).mockResolvedValue({ analyticsAllowed: true } as any);
      
      // Re-import to initialize fathom
      await import('../fathom');
      
      const appendChildSpy = vi.spyOn(document.body, 'appendChild');
      
      Object.defineProperty(window, 'location', {
        value: {
          protocol: 'https:',
          hostname: 'example.com',
          pathname: '/',
        },
        writable: true,
      });

      await window.fathom?.trackPageview();
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(appendChildSpy).toHaveBeenCalled();
      const img = appendChildSpy.mock.calls[0][0] as any;
      
      // Verify the image has the correct attributes
      expect(img.getAttribute('alt')).toBe('');
      expect(img.getAttribute('aria-hidden')).toBe('true');
      expect(img.style.position).toBe('absolute');
      expect(img.src).toContain('https://cdn.usefathom.com/');
      
      // Verify the image was appended to the body
      expect(appendChildSpy).toHaveBeenCalledWith(img);
    });

    it('should set up tracking URL with correct parameters', async () => {
      const { settingsManager } = await import('@/utils/wallet/settingsManager');
      vi.mocked(settingsManager.loadSettings).mockResolvedValue({ analyticsAllowed: true } as any);
      
      // Re-import to initialize fathom
      await import('../fathom');
      
      const appendChildSpy = vi.spyOn(document.body, 'appendChild');
      
      Object.defineProperty(window, 'location', {
        value: {
          protocol: 'https:',
          hostname: 'example.com',
          pathname: '/test/path',
        },
        writable: true,
      });

      await window.fathom?.trackPageview({ referrer: 'https://google.com' });
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(appendChildSpy).toHaveBeenCalled();
      const img = appendChildSpy.mock.calls[0][0] as any;
      
      expect(img.src).toContain('h=https%3A%2F%2Fexample.com');
      expect(img.src).toContain('p=%2Ftest%2Fpath');
      expect(img.src).toContain('r=https%3A%2F%2Fgoogle.com');
      expect(img.src).toContain('sid=PEMZGNDB');
      expect(img.src).toContain('cid='); // Should have a client ID
    });
  });
});