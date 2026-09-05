import type { ProtocolField } from '@/core/counterparty/describe';
import type { MarketplaceApprovalReview } from '@/core/counterparty/marketplaceIntent';

/** A concise decision, alongside the complete facts from the same bundle proof. */
export interface MarketplaceBundleReview extends MarketplaceApprovalReview {
  bundleSummary?: {
    outcome: ProtocolField;
    action: string;
    amounts: ProtocolField[];
    timing?: string;
  };
}
