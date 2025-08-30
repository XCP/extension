"use client";

import { useEffect, useRef, useState, useActionState } from "react";
import { useNavigate } from "react-router-dom";
import { FaEye, FaEyeSlash } from "react-icons/fa";
import { Input as HeadlessInput } from "@headlessui/react";
import { validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english";
import { Button } from "@/components/button";
import { ErrorAlert } from "@/components/error-alert";
import { CheckboxInput } from "@/components/inputs/checkbox-input";
import { PasswordInput } from "@/components/inputs/password-input";
import { useHeader } from "@/contexts/header-context";
import { useWallet } from "@/contexts/wallet-context";
import { AddressType } from "@/utils/blockchain/bitcoin";
import { isValidCounterwalletMnemonic } from "@/utils/blockchain/counterwallet";

function ImportWallet() {
  const navigate = useNavigate();
  const { setHeaderProps } = useHeader();
  const { unlockWallet, wallets, createAndUnlockMnemonicWallet, verifyPassword } = useWallet();
  const walletExists = wallets.length > 0;

  const [showMnemonic, setShowMnemonic] = useState(false);
  const [mnemonicWords, setMnemonicWords] = useState(Array(12).fill(""));
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [password, setPassword] = useState("");
  const inputRefs = useRef<(HTMLInputElement | null)[]>(Array(12).fill(null));
  const passwordInputRef = useRef<HTMLInputElement>(null);

  const PATHS = {
    BACK: walletExists ? "/add-wallet" : "/onboarding",
    SUCCESS: "/index",
  } as const;
  const MIN_PASSWORD_LENGTH = 8;

  const [state, formAction, isPending] = useActionState(
    async (_: unknown, formData: FormData) => {
      const mnemonicWords = Array.from({ length: 12 }, (_, i) => formData.get(`word-${i}`) as string);
      const mnemonic = mnemonicWords.join(" ").trim();
      const password = formData.get("password") as string;

      let validMnemonic = validateMnemonic(mnemonic, wordlist);
      if (!validMnemonic && isValidCounterwalletMnemonic(mnemonic)) validMnemonic = true;
      if (!validMnemonic) {
        return { error: "Invalid recovery phrase. Please check each word carefully." };
      }
      if (!isConfirmed) {
        return { error: "Please confirm you have backed up your recovery phrase." };
      }
      if (!password) {
        return { error: "Password is required." };
      }
      if (walletExists) {
        const isValid = await verifyPassword(password);
        if (!isValid) {
          return { error: "Password does not match." };
        }
      } else if (password.length < MIN_PASSWORD_LENGTH) {
        return { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters long.` };
      }

      try {
        const addressType = isValidCounterwalletMnemonic(mnemonic)
          ? AddressType.Counterwallet
          : AddressType.P2WPKH;
        const newWallet = await createAndUnlockMnemonicWallet(mnemonic, password, undefined, addressType);
        await unlockWallet(newWallet.id, password);
        navigate(PATHS.SUCCESS);
        return { error: null };
      } catch (error: unknown) {
        console.error("Detailed error importing wallet:", error);
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        return { error: `Failed to import wallet: ${errorMessage}` };
      }
    },
    { error: null }
  );

  useEffect(() => {
    setHeaderProps({
      title: "Import Wallet",
      onBack: () => navigate(PATHS.BACK),
      rightButton: {
        icon: showMnemonic ? <FaEyeSlash aria-hidden="true" /> : <FaEye aria-hidden="true" />,
        onClick: () => setShowMnemonic((prev) => !prev),
        ariaLabel: showMnemonic ? "Hide recovery phrase" : "Show recovery phrase",
      },
    });
  }, [navigate, setHeaderProps, showMnemonic, walletExists]);

  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  const handleWordChange = (index: number, value: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const words = value.trim().split(/\s+/);
    const newMnemonicWords = [...mnemonicWords];
    if (words.length > 1) {
      // Pasting multiple words
      let lastFilledIndex = index;
      for (let i = 0; i < words.length && index + i < 12; i++) {
        newMnemonicWords[index + i] = words[i];
        const input = inputRefs.current[index + i];
        if (input) input.value = words[i];
        lastFilledIndex = index + i;
      }
      
      // If we filled exactly 12 words from the paste, blur to mask all
      if (lastFilledIndex === 11 && words.length >= 12 - index) {
        // Small delay to ensure the last word is set before blurring
        setTimeout(() => {
          inputRefs.current[11]?.blur();
          setFocusedIndex(null);
        }, 10);
      } else if (lastFilledIndex < 11) {
        // Still have empty fields, focus the next one
        inputRefs.current[lastFilledIndex + 1]?.focus();
      } else {
        // Filled to the end but not all 12, blur to mask
        inputRefs.current[lastFilledIndex]?.blur();
        setFocusedIndex(null);
      }
    } else {
      newMnemonicWords[index] = value.trim();
      inputRefs.current[index]!.value = value.trim();
    }
    setMnemonicWords(newMnemonicWords);
  };

  const handleWordKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, index: number) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (index < 11) inputRefs.current[index + 1]?.focus();
    } else if (e.key === "Backspace" && !e.currentTarget.value && index > 0) {
      e.preventDefault();
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleCheckboxChange = (checked: boolean) => {
    setIsConfirmed(checked);
    if (checked) {
      // Focus password input when checkbox is checked
      setTimeout(() => {
        passwordInputRef.current?.focus();
      }, 50);
    }
  };

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPassword(e.target.value);
  };

  const allWordsPopulated = () => mnemonicWords.every((word) => word.trim().length > 0);
  const isPasswordValid = password.length >= MIN_PASSWORD_LENGTH;

  return (
    <div className="flex-grow overflow-y-auto p-4" role="main" aria-labelledby="import-wallet-title">
      <div className="w-full max-w-md mx-auto bg-white rounded-lg shadow-md p-6">
        {state.error && <ErrorAlert message={state.error} />}
        <h2 id="import-wallet-title" className="text-2xl font-bold mb-2">Import Your Mnemonic</h2>
        <p className="mb-5" id="import-instructions">Please enter your 12-word recovery phrase below.</p>
        <form action={formAction} className="space-y-4" aria-describedby="import-instructions">
          <div className="bg-gray-100 p-2 rounded-md mb-4" role="region" aria-label="Recovery phrase input">
            <ol className="list-none p-0 m-0 grid grid-flow-col grid-cols-2 grid-rows-6 gap-2" aria-label="Recovery phrase words">
              {[...Array(12)].map((_, index) => {
                const isFocused = focusedIndex === index;
                const word = mnemonicWords[index]?.trim() || "";
                const hasValue = word.length > 0;
                
                // Determine what to show
                let displayContent = "";
                if (hasValue && !showMnemonic) {
                  if (isFocused) {
                    // When focused and typing, show real-length dots
                    displayContent = "•".repeat(word.length);
                  } else {
                    // When not focused, show fixed-width (6 dots)
                    displayContent = "••••••";
                  }
                }
                
                return (
                  <li key={index} className="bg-white rounded p-1 flex items-center relative" aria-label={`Word ${index + 1}`}>
                    <span className="absolute left-2 w-6 text-right mr-2 text-gray-500" aria-hidden="true">
                      {index + 1}.
                    </span>
                    <div className="ml-8 w-full relative">
                      <HeadlessInput
                        name={`word-${index}`}
                        ref={(el: HTMLInputElement | null) => { inputRefs.current[index] = el; }}
                        type={showMnemonic ? "text" : "password"}
                        onChange={(e) => handleWordChange(index, e.target.value, e)}
                        onKeyDown={(e) => handleWordKeyDown(e, index)}
                        onFocus={() => setFocusedIndex(index)}
                        onBlur={() => setFocusedIndex(null)}
                        className={`font-mono w-full bg-transparent outline-none ${!showMnemonic && hasValue ? 'opacity-0' : ''}`}
                        placeholder="Enter word"
                        aria-label={`Word ${index + 1}`}
                        disabled={isPending}
                      />
                      {!showMnemonic && hasValue && (
                        <div 
                          className="absolute inset-0 font-mono pointer-events-none"
                          aria-hidden="true"
                        >
                          {displayContent}
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
          <CheckboxInput
            name="confirmed"
            id="confirmed-checkbox"
            label="I have saved my secret recovery phrase."
            disabled={!allWordsPopulated() || isPending}
            checked={isConfirmed}
            onChange={handleCheckboxChange}
          />
          {isConfirmed && (
            <>
              <PasswordInput
                innerRef={passwordInputRef}
                name="password"
                placeholder={walletExists ? "Confirm your password" : "Create a password"}
                disabled={isPending}
                onChange={handlePasswordChange}
              />
              <Button
                type="submit"
                disabled={isPending || !isPasswordValid}
                fullWidth
              >
                {isPending ? "Submitting..." : "Continue"}
              </Button>
            </>
          )}
        </form>
      </div>
      {!isConfirmed && (
        <Button 
          variant="youtube"
          href="https://youtu.be/pGj3vl8zaUA"
        >
          Watch Tutorial: How to Import a Wallet
        </Button>
      )}
    </div>
  );
}

export default ImportWallet;
