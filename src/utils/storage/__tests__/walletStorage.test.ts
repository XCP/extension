import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AddressType } from '@/utils/blockchain/bitcoin';
import {
  addRecord,
  getAllEncryptedWallets,
  addEncryptedWallet,
  updateEncryptedWallet,
  removeEncryptedWallet,
  EncryptedWalletRecord,
} from '@/utils/storage';

// Mock the storage module
vi.mock('@/utils/storage', () => {
  let store: any[] = [];
  return {
    getAllRecords: async () => [...store],
    addRecord: async (record: any) => {
      if (store.some((r) => r.id === record.id)) {
        throw new Error(`Record with ID "${record.id}" already exists.`);
      }
      store.push({ ...record });
    },
    updateRecord: async (record: any) => {
      const index = store.findIndex((r) => r.id === record.id);
      if (index === -1) {
        throw new Error(`Record with ID "${record.id}" not found.`);
      }
      store[index] = { ...record };
    },
    removeRecord: async (id: string) => {
      store = store.filter((r) => r.id !== id);
    },
    clearAllRecords: async () => {
      store = [];
    },
  };
});

describe('walletStorage.ts', () => {
  beforeEach(async () => {
    await (await import('../storage')).clearAllRecords(); // Reset storage
  });

  describe('getAllEncryptedWallets', () => {
    it('should return an empty array when no wallets exist', async () => {
      const wallets = await getAllEncryptedWallets();
      expect(wallets).toEqual([]);
    });

    it('should return only mnemonic and privateKey wallets', async () => {
      const mnemonicWallet: EncryptedWalletRecord = {
        id: '1',
        name: 'Mnemonic Wallet',
        type: 'mnemonic',
        addressType: 'P2WPKH',
        encryptedSecret: 'encrypted-mnemonic',
      };
      const pkWallet: EncryptedWalletRecord = {
        id: '2',
        name: 'PK Wallet',
        type: 'privateKey',
        addressType: AddressType.P2PKH,
        encryptedSecret: 'encrypted-pk',
      };
      const otherRecord = {
        id: '3',
        name: 'Other',
        type: 'other',
      };
      await addRecord(mnemonicWallet);
      await addRecord(pkWallet);
      await addRecord(otherRecord);
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
        addressType: AddressType.P2WPKH,
        encryptedSecret: 'encrypted-secret',
      };
      await addEncryptedWallet(wallet);
      const wallets = await getAllEncryptedWallets();
      expect(wallets).toContainEqual(wallet);
      expect(wallets.length).toBe(1);
    });

    it('should throw an error for duplicate wallet ID', async () => {
      const wallet: EncryptedWalletRecord = {
        id: '1',
        name: 'Test Wallet',
        type: 'mnemonic',
        addressType: AddressType.P2WPKH,
        encryptedSecret: 'encrypted-secret',
      };
      await addEncryptedWallet(wallet);
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
        addressType: AddressType.P2PKH,
        encryptedSecret: 'encrypted-secret',
      };
      await addEncryptedWallet(wallet);
      const updatedWallet: EncryptedWalletRecord = {
        ...wallet,
        name: 'Updated Wallet',
        addressCount: 5,
      };
      await updateEncryptedWallet(updatedWallet);
      const wallets = await getAllEncryptedWallets();
      expect(wallets).toContainEqual(updatedWallet);
      expect(wallets.length).toBe(1);
    });

    it('should throw an error for non-existent wallet ID', async () => {
      const wallet: EncryptedWalletRecord = {
        id: 'nonexistent',
        name: 'Test Wallet',
        type: 'mnemonic',
        addressType: AddressType.P2WPKH,
        encryptedSecret: 'encrypted-secret',
      };
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
        addressType: AddressType.P2WPKH,
        encryptedSecret: 'encrypted-secret-1',
      };
      const wallet2: EncryptedWalletRecord = {
        id: '2',
        name: 'Wallet 2',
        type: 'privateKey',
        addressType: AddressType.P2PKH,
        encryptedSecret: 'encrypted-secret-2',
      };
      await addEncryptedWallet(wallet1);
      await addEncryptedWallet(wallet2);
      await removeEncryptedWallet('1');
      const wallets = await getAllEncryptedWallets();
      expect(wallets).toEqual([wallet2]);
      expect(wallets.length).toBe(1);
    });

    it('should do nothing for a non-existent wallet ID', async () => {
      const wallet: EncryptedWalletRecord = {
        id: '1',
        name: 'Test Wallet',
        type: 'mnemonic',
        addressType: AddressType.P2WPKH,
        encryptedSecret: 'encrypted-secret',
      };
      await addEncryptedWallet(wallet);
      await removeEncryptedWallet('nonexistent');
      const wallets = await getAllEncryptedWallets();
      expect(wallets).toEqual([wallet]);
      expect(wallets.length).toBe(1);
    });
  });
});
