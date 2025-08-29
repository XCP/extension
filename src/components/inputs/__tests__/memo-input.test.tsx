import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoInput } from '../memo-input';

describe('MemoInput', () => {
  it('renders input field', () => {
    render(<MemoInput value="" onChange={vi.fn()} />);
    const input = screen.getByPlaceholderText('Optional memo');
    expect(input).toBeInTheDocument();
  });

  it('calls onChange when typing', () => {
    const onChange = vi.fn();
    render(<MemoInput value="" onChange={onChange} />);
    const input = screen.getByPlaceholderText('Optional memo');
    
    fireEvent.change(input, { target: { value: 'test memo' } });
    expect(onChange).toHaveBeenCalledWith('test memo');
  });

  it('shows error styling for memo exceeding 34 bytes', () => {
    const longMemo = 'This is a very long memo that exceeds 34 bytes limit';
    render(<MemoInput value={longMemo} onChange={vi.fn()} />);
    
    const input = screen.getByPlaceholderText('Optional memo');
    expect(input).toHaveClass('border-red-500');
  });

  it('does not show error styling for valid memo', () => {
    const validMemo = 'Short memo';
    render(<MemoInput value={validMemo} onChange={vi.fn()} />);
    
    const input = screen.getByPlaceholderText('Optional memo');
    expect(input).not.toHaveClass('border-red-500');
    expect(input).toHaveClass('border-gray-300');
  });

  it('shows help text when showHelpText is true', () => {
    render(<MemoInput value="" onChange={vi.fn()} showHelpText={true} />);
    
    expect(screen.getByText(/Optional memo to include/)).toBeInTheDocument();
  });

  it('does not show help text when showHelpText is false', () => {
    render(<MemoInput value="" onChange={vi.fn()} showHelpText={false} />);
    
    expect(screen.queryByText(/Optional memo to include/)).not.toBeInTheDocument();
  });

  it('correctly calculates byte length for unicode characters', () => {
    // Emoji takes 4 bytes in UTF-8
    const emojiMemo = '😀😀😀😀😀😀😀😀😀'; // 36 bytes (9 * 4)
    render(<MemoInput value={emojiMemo} onChange={vi.fn()} />);
    
    const input = screen.getByPlaceholderText('Optional memo');
    expect(input).toHaveClass('border-red-500');
  });

  it('accepts exactly 34 bytes', () => {
    // Create a string that's exactly 34 bytes
    const exactMemo = 'a'.repeat(34);
    render(<MemoInput value={exactMemo} onChange={vi.fn()} />);
    
    const input = screen.getByPlaceholderText('Optional memo');
    expect(input).not.toHaveClass('border-red-500');
    expect(input).toHaveClass('border-gray-300');
  });

  it('can be disabled', () => {
    render(<MemoInput value="" onChange={vi.fn()} disabled={true} />);
    const input = screen.getByPlaceholderText('Optional memo');
    
    expect(input).toBeDisabled();
  });
});