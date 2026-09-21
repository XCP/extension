import { afterEach, describe, expect, it } from 'vitest';
import { getSourcePubkey, setSourcePubkeyProvider } from '../sourcePubkey';

const ADDRESS = '1BgGZ9tcN4rm9KBzDn7KprQz87SZ26SAMH';
const UNCOMPRESSED_ADDRESS = '1EHNa6Q4Jz2uvNExL497mE43ikXhwF6kZm';
const PUBKEY = '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798';

describe('sourcePubkey provider', () => {
  afterEach(() => setSourcePubkeyProvider(null));

  // The common case for every context that never registers: background, tests, anything outside
  // the popup. Compose then omits the parameter, which is exactly the pre-existing behaviour.
  it('answers null with no provider registered', () => {
    expect(getSourcePubkey(ADDRESS)).toBeNull();
  });

  it('answers from the registered provider', () => {
    setSourcePubkeyProvider((address) => (address === ADDRESS ? PUBKEY : null));

    expect(getSourcePubkey(ADDRESS)).toBe(PUBKEY);
    expect(getSourcePubkey('somewhere-else')).toBeNull();
  });

  // Test-only wallets store '' for the key. An empty multisig_pubkey parameter is one core would
  // reject, so empty must read as "no key" rather than as a key.
  it('treats an empty string from the provider as no key', () => {
    setSourcePubkeyProvider(() => '');
    expect(getSourcePubkey(ADDRESS)).toBeNull();
  });

  it('answers null for an empty address without consulting the provider', () => {
    let consulted = false;
    setSourcePubkeyProvider(() => {
      consulted = true;
      return PUBKEY;
    });

    expect(getSourcePubkey('')).toBeNull();
    expect(consulted).toBe(false);
  });

  it('unregisters cleanly', () => {
    setSourcePubkeyProvider(() => PUBKEY);
    setSourcePubkeyProvider(null);
    expect(getSourcePubkey(ADDRESS)).toBeNull();
  });
});
describe('anything that is not a public key', () => {
  afterEach(() => setSourcePubkeyProvider(null));

  // The bug this guard exists for. HardwareWalletSecret.publicKey is documented as "public key OR
  // descriptor for the account", and Trezor account discovery fills it with the account xpub,
  // which addressDeriver copies into Address.pubKey. It reached core as multisig_pubkey and came
  // back "Invalid multisig pubkey: zpub6...", failing every long-data compose from a Trezor --
  // an MPMA past a handful of recipients, for instance. Ordinary sends never need the parameter,
  // which is why it stayed hidden.
  it('refuses an account extended key', () => {
    const ZPUB =
      'zpub6sBrmzjUxmABqXV5rzRzdY9uqpKBRa3oT5RCKEhtyXaofMAPiENcKh66aH7RWKh1z2uPN9Fs6dHmuYqZofp9X1cGgQ1ecfAhCgh3jwHkXbD';
    setSourcePubkeyProvider(() => ZPUB);
    expect(getSourcePubkey(ADDRESS)).toBeNull();
  });

  it('refuses xpub, ypub and a descriptor alike', () => {
    for (const value of [
      'xpub661MyMwAqRbcFtXgS5sYJABqqG9YLmC4Q1Rdap9gSE8NqtwybGhePY2gZ29ESFjqJoCu1Rupje8YtGqsefD265TMg7usUDFdp6W1EGMcet8',
      'ypub6QqdH2c5z7967SLSHZLTQfPCVXEUnSFqXCTLoRLKZ4gTr8LQdgPZ4t3Q6JQ2b2Mv1sHVKGjrWEDwmXCbLbnvGyPnvHUEEdJHVWNfSJ7SbYQ',
      'wpkh([abcd1234/84h/0h/0h]xpub6ABC/0/*)',
    ]) {
      setSourcePubkeyProvider(() => value);
      expect(getSourcePubkey(ADDRESS)).toBeNull();
    }
  });

  // Length matters as much as prefix: a truncated key is still hex and still starts 02.
  it('refuses a key of the wrong length', () => {
    setSourcePubkeyProvider(() => '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f817');
    expect(getSourcePubkey(ADDRESS)).toBeNull();
  });

  it('still accepts a real uncompressed key', () => {
    // 04-prefixed keys are valid curve points and core accepts them; refusing one would break a
    // wallet that legitimately holds it.
    const UNCOMPRESSED =
      '0479be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798' +
      '483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8';
    setSourcePubkeyProvider(() => UNCOMPRESSED);
    expect(getSourcePubkey(UNCOMPRESSED_ADDRESS)).toBe(UNCOMPRESSED);
  });

  it('refuses the other serialization of the same point for a P2PKH source', () => {
    const UNCOMPRESSED =
      '0479be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798' +
      '483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8';
    setSourcePubkeyProvider(() => PUBKEY);
    expect(getSourcePubkey(UNCOMPRESSED_ADDRESS)).toBeNull();
    setSourcePubkeyProvider(() => UNCOMPRESSED);
    expect(getSourcePubkey(ADDRESS)).toBeNull();
  });
});

