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
  { value: AddressFormat.P2WPKH, label: "Native SegWit (bc1q...)" },
  { value: AddressFormat.P2TR, label: "Taproot (bc1p...)" },
  { value: AddressFormat.P2SH_P2WPKH, label: "Nested SegWit (3...)" },
  { value: AddressFormat.P2PKH, label: "Legacy (1...)" },
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
      await createHardwareWallet("trezor", addressFormat, 0, walletName || undefined, usePassphrase);
      navigate(PATHS.SUCCESS);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect hardware wallet");
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
        </div>

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
