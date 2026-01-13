
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
  const { unlockWallet, wallets, activeWallet } = useWallet();
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
        icon: <FiHelpCircle className="w-4 h-4" aria-hidden="true" />,
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
      if (!wallets.length) {
        throw new Error("No wallets found. Please create or import a wallet first.");
      }

      // Unlock the previously active wallet if it exists, otherwise the first wallet
      // This preserves the user's last active wallet selection after session timeout
      const walletToUnlock = activeWallet || wallets[0];
      await unlockWallet(walletToUnlock.id, password);

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
