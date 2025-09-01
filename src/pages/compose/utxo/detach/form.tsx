"use client";

import { useEffect, useState, useRef } from "react";
import { useFormStatus } from "react-dom";
import { useNavigate } from "react-router-dom";
import { FaSpinner } from "react-icons/fa";
import { Field, Label, Description, Input } from "@headlessui/react";
import { Button } from "@/components/button";
import { ErrorAlert } from "@/components/error-alert";
import { AddressHeader } from "@/components/headers/address-header";
import { DestinationInput } from "@/components/inputs/destination-input";
import { FeeRateInput } from "@/components/inputs/fee-rate-input";
import { useWallet } from "@/contexts/wallet-context";
import { useSettings } from "@/contexts/settings-context";
import { fetchUtxoBalances, type UtxoBalance } from "@/utils/blockchain/counterparty";
import { formatTxid } from "@/utils/format";
import type { DetachOptions } from "@/utils/blockchain/counterparty";
import type { ReactElement } from "react";

/**
 * Props for the UtxoDetachForm component, aligned with Composer's formAction.
 */
interface UtxoDetachFormProps {
  formAction: (formData: FormData) => void;
  initialFormData: DetachOptions | null;
  initialUtxo?: string;
  error?: string | null;
  showHelpText?: boolean;
}

/**
 * Form for detaching assets from a UTXO using React 19 Actions.
 */
export function UtxoDetachForm({
  formAction,
  initialFormData,
  initialUtxo,
  error: composerError,
  showHelpText,
}: UtxoDetachFormProps): ReactElement {
  // Context hooks
  const { activeAddress, activeWallet } = useWallet();
  const { settings } = useSettings();
  const shouldShowHelpText = showHelpText ?? settings?.showHelpText ?? false;
  const navigate = useNavigate();
  
  // Form status
  const { pending } = useFormStatus();
  
  // Error state management
  const [error, setError] = useState<{ message: string } | null>(null);
  
  // Form state
  const [destination, setDestination] = useState(initialFormData?.destination || "");
  const [destinationValid, setDestinationValid] = useState(true); // Optional field, so default to true
  const [utxoBalances, setUtxoBalances] = useState<UtxoBalance[]>([]);
  const [isLoadingBalances, setIsLoadingBalances] = useState(false);
  
  // Refs
  const destinationRef = useRef<HTMLInputElement>(null);

  // Effects - composer error first
  useEffect(() => {
    if (composerError) {
      setError({ message: composerError });
    }
  }, [composerError]);

  // Focus destination input on mount and fetch UTXO balances
  useEffect(() => {
    destinationRef.current?.focus();
    
    // Fetch UTXO balances if we have a UTXO
    const utxo = initialUtxo || initialFormData?.sourceUtxo;
    if (utxo) {
      setIsLoadingBalances(true);
      fetchUtxoBalances(utxo).then(response => {
        setUtxoBalances(response.result || []);
      }).catch(err => {
        console.error('Failed to fetch UTXO balances:', err);
        setUtxoBalances([]);
      }).finally(() => {
        setIsLoadingBalances(false);
      });
    }
  }, [initialUtxo, initialFormData?.sourceUtxo]);

  return (
    <div className="space-y-4">
      {activeAddress && (
        <AddressHeader address={activeAddress.address} walletName={activeWallet?.name} className="mt-1 mb-5" />
      )}
      <div className="bg-white rounded-lg shadow-lg p-4">
        {error && (
          <ErrorAlert
            message={error.message}
            onClose={() => setError(null)}
          />
        )}
        <form action={formAction} className="space-y-6">
          {/* Hidden UTXO input - always passed to formAction */}
          <input 
            type="hidden" 
            name="sourceUtxo" 
            value={initialUtxo || initialFormData?.sourceUtxo || ""}
          />
          
          {/* UTXO Display - styled like an input */}
          {(initialUtxo || initialFormData?.sourceUtxo) && (
            <div>
              <label className="text-sm font-medium text-gray-700">Output <span className="text-red-500">*</span></label>
              <div 
                onClick={() => navigate(`/utxo/${initialUtxo || initialFormData?.sourceUtxo}`)}
                className="mt-1 block w-full p-2 rounded-md border border-gray-300 bg-gray-50 hover:bg-gray-100 cursor-pointer flex justify-between items-center"
                role="button"
                tabIndex={0}
              >
                <span className="text-sm font-mono text-blue-600 hover:text-blue-800">
                  {formatTxid(initialUtxo || initialFormData?.sourceUtxo || '')}
                </span>
                <span className="text-sm text-gray-500">
                  {isLoadingBalances ? (
                    <span className="flex items-center gap-1">
                      <FaSpinner className="animate-spin h-3 w-3" />
                      Loading...
                    </span>
                  ) : (
                    `${utxoBalances.length} ${utxoBalances.length === 1 ? 'Balance' : 'Balances'}`
                  )}
                </span>
              </div>
            </div>
          )}
          
          <input type="hidden" name="destination" value={destination} />
          <DestinationInput
            ref={destinationRef}
            value={destination}
            onChange={setDestination}
            onValidationChange={setDestinationValid}
            placeholder="Leave empty to use UTXO's address"
            required={false}
            disabled={pending}
            showHelpText={shouldShowHelpText}
            name="destination_display"
            label="Destination (Optional)"
            helpText="The address to detach assets to. If not provided, assets will be detached to the UTXO's owner address."
          />

          <FeeRateInput showHelpText={shouldShowHelpText} disabled={pending} />
          
          <Button type="submit" color="blue" fullWidth disabled={pending || !destinationValid}>
            {pending ? "Submitting..." : "Continue"}
          </Button>
        </form>
      </div>
    </div>
  );
}
