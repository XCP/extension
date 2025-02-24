import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaEye, FaEyeSlash } from 'react-icons/fa';
import { Input as HeadlessInput } from '@headlessui/react';
import { validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';
import { Button } from '@/components/button';
import { CheckboxInput } from '@/components/inputs/checkbox-input';
import { PasswordInput } from '@/components/inputs/password-input';
import { useHeader } from '@/contexts/header-context';
import { useWallet } from '@/contexts/wallet-context';
import { AddressType } from '@/utils/blockchain/bitcoin';
import { isValidCounterwalletMnemonic } from '@/utils/blockchain/counterwallet';
import { ErrorAlert } from '@/components/error-alert';

/**
 * ImportWallet component allows users to import a wallet using a 12-word mnemonic phrase.
 *
 * Features:
 * - Accepts a 12-word recovery phrase input, supporting pasting multiple words into one field
 * - Validates mnemonic and requires confirmation
 * - Supports password entry and wallet unlocking
 */
function ImportWallet() {
  const navigate = useNavigate();
  const { setHeaderProps } = useHeader();
  const { unlockWallet, wallets, createAndUnlockMnemonicWallet, verifyPassword } = useWallet();
  const walletExists = wallets.length > 0;

  const [mnemonicWords, setMnemonicWords] = useState<string[]>(Array(12).fill(''));
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [showMnemonic, setShowMnemonic] = useState(false);
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inputRefs = useRef<(HTMLInputElement | null)[]>(Array(12).fill(null));

  // Constants for paths and validation
  const PATHS = {
    BACK: walletExists ? '/add-wallet' : '/onboarding',
    SUCCESS: '/index',
  } as const;
  const MIN_PASSWORD_LENGTH = 8;

  // Set up header with show/hide toggle
  useEffect(() => {
    setHeaderProps({
      title: 'Import Wallet',
      onBack: () => navigate(PATHS.BACK),
      rightButton: {
        icon: showMnemonic ? (
          <FaEyeSlash aria-hidden="true" />
        ) : (
          <FaEye aria-hidden="true" />
        ),
        onClick: () => setShowMnemonic((prev) => !prev),
        ariaLabel: showMnemonic ? 'Hide recovery phrase' : 'Show recovery phrase',
      },
    });
  }, [navigate, setHeaderProps, showMnemonic, walletExists]);

  // Focus first input on mount
  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  const handleWordChange = (index: number, value: string) => {
    const newWords = [...mnemonicWords];
    const words = value.trim().split(/\s+/);
    if (words.length > 1) {
      for (let i = 0; i < words.length && index + i < 12; i++) {
        newWords[index + i] = words[i];
      }
      setMnemonicWords(newWords);
      const nextIndex = Math.min(index + words.length, 11);
      inputRefs.current[nextIndex]?.focus();
    } else {
      newWords[index] = value;
      setMnemonicWords(newWords);
    }
  };

  const handleWordKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, index: number) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (index < 11) {
        inputRefs.current[index + 1]?.focus();
      } else if (isConfirmed) {
        document.getElementById('password')?.focus();
      }
    } else if (e.key === 'Backspace' && !mnemonicWords[index] && index > 0) {
      e.preventDefault();
      inputRefs.current[index - 1]?.focus();
    }
  };

  function areAllWordsPopulated(): boolean {
    return mnemonicWords.every((word) => word.trim() !== '');
  }

  const handleCheckboxChange = (checked: boolean) => {
    if (!areAllWordsPopulated()) return;
    setIsConfirmed(checked);
  };

  function isPasswordValid(pw: string): boolean {
    return pw.length >= MIN_PASSWORD_LENGTH;
  }

  async function validateForm(): Promise<boolean> {
    const mnemonic = mnemonicWords.join(' ').trim();
    let validMnemonic = validateMnemonic(mnemonic, wordlist);
    if (!validMnemonic && isValidCounterwalletMnemonic(mnemonic)) {
      validMnemonic = true;
    }
    if (!validMnemonic) {
      setError('Invalid recovery phrase. Please check each word carefully.');
      return false;
    }
    if (!isConfirmed) {
      setError('Please confirm you have backed up your recovery phrase.');
      return false;
    }
    if (!password) {
      setError('Password is required.');
      return false;
    }
    if (walletExists) {
      const isValid = await verifyPassword(password);
      if (!isValid) {
        setError('Password does not match.');
        return false;
      }
    } else if (!isPasswordValid(password)) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`);
      return false;
    }
    return true;
  }

  async function handleSubmit(e?: React.FormEvent<HTMLFormElement>) {
    if (e) e.preventDefault();
    if (isSubmitting) return;

    setIsSubmitting(true);
    try {
      if (await validateForm()) {
        const mnemonic = mnemonicWords.join(' ').trim();
        const addressType = isValidCounterwalletMnemonic(mnemonic)
          ? AddressType.Counterwallet
          : AddressType.P2WPKH;
        const newWallet = await createAndUnlockMnemonicWallet(
          mnemonic,
          password,
          undefined,
          addressType
        );
        await unlockWallet(newWallet.id, password);
        navigate(PATHS.SUCCESS);
      }
    } catch (error: unknown) {
      console.error('Detailed error importing wallet:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setError(`Failed to import wallet: ${errorMessage}`);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div
      className="flex-grow overflow-y-auto p-4"
      role="main"
      aria-labelledby="import-wallet-title"
    >
      <div className="w-full max-w-md mx-auto bg-white rounded-lg shadow-md p-6">
        {error && <ErrorAlert message={error} onClose={() => setError(null)} />}
        <h2 id="import-wallet-title" className="text-2xl font-bold mb-2">
          Import Your Mnemonic
        </h2>
        <p className="mb-5" id="import-instructions">
          Please enter your 12-word recovery phrase below.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4" aria-describedby="import-instructions">
          <div
            className="bg-gray-100 p-2 rounded-md mb-4"
            role="region"
            aria-label="Recovery phrase input"
          >
            <ol
              className="list-none p-0 m-0 grid grid-flow-col grid-cols-2 grid-rows-6 gap-2"
              aria-label="Recovery phrase words"
            >
              {mnemonicWords.map((word, index) => (
                <li
                  key={index}
                  className="bg-white rounded p-1 flex items-center relative"
                  aria-label={`Word ${index + 1}`}
                >
                  <span
                    className="absolute left-2 w-6 text-right mr-2 text-gray-500"
                    aria-hidden="true"
                  >
                    {index + 1}.
                  </span>
                  <HeadlessInput
                    ref={(el) => {
                      inputRefs.current[index] = el as HTMLInputElement;
                    }}
                    type={showMnemonic ? 'text' : 'password'}
                    value={word}
                    onChange={(e) => handleWordChange(index, e.target.value)}
                    onKeyDown={(e) => handleWordKeyDown(e, index)}
                    className="font-mono ml-8 w-full bg-transparent outline-none"
                    placeholder="Enter word"
                    aria-label={`Word ${index + 1}`}
                    disabled={isSubmitting}
                  />
                </li>
              ))}
            </ol>
          </div>
          <CheckboxInput
            checked={isConfirmed}
            onChange={handleCheckboxChange}
            label="I have saved my secret recovery phrase"
            ariaLabel="Confirm recovery phrase backup"
            disabled={!areAllWordsPopulated() || isSubmitting}
          />
          {isConfirmed && (
            <>
              <PasswordInput
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={walletExists ? 'Confirm your password' : 'Create a password'}
                error=""
                ariaLabel={walletExists ? 'Confirm password' : 'Create password'}
                disabled={isSubmitting}
              />
              <Button
                type="submit"
                disabled={!isConfirmed || !isPasswordValid(password) || isSubmitting}
                fullWidth
              >
                Continue
              </Button>
            </>
          )}
        </form>
      </div>
    </div>
  );
}

export default ImportWallet;
