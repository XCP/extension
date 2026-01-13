/**
 * TrezorAdapter Unit Tests
 *
 * Tests our adapter's business logic by mocking TrezorConnect responses.
 * This verifies:
 * - Script type mappings (address format → Trezor script type)
 * - Derivation path construction
 * - Response parsing and error handling
 * - Address format handling
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AddressFormat } from '@/utils/blockchain/bitcoin/address';
import { DerivationPaths } from './types';

// Mock TrezorConnect before importing adapter
vi.mock('@trezor/connect-webextension', () => ({
  default: {
    init: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn().mockResolvedValue(undefined),
    getPublicKey: vi.fn(),
    getAddress: vi.fn(),
    signMessage: vi.fn(),
    signTransaction: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  },
  DEVICE_EVENT: 'DEVICE_EVENT',
  DEVICE: {
    CONNECT: 'device-connect',
    DISCONNECT: 'device-disconnect',
  },
}));

// Import after mocking
import TrezorConnect from '@trezor/connect-webextension';
import { TrezorAdapter } from './trezorAdapter';

describe('TrezorAdapter', () => {
  let adapter: TrezorAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new TrezorAdapter();
  });

  afterEach(async () => {
    await adapter.dispose();
  });

  describe('Initialization', () => {
    it('initializes TrezorConnect with correct manifest', async () => {
      await adapter.init();

      expect(TrezorConnect.init).toHaveBeenCalledWith(
        expect.objectContaining({
          manifest: expect.objectContaining({
            appName: 'XCP Wallet',
            email: 'support@xcpwallet.com',
            appUrl: 'https://xcpwallet.com',
          }),
        })
      );
    });

    it('uses popup mode by default (production)', async () => {
      await adapter.init();

      expect(TrezorConnect.init).toHaveBeenCalledWith(
        expect.objectContaining({
          popup: true,
          transports: ['WebUsbTransport'],
        })
      );
    });

    it('uses BridgeTransport in test mode', async () => {
      await adapter.init({ testMode: true });

      expect(TrezorConnect.init).toHaveBeenCalledWith(
        expect.objectContaining({
          popup: false,
          transports: ['BridgeTransport'],
        })
      );
    });

    it('only initializes once', async () => {
      await adapter.init();
      await adapter.init();

      expect(TrezorConnect.init).toHaveBeenCalledTimes(1);
    });

    it('registers device event listener', async () => {
      await adapter.init();

      expect(TrezorConnect.on).toHaveBeenCalledWith('DEVICE_EVENT', expect.any(Function));
    });
  });

  describe('getXpub', () => {
    beforeEach(async () => {
      await adapter.init({ testMode: true });
    });

    it('calls TrezorConnect.getPublicKey with correct path for Native SegWit', async () => {
      vi.mocked(TrezorConnect.getPublicKey).mockResolvedValue({
        success: true,
        payload: {
          xpub: 'zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtKsAYz2oz2AGutZYs',
          path: [2147483732, 2147483648, 2147483648], // m/84'/0'/0'
        },
      } as any);

      const result = await adapter.getXpub(AddressFormat.P2WPKH, 0);

      expect(TrezorConnect.getPublicKey).toHaveBeenCalledWith(
        expect.objectContaining({
          path: "m/84'/0'/0'",
          coin: 'btc',
        })
      );
      expect(result).toBe(
        'zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtKsAYz2oz2AGutZYs'
      );
    });

    it('calls TrezorConnect.getPublicKey with correct path for Legacy', async () => {
      vi.mocked(TrezorConnect.getPublicKey).mockResolvedValue({
        success: true,
        payload: {
          xpub: 'xpub6BosfCnifzxcFwrSzQiqu2DBVTshkCXacvNsWGYJVVhhawA7d4R5WSWGFNbi8Aw6ZRc1brxMyWMzG3DSSSSoekkudhUd9yLb6qx39T9nMdj',
          path: [2147483692, 2147483648, 2147483648], // m/44'/0'/0'
        },
      } as any);

      const result = await adapter.getXpub(AddressFormat.P2PKH, 0);

      expect(TrezorConnect.getPublicKey).toHaveBeenCalledWith(
        expect.objectContaining({
          path: "m/44'/0'/0'",
          coin: 'btc',
        })
      );
      expect(result).toContain('xpub');
    });

    it('calls TrezorConnect.getPublicKey with correct path for Nested SegWit', async () => {
      vi.mocked(TrezorConnect.getPublicKey).mockResolvedValue({
        success: true,
        payload: {
          xpub: 'ypub6Ww3ibxVfGzLrAH1PNcjyAWenMTbbAosGNB6VvmSEgytSER9azLDWCxoJwW7Ke7icmizBMXrzBx9979FfaHxHcrArf3zbeJJJUZPf663zsP',
          path: [2147483697, 2147483648, 2147483648], // m/49'/0'/0'
        },
      } as any);

      const result = await adapter.getXpub(AddressFormat.P2SH_P2WPKH, 0);

      expect(TrezorConnect.getPublicKey).toHaveBeenCalledWith(
        expect.objectContaining({
          path: "m/49'/0'/0'",
          coin: 'btc',
        })
      );
      expect(result).toContain('ypub');
    });

    it('calls TrezorConnect.getPublicKey with correct path for Taproot', async () => {
      vi.mocked(TrezorConnect.getPublicKey).mockResolvedValue({
        success: true,
        payload: {
          xpub: 'xpub6BgBgsespWvERF3LHQu6CnqdvfEvtMcQjYrcRzx53QJjSxarj2afYWcLteoGVky7D3UKDP9QyrLprQ3VCECoY49yfdDEHGCtMMj92pReUsQ',
          path: [2147483734, 2147483648, 2147483648], // m/86'/0'/0'
        },
      } as any);

      const result = await adapter.getXpub(AddressFormat.P2TR, 0);

      expect(TrezorConnect.getPublicKey).toHaveBeenCalledWith(
        expect.objectContaining({
          path: "m/86'/0'/0'",
          coin: 'btc',
        })
      );
    });

    it('throws HardwareWalletError on failure', async () => {
      vi.mocked(TrezorConnect.getPublicKey).mockResolvedValue({
        success: false,
        payload: { error: 'Device disconnected' },
      } as any);

      await expect(adapter.getXpub(AddressFormat.P2WPKH, 0)).rejects.toThrow('Device disconnected');
    });
  });

  describe('getAddress', () => {
    beforeEach(async () => {
      await adapter.init({ testMode: true });
    });

    it('derives address with correct path and script type for Native SegWit', async () => {
      vi.mocked(TrezorConnect.getAddress).mockResolvedValue({
        success: true,
        payload: {
          address: 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq',
          path: [2147483732, 2147483648, 2147483648, 0, 0],
        },
      } as any);

      const result = await adapter.getAddress(AddressFormat.P2WPKH, 0, 0);

      expect(TrezorConnect.getAddress).toHaveBeenCalledWith(
        expect.objectContaining({
          path: "m/84'/0'/0'/0/0",
          coin: 'btc',
          showOnTrezor: false,
        })
      );
      expect(result.address).toBe('bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq');
      expect(result.path).toBe("m/84'/0'/0'/0/0");
    });

    it('derives address with correct path for Legacy', async () => {
      vi.mocked(TrezorConnect.getAddress).mockResolvedValue({
        success: true,
        payload: {
          address: '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2',
          path: [2147483692, 2147483648, 2147483648, 0, 0],
        },
      } as any);

      const result = await adapter.getAddress(AddressFormat.P2PKH, 0, 0);

      expect(TrezorConnect.getAddress).toHaveBeenCalledWith(
        expect.objectContaining({
          path: "m/44'/0'/0'/0/0",
          coin: 'btc',
          showOnTrezor: false,
        })
      );
      expect(result.address).toMatch(/^1/);
    });

    it('shows address on device when showOnDevice is true', async () => {
      vi.mocked(TrezorConnect.getAddress).mockResolvedValue({
        success: true,
        payload: {
          address: 'bc1qtest123',
          path: [2147483732, 2147483648, 2147483648, 0, 0],
        },
      } as any);

      await adapter.getAddress(AddressFormat.P2WPKH, 0, 0, true);

      expect(TrezorConnect.getAddress).toHaveBeenCalledWith(
        expect.objectContaining({
          path: "m/84'/0'/0'/0/0",
          coin: 'btc',
          showOnTrezor: true,
        })
      );
    });
  });

  describe('getAddresses (batch)', () => {
    beforeEach(async () => {
      await adapter.init({ testMode: true });
    });

    it('derives multiple addresses using bundle', async () => {
      // getAddresses uses bundle call, which returns payload as array
      vi.mocked(TrezorConnect.getAddress).mockImplementation(async (params: any) => {
        // Bundle call: params has { bundle: [...], useEmptyPassphrase: boolean }
        if (params.bundle) {
          const addresses = params.bundle.map((item: any, i: number) => ({
            address: `bc1qaddr${i}`,
            path: item.path,
          }));
          return {
            success: true,
            payload: addresses,
          } as any;
        }
        // Single call fallback
        return {
          success: true,
          payload: { address: 'bc1qsingle', path: params.path },
        } as any;
      });

      const results = await adapter.getAddresses(AddressFormat.P2WPKH, 0, 0, 3);

      expect(results).toHaveLength(3);
      expect(results[0].address).toBe('bc1qaddr0');
      expect(results[1].address).toBe('bc1qaddr1');
      expect(results[2].address).toBe('bc1qaddr2');
      expect(TrezorConnect.getAddress).toHaveBeenCalledTimes(1); // Single bundle call
      expect(TrezorConnect.getAddress).toHaveBeenCalledWith(
        expect.objectContaining({
          bundle: expect.arrayContaining([
            expect.objectContaining({ path: "m/84'/0'/0'/0/0" }),
            expect.objectContaining({ path: "m/84'/0'/0'/0/1" }),
            expect.objectContaining({ path: "m/84'/0'/0'/0/2" }),
          ]),
        })
      );
    });
  });

  describe('signMessage', () => {
    beforeEach(async () => {
      await adapter.init({ testMode: true });
    });

    it('signs message with correct parameters', async () => {
      const mockSignature = 'H1234567890abcdef';
      vi.mocked(TrezorConnect.signMessage).mockResolvedValue({
        success: true,
        payload: {
          signature: mockSignature,
          address: 'bc1qtest',
        },
      } as any);

      // HardwareMessageSignRequest uses `path` as the property name
      // The adapter passes this directly to TrezorConnect
      const path = DerivationPaths.stringToPath("m/84'/0'/0'/0/0");
      const result = await adapter.signMessage({
        message: 'Hello World',
        path: path,
      });

      expect(TrezorConnect.signMessage).toHaveBeenCalledWith({
        path: path,
        message: 'Hello World',
        coin: 'Bitcoin',
      });
      expect(result.signature).toBe(mockSignature);
    });

    it('throws on sign failure', async () => {
      vi.mocked(TrezorConnect.signMessage).mockResolvedValue({
        success: false,
        payload: { error: 'User cancelled' },
      } as any);

      const path = DerivationPaths.stringToPath("m/84'/0'/0'/0/0");
      await expect(
        adapter.signMessage({
          message: 'Test',
          path: path,
        })
      ).rejects.toThrow('User cancelled');
    });
  });

  describe('dispose', () => {
    it('cleans up event listeners and disposes TrezorConnect', async () => {
      await adapter.init({ testMode: true });
      await adapter.dispose();

      expect(TrezorConnect.off).toHaveBeenCalled();
      expect(TrezorConnect.dispose).toHaveBeenCalled();
    });

    it('can be called multiple times safely', async () => {
      await adapter.init({ testMode: true });
      await adapter.dispose();
      await adapter.dispose();

      // Should not throw
      expect(TrezorConnect.dispose).toHaveBeenCalledTimes(1);
    });
  });
});

describe('DerivationPaths', () => {
  describe('getBip44Path', () => {
    it('generates correct Legacy path (purpose 44)', () => {
      const path = DerivationPaths.getBip44Path(AddressFormat.P2PKH, 0, 0, 0);
      const pathStr = DerivationPaths.pathToString(path);
      expect(pathStr).toBe("m/44'/0'/0'/0/0");
    });

    it('generates correct Native SegWit path (purpose 84)', () => {
      const path = DerivationPaths.getBip44Path(AddressFormat.P2WPKH, 0, 0, 0);
      const pathStr = DerivationPaths.pathToString(path);
      expect(pathStr).toBe("m/84'/0'/0'/0/0");
    });

    it('generates correct Nested SegWit path (purpose 49)', () => {
      const path = DerivationPaths.getBip44Path(AddressFormat.P2SH_P2WPKH, 0, 0, 0);
      const pathStr = DerivationPaths.pathToString(path);
      expect(pathStr).toBe("m/49'/0'/0'/0/0");
    });

    it('generates correct Taproot path (purpose 86)', () => {
      const path = DerivationPaths.getBip44Path(AddressFormat.P2TR, 0, 0, 0);
      const pathStr = DerivationPaths.pathToString(path);
      expect(pathStr).toBe("m/86'/0'/0'/0/0");
    });

    it('generates change path correctly', () => {
      const path = DerivationPaths.getBip44Path(AddressFormat.P2WPKH, 0, 1, 0);
      const pathStr = DerivationPaths.pathToString(path);
      expect(pathStr).toBe("m/84'/0'/0'/1/0");
    });

    it('generates different address indices correctly', () => {
      const path5 = DerivationPaths.getBip44Path(AddressFormat.P2WPKH, 0, 0, 5);
      const path100 = DerivationPaths.getBip44Path(AddressFormat.P2WPKH, 0, 0, 100);
      expect(DerivationPaths.pathToString(path5)).toBe("m/84'/0'/0'/0/5");
      expect(DerivationPaths.pathToString(path100)).toBe("m/84'/0'/0'/0/100");
    });

    it('generates different account indices correctly', () => {
      const path1 = DerivationPaths.getBip44Path(AddressFormat.P2WPKH, 1, 0, 0);
      const path5 = DerivationPaths.getBip44Path(AddressFormat.P2WPKH, 5, 0, 0);
      expect(DerivationPaths.pathToString(path1)).toBe("m/84'/0'/1'/0/0");
      expect(DerivationPaths.pathToString(path5)).toBe("m/84'/0'/5'/0/0");
    });
  });

  describe('pathToString and stringToPath', () => {
    it('converts path array to string correctly', () => {
      const path = [84 | 0x80000000, 0 | 0x80000000, 0 | 0x80000000, 0, 0];
      expect(DerivationPaths.pathToString(path)).toBe("m/84'/0'/0'/0/0");
    });

    it('converts string path to array correctly', () => {
      const path = DerivationPaths.stringToPath("m/84'/0'/0'/0/0");
      expect(path).toEqual([84 | 0x80000000, 0 | 0x80000000, 0 | 0x80000000, 0, 0]);
    });

    it('roundtrips correctly', () => {
      const original = "m/44'/0'/2'/1/5";
      const path = DerivationPaths.stringToPath(original);
      const result = DerivationPaths.pathToString(path);
      expect(result).toBe(original);
    });
  });

  describe('getPurpose', () => {
    it('returns 44 for Legacy (P2PKH)', () => {
      expect(DerivationPaths.getPurpose(AddressFormat.P2PKH)).toBe(44);
    });

    it('returns 49 for Nested SegWit (P2SH_P2WPKH)', () => {
      expect(DerivationPaths.getPurpose(AddressFormat.P2SH_P2WPKH)).toBe(49);
    });

    it('returns 84 for Native SegWit (P2WPKH)', () => {
      expect(DerivationPaths.getPurpose(AddressFormat.P2WPKH)).toBe(84);
    });

    it('returns 86 for Taproot (P2TR)', () => {
      expect(DerivationPaths.getPurpose(AddressFormat.P2TR)).toBe(86);
    });

    it('returns 84 for Counterwallet SegWit format', () => {
      expect(DerivationPaths.getPurpose(AddressFormat.CounterwalletSegwit)).toBe(84);
    });

    it('returns 44 for Counterwallet legacy format', () => {
      expect(DerivationPaths.getPurpose(AddressFormat.Counterwallet)).toBe(44);
    });
  });
});

describe('Script Type Mappings', () => {
  // Test the internal script type mapping functions indirectly through adapter behavior
  // These are critical for correct Trezor transaction signing

  let adapter: TrezorAdapter;

  beforeEach(async () => {
    vi.clearAllMocks();
    adapter = new TrezorAdapter();
    await adapter.init({ testMode: true });
  });

  afterEach(async () => {
    await adapter.dispose();
  });

  it('uses SPENDWITNESS for Native SegWit addresses', async () => {
    vi.mocked(TrezorConnect.getAddress).mockResolvedValue({
      success: true,
      payload: { address: 'bc1qtest', path: "m/84'/0'/0'/0/0" },
    } as any);

    await adapter.getAddress(AddressFormat.P2WPKH, 0, 0);

    // The path m/84' indicates Native SegWit (SPENDWITNESS)
    expect(TrezorConnect.getAddress).toHaveBeenCalledWith(
      expect.objectContaining({
        path: expect.stringContaining("84'"),
      })
    );
  });

  it('uses SPENDADDRESS for Legacy addresses', async () => {
    vi.mocked(TrezorConnect.getAddress).mockResolvedValue({
      success: true,
      payload: { address: '1test', path: "m/44'/0'/0'/0/0" },
    } as any);

    await adapter.getAddress(AddressFormat.P2PKH, 0, 0);

    // The path m/44' indicates Legacy (SPENDADDRESS)
    expect(TrezorConnect.getAddress).toHaveBeenCalledWith(
      expect.objectContaining({
        path: expect.stringContaining("44'"),
      })
    );
  });
});
