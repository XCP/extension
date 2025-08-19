"use client";

import { useEffect, useState, useRef } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/button";
import { ErrorAlert } from "@/components/error-alert";
import { AssetHeader } from "@/components/headers/asset-header";
import { DestinationInput } from "@/components/inputs/destination-input";
import { FeeRateInput } from "@/components/inputs/fee-rate-input";
import { useSettings } from "@/contexts/settings-context";
import { useAssetDetails } from "@/hooks/useAssetDetails";
import type { IssuanceOptions } from "@/utils/blockchain/counterparty";
import type { ReactElement } from "react";

/**
 * Props for the TransferOwnershipForm component, aligned with Composer's formAction.
 */
interface TransferOwnershipFormProps {
  formAction: (formData: FormData) => void;
  initialFormData: IssuanceOptions | null;
  asset: string;
  error?: string | null;
  showHelpText?: boolean;
}

/**
 * Form for transferring asset ownership using React 19 Actions.
 */
export function TransferOwnershipForm({
  formAction,
  initialFormData,
  asset,
  error: composerError,
  showHelpText,
}: TransferOwnershipFormProps): ReactElement {
  const { settings } = useSettings();
  const shouldShowHelpText = showHelpText ?? settings?.showHelpText ?? false;
  const { error: assetError, data: assetDetails } = useAssetDetails(asset);
  const { pending } = useFormStatus();
  const [error, setError] = useState<{ message: string; } | null>(null);
  const [destination, setDestination] = useState(initialFormData?.transfer_destination || "");
  const [destinationValid, setDestinationValid] = useState(false);
  const destinationRef = useRef<HTMLInputElement>(null);

  // Set composer error when it occurs
  useEffect(() => {
    if (composerError) {
      setError({ message: composerError });
    }
  }, [composerError]);

  // Focus destination input on mount
  useEffect(() => {
    destinationRef.current?.focus();
  }, []);

  if (assetError || !assetDetails) {
    return (
      <div className="p-4 text-red-500">
        Unable to load asset details. Please ensure the asset exists and you have the necessary
        permissions.
      </div>
    );
  }
  if (asset === "BTC") return <div className="p-4 text-red-500">Cannot transfer ownership of BTC</div>;

  return (
    <div className="space-y-4">
      <AssetHeader
        assetInfo={{
          asset,
          asset_longname: assetDetails?.assetInfo?.asset_longname ?? null,
          divisible: assetDetails?.assetInfo?.divisible ?? true,
          locked: assetDetails?.assetInfo?.locked ?? false,
          description: assetDetails?.assetInfo?.description ?? "",
          issuer: assetDetails?.assetInfo?.issuer ?? "",
          supply: assetDetails?.assetInfo?.supply ?? "0"
        }}
        className="mt-1 mb-5"
      />
      {(error || composerError) && (
        <ErrorAlert message={error?.message || composerError || ""} />
      )}
      <div className="bg-white rounded-lg shadow-lg p-3 sm:p-4">
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="asset" value={asset} />
          <input type="hidden" name="quantity" value="0" />
          <input type="hidden" name="transfer_destination" value={destination} />
          <DestinationInput
            ref={destinationRef}
            value={destination}
            onChange={setDestination}
            onValidationChange={setDestinationValid}
            placeholder="Enter address to transfer ownership to"
            required
            disabled={pending}
            showHelpText={shouldShowHelpText}
            name="transfer_destination_display"
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
