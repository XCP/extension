import { vi, expect } from 'vitest';
import { AddressFormat } from '@/utils/blockchain/bitcoin/address';
import type { Wallet, Address, KeychainRecord, Keychain } from '@/types/wallet';

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
    getKeychainMasterKey: vi.fn().mockResolvedValue(null),
    storeKeychainMasterKey: vi.fn().mockResolvedValue(undefined),
    clearKeychainMasterKey: vi.fn().mockResolvedValue(undefined),
  },
  settingsStorage: {
    getSettings: vi.fn().mockResolvedValue({
      lastActiveWalletId: null,
      autoLockTimer: '5m',
    }),
    updateSettings: vi.fn().mockResolvedValue(undefined),
    initializeSettingsMasterKey: vi.fn().mockResolvedValue(undefined),
    invalidateSettingsCache: vi.fn(),
  },
  walletStorage: {
    getKeychainRecord: vi.fn().mockResolvedValue(null),
    saveKeychainRecord: vi.fn().mockResolvedValue(undefined),
    hasKeychain: vi.fn().mockResolvedValue(false),
    deleteKeychain: vi.fn().mockResolvedValue(undefined),
  },
  keyBased: {
    deriveKey: vi.fn().mockResolvedValue({} as CryptoKey),
    encryptWithKey: vi.fn().mockResolvedValue('encrypted-data'),
    decryptWithKey: vi.fn().mockResolvedValue('decrypted-data'),
    encryptJsonWithKey: vi.fn().mockResolvedValue('encrypted-json'),
    decryptJsonWithKey: vi.fn().mockResolvedValue({}),
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
    keyBased: vi.mocked(defaultMocks.keyBased),
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
 * Create a mock keychain record for testing
 */
export const createTestKeychainRecord = (wallets: Wallet[] = []): KeychainRecord => ({
  version: 1,
  kdf: { iterations: 600000 },
  salt: 'dGVzdC1zYWx0', // base64 "test-salt"
  encryptedKeychain: 'encrypted-keychain-data',
});

/**
 * Create a mock decrypted keychain
 */
export const createTestKeychain = (wallets: Wallet[] = []): Keychain => ({
  version: 1,
  wallets: wallets.map(w => ({
    id: w.id,
    name: w.name,
    type: w.type,
    addressFormat: w.addressFormat,
    addressCount: w.addressCount,
    previewAddress: 'bc1qpreview',
    encryptedSecret: 'encrypted-secret',
  })),
  settings: {
    version: 2,
    lastActiveWalletId: wallets[0]?.id,
    autoLockTimer: '5m' as const,
    fiat: 'usd' as const,
    priceUnit: 'btc' as const,
    pinnedAssets: [],
    showHelpText: false,
    analyticsAllowed: true,
    connectedWebsites: [],
    allowUnconfirmedTxs: true,
    enableMPMA: false,
    enableAdvancedBroadcasts: false,
    transactionDryRun: false,
    counterpartyApiBase: 'https://api.counterparty.io:4000',
    defaultOrderExpiration: 8064,
    strictTransactionVerification: true,
  },
});

/**
 * Mock successful keychain unlock
 */
export const mockKeychainUnlocked = (
  mocks: ReturnType<typeof setupMocks>,
  keychain: Keychain,
  masterKey: CryptoKey = {} as CryptoKey
) => {
  mocks.walletStorage.getKeychainRecord.mockResolvedValue(createTestKeychainRecord());
  mocks.keyBased.deriveKey.mockResolvedValue(masterKey);
  mocks.keyBased.decryptJsonWithKey.mockResolvedValue(keychain);
  mocks.sessionManager.getKeychainMasterKey.mockResolvedValue(masterKey);
};

/**
 * Mock wallet already unlocked (secret available in session)
 */
export const mockWalletUnlocked = (
  mocks: ReturnType<typeof setupMocks>,
  walletId: string,
  secret: string = 'test mnemonic'
) => {
  mocks.sessionManager.getUnlockedSecret.mockImplementation((id) =>
    Promise.resolve(id === walletId ? secret : null)
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
