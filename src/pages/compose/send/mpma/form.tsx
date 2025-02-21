import React, { useState, useEffect, FormEvent } from "react";
import { Field, Label, Description, Input } from "@headlessui/react";
import { Button } from "@/components/button";
import { BalanceHeader } from "@/components/headers/balance-header";
import { FeeRateInput } from "@/components/inputs/fee-rate-input";
import { MultiAssetInput } from "@/components/inputs/multi-asset-input";
import { useWallet } from "@/contexts/wallet-context";
import { fetchAssetDetailsAndBalance } from "@/utils/blockchain/counterparty";
import { toBigNumber } from "@/utils/numeric";

export interface SendMpmaFormData {
  destination: string;
  assets: { asset: string; quantity: string }[];
  memo: string;

}

interface SendMpmaFormProps {
  onSubmit: (data: SendMpmaFormData) => void;
  shouldShowHelpText?: boolean;
}

export function SendMpmaForm({ onSubmit, shouldShowHelpText = true }: SendMpmaFormProps) {
  const { activeAddress, activeWallet } = useWallet();

  const [formData, setFormData] = useState<SendMpmaFormData>({
    destination: "",
    assets: [{ asset: "BTC", quantity: "" }],
    memo: "",

  });
  const [balances, setBalances] = useState<{ [key: string]: { balance: string; assetInfo: any } }>(
    {}
  );
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    const fetchBalances = async () => {
      if (!activeAddress?.address) return;
      const newBalances: { [key: string]: { balance: string; assetInfo: any } } = {};
      for (const { asset } of formData.assets) {
        if (asset && !balances[asset]) {
          try {
            const { availableBalance, assetInfo } = await fetchAssetDetailsAndBalance(
              asset,
              activeAddress.address
            );
            newBalances[asset] = { balance: availableBalance, assetInfo };
          } catch (err) {
            console.error(`Failed to fetch balance for ${asset}:`, err);
            setLocalError(`Failed to fetch balance for ${asset}.`);
          }
        }
      }
      setBalances((prev) => ({ ...prev, ...newBalances }));
    };
    fetchBalances();
  }, [activeAddress?.address, formData.assets]);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (
      !formData.destination.trim() ||
      formData.assets.length === 0 ||
      formData.assets.some((a) => !a.asset || !a.quantity || Number(a.quantity) <= 0) ||
      formData.feeRateSatPerVByte <= 0
    ) {
      setLocalError("Please fill all required fields with valid values.");
      return;
    }

    const invalidAssets = formData.assets.filter((a) => {
      const balance = toBigNumber(balances[a.asset]?.balance || "0");
      const quantity = toBigNumber(a.quantity);
      const isDivisible = balances[a.asset]?.assetInfo?.divisible ?? true;
      const normalizedQuantity = isDivisible ? quantity.times(1e8) : quantity;
      return balance.lt(normalizedQuantity);
    });

    if (invalidAssets.length > 0) {
      setLocalError(
        `Insufficient balance for: ${invalidAssets.map((a) => a.asset).join(", ")}.`
      );
      return;
    }

    setLocalError(null);
    onSubmit(formData);
  };

  const aggregatedBalance = formData.assets.reduce((acc, { asset }) => {
    const balance = balances[asset]?.balance || "0";
    acc[asset] = Number(balance);
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="space-y-4">
      {activeAddress && (
        <BalanceHeader
          balance={{
            asset: "Multiple Assets",
            quantity_normalized: Object.entries(aggregatedBalance)
              .map(([asset, qty]) => `${qty} ${asset}`)
              .join(", "),
            asset_info: Object.values(balances).map((b) => b.assetInfo)[0], // Use first asset info for display
          }}
          className="mb-4"
        />
      )}
      {localError && <div className="text-red-500 mb-2">{localError}</div>}
      <div className="bg-white rounded-lg shadow-lg p-4">
        <form onSubmit={handleSubmit} className="space-y-6">
          <Field>
            <Label className="text-sm font-medium text-gray-700">
              Destination <span className="text-red-500">*</span>
            </Label>
            <Input
              type="text"
              name="destination"
              value={formData.destination}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, destination: e.target.value.trim() }))
              }
              required
              placeholder="Enter destination address"
              className="mt-1 block w-full p-2 rounded-md border bg-gray-50 focus:ring-blue-500 focus:border-blue-500"
            />
            <Description className={shouldShowHelpText ? "mt-2 text-sm text-gray-500" : "hidden"}>
              Enter the address to send the assets to.
            </Description>
          </Field>

          <MultiAssetInput
            assets={formData.assets}
            onAssetsChange={(assets) => setFormData((prev) => ({ ...prev, assets }))}
            balances={balances}
            shouldShowHelpText={shouldShowHelpText}
            feeRateSatPerVByte={formData.feeRateSatPerVByte}
            sourceAddress={activeAddress}
            setError={setLocalError}
          />

          <Field>
            <Label className="text-sm font-medium text-gray-700">Memo</Label>
            <Input
              type="text"
              name="memo"
              value={formData.memo}
              onChange={(e) => setFormData((prev) => ({ ...prev, memo: e.target.value.trim() }))}
              placeholder="Optional memo"
              className="mt-1 block w-full p-2 rounded-md border bg-gray-50 focus:ring-blue-500 focus:border-blue-500"
            />
            <Description className={shouldShowHelpText ? "mt-2 text-sm text-gray-500" : "hidden"}>
              Optional memo to include with the transaction.
            </Description>
          </Field>

          <FeeRateInput
            value={formData.feeRateSatPerVByte}
            onChange={(value) => setFormData((prev) => ({ ...prev, feeRateSatPerVByte: value }))}
            error={formData.feeRateSatPerVByte <= 0 ? "Fee rate must be greater than zero." : ""}
            showHelpText={shouldShowHelpText}
          />

          <Button
            type="submit"
            color="blue"
            fullWidth
            disabled={
              !formData.destination.trim() ||
              formData.assets.length === 0 ||
              formData.assets.some((a) => !a.asset || !a.quantity || Number(a.quantity) <= 0) ||
              formData.feeRateSatPerVByte <= 0
            }
          >
            Continue
          </Button>
        </form>
      </div>
    </div>
  );
}
