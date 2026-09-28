/**
 * Signing the reveal of a Taproot-encoded compose with the source key.
 *
 * Core 11.5 returns an unsigned reveal the wallet signs with the source key: the reveal spends the
 * commit's output 0 through the envelope leaf, a BIP341 script-path spend (leaf version 0xc0) whose
 * `OP_CHECKSIG` key is the source's own. The witness is `<signature> <envelope> <control block>`.
 *
 * Nothing here trusts the composer. Before any key is used the reveal is held to Core's
 * source-signature rule (`revealSourceRule.ts`) against the commit output it spends, the envelope must
 * be the only leaf of that output, and its key must be one this wallet holds the private key for:
 *
 * - the x-only form of the address key (P2WPKH, or a P2TR internal key), signed with that key;
 * - for a P2TR address, its BIP86 output key, signed with the tweaked private key (Core falls back
 *   to it when the compose named no key).
 *
 * The message the envelope carries was decoded and held to the request at compose time
 * (`composer-context.tsx`, `inscriptionEnvelope.ts`); this module only proves the signature goes
 * where that message says.
 */

import { schnorr } from '@noble/curves/secp256k1.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { SigHash, TAPROOT_UNSPENDABLE_KEY } from '@scure/btc-signer';
import { compareBytes, pubSchnorr, signSchnorr, taprootTweakPrivKey } from '@scure/btc-signer/utils.js';
import { parseTransactionForSigning } from '@/core/bitcoin/rawTransaction';
import {
  bip86OutputKey,
  checkRevealSourceSignature,
  sourceControlsKey,
  sourceOutputScript,
  TAPSCRIPT_LEAF_VERSION,
} from '@/core/counterparty/revealSourceRule';
import { SigningError } from '@/core/errors';

/** What signing a reveal needs, all of it checked before use. */
export interface TaprootRevealToSign {
  /** The unsigned reveal (`reveal_rawtransaction`). */
  revealHex: string;
  /** The envelope leaf the reveal spends through (`envelope_script`). */
  envelopeScriptHex: string;
  /** `reveal_control_block`. */
  controlBlockHex: string;
}

/** The commit output the reveal spends, read from the commit the wallet signed. */
export interface RevealPrevout {
  scriptHex: string;
  /** Satoshis. */
  value: bigint;
}

function refuse(message: string): never {
  const text = `The reveal was not signed: ${message}.`;
  throw new SigningError(text, { userMessage: text });
}

function readHex(hex: string, what: string): Uint8Array {
  try {
    const bytes = hexToBytes(hex.replace(/^0x/, ''));
    if (bytes.length === 0) refuse(`the ${what} is empty`);
    return bytes;
  } catch (error) {
    if (error instanceof SigningError) throw error;
    return refuse(`the ${what} is not hex`);
  }
}

function equal(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && compareBytes(a, b) === 0;
}

function isP2wpkhScript(script: Uint8Array): boolean {
  return script.length === 22 && script[0] === 0x00 && script[1] === 0x14;
}

function isP2trScript(script: Uint8Array): boolean {
  return script.length === 34 && script[0] === 0x51 && script[1] === 0x20;
}

/**
 * The private key that signs for `leafKey`, or null when this key cannot: the key itself when the
 * leaf holds its x-only public key, the BIP86-tweaked key when a P2TR source's output key does.
 */
export function revealSigningKey(
  leafKey: Uint8Array,
  privateKey: Uint8Array,
  sourceIsP2tr: boolean,
): Uint8Array | null {
  const xOnly = pubSchnorr(privateKey);
  if (equal(xOnly, leafKey)) return privateKey;
  if (sourceIsP2tr) {
    const outputKey = bip86OutputKey(xOnly);
    if (outputKey && equal(outputKey, leafKey)) return taprootTweakPrivKey(privateKey);
  }
  return null;
}

/** How a reveal a site built may differ from the one Core composes. */
export interface RevealSigningOptions {
  /** The sighash to sign with: `SIGHASH_DEFAULT` (Core's) or `SIGHASH_ALL`. */
  sighash?: typeof SigHash.DEFAULT | typeof SigHash.ALL;
  /**
   * Admit a commit output whose internal key is the unspendable point or a key of the source
   * address, as a site's own envelope builder may choose, besides the envelope's key that Core uses.
   * Either way the envelope must be the output's only leaf.
   */
  siteInternalKey?: boolean;
}

/**
 * Sign the reveal's input 0 with the source key and return the signed reveal.
 *
 * @param reveal - the reveal, envelope and control block as composed
 * @param prevout - the commit output the reveal spends, from the commit this wallet signed
 * @param sourceAddress - the address the message is published from; Core composes Taproot
 *   encoding only for a P2WPKH or P2TR source, whatever derivation the wallet uses for it
 * @param privateKeyHex - the source address's private key
 */
export function signTaprootReveal(
  reveal: TaprootRevealToSign,
  prevout: RevealPrevout,
  sourceAddress: string,
  privateKeyHex: string,
  options: RevealSigningOptions = {},
): string {
  let tx: ReturnType<typeof parseTransactionForSigning>;
  try {
    tx = parseTransactionForSigning(reveal.revealHex);
  } catch {
    return refuse('the reveal transaction could not be read');
  }
  if (tx.inputsLength !== 1) refuse('the reveal must spend exactly one output');
  const input = tx.getInput(0);
  if (input.finalScriptWitness?.length || input.finalScriptSig?.length) refuse('the reveal is already signed');

  const envelope = readHex(reveal.envelopeScriptHex, 'envelope');
  const controlBlock = readHex(reveal.controlBlockHex, 'control block');
  const commitScript = readHex(prevout.scriptHex, 'commit output script');
  if (typeof prevout.value !== 'bigint' || prevout.value <= 0n) refuse('the commit output value is invalid');
  const sourceScript = sourceOutputScript(sourceAddress);
  if (!sourceScript) refuse('the source address could not be read');
  if (!isP2wpkhScript(sourceScript) && !isP2trScript(sourceScript)) {
    refuse('only a Native SegWit or Taproot address signs a Taproot reveal');
  }

  // Core's source-signature rule, with a placeholder where the signature goes: the leaf is a canonical
  // envelope committed to the commit output under tapscript, and its key is the source's.
  const rule = checkRevealSourceSignature(commitScript, sourceScript, [new Uint8Array(64), envelope, controlBlock]);
  if (!rule.ok) refuse(rule.detail);
  // The envelope is the commit output's only leaf, committed under its own key as Core builds it, or
  // (for a site's own builder) under the unspendable point or a key of the source: no one else can
  // spend the output, by script or by key.
  const internalKey = controlBlock.slice(1);
  const internalKeyAllowed = equal(internalKey, rule.leafKey) || (options.siteInternalKey === true
    && (equal(internalKey, TAPROOT_UNSPENDABLE_KEY) || sourceControlsKey(sourceScript, internalKey)));
  if (controlBlock.length !== 33 || !internalKeyAllowed) {
    refuse('the commit output does not commit to the envelope alone');
  }
  const sighashType = options.sighash ?? SigHash.DEFAULT;
  if (sighashType !== SigHash.DEFAULT && sighashType !== SigHash.ALL) refuse('the reveal sighash is not DEFAULT or ALL');

  const privateKey = readHex(privateKeyHex, 'private key');
  const signingKey = revealSigningKey(rule.leafKey, privateKey, isP2trScript(sourceScript));
  if (!signingKey) refuse('the envelope is not closed by this address\'s key');

  const sighash = tx.preimageWitnessV1(
    0,
    [commitScript],
    sighashType,
    [prevout.value],
    undefined,
    envelope,
    TAPSCRIPT_LEAF_VERSION,
  );
  const signature = signSchnorr(sighash, signingKey);
  if (!schnorr.verify(signature, sighash, rule.leafKey)) refuse('the signature does not verify');
  const witnessSignature = sighashType === SigHash.DEFAULT ? signature : new Uint8Array([...signature, sighashType]);

  tx.updateInput(0, { finalScriptWitness: [witnessSignature, envelope, controlBlock] }, true);
  const signedHex = tx.hex;
  // The txid is what the commit's reviewers saw the reveal as; signing changes only the witness.
  if (bytesToHex(parseTransactionForSigning(signedHex).getInput(0).txid ?? new Uint8Array()) !== bytesToHex(input.txid ?? new Uint8Array())) {
    refuse('signing changed the reveal');
  }
  return signedHex;
}
