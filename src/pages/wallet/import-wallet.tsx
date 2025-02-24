"use client";

import { useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
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
  const { pending } = useFormStatus();

  const walletExists = wallets.length > 0;
  const [showMnemonic, setShowMnemonic] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRefs = useRef<(HTMLInputElement | null)[]>(Array(12).fill(null));

  const PATHS = {
    BACK: walletExists ? "/add-wallet" : "/onboarding",
    SUCCESS: "/index",
  } as const;
  const MIN_PASSWORD_LENGTH = 8;

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

  async function handleFormAction(formData: FormData) {
    setError(null);

    const mnemonicWords = Array.from({ length: 12 }, (_, i) => formData.get(`word-${i}`) as string);
    const mnemonic = mnemonicWords.join(" ").trim();
    const isConfirmed = formData.get("confirmed") === "on";
    const password = formData.get("password") as string;

    let validMnemonic = validateMnemonic(mnemonic, wordlist);
    if (!validMnemonic && isValidCounterwalletMnemonic(mnemonic)) validMnemonic = true;
    if (!validMnemonic) {
      setError("Invalid recovery phrase. Please check each word carefully.");
      return;
    }
    if (!isConfirmed) {
      setError("Please confirm you have backed up your recovery phrase.");
      return;
    }
    if (!password) {
      setError("Password is required.");
      return;
    }
    if (walletExists) {
      const isValid = await verifyPassword(password);
      if (!isValid) {
        setError("Password does not match.");
        return;
      }
    } else if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`);
      return;
    }

    try {
      const addressType = isValidCounterwalletMnemonic(mnemonic)
        ? AddressType.Counterwallet
        : AddressType.P2WPKH;
      const newWallet = await createAndUnlockMnemonicWallet(mnemonic, password, undefined, addressType);
      await unlockWallet(newWallet.id, password);
      navigate(PATHS.SUCCESS);
    } catch (error: unknown) {
      console.error("Detailed error importing wallet:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      setError(`Failed to import wallet: ${errorMessage}`);
    }
  }

  const handleWordChange = (index: number, value: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const words = value.trim().split(/\s+/);
    if (words.length > 1) {
      for (let i = 0; i < words.length && index + i < 12; i++) {
        const input = inputRefs.current[index + i];
        if (input) input.value = words[i];
      }
      const nextIndex = Math.min(index + words.length, 11);
      inputRefs.current[nextIndex]?.focus();
    }
  };

  const handleWordKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, index: number) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (index < 11) inputRefs.current[index + 1]?.focus();
      else document.getElementById("password")?.focus();
    } else if (e.key === "Backspace" && !e.currentTarget.value && index > 0) {
      e.preventDefault();
      inputRefs.current[index - 1]?.focus();
    }
  };

  return (
    <div className="flex-grow overflow-y-auto p-4" role="main" aria-labelledby="import-wallet-title">
      <div className="w-full max-w-md mx-auto bg-white rounded-lg shadow-md p-6">
        {error && <ErrorAlert message={error} onClose={() => setError(null)} />}
        <h2 id="import-wallet-title" className="text-2xl font-bold mb-2">Import Your Mnemonic</h2>
        <p className="mb-5" id="import-instructions">Please enter your 12-word recovery phrase below.</p>
        <form action={handleFormAction} className="space-y-4" aria-describedby="import-instructions">
          <div className="bg-gray-100 p-2 rounded-md mb-4" role="region" aria-label="Recovery phrase input">
            <ol className="list-none p-0 m-0 grid grid-flow-col grid-cols-2 grid-rows-6 gap-2" aria-label="Recovery phrase words">
              {Array(12).fill(null).map((_, index) => (
                <li key={index} className="bg-white rounded p-1 flex items-center relative" aria-label={`Word ${index + 1}`}>
                  <span className="absolute left-2 w-6 text-right mr-2 text-gray-500" aria-hidden="true">
                    {index + 1}.
                  </span>
                  <HeadlessInput
                    name={`word-${index}`}
                    ref={(el: HTMLInputElement | null) => { inputRefs.current[index] = el; }}
                    type={showMnemonic ? "text" : "password"}
                    onChange={(e) => handleWordChange(index, e.target.value, e)}
                    onKeyDown={(e) => handleWordKeyDown(e, index)}
                    className="font-mono ml-8 w-full bg-transparent outline-none"
                    placeholder="Enter word"
                    aria-label={`Word ${index + 1}`}
                    disabled={pending}
                  />
                </li>
              ))}
            </ol>
          </div>
          <CheckboxInput
            name="confirmed"
            label="I have saved my secret recovery phrase"
            checked={false}
            disabled={pending}
          />
          <PasswordInput
            name="password"
            placeholder={walletExists ? "Confirm your password" : "Create a password"}
            disabled={pending}
          />
          <Button type="submit" disabled={pending} fullWidth>
            {pending ? "Submitting..." : "Continue"}
          </Button>
        </form>
      </div>
    </div>
  );
}

export default ImportWallet;
