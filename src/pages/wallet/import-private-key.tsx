import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiChevronDown } from 'react-icons/fi';
import { Button } from '@/components/button';
import { CheckboxInput } from '@/components/inputs/checkbox-input';
import { PasswordInput } from '@/components/inputs/password-input';
import { useHeader } from '@/contexts/header-context';
import { useToast } from '@/contexts/toast-context';
import { useWallet } from '@/contexts/wallet-context';
import { AddressType } from '@/utils/blockchain/bitcoin/address';
import { useState as useLocalState } from 'react'; // (if needed)
import { useMemo as useLocalMemo } from 'react'; // (if needed)

export const ImportPrivateKey = () => {
  const navigate = useNavigate();
  const { setHeaderProps } = useHeader();
  const { wallets, createAndUnlockPrivateKeyWallet, verifyPassword } = useWallet();
  const { showError } = useToast();

  const [privateKey, setPrivateKey] = useState('');
  const [addressType, setAddressType] = useState<AddressType>(AddressType.P2PKH);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [privateKeyError, setPrivateKeyError] = useState('');
  const [submissionError, setSubmissionError] = useState('');

  const privateKeyInputRef = useRef<HTMLInputElement>(null);

  const walletExists = wallets.length > 0;

  useEffect(() => {
    setHeaderProps({
      title: 'Import Key',
      onBack: () => navigate(walletExists ? '/add-wallet' : '/onboarding'),
    });
  }, [setHeaderProps, navigate, walletExists]);

  useEffect(() => {
    privateKeyInputRef.current?.focus();
  }, []);

  const [prevPkLen, setPrevPkLen] = useState(0);
  useEffect(() => {
    const currentLen = privateKey.trim().length;
    if (currentLen !== prevPkLen) {
      setPrevPkLen(currentLen);
    }
  }, [privateKey, prevPkLen]);

  const isPrivateKeyValid = useMemo(() => {
    return privateKey.trim().length >= 20;
  }, [privateKey]);

  const isPasswordValid = (pw: string): boolean => pw.length >= 8;

  const handlePrivateKeyChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    setPrivateKey(e.target.value);
    setPrivateKeyError('');
    setSubmissionError('');
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
      privateKey.trim().length > 0 &&
      password.length > 0 &&
      (walletExists || isPasswordValid(password))
    );
  };

  const validateForm = async (): Promise<boolean> => {
    setPrivateKeyError('');
    setPasswordError('');
    setSubmissionError('');

    const trimmedKey = privateKey.trim();
    if (!trimmedKey) {
      setPrivateKeyError('Private key is required');
      return false;
    }
    if (!/^[0-9a-fA-F]{64}$|^[5KL][1-9A-HJ-NP-Za-km-z]{50,51}$/.test(trimmedKey)) {
      setPrivateKeyError('Invalid private key format. Please enter a valid WIF or hexadecimal private key.');
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
    const isValid = await verifyPassword(password);
    if (!isValid) {
      setPasswordError('Invalid password');
      return false;
    }
    return true;
  };

  const createWallet = async (): Promise<void> => {
    try {
      await createAndUnlockPrivateKeyWallet(privateKey.trim(), password, undefined, addressType);
      navigate('/index');
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
      showError(errorMessage);
      setSubmissionError(errorMessage);
    }
  };

  const handleSubmit = async (e?: React.FormEvent): Promise<void> => {
    if (e) e.preventDefault();
    const isValid = await validateForm();
    if (!isValid) return;
    await createWallet();
  };

  return (
    <div className="flex-grow overflow-y-auto p-4" role="main">
      <div className="w-full max-w-md mx-auto bg-white rounded-lg shadow-md p-6">
        <h2 className="text-2xl font-bold mb-2">Import Private Key</h2>
        <p className="mb-5">Enter your private key to use its address.</p>

        {submissionError && (
          <div className="p-3 mb-4 text-sm text-red-700 bg-red-100 rounded-lg">
            {submissionError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
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
          />

          <div className="flex items-center gap-2 mb-4">
            <CheckboxInput
              checked={isConfirmed}
              onChange={handleCheckboxChange}
              label="I have backed up this private key"
              disabled={!isPrivateKeyValid}
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
              >
                <option value={AddressType.P2PKH}>Legacy</option>
                <option value={AddressType.P2SH_P2WPKH}>Nested SegWit</option>
                <option value={AddressType.P2WPKH}>Native SegWit</option>
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
              />
              <Button type="submit" disabled={!canSubmit()} fullWidth>
                Continue
              </Button>
            </>
          )}
        </form>
      </div>
    </div>
  );
};

export default ImportPrivateKey;
