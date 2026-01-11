
import { useEffect, useState, useActionState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { FaSync, FaEyeSlash } from "@/components/icons";
import { Button } from "@/components/button";
import { ErrorAlert } from "@/components/error-alert";
import { CheckboxInput } from "@/components/inputs/checkbox-input";
import { PasswordInput } from "@/components/inputs/password-input";
import { useHeader } from "@/contexts/header-context";
import { useWallet } from "@/contexts/wallet-context";
import { generateNewMnemonic } from "@/utils/blockchain/bitcoin/privateKey";

function CreateWallet() {
  const navigate = useNavigate();
  const { setHeaderProps } = useHeader();
  const { wallets, createAndUnlockMnemonicWallet, verifyPassword } = useWallet();
  const walletExists = wallets.length > 0;

  const initialMnemonic = generateNewMnemonic();
  const [mnemonic, setMnemonic] = useState(initialMnemonic);
  const [mnemonicWords, setMnemonicWords] = useState(initialMnemonic.split(" "));
  const [isRecoveryPhraseVisible, setIsRecoveryPhraseVisible] = useState(false);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [password, setPassword] = useState("");
  const passwordInputRef = useRef<HTMLInputElement>(null);

  const PATHS = {
    BACK: walletExists ? "/add-wallet" : "/onboarding",
    SUCCESS: "/index",
  } as const;
  const MIN_PASSWORD_LENGTH = 8;

  const [state, formAction, isPending] = useActionState(
    async (_prevState: { error: string | null }, formData: FormData) => {
      if (!isRecoveryPhraseVisible) {
        return { error: "Please view and save your recovery phrase first." };
      }

      const password = formData.get("password") as string;
      if (!password) {
        return { error: "Password is required." };
      }

      if (walletExists) {
        const isValid = await verifyPassword(password);
        if (!isValid) {
          return { error: "Password does not match." };
        }
      } else if (password.length < MIN_PASSWORD_LENGTH) {
        return {
          error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`,
        };
      }

      try {
        await createAndUnlockMnemonicWallet(mnemonic, password);
        navigate(PATHS.SUCCESS);
        return { error: null };
      } catch (err) {
        console.error("Error creating wallet:", err);
        return { error: "Failed to create wallet. Please try again." };
      }
    },
    { error: null }
  );

  useEffect(() => {
    setHeaderProps({
      title: "Create Wallet",
      onBack: () => navigate(PATHS.BACK),
      rightButton: {
        icon: <FaSync aria-hidden="true" />,
        onClick: generateWallet,
        ariaLabel: "Generate new recovery phrase",
        disabled: isPending,
      },
    });
  }, [navigate, setHeaderProps, walletExists, isPending]);

  function generateWallet() {
    const newMnemonic = generateNewMnemonic();
    setMnemonic(newMnemonic);
    setMnemonicWords(newMnemonic.split(" "));
    setIsConfirmed(false);
    setPassword("");
  }

  const handleRecoveryPhraseClick = () => {
    setIsRecoveryPhraseVisible(true);
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

  const isPasswordValid = password.length >= MIN_PASSWORD_LENGTH;

  return (
    <div
      className="flex-grow overflow-y-auto p-4"
      role="main"
      aria-labelledby="create-wallet-title"
    >
      <div className="w-full max-w-md mx-auto bg-white rounded-lg shadow-md p-6">
        {state.error && <ErrorAlert message={state.error} />}
        <h2 id="create-wallet-title" className="text-2xl font-bold mb-2">
          Your Recovery Phrase
        </h2>
        <p className="mb-5" id="recovery-instructions">
          Please write down this 12-word secret phrase.
        </p>
        <form
          action={formAction}
          className="space-y-4"
          aria-describedby="recovery-instructions"
        >
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
            disabled={!isRecoveryPhraseVisible || isPending}
            checked={isConfirmed}
            onChange={handleCheckboxChange}
          />
          {isConfirmed && (
            <>
              <PasswordInput
                ref={passwordInputRef}
                name="password"
                placeholder={
                  walletExists ? "Confirm your password" : "Create a password"
                }
                disabled={isPending}
                onChange={handlePasswordChange}
              />
              <Button
                type="submit"
                fullWidth
                disabled={isPending || !isPasswordValid}
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
          href="https://youtu.be/x-2KrLSq0mk"
        >
          Watch Tutorial: How to Create a Wallet
        </Button>
      )}
    </div>
  );
}

export default CreateWallet;
