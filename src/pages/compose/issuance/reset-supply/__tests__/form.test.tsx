import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AssetInfo } from '@/core/counterparty/api';
import { asDisplayUnits } from '@/core/numeric';
import { ResetSupplyForm } from '../form';

const mockUseAssetInfo = vi.fn();
vi.mock('@/hooks/useAssetInfo', () => ({
  useAssetInfo: () => mockUseAssetInfo(),
}));

vi.mock('@/contexts/composer-context-object', () => ({
  useComposer: () => ({ showHelpText: false, activeAddress: { address: 'bc1qowner' } }),
}));

// The composer chrome (fee rate, submit button) needs the whole composer context; the form's own
// fields are what matter here, so it is reduced to a plain form with a submit control.
vi.mock('@/components/composer/composer-form', () => ({
  ComposerForm: ({ children, formAction, submitDisabled }: any) => (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        formAction(new FormData(e.target as HTMLFormElement));
      }}
    >
      {children}
      <button type="submit" disabled={submitDisabled}>
        Continue
      </button>
    </form>
  ),
}));

vi.mock('@/components/domain/asset/asset-header', () => ({
  AssetHeader: () => <div data-testid="asset-header" />,
}));

// Stands in for the amount input, which carries its own fee/balance machinery.
vi.mock('@/components/domain/balance/amount-with-max-input', () => ({
  AmountWithMaxInput: ({ value, onChange, label, isDivisible }: any) => (
    <label>
      {label}
      <input
        aria-label={label}
        data-divisible={String(isDivisible)}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  ),
}));

function assetInfo(overrides: Partial<AssetInfo> = {}): AssetInfo {
  return {
    asset: 'MYASSET',
    asset_longname: null,
    description: 'original description',
    issuer: 'bc1qowner',
    owner: 'bc1qowner',
    divisible: false,
    locked: false,
    supply: '1000',
    supply_normalized: asDisplayUnits('1000'),
    ...overrides,
  } as AssetInfo;
}

/** Renders the form and returns the FormData captured on submit. */
function submitForm(info: AssetInfo, interact: () => void = () => {}): FormData {
  const formAction = vi.fn();
  mockUseAssetInfo.mockReturnValue({ isLoading: false, error: null, data: info });

  render(<ResetSupplyForm formAction={formAction} initialFormData={null} asset="MYASSET" />);

  interact();
  // The confirmation gate must be cleared before the form will submit at all.
  fireEvent.click(screen.getByLabelText('I understand this cannot be undone'));
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

  expect(formAction).toHaveBeenCalledTimes(1);
  return formAction.mock.calls[0]![0] as FormData;
}

describe('ResetSupplyForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('submits a new supply alongside the reset, not a bare burn', () => {
    // The whole point of the change: core's reset branch destroys the old supply and then credits
    // `quantity`, so the form has to be able to say what that quantity is.
    const data = submitForm(assetInfo(), () => {
      fireEvent.change(screen.getByLabelText('New Supply'), { target: { value: '2026' } });
    });

    expect(data.get('quantity')).toBe('2026');
    expect(data.get('reset')).toBe('true');
    expect(data.get('asset')).toBe('MYASSET');
  });

  it('sends the divisibility the user chose, which only a reset may change', () => {
    const data = submitForm(assetInfo({ divisible: false }), () => {
      fireEvent.click(screen.getByLabelText('Divisible'));
      fireEvent.change(screen.getByLabelText('New Supply'), { target: { value: '5' } });
    });

    expect(data.get('divisible')).toBe('true');
    expect(data.get('quantity')).toBe('5');
  });

  it('defaults divisibility to the asset\'s current value when untouched', () => {
    const data = submitForm(assetInfo({ divisible: true }), () => {
      fireEvent.change(screen.getByLabelText('New Supply'), { target: { value: '1' } });
    });

    expect(data.get('divisible')).toBe('true');
  });

  it('tells the amount input which divisibility to accept decimals for', () => {
    mockUseAssetInfo.mockReturnValue({ isLoading: false, error: null, data: assetInfo({ divisible: false }) });
    render(<ResetSupplyForm formAction={vi.fn()} initialFormData={null} asset="MYASSET" />);

    expect(screen.getByLabelText('New Supply').getAttribute('data-divisible')).toBe('false');
    fireEvent.click(screen.getByLabelText('Divisible'));
    expect(screen.getByLabelText('New Supply').getAttribute('data-divisible')).toBe('true');
  });

  it('omits an untouched description so the asset keeps the one it has', () => {
    // A reissuance carrying no description keeps the existing one; restating identical text would
    // only buy a larger OP_RETURN.
    const data = submitForm(assetInfo(), () => {
      fireEvent.change(screen.getByLabelText('New Supply'), { target: { value: '10' } });
    });

    expect(data.get('description')).toBe('');
  });

  it('sends an edited description', () => {
    const data = submitForm(assetInfo(), () => {
      fireEvent.change(screen.getByLabelText('Description'), {
        target: { value: 'https://example.com/new.json' },
      });
    });

    expect(data.get('description')).toBe('https://example.com/new.json');
  });

  it('prefills the description with the asset\'s current one', () => {
    mockUseAssetInfo.mockReturnValue({ isLoading: false, error: null, data: assetInfo() });
    render(<ResetSupplyForm formAction={vi.fn()} initialFormData={null} asset="MYASSET" />);

    expect(screen.getByLabelText('Description')).toHaveValue('original description');
  });

  it('can lock the new supply in the same transaction', () => {
    const data = submitForm(assetInfo(), () => {
      fireEvent.change(screen.getByLabelText('New Supply'), { target: { value: '1' } });
      fireEvent.click(screen.getByLabelText('Locked'));
    });

    expect(data.get('lock')).toBe('true');
  });

  it('does not lock unless asked', () => {
    const data = submitForm(assetInfo(), () => {
      fireEvent.change(screen.getByLabelText('New Supply'), { target: { value: '1' } });
    });

    expect(data.get('lock')).toBe('false');
  });

  it('holds submission until the destruction is acknowledged', () => {
    mockUseAssetInfo.mockReturnValue({ isLoading: false, error: null, data: assetInfo() });
    render(<ResetSupplyForm formAction={vi.fn()} initialFormData={null} asset="MYASSET" />);

    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
    fireEvent.click(screen.getByLabelText('I understand this cannot be undone'));
    expect(screen.getByRole('button', { name: 'Continue' })).not.toBeDisabled();
  });

  it('refuses to reset a locked asset', () => {
    // core: "cannot reset a locked asset".
    mockUseAssetInfo.mockReturnValue({
      isLoading: false,
      error: null,
      data: assetInfo({ locked: true }),
    });
    render(<ResetSupplyForm formAction={vi.fn()} initialFormData={null} asset="MYASSET" />);

    expect(screen.getByText(/supply is locked, so it cannot be reset/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Continue' })).not.toBeInTheDocument();
  });

  it('restores the user\'s choices when they come back from review', () => {
    mockUseAssetInfo.mockReturnValue({ isLoading: false, error: null, data: assetInfo() });
    render(
      <ResetSupplyForm
        formAction={vi.fn()}
        initialFormData={{
          sourceAddress: 'bc1qowner',
          sat_per_vbyte: 1,
          asset: 'MYASSET',
          quantity: '42',
          divisible: true,
          lock: true,
          reset: true,
          description: 'edited earlier',
        }}
        asset="MYASSET"
      />
    );

    expect(screen.getByLabelText('New Supply')).toHaveValue('42');
    expect(screen.getByLabelText('Description')).toHaveValue('edited earlier');
    expect(screen.getByLabelText('Locked')).toBeChecked();
    expect(screen.getByLabelText('Divisible')).toBeChecked();
  });
});
