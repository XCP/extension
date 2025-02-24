"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { FaExclamationTriangle } from "react-icons/fa";
import { Button } from "@/components/button";
import { ErrorAlert } from "@/components/error-alert";
import { PasswordInput } from "@/components/inputs/password-input";
import { useHeader } from "@/contexts/header-context";
import { useWallet } from "@/contexts/wallet-context";
import type { ReactElement } from "react";

/**
 * Constants for navigation paths and validation rules.
 */
const CONSTANTS = {
  MIN_PASSWORD_LENGTH: 8,
  COPY_FEEDBACK_DURATION: 2000,
  PATHS: {
    BACK: -1, // Using -1 for navigate(-1)
  } as const,
} as const;

/**
 * ShowPrivateKey component reveals a wallet's private key after password verification.
 *
 * Features:
 * - Requires password entry to unlock and display the private key
 * - Supports copying the key to clipboard with feedback
 * - Displays security warnings to emphasize confidentiality
 *
 * @returns {ReactElement} The rendered private key reveal UI.
 * @example
 * ```tsx
 * <ShowPrivateKey />
 * ```
 */
export default function ShowPrivateKey(): ReactElement {
  const { walletId, addressPath } = useParams<{ walletId: string; addressPath?: string }>();
  const navigate = useNavigate();
  const { setHeaderProps } = useHeader();
  const { unlockWallet, getPrivateKey, verifyPassword, wallets } = useWallet();

  const [password, setPassword] = useState("");
  const [privateKey, setPrivateKey] = useState("");
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [submissionError, setSubmissionError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [walletType, setWalletType] = useState<"mnemonic" | "privateKey" | null>(null);
  const [copiedToClipboard, setCopiedToClipboard] = useState(false);

  const passwordInputRef = useRef<HTMLInputElement>(null);

  // Configure header and set wallet type
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

  // Focus password input on mount
  useEffect(() => {
    passwordInputRef.current?.focus();
  }, []);

  // Handle copy feedback timeout
  useEffect(() => {
    if (copiedToClipboard) {
      const timer = setTimeout(() => setCopiedToClipboard(false), CONSTANTS.COPY_FEEDBACK_DURATION);
      return () => clearTimeout(timer);
    }
  }, [copiedToClipboard]);

  /**
   * Validates the password length.
   * @param pwd - The password to validate.
   * @returns {boolean} Whether the password is valid.
   */
  const isPasswordValid = (pwd: string): boolean => pwd.length >= CONSTANTS.MIN_PASSWORD_LENGTH;

  /**
   * Handles password input changes.
   */
  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    setPassword(e.target.value);
    setPasswordError("");
    setSubmissionError("");
  };

  /**
   * Validates the form before revealing the private key.
   * @returns {Promise<boolean>} Whether the form is valid.
   */
  const validateForm = async (): Promise<boolean> => {
    if (!walletId) {
      setSubmissionError("Invalid wallet.");
      return false;
    }
    if (!password) {
      setPasswordError("Password is required.");
      return false;
    }
    if (!isPasswordValid(password)) {
      setPasswordError(`Password must be at least ${CONSTANTS.MIN_PASSWORD_LENGTH} characters.`);
      return false;
    }
    try {
      await verifyPassword(password);
    } catch {
      setPasswordError("Incorrect password.");
      return false;
    }
    if (walletType === "mnemonic" && !addressPath) {
      setSubmissionError("Address derivation path is missing.");
      return false;
    }
    return true;
  };

  /**
   * Reveals the private key after successful validation.
   */
  const revealPrivateKey = async (): Promise<void> => {
    setIsLoading(true);
    try {
      if (!walletId) throw new Error("Wallet ID is required.");
      await unlockWallet(walletId, password);
      const privKey =
        walletType === "privateKey"
          ? await getPrivateKey(walletId)
          : await getPrivateKey(walletId, addressPath);
      if (!privKey) throw new Error("Failed to retrieve private key");
      setPrivateKey(privKey);
      setIsConfirmed(true);
      setError(null);
    } catch (err) {
      console.error("Error revealing private key:", err);
      setSubmissionError(err instanceof Error ? err.message : "Failed to reveal private key.");
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Handles form submission to reveal the private key.
   */
  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setSubmissionError("");
    setPasswordError("");
    const valid = await validateForm();
    if (valid) await revealPrivateKey();
  };

  /**
   * Copies the private key to the clipboard.
   */
  const handleCopyPrivateKey = async () => {
    try {
      await navigator.clipboard.writeText(privateKey);
      setCopiedToClipboard(true);
    } catch (err) {
      console.error("Failed to copy private key:", err);
    }
  };

  /**
   * Handles keyboard events for copying the private key.
   */
  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleCopyPrivateKey();
    }
  };

  return (
    <div className="flex flex-col h-full p-4" role="main" aria-labelledby="show-private-key-title">
      <h2 id="show-private-key-title" className="sr-only">
        Show Private Key
      </h2>
      {submissionError && <ErrorAlert message={submissionError} onClose={() => setSubmissionError("")} />}
      {!isConfirmed ? (
        <form onSubmit={handleSubmit} className="flex flex-col items-center justify-center flex-grow">
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
              id="password"
              ref={passwordInputRef}
              value={password}
              onChange={handlePasswordChange}
              placeholder="Enter your password"
              error={passwordError}
              ariaLabel="Password"
              variant="warning"
              disabled={isLoading}
            />
            <Button
              type="submit"
              disabled={isLoading}
              fullWidth
              color="red"
              aria-label="Show Private Key"
            >
              {isLoading ? "Verifying..." : "Show Private Key"}
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
