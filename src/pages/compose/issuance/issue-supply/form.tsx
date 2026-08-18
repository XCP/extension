import type { ReactElement } from "react";
import { useState } from "react";
import { useFormStatus } from "react-dom";
import { ComposerForm } from "@/components/composer/composer-form";
import { AssetHeader } from "@/components/domain/asset/asset-header";
import { AmountWithMaxInput } from "@/components/domain/balance/amount-with-max-input";
import { CheckboxInput } from "@/components/ui/inputs/checkbox-input";
import { Spinner } from "@/components/ui/spinner";
import { useComposer } from "@/contexts/composer-context-object";
import type { IssuanceOptions } from "@/core/counterparty/compose";
import { formatAmount } from "@/core/format";
import { asDisplayUnits, fromSatoshis, toBigNumber } from '@/core/numeric';
import { MAX_SUPPLY } from "@/core/validation/amount";
import { useAssetInfo } from "@/hooks/useAssetInfo";

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
  
  const [quantity, setQuantity] = useState(initialFormData?.quantity?.toString() || "");
  const [lock, setLock] = useState(initialFormData?.lock || false);
  const [, setError] = useState<string | null>(null);

  // Calculate maximum issuable amount
  const calculateMaxAmount = (): string => {
    if (!assetInfo) return "0";
    
    const isDivisible = assetInfo.divisible ?? false;
    const currentSupply = toBigNumber(assetInfo.supply || "0");
    
    // Unlike a reset, an issuance adds to the supply, so the headroom is the ceiling less what
    // already exists — core checks the sum ("total quantity overflow"), not the addend.
    const maxIssuable = toBigNumber(MAX_SUPPLY).minus(currentSupply);
    
    if (maxIssuable.isLessThanOrEqualTo(0)) {
      return "0";
    }
    
    // Convert to normalized amount (divide by 10^8 if divisible)
    const normalizedMax = isDivisible ? fromSatoshis(maxIssuable) : maxIssuable.toString();
    
    return formatAmount({
      // The decimal string, not a double: `MAX_SUPPLY` needs 19 digits and a double carries 15,
      // so `Number()` here rendered a max the user could not actually reach — the exact trap
      // `AmountFormatterOptions.value` documents.
      value: normalizedMax,
      maximumFractionDigits: isDivisible ? 8 : 0,
      minimumFractionDigits: 0
    });
  };

  const processedFormAction = async (formData: FormData) => {
    if (assetInfo) {
      formData.set('quantity', quantity);
      formData.set('asset', asset);
      formData.set('divisible', String(assetInfo.divisible ?? false));
      formData.set('lock', String(lock));
      formData.set('description', '');
    }
    formAction(formData);
  };

  // Early returns
  if (assetLoading) {
    return <Spinner message="Loading asset details…" />;
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
            supply_normalized: asDisplayUnits(assetInfo?.supply_normalized || '0')
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
          setError={setError}
          showHelpText={showHelpText}
          sourceAddress={activeAddress}
          maxAmount={calculateMaxAmount()}
          label="Amount"
          name="quantity_display"
          description={`Enter the amount of ${asset} to issue`}
          disableMaxButton={true}
          isDivisible={assetInfo?.divisible ?? false}
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