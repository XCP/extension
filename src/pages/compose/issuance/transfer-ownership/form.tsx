"use client";

import { useEffect, useState, useRef } from "react";
import { useFormStatus } from "react-dom";
import { ComposeForm } from "@/components/forms/compose-form";
import { Spinner } from "@/components/spinner";
import { AssetHeader } from "@/components/headers/asset-header";
import { DestinationInput } from "@/components/inputs/destination-input";
import { useComposer } from "@/contexts/composer-context";
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
}

/**
 * Form for transferring asset ownership using React 19 Actions.
 */
export function TransferOwnershipForm({
  formAction,
  initialFormData,
  asset,
}: TransferOwnershipFormProps): ReactElement {
  const { showHelpText } = useComposer();
  const { error: assetError, data: assetDetails, isLoading: assetLoading } = useAssetDetails(asset);
  const { pending } = useFormStatus();
  const [destination, setDestination] = useState(initialFormData?.transfer_destination || "");
  const [destinationValid, setDestinationValid] = useState(false);
  const destinationRef = useRef<HTMLInputElement>(null);


  // Focus destination input on mount
  useEffect(() => {
    destinationRef.current?.focus();
  }, []);

  if (assetLoading) {
    return <Spinner message="Loading asset details..." />;
  }

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
    <ComposeForm
      formAction={formAction}
      header={
        <AssetHeader
          assetInfo={{
            asset: asset,
            asset_longname: assetDetails?.assetInfo?.asset_longname ?? null,
            divisible: assetDetails?.assetInfo?.divisible ?? true,
            locked: assetDetails?.assetInfo?.locked ?? false,
            description: assetDetails?.assetInfo?.description ?? "",
            issuer: assetDetails?.assetInfo?.issuer ?? "",
            supply: assetDetails?.assetInfo?.supply ?? "0"
          }}
          className="mt-1 mb-5"
        />
      }
      submitDisabled={!destinationValid}
    >
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
            showHelpText={showHelpText}
            name="transfer_destination_display"
          />

    </ComposeForm>
  );
}
