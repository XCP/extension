import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AddressFormat, getAddressFromMnemonic } from '@/core/bitcoin/address';
import {
  detectGiftCard,
  detectUtxoAddress,
  GIFT_CARD_ADDRESS_INDEX,
  GIFT_CARD_PATH,
  isUtxoAddressPath,
  parseUtxoAddressPath,
  utxoAddressPath,
} from '../rarePepeWalletDiscovery';

const { probeAddressActivity } = vi.hoisted(() => ({ probeAddressActivity: vi.fn() }));

vi.mock('@/core/bitcoin/address', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/core/bitcoin/address')>()),
  probeAddressActivity,
}));

// A Counterwallet mnemonic — every word is on the Counterwallet wordlist.
const MNEMONIC = 'like just love know never want time out there make look eye';

const FIRST_ADDRESS = getAddressFromMnemonic(MNEMONIC, "m/0'/0/0", AddressFormat.Counterwallet);
const GIFT_CARD_ADDRESS = getAddressFromMnemonic(
  MNEMONIC,
  GIFT_CARD_PATH,
  AddressFormat.Counterwallet
);

/** Answer per address; anything unlisted is reachable and empty. */
function respond(byAddress: Record<string, { active?: boolean; reachable?: boolean }>) {
  probeAddressActivity.mockImplementation(async (address: string) => ({
    active: byAddress[address]?.active ?? false,
    reachable: byAddress[address]?.reachable ?? true,
  }));
}

describe('rarePepeWalletDiscovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('paths', () => {
    it('puts a gift card on the 500th legacy address', () => {
      // Addresses display from one, so the 500th is index 499.
      expect(GIFT_CARD_ADDRESS_INDEX).toBe(499);
      expect(GIFT_CARD_PATH).toBe("m/0'/0/499");
    });

    it('pairs a UTXO address with its receive address on the change branch', () => {
      expect(utxoAddressPath(0)).toBe("m/0'/1/0");
      expect(utxoAddressPath(7)).toBe("m/0'/1/7");
      expect(parseUtxoAddressPath(utxoAddressPath(7))).toBe(7);
    });

    it('rejects an index that is not a whole non-negative number', () => {
      expect(() => utxoAddressPath(-1)).toThrow();
      expect(() => utxoAddressPath(1.5)).toThrow();
    });

    it('recognises only change-branch paths', () => {
      expect(isUtxoAddressPath("m/0'/1/3")).toBe(true);
      expect(isUtxoAddressPath("m/0'/0/3")).toBe(false);
      expect(isUtxoAddressPath("m/44'/0'/0'/1/3")).toBe(false);
      expect(isUtxoAddressPath("m/0'/1/3'")).toBe(false);
      expect(isUtxoAddressPath("m/0'/1/")).toBe(false);
      expect(isUtxoAddressPath('nonsense')).toBe(false);
    });
  });

  describe('detectGiftCard', () => {
    it('finds a card when only the 500th address is funded', async () => {
      respond({ [GIFT_CARD_ADDRESS]: { active: true } });

      await expect(detectGiftCard(MNEMONIC)).resolves.toEqual({
        status: 'found',
        value: GIFT_CARD_ADDRESS,
      });
    });

    it('leaves a seed with a used first address alone', async () => {
      respond({ [FIRST_ADDRESS]: { active: true }, [GIFT_CARD_ADDRESS]: { active: true } });

      await expect(detectGiftCard(MNEMONIC)).resolves.toEqual({ status: 'none' });
      // The first address settles it, so the gift card address is never fetched.
      expect(probeAddressActivity).toHaveBeenCalledTimes(1);
      expect(probeAddressActivity).toHaveBeenCalledWith(FIRST_ADDRESS);
    });

    it('reports an empty seed as no card', async () => {
      respond({});

      await expect(detectGiftCard(MNEMONIC)).resolves.toEqual({ status: 'none' });
    });

    it('does not call an unreachable API an empty address', async () => {
      respond({ [FIRST_ADDRESS]: { reachable: false } });

      await expect(detectGiftCard(MNEMONIC)).resolves.toEqual({ status: 'unavailable' });
    });

    it('reports unavailable when only the gift card lookup fails', async () => {
      respond({ [GIFT_CARD_ADDRESS]: { reachable: false } });

      await expect(detectGiftCard(MNEMONIC)).resolves.toEqual({ status: 'unavailable' });
    });
  });

  describe('detectUtxoAddress', () => {
    it('finds a funded change address for a Counterwallet wallet', async () => {
      const utxoAddress = getAddressFromMnemonic(
        MNEMONIC,
        utxoAddressPath(2),
        AddressFormat.Counterwallet
      );
      respond({ [utxoAddress]: { active: true } });

      await expect(
        detectUtxoAddress(MNEMONIC, AddressFormat.Counterwallet, 2)
      ).resolves.toEqual({ status: 'found', value: utxoAddress });
    });

    it('follows the wallet format, so SegWit gets a SegWit change address', async () => {
      const utxoAddress = getAddressFromMnemonic(
        MNEMONIC,
        utxoAddressPath(0),
        AddressFormat.CounterwalletSegwit
      );
      respond({ [utxoAddress]: { active: true } });

      await expect(
        detectUtxoAddress(MNEMONIC, AddressFormat.CounterwalletSegwit, 0)
      ).resolves.toEqual({ status: 'found', value: utxoAddress });
      expect(utxoAddress.startsWith('bc1q')).toBe(true);
    });

    it('skips formats that cannot have one, without asking the API', async () => {
      respond({});

      await expect(detectUtxoAddress(MNEMONIC, AddressFormat.P2TR, 0)).resolves.toEqual({
        status: 'none',
      });
      expect(probeAddressActivity).not.toHaveBeenCalled();
    });

    it('reports unavailable rather than empty when the lookup fails', async () => {
      const utxoAddress = getAddressFromMnemonic(
        MNEMONIC,
        utxoAddressPath(0),
        AddressFormat.Counterwallet
      );
      respond({ [utxoAddress]: { reachable: false } });

      await expect(
        detectUtxoAddress(MNEMONIC, AddressFormat.Counterwallet, 0)
      ).resolves.toEqual({ status: 'unavailable' });
    });
  });
});
