import { describe, expect, it } from 'vitest';
import {
  getPsbtApprovalPolicy,
  getPsbtBundleApprovalPolicy,
} from '@/core/bitcoin/providerApprovalPolicy';
import type { DecodedPsbtInfo } from '@/core/bitcoin/psbtApprovalDecoder';
import type { DecodedPsbtBundleInfo, PsbtBundleApprovalInput } from '@/core/bitcoin/psbtBundleApprovalDecoder';
import type { MarketplaceApprovalReview } from '@/core/counterparty/marketplaceIntent';
import { marketplaceReviewRequiresAcknowledgement } from '@/core/counterparty/marketplaceReviewPolicy';
import { asDisplayUnits } from '@/core/numeric';

const ADDRESS = 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh';
const ROUTINE: MarketplaceApprovalReview['family'][] = ['attach_for_listing', 'prepare_asset', 'authorize_exact_offer'];

function review(
  family: MarketplaceApprovalReview['family'],
  status: MarketplaceApprovalReview['status'] = 'caution',
): MarketplaceApprovalReview {
  return {
    status, family, title: family, facts: [], blockers: status === 'blocked' ? ['mismatch'] : [],
    notices: [{ severity: 'info', message: `${family} notice` }],
  };
}

function decoded(marketplaceReview: MarketplaceApprovalReview, fee = 500): DecodedPsbtInfo {
  return {
    counterpartyMessage: undefined,
    verification: { passed: true },
    safety: { blocked: false, warnings: [] },
    attachedAssets: [{ inputIndex: 0, utxo: `${'a'.repeat(64)}:0`, assets: [] }],
    mpmaRecipients: [],
    structureFindings: [],
    protocolContext: {},
    attachedAssetDestination: null,
    marketplaceReview,
    psbtDetails: {
      transactionId: 'b'.repeat(64), transactionVersion: 2, lockTime: 0, rawTxHex: '00'.repeat(200),
      inputs: [{ index: 0, txid: 'a'.repeat(64), vout: 0, value: 100_000 + fee, address: ADDRESS }],
      outputs: [{ index: 0, value: 100_000, address: ADDRESS, type: 'p2wpkh', script: '' }],
      totalInputValue: 100_000 + fee, totalOutputValue: 100_000, fee, unfunded: false, hasOpReturn: false,
    },
  } as unknown as DecodedPsbtInfo; // Only the fields the policy reads; the full analysis is irrelevant here.
}

const request = { address: ADDRESS, signInputs: { [ADDRESS]: [0] }, sighashTypes: [0x01] };

describe('marketplaceReviewRequiresAcknowledgement', () => {
  it.each(ROUTINE)('treats a checked %s caution as routine', family => {
    expect(marketplaceReviewRequiresAcknowledgement(review(family))).toBe(false);
  });

  it('still asks for acknowledgement on a caution from any other family', () => {
    expect(marketplaceReviewRequiresAcknowledgement(review('accept_exact_offer'))).toBe(true);
    expect(marketplaceReviewRequiresAcknowledgement(review('create_listing'))).toBe(true);
    expect(marketplaceReviewRequiresAcknowledgement(review('marketplace_batch'))).toBe(true);
  });

  it('is not the gate for proved, retry, blocked, or absent reviews', () => {
    expect(marketplaceReviewRequiresAcknowledgement(review('authorize_exact_offer', 'proved'))).toBe(false);
    expect(marketplaceReviewRequiresAcknowledgement(undefined)).toBe(false);
  });
});

describe('getPsbtApprovalPolicy for routine marketplace cautions', () => {
  it.each(ROUTINE)('lets a checked %s sign in one step', family => {
    const policy = getPsbtApprovalPolicy(request, decoded(review(family)), true, 10);
    expect(policy).toMatchObject({ blocked: false, requiresAcknowledgement: false });
  });

  it.each(ROUTINE)('still requires acknowledgement for a %s that pays an unusually high fee', family => {
    const policy = getPsbtApprovalPolicy(request, decoded(review(family), 20_000_000), true, 10);
    expect(policy.requiresAcknowledgement).toBe(true);
  });

  it.each(ROUTINE)('still requires acknowledgement for a %s with a safety warning', family => {
    const info = decoded(review(family));
    info.safety.warnings = [{ severity: 'warning', title: 'Something odd', message: 'Check it.' }];
    expect(getPsbtApprovalPolicy(request, info, true, 10).requiresAcknowledgement).toBe(true);
  });

  it.each(ROUTINE)('still blocks a %s whose proof failed', family => {
    expect(getPsbtApprovalPolicy(request, decoded(review(family, 'blocked')), true, 10).blocked).toBe(true);
    expect(getPsbtApprovalPolicy(request, decoded(review(family, 'retry')), true, 10).blocked).toBe(true);
  });

  it('keeps a caution from a non-routine family behind acknowledgement', () => {
    const policy = getPsbtApprovalPolicy(request, decoded(review('accept_exact_offer')), true, 10);
    expect(policy.requiresAcknowledgement).toBe(true);
  });
});

describe('getPsbtBundleApprovalPolicy for routine marketplace cautions', () => {
  function bundle(family: MarketplaceApprovalReview['family'], fee = 500) {
    const items = [decoded(review(family), fee), decoded(review(family), fee)];
    const input: PsbtBundleApprovalInput & { address: string } = {
      address: ADDRESS,
      bundleKind: family === 'prepare_asset' ? 'prepare-assets' : 'bulk-attach',
      items: items.map(() => ({
        psbtHex: '', signInputs: { [ADDRESS]: [0] }, sighashTypes: [0x01],
        marketplaceIntent: {} as PsbtBundleApprovalInput['items'][number]['marketplaceIntent'],
      })),
    };
    const info: DecodedPsbtBundleInfo = { items, review: { ...review('marketplace_batch'), status: 'caution' } };
    return { input, info };
  }

  it.each(ROUTINE)('lets a checked %s batch sign in one step with no forced review item', family => {
    const { input, info } = bundle(family);
    const { policy, warnings } = getPsbtBundleApprovalPolicy(input, info, true, 10);
    expect(policy).toMatchObject({ blocked: false, requiresAcknowledgement: false });
    expect(warnings.some(warning => warning.title.includes('Review transaction risks'))).toBe(false);
  });

  it.each(ROUTINE)('still gates a high-fee %s batch', family => {
    const { input, info } = bundle(family, 20_000_000);
    const { policy, warnings } = getPsbtBundleApprovalPolicy(input, info, true, 10);
    expect(policy.requiresAcknowledgement).toBe(true);
    expect(warnings.some(warning => warning.title.includes('Unusually high network fee'))).toBe(true);
  });

  it('keeps a non-routine caution item behind the review step', () => {
    const { input, info } = bundle('accept_exact_offer');
    const { policy, warnings } = getPsbtBundleApprovalPolicy(input, info, true, 10);
    expect(policy.requiresAcknowledgement).toBe(true);
    expect(warnings.some(warning => warning.title.includes('Review transaction risks'))).toBe(true);
  });
});

describe('getPsbtApprovalPolicy for durable sell authorizations', () => {
  const RAREPEPE = [{ asset: 'RAREPEPE', quantity: '1', quantity_normalized: asDisplayUnits('1'), asset_longname: null }];
  const single = { address: ADDRESS, signInputs: { [ADDRESS]: [0] }, sighashTypes: [0x83] };

  function over(assets: DecodedPsbtInfo['attachedAssets'], marketplaceReview?: MarketplaceApprovalReview) {
    const info = decoded(review('create_listing', 'proved'));
    info.attachedAssets = assets;
    info.marketplaceReview = marketplaceReview;
    return info;
  }

  // The signer's own gate, independent of the analysis warning a screen renders.
  it('blocks SINGLE|ANYONECANPAY over an attached asset with no listing proof', () => {
    const info = over([{ inputIndex: 0, utxo: 'u:0', assets: RAREPEPE }]);
    expect(info.safety.blocked).toBe(false);
    expect(getPsbtApprovalPolicy(single, info, true, 10).blocked).toBe(true);
  });

  it.each([0x02, 0x03, 0x82])('blocks sighash %i over an attached asset too', sighash => {
    const info = over([{ inputIndex: 0, utxo: 'u:0', assets: RAREPEPE }]);
    expect(getPsbtApprovalPolicy({ ...single, sighashTypes: [sighash] }, info, true, 10).blocked).toBe(true);
  });

  it('blocks it over an input whose asset status is unknown', () => {
    const info = over([{ inputIndex: 0, utxo: 'u:0', assets: [], lookupFailed: true }]);
    expect(getPsbtApprovalPolicy(single, info, true, 10).blocked).toBe(true);
  });

  it('does not treat a blocked or retrying listing claim as a proof', () => {
    for (const status of ['blocked', 'retry', 'caution'] as const) {
      const info = over([{ inputIndex: 0, utxo: 'u:0', assets: RAREPEPE }], review('create_listing', status));
      expect(getPsbtApprovalPolicy(single, info, true, 10).blocked).toBe(true);
    }
  });

  it('leaves ALL and ALL|ANYONECANPAY over an asset to the destination warning', () => {
    for (const sighash of [0x00, 0x01, 0x81]) {
      const info = over([{ inputIndex: 0, utxo: 'u:0', assets: RAREPEPE }]);
      const policy = getPsbtApprovalPolicy({ ...single, sighashTypes: [sighash] }, info, true, 10);
      expect(policy.blocked).toBe(false);
      expect(policy.requiresAcknowledgement).toBe(true);
    }
  });

  it('leaves SINGLE|ANYONECANPAY over a clean input to the flexible-funds acknowledgement', () => {
    const policy = getPsbtApprovalPolicy(single, over([]), true, 10);
    expect(policy).toMatchObject({ blocked: false, requiresAcknowledgement: true });
  });
});
