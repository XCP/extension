import { describe, it, expect } from 'vitest';
import { getDerivationPathForAddressType, AddressType } from '@/utils/blockchain/bitcoin/address';

describe('Bitcoin Address Utilities', () => {
  it('should return the correct derivation path for P2PKH', () => {
    expect(getDerivationPathForAddressType(AddressType.P2PKH)).toBe("m/44'/0'/0'/0");
  });

  it('should return the correct derivation path for P2SH_P2WPKH', () => {
    expect(getDerivationPathForAddressType(AddressType.P2SH_P2WPKH)).toBe("m/49'/0'/0'/0");
  });

  it('should return the correct derivation path for P2WPKH', () => {
    expect(getDerivationPathForAddressType(AddressType.P2WPKH)).toBe("m/84'/0'/0'/0");
  });

  it('should return the correct derivation path for P2TR', () => {
    expect(getDerivationPathForAddressType(AddressType.P2TR)).toBe("m/86'/0'/0'/0");
  });

  it('should return the correct derivation path for Counterwallet', () => {
    expect(getDerivationPathForAddressType(AddressType.Counterwallet)).toBe("m/0'/0");
  });
});
