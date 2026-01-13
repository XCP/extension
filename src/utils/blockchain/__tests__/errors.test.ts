import { describe, it, expect } from 'vitest';
import { CounterpartyApiError, BlockchainError, isBlockchainError, DataFetchError, isDataFetchError } from '../errors';

describe('errors.ts', () => {
  describe('CounterpartyApiError', () => {
    it('should pass through normal error messages', () => {
      const error = new CounterpartyApiError('Asset not found', '/v2/assets/XCP');

      expect(error.message).toBe('Asset not found');
      expect(error.userMessage).toBe('Asset not found');
      expect(error.endpoint).toBe('/v2/assets/XCP');
      expect(error.code).toBe('API_UNAVAILABLE');
    });

    it('should truncate messages over 200 characters', () => {
      const longMessage = 'A'.repeat(250);
      const error = new CounterpartyApiError(longMessage, '/v2/test');

      expect(error.message).toBe(longMessage); // Original preserved
      expect(error.userMessage).toBe('A'.repeat(200) + '...'); // Truncated for user
    });

    it('should sanitize "internal server error" messages', () => {
      const error = new CounterpartyApiError('Internal Server Error: database connection failed', '/v2/test');

      expect(error.userMessage).toBe('The API encountered an error. Please try again later.');
    });

    it('should sanitize messages containing stack traces', () => {
      const error = new CounterpartyApiError('Error occurred\n  at Function.Module', '/v2/test');

      expect(error.userMessage).toBe('The API encountered an error. Please try again later.');
    });

    it('should sanitize messages containing "exception"', () => {
      const error = new CounterpartyApiError('NullPointerException in handler', '/v2/test');

      expect(error.userMessage).toBe('The API encountered an error. Please try again later.');
    });

    it('should sanitize messages containing "traceback"', () => {
      const error = new CounterpartyApiError('Traceback (most recent call last):', '/v2/test');

      expect(error.userMessage).toBe('The API encountered an error. Please try again later.');
    });

    it('should preserve statusCode when provided', () => {
      const error = new CounterpartyApiError('Not found', '/v2/test', { statusCode: 404 });

      expect(error.statusCode).toBe(404);
    });

    it('should preserve cause when provided', () => {
      const cause = new Error('Original error');
      const error = new CounterpartyApiError('API error', '/v2/test', { cause });

      expect(error.cause).toBe(cause);
    });
  });

  describe('isBlockchainError', () => {
    it('should return true for BlockchainError instances', () => {
      const error = new BlockchainError('NETWORK_ERROR', 'test');
      expect(isBlockchainError(error)).toBe(true);
    });

    it('should return true for CounterpartyApiError instances', () => {
      const error = new CounterpartyApiError('test', '/v2/test');
      expect(isBlockchainError(error)).toBe(true);
    });

    it('should return false for regular Error instances', () => {
      const error = new Error('test');
      expect(isBlockchainError(error)).toBe(false);
    });

    it('should return false for non-error values', () => {
      expect(isBlockchainError(null)).toBe(false);
      expect(isBlockchainError(undefined)).toBe(false);
      expect(isBlockchainError('error string')).toBe(false);
      expect(isBlockchainError({ message: 'fake error' })).toBe(false);
    });
  });

  describe('DataFetchError', () => {
    it('should create error with source name', () => {
      const error = new DataFetchError('Failed to fetch', 'blockstream.info');

      expect(error.message).toBe('Failed to fetch');
      expect(error.source).toBe('blockstream.info');
      expect(error.code).toBe('NETWORK_ERROR');
      expect(error.name).toBe('DataFetchError');
    });

    it('should provide default user message based on source', () => {
      const error = new DataFetchError('Connection refused', 'mempool.space');

      expect(error.userMessage).toBe('Failed to fetch data from mempool.space. Please try again.');
    });

    it('should allow custom user message', () => {
      const error = new DataFetchError('Connection refused', 'mempool.space', {
        userMessage: 'Unable to get fee rates. Check your connection.',
      });

      expect(error.userMessage).toBe('Unable to get fee rates. Check your connection.');
    });

    it('should preserve endpoint when provided', () => {
      const error = new DataFetchError('404 Not Found', 'blockstream.info', {
        endpoint: '/api/address/bc1xxx/utxo',
      });

      expect(error.endpoint).toBe('/api/address/bc1xxx/utxo');
    });

    it('should preserve statusCode when provided', () => {
      const error = new DataFetchError('Server error', 'blockchain.info', {
        statusCode: 500,
      });

      expect(error.statusCode).toBe(500);
    });

    it('should preserve cause when provided', () => {
      const cause = new Error('ECONNREFUSED');
      const error = new DataFetchError('Connection failed', 'blockcypher.com', { cause });

      expect(error.cause).toBe(cause);
    });

    it('should be a BlockchainError', () => {
      const error = new DataFetchError('test', 'test-source');

      expect(isBlockchainError(error)).toBe(true);
    });
  });

  describe('isDataFetchError', () => {
    it('should return true for DataFetchError instances', () => {
      const error = new DataFetchError('test', 'test-source');
      expect(isDataFetchError(error)).toBe(true);
    });

    it('should return false for other BlockchainError instances', () => {
      const error = new CounterpartyApiError('test', '/v2/test');
      expect(isDataFetchError(error)).toBe(false);
    });

    it('should return false for regular Error instances', () => {
      const error = new Error('test');
      expect(isDataFetchError(error)).toBe(false);
    });

    it('should return false for non-error values', () => {
      expect(isDataFetchError(null)).toBe(false);
      expect(isDataFetchError(undefined)).toBe(false);
      expect(isDataFetchError('error string')).toBe(false);
    });
  });
});
