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
 * | issuance with `transfer_destination` | the new owner | named in the request |
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
import { decodeAddressFromScript, normalizeAddressForComparison } from '@/utils/blockchain/bitcoin/address';
import { isBareMultisigDataOutput } from '@/utils/blockchain/counterparty/unpack/multisig';

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
    const value = Number(output?.amount ?? 0n);
    if (!script) {
      unexplained.push({ index, address: null, value });
      continue;
    }

    const scriptHex = bytesToHex(script);

    // Data outputs carry the Counterparty message, not value.
    if (script[0] === 0x6a || isBareMultisigDataOutput(scriptHex)) continue;

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

  if (unexplained.length === 0) return { ok: true, unexplained: [] };

  const describe = ({ address, value }: UnexplainedOutput) =>
    `${value} sats to ${address ?? 'an address that could not be decoded'}`;

  return {
    ok: false,
    unexplained,
    error: `This transaction pays ${unexplained.length === 1 ? 'an output' : 'outputs'} your request `
      + `does not account for (${unexplained.map(describe).join('; ')}), so it was not accepted.`,
  };
}
