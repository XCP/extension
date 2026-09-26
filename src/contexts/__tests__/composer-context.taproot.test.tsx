/**
 * The composer's Taproot path, end to end over real composes captured from api.counterparty.io:
 * the encoding is chosen without asking, the envelope is read and held to the request, the reveal
 * is held to core's construction, nothing edits the commit afterwards, and the two transactions go
 * out in order.
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AddressFormat } from '@/core/bitcoin/address';
import {
  SEND_TAPROOT,
  TAPROOT_INPUT_VALUE,
  TAPROOT_SOURCE,
  type TaprootFixture,
  tamperedTaprootCompose,
} from '@/core/counterparty/__tests__/taprootFixtures';
import type { ApiResponse } from '@/core/counterparty/compose';
import { CounterpartyApiError } from '@/core/errors';
import { HUNTS_WHILE_SIGNING } from '@/core/zeld/eligibility';
import { ComposerProvider } from '../composer-context';
import { useComposer } from '../composer-context-object';

let zeldHuntSeconds = 0;
let addressFormat: AddressFormat = AddressFormat.P2WPKH;
const signTransaction = vi.fn();
const broadcastTransaction = vi.fn();

vi.mock('@/contexts/wallet-context', () => ({
  useWallet: () => ({
    activeAddress: { address: 'bc1qm3flzugyajx37g2av8ujkcpu0v3r3jkmpdpf8k' },
    activeWallet: { id: 'test-wallet', addressFormat, type: 'mnemonic' },
    signTransaction,
    broadcastTransaction,
    setHardwareOperationInProgress: vi.fn(),
    authState: 'UNLOCKED',
    keychainLocked: false,
  }),
}));

vi.mock('@/core/counterparty/api', () => ({
  fetchAssetDetails: vi.fn().mockResolvedValue({ asset: 'PEPEMEMECOIN', divisible: true, locked: true }),
  fetchOrderMatch: vi.fn().mockResolvedValue(null),
}));

// The fixtures spend one 2,000,000-sat input.
vi.mock('@/core/counterparty/transaction', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/core/counterparty/transaction')>()),
  fetchInputValues: vi.fn(async (inputs: Array<{ txid: string; vout: number }>) =>
    new Map(inputs.map((input) => [`${input.txid}:${input.vout}`, 2_000_000]))),
}));

vi.mock('@/core/replayPrevention', () => ({
  checkReplayAttempt: vi.fn().mockResolvedValue({ isReplay: false }),
  recordTransaction: vi.fn(),
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

// The real hunt by default; one test swaps in a response a buggy hunt might leave behind.
const huntOverride = vi.fn();
vi.mock('@/core/zeld/composeHunt', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/core/zeld/composeHunt')>();
  return {
    huntZeldForCompose: (...args: Parameters<typeof actual.huntZeldForCompose>) =>
      huntOverride.getMockImplementation() ? huntOverride(...args) : actual.huntZeldForCompose(...args),
  };
});

function responseFor(fixture: TaprootFixture): ApiResponse {
  return {
    result: {
      rawtransaction: fixture.rawtransaction,
      btc_in: TAPROOT_INPUT_VALUE,
      btc_out: 0,
      btc_change: 0,
      btc_fee: fixture.btc_fee,
      data: fixture.data,
      lock_scripts: ['0014dc53f17104ec8d1f215d61f92b603c7b2238cadb'],
      inputs_values: [TAPROOT_INPUT_VALUE],
      signed_tx_estimated_size: { vsize: 153, adjusted_vsize: 153, sigops_count: 1 },
      psbt: fixture.psbt,
      envelope_script: fixture.envelope_script,
      signed_reveal_rawtransaction: fixture.signed_reveal_rawtransaction,
      params: { source: TAPROOT_SOURCE, ...fixture.request } as never,
      name: 'send',
    },
  };
}

/** The send form's submission for the send fixture: 1 PEPEMEMECOIN with a 34-byte memo. */
function sendForm(): FormData {
  const form = new FormData();
  form.set('destination', SEND_TAPROOT.request.destination!);
  form.set('asset', 'PEPEMEMECOIN');
  form.set('quantity', '1');
  form.set('memo', SEND_TAPROOT.request.memo!);
  form.set('sat_per_vbyte', '2');
  return form;
}

function renderComposer(composeApi: (data: Record<string, unknown>) => Promise<ApiResponse>) {
  return renderHook(() => useComposer(), {
    wrapper: ({ children }) => (
      <MemoryRouter>
        <ComposerProvider composeApi={composeApi} initialTitle="Test" composeType="send">
          {children}
        </ComposerProvider>
      </MemoryRouter>
    ),
  });
}

async function composed(composeApi: (data: Record<string, unknown>) => Promise<ApiResponse>) {
  const hook = renderComposer(composeApi);
  await act(async () => {
    await hook.result.current.composeTransaction(sendForm());
  });
  return hook;
}

describe('ComposerContext Taproot encoding', () => {
  beforeEach(() => {
    zeldHuntSeconds = 0;
    addressFormat = AddressFormat.P2WPKH;
    huntOverride.mockReset();
    signTransaction.mockReset();
    broadcastTransaction.mockReset();
    // Signing leaves a segwit commit's txid alone; the unsigned bytes stand in for it.
    signTransaction.mockImplementation(async (raw: string) => raw);
    broadcastTransaction.mockImplementation(async (hex: string) => ({ txid: hex === SEND_TAPROOT.rawtransaction ? 'commit' : 'reveal' }));
  });

  it('asks for Taproot unprompted, reviews the message read from the envelope, and counts both fees', async () => {
    const composeApi = vi.fn(async (_data: Record<string, unknown>) => responseFor(SEND_TAPROOT));
    const { result } = await composed(composeApi);

    await waitFor(() => expect(result.current.state.step).toBe('review'));
    expect(composeApi).toHaveBeenCalledTimes(1);
    expect(composeApi.mock.calls[0]![0]).toMatchObject({ encoding: 'taproot', quantity: '100000000' });
    // What the review renders comes from the envelope's bytes, not the response's echo.
    expect(result.current.state.decodedMessage?.data).toMatchObject({
      destination: SEND_TAPROOT.request.destination,
      asset: 'PEPEMEMECOIN',
      quantity: 100000000n,
    });
    expect(result.current.state.apiResponse?.result.btc_fee).toBe(306);
    expect(result.current.state.apiResponse?.result.reveal_fee).toBe(330);
  });

  it.each([
    ['recipient', (m: string) => m.replace('a37c3903', 'a37c3904')],
    ['amount', (m: string) => m.replace('1a05f5e100', '1a05f5e101')],
    ['asset', (m: string) => m.replace('1b00c5e4ddb67f67e5', '1b00c5e4ddb67f67e6')],
    ['memo', (m: string) => m.replace('636f66666565', '636f66666566')],
  ])('refuses a self-consistent hostile compose whose envelope alters the %s', async (_, tamper) => {
    const hostile = tamperedTaprootCompose(SEND_TAPROOT, tamper);
    const { result } = await composed(vi.fn(async () => responseFor(hostile)));

    await waitFor(() => expect(result.current.state.error).toMatch(/verification failed/i));
    expect(result.current.state.step).toBe('form');
  });

  it('accepts the hostile builder unaltered, so the refusals above are about the message', async () => {
    const { result } = await composed(vi.fn(async () => responseFor(tamperedTaprootCompose(SEND_TAPROOT, (m) => m))));
    await waitFor(() => expect(result.current.state.step).toBe('review'));
  });

  it('refuses half of a Taproot compose', async () => {
    for (const drop of ['envelope_script', 'signed_reveal_rawtransaction'] as const) {
      const response = responseFor(SEND_TAPROOT);
      delete response.result[drop];
      const { result } = await composed(vi.fn(async () => response));
      await waitFor(() => expect(result.current.state.error).toMatch(/only one of the two transactions/));
    }
  });

  it('asks once more on the default encoding when the composer refuses Taproot', async () => {
    const composeApi = vi.fn()
      .mockRejectedValueOnce(new CounterpartyApiError('Cannot use `taproot` encoding for non-segwit address', 'send'))
      .mockRejectedValueOnce(new CounterpartyApiError('insufficient funds for PEPEMEMECOIN', 'send'));
    const { result } = await composed(composeApi);

    await waitFor(() => expect(result.current.state.error).toMatch(/insufficient funds/));
    expect(composeApi).toHaveBeenCalledTimes(2);
    expect(composeApi.mock.calls[0]![0]).toMatchObject({ encoding: 'taproot' });
    expect(composeApi.mock.calls[1]![0]).not.toHaveProperty('encoding');
  });

  it('does not hunt ZELD over a commit whose reveal is already signed', async () => {
    zeldHuntSeconds = 12;
    const { result } = await composed(vi.fn(async () => responseFor(SEND_TAPROOT)));

    await waitFor(() => expect(result.current.state.step).toBe('review'));
    expect(result.current.state.apiResponse?.result.zeld_hunt?.status).toBe('skipped');
    expect(result.current.state.apiResponse?.result.rawtransaction).toBe(SEND_TAPROOT.rawtransaction);
  });

  it('never hunts while signing a commit with a reveal, whatever the review metadata says', async () => {
    addressFormat = AddressFormat.P2PKH;
    zeldHuntSeconds = 12;
    huntOverride.mockImplementation(async (response: ApiResponse) => ({ ...response, result: { ...response.result,
      zeld_hunt: { status: 'skipped', target_zeros: 6, seconds: 12, elapsed_ms: 0, attempts: 0, reason: HUNTS_WHILE_SIGNING } } }));
    const { result } = await composed(vi.fn(async () => responseFor(SEND_TAPROOT)));
    await waitFor(() => expect(result.current.state.step).toBe('review'));

    await act(async () => { await result.current.signAndBroadcast(); });
    expect(signTransaction).toHaveBeenCalledTimes(1);
    expect(signTransaction.mock.calls[0]![2]).not.toHaveProperty('zeldHuntSeconds');
  });

  it('broadcasts the commit, then the reveal', async () => {
    const { result } = await composed(vi.fn(async () => responseFor(SEND_TAPROOT)));
    await waitFor(() => expect(result.current.state.step).toBe('review'));

    await act(async () => { await result.current.signAndBroadcast(); });
    await waitFor(() => expect(result.current.state.step).toBe('success'));
    expect(broadcastTransaction.mock.calls.map(([hex]) => hex)).toEqual([
      SEND_TAPROOT.rawtransaction,
      SEND_TAPROOT.signed_reveal_rawtransaction,
    ]);
  });

  it('never broadcasts the reveal when the commit was refused', async () => {
    broadcastTransaction.mockRejectedValueOnce(new Error('bad-txns-inputs-missingorspent'));
    const { result } = await composed(vi.fn(async () => responseFor(SEND_TAPROOT)));
    await waitFor(() => expect(result.current.state.step).toBe('review'));

    await act(async () => { await result.current.signAndBroadcast(); });
    await waitFor(() => expect(result.current.state.error).toBeTruthy());
    expect(broadcastTransaction).toHaveBeenCalledTimes(1);
  });

  it('keeps the reveal hex when the reveal is refused after the commit went out', async () => {
    broadcastTransaction
      .mockResolvedValueOnce({ txid: 'commit' })
      .mockRejectedValueOnce(new Error('min relay fee not met'));
    const { result } = await composed(vi.fn(async () => responseFor(SEND_TAPROOT)));
    await waitFor(() => expect(result.current.state.step).toBe('review'));

    await act(async () => { await result.current.signAndBroadcast(); });
    await waitFor(() => expect(result.current.state.step).toBe('success'));
    const warning = result.current.state.verificationWarnings.at(-1) ?? '';
    expect(warning).toContain('min relay fee not met');
    expect(warning).toContain(SEND_TAPROOT.signed_reveal_rawtransaction);
    expect(warning).not.toMatch(/inscription/i);
  });

  it('broadcasts nothing when the signed commit no longer matches its reveal', async () => {
    // A signer that changed nLockTime — as a ZELD nonce would — changes the txid the reveal spends.
    signTransaction.mockImplementation(async (raw: string) => `${raw.slice(0, -8)}2a000000`);
    const { result } = await composed(vi.fn(async () => responseFor(SEND_TAPROOT)));
    await waitFor(() => expect(result.current.state.step).toBe('review'));

    await act(async () => { await result.current.signAndBroadcast(); });
    await waitFor(() => expect(result.current.state.error).toMatch(/no longer matches its reveal/));
    expect(broadcastTransaction).not.toHaveBeenCalled();
  });
});
