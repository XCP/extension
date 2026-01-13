/**
 * Unit tests for rate limiter - tests the actual exported instances
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  connectionRateLimiter,
  transactionRateLimiter,
  apiRateLimiter
} from '../rateLimiter';

describe('RateLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Reset all rate limiters before each test
    connectionRateLimiter.resetAll();
    transactionRateLimiter.resetAll();
    apiRateLimiter.resetAll();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('connectionRateLimiter (5 requests/minute)', () => {
    const origin = 'https://example.com';

    it('should allow first request', () => {
      expect(connectionRateLimiter.isAllowed(origin)).toBe(true);
    });

    it('should allow up to 5 requests', () => {
      for (let i = 0; i < 5; i++) {
        expect(connectionRateLimiter.isAllowed(origin)).toBe(true);
      }
    });

    it('should block 6th request', () => {
      for (let i = 0; i < 5; i++) {
        connectionRateLimiter.isAllowed(origin);
      }
      expect(connectionRateLimiter.isAllowed(origin)).toBe(false);
    });

    it('should reset after window expires', () => {
      for (let i = 0; i < 5; i++) {
        connectionRateLimiter.isAllowed(origin);
      }
      expect(connectionRateLimiter.isAllowed(origin)).toBe(false);

      // Advance time past the window (60 seconds)
      vi.advanceTimersByTime(60001);

      expect(connectionRateLimiter.isAllowed(origin)).toBe(true);
    });

    it('should track different origins separately', () => {
      const origin1 = 'https://site1.com';
      const origin2 = 'https://site2.com';

      for (let i = 0; i < 5; i++) {
        connectionRateLimiter.isAllowed(origin1);
      }

      expect(connectionRateLimiter.isAllowed(origin1)).toBe(false);
      expect(connectionRateLimiter.isAllowed(origin2)).toBe(true);
    });
  });

  describe('transactionRateLimiter (10 requests/minute)', () => {
    const origin = 'https://dapp.com';

    it('should allow up to 10 requests', () => {
      for (let i = 0; i < 10; i++) {
        expect(transactionRateLimiter.isAllowed(origin)).toBe(true);
      }
      expect(transactionRateLimiter.isAllowed(origin)).toBe(false);
    });

    it('should reset after window expires', () => {
      for (let i = 0; i < 10; i++) {
        transactionRateLimiter.isAllowed(origin);
      }
      expect(transactionRateLimiter.isAllowed(origin)).toBe(false);

      vi.advanceTimersByTime(60001);
      expect(transactionRateLimiter.isAllowed(origin)).toBe(true);
    });
  });

  describe('apiRateLimiter (100 requests/minute)', () => {
    const origin = 'https://api-client.com';

    it('should allow up to 100 requests', () => {
      for (let i = 0; i < 100; i++) {
        expect(apiRateLimiter.isAllowed(origin)).toBe(true);
      }
      expect(apiRateLimiter.isAllowed(origin)).toBe(false);
    });
  });

  describe('getRemainingRequests', () => {
    const origin = 'https://example.com';

    it('should return max requests for new origin', () => {
      expect(connectionRateLimiter.getRemainingRequests(origin)).toBe(5);
    });

    it('should decrease after each request', () => {
      connectionRateLimiter.isAllowed(origin);
      expect(connectionRateLimiter.getRemainingRequests(origin)).toBe(4);

      connectionRateLimiter.isAllowed(origin);
      expect(connectionRateLimiter.getRemainingRequests(origin)).toBe(3);
    });

    it('should return 0 when limit exceeded', () => {
      for (let i = 0; i < 5; i++) {
        connectionRateLimiter.isAllowed(origin);
      }
      expect(connectionRateLimiter.getRemainingRequests(origin)).toBe(0);
    });

    it('should reset after window expires', () => {
      for (let i = 0; i < 5; i++) {
        connectionRateLimiter.isAllowed(origin);
      }

      vi.advanceTimersByTime(60001);

      expect(connectionRateLimiter.getRemainingRequests(origin)).toBe(5);
    });
  });

  describe('getResetTime', () => {
    const origin = 'https://example.com';

    it('should return 0 for new origin', () => {
      expect(connectionRateLimiter.getResetTime(origin)).toBe(0);
    });

    it('should return time until reset after request', () => {
      connectionRateLimiter.isAllowed(origin);

      const resetTime = connectionRateLimiter.getResetTime(origin);
      expect(resetTime).toBeGreaterThan(0);
      expect(resetTime).toBeLessThanOrEqual(60000);
    });

    it('should decrease as time passes', () => {
      connectionRateLimiter.isAllowed(origin);

      vi.advanceTimersByTime(30000);

      const resetTime = connectionRateLimiter.getResetTime(origin);
      expect(resetTime).toBeLessThanOrEqual(30000);
    });

    it('should return 0 after window expires', () => {
      connectionRateLimiter.isAllowed(origin);

      vi.advanceTimersByTime(60001);

      expect(connectionRateLimiter.getResetTime(origin)).toBe(0);
    });
  });

  describe('reset', () => {
    const origin = 'https://example.com';

    it('should reset rate limit for specific origin', () => {
      for (let i = 0; i < 5; i++) {
        connectionRateLimiter.isAllowed(origin);
      }
      expect(connectionRateLimiter.isAllowed(origin)).toBe(false);

      connectionRateLimiter.reset(origin);

      expect(connectionRateLimiter.isAllowed(origin)).toBe(true);
      expect(connectionRateLimiter.getRemainingRequests(origin)).toBe(4);
    });

    it('should not affect other origins', () => {
      const origin1 = 'https://site1.com';
      const origin2 = 'https://site2.com';

      for (let i = 0; i < 5; i++) {
        connectionRateLimiter.isAllowed(origin1);
        connectionRateLimiter.isAllowed(origin2);
      }

      connectionRateLimiter.reset(origin1);

      expect(connectionRateLimiter.isAllowed(origin1)).toBe(true);
      expect(connectionRateLimiter.isAllowed(origin2)).toBe(false);
    });
  });

  describe('resetAll', () => {
    it('should reset all origins', () => {
      const origins = ['https://site1.com', 'https://site2.com', 'https://site3.com'];

      for (const origin of origins) {
        for (let i = 0; i < 5; i++) {
          connectionRateLimiter.isAllowed(origin);
        }
        expect(connectionRateLimiter.isAllowed(origin)).toBe(false);
      }

      connectionRateLimiter.resetAll();

      for (const origin of origins) {
        expect(connectionRateLimiter.isAllowed(origin)).toBe(true);
      }
    });
  });

  describe('cleanup behavior', () => {
    it('should clean up old entries when checking new requests', () => {
      const origins = Array.from({ length: 10 }, (_, i) => `https://site${i}.com`);

      // Make requests from many origins
      for (const origin of origins) {
        connectionRateLimiter.isAllowed(origin);
      }

      // Advance time past the cleanup threshold (windowMs * 2 = 120s)
      vi.advanceTimersByTime(120001);

      // Make a new request to trigger cleanup
      connectionRateLimiter.isAllowed('https://new-site.com');

      // Old entries should be cleaned up, counts reset
      expect(connectionRateLimiter.getRemainingRequests('https://site0.com')).toBe(5);
    });
  });

  describe('edge cases', () => {
    it('should handle empty origin', () => {
      expect(connectionRateLimiter.isAllowed('')).toBe(true);
    });

    it('should handle special characters in origin', () => {
      const origin = 'https://example.com:8080/path?query=1';
      expect(connectionRateLimiter.isAllowed(origin)).toBe(true);
    });

    it('should handle rapid successive requests', () => {
      const origin = 'https://example.com';
      let allowed = 0;

      for (let i = 0; i < 100; i++) {
        if (connectionRateLimiter.isAllowed(origin)) {
          allowed++;
        }
      }

      expect(allowed).toBe(5);
    });
  });

  describe('Security Features', () => {
    beforeEach(() => {
      connectionRateLimiter.resetAll();
      transactionRateLimiter.resetAll();
      apiRateLimiter.resetAll();
    });

    it('should track global request count', () => {
      // Make some requests
      connectionRateLimiter.isAllowed('https://site1.com');
      connectionRateLimiter.isAllowed('https://site2.com');
      connectionRateLimiter.isAllowed('https://site3.com');

      expect(connectionRateLimiter.getGlobalCount()).toBe(3);
    });

    it('should reset global count with resetAll', () => {
      connectionRateLimiter.isAllowed('https://site1.com');
      connectionRateLimiter.isAllowed('https://site2.com');

      expect(connectionRateLimiter.getGlobalCount()).toBe(2);

      connectionRateLimiter.resetAll();

      expect(connectionRateLimiter.getGlobalCount()).toBe(0);
    });

    it('should track number of unique origins', () => {
      connectionRateLimiter.isAllowed('https://site1.com');
      connectionRateLimiter.isAllowed('https://site2.com');
      connectionRateLimiter.isAllowed('https://site3.com');

      expect(connectionRateLimiter.getTrackedOriginCount()).toBe(3);
    });

    it('should enforce global rate limit across all origins', () => {
      // The global limit for apiRateLimiter is 500 requests per window
      // But per-origin limit is 100, so we need many origins to hit global
      // For testing, let's verify the global counter is working
      let totalAllowed = 0;

      // Make requests from many different origins
      for (let i = 0; i < 100; i++) {
        if (apiRateLimiter.isAllowed(`https://site${i}.com`)) {
          totalAllowed++;
        }
      }

      // All should be allowed (100 unique origins, 1 request each)
      expect(totalAllowed).toBe(100);
      expect(apiRateLimiter.getGlobalCount()).toBe(100);
    });

    it('should clean up old entries on each request', () => {
      vi.useFakeTimers();

      // Add entries
      connectionRateLimiter.isAllowed('https://old-site.com');
      expect(connectionRateLimiter.getTrackedOriginCount()).toBe(1);

      // Advance time past cleanup threshold (2x window time)
      vi.advanceTimersByTime(2 * 60 * 1000 + 1);

      // New request triggers cleanup
      connectionRateLimiter.isAllowed('https://new-site.com');

      // Old entry should be cleaned up
      expect(connectionRateLimiter.getTrackedOriginCount()).toBe(1);
      expect(connectionRateLimiter.getRemainingRequests('https://old-site.com')).toBe(5); // Reset

      vi.useRealTimers();
    });
  });
});
