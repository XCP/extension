/** Bounded parsers for the untrusted wire values inside marketplace intent claims. */

import type {
  MarketplaceAssetClaim,
  MarketplaceOutpointClaim,
  MarketplaceSettlementDelivery,
} from '@/core/counterparty/marketplace/intentTypes';

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const boundedString = (value: unknown, label: string, max = 160): string => {
  if (typeof value !== 'string' || value.length < 1 || value.length > max) {
    throw new Error(`${label} must be a non-empty string of at most ${max} characters`);
  }
  return value;
};

export const safeInteger = (
  value: unknown,
  label: string,
  options: { positive?: boolean; nullable?: boolean } = {},
): number | null => {
  if (value === null && options.nullable) return null;
  if (!Number.isSafeInteger(value) || (options.positive && Number(value) <= 0)) {
    throw new Error(`${label} must be ${options.positive ? 'a positive ' : 'a '}safe integer`);
  }
  return Number(value);
};

export const nonNegativeSafeInteger = (value: unknown, label: string): number => {
  const parsed = safeInteger(value, label);
  if (parsed === null || parsed < 0) {
    throw new Error(`${label} must be a non-negative safe integer`);
  }
  return parsed;
};

export const settlementDelivery = (value: unknown, label: string): MarketplaceSettlementDelivery => {
  if (!isRecord(value)) throw new Error(`${label} must be an object`);
  const address = boundedString(value.address, `${label}.address`, 128);
  if (value.mode === 'detached') return { mode: 'detached', address };
  if (value.mode === 'attached') {
    return {
      mode: 'attached',
      address,
      utxoValueSats: safeInteger(
        value.utxoValueSats,
        `${label}.utxoValueSats`,
        { positive: true },
      )!,
    };
  }
  throw new Error(`${label}.mode must be detached or attached`);
};

export const outpoint = (value: unknown, label: string): MarketplaceOutpointClaim => {
  if (!isRecord(value)) throw new Error(`${label} must be an object`);
  const txid = boundedString(value.txid, `${label}.txid`, 64).toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(txid)) throw new Error(`${label}.txid must be 32-byte hex`);
  const vout = safeInteger(value.vout, `${label}.vout`);
  if (vout === null || vout < 0) throw new Error(`${label}.vout must be a non-negative safe integer`);
  return { txid, vout };
};

export const asset = (value: unknown, label: string): MarketplaceAssetClaim => {
  if (!isRecord(value)) throw new Error(`${label} must be an object`);
  const quantityRaw = boundedString(value.quantityRaw, `${label}.quantityRaw`, 24);
  if (!/^[1-9][0-9]*$/.test(quantityRaw)) {
    throw new Error(`${label}.quantityRaw must be a positive base-unit integer string`);
  }
  return {
    asset: boundedString(value.asset, `${label}.asset`, 250),
    quantityRaw,
    sourceOutpoint: outpoint(value.sourceOutpoint, `${label}.sourceOutpoint`),
  };
};

export const assetWithoutOutpoint = (
  value: unknown,
  label: string,
): { asset: string; quantityRaw: string } => {
  if (!isRecord(value)) throw new Error(`${label} must be an object`);
  const quantityRaw = boundedString(value.quantityRaw, `${label}.quantityRaw`, 24);
  if (!/^[1-9][0-9]*$/.test(quantityRaw)) {
    throw new Error(`${label}.quantityRaw must be a positive base-unit integer string`);
  }
  return {
    asset: boundedString(value.asset, `${label}.asset`, 250),
    quantityRaw,
  };
};

export const nonNegativeRawInteger = (value: unknown, label: string): string => {
  const raw = boundedString(value, label, 24);
  if (!/^[0-9]+$/.test(raw)) {
    throw new Error(`${label} must be a non-negative base-unit integer string`);
  }
  return raw;
};

/**
 * Website-supplied display text reduced to one plain line: control and format characters (bidi
 * overrides and isolates, zero-width joiners, BOMs) are dropped, and any run of whitespace becomes
 * one space. Rejects text that is empty once cleaned.
 */
export const plainDisplayText = (value: unknown, label: string, max: number): string => {
  const cleaned = boundedString(value, label, max)
    .replace(/\p{Cf}/gu, '')
    .replace(/[\p{Cc}\p{Zl}\p{Zp}\s]+/gu, ' ')
    .trim();
  if (cleaned.length === 0) throw new Error(`${label} must contain visible text`);
  return cleaned;
};

export const hex32 = (value: unknown, label: string): string => {
  const parsed = boundedString(value, label, 64).toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(parsed)) throw new Error(`${label} must be 32-byte hex`);
  return parsed;
};

export const evenHex = (value: unknown, label: string, maxBytes: number): string => {
  const parsed = boundedString(value, label, maxBytes * 2).toLowerCase();
  if (!/^(?:[0-9a-f]{2})+$/.test(parsed)) throw new Error(`${label} must be even-length hex`);
  return parsed;
};
