import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { unpackCounterpartyMessage } from '@/core/counterparty/unpack';
import { extractCounterpartyPayload } from '@/core/counterparty/unpack/opReturn';
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
  it('distinguishes the per-unit dividend rate from the total dividend and protocol fee', () => {
    const info = getTxActionInfo(fromUnpack('dividend', {
      asset: 'BONPARTY', quantityPerUnit: 1n, dividendAsset: 'XCP',
    }), { dividendTotal: '0.00001779', dividendFeeXcp: '0.003' });
    expect(info?.description).toBe('0.00000001 XCP per unit\nAll BONPARTY holders');
    expect(info?.protocol).toEqual([
      { label: 'Total dividend', value: '0.00001779 XCP', kind: 'amount' },
      { label: 'XCP fee', value: '0.003 XCP', kind: 'amount' },
    ]);
  });

  it.each([
    ['fairmint', {}, 'Mint'],
    ['fairminter', {}, 'Create fairminter'],
    ['dispenser', { status: 0 }, 'Fund dispenser'],
    ['dispenser', { status: 1 }, 'Fund dispenser'],
    ['dispenser', { status: 10 }, 'Close dispenser'],
    ['dispenser', { status: 2 }, 'Dispenser'],
  ] as const)('labels the %s approval from its action and known status %j', (kind, data, label) => {
    const info = getTxActionInfo(fromUnpack(kind, {
      asset: 'XCP', quantity: 1n, escrowQuantity: 10n, giveQuantity: 1n, ...data,
    }));
    expect(info?.label).toBe(label);
  });

  it('preserves the real gallery send memo through local unpack and the approval adapter', () => {
    const { scenarios } = JSON.parse(readFileSync('e2e/fixtures/approval-scenarios.json', 'utf8')) as {
      scenarios: Record<string, { rawTxHex: string }>;
    };
    const payload = extractCounterpartyPayload(scenarios['send-with-memo']!.rawTxHex);
    expect(payload).not.toBeNull();
    const localUnpack = unpackCounterpartyMessage(payload!);
    const info = getTxActionInfo({ verification: { localUnpack } } as never);
    expect(info?.description).toBe('Send 0.00001000 XCP to 1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa');
    expect(info?.protocol).toContainEqual({ label: 'Memo', value: 'invoice 42', kind: 'paragraph' });
  });

  it.each(['deadbeef', ' café\t42\n '])('preserves exact text memo %j without interpreting it as hex', memo => {
    const info = getTxActionInfo(fromUnpack('enhanced_send', {
      asset: 'XCP', quantity: 1000n, memo: 'not authoritative', memoBytes: new TextEncoder().encode(memo),
    }));
    expect(info?.protocol).toEqual([{ label: 'Memo', value: memo, kind: 'paragraph' }]);
  });

  it.each([
    { name: 'invalid UTF-8', bytes: [0xff, 0x00], expected: 'ff00' },
    { name: 'control bytes', bytes: [0x41, 0x00, 0x42], expected: '410042' },
    { name: 'invisible format bytes', bytes: [0xef, 0xbb, 0xbf, 0x41], expected: 'efbbbf41' },
    { name: 'whitespace only', bytes: [0x20, 0x09, 0x0a], expected: '20090a' },
  ])('renders $name as explicitly labelled exact hex', ({ bytes, expected }) => {
    const info = getTxActionInfo(fromUnpack('enhanced_send', {
      asset: 'XCP', quantity: 1000n, memo: 'not authoritative', memoBytes: new Uint8Array(bytes),
    }));
    expect(info?.protocol).toEqual([{ label: 'Memo (hex)', value: expected, kind: 'identifier' }]);
  });

  it('honors an explicit binary sweep flag even when its bytes are valid text', () => {
    const info = getTxActionInfo(fromUnpack('sweep', {
      sweepBalances: true, memoIsBinary: true, memo: '6869', memoBytes: new TextEncoder().encode('hi'),
    }));
    expect(info?.protocol).toContainEqual({ label: 'Memo (hex)', value: '6869', kind: 'identifier' });
  });

  it('omits an empty byte memo instead of inventing a value', () => {
    const info = getTxActionInfo(fromUnpack('enhanced_send', {
      asset: 'XCP', quantity: 1000n, memoBytes: new Uint8Array(),
    }));
    expect(info?.protocol).toEqual([]);
  });

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

    expect(info?.description).toBe('Deposit liquidity');
    expect(info?.protocol).toEqual(expect.arrayContaining([
      { label: 'Deposit', value: '1.00000000 XCP', kind: 'amount' },
      { label: 'Deposit', value: '2.00000000 A95428957068369062', kind: 'amount' },
      { label: 'Ratio', value: '1 XCP = 2 A95428957068369062', kind: 'amount' },
    ]));
  });

  it('labels base units when the API cannot supply divisibility either', () => {
    const info = getTxActionInfo(withBoth(
      'pooldeposit',
      { assetA: 'XCP', quantityA: asBaseUnits(100000000), assetB: 'MYSTERY', quantityB: asBaseUnits(200000000) },
      { asset_a: 'XCP', asset_a_info: { divisible: true }, asset_b: 0 },
    ));

    // The digits are right and their scale is not established; "base units" is the count that is
    // correct whichever way the divisibility resolves.
    expect(info?.protocol).toContainEqual({ label: 'Deposit', value: '200,000,000 (base units) MYSTERY', kind: 'amount' });
    expect(info?.protocol.some(field => field.label === 'Ratio')).toBe(false);
  });

  it('uses the API description when there is no local unpack to merge with', () => {
    const info = getTxActionInfo({
      counterpartyMessage: { messageType: 'enhanced_send', messageData: {}, description: 'API SAID THIS' },
    } as never);
    expect(info).toMatchObject({ label: 'Send', description: 'API SAID THIS' });
  });
});
