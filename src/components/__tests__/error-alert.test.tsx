import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { ErrorAlert } from '../error-alert';

// Mock React Icons
vi.mock('react-icons/io5', () => ({
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
    expect(alert).toHaveAttribute('aria-live', 'polite');
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
    expect(messageSpan).toHaveClass('break-all');
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

  it('should have proper spacing with pr-6 for close button space', () => {
    render(<ErrorAlert message="Test error" onClose={() => {}} />);
    
    const messageSpan = screen.getByText('Test error');
    expect(messageSpan).toHaveClass('pr-6');
  });
});