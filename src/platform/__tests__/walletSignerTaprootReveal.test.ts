/**
 * `WalletSigner.signCommitAndReveal`: the commit and its reveal are signed in one request, behind
 * one signing guard. A lock or an identity change at any point between the two signatures stops
 * both; nothing is returned, so nothing can be broadcast. The commit is signed by the real
 * software signer and the reveal by the real reveal signer, over a compose captured from Core 11.5.
 */

import { hexToBytes } from '@noble/hashes/utils.js';
import { Transaction } from '@scure/btc-signer';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AddressFormat } from '@/core/bitcoin/addressFormat';
import { BROADCAST_P2WPKH, KEY_WPKH, MPMA_P2WPKH } from '@/core/counterparty/__tests__/taproot115Fixtures';
import { checkRevealSourceSignature, sourceOutputScript } from '@/core/counterparty/revealSourceRule';
import * as sessionManager from '@/platform/auth/sessionManager';
import { type SigningWalletState, WalletSigner } from '@/platform/walletSigner';
import type { Wallet } from '@/types/wallet';

const hooks = vi.hoisted(() => ({ afterCommitSigned: null as null | (() => Promise<void> | void) }));

vi.mock('@/core/bitcoin/transactionSigner', async (original) => {
  const actual = await original<typeof import('@/core/bitcoin/transactionSigner')>();
  return {
    ...actual,
    signTransaction: vi.fn(async (...args: Parameters<typeof actual.signTransaction>) => {
      const signed = await actual.signTransaction(...args);
      await hooks.afterCommitSigned?.();
      return signed;
    }),
  };
});

vi.mock('@/core/bitcoin/taprootRevealSigner', async (original) => {
  const actual = await original<typeof import('@/core/bitcoin/taprootRevealSigner')>();
  return { ...actual, signTaprootReveal: vi.fn(actual.signTaprootReveal) };
});

const { signTaprootReveal } = await import('@/core/bitcoin/taprootRevealSigner');

const OTHER_ADDRESS = 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq';

function walletOf(type: Wallet['type']): Wallet {
  return {
    id: 'wallet', name: 'Test', type, addressFormat: AddressFormat.P2WPKH, addressCount: 2,
    addresses: [
      { address: KEY_WPKH.address, path: "m/84'/0'/0'/0/0", name: 'Address 1', pubKey: KEY_WPKH.publicKeyHex },
      { address: OTHER_ADDRESS, path: "m/84'/0'/0'/0/1", name: 'Address 2', pubKey: '' },
    ],
  } as Wallet;
}

let wallet: Wallet;
let activeAddress: string;
const getPrivateKey = vi.fn();

const state: SigningWalletState = {
  activeWalletId: () => wallet.id,
  getWalletById: (id) => (id === wallet.id ? wallet : undefined),
  getActiveWallet: () => wallet,
  lastActiveAddress: () => activeAddress,
  getPrivateKey: (...args) => getPrivateKey(...args),
  getPairedAddresses: async () => { throw new Error('unused'); },
};

const { result } = BROADCAST_P2WPKH;
const REVEAL = {
  revealHex: result.reveal_rawtransaction,
  envelopeScriptHex: result.envelope_script,
  controlBlockHex: result.reveal_control_block,
};
const OPTIONS = { inputValues: result.inputs_values, lockScripts: result.lock_scripts };

function sign(reveal = REVEAL) {
  return new WalletSigner(state).signCommitAndReveal(result.rawtransaction, KEY_WPKH.address, reveal, OPTIONS);
}

describe('signing a Taproot commit and its reveal together', () => {
  beforeEach(async () => {
    // An unlocked session, fresh for each test: the lock tests end theirs.
    await sessionManager.initializeSession(15 * 60 * 1000);
    wallet = walletOf('mnemonic');
    activeAddress = KEY_WPKH.address;
    hooks.afterCommitSigned = null;
    vi.mocked(signTaprootReveal).mockClear();
    getPrivateKey.mockReset();
    getPrivateKey.mockResolvedValue({ wif: '', hex: KEY_WPKH.privateKeyHex, compressed: true });
  });

  it('signs the commit, then the reveal with the source key, and returns both', async () => {
    const { signedTxHex, signedRevealHex } = await sign();

    const commit = Transaction.fromRaw(hexToBytes(signedTxHex), { allowUnknownOutputs: true });
    const unsignedCommit = Transaction.fromRaw(hexToBytes(result.rawtransaction), { allowUnknownOutputs: true });
    expect(commit.id).toBe(unsignedCommit.id);
    expect(commit.getInput(0).finalScriptWitness).toHaveLength(2);

    const reveal = Transaction.fromRaw(hexToBytes(signedRevealHex), { allowUnknownOutputs: true });
    const input = reveal.getInput(0);
    expect(Buffer.from(input.txid!).toString('hex')).toBe(commit.id);
    expect(checkRevealSourceSignature(hexToBytes(result.reveal_lock_scripts[0]!), sourceOutputScript(KEY_WPKH.address)!,
      input.finalScriptWitness!).ok).toBe(true);
    // One key read serves both signatures.
    expect(getPrivateKey).toHaveBeenCalledTimes(1);
  });

  it('refuses a hardware wallet before reading any key', async () => {
    wallet = walletOf('hardware');
    await expect(sign()).rejects.toThrow(/hardware wallet does not sign Taproot reveals/);
    expect(getPrivateKey).not.toHaveBeenCalled();
  });

  it('stops both signatures when the wallet locks between them', async () => {
    hooks.afterCommitSigned = () => sessionManager.clearAllUnlockedSecrets();
    await expect(sign()).rejects.toThrow('Wallet session changed; please try again.');
    expect(signTaprootReveal).not.toHaveBeenCalled();
  });

  it('stops both signatures when the active address changes between them', async () => {
    hooks.afterCommitSigned = () => { activeAddress = OTHER_ADDRESS; };
    await expect(sign()).rejects.toThrow('The signing identity changed after this request was approved.');
    expect(signTaprootReveal).not.toHaveBeenCalled();
  });

  it('stops before the commit is signed when the wallet locks while the key is read', async () => {
    getPrivateKey.mockImplementation(async () => {
      await sessionManager.clearAllUnlockedSecrets();
      return { wif: '', hex: KEY_WPKH.privateKeyHex, compressed: true };
    });
    await expect(sign()).rejects.toThrow('Wallet session changed; please try again.');
    expect(signTaprootReveal).not.toHaveBeenCalled();
  });

  it('returns nothing when the reveal does not spend the signed commit', async () => {
    await expect(sign({ ...REVEAL, revealHex: MPMA_P2WPKH.result.reveal_rawtransaction }))
      .rejects.toThrow(/does not spend the signed commit/);
    expect(signTaprootReveal).not.toHaveBeenCalled();
  });

  it('returns nothing when the reveal signer refuses the envelope', async () => {
    await expect(sign({ ...REVEAL, envelopeScriptHex: MPMA_P2WPKH.result.envelope_script }))
      .rejects.toThrow(/The reveal was not signed/);
  });
});
