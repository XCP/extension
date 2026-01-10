/**
 * Unit tests for ApprovalQueue - tests the actual exported module
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { approvalQueue, getApprovalBadgeText, type ApprovalRequest } from '../approvalQueue';

describe('ApprovalQueue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    approvalQueue.clearAll();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Basic Operations', () => {
    it('should start with empty queue', () => {
      expect(approvalQueue.getAll()).toEqual([]);
      expect(approvalQueue.getCount()).toBe(0);
    });

    it('should add a request to the queue', () => {
      approvalQueue.add({
        id: 'test-1',
        origin: 'https://example.com',
        method: 'xcp_requestAccounts',
        params: {},
        type: 'connection',
      });

      expect(approvalQueue.getCount()).toBe(1);
      const requests = approvalQueue.getAll();
      expect(requests[0].id).toBe('test-1');
      expect(requests[0].origin).toBe('https://example.com');
      expect(requests[0].timestamp).toBeDefined();
    });

    it('should get a request by ID', () => {
      approvalQueue.add({
        id: 'test-2',
        origin: 'https://example.com',
        method: 'xcp_sendTransaction',
        params: { to: '0x123' },
        type: 'transaction',
      });

      const request = approvalQueue.get('test-2');
      expect(request).toBeDefined();
      expect(request?.method).toBe('xcp_sendTransaction');

      const notFound = approvalQueue.get('non-existent');
      expect(notFound).toBeUndefined();
    });

    it('should get the next request in queue', () => {
      approvalQueue.add({
        id: 'first',
        origin: 'https://example.com',
        method: 'method1',
        params: {},
        type: 'connection',
      });
      approvalQueue.add({
        id: 'second',
        origin: 'https://example.com',
        method: 'method2',
        params: {},
        type: 'connection',
      });

      const next = approvalQueue.getNext();
      expect(next?.id).toBe('first');
    });

    it('should return null for getNext on empty queue', () => {
      expect(approvalQueue.getNext()).toBeNull();
    });

    it('should remove a request by ID', () => {
      approvalQueue.add({
        id: 'remove-me',
        origin: 'https://example.com',
        method: 'test',
        params: {},
        type: 'connection',
      });

      expect(approvalQueue.getCount()).toBe(1);

      const removed = approvalQueue.remove('remove-me');
      expect(removed).toBe(true);
      expect(approvalQueue.getCount()).toBe(0);
    });

    it('should return false when removing non-existent request', () => {
      const removed = approvalQueue.remove('does-not-exist');
      expect(removed).toBe(false);
    });

    it('should clear all requests', () => {
      approvalQueue.add({ id: '1', origin: 'a', method: 'm', params: {}, type: 'connection' });
      approvalQueue.add({ id: '2', origin: 'b', method: 'm', params: {}, type: 'connection' });

      approvalQueue.clearAll();

      expect(approvalQueue.getCount()).toBe(0);
    });
  });

  describe('Origin-based Operations', () => {
    beforeEach(() => {
      approvalQueue.add({ id: '1', origin: 'https://site1.com', method: 'm', params: {}, type: 'connection' });
      approvalQueue.add({ id: '2', origin: 'https://site1.com', method: 'm', params: {}, type: 'transaction' });
      approvalQueue.add({ id: '3', origin: 'https://site2.com', method: 'm', params: {}, type: 'connection' });
    });

    it('should clear requests by origin', () => {
      const removed = approvalQueue.clearByOrigin('https://site1.com');

      expect(removed).toBe(2);
      expect(approvalQueue.getCount()).toBe(1);
      expect(approvalQueue.get('3')).toBeDefined();
    });

    it('should check if origin has pending requests', () => {
      expect(approvalQueue.hasPendingFromOrigin('https://site1.com')).toBe(true);
      expect(approvalQueue.hasPendingFromOrigin('https://unknown.com')).toBe(false);
    });

    it('should group requests by origin', () => {
      const grouped = approvalQueue.getGroupedByOrigin();

      expect(grouped.get('https://site1.com')?.length).toBe(2);
      expect(grouped.get('https://site2.com')?.length).toBe(1);
    });
  });

  describe('Type-based Operations', () => {
    beforeEach(() => {
      approvalQueue.add({ id: '1', origin: 'a', method: 'm', params: {}, type: 'connection' });
      approvalQueue.add({ id: '2', origin: 'a', method: 'm', params: {}, type: 'transaction' });
      approvalQueue.add({ id: '3', origin: 'a', method: 'm', params: {}, type: 'transaction' });
      approvalQueue.add({ id: '4', origin: 'a', method: 'm', params: {}, type: 'signature' });
    });

    it('should count requests by type', () => {
      expect(approvalQueue.getCountByType('connection')).toBe(1);
      expect(approvalQueue.getCountByType('transaction')).toBe(2);
      expect(approvalQueue.getCountByType('signature')).toBe(1);
      expect(approvalQueue.getCountByType('compose')).toBe(0);
    });
  });

  describe('Window Management', () => {
    it('should set and get current window ID', () => {
      expect(approvalQueue.getCurrentWindow()).toBeNull();

      approvalQueue.setCurrentWindow(12345);
      expect(approvalQueue.getCurrentWindow()).toBe(12345);

      approvalQueue.setCurrentWindow(null);
      expect(approvalQueue.getCurrentWindow()).toBeNull();
    });
  });

  describe('Subscription', () => {
    it('should notify listeners when queue changes', () => {
      const listener = vi.fn();
      const unsubscribe = approvalQueue.subscribe(listener);

      approvalQueue.add({ id: '1', origin: 'a', method: 'm', params: {}, type: 'connection' });

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(expect.arrayContaining([
        expect.objectContaining({ id: '1' })
      ]));

      unsubscribe();

      approvalQueue.add({ id: '2', origin: 'a', method: 'm', params: {}, type: 'connection' });

      // Should not be called again after unsubscribe
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('should handle listener errors gracefully', () => {
      const errorListener = vi.fn(() => { throw new Error('Test error'); });
      const goodListener = vi.fn();
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      approvalQueue.subscribe(errorListener);
      approvalQueue.subscribe(goodListener);

      approvalQueue.add({ id: '1', origin: 'a', method: 'm', params: {}, type: 'connection' });

      // Both should be called, error should be caught
      expect(errorListener).toHaveBeenCalled();
      expect(goodListener).toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe('Reorder', () => {
    beforeEach(() => {
      approvalQueue.add({ id: 'a', origin: 'x', method: 'm', params: {}, type: 'connection' });
      approvalQueue.add({ id: 'b', origin: 'x', method: 'm', params: {}, type: 'connection' });
      approvalQueue.add({ id: 'c', origin: 'x', method: 'm', params: {}, type: 'connection' });
    });

    it('should reorder a request to a new position', () => {
      const result = approvalQueue.reorder('c', 0);

      expect(result).toBe(true);
      const requests = approvalQueue.getAll();
      expect(requests[0].id).toBe('c');
      expect(requests[1].id).toBe('a');
      expect(requests[2].id).toBe('b');
    });

    it('should return false for invalid reorder', () => {
      expect(approvalQueue.reorder('nonexistent', 0)).toBe(false);
      expect(approvalQueue.reorder('a', -1)).toBe(false);
      expect(approvalQueue.reorder('a', 100)).toBe(false);
    });
  });

  describe('Expiration', () => {
    it('should get expired requests', () => {
      approvalQueue.add({ id: 'old', origin: 'x', method: 'm', params: {}, type: 'connection' });

      // Advance time by 6 minutes
      vi.advanceTimersByTime(6 * 60 * 1000);

      approvalQueue.add({ id: 'new', origin: 'x', method: 'm', params: {}, type: 'connection' });

      const expired = approvalQueue.getExpired(5 * 60 * 1000);
      expect(expired.length).toBe(1);
      expect(expired[0].id).toBe('old');
    });

    it('should remove expired requests', () => {
      approvalQueue.add({ id: 'old', origin: 'x', method: 'm', params: {}, type: 'connection' });

      vi.advanceTimersByTime(6 * 60 * 1000);

      approvalQueue.add({ id: 'new', origin: 'x', method: 'm', params: {}, type: 'connection' });

      const removedCount = approvalQueue.removeExpired(5 * 60 * 1000);

      expect(removedCount).toBe(1);
      expect(approvalQueue.getCount()).toBe(1);
      expect(approvalQueue.get('new')).toBeDefined();
    });
  });
});

describe('getApprovalBadgeText', () => {
  beforeEach(() => {
    approvalQueue.clearAll();
  });

  it('should return empty string for empty queue', () => {
    expect(getApprovalBadgeText()).toBe('');
  });

  it('should return count as string', () => {
    approvalQueue.add({ id: '1', origin: 'a', method: 'm', params: {}, type: 'connection' });
    expect(getApprovalBadgeText()).toBe('1');

    approvalQueue.add({ id: '2', origin: 'a', method: 'm', params: {}, type: 'connection' });
    expect(getApprovalBadgeText()).toBe('2');
  });

  it('should return 99+ for large counts', () => {
    for (let i = 0; i < 100; i++) {
      approvalQueue.add({ id: `${i}`, origin: 'a', method: 'm', params: {}, type: 'connection' });
    }
    expect(getApprovalBadgeText()).toBe('99+');
  });
});
