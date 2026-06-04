import { useMemo, useState, type ReactElement } from "react";
import { useFormStatus } from "react-dom";
import { Field, Description } from "@headlessui/react";
import { ComposerForm } from "@/components/composer/composer-form";
import { ErrorAlert } from "@/components/ui/error-alert";
import { BalanceHeader } from "@/components/ui/headers/balance-header";
import { PoolHeader } from "@/components/ui/headers/pool-header";
import { AmountWithMaxInput } from "@/components/ui/inputs/amount-with-max-input";
import { AssetNameInput } from "@/components/ui/inputs/asset-name-input";
import { AssetSelectInput } from "@/components/ui/inputs/asset-select-input";
import { useComposer } from "@/contexts/composer-context";
import { useAssetDetails } from "@/hooks/useAssetDetails";
import { usePool } from "@/hooks/usePool";
import { usePoolDepositQuote } from "@/hooks/usePoolQuotes";
import {
  applyPoolSlippage,
  calculateInitialLpEstimate,
  calculateLimitingLpEstimate,
} from "@/utils/blockchain/counterparty/pool";
import {
  fromSatoshis,
  isEqualTo,
  isGreaterThan,
  isLessThan,
  isLessThanOrEqualTo,
  isValidPositiveNumber,
  roundDown,
  toSatoshis,
} from "@/utils/numeric";
import { FaCog } from "@/components/icons";
import type { PoolDepositOptions } from "@/utils/blockchain/counterparty/compose";
import type { TokenBalance } from "@/utils/blockchain/counterparty/api";
import { DEFAULT_POOL_SLIPPAGE } from "@/utils/settings";
import { PoolSlippageSettings } from "../pool-slippage-settings";

interface PoolDepositFormProps {
  formAction: (formData: FormData) => void;
  initialFormData: PoolDepositOptions | null;
  initialAssetA?: string;
  initialAssetB?: string;
}

export function PoolDepositForm({
  formAction,
  initialFormData,
  initialAssetA,
  initialAssetB,
}: PoolDepositFormProps): ReactElement {
  const { activeAddress, showHelpText, feeRate, settings } = useComposer<PoolDepositOptions>();
  const { pending } = useFormStatus();
  const [assetA, setAssetA] = useState(initialFormData?.asset_a || initialAssetA || "XCP");
  const [assetB, setAssetB] = useState(initialFormData?.asset_b || initialAssetB || "");
  const [quantityA, setQuantityA] = useState(initialFormData?.quantity_a?.toString() || "");
  const [quantityB, setQuantityB] = useState(initialFormData?.quantity_b?.toString() || "");
  const [lpAsset, setLpAsset] = useState(initialFormData?.lp_asset || "");
  const [isLpAssetValid, setIsLpAssetValid] = useState(false);
  const [slippage, setSlippage] = useState((initialFormData as PoolDepositOptions & { slippage?: string })?.slippage || settings?.defaultPoolSlippage || DEFAULT_POOL_SLIPPAGE);
  const [showSettings, setShowSettings] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const { data: assetADetails } = useAssetDetails(assetA);
  const { data: assetBDetails } = useAssetDetails(assetB);
  const { data: pool, isLoading: isPoolLoading } = usePool(assetA, assetB);

  const assetADetailsReady = assetADetails?.assetInfo?.asset === assetA;
  const assetBDetailsReady = assetB ? assetBDetails?.assetInfo?.asset === assetB : false;
  const isAssetADivisible = assetADetailsReady ? assetADetails.isDivisible : true;
  const isAssetBDivisible = assetBDetailsReady && assetBDetails ? assetBDetails.isDivisible : true;
  const bothAssetsSelected = Boolean(assetA && assetB && assetA !== assetB);
  // The pool doesn't exist yet — known as soon as both assets resolve, before any quote.
  const isNewPool = bothAssetsSelected && !isPoolLoading && pool === null;
  const canQuote = assetA && assetB && assetA !== assetB && assetADetailsReady && isGreaterThan(quantityA || 0, 0);
  const needsQuote = canQuote && isGreaterThan(quantityB || 0, 0);
  const { data: quote, isLoading: isLoadingQuote, error: quoteError } = usePoolDepositQuote({
    assetA,
    assetB,
    quantityA,
    isAssetADivisible,
    enabled: Boolean(canQuote),
  });

  const isFirstDeposit = quote?.first_deposit === true;
  const partnerQuantityRaw = quote?.asset_a === assetA
    ? quote?.quantity_b_required
    : quote?.quantity_a_required;
  const partnerQuantity = partnerQuantityRaw !== undefined && partnerQuantityRaw !== null
    ? isAssetBDivisible
      ? fromSatoshis(partnerQuantityRaw, { removeTrailingZeros: true })
      : partnerQuantityRaw.toString()
    : null;
  const quantityARaw = quantityA
    ? isAssetADivisible ? toSatoshis(quantityA) : roundDown(quantityA).toString()
    : "0";
  const quantityBRaw = quantityB
    ? isAssetBDivisible ? toSatoshis(quantityB) : roundDown(quantityB).toString()
    : "0";
  const partnerQuantityMatches = partnerQuantityRaw === undefined || partnerQuantityRaw === null
    || isEqualTo(quantityBRaw, partnerQuantityRaw);
  const partnerQuantityIsLow = partnerQuantityRaw !== undefined && partnerQuantityRaw !== null
    && isLessThan(quantityBRaw, partnerQuantityRaw);
  const partnerQuantityIsHigh = partnerQuantityRaw !== undefined && partnerQuantityRaw !== null
    && isGreaterThan(quantityBRaw, partnerQuantityRaw);
  const isZeroSupplyRestart = !isFirstDeposit && quote?.quantity_minted_estimate === 0;
  const initialLpEstimate = calculateInitialLpEstimate(quantityARaw, quantityBRaw);
  const limitingLpEstimate = calculateLimitingLpEstimate(quote?.quantity_minted_estimate, partnerQuantityRaw, quantityBRaw);
  const lpEstimateForMinimum = isFirstDeposit || isZeroSupplyRestart ? initialLpEstimate : limitingLpEstimate;
  const minLpQuantity = applyPoolSlippage(lpEstimateForMinimum, slippage);
  const hasLpMinimum = isGreaterThan(minLpQuantity, 0);
  const isSlippageValid = isValidPositiveNumber(slippage, { allowZero: true, maxDecimals: 2 })
    && isLessThanOrEqualTo(slippage, 50);
  const assetABalanceHeader: TokenBalance | null = assetADetailsReady && assetADetails
    ? {
        asset: assetA,
        quantity_normalized: assetADetails.availableBalance,
        asset_info: assetADetails.assetInfo ? {
          asset_longname: assetADetails.assetInfo.asset_longname,
          description: assetADetails.assetInfo.description || "",
          issuer: assetADetails.assetInfo.issuer || "",
          divisible: assetADetails.assetInfo.divisible,
          locked: assetADetails.assetInfo.locked,
          supply: assetADetails.assetInfo.supply,
        } : undefined,
      }
    : null;

  const submitDisabled = useMemo(() => {
    if (!assetA || !assetB || assetA === assetB) return true;
    if (!assetADetailsReady || !assetBDetailsReady) return true;
    if (!isGreaterThan(quantityA || 0, 0)) return true;
    if (!isGreaterThan(quantityB || 0, 0)) return true;
    if (needsQuote && (isLoadingQuote || !quote)) return true;
    if (isFirstDeposit && lpAsset && !isLpAssetValid) return true;
    if (!isSlippageValid) return true;
    return false;
  }, [assetA, assetB, assetADetailsReady, assetBDetailsReady, quantityA, quantityB, needsQuote, isLoadingQuote, quote, isFirstDeposit, lpAsset, isLpAssetValid, isSlippageValid]);

  const handleFormAction = (formData: FormData) => {
    if (assetA === assetB) {
      setLocalError("Pool assets must be different.");
      return;
    }

    formData.set("asset_a", assetA);
    formData.set("asset_b", assetB);
    formData.set("quantity_a", quantityA);
    formData.set("quantity_b", quantityB);
    formData.set("min_lp_quantity", minLpQuantity);
    if (lpAsset.trim()) {
      formData.set("lp_asset", lpAsset.trim());
    } else {
      formData.delete("lp_asset");
    }
    formAction(formData);
  };

  if (showSettings) {
    return (
      <PoolSlippageSettings
        value={slippage}
        onChange={setSlippage}
        onBack={() => setShowSettings(false)}
        showHelpText={showHelpText}
      />
    );
  }

  return (
    <ComposerForm
      formAction={handleFormAction}
      header={
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            {pool ? (
              <PoolHeader pool={pool} className="mt-1 mb-5" />
            ) : assetABalanceHeader ? (
              <BalanceHeader balance={assetABalanceHeader} className="mt-1 mb-5" />
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => setShowSettings(true)}
            aria-label="Pool settings"
            className="mt-1 shrink-0 p-2 rounded-full hover:bg-gray-100 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <FaCog className="size-4 text-gray-600" aria-hidden="true" />
          </button>
        </div>
      }
      submitText="Review Deposit"
      submitDisabled={pending || submitDisabled}
    >
      {localError && <ErrorAlert message={localError} onClose={() => setLocalError(null)} />}

      <AssetSelectInput
        selectedAsset={assetA}
        onChange={setAssetA}
        label="Asset A"
        required
        showHelpText={showHelpText}
      />

      <AmountWithMaxInput
        asset={assetA}
        availableBalance={assetADetails?.availableBalance || "0"}
        value={quantityA}
        onChange={setQuantityA}
        feeRate={feeRate}
        setError={setLocalError}
        showHelpText={showHelpText}
        sourceAddress={activeAddress}
        maxAmount={assetADetails?.availableBalance || "0"}
        label="Amount"
        name="quantity_a_display"
        disabled={pending || !assetA}
        isDivisible={isAssetADivisible}
      />

      <AssetSelectInput
        selectedAsset={assetB}
        onChange={setAssetB}
        label="Asset B"
        required
        showHelpText={showHelpText}
      />

      <AmountWithMaxInput
        asset={assetB}
        availableBalance={assetBDetails?.availableBalance || "0"}
        value={quantityB}
        onChange={setQuantityB}
        feeRate={feeRate}
        setError={setLocalError}
        showHelpText={showHelpText}
        sourceAddress={activeAddress}
        maxAmount={assetBDetails?.availableBalance || "0"}
        label="Amount"
        name="quantity_b_display"
        disabled={pending || !assetB}
        isDivisible={isAssetBDivisible}
        labelRight={
          partnerQuantity && !isFirstDeposit ? (
            <button
              type="button"
              className="text-xs text-blue-600 hover:text-blue-800"
              onClick={() => setQuantityB(partnerQuantity.toString())}
            >
              Use quote
            </button>
          ) : null
        }
      />

      {isLoadingQuote && (
        <p className="text-sm text-gray-500">Loading pool quote...</p>
      )}

      {quoteError && (
        <ErrorAlert message={quoteError} />
      )}

      {quote?.message && (
        <div className="rounded border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">
          {quote.message}
        </div>
      )}

      {partnerQuantity && !isFirstDeposit && (
        <div className="rounded border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">
          Quoted partner amount: {partnerQuantity.toString()} {assetB}
        </div>
      )}

      {partnerQuantity && !isFirstDeposit && !partnerQuantityMatches && (
        <div className="rounded border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800">
          {partnerQuantityIsHigh
            ? "Only the pool-ratio amount will be deposited; extra is left unused."
            : partnerQuantityIsLow
              ? "This deposits less than the quoted ratio allows."
              : "Pool deposits use the current pool ratio."}
        </div>
      )}

      {isZeroSupplyRestart && (
        <div className="rounded border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800">
          LP supply is zero. This deposit restarts the pool and may claim existing reserves.
        </div>
      )}

      {hasLpMinimum && (
        <div className="rounded border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">
          Minimum LP tokens:{" "}
          <span className="font-medium text-gray-900">
            {fromSatoshis(minLpQuantity, { removeTrailingZeros: true })}
          </span>{" "}
          after {slippage || "0"}% slippage.
        </div>
      )}

      {isNewPool && (
        <Field>
          <AssetNameInput
            value={lpAsset}
            onChange={setLpAsset}
            onValidationChange={setIsLpAssetValid}
            label="LP Asset"
            required={false}
            showRandomNumeric
            showHelpText={showHelpText}
            helpText="Optional. Leave blank to auto-generate the LP asset."
          />
          {showHelpText && (
            <Description className="mt-2 text-sm text-gray-500">
              The LP asset represents your share of the pool.
            </Description>
          )}
        </Field>
      )}

      <input type="hidden" name="asset_a" value={assetA} />
      <input type="hidden" name="asset_b" value={assetB} />
      <input type="hidden" name="quantity_a" value={quantityA} />
      <input type="hidden" name="quantity_b" value={quantityB} />
      <input type="hidden" name="min_lp_quantity" value={minLpQuantity} />
      <input type="hidden" name="slippage" value={slippage} />
      {lpAsset && <input type="hidden" name="lp_asset" value={lpAsset} />}
    </ComposerForm>
  );
}
