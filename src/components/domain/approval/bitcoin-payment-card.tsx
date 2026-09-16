import type { BitcoinPaymentIntentV1, BitcoinPaymentProof } from '@/core/bitcoin/providerPayment';
import type { DecodedOutput } from '@/core/bitcoin/psbt';
import { formatAmount } from '@/core/format';
import { fromSatoshis, subtract, toBigNumber, toNumber } from '@/core/numeric';
import { ApprovalIdentifier } from './approval-identifier';
import type { MoneyMovement } from './money-movement';

const btc = (sats: number) => formatAmount({
  value: fromSatoshis(sats, true), minimumFractionDigits: 8, maximumFractionDigits: 8,
});

function AmountRow({ label, sats }: { label: string; sats: number }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
      <dt>{label}</dt>
      <dd className="font-medium tabular-nums">{btc(sats)} BTC</dd>
    </div>
  );
}

/** Payment facts are neutral; failed comparisons carry the exact claim and actual outputs. */
export function BitcoinPaymentCard({ intent, proof, failure, movement, outputs }: {
  intent: BitcoinPaymentIntentV1;
  proof: BitcoinPaymentProof | undefined;
  failure?: string[];
  movement?: MoneyMovement;
  outputs?: DecodedOutput[];
}) {
  const reasons = [...new Set([...(failure ?? []), ...(proof?.errors ?? [])])];
  const proved = proof?.proved === true && reasons.length === 0;
  const declared = intent.outputs[0];
  const actual = proof?.outputs[0];
  const unresolved = outputs?.filter(output => !output.address) ?? [];
  // Only a single, identical destination permits a shared address. Multiple or changed
  // destinations keep both complete lists: no positional pairing of unrelated outputs.
  const sameDestination = !proved && intent.outputs.length === 1 && proof?.outputs.length === 1
    && declared?.address === actual?.address;
  const difference = sameDestination && declared && actual ? toNumber(subtract(actual.amountSats, declared.amountSats)) : undefined;
  const changedDestination = intent.outputs.length === 1 && proof?.outputs.length === 1
    && declared?.address !== actual?.address;
  const lead = difference !== undefined && difference !== 0
    ? t('approval_bitcoin_payment_card_transaction_pays_than_requested', [formatAmount({ value: toNumber(toBigNumber(difference).abs()), maximumFractionDigits: 0 }), String(toNumber(toBigNumber(difference).abs()) === 1 ? 'sat' : 'sats'), String(difference > 0 ? 'more' : 'less')])
    : changedDestination ? t('approval_bitcoin_payment_card_the_transaction_pays_a_different')
    : !proof ? reasons[0] ?? t('approval_bitcoin_payment_card_payment_outputs_could_not_be')
    : reasons[0] ?? t('approval_bitcoin_payment_card_the_transaction_does_not_match');
  const context = (
    <>
      {movement && (
        <dl className={`mt-3 space-y-2 border-t pt-3 text-sm leading-5 ${proved ? 'border-gray-100' : 'border-danger-200'}`}>
          {movement.incomplete
            ? <div className="flex flex-wrap justify-between gap-2"><dt>{t('common_network_fee')}</dt><dd>{t('approval_bitcoin_payment_card_unavailable')}</dd></div>
            : <AmountRow label={t('common_network_fee')} sats={movement.fee} />}
          {movement.incomplete
            ? <div className="flex flex-wrap justify-between gap-2"><dt>{t('approval_bitcoin_payment_card_wallet_total')}</dt><dd>{t('approval_bitcoin_payment_card_unavailable')}</dd></div>
            : <AmountRow label={movement.net <= 0 ? t('approval_bitcoin_payment_card_total_leaving_wallet') : t('approval_bitcoin_payment_card_total_entering_wallet')} sats={toNumber(toBigNumber(movement.net).abs())} />}
        </dl>
      )}
      {(intent.description || intent.reference) && (
        <div className={`mt-3 space-y-1 border-t pt-3 text-xs leading-normal [overflow-wrap:anywhere] ${proved ? 'border-gray-100 text-gray-600' : 'border-danger-200 text-danger-800'}`}>
          {intent.description && <p>{t('approval_bitcoin_payment_card_site_description', [String(intent.description)])}</p>}
          {intent.reference && <p>{t('approval_bitcoin_payment_card_reference', [String(intent.reference)])}</p>}
        </div>
      )}
    </>
  );
  return (
    <div className={`rounded-lg p-4 ${proved
      ? 'bg-white shadow-sm text-gray-900'
      : 'border border-danger-200 bg-danger-50 text-danger-900'}`}>
      <div data-testid={proved ? undefined : 'approval-notice'}>
        <h2 className="text-lg font-semibold leading-6">
          {proved ? t('common_send_bitcoin') : t('approval_bitcoin_payment_card_bitcoin_payment_did_not_verify')}
        </h2>
        {!proved && <p className="mt-2 text-sm leading-5">{lead}</p>}
      </div>
      {proved ? (
        <>
        <div className="mt-3 space-y-3">
          {proof?.outputs.map((output) => (
            <div key={output.index}>
              <p className="text-xs leading-normal text-gray-600">{t('approval_bitcoin_payment_card_recipient_receives')}</p>
              <p className="text-2xl leading-tight font-semibold tabular-nums">{btc(output.amountSats)} BTC</p>
              <p className="mt-2 text-gray-700"><ApprovalIdentifier value={output.address} /></p>
            </div>
          ))}
        </div>
        {context}
        </>
      ) : (
        <Collapsible title={t('approval_bitcoin_payment_card_compare_payment_details')} className="mt-3">
        <div className="mt-3 space-y-3">
          {sameDestination && declared && actual ? (
            <>
              <p><ApprovalIdentifier value={actual.address} /></p>
              <dl className="space-y-2 text-sm leading-5">
                <AmountRow label={t('approval_bitcoin_payment_card_site_declared')} sats={declared.amountSats} />
                <AmountRow label={t('approval_bitcoin_payment_card_transaction_pays')} sats={actual.amountSats} />
                <div className="flex flex-wrap justify-between gap-2 border-t border-danger-200 pt-2">
                  <dt>{t('approval_bitcoin_payment_card_difference')}</dt>
                  <dd className="font-semibold tabular-nums">
                    {actual.amountSats > declared.amountSats ? '+' : ''}{difference === undefined ? '' : formatAmount({ value: difference, maximumFractionDigits: 0 })} {toNumber(toBigNumber(difference ?? 0).abs()) === 1 ? 'sat' : 'sats'}
                  </dd>
                </div>
              </dl>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold">{t('approval_bitcoin_payment_card_site_declared')}</p>
              {intent.outputs.map((output, index) => (
                <div key={`declared-${index}`} className="space-y-1">
                  <p className="text-sm font-medium tabular-nums">{btc(output.amountSats)} BTC</p>
                  <p><ApprovalIdentifier value={output.address} /></p>
                </div>
              ))}
              <p className="border-t border-danger-200 pt-3 text-sm font-semibold">{t('approval_bitcoin_payment_card_transaction_pays')}</p>
              {proof && proof.outputs.length > 0 ? proof.outputs.map((output) => (
                <div key={output.index} className="space-y-1">
                  <p className="text-sm font-medium tabular-nums">{btc(output.amountSats)} BTC</p>
                  <p><ApprovalIdentifier value={output.address} /></p>
                </div>
              )) : <p className="text-sm">{proof ? t('approval_bitcoin_payment_card_no_identified_external_payment_address') : t('approval_bitcoin_payment_card_payment_outputs_could_not_be_2')}</p>}
            </>
          )}
          {unresolved.map(output => (
            <div key={output.index} className="space-y-1 border-t border-danger-200 pt-3">
              <p className="text-sm font-medium">{t('approval_bitcoin_payment_card_output_btc', [String(output.index), String(btc(output.value))])}</p>
              <p className="text-sm">{output.type === 'op_return' ? t('approval_bitcoin_payment_card_data_output') : t('approval_bitcoin_payment_card_destination_could_not_be_identified')}</p>
              <p><ApprovalIdentifier value={output.script} /></p>
            </div>
          ))}
          {reasons.length > 0 && (
            <ul className="space-y-2 border-t border-danger-200 pt-3 text-sm leading-5">
              {reasons.map(reason => <li key={reason}>{reason}</li>)}
            </ul>
          )}
          {context}
        </div>
        </Collapsible>
      )}
    </div>
  );
}

import { Collapsible } from '@/components/ui/collapsible';

import { t } from '@/i18n';