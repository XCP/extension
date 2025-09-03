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
        // Mock UTXO validation call
        .mockResolvedValueOnce({ data: { spent: false } })
        // Mock raw tx fetch
        .mockResolvedValueOnce({ data: 'deadbeef' });

      await expect(consolidateBareMultisig(mockPrivateKey, mockAddress, 10, undefined, { skipSpentCheck: true }))
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
        // Mock UTXO validation call
        .mockResolvedValueOnce({ data: { spent: false } })
        // Mock raw tx fetch
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
        // Skip UTXO validation in this test
        .mockResolvedValueOnce({ data: mockRawTx });

      const result = await consolidateBareMultisig(mockPrivateKey, mockAddress, 10, destinationAddress, { skipSpentCheck: true });
      
      expect(result).toBeDefined();
      expect(mockAxios.get).toHaveBeenCalledTimes(2); // UTXOs + raw tx
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
      mockAxios.get
        .mockResolvedValueOnce({ data: { data: mockUtxos } })
        // Mock UTXO validation
        .mockResolvedValueOnce({ data: { spent: false } })
        // Mock raw tx fetch to fail
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
        // Mock UTXO validation for both UTXOs
        .mockResolvedValueOnce({ data: { spent: false } })
        .mockResolvedValueOnce({ data: { spent: false } })
        .mockResolvedValueOnce({ data: mockRawTx });

      const result = await consolidateBareMultisig(mockPrivateKey, mockAddress, 10);
      
      expect(result).toBeDefined();
      // Should fetch: UTXOs, 2 validation checks, 1 raw tx
      expect(mockAxios.get).toHaveBeenCalledTimes(4);
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
        // Skip validation for simplicity
        .mockResolvedValueOnce({ data: mockRawTx });

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
          txid: '123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
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

      mockAxios.get
        .mockResolvedValueOnce({ data: { data: mockUtxos } })
        // First UTXO is unspent
        .mockResolvedValueOnce({ data: { spent: false } })
        // Second UTXO is spent
        .mockResolvedValueOnce({ data: { spent: true, txid: 'spending_tx_id' } })
        // Raw tx for unspent UTXO
        .mockResolvedValueOnce({ data: mockRawTx });

      const result = await consolidateBareMultisig(mockPrivateKey, mockAddress, 10);
      
      expect(result).toBeDefined();
      // Should only process the unspent UTXO
      expect(mockAxios.get).toHaveBeenCalledTimes(4);
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

      mockAxios.get
        .mockResolvedValueOnce({ data: { data: mockUtxos } })
        // Skip validation
        // First endpoint fails
        .mockRejectedValueOnce(new Error('Not found'))
        // Second endpoint succeeds
        .mockResolvedValueOnce({ data: mockRawTx });

      const result = await consolidateBareMultisig(mockPrivateKey, mockAddress, 10, undefined, { skipSpentCheck: true });
      
      expect(result).toBeDefined();
      // Should have tried multiple endpoints
      expect(mockAxios.get.mock.calls.length).toBeGreaterThan(2);
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

      mockAxios.get
        .mockResolvedValueOnce({ data: { data: mockUtxos } })
        .mockResolvedValue({ data: mockRawTx });

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

      mockAxios.get
        .mockResolvedValueOnce({ data: { data: mockUtxos } })
        .mockResolvedValueOnce({ data: mockRawTx });

      const result = await consolidateBareMultisig(
        mockPrivateKey, 
        mockAddress, 
        10,
        undefined,
        { skipSpentCheck: true }
      );
      
      expect(result).toBeDefined();
      // Should only call API twice: UTXOs fetch and raw tx fetch
      expect(mockAxios.get).toHaveBeenCalledTimes(2);
    });
  });
});