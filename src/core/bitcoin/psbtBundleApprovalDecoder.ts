/** Semantic proof of every item in an atomic provider signing phase. */

import { extractPsbtDetails, resolvePsbtSighashType } from '@/core/bitcoin/psbt';
import {
  type DecodedPsbtInfo,
  decodePsbtForApproval,
} from '@/core/bitcoin/psbtApprovalDecoder';
import { fetchAssetDetails } from '@/core/counterparty/api';
import type { InputAttachedAssets } from '@/core/counterparty/inputAssets';
import {
  deriveProvedAttachOutput,
  listingSpendsProvedAttach,
  type ProvedAttachOutput,
} from '@/core/counterparty/marketplaceAttachLink';
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
import type { SecurityWarning } from '@/core/counterparty/transactionSafety';
import { extractPayloadFromOutputs } from '@/core/counterparty/unpack/opReturn';
import { fromSatoshis } from '@/core/numeric';

export interface PsbtBundleApprovalInput {
  bundleKind: 'acceptance-cpfp' | MarketplaceBatchKind;
  items: Array<{
    psbtHex: string;
    signInputs: Record<string, number[]>;
    sighashTypes: number[];
    marketplaceIntent: MarketplaceIntentClaimV1 | BumpAcceptanceFeeIntentClaim;
  }>;
}

export type DecodedPsbtBundleItem = DecodedPsbtInfo | {
  psbtDetails: ReturnType<typeof extractPsbtDetails>;
  txid?: string;
  marketplaceReview?: MarketplaceApprovalReview;
};

export interface DecodedPsbtBundleInfo {
  items: DecodedPsbtBundleItem[];
  review: MarketplaceBundleReview;
  policyWarnings?: SecurityWarning[];
}

const missingReview = (family: MarketplaceApprovalReview['family'], message: string) => ({
  status: 'blocked' as const,
  family,
  title: 'Marketplace transaction did not verify',
  facts: [],
  notices: [],
  blockers: [message],
});

type StoredItem = PsbtBundleApprovalInput['items'][number];

const decodeItem = (
  item: StoredItem,
  intent: MarketplaceIntentClaimV1,
  ownedAddresses: string[] | undefined,
  linkedInputAssets?: InputAttachedAssets,
): Promise<DecodedPsbtInfo> => decodePsbtForApproval(
  item.psbtHex,
  Object.keys(item.signInputs),
  Object.values(item.signInputs).flat(),
  item.sighashTypes,
  undefined,
  'counterparty',
  undefined,
  intent,
  ownedAddresses,
  linkedInputAssets,
);

/**
 * Display units for the linked attach quantity. Presentation only: the proof compares the raw
 * quantity decoded from the attach bytes. Prefer the API's rendering of the same payload, then the
 * asset's divisibility, and label the base units rather than guess a scale.
 */
async function linkedDisplayQuantity(
  attach: DecodedPsbtInfo,
  proved: ProvedAttachOutput,
): Promise<string> {
  const data = attach.counterpartyMessage?.messageData;
  if (data && data.asset === proved.asset && String(data.quantity) === proved.quantityRaw) {
    if (typeof data.quantity_normalized === 'string' || typeof data.quantity_normalized === 'number') {
      return String(data.quantity_normalized);
    }
    const info = data.asset_info;
    if (info && typeof info === 'object' && 'divisible' in info) {
      if (info.divisible === true) return fromSatoshis(proved.quantityRaw);
      if (info.divisible === false) return proved.quantityRaw;
    }
  }
  try {
    const details = await fetchAssetDetails(proved.asset);
    if (details?.divisible === true) return fromSatoshis(proved.quantityRaw);
    if (details?.divisible === false) return proved.quantityRaw;
  } catch {
    // Display only; fall through to labeled base units.
  }
  return `${proved.quantityRaw} (base units)`;
}

const withLinkBlocker = (
  review: MarketplaceApprovalReview | undefined,
  problem: string,
): MarketplaceApprovalReview => {
  const base: MarketplaceApprovalReview = review
    ?? missingReview('create_listing', 'marketplace semantic proof 2 is missing');
  const { paymentSummary: _payment, summary: _summary, ...rest } = base;
  return { ...rest, status: 'blocked', blockers: [...base.blockers, problem] };
};

/**
 * Decode the attach first, then prove the listing against it. The listing's input 1 is the
 * attach's not-yet-broadcast asset output, which no ledger can resolve; the attach's own proved
 * bytes are its evidence instead (marketplaceAttachLink.ts). A listing that spends anything other
 * than exactly that output is blocked here, not merely left to a failed ledger lookup.
 */
async function decodeAttachAndList(
  items: StoredItem[],
  intents: MarketplaceIntentClaimV1[],
  ownedAddresses: string[] | undefined,
): Promise<DecodedPsbtInfo[]> {
  const [attachItem, listingItem] = items;
  if (!attachItem || !listingItem || items.length !== 2 || intents.length !== 2) {
    throw new Error('attach-and-list must contain exactly two transactions');
  }
  const attach = await decodeItem(attachItem, intents[0]!, ownedAddresses);
  let linkProblem: string | null;
  let linked: InputAttachedAssets | undefined;
  if (!attach.marketplaceReview || attach.marketplaceReview.status === 'blocked') {
    linkProblem = 'the listing depends on an attach that did not prove';
  } else {
    const unpack = attach.verification.localUnpack;
    const derived = deriveProvedAttachOutput({
      transactionId: attach.psbtDetails.transactionId,
      outputs: attach.psbtDetails.outputs,
      localMessage: unpack?.success ? { messageType: unpack.messageType, data: unpack.data } : undefined,
    });
    if ('problem' in derived) {
      linkProblem = derived.problem;
    } else {
      const listingInput = extractPsbtDetails(listingItem.psbtHex).inputs[1];
      linkProblem = listingSpendsProvedAttach(listingInput, derived.output);
      if (!linkProblem) {
        const proved = derived.output;
        linked = {
          inputIndex: 1,
          utxo: `${proved.txid}:${proved.vout}`,
          assets: [{
            asset: proved.asset,
            quantity: proved.quantityRaw,
            quantity_normalized: await linkedDisplayQuantity(attach, proved),
            asset_longname: null,
          }],
        };
      }
    }
  }
  const listing = await decodeItem(listingItem, intents[1]!, ownedAddresses, linked);
  if (linkProblem) {
    listing.marketplaceReview = withLinkBlocker(listing.marketplaceReview, linkProblem);
  }
  return [attach, listing];
}

export async function decodePsbtBundleForApproval(stored: PsbtBundleApprovalInput, ownedAddresses?: string[]): Promise<DecodedPsbtBundleInfo> {
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
      ownedAddresses,
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
  const decoded: DecodedPsbtInfo[] = parsed.kind === 'attach-and-list'
    ? await decodeAttachAndList(stored.items, parsed.intents, ownedAddresses)
    : await Promise.all(stored.items.map((item, index) =>
        decodeItem(item, parsed.intents[index]!, ownedAddresses)));
  const itemReviews = decoded.map((item, index) =>
    item.marketplaceReview ?? missingReview(
      parsed.intents[index]!.action,
      `marketplace semantic proof ${index + 1} is missing`,
    ));
  const review = analyzeMarketplaceBatch(parsed.kind, parsed.intents, itemReviews);
  return { items: decoded, review };
}
