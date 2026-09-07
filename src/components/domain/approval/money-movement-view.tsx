import type { MoneyMovement } from '@/components/domain/approval/money-movement';
import type { PsbtFlexibilityKind } from '@/components/domain/approval/psbt-flexibility';
import { formatAddress, formatAmount } from '@/core/format';
import { fromSatoshis } from '@/core/numeric';

import { t } from '@/i18n';

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
  const { net, external, atRisk, fee, incomplete } = movement;
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
              <p className="text-xs text-gray-500 mb-1">{t('approval_money_movement_view_net_effect')}</p>
              <p className="text-2xl leading-tight font-semibold tabular-nums text-warning-600">{t('approval_money_movement_view_couldn_t_be_determined')}</p>
            </>
          ) : (
            <>
              <p className="text-xs text-gray-500 mb-1">{sending ? t('approval_money_movement_view_you_send') : t('asset_fairmint_summary_you_receive')}</p>
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
                  ? t('approval_money_movement_view_protocol_data_recoverable')
                  : t('approval_money_movement_view_unknown_address')}
            </span>
            <span className="font-medium text-gray-900 tabular-nums">{btc(dest.value)} BTC</span>
          </div>
        ))}
        {atRisk > 0 && (
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <span className={deferCautions ? 'text-gray-500' : 'text-danger-600'}>{t('approval_money_movement_view_not_guaranteed_back')}</span>
            <span className={`${deferCautions ? 'text-gray-900' : 'text-danger-600'} font-medium tabular-nums`}>
              {btc(atRisk)} BTC
            </span>
          </div>
        )}
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <span className="text-gray-500">{t('common_network_fee')}</span>
          <span className={`font-medium tabular-nums ${hasHighFee && !deferCautions ? 'text-warning-600' : 'text-gray-900'}`}>
            {unfunded ? t('approval_money_movement_view_set_by_the_other_party') : incomplete ? 'Unavailable' : `${btc(fee)} BTC`}
          </span>
        </div>
        {/* Outputs that come back to this wallet are not listed: change is routine, and every
            such output is still itemized under Transaction. Only the at-risk portion above is
            a decision fact. */}
        {hasHighFee && !deferCautions && (
          <p className="text-warning-600 text-center">{t('approval_money_movement_view_unusually_high_double_check_before')}</p>
        )}
      </div>
      {(incomplete
        || flexibility === 'inputs-only'
        || (!deferCautions && (flexibility === 'outputs-flexible' || atRisk > 0))) && (
        <div className="mt-2 space-y-1 text-center text-xs">
          {incomplete && (
            <p className="text-warning-600">{t('approval_money_movement_view_some_amounts_couldn_t_be')}</p>
          )}
          {atRisk > 0 && !deferCautions && (
            <p className="text-danger-600">
              {t('approval_money_movement_view_this_can_be_sent_elsewhere')}
            </p>
          )}
          {flexibility === 'inputs-only' && atRisk === 0 && (
            <p className="text-gray-500">
              {t('approval_money_movement_view_other_inputs_may_be_added')}
            </p>
          )}
          {flexibility === 'outputs-flexible' && atRisk === 0 && !deferCautions && (
            <p className="text-warning-600">
              {t('approval_money_movement_view_other_inputs_or_outputs_may')}
            </p>
          )}
        </div>
      )}
    </>
  );
}
