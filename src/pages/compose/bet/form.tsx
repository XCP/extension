"use client";

import { useEffect, useState, useRef } from "react";
import { useFormStatus } from "react-dom";
import { Field, Label, Description, Input, Listbox, ListboxButton, ListboxOption, ListboxOptions } from "@headlessui/react";
import { Button } from "@/components/button";
import { ErrorAlert } from "@/components/error-alert";
import { BalanceHeader } from "@/components/headers/balance-header";
import { DestinationInput } from "@/components/inputs/destination-input";
import { FeeRateInput } from "@/components/inputs/fee-rate-input";
import { useSettings } from "@/contexts/settings-context";
import { useAssetDetails } from "@/hooks/useAssetDetails";
import { formatAmount } from "@/utils/format";
import type { BetOptions } from "@/utils/blockchain/counterparty";
import type { ReactElement } from "react";
import { FiCheck } from "react-icons/fi";

/**
 * Props for the BetForm component, aligned with Composer's formAction.
 */
interface BetFormProps {
  formAction: (formData: FormData) => void;
  initialFormData: BetOptions | null;
  error?: string | null;
  showHelpText?: boolean;
}

// Bet type options
interface BetTypeOption {
  id: number;
  name: string;
}

const betTypeOptions: BetTypeOption[] = [
  { id: 2, name: "Equal" },
  { id: 3, name: "Not Equal" },
];

/**
 * Form for composing a bet transaction using React 19 Actions.
 */
export function BetForm({ formAction, initialFormData ,
  error: composerError,
  showHelpText,
}: BetFormProps): ReactElement {
  const { settings } = useSettings();
  const shouldShowHelpText = showHelpText ?? settings?.showHelpText ?? false;
  const { error: assetError, data: assetDetails } = useAssetDetails("XCP");
  const { pending } = useFormStatus();
  const [error, setError] = useState<{ message: string; } | null>(null);

  // Local state for form values
  const [satPerVbyte, setSatPerVbyte] = useState<number>(initialFormData?.sat_per_vbyte || 0.1);
  const [selectedBetType, setSelectedBetType] = useState<BetTypeOption>(
    betTypeOptions.find(option => option.id === initialFormData?.bet_type) || betTypeOptions[0]
  );
  const [feedAddress, setFeedAddress] = useState(initialFormData?.feed_address || "");
  const [feedAddressValid, setFeedAddressValid] = useState(false);
  const feedAddressRef = useRef<HTMLInputElement>(null);
  const [deadlineDate, setDeadlineDate] = useState<Date>(() => {
    // If we have an initial deadline (unix timestamp), convert it to a Date
    if (initialFormData?.deadline) {
      return new Date(initialFormData.deadline * 1000);
    }
    // Otherwise set a default date 7 days in the future
    const date = new Date();
    date.setDate(date.getDate() + 7);
    return date;
  });

  const isDivisible = assetDetails?.assetInfo?.divisible ?? true;

  // Set composer error when it occurs
  useEffect(() => {
    if (composerError) {
      setError({ message: composerError });
    }
  }, [composerError]);

  // Create a wrapper for formAction that handles data conversion
  const enhancedFormAction = (formData: FormData) => {
    // Create a new FormData to avoid modifying the original
    const processedFormData = new FormData();
    
    // Copy all fields from the original FormData
    for (const [key, value] of formData.entries()) {
      processedFormData.append(key, value);
    }
    
    // Add the selected bet type
    processedFormData.set('bet_type', selectedBetType.id.toString());
    
    // Convert the deadline date to a unix timestamp
    const unixTimestamp = Math.floor(deadlineDate.getTime() / 1000);
    processedFormData.set('deadline', unixTimestamp.toString());
    
    const wager = formData.get('wager_quantity');
    if (wager) {
      processedFormData.set('wager_quantity', wager.toString());
    }
    
    const counterwager = formData.get('counterwager_quantity');
    if (counterwager) {
      processedFormData.set('counterwager_quantity', counterwager.toString());
    }
    
    // Set the fee rate from state
    processedFormData.set('sat_per_vbyte', satPerVbyte.toString());
    
    // Pass the processed FormData to the original formAction
    formAction(processedFormData);
  };

  // Format date for display
  const formatDate = (date: Date): string => {
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Set composer error when it occurs
  useEffect(() => {
    if (composerError) {
      setError({ message: composerError });
    }
  }, [composerError]);

  // Focus feed_address input on mount
  useEffect(() => {
    feedAddressRef.current?.focus();
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
          className="mt-1 mb-5"
        />
      ) : null}
      <div className="bg-white rounded-lg shadow-lg p-4">
        {error && (
          <ErrorAlert
            message={error.message}
            onClose={() => setError(null)}
          />
        )}
        <form action={enhancedFormAction} className="space-y-6">
          <input type="hidden" name="feed_address" value={feedAddress} />
          <DestinationInput
            ref={feedAddressRef}
            value={feedAddress}
            onChange={setFeedAddress}
            onValidationChange={setFeedAddressValid}
            placeholder="Enter feed address"
            required
            disabled={pending}
            showHelpText={shouldShowHelpText}
            name="feed_address_display"
            label="Feed Address"
            helpText="Enter the address of the feed you want to bet on."
          />

          <Field>
            <Label className="text-sm font-medium text-gray-700">
              Bet Type <span className="text-red-500">*</span>
            </Label>
            <div className="mt-1">
              <Listbox value={selectedBetType} onChange={setSelectedBetType} disabled={pending}>
                <ListboxButton
                  className="w-full p-2 text-left rounded-md border border-gray-300 bg-gray-50 focus:border-blue-500 focus:ring-blue-500"
                  disabled={pending}
                >
                  <span>{selectedBetType.name}</span>
                </ListboxButton>
                <ListboxOptions className="w-full mt-1 bg-white border rounded-md shadow-lg max-h-60 overflow-auto z-10">
                  {betTypeOptions.map((option) => (
                    <ListboxOption 
                      key={option.id} 
                      value={option} 
                      className="p-2 cursor-pointer hover:bg-gray-100"
                    >
                      {({ selected }) => (
                        <div className="flex justify-between">
                          <span className={selected ? "font-medium" : ""}>{option.name}</span>
                        </div>
                      )}
                    </ListboxOption>
                  ))}
                </ListboxOptions>
              </Listbox>
            </div>
            <Description className={shouldShowHelpText ? "mt-2 text-sm text-gray-500" : "hidden"}>
              Select the bet type (Equal or Not Equal).
            </Description>
          </Field>

          <Field>
            <Label className="text-sm font-medium text-gray-700">
              Deadline <span className="text-red-500">*</span>
            </Label>
            <div className="mt-1">
              <Input
                type="datetime-local"
                name="deadline_date"
                value={deadlineDate.toISOString().slice(0, 16)}
                onChange={(e) => {
                  const newDate = new Date(e.target.value);
                  if (!isNaN(newDate.getTime())) {
                    setDeadlineDate(newDate);
                  }
                }}
                className="mt-1 block w-full p-2 rounded-md border border-gray-300 bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                disabled={pending}
              />
              <div className="mt-2 text-sm text-gray-500">
                Selected: {formatDate(deadlineDate)}
              </div>
            </div>
            <Description className={shouldShowHelpText ? "mt-2 text-sm text-gray-500" : "hidden"}>
              Select the deadline date and time for the bet (will be converted to a Unix timestamp).
            </Description>
          </Field>

          <Field>
            <Label className="text-sm font-medium text-gray-700">
              Wager Quantity <span className="text-red-500">*</span>
            </Label>
            <Input
              type="text"
              name="wager_quantity"
              defaultValue={initialFormData?.wager_quantity?.toString() || ""}
              required
              placeholder="Enter wager quantity"
              className="mt-1 block w-full p-2 rounded-md border border-gray-300 bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
              defaultValue={initialFormData?.counterwager_quantity?.toString() || ""}
              required
              placeholder="Enter counterwager quantity"
              className="mt-1 block w-full p-2 rounded-md border border-gray-300 bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
              className="mt-1 block w-full p-2 rounded-md border border-gray-300 bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
              className="mt-1 block w-full p-2 rounded-md border border-gray-300 bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              disabled={pending}
            />
            <Description className={shouldShowHelpText ? "mt-2 text-sm text-gray-500" : "hidden"}>
              Enter the leverage factor (default is 5040).
            </Description>
          </Field>

          <Field>
            <Label className="text-sm font-medium text-gray-700">
              Target Value <span className="text-red-500">*</span>
            </Label>
            <Input
              type="text"
              name="target_value"
              defaultValue={initialFormData?.target_value?.toString() || ""}
              required
              placeholder="Enter target value"
              className="mt-1 block w-full p-2 rounded-md border border-gray-300 bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              disabled={pending}
            />
            <Description className={shouldShowHelpText ? "mt-2 text-sm text-gray-500" : "hidden"}>
              Enter the target value for Equal/NotEqual bets.
            </Description>
          </Field>

          <FeeRateInput 
            showHelpText={shouldShowHelpText} 
            disabled={pending} 
            onFeeRateChange={setSatPerVbyte}
          />

          <Button type="submit" color="blue" fullWidth disabled={pending || !feedAddressValid}>
            {pending ? "Submitting..." : "Continue"}
          </Button>
        </form>
      </div>
    </div>
  );
}
