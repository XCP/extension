import { describe, expect, it } from 'vitest';
import { MAX_ASSET_LOOKUP_INPUTS } from '../inputAssetLimits';
import { parseMarketplaceIntent } from '../marketplace/intentParser';
import type { MarketplaceAnalysisInput } from '../marketplace/intentTypes';
import { analyzeMarketplaceIntent } from '../marketplaceIntent';

const bidder = 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq';
const claim = {
  standard: 'counterparty-marketplace', version: 1, action: 'invalidate_offers',
  protocolVersion: 'offer_invalidation_v1', operationId: 'invalidation-test', assets: [], bidder,
  fundingInputs: [{ txid: 'aa'.repeat(32), vout: 0, valueSats: 12_330 }],
  returnSats: 12_110, networkFeeSats: 220, expectedTxid: 'bb'.repeat(32),
};
function invalidationFixture(): MarketplaceAnalysisInput {
  return {
    intent: parseMarketplaceIntent(claim),
    inputs: [{ index: 0, ...claim.fundingInputs[0]!, address: bidder, value: 12_330, hasSignatures: false, scriptType: 'p2wpkh' }],
    outputs: [{ index: 0, address: bidder, type: 'p2wpkh', value: 12_110 }],
    signedInputs: [{ index: 0, sighashType: 1 }], signerAddresses: [bidder],
    attachedAssets: [], attachedAssetDestination: null, hasCounterpartyPayload: false,
    transactionId: claim.expectedTxid, transactionVersion: 2, lockTime: 0,
  };
}

describe('offer invalidation proof', () => {
  it('proves a fee-only self-send without requiring any retained offer lock', () => {
    expect(analyzeMarketplaceIntent(invalidationFixture())).toMatchObject({ status: 'proved', family: 'invalidate_offers', blockers: [] });
  });
  it.each([
    ['external output', (f: MarketplaceAnalysisInput) => { f.outputs[0]!.address = 'bc1qglv8hh3l23y0qu5uw4zu7e8q4td0gcjsa8f3tq'; }],
    ['extra output', (f: MarketplaceAnalysisInput) => { f.outputs.push({ index: 1, type: 'op_return', value: 0 }); }],
    ['unknown script', (f: MarketplaceAnalysisInput) => { f.outputs[0]!.type = 'unknown'; }],
    ['foreign input', (f: MarketplaceAnalysisInput) => { f.inputs[0]!.address = 'foreign'; }],
    ['forged amount', (f: MarketplaceAnalysisInput) => { f.inputs[0]!.value = 12331; }],
    ['wrong coin', (f: MarketplaceAnalysisInput) => { f.inputs[0]!.vout = 1; }],
    ['wrong transaction', (f: MarketplaceAnalysisInput) => { f.transactionId = 'cc'.repeat(32); }],
    ['wrong return', (f: MarketplaceAnalysisInput) => { f.outputs[0]!.value -= 1; }],
    ['payload', (f: MarketplaceAnalysisInput) => { f.hasCounterpartyPayload = true; }],
    ['existing signature', (f: MarketplaceAnalysisInput) => { f.inputs[0]!.hasSignatures = true; }],
    ['missing signature', (f: MarketplaceAnalysisInput) => { f.signedInputs = []; }],
    ['duplicate signature', (f: MarketplaceAnalysisInput) => { f.signedInputs.push(f.signedInputs[0]!); }],
    ['locktime', (f: MarketplaceAnalysisInput) => { f.lockTime = 1; }],
    ['version', (f: MarketplaceAnalysisInput) => { f.transactionVersion = 3; }],
    ['assets', (f: MarketplaceAnalysisInput) => { f.attachedAssets = [{ inputIndex: 0, utxo: 'test', assets: [{ asset: 'XCP', quantity_normalized: '1' }] }]; }],
    ['excessive fee', (f: MarketplaceAnalysisInput) => {
      if (f.intent.action !== 'invalidate_offers') throw new Error('wrong intent');
      f.inputs[0]!.value = 1_000_000; f.intent.fundingInputs[0]!.valueSats = 1_000_000;
      f.intent.networkFeeSats = 987890;
    }],
  ])('blocks %s', (_, mutate) => {
    const f = invalidationFixture(); mutate(f);
    expect(analyzeMarketplaceIntent(f).status).toBe('blocked');
  });
  it.each([0, 2, 3, 0x81, 0x82, 0x83])('blocks unsafe P2WPKH sighash %s', sighashType => {
    const f = invalidationFixture(); f.signedInputs[0]!.sighashType = sighashType;
    expect(analyzeMarketplaceIntent(f).status).toBe('blocked');
  });
  it('permits Taproot DEFAULT', () => {
    const f = invalidationFixture(); f.inputs[0]!.scriptType = 'p2tr'; f.signedInputs[0]!.sighashType = 0;
    expect(analyzeMarketplaceIntent(f).status).toBe('proved');
  });
  it('does not treat unknown asset status as clean', () => {
    const f = invalidationFixture(); f.attachedAssets = [{ inputIndex: 0, utxo: 'test', assets: [], lookupFailed: true }];
    expect(analyzeMarketplaceIntent(f).status).toBe('retry');
  });
  it('does not prove an unknown prevout value', () => {
    const f = invalidationFixture(); delete f.inputs[0]!.value;
    expect(analyzeMarketplaceIntent(f).status).toBe('retry');
  });
  it.each([
    { version: 2 }, { protocolVersion: 'exact_offer_v1' }, { assets: ['XCP'] },
    { fundingInputs: [] }, { fundingInputs: [claim.fundingInputs[0], claim.fundingInputs[0]] },
    { fundingInputs: Array.from({ length: MAX_ASSET_LOOKUP_INPUTS + 1 }, (_, vout) => ({ ...claim.fundingInputs[0], vout })) },
    { returnSats: 0 }, { networkFeeSats: -1 }, { expectedTxid: 'bad' },
  ])('rejects malformed or unbounded claims %j', change => {
    expect(() => parseMarketplaceIntent({ ...claim, ...change })).toThrow();
  });
});
