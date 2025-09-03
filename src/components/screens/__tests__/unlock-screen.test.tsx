import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { UnlockScreen } from '../unlock-screen';

describe('UnlockScreen', () => {
  const mockOnUnlock = vi.fn();
  const mockOnCancel = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render with default props', () => {
      render(<UnlockScreen onUnlock={mockOnUnlock} />);
      
      expect(screen.getByText('Unlock Wallet')).toBeInTheDocument();
      expect(screen.getByText('Enter your password to continue')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Enter your password')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Unlock' })).toBeInTheDocument();
    });

    it('should render with custom title and subtitle', () => {
      render(
        <UnlockScreen
          onUnlock={mockOnUnlock}
          title="Custom Title"
          subtitle="Custom subtitle text"
        />
      );
      
      expect(screen.getByText('Custom Title')).toBeInTheDocument();
      expect(screen.getByText('Custom subtitle text')).toBeInTheDocument();
    });

    it('should show lock icon when showLockIcon is true', () => {
      render(<UnlockScreen onUnlock={mockOnUnlock} showLockIcon />);
      
      const lockIconContainer = screen.getByText('Unlock Wallet').parentElement?.parentElement;
      expect(lockIconContainer?.querySelector('svg')).toBeInTheDocument();
    });

    it('should show cancel button when onCancel is provided', () => {
      render(<UnlockScreen onUnlock={mockOnUnlock} onCancel={mockOnCancel} />);
      
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    });

    it('should not show cancel button when onCancel is not provided', () => {
      render(<UnlockScreen onUnlock={mockOnUnlock} />);
      
      expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
    });

    it('should display custom submit button text', () => {
      render(<UnlockScreen onUnlock={mockOnUnlock} submitText="Authorize" />);
      
      expect(screen.getByRole('button', { name: 'Authorize' })).toBeInTheDocument();
    });

    it('should display help text at the bottom', () => {
      render(<UnlockScreen onUnlock={mockOnUnlock} />);
      
      expect(screen.getByText(/Your password is never stored/)).toBeInTheDocument();
    });
  });

  describe('Form Validation', () => {
    it('should disable submit button when password is empty', () => {
      render(<UnlockScreen onUnlock={mockOnUnlock} />);
      
      const submitButton = screen.getByRole('button', { name: 'Unlock' });
      expect(submitButton).toBeDisabled();
      expect(mockOnUnlock).not.toHaveBeenCalled();
    });

    it('should show error for password shorter than minimum length', async () => {
      const user = userEvent.setup();
      render(<UnlockScreen onUnlock={mockOnUnlock} minPasswordLength={8} />);
      
      const passwordInput = screen.getByPlaceholderText('Enter your password');
      await user.type(passwordInput, 'short');
      
      const submitButton = screen.getByRole('button', { name: 'Unlock' });
      expect(submitButton).toBeEnabled(); // Button is enabled once password is entered
      await user.click(submitButton);
      
      await waitFor(() => {
        expect(screen.getByText('Password must be at least 8 characters.')).toBeInTheDocument();
      });
      expect(mockOnUnlock).not.toHaveBeenCalled();
    });

    it('should use custom minimum password length', async () => {
      const user = userEvent.setup();
      render(<UnlockScreen onUnlock={mockOnUnlock} minPasswordLength={12} />);
      
      const passwordInput = screen.getByPlaceholderText('Enter your password');
      await user.type(passwordInput, 'shortpass');
      
      const submitButton = screen.getByRole('button', { name: 'Unlock' });
      expect(submitButton).toBeEnabled();
      await user.click(submitButton);
      
      await waitFor(() => {
        expect(screen.getByText('Password must be at least 12 characters.')).toBeInTheDocument();
      });
    });
  });

  describe('Form Submission', () => {
    it('should call onUnlock with password when valid', async () => {
      const user = userEvent.setup();
      mockOnUnlock.mockResolvedValue(undefined);
      
      render(<UnlockScreen onUnlock={mockOnUnlock} />);
      
      const passwordInput = screen.getByPlaceholderText('Enter your password');
      await user.type(passwordInput, 'validpassword123');
      
      const submitButton = screen.getByRole('button', { name: 'Unlock' });
      await user.click(submitButton);
      
      await waitFor(() => {
        expect(mockOnUnlock).toHaveBeenCalledWith('validpassword123');
      });
    });

    it('should handle Enter key submission', async () => {
      const user = userEvent.setup();
      mockOnUnlock.mockResolvedValue(undefined);
      
      render(<UnlockScreen onUnlock={mockOnUnlock} />);
      
      const passwordInput = screen.getByPlaceholderText('Enter your password');
      await user.type(passwordInput, 'validpassword123');
      await user.keyboard('{Enter}');
      
      await waitFor(() => {
        expect(mockOnUnlock).toHaveBeenCalledWith('validpassword123');
      });
    });

    it('should display error when onUnlock throws', async () => {
      const user = userEvent.setup();
      mockOnUnlock.mockRejectedValue(new Error('Invalid credentials'));
      
      render(<UnlockScreen onUnlock={mockOnUnlock} />);
      
      const passwordInput = screen.getByPlaceholderText('Enter your password');
      await user.type(passwordInput, 'wrongpassword');
      
      const submitButton = screen.getByRole('button', { name: 'Unlock' });
      await user.click(submitButton);
      
      await waitFor(() => {
        expect(screen.getByText('Invalid credentials')).toBeInTheDocument();
      });
    });

    it('should display generic error for non-Error throws', async () => {
      const user = userEvent.setup();
      mockOnUnlock.mockRejectedValue('Some string error');
      
      render(<UnlockScreen onUnlock={mockOnUnlock} />);
      
      const passwordInput = screen.getByPlaceholderText('Enter your password');
      await user.type(passwordInput, 'password123');
      
      const submitButton = screen.getByRole('button', { name: 'Unlock' });
      await user.click(submitButton);
      
      await waitFor(() => {
        expect(screen.getByText('Invalid password. Please try again.')).toBeInTheDocument();
      });
    });

    it('should clear password after successful unlock', async () => {
      const user = userEvent.setup();
      mockOnUnlock.mockResolvedValue(undefined);
      
      render(<UnlockScreen onUnlock={mockOnUnlock} />);
      
      const passwordInput = screen.getByPlaceholderText('Enter your password') as HTMLInputElement;
      await user.type(passwordInput, 'validpassword123');
      
      expect(passwordInput.value).toBe('validpassword123');
      
      const submitButton = screen.getByRole('button', { name: 'Unlock' });
      await user.click(submitButton);
      
      await waitFor(() => {
        expect(passwordInput.value).toBe('');
      });
    });
  });

  describe('Loading State', () => {
    it('should show loading text when isSubmitting is true', () => {
      render(<UnlockScreen onUnlock={mockOnUnlock} isSubmitting />);
      
      expect(screen.getByText('Unlocking...')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Unlocking...' })).toBeDisabled();
    });

    it('should disable input when isSubmitting is true', () => {
      render(<UnlockScreen onUnlock={mockOnUnlock} isSubmitting />);
      
      const passwordInput = screen.getByPlaceholderText('Enter your password');
      expect(passwordInput).toBeDisabled();
    });

    it('should prevent Enter key submission when isSubmitting', async () => {
      const user = userEvent.setup();
      render(<UnlockScreen onUnlock={mockOnUnlock} isSubmitting />);
      
      const passwordInput = screen.getByPlaceholderText('Enter your password');
      
      // Try to type and press Enter (should not work because input is disabled)
      fireEvent.keyDown(passwordInput, { key: 'Enter' });
      
      expect(mockOnUnlock).not.toHaveBeenCalled();
    });
  });

  describe('Cancel Functionality', () => {
    it('should call onCancel when cancel button is clicked', async () => {
      const user = userEvent.setup();
      render(<UnlockScreen onUnlock={mockOnUnlock} onCancel={mockOnCancel} />);
      
      const cancelButton = screen.getByRole('button', { name: 'Cancel' });
      await user.click(cancelButton);
      
      expect(mockOnCancel).toHaveBeenCalled();
    });

    it('should clear password when cancelled', async () => {
      const user = userEvent.setup();
      render(<UnlockScreen onUnlock={mockOnUnlock} onCancel={mockOnCancel} />);
      
      const passwordInput = screen.getByPlaceholderText('Enter your password') as HTMLInputElement;
      await user.type(passwordInput, 'somepassword');
      
      expect(passwordInput.value).toBe('somepassword');
      
      const cancelButton = screen.getByRole('button', { name: 'Cancel' });
      await user.click(cancelButton);
      
      expect(passwordInput.value).toBe('');
    });

    it('should clear error when cancelled', async () => {
      const user = userEvent.setup();
      render(<UnlockScreen onUnlock={mockOnUnlock} onCancel={mockOnCancel} />);
      
      // Type a short password to trigger an error
      const passwordInput = screen.getByPlaceholderText('Enter your password');
      await user.type(passwordInput, 'short');
      
      const submitButton = screen.getByRole('button', { name: 'Unlock' });
      await user.click(submitButton);
      
      await waitFor(() => {
        expect(screen.getByText('Password must be at least 8 characters.')).toBeInTheDocument();
      });
      
      // Cancel should clear the error
      const cancelButton = screen.getByRole('button', { name: 'Cancel' });
      await user.click(cancelButton);
      
      expect(screen.queryByText('Password must be at least 8 characters.')).not.toBeInTheDocument();
    });
  });

  describe('External Error Handling', () => {
    it('should display external error when provided', () => {
      render(<UnlockScreen onUnlock={mockOnUnlock} error="External error message" />);
      
      expect(screen.getByText('External error message')).toBeInTheDocument();
    });

    it('should prioritize external error over internal validation', async () => {
      const user = userEvent.setup();
      const { rerender } = render(<UnlockScreen onUnlock={mockOnUnlock} />);
      
      // Type a short password to trigger internal error
      const passwordInput = screen.getByPlaceholderText('Enter your password');
      await user.type(passwordInput, 'short');
      
      const submitButton = screen.getByRole('button', { name: 'Unlock' });
      await user.click(submitButton);
      
      await waitFor(() => {
        expect(screen.getByText('Password must be at least 8 characters.')).toBeInTheDocument();
      });
      
      // Now provide external error
      rerender(<UnlockScreen onUnlock={mockOnUnlock} error="External error" />);
      
      expect(screen.queryByText('Password must be at least 8 characters.')).not.toBeInTheDocument();
      expect(screen.getByText('External error')).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA attributes', () => {
      render(<UnlockScreen onUnlock={mockOnUnlock} />);
      
      const passwordInput = screen.getByPlaceholderText('Enter your password');
      expect(passwordInput).toHaveAttribute('name', 'password');
      expect(passwordInput).not.toHaveAttribute('aria-invalid');
    });

    it('should set aria-invalid when error exists', async () => {
      const user = userEvent.setup();
      render(<UnlockScreen onUnlock={mockOnUnlock} />);
      
      const passwordInput = screen.getByPlaceholderText('Enter your password');
      await user.type(passwordInput, 'short');
      
      const submitButton = screen.getByRole('button', { name: 'Unlock' });
      await user.click(submitButton);
      
      await waitFor(() => {
        const input = screen.getByPlaceholderText('Enter your password');
        expect(input).toHaveAttribute('aria-invalid', 'true');
      });
    });

    it('should have proper role for error messages', async () => {
      const user = userEvent.setup();
      render(<UnlockScreen onUnlock={mockOnUnlock} />);
      
      const passwordInput = screen.getByPlaceholderText('Enter your password');
      await user.type(passwordInput, 'short');
      
      const submitButton = screen.getByRole('button', { name: 'Unlock' });
      await user.click(submitButton);
      
      await waitFor(() => {
        const errorAlert = screen.getByRole('alert');
        expect(errorAlert).toHaveTextContent('Password must be at least 8 characters.');
      });
    });

    it('should auto-focus password input on mount', () => {
      render(<UnlockScreen onUnlock={mockOnUnlock} />);
      
      const passwordInput = screen.getByPlaceholderText('Enter your password');
      expect(document.activeElement).toBe(passwordInput);
    });
  });

  describe('Custom Props', () => {
    it('should apply custom className', () => {
      render(<UnlockScreen onUnlock={mockOnUnlock} className="custom-class" />);
      
      const container = screen.getByText('Unlock Wallet').closest('.flex.flex-col');
      expect(container).toHaveClass('custom-class');
    });

    it('should use custom placeholder text', () => {
      render(<UnlockScreen onUnlock={mockOnUnlock} placeholder="Custom placeholder" />);
      
      expect(screen.getByPlaceholderText('Custom placeholder')).toBeInTheDocument();
    });
  });
});