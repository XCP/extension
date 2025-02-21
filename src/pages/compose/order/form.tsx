import React, { useState, useRef, useEffect, useMemo, FormEvent } from "react";
import { FaCog } from "react-icons/fa";
import { Button } from "@/components/button";
import { Loading } from "@/components/loading";
import { AmountWithMaxInput } from "@/components/inputs/amount-with-max-input";
import { AssetSelectInput } from "@/components/inputs/asset-select-input";
import { FeeRateInput } from "@/components/inputs/fee-rate-input";
import { PriceWithSuggestInput } from "@/components/inputs/price-with-suggest-input";
import { toBigNumber, formatBigNumber } from "@/utils/numeric";

export interface OrderFormData {
  type: "buy" | "sell";
  amount: string;
  asset: string;
  price: string;

}

export interface TradingPairData {
  last_trade_price: string | null;
  name: string;
}

interface OrderFormProps {
  giveAsset: string;
  onSubmit: (data: any) => void;
  shouldShowHelpText: boolean;
  walletState: any;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  tradingPairData: TradingPairData | null;
  tabLoading: boolean;
  handleOrderTypeChange: (type: "buy" | "sell") => void;
  isPairFlipped: boolean;
  setIsPairFlipped: React.Dispatch<React.SetStateAction<boolean>>;
}

export const OrderForm = ({
  giveAsset,
  onSubmit,
  shouldShowHelpText,
  walletState,
  setError,
  tradingPairData,
  tabLoading,
  handleOrderTypeChange,
  isPairFlipped,
  setIsPairFlipped,
}: OrderFormProps) => {
  const [formData, setFormData] = useState<OrderFormData>({
    type: "sell",
    amount: "",
    asset: giveAsset === "XCP" ? "BTC" : "XCP",
    price: "",

  });

  const amountInputRef = useRef<HTMLInputElement>(null);
  const [showMaxError, setShowMaxError] = useState(false);

  useEffect(() => {
    if (!tabLoading) {
      amountInputRef.current?.focus();
    }
  }, [tabLoading]);

  const isBuy = formData.type === "buy";

  const orderAssetBalance = walletState?.orderAssetBalance || "0";
  const availableBalance = walletState?.availableBalance || "0";

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
      return formatBigNumber(max);
    } else if (!isBuy) {
      return availableBalance;
    }
    return "";
  }, [isBuy, formData.price, orderAssetBalance, availableBalance, isPairFlipped]);

  const isMaxAvailable = isBuy ? Boolean(formData.price) : true;

  const handleMaxClick = () => {
    if (isBuy && !formData.price) {
      setShowMaxError(true);
    } else if (maxAmount) {
      setFormData((prev) => ({ ...prev, amount: maxAmount }));
    }
  };

  useEffect(() => {
    setShowMaxError(false);
  }, [formData.type, formData.price]);

  const amountDescription = `Amount to ${isBuy ? "buy" : "sell"}. ${
    isBuy ? "Enter up to 8 decimal places." : "Enter whole numbers only."
  }`;
  const priceDescription = `Price per unit in ${formData.asset}`;

  const handleSubmitInternal = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!formData.amount || !formData.asset || !formData.price || formData.feeRateSatPerVByte <= 0) {
      return; // Validation handled by form fields and FeeRateInput
    }
    onSubmit({
      ...formData,
      giveAsset,
      extra: {
        tradingPairData,
      },
    });
  };

  return (
    <>
      <div className="flex justify-between items-center mb-2">
        <div className="flex space-x-4">
          <button
            className={`text-lg font-semibold bg-transparent p-0 cursor-pointer focus:outline-none ${
              formData.type === "buy" ? "underline" : ""
            }`}
            onClick={() => handleOrderTypeChange("buy")}
          >
            Buy
          </button>
          <button
            className={`text-lg font-semibold bg-transparent p-0 cursor-pointer focus:outline-none ${
              formData.type === "sell" ? "underline" : ""
            }`}
            onClick={() => handleOrderTypeChange("sell")}
          >
            Sell
          </button>
        </div>
        <button
          onClick={() => console.log("Settings clicked")}
          className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          aria-label="Order Settings"
        >
          <FaCog className="w-5 h-5 text-gray-600" aria-hidden="true" />
        </button>
      </div>

      <div className="bg-white rounded-lg shadow-lg p-4">
        {tabLoading ? (
          <div className="flex justify-center items-center h-[21rem]">
            <Loading />
          </div>
        ) : (
          <form className="space-y-4" onSubmit={handleSubmitInternal}>
            <AmountWithMaxInput
              ref={amountInputRef}
              asset={giveAsset}
              availableBalance={isBuy ? "" : availableBalance}
              value={formData.amount}
              onChange={(value: string) => setFormData((prev) => ({ ...prev, amount: value }))}
              feeRateSatPerVByte={formData.feeRateSatPerVByte}
              setError={setError}
              shouldShowHelpText={shouldShowHelpText}
              walletState={walletState}
              label="Amount"
              name="amount"
              description={amountDescription}
              maxAmount={maxAmount}
              disableMaxButton={!isMaxAvailable}
              onMaxClick={handleMaxClick}
            />

            {showMaxError && (
              <p className="text-red-500 text-sm">
                Please set a price to use the Max button for buying.
              </p>
            )}

            <AssetSelectInput
              selectedAsset={formData.asset}
              onChange={(asset: string) =>
                setFormData((prev) => ({
                  ...prev,
                  asset,
                  price: "", // Clear price when asset changes
                }))
              }
              label="Quote"
              shouldShowHelpText={shouldShowHelpText}
            />

            <PriceWithSuggestInput
              label="Price"
              value={formData.price}
              onChange={(value: string) => setFormData((prev) => ({ ...prev, price: value }))}
              tradingPairData={tradingPairData}
              shouldShowHelpText={shouldShowHelpText}
              priceDescription={priceDescription}
              showPairFlip={true}
              isPairFlipped={isPairFlipped}
              setIsPairFlipped={setIsPairFlipped}
            />

            <FeeRateInput
              value={formData.feeRateSatPerVByte}
              onChange={(value: number) =>
                setFormData((prev) => ({ ...prev, feeRateSatPerVByte: value }))
              }
              error={formData.feeRateSatPerVByte <= 0 ? "Fee rate must be greater than zero." : ""}
              showHelpText={shouldShowHelpText}
            />

            <Button
              color="blue"
              fullWidth
              disabled={!formData.amount || !formData.asset || !formData.price || formData.feeRateSatPerVByte <= 0}
              type="submit"
            >
              Continue
            </Button>
          </form>
        )}
      </div>
    </>
  );
};
