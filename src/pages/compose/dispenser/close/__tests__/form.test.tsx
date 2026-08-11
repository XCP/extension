import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { ComposerProvider } from '@/contexts/composer-context';
import * as counterpartyApi from '@/core/counterparty/api';
import { asBaseUnits, asDisplayUnits } from '@/core/numeric';
import { DispenserCloseForm } from '../form';

vi.mock('@/core/counterparty/api');

vi.mock('@/core/bitcoin/feeRate', () => ({
  getFeeRates: vi.fn().mockResolvedValue({
    fastestFee: 10,
    halfHourFee: 5,
    hourFee: 3,
    economyFee: 1,
    minimumFee: 1,
  }),
}));

vi.mock('@/contexts/wallet-context', () => ({
  useWallet: () => ({
    activeWallet: { id: 'test-wallet', name: 'Test Wallet' },
    activeAddress: { address: '17TkmnxyBmtGBRgiQ4Y8Wa8HYYz6WWUtLj', walletId: 'test-wallet' },
    authState: 'unlocked',
    signTransaction: vi.fn(),
    broadcastTransaction: vi.fn(),
    unlockWallet: vi.fn(),
    isKeychainLocked: vi.fn().mockResolvedValue(false),
  }),
}));

vi.mock('@/contexts/settings-context', () => ({
  useSettings: () => ({
    settings: { showHelpText: false },
    updateSettings: vi.fn(),
    isLoading: false,
  }),
}));

vi.mock('@/contexts/header-context', () => ({
  useHeader: () => ({
    setHeaderProps: vi.fn(),
    setTitle: vi.fn(),
    setAddressHeader: vi.fn(),
    subheadings: { addresses: {} },
  }),
}));

vi.mock('@/contexts/loading-context', () => ({
  useLoading: () => ({
    showLoading: vi.fn(() => 'loading-id'),
    hideLoading: vi.fn(),
    loading: false,
    setLoading: vi.fn(),
  }),
}));

function createMockDispenser(
  overrides: Partial<counterpartyApi.DispenserDetails> = {}
): counterpartyApi.DispenserDetails {
  return {
    asset: 'PEPECASH',
    source: '17TkmnxyBmtGBRgiQ4Y8Wa8HYYz6WWUtLj',
    tx_hash: 'abc123',
    status: 0,
    give_remaining: asBaseUnits(1000000),
    give_remaining_normalized: asDisplayUnits('10'),
    give_quantity: asBaseUnits(100000),
    give_quantity_normalized: asDisplayUnits('1'),
    satoshirate: asBaseUnits(5000),
    satoshirate_normalized: asDisplayUnits('0.00005000'),
    escrow_quantity: asBaseUnits(10000000),
    escrow_quantity_normalized: asDisplayUnits('100'),
    block_index: 800000,
    block_time: 1700000000,
    confirmed: true,
    price: asBaseUnits(5000),
    satoshi_price: 5000,
    ...overrides,
  };
}

describe('DispenserCloseForm', () => {
  const mockFormAction = vi.fn();
  const mockFetchAddressDispensers = vi.mocked(counterpartyApi.fetchAddressDispensers);

  const renderForm = (initialAsset?: string) =>
    render(
      <MemoryRouter>
        <ComposerProvider
          composeApi={vi.fn().mockResolvedValue({ result: { tx_hash: 'test' } })}
          initialTitle="Close"
          composeType="dispenser"
        >
          <DispenserCloseForm
            formAction={mockFormAction}
            initialFormData={null}
            initialAsset={initialAsset}
          />
        </ComposerProvider>
      </MemoryRouter>
    );

  beforeEach(() => vi.clearAllMocks());

  const submit = async () => {
    const button = screen.getByRole('button', { name: 'Continue' });
    await userEvent.click(button);
    return mockFormAction.mock.calls[0]?.[0] as FormData | undefined;
  };

  // Regression: the submitted asset was read from the :asset route param rather
  // than from the dispenser the user picked. Reached from Actions -> Close there
  // is no route param, so every close composed `asset=` and the node answered
  // 400 "address doesn't have the asset".
  it('submits the asset of the dispenser picked from the dropdown', async () => {
    mockFetchAddressDispensers.mockResolvedValue({
      result: [
        createMockDispenser({ asset: 'PEPECASH', tx_hash: 'aaa' }),
        createMockDispenser({ asset: 'RAREPEPE', tx_hash: 'bbb' }),
      ],
      result_count: 2,
    });

    renderForm(); // no route param, as when opened from the Actions page

    await userEvent.click(await screen.findByRole('button', { name: /^Dispenser/ }));
    await userEvent.click(await screen.findByRole('option', { name: /RAREPEPE/ }));

    const formData = await submit();
    expect(formData?.get('asset')).toBe('RAREPEPE');
    expect(formData?.get('status')).toBe('10');
  });

  it('preselects the only dispenser when arriving with an asset', async () => {
    mockFetchAddressDispensers.mockResolvedValue({
      result: [
        createMockDispenser({ asset: 'PEPECASH', tx_hash: 'aaa' }),
        createMockDispenser({ asset: 'RAREPEPE', tx_hash: 'bbb' }),
      ],
      result_count: 2,
    });

    renderForm('RAREPEPE');

    const formData = await waitFor(async () => {
      const data = await submit();
      expect(data?.get('asset')).toBe('RAREPEPE');
      return data;
    });
    expect(formData?.get('give_remaining_normalized')).toBe('10');
  });

  it('cannot be submitted until a dispenser is chosen', async () => {
    mockFetchAddressDispensers.mockResolvedValue({
      result: [
        createMockDispenser({ asset: 'PEPECASH', tx_hash: 'aaa' }),
        createMockDispenser({ asset: 'RAREPEPE', tx_hash: 'bbb' }),
      ],
      result_count: 2,
    });

    renderForm();

    await screen.findByRole('button', { name: /^Dispenser/ });
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();

    await submit();
    expect(mockFormAction).not.toHaveBeenCalled();
  });

  it('cannot be submitted when the address has no open dispensers', async () => {
    mockFetchAddressDispensers.mockResolvedValue({ result: [], result_count: 0 });

    renderForm();

    await screen.findByText(/No open dispensers found/);
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
  });
});
