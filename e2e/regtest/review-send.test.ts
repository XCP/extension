// @vitest-environment node
/**
 * Review versus ledger: enhanced sends from every address format, and MPMA.
 *
 *   REGTEST=1 REGTEST_BITCOIND=http://127.0.0.1:28443 REGTEST_COUNTERPARTY=http://127.0.0.1:34000 \
 *     npx vitest run e2e/regtest --no-file-parallelism
 */

import { beforeAll, describe, expect, it, vi } from 'vitest';
import { composeMPMA, composeSendOrMPMA } from '@/core/counterparty/compose';
import { amountIn, credits, debits, minedFee, parsedTransaction, sameAmount, totalFor, txEvents } from './ledger';
import { REGTEST_ENABLED, type RegtestKey } from './regtestHarness';
import { broadcastBatch, burnAll, FORMATS, fundAll, keyOf, signAll, startWallet } from './suite';
import { approvalReview, composeAsWallet, reviewPageFacts, walletAddress } from './walletReview';
import { sameScript } from './walletTransport';

vi.mock('@/core/bitcoin/utxo', async original => (await import('./walletTransport')).utxoTransport(await original()));

describe.runIf(REGTEST_ENABLED)('sends: review matches ledger', () => {
  let miner: string;
  const senders = FORMATS.map(format => ({ format, key: keyOf(format, `send-from ${format}`) }));
  const recipients = FORMATS.map(format => ({ format, key: keyOf(format, `send-to ${format}`) }));

  beforeAll(async () => {
    miner = await startWallet();
    await fundAll(miner, senders.map(s => s.key));
    await burnAll(miner, senders.map(entry => entry.key));
  }, 600_000);

  it('enhanced send from each address format credits exactly what the review states', async () => {
    // Each sender pays the next format along, so every format is both a source and a destination.
    const cases = senders.map((sender, i) => ({ sender, recipient: recipients[(i + 1) % recipients.length]!,
      quantity: `${i + 1}.25` }));
    const composed = [];
    for (const c of cases) {
      const wc = await composeAsWallet('send', composeSendOrMPMA, {
        destination: walletAddress(c.recipient.key), asset: 'XCP', quantity: c.quantity, memo: `review ${c.sender.format}`,
      }, c.sender.key);
      composed.push({ ...c, wc, page: await reviewPageFacts('send', wc), approval: await approvalReview(wc.response.result.rawtransaction, c.sender.key) });
    }
    const txids = await broadcastBatch(await signAll(composed.map(c => ({ response: c.wc.response, key: c.sender.key }))), miner);

    for (const [i, c] of composed.entries()) {
      const txid = txids[i]!;
      const parsed = await parsedTransaction(txid);
      expect(parsed.valid, `${c.sender.format} send valid`).toBe(true);
      expect(parsed.transaction_type).toBe('enhanced_send');
      expect(c.wc.decodedMessage?.messageType).toBe('enhanced_send');
      const events = await txEvents(txid);
      const credited = totalFor(credits(events), c.recipient.key.address, 'XCP');
      const debited = totalFor(debits(events), c.sender.key.address, 'XCP');

      // Compose review page.
      expect(c.page.fields.asset).toBe('XCP');
      expect(sameAmount(c.page.fields.amount, credited / 1e8), `${c.sender.format}: review ${c.page.fields.amount} vs credit ${credited}`).toBe(true);
      expect(sameScript(c.page.to, c.recipient.key.address)).toBe(true);
      expect(sameScript(c.page.from, c.sender.key.address)).toBe(true);
      expect(c.page.fields.memo).toBe(`review ${c.sender.format}`);
      expect(debited).toBe(credited);
      expect(c.page.btcFeeSats).toBe(await minedFee(txid));

      // Approval screen (the describer): "Send 1.25000000 XCP to <address>".
      expect(c.approval.label).toBe('Send');
      expect(amountIn(c.approval.headline!)).toBe(amountIn(String(credited / 1e8)));
      expect(sameScript(c.approval.address, c.recipient.key.address)).toBe(true);
      expect(c.approval.protocol.Memo).toEqual([`review ${c.sender.format}`]);
      expect(c.approval.blocked).toBe(false);
    }
  }, 600_000);

  it('MPMA send credits each listed recipient exactly what the review lists', async () => {
    // Three sends overflow an OP_RETURN. From a witness source the wallet would move the message
    // into a Taproot envelope, which this suite leaves to its own tests; from a P2PKH source it
    // composes the ordinary way, as bare multisig.
    const sender = senders[1]!.key;
    // Legacy MPMA packing carries no 32-byte witness program, so Taproot cannot be a recipient.
    const payees: RegtestKey[] = recipients.filter(r => r.format !== 'P2TR').map(r => r.key);
    const quantities = ['0.1', '2', '0.00000001'];
    const wc = await composeAsWallet('mpma', composeMPMAFromForm, {
      assets: payees.map(() => 'XCP').join(','),
      // MPMA packs base58 addresses with their network version byte, so the form names them in
      // the regtest spelling (see walletTransport.ts); witness addresses pack without a network.
      destinations: payees.map(key => key.address.startsWith('bcrt') ? walletAddress(key) : key.address).join(','),
      quantities: quantities.join(','),
    }, sender);
    const page = await reviewPageFacts('mpma', wc);
    const approval = await approvalReview(wc.response.result.rawtransaction, sender);
    const [txid] = await broadcastBatch(await signAll([{ response: wc.response, key: sender }]), miner);

    const parsed = await parsedTransaction(txid!);
    expect(parsed.valid).toBe(true);
    expect(wc.decodedMessage?.messageType).toBe('mpma_send');
    const events = await txEvents(txid!);
    expect(page.sends).toHaveLength(payees.length);
    expect(approval.decoded.mpmaRecipients).toHaveLength(payees.length);
    for (const [i, payee] of payees.entries()) {
      const credited = totalFor(credits(events), payee.address, 'XCP');
      const row = page.sends!.find(send => sameScript(send.destination, payee.address));
      expect(row, `review lists ${payee.addressFormat}`).toBeDefined();
      expect(row!.asset).toBe('XCP');
      expect(sameAmount(row!.quantity, credited / 1e8), `review ${row!.quantity} vs credit ${credited}`).toBe(true);
      expect(sameAmount(quantities[i], credited / 1e8)).toBe(true);
      const recipient = approval.decoded.mpmaRecipients.find(r => sameScript(r.address, payee.address));
      expect(sameAmount(recipient?.quantity, credited / 1e8)).toBe(true);
    }
    const debited = totalFor(debits(events), sender.address, 'XCP');
    expect(debited).toBe(quantities.reduce((sum, q) => sum + Math.round(Number(q) * 1e8), 0));
    expect(page.btcFeeSats).toBe(await minedFee(txid!));
  }, 600_000);
});

/** `pages/compose/send/mpma/index.tsx`'s compose adapter, from the form's comma-separated fields. */
async function composeMPMAFromForm(data: Record<string, string> & { sourceAddress: string; sat_per_vbyte: number }) {
  return composeMPMA({
    sourceAddress: data.sourceAddress,
    assets: data.assets!.split(','),
    destinations: data.destinations!.split(','),
    quantities: data.quantities!.split(','),
    sat_per_vbyte: data.sat_per_vbyte,
  });
}
