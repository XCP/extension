"use client";

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { FiHelpCircle } from "react-icons/fi";
import { UnlockScreen } from "@/components/screens/unlock-screen";
import { useHeader } from "@/contexts/header-context";
import { useWallet } from "@/contexts/wallet-context";

const UnlockWallet = () => {
  const navigate = useNavigate();
  const { unlockWallet, wallets } = useWallet();
  const { setHeaderProps } = useHeader();
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const PATHS = {
    SUCCESS: "/index",
    HELP_URL: "https://youtube.com", // Replace with actual help URL
  } as const;

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

  /**
   * Handle password unlock
   */
  const handleUnlock = async (password: string): Promise<void> => {
    setError(undefined);
    setIsUnlocking(true);

    try {
      if (!wallets.length) {
        throw new Error("No wallets found. Please create or import a wallet first.");
      }
      
      const walletId = wallets[0].id;
      await unlockWallet(walletId, password);
      navigate(PATHS.SUCCESS);
    } catch (err) {
      console.error("Error unlocking wallet:", err);
      
      // Re-throw error so UnlockScreen can handle it
      throw new Error(
        err instanceof Error && err.message.includes("No wallets")
          ? err.message
          : "Invalid password. Please try again."
      );
    } finally {
      setIsUnlocking(false);
    }
  };

  return (
    <UnlockScreen
      title="XCP Wallet"
      subtitle="v0.0.1"
      onUnlock={handleUnlock}
      error={error}
      isSubmitting={isUnlocking}
      placeholder="Enter your password"
      submitText="Unlock"
    />
  );
};

export default UnlockWallet;
