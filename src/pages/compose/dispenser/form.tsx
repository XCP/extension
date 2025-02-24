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
import { useAssetDetails } from "@/hooks/useAssetDetails";
import { DispenserOptions, fetchAssetDetailsAndBalance } from "@/utils/blockchain/counterparty";

interface DispenserFormDataInternal {
  give_quantity: string;
  escrow_quantity: string;
  mainchainrate: string;
  sat_per_vbyte: number;
}

interface TradingPairData {
  last_trade_price: string | null;
  name: string;
}

interface DispenserFormProps {
  onSubmit: (data: DispenserOptions) => void;
  initialFormData?: DispenserOptions;
  asset: string;
}

export function DispenserForm({ onSubmit, initialFormData, asset }: DispenserFormProps) {
  const { activeAddress, activeWallet } = useWallet();
  const { settings } = useSettings();
  const shouldShowHelpText = settings?.showHelpText ?? false;

  const { error: assetError, data: assetDetails } = useAssetDetails(asset);

  const [formData, setFormData] = useState<DispenserFormDataInternal>(() => {
    const isDivisible = assetDetails?.assetInfo?.divisible ?? true;
    return {
      give_quantity: initialFormData?.give_quantity ? (isDivisible ? (initialFormData.give_quantity / 1e8).toFixed(8) : initialFormData.give_quantity.toString()) : "",
      escrow_quantity: initialFormData?.escrow_quantity ? (isDivisible ? (initialFormData.escrow_quantity / 1e8).toFixed(8) : initialFormData.escrow_quantity.toString()) : "",
      mainchainrate: initialFormData?.mainchainrate ? (initialFormData.mainchainrate / 1e8).toFixed(8) : "",
      sat_per_vbyte: initialFormData?.sat_per_vbyte || 1,
    };
  });
  const [availableBalance, setAvailableBalance] = useState<string>("0");
  const [localError, setLocalError] = useState<string | null>(null);
  const [tradingPairData, setTradingPairData] = useState<TradingPairData | null>(null);

  const escrowInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    escrowInputRef.current?.focus();
  }, []);

  useEffect(() => {
    const fetchDetails = async () => {
      if (!asset || !activeAddress?.address) return;
      try {
        const { isDivisible, assetInfo, availableBalance } = await fetchAssetDetailsAndBalance(asset, activeAddress.address);
        setAvailableBalance(availableBalance);
        if (!initialFormData) {
          setFormData((prev) => ({ ...prev, give_quantity: isDivisible ? "1.00000000" : "1" }));
        }

        const tradingPairResponse = await axios.get(`https://app.xcp.io/api/v1/swap/${asset}/BTC`);
        const lastTradePrice = tradingPairResponse.data?.data?.trading_pair?.last_trade_price || null;
        setTradingPairData({ last_trade_price: lastTradePrice, name: "BTC" });
      } catch (err) {
        console.error("Error fetching asset details:", err);
        setLocalError("Error fetching asset details.");
      }
    };
    fetchDetails();
  }, [asset, activeAddress?.address, initialFormData]);

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!formData.give_quantity || Number(formData.give_quantity) <= 0) {
      setLocalError("Dispense amount must be greater than zero.");
      return;
    }
    if (!formData.escrow_quantity || Number(formData.escrow_quantity) <= 0) {
      setLocalError("Escrow quantity must be greater than zero.");
      return;
    }
    if (!formData.mainchainrate || Number(formData.mainchainrate) <= 0) {
      setLocalError("BTC per dispense must be greater than zero.");
      return;
    }
    if (formData.sat_per_vbyte <= 0) {
      setLocalError("Fee rate must be greater than zero.");
      return;
    }
    setLocalError(null);

    const isDivisible = assetDetails?.assetInfo?.divisible ?? true;
    const giveQtyNum = Number(formData.give_quantity);
    const escrowQtyNum = Number(formData.escrow_quantity);
    const mainchainrateNum = Number(formData.mainchainrate);

    const submissionData: DispenserOptions = {
      sourceAddress: activeAddress?.address || "",
      asset,
      give_quantity: isDivisible ? Math.round(giveQtyNum * 1e8) : Math.round(giveQtyNum),
      escrow_quantity: isDivisible ? Math.round(escrowQtyNum * 1e8) : Math.round(escrowQtyNum),
      mainchainrate: Math.round(mainchainrateNum * 1e8),
      sat_per_vbyte: formData.sat_per_vbyte,
    };
    onSubmit(submissionData);
  };

  return (
    <div className="space-y-4">
      {asset && activeAddress && assetDetails && (
        <BalanceHeader
          balance={{
            asset,
            quantity_normalized: availableBalance,
            asset_info: assetDetails.assetInfo || {
              asset_longname: null,
              description: '',
              issuer: '',
              divisible: false,
              locked: false,
              supply: '0'
            }
          }}
          className="mb-5"
        />
      )}
      {localError && <div className="text-red-500 mb-2">{localError}</div>}
      <div className="bg-white rounded-lg shadow-lg p-4">
        <form className="space-y-6" onSubmit={handleSubmit}>
          <AmountWithMaxInput
            asset={asset}
            availableBalance={availableBalance}
            value={formData.escrow_quantity}
            onChange={(value) => setFormData((prev) => ({ ...prev, escrow_quantity: value }))}
            sat_per_vbyte={formData.sat_per_vbyte}
            setError={setLocalError}
            sourceAddress={activeAddress}
            maxAmount={availableBalance}
            shouldShowHelpText={shouldShowHelpText}
            label="Dispenser Escrow"
            name="escrow_quantity"
            description={`The total quantity of the asset to reserve for this dispenser. ${
              assetDetails?.assetInfo?.divisible ? "Enter up to 8 decimal places." : "Enter whole numbers only."
            } Available: ${availableBalance}`}
          />
          <PriceWithSuggestInput
            value={formData.mainchainrate}
            onChange={(value) => setFormData((prev) => ({ ...prev, mainchainrate: value }))}
            tradingPairData={tradingPairData}
            shouldShowHelpText={shouldShowHelpText}
            label="BTC Per Dispense"
            name="mainchainrate"
            priceDescription="The amount of BTC required per dispensed portion."
            showPairFlip={false}
          />
          <Field>
            <Label htmlFor="give_quantity" className="text-sm font-medium text-gray-700">
              Dispense Amount <span className="text-red-500">*</span>
            </Label>
            <Input
              id="give_quantity"
              type="text"
              name="give_quantity"
              value={formData.give_quantity}
              onChange={(e) => setFormData((prev) => ({ ...prev, give_quantity: e.target.value }))}
              className="mt-1 block w-full p-2 rounded-md border bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              required
              placeholder={assetDetails?.assetInfo?.divisible ? "0.00000000" : "0"}
            />
            <Description className={shouldShowHelpText ? "mt-2 text-sm text-gray-500" : "hidden"}>
              The quantity of the asset to dispense per transaction.{assetDetails?.assetInfo?.divisible ? " Enter up to 8 decimal places." : " Enter whole numbers only."}
            </Description>
          </Field>
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
    </div>
  );
}
