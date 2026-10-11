import type { TransactionReviewProps } from '@/components/screens/review-screen';
import type { ComposeAssetInfo, ComposeParams, DestroyOptions, IssuanceOptions } from '@/core/counterparty/compose';

/** Only the asset metadata used for supply comparisons; it may be unavailable. */
interface AssetSupplyReviewParams extends Pick<ComposeParams, 'asset' | 'quantity'> {
  quantity_normalized?: ComposeParams['quantity_normalized'];
  asset_info?: Partial<Pick<ComposeAssetInfo, 'supply_normalized' | 'divisible' | 'description'>>;
}

/** Params presented after compose verification; this type is not a response validator. */
export type IssuanceReviewProps = TransactionReviewProps<
  AssetSupplyReviewParams & Partial<Pick<IssuanceOptions, 'description' | 'divisible' | 'lock' | 'transfer_destination'>>
>;

export type DestroyReviewProps = TransactionReviewProps<
  AssetSupplyReviewParams & Pick<DestroyOptions, 'tag'>
>;
