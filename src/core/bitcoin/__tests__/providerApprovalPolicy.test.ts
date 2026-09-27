import { describe, expect, it } from 'vitest';
import {
  getPsbtApprovalPolicy,
  getPsbtBundleApprovalPolicy,
  getTransactionApprovalPolicy,
} from '@/core/bitcoin/providerApprovalPolicy';
import type { DecodedPsbtInfo } from '@/core/bitcoin/psbtApprovalDecoder';
import type { DecodedPsbtBundleInfo, PsbtBundleApprovalInput } from '@/core/bitcoin/psbtBundleApprovalDecoder';
import { HIGH_ABSOLUTE_FEE_SATS } from '@/core/bitcoin/signedVsize';
import type { DecodedTransactionInfo } from '@/core/bitcoin/transactionApprovalDecoder';
import type { MarketplaceApprovalReview } from '@/core/counterparty/marketplaceIntent';
import { marketplaceReviewRequiresAcknowledgement } from '@/core/counterparty/marketplaceReviewPolicy';
import { zeldWarning } from '@/core/counterparty/signRequestAnalysis';
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

describe('ZELD notices on a batch', () => {
  const zeldOn = (info: DecodedPsbtInfo, notice: Parameters<typeof zeldWarning>[0]) => {
    info.safety.warnings = [zeldWarning(notice, false)];
    return info;
  };
  function batch(items: DecodedPsbtInfo[]) {
    const input: PsbtBundleApprovalInput & { address: string } = {
      address: ADDRESS, bundleKind: 'bulk-attach',
      items: items.map(() => ({
        psbtHex: '', signInputs: { [ADDRESS]: [0] }, sighashTypes: [0x01],
        marketplaceIntent: {} as PsbtBundleApprovalInput['items'][number]['marketplaceIntent'],
      })),
    };
    return getPsbtBundleApprovalPolicy(input, { items, review: { ...review('marketplace_batch'), status: 'caution' } }, true, 10);
  }
  const leaves = { kind: 'leaves' as const, amount: '5', destination: 'bc1qstranger' };

  it('states a shared notice once, naming the items it concerns', () => {
    const { policy, warnings } = batch([
      zeldOn(decoded(review('attach_for_listing')), leaves),
      decoded(review('attach_for_listing')),
      zeldOn(decoded(review('attach_for_listing')), leaves),
    ]);
    const zeld = warnings.filter(warning => warning.code === 'zeld_movement');
    expect(zeld).toHaveLength(1);
    expect(zeld[0]).toMatchObject({ severity: 'warning', data: { ...leaves, items: [1, 3] } });
    expect(policy.requiresAcknowledgement).toBe(true);
    // The ZELD warning is the reason for the review step; no generic item is added beside it.
    expect(warnings.some(warning => warning.title.includes('Review transaction risks'))).toBe(false);
  });

  it('names no items when every item raises it, and keeps an asset note out of the review step', () => {
    const note = { kind: 'asset_output' as const, amount: '5', asset: 'RAREPEPE', vout: 0 };
    const { policy, warnings } = batch([
      zeldOn(decoded(review('attach_for_listing')), note),
      zeldOn(decoded(review('attach_for_listing')), note),
    ]);
    expect(warnings).toEqual([expect.objectContaining({ severity: 'info', data: note })]);
    expect(policy.requiresAcknowledgement).toBe(false);
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

// T1: the click re-runs the review; the policy says when a fresh block is only a failed lookup.
describe('the retry flag on a blocked policy', () => {
  const plain = (attachedAssets: DecodedPsbtInfo['attachedAssets'], marketplaceReview?: MarketplaceApprovalReview) => {
    const info = decoded(review('buy_listings', 'proved'));
    info.attachedAssets = attachedAssets;
    info.marketplaceReview = marketplaceReview;
    return info;
  };

  it('is set when a signed input could not be looked up, or the proof is left at retry', () => {
    expect(getPsbtApprovalPolicy(request, plain([{ inputIndex: 0, utxo: 'u:0', assets: [], lookupFailed: true }]), true, 10))
      .toMatchObject({ blocked: true, retry: true });
    expect(getPsbtApprovalPolicy(request, plain([], review('buy_listings', 'retry')), true, 10))
      .toMatchObject({ blocked: true, retry: true });
  });

  it('is set when a dispense could not look up the dispenser it pays', () => {
    const info = plain([]);
    info.safety = { blocked: true, warnings: [
      { severity: 'block', code: 'dispenser_lookup_retry', title: 'Retry', message: 'x' },
    ] } as DecodedPsbtInfo['safety'];
    expect(getPsbtApprovalPolicy(request, info, true, 10)).toMatchObject({ blocked: true, retry: true });
  });

  it('is not set for an oracle-priced dispense, which retrying cannot clear', () => {
    const info = plain([]);
    info.safety = { blocked: true, warnings: [
      { severity: 'block', title: 'Blocked: Oracle-Priced Dispenser', message: 'x' },
    ] } as DecodedPsbtInfo['safety'];
    const policy = getPsbtApprovalPolicy(request, info, true, 10);
    expect(policy.blocked).toBe(true);
    expect(policy.retry).toBeUndefined();
  });

  it('is not set for an input past the lookup cap, which retrying cannot clear', () => {
    const policy = getPsbtApprovalPolicy(request,
      plain([{ inputIndex: 0, utxo: 'u:0', assets: [], lookupFailed: true, overLimit: true }]), true, 10);
    expect(policy.blocked).toBe(true);
    expect(policy.retry).toBeUndefined();
  });

  it('never appears on a policy that is not blocked', () => {
    const policy = getPsbtApprovalPolicy(request, plain([]), true, 10);
    expect(policy.blocked).toBe(false);
    expect(policy).not.toHaveProperty('retry');
  });

  it('is set on a bundle whose review is left at retry', () => {
    const items = [decoded(review('create_listing'))];
    const input: PsbtBundleApprovalInput & { address: string } = {
      address: ADDRESS, bundleKind: 'bulk-listing',
      items: [{ psbtHex: '', signInputs: { [ADDRESS]: [0] }, sighashTypes: [0x01],
        marketplaceIntent: {} as PsbtBundleApprovalInput['items'][number]['marketplaceIntent'] }],
    };
    const { policy } = getPsbtBundleApprovalPolicy(input,
      { items, review: { ...review('marketplace_batch'), status: 'retry' } }, true, 10);
    expect(policy).toMatchObject({ blocked: true, retry: true });
  });
});

describe('the script-address caution on site requests', () => {
  it('still takes the review step', () => {
    const info = decoded(review('attach_for_listing', 'proved'));
    info.marketplaceReview = undefined;
    info.safety.warnings = [{
      code: 'unproven_script_output',
      data: { totalSats: 600, addresses: ['bc1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqkedrcr'], source: ADDRESS },
      severity: 'warning', title: 'Payment to a Script Address', message: 'Check it.',
    }];
    expect(getPsbtApprovalPolicy(request, info, true, 10)).toMatchObject({ blocked: false, requiresAcknowledgement: true });
  });
});

// Each gate below was found untested by mutation testing: flipping or deleting it left every
// other test green.
describe('getPsbtApprovalPolicy gates', () => {
  const STRANGER = 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq';
  const RAREPEPE = [{ asset: 'RAREPEPE', quantity: '1', quantity_normalized: asDisplayUnits('1'), asset_longname: null }];
  type Warning = DecodedPsbtInfo['safety']['warnings'][number];
  const plain = () => {
    const info = decoded(review('buy_listings', 'proved'));
    info.marketplaceReview = undefined;
    return info;
  };

  it('blocks a transaction that did not verify in strict mode, unless a repack proved it', () => {
    const info = plain();
    info.verification = { ...info.verification, passed: false };
    expect(getPsbtApprovalPolicy(request, info, true, 10).blocked).toBe(true);
    info.verification = { ...info.verification, passed: false, repackProved: true };
    expect(getPsbtApprovalPolicy(request, info, true, 10)).toMatchObject({ blocked: false, requiresAcknowledgement: false });
  });

  it('lets a transaction that did not verify through outside strict mode only with acknowledgement', () => {
    const info = plain();
    info.verification = { ...info.verification, passed: false };
    expect(getPsbtApprovalPolicy(request, info, false, 10)).toMatchObject({ blocked: false, requiresAcknowledgement: true });
    info.verification = { ...info.verification, passed: false, repackProved: true };
    expect(getPsbtApprovalPolicy(request, info, false, 10).requiresAcknowledgement).toBe(false);
    expect(getPsbtApprovalPolicy(request, plain(), false, 10).requiresAcknowledgement).toBe(false);
  });

  it('blocks on a local structure finding', () => {
    const info = plain();
    info.structureFindings = [{
      code: 'utxo_source_not_spent', data: { source: `${'c'.repeat(64)}:0` }, title: 'Source not spent', message: 'x',
    }];
    expect(getPsbtApprovalPolicy(request, info, true, 10).blocked).toBe(true);
  });

  it('blocks an input whose asset status is unknown even under SIGHASH_ALL', () => {
    const info = plain();
    info.attachedAssets = [{ inputIndex: 0, utxo: 'u:0', assets: [], lookupFailed: true }];
    expect(getPsbtApprovalPolicy(request, info, true, 10)).toMatchObject({ blocked: true, safeOwnChange: false });
  });

  it('asks for acknowledgement on a danger warning, not on an info note', () => {
    const info = plain();
    info.safety.warnings = [{ severity: 'info', title: 'Note', message: 'x' }];
    expect(getPsbtApprovalPolicy(request, info, true, 10).requiresAcknowledgement).toBe(false);
    info.safety.warnings = [{ severity: 'danger', title: 'Danger', message: 'x' }];
    expect(getPsbtApprovalPolicy(request, info, true, 10).requiresAcknowledgement).toBe(true);
  });

  describe("where a signed input's attached assets go", () => {
    const destination = (destinationCommitted: boolean, leavesWallet: boolean) => ({
      sourceInputs: [0], destinationVout: 0, destinationAddress: ADDRESS, detaches: false,
      mode: 'implicit-output' as const, destinationCommitted, leavesWallet,
    });
    const withAsset = (dest: ReturnType<typeof destination> | null) => {
      const info = plain();
      info.attachedAssets = [{ inputIndex: 0, utxo: 'u:0', assets: RAREPEPE }];
      info.attachedAssetDestination = dest;
      return info;
    };

    it("needs no acknowledgement when the signature fixes the assets on this wallet's own output", () => {
      expect(getPsbtApprovalPolicy(request, withAsset(destination(true, false)), true, 10))
        .toMatchObject({ blocked: false, requiresAcknowledgement: false, safeOwnChange: false });
    });

    it('asks for acknowledgement when the destination is left open or leaves the wallet', () => {
      expect(getPsbtApprovalPolicy(request, withAsset(destination(false, false)), true, 10).requiresAcknowledgement).toBe(true);
      expect(getPsbtApprovalPolicy(request, withAsset(destination(true, true)), true, 10).requiresAcknowledgement).toBe(true);
    });

    it('asks for acknowledgement when assets move with no resolved destination', () => {
      expect(getPsbtApprovalPolicy(request, withAsset(null), true, 10).requiresAcknowledgement).toBe(true);
    });

    it('lets a resolved destination stand in for the generic detach-all warning, and nothing else', () => {
      const detachAll = { severity: 'warning', code: 'detach_all', title: 'Detach all', message: 'x' } as Warning;
      const resolved = withAsset(destination(true, false));
      resolved.safety.warnings = [detachAll];
      expect(getPsbtApprovalPolicy(request, resolved, true, 10).requiresAcknowledgement).toBe(false);
      const unresolved = plain();
      unresolved.safety.warnings = [detachAll];
      expect(getPsbtApprovalPolicy(request, unresolved, true, 10).requiresAcknowledgement).toBe(true);
      resolved.safety.warnings = [{ severity: 'warning', code: 'external_btc_output', title: 'External', message: 'x' } as Warning];
      expect(getPsbtApprovalPolicy(request, resolved, true, 10).requiresAcknowledgement).toBe(true);
    });
  });

  it('marks change as safe to reuse only when no signed input carries an asset', () => {
    expect(getPsbtApprovalPolicy(request, plain(), true, 10).safeOwnChange).toBe(true);
    const withAsset = plain();
    withAsset.attachedAssets = [{ inputIndex: 0, utxo: 'u:0', assets: RAREPEPE }];
    expect(getPsbtApprovalPolicy(request, withAsset, true, 10).safeOwnChange).toBe(false);
  });

  it("asks for acknowledgement when a signature leaves this wallet's own change uncommitted", () => {
    // SIGHASH_NONE commits no output: whoever completes the transaction can repoint the change.
    const policy = getPsbtApprovalPolicy({ ...request, sighashTypes: [0x02] }, plain(), true, 10);
    expect(policy).toMatchObject({ blocked: false, requiresAcknowledgement: true });
  });

  it("counts a signInputs address as the wallet's own when weighing uncommitted change", () => {
    // The only output pays the paired signer, not the request address. Uncommitted, it is the
    // wallet's change at risk; were it not the wallet's, it would count as already leaving.
    const info = plain();
    info.psbtDetails.inputs[0]!.address = STRANGER;
    info.psbtDetails.outputs[0]!.address = STRANGER;
    const policy = getPsbtApprovalPolicy(
      { address: ADDRESS, signInputs: { [STRANGER]: [0] }, sighashTypes: [0x02] }, info, true, 10);
    expect(policy.requiresAcknowledgement).toBe(true);
  });

  it('asks for acknowledgement when any one signature is SINGLE|ANYONECANPAY, even with its change committed', () => {
    const info = plain();
    info.attachedAssets = [
      { inputIndex: 0, utxo: 'u:0', assets: [] },
      { inputIndex: 1, utxo: 'u:1', assets: [] },
    ];
    info.psbtDetails.inputs.push({ ...info.psbtDetails.inputs[0]!, index: 1, vout: 1 });
    const policy = getPsbtApprovalPolicy(
      { address: ADDRESS, signInputs: { [ADDRESS]: [0, 1] }, sighashTypes: [0x83, 0x01] }, info, true, 10);
    expect(policy).toMatchObject({ blocked: false, requiresAcknowledgement: true });
  });

  it("without signInputs, treats the request address's inputs as the signed ones, and only those", () => {
    const info = plain();
    info.psbtDetails.inputs.push({ ...info.psbtDetails.inputs[0]!, index: 1, vout: 1, address: STRANGER });
    // The other party's input carries an asset; this wallet signs only its own input.
    info.attachedAssets = [
      { inputIndex: 0, utxo: 'u:0', assets: [] },
      { inputIndex: 1, utxo: 'u:1', assets: RAREPEPE },
    ];
    const unsigned = { address: ADDRESS, sighashTypes: [0x83, 0x83] };
    expect(getPsbtApprovalPolicy(unsigned, info, true, 10)).toMatchObject({ blocked: false, safeOwnChange: true });
    // The same asset on the wallet's own input is a durable sell authorization.
    info.attachedAssets = [{ inputIndex: 0, utxo: 'u:0', assets: RAREPEPE }];
    expect(getPsbtApprovalPolicy(unsigned, info, true, 10).blocked).toBe(true);
  });

  it('lets a checked marketplace review, not an unchecked one, answer for the signature scope', () => {
    const single = { ...request, sighashTypes: [0x83] };
    for (const status of ['proved', 'caution'] as const) {
      expect(getPsbtApprovalPolicy(single, decoded(review('attach_for_listing', status)), true, 10).requiresAcknowledgement)
        .toBe(false);
    }
    expect(getPsbtApprovalPolicy(single, plain(), true, 10).requiresAcknowledgement).toBe(true);
  });
});

describe('getPsbtBundleApprovalPolicy gates', () => {
  type BundleOptions = {
    requestItems?: number;
    status?: MarketplaceApprovalReview['status'];
    bundleKind?: PsbtBundleApprovalInput['bundleKind'];
    actions?: string[];
    strict?: boolean;
  };
  const item = (marketplaceReview: MarketplaceApprovalReview = review('attach_for_listing')) => decoded(marketplaceReview);
  const requestItem = (action = 'attach_for_listing') => ({
    psbtHex: '', signInputs: { [ADDRESS]: [0] }, sighashTypes: [0x01],
    marketplaceIntent: { action } as unknown as PsbtBundleApprovalInput['items'][number]['marketplaceIntent'],
  });
  const run = (items: DecodedPsbtBundleInfo['items'], options: BundleOptions = {}) => {
    const input: PsbtBundleApprovalInput & { address: string } = {
      address: ADDRESS, bundleKind: options.bundleKind ?? 'bulk-attach',
      items: Array.from({ length: options.requestItems ?? items.length }, (_, index) => requestItem(options.actions?.[index])),
    };
    return getPsbtBundleApprovalPolicy(input,
      { items, review: { ...review('marketplace_batch'), status: options.status ?? 'caution' } }, options.strict ?? true, 10);
  };

  it('blocks a bundle whose own review is blocked, even when every item passes', () => {
    expect(run([item(), item()]).policy.blocked).toBe(false);
    expect(run([item(), item()], { status: 'blocked' }).policy.blocked).toBe(true);
  });

  it('blocks a bundle whose decoded items do not match the request, or that has none', () => {
    expect(run([item(), item()], { requestItems: 3 }).policy.blocked).toBe(true);
    expect(run([item(), item()], { requestItems: 1 }).policy.blocked).toBe(true);
    expect(run([], { requestItems: 0 }).policy.blocked).toBe(true);
  });

  describe('an item the wallet could not analyze', () => {
    const unanalyzed = (): DecodedPsbtBundleInfo['items'][number] => ({ psbtDetails: item().psbtDetails });
    const cpfp = { bundleKind: 'acceptance-cpfp', status: 'proved', actions: ['accept_exact_offer', 'bump_acceptance_fee'] } as const;

    it('may sign only as the proved CPFP child of an acceptance', () => {
      expect(run([item(), unanalyzed()], { ...cpfp, actions: [...cpfp.actions] }).policy.blocked).toBe(false);
    });

    it.each([
      ['a review that is only a caution', { status: 'caution' }],
      ['another bundle kind', { bundleKind: 'bulk-attach' }],
      ['a child that is not a fee bump', { actions: ['accept_exact_offer', 'accept_exact_offer'] }],
    ] as Array<[string, BundleOptions]>)('is blocked under %s', (_label, override) => {
      const { policy, warnings } = run([item(), unanalyzed()], { ...cpfp, actions: [...cpfp.actions], ...override });
      expect(policy.blocked).toBe(true);
      expect(warnings).toContainEqual(expect.objectContaining({
        severity: 'block', title: 'Transaction 2: Transaction did not pass verification',
      }));
    });

    it('is blocked in the parent position', () => {
      expect(run([unanalyzed(), item()], { ...cpfp, actions: ['bump_acceptance_fee', 'bump_acceptance_fee'] }).policy.blocked)
        .toBe(true);
    });

    it('is blocked in a bundle of three', () => {
      expect(run([item(), unanalyzed(), item()],
        { ...cpfp, actions: ['accept_exact_offer', 'bump_acceptance_fee', 'bump_acceptance_fee'] }).policy.blocked).toBe(true);
    });
  });

  it("names each item's blocking reasons under its own number", () => {
    const findings = item();
    findings.structureFindings = [{
      code: 'utxo_source_not_spent', data: { source: 'x:0' }, title: 'Source not spent', message: 'x',
    }];
    const unknown = item();
    unknown.attachedAssets = [{ inputIndex: 0, utxo: 'u:0', assets: [], lookupFailed: true }];
    const { policy, warnings } = run([item(), findings, unknown]);
    expect(policy).toMatchObject({ blocked: true, retry: true });
    expect(warnings.filter(warning => warning.title.startsWith('Transaction 2:'))).toEqual([
      expect.objectContaining({ severity: 'block', title: 'Transaction 2: Source not spent' }),
    ]);
    expect(warnings).toContainEqual(expect.objectContaining({ severity: 'block', title: 'Transaction 3: Asset status unavailable' }));
    expect(warnings.some(warning => warning.title.startsWith('Transaction 1:'))).toBe(false);
  });

  it("carries a blocked item's own proof failures as its reason", () => {
    const failed = item(review('attach_for_listing', 'blocked'));
    failed.marketplaceReview!.blockers = ['output 0 differs', 'fee differs'];
    const { warnings } = run([item(), failed]);
    expect(warnings).toContainEqual(expect.objectContaining({
      severity: 'block', title: 'Transaction 2: Transaction did not pass verification', message: 'output 0 differs; fee differs',
    }));
  });

  it('states an unverified item as a block in strict mode and a warning otherwise', () => {
    const unverified = item();
    unverified.verification = { ...unverified.verification, passed: false, warning: 'Field mismatch' };
    const strict = run([unverified], { strict: true });
    expect(strict.policy.blocked).toBe(true);
    expect(strict.warnings).toContainEqual(expect.objectContaining({
      severity: 'block', title: 'Transaction 1: Transaction details did not verify', message: 'Field mismatch',
    }));
    const lenient = run([unverified], { strict: false });
    expect(lenient.policy).toMatchObject({ blocked: false, requiresAcknowledgement: true });
    expect(lenient.warnings).toEqual([
      expect.objectContaining({ severity: 'warning', title: 'Transaction 1: Transaction details did not verify' }),
    ]);
  });

  it("forwards an item's block, warning and danger findings, and drops its info notes", () => {
    const noisy = item();
    noisy.safety.warnings = [
      { severity: 'info', title: 'Note', message: 'x' },
      { severity: 'block', title: 'Stop', message: 'x' },
      { severity: 'danger', title: 'Danger', message: 'x' },
      { severity: 'warning', title: 'Careful', message: 'x' },
    ];
    expect(run([noisy]).warnings.map(warning => warning.title))
      .toEqual(['Transaction 1: Stop', 'Transaction 1: Danger', 'Transaction 1: Careful']);
    // A danger finding is itself the reason for the review step; no generic item is added.
    const danger = item();
    danger.safety.warnings = [{ severity: 'danger', title: 'Danger', message: 'x' }];
    expect(run([danger]).warnings.map(warning => warning.title)).toEqual(['Transaction 1: Danger']);
  });

  it('gives a blocked item a reason even when its only findings do not block', () => {
    const failed = item(review('attach_for_listing', 'blocked'));
    failed.safety.warnings = [{ severity: 'warning', title: 'Careful', message: 'x' }];
    expect(run([failed]).warnings.map(warning => warning.title))
      .toEqual(['Transaction 1: Careful', 'Transaction 1: Transaction did not pass verification']);
  });

  it("states a review item from the item's own notices, whatever info notes it carries", () => {
    const caution = item(review('accept_exact_offer'));
    caution.safety.warnings = [{ severity: 'info', title: 'Note', message: 'x' }];
    expect(run([caution]).warnings).toEqual([expect.objectContaining({
      severity: 'warning', title: 'Transaction 1: Review transaction risks', message: 'accept_exact_offer notice',
    })]);
  });

  it('numbers a ZELD notice by the one item, or the several items, it concerns', () => {
    const leaves = { kind: 'leaves' as const, amount: '5', destination: 'bc1qstranger' };
    const withZeld = () => {
      const info = item();
      info.safety.warnings = [zeldWarning(leaves, false)];
      return info;
    };
    const titles = (items: DecodedPsbtInfo[]) => run(items).warnings
      .filter(warning => warning.code === 'zeld_movement').map(warning => warning.title);
    expect(titles([item(), withZeld(), item()])).toEqual(['Transaction 2: ZELD Would Leave']);
    expect(titles([withZeld(), item(), withZeld()])).toEqual(['Transactions 1, 3: ZELD Would Leave']);
  });
});

describe('getTransactionApprovalPolicy gates', () => {
  const STRANGER = 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq';
  function raw(overrides: Partial<DecodedTransactionInfo> = {}): DecodedTransactionInfo {
    return {
      counterpartyMessage: undefined,
      verification: { passed: true },
      safety: { blocked: false, warnings: [] },
      attachedAssets: [{ inputIndex: 0, utxo: `${'a'.repeat(64)}:0`, assets: [] }],
      mpmaRecipients: [],
      structureFindings: [],
      protocolContext: {},
      attachedAssetDestination: null,
      txid: 'b'.repeat(64),
      inputs: [{ txid: 'a'.repeat(64), vout: 0, value: 100_500, address: ADDRESS }],
      outputs: [{ index: 0, value: 100_000, address: ADDRESS, type: 'p2wpkh' }],
      totalInputValue: 100_500, totalOutputValue: 100_000, fee: 500, vsize: 150, hasOpReturn: false,
      ...overrides,
    } as DecodedTransactionInfo;
  }
  const sign = (info: DecodedTransactionInfo) => getTransactionApprovalPolicy({ address: ADDRESS }, info, true, 10);

  it('signs a plain own-funded transaction in one step with reusable change', () => {
    expect(sign(raw())).toMatchObject({ blocked: false, requiresAcknowledgement: false, safeOwnChange: true });
  });

  it.each([
    ['no value', { txid: 'a'.repeat(64), vout: 1, address: ADDRESS }],
    ['no address', { txid: 'a'.repeat(64), vout: 1, value: 1_000 }],
  ])('blocks an input with %s, which cannot be excluded from the review', (_label, input) => {
    const info = raw();
    info.inputs.push(input);
    expect(sign(info).blocked).toBe(true);
  });

  it('blocks a negative fee, and allows a zero one', () => {
    expect(sign(raw({ fee: -1 })).blocked).toBe(true);
    expect(sign(raw({ fee: 0 })).blocked).toBe(false);
  });

  it('blocks a transaction that spends nothing of the request address', () => {
    expect(sign(raw({ inputs: [{ txid: 'a'.repeat(64), vout: 0, value: 100_500, address: STRANGER }] })).blocked).toBe(true);
  });

  it('does not mark change as reusable when another party funds an input', () => {
    const info = raw();
    info.inputs.push({ txid: 'c'.repeat(64), vout: 0, value: 1_000, address: STRANGER });
    expect(sign(info)).toMatchObject({ blocked: false, safeOwnChange: false });
  });

  it('does not mark change as reusable when a signed input carries an asset', () => {
    const info = raw({ attachedAssets: [{ inputIndex: 0, utxo: 'u:0', assets: [
      { asset: 'RAREPEPE', quantity: '1', quantity_normalized: asDisplayUnits('1'), asset_longname: null },
    ] }] });
    expect(sign(info).safeOwnChange).toBe(false);
  });

  it('asks for acknowledgement above the absolute fee ceiling, whatever the rate', () => {
    // A vsize this large keeps the rate itself sane.
    expect(sign(raw({ fee: HIGH_ABSOLUTE_FEE_SATS, vsize: 10_000_000 })).requiresAcknowledgement).toBe(false);
    expect(sign(raw({ fee: HIGH_ABSOLUTE_FEE_SATS + 1, vsize: 10_000_000 })).requiresAcknowledgement).toBe(true);
  });
});
