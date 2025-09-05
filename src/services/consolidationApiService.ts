/**
 * Consolidation API Service
 * Handles communication with the Laravel consolidation API for batched UTXO recovery
 */

import axios from 'axios';
import { apiClient, API_TIMEOUTS } from '@/utils/api/axiosConfig';

/* ══════════════════════════════════════════════════════════════════════════
 * TYPE DEFINITIONS
 * ══════════════════════════════════════════════════════════════════════════ */

export interface ConsolidationUTXO {
  txid: string;
  vout: number;
  amount: number; // in satoshis
  prev_tx_hex: string;
  script: string;
  position: number; // position in multisig (0 or 1)
  script_type: string;
  has_invalid_pubkeys?: boolean; // Flag from API for data-encoded pubkeys
  pubkey_validation_hint?: string; // Hint about validation issues
}

export interface ConsolidationSummary {
  total_utxos: number;
  total_btc: number;
  batches_required: number;
  current_batch: number;
  batch_utxos: number;
}

export interface ConsolidationFeeConfig {
  fee_address: string;
  fee_percent: number;
  exemption_threshold: number; // in satoshis
}

export interface MempoolStatus {
  pending_consolidations: number;
  pending_utxo_count: number;
  can_broadcast_more: boolean;
}

export interface ConsolidationData {
  address: string;
  pubkey: string; // Uncompressed pubkey
  pubkey_compressed: string; // Compressed pubkey
  summary: ConsolidationSummary;
  fee_config: ConsolidationFeeConfig;
  utxos: ConsolidationUTXO[];
  mempool_status: MempoolStatus;
  validation_summary?: {
    utxos_with_invalid_pubkeys: number;
    requires_special_handling: boolean;
  };
}

export interface ConsolidationReport {
  txid: string;
  batch_number: number;
  utxo_count: number;
  total_input: number; // sats
  network_fee: number; // sats
  service_fee: number; // sats
  output_amount: number; // sats
}

export interface ConsolidationReportResponse {
  status: 'recorded';
  report_id: string;
  next_batch: number;
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
    status: 'pending' | 'confirmed';
    confirmations: number;
    utxos_consolidated: number;
    amount_recovered: number;
  }>;
}

/* ══════════════════════════════════════════════════════════════════════════
 * API SERVICE CLASS
 * ══════════════════════════════════════════════════════════════════════════ */

class ConsolidationApiService {
  private baseUrl: string;

  constructor() {
    // Use Laravel API URL from environment or fallback to production
    this.baseUrl = process.env.LARAVEL_API_URL || 'https://xcp.io';
  }

  /**
   * Fetch consolidation data for a specific batch
   * @param address - Bitcoin address to consolidate
   * @param batch - Batch number (1-based)
   * @param includeStamps - Whether to include Stamps UTXOs
   * @param maxUtxos - Maximum UTXOs per batch (default 420)
   * @returns Consolidation data including UTXOs and fee config
   */
  async fetchConsolidationBatch(
    address: string,
    batch: number = 1,
    includeStamps: boolean = false,
    maxUtxos: number = 420
  ): Promise<ConsolidationData> {
    try {
      const params = new URLSearchParams({
        batch: batch.toString(),
        include_stamps: includeStamps.toString(),
        include_prev_tx: 'true', // Always include for signing
        max_utxos: maxUtxos.toString()
      });

      const response = await apiClient.get<ConsolidationData>(
        `${this.baseUrl}/api/v1/address/${address}/consolidation?${params.toString()}`
      );

      return response.data;
    } catch (error) {
      console.error('Failed to fetch consolidation batch:', error);
      throw new Error('Failed to fetch consolidation data. Please try again.');
    }
  }

  /**
   * Fetch all batches for an address to get complete overview
   * @param address - Bitcoin address to consolidate
   * @param includeStamps - Whether to include Stamps UTXOs
   * @returns Array of consolidation data for all batches
   */
  async fetchAllBatches(
    address: string,
    includeStamps: boolean = false
  ): Promise<ConsolidationData[]> {
    const batches: ConsolidationData[] = [];
    
    try {
      // Fetch first batch to get total batch count
      const firstBatch = await this.fetchConsolidationBatch(address, 1, includeStamps);
      batches.push(firstBatch);
      
      const totalBatches = firstBatch.summary.batches_required;
      
      // Fetch remaining batches if any
      if (totalBatches > 1) {
        const remainingBatches = await Promise.all(
          Array.from({ length: totalBatches - 1 }, (_, i) => 
            this.fetchConsolidationBatch(address, i + 2, includeStamps)
          )
        );
        batches.push(...remainingBatches);
      }
      
      return batches;
    } catch (error) {
      console.error('Failed to fetch all batches:', error);
      throw error;
    }
  }

  /**
   * Report a consolidation transaction that was broadcast
   * @param address - Bitcoin address that was consolidated
   * @param report - Consolidation report details
   * @returns Report response with next batch info
   */
  async reportConsolidation(
    address: string,
    report: ConsolidationReport
  ): Promise<ConsolidationReportResponse> {
    try {
      const response = await apiClient.post<ConsolidationReportResponse>(
        `${this.baseUrl}/api/v1/address/${address}/consolidation/report`,
        report
      );

      return response.data;
    } catch (error) {
      console.error('Failed to report consolidation:', error);
      // Don't throw - reporting is optional for tracking
      return {
        status: 'recorded',
        report_id: 'local-' + Date.now(),
        next_batch: report.batch_number + 1
      };
    }
  }

  /**
   * Get consolidation status and history for an address
   * @param address - Bitcoin address to check
   * @returns Consolidation status and recent history
   */
  async getConsolidationStatus(
    address: string
  ): Promise<ConsolidationStatusResponse> {
    try {
      const response = await apiClient.get<ConsolidationStatusResponse>(
        `${this.baseUrl}/api/v1/address/${address}/consolidation/status`
      );

      return response.data;
    } catch (error) {
      console.error('Failed to fetch consolidation status:', error);
      throw new Error('Failed to fetch consolidation status.');
    }
  }

  /**
   * Check if more batches can be broadcast based on mempool status
   * @param address - Bitcoin address to check
   * @returns Whether more batches can be broadcast
   */
  async canBroadcastMore(address: string): Promise<boolean> {
    try {
      const batch = await this.fetchConsolidationBatch(address, 1, false, 1);
      return batch.mempool_status.can_broadcast_more;
    } catch (error) {
      console.error('Failed to check broadcast status:', error);
      // Default to true if we can't check
      return true;
    }
  }
}

// Export singleton instance
export const consolidationApi = new ConsolidationApiService();

// Export for testing
export { ConsolidationApiService };