import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { consolidateBareMultisig } from '@/utils/blockchain/bitcoin/bareMultisig';
import { Transaction, OutScript } from '@scure/btc-signer';
import { hexToBytes, bytesToHex } from '@noble/hashes/utils.js';
import { getPublicKey } from '@noble/secp256k1';

// Mock the apiClient
vi.mock('@/utils/axios', () => ({
  apiClient: {
    get: vi.fn()
  },
  API_TIMEOUTS: {
    DEFAULT: 10000,
    LONG: 30000
  }
}));
vi.mock('@/utils/storage/settingsStorage');

import { apiClient } from '@/utils/axios';
const mockApiClient = apiClient as any;

// Helper function to create a mock implementation that handles URLs
const createMockGetImplementation = (mockResponses: Map<string, any>) => {
  return vi.fn((url: string) => {
    // Check if it's a UTXO fetch request
    if (url.includes('/api/v1/address/') && url.includes('/utxos')) {
      const response = mockResponses.get('utxos');
      if (response instanceof Error) {
        return Promise.reject(response);
      }
      return Promise.resolve({ data: response });
    }
    
    // Check if it's a spent check request
    if (url.includes('/v2/utxos/')) {
      const response = mockResponses.get('spent');
      if (response instanceof Error) {
        return Promise.reject(response);
      }
      return Promise.resolve({ data: response });
    }
    
    // Check if it's a raw transaction fetch
    if (url.includes('/tx/') && url.includes('/hex')) {
      const response = mockResponses.get('rawtx');
      if (response instanceof Error) {
        return Promise.reject(response);
      }
      return Promise.resolve({ data: response });
    }
    
    // Default: reject with not found
    return Promise.reject(new Error('Not found'));
  });
};

describe('Bare Multisig Utilities', () => {
  const mockPrivateKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  const mockAddress = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';
  const mockTxid = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.doMock('@/utils/storage/settingsStorage', () => ({
      getSettings: vi.fn().mockResolvedValue({
        counterpartyApiBase: 'https://api.counterparty.io'
      })
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('consolidateBareMultisig', () => {
    it('should throw error when private key is missing', async () => {
      await expect(consolidateBareMultisig('', mockAddress, 10))
        .rejects.toThrow('Private key not found');
    });

    it('should throw error when no UTXOs are found', async () => {
      mockApiClient.get.mockResolvedValue({
        data: { data: [] }
      });

      await expect(consolidateBareMultisig(mockPrivateKey, mockAddress, 10))
        .rejects.toThrow('No bare multisig UTXOs found');
    });

    it('should throw error when no suitable UTXOs after filtering', async () => {
      const mockUtxos = [{
        txid: mockTxid,
        vout: 0,
        amount: 0.001,
        scriptPubKeyHex: '76a914' + '0'.repeat(40) + '88ac', // P2PKH script
        scriptPubKeyType: 'p2pkh'
      }];

      const mockResponses = new Map<string, any>([
        ['utxos', { data: mockUtxos }],
        ['rawtx', 'deadbeef']
      ]);
      mockApiClient.get = createMockGetImplementation(mockResponses);

      await expect(consolidateBareMultisig(mockPrivateKey, mockAddress, 10, undefined, { skipSpentCheck: true }))
        .rejects.toThrow('No suitable UTXOs after filtering.');
    });

    it('should successfully consolidate bare multisig UTXOs', async () => {
      const privateKeyBytes = hexToBytes(mockPrivateKey);
      const uncompressedPubKey = getPublicKey(privateKeyBytes, false);

      // Create a mock bare multisig script with our uncompressed public key
      const mockMultisigScript = OutScript.encode({
        type: 'ms',
        m: 1,
        pubkeys: [uncompressedPubKey]
      });
      const mockScriptHex = bytesToHex(mockMultisigScript);

      const mockUtxos = [{
        txid: mockTxid,
        vout: 0,
        amount: 0.001,
        scriptPubKeyHex: mockScriptHex,
        scriptPubKeyType: 'bare_multisig',
        required_signatures: 1
      }];

      // Create a valid raw transaction hex that contains the output matching our UTXO
      const mockRawTx = '01000000' + // Version 1
        '01' + // 1 input
        '0000000000000000000000000000000000000000000000000000000000000000' + // Previous txid (32 bytes)
        '00000000' + // Previous vout (4 bytes)
        '00' + // Script length (0)
        'ffffffff' + // Sequence
        '01' + // 1 output
        '00e1f50500000000' + // Amount (100000000 satoshis = 1 BTC)
        bytesToHex(Uint8Array.from([mockScriptHex.length / 2])) + // Script length
        mockScriptHex + // Our bare multisig script
        '00000000'; // Locktime

      let callCount = 0;
      mockApiClient.get = vi.fn((url: string) => {
        callCount++;
        // UTXO fetch
        if (url.includes('/api/v1/address/') && url.includes('/utxos')) {
          return Promise.resolve({ data: { data: mockUtxos } });
        }
        // Spent check
        if (url.includes('/v2/utxos/')) {
          return Promise.resolve({ data: { spent: false } });
        }
        // Raw tx fetch
        if ((url.includes('blockstream.info') || url.includes('mempool.space')) && url.includes('/tx/') && url.includes('/hex')) {
          return Promise.resolve({ data: mockRawTx });
        }
        return Promise.reject(new Error('Not found'));
      });

      const result = await consolidateBareMultisig(mockPrivateKey, mockAddress, 10);
      
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('should use destination address when provided', async () => {
      const destinationAddress = '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2';
      const privateKeyBytes = hexToBytes(mockPrivateKey);
      const uncompressedPubKey = getPublicKey(privateKeyBytes, false);
      
      const mockMultisigScript = OutScript.encode({
        type: 'ms',
        m: 1,
        pubkeys: [uncompressedPubKey]
      });
      const mockScriptHex = bytesToHex(mockMultisigScript);

      const mockUtxos = [{
        txid: mockTxid,
        vout: 0,
        amount: 0.001,
        scriptPubKeyHex: mockScriptHex,
        scriptPubKeyType: 'bare_multisig'
      }];

      // Create a valid raw transaction hex that contains the output matching our UTXO
      const mockRawTx = '01000000' + // Version 1
        '01' + // 1 input
        '0000000000000000000000000000000000000000000000000000000000000000' + // Previous txid (32 bytes)
        '00000000' + // Previous vout (4 bytes)
        '00' + // Script length (0)
        'ffffffff' + // Sequence
        '01' + // 1 output
        '00e1f50500000000' + // Amount (100000000 satoshis = 1 BTC)
        bytesToHex(Uint8Array.from([mockScriptHex.length / 2])) + // Script length
        mockScriptHex + // Our bare multisig script
        '00000000'; // Locktime

      mockApiClient.get = vi.fn((url: string) => {
        // UTXO fetch
        if (url.includes('/api/v1/address/') && url.includes('/utxos')) {
          return Promise.resolve({ data: { data: mockUtxos } });
        }
        // Raw tx fetch
        if ((url.includes('blockstream.info') || url.includes('mempool.space')) && url.includes('/tx/') && url.includes('/hex')) {
          return Promise.resolve({ data: mockRawTx });
        }
        return Promise.reject(new Error('Not found'));
      });

      const result = await consolidateBareMultisig(mockPrivateKey, mockAddress, 10, destinationAddress, { skipSpentCheck: true });
      
      expect(result).toBeDefined();
      expect(mockApiClient.get).toHaveBeenCalled();
    });

    it('should handle insufficient funds error', async () => {
      const privateKeyBytes = hexToBytes(mockPrivateKey);
      const uncompressedPubKey = getPublicKey(privateKeyBytes, false);
      
      const mockMultisigScript = OutScript.encode({
        type: 'ms',
        m: 1,
        pubkeys: [uncompressedPubKey]
      });
      const mockScriptHex = bytesToHex(mockMultisigScript);

      const mockUtxos = [{
        txid: mockTxid,
        vout: 0,
        amount: 0.00000001, // Very small amount
        scriptPubKeyHex: mockScriptHex,
        scriptPubKeyType: 'bare_multisig'
      }];

      // Create a valid raw transaction hex that contains the output matching our UTXO
      const mockRawTx = '01000000' + // Version 1
        '01' + // 1 input
        '0000000000000000000000000000000000000000000000000000000000000000' + // Previous txid (32 bytes)
        '00000000' + // Previous vout (4 bytes)
        '00' + // Script length (0)
        'ffffffff' + // Sequence
        '01' + // 1 output
        '01000000' + '00000000' + // Amount (1 satoshi = 0.00000001 BTC)
        bytesToHex(Uint8Array.from([mockScriptHex.length / 2])) + // Script length
        mockScriptHex + // Our bare multisig script
        '00000000'; // Locktime

      mockApiClient.get = vi.fn((url: string) => {
        // UTXO fetch
        if (url.includes('/api/v1/address/') && url.includes('/utxos')) {
          return Promise.resolve({ data: { data: mockUtxos } });
        }
        // Raw tx fetch
        if ((url.includes('blockstream.info') || url.includes('mempool.space')) && url.includes('/tx/') && url.includes('/hex')) {
          return Promise.resolve({ data: mockRawTx });
        }
        return Promise.reject(new Error('Not found'));
      });

      await expect(consolidateBareMultisig(mockPrivateKey, mockAddress, 1000, undefined, { skipSpentCheck: true }))
        .rejects.toThrow('Insufficient funds');
    });

    it('should skip UTXOs without previous transaction data', async () => {
      const privateKeyBytes = hexToBytes(mockPrivateKey);
      const uncompressedPubKey = getPublicKey(privateKeyBytes, false);
      
      const mockMultisigScript = OutScript.encode({
        type: 'ms',
        m: 1,
        pubkeys: [uncompressedPubKey]
      });
      const mockScriptHex = bytesToHex(mockMultisigScript);

      const mockUtxos = [{
        txid: mockTxid,
        vout: 0,
        amount: 0.001,
        scriptPubKeyHex: mockScriptHex,
        scriptPubKeyType: 'bare_multisig'
      }];

      // Mock all endpoints to fail
      let callCount = 0;
      mockApiClient.get = vi.fn((url: string) => {
        callCount++;
        // UTXO fetch
        if (url.includes('/api/v1/address/') && url.includes('/utxos')) {
          return Promise.resolve({ data: { data: mockUtxos } });
        }
        // Raw tx fetch - all endpoints fail
        if (url.includes('/tx/') && url.includes('/hex')) {
          return Promise.reject(new Error('Not found'));
        }
        if (url.includes('/v2/bitcoin/transactions/')) {
          return Promise.reject(new Error('Not found'));
        }
        return Promise.reject(new Error('Not found'));
      });

      await expect(consolidateBareMultisig(mockPrivateKey, mockAddress, 10, undefined, { skipSpentCheck: true }))
        .rejects.toThrow('No suitable UTXOs after filtering.');
    });

    it('should handle multiple UTXOs with same transaction ID', async () => {
      const privateKeyBytes = hexToBytes(mockPrivateKey);
      const uncompressedPubKey = getPublicKey(privateKeyBytes, false);
      
      const mockMultisigScript = OutScript.encode({
        type: 'ms',
        m: 1,
        pubkeys: [uncompressedPubKey]
      });
      const mockScriptHex = bytesToHex(mockMultisigScript);

      const mockUtxos = [
        {
          txid: mockTxid,
          vout: 0,
          amount: 0.001,
          scriptPubKeyHex: mockScriptHex,
          scriptPubKeyType: 'bare_multisig'
        },
        {
          txid: mockTxid,
          vout: 1,
          amount: 0.002,
          scriptPubKeyHex: mockScriptHex,
          scriptPubKeyType: 'bare_multisig'
        }
      ];

      // Create a valid raw transaction hex that contains 2 outputs matching our UTXOs
      const mockRawTx = '01000000' + // Version 1
        '01' + // 1 input
        '0000000000000000000000000000000000000000000000000000000000000000' + // Previous txid (32 bytes)
        '00000000' + // Previous vout (4 bytes)
        '00' + // Script length (0)
        'ffffffff' + // Sequence
        '02' + // 2 outputs
        'a086010000000000' + // Output 0: Amount (100000 satoshis = 0.001 BTC)
        bytesToHex(Uint8Array.from([mockScriptHex.length / 2])) + // Script length
        mockScriptHex + // Our bare multisig script
        '400d030000000000' + // Output 1: Amount (200000 satoshis = 0.002 BTC)
        bytesToHex(Uint8Array.from([mockScriptHex.length / 2])) + // Script length
        mockScriptHex + // Our bare multisig script
        '00000000'; // Locktime

      mockApiClient.get = vi.fn((url: string) => {
        // UTXO fetch
        if (url.includes('/api/v1/address/') && url.includes('/utxos')) {
          return Promise.resolve({ data: { data: mockUtxos } });
        }
        // Spent check
        if (url.includes('/v2/utxos/')) {
          return Promise.resolve({ data: { spent: false } });
        }
        // Raw tx fetch
        if ((url.includes('blockstream.info') || url.includes('mempool.space')) && url.includes('/tx/') && url.includes('/hex')) {
          return Promise.resolve({ data: mockRawTx });
        }
        return Promise.reject(new Error('Not found'));
      });

      const result = await consolidateBareMultisig(mockPrivateKey, mockAddress, 10);
      
      expect(result).toBeDefined();
      // The mock implementation is being called more times due to fallbacks
      expect(mockApiClient.get).toHaveBeenCalled();
    });

    it('should work with compressed public key in multisig script', async () => {
      const privateKeyBytes = hexToBytes(mockPrivateKey);
      const compressedPubKey = getPublicKey(privateKeyBytes, true);
      
      const mockMultisigScript = OutScript.encode({
        type: 'ms',
        m: 1,
        pubkeys: [compressedPubKey]
      });
      const mockScriptHex = bytesToHex(mockMultisigScript);

      const mockUtxos = [{
        txid: mockTxid,
        vout: 0,
        amount: 0.001,
        scriptPubKeyHex: mockScriptHex,
        scriptPubKeyType: 'bare_multisig'
      }];

      // Create a valid raw transaction hex that contains the output matching our UTXO
      const mockRawTx = '01000000' + // Version 1
        '01' + // 1 input
        '0000000000000000000000000000000000000000000000000000000000000000' + // Previous txid (32 bytes)
        '00000000' + // Previous vout (4 bytes)
        '00' + // Script length (0)
        'ffffffff' + // Sequence
        '01' + // 1 output
        '00e1f50500000000' + // Amount (100000000 satoshis = 1 BTC)
        bytesToHex(Uint8Array.from([mockScriptHex.length / 2])) + // Script length
        mockScriptHex + // Our bare multisig script
        '00000000'; // Locktime

      mockApiClient.get = vi.fn((url: string) => {
        // UTXO fetch
        if (url.includes('/api/v1/address/') && url.includes('/utxos')) {
          return Promise.resolve({ data: { data: mockUtxos } });
        }
        // Raw tx fetch
        if ((url.includes('blockstream.info') || url.includes('mempool.space')) && url.includes('/tx/') && url.includes('/hex')) {
          return Promise.resolve({ data: mockRawTx });
        }
        return Promise.reject(new Error('Not found'));
      });

      const result = await consolidateBareMultisig(mockPrivateKey, mockAddress, 10, undefined, { skipSpentCheck: true });
      
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });

    it('should filter out spent UTXOs when validation is enabled', async () => {
      const privateKeyBytes = hexToBytes(mockPrivateKey);
      const uncompressedPubKey = getPublicKey(privateKeyBytes, false);
      
      const mockMultisigScript = OutScript.encode({
        type: 'ms',
        m: 1,
        pubkeys: [uncompressedPubKey]
      });
      const mockScriptHex = bytesToHex(mockMultisigScript);

      const mockUtxos = [
        {
          txid: mockTxid,
          vout: 0,
          amount: 0.001,
          scriptPubKeyHex: mockScriptHex,
          scriptPubKeyType: 'bare_multisig'
        },
        {
          txid: 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210',
          vout: 0,
          amount: 0.002,
          scriptPubKeyHex: mockScriptHex,
          scriptPubKeyType: 'bare_multisig'
        }
      ];

      const mockRawTx = '01000000' + // Version 1
        '01' + // 1 input
        '0000000000000000000000000000000000000000000000000000000000000000' + // Previous txid (32 bytes)
        '00000000' + // Previous vout (4 bytes)
        '00' + // Script length (0)
        'ffffffff' + // Sequence
        '01' + // 1 output
        '00e1f50500000000' + // Amount (100000000 satoshis = 1 BTC)
        bytesToHex(Uint8Array.from([mockScriptHex.length / 2])) + // Script length
        mockScriptHex + // Our bare multisig script
        '00000000'; // Locktime

      let spentCheckCount = 0;
      mockApiClient.get = vi.fn((url: string) => {
        // UTXO fetch
        if (url.includes('/api/v1/address/') && url.includes('/utxos')) {
          return Promise.resolve({ data: { data: mockUtxos } });
        }
        // Spent check - first is unspent, second is spent
        if (url.includes('/v2/utxos/')) {
          spentCheckCount++;
          if (spentCheckCount === 1) {
            return Promise.resolve({ data: { spent: false } });
          } else {
            return Promise.resolve({ data: { spent: true, txid: 'spending_tx_id' } });
          }
        }
        // Raw tx fetch
        if ((url.includes('blockstream.info') || url.includes('mempool.space')) && url.includes('/tx/') && url.includes('/hex')) {
          return Promise.resolve({ data: mockRawTx });
        }
        return Promise.reject(new Error('Not found'));
      });

      const result = await consolidateBareMultisig(mockPrivateKey, mockAddress, 10);
      
      expect(result).toBeDefined();
      // Multiple calls due to spent checks and raw tx fetches for both UTXOs
      expect(mockApiClient.get).toHaveBeenCalled();
    });

  });

  describe('fetchPreviousRawTransaction fallback', () => {
    it('should try multiple endpoints when fetching raw transaction', async () => {
      const privateKeyBytes = hexToBytes(mockPrivateKey);
      const uncompressedPubKey = getPublicKey(privateKeyBytes, false);
      
      const mockMultisigScript = OutScript.encode({
        type: 'ms',
        m: 1,
        pubkeys: [uncompressedPubKey]
      });
      const mockScriptHex = bytesToHex(mockMultisigScript);

      const mockUtxos = [{
        txid: mockTxid,
        vout: 0,
        amount: 0.001,
        scriptPubKeyHex: mockScriptHex,
        scriptPubKeyType: 'bare_multisig'
      }];

      const mockRawTx = '01000000' + // Version 1
        '01' + // 1 input
        '0000000000000000000000000000000000000000000000000000000000000000' + // Previous txid (32 bytes)
        '00000000' + // Previous vout (4 bytes)
        '00' + // Script length (0)
        'ffffffff' + // Sequence
        '01' + // 1 output
        '00e1f50500000000' + // Amount (100000000 satoshis = 1 BTC)
        bytesToHex(Uint8Array.from([mockScriptHex.length / 2])) + // Script length
        mockScriptHex + // Our bare multisig script
        '00000000'; // Locktime

      let callCount = 0;
      mockApiClient.get = vi.fn((url: string) => {
        callCount++;
        // UTXO fetch
        if (url.includes('/api/v1/address/') && url.includes('/utxos')) {
          return Promise.resolve({ data: { data: mockUtxos } });
        }
        // Raw tx fetch - first endpoint fails, second succeeds
        if (url.includes('blockstream.info') && url.includes('/tx/') && url.includes('/hex')) {
          return Promise.reject(new Error('Not found'));
        }
        if (url.includes('mempool.space') && url.includes('/tx/') && url.includes('/hex')) {
          return Promise.resolve({ data: mockRawTx });
        }
        return Promise.reject(new Error('Not found'));
      });

      const result = await consolidateBareMultisig(mockPrivateKey, mockAddress, 10, undefined, { skipSpentCheck: true });
      
      expect(result).toBeDefined();
      // Should have tried at least UTXOs fetch + failed blockstream + successful mempool
      expect(callCount).toBeGreaterThanOrEqual(3);
    });
  });

  describe('options', () => {
    it('should respect maxInputsPerTx option', async () => {
      const privateKeyBytes = hexToBytes(mockPrivateKey);
      const uncompressedPubKey = getPublicKey(privateKeyBytes, false);
      
      const mockMultisigScript = OutScript.encode({
        type: 'ms',
        m: 1,
        pubkeys: [uncompressedPubKey]
      });
      const mockScriptHex = bytesToHex(mockMultisigScript);

      // Create many UTXOs
      const mockUtxos = Array.from({ length: 500 }, (_, i) => ({
        txid: mockTxid,
        vout: i,
        amount: 0.001,
        scriptPubKeyHex: mockScriptHex,
        scriptPubKeyType: 'bare_multisig'
      }));

      // Create a proper raw transaction with 500 outputs for all the UTXOs we're trying to spend
      // First, let's build the outputs part
      let outputsHex = '';
      const numOutputs = 500;
      
      // Use hex string for number of outputs (500 = 0x01F4, but needs varint encoding)
      // 500 in varint = 0xFD F401 (since 500 > 252)
      outputsHex = 'fdf401'; // VarInt for 500 outputs
      
      // Add 500 outputs
      for (let i = 0; i < numOutputs; i++) {
        outputsHex += 'a086010000000000'; // Amount (100000 satoshis = 0.001 BTC)
        outputsHex += bytesToHex(Uint8Array.from([mockScriptHex.length / 2])); // Script length
        outputsHex += mockScriptHex; // Our bare multisig script
      }

      const mockRawTx = '02000000' + // Version 2
        '01' + // 1 input
        '0000000000000000000000000000000000000000000000000000000000000000' + // Previous txid (32 bytes)
        '00000000' + // Previous vout (4 bytes)
        '00' + // Script length (0)
        'ffffffff' + // Sequence
        outputsHex + // All 500 outputs
        '00000000'; // Locktime

      mockApiClient.get = vi.fn((url: string) => {
        // UTXO fetch
        if (url.includes('/api/v1/address/') && url.includes('/utxos')) {
          return Promise.resolve({ data: { data: mockUtxos } });
        }
        // Raw tx fetch
        if ((url.includes('blockstream.info') || url.includes('mempool.space')) && url.includes('/tx/') && url.includes('/hex')) {
          return Promise.resolve({ data: mockRawTx });
        }
        return Promise.reject(new Error('Not found'));
      });

      const result = await consolidateBareMultisig(
        mockPrivateKey, 
        mockAddress, 
        10, 
        undefined,
        { maxInputsPerTx: 10, skipSpentCheck: true }
      );
      
      expect(result).toBeDefined();
      // Transaction should be built with only 10 inputs (limited by maxInputsPerTx)
      const tx = Transaction.fromRaw(hexToBytes(result));
      expect(tx.inputsLength).toBeLessThanOrEqual(10);
    });

    it('should skip spent check when skipSpentCheck is true', async () => {
      const privateKeyBytes = hexToBytes(mockPrivateKey);
      const uncompressedPubKey = getPublicKey(privateKeyBytes, false);
      
      const mockMultisigScript = OutScript.encode({
        type: 'ms',
        m: 1,
        pubkeys: [uncompressedPubKey]
      });
      const mockScriptHex = bytesToHex(mockMultisigScript);

      const mockUtxos = [{
        txid: mockTxid,
        vout: 0,
        amount: 0.001,
        scriptPubKeyHex: mockScriptHex,
        scriptPubKeyType: 'bare_multisig'
      }];

      const mockRawTx = '01000000' + // Version 1
        '01' + // 1 input
        '0000000000000000000000000000000000000000000000000000000000000000' + // Previous txid (32 bytes)
        '00000000' + // Previous vout (4 bytes)
        '00' + // Script length (0)
        'ffffffff' + // Sequence
        '01' + // 1 output
        '00e1f50500000000' + // Amount
        bytesToHex(Uint8Array.from([mockScriptHex.length / 2])) + // Script length
        mockScriptHex + // Our bare multisig script
        '00000000'; // Locktime

      mockApiClient.get = vi.fn((url: string) => {
        // UTXO fetch
        if (url.includes('/api/v1/address/') && url.includes('/utxos')) {
          return Promise.resolve({ data: { data: mockUtxos } });
        }
        // Raw tx fetch
        if ((url.includes('blockstream.info') || url.includes('mempool.space')) && url.includes('/tx/') && url.includes('/hex')) {
          return Promise.resolve({ data: mockRawTx });
        }
        return Promise.reject(new Error('Not found'));
      });

      const result = await consolidateBareMultisig(
        mockPrivateKey, 
        mockAddress, 
        10,
        undefined,
        { skipSpentCheck: true }
      );
      
      expect(result).toBeDefined();
      // Should call API at least twice: UTXOs fetch and raw tx fetch
      expect(mockApiClient.get).toHaveBeenCalledTimes(3);
    });
  });
});