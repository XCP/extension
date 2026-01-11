import { vi, expect } from 'vitest';
import { AddressFormat } from '@/utils/blockchain/bitcoin/address';
import type { Wallet, Address } from '../../walletManager';

/**
 * Test data factory for creating wallet objects
 */
export const createTestWallet = (overrides?: Partial<Wallet>): Wallet => ({
  id: 'test-wallet-id',
  name: 'Test Wallet',
  type: 'mnemonic',
  addressFormat: AddressFormat.P2WPKH,
  addressCount: 0,
  addresses: [],
  ...overrides,
});

/**
 * Test data factory for creating private key wallet
 */
export const createPrivateKeyWallet = (overrides?: Partial<Wallet>): Wallet => ({
  id: 'pk-wallet-id',
  name: 'Private Key Wallet',
  type: 'privateKey',
  addressFormat: AddressFormat.P2WPKH,
  addressCount: 1,
  addresses: [],
  ...overrides,
});

/**
 * Default mock implementations
 */
export const defaultMocks = {
  sessionManager: {
    setLastActiveTime: vi.fn().mockResolvedValue(undefined),
    getUnlockedSecret: vi.fn().mockResolvedValue(null),
    storeUnlockedSecret: vi.fn(),
    clearUnlockedSecret: vi.fn(),
    clearAllUnlockedSecrets: vi.fn().mockResolvedValue(undefined),
    initializeSession: vi.fn().mockResolvedValue(undefined),
  },
  settingsStorage: {
    getSettings: vi.fn().mockResolvedValue({
      lastActiveWalletId: null,
      autoLockTimer: '5m',
    }),
    updateSettings: vi.fn().mockResolvedValue(undefined),
  },
  walletStorage: {
    getAllEncryptedWallets: vi.fn().mockResolvedValue([]),
    addEncryptedWallet: vi.fn().mockResolvedValue(undefined),
    updateEncryptedWallet: vi.fn().mockResolvedValue(undefined),
    removeEncryptedWallet: vi.fn().mockResolvedValue(undefined),
  },
  encryption: {
    encryptMnemonic: vi.fn().mockResolvedValue({
      encryptedData: 'encrypted-mnemonic',
      salt: 'salt',
      iv: 'iv',
      tag: 'tag',
      version: 1,
    }),
    decryptMnemonic: vi.fn().mockResolvedValue('test mnemonic phrase'),
    encryptPrivateKey: vi.fn().mockResolvedValue({
      encryptedData: 'encrypted-pk',
      salt: 'salt',
      iv: 'iv',
      tag: 'tag',
      version: 1,
    }),
    decryptPrivateKey: vi.fn().mockResolvedValue('private-key-hex'),
  },
  bitcoin: {
    AddressFormat,
    getAddressFromMnemonic: vi.fn().mockReturnValue({
      address: 'bc1qtest',
      publicKey: 'public-key-hex',
    }),
    getPrivateKeyFromMnemonic: vi.fn().mockReturnValue('private-key-from-mnemonic'),
    getAddressFromPrivateKey: vi.fn().mockReturnValue({
      address: 'bc1qprivatekey',
      publicKey: 'public-key-hex',
    }),
    getPublicKeyFromPrivateKey: vi.fn().mockReturnValue('public-key-hex'),
    decodeWIF: vi.fn().mockReturnValue('decoded-private-key'),
    isWIF: vi.fn().mockReturnValue(false),
    getDerivationPathForAddressFormat: vi.fn().mockReturnValue("m/84'/0'/0'"),
  },
  crypto: {
    sha256: vi.fn().mockReturnValue(new Uint8Array(32)),
    utf8ToBytes: vi.fn().mockReturnValue(new Uint8Array([1, 2, 3])),
    bytesToHex: vi.fn().mockReturnValue('wallet-id-hash'),
  },
};

/**
 * Setup all mocks with default implementations
 */
export const setupMocks = () => {
  const mocks = {
    sessionManager: vi.mocked(defaultMocks.sessionManager),
    settingsStorage: vi.mocked(defaultMocks.settingsStorage),
    walletStorage: vi.mocked(defaultMocks.walletStorage),
    encryption: vi.mocked(defaultMocks.encryption),
    bitcoin: vi.mocked(defaultMocks.bitcoin),
    crypto: vi.mocked(defaultMocks.crypto),
  };

  // Reset all mocks to default state
  Object.values(mocks).forEach(mock => {
    Object.values(mock).forEach(fn => {
      if (typeof fn === 'function' && 'mockClear' in fn) {
        fn.mockClear();
      }
    });
  });

  return mocks;
};

/**
 * Create a mock wallet with addresses
 */
export const createWalletWithAddresses = (
  addressCount: number = 3,
  overrides?: Partial<Wallet>
): Wallet => {
  const addresses: Address[] = Array.from({ length: addressCount }, (_, i) => ({
    name: `Address ${i + 1}`,
    address: `bc1qaddress${i}`,
    pubKey: `public-key-${i}`,
    path: `m/84'/0'/0'/0/${i}`,
  }));

  return createTestWallet({
    addresses,
    addressCount: addressCount,
    ...overrides,
  });
};

/**
 * Mock successful wallet unlock
 */
export const mockSuccessfulUnlock = (
  mocks: ReturnType<typeof setupMocks>,
  wallet: Wallet,
  secret: string = 'test mnemonic'
) => {
  mocks.sessionManager.getUnlockedSecret.mockResolvedValue(null);
  mocks.encryption.decryptMnemonic.mockResolvedValue(secret);
  mocks.sessionManager.storeUnlockedSecret.mockImplementation(() => {
    mocks.sessionManager.getUnlockedSecret.mockResolvedValue(secret);
  });
};

/**
 * Mock wallet already unlocked
 */
export const mockWalletUnlocked = (
  mocks: ReturnType<typeof setupMocks>,
  walletId: string,
  secret: string = 'test mnemonic'
) => {
  mocks.sessionManager.getUnlockedSecret.mockImplementation((id) =>
    id === walletId ? secret : null
  );
};

/**
 * Test data for different scenarios
 */
export const testScenarios = {
  validMnemonic: 'test mnemonic phrase with twelve words here for testing purposes only',
  invalidMnemonic: 'invalid mnemonic',
  validPrivateKey: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
  validWIF: 'L1234567890abcdefghijklmnopqrstuvwxyz',
  validPassword: 'TestPassword123!',
  weakPassword: '123',
  
  maxWallets: 20,
  maxAddresses: 100,
  
  addressTypes: [
    AddressFormat.P2PKH,
    AddressFormat.P2WPKH,
    AddressFormat.P2SH_P2WPKH,
    AddressFormat.P2TR,
    AddressFormat.Counterwallet,
  ],
};

/**
 * Create multiple test wallets
 */
export const createMultipleWallets = (count: number): Wallet[] => {
  return Array.from({ length: count }, (_, i) =>
    createTestWallet({
      id: `wallet-${i}`,
      name: `Wallet ${i + 1}`,
    })
  );
};

/**
 * Assert wallet state
 */
export const assertWalletState = (
  wallet: Wallet,
  expectedState: {
    hasAddresses?: boolean;
    addressCount?: number;
    isUnlocked?: boolean;
    name?: string;
    type?: 'mnemonic' | 'privateKey';
  }
) => {
  if (expectedState.hasAddresses !== undefined) {
    expect(wallet.addresses.length > 0).toBe(expectedState.hasAddresses);
  }
  if (expectedState.addressCount !== undefined) {
    expect(wallet.addresses).toHaveLength(expectedState.addressCount);
  }
  if (expectedState.name !== undefined) {
    expect(wallet.name).toBe(expectedState.name);
  }
  if (expectedState.type !== undefined) {
    expect(wallet.type).toBe(expectedState.type);
  }
};