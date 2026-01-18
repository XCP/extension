"use client";

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/button";
import { ErrorAlert } from "@/components/error-alert";
import { Spinner } from "@/components/spinner";
import { FiAlertTriangle, FiCheck, FiChevronRight } from "@/components/icons";
import { useHeader } from "@/contexts/header-context";
import { useWallet } from "@/contexts/wallet-context";
import { AddressFormat } from "@/utils/blockchain/bitcoin/address";
import { fetchBTCBalance } from "@/utils/blockchain/bitcoin/balance";
import { fetchTokenBalances } from "@/utils/blockchain/counterparty/api";
import { fromSatoshis } from "@/utils/numeric";
import type { ReactElement } from "react";

// Steps in the connection flow
type Step = "select-format" | "connecting" | "discovery" | "confirm";

const ADDRESS_FORMAT_OPTIONS = [
  {
    value: AddressFormat.P2WPKH,
    label: "Native SegWit",
    prefix: "bc1q...",
    description: "Most common format since 2020. Lower fees than Legacy.",
    recommended: true,
  },
  {
    value: AddressFormat.P2TR,
    label: "Taproot",
    prefix: "bc1p...",
    description: "Newest format. Best privacy and lowest fees.",
    firmware: "Requires firmware 2.4.3+ (Model T) or 1.10.4+ (Model One)",
  },
  {
    value: AddressFormat.P2PKH,
    label: "Legacy",
    prefix: "1...",
    description: "Original Bitcoin format. Highest fees but most compatible.",
  },
  {
    value: AddressFormat.P2SH_P2WPKH,
    label: "Nested SegWit",
    prefix: "3...",
    description: "Transitional format. Compatibility with older systems.",
  },
] as const;

// Account options (hidden by default, for troubleshooting)
const ACCOUNT_OPTIONS = [0, 1, 2, 3, 4] as const;

interface DiscoveryResult {
  address: string;
  btcBalance: number; // in satoshis
  hasCounterpartyAssets: boolean;
  assetCount: number;
}

export default function ConnectHardware(): ReactElement {
  const navigate = useNavigate();
  const { setHeaderProps } = useHeader();
  const { createHardwareWallet } = useWallet();

  // Flow state
  const [step, setStep] = useState<Step>("select-format");
  const [error, setError] = useState("");

  // User selections
  const [addressFormat, setAddressFormat] = useState<AddressFormat>(AddressFormat.P2WPKH);
  const [accountIndex, setAccountIndex] = useState(0);
  const [usePassphrase, setUsePassphrase] = useState(false);
  const [walletName, setWalletName] = useState("");

  // Discovery results
  const [discoveryResult, setDiscoveryResult] = useState<DiscoveryResult | null>(null);
  const [isDiscovering, setIsDiscovering] = useState(false);

  // Troubleshooting mode
  const [showTroubleshooting, setShowTroubleshooting] = useState(false);

  useEffect(() => {
    setHeaderProps({
      title: step === "confirm" ? "Wallet Found" : "Connect Trezor",
      onBack: () => {
        if (step === "confirm" || step === "discovery") {
          setStep("select-format");
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

    try {
      // Create the hardware wallet
      const wallet = await createHardwareWallet(
        "trezor",
        addressFormat,
        accountIndex,
        walletName || undefined,
        usePassphrase
      );

      // Get the first address from the wallet
      const firstAddress = wallet.addresses[0]?.address;

      if (!firstAddress) {
        throw new Error("Failed to derive address from device");
      }

      // Now discover what's on this address
      setStep("discovery");
      setIsDiscovering(true);

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
      } catch (discoveryErr) {
        // Discovery failed but wallet was created - still show confirm
        console.warn("Discovery failed:", discoveryErr);
        setDiscoveryResult({
          address: firstAddress,
          btcBalance: 0,
          hasCounterpartyAssets: false,
          assetCount: 0,
        });
        setStep("confirm");
      } finally {
        setIsDiscovering(false);
      }

    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Failed to connect hardware wallet";

      // Provide helpful message for common Trezor errors
      if (errorMsg.includes("Taproot") || errorMsg.includes("P2TR")) {
        setError("Taproot requires newer Trezor firmware. Please update your firmware or select a different address format.");
      } else if (errorMsg.includes("cancelled") || errorMsg.includes("Cancelled")) {
        setError("Connection cancelled. Please try again when ready.");
      } else {
        setError(errorMsg);
      }
      setStep("select-format");
    }
  }

  function handleConfirm() {
    // Wallet is already created, just navigate to home
    navigate("/");
  }

  function handleTryDifferentFormat() {
    setStep("select-format");
    setDiscoveryResult(null);
    setShowTroubleshooting(true);
  }

  // Render based on current step
  if (step === "connecting") {
    return (
      <div className="flex flex-col items-center justify-center gap-6 p-8 min-h-[400px]">
        <Spinner />
        <div className="text-center">
          <h2 className="text-lg font-semibold mb-2">Connecting to Trezor...</h2>
          <p className="text-sm text-gray-400">
            Please confirm the connection on your device
          </p>
        </div>
      </div>
    );
  }

  if (step === "discovery") {
    return (
      <div className="flex flex-col items-center justify-center gap-6 p-8 min-h-[400px]">
        <Spinner />
        <div className="text-center">
          <h2 className="text-lg font-semibold mb-2">Checking Wallet...</h2>
          <p className="text-sm text-gray-400">
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
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-500/20 flex items-center justify-center">
            <FiCheck className="w-8 h-8 text-green-500" />
          </div>
          <h2 className="text-xl font-semibold mb-2">
            {hasAnything ? "Wallet Found!" : "Wallet Connected"}
          </h2>
        </div>

        {/* Address display */}
        <div className="bg-gray-800 rounded-lg p-4">
          <div className="text-xs text-gray-400 mb-1">Address</div>
          <div className="font-mono text-sm break-all">{discoveryResult.address}</div>
        </div>

        {/* Balance info */}
        <div className="bg-gray-800 rounded-lg p-4 space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-gray-400">Bitcoin Balance</span>
            <span className="font-semibold">
              {btcAmount > 0 ? `${btcAmount.toFixed(8)} BTC` : "0 BTC"}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-400">Counterparty Assets</span>
            <span className="font-semibold">
              {discoveryResult.assetCount > 0
                ? `${discoveryResult.assetCount} asset${discoveryResult.assetCount > 1 ? 's' : ''}`
                : "None found"
              }
            </span>
          </div>
        </div>

        {/* No funds warning */}
        {!hasAnything && (
          <div className="bg-blue-900/30 border border-blue-500/50 rounded-lg p-4">
            <p className="text-sm text-blue-200">
              No existing funds found on this address. This could be a new wallet, or your funds may be on a different address format or account.
            </p>
            <button
              onClick={handleTryDifferentFormat}
              className="mt-3 text-sm text-blue-400 hover:text-blue-300 flex items-center gap-1"
            >
              Try a different format or account
              <FiChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* UTXO Safety Warning */}
        <div className="bg-amber-900/30 border border-amber-600/50 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <FiAlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-medium text-amber-500 mb-1">UTXO Safety</h3>
              <p className="text-sm text-amber-200/80">
                If you use Counterparty features, only spend from this wallet using XCP Wallet to avoid losing attached assets.
              </p>
            </div>
          </div>
        </div>

        <Button onClick={handleConfirm} className="w-full">
          {hasAnything ? "Use This Wallet" : "Continue with Empty Wallet"}
        </Button>
      </div>
    );
  }

  // Default: select-format step
  return (
    <div className="flex flex-col gap-5 p-4">
      {/* Header */}
      <div className="text-center">
        <div className="text-5xl mb-3">🔐</div>
        <p className="text-sm text-gray-400">
          Select the address format that matches your existing Trezor wallet
        </p>
      </div>

      {error && <ErrorAlert message={error} onClose={() => setError("")} />}

      {/* Address Format Selection */}
      <div className="space-y-2">
        {ADDRESS_FORMAT_OPTIONS.map((option) => (
          <button
            key={option.value}
            onClick={() => setAddressFormat(option.value)}
            className={`w-full text-left p-4 rounded-lg border-2 transition-colors ${
              addressFormat === option.value
                ? "border-blue-500 bg-blue-500/10"
                : "border-gray-700 bg-gray-800/50 hover:border-gray-600"
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="font-medium">
                {option.label}
                {"recommended" in option && option.recommended && (
                  <span className="ml-2 text-xs px-2 py-0.5 bg-blue-500/30 text-blue-300 rounded">
                    Recommended
                  </span>
                )}
              </span>
              <span className="text-gray-400 font-mono text-sm">{option.prefix}</span>
            </div>
            <p className="text-xs text-gray-400">{option.description}</p>
            {"firmware" in option && option.firmware && (
              <p className="text-xs text-amber-400 mt-1">{option.firmware}</p>
            )}
          </button>
        ))}
      </div>

      {/* Troubleshooting / Advanced Options */}
      {showTroubleshooting && (
        <div className="bg-gray-800/50 rounded-lg p-4 space-y-4">
          <h3 className="font-medium text-sm">Troubleshooting Options</h3>

          {/* Account Selection */}
          <div>
            <label className="block text-xs text-gray-400 mb-2">
              Account Index (most users use Account 0)
            </label>
            <div className="flex gap-2">
              {ACCOUNT_OPTIONS.map((idx) => (
                <button
                  key={idx}
                  onClick={() => setAccountIndex(idx)}
                  className={`px-3 py-1.5 rounded text-sm ${
                    accountIndex === idx
                      ? "bg-blue-500 text-white"
                      : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                  }`}
                >
                  {idx}
                </button>
              ))}
            </div>
          </div>

          {/* Passphrase Option */}
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="usePassphrase"
              checked={usePassphrase}
              onChange={(e) => setUsePassphrase(e.target.checked)}
              className="w-4 h-4 rounded border-gray-700 bg-gray-800 text-blue-500"
            />
            <label htmlFor="usePassphrase" className="text-sm">
              <span className="font-medium">Use passphrase</span>
              <span className="text-gray-400 block text-xs">
                For hidden/passphrase-protected wallets
              </span>
            </label>
          </div>

          {/* Wallet Name */}
          <div>
            <label className="block text-xs text-gray-400 mb-2">
              Wallet Name (optional)
            </label>
            <input
              type="text"
              value={walletName}
              onChange={(e) => setWalletName(e.target.value)}
              placeholder="My Trezor"
              className="w-full px-3 py-2 text-sm bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>
      )}

      {!showTroubleshooting && (
        <button
          onClick={() => setShowTroubleshooting(true)}
          className="text-xs text-gray-500 hover:text-gray-400"
        >
          ▸ Advanced options (account selection, passphrase)
        </button>
      )}

      {/* Prerequisites */}
      <div className="bg-gray-800/50 rounded-lg p-3">
        <h3 className="text-xs font-medium text-gray-300 mb-2">Before connecting:</h3>
        <ul className="text-xs text-gray-400 space-y-1">
          <li>• Trezor connected via USB</li>
          <li>• Device unlocked with PIN</li>
        </ul>
      </div>

      <Button onClick={handleConnect} className="w-full">
        Connect Trezor
      </Button>

      <p className="text-xs text-gray-500 text-center">
        Your private keys never leave your Trezor device.
      </p>
    </div>
  );
}
