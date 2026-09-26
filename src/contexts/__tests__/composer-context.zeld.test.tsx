import { act, renderHook, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AddressFormat, decodeAddressFromScript } from '@/core/bitcoin/address';
import type { ApiResponse } from '@/core/counterparty/compose';
import { ComposerProvider } from '../composer-context';
import { useComposer } from '../composer-context-object';

// The same plain BTC spend the main composer tests use: one 100,000 sat input, one 95,160 sat
// output to OWN_ADDRESS. Its exact bytes are irrelevant here because the hunt itself is stubbed.
const VALID_BTC_ONLY_TX =
  '0200000001' + '0'.repeat(64) + '00000000' + '00' + 'ffffffff'
  + '01' + '98730100000000001976a9145c333992ab554e7573df3d2a412df750a60d1f5b88ac' + '00000000';
const OWN_ADDRESS = decodeAddressFromScript('76a9145c333992ab554e7573df3d2a412df750a60d1f5b88ac')!;

let zeldHuntSeconds = 0;
let addressFormat: AddressFormat = AddressFormat.P2WPKH;
const signTransaction = vi.fn();
const broadcastTransaction = vi.fn();
const getPrivateKey = vi.fn();

vi.mock('@/contexts/wallet-context', () => ({
  useWallet: () => ({
    activeAddress: { address: OWN_ADDRESS },
    activeWallet: { id: 'test-wallet', addressFormat, type: 'mnemonic' },
    signTransaction,
    broadcastTransaction,
    getPrivateKey,
    wallets: [],
    authState: 'UNLOCKED',
    keychainLocked: false,
  }),
}));

vi.mock('@/core/counterparty/api', () => ({
  fetchAssetDetails: vi.fn().mockResolvedValue(null),
  fetchOrderMatch: vi.fn().mockResolvedValue(null),
}));

// Fee verification resolves input values itself, so every compose consults this resolver.
vi.mock('@/core/counterparty/transaction', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/core/counterparty/transaction')>()),
  fetchInputValues: vi.fn(async (inputs: Array<{ txid: string; vout: number }>) =>
    new Map(inputs.map((input) => [`${input.txid}:${input.vout}`, 100_000]))),
}));

vi.mock('@/contexts/settings-context', () => ({
  useSettings: () => ({ settings: { showHelpText: true, zeldHuntSeconds } }),
}));

vi.mock('@/contexts/loading-context', () => ({
  useLoading: () => ({ showLoading: vi.fn(), hideLoading: vi.fn() }),
}));

vi.mock('@/contexts/header-context', () => ({
  useHeader: () => ({ setHeaderProps: vi.fn(), clearBalances: vi.fn() }),
}));

const huntZeldForCompose = vi.fn();
vi.mock('@/core/zeld/composeHunt', () => ({
  huntZeldForCompose: (...args: unknown[]) => huntZeldForCompose(...args),
}));

function composeResponse(): ApiResponse {
  return {
    result: {
      rawtransaction: VALID_BTC_ONLY_TX,
      btc_in: 100000,
      btc_out: 95160,
      btc_change: 0,
      btc_fee: 4840,
      data: '',
      lock_scripts: [],
      inputs_values: [100000],
      signed_tx_estimated_size: { vsize: 110, adjusted_vsize: 110, sigops_count: 1 },
      psbt: 'psbt',
      params: {
        source: OWN_ADDRESS,
        destination: OWN_ADDRESS,
        asset: 'BTC',
        quantity: 95160,
        memo: null,
        memo_is_hex: false,
        use_enhanced_send: false,
        no_dispense: false,
        skip_validation: false,
        asset_info: { asset_longname: null, description: '', issuer: '', divisible: true, locked: false, owner: '' },
        quantity_normalized: '0.00095160',
      },
      name: 'send',
    },
  };
}

function renderComposer(composeApi: (data: unknown) => Promise<ApiResponse>) {
  return renderHook(() => useComposer(), {
    wrapper: ({ children }) => (
      <MemoryRouter>
        <ComposerProvider composeApi={composeApi} initialTitle="Test" composeType="move">
          {children}
        </ComposerProvider>
      </MemoryRouter>
    ),
  });
}

describe('ComposerContext ZELD hunt', () => {
  beforeEach(() => {
    huntZeldForCompose.mockReset();
    zeldHuntSeconds = 0;
    addressFormat = AddressFormat.P2WPKH;
    signTransaction.mockReset();
    broadcastTransaction.mockReset();
    getPrivateKey.mockReset();
  });

  it('does not hunt when the setting is off', async () => {
    const { result } = renderComposer(vi.fn().mockResolvedValue(composeResponse()));
    await act(async () => {
      await result.current.composeTransaction(new FormData());
    });
    await waitFor(() => expect(result.current.state.step).toBe('review'));
    expect(huntZeldForCompose).not.toHaveBeenCalled();
    expect(result.current.state.zeldHuntProgress).toBeNull();
  });

  it('keeps legacy keys in the background and does not broadcast a signature arriving after unmount', async () => {
    addressFormat = AddressFormat.P2PKH;
    zeldHuntSeconds = 12;
    huntZeldForCompose.mockImplementation(async (response: ApiResponse) => ({ ...response, result: {
      ...response.result, zeld_hunt: { status: 'skipped', target_zeros: 6, seconds: 12,
        elapsed_ms: 0, attempts: 0, reason: 'A legacy transaction hunts while it is signed.' },
    } }));
    let resolveSigning!: (signed: string) => void;
    signTransaction.mockImplementation(() => new Promise(resolve => { resolveSigning = resolve; }));
    const { result, unmount } = renderComposer(vi.fn().mockResolvedValue(composeResponse()));
    await act(async () => { await result.current.composeTransaction(new FormData()); });
    let pending!: Promise<void>;
    act(() => { pending = result.current.signAndBroadcast(); });
    await waitFor(() => expect(signTransaction).toHaveBeenCalled());
    expect(signTransaction.mock.calls[0]![2]).toMatchObject({ zeldHuntSeconds: 12 });
    expect(getPrivateKey).not.toHaveBeenCalled();
    unmount();
    resolveSigning('signed transaction');
    await pending;
    expect(broadcastTransaction).not.toHaveBeenCalled();
  });

  it('hunts after verification with the wallet identity and budget, and reviews the hunted response', async () => {
    zeldHuntSeconds = 12;
    const hunted = {
      ...composeResponse(),
      result: {
        ...composeResponse().result,
        zeld_hunt: { status: 'not_found' as const, target_zeros: 6, seconds: 12, elapsed_ms: 12_000, attempts: 9 },
      },
    };
    huntZeldForCompose.mockImplementation(async (_response: ApiResponse, context: { onProgress: (p: unknown) => void }) => {
      context.onProgress({ attempts: 5, elapsedMs: 200, hashRate: 25, seconds: 12, targetZeros: 6 });
      return hunted;
    });

    const { result } = renderComposer(vi.fn().mockResolvedValue(composeResponse()));
    await act(async () => {
      await result.current.composeTransaction(new FormData());
    });
    await waitFor(() => expect(result.current.state.step).toBe('review'));

    expect(huntZeldForCompose).toHaveBeenCalledTimes(1);
    const [response, context] = huntZeldForCompose.mock.calls[0]!;
    // The hunt receives the response after fee substitution (100,000 in, 95,128 out), not the raw
    // API echo of 4,840.
    expect(response.result.btc_fee).toBe(4_872);
    expect(context).toMatchObject({
      sourceAddress: OWN_ADDRESS,
      addressFormat: AddressFormat.P2WPKH,
      walletType: 'mnemonic',
      seconds: 12,
    });
    expect(context.signal).toBeInstanceOf(AbortSignal);
    expect(result.current.state.apiResponse?.result.zeld_hunt?.status).toBe('not_found');
    // Progress is cleared once the review is shown.
    expect(result.current.state.zeldHuntProgress).toBeNull();
  });

  it('surfaces a hunt failure as a compose error rather than signing an unproven transaction', async () => {
    zeldHuntSeconds = 5;
    huntZeldForCompose.mockRejectedValue(new Error('The hunted transaction changed output 1.'));
    const { result } = renderComposer(vi.fn().mockResolvedValue(composeResponse()));
    await act(async () => {
      await result.current.composeTransaction(new FormData());
    });
    await waitFor(() => expect(result.current.state.error).toContain('changed output 1'));
    expect(result.current.state.step).toBe('form');
  });
});
