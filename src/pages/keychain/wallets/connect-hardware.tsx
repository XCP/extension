"use client";

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ErrorAlert } from "@/components/ui/error-alert";
import { Spinner } from "@/components/ui/spinner";
import { FiHelpCircle, FiShield } from "@/components/icons";
import { useHeader } from "@/contexts/header-context";
import { useWallet } from "@/contexts/wallet-context";
import type { ReactElement } from "react";

export default function ConnectHardware(): ReactElement {
  const navigate = useNavigate();
  const { setHeaderProps } = useHeader();
  const { createHardwareWalletWithDiscovery, setHardwareOperationInProgress } = useWallet();

  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setHeaderProps({
      title: "Connect Trezor",
      onBack: () => navigate(-1),
      rightButton: {
        icon: <FiHelpCircle className="size-4" aria-hidden="true" />,
        onClick: () => window.open("#", "_blank"),
        ariaLabel: "Help",
      },
    });
  }, [setHeaderProps, navigate]);

  async function handleConnect() {
    setError("");
    setIsConnecting(true);
    setHardwareOperationInProgress(true);

    try {
      // Reset adapter before connecting to ensure clean state
      const { resetTrezorAdapter } = await import('@/utils/hardware/trezorAdapter');
      await resetTrezorAdapter();

      // Use account discovery - Trezor will show account selection UI
      await createHardwareWalletWithDiscovery("trezor");

      // Success - go straight to index
      navigate("/index");
    } catch (err) {
      console.error('[ConnectHardware] Error:', err);
      const errorMsg = err instanceof Error ? err.message : "Failed to connect hardware wallet";

      if (errorMsg.includes("Taproot") || errorMsg.includes("P2TR")) {
        setError("Taproot requires newer Trezor firmware. Please update your firmware or try a different account type.");
      } else if (errorMsg.includes("cancelled") || errorMsg.includes("Cancelled")) {
        setError("Connection cancelled. Please try again when ready.");
      } else {
        setError(errorMsg);
      }
    } finally {
      setIsConnecting(false);
      setHardwareOperationInProgress(false);
    }
  }

  if (isConnecting) {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center p-8">
        <Spinner />
        <div className="text-center mt-6">
          <h2 className="text-lg font-semibold mb-2 text-gray-900">Connecting...</h2>
          <p className="text-sm text-gray-600">
            Select your account on your Trezor device
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col justify-center h-full p-4">
      <div className="flex flex-col gap-5">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[#00854D]/10 flex items-center justify-center">
            <FiShield className="w-8 h-8 text-[#00854D]" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Connect Your Trezor</h2>
          <p className="text-sm text-gray-600">
            Your Trezor will discover your Bitcoin accounts and let you choose which one to use.
          </p>
        </div>

        {error && <ErrorAlert message={error} onClose={() => setError("")} />}

        <div className="bg-gray-50 rounded-lg p-4">
          <h3 className="text-sm font-medium text-gray-700 mb-3">Before connecting:</h3>
          <ul className="text-sm text-gray-600 space-y-2">
            <li className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-gray-200 flex items-center justify-center text-xs">1</span>
              Connect your Trezor via USB
            </li>
            <li className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-gray-200 flex items-center justify-center text-xs">2</span>
              Unlock your device with PIN
            </li>
            <li className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-gray-200 flex items-center justify-center text-xs">3</span>
              Select your account when prompted
            </li>
          </ul>
        </div>

        <Button onClick={handleConnect} className="w-full">
          Connect Trezor
        </Button>

        <p className="text-xs text-gray-500 text-center">
          Your private keys never leave your Trezor device.
        </p>
      </div>
    </div>
  );
}
