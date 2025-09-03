"use client";

import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { ComposeForm } from "@/components/compose-form";
import { CheckboxInput } from "@/components/inputs/checkbox-input";
import { AssetNameInput } from "@/components/inputs/asset-name-input";
import { NumberInput } from "@/components/inputs/number-input";
import { TextAreaInput } from "@/components/inputs/textarea-input";
import { useComposer } from "@/contexts/composer-context";
import { formatAmount } from "@/utils/format";
import type { IssuanceOptions } from "@/utils/blockchain/counterparty";
import type { ReactElement } from "react";

/**
 * Props for the IssueSupplyForm component, aligned with Composer's formAction.
 */
interface IssueSupplyFormProps {
  formAction: (formData: FormData) => void;
  initialFormData: IssuanceOptions | null;
  initialParentAsset?: string;
}

/**
 * Form for issuing additional supply to an existing asset using React 19 Actions.
 */
export function IssueSupplyForm({
  formAction,
  initialFormData,
  initialParentAsset,
}: IssueSupplyFormProps): ReactElement {
  // Context hooks
  const { showHelpText } = useComposer();
  
  // Form status
  const { pending } = useFormStatus();
  
  // Form state
  const [assetName, setAssetName] = useState(initialFormData?.asset || (initialParentAsset ? `${initialParentAsset}.` : ""));
  const [isAssetNameValid, setIsAssetNameValid] = useState(false);
  const [quantity, setQuantity] = useState(initialFormData?.quantity?.toString() || "");
  const [description, setDescription] = useState(initialFormData?.description || "");

  return (
    <ComposeForm
      formAction={formAction}
    >
        <AssetNameInput
          value={assetName}
          onChange={setAssetName}
          onValidationChange={setIsAssetNameValid}
          label="Asset Name"
          required={true}
          placeholder={initialParentAsset ? `${initialParentAsset}.SUBASSET` : "Enter asset name"}
          disabled={pending}
          showHelpText={showHelpText}
          helpText={initialParentAsset
            ? `Enter a subasset name after "${initialParentAsset}." to create a subasset`
            : "The name of the asset to issue."}
        />
        <NumberInput
          value={quantity}
          onChange={(val) => setQuantity(String(val))}
          label="Amount"
          required={true}
          disabled={pending}
          decimals={initialFormData?.divisible ?? true ? 8 : 0}
          min={0}
          showHelpText={showHelpText}
          helpText={`The quantity of the asset to issue ${initialFormData?.divisible ?? true ? "(up to 8 decimal places)" : "(whole numbers only)"}.`}
        />
        <div className="grid grid-cols-2 gap-4">
          <CheckboxInput
            name="divisible"
            label="Divisible"
            defaultChecked={initialFormData?.divisible ?? true}
            disabled={pending}
          />
          <CheckboxInput
            name="lock"
            label="Locked"
            defaultChecked={initialFormData?.lock || false}
            disabled={pending}
          />
        </div>
        <TextAreaInput
          value={description}
          onChange={setDescription}
          label="Description"
          rows={2}
          disabled={pending}
          showHelpText={showHelpText}
          helpText="A textual description for the asset."
        />

    </ComposeForm>
  );
}
