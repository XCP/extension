"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import { FaCog } from "react-icons/fa";
import { OrderSettings } from "@/pages/settings/order-settings";
import { ComposerForm } from "@/components/composer-form";
import { AmountWithMaxInput } from "@/components/inputs/amount-with-max-input";
import { AssetSelectInput } from "@/components/inputs/asset-select-input";
import { PriceWithSuggestInput } from "@/components/inputs/price-with-suggest-input";
import { BalanceHeader } from "@/components/headers/balance-header";
import { useComposer } from "@/contexts/composer-context";
import { useAssetDetails } from "@/hooks/useAssetDetails";
import { toBigNumber } from "@/utils/numeric";
import { formatAmount } from "@/utils/format";
import { ErrorAlert } from "@/components/error-alert";
import type { OrderOptions } from "@/utils/blockchain/counterparty";
import type { ReactElement } from "react";

interface TradingPairData {
  last_trade_price: string | null;
  name: string;
}

// Extended type for form data that includes user-facing fields
interface OrderFormData extends OrderOptions {
  type?: "buy" | "sell";
  amount?: string;
  price?: string;
  quote_asset?: string;
}

/**
 * Props for the OrderForm component, aligned with Composer's formAction.
 */
interface OrderFormProps {
  formAction: (formData: FormData) => void;
  initialFormData: OrderFormData | null;
  giveAsset: string;
}

/**
 * Form for creating a buy/sell order using React 19 Actions.
 */
export function OrderForm({
  formAction,
  initialFormData,
  giveAsset,
}: OrderFormProps): ReactElement {
  // Context hooks
  const { activeAddress, settings, showHelpText } = useComposer();
  
  // Data fetching hooks
  const { data: giveAssetDetails } = useAssetDetails(giveAsset);
  const { data: orderAssetDetails } = useAssetDetails(initialFormData?.quote_asset || (giveAsset === "XCP" ? "BTC" : "XCP"));
  const { data: getAssetDetails } = useAssetDetails(
    (initialFormData?.type === "buy" || (!initialFormData?.type && true)) ? giveAsset : (initialFormData?.quote_asset || (giveAsset === "XCP" ? "BTC" : "XCP"))
  );
  
  // Local error state management for form-specific errors
  const [validationError, setValidationError] = useState<string | null>(null);
  
  // Tab state
  const [activeTab, setActiveTab] = useState<"buy" | "sell" | "settings">(
    initialFormData?.type === "sell" ? "sell" : initialFormData?.type === "buy" ? "buy" : "buy"
  );
  const [previousTab, setPreviousTab] = useState<"buy" | "sell">(
    initialFormData?.type === "sell" ? "sell" : "buy"
  );
  const [tabLoading, setTabLoading] = useState(false);
  
  // Form state
  const [price, setPrice] = useState<string>(initialFormData?.price || "");
  const [amount, setAmount] = useState<string>(initialFormData?.amount || "");
  const [customExpiration, setCustomExpiration] = useState<number | undefined>(initialFormData?.expiration || undefined);
  const [customFeeRequired, setCustomFeeRequired] = useState<number>(initialFormData?.fee_required || 0);
  const [quoteAsset, setQuoteAsset] = useState<string>(initialFormData?.quote_asset || (giveAsset === "XCP" ? "BTC" : "XCP"));
  
  // Trading state
  const [isPairFlipped, setIsPairFlipped] = useState(false);
  const [tradingPairData, setTradingPairData] = useState<TradingPairData | null>(null);
  
  // Computed values
  const isGiveAssetDivisible = giveAssetDetails?.isDivisible ?? true;
  const isGetAssetDivisible = getAssetDetails?.isDivisible ?? true;
  const availableBalance = giveAssetDetails?.availableBalance ?? "0";
  const orderAssetBalance = orderAssetDetails?.availableBalance ?? "0";
  const isBuy = activeTab === "buy";
  
  // Effects

  // Focus amount input on mount
  useEffect(() => {
    if (!tabLoading) {
      const input = document.querySelector("input[name='amount']") as HTMLInputElement;
      input?.focus();
    }
  }, [tabLoading]);

  // Fetch trading pair data
  useEffect(() => {
    const fetchTradingPairData = async () => {
      if (!giveAsset || !quoteAsset) return;

      try {
        const give = isBuy ? quoteAsset : giveAsset;
        const get = isBuy ? giveAsset : quoteAsset;
        const response = await axios.get(`https://app.xcp.io/api/v1/swap/${give}/${get}`);
        const lastTradePrice = response.data?.data?.trading_pair?.last_trade_price || null;
        const tradingPairName = response.data?.data?.trading_pair?.name || "";
        setTradingPairData({ last_trade_price: lastTradePrice, name: tradingPairName });
      } catch (err) {
        console.error("Failed to fetch trading pair data:", err);
        setTradingPairData(null);
      }
    };

    fetchTradingPairData();
  }, [giveAsset, quoteAsset, isBuy]);

  // Handlers
  const handleTabChange = (newTab: "buy" | "sell" | "settings") => {
    if (newTab !== "settings") {
      setTabLoading(true);
      setTimeout(() => setTabLoading(false), 150);
      setPreviousTab(newTab); // Remember the last buy/sell tab
      setAmount(""); // Reset amount when switching between buy/sell
    }
    setActiveTab(newTab);
  };

  const handlePriceChange = (newPrice: string) => {
    setPrice(newPrice);
  };

  return (
    <div className="space-y-4">
      {activeAddress && giveAssetDetails && (
        <BalanceHeader
          balance={{
            asset: giveAsset,
            quantity_normalized: giveAssetDetails.availableBalance,
            asset_info: giveAssetDetails.assetInfo ? {
              asset_longname: giveAssetDetails.assetInfo.asset_longname,
              description: giveAssetDetails.assetInfo.description || '',
              issuer: giveAssetDetails.assetInfo.issuer || 'Unknown',
              divisible: giveAssetDetails.assetInfo.divisible,
              locked: giveAssetDetails.assetInfo.locked,
              supply: giveAssetDetails.assetInfo.supply,
            } : undefined,
          }}
          className="mt-1 mb-5"
        />
      )}
      <div className="flex justify-between items-center mb-2">
        <div className="flex space-x-4">
          <button
            type="button"
            className={`text-lg font-semibold bg-transparent p-0 cursor-pointer focus:outline-none ${
              activeTab === "buy" || (activeTab === "settings" && previousTab === "buy") ? "underline" : ""
            }`}
            onClick={() => handleTabChange("buy")}
            disabled={false}
          >
            Buy
          </button>
          <button
            type="button"
            className={`text-lg font-semibold bg-transparent p-0 cursor-pointer focus:outline-none ${
              activeTab === "sell" || (activeTab === "settings" && previousTab === "sell") ? "underline" : ""
            }`}
            onClick={() => handleTabChange("sell")}
            disabled={false}
          >
            Sell
          </button>
        </div>
        <button
          type="button"
          className={`p-2 hover:bg-gray-100 rounded-full transition-colors ${
            activeTab === "settings" ? "bg-gray-100" : ""
          }`}
          onClick={() => activeTab === "settings" ? handleTabChange(previousTab) : handleTabChange("settings")}
          disabled={false}
          aria-label="Order Settings"
        >
          <FaCog className="w-4 h-4 text-gray-600" aria-hidden="true" />
        </button>
      </div>
      {tabLoading ? (
        <div className="flex justify-center items-center h-[21rem]">Loading...</div>
      ) : activeTab === "settings" ? (
        <OrderSettings 
          customExpiration={customExpiration}
          onExpirationChange={setCustomExpiration}
          customFeeRequired={customFeeRequired}
          onFeeRequiredChange={setCustomFeeRequired}
          isBuyingBTC={previousTab === "buy" && giveAsset === "BTC"}
        />
      ) : (
        <ComposerForm
          formAction={(formData) => {
            // Store user-facing values for form persistence
            formData.set('amount', amount);
            formData.set('price', price);
            formData.set('type', activeTab);
            formData.set('quote_asset', quoteAsset);
            
            // Calculate give_quantity and get_quantity based on buy/sell
            const amountBN = toBigNumber(amount);
            const priceBN = toBigNumber(price);
            
            if (amountBN.isGreaterThan(0) && priceBN.isGreaterThan(0)) {
              if (isBuy) {
                // Buying: give quote asset, get base asset
                // give_quantity = amount * price (in quote asset)
                // get_quantity = amount (in base asset)
                const giveQty = amountBN.multipliedBy(priceBN);
                const getQty = amountBN;
                
                formData.set('give_quantity', giveQty.toString());
                formData.set('get_quantity', getQty.toString());
              } else {
                // Selling: give base asset, get quote asset
                // give_quantity = amount (in base asset)
                // get_quantity = amount * price (in quote asset)
                const giveQty = amountBN;
                const getQty = amountBN.multipliedBy(priceBN);
                
                formData.set('give_quantity', giveQty.toString());
                formData.set('get_quantity', getQty.toString());
              }
            } else {
              // If amount or price is 0 or invalid, set quantities to 0
              formData.set('give_quantity', '0');
              formData.set('get_quantity', '0');
            }
            
            formAction(formData);
          }}
        >
          {validationError && (
            <div className="mb-4">
              <ErrorAlert
                message={validationError}
                onClose={() => setValidationError(null)}
              />
            </div>
          )}
            <input type="hidden" name="give_asset" value={isBuy ? quoteAsset : giveAsset} />
            <input type="hidden" name="get_asset" value={isBuy ? giveAsset : quoteAsset} />
            <input type="hidden" name="expiration" value={customExpiration || settings?.defaultOrderExpiration || 8064} />
            {isBuy && giveAsset === "BTC" && (
              <input type="hidden" name="fee_required" value={customFeeRequired} />
            )}
            <AmountWithMaxInput
              asset={giveAsset}
              availableBalance={isBuy ? "" : availableBalance}
              value={amount}
              onChange={setAmount}
              sat_per_vbyte={initialFormData?.sat_per_vbyte || 0.1}
              setError={setValidationError}
              showHelpText={showHelpText}
              sourceAddress={activeAddress}
              maxAmount={isBuy ? (price ? formatAmount({
                value: toBigNumber(orderAssetBalance).dividedBy(toBigNumber(price)).toNumber(),
                maximumFractionDigits: isGetAssetDivisible ? 8 : 0,
                minimumFractionDigits: 0
              }) : "") : availableBalance}
              disableMaxButton={isBuy && !price}
              label="Amount"
              name="amount"
              description={`Amount to ${isBuy ? "buy" : "sell"}. ${isBuy ? (isGetAssetDivisible ? "Enter up to 8 decimal places." : "Enter whole numbers only.") : (isGiveAssetDivisible ? "Enter up to 8 decimal places." : "Enter whole numbers only.")}`}
              disabled={false}
            />
            <AssetSelectInput
              selectedAsset={quoteAsset}
              onChange={setQuoteAsset}
              label="Quote"
              showHelpText={showHelpText}
            />
            <PriceWithSuggestInput
              value={price}
              onChange={handlePriceChange}
              tradingPairData={tradingPairData}
              showHelpText={showHelpText}
              label="Price"
              name="price"
              priceDescription={`Price per unit in ${quoteAsset}`}
              showPairFlip={true}
              isPairFlipped={isPairFlipped}
              setIsPairFlipped={setIsPairFlipped}
            />
        </ComposerForm>
      )}
    </div>
  );
}
