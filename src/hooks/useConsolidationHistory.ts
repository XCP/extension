import { useState, useEffect } from "react";
import { consolidationApi } from "@/services/consolidationApiService";

export function useConsolidationHistory(address: string) {
  const [hasHistory, setHasHistory] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function checkHistory() {
      if (!address) {
        setHasHistory(false);
        setIsLoading(false);
        return;
      }

      try {
        const data = await consolidationApi.getConsolidationStatus(address);
        // Check if there are any non-replaced consolidations
        const hasValidHistory = data?.recent_consolidations?.some(
          tx => tx.status !== 'replaced'
        ) || false;
        setHasHistory(hasValidHistory);
      } catch (err) {
        setHasHistory(false);
      } finally {
        setIsLoading(false);
      }
    }

    checkHistory();
  }, [address]);

  return { hasHistory, isLoading };
}