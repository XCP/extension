import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { PasswordInput } from '../password-input';

// Mock React Icons
vi.mock('react-icons/fa', () => ({
  FaEye: ({ ...props }: any) => <div data-testid="eye-icon" {...props} />,
  FaEyeSlash: ({ ...props }: any) => <div data-testid="eye-slash-icon" {...props} />
}));

describe('PasswordInput', () => {
  it('should render password input with placeholder', () => {
    render(<PasswordInput placeholder="Enter password" />);
    
    const input = screen.getByPlaceholderText('Enter password');
    expect(input).toBeInTheDocument();
  });

  it('should have password type by default', () => {
    render(<PasswordInput placeholder="Enter password" />);
    
    const input = screen.getByPlaceholderText('Enter password') as HTMLInputElement;
    expect(input.type).toBe('password');
  });

  it('should show eye icon by default', () => {
    render(<PasswordInput placeholder="Enter password" />);
    
    expect(screen.getByTestId('eye-icon')).toBeInTheDocument();
    expect(screen.queryByTestId('eye-slash-icon')).not.toBeInTheDocument();
  });

  it('should toggle password visibility when button is clicked', () => {
    render(<PasswordInput placeholder="Enter password" />);
    
    const input = screen.getByPlaceholderText('Enter password') as HTMLInputElement;
    const toggleButton = screen.getByLabelText('Show password');
    
    // Initially password type
    expect(input.type).toBe('password');
    
    // Click to show password
    fireEvent.click(toggleButton);
    expect(input.type).toBe('text');
    
    // Click to hide password again
    fireEvent.click(screen.getByLabelText('Hide password'));
    expect(input.type).toBe('password');
  });

  it('should toggle icon when visibility changes', () => {
    render(<PasswordInput placeholder="Enter password" />);
    
    const toggleButton = screen.getByLabelText('Show password');
    
    // Initially shows eye icon
    expect(screen.getByTestId('eye-icon')).toBeInTheDocument();
    
    // Click to show password - should show eye-slash icon
    fireEvent.click(toggleButton);
    expect(screen.getByTestId('eye-slash-icon')).toBeInTheDocument();
    expect(screen.queryByTestId('eye-icon')).not.toBeInTheDocument();
    
    // Click to hide password - should show eye icon again
    fireEvent.click(screen.getByLabelText('Hide password'));
    expect(screen.getByTestId('eye-icon')).toBeInTheDocument();
    expect(screen.queryByTestId('eye-slash-icon')).not.toBeInTheDocument();
  });

  it('should apply disabled styles when disabled', () => {
    render(<PasswordInput placeholder="Enter password" disabled />);
    
    const input = screen.getByPlaceholderText('Enter password') as HTMLInputElement;
    const toggleButton = screen.getByLabelText('Show password');
    
    expect(input).toBeDisabled();
    expect(toggleButton).toBeDisabled();
    expect(input).toHaveClass('bg-gray-50');
    expect(input).toHaveClass('cursor-not-allowed');
  });

  it('should use custom name attribute', () => {
    render(<PasswordInput placeholder="Enter password" name="custom-password" />);
    
    const input = screen.getByPlaceholderText('Enter password') as HTMLInputElement;
    expect(input).toHaveAttribute('name', 'custom-password');
  });

  it('should use default name attribute when not provided', () => {
    render(<PasswordInput placeholder="Enter password" />);
    
    const input = screen.getByPlaceholderText('Enter password') as HTMLInputElement;
    expect(input).toHaveAttribute('name', 'password');
  });

  it('should forward ref correctly', () => {
    const ref = React.createRef<HTMLInputElement>();
    render(<PasswordInput placeholder="Enter password" innerRef={ref} />);
    
    expect(ref.current).toBeInstanceOf(HTMLInputElement);
    expect(ref.current?.placeholder).toBe('Enter password');
  });

  it('should handle onChange events', () => {
    const handleChange = vi.fn();
    render(<PasswordInput placeholder="Enter password" onChange={handleChange} />);
    
    const input = screen.getByPlaceholderText('Enter password');
    fireEvent.change(input, { target: { value: 'test123' } });
    
    expect(handleChange).toHaveBeenCalled();
    expect(handleChange.mock.calls[0][0].target.value).toBe('test123');
  });

  it('should not toggle visibility when disabled', () => {
    render(<PasswordInput placeholder="Enter password" disabled />);
    
    const input = screen.getByPlaceholderText('Enter password') as HTMLInputElement;
    const toggleButton = screen.getByLabelText('Show password');
    
    expect(input.type).toBe('password');
    
    fireEvent.click(toggleButton);
    // Should remain password type since button is disabled
    expect(input.type).toBe('password');
  });

  it('should have correct aria attributes on toggle button', () => {
    render(<PasswordInput placeholder="Enter password" />);
    
    const toggleButton = screen.getByLabelText('Show password');
    expect(toggleButton).toHaveAttribute('aria-label', 'Show password');
    
    fireEvent.click(toggleButton);
    const hideButton = screen.getByLabelText('Hide password');
    expect(hideButton).toHaveAttribute('aria-label', 'Hide password');
  });

  it('should have aria-hidden on icons', () => {
    render(<PasswordInput placeholder="Enter password" />);
    
    const eyeIcon = screen.getByTestId('eye-icon');
    expect(eyeIcon).toHaveAttribute('aria-hidden', 'true');
    
    const toggleButton = screen.getByLabelText('Show password');
    fireEvent.click(toggleButton);
    
    const eyeSlashIcon = screen.getByTestId('eye-slash-icon');
    expect(eyeSlashIcon).toHaveAttribute('aria-hidden', 'true');
  });

  it('should apply focus styles to input', () => {
    render(<PasswordInput placeholder="Enter password" />);
    
    const input = screen.getByPlaceholderText('Enter password');
    expect(input).toHaveClass('data-[focus]:ring-blue-500');
    expect(input).toHaveClass('data-[focus]:border-blue-500');
  });

  it('should position toggle button correctly', () => {
    render(<PasswordInput placeholder="Enter password" />);
    
    const container = screen.getByPlaceholderText('Enter password').parentElement;
    expect(container).toHaveClass('relative');
    
    const input = screen.getByPlaceholderText('Enter password');
    expect(input).toHaveClass('pr-10'); // Space for the button
  });

  it('should maintain password value when toggling visibility', () => {
    render(<PasswordInput placeholder="Enter password" />);
    
    const input = screen.getByPlaceholderText('Enter password') as HTMLInputElement;
    const toggleButton = screen.getByLabelText('Show password');
    
    // Type a password
    fireEvent.change(input, { target: { value: 'myPassword123' } });
    expect(input.value).toBe('myPassword123');
    
    // Toggle visibility
    fireEvent.click(toggleButton);
    expect(input.value).toBe('myPassword123');
    expect(input.type).toBe('text');
    
    // Toggle back
    fireEvent.click(screen.getByLabelText('Hide password'));
    expect(input.value).toBe('myPassword123');
    expect(input.type).toBe('password');
  });
});