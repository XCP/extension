"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { FaCopy, FaCheck, FaInfoCircle, FaExclamationTriangle } from "@/components/icons";
import { Button } from "@/components/button";
import { ErrorAlert } from "@/components/error-alert";
import { PasswordInput } from "@/components/inputs/password-input";
import { useHeader } from "@/contexts/header-context";
import { useWallet } from "@/contexts/wallet-context";
import { getVendorLabel } from "@/utils/hardware";
import type { ReactElement } from "react";

const CONSTANTS = {
  MIN_PASSWORD_LENGTH: 8,
  PATHS: { BACK: "/select-wallet" } as const,
} as const;

/**
 * ShowXpub - Displays the extended public key for a hardware wallet
 *
 * The xpub is a public key that can be used to:
 * - Generate all receiving addresses for the wallet
 * - Create watch-only wallets
 * - Verify address derivation
 *
 * Unlike the mnemonic/private key, the xpub cannot be used to spend funds,
 * but it does reveal your transaction history so we require authentication.
 */
export default function ShowXpub(): ReactElement {
  const { walletId } = useParams<{ walletId: string }>();
  const navigate = useNavigate();
  const { setHeaderProps } = useHeader();
  const { wallets, unlockWallet } = useWallet();

  const [isConfirmed, setIsConfirmed] = useState(false);
  const [submissionError, setSubmissionError] = useState("");
  const [copied, setCopied] = useState(false);
  const [pending, setPending] = useState(false);
  const passwordInputRef = useRef<HTMLInputElement>(null);

  // Find the wallet
  const wallet = wallets.find((w) => w.id === walletId);
  const xpub = wallet?.hardwareData?.xpub;
  const vendorLabel = getVendorLabel(wallet?.hardwareData?.vendor);

  useEffect(() => {
    setHeaderProps({
      title: "Extended Public Key",
      onBack: () => navigate(CONSTANTS.PATHS.BACK),
    });
  }, [setHeaderProps, navigate]);

  useEffect(() => {
    passwordInputRef.current?.focus();
  }, []);

  async function handleFormAction(formData: FormData) {
    setSubmissionError("");
    setPending(true);

    const password = formData.get("password") as string;
    if (!walletId) {
      setSubmissionError("Invalid wallet.");
      setPending(false);
      return;
    }
    if (!password) {
      setSubmissionError("Password is required.");
      setPending(false);
      return;
    }
    if (password.length < CONSTANTS.MIN_PASSWORD_LENGTH) {
      setSubmissionError(`Password must be at least ${CONSTANTS.MIN_PASSWORD_LENGTH} characters.`);
      setPending(false);
      return;
    }
    try {
      await unlockWallet(walletId, password);
      setIsConfirmed(true);
    } catch (err) {
      console.error("Error revealing xpub:", err);
      setSubmissionError("Incorrect password.");
    } finally {
      setPending(false);
    }
  }

  const handleCopy = async () => {
    if (!xpub) return;
    try {
      await navigator.clipboard.writeText(xpub);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  if (!wallet || wallet.type !== 'hardware' || !xpub) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-4">
        <p className="text-gray-600 mb-4">
          {!wallet
            ? "Wallet not found."
            : wallet.type !== 'hardware'
              ? "Extended public key is only available for hardware wallets."
              : "No extended public key available."
          }
        </p>
        <Button onClick={() => navigate("/select-wallet")} color="blue">
          Back to Wallets
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full p-4" role="main" aria-labelledby="show-xpub-title">
      <h2 id="show-xpub-title" className="sr-only">Show Extended Public Key</h2>
      {submissionError && <ErrorAlert message={submissionError} onClose={() => setSubmissionError("")} />}

      {!isConfirmed ? (
        <form action={handleFormAction} className="flex flex-col items-center justify-center flex-grow">
          <div className="max-w-md w-full bg-amber-50 border-2 border-amber-500 rounded-xl p-6 mb-6">
            <div className="flex items-center mb-4">
              <FaExclamationTriangle className="w-6 h-6 text-amber-500 mr-2" aria-hidden="true" />
              <h3 className="text-xl font-bold text-amber-700">Privacy Notice</h3>
            </div>
            <p className="text-amber-700 font-medium leading-relaxed">
              Your xPub can reveal your entire transaction history. Only share it with trusted services.
            </p>
          </div>
          <div className="w-full max-w-md space-y-4">
            <PasswordInput
              name="password"
              placeholder="Enter your password"
              disabled={pending}
              innerRef={passwordInputRef}
            />
            <Button type="submit" disabled={pending} fullWidth color="blue" aria-label="Show xPub">
              {pending ? "Verifying..." : "Show xPub"}
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-col flex-grow">
          {/* Info banner */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <div className="flex items-start gap-3">
              <FaInfoCircle className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-medium text-blue-800 mb-1">What is an xPub?</h3>
                <p className="text-sm text-blue-700">
                  An extended public key (xPub) can generate all your wallet's receiving addresses.
                  It's safe to share for watch-only wallets but keep it private to protect your transaction history.
                </p>
              </div>
            </div>
          </div>

          {/* Wallet info */}
          <div className="mb-4">
            <p className="text-sm text-gray-500">
              {vendorLabel} • {wallet.name}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              Account {wallet.hardwareData?.accountIndex ?? 0} • {wallet.addressFormat}
            </p>
          </div>

          {/* xPub display */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-4">
            <label className="block text-xs text-gray-500 mb-2 font-medium">
              Extended Public Key
            </label>
            <div className="font-mono text-sm break-all text-gray-800 select-all">
              {xpub}
            </div>
          </div>

          {/* Copy button */}
          <Button
            onClick={handleCopy}
            color={copied ? "green" : "blue"}
            fullWidth
            className="mb-4"
          >
            {copied ? (
              <span className="flex items-center justify-center gap-2">
                <FaCheck className="w-4 h-4" />
                Copied!
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                <FaCopy className="w-4 h-4" />
                Copy xPub
              </span>
            )}
          </Button>

          {/* Usage notes */}
          <div className="mt-auto">
            <h4 className="text-sm font-medium text-gray-700 mb-2">Common uses:</h4>
            <ul className="text-xs text-gray-500 space-y-1">
              <li>• Create a watch-only wallet in another app</li>
              <li>• Verify your wallet is generating correct addresses</li>
              <li>• Portfolio tracking without exposing private keys</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
