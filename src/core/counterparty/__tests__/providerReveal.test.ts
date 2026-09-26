/**
 * The hostile-site suite for Counterparty Taproot commits whose reveal a site holds.
 *
 * The reveal publishes its message from the address that funded the commit, while the site's own
 * key signs the reveal. Each test is a request a site could make: the honest core
 * shape, and each way to make the wallet describe one message while the commit lets the site
 * publish another — a reveal for a different transaction, a leaf swapped after signing, a commit
 * that hides a second leaf, an envelope that says nothing, and a commit funded by someone else.
 *
 * A proved reveal fixes its message but not its outputs, which a site holding the reveal key can
 * re-sign. Types whose meaning those outputs decide are not refused; the disclosure tests below
 * pin what the review says the site decides for each, and what the supplied reveal pays.
 */

import { bytesToHex } from '@noble/hashes/utils.js';
import { getPublicKey } from '@noble/secp256k1';
import { p2wpkh } from '@scure/btc-signer';
import { describe, expect, it } from 'vitest';
import { extractPsbtDetails } from '@/core/bitcoin/psbt';
import { packComposeMessage } from '@/core/counterparty/pack/messages';
import {
  type RevealControlFacts,
  type RevealOutputsFacts,
  revealDisclosures,
  revealSiteControl,
  verifyCounterpartyReveal,
} from '@/core/counterparty/providerReveal';
import type { SecurityWarning } from '@/core/counterparty/transactionSafety';
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
  payTo,
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

  // Formerly refused: now proved, with the outputs ahead of the data reported as core reads them.
  it('proves an issuance and reports the reveal outputs ahead of its data', () => {
    const commit = buildCommit(dataEnvelope(ISSUANCE()));
    const result = verifyCounterpartyReveal(
      buildReveal(commit, { leading: [payTo(OTHER_ADDRESS, 546n)] }), commitOf(commit.psbtHex), [USER_ADDRESS]);

    expect(result).toMatchObject({ ok: true, messageType: 'issuance', destinations: [OTHER_ADDRESS] });
    if (!result.ok) return;
    expect(result.outputs).toEqual([
      { index: 0, value: 546, address: OTHER_ADDRESS, opReturn: false },
      { index: 1, value: 0, address: undefined, opReturn: true },
    ]);
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

/** Formerly refused through a reveal. */
function ISSUANCE() {
  return bytesToHex(packComposeMessage('issuance', {
    asset: 'PEPECASH', quantity: 1, divisible: true, lock: false, reset: false, description: '',
  })!.bytes);
}
/** A legacy send (type 0, four-byte id) of 1 XCP; its recipient is the reveal's destination. */
const LEGACY_SEND_HEX = `${COUNTERPARTY_PREFIX_HEX}00000000${'0000000000000001'}${'0000000005f5e100'}`;
const hexOf = (type: string, params: Record<string, unknown>) =>
  bytesToHex(packComposeMessage(type, params as never)!.bytes);

/** Prove a reveal of `messageHex` with the given outputs, then build the review's statements. */
function disclose(messageHex: string, outputs: Parameters<typeof buildReveal>[1] = {}, owned = [USER_ADDRESS]) {
  const commit = buildCommit(dataEnvelope(messageHex));
  const result = verifyCounterpartyReveal(buildReveal(commit, outputs), commitOf(commit.psbtHex), [USER_ADDRESS]);
  if (!result.ok) throw new Error(`reveal did not prove: ${result.error}`);
  const warnings = revealDisclosures(result, unpackCounterpartyMessage(result.messageHex).data, owned);
  const control = warnings.find((warning) => warning.code === 'counterparty_reveal_site_control') as
    | (SecurityWarning & { data: RevealControlFacts })
    | undefined;
  const outputsCard = warnings.find((warning) => warning.code === 'counterparty_reveal_outputs') as
    SecurityWarning & { data: RevealOutputsFacts };
  return { control, outputs: outputsCard };
}

describe('revealSiteControl', () => {
  it.each([
    ['enhanced_send', 'message_only'],
    ['mpma_send', 'message_only'],
    ['order', 'message_only'],
    ['destroy', 'message_only'],
    ['fairminter', 'message_only'],
    ['send', 'send_recipient'],
    ['issuance', 'issuance_transfer'],
    ['attach', 'attach_output'],
    ['dispense', 'dispense_payment'],
    ['btcpay', 'btcpay_payment'],
    ['detach', 'detach_inputs'],
    ['utxo', 'not_executed'],
    ['bet', 'outputs_unknown'],
  ])('%s -> %s', (messageType, control) => {
    expect(revealSiteControl(messageType)).toBe(control);
  });
});

describe('revealDisclosures', () => {
  it('says nothing about site control for a message stated entirely in the reveal', () => {
    const { control, outputs } = disclose(MPMA_HEX);

    expect(control).toBeUndefined();
    expect(outputs).toMatchObject({ severity: 'info', title: 'Second Transaction' });
    expect(outputs.message).toContain('Second transaction: data only, no payment.');
    expect(outputs.message).toContain('could sign it again with different outputs');
  });

  it('legacy send: the site chooses the recipient, and the supplied one is named', () => {
    const { control } = disclose(LEGACY_SEND_HEX, { leading: [payTo(OTHER_ADDRESS, 546n)] });

    expect(control).toMatchObject({
      severity: 'warning',
      title: 'The Site Builds the Second Transaction',
      data: { control: 'send_recipient', supplied: { kind: 'recipient', address: OTHER_ADDRESS, owned: false } },
    });
    expect(control!.message).toContain('chooses the recipient');
    expect(control!.message).toContain(`As supplied, the recipient is ${OTHER_ADDRESS} (not yours).`);
  });

  it('legacy send with no output ahead of the data says Counterparty would reject it', () => {
    const { control } = disclose(LEGACY_SEND_HEX);

    expect(control?.data.supplied).toEqual({ kind: 'no_recipient' });
    expect(control!.message).toContain('Counterparty would reject the send');
  });

  it('issuance: the site can transfer ownership; without a destination it does not yet', () => {
    const { control } = disclose(ISSUANCE());

    expect(control).toMatchObject({
      severity: 'warning',
      data: { control: 'issuance_transfer', asset: 'PEPECASH', supplied: { kind: 'no_transfer' } },
    });
    expect(control!.message).toContain('The site can also transfer ownership of PEPECASH to an address it chooses');
    expect(control!.message).toContain('As supplied, it does not transfer ownership.');
  });

  it('issuance with a destination names the new owner', () => {
    const { control } = disclose(ISSUANCE(), { leading: [payTo(OTHER_ADDRESS, 546n)] });

    expect(control!.message).toContain(`As supplied, ownership goes to ${OTHER_ADDRESS} (not yours).`);
  });

  // Two outputs ahead of the data: core reads a multi-part destination and skips the message,
  // so there is no single "as supplied" to state.
  it('states no supplied destination when core would read several', () => {
    const { control } = disclose(ISSUANCE(), {
      leading: [payTo(OTHER_ADDRESS, 546n), payTo(USER_ADDRESS, 546n)],
    });

    expect(control?.data.supplied).toBeUndefined();
  });

  it('attach: the asset lands on the output the site chooses', () => {
    const { control } = disclose(hexOf('attach', { asset: 'PEPECASH', quantity: 1 }), {
      trailing: [payTo(USER_ADDRESS, 546n)],
    });

    expect(control).toMatchObject({
      severity: 'warning',
      data: { control: 'attach_output', asset: 'PEPECASH', supplied: { kind: 'attach_output', vout: 1, owned: true } },
    });
    expect(control!.message).toContain('This attaches your PEPECASH to an output of the second transaction.');
    expect(control!.message).toContain(`As supplied, output #1 receives it: ${USER_ADDRESS} (yours).`);
  });

  it('attach with nowhere to land says Counterparty would reject it', () => {
    const { control } = disclose(hexOf('attach', { asset: 'PEPECASH', quantity: 1 }));

    expect(control?.data.supplied).toEqual({ kind: 'attach_missing' });
  });

  it('dispense: the site chooses which dispensers are paid', () => {
    const { control } = disclose(hexOf('dispense', {}));

    expect(control).toMatchObject({ severity: 'warning', data: { control: 'dispense_payment' } });
    expect(control!.message).toContain('chooses which dispensers are paid and how much');
  });

  it('BTCPay: the site decides whether the match is paid', () => {
    const { control } = disclose(hexOf('btcpay', { order_match_id: `${'ab'.repeat(32)}_${'cd'.repeat(32)}` }));

    expect(control).toMatchObject({ severity: 'warning', data: { control: 'btcpay_payment' } });
    expect(control!.message).toContain('it decides whether the match is paid');
  });

  it('detach is information: the reveal cannot spend the UTXOs of the user', () => {
    const { control } = disclose(hexOf('detach', {}));

    expect(control).toMatchObject({ severity: 'info', data: { control: 'detach_inputs' } });
  });

  it('the legacy UTXO message is information: core no longer executes it', () => {
    const { control } = disclose(hexOf('utxo', {
      source: `${'ab'.repeat(32)}:0`, destination: USER_ADDRESS, asset: 'PEPECASH', quantity: 1,
    }));

    expect(control).toMatchObject({ severity: 'info', data: { control: 'not_executed' } });
  });

  describe('the outputs of the supplied reveal', () => {
    it('lists a payment back to the wallet as information', () => {
      const { outputs } = disclose(MPMA_HEX, { trailing: [payTo(USER_ADDRESS, 330n)] });

      expect(outputs).toMatchObject({ severity: 'info', data: { externalSats: 0 } });
      expect(outputs.message).toContain(`330 sats to ${USER_ADDRESS} (yours)`);
    });

    it('raises a payment anywhere else to a warning with its own title', () => {
      const { outputs } = disclose(MPMA_HEX, { trailing: [payTo(OTHER_ADDRESS, 330n)] });

      expect(outputs).toMatchObject({
        severity: 'warning',
        title: 'Second Transaction Pays Another Address',
        data: { externalSats: 330 },
      });
      expect(outputs.message).toContain(`330 sats to ${OTHER_ADDRESS} (not yours)`);
    });
  });
});
