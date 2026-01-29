import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { FeeRateInput } from './fee-rate-input';

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
        isLoading: true,
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
        isLoading: false,
        error: 'Failed to fetch fee rates',
        uniquePresetOptions: []
      });

      render(<FeeRateInput />);
      
      const input = screen.getByRole('textbox');
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
        isLoading: false,
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
        isLoading: false,
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
        isLoading: false,
        error: null,
        uniquePresetOptions: mockPresetOptions
      });
    });

    it('should show help text when showHelpText is true', () => {
      render(<FeeRateInput showHelpText />);
      
      expect(screen.getByText('Populated with network rates (min 0.1 sat/vB).')).toBeInTheDocument();
    });

    it('should not show help text when showHelpText is false', () => {
      render(<FeeRateInput showHelpText={false} />);
      
      expect(screen.queryByText('Populated with network rates (min 0.1 sat/vB).')).not.toBeInTheDocument();
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
        isLoading: false,
        error: null,
        uniquePresetOptions: mockPresetOptions
      });
    });

    it('should have required indicator', () => {
      render(<FeeRateInput />);

      expect(screen.getByText('*')).toBeInTheDocument();
    });
  });

  describe('onFeeRateChange callback', () => {
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
        isLoading: false,
        error: null,
        uniquePresetOptions: mockPresetOptions
      });
    });

    it('should call onFeeRateChange with fast preset value on initial load', () => {
      const onFeeRateChange = vi.fn();
      render(<FeeRateInput onFeeRateChange={onFeeRateChange} />);

      // Should be called with fastestFee (10) on mount
      expect(onFeeRateChange).toHaveBeenCalledWith(10);
    });

    it('should call onFeeRateChange with initialValue when provided', () => {
      const onFeeRateChange = vi.fn();
      render(<FeeRateInput onFeeRateChange={onFeeRateChange} initialValue={15} />);

      // Should be called with the initial value (15)
      expect(onFeeRateChange).toHaveBeenCalledWith(15);
    });

    it('should restore preset when initialValue matches a preset', () => {
      const onFeeRateChange = vi.fn();
      render(<FeeRateInput onFeeRateChange={onFeeRateChange} initialValue={10} />);

      // Should be called with 10 (matches Fast preset)
      expect(onFeeRateChange).toHaveBeenCalledWith(10);
      // Dropdown should show Fast
      expect(screen.getByRole('button')).toHaveTextContent('Fast');
    });
  });

  describe('initialValue restoration', () => {
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
        isLoading: false,
        error: null,
        uniquePresetOptions: mockPresetOptions
      });
    });

    it('should switch to custom mode for non-preset initialValue', () => {
      const onFeeRateChange = vi.fn();
      render(<FeeRateInput onFeeRateChange={onFeeRateChange} initialValue={15} />);

      // Should show custom input (not dropdown) for non-preset value
      const customInput = screen.getByRole('textbox');
      expect(customInput).toBeInTheDocument();
      expect(customInput).toHaveValue('15');
    });

    it('should select matching preset for initialValue that matches', () => {
      render(<FeeRateInput initialValue={5} />);

      // Should show dropdown with Medium selected (value=5)
      const button = screen.getByRole('button');
      expect(button).toHaveTextContent('Medium');
      expect(button).toHaveTextContent('5 sat/vB');
    });

    it('should default to fast preset when initialValue is null', () => {
      render(<FeeRateInput initialValue={null} />);

      // Should show dropdown with Fast selected
      const button = screen.getByRole('button');
      expect(button).toHaveTextContent('Fast');
    });
  });

  describe('Custom input typing', () => {
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
        isLoading: false,
        error: null,
        uniquePresetOptions: mockPresetOptions
      });
    });

    it('should call onFeeRateChange when user types in custom input', async () => {
      const onFeeRateChange = vi.fn();

      // Start in custom mode with initialValue that doesn't match presets
      render(<FeeRateInput onFeeRateChange={onFeeRateChange} initialValue={15} />);

      // Custom input should be visible
      const input = screen.getByRole('textbox');
      expect(input).toBeInTheDocument();
      expect(input).toHaveValue('15');

      // Clear the callback calls from initialization
      onFeeRateChange.mockClear();

      // User types a new value
      fireEvent.change(input, { target: { value: '25' } });

      // Should call onFeeRateChange with the new value
      expect(onFeeRateChange).toHaveBeenCalledWith(25);
    });

    it('should call onFeeRateChange when user changes custom value', async () => {
      const onFeeRateChange = vi.fn();

      // Start in custom mode
      render(<FeeRateInput onFeeRateChange={onFeeRateChange} initialValue={15} />);

      const input = screen.getByRole('textbox');

      // Clear initialization calls
      onFeeRateChange.mockClear();

      // Simulate user clearing and typing new value
      fireEvent.change(input, { target: { value: '5' } });

      // Callback should be called with the new value
      expect(onFeeRateChange).toHaveBeenCalledWith(5);
    });

    it('should not call onFeeRateChange for invalid input', async () => {
      const onFeeRateChange = vi.fn();

      render(<FeeRateInput onFeeRateChange={onFeeRateChange} initialValue={15} />);

      const input = screen.getByRole('textbox');
      onFeeRateChange.mockClear();

      // User types empty string
      fireEvent.change(input, { target: { value: '' } });

      // Callback should NOT be called for empty input
      expect(onFeeRateChange).not.toHaveBeenCalled();
    });
  });
});