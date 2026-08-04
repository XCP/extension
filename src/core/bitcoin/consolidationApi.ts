import { apiClient } from "@/core/api/client";

const API_BASE_URL = "https://api.xcp.io";
const SATOSHIS_PER_BTC = 100_000_000;
/**
 * Fallback only. The service owns this bound and reports it as `summary.max_outputs_per_page`; keeping
 * a second authoritative copy here is how pagination silently breaks the day the two disagree.
 */
const DEFAULT_MAX_OUTPUTS_PER_RECOVERY = 420;

interface RecoveryOutput {
  txid: string;
  vout: number;
  value_sats: number;
  script_pubkey_hex: string;
  layout: string;
  recovery_key_position: number;
}

interface RecoveryPageResponse {
  address: string;
  summary: {
    total_outputs: number;
    total_value_sats: number;
    pages: number;
    current_page: number;
    outputs_on_page: number;
    max_outputs_per_page?: number;
  };
  fee: { address: string | null; percent: number; exemption_sats: number };
  pending_attempts: number;
  outputs: RecoveryOutput[];
  transactions: Record<string, string | null>;
  missing_transactions: string[];
  protection: {
    protected_stamp_outputs: number;
    protected_stamp_value_sats: number;
    included: boolean;
  };
}

interface RecoveryAttempt {
  txid: string;
  status: "pending" | "confirmed" | "replaced";
  replacement_txid: string | null;
  network_fee_sats: number;
  service_fee_sats: number;
  output_value_sats: number;
  confirmations: number;
  block_time: number | null;
  reported_at: number;
  input_count: number;
}

interface RecoveryAttemptsResponse {
  address: string;
  recoveries: RecoveryAttempt[];
}

export interface ConsolidationUTXO {
  txid: string;
  vout: number;
  amount: number;
  prev_tx_hex: string;
  script: string;
  position: number;
  script_type: string;
}

export interface ConsolidationData {
  address: string;
  summary: {
    total_utxos: number;
    total_btc: number;
    batches_required: number;
    current_batch: number;
    batch_utxos: number;
    /** Service-reported ceiling on UTXOs per recovery transaction. */
    max_batch_utxos: number;
  };
  fee_config: {
    fee_address: string;
    fee_percent: number;
    exemption_threshold: number;
  };
  utxos: ConsolidationUTXO[];
  mempool_status: {
    pending_consolidations: number;
    pending_utxo_count: number;
    can_broadcast_more: boolean;
  };
  validation_summary?: {
    utxos_with_invalid_pubkeys: number;
    requires_special_handling: boolean;
  };
  stamp_protection: {
    protected_utxos: number;
    protected_btc: number;
    included: boolean;
  };
}

export interface ConsolidationReport {
  raw_transaction_hex: string;
  network_fee: number;
  service_fee: number;
  output_amount: number;
  include_protected_stamps: boolean;
}

export interface ConsolidationReportResponse {
  status: "pending";
  txid: string;
  inputs: number;
}

export interface ConsolidationStatusResponse {
  address: string;
  status: {
    available_utxos: number;
    pending_utxos: number;
    confirmed_consolidations: number;
    total_recovered_btc: number;
  };
  recent_consolidations: Array<{
    txid: string;
    timestamp: string;
    status: "pending" | "confirmed" | "replaced";
    confirmations: number;
    utxos_consolidated: number;
    amount_recovered: number;
    replaced_by?: string;
  }>;
}

function toConsolidationData(page: RecoveryPageResponse): ConsolidationData {
  if (page.missing_transactions.length > 0) {
    throw new Error(
      "Recovery transaction data is still being indexed. Please try again later.",
    );
  }
  return {
    address: page.address,
    summary: {
      total_utxos: page.summary.total_outputs,
      total_btc: page.summary.total_value_sats / SATOSHIS_PER_BTC,
      batches_required: page.summary.pages,
      current_batch: page.summary.current_page,
      batch_utxos: page.summary.outputs_on_page,
      max_batch_utxos: page.summary.max_outputs_per_page ?? DEFAULT_MAX_OUTPUTS_PER_RECOVERY,
    },
    fee_config: {
      fee_address: page.fee.address ?? "",
      fee_percent: page.fee.percent,
      exemption_threshold: page.fee.exemption_sats,
    },
    utxos: page.outputs.map((output) => ({
      txid: output.txid,
      vout: output.vout,
      amount: output.value_sats,
      prev_tx_hex: page.transactions[output.txid]!,
      script: output.script_pubkey_hex,
      position: output.recovery_key_position,
      script_type: output.layout,
    })),
    mempool_status: {
      pending_consolidations: page.pending_attempts,
      pending_utxo_count: 0,
      can_broadcast_more: page.pending_attempts === 0,
    },
    stamp_protection: {
      protected_utxos: page.protection.protected_stamp_outputs,
      protected_btc:
        page.protection.protected_stamp_value_sats / SATOSHIS_PER_BTC,
      included: page.protection.included,
    },
  };
}

class ConsolidationApiService {
  async fetchConsolidationBatch(
    address: string,
    batch = 1,
    maxUtxos = DEFAULT_MAX_OUTPUTS_PER_RECOVERY,
    includeProtectedStamps = false,
  ): Promise<ConsolidationData> {
    const response = await apiClient.get<RecoveryPageResponse>(
      `${API_BASE_URL}/addresses/${encodeURIComponent(address)}/recovery`,
      {
        params: {
          page: batch,
          limit: maxUtxos,
          ...(includeProtectedStamps ? { include_protected_stamps: true } : {}),
        },
      },
    );
    return toConsolidationData(response.data);
  }

  async fetchAllBatches(
    address: string,
    includeProtectedStamps = false,
  ): Promise<ConsolidationData[]> {
    // The first page settles how large the remaining ones may be, so the service stays the single
    // authority on batch size even as it changes.
    const probe = await this.fetchConsolidationBatch(
      address,
      1,
      DEFAULT_MAX_OUTPUTS_PER_RECOVERY,
      includeProtectedStamps,
    );
    const batchSize = probe.summary.max_batch_utxos;
    const firstBatch =
      batchSize === DEFAULT_MAX_OUTPUTS_PER_RECOVERY
        ? probe
        : await this.fetchConsolidationBatch(address, 1, batchSize, includeProtectedStamps);
    const rest = await Promise.all(
      Array.from({ length: firstBatch.summary.batches_required - 1 }, (_, index) =>
        this.fetchConsolidationBatch(address, index + 2, batchSize, includeProtectedStamps),
      ),
    );
    return [firstBatch, ...rest];
  }

  async reportConsolidation(
    address: string,
    report: ConsolidationReport,
  ): Promise<ConsolidationReportResponse> {
    const response = await apiClient.post<ConsolidationReportResponse>(
      `${API_BASE_URL}/addresses/${encodeURIComponent(address)}/recoveries`,
      {
        raw_transaction_hex: report.raw_transaction_hex,
        network_fee_sats: report.network_fee,
        service_fee_sats: report.service_fee,
        output_value_sats: report.output_amount,
        ...(report.include_protected_stamps
          ? { include_protected_stamps: true }
          : {}),
      },
    );
    return response.data;
  }

  async getConsolidationStatus(
    address: string,
  ): Promise<ConsolidationStatusResponse> {
    const [recovery, attempts] = await Promise.all([
      this.fetchConsolidationBatch(address, 1, 1),
      apiClient.get<RecoveryAttemptsResponse>(
        `${API_BASE_URL}/addresses/${encodeURIComponent(address)}/recoveries`,
      ),
    ]);
    const rows = attempts.data.recoveries;
    return {
      address,
      status: {
        available_utxos: recovery.summary.total_utxos,
        pending_utxos: rows
          .filter((row) => row.status === "pending")
          .reduce((sum, row) => sum + row.input_count, 0),
        confirmed_consolidations: rows.filter(
          (row) => row.status === "confirmed",
        ).length,
        total_recovered_btc:
          rows
            .filter((row) => row.status === "confirmed")
            .reduce((sum, row) => sum + row.output_value_sats, 0) /
          SATOSHIS_PER_BTC,
      },
      recent_consolidations: rows.map((row) => ({
        txid: row.txid,
        timestamp: new Date(
          (row.block_time ?? row.reported_at) * 1000,
        ).toISOString(),
        status: row.status,
        confirmations: row.confirmations,
        utxos_consolidated: row.input_count,
        amount_recovered: row.output_value_sats / SATOSHIS_PER_BTC,
        replaced_by: row.replacement_txid ?? undefined,
      })),
    };
  }
}

export const consolidationApi = new ConsolidationApiService();
export { ConsolidationApiService };
