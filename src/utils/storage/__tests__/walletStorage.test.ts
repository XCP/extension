import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { AddressFormat } from '@/utils/blockchain/bitcoin/address';
import {
  getAllRecords,
  addRecord,
  updateRecord,
  removeRecord,
} from '@/utils/storage/storage';
import {
  getAllEncryptedWallets,
  addEncryptedWallet,
  updateEncryptedWallet,
  removeEncryptedWallet,
  EncryptedWalletRecord,
} from '../walletStorage';

vi.mock('@/utils/storage/storage', () => ({
  getAllRecords: vi.fn(),
  addRecord: vi.fn(),
  updateRecord: vi.fn(),
  removeRecord: vi.fn(),
  clearAllRecords: vi.fn(),
}));

describe('walletStorage.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getAllEncryptedWallets', () => {
    it('should return an empty array when no wallets exist', async () => {
      (getAllRecords as Mock).mockResolvedValue([]);
      const wallets = await getAllEncryptedWallets();
      expect(wallets).toEqual([]);
    });

    it('should return only mnemonic and privateKey wallets', async () => {
      const mnemonicWallet: EncryptedWalletRecord = {
        id: '1',
        name: 'Mnemonic Wallet',
        type: 'mnemonic',
        addressFormat: AddressFormat.P2WPKH,
        encryptedSecret: 'encrypted-mnemonic',
      };
      const pkWallet: EncryptedWalletRecord = {
        id: '2',
        name: 'PK Wallet',
        type: 'privateKey',
        addressFormat: AddressFormat.P2PKH,
        encryptedSecret: 'encrypted-pk',
      };
      const otherRecord = {
        id: '3',
        name: 'Other',
        type: 'other',
      };
      (getAllRecords as Mock).mockResolvedValue([mnemonicWallet, pkWallet, otherRecord]);
      const wallets = await getAllEncryptedWallets();
      expect(wallets).toEqual([mnemonicWallet, pkWallet]);
      expect(wallets.length).toBe(2);
    });
  });

  describe('addEncryptedWallet', () => {
    it('should add a new encrypted wallet record', async () => {
      const wallet: EncryptedWalletRecord = {
        id: '1',
        name: 'Test Wallet',
        type: 'mnemonic',
        addressFormat: AddressFormat.P2WPKH,
        encryptedSecret: 'encrypted-secret',
      };
      (addRecord as Mock).mockResolvedValue(undefined);
      await addEncryptedWallet(wallet);
      expect(addRecord).toHaveBeenCalledWith(wallet);
    });

    it('should throw an error for duplicate wallet ID', async () => {
      const wallet: EncryptedWalletRecord = {
        id: '1',
        name: 'Test Wallet',
        type: 'mnemonic',
        addressFormat: AddressFormat.P2WPKH,
        encryptedSecret: 'encrypted-secret',
      };
      (addRecord as Mock).mockResolvedValue(undefined);
      await addEncryptedWallet(wallet);
      (addRecord as Mock).mockRejectedValue(new Error('Record with ID "1" already exists.'));
      await expect(addEncryptedWallet(wallet)).rejects.toThrow(
        'Record with ID "1" already exists.'
      );
    });
  });

  describe('updateEncryptedWallet', () => {
    it('should update an existing wallet record', async () => {
      const wallet: EncryptedWalletRecord = {
        id: '1',
        name: 'Original Wallet',
        type: 'privateKey',
        addressFormat: AddressFormat.P2PKH,
        encryptedSecret: 'encrypted-secret',
      };
      (addRecord as Mock).mockResolvedValue(undefined);
      await addEncryptedWallet(wallet);
      const updatedWallet: EncryptedWalletRecord = {
        ...wallet,
        name: 'Updated Wallet',
        addressCount: 5,
      };
      (updateRecord as Mock).mockResolvedValue(undefined);
      await updateEncryptedWallet(updatedWallet);
      expect(updateRecord).toHaveBeenCalledWith(updatedWallet);
    });

    it('should throw an error for non-existent wallet ID', async () => {
      const wallet: EncryptedWalletRecord = {
        id: 'nonexistent',
        name: 'Test Wallet',
        type: 'mnemonic',
        addressFormat: AddressFormat.P2WPKH,
        encryptedSecret: 'encrypted-secret',
      };
      (updateRecord as Mock).mockRejectedValue(new Error('Record with ID "nonexistent" not found.'));
      await expect(updateEncryptedWallet(wallet)).rejects.toThrow(
        'Record with ID "nonexistent" not found.'
      );
    });
  });

  describe('removeEncryptedWallet', () => {
    it('should remove an existing wallet record', async () => {
      const wallet1: EncryptedWalletRecord = {
        id: '1',
        name: 'Wallet 1',
        type: 'mnemonic',
        addressFormat: AddressFormat.P2WPKH,
        encryptedSecret: 'encrypted-secret-1',
      };
      const wallet2: EncryptedWalletRecord = {
        id: '2',
        name: 'Wallet 2',
        type: 'privateKey',
        addressFormat: AddressFormat.P2PKH,
        encryptedSecret: 'encrypted-secret-2',
      };
      (addRecord as Mock).mockResolvedValue(undefined);
      await addEncryptedWallet(wallet1);
      (addRecord as Mock).mockResolvedValue(undefined);
      await addEncryptedWallet(wallet2);
      (removeRecord as Mock).mockResolvedValue(undefined);
      await removeEncryptedWallet('1');
      expect(removeRecord).toHaveBeenCalledWith('1');
      (getAllRecords as Mock).mockResolvedValue([wallet2]);
      const wallets = await getAllEncryptedWallets();
      expect(wallets).toEqual([wallet2]);
      expect(wallets.length).toBe(1);
    });

    it('should do nothing for a non-existent wallet ID', async () => {
      const wallet: EncryptedWalletRecord = {
        id: '1',
        name: 'Test Wallet',
        type: 'mnemonic',
        addressFormat: AddressFormat.P2WPKH,
        encryptedSecret: 'encrypted-secret',
      };
      (addRecord as Mock).mockResolvedValue(undefined);
      await addEncryptedWallet(wallet);
      (removeRecord as Mock).mockResolvedValue(undefined);
      await removeEncryptedWallet('nonexistent');
      expect(removeRecord).toHaveBeenCalledWith('nonexistent');
      (getAllRecords as Mock).mockResolvedValue([wallet]);
      const wallets = await getAllEncryptedWallets();
      expect(wallets).toEqual([wallet]);
      expect(wallets.length).toBe(1);
    });
  });

  describe('EncryptedWalletRecord validation', () => {
    it('should handle all valid wallet types', async () => {
      const mnemonicWallet: EncryptedWalletRecord = {
        id: 'mnemonic-1',
        name: 'Mnemonic Wallet',
        type: 'mnemonic',
        addressFormat: AddressFormat.P2WPKH,
        encryptedSecret: 'encrypted-mnemonic-secret',
      };

      const privateKeyWallet: EncryptedWalletRecord = {
        id: 'pk-1',
        name: 'Private Key Wallet',
        type: 'privateKey',
        addressFormat: AddressFormat.P2PKH,
        encryptedSecret: 'encrypted-pk-secret',
      };

      (addRecord as Mock).mockResolvedValue(undefined);
      await addEncryptedWallet(mnemonicWallet);
      await addEncryptedWallet(privateKeyWallet);

      expect(addRecord).toHaveBeenCalledWith(mnemonicWallet);
      expect(addRecord).toHaveBeenCalledWith(privateKeyWallet);
    });

    it('should handle all valid address types', async () => {
      const addressTypes = [AddressFormat.P2PKH, AddressFormat.P2SH_P2WPKH, AddressFormat.P2WPKH, AddressFormat.P2TR];

      for (let i = 0; i < addressTypes.length; i++) {
        const wallet: EncryptedWalletRecord = {
          id: `wallet-${i}`,
          name: `Wallet ${i}`,
          type: 'mnemonic',
          addressFormat: addressTypes[i],
          encryptedSecret: `encrypted-secret-${i}`,
        };

        (addRecord as Mock).mockResolvedValue(undefined);
        await addEncryptedWallet(wallet);
        expect(addRecord).toHaveBeenCalledWith(wallet);
      }
    });

    it('should handle optional fields', async () => {
      const walletWithOptionals: EncryptedWalletRecord = {
        id: 'full-wallet',
        name: 'Full Wallet',
        type: 'mnemonic',
        addressFormat: AddressFormat.P2WPKH,
        encryptedSecret: 'encrypted-secret',
        addressCount: 10,
        previewAddress: 'bc1q...',
      };

      (addRecord as Mock).mockResolvedValue(undefined);
      await addEncryptedWallet(walletWithOptionals);
      expect(addRecord).toHaveBeenCalledWith(walletWithOptionals);
    });

    it('should reject wallet without encryptedSecret', async () => {
      const invalidWallet = {
        id: 'invalid',
        name: 'Invalid Wallet',
        type: 'mnemonic',
        addressFormat: AddressFormat.P2WPKH,
        encryptedSecret: '',
      } as EncryptedWalletRecord;

      await expect(addEncryptedWallet(invalidWallet)).rejects.toThrow(
        'Encrypted secret is required for wallet records'
      );
    });

    it('should reject wallet with null encryptedSecret', async () => {
      const invalidWallet = {
        id: 'invalid',
        name: 'Invalid Wallet',
        type: 'mnemonic',
        addressFormat: AddressFormat.P2WPKH,
        encryptedSecret: null,
      } as any;

      await expect(addEncryptedWallet(invalidWallet)).rejects.toThrow(
        'Encrypted secret is required for wallet records'
      );
    });

    it('should reject wallet with undefined encryptedSecret', async () => {
      const invalidWallet = {
        id: 'invalid',
        name: 'Invalid Wallet',
        type: 'mnemonic',
        addressFormat: AddressFormat.P2WPKH,
      } as any;

      await expect(addEncryptedWallet(invalidWallet)).rejects.toThrow(
        'Encrypted secret is required for wallet records'
      );
    });
  });

  describe('filtering behavior', () => {
    it('should filter out records with other types', async () => {
      const records = [
        {
          id: '1',
          name: 'Mnemonic Wallet',
          type: 'mnemonic',
          addressFormat: AddressFormat.P2WPKH,
          encryptedSecret: 'secret1',
        },
        {
          id: '2',
          name: 'Settings Record',
          type: 'settings',
          someData: 'value',
        },
        {
          id: '3',
          name: 'Private Key Wallet',  
          type: 'privateKey',
          addressFormat: AddressFormat.P2PKH,
          encryptedSecret: 'secret3',
        },
        {
          id: '4',
          name: 'Custom Record',
          type: 'custom',
          customField: 'data',
        },
        {
          id: '5',
          type: 'unknown', // No name field
        },
      ];

      (getAllRecords as Mock).mockResolvedValue(records);
      const wallets = await getAllEncryptedWallets();

      expect(wallets).toHaveLength(2);
      expect(wallets[0].id).toBe('1');
      expect(wallets[1].id).toBe('3');
      expect(wallets.every(w => w.type === 'mnemonic' || w.type === 'privateKey')).toBe(true);
    });

    it('should return empty array when no wallet records exist', async () => {
      const nonWalletRecords = [
        { id: '1', type: 'settings', data: 'value' },
        { id: '2', type: 'cache', cached: true },
        { id: '3', type: 'preference', pref: 'dark' },
      ];

      (getAllRecords as Mock).mockResolvedValue(nonWalletRecords);
      const wallets = await getAllEncryptedWallets();

      expect(wallets).toEqual([]);
    });

    it('should handle mixed valid and invalid wallet records', async () => {
      const records = [
        {
          id: '1',
          name: 'Valid Mnemonic',
          type: 'mnemonic',
          addressFormat: AddressFormat.P2WPKH,
          encryptedSecret: 'secret1',
        },
        {
          id: '2',
          type: 'mnemonic', // Missing required fields but still has wallet type
          someField: 'value',
        },
        {
          id: '3',
          name: 'Valid Private Key',
          type: 'privateKey',
          addressFormat: AddressFormat.P2PKH,
          encryptedSecret: 'secret3',
        },
      ];

      (getAllRecords as Mock).mockResolvedValue(records);
      const wallets = await getAllEncryptedWallets();

      expect(wallets).toHaveLength(3); // All filtered by type, regardless of other fields
      expect(wallets.map(w => w.id)).toEqual(['1', '2', '3']);
    });
  });

  describe('comprehensive wallet management scenarios', () => {
    it('should handle complete wallet lifecycle', async () => {
      // Add wallet
      const wallet: EncryptedWalletRecord = {
        id: 'lifecycle-wallet',
        name: 'Lifecycle Test',
        type: 'mnemonic',
        addressFormat: AddressFormat.P2WPKH,
        encryptedSecret: 'original-secret',
        addressCount: 1,
      };

      (addRecord as Mock).mockResolvedValue(undefined);
      await addEncryptedWallet(wallet);

      // Update wallet
      const updatedWallet: EncryptedWalletRecord = {
        ...wallet,
        name: 'Updated Lifecycle Test',
        addressCount: 5,
        previewAddress: 'bc1q...',
      };

      (updateRecord as Mock).mockResolvedValue(undefined);
      await updateEncryptedWallet(updatedWallet);

      // Remove wallet
      (removeRecord as Mock).mockResolvedValue(undefined);
      await removeEncryptedWallet('lifecycle-wallet');

      expect(addRecord).toHaveBeenCalledWith(wallet);
      expect(updateRecord).toHaveBeenCalledWith(updatedWallet);
      expect(removeRecord).toHaveBeenCalledWith('lifecycle-wallet');
    });

    it('should handle multiple wallet operations', async () => {
      const wallets: EncryptedWalletRecord[] = [
        {
          id: 'multi-1',
          name: 'Wallet 1',
          type: 'mnemonic',
          addressFormat: AddressFormat.P2WPKH,
          encryptedSecret: 'secret1',
        },
        {
          id: 'multi-2',
          name: 'Wallet 2',
          type: 'privateKey',
          addressFormat: AddressFormat.P2PKH,
          encryptedSecret: 'secret2',
        },
        {
          id: 'multi-3',
          name: 'Wallet 3',
          type: 'mnemonic',
          addressFormat: AddressFormat.P2TR,
          encryptedSecret: 'secret3',
        },
      ];

      (addRecord as Mock).mockResolvedValue(undefined);
      for (const wallet of wallets) {
        await addEncryptedWallet(wallet);
      }

      (getAllRecords as Mock).mockResolvedValue(wallets);
      const retrievedWallets = await getAllEncryptedWallets();

      expect(retrievedWallets).toEqual(wallets);
      expect(addRecord).toHaveBeenCalledTimes(wallets.length);
    });
  });

  describe('error propagation', () => {
    it('should propagate storage errors from addRecord', async () => {
      const wallet: EncryptedWalletRecord = {
        id: 'error-wallet',
        name: 'Error Test',
        type: 'mnemonic',
        addressFormat: AddressFormat.P2WPKH,
        encryptedSecret: 'secret',
      };

      (addRecord as Mock).mockRejectedValue(new Error('Storage write failed'));
      await expect(addEncryptedWallet(wallet)).rejects.toThrow('Storage write failed');
    });

    it('should propagate storage errors from updateRecord', async () => {
      const wallet: EncryptedWalletRecord = {
        id: 'error-wallet',
        name: 'Error Test',
        type: 'mnemonic',
        addressFormat: AddressFormat.P2WPKH,
        encryptedSecret: 'secret',
      };

      (updateRecord as Mock).mockRejectedValue(new Error('Update failed'));
      await expect(updateEncryptedWallet(wallet)).rejects.toThrow('Update failed');
    });

    it('should propagate storage errors from getAllRecords', async () => {
      (getAllRecords as Mock).mockRejectedValue(new Error('Storage read failed'));
      await expect(getAllEncryptedWallets()).rejects.toThrow('Storage read failed');
    });
  });
});
