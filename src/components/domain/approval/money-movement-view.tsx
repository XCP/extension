import type { MoneyMovement } from '@/components/domain/approval/money-movement';
import type { PsbtFlexibilityKind } from '@/components/domain/approval/psbt-flexibility';
import { formatAddress, formatAmount } from '@/core/format';
import { fromSatoshis } from '@/core/numeric';

const btc = (sats: number) =>
  formatAmount({ value: fromSatoshis(sats, true), minimumFractionDigits: 8, maximumFractionDigits: 8 });

interface MoneyMovementViewProps {
  movement: MoneyMovement;
  /** The exact flexibility left by the requested ANYONECANPAY signatures. */
  flexibility?: PsbtFlexibilityKind;
  /** Highlight the network fee as unusually high. */
  hasHighFee?: boolean;
  /** A focused Review step presents cautions after the first click; keep this summary neutral. */
  deferCautions?: boolean;
  /** The outputs exceed the inputs, so the fee depends on inputs someone else has yet to add. */
  unfunded?: boolean;
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
export function MoneyMovementView({
  movement,
  flexibility,
  hasHighFee,
  deferCautions = false,
  unfunded,
  showHeadline = true,
}: MoneyMovementViewProps) {
  const { net, external, backToYou, atRisk, fee, incomplete } = movement;
  const sending = net < 0;

  return (
    <>
      {showHeadline && (
        <div className="text-center mb-3">
          {incomplete ? (
            // An input whose value or owner could not be resolved is left out of `spent`, which
            // drives `net` non-negative and would announce "You receive" over a transaction that is
            // draining the wallet. The direction is not knowable here, so it is not claimed; the
            // destinations below still show what can be read from the transaction.
            <>
              <p className="text-xs text-gray-500 mb-1">Net effect</p>
              <p className="text-2xl leading-tight font-semibold tabular-nums text-warning-600">Couldn&apos;t be determined</p>
            </>
          ) : (
            <>
              <p className="text-xs text-gray-500 mb-1">{sending ? 'You send' : 'You receive'}</p>
              <p className="text-2xl leading-tight font-semibold tabular-nums text-gray-900">
                {btc(Math.abs(net))} <span className="text-base font-medium text-gray-500">BTC</span>
              </p>
            </>
          )}
        </div>
      )}
      <div className="pt-3 border-t border-gray-100 space-y-2 text-sm leading-5">
        {external.map((dest, i) => (
          <div key={i} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <span className="text-gray-500 truncate" title={dest.address ?? undefined}>
              {dest.address
                ? formatAddress(dest.address, true)
                : dest.isData
                  ? 'Protocol data (recoverable)'
                  : 'Unknown address'}
            </span>
            <span className="font-medium text-gray-900 tabular-nums">{btc(dest.value)} BTC</span>
          </div>
        ))}
        {atRisk > 0 && (
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <span className={deferCautions ? 'text-gray-500' : 'text-danger-600'}>Not guaranteed back</span>
            <span className={`${deferCautions ? 'text-gray-900' : 'text-danger-600'} font-medium tabular-nums`}>
              {btc(atRisk)} BTC
            </span>
          </div>
        )}
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <span className="text-gray-500">Network fee</span>
          <span className={`font-medium tabular-nums ${hasHighFee && !deferCautions ? 'text-warning-600' : 'text-gray-900'}`}>
            {unfunded ? 'Set by the other party' : incomplete ? 'Unavailable' : `${btc(fee)} BTC`}
          </span>
        </div>
        {backToYou > 0 && (
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            {/* This can include more than a conventional change output, such as a paired-address
                asset destination, so name the ownership fact without misclassifying the outputs. */}
            <span className="text-gray-500">Returned to wallet</span>
            <span className="text-gray-500 font-medium tabular-nums">{btc(backToYou)} BTC</span>
          </div>
        )}
        {hasHighFee && !deferCautions && (
          <p className="text-warning-600 text-center">Unusually high — double-check before signing.</p>
        )}
      </div>
      {(incomplete
        || flexibility === 'inputs-only'
        || (!deferCautions && (flexibility === 'outputs-flexible' || atRisk > 0))) && (
        <div className="mt-2 space-y-1 text-center text-xs">
          {incomplete && (
            <p className="text-warning-600">Some amounts couldn't be determined — review the details.</p>
          )}
          {atRisk > 0 && !deferCautions && (
            <p className="text-danger-600">
              This can be sent elsewhere after you sign, so the total above counts it as leaving.
            </p>
          )}
          {flexibility === 'inputs-only' && atRisk === 0 && (
            <p className="text-gray-500">
              Other inputs may be added; every current output is fixed by your signature.
            </p>
          )}
          {flexibility === 'outputs-flexible' && atRisk === 0 && !deferCautions && (
            <p className="text-warning-600">
              Other inputs or outputs may be added or changed after you sign.
            </p>
          )}
        </div>
      )}
    </>
  );
}
