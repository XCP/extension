/**
 * The composer's Taproot path, end to end over composes captured from Counterparty Core 11.5:
 * the encoding is chosen without asking (never for a hardware wallet), the envelope is read and
 * held to the request, the unsigned reveal is held to core's construction and source-signature rule,
 * commit and reveal are signed together with the source key, and the two go out in order.
 */

import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import * as btc from '@scure/btc-signer';
import { act, renderHook, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AddressFormat } from '@/core/bitcoin/addressFormat';
import { signTaprootReveal, type TaprootRevealToSign } from '@/core/bitcoin/taprootRevealSigner';
import {
  BROADCAST_P2WPKH,
  type Compose115Result,
  envelopeClosedBy,
  KEY_WPKH,
  recompose115,
  tamperedMessage115,
} from '@/core/counterparty/__tests__/taproot115Fixtures';
import { SEND_TAPROOT } from '@/core/counterparty/__tests__/taprootFixtures';
import type { ApiResponse } from '@/core/counterparty/compose';
import { checkRevealSourceSignature, sourceOutputScript } from '@/core/counterparty/revealSourceRule';
import { CounterpartyApiError } from '@/core/errors';
import { ComposerProvider } from '../composer-context';
import { useComposer } from '../composer-context-object';

let zeldHuntSeconds = 0;
let walletType: 'mnemonic' | 'privateKey' | 'hardware' = 'mnemonic';
const signTransaction = vi.fn();
const signCommitAndReveal = vi.fn();
const broadcastTransaction = vi.fn();

vi.mock('@/contexts/wallet-context', () => ({
  useWallet: () => ({
    activeAddress: { address: KEY_WPKH.address, pubKey: KEY_WPKH.publicKeyHex },
    activeWallet: { id: 'test-wallet', addressFormat: AddressFormat.P2WPKH, type: walletType },
    signTransaction,
    signCommitAndReveal,
    broadcastTransaction,
    setHardwareOperationInProgress: vi.fn(),
    wallets: [],
    authState: 'UNLOCKED',
    keychainLocked: false,
  }),
}));

vi.mock('@/core/counterparty/api', () => ({
  fetchAssetDetails: vi.fn().mockResolvedValue(null),
  fetchOrderMatch: vi.fn().mockResolvedValue(null),
}));

// The fixtures spend one 1 BTC input.
vi.mock('@/core/counterparty/transaction', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/core/counterparty/transaction')>()),
  fetchInputValues: vi.fn(async (inputs: Array<{ txid: string; vout: number }>) =>
    new Map(inputs.map((input) => [`${input.txid}:${input.vout}`, 100_000_000]))),
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

const TEXT = BROADCAST_P2WPKH.request.text!;

function responseFor(result: Compose115Result = BROADCAST_P2WPKH.result): ApiResponse {
  return {
    result: {
      ...result,
      params: { source: KEY_WPKH.address, timestamp: 1790000000, value: 0, fee_fraction: 0, text: TEXT } as never,
    } as ApiResponse['result'],
  };
}

/** The broadcast form's submission for the fixture: a 600-character broadcast at 2 sat/vB. */
function broadcastForm(extra: Record<string, string> = {}): FormData {
  const form = new FormData();
  for (const [name, value] of Object.entries({
    text: TEXT, timestamp: '1790000000', value: '0', fee_fraction: '0', sat_per_vbyte: '2', ...extra,
  })) form.set(name, value);
  return form;
}

function renderComposer(composeApi: (data: Record<string, unknown>) => Promise<ApiResponse>) {
  return renderHook(() => useComposer(), {
    wrapper: ({ children }) => (
      <MemoryRouter>
        <ComposerProvider composeApi={composeApi} initialTitle="Test" composeType="broadcast">
          {children}
        </ComposerProvider>
      </MemoryRouter>
    ),
  });
}

async function composed(composeApi: (data: Record<string, unknown>) => Promise<ApiResponse>, form = broadcastForm()) {
  const hook = renderComposer(composeApi);
  await act(async () => {
    await hook.result.current.composeTransaction(form);
  });
  return hook;
}

/** What the background does: sign the commit (its segwit txid unchanged) and the reveal, for real. */
async function signBoth(rawTxHex: string, address: string, reveal: TaprootRevealToSign) {
  const output = btc.Transaction.fromRaw(hexToBytes(rawTxHex), { allowUnknownOutputs: true }).getOutput(0);
  const signedRevealHex = signTaprootReveal(reveal, { scriptHex: bytesToHex(output.script!), value: output.amount! },
    address, KEY_WPKH.privateKeyHex);
  return { signedTxHex: rawTxHex, signedRevealHex };
}

describe('ComposerContext Taproot encoding (Core 11.5)', () => {
  beforeEach(() => {
    zeldHuntSeconds = 0;
    walletType = 'mnemonic';
    signTransaction.mockReset();
    signCommitAndReveal.mockReset();
    broadcastTransaction.mockReset();
    signTransaction.mockImplementation(async (raw: string) => raw);
    signCommitAndReveal.mockImplementation(signBoth);
    broadcastTransaction.mockImplementation(async (hex: string) => ({
      txid: hex === BROADCAST_P2WPKH.result.rawtransaction ? 'commit' : 'reveal',
    }));
  });

  it('asks for Taproot unprompted, reviews the message read from the envelope, and counts both fees', async () => {
    const composeApi = vi.fn(async (_data: Record<string, unknown>) => responseFor());
    const { result } = await composed(composeApi);

    await waitFor(() => expect(result.current.state.step).toBe('review'));
    expect(result.current.state.error).toBeNull();
    expect(composeApi).toHaveBeenCalledTimes(1);
    expect(composeApi.mock.calls[0]![0]).toMatchObject({ encoding: 'taproot' });
    expect(result.current.state.decodedMessage?.data).toMatchObject({ text: TEXT });
    expect(result.current.state.apiResponse?.result.btc_fee).toBe(306);
    expect(result.current.state.apiResponse?.result.reveal_fee).toBe(526);
  });

  it('signs commit and reveal in one request, then broadcasts the commit and the source-signed reveal', async () => {
    const { result } = await composed(vi.fn(async () => responseFor()));
    await waitFor(() => expect(result.current.state.step).toBe('review'));

    await act(async () => { await result.current.signAndBroadcast(); });
    await waitFor(() => expect(result.current.state.step).toBe('success'));
    expect(signTransaction).not.toHaveBeenCalled();
    expect(signCommitAndReveal).toHaveBeenCalledTimes(1);
    const [raw, address, reveal, options] = signCommitAndReveal.mock.calls[0]!;
    expect(raw).toBe(BROADCAST_P2WPKH.result.rawtransaction);
    expect(address).toBe(KEY_WPKH.address);
    expect(reveal).toEqual({
      revealHex: BROADCAST_P2WPKH.result.reveal_rawtransaction,
      envelopeScriptHex: BROADCAST_P2WPKH.result.envelope_script,
      controlBlockHex: BROADCAST_P2WPKH.result.reveal_control_block,
    });
    // Never a ZELD nonce: the reveal spends the commit's txid.
    expect(options).not.toHaveProperty('zeldHuntSeconds');

    const broadcast = broadcastTransaction.mock.calls.map(([hex]) => hex as string);
    expect(broadcast).toHaveLength(2);
    expect(broadcast[0]).toBe(BROADCAST_P2WPKH.result.rawtransaction);
    // The reveal that goes out is the one the source signed, and Core attributes it to the source.
    const revealWitness = btc.Transaction.fromRaw(hexToBytes(broadcast[1]!), { allowUnknownOutputs: true })
      .getInput(0).finalScriptWitness!;
    expect(checkRevealSourceSignature(hexToBytes(BROADCAST_P2WPKH.result.reveal_lock_scripts[0]!),
      sourceOutputScript(KEY_WPKH.address)!, revealWitness).ok).toBe(true);
  });

  it('refuses a self-consistent compose whose envelope carries a different message', async () => {
    const tampered = tamperedMessage115(BROADCAST_P2WPKH, (m) => m.replace('54686520717569636b', '54686520717569636c'));
    const { result } = await composed(vi.fn(async () => responseFor(tampered)));
    await waitFor(() => expect(result.current.state.error).toMatch(/verification failed/i));
    expect(result.current.state.step).toBe('form');
  });

  it('accepts the rebuilt compose unaltered, so the refusals here are about what was altered', async () => {
    const { result } = await composed(vi.fn(async () => responseFor(recompose115(BROADCAST_P2WPKH))));
    await waitFor(() => expect(result.current.state.step).toBe('review'));
  });

  it('refuses an envelope closed by a key that is not the source\'s, before anything is signed', async () => {
    const other = btc.utils.pubSchnorr(new Uint8Array(32).fill(9));
    const tampered = recompose115(BROADCAST_P2WPKH, { envelope: envelopeClosedBy(BROADCAST_P2WPKH, other) });
    const { result } = await composed(vi.fn(async () => responseFor(tampered)));
    await waitFor(() => expect(result.current.state.error).toMatch(/not closed by your address/));
    expect(signCommitAndReveal).not.toHaveBeenCalled();
  });

  it('refuses a tampered control block, before anything is signed', async () => {
    const control = BROADCAST_P2WPKH.result.reveal_control_block;
    const flipped = (Number.parseInt(control.slice(0, 2), 16) ^ 1).toString(16) + control.slice(2);
    const { result } = await composed(vi.fn(async () => responseFor({ ...BROADCAST_P2WPKH.result, reveal_control_block: flipped })));
    await waitFor(() => expect(result.current.state.error).toMatch(/commit to exactly the verified envelope/));
  });

  it.each([
    'envelope_script', 'reveal_rawtransaction', 'reveal_control_block', 'reveal_pubkey', 'reveal_lock_scripts',
    'reveal_inputs_values',
  ] as const)('refuses a compose missing %s as half a Taproot compose', async (field) => {
    const response = responseFor();
    delete (response.result as unknown as Record<string, unknown>)[field];
    const composeApi = vi.fn(async () => response);
    const { result } = await composed(composeApi);
    await waitFor(() => expect(result.current.state.error).toMatch(/only one of the two transactions/));
    expect(composeApi).toHaveBeenCalledTimes(1);
  });

  it('refuses a reveal the server signed (the shape before Core 11.5) and never composes it again', async () => {
    const response = responseFor();
    Object.assign(response.result, { signed_reveal_rawtransaction: SEND_TAPROOT.signed_reveal_rawtransaction });
    const composeApi = vi.fn(async () => response);
    const { result } = await composed(composeApi);
    await waitFor(() => expect(result.current.state.error).toMatch(/already signed/));
    expect(composeApi).toHaveBeenCalledTimes(1);
    expect(broadcastTransaction).not.toHaveBeenCalled();
  });

  it('refuses a reveal the request never asked for', async () => {
    const composeApi = vi.fn(async (_data: Record<string, unknown>) => responseFor());
    const { result } = await composed(composeApi, broadcastForm({ text: 'short' }));
    await waitFor(() => expect(result.current.state.error).toMatch(/Taproot envelope is not the one/));
    expect(composeApi.mock.calls[0]![0]).not.toHaveProperty('encoding');
  });

  it('asks once more on the default encoding when the composer, or an API older than 11.5, refuses Taproot', async () => {
    const composeApi = vi.fn()
      .mockRejectedValueOnce(new CounterpartyApiError('Taproot encoding and inscriptions need Counterparty API 11.5.0 or newer. This API runs 11.3.0.', '/v2/'))
      .mockRejectedValueOnce(new CounterpartyApiError('insufficient funds', 'broadcast'));
    const { result } = await composed(composeApi);
    await waitFor(() => expect(result.current.state.error).toMatch(/insufficient funds/));
    expect(composeApi.mock.calls[0]![0]).toMatchObject({ encoding: 'taproot' });
    expect(composeApi.mock.calls[1]![0]).not.toHaveProperty('encoding');
  });

  it('shows the API-version refusal of an inscription, which is never composed another way', async () => {
    const refusal = 'Taproot encoding and inscriptions need Counterparty API 11.5.0 or newer. This API runs 11.3.0.';
    const composeApi = vi.fn().mockRejectedValue(new CounterpartyApiError(refusal, '/v2/'));
    const { result } = await composed(composeApi, broadcastForm({ inscription: 'true', encoding: 'taproot' }));
    await waitFor(() => expect(result.current.state.error).toContain('11.5.0'));
    expect(composeApi).toHaveBeenCalledTimes(1);
  });

  describe('a hardware wallet', () => {
    beforeEach(() => { walletType = 'hardware'; });

    it('never asks for Taproot: a long message keeps the default encoding', async () => {
      const composeApi = vi.fn(async (_data: Record<string, unknown>) => responseFor());
      await composed(composeApi);
      expect(composeApi).toHaveBeenCalledTimes(1);
      expect(composeApi.mock.calls[0]![0]).not.toHaveProperty('encoding');
    });

    it.each([
      ['an explicit Taproot encoding', { encoding: 'taproot' }],
      ['an inscription', { inscription: 'true', encoding: 'taproot' }],
    ])('refuses %s before composing', async (_, extra) => {
      const composeApi = vi.fn(async () => responseFor());
      const { result } = await composed(composeApi, broadcastForm(extra));
      await waitFor(() => expect(result.current.state.error).toMatch(/hardware wallet cannot sign an inscription/));
      expect(composeApi).not.toHaveBeenCalled();
    });
  });

  it('does not hunt ZELD over a Taproot commit', async () => {
    zeldHuntSeconds = 12;
    const { result } = await composed(vi.fn(async () => responseFor()));
    await waitFor(() => expect(result.current.state.step).toBe('review'));
    expect(result.current.state.apiResponse?.result.zeld_hunt?.status).toBe('skipped');
    expect(result.current.state.apiResponse?.result.rawtransaction).toBe(BROADCAST_P2WPKH.result.rawtransaction);
  });

  it('broadcasts nothing when signing stops, as a lock between the two signatures does', async () => {
    signCommitAndReveal.mockRejectedValueOnce(new Error('The signing identity changed after this request was approved.'));
    const { result } = await composed(vi.fn(async () => responseFor()));
    await waitFor(() => expect(result.current.state.step).toBe('review'));

    await act(async () => { await result.current.signAndBroadcast(); });
    await waitFor(() => expect(result.current.state.error).toBeTruthy());
    expect(broadcastTransaction).not.toHaveBeenCalled();
  });

  it('never broadcasts the reveal when the commit was refused', async () => {
    broadcastTransaction.mockRejectedValueOnce(new Error('bad-txns-inputs-missingorspent'));
    const { result } = await composed(vi.fn(async () => responseFor()));
    await waitFor(() => expect(result.current.state.step).toBe('review'));

    await act(async () => { await result.current.signAndBroadcast(); });
    await waitFor(() => expect(result.current.state.error).toBeTruthy());
    expect(broadcastTransaction).toHaveBeenCalledTimes(1);
  });

  it('keeps the signed reveal hex when the reveal is refused after the commit went out', async () => {
    broadcastTransaction
      .mockResolvedValueOnce({ txid: 'commit' })
      .mockRejectedValueOnce(new Error('min relay fee not met'));
    const { result } = await composed(vi.fn(async () => responseFor()));
    await waitFor(() => expect(result.current.state.step).toBe('review'));

    await act(async () => { await result.current.signAndBroadcast(); });
    await waitFor(() => expect(result.current.state.step).toBe('success'));
    const warning = result.current.state.verificationWarnings.at(-1) ?? '';
    expect(warning).toContain('min relay fee not met');
    const signedReveal = broadcastTransaction.mock.calls[1]![0] as string;
    expect(signedReveal).not.toBe(BROADCAST_P2WPKH.result.reveal_rawtransaction);
    expect(warning).toContain(signedReveal);
    expect(warning).not.toMatch(/inscription/i);
  });

  it('broadcasts nothing when the signed commit no longer matches its reveal', async () => {
    signCommitAndReveal.mockImplementation(async (raw: string, address: string, reveal: TaprootRevealToSign) => {
      const signed = await signBoth(raw, address, reveal);
      // A signer that changed nLockTime — as a ZELD nonce would — changes the txid the reveal spends.
      return { ...signed, signedTxHex: `${raw.slice(0, -8)}2a000000` };
    });
    const { result } = await composed(vi.fn(async () => responseFor()));
    await waitFor(() => expect(result.current.state.step).toBe('review'));

    await act(async () => { await result.current.signAndBroadcast(); });
    await waitFor(() => expect(result.current.state.error).toMatch(/no longer matches its reveal/));
    expect(broadcastTransaction).not.toHaveBeenCalled();
  });
});
