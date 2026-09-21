/**
 * The public key for a hardware wallet address, derived from its account key.
 *
 * A hardware wallet stores no private material, and Trezor account discovery stores no per-address
 * public key either: `HardwareWalletSecret.publicKey` is documented as "public key OR descriptor
 * for the account" and discovery fills it with the account xpub. That is an account identifier,
 * not an address key, and sending it where a key belongs produced "Invalid multisig pubkey:
 * zpub6..." from core on every compose whose payload outgrew an OP_RETURN.
 *
 * Refusing to send it is the safety half. This is the other half: the account key and the
 * derivation path are both already stored, the remaining steps are public, and an extended PUBLIC
 * key can derive non-hardened children on its own — which is precisely what the address chain
 * below an account is. So the key can simply be computed, with no device round-trip and no secret.
 *
 * Getting it wrong is worse than not doing it, because a wrong key still composes. It is embedded
 * as the third slot of every multisig data output specifically so the dust can be swept later; a
 * key for the wrong address makes that dust unspendable by anyone. Hence the relative-path
 * arithmetic below is derived from the account key's own declared depth rather than from an
 * assumption about how deep an account sits, and the tests pin it against keys derived
 * independently from a master seed.
 */

import { bytesToHex } from '@noble/hashes/utils.js';
import { HDKey } from '@scure/bip32';

/**
 * SLIP-132 version bytes. The prefix a key is serialized with says which script type it was meant
 * for, not which curve or derivation it uses — the key material and the child derivation are
 * identical across all of them. @scure/bip32 validates the version it is handed, so the prefix
 * has to be declared rather than assumed.
 */
const VERSIONS: Record<string, { private: number; public: number }> = {
  xpub: { private: 0x0488ade4, public: 0x0488b21e },
  ypub: { private: 0x049d7878, public: 0x049d7cb2 },
  zpub: { private: 0x04b2430c, public: 0x04b24746 },
  tpub: { private: 0x04358394, public: 0x043587cf },
  upub: { private: 0x044a4e28, public: 0x044a5262 },
  vpub: { private: 0x045f18bc, public: 0x045f1cf6 },
};

/** Path components after the leading `m`, as numbers, with hardened indices offset. */
function pathIndices(path: string): number[] | null {
  const parts = path.replace(/^m\//i, '').split('/').filter(Boolean);
  const indices: number[] = [];
  for (const part of parts) {
    const hardened = part.endsWith("'") || part.endsWith('h') || part.endsWith('H');
    const n = Number.parseInt(hardened ? part.slice(0, -1) : part, 10);
    if (!Number.isInteger(n) || n < 0) return null;
    indices.push(hardened ? n + 0x80000000 : n);
  }
  return indices;
}

/**
 * The compressed public key at `fullPath`, derived from an account-level extended key.
 *
 * `fullPath` is the absolute path to the address (`m/84'/0'/0'/0/0`); `accountKey` is the extended
 * key for some prefix of it. Which prefix is read from the key itself — an extended key carries
 * its own depth — so the remaining steps are simply the tail of the path beyond that depth. An
 * account at depth 3 leaves `0/0`, and both are non-hardened, which is what makes public-only
 * derivation possible at all.
 *
 * Null rather than a throw for anything that does not line up: a key whose prefix is unknown, a
 * path that does not parse, a path shorter than the key's own depth, or a hardened step below the
 * account (which a public key genuinely cannot derive). Every caller already treats a missing key
 * as "let core find it", and that is a better outcome than an exception during wallet unlock.
 */
export function derivePubkeyFromAccountKey(accountKey: string, fullPath: string): string | null {
  const versions = VERSIONS[accountKey.slice(0, 4).toLowerCase()];
  if (!versions) return null;

  const indices = pathIndices(fullPath);
  if (!indices) return null;

  try {
    const account = HDKey.fromExtendedKey(accountKey, versions);
    // The tail beyond the account's own depth. A key at depth 3 has already consumed the first
    // three components, whatever they were.
    const remaining = indices.slice(account.depth);
    if (remaining.length !== indices.length - account.depth) return null;

    let node = account;
    for (const index of remaining) {
      // A public key cannot derive a hardened child. Below an account there should never be one,
      // and if there is, this is the wrong account key for this path.
      if (index >= 0x80000000) return null;
      node = node.deriveChild(index);
    }
    return node.publicKey ? bytesToHex(node.publicKey) : null;
  } catch {
    // Malformed base58, a checksum failure, or a version mismatch.
    return null;
  }
}
