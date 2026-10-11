// @vitest-environment node
import { hexToBytes } from '@noble/hashes/utils.js';
import * as btc from '@scure/btc-signer';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { signTaprootReveal } from '@/core/bitcoin/taprootRevealSigner';
import { isVersionAtLeast, TAPROOT_REVEAL_MIN_VERSION } from '@/core/counterparty/capabilities';
import { composeFairminter, composeIssuance } from '@/core/counterparty/compose';
import { setSourcePubkeyProvider } from '@/core/counterparty/sourcePubkeyProvider';
import { asset } from './ledger';
import { counterparty, mineBlocks, parsedTransaction, REGTEST_ENABLED, rpc, signAsWallet } from './regtestHarness';
import { broadcastBatch, burnAll, freshAsset, fundAll, keyOf, signAll, startWallet } from './suite';
import { composeAsWallet, composeTaprootAsWallet, type WalletTaprootCompose, walletAddress } from './walletReview';

vi.mock('@/core/bitcoin/utxo', async original => (await import('./walletTransport')).utxoTransport(await original()));

const nodeVersion = REGTEST_ENABLED ? (await counterparty<{ version: string }>('/')).version : '0.0.0';

describe.runIf(REGTEST_ENABLED && isVersionAtLeast(nodeVersion, TAPROOT_REVEAL_MIN_VERSION))('inscription form payloads against Core 11.5+', () => {
  const owner = keyOf('P2WPKH', 'inscription reaudit');
  const name = freshAsset('INS');
  let miner: string;

  beforeAll(async () => {
    miner = await startWallet();
    setSourcePubkeyProvider(address => address === walletAddress(owner) ? owner.publicKeyHex : null);
    await fundAll(miner, [owner]);
    await burnAll(miner, [owner]);
    const initial = await composeAsWallet('issuance', composeIssuance, {
      asset: name, quantity: '1', divisible: 'false', description: 'original',
    }, owner);
    await broadcastBatch(await signAll([{ response: initial.response, key: owner }]), miner);
  }, 900_000);

  afterAll(() => setSourcePubkeyProvider(null));

  async function publish(wc: WalletTaprootCompose): Promise<string> {
    const commit = await signAsWallet(wc.response, owner);
    const output = btc.Transaction.fromRaw(hexToBytes(commit.hex), { allowUnknownOutputs: true }).getOutput(0);
    const revealHex = signTaprootReveal(wc.reveal, {
      scriptHex: Buffer.from(output.script!).toString('hex'), value: output.amount!,
    }, walletAddress(owner), Buffer.from(owner.privateKey).toString('hex'));
    const accepted = await rpc<Array<{ allowed?: boolean }>>('testmempoolaccept', [[commit.hex, revealHex]], null);
    expect(accepted.map(tx => tx.allowed), JSON.stringify(accepted)).toEqual([true, true]);
    await rpc('sendrawtransaction', [commit.hex], null);
    const txid = await rpc<string>('sendrawtransaction', [revealHex], null);
    await mineBlocks(1, miner);
    expect((await parsedTransaction(txid)).valid).toBe(true);
    return txid;
  }

  it('the current update-description payload records the filename as ordinary text', async () => {
    const wc = await composeAsWallet('issuance', composeIssuance, {
      asset: name, quantity: '0', divisible: 'false', description: 'message.txt',
    }, owner);
    expect(wc.response.result.reveal_rawtransaction).toBeUndefined();
    const [txid] = await broadcastBatch(await signAll([{ response: wc.response, key: owner }]), miner);
    expect((await parsedTransaction(txid!)).valid).toBe(true);
    expect((await asset(name)).description).toBe('message.txt');
  }, 600_000);

  it('file content in description plus the boolean flag creates a valid inscription update', async () => {
    const wc = await composeTaprootAsWallet('issuance', composeIssuance, {
      asset: name, quantity: '0', divisible: 'false', description: 'hello inscription',
      inscription: 'true', mime_type: 'text/plain', encoding: 'taproot',
    }, owner);
    await publish(wc);
    expect((await asset(name)).description).toBe('hello inscription');
  }, 600_000);

  it('Core rejects the current fairminter text-as-boolean payload', async () => {
    await expect(composeAsWallet('fairminter', composeFairminter, {
      asset: freshAsset('BAD'), max_mint_per_tx: '1', burn_payment: 'false', divisible: 'false',
      inscription: 'hello inscription',
    }, owner)).rejects.toThrow(/Invalid boolean: inscription/);
  }, 600_000);

  it('a binary issuance resubmitted without inscription metadata stores the hex as text', async () => {
    const binaryName = freshAsset('BIN');
    const wc = await composeAsWallet('issuance', composeIssuance, {
      asset: binaryName, quantity: '1', divisible: 'false', description: '89504e47',
    }, owner);
    expect(wc.response.result.reveal_rawtransaction).toBeUndefined();
    const [txid] = await broadcastBatch(await signAll([{ response: wc.response, key: owner }]), miner);
    expect((await parsedTransaction(txid!)).valid).toBe(true);
    expect((await asset(binaryName)).description).toBe('89504e47');
  }, 600_000);

  it('a fairminter with content and a boolean inscription flag survives ledger parsing', async () => {
    const fairAsset = freshAsset('FAIR');
    const wc = await composeTaprootAsWallet('fairminter', composeFairminter, {
      asset: fairAsset, max_mint_per_tx: '1', burn_payment: 'false', divisible: 'false', description: 'hello inscription',
      inscription: 'true', mime_type: 'text/plain', encoding: 'taproot',
    }, owner);
    const txid = await publish(wc);
    const rows = await counterparty<Array<{ tx_hash: string; description: string }>>(`/assets/${fairAsset}/fairminters`);
    expect(rows).toEqual(expect.arrayContaining([expect.objectContaining({ tx_hash: txid, description: 'hello inscription' })]));
  }, 600_000);
});
