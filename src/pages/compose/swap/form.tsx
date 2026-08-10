import { type ReactElement, type ReactNode, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { ComposerForm } from "@/components/composer/composer-form";
import { AddressHeader } from "@/components/domain/address/address-header";
import { AssetSelectInput } from "@/components/domain/asset/asset-select-input";
import { AmountWithMaxInput } from "@/components/domain/balance/amount-with-max-input";
import { FaCog, LuArrowDownUp } from "@/components/icons";
import { ErrorAlert } from "@/components/ui/error-alert";
import { FeeRateInput } from "@/components/ui/inputs/fee-rate-input";
import { useComposer } from "@/contexts/composer-context-object";
import { useSettings } from "@/contexts/settings-context";
import type { PoolQuote } from "@/core/counterparty/api";
import type { OrderOptions } from "@/core/counterparty/compose";
import {
  applyPoolSlippage,
  describeSwapQuoteOutcome,
  readSwapQuoteOutcome,
  resolvePoolSlippage,
} from "@/core/counterparty/pool";
import { formatAmount } from "@/core/format";
import {
  fromSatoshis,
  isGreaterThan,
  isLessThanOrEqualTo,
  isValidPositiveNumber,
  toBigNumber,
} from "@/core/numeric";
import { POOL_SLIPPAGE_AUTO } from "@/core/settings";
import { useAssetDetails } from "@/hooks/useAssetDetails";
import { usePool } from "@/hooks/usePool";
import { usePoolSwapQuote } from "@/hooks/usePoolQuotes";
import { SlippageInput } from "@/pages/compose/pool/slippage-input";

interface SwapFormProps {
  formAction: (formData: FormData) => void;
  initialFormData: OrderOptions | null;
  initialGiveAsset?: string;
  initialGetAsset?: string;
}

/** Everything the UI needs from a usable quote, in display units. */
interface QuoteView {
  estimated: string;
  minReceived: string;
  price: string | null;
  impact: number | null;
  poolFee: { bps: number; amount: string | null } | null;
  route: string;
}

const CARD_CLASS = "bg-white rounded-lg shadow-lg p-3 sm:p-4 space-y-4";

/**
 * Swaps are immediate-or-cancel: the order matches whatever it can (within the
 * slippage-derived minimum price) as soon as it confirms, and any unfilled
 * remainder expires one block later and is refunded — it never rests on the
 * book. Expiration counts from confirmation, so mempool time doesn't eat it.
 */
const SWAP_EXPIRATION_BLOCKS = 1;

/** Raw satoshi quantity → display units for the given divisibility. */
function toDisplayUnits(sats: number | string, divisible: boolean): string {
  return divisible
    ? fromSatoshis(sats, { removeTrailingZeros: true })
    : toBigNumber(sats).toString();
}

/** "Pool", "3 orders", or "Pool + 3 orders" depending on where the fill comes from. */
function routeLabel(quote: PoolQuote): string {
  const orders = quote.book_orders_matched ?? 0;
  const orderText = `${orders} order${orders === 1 ? "" : "s"}`;
  if ((quote.book_output ?? 0) <= 0) return "Pool";
  return quote.pool_exists && (quote.pool_output ?? 0) > 0 ? `Pool + ${orderText}` : orderText;
}

function DetailRow({
  label,
  value,
  valueClass = "text-gray-900",
}: {
  label: ReactNode;
  value: ReactNode;
  valueClass?: string;
}): ReactElement {
  return (
    <div className="flex justify-between">
      <span>{label}</span>
      <span className={`font-medium ${valueClass}`}>{value}</span>
    </div>
  );
}

/**
 * Swap form: sell a fixed amount of one asset for a quoted amount of another,
 * routed by the protocol across the AMM pool and the resting order book.
 *
 * Under the hood this composes a regular DEX order whose get_quantity is the
 * quoted output minus the slippage tolerance — order matching guarantees
 * best-price execution against pool and book, so the order's implied price
 * acts as the minimum-received guard.
 */
export function SwapForm({
  formAction,
  initialFormData,
  initialGiveAsset,
  initialGetAsset,
}: SwapFormProps): ReactElement {
  const { activeAddress, activeWallet, showHelpText, feeRate, setFeeRate, settings } = useComposer<OrderOptions>();
  const { updateSettings } = useSettings();
  const { pending } = useFormStatus();

  // ---- Form state (restored from initialFormData when returning from review) ----
  const [giveAsset, setGiveAsset] = useState(
    initialFormData?.give_asset || initialGiveAsset || "",
  );
  const [getAsset, setGetAsset] = useState(
    initialFormData?.get_asset || initialGetAsset || "XCP",
  );
  const [amount, setAmount] = useState(initialFormData?.give_quantity?.toString() || "");
  // The stored setting, which is either a percent or "auto" — not two settings. Resolved against
  // the live quote below.
  const [slippageSetting, setSlippageSetting] = useState(
    (initialFormData as (OrderOptions & { slippage?: string }) | null)?.slippage
      || settings?.defaultPoolSlippage
      || POOL_SLIPPAGE_AUTO,
  );
  const [showDetails, setShowDetails] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  // ---- Pair and asset data ----
  const { data: giveDetails } = useAssetDetails(giveAsset);
  const { data: getDetails } = useAssetDetails(getAsset);
  const giveDetailsReady = giveDetails?.assetInfo?.asset === giveAsset;
  const isGiveDivisible = giveDetailsReady && giveDetails ? giveDetails.isDivisible : true;
  const isGetDivisible = getDetails?.assetInfo?.asset === getAsset ? getDetails.isDivisible : true;
  const availableBalance = giveDetailsReady && giveDetails ? giveDetails.availableBalance : "";

  const hasBtc = giveAsset === "BTC" || getAsset === "BTC";
  const pairSelected = Boolean(giveAsset && getAsset && giveAsset !== getAsset);
  const pairUsable = pairSelected && !hasBtc;

  const { data: pool, isLoading: isPoolLoading } = usePool(
    pairUsable ? giveAsset : undefined,
    pairUsable ? getAsset : undefined,
  );
  const noPool = pairUsable && !isPoolLoading && pool === null;

  // ---- Quote ----
  const canQuote = pairUsable && giveDetailsReady && isGreaterThan(amount || 0, 0);
  const { data: quote, isLoading: isLoadingQuote, error: quoteError } = usePoolSwapQuote({
    giveAsset,
    getAsset,
    quantity: amount,
    isGiveDivisible,
    enabled: canQuote,
  });
  // Why this quote came back empty, when it did. A zero output means "no pool" and "your amount
  // is too small for this pool" alike, and those want opposite advice.
  const outcome = readSwapQuoteOutcome(quote);
  const outcomeMessage = quote && !isLoadingQuote
    ? describeSwapQuoteOutcome(outcome, { giveAsset, getAsset })
    : null;
  const unfilled = outcome === "partial";

  // Auto reads the tolerance off this quote's own price impact; a stored percent is used as-is.
  const slippage = resolvePoolSlippage(slippageSetting, quote?.price_impact);

  // Null until the quote produces actual output; all values in display units.
  const quoteView = useMemo<QuoteView | null>(() => {
    const estimatedSats = quote?.estimated_output ?? 0;
    if (!quote || estimatedSats <= 0) return null;

    const estimated = toDisplayUnits(estimatedSats, isGetDivisible);
    const priceRatio = isGreaterThan(amount || 0, 0)
      ? toBigNumber(estimated).dividedBy(toBigNumber(amount))
      : null;
    const priceValid = priceRatio?.isFinite() && priceRatio.isGreaterThan(0);

    return {
      estimated,
      minReceived: toDisplayUnits(applyPoolSlippage(estimatedSats, slippage), isGetDivisible),
      // Computed in display units: the API's effective_price is a raw satoshi
      // ratio, which is wrong across mixed divisibility.
      price: priceValid && priceRatio
        ? formatAmount({
            value: priceRatio.toNumber(),
            maximumFractionDigits: priceRatio.isGreaterThanOrEqualTo(1) ? 4 : 8,
          })
        : null,
      impact: typeof quote.price_impact === "number" ? quote.price_impact : null,
      poolFee: quote.pool_exists && typeof quote.fee_bps === "number"
        ? {
            bps: quote.fee_bps,
            amount: quote.fee_amount
              ? toDisplayUnits(quote.fee_amount, isGiveDivisible)
              : null,
          }
        : null,
      route: routeLabel(quote),
    };
  }, [quote, amount, slippage, isGetDivisible, isGiveDivisible]);

  // ---- Submission ----
  const isSlippageValid =
    isValidPositiveNumber(slippage, { allowZero: true, maxDecimals: 2 })
    && isLessThanOrEqualTo(slippage, 50);

  const submitDisabled =
    !pairUsable
    || !isGreaterThan(amount || 0, 0)
    || isLoadingQuote
    || !quoteView
    || unfilled
    || !isSlippageValid
    || Boolean(availableBalance && isGreaterThan(amount, availableBalance));

  // ---- Handlers ----
  const handleFlip = () => {
    setGiveAsset(getAsset);
    setGetAsset(giveAsset);
    setAmount("");
  };

  // Selecting the counterparty asset on either side swaps the two.
  const handleGiveAssetChange = (asset: string) => {
    if (asset === getAsset) setGetAsset(giveAsset);
    setGiveAsset(asset);
  };
  const handleGetAssetChange = (asset: string) => {
    if (asset === giveAsset) setGiveAsset(getAsset);
    setGetAsset(asset);
  };

  // Edits apply to this swap immediately and persist as the user's default,
  // same as the pool deposit/withdraw settings panel.
  const handleSlippageChange = (next: string) => {
    setSlippageSetting(next);
    void updateSettings({ defaultPoolSlippage: next });
  };

  const priceRowText = quoteView?.price
    ? `1 ${giveAsset} ≈ ${quoteView.price} ${getAsset}`
    : isLoadingQuote
      ? "Fetching quote…"
      : `1 ${giveAsset || "—"} = —`;

  // The API reports impact as positive-when-worse; flip the sign so the label
  // reads like a gain/loss ("Impact: -1.8%" = you receive 1.8% under spot).
  const signedImpact = quoteView?.impact !== null && quoteView?.impact !== undefined
    ? -quoteView.impact
    : null;
  const impactClass = signedImpact === null
    ? ""
    : signedImpact < -5
      ? "text-red-600"
      : signedImpact > 0
        ? "text-green-600"
        : "text-gray-500";

  return (
    <ComposerForm
      formAction={formAction}
      header={
        activeAddress && (
          <AddressHeader
            address={activeAddress.address}
            walletName={activeWallet?.name ?? ""}
            className="mt-1 mb-5"
          />
        )
      }
      submitText="Review Swap"
      submitDisabled={pending || submitDisabled}
      showFeeRate={false}
      containerClassName=""
    >
      {validationError && (
        <ErrorAlert message={validationError} onClose={() => setValidationError(null)} />
      )}
      {hasBtc && (
        <ErrorAlert message="BTC pairs are not supported for swaps. Use a DEX order instead." />
      )}
      {noPool && (
        <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
          No liquidity pool exists for {giveAsset}/{getAsset}. Swaps for this
          pair can only fill from resting DEX orders.
        </div>
      )}

      {/* You Send */}
      <div className={CARD_CLASS}>
        <AssetSelectInput
          selectedAsset={giveAsset}
          onChange={handleGiveAssetChange}
          label="You Send"
          description="Asset you are selling."
          showHelpText={showHelpText}
          required
        />
        <AmountWithMaxInput
          asset={giveAsset}
          availableBalance={availableBalance}
          value={amount}
          onChange={setAmount}
          feeRate={feeRate}
          setError={setValidationError}
          showHelpText={showHelpText}
          sourceAddress={activeAddress}
          maxAmount={availableBalance}
          label="Amount"
          name="amount_display"
          description={`Amount to sell. ${isGiveDivisible ? "Enter up to 8 decimal places." : "Enter whole numbers only."}`}
          disabled={pending}
          isDivisible={isGiveDivisible}
          labelRight={
            availableBalance ? (
              <span className="text-xs text-gray-500 font-normal">
                Balance: {formatAmount({ value: availableBalance, maximumFractionDigits: 8 })}
              </span>
            ) : undefined
          }
        />
      </div>

      {/* Flip direction — a bare icon between the two cards */}
      <div className="flex justify-center">
        <button
          type="button"
          onClick={handleFlip}
          aria-label="Flip swap direction"
          className="p-1 rounded text-gray-500 hover:text-gray-700 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <LuArrowDownUp className="size-4" aria-hidden="true" />
        </button>
      </div>

      {/* You Receive */}
      <div className={CARD_CLASS}>
        <AssetSelectInput
          selectedAsset={getAsset}
          onChange={handleGetAssetChange}
          label="You Receive"
          description="Asset you are buying."
          showHelpText={showHelpText}
          required
        />
        <div>
          <label htmlFor="swap-receive-estimate" className="text-sm font-medium text-gray-700 flex justify-between items-center">
            <span>Amount <span className="text-red-500">*</span></span>
            {signedImpact !== null && (
              <span className={`text-xs font-normal ${impactClass}`}>
                Impact: {signedImpact > 0 ? "+" : ""}{formatAmount({ value: signedImpact, maximumFractionDigits: 2 })}%
              </span>
            )}
          </label>
          <input
            id="swap-receive-estimate"
            type="text"
            value={quoteView?.estimated ?? ""}
            placeholder={isGetDivisible ? "0.00000000" : "0"}
            disabled
            aria-live="polite"
            aria-label="Estimated amount received"
            className="mt-1 block w-full p-2.5 rounded-md border border-gray-300 bg-gray-100 text-gray-900 cursor-not-allowed"
          />
        </div>
      </div>

      {quoteError && <ErrorAlert message={quoteError} />}
      {canQuote && !isLoadingQuote && quote && !quoteView && (
        <div className="rounded border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">
          {/* The endpoint's own message wins when it has one, but it does not send one for a
              zero-output quote — which is the case that was being described wrongly. */}
          {quote.message || outcomeMessage}
        </div>
      )}

      {/* Price summary bar; the gear expands quote details + settings */}
      {pairUsable && (
        <div className="rounded-lg bg-white shadow-sm border border-gray-200">
          <div className="flex items-center justify-between p-3">
            <span className="text-sm font-medium text-gray-900">{priceRowText}</span>
            <button
              type="button"
              onClick={() => setShowDetails((prev) => !prev)}
              aria-label={showDetails ? "Hide swap details" : "Show swap details"}
              aria-expanded={showDetails}
              className="shrink-0 p-1 rounded-full hover:bg-gray-100 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              <FaCog className="size-4 text-gray-600" aria-hidden="true" />
            </button>
          </div>
          {/* hidden, not unmounted: SlippageInput keeps its custom-entry state while closed */}
          <div className={showDetails ? "border-t border-gray-200 p-3 space-y-3 text-sm text-gray-600" : "hidden"}>
            {quoteView && (
              <>
                <DetailRow
                  label="Minimum received"
                  value={`${formatAmount({ value: quoteView.minReceived, maximumFractionDigits: 8 })} ${getAsset}`}
                />
                {quoteView.poolFee && (
                  <DetailRow
                    label={`Pool fee (${(quoteView.poolFee.bps / 100).toFixed(2)}%)`}
                    value={quoteView.poolFee.amount ? `${quoteView.poolFee.amount} ${giveAsset}` : "—"}
                  />
                )}
                <DetailRow label="Route" value={quoteView.route} />
              </>
            )}
            <div className="border-t border-gray-200 pt-3">
              <SlippageInput
                value={slippageSetting}
                onChange={handleSlippageChange}
                showHelpText={showHelpText}
                offerAuto
                resolvedValue={slippage}
              />
            </div>
          </div>
          {/* Fee rate stays visible whether or not the details are expanded */}
          <div className="border-t border-gray-200 p-3">
            <FeeRateInput
              showHelpText={showHelpText}
              disabled={pending}
              initialValue={feeRate}
              onFeeRateChange={setFeeRate}
            />
          </div>
        </div>
      )}

      {unfilled && outcomeMessage && (
        <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
          {outcomeMessage}
        </div>
      )}

      <input type="hidden" name="give_asset" value={giveAsset} />
      <input type="hidden" name="get_asset" value={getAsset} />
      <input type="hidden" name="give_quantity" value={amount} />
      <input type="hidden" name="get_quantity" value={quoteView?.minReceived ?? ""} />
      <input type="hidden" name="expiration" value={SWAP_EXPIRATION_BLOCKS} />
      <input type="hidden" name="slippage" value={slippage} />
    </ComposerForm>
  );
}
