/**
 * Rate limiter for provider requests to prevent spam
 */
class RateLimiter {
  private requestCounts: Map<string, { count: number; resetTime: number }> = new Map();
  private readonly maxRequests: number;
  private readonly windowMs: number;

  constructor(maxRequests = 10, windowMs = 60000) { // 10 requests per minute by default
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  /**
   * Check if a request from an origin should be allowed
   */
  isAllowed(origin: string): boolean {
    const now = Date.now();
    const record = this.requestCounts.get(origin);

    // Clean up old entries
    this.cleanup();

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
  }
}

// Create singleton instances for different types of requests
export const connectionRateLimiter = new RateLimiter(5, 60000); // 5 connection attempts per minute
export const transactionRateLimiter = new RateLimiter(10, 60000); // 10 transactions per minute
export const apiRateLimiter = new RateLimiter(100, 60000); // 100 API calls per minute