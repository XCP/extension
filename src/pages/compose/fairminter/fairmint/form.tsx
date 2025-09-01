import React, { useState, useRef, useEffect, useCallback, Suspense, startTransition } from "react";
import { Field, Label, Description, Input } from "@headlessui/react";
import { Button } from "@/components/button";
import { ErrorAlert } from "@/components/error-alert";
import { BalanceHeader } from "@/components/headers/balance-header";
import { FeeRateInput } from "@/components/inputs/fee-rate-input";
import { FairminterSelectInput, type Fairminter } from "@/components/inputs/fairminter-select-input";
import { AmountWithMaxInput } from "@/components/inputs/amount-with-max-input";
import { useSettings } from "@/contexts/settings-context";
import { useWallet } from "@/contexts/wallet-context";
import { useAssetDetails } from "@/hooks/useAssetDetails";
import { formatAmount } from "@/utils/format";
import { toBigNumber, multiply, divide, roundDownToMultiple, toSatoshis } from "@/utils/numeric";
import { FairmintOptions, type TokenBalance } from "@/utils/blockchain/counterparty";

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
  // Determine if we're minting with BTC or XCP based on the route
  const currencyType = initialAsset === "BTC" ? "BTC" : initialAsset === "XCP" ? "XCP" : "";
  const { activeAddress, activeWallet } = useWallet();
  const [currencyBalance, setCurrencyBalance] = useState<string>("0");
  const { settings } = useSettings();
  const shouldShowHelpText = showHelpText ?? settings?.showHelpText ?? false;
  const [selectedFairminter, setSelectedFairminter] = useState<Fairminter | undefined>(undefined);
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
  
  // Fetch details for the currency type (BTC or XCP) for the balance header
  const { data: currencyDetails } = useAssetDetails(
    currencyType,
    {
      onLoadStart: () => {
        if (!currencyType || !activeAddress?.address) {
          return false;
        }
        return true;
      },
      onLoadEnd: () => {}
    }
  );

  // Only fetch asset details when an asset is selected
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

  // Update currency balance when details are loaded
  useEffect(() => {
    if (currencyDetails) {
      setCurrencyBalance(currencyDetails.availableBalance || "0");
    }
  }, [currencyDetails]);
  
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<{ message: string } | null>(null);
  
  // Set composer error when it occurs
  useEffect(() => {
    if (composerError) {
      setError({ message: composerError });
    }
  }, [composerError]);

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Determine if this is a free mint (price = 0)
  const isFreeMint = selectedFairminter ? parseFloat(selectedFairminter.price_normalized) === 0 : false;
  
  // Calculate max mintable quantity based on balance and fairminter settings
  const calculateMaxQuantity = useCallback(() => {
    if (!selectedFairminter || isFreeMint) return "0";
    
    const price = toBigNumber(selectedFairminter.price_normalized);
    const lotSize = toBigNumber(selectedFairminter.quantity_by_price_normalized);
    const balance = toBigNumber(currencyBalance);
    
    if (price.isLessThanOrEqualTo(0) || balance.isLessThanOrEqualTo(0) || lotSize.isLessThanOrEqualTo(0)) return "0";
    
    // Calculate how many lots we can afford
    const maxLots = divide(balance, price).integerValue();
    let maxQuantity = multiply(maxLots, lotSize);
    
    // Check if there's a max_mint_per_tx limit
    if (selectedFairminter.max_mint_per_tx_normalized) {
      const maxPerTx = toBigNumber(selectedFairminter.max_mint_per_tx_normalized);
      if (maxQuantity.isGreaterThan(maxPerTx)) {
        // Ensure maxPerTx is also a multiple of lot size
        maxQuantity = roundDownToMultiple(maxPerTx, lotSize);
      }
    }
    
    return formatAmount({
      value: maxQuantity.toNumber(),
      maximumFractionDigits: selectedFairminter.divisible ? 8 : 0,
      minimumFractionDigits: 0
    });
  }, [selectedFairminter, isFreeMint, currencyBalance]);

  // Stable callback for handling fairminter selection
  const handleFairminterChange = useCallback((asset: string, fairminter?: Fairminter) => {
    setFormData(prev => ({ ...prev, asset }));
    setSelectedFairminter(fairminter);
  }, []);

  // Stable callback for handling fee rate changes
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
        const lotSize = toBigNumber(selectedFairminter.quantity_by_price_normalized);
        const enteredQuantity = toBigNumber(formData.quantity);
        
        if (lotSize.isGreaterThan(0)) {
          // Check if entered quantity is a multiple of lot size
          const remainder = enteredQuantity.modulo(lotSize);
          
          if (!remainder.isZero()) {
            setError({ message: `Amount must be a multiple of ${selectedFairminter.quantity_by_price_normalized} (lot size)` });
            return;
          }
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
      {/* Show the balance header for BTC or XCP */}
      {currencyType && currencyDetails ? (
        <BalanceHeader 
          balance={{
            asset: currencyType,
            quantity_normalized: currencyDetails.availableBalance || "0",
            asset_info: currencyDetails.assetInfo || undefined,
          }}
          className="mt-1 mb-5" 
        />
      ) : null}

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
            description={`Select an available fairminter asset${currencyType ? ` that uses ${currencyType}` : ""}`}
            currencyFilter={currencyType}
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

          {/* Show amount field only for paid mints */}
          {formData.asset && !isFreeMint && selectedFairminter && (
            <AmountWithMaxInput
              asset={formData.asset}
              availableBalance={currencyBalance}
              value={formData.quantity}
              onChange={(value) => setFormData({ ...formData, quantity: value })}
              sat_per_vbyte={formData.sat_per_vbyte}
              setError={(msg) => setError(msg ? { message: msg } : null)}
              shouldShowHelpText={shouldShowHelpText}
              sourceAddress={activeAddress}
              maxAmount={calculateMaxQuantity()}
              label="Amount"
              name="amount"
              description={`Enter the amount to mint${selectedFairminter?.divisible ? " (up to 8 decimal places)" : " (whole numbers only)"}. ${selectedFairminter && parseFloat(selectedFairminter.quantity_by_price_normalized) > 1 ? `Amount must be a multiple of ${selectedFairminter.quantity_by_price_normalized} (lot size). ` : ""}${selectedFairminter ? `Price: ${selectedFairminter.price_normalized} XCP per ${selectedFairminter.quantity_by_price_normalized} ${formData.asset}` : ""}`}
              disableMaxButton={false}
              onMaxClick={() => {
                const maxQty = calculateMaxQuantity();
                setFormData(prev => ({ ...prev, quantity: maxQty }));
              }}
              hasError={!!error}
            />
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
