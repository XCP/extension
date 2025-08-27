import React, { useState, useEffect, type ReactElement } from "react";
import { useFormStatus } from "react-dom";
import { Field, Label, Description, Textarea } from "@headlessui/react";
import { Button } from "@/components/button";
import { ErrorAlert } from "@/components/error-alert";
import { AddressHeader } from "@/components/headers/address-header";
import { FeeRateInput } from "@/components/inputs/fee-rate-input";
import { useSettings } from "@/contexts/settings-context";
import { useWallet } from "@/contexts/wallet-context";
import { fetchDispenserByHash } from "@/utils/blockchain/counterparty";
import type { DispenserOptions } from "@/utils/blockchain/counterparty";

interface DispenserCloseByHashFormProps {
  formAction: (formData: FormData) => void;
  initialFormData: DispenserOptions | null;
  initialTxHash?: string;
  error?: string | null;
  showHelpText?: boolean;
}

export function DispenserCloseByHashForm({
  formAction,
  initialFormData,
  initialTxHash,
  error: composerError,
  showHelpText,
}: DispenserCloseByHashFormProps): ReactElement {
  const { activeAddress, activeWallet } = useWallet();
  const { settings } = useSettings();
  const shouldShowHelpText = showHelpText ?? settings?.showHelpText ?? false;
  const { pending } = useFormStatus();
  const [txHash, setTxHash] = useState<string>(initialTxHash || initialFormData?.open_address || "");
  const [selectedDispenser, setSelectedDispenser] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<{ message: string } | null>(null);

  // Set composer error when it occurs
  useEffect(() => {
    if (composerError) {
      setError({ message: composerError });
    }
  }, [composerError]);

  // Fetch dispenser data when initialTxHash is provided or when txHash changes
  useEffect(() => {
    if (initialTxHash) {
      setTxHash(initialTxHash);
      handleLookup(initialTxHash);
    }
  }, [initialTxHash]);

  // Auto-lookup when txHash changes
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (txHash && txHash.trim().length > 0) {
        handleLookup(txHash);
      } else {
        setSelectedDispenser(null);
        setError(null);
      }
    }, 500); // Debounce for 500ms

    return () => clearTimeout(timeoutId);
  }, [txHash]);

  // Focus textarea on mount
  useEffect(() => {
    const textarea = document.querySelector("textarea[name='open_address']") as HTMLTextAreaElement;
    textarea?.focus();
  }, []);

  const handleLookup = async (hashToLookup: string) => {
    if (!hashToLookup) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      const dispenser = await fetchDispenserByHash(hashToLookup);
      if (dispenser && dispenser.status === 0) { // STATUS_OPEN
        setSelectedDispenser(dispenser);
        setError(null);
      } else {
        setSelectedDispenser(null);
        setError({ message: "No open dispenser found for this hash." });
      }
    } catch (err) {
      console.error("Failed to fetch dispenser:", err);
      setSelectedDispenser(null);
      setError({ message: "Failed to fetch dispenser. Please check the hash and try again." });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {activeAddress && (
        <AddressHeader
          address={activeAddress.address}
          walletName={activeWallet?.name ?? ""}
          className="mt-1 mb-5"
        />
      )}
      <div className="bg-white rounded-lg shadow-lg p-4">
        {error && (
          <ErrorAlert
            message={error.message}
            onClose={() => setError(null)}
          />
        )}
        {isLoading ? (
          <div className="py-4 text-center">Loading dispenser details...</div>
        ) : (
          <form action={formAction} className="space-y-6">
            <Field>
              <Label htmlFor="open_address" className="block text-sm font-medium text-gray-700">
                Transaction Hash <span className="text-red-500">*</span>
              </Label>
              <Textarea
                id="open_address"
                name="open_address" // Maps to `open_address` in DispenserOptions
                value={txHash}
                onChange={(e) => setTxHash(e.target.value)}
                className="mt-1 block w-full p-2 rounded-md border border-gray-300 bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Enter dispenser transaction hash"
                disabled={pending}
                rows={3}
              />
              {selectedDispenser && (
                <div className="mt-2 text-sm text-gray-700">
                  <p>Asset: {selectedDispenser.asset}</p>
                  <p>Give Quantity: {selectedDispenser.give_quantity_normalized}</p>
                  <p>Escrow Quantity: {selectedDispenser.escrow_quantity_normalized}</p>
                  <p>Price: {selectedDispenser.price_normalized}</p>
                  <p>Source: {selectedDispenser.source}</p>
                </div>
              )}
              <Description className={shouldShowHelpText ? "mt-2 text-sm text-gray-500" : "hidden"}>
                Enter the transaction hash of the dispenser you want to close.
              </Description>
              <input type="hidden" name="asset" value={selectedDispenser?.asset || ""} />
            </Field>

            <FeeRateInput showHelpText={shouldShowHelpText} disabled={pending} />
            
            <Button type="submit" color="blue" fullWidth disabled={pending || !selectedDispenser}>
              {pending ? "Submitting..." : "Continue"}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
