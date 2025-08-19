import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { FeeRateInput } from '../fee-rate-input';

// Setup portal root for Headless UI
beforeEach(() => {
  const portalRoot = document.createElement('div');
  portalRoot.setAttribute('id', 'headlessui-portal-root');
  document.body.appendChild(portalRoot);
});

afterEach(() => {
  const portalRoot = document.getElementById('headlessui-portal-root');
  if (portalRoot) {
    document.body.removeChild(portalRoot);
  }
});

// Mock the useFeeRates hook
vi.mock('@/hooks/useFeeRates', () => ({
  useFeeRates: vi.fn()
}));

import { useFeeRates } from '@/hooks/useFeeRates';

describe('FeeRateInput', () => {
  const mockUseFeeRates = useFeeRates as any;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Loading state', () => {
    it('should show loading state when fee rates are loading', () => {
      mockUseFeeRates.mockReturnValue({
        feeRates: null,
        loading: true,
        error: null,
        uniquePresetOptions: []
      });

      render(<FeeRateInput />);
      
      expect(screen.getByText('Loading fee rates…')).toBeInTheDocument();
    });
  });

  describe('Error state', () => {
    it('should show custom input when fee rates fail to load', () => {
      mockUseFeeRates.mockReturnValue({
        feeRates: null,
        loading: false,
        error: 'Failed to fetch fee rates',
        uniquePresetOptions: []
      });

      render(<FeeRateInput />);
      
      const input = screen.getByRole('spinbutton');
      expect(input).toBeInTheDocument();
      expect(input).toHaveAttribute('name', 'sat_per_vbyte');
    });
  });


  describe('Preset options', () => {
    const mockFeeRates = {
      fastestFee: 10,
      halfHourFee: 8,
      hourFee: 5,
      economyFee: 2,
      minimumFee: 1
    };

    const mockPresetOptions = [
      { id: 'fast', name: 'Fast', value: 10 },
      { id: 'medium', name: 'Medium', value: 5 },
      { id: 'slow', name: 'Slow', value: 2 }
    ];

    beforeEach(() => {
      mockUseFeeRates.mockReturnValue({
        feeRates: mockFeeRates,
        loading: false,
        error: null,
        uniquePresetOptions: mockPresetOptions
      });
    });

    it('should display dropdown with preset options', () => {
      render(<FeeRateInput />);
      
      const button = screen.getByRole('button');
      expect(button).toHaveTextContent('Fast');
      expect(button).toHaveTextContent('10 sat/vB');
    });

    it('should include hidden input with current value', () => {
      const { container } = render(<FeeRateInput />);
      
      const hiddenInput = container.querySelector('input[type="hidden"][name="sat_per_vbyte"]') as HTMLInputElement;
      expect(hiddenInput).toBeInTheDocument();
      expect(hiddenInput.value).toBe('10'); // Fast preset value
    });
  });

  describe('Disabled state', () => {
    const mockFeeRates = {
      fastestFee: 10,
      halfHourFee: 8,
      hourFee: 5,
      economyFee: 2,
      minimumFee: 1
    };

    const mockPresetOptions = [
      { id: 'fast', name: 'Fast', value: 10 },
      { id: 'medium', name: 'Medium', value: 5 },
      { id: 'slow', name: 'Slow', value: 2 }
    ];

    beforeEach(() => {
      mockUseFeeRates.mockReturnValue({
        feeRates: mockFeeRates,
        loading: false,
        error: null,
        uniquePresetOptions: mockPresetOptions
      });
    });

    it('should disable dropdown when disabled prop is true', () => {
      render(<FeeRateInput disabled />);
      
      const button = screen.getByRole('button');
      expect(button).toBeDisabled();
    });
  });

  describe('Help text', () => {
    const mockFeeRates = {
      fastestFee: 10,
      halfHourFee: 8,
      hourFee: 5,
      economyFee: 2,
      minimumFee: 1
    };

    const mockPresetOptions = [
      { id: 'fast', name: 'Fast', value: 10 },
      { id: 'medium', name: 'Medium', value: 5 },
      { id: 'slow', name: 'Slow', value: 2 }
    ];

    beforeEach(() => {
      mockUseFeeRates.mockReturnValue({
        feeRates: mockFeeRates,
        loading: false,
        error: null,
        uniquePresetOptions: mockPresetOptions
      });
    });

    it('should show help text when showHelpText is true', () => {
      render(<FeeRateInput showHelpText />);
      
      expect(screen.getByText('Pre-populated with current rates (min 0.1 sat/vB).')).toBeInTheDocument();
    });

    it('should not show help text when showHelpText is false', () => {
      render(<FeeRateInput showHelpText={false} />);
      
      expect(screen.queryByText('Pre-populated with current rates (min 0.1 sat/vB).')).not.toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    const mockFeeRates = {
      fastestFee: 10,
      halfHourFee: 8,
      hourFee: 5,
      economyFee: 2,
      minimumFee: 1
    };

    const mockPresetOptions = [
      { id: 'fast', name: 'Fast', value: 10 },
      { id: 'medium', name: 'Medium', value: 5 },
      { id: 'slow', name: 'Slow', value: 2 }
    ];

    beforeEach(() => {
      mockUseFeeRates.mockReturnValue({
        feeRates: mockFeeRates,
        loading: false,
        error: null,
        uniquePresetOptions: mockPresetOptions
      });
    });

    it('should have required indicator', () => {
      render(<FeeRateInput />);
      
      expect(screen.getByText('*')).toBeInTheDocument();
    });
  });
});