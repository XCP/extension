import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { getPublicKey } from '@noble/secp256k1';
import { p2wpkh, Transaction } from '@scure/btc-signer';
import { describe, expect, it, vi } from 'vitest';
import { AddressFormat } from '@/core/bitcoin/address';
import { finalizePSBT, signPSBT } from '@/core/bitcoin/psbt';
import { WalletManager } from '@/platform/walletManager';
import type { Wallet } from '@/types/wallet';

const { hardware } = vi.hoisted(() => ({
  hardware: { init: vi.fn(), signPsbt: vi.fn() },
}));
vi.mock('@/core/hardware/trezorAdapter', () => ({ getTrezorAdapter: () => hardware }));
vi.mock('@/platform/auth/sessionManager', async (original) => ({
  ...(await original<typeof import('@/platform/auth/sessionManager')>()),
  getUnlockedSecret: vi.fn(async () => JSON.stringify({ deviceType: 'trezor' })),
}));

describe('WalletManager hardware input derivation', () => {
  it('passes each verified input owner to Trezor using the real hardened-path parser', async () => {
    const keys = ['01'.padStart(64, '0'), '02'.padStart(64, '0')];
    const owners = keys.map((key) => p2wpkh(getPublicKey(hexToBytes(key))));
    const wallet: Wallet = {
      id: 'hardware-paths', name: 'Hardware', type: 'hardware',
      addressFormat: AddressFormat.P2WPKH, addressCount: 2,
      addresses: owners.map((owner, index) => ({
        address: owner.address, name: `Address ${index + 1}`,
        path: `m/84'/0'/0'/0/${index === 0 ? 0 : 7}`,
        pubKey: bytesToHex(getPublicKey(hexToBytes(keys[index]!))),
      })),
    };
    const parent = new Transaction();
    parent.addInput({ txid: '11'.repeat(32), index: 0 });
    for (const owner of owners) parent.addOutput({ script: owner.script, amount: 50_000n });
    const spending = new Transaction();
    owners.forEach((_, index) => {
      spending.addInput({ txid: parent.id, index, nonWitnessUtxo: parent.unsignedTx });
    });
    spending.addOutput({ script: owners[0]!.script, amount: 99_000n });
    const psbtHex = bytesToHex(spending.toPSBT());
    const signedPsbt = keys.reduce((psbt, key, index) =>
      signPSBT(psbt, key, [index], AddressFormat.P2WPKH), psbtHex);
    const signedTxHex = finalizePSBT(signedPsbt);
    hardware.init.mockResolvedValue(undefined);
    hardware.signPsbt.mockResolvedValue({ signedTxHex });
    const manager = new WalletManager();
    manager['wallets'] = [wallet];
    manager['activeWalletId'] = wallet.id;

    await expect(manager.signTransaction(bytesToHex(spending.unsignedTx), owners[0]!.address, {
      psbtHex, inputValues: [50_000, 50_000],
      lockScripts: owners.map((owner) => bytesToHex(owner.script)),
    })).resolves.toBe(signedTxHex);
    expect(hardware.signPsbt).toHaveBeenCalledWith(expect.objectContaining({
      inputPaths: new Map([
        [0, [0x80000054, 0x80000000, 0x80000000, 0, 0]],
        [1, [0x80000054, 0x80000000, 0x80000000, 0, 7]],
      ]),
    }));
  });
});
