import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaExclamationTriangle } from 'react-icons/fa';
import { Button } from '@/components/button';
import { ErrorAlert } from '@/components/error-alert';
import { PasswordInput } from '@/components/inputs/password-input';
import { useHeader } from '@/contexts/header-context';
import { useWallet } from '@/contexts/wallet-context';

/**
 * ResetWallet component allows users to delete all wallet data after password confirmation.
 *
 * Features:
 * - Displays a warning about irreversible data loss
 * - Requires password verification before resetting
 * - Navigates to onboarding on success
 */
function ResetWallet() {
  const navigate = useNavigate();
  const { setHeaderProps } = useHeader();
  const { resetAllWallets, verifyPassword } = useWallet();

  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [submissionError, setSubmissionError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const passwordInputRef = useRef<HTMLInputElement>(null);

  // Constants for paths and validation
  const PATHS = {
    BACK: '/settings',
    SUCCESS: '/onboarding',
  } as const;
  const MIN_PASSWORD_LENGTH = 8;

  // Set up header
  useEffect(() => {
    setHeaderProps({
      title: 'Reset Wallet',
      onBack: () => navigate(PATHS.BACK),
    });
  }, [setHeaderProps, navigate]);

  // Focus password input on mount
  useEffect(() => {
    passwordInputRef.current?.focus();
  }, []);

  const isPasswordValid = (pwd: string): boolean => pwd.length >= MIN_PASSWORD_LENGTH;

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    setPassword(e.target.value);
    setPasswordError('');
    setSubmissionError('');
  };

  const validateForm = async (): Promise<boolean> => {
    setPasswordError('');
    setSubmissionError('');

    if (!password) {
      setPasswordError('Password cannot be empty.');
      return false;
    }
    if (!isPasswordValid(password)) {
      setPasswordError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return false;
    }
    try {
      const isValid = await verifyPassword(password);
      if (!isValid) {
        setPasswordError('Password does not match.');
        return false;
      }
    } catch {
      setPasswordError('Password verification failed.');
      return false;
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (isLoading) return;

    setIsLoading(true);
    try {
      if (await validateForm()) {
        await resetAllWallets(password);
        navigate(PATHS.SUCCESS);
      }
    } catch (err) {
      console.error('Error resetting wallet:', err);
      setSubmissionError('Failed to reset wallet. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className="flex flex-col h-full p-4"
      role="main"
      aria-labelledby="reset-wallet-title"
    >
      <h2 id="reset-wallet-title" className="sr-only text-2xl font-bold mb-2">
        Reset Wallet
      </h2>
      {submissionError && (
        <ErrorAlert message={submissionError} onClose={() => setSubmissionError('')} />
      )}
      <form
        onSubmit={handleSubmit}
        className="flex flex-col items-center justify-center flex-grow"
        aria-describedby="reset-wallet-warning"
      >
        <div
          className="max-w-md w-full bg-red-50 border-2 border-red-500 rounded-xl p-6 mb-6"
          id="reset-wallet-warning"
        >
          <div className="flex items-center mb-4">
            <FaExclamationTriangle
              className="w-6 h-6 text-red-500 mr-2"
              aria-hidden="true"
            />
            <h3 className="text-xl font-bold text-red-700">Warning</h3>
          </div>
          <p className="text-red-700 font-medium leading-relaxed">
            Resetting your wallet will delete all wallet data. This action cannot be undone.
          </p>
        </div>
        <div className="w-full max-w-md space-y-4">
          <PasswordInput
            id="password"
            ref={passwordInputRef}
            value={password}
            onChange={handlePasswordChange}
            placeholder="Confirm your password"
            error={passwordError}
            ariaLabel="Password confirmation"
            variant="warning"
            disabled={isLoading}
          />
          <Button
            type="submit"
            disabled={isLoading || !isPasswordValid(password)}
            fullWidth
            color="red"
            aria-label="Reset Wallet"
          >
            {isLoading ? 'Resetting...' : 'Reset Wallet'}
          </Button>
        </div>
      </form>
    </div>
  );
}

export default ResetWallet;
