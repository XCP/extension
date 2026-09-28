/**
 * Script-path signatures the wallet gives only for a message it has shown.
 *
 * A Taproot script-path spend of a Counterparty envelope leaf,
 *
 *   OP_FALSE OP_IF <pushes> OP_ENDIF <32-byte key> OP_CHECKSIG
 *
 * publishes the envelope's message, and when `<key>` is the source address's own key (its Taproot
 * output or internal key, or the x-only form of the key behind a SegWit or legacy address), the
 * signature on that leaf is what makes the message the address's. So a signature on such a leaf
 * is a signature on its message, however the rest of the transaction reads.
 *
 * The wallet therefore signs a script path naming one of its keys only for the one leaf whose
 * message the approval decoded and showed: the reveal leaf on input 0 that the approval decoder
 * reads (`resolvePsbtCounterpartyPayload`), in the exact envelope shape. Every other leaf that
 * names a wallet key (another input, another shape, a second leaf, an envelope the wallet cannot
 * decode, a message the screen shows from elsewhere) blocks the review here and is refused by the
 * signer itself (`signPSBT`). Leaves that name none of the wallet's keys are left alone, and so
 * are key-path spends.
 */

import { hexToBytes } from '@noble/hashes/utils.js';
import { Address } from '@scure/btc-signer';
import { leafNamesAnyKey, type PsbtDetails } from '@/core/bitcoin/psbt';
import { resolveRevealMessage } from '@/core/counterparty/providerInscriptions';
import type { SafetyAnalysis, SecurityWarning } from '@/core/counterparty/transactionSafety';
import { extractPayloadFromOutputs } from '@/core/counterparty/unpack/opReturn';
import { parseInstructions } from '@/core/counterparty/unpack/ordEnvelope';
import { t } from '@/i18n';

type PsbtShape = Pick<PsbtDetails, 'inputs' | 'outputs'>;

/** The Counterparty message a PSBT's approval shows, and the leaf it was read from, if any. */
export interface PsbtCounterpartyPayload {
  dataHex: string;
  /** Input 0's only tapleaf, hex, when the message was read from it rather than the outputs. */
  revealLeaf?: string;
}

/**
 * The message the approval shows for a PSBT: the outputs' Counterparty payload, or failing that
 * the reveal envelope on input 0 (`resolveRevealMessage`). The approval decoder and the signer's
 * leaf rule both read it here, so what is shown and what may be signed cannot drift apart.
 */
export function resolvePsbtCounterpartyPayload(details: PsbtShape): PsbtCounterpartyPayload | null {
  const firstInputTxid = details.inputs[0]?.txid;
  const fromOutputs = firstInputTxid
    ? extractPayloadFromOutputs(details.outputs.map(output => output.script ?? ''), firstInputTxid)
    : null;
  if (fromOutputs) return { dataHex: fromOutputs };
  const reveal = resolveRevealMessage(details.inputs, details.outputs);
  const leaf = details.inputs.find(input => input.index === 0)?.tapLeafScripts?.[0];
  if (!reveal || !leaf) return null;
  return { dataHex: reveal.messageHex, revealLeaf: leaf.toLowerCase() };
}

const OP_IF = 0x63;
const OP_ENDIF = 0x68;
const OP_CHECKSIG = 0xac;

/**
 * Exactly `OP_FALSE OP_IF <pushes> OP_ENDIF <32-byte key> OP_CHECKSIG`: nothing but pushes inside
 * the envelope and nothing around it, so the key the leaf needs is the one after the envelope.
 */
function isExactEnvelopeLeaf(leafHex: string): boolean {
  let instructions: ReturnType<typeof parseInstructions>;
  try {
    instructions = parseInstructions(hexToBytes(leafHex));
  } catch {
    return false;
  }
  if (!instructions || instructions.length < 5) return false;
  const at = (index: number) => instructions[index < 0 ? instructions.length + index : index];
  const first = at(0);
  const key = at(-2);
  const isOp = (instruction: ReturnType<typeof at>, op: number) =>
    instruction !== undefined && 'op' in instruction && instruction.op === op;
  return !!first && 'push' in first && first.push.length === 0
    && isOp(at(1), OP_IF) && isOp(at(-3), OP_ENDIF) && isOp(at(-1), OP_CHECKSIG)
    && !!key && 'push' in key && key.push.length === 32
    && instructions.slice(2, -3).every(instruction => 'push' in instruction);
}

/**
 * The one leaf the wallet may sign by script path with its own key: input 0's only leaf, when the
 * approval shows the message read from it and the leaf is exactly the envelope shape.
 */
export function shownEnvelopeLeaf(details: PsbtShape): string | undefined {
  const leaf = resolvePsbtCounterpartyPayload(details)?.revealLeaf;
  return leaf && isExactEnvelopeLeaf(leaf) ? leaf : undefined;
}

/** The wallet's keys in every form a leaf can name them, for the review's leaf check. */
export interface WalletLeafKeys {
  keys: Uint8Array[];
  /** False when some address's key could not be read: then every unshown leaf is refused. */
  complete: boolean;
}

/**
 * Every x-only key the wallet's addresses answer to: the x-only form of each address's public key
 * (either parity; SegWit, nested SegWit and legacy included), and each Taproot address's output
 * key. For a Taproot address the public key is its internal key.
 */
export function walletLeafKeys(addresses: ReadonlyArray<{ address: string; pubKey?: string }>): WalletLeafKeys {
  const keys: Uint8Array[] = [];
  let complete = true;
  for (const { address, pubKey } of addresses) {
    try {
      const decoded = Address().decode(address);
      if (decoded.type === 'tr') keys.push(decoded.pubkey);
    } catch {
      // Not an address this decoder reads; its public key below still counts.
    }
    let bytes: Uint8Array | undefined;
    try {
      bytes = pubKey ? hexToBytes(pubKey) : undefined;
    } catch {
      bytes = undefined;
    }
    const readable = bytes !== undefined && (
      (bytes.length === 33 && (bytes[0] === 0x02 || bytes[0] === 0x03))
      || (bytes.length === 65 && bytes[0] === 0x04)
    );
    if (readable) keys.push(bytes!.slice(1, 33));
    else complete = false;
  }
  return { keys, complete };
}

/**
 * Inputs carrying a tapleaf that names one of the wallet's keys (or that cannot be read, or any
 * leaf at all when the wallet's keys are not all known) other than the one leaf whose message the
 * approval shows. Every input counts, requested or not: no leaf naming the user's key has a
 * reason to be in the transaction unless its message is the one on the screen.
 */
export function unshownKeyLeafInputs(details: PsbtShape, walletKeys: WalletLeafKeys): number[] {
  const shown = shownEnvelopeLeaf(details);
  const offending: number[] = [];
  for (const input of details.inputs) {
    const leaves = input.tapLeafScripts ?? [];
    const refused = leaves.some((leafHex) => {
      if (shown !== undefined && input.index === 0 && leaves.length === 1 && leafHex.toLowerCase() === shown) {
        return false;
      }
      if (!walletKeys.complete) return true;
      let leaf: Uint8Array;
      try {
        leaf = hexToBytes(leafHex);
      } catch {
        return true;
      }
      return leafNamesAnyKey(leaf, walletKeys.keys);
    });
    if (refused) offending.push(input.index);
  }
  return offending;
}

/** The review's block for those inputs, in the reader's language. */
export function unshownEnvelopeWarning(inputs: number[]): SecurityWarning {
  return {
    code: 'unshown_envelope_signature',
    data: { inputs },
    severity: 'block',
    title: t('safety_blocked_unreadable_signed_message'),
    message: t('safety_unreadable_signed_message_detail'),
  };
}

/**
 * A decoded PSBT with the leaf block applied: when any input carries an unshown leaf naming a
 * wallet key, the block leads the warnings and the analysis is blocked. Unchanged otherwise.
 */
export function withEnvelopeLeafGuard<T extends { psbtDetails: PsbtDetails; safety: SafetyAnalysis }>(
  decoded: T,
  walletKeys: WalletLeafKeys,
): T {
  const inputs = unshownKeyLeafInputs(decoded.psbtDetails, walletKeys);
  if (inputs.length === 0) return decoded;
  return {
    ...decoded,
    safety: {
      ...decoded.safety,
      blocked: true,
      warnings: [unshownEnvelopeWarning(inputs), ...decoded.safety.warnings],
    },
  };
}
