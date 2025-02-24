import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiChevronDown } from 'react-icons/fi';
import { Button } from '@/components/button';
import { ErrorAlert } from '@/components/error-alert';
import { CheckboxInput } from '@/components/inputs/checkbox-input';
import { PasswordInput } from '@/components/inputs/password-input';
import { useHeader } from '@/contexts/header-context';
import { useWallet } from '@/contexts/wallet-context';
import { AddressType } from '@/utils/blockchain/bitcoin';

/**
 * ImportPrivateKey component allows users to import a wallet using a private key.
 *
 * Features:
 * - Accepts a private key and auto-detects address type (Legacy or Nested SegWit)
 * - Allows overriding the suggested address type via dropdown
 * - Requires confirmation of key backup and password entry
 * - Validates inputs and handles submission errors
 */
const ImportPrivateKey = () => {
  const navigate = useNavigate();
  const { setHeaderProps } = useHeader();
  const { wallets, createAndUnlockPrivateKeyWallet, verifyPassword } = useWallet();

  const [privateKey, setPrivateKey] = useState('');
  const [addressType, setAddressType] = useState<AddressType>(AddressType.P2PKH);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [privateKeyError, setPrivateKeyError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [submissionError, setSubmissionError] = useState('');

  const privateKeyInputRef = useRef<HTMLInputElement>(null);
  const walletExists = wallets.length > 0;

  // Constants for paths and validation
  const PATHS = {
    BACK: walletExists ? '/add-wallet' : '/onboarding',
    SUCCESS: '/index',
  } as const;
  const MIN_PASSWORD_LENGTH = 8;
  const MIN_PRIVATE_KEY_LENGTH = 20;
  const ADDRESS_TYPES = [
    { value: AddressType.P2PKH, label: 'Legacy' },
    { value: AddressType.P2SH_P2WPKH, label: 'Nested SegWit' },
    { value: AddressType.P2WPKH, label: 'Native SegWit' },
  ] as const;

  // Helper functions for private key validation and address type detection
  const isValidPrivateKey = (key: string): boolean => {
    const trimmedKey = key.trim();
    if (!trimmedKey) return false;
    return /^[0-9a-fA-F]{64}$|^[5KL][1-9A-HJ-NP-Za-km-z]{50,51}$/.test(trimmedKey);
  };

  const isWIFUncompressed = (key: string): boolean => {
    return key.startsWith('5') && /^[5KL][1-9A-HJ-NP-Za-km-z]{50,51}$/.test(key);
  };

  const isWIFCompressed = (key: string): boolean => {
    return (key.startsWith('K') || key.startsWith('L')) && /^[5KL][1-9A-HJ-NP-Za-km-z]{50,51}$/.test(key);
  };

  const isHexPrivateKey = (key: string): boolean => {
    return /^[0-9a-fA-F]{64}$/.test(key);
  };

  const determineAddressType = (key: string): AddressType => {
    const trimmedKey = key.trim();
    if (isWIFUncompressed(trimmedKey)) {
      return AddressType.P2PKH; // Legacy for uncompressed WIF
    } else if (isWIFCompressed(trimmedKey)) {
      return AddressType.P2SH_P2WPKH; // Nested SegWit for compressed WIF
    } else if (isHexPrivateKey(trimmedKey)) {
      return AddressType.P2PKH; // Default to Legacy for hex
    }
    return AddressType.P2PKH; // Fallback to Legacy
  };

  // Set up header
  useEffect(() => {
    setHeaderProps({
      title: 'Import Key',
      onBack: () => navigate(PATHS.BACK),
    });
  }, [setHeaderProps, navigate, walletExists]);

  // Focus private key input on mount
  useEffect(() => {
    privateKeyInputRef.current?.focus();
  }, []);

  // Validate private key length
  const isPrivateKeyValid = useMemo(() => {
    return privateKey.trim().length >= MIN_PRIVATE_KEY_LENGTH && /^[0-9a-fA-F]{64}$|^[5KL][1-9A-HJ-NP-Za-km-z]{50,51}$/.test(privateKey.trim());
  }, [privateKey]);

  const isPasswordValid = (pw: string): boolean => pw.length >= MIN_PASSWORD_LENGTH;

  const handlePrivateKeyChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const newPrivateKey = e.target.value;
    setPrivateKey(newPrivateKey);
    setPrivateKeyError('');
    setSubmissionError('');

    if (!isValidPrivateKey(newPrivateKey)) {
      if (!newPrivateKey.trim()) {
        setPrivateKeyError('Private key is required');
      } else {
        setPrivateKeyError('Invalid private key format. Please enter a valid WIF or hexadecimal key.');
      }
    } else {
      const suggestedType = determineAddressType(newPrivateKey);
      setAddressType(suggestedType);
    }
  };

  const handleAddressTypeChange = (e: React.ChangeEvent<HTMLSelectElement>): void => {
    setAddressType(e.target.value as AddressType);
  };

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    setPassword(e.target.value);
    setPasswordError('');
    setSubmissionError('');
  };

  const handleCheckboxChange = (checked: boolean): void => {
    if (!isPrivateKeyValid) return;
    setIsConfirmed(checked);
    setSubmissionError('');
  };

  const canSubmit = (): boolean => {
    return (
      isConfirmed &&
      isValidPrivateKey(privateKey.trim()) &&
      password.length > 0 &&
      (walletExists || isPasswordValid(password))
    );
  };

  const validateForm = async (): Promise<boolean> => {
    setPasswordError('');
    setSubmissionError('');

    if (privateKeyError) {
      return false; // Early return if private key is invalid
    }

    const trimmedKey = privateKey.trim();
    if (!trimmedKey) {
      setPrivateKeyError('Private key is required');
      return false;
    }
    if (!isValidPrivateKey(trimmedKey)) {
      setPrivateKeyError('Invalid private key format. Please enter a valid WIF or hexadecimal key.');
      return false;
    }
    if (!isConfirmed) {
      setSubmissionError('Please confirm you have backed up your private key');
      return false;
    }
    if (!password) {
      setPasswordError('Password is required');
      return false;
    }
    if (walletExists) {
      const isValid = await verifyPassword(password);
      if (!isValid) {
        setPasswordError('Invalid password');
        return false;
      }
    } else if (!isPasswordValid(password)) {
      setPasswordError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters long`);
      return false;
    }
    return true;
  };

  const createWallet = async (): Promise<void> => {
    try {
      await createAndUnlockPrivateKeyWallet(privateKey.trim(), password, undefined, addressType);
      navigate(PATHS.SUCCESS);
    } catch (error) {
      let errorMessage = 'Failed to import private key. ';
      if (error instanceof Error) {
        if (error.message.includes('Invalid private key')) {
          errorMessage += 'The private key format is invalid.';
        } else if (error.message.includes('already exists')) {
          errorMessage += 'This private key has already been imported.';
        } else {
          errorMessage += error.message;
        }
      } else {
        errorMessage += 'Please check your input and try again.';
      }
      setSubmissionError(errorMessage);
    }
  };

  const handleSubmit = async (e?: React.FormEvent): Promise<void> => {
    if (e) e.preventDefault();
    if (isSubmitting) return;

    setIsSubmitting(true);
    try {
      if (await validateForm()) {
        await createWallet();
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="flex-grow overflow-y-auto p-4"
      role="main"
      aria-labelledby="import-private-key-title"
    >
      <div className="w-full max-w-md mx-auto bg-white rounded-lg shadow-md p-6">
        <h2 id="import-private-key-title" className="text-2xl font-bold mb-2">
          Import Private Key
        </h2>
        <p className="mb-5" id="import-instructions">
          Enter your private key to use its address.
        </p>

        {submissionError && <ErrorAlert message={submissionError} onClose={() => setSubmissionError('')} />}

        <form
          onSubmit={handleSubmit}
          className="space-y-4"
          aria-describedby="import-instructions"
        >
          <PasswordInput
            id="private-key"
            className="mb-2"
            value={privateKey}
            onChange={handlePrivateKeyChange}
            placeholder="Enter private key"
            error={privateKeyError}
            label="Private Key"
            showLabel
            ariaLabel="Private Key Input"
            ref={privateKeyInputRef}
            disabled={isSubmitting}
          />

          <div className="flex items-center gap-2 mb-4">
            <CheckboxInput
              checked={isConfirmed}
              onChange={handleCheckboxChange}
              label="I have backed up this private key"
              ariaLabel="Confirm private key backup"
              disabled={!isPrivateKeyValid || isSubmitting}
            />
          </div>

          <div className="mb-4">
            <label htmlFor="address-type" className="block mb-2 text-sm font-medium">
              Address Type
            </label>
            <div className="relative">
              <select
                id="address-type"
                value={addressType}
                onChange={handleAddressTypeChange}
                className="w-full p-2 pr-8 rounded-md border bg-white appearance-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                disabled={isSubmitting}
              >
                {ADDRESS_TYPES.map(({ value, label }) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <FiChevronDown
                className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400"
                aria-hidden="true"
              />
            </div>
          </div>

          {isConfirmed && (
            <>
              <PasswordInput
                id="password"
                className="mb-4"
                value={password}
                onChange={handlePasswordChange}
                placeholder={walletExists ? 'Confirm password' : 'Create password'}
                error={passwordError}
                label="Password"
                showLabel
                ariaLabel="Password Input"
                disabled={isSubmitting}
              />
              <Button
                type="submit"
                disabled={!canSubmit() || !isPasswordValid(password) || isSubmitting}
                fullWidth
              >
                {isSubmitting ? 'Importing...' : 'Continue'}
              </Button>
            </>
          )}
        </form>
      </div>
    </div>
  );
};

export default ImportPrivateKey;
