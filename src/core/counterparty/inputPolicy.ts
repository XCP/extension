/**
 * Accounting over a composed transaction's *inputs*, the counterpart to `outputPolicy.ts`.
 *
 * When this wallet picks the UTXOs to spend it sends them as `inputs_set`, and the composer is
 * expected to build from exactly those. Nothing checked that it did. Output accounting cannot cover
 * it: an input the request never offered still pays its value to explainable outputs, so every
 * existing check passes while the transaction spends a UTXO the wallet ruled out — one carrying an
 * attached asset balance, say, which `selectUtxosForTransaction` excludes on purpose and which the
 * compose path never looks up again.
 *
 * This only speaks to a set the wallet actually named. Where none was sent the composer chose
 * freely, and there is nothing to compare against — see `checkInputPolicy`.
 */

import { Transaction } from '@scure/btc-signer';
import { bytesToHex, hexToBytes } from '@/core/counterparty/unpack/binary';

export interface InputPolicyInput {
  rawTransaction: string;
  /**
   * The `inputs_set` sent with the compose request — `"txid:vout,txid:vout"` — or undefined when
   * the request named none.
   */
  offeredInputs: string | undefined;
}

export interface InputPolicyResult {
  ok: boolean;
  error?: string;
  /** Outpoints the transaction spends that the request never offered. */
  unoffered: string[];
}

/** `txid:vout`, lowercased, as both sides of the comparison are written. */
function outpointsOf(tx: Transaction): string[] {
  const outpoints: string[] = [];
  for (let index = 0; index < tx.inputsLength; index += 1) {
    const input = tx.getInput(index);
    if (!input?.txid) continue;
    outpoints.push(`${bytesToHex(input.txid).toLowerCase()}:${input.index ?? 0}`);
  }
  return outpoints;
}

/**
 * Verify that a composed transaction spends only UTXOs the request offered.
 *
 * @returns ok:true when every input was offered, or when the request offered no set at all.
 */
export function checkInputPolicy(input: InputPolicyInput): InputPolicyResult {
  // Nothing was named, so the composer's choice cannot be measured against anything. The retry
  // ladder in `compose.ts` reaches this state deliberately when a selection is rejected.
  if (!input.offeredInputs) return { ok: true, unoffered: [] };

  const offered = new Set(
    input.offeredInputs.split(',').map(entry => entry.trim().toLowerCase()).filter(Boolean)
  );
  if (offered.size === 0) return { ok: true, unoffered: [] };

  let tx: Transaction;
  try {
    tx = Transaction.fromRaw(hexToBytes(input.rawTransaction), {
      allowUnknownInputs: true,
      allowUnknownOutputs: true,
      allowLegacyWitnessUtxo: true,
      disableScriptCheck: true,
    });
  } catch {
    // Signing parses the same bytes and will fail there instead; see `checkOutputPolicy`.
    return { ok: true, unoffered: [] };
  }

  const unoffered = outpointsOf(tx).filter(outpoint => !offered.has(outpoint));
  if (unoffered.length === 0) return { ok: true, unoffered: [] };

  return {
    ok: false,
    unoffered,
    error: `This transaction spends ${unoffered.length === 1 ? 'a coin' : 'coins'} your wallet did `
      + `not offer to it (${unoffered.join('; ')}), so it was not accepted.`,
  };
}
