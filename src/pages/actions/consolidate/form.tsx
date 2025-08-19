import axios from "axios";
import React, { useState, useEffect } from "react";
import { Button } from "@/components/button";
import { AddressHeader } from "@/components/headers/address-header";
import { FeeRateInput } from "@/components/inputs/fee-rate-input";
import { useWallet } from "@/contexts/wallet-context";
import { formatAmount } from "@/utils/format";
import { useSettings } from "@/contexts/settings-context";

export interface ConsolidationFormData {
  feeRateSatPerVByte: number;
  destinationAddress: string;
  utxoData: { count: number; total: number } | null;
}

const DEFAULT_FORM_DATA: ConsolidationFormData = {
  feeRateSatPerVByte: 0.1,
  destinationAddress: "",
  utxoData: null,
};

interface ConsolidationFormProps {
  onSubmit: (data: ConsolidationFormData) => void;
}

export function ConsolidationForm({ onSubmit }: ConsolidationFormProps) {
  const { activeAddress, activeWallet } = useWallet();
  const [formData, setFormData] = useState<ConsolidationFormData>(DEFAULT_FORM_DATA);
  const { settings } = useSettings();
  const shouldShowHelpText = settings?.showHelpText;

  // Fetch UTXO summary for the active address
  useEffect(() => {
    async function fetchUTXOs() {
      if (!activeAddress) return;
      try {
        const response = await axios.get(
          `https://app.xcp.io/api/v1/address/${activeAddress.address}/utxos`
        );
        const utxos = response.data.data;
        const total = utxos.reduce((sum: number, utxo: any) => sum + Number(utxo.amount), 0);
        setFormData((prev) => ({
          ...prev,
          utxoData: { count: utxos.length, total },
        }));
      } catch (error) {
        console.error("Error fetching UTXOs:", error);
      }
    }
    fetchUTXOs();
  }, [activeAddress]);

  const handleFeeRateChange = (value: number) => {
    setFormData((prev) => ({ ...prev, feeRateSatPerVByte: value }));
  };

  const handleDestinationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({ ...prev, destinationAddress: e.target.value.trim() }));
  };

  const handleSubmitInternal = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <div className="space-y-4">
      {activeAddress && (
        <AddressHeader
          address={activeAddress.address}
          walletName={activeWallet?.name}
          className="mb-6"
        />
      )}
      <form onSubmit={handleSubmitInternal} className="bg-white rounded-lg shadow-lg p-4 space-y-6">
        {formData.utxoData && (
          <div className="space-y-2">
            <h3 className="font-semibold">Recoverable</h3>
            <div className="flex justify-between">
              <span className="text-gray-600">Bitcoin</span>
              <span className="font-medium">
                {`${formatAmount({
                  value: formData.utxoData.total,
                  minimumFractionDigits: 8,
                  maximumFractionDigits: 8,
                })} BTC`}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">UTXOs</span>
              <span className="font-medium">{formData.utxoData.count}</span>
            </div>
          </div>
        )}

        <div className="space-y-2">
          <label htmlFor="destinationAddress" className="block text-sm font-medium text-gray-700">
            Destination Address (Optional)
          </label>
          <input
            id="destinationAddress"
            type="text"
            className="block w-full p-2 rounded-md border bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            value={formData.destinationAddress}
            onChange={handleDestinationChange}
            placeholder="Leave empty to consolidate to source address"
          />
          <p className={`text-sm text-gray-500 ${shouldShowHelpText ? "" : "hidden"}`}>
            If left empty, UTXOs will be consolidated to your source address.
          </p>
        </div>

        <FeeRateInput
          onFeeRateChange={handleFeeRateChange}
          showHelpText={shouldShowHelpText}
        />

        <Button
          type="submit"
          color="blue"
          fullWidth
          disabled={!formData.utxoData || formData.utxoData.count === 0 || formData.feeRateSatPerVByte <= 0}
        >
          Continue
        </Button>
      </form>
    </div>
  );
}
