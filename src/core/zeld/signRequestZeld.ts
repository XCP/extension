/**
 * Where a site's transaction puts the ZELD on the outputs this wallet signs for.
 *
 * The protocol (zeldhash-protocol `protocol.rs`, see `protocol.ts`) moves every input's ZELD as a
 * whole, never per input and never in proportion to value:
 *
 * - The ZELD of all inputs together lands on the first non-OP_RETURN output.
 * - Unless the transaction's last OP_RETURN that reads `ZELD` + CBOR `[u64, ...]` asks for a split
 *   and every input is signed SIGHASH_ALL (Taproot's default counts). Then output i of the
 *   non-OP_RETURN outputs gets the i-th amount, and anything left over is added to the first.
 *   A split asking for more than the inputs carry is ignored and everything goes to the first.
 * - A transaction with no non-OP_RETURN output leaves the ZELD nowhere: it is destroyed.
 *
 * Which inputs carry ZELD comes from the indexer; when it cannot be read, from the wallet's own
 * record of its ZELD outputs (`knownOutpoints.ts`); and always from the six-zero txid shape, which
 * finds a hunt's reward output. An address the wallet has never seen hold ZELD gets no notice
 * during an outage: "unknown" is never a reason to caution by itself.
 *
 * Nothing here blocks. It says where the ZELD goes when that is somewhere the user may not expect:
 * someone else's output, the output an asset is attached to, or an asset listed for sale.
 */

import { normalizeAddressForComparison } from '@/core/bitcoin/address';
import type { ZeldUtxo } from '@/core/zeld/api';
import { decodeCborUintArray } from '@/core/zeld/cbor';
import type { KnownZeldOutpoint } from '@/core/zeld/knownOutpoints';
import { type AssessZeldExposureOptions, classifyZeldOutpoints } from '@/core/zeld/protection';

/** What the review says about ZELD. Amounts are base units as decimal strings; absent when unknown. */
export type ZeldNotice =
  /** Lands on an output of this wallet that this transaction also puts a Counterparty asset on. */
  | { kind: 'asset_output'; amount?: string; asset: string; vout: number }
  /**
   * Lands on an output this wallet does not own. `destination` is its address, or `#vout` for a
   * script with none; both absent when the signature leaves the outputs to whoever completes it.
   */
  | { kind: 'leaves'; amount?: string; destination?: string }
  /** Sits on an asset output signed for sale: it goes to the buyer with the asset. */
  | { kind: 'listed'; amount?: string; asset: string }
  /** The transaction has no output for it to land on. */
  | { kind: 'destroyed'; amount?: string }
  /** The indexer was down, this address is known to hold ZELD, and an input could not be classified. */
  | { kind: 'unchecked' };

export interface ZeldSignRequestInput {
  inputs: ReadonlyArray<{ txid: string; vout: number; address?: string }>;
  /** The inputs this wallet signs, with the sighash each signature uses. */
  signedInputs: ReadonlyArray<{ index: number; sighashType: number }>;
  outputs: ReadonlyArray<{ index: number; type: string; address?: string; script?: string }>;
  /** This wallet's addresses: the signers and their paired siblings. */
  ownedAddresses: readonly string[];
  /** Whose ZELD to look up for a signed input whose prevout address is unknown. */
  defaultAddress?: string;
  /** Outputs of this wallet that this transaction attaches or moves Counterparty assets onto. */
  assetOutputs?: ReadonlyMap<number, string>;
  /** Signed inputs carrying assets whose signature leaves delivery open: a listing. */
  listedInputs?: ReadonlyMap<number, string>;
}

export interface ZeldLookupOptions extends Pick<AssessZeldExposureOptions, 'fetchParent' | 'isZeldTxid'> {
  fetchUtxos?: (address: string) => Promise<ZeldUtxo[]>;
  /** The wallet's own record, consulted only when the indexer cannot be read. */
  knownOutpoints?: (address: string) => KnownZeldOutpoint[] | Promise<KnownZeldOutpoint[]>;
}

type KnownOutpointSource = (address: string) => KnownZeldOutpoint[] | Promise<KnownZeldOutpoint[]>;
let knownOutpointSource: KnownOutpointSource | null = null;

/**
 * Where the wallet's own ZELD record is read from. The background installs this once from its
 * composition root; without it (tests, other contexts) an indexer outage falls back to the txid
 * heuristic alone.
 */
export function setKnownZeldOutpointSource(source: KnownOutpointSource | null): void {
  knownOutpointSource = source;
}

const ZELD_PREFIX = '5a454c44';

/** Base sighash type: ALL, NONE or SINGLE. Taproot's default (0) is ALL. */
const baseSighash = (type: number) => (type === 0 ? 1 : type & 0x1f);

/** The data pushed by an `OP_RETURN <push>` script, or null. */
function opReturnPush(scriptHex: string): string | null {
  const script = scriptHex.toLowerCase();
  if (!script.startsWith('6a') || script.length < 4) return null;
  const op = parseInt(script.slice(2, 4), 16);
  let start: number;
  let length: number;
  if (op >= 1 && op <= 0x4b) {
    start = 4;
    length = op;
  } else if (op === 0x4c) {
    start = 6;
    length = parseInt(script.slice(4, 6), 16);
  } else if (op === 0x4d) {
    start = 8;
    length = parseInt(script.slice(6, 8) + script.slice(4, 6), 16);
  } else {
    return null;
  }
  const data = script.slice(start, start + length * 2);
  return data.length === length * 2 ? data : null;
}

/** The split the last valid ZELD OP_RETURN asks for, as the reference indexer reads it, or null. */
export function zeldDistribution(outputs: ZeldSignRequestInput['outputs']): bigint[] | null {
  let found: bigint[] | null = null;
  for (const output of outputs) {
    if (output.type !== 'op_return' || !output.script) continue;
    const data = opReturnPush(output.script);
    if (!data?.startsWith(ZELD_PREFIX)) continue;
    const hex = data.slice(ZELD_PREFIX.length);
    try {
      const bytes = new Uint8Array(hex.length / 2);
      for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
      const values = decodeCborUintArray(bytes);
      if (values.every(value => value < 2n ** 64n)) found = values;
    } catch {
      // Not a split the indexer would read either; an earlier valid one still stands.
    }
  }
  return found;
}

interface BearingInput {
  index: number;
  sighashType: number;
  amount?: bigint;
}

interface Classified {
  bearing: BearingInput[];
  /** Signed inputs of an address known to hold ZELD that could not be checked. */
  unchecked: number[];
}

async function classifySignedInputs(input: ZeldSignRequestInput, options: ZeldLookupOptions): Promise<Classified> {
  const byAddress = new Map<string, Array<{ index: number; sighashType: number; txid: string; vout: number }>>();
  for (const signed of input.signedInputs) {
    const spent = input.inputs[signed.index];
    const address = spent?.address ?? input.defaultAddress;
    if (!spent || !address) continue;
    const list = byAddress.get(address) ?? [];
    list.push({ index: signed.index, sighashType: signed.sighashType, txid: spent.txid.toLowerCase(), vout: spent.vout });
    byAddress.set(address, list);
  }

  const bearing: BearingInput[] = [];
  const unchecked: number[] = [];
  // One classification per signing address: the indexer answers per address, and so does the
  // wallet's record that stands in for it.
  await Promise.all([...byAddress].map(async ([address, spent]) => {
    const classified = await classifyZeldOutpoints(spent, address, {
      ...options,
      knownOutpoints: options.knownOutpoints ?? knownOutpointSource ?? undefined,
    });
    const bearingSet = new Set(classified.bearing.map(outpoint => outpoint.toLowerCase()));
    const uncheckedSet = new Set((classified.unchecked ?? []).map(outpoint => outpoint.toLowerCase()));
    for (const entry of spent) {
      const outpoint = `${entry.txid}:${entry.vout}`;
      if (bearingSet.has(outpoint)) {
        const amount = classified.amounts?.[outpoint];
        bearing.push({ index: entry.index, sighashType: entry.sighashType, ...(amount === undefined ? {} : { amount: BigInt(amount) }) });
      } else if (uncheckedSet.has(outpoint)) {
        unchecked.push(entry.index);
      }
    }
  }));
  bearing.sort((a, b) => a.index - b.index);
  return { bearing, unchecked };
}

const sum = (inputs: BearingInput[]): bigint | undefined =>
  inputs.every(entry => entry.amount !== undefined)
    ? inputs.reduce((total, entry) => total + entry.amount!, 0n)
    : undefined;

const text = (amount: bigint | undefined) => (amount === undefined ? {} : { amount: amount.toString() });

/**
 * The outputs that can receive the committed inputs' ZELD, each with the most it can receive.
 * Several appear only when a ZELD split may or may not take effect, which the wallet cannot
 * settle from the bytes it signs.
 */
function receivers(
  input: ZeldSignRequestInput,
  committed: BearingInput[],
): Array<{ position: number; amount?: bigint }> {
  const total = sum(committed);
  const distribution = zeldDistribution(input.outputs);
  // A split needs every input signed SIGHASH_ALL; the wallet knows only its own signatures.
  const ours = new Map(input.signedInputs.map(signed => [signed.index, signed.sighashType]));
  const oursAllAll = [...ours.values()].every(type => type === 0 || type === 1);
  if (!distribution || !oursAllAll) return [{ position: 0, amount: total }];
  const requested = distribution.reduce((acc, value) => acc + value, 0n);
  const everyInputOurs = input.inputs.every((_, index) => ours.has(index));
  const knownValid = total !== undefined && requested <= total && everyInputOurs;
  const knownInvalid = everyInputOurs && total !== undefined && requested > total;
  if (knownInvalid) return [{ position: 0, amount: total }];
  const listed = distribution
    .map((value, position) => ({ position, amount: total === undefined || value < total ? value : total }))
    .filter(entry => entry.position > 0 && entry.amount > 0n);
  if (knownValid) {
    const others = distribution.slice(1).reduce((acc, value) => acc + value, 0n);
    const first = total - others;
    return [...(first > 0n ? [{ position: 0, amount: first }] : []), ...listed];
  }
  return [{ position: 0, amount: total }, ...listed];
}

/**
 * What the review should say about ZELD on the inputs this wallet signs. Empty on the happy path:
 * no ZELD involved, or it lands on a plain output of this wallet.
 */
export async function analyzeSignRequestZeld(
  input: ZeldSignRequestInput,
  options: ZeldLookupOptions = {},
): Promise<ZeldNotice[]> {
  if (input.signedInputs.length === 0) return [];
  // The common shape needs no lookup at all: every signature commits the outputs, there is no
  // ZELD split, and the first spendable output is a plain one of this wallet's. Whatever ZELD the
  // inputs carry rolls onto it, so the indexer is not asked.
  const first = input.outputs.find(output => output.type !== 'op_return');
  const ownedSet = new Set(input.ownedAddresses.map(normalizeAddressForComparison));
  if (first?.address && ownedSet.has(normalizeAddressForComparison(first.address))
    && !input.assetOutputs?.has(first.index)
    && input.signedInputs.every(signed => baseSighash(signed.sighashType) === 1)
    && !zeldDistribution(input.outputs)) {
    return [];
  }
  const { bearing, unchecked } = await classifySignedInputs(input, options);
  if (bearing.length === 0 && unchecked.length === 0) return [];

  const notices: ZeldNotice[] = [];
  const owned = new Set(input.ownedAddresses.map(normalizeAddressForComparison));
  const isOpen = (entry: { sighashType: number }) => baseSighash(entry.sighashType) !== 1;
  const sighashOf = new Map(input.signedInputs.map(signed => [signed.index, signed.sighashType]));

  // SINGLE and NONE leave the output list open: whoever completes the transaction decides which
  // output comes first. On a listing that is the buyer; otherwise it is not this wallet.
  for (const entry of bearing.filter(isOpen)) {
    const asset = input.listedInputs?.get(entry.index);
    notices.push(asset ? { kind: 'listed', asset, ...text(entry.amount) } : { kind: 'leaves', ...text(entry.amount) });
  }

  const committed = bearing.filter(entry => !isOpen(entry));
  const uncheckedCommitted = unchecked.filter(index => baseSighash(sighashOf.get(index) ?? 1) === 1);
  const uncheckedOpen = unchecked.length > uncheckedCommitted.length;
  const spendable = input.outputs.filter(output => output.type !== 'op_return');
  let surprising = uncheckedOpen;

  if (committed.length > 0 || uncheckedCommitted.length > 0) {
    if (spendable.length === 0) {
      surprising = true;
      if (committed.length > 0) notices.push({ kind: 'destroyed', ...text(sum(committed)) });
    } else {
      for (const { position, amount } of receivers(input, committed)) {
        const output = spendable[position];
        if (!output) continue;
        const address = output.address;
        const ours = !!address && owned.has(normalizeAddressForComparison(address));
        const asset = ours ? input.assetOutputs?.get(output.index) : undefined;
        if (ours && !asset) continue;
        surprising = true;
        if (committed.length === 0) continue;
        notices.push(asset
          ? { kind: 'asset_output', asset, vout: output.index, ...text(amount) }
          : { kind: 'leaves', destination: address ?? `#${output.index}`, ...text(amount) });
      }
    }
  }

  // Unclassified inputs matter only where known ZELD would have gone somewhere worth a word.
  if (unchecked.length > 0 && surprising) notices.push({ kind: 'unchecked' });
  return notices;
}
