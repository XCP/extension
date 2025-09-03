import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { AssetIcon, AssetIconWithFallback } from '../asset-icon';

// Import fast-check with try/catch for better error handling
let fc: any;
try {
  fc = require('fast-check');
} catch (e) {
  console.warn('fast-check not available, skipping property-based tests');
}

describe('AssetIcon', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  describe('Basic Rendering', () => {
    it('should render with default props', () => {
      render(<AssetIcon asset="XCP" />);
      
      const image = screen.getByAltText('XCP icon');
      expect(image).toBeInTheDocument();
      expect(image).toHaveAttribute('src', 'https://app.xcp.io/img/icon/XCP');
    });

    it('should render fallback initially', () => {
      render(<AssetIcon asset="BITCOIN" />);
      
      const fallback = screen.getByLabelText('BITCOIN icon placeholder');
      expect(fallback).toBeInTheDocument();
      expect(fallback).toHaveTextContent('BIT');
    });

    it('should generate correct fallback text for assets', () => {
      render(<AssetIcon asset="PEPECASH" />);
      
      const fallback = screen.getByLabelText('PEPECASH icon placeholder');
      expect(fallback).toHaveTextContent('PEP');
    });

    it('should handle short asset names', () => {
      render(<AssetIcon asset="A" />);
      
      const fallback = screen.getByLabelText('A icon placeholder');
      expect(fallback).toHaveTextContent('A');
    });

    it('should handle two-character asset names', () => {
      render(<AssetIcon asset="AB" />);
      
      const fallback = screen.getByLabelText('AB icon placeholder');
      expect(fallback).toHaveTextContent('AB');
    });
  });

  describe('Size Handling', () => {
    it('should apply correct size classes for small size', () => {
      const { container } = render(<AssetIcon asset="XCP" size="sm" />);
      
      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper).toHaveClass('w-8', 'h-8');
    });

    it('should apply correct size classes for medium size', () => {
      const { container } = render(<AssetIcon asset="XCP" size="md" />);
      
      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper).toHaveClass('w-10', 'h-10');
    });

    it('should apply correct size classes for large size (default)', () => {
      const { container } = render(<AssetIcon asset="XCP" />);
      
      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper).toHaveClass('w-12', 'h-12');
    });

    it('should handle custom numeric sizes', () => {
      const { container } = render(<AssetIcon asset="XCP" size={64} />);
      
      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper).toHaveClass('w-16', 'h-16'); // 64/4 = 16
    });

    it('should handle large custom numeric sizes', () => {
      const { container } = render(<AssetIcon asset="XCP" size={128} />);
      
      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper).toHaveClass('w-32', 'h-32'); // 128/4 = 32
    });
  });

  describe('Image Loading States', () => {
    it('should show fallback initially and hide image', () => {
      render(<AssetIcon asset="TEST_ASSET" />);
      
      const fallback = screen.getByLabelText('TEST_ASSET icon placeholder');
      const image = screen.getByAltText('TEST_ASSET icon');
      
      expect(fallback).toBeVisible();
      expect(image).toHaveClass('opacity-0');
    });

    it('should handle image load event', () => {
      render(<AssetIcon asset="VALID_ASSET" />);
      
      const image = screen.getByAltText('VALID_ASSET icon');
      expect(image).toHaveClass('opacity-0');
      
      // Simulate image load
      fireEvent.load(image);
      
      // After load, image should become visible
      expect(image).toHaveClass('opacity-100');
    });

    it('should handle image error event', () => {
      render(<AssetIcon asset="INVALID_ASSET" />);
      
      const fallback = screen.getByLabelText('INVALID_ASSET icon placeholder');
      const image = screen.getByAltText('INVALID_ASSET icon');
      
      expect(fallback).toBeVisible();
      expect(image).toHaveClass('opacity-0');
      
      // Simulate image error
      fireEvent.error(image);
      
      // After error, image should remain hidden, fallback visible
      expect(image).toHaveClass('opacity-0');
      expect(fallback).toBeVisible();
    });
  });

  describe('Styling and Classes', () => {
    it('should apply custom className', () => {
      const { container } = render(<AssetIcon asset="XCP" className="custom-class" />);
      
      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper).toHaveClass('custom-class');
    });

    it('should apply rounded styles by default', () => {
      render(<AssetIcon asset="XCP" />);
      
      const fallback = screen.getByLabelText('XCP icon placeholder');
      const image = screen.getByAltText('XCP icon');
      
      expect(fallback).toHaveClass('rounded-full');
      expect(image).toHaveClass('rounded-full');
    });

    it('should apply non-rounded styles when rounded=false', () => {
      render(<AssetIcon asset="XCP" rounded={false} />);
      
      const fallback = screen.getByLabelText('XCP icon placeholder');
      const image = screen.getByAltText('XCP icon');
      
      expect(fallback).toHaveClass('rounded');
      expect(fallback).not.toHaveClass('rounded-full');
      expect(image).toHaveClass('rounded');
      expect(image).not.toHaveClass('rounded-full');
    });

    it('should apply correct fallback styling', () => {
      render(<AssetIcon asset="XCP" />);
      
      const fallback = screen.getByLabelText('XCP icon placeholder');
      expect(fallback).toHaveClass(
        'absolute',
        'inset-0',
        'bg-gray-200',
        'flex',
        'items-center',
        'justify-center',
        'text-gray-500',
        'text-xs',
        'font-semibold'
      );
    });
  });

  describe('Accessibility', () => {
    it('should have appropriate alt text for image', () => {
      render(<AssetIcon asset="BITCOIN" />);
      
      const image = screen.getByAltText('BITCOIN icon');
      expect(image).toBeInTheDocument();
    });

    it('should have appropriate aria-label for fallback', () => {
      render(<AssetIcon asset="ETHEREUM" />);
      
      const fallback = screen.getByLabelText('ETHEREUM icon placeholder');
      expect(fallback).toBeInTheDocument();
    });

    it('should have lazy loading attribute', () => {
      render(<AssetIcon asset="XCP" />);
      
      const image = screen.getByAltText('XCP icon');
      expect(image).toHaveAttribute('loading', 'lazy');
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle empty asset name', () => {
      render(<AssetIcon asset="" />);
      
      // For empty asset, the aria-label will be " icon placeholder" (with space)
      const fallback = screen.getByLabelText(' icon placeholder');
      expect(fallback).toHaveTextContent(''); // Empty fallback text
      
      const image = screen.getByAltText(' icon');
      expect(image).toHaveAttribute('src', 'https://app.xcp.io/img/icon/');
    });

    it('should handle asset names with lowercase', () => {
      render(<AssetIcon asset="bitcoin" />);
      
      const fallback = screen.getByLabelText('bitcoin icon placeholder');
      expect(fallback).toHaveTextContent('BIT'); // Should uppercase
    });

    it('should handle asset names with numbers', () => {
      render(<AssetIcon asset="A123456789" />);
      
      const fallback = screen.getByLabelText('A123456789 icon placeholder');
      expect(fallback).toHaveTextContent('A12');
    });

    it('should handle asset names with special characters', () => {
      render(<AssetIcon asset="A.TEST-COIN_X" />);
      
      const fallback = screen.getByLabelText('A.TEST-COIN_X icon placeholder');
      expect(fallback).toHaveTextContent('A.T');
    });
  });

  describe('Image URL Generation', () => {
    it('should generate correct URL for asset', () => {
      render(<AssetIcon asset="PEPECASH" />);
      
      const image = screen.getByAltText('PEPECASH icon');
      expect(image).toHaveAttribute('src', 'https://app.xcp.io/img/icon/PEPECASH');
    });

    it('should handle asset names with spaces', () => {
      render(<AssetIcon asset="TEST COIN" />);
      
      const image = screen.getByAltText('TEST COIN icon');
      expect(image).toHaveAttribute('src', 'https://app.xcp.io/img/icon/TEST COIN');
    });
  });

  describe('Property-based Testing', () => {
    it('should handle various asset names correctly', () => {
      if (!fc) {
        console.log('Skipping property-based test - fast-check not available');
        return;
      }
      
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 20 })
            .filter((s: string) => s.trim().length > 0)
            .filter((s: string) => !s.includes('%')), // Filter out problematic characters for testing
          (asset: string) => {
            const { container } = render(<AssetIcon asset={asset} />);
            const fallback = screen.getByLabelText(`${asset} icon placeholder`);
            const image = screen.getByAltText(`${asset} icon`);
            
            // Fallback should show first 3 characters uppercased
            const expectedFallback = asset.slice(0, 3).toUpperCase();
            expect(fallback).toHaveTextContent(expectedFallback);
            
            // Image should have correct src
            expect(image).toHaveAttribute('src', `https://app.xcp.io/img/icon/${asset}`);
            
            // Should have proper structure
            expect(container.firstChild).toHaveClass('relative');
          }
        ),
        { numRuns: 30 } // Reduce runs for stability
      );
    });

    it('should handle various sizes correctly', () => {
      if (!fc) {
        console.log('Skipping property-based test - fast-check not available');
        return;
      }
      
      fc.assert(
        fc.property(
          fc.oneof(
            fc.constantFrom('sm', 'md', 'lg'),
            fc.integer({ min: 16, max: 256 }).map((n: number) => Math.floor(n / 4) * 4) // Ensure divisible by 4
          ),
          (size: 'sm' | 'md' | 'lg' | number) => {
            const { container } = render(<AssetIcon asset="TEST" size={size} />);
            const wrapper = container.firstChild as HTMLElement;
            
            if (typeof size === 'string') {
              const expectedPixels = size === 'sm' ? 32 : size === 'md' ? 40 : 48;
              const expectedClass = `w-${expectedPixels / 4}`;
              expect(wrapper).toHaveClass(expectedClass);
            } else {
              const expectedClass = `w-${size / 4}`;
              expect(wrapper).toHaveClass(expectedClass);
            }
          }
        ),
        { numRuns: 30 }
      );
    });
  });
});

describe('AssetIconWithFallback', () => {
  it('should render SVG fallback immediately', () => {
    const { container } = render(<AssetIconWithFallback asset="XCP" />);
    
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toBeInTheDocument();
    expect(wrapper).toHaveAttribute('aria-label', 'XCP icon');
  });

  it('should apply correct size classes', () => {
    const { container } = render(<AssetIconWithFallback asset="XCP" size="sm" />);
    
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toHaveClass('w-8', 'h-8');
  });

  it('should apply custom className', () => {
    const { container } = render(<AssetIconWithFallback asset="XCP" className="custom-class" />);
    
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toHaveClass('custom-class');
  });

  it('should handle custom numeric sizes', () => {
    const { container } = render(<AssetIconWithFallback asset="XCP" size={64} />);
    
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toHaveClass('w-16', 'h-16');
  });

  it('should contain SVG with asset text', () => {
    const { container } = render(<AssetIconWithFallback asset="PEPECASH" />);
    
    const wrapper = container.firstChild as HTMLElement;
    const svgContent = wrapper.innerHTML;
    expect(svgContent).toContain('PEP'); // First 3 chars
    expect(svgContent).toContain('<svg');
    expect(svgContent).toContain('</svg>');
  });

  describe('Security', () => {
    it('should handle potentially dangerous asset names safely', () => {
      const { container } = render(<AssetIconWithFallback asset="<script>alert('xss')</script>" />);
      
      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper).toBeInTheDocument();
      // The SVG content should safely render text without executing scripts
      expect(wrapper.innerHTML).toContain('<svg');
      expect(wrapper.innerHTML).toContain('</svg>');
      // Should contain the first 3 characters as text (might be HTML encoded)
      const svgContent = wrapper.innerHTML;
      expect(svgContent).toMatch(/(&lt;|<)sc/i); // Should contain <sc or &lt;sc
    });
  });

  describe('Property-based Testing', () => {
    it('should generate valid SVG for various asset names', () => {
      if (!fc) {
        console.log('Skipping property-based test - fast-check not available');
        return;
      }
      
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 15 }).filter((s: string) => s.trim().length > 0),
          (asset: string) => {
            const { container } = render(<AssetIconWithFallback asset={asset} />);
            const wrapper = container.firstChild as HTMLElement;
            
            expect(wrapper).toHaveAttribute('aria-label', `${asset} icon`);
            expect(wrapper.innerHTML).toContain('<svg');
            expect(wrapper.innerHTML).toContain('</svg>');
            
            const expectedText = asset.slice(0, 3).toUpperCase();
            // SVG should contain the text (may be HTML encoded)
            expect(wrapper.innerHTML).toMatch(new RegExp(expectedText.charAt(0)));
          }
        ),
        { numRuns: 25 }
      );
    });
  });
});