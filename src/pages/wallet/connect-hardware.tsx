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
import type { HardwareWalletVendor } from "@/utils/hardware/types";
import {
  detectAllDevices,
  getConnectionInstructions,
  getVendorConfirmInstructions,
  type DeviceDetectionResult,
} from "@/utils/hardware";
import type { ReactElement } from "react";

// Steps in the connection flow
type Step = "select-vendor" | "select-format" | "connecting" | "discovery" | "confirm";

// Vendor options
const VENDOR_OPTIONS: { value: HardwareWalletVendor; label: string; icon: string; description: string }[] = [
  {
    value: "trezor",
    label: "Trezor",
    icon: "🔐",
    description: "Trezor Model T, Model One, Safe 3, Safe 5",
  },
  {
    value: "ledger",
    label: "Ledger",
    icon: "🔑",
    description: "Nano S, Nano S Plus, Nano X, Stax, Flex",
  },
];

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
    firmware: "Requires recent firmware",
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
  const [step, setStep] = useState<Step>("select-vendor");
  const [error, setError] = useState("");

  // User selections
  const [vendor, setVendor] = useState<HardwareWalletVendor | null>(null);
  const [addressFormat, setAddressFormat] = useState<AddressFormat>(AddressFormat.P2WPKH);
  const [accountIndex, setAccountIndex] = useState(0);
  const [usePassphrase, setUsePassphrase] = useState(false);
  const [walletName, setWalletName] = useState("");

  // Discovery results
  const [discoveryResult, setDiscoveryResult] = useState<DiscoveryResult | null>(null);
  const [isDiscovering, setIsDiscovering] = useState(false);

  // Troubleshooting mode
  const [showTroubleshooting, setShowTroubleshooting] = useState(false);

  // Device detection
  const [detectionState, setDetectionState] = useState<{
    checked: boolean;
    trezor: DeviceDetectionResult | null;
    ledger: DeviceDetectionResult | null;
  }>({ checked: false, trezor: null, ledger: null });

  // Get the vendor label for display
  const vendorLabel = VENDOR_OPTIONS.find(v => v.value === vendor)?.label ?? "Hardware Wallet";

  // Check for connected devices on mount
  useEffect(() => {
    async function checkDevices() {
      try {
        const result = await detectAllDevices();
        setDetectionState({
          checked: true,
          trezor: result.trezor,
          ledger: result.ledger,
        });
      } catch (err) {
        console.warn("Device detection failed:", err);
        setDetectionState({ checked: true, trezor: null, ledger: null });
      }
    }
    checkDevices();
  }, []);

  useEffect(() => {
    let title = "Connect Hardware Wallet";
    if (step === "select-format" && vendor) {
      title = `Connect ${vendorLabel}`;
    } else if (step === "confirm") {
      title = "Wallet Found";
    }

    setHeaderProps({
      title,
      onBack: () => {
        if (step === "confirm" || step === "discovery") {
          setStep("select-format");
          setDiscoveryResult(null);
          setError("");
        } else if (step === "select-format") {
          setStep("select-vendor");
          setVendor(null);
        } else {
          navigate(-1);
        }
      },
    });
  }, [setHeaderProps, navigate, step, vendor, vendorLabel]);

  function handleVendorSelect(selectedVendor: HardwareWalletVendor) {
    setVendor(selectedVendor);
    setStep("select-format");
  }

  async function handleConnect() {
    if (!vendor) {
      setError("Please select a hardware wallet type");
      setStep("select-vendor");
      return;
    }

    setError("");
    setStep("connecting");

    try {
      // Create the hardware wallet
      const wallet = await createHardwareWallet(
        vendor,
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

      // Provide helpful message for common errors
      if (errorMsg.includes("Taproot") || errorMsg.includes("P2TR")) {
        setError("Taproot requires newer firmware. Please update your firmware or select a different address format.");
      } else if (errorMsg.includes("cancelled") || errorMsg.includes("Cancelled") || errorMsg.includes("USER_CANCELLED")) {
        setError("Connection cancelled. Please try again when ready.");
      } else if (errorMsg.includes("not found") || errorMsg.includes("discovery") || errorMsg.includes("DEVICE_NOT_FOUND")) {
        // Provide detailed instructions based on vendor
        const instructions = vendor ? getConnectionInstructions(vendor, false) : [];
        const instructionText = instructions.length > 0
          ? `\n\nPlease check:\n• ${instructions.join('\n• ')}`
          : '';
        setError(`Could not find a ${vendorLabel} device.${instructionText}`);
      } else if (errorMsg.includes("timeout") || errorMsg.includes("OPERATION_TIMEOUT")) {
        setError(`Connection timed out. Please check your ${vendorLabel} is unlocked and try again.`);
      } else if (errorMsg.includes("busy") || errorMsg.includes("DEVICE_BUSY")) {
        setError(`Your ${vendorLabel} appears busy. Close any other apps using it and try again.`);
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

  // Render: Vendor Selection
  if (step === "select-vendor") {
    return (
      <div className="flex flex-col gap-5 p-4">
        {/* Header */}
        <div className="text-center">
          <div className="text-5xl mb-3">🔐</div>
          <p className="text-sm text-gray-400">
            Select your hardware wallet
          </p>
        </div>

        {error && <ErrorAlert message={error} onClose={() => setError("")} />}

        {/* Vendor Selection */}
        <div className="space-y-3">
          {VENDOR_OPTIONS.map((option) => {
            const detection = option.value === 'trezor' ? detectionState.trezor : detectionState.ledger;
            const isDetected = detection && detection.deviceCount > 0;

            return (
              <button
                key={option.value}
                onClick={() => handleVendorSelect(option.value)}
                className={`w-full text-left p-5 rounded-lg border-2 transition-colors ${
                  isDetected
                    ? "border-green-500/50 bg-green-500/5 hover:border-green-400 hover:bg-green-500/10"
                    : "border-gray-700 bg-gray-800/50 hover:border-blue-500 hover:bg-blue-500/10"
                }`}
              >
                <div className="flex items-center gap-4">
                  <span className="text-4xl">{option.icon}</span>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-medium">{option.label}</span>
                      {isDetected && (
                        <span className="text-xs px-2 py-0.5 bg-green-500/20 text-green-400 rounded-full flex items-center gap-1">
                          <span className="w-1.5 h-1.5 bg-green-400 rounded-full" />
                          Detected
                        </span>
                      )}
                    </div>
                    <span className="text-sm text-gray-400">{option.description}</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <p className="text-xs text-gray-500 text-center mt-4">
          Your private keys never leave your hardware device.
        </p>
      </div>
    );
  }

  // Render: Connecting
  if (step === "connecting") {
    return (
      <div className="flex flex-col items-center justify-center gap-6 p-8 min-h-[400px]">
        <Spinner />
        <div className="text-center">
          <h2 className="text-lg font-semibold mb-2">Connecting to {vendorLabel}...</h2>
          <p className="text-sm text-gray-400">
            Check your {vendorLabel} screen
          </p>
          <div className="mt-4 bg-gray-800/50 rounded-lg p-4 text-left max-w-xs mx-auto">
            <p className="text-xs text-gray-300 font-medium mb-2">On your device:</p>
            <ol className="text-xs text-gray-400 space-y-1.5 list-decimal list-inside">
              {vendor === 'ledger' && (
                <li>Open the <span className="text-gray-300">Bitcoin app</span></li>
              )}
              <li>Verify the address shown matches</li>
              <li>{getVendorConfirmInstructions(vendor)}</li>
            </ol>
          </div>
        </div>
      </div>
    );
  }

  // Render: Discovery
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

  // Render: Confirm
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
        <div className="text-5xl mb-3">{VENDOR_OPTIONS.find(v => v.value === vendor)?.icon ?? "🔐"}</div>
        <p className="text-sm text-gray-400">
          Select the address format that matches your existing {vendorLabel} wallet
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
                {option.recommended && (
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

          {/* Passphrase Option - only show for Trezor */}
          {vendor === 'trezor' && (
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
          )}

          {/* Wallet Name */}
          <div>
            <label className="block text-xs text-gray-400 mb-2">
              Wallet Name (optional)
            </label>
            <input
              type="text"
              value={walletName}
              onChange={(e) => setWalletName(e.target.value)}
              placeholder={`My ${vendorLabel}`}
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
          ▸ Advanced options (account selection{vendor === 'trezor' ? ', passphrase' : ''})
        </button>
      )}

      {/* Prerequisites */}
      <div className="bg-gray-800/50 rounded-lg p-3">
        <h3 className="text-xs font-medium text-gray-300 mb-2">Before connecting:</h3>
        <ul className="text-xs text-gray-400 space-y-1">
          <li>• {vendorLabel} connected via USB</li>
          <li>• Device unlocked with PIN</li>
          {vendor === 'ledger' && <li>• Bitcoin app open on device</li>}
        </ul>
      </div>

      <Button onClick={handleConnect} className="w-full">
        Connect {vendorLabel}
      </Button>

      <p className="text-xs text-gray-500 text-center">
        Your private keys never leave your {vendorLabel} device.
      </p>
    </div>
  );
}
