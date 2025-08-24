import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MPMAForm } from '../form';

// Mock the fetchAssetDetails function
vi.mock('@/utils/blockchain/counterparty', () => ({
  fetchAssetDetails: vi.fn().mockResolvedValue({ divisible: true })
}));

// Mock the contexts
vi.mock('@/contexts/wallet-context', () => ({
  useWallet: () => ({
    activeAddress: 'bc1qtest123'
  })
}));

vi.mock('@/contexts/settings-context', () => ({
  useSettings: () => ({
    settings: { showHelpText: false }
  })
}));

// Mock react-dom's useFormStatus
vi.mock('react-dom', () => ({
  useFormStatus: () => ({ pending: false })
}));

describe('MPMAForm', () => {
  const mockFormAction = vi.fn();
  
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the form with file upload area', () => {
    render(<MPMAForm formAction={mockFormAction} initialFormData={null} />);
    
    expect(screen.getByText('Upload CSV File')).toBeInTheDocument();
    expect(screen.getByText('Upload CSV')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Paste CSV data here...')).toBeInTheDocument();
  });

  it('processes valid CSV data on paste', async () => {
    render(<MPMAForm formAction={mockFormAction} initialFormData={null} />);
    
    const textArea = screen.getByPlaceholderText('Paste CSV data here...');
    const csvData = 'bc1qaddress1,XCP,1.5,Test memo\nbc1qaddress2,BTC,0.001';
    
    fireEvent.paste(textArea, {
      clipboardData: {
        getData: () => csvData
      }
    });
    
    await waitFor(() => {
      expect(screen.getByText(/bc1qaddress1\.\.\./)).toBeInTheDocument();
      expect(screen.getByText(/1.5 XCP/)).toBeInTheDocument();
    });
  });

  it('skips header row when present', async () => {
    render(<MPMAForm formAction={mockFormAction} initialFormData={null} />);
    
    const textArea = screen.getByPlaceholderText('Paste CSV data here...');
    const csvData = 'Address,Asset,Quantity,Memo\nbc1qaddress1,XCP,1.5,Test memo';
    
    fireEvent.paste(textArea, {
      clipboardData: {
        getData: () => csvData
      }
    });
    
    await waitFor(() => {
      expect(screen.getByText(/bc1qaddress1\.\.\./)).toBeInTheDocument();
      expect(screen.queryByText(/Address\.\.\./)).not.toBeInTheDocument();
    });
  });

  it('shows error for invalid Bitcoin address', async () => {
    render(<MPMAForm formAction={mockFormAction} initialFormData={null} />);
    
    const textArea = screen.getByPlaceholderText('Paste CSV data here...');
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
    render(<MPMAForm formAction={mockFormAction} initialFormData={null} />);
    
    const textArea = screen.getByPlaceholderText('Paste CSV data here...');
    const csvData = 'bc1qaddress1,XCP,invalid';
    
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
    render(<MPMAForm formAction={mockFormAction} initialFormData={null} />);
    
    const textArea = screen.getByPlaceholderText('Paste CSV data here...');
    const longMemo = 'This is a very long memo that exceeds the 34 byte limit';
    const csvData = `bc1qaddress1,XCP,1.5,"${longMemo}"`;
    
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
    render(<MPMAForm formAction={mockFormAction} initialFormData={null} />);
    
    const file = new File(['bc1qaddress1,XCP,1.5'], 'test.csv', { type: 'text/csv' });
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
    render(<MPMAForm formAction={mockFormAction} initialFormData={null} />);
    
    const textArea = screen.getByPlaceholderText('Paste CSV data here...');
    const csvData = 'bc1qaddress1,XCP,1.5,Memo1\nbc1qaddress2,BTC,0.001,Memo2';
    
    fireEvent.paste(textArea, {
      clipboardData: {
        getData: () => csvData
      }
    });
    
    await waitFor(() => {
      expect(screen.getByText('Preview (first 5)')).toBeInTheDocument();
      expect(screen.getByText(/bc1qaddress1\.\.\. → 1.5 XCP/)).toBeInTheDocument();
      expect(screen.getByText(/bc1qaddress2\.\.\. → 0.001 BTC/)).toBeInTheDocument();
    });
  });

  it('shows count when more than 5 items', async () => {
    render(<MPMAForm formAction={mockFormAction} initialFormData={null} />);
    
    const textArea = screen.getByPlaceholderText('Paste CSV data here...');
    const rows = Array.from({ length: 7 }, (_, i) => 
      `bc1qaddress${i},XCP,${i + 1}`
    ).join('\n');
    
    fireEvent.paste(textArea, {
      clipboardData: {
        getData: () => rows
      }
    });
    
    await waitFor(() => {
      expect(screen.getByText('... and 2 more')).toBeInTheDocument();
    });
  });

  it('disables submit button when no data', () => {
    render(<MPMAForm formAction={mockFormAction} initialFormData={null} />);
    
    const submitButton = screen.getByRole('button', { name: 'Continue' });
    expect(submitButton).toBeDisabled();
  });

  it('enables submit button when data is valid', async () => {
    render(<MPMAForm formAction={mockFormAction} initialFormData={null} />);
    
    const textArea = screen.getByPlaceholderText('Paste CSV data here...');
    const csvData = 'bc1qaddress1,XCP,1.5';
    
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
    render(<MPMAForm formAction={mockFormAction} initialFormData={null} />);
    
    const textArea = screen.getByPlaceholderText('Paste CSV data here...');
    const csvData = 'bc1qaddress1,XCP,1.5,"Hello, World"';
    
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
    render(<MPMAForm formAction={mockFormAction} initialFormData={null} showHelpText={true} />);
    
    expect(screen.getByText(/Each line should contain/)).toBeInTheDocument();
    expect(screen.getByText(/\(Memo is optional\.\)/)).toBeInTheDocument();
  });
});