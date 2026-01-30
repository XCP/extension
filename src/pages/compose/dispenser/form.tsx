import { useEffect, useState, useRef, memo, useCallback } from "react";
import { useFormStatus } from "react-dom";
import { Field, Label, Description, Input } from "@headlessui/react";
import { ComposerForm } from "@/components/composer/composer-form";
import { BalanceHeader } from "@/components/ui/headers/balance-header";
import { AmountWithMaxInput } from "@/components/ui/inputs/amount-with-max-input";
import { PriceWithSuggestInput } from "@/components/ui/inputs/price-with-suggest-input";
import { useComposer } from "@/contexts/composer-context";
import { useAssetDetails } from "@/hooks/useAssetDetails";
import { useTradingPair } from "@/hooks/useTradingPair";
import type { DispenserOptions } from "@/utils/blockchain/counterparty/compose";
import type { ReactElement } from "react";

/**
 * Props for the DispenserForm component, aligned with Composer's formAction.
 */
interface DispenserFormProps {
  formAction: (formData: FormData) => void;
  initialFormData: DispenserOptions | null;
  asset: string;
}

/**
 * Form for creating a dispenser using React 19 Actions.
 * Wrapped with memo to prevent unnecessary re-renders.
 */
export const DispenserForm = memo(function DispenserForm({ 
  formAction, 
  initialFormData, 
  asset
}: DispenserFormProps): ReactElement {
  // Context hooks
  const { activeAddress, showHelpText, state, feeRate } = useComposer();
  
  // Data fetching hooks
  const { error: assetError, data: assetDetails } = useAssetDetails(asset);
  
  // Form status
  const { pending } = useFormStatus();
  
  // Error state management
  const [error, setError] = useState<{ message: string } | null>(null);

  // Form state
  const [escrowQuantity, setEscrowQuantity] = useState<string>(
    initialFormData?.escrow_quantity?.toString() || ""
  );
  const [mainchainRate, setMainchainRate] = useState<string>(
    initialFormData?.mainchainrate?.toString() || ""
  );
  const [giveQuantity, setGiveQuantity] = useState<string>(
    initialFormData?.give_quantity?.toString() || 
    ((assetDetails?.assetInfo?.divisible ?? true) ? "1.00000000" : "1")
  );
  
  // Asset state
  const [availableBalance, setAvailableBalance] = useState<string>("0");

  // Trading pair data from hook
  const { data: tradingPairData } = useTradingPair(asset, 'BTC');

  // Computed values
  const isDivisible = assetDetails?.assetInfo?.divisible ?? true;

  // Effects - composer error first
  useEffect(() => {
    if (state.error) {
      setError({ message: state.error });
    }
  }, [state.error]);

  // Asset error effect
  useEffect(() => {
    if (assetError) {
      setError({ message: assetError.message || "Failed to load asset details" });
    }
  }, [assetError]);
  
  // Check if trying to create dispenser for BTC
  useEffect(() => {
    if (asset === "BTC") {
      setError({ message: "Cannot create a dispenser for BTC" });
    }
  }, [asset]);

  // Update available balance when asset details load
  useEffect(() => {
    if (assetDetails?.availableBalance) {
      setAvailableBalance(assetDetails.availableBalance);
    }
  }, [assetDetails?.availableBalance]);


  // Reset form fields when initialFormData changes to null
  const prevInitialFormDataRef = useRef(initialFormData);
  useEffect(() => {
    // Only reset if initialFormData changed from non-null to null
    if (initialFormData === null && prevInitialFormDataRef.current !== null) {
      setEscrowQuantity("");
      setMainchainRate("");
      setGiveQuantity((assetDetails?.assetInfo?.divisible ?? true) ? "1.00000000" : "1");
    } else if (initialFormData !== null && prevInitialFormDataRef.current !== initialFormData) {
      // Update form values when initialFormData changes (e.g., after error)
      setEscrowQuantity(initialFormData.escrow_quantity?.toString() || "");
      setMainchainRate(initialFormData.mainchainrate?.toString() || "");
      setGiveQuantity(initialFormData.give_quantity?.toString() || "");
    }
    prevInitialFormDataRef.current = initialFormData;
  }, [initialFormData, assetDetails?.assetInfo?.divisible]);

  // Handlers

  const handleFormAction = useCallback((formData: FormData) => {
    // Validate before submission
    if (asset === "BTC") {
      setError({ message: "Cannot create a dispenser for BTC" });
      return;
    }
    
    const cleanEscrow = parseFloat(escrowQuantity || "0");
    const cleanGive = parseFloat(giveQuantity || "0");
    
    if (!isNaN(cleanEscrow) && !isNaN(cleanGive) && cleanEscrow < cleanGive) {
      setError({ message: "Escrow quantity must be greater than or equal to give quantity" });
      return;
    }
    
    // Create a new FormData object to avoid modifying the original
    const processedFormData = new FormData();
    
    // Copy all fields from the original FormData
    for (const [key, value] of formData.entries()) {
      if (key !== "escrow_quantity" && key !== "mainchainrate" && key !== "give_quantity") {
        processedFormData.append(key, value);
      }
    }
    
    // Add the asset parameter
    processedFormData.append("asset", asset);

    processedFormData.append("escrow_quantity", escrowQuantity);
    processedFormData.append("mainchainrate", mainchainRate);
    processedFormData.append("give_quantity", giveQuantity);
    
    // Call the original formAction with the processed data
    formAction(processedFormData);
  }, [asset, escrowQuantity, mainchainRate, giveQuantity, formAction]);

  // Validation for submit button - ensure all required fields have values
  const isFormValid = escrowQuantity.trim() !== "" &&
                      mainchainRate.trim() !== "" &&
                      giveQuantity.trim() !== "";

  return (
    <ComposerForm
      formAction={handleFormAction}
      submitDisabled={!isFormValid || !!error}
      header={
        asset && activeAddress && assetDetails ? (
          <BalanceHeader
            balance={{
              asset: asset,
              quantity_normalized: availableBalance,
              asset_info: assetDetails.assetInfo ? {
                asset_longname: assetDetails.assetInfo.asset_longname,
                description: assetDetails.assetInfo.description || '',
                issuer: assetDetails.assetInfo.issuer || 'Unknown',
                divisible: assetDetails.assetInfo.divisible,
                locked: assetDetails.assetInfo.locked,
                supply: assetDetails.assetInfo.supply,
              } : {
                asset_longname: null,
                description: "",
                issuer: "",
                divisible: false,
                locked: false,
                supply: "0",
              },
            }}
            className="mt-1 mb-5"
          />
        ) : null
      }
    >
          <AmountWithMaxInput
            asset={asset}
            availableBalance={availableBalance}
            value={escrowQuantity}
            onChange={setEscrowQuantity}
            feeRate={feeRate}
            setError={() => {}} // No-op since Composer handles errors
            showHelpText={showHelpText}
            sourceAddress={activeAddress}
            maxAmount={availableBalance}
            label="Escrow Amount"
            name="escrow_quantity_display"
            description={`Total amount to lock in the dispenser. ${
              isDivisible ? "Enter up to 8 decimal places." : "Enter whole numbers only."
            } Available: ${availableBalance}`}
            disabled={pending}
            autoFocus
            isDivisible={isDivisible}
          />
          <PriceWithSuggestInput
            value={mainchainRate}
            onChange={setMainchainRate}
            tradingPairData={tradingPairData}
            showHelpText={showHelpText}
            label="Price in Bitcoin"
            name="mainchainrate_display"
            priceDescription="BTC required to trigger one dispense."
            showPairFlip={false}
          />
          {/* Hidden field to indicate mainchainrate is always in BTC for normalization */}
          <input type="hidden" name="mainchainrate_asset" value="BTC" />
          <Field>
            <Label htmlFor="give_quantity_display" className="text-sm font-medium text-gray-700">
              Amount per Dispense <span className="text-red-500">*</span>
            </Label>
            <Input
              id="give_quantity_display"
              type="text"
              name="give_quantity_display"
              value={giveQuantity}
              onChange={(e) => setGiveQuantity(e.target.value)}
              className="mt-1 block w-full p-2.5 rounded-md border border-gray-300 bg-gray-50 outline-none focus:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500"
              required
              placeholder={isDivisible ? "0.00000000" : "0"}
              disabled={pending}
              inputMode="decimal"
            />
            {showHelpText && (
              <Description className="mt-2 text-sm text-gray-500">
                The quantity of the asset to dispense per transaction.
                {isDivisible ? " Enter up to 8 decimal places." : " Enter whole numbers only."}
              </Description>
            )}
          </Field>
          
    </ComposerForm>
  );
});
