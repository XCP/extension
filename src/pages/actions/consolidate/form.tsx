import { useEffect, useState } from "react";
import { AddressHeader } from "@/components/domain/address/address-header";
import { Button } from "@/components/ui/button";
import { DestinationInput } from "@/components/ui/inputs/destination-input";
import { FeeRateInput } from "@/components/ui/inputs/fee-rate-input";
import { useWallet } from "@/contexts/wallet-context";
import {
  type ConsolidationData,
  consolidationApi,
} from "@/core/bitcoin/consolidationApi";
import { formatAmount } from "@/core/format";
import { analytics } from "@/platform/fathom";

export interface ConsolidationFormData {
  feeRateSatPerVByte: number;
  destinationAddress: string;
  consolidationData: ConsolidationData | null;
  allBatches: ConsolidationData[];
  includeProtectedStamps: boolean;
}

const DEFAULT_FORM_DATA: ConsolidationFormData = {
  feeRateSatPerVByte: 0,
  destinationAddress: "",
  consolidationData: null,
  allBatches: [],
  includeProtectedStamps: false,
};

interface ConsolidationFormProps {
  onSubmit: (data: ConsolidationFormData) => void;
  showHelpText?: boolean;
}

export function ConsolidationForm({ onSubmit, showHelpText }: ConsolidationFormProps) {
  const { activeAddress, activeWallet } = useWallet();
  const [formData, setFormData] =
    useState<ConsolidationFormData>(DEFAULT_FORM_DATA);
  const [isLoading, setIsLoading] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // The tracker's pending count, re-checked against the chain before it is asserted to the user.
  // Null while unchecked or uncheckable, in which case the tracker's own number is all there is.
  const [verifiedPending, setVerifiedPending] = useState<number | null>(null);

  const trackerPending =
    formData.consolidationData?.mempool_status.pending_consolidations ?? 0;
  useEffect(() => {
    if (trackerPending === 0 || !activeAddress?.address) {
      setVerifiedPending(null);
      return;
    }
    let cancelled = false;
    consolidationApi.chainVerifiedPendingCount(activeAddress.address).then((count) => {
      if (!cancelled) setVerifiedPending(count);
    });
    return () => {
      cancelled = true;
    };
  }, [trackerPending, activeAddress?.address]);
  // The chain outranks the bookkeeper: a recovery the chain has confirmed is not pending no
  // matter what a lagging or freshly recovered tracker still says.
  const pendingRecoveries = verifiedPending ?? trackerPending;

  // Fetch recovery data for the active address.
  useEffect(() => {
    async function fetchData() {
      if (!activeAddress) return;

      // Only show loading state on initial load, not on stamp toggle
      if (isInitialLoad) {
        setIsLoading(true);
      }
      setError(null);

      try {
        // Fetch all batches to show complete overview
        const batches = await consolidationApi.fetchAllBatches(
          activeAddress.address,
          formData.includeProtectedStamps,
        );

        setFormData((prev) => ({
          ...prev,
          consolidationData: batches[0]!, // First batch for initial display
          allBatches: batches,
        }));

        // Mark initial load as complete
        if (isInitialLoad) {
          setIsInitialLoad(false);
          // Funnel: separate ineligible visitors from prospects who saw a quote
          analytics.track(
            batches[0]!.summary.total_utxos > 0
              ? 'consolidate_eligible'
              : 'consolidate_ineligible'
          );
        }
      } catch (err) {
        console.error("Error fetching consolidation data:", err);
        if (isInitialLoad) {
          analytics.track('consolidate_fetch_error');
        }
        setError(
          err instanceof Error
            ? err.message
            : "Failed to fetch consolidation data",
        );
      } finally {
        setIsLoading(false);
      }
    }

    fetchData();
  }, [activeAddress, formData.includeProtectedStamps, isInitialLoad]);

  const handleFeeRateChange = (value: number | null) => {
    setFormData((prev) => ({ ...prev, feeRateSatPerVByte: value ?? 0 }));
  };

  const handleDestinationChange = (value: string) => {
    setFormData((prev) => ({ ...prev, destinationAddress: value.trim() }));
  };

  const handleProtectedStampsChange = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    setIsLoading(true);
    setFormData((prev) => ({
      ...prev,
      includeProtectedStamps: event.target.checked,
      consolidationData: null,
      allBatches: [],
    }));
  };

  const handleSubmitInternal = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (formData.feeRateSatPerVByte <= 0) {
      setError("Enter a valid fee rate before continuing.");
      return;
    }
    if (
      !formData.consolidationData ||
      formData.consolidationData.stamp_protection.included !==
        formData.includeProtectedStamps
    ) {
      setError("Stamp protection status is still updating. Please try again.");
      return;
    }
    onSubmit(formData);
  };

  return (
    <div className="space-y-4">
      {activeAddress && (
        <AddressHeader
          address={activeAddress.address}
          walletName={activeWallet?.name}
          className="mt-1 mb-5"
        />
      )}
      <form
        onSubmit={handleSubmitInternal}
        className="bg-white rounded-lg shadow-lg p-4 space-y-6"
      >
        {error && (
          <div className="p-3 bg-red-100 text-red-700 rounded-md" role="alert">
            {error}
          </div>
        )}

        {/* Mempool warning — only for recoveries the chain itself has not yet confirmed. */}
        {!isLoading && pendingRecoveries > 0 && (
          <div className="p-3 bg-amber-100 text-amber-700 rounded-md">
            <strong>Warning:</strong> You have {pendingRecoveries} pending recovery transaction
            {pendingRecoveries > 1 ? "s" : ""}. Please wait for{" "}
            {pendingRecoveries > 1 ? "them" : "it"} to confirm before starting new ones.
          </div>
        )}

        {/* Always show the data section to prevent layout shift */}
        <div className="space-y-2">
          <h2 className="font-semibold">Recoverable</h2>
          <div className="flex justify-between">
            <span className="text-gray-600">Total Bitcoin</span>
            <span className="font-medium">
              {isLoading ? (
                <span className="text-gray-400">…</span>
              ) : formData.consolidationData ? (
                `${formatAmount({
                  value: formData.consolidationData.summary.total_btc,
                  minimumFractionDigits: 8,
                  maximumFractionDigits: 8,
                })} BTC`
              ) : (
                <span className="text-gray-400">—</span>
              )}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Total UTXOs</span>
            <span className="font-medium">
              {isLoading ? (
                <span className="text-gray-400">…</span>
              ) : formData.consolidationData ? (
                formData.consolidationData.summary.total_utxos
              ) : (
                <span className="text-gray-400">—</span>
              )}
            </span>
          </div>
          {!isLoading &&
            formData.consolidationData &&
            formData.consolidationData.summary.batches_required > 1 && (
              <div className="flex justify-between">
                <span className="text-gray-600"># of Batches</span>
                <span className="font-medium">
                  {formData.consolidationData.summary.batches_required} txs
                </span>
              </div>
            )}
        </div>

        {!isLoading &&
          formData.consolidationData &&
          formData.consolidationData.validation_summary
            ?.requires_special_handling && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-md">
              <p className="text-sm text-amber-900">
                <strong>Note:</strong> Some UTXOs require special handling. This
                is normal for older Counterparty transactions and will be
                handled automatically.
              </p>
            </div>
          )}

        <div className="rounded-md border border-amber-300 bg-amber-50 p-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <label
                htmlFor="includeProtectedStamps"
                className="text-sm font-semibold text-amber-950 cursor-pointer"
              >
                Include Stamp UTXOs in recovery
              </label>
              <p className="mt-1 text-sm text-amber-900">
                Keep this off unless you knowingly intend to destroy Stamp
                UTXOs.
              </p>
              {!formData.includeProtectedStamps &&
              formData.consolidationData?.stamp_protection.protected_utxos ? (
                <p className="mt-1 text-sm font-medium text-amber-950">
                  {formData.consolidationData.stamp_protection.protected_utxos}{" "}
                  protected UTXO
                  {formData.consolidationData.stamp_protection
                    .protected_utxos === 1
                    ? " is"
                    : "s are"}{" "}
                  excluded.
                </p>
              ) : null}
            </div>
            <input
              id="includeProtectedStamps"
              type="checkbox"
              checked={formData.includeProtectedStamps}
              onChange={handleProtectedStampsChange}
              className="mt-1 size-5 shrink-0 accent-red-600 cursor-pointer"
            />
          </div>
        </div>

        <DestinationInput
          value={formData.destinationAddress}
          onChange={handleDestinationChange}
          label="Destination Address (Optional)"
          placeholder="Leave empty to consolidate to source address"
          required={false}
          showHelpText={showHelpText}
          helpText="If left empty, UTXOs will be consolidated to your source address."
        />

        <FeeRateInput
          onFeeRateChange={handleFeeRateChange}
          showHelpText={showHelpText}
        />

        <Button
          type="submit"
          color="blue"
          fullWidth
          disabled={
            !formData.consolidationData ||
            formData.consolidationData.summary.total_utxos === 0 ||
            formData.feeRateSatPerVByte <= 0 ||
            isLoading
          }
        >
          {isLoading ? "Loading…" : "Continue to Review"}
        </Button>
      </form>
    </div>
  );
}
