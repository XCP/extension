/**
 * Counterparty Transaction Decoding Utilities
 *
 * Handles decoding Bitcoin transactions via Counterparty API and
 * unpacking Counterparty protocol messages from OP_RETURN data.
 */

import { API_TIMEOUTS, apiClient } from '@/core/api/client';
import { noTrustedPrevout, type TrustedPrevoutResolver } from '@/core/bitcoin/trustedPrevout';
import { getCachedBroadcastPrevout } from '@/core/bitcoin/utxo';
import { fetchAssetDetails } from '@/core/counterparty/api';
import { type DescribableMessage, describeMessage } from '@/core/counterparty/describe';
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

/** A resolved previous output: what an input is actually spending. */
export interface InputPrevout {
  value: number;
  /** Owning address, when the source API could attribute the script. */
  address?: string;
}

/**
 * Look up input values for a decoded transaction.
 * Returns a map of "txid:vout" → satoshi value.
 */
export async function fetchInputValues(
  inputs: Array<{ txid: string; vout: number }>,
  resolveTrustedPrevout: TrustedPrevoutResolver = noTrustedPrevout
): Promise<Map<string, number>> {
  const prevouts = await fetchInputPrevouts(inputs, resolveTrustedPrevout);
  return new Map([...prevouts].map(([key, prevout]) => [key, prevout.value]));
}

/**
 * Look up both the value and the owning address of each input's previous
 * output. The address matters because a movement summary that cannot tell
 * whose input it is has to report the net effect as undetermined.
 */
export async function fetchInputPrevouts(
  inputs: Array<{ txid: string; vout: number }>,
  resolveTrustedPrevout: TrustedPrevoutResolver = noTrustedPrevout
): Promise<Map<string, InputPrevout>> {
  const values = new Map<string, InputPrevout>();

  // Resolve our own just-broadcast change locally first. The provider broadcast path stores these
  // prevouts from the signed parent bytes, so fee and movement review do not briefly become
  // unknown while public Bitcoin indexers catch up.
  await Promise.all(inputs.map(async (input) => {
    // A successful wallet broadcast already supplied these exact immutable parent bytes in
    // this context. This proves value/ownership, not whether the output is safe to spend.
    const local = getCachedBroadcastPrevout(input.txid, input.vout);
    if (local) {
      values.set(`${input.txid}:${input.vout}`, { value: local.value, ...(local.address ? { address: local.address } : {}) });
      return;
    }
    const prevout = await resolveTrustedPrevout(input.txid, input.vout);
    if (!prevout) return;
    values.set(`${input.txid}:${input.vout}`, {
      value: prevout.value,
      address: prevout.address,
    });
  }));

  // Deduplicate by txid to minimize API calls
  const unresolvedInputs = inputs.filter((input) => !values.has(`${input.txid}:${input.vout}`));
  const uniqueTxids = [...new Set(unresolvedInputs.map(i => i.txid))];

  await Promise.all(uniqueTxids.map(async (txid) => {
    const endpoints = [
      `https://mempool.space/api/tx/${txid}`,
      `https://blockstream.info/api/tx/${txid}`,
    ];

    for (const url of endpoints) {
      try {
        const response = await apiClient.get<{
          vout: Array<{ value: number; scriptpubkey_address?: string }>;
        }>(url, { retries: 0 });
        if (response.data?.vout) {
          // Store all vout values for this txid
          for (const input of unresolvedInputs) {
            const prevout = input.txid === txid ? response.data.vout[input.vout] : undefined;
            if (prevout) {
              values.set(`${txid}:${input.vout}`, {
                value: prevout.value,
                ...(prevout.scriptpubkey_address
                  ? { address: prevout.scriptpubkey_address }
                  : {}),
              });
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
  const described = describeMessage(messageType, fromApiDecode(messageData));
  // The generic form is kept only for a type the shared describer does not cover, so an
  // unrecognised message still says something rather than rendering blank.
  return described ?? `Counterparty ${messageType} transaction`;
}

/**
 * Adapt an API decode into the shared describer's view.
 *
 * The endpoint uses snake_case and carries `*_info` divisibility, so this is where quantities can
 * be rendered in display units. Where divisibility is absent the quantity is labelled rather than
 * guessed — printing a bare integer reads as an amount and is off by 1e8 for a divisible asset.
 */
function fromApiDecode(messageData: Record<string, unknown>): DescribableMessage {
  const infoFor = (assetField?: string): Record<string, unknown> | undefined => {
    const key = assetField ? `${assetField}_info` : 'asset_info';
    return messageData[key] as Record<string, unknown> | undefined;
  };

  /** Map a value back to the field it came from, so the right `*_info` is consulted. */
  const assetFieldOf = (asset?: string): string | undefined => {
    for (const key of Object.keys(messageData)) {
      if ((key === 'asset' || key.endsWith('_asset') || key === 'asset_a' || key === 'asset_b')
        && messageData[key] === asset) {
        return key;
      }
    }
    return undefined;
  };

  const format = (quantity: unknown, asset?: string): string => {
    if (quantity == null) return '?';

    // A normalized value from the endpoint is already in display units.
    const field = assetFieldOf(asset);
    const normalizedKey = field === 'asset' || field === undefined ? 'quantity_normalized' : null;
    if (normalizedKey && messageData[normalizedKey] != null) {
      return String(messageData[normalizedKey]);
    }

    const divisible = infoFor(field)?.divisible;
    if (divisible === true) return fromSatoshis(String(quantity));
    if (divisible === false) return BigInt(String(quantity)).toLocaleString();
    return `${BigInt(String(quantity)).toLocaleString()} (base units)`;
  };

  /**
   * The display-unit value as a bare number string, for figures that are divided rather than shown.
   *
   * Deliberately not `format`'s output with the separators stripped: that output can carry a
   * "(base units)" caveat, and parsing a number back out of it would turn an honest
   * "we do not know the scale" into NaN or, worse, a plausible wrong number.
   */
  const numeric = (quantity: unknown, asset?: string): string | undefined => {
    if (quantity == null) return undefined;
    const field = assetFieldOf(asset);
    const divisible = infoFor(field)?.divisible;
    if (divisible === true) return fromSatoshis(String(quantity), { removeTrailingZeros: true });
    if (divisible === false) return BigInt(String(quantity)).toString();
    return undefined;
  };

  const name = (asset?: string): string => {
    const info = infoFor(assetFieldOf(asset));
    const longname = info?.asset_longname;
    if (typeof longname === 'string' && longname) return longname;

    // Core resolves an asset name through a ledger lookup and `get_asset_name` returns 0 for an
    // asset the node does not know, which the endpoint serializes as the number 0. Rendering that
    // as the name produced "Deposit liquidity: 1.00000000 XCP and 200,000,000 base units 0" — a
    // sentence in which 0 reads as an asset. The same marker already had to be handled in the
    // comparator, where it was reported as tampering.
    //
    // The bytes do name the asset: the local unpack derives it arithmetically from the id. Until
    // the two sources are merged, an unresolvable name is stated as unknown rather than printed.
    const text = String(asset ?? '');
    return text === '' || text === '0' ? 'an unnamed asset' : text;
  };

  const num = (key: string): number | undefined =>
    messageData[key] == null ? undefined : Number(messageData[key]);

  return {
    asset: messageData.asset as string | undefined,
    quantity: messageData.quantity,
    // `/v2/transactions/unpack` names the recipient `address` for both send variants while sweep
    // and utxo use `destination`, so both keys are read rather than assuming one shape.
    destination: (messageData.address ?? messageData.destination) as string | undefined,
    giveAsset: messageData.give_asset as string | undefined,
    giveQuantity: messageData.give_quantity,
    getAsset: messageData.get_asset as string | undefined,
    getQuantity: messageData.get_quantity,
    expiration: num('expiration'),
    escrowQuantity: messageData.escrow_quantity,
    mainchainrate: messageData.mainchainrate,
    dividendAsset: messageData.dividend_asset as string | undefined,
    quantityPerUnit: messageData.quantity_per_unit,
    offerHash: messageData.offer_hash as string | undefined,
    text: messageData.text as string | undefined,
    assetA: messageData.asset_a as string | undefined,
    quantityA: messageData.quantity_a,
    assetB: messageData.asset_b as string | undefined,
    quantityB: messageData.quantity_b,
    recipientCount: Array.isArray(messageData) ? messageData.length : undefined,
    subassetLongname: messageData.asset_longname as string | undefined,
    dispenserStatus: num('status'),
    // Issuance switches travel in the message itself, so the describer can scale the issued
    // quantity by the flag being signed instead of falling back to the base-units caveat.
    divisible: messageData.divisible as boolean | undefined,
    lock: messageData.lock as boolean | undefined,
    reset: messageData.reset as boolean | undefined,
    minLpQuantity: messageData.min_lp_quantity,
    minQuantityA: messageData.min_quantity_a,
    minQuantityB: messageData.min_quantity_b,
    format,
    numeric,
    name,
  };
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
  // `asset_a` and `asset_b` (pool deposit and withdraw) match neither rule — they start with
  // `asset_` rather than ending with `_asset` — so pool messages were enriched with nothing at
  // all, not even the BTC/XCP shortcut below, and their quantities fell through to the raw-integer
  // branch. A 1.5 XCP deposit read "150,000,000 XCP" on the signing screen.
  return Object.keys(data).filter(
    k => k === 'asset' || k.endsWith('_asset') || k === 'asset_a' || k === 'asset_b'
  );
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

/** A single mpma_send recipient, resolved from the local unpack. */
export interface MpmaRecipient {
  address: string;
  asset: string;
  /** Display quantity, or the raw integer marked unconfirmed when divisibility is unknown. */
  quantity: string;
}

/**
 * Resolve the recipients of an mpma_send from locally decoded bytes.
 *
 * This type cannot be described from the API. `/v2/transactions/unpack` renders an mpma_send
 * payload as a bare array rather than an object — so every keyed lookup misses and the headline
 * fell through to "Counterparty mpma_send transaction" — and that array has been observed to
 * carry only the first send of a multi-send message. Describing it from the API would therefore
 * name one recipient and silently drop the rest.
 *
 * MPMA destinations travel inside the payload, not as BTC outputs, so unlike an ordinary send
 * they never appear in the outputs list either. If the approval screen does not read them out of
 * the bytes, nothing on it says who is being paid.
 */
export async function resolveMpmaRecipients(
  sends: Array<{ asset: string; destination: string; quantity: bigint }>
): Promise<MpmaRecipient[]> {
  const unique = [...new Set(sends.map(s => s.asset))];
  const divisibility = new Map<string, boolean | null>();

  await Promise.all(
    unique.map(async (asset) => {
      const upper = asset.toUpperCase();
      if (upper === 'XCP' || upper === 'BTC') {
        divisibility.set(asset, true);
        return;
      }
      const info = await fetchAssetDetails(asset).catch(() => null);
      divisibility.set(asset, info ? info.divisible : null);
    })
  );

  return sends.map((send) => {
    const divisible = divisibility.get(send.asset);
    return {
      address: send.destination,
      asset: send.asset,
      // An unknown divisibility is labelled rather than guessed: rendering base units as a
      // decimal (or the reverse) misstates the amount by eight orders of magnitude.
      quantity:
        divisible === true
          ? fromSatoshis(send.quantity.toString())
          : divisible === false
            ? send.quantity.toLocaleString()
            : `${send.quantity.toString()} (base units)`,
    };
  });
}

/** Headline for an mpma_send, built from {@link resolveMpmaRecipients}. */
export function describeMpmaSend(recipients: MpmaRecipient[]): string {
  if (recipients.length === 1) {
    const only = recipients[0]!;
    return `Send ${only.quantity} ${only.asset} to ${only.address}`;
  }
  return `Send to ${recipients.length} recipients`;
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

