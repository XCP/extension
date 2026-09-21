import { useState } from "react";
import { useNavigate } from "react-router";
import { useWallet } from "@/contexts/wallet-context";
import { isStaleInputsError } from "@/core/bitcoin/broadcastErrors";
import {
  type ConsolidationData,
  type ConsolidationReport,
  consolidationApi,
} from "@/core/bitcoin/consolidationApi";
import { fromSatoshis } from '@/core/numeric';
import { analytics, classifyTransactionError, getBtcBucket } from "@/platform/fathom";
import { getWalletService } from "@/services/walletService";

export interface ConsolidationResult {
  batchNumber: number;
  txid: string;
  utxosConsolidated: number;
  status: "success" | "error";
  error?: string;
  /** False when the transaction is on the network but the recovery service never recorded it. */
  reported?: boolean;
}

const REPORT_ATTEMPTS = 3;
const REPORT_RETRY_MS = 1_000;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function useMultiBatchConsolidation() {
  const navigate = useNavigate();
  const { activeWallet, activeAddress, broadcastTransaction } = useWallet();
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentBatch, setCurrentBatch] = useState(0);
  const [results, setResults] = useState<ConsolidationResult[]>([]);

  /**
   * Reporting is bookkeeping, not consensus. The coins have already moved by the time this runs, so a
   * failure here must never be shown as a failed batch — but it does matter: an unreported recovery is
   * one the service cannot know consumed its inputs, so it retries before giving up loudly.
   */
  const reportBatch = async (address: string, report: ConsolidationReport): Promise<boolean> => {
    for (let attempt = 1; attempt <= REPORT_ATTEMPTS; attempt++) {
      try {
        await consolidationApi.reportConsolidation(address, report);
        return true;
      } catch (error) {
        if (attempt === REPORT_ATTEMPTS) {
          console.error("Broadcast succeeded but the recovery could not be reported:", error);
          analytics.track("consolidate_report_failed");
          return false;
        }
        await delay(REPORT_RETRY_MS * attempt);
      }
    }
    return false;
  };

  const consolidateAllBatches = async (
    allBatches: ConsolidationData[],
    feeRateSatPerVByte: number,
    destinationAddress?: string,
    includeProtectedStamps = false,
  ) => {
    if (!activeWallet || !activeAddress) {
      throw new Error("Wallet not properly initialized");
    }

    setIsProcessing(true);
    setResults([]);
    const batchResults: ConsolidationResult[] = [];
    let totalOutputSats = 0;
    let totalBatches = allBatches.length;

    try {
      // Signing happens in the background; the key never enters the popup
      const walletService = getWalletService();

      const runBatch = async (batch: ConsolidationData, batchNumber: number): Promise<ConsolidationResult> => {
        setCurrentBatch(batchNumber);
        try {
          // Build and sign the transaction for this batch (in the background)
          const consolidationResult = await walletService.consolidateBareMultisig(
            activeAddress.address,
            batch,
            feeRateSatPerVByte,
            destinationAddress,
          );

          const broadcastResult = await broadcastTransaction(consolidationResult.signedTxHex);
          const txid = typeof broadcastResult === "string" ? broadcastResult : broadcastResult.txid;
          console.log(`Batch ${batchNumber} broadcast successfully: ${txid}`);

          // Past this point the coins have moved; nothing below may downgrade the outcome.
          const reported = await reportBatch(activeAddress.address, {
            raw_transaction_hex: consolidationResult.signedTxHex,
            network_fee: consolidationResult.networkFee,
            service_fee: consolidationResult.serviceFee,
            output_amount: consolidationResult.outputAmount,
            include_protected_stamps: includeProtectedStamps,
          });

          totalOutputSats += consolidationResult.outputAmount;
          return {
            batchNumber,
            txid: txid || "",
            utxosConsolidated: batch.summary.batch_utxos,
            status: "success",
            reported,
          };
        } catch (batchError) {
          const message = batchError instanceof Error ? batchError.message : String(batchError);
          console.error(`Error processing batch ${batchNumber}:`, batchError);
          analytics.track(`consolidate_error_${classifyTransactionError(message)}`);
          return {
            batchNumber,
            txid: "",
            utxosConsolidated: batch.summary.batch_utxos,
            status: "error",
            error: message,
          };
        }
      };

      const record = (result: ConsolidationResult) => {
        batchResults.push(result);
        setResults([...batchResults]);
      };

      // Each batch spends a distinct page of UTXOs, so one failure says nothing about the rest.
      for (const [index, batch] of allBatches.entries()) record(await runBatch(batch, index + 1));

      // A stale batch list is the one failure a second attempt can actually fix, because the refetch
      // excludes everything the batches above just consumed. Exactly one retry, so an address the
      // service is persistently wrong about cannot become a broadcast loop.
      const staleFailure = batchResults.some(
        (result) => result.status === "error" && result.error && isStaleInputsError(result.error),
      );
      if (staleFailure) {
        try {
          analytics.track("consolidate_stale_retry");
          const refreshed = await consolidationApi.fetchAllBatches(
            activeAddress.address,
            includeProtectedStamps,
          );
          const remaining = refreshed.filter((batch) => batch.summary.batch_utxos > 0);
          totalBatches += remaining.length;
          for (const [index, batch] of remaining.entries()) {
            record(await runBatch(batch, batchResults.length + index + 1));
          }
        } catch (refreshError) {
          console.error("Could not refresh the batch list after a stale-input failure:", refreshError);
        }
      }

      if (batchResults.some((result) => result.status === "success")) {
        analytics.track("consolidate", getBtcBucket(fromSatoshis(totalOutputSats, { asNumber: true })));
      }

      // Report every batch, successful or not; the results screen breaks them down.
      //
      // Replace rather than push: the form this run was submitted from is consumed — its batch is
      // spent (or failed) and "back" into it invites re-submitting the same UTXOs. Leaving it on
      // the stack was also half of a navigation loop: results-back pushed a fresh recovery page,
      // whose back popped to results, forever.
      navigate("/actions/consolidate/success", {
        replace: true,
        state: {
          results: batchResults,
          totalBatches,
          address: activeAddress.address,
        },
      });

      return batchResults;
    } catch (error) {
      console.error("Consolidation failed:", error);
      throw error;
    } finally {
      setIsProcessing(false);
      setCurrentBatch(0);
    }
  };

  return {
    consolidateAllBatches,
    isProcessing,
    currentBatch,
    results,
  };
}
