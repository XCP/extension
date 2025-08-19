import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { PriceWithSuggestInput } from '../price-with-suggest-input';

// Mock utilities
vi.mock('@/utils/format', () => ({
  formatAmount: vi.fn((options) => {
    const value = options.value;
    if (typeof value === 'number') {
      return value.toFixed(options.maximumFractionDigits || 8);
    }
    return String(value);
  })
}));

vi.mock('@/utils/numeric', () => ({
  toBigNumber: vi.fn((v) => v),
  isValidPositiveNumber: vi.fn((value, options) => {
    if (value === '') return true;
    const num = parseFloat(value);
    if (isNaN(num)) return false;
    if (num < 0) return false;
    if (!options?.allowZero && num === 0) return false;
    return true;
  })
}));

describe('PriceWithSuggestInput', () => {
  const defaultProps = {
    value: '',
    onChange: vi.fn(),
    tradingPairData: null
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render input with label', () => {
    render(<PriceWithSuggestInput {...defaultProps} />);
    
    expect(screen.getByText('Price')).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('should show required indicator', () => {
    render(<PriceWithSuggestInput {...defaultProps} />);
    
    const asterisk = screen.getByText('*');
    expect(asterisk).toHaveClass('text-red-500');
  });

  it('should use custom label', () => {
    render(<PriceWithSuggestInput {...defaultProps} label="Unit Price" />);
    
    expect(screen.getByText('Unit Price')).toBeInTheDocument();
  });

  it('should handle input changes', () => {
    const onChange = vi.fn();
    render(<PriceWithSuggestInput {...defaultProps} onChange={onChange} />);
    
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '123.456' } });
    
    expect(onChange).toHaveBeenCalledWith('123.456');
  });

  it('should sanitize non-numeric characters', () => {
    const onChange = vi.fn();
    render(<PriceWithSuggestInput {...defaultProps} onChange={onChange} />);
    
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'abc123.456xyz' } });
    
    expect(onChange).toHaveBeenCalledWith('123.456');
  });

  it('should handle multiple decimal points', () => {
    const onChange = vi.fn();
    render(<PriceWithSuggestInput {...defaultProps} onChange={onChange} />);
    
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '12.34.56' } });
    
    // Should merge extra decimals
    expect(onChange).toHaveBeenCalledWith('12.3456');
  });

  it('should show Min button when trading pair data has last trade price', () => {
    const tradingPairData = {
      last_trade_price: '100.50',
      name: 'XCP/BTC'
    };
    
    render(<PriceWithSuggestInput {...defaultProps} tradingPairData={tradingPairData} />);
    
    const minButton = screen.getByLabelText('Use suggested price from last trade');
    expect(minButton).toBeInTheDocument();
    expect(minButton).toHaveTextContent('Min');
  });

  it('should not show Min button when no trading pair data', () => {
    render(<PriceWithSuggestInput {...defaultProps} />);
    
    expect(screen.queryByLabelText('Use suggested price from last trade')).not.toBeInTheDocument();
  });

  it('should set value when Min button is clicked', () => {
    const onChange = vi.fn();
    const tradingPairData = {
      last_trade_price: '100.50000000',
      name: 'XCP/BTC'
    };
    
    render(<PriceWithSuggestInput {...defaultProps} onChange={onChange} tradingPairData={tradingPairData} />);
    
    const minButton = screen.getByLabelText('Use suggested price from last trade');
    fireEvent.click(minButton);
    
    expect(onChange).toHaveBeenCalledWith('100.50000000');
  });

  it('should show help text when shouldShowHelpText is true', () => {
    render(<PriceWithSuggestInput {...defaultProps} shouldShowHelpText={true} priceDescription="Enter the price per unit" />);
    
    expect(screen.getByText('Enter the price per unit')).toBeInTheDocument();
  });

  it('should show last trade price in help text', () => {
    const tradingPairData = {
      last_trade_price: '0.00001234',
      name: 'XCP/BTC'
    };
    
    render(<PriceWithSuggestInput {...defaultProps} tradingPairData={tradingPairData} shouldShowHelpText={true} />);
    
    expect(screen.getByText(/Last trade:/)).toBeInTheDocument();
  });

  it('should show pair name when showPairFlip is true', () => {
    const tradingPairData = {
      last_trade_price: '100',
      name: 'XCP/BTC'
    };
    
    render(<PriceWithSuggestInput {...defaultProps} tradingPairData={tradingPairData} showPairFlip={true} />);
    
    expect(screen.getByText('XCP/BTC')).toBeInTheDocument();
  });

  it('should flip pair name when clicked', () => {
    const setIsPairFlipped = vi.fn();
    const tradingPairData = {
      last_trade_price: '100',
      name: 'XCP/BTC'
    };
    
    render(
      <PriceWithSuggestInput 
        {...defaultProps} 
        tradingPairData={tradingPairData} 
        showPairFlip={true}
        isPairFlipped={false}
        setIsPairFlipped={setIsPairFlipped}
      />
    );
    
    const pairName = screen.getByText('XCP/BTC');
    fireEvent.click(pairName);
    
    expect(setIsPairFlipped).toHaveBeenCalledWith(expect.any(Function));
  });

  it('should show flipped pair name when isPairFlipped is true', () => {
    const tradingPairData = {
      last_trade_price: '100',
      name: 'XCP/BTC'
    };
    
    render(
      <PriceWithSuggestInput 
        {...defaultProps} 
        tradingPairData={tradingPairData} 
        showPairFlip={true}
        isPairFlipped={true}
      />
    );
    
    expect(screen.getByText('BTC/XCP')).toBeInTheDocument();
  });

  it('should invert price when pair is flipped', () => {
    const onChange = vi.fn();
    const setIsPairFlipped = vi.fn((fn) => fn(false));
    const tradingPairData = {
      last_trade_price: '100',
      name: 'XCP/BTC'
    };
    
    render(
      <PriceWithSuggestInput 
        {...defaultProps}
        value="2"
        onChange={onChange}
        tradingPairData={tradingPairData} 
        showPairFlip={true}
        isPairFlipped={false}
        setIsPairFlipped={setIsPairFlipped}
      />
    );
    
    const pairName = screen.getByText('XCP/BTC');
    fireEvent.click(pairName);
    
    // Should calculate 1/2 = 0.5
    expect(onChange).toHaveBeenCalledWith('0.50000000');
  });

  it('should have correct input attributes', () => {
    render(<PriceWithSuggestInput {...defaultProps} name="testPrice" />);
    
    const input = screen.getByRole('textbox');
    expect(input).toHaveAttribute('id', 'testPrice');
    expect(input).toHaveAttribute('name', 'testPrice');
    expect(input).toHaveAttribute('type', 'text');
    expect(input).toHaveAttribute('required');
    expect(input).toHaveAttribute('placeholder', '0.00000000');
  });

  it('should apply custom className', () => {
    const { container } = render(<PriceWithSuggestInput {...defaultProps} className="custom-field-class" />);
    
    const field = container.querySelector('.custom-field-class');
    expect(field).toBeInTheDocument();
  });

  it('should apply correct input styles', () => {
    render(<PriceWithSuggestInput {...defaultProps} />);
    
    const input = screen.getByRole('textbox');
    expect(input).toHaveClass('mt-1');
    expect(input).toHaveClass('block');
    expect(input).toHaveClass('w-full');
    expect(input).toHaveClass('p-2');
    expect(input).toHaveClass('rounded-md');
    expect(input).toHaveClass('border');
    expect(input).toHaveClass('bg-gray-50');
    expect(input).toHaveClass('pr-16'); // Space for Min button
  });

  it('should format display value', () => {
    render(<PriceWithSuggestInput {...defaultProps} value="123.45678900" />);
    
    const input = screen.getByRole('textbox') as HTMLInputElement;
    expect(input.value).toBe('123.45678900');
  });

  it('should handle empty value', () => {
    render(<PriceWithSuggestInput {...defaultProps} value="" />);
    
    const input = screen.getByRole('textbox') as HTMLInputElement;
    expect(input.value).toBe('');
  });

  it('should not flip pair when showPairFlip is false', () => {
    const setIsPairFlipped = vi.fn();
    const tradingPairData = {
      last_trade_price: '100',
      name: 'XCP/BTC'
    };
    
    render(
      <PriceWithSuggestInput 
        {...defaultProps} 
        tradingPairData={tradingPairData} 
        showPairFlip={false}
        setIsPairFlipped={setIsPairFlipped}
      />
    );
    
    // Pair name should not be visible
    expect(screen.queryByText('XCP/BTC')).not.toBeInTheDocument();
  });

  it('should handle zero value when flipping', () => {
    const onChange = vi.fn();
    const setIsPairFlipped = vi.fn((fn) => fn(false));
    const tradingPairData = {
      last_trade_price: '100',
      name: 'XCP/BTC'
    };
    
    render(
      <PriceWithSuggestInput 
        {...defaultProps}
        value="0"
        onChange={onChange}
        tradingPairData={tradingPairData} 
        showPairFlip={true}
        isPairFlipped={false}
        setIsPairFlipped={setIsPairFlipped}
      />
    );
    
    const pairName = screen.getByText('XCP/BTC');
    fireEvent.click(pairName);
    
    // Should not call onChange when value is 0 (can't divide by 0)
    expect(onChange).not.toHaveBeenCalled();
  });

  it('should handle invalid value when flipping', () => {
    const onChange = vi.fn();
    const setIsPairFlipped = vi.fn((fn) => fn(false));
    const tradingPairData = {
      last_trade_price: '100',
      name: 'XCP/BTC'
    };
    
    render(
      <PriceWithSuggestInput 
        {...defaultProps}
        value="invalid"
        onChange={onChange}
        tradingPairData={tradingPairData} 
        showPairFlip={true}
        isPairFlipped={false}
        setIsPairFlipped={setIsPairFlipped}
      />
    );
    
    const pairName = screen.getByText('XCP/BTC');
    fireEvent.click(pairName);
    
    // Should not call onChange when value is invalid
    expect(onChange).not.toHaveBeenCalled();
  });

  it('should show flipped last trade price in help text', () => {
    const tradingPairData = {
      last_trade_price: '2',
      name: 'XCP/BTC'
    };
    
    render(
      <PriceWithSuggestInput 
        {...defaultProps} 
        tradingPairData={tradingPairData} 
        shouldShowHelpText={true}
        showPairFlip={true}
        isPairFlipped={true}
      />
    );
    
    // Should show 1/2 = 0.5
    expect(screen.getByText(/Last trade:/)).toBeInTheDocument();
    expect(screen.getByText(/0\.50000000/)).toBeInTheDocument();
  });
});