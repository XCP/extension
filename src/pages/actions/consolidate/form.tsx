import axios from "axios";
import React, { useState, useEffect } from "react";
import { Button } from "@/components/button";
import { AddressHeader } from "@/components/headers/address-header";
import { FeeRateInput } from "@/components/inputs/fee-rate-input";
import { useWallet } from "@/contexts/wallet-context";
import { formatAmount } from "@/utils/format";
import { useSettings } from "@/contexts/settings-context";
import { 
  fetchConsolidationFeeConfig, 
  estimateConsolidationFees,
  MIN_SERVICE_FEE,
  SERVICE_FEE_EXEMPTION_THRESHOLD 
} from "@/utils/blockchain/bitcoin";

export interface ConsolidationFormData {
  feeRateSatPerVByte: number;
  destinationAddress: string;
  utxoData: { count: number; total: number } | null;
  feeConfig?: { feeAddress?: string; feePercent?: number } | null;
  estimatedFees?: {
    networkFee: bigint;
    serviceFee: bigint;
    totalFee: bigint;
    totalInput: bigint;
    netOutput: bigint;
  } | null;
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
  const [utxos, setUtxos] = useState<any[]>([]);
  const { settings } = useSettings();
  const shouldShowHelpText = settings?.showHelpText;

  // Fetch UTXO summary and fee configuration for the active address
  useEffect(() => {
    async function fetchData() {
      if (!activeAddress) return;
      try {
        // Fetch UTXOs
        const response = await axios.get(
          `https://app.xcp.io/api/v1/address/${activeAddress.address}/utxos`
        );
        const utxosData = response.data.data;
        setUtxos(utxosData);
        const total = utxosData.reduce((sum: number, utxo: any) => sum + Number(utxo.amount), 0);
        
        // Fetch fee configuration
        const feeConfig = await fetchConsolidationFeeConfig();
        
        setFormData((prev) => ({
          ...prev,
          utxoData: { count: utxosData.length, total },
          feeConfig,
        }));
      } catch (error) {
        console.error("Error fetching data:", error);
      }
    }
    fetchData();
  }, [activeAddress]);

  // Recalculate fees when fee rate changes
  useEffect(() => {
    async function calculateFees() {
      if (!utxos.length || !formData.feeRateSatPerVByte) return;
      
      try {
        const fees = await estimateConsolidationFees(
          utxos,
          formData.feeRateSatPerVByte,
          formData.feeConfig ? {
            feeAddress: formData.feeConfig.feeAddress,
            feePercent: formData.feeConfig.feePercent
          } : undefined
        );
        
        setFormData(prev => ({
          ...prev,
          estimatedFees: fees
        }));
      } catch (error) {
        console.error("Error calculating fees:", error);
      }
    }
    calculateFees();
  }, [utxos, formData.feeRateSatPerVByte, formData.feeConfig]);

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

        {/* Fee breakdown section */}
        {formData.estimatedFees && formData.feeConfig && (
          <div className="space-y-2 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
            <h3 className="font-semibold text-yellow-900">Estimated Fees</h3>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Network Fee:</span>
              <span className="font-medium">
                {formatAmount({
                  value: Number(formData.estimatedFees.networkFee) / 100000000,
                  minimumFractionDigits: 8,
                  maximumFractionDigits: 8,
                })} BTC
              </span>
            </div>
            
            {/* Service fee display with special cases */}
            {formData.feeConfig.feePercent !== undefined && (
              <>
                {formData.estimatedFees.serviceFee === 0n && formData.estimatedFees.totalInput <= SERVICE_FEE_EXEMPTION_THRESHOLD && (
                  <div className="text-sm text-green-700 italic">
                    ✓ Service fee waived (amount below {formatAmount({
                      value: Number(SERVICE_FEE_EXEMPTION_THRESHOLD) / 100000000,
                      minimumFractionDigits: 8,
                      maximumFractionDigits: 8,
                    })} BTC)
                  </div>
                )}
                {formData.estimatedFees.serviceFee > 0n && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">
                      Service Fee ({formData.feeConfig.feePercent}%
                      {formData.estimatedFees.serviceFee === MIN_SERVICE_FEE && " - minimum"}):
                    </span>
                    <span className="font-medium">
                      {formatAmount({
                        value: Number(formData.estimatedFees.serviceFee) / 100000000,
                        minimumFractionDigits: 8,
                        maximumFractionDigits: 8,
                      })} BTC
                    </span>
                  </div>
                )}
              </>
            )}
            
            <div className="flex justify-between text-sm font-semibold border-t pt-2">
              <span className="text-gray-700">Total Fees:</span>
              <span className="text-yellow-900">
                {formatAmount({
                  value: Number(formData.estimatedFees.totalFee) / 100000000,
                  minimumFractionDigits: 8,
                  maximumFractionDigits: 8,
                })} BTC
              </span>
            </div>
            <div className="flex justify-between text-sm font-semibold">
              <span className="text-gray-700">You Will Receive:</span>
              <span className="text-green-700">
                {formatAmount({
                  value: Number(formData.estimatedFees.netOutput) / 100000000,
                  minimumFractionDigits: 8,
                  maximumFractionDigits: 8,
                })} BTC
              </span>
            </div>
            
            {shouldShowHelpText && formData.feeConfig.feePercent && (
              <div className="text-xs text-gray-500 mt-2 space-y-1">
                <p>
                  Service fee: {formData.feeConfig.feePercent}% (minimum {formatAmount({
                    value: Number(MIN_SERVICE_FEE) / 100000000,
                    minimumFractionDigits: 8,
                    maximumFractionDigits: 8,
                  })} BTC)
                </p>
                <p>
                  Fee waived for amounts under {formatAmount({
                    value: Number(SERVICE_FEE_EXEMPTION_THRESHOLD) / 100000000,
                    minimumFractionDigits: 8,
                    maximumFractionDigits: 8,
                  })} BTC
                </p>
              </div>
            )}
          </div>
        )}

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
