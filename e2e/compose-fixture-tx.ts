/**
 * Builds the raw transaction the compose mock returns.
 *
 * The composer verifies what it is about to sign: it rebuilds the message the request should have
 * produced and requires the transaction's own bytes to carry exactly that (`composer-context.tsx`,
 * ADR-019). A placeholder rawtransaction therefore fails verification for every compose type that
 * can pack a message — correctly, because a placeholder really does carry no message.
 *
 * So the mock composes for real: it packs the message with the same code the extension uses,
 * ARC4-obfuscates it against the first input's txid the way counterparty-core does, and emits an
 * OP_RETURN plus the outputs the request implies. The verification then runs in full against the
 * fixture, which is the point — a test that bypassed it would prove nothing about the code whose
 * whole job is refusing bad transactions.
 *
 * Types that legitimately pack no message (a BTC send, a subasset whose id only the server can
 * draw) return null here and keep the placeholder, which is what the composer already tolerates.
 */

import { Address, OutScript, Transaction } from '@scure/btc-signer';
import { packComposeMessage } from '../src/core/counterparty/pack/messages';
import { arc4, bytesToHex, hexToBytes } from '../src/core/counterparty/unpack/binary';

/** Value of the single input the fixture spends. Matches the mock's long-standing `btc_in`. */
const INPUT_VALUE = 174891;
/** Fee the fixture pays. Small enough to sit under the fee bound at any rate a test would pick. */
const FIXTURE_FEE = 669;
/** Value of a destination output the message does not itself carry. */
const DUST = 546;

/**
 * The outpoint spent when the request offered no `inputs_set`. Any txid works — it is the ARC4 key
 * and nothing more — but it must be a plausible 32-byte hash so the prevout lookup can be mocked.
 */
const FALLBACK_TXID = '4c9c1a12ebe071ea2abc3ec6a7ba380904485bdb9b0075de40cfcf1ac4b6dd4c';
const FALLBACK_VOUT = 1;

export interface FixtureTransaction {
  rawtransaction: string;
  /** The unobfuscated payload, as the API reports it in `data`. */
  data: string;
  btc_in: number;
  btc_out: number;
  btc_change: number;
  btc_fee: number;
}

/** Params the packers read as booleans rather than as the strings a query string carries. */
const BOOLEAN_PARAMS = new Set([
  'divisible',
  'lock',
  'reset',
  'memo_is_hex',
  'memos_are_hex',
  'no_dispense',
  'use_enhanced_send',
  'lock_description',
  'lock_quantity',
  'soft_cap_deadline_block',
]);

/**
 * Rebuild the packer's view of the request from the compose URL.
 *
 * The query string is built straight from the normalized form data (`composeTransaction`), so the
 * field names already line up; only the types need restoring, since a query string carries
 * everything as text and the packers distinguish a boolean from the string "false".
 */
function packParamsFromUrl(url: URL): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  for (const [key, value] of url.searchParams) {
    params[key] = BOOLEAN_PARAMS.has(key) ? value === 'true' : value;
  }
  return params;
}

/** An OP_RETURN carrying `data`, using OP_PUSHDATA1 once a direct push can no longer hold it. */
function opReturnScript(data: Uint8Array): Uint8Array {
  const prefix = data.length <= 75 ? [0x6a, data.length] : [0x6a, 0x4c, data.length];
  return new Uint8Array([...prefix, ...data]);
}

function scriptForAddress(address: string): Uint8Array {
  const decoded = Address().decode(address);
  if (!decoded) throw new Error(`fixture: cannot build an output script for ${address}`);
  return OutScript.encode(decoded);
}

/**
 * The outpoint the fixture spends. Taken from `inputs_set` when the request offered one, because
 * the composer rejects a transaction that spends a coin the wallet did not offer
 * (`checkInputPolicy`) — the mock has to respect the same rule a real composer does.
 */
function firstOfferedInput(url: URL): { txid: string; vout: number } {
  const offered = url.searchParams.get('inputs_set');
  const first = offered?.split(',')[0]?.trim();
  const [txid, vout] = first ? first.split(':') : [];
  if (txid && txid.length === 64 && vout !== undefined) {
    return { txid: txid.toLowerCase(), vout: Number(vout) };
  }
  return { txid: FALLBACK_TXID, vout: FALLBACK_VOUT };
}

/**
 * Compose a fixture transaction that really carries `composeType`'s message, or null when this
 * request packs no message and the placeholder remains appropriate.
 *
 * @param composeType - Compose endpoint name, e.g. 'issuance'
 * @param requestUrl - The intercepted compose URL, whose path names the source address
 */
export function buildFixtureTransaction(
  composeType: string,
  requestUrl: string
): FixtureTransaction | null {
  try {
    return composeFixture(composeType, requestUrl);
  } catch {
    // A request this helper cannot build for — an address it cannot decode, a quantity that does
    // not fit — keeps the placeholder, exactly as an unpackable type does. Tests that reach the
    // review page will fail on the missing message, which is the honest outcome: the fixture was
    // not built, rather than the verification being waved through.
    return null;
  }
}

function composeFixture(composeType: string, requestUrl: string): FixtureTransaction | null {
  const url = new URL(requestUrl);
  const sourceMatch = url.pathname.match(/\/addresses\/([^/]+)\/compose\//);
  const source = sourceMatch?.[1];
  if (!source) return null;

  const packed = packComposeMessage(composeType, packParamsFromUrl(url));
  if (!packed) return null;

  const input = firstOfferedInput(url);

  // Counterparty keys the stream with the first input's txid in display order, which is the order
  // @scure/btc-signer both accepts and returns (`unpack/opReturn.ts`).
  const obfuscated = arc4(hexToBytes(input.txid), packed.bytes);

  const tx = new Transaction({ allowUnknownOutputs: true, disableScriptCheck: true });
  tx.addInput({ txid: hexToBytes(input.txid), index: input.vout });

  // An ownership transfer names its new owner nowhere in the message: core writes it to the output
  // immediately ahead of the data output, and the composer checks that position specifically.
  let paidOut = 0;
  const transferDestination = url.searchParams.get('transfer_destination');
  if (composeType === 'issuance' && transferDestination) {
    tx.addOutput({ script: scriptForAddress(transferDestination), amount: BigInt(DUST) });
    paidOut += DUST;
  }

  tx.addOutput({ script: opReturnScript(obfuscated), amount: 0n });

  const change = INPUT_VALUE - paidOut - FIXTURE_FEE;
  tx.addOutput({ script: scriptForAddress(source), amount: BigInt(change) });

  return {
    rawtransaction: bytesToHex(tx.toBytes(true, false)),
    data: bytesToHex(packed.bytes),
    btc_in: INPUT_VALUE,
    btc_out: paidOut,
    btc_change: change,
    btc_fee: FIXTURE_FEE,
  };
}

/** The prevout value the fixture's input must resolve to, for mocking the lookup. */
export const FIXTURE_INPUT_VALUE = INPUT_VALUE;
