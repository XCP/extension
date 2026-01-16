import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { MessageBus } from '../MessageBus';

// Mock webext-bridge
const mockSendMessage = vi.fn();
const mockOnMessage = vi.fn();

vi.mock('webext-bridge/background', () => ({
  sendMessage: (...args: any[]) => mockSendMessage(...args),
  onMessage: (...args: any[]) => mockOnMessage(...args),
}));

describe('MessageBus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    // Reset the static state
    (MessageBus as any).backgroundReady = false;
    (MessageBus as any).readinessPromise = null;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    // Reset the mock functions to clear accumulated call history
    mockSendMessage.mockReset();
    mockOnMessage.mockReset();
  });

  describe('ensureBackgroundReady', () => {
    it('should mark background as ready when health check succeeds', async () => {
      mockSendMessage.mockResolvedValueOnce({ status: 'ready' });

      const sendPromise = MessageBus.send('keychainLocked', { locked: true }, 'background');
      await vi.runAllTimersAsync();
      await sendPromise;

      expect(mockSendMessage).toHaveBeenCalledWith('startup-health-check', {}, 'background');
    });

    it('should retry health check with exponential backoff', async () => {
      // First 3 attempts fail, 4th succeeds
      mockSendMessage
        .mockRejectedValueOnce(new Error('Not ready'))
        .mockRejectedValueOnce(new Error('Not ready'))
        .mockRejectedValueOnce(new Error('Not ready'))
        .mockResolvedValueOnce({ status: 'ready' })
        .mockResolvedValue({ success: true }); // For the actual message

      const sendPromise = MessageBus.send('keychainLocked', { locked: true }, 'background');

      // Run through all timers
      await vi.runAllTimersAsync();
      await sendPromise;

      // Should have called startup-health-check multiple times
      const healthCheckCalls = mockSendMessage.mock.calls.filter(
        call => call[0] === 'startup-health-check'
      );
      expect(healthCheckCalls.length).toBeGreaterThanOrEqual(4);
    });

    it('should fail after max attempts', async () => {
      // Reject exactly 10 times (max attempts in doBackgroundReadinessCheck)
      for (let i = 0; i < 10; i++) {
        mockSendMessage.mockRejectedValueOnce(new Error('Not ready'));
      }

      // Attach rejection handler BEFORE running timers to prevent unhandled rejection
      const sendPromise = MessageBus.send('keychainLocked', { locked: true }, 'background')
        .catch((e: Error) => e);

      await vi.runAllTimersAsync();

      const error = await sendPromise;
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe('Background service worker not ready');
    });

    it('should skip readiness check when skipReadinessCheck is true', async () => {
      mockSendMessage.mockResolvedValueOnce({ success: true });

      await MessageBus.send('keychainLocked', { locked: true }, 'background', {
        skipReadinessCheck: true,
      });

      // Should not have called startup-health-check
      expect(mockSendMessage).not.toHaveBeenCalledWith('startup-health-check', {}, 'background');
      expect(mockSendMessage).toHaveBeenCalledWith('keychainLocked', { locked: true }, 'background');
    });

    it('should cache successful readiness check', async () => {
      mockSendMessage
        .mockResolvedValueOnce({ status: 'ready' })
        .mockResolvedValue({ success: true });

      // First call - triggers readiness check
      const promise1 = MessageBus.send('keychainLocked', { locked: true }, 'background');
      await vi.runAllTimersAsync();
      await promise1;

      // Second call - should use cached result
      await MessageBus.send('keychainLocked', { locked: false }, 'background');

      // startup-health-check should only be called once
      const healthCheckCalls = mockSendMessage.mock.calls.filter(
        call => call[0] === 'startup-health-check'
      );
      expect(healthCheckCalls).toHaveLength(1);
    });

    it('should clear failed readiness promise for retry', async () => {
      // First set of calls - reject exactly 10 times (max attempts)
      for (let i = 0; i < 10; i++) {
        mockSendMessage.mockRejectedValueOnce(new Error('Not ready'));
      }

      // Attach rejection handler BEFORE running timers to prevent unhandled rejection
      const promise1 = MessageBus.send('keychainLocked', { locked: true }, 'background')
        .catch((e: Error) => e);
      await vi.runAllTimersAsync();

      // Verify the rejection
      const error = await promise1;
      expect((error as Error).message).toBe('Background service worker not ready');

      // Reset and make it succeed
      mockSendMessage.mockReset();
      mockSendMessage
        .mockResolvedValueOnce({ status: 'ready' })
        .mockResolvedValueOnce({ success: true });

      // Second call should retry the readiness check
      const promise2 = MessageBus.send('keychainLocked', { locked: true }, 'background');
      await vi.runAllTimersAsync();
      await promise2;

      expect(mockSendMessage).toHaveBeenCalledWith('startup-health-check', {}, 'background');
    });
  });

  describe('send', () => {
    beforeEach(() => {
      // Pre-set background as ready for most send tests
      (MessageBus as any).backgroundReady = true;
    });

    it('should send message to specified target', async () => {
      mockSendMessage.mockResolvedValueOnce({ data: 'test' });

      const result = await MessageBus.send('keychainLocked', { locked: true }, 'background');

      expect(mockSendMessage).toHaveBeenCalledWith('keychainLocked', { locked: true }, 'background');
      expect(result).toEqual({ data: 'test' });
    });

    it('should timeout after specified duration', async () => {
      // Use real timers for this test since Promise.race with setTimeout is tricky with fake timers
      vi.useRealTimers();

      mockSendMessage.mockImplementation(
        () => new Promise(() => {}) // Never resolves
      );

      await expect(
        MessageBus.send('keychainLocked', { locked: true }, 'background', {
          timeout: 50, // Short timeout for test
        })
      ).rejects.toThrow('Message timeout after 50ms');
    });

    it('should resolve before timeout when response is fast', async () => {
      mockSendMessage.mockResolvedValueOnce({ success: true });

      const result = await MessageBus.send('keychainLocked', { locked: true }, 'background', {
        timeout: 5000,
      });

      expect(result).toEqual({ success: true });
    });

    it('should retry on failure', async () => {
      mockSendMessage
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({ success: true });

      const sendPromise = MessageBus.send('keychainLocked', { locked: true }, 'background', {
        retries: 2,
      });

      await vi.runAllTimersAsync();
      const result = await sendPromise;

      expect(result).toEqual({ success: true });
      expect(mockSendMessage).toHaveBeenCalledTimes(3);
    });

    it('should throw after all retries exhausted', async () => {
      // Reject exactly 3 times (initial + 2 retries)
      mockSendMessage
        .mockRejectedValueOnce(new Error('Persistent error'))
        .mockRejectedValueOnce(new Error('Persistent error'))
        .mockRejectedValueOnce(new Error('Persistent error'));

      // Attach rejection handler BEFORE running timers to prevent unhandled rejection
      const sendPromise = MessageBus.send('keychainLocked', { locked: true }, 'background', {
        retries: 2,
      }).catch((e: Error) => e);

      await vi.runAllTimersAsync();

      // Verify the rejection
      const error = await sendPromise;
      expect((error as Error).message).toBe('Persistent error');
      expect(mockSendMessage).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });

    it('should not require readiness check for non-background targets', async () => {
      // Reset background ready state
      (MessageBus as any).backgroundReady = false;
      mockSendMessage.mockResolvedValueOnce({ success: true });

      await MessageBus.send('keychainLocked', { locked: true }, 'popup');

      // Should not have called startup-health-check
      expect(mockSendMessage).not.toHaveBeenCalledWith('startup-health-check', {}, 'background');
    });
  });

  describe('sendOneWay', () => {
    beforeEach(() => {
      (MessageBus as any).backgroundReady = true;
    });

    it('should not throw on timeout', async () => {
      mockSendMessage.mockImplementation(() => new Promise(() => {}));

      const sendPromise = MessageBus.sendOneWay('keychainLocked', { locked: true }, 'popup');

      await vi.runAllTimersAsync();

      // Should not throw
      await expect(sendPromise).resolves.toBeUndefined();
    });

    it('should not throw on handler not registered error', async () => {
      mockSendMessage.mockRejectedValueOnce(new Error('No handler registered'));

      await expect(
        MessageBus.sendOneWay('keychainLocked', { locked: true }, 'popup')
      ).resolves.toBeUndefined();
    });

    it('should send message with 5 second timeout', async () => {
      mockSendMessage.mockImplementation(() => new Promise(() => {}));

      const sendPromise = MessageBus.sendOneWay('keychainLocked', { locked: true }, 'popup');

      // At 4999ms should not have resolved
      vi.advanceTimersByTime(4999);

      // At 5000ms should resolve (silently fail)
      vi.advanceTimersByTime(1);
      await vi.runAllTimersAsync();

      await expect(sendPromise).resolves.toBeUndefined();
    });
  });

  describe('onMessage', () => {
    it('should register handler with webext-bridge', () => {
      const handler = vi.fn();

      MessageBus.onMessage('keychainLocked', handler);

      expect(mockOnMessage).toHaveBeenCalledWith('keychainLocked', expect.any(Function));
    });

    it('should wrap handler to extract data', async () => {
      const handler = vi.fn().mockResolvedValue({ result: 'test' });
      let registeredHandler: any;

      mockOnMessage.mockImplementation((message, fn) => {
        registeredHandler = fn;
      });

      MessageBus.onMessage('keychainLocked', handler);

      // Simulate receiving a message
      const result = await registeredHandler({ data: { locked: true } });

      expect(handler).toHaveBeenCalledWith({ locked: true });
      expect(result).toEqual({ result: 'test' });
    });

    it('should propagate handler errors', async () => {
      const handler = vi.fn().mockRejectedValue(new Error('Handler error'));
      let registeredHandler: any;

      mockOnMessage.mockImplementation((message, fn) => {
        registeredHandler = fn;
      });

      MessageBus.onMessage('keychainLocked', handler);

      await expect(registeredHandler({ data: { locked: true } })).rejects.toThrow('Handler error');
    });
  });

  describe('broadcastEvent', () => {
    beforeEach(() => {
      (MessageBus as any).backgroundReady = true;
    });

    it('should send to popup and content-script by default', async () => {
      mockSendMessage.mockResolvedValue(undefined);

      await MessageBus.broadcastEvent('accountsChanged', ['0x123']);

      expect(mockSendMessage).toHaveBeenCalledWith(
        'provider-event',
        expect.objectContaining({
          type: 'PROVIDER_EVENT',
          event: 'accountsChanged',
          data: ['0x123'],
        }),
        'popup'
      );
      expect(mockSendMessage).toHaveBeenCalledWith(
        'provider-event',
        expect.objectContaining({
          type: 'PROVIDER_EVENT',
          event: 'accountsChanged',
          data: ['0x123'],
        }),
        'content-script'
      );
    });

    it('should send to custom targets', async () => {
      mockSendMessage.mockResolvedValue(undefined);

      await MessageBus.broadcastEvent('customEvent', { foo: 'bar' }, ['options', 'devtools']);

      expect(mockSendMessage).toHaveBeenCalledWith(
        'provider-event',
        expect.objectContaining({ event: 'customEvent' }),
        'options'
      );
      expect(mockSendMessage).toHaveBeenCalledWith(
        'provider-event',
        expect.objectContaining({ event: 'customEvent' }),
        'devtools'
      );
    });

    it('should not throw if some targets fail', async () => {
      mockSendMessage
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('Content script not available'));

      await expect(MessageBus.broadcastEvent('event', {})).resolves.toBeUndefined();
    });
  });

  describe('sendProviderRequest', () => {
    beforeEach(() => {
      (MessageBus as any).backgroundReady = true;
    });

    it('should construct and send provider message', async () => {
      mockSendMessage.mockResolvedValueOnce({ success: true, data: 'result' });

      const result = await MessageBus.sendProviderRequest(
        'https://example.com',
        'xcp_getBalances',
        ['param1', 'param2'],
        { source: 'test' }
      );

      expect(mockSendMessage).toHaveBeenCalledWith(
        'provider-request',
        expect.objectContaining({
          type: 'PROVIDER_REQUEST',
          origin: 'https://example.com',
          data: {
            method: 'xcp_getBalances',
            params: ['param1', 'param2'],
            metadata: { source: 'test' },
          },
          xcpWalletVersion: '2.0',
          timestamp: expect.any(Number),
        }),
        'background'
      );
      expect(result).toBe('result');
    });

    it('should throw on failed response', async () => {
      mockSendMessage.mockResolvedValueOnce({
        success: false,
        error: { message: 'Request denied' },
      });

      await expect(
        MessageBus.sendProviderRequest('https://example.com', 'xcp_signMessage', [])
      ).rejects.toThrow('Request denied');
    });

    it('should throw generic error if no message provided', async () => {
      mockSendMessage.mockResolvedValueOnce({ success: false });

      await expect(
        MessageBus.sendProviderRequest('https://example.com', 'xcp_signMessage', [])
      ).rejects.toThrow('Provider request failed');
    });
  });

  describe('notifyKeychainLocked', () => {
    it('should send one-way message to popup', async () => {
      mockSendMessage.mockResolvedValue(undefined);

      await MessageBus.notifyKeychainLocked(true);

      expect(mockSendMessage).toHaveBeenCalledWith('keychainLocked', { locked: true }, 'popup');
    });
  });

  describe('resolveApprovalRequest', () => {
    beforeEach(() => {
      (MessageBus as any).backgroundReady = true;
    });

    it('should send approval resolution to background', async () => {
      mockSendMessage.mockResolvedValueOnce({ status: 'ready' });
      mockSendMessage.mockResolvedValueOnce({ success: true });

      await MessageBus.resolveApprovalRequest('req-123', true, { amount: 100 });

      expect(mockSendMessage).toHaveBeenCalledWith(
        'resolve-provider-request',
        {
          type: 'RESOLVE_PROVIDER_REQUEST',
          requestId: 'req-123',
          approved: true,
          updatedParams: { amount: 100 },
        },
        'background'
      );
    });

    it('should work with rejected approval', async () => {
      mockSendMessage.mockResolvedValue({ success: true });

      await MessageBus.resolveApprovalRequest('req-456', false);

      expect(mockSendMessage).toHaveBeenCalledWith(
        'resolve-provider-request',
        expect.objectContaining({
          requestId: 'req-456',
          approved: false,
          updatedParams: undefined,
        }),
        'background'
      );
    });
  });

  describe('getServiceHealth', () => {
    beforeEach(() => {
      (MessageBus as any).backgroundReady = true;
    });

    it('should request health status for all services', async () => {
      mockSendMessage.mockResolvedValueOnce({
        walletService: { status: 'running' },
        providerService: { status: 'running' },
      });

      const health = await MessageBus.getServiceHealth();

      expect(mockSendMessage).toHaveBeenCalledWith(
        'service-health-check',
        { serviceNames: undefined },
        'background'
      );
      expect(health).toEqual({
        walletService: { status: 'running' },
        providerService: { status: 'running' },
      });
    });

    it('should request health for specific services', async () => {
      mockSendMessage.mockResolvedValueOnce({
        walletService: { status: 'running' },
      });

      await MessageBus.getServiceHealth(['walletService']);

      expect(mockSendMessage).toHaveBeenCalledWith(
        'service-health-check',
        { serviceNames: ['walletService'] },
        'background'
      );
    });
  });
});
