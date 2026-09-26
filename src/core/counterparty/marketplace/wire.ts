/** Bounded parsers for the untrusted wire values inside marketplace intent claims. */

import type {
  MarketplaceAssetClaim,
  MarketplaceOutpointClaim,
  MarketplaceSettlementDelivery,
} from '@/core/counterparty/marketplace/intentTypes';
import { isRecord } from '@/core/isRecord';

export const boundedString = (value: unknown, label: string, max = 160): string => {
  if (typeof value !== 'string' || value.length < 1 || value.length > max) {
    throw new Error(`${label} must be a non-empty string of at most ${max} characters`);
  }
  return value;
};

export const safeInteger = (
  value: unknown,
  label: string,
  options: { positive?: boolean } = {},
): number => {
  if (!Number.isSafeInteger(value) || (options.positive && Number(value) <= 0)) {
    throw new Error(`${label} must be ${options.positive ? 'a positive ' : 'a '}safe integer`);
  }
  return Number(value);
};

/** `safeInteger`, except that an explicit `null` passes through. */
export const nullableSafeInteger = (value: unknown, label: string): number | null =>
  value === null ? null : safeInteger(value, label);

export const nonNegativeSafeInteger = (value: unknown, label: string): number => {
  const parsed = safeInteger(value, label);
  if (parsed < 0) {
    throw new Error(`${label} must be a non-negative safe integer`);
  }
  return parsed;
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
      ),
    };
  }
  throw new Error(`${label}.mode must be detached or attached`);
};

export const outpoint = (value: unknown, label: string): MarketplaceOutpointClaim => {
  if (!isRecord(value)) throw new Error(`${label} must be an object`);
  const txid = hex32(value.txid, `${label}.txid`);
  const vout = safeInteger(value.vout, `${label}.vout`);
  if (vout < 0) throw new Error(`${label}.vout must be a non-negative safe integer`);
  return { txid, vout };
};

/** A positive base-unit quantity, carried as a decimal string so it never loses precision. */
export const positiveRawQuantity = (value: unknown, label: string): string => {
  const quantityRaw = boundedString(value, label, 24);
  if (!/^[1-9][0-9]*$/.test(quantityRaw)) {
    throw new Error(`${label} must be a positive base-unit integer string`);
  }
  return quantityRaw;
};

export const assetWithoutOutpoint = (
  value: unknown,
  label: string,
): { asset: string; quantityRaw: string } => {
  if (!isRecord(value)) throw new Error(`${label} must be an object`);
  const quantityRaw = positiveRawQuantity(value.quantityRaw, `${label}.quantityRaw`);
  return {
    asset: boundedString(value.asset, `${label}.asset`, 250),
    quantityRaw,
  };
};

export const asset = (value: unknown, label: string): MarketplaceAssetClaim => ({
  ...assetWithoutOutpoint(value, label),
  sourceOutpoint: outpoint((value as Record<string, unknown>).sourceOutpoint, `${label}.sourceOutpoint`),
});

export const nonNegativeRawInteger = (value: unknown, label: string): string => {
  const raw = boundedString(value, label, 24);
  if (!/^[0-9]+$/.test(raw)) {
    throw new Error(`${label} must be a non-negative base-unit integer string`);
  }
  return raw;
};

/**
 * `1..max` distinct funding outpoints, each with its claimed value. The caller bounds the count,
 * since each family words that limit its own way.
 */
export const fundingOutpoints = (
  values: unknown[],
): Array<MarketplaceOutpointClaim & { valueSats: number }> => {
  const seenOutpoints = new Set<string>();
  return values.map((candidate, index) => {
    const label = `fundingInputs[${index}]`;
    if (!isRecord(candidate)) throw new Error(`${label} must be an object`);
    const claimed = outpoint(candidate, label);
    const key = `${claimed.txid}:${claimed.vout}`;
    if (seenOutpoints.has(key)) throw new Error(`${label} repeats outpoint ${key}`);
    seenOutpoints.add(key);
    return { ...claimed, valueSats: safeInteger(candidate.valueSats, `${label}.valueSats`, { positive: true }) };
  });
};

/**
 * Website-supplied text reduced to one line: control and format characters (bidi overrides and
 * isolates, zero-width joiners, BOMs) are dropped, and any run of whitespace becomes one space.
 */
export const oneLineText = (value: string): string => value
  .replace(/\p{Cf}/gu, '')
  .replace(/[\p{Cc}\p{Zl}\p{Zp}\s]+/gu, ' ')
  .trim();

/**
 * Website-supplied display text reduced to one plain line (`oneLineText`). Rejects text that is
 * empty once cleaned.
 */
export const plainDisplayText = (value: unknown, label: string, max: number): string => {
  const cleaned = oneLineText(boundedString(value, label, max));
  if (cleaned.length === 0) throw new Error(`${label} must contain visible text`);
  return cleaned;
};
