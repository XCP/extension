/**
 * Counterparty Transaction Decoding Utilities
 *
 * Handles decoding Bitcoin transactions via Counterparty API and
 * unpacking Counterparty protocol messages from OP_RETURN data.
 */

import { apiClient, API_TIMEOUTS } from '@/utils/apiClient';
import { getSettings } from '@/utils/storage/settingsStorage';

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
  const settings = await getSettings();
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
 * Call Counterparty API to unpack a data hex payload
 */
export async function unpackCounterpartyData(
  dataHex: string,
  verbose: boolean = true
): Promise<UnpackedCounterpartyData | null> {
  const settings = await getSettings();
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
  switch (messageType) {
    case 'enhanced_send':
    case 'send':
      return `Send ${messageData.quantity} ${messageData.asset} to ${messageData.destination}`;
    case 'order':
      return `DEX Order: Give ${messageData.give_quantity} ${messageData.give_asset} for ${messageData.get_quantity} ${messageData.get_asset}`;
    case 'dispenser':
      return `Create Dispenser: ${messageData.give_quantity} ${messageData.asset} per ${messageData.mainchainrate} sats`;
    case 'dispense':
      return `Dispense from ${messageData.dispenser}`;
    case 'issuance':
      return `Issue Asset: ${messageData.asset}${messageData.quantity ? ` (${messageData.quantity} units)` : ''}`;
    case 'dividend':
      return `Pay Dividend: ${messageData.quantity_per_unit} ${messageData.dividend_asset} per ${messageData.asset}`;
    case 'cancel':
      return `Cancel Order: ${messageData.offer_hash}`;
    case 'btcpay':
      return `BTC Pay for Order Match`;
    case 'sweep':
      return `Sweep to ${messageData.destination}`;
    case 'broadcast':
      return `Broadcast: ${messageData.text || 'message'}`;
    case 'fairminter':
      return `Create Fairminter: ${messageData.asset}`;
    case 'fairmint':
      return `Mint from Fairminter: ${messageData.asset}`;
    case 'attach':
      return `Attach ${messageData.quantity} ${messageData.asset} to UTXO`;
    case 'detach':
      return `Detach assets from UTXO`;
    case 'utxo_move':
      return `Move UTXO to ${messageData.destination}`;
    case 'destroy':
      return `Destroy ${messageData.quantity} ${messageData.asset}`;
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
 * Decode Counterparty message from raw transaction hex
 * Returns null if not a Counterparty transaction or decoding fails
 */
export async function decodeCounterpartyMessage(
  rawTxHex: string
): Promise<CounterpartyMessage | null> {
  try {
    const unpacked = await unpackCounterpartyData(rawTxHex, true);
    if (!unpacked) {
      return null;
    }

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
