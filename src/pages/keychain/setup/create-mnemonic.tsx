import { useActionState, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/button";
import { ErrorAlert } from "@/components/error-alert";
import { FaEyeSlash, FiRefreshCw } from "@/components/icons";
import { CheckboxInput } from "@/components/inputs/checkbox-input";
import { PasswordInput } from "@/components/inputs/password-input";
import { useHeader } from "@/contexts/header-context";
import { useWallet } from "@/contexts/wallet-context";
import { generateNewMnemonic } from "@/utils/blockchain/bitcoin/privateKey";
import { MIN_PASSWORD_LENGTH } from "@/utils/encryption/encryption";
import { analytics } from "@/utils/fathom";

function CreateMnemonicPage() {
  const navigate = useNavigate();
  const { setHeaderProps } = useHeader();
  const { keychainExists, createMnemonicWallet, verifyPassword } = useWallet();

  const [mnemonic, setMnemonic] = useState(() => generateNewMnemonic());
  const [mnemonicWords, setMnemonicWords] = useState(() => generateNewMnemonic().split(" "));
  const [isRecoveryPhraseVisible, setIsRecoveryPhraseVisible] = useState(false);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [password, setPassword] = useState("");
  const [errorDismissed, setErrorDismissed] = useState(false);

  const passwordInputRef = useRef<HTMLInputElement>(null);

  const PATHS = {
    BACK: keychainExists ? "/keychain/wallets/add" : "/keychain/onboarding",
    SUCCESS: "/index",
  } as const;

  const [state, formAction, isPending] = useActionState(
    async (_prevState: { error: string | null }, formData: FormData) => {
      if (!isRecoveryPhraseVisible) {
        return { error: "Please view and save your recovery phrase first." };
      }

      const password = formData.get("password") as string;
      if (!password) {
        return { error: "Password is required." };
      }

      if (keychainExists) {
        const isValid = await verifyPassword(password);
        if (!isValid) {
          return { error: "Password does not match." };
        }
      } else if (password.length < MIN_PASSWORD_LENGTH) {
        return { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters long.` };
      }

      try {
        await createMnemonicWallet(mnemonic, password);
        analytics.track('wallet_created');
        navigate(PATHS.SUCCESS);
        return { error: null };
      } catch {
        return { error: "Failed to create wallet. Please try again." };
      }
    },
    { error: null }
  );

  const isPasswordValid = password.length >= MIN_PASSWORD_LENGTH;
  const canSubmit = isRecoveryPhraseVisible && isConfirmed && isPasswordValid && !isPending;

  useEffect(() => {
    if (state.error) setErrorDismissed(false);
  }, [state.error]);

  useEffect(() => {
    setHeaderProps({
      title: "Create Wallet",
      onBack: () => navigate(PATHS.BACK),
      rightButton: {
        icon: <FiRefreshCw className="size-4" aria-hidden="true" />,
        onClick: handleGenerateWallet,
        ariaLabel: "Generate new recovery phrase",
        disabled: isPending,
      },
    });
  }, [navigate, setHeaderProps, keychainExists, isPending]);

  function handleGenerateWallet() {
    const newMnemonic = generateNewMnemonic();
    setMnemonic(newMnemonic);
    setMnemonicWords(newMnemonic.split(" "));
    setIsConfirmed(false);
    setPassword("");
  }

  function handleRevealPhrase() {
    setIsRecoveryPhraseVisible(true);
  }

  function handleCheckboxChange(checked: boolean) {
    setIsConfirmed(checked);
    if (checked) {
      setTimeout(() => passwordInputRef.current?.focus(), 50);
    }
  }

  function handlePasswordChange(e: React.ChangeEvent<HTMLInputElement>) {
    setPassword(e.target.value);
  }

  return (
    <div
      className="flex-grow overflow-y-auto p-4"
      role="main"
      aria-labelledby="create-wallet-title"
    >
      <div className="w-full max-w-md mx-auto bg-white rounded-lg shadow-md p-6">
        {state.error && !errorDismissed && (
          <ErrorAlert message={state.error} onClose={() => setErrorDismissed(true)} />
        )}
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
          onSubmit={(e) => { if (!canSubmit) e.preventDefault(); }}
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
                className="absolute inset-0 flex flex-col items-center justify-center text-center p-4 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-inset rounded-md"
                onClick={handleRevealPhrase}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleRevealPhrase(); } }}
                role="button"
                tabIndex={0}
                aria-label="Reveal recovery phrase"
              >
                <FaEyeSlash className="size-6 mb-2" aria-hidden="true" />
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
                innerRef={passwordInputRef}
                name="password"
                placeholder={keychainExists ? "Confirm your password" : "Create a password"}
                disabled={isPending}
                onChange={handlePasswordChange}
              />
              <Button
                type="submit"
                fullWidth
                disabled={!canSubmit}
              >
                {isPending ? "Creating…" : "Continue"}
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

export default CreateMnemonicPage;
