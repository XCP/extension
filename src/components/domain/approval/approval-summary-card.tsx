import { formatAmount } from '@/utils/format';
import { fromSatoshis } from '@/utils/numeric';
import { MoneyMovementView } from './money-movement-view';
import type { MoneyMovement } from './money-movement';

interface ApprovalSummaryCardProps {
  /** Decoded Counterparty action, if any — the "what kind" headline. */
  txAction: { label: string; description: string } | null;
  /** Structural net effect on the signer's wallet. */
  movement: MoneyMovement;
  /** ANYONECANPAY — the movement can change after signing. */
  flexible: boolean;
  hasHighFee: boolean;
  /** Counterparty protocol (XCP) fee in sats, if any. */
  protocolFeeXcp: number | null;
}

/**
 * ApprovalSummaryCard — the top-of-screen "what am I signing" card. When the
 * transaction is a Counterparty action, that is the headline and the BTC
 * money-movement shows as detail beneath it (composition A); otherwise the
 * money-movement leads. Either way the money-movement is always present, so
 * unexpected funds leaving the wallet are visible — the anti-blind-signing goal.
 */
export function ApprovalSummaryCard({
  txAction,
  movement,
  flexible,
  hasHighFee,
  protocolFeeXcp,
}: ApprovalSummaryCardProps) {
  return (
    <div className="bg-white rounded-lg shadow-sm p-5">
      {txAction && (
        <div className="text-center mb-3">
          <p className="text-xs text-gray-500 mb-1">{txAction.label}</p>
          <p className="text-lg font-bold text-gray-900">{txAction.description}</p>
        </div>
      )}
      <MoneyMovementView movement={movement} flexible={flexible} hasHighFee={hasHighFee} showHeadline={!txAction} />
      {protocolFeeXcp != null && protocolFeeXcp > 0 && (
        <div className="mt-1.5 flex items-center justify-center gap-2 text-xs">
          <span className="text-gray-500">Protocol Fee:</span>
          <span className="text-sm font-medium text-purple-700">
            {formatAmount({ value: fromSatoshis(protocolFeeXcp, true), minimumFractionDigits: 8, maximumFractionDigits: 8 })} XCP
          </span>
        </div>
      )}
    </div>
  );
}
