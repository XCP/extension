/**
 * An MPMA composed through the wallet is held to the address table core reads at the next block,
 * on top of the byte comparison: the table is settled from the height before compose, the message
 * must carry it, and a send just short of activation says what a slow confirmation would mean.
 */

import * as btc from '@scure/btc-signer';
import { act } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { decodeAddressFromScript } from '@/core/bitcoin/address';
import { AddressFormat } from '@/core/bitcoin/addressFormat';
import type { ApiResponse } from '@/core/counterparty/compose';
import type { MpmaTableFormat, MpmaTableFormatResolution } from '@/core/counterparty/mpmaTableFormat';
import { packComposeMessage } from '@/core/counterparty/pack/messages';
import { arc4, hexToBytes } from '@/core/counterparty/unpack/binary';
import { t } from '@/i18n';
import { renderHook } from '@/i18n/__tests__/helpers/locale';
import { ComposerProvider } from '../composer-context';
import { useComposer } from '../composer-context-object';

const OWN_ADDRESS = decodeAddressFromScript('76a9145c333992ab554e7573df3d2a412df750a60d1f5b88ac')!;
const RECIPIENTS = [
  '12ZEw5Hcv1hTb6YUQJ69y1V7uhcoDz92PH',
  'bc1p242424242424242424242424242424242424242424242424242su9uzu8',
];
const LEGACY_RECIPIENTS = [RECIPIENTS[0]!, 'bc1qxvenxvenxvenxvenxvenxvenxvenxven2ymjt8'];

vi.mock('@/contexts/wallet-context', () => ({
  useWallet: () => ({
    activeAddress: { address: OWN_ADDRESS },
    activeWallet: { id: 'test-wallet', addressFormat: AddressFormat.P2PKH },
    wallets: [],
    authState: 'UNLOCKED',
    keychainLocked: false,
  }),
}));
vi.mock('@/core/counterparty/api', () => ({
  fetchAssetDetails: vi.fn().mockResolvedValue({ asset: 'XCP', divisible: true }),
}));
vi.mock('@/core/counterparty/transaction', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/core/counterparty/transaction')>()),
  fetchInputValues: vi.fn(async (inputs: Array<{ txid: string; vout: number }>) =>
    new Map(inputs.map((input) => [`${input.txid}:${input.vout}`, 100_000]))),
}));
vi.mock('@/contexts/settings-context', () => ({ useSettings: () => ({ settings: { showHelpText: true } }) }));
vi.mock('@/contexts/loading-context', () => ({ useLoading: () => ({ showLoading: vi.fn(), hideLoading: vi.fn() }) }));
vi.mock('@/contexts/header-context', () => ({ useHeader: () => ({ setHeaderProps: vi.fn() }) }));
vi.mock('@/core/counterparty/mpmaTableFormat', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/core/counterparty/mpmaTableFormat')>()),
  resolveMpmaTableFormat: vi.fn(),
}));

const { resolveMpmaTableFormat } = await import('@/core/counterparty/mpmaTableFormat');

const at = (nextBlockIndex: number): MpmaTableFormatResolution => ({
  format: nextBlockIndex >= 971_700 ? 'length-prefixed' : 'legacy',
  nextBlockIndex,
  activationHeight: 971_700,
});

/** A composed MPMA sending 1 and 2 XCP to `recipients`, its table in `format`. */
function mpmaResponse(recipients: string[], format: MpmaTableFormat): ApiResponse {
  const inputTxid = 'cd'.repeat(32);
  const message = packComposeMessage('mpma', {
    assets: 'XCP,XCP', destinations: recipients.join(','), quantities: '100000000,200000000',
  }, undefined, { mpmaTableFormat: format })!;
  const tx = new btc.Transaction({ allowUnknownOutputs: true });
  tx.addInput({ txid: inputTxid, index: 0 });
  tx.addOutput({ script: btc.Script.encode(['RETURN', arc4(hexToBytes(inputTxid), message.bytes)]), amount: 0n });
  tx.addOutput({ script: btc.OutScript.encode(btc.Address().decode(OWN_ADDRESS)), amount: 100_000n - 400n });
  return { result: { rawtransaction: tx.hex, btc_fee: 400, name: 'mpma', params: {} } } as unknown as ApiResponse;
}

async function compose(response: ApiResponse, recipients: string[]) {
  const api = vi.fn(async () => response);
  const { result } = renderHook(() => useComposer(), {
    wrapper: ({ children }) => <MemoryRouter>
      <ComposerProvider composeApi={api} initialTitle="MPMA" composeType="mpma">{children}</ComposerProvider>
    </MemoryRouter>,
  });
  const form = new FormData();
  form.set('assets', 'XCP,XCP');
  form.set('destinations', recipients.join(','));
  form.set('quantities', '1,2');
  form.set('sat_per_vbyte', '1.6');
  await act(async () => { await result.current.composeTransaction(form); });
  return { result, api };
}

describe('an MPMA composed through the wallet', () => {
  beforeEach(() => { vi.mocked(resolveMpmaTableFormat).mockReset(); });

  it('reviews a length-prefixed table after activation, Taproot recipient included', async () => {
    vi.mocked(resolveMpmaTableFormat).mockResolvedValue(at(971_750));
    const { result } = await compose(mpmaResponse(RECIPIENTS, 'length-prefixed'), RECIPIENTS);

    expect(result.current.state.error).toBeNull();
    expect(result.current.state.step).toBe('review');
    expect(result.current.state.reviewNotices).toEqual([]);
  });

  it('reviews a legacy table before activation', async () => {
    vi.mocked(resolveMpmaTableFormat).mockResolvedValue(at(971_000));
    const { result } = await compose(mpmaResponse(LEGACY_RECIPIENTS, 'legacy'), LEGACY_RECIPIENTS);

    expect(result.current.state.error).toBeNull();
    expect(result.current.state.step).toBe('review');
    expect(result.current.state.reviewNotices).toEqual([]);
  });

  it.each([
    ['a length-prefixed table before activation', 971_000, 'length-prefixed'],
    ['a legacy table after activation', 971_750, 'legacy'],
  ] as const)('refuses %s', async (_label, nextBlock, format) => {
    vi.mocked(resolveMpmaTableFormat).mockResolvedValue(at(nextBlock));
    const { result } = await compose(mpmaResponse(LEGACY_RECIPIENTS, format), LEGACY_RECIPIENTS);

    expect(result.current.state.step).toBe('form');
    expect(result.current.state.error).toBe(t('composer_context_transaction_verification_failed_the_composed'));
  });

  it('does not compose when the height cannot be confirmed', async () => {
    vi.mocked(resolveMpmaTableFormat).mockResolvedValue(null);
    const { result, api } = await compose(mpmaResponse(LEGACY_RECIPIENTS, 'legacy'), LEGACY_RECIPIENTS);

    expect(api).not.toHaveBeenCalled();
    expect(result.current.state.step).toBe('form');
    expect(result.current.state.error).toBe(t('composer_context_mpma_table_format_unconfirmed'));
  });

  it.each([971_694, 971_699])('notes a slow confirmation\'s effect when the next block is %i', async (nextBlock) => {
    vi.mocked(resolveMpmaTableFormat).mockResolvedValue(at(nextBlock));
    const { result } = await compose(mpmaResponse(LEGACY_RECIPIENTS, 'legacy'), LEGACY_RECIPIENTS);

    expect(result.current.state.step).toBe('review');
    expect(result.current.state.reviewNotices).toEqual([t('composer_context_mpma_near_activation', ['971700'])]);
  });

  it('adds no notice six blocks further out', async () => {
    vi.mocked(resolveMpmaTableFormat).mockResolvedValue(at(971_693));
    const { result } = await compose(mpmaResponse(LEGACY_RECIPIENTS, 'legacy'), LEGACY_RECIPIENTS);

    expect(result.current.state.step).toBe('review');
    expect(result.current.state.reviewNotices).toEqual([]);
  });
});
