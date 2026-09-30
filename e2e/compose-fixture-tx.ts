/**
 * Builds the raw transaction the compose mock returns.
 *
 * The composer verifies what it is about to sign: it rebuilds the message the request should have
 * produced and requires the transaction's own bytes to carry exactly that (`composer-context.tsx`,
 * and `unpack/verify.ts`). A placeholder rawtransaction therefore fails verification for every compose type that
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

import { Address, OutScript, p2tr, TaprootControlBlock, Transaction } from '@scure/btc-signer';
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
  /**
   * Present for a Taproot-encoded compose, as Counterparty Core 11.5 returns it: the data envelope
   * closed by the source's key, and the unsigned reveal spending the commit with what signing it
   * needs. The wallet signs the reveal with the source key.
   */
  envelope_script?: string;
  reveal_rawtransaction?: string;
  reveal_control_block?: string;
  reveal_pubkey?: string;
  reveal_lock_scripts?: string[];
  reveal_inputs_values?: number[];
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
  if (url.searchParams.get('encoding') === 'taproot') {
    return composeTaprootFixture(source, input, packed.bytes, Number(url.searchParams.get('sat_per_vbyte') ?? '1'),
      url.searchParams.get('multisig_pubkey'));
  }

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

const CNTRPRTY_HEX = '434e545250525459';

/** python-bitcoin-utils' push encoding, which core's envelope uses (bounds are exclusive). */
function push(data: Uint8Array): string {
  const hex = bytesToHex(data);
  if (data.length < 0x4c) return data.length.toString(16).padStart(2, '0') + hex;
  if (data.length < 0xff) return '4c' + data.length.toString(16).padStart(2, '0') + hex;
  return '4d' + (data.length & 0xff).toString(16).padStart(2, '0') + (data.length >> 8).toString(16).padStart(2, '0') + hex;
}

function reverseHex(hex: string): string {
  return hex.match(/../g)!.reverse().join('');
}

/**
 * A Taproot compose the way Core 11.5 builds one (`prepare_taproot_output`): the message without
 * its prefix in a plain data envelope closed by the source's key (`multisig_pubkey`, or a P2TR
 * source's output key when none was sent), a commit whose output 0 pays `P2TR(key, [envelope])`
 * with the reveal's fee, and an unsigned reveal spending it to the bare CNTRPRTY marker alone.
 */
function composeTaprootFixture(
  source: string,
  input: { txid: string; vout: number },
  packed: Uint8Array,
  feeRate: number,
  sourcePubkey: string | null,
): FixtureTransaction {
  const sourceScript = scriptForAddress(source);
  const revealKey = sourcePubkey
    ? hexToBytes(sourcePubkey).slice(1, 33)
    : sourceScript[0] === 0x51 ? sourceScript.slice(2, 34) : null;
  if (!revealKey) throw new Error('No source key to close the envelope with');

  const message = packed.slice(8);
  let chunks = '';
  for (let i = 0; i < message.length; i += 520) chunks += push(message.slice(i, i + 520));
  const envelope = `0063${chunks}68${push(revealKey)}ac`;
  const payment = p2tr(revealKey, { script: hexToBytes(envelope) }, undefined, true);
  const controlBlock = bytesToHex(TaprootControlBlock.encode(payment.tapLeafScript![0]![0]));

  const reveal = (commitTxid: string) => '02000000' + '01' + reverseHex(commitTxid) + '00000000' + '00' + 'ffffffff'
    + '01' + '0000000000000000' + `0a6a08${CNTRPRTY_HEX}` + '00000000';
  // Sized as core sizes it: with the witness, the signature counted as 65 bytes.
  const sized = Transaction.fromRaw(hexToBytes(reveal('00'.repeat(32))), {
    allowUnknownInputs: true, allowUnknownOutputs: true, disableScriptCheck: true,
  });
  sized.updateInput(0, { finalScriptWitness: [new Uint8Array(65), hexToBytes(envelope), hexToBytes(controlBlock)] }, true);
  const commitValue = Math.max(330, Math.ceil(sized.vsize * feeRate));

  const tx = new Transaction({ allowUnknownOutputs: true, disableScriptCheck: true });
  tx.addInput({ txid: hexToBytes(input.txid), index: input.vout });
  tx.addOutput({ script: payment.script, amount: BigInt(commitValue) });
  const change = INPUT_VALUE - commitValue - FIXTURE_FEE;
  tx.addOutput({ script: sourceScript, amount: BigInt(change) });

  return {
    rawtransaction: bytesToHex(tx.toBytes(true, false)),
    envelope_script: envelope,
    reveal_rawtransaction: reveal(tx.id),
    reveal_control_block: controlBlock,
    reveal_pubkey: bytesToHex(revealKey),
    reveal_lock_scripts: [bytesToHex(payment.script)],
    reveal_inputs_values: [commitValue],
    data: bytesToHex(packed),
    btc_in: INPUT_VALUE,
    btc_out: commitValue,
    btc_change: change,
    btc_fee: FIXTURE_FEE,
  };
}

/** The prevout value the fixture's input must resolve to, for mocking the lookup. */
export const FIXTURE_INPUT_VALUE = INPUT_VALUE;
