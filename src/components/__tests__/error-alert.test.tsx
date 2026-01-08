import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import * as fc from 'fast-check';
import '@testing-library/jest-dom/vitest';
import { ErrorAlert } from '../error-alert';

// Mock local icons
vi.mock('@/components/icons', () => ({
  IoClose: ({ className, ...props }: any) => <div data-testid="close-icon" className={className} {...props} />
}));

describe('ErrorAlert', () => {
  it('should render error message', () => {
    render(<ErrorAlert message="Something went wrong" />);
    
    expect(screen.getByText('Error:')).toBeInTheDocument();
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('should have correct accessibility attributes', () => {
    render(<ErrorAlert message="Test error" />);
    
    const alert = screen.getByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveAttribute('aria-live', 'assertive'); // Errors should be assertive
  });

  it('should render close button when onClose is provided', () => {
    const onClose = vi.fn();
    render(<ErrorAlert message="Test error" onClose={onClose} />);
    
    const closeButton = screen.getByLabelText('Dismiss error message');
    expect(closeButton).toBeInTheDocument();
  });

  it('should not render close button when onClose is not provided', () => {
    render(<ErrorAlert message="Test error" />);
    
    expect(screen.queryByLabelText('Dismiss error message')).not.toBeInTheDocument();
  });

  it('should call onClose when close button is clicked', () => {
    const onClose = vi.fn();
    render(<ErrorAlert message="Test error" onClose={onClose} />);
    
    const closeButton = screen.getByLabelText('Dismiss error message');
    fireEvent.click(closeButton);
    
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('should apply correct styling classes', () => {
    const { container } = render(<ErrorAlert message="Test error" />);
    const alertDiv = container.firstChild as HTMLElement;
    
    expect(alertDiv).toHaveClass('bg-red-100');
    expect(alertDiv).toHaveClass('border-red-400');
    expect(alertDiv).toHaveClass('text-red-700');
  });

  it('should render close icon with correct styling', () => {
    render(<ErrorAlert message="Test error" onClose={() => {}} />);
    
    const closeIcon = screen.getByTestId('close-icon');
    expect(closeIcon).toHaveClass('h-4');
    expect(closeIcon).toHaveClass('w-4');
    expect(closeIcon).toHaveClass('text-red-700');
  });

  it('should have aria-hidden on close icon', () => {
    render(<ErrorAlert message="Test error" onClose={() => {}} />);
    
    const closeIcon = screen.getByTestId('close-icon');
    expect(closeIcon).toHaveAttribute('aria-hidden', 'true');
  });

  it('should handle long error messages', () => {
    const longMessage = 'This is a very long error message that might wrap to multiple lines and should still be displayed correctly with proper formatting and break-all class applied';
    render(<ErrorAlert message={longMessage} />);
    
    const messageSpan = screen.getByText(longMessage);
    expect(messageSpan).toHaveClass('break-words');
  });

  it('should position close button correctly', () => {
    render(<ErrorAlert message="Test error" onClose={() => {}} />);
    
    const closeButton = screen.getByLabelText('Dismiss error message');
    expect(closeButton).toHaveClass('absolute');
    expect(closeButton).toHaveClass('top-2');
    expect(closeButton).toHaveClass('right-2');
  });

  it('should use menu variant for close button', () => {
    render(<ErrorAlert message="Test error" onClose={() => {}} />);
    
    const closeButton = screen.getByLabelText('Dismiss error message');
    // The Button component with variant="menu" should be used
    expect(closeButton.tagName.toLowerCase()).toBe('button');
  });

  it('should apply responsive styles to message span', () => {
    render(<ErrorAlert message="Test error" />);
    
    const messageSpan = screen.getByText('Test error');
    expect(messageSpan).toHaveClass('block');
    expect(messageSpan).toHaveClass('sm:inline');
  });

  it('should have proper spacing with pr-8 for close button space', () => {
    const { container } = render(<ErrorAlert message="Test error" onClose={() => {}} />);
    
    const messageWrapper = container.querySelector('.pr-8');
    expect(messageWrapper).toBeInTheDocument();
    expect(messageWrapper).toHaveClass('pr-8');
  });

  describe('Accessibility and ARIA', () => {
    it('should have appropriate ARIA live region for dynamic content', () => {
      render(<ErrorAlert message="Dynamic error" />);
      
      const alert = screen.getByRole('alert');
      expect(alert).toHaveAttribute('aria-live', 'assertive');
    });

    it('should be keyboard navigable when close button is present', () => {
      render(<ErrorAlert message="Test error" onClose={() => {}} />);
      
      const closeButton = screen.getByLabelText('Dismiss error message');
      closeButton.focus();
      expect(closeButton).toHaveFocus();
    });

    it('should handle keyboard activation of close button', () => {
      const onClose = vi.fn();
      render(<ErrorAlert message="Test error" onClose={onClose} />);
      
      const closeButton = screen.getByLabelText('Dismiss error message');
      fireEvent.keyDown(closeButton, { key: 'Enter' });
      fireEvent.click(closeButton); // Simulate button activation
      
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('should not trap focus when no interactive elements', () => {
      const { container } = render(<ErrorAlert message="No close button" />);
      
      const focusableElements = container.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      expect(focusableElements).toHaveLength(0);
    });

    it('should provide clear context for assistive technology', () => {
      render(<ErrorAlert message="Network connection failed" />);
      
      const errorLabel = screen.getByText('Error:');
      const message = screen.getByText('Network connection failed');
      
      expect(errorLabel).toHaveClass('font-bold');
      expect(message).toBeInTheDocument();
    });
  });

  describe('Error Message Handling', () => {
    it('should handle empty error messages gracefully', () => {
      render(<ErrorAlert message="" />);
      
      const alert = screen.getByRole('alert');
      expect(alert).toBeInTheDocument();
      expect(screen.getByText('Error:')).toBeInTheDocument();
      
      // Find the message span by class since empty text is hard to target
      const messageSpan = alert.querySelector('span.break-words');
      expect(messageSpan).toBeInTheDocument();
      expect(messageSpan?.textContent).toBe('');
    });

    it('should handle whitespace-only messages', () => {
      render(<ErrorAlert message="   " />);
      
      // Use a more flexible matcher for whitespace content
      const messageSpan = screen.getByText((content, element) => {
        return !!(element?.classList.contains('break-words') && element?.textContent === '   ');
      });
      expect(messageSpan).toBeInTheDocument();
      expect(messageSpan).toHaveClass('break-words');
    });

    it('should handle HTML entities in error messages', () => {
      render(<ErrorAlert message="Error: &lt;script&gt; blocked &amp; sanitized" />);
      
      expect(screen.getByText('Error: <script> blocked & sanitized')).toBeInTheDocument();
    });

    it('should handle unicode characters and emojis', () => {
      render(<ErrorAlert message="Connection failed 🚫 Please try again ↻" />);
      
      expect(screen.getByText('Connection failed 🚫 Please try again ↻')).toBeInTheDocument();
    });

    it('should handle very long error messages with proper text breaking', () => {
      const longMessage = 'This is an extremely long error message that contains technical details and stack traces that might exceed normal line lengths and should be properly wrapped with break-all class to ensure it fits within the container bounds without causing horizontal scrolling or layout issues in the user interface';
      
      render(<ErrorAlert message={longMessage} />);
      
      const messageSpan = screen.getByText(longMessage);
      expect(messageSpan).toHaveClass('break-words');
      expect(messageSpan).toBeInTheDocument();
    });

    it('should handle multiline error messages', () => {
      const multilineMessage = 'Error occurred:\nLine 1: Network timeout\nLine 2: Retry failed\nLine 3: Operation aborted';
      
      render(<ErrorAlert message={multilineMessage} />);
      
      const messageSpan = screen.getByText((content, element) => {
        return !!(element?.classList.contains('break-words') && 
                  content.includes('Error occurred:') && 
                  content.includes('Line 1:') && 
                  content.includes('Line 2:') && 
                  content.includes('Line 3:'));
      });
      expect(messageSpan).toBeInTheDocument();
    });
  });

  describe('Component State and Interaction', () => {
    it('should handle multiple rapid close button clicks', () => {
      const onClose = vi.fn();
      render(<ErrorAlert message="Test error" onClose={onClose} />);
      
      const closeButton = screen.getByLabelText('Dismiss error message');
      
      // Simulate rapid clicks
      fireEvent.click(closeButton);
      fireEvent.click(closeButton);
      fireEvent.click(closeButton);
      
      expect(onClose).toHaveBeenCalledTimes(3);
    });

    it('should maintain styling when message changes', () => {
      const { rerender } = render(<ErrorAlert message="Original error" />);
      
      let alert = screen.getByRole('alert');
      expect(alert).toHaveClass('bg-red-100', 'border-red-400', 'text-red-700');
      
      rerender(<ErrorAlert message="Updated error" />);
      
      alert = screen.getByRole('alert');
      expect(alert).toHaveClass('bg-red-100', 'border-red-400', 'text-red-700');
      expect(screen.getByText('Updated error')).toBeInTheDocument();
    });

    it('should handle onClose function changes', () => {
      const onClose1 = vi.fn();
      const onClose2 = vi.fn();
      
      const { rerender } = render(<ErrorAlert message="Test" onClose={onClose1} />);
      
      let closeButton = screen.getByLabelText('Dismiss error message');
      fireEvent.click(closeButton);
      expect(onClose1).toHaveBeenCalledTimes(1);
      
      rerender(<ErrorAlert message="Test" onClose={onClose2} />);
      
      closeButton = screen.getByLabelText('Dismiss error message');
      fireEvent.click(closeButton);
      expect(onClose2).toHaveBeenCalledTimes(1);
      expect(onClose1).toHaveBeenCalledTimes(1); // Should not be called again
    });
  });

  describe('Layout and Visual Design', () => {
    it('should maintain consistent spacing and layout', () => {
      const { container } = render(<ErrorAlert message="Layout test" />);
      const alertDiv = container.firstChild as HTMLElement;
      
      expect(alertDiv).toHaveClass('px-4', 'py-3', 'rounded', 'mb-4', 'relative');
    });

    it('should position close button without affecting message layout', () => {
      const { container } = render(<ErrorAlert message="Message with close button" onClose={() => {}} />);
      
      const closeButton = screen.getByLabelText('Dismiss error message');
      const messageWrapper = container.querySelector('.pr-8');
      
      expect(closeButton).toHaveClass('absolute', 'top-2', 'right-2', 'z-10');
      expect(messageWrapper).toHaveClass('pr-8'); // Space for button
    });

    it('should handle responsive text layout', () => {
      render(<ErrorAlert message="Responsive text" />);
      
      const messageSpan = screen.getByText('Responsive text');
      expect(messageSpan).toHaveClass('block', 'sm:inline');
    });
  });

  describe('Security and Safety', () => {
    it('should safely render potentially dangerous message content', () => {
      const dangerousMessage = '<script>alert("xss")</script><img src="x" onerror="alert(1)">';
      render(<ErrorAlert message={dangerousMessage} />);
      
      // React should automatically escape the content
      expect(screen.getByText(dangerousMessage)).toBeInTheDocument();
      
      // Should not execute any scripts
      const scripts = document.querySelectorAll('script');
      const maliciousScripts = Array.from(scripts).filter(script => 
        script.textContent?.includes('alert("xss")')
      );
      expect(maliciousScripts).toHaveLength(0);
    });

    it('should handle null and undefined values safely', () => {
      // TypeScript would prevent this, but testing runtime safety
      const { rerender } = render(<ErrorAlert message="Valid message" />);
      
      expect(screen.getByText('Valid message')).toBeInTheDocument();
      
      // Should not crash with unexpected values
      rerender(<ErrorAlert message={null as any} />);
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  describe('Property-based Testing', () => {
    it('should handle various error message strings correctly', () => {
      fc.assert(
        fc.property(
          fc.string().filter(s => s.trim().length > 0),
          (message: string) => {
            const { container, unmount } = render(<ErrorAlert message={message} />);
            
            try {
              const alert = container.firstChild as HTMLElement;
              
              // Should always maintain core structure and styling
              expect(alert).toHaveClass('bg-red-100', 'border', 'border-red-400', 'text-red-700');
              expect(alert).toHaveAttribute('role', 'alert');
              expect(alert).toHaveAttribute('aria-live', 'assertive');
              
              // Should always have "Error:" label
              expect(screen.getByText('Error:')).toBeInTheDocument();
              
              // Should render the message - use partial matching for whitespace handling
              expect(screen.getByText((content, element) => {
                if (!element || !element.textContent) return false;
                const normalizedText = element.textContent.replace(/\s+/g, ' ').trim();
                const normalizedMessage = message.replace(/\s+/g, ' ').trim();
                return normalizedText === normalizedMessage;
              })).toBeInTheDocument();
              
              // Message should have proper styling
              const messageSpan = screen.getByText((content, element) => {
                if (!element || !element.textContent) return false;
                const normalizedText = element.textContent.replace(/\s+/g, ' ').trim();
                const normalizedMessage = message.replace(/\s+/g, ' ').trim();
                return normalizedText === normalizedMessage;
              });
              expect(messageSpan).toHaveClass('break-words');
            } finally {
              unmount();
            }
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should handle various onClose callback scenarios', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 100 }),
          fc.boolean(),
          (message: string, shouldHaveClose: boolean) => {
            const onClose = shouldHaveClose ? vi.fn() : undefined;
            
            const { unmount } = render(<ErrorAlert message={message} onClose={onClose} />);
            
            try {
              // Should always have basic structure
              expect(screen.getByRole('alert')).toBeInTheDocument();
              expect(screen.getByText('Error:')).toBeInTheDocument();
              
              // Use flexible matcher for whitespace-only strings
              const messageElement = screen.getByText((content, element) => {
                return !!(element?.classList.contains('break-words') && 
                          element?.textContent === message);
              });
              expect(messageElement).toBeInTheDocument();
              
              // Close button should be present only when onClose provided
              const closeButton = screen.queryByLabelText('Dismiss error message');
              if (shouldHaveClose) {
                expect(closeButton).toBeInTheDocument();
                
                // Should be callable
                fireEvent.click(closeButton!);
                expect(onClose).toHaveBeenCalledTimes(1);
              } else {
                expect(closeButton).not.toBeInTheDocument();
              }
            } finally {
              unmount();
            }
          }
        ),
        { numRuns: 40 }
      );
    });

    it('should maintain accessibility standards with various inputs', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 200 }),
          (message: string) => {
            const { unmount } = render(<ErrorAlert message={message} onClose={() => {}} />);
            
            try {
              // Should have proper ARIA attributes
              const alert = screen.getByRole('alert');
              expect(alert).toHaveAttribute('aria-live', 'assertive');
              
              // Close button should have proper label
              const closeButton = screen.getByLabelText('Dismiss error message');
              expect(closeButton).toBeInTheDocument();
              
              // Icon should be decorative
              const closeIcon = screen.getByTestId('close-icon');
              expect(closeIcon).toHaveAttribute('aria-hidden', 'true');
            } finally {
              unmount();
            }
          }
        ),
        { numRuns: 30 }
      );
    });
  });
});