"use client";

import axios from "axios";
import { useEffect, useState, useRef, memo, useCallback } from "react";
import { useFormStatus } from "react-dom";
import { Field, Label, Description, Input } from "@headlessui/react";
import { Button } from "@/components/button";
import { BalanceHeader } from "@/components/headers/balance-header";
import { AmountWithMaxInput } from "@/components/inputs/amount-with-max-input";
import { FeeRateInput } from "@/components/inputs/fee-rate-input";
import { PriceWithSuggestInput } from "@/components/inputs/price-with-suggest-input";
import { useSettings } from "@/contexts/settings-context";
import { useWallet } from "@/contexts/wallet-context";
import { useAssetDetails } from "@/hooks/useAssetDetails";
import { formatAmount } from "@/utils/format";
import { toSatoshis } from "@/utils/numeric";
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
  const { activeAddress, activeWallet } = useWallet();
  const { settings } = useSettings();
  const shouldShowHelpText = settings?.showHelpText ?? false;
  const { error: assetError, data: assetDetails } = useAssetDetails(asset);
  const { pending } = useFormStatus();

  const [availableBalance, setAvailableBalance] = useState<string>("0");
  const [tradingPairData, setTradingPairData] = useState<TradingPairData | null>(null);
  
  // Add state for form values
  const [escrowQuantity, setEscrowQuantity] = useState<string>(
    initialFormData?.escrow_quantity
      ? (assetDetails?.assetInfo?.divisible ?? true)
        ? formatAmount({
            value: initialFormData.escrow_quantity / 1e8,
            maximumFractionDigits: 8,
            minimumFractionDigits: 8
          })
        : initialFormData.escrow_quantity.toString()
      : ""
  );
  
  const [mainchainRate, setMainchainRate] = useState<string>(
    initialFormData?.mainchainrate
      ? formatAmount({
          value: initialFormData.mainchainrate / 1e8,
          maximumFractionDigits: 8,
          minimumFractionDigits: 8
        })
      : ""
  );
  
  const [giveQuantity, setGiveQuantity] = useState<string>(
    initialFormData?.give_quantity
      ? (assetDetails?.assetInfo?.divisible ?? true)
        ? formatAmount({
            value: initialFormData.give_quantity / 1e8,
            maximumFractionDigits: 8,
            minimumFractionDigits: 8
          })
        : initialFormData.give_quantity.toString()
      : (assetDetails?.assetInfo?.divisible ?? true) ? "1.00000000" : "1"
  );

  const isDivisible = assetDetails?.assetInfo?.divisible ?? true;

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
  // Using a ref to track previous initialFormData state to prevent unnecessary resets
  const prevInitialFormDataRef = useRef(initialFormData);
  useEffect(() => {
    // Only reset if initialFormData changed from non-null to null
    if (initialFormData === null && prevInitialFormDataRef.current !== null) {
      setEscrowQuantity("");
      setMainchainRate("");
      setGiveQuantity((assetDetails?.assetInfo?.divisible ?? true) ? "1.00000000" : "1");
    }
    prevInitialFormDataRef.current = initialFormData;
  }, [initialFormData, assetDetails?.assetInfo?.divisible]);

  // Convert decimal values to integers for API submission
  const getFormattedValue = (value: string, isValueDivisible: boolean): string => {
    if (!value) return "";
    
    if (isValueDivisible) {
      // For divisible assets, convert to satoshis (multiply by 10^8)
      return toSatoshis(value);
    }
    
    // For non-divisible assets, use as is
    return value;
  };

  // Custom form action wrapper to convert values before submission
  const handleFormAction = useCallback((formData: FormData) => {
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
    
    // Add the converted values
    processedFormData.append("escrow_quantity", getFormattedValue(escrowQuantity, isDivisible));
    processedFormData.append("mainchainrate", getFormattedValue(mainchainRate, true)); // BTC is always divisible
    processedFormData.append("give_quantity", getFormattedValue(giveQuantity, isDivisible));
    
    // Call the original formAction with the processed data
    formAction(processedFormData);
  }, [asset, escrowQuantity, mainchainRate, giveQuantity, isDivisible, formAction]);

  return (
    <div className="space-y-4">
      {asset && activeAddress && assetDetails && (
        <BalanceHeader
          balance={{
            asset,
            quantity_normalized: availableBalance,
            asset_info: assetDetails.assetInfo || {
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
      )}
      {assetError && <div className="text-red-500 mb-2">{assetError.message}</div>}
      <div className="bg-white rounded-lg shadow-lg p-4">
        <form action={handleFormAction} className="space-y-6">
          <AmountWithMaxInput
            asset={asset}
            availableBalance={availableBalance}
            value={escrowQuantity}
            onChange={setEscrowQuantity}
            sat_per_vbyte={initialFormData?.sat_per_vbyte || 1}
            setError={() => {}} // No-op since Composer handles errors
            shouldShowHelpText={shouldShowHelpText}
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
            shouldShowHelpText={shouldShowHelpText}
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
              className="mt-1 block w-full p-2 rounded-md border bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              required
              placeholder={isDivisible ? "0.00000000" : "0"}
              disabled={pending}
            />
            <Description className={shouldShowHelpText ? "mt-2 text-sm text-gray-500" : "hidden"}>
              The quantity of the asset to dispense per transaction.
              {isDivisible ? " Enter up to 8 decimal places." : " Enter whole numbers only."}
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
});
