import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { ReviewScreen } from '../review-screen';

describe('ReviewScreen', () => {
  const mockApiResponse = {
    result: {
      params: {
        source: 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq',
        destination: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
      },
      btc_fee: 10000,
    },
  };

  const mockOnSign = vi.fn();
  const mockOnBack = vi.fn();
  const mockCustomFields = [
    { label: 'Amount', value: '100 XCP' },
    { label: 'Memo', value: 'Test payment' },
    { 
      label: 'Multi-line', 
      value: 'Line 1\nLine 2\nLine 3' 
    },
    {
      label: 'With Element',
      value: 'Value',
      rightElement: <span data-testid="right-element">Extra</span>
    },
    {
      label: 'React Node',
      value: <div data-testid="react-node">Custom React Node</div>
    }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders transaction details correctly', () => {
    render(
      <ReviewScreen
        apiResponse={mockApiResponse}
        onSign={mockOnSign}
        onBack={mockOnBack}
        customFields={mockCustomFields}
        error={null}
        isSigning={false}
      />
    );

    // Check title
    expect(screen.getByText('Review Transaction')).toBeInTheDocument();
    
    // Check source address (formatted)
    expect(screen.getByText(/bc1qar0s.*5mdq/)).toBeInTheDocument();
    
    // Check destination address (formatted)
    expect(screen.getByText(/bc1qxy2k.*0wlh/)).toBeInTheDocument();
    
    // Check custom fields
    expect(screen.getByText('Amount:')).toBeInTheDocument();
    expect(screen.getByText('100 XCP')).toBeInTheDocument();
    expect(screen.getByText('Memo:')).toBeInTheDocument();
    expect(screen.getByText('Test payment')).toBeInTheDocument();
    
    // Check fee
    expect(screen.getByText('Fee:')).toBeInTheDocument();
    expect(screen.getByText(/0.00010000.*BTC/)).toBeInTheDocument();
  });

  it('renders multi-line custom field correctly', () => {
    render(
      <ReviewScreen
        apiResponse={mockApiResponse}
        onSign={mockOnSign}
        onBack={mockOnBack}
        customFields={mockCustomFields}
        error={null}
        isSigning={false}
      />
    );

    const multiLineField = screen.getByText('Line 1\nLine 2\nLine 3');
    expect(multiLineField).toBeInTheDocument();
    expect(multiLineField).toHaveClass('whitespace-pre-line');
  });

  it('renders custom field with right element', () => {
    render(
      <ReviewScreen
        apiResponse={mockApiResponse}
        onSign={mockOnSign}
        onBack={mockOnBack}
        customFields={mockCustomFields}
        error={null}
        isSigning={false}
      />
    );

    expect(screen.getByTestId('right-element')).toBeInTheDocument();
    expect(screen.getByText('Extra')).toBeInTheDocument();
  });

  it('renders React node custom field', () => {
    render(
      <ReviewScreen
        apiResponse={mockApiResponse}
        onSign={mockOnSign}
        onBack={mockOnBack}
        customFields={mockCustomFields}
        error={null}
        isSigning={false}
      />
    );

    expect(screen.getByTestId('react-node')).toBeInTheDocument();
    expect(screen.getByText('Custom React Node')).toBeInTheDocument();
  });

  it('does not render destination when not provided', () => {
    const apiResponseWithoutDestination = {
      result: {
        params: {
          source: 'bc1qtest123',
        },
        btc_fee: 10000,
      },
    };

    render(
      <ReviewScreen
        apiResponse={apiResponseWithoutDestination}
        onSign={mockOnSign}
        onBack={mockOnBack}
        customFields={[]}
        error={null}
        isSigning={false}
      />
    );

    expect(screen.queryByText('To:')).not.toBeInTheDocument();
  });

  it('displays error message when error prop is provided', () => {
    const errorMessage = 'Transaction failed: insufficient funds';
    
    render(
      <ReviewScreen
        apiResponse={mockApiResponse}
        onSign={mockOnSign}
        onBack={mockOnBack}
        customFields={mockCustomFields}
        error={errorMessage}
        isSigning={false}
      />
    );

    expect(screen.getByText(/Error:/)).toBeInTheDocument();
    expect(screen.getByText(errorMessage)).toBeInTheDocument();
  });

  it('calls onSign when Sign button is clicked', () => {
    render(
      <ReviewScreen
        apiResponse={mockApiResponse}
        onSign={mockOnSign}
        onBack={mockOnBack}
        customFields={mockCustomFields}
        error={null}
        isSigning={false}
      />
    );

    const signButton = screen.getByRole('button', { name: /sign and broadcast transaction/i });
    fireEvent.click(signButton);
    
    expect(mockOnSign).toHaveBeenCalledTimes(1);
  });

  it('calls onBack when Back button is clicked', () => {
    render(
      <ReviewScreen
        apiResponse={mockApiResponse}
        onSign={mockOnSign}
        onBack={mockOnBack}
        customFields={mockCustomFields}
        error={null}
        isSigning={false}
      />
    );

    const backButton = screen.getByRole('button', { name: /go back to edit transaction/i });
    fireEvent.click(backButton);
    
    expect(mockOnBack).toHaveBeenCalledTimes(1);
  });

  it('disables buttons and shows signing state when isSigning is true', () => {
    render(
      <ReviewScreen
        apiResponse={mockApiResponse}
        onSign={mockOnSign}
        onBack={mockOnBack}
        customFields={mockCustomFields}
        error={null}
        isSigning={true}
      />
    );

    const signButton = screen.getByRole('button', { name: /signing transaction/i });
    const backButton = screen.getByRole('button', { name: /go back/i });
    
    expect(signButton).toBeDisabled();
    expect(signButton).toHaveTextContent('Signing...');
    expect(backButton).toBeDisabled();
  });

  it('renders raw transaction in collapsible details', () => {
    render(
      <ReviewScreen
        apiResponse={mockApiResponse}
        onSign={mockOnSign}
        onBack={mockOnBack}
        customFields={mockCustomFields}
        error={null}
        isSigning={false}
      />
    );

    const summary = screen.getByText('Raw Transaction');
    expect(summary).toBeInTheDocument();
    
    // The pre element should contain the JSON
    const pre = screen.getByText((content, element) => {
      return element?.tagName === 'PRE' && content.includes('"btc_fee": 10000');
    });
    expect(pre).toBeInTheDocument();
  });

  it('has proper accessibility attributes on buttons', () => {
    render(
      <ReviewScreen
        apiResponse={mockApiResponse}
        onSign={mockOnSign}
        onBack={mockOnBack}
        customFields={mockCustomFields}
        error={null}
        isSigning={false}
      />
    );

    const signButton = screen.getByRole('button', { name: /sign and broadcast transaction/i });
    const backButton = screen.getByRole('button', { name: /go back to edit transaction/i });
    
    expect(signButton).toHaveAttribute('aria-label', 'Sign and broadcast transaction');
    expect(backButton).toHaveAttribute('aria-label', 'Go back to edit transaction');
  });

  it('applies correct styling classes', () => {
    const { container } = render(
      <ReviewScreen
        apiResponse={mockApiResponse}
        onSign={mockOnSign}
        onBack={mockOnBack}
        customFields={mockCustomFields}
        error={null}
        isSigning={false}
      />
    );

    // Check main container
    const mainDiv = container.firstChild as HTMLElement;
    expect(mainDiv).toHaveClass('p-4', 'bg-white', 'rounded-lg', 'shadow-lg', 'space-y-4');
    
    // Check title
    const title = screen.getByText('Review Transaction');
    expect(title).toHaveClass('text-lg', 'font-bold', 'text-gray-900');
    
    // Check field labels
    const labels = screen.getAllByText(/From:|To:|Amount:|Memo:|Fee:/);
    labels.forEach(label => {
      expect(label).toHaveClass('font-semibold', 'text-gray-700');
    });
  });

  it('renders custom fields with proper keys', () => {
    const { container } = render(
      <ReviewScreen
        apiResponse={mockApiResponse}
        onSign={mockOnSign}
        onBack={mockOnBack}
        customFields={mockCustomFields}
        error={null}
        isSigning={false}
      />
    );

    // Check that custom field containers have unique keys
    const customFieldDivs = container.querySelectorAll('[class*="space-y-1"]');
    expect(customFieldDivs.length).toBeGreaterThan(0);
  });
});