"use client";

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { Field, Label, Description, Input } from "@headlessui/react";
import { AssetSelectInput } from "@/components/inputs/asset-select-input";
import { AmountWithMaxInput } from "@/components/inputs/amount-with-max-input";
import { FeeRateInput } from "@/components/inputs/fee-rate-input";
import { Button } from "@/components/button";
import { useSettings } from "@/contexts/settings-context";
import { useWallet } from "@/contexts/wallet-context";
import { ErrorAlert } from "@/components/error-alert";
import { Spinner } from "@/components/spinner";
import { useAssetDetails } from "@/hooks/useAssetDetails";
import { formatAmount } from "@/utils/format";
import { toBigNumber } from "@/utils/numeric";
import { fetchTokenBalance } from "@/utils/blockchain/counterparty/api";
import { AssetHeader } from "@/components/headers/asset-header";
import type { ReactElement } from "react";

export interface DividendFormData {
  quantity_per_unit: string;
  dividend_asset: string;
  sat_per_vbyte: number;
  asset?: string;
}

interface DividendFormProps {
  formAction: (formData: FormData) => void;
  asset: string;
  initialFormData: any;
  showHelpText?: boolean;
  error?: string | null;
}

// Custom form action button component that uses useFormStatus
function FormActionButton() {
  const { pending } = useFormStatus();
  
  return (
    <Button
      type="submit"
      color="blue"
      fullWidth
      disabled={pending}
    >
      {pending ? "Submitting..." : "Continue"}
    </Button>
  );
}

export function DividendForm({ 
  formAction, 
  asset, 
  initialFormData, 
  showHelpText,
  error: composerError,
}: DividendFormProps): ReactElement {
  const { settings } = useSettings();
  const shouldShowHelpText = showHelpText ?? settings?.showHelpText ?? false;
  const [error, setError] = useState<{ message: string; } | null>(null);
  
  const { data: assetInfo, error: assetError, isLoading: assetLoading } = useAssetDetails(asset);
  const [selectedDividendAsset, setSelectedDividendAsset] = useState<string>(
    initialFormData?.dividend_asset || "XCP"
  );
  const { data: dividendAssetInfo } = useAssetDetails(selectedDividendAsset);
  const [dividendAssetBalance, setDividendAssetBalance] = useState<string>("0");
  const [quantityPerUnit, setQuantityPerUnit] = useState<string>(
    initialFormData?.quantity_per_unit || ""
  );
  const { activeAddress } = useWallet();

  // Set composer error when it occurs
  useEffect(() => {
    if (composerError) {
      setError({ message: composerError });
    }
  }, [composerError]);

  // Fetch dividend asset balance when it changes
  useEffect(() => {
    const fetchBalance = async () => {
      if (activeAddress?.address && selectedDividendAsset) {
        try {
          const balance = await fetchTokenBalance(
            activeAddress.address,
            selectedDividendAsset,
            { verbose: true }
          );
          if (balance?.quantity_normalized) {
            setDividendAssetBalance(balance.quantity_normalized);
          }
        } catch (err) {
          console.error("Failed to fetch dividend asset balance:", err);
          setDividendAssetBalance("0");
        }
      }
    };
    fetchBalance();
  }, [activeAddress?.address, selectedDividendAsset]);

  // Calculate max amount per unit (dividend balance / asset supply)
  const calculateMaxAmountPerUnit = () => {
    if (!assetInfo?.assetInfo?.supply || !dividendAssetBalance) {
      return "0";
    }
    
    const supply = assetInfo.assetInfo.divisible 
      ? Number(assetInfo.assetInfo.supply) / 100000000
      : Number(assetInfo.assetInfo.supply);
    
    if (supply === 0) return "0";
    
    const balance = Number(dividendAssetBalance);
    const maxPerUnit = balance / supply;
    
    return formatAmount({
      value: maxPerUnit,
      maximumFractionDigits: 8,
      minimumFractionDigits: 8
    });
  };

  // Create a server action wrapper that processes the form data
  const processedFormAction = async (formData: FormData) => {
    // Set the quantity_per_unit value from state
    formData.set('quantity_per_unit', quantityPerUnit);
    
    // Submit the form data
    formAction(formData);
  };

  // Handle dividend asset change
  const handleDividendAssetChange = (asset: string) => {
    setSelectedDividendAsset(asset);
  };

  if (assetLoading) {
    return <Spinner message="Loading asset details..." />;
  }

  if (assetError || !assetInfo?.assetInfo) {
    return (
      <div className="p-4 text-red-500">
        Unable to load asset details. Please ensure the asset exists and you have the necessary
        permissions.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <AssetHeader
        assetInfo={{
          ...assetInfo.assetInfo,
          asset: asset,
          divisible: assetInfo.assetInfo.divisible ?? false,
          locked: assetInfo.assetInfo.locked ?? false
        }}
        className="mt-1 mb-5"
      />
      
      <div className="bg-white rounded-lg shadow-lg p-3 sm:p-4">
        {(error || composerError) && (
          <ErrorAlert 
            message={error?.message || composerError || ""} 
            onClose={() => setError(null)}
          />
        )}
        <form action={processedFormAction} className="space-y-4">
          <input type="hidden" name="asset" value={asset} />
          <input type="hidden" name="dividend_asset" value={selectedDividendAsset} />
          
          <AssetSelectInput
            selectedAsset={selectedDividendAsset}
            onChange={handleDividendAssetChange}
            label="Dividend Asset"
            required
            shouldShowHelpText={shouldShowHelpText}
            description="The asset to pay dividends in (e.g., XCP)."
          />

          <AmountWithMaxInput
            asset={selectedDividendAsset}
            availableBalance={dividendAssetBalance}
            value={quantityPerUnit}
            onChange={setQuantityPerUnit}
            sat_per_vbyte={1} // Not used for non-BTC assets
            setError={(msg) => setError(msg ? { message: msg } : null)}
            shouldShowHelpText={shouldShowHelpText}
            sourceAddress={activeAddress}
            maxAmount={calculateMaxAmountPerUnit()}
            label="Amount Per Unit"
            name="quantity_per_unit"
            description={`Amount of ${selectedDividendAsset} to be paid per unit of ${asset}. Max: ${dividendAssetBalance} ${selectedDividendAsset} ÷ ${assetInfo?.assetInfo?.supply ? (assetInfo.assetInfo.divisible ? Number(assetInfo.assetInfo.supply) / 100000000 : Number(assetInfo.assetInfo.supply)) : 0} ${asset} supply`}
            disableMaxButton={false}
          />

          <FeeRateInput showHelpText={shouldShowHelpText} />

          <FormActionButton />
        </form>
      </div>
    </div>
  );
}
