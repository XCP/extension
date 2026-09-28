// @vitest-environment node
/**
 * Review versus ledger for Taproot-encoded composes, against Counterparty Core 11.5 or newer:
 * Core returns the commit and an unsigned reveal the wallet signs with the source key. Each case
 * runs the wallet's compose flow (encoding chosen, envelope read and held to the request, reveal
 * held to Core's construction and attribution rule), signs the commit and the reveal with the
 * production signers, broadcasts the commit then the reveal, mines them, and reads back what Core
 * recorded: the message, from the address that signed.
 *
 *   COUNTERPARTY_IMAGE=<a Core 11.5 image> docker compose -p xcp-regtest -f e2e/regtest/docker-compose.yml up -d
 *   REGTEST=1 REGTEST_BITCOIND=http://127.0.0.1:28443 REGTEST_COUNTERPARTY=http://127.0.0.1:34000 \
 *     npx vitest run e2e/regtest --no-file-parallelism
 *
 * Skipped when the node is older than 11.5, which cannot compose a reveal for the wallet to sign.
 */

import { hexToBytes } from '@noble/hashes/utils.js';
import * as btc from '@scure/btc-signer';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { signTaprootReveal } from '@/core/bitcoin/taprootRevealSigner';
import { isVersionAtLeast, TAPROOT_REVEAL_MIN_VERSION } from '@/core/counterparty/capabilities';
import { composeBroadcast, composeIssuance, composeMPMA } from '@/core/counterparty/compose';
import { checkRevealSourceSignature, sourceOutputScript } from '@/core/counterparty/revealSourceRule';
import { setSourcePubkeyProvider } from '@/core/counterparty/sourcePubkeyProvider';
import { asset, credits, debits, totalFor, txEvents } from './ledger';
import { counterparty, mineBlocks, parsedTransaction, REGTEST_ENABLED, type RegtestKey, rpc, signAsWallet } from './regtestHarness';
import { burnAll, freshAsset, fundAll, keyOf, startWallet } from './suite';
import { composeTaprootAsWallet, type WalletTaprootCompose, walletAddress } from './walletReview';
import { sameScript } from './walletTransport';

vi.mock('@/core/bitcoin/utxo', async original => (await import('./walletTransport')).utxoTransport(await original()));

const nodeVersion = REGTEST_ENABLED
  ? await counterparty<{ version: string }>('/').then(info => info.version).catch(() => '0.0.0')
  : '0.0.0';
const TAPROOT_NODE = REGTEST_ENABLED && isVersionAtLeast(nodeVersion, TAPROOT_REVEAL_MIN_VERSION);

interface Mined { commitTxid: string; revealTxid: string }

/**
 * Sign as `WalletSigner.signCommitAndReveal` does (the production commit signer, then the
 * production reveal signer against the commit output as signed), broadcast the commit then the
 * reveal, and mine them into one block.
 */
async function signBroadcastMine(wc: WalletTaprootCompose, key: RegtestKey, miner: string): Promise<Mined> {
  const commit = await signAsWallet(wc.response, key);
  const signedCommit = btc.Transaction.fromRaw(hexToBytes(commit.hex), { allowUnknownOutputs: true });
  const output = signedCommit.getOutput(0);
  const revealHex = signTaprootReveal(wc.reveal, { scriptHex: Buffer.from(output.script!).toString('hex'), value: output.amount! },
    walletAddress(key), Buffer.from(key.privateKey).toString('hex'));

  // What Core will require of the reveal, checked before it is sent.
  const witness = btc.Transaction.fromRaw(hexToBytes(revealHex), { allowUnknownOutputs: true }).getInput(0).finalScriptWitness!;
  expect(checkRevealSourceSignature(output.script!, sourceOutputScript(key.address)!, witness).ok).toBe(true);

  const accepted = await rpc<Array<{ txid: string; allowed?: boolean; 'package-error'?: string; 'reject-reason'?: string }>>(
    'testmempoolaccept', [[commit.hex, revealHex]], null);
  expect(accepted.map(entry => entry.allowed), JSON.stringify(accepted)).toEqual([true, true]);
  const commitTxid = await rpc<string>('sendrawtransaction', [commit.hex], null);
  const revealTxid = await rpc<string>('sendrawtransaction', [revealHex], null);
  await mineBlocks(1, miner);
  return { commitTxid, revealTxid };
}

describe.runIf(TAPROOT_NODE)('Taproot-encoded composes (Core 11.5): the source signs the reveal, and Core records it from the source', () => {
  let miner: string;
  const wpkh = keyOf('P2WPKH', 'taproot source');
  const tr = keyOf('P2TR', 'taproot source internal');
  // A P2TR address whose key the compose does not name: Core closes the envelope with its output
  // key, which the wallet signs for with the tweaked private key.
  const trOutputKey = keyOf('P2TR', 'taproot source output key');
  // Legacy payees: MPMA packs a base58 address with its network version byte, so the form names
  // them in their regtest spelling, as review-send.test.ts does.
  const payees = [0, 1, 2, 3].map(i => keyOf('P2PKH', `taproot payee ${i}`));
  const LONG_TEXT = 'The quick brown fox jumps over the lazy dog. '.repeat(14).slice(0, 600);

  beforeAll(async () => {
    miner = await startWallet();
    // The keys the wallet would send as `multisig_pubkey`, as the wallet context registers them.
    const known = new Map([wpkh, tr].map(key => [walletAddress(key), key.publicKeyHex]));
    setSourcePubkeyProvider(address => known.get(address) ?? null);
    await fundAll(miner, [wpkh, tr, trOutputKey]);
    await burnAll(miner, [wpkh]);
  }, 900_000);

  afterAll(() => setSourcePubkeyProvider(null));

  async function expectBroadcastFrom(key: RegtestKey, wc: WalletTaprootCompose, mined: Mined): Promise<void> {
    const parsed = await parsedTransaction(mined.revealTxid);
    expect(parsed.valid, `${mined.revealTxid} valid`).toBe(true);
    expect(parsed.transaction_type).toBe('broadcast');
    expect(sameScript((parsed as unknown as { source: string }).source, key.address)).toBe(true);
    const recorded = await counterparty<{ text: string; source: string }>(`/broadcasts/${mined.revealTxid}`);
    expect(recorded.text).toBe(wc.decodedMessage?.data.text);
    expect(sameScript(recorded.source, key.address)).toBe(true);
    // The commit carries no message of its own.
    const commit = await counterparty<{ supported?: boolean; transaction_type?: string }>(`/transactions/${mined.commitTxid}`).catch(() => null);
    expect(commit?.transaction_type === 'broadcast').toBe(false);
  }

  it('a long broadcast from P2WPKH is published by the reveal the source signed', async () => {
    const wc = await composeTaprootAsWallet('broadcast', composeBroadcast, {
      text: LONG_TEXT, value: '0', fee_fraction: '0',
    }, wpkh);
    expect(wc.response.result.reveal_pubkey).toBe(wpkh.publicKeyHex.slice(2));
    expect(wc.decodedMessage?.data.text).toBe(LONG_TEXT);
    const mined = await signBroadcastMine(wc, wpkh, miner);
    await expectBroadcastFrom(wpkh, wc, mined);
  }, 600_000);

  it('a long broadcast from P2TR, closed by its internal key, is published from the P2TR address', async () => {
    const wc = await composeTaprootAsWallet('broadcast', composeBroadcast, {
      text: LONG_TEXT, value: '0', fee_fraction: '0',
    }, tr);
    expect(wc.response.result.reveal_pubkey).toBe(tr.publicKeyHex.slice(2));
    const mined = await signBroadcastMine(wc, tr, miner);
    await expectBroadcastFrom(tr, wc, mined);
  }, 600_000);

  it('a long broadcast from P2TR, closed by its output key, is signed with the tweaked key', async () => {
    const wc = await composeTaprootAsWallet('broadcast', composeBroadcast, {
      text: LONG_TEXT, value: '0', fee_fraction: '0',
    }, trOutputKey);
    expect(wc.response.result.reveal_pubkey).toBe(trOutputKey.scriptHex.slice(4));
    const mined = await signBroadcastMine(wc, trOutputKey, miner);
    await expectBroadcastFrom(trOutputKey, wc, mined);
  }, 600_000);

  it('a new issuance with a long description is issued to the source, as reviewed', async () => {
    const name = freshAsset('TAPR');
    const description = 'An asset whose description is too long for an OP_RETURN. '.repeat(3).trim();
    const wc = await composeTaprootAsWallet('issuance', composeIssuance, {
      asset: name, quantity: '42', divisible: 'false', lock: 'false', reset: 'false', description,
    }, wpkh);
    expect(wc.decodedMessage?.data).toMatchObject({ asset: name, description });
    const mined = await signBroadcastMine(wc, wpkh, miner);

    const parsed = await parsedTransaction(mined.revealTxid);
    expect(parsed.valid).toBe(true);
    const issued = await asset(name);
    expect(sameScript(issued.issuer, wpkh.address)).toBe(true);
    expect(issued.description).toBe(description);
    expect(issued.supply).toBe(42);
    expect(totalFor(credits(await txEvents(mined.revealTxid)), wpkh.address, name)).toBe(42);
  }, 600_000);

  // TODO(review-vs-ledger): with `mpma_taproot_support` active (always on regtest; mainnet from
  // block 971,700), Core 11.4+ writes the MPMA address table as a length byte and the
  // self-describing packing, which `pack/messages.ts` does not produce yet, so the wallet refuses
  // the compose as a message it did not ask for (fail-closed, before anything is signed). Remove
  // the marker once the wallet packs the new table; the assertions below are then the proof.
  it.fails('an MPMA too long for an OP_RETURN credits each payee what the review lists, debited from the source', async () => {
    const quantities = ['0.1', '2', '0.00000001', '0.5'];
    const wc = await composeTaprootAsWallet('mpma', composeMPMAFromForm, {
      assets: payees.map(() => 'XCP').join(','),
      destinations: payees.map(payee => payee.address).join(','),
      quantities: quantities.join(','),
    }, wpkh);
    expect(wc.decodedMessage?.messageType).toBe('mpma_send');
    const mined = await signBroadcastMine(wc, wpkh, miner);

    const parsed = await parsedTransaction(mined.revealTxid);
    expect(parsed.valid).toBe(true);
    const events = await txEvents(mined.revealTxid);
    for (const [i, payee] of payees.entries()) {
      expect(totalFor(credits(events), payee.address, 'XCP')).toBe(Math.round(Number(quantities[i]) * 1e8));
    }
    const debited = totalFor(debits(events), wpkh.address, 'XCP');
    expect(debited).toBe(quantities.reduce((sum, q) => sum + Math.round(Number(q) * 1e8), 0));
  }, 600_000);

  it('an inscription broadcast from P2WPKH is an ord envelope the source signs, returning dust to it', async () => {
    const wc = await composeTaprootAsWallet('broadcast', composeBroadcast, {
      // The inscription path rebuilds the envelope from the request alone, so the request names
      // its timestamp (the in-wallet form does not; see the report on this branch).
      text: 'hello from the source key', value: '0', fee_fraction: '0', timestamp: String(Math.floor(Date.now() / 1000)),
      inscription: 'true', mime_type: 'text/plain', encoding: 'taproot',
    }, wpkh);
    const mined = await signBroadcastMine(wc, wpkh, miner);
    const parsed = await parsedTransaction(mined.revealTxid);
    expect(parsed.valid).toBe(true);
    expect(parsed.transaction_type).toBe('broadcast');
    const recorded = await counterparty<{ text: string; source: string }>(`/broadcasts/${mined.revealTxid}`);
    expect(sameScript(recorded.source, wpkh.address)).toBe(true);
  }, 600_000);
});

/** `pages/compose/send/mpma/index.tsx`'s compose adapter, from the form's comma-separated fields. */
async function composeMPMAFromForm(data: Record<string, string> & { sourceAddress: string; sat_per_vbyte: number; encoding?: 'taproot' }) {
  return composeMPMA({
    sourceAddress: data.sourceAddress,
    assets: data.assets!.split(','),
    destinations: data.destinations!.split(','),
    quantities: data.quantities!.split(','),
    sat_per_vbyte: data.sat_per_vbyte,
    ...(data.encoding && { encoding: data.encoding }),
  });
}
