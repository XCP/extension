import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { ReviewMPMA } from '../review';
import { fetchAssetDetails } from '@/utils/blockchain/counterparty/api';

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

// The review must NOT independently re-fetch divisibility; it renders the
// server-normalized quantities echoed in the (signed) compose response.
vi.mock('@/utils/blockchain/counterparty/api', () => ({
  fetchAssetDetails: vi.fn(() => Promise.resolve({ divisible: true })),
}));

describe('ReviewMPMA', () => {
  const mockOnSign = vi.fn();
  const mockOnBack = vi.fn();

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  // The verbose API echoes asset_dest_quant_list_normalized: the same normalized
  // amounts encoded into the signed transaction.
  const mockApiResponse = {
    result: {
      params: {
        asset_dest_quant_list: [
          ['XCP', 'bc1qaddress1', 100000000],
          ['BTC', 'bc1qaddress2', 50000],
          ['PEPE', 'bc1qaddress3', 1000],
        ],
        asset_dest_quant_list_normalized: [
          ['XCP', 'bc1qaddress1', '1.00000000'],
          ['BTC', 'bc1qaddress2', '0.00050000'],
          ['PEPE', 'bc1qaddress3', '1000'],
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

    expect(screen.getByText('Send')).toBeInTheDocument();
  });

  it('renders the server-normalized quantities (matching the signed amounts)', () => {
    render(
      <ReviewMPMA
        apiResponse={mockApiResponse}
        onSign={mockOnSign}
        onBack={mockOnBack}
        error={null}
        isSigning={false}
      />
    );

    expect(screen.getByText(/1\.00000000 XCP/)).toBeInTheDocument();
    expect(screen.getByText(/0\.00050000 BTC/)).toBeInTheDocument();
    expect(screen.getByText(/1000 PEPE/)).toBeInTheDocument();
  });

  it('does not independently re-fetch divisibility (WYSIWYS guard)', async () => {
    // Guards the "what you see is what you sign" invariant: the displayed amount
    // must come from the signed compose echo, never a separate client lookup
    // that could disagree with what was signed.
    render(
      <ReviewMPMA
        apiResponse={mockApiResponse}
        onSign={mockOnSign}
        onBack={mockOnBack}
        error={null}
        isSigning={false}
      />
    );

    // Give any (unwanted) async fetch a chance to fire.
    await waitFor(() => expect(screen.getByText(/1\.00000000 XCP/)).toBeInTheDocument());
    expect(fetchAssetDetails).not.toHaveBeenCalled();
  });

  it('displays destination addresses', () => {
    render(
      <ReviewMPMA
        apiResponse={mockApiResponse}
        onSign={mockOnSign}
        onBack={mockOnBack}
        error={null}
        isSigning={false}
      />
    );

    expect(screen.getByText(/to bc1qaddress1/)).toBeInTheDocument();
    expect(screen.getByText(/to bc1qaddress2/)).toBeInTheDocument();
    expect(screen.getByText(/to bc1qaddress3/)).toBeInTheDocument();
  });

  it('displays memos when present', () => {
    render(
      <ReviewMPMA
        apiResponse={mockApiResponse}
        onSign={mockOnSign}
        onBack={mockOnBack}
        error={null}
        isSigning={false}
      />
    );

    expect(screen.getByText(/Memo: Memo 1/)).toBeInTheDocument();
    expect(screen.getByText(/Memo: Memo 2/)).toBeInTheDocument();
    expect(screen.getByText(/Memo: Memo 3/)).toBeInTheDocument();
  });

  it('handles missing memos', () => {
    const responseWithoutMemos = {
      result: {
        params: {
          asset_dest_quant_list_normalized: [
            ['XCP', 'bc1qaddress1', '1.00000000'],
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

    expect(screen.queryByText(/Memo:/)).not.toBeInTheDocument();
  });

  it('displays send numbers', () => {
    render(
      <ReviewMPMA
        apiResponse={mockApiResponse}
        onSign={mockOnSign}
        onBack={mockOnBack}
        error={null}
        isSigning={false}
      />
    );

    expect(screen.getByText(/Send #1:/)).toBeInTheDocument();
    expect(screen.getByText(/Send #2:/)).toBeInTheDocument();
    expect(screen.getByText(/Send #3:/)).toBeInTheDocument();
  });

  it('passes error to review screen', () => {
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

  it('shows signing state', () => {
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

  it('handles empty asset list', () => {
    const emptyResponse = {
      result: {
        params: {
          asset_dest_quant_list_normalized: []
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

    expect(screen.getByText('No sends')).toBeInTheDocument();
  });
});
