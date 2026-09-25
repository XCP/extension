/**
 * Attached balances the Counterparty ledger cannot show yet.
 *
 * The per-input asset lookup asks Counterparty's ledger, which is built from parsed blocks. An
 * output created by an unconfirmed attach — or by an unconfirmed transaction that spends an
 * attached UTXO and so moves its balances onto its first non-OP_RETURN output — reads as empty
 * until that transaction confirms and Core parses its block. Reading that emptiness as "clean"
 * lets a site ask for a plain-looking spend of an asset the user attached a minute ago; once
 * both confirm, Core moves the asset to whatever the spend's first output pays.
 *
 * So an empty ledger answer is accepted only when the transaction that created the output could
 * not have put anything on it, or when the ledger has provably already parsed that transaction.
 * Everything else is reported as pending (retry after it confirms) or unknown — never as clean.
 *
 * Which outputs of a transaction can receive attached balances, from Core's rules:
 *
 * - `attach` (101) credits its destination vout, or the first non-OP_RETURN output by default.
 * - Any transaction spending an attached UTXO moves those balances to its first non-OP_RETURN
 *   output (`move_assets`), unless it carries a `detach` (102), which credits an address instead.
 * - The legacy `utxo` move (100), an unreadable payload, or a taproot-reveal marker whose envelope
 *   is not read here could credit any output, so every output is treated as exposed.
 *
 * The distinction matters for the marketplace. Its preparation chains spend unconfirmed attach
 * CHANGE (output 1+, never the asset output 0) and unconfirmed plain-BTC fan-out / offer-funding
 * outputs. Those remain clean without waiting for a confirmation: the change is not an attach
 * destination, and a plain parent's first output is exposed only when the parent itself spends
 * something that carries (or may carry) attached balances, which is checked recursively.
 */

import { parseRawTransactionLocally } from '@/core/bitcoin/localTransactionParse';
import { fetchPreviousRawTransaction, fetchTransactionChainStatus } from '@/core/bitcoin/utxo';
import {
  fetchBackendTransaction,
  fetchLedgerHeights,
  fetchUtxoBalances,
  type UtxoBalance,
} from '@/core/counterparty/api';
import { unpackCounterpartyMessage } from '@/core/counterparty/unpack';
import type { AttachData } from '@/core/counterparty/unpack/messages/attach';
import { COUNTERPARTY_PREFIX_HEX } from '@/core/counterparty/unpack/messageTypes';
import { extractOpReturnPayload, extractPayloadFromOutputs } from '@/core/counterparty/unpack/opReturn';

/** A previous transaction and whether it is in a block. */
export interface ParentTransaction {
  rawTxHex: string;
  confirmed: boolean;
  /** Height of the containing block, where the source reports it. */
  blockHeight?: number;
  /** Confirmations at the time of the lookup, where the source reports them instead. */
  confirmations?: number;
}

/** The chain and ledger reads this check needs; injectable so tests never touch the network. */
export interface AttachmentEvidenceSource {
  /** Balances attached to `txid:vout` per the Counterparty ledger. `fresh` bypasses any cache. */
  balances(utxo: string, fresh: boolean): Promise<UtxoBalance[]>;
  /** The transaction and its confirmation state, or null when no source knows it. */
  parent(txid: string): Promise<ParentTransaction | null>;
  /** Current tip and ledger heights. Must be read after the parent it is compared against. */
  ledgerHeights(): Promise<{ backendHeight: number; counterpartyHeight: number }>;
}

async function liveParent(txid: string): Promise<ParentTransaction | null> {
  try {
    const tx = await fetchBackendTransaction(txid);
    return tx.confirmations > 0
      ? { rawTxHex: tx.hex, confirmed: true, confirmations: tx.confirmations }
      : { rawTxHex: tx.hex, confirmed: false };
  } catch {
    // The node's backend may not have seen a just-relayed transaction. Try the explorer.
  }
  const [rawTxHex, status] = await Promise.all([
    fetchPreviousRawTransaction(txid),
    fetchTransactionChainStatus(txid),
  ]);
  if (!rawTxHex || !status) return null;
  if (!status.confirmed) return { rawTxHex, confirmed: false };
  // A confirmed status without a height cannot be compared against the ledger.
  if (!Number.isSafeInteger(status.block_height)) return null;
  return { rawTxHex, confirmed: true, blockHeight: status.block_height };
}

export const liveAttachmentEvidenceSource: AttachmentEvidenceSource = {
  balances: async (utxo, fresh) => (await fetchUtxoBalances(utxo, { fresh })).result ?? [],
  parent: liveParent,
  ledgerHeights: () => fetchLedgerHeights(),
};

/** Which outputs of a transaction Counterparty could credit attached balances to. */
export interface OutputExposure {
  txid: string;
  outputCount: number;
  inputs: Array<{ txid: string; vout: number }>;
  /** Every output may receive balances (unreadable or legacy-move payload). */
  everyOutput: boolean;
  /** Outputs an attach message credits directly, whatever the inputs carry. */
  attachOutputs: number[];
  /** Core's implicit move destination, or null (no such output, or an explicit detach). */
  implicitOutput: number | null;
}

/**
 * Read which outputs of `rawTxHex` could carry attached balances once it is parsed. Returns null
 * when the bytes do not parse, so the caller reports the outpoint as unknown.
 */
export function classifyOutputExposure(rawTxHex: string): OutputExposure | null {
  const parsed = parseRawTransactionLocally(rawTxHex);
  if (!parsed || parsed.inputs.length === 0) return null;

  const firstNonOpReturn = parsed.outputs.find(output => output.type !== 'op_return')?.index ?? null;
  const base = {
    txid: parsed.txid,
    outputCount: parsed.outputs.length,
    inputs: parsed.inputs.map(input => ({ txid: input.txid, vout: input.vout })),
  };
  const everything = { ...base, everyOutput: true, attachOutputs: [], implicitOutput: firstNonOpReturn };
  const implicitOnly = { ...base, everyOutput: false, attachOutputs: [], implicitOutput: firstNonOpReturn };

  const scripts = parsed.outputs.map(output => output.script ?? output.opReturnData ?? '');
  const payload = extractPayloadFromOutputs(scripts, parsed.inputs[0]!.txid);
  if (!payload) {
    const opReturns = parsed.outputs.filter(output => output.type === 'op_return');
    // A bare CNTRPRTY marker announces a message carried in the input-0 witness envelope, which
    // this check does not read: it may be an attach to any output.
    if (opReturns.some(output => extractOpReturnPayload(output.opReturnData ?? '') === COUNTERPARTY_PREFIX_HEX)) {
      return everything;
    }
    // No message (or a foreign OP_RETURN Core cannot parse as one): only the implicit move.
    return implicitOnly;
  }

  const message = unpackCounterpartyMessage(payload);
  if (!message.success || !message.messageType) return everything;
  switch (message.messageType) {
    case 'detach':
      // An explicit detach supersedes the implicit move: every attached input goes to an address.
      return { ...base, everyOutput: false, attachOutputs: [], implicitOutput: null };
    case 'attach': {
      const explicit = (message.data as AttachData | undefined)?.destinationVout;
      // A destination this parser cannot read as an index could be any output.
      if (explicit !== undefined && !Number.isSafeInteger(explicit)) return everything;
      const destination = explicit ?? firstNonOpReturn;
      return {
        ...base,
        everyOutput: false,
        attachOutputs: destination === null || destination === undefined ? [] : [destination],
        implicitOutput: firstNonOpReturn,
      };
    }
    case 'utxo':
    case 'utxo_move':
      return everything;
    default:
      return implicitOnly;
  }
}

/** What the ledger's empty answer for one outpoint turned out to mean. */
export type PendingEvidence =
  | { kind: 'clean' }
  | { kind: 'assets'; balances: UtxoBalance[] }
  /** An unconfirmed (or not yet parsed) transaction may attach balances to this outpoint. */
  | { kind: 'pending'; parentTxid: string }
  | { kind: 'unknown' };

/** Deepest unconfirmed ancestor examined for an implicit move before giving up as unknown. */
export const MAX_PENDING_DEPTH = 3;
/** Ancestor outpoints examined per request, past the ones being signed. */
const MAX_PENDING_ANCESTOR_LOOKUPS = 30;

/** Per-request memo and budget, so a shared parent is fetched once. */
export interface PendingEvidenceContext {
  source: AttachmentEvidenceSource;
  parents: Map<string, Promise<ParentTransaction | null>>;
  ancestorBudget: number;
}

export function createPendingEvidenceContext(source: AttachmentEvidenceSource): PendingEvidenceContext {
  return { source, parents: new Map(), ancestorBudget: MAX_PENDING_ANCESTOR_LOOKUPS };
}

function loadParent(context: PendingEvidenceContext, txid: string): Promise<ParentTransaction | null> {
  const key = txid.toLowerCase();
  let pending = context.parents.get(key);
  if (!pending) {
    pending = context.source.parent(key).catch(() => null);
    context.parents.set(key, pending);
  }
  return pending;
}

/** Has the ledger parsed the block containing `parent`? Null when that cannot be established. */
async function ledgerHasParsed(
  context: PendingEvidenceContext,
  parent: ParentTransaction,
): Promise<boolean | null> {
  let heights: { backendHeight: number; counterpartyHeight: number };
  try {
    // Read after the parent: the tip only grows, so backend - confirmations + 1 is then an upper
    // bound on the parent's height, which keeps the comparison conservative.
    heights = await context.source.ledgerHeights();
  } catch {
    return null;
  }
  if (parent.blockHeight !== undefined) return heights.counterpartyHeight >= parent.blockHeight;
  if (parent.confirmations !== undefined && parent.confirmations > 0) {
    return heights.counterpartyHeight >= heights.backendHeight - parent.confirmations + 1;
  }
  return null;
}

/**
 * Resolve an outpoint whose ledger lookup came back empty.
 *
 * @param depth - 0 for an outpoint being signed; ancestors examined for an implicit move are deeper
 */
export async function resolveEmptyLedgerOutpoint(
  context: PendingEvidenceContext,
  txid: string,
  vout: number,
  depth = 0,
): Promise<PendingEvidence> {
  if (depth > MAX_PENDING_DEPTH) return { kind: 'unknown' };
  const parent = await loadParent(context, txid);
  if (!parent) return { kind: 'unknown' };
  const exposure = classifyOutputExposure(parent.rawTxHex);
  // Bytes that do not hash to the outpoint's txid describe some other transaction.
  if (!exposure || exposure.txid.toLowerCase() !== txid.toLowerCase()) return { kind: 'unknown' };
  if (!Number.isSafeInteger(vout) || vout < 0 || vout >= exposure.outputCount) return { kind: 'unknown' };

  const direct = exposure.everyOutput || exposure.attachOutputs.includes(vout);
  const implicit = exposure.implicitOutput === vout;
  if (!direct && !implicit) return { kind: 'clean' };

  if (parent.confirmed) {
    const parsed = await ledgerHasParsed(context, parent);
    if (parsed === null) return { kind: 'unknown' };
    if (!parsed) return { kind: 'pending', parentTxid: exposure.txid };
    // The first lookup may predate the parse (or come from a cache); ask again now that the
    // ledger is known to include this transaction.
    try {
      const balances = await context.source.balances(`${txid}:${vout}`, true);
      const present = balances.filter(balance => balance.asset && balance.quantity_normalized);
      return present.length > 0 ? { kind: 'assets', balances: present } : { kind: 'clean' };
    } catch {
      return { kind: 'unknown' };
    }
  }

  // Unconfirmed. An attach destination is pending whatever the inputs hold.
  if (direct) return { kind: 'pending', parentTxid: exposure.txid };

  // Only the implicit move can reach this output: it carries something exactly when the parent
  // spends something that does, including balances still pending further up the chain.
  if (context.ancestorBudget < exposure.inputs.length) return { kind: 'unknown' };
  context.ancestorBudget -= exposure.inputs.length;
  const ancestors = await Promise.all(exposure.inputs.map(async (input): Promise<PendingEvidence> => {
    try {
      const balances = (await context.source.balances(`${input.txid}:${input.vout}`, false))
        .filter(balance => balance.asset && balance.quantity_normalized);
      if (balances.length > 0) return { kind: 'assets', balances };
    } catch {
      return { kind: 'unknown' };
    }
    return resolveEmptyLedgerOutpoint(context, input.txid, input.vout, depth + 1);
  }));
  if (ancestors.some(ancestor => ancestor.kind === 'assets' || ancestor.kind === 'pending')) {
    return { kind: 'pending', parentTxid: exposure.txid };
  }
  if (ancestors.some(ancestor => ancestor.kind === 'unknown')) return { kind: 'unknown' };
  return { kind: 'clean' };
}
