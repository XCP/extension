import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AmountWithMaxInput } from '@/components/domain/balance/amount-with-max-input';
import { FeeRateInput } from '@/components/ui/inputs/fee-rate-input';
import { PriceWithSuggestInput } from '@/components/ui/inputs/price-with-suggest-input';
import { normalizeFormData } from '@/core/counterparty/normalize';
import { useFeeRates } from '@/hooks/useFeeRates';
import { IssuanceForm } from '@/pages/compose/issuance/form';
import { ComposerForm } from './composer-form';

vi.mock('@/contexts/composer-context-object', () => ({ useComposer: () => ({ state: {}, showHelpText: false, clearError: vi.fn(), feeRate: 1, setFeeRate: vi.fn() }) }));
vi.mock('@/hooks/useFeeRates', () => ({ useFeeRates: vi.fn(() => ({ feeRates: null, isLoading: true, error: null, uniquePresetOptions: [] })) }));
vi.mock('@/hooks/useAssetDetails', () => ({ useAssetDetails: () => ({ data: null }) }));
vi.mock('@/components/domain/asset/asset-name-input', () => ({ AssetNameInput: () => null }));
vi.mock('@/core/counterparty/api', () => ({ fetchAssetDetails: vi.fn(async () => ({ asset: 'TOKEN', divisible: false })) }));

function AmountHarness({ divisible = true, submitted, price = false, memo = false }: { divisible?: boolean; submitted: (raw: string) => void; price?: boolean; memo?: boolean }) {
  const [draft, setDraft] = useState('');
  return <ComposerForm showFeeRate={false} formAction={async form => {
    const result = await normalizeFormData(form, 'send');
    submitted(result.normalizedData.quantity);
  }}>
    <input type="hidden" name="asset" value={divisible ? 'XCP' : 'TOKEN'} />
    {memo && <input name="memo" aria-label="Memo" />}
    {price
      ? <PriceWithSuggestInput name="quantity" value={draft} onChange={setDraft} tradingPairData={null} />
      : <AmountWithMaxInput asset={divisible ? 'XCP' : 'TOKEN'} availableBalance="100" maxAmount="100" value={draft} onChange={setDraft} sourceAddress={{ address: 'test' }} setError={() => {}} label="Amount" name="quantity" isDivisible={divisible} />}
  </ComposerForm>;
}

describe('complete draft to native compose intent', () => {
  it('changing issuance divisibility never guesses that the entered supply was base units', async () => {
    const user = userEvent.setup();
    render(<IssuanceForm formAction={vi.fn()} initialFormData={{ asset: 'TOKEN', quantity: '100000000', divisible: false } as any} />);
    const input = screen.getByRole('textbox', { name: /^Amount/ });
    await user.click(screen.getByRole('checkbox', { name: /^Divisible$/ }));
    expect(input).toHaveValue('100000000');
    await user.clear(input); await user.type(input, '0.5');
    await user.click(screen.getByRole('checkbox', { name: /^Divisible$/ }));
    expect(input).toHaveValue('0.5'); expect(input).toHaveAttribute('aria-invalid', 'true');
  });
  it.each(['-5', '+5', '1e5', '1,234', '0,5', '1.2.3', '0.000000001', '1.000000000', '1 BTC', '１.５'])('retains sequential %s and sends nothing', async draft => {
    const submitted = vi.fn(); const user = userEvent.setup();
    render(<AmountHarness submitted={submitted} />);
    const input = screen.getByRole('textbox');
    await user.type(input, draft);
    expect(input).toHaveValue(draft);
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Use digits and a dot, up to 8 decimals. No commas.');
    fireEvent.submit(input.closest('form')!);
    expect(submitted).not.toHaveBeenCalled();
  });
  it.each(['0.5', '1.5'])('never drops the period of indivisible %s', async draft => {
    const submitted = vi.fn(); const user = userEvent.setup(); render(<AmountHarness divisible={false} submitted={submitted} />);
    const input = screen.getByRole('textbox'); await user.type(input, draft);
    expect(input).toHaveValue(draft); fireEvent.submit(input.closest('form')!); expect(submitted).not.toHaveBeenCalled();
    await user.clear(input); await user.type(input, '100'); await user.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(submitted).toHaveBeenCalledWith('100'));
  });
  it('recovers by deletion, then composes the exact amount above Number precision', async () => {
    const submitted = vi.fn(); const user = userEvent.setup(); render(<AmountHarness submitted={submitted} />);
    const input = screen.getByRole('textbox'); await user.type(input, '1e5'); await user.clear(input); await user.type(input, '100000000.00000001');
    await user.click(screen.getByRole('button', { name: 'Continue' })); await waitFor(() => expect(submitted).toHaveBeenCalledWith('10000000000000001'));
  });
  it('a multiline paste cannot leave a last-valid amount submittable', async () => {
    const submitted = vi.fn(); const user = userEvent.setup(); render(<AmountHarness submitted={submitted} />);
    const input = screen.getByRole('textbox'); await user.type(input, '5'); await user.paste('1\n234');
    expect(input).toHaveValue('5'); expect(screen.getByText(/Paste one value without line breaks/)).toBeInTheDocument(); fireEvent.submit(input.closest('form')!); expect(submitted).not.toHaveBeenCalled();
  });
  it('editing another field cannot dismiss a rejected amount paste', async () => {
    const submitted = vi.fn(); const user = userEvent.setup(); render(<AmountHarness memo submitted={submitted} />);
    const input = screen.getByRole('textbox', { name: /^Amount/ });
    await user.type(input, '5'); await user.paste('1\n234');
    await user.type(screen.getByRole('textbox', { name: 'Memo' }), 'changed');
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
    fireEvent.submit(input.closest('form')!); expect(submitted).not.toHaveBeenCalled();
    await user.clear(input); await user.type(input, '6');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(submitted).toHaveBeenCalledWith('600000000'));
  });
  it.each(['-5', '1e5', '1.2.3', '0,5'])('price field also preserves invalid %s', async draft => {
    const submitted = vi.fn(); const user = userEvent.setup(); render(<AmountHarness price submitted={submitted} />);
    const input = screen.getByRole('textbox'); await user.type(input, draft); expect(input).toHaveValue(draft);
    fireEvent.submit(input.closest('form')!); expect(submitted).not.toHaveBeenCalled();
  });
});

describe('custom fee editing and blur', () => {
  beforeEach(() => { vi.mocked(useFeeRates).mockReturnValue({ feeRates: null, isLoading: false, error: new Error('offline'), uniquePresetOptions: [] } as any); });
  it.each(['1,5', '0,5', '-5', '1e2', '1.2.3', '1.000000000'])('keeps %s invalid through blur', async draft => {
    const changed = vi.fn(); const user = userEvent.setup(); render(<FeeRateInput onFeeRateChange={changed} />);
    const input = screen.getByRole('textbox'); await user.type(input, draft); await user.tab();
    expect(input).toHaveValue(draft); expect(changed).toHaveBeenLastCalledWith(null);
  });
  it.each(['0.1', '1.56', '0.101'])('preserves supported fee %s without rounding', async draft => {
    const changed = vi.fn(); const user = userEvent.setup(); render(<FeeRateInput onFeeRateChange={changed} />);
    const input = screen.getByRole('textbox'); await user.type(input, draft); await user.tab();
    expect(input).toHaveValue(draft); expect(changed).toHaveBeenLastCalledWith(Number(draft));
  });
});
