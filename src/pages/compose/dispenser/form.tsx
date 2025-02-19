import axios from "axios";
import React, { useState, useEffect, useRef, FormEvent } from "react";
import { Field, Label, Description, Input } from "@headlessui/react";
import { Button } from "@/components/button";
import { BalanceHeader } from "@/components/headers/balance-header";
import { AmountWithMaxInput } from "@/components/inputs/amount-with-max-input";
import { FeeRateInput } from "@/components/inputs/fee-rate-input";
import { PriceWithSuggestInput } from "@/components/inputs/price-with-suggest-input";
import { useSettings } from "@/contexts/settings-context";
import { useWallet } from "@/contexts/wallet-context";
import { fetchAssetDetailsAndBalance } from "@/utils/blockchain/counterparty";

export interface DispenserFormData {
  give_quantity: string;
  escrow_quantity: string;
  mainchainrate: string;
  feeRateSatPerVByte: number;
}

export interface TradingPairData {
  last_trade_price: string | null;
  name: string;
}

interface DispenserFormProps {
  asset: string;
  onSubmit: (data: any) => void;
}

export function DispenserForm({ asset, onSubmit }: DispenserFormProps) {
  const { activeAddress, activeWallet } = useWallet();
  const { settings } = useSettings();

  const [formData, setFormData] = useState<DispenserFormData>({
    give_quantity: "",
    escrow_quantity: "",
    mainchainrate: "",
    feeRateSatPerVByte: 1,
  });
  const [availableBalance, setAvailableBalance] = useState<string>("0");
  const [assetInfo, setAssetInfo] = useState<any>(null);
  const [assetDivisible, setAssetDivisible] = useState<boolean>(true);
  const [tradingPairData, setTradingPairData] = useState<TradingPairData | null>(null);

  const escrowInputRef = useRef<HTMLInputElement>(null);

  // Autofocus on the escrow input
  useEffect(() => {
    escrowInputRef.current?.focus();
  }, []);

  // Fetch asset details (balance, divisibility, etc.) and trading pair data
  useEffect(() => {
    const fetchDetails = async () => {
      if (!asset || !activeAddress?.address) return;
      try {
        const { isDivisible, assetInfo, availableBalance } =
          await fetchAssetDetailsAndBalance(asset, activeAddress.address);
        setAssetDivisible(isDivisible);
        setAssetInfo(assetInfo);
        setAvailableBalance(availableBalance);

        // Set default give_quantity based on divisibility
        setFormData((prev) => ({
          ...prev,
          give_quantity: isDivisible ? "1.00000000" : "1",
        }));

        // Fetch trading pair data for the price-suggest button
        const tradingPairResponse = await axios.get(
          `https://app.xcp.io/api/v1/swap/${asset}/BTC`
        );
        const lastTradePrice =
          tradingPairResponse.data?.data?.trading_pair?.last_trade_price || null;
        setTradingPairData({ last_trade_price: lastTradePrice, name: "BTC" });
      } catch (err) {
        console.error("Error fetching asset details:", err);
      }
    };

    fetchDetails();
  }, [asset, activeAddress?.address]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmitInternal = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // Validate required fields here if needed
    const submissionData = {
      asset,
      ...formData,
      // Save extra data for the review screen:
      extra: {
        availableBalance,
        assetInfo,
        assetDivisible,
        tradingPairData,
      },
    };
    onSubmit(submissionData);
  };

  return (
    <div className="space-y-4">
      {asset && activeAddress && (
        <BalanceHeader
          balance={{
            asset,
            quantity_normalized: availableBalance,
            asset_info: assetInfo || undefined,
          }}
          className="mb-6"
        />
      )}
      <div className="bg-white rounded-lg shadow-lg p-4">
        <form className="space-y-6" onSubmit={handleSubmitInternal}>
          {/* Dispenser Escrow Field with Max Button */}
          <AmountWithMaxInput
            ref={escrowInputRef}
            asset={asset}
            availableBalance={availableBalance}
            value={formData.escrow_quantity}
            onChange={(value) =>
              setFormData((prev) => ({ ...prev, escrow_quantity: value }))
            }
            feeRateSatPerVByte={formData.feeRateSatPerVByte}
            walletState={activeAddress}
            maxAmount={availableBalance}
            shouldShowHelpText={settings?.showHelpText}
            disabled={false}
            label="Dispenser Escrow"
            name="escrow_quantity"
            description={`The total quantity of the asset to reserve for this dispenser. ${
              assetDivisible ? "Enter up to 8 decimal places." : "Enter whole numbers only."
            } Available: ${availableBalance}`}
          />

          {/* BTC Rate with Suggest Button */}
          <PriceWithSuggestInput
            value={formData.mainchainrate}
            onChange={(value) =>
              setFormData((prev) => ({ ...prev, mainchainrate: value }))
            }
            tradingPairData={tradingPairData}
            shouldShowHelpText={settings?.showHelpText}
            label="BTC Per Dispense"
            name="mainchainrate"
            priceDescription="The amount of BTC required per dispensed portion."
            showPairFlip={false}
          />

          {/* Give Quantity Field */}
          <Field>
            <Label htmlFor="give_quantity" className="text-sm font-medium text-gray-700">
              Dispense Amount<span className="text-red-500">*</span>
            </Label>
            <Input
              id="give_quantity"
              type="text"
              name="give_quantity"
              value={formData.give_quantity}
              onChange={handleInputChange}
              className="mt-1 block w-full p-2 rounded-md border bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              required
              placeholder={assetDivisible ? "0.00000000" : "0"}
            />
            {settings?.showHelpText && (
              <Description className="mt-2 text-sm text-gray-500">
                The quantity of the asset to dispense per transaction.
                {assetDivisible
                  ? " Enter up to 8 decimal places."
                  : " Enter whole numbers only."}
              </Description>
            )}
          </Field>

          {/* Fee Rate Input */}
          <FeeRateInput
            value={formData.feeRateSatPerVByte}
            onChange={(value) =>
              setFormData((prev) => ({ ...prev, feeRateSatPerVByte: value }))
            }
            showHelpText={settings?.showHelpText}
          />

          {/* Submit Button */}
          <Button
            color="blue"
            fullWidth
            disabled={
              !formData.give_quantity ||
              !formData.escrow_quantity ||
              !formData.mainchainrate
            }
            type="submit"
          >
            Continue
          </Button>
        </form>
      </div>
    </div>
  );
}
