import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ComponentType, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import ZeldSendPage from './send';

const mockSpendable = vi.fn();
let activeAddress = 'bc1qsender';
const balance = (available: bigint, total = available) => ({ available, total, locked: total - available, unavailable: 0n, utxos: [] });
vi.mock('@/core/zeld/spendable', () => ({ selectSpendableZeld: (...args: unknown[]) => mockSpendable(...args) }));
vi.mock('@/contexts/composer-context-object', () => ({
  useComposer: () => ({ activeAddress: { address: activeAddress }, showHelpText: false }),
}));
vi.mock('@/components/composer/composer', () => ({
  Composer: ({ FormComponent }: { FormComponent: ComponentType<{ formAction: () => void; initialFormData: null }> }) =>
    <FormComponent formAction={vi.fn()} initialFormData={null} />,
}));
vi.mock('@/components/composer/composer-form', () => ({
  ComposerForm: ({ children }: { children: ReactNode }) => <form>{children}</form>,
}));
vi.mock('@/components/ui/inputs/destination-input', () => ({ DestinationInput: () => null }));

describe('ZeldSendPage balance', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    activeAddress = 'bc1qsender';
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('shows the available balance without an error when the read succeeds', async () => {
    mockSpendable.mockResolvedValue(balance(150_000_000n));
    render(<ZeldSendPage />);
    expect(await screen.findByText('1.50000000 ZELD')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('says the balance is unavailable and retries instead of showing an empty balance', async () => {
    mockSpendable.mockRejectedValueOnce(new Error('indexer down'));
    render(<ZeldSendPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Your spendable ZELD balance is unavailable');

    mockSpendable.mockResolvedValue(balance(150_000_000n));
    fireEvent.click(screen.getByRole('button', { name: 'Try Again' }));
    expect(await screen.findByText('1.50000000 ZELD')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(mockSpendable).toHaveBeenCalledTimes(2);
  });

  it('uses the spendable amount and rechecks protections when Max is clicked', async () => {
    mockSpendable.mockResolvedValueOnce(balance(60_000_000n, 100_000_000n));
    render(<ZeldSendPage />);
    expect(await screen.findByText('0.60000000 ZELD')).toBeInTheDocument();
    mockSpendable.mockResolvedValueOnce(balance(20_000_000n, 100_000_000n));
    fireEvent.click(screen.getByRole('button', { name: 'Max' }));
    await waitFor(() => expect(screen.getByRole('textbox')).toHaveValue('0.2'));
    expect(mockSpendable).toHaveBeenCalledTimes(2);
    expect(screen.getByText('0.20000000 ZELD')).toBeInTheDocument();
  });

  it('disables Max and discards a stale available balance after refresh fails', async () => {
    mockSpendable.mockResolvedValueOnce(balance(150_000_000n));
    render(<ZeldSendPage />);
    await screen.findByText('1.50000000 ZELD');
    mockSpendable.mockRejectedValueOnce(new Error('attachments unavailable'));
    fireEvent.click(screen.getByRole('button', { name: 'Max' }));
    await screen.findByRole('alert');
    expect(screen.getByRole('button', { name: 'Max' })).toBeDisabled();
    expect(screen.getByRole('textbox')).toHaveValue('');
    expect(screen.queryByText('1.50000000 ZELD')).not.toBeInTheDocument();
  });

  it('does not apply a pending Max from the previous address', async () => {
    mockSpendable.mockResolvedValueOnce(balance(150_000_000n));
    const { rerender } = render(<ZeldSendPage />);
    await screen.findByText('1.50000000 ZELD');
    let resolve!: (value: ReturnType<typeof balance>) => void;
    mockSpendable.mockReturnValueOnce(new Promise(done => { resolve = done; }));
    fireEvent.click(screen.getByRole('button', { name: 'Max' }));
    activeAddress = 'bc1qnewaddress';
    mockSpendable.mockResolvedValueOnce(balance(10_000_000n));
    rerender(<ZeldSendPage />);
    await screen.findByText('0.10000000 ZELD');
    await act(async () => resolve(balance(150_000_000n)));
    expect(screen.getByRole('textbox')).toHaveValue('');
    expect(screen.getByText('0.10000000 ZELD')).toBeInTheDocument();
  });
});
