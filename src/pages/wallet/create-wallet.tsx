import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaSync, FaEyeSlash } from 'react-icons/fa';
import { Button } from '@/components/button';
import { CheckboxInput } from '@/components/inputs/checkbox-input';
import { PasswordInput } from '@/components/inputs/password-input';
import { useHeader } from '@/contexts/header-context';
import { useToast } from '@/contexts/toast-context';
import { useWallet } from '@/contexts/wallet-context';
import { generateNewMnemonic } from '@/utils/blockchain/bitcoin';

function CreateWallet() {
  const navigate = useNavigate();
  const { setHeaderProps } = useHeader();
  const { wallets, createAndUnlockMnemonicWallet, verifyPassword } = useWallet();
  const { showError, clearAll } = useToast();
  const walletExists = wallets.length > 0;

  const [mnemonic, setMnemonic] = useState('');
  const [mnemonicWords, setMnemonicWords] = useState<string[]>([]);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [isRecoveryPhraseVisible, setIsRecoveryPhraseVisible] = useState(false);
  const [password, setPassword] = useState('');

  function generateWallet() {
    const newMnemonic = generateNewMnemonic();
    setMnemonic(newMnemonic);
    setMnemonicWords(newMnemonic.split(' '));
    setIsConfirmed(false);
    setPassword('');
  }

  useEffect(() => {
    if (!mnemonic) {
      generateWallet();
    }
    
    setHeaderProps({
      title: 'Create Wallet',
      onBack: () => navigate(walletExists ? '/add-wallet' : '/onboarding'),
      rightButton: {
        icon: <FaSync aria-hidden="true" />,
        onClick: generateWallet,
        ariaLabel: 'Generate new recovery phrase',
      },
    });
  }, [navigate, walletExists, setHeaderProps, mnemonic]);

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPassword(e.target.value);
  };

  const handleCheckboxChange = (checked: boolean) => {
    if (!isRecoveryPhraseVisible) return;
    setIsConfirmed(checked);
  };

  const handleRecoveryPhraseClick = () => {
    setIsRecoveryPhraseVisible(true);
  };

  function isPasswordValid(pw: string) {
    return pw.length >= 8;
  }

  async function validateForm(): Promise<boolean> {
    if (!isRecoveryPhraseVisible) {
      showError('Please view and save your recovery phrase first.');
      return false;
    }
    if (!isConfirmed) {
      showError('Please confirm you have backed up your recovery phrase.');
      return false;
    }
    if (!password) {
      showError('Password is required.');
      return false;
    }
    if (walletExists) {
      const isValid = await verifyPassword(password);
      if (!isValid) {
        showError('Password does not match.');
        return false;
      }
    } else if (!isPasswordValid(password)) {
      showError('Password must be at least 8 characters long.');
      return false;
    }
    return true;
  }

  async function handleSubmit(e?: React.FormEvent<HTMLFormElement>) {
    if (e) e.preventDefault();
    if (await validateForm()) {
      try {
        clearAll();
        await createAndUnlockMnemonicWallet(mnemonic, password);
        navigate('/index');
      } catch (err: unknown) {
        console.error('Error creating wallet:', err);
        showError('Failed to create wallet. Please try again.');
      }
    }
  }

  return (
    <div className="flex-grow overflow-y-auto p-4" role="main" aria-labelledby="create-wallet-title">
      <div className="w-full max-w-md mx-auto bg-white rounded-lg shadow-md p-6">
        <h2 id="create-wallet-title" className="text-2xl font-bold mb-2">
          Your Recovery Phrase
        </h2>
        <p className="mb-5">Please write down this 12-word secret phrase.</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="bg-gray-100 p-2 rounded-md mb-4 relative">
            <div className={!isRecoveryPhraseVisible ? 'bg-gray-100 opacity-50 filter blur-sm transition-filter' : ''}>
              <ol className="list-none p-0 m-0 grid grid-flow-col grid-cols-2 grid-rows-6 gap-2">
                {mnemonicWords.map((word, i) => (
                  <li key={i} className="bg-white rounded p-1 flex items-center relative select-none">
                    <span className="absolute left-2 w-4 text-right mr-2 text-gray-500">{i + 1}.</span>
                    <span className="font-mono ml-8">{word}</span>
                  </li>
                ))}
              </ol>
            </div>
            {!isRecoveryPhraseVisible && (
              <div
                className="absolute inset-0 flex flex-col items-center justify-center text-center p-4 cursor-pointer"
                onClick={handleRecoveryPhraseClick}
              >
                <FaEyeSlash className="mb-2 text-2xl" />
                <p className="mb-2 font-bold">View 12-word Secret Phrase</p>
                <p>Make sure no one is looking!</p>
              </div>
            )}
          </div>
          <CheckboxInput
            checked={isConfirmed}
            onChange={handleCheckboxChange}
            label="I have saved my secret recovery phrase."
            ariaLabel="Confirm recovery phrase backup"
            disabled={!isRecoveryPhraseVisible}
          />
          {isConfirmed && (
            <>
              <PasswordInput
                id="password"
                className="mb-4"
                value={password}
                onChange={handlePasswordChange}
                placeholder={walletExists ? 'Confirm your password' : 'Create a password'}
                error=""
                ariaLabel={walletExists ? 'Confirm password' : 'Create password'}
              />
              <Button type="submit" disabled={!isConfirmed || !password} fullWidth>
                Continue
              </Button>
            </>
          )}
        </form>
      </div>
      {!isConfirmed && !document.documentElement.lang.startsWith('en') && (
        <div className="text-center text-xs p-4">
          For security reasons, recovery phrases are only shown in English.
        </div>
      )}
    </div>
  );
}

export default CreateWallet;