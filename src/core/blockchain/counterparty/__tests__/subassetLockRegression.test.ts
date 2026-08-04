/**
 * Locking a subasset is the most common issuance on the chain, and it must verify.
 *
 * A guard added while hardening the borrowed asset id briefly declined lock, reset and transfer
 * for subassets. That sent them to the field-comparison fallback, which compared the request's
 * longname (`PARENT.child`) against the message's numeric asset name (`A123…`) and called the
 * difference a critical mismatch — so locking a subasset failed outright. Both halves are pinned
 * here: the packer must build these messages, and the fallback must compare the right names if it
 * is ever reached.
 */

import { describe, expect, it } from 'vitest';
import { packComposeMessage } from '../pack/messages';
import { unpackCounterpartyMessage } from '../unpack';
import { bytesToHex } from '../unpack/binary';
import { MessageTypeId } from '../unpack/messageTypes';
import { verifyTransaction } from '../unpack/verify';

/**
 * A real locked subasset issuance from mainnet (PINKSHIRTGUY.5368): LR_SUBASSET, lock set,
 * indivisible, no description.
 */
const LONGNAME = 'PINKSHIRTGUY.5368';
const ASSET_ID = 751209043880280215n;

/** Params as the issuance form submits them for that transaction. */
const PARAMS = {
  asset: LONGNAME,
  quantity: 1,
  divisible: false,
  lock: true,
  reset: false,
  description: '',
};

const OBSERVED = { messageTypeId: MessageTypeId.LR_SUBASSET, assetId: ASSET_ID };

describe('locking a subasset', () => {
  it('packs, so it is verified by byte equality rather than the fallback', () => {
    const packed = packComposeMessage('issuance', PARAMS, OBSERVED);

    expect(packed).not.toBeNull();
    expect(packed!.messageTypeId).toBe(MessageTypeId.LR_SUBASSET);
  });

  it('round-trips: the packed message decodes back to the requested longname and lock', () => {
    const packed = packComposeMessage('issuance', PARAMS, OBSERVED);
    const decoded = unpackCounterpartyMessage(packed!.bytes);

    expect(decoded.success).toBe(true);
    const data = decoded.data as { subassetLongname?: string; isLock?: boolean };
    expect(data.subassetLongname).toBe(LONGNAME);
    expect(data.isLock).toBe(true);
  });

  it('passes field comparison too, which compares longnames rather than numeric names', () => {
    // Belt and braces: if this shape ever reaches the fallback for another reason, it must not be
    // rejected for the difference between "PARENT.child" and the numeric name the id resolves to.
    const packed = packComposeMessage('issuance', PARAMS, OBSERVED);
    const messageHex = bytesToHex(packed!.bytes);

    const verification = verifyTransaction(messageHex, 'issuance', PARAMS);

    expect(verification.errors).toEqual([]);
    expect(verification.valid).toBe(true);
  });

  it('still catches a genuinely different subasset', () => {
    const packed = packComposeMessage('issuance', PARAMS, OBSERVED);
    const messageHex = bytesToHex(packed!.bytes);

    const verification = verifyTransaction(messageHex, 'issuance', {
      ...PARAMS,
      asset: 'PINKSHIRTGUY.9999',
    });

    expect(verification.valid).toBe(false);
    expect(verification.errors.join(' ')).toMatch(/Asset mismatch/);
  });
});
