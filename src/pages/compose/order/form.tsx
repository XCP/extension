import axios from "axios";
import React, { useState, useRef, useEffect, useMemo, FormEvent } from "react";
import { FaCog } from "react-icons/fa";
import { Button } from "@/components/button";
import { AmountWithMaxInput } from "@/components/inputs/amount-with-max-input";
import { AssetSelectInput } from "@/components/inputs/asset-select-input";
import { FeeRateInput } from "@/components/inputs/fee-rate-input";
import { PriceWithSuggestInput } from "@/components/inputs/price-with-suggest-input";
import { useSettings } from "@/contexts/settings-context";
import { useWallet } from "@/contexts/wallet-context";
import { OrderOptions } from "@/utils/blockchain/counterparty";
import { toBigNumber, formatBigNumber } from "@/utils/numeric";
import { fetchAssetDetailsAndBalance } from "@/utils/blockchain/counterparty";
import { BalanceHeader } from "@/components/headers/balance-header";
import { useAssetDetails } from "@/hooks/useAssetDetails";

interface OrderFormDataInternal {
  type: "buy" | "sell";
  amount: string;
  asset: string;
  price: string;
  sat_per_vbyte: number;
}

interface TradingPairData {
  last_trade_price: string | null;
  name: string;
}

interface OrderFormProps {
  onSubmit: (data: OrderOptions) => void;
  initialFormData?: OrderOptions;
  giveAsset: string;
  setError: (error: string | null) => void;
}

export function OrderForm({
  onSubmit,
  initialFormData,
  giveAsset,
  setError,
}: OrderFormProps) {
  const { activeAddress } = useWallet();
  const { settings } = useSettings();
  const shouldShowHelpText = settings?.showHelpText ?? false;

  const [formData, setFormData] = useState<OrderFormDataInternal>(() => ({
    type: initialFormData?.give_quantity ? "sell" : "buy",
    amount: initialFormData?.give_quantity?.toString() || initialFormData?.get_quantity?.toString() || "",
    asset: initialFormData?.get_asset || (giveAsset === "XCP" ? "BTC" : "XCP"),
    price: "",
    sat_per_vbyte: initialFormData?.sat_per_vbyte || 1,
  }));
  const [showMaxError, setShowMaxError] = useState(false);
  const [tabLoading, setTabLoading] = useState(false);
  const [isPairFlipped, setIsPairFlipped] = useState(false);
  const [tradingPairData, setTradingPairData] = useState<TradingPairData | null>(null);
  const [availableBalance, setAvailableBalance] = useState<string>("0");
  const [orderAssetBalance, setOrderAssetBalance] = useState<string>("0");
  const [isGiveAssetDivisible, setIsGiveAssetDivisible] = useState<boolean>(true);
  const [isOrderAssetDivisible, setIsOrderAssetDivisible] = useState<boolean>(true);
  const [isGetAssetDivisible, setIsGetAssetDivisible] = useState<boolean>(true);

  const amountInputRef = useRef<HTMLInputElement>(null);

  const { data: giveAssetDetails } = useAssetDetails(giveAsset);

  useEffect(() => {
    if (!tabLoading) amountInputRef.current?.focus();
  }, [tabLoading]);

  // Fetch asset details and balances
  useEffect(() => {
    const fetchDetails = async () => {
      if (!giveAsset || !activeAddress?.address) return;

      try {
        const {
          isDivisible: giveDivisible,
          availableBalance: giveBalance,
        } = await fetchAssetDetailsAndBalance(giveAsset, activeAddress.address);
        setIsGiveAssetDivisible(giveDivisible);
        setAvailableBalance(giveBalance);

        if (formData.asset) {
          const {
            isDivisible: orderDivisible,
            availableBalance: orderBalance,
          } = await fetchAssetDetailsAndBalance(formData.asset, activeAddress.address);
          setIsOrderAssetDivisible(orderDivisible);
          setOrderAssetBalance(orderBalance);
        }

        const currentGetAsset = formData.type === "buy" ? giveAsset : formData.asset;
        const { isDivisible: getDivisible } = await fetchAssetDetailsAndBalance(
          currentGetAsset,
          activeAddress.address
        );
        setIsGetAssetDivisible(getDivisible);
      } catch (err) {
        console.error("Failed to fetch asset details:", err);
        setError("Failed to fetch asset details");
      }
    };

    fetchDetails();
  }, [giveAsset, formData.type, formData.asset, activeAddress?.address, setError]);

  // Fetch trading pair data
  useEffect(() => {
    const fetchTradingPairData = async () => {
      if (!giveAsset || !formData.asset) return;

      try {
        const give = formData.type === "buy" ? formData.asset : giveAsset;
        const get = formData.type === "buy" ? giveAsset : formData.asset;
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
  }, [giveAsset, formData.asset, formData.type]);

  const isBuy = formData.type === "buy";

  const maxAmount = useMemo(() => {
    if (isBuy && formData.price && orderAssetBalance) {
      const priceBN = toBigNumber(formData.price);
      const orderBalanceBN = toBigNumber(orderAssetBalance);
      let effectivePrice = priceBN;
      if (isPairFlipped) {
        if (priceBN.isZero()) return "";
        effectivePrice = toBigNumber(1).dividedBy(priceBN);
      }
      if (effectivePrice.isZero()) return "";
      const max = orderBalanceBN.dividedBy(effectivePrice);
      return isGetAssetDivisible ? formatBigNumber(max) : max.floor().toFixed(0);
    } else if (!isBuy) {
      return isGiveAssetDivisible ? availableBalance : toBigNumber(availableBalance).floor().toFixed(0);
    }
    return "";
  }, [
    isBuy,
    formData.price,
    orderAssetBalance,
    availableBalance,
    isPairFlipped,
    isGiveAssetDivisible,
    isGetAssetDivisible,
  ]);

  const isMaxAvailable = isBuy ? Boolean(formData.price) : true;

  const handleMaxClick = () => {
    if (isBuy && !formData.price) {
      setShowMaxError(true);
    } else if (maxAmount) {
      setFormData((prev) => ({ ...prev, amount: maxAmount }));
    }
  };

  const handleOrderTypeChange = (type: "buy" | "sell") => {
    setTabLoading(true);
    setFormData((prev) => ({ ...prev, type }));
    setTimeout(() => setTabLoading(false), 150);
  };

  useEffect(() => {
    setShowMaxError(false);
  }, [formData.type, formData.price]);

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!formData.amount || Number(formData.amount) <= 0) {
      setError("Amount must be greater than zero.");
      return;
    }
    if (!formData.asset) {
      setError("Quote asset is required.");
      return;
    }
    if (!formData.price || Number(formData.price) <= 0) {
      setError("Price must be greater than zero.");
      return;
    }
    if (formData.sat_per_vbyte <= 0) {
      setError("Fee rate must be greater than zero.");
      return;
    }
    setError(null);

    const quantityNum = Number(formData.amount);
    const priceNum = Number(formData.price);
    const giveQty = isBuy
      ? isOrderAssetDivisible
        ? Math.round(quantityNum * priceNum * 1e8)
        : Math.floor(quantityNum * priceNum)
      : isGiveAssetDivisible
      ? Math.round(quantityNum * 1e8)
      : Math.floor(quantityNum);
    const getQty = isBuy
      ? isGetAssetDivisible
        ? Math.round(quantityNum * 1e8)
        : Math.floor(quantityNum)
      : isGetAssetDivisible
      ? Math.round(quantityNum * priceNum * 1e8)
      : Math.floor(quantityNum * priceNum);

    const submissionData: OrderOptions = {
      sourceAddress: activeAddress?.address || "",
      give_asset: isBuy ? formData.asset : giveAsset,
      give_quantity: giveQty,
      get_asset: isBuy ? giveAsset : formData.asset,
      get_quantity: getQty,
      expiration: 8064, // Default from old version
      sat_per_vbyte: formData.sat_per_vbyte,
    };
    onSubmit(submissionData);
  };

  const amountDescription = `Amount to ${isBuy ? "buy" : "sell"}. ${
    isBuy
      ? isGetAssetDivisible
        ? "Enter up to 8 decimal places."
        : "Enter whole numbers only."
      : isGiveAssetDivisible
      ? "Enter up to 8 decimal places."
      : "Enter whole numbers only."
  }`;

  return (
    <div className="space-y-4">
      {activeAddress && giveAssetDetails && (
        <BalanceHeader
          balance={{
            asset: giveAsset,
            quantity_normalized: giveAssetDetails.availableBalance,
            asset_info: giveAssetDetails.assetInfo || undefined,
          }}
          className="mb-2"
        />
      )}

      <div className="flex justify-between items-center mb-2">
        <div className="flex space-x-4">
          <button
            type="button"
            className={`text-lg font-semibold bg-transparent p-0 cursor-pointer focus:outline-none ${
              formData.type === "buy" ? "underline" : ""
            }`}
            onClick={() => handleOrderTypeChange("buy")}
          >
            Buy
          </button>
          <button
            type="button"
            className={`text-lg font-semibold bg-transparent p-0 cursor-pointer focus:outline-none ${
              formData.type === "sell" ? "underline" : ""
            }`}
            onClick={() => handleOrderTypeChange("sell")}
          >
            Sell
          </button>
        </div>
        <button
          type="button"
          onClick={() => console.log("Settings clicked")}
          className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          aria-label="Order Settings"
        >
          <FaCog className="w-5 h-5 text-gray-600" aria-hidden="true" />
        </button>
      </div>
      {tabLoading ? (
        <div className="flex justify-center items-center h-[21rem]">Loading...</div>
      ) : (
        <div className="bg-white rounded-lg shadow-lg p-4">
          {showMaxError && (
            <p className="text-red-500 text-sm mb-2">
              Please set a price to use the Max button for buying.
            </p>
          )}
          <form className="space-y-4" onSubmit={handleSubmit}>
            <AmountWithMaxInput
              asset={giveAsset}
              availableBalance={isBuy ? "" : availableBalance}
              value={formData.amount}
              onChange={(value) => setFormData((prev) => ({ ...prev, amount: value }))}
              sat_per_vbyte={formData.sat_per_vbyte}
              setError={setError}
              shouldShowHelpText={shouldShowHelpText}
              sourceAddress={activeAddress}
              maxAmount={maxAmount}
              disableMaxButton={!isMaxAvailable}
              onMaxClick={handleMaxClick}
              label="Amount"
              name="amount"
              description={amountDescription}
            />
            <AssetSelectInput
              selectedAsset={formData.asset}
              onChange={(asset) => setFormData((prev) => ({ ...prev, asset, price: "" }))}
              label="Quote"
              shouldShowHelpText={shouldShowHelpText}
            />
            <PriceWithSuggestInput
              value={formData.price}
              onChange={(value) => setFormData((prev) => ({ ...prev, price: value }))}
              tradingPairData={tradingPairData}
              shouldShowHelpText={shouldShowHelpText}
              label="Price"
              name="price"
              priceDescription={`Price per unit in ${formData.asset}`}
              showPairFlip={true}
              isPairFlipped={isPairFlipped}
              setIsPairFlipped={setIsPairFlipped}
            />
            <FeeRateInput
              value={formData.sat_per_vbyte}
              onChange={(value) => setFormData((prev) => ({ ...prev, sat_per_vbyte: value }))}
              error={formData.sat_per_vbyte <= 0 ? "Fee rate must be greater than zero." : ""}
              showHelpText={shouldShowHelpText}
            />
            <Button type="submit" color="blue" fullWidth>
              Continue
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}
