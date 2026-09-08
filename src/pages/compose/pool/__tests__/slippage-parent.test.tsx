import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SwapForm } from '../../swap/form';
import { PoolDepositForm } from '../deposit/form';
import { PoolWithdrawForm } from '../withdraw/form';

const fixture = vi.hoisted(() => ({
  updateSettings: vi.fn(),
  swapQuote: vi.fn(), depositQuote: vi.fn(), withdrawQuote: vi.fn(),
  pool: { asset_a: 'XCP', asset_b: 'TOKEN', lp_asset: 'LPTOKEN', quantity: '1000000000', reserve_a: 10000000000, reserve_b: 100, quantity_normalized: '10' },
}));
vi.mock('react-router', () => ({ useNavigate: () => vi.fn() }));
vi.mock('@/contexts/settings-context', () => ({ useSettings: () => ({ settings: {}, updateSettings: fixture.updateSettings }) }));
vi.mock('@/contexts/composer-context-object', () => ({
  useComposer: () => ({ state: { error: null, isComposing: false }, clearError: vi.fn(), activeAddress: { address: '1CounterpartyXXXXXXXXXXXXXXXUWLpVr' }, activeWallet: { name: 'Test' }, showHelpText: true, feeRate: 1, setFeeRate: vi.fn(), settings: { defaultPoolSlippage: '1' } }),
}));
vi.mock('@/hooks/useAssetDetails', () => ({ useAssetDetails: (asset: string) => ({ data: { assetInfo: { asset, divisible: asset !== 'TOKEN' }, isDivisible: asset !== 'TOKEN', availableBalance: '100', spendableBalance: '100' } }) }));
vi.mock('@/hooks/usePool', () => ({ usePool: () => ({ data: fixture.pool, isLoading: false }) }));
vi.mock('@/hooks/useLpAssetPool', () => ({ useLpAssetPool: () => ({ data: fixture.pool, isLoading: false }) }));
vi.mock('@/hooks/useMempoolAheadQuote', () => ({ useMempoolAheadQuote: () => ({ data: null }) }));
vi.mock('@/hooks/usePoolQuotes', () => ({
  usePoolSwapQuote: (options: unknown) => { fixture.swapQuote(options); return { data: { estimated_output: 10, pool_output: 10, pool_exists: true, price_impact: 0, give_remaining: 0 }, isLoading: false }; },
  usePoolDepositQuote: (options: unknown) => { fixture.depositQuote(options); return { data: { asset_a: 'XCP', asset_b: 'TOKEN', first_deposit: false, quantity_b_required: 2, quantity_minted_estimate: 100000000 }, isLoading: false }; },
  usePoolWithdrawQuote: (options: unknown) => { fixture.withdrawQuote(options); return { data: { pool_exists: true, quantity_a_estimate: 100000000, quantity_b_estimate: 2 }, isLoading: false }; },
}));
vi.mock('@/components/domain/balance/amount-with-max-input', () => ({ AmountWithMaxInput: ({ value, onChange, name }: any) => <input name={name} value={value} onChange={event => onChange(event.target.value)} /> }));
vi.mock('@/components/domain/asset/asset-select-input', () => ({ AssetSelectInput: () => null }));
vi.mock('@/components/domain/asset/asset-name-input', () => ({ AssetNameInput: () => null }));
vi.mock('@/components/domain/balance/balance-header', () => ({ BalanceHeader: () => null }));
vi.mock('@/components/domain/address/address-header', () => ({ AddressHeader: () => null }));
vi.mock('@/components/ui/headers/pool-header', () => ({ PoolHeader: () => null }));
vi.mock('@/components/ui/inputs/fee-rate-input', () => ({ FeeRateInput: () => null }));

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe.each(['swap', 'deposit', 'withdraw'] as const)('%s custom slippage reaches the real parent submit gate', kind => {
  it.each(['-5', '1e5', '0,5', '1.2.3', '0.001', '51', '1.', ''])('preserves %j and blocks quotes and direct submit without a previous minimum', async draft => {
    const action = vi.fn();
    const user = userEvent.setup();
    if (kind === 'swap') render(<SwapForm formAction={action} initialFormData={{ give_asset: 'XCP', get_asset: 'TOKEN', give_quantity: '1' } as any} />);
    if (kind === 'deposit') render(<PoolDepositForm formAction={action} initialFormData={{ asset_a: 'XCP', asset_b: 'TOKEN', quantity_a: '1', quantity_b: '2' } as any} />);
    if (kind === 'withdraw') render(<PoolWithdrawForm formAction={action} lpAsset="LPTOKEN" initialFormData={{ quantity: '1' } as any} />);
    const review = () => screen.getByRole('button', { name: /^Review (Swap|Deposit|Withdrawal)$/ });
    expect(review()).toBeEnabled();
    if (kind === 'swap') await user.click(screen.getByRole('button', { name: 'Show swap details' }));
    else await user.click(screen.getByRole('button', { name: 'Pool Settings' }));
    const custom = screen.getByLabelText('Custom slippage percent');
    await user.clear(custom);
    if (draft) await user.type(custom, draft);
    // Clearing an initially blank preset field needs an actual edit before testing empty.
    else { await user.type(custom, '2'); await user.clear(custom); }
    await user.tab();
    expect(custom).toHaveValue(draft);
    expect(custom).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('Use 0–50%');
    if (kind !== 'swap') await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(review()).toBeDisabled();
    const form = review().closest('form')!;
    fireEvent.submit(form);
    expect(action).not.toHaveBeenCalled();
    const quote = kind === 'swap' ? fixture.swapQuote : kind === 'deposit' ? fixture.depositQuote : fixture.withdrawQuote;
    expect(quote).toHaveBeenLastCalledWith(expect.objectContaining({ enabled: false }));
    const minimums = form.querySelectorAll<HTMLInputElement>('input[name="get_quantity"],input[name="min_lp_quantity"],input[name="min_quantity_a"],input[name="min_quantity_b"]');
    for (const input of minimums) expect(input.value).toBe('');
  });
});
