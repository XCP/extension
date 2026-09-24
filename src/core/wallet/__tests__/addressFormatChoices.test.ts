import { describe, expect, it } from 'vitest';
import { AddressFormat } from '@/core/bitcoin/address';
import {
  addressIndexKeptBySwitch,
  canSwitchAddressFormat,
  isAddressFormatLocked,
  selectableAddressFormats,
} from '@/core/wallet/addressFormatChoices';

const STANDARD = [AddressFormat.P2TR, AddressFormat.P2WPKH, AddressFormat.P2SH_P2WPKH, AddressFormat.P2PKH];

describe('selectableAddressFormats', () => {
  it.each(STANDARD)('offers only standard BIP39 formats to a %s wallet', (format) => {
    expect(selectableAddressFormats(format)).toEqual(STANDARD);
  });

  it.each([AddressFormat.Counterwallet, AddressFormat.CounterwalletSegwit])(
    'keeps a %s wallet within the Counterwallet formats',
    (format) => {
      expect(selectableAddressFormats(format)).toEqual([
        AddressFormat.Counterwallet,
        AddressFormat.CounterwalletSegwit,
      ]);
    }
  );

  it.each([AddressFormat.FreewalletBIP39, AddressFormat.FreewalletBIP39Segwit])(
    'keeps a %s wallet within the FreeWallet BIP39 formats',
    (format) => {
      expect(selectableAddressFormats(format)).toEqual([
        AddressFormat.FreewalletBIP39,
        AddressFormat.FreewalletBIP39Segwit,
      ]);
    }
  );
});

describe('address format switching eligibility', () => {
  it('locks hardware wallets only', () => {
    expect(isAddressFormatLocked({ type: 'hardware' })).toBe(true);
    expect(isAddressFormatLocked({ type: 'mnemonic' })).toBe(false);
    expect(isAddressFormatLocked({ type: 'privateKey' })).toBe(false);
  });

  it('allows switching exactly where the wallet manager can re-derive: mnemonic wallets', () => {
    expect(canSwitchAddressFormat({ type: 'mnemonic' })).toBe(true);
    expect(canSwitchAddressFormat({ type: 'privateKey' })).toBe(false);
    expect(canSwitchAddressFormat({ type: 'hardware' })).toBe(false);
  });
});

describe('addressIndexKeptBySwitch', () => {
  const addresses = [0, 1, 2].map((index) => ({
    name: `Address ${index + 1}`,
    address: `address-${index}`,
    path: `m/84'/0'/0'/0/${index}`,
    pubKey: `02${index}`,
  }));
  const wallet = { addresses, addressCount: 3 };

  it('keeps the active address index', () => {
    expect(addressIndexKeptBySwitch(wallet, 'address-2')).toBe(2);
  });

  it('falls back to the first address when the active address is not one of the wallet addresses', () => {
    expect(addressIndexKeptBySwitch(wallet, 'elsewhere')).toBe(0);
    expect(addressIndexKeptBySwitch(wallet, null)).toBe(0);
  });

  it('uses the trailing index of an off-branch address, clamped to the exposed count', () => {
    const utxo = { name: 'UTXO Address 1', address: 'utxo-1', path: "m/0'/1/1", pubKey: '03' };
    const giftCard = { name: 'Address 501', address: 'gift', path: "m/0'/0/500", pubKey: '04' };
    const withExtras = { addresses: [...addresses, utxo, giftCard], addressCount: 3 };
    expect(addressIndexKeptBySwitch(withExtras, 'utxo-1')).toBe(1);
    expect(addressIndexKeptBySwitch(withExtras, 'gift')).toBe(2);
  });

  it('is 0 for an unparseable path or an empty wallet', () => {
    const hardened = { addresses: [{ ...addresses[0]!, path: "m/84'/0'/0'" }], addressCount: 1 };
    expect(addressIndexKeptBySwitch(hardened, 'address-0')).toBe(0);
    expect(addressIndexKeptBySwitch({ addresses: [], addressCount: 0 }, null)).toBe(0);
  });
});
