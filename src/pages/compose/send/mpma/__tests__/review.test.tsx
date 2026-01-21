import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
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

describe('ReviewMPMA', () => {
  const mockOnSign = vi.fn();
  const mockOnBack = vi.fn();

  afterEach(() => {
    cleanup();
  });

  // The component uses asset_dest_quant_list_normalized which contains pre-normalized quantities
  const mockApiResponse = {
    result: {
      params: {
        asset_dest_quant_list_normalized: [
          ['XCP', 'bc1qaddress1', '1.00000000'],
          ['BTC', 'bc1qaddress2', '0.00050000'],
          ['PEPE', 'bc1qaddress3', '1000'],
        ],
        memos: ['Memo 1', 'Memo 2', 'Memo 3']
      }
    }
  };

  it('renders review screen with transactions', () => {
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

  it('displays normalized quantities for divisible assets', () => {
    render(
      <ReviewMPMA
        apiResponse={mockApiResponse}
        onSign={mockOnSign}
        onBack={mockOnBack}
        error={null}
        isSigning={false}
      />
    );

    // XCP is divisible, normalized quantity is already "1.00000000"
    expect(screen.getByText(/1\.00000000 XCP/)).toBeInTheDocument();
    // BTC normalized quantity is already "0.00050000"
    expect(screen.getByText(/0\.00050000 BTC/)).toBeInTheDocument();
  });

  it('displays raw quantities for indivisible assets', () => {
    render(
      <ReviewMPMA
        apiResponse={mockApiResponse}
        onSign={mockOnSign}
        onBack={mockOnBack}
        error={null}
        isSigning={false}
      />
    );

    // PEPE is indivisible, displayed as-is
    expect(screen.getByText(/1000 PEPE/)).toBeInTheDocument();
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

    expect(screen.getByTestId('review-screen')).toBeInTheDocument();
  });

  it('falls back to asset_dest_quant_list when normalized is not available', () => {
    const responseWithoutNormalized = {
      result: {
        params: {
          asset_dest_quant_list: [
            ['PEPE', 'bc1qaddress1', '500'],
            ['XCP', 'bc1qaddress2', '100000000'],
          ],
          memos: ['Test memo']
        }
      }
    };

    render(
      <ReviewMPMA
        apiResponse={responseWithoutNormalized}
        onSign={mockOnSign}
        onBack={mockOnBack}
        error={null}
        isSigning={false}
      />
    );

    // Should display the transactions from asset_dest_quant_list
    expect(screen.getByText(/500 PEPE/)).toBeInTheDocument();
    expect(screen.getByText(/100000000 XCP/)).toBeInTheDocument();
    expect(screen.getByText(/to bc1qaddress1/)).toBeInTheDocument();
    expect(screen.getByText(/to bc1qaddress2/)).toBeInTheDocument();
  });
});