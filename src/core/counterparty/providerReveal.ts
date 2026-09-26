/**
 * The provider path's proof of a Counterparty Taproot commit whose reveal a site holds.
 *
 * Counterparty's Taproot data encoding is two transactions. The commit pays a small output to a
 * P2TR address; the reveal spends that output by a script path whose tapleaf is an envelope
 * carrying the message, signed with a throwaway key held by whoever built it. Counterparty
 * credits the message to the address that funded the *commit*, not to the reveal's signer
 * (`bitcoin_client.rs`, `resolve_commit_parent`: the source is the output spent by the commit's
 * first input). So a site can ask this wallet to sign what reads as a few hundred sats to a
 * Taproot address, then broadcast its own reveal that sends, destroys or issues this wallet's
 * assets. Nothing in the commit's bytes shows it.
 *
 * When the site supplies the reveal, the commit stops being opaque. What the reveal publishes is
 * fixed by the commit, not by the reveal: a P2TR output key commits to its script tree, so when
 * the output key is the internal key tweaked by exactly one leaf, that leaf is the only script
 * any reveal can ever publish from it. The throwaway key can re-sign a different reveal
 * transaction, but not a different leaf. Everything below follows from that:
 *
 * - the reveal's first input must spend an output of this transaction — the one core reads the
 *   envelope from is the first input's witness, so that is the only one that can carry a message;
 * - its witness must be the three-element script-path spend core reads, whose control block
 *   carries no merkle path, and the leaf plus internal key must tweak to exactly the spent
 *   output's key — proof that no other leaf exists;
 * - the leaf must be an envelope core reads, decoding to a Counterparty message the wallet can
 *   describe, and the reveal must carry the CNTRPRTY marker core requires;
 * - the message type must not take any of its meaning from the reveal's outputs, because those
 *   are the one part the site can still change after the user signs (an issuance with a
 *   destination output is an ownership transfer; an attach lands on whichever output it names);
 * - the commit's first input must be this wallet's, since that is who the message is credited to.
 *
 * A key-path spend of the commit output publishes no envelope, so core attributes nothing it
 * carries to the commit's funder; the internal key is therefore not restricted. The worst it
 * allows is what the commit already concedes: the site keeps the commit output's value.
 */

import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { p2tr, type Transaction } from '@scure/btc-signer';
import { normalizeAddressForComparison } from '@/core/bitcoin/address';
import { parseTransactionForSigning } from '@/core/bitcoin/rawTransaction';
import { unpackCounterpartyMessage } from '@/core/counterparty/unpack';
import { COUNTERPARTY_PREFIX_HEX } from '@/core/counterparty/unpack/messageTypes';
import { extractEnvelopeMessage, parseInstructions } from '@/core/counterparty/unpack/ordEnvelope';
import { t } from '@/i18n';

/** The reveal's OP_RETURN: exactly one push of the bare CNTRPRTY marker (`parse_vout`). */
const REVEAL_MARKER_SCRIPT = `6a08${COUNTERPARTY_PREFIX_HEX}`;

/** Tapscript leaf version; any other would publish a script bitcoin does not execute. */
const TAPSCRIPT_LEAF_VERSION = 0xc0;

/** The largest reveal a site may pass: a standard transaction's 400,000 weight, all witness. */
export const MAX_REVEAL_HEX_LENGTH = 800_000;

/**
 * Message types whose whole meaning is in the message. Every other type reads the reveal's
 * outputs (a legacy send's recipient, an issuance's transfer destination, an attach's output,
 * a dispense or BTCpay's payment), which the site chooses after the commit is signed. Sweep is
 * listed so it reaches the ordinary sweep block, which names it.
 */
const REVEAL_SAFE_MESSAGE_TYPES = new Set([
  'enhanced_send',
  'mpma_send',
  'sweep',
  'order',
  'cancel',
  'dispenser',
  'dividend',
  'broadcast',
  'fairminter',
  'fairmint',
  'destroy',
  'pooldeposit',
  'poolwithdraw',
]);

/** Why a supplied reveal was refused; each has its own sentence on the approval screen. */
export type RevealRefusal =
  | 'unreadable'
  | 'not_this_transaction'
  | 'script_not_committed'
  | 'not_counterparty'
  | 'outputs_decide'
  | 'source_not_signer'
  /** The commit carries its own Counterparty message too; the screen could describe only one. */
  | 'two_messages';

export type RevealVerification =
  | {
      ok: true;
      /** The message the reveal publishes, CNTRPRTY prefix included. */
      messageHex: string;
      messageType: string;
      /** Which of core's two envelopes carries it. */
      envelope: 'ord' | 'data';
      /** The output of this transaction the reveal spends. */
      commitIndex: number;
      commitAddress: string;
      commitValue: number;
      /** The address Counterparty credits the message to: the commit's first input. */
      sourceAddress: string;
    }
  | {
      ok: false;
      reason: RevealRefusal;
      /** The decoded type, for `outputs_decide`. */
      messageType?: string;
      /** English diagnostics for logs and the raw fallback; the screen translates `reason`. */
      error: string;
    };

interface CommitInputLike {
  address?: string;
}

interface CommitOutputLike {
  index: number;
  value: number;
  address?: string;
  script?: string;
}

interface CommitLike {
  /** The commit's txid, computed from its unsigned bytes. Stable when every input is SegWit. */
  transactionId: string | undefined;
  inputs: CommitInputLike[];
  outputs: CommitOutputLike[];
}

const refuse = (
  reason: RevealRefusal,
  error: string,
  messageType?: string,
): RevealVerification => ({ ok: false, reason, error, ...(messageType ? { messageType } : {}) });

/**
 * Read the message a plain data envelope carries, exactly as core's generic branch does: every
 * push between OP_IF and the last three instructions, concatenated. Narrower than core, never
 * wider: the tail must be OP_ENDIF, a 32-byte key and OP_CHECKSIG, and nothing but pushes may sit
 * inside — core skips stray opcodes silently, and a script that relies on that is refused here.
 */
function readDataEnvelope(leaf: Uint8Array): string | null {
  const instructions = parseInstructions(leaf);
  if (!instructions || instructions.length < 6) return null;
  const [first, second] = instructions;
  const isOp = (index: number, op: number) => {
    const instruction = instructions[index];
    return instruction !== undefined && 'op' in instruction && instruction.op === op;
  };
  if (!first || !('push' in first) || first.push.length !== 0) return null;
  if (!second || !('op' in second) || second.op !== 0x63) return null;
  const last = instructions.length - 1;
  if (!isOp(last, 0xac) || !isOp(last - 2, 0x68)) return null;
  const key = instructions[last - 1];
  if (!key || !('push' in key) || key.push.length !== 32) return null;

  const chunks: Uint8Array[] = [];
  for (const instruction of instructions.slice(2, last - 2)) {
    if (!('push' in instruction)) return null;
    chunks.push(instruction.push);
  }
  const hex = chunks.map((chunk) => bytesToHex(chunk)).join('');
  return hex.length > 0 ? COUNTERPARTY_PREFIX_HEX + hex : null;
}

/** Core's own test for an ord envelope (`is_ord`): "ord" then the 0x07 metaprotocol tag. */
function isOrdEnvelope(leaf: Uint8Array): boolean {
  const instructions = parseInstructions(leaf);
  const tag = instructions?.[2];
  const metaprotocol = instructions?.[3];
  return !!instructions && instructions.length >= 7
    && !!tag && 'push' in tag && bytesToHex(tag.push) === '6f7264'
    && !!metaprotocol && 'push' in metaprotocol && bytesToHex(metaprotocol.push) === '07';
}

/**
 * Verify a site-supplied reveal against the commit transaction this wallet is asked to sign.
 *
 * @param revealHex - the reveal transaction, signed, as the site will broadcast it
 * @param commit - the commit, parsed from the PSBT
 * @param signerAddresses - the addresses this wallet signs the commit with
 */
export function verifyCounterpartyReveal(
  revealHex: string,
  commit: CommitLike,
  signerAddresses: string[],
): RevealVerification {
  let reveal: Transaction;
  try {
    reveal = parseTransactionForSigning(revealHex);
  } catch {
    return refuse('unreadable', 'The reveal transaction could not be read.');
  }

  const input = reveal.inputsLength > 0 ? reveal.getInput(0) : undefined;
  if (!input?.txid || input.index === undefined || !commit.transactionId
    || bytesToHex(input.txid) !== commit.transactionId.toLowerCase()) {
    return refuse(
      'not_this_transaction',
      'The reveal’s first input does not spend this transaction.',
    );
  }
  const output = commit.outputs.find((candidate) => candidate.index === input.index);
  if (!output?.script) {
    return refuse('not_this_transaction', `This transaction has no output ${input.index} to reveal.`);
  }

  // Core reads the envelope only from a first-input witness of exactly three elements: for a
  // Taproot script-path spend that is [argument, leaf, control block].
  const witness = input.finalScriptWitness;
  const leaf = witness?.length === 3 ? witness[1] : undefined;
  const control = witness?.length === 3 ? witness[2] : undefined;
  if (!leaf || !control) {
    return refuse('script_not_committed', 'The reveal is not a single-script Taproot spend.');
  }
  // 33 bytes: leaf version and internal key, no merkle path, so the tree is this one leaf.
  if (control.length !== 33 || (control[0]! & 0xfe) !== TAPSCRIPT_LEAF_VERSION) {
    return refuse(
      'script_not_committed',
      'The spent output commits to more than one script, so the site could reveal another.',
    );
  }
  let committedScript: string;
  try {
    const payment = p2tr(
      control.slice(1),
      { script: leaf, leafVersion: TAPSCRIPT_LEAF_VERSION },
      undefined,
      true,
    );
    committedScript = bytesToHex(payment.script);
  } catch {
    return refuse('script_not_committed', 'The reveal’s control block could not be read.');
  }
  if (committedScript !== output.script.toLowerCase()) {
    return refuse(
      'script_not_committed',
      `Output ${output.index} does not commit to the script the reveal publishes.`,
    );
  }

  const hasMarker = Array.from({ length: reveal.outputsLength }, (_, index) => reveal.getOutput(index))
    .some((candidate) => candidate.script && bytesToHex(candidate.script) === REVEAL_MARKER_SCRIPT);
  const ord = isOrdEnvelope(leaf);
  const messageHex = ord ? extractEnvelopeMessage(leaf)?.messageHex ?? null : readDataEnvelope(leaf);
  const unpacked = messageHex ? unpackCounterpartyMessage(messageHex) : undefined;
  if (!hasMarker || !messageHex || !unpacked?.success || !unpacked.messageType) {
    return refuse(
      'not_counterparty',
      hasMarker
        ? 'The reveal does not publish a Counterparty message this wallet can read.'
        : 'The reveal lacks the CNTRPRTY marker, so Counterparty would not read it.',
    );
  }
  if (!REVEAL_SAFE_MESSAGE_TYPES.has(unpacked.messageType)) {
    return refuse(
      'outputs_decide',
      `A ${unpacked.messageType} message takes part of its meaning from the reveal’s outputs, which the site can change after you sign.`,
      unpacked.messageType,
    );
  }

  const source = commit.inputs[0]?.address;
  const signers = new Set(signerAddresses.map(normalizeAddressForComparison));
  if (!source || !signers.has(normalizeAddressForComparison(source))) {
    return refuse(
      'source_not_signer',
      'Counterparty credits this message to the commit’s first input, which this wallet does not sign.',
    );
  }

  return {
    ok: true,
    messageHex,
    messageType: unpacked.messageType,
    envelope: ord ? 'ord' : 'data',
    commitIndex: output.index,
    commitAddress: output.address ?? '',
    commitValue: output.value,
    sourceAddress: source,
  };
}

/** The approval screen's sentence for a refusal, in the reader's language. */
export function revealRefusalText(reason: RevealRefusal, messageType?: string): string {
  switch (reason) {
    case 'unreadable': return t('safety_reveal_unreadable');
    case 'not_this_transaction': return t('safety_reveal_not_this_transaction');
    case 'script_not_committed': return t('safety_reveal_script_not_committed');
    case 'not_counterparty': return t('safety_reveal_not_counterparty');
    case 'outputs_decide': return t('safety_reveal_outputs_decide', messageType ?? '');
    case 'source_not_signer': return t('safety_reveal_source_not_signer');
    case 'two_messages': return t('safety_reveal_two_messages');
  }
}

/**
 * Output scripts whose spend can carry a witness core would read as an envelope: anything that
 * commits to a script (P2TR, P2WSH, P2SH, which may wrap P2WSH) and any other witness program,
 * which bitcoin does not validate at all. Only key-hash outputs cannot: a P2PKH spend has no
 * witness and a P2WPKH spend's witness is always a signature and a key.
 */
export function canCarryRevealWitness(scriptHex: string | undefined): boolean {
  if (!scriptHex) return false;
  let script: Uint8Array;
  try {
    script = hexToBytes(scriptHex);
  } catch {
    return false;
  }
  // P2SH: OP_HASH160 <20> OP_EQUAL.
  if (script.length === 23 && script[0] === 0xa9 && script[1] === 0x14 && script[22] === 0x87) return true;
  // Witness program: version opcode (OP_0, OP_1..OP_16) then a single 2-40 byte push.
  const version = script[0];
  const length = script[1];
  if (version === undefined || length === undefined) return false;
  const isVersion = version === 0x00 || (version >= 0x51 && version <= 0x60);
  if (!isVersion || length < 2 || length > 40 || script.length !== length + 2) return false;
  // P2WPKH is the one witness program whose spend cannot publish anything.
  return !(version === 0x00 && length === 20);
}
