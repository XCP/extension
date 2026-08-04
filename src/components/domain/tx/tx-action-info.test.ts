import { describe, expect, it } from 'vitest';
import { getTxActionInfo, isAssetDivisible, normalizeQuantity } from './tx-action-info';

// Minimal localUnpack source both approval screens pass in.
const fromUnpack = (messageType: string, data: Record<string, unknown>) => ({
  verification: { localUnpack: { success: true, messageType, data } },
}) as never;

describe('normalizeQuantity', () => {
  it('divides divisible assets (BTC/XCP) by 1e8', () => {
    expect(normalizeQuantity(100000000, 'XCP')).toBe('1.00000000');
  });

  it('shows indivisible assets as the raw integer with separators', () => {
    expect(normalizeQuantity(1500, 'RAREPEPE', { asset_info: { divisible: false } }, 'asset')).toBe('1,500');
  });

  it('returns ? for a null quantity', () => {
    expect(normalizeQuantity(null, 'XCP')).toBe('?');
  });
});

describe('isAssetDivisible', () => {
  it('treats BTC and XCP as divisible', () => {
    expect(isAssetDivisible('BTC')).toBe(true);
    expect(isAssetDivisible('xcp')).toBe(true);
  });
  it('reads divisibility from asset_info', () => {
    expect(isAssetDivisible('FOO', { asset_info: { divisible: false } }, 'asset')).toBe(false);
  });
  it('is undefined when unknown', () => {
    expect(isAssetDivisible('FOO')).toBeUndefined();
  });
});

describe('getTxActionInfo', () => {
  it('normalizes a send quantity (the drift bug: no raw satoshis)', () => {
    const info = getTxActionInfo(fromUnpack('send', { quantity: 100000000, asset: 'XCP' }));
    expect(info).toEqual({ label: 'Send', description: '1.00000000 XCP' });
  });

  it('prefers the API counterpartyMessage when present', () => {
    const info = getTxActionInfo({
      counterpartyMessage: { messageType: 'enhanced_send', description: '5 PEPECASH' },
    } as never);
    expect(info).toEqual({ label: 'Enhanced Send', description: '5 PEPECASH' });
  });

  it('detach shows quantity when present, else the destination', () => {
    expect(getTxActionInfo(fromUnpack('detach', { quantity: 100000000, asset: 'XCP' }))?.description).toBe('1.00000000 XCP');
    expect(getTxActionInfo(fromUnpack('detach', { destination: 'bc1qexampleaddress0000' }))?.description)
      .toBe('To bc1qexampleaddre…');
    expect(getTxActionInfo(fromUnpack('detach', {}))?.description).toBe('Detach assets from UTXO');
  });

  it('returns null when there is no message or unpack', () => {
    expect(getTxActionInfo({} as never)).toBeNull();
  });
});
