/**
 * The composer states the script-address caution for the wallet's own transactions, and signs one
 * that carries it only after the review's acknowledgement.
 */

import * as btc from '@scure/btc-signer';
import { act, renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { decodeAddressFromScript } from '@/core/bitcoin/address';
import type { ApiResponse } from '@/core/counterparty/compose';
import { arc4, hexToBytes } from '@/core/counterparty/unpack/binary';
import { ComposerProvider } from '../composer-context';
import { useComposer } from '../composer-context-object';

const OWN_ADDRESS = decodeAddressFromScript('76a9145c333992ab554e7573df3d2a412df750a60d1f5b88ac')!;
const P2TR = 'bc1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqkedrcr';
const P2SH = decodeAddressFromScript(`a914${'33'.repeat(20)}87`)!;
const P2WPKH = decodeAddressFromScript(`0014${'55'.repeat(20)}`)!;
/** A Taproot address in another of this wallet's wallets. */
const OTHER_WALLET_TAPROOT = decodeAddressFromScript(`5120${'44'.repeat(32)}`)!;

const wallet = vi.hoisted(() => ({
  signTransaction: vi.fn(),
  broadcastTransaction: vi.fn(),
}));

vi.mock('@/contexts/wallet-context', () => ({
  useWallet: () => ({
    activeAddress: { address: OWN_ADDRESS },
    activeWallet: { id: 'test-wallet', addressFormat: 'p2pkh', type: 'mnemonic' },
    wallets: [{ addresses: [{ address: OWN_ADDRESS }, { address: OTHER_WALLET_TAPROOT }] }],
    signTransaction: wallet.signTransaction,
    broadcastTransaction: wallet.broadcastTransaction,
    setHardwareOperationInProgress: vi.fn(),
    authState: 'UNLOCKED',
    keychainLocked: false,
  }),
}));

const api = vi.hoisted(() => ({
  fetchAssetDetails: vi.fn(),
  fetchTokenBalances: vi.fn(),
  fetchOwnedAssets: vi.fn(),
}));
vi.mock('@/core/counterparty/api', () => api);

vi.mock('@/core/counterparty/transaction', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/core/counterparty/transaction')>()),
  fetchInputValues: vi.fn(async (inputs: Array<{ txid: string; vout: number }>) =>
    new Map(inputs.map((input) => [`${input.txid}:${input.vout}`, 100_000]))),
}));

vi.mock('@/core/replayPrevention', () => ({
  checkReplayAttempt: vi.fn().mockResolvedValue({ isReplay: false }),
  recordTransaction: vi.fn(),
}));

vi.mock('@/contexts/settings-context', () => ({
  useSettings: () => ({ settings: { showHelpText: false } }),
}));

vi.mock('@/contexts/header-context', () => ({
  useHeader: () => ({ setHeaderProps: vi.fn(), clearBalances: vi.fn() }),
}));

const TXID = 'ab'.repeat(32);
const script = (address: string) => btc.OutScript.encode(btc.Address().decode(address));

/** A plain BTC send of 5,000 sats to `destination`, change to the active address. */
function btcSend(destination: string): ApiResponse {
  const tx = new btc.Transaction({ allowUnknownOutputs: true });
  tx.addInput({ txid: TXID, index: 0 });
  tx.addOutput({ script: script(destination), amount: 5_000n });
  tx.addOutput({ script: script(OWN_ADDRESS), amount: 94_600n });
  return { result: { rawtransaction: tx.hex, btc_fee: 400, params: { asset: 'BTC', destination }, name: 'send' } } as unknown as ApiResponse;
}

/** A dispense: BTC to the dispenser, the dispense message, change. */
function dispense(dispenser: string): ApiResponse {
  const tx = new btc.Transaction({ allowUnknownOutputs: true });
  tx.addInput({ txid: TXID, index: 0 });
  tx.addOutput({ script: script(dispenser), amount: 5_788n });
  tx.addOutput({ script: btc.Script.encode(['RETURN', arc4(hexToBytes(TXID), hexToBytes('434e5452505254590d00'))]), amount: 0n });
  tx.addOutput({ script: script(OWN_ADDRESS), amount: 100_000n - 5_788n - 400n });
  return { result: { rawtransaction: tx.hex, btc_fee: 400, params: { asset: 'BTC', destination: dispenser, quantity: 5788 }, name: 'send' } } as unknown as ApiResponse;
}

/** A UTXO move: the attached assets follow the first output to `destination`. */
function move(destination: string): ApiResponse {
  const tx = new btc.Transaction({ allowUnknownOutputs: true });
  tx.addInput({ txid: TXID, index: 0 });
  tx.addOutput({ script: script(destination), amount: 546n });
  tx.addOutput({ script: script(OWN_ADDRESS), amount: 100_000n - 546n - 400n });
  return { result: { rawtransaction: tx.hex, btc_fee: 400, params: { destination }, name: 'move' } } as unknown as ApiResponse;
}

async function compose(composeType: string, response: ApiResponse, fields: Record<string, string>) {
  const hook = renderHook(() => useComposer(), {
    wrapper: ({ children }) => (
      <MemoryRouter>
        <ComposerProvider composeApi={vi.fn().mockResolvedValue(response)} initialTitle="Test" composeType={composeType}>
          {children}
        </ComposerProvider>
      </MemoryRouter>
    ),
  });
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  await act(async () => { await hook.result.current.composeTransaction(form); });
  expect(hook.result.current.state.error).toBeNull();
  expect(hook.result.current.state.step).toBe('review');
  return hook;
}

const sendBtc = (destination: string) =>
  compose('send', btcSend(destination), { asset: 'BTC', destination, quantity: '0.00005000' });

beforeEach(() => {
  vi.clearAllMocks();
  api.fetchAssetDetails.mockResolvedValue(null);
  api.fetchTokenBalances.mockResolvedValue([{ asset: 'XCP' }]);
  api.fetchOwnedAssets.mockResolvedValue([]);
  wallet.signTransaction.mockResolvedValue('signed');
  wallet.broadcastTransaction.mockResolvedValue({ txid: 'cd'.repeat(32) });
});

describe('the script-address caution in the composer', () => {
  it('states it for a BTC send to a script address from an address holding assets', async () => {
    const { result } = await sendBtc(P2TR);
    expect(result.current.state.scriptPaymentRisk).toEqual({ totalSats: 5_000, addresses: [P2TR], source: OWN_ADDRESS });
  });

  it('changes nothing for an address holding no assets', async () => {
    api.fetchTokenBalances.mockResolvedValue([]);
    const { result } = await sendBtc(P2TR);
    expect(result.current.state.scriptPaymentRisk).toBeNull();
    await act(async () => { await result.current.signAndBroadcast(); });
    expect(wallet.signTransaction).toHaveBeenCalled();
    expect(result.current.state.step).toBe('success');
  });

  it('never states it for a key-hash destination', async () => {
    const { result } = await sendBtc(P2WPKH);
    expect(result.current.state.scriptPaymentRisk).toBeNull();
    expect(api.fetchTokenBalances).not.toHaveBeenCalled();
  });

  it('never states it for a script address in another of this wallet\'s wallets', async () => {
    const { result } = await sendBtc(OTHER_WALLET_TAPROOT);
    expect(result.current.state.scriptPaymentRisk).toBeNull();
    expect(api.fetchTokenBalances).not.toHaveBeenCalled();
  });

  it('states it for a dispense to a dispenser at a script address', async () => {
    const { result } = await compose('send', dispense(P2SH), { asset: 'BTC', destination: P2SH, quantity: '0.00005788', sat_per_vbyte: '1.6' });
    expect(result.current.state.decodedMessage?.messageType).toBe('dispense');
    expect(result.current.state.scriptPaymentRisk?.addresses).toEqual([P2SH]);
  });

  it('states it for a UTXO move to a script address, whose input carries the assets', async () => {
    api.fetchTokenBalances.mockResolvedValue([]);
    const { result } = await compose('move', move(P2TR), { sourceUtxo: `${TXID}:0`, destination: P2TR });
    expect(result.current.state.scriptPaymentRisk?.addresses).toEqual([P2TR]);
  });

  it('refuses to sign until the review acknowledges it, then signs', async () => {
    const { result } = await sendBtc(P2TR);
    await act(async () => { await result.current.signAndBroadcast(); });
    expect(wallet.signTransaction).not.toHaveBeenCalled();
    expect(result.current.state.error).toBe('Review and acknowledge the transaction risks before signing');

    act(() => { result.current.acknowledgeScriptPaymentRisk(); });
    await act(async () => { await result.current.signAndBroadcast(); });
    expect(wallet.signTransaction).toHaveBeenCalledTimes(1);
    expect(result.current.state.step).toBe('success');
  });

  it('forgets the acknowledgement when the review is left', async () => {
    const { result } = await sendBtc(P2TR);
    act(() => { result.current.acknowledgeScriptPaymentRisk(); });
    act(() => { result.current.goBack(); });
    expect(result.current.state.scriptPaymentRisk).toBeNull();
    const form = new FormData();
    form.set('asset', 'BTC');
    form.set('destination', P2TR);
    form.set('quantity', '0.00005000');
    await act(async () => { await result.current.composeTransaction(form); });
    await act(async () => { await result.current.signAndBroadcast(); });
    expect(wallet.signTransaction).not.toHaveBeenCalled();
  });
});
