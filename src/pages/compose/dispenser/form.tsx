"use client";

import { useEffect, useState, useRef, memo, useCallback } from "react";
import { useFormStatus } from "react-dom";
import axios from "axios";
import { Field, Label, Description, Input } from "@headlessui/react";
import { ComposeForm } from "@/components/compose-form";
import { BalanceHeader } from "@/components/headers/balance-header";
import { AmountWithMaxInput } from "@/components/inputs/amount-with-max-input";
import { PriceWithSuggestInput } from "@/components/inputs/price-with-suggest-input";
import { useComposer } from "@/contexts/composer-context";
import { useAssetDetails } from "@/hooks/useAssetDetails";
import type { DispenserOptions } from "@/utils/blockchain/counterparty";
import type { ReactElement } from "react";

interface TradingPairData {
  last_trade_price: string | null;
  name: string;
}

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
  const { activeAddress, activeWallet, settings, showHelpText, state } = useComposer();
  
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
  const [tradingPairData, setTradingPairData] = useState<TradingPairData | null>(null);
  
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

  // Fetch asset details and trading pair data
  useEffect(() => {
    const fetchDetails = async () => {
      if (!asset || !activeAddress?.address) return;
      try {
        if (assetDetails?.availableBalance) {
          setAvailableBalance(assetDetails.availableBalance);
        }

        const response = await axios.get(`https://app.xcp.io/api/v1/swap/${asset}/BTC`);
        const lastTradePrice = response.data?.data?.trading_pair?.last_trade_price || null;
        setTradingPairData((prev) => {
          // Only update if the data has changed
          if (prev?.last_trade_price === lastTradePrice && prev?.name === "BTC") {
            return prev;
          }
          return { last_trade_price: lastTradePrice, name: "BTC" };
        });
      } catch (err) {
        console.error("Error fetching asset details:", err);
      }
    };
    fetchDetails();
  }, [asset, activeAddress?.address, assetDetails]);

  // Focus escrow_quantity input on mount
  useEffect(() => {
    const input = document.querySelector("input[name='escrow_quantity_display']") as HTMLInputElement;
    input?.focus();
  }, []);

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

  return (
    <ComposeForm
      formAction={handleFormAction}
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
            sat_per_vbyte={initialFormData?.sat_per_vbyte || 0.1}
            setError={() => {}} // No-op since Composer handles errors
            shouldShowHelpText={showHelpText}
            sourceAddress={activeAddress}
            maxAmount={availableBalance}
            label="Dispenser Escrow"
            name="escrow_quantity_display"
            description={`The total quantity of the asset to reserve for this dispenser. ${
              isDivisible ? "Enter up to 8 decimal places." : "Enter whole numbers only."
            } Available: ${availableBalance}`}
            disabled={pending}
          />
          <PriceWithSuggestInput
            value={mainchainRate}
            onChange={setMainchainRate}
            tradingPairData={tradingPairData}
            shouldShowHelpText={showHelpText}
            label="BTC Per Dispense"
            name="mainchainrate_display"
            priceDescription="The amount of BTC required per dispensed portion."
            showPairFlip={false}
          />
          <Field>
            <Label htmlFor="give_quantity_display" className="text-sm font-medium text-gray-700">
              Dispense Amount <span className="text-red-500">*</span>
            </Label>
            <Input
              id="give_quantity_display"
              type="text"
              name="give_quantity_display"
              value={giveQuantity}
              onChange={(e) => setGiveQuantity(e.target.value)}
              className="mt-1 block w-full p-2 rounded-md border border-gray-300 bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              required
              placeholder={isDivisible ? "0.00000000" : "0"}
              disabled={pending}
            />
            {showHelpText && (
              <Description className="mt-2 text-sm text-gray-500">
                The quantity of the asset to dispense per transaction.
                {isDivisible ? " Enter up to 8 decimal places." : " Enter whole numbers only."}
              </Description>
            )}
          </Field>
          
    </ComposeForm>
  );
});
