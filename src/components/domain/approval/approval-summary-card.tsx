import { formatAmount } from '@/utils/format';
import { fromSatoshis } from '@/utils/numeric';

/** Fee breakdown for an atomic-swap purchase (buyer completing a swap). */
export interface SwapFeeBreakdown {
  sellerPayment: number;
  sellerAddress?: string;
  platformFee: number;
  platformAddress: string;
  networkFee: number;
}

interface ApprovalSummaryCardProps {
  /** Decoded Counterparty action, if any. */
  txAction: { label: string; description: string } | null;
  /** The user is signing with ANYONECANPAY — an atomic-swap listing (seller). */
  isSwapListing: boolean;
  /** Detected atomic-swap purchase (buyer), else null. */
  swapFeeBreakdown: SwapFeeBreakdown | null;
  /** Network fee in sats. */
  fee: number;
  hasHighFee: boolean;
  /** Total input value in sats (plain-BTC headline). */
  totalValue: number;
  /** Listing price in sats (swap-listing headline). */
  listingPrice: number;
  /** Protocol (XCP) fee in sats, if the message carries one. */
  protocolFeeXcp: number | null;
}

const btc = (sats: number) =>
  formatAmount({ value: fromSatoshis(sats, true), minimumFractionDigits: 8, maximumFractionDigits: 8 });

/**
 * ApprovalSummaryCard — the "what am I signing + fee" card at the top of the
 * approval screen. Renders one of four scenarios (Counterparty action, atomic-
 * swap listing, atomic-swap purchase, or plain BTC) plus the fee section,
 * keeping that conditional density in one focused, testable component instead
 * of nested ternaries inside the page.
 */
export function ApprovalSummaryCard({
  txAction,
  isSwapListing,
  swapFeeBreakdown,
  fee,
  hasHighFee,
  totalValue,
  listingPrice,
  protocolFeeXcp,
}: ApprovalSummaryCardProps) {
  return (
    <div className="bg-white rounded-lg shadow-sm p-5">
      <div className="text-center mb-3">
        {txAction ? (
          <>
            <p className="text-xs text-gray-500 mb-1">{txAction.label}</p>
            <p className="text-lg font-bold text-gray-900">{txAction.description}</p>
          </>
        ) : isSwapListing ? (
          <>
            <p className="text-xs text-gray-500 mb-1">Atomic Swap Listing</p>
            <p className="text-lg font-bold text-gray-900">
              {btc(listingPrice)} <span className="text-base font-medium text-gray-500">BTC</span>
            </p>
            <p className="text-xs text-gray-400 mt-1">Listing price (paid to you when sold)</p>
          </>
        ) : swapFeeBreakdown ? (
          <>
            <p className="text-xs text-gray-500 mb-1">Atomic Swap Purchase</p>
            <p className="text-lg font-bold text-gray-900">
              {btc(swapFeeBreakdown.sellerPayment)} <span className="text-base font-medium text-gray-500">BTC</span>
            </p>
            <p className="text-xs text-gray-400 mt-1">Payment to seller</p>
          </>
        ) : (
          <>
            <p className="text-xs text-gray-500 mb-1">Total Value</p>
            <p className="text-2xl font-bold text-gray-900">
              {btc(totalValue)} <span className="text-base font-medium text-gray-500">BTC</span>
            </p>
          </>
        )}
      </div>
      <div className="text-center pt-3 border-t border-gray-100 space-y-1.5">
        {swapFeeBreakdown ? (
          <>
            <div className="flex items-center justify-center gap-2">
              <span className="text-xs text-gray-500">Seller payment:</span>
              <span className="text-xs font-medium text-gray-900">
                {swapFeeBreakdown.sellerPayment.toLocaleString()} sats
              </span>
            </div>
            <div className="flex items-center justify-center gap-2">
              <span className="text-xs text-gray-500">Platform fee:</span>
              <span className="text-xs font-medium text-gray-900">
                {swapFeeBreakdown.platformFee.toLocaleString()} sats
                {swapFeeBreakdown.sellerPayment > 0 && (
                  <span className="text-gray-400 font-normal ml-1">
                    ({((swapFeeBreakdown.platformFee / swapFeeBreakdown.sellerPayment) * 100).toFixed(1)}%)
                  </span>
                )}
              </span>
            </div>
            <div className="flex items-center justify-center gap-2">
              <span className="text-xs text-gray-500">Network fee:</span>
              <span className={`text-xs font-medium ${swapFeeBreakdown.networkFee > 10000000 ? 'text-warning-600' : 'text-gray-900'}`}>
                {swapFeeBreakdown.networkFee.toLocaleString()} sats
              </span>
            </div>
          </>
        ) : (
          <>
            {fee > 0 && (
              <div className="flex items-center justify-center gap-2">
                <span className="text-xs text-gray-500">Network Fee:</span>
                <span className={`text-xs font-medium ${hasHighFee ? 'text-warning-600' : 'text-gray-900'}`}>
                  {btc(fee)} BTC
                  <span className="text-gray-400 font-normal ml-1">({fee.toLocaleString()} sats)</span>
                </span>
              </div>
            )}
            {hasHighFee && (
              <p className="text-xs text-warning-600">Unusually high — double-check before signing.</p>
            )}
            {protocolFeeXcp != null && protocolFeeXcp > 0 && (
              <div className="flex items-center justify-center gap-2">
                <span className="text-xs text-gray-500">Protocol Fee:</span>
                <span className="text-sm font-medium text-purple-700">{btc(protocolFeeXcp)} XCP</span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
