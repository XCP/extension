"use client";

import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { FaChevronDown } from "react-icons/fa";
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
import { ComposeForm } from "@/components/forms/compose-form";
import { CheckboxInput } from "@/components/inputs/checkbox-input";
import { BlockHeightInput } from "@/components/inputs/block-height-input";
import { SettingSwitch } from "@/components/inputs/setting-switch";
import { AssetNameInput } from "@/components/inputs/asset-name-input";
import { AddressHeader } from "@/components/headers/address-header";
import { AssetHeader } from "@/components/headers/asset-header";
import { ErrorAlert } from "@/components/error-alert";
import { useComposer } from "@/contexts/composer-context";
import { useAssetDetails } from "@/hooks/useAssetDetails";
import { AddressType } from "@/utils/blockchain/bitcoin";
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
}

/**
 * Form for creating a fairminter using React 19 Actions.
 */
export function FairminterForm({
  formAction,
  initialFormData,
  asset
}: FairminterFormProps): ReactElement {
  // Get everything from composer context
  const { activeAddress, activeWallet, showHelpText } = useComposer<FairminterOptions>();
  
  // Form status
  const { pending } = useFormStatus();
  
  // Local error state for block height inputs
  const [localError, setLocalError] = useState<{ message: string } | null>(null);
  const [isInitializing, setIsInitializing] = useState<boolean>(!!asset); // Loading state for initial asset
  
  // Form state
  const [startBlock, setStartBlock] = useState(initialFormData?.start_block?.toString() || "");
  const [endBlock, setEndBlock] = useState(initialFormData?.end_block?.toString() || "");
  const [softCapDeadlineBlock, setSoftCapDeadlineBlock] = useState(initialFormData?.soft_cap_deadline_block?.toString() || "");
  const [inscribeEnabled, setInscribeEnabled] = useState(false);
  const [description, setDescription] = useState(initialFormData?.description || "");
  const [assetName, setAssetName] = useState(initialFormData?.asset || asset || "");
  const [isAssetNameValid, setIsAssetNameValid] = useState(false);
  const [isDivisible, setIsDivisible] = useState(initialFormData?.divisible ?? true);
  
  // Check if active wallet uses SegWit addresses
  const isSegwit = activeWallet?.addressType && [
    AddressType.P2WPKH,
    AddressType.P2SH_P2WPKH,
    AddressType.P2TR
  ].includes(activeWallet.addressType);
  
  // Fetch asset details if asset is provided (existing asset)
  const { data: assetDetails } = useAssetDetails(asset || "");
  const isExistingAsset = !!asset && !!assetDetails;
  
  // Use asset's divisibility if it exists
  useEffect(() => {
    if (isExistingAsset && assetDetails?.assetInfo?.divisible !== undefined) {
      setIsDivisible(assetDetails.assetInfo.divisible);
      setIsInitializing(false); // Clear initializing state once asset details are loaded
    }
  }, [isExistingAsset, assetDetails]);

  // Mint method state
  const initialMintMethod = initialFormData?.burn_payment === false
    ? FAIRMINTER_MODELS.MINER_FEE_ONLY
    : initialFormData?.burn_payment
    ? FAIRMINTER_MODELS.XCP_FEE_BURNED
    : FAIRMINTER_MODELS.XCP_FEE_TO_ISSUER;
  const [selectedMintMethod, setSelectedMintMethod] = useState<FairminterModel>(initialMintMethod);
  
  // Helper function to get input step based on divisibility
  const getInputStep = () => isDivisible ? "0.00000001" : "1";
  const getInputPlaceholder = () => isDivisible ? "0.00000000" : "0";

  // Focus asset input on mount
  useEffect(() => {
    if (!isExistingAsset) {
      const input = document.querySelector("input[name='asset']") as HTMLInputElement;
      input?.focus();
    }
  }, [isExistingAsset]);

  // Handlers
  const enhancedFormAction = (formData: FormData) => {
    // Create a new FormData to avoid modifying the original
    const processedFormData = new FormData();
    
    // Copy all fields from the original formData
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
    
    // Handle inscription if enabled
    if (inscribeEnabled && description) {
      processedFormData.set('inscription', description);
      processedFormData.delete('description'); // Remove description field when inscribing
    }
    
    // Add asset name
    processedFormData.set('asset', assetName);
    
    // If a checkbox is not checked, it won't be included in the FormData
    // So we need to explicitly set these fields to false if they're not present
    const booleanFields = ['divisible', 'lock_description', 'lock_quantity'];
    booleanFields.forEach(field => {
      if (!processedFormData.has(field)) {
        processedFormData.set(field, 'false');
      }
    });
    
    // Add divisible value
    processedFormData.set('divisible', isDivisible.toString());
    
    // Call the original formAction with the processed FormData
    formAction(processedFormData);
  };

  return (
    <ComposeForm
      formAction={enhancedFormAction}
      header={
        <div className="space-y-4">
          {isExistingAsset && assetDetails?.assetInfo ? (
            <AssetHeader 
              assetInfo={{ 
                asset: asset || "",
                asset_longname: assetDetails.assetInfo.asset_longname || null,
                description: assetDetails.assetInfo.description,
                issuer: assetDetails.assetInfo.issuer,
                divisible: assetDetails.assetInfo.divisible ?? true,
                locked: assetDetails.assetInfo.locked ?? false,
                supply: assetDetails.assetInfo.supply
              }}
              className="mt-1 mb-5" 
            />
          ) : activeAddress && !isInitializing ? (
            <AddressHeader
              address={activeAddress.address}
              walletName={activeWallet?.name ?? ""}
              className="mt-1 mb-5"
            />
          ) : null}
        </div>
      }
      submitText="Continue"
      submitDisabled={pending || (!isExistingAsset && !isAssetNameValid)}
    >
          {localError && (
            <div className="mb-4">
              <ErrorAlert
                message={localError.message}
                onClose={() => setLocalError(null)}
              />
            </div>
          )}
          <Field>
            <Label htmlFor="mintMethod" className="block text-sm font-medium text-gray-700">
              Mint Method <span className="text-red-500">*</span>
            </Label>
            <div className="mt-1">
              <Listbox value={FAIRMINTER_MODEL_OPTIONS.find(option => option.value === selectedMintMethod)} onChange={(option) => setSelectedMintMethod(option.value)} disabled={pending}>
                <ListboxButton
                  className="w-full p-2 text-left rounded-md border border-gray-300 bg-gray-50 focus:border-blue-500 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
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
            {showHelpText && (
              <Description className="mt-2 text-sm text-gray-500">
                Select the mint method for your fairminter.
              </Description>
            )}
          </Field>
          
          {!isInitializing && !isExistingAsset && (
            <AssetNameInput
              value={assetName}
              onChange={setAssetName}
              onValidationChange={setIsAssetNameValid}
              label="Asset Name"
              disabled={pending}
              showHelpText={showHelpText}
              required
            />
          )}
          
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
                step={getInputStep()}
                placeholder={getInputPlaceholder()}
                className="mt-1 block w-full p-2 rounded-md border border-gray-300 bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                required
                disabled={pending}
              />
              {showHelpText && (
                <Description className="mt-2 text-sm text-gray-500">
                  Maximum amount that can be minted in a single transaction.
                </Description>
              )}
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
                  step={getInputStep()}
                  placeholder={getInputPlaceholder()}
                  className="mt-1 block w-full p-2 rounded-md border border-gray-300 bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  disabled={pending}
                />
                {showHelpText && (
                  <Description className="mt-2 text-sm text-gray-500">
                    The quantity of asset minted per price unit.
                  </Description>
                )}
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
                {showHelpText && (
                  <Description className="mt-2 text-sm text-gray-500">
                    The price in XCP per unit of the asset.
                  </Description>
                )}
              </Field>
            </>
          )}
          
          {!isInitializing && !isExistingAsset && (
            <CheckboxInput
              name="divisible"
              label="Divisible"
              checked={isDivisible}
              onChange={setIsDivisible}
              disabled={pending}
            />
          )}
          <Field>
            <Label htmlFor="description" className="block text-sm font-medium text-gray-700">
              Description
            </Label>
            <Textarea
              id="description"
              name="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1 block w-full p-2 rounded-md border border-gray-300 bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              rows={2}
              disabled={pending}
            />
            {showHelpText && (
              <Description className="mt-2 text-sm text-gray-500">
                A textual description for the asset.{inscribeEnabled ? " This will be inscribed on-chain." : ""}
              </Description>
            )}
          </Field>
          
          {isSegwit && (
            <SettingSwitch
              label="Inscribe?"
              description="Store description as a Taproot inscription (on-chain)"
              checked={inscribeEnabled}
              onChange={setInscribeEnabled}
              showHelpText={showHelpText}
              disabled={pending}
            />
          )}
          
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
              step={getInputStep()}
              placeholder={getInputPlaceholder()}
              className="mt-1 block w-full p-2 rounded-md border border-gray-300 bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              disabled={pending}
            />
            {showHelpText && (
              <Description className="mt-2 text-sm text-gray-500">
                Maximum total supply that can be minted.
              </Description>
            )}
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
                    setError={(message) => message ? setLocalError({ message }) : setLocalError(null)}
                    shouldShowHelpText={showHelpText}
                    description="The block at which the sale starts."
                    disabled={pending}
                  />
                  <BlockHeightInput
                    name="end_block"
                    label="End Block"
                    value={endBlock}
                    onChange={setEndBlock}
                    setError={(message) => message ? setLocalError({ message }) : setLocalError(null)}
                    shouldShowHelpText={showHelpText}
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
                      step={getInputStep()}
                      placeholder={getInputPlaceholder()}
                      className="mt-1 block w-full p-2 rounded-md border border-gray-300 bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      disabled={pending}
                    />
                    {showHelpText && (
                      <Description className="mt-2 text-sm text-gray-500">
                        Amount of asset to mint when the sale starts.
                      </Description>
                    )}
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
                    {showHelpText && (
                      <Description className="mt-2 text-sm text-gray-500">
                        Commission (fraction between 0 and less than 1) to be paid.
                      </Description>
                    )}
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
                        {showHelpText && (
                          <Description className="mt-2 text-sm text-gray-500">
                            Minimum amount required for the sale to succeed.
                          </Description>
                        )}
                      </Field>
                      <BlockHeightInput
                        name="soft_cap_deadline_block"
                        label="Soft Cap Deadline Block"
                        value={softCapDeadlineBlock}
                        onChange={setSoftCapDeadlineBlock}
                        setError={(message) => message ? setLocalError({ message }) : setLocalError(null)}
                        shouldShowHelpText={showHelpText}
                        description="The block by which the soft cap must be reached."
                        disabled={pending}
                      />
                    </>
                  )}
                </DisclosurePanel>
              </>
            )}
          </Disclosure>
    </ComposeForm>
  );
}