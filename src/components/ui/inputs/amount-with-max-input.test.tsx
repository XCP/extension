import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { AmountWithMaxInput } from './amount-with-max-input';

// Mock the validation utilities
vi.mock('@/utils/validation/bitcoin', () => ({
  isValidBitcoinAddress: vi.fn((addr) => addr && addr.startsWith('bc1'))
}));

vi.mock('@/utils/blockchain/counterparty/utxo-selection', () => ({
  selectUtxosForTransaction: vi.fn()
}));

vi.mock('@/utils/numeric', () => ({
  fromSatoshis: vi.fn((sats) => (parseInt(sats) / 100000000).toFixed(8)),
}));

describe('AmountWithMaxInput', () => {
  const defaultProps = {
    asset: 'XCP',
    availableBalance: '100.00000000',
    value: '',
    onChange: vi.fn(),
    feeRate: 1,
    setError: vi.fn(),
    showHelpText: true,
    sourceAddress: { address: 'bc1qtest123' },
    maxAmount: '100.00000000',
    label: 'Amount',
    name: 'amount'
  };

  // Helper to create mock UTXO with status
  const createMockUtxo = (txid: string, vout: number, value: number) => ({
    txid,
    vout,
    value,
    status: { confirmed: true, block_height: 850000, block_hash: 'hash', block_time: 1640995200 }
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render input with label', () => {
    render(<AmountWithMaxInput {...defaultProps} />);

    expect(screen.getByLabelText(/Amount/)).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('should show required indicator', () => {
    render(<AmountWithMaxInput {...defaultProps} />);

    const asterisk = screen.getByText('*');
    expect(asterisk).toHaveClass('text-red-500');
  });

  it('should render Max button', () => {
    render(<AmountWithMaxInput {...defaultProps} />);

    const maxButton = screen.getByLabelText('Use maximum available amount');
    expect(maxButton).toBeInTheDocument();
    expect(maxButton).toHaveTextContent('Max');
  });

  it('should handle input changes', () => {
    const onChange = vi.fn();
    const setError = vi.fn();
    render(<AmountWithMaxInput {...defaultProps} onChange={onChange} setError={setError} />);

    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '50.12345678' } });

    expect(onChange).toHaveBeenCalledWith('50.12345678');
    expect(setError).toHaveBeenCalledWith(null);
  });

  it('should show help text when showHelpText is true', () => {
    render(<AmountWithMaxInput {...defaultProps} showHelpText={true} />);

    expect(screen.getByText('Enter the amount of XCP you want to send.')).toBeInTheDocument();
  });

  it('should not show help text when showHelpText is false', () => {
    render(<AmountWithMaxInput {...defaultProps} showHelpText={false} />);

    expect(screen.queryByText(/Enter the amount of/)).not.toBeInTheDocument();
  });

  it('should show custom description when provided', () => {
    render(<AmountWithMaxInput {...defaultProps} description="Custom help text" />);

    expect(screen.getByText('Custom help text')).toBeInTheDocument();
  });

  it('should disable input when disabled prop is true', () => {
    render(<AmountWithMaxInput {...defaultProps} disabled={true} />);

    const input = screen.getByRole('textbox');
    const maxButton = screen.getByLabelText('Use maximum available amount');

    expect(input).toBeDisabled();
    expect(maxButton).toBeDisabled();
  });

  it('should handle max button click for non-BTC assets', () => {
    const onChange = vi.fn();
    render(<AmountWithMaxInput {...defaultProps} onChange={onChange} asset="XCP" maxAmount="100.00000000" />);

    const maxButton = screen.getByLabelText('Use maximum available amount');
    fireEvent.click(maxButton);

    expect(onChange).toHaveBeenCalledWith('100.00000000');
  });

  it('should divide max amount by destination count for non-BTC', () => {
    const onChange = vi.fn();
    render(<AmountWithMaxInput {...defaultProps} onChange={onChange} asset="XCP" maxAmount="100.00000000" destinationCount={4} />);

    const maxButton = screen.getByLabelText('Use maximum available amount');
    fireEvent.click(maxButton);

    expect(onChange).toHaveBeenCalledWith('25.00000000');
  });

  it('should call custom onMaxClick when provided', () => {
    const onMaxClick = vi.fn();
    render(<AmountWithMaxInput {...defaultProps} onMaxClick={onMaxClick} />);

    const maxButton = screen.getByLabelText('Use maximum available amount');
    fireEvent.click(maxButton);

    expect(onMaxClick).toHaveBeenCalled();
  });

  it('should show error when no source address', () => {
    const setError = vi.fn();
    render(<AmountWithMaxInput {...defaultProps} sourceAddress={null} setError={setError} />);

    const maxButton = screen.getByLabelText('Use maximum available amount');
    fireEvent.click(maxButton);

    expect(setError).toHaveBeenCalledWith('Source address is required to calculate max amount');
  });

  it('should have correct input attributes', () => {
    render(<AmountWithMaxInput {...defaultProps} name="testAmount" />);

    const input = screen.getByRole('textbox');
    expect(input).toHaveAttribute('name', 'testAmount');
    expect(input).toHaveAttribute('id', 'testAmount');
    expect(input).toHaveAttribute('type', 'text');
    expect(input).toHaveAttribute('autoComplete', 'off');
    expect(input).toHaveAttribute('placeholder', '0.00000000');
  });

  it('should show per destination text for multiple destinations', () => {
    render(<AmountWithMaxInput {...defaultProps} destinationCount={3} />);

    expect(screen.getByText('Enter the amount of XCP you want to send (per destination).')).toBeInTheDocument();
  });

  it('should disable max button when disableMaxButton is true and no onMaxClick', () => {
    render(<AmountWithMaxInput {...defaultProps} disableMaxButton={true} />);

    const maxButton = screen.getByLabelText('Use maximum available amount');
    expect(maxButton).toBeDisabled();
  });

  it('should enable max button when disableMaxButton is true but onMaxClick is provided', () => {
    const onMaxClick = vi.fn();
    render(<AmountWithMaxInput {...defaultProps} disableMaxButton={true} onMaxClick={onMaxClick} />);

    const maxButton = screen.getByLabelText('Use maximum available amount');
    expect(maxButton).not.toBeDisabled();
  });

  it('should show loading state aria-label while selecting UTXOs', async () => {
    const { selectUtxosForTransaction } = await import('@/utils/blockchain/counterparty/utxo-selection');
    (selectUtxosForTransaction as ReturnType<typeof vi.fn>).mockImplementation(() => new Promise(() => {})); // Never resolves

    render(<AmountWithMaxInput {...defaultProps} asset="BTC" />);

    const maxButton = screen.getByRole('button', { name: 'Use maximum available amount' });
    fireEvent.click(maxButton);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Calculating maximum amount…' })).toBeInTheDocument();
    });
  });

  it('should calculate BTC max from spendable UTXOs with fee estimation', async () => {
    const { selectUtxosForTransaction } = await import('@/utils/blockchain/counterparty/utxo-selection');
    // Mock 2 spendable UTXOs totaling 10,000,000 sats (0.1 BTC)
    (selectUtxosForTransaction as ReturnType<typeof vi.fn>).mockResolvedValue({
      utxos: [
        createMockUtxo('tx1', 0, 5000000),
        createMockUtxo('tx2', 1, 5000000)
      ],
      totalValue: 10000000,
      excludedWithAssets: 0,
      inputsSet: 'tx1:0,tx2:1'
    });

    const onChange = vi.fn();
    render(<AmountWithMaxInput
      {...defaultProps}
      asset="BTC"
      availableBalance="0.10000000"
      onChange={onChange}
      feeRate={1}
    />);

    const maxButton = screen.getByLabelText('Use maximum available amount');
    fireEvent.click(maxButton);

    await waitFor(() => {
      expect(onChange).toHaveBeenCalled();
      // vsize = 10.5 + (2 * 68) + (1 * 31) = 177.5 -> 178
      // fee = 178 * 1 = 178 sats
      // max = 10,000,000 - 178 = 9,999,822 sats = 0.09999822 BTC
      expect(onChange).toHaveBeenCalledWith('0.09999822');
    });
  });

  it('should use fee rate in vsize calculation for BTC max', async () => {
    const { selectUtxosForTransaction } = await import('@/utils/blockchain/counterparty/utxo-selection');
    (selectUtxosForTransaction as ReturnType<typeof vi.fn>).mockResolvedValue({
      utxos: [createMockUtxo('tx1', 0, 1000000)],
      totalValue: 1000000,
      excludedWithAssets: 0,
      inputsSet: 'tx1:0'
    });

    const onChange = vi.fn();
    render(<AmountWithMaxInput
      {...defaultProps}
      asset="BTC"
      availableBalance="0.01000000"
      onChange={onChange}
      feeRate={10} // 10 sat/vB
    />);

    const maxButton = screen.getByLabelText('Use maximum available amount');
    fireEvent.click(maxButton);

    await waitFor(() => {
      expect(onChange).toHaveBeenCalled();
      // vsize = 10.5 + (1 * 68) + (1 * 31) = 109.5 -> 110
      // fee = 110 * 10 = 1100 sats
      // max = 1,000,000 - 1100 = 998,900 sats = 0.00998900 BTC
      expect(onChange).toHaveBeenCalledWith('0.00998900');
    });
  });

  it('should calculate different fees for different UTXO counts', async () => {
    const { selectUtxosForTransaction } = await import('@/utils/blockchain/counterparty/utxo-selection');
    // Mock 5 spendable UTXOs
    (selectUtxosForTransaction as ReturnType<typeof vi.fn>).mockResolvedValue({
      utxos: [
        createMockUtxo('tx1', 0, 1000000),
        createMockUtxo('tx2', 0, 1000000),
        createMockUtxo('tx3', 0, 1000000),
        createMockUtxo('tx4', 0, 1000000),
        createMockUtxo('tx5', 0, 1000000)
      ],
      totalValue: 5000000,
      excludedWithAssets: 0,
      inputsSet: 'tx1:0,tx2:0,tx3:0,tx4:0,tx5:0'
    });

    const onChange = vi.fn();
    render(<AmountWithMaxInput
      {...defaultProps}
      asset="BTC"
      availableBalance="0.05000000"
      onChange={onChange}
      feeRate={1}
    />);

    const maxButton = screen.getByLabelText('Use maximum available amount');
    fireEvent.click(maxButton);

    await waitFor(() => {
      expect(onChange).toHaveBeenCalled();
      // vsize = 10.5 + (5 * 68) + (1 * 31) = 381.5 -> 382
      // fee = 382 * 1 = 382 sats
      // max = 5,000,000 - 382 = 4,999,618 sats = 0.04999618 BTC
      expect(onChange).toHaveBeenCalledWith('0.04999618');
    });
  });

  it('should fallback to 0.1 feeRate when feeRate is null', async () => {
    const { selectUtxosForTransaction } = await import('@/utils/blockchain/counterparty/utxo-selection');
    (selectUtxosForTransaction as ReturnType<typeof vi.fn>).mockResolvedValue({
      utxos: [createMockUtxo('tx1', 0, 1000000)],
      totalValue: 1000000,
      excludedWithAssets: 0,
      inputsSet: 'tx1:0'
    });

    const onChange = vi.fn();
    render(<AmountWithMaxInput
      {...defaultProps}
      asset="BTC"
      availableBalance="0.01000000"
      onChange={onChange}
      feeRate={null}
    />);

    const maxButton = screen.getByLabelText('Use maximum available amount');
    fireEvent.click(maxButton);

    await waitFor(() => {
      expect(onChange).toHaveBeenCalled();
      // vsize = 10.5 + (1 * 68) + (1 * 31) = 109.5 -> 110
      // fee = 110 * 0.1 = 11 sats
      // max = 1,000,000 - 11 = 999,989 sats = 0.00999989 BTC
      expect(onChange).toHaveBeenCalledWith('0.00999989');
    });
  });

  it('should show error when no spendable UTXOs available', async () => {
    const { selectUtxosForTransaction } = await import('@/utils/blockchain/counterparty/utxo-selection');
    (selectUtxosForTransaction as ReturnType<typeof vi.fn>).mockResolvedValue({
      utxos: [],
      totalValue: 0,
      excludedWithAssets: 0,
      inputsSet: ''
    });

    const setError = vi.fn();
    render(<AmountWithMaxInput
      {...defaultProps}
      asset="BTC"
      setError={setError}
    />);

    const maxButton = screen.getByLabelText('Use maximum available amount');
    fireEvent.click(maxButton);

    await waitFor(() => {
      expect(setError).toHaveBeenCalledWith('No available balance.');
    });
  });

  it('should show message when all UTXOs have attached assets', async () => {
    const { selectUtxosForTransaction } = await import('@/utils/blockchain/counterparty/utxo-selection');
    (selectUtxosForTransaction as ReturnType<typeof vi.fn>).mockResolvedValue({
      utxos: [],
      totalValue: 0,
      excludedWithAssets: 5, // 5 UTXOs excluded due to attached assets
      inputsSet: ''
    });

    const setError = vi.fn();
    render(<AmountWithMaxInput
      {...defaultProps}
      asset="BTC"
      setError={setError}
    />);

    const maxButton = screen.getByLabelText('Use maximum available amount');
    fireEvent.click(maxButton);

    await waitFor(() => {
      expect(setError).toHaveBeenCalledWith('No spendable balance. 5 UTXOs have attached assets.');
    });
  });

  it('should show error when fee exceeds balance', async () => {
    const { selectUtxosForTransaction } = await import('@/utils/blockchain/counterparty/utxo-selection');
    // Mock 1 UTXO with only 100 sats (too small)
    (selectUtxosForTransaction as ReturnType<typeof vi.fn>).mockResolvedValue({
      utxos: [createMockUtxo('tx1', 0, 100)],
      totalValue: 100,
      excludedWithAssets: 0,
      inputsSet: 'tx1:0'
    });

    const setError = vi.fn();
    render(<AmountWithMaxInput
      {...defaultProps}
      asset="BTC"
      setError={setError}
      feeRate={10} // fee would be ~1100 sats, exceeds 100
    />);

    const maxButton = screen.getByLabelText('Use maximum available amount');
    fireEvent.click(maxButton);

    await waitFor(() => {
      expect(setError).toHaveBeenCalledWith('Insufficient balance to cover transaction fee.');
    });
  });

  it('should show error when result is dust', async () => {
    const { selectUtxosForTransaction } = await import('@/utils/blockchain/counterparty/utxo-selection');
    // Mock 1 UTXO with 600 sats (after fee, will be below dust)
    (selectUtxosForTransaction as ReturnType<typeof vi.fn>).mockResolvedValue({
      utxos: [createMockUtxo('tx1', 0, 600)],
      totalValue: 600,
      excludedWithAssets: 0,
      inputsSet: 'tx1:0'
    });

    const setError = vi.fn();
    render(<AmountWithMaxInput
      {...defaultProps}
      asset="BTC"
      setError={setError}
      feeRate={1} // fee ~110, leaving ~490 (below 546 dust limit)
    />);

    const maxButton = screen.getByLabelText('Use maximum available amount');
    fireEvent.click(maxButton);

    await waitFor(() => {
      expect(setError).toHaveBeenCalledWith('Amount per destination after fee is below dust limit.');
    });
  });

  it('should handle UTXO selection error with generic message', async () => {
    const { selectUtxosForTransaction } = await import('@/utils/blockchain/counterparty/utxo-selection');
    (selectUtxosForTransaction as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network error'));

    const setError = vi.fn();
    render(<AmountWithMaxInput
      {...defaultProps}
      asset="BTC"
      setError={setError}
    />);

    const maxButton = screen.getByLabelText('Use maximum available amount');
    fireEvent.click(maxButton);

    await waitFor(() => {
      expect(setError).toHaveBeenCalledWith('Failed to calculate maximum amount. Please try again.');
    });
  });

  it('should divide max by destination count for multi-destination BTC sends', async () => {
    const { selectUtxosForTransaction } = await import('@/utils/blockchain/counterparty/utxo-selection');
    (selectUtxosForTransaction as ReturnType<typeof vi.fn>).mockResolvedValue({
      utxos: [createMockUtxo('tx1', 0, 1000000)],
      totalValue: 1000000,
      excludedWithAssets: 0,
      inputsSet: 'tx1:0'
    });

    const onChange = vi.fn();
    render(<AmountWithMaxInput
      {...defaultProps}
      asset="BTC"
      availableBalance="0.01000000"
      onChange={onChange}
      feeRate={1}
      destinationCount={2}
    />);

    const maxButton = screen.getByLabelText('Use maximum available amount');
    fireEvent.click(maxButton);

    await waitFor(() => {
      expect(onChange).toHaveBeenCalled();
      // vsize = 10.5 + (1 * 68) + (2 * 31) = 140.5 -> 141
      // fee = 141 * 1 = 141 sats
      // max = 1,000,000 - 141 = 999,859 sats
      // per destination = 999,859 / 2 = 499,929 sats = 0.00499929 BTC
      expect(onChange).toHaveBeenCalledWith('0.00499929');
    });
  });

  it('should apply correct input styles', () => {
    render(<AmountWithMaxInput {...defaultProps} />);

    const input = screen.getByRole('textbox');
    expect(input).toHaveClass('mt-1');
    expect(input).toHaveClass('block');
    expect(input).toHaveClass('w-full');
    expect(input).toHaveClass('p-2.5');
    expect(input).toHaveClass('rounded-md');
    expect(input).toHaveClass('border');
    expect(input).toHaveClass('bg-gray-50');
  });

  it('should apply disabled styles when disabled', () => {
    render(<AmountWithMaxInput {...defaultProps} disabled={true} />);

    const input = screen.getByRole('textbox');
    expect(input).toHaveClass('disabled:bg-gray-100');
    expect(input).toHaveClass('disabled:cursor-not-allowed');
  });

  it('should handle empty maxAmount for non-BTC', () => {
    const onChange = vi.fn();
    render(<AmountWithMaxInput
      {...defaultProps}
      onChange={onChange}
      maxAmount=""
      availableBalance="50.00000000"
    />);

    const maxButton = screen.getByLabelText('Use maximum available amount');
    fireEvent.click(maxButton);

    // When maxAmount is empty/NaN, it falls through without calling onChange
    // This is the existing behavior - test passes if no error is thrown
  });

  it('should preserve input value prop', () => {
    const { rerender } = render(<AmountWithMaxInput {...defaultProps} value="25.50000000" />);

    let input = screen.getByRole('textbox') as HTMLInputElement;
    expect(input.value).toBe('25.50000000');

    rerender(<AmountWithMaxInput {...defaultProps} value="75.12345678" />);

    input = screen.getByRole('textbox') as HTMLInputElement;
    expect(input.value).toBe('75.12345678');
  });

  it('should use larger input size for legacy P2PKH addresses', async () => {
    const { selectUtxosForTransaction } = await import('@/utils/blockchain/counterparty/utxo-selection');
    (selectUtxosForTransaction as ReturnType<typeof vi.fn>).mockResolvedValue({
      utxos: [createMockUtxo('tx1', 0, 1000000)],
      totalValue: 1000000,
      excludedWithAssets: 0,
      inputsSet: 'tx1:0'
    });

    const onChange = vi.fn();
    // Legacy address starts with '1'
    render(<AmountWithMaxInput
      {...defaultProps}
      asset="BTC"
      availableBalance="0.01000000"
      sourceAddress={{ address: '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2' }}
      onChange={onChange}
      feeRate={1}
    />);

    const maxButton = screen.getByLabelText('Use maximum available amount');
    fireEvent.click(maxButton);

    await waitFor(() => {
      expect(onChange).toHaveBeenCalled();
      // Legacy P2PKH: vsize = 10.5 + (1 * 148) + (1 * 31) = 189.5 -> 190
      // fee = 190 * 1 = 190 sats
      // max = 1,000,000 - 190 = 999,810 sats = 0.00999810 BTC
      expect(onChange).toHaveBeenCalledWith('0.00999810');
    });
  });

  it('should use taproot input size for bc1p addresses', async () => {
    const { selectUtxosForTransaction } = await import('@/utils/blockchain/counterparty/utxo-selection');
    (selectUtxosForTransaction as ReturnType<typeof vi.fn>).mockResolvedValue({
      utxos: [createMockUtxo('tx1', 0, 1000000)],
      totalValue: 1000000,
      excludedWithAssets: 0,
      inputsSet: 'tx1:0'
    });

    const onChange = vi.fn();
    // Taproot address starts with 'bc1p'
    render(<AmountWithMaxInput
      {...defaultProps}
      asset="BTC"
      availableBalance="0.01000000"
      sourceAddress={{ address: 'bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqzk5jj0' }}
      onChange={onChange}
      feeRate={1}
    />);

    const maxButton = screen.getByLabelText('Use maximum available amount');
    fireEvent.click(maxButton);

    await waitFor(() => {
      expect(onChange).toHaveBeenCalled();
      // Taproot P2TR: vsize = 10.5 + (1 * 58) + (1 * 31) = 99.5 -> 100
      // fee = 100 * 1 = 100 sats
      // max = 1,000,000 - 100 = 999,900 sats = 0.00999900 BTC
      expect(onChange).toHaveBeenCalledWith('0.00999900');
    });
  });
});
