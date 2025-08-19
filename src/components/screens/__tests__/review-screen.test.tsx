import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { ReviewScreen } from '../review-screen';
import { vi, describe, it, expect, beforeEach } from 'vitest';

describe('ReviewScreen', () => {
  const mockApiResponse = {
    result: {
      params: {
        source: 'bc1qtest123',
        destination: 'bc1qtest456',
      },
      btc_fee: 10000,
    },
  };

  const mockOnSign = vi.fn();
  const mockOnBack = vi.fn();
  const mockCustomFields = [
    { label: 'Amount', value: '100 XCP' },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should display error when error prop is provided', async () => {
    const errorMessage = 'UTXO not found for input';
    
    const { rerender } = render(
      <ReviewScreen
        apiResponse={mockApiResponse}
        onSign={mockOnSign}
        onBack={mockOnBack}
        customFields={mockCustomFields}
        error={null}
        isSigning={false}
      />
    );

    // Initially no error
    expect(screen.queryByText(/Error:/)).not.toBeInTheDocument();

    // Rerender with error
    rerender(
      <ReviewScreen
        apiResponse={mockApiResponse}
        onSign={mockOnSign}
        onBack={mockOnBack}
        customFields={mockCustomFields}
        error={errorMessage}
        isSigning={false}
      />
    );

    // Error should now be visible
    await waitFor(() => {
      expect(screen.getByText(/Error:/)).toBeInTheDocument();
      expect(screen.getByText(errorMessage)).toBeInTheDocument();
    });
  });

  it('should clear error when close button is clicked', async () => {
    const errorMessage = 'UTXO not found for input';
    
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

    // Error should be visible
    expect(screen.getByText(/Error:/)).toBeInTheDocument();
    expect(screen.getByText(errorMessage)).toBeInTheDocument();

    // Click close button
    const closeButton = screen.getByLabelText('Dismiss error message');
    fireEvent.click(closeButton);

    // Error should be hidden
    await waitFor(() => {
      expect(screen.queryByText(/Error:/)).not.toBeInTheDocument();
      expect(screen.queryByText(errorMessage)).not.toBeInTheDocument();
    });
  });

  it('should clear error when Sign button is clicked', async () => {
    const errorMessage = 'UTXO not found for input';
    
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

    // Error should be visible
    expect(screen.getByText(/Error:/)).toBeInTheDocument();

    // Click Sign button
    const signButton = screen.getByRole('button', { name: /Sign & Broadcast/i });
    fireEvent.click(signButton);

    // Error should be cleared
    await waitFor(() => {
      expect(screen.queryByText(/Error:/)).not.toBeInTheDocument();
    });

    // onSign should have been called
    expect(mockOnSign).toHaveBeenCalledTimes(1);
  });

  it('should update error when prop changes', async () => {
    const firstError = 'First error message';
    const secondError = 'Second error message';
    
    const { rerender } = render(
      <ReviewScreen
        apiResponse={mockApiResponse}
        onSign={mockOnSign}
        onBack={mockOnBack}
        customFields={mockCustomFields}
        error={firstError}
        isSigning={false}
      />
    );

    // First error should be visible
    expect(screen.getByText(firstError)).toBeInTheDocument();

    // Update with new error
    rerender(
      <ReviewScreen
        apiResponse={mockApiResponse}
        onSign={mockOnSign}
        onBack={mockOnBack}
        customFields={mockCustomFields}
        error={secondError}
        isSigning={false}
      />
    );

    // Second error should now be visible
    await waitFor(() => {
      expect(screen.queryByText(firstError)).not.toBeInTheDocument();
      expect(screen.getByText(secondError)).toBeInTheDocument();
    });
  });
});