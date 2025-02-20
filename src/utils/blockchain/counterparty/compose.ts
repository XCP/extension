import axios from 'axios';

export interface SignedTxEstimatedSize {
  vsize: number;
  adjusted_vsize: number;
  sigops_count: number;
}

export interface AssetInfo {
  asset_longname: string | null;
  description: string;
  issuer: string;
  divisible: boolean;
  locked: boolean;
  owner: string;
}

export interface ComposeParams {
  source: string;
  destination: string;
  asset: string;
  quantity: number;
  memo: string | null;
  memo_is_hex: boolean;
  use_enhanced_send: boolean;
  no_dispense: boolean;
  skip_validation: boolean;
  asset_info: AssetInfo;
  quantity_normalized: string;
}

export interface ComposeResult {
  rawtransaction: string;
  btc_in: number;
  btc_out: number;
  btc_change: number;
  btc_fee: number;
  data: string;
  lock_scripts: string[];
  inputs_values: number[];
  signed_tx_estimated_size: SignedTxEstimatedSize;
  psbt: string;
  params: ComposeParams;
  name: string;
}

export interface ApiResponse {
  result: ComposeResult;
}

export interface ComposeOptions {
  sourceAddress: string;
  signal?: AbortSignal;
  sat_per_vbyte: number;
  max_fee?: number;
  change_address?: string;
  more_outputs?: string;
  use_all_inputs_set?: boolean;
  multisig_pubkey?: string;
  [key: string]: any;
}

export async function composeTransaction(
  endpoint: string,
  paramsObj: any,
  sourceAddress: string,
  signal?: AbortSignal
): Promise<ApiResponse> {
  const apiUrl = `https://api.counterparty.io:4000/v2/addresses/${sourceAddress}/compose/${endpoint}`;
  
  const params = new URLSearchParams({
    ...paramsObj,
    sat_per_vbyte: paramsObj.sat_per_vbyte.toString(),
    exclude_utxos_with_balances: 'true',
    allow_unconfirmed_inputs: 'true',
    disable_utxo_locks: 'true',
    verbose: 'true',
  });

  console.log('Final API URL params:', params.toString());

  const response = await axios.get<ApiResponse>(`${apiUrl}?${params.toString()}`, {
    headers: { 'Content-Type': 'application/json' },
    signal,
  });
  return response.data;
}

export async function composeBet(options: ComposeOptions): Promise<ApiResponse> {
  const {
    sourceAddress,
    feed_address,
    bet_type,
    deadline,
    wager_quantity,
    counterwager_quantity,
    expiration,
    leverage = 5040,
    target_value,
    sat_per_vbyte,
    max_fee,
    signal,
  } = options;
  const paramsObj: any = {
    feed_address,
    bet_type: bet_type.toString(),
    deadline: deadline.toString(),
    wager_quantity: wager_quantity.toString(),
    counterwager_quantity: counterwager_quantity.toString(),
    expiration: expiration.toString(),
    leverage: leverage.toString(),
    sat_per_vbyte,
    ...(target_value !== undefined && { target_value: target_value.toString() }),
    ...(max_fee !== undefined && { max_fee: max_fee.toString() }),
  };
  return composeTransaction('bet', paramsObj, sourceAddress, signal);
}

export async function composeBroadcast(options: ComposeOptions): Promise<ApiResponse> {
  const {
    sourceAddress,
    text,
    value = '0',
    fee_fraction = '0',
    timestamp = Math.floor(Date.now() / 1000).toString(),
    sat_per_vbyte,
    max_fee,
    signal,
  } = options;
  
  const paramsObj: any = {
    text,
    value,
    fee_fraction,
    timestamp,
    sat_per_vbyte,
    ...(max_fee !== undefined && { max_fee: max_fee.toString() }),
  };

  return composeTransaction('broadcast', paramsObj, sourceAddress, signal);
}

export async function composeBTCPay(options: ComposeOptions): Promise<ApiResponse> {
  const { sourceAddress, order_match_id, sat_per_vbyte, max_fee, signal } = options;
  const paramsObj: any = {
    order_match_id,
    sat_per_vbyte,
    ...(max_fee !== undefined && { max_fee: max_fee.toString() }),
  };
  return composeTransaction('btcpay', paramsObj, sourceAddress, signal);
}

export async function composeBurn(options: ComposeOptions): Promise<ApiResponse> {
  const { sourceAddress, quantity, overburn = false, sat_per_vbyte, max_fee, signal } = options;
  const paramsObj: any = {
    quantity: quantity.toString(),
    overburn: overburn.toString(),
    sat_per_vbyte,
    ...(max_fee !== undefined && { max_fee: max_fee.toString() }),
  };
  return composeTransaction('burn', paramsObj, sourceAddress, signal);
}

export async function composeCancel(options: ComposeOptions): Promise<ApiResponse> {
  const { sourceAddress, offer_hash, sat_per_vbyte, max_fee, signal } = options;
  const paramsObj: any = {
    offer_hash: offer_hash.trim(),
    sat_per_vbyte,
    ...(max_fee !== undefined && { max_fee: max_fee.toString() }),
  };
  return composeTransaction('cancel', paramsObj, sourceAddress, signal);
}

export async function composeDestroy(options: ComposeOptions): Promise<ApiResponse> {
  const { sourceAddress, asset, quantity, tag, sat_per_vbyte, max_fee, signal } = options;
  const paramsObj: any = {
    asset,
    quantity: quantity.toString(),
    sat_per_vbyte,
    ...(tag && { tag }),
    ...(max_fee !== undefined && { max_fee: max_fee.toString() }),
  };
  return composeTransaction('destroy', paramsObj, sourceAddress, signal);
}

export async function composeDispenser(options: ComposeOptions): Promise<ApiResponse> {
  const {
    sourceAddress,
    asset,
    give_quantity,
    escrow_quantity,
    mainchainrate,
    status = '0',
    open_address,
    oracle_address,
    sat_per_vbyte,
    max_fee,
    signal,
  } = options;
  const paramsObj: any = {
    asset,
    give_quantity: give_quantity.toString(),
    escrow_quantity: escrow_quantity.toString(),
    mainchainrate: mainchainrate.toString(),
    status: status.toString(),
    sat_per_vbyte,
    ...(open_address && { open_address }),
    ...(oracle_address && { oracle_address }),
    ...(max_fee !== undefined && { max_fee: max_fee.toString() }),
  };
  return composeTransaction('dispenser', paramsObj, sourceAddress, signal);
}

export async function composeDispense(options: ComposeOptions): Promise<ApiResponse> {
  const {
    sourceAddress,
    dispenser,
    quantity,
    encoding,
    pubkeys,
    sat_per_vbyte,
    max_fee,
    signal,
  } = options;
  const paramsObj: any = {
    dispenser,
    quantity: quantity.toString(),
    sat_per_vbyte,
    ...(encoding && { encoding }),
    ...(pubkeys && { pubkeys }),
    ...(max_fee !== undefined && { max_fee: max_fee.toString() }),
  };
  return composeTransaction('dispense', paramsObj, sourceAddress, signal);
}

export async function composeDividend(options: ComposeOptions): Promise<ApiResponse> {
  const {
    sourceAddress,
    asset,
    dividend_asset,
    quantity_per_unit,
    sat_per_vbyte,
    max_fee,
    signal,
  } = options;
  const paramsObj: any = {
    asset,
    dividend_asset,
    quantity_per_unit: quantity_per_unit.toString(),
    ...(sat_per_vbyte !== undefined && { sat_per_vbyte: sat_per_vbyte.toString() }),
    ...(max_fee !== undefined && { max_fee: max_fee.toString() }),
  };
  return composeTransaction('dividend', paramsObj, sourceAddress, signal);
}

export async function getDividendEstimateXcpFee(
  sourceAddress: string,
  asset: string,
  signal?: AbortSignal
): Promise<number> {
  const apiUrl = `https://api.counterparty.io:4000/v2/addresses/${sourceAddress}/compose/dividend/estimatexcpfees`;
  const params = new URLSearchParams({ asset });
  const response = await axios.get<{ result: number }>(`${apiUrl}?${params.toString()}`, { signal });
  return response.data.result;
}

export async function composeIssuance(options: ComposeOptions): Promise<ApiResponse> {
  const {
    sourceAddress,
    asset,
    quantity,
    divisible,
    lock,
    reset,
    transfer_destination,
    description,
    sat_per_vbyte,
    max_fee,
    pubkeys,
    signal,
  } = options;
  const paramsObj: any = {
    asset,
    quantity: quantity.toString(),
    divisible: divisible ? 'true' : 'false',
    lock: lock ? 'true' : 'false',
    reset: reset ? 'true' : 'false',
    ...(transfer_destination && { transfer_destination }),
    ...(description && { description }),
    ...(pubkeys && { pubkeys }),
    ...(sat_per_vbyte !== undefined && { sat_per_vbyte: sat_per_vbyte.toString() }),
    ...(max_fee !== undefined && { max_fee: max_fee.toString() }),
  };
  return composeTransaction('issuance', paramsObj, sourceAddress, signal);
}

export async function composeMPMA(options: ComposeOptions): Promise<ApiResponse> {
  const {
    sourceAddress,
    assets,
    destinations,
    quantities,
    memos,
    memos_are_hex,
    sat_per_vbyte,
    max_fee,
    signal,
  } = options;
  if (
    !Array.isArray(assets) ||
    !Array.isArray(destinations) ||
    !Array.isArray(quantities) ||
    assets.length !== destinations.length ||
    assets.length !== quantities.length
  ) {
    throw new Error('Assets, destinations, and quantities must be arrays of the same length.');
  }
  const asset_dest_quant_list = assets.map((asset: string, index: number) => [
    asset,
    destinations[index],
    Number(quantities[index]),
  ]);
  const paramsObj: any = {
    assets: assets.join(','),
    destinations: destinations.join(','),
    quantities: quantities.join(','),
    ...(memos && memos.length > 0 && { memos: memos.join(',') }),
    ...(memos_are_hex && memos_are_hex.length > 0 && { memos_are_hex: memos_are_hex.join(',') }),
    ...(sat_per_vbyte !== undefined && { sat_per_vbyte: sat_per_vbyte.toString() }),
    ...(max_fee !== undefined && { max_fee: max_fee.toString() }),
  };
  return composeTransaction('mpma', paramsObj, sourceAddress, signal);
}

export async function composeOrder(options: ComposeOptions): Promise<ApiResponse> {
  const {
    sourceAddress,
    give_asset,
    give_quantity,
    get_asset,
    get_quantity,
    expiration,
    sat_per_vbyte,
    max_fee,
    signal,
  } = options;
  const paramsObj: any = {
    give_asset,
    give_quantity: give_quantity.toString(),
    get_asset,
    get_quantity: get_quantity.toString(),
    expiration: expiration.toString(),
    fee_required: '0',
    ...(sat_per_vbyte !== undefined && { sat_per_vbyte: sat_per_vbyte.toString() }),
    ...(max_fee !== undefined && { max_fee: max_fee.toString() }),
  };
  return composeTransaction('order', paramsObj, sourceAddress, signal);
}

export async function composeSend(options: ComposeOptions): Promise<ApiResponse> {
  const { sourceAddress, destination, asset, quantity, memo, memo_is_hex, sat_per_vbyte, max_fee, signal } = options;
  const paramsObj: any = {
    destination,
    asset,
    quantity: quantity.toString(),
    ...(memo && { memo }),
    ...(memo_is_hex !== undefined && { memo_is_hex: memo_is_hex.toString() }),
    ...(sat_per_vbyte !== undefined && { sat_per_vbyte: sat_per_vbyte.toString() }),
    ...(max_fee !== undefined && { max_fee: max_fee.toString() }),
  };
  return composeTransaction('send', paramsObj, sourceAddress, signal);
}

export async function composeSweep(options: ComposeOptions): Promise<ApiResponse> {
  const {
    sourceAddress,
    destination,
    flags,
    memo = '',
    sat_per_vbyte,
    max_fee,
    allow_unconfirmed_inputs = false,
    signal,
  } = options;
  const paramsObj: any = {
    destination,
    flags: flags.toString(),
    memo,
    ...(allow_unconfirmed_inputs !== undefined && { allow_unconfirmed_inputs: allow_unconfirmed_inputs.toString() }),
    ...(sat_per_vbyte !== undefined && { sat_per_vbyte: sat_per_vbyte.toString() }),
    ...(max_fee !== undefined && { max_fee: max_fee.toString() }),
  };
  return composeTransaction('sweep', paramsObj, sourceAddress, signal);
}

export async function getSweepEstimateXcpFee(sourceAddress: string, signal?: AbortSignal): Promise<number> {
  const apiUrl = `https://api.counterparty.io:4000/v2/addresses/${sourceAddress}/compose/sweep/estimatexcpfees`;
  const response = await axios.get<{ result: number }>(apiUrl, { signal });
  return response.data.result;
}

export async function composeFairminter(options: ComposeOptions): Promise<ApiResponse> {
  const {
    sourceAddress,
    asset,
    price = 0,
    quantity_by_price = 1,
    max_mint_per_tx = 0,
    hard_cap = 0,
    premint_quantity = 0,
    start_block = 0,
    end_block = 0,
    soft_cap = 0,
    soft_cap_deadline_block = 0,
    minted_asset_commission = 0.0,
    burn_payment = false,
    lock_description = false,
    lock_quantity = false,
    divisible = true,
    description = '',
    encoding = 'auto',
    sat_per_vbyte,
    max_fee,
    pubkeys,
    allow_unconfirmed_inputs = true,
    signal,
  } = options;
  const paramsObj: any = {
    asset,
    price: price.toString(),
    quantity_by_price: quantity_by_price.toString(),
    max_mint_per_tx: max_mint_per_tx.toString(),
    hard_cap: hard_cap.toString(),
    premint_quantity: premint_quantity.toString(),
    start_block: start_block.toString(),
    end_block: end_block.toString(),
    soft_cap: soft_cap.toString(),
    soft_cap_deadline_block: soft_cap_deadline_block.toString(),
    minted_asset_commission: minted_asset_commission.toString(),
    burn_payment: burn_payment.toString(),
    lock_description: lock_description.toString(),
    lock_quantity: lock_quantity.toString(),
    divisible: divisible ? 'true' : 'false',
    ...(description && { description }),
    encoding,
    ...(sat_per_vbyte !== undefined && { sat_per_vbyte: sat_per_vbyte.toString() }),
    ...(max_fee !== undefined && { max_fee: max_fee.toString() }),
    ...(pubkeys && { pubkeys }),
    allow_unconfirmed_inputs: allow_unconfirmed_inputs.toString(),
  };
  return composeTransaction('fairminter', paramsObj, sourceAddress, signal);
}

export async function composeFairmint(options: ComposeOptions): Promise<ApiResponse> {
  const { sourceAddress, asset, quantity = 0, sat_per_vbyte, max_fee, signal } = options;
  const paramsObj: any = {
    asset,
    quantity: quantity.toString(),
    ...(sat_per_vbyte !== undefined && { sat_per_vbyte: sat_per_vbyte.toString() }),
    ...(max_fee !== undefined && { max_fee: max_fee.toString() }),
  };
  return composeTransaction('fairmint', paramsObj, sourceAddress, signal);
}

export async function composeAttach(options: ComposeOptions): Promise<ApiResponse> {
  const {
    sourceAddress,
    asset,
    quantity,
    utxo_value,
    destination_vout,
    sat_per_vbyte,
    max_fee,
    signal,
  } = options;
  const paramsObj: any = {
    asset,
    quantity: quantity.toString(),
    ...(utxo_value !== undefined && { utxo_value: utxo_value.toString() }),
    ...(destination_vout && { destination_vout }),
    ...(sat_per_vbyte !== undefined && { sat_per_vbyte: sat_per_vbyte.toString() }),
    ...(max_fee !== undefined && { max_fee: max_fee.toString() }),
  };
  return composeTransaction('attach', paramsObj, sourceAddress, signal);
}

export async function getAttachEstimateXcpFee(sourceAddress?: string, signal?: AbortSignal): Promise<number> {
  const apiUrl = `https://api.counterparty.io:4000/v2/addresses/${sourceAddress}/compose/attach/estimatexcpfees`;
  const response = await axios.get<{ result: number }>(apiUrl, { signal });
  return response.data.result;
}

export async function composeDetach(options: ComposeOptions): Promise<ApiResponse> {
  const { sourceAddress, destination, signal } = options;
  const paramsObj: any = { destination };
  return composeTransaction('detach', paramsObj, sourceAddress, signal);
}

export async function composeMovetoutxo(options: ComposeOptions): Promise<ApiResponse> {
  const { sourceAddress, destination, utxo_value, signal } = options;
  const paramsObj: any = {
    destination,
    ...(utxo_value !== undefined && { utxo_value: utxo_value.toString() }),
  };
  return composeTransaction('move', paramsObj, sourceAddress, signal);
}
