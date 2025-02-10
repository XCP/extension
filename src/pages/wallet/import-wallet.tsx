import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaEye, FaEyeSlash } from 'react-icons/fa';
import { Input as HeadlessInput } from '@headlessui/react';
import { validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';
import { useHeader } from '@/contexts/header-context';
import { useToast } from '@/contexts/toast-context';
import { useWallet } from '@/contexts/wallet-context';
import { Button } from '@/components/button';
import { CheckboxInput } from '@/components/inputs/checkbox-input';
import { PasswordInput } from '@/components/inputs/password-input';
import { getWalletService } from '@/services/walletService';
import { AddressType } from '@/utils/blockchain/bitcoin';
import { isValidCounterwalletMnemonic } from '@/utils/blockchain/counterwallet';

/**
 * ImportWallet component provides an interface for importing Bitcoin wallets
 * using a 12‑word recovery phrase. It supports both standard BIP39 and Counterwallet
 * mnemonics, validating the input and handling password verification.
 */
function ImportWallet() {
  const navigate = useNavigate();
  const { setHeaderProps } = useHeader();
  const { unlockWallet, wallets } = useWallet();
  const { showError } = useToast();
  const walletExists = wallets.length > 0;

  const [mnemonicWords, setMnemonicWords] = useState<string[]>(Array(12).fill(''));
  const [isConfirmed, setIsConfirmed] = useState<boolean>(false);
  const [showMnemonic, setShowMnemonic] = useState<boolean>(false);
  const [password, setPassword] = useState<string>('');

  // References for the 12 input elements.
  const inputRefs = useRef<(HTMLElement | null)[]>([]);

  // Set header props (with a toggle for showing/hiding the recovery phrase).
  useEffect(() => {
    setHeaderProps({
      title: 'Import Wallet',
      onBack: () => navigate(walletExists ? '/add-wallet' : '/onboarding'),
      rightButton: {
        icon: showMnemonic ? <FaEyeSlash aria-hidden="true" /> : <FaEye aria-hidden="true" />,
        onClick: () => setShowMnemonic((prev) => !prev),
        ariaLabel: showMnemonic ? 'Hide recovery phrase' : 'Show recovery phrase',
      },
    });
  }, [navigate, setHeaderProps, showMnemonic, walletExists]);

  // Auto-focus the first input on mount.
  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  // Update a single word at the given index.
  function handleWordChange(index: number, value: string) {
    const newWords = [...mnemonicWords];
    const words = value.trim().split(/\s+/);
    if (words.length > 1) {
      // If multiple words are pasted, fill subsequent inputs.
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
  }

  // Handle key events for word inputs.
  function handleWordKeyDown(e: React.KeyboardEvent<HTMLInputElement>, index: number) {
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
  }

  // Check whether every word input is non-empty.
  function areAllWordsPopulated() {
    return mnemonicWords.every((word) => word.trim() !== '');
  }

  // Checkbox handler: only allow confirmation if all words are populated.
  function handleCheckboxChange(checked: boolean) {
    if (!areAllWordsPopulated()) return;
    setIsConfirmed(checked);
  }

  // Simple password validation.
  function isPasswordValid(pw: string) {
    return pw.length >= 8;
  }

  // Validate form inputs and show errors using the toast.
  async function validateForm(): Promise<boolean> {
    const mnemonic = mnemonicWords.join(' ').trim();
    let validMnemonic = validateMnemonic(mnemonic, wordlist);
    if (!validMnemonic && isValidCounterwalletMnemonic(mnemonic)) {
      validMnemonic = true;
    }
    if (!validMnemonic) {
      showError('Invalid recovery phrase. Please check each word carefully.');
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
      const ws = getWalletService();
      const isValid = await ws.verifyPassword(password);
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

  // Handle form submission.
  async function handleSubmit(e?: React.FormEvent<HTMLFormElement>) {
    if (e) e.preventDefault();
    if (await validateForm()) {
      try {
        const mnemonic = mnemonicWords.join(' ').trim();
        const addressType = isValidCounterwalletMnemonic(mnemonic)
          ? AddressType.Counterwallet
          : AddressType.P2WPKH;
        // Use the wallet service to create a new mnemonic wallet.
        const ws = getWalletService();
        const newWallet = await ws.createMnemonicWallet(mnemonic, password, undefined, addressType);
        await unlockWallet(newWallet.id, password);
        navigate('/index');
      } catch (error) {
        console.error('Error importing wallet:', error);
        showError('Failed to import wallet. Please try again.');
      }
    }
  }

  return (
    <div className="flex-grow overflow-y-auto p-4" role="main" aria-labelledby="import-wallet-title">
      <div className="w-full max-w-md mx-auto bg-white rounded-lg shadow-md p-6">
        <h2 id="import-wallet-title" className="text-2xl font-bold mb-2">
          Your Recovery Phrase
        </h2>
        <p className="mb-5">Please enter a 12-word recovery phrase below.</p>

        <form onSubmit={handleSubmit} className="space-y-4">
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
                    // Fix the ref callback so that it does not return a value.
                    ref={(el) => {
                      inputRefs.current[index] = el;
                    }}
                    type={showMnemonic ? 'text' : 'password'}
                    value={word}
                    onChange={(e) => handleWordChange(index, e.target.value)}
                    onKeyDown={(e) => handleWordKeyDown(e, index)}
                    className="font-mono ml-8 w-full bg-transparent outline-none"
                    placeholder="Enter word"
                    aria-label={`Word ${index + 1}`}
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
            disabled={!areAllWordsPopulated()}
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
              />
              <Button type="submit" disabled={!isConfirmed || !password} fullWidth>
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
