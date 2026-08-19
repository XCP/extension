/**
 * The fairmint form asks for lots and submits a quantity, so the conversion between the two is
 * the thing worth testing: it decides how many tokens are minted and how much XCP is spent.
 *
 * The form had no test of any kind before this. Its e2e spec stops at the fairminter selector by
 * design ("Tests check the initial page structure before fairminter selection"), so nothing
 * exercised the field, the max, or the submitted quantity.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ComposerProvider } from '@/contexts/composer-context';
import { clearApiCache, type FairminterDetails } from '@/core/counterparty/api';
import { asBaseUnits, asDisplayUnits } from '@/core/numeric';
import { FairmintForm } from '../form';

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
    // BalanceHeader calls this on mount; without it the form throws before rendering.
    setBalanceHeader: vi.fn(),
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

// The XCP balance the Max button spends against.
vi.mock('@/hooks/useAssetDetails', () => ({
  useAssetDetails: (asset: string) => ({
    data: asset
      ? {
          assetInfo: { asset, asset_longname: null, divisible: true, locked: false, description: '' },
          isDivisible: true,
          availableBalance: '100',
        }
      : null,
    error: null,
    isLoading: false,
  }),
}));

/** 1 XCP per lot of 1,000 tokens. */
function createMockFairminter(overrides: Partial<FairminterDetails> = {}): FairminterDetails {
  return {
    tx_hash: 'fm-hash',
    asset: 'TESTMINT',
    status: 'open',
    source: 'bc1qissuer',
    description: 'A test fairminter',
    divisible: false,
    price: asBaseUnits(100000000),
    price_normalized: asDisplayUnits('0.001'),
    quantity_by_price: asBaseUnits(1000),
    quantity_by_price_normalized: asDisplayUnits('1000'),
    burn_payment: false,
    ...overrides,
  };
}

global.fetch = vi.fn();

describe('FairmintForm', () => {
  const mockFormAction = vi.fn();

  const mockFairmintersResponse = (fairminters: FairminterDetails[]) => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ result: fairminters }),
    });
  };

  const renderForm = (initialFormData: any = null, routeAsset = 'XCP') =>
    render(
      <MemoryRouter>
        <ComposerProvider
          composeApi={vi.fn().mockResolvedValue({ result: { tx_hash: 'test' } })}
          initialTitle="Fairmint"
          composeType="fairmint"
        >
          <FairmintForm formAction={mockFormAction} initialFormData={initialFormData} asset={routeAsset} />
        </ComposerProvider>
      </MemoryRouter>
    );

  /**
   * Pick the fairminter, which is what reveals the rest of the form.
   *
   * fireEvent.change rather than userEvent — the same way asset-select-input.test.tsx drives this
   * combobox. Headless UI opens its list on the change event, not on a click, under jsdom.
   */
  const selectFairminter = async (asset = 'TESTMINT') => {
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const input = screen.getByRole('combobox', { name: /Fairminter Asset/i });
    fireEvent.change(input, { target: { value: asset } });
    // Found by text, then clicked on the option element itself — clicking the inner span does not
    // select. The option's accessible name is assembled from the icon, asset and lot line, so a
    // role+name query does not find it.
    const label = await screen.findByText(asset);
    const option = label.closest('[role="option"]') ?? label;
    // Headless UI selects on pointer events, which fireEvent.click does not emit; jsdom also
    // reports every element as pointer-events:none, so that check has to be off.
    await userEvent.setup({ pointerEventsCheck: 0 }).click(option);
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // cpApiGet caches by URL, so without this the second test to ask for an address's fairmint
    // history is handed the first one's answer and never calls fetch at all.
    clearApiCache();
    mockFairmintersResponse([createMockFairminter()]);
  });

  it('renders the fairminter selector', async () => {
    renderForm();
    expect(screen.getByRole('combobox', { name: /Fairminter Asset/i })).toBeInTheDocument();
  });

  it('asks for lots, not an amount of tokens', async () => {
    renderForm();
    await selectFairminter();

    expect(await screen.findByLabelText(/Lots to Mint/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Amount to Mint/i)).not.toBeInTheDocument();
  });

  it('states what a lot costs and where the payment goes', async () => {
    renderForm();
    await selectFairminter();

    // Unconditionally, not behind showHelpText — which is false in these tests.
    expect(await screen.findByText(/1 XCP per lot/i)).toBeInTheDocument();
    expect(screen.getByText(/XCP Fee \(to issuer\)/i)).toBeInTheDocument();
  });

  /**
   * The form says what a lot costs and where the money goes; it does not total the order or name
   * the issuer. Both belong to the review screen, and carrying them here made the form a worse
   * copy of it — the running total in particular read as a bare "— XCP" until something was typed.
   */
  it('leaves the running total and the issuer address to the review screen', async () => {
    renderForm();
    await selectFairminter();
    await screen.findByText(/1 XCP per lot/i);

    expect(screen.queryByText('bc1qissuer')).not.toBeInTheDocument();
    expect(screen.queryByText(/^— XCP$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/You pay/i)).not.toBeInTheDocument();
  });

  // A fairminter that seeds a liquidity pool pays the pool, not the address that opened it. This
  // screen read only price and burn_payment, so it called a pool mint "XCP Fee (to issuer)".
  it('names the pool when the payment seeds one', async () => {
    mockFairmintersResponse([
      createMockFairminter({
        pool_quantity: asBaseUnits(3100000000000000),
        pool_quantity_normalized: asDisplayUnits('31000000'),
      }),
    ]);
    renderForm();
    await selectFairminter();

    expect(await screen.findByText(/XCP Fee \(to liquidity pool\)/i)).toBeInTheDocument();
    expect(screen.queryByText(/XCP Fee \(to issuer\)/i)).not.toBeInTheDocument();
  });

  /**
   * Core refuses a paid mint that would take the supply past the hard cap — it rejects the whole
   * transaction rather than minting the remainder, so the last mint of a sale must be floored to
   * what is left. The Max button already respected that bound; a typed figure did not, and only
   * found out at compose, where the creator got core's wording instead of ours.
   *
   * Driven here through the per-transaction cap, which `maxLots` carries alongside the hard-cap,
   * per-address and balance bounds — one check covers all four.
   */
  it('refuses a lot count above what is still mintable, before composing', async () => {
    mockFairmintersResponse([
      createMockFairminter({ max_mint_per_tx_normalized: asDisplayUnits('2000') }),
    ]);
    renderForm();
    await selectFairminter();

    const lots = await screen.findByLabelText(/Lots to Mint/i);
    // 2,000 tokens per transaction at 1,000 per lot leaves two lots.
    fireEvent.change(lots, { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: /continue|review/i }));

    expect(await screen.findByText(/at most 2 lots/i)).toBeInTheDocument();
    expect(mockFormAction).not.toHaveBeenCalled();
  });

  it('still composes a lot count within the bound', async () => {
    mockFairmintersResponse([
      createMockFairminter({ max_mint_per_tx_normalized: asDisplayUnits('2000') }),
    ]);
    renderForm();
    await selectFairminter();

    const lots = await screen.findByLabelText(/Lots to Mint/i);
    fireEvent.change(lots, { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: /continue|review/i }));

    await waitFor(() => expect(mockFormAction).toHaveBeenCalled());
    expect((mockFormAction.mock.calls[0]![0] as FormData).get('quantity')).toBe('2000');
  });

  it('submits the quantity the lot count implies, not the lot count', async () => {
    renderForm();
    await selectFairminter();

    const lots = await screen.findByLabelText(/Lots to Mint/i);
    fireEvent.change(lots, { target: { value: '3' } });

    fireEvent.click(screen.getByRole('button', { name: /continue|review/i }));

    await waitFor(() => expect(mockFormAction).toHaveBeenCalled());
    const submitted = mockFormAction.mock.calls[0]![0] as FormData;
    // 3 lots of 1,000 tokens.
    expect(submitted.get('quantity')).toBe('3000');
    expect(submitted.get('asset')).toBe('TESTMINT');
  });

  it('will not submit without a lot count', async () => {
    renderForm();
    await selectFairminter();
    await screen.findByLabelText(/Lots to Mint/i);

    // Blocked by the disabled button rather than by an error message, so clicking does nothing
    // and handleSubmit's "Enter how many lots" guard is a backstop rather than the visible path.
    expect(screen.getByRole('button', { name: /continue|review/i })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /continue|review/i }));
    expect(mockFormAction).not.toHaveBeenCalled();
  });

  describe('free mints', () => {
    beforeEach(() => {
      mockFairmintersResponse([
        createMockFairminter({ price: asBaseUnits(0), price_normalized: asDisplayUnits('0') }),
      ]);
    });

    it('asks for no quantity at all', async () => {
      // Reached from a BTC route: the XCP filter keeps only priced fairminters.
      renderForm(null, 'BTC');
      await selectFairminter();

      // Asserted on the summary's wording, not on /Free mint/: the dropdown row itself reads
      // "Free mint (BTC fees only)", so that matches whether or not the selection registered.
      expect(await screen.findByText(/Bitcoin network fee only/i)).toBeInTheDocument();
      expect(screen.queryByLabelText(/Lots to Mint/i)).not.toBeInTheDocument();
    });

    it('submits quantity 0, because the fairminter decides the amount', async () => {
      renderForm(null, 'BTC');
      await selectFairminter();
      await screen.findByText(/Bitcoin network fee only/i);

      fireEvent.click(screen.getByRole('button', { name: /continue|review/i }));

      await waitFor(() => expect(mockFormAction).toHaveBeenCalled());
      const submitted = mockFormAction.mock.calls[0]![0] as FormData;
      expect(submitted.get('quantity')).toBe('0');
    });
  });

  /**
   * The reported bug. An address that has already minted its per-address allowance clicked Max and
   * nothing happened at all: the handler filled the field with `maxLots()` — "0" — and then cleared
   * the validation error, so the one control that could have explained the situation wiped the
   * explanation instead.
   *
   * A zero is the same number whichever bound produced it, so the fix is that the button says which.
   */
  describe('Max when there is nothing left to mint', () => {
    /**
     * Route the fairminter list and this address's fairmint history to different answers.
     *
     * `text()` and a JSON content-type, not `json()`: `apiClient` parses every response through
     * `parseJsonLossless(await response.text())`, because JSON.parse rounds a 64-bit quantity
     * while parsing. A mock offering only `json()` makes the read throw, and
     * `fetchAddressFairmintTotal` swallows that into `null` — which reads as "allowance unknown"
     * and quietly offers the whole allowance back.
     */
    const mockMintedTotal = (fairminter: FairminterDetails, earned: string) => {
      (global.fetch as any).mockImplementation((url: string) => {
        const body = String(url).includes('/fairmints/')
          ? { result: [{ earn_quantity_normalized: earned }] }
          : { result: [fairminter] };
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: { get: (name: string) =>
            name.toLowerCase() === 'content-type' ? 'application/json' : null },
          text: async () => JSON.stringify(body),
          json: async () => body,
        });
      });
    };

    /**
     * The allowance already spent is fetched only once a fairminter is chosen. Clicking before it
     * lands reads `alreadyMinted` as unknown, which bounds by the whole allowance and offers lots
     * that are gone — so the wait is part of what is being tested, not a workaround for it.
     */
    const waitForMintedTotal = () =>
      waitFor(() =>
        expect(
          (global.fetch as any).mock.calls.some((call: unknown[]) =>
            String(call[0]).includes('/fairmints/')
          )
        ).toBe(true)
      );

    // 5 lots of 1,000 allowed per address, all 5 already minted.
    const cappedFairminter = () =>
      createMockFairminter({
        max_mint_per_address: asBaseUnits(5000),
        max_mint_per_address_normalized: asDisplayUnits('5000'),
      });

    it('says the allowance is spent instead of doing nothing', async () => {
      const fairminter = cappedFairminter();
      mockMintedTotal(fairminter, '5000');
      renderForm();
      await selectFairminter();

      const max = await screen.findByRole('button', { name: /Use maximum available amount/i });
      await waitForMintedTotal();
      await userEvent.setup({ pointerEventsCheck: 0 }).click(max);

      expect(await screen.findByText(/already minted the most this fairminter allows per address/i))
        .toBeInTheDocument();
    });

    it('does not blame the balance, which is fine', async () => {
      const fairminter = cappedFairminter();
      mockMintedTotal(fairminter, '5000');
      renderForm();
      await selectFairminter();

      const max = await screen.findByRole('button', { name: /Use maximum available amount/i });
      await waitForMintedTotal();
      await userEvent.setup({ pointerEventsCheck: 0 }).click(max);

      await screen.findByText(/per address/i);
      expect(screen.queryByText(/balance is too low/i)).not.toBeInTheDocument();
    });

    it('still fills in the count when there is an allowance left', async () => {
      const fairminter = cappedFairminter();
      mockMintedTotal(fairminter, '2000'); // 3 lots of the 5 remain
      renderForm();
      await selectFairminter();

      const max = await screen.findByRole('button', { name: /Use maximum available amount/i });
      await waitForMintedTotal();
      await userEvent.setup({ pointerEventsCheck: 0 }).click(max);

      await waitFor(() =>
        expect(screen.getByRole('textbox', { name: /Lots to Mint/i })).toHaveValue('3')
      );
      expect(screen.queryByText(/per address/i)).not.toBeInTheDocument();
    });
  });

  describe('restoring from review', () => {
    it('turns the composed quantity back into lots', async () => {
      renderForm({ asset: 'TESTMINT', quantity: 5000 });

      // The lot size is not known until the fairminter loads, so this cannot be done up front.
      await waitFor(async () =>
        expect(await screen.findByLabelText(/Lots to Mint/i)).toHaveValue('5')
      );
      });
  });
});
