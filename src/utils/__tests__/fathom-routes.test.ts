import { describe, expect, it } from 'vitest';
import { sanitizePath } from '@/utils/fathom';

/**
 * Every dynamic route in src/pages, with a realistic value in the parameter slot.
 * The point is coverage of the route table rather than of the sanitizer's branches: a new
 * dynamic route added without a SENSITIVE_PATH_PATTERNS entry should still be caught by the
 * DYNAMIC_SEGMENT_PATTERNS backstop, and this is what proves that stays true.
 */
const TX_HASH = 'a'.repeat(64);
const BECH32 = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4';
const TAPROOT = 'bc1p5d7rjq7g6rdk2yhzks9smlaqtedr4dekq08ge8ztwac72sfr9rusxg3297';
const BASE58 = '1BgGZ9tcN4rm9KBzDn7KprQz87SZ26SAMH';

const ROUTES: Array<[string, string]> = [
  ['/assets/utxos/' + TX_HASH, 'utxo tx hash'],
  ['/assets/XCP', 'asset name'],
  ['/assets/RARE.PEPE', 'subasset longname'],
  ['/assets/A95428956661682177', 'numeric asset'],
  ['/market/dispensers/PEPECASH', 'dispenser asset'],
  ['/market/orders/XCP', 'order base asset'],
  ['/market/orders/XCP/PEPECASH', 'order pair'],
  ['/pools/XCP', 'pool asset a'],
  ['/pools/XCP/PEPECASH', 'pool pair'],
  ['/pools/A123456789012345678', 'lp asset'],
  ['/transactions/' + TX_HASH, 'transaction hash'],
  ['/compose/sweep/' + BECH32, 'bech32 address'],
  ['/compose/sweep/' + TAPROOT, 'taproot address'],
  ['/compose/sweep/' + BASE58, 'base58 address'],
];

/** Anything that could identify the user or their holdings must not survive sanitisation. */
function leaks(sanitized: string, original: string): string[] {
  const found: string[] = [];
  for (const value of [TX_HASH, BECH32, TAPROOT, BASE58, 'XCP', 'PEPECASH', 'RARE.PEPE',
    'A95428956661682177', 'A123456789012345678']) {
    if (original.includes(value) && sanitized.includes(value)) found.push(value);
  }
  return found;
}

describe('sanitizePath covers every dynamic route', () => {
  it.each(ROUTES)('%s (%s)', (path) => {
    const sanitized = sanitizePath(path);
    expect(leaks(sanitized, path), `"${sanitized}" still carries data from "${path}"`).toEqual([]);
  });

  it('leaves a fully static path alone', () => {
    expect(sanitizePath('/settings/advanced')).toBe('/settings/advanced');
    expect(sanitizePath('/index')).toBe('/index');
  });

  // The backstop is what makes an unlisted dynamic route safe by default.
  it('truncates an unlisted route carrying an address', () => {
    expect(sanitizePath(`/some/new/route/${BECH32}`)).toBe('/some/new/route');
  });
});
