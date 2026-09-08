import type { ReactElement } from "react";
import { useEffect, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { ComposerForm } from "@/components/composer/composer-form";
import { AssetNameInput } from "@/components/domain/asset/asset-name-input";
import { AmountWithMaxInput } from "@/components/domain/balance/amount-with-max-input";
import { BalanceHeader } from "@/components/domain/balance/balance-header";
import { MemoInput } from "@/components/ui/inputs/memo-input";
import { useComposer } from "@/contexts/composer-context-object";
import type { DestroyOptions } from "@/core/counterparty/compose";
import { asDisplayUnits } from '@/core/numeric';
import { validateQuantity } from "@/core/validation/amount";
import { useAssetDetails } from "@/hooks/useAssetDetails";

import { t } from '@/i18n';

/**
 * Props for the DestroySupplyForm component, aligned with Composer's formAction.
 */
interface DestroySupplyFormProps {
  formAction: (formData: FormData) => void;
  initialFormData: DestroyOptions | null;
  initialAsset?: string;
}

/**
 * Form for destroying asset supply using React 19 Actions.
 */
export function DestroySupplyForm({
  formAction,
  initialFormData,
  initialAsset,
}: DestroySupplyFormProps): ReactElement {
  // Context hooks
  const { activeAddress, showHelpText, feeRate } = useComposer();
  
  // Data fetching hooks
  const asset = initialAsset || initialFormData?.asset || "";
  const { data: assetDetails } = useAssetDetails(asset);
  
  // Form status
  const { pending } = useFormStatus();
  
  // Form state
  const [amount, setAmount] = useState<string>(
    initialFormData?.quantity?.toString() || ""
  );
  const [assetName, setAssetName] = useState(initialFormData?.asset || "");
  const [, setIsAssetNameValid] = useState(false);
  const [tag, setTag] = useState(initialFormData?.tag || "");
  
  // Computed values
  const isDivisible = useMemo(() => {
    return assetDetails?.assetInfo?.divisible || false;
  }, [assetDetails?.assetInfo]);


  // Sync amount when initialFormData changes
  useEffect(() => {
    if (initialFormData?.quantity !== undefined) {
      setAmount(initialFormData.quantity.toString());
    }
  }, [initialFormData?.quantity]);

  // Focus on tag input on mount if asset is pre-selected
  useEffect(() => {
    const input = document.getElementById(initialAsset ? "tag" : "quantity") as HTMLInputElement;
    input?.focus();
  }, [initialAsset]);

  // Handlers
  const handleAmountChange = (value: string) => {
    setAmount(value);
  };

  const handleFormAction = (formData: FormData) => {
    if (amount) {
      // Remove any formatting (commas, spaces) from the amount
      const cleanAmount = amount.replace(/[,\s]/g, '');
      formData.set("quantity", cleanAmount);
    }
    // Ensure tag is always present, even if empty
    if (!formData.get("tag")) {
      formData.set("tag", "");
    }
    formAction(formData);
  };

  // Validation helpers
  const isAmountValid = (): boolean => {
    if (!amount || amount.trim() === "") return false;
    
    const validation = validateQuantity(amount, {
      divisible: isDivisible,
      allowZero: false
    });
    
    return validation.isValid;
  };


  return (
    <ComposerForm
      formAction={handleFormAction}
      header={
        asset && assetDetails ? (
          <BalanceHeader
            balance={{
              asset: asset,
              asset_info: {
                asset_longname: assetDetails.assetInfo?.asset_longname || null,
                description: assetDetails.assetInfo?.description || '',
                issuer: assetDetails.assetInfo?.issuer || 'Unknown',
                divisible: assetDetails.assetInfo?.divisible ?? false,
                locked: assetDetails.assetInfo?.locked ?? false,
                supply: assetDetails.assetInfo?.supply
              },
              quantity_normalized: asDisplayUnits(assetDetails.spendableBalance ?? assetDetails.availableBalance)
            }}
            className="mt-1 mb-5"
            pendingIncoming={assetDetails.pendingIncoming}
          />
        ) : null
      }
      submitText={t('destroy_supply_form_destroy_supply')}
      submitDisabled={!isAmountValid() || !asset}
    >
          {/* Hidden asset field when pre-selected */}
          {initialAsset ? (
            <input type="hidden" name="asset" value={initialAsset} />
          ) : (
            <AssetNameInput
              value={assetName}
              onChange={setAssetName}
              onValidationChange={setIsAssetNameValid}
              label={t('common_asset_name')}
              required={true}
              placeholder={t('destroy_supply_form_enter_asset_name')}
              disabled={pending}
              showHelpText={showHelpText}
              helpText={t('destroy_supply_form_the_name_of_the_asset')}
            />
          )}

          <AmountWithMaxInput
            asset={asset}
            availableBalance={assetDetails?.spendableBalance ?? assetDetails?.availableBalance ?? "0"}
            value={amount}
            onChange={handleAmountChange}
            feeRate={feeRate}
            setError={(message) => {}}
            sourceAddress={activeAddress}
            maxAmount={assetDetails?.spendableBalance ?? assetDetails?.availableBalance ?? "0"}
            showHelpText={showHelpText}
            label={t('destroy_supply_form_amount_to_destroy')}
            name="quantity"
            description={
              isDivisible
                ? t('destroy_supply_form_enter_the_amount_to_destroy')
                : t('destroy_supply_form_enter_a_whole_number_amount')
            }
            disabled={pending}
            isDivisible={isDivisible}
          />

          <MemoInput
            value={tag}
            onChange={setTag}
            name="tag"
            showHelpText={showHelpText}
            disabled={pending}
          />

    </ComposerForm>
  );
}
