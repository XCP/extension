import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { BlockHeightInput } from '../block-height-input';
import React from 'react';

// Mock the useBlockHeight hook
vi.mock('@/hooks/useBlockHeight', () => ({
  useBlockHeight: vi.fn()
}));

// Mock the Button component
vi.mock('@/components/button', () => ({
  Button: ({ children, onClick, disabled, ...props }: any) => (
    <button onClick={onClick} disabled={disabled} {...props}>
      {children}
    </button>
  )
}));

import { useBlockHeight } from '@/hooks/useBlockHeight';

describe('BlockHeightInput', () => {
  const mockUseBlockHeight = useBlockHeight as any;
  const defaultProps = {
    value: '',
    onChange: vi.fn(),
    name: 'blockHeight'
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseBlockHeight.mockReturnValue({
      blockHeight: null,
      isLoading: false,
      error: null,
      refresh: vi.fn()
    });
  });

  it('should render input with label', () => {
    render(<BlockHeightInput {...defaultProps} />);
    
    expect(screen.getByLabelText('Block Height')).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('should use custom label when provided', () => {
    render(<BlockHeightInput {...defaultProps} label="Custom Block" />);
    
    expect(screen.getByLabelText('Custom Block')).toBeInTheDocument();
  });

  it('should render Now button', () => {
    render(<BlockHeightInput {...defaultProps} />);
    
    const nowButton = screen.getByLabelText('Use current block height');
    expect(nowButton).toBeInTheDocument();
    expect(nowButton).toHaveTextContent('Now');
  });

  it('should handle input changes', () => {
    const onChange = vi.fn();
    const setError = vi.fn();
    render(<BlockHeightInput {...defaultProps} onChange={onChange} setError={setError} />);
    
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '850000' } });
    
    expect(onChange).toHaveBeenCalledWith('850000');
    expect(setError).toHaveBeenCalledWith(null);
  });

  it('should show help text when shouldShowHelpText is true', () => {
    render(<BlockHeightInput {...defaultProps} shouldShowHelpText={true} />);
    
    expect(screen.getByText("Enter a block height or click 'Now' to use the current block height.")).toBeInTheDocument();
  });

  it('should show custom description when provided', () => {
    render(<BlockHeightInput {...defaultProps} shouldShowHelpText={true} description="Custom help text" />);
    
    expect(screen.getByText('Custom help text')).toBeInTheDocument();
  });

  it('should disable input and button when disabled', () => {
    render(<BlockHeightInput {...defaultProps} disabled={true} />);
    
    const input = screen.getByRole('textbox');
    const nowButton = screen.getByLabelText('Use current block height');
    
    expect(input).toBeDisabled();
    expect(nowButton).toBeDisabled();
  });

  it('should fetch and set block height when Now button is clicked', async () => {
    const onChange = vi.fn();
    const refresh = vi.fn().mockResolvedValue(850123); // Return the block height value
    
    mockUseBlockHeight.mockReturnValue({
      blockHeight: null, // Initially null
      isLoading: false,
      error: null,
      refresh
    });
    
    render(<BlockHeightInput {...defaultProps} onChange={onChange} />);
    
    const nowButton = screen.getByLabelText('Use current block height');
    fireEvent.click(nowButton);
    
    await waitFor(() => {
      expect(refresh).toHaveBeenCalled();
      expect(onChange).toHaveBeenCalledWith('850123');
    });
  });

  it('should disable Now button while loading', () => {
    mockUseBlockHeight.mockReturnValue({
      blockHeight: null,
      isLoading: true,
      error: null,
      refresh: vi.fn()
    });
    
    render(<BlockHeightInput {...defaultProps} />);
    
    const nowButton = screen.getByLabelText('Use current block height');
    expect(nowButton).toBeDisabled();
  });

  it('should propagate hook errors to parent', () => {
    const setError = vi.fn();
    
    mockUseBlockHeight.mockReturnValue({
      blockHeight: null,
      isLoading: false,
      error: 'Network error',
      refresh: vi.fn()
    });
    
    render(<BlockHeightInput {...defaultProps} setError={setError} />);
    
    expect(setError).toHaveBeenCalledWith('Network error');
  });

  it('should handle refresh errors', async () => {
    const setError = vi.fn();
    const refresh = vi.fn().mockRejectedValue(new Error('API Error'));
    
    mockUseBlockHeight.mockReturnValue({
      blockHeight: null,
      isLoading: false,
      error: null,
      refresh
    });
    
    render(<BlockHeightInput {...defaultProps} setError={setError} />);
    
    const nowButton = screen.getByLabelText('Use current block height');
    fireEvent.click(nowButton);
    
    await waitFor(() => {
      expect(setError).toHaveBeenCalledWith('API Error');
    });
  });

  it('should use custom placeholder', () => {
    render(<BlockHeightInput {...defaultProps} placeholder="Custom placeholder" />);
    
    const input = screen.getByRole('textbox');
    expect(input).toHaveAttribute('placeholder', 'Custom placeholder');
  });

  it('should use default placeholder when not provided', () => {
    render(<BlockHeightInput {...defaultProps} />);
    
    const input = screen.getByRole('textbox');
    expect(input).toHaveAttribute('placeholder', 'Enter block height');
  });

  it('should have correct input attributes', () => {
    render(<BlockHeightInput {...defaultProps} name="testBlockHeight" />);
    
    const input = screen.getByRole('textbox');
    expect(input).toHaveAttribute('name', 'testBlockHeight');
    expect(input).toHaveAttribute('id', 'testBlockHeight');
    expect(input).toHaveAttribute('type', 'text');
    expect(input).toHaveAttribute('autoComplete', 'off');
  });

  it('should apply correct input styles', () => {
    render(<BlockHeightInput {...defaultProps} />);
    
    const input = screen.getByRole('textbox');
    expect(input).toHaveClass('mt-1');
    expect(input).toHaveClass('block');
    expect(input).toHaveClass('w-full');
    expect(input).toHaveClass('p-2');
    expect(input).toHaveClass('rounded-md');
    expect(input).toHaveClass('border');
    expect(input).toHaveClass('bg-gray-50');
    expect(input).toHaveClass('pr-16'); // Space for Now button
  });

  it('should apply disabled styles', () => {
    render(<BlockHeightInput {...defaultProps} disabled={true} />);
    
    const input = screen.getByRole('textbox');
    expect(input).toHaveClass('disabled:bg-gray-100');
    expect(input).toHaveClass('disabled:cursor-not-allowed');
  });

  it('should preserve input value prop', () => {
    const { rerender } = render(<BlockHeightInput {...defaultProps} value="850000" />);
    
    let input = screen.getByRole('textbox') as HTMLInputElement;
    expect(input.value).toBe('850000');
    
    rerender(<BlockHeightInput {...defaultProps} value="860000" />);
    
    input = screen.getByRole('textbox') as HTMLInputElement;
    expect(input.value).toBe('860000');
  });

  it('should not call refresh when disabled', () => {
    const refresh = vi.fn();
    
    mockUseBlockHeight.mockReturnValue({
      blockHeight: null,
      isLoading: false,
      error: null,
      refresh
    });
    
    render(<BlockHeightInput {...defaultProps} disabled={true} />);
    
    const nowButton = screen.getByLabelText('Use current block height');
    fireEvent.click(nowButton);
    
    expect(refresh).not.toHaveBeenCalled();
  });

  it('should not call refresh when loading', () => {
    const refresh = vi.fn();
    
    mockUseBlockHeight.mockReturnValue({
      blockHeight: null,
      isLoading: true,
      error: null,
      refresh
    });
    
    render(<BlockHeightInput {...defaultProps} />);
    
    const nowButton = screen.getByLabelText('Use current block height');
    fireEvent.click(nowButton);
    
    expect(refresh).not.toHaveBeenCalled();
  });

  it('should handle null block height from refresh', async () => {
    const onChange = vi.fn();
    const refresh = vi.fn().mockResolvedValue(null); // Return null explicitly
    
    mockUseBlockHeight.mockReturnValue({
      blockHeight: null,
      isLoading: false,
      error: null,
      refresh
    });
    
    render(<BlockHeightInput {...defaultProps} onChange={onChange} />);
    
    const nowButton = screen.getByLabelText('Use current block height');
    fireEvent.click(nowButton);
    
    await waitFor(() => {
      expect(refresh).toHaveBeenCalled();
    });
    
    // onChange should not be called when blockHeight is null
    expect(onChange).not.toHaveBeenCalled();
  });

  it('should clear error when input changes', () => {
    const setError = vi.fn();
    render(<BlockHeightInput {...defaultProps} setError={setError} />);
    
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '123' } });
    
    expect(setError).toHaveBeenCalledWith(null);
  });

  it('should clear error before fetching', async () => {
    const setError = vi.fn();
    const refresh = vi.fn().mockResolvedValue(850000); // Return the block height value
    
    mockUseBlockHeight.mockReturnValue({
      blockHeight: null,
      isLoading: false,
      error: null,
      refresh
    });
    
    render(<BlockHeightInput {...defaultProps} setError={setError} />);
    
    const nowButton = screen.getByLabelText('Use current block height');
    fireEvent.click(nowButton);
    
    expect(setError).toHaveBeenCalledWith(null);
  });
});