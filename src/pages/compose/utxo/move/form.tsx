"use client";

import { useEffect, useState, useRef } from "react";
import { useFormStatus } from "react-dom";
import { Field, Label, Description, Input } from "@headlessui/react";
import { Button } from "@/components/button";
import { ErrorAlert } from "@/components/error-alert";
import { AddressHeader } from "@/components/headers/address-header";
import { DestinationInput } from "@/components/inputs/destination-input";
import { FeeRateInput } from "@/components/inputs/fee-rate-input";
import { useWallet } from "@/contexts/wallet-context";
import { useSettings } from "@/contexts/settings-context";
import type { MoveOptions } from "@/utils/blockchain/counterparty";
import type { ReactElement } from "react";

/**
 * Props for the UtxoMoveForm component, aligned with Composer's formAction.
 */
interface UtxoMoveFormProps {
  formAction: (formData: FormData) => void;
  initialFormData: MoveOptions | null;
  initialUtxo?: string;
  error?: string | null;
  showHelpText?: boolean;
}

/**
 * Form for moving a UTXO using React 19 Actions.
 */
export function UtxoMoveForm({
  formAction,
  initialFormData,
  initialUtxo,
  error: composerError,
  showHelpText,
}: UtxoMoveFormProps): ReactElement {
  const { activeAddress, activeWallet } = useWallet();
  const { settings } = useSettings();
  const shouldShowHelpText = showHelpText ?? settings?.showHelpText ?? false;
  const { pending } = useFormStatus();
  const [error, setError] = useState<{ message: string; } | null>(null);
  const [destination, setDestination] = useState(initialFormData?.destination || "");
  const [destinationValid, setDestinationValid] = useState(false);
  const destinationRef = useRef<HTMLInputElement>(null);

  // Set composer error when it occurs
  useEffect(() => {
    if (composerError) {
      setError({ message: composerError });
    }
  }, [composerError]);

  // Focus UTXO input on mount if not pre-filled
  useEffect(() => {
    if (!initialUtxo) {
      const input = document.querySelector("input[name='sourceUtxo']") as HTMLInputElement;
      input?.focus();
    } else {
      destinationRef.current?.focus();
    }
  }, [initialUtxo]);

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
        <form action={formAction} className="space-y-6">
          {/* Warning about moving ALL assets */}
          <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3">
            <p className="text-sm text-yellow-700">
              <strong>Warning:</strong> This operation will move ALL assets from the source UTXO to a new UTXO at the destination address.
              You cannot selectively move assets.
            </p>
          </div>
          
          <Field>
            <Label className="text-sm font-medium text-gray-700">
              Source UTXO <span className="text-red-500">*</span>
            </Label>
            <Input
              type="text"
              name="sourceUtxo"
              defaultValue={initialUtxo || initialFormData?.sourceUtxo || ""}
              required
              disabled={!!initialUtxo}
              placeholder="Enter UTXO (txid:vout)"
              className={`
                mt-1 block w-full p-2 rounded-md border
                ${initialUtxo ? 'bg-gray-100 cursor-not-allowed' : 'bg-gray-50'}
                focus:ring-blue-500 focus:border-blue-500
              `}
            />
            <Description className={shouldShowHelpText ? "mt-2 text-sm text-gray-500" : "hidden"}>
              The UTXO containing the assets you want to move (format: txid:vout).
            </Description>
          </Field>
          
          <input type="hidden" name="destination" value={destination} />
          <DestinationInput
            ref={destinationRef}
            value={destination}
            onChange={setDestination}
            onValidationChange={setDestinationValid}
            placeholder="Enter destination address"
            required
            disabled={pending}
            showHelpText={shouldShowHelpText}
            name="destination_display"
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
