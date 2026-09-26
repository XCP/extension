/**
 * Payments to script addresses the wallet does not control can carry risk for an address that
 * holds Counterparty assets.
 *
 * Which addresses: anything that commits to a script (P2TR, P2WSH, P2SH, which may wrap P2WSH) and
 * any other witness program. Key-hash outputs (P2PKH, P2WPKH) never count.
 *
 * Pure: the caller decides whether the payer holds anything worth warning about. This is shared
 * by the provider approval and, separately, the wallet's own send flow.
 */

import { hexToBytes } from '@noble/hashes/utils.js';
import { normalizeAddressForComparison } from '@/core/bitcoin/address';

/** Whether this output script is a script address in the sense above: script hash or witness program. */
export function isScriptAddressOutput(scriptHex: string | undefined): boolean {
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
  // P2WPKH is a key hash.
  return !(version === 0x00 && length === 20);
}

interface PaymentOutput {
  value: number;
  address?: string;
  script?: string;
  type?: string;
}

export interface ScriptPaymentRisk {
  totalSats: number;
  /** The script addresses paid, in output order. */
  addresses: string[];
  /** The paying address the caution names. */
  source: string;
}

export interface ScriptPaymentInput {
  outputs: PaymentOutput[];
  /** The paying address, as the caller determines it; only this wallet's is considered. */
  payerAddress: string | undefined;
  /** Addresses this wallet owns: change to them is not a payment. */
  ownedAddresses: string[];
  /** Outputs already proved to commit to a known script (a verified commit, a rebuilt leaf). */
  provenAddresses?: string[];
}

/**
 * The outputs that pay someone else's script address, when the payer is this wallet.
 * Empty when there is nothing to ask about, so a caller need not look up the payer's holdings.
 */
export function scriptPaymentCandidates(input: ScriptPaymentInput): { address: string; value: number }[] {
  const owned = new Set(input.ownedAddresses.map(normalizeAddressForComparison));
  const payer = input.payerAddress;
  if (!payer || !owned.has(normalizeAddressForComparison(payer))) return [];
  const proven = new Set((input.provenAddresses ?? []).map(normalizeAddressForComparison));
  return input.outputs.flatMap((output) => {
    if (output.type === 'op_return' || !output.address) return [];
    const normalized = normalizeAddressForComparison(output.address);
    if (owned.has(normalized) || proven.has(normalized) || !isScriptAddressOutput(output.script)) return [];
    return [{ address: output.address, value: output.value }];
  });
}

/**
 * The risk to state, or null. `holdsCounterpartyAssets` is the caller's answer for the payer —
 * true when it could not be established, since an unknown holding is not an empty one.
 */
export function scriptPaymentRisk(
  input: ScriptPaymentInput,
  holdsCounterpartyAssets: boolean,
): ScriptPaymentRisk | null {
  if (!holdsCounterpartyAssets) return null;
  const candidates = scriptPaymentCandidates(input);
  if (candidates.length === 0) return null;
  return {
    totalSats: candidates.reduce((sum, candidate) => sum + candidate.value, 0),
    addresses: candidates.map((candidate) => candidate.address),
    source: input.payerAddress!,
  };
}
