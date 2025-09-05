import React, { useState, useEffect } from "react";
import { Button } from "@/components/button";
import { AddressHeader } from "@/components/headers/address-header";
import { FeeRateInput } from "@/components/inputs/fee-rate-input";
import { useWallet } from "@/contexts/wallet-context";
import { formatAmount } from "@/utils/format";
import { useSettings } from "@/contexts/settings-context";
import { 
  consolidationApi,
  type ConsolidationData
} from "@/services/consolidationApiService";

export interface ConsolidationFormData {
  feeRateSatPerVByte: number;
  destinationAddress: string;
  includeStamps: boolean;
  consolidationData: ConsolidationData | null;
  allBatches: ConsolidationData[];
}

const DEFAULT_FORM_DATA: ConsolidationFormData = {
  feeRateSatPerVByte: 1,
  destinationAddress: "",
  includeStamps: false,
  consolidationData: null,
  allBatches: [],
};

interface ConsolidationFormProps {
  onSubmit: (data: ConsolidationFormData) => void;
}

export function ConsolidationForm({ onSubmit }: ConsolidationFormProps) {
  const { activeAddress, activeWallet } = useWallet();
  const [formData, setFormData] = useState<ConsolidationFormData>(DEFAULT_FORM_DATA);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { settings } = useSettings();
  const shouldShowHelpText = settings?.showHelpText;

  // Fetch consolidation data when address or stamps option changes
  useEffect(() => {
    async function fetchData() {
      if (!activeAddress) return;
      
      setIsLoading(true);
      setError(null);
      
      try {
        // Fetch all batches to show complete overview
        const batches = await consolidationApi.fetchAllBatches(
          activeAddress.address,
          formData.includeStamps
        );
        
        setFormData((prev) => ({
          ...prev,
          consolidationData: batches[0], // First batch for initial display
          allBatches: batches
        }));
      } catch (err) {
        console.error("Error fetching consolidation data:", err);
        setError(err instanceof Error ? err.message : "Failed to fetch consolidation data");
      } finally {
        setIsLoading(false);
      }
    }
    
    fetchData();
  }, [activeAddress, formData.includeStamps]);


  const handleFeeRateChange = (value: number) => {
    setFormData((prev) => ({ ...prev, feeRateSatPerVByte: value }));
  };

  const handleDestinationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({ ...prev, destinationAddress: e.target.value.trim() }));
  };

  const handleIncludeStampsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({ ...prev, includeStamps: e.target.checked }));
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
        {error && (
          <div className="p-3 bg-red-100 text-red-700 rounded-md">
            {error}
          </div>
        )}
        
        {isLoading && (
          <div className="text-center py-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-2 text-sm text-gray-600">Loading consolidation data...</p>
          </div>
        )}
        
        {formData.consolidationData && (
          <>
            <div className="space-y-2">
              <h3 className="font-semibold">Recoverable</h3>
              <div className="flex justify-between">
                <span className="text-gray-600">Total Bitcoin</span>
                <span className="font-medium">
                  {`${formatAmount({
                    value: formData.consolidationData.summary.total_btc,
                    minimumFractionDigits: 8,
                    maximumFractionDigits: 8,
                  })} BTC`}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Total UTXOs</span>
                <span className="font-medium">{formData.consolidationData.summary.total_utxos}</span>
              </div>
              {formData.consolidationData.summary.batches_required > 1 && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Batches Required</span>
                  <span className="font-medium text-blue-600">
                    {formData.consolidationData.summary.batches_required} batches
                  </span>
                </div>
              )}
            </div>
            
            {formData.consolidationData.summary.batches_required > 1 && (
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
                <p className="text-sm text-blue-900">
                  <strong>Note:</strong> Your {formData.consolidationData.summary.total_utxos} UTXOs will be consolidated in {formData.consolidationData.summary.batches_required} batches of up to 420 UTXOs each. All batches will be signed and broadcast automatically.
                </p>
              </div>
            )}
            
            {formData.consolidationData.validation_summary?.requires_special_handling && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-md">
                <p className="text-sm text-amber-900">
                  <strong>Note:</strong> Some UTXOs require special handling. This is normal for older Counterparty transactions and will be handled automatically.
                </p>
              </div>
            )}
          </>
        )}

        {/* Include Stamps toggle */}
        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-md">
          <div className="flex flex-col">
            <label htmlFor="includeStamps" className="text-sm font-medium text-gray-700">
              Allow STAMPS to be spent
            </label>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              id="includeStamps"
              type="checkbox"
              className="sr-only peer"
              checked={formData.includeStamps}
              onChange={handleIncludeStampsChange}
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
          </label>
        </div>

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
          disabled={!formData.consolidationData || formData.consolidationData.summary.total_utxos === 0 || formData.feeRateSatPerVByte <= 0 || isLoading}
        >
          {isLoading ? "Loading..." : "Continue to Review"}
        </Button>
      </form>
    </div>
  );
}
