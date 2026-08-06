import type { MoneyMovement } from '@/components/domain/approval/money-movement';
import { MoneyMovementView } from '@/components/domain/approval/money-movement-view';
import { formatAmount } from '@/core/format';
import { fromSatoshis } from '@/core/numeric';

/**
 * Split a trailing address off a headline so the two can be set differently.
 *
 * A send or sweep headline ends in an address, which is one unbreakable token: set in 18px bold it
 * overflows the popup and puts a horizontal scrollbar under the whole screen, pushing the tail of
 * the destination out of view — on the line that says where the money goes. Truncating instead
 * would reintroduce the lookalike-grinding problem the outputs list deliberately avoids.
 *
 * Lives here because both approval screens render this headline. It was previously fixed inline on
 * the transaction screen only, so the PSBT screen kept overflowing.
 */
export function splitTrailingAddress(description: string): { sentence: string; address?: string } {
  const match = description.match(
    /^(.*?)\s((?:bc1|tb1)[023456789acdefghjklmnpqrstuvwxyz]{20,}|[13][1-9A-HJ-NP-Za-km-z]{25,34})$/
  );
  return match ? { sentence: match[1]!, address: match[2]! } : { sentence: description };
}

interface ApprovalSummaryCardProps {
  /** Decoded Counterparty action, if any — the "what kind" headline. */
  txAction: { label: string; description: string } | null;
  /** Structural net effect on the signer's wallet. */
  movement: MoneyMovement;
  /** ANYONECANPAY — the movement can change after signing. */
  flexible: boolean;
  hasHighFee: boolean;
  /** Outputs exceed inputs; the fee depends on inputs the counterparty has yet to add. */
  unfunded?: boolean;
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
  unfunded,
  protocolFeeXcp,
}: ApprovalSummaryCardProps) {
  return (
    <div className="bg-white rounded-lg shadow-sm p-5">
      {txAction && (
        <div className="text-center mb-3">
          <p className="text-xs text-gray-500 mb-1">{txAction.label}</p>
          {(() => {
            const { sentence, address } = splitTrailingAddress(txAction.description);
            return (
              <>
                <p className="text-lg font-bold text-gray-900 break-words">{sentence}</p>
                {address && (
                  <p className="mt-1 text-sm font-medium font-mono text-gray-700 break-all">
                    {address}
                  </p>
                )}
              </>
            );
          })()}
        </div>
      )}
      <MoneyMovementView movement={movement} flexible={flexible} hasHighFee={hasHighFee} unfunded={unfunded} showHeadline={!txAction} />
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
