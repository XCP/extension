import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { useNavigate, useParams } from "react-router";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { ErrorAlert } from "@/components/ui/error-alert";
import { PasswordInput } from "@/components/ui/inputs/password-input";
import { useHeader } from "@/contexts/header-context";
import { useWallet } from "@/contexts/wallet-context";
import { useSecretReveal } from "@/hooks/useSecretReveal";

const PATHS = {
  BACK: "/keychain/wallets",
} as const;

export default function ShowPassphrasePage(): ReactElement {
  const { walletId } = useParams<{ walletId: string }>();
  const navigate = useNavigate();
  const { setHeaderProps } = useHeader();
  const { selectWallet, getUnencryptedMnemonic, verifyPassword } = useWallet();
  const { pending } = useFormStatus();

  const [passphrase, setPassphrase] = useState("");

  const {
    isRevealed: isConfirmed,
    submissionError,
    clearError,
    passwordInputRef,
    formAction: handleFormAction,
  } = useSecretReveal({
    walletId,
    verifyPassword,
    onVerified: async () => {
      let mnemonic: string | null;
      try {
        // Load the wallet to decrypt its secret
        await selectWallet(walletId!);
        mnemonic = await getUnencryptedMnemonic(walletId!);
      } catch (err) {
        console.error("Error revealing passphrase:", err);
        throw new Error("Incorrect password or failed to reveal recovery phrase.");
      }
      // Kept distinct from the failure above: retrieving nothing is not the same
      // as the retrieval throwing, and the two said different things before.
      if (!mnemonic) throw new Error("Unable to retrieve recovery phrase.");
      setPassphrase(mnemonic);
    },
  });

  useEffect(() => {
    setHeaderProps({
      title: "Passphrase",
      onBack: () => navigate(PATHS.BACK),
    });
  }, [setHeaderProps, navigate]);

  return (
    <section className="flex flex-col h-full p-4" aria-labelledby="show-passphrase-title">
      <h2 id="show-passphrase-title" className="sr-only">Show Recovery Phrase</h2>
      {submissionError && <ErrorAlert message={submissionError} onClose={clearError} />}
      {!isConfirmed ? (
        <form action={handleFormAction} className="flex flex-col items-center justify-center flex-grow">
          <Banner
            severity="warning"
            className="max-w-md w-full mb-6"
            title="Keep your recovery phrase private"
            description="Never share it with anyone. Anyone with these words can steal your funds."
          />
          <div className="w-full max-w-md space-y-4">
            <PasswordInput
              name="password"
              placeholder="Enter your password"
              disabled={pending}
              innerRef={passwordInputRef}
            />
            <Button type="submit" disabled={pending} fullWidth color="red" aria-label="Show Recovery Phrase">
              {pending ? "Verifying…" : "Show Recovery Phrase"}
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-col items-center justify-center flex-grow">
          <div className="w-full max-w-md space-y-4">
            <div className="text-center mb-6">
              <p className="text-sm text-gray-600">
                Write down these 12 words in order and store them in a secure location.
              </p>
            </div>
            <div className="bg-gray-50 border-2 border-gray-200 p-6 rounded-xl shadow-sm">
              <ol className="list-none p-0 m-0 grid grid-flow-col grid-cols-2 grid-rows-6 gap-2">
                {passphrase.split(" ").map((word, index) => (
                  <li
                    key={index}
                    className="bg-white rounded p-1 flex items-center relative border border-gray-200 select-none"
                  >
                    <span className="absolute left-2 w-4 text-right mr-2 text-gray-500 select-none">
                      {index + 1}.
                    </span>
                    <span className="font-mono ml-8 text-gray-800 select-none">{word}</span>
                  </li>
                ))}
              </ol>
            </div>
            <Banner
              severity="warning"
              title="Keep this private"
              description="Anyone with it can steal your funds."
            />
          </div>
        </div>
      )}
    </section>
  );
}
