import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { withRetry, isApiError } from '../apiClient';

describe('apiClient.ts', () => {
  describe('isApiError', () => {
    it('should return true for valid API errors', () => {
      const timeoutError = new Error('timeout') as Error & { code: string };
      timeoutError.code = 'TIMEOUT';
      expect(isApiError(timeoutError)).toBe(true);

      const networkError = new Error('network') as Error & { code: string };
      networkError.code = 'NETWORK_ERROR';
      expect(isApiError(networkError)).toBe(true);

      const httpError = new Error('http') as Error & { code: string };
      httpError.code = 'HTTP_ERROR';
      expect(isApiError(httpError)).toBe(true);

      const cancelledError = new Error('cancelled') as Error & { code: string };
      cancelledError.code = 'CANCELLED';
      expect(isApiError(cancelledError)).toBe(true);
    });

    it('should return false for non-Error objects', () => {
      expect(isApiError(null)).toBe(false);
      expect(isApiError(undefined)).toBe(false);
      expect(isApiError('error')).toBe(false);
      expect(isApiError({ code: 'TIMEOUT' })).toBe(false);
    });

    it('should return false for errors with non-API error codes', () => {
      // Node.js system errors
      const enoentError = new Error('file not found') as Error & { code: string };
      enoentError.code = 'ENOENT';
      expect(isApiError(enoentError)).toBe(false);

      const econnrefusedError = new Error('connection refused') as Error & { code: string };
      econnrefusedError.code = 'ECONNREFUSED';
      expect(isApiError(econnrefusedError)).toBe(false);

      // Random error codes from other libraries
      const customError = new Error('custom') as Error & { code: string };
      customError.code = 'CUSTOM_ERROR';
      expect(isApiError(customError)).toBe(false);
    });

    it('should return false for errors without code property', () => {
      const plainError = new Error('plain error');
      expect(isApiError(plainError)).toBe(false);
    });
  });

  describe('withRetry', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should execute function once with maxRetries=0', async () => {
      let callCount = 0;
      const fn = async () => {
        callCount++;
        return 'success';
      };

      const result = await withRetry(fn, 0);

      expect(result).toBe('success');
      expect(callCount).toBe(1);
    });

    it('should handle negative maxRetries as 0 retries', async () => {
      let callCount = 0;
      const fn = async () => {
        callCount++;
        throw new Error('fail');
      };

      // Should not throw null, should throw the actual error
      await expect(withRetry(fn, -1)).rejects.toThrow();

      // Should have executed once (0 retries means 1 attempt)
      expect(callCount).toBe(1);
    });

    it('should throw ApiError even for non-ApiError exceptions', async () => {
      const fn = async () => {
        throw new TypeError('some type error');
      };

      try {
        await withRetry(fn, 0);
        expect.fail('should have thrown');
      } catch (error) {
        // Error should be wrapped as ApiError
        expect(isApiError(error)).toBe(true);
        if (isApiError(error)) {
          expect(error.code).toBe('NETWORK_ERROR');
          expect(error.message).toContain('some type error');
        }
      }
    });

    it('should retry on network errors', async () => {
      let callCount = 0;
      const fn = async () => {
        callCount++;
        if (callCount < 3) {
          const error = new Error('Network error') as Error & { code: string };
          error.code = 'NETWORK_ERROR';
          throw error;
        }
        return 'success';
      };

      const resultPromise = withRetry(fn, 3);

      // Fast-forward through retry delays
      await vi.runAllTimersAsync();

      const result = await resultPromise;
      expect(result).toBe('success');
      expect(callCount).toBe(3);
    });
  });
});
