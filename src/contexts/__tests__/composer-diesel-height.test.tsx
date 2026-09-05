import { act, renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isDieselMintHeightAllowed } from '@/core/alkanes/dieselMintPolicy';
import { AddressFormat, decodeAddressFromScript } from '@/core/bitcoin/address';
import { createMockComposeResponse } from '@/core/counterparty/__tests__/helpers/composeTestHelpers';
import { recordTransaction } from '@/core/replayPrevention';
import { ComposerProvider } from '../composer-context';
import { useComposer } from '../composer-context-object';

const RAW = '020000000133997605bfe854fd8bdd784b47bd3b423488e64cc5fb5820e0f8d134670b0b670100000000ffffffff01'
  + 'b8730100000000001976a9145c333992ab554e7573df3d2a412df750a60d1f5b88ac00000000';
const OWN_ADDRESS = decodeAddressFromScript('76a9145c333992ab554e7573df3d2a412df750a60d1f5b88ac')!;
const wallet = vi.hoisted(() => ({
  signTransaction: vi.fn(), broadcastTransaction: vi.fn(), setHardwareOperationInProgress: vi.fn(),
}));

vi.mock('@/contexts/wallet-context', () => ({
  useWallet: () => ({
    activeAddress: { address: OWN_ADDRESS },
    activeWallet: { id: 'fixture', type: 'hardware', addressFormat: AddressFormat.P2WPKH },
    authState: 'UNLOCKED', keychainLocked: false, ...wallet,
  }),
}));
vi.mock('@/contexts/settings-context', () => ({ useSettings: () => ({ settings: { showHelpText: false } }) }));
vi.mock('@/contexts/header-context', () => ({ useHeader: () => ({ setHeaderProps: vi.fn(), clearBalances: vi.fn() }) }));
vi.mock('@/core/alkanes/dieselMintPolicy', () => ({ isDieselMintHeightAllowed: vi.fn() }));
vi.mock('@/core/replayPrevention', () => ({
  checkReplayAttempt: vi.fn().mockResolvedValue({ isReplay: false }), recordTransaction: vi.fn(),
}));
vi.mock('@/core/counterparty/transaction', async importOriginal => ({
  ...(await importOriginal<typeof import('@/core/counterparty/transaction')>()),
  fetchInputValues: vi.fn(async (inputs: Array<{ txid: string; vout: number }>) =>
    new Map(inputs.map(input => [`${input.txid}:${input.vout}`, 100_000]))),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(isDieselMintHeightAllowed).mockResolvedValue(true);
  wallet.signTransaction.mockResolvedValue('fixture-signed-hex');
  wallet.broadcastTransaction.mockResolvedValue({ txid: 'ab'.repeat(32) });
});

async function reviewedTransaction(withMint = true) {
  const response = createMockComposeResponse({
    rawtransaction: RAW, inputs_values: [100_000],
    ...(withMint ? { diesel_mint: {
      utxo_vout: 0, runestone_vout: 1, utxo_sats: 95_160,
      marginal_vbytes: 26, estimated_marginal_fee_sats: 52, fee_rate_sat_vbyte: 2,
      utxo_kind: 'change' as const,
    } } : {}),
  }).data;
  const { result } = renderHook(() => useComposer(), {
    wrapper: ({ children }) => <MemoryRouter>
      <ComposerProvider composeApi={vi.fn().mockResolvedValue(response)} initialTitle="Test" composeType="test">
        {children}
      </ComposerProvider>
    </MemoryRouter>,
  });
  await act(async () => { await result.current.composeTransaction(new FormData()); });
  expect(result.current.state.step).toBe('review');
  return result;
}

describe('DIESEL mining signing height boundary', () => {
  it('requires recomposition if a reviewed mint is no longer allowed before signing', async () => {
    const result = await reviewedTransaction();
    vi.mocked(isDieselMintHeightAllowed).mockResolvedValue(false);
    await act(async () => { await result.current.signAndBroadcast(); });
    expect(result.current.state.error).toContain('recompose');
    expect(wallet.signTransaction).not.toHaveBeenCalled();
    expect(wallet.broadcastTransaction).not.toHaveBeenCalled();
    expect(recordTransaction).not.toHaveBeenCalled();
  });

  it('rechecks after hardware approval and refuses to broadcast an obsolete mint', async () => {
    const result = await reviewedTransaction();
    wallet.signTransaction.mockImplementation(async () => {
      vi.mocked(isDieselMintHeightAllowed).mockResolvedValue(false);
      return 'fixture-signed-hex';
    });
    await act(async () => { await result.current.signAndBroadcast(); });
    expect(isDieselMintHeightAllowed).toHaveBeenCalledTimes(2);
    expect(wallet.signTransaction).toHaveBeenCalledTimes(1);
    expect(wallet.setHardwareOperationInProgress.mock.calls).toEqual([[true], [false]]);
    expect(wallet.broadcastTransaction).not.toHaveBeenCalled();
    expect(recordTransaction).not.toHaveBeenCalled();
    expect(result.current.state.error).toContain('recompose');
  });

  it('does not apply the mining height gate to an ordinary transaction', async () => {
    const result = await reviewedTransaction(false);
    vi.mocked(isDieselMintHeightAllowed).mockResolvedValue(false);
    await act(async () => { await result.current.signAndBroadcast(); });
    expect(isDieselMintHeightAllowed).not.toHaveBeenCalled();
    expect(wallet.signTransaction).toHaveBeenCalledTimes(1);
    expect(wallet.broadcastTransaction).toHaveBeenCalledWith('fixture-signed-hex');
    expect(result.current.state.error).toBeNull();
    expect(result.current.state.step).toBe('success');
  });
});
