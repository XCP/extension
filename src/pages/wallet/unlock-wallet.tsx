import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useHeader } from '@/contexts/header-context';
import { useWallet } from '@/contexts/wallet-context';
import { Button } from '@/components/button';
import { PasswordInput } from '@/components/inputs/password-input';

const UnlockWallet = () => {
  const navigate = useNavigate();
  const { unlockWallet, wallets } = useWallet();
  const { setHeaderProps } = useHeader();

  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const passwordInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setHeaderProps({ useLogoTitle: true });
  }, [setHeaderProps]);

  useEffect(() => {
    passwordInputRef.current?.focus();
  }, []);

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPassword(e.target.value);
    setError('');
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      if (!wallets.length) {
        throw new Error('No wallets found.');
      }
      const walletId = wallets[0].id;
      await unlockWallet(walletId, password);
      navigate('/index');
    } catch (err) {
      console.error('Error unlocking wallet:', err);
      const msg = err instanceof Error ? err.message : 'Invalid password or unknown error.';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full" role="main">
      <div className="flex-grow flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-lg shadow-md p-6">
          <h1 className="text-3xl mb-5 flex justify-between items-center">
            <span className="font-bold">XCP Wallet</span>
            <span>v0.0.1</span>
          </h1>
          <form onSubmit={handleSubmit} className="space-y-4">
            <PasswordInput
              id="password"
              inputRef={passwordInputRef}
              value={password}
              onChange={handlePasswordChange}
              placeholder="Enter your password"
              error={error}
              ariaLabel="Password"
            />
            <Button type="submit" fullWidth disabled={isLoading} aria-label="Continue">
              {isLoading ? 'Unlocking...' : 'Continue'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default UnlockWallet;
