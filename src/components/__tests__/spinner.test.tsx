import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { Spinner } from '../spinner';

// Mock React Icons
vi.mock('react-icons/fa', () => ({
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
    
    expect(screen.queryByText(/.+/)).not.toBeInTheDocument();
  });

  it('should render message when provided', () => {
    render(<Spinner message="Loading wallets..." />);
    
    expect(screen.getByText('Loading wallets...')).toBeInTheDocument();
  });

  it('should apply message styles', () => {
    render(<Spinner message="Processing..." />);
    
    const message = screen.getByText('Processing...');
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
    render(<Spinner message="Loading..." />);
    
    const message = screen.getByText('Loading...');
    expect(message.tagName.toLowerCase()).toBe('p');
  });

  it('should position message below spinner', () => {
    const { container } = render(<Spinner message="Loading..." />);
    
    const wrapper = container.firstChild as HTMLElement;
    const children = Array.from(wrapper.children);
    
    expect(children[0]).toHaveAttribute('data-testid', 'spinner-icon');
    expect(children[1]).toHaveTextContent('Loading...');
  });

  it('should handle special characters in message', () => {
    render(<Spinner message="Loading <data> & processing..." />);
    
    expect(screen.getByText('Loading <data> & processing...')).toBeInTheDocument();
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
});