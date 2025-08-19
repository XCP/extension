import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { Button } from '../button';

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
    expect(button).toHaveClass('cursor-progress');
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
});