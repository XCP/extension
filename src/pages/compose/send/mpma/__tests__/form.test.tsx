import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MPMAForm } from '../form';
import { ComposerProvider } from '@/contexts/composer-context';

// Mock the counterparty API functions
vi.mock('@/utils/blockchain/counterparty/api', () => ({
  fetchAssetDetails: vi.fn().mockResolvedValue({ divisible: true }),
}));

// Mock the counterparty memo functions
vi.mock('@/utils/blockchain/counterparty/memo', () => ({
  isHexMemo: vi.fn((memo: string) => {
    if (!memo) return false;
    const cleanMemo = memo.startsWith('0x') ? memo.slice(2) : memo;
    return cleanMemo.length % 2 === 0 && /^[0-9a-fA-F]+$/.test(cleanMemo);
  }),
  stripHexPrefix: vi.fn((hex: string) => {
    return hex.startsWith('0x') ? hex.slice(2) : hex;
  }),
  isValidMemoLength: vi.fn((memo: string, isHex: boolean) => {
    const byteLength = isHex ? Math.ceil(memo.length / 2) : new TextEncoder().encode(memo).length;
    return byteLength <= 34;
  })
}));

// Mock fee rates to prevent network calls
vi.mock('@/utils/blockchain/bitcoin/feeRate', () => ({
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
      expect(screen.getByText(/Invalid quantity/)).toBeInTheDocument();
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
    // Generate valid addresses - these are example valid bech32 addresses
    const validAddresses = [
      'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq',
      'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4',
      'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
      'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu',
      'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4',
      'bc1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3qccfmv3',
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