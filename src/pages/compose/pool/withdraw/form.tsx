import { useMemo, useState, type ReactElement } from "react";
import { useFormStatus } from "react-dom";
import { ComposerForm } from "@/components/composer/composer-form";
import { ErrorAlert } from "@/components/ui/error-alert";
import { AmountWithMaxInput } from "@/components/ui/inputs/amount-with-max-input";
import { Spinner } from "@/components/ui/spinner";
import { useComposer } from "@/contexts/composer-context";
import { useAssetDetails } from "@/hooks/useAssetDetails";
import { useLpAssetPool } from "@/hooks/useLpAssetPool";
import { usePoolWithdrawQuote } from "@/hooks/usePoolQuotes";
import { applyPoolSlippage } from "@/utils/blockchain/counterparty/pool";
import { fromSatoshis, isValidPositiveNumber, toBigNumber } from "@/utils/numeric";
import type { PoolWithdrawOptions } from "@/utils/blockchain/counterparty/compose";
import { DEFAULT_POOL_SLIPPAGE, SlippageInput } from "../slippage-input";

interface PoolWithdrawFormProps {
  formAction: (formData: FormData) => void;
  initialFormData: PoolWithdrawOptions | null;
  lpAsset: string;
}

export function PoolWithdrawForm({
  formAction,
  initialFormData,
  lpAsset,
}: PoolWithdrawFormProps): ReactElement {
  const { activeAddress, showHelpText, feeRate } = useComposer<PoolWithdrawOptions>();
  const { pending } = useFormStatus();
  const { data: pool, isLoading, error: poolError } = useLpAssetPool(lpAsset);
  const { data: assetADetails } = useAssetDetails(pool?.asset_a || "");
  const { data: assetBDetails } = useAssetDetails(pool?.asset_b || "");
  const [quantity, setQuantity] = useState(initialFormData?.quantity?.toString() || "");
  const [slippage, setSlippage] = useState((initialFormData as PoolWithdrawOptions & { slippage?: string })?.slippage || DEFAULT_POOL_SLIPPAGE);
  const [localError, setLocalError] = useState<string | null>(null);

  const canQuote = !!pool && toBigNumber(quantity || 0).isGreaterThan(0);
  const isAssetADivisible = assetADetails?.isDivisible ?? true;
  const isAssetBDivisible = assetBDetails?.isDivisible ?? true;
  const { data: quote, isLoading: isLoadingQuote, error: quoteError } = usePoolWithdrawQuote({
    assetA: pool?.asset_a || "",
    assetB: pool?.asset_b || "",
    quantity,
    enabled: canQuote,
  });

  const formatReceived = (value: number | string | undefined, divisible: boolean): string => {
    if (value === undefined) return "0";
    return divisible ? fromSatoshis(value.toString(), { removeTrailingZeros: true }) : value.toString();
  };

  const minQuantityA = applyPoolSlippage(quote?.quantity_a_estimate, slippage);
  const minQuantityB = applyPoolSlippage(quote?.quantity_b_estimate, slippage);
  const hasMinimums = toBigNumber(minQuantityA).isGreaterThan(0) || toBigNumber(minQuantityB).isGreaterThan(0);
  const isSlippageValid = isValidPositiveNumber(slippage, { allowZero: true, maxDecimals: 2 })
    && toBigNumber(slippage).isLessThanOrEqualTo(50);

  const submitDisabled = useMemo(() => {
    if (!pool) return true;
    if (!toBigNumber(quantity || 0).isGreaterThan(0)) return true;
    if (toBigNumber(quantity).isGreaterThan(pool.quantity_normalized ?? pool.quantity)) return true;
    if (canQuote && (isLoadingQuote || !quote?.pool_exists)) return true;
    if (!isSlippageValid) return true;
    return false;
  }, [pool, quantity, canQuote, isLoadingQuote, quote?.pool_exists, isSlippageValid]);

  const handleFormAction = (formData: FormData) => {
    if (!pool) return;
    formData.set("lp_asset", pool.lp_asset);
    formData.set("asset_a", pool.asset_a);
    formData.set("asset_b", pool.asset_b);
    formData.set("quantity", quantity);
    formData.set("min_quantity_a", minQuantityA);
    formData.set("min_quantity_b", minQuantityB);
    formAction(formData);
  };

  if (isLoading) {
    return <Spinner message="Loading pool position..." className="min-h-[240px]" />;
  }

  if (!pool) {
    if (poolError) {
      return (
        <div className="p-4">
          <ErrorAlert message={poolError.message} />
        </div>
      );
    }
    return <div className="p-4 text-center text-gray-600">Pool position not found</div>;
  }

  return (
    <ComposerForm
      formAction={handleFormAction}
      submitText="Review Withdrawal"
      submitDisabled={pending || submitDisabled}
    >
      {localError && <ErrorAlert message={localError} onClose={() => setLocalError(null)} />}

      <div className="rounded border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
        <div className="font-semibold text-gray-900">{pool.asset_a} / {pool.asset_b}</div>
        <div className="mt-1 text-gray-600">LP Asset: {pool.lp_asset}</div>
        <div className="mt-1 text-gray-600">Available: {pool.quantity_normalized ?? pool.quantity}</div>
      </div>

      <AmountWithMaxInput
        asset={pool.lp_asset}
        availableBalance={pool.quantity_normalized ?? pool.quantity.toString()}
        value={quantity}
        onChange={setQuantity}
        feeRate={feeRate}
        setError={setLocalError}
        showHelpText={showHelpText}
        sourceAddress={activeAddress}
        maxAmount={pool.quantity_normalized ?? pool.quantity.toString()}
        label="LP Tokens to Withdraw"
        name="quantity_display"
        disabled={pending}
        isDivisible
      />

      {isLoadingQuote && (
        <p className="text-sm text-gray-500">Loading withdrawal quote...</p>
      )}

      {quoteError && (
        <ErrorAlert message={quoteError} />
      )}

      {quote?.pool_exists && (
        <div className="rounded border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">
          Estimated receive:
          <div className="mt-1 font-medium text-gray-900">
            {formatReceived(quote.quantity_a_estimate, isAssetADivisible)} {pool.asset_a}
          </div>
          <div className="font-medium text-gray-900">
            {formatReceived(quote.quantity_b_estimate, isAssetBDivisible)} {pool.asset_b}
          </div>
        </div>
      )}

      {quote?.pool_exists && (
        <>
          <SlippageInput
            value={slippage}
            onChange={setSlippage}
            showHelpText={showHelpText}
          />

          {hasMinimums && (
            <div className="rounded border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">
              Minimum received after {slippage || "0"}% slippage:
              <div className="mt-1 font-medium text-gray-900">
                {formatReceived(minQuantityA, isAssetADivisible)} {pool.asset_a}
              </div>
              <div className="font-medium text-gray-900">
                {formatReceived(minQuantityB, isAssetBDivisible)} {pool.asset_b}
              </div>
            </div>
          )}
        </>
      )}

      {quote?.message && (
        <div className="rounded border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">
          {quote.message}
        </div>
      )}

      <input type="hidden" name="lp_asset" value={pool.lp_asset} />
      <input type="hidden" name="asset_a" value={pool.asset_a} />
      <input type="hidden" name="asset_b" value={pool.asset_b} />
      <input type="hidden" name="quantity" value={quantity} />
      <input type="hidden" name="min_quantity_a" value={minQuantityA} />
      <input type="hidden" name="min_quantity_b" value={minQuantityB} />
      <input type="hidden" name="slippage" value={slippage} />
    </ComposerForm>
  );
}
