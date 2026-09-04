/**
 * Which outputs of our own broadcast may be registered as spendable change.
 *
 * The wallet does not need mempool.space to tell it about its own change — it built the
 * transaction. Registering outputs that pay our own addresses lets the very next compose chain
 * off them instantly, closing the seconds-wide window where an address whose only UTXO was just
 * spent has nothing to compose with.
 *
 * The judgment this module owns: not every output paying ourselves is BTC change. An `attach`
 * binds a Counterparty asset to an output of the SAME transaction — usually one paying our own
 * address — and a `move` carries an attachment to its destination output. The Counterparty API
 * cannot warn the next compose off those yet (its lag is the whole reason this exists), so
 * registering them as plain BTC would let that compose spend an asset-bearing output and burn the
 * attachment. Those message types register nothing.
 *
 * A payload that is present but unreadable also registers nothing: bytes we cannot classify might
 * be an attach, and the cost of skipping is only that chaining waits the few seconds it always
 * used to.
 */

import { normalizeAddressForComparison } from '@/core/bitcoin/address';
import { parseRawTransactionLocally } from '@/core/bitcoin/localTransactionParse';
import { recordPendingChange } from '@/core/bitcoin/spentUtxoCache';
import { unpackCounterpartyMessage } from '@/core/counterparty/unpack';
import { extractPayloadFromOutputs } from '@/core/counterparty/unpack/opReturn';

/**
 * Message types that put assets on outputs of their own transaction. `utxo` is the legacy
 * combined move/attach id; `attach` is its modern replacement. `detach` lands assets on an
 * address balance, not an output — its outputs really are plain BTC — but it is grouped here
 * because the distinction is subtle enough that being wrong burns an attachment, and the cost of
 * caution is seconds. Names are `MessageTypeName` values (unpack/messageTypes.ts).
 */
const BINDS_ASSETS_TO_OUTPUTS = new Set(['utxo', 'attach', 'detach']);

export interface SafeOwnChangeOutput {
  txid: string;
  vout: number;
  address: string;
  value: number;
  scriptPubKey: string;
}

/**
 * Return only outputs that are both owned by this wallet and safe to treat as plain BTC change.
 *
 * Kept separate from the in-memory compose cache because provider broadcasts happen in the
 * extension background while their next signing approval happens in a popup. Both callers need
 * exactly the same fail-closed classification before sharing an output across that boundary.
 */
export function extractSafeOwnChangeOutputs(
  rawTxHex: string,
  ownAddresses: Iterable<string>
): SafeOwnChangeOutput[] {
  const parsed = parseRawTransactionLocally(rawTxHex);
  if (!parsed || parsed.inputs.length === 0 || !parsed.inputs[0]?.txid) return [];

  const outputScripts = parsed.outputs.map((output) => output.script ?? output.opReturnData ?? '');
  const payload = extractPayloadFromOutputs(outputScripts, parsed.inputs[0].txid);
  if (payload) {
    const unpacked = unpackCounterpartyMessage(payload);
    if (!unpacked.success || !unpacked.messageType) return [];
    if (BINDS_ASSETS_TO_OUTPUTS.has(unpacked.messageType)) return [];
  }

  const own = new Set([...ownAddresses].map(normalizeAddressForComparison));
  return parsed.outputs
    .filter((output) => output.address
      && own.has(normalizeAddressForComparison(output.address))
      && output.value > 0
      && output.script)
    .map((output) => ({
      txid: parsed.txid,
      vout: output.index,
      address: output.address!,
      value: output.value,
      scriptPubKey: output.script!,
    }));
}

/**
 * Register the outputs of a just-broadcast transaction that pay our own addresses.
 *
 * Call only with hex this wallet signed and broadcast — the registration is trusted by UTXO
 * selection precisely because we authored the transaction.
 */
export function recordOwnChangeFromRawTx(
  rawTxHex: string,
  ownAddresses: Iterable<string>
): void {
  const entries = extractSafeOwnChangeOutputs(rawTxHex, ownAddresses);

  if (entries.length > 0) recordPendingChange(entries);
}
