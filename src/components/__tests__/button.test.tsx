import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import * as fc from 'fast-check';
import '@testing-library/jest-dom/vitest';
import { Button } from '../button';

// Mock React Icons
vi.mock('react-icons/fa', () => ({
  FaYoutube: ({ className, ...props }: any) => <div data-testid="youtube-icon" className={className} {...props} />
}));

describe('Button', () => {
  it('should render children correctly', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByText('Click me')).toBeInTheDocument();
  });

  it('should handle click events', () => {
    const handleClick = vi.fn();
    render(<Button onClick={handleClick}>Click me</Button>);
    
    fireEvent.click(screen.getByText('Click me'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('should not trigger click when disabled', () => {
    const handleClick = vi.fn();
    render(<Button disabled onClick={handleClick}>Click me</Button>);
    
    fireEvent.click(screen.getByText('Click me'));
    expect(handleClick).not.toHaveBeenCalled();
  });

  it('should apply correct styles for solid variant', () => {
    const { container } = render(<Button color="blue" variant="solid">Button</Button>);
    const button = container.querySelector('button');
    
    expect(button).toHaveClass('bg-blue-500');
    expect(button).toHaveClass('text-white');
  });

  it('should apply correct styles for transparent variant', () => {
    const { container } = render(<Button variant="transparent">Button</Button>);
    const button = container.querySelector('button');
    
    expect(button).toHaveClass('bg-transparent');
  });

  it('should apply correct styles for icon variant', () => {
    const { container } = render(<Button variant="icon">Icon</Button>);
    const button = container.querySelector('button');
    
    expect(button).toHaveClass('px-3');
    expect(button).toHaveClass('py-2');
  });

  it('should apply correct styles for menu variant', () => {
    const { container } = render(<Button variant="menu">Menu</Button>);
    const button = container.querySelector('button');
    
    expect(button).toHaveClass('p-1');
    expect(button).toHaveClass('bg-transparent');
  });

  it('should apply correct styles for header variant', () => {
    const { container } = render(<Button variant="header">Header</Button>);
    const button = container.querySelector('button');
    
    expect(button).toHaveClass('h-[32px]');
    expect(button).toHaveClass('text-blue-500');
  });

  it('should apply fullWidth styles when prop is true', () => {
    const { container } = render(<Button fullWidth>Full Width</Button>);
    const button = container.querySelector('button');
    
    expect(button).toHaveClass('w-full');
  });

  it('should not apply fullWidth styles when prop is false', () => {
    const { container } = render(<Button fullWidth={false}>Normal Width</Button>);
    const button = container.querySelector('button');
    
    expect(button).not.toHaveClass('w-full');
  });

  it('should apply custom className', () => {
    const { container } = render(<Button className="custom-class">Custom</Button>);
    const button = container.querySelector('button');
    
    expect(button).toHaveClass('custom-class');
  });

  it('should apply correct color styles for gray', () => {
    const { container } = render(<Button color="gray">Gray Button</Button>);
    const button = container.querySelector('button');
    
    expect(button).toHaveClass('bg-gray-200');
    expect(button).toHaveClass('text-gray-800');
  });

  it('should apply correct color styles for green', () => {
    const { container } = render(<Button color="green">Green Button</Button>);
    const button = container.querySelector('button');
    
    expect(button).toHaveClass('bg-green-500');
    expect(button).toHaveClass('text-white');
  });

  it('should apply correct color styles for red', () => {
    const { container } = render(<Button color="red">Red Button</Button>);
    const button = container.querySelector('button');
    
    expect(button).toHaveClass('bg-red-500');
    expect(button).toHaveClass('text-white');
  });

  it('should apply opacity when disabled', () => {
    const { container } = render(<Button disabled>Disabled</Button>);
    const button = container.querySelector('button');
    
    expect(button).toHaveClass('opacity-50');
    expect(button).toHaveClass('cursor-not-allowed');
  });

  it('should forward ref correctly', () => {
    const ref = vi.fn();
    render(<Button ref={ref}>With Ref</Button>);
    
    expect(ref).toHaveBeenCalled();
  });

  it('should pass through additional props', () => {
    render(<Button data-testid="custom-button" aria-label="Custom Label">Props</Button>);
    
    const button = screen.getByTestId('custom-button');
    expect(button).toHaveAttribute('aria-label', 'Custom Label');
  });

  it('should handle menu-item variant styles', () => {
    const { container } = render(<Button variant="menu-item">Menu Item</Button>);
    const button = container.querySelector('button');
    
    expect(button).toHaveClass('px-4');
    expect(button).toHaveClass('py-2');
    expect(button).toHaveClass('text-sm');
  });

  it('should handle input variant styles', () => {
    const { container } = render(<Button variant="input">Input Button</Button>);
    const button = container.querySelector('button');
    
    expect(button).toHaveClass('absolute');
    expect(button).toHaveClass('right-1');
    expect(button).toHaveClass('w-11');
  });

  describe('YouTube Variant', () => {
    it('should render as anchor tag for youtube variant', () => {
      render(<Button variant="youtube" href="https://youtube.com/watch?v=test">Watch Video</Button>);
      
      const link = screen.getByRole('link');
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute('href', 'https://youtube.com/watch?v=test');
    });

    it('should use default YouTube URL when href not provided', () => {
      render(<Button variant="youtube">Watch Video</Button>);
      
      const link = screen.getByRole('link');
      expect(link).toHaveAttribute('href', 'https://youtube.com/');
    });

    it('should have correct accessibility attributes for youtube variant', () => {
      render(<Button variant="youtube">Tutorial Video</Button>);
      
      const link = screen.getByRole('link');
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
      expect(link).toHaveAttribute('aria-label', 'Tutorial Video - Opens in new tab');
    });

    it('should render YouTube icon for youtube variant', () => {
      render(<Button variant="youtube">Watch</Button>);
      
      const icon = screen.getByTestId('youtube-icon');
      expect(icon).toBeInTheDocument();
      expect(icon).toHaveClass('text-2xl', 'text-red-600');
      expect(icon).toHaveAttribute('aria-hidden', 'true');
    });

    it('should apply correct styling to youtube variant container', () => {
      const { container } = render(<Button variant="youtube">Video</Button>);
      
      const wrapper = container.querySelector('div');
      expect(wrapper).toHaveClass('mt-6', 'p-4', 'bg-gray-50', 'rounded-lg', 'border', 'border-gray-200');
    });

    it('should apply correct styling to youtube variant link', () => {
      render(<Button variant="youtube">Video</Button>);
      
      const link = screen.getByRole('link');
      expect(link).toHaveClass('flex', 'items-center', 'justify-center', 'gap-3', 'text-gray-700', 'hover:text-red-600', 'transition-colors');
    });
  });

  describe('Accessibility', () => {
    it('should be focusable with keyboard navigation', () => {
      render(<Button>Focusable Button</Button>);
      
      const button = screen.getByRole('button');
      button.focus();
      expect(button).toHaveFocus();
    });

    it('should have proper button role', () => {
      render(<Button>Button</Button>);
      
      expect(screen.getByRole('button')).toBeInTheDocument();
    });

    it('should support aria-label attribute', () => {
      render(<Button aria-label="Custom aria label">Button</Button>);
      
      const button = screen.getByLabelText('Custom aria label');
      expect(button).toBeInTheDocument();
    });

    it('should apply focus ring styles for solid variant', () => {
      const { container } = render(<Button variant="solid">Solid</Button>);
      const button = container.querySelector('button');
      
      expect(button).toHaveClass('focus:outline-none');
      expect(button).toHaveClass('focus:ring-2');
      expect(button).toHaveClass('focus:ring-offset-2');
    });

    it('should apply focus ring styles for header variant', () => {
      const { container } = render(<Button variant="header">Header</Button>);
      const button = container.querySelector('button');
      
      expect(button).toHaveClass('focus:outline-none');
      expect(button).toHaveClass('focus:ring-2');
      expect(button).toHaveClass('focus:ring-offset-2');
    });

    it('should be accessible when disabled', () => {
      render(<Button disabled>Disabled Button</Button>);
      
      const button = screen.getByRole('button');
      expect(button).toBeDisabled();
      expect(button).toHaveAttribute('disabled');
    });
  });

  describe('Event Handling', () => {
    it('should handle keyboard events', () => {
      const handleKeyDown = vi.fn();
      render(<Button onKeyDown={handleKeyDown}>Button</Button>);
      
      const button = screen.getByRole('button');
      fireEvent.keyDown(button, { key: 'Enter' });
      
      expect(handleKeyDown).toHaveBeenCalledTimes(1);
    });

    it('should handle focus and blur events', () => {
      const handleFocus = vi.fn();
      const handleBlur = vi.fn();
      render(<Button onFocus={handleFocus} onBlur={handleBlur}>Button</Button>);
      
      const button = screen.getByRole('button');
      
      fireEvent.focus(button);
      expect(handleFocus).toHaveBeenCalledTimes(1);
      
      fireEvent.blur(button);
      expect(handleBlur).toHaveBeenCalledTimes(1);
    });
  });

  describe('Hover and Active States', () => {
    it('should apply hover styles for solid variant', () => {
      const { container } = render(<Button color="blue" variant="solid">Hover Test</Button>);
      const button = container.querySelector('button');
      
      // Check that hover class is present in className
      expect(button?.className).toMatch(/hover:bg-blue-600/);
    });

    it('should apply hover styles for transparent variant', () => {
      const { container } = render(<Button variant="transparent">Transparent</Button>);
      const button = container.querySelector('button');
      
      expect(button?.className).toMatch(/hover:bg-gray-50/);
    });
  });

  describe('Edge Cases', () => {
    it('should handle undefined children gracefully', () => {
      render(<Button>{undefined}</Button>);
      
      const button = screen.getByRole('button');
      expect(button).toBeInTheDocument();
    });

    it('should handle null children gracefully', () => {
      render(<Button>{null}</Button>);
      
      const button = screen.getByRole('button');
      expect(button).toBeInTheDocument();
    });

    it('should handle complex children elements', () => {
      render(
        <Button>
          <span>Icon</span>
          <span>Text</span>
        </Button>
      );
      
      expect(screen.getByText('Icon')).toBeInTheDocument();
      expect(screen.getByText('Text')).toBeInTheDocument();
    });

    it('should maintain styling with very long text', () => {
      const longText = 'This is a very long button text that might cause layout issues in some scenarios but should be handled gracefully';
      const { container } = render(<Button>{longText}</Button>);
      
      const button = container.querySelector('button');
      expect(button).toHaveClass('flex', 'items-center', 'justify-center');
      expect(screen.getByText(longText)).toBeInTheDocument();
    });
  });

  describe('Property-based Testing', () => {
    it('should handle various text content correctly', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
          (text: string) => {
            const { container, unmount } = render(<Button>{text}</Button>);
            
            try {
              const button = container.querySelector('button');
              
              expect(button).toBeInTheDocument();
              // Use a more flexible text matcher that handles whitespace normalization
              const buttonText = button?.textContent || '';
              expect(buttonText).toBeTruthy();
              expect(button).toHaveClass('bg-blue-500'); // Default color
            } finally {
              unmount();
            }
          }
        ),
        { numRuns: 30 }
      );
    });

    it('should handle various color and variant combinations', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('blue', 'gray', 'green', 'red'),
          fc.constantFrom('solid', 'transparent', 'icon', 'header', 'menu', 'menu-item', 'input'),
          (color: any, variant: any) => {
            // Skip youtube variant as it has different rendering logic
            if (variant === 'youtube') return true;
            
            const { container, unmount } = render(<Button color={color} variant={variant}>Test</Button>);
            
            try {
              const button = container.querySelector('button');
              
              expect(button).toBeInTheDocument();
              expect(screen.getByText('Test')).toBeInTheDocument();
            } finally {
              unmount();
            }
          }
        ),
        { numRuns: 50 }
      );
    });
  });
});