"use client";

import { useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { useParams, useNavigate } from "react-router-dom";
import { FaExclamationTriangle } from "react-icons/fa";
import { Button } from "@/components/button";
import { ErrorAlert } from "@/components/error-alert";
import { PasswordInput } from "@/components/inputs/password-input";
import { useHeader } from "@/contexts/header-context";
import { useWallet } from "@/contexts/wallet-context";
import type { ReactElement } from "react";

const CONSTANTS = {
  MIN_PASSWORD_LENGTH: 8,
  COPY_FEEDBACK_DURATION: 2000,
  PATHS: { BACK: -1 } as const,
} as const;

export default function ShowPrivateKey(): ReactElement {
  const { walletId, addressPath } = useParams<{ walletId: string; addressPath?: string }>();
  const navigate = useNavigate();
  const { setHeaderProps } = useHeader();
  const { unlockWallet, getPrivateKey, verifyPassword, wallets } = useWallet();
  const { pending } = useFormStatus();

  const [privateKey, setPrivateKey] = useState("");
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [submissionError, setSubmissionError] = useState("");
  const [walletType, setWalletType] = useState<"mnemonic" | "privateKey" | null>(null);
  const [copiedToClipboard, setCopiedToClipboard] = useState(false);
  const passwordInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (walletId) {
      const wallet = wallets.find((w) => w.id === walletId);
      if (!wallet) {
        setSubmissionError("Wallet not found.");
      } else {
        setWalletType(wallet.type);
      }
    }
    setHeaderProps({
      title: "Private Key",
      onBack: () => navigate(CONSTANTS.PATHS.BACK),
    });
  }, [walletId, wallets, setHeaderProps, navigate]);

  useEffect(() => {
    passwordInputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (copiedToClipboard) {
      const timer = setTimeout(() => setCopiedToClipboard(false), CONSTANTS.COPY_FEEDBACK_DURATION);
      return () => clearTimeout(timer);
    }
  }, [copiedToClipboard]);

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
      await verifyPassword(password);
    } catch {
      setSubmissionError("Incorrect password.");
      return;
    }
    if (walletType === "mnemonic" && !addressPath) {
      setSubmissionError("Address derivation path is missing.");
      return;
    }

    try {
      await unlockWallet(walletId, password);
      const privKey =
        walletType === "privateKey"
          ? await getPrivateKey(walletId)
          : await getPrivateKey(walletId, addressPath);
      if (!privKey) throw new Error("Failed to retrieve private key");
      setPrivateKey(privKey);
      setIsConfirmed(true);
    } catch (err) {
      console.error("Error revealing private key:", err);
      setSubmissionError(err instanceof Error ? err.message : "Failed to reveal private key.");
    }
  }

  const handleCopyPrivateKey = async () => {
    try {
      await navigator.clipboard.writeText(privateKey);
      setCopiedToClipboard(true);
    } catch (err) {
      console.error("Failed to copy private key:", err);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleCopyPrivateKey();
    }
  };

  return (
    <div className="flex flex-col h-full p-4" role="main" aria-labelledby="show-private-key-title">
      <h2 id="show-private-key-title" className="sr-only">Show Private Key</h2>
      {submissionError && <ErrorAlert message={submissionError} onClose={() => setSubmissionError("")} />}
      {!isConfirmed ? (
        <form action={handleFormAction} className="flex flex-col items-center justify-center flex-grow">
          <div className="max-w-md w-full bg-red-50 border-2 border-red-500 rounded-xl p-6 mb-6">
            <div className="flex items-center mb-4">
              <FaExclamationTriangle className="w-6 h-6 text-red-500 mr-2" aria-hidden="true" />
              <h3 className="text-xl font-bold text-red-700">Warning</h3>
            </div>
            <p className="text-red-700 font-medium leading-relaxed">
              Never share your private key. Anyone with this sensitive string of letters can steal your funds!
            </p>
          </div>
          <div className="w-full max-w-md space-y-4">
            <PasswordInput
              name="password"
              placeholder="Enter your password"
              disabled={pending}
              innerRef={passwordInputRef}
            />
            <Button type="submit" disabled={pending} fullWidth color="red" aria-label="Show Private Key">
              {pending ? "Verifying..." : "Show Private Key"}
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-col items-center justify-center flex-grow">
          <div className="w-full max-w-md space-y-4">
            <div className="text-center mb-6">
              <h3 className="text-2xl font-bold text-gray-800 mb-2">Your Private Key</h3>
              <p className="text-sm text-gray-600">
                This is your private key. Never share it with anyone.
              </p>
            </div>
            <div
              onClick={handleCopyPrivateKey}
              onKeyDown={handleKeyDown}
              role="button"
              tabIndex={0}
              aria-label="Copy Private Key"
              className="font-mono text-sm bg-white border border-gray-200 rounded-lg p-4 break-all text-gray-800 select-all cursor-pointer hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors duration-200"
            >
              {privateKey}
            </div>
            <Button
              onClick={handleCopyPrivateKey}
              color="blue"
              fullWidth
              className="max-w-sm"
              aria-label="Copy Private Key"
            >
              {copiedToClipboard ? "Copied!" : "Copy Private Key"}
            </Button>
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <div className="flex items-center space-x-2 mb-2">
                <FaExclamationTriangle className="w-5 h-5 text-red-500" aria-hidden="true" />
                <p className="text-sm font-bold text-red-800">Security Notice</p>
              </div>
              <p className="text-sm text-red-700">
                Never share your private key. Anyone with access to this string can steal your bitcoin!
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
