import { afterEach, describe, expect, it } from 'vitest';
import { getSourcePubkey, setSourcePubkeyProvider } from '../sourcePubkey';

const ADDRESS = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';
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
