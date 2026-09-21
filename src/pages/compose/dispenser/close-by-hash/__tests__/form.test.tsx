import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { ComposerProvider } from '@/contexts/composer-context';
import * as counterpartyApi from '@/core/counterparty/api';
import { asBaseUnits, asDisplayUnits } from '@/core/numeric';
import { DispenserCloseByHashForm } from '../form';

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

const ACTIVE_ADDRESS = '17TkmnxyBmtGBRgiQ4Y8Wa8HYYz6WWUtLj';
const DISPENSER_HASH = '34f3f7565ce237346ad4b17e5acf43699dd317076d315ef3c3caf928e8a39dc5';

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
    asset: 'FAUXBATTLE',
    source: ACTIVE_ADDRESS,
    tx_hash: DISPENSER_HASH,
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

describe('DispenserCloseByHashForm', () => {
  const mockFormAction = vi.fn();
  const mockFetchDispenserByHash = vi.mocked(counterpartyApi.fetchDispenserByHash);

  const renderForm = (initialFormData: any = null) =>
    render(
      <MemoryRouter>
        <ComposerProvider
          composeApi={vi.fn().mockResolvedValue({ result: { tx_hash: 'test' } })}
          initialTitle="Close"
          composeType="dispenser"
        >
          <DispenserCloseByHashForm
            formAction={mockFormAction}
            initialFormData={initialFormData}
          />
        </ComposerProvider>
      </MemoryRouter>
    );

  const submitAfterLookup = async () => {
    await userEvent.type(screen.getByLabelText(/Transaction Hash/i), DISPENSER_HASH);
    await waitFor(() => expect(mockFetchDispenserByHash).toHaveBeenCalled(), { timeout: 3000 });
    await screen.findByText('FAUXBATTLE');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    return mockFormAction.mock.calls[0]?.[0] as FormData | undefined;
  };

  beforeEach(() => vi.clearAllMocks());

  // Regression: open_address was submitted as the dispenser's own host address even
  // when that was the address doing the signing. Core packs an action address into a
  // close only when it differs from the source, so the composed message carried none
  // and verification refused to sign: "[DANGEROUS] Open address mismatch: expected
  // 17Tkmn..., got undefined".
  it('omits open_address when closing a dispenser on the active address', async () => {
    mockFetchDispenserByHash.mockResolvedValue(createMockDispenser());

    renderForm();

    const formData = await submitAfterLookup();
    expect(formData?.get('asset')).toBe('FAUXBATTLE');
    expect(formData?.get('status')).toBe('10');
    expect(formData?.get('open_address')).toBeNull();
  });

  it('sends open_address when the dispenser sits on another address', async () => {
    mockFetchDispenserByHash.mockResolvedValue(
      createMockDispenser({ source: '1CounterpartyXXXXXXXXXXXXXXXUWLpVr' })
    );

    renderForm();

    const formData = await submitAfterLookup();
    expect(formData?.get('open_address')).toBe('1CounterpartyXXXXXXXXXXXXXXXUWLpVr');
  });

  // Regression: returning to the form put initialFormData.open_address — an address —
  // into the hash field, which then rejected it as "must be 64 hexadecimal characters"
  // and fired a doomed lookup for a dispenser named after an address.
  it('does not seed the hash field with an address after a failed compose', () => {
    renderForm({ asset: 'FAUXBATTLE', status: '10', open_address: ACTIVE_ADDRESS });

    expect(screen.getByLabelText(/Transaction Hash/i)).toHaveValue('');
    expect(mockFetchDispenserByHash).not.toHaveBeenCalled();
  });
});
