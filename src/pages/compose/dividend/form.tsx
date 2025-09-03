"use client";

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { ComposerForm } from "@/components/composer-form";
import { Spinner } from "@/components/spinner";
import { AssetHeader } from "@/components/headers/asset-header";
import { AssetSelectInput } from "@/components/inputs/asset-select-input";
import { AmountWithMaxInput } from "@/components/inputs/amount-with-max-input";
import { useComposer } from "@/contexts/composer-context";
import { useAssetDetails } from "@/hooks/useAssetDetails";
import { formatAmount } from "@/utils/format";
import { toBigNumber, calculateMaxDividendPerUnit } from "@/utils/numeric";
import { fetchTokenBalance } from "@/utils/blockchain/counterparty/api";
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
}


export function DividendForm({ 
  formAction, 
  asset, 
  initialFormData
}: DividendFormProps): ReactElement {
  // Context hooks
  const { activeAddress, settings, showHelpText, state } = useComposer();
  
  // Data fetching hooks
  const { data: assetInfo, error: assetError, isLoading: assetLoading } = useAssetDetails(asset);
  const { data: dividendAssetInfo } = useAssetDetails(initialFormData?.dividend_asset || "XCP");
  
  // Error state management
  const [error, setError] = useState<{ message: string } | null>(null);
  
  // Form state
  const [selectedDividendAsset, setSelectedDividendAsset] = useState<string>(
    initialFormData?.dividend_asset || "XCP"
  );
  const [dividendAssetBalance, setDividendAssetBalance] = useState<string>("0");
  const [quantityPerUnit, setQuantityPerUnit] = useState<string>(
    initialFormData?.quantity_per_unit || ""
  );

  // Effects - composer error first
  useEffect(() => {
    if (state.error) {
      setError({ message: state.error });
    }
  }, [state.error]);

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

  // Handlers
  const calculateMaxAmountPerUnit = () => {
    if (!assetInfo?.assetInfo?.supply || !dividendAssetBalance) {
      return "0";
    }
    
    const maxPerUnitBN = calculateMaxDividendPerUnit(
      dividendAssetBalance,
      assetInfo.assetInfo.supply,
      assetInfo.assetInfo.divisible ?? false
    );
    
    return formatAmount({
      value: maxPerUnitBN.toNumber(),
      maximumFractionDigits: 8,
      minimumFractionDigits: 8
    });
  };

  const handleDividendAssetChange = (asset: string) => {
    setSelectedDividendAsset(asset);
  };

  const processedFormAction = async (formData: FormData) => {
    // Set the quantity_per_unit value from state
    formData.set('quantity_per_unit', quantityPerUnit);
    
    // Submit the form data
    formAction(formData);
  };
  
  // Early returns
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
    <ComposerForm
      formAction={processedFormAction}
      header={
        <AssetHeader
          assetInfo={{
            ...assetInfo.assetInfo,
            asset: asset,
            divisible: assetInfo.assetInfo.divisible ?? false,
            locked: assetInfo.assetInfo.locked ?? false
          }}
          className="mt-1 mb-5"
        />
      }
    >
          <input type="hidden" name="asset" value={asset} />
          <input type="hidden" name="dividend_asset" value={selectedDividendAsset} />
          
          <AssetSelectInput
            selectedAsset={selectedDividendAsset}
            onChange={handleDividendAssetChange}
            label="Dividend Asset"
            required
            showHelpText={showHelpText}
            description="The asset to pay dividends in (e.g., XCP)."
          />

          <AmountWithMaxInput
            asset={selectedDividendAsset}
            availableBalance={dividendAssetBalance}
            value={quantityPerUnit}
            onChange={setQuantityPerUnit}
            sat_per_vbyte={1} // Not used for non-BTC assets
            setError={(msg) => setError(msg ? { message: msg } : null)}
            showHelpText={showHelpText}
            sourceAddress={activeAddress}
            maxAmount={calculateMaxAmountPerUnit()}
            label="Amount Per Unit"
            name="quantity_per_unit"
            description={`Amount of ${selectedDividendAsset} to be paid per unit of ${asset}`}
            disableMaxButton={false}
          />

    </ComposerForm>
  );
}
