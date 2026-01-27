import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { FaSpinner } from "@/components/icons";
import { ComposerForm } from "@/components/composer/composer-form";
import { AddressHeader } from "@/components/ui/headers/address-header";
import { DestinationInput } from "@/components/ui/inputs/destination-input";
import { useComposer } from "@/contexts/composer-context";
import { ErrorAlert } from "@/components/ui/error-alert";
import { fetchUtxoBalances, type UtxoBalance } from "@/utils/blockchain/counterparty/api";
import { formatTxid } from "@/utils/format";
import type { MoveOptions } from "@/utils/blockchain/counterparty/compose";
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
                onClick={() => navigate(`/assets/utxo/${initialUtxo || initialFormData?.sourceUtxo}`)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    navigate(`/assets/utxo/${initialUtxo || initialFormData?.sourceUtxo}`);
                  }
                }}
                className="mt-1 block w-full p-2.5 rounded-md border border-gray-300 bg-gray-50 hover:bg-gray-100 cursor-pointer flex justify-between items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                role="button"
                tabIndex={0}
              >
                <span className="text-sm font-mono text-blue-600 hover:text-blue-800">
                  {formatTxid(initialUtxo || initialFormData?.sourceUtxo || '')}
                </span>
                <span className="text-sm text-gray-500">
                  {isLoadingBalances ? (
                    <span className="flex items-center gap-1">
                      <FaSpinner className="animate-spin size-4" aria-hidden="true" />
                      Loading…
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
