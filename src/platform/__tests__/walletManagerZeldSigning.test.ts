import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { getPublicKey } from '@noble/secp256k1';
import { p2pkh, Transaction } from '@scure/btc-signer';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AddressFormat } from '@/core/bitcoin/address';
import { assertOnlyNonceChanged } from '@/core/zeld/huntTemplate';
import { unsignedFormOf } from '@/core/zeld/legacyHunt';
import * as signingHunt from '@/core/zeld/signHunt';
import { WalletManager } from '@/platform/walletManager';
import type { Wallet } from '@/types/wallet';

const session = vi.hoisted(() => ({ generation: 1 }));
vi.mock('@/platform/zeldHunt', async () => ({
  huntInBackground: (await import('@/core/zeld/hunt')).huntTxid,
}));
vi.mock('@/platform/auth/sessionManager', async original => ({
  ...(await original<typeof import('@/platform/auth/sessionManager')>()),
  getSessionGeneration: () => session.generation,
  assertSessionGeneration: (generation: number) => {
    if (generation !== session.generation) throw new Error('Wallet session changed');
  },
}));
vi.mock('@/platform/provider/recentBroadcasts', () => ({
  getTrustedBroadcastPrevout: async () => ({ txid: parent.id, vout: 0, address: own.address,
    value: 100_000, scriptPubKey: bytesToHex(own.script), rawTxHex: bytesToHex(parent.unsignedTx) }),
}));

const key = '02'.padStart(64, '0');
const own = p2pkh(getPublicKey(hexToBytes(key)));
const parent = new Transaction();
parent.addInput({ txid: '11'.repeat(32), index: 0 });
parent.addOutput({ script: own.script, amount: 100_000n });
const tx = new Transaction();
tx.addInput({ txid: parent.id, index: 0 });
tx.addOutput({ script: own.script, amount: 99_000n });
const wallet: Wallet = { id: 'legacy', name: 'Legacy', type: 'privateKey', addressFormat: AddressFormat.P2PKH,
  addressCount: 1, addresses: [{ address: own.address, name: 'Account', path: '', pubKey: bytesToHex(getPublicKey(hexToBytes(key))) }] };
const realHunt = signingHunt.huntZeldWhileSigning;

describe('background ZELD signing', () => {
  let manager: WalletManager;
  beforeEach(() => {
    vi.restoreAllMocks();
    session.generation = 1;
    manager = new WalletManager();
    manager['wallets'] = [wallet];
    manager['activeWalletId'] = wallet.id;
    vi.spyOn(manager, 'getPrivateKey').mockResolvedValue({ hex: key, wif: '', compressed: true });
  });

  it('hunts using resolved scripts and returns verified signatures over the reviewed transaction', async () => {
    const hunt = vi.spyOn(signingHunt, 'huntZeldWhileSigning').mockImplementation(context => realHunt({ ...context, targetZeros: 2 }));
    const signed = await manager.signTransaction(bytesToHex(tx.unsignedTx), own.address, {
      zeldHuntSeconds: 5, lockScripts: ['untrusted API hint'], inputValues: [100_000],
    });
    expect(Transaction.fromRaw(hexToBytes(signed)).id).toMatch(/^00/);
    expect(() => assertOnlyNonceChanged(bytesToHex(tx.unsignedTx), bytesToHex(unsignedFormOf(hexToBytes(signed))))).not.toThrow();
    expect(hunt.mock.calls[0]![0].lockScripts).toEqual([bytesToHex(own.script)]);
  });

  it('withholds a found transaction if the session changes before the hunt returns', async () => {
    vi.spyOn(signingHunt, 'huntZeldWhileSigning').mockImplementation(async context => {
      const found = await realHunt({ ...context, targetZeros: 2 });
      session.generation++;
      return found;
    });
    await expect(manager.signTransaction(bytesToHex(tx.unsignedTx), own.address, { zeldHuntSeconds: 5 }))
      .rejects.toThrow('Wallet session changed');
  });

  it('does not hunt for ordinary signing calls without explicit compose consent', async () => {
    const hunt = vi.spyOn(signingHunt, 'huntZeldWhileSigning');
    await manager.signTransaction(bytesToHex(tx.unsignedTx), own.address);
    expect(hunt).not.toHaveBeenCalled();
  });
});
