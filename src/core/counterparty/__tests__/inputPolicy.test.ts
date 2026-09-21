/**
 * Input accounting over a composed transaction.
 *
 * Where the wallet named the coins to spend, the composer has to build from those. Nothing else
 * checks it: an unoffered input still pays its value to outputs that account for themselves, so
 * output accounting and the fee bound both pass while the transaction spends a coin the wallet
 * deliberately held back.
 */

import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { getPublicKey } from '@noble/secp256k1';
import { p2wpkh, Transaction } from '@scure/btc-signer';
import { describe, expect, it } from 'vitest';
import { AddressFormat, encodeAddress } from '@/core/bitcoin/address';
import { checkInputPolicy } from '../inputPolicy';

const OWNER_KEY = hexToBytes('11'.repeat(32));
const OWNER_PUBKEY = getPublicKey(OWNER_KEY, true);
const OWNER = encodeAddress(OWNER_PUBKEY, AddressFormat.P2WPKH);

const OFFERED_A = 'aa'.repeat(32);
const OFFERED_B = 'bb'.repeat(32);
/** A coin the wallet held back — an attached-asset UTXO is the case that motivates this. */
const WITHHELD = 'cc'.repeat(32);

function rawTxSpending(outpoints: Array<{ txid: string; index: number }>): string {
  const tx = new Transaction({ allowUnknownOutputs: true, allowLegacyWitnessUtxo: true });
  for (const outpoint of outpoints) {
    tx.addInput({
      txid: hexToBytes(outpoint.txid),
      index: outpoint.index,
      witnessUtxo: { script: p2wpkh(OWNER_PUBKEY).script, amount: 100_000n },
    });
  }
  tx.addOutputAddress(OWNER, 90_000n);
  return bytesToHex(tx.unsignedTx);
}

describe('checkInputPolicy', () => {
  it('accepts a transaction spending exactly what was offered', () => {
    const result = checkInputPolicy({
      rawTransaction: rawTxSpending([{ txid: OFFERED_A, index: 0 }, { txid: OFFERED_B, index: 1 }]),
      offeredInputs: `${OFFERED_A}:0,${OFFERED_B}:1`,
    });

    expect(result.ok).toBe(true);
  });

  it('accepts a subset, since the composer need not spend every coin offered', () => {
    const result = checkInputPolicy({
      rawTransaction: rawTxSpending([{ txid: OFFERED_A, index: 0 }]),
      offeredInputs: `${OFFERED_A}:0,${OFFERED_B}:1`,
    });

    expect(result.ok).toBe(true);
  });

  it('rejects a coin the request never offered', () => {
    const result = checkInputPolicy({
      rawTransaction: rawTxSpending([{ txid: OFFERED_A, index: 0 }, { txid: WITHHELD, index: 0 }]),
      offeredInputs: `${OFFERED_A}:0,${OFFERED_B}:1`,
    });

    expect(result.ok).toBe(false);
    expect(result.unoffered).toEqual([`${WITHHELD}:0`]);
    expect(result.error).toContain('did not offer');
  });

  it('rejects a different output of an offered transaction', () => {
    // Same txid, different vout is a different coin — and on this wallet a likely one to be
    // holding an attached asset balance.
    const result = checkInputPolicy({
      rawTransaction: rawTxSpending([{ txid: OFFERED_A, index: 7 }]),
      offeredInputs: `${OFFERED_A}:0`,
    });

    expect(result.ok).toBe(false);
    expect(result.unoffered).toEqual([`${OFFERED_A}:7`]);
  });

  it('compares txids without regard to case', () => {
    const result = checkInputPolicy({
      rawTransaction: rawTxSpending([{ txid: OFFERED_A, index: 0 }]),
      offeredInputs: `${OFFERED_A.toUpperCase()}:0`,
    });

    expect(result.ok).toBe(true);
  });

  it('tolerates whitespace in the offered set', () => {
    const result = checkInputPolicy({
      rawTransaction: rawTxSpending([{ txid: OFFERED_A, index: 0 }]),
      offeredInputs: ` ${OFFERED_A}:0 , ${OFFERED_B}:1 `,
    });

    expect(result.ok).toBe(true);
  });

  it('says nothing when the request offered no set at all', () => {
    // The last rung of the compose retry ladder sends none, leaving the composer's choice with
    // nothing to be measured against. Claiming a pass here would overstate what was checked, but
    // there is no comparison to fail either.
    const result = checkInputPolicy({
      rawTransaction: rawTxSpending([{ txid: WITHHELD, index: 0 }]),
      offeredInputs: undefined,
    });

    expect(result.ok).toBe(true);
  });

  it('does not block an unparseable transaction, which signing will reject anyway', () => {
    const result = checkInputPolicy({
      rawTransaction: 'not-a-transaction',
      offeredInputs: `${OFFERED_A}:0`,
    });

    expect(result.ok).toBe(true);
  });
});
