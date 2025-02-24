"use client";

import { useEffect } from "react";
import { useFormStatus } from "react-dom";
import { useNavigate } from "react-router-dom";
import { FaSync, FaEyeSlash } from "react-icons/fa";
import { Button } from "@/components/button";
import { ErrorAlert } from "@/components/error-alert";
import { CheckboxInput } from "@/components/inputs/checkbox-input";
import { PasswordInput } from "@/components/inputs/password-input";
import { useHeader } from "@/contexts/header-context";
import { useWallet } from "@/contexts/wallet-context";
import { generateNewMnemonic } from "@/utils/blockchain/bitcoin";

function CreateWallet() {
  const navigate = useNavigate();
  const { setHeaderProps } = useHeader();
  const { wallets, createAndUnlockMnemonicWallet, verifyPassword } = useWallet();
  const walletExists = wallets.length > 0;
  const { pending } = useFormStatus();

  const initialMnemonic = generateNewMnemonic();
  const [mnemonic, setMnemonic] = useState(initialMnemonic);
  const [mnemonicWords] = useState(initialMnemonic.split(" "));
  const [isRecoveryPhraseVisible, setIsRecoveryPhraseVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const PATHS = {
    BACK: walletExists ? "/add-wallet" : "/onboarding",
    SUCCESS: "/index",
  } as const;
  const MIN_PASSWORD_LENGTH = 8;

  useEffect(() => {
    setHeaderProps({
      title: "Create Wallet",
      onBack: () => navigate(PATHS.BACK),
      rightButton: {
        icon: <FaSync aria-hidden="true" />,
        onClick: generateWallet,
        ariaLabel: "Generate new recovery phrase",
        disabled: pending,
      },
    });
  }, [navigate, setHeaderProps, walletExists, pending]);

  function generateWallet() {
    const newMnemonic = generateNewMnemonic();
    setMnemonic(newMnemonic);
    setIsRecoveryPhraseVisible(false);
    setError(null);
  }

  const handleRecoveryPhraseClick = () => {
    setIsRecoveryPhraseVisible(true);
    setError(null);
  };

  async function handleFormAction(formData: FormData) {
    setError(null);

    if (!isRecoveryPhraseVisible) {
      setError("Please view and save your recovery phrase first.");
      return;
    }

    const isConfirmed = formData.get("confirmed") === "on";
    if (!isConfirmed) {
      setError("Please confirm you have backed up your recovery phrase.");
      return;
    }

    const password = formData.get("password") as string;
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
      await createAndUnlockMnemonicWallet(mnemonic, password);
      navigate(PATHS.SUCCESS);
    } catch (err: unknown) {
      console.error("Error creating wallet:", err);
      setError("Failed to create wallet. Please try again.");
    }
  }

  return (
    <div
      className="flex-grow overflow-y-auto p-4"
      role="main"
      aria-labelledby="create-wallet-title"
    >
      <div className="w-full max-w-md mx-auto bg-white rounded-lg shadow-md p-6">
        {error && <ErrorAlert message={error} onClose={() => setError(null)} />}
        <h2 id="create-wallet-title" className="text-2xl font-bold mb-2">
          Your Recovery Phrase
        </h2>
        <p className="mb-5" id="recovery-instructions">
          Please write down this 12-word secret phrase.
        </p>
        <form action={handleFormAction} className="space-y-4" aria-describedby="recovery-instructions">
          <div className="bg-gray-100 p-2 rounded-md mb-4 relative">
            <div
              className={
                !isRecoveryPhraseVisible
                  ? "bg-gray-100 opacity-50 filter blur-sm transition-filter"
                  : ""
              }
            >
              <ol className="list-none p-0 m-0 grid grid-flow-col grid-cols-2 grid-rows-6 gap-2">
                {mnemonicWords.map((word, i) => (
                  <li
                    key={i}
                    className="bg-white rounded p-1 flex items-center relative select-none"
                  >
                    <span className="absolute left-2 w-4 text-right mr-2 text-gray-500">
                      {i + 1}.
                    </span>
                    <span className="font-mono ml-8">{word}</span>
                  </li>
                ))}
              </ol>
            </div>
            {!isRecoveryPhraseVisible && (
              <div
                className="absolute inset-0 flex flex-col items-center justify-center text-center p-4 cursor-pointer"
                onClick={handleRecoveryPhraseClick}
                role="button"
                tabIndex={0}
                aria-label="Reveal recovery phrase"
              >
                <FaEyeSlash className="mb-2 text-2xl" aria-hidden="true" />
                <p className="mb-2 font-bold">View 12-word Secret Phrase</p>
                <p>Make sure no one is looking!</p>
              </div>
            )}
          </div>
          <CheckboxInput
            name="confirmed"
            label="I have saved my secret recovery phrase."
            checked={isRecoveryPhraseVisible}
            disabled={!isRecoveryPhraseVisible || pending}
          />
          <PasswordInput
            name="password"
            placeholder={walletExists ? "Confirm your password" : "Create a password"}
            disabled={pending}
          />
          <Button type="submit" fullWidth disabled={pending}>
            {pending ? "Submitting..." : "Continue"}
          </Button>
        </form>
      </div>
      {!isRecoveryPhraseVisible && !document.documentElement.lang.startsWith("en") && (
        <div className="text-center text-xs p-4">
          For security reasons, recovery phrases are only shown in English.
        </div>
      )}
    </div>
  );
}

export default CreateWallet;
