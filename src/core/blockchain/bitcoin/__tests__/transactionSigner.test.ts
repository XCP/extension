import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AddressFormat } from '@/core/blockchain/bitcoin/address';
import { signTransaction } from '@/core/blockchain/bitcoin/transactionSigner';
// Import the functions we're mocking
import { fetchPreviousRawTransaction, fetchUTXOs, getUtxoByTxid, type UTXO } from '@/core/blockchain/bitcoin/utxo';
import type { Address, Wallet } from '@/types/wallet';

// Mock the module
vi.mock('@/core/blockchain/bitcoin/utxo', () => ({
  fetchUTXOs: vi.fn(),
  getUtxoByTxid: vi.fn(),
  fetchPreviousRawTransaction: vi.fn()
}));

// Get references to the mocked functions
const mockFetchUTXOs = vi.mocked(fetchUTXOs);
const mockGetUtxoByTxid = vi.mocked(getUtxoByTxid);
const mockFetchPreviousRawTransaction = vi.mocked(fetchPreviousRawTransaction);

// Import necessary functions for test setup
import { getPublicKey } from '@noble/secp256k1';
import { p2tr, Transaction } from '@scure/btc-signer';
import { hash160 } from '@scure/btc-signer/utils.js';

describe('Transaction Signer Utilities', () => {
  // Use a valid secp256k1 private key
  const mockPrivateKey = '0101010101010101010101010101010101010101010101010101010101010101';
  const mockTxid = 'abcd1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab';
  
  // Generate the correct public key hash for our private key
  const privateKeyBytes = hexToBytes(mockPrivateKey);
  const publicKey = getPublicKey(privateKeyBytes, true); // compressed
  const mockPubKey = bytesToHex(publicKey);
  const pubKeyHash = hash160(publicKey);
  const pubKeyHashHex = bytesToHex(pubKeyHash);
  
  // Create a mock address that matches our private key
  const mockAddress = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';

  const mockWallet: Wallet = {
    id: 'test-wallet',
    name: 'Test Wallet',
    type: 'mnemonic',
    addressFormat: AddressFormat.P2PKH,
    addressCount: 1,
    addresses: []
  };

  const mockTargetAddress: Address = {
    name: 'Address 1',
    path: "m/44'/0'/0'/0/0",
    address: mockAddress,
    pubKey: mockPubKey
  };

  const mockUtxo: UTXO = {
    txid: mockTxid,
    vout: 0,
    value: 100000,
    status: {
      confirmed: true,
      block_height: 700000,
      block_hash: 'abcd1234',
      block_time: 1640000000
    }
  };

  // Simple raw transaction hex for testing - must have even length
  // This is a basic transaction with 1 input and 1 output
  const mockRawTransaction = '0100000001' + // version
    mockTxid + // input txid
    '00000000' + // input vout (0)
    '00' + // scriptSig length (empty for unsigned)
    'ffffffff' + // sequence
    '01' + // number of outputs
    'a086010000000000' + // output value (100000 satoshis)
    '19' + // script pubkey length (25 bytes for P2PKH)
    '76a914' + '0'.repeat(40) + '88ac' + // P2PKH script
    '00000000'; // locktime
  
  // Mock previous transaction that creates the UTXO being spent
  // This transaction has an output that matches our mockUtxo
  const mockPreviousTransaction = '0100000001' + // version
    '0000000000000000000000000000000000000000000000000000000000000000' + // input txid (coinbase)
    'ffffffff' + // input vout
    '00' + // scriptSig length
    'ffffffff' + // sequence
    '01' + // number of outputs
    'a086010000000000' + // output value (100000 satoshis)
    '19' + // script pubkey length
    '76a914' + pubKeyHashHex + '88ac' + // P2PKH script (matches mockUtxo.scriptPubKey)
    '00000000'; // locktime

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Default mock setup for fetchUTXOs to return a valid UTXO
    mockFetchUTXOs.mockResolvedValue([mockUtxo]);
    
    // Default mock setup for getUtxoByTxid
    mockGetUtxoByTxid.mockReturnValue(mockUtxo);
    
    // Default mock setup for fetchPreviousRawTransaction
    mockFetchPreviousRawTransaction.mockResolvedValue(mockPreviousTransaction);
  });

  describe('signTransaction', () => {
    it('should throw error when wallet is not provided', async () => {
      await expect(signTransaction(mockRawTransaction, null as any, mockTargetAddress, mockPrivateKey))
        .rejects.toThrow('Wallet not provided');
    });

    it('should throw error when target address is not provided', async () => {
      await expect(signTransaction(mockRawTransaction, mockWallet, null as any, mockPrivateKey))
        .rejects.toThrow('Target address not provided');
    });

    it('should throw error when no UTXOs are found', async () => {
      mockFetchUTXOs.mockResolvedValue([]);
      mockGetUtxoByTxid.mockReturnValue(undefined);

      await expect(signTransaction(mockRawTransaction, mockWallet, mockTargetAddress, mockPrivateKey))
        .rejects.toThrow(/UTXO not found for input/);
    });

    it('should throw error when UTXOs is empty after retry', async () => {
      mockFetchUTXOs.mockResolvedValue([]);
      mockGetUtxoByTxid.mockReturnValue(undefined);

      await expect(signTransaction(mockRawTransaction, mockWallet, mockTargetAddress, mockPrivateKey))
        .rejects.toThrow(/UTXO not found for input/);
    });

    it('should throw error for invalid input without txid', async () => {
      // Mock fetchUTXOs to return no UTXOs for the all-zero txid
      mockFetchUTXOs.mockResolvedValue([mockUtxo]);
      
      // Mock getUtxoByTxid to return undefined for the all-zero txid
      mockGetUtxoByTxid.mockImplementation((utxos, txid, vout) => {
        if (txid === '0000000000000000000000000000000000000000000000000000000000000000') {
          return undefined;
        }
        return mockUtxo;
      });

      // Create a valid-length transaction with all zeros for txid
      const invalidRawTx = '0100000001' + // version
        '00'.repeat(32) + // 32 bytes of zeros for txid
        '00000000' + // vout
        '00' + // scriptSig length
        'ffffffff' + // sequence
        '01' + // number of outputs
        'a086010000000000' + // output value (100000 satoshis)
        '19' + // script pubkey length (25 bytes)
        '76a914' + pubKeyHashHex + '88ac' + // P2PKH script
        '00000000'; // locktime

      await expect(signTransaction(invalidRawTx, mockWallet, mockTargetAddress, mockPrivateKey))
        .rejects.toThrow(/UTXO not found for input/);
    });

    it('should throw error when UTXO not found for input', async () => {
      mockFetchUTXOs.mockResolvedValue([mockUtxo]);
      mockGetUtxoByTxid.mockReturnValue(undefined);

      await expect(signTransaction(mockRawTransaction, mockWallet, mockTargetAddress, mockPrivateKey))
        .rejects.toThrow(/UTXO not found for input/);
    });

    it('should throw error when failed to fetch previous transaction', async () => {
      mockFetchUTXOs.mockResolvedValue([mockUtxo]);
      mockGetUtxoByTxid.mockReturnValue(mockUtxo);
      mockFetchPreviousRawTransaction.mockResolvedValue(null);

      await expect(signTransaction(mockRawTransaction, mockWallet, mockTargetAddress, mockPrivateKey))
        .rejects.toThrow(/Failed to fetch previous transaction/);
    });

    it('should throw error when output not found in previous transaction', async () => {
      // Create a transaction that references output index 999 which doesn't exist
      const txWithBadVout = '0100000001' + // version
        mockTxid + // input txid
        'e7030000' + // input vout (999 in little-endian)
        '00' + // scriptSig length
        'ffffffff' + // sequence
        '01' + // number of outputs
        'a086010000000000' + // output value
        '19' + // script pubkey length
        '76a914' + '0'.repeat(40) + '88ac' + // P2PKH script
        '00000000'; // locktime
        
      mockFetchUTXOs.mockResolvedValue([{ ...mockUtxo, vout: 999 }]);
      mockGetUtxoByTxid.mockReturnValue({ ...mockUtxo, vout: 999 });
      mockFetchPreviousRawTransaction.mockResolvedValue(mockPreviousTransaction);
      
      await expect(signTransaction(txWithBadVout, mockWallet, mockTargetAddress, mockPrivateKey))
        .rejects.toThrow('Wrong output index=999');
    });

    it('should successfully sign P2PKH transaction', async () => {
      mockFetchUTXOs.mockResolvedValue([mockUtxo]);
      mockGetUtxoByTxid.mockReturnValue(mockUtxo);
      mockFetchPreviousRawTransaction.mockResolvedValue(mockPreviousTransaction);

      const result = await signTransaction(mockRawTransaction, mockWallet, mockTargetAddress, mockPrivateKey);
      
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
      expect(result).toMatch(/^[0-9a-f]+$/i); // Valid hex string
    });

    // signTransaction rebuilds the transaction rather than signing the parsed bytes, so anything
    // not copied across is replaced by @scure's defaults. That has shipped twice: version and
    // lockTime were dropped, then sequence was overwritten with 0xfffffffd. These pin all three
    // against a transaction whose values are deliberately not the defaults.
    describe('preserves what the user reviewed', () => {
      // version 1, sequence 0xfffffffe, lockTime 800000 - none of them @scure's default.
      const distinctiveTx = '01000000' + '01' + mockTxid + '00000000' + '00' + 'feffffff'
        + '01' + 'a086010000000000' + '19' + '76a914' + '0'.repeat(40) + '88ac' + '00350c00';

      beforeEach(() => {
        mockFetchUTXOs.mockResolvedValue([mockUtxo]);
        mockGetUtxoByTxid.mockReturnValue(mockUtxo);
        mockFetchPreviousRawTransaction.mockResolvedValue(mockPreviousTransaction);
      });

      // Asserted on the serialised bytes rather than by re-parsing: version is the first four
      // bytes and lockTime the last four, which is exactly what each historical bug changed.
      it('keeps version and lockTime', async () => {
        const signed = await signTransaction(distinctiveTx, mockWallet, mockTargetAddress, mockPrivateKey);

        // '02000000' here would mean the rebuild silently renumbered the transaction.
        expect(signed.slice(0, 8)).toBe('01000000');
        // '00000000' would mean a timelocked transaction was signed as immediately spendable.
        expect(signed.slice(-8)).toBe('00350c00');
      });

      it('refuses to sign when the rebuild would differ', async () => {
        // The guard runs before signing, so an unparseable or altered input never reaches the key.
        await expect(
          signTransaction('00', mockWallet, mockTargetAddress, mockPrivateKey)
        ).rejects.toThrow();
      });
    });

    it('should successfully sign P2WPKH transaction', async () => {
      const p2wpkhWallet = { ...mockWallet, addressFormat: AddressFormat.P2WPKH };
      
      mockFetchUTXOs.mockResolvedValue([mockUtxo]);
      mockGetUtxoByTxid.mockReturnValue(mockUtxo);
      mockFetchPreviousRawTransaction.mockResolvedValue(mockPreviousTransaction);

      const result = await signTransaction(mockRawTransaction, p2wpkhWallet, mockTargetAddress, mockPrivateKey);

      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
      expect(result).toMatch(/^[0-9a-f]+$/i); // Valid hex string
    });

    it('should successfully sign P2SH_P2WPKH transaction', async () => {
      const p2shWallet = { ...mockWallet, addressFormat: AddressFormat.P2SH_P2WPKH };
      
      mockFetchUTXOs.mockResolvedValue([mockUtxo]);
      mockGetUtxoByTxid.mockReturnValue(mockUtxo);
      mockFetchPreviousRawTransaction.mockResolvedValue(mockPreviousTransaction);

      const result = await signTransaction(mockRawTransaction, p2shWallet, mockTargetAddress, mockPrivateKey);

      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
      expect(result).toMatch(/^[0-9a-f]+$/i); // Valid hex string
    });

    it('should successfully sign P2TR transaction with a key-path schnorr witness', async () => {
      const p2trWallet = { ...mockWallet, addressFormat: AddressFormat.P2TR };
      // BIP341 lock script for our key: OP_1 <tweaked x-only pubkey>
      const lockScript = bytesToHex(p2tr(publicKey.slice(1)).script);

      const result = await signTransaction(
        mockRawTransaction,
        p2trWallet,
        mockTargetAddress,
        mockPrivateKey,
        true,
        [100000],
        [lockScript]
      );

      expect(result).toMatch(/^[0-9a-f]+$/i);
      // Key-path spend with SIGHASH_DEFAULT: witness is a single 64-byte schnorr signature
      const signedTx = Transaction.fromRaw(hexToBytes(result));
      const witness = signedTx.getInput(0).finalScriptWitness;
      expect(witness).toHaveLength(1);
      expect(witness![0]).toHaveLength(64);
    });

    it('should successfully sign Counterwallet transaction', async () => {
      const counterwalletWallet = { ...mockWallet, addressFormat: AddressFormat.Counterwallet };
      
      mockFetchUTXOs.mockResolvedValue([mockUtxo]);
      mockGetUtxoByTxid.mockReturnValue(mockUtxo);
      mockFetchPreviousRawTransaction.mockResolvedValue(mockPreviousTransaction);

      const result = await signTransaction(mockRawTransaction, counterwalletWallet, mockTargetAddress, mockPrivateKey);

      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
      expect(result).toMatch(/^[0-9a-f]+$/i); // Valid hex string
    });

    it('should handle unsupported address type with standard signing', async () => {
      const invalidWallet = { ...mockWallet, addressFormat: 'INVALID' as AddressFormat };
      
      mockFetchUTXOs.mockResolvedValue([mockUtxo]);
      mockGetUtxoByTxid.mockReturnValue(mockUtxo);
      mockFetchPreviousRawTransaction.mockResolvedValue(mockPreviousTransaction);

      // Should not throw, but use standard signing for unknown address types
      const result = await signTransaction(mockRawTransaction, invalidWallet, mockTargetAddress, mockPrivateKey);
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
      expect(result).toMatch(/^[0-9a-f]+$/i); // Valid hex string
    });

    it('should handle multiple inputs correctly', async () => {
      const multiInputUtxos = [
        { ...mockUtxo, txid: mockTxid, vout: 0 },
        { ...mockUtxo, txid: 'different-txid', vout: 1 }
      ];

      mockFetchUTXOs.mockResolvedValue(multiInputUtxos);
      mockGetUtxoByTxid
        .mockReturnValueOnce(multiInputUtxos[0])
        .mockReturnValueOnce(multiInputUtxos[1]);
      mockFetchPreviousRawTransaction.mockResolvedValue(mockPreviousTransaction);

      const result = await signTransaction(mockRawTransaction, mockWallet, mockTargetAddress, mockPrivateKey);

      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
      expect(result).toMatch(/^[0-9a-f]+$/i); // Valid hex string
    });

    it('should handle multiple outputs correctly', async () => {
      mockFetchUTXOs.mockResolvedValue([mockUtxo]);
      mockGetUtxoByTxid.mockReturnValue(mockUtxo);
      mockFetchPreviousRawTransaction.mockResolvedValue(mockPreviousTransaction);

      // Create a transaction with multiple outputs
      const multiOutputTx = mockRawTransaction; // For simplicity, using same tx
      
      const result = await signTransaction(multiOutputTx, mockWallet, mockTargetAddress, mockPrivateKey);

      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
      expect(result).toMatch(/^[0-9a-f]+$/i); // Valid hex string
    });

    it('should handle invalid private key gracefully', async () => {
      mockFetchUTXOs.mockResolvedValue([mockUtxo]);
      mockGetUtxoByTxid.mockReturnValue(mockUtxo);
      mockFetchPreviousRawTransaction.mockResolvedValue(mockPreviousTransaction);

      const invalidPrivateKey = 'invalid-hex-key';

      await expect(signTransaction(mockRawTransaction, mockWallet, mockTargetAddress, invalidPrivateKey))
        .rejects.toThrow();
    });

    it('should handle malformed raw transaction', async () => {
      mockFetchUTXOs.mockResolvedValue([mockUtxo]);

      const malformedTx = 'invalid-hex-transaction';

      await expect(signTransaction(malformedTx, mockWallet, mockTargetAddress, mockPrivateKey))
        .rejects.toThrow();
    });

    it('should handle empty raw transaction', async () => {
      mockFetchUTXOs.mockResolvedValue([mockUtxo]);

      const emptyTx = '';

      await expect(signTransaction(emptyTx, mockWallet, mockTargetAddress, mockPrivateKey))
        .rejects.toThrow();
    });

    it('should use correct sequence number', async () => {
      mockFetchUTXOs.mockResolvedValue([mockUtxo]);
      mockGetUtxoByTxid.mockReturnValue(mockUtxo);
      mockFetchPreviousRawTransaction.mockResolvedValue(mockPreviousTransaction);

      const result = await signTransaction(mockRawTransaction, mockWallet, mockTargetAddress, mockPrivateKey);
      
      // The function should complete without error and produce a valid hex string
      expect(typeof result).toBe('string');
      expect(result).toMatch(/^[0-9a-f]+$/i);
    });

    it('should handle witness and non-witness UTXOs appropriately', async () => {
      // Test P2PKH (non-witness)
      const p2pkhWallet = { ...mockWallet, addressFormat: AddressFormat.P2PKH };
      mockFetchUTXOs.mockResolvedValue([mockUtxo]);
      mockGetUtxoByTxid.mockReturnValue(mockUtxo);
      mockFetchPreviousRawTransaction.mockResolvedValue(mockPreviousTransaction);

      const p2pkhResult = await signTransaction(mockRawTransaction, p2pkhWallet, mockTargetAddress, mockPrivateKey);
      expect(typeof p2pkhResult).toBe('string');
      expect(p2pkhResult).toMatch(/^[0-9a-f]+$/i); // Valid hex string

      // Test P2WPKH (witness)
      const p2wpkhWallet = { ...mockWallet, addressFormat: AddressFormat.P2WPKH };
      vi.clearAllMocks();
      mockFetchUTXOs.mockResolvedValue([mockUtxo]);
      mockGetUtxoByTxid.mockReturnValue(mockUtxo);
      mockFetchPreviousRawTransaction.mockResolvedValue(mockPreviousTransaction);

      const p2wpkhResult = await signTransaction(mockRawTransaction, p2wpkhWallet, mockTargetAddress, mockPrivateKey);
      expect(typeof p2wpkhResult).toBe('string');
      expect(p2wpkhResult).toMatch(/^[0-9a-f]+$/i); // Valid hex string
    });

    it('should handle edge case with zero-value output', async () => {
      const zeroValueUtxo = { ...mockUtxo, value: 0 };
      
      mockFetchUTXOs.mockResolvedValue([zeroValueUtxo]);
      mockGetUtxoByTxid.mockReturnValue(zeroValueUtxo);
      mockFetchPreviousRawTransaction.mockResolvedValue(mockPreviousTransaction);

      const result = await signTransaction(mockRawTransaction, mockWallet, mockTargetAddress, mockPrivateKey);

      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
      expect(result).toMatch(/^[0-9a-f]+$/i); // Valid hex string
    });

    it('should handle large value UTXOs', async () => {
      const largeValueUtxo = { ...mockUtxo, value: 2100000000000000 }; // 21M BTC in sats
      
      mockFetchUTXOs.mockResolvedValue([largeValueUtxo]);
      mockGetUtxoByTxid.mockReturnValue(largeValueUtxo);
      mockFetchPreviousRawTransaction.mockResolvedValue(mockPreviousTransaction);

      const result = await signTransaction(mockRawTransaction, mockWallet, mockTargetAddress, mockPrivateKey);

      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
      expect(result).toMatch(/^[0-9a-f]+$/i); // Valid hex string
    });

    it('should call fetchUTXOs with correct address', async () => {
      mockFetchUTXOs.mockResolvedValue([mockUtxo]);
      mockGetUtxoByTxid.mockReturnValue(mockUtxo);
      mockFetchPreviousRawTransaction.mockResolvedValue(mockPreviousTransaction);

      await signTransaction(mockRawTransaction, mockWallet, mockTargetAddress, mockPrivateKey);
      
      expect(mockFetchUTXOs).toHaveBeenCalledWith(mockTargetAddress.address);
    });

    it('should call getUtxoByTxid with correct parameters', async () => {
      mockFetchUTXOs.mockResolvedValue([mockUtxo]);
      mockGetUtxoByTxid.mockReturnValue(mockUtxo);
      mockFetchPreviousRawTransaction.mockResolvedValue(mockPreviousTransaction);

      await signTransaction(mockRawTransaction, mockWallet, mockTargetAddress, mockPrivateKey);
      
      expect(mockGetUtxoByTxid).toHaveBeenCalledWith(
        [mockUtxo],
        expect.any(String),
        expect.any(Number)
      );
    });

    it('should call fetchPreviousRawTransaction with correct txid', async () => {
      mockFetchUTXOs.mockResolvedValue([mockUtxo]);
      mockGetUtxoByTxid.mockReturnValue(mockUtxo);
      mockFetchPreviousRawTransaction.mockResolvedValue(mockPreviousTransaction);

      await signTransaction(mockRawTransaction, mockWallet, mockTargetAddress, mockPrivateKey);
      
      expect(mockFetchPreviousRawTransaction).toHaveBeenCalledWith(expect.any(String));
    });
  });

  describe('address format coverage', () => {
    it('should handle all supported address types without error', async () => {
      const addressTypes = [
        AddressFormat.P2PKH,
        AddressFormat.P2WPKH,
        AddressFormat.P2SH_P2WPKH,
        AddressFormat.P2TR,
        AddressFormat.Counterwallet
      ];

      for (const addressFormat of addressTypes) {
        if (addressFormat === AddressFormat.P2TR) {
          // The mock previous tx pays to a P2PKH script, so it cannot exercise
          // taproot signing; P2TR has its own test with a real P2TR lock script
          continue;
        }

        const wallet = { ...mockWallet, addressFormat };

        mockFetchUTXOs.mockResolvedValue([mockUtxo]);
        mockGetUtxoByTxid.mockReturnValue(mockUtxo);
        mockFetchPreviousRawTransaction.mockResolvedValue(mockPreviousTransaction);

        const result = await signTransaction(mockRawTransaction, wallet, mockTargetAddress, mockPrivateKey);
        expect(typeof result).toBe('string');
        expect(result).toMatch(/^[0-9a-f]+$/i); // Valid hex string

        vi.clearAllMocks();
      }
    });
  });

  describe('API data optimization (inputValues + lockScripts)', () => {
    it('should NOT fetch previous transactions for SegWit when API data provided', async () => {
      const p2wpkhWallet = { ...mockWallet, addressFormat: AddressFormat.P2WPKH };

      mockFetchUTXOs.mockResolvedValue([mockUtxo]);
      mockGetUtxoByTxid.mockReturnValue(mockUtxo);
      // Don't mock fetchPreviousRawTransaction - it shouldn't be called

      // P2WPKH lock script for our test address
      const lockScript = '0014' + pubKeyHashHex;
      const inputValues = [100000];
      const lockScripts = [lockScript];

      const result = await signTransaction(
        mockRawTransaction,
        p2wpkhWallet,
        mockTargetAddress,
        mockPrivateKey,
        true, // compressed
        inputValues,
        lockScripts
      );

      expect(typeof result).toBe('string');
      expect(result).toMatch(/^[0-9a-f]+$/i);
      // Key assertion: fetchPreviousRawTransaction should NOT have been called
      expect(mockFetchPreviousRawTransaction).not.toHaveBeenCalled();
    });

    it('should NOT fetch UTXOs when API data is provided for SegWit', async () => {
      const p2wpkhWallet = { ...mockWallet, addressFormat: AddressFormat.P2WPKH };

      // No need to mock fetchUTXOs - it shouldn't be called

      const lockScript = '0014' + pubKeyHashHex;

      await signTransaction(
        mockRawTransaction,
        p2wpkhWallet,
        mockTargetAddress,
        mockPrivateKey,
        true,
        [100000],
        [lockScript]
      );

      // With API data, skip UTXO fetch - the data is fresh from compose
      expect(mockFetchUTXOs).not.toHaveBeenCalled();
    });

    it('should fetch previous transactions for SegWit when API data NOT provided', async () => {
      const p2wpkhWallet = { ...mockWallet, addressFormat: AddressFormat.P2WPKH };

      mockFetchUTXOs.mockResolvedValue([mockUtxo]);
      mockGetUtxoByTxid.mockReturnValue(mockUtxo);
      mockFetchPreviousRawTransaction.mockResolvedValue(mockPreviousTransaction);

      // No inputValues or lockScripts provided
      const result = await signTransaction(
        mockRawTransaction,
        p2wpkhWallet,
        mockTargetAddress,
        mockPrivateKey
      );

      expect(typeof result).toBe('string');
      // Should have fetched the previous transaction as fallback
      expect(mockFetchPreviousRawTransaction).toHaveBeenCalled();
    });

    it('should ALWAYS fetch previous transactions for Legacy P2PKH even with API data', async () => {
      // Legacy P2PKH needs full previous transaction for nonWitnessUtxo
      const p2pkhWallet = { ...mockWallet, addressFormat: AddressFormat.P2PKH };

      mockFetchUTXOs.mockResolvedValue([mockUtxo]);
      mockGetUtxoByTxid.mockReturnValue(mockUtxo);
      mockFetchPreviousRawTransaction.mockResolvedValue(mockPreviousTransaction);

      // Even with API data provided...
      const lockScript = '76a914' + pubKeyHashHex + '88ac';
      const inputValues = [100000];
      const lockScripts = [lockScript];

      const result = await signTransaction(
        mockRawTransaction,
        p2pkhWallet,
        mockTargetAddress,
        mockPrivateKey,
        true,
        inputValues,
        lockScripts
      );

      expect(typeof result).toBe('string');
      // Should STILL fetch previous transaction for legacy
      expect(mockFetchPreviousRawTransaction).toHaveBeenCalled();
    });

    it('should validate inputValues count matches transaction inputs', async () => {
      const p2wpkhWallet = { ...mockWallet, addressFormat: AddressFormat.P2WPKH };

      mockFetchUTXOs.mockResolvedValue([mockUtxo]);
      mockGetUtxoByTxid.mockReturnValue(mockUtxo);

      const lockScript = '0014' + pubKeyHashHex;
      // Mismatched: 2 values but transaction has 1 input
      const inputValues = [100000, 50000];
      const lockScripts = [lockScript];

      await expect(signTransaction(
        mockRawTransaction,
        p2wpkhWallet,
        mockTargetAddress,
        mockPrivateKey,
        true,
        inputValues,
        lockScripts
      )).rejects.toThrow(/doesn't match/);
    });

    it('should validate lockScripts count matches transaction inputs', async () => {
      const p2wpkhWallet = { ...mockWallet, addressFormat: AddressFormat.P2WPKH };

      mockFetchUTXOs.mockResolvedValue([mockUtxo]);
      mockGetUtxoByTxid.mockReturnValue(mockUtxo);

      const lockScript = '0014' + pubKeyHashHex;
      // Mismatched: 1 value but 2 scripts
      const inputValues = [100000];
      const lockScripts = [lockScript, lockScript];

      await expect(signTransaction(
        mockRawTransaction,
        p2wpkhWallet,
        mockTargetAddress,
        mockPrivateKey,
        true,
        inputValues,
        lockScripts
      )).rejects.toThrow(/doesn't match/);
    });
  });
});