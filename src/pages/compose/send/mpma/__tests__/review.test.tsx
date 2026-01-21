import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { ReviewMPMA } from '../review';

// Mock the ReviewScreen component
vi.mock('@/components/screens/review-screen', () => ({
  ReviewScreen: ({ customFields, onSign, onBack, error, isSigning }: any) => (
    <div data-testid="review-screen">
      {customFields.map((field: any, idx: number) => (
        <div key={idx}>
          <span>{field.label}</span>
          {field.value && <span>{field.value}</span>}
          {field.rightElement}
        </div>
      ))}
      <button onClick={onSign}>Sign</button>
      <button onClick={onBack}>Back</button>
      {error && <div>{error}</div>}
      {isSigning && <div>Signing...</div>}
    </div>
  )
}));

// Mock the fetchAssetDetails function
vi.mock('@/utils/blockchain/counterparty/api', () => ({
  fetchAssetDetails: vi.fn((asset: string) => {
    // XCP and BTC are divisible, PEPE is indivisible
    if (asset === 'XCP' || asset === 'BTC') {
      return Promise.resolve({ divisible: true });
    }
    return Promise.resolve({ divisible: false });
  })
}));

// Mock fromSatoshis
vi.mock('@/utils/numeric', () => ({
  fromSatoshis: (value: string) => {
    const num = BigInt(value);
    const divisor = BigInt(100000000);
    const whole = num / divisor;
    const fraction = num % divisor;
    return `${whole}.${fraction.toString().padStart(8, '0')}`;
  }
}));

describe('ReviewMPMA', () => {
  const mockOnSign = vi.fn();
  const mockOnBack = vi.fn();

  afterEach(() => {
    cleanup();
  });

  // The API returns asset_dest_quant_list with raw quantities (satoshis for divisible)
  const mockApiResponse = {
    result: {
      params: {
        asset_dest_quant_list: [
          ['XCP', 'bc1qaddress1', 100000000], // 1 XCP in satoshis
          ['BTC', 'bc1qaddress2', 50000],     // 0.0005 BTC in satoshis
          ['PEPE', 'bc1qaddress3', 1000],     // 1000 PEPE (indivisible)
        ],
        memos: ['Memo 1', 'Memo 2', 'Memo 3']
      }
    }
  };

  it('renders review screen with transactions', async () => {
    render(
      <ReviewMPMA
        apiResponse={mockApiResponse}
        onSign={mockOnSign}
        onBack={mockOnBack}
        error={null}
        isSigning={false}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Send')).toBeInTheDocument();
    });
  });

  it('displays normalized quantities for divisible assets', async () => {
    render(
      <ReviewMPMA
        apiResponse={mockApiResponse}
        onSign={mockOnSign}
        onBack={mockOnBack}
        error={null}
        isSigning={false}
      />
    );

    await waitFor(() => {
      // XCP: 100000000 satoshis = 1.00000000 XCP
      expect(screen.getByText(/1\.00000000 XCP/)).toBeInTheDocument();
      // BTC: 50000 satoshis = 0.00050000 BTC
      expect(screen.getByText(/0\.00050000 BTC/)).toBeInTheDocument();
    });
  });

  it('displays raw quantities for indivisible assets', async () => {
    render(
      <ReviewMPMA
        apiResponse={mockApiResponse}
        onSign={mockOnSign}
        onBack={mockOnBack}
        error={null}
        isSigning={false}
      />
    );

    await waitFor(() => {
      // PEPE is indivisible, displayed as-is
      expect(screen.getByText(/1000 PEPE/)).toBeInTheDocument();
    });
  });

  it('displays destination addresses', async () => {
    render(
      <ReviewMPMA
        apiResponse={mockApiResponse}
        onSign={mockOnSign}
        onBack={mockOnBack}
        error={null}
        isSigning={false}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/to bc1qaddress1/)).toBeInTheDocument();
      expect(screen.getByText(/to bc1qaddress2/)).toBeInTheDocument();
      expect(screen.getByText(/to bc1qaddress3/)).toBeInTheDocument();
    });
  });

  it('displays memos when present', async () => {
    render(
      <ReviewMPMA
        apiResponse={mockApiResponse}
        onSign={mockOnSign}
        onBack={mockOnBack}
        error={null}
        isSigning={false}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Memo: Memo 1/)).toBeInTheDocument();
      expect(screen.getByText(/Memo: Memo 2/)).toBeInTheDocument();
      expect(screen.getByText(/Memo: Memo 3/)).toBeInTheDocument();
    });
  });

  it('handles missing memos', async () => {
    const responseWithoutMemos = {
      result: {
        params: {
          asset_dest_quant_list: [
            ['XCP', 'bc1qaddress1', 100000000],
          ]
        }
      }
    };

    render(
      <ReviewMPMA
        apiResponse={responseWithoutMemos}
        onSign={mockOnSign}
        onBack={mockOnBack}
        error={null}
        isSigning={false}
      />
    );

    await waitFor(() => {
      expect(screen.queryByText(/Memo:/)).not.toBeInTheDocument();
    });
  });

  it('displays send numbers', async () => {
    render(
      <ReviewMPMA
        apiResponse={mockApiResponse}
        onSign={mockOnSign}
        onBack={mockOnBack}
        error={null}
        isSigning={false}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Send #1:/)).toBeInTheDocument();
      expect(screen.getByText(/Send #2:/)).toBeInTheDocument();
      expect(screen.getByText(/Send #3:/)).toBeInTheDocument();
    });
  });

  it('passes error to review screen', async () => {
    const error = 'Transaction failed';

    render(
      <ReviewMPMA
        apiResponse={mockApiResponse}
        onSign={mockOnSign}
        onBack={mockOnBack}
        error={error}
        isSigning={false}
      />
    );

    expect(screen.getByText(error)).toBeInTheDocument();
  });

  it('shows signing state', async () => {
    render(
      <ReviewMPMA
        apiResponse={mockApiResponse}
        onSign={mockOnSign}
        onBack={mockOnBack}
        error={null}
        isSigning={true}
      />
    );

    expect(screen.getByText('Signing...')).toBeInTheDocument();
  });

  it('handles empty asset list', async () => {
    const emptyResponse = {
      result: {
        params: {
          asset_dest_quant_list: []
        }
      }
    };

    render(
      <ReviewMPMA
        apiResponse={emptyResponse}
        onSign={mockOnSign}
        onBack={mockOnBack}
        error={null}
        isSigning={false}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('No sends')).toBeInTheDocument();
    });
  });

  it('shows loading state initially', () => {
    render(
      <ReviewMPMA
        apiResponse={mockApiResponse}
        onSign={mockOnSign}
        onBack={mockOnBack}
        error={null}
        isSigning={false}
      />
    );

    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });
});
