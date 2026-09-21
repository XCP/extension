/** Semantic proof of every item in an atomic provider signing phase. */

import { extractPsbtDetails, resolvePsbtSighashType } from '@/core/bitcoin/psbt';
import {
  type DecodedPsbtInfo,
  decodePsbtForApproval,
} from '@/core/bitcoin/psbtApprovalDecoder';
import {
  analyzeMarketplaceBatch,
  type MarketplaceBatchKind,
  parseMarketplaceBatchIntents,
} from '@/core/counterparty/marketplaceBatch';
import {
  analyzeAcceptanceCpfpBundle,
  type BumpAcceptanceFeeIntentClaim,
} from '@/core/counterparty/marketplaceBundle';
import type { MarketplaceBundleReview } from '@/core/counterparty/marketplaceBundleReview';
import type {
  AcceptExactOfferIntentClaim,
  MarketplaceApprovalReview,
  MarketplaceIntentClaimV1,
} from '@/core/counterparty/marketplaceIntent';
import { extractPayloadFromOutputs } from '@/core/counterparty/unpack/opReturn';

export interface PsbtBundleApprovalInput {
  bundleKind: 'acceptance-cpfp' | MarketplaceBatchKind;
  items: Array<{
    psbtHex: string;
    signInputs: Record<string, number[]>;
    sighashTypes: number[];
    marketplaceIntent: MarketplaceIntentClaimV1 | BumpAcceptanceFeeIntentClaim;
  }>;
}

export interface DecodedPsbtBundleItem {
  psbtDetails: ReturnType<typeof extractPsbtDetails>;
  txid?: string;
  marketplaceReview?: MarketplaceApprovalReview;
}

export interface DecodedPsbtBundleInfo {
  items: DecodedPsbtBundleItem[];
  review: MarketplaceBundleReview;
}

const missingReview = (family: MarketplaceApprovalReview['family'], message: string) => ({
  status: 'blocked' as const,
  family,
  title: 'Marketplace transaction did not verify',
  facts: [],
  notices: [],
  blockers: [message],
});

export async function decodePsbtBundleForApproval(stored: PsbtBundleApprovalInput): Promise<DecodedPsbtBundleInfo> {
  if (stored.bundleKind === 'acceptance-cpfp') {
    if (stored.items.length !== 2) {
      throw new Error('Exact acceptance fee-bump bundle must contain two transactions');
    }
    const [parentItem, childItem] = stored.items;
    if (parentItem!.marketplaceIntent.action !== 'accept_exact_offer') {
      throw new Error('Bundle parent is not an exact-offer acceptance');
    }
    if (childItem!.marketplaceIntent.action !== 'bump_acceptance_fee') {
      throw new Error('Bundle child is not an acceptance fee bump');
    }
    const parentIntent = parentItem!.marketplaceIntent as AcceptExactOfferIntentClaim;
    const childIntent = childItem!.marketplaceIntent as BumpAcceptanceFeeIntentClaim;
    const parent = await decodePsbtForApproval(
      parentItem!.psbtHex,
      Object.keys(parentItem!.signInputs),
      Object.values(parentItem!.signInputs).flat(),
      parentItem!.sighashTypes,
      undefined,
      'counterparty',
      undefined,
      parentIntent,
    );
    const child = extractPsbtDetails(childItem!.psbtHex);
    const firstChildInputTxid = child.inputs[0]?.txid;
    const childPayload = firstChildInputTxid
      ? extractPayloadFromOutputs(
          child.outputs.map(output => output.script ?? ''),
          firstChildInputTxid,
        )
      : null;
    const childIndices = Object.values(childItem!.signInputs).flat();
    const review = analyzeAcceptanceCpfpBundle({
      parentIntent,
      parentReview: parent.marketplaceReview ?? missingReview(
        'accept_exact_offer',
        'the parent exact-offer semantic proof is missing',
      ),
      childIntent,
      childInputs: child.inputs,
      childOutputs: child.outputs,
      childSignedInputs: childIndices.map(index => ({
        index,
        sighashType: resolvePsbtSighashType(
          childItem!.sighashTypes[index],
          child.inputs[index]?.sighashType,
        ),
      })),
      childSignerAddresses: Object.keys(childItem!.signInputs),
      childTransactionId: child.transactionId,
      childHasCounterpartyPayload: childPayload !== null,
    });
    return {
      items: [parent, { psbtDetails: child, txid: child.transactionId }],
      review,
    };
  }

  const parsed = parseMarketplaceBatchIntents(
    stored.items.map(item => item.marketplaceIntent),
  );
  if (parsed.kind !== stored.bundleKind) {
    throw new Error('Stored marketplace batch kind differs from its intents');
  }
  const decoded: DecodedPsbtInfo[] = await Promise.all(stored.items.map((item, index) =>
    decodePsbtForApproval(
      item.psbtHex,
      Object.keys(item.signInputs),
      Object.values(item.signInputs).flat(),
      item.sighashTypes,
      undefined,
      'counterparty',
      undefined,
      parsed.intents[index],
    )));
  const itemReviews = decoded.map((item, index) =>
    item.marketplaceReview ?? missingReview(
      parsed.intents[index]!.action,
      `marketplace semantic proof ${index + 1} is missing`,
    ));
  const review = analyzeMarketplaceBatch(parsed.kind, parsed.intents, itemReviews);
  return { items: decoded, review };
}
