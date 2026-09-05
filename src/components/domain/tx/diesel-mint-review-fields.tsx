import type { ComponentProps } from 'react';
import type { ReviewScreen } from '@/components/screens/review-screen';
import type { DieselMintMetadata } from '@/core/counterparty/composeTypes';

type ReviewFields = NonNullable<ComponentProps<typeof ReviewScreen>['customFields']>;

/** Append locally verified mint details without replacing the host transaction's fields. */
export function getDieselMintReviewFields(metadata?: DieselMintMetadata): ReviewFields {
  if (!metadata) return [];

  return [{
    label: 'DIESEL mint',
    value: (
      <div className="space-y-2 text-sm break-words">
        <div className="font-medium">Included</div>
        <div className="text-gray-600">
          +{metadata.marginal_vbytes} vB
          {' '}(~{metadata.estimated_marginal_fee_sats} sat at
          {' '}{metadata.fee_rate_sat_vbyte} sat/vB)
        </div>
        <div className="text-gray-600">
          {metadata.utxo_sats} sat protected
          {metadata.utxo_kind === 'change' ? ' wallet return' : ' storage'};
          {' '}remains yours
        </div>
        {metadata.rolled_utxo && <div className="text-gray-600">Existing DIESEL rolled forward</div>}
        {metadata.pending_chain_position ? (
          <div className="text-gray-600">Unconfirmed chain {metadata.pending_chain_position}/25</div>
        ) : null}
      </div>
    ),
  }];
}
