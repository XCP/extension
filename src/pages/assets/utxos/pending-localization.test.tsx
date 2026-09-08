import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchBitcoinTransaction } from '@/core/bitcoin/utxo';
import { fetchUtxoBalances } from '@/core/counterparty/api';
import { configureLocale, t } from '@/i18n';
import UtxoPage from './[txHash]';

const fixture = vi.hoisted(() => ({
  txid: 'a'.repeat(64),
  setHeaderProps: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock('react-router', () => ({
  useParams: () => ({ txHash: `${fixture.txid}:0` }),
  useNavigate: () => fixture.navigate,
}));
vi.mock('@/contexts/header-context', () => ({ useHeader: () => ({ setHeaderProps: fixture.setHeaderProps }) }));
vi.mock('@/contexts/wallet-context', () => ({ useWallet: () => ({ activeAddress: null, activeWallet: null }) }));
vi.mock('@/components/domain/address/address-header', () => ({ AddressHeader: () => null }));
vi.mock('@/components/ui/lists/action-list', () => ({ ActionList: () => null }));
vi.mock('@/core/bitcoin/utxo', () => ({ fetchBitcoinTransaction: vi.fn() }));
vi.mock('@/core/counterparty/api', () => ({ fetchUtxoBalances: vi.fn() }));

describe('UTXO network-pending label', () => {
  beforeEach(() => {
    configureLocale({ language: 'en', numberLocale: 'en-US' });
    vi.clearAllMocks();
    vi.mocked(fetchUtxoBalances).mockResolvedValue({ result: [{ asset: 'BONPARTY', quantity_normalized: '1' }] } as never);
    vi.mocked(fetchBitcoinTransaction).mockResolvedValue({
      blocktime: null, confirmations: 0, vout_list: [{ value_int: 546 }],
    } as never);
  });

  afterEach(() => {
    cleanup();
    configureLocale({ language: 'en', numberLocale: 'en-US' });
  });

  it('updates the pending label and header in place without reloading either transaction source', async () => {
    render(<UtxoPage />);
    await screen.findByText('Pending');
    const stableBalance = screen.getByText('BONPARTY').nextElementSibling;
    expect(stableBalance).toHaveTextContent('1');
    expect(screen.getByText('0.00000546 BTC')).toBeInTheDocument();

    for (const [language, expected] of [
      ['ja', '承認待ち'], ['zh-CN', '待确认'], ['zh-TW', '待確認'], ['zh-HK', '待確認'],
    ] as const) {
      act(() => { configureLocale({ language, numberLocale: 'en-US' }); });
      expect(screen.getByText(expected)).toBeInTheDocument();
      expect(fixture.setHeaderProps.mock.lastCall?.[0]).toEqual(expect.objectContaining({
        title: t('utxos_txhash_utxo_details'),
        rightButton: expect.objectContaining({ ariaLabel: t('utxos_txhash_copy_utxo') }),
      }));
      expect(stableBalance).toHaveTextContent('1');
      expect(screen.getByText('0.00000546 BTC')).toBeInTheDocument();
      expect(fetchBitcoinTransaction).toHaveBeenCalledExactlyOnceWith(fixture.txid);
      expect(fetchUtxoBalances).toHaveBeenCalledExactlyOnceWith(`${fixture.txid}:0`);
    }
  });

  it('continues showing a confirmed timestamp instead of pending when blocktime is present', async () => {
    vi.mocked(fetchBitcoinTransaction).mockResolvedValue({ blocktime: Math.floor(Date.now() / 1000) - 120, confirmations: 1 } as never);
    render(<UtxoPage />);
    await waitFor(() => { expect(screen.getByText('BONPARTY')).toBeInTheDocument(); });
    expect(screen.queryByText('Pending')).not.toBeInTheDocument();
    act(() => { configureLocale({ language: 'zh-CN' }); });
    expect(screen.queryByText('待确认')).not.toBeInTheDocument();
    expect(fetchBitcoinTransaction).toHaveBeenCalledTimes(1);
  });
});
