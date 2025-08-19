import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { AmountWithMaxInput } from '../amount-with-max-input';

// Mock the blockchain utilities
vi.mock('@/utils/blockchain/bitcoin', () => ({
  isValidBase58Address: vi.fn((addr) => addr && addr.startsWith('bc1'))
}));

vi.mock('@/utils/blockchain/counterparty', () => ({
  composeSend: vi.fn()
}));

vi.mock('@/utils/numeric', () => ({
  toSatoshis: vi.fn((btc) => Math.floor(parseFloat(btc) * 100000000).toString()),
  fromSatoshis: vi.fn((sats) => (parseInt(sats) / 100000000).toFixed(8)),
  subtractSatoshis: vi.fn((a, b) => (parseInt(a) - parseInt(b)).toString()),
  divideSatoshis: vi.fn((sats, count) => Math.floor(parseInt(sats) / count).toString()),
  isLessThanOrEqualToSatoshis: vi.fn((a, b) => parseInt(a) <= parseInt(b)),
  isLessThanSatoshis: vi.fn((a, b) => parseInt(a) < parseInt(b))
}));

describe('AmountWithMaxInput', () => {
  const defaultProps = {
    asset: 'XCP',
    availableBalance: '100.00000000',
    value: '',
    onChange: vi.fn(),
    sat_per_vbyte: 1,
    setError: vi.fn(),
    shouldShowHelpText: true,
    sourceAddress: { address: 'bc1qtest123' },
    maxAmount: '100.00000000',
    label: 'Amount',
    name: 'amount'
  };

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

  it('should show help text when shouldShowHelpText is true', () => {
    render(<AmountWithMaxInput {...defaultProps} shouldShowHelpText={true} />);
    
    expect(screen.getByText('Enter the amount of XCP you want to send.')).toBeInTheDocument();
  });

  it('should not show help text when shouldShowHelpText is false', () => {
    render(<AmountWithMaxInput {...defaultProps} shouldShowHelpText={false} />);
    
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

  it('should show loading state aria-label', async () => {
    const { composeSend } = await import('@/utils/blockchain/counterparty');
    (composeSend as any).mockImplementation(() => new Promise(() => {})); // Never resolves
    
    render(<AmountWithMaxInput {...defaultProps} asset="BTC" />);
    
    const maxButton = screen.getByRole('button', { name: 'Use maximum available amount' });
    fireEvent.click(maxButton);
    
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Calculating maximum amount...' })).toBeInTheDocument();
    });
  });

  it('should handle BTC max calculation with compose API', async () => {
    const { composeSend } = await import('@/utils/blockchain/counterparty');
    (composeSend as any).mockResolvedValue({
      result: { btc_fee: '1000' }
    });
    
    const onChange = vi.fn();
    render(<AmountWithMaxInput 
      {...defaultProps} 
      asset="BTC" 
      availableBalance="0.10000000"
      onChange={onChange}
    />);
    
    const maxButton = screen.getByLabelText('Use maximum available amount');
    fireEvent.click(maxButton);
    
    await waitFor(() => {
      expect(onChange).toHaveBeenCalled();
    });
  });

  it('should handle error from compose API', async () => {
    const { composeSend } = await import('@/utils/blockchain/counterparty');
    (composeSend as any).mockRejectedValue(new Error('API Error'));
    
    const setError = vi.fn();
    render(<AmountWithMaxInput 
      {...defaultProps} 
      asset="BTC" 
      setError={setError}
    />);
    
    const maxButton = screen.getByLabelText('Use maximum available amount');
    fireEvent.click(maxButton);
    
    await waitFor(() => {
      expect(setError).toHaveBeenCalledWith('API Error');
    });
  });

  it('should apply correct input styles', () => {
    render(<AmountWithMaxInput {...defaultProps} />);
    
    const input = screen.getByRole('textbox');
    expect(input).toHaveClass('mt-1');
    expect(input).toHaveClass('block');
    expect(input).toHaveClass('w-full');
    expect(input).toHaveClass('p-2');
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

  it('should handle empty maxAmount', () => {
    const onChange = vi.fn();
    render(<AmountWithMaxInput 
      {...defaultProps} 
      onChange={onChange} 
      maxAmount="" 
      availableBalance="50.00000000"
    />);
    
    const maxButton = screen.getByLabelText('Use maximum available amount');
    fireEvent.click(maxButton);
    
    expect(onChange).toHaveBeenCalledWith('50.00000000');
  });

  it('should preserve input value prop', () => {
    const { rerender } = render(<AmountWithMaxInput {...defaultProps} value="25.50000000" />);
    
    let input = screen.getByRole('textbox') as HTMLInputElement;
    expect(input.value).toBe('25.50000000');
    
    rerender(<AmountWithMaxInput {...defaultProps} value="75.12345678" />);
    
    input = screen.getByRole('textbox') as HTMLInputElement;
    expect(input.value).toBe('75.12345678');
  });
});