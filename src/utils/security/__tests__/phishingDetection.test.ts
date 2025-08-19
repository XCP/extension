import { describe, it, expect, vi, beforeEach } from 'vitest';
import { 
  analyzePhishingRisk, 
  shouldBlockConnection, 
  getPhishingWarning,
  updateTrustedDomains,
  updateBlockedDomains,
  getTrustedDomains,
  getBlockedDomains,
  removeTrustedDomain,
  removeBlockedDomain,
  loadDomainLists
} from '../phishingDetection';

// Mock fathom tracking
vi.mock('@/utils/fathom', () => ({
  trackEvent: vi.fn()
}));

// Mock fetch for loadDomainLists tests
global.fetch = vi.fn();

describe('phishingDetection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('analyzePhishingRisk', () => {
    it('should identify trusted domains as safe', () => {
      const analysis = analyzePhishingRisk('https://xcp.io');
      
      expect(analysis.isSuspicious).toBe(false);
      expect(analysis.isBlocked).toBe(false);
      expect(analysis.isTrusted).toBe(true);
      expect(analysis.riskLevel).toBe('trusted');
      expect(analysis.message).toContain('verified trusted domain');
    });

    it('should identify blocked domains as dangerous', () => {
      const analysis = analyzePhishingRisk('https://xcpf0lio.com');
      
      expect(analysis.isSuspicious).toBe(true);
      expect(analysis.isBlocked).toBe(true);
      expect(analysis.isTrusted).toBe(false);
      expect(analysis.riskLevel).toBe('blocked');
      expect(analysis.message).toContain('phishing blocklist');
    });

    it('should identify unknown domains', () => {
      const analysis = analyzePhishingRisk('https://example.com');
      
      expect(analysis.isSuspicious).toBe(false);
      expect(analysis.isBlocked).toBe(false);
      expect(analysis.isTrusted).toBe(false);
      expect(analysis.riskLevel).toBe('unknown');
      expect(analysis.message).toContain('not on the trusted list');
    });

    it('should handle invalid URLs gracefully', () => {
      const analysis = analyzePhishingRisk('not-a-valid-url');
      
      expect(analysis.isSuspicious).toBe(true);
      expect(analysis.isBlocked).toBe(false);
      expect(analysis.isTrusted).toBe(false);
      expect(analysis.riskLevel).toBe('unknown');
      expect(analysis.message).toContain('Invalid URL format');
    });

    it('should be case-insensitive', () => {
      const analysis1 = analyzePhishingRisk('https://XCP.IO');
      const analysis2 = analyzePhishingRisk('https://xcp.io');
      
      expect(analysis1.isTrusted).toBe(true);
      expect(analysis2.isTrusted).toBe(true);
    });
  });

  describe('shouldBlockConnection', () => {
    it('should block blocked domains', async () => {
      const shouldBlock = await shouldBlockConnection('https://xcpf0lio.com');
      expect(shouldBlock).toBe(true);
    });

    it('should not block trusted domains', async () => {
      const shouldBlock = await shouldBlockConnection('https://xcp.io');
      expect(shouldBlock).toBe(false);
    });

    it('should not block unknown domains', async () => {
      const shouldBlock = await shouldBlockConnection('https://example.com');
      expect(shouldBlock).toBe(false);
    });
  });

  describe('getPhishingWarning', () => {
    it('should return null for trusted domains', () => {
      const warning = getPhishingWarning('https://xcp.io');
      expect(warning).toBe(null);
    });

    it('should return severe warning for blocked domains', () => {
      const warning = getPhishingWarning('https://xcpf0lio.com');
      
      expect(warning).toBeTruthy();
      expect(warning).toContain('SECURITY WARNING');
      expect(warning).toContain('phishing blocklist');
      expect(warning).toContain('Do not connect');
    });

    it('should return mild warning for unknown domains', () => {
      const warning = getPhishingWarning('https://example.com');
      
      expect(warning).toBeTruthy();
      expect(warning).toContain('Unknown Domain');
      expect(warning).toContain('not on our trusted list');
      expect(warning).toContain('verify the URL carefully');
    });
  });

  describe('domain list management', () => {
    it('should add trusted domains', () => {
      const initialCount = getTrustedDomains().length;
      updateTrustedDomains(['newsite.com', 'anothersite.org']);
      
      const domains = getTrustedDomains();
      expect(domains.length).toBe(initialCount + 2);
      expect(domains).toContain('newsite.com');
      expect(domains).toContain('anothersite.org');
      
      // Should now be trusted
      const analysis = analyzePhishingRisk('https://newsite.com');
      expect(analysis.isTrusted).toBe(true);
    });

    it('should add blocked domains', () => {
      const initialCount = getBlockedDomains().length;
      updateBlockedDomains(['phishing1.com', 'phishing2.net']);
      
      const domains = getBlockedDomains();
      expect(domains.length).toBe(initialCount + 2);
      expect(domains).toContain('phishing1.com');
      expect(domains).toContain('phishing2.net');
      
      // Should now be blocked
      const analysis = analyzePhishingRisk('https://phishing1.com');
      expect(analysis.isBlocked).toBe(true);
    });

    it('should normalize domain names', () => {
      updateTrustedDomains(['  UPPERCASE.COM  ', 'trailing-space.com ']);
      
      const domains = getTrustedDomains();
      expect(domains).toContain('uppercase.com');
      expect(domains).toContain('trailing-space.com');
    });

    it('should remove trusted domains', () => {
      updateTrustedDomains(['removeme.com']);
      expect(getTrustedDomains()).toContain('removeme.com');
      
      const removed = removeTrustedDomain('removeme.com');
      expect(removed).toBe(true);
      expect(getTrustedDomains()).not.toContain('removeme.com');
    });

    it('should remove blocked domains', () => {
      updateBlockedDomains(['removebad.com']);
      expect(getBlockedDomains()).toContain('removebad.com');
      
      const removed = removeBlockedDomain('removebad.com');
      expect(removed).toBe(true);
      expect(getBlockedDomains()).not.toContain('removebad.com');
    });

    it('should return false when removing non-existent domain', () => {
      const removed = removeTrustedDomain('nonexistent.com');
      expect(removed).toBe(false);
    });
  });

  describe('loadDomainLists', () => {
    beforeEach(() => {
      (global.fetch as any).mockReset();
    });

    it('should load domain lists from remote endpoint', async () => {
      const mockData = {
        trusted: ['remote-trusted1.com', 'remote-trusted2.com'],
        blocked: ['remote-blocked1.com', 'remote-blocked2.com']
      };
      
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockData
      });
      
      await loadDomainLists('https://example.com/domains.json');
      
      expect(getTrustedDomains()).toContain('remote-trusted1.com');
      expect(getTrustedDomains()).toContain('remote-trusted2.com');
      expect(getBlockedDomains()).toContain('remote-blocked1.com');
      expect(getBlockedDomains()).toContain('remote-blocked2.com');
    });

    it('should handle fetch errors gracefully', async () => {
      (global.fetch as any).mockRejectedValueOnce(new Error('Network error'));
      
      // Should not throw
      await expect(loadDomainLists('https://example.com/domains.json')).resolves.toBeUndefined();
    });

    it('should handle invalid response gracefully', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false
      });
      
      // Should not throw
      await expect(loadDomainLists('https://example.com/domains.json')).resolves.toBeUndefined();
    });

    it('should skip loading when no endpoint provided', async () => {
      await loadDomainLists();
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should handle partial data', async () => {
      const mockData = {
        trusted: ['only-trusted.com']
        // No blocked array
      };
      
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockData
      });
      
      await loadDomainLists('https://example.com/domains.json');
      
      expect(getTrustedDomains()).toContain('only-trusted.com');
    });
  });

  describe('domain list sorting', () => {
    it('should return trusted domains in alphabetical order', () => {
      updateTrustedDomains(['zebra.com', 'apple.com', 'mango.com']);
      const domains = getTrustedDomains();
      
      expect(domains.indexOf('apple.com')).toBeLessThan(domains.indexOf('mango.com'));
      expect(domains.indexOf('mango.com')).toBeLessThan(domains.indexOf('zebra.com'));
    });

    it('should return blocked domains in alphabetical order', () => {
      updateBlockedDomains(['zebra.bad', 'apple.bad', 'mango.bad']);
      const domains = getBlockedDomains();
      
      expect(domains.indexOf('apple.bad')).toBeLessThan(domains.indexOf('mango.bad'));
      expect(domains.indexOf('mango.bad')).toBeLessThan(domains.indexOf('zebra.bad'));
    });
  });
});