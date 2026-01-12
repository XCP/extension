"use client";

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { Button } from "@/components/button";
import { ErrorAlert } from "@/components/error-alert";
import { FiAlertTriangle } from "@/components/icons";
import { useHeader } from "@/contexts/header-context";
import { useWallet } from "@/contexts/wallet-context";
import { AddressFormat } from "@/utils/blockchain/bitcoin/address";
import type { ReactElement } from "react";

const PATHS = {
  BACK: -1,
  SUCCESS: "/",
} as const;

const ADDRESS_FORMAT_OPTIONS = [
  { value: AddressFormat.P2WPKH, label: "Native SegWit (bc1q...)", minFirmware: null },
  { value: AddressFormat.P2TR, label: "Taproot (bc1p...)", minFirmware: "2.4.3" }, // Model T; Model One needs 1.10.4
  { value: AddressFormat.P2SH_P2WPKH, label: "Nested SegWit (3...)", minFirmware: null },
  { value: AddressFormat.P2PKH, label: "Legacy (1...)", minFirmware: null },
] as const;

// Account options for advanced users who may have funds on different accounts
const ACCOUNT_OPTIONS = [
  { value: 0, label: "Account 0 (Default)" },
  { value: 1, label: "Account 1" },
  { value: 2, label: "Account 2" },
] as const;

export default function ConnectHardware(): ReactElement {
  const navigate = useNavigate();
  const { setHeaderProps } = useHeader();
  const { createHardwareWallet } = useWallet();

  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState("");
  const [addressFormat, setAddressFormat] = useState<AddressFormat>(AddressFormat.P2WPKH);
  const [walletName, setWalletName] = useState("");
  const [usePassphrase, setUsePassphrase] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [accountIndex, setAccountIndex] = useState(0);

  useEffect(() => {
    setHeaderProps({
      title: "Connect Hardware Wallet",
      onBack: () => navigate(PATHS.BACK),
    });
  }, [setHeaderProps, navigate]);

  async function handleConnect() {
    setError("");
    setIsConnecting(true);

    try {
      await createHardwareWallet("trezor", addressFormat, accountIndex, walletName || undefined, usePassphrase);
      navigate(PATHS.SUCCESS);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Failed to connect hardware wallet";
      // Provide helpful message for common Trezor errors
      if (errorMsg.includes("Taproot") || errorMsg.includes("P2TR")) {
        setError("Taproot requires Trezor firmware 2.4.3+ (Model T) or 1.10.4+ (Model One). Please update your firmware or select a different address format.");
      } else {
        setError(errorMsg);
      }
    } finally {
      setIsConnecting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6 p-4">
      <div className="text-center">
        <div className="text-6xl mb-4">🔐</div>
        <h2 className="text-xl font-semibold mb-2">Connect Trezor</h2>
        <p className="text-sm text-gray-400">
          Connect your Trezor hardware wallet to securely manage your Bitcoin and Counterparty assets.
        </p>
      </div>

      {error && <ErrorAlert message={error} />}

      <div className="flex flex-col gap-4">
        <div>
          <label className="block text-sm font-medium mb-2">Wallet Name (optional)</label>
          <input
            type="text"
            value={walletName}
            onChange={(e) => setWalletName(e.target.value)}
            placeholder="My Trezor Wallet"
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:border-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Address Format</label>
          <select
            value={addressFormat}
            onChange={(e) => setAddressFormat(e.target.value as AddressFormat)}
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:border-blue-500"
          >
            {ADDRESS_FORMAT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {addressFormat === AddressFormat.P2TR && (
            <p className="text-xs text-amber-400 mt-1">
              Taproot requires Trezor firmware 2.4.3+ (Model T) or 1.10.4+ (Model One)
            </p>
          )}
        </div>

        {/* Advanced Options Toggle */}
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="text-sm text-blue-400 hover:text-blue-300 text-left"
        >
          {showAdvanced ? "▼ Hide advanced options" : "▶ Show advanced options"}
        </button>

        {showAdvanced && (
          <div className="bg-gray-800/50 rounded-lg p-3 space-y-3">
            <div>
              <label className="block text-sm font-medium mb-2">Account Index</label>
              <select
                value={accountIndex}
                onChange={(e) => setAccountIndex(Number(e.target.value))}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:border-blue-500"
              >
                {ACCOUNT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-400 mt-1">
                Most users only need Account 0. Select a different account if you have funds on multiple accounts in Trezor Suite.
              </p>
            </div>
          </div>
        )}

        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="usePassphrase"
            checked={usePassphrase}
            onChange={(e) => setUsePassphrase(e.target.checked)}
            className="w-4 h-4 rounded border-gray-700 bg-gray-800 text-blue-500 focus:ring-blue-500"
          />
          <label htmlFor="usePassphrase" className="text-sm">
            <span className="font-medium">Use passphrase</span>
            <span className="text-gray-400 block text-xs">
              Enable for hidden wallet (you'll enter the passphrase on your device)
            </span>
          </label>
        </div>
      </div>

      <div className="bg-gray-800 rounded-lg p-4">
        <h3 className="font-medium mb-2">Before connecting:</h3>
        <ul className="text-sm text-gray-400 space-y-1 list-disc list-inside">
          <li>Make sure your Trezor is connected via USB</li>
          <li>Unlock your device with your PIN</li>
          <li>Have the Bitcoin app open on your device</li>
        </ul>
      </div>

      <div className="bg-amber-900/30 border border-amber-600/50 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <FiAlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-medium text-amber-500 mb-1">Important: UTXO Safety</h3>
            <p className="text-sm text-amber-200/80 mb-2">
              If you use Counterparty features like UTXO attachments, you must only spend from this wallet using XCP Wallet.
            </p>
            <p className="text-xs text-amber-200/60">
              Using other wallets (Trezor Suite, Sparrow, etc.) could accidentally spend UTXOs containing attached Counterparty assets, resulting in permanent loss.
            </p>
          </div>
        </div>
      </div>

      <Button
        onClick={handleConnect}
        disabled={isConnecting}
        className="w-full"
      >
        {isConnecting ? "Connecting..." : "Connect Trezor"}
      </Button>

      <p className="text-xs text-gray-500 text-center">
        Your private keys never leave your Trezor device. XCP Wallet only stores your public keys for address generation.
      </p>
    </div>
  );
}
