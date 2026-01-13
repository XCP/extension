
import { useState } from "react";
import { useFormStatus } from "react-dom";
import { ComposerForm } from "@/components/composer-form";
import { Spinner } from "@/components/spinner";
import { AssetHeader } from "@/components/headers/asset-header";
import { CheckboxInput } from "@/components/inputs/checkbox-input";
import { AmountWithMaxInput } from "@/components/inputs/amount-with-max-input";
import { useComposer } from "@/contexts/composer-context";
import { useAssetInfo } from "@/hooks/useAssetInfo";
import { toBigNumber } from "@/utils/numeric";
import { formatAmount } from "@/utils/format";
import type { IssuanceOptions } from "@/utils/blockchain/counterparty/compose";
import type { ReactElement } from "react";

/**
 * Props for the IssueSupplyForm component, aligned with Composer's formAction.
 */
interface IssueSupplyFormProps {
  formAction: (formData: FormData) => void;
  initialFormData: IssuanceOptions | null;
  initialParentAsset?: string;
}

/**
 * Form for issuing additional supply to an existing asset using React 19 Actions.
 */
export function IssueSupplyForm({
  formAction,
  initialFormData,
  initialParentAsset,
}: IssueSupplyFormProps): ReactElement {
  // Context hooks
  const { showHelpText, activeAddress } = useComposer();
  
  // Data fetching hooks
  const asset = initialParentAsset || initialFormData?.asset || "";
  const { error: assetError, data: assetInfo, isLoading: assetLoading } = useAssetInfo(asset);
  
  // Form status
  const { pending } = useFormStatus();
  
  // Form state
  const [quantity, setQuantity] = useState(initialFormData?.quantity?.toString() || "");
  const [lock, setLock] = useState(initialFormData?.lock || false);
  const [, setError] = useState<string | null>(null);

  // Calculate maximum issuable amount
  const calculateMaxAmount = (): string => {
    if (!assetInfo) return "0";
    
    const isDivisible = assetInfo.divisible ?? false;
    const currentSupply = toBigNumber(assetInfo.supply || "0");
    
    // Max int is 2^63 - 1 = 9223372036854775807
    const maxInt = toBigNumber("9223372036854775807");
    const maxIssuable = maxInt.minus(currentSupply);
    
    if (maxIssuable.isLessThanOrEqualTo(0)) {
      return "0";
    }
    
    // Convert to normalized amount (divide by 10^8 if divisible)
    const normalizedMax = isDivisible 
      ? maxIssuable.dividedBy(100000000).toString()
      : maxIssuable.toString();
    
    return formatAmount({
      value: Number(normalizedMax),
      maximumFractionDigits: isDivisible ? 8 : 0,
      minimumFractionDigits: 0
    });
  };

  // Process form action to convert quantity to integer
  const processedFormAction = async (formData: FormData) => {
    if (assetInfo) {
      const isDivisible = assetInfo.divisible ?? false;
      const quantityInt = isDivisible 
        ? toBigNumber(quantity).multipliedBy(100000000).toFixed(0)
        : toBigNumber(quantity).toFixed(0);
      
      formData.set('quantity', quantityInt);
      formData.set('asset', asset);
      formData.set('divisible', String(isDivisible));
      formData.set('lock', String(lock));
      formData.set('description', ''); // Empty description for issue supply
    }
    
    formAction(formData);
  };

  // Early returns
  if (assetLoading) {
    return <Spinner message="Loading asset details..." />;
  }

  if (assetError || !assetInfo) {
    return (
      <div className="p-4 text-red-500">
        Unable to load asset details. Please ensure the asset exists and you have the necessary
        permissions.
      </div>
    );
  }
  
  if (asset === "BTC") {
    return <div className="p-4 text-red-500">Cannot issue additional supply of BTC</div>;
  }

  if (assetInfo.locked) {
    return (
      <div className="p-4">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-center">
          <p className="text-yellow-800">
            This asset's supply is locked and cannot be increased.
          </p>
        </div>
      </div>
    );
  }

  return (
    <ComposerForm
      formAction={processedFormAction}
      header={
        <AssetHeader
          assetInfo={{
            asset: asset,
            asset_longname: assetInfo?.asset_longname ?? null,
            divisible: assetInfo?.divisible ?? false,
            locked: assetInfo?.locked ?? false,
            description: assetInfo?.description ?? "",
            issuer: assetInfo?.issuer ?? "",
            supply: assetInfo?.supply ?? "0",
            supply_normalized: assetInfo?.supply_normalized || '0'
          }}
          className="mt-1 mb-5"
        />
      }
    >
        <AmountWithMaxInput
          asset={asset}
          availableBalance={calculateMaxAmount()}
          value={quantity}
          onChange={setQuantity}
          sat_per_vbyte={1} // Not used for token issuance
          setError={setError}
          showHelpText={showHelpText}
          sourceAddress={activeAddress}
          maxAmount={calculateMaxAmount()}
          label="Amount"
          name="quantity_display"
          description={`Amount of ${asset} to issue (max: ${calculateMaxAmount()})`}
          disableMaxButton={false}
        />
        
        <CheckboxInput
          name="lock_checkbox"
          label="Lock Supply"
          checked={lock}
          onChange={setLock}
          disabled={pending}
        />

    </ComposerForm>
  );
}