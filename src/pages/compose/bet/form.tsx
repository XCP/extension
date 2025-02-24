"use client";

import { useEffect } from "react";
import { useFormStatus } from "react-dom";
import { Field, Label, Description, Input } from "@headlessui/react";
import { Button } from "@/components/button";
import { BalanceHeader } from "@/components/headers/balance-header";
import { FeeRateInput } from "@/components/inputs/fee-rate-input";
import { useSettings } from "@/contexts/settings-context";
import { useAssetDetails } from "@/hooks/useAssetDetails";
import type { BetOptions } from "@/utils/blockchain/counterparty";
import type { ReactElement } from "react";

/**
 * Props for the BetForm component, aligned with Composer's formAction.
 */
interface BetFormProps {
  formAction: (formData: FormData) => void;
  initialFormData: BetOptions | null;
}

/**
 * Form for composing a bet transaction using React 19 Actions.
 */
export function BetForm({ formAction, initialFormData }: BetFormProps): ReactElement {
  const { settings } = useSettings();
  const shouldShowHelpText = settings?.showHelpText ?? false;
  const { error: assetError, data: assetDetails } = useAssetDetails("XCP");
  const { pending } = useFormStatus();

  const isDivisible = assetDetails?.assetInfo?.divisible ?? true;

  // Focus feed_address input on mount
  useEffect(() => {
    const input = document.querySelector("input[name='feed_address']") as HTMLInputElement;
    input?.focus();
  }, []);

  return (
    <div className="space-y-4">
      {assetError ? (
        <div className="text-red-500 mb-4">{assetError.message}</div>
      ) : assetDetails ? (
        <BalanceHeader
          balance={{
            asset: "XCP",
            quantity_normalized: assetDetails.availableBalance,
            asset_info: assetDetails.assetInfo || undefined,
          }}
          className="mb-5"
        />
      ) : null}
      <div className="bg-white rounded-lg shadow-lg p-4">
        <form action={formAction} className="space-y-6">
          <Field>
            <Label className="text-sm font-medium text-gray-700">
              Feed Address <span className="text-red-500">*</span>
            </Label>
            <Input
              type="text"
              name="feed_address"
              defaultValue={initialFormData?.feed_address || ""}
              required
              placeholder="Enter feed address"
              className="mt-1 block w-full p-2 rounded-md border bg-gray-50 focus:ring-blue-500 focus:border-blue-500"
              disabled={pending}
            />
            <Description className={shouldShowHelpText ? "mt-2 text-sm text-gray-500" : "hidden"}>
              Enter the address of the feed you want to bet on.
            </Description>
          </Field>

          <Field>
            <Label className="text-sm font-medium text-gray-700">
              Bet Type <span className="text-red-500">*</span>
            </Label>
            <Input
              type="text"
              name="bet_type"
              defaultValue={initialFormData?.bet_type?.toString() || "2"}
              required
              placeholder="e.g., 2"
              className="mt-1 block w-full p-2 rounded-md border bg-gray-50 focus:ring-blue-500 focus:border-blue-500"
              disabled={pending}
            />
            <Description className={shouldShowHelpText ? "mt-2 text-sm text-gray-500" : "hidden"}>
              Enter bet type (0 = Bullish, 1 = Bearish, 2 = Equal, 3 = Not Equal).
            </Description>
          </Field>

          <Field>
            <Label className="text-sm font-medium text-gray-700">
              Deadline <span className="text-red-500">*</span>
            </Label>
            <Input
              type="text"
              name="deadline"
              defaultValue={initialFormData?.deadline?.toString() || ""}
              required
              placeholder="Enter deadline block"
              className="mt-1 block w-full p-2 rounded-md border bg-gray-50 focus:ring-blue-500 focus:border-blue-500"
              disabled={pending}
            />
            <Description className={shouldShowHelpText ? "mt-2 text-sm text-gray-500" : "hidden"}>
              Enter the block deadline for the bet.
            </Description>
          </Field>

          <Field>
            <Label className="text-sm font-medium text-gray-700">
              Wager Quantity <span className="text-red-500">*</span>
            </Label>
            <Input
              type="text"
              name="wager_quantity"
              defaultValue={
                initialFormData && assetDetails
                  ? isDivisible
                    ? (initialFormData.wager_quantity / 1e8).toFixed(8)
                    : initialFormData.wager_quantity.toString()
                  : ""
              }
              required
              placeholder="Enter wager quantity"
              className="mt-1 block w-full p-2 rounded-md border bg-gray-50 focus:ring-blue-500 focus:border-blue-500"
              disabled={pending}
            />
            <Description className={shouldShowHelpText ? "mt-2 text-sm text-gray-500" : "hidden"}>
              Enter the XCP wager amount (up to 8 decimal places).
            </Description>
          </Field>

          <Field>
            <Label className="text-sm font-medium text-gray-700">
              Counterwager Quantity <span className="text-red-500">*</span>
            </Label>
            <Input
              type="text"
              name="counterwager_quantity"
              defaultValue={
                initialFormData && assetDetails
                  ? isDivisible
                    ? (initialFormData.counterwager_quantity / 1e8).toFixed(8)
                    : initialFormData.counterwager_quantity.toString()
                  : ""
              }
              required
              placeholder="Enter counterwager quantity"
              className="mt-1 block w-full p-2 rounded-md border bg-gray-50 focus:ring-blue-500 focus:border-blue-500"
              disabled={pending}
            />
            <Description className={shouldShowHelpText ? "mt-2 text-sm text-gray-500" : "hidden"}>
              Enter the XCP counterwager amount (up to 8 decimal places).
            </Description>
          </Field>

          <Field>
            <Label className="text-sm font-medium text-gray-700">
              Expiration <span className="text-red-500">*</span>
            </Label>
            <Input
              type="text"
              name="expiration"
              defaultValue={initialFormData?.expiration?.toString() || ""}
              required
              placeholder="Enter expiration blocks"
              className="mt-1 block w-full p-2 rounded-md border bg-gray-50 focus:ring-blue-500 focus:border-blue-500"
              disabled={pending}
            />
            <Description className={shouldShowHelpText ? "mt-2 text-sm text-gray-500" : "hidden"}>
              Enter the number of blocks until the bet expires.
            </Description>
          </Field>

          <Field>
            <Label className="text-sm font-medium text-gray-700">
              Leverage <span className="text-red-500">*</span>
            </Label>
            <Input
              type="text"
              name="leverage"
              defaultValue={initialFormData?.leverage?.toString() || "5040"}
              required
              placeholder="e.g., 5040"
              className="mt-1 block w-full p-2 rounded-md border bg-gray-50 focus:ring-blue-500 focus:border-blue-500"
              disabled={pending}
            />
            <Description className={shouldShowHelpText ? "mt-2 text-sm text-gray-500" : "hidden"}>
              Enter the leverage factor (default is 5040).
            </Description>
          </Field>

          <Field>
            <Label className="text-sm font-medium text-gray-700">
              Target Value{" "}
              {(initialFormData?.bet_type === 2 || initialFormData?.bet_type === 3) && (
                <span className="text-red-500">*</span>
              )}
            </Label>
            <Input
              type="text"
              name="target_value"
              defaultValue={initialFormData?.target_value?.toString() || ""}
              required={initialFormData?.bet_type === 2 || initialFormData?.bet_type === 3}
              placeholder="Enter target value"
              className="mt-1 block w-full p-2 rounded-md border bg-gray-50 focus:ring-blue-500 focus:border-blue-500"
              disabled={pending}
            />
            <Description className={shouldShowHelpText ? "mt-2 text-sm text-gray-500" : "hidden"}>
              Enter the target value for Equal/NotEqual bets (required for types 2 and 3).
            </Description>
          </Field>

          <FeeRateInput showHelpText={shouldShowHelpText} disabled={pending} />

          <Button type="submit" color="blue" fullWidth disabled={pending}>
            {pending ? "Submitting..." : "Continue"}
          </Button>
        </form>
      </div>
    </div>
  );
}
