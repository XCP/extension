import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import { ComposerForm } from "@/components/composer/composer-form";
import { AssetHeader } from "@/components/domain/asset/asset-header";
import { AssetSelectInput } from "@/components/domain/asset/asset-select-input";
import { AmountWithMaxInput } from "@/components/domain/balance/amount-with-max-input";
import { Banner } from "@/components/ui/banner";
import { ErrorAlert } from "@/components/ui/error-alert";
import { Spinner } from "@/components/ui/spinner";
import { useComposer } from "@/contexts/composer-context-object";
import { fetchAssetHolderCount } from "@/core/counterparty/api";
import type { DividendOptions } from "@/core/counterparty/compose";
import {
  describeDividendFee,
  describeDividendFeeShortfall,
  getDividendFeeXcp,
  getMaxDividendPerUnit,
} from "@/core/counterparty/dividendModel";
import { useAssetDetails } from "@/hooks/useAssetDetails";

interface DividendFormProps {
  formAction: (formData: FormData) => void;
  asset: string;
  initialFormData: DividendOptions | null;
}


export function DividendForm({ 
  formAction, 
  asset, 
  initialFormData
}: DividendFormProps): ReactElement {
  // Context hooks
  const { activeAddress, showHelpText } = useComposer();
  
  // Data fetching hooks
  const { data: assetInfo, error: assetError, isLoading: assetLoading } = useAssetDetails(asset);

  // Form state
  const [selectedDividendAsset, setSelectedDividendAsset] = useState<string>(
    initialFormData?.dividend_asset || "XCP"
  );
  const { data: dividendAssetInfo } = useAssetDetails(selectedDividendAsset);
  /**
   * A dividend is paid out of this balance, so what can be paid is what is spendable. This used to
   * be fetched a second time by hand next to the hook that already answers it; two sources for one
   * number is one more than the form can keep honest.
   */
  const spendableDividendBalance =
    dividendAssetInfo?.spendableBalance ?? dividendAssetInfo?.availableBalance ?? "0";
  /**
   * The XCP fee is billed per holder whatever the dividend is paid in, so this balance matters even
   * when it is not the one being distributed. When the dividend *is* XCP the two are the same
   * balance, which is exactly why core checks them together.
   */
  const { data: xcpDetails } = useAssetDetails("XCP");
  // Null until it is actually known: a balance that reads 0 while it loads would warn that a fee
  // cannot be covered by someone who covers it comfortably, then take the warning back.
  const spendableXcp = xcpDetails?.spendableBalance ?? xcpDetails?.availableBalance ?? null;
  /** null while loading or if the lookup failed — unknown, which is not the same as no holders. */
  const [holderCount, setHolderCount] = useState<number | null>(null);
  const [quantityPerUnit, setQuantityPerUnit] = useState<string>(
    initialFormData?.quantity_per_unit != null ? String(initialFormData.quantity_per_unit) : ""
  );
  const [error, setError] = useState<string | null>(null);

  // Focus on amount input on mount
  useEffect(() => {
    // Small timeout to ensure the input is rendered
    setTimeout(() => {
      const amountInput = document.querySelector('input[name="quantity_per_unit"]') as HTMLInputElement;
      amountInput?.focus();
    }, 100);
  }, []);

  // How many addresses the fee is billed for. Counted on the asset being paid *on*, which does not
  // change with the dividend asset, so this runs once per asset rather than per selection.
  useEffect(() => {
    let cancelled = false;
    setHolderCount(null);
    fetchAssetHolderCount(asset)
      .then((count) => {
        if (!cancelled) setHolderCount(count);
      })
      .catch(() => {
        // Leave it unknown. The Max below is then a fee too generous, which compose still catches.
      });
    return () => {
      cancelled = true;
    };
  }, [asset]);

  const feeXcp = getDividendFeeXcp(holderCount);
  const feeShortfall = describeDividendFeeShortfall({ feeXcp, xcpBalance: spendableXcp });
  const feeNote = describeDividendFee(feeXcp, holderCount);

  // Handlers
  const calculateMaxAmountPerUnit = () => {
    if (!assetInfo?.assetInfo?.supply || !spendableDividendBalance) {
      return "0";
    }

    return getMaxDividendPerUnit({
      spendableBalance: spendableDividendBalance,
      assetSupply: assetInfo.assetInfo.supply,
      assetIsDivisible: assetInfo.assetInfo.divisible ?? false,
      dividendAsset: selectedDividendAsset,
      feeXcp,
    });
  };

  const handleDividendAssetChange = (newAsset: string) => {
    setSelectedDividendAsset(newAsset);
    setQuantityPerUnit("");
  };

  const processedFormAction = async (formData: FormData) => {
    // Set the quantity_per_unit value from state
    formData.set('quantity_per_unit', quantityPerUnit);
    
    // Submit the form data
    formAction(formData);
  };
  
  // Early returns
  if (assetLoading) {
    return <Spinner message="Loading asset details…" />;
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
        <>
          {error && <ErrorAlert message={error} onClose={() => setError(null)} />}
          {feeShortfall && (
            <Banner
              severity="warning"
              title="Not enough XCP for the dividend fee"
              description={feeShortfall}
              className="mb-4"
            />
          )}
          <AssetHeader
          assetInfo={{
            ...assetInfo.assetInfo,
            asset: asset,
            divisible: assetInfo.assetInfo.divisible ?? false,
            locked: assetInfo.assetInfo.locked ?? false
          }}
          className="mt-1 mb-5"
        />
        </>
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
            availableBalance={spendableDividendBalance}
            value={quantityPerUnit}
            onChange={setQuantityPerUnit}
            setError={setError}
            showHelpText={showHelpText}
            sourceAddress={activeAddress}
            maxAmount={calculateMaxAmountPerUnit()}
            label="Amount Per Unit"
            name="quantity_per_unit"
            description={[`Amount of ${selectedDividendAsset} to be paid per unit of ${asset}.`, feeNote]
              .filter(Boolean)
              .join(" ")}
            disableMaxButton={false}
            isDivisible={dividendAssetInfo?.assetInfo?.divisible ?? true}
          />

    </ComposerForm>
  );
}
