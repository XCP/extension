import { describe, expect, it } from 'vitest';
import { AddressFormat } from '@/core/bitcoin/address';
import {
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
