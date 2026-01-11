"use client";

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { useParams, useNavigate } from "react-router-dom";
import { FaExclamationTriangle } from "@/components/icons";
import { Button } from "@/components/button";
import { ErrorAlert } from "@/components/error-alert";
import { PasswordInput } from "@/components/inputs/password-input";
import { useHeader } from "@/contexts/header-context";
import { useWallet } from "@/contexts/wallet-context";
import type { ReactElement } from "react";

const CONSTANTS = {
  MIN_PASSWORD_LENGTH: 8,
  PATHS: { BACK: "/select-wallet" } as const,
} as const;

export default function ShowPassphrase(): ReactElement {
  const { walletId } = useParams<{ walletId: string }>();
  const navigate = useNavigate();
  const { setHeaderProps } = useHeader();
  const { unlockWallet, getUnencryptedMnemonic } = useWallet();
  const { pending } = useFormStatus();

  const [passphrase, setPassphrase] = useState("");
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [submissionError, setSubmissionError] = useState("");
  const passwordInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setHeaderProps({
      title: "Passphrase",
      onBack: () => navigate(CONSTANTS.PATHS.BACK),
    });
  }, [setHeaderProps, navigate]);

  useEffect(() => {
    passwordInputRef.current?.focus();
  }, []);

  async function handleFormAction(formData: FormData) {
    setSubmissionError("");

    const password = formData.get("password") as string;
    if (!walletId) {
      setSubmissionError("Invalid wallet.");
      return;
    }
    if (!password) {
      setSubmissionError("Password is required.");
      return;
    }
    if (password.length < CONSTANTS.MIN_PASSWORD_LENGTH) {
      setSubmissionError(`Password must be at least ${CONSTANTS.MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    try {
      await unlockWallet(walletId, password);
      const mnemonic = await getUnencryptedMnemonic(walletId);
      if (mnemonic) {
        setPassphrase(mnemonic);
        setIsConfirmed(true);
      } else {
        setSubmissionError("Unable to retrieve recovery phrase.");
      }
    } catch (err) {
      console.error("Error revealing passphrase:", err);
      setSubmissionError("Incorrect password or failed to reveal recovery phrase.");
    }
  }

  return (
    <div className="flex flex-col h-full p-4" role="main" aria-labelledby="show-passphrase-title">
      <h2 id="show-passphrase-title" className="sr-only">Show Recovery Phrase</h2>
      {submissionError && <ErrorAlert message={submissionError} onClose={() => setSubmissionError("")} />}
      {!isConfirmed ? (
        <form action={handleFormAction} className="flex flex-col items-center justify-center flex-grow">
          <div className="max-w-md w-full bg-red-50 border-2 border-red-500 rounded-xl p-6 mb-6">
            <div className="flex items-center mb-4">
              <FaExclamationTriangle className="w-6 h-6 text-red-500 mr-2" aria-hidden="true" />
              <h3 className="text-xl font-bold text-red-700">Warning</h3>
            </div>
            <p className="text-red-700 font-medium leading-relaxed">
              Never share your recovery phrase with anyone. Anyone with these words can steal your funds!
            </p>
          </div>
          <div className="w-full max-w-md space-y-4">
            <PasswordInput
              name="password"
              placeholder="Enter your password"
              disabled={pending}
              innerRef={passwordInputRef}
            />
            <Button type="submit" disabled={pending} fullWidth color="red" aria-label="Show Recovery Phrase">
              {pending ? "Verifying..." : "Show Recovery Phrase"}
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
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <div className="flex items-center space-x-2 mb-2">
                <FaExclamationTriangle className="w-5 h-5 text-red-500" aria-hidden="true" />
                <p className="text-sm font-bold text-red-800">Security Notice</p>
              </div>
              <p className="text-sm text-red-700">
                Never share your recovery phrase. Anyone with these 12 words can steal your bitcoin!
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
