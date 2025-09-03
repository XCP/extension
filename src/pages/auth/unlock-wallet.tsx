"use client";

import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { FiHelpCircle } from "react-icons/fi";
import { Button } from "@/components/button";
import { PasswordInput } from "@/components/inputs/password-input";
import { useHeader } from "@/contexts/header-context";
import { useWallet } from "@/contexts/wallet-context";

const UnlockWallet = () => {
  const navigate = useNavigate();
  const { unlockWallet, wallets } = useWallet();
  const { setHeaderProps } = useHeader();
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [password, setPassword] = useState("");
  const passwordInputRef = useRef<HTMLInputElement>(null);

  const PATHS = {
    SUCCESS: "/index",
    HELP_URL: "https://youtube.com", // Replace with actual help URL
  } as const;
  const MIN_PASSWORD_LENGTH = 8;

  useEffect(() => {
    setHeaderProps({
      useLogoTitle: true,
      rightButton: {
        icon: <FiHelpCircle className="w-4 h-4" aria-hidden="true" />,
        onClick: () => window.open(PATHS.HELP_URL, "_blank"),
        ariaLabel: "Help",
      },
    });
  }, [setHeaderProps]);

  useEffect(() => {
    passwordInputRef.current?.focus();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(undefined);

    if (!password) {
      setError("Password cannot be empty.");
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }

    setIsUnlocking(true);
    try {
      if (!wallets.length) {
        throw new Error("No wallets found.");
      }
      const walletId = wallets[0].id;
      await unlockWallet(walletId, password);
      navigate(PATHS.SUCCESS);
    } catch (err) {
      console.error("Error unlocking wallet:", err);
      setError("Invalid password. Please try again.");
    } finally {
      setIsUnlocking(false);
    }
  };

  return (
    <div className="flex flex-col h-full" role="main" aria-labelledby="unlock-wallet-title">
      <div className="flex-grow flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-lg shadow-md p-6">
          <h1 id="unlock-wallet-title" className="text-3xl mb-5 flex justify-between items-center">
            <span className="font-bold">XCP Wallet</span>
            <span className="text-base font-normal text-gray-500">v0.0.1</span>
          </h1>
          <form onSubmit={handleSubmit} className="space-y-4">
            <PasswordInput
              name="password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isUnlocking}
              innerRef={passwordInputRef}
            />
            {error && (
              <p className="text-red-500 text-sm" role="alert">
                {error}
              </p>
            )}
            <Button type="submit" fullWidth disabled={isUnlocking} aria-label="Unlock Wallet">
              {isUnlocking ? "Unlocking..." : "Unlock"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default UnlockWallet;
