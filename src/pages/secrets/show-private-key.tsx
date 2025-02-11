import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FaExclamationTriangle } from 'react-icons/fa';
import { useHeader } from '@/contexts/header-context';
import { getWalletService } from '@/services/walletService';
import { Button } from '@/components/button';
import { ErrorAlert } from '@/components/error-alert';
import { PasswordInput } from '@/components/inputs/password-input';

const ShowPrivateKey = () => {
  const { walletId, addressPath } = useParams<{ walletId: string; addressPath?: string }>();
  const navigate = useNavigate();
  const { setHeaderProps } = useHeader();
  const walletService = getWalletService();

  const [password, setPassword] = useState('');
  const [privateKey, setPrivateKey] = useState('');
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [submissionError, setSubmissionError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [walletType, setWalletType] = useState<'mnemonic' | 'privateKey' | null>(null);
  const [copiedToClipboard, setCopiedToClipboard] = useState(false);
  const passwordInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const fetchWalletType = async () => {
      if (!walletId) return;
      try {
        const wallet = await walletService.getWalletById(walletId);
        if (!wallet) {
          setSubmissionError('Wallet not found.');
          return;
        }
        setWalletType(wallet.type);
      } catch (err) {
        console.error('Error fetching wallet:', err);
        setSubmissionError('Failed to fetch wallet information.');
      }
    };
    fetchWalletType();

    setHeaderProps({
      title: 'Show Private Key',
      onBack: () => navigate(-1),
    });
  }, [walletId, setHeaderProps, navigate, walletService]);

  useEffect(() => {
    passwordInputRef.current?.focus();
  }, []);

  const isPasswordValid = (pwd: string): boolean => pwd.length >= 8;

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    setPassword(e.target.value);
    setPasswordError('');
    setSubmissionError('');
  };

  const validateForm = async (): Promise<boolean> => {
    if (!walletId) {
      setSubmissionError('Invalid wallet.');
      return false;
    }
    if (!password) {
      setPasswordError('Password is required.');
      return false;
    }
    if (!isPasswordValid(password)) {
      setPasswordError('Password must be at least 8 characters.');
      return false;
    }
    try {
      await walletService.verifyPassword(password);
    } catch {
      setPasswordError('Incorrect password.');
      return false;
    }
    if (walletType === 'mnemonic' && !addressPath) {
      setSubmissionError('Invalid address path.');
      return false;
    }
    return true;
  };

  const revealPrivateKey = async (): Promise<void> => {
    setIsLoading(true);
    try {
      if (!walletId) throw new Error('Wallet ID is required.');
      await walletService.unlockWallet(walletId, password);
      let privKey: string;
      if (walletType === 'privateKey') {
        privKey = await walletService.getPrivateKey(walletId);
      } else {
        privKey = await walletService.getPrivateKey(walletId, decodeURIComponent(addressPath!));
      }
      setPrivateKey(privKey);
      setIsConfirmed(true);
    } catch (err) {
      console.error('Error revealing private key:', err);
      setSubmissionError('Failed to reveal private key.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setSubmissionError('');
    setPasswordError('');
    const valid = await validateForm();
    if (!valid) return;
    await revealPrivateKey();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleCopyPrivateKey();
    }
  };

  const handleCopyPrivateKey = async () => {
    try {
      await navigator.clipboard.writeText(privateKey);
      setCopiedToClipboard(true);
    } catch (error) {
      console.error('Failed to copy private key:', error);
    }
  };

  useEffect(() => {
    if (copiedToClipboard) {
      const timer = setTimeout(() => {
        setCopiedToClipboard(false);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [copiedToClipboard]);

  return (
    <div className="flex flex-col h-full p-4" role="main" aria-labelledby="show-private-key-title">
      <h2 id="show-private-key-title" className="sr-only">
        Show Private Key
      </h2>
      {submissionError && (
        <ErrorAlert message={submissionError} onClose={() => setSubmissionError('')} />
      )}
      {!isConfirmed ? (
        <form onSubmit={handleSubmit} className="flex flex-col items-center justify-center flex-grow">
          <div className="max-w-md w-full bg-red-50 border-2 border-red-500 rounded-xl p-6 mb-6">
            <div className="flex items-center mb-4">
              <FaExclamationTriangle className="w-6 h-6 text-red-500 mr-2" aria-hidden="true" />
              <h3 className="text-xl font-bold text-red-700">Warning</h3>
            </div>
            <p className="text-red-700 font-medium leading-relaxed">
              Your private key is highly sensitive. Do not share it with anyone.
            </p>
          </div>
          <div className="w-full max-w-md space-y-4">
            <PasswordInput
              id="password"
              ref={passwordInputRef}
              value={password}
              onChange={handlePasswordChange}
              placeholder="Enter your password"
              error={passwordError}
              ariaLabel="Password"
              variant="warning"
            />
            <Button
              type="submit"
              disabled={isLoading}
              fullWidth
              color="red"
              aria-label="Reveal Private Key"
            >
              {isLoading ? 'Verifying...' : 'Reveal Private Key'}
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-col items-center justify-center flex-grow">
          <div className="w-full max-w-md space-y-4">
            <div className="text-center mb-6">
              <h3 className="text-2xl font-bold text-gray-800 mb-2">Your Private Key</h3>
              <p className="text-sm text-gray-600">
                Click the key below to copy it. Keep it secret.
              </p>
            </div>
            <div
              onClick={handleCopyPrivateKey}
              onKeyDown={handleKeyDown}
              role="button"
              tabIndex={0}
              aria-label="Copy Private Key"
              className="font-mono text-sm bg-white border border-gray-200 rounded-lg p-4 break-all text-gray-800 select-all cursor-pointer hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors duration-200"
            >
              {privateKey}
            </div>
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <div className="flex items-center space-x-2 mb-2">
                <FaExclamationTriangle className="w-5 h-5 text-red-500" aria-hidden="true" />
                <p className="text-sm font-bold text-red-800">Security Notice</p>
              </div>
              <p className="text-sm text-red-700">
                Never share your private key with anyone.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ShowPrivateKey;
