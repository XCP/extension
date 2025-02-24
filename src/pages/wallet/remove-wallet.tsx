import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FaExclamationTriangle } from 'react-icons/fa';
import { Button } from '@/components/button';
import { ErrorAlert } from '@/components/error-alert';
import { PasswordInput } from '@/components/inputs/password-input';
import { useHeader } from '@/contexts/header-context';
import { useWallet } from '@/contexts/wallet-context';

/**
 * RemoveWallet component allows users to delete a wallet after password confirmation.
 *
 * Features:
 * - Displays a warning about backing up the wallet
 * - Requires password verification before removal
 * - Updates active wallet/address and navigates on success
 */
function RemoveWallet() {
  const { walletId } = useParams<{ walletId: string }>();
  const navigate = useNavigate();
  const { setHeaderProps } = useHeader();
  const { wallets, setActiveWallet, setActiveAddress, activeWallet, removeWallet, verifyPassword } =
    useWallet();

  const [walletName, setWalletName] = useState('');
  const [walletType, setWalletType] = useState<'mnemonic' | 'privateKey'>('mnemonic');
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [submissionError, setSubmissionError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const passwordInputRef = useRef<HTMLInputElement>(null);

  // Constants for paths and validation
  const PATHS = {
    BACK: -1, // Using -1 for navigate(-1)
    SUCCESS: '/select-wallet',
  } as const;
  const MIN_PASSWORD_LENGTH = 8;

  // Set up header and wallet details
  useEffect(() => {
    const wallet = wallets.find((w) => w.id === walletId);
    if (!walletId || !wallet) {
      setSubmissionError(walletId ? 'Wallet not found.' : 'Invalid wallet identifier.');
      setIsLoading(false);
      return;
    }

    setWalletName(wallet.name);
    setWalletType(wallet.type);
    setHeaderProps({
      title: 'Remove Wallet',
      onBack: () => navigate(PATHS.BACK),
    });
  }, [walletId, wallets, setHeaderProps, navigate]);

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

    if (!walletId) {
      setSubmissionError('Invalid wallet identifier.');
      return false;
    }
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
        const remainingWallets = wallets.filter((w) => w.id !== walletId);
        if (activeWallet?.id === walletId) {
          if (remainingWallets.length > 0) {
            await setActiveWallet(remainingWallets[0]);
          } else {
            await setActiveWallet(null);
          }
        }

        await removeWallet(walletId!);
        navigate(PATHS.SUCCESS, { replace: true });
      }
    } catch (err) {
      console.error('Error removing wallet:', err);
      setSubmissionError('Failed to remove wallet. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className="flex flex-col h-full p-4"
      role="main"
      aria-labelledby="remove-wallet-title"
    >
      <h2 id="remove-wallet-title" className="sr-only text-2xl font-bold mb-2">
        Remove Wallet
      </h2>
      {submissionError && (
        <ErrorAlert message={submissionError} onClose={() => setSubmissionError('')} />
      )}
      <form
        onSubmit={handleSubmit}
        className="flex flex-col items-center justify-center flex-grow"
        aria-describedby="remove-wallet-warning"
      >
        <div
          className="max-w-md w-full bg-red-50 border-2 border-red-500 rounded-xl p-6 mb-6"
          id="remove-wallet-warning"
        >
          <div className="flex items-center mb-4">
            <FaExclamationTriangle
              className="w-6 h-6 text-red-500 mr-2"
              aria-hidden="true"
            />
            <h3 className="text-xl font-bold text-red-700">Warning</h3>
          </div>
          <p className="text-red-700 font-medium leading-relaxed">
            Make sure you have backed up your wallet's{' '}
            {walletType === 'mnemonic' ? 'mnemonic' : 'private key'} before removing it.
          </p>
        </div>
        <div className="w-full max-w-md space-y-4">
          <PasswordInput
            id="password"
            value={password}
            onChange={handlePasswordChange}
            placeholder="Confirm your password"
            error={passwordError}
            ariaLabel="Password confirmation"
            variant="warning"
            ref={passwordInputRef}
            disabled={isLoading}
          />
          <Button
            type="submit"
            disabled={isLoading || !isPasswordValid(password)}
            fullWidth
            color="red"
            aria-label={`Remove ${walletName || 'wallet'}`}
          >
            {isLoading ? 'Removing...' : `Remove ${walletName || 'Wallet'}`}
          </Button>
        </div>
      </form>
    </div>
  );
}

export default RemoveWallet;
