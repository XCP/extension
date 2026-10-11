import type { ReactElement } from "react";
import { normalizeQuantity } from "@/components/domain/tx/tx-action-info";
import { ReviewScreen, type TransactionReviewProps } from "@/components/screens/review-screen";
import type { ComposeParams } from "@/core/counterparty/compose";

import { t } from '@/i18n';

type ReviewMPMAProps = TransactionReviewProps<Pick<ComposeParams, 'asset_dest_quant_list' | 'memos' | 'verified_asset_info'>>;

export function ReviewMPMA({
  apiResponse,
  onSign,
  onBack,
  error,
  isSigning,
}: ReviewMPMAProps): ReactElement {
  const { result } = apiResponse;

  // Compose returns base units; mixed-asset sends need independently read divisibility per asset.
  const transactions = (result.params.asset_dest_quant_list || []).map(
    (item, index) => {
      const [asset, destination, quantity] = item;
      return {
        asset,
        destination,
        quantity: normalizeQuantity(quantity, asset, { asset_info: result.params.verified_asset_info?.[asset] }, 'asset'),
        memo: result.params.memos?.[index],
      };
    }
  );

  const customFields: Array<{ label: string; value: string | number; rightElement?: React.ReactNode }> = [
    {
      label: t('common_send'),
      value: "",
      rightElement: (
        <div className="space-y-2 max-h-48 overflow-y-auto mt-2 w-full">
          {transactions.length === 0 ? (
            <div className="text-xs text-gray-500">{t('mpma_review_no_sends')}</div>
          ) : (
            transactions.map((tx: { asset: string; destination: string; quantity: string | number; memo?: string }, idx: number) => (
              <div key={idx} className="text-xs border-b pb-1">
                <div className="font-mono">
                  {t('mpma_review_send', [String(idx + 1), String(tx.quantity), String(tx.asset)])}
                </div>
                <div className="text-gray-600 truncate">
                  to {tx.destination}
                </div>
                {tx.memo && (
                  <div className="text-gray-500">
                    {t('common_memo_2', [String(tx.memo)])}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )
    }
  ];

  return (
    <ReviewScreen
      apiResponse={apiResponse}
      onSign={onSign}
      onBack={onBack}
      customFields={customFields}
      error={error}
      isSigning={isSigning}
    />
  );
}
