
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { FiHelpCircle } from "@/components/icons";
import { UnlockScreen } from "@/components/screens/unlock-screen";
import { useHeader } from "@/contexts/header-context";
import { useWallet } from "@/contexts/wallet-context";
import { getDisplayVersion } from "@/utils/version";
import { getProviderService } from '@/services/providerService';

const UnlockWallet = () => {
  const navigate = useNavigate();
  const { unlockKeychain } = useWallet();
  const { setHeaderProps } = useHeader();
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [pendingApprovals, setPendingApprovals] = useState(false);
  const [onUnlockDestination, setOnUnlockDestination] = useState<string | null>(null);

  const PATHS = {
    SUCCESS: "/index",
    APPROVE: "/provider/approval-queue",
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

  // Check for pending approvals on mount
  useEffect(() => {
    const checkPendingApprovals = async () => {
      try {
        const providerService = getProviderService();
        const approvalQueue = await providerService.getApprovalQueue();

        if (approvalQueue.length > 0) {
          setPendingApprovals(true);
          setOnUnlockDestination(PATHS.APPROVE);
        }
      } catch (error) {
        console.debug('Failed to check approval queue:', error);
      }
    };

    // Also check for any pending unlock-connection messages from the background
    const handleMessage = (message: any) => {
      if (message.type === 'NAVIGATE_TO_APPROVAL_QUEUE' ||
          message.type === 'pending-unlock-connection') {
        setPendingApprovals(true);
        setOnUnlockDestination(PATHS.APPROVE);
      }
    };

    checkPendingApprovals();

    // Listen for messages from background
    chrome.runtime.onMessage.addListener(handleMessage);

    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage);
    };
  }, []);

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

      // Navigate to the appropriate destination
      // Priority: onUnlockDestination > approval queue > default success
      if (onUnlockDestination) {
        navigate(onUnlockDestination);
      } else if (pendingApprovals) {
        navigate(PATHS.APPROVE);
      } else {
        navigate(PATHS.SUCCESS);
      }
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
