import { formatAddress, formatAmount } from '@/utils/format';
import { fromSatoshis } from '@/utils/numeric';
import type { MoneyMovement } from './money-movement';

const btc = (sats: number) =>
  formatAmount({ value: fromSatoshis(sats, true), minimumFractionDigits: 8, maximumFractionDigits: 8 });

interface MoneyMovementViewProps {
  movement: MoneyMovement;
  /** ANYONECANPAY: inputs/outputs may be added after signing, so the net can change. */
  flexible?: boolean;
  /** Highlight the network fee as unusually high. */
  hasHighFee?: boolean;
  /**
   * Show the big "You send/receive N" headline. Off when a Counterparty action
   * is the card's headline instead (composition A) — the BTC movement then
   * shows as detail rows only.
   */
  showHeadline?: boolean;
}

/**
 * MoneyMovementView — the anti-blind-signing summary: leads with what actually
 * leaves (or enters) your wallet, then lists where it goes. External
 * destinations are shown plainly (no alarm icon — flagging every outbound send
 * would just re-create habituation); genuine anomalies escalate via the warning
 * stack, not here.
 */
export function MoneyMovementView({ movement, flexible, hasHighFee, showHeadline = true }: MoneyMovementViewProps) {
  const { net, external, backToYou, atRisk, fee, incomplete } = movement;
  const sending = net < 0;

  return (
    <>
      {showHeadline && (
        <div className="text-center mb-3">
          <p className="text-xs text-gray-500 mb-1">{sending ? 'You send' : 'You receive'}</p>
          <p className="text-2xl font-bold text-gray-900">
            {btc(Math.abs(net))} <span className="text-base font-medium text-gray-500">BTC</span>
          </p>
        </div>
      )}
      <div className="pt-3 border-t border-gray-100 space-y-1.5 text-xs">
        {external.map((dest, i) => (
          <div key={i} className="flex items-center justify-between gap-2">
            <span className="text-gray-500 truncate" title={dest.address ?? undefined}>
              {dest.address ? formatAddress(dest.address, true) : 'Unknown address'}
            </span>
            <span className="font-medium text-gray-900 flex-shrink-0">{btc(dest.value)} BTC</span>
          </div>
        ))}
        {backToYou > 0 && (
          <div className="flex items-center justify-between gap-2">
            <span className="text-gray-400">To your wallet</span>
            <span className="text-gray-400 font-normal flex-shrink-0">{btc(backToYou)} BTC</span>
          </div>
        )}
        {atRisk > 0 && (
          <div className="flex items-center justify-between gap-2">
            <span className="text-danger-600">May not return to you</span>
            <span className="text-danger-600 font-medium flex-shrink-0">{btc(atRisk)} BTC</span>
          </div>
        )}
        <div className="flex items-center justify-between gap-2">
          <span className="text-gray-500">Network fee</span>
          <span className={`font-medium flex-shrink-0 ${hasHighFee ? 'text-warning-600' : 'text-gray-900'}`}>
            {btc(fee)} BTC
          </span>
        </div>
        {hasHighFee && (
          <p className="text-warning-600 text-center">Unusually high — double-check before signing.</p>
        )}
      </div>
      {(incomplete || flexible || atRisk > 0) && (
        <div className="mt-2 space-y-1 text-center text-xs">
          {incomplete && (
            <p className="text-warning-600">Some amounts couldn't be determined — review the details.</p>
          )}
          {atRisk > 0 && (
            <p className="text-danger-600">
              This can be sent elsewhere after you sign, so the total above counts it as leaving.
            </p>
          )}
          {flexible && atRisk === 0 && (
            <p className="text-gray-400">More inputs or outputs may be added after you sign.</p>
          )}
        </div>
      )}
    </>
  );
}
