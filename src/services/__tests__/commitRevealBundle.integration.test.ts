import type { CoinLock } from '@/types/coinLocks';
/**
 * A site's `commit-and-reveal` bundle end to end, on PSBTs built from composes captured from Core
 * 11.5: the stored request, the background review (the pair's proof, the commit decoded with its
 * reveal, the leaf guard, the policy), and the real WalletSigner signing both transactions with a
 * software key. Only wallet/session state and remote lookups are simulated. No broadcast.
 *
 * A clean pair is reviewed with its message and both fees and signed as a whole; anything the proof
 * refuses, an API older than 11.5, a hardware wallet or a lock mid-signing leaves nothing signed and
 * nothing returned. The same reveal sent alone through `xcp_signPsbt` is still refused.
 */

import { secp256k1 } from '@noble/curves/secp256k1.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { p2wpkh, Transaction } from '@scure/btc-signer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { AddressFormat } from '@/core/bitcoin/addressFormat';
import { setCoinLockStore } from '@/core/bitcoin/coinLockStore';

import { finalizePSBT, parsePSBT } from '@/core/bitcoin/psbt';
import {
  commitRevealItems,
  commitRevealPsbts,
  SITE_BURN_ADDRESS,
  siteLaunch,
  siteLaunchItems,
} from '@/core/counterparty/__tests__/helpers/commitRevealPsbts';
import {
  BROADCAST_P2TR_INTERNAL,
  BROADCAST_P2TR_OUTPUT_KEY,
  BROADCAST_P2WPKH,
  envelopeClosedBy,
  type Fixture115,
  ORD_BROADCAST_P2WPKH,
  recompose115,
} from '@/core/counterparty/__tests__/taproot115Fixtures';
import { checkRevealSourceSignature, sourceOutputScript } from '@/core/counterparty/revealSourceRule';
import { beginSignFlow, getSignFlow } from '@/platform/provider/signFlow';
import { WalletSigner } from '@/platform/walletSigner';
import { createProviderSigningService } from '@/services/providerSigningService';
import type { Wallet } from '@/types/wallet';

const state = vi.hoisted(() => ({
  userAddress: '',
  generation: 0,
  parents: new Map<string, string>(),
  api: { supported: true, reason: undefined as string | undefined },
  keyReads: 0,
  lockOnKeyRead: 0,
  wallet: {
    isKeychainUnlocked: vi.fn(async () => true), getActiveWallet: vi.fn(),
    getActiveAddress: vi.fn(), getSettings: vi.fn(async () => ({ strictTransactionVerification: true })),
    signPsbt: vi.fn(), signCommitAndRevealPsbts: vi.fn(), getPairedAddresses: vi.fn(),
  },
}));
vi.mock('@/services/walletService', () => ({ getWalletService: () => state.wallet }));
vi.mock('@/platform/auth/sessionManager', () => ({
  getSessionGeneration: () => state.generation,
  assertSessionGeneration: (generation: number) => {
    if (generation !== state.generation) throw new Error('Wallet session changed; please try again.');
  },
  getUnlockedSecret: async () => 'unlocked', unlockedHdNodeCache: () => undefined,
}));
vi.mock('@/services/connectionService', () => ({ getConnectionService: () => ({
  hasPermission: async () => true, hasPairedAddressPermission: async () => false,
}) }));
vi.mock('@/services/eventEmitterService', () => ({ eventEmitterService: { emit: vi.fn() } }));
vi.mock('@/platform/walletManager', () => ({ walletManager: {
  getSettings: () => ({ connectedWebsites: ['https://site.invalid'] }),
  getActiveWallet: () => ({ id: 'wallet', addresses: [{ address: state.userAddress }] }),
} }));
vi.mock('@/core/settings', () => ({ getActiveSettings: () => ({ zeldHuntSeconds: 0 }) }));
vi.mock('@/core/counterparty/capabilities', () => ({
  getCounterpartyFeatureStatus: async () => ({ supported: state.api.supported, reason: state.api.reason, serverInfo: {} }),
}));
vi.mock('@/core/counterparty/api', () => ({
  fetchUtxoBalances: async () => ({ result: [] }),
  fetchBackendTransaction: async (txid: string) => {
    const hex = state.parents.get(txid);
    if (!hex) throw new Error('No such transaction');
    return { hex, confirmations: 6 };
  },
  fetchLedgerHeights: async () => ({ backendHeight: 900_000, counterpartyHeight: 900_000 }),
}));
vi.mock('@/core/bitcoin/utxo', async importOriginal => ({
  ...(await importOriginal<typeof import('@/core/bitcoin/utxo')>()),
  fetchPreviousRawTransaction: async (txid: string) => state.parents.get(txid) ?? null,
  fetchTransactionChainStatus: async () => null,
}));
vi.mock('@/core/counterparty/transaction', () => ({ decodeCounterpartyMessage: async () => undefined }));
vi.mock('@/core/counterparty/sourcePubkey', () => ({ getSourcePubkey: () => undefined }));
vi.mock('@/core/bitcoin/feeRate', () => ({ getFeeRates: async () => ({ fastestFee: 2 }) }));
vi.mock('@/core/zeld/protection', () => ({ classifyZeldOutpoints: async (inputs: unknown[]) => ({
  bearing: [], unknown: [], clean: inputs,
}) }));

const RAW = { allowUnknownOutputs: true, allowUnknownInputs: true, disableScriptCheck: true };
const ORIGIN = 'https://site.invalid';

let wallet: Wallet;
let signer: WalletSigner;

function use(fixture: Fixture115, type: Wallet['type'] = 'privateKey') {
  const p2tr = fixture.key.format === 'P2TR';
  state.userAddress = fixture.key.address;
  wallet = {
    id: 'wallet', name: 'Test', type, addressFormat: p2tr ? AddressFormat.P2TR : AddressFormat.P2WPKH, addressCount: 1,
    addresses: [{ name: 'Address 1', path: p2tr ? "m/86'/0'/0'/0/0" : "m/84'/0'/0'/0/0", address: fixture.key.address, pubKey: fixture.key.publicKeyHex }],
  } as Wallet;
  signer = new WalletSigner({
    getCoinLocks: () => [],
    activeWalletId: () => wallet.id,
    getWalletById: id => (id === wallet.id ? wallet : undefined),
    getActiveWallet: () => wallet,
    lastActiveAddress: () => fixture.key.address,
    getPrivateKey: async () => {
      state.keyReads += 1;
      if (state.keyReads === state.lockOnKeyRead) state.generation += 1;
      return { hex: fixture.key.privateKeyHex, wif: 'unused', compressed: true };
    },
    getPairedAddresses: async () => { throw new Error('no pair'); },
  });
  state.wallet.getActiveWallet.mockResolvedValue(wallet);
  state.wallet.getActiveAddress.mockResolvedValue({ address: fixture.key.address });
}

let fill = 40;
/** The fixture's pair, its commit re-funded from a parent the prevout checks can read. */
function pair(fixture: Fixture115, result = fixture.result) {
  const psbts = commitRevealPsbts(fixture, result, { fundedBy: { fill: fill++ } });
  state.parents.set(Transaction.fromRaw(hexToBytes(psbts.parentHex!), RAW).id, psbts.parentHex!);
  return { psbts, items: commitRevealItems(fixture, psbts) };
}

async function review(fixture: Fixture115, items: ReturnType<typeof commitRevealItems>) {
  const id = crypto.randomUUID();
  await beginSignFlow({
    id, walletId: wallet.id, address: fixture.key.address, origin: ORIGIN, timestamp: Date.now(), requestKey: id,
    kind: 'sign-psbts', bundleKind: 'commit-and-reveal',
    items: [
      { ...items.commit, marketplaceIntent: { standard: 'counterparty-reveal', version: 1, action: 'fund_commit' } },
      { ...items.reveal, marketplaceIntent: { standard: 'counterparty-reveal', version: 1, action: 'sign_reveal' } },
    ],
  });
  const result = await createProviderSigningService().getReview(id);
  if (result.kind !== 'sign-psbts') throw new Error('wrong kind');
  return result;
}

const approve = (result: Awaited<ReturnType<typeof review>>) => createProviderSigningService()
  .approveAndSign(result.request.id, { reviewKey: result.reviewKey, risksAcknowledged: true });

async function signedHexes(id: string): Promise<string[] | null> {
  const flow = await getSignFlow(id);
  return flow?.status === 'completed' ? (flow.result as { signedPsbtHexes: string[] }).signedPsbtHexes : null;
}

beforeEach(() => {
  fakeBrowser.reset(); vi.stubGlobal('chrome', fakeBrowser);
  state.parents.clear();
  state.generation = 0;
  state.keyReads = 0;
  state.lockOnKeyRead = 0;
  state.api = { supported: true, reason: undefined };
  state.wallet.signPsbt.mockReset();
  state.wallet.signPsbt.mockImplementation((...args: Parameters<WalletSigner['signPsbt']>) => signer.signPsbt(...args));
  state.wallet.signCommitAndRevealPsbts.mockReset();
  state.wallet.signCommitAndRevealPsbts.mockImplementation(
    (...args: Parameters<WalletSigner['signCommitAndRevealPsbts']>) => signer.signCommitAndRevealPsbts(...args));
});
afterEach(() => { setCoinLockStore(null); vi.unstubAllGlobals(); });

describe('commit-and-reveal through the background review and signer', () => {
  it.each([false, true])('keeps a locked commit coin until both signatures succeed (interrupted: %s)', async interrupted => {
    use(BROADCAST_P2WPKH);
    const { items } = pair(BROADCAST_P2WPKH);
    const input = parsePSBT(items.commit.psbtHex).getInput(0);
    const outpoint = `${bytesToHex(input.txid!)}:${input.index}`;
    const lock: CoinLock = {
      outpoint, address: state.userAddress, kind: 'manual', manual: true, refs: [],
      valueSats: Number(input.witnessUtxo!.amount), origin: null, expiresAt: null,
      createdAt: Date.now(), seenAt: Date.now(), unlocked: false,
    };
    const update = vi.fn(async () => {});
    const commit = vi.fn(async () => {});
    setCoinLockStore({ read: async () => [lock], update, commit });
    const result = await review(BROADCAST_P2WPKH, items);
    expect(result.policy.blocked).toBe(false);
    expect(result.policy.requiresAcknowledgement).toBe(true);
    expect(result.decodedInfo.policyWarnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'locked_coin_spend' }),
    ]));
    await expect(createProviderSigningService().approveAndSign(result.request.id, {
      reviewKey: result.reviewKey, risksAcknowledged: false,
    })).rejects.toThrow();
    expect(state.keyReads).toBe(0);
    expect(update).not.toHaveBeenCalled();

    // The second key read is the reveal; interrupt after the commit has been signed.
    if (interrupted) state.lockOnKeyRead = 2;
    if (interrupted) {
      await expect(approve(result)).rejects.toThrow();
      expect(update).not.toHaveBeenCalled();
      expect(await signedHexes(result.request.id)).toBeNull();
    } else {
      await approve(result);
      expect(await signedHexes(result.request.id)).toHaveLength(2);
      expect(update).toHaveBeenCalledExactlyOnceWith(state.userAddress, { unlock: [outpoint] });
    }
    // A reveal intent never creates an offer lock.
    expect(commit).not.toHaveBeenCalled();
  });

  it.each([
    ['P2WPKH, data envelope', BROADCAST_P2WPKH],
    ['P2WPKH, ord envelope', ORD_BROADCAST_P2WPKH],
    ['P2TR internal key', BROADCAST_P2TR_INTERNAL],
    ['P2TR output key', BROADCAST_P2TR_OUTPUT_KEY],
  ])('reviews the message and both fees, then signs both (%s)', async (_name, fixture) => {
    use(fixture);
    const { psbts, items } = pair(fixture);
    const result = await review(fixture, items);

    expect(result.decodedInfo.review).toMatchObject({ status: 'proved', family: 'commit_and_reveal', blockers: [] });
    expect(result.decodedInfo.policyWarnings ?? []).toEqual([]);
    expect(result.policy.blocked).toBe(false);
    const commit = result.decodedInfo.items[0]!;
    if (!('safety' in commit)) throw new Error('the commit was not analyzed');
    expect(commit.verification.localUnpack?.messageType).toBe('broadcast');
    expect(commit.verifiedCommit?.kind).toBe('reveal');
    const values = result.decodedInfo.review.facts.map(fact => fact.value);
    expect(values).toContain(fixture.key.address);
    expect(values).toContain(`${fixture.result.btc_fee.toLocaleString('en-US')} sats`);
    // The leaf guard found nothing unshown on either transaction.
    expect((result.decodedInfo.policyWarnings ?? []).map(warning => warning.code)).not.toContain('unshown_envelope_signature');

    await approve(result);
    const hexes = await signedHexes(result.request.id);
    expect(hexes).toHaveLength(2);
    const commitTx = Transaction.fromRaw(hexToBytes(finalizePSBT(hexes![0]!)), RAW);
    expect(commitTx.id).toBe(psbts.commitTxid);
    const reveal = Transaction.fromRaw(hexToBytes(finalizePSBT(hexes![1]!)), RAW);
    expect(bytesToHex(reveal.getInput(0).txid!)).toBe(commitTx.id);
    expect(checkRevealSourceSignature(commitTx.getOutput(0).script!, sourceOutputScript(fixture.key.address)!,
      reveal.getInput(0).finalScriptWitness!).ok).toBe(true);
    // Signed by the reveal signer, never by the PSBT signer.
    expect(state.wallet.signPsbt).not.toHaveBeenCalled();
  });

  it('asks for a second look when the reveal pays someone else', async () => {
    use(BROADCAST_P2WPKH);
    const stranger = p2wpkh(secp256k1.getPublicKey(new Uint8Array(32).fill(8), true));
    const psbts = commitRevealPsbts(BROADCAST_P2WPKH, BROADCAST_P2WPKH.result, {
      fundedBy: { fill: fill++ },
      editReveal: reveal => reveal.addOutput({ script: stranger.script, amount: 300n }),
    });
    state.parents.set(Transaction.fromRaw(hexToBytes(psbts.parentHex!), RAW).id, psbts.parentHex!);
    const result = await review(BROADCAST_P2WPKH, commitRevealItems(BROADCAST_P2WPKH, psbts));

    expect(result.decodedInfo.review.status).toBe('proved');
    expect(result.policy.blocked).toBe(false);
    expect(result.policy.requiresAcknowledgement).toBe(true);
    expect(result.decodedInfo.review.facts.find(fact => fact.value === stranger.address)?.description).toMatch(/300/);
  });

  it('reviews and signs a site-built launch, naming its burn output', async () => {
    const launch = siteLaunch(5000, 0x61);
    state.parents.set(Transaction.fromRaw(hexToBytes(launch.parentHex), RAW).id, launch.parentHex);
    state.userAddress = launch.address;
    wallet = {
      id: 'wallet', name: 'Test', type: 'privateKey', addressFormat: AddressFormat.P2TR, addressCount: 1,
      addresses: [{ name: 'Address 1', path: "m/86'/0'/0'/0/0", address: launch.address, pubKey: '' }],
    } as Wallet;
    signer = new WalletSigner({
    getCoinLocks: () => [],
      activeWalletId: () => wallet.id, getWalletById: id => (id === wallet.id ? wallet : undefined),
      getActiveWallet: () => wallet, lastActiveAddress: () => launch.address,
      getPrivateKey: async () => ({ hex: launch.privateKeyHex, wif: 'unused', compressed: true }),
      getPairedAddresses: async () => { throw new Error('no pair'); },
    });
    state.wallet.getActiveWallet.mockResolvedValue(wallet);
    state.wallet.getActiveAddress.mockResolvedValue({ address: launch.address });
    const result = await review({ key: { address: launch.address } } as Fixture115, siteLaunchItems(launch));

    expect(result.decodedInfo.review).toMatchObject({ status: 'proved', family: 'commit_and_reveal' });
    const commit = result.decodedInfo.items[0]!;
    if (!('safety' in commit)) throw new Error('the commit was not analyzed');
    expect(commit.verification.localUnpack?.messageType).toBe('fairminter');
    const burn = result.decodedInfo.review.facts.find(fact => fact.value === SITE_BURN_ADDRESS);
    expect(burn?.description).toMatch(/burn address/);
    // Burn dust is named on the review, and needs no second look: a site launch signs cleanly, with
    // none of the cards that describe a reveal a site holds.
    expect(result.policy.blocked).toBe(false);
    expect(result.policy.requiresAcknowledgement).toBe(false);
    expect(commit.safety.warnings.map(warning => warning.code))
      .not.toEqual(expect.arrayContaining(['counterparty_reveal_commit']));
    expect(commit.safety.warnings.map(warning => warning.code))
      .not.toEqual(expect.arrayContaining(['counterparty_reveal_outputs']));

    await approve(result);
    const hexes = await signedHexes(result.request.id);
    expect(hexes).toHaveLength(2);
    const commitTx = Transaction.fromRaw(hexToBytes(finalizePSBT(hexes![0]!)), RAW);
    const reveal = Transaction.fromRaw(hexToBytes(finalizePSBT(hexes![1]!)), RAW);
    expect(checkRevealSourceSignature(commitTx.getOutput(0).script!, sourceOutputScript(launch.address)!,
      reveal.getInput(0).finalScriptWitness!).ok).toBe(true);
  });

  it.each([
    ['an envelope closed by another key', () => recompose115(BROADCAST_P2WPKH, {
      envelope: envelopeClosedBy(BROADCAST_P2WPKH, BROADCAST_P2TR_INTERNAL.result.reveal_pubkey
        ? hexToBytes(BROADCAST_P2TR_INTERNAL.result.reveal_pubkey) : new Uint8Array(32)),
    })],
    ['a commit output hiding a second leaf', () => recompose115(BROADCAST_P2WPKH, { extraLeaf: '51' })],
    ['a reveal fee far above any sane rate', () => recompose115(BROADCAST_P2WPKH, { commitValue: 5_000_000 })],
  ])('blocks %s and signs nothing', async (_name, compose) => {
    use(BROADCAST_P2WPKH);
    const { items } = pair(BROADCAST_P2WPKH, compose());
    const result = await review(BROADCAST_P2WPKH, items);
    expect(result.decodedInfo.review.status).toBe('blocked');
    expect(result.policy.blocked).toBe(true);
    await expect(approve(result)).rejects.toThrow(/did not pass/);
    expect(state.wallet.signCommitAndRevealPsbts).not.toHaveBeenCalled();
    expect(await signedHexes(result.request.id)).toBeNull();
  });

  it('blocks a reveal that spends another output of the commit', async () => {
    use(BROADCAST_P2WPKH);
    const psbts = commitRevealPsbts(BROADCAST_P2WPKH, BROADCAST_P2WPKH.result, {
      fundedBy: { fill: fill++ },
      editRevealInput: input => ({ ...input, index: 1 }) as typeof input,
    });
    state.parents.set(Transaction.fromRaw(hexToBytes(psbts.parentHex!), RAW).id, psbts.parentHex!);
    const result = await review(BROADCAST_P2WPKH, commitRevealItems(BROADCAST_P2WPKH, psbts));
    expect(result.decodedInfo.review.blockers.join('; ')).toMatch(/does not spend output 0/);
    await expect(approve(result)).rejects.toThrow(/did not pass/);
    expect(state.wallet.signCommitAndRevealPsbts).not.toHaveBeenCalled();
  });

  it.each([
    ['a relative timelock', { editRevealInput: (input: Parameters<Transaction['addInput']>[0]) => ({ ...input, sequence: 144 }) },
      /delays it past the commit/],
    ['an enforced locktime', {
      revealHeader: { lockTime: 2_000_000 },
      editRevealInput: (input: Parameters<Transaction['addInput']>[0]) => ({ ...input, sequence: 0xfffffffd }),
    }, /locktime its input sequence enforces/],
    ['no fee', { editReveal: (reveal: Transaction) => reveal.addOutput({
      script: p2wpkh(secp256k1.getPublicKey(new Uint8Array(32).fill(8), true)).script,
      amount: BigInt(BROADCAST_P2WPKH.result.reveal_inputs_values[0]!),
    }) }, /minimum relay fee/],
  ])('blocks a reveal that could not confirm after its commit (%s), at review and at the click', async (_name, options, reason) => {
    use(BROADCAST_P2WPKH);
    const psbts = commitRevealPsbts(BROADCAST_P2WPKH, BROADCAST_P2WPKH.result, { fundedBy: { fill: fill++ }, ...options });
    state.parents.set(Transaction.fromRaw(hexToBytes(psbts.parentHex!), RAW).id, psbts.parentHex!);
    const result = await review(BROADCAST_P2WPKH, commitRevealItems(BROADCAST_P2WPKH, psbts));
    expect(result.decodedInfo.review.status).toBe('blocked');
    expect(result.decodedInfo.review.blockers.join('; ')).toMatch(reason);
    expect(result.policy.blocked).toBe(true);
    await expect(approve(result)).rejects.toThrow(/did not pass/);
    expect(state.wallet.signCommitAndRevealPsbts).not.toHaveBeenCalled();
    expect(await signedHexes(result.request.id)).toBeNull();
  });

  it('blocks against a Counterparty API older than 11.5', async () => {
    use(BROADCAST_P2WPKH);
    state.api = { supported: false, reason: 'Taproot encoding and inscriptions need Counterparty API 11.5.0 or newer.' };
    const { items } = pair(BROADCAST_P2WPKH);
    const result = await review(BROADCAST_P2WPKH, items);
    expect(result.decodedInfo.review.status).toBe('blocked');
    expect(result.decodedInfo.review.blockers.join('; ')).toMatch(/11\.5/);
    await expect(approve(result)).rejects.toThrow(/did not pass/);
    expect(state.wallet.signCommitAndRevealPsbts).not.toHaveBeenCalled();
  });

  it('returns nothing from a hardware wallet', async () => {
    use(BROADCAST_P2WPKH, 'hardware');
    const { items } = pair(BROADCAST_P2WPKH);
    const result = await review(BROADCAST_P2WPKH, items);
    await expect(approve(result)).rejects.toThrow(/hardware wallet does not sign Taproot reveals/);
    expect(await signedHexes(result.request.id)).toBeNull();
    expect((await getSignFlow(result.request.id))?.status).toBe('cancelled');
  });

  it('returns nothing when the wallet locks between the commit and the reveal', async () => {
    use(BROADCAST_P2WPKH);
    const { items } = pair(BROADCAST_P2WPKH);
    const result = await review(BROADCAST_P2WPKH, items);
    // The commit reads the key first; the session ends as the reveal's key is read.
    state.lockOnKeyRead = 2;
    await expect(approve(result)).rejects.toThrow(/Wallet session changed/);
    expect(await signedHexes(result.request.id)).toBeNull();
    expect((await getSignFlow(result.request.id))?.status).toBe('cancelled');
  });

  it('still refuses the same reveal sent alone through xcp_signPsbt', async () => {
    use(BROADCAST_P2WPKH);
    const { psbts } = pair(BROADCAST_P2WPKH);
    // The commit is resolvable, as it would be once broadcast.
    state.parents.set(psbts.commitTxid, bytesToHex(parsePSBT(psbts.commitHex).toBytes(true, false)));
    const id = crypto.randomUUID();
    await beginSignFlow({
      id, walletId: wallet.id, address: BROADCAST_P2WPKH.key.address, origin: ORIGIN, timestamp: Date.now(),
      requestKey: id, kind: 'sign-psbt', psbtHex: psbts.revealHex,
      signInputs: { [BROADCAST_P2WPKH.key.address]: [0] }, sighashTypes: [0x00],
    });
    // A leaf closed by the SegWit key names no address of the wallet's as its owner.
    await expect(createProviderSigningService().getReview(id)).rejects.toThrow(/does not belong to address/);
    expect(state.wallet.signPsbt).not.toHaveBeenCalled();
  });

  it('still blocks the same reveal sent alone when its leaf names the Taproot address of the wallet', async () => {
    use(BROADCAST_P2TR_OUTPUT_KEY);
    const { psbts } = pair(BROADCAST_P2TR_OUTPUT_KEY);
    state.parents.set(psbts.commitTxid, bytesToHex(parsePSBT(psbts.commitHex).toBytes(true, false)));
    const id = crypto.randomUUID();
    await beginSignFlow({
      id, walletId: wallet.id, address: BROADCAST_P2TR_OUTPUT_KEY.key.address, origin: ORIGIN, timestamp: Date.now(),
      requestKey: id, kind: 'sign-psbt', psbtHex: psbts.revealHex,
      signInputs: { [BROADCAST_P2TR_OUTPUT_KEY.key.address]: [0] }, sighashTypes: [0x00],
    });
    const result = await createProviderSigningService().getReview(id);
    if (result.kind !== 'sign-psbt') throw new Error('wrong kind');
    // A single PSBT shows a leaf's message only for an ord envelope; this data envelope is unshown.
    expect(result.policy.blocked).toBe(true);
    expect(result.decodedInfo.safety.warnings[0]).toMatchObject({ code: 'unshown_envelope_signature', severity: 'block' });
    await expect(createProviderSigningService().approveAndSign(id, { reviewKey: result.reviewKey, risksAcknowledged: true }))
      .rejects.toThrow(/did not pass/);
    expect(state.wallet.signPsbt).not.toHaveBeenCalled();
  });
});
