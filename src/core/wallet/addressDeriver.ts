/**
 * Pure address and wallet-id derivation — derives only from arguments, no
 * wallet state.
 */

import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils.js';
import { HDKey } from '@scure/bip32';
import {
  type AddressFormat,
  encodeAddress,
  getDerivationPathForAddressFormat,
  getSeedFromMnemonic,
  isCounterwalletFormat,
  isFreewalletBIP39Format,
} from '@/core/bitcoin/address';
import { getAddressFromPrivateKey, getPublicKeyFromPrivateKey } from '@/core/bitcoin/privateKey';
import { derivePubkeyFromAccountKey, pubkeyDeriverFromAccountKey } from '@/core/wallet/hardwarePubkey';
import { parseUtxoAddressPath } from '@/core/wallet/rarePepeWallet';
import type { Address, HardwareWalletSecret, WalletRecord } from '@/types/wallet';

export function getPairedAddressFormats(addressFormat: AddressFormat): {
  legacy: AddressFormat;
  segwit: AddressFormat;
} | null {
  switch (addressFormat) {
    case 'counterwallet':
    case 'counterwallet-segwit':
      return { legacy: 'counterwallet', segwit: 'counterwallet-segwit' };
    case 'freewallet-bip39':
    case 'freewallet-bip39-segwit':
      return { legacy: 'freewallet-bip39', segwit: 'freewallet-bip39-segwit' };
    case 'p2pkh':
    case 'p2wpkh':
      return { legacy: 'p2pkh', segwit: 'p2wpkh' };
    default:
      return null;
  }
}

export async function generateWalletId(mnemonic: string, addressFormat: AddressFormat): Promise<string> {
  const seed = getSeedFromMnemonic(mnemonic, addressFormat);
  const derivationPath = getDerivationPathForAddressFormat(addressFormat);
  const pathParts = derivationPath.split('/').slice(0, -1).join('/');
  const root = HDKey.fromMasterSeed(seed);
  const accountNode = root.derive(pathParts);
  if (!accountNode.publicKey) {
    throw new Error('Unable to derive public key for ID creation.');
  }
  const xpub = accountNode.publicExtendedKey;
  const xpubHash = sha256(utf8ToBytes(xpub));
  const typeHash = sha256(utf8ToBytes(addressFormat));
  const combined = new Uint8Array([...xpubHash, ...typeHash]);
  const finalHash = sha256(combined);
  return bytesToHex(finalHash);
}

export async function generateWalletIdFromPrivateKey(privateKeyHex: string, addressFormat: AddressFormat): Promise<string> {
  const pubkeyCompressed = getPublicKeyFromPrivateKey(privateKeyHex, true);
  const combined = utf8ToBytes(pubkeyCompressed + addressFormat);
  const hash = sha256(combined);
  return bytesToHex(hash);
}

/**
 * Somewhere to keep HD nodes a caller will want again, keyed by what they are.
 *
 * The session passes one that holds the unlocked wallet's nodes until its secret is cleared, so a
 * signing flow stops re-running the seed for every key it asks for. Without one, nothing is kept.
 */
export type HdNodeCache = (key: string, derive: () => HDKey) => HDKey;

const noCache: HdNodeCache = (_key, derive) => derive();

/**
 * Which seed a format reads from a mnemonic. The BIP-44/49/84/86 formats all use the same BIP-39
 * seed, and each Counterwallet and Freewallet pair shares one, so a key names the seed rather than
 * the format: a paired Legacy/SegWit lookup then pays for one seed, not two.
 */
function seedFamily(addressFormat: AddressFormat): string {
  if (isCounterwalletFormat(addressFormat)) return 'counterwallet';
  if (isFreewalletBIP39Format(addressFormat)) return 'freewallet-bip39';
  return 'bip39';
}

/** The master key for a mnemonic under a format. The expensive step; derive it once per batch. */
function hdRootFor(mnemonic: string, addressFormat: AddressFormat, cache: HdNodeCache = noCache): HDKey {
  return cache(`seed:${seedFamily(addressFormat)}`, () =>
    HDKey.fromMasterSeed(getSeedFromMnemonic(mnemonic, addressFormat)));
}

/**
 * The node at `path` for a mnemonic, equal to `HDKey.fromMasterSeed(seed).derive(path)`.
 *
 * `derive` is a sequence of `deriveChild` steps, so reaching the parent once and taking the last
 * step from there is the same arithmetic. What it saves is the seed and the hardened steps above
 * the parent, which every key under one account shares.
 */
function mnemonicNodeAt(
  mnemonic: string,
  addressFormat: AddressFormat,
  path: string,
  cache: HdNodeCache = noCache,
): HDKey {
  const root = hdRootFor(mnemonic, addressFormat, cache);
  const cut = path.lastIndexOf('/');
  if (cut <= 0) return root.derive(path);
  const parentPath = path.slice(0, cut);
  const parent = /^[mM]'?$/.test(parentPath)
    ? root
    : cache(`node:${seedFamily(addressFormat)}:${parentPath}`, () => root.derive(parentPath));
  return parent.derive(`m/${path.slice(cut + 1)}`);
}

/** The private key at `path`, exactly as `getPrivateKeyFromMnemonic` returns it. */
export function mnemonicPrivateKeyAt(
  mnemonic: string,
  addressFormat: AddressFormat,
  path: string,
  cache: HdNodeCache = noCache,
): string {
  const child = mnemonicNodeAt(mnemonic, addressFormat, path, cache);
  if (!child.privateKey) {
    throw new Error('Unable to derive private key');
  }
  return bytesToHex(child.privateKey);
}

/**
 * One address from the node of its chain (`m/…/0`), taking only the last step.
 *
 * Split out so the single and batch entry points below share one definition of what an address at
 * an index *is*. Deriving from the chain node rather than the master key is the same arithmetic —
 * `derive(path)` is a run of `deriveChild` steps — minus the hardened steps every index shares;
 * `addressDeriver.equivalence.test.ts` holds it to byte equality against the original routine.
 */
function addressAtIndex(
  chain: HDKey,
  addressFormat: AddressFormat,
  index: number
): Address {
  const path = `${getDerivationPathForAddressFormat(addressFormat)}/${index}`;
  const child = chain.derive(`m/${index}`);
  if (!child.publicKey) {
    throw new Error('Unable to derive public key');
  }
  return {
    name: `Address ${index + 1}`,
    path,
    address: encodeAddress(child.publicKey, addressFormat),
    pubKey: bytesToHex(child.publicKey),
  };
}

/** The node every sequential address of a format hangs from. */
function chainNode(root: HDKey, addressFormat: AddressFormat, cache: HdNodeCache): HDKey {
  const chainPath = getDerivationPathForAddressFormat(addressFormat);
  return cache(`node:${seedFamily(addressFormat)}:${chainPath}`, () => root.derive(chainPath));
}

export function deriveMnemonicAddress(
  mnemonic: string,
  addressFormat: AddressFormat,
  index: number,
  cache: HdNodeCache = noCache,
): Address {
  const root = hdRootFor(mnemonic, addressFormat, cache);
  return addressAtIndex(chainNode(root, addressFormat, cache), addressFormat, index);
}

/**
 * Every address of a mnemonic wallet, deriving the seed once for the batch.
 *
 * The seed is the expensive part and it does not depend on the index: for BIP-39 it is
 * PBKDF2-HMAC-SHA512 over 2048 rounds. Calling `deriveMnemonicAddress` in a loop paid for it
 * twice per address — once inside `getAddressFromMnemonic` and once again for the public key — so
 * a 20-address wallet ran 40 of them, about 460ms on a dev machine, synchronously on the thread
 * that draws the UI. Selecting such a wallet froze the popup, and because the state lock queues,
 * every impatient click during the freeze added another full pass.
 *
 * Hoisting the seed and the master key out of the loop takes the same wallet to about 43ms, and
 * hoisting the chain node (`m/…/0`) as well leaves one child step per address. The per-index
 * arithmetic is untouched, so the addresses are the ones this wallet has always had —
 * `addressDeriver.equivalence.test.ts` holds that to byte equality against the original routine.
 */
export function deriveMnemonicAddresses(
  mnemonic: string,
  addressFormat: AddressFormat,
  count: number,
  cache: HdNodeCache = noCache,
): Address[] {
  if (count <= 0) return [];
  return sequentialAddresses(hdRootFor(mnemonic, addressFormat, cache), addressFormat, count, cache);
}

/** The wallet's ordinary run of addresses, indexes 0 through count - 1. */
function sequentialAddresses(
  root: HDKey,
  addressFormat: AddressFormat,
  count: number,
  cache: HdNodeCache,
): Address[] {
  const chain = chainNode(root, addressFormat, cache);
  return Array.from({ length: count }, (_, index) => addressAtIndex(chain, addressFormat, index));
}

export function deriveAddressFromPrivateKey(privKeyData: string, addressFormat: AddressFormat): Address {
  const parsed = JSON.parse(privKeyData);
  const address = getAddressFromPrivateKey(parsed.hex, addressFormat, parsed.compressed);
  const pubKey = getPublicKeyFromPrivateKey(parsed.hex, parsed.compressed);
  return {
    name: 'Address 1',
    path: '',
    address,
    pubKey,
  };
}

/**
 * The extra addresses a record asks for, on top of its sequential run.
 *
 * Only paths this wallet knows how to name are honoured: a stored string that no longer parses is
 * dropped rather than derived, since it comes off disk and reaches `HDKey.derive`.
 */
function deriveExtraAddresses(
  root: HDKey,
  addressFormat: AddressFormat,
  extraPaths: string[]
): Address[] {
  const addresses: Address[] = [];
  for (const path of extraPaths) {
    const pairedIndex = parseUtxoAddressPath(path);
    if (pairedIndex === null) continue;
    const child = root.derive(path);
    if (!child.publicKey) continue;
    addresses.push({
      // Numbered after the address it is paired with, not its own position in this list.
      name: `UTXO Address ${pairedIndex + 1}`,
      path,
      address: encodeAddress(child.publicKey, addressFormat),
      pubKey: bytesToHex(child.publicKey),
    });
  }
  return addresses;
}

/**
 * The address's own public key for a hardware wallet, not the account's.
 *
 * `HardwareWalletSecret.publicKey` is documented as "public key OR descriptor for the account",
 * and Trezor discovery fills it with the account xpub. Stored verbatim, that reached compose as
 * `multisig_pubkey` and core rejected it — "Invalid multisig pubkey: zpub6..." — failing every
 * message too long for an OP_RETURN.
 *
 * So the stored value is used only when it really is a key, and otherwise the address's key is
 * derived from the account key and the path, both of which are already here. An extended public
 * key derives non-hardened children unaided, and the chain below an account is non-hardened, so
 * this needs no device and no secret.
 *
 * Empty string when neither works. That is what this field held for every non-discovery hardware
 * wallet before, and `getSourcePubkey` already reads empty as "no key" and lets core fall back to
 * scanning the address's spend history.
 */
function hardwarePubKey(hardwareData: HardwareWalletSecret): string {
  const stored = hardwareData.publicKey;
  if (stored && /^0[23][0-9a-fA-F]{64}$/.test(stored)) return stored;
  const accountKey = hardwareData.xpub ?? stored;
  if (!accountKey || !hardwareData.derivationPath) return '';
  return derivePubkeyFromAccountKey(accountKey, hardwareData.derivationPath) ?? '';
}

/**
 * A hardware wallet's receive addresses (…/0/index), derived from the stored account xpub.
 *
 * Returns a lookup rather than one address so a batch parses the secret and the account key, and
 * checks index 0 against the device, once — not once per index. The lookup gives null when an
 * address cannot be derived; the whole thing is null when the xpub does not reproduce the address
 * the device reported for index 0: an account key that disagrees with the device must never name
 * an address whose funds the device would then be asked to sign for.
 */
function hardwareReceiveAddresses(secret: string, record: WalletRecord): ((index: number) => Address | null) | null {
  if (record.type !== 'hardware') return null;
  let hardwareData: HardwareWalletSecret;
  try {
    hardwareData = JSON.parse(secret);
  } catch {
    return null;
  }
  const accountKey = hardwareData.xpub;
  const firstPath = hardwareData.derivationPath;
  if (!accountKey || !firstPath?.endsWith('/0/0')) return null;
  const chainPath = firstPath.slice(0, -'/0'.length);
  const receivePath = (i: number) => `${chainPath}/${i}`;
  const pubkeyAt = pubkeyDeriverFromAccountKey(accountKey, chainPath);

  const at = (i: number): Address | null => {
    const pubKey = pubkeyAt(i);
    if (!pubKey) return null;
    return {
      name: `Address ${i + 1}`,
      path: receivePath(i),
      address: encodeAddress(hexToBytes(pubKey), record.addressFormat),
      pubKey,
    };
  };

  const first = at(0);
  if (!first || first.address !== record.previewAddress) return null;
  return (index) => (index === 0 ? first : at(index));
}

/**
 * A hardware wallet's receive address at `index` (…/0/index), derived from the stored account
 * xpub. Null when it cannot be derived, or when the xpub does not reproduce the address the device
 * reported for index 0 (see `hardwareReceiveAddresses`).
 */
export function deriveHardwareAddress(secret: string, record: WalletRecord, index: number): Address | null {
  if (record.type !== 'hardware' || !Number.isSafeInteger(index) || index < 0) return null;
  return hardwareReceiveAddresses(secret, record)?.(index) ?? null;
}

/** Derives addresses from a decrypted secret based on wallet type */
export function deriveAddressesFromSecret(
  secret: string,
  record: WalletRecord,
  cache: HdNodeCache = noCache,
): Address[] {
  if (record.type === 'mnemonic') {
    // One master key for both runs. Deriving it again for the extras would pay the seed cost
    // twice on every unlock — the exact expense `deriveMnemonicAddresses` exists to avoid.
    const root = hdRootFor(secret, record.addressFormat, cache);
    const addresses = sequentialAddresses(root, record.addressFormat, record.addressCount || 1, cache);
    if (!record.extraPaths?.length) return addresses;
    return [...addresses, ...deriveExtraAddresses(root, record.addressFormat, record.extraPaths)];
  }

  if (record.type === 'hardware') {
    // Hardware wallet secret contains metadata, not private keys. Address 1 is the one the device
    // itself reported at connect, kept in the record's previewAddress; later receive addresses are
    // derived from the account xpub.
    try {
      const hardwareData: HardwareWalletSecret = JSON.parse(secret);
      const first: Address = {
        name: 'Address 1',
        path: hardwareData.derivationPath,
        address: record.previewAddress,
        pubKey: hardwarePubKey(hardwareData),
      };
      const rest: Address[] = [];
      const receiveAddress = (record.addressCount || 1) > 1 ? hardwareReceiveAddresses(secret, record) : null;
      for (let index = 1; index < (record.addressCount || 1); index++) {
        const address = receiveAddress?.(index) ?? null;
        if (!address) break;
        rest.push(address);
      }
      return [first, ...rest];
    } catch {
      return [];
    }
  }

  if (record.isTestOnly) {
    try {
      const testData = JSON.parse(secret);
      if (testData.isTestWallet && testData.address) {
        return [{ name: "Test Address", path: "m/test", address: testData.address, pubKey: '' }];
      }
    } catch {
      return [];
    }
  }

  return [deriveAddressFromPrivateKey(secret, record.addressFormat)];
}
