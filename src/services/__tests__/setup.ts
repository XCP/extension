import { vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing';

// Setup fake browser before any imports that use browser APIs
fakeBrowser.runtime.onConnect = {
  addListener: vi.fn(),
  removeListener: vi.fn(),
  hasListener: vi.fn()
} as any;

fakeBrowser.runtime.onMessage = {
  addListener: vi.fn(),
  removeListener: vi.fn(),
  hasListener: vi.fn()
} as any;

fakeBrowser.runtime.getURL = vi.fn((path: string) => `chrome-extension://test/${path}`);
fakeBrowser.runtime.getManifest = vi.fn(() => ({ 
  version: '1.0.0',
  manifest_version: 3,
  name: 'Test Extension'
})) as any;

fakeBrowser.windows.create = vi.fn().mockResolvedValue({});
fakeBrowser.windows.update = vi.fn().mockResolvedValue({});
fakeBrowser.windows.onRemoved = {
  addListener: vi.fn(),
  removeListener: vi.fn()
} as any;

fakeBrowser.tabs.onRemoved = {
  addListener: vi.fn()
} as any;
fakeBrowser.tabs.onUpdated = {
  addListener: vi.fn()
} as any;

fakeBrowser.action.setBadgeText = vi.fn().mockResolvedValue(undefined);
fakeBrowser.action.setBadgeBackgroundColor = vi.fn().mockResolvedValue(undefined);

// Assign to global browser
(global as any).browser = fakeBrowser;
(global as any).chrome = fakeBrowser;

// Mock navigator for tests
(global as any).navigator = {
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  sendBeacon: vi.fn()
};