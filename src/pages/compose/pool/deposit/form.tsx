import { useEffect, useMemo, useState, type ReactElement } from "react";
import { useFormStatus } from "react-dom";
import { Field, Description } from "@headlessui/react";
import { ComposerForm } from "@/components/composer/composer-form";
import { ErrorAlert } from "@/components/ui/error-alert";
import { AmountWithMaxInput } from "@/components/ui/inputs/amount-with-max-input";
import { AssetNameInput } from "@/components/ui/inputs/asset-name-input";
import { AssetSelectInput } from "@/components/ui/inputs/asset-select-input";
import { useComposer } from "@/contexts/composer-context";
import { useAssetDetails } from "@/hooks/useAssetDetails";
import { fetchPoolDepositQuote, type PoolDepositQuote } from "@/utils/blockchain/counterparty/api";
import { BigNumber, fromSatoshis, isValidPositiveNumber, toBigNumber, toSatoshis } from "@/utils/numeric";
import type { PoolDepositOptions } from "@/utils/blockchain/counterparty/compose";
import { SlippageInput } from "../slippage-input";

interface PoolDepositFormProps {
  formAction: (formData: FormData) => void;
  initialFormData: PoolDepositOptions | null;
  initialAssetA?: string;
  initialAssetB?: string;
}

function toRawQuantity(value: string, divisible: boolean): string {
  return divisible ? toSatoshis(value) : toBigNumber(value).integerValue().toString();
}

function fromRawQuantity(value: number | string, divisible: boolean): string {
  return divisible ? fromSatoshis(value, { removeTrailingZeros: true }) : value.toString();
}

function getCanonicalPair(firstAsset: string, secondAsset: string, quote: PoolDepositQuote | null) {
  if (quote?.asset_a && quote?.asset_b) {
    return [quote.asset_a, quote.asset_b] as const;
  }

  return firstAsset > secondAsset
    ? [secondAsset, firstAsset] as const
    : [firstAsset, secondAsset] as const;
}

function applySlippage(value: number | string | null | undefined, slippagePercent: string): string {
  if (value === null || value === undefined) return "0";

  const bps = toBigNumber(slippagePercent || "0").times(100);
  const multiplier = BigNumber.maximum(0, toBigNumber(10000).minus(bps));

  return toBigNumber(value)
    .times(multiplier)
    .div(10000)
    .integerValue(BigNumber.ROUND_DOWN)
    .toString();
}

function getLimitingLpEstimate(
  mintedEstimate: number | string | null | undefined,
  partnerRequired: number | string | null | undefined,
  partnerProvided: string
): string {
  if (mintedEstimate === null || mintedEstimate === undefined) return "0";
  if (partnerRequired === null || partnerRequired === undefined) return mintedEstimate.toString();

  const required = toBigNumber(partnerRequired);
  const provided = toBigNumber(partnerProvided);
  if (!required.isGreaterThan(0) || provided.isGreaterThanOrEqualTo(required)) {
    return mintedEstimate.toString();
  }

  return toBigNumber(mintedEstimate)
    .times(provided)
    .div(required)
    .integerValue(BigNumber.ROUND_DOWN)
    .toString();
}

function getInitialLpEstimate(quantityA: string, quantityB: string): string {
  const product = toBigNumber(quantityA).times(quantityB);
  if (!product.isGreaterThan(0)) return "0";
  return product.sqrt().integerValue(BigNumber.ROUND_DOWN).toString();
}

export function PoolDepositForm({
  formAction,
  initialFormData,
  initialAssetA,
  initialAssetB,
}: PoolDepositFormProps): ReactElement {
  const { activeAddress, showHelpText, feeRate } = useComposer<PoolDepositOptions>();
  const { pending } = useFormStatus();
  const [assetA, setAssetA] = useState(initialFormData?.asset_a || initialAssetA || "XCP");
  const [assetB, setAssetB] = useState(initialFormData?.asset_b || initialAssetB || "");
  const [quantityA, setQuantityA] = useState(initialFormData?.quantity_a?.toString() || "");
  const [quantityB, setQuantityB] = useState(initialFormData?.quantity_b?.toString() || "");
  const [lpAsset, setLpAsset] = useState(initialFormData?.lp_asset || "");
  const [isLpAssetValid, setIsLpAssetValid] = useState(false);
  const [slippage, setSlippage] = useState("1");
  const [localError, setLocalError] = useState<string | null>(null);
  const [quote, setQuote] = useState<PoolDepositQuote | null>(null);
  const [isLoadingQuote, setIsLoadingQuote] = useState(false);

  const { data: assetADetails } = useAssetDetails(assetA);
  const { data: assetBDetails } = useAssetDetails(assetB);

  const isAssetADivisible = assetADetails?.isDivisible ?? true;
  const isAssetBDivisible = assetBDetails?.isDivisible ?? true;
  const canQuote = assetA && assetB && assetA !== assetB && toBigNumber(quantityA || 0).isGreaterThan(0);

  useEffect(() => {
    if (!canQuote) {
      setQuote(null);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      setIsLoadingQuote(true);
      fetchPoolDepositQuote(assetA, assetB, toRawQuantity(quantityA, isAssetADivisible))
        .then((result) => {
          if (!cancelled) setQuote(result);
        })
        .catch(() => {
          if (!cancelled) setQuote(null);
        })
        .finally(() => {
          if (!cancelled) setIsLoadingQuote(false);
        });
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [assetA, assetB, quantityA, canQuote, isAssetADivisible]);

  const isFirstDeposit = quote?.first_deposit === true;
  const partnerQuantityRaw = quote?.asset_a === assetA
    ? quote?.quantity_b_required
    : quote?.quantity_a_required;
  const partnerQuantity = partnerQuantityRaw !== undefined && partnerQuantityRaw !== null
    ? fromRawQuantity(partnerQuantityRaw, isAssetBDivisible)
    : null;
  const quantityARaw = quantityA ? toRawQuantity(quantityA, isAssetADivisible) : "0";
  const quantityBRaw = quantityB ? toRawQuantity(quantityB, isAssetBDivisible) : "0";
  const partnerQuantityMatches = partnerQuantityRaw === undefined || partnerQuantityRaw === null
    || toBigNumber(quantityBRaw).isEqualTo(partnerQuantityRaw);
  const partnerQuantityIsLow = partnerQuantityRaw !== undefined && partnerQuantityRaw !== null
    && toBigNumber(quantityBRaw).isLessThan(partnerQuantityRaw);
  const partnerQuantityIsHigh = partnerQuantityRaw !== undefined && partnerQuantityRaw !== null
    && toBigNumber(quantityBRaw).isGreaterThan(partnerQuantityRaw);
  const isZeroSupplyRestart = !isFirstDeposit && quote?.quantity_minted_estimate === 0;
  const [canonicalAssetA, canonicalAssetB] = getCanonicalPair(assetA, assetB, quote);
  const canonicalQuantityA = canonicalAssetA === assetA ? quantityA : quantityB;
  const canonicalQuantityB = canonicalAssetB === assetB ? quantityB : quantityA;
  const canonicalQuantityARaw = canonicalAssetA === assetA ? quantityARaw : quantityBRaw;
  const canonicalQuantityBRaw = canonicalAssetB === assetB ? quantityBRaw : quantityARaw;
  const initialLpEstimate = getInitialLpEstimate(canonicalQuantityARaw, canonicalQuantityBRaw);
  const limitingLpEstimate = getLimitingLpEstimate(quote?.quantity_minted_estimate, partnerQuantityRaw, quantityBRaw);
  const lpEstimateForMinimum = isFirstDeposit || isZeroSupplyRestart ? initialLpEstimate : limitingLpEstimate;
  const minLpQuantity = applySlippage(lpEstimateForMinimum, slippage);
  const hasLpMinimum = toBigNumber(minLpQuantity).isGreaterThan(0);
  const isSlippageValid = isValidPositiveNumber(slippage, { allowZero: true, maxDecimals: 2 })
    && toBigNumber(slippage).isLessThanOrEqualTo(50);

  const submitDisabled = useMemo(() => {
    if (!assetA || !assetB || assetA === assetB) return true;
    if (!toBigNumber(quantityA || 0).isGreaterThan(0)) return true;
    if (!toBigNumber(quantityB || 0).isGreaterThan(0)) return true;
    if (isFirstDeposit && lpAsset && !isLpAssetValid) return true;
    if (!isSlippageValid) return true;
    return false;
  }, [assetA, assetB, quantityA, quantityB, isFirstDeposit, lpAsset, isLpAssetValid, isSlippageValid]);

  const handleFormAction = (formData: FormData) => {
    if (assetA === assetB) {
      setLocalError("Pool assets must be different.");
      return;
    }

    formData.set("asset_a", canonicalAssetA);
    formData.set("asset_b", canonicalAssetB);
    formData.set("quantity_a", canonicalQuantityA);
    formData.set("quantity_b", canonicalQuantityB);
    formData.set("min_lp_quantity", minLpQuantity);
    if (lpAsset.trim()) {
      formData.set("lp_asset", lpAsset.trim());
    } else {
      formData.delete("lp_asset");
    }
    formAction(formData);
  };

  return (
    <ComposerForm
      formAction={handleFormAction}
      submitText="Review Deposit"
      submitDisabled={pending || submitDisabled}
    >
      {localError && <ErrorAlert message={localError} onClose={() => setLocalError(null)} />}

      <AssetSelectInput
        selectedAsset={assetA}
        onChange={setAssetA}
        label="First Asset"
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
        label={`${assetA || "Asset"} Amount`}
        name="quantity_a_display"
        disabled={pending || !assetA}
        isDivisible={isAssetADivisible}
      />

      <AssetSelectInput
        selectedAsset={assetB}
        onChange={setAssetB}
        label="Second Asset"
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
        label={`${assetB || "Asset"} Amount`}
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
          LP supply is zero. This deposit re-seeds the pool with the amounts entered.
        </div>
      )}

      {(isFirstDeposit || isZeroSupplyRestart || (quote?.quantity_minted_estimate !== undefined && quote.quantity_minted_estimate !== null)) && (
        <>
          <SlippageInput
            value={slippage}
            onChange={setSlippage}
            showHelpText={showHelpText}
          />

          {hasLpMinimum && (
            <div className="rounded border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">
              Minimum LP tokens:{" "}
              <span className="font-medium text-gray-900">
                {fromRawQuantity(minLpQuantity, true)}
              </span>{" "}
              after {slippage || "0"}% slippage.
            </div>
          )}
        </>
      )}

      {isFirstDeposit && (
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

      <input type="hidden" name="asset_a" value={canonicalAssetA} />
      <input type="hidden" name="asset_b" value={canonicalAssetB} />
      <input type="hidden" name="quantity_a" value={canonicalQuantityA} />
      <input type="hidden" name="quantity_b" value={canonicalQuantityB} />
      <input type="hidden" name="min_lp_quantity" value={minLpQuantity} />
      {lpAsset && <input type="hidden" name="lp_asset" value={lpAsset} />}
    </ComposerForm>
  );
}
