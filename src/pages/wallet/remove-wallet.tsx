import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FaExclamationTriangle } from 'react-icons/fa';
import { Button } from '@/components/button';
import { ErrorAlert } from '@/components/error-alert';
import { PasswordInput } from '@/components/inputs/password-input';
import { useHeader } from '@/contexts/header-context';
import { useWallet } from '@/contexts/wallet-context';

function RemoveWallet() {
  const { walletId } = useParams<{ walletId: string }>();
  const navigate = useNavigate();
  const { setHeaderProps } = useHeader();
  const { wallets, setActiveWallet, setActiveAddress, activeWallet, removeWallet, verifyPassword } = useWallet();

  const [walletName, setWalletName] = useState('');
  const [walletType, setWalletType] = useState<'mnemonic' | 'privateKey'>('mnemonic');
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [submissionError, setSubmissionError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const passwordInputRef = useRef<HTMLInputElement>(null);

  // Move wallet lookup to a ref to prevent unnecessary re-renders
  const wallet = wallets.find(w => w.id === walletId);

  const isPasswordValid = (pwd: string): boolean => pwd.length >= 8;

  useEffect(() => {
    if (!walletId) {
      setSubmissionError('Invalid wallet identifier.');
      return;
    }
    
    // Only set error if we're not in the process of removing the wallet
    if (!isLoading && !wallet) {
      setSubmissionError('Wallet not found.');
      return;
    }

    if (wallet) {
      setWalletName(wallet.name);
      setWalletType(wallet.type);
      setHeaderProps({
        title: wallet.type === 'privateKey' ? 'Remove Address' : 'Remove Wallet',
        onBack: () => navigate(-1),
      });
    }
  }, [walletId, wallets, setHeaderProps, navigate, isLoading, wallet]);

  useEffect(() => {
    passwordInputRef.current?.focus();
  }, []);

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    setPassword(e.target.value);
    setPasswordError('');
    setSubmissionError('');
  };

  const validateForm = async (): Promise<boolean> => {
    if (!walletId) {
      setSubmissionError('Invalid wallet identifier.');
      return false;
    }
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
    setPasswordError('');
    setSubmissionError('');
    const isValid = await validateForm();
    if (!isValid) return;
    
    setIsLoading(true);
    try {
      const remainingWallets = wallets.filter(w => w.id !== walletId);
      if (activeWallet?.id === walletId) {
        if (remainingWallets.length > 0) {
          setActiveWallet(remainingWallets[0]);
          setActiveAddress(remainingWallets[0].addresses[0] || null);
        } else {
          setActiveWallet(null);
          setActiveAddress(null);
        }
      }
      
      await removeWallet(walletId!);
      // Immediately navigate after successful removal
      navigate('/select-wallet', { replace: true });
    } catch (err) {
      console.error('Error removing wallet:', err);
      setSubmissionError('Failed to remove wallet.');
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full p-4" role="main" aria-labelledby="remove-wallet-title">
      <h2 id="remove-wallet-title" className="sr-only">
        {walletType === 'privateKey' ? 'Remove Address' : 'Remove Wallet'}
      </h2>
      {submissionError && (
        <ErrorAlert message={submissionError} onClose={() => setSubmissionError('')} />
      )}
      <form onSubmit={handleSubmit} className="flex flex-col items-center justify-center flex-grow">
        <div className="max-w-md w-full bg-red-50 border-2 border-red-500 rounded-xl p-6 mb-6">
          <div className="flex items-center mb-4">
            <FaExclamationTriangle className="w-6 h-6 text-red-500 mr-2" aria-hidden="true" />
            <h3 className="text-xl font-bold text-red-700">
              {walletType === 'privateKey' ? 'Remove Address' : 'Remove Wallet'}
            </h3>
          </div>
          <p className="text-red-700 font-medium leading-relaxed">
            Make sure you have backed up your wallet or private key before removing it.
          </p>
        </div>
        <div className="w-full max-w-md space-y-4">
          <PasswordInput
            id="password"
            value={password}
            onChange={handlePasswordChange}
            placeholder="Confirm your password"
            error={passwordError}
            ariaLabel="Password"
            variant="warning"
            ref={passwordInputRef}
          />
          <Button
            type="submit"
            disabled={isLoading}
            fullWidth
            color="red"
            aria-label={walletType === 'privateKey' ? 'Remove Private Key' : `Remove ${walletName}`}
          >
            {isLoading
              ? 'Removing...'
              : walletType === 'privateKey'
              ? 'Remove Private Key'
              : `Remove ${walletName}`}
          </Button>
        </div>
      </form>
    </div>
  );
}

export default RemoveWallet;
