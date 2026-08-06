import { describe, expect, it } from 'vitest';
import { asBaseUnits } from '@/core/numeric';
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
    // Both approval paths now run the same describer, so the local fallback states the action as
    // well as the amount instead of emitting a bare quantity.
    const info = getTxActionInfo(fromUnpack('send', { quantity: asBaseUnits(100000000), asset: 'XCP' }));
    expect(info).toMatchObject({ label: 'Send', description: 'Send 1.00000000 XCP' });
  });

  it('prefers the API counterpartyMessage when present', () => {
    const info = getTxActionInfo({
      counterpartyMessage: { messageType: 'enhanced_send', description: '5 PEPECASH' },
    } as never);
    expect(info).toMatchObject({ label: 'Send', description: '5 PEPECASH' });
  });

  it('detach states that everything on the UTXO moves, and where', () => {
    // A detach credits EVERY balance on the source UTXO to the destination (core detach.py), so
    // there is no per-asset amount to state — DetachData carries only a destination. The old
    // branch rendered a quantity as though it bounded the transfer, which no real payload can
    // even produce.
    expect(getTxActionInfo(fromUnpack('detach', { quantity: asBaseUnits(100000000), asset: 'XCP' }))?.description)
      .toBe('Detach all assets from UTXO');
    expect(getTxActionInfo(fromUnpack('detach', { destination: 'bc1qexampleaddress0000' }))?.description)
      .toBe('Detach all assets from UTXO to bc1qexampleaddress0000');
    expect(getTxActionInfo(fromUnpack('detach', {}))?.description).toBe('Detach all assets from UTXO');
  });

  it('returns null when there is no message or unpack', () => {
    expect(getTxActionInfo({} as never)).toBeNull();
  });
});

describe('getTxActionInfo merges what each decoder knows', () => {
  /** Both sources present: local unpack fields, plus the API decode alongside them. */
  const withBoth = (
    messageType: string,
    localData: Record<string, unknown>,
    apiMessageData: Record<string, unknown>,
  ) => ({
    verification: { localUnpack: { success: true, messageType, data: localData } },
    counterpartyMessage: { messageType, messageData: apiMessageData, description: 'API SAID THIS' },
  }) as never;

  it('uses the local name and the API divisibility together', () => {
    // The endpoint returns 0 for an asset its ledger has not indexed, so the name must come from
    // the local unpack (which derives it from the id). Divisibility only the API has. Used
    // separately these produced "200,000,000 (decimals unconfirmed) 0" — both blind spots at once.
    const info = getTxActionInfo(withBoth(
      'pooldeposit',
      {
        assetA: 'XCP', quantityA: asBaseUnits(100000000),
        assetB: 'A95428957068369062', quantityB: asBaseUnits(200000000),
      },
      {
        asset_a: 'XCP', asset_a_info: { divisible: true },
        asset_b: 0, asset_b_info: { divisible: true },
      },
    ));

    expect(info?.description).toBe(
      'Deposit liquidity: 1.00000000 XCP and 2.00000000 A95428957068369062'
    );
  });

  it('says the decimals are unconfirmed when the API cannot supply divisibility either', () => {
    const info = getTxActionInfo(withBoth(
      'pooldeposit',
      { assetA: 'XCP', quantityA: asBaseUnits(100000000), assetB: 'MYSTERY', quantityB: asBaseUnits(200000000) },
      { asset_a: 'XCP', asset_a_info: { divisible: true }, asset_b: 0 },
    ));

    // "base units" is this codebase's vocabulary, not the reader's; the screen says the digits are
    // right and their scale is not established.
    expect(info?.description).toContain('200,000,000 (decimals unconfirmed) MYSTERY');
  });

  it('uses the API description when there is no local unpack to merge with', () => {
    const info = getTxActionInfo({
      counterpartyMessage: { messageType: 'enhanced_send', messageData: {}, description: 'API SAID THIS' },
    } as never);
    expect(info).toMatchObject({ label: 'Send', description: 'API SAID THIS' });
  });
});
