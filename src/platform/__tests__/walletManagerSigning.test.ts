import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { getPublicKey } from '@noble/secp256k1';
import { p2wpkh, Transaction } from '@scure/btc-signer';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AddressFormat } from '@/core/bitcoin/address';
import { finalizePSBT, signPSBT } from '@/core/bitcoin/psbt';
import { WalletManager } from '@/platform/walletManager';
import type { Wallet } from '@/types/wallet';

const { mockHardware, session } = vi.hoisted(() => ({
  mockHardware: { init: vi.fn(), signPsbt: vi.fn() },
  session: { generation: 1, secret: vi.fn() },
}));
vi.mock('@/core/hardware/trezorAdapter', () => ({ getTrezorAdapter: () => mockHardware }));
vi.mock('@/platform/auth/sessionManager', async (original) => ({
  ...(await original<typeof import('@/platform/auth/sessionManager')>()),
  getUnlockedSecret: session.secret,
  getSessionGeneration: () => session.generation,
  assertSessionGeneration: (generation: number) => {
    if (generation !== session.generation) throw new Error('Wallet session changed');
  },
}));

const privateKey = '01'.padStart(64, '0');
const own = p2wpkh(getPublicKey(hexToBytes(privateKey)));
const recipient = p2wpkh(getPublicKey(hexToBytes('02'.padStart(64, '0'))));
const attacker = p2wpkh(getPublicKey(hexToBytes('03'.padStart(64, '0'))));
const wallet: Wallet = {
  id: 'hardware-identity', name: 'Hardware', type: 'hardware', addressFormat: AddressFormat.P2WPKH,
  addressCount: 1, addresses: [{ address: own.address, name: 'Account', path: "m/84'/0'/0'/0/0", pubKey: bytesToHex(getPublicKey(hexToBytes(privateKey))) }],
};
const identity = { walletId: wallet.id, address: own.address };
const parent = new Transaction();
parent.addInput({ txid: '11'.repeat(32), index: 0 });
parent.addOutput({ script: own.script, amount: 100_000n });
vi.mock('@/core/bitcoin/utxo', async (original) => ({
  ...(await original<typeof import('@/core/bitcoin/utxo')>()),
  fetchPreviousRawTransaction: vi.fn(async () => bytesToHex(parent.unsignedTx)),
}));
function transaction(script = recipient.script) {
  const tx = new Transaction({ version: 1, lockTime: 950_000 });
  tx.addInput({ txid: parent.id, index: 0, sequence: 0xffffffff, witnessUtxo: { script: own.script, amount: 100_000n } });
  tx.addOutput({ script, amount: 99_000n });
  return tx;
}
const signed = (tx: Transaction) => finalizePSBT(signPSBT(bytesToHex(tx.toPSBT()), privateKey, [0], AddressFormat.P2WPKH, [1]));
const options = (tx: Transaction) => ({
  psbtHex: bytesToHex(tx.toPSBT()), inputValues: [100_000], lockScripts: [bytesToHex(own.script)],
});

describe('WalletManager signing identity and transaction integrity', () => {
  let manager: WalletManager;
  beforeEach(() => {
    vi.clearAllMocks();
    session.generation = 1;
    session.secret.mockResolvedValue(JSON.stringify({ deviceType: 'trezor' }));
    manager = new WalletManager();
    manager['wallets'] = [wallet];
    manager['activeWalletId'] = wallet.id;
    mockHardware.init.mockResolvedValue(undefined);
    mockHardware.signPsbt.mockResolvedValue({ signedTxHex: signed(transaction()) });
  });

  it('rejects an API PSBT whose destination differs from the reviewed raw transaction before prompting the device', async () => {
    await expect(manager.signTransaction(
      bytesToHex(transaction().unsignedTx), own.address, options(transaction(attacker.script)), identity,
    )).rejects.toThrow(/differs from the reviewed/);
    expect(mockHardware.init).not.toHaveBeenCalled();
    expect(mockHardware.signPsbt).not.toHaveBeenCalled();
  });

  it('accepts hardware signatures over exactly the reviewed bytes', async () => {
    const tx = transaction();
    await expect(manager.signTransaction(bytesToHex(tx.unsignedTx), own.address, options(tx), identity))
      .resolves.toBe(signed(tx));
  });

  it('refuses an adapter response that substituted the recipient', async () => {
    mockHardware.signPsbt.mockResolvedValue({ signedTxHex: signed(transaction(attacker.script)) });
    const tx = transaction();
    await expect(manager.signTransaction(bytesToHex(tx.unsignedTx), own.address, options(tx), identity))
      .rejects.toThrow(/differs from the reviewed/);
  });

  it('refuses a request bound to another wallet before accessing secrets', async () => {
    const tx = transaction();
    await expect(manager.signTransaction(bytesToHex(tx.unsignedTx), own.address, options(tx), {
      ...identity, walletId: 'another-wallet',
    })).rejects.toThrow(/signing identity changed/);
    expect(session.secret).not.toHaveBeenCalled();
  });

  it('invalidates signing if the session changes during device initialization', async () => {
    mockHardware.init.mockImplementation(async () => { session.generation++; });
    const tx = transaction();
    await expect(manager.signTransaction(bytesToHex(tx.unsignedTx), own.address, options(tx), identity))
      .rejects.toThrow(/Wallet session changed/);
    expect(mockHardware.signPsbt).not.toHaveBeenCalled();
  });

  it('does not deliver a signature that arrives after locking', async () => {
    mockHardware.signPsbt.mockImplementation(async () => {
      session.generation++;
      return { signedTxHex: signed(transaction()) };
    });
    const tx = transaction();
    await expect(manager.signTransaction(bytesToHex(tx.unsignedTx), own.address, options(tx), identity))
      .rejects.toThrow(/Wallet session changed/);
  });

  it('does not sign with a retrieved software key after the active address changes', async () => {
    manager['wallets'] = [{ ...wallet, type: 'privateKey' }];
    vi.spyOn(manager, 'getPrivateKey').mockImplementation(async () => {
      manager['wallets'] = [{ ...wallet, type: 'privateKey', addresses: [{ ...wallet.addresses[0]!, address: attacker.address }] }];
      return { hex: privateKey, wif: '', compressed: true };
    });
    await expect(manager.signPsbt(bytesToHex(transaction().toPSBT()), undefined, [1], identity))
      .rejects.toThrow(/signing identity changed/);
  });
});
