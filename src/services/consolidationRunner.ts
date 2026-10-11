import { isStaleInputsError } from "@/core/bitcoin/broadcastErrors";
import {
  type ConsolidationData,
  type ConsolidationReport,
  consolidationApi,
} from "@/core/bitcoin/consolidationApi";
import { toConsolidationRequest } from '@/core/bitcoin/consolidationRequest';
import { fromSatoshis } from '@/core/numeric';
import { analytics, classifyTransactionError, getBtcBucket } from "@/platform/fathom";
import { getWalletServiceClient } from "@/services/walletServiceClient";

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

const reportBatch = async (address: string, report: ConsolidationReport): Promise<boolean> => {
  for (let attempt = 1; attempt <= REPORT_ATTEMPTS; attempt++) {
    try {
      await consolidationApi.reportConsolidation(address, report);
      return true;
    } catch (error) {
      if (attempt === REPORT_ATTEMPTS) {
        console.error("Broadcast succeeded but the recovery could not be reported:", error);
        void analytics.track("consolidate_report_failed");
        return false;
      }
      await delay(REPORT_RETRY_MS * attempt);
    }
  }
  return false;
};

interface ConsolidationRun {
  address: string;
  allBatches: ConsolidationData[];
  feeRateSatPerVByte: number;
  destinationAddress?: string;
  includeProtectedStamps: boolean;
  broadcastTransaction: (hex: string) => Promise<string | { txid: string }>;
  onBatch: (batchNumber: number) => void;
  onResults: (results: ConsolidationResult[]) => void;
}

export async function runConsolidation({
  address, allBatches, feeRateSatPerVByte, destinationAddress, includeProtectedStamps,
  broadcastTransaction, onBatch, onResults,
}: ConsolidationRun): Promise<{ results: ConsolidationResult[]; totalBatches: number }> {
  const batchResults: ConsolidationResult[] = [];
  let totalOutputSats = 0;
  let totalBatches = allBatches.length;
  const walletService = getWalletServiceClient();

  const runBatch = async (batch: ConsolidationData, batchNumber: number): Promise<ConsolidationResult> => {
    onBatch(batchNumber);
    try {
      const consolidationResult = await walletService.consolidateBareMultisig(
        address,
        toConsolidationRequest(batch),
        feeRateSatPerVByte,
        destinationAddress,
      );

      const broadcastResult = await broadcastTransaction(consolidationResult.signedTxHex);
      const txid = typeof broadcastResult === "string" ? broadcastResult : broadcastResult.txid;
      console.log(`Batch ${batchNumber} broadcast successfully: ${txid}`);

      // Past this point the coins have moved; nothing below may downgrade the outcome.
      const reported = await reportBatch(address, {
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
      void analytics.track(`consolidate_error_${classifyTransactionError(message)}`);
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
    onResults([...batchResults]);
  };

  // Each batch spends a distinct page of UTXOs, so one failure says nothing about the rest.
  for (const [index, batch] of allBatches.entries()) record(await runBatch(batch, index + 1));

  // Refetch and retry once; persistent stale data must not cause a broadcast loop.
  const staleFailure = batchResults.some(
    (result) => result.status === "error" && result.error && isStaleInputsError(result.error),
  );
  if (staleFailure) {
    try {
      void analytics.track("consolidate_stale_retry");
      const refreshed = await consolidationApi.fetchAllBatches(
        address,
        includeProtectedStamps,
      );
      const remaining = refreshed.filter((batch) => batch.summary.batch_utxos > 0);
      totalBatches += remaining.length;
      for (const batch of remaining) {
        record(await runBatch(batch, batchResults.length + 1));
      }
    } catch (refreshError) {
      console.error("Could not refresh the batch list after a stale-input failure:", refreshError);
    }
  }

  if (batchResults.some((result) => result.status === "success")) {
    void analytics.track("consolidate", getBtcBucket(fromSatoshis(totalOutputSats, { asNumber: true })));
  }
  return { results: batchResults, totalBatches };
}
