import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { YouTubeTutorialCTA } from '../youtube-tutorial-cta';

// Mock React Icons
vi.mock('react-icons/fa', () => ({
  FaYoutube: ({ className, ...props }: any) => (
    <div data-testid="youtube-icon" className={className} {...props} />
  )
}));

describe('YouTubeTutorialCTA', () => {
  it('should render with text', () => {
    render(<YouTubeTutorialCTA text="Watch Tutorial" />);
    
    expect(screen.getByText('Watch Tutorial')).toBeInTheDocument();
  });

  it('should render YouTube icon', () => {
    render(<YouTubeTutorialCTA text="Watch Tutorial" />);
    
    const icon = screen.getByTestId('youtube-icon');
    expect(icon).toBeInTheDocument();
    expect(icon).toHaveClass('text-2xl');
    expect(icon).toHaveClass('text-red-600');
  });

  it('should use default URL when not provided', () => {
    render(<YouTubeTutorialCTA text="Watch Tutorial" />);
    
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', 'https://youtube.com/');
  });

  it('should use custom URL when provided', () => {
    render(<YouTubeTutorialCTA text="Watch Tutorial" url="https://youtube.com/watch?v=abc123" />);
    
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', 'https://youtube.com/watch?v=abc123');
  });

  it('should open link in new tab', () => {
    render(<YouTubeTutorialCTA text="Watch Tutorial" />);
    
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('should have security attributes for external link', () => {
    render(<YouTubeTutorialCTA text="Watch Tutorial" />);
    
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('should have accessible aria-label', () => {
    render(<YouTubeTutorialCTA text="Watch Tutorial" />);
    
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('aria-label', 'Watch Tutorial - Opens in new tab');
  });

  it('should mark icon as decorative', () => {
    render(<YouTubeTutorialCTA text="Watch Tutorial" />);
    
    const icon = screen.getByTestId('youtube-icon');
    expect(icon).toHaveAttribute('aria-hidden', 'true');
  });

  it('should apply container styles', () => {
    const { container } = render(<YouTubeTutorialCTA text="Watch Tutorial" />);
    
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toHaveClass('mt-6');
    expect(wrapper).toHaveClass('p-4');
    expect(wrapper).toHaveClass('bg-gray-50');
    expect(wrapper).toHaveClass('rounded-lg');
    expect(wrapper).toHaveClass('border');
    expect(wrapper).toHaveClass('border-gray-200');
  });

  it('should apply link styles', () => {
    render(<YouTubeTutorialCTA text="Watch Tutorial" />);
    
    const link = screen.getByRole('link');
    expect(link).toHaveClass('flex');
    expect(link).toHaveClass('items-center');
    expect(link).toHaveClass('justify-center');
    expect(link).toHaveClass('gap-3');
    expect(link).toHaveClass('text-gray-700');
    expect(link).toHaveClass('hover:text-red-600');
    expect(link).toHaveClass('transition-colors');
  });

  it('should apply text styles', () => {
    render(<YouTubeTutorialCTA text="Watch Tutorial" />);
    
    const textSpan = screen.getByText('Watch Tutorial');
    expect(textSpan).toHaveClass('font-medium');
  });

  it('should handle long text', () => {
    const longText = 'This is a very long tutorial title that might wrap to multiple lines in the component';
    render(<YouTubeTutorialCTA text={longText} />);
    
    expect(screen.getByText(longText)).toBeInTheDocument();
    expect(screen.getByRole('link')).toHaveAttribute(
      'aria-label',
      `${longText} - Opens in new tab`
    );
  });

  it('should handle empty URL', () => {
    render(<YouTubeTutorialCTA text="Watch Tutorial" url="" />);
    
    const link = screen.getByRole('link');
    // Should fallback to default URL when empty string is provided
    expect(link).toHaveAttribute('href', 'https://youtube.com/');
  });

  it('should handle special characters in text', () => {
    const specialText = 'Watch "Tutorial" & Learn <More>';
    render(<YouTubeTutorialCTA text={specialText} />);
    
    expect(screen.getByText(specialText)).toBeInTheDocument();
  });

  it('should maintain layout with flexbox', () => {
    render(<YouTubeTutorialCTA text="Watch Tutorial" />);
    
    const link = screen.getByRole('link');
    expect(link).toHaveClass('flex');
    expect(link).toHaveClass('items-center');
    expect(link).toHaveClass('justify-center');
  });

  it('should have consistent spacing', () => {
    render(<YouTubeTutorialCTA text="Watch Tutorial" />);
    
    const link = screen.getByRole('link');
    expect(link).toHaveClass('gap-3'); // Space between icon and text
  });

  it('should be keyboard accessible', () => {
    render(<YouTubeTutorialCTA text="Watch Tutorial" />);
    
    const link = screen.getByRole('link');
    
    // Should be focusable
    link.focus();
    expect(document.activeElement).toBe(link);
  });

  it('should handle protocol-relative URLs', () => {
    render(<YouTubeTutorialCTA text="Watch Tutorial" url="//youtube.com/watch?v=123" />);
    
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '//youtube.com/watch?v=123');
  });

  it('should handle non-YouTube URLs', () => {
    render(<YouTubeTutorialCTA text="Watch Tutorial" url="https://example.com/tutorial" />);
    
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', 'https://example.com/tutorial');
  });

  it('should render consistently with different text lengths', () => {
    const { rerender } = render(<YouTubeTutorialCTA text="Short" />);
    
    let link = screen.getByRole('link');
    expect(link).toHaveClass('flex');
    
    rerender(<YouTubeTutorialCTA text="This is a much longer text for the tutorial" />);
    
    link = screen.getByRole('link');
    expect(link).toHaveClass('flex');
    expect(link).toHaveClass('items-center');
  });
});