import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { AddressType } from '@/utils/blockchain/bitcoin';
import {
  getAllRecords,
  addRecord,
  updateRecord,
  removeRecord,
} from '@/utils/storage';
import {
  getAllEncryptedWallets,
  addEncryptedWallet,
  updateEncryptedWallet,
  removeEncryptedWallet,
  EncryptedWalletRecord,
} from '../walletStorage';

vi.mock('@/utils/storage', () => ({
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
        addressType: AddressType.P2WPKH,
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
        addressType: AddressType.P2WPKH,
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
        addressType: AddressType.P2WPKH,
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
        addressType: AddressType.P2PKH,
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
        addressType: AddressType.P2WPKH,
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
        addressType: AddressType.P2WPKH,
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
});
