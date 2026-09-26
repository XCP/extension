/**
 * The hostile-site suite for Counterparty Taproot commits whose reveal a site holds.
 *
 * Counterparty credits a reveal's message to whoever funded the commit, while the site's own
 * throwaway key signs the reveal. Each test is a request a site could make: the honest core
 * shape, and each way to make the wallet describe one message while the commit lets the site
 * publish another — a reveal for a different transaction, a leaf swapped after signing, a commit
 * that hides a second leaf, an envelope that says nothing, a message whose meaning the reveal's
 * outputs decide, and a commit funded by someone else.
 */

import { bytesToHex } from '@noble/hashes/utils.js';
import { getPublicKey } from '@noble/secp256k1';
import { p2wpkh } from '@scure/btc-signer';
import { describe, expect, it } from 'vitest';
import { extractPsbtDetails } from '@/core/bitcoin/psbt';
import { packComposeMessage } from '@/core/counterparty/pack/messages';
import { canCarryRevealWitness, verifyCounterpartyReveal } from '@/core/counterparty/providerReveal';
import { unpackCounterpartyMessage } from '@/core/counterparty/unpack';
import type { MPMAData } from '@/core/counterparty/unpack/messages/mpma';
import { COUNTERPARTY_PREFIX_HEX } from '@/core/counterparty/unpack/messageTypes';
import {
  buildCommit,
  buildReveal,
  dataEnvelope,
  FAIRMINTER_METADATA,
  OTHER_ADDRESS,
  ordEnvelope,
  USER_ADDRESS,
} from './helpers/revealFixtures';

const RECIPIENTS = Array.from({ length: 43 }, (_, i) =>
  p2wpkh(getPublicKey(new Uint8Array(32).fill(10 + i), true)).address!);

/** The CounterwalletV2 shape: one MPMA moving the user's asset to 43 addresses. */
const MPMA_HEX = bytesToHex(packComposeMessage('mpma', {
  assets: RECIPIENTS.map(() => 'PEPECASH').join(','),
  destinations: RECIPIENTS.join(','),
  quantities: RECIPIENTS.map(() => '100000000').join(','),
})!.bytes);

const commitOf = (psbtHex: string) => {
  const details = extractPsbtDetails(psbtHex);
  return { transactionId: details.transactionId, inputs: details.inputs, outputs: details.outputs };
};

describe('verifyCounterpartyReveal', () => {
  it('proves a core-shaped MPMA reveal and reports what it publishes, from whom', () => {
    const commit = buildCommit(dataEnvelope(MPMA_HEX));
    const result = verifyCounterpartyReveal(buildReveal(commit), commitOf(commit.psbtHex), [USER_ADDRESS]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result).toMatchObject({
      messageType: 'mpma_send',
      envelope: 'data',
      commitIndex: 0,
      commitValue: 600,
      sourceAddress: USER_ADDRESS,
    });
    expect(result.messageHex).toBe(MPMA_HEX);
    const sends = (unpackCounterpartyMessage(result.messageHex).data as MPMAData).sends;
    expect(sends).toHaveLength(43);
    expect(new Set(sends.map((send) => send.asset))).toEqual(new Set(['PEPECASH']));
    expect(sends.map((send) => send.destination)).toEqual(RECIPIENTS);
  });

  it('proves an ord envelope signed with the throwaway key', () => {
    const commit = buildCommit(ordEnvelope({ metadata: FAIRMINTER_METADATA }));
    const result = verifyCounterpartyReveal(buildReveal(commit), commitOf(commit.psbtHex), [USER_ADDRESS]);

    expect(result).toMatchObject({ ok: true, envelope: 'ord', messageType: 'fairminter' });
  });

  it('refuses a reveal that spends a different transaction', () => {
    const commit = buildCommit(dataEnvelope(MPMA_HEX));
    const other = buildCommit(dataEnvelope(MPMA_HEX), { prevTxid: 'ab'.repeat(32) });
    const result = verifyCounterpartyReveal(buildReveal(other), commitOf(commit.psbtHex), [USER_ADDRESS]);

    expect(result).toMatchObject({ ok: false, reason: 'not_this_transaction' });
  });

  it('refuses a reveal naming an output this transaction does not have', () => {
    const commit = buildCommit(dataEnvelope(MPMA_HEX));
    const result = verifyCounterpartyReveal(
      buildReveal(commit, { vout: 7 }), commitOf(commit.psbtHex), [USER_ADDRESS]);

    expect(result).toMatchObject({ ok: false, reason: 'not_this_transaction' });
  });

  it('refuses a reveal of the change output, which commits to no script', () => {
    const commit = buildCommit(dataEnvelope(MPMA_HEX));
    const result = verifyCounterpartyReveal(
      buildReveal(commit, { vout: 1 }), commitOf(commit.psbtHex), [USER_ADDRESS]);

    expect(result).toMatchObject({ ok: false, reason: 'script_not_committed' });
  });

  // The site shows a harmless envelope but the commit is to the MPMA: the displayed leaf is not
  // the one the output commits to, so it proves nothing.
  it('refuses a tampered envelope the commit output does not commit to', () => {
    const commit = buildCommit(dataEnvelope(MPMA_HEX));
    const harmless = dataEnvelope(bytesToHex(packComposeMessage('broadcast', {
      timestamp: 1_700_000_000, value: 0, fee_fraction: 0, text: 'gm',
    })!.bytes));
    const result = verifyCounterpartyReveal(
      buildReveal(commit, { publish: harmless }), commitOf(commit.psbtHex), [USER_ADDRESS]);

    expect(result).toMatchObject({ ok: false, reason: 'script_not_committed' });
  });

  // Two leaves: the site reveals the harmless one to the wallet and keeps the MPMA for the chain.
  it('refuses a commit whose output hides a second script', () => {
    const harmless = ordEnvelope({ metadata: FAIRMINTER_METADATA });
    const commit = buildCommit(harmless, { extraLeaf: dataEnvelope(MPMA_HEX) });
    const result = verifyCounterpartyReveal(buildReveal(commit), commitOf(commit.psbtHex), [USER_ADDRESS]);

    expect(result).toMatchObject({ ok: false, reason: 'script_not_committed' });
  });

  it('refuses a plain ordinals inscription, which carries no Counterparty message', () => {
    const commit = buildCommit(ordEnvelope());
    const result = verifyCounterpartyReveal(buildReveal(commit), commitOf(commit.psbtHex), [USER_ADDRESS]);

    expect(result).toMatchObject({ ok: false, reason: 'not_counterparty' });
  });

  it('refuses a data envelope that does not decode to a Counterparty message', () => {
    const commit = buildCommit(dataEnvelope(`${COUNTERPARTY_PREFIX_HEX}fe00ff00ff`));
    const result = verifyCounterpartyReveal(buildReveal(commit), commitOf(commit.psbtHex), [USER_ADDRESS]);

    expect(result).toMatchObject({ ok: false, reason: 'not_counterparty' });
  });

  it('refuses a reveal without the CNTRPRTY marker core requires', () => {
    const commit = buildCommit(dataEnvelope(MPMA_HEX));
    const result = verifyCounterpartyReveal(
      buildReveal(commit, { marker: false }), commitOf(commit.psbtHex), [USER_ADDRESS]);

    expect(result).toMatchObject({ ok: false, reason: 'not_counterparty' });
  });

  // An issuance's transfer destination is the reveal's first output, which the site can add
  // after the user signs: a reissuance would become an ownership transfer.
  it('refuses a message whose meaning the reveal outputs decide', () => {
    const issuance = bytesToHex(packComposeMessage('issuance', {
      asset: 'PEPECASH', quantity: 1, divisible: true, lock: false, reset: false, description: '',
    })!.bytes);
    const commit = buildCommit(dataEnvelope(issuance));
    const result = verifyCounterpartyReveal(buildReveal(commit), commitOf(commit.psbtHex), [USER_ADDRESS]);

    expect(result).toMatchObject({ ok: false, reason: 'outputs_decide', messageType: 'issuance' });
  });

  it('refuses when the commit is funded from an address this wallet does not sign', () => {
    const commit = buildCommit(dataEnvelope(MPMA_HEX), { funder: OTHER_ADDRESS });
    const result = verifyCounterpartyReveal(buildReveal(commit), commitOf(commit.psbtHex), [USER_ADDRESS]);

    expect(result).toMatchObject({ ok: false, reason: 'source_not_signer' });
  });

  it('refuses bytes that are not a transaction', () => {
    const commit = buildCommit(dataEnvelope(MPMA_HEX));
    const result = verifyCounterpartyReveal('deadbeef', commitOf(commit.psbtHex), [USER_ADDRESS]);

    expect(result).toMatchObject({ ok: false, reason: 'unreadable' });
  });
});

describe('canCarryRevealWitness', () => {
  it.each([
    ['P2TR', `5120${'11'.repeat(32)}`, true],
    ['P2WSH', `0020${'11'.repeat(32)}`, true],
    ['P2SH', `a914${'11'.repeat(20)}87`, true],
    ['a future witness version', `5210${'11'.repeat(16)}`, true],
    ['P2WPKH', `0014${'11'.repeat(20)}`, false],
    ['P2PKH', `76a914${'11'.repeat(20)}88ac`, false],
    ['OP_RETURN', '6a0474657374', false],
  ])('%s', (_label, script, expected) => {
    expect(canCarryRevealWitness(script)).toBe(expected);
  });
});
