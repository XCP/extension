/**
 * Counterparty Transaction Decoding Utilities
 *
 * Handles decoding Bitcoin transactions via Counterparty API and
 * unpacking Counterparty protocol messages from OP_RETURN data.
 */

import { API_TIMEOUTS, apiClient } from '@/core/api/client';
import { fetchAssetDetails } from '@/core/counterparty/api';
import { fromSatoshis } from '@/core/numeric';
import { getActiveSettings } from '@/core/settings';

/**
 * Counterparty message decoded from OP_RETURN
 */
export interface CounterpartyMessage {
  messageType: string;     // e.g., "enhanced_send", "order", "dispenser"
  messageTypeId: number;
  messageData: Record<string, unknown>;
  /** Human-readable description of what this message does */
  description: string;
}

/**
 * Decoded Bitcoin transaction from Counterparty API
 */
export interface DecodedBitcoinTransaction {
  txid: string;
  size?: number;
  vsize?: number;
  weight?: number;
  vin: Array<{
    txid: string;
    vout: number;
    scriptSig?: { asm: string; hex: string };
  }>;
  vout: Array<{
    value: number;
    n: number;
    scriptPubKey: {
      asm: string;
      hex: string;
      address?: string;
      type: string;
    };
  }>;
}

/**
 * Unpacked Counterparty data result
 */
export interface UnpackedCounterpartyData {
  message_type: string;
  message_type_id: number;
  message_data: Record<string, unknown>;
}

/** The hex encoding of "CNTRPRTY" prefix used in OP_RETURN */
export const COUNTERPARTY_PREFIX_HEX = '434e545250525459';

/**
 * Call Counterparty API to decode a raw transaction
 */
export async function decodeRawTransaction(
  rawTxHex: string,
  verbose: boolean = true
): Promise<DecodedBitcoinTransaction> {
  const settings = getActiveSettings();
  const apiBase = settings.counterpartyApiBase || 'https://api.counterparty.io';

  const url = `${apiBase}/v2/bitcoin/transactions/decode`;
  const params = new URLSearchParams({
    rawtx: rawTxHex,
    verbose: verbose.toString(),
  });

  const response = await apiClient.get<{ result: DecodedBitcoinTransaction }>(`${url}?${params}`, {
    timeout: API_TIMEOUTS.DEFAULT,
    headers: { 'Content-Type': 'application/json' },
  });

  if (response.status !== 200 || !response.data?.result) {
    throw new Error('Failed to decode transaction');
  }

  return response.data.result;
}

/**
 * Fetch the satoshi value of a specific transaction output.
 * Uses mempool.space with blockstream.info fallback.
 */
async function _fetchOutputValue(txid: string, vout: number): Promise<number | null> {
  const endpoints = [
    `https://mempool.space/api/tx/${txid}`,
    `https://blockstream.info/api/tx/${txid}`,
  ];

  for (const url of endpoints) {
    try {
      const response = await apiClient.get<{ vout: Array<{ value: number }> }>(url, { retries: 0 });
      if (response.data?.vout?.[vout]) {
        return response.data.vout[vout].value;
      }
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * Look up input values for a decoded transaction.
 * Returns a map of "txid:vout" → satoshi value.
 */
export async function fetchInputValues(
  inputs: Array<{ txid: string; vout: number }>
): Promise<Map<string, number>> {
  const values = new Map<string, number>();

  // Deduplicate by txid to minimize API calls
  const uniqueTxids = [...new Set(inputs.map(i => i.txid))];

  await Promise.all(uniqueTxids.map(async (txid) => {
    const endpoints = [
      `https://mempool.space/api/tx/${txid}`,
      `https://blockstream.info/api/tx/${txid}`,
    ];

    for (const url of endpoints) {
      try {
        const response = await apiClient.get<{ vout: Array<{ value: number }> }>(url, { retries: 0 });
        if (response.data?.vout) {
          // Store all vout values for this txid
          for (const input of inputs) {
            if (input.txid === txid && response.data.vout[input.vout]) {
              values.set(`${txid}:${input.vout}`, response.data.vout[input.vout]!.value);
            }
          }
          break; // Success, skip fallback
        }
      } catch {
        continue;
      }
    }
  }));

  return values;
}

/**
 * Call Counterparty API to unpack a data hex payload
 */
export async function unpackCounterpartyData(
  dataHex: string,
  verbose: boolean = true
): Promise<UnpackedCounterpartyData | null> {
  const settings = getActiveSettings();
  const apiBase = settings.counterpartyApiBase || 'https://api.counterparty.io';

  const url = `${apiBase}/v2/transactions/unpack`;
  const params = new URLSearchParams({
    datahex: dataHex,
    verbose: verbose.toString(),
  });

  try {
    const response = await apiClient.get<{ result: UnpackedCounterpartyData }>(`${url}?${params}`, {
      timeout: API_TIMEOUTS.DEFAULT,
      headers: { 'Content-Type': 'application/json' },
    });

    if (response.status !== 200 || !response.data?.result) {
      return null;
    }

    const result = response.data.result;

    // Check for unpack errors
    if (result.message_data?.error) {
      console.warn('Counterparty unpack error:', result.message_data.error);
      return null;
    }

    return result;
  } catch (err) {
    console.warn('Failed to unpack Counterparty data:', err);
    return null;
  }
}

/**
 * Generate human-readable description for a Counterparty message
 */
export function describeCounterpartyMessage(
  messageType: string,
  messageData: Record<string, unknown>
): string {
  /** Resolve display name for an asset field, preferring asset_longname for subassets. */
  const displayName = (assetField: string): string => {
    const raw = String(messageData[assetField] ?? '');
    const info = messageData[`${assetField}_info`] as Record<string, unknown> | undefined;
    return (info?.asset_longname && typeof info.asset_longname === 'string')
      ? info.asset_longname
      : raw;
  };

  /**
   * Normalize a raw quantity for display.
   * Checks (in order): _normalized field from API, then _info.divisible flag
   * (injected by enrichWithAssetInfo for all assets including BTC/XCP).
   */
  const q = (qtyField: string, assetField?: string): string => {
    // 1. API already provided a normalized value
    const normalized = messageData[`${qtyField}_normalized`];
    if (normalized != null) return String(normalized);

    const raw = messageData[qtyField];
    if (raw == null) return '?';

    // 2. Check verbose asset_info for divisibility
    const _assetName = assetField ? String(messageData[assetField] ?? '') : '';
    const infoKey = assetField ? `${assetField}_info` : 'asset_info';
    const assetInfo = messageData[infoKey] as Record<string, unknown> | undefined;

    if (assetInfo?.divisible === true) {
      return fromSatoshis(Number(raw));
    }

    return BigInt(String(raw)).toLocaleString();
  };

  /**
   * The recipient of a send. `/v2/transactions/unpack` names this field
   * `address` for both send variants, while sweep and utxo_move use
   * `destination` — so both keys are read rather than assuming one shape.
   * Reading only `destination` rendered every send headline as "to undefined".
   */
  const recipient = (): string =>
    String(messageData.address ?? messageData.destination ?? 'unknown address');

  switch (messageType) {
    case 'enhanced_send':
    case 'send':
      return `Send ${q('quantity', 'asset')} ${displayName('asset')} to ${recipient()}`;
    case 'order':
      return `DEX Order: Give ${q('give_quantity', 'give_asset')} ${displayName('give_asset')} for ${q('get_quantity', 'get_asset')} ${displayName('get_asset')}`;
    case 'dispenser':
      return `Create Dispenser: ${q('give_quantity', 'asset')} ${displayName('asset')} per ${messageData.mainchainrate} sats`;
    case 'dispense':
      return `Dispense from ${messageData.dispenser}`;
    case 'issuance':
      return `Issue Asset: ${displayName('asset')}${messageData.quantity ? ` (${q('quantity', 'asset')} units)` : ''}`;
    case 'dividend':
      return `Pay Dividend: ${q('quantity_per_unit', 'dividend_asset')} ${displayName('dividend_asset')} per ${displayName('asset')}`;
    case 'cancel':
      return `Cancel Order: ${messageData.offer_hash}`;
    case 'btcpay':
      return `BTC Pay for Order Match`;
    case 'sweep':
      return `Sweep to ${messageData.destination}`;
    case 'broadcast':
      return `Broadcast: ${messageData.text || 'message'}`;
    case 'fairminter':
      return `Create Fairminter: ${displayName('asset')}`;
    case 'fairmint':
      return `Mint from Fairminter: ${displayName('asset')}`;
    case 'pooldeposit':
      return `Deposit liquidity: ${q('quantity_a', 'asset_a')} ${displayName('asset_a')} and ${q('quantity_b', 'asset_b')} ${displayName('asset_b')}`;
    case 'poolwithdraw':
      return `Withdraw liquidity: burn ${q('quantity')} LP tokens from ${displayName('asset_a')}/${displayName('asset_b')}`;
    case 'attach':
      return `Attach ${q('quantity', 'asset')} ${displayName('asset')} to UTXO`;
    case 'detach':
      return `Detach assets from UTXO`;
    case 'utxo_move':
      return `Move UTXO to ${messageData.destination}`;
    case 'destroy':
      return `Destroy ${q('quantity', 'asset')} ${displayName('asset')}`;
    default:
      return `Counterparty ${messageType} transaction`;
  }
}

/**
 * Check if OP_RETURN data contains Counterparty prefix
 */
export function hasCounterpartyPrefix(opReturnData: string): boolean {
  return opReturnData.includes(COUNTERPARTY_PREFIX_HEX);
}

/**
 * Find all asset field names in messageData using Counterparty naming convention.
 * Fields are either 'asset' or end with '_asset' (e.g., 'give_asset', 'get_asset', 'dividend_asset').
 */
function findAssetFields(data: Record<string, unknown>): string[] {
  return Object.keys(data).filter(k => k === 'asset' || k.endsWith('_asset'));
}

/**
 * Enrich messageData with asset divisibility info.
 * The unpack endpoint doesn't include _info or _normalized fields, so we
 * inject known divisibility for BTC/XCP and fetch from the API for the rest.
 * This allows describeCounterpartyMessage's q() helper to normalize quantities correctly.
 */
async function enrichWithAssetInfo(data: Record<string, unknown>): Promise<void> {
  const assetFields = findAssetFields(data);

  // BTC and XCP are always divisible (protocol-level) — inject directly
  for (const field of assetFields) {
    const name = String(data[field] ?? '').toUpperCase();
    if (name === 'BTC' || name === 'XCP') {
      data[`${field}_info`] = { divisible: true };
    }
  }

  // Fetch divisibility for remaining assets that still need it
  const needsLookup = assetFields
    .filter(f => !data[`${f}_info`])
    .map(f => String(data[f] ?? ''))
    .filter(Boolean);

  if (needsLookup.length === 0) return;

  const unique = [...new Set(needsLookup)];
  const infos = await Promise.all(
    unique.map(a => fetchAssetDetails(a).catch(() => null))
  );

  for (let i = 0; i < unique.length; i++) {
    if (infos[i]) {
      for (const field of assetFields) {
        if (String(data[field]) === unique[i]) {
          data[`${field}_info`] = {
            divisible: infos[i]!.divisible,
            asset_longname: infos[i]!.asset_longname,
          };
        }
      }
    }
  }
}

/**
 * Decode Counterparty message from datahex (decrypted OP_RETURN payload with CNTRPRTY prefix).
 * Enriches messageData with asset divisibility info for display normalization.
 * Returns null if unpacking fails.
 */
export async function decodeCounterpartyMessage(
  dataHex: string
): Promise<CounterpartyMessage | null> {
  try {
    const unpacked = await unpackCounterpartyData(dataHex, true);
    if (!unpacked) {
      return null;
    }

    // Enrich with asset divisibility info before generating description
    await enrichWithAssetInfo(unpacked.message_data);

    return {
      messageType: unpacked.message_type,
      messageTypeId: unpacked.message_type_id,
      messageData: unpacked.message_data,
      description: describeCounterpartyMessage(unpacked.message_type, unpacked.message_data),
    };
  } catch {
    return null;
  }
}

