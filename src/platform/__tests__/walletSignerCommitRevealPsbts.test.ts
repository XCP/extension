/**
 * `WalletSigner.signCommitAndRevealPsbts`: a site's commit PSBT and unsigned reveal PSBT, signed in
 * one request behind one signing guard, over composes captured from Core 11.5. The commit is signed
 * by the real PSBT signer (prevouts re-read from their parent), the reveal by the real reveal signer
 * against commit output 0 as signed. A lock or identity change at any point returns nothing.
 *
 * The envelope-leaf guard is not loosened: the same leaf reaching the PSBT signer any other way is
 * still refused unless it is the one leaf the approval shows.
 */

import { schnorr } from '@noble/curves/secp256k1.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { SigHash, Transaction } from '@scure/btc-signer';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AddressFormat } from '@/core/bitcoin/addressFormat';
import { finalizePSBT, parsePSBT } from '@/core/bitcoin/psbt';
import { commitRevealPsbts, siteLaunch, siteLaunchItems } from '@/core/counterparty/__tests__/helpers/commitRevealPsbts';
import {
  BROADCAST_P2TR_INTERNAL,
  BROADCAST_P2TR_OUTPUT_KEY,
  BROADCAST_P2WPKH,
  type Fixture115,
  KEY_WPKH,
  MPMA_P2WPKH,
  ORD_BROADCAST_P2WPKH,
} from '@/core/counterparty/__tests__/taproot115Fixtures';
import { checkRevealSourceSignature, sourceOutputScript, TAPSCRIPT_LEAF_VERSION } from '@/core/counterparty/revealSourceRule';
import * as sessionManager from '@/platform/auth/sessionManager';
import { type SigningWalletState, WalletSigner } from '@/platform/walletSigner';
import type { CoinLock } from '@/types/coinLocks';
import type { Wallet } from '@/types/wallet';

const hooks = vi.hoisted(() => ({
  parents: new Map<string, string>(),
  afterRevealSigned: null as null | (() => Promise<void> | void),
}));

vi.mock('@/core/bitcoin/utxo', async (original) => ({
  ...(await original<typeof import('@/core/bitcoin/utxo')>()),
  fetchPreviousRawTransaction: async (txid: string) => hooks.parents.get(txid) ?? null,
}));

vi.mock('@/core/bitcoin/taprootRevealSigner', async (original) => {
  const actual = await original<typeof import('@/core/bitcoin/taprootRevealSigner')>();
  return {
    ...actual,
    signTaprootReveal: vi.fn((...args: Parameters<typeof actual.signTaprootReveal>) => {
      const signed = actual.signTaprootReveal(...args);
      const after = hooks.afterRevealSigned?.();
      if (after instanceof Promise) throw new Error('hooks must be synchronous here');
      return signed;
    }),
  };
});

const { signTaprootReveal } = await import('@/core/bitcoin/taprootRevealSigner');

const OTHER_ADDRESS = 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq';
const WALLET_ID = 'ab'.repeat(32);
const RAW = { allowUnknownOutputs: true, allowUnknownInputs: true, disableScriptCheck: true };

function walletFor(fixture: Fixture115, type: Wallet['type'] = 'privateKey'): Wallet {
  const p2tr = fixture.key.format === 'P2TR';
  return {
    id: WALLET_ID, name: 'Test', type, addressFormat: p2tr ? AddressFormat.P2TR : AddressFormat.P2WPKH, addressCount: 2,
    addresses: [
      { address: fixture.key.address, path: p2tr ? "m/86'/0'/0'/0/0" : "m/84'/0'/0'/0/0", name: 'Address 1', pubKey: fixture.key.publicKeyHex },
      { address: OTHER_ADDRESS, path: "m/84'/0'/0'/0/1", name: 'Address 2', pubKey: '' },
    ],
  } as Wallet;
}

let locks: CoinLock[] = [];
let wallet: Wallet;
let activeAddress: string;
const getPrivateKey = vi.fn();

const state: SigningWalletState = {
  getCoinLocks: () => locks,
  activeWalletId: () => wallet.id,
  getWalletById: (id) => (id === wallet.id ? wallet : undefined),
  getActiveWallet: () => wallet,
  lastActiveAddress: () => activeAddress,
  getPrivateKey: (...args) => getPrivateKey(...args),
  getPairedAddresses: async () => { throw new Error('unused'); },
};

let fill = 20;
function bundle(fixture: Fixture115) {
  const psbts = commitRevealPsbts(fixture, fixture.result, { fundedBy: { fill: fill++ } });
  const parent = Transaction.fromRaw(hexToBytes(psbts.parentHex!), RAW);
  hooks.parents.set(parent.id, psbts.parentHex!);
  const inputs = parsePSBT(psbts.commitHex).inputsLength;
  const indices = Array.from({ length: inputs }, (_, index) => index);
  return {
    psbts,
    commit: {
      psbtHex: psbts.commitHex,
      signInputs: { [fixture.key.address]: indices },
      sighashTypes: indices.map(() => psbts.commitSighash),
    },
  };
}

function use(fixture: Fixture115, type: Wallet['type'] = 'privateKey') {
  wallet = walletFor(fixture, type);
  activeAddress = fixture.key.address;
  getPrivateKey.mockReset();
  getPrivateKey.mockResolvedValue({ wif: '', hex: fixture.key.privateKeyHex, compressed: true });
}

describe('signing a site\'s commit and reveal PSBTs together', () => {
  beforeEach(async () => {
    await sessionManager.initializeSession(15 * 60 * 1000);
    sessionManager.storeUnlockedSecret(WALLET_ID, 'unlocked');
    hooks.afterRevealSigned = null;
    locks = [];
    vi.mocked(signTaprootReveal).mockClear();
    use(BROADCAST_P2WPKH);
  });

  it.each([BROADCAST_P2WPKH, BROADCAST_P2TR_INTERNAL])('requires unchanged lock consent for the commit and reveal ($key.format)', async fixture => {
    use(fixture);
    const { psbts, commit } = bundle(fixture);
    const input = parsePSBT(commit.psbtHex).getInput(0);
    const lock: CoinLock = { address: fixture.key.address, outpoint: `${bytesToHex(input.txid!)}:${input.index}`,
      kind: 'manual', manual: true, refs: [], valueSats: 100_000, origin: null, expiresAt: null,
      createdAt: 1, seenAt: null, unlocked: false };
    locks = [lock];
    const signer = new WalletSigner(state);
    await expect(signer.signPsbt(commit.psbtHex, commit.signInputs, commit.sighashTypes))
      .rejects.toThrow('A selected coin was locked');
    await expect(signer.signCommitAndRevealPsbts({ ...commit, approvedCoinLocks: [lock] }, psbts.revealHex, fixture.key.address))
      .resolves.toHaveLength(2);
    hooks.afterRevealSigned = () => { locks = [{ ...lock, createdAt: 2 }]; };
    await expect(signer.signCommitAndRevealPsbts({ ...commit, approvedCoinLocks: [lock] }, psbts.revealHex, fixture.key.address))
      .rejects.toThrow('A selected coin was locked');
  });

  it.each([
    ['P2WPKH, data envelope', BROADCAST_P2WPKH],
    ['P2WPKH, MPMA', MPMA_P2WPKH],
    ['P2WPKH, ord envelope', ORD_BROADCAST_P2WPKH],
    ['P2TR internal key', BROADCAST_P2TR_INTERNAL],
    ['P2TR output key', BROADCAST_P2TR_OUTPUT_KEY],
  ])('signs the commit and then the reveal with the source key (%s)', async (_name, fixture) => {
    use(fixture);
    const { psbts, commit } = bundle(fixture);
    const [signedCommit, signedReveal] = await new WalletSigner(state)
      .signCommitAndRevealPsbts(commit, psbts.revealHex, fixture.key.address);

    const commitTx = Transaction.fromRaw(hexToBytes(finalizePSBT(signedCommit)), RAW);
    expect(commitTx.id).toBe(psbts.commitTxid);
    const revealPsbt = parsePSBT(signedReveal);
    // Returned as a partial signature on the envelope leaf, for the site to finalize.
    expect(revealPsbt.getInput(0).tapScriptSig).toHaveLength(1);
    expect(revealPsbt.getInput(0).finalScriptWitness).toBeUndefined();

    const reveal = Transaction.fromRaw(hexToBytes(finalizePSBT(signedReveal)), RAW);
    const input = reveal.getInput(0);
    expect(bytesToHex(input.txid!)).toBe(commitTx.id);
    const output = commitTx.getOutput(0);
    const witness = input.finalScriptWitness!;
    const rule = checkRevealSourceSignature(output.script!, sourceOutputScript(fixture.key.address)!, witness);
    expect(rule.ok).toBe(true);
    // The signature verifies under BIP341's script-path sighash, by the leaf's key.
    const sighash = reveal.preimageWitnessV1(0, [output.script!], SigHash.DEFAULT, [output.amount!], undefined,
      witness[1]!, TAPSCRIPT_LEAF_VERSION);
    expect(rule.ok && schnorr.verify(witness[0]!, sighash, rule.leafKey)).toBe(true);
  });

  it('signs a site-built launch: the reveal ALL, by the tweaked key its leaf names', async () => {
    const launch = siteLaunch(5000, 0x51);
    hooks.parents.set(Transaction.fromRaw(hexToBytes(launch.parentHex), RAW).id, launch.parentHex);
    wallet = {
      id: WALLET_ID, name: 'Test', type: 'privateKey', addressFormat: AddressFormat.P2TR, addressCount: 1,
      addresses: [{ address: launch.address, path: "m/86'/0'/0'/0/0", name: 'Address 1', pubKey: '' }],
    } as Wallet;
    activeAddress = launch.address;
    getPrivateKey.mockResolvedValue({ wif: '', hex: launch.privateKeyHex, compressed: true });
    const items = siteLaunchItems(launch);
    const [signedCommit, signedReveal] = await new WalletSigner(state)
      .signCommitAndRevealPsbts(items.commit, launch.revealHex, launch.address, undefined, SigHash.ALL);

    const commitTx = Transaction.fromRaw(hexToBytes(finalizePSBT(signedCommit)), RAW);
    expect(commitTx.id).toBe(launch.commitTxid);
    const reveal = Transaction.fromRaw(hexToBytes(finalizePSBT(signedReveal)), RAW);
    const witness = reveal.getInput(0).finalScriptWitness!;
    const output = commitTx.getOutput(0);
    const rule = checkRevealSourceSignature(output.script!, sourceOutputScript(launch.address)!, witness);
    expect(rule.ok).toBe(true);
    expect(witness[0]).toHaveLength(65);
    expect(witness[0]![64]).toBe(SigHash.ALL);
    const sighash = reveal.preimageWitnessV1(0, [output.script!], SigHash.ALL, [output.amount!], undefined,
      witness[1]!, TAPSCRIPT_LEAF_VERSION);
    expect(rule.ok && schnorr.verify(witness[0]!.slice(0, 64), sighash, rule.leafKey)).toBe(true);
  });

  it('refuses a hardware wallet before reading any key', async () => {
    use(BROADCAST_P2WPKH, 'hardware');
    const { psbts, commit } = bundle(BROADCAST_P2WPKH);
    await expect(new WalletSigner(state).signCommitAndRevealPsbts(commit, psbts.revealHex, KEY_WPKH.address))
      .rejects.toThrow(/hardware wallet does not sign Taproot reveals/);
    expect(getPrivateKey).not.toHaveBeenCalled();
  });

  it('returns nothing when the wallet locks between the two signatures', async () => {
    const { psbts, commit } = bundle(BROADCAST_P2WPKH);
    // The commit reads the key first; the reveal's read finds the session gone.
    getPrivateKey.mockImplementationOnce(async () => ({ wif: '', hex: KEY_WPKH.privateKeyHex, compressed: true }))
      .mockImplementationOnce(async () => {
        await sessionManager.clearAllUnlockedSecrets();
        return { wif: '', hex: KEY_WPKH.privateKeyHex, compressed: true };
      });
    await expect(new WalletSigner(state).signCommitAndRevealPsbts(commit, psbts.revealHex, KEY_WPKH.address))
      .rejects.toThrow('Wallet session changed; please try again.');
    expect(signTaprootReveal).not.toHaveBeenCalled();
  });

  it('returns nothing when the wallet locks after the reveal is signed', async () => {
    const { psbts, commit } = bundle(BROADCAST_P2WPKH);
    hooks.afterRevealSigned = () => { void sessionManager.clearAllUnlockedSecrets(); };
    await expect(new WalletSigner(state).signCommitAndRevealPsbts(commit, psbts.revealHex, KEY_WPKH.address))
      .rejects.toThrow('Wallet session changed; please try again.');
  });

  it('returns nothing when the active address changes between the two signatures', async () => {
    const { psbts, commit } = bundle(BROADCAST_P2WPKH);
    getPrivateKey.mockImplementationOnce(async () => ({ wif: '', hex: KEY_WPKH.privateKeyHex, compressed: true }))
      .mockImplementationOnce(async () => {
        activeAddress = OTHER_ADDRESS;
        return { wif: '', hex: KEY_WPKH.privateKeyHex, compressed: true };
      });
    await expect(new WalletSigner(state).signCommitAndRevealPsbts(commit, psbts.revealHex, KEY_WPKH.address))
      .rejects.toThrow('The signing identity changed after this request was approved.');
    expect(signTaprootReveal).not.toHaveBeenCalled();
  });

  it('returns nothing when the reveal does not spend the signed commit', async () => {
    const { commit } = bundle(BROADCAST_P2WPKH);
    const other = commitRevealPsbts(BROADCAST_P2WPKH);
    await expect(new WalletSigner(state).signCommitAndRevealPsbts(commit, other.revealHex, KEY_WPKH.address))
      .rejects.toThrow(/does not spend the signed commit/);
    expect(signTaprootReveal).not.toHaveBeenCalled();
  });

  it('returns nothing when the reveal signer refuses the envelope key for another source', async () => {
    const { commit, psbts } = bundle(BROADCAST_P2WPKH);
    // Asked to publish from the wallet's other address, whose key does not close the envelope.
    await expect(new WalletSigner(state).signCommitAndRevealPsbts(commit, psbts.revealHex, OTHER_ADDRESS))
      .rejects.toThrow(/The reveal was not signed/);
  });
});

describe('the envelope-leaf guard is unchanged for every other PSBT', () => {
  beforeEach(async () => {
    await sessionManager.initializeSession(15 * 60 * 1000);
    sessionManager.storeUnlockedSecret(WALLET_ID, 'unlocked');
    use(BROADCAST_P2WPKH);
  });

  /** The bundle's reveal input and outputs, rebuilt by `build` into a new PSBT; its commit resolvable. */
  function revealWith(build: (input: Parameters<Transaction['addInput']>[0], outputs: { script: Uint8Array; amount: bigint }[]) => Transaction): string {
    const { psbts } = bundle(BROADCAST_P2WPKH);
    hooks.parents.set(psbts.commitTxid, bytesToHex(parsePSBT(psbts.commitHex).toBytes(true, false)));
    const reveal = parsePSBT(psbts.revealHex);
    const outputs = Array.from({ length: reveal.outputsLength }, (_, index) =>
      reveal.getOutput(index) as { script: Uint8Array; amount: bigint });
    return bytesToHex(build(reveal.getInput(0) as Parameters<Transaction['addInput']>[0], outputs).toPSBT());
  }

  it('refuses the same leaf when the reveal lacks the marker, so no message is shown', async () => {
    const psbt = revealWith((input) => {
      const fresh = new Transaction(RAW);
      fresh.addInput(input);
      fresh.addOutput({ script: hexToBytes('6a04deadbeef'), amount: 0n });
      return fresh;
    });
    await expect(new WalletSigner(state).signPsbt(psbt, { [KEY_WPKH.address]: [0] }, [0x00]))
      .rejects.toThrow(/approval did not show/);
  });

  it('refuses the same leaf on any input but 0', async () => {
    const other = bundle(BROADCAST_P2WPKH);
    const parent = parsePSBT(other.commit.psbtHex);
    hooks.parents.set(other.psbts.commitTxid, bytesToHex(parent.toBytes(true, false)));
    const psbt = revealWith((input, outputs) => {
      const fresh = new Transaction(RAW);
      fresh.addInput({ txid: hexToBytes(other.psbts.commitTxid), index: 1,
        witnessUtxo: { script: parent.getOutput(1).script!, amount: parent.getOutput(1).amount! } });
      fresh.addInput(input);
      for (const output of outputs) fresh.addOutput(output);
      return fresh;
    });
    await expect(new WalletSigner(state).signPsbt(psbt, { [KEY_WPKH.address]: [1] }, [0x00, 0x00]))
      .rejects.toThrow(/approval did not show/);
  });
});
