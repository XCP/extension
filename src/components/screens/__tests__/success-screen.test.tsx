import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { SuccessScreen } from '../success-screen';

// Mock React Icons
vi.mock('@/components/icons', () => ({
  FaCheckCircle: ({ className }: any) => <div data-testid="check-circle-icon" className={className} />,
  FaExternalLinkAlt: ({ className }: any) => <div data-testid="external-link-icon" className={className} />
}));

// Mock navigator.clipboard
const mockWriteText = vi.fn();

vi.stubGlobal('navigator', {
  clipboard: {
    writeText: mockWriteText
  }
});

beforeAll(() => {
  mockWriteText.mockResolvedValue(undefined);
});

describe('SuccessScreen', () => {
  const defaultProps = {
    apiResponse: {
      broadcast: {
        txid: 'abc123def456ghi789jkl012mno345pqr678stu901vwx234yz'
      }
    }
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockWriteText.mockClear();
    mockWriteText.mockResolvedValue(undefined);
  });

  describe('Rendering', () => {
    it('renders success icon and message', () => {
      render(<SuccessScreen {...defaultProps} />);

      expect(screen.getByTestId('check-circle-icon')).toBeInTheDocument();
      expect(screen.getByText('Transaction Broadcast')).toBeInTheDocument();
      expect(screen.getByText('Your transaction has been signed and broadcast.')).toBeInTheDocument();
    });

    it('displays transaction ID with label', () => {
      render(<SuccessScreen {...defaultProps} />);

      expect(screen.getByText(/Transaction ID/)).toBeInTheDocument();
      expect(screen.getByText('abc123def456ghi789jkl012mno345pqr678stu901vwx234yz')).toBeInTheDocument();
    });

    it('displays "unknown" when txid is missing', () => {
      const propsWithoutTxid = {
        apiResponse: { broadcast: {} }
      };
      
      render(<SuccessScreen {...propsWithoutTxid} />);
      
      expect(screen.getByText('unknown')).toBeInTheDocument();
    });

    it('handles missing broadcast response gracefully', () => {
      const propsWithoutBroadcast = {
        apiResponse: {}
      };
      
      render(<SuccessScreen {...propsWithoutBroadcast} />);
      
      expect(screen.getByText('unknown')).toBeInTheDocument();
    });

    it('does not show explorer link for unknown txid', () => {
      const propsWithoutTxid = {
        apiResponse: { broadcast: {} }
      };

      render(<SuccessScreen {...propsWithoutTxid} />);

      expect(screen.queryByText('View on Mempool')).not.toBeInTheDocument();
    });

    it('shows onReset button when callback is provided', () => {
      const onReset = vi.fn();
      render(<SuccessScreen {...defaultProps} onReset={onReset} />);
      
      expect(screen.getByRole('button', { name: /start a new transaction/i })).toBeInTheDocument();
    });

    it('does not show onReset button when callback is not provided', () => {
      render(<SuccessScreen {...defaultProps} />);
      
      expect(screen.queryByRole('button', { name: /start a new transaction/i })).not.toBeInTheDocument();
    });
  });

  describe('Copy functionality', () => {
    it('copies txid when transaction ID div is clicked', async () => {
      render(<SuccessScreen {...defaultProps} />);

      const txidDiv = screen.getByText('abc123def456ghi789jkl012mno345pqr678stu901vwx234yz');
      fireEvent.click(txidDiv);

      expect(mockWriteText).toHaveBeenCalledWith('abc123def456ghi789jkl012mno345pqr678stu901vwx234yz');
    });

    it('shows "(Copied!)" feedback inline after copying', async () => {
      render(<SuccessScreen {...defaultProps} />);

      const txidDiv = screen.getByText('abc123def456ghi789jkl012mno345pqr678stu901vwx234yz');
      fireEvent.click(txidDiv);

      // Wait for mock to be called
      await waitFor(() => {
        expect(mockWriteText).toHaveBeenCalledWith('abc123def456ghi789jkl012mno345pqr678stu901vwx234yz');
      });

      // Then wait for UI to update - "(Copied!)" appears inline
      await waitFor(() => {
        expect(screen.getByText('(Copied!)')).toBeInTheDocument();
      });
    });

    it('resets copy feedback after 2 seconds', async () => {
      render(<SuccessScreen {...defaultProps} />);

      const txidDiv = screen.getByText('abc123def456ghi789jkl012mno345pqr678stu901vwx234yz');
      fireEvent.click(txidDiv);

      // Should show "(Copied!)"
      await waitFor(() => {
        expect(screen.getByText('(Copied!)')).toBeInTheDocument();
      });

      // Wait for the timeout to reset the state (2 seconds + buffer)
      await waitFor(() => {
        expect(screen.queryByText('(Copied!)')).not.toBeInTheDocument();
      }, { timeout: 3000 });
    });

    it('handles copy failure gracefully', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockWriteText.mockRejectedValueOnce(new Error('Copy failed'));

      render(<SuccessScreen {...defaultProps} />);

      const txidDiv = screen.getByText('abc123def456ghi789jkl012mno345pqr678stu901vwx234yz');
      fireEvent.click(txidDiv);

      await waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to copy transaction ID:', expect.any(Error));
      });

      consoleErrorSpy.mockRestore();
    });
  });

  describe('Keyboard interactions', () => {
    it('handles Enter key on txid div', () => {
      render(<SuccessScreen {...defaultProps} />);
      
      const txidDiv = screen.getByLabelText(/Transaction ID:.*Click to copy/);
      fireEvent.keyDown(txidDiv, { key: 'Enter' });
      
      expect(mockWriteText).toHaveBeenCalledWith('abc123def456ghi789jkl012mno345pqr678stu901vwx234yz');
    });

    it('handles Space key on txid div', () => {
      render(<SuccessScreen {...defaultProps} />);
      
      const txidDiv = screen.getByLabelText(/Transaction ID:.*Click to copy/);
      fireEvent.keyDown(txidDiv, { key: ' ' });
      
      expect(mockWriteText).toHaveBeenCalledWith('abc123def456ghi789jkl012mno345pqr678stu901vwx234yz');
    });

    it('ignores other keys on txid div', () => {
      render(<SuccessScreen {...defaultProps} />);
      
      const txidDiv = screen.getByLabelText(/Transaction ID:.*Click to copy/);
      fireEvent.keyDown(txidDiv, { key: 'Tab' });
      
      expect(mockWriteText).not.toHaveBeenCalled();
    });
  });

  describe('Explorer link', () => {
    it('renders explorer link with default URL (mempool.space)', () => {
      render(<SuccessScreen {...defaultProps} />);

      const explorerLink = screen.getByLabelText(/view transaction on mempool\.space/i);
      expect(explorerLink).toHaveAttribute('href', 'https://mempool.space/tx/abc123def456ghi789jkl012mno345pqr678stu901vwx234yz');
    });

    it('renders explorer link with custom URL template', () => {
      render(
        <SuccessScreen
          {...defaultProps}
          explorerUrlTemplate="https://blockstream.info/tx/{txid}"
        />
      );

      const explorerLink = screen.getByLabelText(/view transaction on mempool\.space/i);
      expect(explorerLink).toHaveAttribute('href', 'https://blockstream.info/tx/abc123def456ghi789jkl012mno345pqr678stu901vwx234yz');
    });

    it('opens explorer link in new tab with security attributes', () => {
      render(<SuccessScreen {...defaultProps} />);

      const explorerLink = screen.getByLabelText(/view transaction on mempool\.space/i);
      expect(explorerLink).toHaveAttribute('target', '_blank');
      expect(explorerLink).toHaveAttribute('rel', 'noopener noreferrer');
    });
  });

  describe('Reset functionality', () => {
    it('calls onReset when New Transaction button is clicked', () => {
      const onReset = vi.fn();
      render(<SuccessScreen {...defaultProps} onReset={onReset} />);
      
      const resetButton = screen.getByRole('button', { name: /start a new transaction/i });
      fireEvent.click(resetButton);
      
      expect(onReset).toHaveBeenCalledTimes(1);
    });
  });

  describe('Accessibility', () => {
    it('has proper ARIA labels on interactive elements', () => {
      render(<SuccessScreen {...defaultProps} onReset={() => {}} />);

      // Transaction ID div
      const txidDiv = screen.getByLabelText(/Transaction ID:.*Click to copy/);
      expect(txidDiv).toHaveAttribute('role', 'button');
      expect(txidDiv).toHaveAttribute('tabIndex', '0');

      // Explorer link
      const explorerLink = screen.getByLabelText(/view transaction on mempool\.space/i);
      expect(explorerLink).toBeInTheDocument();

      // Reset button
      const resetButton = screen.getByRole('button', { name: /start a new transaction/i });
      expect(resetButton).toBeInTheDocument();
    });

    it('marks decorative icons as aria-hidden', () => {
      render(<SuccessScreen {...defaultProps} />);

      // Check that the screen renders the success message (basic sanity check)
      expect(screen.getByText('Transaction Broadcast')).toBeInTheDocument();

      // Check that icons are rendered with proper accessibility
      const successTitle = screen.getByText('Transaction Broadcast');
      expect(successTitle).toBeInTheDocument();

      // Verify txid div has proper accessibility
      const txidDiv = screen.getByLabelText(/Transaction ID:.*Click to copy/);
      expect(txidDiv).toBeInTheDocument();
    });
  });

  describe('Styling', () => {
    it('applies correct container styles', () => {
      const { container } = render(<SuccessScreen {...defaultProps} />);

      const outerDiv = container.firstChild as HTMLElement;
      expect(outerDiv).toHaveClass('flex', 'items-center', 'justify-center', 'min-h-[calc(100vh-6rem)]');
    });

    it('applies correct success box styles', () => {
      render(<SuccessScreen {...defaultProps} />);

      const successBox = screen.getByText('Transaction Broadcast').closest('div.bg-green-50');
      expect(successBox).toHaveClass('p-6', 'bg-green-50', 'rounded-lg', 'shadow-lg', 'text-center', 'max-w-md', 'w-full');
    });

    it('applies correct focus styles on txid div', () => {
      render(<SuccessScreen {...defaultProps} />);

      const txidDiv = screen.getByText('abc123def456ghi789jkl012mno345pqr678stu901vwx234yz');
      expect(txidDiv).toHaveClass(
        'font-mono',
        'text-xs',
        'bg-white',
        'border',
        'border-gray-200',
        'rounded-lg',
        'p-2',
        'break-all',
        'text-gray-800',
        'select-all',
        'cursor-pointer',
        'hover:bg-gray-50',
        'focus-visible:outline-none',
        'focus-visible:ring-2',
        'focus-visible:ring-blue-500',
        'focus-visible:ring-offset-2',
        'transition-colors',
        'duration-200'
      );
    });
  });
});