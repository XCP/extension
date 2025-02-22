import React, { useState, useRef, useEffect, FormEvent } from "react";
import { Field, Label, Description, Input } from "@headlessui/react";
import { Button } from "@/components/button";
import { BalanceHeader } from "@/components/headers/balance-header";
import { AmountWithMaxInput } from "@/components/inputs/amount-with-max-input";
import { AssetSelectInput } from "@/components/inputs/asset-select-input";
import { FeeRateInput } from "@/components/inputs/fee-rate-input";
import { useSettings } from "@/contexts/settings-context";
import { useWallet } from "@/contexts/wallet-context";
import { AttachOptions, fetchAssetDetailsAndBalance } from "@/utils/blockchain/counterparty";

interface UtxoAttachFormDataInternal {
  utxo: string;
  asset: string;
  quantity: string;
  sat_per_vbyte: number;
}

interface UtxoAttachFormProps {
  onSubmit: (data: AttachOptions) => void;
  initialFormData?: AttachOptions;
}

export function UtxoAttachForm({ onSubmit, initialFormData }: UtxoAttachFormProps) {
  const { activeAddress, activeWallet } = useWallet();
  const { settings } = useSettings();
  const shouldShowHelpText = settings?.showHelpText ?? false;

  const [formData, setFormData] = useState<UtxoAttachFormDataInternal>(() => ({
    utxo: initialFormData?.utxo_value || "",
    asset: initialFormData?.asset || "XCP",
    quantity: initialFormData?.quantity?.toString() || "",
    sat_per_vbyte: initialFormData?.sat_per_vbyte || 1,
  }));
  const [availableBalance, setAvailableBalance] = useState<string>("0");
  const [assetInfo, setAssetInfo] = useState<any>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const utxoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    utxoRef.current?.focus();
  }, []);

  useEffect(() => {
    const fetchBalance = async () => {
      if (!activeAddress?.address || !formData.asset) return;
      try {
        const { availableBalance, assetInfo } = await fetchAssetDetailsAndBalance(formData.asset, activeAddress.address);
        setAvailableBalance(availableBalance);
        setAssetInfo(assetInfo);
      } catch (err) {
        console.error("Failed to fetch balance:", err);
        setLocalError("Failed to fetch balance.");
      }
    };
    fetchBalance();
  }, [activeAddress?.address, formData.asset]);

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!formData.utxo.trim()) {
      setLocalError("UTXO is required.");
      return;
    }
    if (!formData.asset) {
      setLocalError("Asset is required.");
      return;
    }
    if (!formData.quantity || Number(formData.quantity) <= 0) {
      setLocalError("Quantity must be greater than zero.");
      return;
    }
    if (formData.sat_per_vbyte <= 0) {
      setLocalError("Fee rate must be greater than zero.");
      return;
    }
    setLocalError(null);

    const isDivisible = assetInfo?.divisible ?? true;
    const quantityNum = Number(formData.quantity);

    const submissionData: AttachOptions = {
      sourceAddress: activeAddress?.address || "",
      asset: formData.asset,
      quantity: isDivisible ? Math.round(quantityNum * 1e8) : Math.round(quantityNum),
      utxo_value: formData.utxo,
      sat_per_vbyte: formData.sat_per_vbyte,
    };
    onSubmit(submissionData);
  };

  return (
    <div className="space-y-4">
      {activeAddress && assetInfo && (
        <BalanceHeader
          balance={{ asset: formData.asset, quantity_normalized: availableBalance, asset_info: assetInfo }}
          className="mb-4"
        />
      )}
      {localError && <div className="text-red-500 mb-2">{localError}</div>}
      <div className="bg-white rounded-lg shadow-lg p-4">
        <form onSubmit={handleSubmit} className="space-y-6">
          <Field>
            <Label className="text-sm font-medium text-gray-700">
              UTXO <span className="text-red-500">*</span>
            </Label>
            <Input
              ref={utxoRef}
              type="text"
              name="utxo"
              value={formData.utxo}
              onChange={(e) => setFormData((prev) => ({ ...prev, utxo: e.target.value }))}
              required
              placeholder="Enter UTXO (txid:vout)"
              className="mt-1 block w-full p-2 rounded-md border bg-gray-50 focus:ring-blue-500 focus:border-blue-500"
            />
            <Description className={shouldShowHelpText ? "mt-2 text-sm text-gray-500" : "hidden"}>
              Enter the UTXO identifier (e.g., txid:vout) to attach the asset to.
            </Description>
          </Field>
          <AssetSelectInput
            selectedAsset={formData.asset}
            onChange={(asset) => setFormData((prev) => ({ ...prev, asset, quantity: "" }))}
            label="Asset"
            required
            shouldShowHelpText={shouldShowHelpText}
            description="Select the asset to attach to the UTXO."
          />
          <AmountWithMaxInput
            asset={formData.asset}
            availableBalance={availableBalance}
            value={formData.quantity}
            onChange={(value) => setFormData((prev) => ({ ...prev, quantity: value }))}
            sat_per_vbyte={formData.sat_per_vbyte}
            setError={setLocalError}
            sourceAddress={activeAddress}
            maxAmount={availableBalance}
            shouldShowHelpText={shouldShowHelpText}
            label="Quantity"
            name="quantity"
            description={
              assetInfo?.divisible
                ? "Enter the quantity to attach (up to 8 decimal places)."
                : "Enter a whole number quantity."
            }
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
    </div>
  );
}
