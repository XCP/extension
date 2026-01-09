import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

// Mock ApprovalQueue class for testing
class ApprovalQueue {
  private queue: any[] = [];
  private intervalId: any = null;

  add(request: any) {
    const fullRequest = {
      ...request,
      id: request.id || Math.random().toString(36),
      timestamp: request.timestamp || Date.now()
    };
    this.queue.push(fullRequest);
    return fullRequest;
  }

  getPending() {
    return [...this.queue];
  }

  get(id: string) {
    return this.queue.find(r => r.id === id) || null;
  }

  remove(id: string) {
    const index = this.queue.findIndex(r => r.id === id);
    if (index !== -1) {
      return this.queue.splice(index, 1)[0];
    }
    return null;
  }

  clear() {
    this.queue = [];
  }

  async approve(id: string, result: any) {
    const request = this.remove(id);
    if (request?.callback) {
      return await request.callback(null, result);
    }
  }

  async reject(id: string, reason: string) {
    const request = this.remove(id);
    if (request?.callback) {
      return await request.callback({ message: reason, code: 4001 }, null);
    }
  }

  getByOrigin(origin: string) {
    return this.queue.filter(r => r.origin === origin);
  }

  getByMethod(method: string) {
    return this.queue.filter(r => r.method === method);
  }

  hasPending() {
    return this.queue.length > 0;
  }

  count() {
    return this.queue.length;
  }

  cleanExpired(timeout: number) {
    const now = Date.now();
    this.queue = this.queue.filter(r => (now - r.timestamp) < timeout);
  }

  startAutoCleanup(interval: number, timeout: number) {
    this.intervalId = setInterval(() => this.cleanExpired(timeout), interval);
  }

  stopAutoCleanup() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  getNext() {
    const highPriority = this.queue.find(r => r.priority === 'high');
    return highPriority || this.queue[0] || null;
  }

  async approveAllFromOrigin(origin: string, result: any) {
    const requests = this.getByOrigin(origin);
    for (const request of requests) {
      await this.approve(request.id, result);
    }
  }

  async rejectAllFromOrigin(origin: string, reason: string) {
    const requests = this.getByOrigin(origin);
    for (const request of requests) {
      await this.reject(request.id, reason);
    }
  }
}

describe('ApprovalQueue', () => {
  let queue: ApprovalQueue;

  beforeEach(() => {
    queue = new ApprovalQueue();
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Ensure any auto-cleanup intervals are stopped
    queue.stopAutoCleanup();
    queue.clear();
  });

  describe('Request Management', () => {
    it('should add request to queue', () => {
      const request = {
        id: '123',
        method: 'xcp_requestAccounts',
        params: [],
        origin: 'https://example.com',
        timestamp: Date.now()
      };

      queue.add(request);
      
      const pending = queue.getPending();
      expect(pending).toHaveLength(1);
      expect(pending[0]).toMatchObject(request);
    });

    it('should generate unique IDs for requests', () => {
      const request1 = queue.add({
        method: 'xcp_requestAccounts',
        params: [],
        origin: 'https://example.com'
      });

      const request2 = queue.add({
        method: 'xcp_requestAccounts',
        params: [],
        origin: 'https://example.com'
      });

      expect(request1.id).not.toBe(request2.id);
    });

    it('should get request by ID', () => {
      const request = queue.add({
        method: 'xcp_requestAccounts',
        params: [],
        origin: 'https://example.com'
      });

      const retrieved = queue.get(request.id);
      expect(retrieved).toEqual(request);
    });

    it('should return null for non-existent request', () => {
      const retrieved = queue.get('non-existent');
      expect(retrieved).toBeNull();
    });

    it('should remove request from queue', () => {
      const request = queue.add({
        method: 'xcp_requestAccounts',
        params: [],
        origin: 'https://example.com'
      });

      const removed = queue.remove(request.id);
      expect(removed).toEqual(request);
      
      const pending = queue.getPending();
      expect(pending).toHaveLength(0);
    });

    it('should clear all requests', () => {
      queue.add({ method: 'method1', params: [], origin: 'https://example.com' });
      queue.add({ method: 'method2', params: [], origin: 'https://example.com' });
      queue.add({ method: 'method3', params: [], origin: 'https://example.com' });

      expect(queue.getPending()).toHaveLength(3);

      queue.clear();
      expect(queue.getPending()).toHaveLength(0);
    });
  });

  describe('Approval/Rejection', () => {
    it('should approve request and call callback', async () => {
      const callback = vi.fn().mockResolvedValue({ result: 'success' });
      
      const request = queue.add({
        method: 'xcp_requestAccounts',
        params: [],
        origin: 'https://example.com',
        callback
      });

      const result = await queue.approve(request.id, { accounts: ['bc1qtest'] });
      
      expect(callback).toHaveBeenCalledWith(null, { accounts: ['bc1qtest'] });
      expect(result).toEqual({ result: 'success' });
      expect(queue.get(request.id)).toBeNull(); // Should be removed
    });

    it('should reject request and call callback with error', async () => {
      const callback = vi.fn().mockResolvedValue({ error: 'rejected' });
      
      const request = queue.add({
        method: 'xcp_requestAccounts',
        params: [],
        origin: 'https://example.com',
        callback
      });

      const result = await queue.reject(request.id, 'User rejected');
      
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'User rejected',
          code: 4001 // User rejection code
        }),
        null
      );
      expect(result).toEqual({ error: 'rejected' });
      expect(queue.get(request.id)).toBeNull(); // Should be removed
    });

    it('should handle callback errors gracefully', async () => {
      const callback = vi.fn().mockRejectedValue(new Error('Callback failed'));
      
      const request = queue.add({
        method: 'xcp_requestAccounts',
        params: [],
        origin: 'https://example.com',
        callback
      });

      await expect(queue.approve(request.id, { result: 'test' }))
        .rejects.toThrow('Callback failed');
    });

    it('should handle missing callback', async () => {
      const request = queue.add({
        method: 'xcp_requestAccounts',
        params: [],
        origin: 'https://example.com'
        // No callback
      });

      const result = await queue.approve(request.id, { result: 'test' });
      expect(result).toBeUndefined();
    });
  });

  describe('Queue Filtering', () => {
    it('should get requests by origin', () => {
      queue.add({ method: 'method1', params: [], origin: 'https://site1.com' });
      queue.add({ method: 'method2', params: [], origin: 'https://site2.com' });
      queue.add({ method: 'method3', params: [], origin: 'https://site1.com' });

      const site1Requests = queue.getByOrigin('https://site1.com');
      expect(site1Requests).toHaveLength(2);
      expect(site1Requests.every((r: any) => r.origin === 'https://site1.com')).toBe(true);
    });

    it('should get requests by method', () => {
      queue.add({ method: 'xcp_requestAccounts', params: [], origin: 'https://example.com' });
      queue.add({ method: 'xcp_signTransaction', params: [], origin: 'https://example.com' });
      queue.add({ method: 'xcp_requestAccounts', params: [], origin: 'https://example.com' });

      const accountRequests = queue.getByMethod('xcp_requestAccounts');
      expect(accountRequests).toHaveLength(2);
      expect(accountRequests.every((r: any) => r.method === 'xcp_requestAccounts')).toBe(true);
    });

    it('should check if queue has pending requests', () => {
      expect(queue.hasPending()).toBe(false);

      queue.add({ method: 'test', params: [], origin: 'https://example.com' });
      expect(queue.hasPending()).toBe(true);

      queue.clear();
      expect(queue.hasPending()).toBe(false);
    });

    it('should count pending requests', () => {
      expect(queue.count()).toBe(0);

      queue.add({ method: 'test1', params: [], origin: 'https://example.com' });
      queue.add({ method: 'test2', params: [], origin: 'https://example.com' });
      
      expect(queue.count()).toBe(2);
    });
  });

  describe('Request Expiration', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should expire old requests', () => {
      const now = Date.now();
      vi.setSystemTime(now);

      // Add request
      const request = queue.add({
        method: 'xcp_requestAccounts',
        params: [],
        origin: 'https://example.com'
      });

      expect(queue.getPending()).toHaveLength(1);

      // Fast forward 5 minutes
      vi.setSystemTime(now + 5 * 60 * 1000);

      // Clean expired (assuming 5 minute timeout)
      queue.cleanExpired(5 * 60 * 1000);
      
      expect(queue.getPending()).toHaveLength(0);
    });

    it('should not expire recent requests', () => {
      const now = Date.now();
      vi.setSystemTime(now);

      const request = queue.add({
        method: 'xcp_requestAccounts',
        params: [],
        origin: 'https://example.com'
      });

      // Fast forward 2 minutes
      vi.setSystemTime(now + 2 * 60 * 1000);

      // Clean expired with 5 minute timeout
      queue.cleanExpired(5 * 60 * 1000);
      
      expect(queue.getPending()).toHaveLength(1);
    });

    it('should auto-expire on interval', () => {
      const cleanupSpy = vi.spyOn(queue, 'cleanExpired');
      
      queue.startAutoCleanup(1000, 5000); // Clean every 1s, expire after 5s
      
      vi.advanceTimersByTime(3000);
      
      expect(cleanupSpy).toHaveBeenCalledTimes(3);
      
      queue.stopAutoCleanup();
    });
  });

  describe('Request Priority', () => {
    it('should handle high priority requests first', () => {
      queue.add({ 
        method: 'normal1', 
        params: [], 
        origin: 'https://example.com',
        priority: 'normal'
      });
      
      queue.add({ 
        method: 'high1', 
        params: [], 
        origin: 'https://example.com',
        priority: 'high'
      });
      
      queue.add({ 
        method: 'normal2', 
        params: [], 
        origin: 'https://example.com',
        priority: 'normal'
      });

      const next = queue.getNext();
      expect(next?.method).toBe('high1');
    });

    it('should process FIFO for same priority', () => {
      queue.add({ 
        method: 'first', 
        params: [], 
        origin: 'https://example.com',
        priority: 'normal'
      });
      
      queue.add({ 
        method: 'second', 
        params: [], 
        origin: 'https://example.com',
        priority: 'normal'
      });

      const next = queue.getNext();
      expect(next?.method).toBe('first');
    });
  });

  describe('Batch Operations', () => {
    it('should approve all requests from origin', async () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();
      
      queue.add({ 
        method: 'method1', 
        params: [], 
        origin: 'https://example.com',
        callback: callback1
      });
      
      queue.add({ 
        method: 'method2', 
        params: [], 
        origin: 'https://example.com',
        callback: callback2
      });
      
      queue.add({ 
        method: 'method3', 
        params: [], 
        origin: 'https://other.com'
      });

      await queue.approveAllFromOrigin('https://example.com', { approved: true });
      
      expect(callback1).toHaveBeenCalledWith(null, { approved: true });
      expect(callback2).toHaveBeenCalledWith(null, { approved: true });
      expect(queue.getByOrigin('https://example.com')).toHaveLength(0);
      expect(queue.getByOrigin('https://other.com')).toHaveLength(1);
    });

    it('should reject all requests from origin', async () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();
      
      queue.add({ 
        method: 'method1', 
        params: [], 
        origin: 'https://example.com',
        callback: callback1
      });
      
      queue.add({ 
        method: 'method2', 
        params: [], 
        origin: 'https://example.com',
        callback: callback2
      });

      await queue.rejectAllFromOrigin('https://example.com', 'Site blocked');
      
      expect(callback1).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Site blocked' }),
        null
      );
      expect(callback2).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Site blocked' }),
        null
      );
      expect(queue.getByOrigin('https://example.com')).toHaveLength(0);
    });
  });
});