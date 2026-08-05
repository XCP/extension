import { type ReactElement, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { useNavigate } from "react-router";
import { ComposerForm } from "@/components/composer/composer-form";
import { AmountWithMaxInput } from "@/components/domain/balance/amount-with-max-input";
import { FaCog } from "@/components/icons";
import { ErrorAlert } from "@/components/ui/error-alert";
import { PoolHeader } from "@/components/ui/headers/pool-header";
import { Spinner } from "@/components/ui/spinner";
import { useComposer } from "@/contexts/composer-context-object";
import type { PoolWithdrawOptions } from "@/core/counterparty/compose";
import { applyPoolSlippage } from "@/core/counterparty/pool";
import { fromSatoshis, isGreaterThan, isLessThanOrEqualTo, isValidPositiveNumber } from "@/core/numeric";
import { DEFAULT_POOL_SLIPPAGE } from "@/core/settings";
import { useAssetDetails } from "@/hooks/useAssetDetails";
import { useLpAssetPool } from "@/hooks/useLpAssetPool";
import { usePoolWithdrawQuote } from "@/hooks/usePoolQuotes";
import { PoolSlippageSettings } from "@/pages/compose/pool/pool-slippage-settings";

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
  const { activeAddress, showHelpText, feeRate, settings } = useComposer<PoolWithdrawOptions>();
  const { pending } = useFormStatus();
  const navigate = useNavigate();
  const { data: pool, isLoading, error: poolError } = useLpAssetPool(lpAsset);
  const { data: assetADetails } = useAssetDetails(pool?.asset_a || "");
  const { data: assetBDetails } = useAssetDetails(pool?.asset_b || "");
  const [quantity, setQuantity] = useState(initialFormData?.quantity?.toString() || "");
  const [slippage, setSlippage] = useState((initialFormData as PoolWithdrawOptions & { slippage?: string })?.slippage || settings?.defaultPoolSlippage || DEFAULT_POOL_SLIPPAGE);
  const [showSettings, setShowSettings] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const canQuote = !!pool && isGreaterThan(quantity || 0, 0);
  // Readiness, not a default. `?? true` divides an indivisible reserve by 1e8 whenever details
  // are still loading or failed to load: a 10 RAREPEPE quote renders as 0.0000001 in both
  // "Estimated receive" and "Minimum received after slippage" — the figures the user checks
  // before accepting a slippage tolerance. The deposit form already guards the identical value
  // this way and blocks submit until both resolve.
  const assetADetailsReady = assetADetails?.assetInfo?.asset === pool?.asset_a;
  const assetBDetailsReady = assetBDetails?.assetInfo?.asset === pool?.asset_b;
  const isAssetADivisible = assetADetailsReady ? assetADetails?.isDivisible : undefined;
  const isAssetBDivisible = assetBDetailsReady ? assetBDetails?.isDivisible : undefined;
  const { data: quote, isLoading: isLoadingQuote, error: quoteError } = usePoolWithdrawQuote({
    assetA: pool?.asset_a || "",
    assetB: pool?.asset_b || "",
    quantity,
    enabled: canQuote,
  });

  const formatReceived = (
    value: number | string | undefined,
    divisible: boolean | undefined,
  ): string => {
    if (value === undefined) return "0";
    // Unknown divisibility has no correct rendering: the same digits are two amounts 1e8 apart.
    if (divisible === undefined) return "—";
    return divisible ? fromSatoshis(value.toString(), { removeTrailingZeros: true }) : value.toString();
  };

  const minQuantityA = applyPoolSlippage(quote?.quantity_a_estimate, slippage);
  const minQuantityB = applyPoolSlippage(quote?.quantity_b_estimate, slippage);
  const hasMinimums = isGreaterThan(minQuantityA, 0) || isGreaterThan(minQuantityB, 0);
  const isSlippageValid = isValidPositiveNumber(slippage, { allowZero: true, maxDecimals: 2 })
    && isLessThanOrEqualTo(slippage, 50);

  const submitDisabled = useMemo(() => {
    if (!pool) return true;
    if (!assetADetailsReady || !assetBDetailsReady) return true;
    if (!isGreaterThan(quantity || 0, 0)) return true;
    if (isGreaterThan(quantity, pool.quantity_normalized ?? pool.quantity)) return true;
    if (canQuote && (isLoadingQuote || !quote?.pool_exists)) return true;
    if (!isSlippageValid) return true;
    return false;
  }, [pool, assetADetailsReady, assetBDetailsReady, quantity, canQuote, isLoadingQuote, quote?.pool_exists, isSlippageValid]);

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
    <div className="space-y-4">
      <PoolHeader pool={pool} className="mt-1 mb-5" />
      {/* Deposit/Withdraw tabs with the settings cog, mirroring the DEX order form */}
      <div className="flex justify-between items-center mb-2">
        <div className="flex space-x-4">
          <button
            type="button"
            onClick={() => navigate(`/compose/pool/deposit/${encodeURIComponent(pool.asset_a)}/${encodeURIComponent(pool.asset_b)}`)}
            className="text-lg font-semibold bg-transparent p-0 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 rounded"
          >
            Deposit
          </button>
          <button
            type="button"
            className="text-lg font-semibold bg-transparent p-0 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 rounded underline"
            onClick={() => setShowSettings(false)}
          >
            Withdraw
          </button>
        </div>
        <button
          type="button"
          onClick={() => setShowSettings(!showSettings)}
          aria-label="Pool Settings"
          className={`p-2 hover:bg-gray-100 rounded-full transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
            showSettings ? "bg-gray-100" : ""
          }`}
        >
          <FaCog className="size-4 text-gray-600" aria-hidden="true" />
        </button>
      </div>
      {showSettings ? (
        <PoolSlippageSettings
          value={slippage}
          onChange={setSlippage}
          onBack={() => setShowSettings(false)}
          showHelpText={showHelpText}
        />
      ) : (
        <ComposerForm
          formAction={handleFormAction}
          submitText="Review Withdrawal"
          submitDisabled={pending || submitDisabled}
        >
          {localError && <ErrorAlert message={localError} onClose={() => setLocalError(null)} />}

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

          {quote?.pool_exists && hasMinimums && (
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
      )}
    </div>
  );
}
