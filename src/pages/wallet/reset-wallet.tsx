import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaExclamationTriangle } from 'react-icons/fa';
import { Button } from '@/components/button';
import { ErrorAlert } from '@/components/error-alert';
import { PasswordInput } from '@/components/inputs/password-input';
import { useHeader } from '@/contexts/header-context';
import { useWallet } from '@/contexts/wallet-context';

function ResetWallet() {
  const navigate = useNavigate();
  const { setHeaderProps } = useHeader();
  const { resetAllWallets, verifyPassword } = useWallet();
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [submissionError, setSubmissionError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const passwordInputRef = useRef<HTMLInputElement>(null);

  const isPasswordValid = (pwd: string): boolean => pwd.length >= 8;

  useEffect(() => {
    setHeaderProps({
      title: 'Reset Wallet',
      onBack: () => navigate('/settings'),
    });
  }, [setHeaderProps, navigate]);

  useEffect(() => {
    passwordInputRef.current?.focus();
  }, []);

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    setPassword(e.target.value);
    setPasswordError('');
    setSubmissionError('');
  };

  const validateForm = async (): Promise<boolean> => {
    if (!password) {
      setPasswordError('Password cannot be empty.');
      return false;
    }
    if (!isPasswordValid(password)) {
      setPasswordError('Password must be at least 8 characters.');
      return false;
    }
    try {
      await verifyPassword(password);
    } catch {
      setPasswordError('Password does not match.');
      return false;
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setSubmissionError('');
    setPasswordError('');
    const isValid = await validateForm();
    if (!isValid) return;
    setIsLoading(true);
    try {
      await resetAllWallets(password);
      navigate('/onboarding');
    } catch (err) {
      console.error('Error resetting wallet:', err);
      setSubmissionError('Failed to reset wallet.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full p-4" role="main" aria-labelledby="reset-wallet-title">
      <h2 id="reset-wallet-title" className="sr-only">Reset Wallet</h2>
      {submissionError && (
        <ErrorAlert message={submissionError} onClose={() => setSubmissionError('')} />
      )}
      <form onSubmit={handleSubmit} className="flex flex-col items-center justify-center flex-grow">
        <div className="max-w-md w-full bg-red-50 border-2 border-red-500 rounded-xl p-6 mb-6">
          <div className="flex items-center mb-4">
            <FaExclamationTriangle className="w-6 h-6 text-red-500 mr-2" aria-hidden="true" />
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
            ariaLabel="Password"
            variant="warning"
          />
          <Button
            type="submit"
            disabled={isLoading}
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
