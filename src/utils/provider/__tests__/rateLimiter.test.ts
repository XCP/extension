import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

// Mock RateLimiter class for testing
class RateLimiter {
  private requestCounts: Map<string, { count: number; resetTime: number; requests: number[] }> = new Map();
  private maxRequests: number;
  private windowMs: number;
  private whitelistedOrigins: Set<string> = new Set();
  private blacklistedOrigins: Set<string> = new Set();
  private customLimits: Map<string, number> = new Map();
  private methodLimits: Map<string, number> = new Map();
  private defaultLimit = 10;
  private intervalId: any = null;

  constructor(maxRequests = 10, windowMs = 60000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  checkLimit(origin: string, method: string): boolean {
    if (this.blacklistedOrigins.has(origin)) return false;
    if (this.whitelistedOrigins.has(origin)) return true;

    const now = Date.now();
    // Use method-specific key if method has a specific limit
    const key = this.methodLimits.has(method) ? `${origin}:${method}` : origin;
    let record = this.requestCounts.get(key);
    const limit = this.getLimit(origin, method);

    // Initialize or reset record if needed
    if (!record) {
      record = {
        count: 0,
        resetTime: now + this.windowMs,
        requests: []
      };
      this.requestCounts.set(key, record);
    }

    // Sliding window: filter out old requests
    record.requests = record.requests.filter(t => now - t < this.windowMs);
    
    if (record.requests.length >= limit) {
      return false;
    }

    record.requests.push(now);
    record.count = record.requests.length;
    // Update reset time to be based on the newest request
    record.resetTime = now + this.windowMs;
    return true;
  }

  private getLimit(origin: string, method: string): number {
    // Method-specific limits take priority over origin limits
    if (this.methodLimits.has(method)) {
      return this.methodLimits.get(method)!;
    }
    if (this.customLimits.has(origin)) {
      return this.customLimits.get(origin)!;
    }
    return this.defaultLimit;
  }

  setLimit(origin: string, limit: number) {
    this.customLimits.set(origin, limit);
  }

  setMethodLimit(method: string, limit: number) {
    this.methodLimits.set(method, limit);
  }

  setDefaultLimit(limit: number) {
    this.defaultLimit = limit;
  }

  whitelist(origin: string) {
    this.whitelistedOrigins.add(origin);
  }

  blacklist(origin: string) {
    this.blacklistedOrigins.add(origin);
  }

  removeFromWhitelist(origin: string) {
    this.whitelistedOrigins.delete(origin);
  }

  removeFromBlacklist(origin: string) {
    this.blacklistedOrigins.delete(origin);
  }

  isWhitelisted(origin: string): boolean {
    return this.whitelistedOrigins.has(origin);
  }

  isBlacklisted(origin: string): boolean {
    return this.blacklistedOrigins.has(origin);
  }

  getRemaining(origin: string, method: string = ''): number {
    const now = Date.now();
    const key = (method && this.methodLimits.has(method)) ? `${origin}:${method}` : origin;
    const record = this.requestCounts.get(key);
    const limit = this.getLimit(origin, method);

    if (!record || now >= record.resetTime) {
      return limit;
    }

    record.requests = record.requests.filter(t => now - t < this.windowMs);
    return Math.max(0, limit - record.requests.length);
  }

  getResetTime(origin: string, method: string = ''): number {
    const key = (method && this.methodLimits.has(method)) ? `${origin}:${method}` : origin;
    const record = this.requestCounts.get(key);
    return record ? record.resetTime : Date.now() + this.windowMs;
  }

  getStatus(origin: string, method: string = '') {
    const limit = this.getLimit(origin, method);
    const remaining = this.getRemaining(origin, method);
    return {
      limit,
      remaining,
      resetTime: this.getResetTime(origin, method),
      isLimited: remaining === 0
    };
  }

  cleanup(maxAge: number) {
    const now = Date.now();
    for (const [origin, record] of this.requestCounts.entries()) {
      if (now - record.resetTime > maxAge) {
        this.requestCounts.delete(origin);
      }
    }
  }

  startAutoCleanup(interval: number) {
    this.intervalId = setInterval(() => this.cleanup(this.windowMs), interval);
  }

  stopAutoCleanup() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  reset(origin: string, method?: string) {
    if (method && this.methodLimits.has(method)) {
      this.requestCounts.delete(`${origin}:${method}`);
    } else {
      this.requestCounts.delete(origin);
    }
  }

  resetAll() {
    this.requestCounts.clear();
  }
}

describe('RateLimiter', () => {
  let rateLimiter: RateLimiter;

  beforeEach(() => {
    vi.useFakeTimers();
    rateLimiter = new RateLimiter();
  });

  afterEach(() => {
    // Ensure any auto-cleanup intervals are stopped
    rateLimiter.stopAutoCleanup();
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  describe('Basic Rate Limiting', () => {
    it('should allow requests within limit', () => {
      const origin = 'https://example.com';
      
      expect(rateLimiter.checkLimit(origin, 'method1')).toBe(true);
      expect(rateLimiter.checkLimit(origin, 'method2')).toBe(true);
      expect(rateLimiter.checkLimit(origin, 'method3')).toBe(true);
    });

    it('should block requests exceeding limit', () => {
      const origin = 'https://example.com';
      const limit = 10; // Default limit per minute
      
      // Make requests up to limit
      for (let i = 0; i < limit; i++) {
        expect(rateLimiter.checkLimit(origin, 'method')).toBe(true);
      }
      
      // Next request should be blocked
      expect(rateLimiter.checkLimit(origin, 'method')).toBe(false);
    });

    it('should reset limit after time window', () => {
      const origin = 'https://example.com';
      const limit = 10;
      
      // Exhaust limit
      for (let i = 0; i < limit; i++) {
        rateLimiter.checkLimit(origin, 'method');
      }
      
      expect(rateLimiter.checkLimit(origin, 'method')).toBe(false);
      
      // Fast forward 1 minute
      vi.advanceTimersByTime(60 * 1000);
      
      // Should be allowed again
      expect(rateLimiter.checkLimit(origin, 'method')).toBe(true);
    });

    it('should track different origins separately', () => {
      const origin1 = 'https://site1.com';
      const origin2 = 'https://site2.com';
      const limit = 10;
      
      // Exhaust limit for origin1
      for (let i = 0; i < limit; i++) {
        rateLimiter.checkLimit(origin1, 'method');
      }
      
      expect(rateLimiter.checkLimit(origin1, 'method')).toBe(false);
      
      // origin2 should still be allowed
      expect(rateLimiter.checkLimit(origin2, 'method')).toBe(true);
    });
  });

  describe('Custom Limits', () => {
    it('should apply custom limit per origin', () => {
      const origin = 'https://trusted.com';
      
      // Set higher limit for trusted origin
      rateLimiter.setLimit(origin, 20);
      
      // Should allow 20 requests
      for (let i = 0; i < 20; i++) {
        expect(rateLimiter.checkLimit(origin, 'method')).toBe(true);
      }
      
      // 21st request should be blocked
      expect(rateLimiter.checkLimit(origin, 'method')).toBe(false);
    });

    it('should apply custom limit per method', () => {
      const origin = 'https://example.com';
      
      // Set different limits for different methods
      rateLimiter.setMethodLimit('xcp_requestAccounts', 5);
      rateLimiter.setMethodLimit('xcp_signTransaction', 2);
      
      // Test account requests
      for (let i = 0; i < 5; i++) {
        expect(rateLimiter.checkLimit(origin, 'xcp_requestAccounts')).toBe(true);
      }
      expect(rateLimiter.checkLimit(origin, 'xcp_requestAccounts')).toBe(false);
      
      // Test transaction requests
      for (let i = 0; i < 2; i++) {
        expect(rateLimiter.checkLimit(origin, 'xcp_signTransaction')).toBe(true);
      }
      expect(rateLimiter.checkLimit(origin, 'xcp_signTransaction')).toBe(false);
    });

    it('should apply global default limit', () => {
      rateLimiter.setDefaultLimit(5);
      
      const origin = 'https://example.com';
      
      // Should allow 5 requests
      for (let i = 0; i < 5; i++) {
        expect(rateLimiter.checkLimit(origin, 'method')).toBe(true);
      }
      
      // 6th request should be blocked
      expect(rateLimiter.checkLimit(origin, 'method')).toBe(false);
    });
  });

  describe('Whitelist/Blacklist', () => {
    it('should always allow whitelisted origins', () => {
      const origin = 'https://whitelisted.com';
      
      rateLimiter.whitelist(origin);
      
      // Should allow unlimited requests
      for (let i = 0; i < 100; i++) {
        expect(rateLimiter.checkLimit(origin, 'method')).toBe(true);
      }
    });

    it('should always block blacklisted origins', () => {
      const origin = 'https://blacklisted.com';
      
      rateLimiter.blacklist(origin);
      
      // Should block all requests
      expect(rateLimiter.checkLimit(origin, 'method')).toBe(false);
      expect(rateLimiter.checkLimit(origin, 'another-method')).toBe(false);
    });

    it('should remove from whitelist', () => {
      const origin = 'https://example.com';
      
      rateLimiter.whitelist(origin);
      expect(rateLimiter.isWhitelisted(origin)).toBe(true);
      
      rateLimiter.removeFromWhitelist(origin);
      expect(rateLimiter.isWhitelisted(origin)).toBe(false);
      
      // Should now be rate limited normally
      const limit = 10;
      for (let i = 0; i < limit; i++) {
        rateLimiter.checkLimit(origin, 'method');
      }
      expect(rateLimiter.checkLimit(origin, 'method')).toBe(false);
    });

    it('should remove from blacklist', () => {
      const origin = 'https://example.com';
      
      rateLimiter.blacklist(origin);
      expect(rateLimiter.isBlacklisted(origin)).toBe(true);
      expect(rateLimiter.checkLimit(origin, 'method')).toBe(false);
      
      rateLimiter.removeFromBlacklist(origin);
      expect(rateLimiter.isBlacklisted(origin)).toBe(false);
      expect(rateLimiter.checkLimit(origin, 'method')).toBe(true);
    });
  });

  describe('Rate Limit Info', () => {
    it('should provide remaining requests count', () => {
      const origin = 'https://example.com';
      const limit = 10;
      
      expect(rateLimiter.getRemaining(origin)).toBe(limit);
      
      rateLimiter.checkLimit(origin, 'method');
      expect(rateLimiter.getRemaining(origin)).toBe(limit - 1);
      
      rateLimiter.checkLimit(origin, 'method');
      expect(rateLimiter.getRemaining(origin)).toBe(limit - 2);
    });

    it('should provide reset time', () => {
      const origin = 'https://example.com';
      const now = Date.now();
      
      vi.setSystemTime(now);
      
      rateLimiter.checkLimit(origin, 'method');
      
      const resetTime = rateLimiter.getResetTime(origin);
      expect(resetTime).toBe(now + 60 * 1000); // 1 minute from now
    });

    it('should provide rate limit status', () => {
      const origin = 'https://example.com';
      
      const status = rateLimiter.getStatus(origin);
      
      expect(status).toEqual({
        limit: 10,
        remaining: 10,
        resetTime: expect.any(Number),
        isLimited: false
      });
      
      // Exhaust limit
      for (let i = 0; i < 10; i++) {
        rateLimiter.checkLimit(origin, 'method');
      }
      
      const limitedStatus = rateLimiter.getStatus(origin);
      expect(limitedStatus).toEqual({
        limit: 10,
        remaining: 0,
        resetTime: expect.any(Number),
        isLimited: true
      });
    });
  });

  describe('Sliding Window', () => {
    it('should use sliding window for rate limiting', () => {
      const origin = 'https://example.com';
      const limit = 10;
      
      const now = Date.now();
      vi.setSystemTime(now);
      
      // Make 5 requests
      for (let i = 0; i < 5; i++) {
        rateLimiter.checkLimit(origin, 'method');
      }
      
      // Fast forward 30 seconds
      vi.setSystemTime(now + 30 * 1000);
      
      // Make 5 more requests
      for (let i = 0; i < 5; i++) {
        rateLimiter.checkLimit(origin, 'method');
      }
      
      // Should still be at limit
      expect(rateLimiter.checkLimit(origin, 'method')).toBe(false);
      
      // Fast forward another 30 seconds (total 60s from first request)
      vi.setSystemTime(now + 60 * 1000);
      
      // First 5 requests should have expired, allowing 5 more
      for (let i = 0; i < 5; i++) {
        expect(rateLimiter.checkLimit(origin, 'method')).toBe(true);
      }
      expect(rateLimiter.checkLimit(origin, 'method')).toBe(false);
    });
  });

  describe('Cleanup', () => {
    it('should clean up old entries', () => {
      const origin1 = 'https://old.com';
      const origin2 = 'https://recent.com';
      
      const now = Date.now();
      vi.setSystemTime(now);
      
      rateLimiter.checkLimit(origin1, 'method');
      
      // Fast forward 2 minutes
      vi.setSystemTime(now + 2 * 60 * 1000);
      
      rateLimiter.checkLimit(origin2, 'method');
      
      // Clean up entries older than 1 minute
      rateLimiter.cleanup(60 * 1000);
      
      // origin1 should be cleaned up
      expect(rateLimiter.getRemaining(origin1)).toBe(10); // Reset to default
      
      // origin2 should still have its count
      expect(rateLimiter.getRemaining(origin2)).toBe(9);
    });

    it('should auto cleanup on interval', () => {
      const cleanupSpy = vi.spyOn(rateLimiter, 'cleanup');
      
      rateLimiter.startAutoCleanup(1000); // Cleanup every second
      
      vi.advanceTimersByTime(3000);
      
      expect(cleanupSpy).toHaveBeenCalledTimes(3);
      
      rateLimiter.stopAutoCleanup();
    });
  });

  describe('Reset', () => {
    it('should reset specific origin', () => {
      const origin = 'https://example.com';
      
      // Use some requests
      for (let i = 0; i < 5; i++) {
        rateLimiter.checkLimit(origin, 'method');
      }
      
      expect(rateLimiter.getRemaining(origin)).toBe(5);
      
      rateLimiter.reset(origin);
      
      expect(rateLimiter.getRemaining(origin)).toBe(10);
    });

    it('should reset all origins', () => {
      const origin1 = 'https://site1.com';
      const origin2 = 'https://site2.com';
      
      // Use some requests
      rateLimiter.checkLimit(origin1, 'method');
      rateLimiter.checkLimit(origin2, 'method');
      
      expect(rateLimiter.getRemaining(origin1)).toBe(9);
      expect(rateLimiter.getRemaining(origin2)).toBe(9);
      
      rateLimiter.resetAll();
      
      expect(rateLimiter.getRemaining(origin1)).toBe(10);
      expect(rateLimiter.getRemaining(origin2)).toBe(10);
    });
  });
});