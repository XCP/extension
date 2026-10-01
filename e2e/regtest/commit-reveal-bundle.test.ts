// @vitest-environment node
/**
 * A site's `commit-and-reveal` bundle against Counterparty Core 11.5 on regtest.
 *
 * The site composes a Taproot-encoded message through Core's own API, as a site would, and builds
 * the two PSBTs a marketplace sends: the commit with `witnessUtxo` prevouts, and the unsigned reveal
 * spending commit output 0 through the envelope leaf. It sends them through the provider
 * (`xcp_signPsbts`), the background reviews them (the pair's proof, the message decoded from the
 * envelope, the policy) and the production WalletSigner signs both with the throwaway key. The site
 * then finalizes both PSBTs, broadcasts the commit and the reveal, and mines them; Core must record
 * the message from the address that signed.
 *
 *   COUNTERPARTY_IMAGE=<a Core 11.5 image> docker compose -p <project> -f e2e/regtest/docker-compose.yml up -d
 *   REGTEST=1 REGTEST_BITCOIND=http://127.0.0.1:28443 REGTEST_COUNTERPARTY=http://127.0.0.1:34000 \
 *     npx vitest run e2e/regtest/commit-reveal-bundle.test.ts
 *
 * Skipped when the node is older than 11.5, which composes no reveal for the wallet to sign.
 */

import { hexToBytes } from '@noble/hashes/utils.js';
import * as btc from '@scure/btc-signer';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { AddressFormat } from '@/core/bitcoin/addressFormat';
import { commitRevealItems, commitRevealPsbts } from '@/core/counterparty/__tests__/helpers/commitRevealPsbts';
import type { Compose115Result, Fixture115 } from '@/core/counterparty/__tests__/taproot115Fixtures';
import { clearCounterpartyCapabilityCache, isVersionAtLeast, TAPROOT_REVEAL_MIN_VERSION } from '@/core/counterparty/capabilities';
import { checkRevealSourceSignature, sourceOutputScript } from '@/core/counterparty/revealSourceRule';
import { WalletSigner } from '@/platform/walletSigner';
import { createProviderService } from '@/services/providerService';
import { createProviderSigningService } from '@/services/providerSigningService';
import type { Wallet } from '@/types/wallet';
import {
  compose, counterparty, mineBlocks, parsedTransaction, REGTEST_ENABLED, type RegtestKey, rpc, scanUnspents,
} from './regtestHarness';
import { fundAll, keyOf, startWallet } from './suite';
import { walletAddress } from './walletReview';
import { sameScript } from './walletTransport';

vi.mock('@/core/bitcoin/utxo', async original => (await import('./walletTransport')).utxoTransport(await original()));

const hoisted = vi.hoisted(() => ({
  popups: [] as string[],
  wallet: null as null | Record<string, unknown>,
  active: { walletId: '', address: '' },
}));
vi.mock('@/services/walletService', () => ({ getWalletService: () => hoisted.wallet }));
vi.mock('@/services/connectionService', () => ({ getConnectionService: () => ({
  hasPermission: async () => true, hasPairedAddressPermission: async () => false,
}) }));
vi.mock('@/platform/auth/sessionManager', () => ({
  getSessionGeneration: () => 0, assertSessionGeneration: () => {},
  getUnlockedSecret: async () => 'unlocked', unlockedHdNodeCache: () => undefined,
}));
vi.mock('@/platform/walletManager', () => ({ walletManager: {
  getSettings: () => ({ connectedWebsites: ['https://site.invalid'], providerCapabilities: {} }),
  getActiveWallet: () => ({ id: hoisted.active.walletId, addresses: [{ address: hoisted.active.address }] }),
} }));
vi.mock('@/platform/popup', async original => ({
  ...(await original<typeof import('@/platform/popup')>()),
  openExtensionPopup: async (path: string) => { hoisted.popups.push(path); return { id: 1 }; },
  reusePopupWindow: async () => null,
}));
vi.mock('@/platform/provider/recentBroadcasts', () => ({
  getTrustedBroadcastPrevout: async () => null, rememberSuccessfulBroadcast: async () => undefined,
}));
vi.mock('@/services/updateService', () => ({
  getUpdateService: () => ({ registerCriticalOperation: () => {}, unregisterCriticalOperation: () => {} }),
}));
vi.mock('@/platform/fathom', () => ({
  sanitizePath: (path: string) => path, fathom: () => ({}),
  analytics: { track: async () => undefined, page: async () => undefined },
}));
vi.mock('@/core/hardware/trezorAdapter', () => ({ getTrezorAdapter: () => { throw new Error('unused'); } }));

const ORIGIN = 'https://site.invalid';
const RAW = { allowUnknownOutputs: true, allowUnknownInputs: true, disableScriptCheck: true };

const nodeVersion = REGTEST_ENABLED
  ? await counterparty<{ version: string }>('/').then(info => info.version).catch(() => '0.0.0')
  : '0.0.0';
const TAPROOT_NODE = REGTEST_ENABLED && isVersionAtLeast(nodeVersion, TAPROOT_REVEAL_MIN_VERSION);

/** The active wallet: one software address, the throwaway key's, in the mainnet spelling it holds. */
function useKey(key: RegtestKey): { wallet: Wallet; address: string } {
  const address = walletAddress(key);
  const wallet = {
    id: 'ab'.repeat(32), name: 'Regtest', type: 'privateKey', addressCount: 1,
    addressFormat: key.addressFormat === AddressFormat.P2TR ? AddressFormat.P2TR : AddressFormat.P2WPKH,
    addresses: [{ name: 'Address 1', path: '', address, pubKey: key.publicKeyHex }],
  } as Wallet;
  const signer = new WalletSigner({
    getCoinLocks: () => [],
    activeWalletId: () => wallet.id,
    getWalletById: id => (id === wallet.id ? wallet : undefined),
    getActiveWallet: () => wallet,
    lastActiveAddress: () => address,
    getPrivateKey: async () => ({ hex: Buffer.from(key.privateKey).toString('hex'), wif: '', compressed: true }),
    getPairedAddresses: async () => { throw new Error('no pair'); },
  });
  hoisted.active = { walletId: wallet.id, address };
  hoisted.wallet = {
    isKeychainUnlocked: async () => true,
    getActiveWallet: async () => wallet,
    getActiveAddress: async () => wallet.addresses[0],
    getPairedAddresses: async () => { throw new Error('no pair'); },
    getSettings: async () => ({ strictTransactionVerification: true, providerCapabilities: {} }),
    signPsbt: (...args: Parameters<WalletSigner['signPsbt']>) => signer.signPsbt(...args),
    signCommitAndRevealPsbts: (...args: Parameters<WalletSigner['signCommitAndRevealPsbts']>) =>
      signer.signCommitAndRevealPsbts(...args),
  };
  return { wallet, address };
}

/** A site's Core 11.5 compose, in the shape the PSBT builder reads. */
function asFixture(key: RegtestKey, result: Compose115Result): Fixture115 {
  return {
    key: {
      format: key.addressFormat === AddressFormat.P2TR ? 'P2TR' : 'P2WPKH',
      privateKeyHex: Buffer.from(key.privateKey).toString('hex'),
      publicKeyHex: key.publicKeyHex,
      regtestAddress: key.address,
      address: walletAddress(key),
      scriptHex: key.scriptHex,
    },
    request: {},
    feeRate: 2,
    result,
  };
}

/**
 * Send the pair through `xcp_signPsbts`, approve the review the background builds, and return what
 * the site receives.
 */
async function signThroughProvider(fixture: Fixture115) {
  const psbts = commitRevealPsbts(fixture);
  return { psbts, ...await sendBundle(commitRevealItems(fixture, psbts)) };
}

type BundleItems = ReturnType<typeof commitRevealItems>;

async function sendBundle(items: BundleItems) {
  const reveal = { standard: 'counterparty-reveal', version: 1, action: 'sign_reveal' };
  const pending = createProviderService().handleRequest(ORIGIN, 'xcp_signPsbts', [{
    requests: [
      { hex: items.commit.psbtHex, signInputs: items.commit.signInputs, sighashTypes: items.commit.sighashTypes },
      { hex: items.reveal.psbtHex, signInputs: items.reveal.signInputs, sighashTypes: items.reveal.sighashTypes, intent: reveal },
    ],
  }]);
  let requestId: string | undefined;
  for (let attempt = 0; attempt < 200 && !requestId; attempt += 1) {
    await new Promise(resolve => setTimeout(resolve, 25));
    requestId = hoisted.popups.map(path => /requestId=([^&]+)/.exec(path)?.[1]).find(Boolean);
  }
  if (!requestId) throw new Error(`the provider opened no approval: ${String(await Promise.race([pending, 'pending']))}`);
  const signing = createProviderSigningService();
  const review = await signing.getReview(requestId);
  if (review.kind !== 'sign-psbts') throw new Error('wrong review kind');
  await signing.approveAndSign(requestId, { reviewKey: review.reviewKey, risksAcknowledged: true });
  const result = await pending as { hexes: string[] };
  return { review, hexes: result.hexes };
}

/** Finalize both PSBTs as the site does, accept both into the mempool, broadcast and mine. */
async function broadcastPair(hexes: string[], miner: string) {
  const finalized = hexes.map(hex => {
    const tx = btc.Transaction.fromPSBT(hexToBytes(hex), RAW);
    tx.finalize();
    return tx;
  });
  const raw = finalized.map(tx => tx.hex);
  const accepted = await rpc<Array<{ allowed?: boolean; 'reject-reason'?: string }>>('testmempoolaccept', [raw], null);
  expect(accepted.map(entry => entry.allowed), JSON.stringify(accepted)).toEqual([true, true]);
  const commitTxid = await rpc<string>('sendrawtransaction', [raw[0]], null);
  const revealTxid = await rpc<string>('sendrawtransaction', [raw[1]], null);
  await mineBlocks(1, miner);
  return { commitTxid, revealTxid, reveal: finalized[1]!, commit: finalized[0]! };
}

describe.runIf(TAPROOT_NODE)('commit-and-reveal through the provider (Core 11.5): signed as one bundle, recorded from the source', () => {
  let miner: string;
  const wpkh = keyOf('P2WPKH', 'bundle source');
  const tr = keyOf('P2TR', 'bundle source internal');
  const trOutputKey = keyOf('P2TR', 'bundle source output key');
  const siteBuilder = keyOf('P2TR', 'bundle site builder');
  const LONG_TEXT = 'A broadcast a marketplace composed as Taproot, signed as one bundle. '.repeat(9).slice(0, 600);

  beforeAll(async () => {
    miner = await startWallet();
    clearCounterpartyCapabilityCache();
    await fundAll(miner, [wpkh, tr, trOutputKey, siteBuilder]);
  }, 900_000);

  beforeEach(() => {
    fakeBrowser.reset();
    vi.stubGlobal('chrome', fakeBrowser);
    hoisted.popups = [];
  });

  afterAll(() => vi.unstubAllGlobals());

  it.each([
    ['P2WPKH, closed by its key', () => wpkh, true],
    ['P2TR, closed by its internal key', () => tr, true],
    ['P2TR, closed by its output key', () => trOutputKey, false],
  ])('a long broadcast from %s', async (_name, keyAt, namesKey) => {
    const key = keyAt();
    const { address } = useKey(key);
    // The site composes through Core, naming the source's key as a site that read it from
    // `xcp_getAddresses` would (without it, Core closes a P2TR envelope with the output key).
    const response = await compose(key.address, 'broadcast', {
      text: LONG_TEXT, value: '0', fee_fraction: '0', timestamp: String(Math.floor(Date.now() / 1000)), encoding: 'taproot',
      ...(namesKey ? { multisig_pubkey: key.publicKeyHex } : {}),
    });
    const result = response.result as unknown as Compose115Result;
    expect(result.reveal_rawtransaction).toBeTruthy();
    const fixture = asFixture(key, result);

    const { review, hexes, psbts } = await signThroughProvider(fixture);
    expect(review.decodedInfo.review).toMatchObject({ status: 'proved', family: 'commit_and_reveal' });
    expect(review.policy.blocked).toBe(false);
    expect(hexes).toHaveLength(2);

    const mined = await broadcastPair(hexes, miner);
    expect(mined.commitTxid).toBe(psbts.commitTxid);
    expect(checkRevealSourceSignature(mined.commit.getOutput(0).script!, sourceOutputScript(address)!,
      mined.reveal.getInput(0).finalScriptWitness!).ok).toBe(true);

    const parsed = await parsedTransaction(mined.revealTxid);
    expect(parsed.valid, `${mined.revealTxid} valid`).toBe(true);
    expect(parsed.transaction_type).toBe('broadcast');
    const recorded = await counterparty<{ text: string; source: string }>(`/broadcasts/${mined.revealTxid}`);
    expect(recorded.text).toBe(LONG_TEXT);
    expect(sameScript(recorded.source, key.address)).toBe(true);
  }, 600_000);

  // A site's own envelope builder: Core's inscription message, rebuilt with a properties tag, closed
  // by the P2TR output key, committed under the unspendable internal key, revealed with dust to a
  // burn address beside the marker, and signed SIGHASH_ALL.
  it('a site-built inscription from P2TR, committed under the unspendable key and signed ALL', async () => {
    const key = siteBuilder;
    const { address } = useKey(key);
    const composed = (await compose(key.address, 'broadcast', {
      text: 'a site built this envelope', value: '0', fee_fraction: '0', timestamp: String(Math.floor(Date.now() / 1000)),
      inscription: 'true', mime_type: 'text/plain', encoding: 'taproot',
    })).result as unknown as Compose115Result;
    const coreLeaf = hexToBytes(composed.envelope_script);
    const outputKey = key.script.slice(2, 34);
    expect(Buffer.from(coreLeaf.slice(-33, -1)).equals(Buffer.from(outputKey))).toBe(true);
    const afterMime = 15 + coreLeaf[14]!;
    const props = new TextEncoder().encode('site properties');
    const leaf = new Uint8Array([...coreLeaf.slice(0, afterMime), 0x01, 0x11, props.length, ...props, ...coreLeaf.slice(afterMime)]);
    const tree = btc.p2tr(btc.TAPROOT_UNSPENDABLE_KEY, { script: leaf, leafVersion: 0xc0 }, undefined, true);

    const [utxo] = await scanUnspents(key.address);
    const funding = BigInt(Math.round(utxo!.amount * 1e8));
    const burn = btc.OutScript.encode(btc.Address(btc.NETWORK).decode('1CounterpartyXXXXXXXXXXXXXXXUWLpVr'));
    const marker = hexToBytes('6a08434e545250525459');
    const commitValue = 546n + 3_000n;
    const commit = new btc.Transaction(RAW);
    commit.addInput({ txid: utxo!.txid, index: utxo!.vout, witnessUtxo: { script: key.script, amount: funding } });
    commit.addOutput({ script: tree.script, amount: commitValue });
    commit.addOutput({ script: key.script, amount: funding - commitValue - 1_000n });
    const reveal = new btc.Transaction(RAW);
    reveal.addOutput({ script: burn, amount: 546n });
    reveal.addOutput({ script: marker, amount: 0n });
    reveal.addInput({ txid: commit.id, index: 0, sighashType: btc.SigHash.ALL,
      witnessUtxo: { script: tree.script, amount: commitValue }, tapLeafScript: tree.tapLeafScript });

    const { review, hexes } = await sendBundle({
      commit: { psbtHex: Buffer.from(commit.toPSBT()).toString('hex'), signInputs: { [address]: [0] }, sighashTypes: [0x00] },
      reveal: { psbtHex: Buffer.from(reveal.toPSBT()).toString('hex'), signInputs: { [address]: [0] }, sighashTypes: [0x01] },
    });
    expect(review.decodedInfo.review).toMatchObject({ status: 'proved', family: 'commit_and_reveal' });
    expect(review.decodedInfo.review.facts.some(fact => /burn address/.test(fact.description ?? ''))).toBe(true);

    const mined = await broadcastPair(hexes, miner);
    const parsed = await parsedTransaction(mined.revealTxid);
    expect(parsed.valid, `${mined.revealTxid} valid`).toBe(true);
    expect(parsed.transaction_type).toBe('broadcast');
    const recorded = await counterparty<{ text: string; source: string }>(`/broadcasts/${mined.revealTxid}`);
    expect(recorded.text).toBe('a site built this envelope');
    expect(sameScript(recorded.source, key.address)).toBe(true);
  }, 600_000);
});
