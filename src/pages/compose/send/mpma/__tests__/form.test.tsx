import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ComposerProvider } from '@/contexts/composer-context';
import { verifiedReviewParams } from '@/core/counterparty/normalize';
import { packComposeMessage } from '@/core/counterparty/pack/messages';
import { unpackMPMA } from '@/core/counterparty/unpack/messages/mpma';
import { MPMAForm } from '../form';

// Mock the counterparty API functions
vi.mock('@/core/counterparty/api', () => ({
  fetchAssetDetails: vi.fn().mockResolvedValue({ divisible: true }),
}));

// Mock fee rates to prevent network calls
vi.mock('@/core/bitcoin/feeRate', () => ({
  getFeeRates: vi.fn().mockResolvedValue({
    fastestFee: 10,
    halfHourFee: 5,
    hourFee: 3,
    economyFee: 1,
    minimumFee: 1
  })
}));

// Mock the wallet context
vi.mock('@/contexts/wallet-context', () => ({
  useWallet: () => ({
    activeAddress: { address: 'bc1qtest123' },
    activeWallet: { id: 'test-wallet', name: 'Test Wallet' },
    authState: 'unlocked',
    signTransaction: vi.fn(),
    broadcastTransaction: vi.fn(),
    unlockWallet: vi.fn(),
    isKeychainLocked: vi.fn().mockResolvedValue(false)
  })
}));

// Mock settings context
vi.mock('@/contexts/settings-context', () => ({
  useSettings: () => ({
    settings: { showHelpText: true },
    updateSettings: vi.fn(),
    isLoading: false
  })
}))

// Mock react-dom's useFormStatus
vi.mock('react-dom', () => ({
  useFormStatus: () => ({ pending: false })
}));

vi.mock('@/contexts/loading-context', () => ({
  useLoading: () => ({
    showLoading: vi.fn(() => 'loading-id'),
    hideLoading: vi.fn(),
    loading: false,
    setLoading: vi.fn()
  })
}));

// Mock header context
vi.mock('@/contexts/header-context', () => ({
  useHeader: () => ({
    headerProps: { title: "", useLogoTitle: false },
    setHeaderProps: vi.fn(),
    subheadings: { addresses: {}, assets: {}, balances: {} },
    setAddressHeader: vi.fn(),
    setAssetHeader: vi.fn(),
    setBalanceHeader: vi.fn(),
    clearBalances: vi.fn(),
    clearAllCaches: vi.fn()
  })
}));

describe('MPMAForm', () => {
  const mockFormAction = vi.fn();
  
  // Helper function to render with provider
  const renderWithProvider = (initialFormData: any = null) => {
    const mockComposeApi = vi.fn().mockResolvedValue({ result: { tx_hash: 'test' } });
    
    return render(
      <MemoryRouter>
        <ComposerProvider composeApi={mockComposeApi} initialTitle="MPMA Send" composeType="mpma">
          <MPMAForm formAction={mockFormAction} initialFormData={initialFormData} />
        </ComposerProvider>
      </MemoryRouter>
    );
  };
  
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders the form with file upload area', () => {
    renderWithProvider();
    
    expect(screen.getByText('Upload CSV File')).toBeInTheDocument();
    expect(screen.getByText('Upload CSV')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Paste CSV data here…')).toBeInTheDocument();
  });

  it('processes valid CSV data on paste', async () => {
    renderWithProvider();
    
    const textArea = screen.getByPlaceholderText('Paste CSV data here…');
    // Use valid Bitcoin addresses
    const csvData = 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq,XCP,1.5,Test memo\nbc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4,BTC,0.001';
    
    fireEvent.paste(textArea, {
      clipboardData: {
        getData: () => csvData
      }
    });
    
    await waitFor(() => {
      // Address shows first 10 chars
      expect(screen.getByText(/bc1qar0srr… → 1.5 XCP/)).toBeInTheDocument();
    }, { timeout: 5000 });
  });

  it('skips header row when present', async () => {
    renderWithProvider();

    const textArea = screen.getByPlaceholderText('Paste CSV data here…');
    const csvData = 'Address,Asset,Quantity,Memo\nbc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq,XCP,1.5,Test memo';

    fireEvent.paste(textArea, {
      clipboardData: {
        getData: () => csvData
      }
    });

    await waitFor(() => {
      expect(screen.getByText(/bc1qar0srr… → 1.5 XCP/)).toBeInTheDocument();
      expect(screen.queryByText(/Address…/)).not.toBeInTheDocument();
    }, { timeout: 5000 });
  });

  it('shows error for invalid Bitcoin address', async () => {
    renderWithProvider();
    
    const textArea = screen.getByPlaceholderText('Paste CSV data here…');
    const csvData = 'invalidaddress,XCP,1.5';
    
    fireEvent.paste(textArea, {
      clipboardData: {
        getData: () => csvData
      }
    });
    
    await waitFor(() => {
      expect(screen.getByText(/Invalid Bitcoin address/)).toBeInTheDocument();
    });
  });

  it('shows error for invalid quantity', async () => {
    renderWithProvider();
    
    const textArea = screen.getByPlaceholderText('Paste CSV data here…');
    const csvData = 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq,XCP,invalid';
    
    fireEvent.paste(textArea, {
      clipboardData: {
        getData: () => csvData
      }
    });
    
    await waitFor(() => {
      // parseCSV reports why rather than just that it is invalid
      expect(screen.getByText(/Quantity must be a number/)).toBeInTheDocument();
    });
  });

  // Destinations an MPMA cannot reach, caught at import rather than at compose. Core refuses any
  // address whose packed form exceeds 22 bytes and names ONE of them, after composing -- so a
  // file with thirty Taproot recipients took thirty round trips to clean up.
  it('rejects a Taproot destination and says why', async () => {
    renderWithProvider();

    const textArea = screen.getByPlaceholderText('Paste CSV data here…');
    const csvData = [
      'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq,XCP,1',
      'bc1p3vl9hmdetkyde2qj2e2n9rw8zqrygsyclprfc3xnyku6sjczpsxqv068cg,XCP,2',
    ].join('\n');

    fireEvent.paste(textArea, { clipboardData: { getData: () => csvData } });

    await waitFor(() => {
      expect(screen.getByText(/cannot receive an MPMA send/)).toBeInTheDocument();
    });
  });

  it('names the offending line, not just the count', async () => {
    // The whole reason for checking here: the user has to know WHICH row to remove.
    renderWithProvider();

    const textArea = screen.getByPlaceholderText('Paste CSV data here…');
    const csvData = [
      'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq,XCP,1',
      'bc1qz8y760738dcuv6g3jf6sa5tdcmzddneh2u220w,XCP,2',
      'bc1p3vl9hmdetkyde2qj2e2n9rw8zqrygsyclprfc3xnyku6sjczpsxqv068cg,XCP,3',
    ].join('\n');

    fireEvent.paste(textArea, { clipboardData: { getData: () => csvData } });

    await waitFor(() => {
      expect(screen.getByText(/Line 3/)).toBeInTheDocument();
    });
  });

  // These are what routing the parse through parseCSV buys: the hand-rolled loop it replaced
  // accepted both without comment.
  it('rejects a row carrying a spreadsheet formula', async () => {
    renderWithProvider();

    const textArea = screen.getByPlaceholderText('Paste CSV data here…');
    fireEvent.paste(textArea, {
      clipboardData: {
        getData: () => 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq,=cmd|calc,1'
      }
    });

    await waitFor(() => {
      expect(screen.getByText(/injection/i)).toBeInTheDocument();
    });
  });

  it('parses a quoted memo containing a comma as one field', async () => {
    renderWithProvider();

    const textArea = screen.getByPlaceholderText('Paste CSV data here…');
    fireEvent.paste(textArea, {
      clipboardData: {
        getData: () => 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq,XCP,1,"a,b"'
      }
    });

    // A memo split on the comma would have produced a fourth column and a different memo;
    // reaching the review table at all means the quoted field survived intact.
    await waitFor(() => {
      expect(screen.queryByText(/Invalid|error/i)).not.toBeInTheDocument();
    });
  });

  it('shows error for memo exceeding 34 bytes', async () => {
    renderWithProvider();
    
    const textArea = screen.getByPlaceholderText('Paste CSV data here…');
    const longMemo = 'This is a very long memo that exceeds the 34 byte limit';
    const csvData = `bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq,XCP,1.5,"${longMemo}"`;
    
    fireEvent.paste(textArea, {
      clipboardData: {
        getData: () => csvData
      }
    });
    
    await waitFor(() => {
      expect(screen.getByText(/Memo exceeds 34 bytes/)).toBeInTheDocument();
    });
  });

  describe('memo encoding', () => {
    const submitted = async (memo: string): Promise<FormData> => {
      renderWithProvider();
      fireEvent.paste(screen.getByPlaceholderText('Paste CSV data here…'), {
        clipboardData: { getData: () => `bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq,XCP,1,${memo}` }
      });
      const submit = await screen.findByRole('button', { name: 'Continue' });
      await waitFor(() => expect(submit).not.toBeDisabled());
      fireEvent.submit(submit.closest('form')!);
      await waitFor(() => expect(mockFormAction).toHaveBeenCalled());
      return mockFormAction.mock.calls[0]![0] as FormData;
    };

    // An exchange deposit ID is text. Read as hex it reached the chain as the bytes 12 34 56.
    it('sends an unprefixed hex-looking memo as text', async () => {
      const formData = await submitted('123456');
      expect(formData.get('memos')).toBe('["123456"]');
      expect(formData.get('memos_are_hex')).toBe('false');
    });

    it('sends a 0X-prefixed memo as hex without the prefix', async () => {
      const formData = await submitted('0XDEADBEEF');
      expect(formData.get('memos')).toBe('["DEADBEEF"]');
      expect(formData.get('memos_are_hex')).toBe('true');
    });

    // A quoted CSV memo can hold a comma. Joined and split on commas, two memos became three, and
    // the request no longer had one memo per send: the message check could not rebuild it and the
    // review listed the wrong memo against each recipient.
    it('keeps a memo containing a comma as one memo through compose and review', async () => {
      renderWithProvider();
      fireEvent.paste(screen.getByPlaceholderText('Paste CSV data here…'), {
        clipboardData: { getData: () => [
          'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq,XCP,1,"Invoice 12, part 2"',
          'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4,XCP,2,thanks',
        ].join('\n') }
      });
      const submit = await screen.findByRole('button', { name: 'Continue' });
      await waitFor(() => expect(submit).not.toBeDisabled());
      fireEvent.submit(submit.closest('form')!);
      await waitFor(() => expect(mockFormAction).toHaveBeenCalled());
      const data = Object.fromEntries(mockFormAction.mock.calls[0]![0] as FormData);

      expect(verifiedReviewParams('mpma', data).memos).toEqual(['Invoice 12, part 2', 'thanks']);
      const packed = packComposeMessage('mpma', data);
      expect(packed).not.toBeNull();
      // The payload follows the 8-byte CNTRPRTY prefix and the one-byte message type.
      expect(unpackMPMA(packed!.bytes.slice(9)).sends.map(send => send.memo)).toEqual(['Invoice 12, part 2', 'thanks']);
    });

    it('names the line of a 0x memo that is not whole bytes of hex', async () => {
      renderWithProvider();
      fireEvent.paste(screen.getByPlaceholderText('Paste CSV data here…'), {
        clipboardData: { getData: () => 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq,XCP,1,0x123' }
      });
      expect(await screen.findByText(/Line 1: .*0x.*hex/)).toBeInTheDocument();
    });
  });

  it('handles file upload', async () => {
    renderWithProvider();
    
    const file = new File(['bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq,XCP,1.5'], 'test.csv', { type: 'text/csv' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    
    Object.defineProperty(input, 'files', {
      value: [file],
      writable: false,
    });
    
    fireEvent.change(input);
    
    await waitFor(() => {
      expect(screen.getByText('test.csv')).toBeInTheDocument();
    });
  });

  // The name is only displayed, never used as a path, so a double dot in it is harmless.
  it('accepts a file whose name contains two dots in a row', async () => {
    renderWithProvider();

    const file = new File(['bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq,XCP,1.5'], 'payouts..csv', { type: 'text/csv' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: [file], writable: false });
    fireEvent.change(input);

    expect(await screen.findByText('payouts..csv')).toBeInTheDocument();
    expect(screen.queryByText(/traversal/i)).not.toBeInTheDocument();
  });

  it('shows preview of parsed data', async () => {
    renderWithProvider();
    
    const textArea = screen.getByPlaceholderText('Paste CSV data here…');
    const csvData = 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq,XCP,1.5,Memo1\nbc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4,BTC,0.001,Memo2';
    
    fireEvent.paste(textArea, {
      clipboardData: {
        getData: () => csvData
      }
    });
    
    await waitFor(() => {
      expect(screen.getByText('Preview (First 5)')).toBeInTheDocument();
      expect(screen.getByText(/bc1qar0srr… → 1.5 XCP/)).toBeInTheDocument();
      expect(screen.getByText(/bc1qw508d6… → 0.001 BTC/)).toBeInTheDocument();
    });
  });

  it('shows count when more than 5 items', async () => {
    renderWithProvider();
    
    const textArea = screen.getByPlaceholderText('Paste CSV data here…');
    // All P2WPKH. This list used to include bc1qrp33g0q...fmv3, the BIP173 P2WSH vector -- a
    // perfectly valid bech32 address that an MPMA send cannot reach, because its 32-byte witness
    // program packs past the 22-byte ceiling. Import now rejects it, which is the point.
    const validAddresses = [
      'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq',
      'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4',
      'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
      'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu',
      'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4',
      'bc1qz8y760738dcuv6g3jf6sa5tdcmzddneh2u220w',
      'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq'
    ];
    const rows = validAddresses.map((addr, i) => 
      `${addr},XCP,${i + 1}`
    ).join('\n');
    
    fireEvent.paste(textArea, {
      clipboardData: {
        getData: () => rows
      }
    });
    
    await waitFor(() => {
      expect(screen.getByText('… and 2 more')).toBeInTheDocument();
    });
  });

  it('disables submit button when no data', () => {
    renderWithProvider();
    
    const submitButton = screen.getByRole('button', { name: 'Continue' });
    expect(submitButton).toBeDisabled();
  });

  it('enables submit button when data is valid', async () => {
    renderWithProvider();
    
    const textArea = screen.getByPlaceholderText('Paste CSV data here…');
    const csvData = 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq,XCP,1.5';
    
    fireEvent.paste(textArea, {
      clipboardData: {
        getData: () => csvData
      }
    });
    
    await waitFor(() => {
      const submitButton = screen.getByRole('button', { name: 'Continue' });
      expect(submitButton).not.toBeDisabled();
    });
  });

  it('handles quoted values with commas', async () => {
    renderWithProvider();
    
    const textArea = screen.getByPlaceholderText('Paste CSV data here…');
    const csvData = 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq,XCP,1.5,"Hello, World"';
    
    fireEvent.paste(textArea, {
      clipboardData: {
        getData: () => csvData
      }
    });
    
    await waitFor(() => {
      expect(screen.getByText(/Hello, World/)).toBeInTheDocument();
    });
  });

  it('shows help text when enabled', () => {
    renderWithProvider();
    
    expect(screen.getByText(/Each line should contain/)).toBeInTheDocument();
    expect(screen.getByText(/\(Memo is optional\.\)/)).toBeInTheDocument();
  });
});