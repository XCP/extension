import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiHelpCircle } from 'react-icons/fi';
import { Button } from '@/components/button';
import { PasswordInput } from '@/components/inputs/password-input';
import { useHeader } from '@/contexts/header-context';
import { useWallet } from '@/contexts/wallet-context';

/**
 * UnlockWallet component prompts users to unlock their wallet with a password.
 *
 * Features:
 * - Displays a password input and unlock button
 * - Provides a help link in the header
 * - Navigates to the index on successful unlock
 */
const UnlockWallet = () => {
  const navigate = useNavigate();
  const { unlockWallet, wallets } = useWallet();
  const { setHeaderProps } = useHeader();

  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [isLoading, setIsLoading] = useState(false);

  const passwordInputRef = useRef<HTMLInputElement>(null);

  // Constants for paths and validation
  const PATHS = {
    SUCCESS: '/index',
    HELP_URL: 'https://youtube.com', // Replace with actual help URL
  } as const;
  const MIN_PASSWORD_LENGTH = 8;

  // Configure header with help button
  useEffect(() => {
    setHeaderProps({
      useLogoTitle: true,
      rightButton: {
        icon: <FiHelpCircle className="w-4 h-4" aria-hidden="true" />,
        onClick: () => window.open(PATHS.HELP_URL, '_blank'),
        ariaLabel: 'Help',
      },
    });
  }, [setHeaderProps]);

  // Focus password input on mount
  useEffect(() => {
    passwordInputRef.current?.focus();
  }, []);

  const isPasswordValid = (pwd: string): boolean => pwd.length >= MIN_PASSWORD_LENGTH;

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPassword(e.target.value);
    setError('');
  };

  const validateForm = (): boolean => {
    if (!password) {
      setError('Password cannot be empty.');
      return false;
    }
    if (!isPasswordValid(password)) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return false;
    }
    return true;
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isLoading || !validateForm()) return;

    setIsLoading(true);
    try {
      if (!wallets.length) {
        throw new Error('No wallets found.');
      }
      const walletId = wallets[0].id;
      await unlockWallet(walletId, password);
      navigate(PATHS.SUCCESS);
    } catch (err) {
      console.error('Error unlocking wallet:', err);
      setError('Invalid password. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className="flex flex-col h-full"
      role="main"
      aria-labelledby="unlock-wallet-title"
    >
      <div className="flex-grow flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-lg shadow-md p-6">
          <h1
            id="unlock-wallet-title"
            className="text-3xl mb-5 flex justify-between items-center"
          >
            <span className="font-bold">XCP Wallet</span>
            <span>v0.0.1</span>
          </h1>
          <form onSubmit={handleSubmit} className="space-y-4">
            <PasswordInput
              id="password"
              ref={passwordInputRef}
              value={password}
              onChange={handlePasswordChange}
              placeholder="Enter your password"
              error={error}
              ariaLabel="Password entry"
              disabled={isLoading}
            />
            <Button
              type="submit"
              fullWidth
              disabled={isLoading}
              aria-label="Unlock Wallet"
            >
              {isLoading ? 'Unlocking...' : 'Unlock'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default UnlockWallet;
