
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { FiHelpCircle } from "@/components/icons";
import { UnlockScreen } from "@/components/screens/unlock-screen";
import { useHeader } from "@/contexts/header-context";
import { useWallet } from "@/contexts/wallet-context";
import { getDisplayVersion } from "@/utils/version";

const UnlockWallet = () => {
  const navigate = useNavigate();
  const { unlockKeychain } = useWallet();
  const { setHeaderProps } = useHeader();
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const PATHS = {
    SUCCESS: "/index",
    HELP_URL: "https://youtube.com/droplister",
  } as const;

  useEffect(() => {
    setHeaderProps({
      useLogoTitle: true,
      rightButton: {
        icon: <FiHelpCircle className="size-4" aria-hidden="true" />,
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
      // Unlock the keychain with password
      // This decrypts the vault and auto-loads the last active wallet
      await unlockKeychain(password);

      // Navigate to main page after unlock
      navigate(PATHS.SUCCESS);
    } catch (err) {
      console.error("Error unlocking wallet:", err);

      // Re-throw error so UnlockScreen can handle it
      throw new Error(
        err instanceof Error && err.message.includes("No wallet")
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
      subtitle={getDisplayVersion()}
      onUnlock={handleUnlock}
      error={error}
      isSubmitting={isUnlocking}
      placeholder="Enter your password"
      submitText="Unlock"
    />
  );
};

export default UnlockWallet;
