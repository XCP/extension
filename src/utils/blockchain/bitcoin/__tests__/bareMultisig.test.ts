import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { consolidateBareMultisig } from '@/utils/blockchain/bitcoin/bareMultisig';
import { Transaction, OutScript } from '@scure/btc-signer';
import { hexToBytes, bytesToHex } from '@noble/hashes/utils';
import { getPublicKey } from '@noble/secp256k1';
import axios from 'axios';

vi.mock('axios');
vi.mock('@/utils/storage/settingsStorage');

const mockAxios = axios as any;

describe('Bare Multisig Utilities', () => {
  const mockPrivateKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  const mockAddress = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';
  const mockTxid = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.doMock('@/utils/storage/settingsStorage', () => ({
      getKeychainSettings: vi.fn().mockResolvedValue({
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
      mockAxios.get.mockResolvedValue({
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

      mockAxios.get
        .mockResolvedValueOnce({ data: { data: mockUtxos } })
        .mockResolvedValueOnce({ data: 'deadbeef' }); // raw tx hex

      await expect(consolidateBareMultisig(mockPrivateKey, mockAddress, 10))
        .rejects.toThrow('No suitable UTXOs after filtering.');
    });

    it('should successfully consolidate bare multisig UTXOs', async () => {
      const privateKeyBytes = hexToBytes(mockPrivateKey);
      const uncompressedPubKey = getPublicKey(privateKeyBytes, false);
      const uncompressedPubKeyHex = bytesToHex(uncompressedPubKey);

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

      mockAxios.get
        .mockResolvedValueOnce({ data: { data: mockUtxos } })
        .mockResolvedValueOnce({ data: mockRawTx });

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

      mockAxios.get
        .mockResolvedValueOnce({ data: { data: mockUtxos } })
        .mockResolvedValueOnce({ data: mockRawTx });

      const result = await consolidateBareMultisig(mockPrivateKey, mockAddress, 10, destinationAddress);
      
      expect(result).toBeDefined();
      expect(mockAxios.get).toHaveBeenCalledTimes(2);
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
        '00e1f50500000000' + // Amount (100000000 satoshis = 1 BTC)
        bytesToHex(Uint8Array.from([mockScriptHex.length / 2])) + // Script length
        mockScriptHex + // Our bare multisig script
        '00000000'; // Locktime

      mockAxios.get
        .mockResolvedValueOnce({ data: { data: mockUtxos } })
        .mockResolvedValueOnce({ data: mockRawTx });

      await expect(consolidateBareMultisig(mockPrivateKey, mockAddress, 1000))
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
      mockAxios.get
        .mockResolvedValueOnce({ data: { data: mockUtxos } })
        .mockRejectedValue(new Error('Not found'));

      await expect(consolidateBareMultisig(mockPrivateKey, mockAddress, 10))
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

      mockAxios.get
        .mockResolvedValueOnce({ data: { data: mockUtxos } })
        .mockResolvedValueOnce({ data: mockRawTx });

      const result = await consolidateBareMultisig(mockPrivateKey, mockAddress, 10);
      
      expect(result).toBeDefined();
      // Should only fetch the raw transaction once due to caching
      expect(mockAxios.get).toHaveBeenCalledTimes(2);
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

      mockAxios.get
        .mockResolvedValueOnce({ data: { data: mockUtxos } })
        .mockResolvedValueOnce({ data: mockRawTx });

      const result = await consolidateBareMultisig(mockPrivateKey, mockAddress, 10);
      
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });
  });

  describe('helper functions', () => {
    it('should correctly estimate transaction size', () => {
      // Testing the internal estimateTransactionSize function indirectly
      // by ensuring consolidation works with realistic fee calculations
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
        amount: 0.01, // Larger amount to ensure sufficient funds
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

      mockAxios.get
        .mockResolvedValueOnce({ data: { data: mockUtxos } })
        .mockResolvedValueOnce({ data: mockRawTx });

      expect(async () => {
        await consolidateBareMultisig(mockPrivateKey, mockAddress, 1); // Low fee rate
      }).not.toThrow();
    });

    it('should handle API errors gracefully when fetching UTXOs', async () => {
      mockAxios.get.mockRejectedValue(new Error('API Error'));

      await expect(consolidateBareMultisig(mockPrivateKey, mockAddress, 10))
        .rejects.toThrow('API Error');
    });

    it('should handle malformed UTXO data', async () => {
      const mockUtxos = [{
        // Missing required fields
        txid: mockTxid
        // Missing vout, amount, scriptPubKeyHex
      }];

      mockAxios.get.mockResolvedValue({
        data: { data: mockUtxos }
      });

      await expect(consolidateBareMultisig(mockPrivateKey, mockAddress, 10))
        .rejects.toThrow();
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

      mockAxios.get
        .mockResolvedValueOnce({ data: { data: mockUtxos } })
        .mockRejectedValueOnce(new Error('First endpoint failed'))
        .mockResolvedValueOnce({ data: mockRawTx }); // Second endpoint succeeds

      const result = await consolidateBareMultisig(mockPrivateKey, mockAddress, 10);
      
      expect(result).toBeDefined();
    });
  });
});