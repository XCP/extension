"use client";

import { useEffect } from "react";
import { useFormStatus } from "react-dom";
import { Field, Label, Description, Input } from "@headlessui/react";
import { Button } from "@/components/button";
import { FeeRateInput } from "@/components/inputs/fee-rate-input";
import { useSettings } from "@/contexts/settings-context";
import type { DestroyOptions } from "@/utils/blockchain/counterparty";
import type { ReactElement } from "react";

/**
 * Props for the DestroySupplyForm component, aligned with Composer's formAction.
 */
interface DestroySupplyFormProps {
  formAction: (formData: FormData) => void;
  initialFormData: DestroyOptions | null;
}

/**
 * Form for destroying asset supply using React 19 Actions.
 */
export function DestroySupplyForm({
  formAction,
  initialFormData,
}: DestroySupplyFormProps): ReactElement {
  const { settings } = useSettings();
  const shouldShowHelpText = settings?.showHelpText ?? false;
  const { pending } = useFormStatus();

  // Focus asset input on mount
  useEffect(() => {
    const input = document.getElementById("asset") as HTMLInputElement;
    input?.focus();
  }, []);

  return (
    <div className="bg-white rounded-lg shadow-lg p-3 sm:p-4">
      <form action={formAction} className="space-y-4">
        <Field>
          <Label htmlFor="asset" className="block text-sm font-medium text-gray-700">
            Asset Name <span className="text-red-500">*</span>
          </Label>
          <Input
            id="asset"
            name="asset"
            type="text"
            defaultValue={initialFormData?.asset || ""}
            className="mt-1 block w-full p-2 rounded-md border bg-gray-50 focus:border-blue-500 focus:ring-blue-500"
            required
            placeholder="Enter asset name"
            disabled={pending}
          />
          <Description className={shouldShowHelpText ? "mt-2 text-sm text-gray-500" : "hidden"}>
            The name of the asset to destroy supply from.
          </Description>
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
            className="mt-1 block w-full p-2 rounded-md border bg-gray-50 focus:border-blue-500 focus:ring-blue-500"
            required
            disabled={pending}
          />
          <Description className={shouldShowHelpText ? "mt-2 text-sm text-gray-500" : "hidden"}>
            The quantity of the asset to destroy.
          </Description>
        </Field>

        <Field>
          <Label htmlFor="tag" className="block text-sm font-medium text-gray-700">
            Tag
          </Label>
          <Input
            id="tag"
            name="tag"
            type="text"
            defaultValue={initialFormData?.tag || ""}
            className="mt-1 block w-full p-2 rounded-md border bg-gray-50 focus:border-blue-500 focus:ring-blue-500"
            disabled={pending}
          />
          <Description className={shouldShowHelpText ? "mt-2 text-sm text-gray-500" : "hidden"}>
            Optional tag to attach to this destroy action.
          </Description>
        </Field>

        <FeeRateInput showHelpText={shouldShowHelpText} disabled={pending} />
        
        <Button type="submit" color="red" fullWidth disabled={pending}>
          {pending ? "Submitting..." : "Continue"}
        </Button>
      </form>
    </div>
  );
}
