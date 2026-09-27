import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MemoInput } from './memo-input';

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

  describe('hex rule: only a 0x/0X prefix makes a memo hex', () => {
    const input = () => screen.getByPlaceholderText('Optional memo');

    it('treats an unprefixed hex-looking memo as text, with no hex hint', () => {
      render(<MemoInput value="123456" onChange={vi.fn()} />);
      expect(input()).not.toHaveClass('border-red-500');
      expect(screen.queryByText(/sent as hex/)).not.toBeInTheDocument();
    });

    it('counts 34 bytes of hex behind 0X the same as behind 0x', () => {
      const { unmount } = render(<MemoInput value={'0x' + 'ab'.repeat(34)} onChange={vi.fn()} />);
      expect(input()).not.toHaveClass('border-red-500');
      unmount();
      render(<MemoInput value={'0X' + 'ab'.repeat(34)} onChange={vi.fn()} />);
      expect(input()).not.toHaveClass('border-red-500');
    });

    it('says a 0x memo is sent as hex bytes', () => {
      render(<MemoInput value="0xdeadbeef" onChange={vi.fn()} />);
      expect(screen.getByText(/sent as hex bytes/)).toBeInTheDocument();
    });

    it('flags a 0x memo that is not whole bytes of hex', () => {
      const onValidationChange = vi.fn();
      render(<MemoInput value="0x123" onChange={vi.fn()} onValidationChange={onValidationChange} />);
      expect(input()).toHaveClass('border-red-500');
      expect(onValidationChange).toHaveBeenLastCalledWith(false);
      expect(screen.getByText(/whole bytes of hex/)).toBeInTheDocument();
    });

    it('with hex memos off, counts a 0x value as the text it will be sent as', () => {
      // 36 characters: 18 bytes read as hex, 36 bytes as the text a destroy tag is sent as.
      render(<MemoInput value={'0x' + 'ab'.repeat(17)} onChange={vi.fn()} hexMemos={false} />);
      expect(input()).toHaveClass('border-red-500');
      expect(screen.queryByText(/sent as hex/)).not.toBeInTheDocument();
    });
  });

  it('can be disabled', () => {
    render(<MemoInput value="" onChange={vi.fn()} disabled={true} />);
    const input = screen.getByPlaceholderText('Optional memo');
    
    expect(input).toBeDisabled();
  });
});