"use client";

import axios from "axios";
import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { Field, Label, Description, Input } from "@headlessui/react";
import { Button } from "@/components/button";
import { BalanceHeader } from "@/components/headers/balance-header";
import { AmountWithMaxInput } from "@/components/inputs/amount-with-max-input";
import { FeeRateInput } from "@/components/inputs/fee-rate-input";
import { PriceWithSuggestInput } from "@/components/inputs/price-with-suggest-input";
import { useSettings } from "@/contexts/settings-context";
import { useWallet } from "@/contexts/wallet-context";
import { useAssetDetails } from "@/hooks/useAssetDetails";
import type { DispenserOptions } from "@/utils/blockchain/counterparty";
import type { ReactElement } from "react";

interface TradingPairData {
  last_trade_price: string | null;
  name: string;
}

/**
 * Props for the DispenserForm component, aligned with Composer's formAction.
 */
interface DispenserFormProps {
  formAction: (formData: FormData) => void;
  initialFormData: DispenserOptions | null;
  asset: string;
}

/**
 * Form for creating a dispenser using React 19 Actions.
 */
export function DispenserForm({ formAction, initialFormData, asset }: DispenserFormProps): ReactElement {
  const { activeAddress, activeWallet } = useWallet();
  const { settings } = useSettings();
  const shouldShowHelpText = settings?.showHelpText ?? false;
  const { error: assetError, data: assetDetails } = useAssetDetails(asset);
  const { pending } = useFormStatus();

  const [availableBalance, setAvailableBalance] = useState<string>("0");
  const [tradingPairData, setTradingPairData] = useState<TradingPairData | null>(null);

  const isDivisible = assetDetails?.assetInfo?.divisible ?? true;

  // Fetch asset details and trading pair data
  useEffect(() => {
    const fetchDetails = async () => {
      if (!asset || !activeAddress?.address) return;
      try {
        if (assetDetails?.availableBalance) {
          setAvailableBalance(assetDetails.availableBalance);
        }

        const response = await axios.get(`https://app.xcp.io/api/v1/swap/${asset}/BTC`);
        const lastTradePrice = response.data?.data?.trading_pair?.last_trade_price || null;
        setTradingPairData({ last_trade_price: lastTradePrice, name: "BTC" });
      } catch (err) {
        console.error("Error fetching asset details:", err);
      }
    };
    fetchDetails();
  }, [asset, activeAddress?.address, assetDetails]);

  // Focus escrow_quantity input on mount
  useEffect(() => {
    const input = document.querySelector("input[name='escrow_quantity']") as HTMLInputElement;
    input?.focus();
  }, []);

  return (
    <div className="space-y-4">
      {asset && activeAddress && assetDetails && (
        <BalanceHeader
          balance={{
            asset,
            quantity_normalized: availableBalance,
            asset_info: assetDetails.assetInfo || {
              asset_longname: null,
              description: "",
              issuer: "",
              divisible: false,
              locked: false,
              supply: "0",
            },
          }}
          className="mb-5"
        />
      )}
      {assetError && <div className="text-red-500 mb-2">{assetError.message}</div>}
      <div className="bg-white rounded-lg shadow-lg p-4">
        <form action={formAction} className="space-y-6">
          <AmountWithMaxInput
            asset={asset}
            availableBalance={availableBalance}
            value={
              initialFormData?.escrow_quantity
                ? isDivisible
                  ? (initialFormData.escrow_quantity / 1e8).toFixed(8)
                  : initialFormData.escrow_quantity.toString()
                : ""
            }
            onChange={() => {}} // No-op since formAction handles submission
            sat_per_vbyte={initialFormData?.sat_per_vbyte || 1}
            setError={() => {}} // No-op since Composer handles errors
            shouldShowHelpText={shouldShowHelpText}
            sourceAddress={activeAddress}
            maxAmount={availableBalance}
            label="Dispenser Escrow"
            name="escrow_quantity"
            description={`The total quantity of the asset to reserve for this dispenser. ${
              isDivisible ? "Enter up to 8 decimal places." : "Enter whole numbers only."
            } Available: ${availableBalance}`}
            disabled={pending}
          />
          <PriceWithSuggestInput
            value={
              initialFormData?.mainchainrate
                ? (initialFormData.mainchainrate / 1e8).toFixed(8)
                : ""
            }
            onChange={() => {}} // No-op since formAction handles submission
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
              defaultValue={
                initialFormData?.give_quantity
                  ? isDivisible
                    ? (initialFormData.give_quantity / 1e8).toFixed(8)
                    : initialFormData.give_quantity.toString()
                  : isDivisible
                  ? "1.00000000"
                  : "1"
              }
              className="mt-1 block w-full p-2 rounded-md border bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              required
              placeholder={isDivisible ? "0.00000000" : "0"}
              disabled={pending}
            />
            <Description className={shouldShowHelpText ? "mt-2 text-sm text-gray-500" : "hidden"}>
              The quantity of the asset to dispense per transaction.
              {isDivisible ? " Enter up to 8 decimal places." : " Enter whole numbers only."}
            </Description>
          </Field>
          
          <FeeRateInput showHelpText={shouldShowHelpText} disabled={pending} />
          
          <Button type="submit" color="blue" fullWidth disabled={pending}>
            {pending ? "Submitting..." : "Continue"}
          </Button>
        </form>
      </div>
    </div>
  );
}
