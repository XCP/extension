/**
 * Local, structural extraction of a Counterparty OP_RETURN payload from a raw
 * Bitcoin transaction — no remote decode call.
 *
 * Counterparty currently ARC4-obfuscates the OP_RETURN data with the first
 * input's txid as the key. A future protocol version may emit the payload in
 * the clear, so extraction tries the plaintext form first and falls back to
 * ARC4 decryption — working across both without a flag.
 */

import { Transaction } from '@scure/btc-signer';
import { arc4, hexToBytes, bytesToHex } from './binary';
import { COUNTERPARTY_PREFIX_HEX } from './messageTypes';

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
 * Extract the Counterparty message payload from a raw transaction hex by
 * parsing its structure locally: locate the OP_RETURN output and the first
 * input's txid, then resolve the payload as plaintext (future protocol) or
 * ARC4-obfuscated (current protocol).
 *
 * @param rawTxHex - Raw (unsigned or signed) transaction hex
 * @returns Counterparty datahex with the CNTRPRTY prefix, or null if the
 *          transaction carries no recognizable Counterparty OP_RETURN
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

  for (let i = 0; i < tx.outputsLength; i++) {
    const script = tx.getOutput(i)?.script;
    if (!script || script[0] !== 0x6a) continue;
    const scriptHex = bytesToHex(script);

    // Plaintext first (future protocol), then ARC4 (current protocol)
    const payload = extractOpReturnPayload(scriptHex);
    if (payload?.startsWith(COUNTERPARTY_PREFIX_HEX)) return payload;

    const decrypted = decryptOpReturnData(scriptHex, firstInputTxid);
    if (decrypted) return decrypted;
  }

  return null;
}
