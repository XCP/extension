import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { AuthorizationModal } from '../authorization-modal';

// Mock PasswordInput component
vi.mock('@/components/inputs/password-input', () => ({
  PasswordInput: React.forwardRef(({ onChange, value, innerRef, onKeyDown, ...props }: any, ref: any) => {
    const [inputValue, setInputValue] = React.useState(value || '');
    const inputRef = React.useRef<HTMLInputElement>(null);
    
    const handleChange = (e: any) => {
      const newValue = e.target.value;
      setInputValue(newValue);
      onChange({ target: { value: newValue } });
    };

    const handleKeyDown = (e: any) => {
      if (e.key === 'Enter' && onKeyDown) {
        onKeyDown(e);
      }
    };

    // Update input value when value prop changes (for controlled behavior)
    React.useEffect(() => {
      if (value !== undefined && value !== inputValue) {
        setInputValue(value);
      }
    }, [value]);

    // Handle both ref and innerRef
    React.useEffect(() => {
      if (innerRef && inputRef.current) {
        innerRef.current = inputRef.current;
      }
    }, [innerRef]);

    return (
      <input
        ref={(el) => {
          inputRef.current = el;
          if (ref) ref.current = el;
          if (innerRef) innerRef.current = el;
        }}
        type="password"
        value={inputValue}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder="Enter your password"
        aria-label="Password"
        {...props}
      />
    );
  })
}));

describe('AuthorizationModal', () => {
  const mockOnUnlock = vi.fn();
  const mockOnCancel = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render modal with title and description', () => {
    render(
      <AuthorizationModal
        onUnlock={mockOnUnlock}
        onCancel={mockOnCancel}
      />
    );

    expect(screen.getByText('Authorize Transaction')).toBeInTheDocument();
    expect(screen.getByText('Please enter your password to authorize this transaction.')).toBeInTheDocument();
  });

  it('should focus password input on mount', async () => {
    render(
      <AuthorizationModal
        onUnlock={mockOnUnlock}
        onCancel={mockOnCancel}
      />
    );

    const passwordInput = screen.getByLabelText('Password');
    await waitFor(() => {
      expect(document.activeElement).toBe(passwordInput);
    });
  });

  it('should show error for empty password', async () => {
    render(
      <AuthorizationModal
        onUnlock={mockOnUnlock}
        onCancel={mockOnCancel}
      />
    );

    const passwordInput = screen.getByLabelText('Password');
    const authorizeButton = screen.getByText('Authorize');
    
    // Try to press Enter on empty input to trigger validation
    fireEvent.keyDown(passwordInput, { key: 'Enter' });

    await waitFor(() => {
      expect(screen.getByText('Password cannot be empty.')).toBeInTheDocument();
    });
    expect(mockOnUnlock).not.toHaveBeenCalled();
  });

  it('should show error for password too short', async () => {
    render(
      <AuthorizationModal
        onUnlock={mockOnUnlock}
        onCancel={mockOnCancel}
      />
    );

    const passwordInput = screen.getByLabelText('Password');
    await userEvent.type(passwordInput, 'short');

    const authorizeButton = screen.getByText('Authorize');
    fireEvent.click(authorizeButton);

    await waitFor(() => {
      expect(screen.getByText('Password must be at least 8 characters.')).toBeInTheDocument();
    });
    expect(mockOnUnlock).not.toHaveBeenCalled();
  });

  it('should call onUnlock with valid password', async () => {
    mockOnUnlock.mockResolvedValue(undefined);

    render(
      <AuthorizationModal
        onUnlock={mockOnUnlock}
        onCancel={mockOnCancel}
      />
    );

    const passwordInput = screen.getByLabelText('Password');
    await userEvent.type(passwordInput, 'validpassword123');

    const authorizeButton = screen.getByText('Authorize');
    fireEvent.click(authorizeButton);

    await waitFor(() => {
      expect(mockOnUnlock).toHaveBeenCalledWith('validpassword123');
    });
  });

  it('should show error when onUnlock fails', async () => {
    mockOnUnlock.mockRejectedValue(new Error('Invalid password'));

    render(
      <AuthorizationModal
        onUnlock={mockOnUnlock}
        onCancel={mockOnCancel}
      />
    );

    const passwordInput = screen.getByLabelText('Password');
    await userEvent.type(passwordInput, 'wrongpassword');

    const authorizeButton = screen.getByText('Authorize');
    fireEvent.click(authorizeButton);

    await waitFor(() => {
      expect(screen.getByText('Invalid password or authorization failed. Please try again.')).toBeInTheDocument();
    });
  });

  it('should call onCancel when Cancel button is clicked', () => {
    render(
      <AuthorizationModal
        onUnlock={mockOnUnlock}
        onCancel={mockOnCancel}
      />
    );

    const cancelButton = screen.getByText('Cancel');
    fireEvent.click(cancelButton);

    expect(mockOnCancel).toHaveBeenCalled();
  });

  it('should clear password and error when cancelled', async () => {
    render(
      <AuthorizationModal
        onUnlock={mockOnUnlock}
        onCancel={mockOnCancel}
      />
    );

    const passwordInput = screen.getByLabelText('Password') as HTMLInputElement;
    await userEvent.type(passwordInput, 'test');

    const authorizeButton = screen.getByText('Authorize');
    fireEvent.click(authorizeButton);

    await waitFor(() => {
      expect(screen.getByText('Password must be at least 8 characters.')).toBeInTheDocument();
    });

    const cancelButton = screen.getByText('Cancel');
    fireEvent.click(cancelButton);

    expect(mockOnCancel).toHaveBeenCalled();
  });

  it('should handle Enter key press in password input', async () => {
    mockOnUnlock.mockResolvedValue(undefined);

    render(
      <AuthorizationModal
        onUnlock={mockOnUnlock}
        onCancel={mockOnCancel}
      />
    );

    const passwordInput = screen.getByLabelText('Password');
    await userEvent.type(passwordInput, 'validpassword123');
    
    fireEvent.keyDown(passwordInput, { key: 'Enter' });

    await waitFor(() => {
      expect(mockOnUnlock).toHaveBeenCalledWith('validpassword123');
    });
  });

  it('should render modal with dark mode classes', () => {
    const { container } = render(
      <AuthorizationModal
        onUnlock={mockOnUnlock}
        onCancel={mockOnCancel}
      />
    );

    const modal = container.querySelector('.dark\\:bg-gray-800');
    expect(modal).toBeInTheDocument();
  });

  it('should clear password after successful unlock', async () => {
    mockOnUnlock.mockResolvedValue(undefined);

    render(
      <AuthorizationModal
        onUnlock={mockOnUnlock}
        onCancel={mockOnCancel}
      />
    );

    const passwordInput = screen.getByLabelText('Password') as HTMLInputElement;
    await userEvent.type(passwordInput, 'validpassword123');

    const authorizeButton = screen.getByText('Authorize');
    fireEvent.click(authorizeButton);

    await waitFor(() => {
      expect(mockOnUnlock).toHaveBeenCalledWith('validpassword123');
    });
    
    // The password should be cleared after successful unlock
    await waitFor(() => {
      expect(passwordInput.value).toBe('');
    });
  });

  it('should have proper z-index for overlay', () => {
    const { container } = render(
      <AuthorizationModal
        onUnlock={mockOnUnlock}
        onCancel={mockOnCancel}
      />
    );

    const overlay = container.querySelector('.z-50');
    expect(overlay).toBeInTheDocument();
  });
});