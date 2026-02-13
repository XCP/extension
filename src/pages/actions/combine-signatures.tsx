import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Field, Label, Input } from "@headlessui/react";
import { FaCopy, FaCheck, FaCheckCircle, FiRefreshCw } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { TextAreaInput } from "@/components/ui/inputs/textarea-input";
import { ErrorAlert } from "@/components/ui/error-alert";
import { useHeader } from "@/contexts/header-context";
import { RawTx } from "@scure/btc-signer";
import { hexToBytes, bytesToHex } from "@noble/hashes/utils.js";
import { validatePubkey } from "@/utils/blockchain/bitcoin/buildBareMultisigFunding";
import type { ReactElement } from "react";

type MultisigType = "2-of-2" | "2-of-3";
type CopiedField = "combined" | null;

/**
 * Builds a bare multisig scriptSig: OP_0 <sig1> <sig2>
 * Signatures must be in the same order as the pubkeys in the redeemScript.
 */
function buildMultisigScriptSig(sigs: Uint8Array[]): Uint8Array {
  // OP_0 + pushdata for each sig
  const parts: number[] = [0x00]; // OP_0

  for (const sig of sigs) {
    if (sig.length < 0x4c) {
      parts.push(sig.length);
    } else if (sig.length <= 0xff) {
      parts.push(0x4c, sig.length);
    } else {
      parts.push(0x4d, sig.length & 0xff, (sig.length >> 8) & 0xff);
    }
    for (const b of sig) {
      parts.push(b);
    }
  }

  return new Uint8Array(parts);
}

function validateDerSignature(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex.trim();

  if (!/^[0-9a-fA-F]+$/.test(clean)) {
    throw new Error("Invalid hex characters in signature");
  }

  const bytes = hexToBytes(clean);

  // Basic DER check: should start with 0x30 (SEQUENCE)
  if (bytes[0] !== 0x30) {
    throw new Error("Not a valid DER signature (expected 0x30 prefix)");
  }

  return bytes;
}

export default function CombineSignaturesPage(): ReactElement {
  const navigate = useNavigate();
  const { setHeaderProps } = useHeader();

  const [multisigType, setMultisigType] = useState<MultisigType>("2-of-2");
  const [rawTxHex, setRawTxHex] = useState("");
  const [pubkey1, setPubkey1] = useState("");
  const [pubkey2, setPubkey2] = useState("");
  const [pubkey3, setPubkey3] = useState("");
  const [sig1, setSig1] = useState("");
  const [sig2, setSig2] = useState("");
  const [inputIndex, setInputIndex] = useState("0");
  const [combinedTxHex, setCombinedTxHex] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<CopiedField>(null);

  const handleReset = useCallback(() => {
    setRawTxHex("");
    setPubkey1("");
    setPubkey2("");
    setPubkey3("");
    setSig1("");
    setSig2("");
    setInputIndex("0");
    setCombinedTxHex("");
    setError(null);
  }, []);

  useEffect(() => {
    const hasContent = Boolean(
      rawTxHex || combinedTxHex || error || sig1 || sig2
    );
    setHeaderProps({
      title: "Combine Sigs",
      onBack: () => navigate(-1),
      rightButton: {
        ariaLabel: "Reset form",
        icon: <FiRefreshCw className="size-4" aria-hidden="true" />,
        onClick: handleReset,
        disabled: !hasContent,
      },
    });
    return () => setHeaderProps(null);
  }, [setHeaderProps, navigate, handleReset, rawTxHex, combinedTxHex, error, sig1, sig2]);

  const handleCombine = () => {
    setError(null);
    setCombinedTxHex("");

    try {
      const trimmedHex = rawTxHex.trim();
      if (!trimmedHex) {
        throw new Error("Please enter the raw transaction hex");
      }
      if (!/^[0-9a-fA-F]+$/.test(trimmedHex)) {
        throw new Error("Invalid hex in raw transaction");
      }

      // Validate pubkeys (we need them to know the ordering)
      const pubkeyHexes = [pubkey1.trim(), pubkey2.trim()];
      if (multisigType === "2-of-3") {
        pubkeyHexes.push(pubkey3.trim());
      }
      for (let i = 0; i < pubkeyHexes.length; i++) {
        if (!pubkeyHexes[i]) {
          throw new Error(`Public Key ${i + 1} is required`);
        }
        try {
          validatePubkey(pubkeyHexes[i]);
        } catch (err) {
          throw new Error(
            `Public Key ${i + 1}: ${err instanceof Error ? err.message : "invalid"}`
          );
        }
      }

      // Validate signatures
      if (!sig1.trim()) throw new Error("Signature 1 is required");
      if (!sig2.trim()) throw new Error("Signature 2 is required");

      const sigBytes1 = validateDerSignature(sig1);
      const sigBytes2 = validateDerSignature(sig2);

      // Parse the input index
      const idx = parseInt(inputIndex.trim() || "0", 10);
      if (isNaN(idx) || idx < 0) {
        throw new Error("Invalid input index");
      }

      // Parse the raw transaction
      const rawBytes = hexToBytes(trimmedHex);
      const parsed = RawTx.decode(rawBytes);

      if (idx >= parsed.inputs.length) {
        throw new Error(
          `Input index ${idx} out of range (transaction has ${parsed.inputs.length} inputs)`
        );
      }

      // Build scriptSig: OP_0 <sig1> <sig2>
      // Signatures are provided in pubkey order (matching the redeemScript)
      const scriptSig = buildMultisigScriptSig([sigBytes1, sigBytes2]);

      // Replace the scriptSig on the target input
      parsed.inputs[idx].finalScriptSig = scriptSig;

      // Re-encode
      const combined = RawTx.encode(parsed);
      setCombinedTxHex(bytesToHex(combined));
    } catch (err) {
      console.error("Failed to combine signatures:", err);
      setError(
        err instanceof Error ? err.message : "Failed to combine signatures"
      );
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
    rawTxHex.trim() &&
    pubkey1.trim() &&
    pubkey2.trim() &&
    (multisigType === "2-of-2" || pubkey3.trim()) &&
    sig1.trim() &&
    sig2.trim();

  return (
    <div className="p-4 space-y-4">
      <div className="bg-white rounded-lg shadow-sm p-3 sm:p-4 space-y-4">
        {/* Transaction */}
        <TextAreaInput
          value={rawTxHex}
          onChange={(value) => {
            setRawTxHex(value);
            if (combinedTxHex) setCombinedTxHex("");
          }}
          label="Raw Transaction Hex"
          placeholder="Paste the unsigned or partially-signed transaction hex…"
          rows={3}
          required
          showCharCount={false}
        />

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
                  if (combinedTxHex) setCombinedTxHex("");
                }}
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

        {/* Input index */}
        <Field>
          <Label className="block text-sm font-medium text-gray-700 mb-1">
            Input Index <span className="text-red-500">*</span>
          </Label>
          <Input
            type="text"
            inputMode="numeric"
            value={inputIndex}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setInputIndex(e.target.value)}
            placeholder="0"
            className="block w-full p-2.5 rounded-md border border-gray-200 bg-gray-50 text-sm outline-none focus:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500"
          />
          <p className="text-xs text-gray-500 mt-1">
            Which input to apply the combined scriptSig to (usually 0)
          </p>
        </Field>
      </div>

      {/* Public Keys */}
      <div className="bg-white rounded-lg shadow-sm p-3 sm:p-4 space-y-4">
        <p className="text-xs text-gray-500">
          Public keys determine signature ordering. Enter them in the same order used when the multisig was created.
        </p>

        <Field>
          <Label className="block text-sm font-medium text-gray-700 mb-1">
            Public Key 1 <span className="text-red-500">*</span>
          </Label>
          <Input
            type="text"
            value={pubkey1}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPubkey1(e.target.value)}
            placeholder="Compressed public key hex…"
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
            placeholder="Compressed public key hex…"
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
              placeholder="Compressed public key hex…"
              className="block w-full p-2.5 rounded-md border border-gray-200 bg-gray-50 text-sm font-mono outline-none focus:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500"
            />
          </Field>
        )}
      </div>

      {/* Signatures */}
      <div className="bg-white rounded-lg shadow-sm p-3 sm:p-4 space-y-4">
        <p className="text-xs text-gray-500">
          Each signature must correspond to the public key at the same position above.
        </p>

        <Field>
          <Label className="block text-sm font-medium text-gray-700 mb-1">
            Signature 1 <span className="text-red-500">*</span>
          </Label>
          <Input
            type="text"
            value={sig1}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSig1(e.target.value)}
            placeholder="DER-encoded signature hex…"
            className="block w-full p-2.5 rounded-md border border-gray-200 bg-gray-50 text-sm font-mono outline-none focus:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500"
          />
        </Field>

        <Field>
          <Label className="block text-sm font-medium text-gray-700 mb-1">
            Signature 2 <span className="text-red-500">*</span>
          </Label>
          <Input
            type="text"
            value={sig2}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSig2(e.target.value)}
            placeholder="DER-encoded signature hex…"
            className="block w-full p-2.5 rounded-md border border-gray-200 bg-gray-50 text-sm font-mono outline-none focus:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500"
          />
        </Field>
      </div>

      {/* Combine button */}
      <div className="bg-white rounded-lg shadow-sm p-3 sm:p-4 space-y-4">
        {!combinedTxHex && (
          <Button
            onClick={() => handleCombine()}
            color="blue"
            disabled={!isFormValid}
            fullWidth
          >
            Combine Signatures
          </Button>
        )}

        {/* Result */}
        {combinedTxHex && (
          <div className="space-y-4">
            <TextAreaInput
              value={combinedTxHex}
              onChange={() => {}}
              label="Combined Transaction Hex"
              placeholder=""
              rows={4}
              disabled={true}
              readOnly={true}
              className="bg-gray-50"
            />
            <div className="mt-2 flex justify-between items-center">
              <span className="text-xs text-green-600 flex items-center gap-1">
                <FaCheckCircle className="size-3" aria-hidden="true" />
                Ready to broadcast
              </span>
              <button
                onClick={() => handleCopy(combinedTxHex, "combined")}
                className={`text-xs transition-colors duration-200 cursor-pointer flex items-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded ${
                  copiedField === "combined"
                    ? "text-green-600 hover:text-green-700"
                    : "text-blue-600 hover:text-blue-700"
                }`}
              >
                {copiedField === "combined" ? (
                  <>
                    <FaCheck className="size-3" aria-hidden="true" />
                    Copied!
                  </>
                ) : (
                  <>
                    <FaCopy className="size-3" aria-hidden="true" />
                    Copy tx hex
                  </>
                )}
              </button>
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
