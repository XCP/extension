"use client";

import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { Field, Label, Description, Input, Textarea } from "@headlessui/react";
import { ComposeForm } from "@/components/compose-form";
import { CheckboxInput } from "@/components/inputs/checkbox-input";
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


  // Focus asset input on mount
  useEffect(() => {
    const input = document.getElementById("asset") as HTMLInputElement;
    input?.focus();
  }, []);

  return (
    <ComposeForm
      formAction={formAction}
    >
        <Field>
          <Label htmlFor="asset" className="block text-sm font-medium text-gray-700">
            Asset Name <span className="text-red-500">*</span>
          </Label>
          <Input
            id="asset"
            name="asset"
            type="text"
            defaultValue={initialFormData?.asset || (initialParentAsset ? `${initialParentAsset}.` : "")}
            className="mt-1 block w-full p-2 rounded-md border border-gray-300 bg-gray-50 focus:border-blue-500 focus:ring-blue-500"
            required
            placeholder={initialParentAsset ? `${initialParentAsset}.SUBASSET` : "Enter asset name"}
            disabled={pending}
          />
          {showHelpText && (
            <Description className="mt-2 text-sm text-gray-500">
              {initialParentAsset
                ? `Enter a subasset name after "${initialParentAsset}." to create a subasset`
                : "The name of the asset to issue."}
            </Description>
          )}
        </Field>
        <Field>
          <Label htmlFor="quantity" className="block text-sm font-medium text-gray-700">
            Amount <span className="text-red-500">*</span>
          </Label>
          <Input
            id="quantity"
            name="quantity"
            type="text"
            defaultValue={initialFormData?.quantity?.toString() || ""}
            className="mt-1 block w-full p-2 rounded-md border border-gray-300 bg-gray-50 focus:border-blue-500 focus:ring-blue-500"
            required
            disabled={pending}
          />
          {showHelpText && (
            <Description className="mt-2 text-sm text-gray-500">
              The quantity of the asset to issue {initialFormData?.divisible ?? true ? "(up to 8 decimal places)" : "(whole numbers only)"}.
            </Description>
          )}
        </Field>
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
        <Field>
          <Label htmlFor="description" className="block text-sm font-medium text-gray-700">
            Description
          </Label>
          <Textarea
            id="description"
            name="description"
            defaultValue={initialFormData?.description || ""}
            className="mt-1 block w-full p-2 rounded-md border border-gray-300 bg-gray-50 focus:border-blue-500 focus:ring-blue-500"
            rows={2}
            disabled={pending}
          />
          {showHelpText && (
            <Description className="mt-2 text-sm text-gray-500">
              A textual description for the asset.
            </Description>
          )}
        </Field>

    </ComposeForm>
  );
}
