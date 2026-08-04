/**
 * Security: Maximum number of unique origins to track to prevent memory exhaustion.
 * An attacker could try to exhaust memory by generating many unique origins.
 */
const MAX_TRACKED_ORIGINS = 1000;

/**
 * Security: Global rate limit across all origins as a defense-in-depth measure.
 * Even if per-origin limits are somehow bypassed, this provides a backstop.
 */
const GLOBAL_MAX_REQUESTS_PER_WINDOW = 500;

/**
 * Rate limiter for provider requests to prevent spam
 */
class RateLimiter {
  private requestCounts: Map<string, { count: number; resetTime: number }> = new Map();
  private globalCount: { count: number; resetTime: number } = { count: 0, resetTime: 0 };
  private readonly maxRequests: number;
  private readonly windowMs: number;
  private readonly globalMaxRequests: number;

  constructor(maxRequests = 10, windowMs = 60000, globalMaxRequests = GLOBAL_MAX_REQUESTS_PER_WINDOW) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    this.globalMaxRequests = globalMaxRequests;
  }

  /**
   * Check if a request from an origin should be allowed
   */
  isAllowed(origin: string): boolean {
    const now = Date.now();

    // Clean up old entries first
    this.cleanup();

    // Security: Check global rate limit first (defense-in-depth)
    if (now > this.globalCount.resetTime) {
      // Reset global counter
      this.globalCount = { count: 1, resetTime: now + this.windowMs };
    } else {
      if (this.globalCount.count >= this.globalMaxRequests) {
        // Global rate limit exceeded - possible attack
        return false;
      }
      this.globalCount.count++;
    }

    // Security: Limit number of tracked origins to prevent memory exhaustion
    if (!this.requestCounts.has(origin) && this.requestCounts.size >= MAX_TRACKED_ORIGINS) {
      // Too many unique origins - reject new ones to prevent memory exhaustion
      return false;
    }

    const record = this.requestCounts.get(origin);

    if (!record || now > record.resetTime) {
      // First request or window expired
      this.requestCounts.set(origin, {
        count: 1,
        resetTime: now + this.windowMs
      });
      return true;
    }

    if (record.count >= this.maxRequests) {
      // Rate limit exceeded
      return false;
    }

    // Increment count
    record.count++;
    return true;
  }

  /**
   * Get remaining requests for an origin
   */
  getRemainingRequests(origin: string): number {
    const record = this.requestCounts.get(origin);
    if (!record || Date.now() > record.resetTime) {
      return this.maxRequests;
    }
    return Math.max(0, this.maxRequests - record.count);
  }

  /**
   * Get time until rate limit resets for an origin
   */
  getResetTime(origin: string): number {
    const record = this.requestCounts.get(origin);
    if (!record || Date.now() > record.resetTime) {
      return 0;
    }
    return record.resetTime - Date.now();
  }

  /**
   * Clean up expired entries to prevent memory leak
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [origin, record] of this.requestCounts.entries()) {
      if (now > record.resetTime + this.windowMs) {
        this.requestCounts.delete(origin);
      }
    }
  }

  /**
   * Reset rate limit for a specific origin
   */
  reset(origin: string): void {
    this.requestCounts.delete(origin);
  }

  /**
   * Reset all rate limits
   */
  resetAll(): void {
    this.requestCounts.clear();
    this.globalCount = { count: 0, resetTime: 0 };
  }

  /**
   * Get current global request count (for monitoring/debugging)
   */
  getGlobalCount(): number {
    const now = Date.now();
    if (now > this.globalCount.resetTime) {
      return 0;
    }
    return this.globalCount.count;
  }

  /**
   * Get number of tracked origins (for monitoring/debugging)
   */
  getTrackedOriginCount(): number {
    return this.requestCounts.size;
  }
}

// Create singleton instances for different types of requests
export const connectionRateLimiter = new RateLimiter(5, 60000); // 5 connection attempts per minute
export const transactionRateLimiter = new RateLimiter(10, 60000); // 10 transactions per minute
export const apiRateLimiter = new RateLimiter(100, 60000); // 100 API calls per minute