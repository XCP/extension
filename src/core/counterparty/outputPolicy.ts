/**
 * Deny-by-default accounting over a composed transaction's outputs.
 *
 * Field-by-field verification of a compose response fails open: a field nobody enumerated goes
 * unchecked, so a response can add an output nothing compares against. This inverts that. Every
 * output must be *positively explained* as one of:
 *
 *   - the Counterparty data output (OP_RETURN, or a bare-multisig data carrier),
 *   - an address the user asked to pay,
 *   - change returning to an address the signer controls.
 *
 * Anything left over rejects the transaction. A new protocol field, an extra recipient, or an
 * encoding this build does not understand therefore fails *closed* — the failure mode is a blocked
 * transaction, not a silent transfer.
 *
 * This is the pattern BitGo uses to verify its own server's "prebuild" before signing (every output
 * must be a known recipient, provable change, or a bounded fee output, or the transaction is
 * rejected), and the pattern Ledger's BIP-388 wallet policies apply to change recognition: an output
 * is change only if it can be re-derived, otherwise it is displayed as money leaving. See ADR-019.
 *
 * Scope: this checks *where value goes*. It deliberately says nothing about the Counterparty message
 * body, which is verified separately.
 *
 * **Audit of every compose type (against core's `compose()` return values).** Each module returns
 * `(source, destinations, data)`, and `destinations` is exactly what becomes a non-change output, so
 * that return value is the authoritative list of what this policy has to explain:
 *
 * | Compose type | Non-change outputs | How it is explained |
 * |---|---|---|
 * | broadcast, cancel, destroy, detach, dividend, fairmint, fairminter, order, pooldeposit, poolwithdraw, sweep, enhanced send | none — core returns `[]` | nothing to explain |
 * | send (BTC), mpma | the payee(s) | named in the request; comma-separated lists are split |
 * | issuance with `transfer_destination` | the new owner | named in the request, and required to be the only output ahead of the data output (`checkPositionalDestination`) |
 * | dispenser | none, or `open_address` | named in the request when used |
 * | dispense | the dispenser being paid | named in the request as `dispenser` |
 * | attach | a new UTXO at the source's own address | recognized as change |
 * | move (utxo) | the destination, or the source address when none is given | named in the request, else change |
 * | burn | the protocol's unspendable address | supplied by the caller as a constant, with the amount pinned |
 * | btcpay | derived from the order match, so unnameable | exempt (`SERVER_DERIVED_DESTINATION_TYPES`) |
 *
 * `bet` is the one core module with an implicit payee (its feed address) that is not covered — the
 * wallet composes no bets, so it never reaches here. Adding bet composition would require adding the
 * feed address as an intended destination.
 *
 * **Known limitation — presence is not checked.** BitGo's equivalent also asserts that every
 * intended recipient output is *present*, so a response cannot quietly drop one. This does not,
 * because callers pass destinations generously (every address the request mentions, whatever field
 * it came from) so that addresses which legitimately live in the message body rather than in an
 * output — an oracle or dispenser's open address — do not read as missing payments. Requiring
 * presence needs per-compose-type knowledge of which addresses become outputs; until then a dropped
 * destination is caught only by the fee bound and by the user reading the review screen. Omission
 * costs the user nothing directly (the value stays in change), unlike an added recipient, which is
 * why the added-recipient half is the half enforced here.
 */

import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { Transaction } from '@scure/btc-signer';
import { decodeAddressFromScript, normalizeAddressForComparison } from '@/core/bitcoin/address';
import { isBareMultisigDataOutput } from '@/core/counterparty/unpack/multisig';
import { toSafeInteger } from '@/core/numeric';

/** An output the user's request accounts for. */
export interface IntendedDestination {
  address: string;
  /** Exact value in sats, when the request pins one. Omit when the composer chooses (e.g. dust). */
  value?: number;
}

export interface OutputPolicyInput {
  rawTransaction: string;
  /** Addresses whose outputs count as change (the signer's own). */
  ownAddresses: string[];
  /** Addresses the user asked to pay. Empty for messages whose recipient lives in the payload. */
  intendedDestinations: IntendedDestination[];
  /**
   * The address this message reads *positionally* — from where its output sits rather than from
   * the payload — when it has one. Set it for those message types and nothing else; see
   * `checkPositionalDestination`.
   */
  positionalDestination?: string;
}

/** An output that could not be explained, described for the error message. */
export interface UnexplainedOutput {
  index: number;
  /** Decoded address, or null when the script could not be attributed. */
  address: string | null;
  value: number;
}

export interface OutputPolicyResult {
  ok: boolean;
  error?: string;
  unexplained: UnexplainedOutput[];
}

/**
 * A quantity from the request, as an exact sat amount to hold an output to — or undefined when it
 * cannot be read that way, which leaves the amount unpinned rather than pinning a wrong one.
 * Quantities reach here already in base units, normalized before the request was composed.
 */
export function pinnedQuantity(quantity: unknown): number | undefined {
  const value = toSafeInteger(quantity);
  return value !== undefined && value > 0 ? value : undefined;
}

/** Addresses a request names as recipients, split from the singular or plural field. */
function requestedDestinations(params: Record<string, unknown>): string[] {
  const plural = typeof params.destinations === 'string' ? params.destinations : '';
  if (plural) return plural.split(',').map(entry => entry.trim()).filter(Boolean);
  return typeof params.destination === 'string' && params.destination ? [params.destination] : [];
}

/** The `more_outputs` entries paying `address`, as sat amounts. `more_outputs` is "sats:address". */
function attachedBtcTo(params: Record<string, unknown>, address: string): number[] {
  if (typeof params.more_outputs !== 'string' || !params.more_outputs) return [];
  const wanted = normalizeAddressForComparison(address);

  return params.more_outputs.split(',').flatMap(entry => {
    const [sats, paid] = entry.split(':');
    if (!sats || !paid || normalizeAddressForComparison(paid.trim()) !== wanted) return [];
    const value = toSafeInteger(sats.trim());
    return value !== undefined && value >= 0 ? [value] : [];
  });
}

/**
 * The outputs whose BTC amount the request determines, rather than the composer.
 *
 * Two shapes. Where the request states an amount for an output that has to exist, that amount is the
 * substance of the transaction: a dispense pays the dispenser in BTC and gets back whatever that
 * buys, while its message is a bare marker byte, and a BTC send carries no message at all.
 *
 * Where the recipient travels inside the payload instead — an enhanced send, a sweep, an MPMA — core
 * returns no destination outputs at all (`mpma.compose` returns `(source, [], data)`), so the only
 * BTC that belongs there is what the user attached through `more_outputs`, and none when they
 * attached nothing. Pinning it to zero is what stops a composer routing the change to the recipient:
 * naming an address is not agreeing to an amount, and the payload the byte-equality check compares
 * says nothing about BTC.
 *
 * An address the signer also owns is skipped: its change is indistinguishable from a payment, so a
 * pin there would reject a send to yourself.
 */
export function pinnedDestinations(
  composeType: string,
  params: Record<string, unknown>,
  ownAddresses: readonly string[] = []
): IntendedDestination[] {
  const stated = composeType === 'dispense' ? params.dispenser
    : composeType === 'send' && params.asset === 'BTC' ? params.destination
    : null;
  if (typeof stated === 'string' && stated) {
    const value = pinnedQuantity(params.quantity);
    return value === undefined ? [] : [{ address: stated, value }];
  }

  const carriesDestinationInPayload = composeType === 'sweep' || composeType === 'mpma'
    || (composeType === 'send' && params.asset !== 'BTC');
  if (!carriesDestinationInPayload) return [];

  const own = new Set(ownAddresses.map(normalizeAddressForComparison));

  return requestedDestinations(params).flatMap(address => {
    if (own.has(normalizeAddressForComparison(address))) return [];
    const attached = attachedBtcTo(params, address);
    // One pin per attached output, so several to one address stay individually accounted for.
    return attached.length > 0
      ? attached.map(value => ({ address, value }))
      : [{ address, value: 0 }];
  });
}

/**
 * Replace every entry for a pinned address with the pins themselves.
 *
 * Callers name addresses generously — `more_outputs` is "sats:address", so its recipient is listed
 * both as the destination and again from that field — and each entry explains one output. Leaving
 * the duplicates alongside a pin would let a second, unpinned output through on the same address.
 */
export function withPinnedDestinations(
  named: readonly IntendedDestination[],
  pins: readonly IntendedDestination[]
): IntendedDestination[] {
  const pinned = new Set(pins.map(pin => normalizeAddressForComparison(pin.address)));
  return [
    ...named.filter(entry => !pinned.has(normalizeAddressForComparison(entry.address))),
    ...pins,
  ];
}

/** Whether an output carries message bytes rather than value. */
function isDataOutput(script: Uint8Array, scriptHex: string): boolean {
  return script[0] === 0x6a || isBareMultisigDataOutput(scriptHex);
}

/**
 * Some messages name no destination: the node joins every non-data output ahead of the first data
 * output — `destinations = "-".join(destinations)` in `parser/gettxinfo.py` — and an issuance then
 * assigns `issuer = tx["destination"]`. A second output in front therefore changes the recipient to
 * `"addressA-addressB"`, which nobody holds a key to, destroying an ownership transfer rather than
 * misdirecting it. Byte equality cannot see it (the message carries no destination) and accounting
 * cannot either (each output is individually explainable), so position is checked here.
 *
 * Core emits destinations, then data, then `more_outputs`, then change (`api/composer.py`), so every
 * honest compose puts the destination alone in front — and `more_outputs` entries, sitting behind
 * the data output, are correctly not counted as destinations.
 *
 * @returns An error message, or null when the arrangement is right.
 */
function checkPositionalDestination(tx: Transaction, expected: string): string | null {
  const preceding: Array<{ address: string | null; value: number }> = [];
  let foundDataOutput = false;

  for (let index = 0; index < tx.outputsLength; index += 1) {
    const output = tx.getOutput(index);
    const script = output?.script;
    if (!script) continue;
    const scriptHex = bytesToHex(script);
    // Everything before the *first* data output is what the node reads as the destination.
    if (isDataOutput(script, scriptHex)) {
      foundDataOutput = true;
      break;
    }
    preceding.push({
      address: decodeAddressFromScript(scriptHex),
      value: toSafeInteger(output?.amount ?? 0n) ?? 0,
    });
  }

  // A taproot-encoded message lives in a commit output's envelope rather than an OP_RETURN, so
  // there is no boundary to be positioned against and every output would read as preceding. The
  // envelope is verified in its own right (`inscriptionEnvelope.ts`).
  if (!foundDataOutput) return null;

  const wanted = normalizeAddressForComparison(expected);

  if (preceding.length === 1 && preceding[0]!.address
    && normalizeAddressForComparison(preceding[0]!.address) === wanted) {
    return null;
  }

  if (preceding.length === 0) {
    // Read as no destination at all, which for an issuance means the transfer silently does not
    // happen — the issuer stays put — while the wallet shows a transfer.
    return `This transaction does not pay ${expected} ahead of its data output, so the network `
      + 'would not read it as the recipient. It was not accepted.';
  }

  const describe = preceding
    .map(({ address, value }) => `${value} sats to ${address ?? 'an undecodable script'}`)
    .join('; ');

  return 'This transaction puts more than one output ahead of its data output '
    + `(${describe}), so the network would join them into a single recipient that nobody controls `
    + `rather than paying ${expected}. It was not accepted.`;
}

/**
 * Verify that every output of a composed transaction is accounted for.
 *
 * @returns ok:false with the unexplained outputs listed, or ok:true when all are explained.
 */
export function checkOutputPolicy(input: OutputPolicyInput): OutputPolicyResult {
  let tx: Transaction;
  try {
    tx = Transaction.fromRaw(hexToBytes(input.rawTransaction), {
      allowUnknownInputs: true,
      allowUnknownOutputs: true,
      allowLegacyWitnessUtxo: true,
      disableScriptCheck: true,
    });
  } catch {
    // An unparseable transaction cannot be signed either — the signer uses the same parser — so it
    // is not a value-routing risk. Let signing surface the real error.
    return { ok: true, unexplained: [] };
  }

  const own = new Set(input.ownAddresses.map(normalizeAddressForComparison));
  // Each intended destination is consumed once, so a response cannot pay the same recipient twice
  // by claiming both outputs match a single requested one.
  const remaining = input.intendedDestinations.map((destination) => ({
    address: normalizeAddressForComparison(destination.address),
    value: destination.value,
  }));

  const unexplained: UnexplainedOutput[] = [];

  for (let index = 0; index < tx.outputsLength; index += 1) {
    const output = tx.getOutput(index);
    const script = output?.script;
    const value = toSafeInteger(output?.amount ?? 0n) ?? 0;
    if (!script) {
      unexplained.push({ index, address: null, value });
      continue;
    }

    const scriptHex = bytesToHex(script);

    // Data outputs carry the Counterparty message, not value.
    if (isDataOutput(script, scriptHex)) continue;

    const address = decodeAddressFromScript(scriptHex);
    if (!address) {
      // A script we cannot attribute might pay anyone, so it cannot be explained.
      unexplained.push({ index, address: null, value });
      continue;
    }

    const normalized = normalizeAddressForComparison(address);

    const matchIndex = remaining.findIndex((destination) => destination.address === normalized);
    if (matchIndex !== -1) {
      const intended = remaining[matchIndex]!;
      // A pinned value must match exactly; an unpinned one lets the composer choose (dust).
      if (intended.value !== undefined && intended.value !== value) {
        unexplained.push({ index, address, value });
      }
      remaining.splice(matchIndex, 1);
      continue;
    }

    if (own.has(normalized)) continue; // change

    unexplained.push({ index, address, value });
  }

  if (unexplained.length === 0) {
    // Every output is accounted for; the remaining question is whether the one the node reads as
    // the recipient is in the place it has to be.
    if (input.positionalDestination) {
      const positionError = checkPositionalDestination(tx, input.positionalDestination);
      if (positionError) return { ok: false, unexplained: [], error: positionError };
    }
    return { ok: true, unexplained: [] };
  }

  const describe = ({ address, value }: UnexplainedOutput) =>
    `${value} sats to ${address ?? 'an address that could not be decoded'}`;

  return {
    ok: false,
    unexplained,
    error: `This transaction pays ${unexplained.length === 1 ? 'an output' : 'outputs'} your request `
      + `does not account for (${unexplained.map(describe).join('; ')}), so it was not accepted.`,
  };
}
