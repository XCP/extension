import { Description, Field } from "@headlessui/react";
import { type ReactElement, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { useNavigate } from "react-router";
import { ComposerForm } from "@/components/composer/composer-form";
import { AssetNameInput } from "@/components/domain/asset/asset-name-input";
import { AssetSelectInput } from "@/components/domain/asset/asset-select-input";
import { AmountWithMaxInput } from "@/components/domain/balance/amount-with-max-input";
import { BalanceHeader } from "@/components/domain/balance/balance-header";
import { FaCog } from "@/components/icons";
import { ErrorAlert } from "@/components/ui/error-alert";
import { PoolHeader } from "@/components/ui/headers/pool-header";
import { useComposer } from "@/contexts/composer-context-object";
import { parseAmountDraft } from "@/core/amount-contract/amounts";
import type { TokenBalance } from "@/core/counterparty/api";
import type { PoolDepositOptions } from "@/core/counterparty/compose";
import {
  applyPoolSlippage,
  calculateInitialLpEstimate,
  calculateLimitingLpEstimate,
  resolvePoolSlippage,
} from "@/core/counterparty/pool";
import {
  fromSatoshis,
  isEqualTo,
  isGreaterThan,
  isLessThan,
  isLessThanOrEqualTo,
  isValidPositiveNumber,
} from "@/core/numeric";
import { useAssetDetails } from "@/hooks/useAssetDetails";
import { usePool } from "@/hooks/usePool";
import { usePoolDepositQuote } from "@/hooks/usePoolQuotes";
import { t } from '@/i18n';
import { PoolSlippageSettings } from "@/pages/compose/pool/pool-slippage-settings";

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
  const navigate = useNavigate();
  const [assetA, setAssetA] = useState(initialFormData?.asset_a || initialAssetA || "XCP");
  const [assetB, setAssetB] = useState(initialFormData?.asset_b || initialAssetB || "");
  const [quantityA, setQuantityA] = useState(initialFormData?.quantity_a?.toString() || "");
  const [quantityB, setQuantityB] = useState(initialFormData?.quantity_b?.toString() || "");
  const [lpAsset, setLpAsset] = useState(initialFormData?.lp_asset || "");
  const [isLpAssetValid, setIsLpAssetValid] = useState(false);
  const [slippage, setSlippage] = useState((initialFormData as PoolDepositOptions & { slippage?: string })?.slippage || resolvePoolSlippage(settings?.defaultPoolSlippage));
  const [showSettings, setShowSettings] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const { data: assetADetails } = useAssetDetails(assetA);
  const { data: assetBDetails } = useAssetDetails(assetB);
  const { data: pool, isLoading: isPoolLoading } = usePool(assetA, assetB);

  const assetADetailsReady = assetADetails?.assetInfo?.asset === assetA && typeof assetADetails.assetInfo.divisible === "boolean";
  const assetBDetailsReady = assetB ? assetBDetails?.assetInfo?.asset === assetB && typeof assetBDetails.assetInfo.divisible === "boolean" : false;
  const isAssetADivisible = assetADetailsReady ? assetADetails.isDivisible : true;
  const isAssetBDivisible = assetBDetailsReady && assetBDetails ? assetBDetails.isDivisible : true;
  const bothAssetsSelected = Boolean(assetA && assetB && assetA !== assetB);
  // The pool doesn't exist yet — known as soon as both assets resolve, before any quote.
  const isNewPool = bothAssetsSelected && !isPoolLoading && pool === null;
  const parsedA = parseAmountDraft(quantityA, { decimals: isAssetADivisible ? 8 : 0, minRaw: 1n });
  const parsedB = parseAmountDraft(quantityB, { decimals: isAssetBDivisible ? 8 : 0, minRaw: 1n });
  const validA = parsedA.status === "valid";
  const validB = parsedB.status === "valid";
  const canQuote = bothAssetsSelected && assetADetailsReady && assetBDetailsReady && validA;
  const needsQuote = canQuote && validB;
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
  const quantityARaw = parsedA.status === "valid" ? parsedA.raw.toString() : "0";
  const quantityBRaw = parsedB.status === "valid" ? parsedB.raw.toString() : "0";
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
        quantity_normalized: assetADetails.spendableBalance ?? assetADetails.availableBalance,
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
    if (!validA) return true;
    if (!validB) return true;
    if (needsQuote && (isLoadingQuote || !quote)) return true;
    if (isFirstDeposit && lpAsset && !isLpAssetValid) return true;
    if (!isSlippageValid) return true;
    return false;
  }, [assetA, assetB, assetADetailsReady, assetBDetailsReady, validA, validB, needsQuote, isLoadingQuote, quote, isFirstDeposit, lpAsset, isLpAssetValid, isSlippageValid]);

  const handleFormAction = (formData: FormData) => {
    if (assetA === assetB) {
      setLocalError(t('deposit_form_pool_assets_must_be_different'));
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

  return (
    <div className="space-y-4">
      {pool ? (
        <PoolHeader pool={pool} className="mt-1 mb-5" />
      ) : assetABalanceHeader ? (
        <BalanceHeader balance={assetABalanceHeader} className="mt-1 mb-5" pendingIncoming={assetADetails?.pendingIncoming} />
      ) : null}
      {/* Deposit/Withdraw tabs with the settings cog, mirroring the DEX order form */}
      <div className="flex justify-between items-center mb-2">
        <div className="flex space-x-4">
          <button
            type="button"
            className="text-lg font-semibold bg-transparent p-0 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 rounded underline"
            onClick={() => setShowSettings(false)}
          >
            {t('common_deposit')}
          </button>
          <button
            type="button"
            disabled={!pool?.lp_asset}
            onClick={() => pool?.lp_asset && navigate(`/compose/pool/withdraw/${encodeURIComponent(pool.lp_asset)}`)}
            className={`text-lg font-semibold bg-transparent p-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 rounded ${
              pool?.lp_asset ? "cursor-pointer" : "text-gray-400 cursor-not-allowed"
            }`}
          >
            {t('common_withdraw')}
          </button>
        </div>
        <button
          type="button"
          onClick={() => setShowSettings(!showSettings)}
          aria-label={t('common_pool_settings')}
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
          submitText={t('deposit_form_review_deposit')}
          submitDisabled={pending || submitDisabled}
        >
          {localError && <ErrorAlert message={localError} onClose={() => setLocalError(null)} />}

          <AssetSelectInput
            selectedAsset={assetA}
            onChange={setAssetA}
            label={t('deposit_form_asset_a')}
            required
            showHelpText={showHelpText}
          />

          <AmountWithMaxInput
            asset={assetA}
            availableBalance={assetADetails?.spendableBalance ?? assetADetails?.availableBalance ?? "0"}
            value={quantityA}
            onChange={setQuantityA}
            feeRate={feeRate}
            setError={setLocalError}
            showHelpText={showHelpText}
            sourceAddress={activeAddress}
            maxAmount={assetADetails?.spendableBalance ?? assetADetails?.availableBalance ?? "0"}
            label={t('common_amount')}
            name="quantity_a_display"
            disabled={pending || !assetA}
            isDivisible={isAssetADivisible}
          />

          <AssetSelectInput
            selectedAsset={assetB}
            onChange={setAssetB}
            label={t('deposit_form_asset_b')}
            required
            showHelpText={showHelpText}
          />

          <AmountWithMaxInput
            asset={assetB}
            availableBalance={assetBDetails?.spendableBalance ?? assetBDetails?.availableBalance ?? "0"}
            value={quantityB}
            onChange={setQuantityB}
            feeRate={feeRate}
            setError={setLocalError}
            showHelpText={showHelpText}
            sourceAddress={activeAddress}
            maxAmount={assetBDetails?.spendableBalance ?? assetBDetails?.availableBalance ?? "0"}
            label={t('common_amount')}
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
                  {t('deposit_form_use_quote')}
                </button>
              ) : null
            }
          />

          {isLoadingQuote && (
            <p className="text-sm text-gray-500">{t('deposit_form_loading_pool_quote')}</p>
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
              {t('deposit_form_quoted_partner_amount', [String(partnerQuantity.toString()), String(assetB)])}
            </div>
          )}

          {partnerQuantity && !isFirstDeposit && !partnerQuantityMatches && (
            <div className="rounded border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800">
              {partnerQuantityIsHigh
                ? t('deposit_form_only_the_pool_ratio_amount')
                : partnerQuantityIsLow
                  ? t('deposit_form_this_deposits_less_than_the')
                  : t('deposit_form_pool_deposits_use_the_current')}
            </div>
          )}

          {isZeroSupplyRestart && (
            <div className="rounded border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800">
              {t('deposit_form_lp_supply_is_zero_this')}
            </div>
          )}

          {hasLpMinimum && (
            <div className="rounded border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">
              
              {t('deposit_form_minimum_lp_tokens')}{" "}
              <span className="font-medium text-gray-900">
                {fromSatoshis(minLpQuantity, { removeTrailingZeros: true })}
              </span>{" "}
              
              {t('deposit_form_after')} {slippage || "0"}{t('deposit_form_slippage')}
            </div>
          )}

          {isNewPool && (
            <Field>
              <AssetNameInput
                value={lpAsset}
                onChange={setLpAsset}
                onValidationChange={setIsLpAssetValid}
                label={t('common_lp_asset')}
                required={false}
                showRandomNumeric
                showHelpText={showHelpText}
                helpText={t('deposit_form_optional_leave_blank_to_auto')}
              />
              {showHelpText && (
                <Description className="mt-2 text-sm text-gray-500">
                  {t('deposit_form_the_lp_asset_represents_your')}
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
      )}
    </div>
  );
}
