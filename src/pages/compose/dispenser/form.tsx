import type { ReactElement } from "react";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { ComposerForm } from "@/components/composer/composer-form";
import { AddressHeader } from "@/components/domain/address/address-header";
import { AssetSelectInput } from "@/components/domain/asset/asset-select-input";
import { AmountWithMaxInput } from "@/components/domain/balance/amount-with-max-input";
import { BalanceHeader } from "@/components/domain/balance/balance-header";
import { PriceWithSuggestInput } from "@/components/ui/inputs/price-with-suggest-input";
import { TextField } from "@/components/ui/inputs/text-field";
import { useComposer } from "@/contexts/composer-context-object";
import type { DispenserOptions } from "@/core/counterparty/compose";
import { asDisplayUnits, toBigNumber } from '@/core/numeric';
import { useAssetDetails } from "@/hooks/useAssetDetails";
import { useTradingPair } from "@/hooks/useTradingPair";

import { t } from '@/i18n';

/**
 * Props for the DispenserForm component, aligned with Composer's formAction.
 */
interface DispenserFormProps {
  formAction: (formData: FormData) => void;
  initialFormData: DispenserOptions | null;
  asset: string;
  /** When true, price and amount per dispense are pre-filled and read-only */
  isRefill?: boolean;
}

/**
 * Form for creating a dispenser using React 19 Actions.
 * Wrapped with memo to prevent unnecessary re-renders.
 */
export const DispenserForm = memo(function DispenserForm({
  formAction,
  initialFormData,
  asset,
  isRefill = false,
}: DispenserFormProps): ReactElement {
  // Context hooks
  const { activeAddress, activeWallet, showHelpText, state, feeRate } = useComposer();

  const [selectedAsset, setSelectedAsset] = useState<string>(
    asset || initialFormData?.asset || ""
  );
  
  // Data fetching hooks
  const { error: assetError, data: assetDetails } = useAssetDetails(selectedAsset);
  
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
    initialFormData?.give_quantity?.toString() || "1"
  );
  
  // Asset state
  const [availableBalance, setAvailableBalance] = useState<string>("0");

  // Trading pair data from hook
  const { data: tradingPairData } = useTradingPair(selectedAsset, 'BTC');

  // Computed values
  const isDivisible = assetDetails?.assetInfo?.divisible ?? false;

  // Effects - composer error first
  useEffect(() => {
    if (state.error) {
      setError({ message: state.error });
    }
  }, [state.error]);

  // Asset error effect
  useEffect(() => {
    if (assetError) {
      setError({ message: assetError.message || t('dispenser_form_failed_to_load_asset_details') });
    }
  }, [assetError]);
  
  // Check if trying to create dispenser for BTC
  useEffect(() => {
    if (selectedAsset === "BTC") {
      setError({ message: t('dispenser_form_cannot_create_a_dispenser_for') });
    } else if (error?.message === "Cannot create a dispenser for BTC") {
      setError(null);
    }
  }, [selectedAsset, error?.message]);

  useEffect(() => {
    if (asset) {
      setSelectedAsset(asset);
    }
  }, [asset]);

  // The escrow comes out of the same balance, so what can be escrowed is what is spendable. Falls
  // back to the confirmed figure, which is what this offered before pending was tracked.
  useEffect(() => {
    const offerable = assetDetails?.spendableBalance ?? assetDetails?.availableBalance;
    if (offerable) {
      setAvailableBalance(offerable);
    }
  }, [assetDetails?.spendableBalance, assetDetails?.availableBalance]);


  // Reset form fields when initialFormData changes to null
  const prevInitialFormDataRef = useRef(initialFormData);
  useEffect(() => {
    // Only reset if initialFormData changed from non-null to null
    if (initialFormData === null && prevInitialFormDataRef.current !== null) {
      setEscrowQuantity("");
      setMainchainRate("");
      setGiveQuantity("1");
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
    if (!selectedAsset) {
      setError({ message: t('dispenser_form_select_an_asset_to_dispense') });
      return;
    }

    if (selectedAsset === "BTC") {
      setError({ message: t('dispenser_form_cannot_create_a_dispenser_for') });
      return;
    }
    
    const cleanEscrow = toBigNumber(escrowQuantity || "0");
    const cleanGive = toBigNumber(giveQuantity || "0");

    if (!cleanEscrow.isNaN() && !cleanGive.isNaN() && cleanEscrow.isLessThan(cleanGive)) {
      setError({ message: t('dispenser_form_escrow_quantity_must_be_greater') });
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
    processedFormData.append("asset", selectedAsset);

    processedFormData.append("escrow_quantity", escrowQuantity);
    processedFormData.append("mainchainrate", mainchainRate);
    processedFormData.append("give_quantity", giveQuantity);
    
    // Call the original formAction with the processed data
    formAction(processedFormData);
  }, [selectedAsset, escrowQuantity, mainchainRate, giveQuantity, formAction]);

  // Validation for submit button - ensure all required fields have values
  const isFormValid = escrowQuantity.trim() !== "" &&
                      mainchainRate.trim() !== "" &&
                      giveQuantity.trim() !== "" &&
                      selectedAsset.trim() !== "";

  return (
    <ComposerForm
      formAction={handleFormAction}
      submitDisabled={!isFormValid || !!error}
      header={
        selectedAsset && activeAddress && assetDetails ? (
          <BalanceHeader
            balance={{
              asset: selectedAsset,
              quantity_normalized: asDisplayUnits(assetDetails?.spendableBalance ?? availableBalance),
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
            pendingIncoming={assetDetails.pendingIncoming}
          />
        ) : activeAddress ? (
          <AddressHeader
            address={activeAddress.address}
            walletName={activeWallet?.name ?? activeAddress.name}
            className="mt-1 mb-5"
          />
        ) : null
      }
    >
          {!asset && (
            <AssetSelectInput
              selectedAsset={selectedAsset}
              onChange={setSelectedAsset}
              label={t('common_asset')}
              description={t('dispenser_form_select_the_asset_to_dispense')}
              showHelpText={showHelpText}
              required
            />
          )}
          <AmountWithMaxInput
            asset={selectedAsset}
            availableBalance={availableBalance}
            value={escrowQuantity}
            onChange={setEscrowQuantity}
            feeRate={feeRate}
            setError={() => {}} // No-op since Composer handles errors
            showHelpText={showHelpText}
            sourceAddress={activeAddress}
            maxAmount={availableBalance}
            label={t('common_escrow_amount')}
            name="escrow_quantity_display"
            description={isDivisible
              ? t('dispenser_form_total_amount_to_lock_in', [String(availableBalance)])
              : t('dispenser_form_total_amount_to_lock_in_2', [String(availableBalance)])}
            disabled={pending}
            autoFocus
            isDivisible={isDivisible}
          />
          <PriceWithSuggestInput
            value={mainchainRate}
            onChange={setMainchainRate}
            tradingPairData={tradingPairData}
            showHelpText={showHelpText}
            label={t('dispenser_form_price_in_bitcoin')}
            name="mainchainrate_display"
            priceDescription={isRefill ? t('dispenser_form_price_is_fixed_for_refills') : t('dispenser_form_btc_required_to_trigger_one')}
            showPairFlip={false}
            disabled={pending || isRefill}
          />
          {/* Hidden field to indicate mainchainrate is always in BTC for normalization */}
          <input type="hidden" name="mainchainrate_asset" value="BTC" />
          <TextField
            label={t('common_amount_per_dispense')}
            id="give_quantity_display"
            name="give_quantity_display"
            type="text"
            inputMode="decimal"
            value={giveQuantity}
            onChange={(e) => {
              const val = e.target.value;
              if (!isDivisible && val.includes('.')) return;
              if (isDivisible && val.includes('.') && val.split('.')[1]!.length > 8) return;
              setGiveQuantity(val);
            }}
            required
            placeholder={isDivisible ? "0.00000000" : "0"}
            disabled={pending || isRefill}
            showHelpText={showHelpText}
            description={isRefill
              ? t('dispenser_form_amount_per_dispense_is_fixed')
              : isDivisible
                ? t('dispenser_form_the_quantity_of_the_asset')
                : t('dispenser_form_the_quantity_of_the_asset_2')}
          />
          
    </ComposerForm>
  );
});
