"use client";

import React, { useState, useRef, useEffect, useCallback, startTransition } from "react";
import { Field, Label, Description, Input } from "@headlessui/react";
import { Button } from "@/components/button";
import { ErrorAlert } from "@/components/error-alert";
import { AddressHeader } from "@/components/headers/address-header";
import { FeeRateInput } from "@/components/inputs/fee-rate-input";
import { FairminterSelectInput, type Fairminter } from "@/components/inputs/fairminter-select-input";
import { useSettings } from "@/contexts/settings-context";
import { useWallet } from "@/contexts/wallet-context";
import { useAssetDetails } from "@/hooks/useAssetDetails";
import { formatAmount } from "@/utils/format";
import { FairmintOptions } from "@/utils/blockchain/counterparty";

interface FairmintFormDataInternal {
  asset: string;
  quantity: string;
  sat_per_vbyte: number;
}

interface FairmintFormProps {
  formAction: (formData: FormData) => void;
  initialFormData?: FairmintOptions | null;
  initialAsset?: string;
  error?: string | null;
  showHelpText?: boolean;
}

export function FairmintForm({ 
  formAction, 
  initialFormData, 
  initialAsset = "",
  error: composerError,
  showHelpText = false
}: FairmintFormProps) {
  // Context hooks
  const { activeAddress, activeWallet } = useWallet();
  const { settings } = useSettings();
  const shouldShowHelpText = showHelpText ?? settings?.showHelpText ?? false;
  
  // Form state
  const [formData, setFormData] = useState<FairmintFormDataInternal>(() => {
    // Don't use BTC or XCP as the initial asset
    const initialAssetValue = initialFormData?.asset || initialAsset;
    const isSpecialAsset = initialAssetValue === "BTC" || initialAssetValue === "XCP";
    
    return {
      asset: isSpecialAsset ? "" : initialAssetValue,
      quantity: initialFormData?.quantity ? initialFormData.quantity.toString() : "",
      sat_per_vbyte: initialFormData?.sat_per_vbyte || 0.1,
    };
  });
  const [selectedFairminter, setSelectedFairminter] = useState<Fairminter | undefined>(undefined);
  const [pending, setPending] = useState(false);
  
  // Error state management
  const [error, setError] = useState<{ message: string } | null>(null);
  
  // Data fetching hooks
  const { error: assetError, data: assetDetails } = useAssetDetails(
    formData.asset || "", // Pass empty string if no asset selected
    {
      // These callbacks run in the useAssetDetails hook
      onLoadStart: () => {
        if (!formData.asset || !activeAddress?.address) {
          return false; // Return false to skip fetching
        }
        return true; // Proceed with fetching
      },
      onLoadEnd: () => {
        // Handle any post-load logic if needed
      }
    }
  );
  
  // Refs
  const inputRef = useRef<HTMLInputElement>(null);
  
  // Computed values
  const isFreeMint = selectedFairminter ? parseFloat(selectedFairminter.price_normalized) === 0 : false;
  
  // Effects - composer error first
  useEffect(() => {
    if (composerError) {
      setError({ message: composerError });
    }
  }, [composerError]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Handlers
  const handleFairminterChange = useCallback((asset: string, fairminter?: Fairminter) => {
    setFormData(prev => ({ ...prev, asset }));
    setSelectedFairminter(fairminter);
  }, []);

  const handleFeeRateChange = useCallback((satPerVbyte: number) => {
    setFormData(prev => ({ ...prev, sat_per_vbyte: satPerVbyte }));
  }, []);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    if (!formData.asset) {
      setError({ message: "Please select a fairminter asset." });
      return;
    }
    if (formData.asset === "BTC" || formData.asset === "XCP") {
      setError({ message: "BTC and XCP cannot be used for fairmint operations. Please select a different asset." });
      return;
    }
    
    // Only validate quantity for paid mints
    if (!isFreeMint) {
      if (!formData.quantity || Number(formData.quantity) <= 0) {
        setError({ message: "Please enter a valid quantity greater than zero." });
        return;
      }
      
      // Check if quantity is a multiple of quantity_by_price (lot size)
      if (selectedFairminter) {
        const quantityByPrice = parseFloat(selectedFairminter.quantity_by_price_normalized);
        const enteredQuantity = Number(formData.quantity);
        if (quantityByPrice > 0 && enteredQuantity % quantityByPrice !== 0) {
          setError({ message: `Quantity must be a multiple of ${quantityByPrice} (lot size)` });
          return;
        }
      }
    }
    
    if (formData.sat_per_vbyte <= 0) {
      setError({ message: "Fee rate must be greater than zero." });
      return;
    }
    setError(null);
    setPending(true);

    const isDivisible = assetDetails?.assetInfo?.divisible ?? selectedFairminter?.divisible ?? true;
    
    // For free mints, quantity is 0; for paid mints, use the entered quantity
    const quantityToSubmit = isFreeMint ? "0" : formData.quantity;

    // Create FormData object with the calculated values
    const formDataToSubmit = new FormData();
    formDataToSubmit.append("sourceAddress", activeAddress?.address || "");
    formDataToSubmit.append("asset", formData.asset);
    formDataToSubmit.append("quantity", quantityToSubmit);
    formDataToSubmit.append("sat_per_vbyte", formData.sat_per_vbyte.toString());
    
    try {
      startTransition(() => {
        formAction(formDataToSubmit);
      });
    } catch (error) {
      setError({ message: error instanceof Error ? error.message : "An error occurred" });
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Show the active address information */}
      {activeAddress && (
        <AddressHeader 
          address={activeAddress.address} 
          walletName={activeWallet?.name}
          className="mb-4" 
        />
      )}

      {/* Display error message if any */}
      {formData.asset && assetError && (
        <div className="text-red-500 mb-4">{assetError.message}</div>
      )}

      <div className="bg-white rounded-lg shadow-lg p-4">
        {error && (
          <ErrorAlert
            message={error.message}
            onClose={() => setError(null)}
          />
        )}
        <form onSubmit={handleSubmit} className="space-y-6">
          <FairminterSelectInput
            selectedAsset={formData.asset}
            onChange={handleFairminterChange}
            label="Fairminter Asset"
            required
            shouldShowHelpText={shouldShowHelpText}
            description="Select an available fairminter asset with 'open' status"
          />

          {/* Show info message for free mints */}
          {formData.asset && isFreeMint && selectedFairminter && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-sm text-blue-800">
                <strong>Free Mint</strong> - You'll receive{" "}
                {selectedFairminter.max_mint_per_tx_normalized || "the maximum allowed"} {formData.asset} tokens.
                Only BTC transaction fees apply.
              </p>
            </div>
          )}

          {/* Show quantity field only for paid mints */}
          {formData.asset && !isFreeMint && (
            <Field>
              <Label className="text-sm font-medium text-gray-700">
                Quantity <span className="text-red-500">*</span>
              </Label>
              <Input
                ref={inputRef}
                type="text"
                name="quantity"
                value={formData.quantity}
                onChange={(e) => setFormData({ ...formData, quantity: e.target.value.trim() })}
                required
                placeholder={selectedFairminter?.divisible ? "0.00000000" : "0"}
                className="mt-1 block w-full p-2 rounded-md border border-gray-300 bg-gray-50 focus:ring-blue-500 focus:border-blue-500"
              />
              <Description className={shouldShowHelpText ? "mt-2 text-sm text-gray-500" : "hidden"}>
                Enter the quantity to mint {selectedFairminter?.divisible ? "(up to 8 decimal places)" : "(whole numbers only)"}.
                {selectedFairminter && parseFloat(selectedFairminter.quantity_by_price_normalized) > 1 && (
                  <span className="block mt-1">
                    Quantity must be a multiple of {selectedFairminter.quantity_by_price_normalized} (lot size).
                  </span>
                )}
                {selectedFairminter && (
                  <span className="block mt-1">
                    Price: {selectedFairminter.price_normalized} XCP per {selectedFairminter.quantity_by_price_normalized} {formData.asset}
                  </span>
                )}
              </Description>
            </Field>
          )}

          <FeeRateInput 
            showHelpText={shouldShowHelpText} 
            disabled={pending}
            onFeeRateChange={handleFeeRateChange}
          />
          
          <Button type="submit" color="blue" fullWidth>
            Continue
          </Button>
        </form>
      </div>
    </div>
  );
}
