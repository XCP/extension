import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Field, Label, Input } from "@headlessui/react";
import { FaCopy, FaCheck, FaCheckCircle, FiRefreshCw } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { TextAreaInput } from "@/components/ui/inputs/textarea-input";
import { FeeRateInput } from "@/components/ui/inputs/fee-rate-input";
import { ErrorAlert } from "@/components/ui/error-alert";
import { useHeader } from "@/contexts/header-context";
import { useWallet } from "@/contexts/wallet-context";
import { getWalletService } from "@/services/walletService";
import {
  buildBareMultisigFunding,
  validatePubkey,
} from "@/utils/blockchain/bitcoin/buildBareMultisigFunding";
import { toSatoshis, fromSatoshis } from "@/utils/numeric";
import type { ReactElement } from "react";

type MultisigType = "2-of-2" | "2-of-3";
type CopiedField = "signedTx" | "script" | null;

export default function FundBareMultisigPage(): ReactElement {
  const navigate = useNavigate();
  const { setHeaderProps } = useHeader();
  const { activeWallet, activeAddress } = useWallet();

  const [multisigType, setMultisigType] = useState<MultisigType>("2-of-2");
  const [pubkey1, setPubkey1] = useState("");
  const [pubkey2, setPubkey2] = useState("");
  const [pubkey3, setPubkey3] = useState("");
  const [amount, setAmount] = useState("");
  const [feeRate, setFeeRate] = useState(0);
  const [isBuilding, setIsBuilding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signedTxHex, setSignedTxHex] = useState("");
  const [multisigScriptHex, setMultisigScriptHex] = useState("");
  const [feeInfo, setFeeInfo] = useState("");
  const [copiedField, setCopiedField] = useState<CopiedField>(null);

  // Pre-fill pubkey1 with active address pubkey
  useEffect(() => {
    if (activeAddress?.pubKey && !pubkey1) {
      setPubkey1(activeAddress.pubKey);
    }
  }, [activeAddress?.pubKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleReset = useCallback(() => {
    setPubkey1(activeAddress?.pubKey || "");
    setPubkey2("");
    setPubkey3("");
    setAmount("");
    setSignedTxHex("");
    setMultisigScriptHex("");
    setFeeInfo("");
    setError(null);
  }, [activeAddress?.pubKey]);

  useEffect(() => {
    const hasContent = Boolean(
      signedTxHex || error || pubkey2 || pubkey3 || amount
    );
    setHeaderProps({
      title: "Fund Multisig",
      onBack: () => navigate(-1),
      rightButton: {
        ariaLabel: "Reset form",
        icon: <FiRefreshCw className="size-4" aria-hidden="true" />,
        onClick: handleReset,
        disabled: !hasContent,
      },
    });
    return () => setHeaderProps(null);
  }, [
    setHeaderProps,
    navigate,
    handleReset,
    signedTxHex,
    error,
    pubkey2,
    pubkey3,
    amount,
  ]);

  const handleFund = async () => {
    if (!activeWallet || !activeAddress) {
      setError("No active wallet or address");
      return;
    }

    setError(null);
    setSignedTxHex("");
    setMultisigScriptHex("");
    setFeeInfo("");
    setIsBuilding(true);

    try {
      // Validate pubkeys
      const pubkeyHexes = [pubkey1.trim(), pubkey2.trim()];
      if (multisigType === "2-of-3") {
        pubkeyHexes.push(pubkey3.trim());
      }

      const pubkeyBytes = pubkeyHexes.map((hex, i) => {
        try {
          return validatePubkey(hex);
        } catch (err) {
          throw new Error(
            `Public Key ${i + 1}: ${err instanceof Error ? err.message : "invalid"}`
          );
        }
      });

      // Convert BTC to sats
      const amountSats = Number(toSatoshis(amount));
      if (isNaN(amountSats) || amountSats <= 0) {
        throw new Error("Invalid amount");
      }

      if (feeRate <= 0) {
        throw new Error("Please select a fee rate");
      }

      // Build unsigned tx
      const result = await buildBareMultisigFunding({
        pubkeys: pubkeyBytes,
        m: 2,
        amountSats,
        feeRate,
        sourceAddress: activeAddress.address,
      });

      // Sign
      const walletService = getWalletService();
      const signed = await walletService.signTransaction(
        result.unsignedTxHex,
        activeAddress.address
      );

      setSignedTxHex(signed);
      setMultisigScriptHex(result.multisigScriptHex);
      const changeStr =
        result.changeAmount > 0
          ? `, change: ${fromSatoshis(result.changeAmount, { removeTrailingZeros: true })} BTC`
          : ", no change (folded into fee)";
      setFeeInfo(
        `Fee: ${fromSatoshis(result.fee, { removeTrailingZeros: true })} BTC (${result.fee} sats)${changeStr}`
      );
    } catch (err) {
      console.error("Failed to fund multisig:", err);
      setError(err instanceof Error ? err.message : "Failed to build transaction");
    } finally {
      setIsBuilding(false);
    }
  };

  const handleCopy = async (text: string, field: CopiedField) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 1500);
    } catch {
      setError("Failed to copy to clipboard");
    }
  };

  const isFormValid =
    pubkey1.trim() &&
    pubkey2.trim() &&
    (multisigType === "2-of-2" || pubkey3.trim()) &&
    amount.trim() &&
    feeRate > 0;

  if (!activeAddress) {
    return (
      <div className="p-4 text-center">
        <div className="text-gray-600 mb-4">No active address selected</div>
        <Button onClick={() => navigate("/index")} color="blue">
          Go to Wallet
        </Button>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <div className="bg-white rounded-lg shadow-sm p-3 sm:p-4 space-y-4">
        {/* Multisig type toggle */}
        <Field>
          <Label className="block text-sm font-medium text-gray-700 mb-1">
            Multisig Type <span className="text-red-500">*</span>
          </Label>
          <div className="flex gap-2">
            {(["2-of-2", "2-of-3"] as const).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => {
                  setMultisigType(type);
                  if (signedTxHex) {
                    setSignedTxHex("");
                    setMultisigScriptHex("");
                    setFeeInfo("");
                  }
                }}
                disabled={isBuilding}
                className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors cursor-pointer ${
                  multisigType === type
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                {type}
              </button>
            ))}
          </div>
        </Field>

        {/* Pubkey inputs */}
        <Field>
          <Label className="block text-sm font-medium text-gray-700 mb-1">
            Public Key 1 (yours) <span className="text-red-500">*</span>
          </Label>
          <Input
            type="text"
            value={pubkey1}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPubkey1(e.target.value)}
            placeholder="Compressed public key hex…"
            disabled={isBuilding}
            className="block w-full p-2.5 rounded-md border border-gray-200 bg-gray-50 text-sm font-mono outline-none focus:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500"
          />
        </Field>

        <Field>
          <Label className="block text-sm font-medium text-gray-700 mb-1">
            Public Key 2 <span className="text-red-500">*</span>
          </Label>
          <Input
            type="text"
            value={pubkey2}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPubkey2(e.target.value)}
            placeholder="Paste counterparty's public key hex…"
            disabled={isBuilding}
            className="block w-full p-2.5 rounded-md border border-gray-200 bg-gray-50 text-sm font-mono outline-none focus:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500"
          />
        </Field>

        {multisigType === "2-of-3" && (
          <Field>
            <Label className="block text-sm font-medium text-gray-700 mb-1">
              Public Key 3 <span className="text-red-500">*</span>
            </Label>
            <Input
              type="text"
              value={pubkey3}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPubkey3(e.target.value)}
              placeholder="Paste third party's public key hex…"
              disabled={isBuilding}
              className="block w-full p-2.5 rounded-md border border-gray-200 bg-gray-50 text-sm font-mono outline-none focus:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500"
            />
          </Field>
        )}

        {/* Amount */}
        <Field>
          <Label className="block text-sm font-medium text-gray-700 mb-1">
            Amount (BTC) <span className="text-red-500">*</span>
          </Label>
          <Input
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              setAmount(e.target.value);
              if (signedTxHex) {
                setSignedTxHex("");
                setMultisigScriptHex("");
                setFeeInfo("");
              }
            }}
            placeholder="0.001"
            disabled={isBuilding}
            className="block w-full p-2.5 rounded-md border border-gray-200 bg-gray-50 text-sm outline-none focus:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500"
          />
        </Field>

        {/* Fee rate */}
        <FeeRateInput onFeeRateChange={setFeeRate} />

        {/* Fund button */}
        {!signedTxHex && (
          <Button
            onClick={() => handleFund()}
            color="blue"
            disabled={!isFormValid || isBuilding}
            fullWidth
          >
            {isBuilding ? (
              <>
                <FiRefreshCw
                  className="size-4 mr-2 animate-spin"
                  aria-hidden="true"
                />
                {activeWallet?.type === "hardware"
                  ? "Confirm on device…"
                  : "Building…"}
              </>
            ) : (
              "Fund Multisig"
            )}
          </Button>
        )}

        {/* Results */}
        {signedTxHex && (
          <div className="space-y-4">
            {feeInfo && (
              <p className="text-xs text-gray-500">{feeInfo}</p>
            )}

            <div>
              <TextAreaInput
                value={signedTxHex}
                onChange={() => {}}
                label="Signed Transaction Hex"
                placeholder=""
                rows={4}
                disabled={true}
                readOnly={true}
                className="bg-gray-50"
              />
              <div className="mt-2 flex justify-between items-center">
                <span className="text-xs text-green-600 flex items-center gap-1">
                  <FaCheckCircle className="size-3" aria-hidden="true" />
                  Signed
                </span>
                <button
                  onClick={() => handleCopy(signedTxHex, "signedTx")}
                  className={`text-xs transition-colors duration-200 cursor-pointer flex items-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded ${
                    copiedField === "signedTx"
                      ? "text-green-600 hover:text-green-700"
                      : "text-blue-600 hover:text-blue-700"
                  }`}
                >
                  {copiedField === "signedTx" ? (
                    <>
                      <FaCheck className="size-3" aria-hidden="true" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <FaCopy className="size-3" aria-hidden="true" />
                      Copy signed tx
                    </>
                  )}
                </button>
              </div>
            </div>

            <div>
              <TextAreaInput
                value={multisigScriptHex}
                onChange={() => {}}
                label="Multisig scriptPubKey"
                placeholder=""
                rows={2}
                disabled={true}
                readOnly={true}
                className="bg-gray-50"
              />
              <div className="mt-1 flex justify-between items-center">
                <span className="text-xs text-gray-500">
                  Save this for spending from the multisig later
                </span>
                <button
                  onClick={() => handleCopy(multisigScriptHex, "script")}
                  className={`text-xs transition-colors duration-200 cursor-pointer flex items-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded ${
                    copiedField === "script"
                      ? "text-green-600 hover:text-green-700"
                      : "text-blue-600 hover:text-blue-700"
                  }`}
                >
                  {copiedField === "script" ? (
                    <>
                      <FaCheck className="size-3" aria-hidden="true" />
                      Copied!
                    </>
                  ) : (
                    "Copy"
                  )}
                </button>
              </div>
            </div>

            <Button onClick={handleReset} color="gray">
              Reset
            </Button>
          </div>
        )}
      </div>

      {error && <ErrorAlert message={error} onClose={() => setError(null)} />}
    </div>
  );
}
