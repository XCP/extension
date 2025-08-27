"use client";

import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { FaChevronDown, FaCheck } from "react-icons/fa";
import {
  Field,
  Label,
  Description,
  Input,
  Textarea,
  Listbox,
  ListboxButton,
  ListboxOption,
  ListboxOptions,
  Disclosure,
  DisclosureButton,
  DisclosurePanel,
} from "@headlessui/react";
import { Button } from "@/components/button";
import { ErrorAlert } from "@/components/error-alert";
import { CheckboxInput } from "@/components/inputs/checkbox-input";
import { FeeRateInput } from "@/components/inputs/fee-rate-input";
import { BlockHeightInput } from "@/components/inputs/block-height-input";
import { AddressHeader } from "@/components/headers/address-header";
import { useSettings } from "@/contexts/settings-context";
import { useWallet } from "@/contexts/wallet-context";
import type { FairminterOptions } from "@/utils/blockchain/counterparty";
import type { ReactElement } from "react";

const FAIRMINTER_MODELS = {
  MINER_FEE_ONLY: "MINER_FEE_ONLY",
  XCP_FEE_TO_ISSUER: "XCP_FEE_TO_ISSUER",
  XCP_FEE_BURNED: "XCP_FEE_BURNED",
} as const;

type FairminterModel = typeof FAIRMINTER_MODELS[keyof typeof FAIRMINTER_MODELS];

const FAIRMINTER_MODEL_OPTIONS = [
  { value: FAIRMINTER_MODELS.MINER_FEE_ONLY, label: "BTC Fee Model (Miners)" },
  { value: FAIRMINTER_MODELS.XCP_FEE_TO_ISSUER, label: "XCP Fee Model (To You)" },
  { value: FAIRMINTER_MODELS.XCP_FEE_BURNED, label: "XCP Fee Model (Burned)" },
];

/**
 * Props for the FairminterForm component, aligned with Composer's formAction.
 */
interface FairminterFormProps {
  formAction: (formData: FormData) => void;
  initialFormData: FairminterOptions | null;
  asset: string;
  error?: string | null;
  showHelpText?: boolean;
}

/**
 * Form for creating a fairminter using React 19 Actions.
 */
export function FairminterForm({
  formAction,
  initialFormData,
  asset,
  error: composerError,
  showHelpText,
}: FairminterFormProps): ReactElement {
  const { activeAddress, activeWallet } = useWallet();
  const { settings } = useSettings();
  const shouldShowHelpText = showHelpText ?? settings?.showHelpText ?? false;
  const { pending } = useFormStatus();
  const [error, setError] = useState<{ message: string; } | null>(null);
  const [startBlock, setStartBlock] = useState(initialFormData?.start_block?.toString() || "");
  const [endBlock, setEndBlock] = useState(initialFormData?.end_block?.toString() || "");
  const [softCapDeadlineBlock, setSoftCapDeadlineBlock] = useState(initialFormData?.soft_cap_deadline_block?.toString() || "");

  const initialMintMethod = initialFormData?.burn_payment === false
    ? FAIRMINTER_MODELS.MINER_FEE_ONLY
    : initialFormData?.burn_payment
    ? FAIRMINTER_MODELS.XCP_FEE_BURNED
    : FAIRMINTER_MODELS.XCP_FEE_TO_ISSUER;
    
  // Add state to track the selected mint method
  const [selectedMintMethod, setSelectedMintMethod] = useState<FairminterModel>(initialMintMethod);

  // Set composer error when it occurs
  useEffect(() => {
    if (composerError) {
      setError({ message: composerError });
    }
  }, [composerError]);

  // Focus asset input on mount
  useEffect(() => {
    const input = document.querySelector("input[name='asset']") as HTMLInputElement;
    input?.focus();
  }, []);

  // Create a wrapper for formAction that handles the selected mint method
  const enhancedFormAction = (formData: FormData) => {
    // Create a new FormData to avoid modifying the original
    const processedFormData = new FormData();
    
    // Copy all fields from the original FormData
    for (const [key, value] of formData.entries()) {
      processedFormData.append(key, value);
    }
    
    // Set the burn_payment field based on the selected mint method
    if (selectedMintMethod === FAIRMINTER_MODELS.MINER_FEE_ONLY) {
      processedFormData.set('burn_payment', 'false');
    } else if (selectedMintMethod === FAIRMINTER_MODELS.XCP_FEE_BURNED) {
      processedFormData.set('burn_payment', 'true');
    } else {
      // For XCP_FEE_TO_ISSUER, we don't set burn_payment (it will be null/undefined)
      processedFormData.delete('burn_payment');
    }
    
    // Add the block height values from state
    if (startBlock) {
      processedFormData.set('start_block', startBlock);
    }
    
    if (endBlock) {
      processedFormData.set('end_block', endBlock);
    }
    
    if (softCapDeadlineBlock) {
      processedFormData.set('soft_cap_deadline_block', softCapDeadlineBlock);
    }
    
    // Ensure boolean fields are properly set
    // If a checkbox is not checked, it won't be included in the FormData
    // So we need to explicitly set these fields to false if they're not present
    const booleanFields = ['divisible', 'lock_description', 'lock_quantity'];
    booleanFields.forEach(field => {
      if (!processedFormData.has(field)) {
        processedFormData.set(field, 'false');
      } else {
        // Convert 'yes' value to 'true'
        if (processedFormData.get(field) === 'yes') {
          processedFormData.set(field, 'true');
        }
      }
    });
    
    // Pass the processed FormData to the original formAction
    formAction(processedFormData);
  };

  return (
    <div className="space-y-4">
      {activeAddress && (
        <AddressHeader
          address={activeAddress.address}
          walletName={activeWallet?.name ?? ""}
          className="mt-1 mb-5"
        />
      )}
      <div className="bg-white rounded-lg shadow-lg p-3 sm:p-4">
        <form action={enhancedFormAction} className="space-y-4">
          <Field>
            <Label htmlFor="mintMethod" className="block text-sm font-medium text-gray-700">
              Mint Method <span className="text-red-500">*</span>
            </Label>
            <div className="mt-1">
              <Listbox value={FAIRMINTER_MODEL_OPTIONS.find(option => option.value === selectedMintMethod)} onChange={(option) => setSelectedMintMethod(option.value)} disabled={pending}>
                <ListboxButton
                  className="w-full p-2 text-left rounded-md border border-gray-200 bg-gray-50 focus:border-blue-500 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                  disabled={pending}
                >
                  <span>{FAIRMINTER_MODEL_OPTIONS.find(option => option.value === selectedMintMethod)?.label}</span>
                </ListboxButton>
                <ListboxOptions className="w-full mt-1 bg-white border rounded-md shadow-lg max-h-60 overflow-auto z-10">
                  {FAIRMINTER_MODEL_OPTIONS.map((option) => (
                    <ListboxOption 
                      key={option.value} 
                      value={option} 
                      className="p-2 cursor-pointer hover:bg-gray-100"
                    >
                      {({ selected }) => (
                        <div className="flex justify-between">
                          <span className={selected ? "font-medium" : ""}>{option.label}</span>
                        </div>
                      )}
                    </ListboxOption>
                  ))}
                </ListboxOptions>
              </Listbox>
            </div>
            <Description className={shouldShowHelpText ? "mt-2 text-sm text-gray-500" : "hidden"}>
              Select the mint method for your fairminter.
            </Description>
          </Field>
          <Field>
            <Label htmlFor="asset" className="block text-sm font-medium text-gray-700">
              Asset Name <span className="text-red-500">*</span>
            </Label>
            <Input
              id="asset"
              name="asset"
              type="text"
              defaultValue={initialFormData?.asset || (asset ? `${asset}.` : "")}
              className="mt-1 block w-full p-2 rounded-md border border-gray-300 bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              required
              disabled={pending}
            />
            <Description className={shouldShowHelpText ? "mt-2 text-sm text-gray-500" : "hidden"}>
              The name of the asset to be minted.
            </Description>
          </Field>
          {selectedMintMethod === FAIRMINTER_MODELS.MINER_FEE_ONLY && (
            <Field>
              <Label htmlFor="max_mint_per_tx" className="block text-sm font-medium text-gray-700">
                Mint per TX <span className="text-red-500">*</span>
              </Label>
              <Input
                id="max_mint_per_tx"
                name="max_mint_per_tx"
                type="text"
                defaultValue={initialFormData?.max_mint_per_tx?.toString() || ""}
                className="mt-1 block w-full p-2 rounded-md border border-gray-300 bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                required
                disabled={pending}
              />
              <Description className={shouldShowHelpText ? "mt-2 text-sm text-gray-500" : "hidden"}>
                Maximum amount that can be minted in a single transaction.
              </Description>
            </Field>
          )}
          {selectedMintMethod !== FAIRMINTER_MODELS.MINER_FEE_ONLY && (
            <>
              <Field>
                <Label htmlFor="quantity_by_price" className="block text-sm font-medium text-gray-700">
                  Get Per Mint
                </Label>
                <Input
                  id="quantity_by_price"
                  name="quantity_by_price"
                  type="text"
                  defaultValue={initialFormData?.quantity_by_price?.toString() || ""}
                  className="mt-1 block w-full p-2 rounded-md border border-gray-300 bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  disabled={pending}
                />
                <Description className={shouldShowHelpText ? "mt-2 text-sm text-gray-500" : "hidden"}>
                  The quantity of asset minted per price unit.
                </Description>
              </Field>
              <Field>
                <Label htmlFor="price" className="block text-sm font-medium text-gray-700">
                  Pay Per Mint <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="price"
                  name="price"
                  type="text"
                  defaultValue={initialFormData?.price?.toString() || ""}
                  className="mt-1 block w-full p-2 rounded-md border border-gray-300 bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                  disabled={pending}
                />
                <Description className={shouldShowHelpText ? "mt-2 text-sm text-gray-500" : "hidden"}>
                  The price in XCP per unit of the asset.
                </Description>
              </Field>
            </>
          )}
          <CheckboxInput
            name="divisible"
            label="Divisible"
            defaultChecked={initialFormData?.divisible ?? true}
            disabled={pending}
          />
          <Field>
            <Label htmlFor="description" className="block text-sm font-medium text-gray-700">
              Description
            </Label>
            <Textarea
              id="description"
              name="description"
              defaultValue={initialFormData?.description || ""}
              className="mt-1 block w-full p-2 rounded-md border border-gray-300 bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              rows={2}
              disabled={pending}
            />
            <Description className={shouldShowHelpText ? "mt-2 text-sm text-gray-500" : "hidden"}>
              A textual description for the asset.
            </Description>
          </Field>
          <CheckboxInput
            name="lock_description"
            label="Lock Description"
            defaultChecked={initialFormData?.lock_description || false}
            disabled={pending}
          />
          <Field>
            <Label htmlFor="hard_cap" className="block text-sm font-medium text-gray-700">
              Hard Cap
            </Label>
            <Input
              id="hard_cap"
              name="hard_cap"
              type="text"
              defaultValue={initialFormData?.hard_cap?.toString() || ""}
              className="mt-1 block w-full p-2 rounded-md border border-gray-300 bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              disabled={pending}
            />
            <Description className={shouldShowHelpText ? "mt-2 text-sm text-gray-500" : "hidden"}>
              Maximum total supply that can be minted.
            </Description>
          </Field>
          <CheckboxInput
            name="lock_quantity"
            label="Lock Quantity"
            defaultChecked={initialFormData?.lock_quantity || false}
            disabled={pending}
          />
          <Disclosure>
            {({ open }) => (
              <>
                <DisclosureButton className="flex items-center text-md font-semibold text-gray-700 hover:text-gray-900">
                  <FaChevronDown
                    className={`${open ? "transform rotate-180" : ""} w-4 h-4 mr-2 transition-transform`}
                  />
                  Advanced Options
                </DisclosureButton>
                <DisclosurePanel className="mt-2 space-y-4">
                  <BlockHeightInput
                    name="start_block"
                    label="Start Block"
                    value={startBlock}
                    onChange={setStartBlock}
                    setError={(message) => message ? setError({ message }) : setError(null)}
                    shouldShowHelpText={shouldShowHelpText}
                    description="The block at which the sale starts."
                    disabled={pending}
                  />
                  <BlockHeightInput
                    name="end_block"
                    label="End Block"
                    value={endBlock}
                    onChange={setEndBlock}
                    setError={(message) => message ? setError({ message }) : setError(null)}
                    shouldShowHelpText={shouldShowHelpText}
                    description="The block at which the sale ends."
                    disabled={pending}
                  />
                  <Field>
                    <Label htmlFor="premint_quantity" className="block text-sm font-medium text-gray-700">
                      Pre-mine
                    </Label>
                    <Input
                      id="premint_quantity"
                      name="premint_quantity"
                      type="text"
                      defaultValue={initialFormData?.premint_quantity?.toString() || "0"}
                      className="mt-1 block w-full p-2 rounded-md border border-gray-300 bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      disabled={pending}
                    />
                    <Description className={shouldShowHelpText ? "mt-2 text-sm text-gray-500" : "hidden"}>
                      Amount of asset to mint when the sale starts.
                    </Description>
                  </Field>
                  <Field>
                    <Label
                      htmlFor="minted_asset_commission"
                      className="block text-sm font-medium text-gray-700"
                    >
                      Commission
                    </Label>
                    <Input
                      id="minted_asset_commission"
                      name="minted_asset_commission"
                      type="text"
                      defaultValue={initialFormData?.minted_asset_commission?.toString() || "0.0"}
                      className="mt-1 block w-full p-2 rounded-md border border-gray-300 bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      disabled={pending}
                    />
                    <Description className={shouldShowHelpText ? "mt-2 text-sm text-gray-500" : "hidden"}>
                      Commission (fraction between 0 and less than 1) to be paid.
                    </Description>
                  </Field>
                  {selectedMintMethod !== FAIRMINTER_MODELS.MINER_FEE_ONLY && (
                    <>
                      <Field>
                        <Label htmlFor="soft_cap" className="block text-sm font-medium text-gray-700">
                          Soft Cap
                        </Label>
                        <Input
                          id="soft_cap"
                          name="soft_cap"
                          type="text"
                          defaultValue={initialFormData?.soft_cap?.toString() || ""}
                          className="mt-1 block w-full p-2 rounded-md border border-gray-300 bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          placeholder="0"
                          disabled={pending}
                        />
                        <Description className={shouldShowHelpText ? "mt-2 text-sm text-gray-500" : "hidden"}>
                          Minimum amount required for the sale to succeed.
                        </Description>
                      </Field>
                      <BlockHeightInput
                        name="soft_cap_deadline_block"
                        label="Soft Cap Deadline Block"
                        value={softCapDeadlineBlock}
                        onChange={setSoftCapDeadlineBlock}
                        setError={(message) => message ? setError({ message }) : setError(null)}
                        shouldShowHelpText={shouldShowHelpText}
                        description="The block by which the soft cap must be reached."
                        disabled={pending}
                      />
                    </>
                  )}
                </DisclosurePanel>
              </>
            )}
          </Disclosure>

          <FeeRateInput showHelpText={shouldShowHelpText} disabled={pending} />
          
          {error && (
            <ErrorAlert
              message={error.message}
              onClose={() => setError(null)}
            />
          )}
          
          <Button type="submit" color="blue" fullWidth disabled={pending}>
            {pending ? "Submitting..." : "Continue"}
          </Button>
        </form>
      </div>
    </div>
  );
}
