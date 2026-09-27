/**
 * The wallet service hands consolidation to the wallet's signer and never holds the key itself:
 * it neither reads a private key nor builds the batch.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { consolidateBareMultisigBatch } from '@/core/bitcoin/consolidateBatch';
import type { ConsolidationData } from '@/core/bitcoin/consolidationApi';
import { walletManager } from '@/platform/walletManager';
import { getWalletService } from '@/services/walletService';

vi.mock('@/platform/proxy/server', () => ({
  defineProxyServer: (_name: string, factory: () => unknown) => [factory, factory],
}));
vi.mock('@/platform/walletManager', () => ({ walletManager: {
  getActiveWallet: vi.fn(() => ({ id: 'w', type: 'mnemonic', addresses: [{ address: '1Source', path: "m/44'/0'/0'/0/0" }] })),
  getPrivateKey: vi.fn(async () => ({ wif: 'wif', hex: '11'.repeat(32), compressed: true })),
  consolidateBareMultisig: vi.fn(async () => ({
    signedTxHex: 'signed', totalInput: 3, networkFee: 1, serviceFee: 0, outputAmount: 2, txSize: 3,
  })),
} }));
vi.mock('@/core/bitcoin/consolidateBatch', () => ({ consolidateBareMultisigBatch: vi.fn() }));
vi.mock('@/platform/auth/sessionManager', () => ({ registerSessionExpiredHandler: vi.fn(), setLastActiveTime: vi.fn() }));
vi.mock('@/services/eventEmitterService', () => ({ eventEmitterService: { emit: vi.fn() } }));

describe('walletService.consolidateBareMultisig', () => {
  beforeEach(() => vi.clearAllMocks());

  it('delegates to the signer and never reads the private key', async () => {
    const batch = { utxos: [] } as unknown as ConsolidationData;

    const result = await getWalletService().consolidateBareMultisig('1Source', batch, 7, '1Dest');

    expect(result.signedTxHex).toBe('signed');
    expect(walletManager.consolidateBareMultisig).toHaveBeenCalledWith('1Source', batch, 7, '1Dest');
    expect(walletManager.getPrivateKey).not.toHaveBeenCalled();
    expect(consolidateBareMultisigBatch).not.toHaveBeenCalled();
  });
});
