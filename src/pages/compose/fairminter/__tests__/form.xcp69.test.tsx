/**
 * XCP-69 is not a fourth peer of the other three mint models. The other three decide where the
 * payment goes and leave every number to the creator; this one fixes every number, so what is
 * worth testing is that the fields disappear, that the values submitted are the standard's rather
 * than the form's, and that a launch which would miss the standard cannot be signed.
 *
 * The last of those is the one that matters most. A non-conforming launch is a perfectly valid
 * fairminter forever, and nothing on-chain records that it meant to be XCP-69.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ComposerProvider } from '@/contexts/composer-context';
import { XCP69_BASE, XCP69_WINDOW_BLOCKS } from '@/core/counterparty/xcp69';
import { FairminterForm } from '../form';

vi.mock('@/core/bitcoin/feeRate', () => ({
  getFeeRates: vi.fn().mockResolvedValue({
    fastestFee: 10, halfHourFee: 5, hourFee: 3, economyFee: 1, minimumFee: 1,
  }),
}));

vi.mock('@/contexts/wallet-context', () => ({
  useWallet: () => ({
    activeWallet: { id: 'test-wallet', name: 'Test Wallet' },
    activeAddress: { address: 'bc1qtest', walletId: 'test-wallet' },
    authState: 'unlocked',
    signTransaction: vi.fn(),
    broadcastTransaction: vi.fn(),
    unlockWallet: vi.fn(),
    isKeychainLocked: vi.fn().mockResolvedValue(false),
  }),
}));

vi.mock('@/contexts/settings-context', () => ({
  useSettings: () => ({
    settings: { showHelpText: false, counterpartyApiBase: 'https://api.test' },
    updateSettings: vi.fn(),
    isLoading: false,
  }),
}));

vi.mock('@/contexts/header-context', () => ({
  useHeader: () => ({
    setHeaderProps: vi.fn(),
    setTitle: vi.fn(),
    setAddressHeader: vi.fn(),
    setBalanceHeader: vi.fn(),
    subheadings: { addresses: {} },
  }),
}));

vi.mock('@/contexts/loading-context', () => ({
  useLoading: () => ({
    showLoading: vi.fn(() => 'loading-id'), hideLoading: vi.fn(), loading: false, setLoading: vi.fn(),
  }),
}));

const CURRENT_HEIGHT = 961512;
vi.mock('@/hooks/useBlockHeight', () => ({
  useBlockHeight: () => ({ blockHeight: 961512, isLoading: false, error: null }),
}));

vi.mock('@/hooks/useAssetInfo', () => ({
  useAssetInfo: () => ({ data: null, error: null, isLoading: false }),
}));

// AssetNameInput debounces, then asks whether the name is already issued, and only reports the
// name valid when it is not. Null means unissued, so Continue can enable.
vi.mock('@/core/counterparty/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/core/counterparty/api')>()),
  fetchAssetDetails: vi.fn().mockResolvedValue(null),
}));

global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ result: [] }) });

describe('FairminterForm — XCP-69', () => {
  const mockFormAction = vi.fn();

  const renderForm = () =>
    render(
      <MemoryRouter>
        <ComposerProvider
          composeApi={vi.fn().mockResolvedValue({ result: { tx_hash: 'test' } })}
          initialTitle="Fairminter"
          composeType="fairminter"
        >
          <FairminterForm formAction={mockFormAction} initialFormData={null} asset="" />
        </ComposerProvider>
      </MemoryRouter>
    );

  /** Open the Mint Method listbox and take the XCP-69 entry. */
  const selectXcp69 = async () => {
    fireEvent.click(await screen.findByText('XCP Fee Model (To You)'));
    fireEvent.click(await screen.findByText('XCP-69 Model (Pooled)'));
    await waitFor(() => expect(screen.getByText(/Pool reserve/i)).toBeInTheDocument());
  };

  const continueButton = () => screen.getByRole('button', { name: /continue/i });

  /** Type a name and wait for the debounced availability check, which gates the submit button. */
  const typeAssetName = async (name: string) => {
    const input = await screen.findByLabelText(/Asset Name/i);
    fireEvent.change(input, { target: { value: name } });
    await waitFor(() => expect(input).toHaveValue(name));
  };

  /** Type a conforming name and wait until the form will actually submit. */
  const typeValidAssetName = async (name = 'LAUNCHCOIN') => {
    await typeAssetName(name);
    await waitFor(() => expect(continueButton()).not.toBeDisabled(), { timeout: 5000 });
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('offers the model as the last option, after the three protocol-level ones', async () => {
    renderForm();
    fireEvent.click(await screen.findByText('XCP Fee Model (To You)'));

    // By document order rather than by role: this Headless UI version does not put role="option"
    // on the entries, so a role query finds nothing even with the list open.
    const xcp69 = await screen.findByText('XCP-69 Model (Pooled)');
    for (const label of ['BTC Fee Model (Miners)', 'XCP Fee Model (Burned)']) {
      const other = screen.getByText(label);
      // DOCUMENT_POSITION_PRECEDING === 2: the other option comes before XCP-69.
      expect(xcp69.compareDocumentPosition(other) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
    }
  });

  it('removes the fields the standard fixes', async () => {
    renderForm();
    await selectXcp69();

    // Selecting it should shrink the form, not extend it.
    for (const label of [/Hard Cap/i, /Mint per Address/i, /Tokens per Mint/i, /XCP Cost per Mint/i, /Lock Quantity/i, /Lock Description/i]) {
      expect(screen.queryByLabelText(label)).not.toBeInTheDocument();
    }
    expect(screen.queryByText(/Advanced Options/i)).not.toBeInTheDocument();
    // What is left: the name, the description, and the one parameter the standard leaves open.
    expect(screen.getByLabelText(/Announcement Lead/i)).toBeInTheDocument();
  });

  it('submits the standard\'s figures, not the form\'s', async () => {
    renderForm();
    await selectXcp69();
    await typeValidAssetName();

    fireEvent.click(continueButton());
    await waitFor(() => expect(mockFormAction).toHaveBeenCalled());

    const submitted = mockFormAction.mock.calls[0]![0] as FormData;
    // Display units — normalize.ts scales these by 1e8 before they reach core.
    expect(submitted.get('hard_cap')).toBe('100000000');
    expect(submitted.get('soft_cap')).toBe('69000000');
    expect(submitted.get('pool_quantity')).toBe('31000000');
    expect(submitted.get('lot_size')).toBe('1000');
    expect(submitted.get('lot_price')).toBe('0.01');
    expect(submitted.get('max_mint_per_address')).toBe('1000000');
    expect(submitted.get('max_mint_per_tx')).toBe('1000000');
    expect(submitted.get('premint_quantity')).toBe('0');
    expect(submitted.get('minted_asset_commission')).toBe('0');
    expect(submitted.get('divisible')).toBe('true');
    expect(submitted.get('lock_quantity')).toBe('true');
    expect(submitted.get('lock_description')).toBe('true');
    expect(submitted.get('burn_payment')).toBe('false');
    expect(submitted.get('end_block')).toBe('0');
  });

  it('submits a sale window of exactly the standard length, offset by the chosen lead', async () => {
    renderForm();
    await selectXcp69();
    await typeValidAssetName();
    fireEvent.change(screen.getByLabelText(/Announcement Lead/i), { target: { value: '10' } });

    fireEvent.click(continueButton());
    await waitFor(() => expect(mockFormAction).toHaveBeenCalled());

    const submitted = mockFormAction.mock.calls[0]![0] as FormData;
    const start = Number(submitted.get('start_block'));
    const deadline = Number(submitted.get('soft_cap_deadline_block'));
    expect(start).toBe(CURRENT_HEIGHT + 10);
    expect(deadline - start).toBe(XCP69_WINDOW_BLOCKS);
  });

  it('generates an A69 LP asset and submits that same one', async () => {
    renderForm();
    await selectXcp69();
    await typeValidAssetName();

    // Shown before signing, so the creator sees the name the launch will carry.
    const shown = screen.getByText(/^A69\d+$/);
    fireEvent.click(continueButton());
    await waitFor(() => expect(mockFormAction).toHaveBeenCalled());

    const submitted = mockFormAction.mock.calls[0]![0] as FormData;
    expect(submitted.get('lp_asset')).toBe(shown.textContent);
  });

  /**
   * The gate that matters, isolated from the name-validity gate beside it.
   *
   * `submitDisabled` also refuses an invalid asset name, so asserting "disabled" against a numeric
   * name proves nothing on its own — the first version of this test passed with the conformance
   * check deleted. Switching mint method afterwards is what separates them: the same name enables
   * the button under a model that has no standard to miss, so only conformance was holding it.
   */
  /**
   * The gate that matters, isolated from the name-validity gate beside it.
   *
   * Order is load-bearing. `submitDisabled` also refuses an invalid asset name, and the name check
   * is debounced and asynchronous — so selecting XCP-69 first and asserting "disabled" only proves
   * the debounce had not finished yet. Written that way round, this test passed with the
   * conformance check replaced by `false`. Enabling the button *before* switching model is what
   * makes the disabling afterwards attributable to conformance and nothing else.
   */
  it('blocks signing a launch that would not conform, and only for that reason', async () => {
    renderForm();
    // A numeric asset is a perfectly valid fairminter, and is not XCP-69. Under the default model
    // it submits happily, which is the baseline this test needs.
    await typeValidAssetName('A12309771814620297401');

    await selectXcp69();

    await waitFor(() =>
      expect(screen.getByText(/would not be XCP-69/i)).toBeInTheDocument()
    );
    expect(screen.getByText(/Asset must be a named asset/i)).toBeInTheDocument();
    expect(continueButton()).toBeDisabled();
  });

  it('warns about a lead too short to be relied on, without blocking it', async () => {
    // The one clause the wallet cannot verify: whether the launch confirms before its start block.
    // Unknowable here, so it is a warning rather than a refusal.
    renderForm();
    await selectXcp69();
    await typeValidAssetName();
    fireEvent.change(screen.getByLabelText(/Announcement Lead/i), { target: { value: '1' } });

    await waitFor(() => expect(screen.getByText(/cannot be corrected/i)).toBeInTheDocument());
    expect(continueButton()).not.toBeDisabled();
  });

  it('leaves the other three models alone', async () => {
    renderForm();
    // The default model still shows the fields XCP-69 removes.
    expect(await screen.findByLabelText(/Hard Cap/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Announcement Lead/i)).not.toBeInTheDocument();
  });

  it('keeps the display figures in step with the base units the predicate reads', () => {
    // Guards the pair the form depends on: it submits XCP69_DISPLAY, and conformance is judged
    // against XCP69_BASE. If they ever drift, the form would submit a launch it just approved.
    expect(XCP69_BASE.soft_cap + XCP69_BASE.pool_quantity).toBe(XCP69_BASE.hard_cap);
  });
});
