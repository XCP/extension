"use client";

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ErrorAlert } from "@/components/ui/error-alert";
import { Spinner } from "@/components/ui/spinner";
import { FiAlertTriangle, FiCheck } from "@/components/icons";
import { useHeader } from "@/contexts/header-context";
import { useWallet } from "@/contexts/wallet-context";
import { fetchBTCBalance } from "@/utils/blockchain/bitcoin/balance";
import { fetchTokenBalances } from "@/utils/blockchain/counterparty/api";
import { fromSatoshis } from "@/utils/numeric";
import type { ReactElement } from "react";

// Steps in the connection flow
type Step = "start" | "connecting" | "fetching-balances" | "confirm";

interface DiscoveryResult {
  address: string;
  btcBalance: number; // in satoshis
  hasCounterpartyAssets: boolean;
  assetCount: number;
}

export default function ConnectHardware(): ReactElement {
  const navigate = useNavigate();
  const { setHeaderProps } = useHeader();
  const { createHardwareWalletWithDiscovery, setHardwareOperationInProgress } = useWallet();

  // Flow state
  const [step, setStep] = useState<Step>("start");
  const [error, setError] = useState("");

  // User options
  const [usePassphrase, setUsePassphrase] = useState(false);
  const [walletName, setWalletName] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Discovery results
  const [discoveryResult, setDiscoveryResult] = useState<DiscoveryResult | null>(null);

  useEffect(() => {
    setHeaderProps({
      title: step === "confirm" ? "Wallet Found" : "Connect Trezor",
      onBack: () => {
        if (step === "confirm" || step === "fetching-balances") {
          setStep("start");
          setDiscoveryResult(null);
          setError("");
        } else {
          navigate(-1);
        }
      },
    });
  }, [setHeaderProps, navigate, step]);

  async function handleConnect() {
    setError("");
    setStep("connecting");
    // Pause idle timer during hardware wallet operation
    setHardwareOperationInProgress(true);

    try {
      // Reset adapter before connecting to ensure clean state
      // This fixes reconnection issues after disconnect or cancelled operations
      const { resetTrezorAdapter } = await import('@/utils/hardware/trezorAdapter');
      await resetTrezorAdapter();

      // Use account discovery - Trezor will show account selection UI
      const wallet = await createHardwareWalletWithDiscovery(
        "trezor",
        walletName || undefined,
        usePassphrase
      );

      // Get the first address from the wallet
      const firstAddress = wallet.addresses[0]?.address;

      if (!firstAddress) {
        throw new Error("Failed to derive address from device");
      }

      // Now fetch balances for this address
      setStep("fetching-balances");

      try {
        const [btcBalance, tokenBalances] = await Promise.all([
          fetchBTCBalance(firstAddress).catch(() => 0),
          fetchTokenBalances(firstAddress, { limit: 100 }).catch(() => []),
        ]);

        setDiscoveryResult({
          address: firstAddress,
          btcBalance,
          hasCounterpartyAssets: tokenBalances.length > 0,
          assetCount: tokenBalances.length,
        });

        setStep("confirm");
      } catch (balanceErr) {
        // Balance fetch failed but wallet was created - still show confirm
        console.warn("Balance fetch failed:", balanceErr);
        setDiscoveryResult({
          address: firstAddress,
          btcBalance: 0,
          hasCounterpartyAssets: false,
          assetCount: 0,
        });
        setStep("confirm");
      }

    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Failed to connect hardware wallet";

      // Provide helpful message for common Trezor errors
      if (errorMsg.includes("Taproot") || errorMsg.includes("P2TR")) {
        setError("Taproot requires newer Trezor firmware. Please update your firmware or try a different account type.");
      } else if (errorMsg.includes("cancelled") || errorMsg.includes("Cancelled")) {
        setError("Connection cancelled. Please try again when ready.");
      } else if (errorMsg.includes("discovery") || errorMsg.includes("Discovery")) {
        setError("Account discovery failed. Please ensure your Trezor is connected and unlocked.");
      } else {
        setError(errorMsg);
      }
      setStep("start");
    } finally {
      // Re-enable idle timer
      setHardwareOperationInProgress(false);
    }
  }

  function handleConfirm() {
    // Wallet is already created, just navigate to home
    navigate("/");
  }

  // Render based on current step
  if (step === "connecting") {
    return (
      <div className="flex flex-col items-center justify-center gap-6 p-8 min-h-[400px]">
        <Spinner />
        <div className="text-center">
          <h2 className="text-lg font-semibold mb-2 text-gray-900">Discovering Accounts...</h2>
          <p className="text-sm text-gray-600">
            Select your account on your Trezor device
          </p>
          <p className="text-xs text-gray-500 mt-2">
            Your device will show accounts with existing funds
          </p>
        </div>
      </div>
    );
  }

  if (step === "fetching-balances") {
    return (
      <div className="flex flex-col items-center justify-center gap-6 p-8 min-h-[400px]">
        <Spinner />
        <div className="text-center">
          <h2 className="text-lg font-semibold mb-2 text-gray-900">Checking Balances...</h2>
          <p className="text-sm text-gray-600">
            Looking for existing funds and assets
          </p>
        </div>
      </div>
    );
  }

  if (step === "confirm" && discoveryResult) {
    const btcAmount = fromSatoshis(discoveryResult.btcBalance, { asNumber: true });
    const hasAnything = discoveryResult.btcBalance > 0 || discoveryResult.hasCounterpartyAssets;

    return (
      <div className="flex flex-col gap-6 p-4">
        {/* Success indicator */}
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-100 flex items-center justify-center">
            <FiCheck className="w-8 h-8 text-green-500" />
          </div>
          <h2 className="text-xl font-semibold mb-2 text-gray-900">
            {hasAnything ? "Wallet Found!" : "Wallet Connected"}
          </h2>
        </div>

        {/* Address display */}
        <div className="bg-gray-100 rounded-lg p-4">
          <div className="text-xs text-gray-500 mb-1">Address</div>
          <div className="font-mono text-sm break-all text-gray-900">{discoveryResult.address}</div>
        </div>

        {/* Balance info */}
        <div className="bg-gray-100 rounded-lg p-4 space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-gray-600">Bitcoin Balance</span>
            <span className="font-semibold text-gray-900">
              {btcAmount > 0 ? `${btcAmount.toFixed(8)} BTC` : "0 BTC"}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-600">Counterparty Assets</span>
            <span className="font-semibold text-gray-900">
              {discoveryResult.assetCount > 0
                ? `${discoveryResult.assetCount} asset${discoveryResult.assetCount > 1 ? 's' : ''}`
                : "None found"
              }
            </span>
          </div>
        </div>

        {/* No funds info */}
        {!hasAnything && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-blue-700">
              No existing funds found. This is normal for a new account. You can receive Bitcoin or Counterparty assets at this address.
            </p>
          </div>
        )}

        {/* UTXO Safety Warning */}
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <FiAlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-medium text-amber-600 mb-1">UTXO Safety</h3>
              <p className="text-sm text-amber-700">
                If you use Counterparty features, only spend from this wallet using XCP Wallet to avoid losing attached assets.
              </p>
            </div>
          </div>
        </div>

        <Button onClick={handleConfirm} className="w-full">
          {hasAnything ? "Use This Wallet" : "Continue"}
        </Button>
      </div>
    );
  }

  // Default: start step
  return (
    <div className="flex flex-col gap-5 p-4">
      {/* Header */}
      <div className="text-center">
        <div className="text-5xl mb-3">🔐</div>
        <h2 className="text-lg font-semibold text-gray-900 mb-2">Connect Your Trezor</h2>
        <p className="text-sm text-gray-600">
          Your Trezor will discover your Bitcoin accounts and let you choose which one to use.
        </p>
      </div>

      {error && <ErrorAlert message={error} onClose={() => setError("")} />}

      {/* Prerequisites */}
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

      {/* Advanced Options */}
      {showAdvanced && (
        <div className="bg-gray-50 rounded-lg p-4 space-y-4">
          <h3 className="font-medium text-sm text-gray-900">Advanced Options</h3>

          {/* Passphrase Option */}
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="usePassphrase"
              checked={usePassphrase}
              onChange={(e) => setUsePassphrase(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 bg-white text-blue-500"
            />
            <label htmlFor="usePassphrase" className="text-sm">
              <span className="font-medium text-gray-900">Use passphrase</span>
              <span className="text-gray-600 block text-xs">
                For hidden/passphrase-protected wallets
              </span>
            </label>
          </div>

          {/* Wallet Name */}
          <div>
            <label className="block text-xs text-gray-600 mb-2">
              Wallet Name (optional)
            </label>
            <input
              type="text"
              value={walletName}
              onChange={(e) => setWalletName(e.target.value)}
              placeholder="My Trezor"
              className="w-full px-3 py-2 text-sm bg-white border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 text-gray-900"
            />
          </div>
        </div>
      )}

      {!showAdvanced && (
        <button
          onClick={() => setShowAdvanced(true)}
          className="text-xs text-gray-500 hover:text-gray-600"
        >
          ▸ Advanced options (passphrase, wallet name)
        </button>
      )}

      <Button onClick={handleConnect} className="w-full">
        Connect Trezor
      </Button>

      <p className="text-xs text-gray-500 text-center">
        Your private keys never leave your Trezor device.
      </p>
    </div>
  );
}
