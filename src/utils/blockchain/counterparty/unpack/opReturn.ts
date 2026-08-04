/**
 * Local, structural extraction of a Counterparty OP_RETURN payload from a raw
 * Bitcoin transaction, with no remote decode call.
 *
 * Counterparty ARC4-obfuscates the OP_RETURN data with the first input's txid as
 * the key. Extraction always ARC4-decrypts, matching counterparty-core exactly:
 * core never reads a plaintext CNTRPRTY OP_RETURN, so neither may we. Reading one
 * would let a plaintext decoy shadow a multisig-encoded message the node parses
 * instead — see extractPayloadFromOutputs.
 */

import { Transaction } from '@scure/btc-signer';
import { arc4, bytesToHex, hexToBytes } from '@/utils/blockchain/counterparty/unpack/binary';
import { COUNTERPARTY_PREFIX_HEX } from '@/utils/blockchain/counterparty/unpack/messageTypes';
import { extractMultisigPayload } from '@/utils/blockchain/counterparty/unpack/multisig';

/**
 * Strip the OP_RETURN opcode (0x6a) and push-data length prefix from an
 * OP_RETURN scriptPubKey, returning the data payload hex.
 *
 * @param scriptPubKeyHex - Full scriptPubKey hex (e.g. "6a2e...")
 * @returns Data payload hex, or null if not a valid OP_RETURN
 */
export function extractOpReturnPayload(scriptPubKeyHex: string): string | null {
  try {
    const bytes = hexToBytes(scriptPubKeyHex);
    if (bytes.length < 2 || bytes[0] !== 0x6a) return null;

    let offset = 1;
    let dataLength: number;

    const pushByte = bytes[offset]!;
    if (pushByte <= 0x4b) {
      // Direct push (1-75 bytes)
      dataLength = pushByte;
      offset += 1;
    } else if (pushByte === 0x4c) {
      // OP_PUSHDATA1
      if (bytes.length < 3) return null;
      dataLength = bytes[offset + 1]!;
      offset += 2;
    } else if (pushByte === 0x4d) {
      // OP_PUSHDATA2
      if (bytes.length < 4) return null;
      dataLength = bytes[offset + 1]! | (bytes[offset + 2]! << 8);
      offset += 3;
    } else {
      return null;
    }

    if (offset + dataLength > bytes.length) return null;
    return bytesToHex(bytes.slice(offset, offset + dataLength));
  } catch {
    return null;
  }
}

/**
 * ARC4-decrypt an OP_RETURN payload using the first input's txid as the key.
 * Returns the decrypted datahex (including the CNTRPRTY prefix) if it decrypts
 * to Counterparty data, or null.
 *
 * @param scriptPubKeyHex - Full OP_RETURN scriptPubKey hex
 * @param firstInputTxid - First input txid in display (big-endian) order
 */
export function decryptOpReturnData(
  scriptPubKeyHex: string,
  firstInputTxid: string
): string | null {
  const payload = extractOpReturnPayload(scriptPubKeyHex);
  if (!payload) return null;

  try {
    const decryptedHex = bytesToHex(arc4(hexToBytes(firstInputTxid), hexToBytes(payload)));
    return decryptedHex.startsWith(COUNTERPARTY_PREFIX_HEX) ? decryptedHex : null;
  } catch {
    return null;
  }
}

/**
 * Resolve a Counterparty payload from a transaction's output scripts: from an ARC4-obfuscated
 * OP_RETURN output, or from bare-multisig data outputs. The single home for that encoding order,
 * so every caller (composer verification and both dapp sign-request paths) recognizes exactly the
 * same payloads counterparty-core would.
 *
 * OP_RETURN is only ever ARC4-decrypted — never read as plaintext. Core does the same, so a
 * plaintext CNTRPRTY OP_RETURN is garbage to the node, which then parses a multisig-encoded
 * message instead. Honoring the plaintext form here would let an attacker pair a benign plaintext
 * decoy with a real multisig sweep: the wallet would surface and bless the decoy while the network
 * executed the sweep. Decrypting first, exactly as core does, keeps the two in agreement.
 *
 * A null return is read as "no Counterparty data" and skips verification, so every encoding that
 * can carry a message has to be looked for here.
 *
 * @param outputScriptHexes - All output scriptPubKey hexes, in output order
 * @param firstInputTxid - First input txid in display (big-endian) order
 * @returns Counterparty datahex with the CNTRPRTY prefix, or null if the
 *          outputs carry no recognizable Counterparty payload
 */
export function extractPayloadFromOutputs(
  outputScriptHexes: readonly string[],
  firstInputTxid: string
): string | null {
  for (const scriptHex of outputScriptHexes) {
    // decryptOpReturnData returns null for non-OP_RETURN outputs and for anything that does not
    // ARC4-decrypt to the CNTRPRTY prefix, so a plaintext decoy is correctly ignored.
    const decrypted = decryptOpReturnData(scriptHex, firstInputTxid);
    if (decrypted) return decrypted;
  }

  // The message may instead be spread across bare-multisig outputs, which carry no OP_RETURN.
  return extractMultisigPayload(outputScriptHexes, firstInputTxid);
}

/**
 * Extract the Counterparty message payload from a raw transaction hex by
 * parsing its structure locally: locate the first input's txid and hand the
 * output scripts to `extractPayloadFromOutputs`.
 *
 * @param rawTxHex - Raw (unsigned or signed) transaction hex
 * @returns Counterparty datahex with the CNTRPRTY prefix, or null if the
 *          transaction carries no recognizable Counterparty payload
 */
export function extractCounterpartyPayload(rawTxHex: string): string | null {
  let tx: Transaction;
  try {
    tx = Transaction.fromRaw(hexToBytes(rawTxHex), {
      allowUnknownInputs: true,
      allowUnknownOutputs: true,
      allowLegacyWitnessUtxo: true,
      disableScriptCheck: true,
    });
  } catch {
    return null;
  }

  if (tx.inputsLength === 0) return null;

  // ARC4 key is the first input's txid in display (big-endian) order, which is
  // exactly what @scure/btc-signer exposes on a parsed input.
  const firstInput = tx.getInput(0);
  if (!firstInput?.txid) return null;
  const firstInputTxid = bytesToHex(firstInput.txid);

  const outputScriptHexes: string[] = [];
  for (let i = 0; i < tx.outputsLength; i++) {
    const script = tx.getOutput(i)?.script;
    outputScriptHexes.push(script ? bytesToHex(script) : '');
  }

  return extractPayloadFromOutputs(outputScriptHexes, firstInputTxid);
}
