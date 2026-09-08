import type { GalleryApi } from './provider-gallery';

/** Ledger/display fixtures, not current market prices or a snapshot of live asset supply. */
export const APPROVAL_LOCALIZATION_FIXTURE_VALUES = {
  btcUsd: 100_000,
  xcpUsd: 2,
  blockHeight: 950_000,
  fees: { fastestFee: 5, halfHourFee: 3, hourFee: 2 },
  poolAsset: 'A95428957068369062',
  lpAsset: 'A95428957068369099',
} as const;

const SCENARIOS = new Set([
  'send-with-memo', 'order', 'pool-deposit', 'pool-withdraw', 'destroy',
  'attach-bad-vout', 'utxo-move-foreign-source',
]);

/**
 * Authored API-shaped localization fixtures, NOT recorded live responses. Field names and wire
 * semantics were checked against counterparty-core 67e10db3ee266068c1effc4e83653df39ace5ca8:
 * lib/api/compose.py:878 unpack envelope; lib/messages/order.py:349, destroy.py:36,
 * versions/enhancedsend.py:23, pooldeposit.py:217, poolwithdraw.py:141, attach.py:127,
 * utxo.py:137. lib/utils/helpers.py:105 serializes byte memo/tag values as hex strings.
 *
 * Replies are written explicitly from those contracts and the fixture's intended parameters;
 * no local decoder, packer, or verifier generates these answers. Literal payload guards pin
 * each answer to the existing raw/PSBT fixture bytes. No asset_info/normalized values are injected
 * here: production enrichment still fetches the separate ledger metadata fixtures below.
 * These screenshots prove localized presentation against mocked remote data, not live API parity.
 */
const UNPACK_FIXTURES: Record<string, {
  datahex: string;
  result: { message_type: string; message_type_id: number; message_data: Record<string, unknown> };
}> = {
  'send-with-memo': {
    datahex: '434e5452505254590284011903e8550162e907b15cbf27d5425399ebf6f0fb50ebb88f184a696e766f696365203432',
    result: { message_type: 'enhanced_send', message_type_id: 2, message_data: {
      asset: 'XCP', quantity: 1000, address: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa', memo: '696e766f696365203432',
    } },
  },
  order: {
    datahex: '434e5452505254590a000000000000000100000000000003e80000001c61620c4b00000000000003e803e80000000000000000',
    result: { message_type: 'order', message_type_id: 10, message_data: {
      give_asset: 'XCP', give_quantity: 1000, get_asset: 'PEPECASH', get_quantity: 1000,
      expiration: 1000, fee_required: 0, status: 'open',
    } },
  },
  'pool-deposit': {
    datahex: '434e545250525459780000000000000001015308217f589ca60000000005f5e100000000000bebc20000000000000000000000000000000000',
    result: { message_type: 'pooldeposit', message_type_id: 120, message_data: {
      asset_a: 'XCP', asset_b: 'A95428957068369062', quantity_a: 100000000,
      quantity_b: 200000000, min_lp_quantity: 0, lp_asset_id: 0,
    } },
  },
  'pool-withdraw': {
    datahex: '434e545250525459790000000000000001015308217f589ca60000000002faf08000000000000000000000000000000000',
    result: { message_type: 'poolwithdraw', message_type_id: 121, message_data: {
      asset_a: 'XCP', asset_b: 'A95428957068369062', quantity: 50000000,
      min_quantity_a: 0, min_quantity_b: 0,
    } },
  },
  destroy: {
    datahex: '434e5452505254596e00000002ea20d7fa00000000000000016275726e',
    result: { message_type: 'destroy', message_type_id: 110, message_data: {
      asset: 'BONPARTY', quantity: 1, tag: '6275726e',
    } },
  },
  'attach-bad-vout': {
    datahex: '434e545250525459655843507c3130303030303030307c39',
    result: { message_type: 'attach', message_type_id: 101, message_data: {
      asset: 'XCP', quantity: 100000000, destination_vout: 9,
    } },
  },
  'utxo-move-foreign-source': {
    datahex: '434e54525052545964666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666663a377c3141317a5031655035514765666932444d505466544c35534c6d7637446976664e617c5843507c313030303030303030',
    result: { message_type: 'utxo', message_type_id: 100, message_data: {
      source: 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff:7',
      destination: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa', asset: 'XCP', quantity: 100000000,
    } },
  },
};

export interface ApprovalLocalizationFixtureAudit {
  installed: boolean;
  /** One entry per intercepted read, including any application-level retries. */
  fixtureReads: string[];
  /** Fixed API-shaped replies, counted separately from any actual upstream traffic. */
  mockedUnpackReads: string[];
  /** Unexpected unpack requests still passed through; should be zero in a fixed gallery run. */
  upstreamUnpackReads: string[];
  /** Unknown, changed, missing, or duplicate datahex. The caller must assert this stays empty. */
  unexpectedPayloadReads: string[];
  /** Not invented or silently treated as divisible. These still use earlier routes/upstream. */
  unfixtureMetadataReads: string[];
  /** Foreground price requests must use the configured scenario node too. */
  unconfiguredQuoteReads: string[];
}

/**
 * Install AFTER approval-gallery's scenario stubs, before opening the approval. Registrations
 * belong to GalleryApi and are removed by its dispose(). Only the seven named cases are changed.
 *
 * Fixture payload facts (e2e/fixtures/approval-scenarios.json; unchanged raw and PSBT bytes):
 * - send-with-memo: XCP 1,000 base units = 0.00001 XCP, memo "invoice 42".
 * - order: gives XCP 1,000 and requests PEPECASH 1,000 base units; both divisible, so each
 *   displays 0.00001 and the unit ratio is 1. A fabricated book quote fills exactly 1,000 raw
 *   units with no remainder or implied slippage. It is market display data, not an unpack oracle.
 *   No whole-token interpretation of raw 1,000.
 * - destroy: BONPARTY 1, indivisible. The 1,779 supply fixture matches the existing dividend
 *   gallery fixture; it is fixed test ledger state, not a claim about today's circulating supply.
 * - pool-deposit: XCP 100,000,000 + A95428957068369062 200,000,000; the numeric asset is
 *   explicitly divisible in this fabricated pool, so these display 1 + 2. Minimum LP is zero.
 * - pool-withdraw: 50,000,000 LP base units = 0.5 LP; minimum outputs are both zero.
 * - attach-bad-vout / foreign-source UTXO move: XCP 100,000,000 = 1; their intentionally
 *   invalid vout/source and actual local verification are untouched.
 *
 * The dedicated fixed gallery mocks unpack with the authored constants above, while actual local
 * decoding, comparison, repacking, enrichment, and safety checks still run. This is not a live API
 * verification test. The default gallery never installs this helper. We do not replace prevout/
 * UTXO fixtures or hide errors from unknown endpoints. Prices, fee estimates, and height are
 * arbitrary fixed display inputs; fee arithmetic and risk thresholds remain production code.
 */
export async function installApprovalLocalizationFixtures(
  api: GalleryApi,
  scenario: string,
): Promise<ApprovalLocalizationFixtureAudit> {
  const audit: ApprovalLocalizationFixtureAudit = {
    installed: SCENARIOS.has(scenario),
    fixtureReads: [], mockedUnpackReads: [], upstreamUnpackReads: [],
    unexpectedPayloadReads: [], unfixtureMetadataReads: [], unconfiguredQuoteReads: [],
  };
  if (!audit.installed) return audit;

  const values = APPROVAL_LOCALIZATION_FIXTURE_VALUES;
  const poolScenario = scenario === 'pool-deposit' || scenario === 'pool-withdraw';
  const assets: Record<string, object> = {
    BTC: { divisible: true, asset_longname: null },
    XCP: { divisible: true, asset_longname: null },
    PEPECASH: { divisible: true, asset_longname: null },
    BONPARTY: { divisible: false, asset_longname: null, supply: 1779, supply_normalized: '1779' },
  };
  if (poolScenario) {
    const poolMetadata = {
      divisible: true, asset_longname: null, supply: 10_000_000_000, supply_normalized: '100',
    };
    assets[values.poolAsset] = poolMetadata;
    assets[values.lpAsset] = poolMetadata;
    // Preserve the existing pool gallery's explicit unresolved-ledger alias. This is NOT a
    // rule that unknown assets are divisible: only this fabricated pool scenario accepts 0.
    assets['0'] = poolMetadata;
  }

  // Configured Counterparty bases are scenario-scoped by createGalleryApi. A narrow suffix
  // also works with custom API hosts without catching holders, orders, or other asset reads.
  await api.route(/\/__gallery\/[^/]+\/v2\/assets\/[^/?]+\/?(?:\?.*)?$/, async route => {
    if (route.request().method() !== 'GET') return route.fallback();
    const url = new URL(route.request().url());
    const asset = decodeURIComponent(url.pathname.match(/\/assets\/([^/]+)\/?$/)![1]!);
    const metadata = Object.hasOwn(assets, asset) ? assets[asset] : undefined;
    if (!metadata) {
      audit.unfixtureMetadataReads.push(url.pathname);
      return route.fallback();
    }
    audit.fixtureReads.push(`asset:${asset}`);
    await route.fulfill({ json: { result: { asset, ...metadata } } });
  });

  if (poolScenario) {
    await api.route(/\/__gallery\/[^/]+\/v2\/pools\/[^/?]+\/[^/?]+\/?(?:\?.*)?$/, async route => {
      if (route.request().method() !== 'GET') return route.fallback();
      const url = new URL(route.request().url());
      const pair = url.pathname.match(/\/pools\/(.+?)\/?$/)![1]!.split('/').map(decodeURIComponent);
      // The API's unresolved-asset spelling is already supported by the original pool stub.
      const assetB = pair[0] === 'XCP' ? pair[1] : pair[1] === 'XCP' ? pair[0] : undefined;
      if (assetB !== values.poolAsset && assetB !== '0') {
        audit.unfixtureMetadataReads.push(url.pathname);
        return route.fallback();
      }
      audit.fixtureReads.push(`pool:${pair.join('/')}`);
      await route.fulfill({ json: { result: {
        asset_a: 'XCP', asset_b: values.poolAsset, lp_asset: values.lpAsset,
        reserve_a: 0, reserve_b: 0, fee_bps: 50,
      } } });
    });
  }

  if (scenario === 'order') {
    // Intercept the exact pair even if the foreground ignores the configured node, so the
    // audit fails deterministically instead of depending on public-node availability.
    await api.route(/\/v2\/pools\/XCP\/PEPECASH\/quote(?:\?.*)?$/, async route => {
      if (route.request().method() !== 'GET') return route.fallback();
      const url = new URL(route.request().url());
      if (!/^\/__gallery\/[^/]+\/v2\//.test(url.pathname)) {
        audit.unconfiguredQuoteReads.push(url.toString());
      }
      const quantities = url.searchParams.getAll('quantity');
      if (quantities.length !== 1 || quantities[0] !== '1000') {
        audit.unfixtureMetadataReads.push(url.pathname + url.search);
        return route.fallback();
      }
      audit.fixtureReads.push('quote:XCP/PEPECASH?quantity=1000');
      await route.fulfill({ json: { result: {
        estimated_output: 1000, pool_output: 0, book_output: 1000, book_orders_matched: 1,
        give_remaining: 0, effective_price: 1, price_impact: 0, pool_exists: false,
        fee_bps: 0, fee_amount: 0,
      } } });
    });
  }

  await api.route(/\/__gallery\/[^/]+\/v2\/transactions\/unpack(?:\?|$)/, async route => {
    const url = new URL(route.request().url());
    const payloads = url.searchParams.getAll('datahex');
    const fixture = UNPACK_FIXTURES[scenario]!;
    if (route.request().method() !== 'GET' || payloads.length !== 1 || payloads[0] !== fixture.datahex) {
      audit.unexpectedPayloadReads.push(url.toString());
      audit.upstreamUnpackReads.push(url.toString());
      return route.fallback();
    }
    audit.mockedUnpackReads.push(url.toString());
    await route.fulfill({ json: { result: fixture.result } });
  });

  const jsonReads: Record<string, unknown> = {
    'https://api.coinbase.com/v2/prices/spot?currency=USD': { data: { amount: String(values.btcUsd) } },
    'https://api.kraken.com/0/public/Ticker?pair=XBTUSD': { result: { XXBTZUSD: { c: [String(values.btcUsd), '1'] } } },
    'https://mempool.space/api/v1/prices': { USD: values.btcUsd },
    'https://mempool.space/api/v1/fees/precise': { ...values.fees, economyFee: 1, minimumFee: 0.1 },
    'https://blockstream.info/api/fee-estimates': { '2': 5, '3': 3, '6': 2 },
    'https://api.xcp.io/v2/price/ticker': { result: { xcp: { usd: values.xcpUsd, change_pct: 0, sats: 2000, quote: 'XCP' } } },
    'https://api.dex-trade.com/v1/public/ticker?pair=XCPBTC': { status: true, data: { pair: 'XCPBTC', last: '0.00002', volume_24H: '0', high: '0.00002', low: '0.00002' } },
  };
  for (const [url, json] of Object.entries(jsonReads)) {
    await api.route(url, async route => {
      if (route.request().method() !== 'GET') return route.fallback();
      audit.fixtureReads.push(url);
      await route.fulfill({ json });
    });
  }
  for (const url of [
    'https://mempool.space/api/blocks/tip/height',
    'https://blockstream.info/api/blocks/tip/height',
    'https://blockchain.info/q/getblockcount',
  ]) {
    await api.route(url, async route => {
      if (route.request().method() !== 'GET') return route.fallback();
      audit.fixtureReads.push(url);
      await route.fulfill({ contentType: 'text/plain', body: String(values.blockHeight) });
    });
  }
  return audit;
}
