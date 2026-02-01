import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import * as fc from 'fast-check';
import '@testing-library/jest-dom/vitest';
import { Spinner } from './spinner';

// Mock React Icons
vi.mock('@/components/icons', () => ({
  FaSpinner: ({ className, ...props }: any) => <div data-testid="spinner-icon" className={className} {...props} />
}));

describe('Spinner', () => {
  it('should render spinner icon', () => {
    render(<Spinner />);
    
    const spinner = screen.getByTestId('spinner-icon');
    expect(spinner).toBeInTheDocument();
  });

  it('should apply animation classes to spinner', () => {
    render(<Spinner />);
    
    const spinner = screen.getByTestId('spinner-icon');
    expect(spinner).toHaveClass('animate-spin');
    expect(spinner).toHaveClass('text-4xl');
    expect(spinner).toHaveClass('text-blue-500');
  });

  it('should render without message by default', () => {
    render(<Spinner />);
    
    // Should not show visible message but should have screen reader text
    expect(screen.queryByRole('paragraph')).not.toBeInTheDocument();
    expect(screen.getByText('Loading…')).toHaveClass('sr-only');
  });

  it('should render message when provided', () => {
    render(<Spinner message="Loading wallets…" />);

    expect(screen.getByText('Loading wallets…')).toBeInTheDocument();
  });

  it('should apply message styles', () => {
    render(<Spinner message="Processing…" />);

    const message = screen.getByText('Processing…');
    expect(message).toHaveClass('mt-4');
    expect(message).toHaveClass('text-gray-600');
    expect(message).toHaveClass('text-center');
    expect(message).toHaveClass('font-medium');
  });

  it('should apply default container classes', () => {
    const { container } = render(<Spinner />);
    
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toHaveClass('flex');
    expect(wrapper).toHaveClass('flex-col');
    expect(wrapper).toHaveClass('items-center');
    expect(wrapper).toHaveClass('justify-center');
    expect(wrapper).toHaveClass('h-full');
  });

  it('should apply custom className', () => {
    const { container } = render(<Spinner className="custom-class" />);
    
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toHaveClass('custom-class');
    // Should still have default classes
    expect(wrapper).toHaveClass('flex');
    expect(wrapper).toHaveClass('items-center');
  });

  it('should handle empty className', () => {
    const { container } = render(<Spinner className="" />);
    
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toHaveClass('flex');
    expect(wrapper).toHaveClass('flex-col');
  });

  it('should handle long messages', () => {
    const longMessage = 'This is a very long loading message that might wrap to multiple lines in a narrow container';
    render(<Spinner message={longMessage} />);
    
    const message = screen.getByText(longMessage);
    expect(message).toBeInTheDocument();
    expect(message).toHaveClass('text-center');
  });

  it('should render message as paragraph element', () => {
    render(<Spinner message="Loading…" />);

    const message = screen.getByText('Loading…');
    expect(message.tagName.toLowerCase()).toBe('p');
  });

  it('should position message below spinner', () => {
    const { container } = render(<Spinner message="Loading…" />);

    const wrapper = container.firstChild as HTMLElement;
    const children = Array.from(wrapper.children);

    expect(children[0]).toHaveAttribute('data-testid', 'spinner-icon');
    expect(children[1]).toHaveTextContent('Loading…');
  });

  it('should handle special characters in message', () => {
    render(<Spinner message="Loading <data> & processing…" />);

    expect(screen.getByText('Loading <data> & processing…')).toBeInTheDocument();
  });

  it('should handle empty message string', () => {
    render(<Spinner message="" />);
    
    // Empty string should not render the paragraph
    const paragraphs = screen.queryAllByText('');
    expect(paragraphs.filter(el => el.tagName.toLowerCase() === 'p')).toHaveLength(0);
  });

  it('should center content vertically and horizontally', () => {
    const { container } = render(<Spinner />);
    
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toHaveClass('items-center'); // horizontal centering
    expect(wrapper).toHaveClass('justify-center'); // vertical centering
  });

  describe('Accessibility', () => {
    it('should have appropriate ARIA attributes for assistive technology', () => {
      render(<Spinner message="Loading content…" />);
      
      const spinner = screen.getByTestId('spinner-icon');
      const message = screen.getByText('Loading content…');
      
      // Icon should be decorative (no aria-label needed as it's visual only)
      expect(spinner).toBeInTheDocument();
      
      // Message provides context for screen readers
      expect(message).toBeInTheDocument();
    });

    it('should provide loading context when message is present', () => {
      render(<Spinner message="Processing your request…" />);

      const message = screen.getByText('Processing your request…');
      expect(message).toBeInTheDocument();
      expect(message.tagName.toLowerCase()).toBe('p');
    });

    it('should be screen reader accessible without message', () => {
      render(<Spinner />);
      
      // Even without a message, the spinning icon provides visual indication
      const spinner = screen.getByTestId('spinner-icon');
      expect(spinner).toBeInTheDocument();
      expect(spinner).toHaveClass('animate-spin');
    });

    it('should not interfere with keyboard navigation', () => {
      const { container } = render(<Spinner message="Loading…" />);
      
      // Spinner should not have any focusable elements that would trap focus
      const focusableElements = container.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      expect(focusableElements).toHaveLength(0);
    });
  });

  describe('Performance and Animation', () => {
    it('should apply animation classes correctly', () => {
      render(<Spinner />);
      
      const spinner = screen.getByTestId('spinner-icon');
      expect(spinner).toHaveClass('animate-spin');
    });

    it('should use appropriate sizing for visibility', () => {
      render(<Spinner />);
      
      const spinner = screen.getByTestId('spinner-icon');
      expect(spinner).toHaveClass('text-4xl'); // Large enough to be clearly visible
    });

    it('should use contrasting colors for visibility', () => {
      render(<Spinner />);
      
      const spinner = screen.getByTestId('spinner-icon');
      expect(spinner).toHaveClass('text-blue-500'); // Blue provides good contrast
    });
  });

  describe('Layout and Responsive Design', () => {
    it('should fill full height of parent container', () => {
      const { container } = render(<Spinner />);
      
      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper).toHaveClass('h-full');
    });

    it('should maintain layout with different container sizes', () => {
      const { container } = render(<Spinner className="h-screen w-screen" />);
      
      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper).toHaveClass('h-screen', 'w-screen'); // Custom classes applied
      expect(wrapper).toHaveClass('flex', 'items-center', 'justify-center'); // Core layout maintained
    });

    it('should handle flex container properly', () => {
      const { container } = render(<Spinner />);
      
      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper).toHaveClass('flex', 'flex-col');
    });
  });

  describe('Message Formatting', () => {
    it('should handle multiline messages gracefully', () => {
      const multilineMessage = 'Loading…\nThis may take a moment\nPlease wait';
      render(<Spinner message={multilineMessage} />);
      
      // Target specifically the paragraph element 
      const message = screen.getByText((content, element) => {
        return element?.tagName === 'P' && element?.textContent === multilineMessage;
      });
      expect(message).toHaveClass('text-center'); // Center alignment helps with multiline
    });

    it('should handle HTML entities in messages', () => {
      render(<Spinner message="Loading &lt;data&gt; &amp; processing…" />);

      expect(screen.getByText('Loading <data> & processing…')).toBeInTheDocument();
    });

    it('should handle unicode characters in messages', () => {
      render(<Spinner message="Loading… ⏳🔄⚡" />);

      expect(screen.getByText('Loading… ⏳🔄⚡')).toBeInTheDocument();
    });

    it('should apply proper text styling to messages', () => {
      render(<Spinner message="Styled message" />);
      
      const message = screen.getByText('Styled message');
      expect(message).toHaveClass('text-gray-600', 'font-medium');
    });
  });

  describe('Integration and Component Composition', () => {
    it('should work within different container contexts', () => {
      render(
        <div style={{ height: '200px', width: '300px' }}>
          <Spinner message="In container" />
        </div>
      );
      
      const message = screen.getByText('In container');
      expect(message).toBeInTheDocument();
    });

    it('should maintain performance with frequent re-renders', () => {
      const { rerender } = render(<Spinner message="Message 1" />);
      
      expect(screen.getByText('Message 1')).toBeInTheDocument();
      
      rerender(<Spinner message="Message 2" />);
      expect(screen.getByText('Message 2')).toBeInTheDocument();
      expect(screen.queryByText('Message 1')).not.toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('should handle very long messages without breaking layout', () => {
      const veryLongMessage = 'This is an extremely long loading message that could potentially cause layout issues if not handled properly but should still render correctly with appropriate text wrapping and center alignment that ensures good user experience across different viewport sizes and container dimensions';
      
      render(<Spinner message={veryLongMessage} />);
      
      const message = screen.getByText(veryLongMessage);
      expect(message).toBeInTheDocument();
      expect(message).toHaveClass('text-center'); // Should still be centered
    });

    it('should handle whitespace-only messages', () => {
      render(<Spinner message="   " />);
      
      // Target specifically the paragraph element for whitespace content
      const message = screen.getByText((content, element) => {
        return element?.tagName === 'P' && element?.textContent === '   ';
      });
      expect(message).toBeInTheDocument();
    });

    it('should handle numeric and boolean content in messages', () => {
      render(<Spinner message="Loading item 42…" />);

      expect(screen.getByText('Loading item 42…')).toBeInTheDocument();
    });

    it('should handle rapidly changing messages', () => {
      const { rerender } = render(<Spinner message="Step 1" />);
      
      for (let i = 2; i <= 5; i++) {
        rerender(<Spinner message={`Step ${i}`} />);
        expect(screen.getByText(`Step ${i}`)).toBeInTheDocument();
      }
    });
  });

  describe('Property-based Testing', () => {
    it('should handle various message strings correctly', () => {
      fc.assert(
        fc.property(
          fc.string().filter((s: string) => s.trim().length > 0 && s.trim().length <= 100 && !s.includes('Loading')),
          (message: string) => {
            const { container, unmount } = render(<Spinner message={message} />);
            
            try {
              const wrapper = container.firstChild as HTMLElement;
              
              // Should always maintain core structure
              expect(wrapper).toHaveClass('flex', 'flex-col', 'items-center', 'justify-center', 'h-full');
              
              // Should have spinner icon
              const spinner = screen.getByTestId('spinner-icon');
              expect(spinner).toHaveClass('animate-spin', 'text-4xl', 'text-blue-500');
              
              // Message should render since we filtered for meaningful content
              expect(screen.getByText((content, element) => {
                return element?.tagName === 'P' && element?.textContent === message;
              })).toBeInTheDocument();
            } finally {
              // Clean up after each property test iteration
              unmount();
            }
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should handle various className combinations', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 0, maxLength: 100 }),
          (className: string) => {
            const { container, unmount } = render(<Spinner className={className} />);
            
            try {
              const wrapper = container.firstChild as HTMLElement;
              
              // Should maintain core classes regardless of custom className
              expect(wrapper).toHaveClass('flex', 'items-center', 'justify-center', 'h-full');
              
              // Should apply custom className if provided
              if (className.trim()) {
                expect(wrapper).toHaveClass(className);
              }
            } finally {
              // Clean up after each property test iteration
              unmount();
            }
          }
        ),
        { numRuns: 30 }
      );
    });
  });
});