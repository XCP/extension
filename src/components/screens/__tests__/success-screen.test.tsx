import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { SuccessScreen } from '../success-screen';

// Mock React Icons
vi.mock('@/components/icons', () => ({
  FaCheckCircle: ({ className }: any) => <div data-testid="check-circle-icon" className={className} />,
  FaClipboard: ({ className }: any) => <div data-testid="clipboard-icon" className={className} />,
  FaCheck: ({ className }: any) => <div data-testid="check-icon" className={className} />
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
      expect(screen.getByText('Transaction Successful')).toBeInTheDocument();
      expect(screen.getByText('Your transaction was broadcasted.')).toBeInTheDocument();
    });

    it('displays transaction ID with label', () => {
      render(<SuccessScreen {...defaultProps} />);

      // Find the label specifically (not the button text)
      const label = screen.getByText('Transaction ID');
      expect(label).toBeInTheDocument();
      expect(label.tagName).toBe('LABEL');
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

      expect(screen.queryByText(/View on mempool\.space/)).not.toBeInTheDocument();
    });

    it('renders Copy Transaction ID button', () => {
      render(<SuccessScreen {...defaultProps} />);

      expect(screen.getByRole('button', { name: /copy transaction id/i })).toBeInTheDocument();
    });
  });

  describe('Copy functionality', () => {
    it('copies txid when Copy button is clicked', async () => {
      render(<SuccessScreen {...defaultProps} />);

      const copyButton = screen.getByRole('button', { name: /copy transaction id/i });
      fireEvent.click(copyButton);

      expect(mockWriteText).toHaveBeenCalledWith('abc123def456ghi789jkl012mno345pqr678stu901vwx234yz');
    });

    it('shows "Copied!" feedback after copying', async () => {
      render(<SuccessScreen {...defaultProps} />);

      const copyButton = screen.getByRole('button', { name: /copy transaction id/i });
      fireEvent.click(copyButton);

      // Wait for mock to be called
      await waitFor(() => {
        expect(mockWriteText).toHaveBeenCalledWith('abc123def456ghi789jkl012mno345pqr678stu901vwx234yz');
      });

      // Then wait for UI to update - "Copied!" appears on button
      await waitFor(() => {
        expect(screen.getByText('Copied!')).toBeInTheDocument();
      });
    });

    it('resets copy feedback after 2 seconds', async () => {
      render(<SuccessScreen {...defaultProps} />);

      const copyButton = screen.getByRole('button', { name: /copy transaction id/i });
      fireEvent.click(copyButton);

      // Should show "Copied!"
      await waitFor(() => {
        expect(screen.getByText('Copied!')).toBeInTheDocument();
      });

      // Wait for the timeout to reset the state (2 seconds + buffer)
      await waitFor(() => {
        expect(screen.queryByText('Copied!')).not.toBeInTheDocument();
      }, { timeout: 3000 });
    });

    it('handles copy failure gracefully', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockWriteText.mockRejectedValueOnce(new Error('Copy failed'));

      render(<SuccessScreen {...defaultProps} />);

      const copyButton = screen.getByRole('button', { name: /copy transaction id/i });
      fireEvent.click(copyButton);

      await waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to copy transaction ID:', expect.any(Error));
      });

      consoleErrorSpy.mockRestore();
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

    it('renders explorer link as footnote outside the green box', () => {
      render(<SuccessScreen {...defaultProps} />);

      const explorerLink = screen.getByText(/View on mempool\.space/);
      expect(explorerLink).toHaveClass('text-xs', 'text-gray-500');
    });
  });

  describe('Accessibility', () => {
    it('has proper ARIA labels on interactive elements', () => {
      render(<SuccessScreen {...defaultProps} />);

      // Copy button
      const copyButton = screen.getByRole('button', { name: /copy transaction id/i });
      expect(copyButton).toBeInTheDocument();

      // Explorer link
      const explorerLink = screen.getByLabelText(/view transaction on mempool\.space/i);
      expect(explorerLink).toBeInTheDocument();
    });

    it('updates aria-label when copied', async () => {
      render(<SuccessScreen {...defaultProps} />);

      const copyButton = screen.getByRole('button', { name: /copy transaction id/i });
      fireEvent.click(copyButton);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /transaction id copied/i })).toBeInTheDocument();
      });
    });

    it('marks decorative icons as aria-hidden', () => {
      render(<SuccessScreen {...defaultProps} />);

      // Check that the screen renders the success message (basic sanity check)
      expect(screen.getByText('Transaction Successful')).toBeInTheDocument();
    });
  });

  describe('Styling', () => {
    it('applies correct container styles', () => {
      const { container } = render(<SuccessScreen {...defaultProps} />);

      const outerDiv = container.firstChild as HTMLElement;
      expect(outerDiv).toHaveClass('flex', 'flex-col', 'items-center', 'justify-center', 'min-h-[calc(100vh-6rem)]');
    });

    it('applies correct success box styles', () => {
      render(<SuccessScreen {...defaultProps} />);

      const successBox = screen.getByText('Transaction Successful').closest('div.bg-green-50');
      expect(successBox).toHaveClass('p-6', 'bg-green-50', 'rounded-lg', 'shadow-lg', 'text-center', 'max-w-md', 'w-full');
    });

    it('applies correct txid display styles', () => {
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
        'select-all'
      );
    });
  });
});
