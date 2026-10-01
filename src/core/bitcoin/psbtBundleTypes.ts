import type { CommitRevealIntentClaim } from '@/core/counterparty/commitRevealBundle';
import type { ProtocolField } from '@/core/counterparty/describe';
import type { MarketplaceApprovalReview, MarketplaceIntentClaimV1 } from '@/core/counterparty/marketplace/intentTypes';
import type { MarketplaceBatchKind } from '@/core/counterparty/marketplaceBatch';
import type { BumpAcceptanceFeeIntentClaim } from '@/core/counterparty/marketplaceBundle';

/** A concise decision, alongside the complete facts from the same bundle proof. */
export interface PsbtBundleReview extends MarketplaceApprovalReview {
  bundleSummary?: {
    outcome: ProtocolField;
    action: string;
    amounts: ProtocolField[];
    timing?: string;
  };
}

/** Internal name for the existing marketplaceIntent wire field on a bundle item. */
export type PsbtBundleIntent = MarketplaceIntentClaimV1 | BumpAcceptanceFeeIntentClaim | CommitRevealIntentClaim;
export type PsbtBundleKind = 'acceptance-cpfp' | 'commit-and-reveal' | MarketplaceBatchKind;
