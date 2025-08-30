import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { DestinationInput } from '../destination-input';
import React from 'react';

// Mock the bitcoin validation utility
vi.mock('@/utils/validation', () => ({
  isValidBitcoinAddress: vi.fn()
}));

import { isValidBitcoinAddress } from '@/utils/validation';

describe('DestinationInput', () => {
  const mockIsValidBitcoinAddress = isValidBitcoinAddress as any;

  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock implementation
    mockIsValidBitcoinAddress.mockImplementation((addr: string) => {
      // Simple mock validation
      return addr && (addr.startsWith('bc1') || addr.startsWith('1') || addr.startsWith('3'));
    });
  });

  it('should render input with label', () => {
    render(<DestinationInput value="" onChange={vi.fn()} />);
    
    expect(screen.getByText('Destination')).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('should use custom label', () => {
    render(<DestinationInput value="" onChange={vi.fn()} label="Recipient Address" />);
    
    expect(screen.getByText('Recipient Address')).toBeInTheDocument();
  });

  it('should show required indicator by default', () => {
    render(<DestinationInput value="" onChange={vi.fn()} />);
    
    const asterisk = screen.getByText('*');
    expect(asterisk).toHaveClass('text-red-500');
  });

  it('should not show required indicator when not required', () => {
    render(<DestinationInput value="" onChange={vi.fn()} required={false} />);
    
    expect(screen.queryByText('*')).not.toBeInTheDocument();
  });

  it('should handle input changes and trim whitespace', () => {
    const onChange = vi.fn();
    render(<DestinationInput value="" onChange={onChange} />);
    
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '  bc1qtest123  ' } });
    
    expect(onChange).toHaveBeenCalledWith('bc1qtest123');
  });

  it('should validate on change and notify parent when valid', () => {
    const onChange = vi.fn();
    const onValidationChange = vi.fn();
    
    render(<DestinationInput value="" onChange={onChange} onValidationChange={onValidationChange} />);
    
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'bc1qvalidaddress' } });
    
    expect(onValidationChange).toHaveBeenCalledWith(true);
  });

  it('should validate on change and notify parent when invalid', () => {
    const onChange = vi.fn();
    const onValidationChange = vi.fn();
    mockIsValidBitcoinAddress.mockReturnValue(false);
    
    render(<DestinationInput value="" onChange={onChange} onValidationChange={onValidationChange} />);
    
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'invalidaddress' } });
    
    expect(onValidationChange).toHaveBeenCalledWith(false);
  });

  it('should treat empty as invalid when required', () => {
    const onValidationChange = vi.fn();
    const onChange = vi.fn();
    
    const { rerender } = render(<DestinationInput value="test" onChange={onChange} onValidationChange={onValidationChange} required={true} />);
    
    // Clear the validation mock to test the empty change
    onValidationChange.mockClear();
    
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '' } });
    
    expect(onValidationChange).toHaveBeenCalledWith(false);
  });

  it('should treat empty as valid when not required', () => {
    const onValidationChange = vi.fn();
    const onChange = vi.fn();
    
    const { rerender } = render(<DestinationInput value="test" onChange={onChange} onValidationChange={onValidationChange} required={false} />);
    
    // Clear the validation mock to test the empty change
    onValidationChange.mockClear();
    
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '' } });
    
    expect(onValidationChange).toHaveBeenCalledWith(true);
  });

  it('should show invalid border when value is invalid', () => {
    mockIsValidBitcoinAddress.mockReturnValue(false);
    
    render(<DestinationInput value="invalidaddress" onChange={vi.fn()} />);
    
    const input = screen.getByRole('textbox');
    expect(input).toHaveClass('border-red-500');
  });

  it('should not show invalid border when value is valid', () => {
    mockIsValidBitcoinAddress.mockReturnValue(true);
    
    render(<DestinationInput value="bc1qvalidaddress" onChange={vi.fn()} />);
    
    const input = screen.getByRole('textbox');
    expect(input).not.toHaveClass('border-red-500');
  });

  it('should not show invalid border when value is empty', () => {
    render(<DestinationInput value="" onChange={vi.fn()} />);
    
    const input = screen.getByRole('textbox');
    expect(input).not.toHaveClass('border-red-500');
  });

  it('should show help text when showHelpText is true', () => {
    render(<DestinationInput value="" onChange={vi.fn()} showHelpText={true} />);
    
    expect(screen.getByText("Enter recipient's address.")).toBeInTheDocument();
  });

  it('should show custom help text', () => {
    render(<DestinationInput value="" onChange={vi.fn()} showHelpText={true} helpText="Custom help message" />);
    
    expect(screen.getByText('Custom help message')).toBeInTheDocument();
  });

  it('should not show help text when showHelpText is false', () => {
    render(<DestinationInput value="" onChange={vi.fn()} showHelpText={false} />);
    
    expect(screen.queryByText("Enter recipient's address.")).not.toBeInTheDocument();
  });

  it('should use default placeholder', () => {
    render(<DestinationInput value="" onChange={vi.fn()} />);
    
    const input = screen.getByRole('textbox');
    expect(input).toHaveAttribute('placeholder', 'Enter destination address');
  });

  it('should use custom placeholder', () => {
    render(<DestinationInput value="" onChange={vi.fn()} placeholder="Bitcoin address here" />);
    
    const input = screen.getByRole('textbox');
    expect(input).toHaveAttribute('placeholder', 'Bitcoin address here');
  });

  it('should be disabled when disabled prop is true', () => {
    render(<DestinationInput value="" onChange={vi.fn()} disabled={true} />);
    
    const input = screen.getByRole('textbox');
    expect(input).toBeDisabled();
  });

  it('should use default name attribute', () => {
    render(<DestinationInput value="" onChange={vi.fn()} />);
    
    const input = screen.getByRole('textbox');
    expect(input).toHaveAttribute('name', 'destination');
  });

  it('should use custom name attribute', () => {
    render(<DestinationInput value="" onChange={vi.fn()} name="recipientAddress" />);
    
    const input = screen.getByRole('textbox');
    expect(input).toHaveAttribute('name', 'recipientAddress');
  });

  it('should apply custom className', () => {
    render(<DestinationInput value="" onChange={vi.fn()} className="custom-class" />);
    
    const input = screen.getByRole('textbox');
    expect(input).toHaveClass('custom-class');
    // Should still have default classes
    expect(input).toHaveClass('mt-1');
    expect(input).toHaveClass('w-full');
  });

  it('should forward ref correctly', () => {
    const ref = React.createRef<HTMLInputElement>();
    render(<DestinationInput value="" onChange={vi.fn()} ref={ref} />);
    
    expect(ref.current).toBeInstanceOf(HTMLInputElement);
    expect(ref.current?.type).toBe('text');
  });

  it('should have required attribute when required', () => {
    render(<DestinationInput value="" onChange={vi.fn()} required={true} />);
    
    const input = screen.getByRole('textbox');
    expect(input).toHaveAttribute('required');
  });

  it('should not have required attribute when not required', () => {
    render(<DestinationInput value="" onChange={vi.fn()} required={false} />);
    
    const input = screen.getByRole('textbox');
    expect(input).not.toHaveAttribute('required');
  });

  it('should apply correct base styles', () => {
    render(<DestinationInput value="" onChange={vi.fn()} />);
    
    const input = screen.getByRole('textbox');
    expect(input).toHaveClass('mt-1');
    expect(input).toHaveClass('block');
    expect(input).toHaveClass('w-full');
    expect(input).toHaveClass('p-2');
    expect(input).toHaveClass('rounded-md');
    expect(input).toHaveClass('border');
    expect(input).toHaveClass('bg-gray-50');
    expect(input).toHaveClass('focus:ring-blue-500');
    expect(input).toHaveClass('focus:border-blue-500');
  });

  it('should preserve value prop', () => {
    const { rerender } = render(<DestinationInput value="bc1qfirst" onChange={vi.fn()} />);
    
    let input = screen.getByRole('textbox') as HTMLInputElement;
    expect(input.value).toBe('bc1qfirst');
    
    rerender(<DestinationInput value="bc1qsecond" onChange={vi.fn()} />);
    
    input = screen.getByRole('textbox') as HTMLInputElement;
    expect(input.value).toBe('bc1qsecond');
  });

  it('should have displayName for debugging', () => {
    expect(DestinationInput.displayName).toBe('DestinationInput');
  });

  it('should validate different Bitcoin address formats', () => {
    const onValidationChange = vi.fn();
    const onChange = vi.fn();
    
    render(<DestinationInput value="" onChange={onChange} onValidationChange={onValidationChange} />);
    
    const input = screen.getByRole('textbox');
    
    // Test P2WPKH (bc1)
    fireEvent.change(input, { target: { value: 'bc1qtest' } });
    expect(mockIsValidBitcoinAddress).toHaveBeenCalledWith('bc1qtest');
    
    // Test P2PKH (1)
    fireEvent.change(input, { target: { value: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa' } });
    expect(mockIsValidBitcoinAddress).toHaveBeenCalledWith('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa');
    
    // Test P2SH (3)
    fireEvent.change(input, { target: { value: '3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy' } });
    expect(mockIsValidBitcoinAddress).toHaveBeenCalledWith('3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy');
  });

  it('should not call onValidationChange if not provided', () => {
    const onChange = vi.fn();
    
    // Should not throw error
    expect(() => {
      render(<DestinationInput value="" onChange={onChange} />);
      
      const input = screen.getByRole('textbox');
      fireEvent.change(input, { target: { value: 'bc1qtest' } });
    }).not.toThrow();
    
    expect(onChange).toHaveBeenCalledWith('bc1qtest');
  });
});