import { fireEvent, render, screen } from '@testing-library/react';
import type { ComponentType, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import ZeldSendPage from './send';

const mockFetchZeldBalance = vi.fn();
vi.mock('@/core/zeld/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/core/zeld/api')>()),
  fetchZeldBalance: (...args: unknown[]) => mockFetchZeldBalance(...args),
}));
vi.mock('@/contexts/composer-context-object', () => ({
  useComposer: () => ({ activeAddress: { address: 'bc1qsender' }, showHelpText: false }),
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
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('shows the available balance without an error when the read succeeds', async () => {
    mockFetchZeldBalance.mockResolvedValue({ baseUnits: 150_000_000n, utxos: [] });
    render(<ZeldSendPage />);
    expect(await screen.findByText('1.50000000 ZELD')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('says the balance is unavailable and retries instead of showing an empty balance', async () => {
    mockFetchZeldBalance.mockRejectedValueOnce(new Error('indexer down'));
    render(<ZeldSendPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Your balance is unavailable');

    mockFetchZeldBalance.mockResolvedValue({ baseUnits: 150_000_000n, utxos: [] });
    fireEvent.click(screen.getByRole('button', { name: 'Try Again' }));
    expect(await screen.findByText('1.50000000 ZELD')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(mockFetchZeldBalance).toHaveBeenCalledTimes(2);
  });
});
