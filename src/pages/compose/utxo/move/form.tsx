"use client";

import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { FaSpinner } from "react-icons/fa";
import { ComposerForm } from "@/components/composer-form";
import { AddressHeader } from "@/components/headers/address-header";
import { DestinationInput } from "@/components/inputs/destination-input";
import { useComposer } from "@/contexts/composer-context";
import { ErrorAlert } from "@/components/error-alert";
import { fetchUtxoBalances, type UtxoBalance } from "@/utils/blockchain/counterparty";
import { formatTxid } from "@/utils/format";
import type { MoveOptions } from "@/utils/blockchain/counterparty";
import type { ReactElement } from "react";

/**
 * Props for the UtxoMoveForm component, aligned with Composer's formAction.
 */
interface UtxoMoveFormProps {
  formAction: (formData: FormData) => void;
  initialFormData: MoveOptions | null;
  initialUtxo?: string;
}

/**
 * Form for moving a UTXO using React 19 Actions.
 */
export function UtxoMoveForm({
  formAction,
  initialFormData,
  initialUtxo,
}: UtxoMoveFormProps): ReactElement {
  const navigate = useNavigate();
  const { activeAddress, activeWallet, showHelpText } = useComposer();
  const [validationError, setValidationError] = useState<string | null>(null);
  const [destination, setDestination] = useState(initialFormData?.destination || "");
  const [destinationValid, setDestinationValid] = useState(false);
  const [utxoBalances, setUtxoBalances] = useState<UtxoBalance[]>([]);
  const [isLoadingBalances, setIsLoadingBalances] = useState(false);
  const destinationRef = useRef<HTMLInputElement>(null);

  // Effects

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
    <ComposerForm
      formAction={formAction}
      header={
        activeAddress && (
          <AddressHeader
            address={activeAddress.address}
            walletName={activeWallet?.name ?? ""}
            className="mt-1 mb-5"
          />
        )
      }
      submitDisabled={!destinationValid}
    >
      {validationError && (
        <div className="mb-4">
          <ErrorAlert
            message={validationError}
            onClose={() => setValidationError(null)}
          />
        </div>
      )}
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
            placeholder="Enter destination address"
            required
            disabled={false}
            showHelpText={showHelpText}
            name="destination_display"
          />

    </ComposerForm>
  );
}
