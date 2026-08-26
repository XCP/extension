/**
 * Rare Pepe Wallet conventions that put funds outside the branch a Counterwallet seed shows.
 *
 * A Counterwallet wallet only ever displays `m/0'/0/{index}` — the branch is a function of the
 * address format (see `getDerivationPathForAddressFormat`), and only the trailing index varies.
 * Rare Pepe Wallet put two things outside it, both unreachable from this wallet as a result:
 *
 * - **Gift cards**, which fund the 500th legacy address of an otherwise unused seed, and nothing
 *   else.
 * - **UTXO-attached assets**, which it parks on the change address paired with whichever address
 *   you were using.
 *
 * Both conventions are fixed — neither needs the holder to know a script type or a BIP-32 path —
 * so both are found by deriving the one candidate and asking whether it has history.
 */

import {
  AddressFormat,
  getAddressFromMnemonic,
  isCounterwalletFormat,
  probeAddressActivity,
} from '@/core/bitcoin/address';

/** The default Counterwallet branch, where a normal wallet's addresses live. */
const RECEIVE_BRANCH = 0;

/** The change branch, where Rare Pepe Wallet attaches UTXO assets. */
const CHANGE_BRANCH = 1;

/** The one path shape a kept UTXO address may have. Anything else is not ours to derive. */
const UTXO_PATH_PATTERN = new RegExp(String.raw`^m/0'/${CHANGE_BRANCH}/(\d+)$`);

/**
 * Rare Pepe Wallet gift cards always carry their balance on the 500th legacy address of the seed.
 *
 * Addresses are numbered from one for display (`Address 1` is index 0, see `addressAtIndex`), so
 * the 500th is index 499.
 */
export const GIFT_CARD_ADDRESS_INDEX = 499;

/** The one path a gift card's funds can be on. */
export const GIFT_CARD_PATH = `m/0'/${RECEIVE_BRANCH}/${GIFT_CARD_ADDRESS_INDEX}`;

/** The change address paired with the address at `index`. */
export function utxoAddressPath(index: number): string {
  if (!Number.isInteger(index) || index < 0) {
    throw new Error(`Invalid address index: ${index}`);
  }
  return `m/0'/${CHANGE_BRANCH}/${index}`;
}

/**
 * The address index a UTXO path is paired with, or null if `path` is not one.
 *
 * Paths round-trip through the keychain, so this is also the validator that keeps a stored string
 * from reaching `HDKey.derive` unchecked.
 */
export function parseUtxoAddressPath(path: string): number | null {
  const match = UTXO_PATH_PATTERN.exec(path);
  if (!match) return null;
  const index = Number(match[1]);
  return Number.isSafeInteger(index) && index >= 0 ? index : null;
}

/** Whether `path` addresses the change branch of a Counterwallet seed. */
export function isUtxoAddressPath(path: string): boolean {
  return parseUtxoAddressPath(path) !== null;
}

/** What a lookup found, or why it could not say. */
export type DetectionResult<T> =
  | { status: 'found'; value: T }
  | { status: 'none' }
  | { status: 'unavailable' };

/**
 * Whether a Counterwallet seed is an unspent Rare Pepe Wallet gift card.
 *
 * A card is a fresh seed with exactly one funded address, so an empty `m/0'/0/0` alongside a
 * funded gift card address is an unambiguous signature. Checking the first address first also
 * keeps this from hijacking a real wallet that happens to have reached 500 addresses.
 */
export async function detectGiftCard(mnemonic: string): Promise<DetectionResult<string>> {
  const firstAddress = getAddressFromMnemonic(mnemonic, `m/0'/${RECEIVE_BRANCH}/0`, AddressFormat.Counterwallet);
  const first = await probeAddressActivity(firstAddress);
  if (!first.reachable) return { status: 'unavailable' };
  if (first.active) return { status: 'none' };

  const giftCardAddress = getAddressFromMnemonic(mnemonic, GIFT_CARD_PATH, AddressFormat.Counterwallet);
  const giftCard = await probeAddressActivity(giftCardAddress);
  if (!giftCard.reachable) return { status: 'unavailable' };
  return giftCard.active ? { status: 'found', value: giftCardAddress } : { status: 'none' };
}

/**
 * Whether the change address paired with `index` holds anything worth showing.
 *
 * Only Counterwallet formats have a paired UTXO address — the concept is Rare Pepe Wallet's, and
 * no other format's holders can have used it.
 */
export async function detectUtxoAddress(
  mnemonic: string,
  addressFormat: AddressFormat,
  index: number
): Promise<DetectionResult<string>> {
  if (!isCounterwalletFormat(addressFormat)) return { status: 'none' };

  const address = getAddressFromMnemonic(mnemonic, utxoAddressPath(index), addressFormat);
  const probe = await probeAddressActivity(address);
  if (!probe.reachable) return { status: 'unavailable' };
  return probe.active ? { status: 'found', value: address } : { status: 'none' };
}
