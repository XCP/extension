import { useRef, useState } from "react";
import { useNavigate } from "react-router";
import { useWallet } from "@/contexts/wallet-context";
import type { ConsolidationData } from "@/core/bitcoin/consolidationApi";
import { t } from '@/i18n';
import { type ConsolidationResult, runConsolidation } from '@/services/consolidationRunner';

export function useMultiBatchConsolidation() {
  const navigate = useNavigate();
  const { activeWallet, activeAddress, broadcastTransaction } = useWallet();
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentBatch, setCurrentBatch] = useState(0);
  const [results, setResults] = useState<ConsolidationResult[]>([]);
  // State updates cannot block a second submission in the same tick.
  const isRunningRef = useRef(false);

  const consolidateAllBatches = async (
    allBatches: ConsolidationData[],
    feeRateSatPerVByte: number,
    destinationAddress?: string,
    includeProtectedStamps = false,
  ): Promise<ConsolidationResult[] | undefined> => {
    if (isRunningRef.current) return undefined;
    if (!activeWallet || !activeAddress) throw new Error(t('consolidate_wallet_not_ready'));
    isRunningRef.current = true;
    setIsProcessing(true);
    setResults([]);
    try {
      const outcome = await runConsolidation({
        address: activeAddress.address, allBatches, feeRateSatPerVByte, destinationAddress,
        includeProtectedStamps, broadcastTransaction, onBatch: setCurrentBatch, onResults: setResults,
      });
      // Replace the spent form so Back cannot resubmit its batches.
      void navigate("/actions/consolidate/success", {
        replace: true,
        state: { ...outcome, address: activeAddress.address },
      });
      return outcome.results;
    } catch (error) {
      console.error("Consolidation failed:", error);
      throw error;
    } finally {
      isRunningRef.current = false;
      setIsProcessing(false);
      setCurrentBatch(0);
    }
  };

  return { consolidateAllBatches, isProcessing, currentBatch, results };
}
