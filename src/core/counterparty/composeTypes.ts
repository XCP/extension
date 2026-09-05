/** Shared response and option types for Counterparty transaction composers. */

export interface SignedTxEstimatedSize {
  vsize: number;
  adjusted_vsize: number;
  sigops_count: number;
}

export interface ComposeAssetInfo {
  asset_longname: string | null;
  description: string;
  issuer: string;
  divisible: boolean;
  locked: boolean;
  owner: string;
  supply?: string;
  supply_normalized?: string;
}

export interface ComposeParams {
  source?: string;
  destination?: string;
  address?: string;
  dispenser?: string;
  asset: string;
  quantity: string | number;
  memo: string | null;
  memo_is_hex: boolean;
  use_enhanced_send: boolean;
  no_dispense: boolean;
  skip_validation: boolean;
  asset_info: ComposeAssetInfo;
  quantity_normalized: string;
  more_outputs?: string;
  lp_asset?: string;
}

export interface DieselMintMetadata {
  utxo_vout: number;
  runestone_vout: number;
  utxo_sats: number;
  /** Exact added output vbytes for this allow-listed shape. */
  marginal_vbytes: number;
  /** Fee-rate-based estimate; the composer can round the whole transaction fee. */
  estimated_marginal_fee_sats: number;
  fee_rate_sat_vbyte: number;
  /** `change` means ordinary wallet change was reshaped into the DIESEL UTXO. */
  utxo_kind: 'change' | 'explicit';
  /** Previous DIESEL UTXO deliberately consumed and routed into this successor. */
  rolled_utxo?: string;
  /** Predicted position of this transaction in the wallet's unconfirmed dependency chain. */
  pending_chain_position?: number;
}

export interface DieselTransferMetadata {
  amount_base_units: string;
  input_utxos: string[];
  recipient_vout: number;
  remainder_vout: number;
  runestone_vout: number;
}

export interface ComposeResult {
  rawtransaction: string;
  btc_in: number;
  btc_out: number;
  btc_change: number;
  btc_fee: number;
  xcp_fee?: number;
  data: string;
  lock_scripts: string[];
  inputs_values: number[];
  signed_tx_estimated_size: SignedTxEstimatedSize;
  psbt: string;
  /**
   * Present only for `encoding=taproot` composes. The ord envelope script carrying the message,
   * and the reveal transaction — already signed by the composer's ephemeral key — that spends the
   * commit output and publishes the content. `rawtransaction` is only the commit, so an
   * inscription is not complete until the reveal is broadcast too.
   */
  envelope_script?: string;
  signed_reveal_rawtransaction?: string;
  params: ComposeParams & {
    asset_dest_quant_list?: [string, string, string | number][];
    memos?: string[];
  };
  name: string;
  /** Present only when the final bytes were locally proved to contain the requested mint. */
  diesel_mint?: DieselMintMetadata;
  /** Present only when the final bytes were locally proved to contain the requested transfer. */
  diesel_transfer?: DieselTransferMetadata;
}

export interface ApiResponse {
  result: ComposeResult;
}

export interface BaseComposeOptions {
  sourceAddress: string;
  sat_per_vbyte: number;
  max_fee?: number;
  encoding?: 'auto' | 'opreturn' | 'multisig' | 'taproot';
}
