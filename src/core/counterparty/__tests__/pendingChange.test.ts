/**
 * Which outputs of our own broadcast get registered as pending change.
 *
 * The dangerous direction is registering too much: an attach binds an asset to an output paying
 * ourselves, and registering it as plain BTC would let the next compose spend the attachment.
 * These tests build real transactions — ARC4-encrypted OP_RETURN and all, as arc4-roundtrip.test
 * does — so the deny rule is exercised through the same decrypt/unpack pipeline production uses.
 */

import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { Transaction } from '@scure/btc-signer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildDieselMintScript } from '@/core/alkanes/diesel';
import {
  clearPendingDieselUtxos,
  getPendingDieselUtxos,
} from '@/core/alkanes/pendingDieselUtxos';
import { apiClient } from '@/core/api/client';
import { decodeAddressFromScript } from '@/core/bitcoin/address';
import { checkTransactionFee } from '@/core/bitcoin/feeVerification';
import { parseRawTransactionLocally } from '@/core/bitcoin/localTransactionParse';
import {
  clearSpentUtxoCache,
  getPendingChangeUtxos,
} from '@/core/bitcoin/spentUtxoCache';
import { clearBitcoinCaches, fetchPreviousRawTransaction } from '@/core/bitcoin/utxo';
import { recordOwnChangeFromRawTx } from '@/core/counterparty/pendingChange';
import { fetchInputValues } from '@/core/counterparty/transaction';
import { packAddress } from '@/core/counterparty/unpack/address';
import { arc4 } from '@/core/counterparty/unpack/binary';
import { COUNTERPARTY_PREFIX_HEX } from '@/core/counterparty/unpack/messageTypes';

// ARC4 key is the first input's txid in display order.
const FAKE_TXID = 'b5a2c3d4e5f6a7b8b5a2c3d4e5f6a7b8b5a2c3d4e5f6a7b8b5a2c3d4e5f6a7b8';

// Two p2wpkh scripts; the addresses they decode to are whatever the wallet itself would read
// from the outputs, which is exactly what recordOwnChangeFromRawTx matches against.
const OWN_SCRIPT = `0014${'11'.repeat(20)}`;
const OTHER_SCRIPT = `0014${'22'.repeat(20)}`;
const OWN_ADDRESS = decodeAddressFromScript(OWN_SCRIPT)!;

function utf8Hex(text: string): string {
  return bytesToHex(new TextEncoder().encode(text));
}

/** CNTRPRTY prefix + 1-byte type ID + payload, ARC4-encrypted and wrapped in OP_RETURN. */
function encryptedOpReturn(typeId: number, payloadHex: string): string {
  const datahex = COUNTERPARTY_PREFIX_HEX + typeId.toString(16).padStart(2, '0') + payloadHex;
  const encrypted = arc4(hexToBytes(FAKE_TXID), hexToBytes(datahex));
  const lenHex = encrypted.length.toString(16).padStart(2, '0');
  const push = encrypted.length <= 0x4b ? lenHex : `4c${lenHex}`;
  return `6a${push}${bytesToHex(encrypted)}`;
}

/** A finished-enough transaction: one input keying the ARC4, then the given output scripts. */
function buildRawTx(
  outputScriptHexes: string[],
  values: bigint[] = [],
  inputTxid = FAKE_TXID,
): string {
  const tx = new Transaction({ allowUnknownOutputs: true, allowLegacyWitnessUtxo: true });
  tx.addInput({ txid: hexToBytes(inputTxid), index: inputTxid === FAKE_TXID ? 0 : 1 });
  outputScriptHexes.forEach((script, i) => {
    tx.addOutput({ script: hexToBytes(script), amount: values[i] ?? 5000n });
  });
  return bytesToHex(tx.unsignedTx);
}

describe('recordOwnChangeFromRawTx', () => {
  beforeEach(() => {
    clearBitcoinCaches();
    clearSpentUtxoCache();
    clearPendingDieselUtxos();
  });
  afterEach(() => vi.restoreAllMocks());

  it('registers outputs paying own addresses from a plain BTC transaction', () => {
    const raw = buildRawTx([OTHER_SCRIPT, OWN_SCRIPT], [7000n, 5000n]);
    const txid = parseRawTransactionLocally(raw)!.txid;

    recordOwnChangeFromRawTx(raw, [OWN_ADDRESS]);

    expect(getPendingChangeUtxos(OWN_ADDRESS)).toEqual([{ txid, vout: 1, value: 5000 }]);
    // The output paying elsewhere is not ours to spend.
    expect(getPendingChangeUtxos(decodeAddressFromScript(OTHER_SCRIPT)!)).toEqual([]);
  });

  it('registers change from a safe Counterparty type (enhanced send)', () => {
    // asset_id=1 (XCP), quantity=100000000, packed destination — a valid type-2 payload.
    const payload =
      1n.toString(16).padStart(16, '0') +
      100000000n.toString(16).padStart(16, '0') +
      bytesToHex(packAddress('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'));
    const raw = buildRawTx([encryptedOpReturn(2, payload), OWN_SCRIPT], [0n, 5000n]);

    recordOwnChangeFromRawTx(raw, [OWN_ADDRESS]);

    expect(getPendingChangeUtxos(OWN_ADDRESS)).toHaveLength(1);
  });

  it('does not expose outputs from a DIESEL mint as ordinary pending BTC change', () => {
    const raw = buildRawTx(
      [encryptedOpReturn(2, '00'.repeat(52)), OWN_SCRIPT, buildDieselMintScript(1)],
      [0n, 330n, 0n],
    );

    recordOwnChangeFromRawTx(raw, [OWN_ADDRESS]);

    expect(getPendingChangeUtxos(OWN_ADDRESS)).toEqual([]);
    expect(getPendingDieselUtxos(OWN_ADDRESS)).toEqual([{
      txid: parseRawTransactionLocally(raw)!.txid,
      vout: 1,
      address: OWN_ADDRESS,
      value: 330,
      chainDepth: 1,
    }]);
  });

  it('replaces a pending DIESEL tip and increments its unconfirmed chain depth', () => {
    const first = buildRawTx(
      [encryptedOpReturn(2, '00'.repeat(52)), OWN_SCRIPT, buildDieselMintScript(1)],
      [0n, 50_000n, 0n],
    );
    const firstTxid = parseRawTransactionLocally(first)!.txid;
    recordOwnChangeFromRawTx(first, [OWN_ADDRESS]);
    const second = buildRawTx(
      [encryptedOpReturn(2, '00'.repeat(52)), OWN_SCRIPT, buildDieselMintScript(1)],
      [0n, 49_000n, 0n],
      firstTxid,
    );
    const secondTxid = parseRawTransactionLocally(second)!.txid;

    recordOwnChangeFromRawTx(second, [OWN_ADDRESS]);

    expect(getPendingDieselUtxos(OWN_ADDRESS)).toEqual([{
      txid: secondTxid,
      vout: 1,
      address: OWN_ADDRESS,
      value: 49_000,
      chainDepth: 2,
    }]);
  });

  it('verifies a DIESEL child fee from the successful parent bytes while explorers lag', async () => {
    const parent = buildRawTx(
      [encryptedOpReturn(2, '00'.repeat(52)), OWN_SCRIPT, buildDieselMintScript(1)],
      [0n, 80_000n, 0n],
    );
    const parentTxid = parseRawTransactionLocally(parent)!.txid;
    recordOwnChangeFromRawTx(parent, [OWN_ADDRESS]);
    const child = buildRawTx([OWN_SCRIPT], [79_700n], parentTxid);
    const get = vi.spyOn(apiClient, 'get').mockRejectedValue(new Error('Parent not indexed yet'));

    await expect(checkTransactionFee({ rawTransaction: child, userFeeRate: 2 }, fetchInputValues))
      .resolves.toMatchObject({ ok: true, computedFee: 300 });
    await expect(fetchPreviousRawTransaction(parentTxid)).resolves.toBe(parent);
    expect(get).not.toHaveBeenCalled();
    // Resolving the immutable value must not recategorize protected storage as plain BTC.
    expect(getPendingChangeUtxos(OWN_ADDRESS)).toEqual([]);
    expect(getPendingDieselUtxos(OWN_ADDRESS)).toHaveLength(1);
  });

  // The rule this module exists for: attach binds an asset to an output of this very
  // transaction, so nothing here may be offered to the next compose as plain BTC.
  it.each([
    ['attach (101)', 101, utf8Hex('XCP|100|1')],
    ['legacy utxo move (100)', 100, utf8Hex(`${FAKE_TXID}:0|${FAKE_TXID}:1|XCP|100`)],
    ['detach (102)', 102, utf8Hex('0')],
  ])('registers nothing for %s', (_name, typeId, payloadHex) => {
    const raw = buildRawTx([encryptedOpReturn(typeId, payloadHex), OWN_SCRIPT], [0n, 5000n]);

    recordOwnChangeFromRawTx(raw, [OWN_ADDRESS]);

    expect(getPendingChangeUtxos(OWN_ADDRESS)).toEqual([]);
  });

  // A payload we cannot classify might be an attach; the cost of skipping is only seconds.
  it('registers nothing when the payload does not decode', () => {
    const raw = buildRawTx([encryptedOpReturn(238, 'deadbeef'), OWN_SCRIPT], [0n, 5000n]);

    recordOwnChangeFromRawTx(raw, [OWN_ADDRESS]);

    expect(getPendingChangeUtxos(OWN_ADDRESS)).toEqual([]);
  });

  it('registers nothing for unparseable hex', () => {
    recordOwnChangeFromRawTx('not-a-transaction', [OWN_ADDRESS]);
    recordOwnChangeFromRawTx('deadbeef', [OWN_ADDRESS]);

    expect(getPendingChangeUtxos(OWN_ADDRESS)).toEqual([]);
  });

  it('skips zero-value outputs', () => {
    const raw = buildRawTx([OWN_SCRIPT], [0n]);

    recordOwnChangeFromRawTx(raw, [OWN_ADDRESS]);

    expect(getPendingChangeUtxos(OWN_ADDRESS)).toEqual([]);
  });
});
