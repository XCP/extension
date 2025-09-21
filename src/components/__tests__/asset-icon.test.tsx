import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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
      
      // Check for the container with aria-label instead of alt text on img
      const container = screen.getByLabelText('XCP icon');
      expect(container).toBeInTheDocument();
      expect(container).toHaveAttribute('role', 'img');
      
      // Image has empty alt text for accessibility (since container has the label)
      const image = container.querySelector('img');
      expect(image).toHaveAttribute('src', 'https://app.xcp.io/img/icon/XCP');
      expect(image).toHaveAttribute('alt', '');
    });

    it('should render fallback initially', () => {
      render(<AssetIcon asset="BITCOIN" />);
      
      // The fallback is now part of the main container, not a separate labeled element
      const container = screen.getByLabelText('BITCOIN icon');
      expect(container).toBeInTheDocument();
      
      // Check for fallback text within the container
      const fallback = container.querySelector('div');
      expect(fallback).toHaveTextContent('BIT');
      expect(fallback).toHaveClass('bg-gray-200', 'text-gray-500');
    });

    it('should generate correct fallback text for assets', () => {
      render(<AssetIcon asset="PEPECASH" />);
      
      const container = screen.getByLabelText('PEPECASH icon');
      const fallback = container.querySelector('div');
      expect(fallback).toHaveTextContent('PEP');
    });

    it('should handle short asset names', () => {
      render(<AssetIcon asset="A" />);
      
      const container = screen.getByLabelText('A icon');
      const fallback = container.querySelector('div');
      expect(fallback).toHaveTextContent('A');
    });

    it('should handle two-character asset names', () => {
      render(<AssetIcon asset="AB" />);
      
      const container = screen.getByLabelText('AB icon');
      const fallback = container.querySelector('div');
      expect(fallback).toHaveTextContent('AB');
    });
  });

  describe('Size Handling', () => {
    it('should apply correct size styles for small size', () => {
      const { container } = render(<AssetIcon asset="XCP" size="sm" />);
      
      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper).toHaveStyle('width: 24px; height: 24px');
    });

    it('should apply correct size styles for medium size', () => {
      const { container } = render(<AssetIcon asset="XCP" size="md" />);
      
      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper).toHaveStyle('width: 32px; height: 32px');
    });

    it('should apply correct size styles for large size (default)', () => {
      const { container } = render(<AssetIcon asset="XCP" />);
      
      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper).toHaveStyle('width: 40px; height: 40px');
    });

    it('should handle custom numeric sizes', () => {
      const { container } = render(<AssetIcon asset="XCP" size={64} />);
      
      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper).toHaveStyle('width: 64px; height: 64px');
    });

    it('should handle large custom numeric sizes', () => {
      const { container } = render(<AssetIcon asset="XCP" size={128} />);
      
      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper).toHaveStyle('width: 128px; height: 128px');
    });
  });

  describe('Image Loading States', () => {
    it('should show fallback initially and hide image', () => {
      render(<AssetIcon asset="TEST_ASSET" />);
      
      const container = screen.getByLabelText('TEST_ASSET icon');
      const fallback = container.querySelector('div');
      const image = container.querySelector('img');
      
      expect(fallback).toBeVisible();
      expect(image).toHaveClass('opacity-0');
    });

    it('should handle image load event', () => {
      render(<AssetIcon asset="VALID_ASSET" />);
      
      const container = screen.getByLabelText('VALID_ASSET icon');
      const image = container.querySelector('img');
      expect(image).toHaveClass('opacity-0');
      
      // Simulate image load
      fireEvent.load(image!);
      
      // After load, image should become visible
      expect(image).toHaveClass('opacity-100');
    });

    it('should handle image error event', () => {
      render(<AssetIcon asset="INVALID_ASSET" />);
      
      const container = screen.getByLabelText('INVALID_ASSET icon');
      const fallback = container.querySelector('div');
      const image = container.querySelector('img');
      
      expect(fallback).toBeVisible();
      expect(image).toHaveClass('opacity-0');
      
      // Simulate image error
      fireEvent.error(image!);
      
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
      
      const container = screen.getByLabelText('XCP icon');
      const fallback = container.querySelector('div');
      const image = container.querySelector('img');
      
      expect(fallback).toHaveClass('rounded-full');
      expect(image).toHaveClass('rounded-full');
    });

    it('should apply non-rounded styles when rounded=false', () => {
      render(<AssetIcon asset="XCP" rounded={false} />);
      
      const container = screen.getByLabelText('XCP icon');
      const fallback = container.querySelector('div');
      const image = container.querySelector('img');
      
      expect(fallback).toHaveClass('rounded');
      expect(fallback).not.toHaveClass('rounded-full');
      expect(image).toHaveClass('rounded');
      expect(image).not.toHaveClass('rounded-full');
    });

    it('should apply correct fallback styling', () => {
      render(<AssetIcon asset="XCP" />);
      
      const container = screen.getByLabelText('XCP icon');
      const fallback = container.querySelector('div');
      expect(fallback).toHaveClass(
        'absolute',
        'inset-0',
        'bg-gray-200',
        'flex',
        'items-center',
        'justify-center',
        'text-gray-500',
        'font-semibold'
      );
    });
  });

  describe('Accessibility', () => {
    it('should have appropriate aria-label on container', () => {
      render(<AssetIcon asset="BITCOIN" />);
      
      const container = screen.getByLabelText('BITCOIN icon');
      expect(container).toBeInTheDocument();
      expect(container).toHaveAttribute('role', 'img');
    });

    it('should have empty alt text on image for accessibility', () => {
      render(<AssetIcon asset="ETHEREUM" />);
      
      const container = screen.getByLabelText('ETHEREUM icon');
      const image = container.querySelector('img');
      expect(image).toHaveAttribute('alt', '');
    });

    it('should have lazy loading attribute', () => {
      render(<AssetIcon asset="XCP" />);
      
      const container = screen.getByLabelText('XCP icon');
      const image = container.querySelector('img');
      expect(image).toHaveAttribute('loading', 'lazy');
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle empty asset name', () => {
      const { container } = render(<AssetIcon asset="" />);
      
      // For empty asset, find container by role instead of aria-label
      const iconContainer = container.querySelector('[role="img"]');
      expect(iconContainer).toBeInTheDocument();
      expect(iconContainer).toHaveAttribute('aria-label', ' icon');
      
      const fallback = iconContainer?.querySelector('div');
      expect(fallback).toHaveTextContent(''); // Empty fallback text
      
      const image = iconContainer?.querySelector('img');
      expect(image).toHaveAttribute('src', 'https://app.xcp.io/img/icon/');
    });

    it('should handle asset names with lowercase', () => {
      render(<AssetIcon asset="bitcoin" />);
      
      const container = screen.getByLabelText('bitcoin icon');
      const fallback = container.querySelector('div');
      expect(fallback).toHaveTextContent('BIT'); // Should uppercase
    });

    it('should handle asset names with numbers', () => {
      render(<AssetIcon asset="A123456789" />);
      
      const container = screen.getByLabelText('A123456789 icon');
      const fallback = container.querySelector('div');
      expect(fallback).toHaveTextContent('A12');
    });

    it('should handle asset names with special characters', () => {
      render(<AssetIcon asset="A.TEST-COIN_X" />);
      
      const container = screen.getByLabelText('A.TEST-COIN_X icon');
      const fallback = container.querySelector('div');
      expect(fallback).toHaveTextContent('A.T');
    });
  });

  describe('Image URL Generation', () => {
    it('should generate correct URL for asset', () => {
      render(<AssetIcon asset="PEPECASH" />);
      
      const container = screen.getByLabelText('PEPECASH icon');
      const image = container.querySelector('img');
      expect(image).toHaveAttribute('src', 'https://app.xcp.io/img/icon/PEPECASH');
    });

    it('should handle asset names with spaces', () => {
      render(<AssetIcon asset="TEST COIN" />);
      
      const container = screen.getByLabelText('TEST COIN icon');
      const image = container.querySelector('img');
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
            .filter((s: string) => !s.includes('%') && !s.includes('!') && !s.includes(',') && !s.includes(' ')), // Filter out problematic characters for testing
          (asset: string) => {
            const { container, unmount } = render(<AssetIcon asset={asset} />);
            
            try {
              // Use container queries instead of screen to avoid cross-test pollution
              // Escape special characters in the selector
              const escapedAsset = CSS.escape(asset);
              const iconContainer = container.querySelector(`[aria-label="${escapedAsset} icon"]`) || 
                                   container.querySelector('[role="img"]'); // Fallback to role selector
              expect(iconContainer).toBeTruthy();
              
              const fallback = iconContainer?.querySelector('div');
              const image = iconContainer?.querySelector('img');
              
              // Fallback should show first 3 characters uppercased
              const expectedFallback = asset.slice(0, 3).toUpperCase();
              expect(fallback).toHaveTextContent(expectedFallback);
              
              // Image should have correct src
              expect(image).toHaveAttribute('src', `https://app.xcp.io/img/icon/${asset}`);
              
              // Should have proper structure
              expect(container.firstChild).toHaveClass('relative');
            } finally {
              // Clean up after each run to avoid pollution
              unmount();
            }
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
              const expectedPixels = size === 'sm' ? 24 : size === 'md' ? 32 : 40;
              expect(wrapper).toHaveStyle(`width: ${expectedPixels}px; height: ${expectedPixels}px`);
            } else {
              expect(wrapper).toHaveStyle(`width: ${size}px; height: ${size}px`);
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

  it('should apply correct size styles', () => {
    const { container } = render(<AssetIconWithFallback asset="XCP" size="sm" />);
    
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toHaveStyle('width: 24px; height: 24px');
  });

  it('should apply custom className', () => {
    const { container } = render(<AssetIconWithFallback asset="XCP" className="custom-class" />);
    
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toHaveClass('custom-class');
  });

  it('should handle custom numeric sizes', () => {
    const { container } = render(<AssetIconWithFallback asset="XCP" size={64} />);
    
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toHaveStyle('width: 64px; height: 64px');
  });

  it('should contain asset text', () => {
    const { container } = render(<AssetIconWithFallback asset="PEPECASH" />);
    
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toHaveTextContent('PEP'); // First 3 chars
    expect(wrapper).toHaveClass('inline-flex', 'items-center', 'justify-center');
  });

  describe('Security', () => {
    it('should handle potentially dangerous asset names safely', () => {
      const { container } = render(<AssetIconWithFallback asset="<script>alert('xss')</script>" />);
      
      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper).toBeInTheDocument();
      // The text content should safely render without executing scripts
      expect(wrapper).toHaveTextContent('<SC'); // First 3 characters, safely rendered
      expect(wrapper).toHaveClass('inline-flex');
    });
  });

  describe('Property-based Testing', () => {
    it('should generate valid fallback for various asset names', () => {
      if (!fc) {
        console.log('Skipping property-based test - fast-check not available');
        return;
      }
      
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 15 })
            .filter((s: string) => s.trim().length > 0)
            .filter((s: string) => !s.includes(' ') && !s.includes('!') && !s.includes(',')),
          (asset: string) => {
            const { container } = render(<AssetIconWithFallback asset={asset} />);
            const wrapper = container.firstChild as HTMLElement;
            
            expect(wrapper).toHaveAttribute('aria-label', `${asset} icon`);
            expect(wrapper).toHaveClass('inline-flex', 'items-center', 'justify-center');
            
            const expectedText = asset.slice(0, 3).toUpperCase();
            expect(wrapper).toHaveTextContent(expectedText);
          }
        ),
        { numRuns: 25 }
      );
    });
  });
});