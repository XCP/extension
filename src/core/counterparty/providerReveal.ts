/**
 * The provider path's proof of a Counterparty Taproot commit whose reveal a site holds.
 *
 * Counterparty's Taproot data encoding is two transactions. The commit pays a small output to a
 * P2TR address; the reveal spends that output by a script path whose tapleaf is an envelope
 * carrying the message, signed with a key held by whoever built it, and publishes the message
 * from the address that funded the commit. Signing the commit is signing that message, though
 * nothing in the commit's own bytes shows it.
 *
 * When the site supplies the reveal, the commit stops being opaque. What the reveal publishes is
 * fixed by the commit, not by the reveal: a P2TR output key commits to its script tree, so when
 * the output key is the internal key tweaked by exactly one leaf, that leaf is the only script
 * any reveal can ever publish from it. The reveal's key can re-sign a different reveal
 * transaction, but not a different leaf. Everything below follows from that:
 *
 * - the reveal's first input must spend an output of this transaction, since core reads the
 *   envelope from that input's witness;
 * - its witness must be the three-element script-path spend core reads, whose control block
 *   carries no merkle path, and the leaf plus internal key must tweak to exactly the spent
 *   output's key — proof that no other leaf exists;
 * - the leaf must be an envelope core reads, decoding to a Counterparty message the wallet can
 *   describe, and the reveal must carry the CNTRPRTY marker core requires;
 * - the commit must be funded from this wallet, the address the message is
 *   published from.
 *
 * What the proof cannot fix is the reveal's *outputs*. Core signs its own reveals with a key it
 * discards, so those can never change; but a site that built its reveal with its own key can
 * re-sign it with different outputs, and the wallet cannot tell the two apart. Some message types
 * take part of their meaning from those outputs (core's parsers read `tx["destination"]`, the
 * first output ahead of the data, or the transaction's outputs and spent UTXOs). They are not
 * refused: they are decoded, and `revealSiteControl` names exactly what the site decides, per
 * type, so the review can say it.
 *
 * A key-path spend of the commit output publishes no envelope, so the internal key is not
 * restricted. The worst it allows is what the commit already concedes: the site keeps the commit
 * output's value.
 */

import { bytesToHex } from '@noble/hashes/utils.js';
import { p2tr, type Transaction } from '@scure/btc-signer';
import { decodeAddressFromScript, normalizeAddressForComparison } from '@/core/bitcoin/address';
import { parseTransactionForSigning } from '@/core/bitcoin/rawTransaction';
import type { SecurityWarning } from '@/core/counterparty/transactionSafety';
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
 * Message types whose whole meaning is in the message: none of their parsers reads the
 * transaction's outputs or spent UTXOs to decide what happens. (An order's `fee_provided` is the
 * reveal's miner fee, which a re-signed reveal can only raise with the site's own inputs, and a
 * destroy is invalidated, not redirected, by an output ahead of its data.) Sweep is listed so it
 * reaches the ordinary sweep block.
 */
const MESSAGE_ONLY_TYPES = new Set([
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

/**
 * What the site decides about a proved reveal's message, from core's parser for each type:
 *
 * - `message_only`: nothing but whether and when the reveal is broadcast.
 * - `send_recipient`: a legacy send (`send1.py`) pays `tx["destination"]`, the reveal's first
 *   output ahead of its data.
 * - `issuance_transfer`: an issuance with a `tx["destination"]` makes that address the issuer
 *   (`issuance.py`: `issuer = tx["destination"]; transfer = True`), an ownership transfer.
 * - `attach_output`: an attach (`attach.py`) lands on `<reveal txid>:<destination_vout>` or the
 *   reveal's first non-OP_RETURN output, whose script the reveal's builder writes.
 * - `dispense_payment`: a dispense (`dispense.py`) buys from whichever dispensers the reveal's
 *   outputs pay, with the BTC the reveal carries.
 * - `btcpay_payment`: a BTCpay settles only when the reveal pays the order match's counterparty
 *   (`btcpay.py`, `check_btcpay_destination`).
 * - `detach_inputs`: a detach (`detach.py`) releases the UTXOs the reveal spends, never the
 *   user's, whose UTXOs the reveal cannot spend without a signature this request does not give.
 * - `not_executed`: the legacy UTXO message (id 100) has not been parsed since
 *   `spend_utxo_to_detach` (block 871,900), before Taproot reveals existed (block 902,000).
 * - `outputs_unknown`: any other type; the wallet does not claim to know what the outputs decide.
 */
export type RevealSiteControl =
  | 'message_only'
  | 'send_recipient'
  | 'issuance_transfer'
  | 'attach_output'
  | 'dispense_payment'
  | 'btcpay_payment'
  | 'detach_inputs'
  | 'not_executed'
  | 'outputs_unknown';

const OUTPUT_DEPENDENT: Record<string, RevealSiteControl> = {
  send: 'send_recipient',
  issuance: 'issuance_transfer',
  attach: 'attach_output',
  dispense: 'dispense_payment',
  btcpay: 'btcpay_payment',
  detach: 'detach_inputs',
  utxo: 'not_executed',
  utxo_move: 'not_executed',
};

export function revealSiteControl(messageType: string): RevealSiteControl {
  if (MESSAGE_ONLY_TYPES.has(messageType)) return 'message_only';
  return OUTPUT_DEPENDENT[messageType] ?? 'outputs_unknown';
}

/**
 * Whether what the site controls can change what the user gives up (who receives an asset, who
 * owns one, who holds an attached UTXO, what BTC buys) or whether the action happens at all.
 * Those take the review step; the rest are stated as information.
 */
export function revealControlNeedsReview(control: RevealSiteControl): boolean {
  return control !== 'message_only' && control !== 'detach_inputs' && control !== 'not_executed';
}

/** One output of the reveal as supplied. */
export interface RevealOutput {
  index: number;
  value: number;
  /** Undefined for a script no decoder attributes to an address. */
  address?: string;
  opReturn: boolean;
}

/** Why a supplied reveal was refused; each has its own sentence on the approval screen. */
export type RevealRefusal =
  | 'unreadable'
  | 'not_this_transaction'
  | 'script_not_committed'
  | 'not_counterparty'
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
      /** The address the message is published from: the one funding the commit. */
      sourceAddress: string;
      /** The reveal's outputs as supplied: what it does now, whatever a re-signing could do. */
      outputs: RevealOutput[];
      /**
       * The reveal's outputs ahead of its data, as supplied: core's destinations. With exactly
       * one, it is `tx["destination"]`; with more than one, core skips the message altogether
       * (`blocks.py`, a multi-part destination). `null` for an output with no address.
       */
      destinations: (string | null)[];
    }
  | {
      ok: false;
      reason: RevealRefusal;
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

const refuse = (reason: RevealRefusal, error: string): RevealVerification => ({ ok: false, reason, error });

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

  const source = commit.inputs[0]?.address;
  const signers = new Set(signerAddresses.map(normalizeAddressForComparison));
  if (!source || !signers.has(normalizeAddressForComparison(source))) {
    return refuse(
      'source_not_signer',
      'The commit is not funded from an address this wallet signs for.',
    );
  }

  const outputs: RevealOutput[] = [];
  const destinations: (string | null)[] = [];
  let dataSeen = false;
  for (let index = 0; index < reveal.outputsLength; index += 1) {
    const candidate = reveal.getOutput(index);
    const script = candidate.script ? bytesToHex(candidate.script) : '';
    const opReturn = script.startsWith('6a');
    const address = opReturn || !script ? undefined : decodeAddressFromScript(script) ?? undefined;
    outputs.push({ index, value: Number(candidate.amount ?? 0n), address, opReturn });
    // Core's destinations are the outputs ahead of the data (`bitcoin_client.rs`, parse_vout).
    if (script === REVEAL_MARKER_SCRIPT) dataSeen = true;
    else if (!dataSeen && !opReturn) destinations.push(address ?? null);
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
    outputs,
    destinations,
  };
}

/** The approval screen's sentence for a refusal, in the reader's language. */
export function revealRefusalText(reason: RevealRefusal): string {
  switch (reason) {
    case 'unreadable': return t('safety_reveal_unreadable');
    case 'not_this_transaction': return t('safety_reveal_not_this_transaction');
    case 'script_not_committed': return t('safety_reveal_script_not_committed');
    case 'not_counterparty': return t('safety_reveal_not_counterparty');
    case 'source_not_signer': return t('safety_reveal_source_not_signer');
    case 'two_messages': return t('safety_reveal_two_messages');
  }
}

/**
 * The reveal output an attach lands on, as supplied (`attach.py`): the named vout, or the first
 * output that is not OP_RETURN. Null when the reveal has no such output, or names an OP_RETURN,
 * both of which core rejects.
 */
export function revealAttachTarget(outputs: RevealOutput[], destinationVout: number | undefined): RevealOutput | null {
  if (destinationVout !== undefined) {
    const named = outputs[destinationVout];
    return named && !named.opReturn ? named : null;
  }
  return outputs.find((output) => !output.opReturn) ?? null;
}

/** What the reveal, as supplied, does with the part of the message its outputs decide. */
export type RevealSupplied =
  | { kind: 'recipient'; address: string | null; owned: boolean }
  | { kind: 'no_recipient' }
  | { kind: 'new_owner'; address: string | null; owned: boolean }
  | { kind: 'no_transfer' }
  | { kind: 'attach_output'; vout: number; address: string | null; owned: boolean }
  | { kind: 'attach_missing' };

/** The facts behind the "site builds the second transaction" disclosure. */
export interface RevealControlFacts {
  control: Exclude<RevealSiteControl, 'message_only'>;
  messageType: string;
  /** The asset an issuance or attach names. */
  asset?: string;
  /**
   * The reveal as supplied, where its outputs decide something. Absent when core would read no
   * single destination from it (more than one output ahead of the data: core skips the message).
   */
  supplied?: RevealSupplied;
}

export interface RevealOutputFact extends RevealOutput {
  /** Pays one of this wallet's addresses. */
  owned: boolean;
}

/** The reveal's outputs, stated as proved facts about the transaction the site supplied. */
export interface RevealOutputsFacts {
  outputs: RevealOutputFact[];
  /** Sats the supplied reveal pays anywhere but this wallet's addresses. */
  externalSats: number;
}

type ProvedReveal = Extract<RevealVerification, { ok: true }>;

/**
 * The review's statement of a proved reveal: what the site decides about its message, when
 * anything, and what the reveal as supplied pays. Severity follows consequence: a type whose
 * outcome the outputs can change, or a reveal that pays someone else, takes the review step.
 *
 * @param reveal - the proved reveal
 * @param messageData - the local decode of its message
 * @param ownedAddresses - this wallet's addresses, to say which outputs are the user's
 */
export function revealDisclosures(
  reveal: ProvedReveal,
  messageData: unknown,
  ownedAddresses: string[],
): SecurityWarning[] {
  const owned = new Set(ownedAddresses.map(normalizeAddressForComparison));
  const isOwned = (address: string | null | undefined) =>
    !!address && owned.has(normalizeAddressForComparison(address));
  const warnings: SecurityWarning[] = [];

  const control = revealSiteControl(reveal.messageType);
  if (control !== 'message_only') {
    const data = (messageData ?? {}) as { asset?: unknown; destinationVout?: unknown };
    const asset = typeof data.asset === 'string' ? data.asset : undefined;
    const single = reveal.destinations.length <= 1;
    const destination = reveal.destinations[0];
    let supplied: RevealSupplied | undefined;
    if (control === 'send_recipient' && single) {
      supplied = destination === undefined
        ? { kind: 'no_recipient' }
        : { kind: 'recipient', address: destination, owned: isOwned(destination) };
    } else if (control === 'issuance_transfer' && single) {
      supplied = destination === undefined
        ? { kind: 'no_transfer' }
        : { kind: 'new_owner', address: destination, owned: isOwned(destination) };
    } else if (control === 'attach_output') {
      const vout = typeof data.destinationVout === 'number' ? data.destinationVout : undefined;
      const target = revealAttachTarget(reveal.outputs, vout);
      supplied = target
        ? { kind: 'attach_output', vout: target.index, address: target.address ?? null, owned: isOwned(target.address) }
        : { kind: 'attach_missing' };
    }
    const facts: RevealControlFacts = {
      control,
      messageType: reveal.messageType,
      ...(asset ? { asset } : {}),
      ...(supplied ? { supplied } : {}),
    };
    const text = revealControlText(facts);
    warnings.push({
      code: 'counterparty_reveal_site_control',
      data: facts,
      severity: revealControlNeedsReview(control) ? 'warning' : 'info',
      title: text.title,
      message: text.description,
    });
  }

  const outputs = reveal.outputs.map((output) => ({ ...output, owned: isOwned(output.address) }));
  const externalSats = outputs
    .filter((output) => !output.owned)
    .reduce((sum, output) => sum + output.value, 0);
  const facts: RevealOutputsFacts = { outputs, externalSats };
  const text = revealOutputsText(facts);
  warnings.push({
    code: 'counterparty_reveal_outputs',
    data: facts,
    severity: externalSats > 0 ? 'warning' : 'info',
    title: text.title,
    message: [text.description, ...text.items, text.note].join(' '),
  });
  return warnings;
}

function addressLabel(address: string | null | undefined, owned: boolean): string {
  if (!address) return t('safety_reveal_address_none');
  return owned ? t('safety_reveal_address_yours', address) : t('safety_reveal_address_not_yours', address);
}

function suppliedText(supplied: RevealSupplied | undefined): string | undefined {
  switch (supplied?.kind) {
    case undefined: return undefined;
    case 'recipient': return t('safety_reveal_supplied_recipient', addressLabel(supplied.address, supplied.owned));
    case 'no_recipient': return t('safety_reveal_supplied_no_recipient');
    case 'new_owner': return t('safety_reveal_supplied_new_owner', addressLabel(supplied.address, supplied.owned));
    case 'no_transfer': return t('safety_reveal_supplied_no_transfer');
    case 'attach_output':
      return t('safety_reveal_supplied_attach_output', [String(supplied.vout), addressLabel(supplied.address, supplied.owned)]);
    case 'attach_missing': return t('safety_reveal_supplied_attach_missing');
  }
}

/** The disclosure of what the site decides, in the reader's language. */
export function revealControlText(facts: RevealControlFacts): { title: string; description: string } {
  const asset = facts.asset ?? facts.messageType;
  let sentence: string;
  switch (facts.control) {
    case 'send_recipient': sentence = t('safety_reveal_control_send_recipient'); break;
    case 'issuance_transfer': sentence = t('safety_reveal_control_issuance_transfer', asset); break;
    case 'attach_output': sentence = t('safety_reveal_control_attach_output', asset); break;
    case 'dispense_payment': sentence = t('safety_reveal_control_dispense_payment'); break;
    case 'btcpay_payment': sentence = t('safety_reveal_control_btcpay_payment'); break;
    case 'detach_inputs': sentence = t('safety_reveal_control_detach_inputs'); break;
    case 'not_executed': sentence = t('safety_reveal_control_not_executed'); break;
    case 'outputs_unknown': sentence = t('safety_reveal_control_outputs_unknown', facts.messageType); break;
  }
  const supplied = suppliedText(facts.supplied);
  return {
    title: t('safety_reveal_site_builds_title'),
    description: supplied ? `${sentence} ${supplied}` : sentence,
  };
}

/** The statement of the supplied reveal's outputs, in the reader's language. */
export function revealOutputsText(facts: RevealOutputsFacts): {
  title: string;
  description: string;
  /** One line per output that carries value. */
  items: string[];
  /** Why these are facts about this reveal, not about every reveal of the commit. */
  note: string;
} {
  const paying = facts.outputs.filter((output) => output.value > 0);
  return {
    title: facts.externalSats > 0 ? t('safety_reveal_outputs_pays_other_title') : t('safety_reveal_outputs_title'),
    description: paying.length === 0 ? t('safety_reveal_outputs_data_only') : t('safety_reveal_outputs_pays'),
    items: paying.map((output) => t('safety_reveal_output_item', [
      String(output.value), addressLabel(output.opReturn ? null : output.address, output.owned),
    ])),
    note: t('safety_reveal_outputs_resign_note'),
  };
}
