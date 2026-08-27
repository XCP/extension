/**
 * The source address's public key, for compose calls that must name one.
 *
 * Any Counterparty message over 80 bytes is encoded as bare multisig, and each data output embeds
 * the SOURCE's public key as its third slot so the dust is recoverable later (core's
 * `prepare_multisig_output`). Core finds that key by scanning the address's spends — which works
 * only once the address HAS spent, because that is the first time a pubkey appears on chain. A
 * freshly funded wallet has never spent, so every long-data compose from one failed with "Pubkey
 * not found for …, please provide it with the `multisig_pubkey` parameter" — reproduced verbatim
 * against a live node from a never-spent address, and cured by the parameter.
 *
 * The wallet does not need to search: it derives the key alongside every address
 * (`Address.pubKey`). This module is how the compose layer reaches it without importing wallet
 * state — the same provider inversion `core/settings.ts` uses, and for the same layering reason:
 * core must stay runtime-free, and which wallets exist is runtime state.
 *
 * `multisig_pubkey` is the right parameter, not `pubkeys`: core validates `pubkeys` entries by
 * deriving a P2PKH address and comparing it to the source, so for a segwit or taproot source that
 * route can never match. `multisig_pubkey` is taken as-is (validated only as a curve point).
 * The stored key is the untweaked compressed key even for taproot addresses — which is exactly the
 * key ECDSA CHECKMULTISIG recovery later needs, and the thing a signature-based extraction cannot
 * recover from a taproot witness.
 */

type SourcePubkeyProvider = (address: string) => string | null;

let provider: SourcePubkeyProvider | null = null;

/** Registered by the wallet context; addresses and their keys are runtime state. */
export function setSourcePubkeyProvider(nextProvider: SourcePubkeyProvider | null): void {
  provider = nextProvider;
}

/**
 * A single EC point in hex: 33 bytes compressed (02/03) or 65 uncompressed (04).
 *
 * Checked because the field this reads is not guaranteed to hold one. A hardware wallet stores
 * "public key OR descriptor for the account" in `HardwareWalletSecret.publicKey`, and Trezor
 * account discovery fills it with the account xpub (`trezorAdapter`: "Use xpub as the
 * account-level public key"), which `addressDeriver` then copies into `Address.pubKey`. That key
 * reached compose as `multisig_pubkey` and core answered "Invalid multisig pubkey: zpub6...",
 * failing every long-data compose from a Trezor — an MPMA to more than a handful of recipients,
 * for instance, where the payload cannot fit in an OP_RETURN. Ordinary sends were unaffected,
 * which is why it stayed hidden.
 *
 * An extended key is not merely the wrong format here, it is the wrong KEY: it identifies an
 * account, not an address. Deriving the child would be the real fix; refusing to send an account
 * key is the part that must be true either way.
 */
const COMPRESSED = /^0[23][0-9a-fA-F]{64}$/;
const UNCOMPRESSED = /^04[0-9a-fA-F]{128}$/;

/**
 * The compressed public key for an address this wallet holds, or null.
 *
 * Null degrades to today's behaviour — the parameter is omitted and core falls back to its own
 * history scan, which still succeeds for any address that has spent. Test-only wallets store an
 * empty string for the key; empty is not a key, so it is null here rather than an empty parameter
 * core would reject. Anything else that is not a point on the curve is treated the same way: a
 * fallback that might work beats a parameter that certainly will not.
 */
export function getSourcePubkey(address: string): string | null {
  if (!provider || !address) return null;
  const pubkey = provider(address);
  if (!pubkey) return null;
  return COMPRESSED.test(pubkey) || UNCOMPRESSED.test(pubkey) ? pubkey : null;
}
