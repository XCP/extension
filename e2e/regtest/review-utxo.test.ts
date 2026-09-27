// @vitest-environment node
/**
 * Review versus ledger: attach from every address format, then detach and move the attached UTXOs.
 *
 *   REGTEST=1 REGTEST_BITCOIND=http://127.0.0.1:28443 REGTEST_COUNTERPARTY=http://127.0.0.1:34000 \
 *     npx vitest run e2e/regtest --no-file-parallelism
 */

import { beforeAll, describe, expect, it, vi } from 'vitest';
import { serializeRawInteger } from '@/core/amount-contract/amounts';
import { type AttachOptions, composeAttach, composeDetach, composeMove, composeTransaction } from '@/core/counterparty/compose';
import { credits, debits, minedFee, parsedTransaction, sameAmount, totalFor, txEvents, utxoBalances } from './ledger';
import { REGTEST_ENABLED, type RegtestKey } from './regtestHarness';
import { broadcastBatch, burnAll, FORMATS, type Format, fundAll, keyOf, signAll, startWallet } from './suite';
import { type ApprovalReview, approvalReview, composeAsWallet, type ReviewPageFacts, reviewPageFacts, type WalletCompose, walletAddress } from './walletReview';
import { sameScript } from './walletTransport';

vi.mock('@/core/bitcoin/utxo', async original => (await import('./walletTransport')).utxoTransport(await original()));

interface Case { format: Format; key: RegtestKey; wc: WalletCompose; page: ReviewPageFacts; approval: ApprovalReview }

describe.runIf(REGTEST_ENABLED)('attach, detach and move: review matches ledger', () => {
  let miner: string;
  const holders = FORMATS.map(format => ({ format, key: keyOf(format, `utxo holder ${format}`) }));
  const receivers = FORMATS.map(format => ({ format, key: keyOf(format, `utxo receiver ${format}`) }));
  /** Where each holder's attach landed, per the ledger. */
  const attachedAt = new Map<Format, string>();

  beforeAll(async () => {
    miner = await startWallet();
    await fundAll(miner, holders.map(h => h.key));
    await burnAll(miner, holders.map(entry => entry.key));
  }, 900_000);

  // TODO(review-vs-ledger): the attach form submits no output, so `composeAttach` recomposes with
  // the ZELD layout (`zeldAttachParams`, destination_vout 2) whenever there is change. The message
  // then ends "|2", while the composer context rebuilds the expected message from the form's data,
  // which has no vout, and ends "|". Byte equality fails and the wallet refuses its own attach
  // ("the composed transaction differs"). Nothing is signed, so nothing is lost, but attaching from
  // the compose page cannot succeed. Remove `.fails` once the expected message is built with the
  // vout `composeAttach` chose.
  it.fails("attach as the form submits it passes the wallet's own verification", async () => {
    const error = await composeAsWallet('attach', composeAttach, { asset: 'XCP', quantity: '0.5' }, holders[0]!.key).then(() => null, e => e);
    // Any other failure makes this pass, so `.fails` reports it rather than hiding a new problem.
    if (error && !/differs from the one this request should produce/.test(String(error))) return;
    expect(error).toBeNull();
  }, 120_000);

  /** The ZELD-layout attaches below, by format: the approval screen's "New UTXO" and the ledger's. */
  const named = new Map<Format, { reviewed?: string[]; created: string; headline?: string }>();

  it('the ZELD-layout attach from each format, signed as composed, attaches to output 2', async () => {
    // What `composeAttach` returns for the form: output 2, after the change. The in-wallet flow
    // refuses it (above), but a site can present the same transaction for approval, and the
    // approval screen names the UTXO it creates from the transaction id it computes.
    const cases = [];
    for (const { format, key } of holders) {
      const response = await composeAttach({ sourceAddress: walletAddress(key), asset: 'XCP', quantity: '50000000', sat_per_vbyte: 2 });
      cases.push({ format, key, response, approval: await approvalReview(response.result.rawtransaction, key) });
    }
    const txids = await broadcastBatch(await signAll(cases), miner);
    for (const [i, c] of cases.entries()) {
      const attach = (await txEvents(txids[i]!)).find(e => e.event === 'ATTACH_TO_UTXO');
      expect(attach?.params.destination).toBe(`${txids[i]}:2`);
      expect(sameAmount(c.approval.headline?.replace(/^Attach /, ''), 0.5)).toBe(true);
      named.set(c.format, { reviewed: c.approval.protocol['New UTXO'], created: String(attach?.params.destination) });
    }
  }, 300_000);

  it.each(['P2WPKH', 'P2TR'] as const)('approval "New UTXO" is the UTXO the ledger created (%s source)', format => {
    expect(named.get(format)?.reviewed).toEqual([named.get(format)?.created]);
  });

  // TODO(review-vs-ledger): the approval screen names the attached UTXO as `<txid>:<vout>` using
  // the id of the transaction it was handed (`resolveProtocolContext` `transactionId`, from
  // `parseRawTransactionLocally` of the unsigned bytes). For a P2PKH or P2SH-P2WPKH source, signing
  // fills the scriptSig and the mined id is different, so the row names an outpoint that will never
  // exist. Only native SegWit and Taproot inputs leave the id unchanged. Remove `.fails` when the
  // row is withheld (or computed after signing) for inputs whose signatures change the id.
  it.fails.each(['P2PKH', 'P2SH-P2WPKH'] as const)('approval "New UTXO" is the UTXO the ledger created (%s source)', format => {
    expect(named.get(format)?.reviewed).toEqual([named.get(format)?.created]);
  });

  it('attach from each address format puts exactly the reviewed amount on the reviewed output', async () => {
    const cases: Case[] = [];
    for (const [i, { format, key }] of holders.entries()) {
      // Core's validated default layout: what `composeAttach` itself falls back to when the ZELD
      // layout does not hold, and the one layout the wallet's verification accepts (see above).
      const wc = await composeAsWallet('attach', composeAttachDefault, { asset: 'XCP', quantity: `${i + 1}.5` }, key);
      cases.push({ format, key, wc, page: await reviewPageFacts('attach', wc), approval: await approvalReview(wc.response.result.rawtransaction, key) });
    }
    const txids = await broadcastBatch(await signAll(cases.map(c => ({ response: c.wc.response, key: c.key }))), miner);

    for (const [i, c] of cases.entries()) {
      const txid = txids[i]!;
      expect((await parsedTransaction(txid)).valid, `${c.format} attach valid`).toBe(true);
      const events = await txEvents(txid);
      const attach = events.find(e => e.event === 'ATTACH_TO_UTXO');
      expect(attach, `${c.format} attach event`).toBeDefined();
      const destination = String(attach!.params.destination);
      attachedAt.set(c.format, destination);
      const onUtxo = await utxoBalances(destination);

      // Compose review page: asset, amount and output.
      expect(c.page.fields.asset).toBe('XCP');
      expect(sameAmount(c.page.fields.quantity, onUtxo.find(b => b.asset === 'XCP')!.quantity_normalized), `${c.format}: ${c.page.fields.quantity}`).toBe(true);
      if (c.page.fields.destinationOutput !== undefined) {
        expect(`${txid}:${c.page.fields.destinationOutput}`, `${c.format}: reviewed output`).toBe(destination);
      }
      expect(totalFor(debits(events), c.key.address, 'XCP') - Number(attach!.params.fee_paid ?? 0))
        .toBe(Number(onUtxo.find(b => b.asset === 'XCP')!.quantity));
      expect(c.page.btcFeeSats).toBe(await minedFee(txid));

      // Approval screen: the headline amount, the XCP fee, and the UTXO it creates.
      expect(sameAmount(c.approval.headline?.replace(/^Attach /, ''), onUtxo[0]!.quantity_normalized)).toBe(true);
      const fee = Number(attach!.params.fee_paid ?? 0);
      if (fee > 0) expect(sameAmount(c.approval.protocol['XCP fee']?.[0], fee / 1e8)).toBe(true);
      else expect(c.approval.protocol['XCP fee']).toBeUndefined();
      // Core's default layout names no output (it attaches to the first non-data output), and the
      // approval screen only names a UTXO the message itself fixes.
      expect(c.approval.protocol['New UTXO']).toBeUndefined();
      expect(destination).toBe(`${txid}:0`);
    }
  }, 600_000);

  it('detach returns what the review lists, to the reviewed address; move carries it to the reviewed destination', async () => {
    // Detach P2WPKH and P2PKH to themselves; move the nested and Taproot holders' UTXOs to others.
    const plan = [
      { holder: holders[0]!, kind: 'detach' as const },
      { holder: holders[1]!, kind: 'detach' as const },
      { holder: holders[2]!, kind: 'move' as const, to: receivers[3]!.key },
      { holder: holders[3]!, kind: 'move' as const, to: receivers[1]!.key },
    ];
    const cases = [];
    for (const step of plan) {
      const sourceUtxo = attachedAt.get(step.holder.format)!;
      const before = await utxoBalances(sourceUtxo);
      // A detach message carries its destination as text, so the address is spelled for the network
      // the node runs; the first detach leaves it empty, which Core reads as the UTXO's own owner.
      const wc = step.kind === 'detach'
        ? await composeAsWallet('detach', composeDetach, step.holder === holders[0]
          ? { sourceUtxo } : { sourceUtxo, destination: step.holder.key.address }, step.holder.key)
        : await composeAsWallet('move', composeMove, { sourceUtxo, destination: walletAddress(step.to!) }, step.holder.key);
      cases.push({ ...step, sourceUtxo, before, wc,
        page: await reviewPageFacts(step.kind, wc), approval: await approvalReview(wc.response.result.rawtransaction, step.holder.key) });
    }
    const txids = await broadcastBatch(await signAll(cases.map(c => ({ response: c.wc.response, key: c.holder.key }))), miner);

    for (const [i, c] of cases.entries()) {
      const txid = txids[i]!;
      const events = await txEvents(txid);
      // A move carries no message, so Core marks the transaction itself not "valid" and records the
      // move as a UTXO_MOVE event with its own status.
      if (c.kind === 'detach') expect((await parsedTransaction(txid)).valid, `detach ${c.holder.format} valid`).toBe(true);
      const moved = c.before.find(b => b.asset === 'XCP')!;
      if (c.kind === 'detach') {
        expect(c.page.fields.sourceUtxo).toBe(c.sourceUtxo);
        if (c.page.fields.destination !== undefined) expect(sameScript(c.page.fields.destination, c.holder.key.address)).toBe(true);
        const credited = totalFor(credits(events), c.holder.key.address, 'XCP');
        expect(credited).toBe(moved.quantity);
        expect(c.approval.protocol.Detached, `${c.holder.format}: approval lists what comes back`).toEqual([`${moved.quantity_normalized} XCP`]);
        if (c.holder !== holders[0]) expect(sameScript(c.approval.address, c.holder.key.address)).toBe(true);
        else expect(c.approval.headline).toBe('Detach all assets from UTXO');
      } else {
        expect(sameScript(c.page.to, c.to!.address), `${c.holder.format}: review names the move's destination`).toBe(true);
        const move = events.find(e => e.event === 'UTXO_MOVE');
        expect(move?.params.status).toBe('valid');
        const landed = String(move!.params.destination);
        const onUtxo = await utxoBalances(landed);
        expect(onUtxo.find(b => b.asset === 'XCP')?.quantity).toBe(moved.quantity);
        // The output the assets landed on pays the reviewed destination.
        const tx = await (await import('./regtestHarness')).rpc<{ vout: Array<{ scriptPubKey: { address?: string } }> }>('getrawtransaction', [txid, true], null);
        expect(sameScript(tx.vout[Number(landed.split(':')[1])]!.scriptPubKey.address, c.to!.address)).toBe(true);
      }
      expect(c.page.btcFeeSats).toBe(await minedFee(txid));
    }
  }, 600_000);
});

/** `composeAttach`'s first, validated compose (Core's default layout), without the ZELD recompose. */
function composeAttachDefault(options: AttachOptions) {
  return composeTransaction('attach', { asset: options.asset, quantity: serializeRawInteger(options.quantity) },
    options.sourceAddress, options.sat_per_vbyte, options.encoding);
}
