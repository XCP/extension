import { Collapsible } from '@/components/ui/collapsible';
import type { InputAttachedAssets } from '@/core/counterparty/inputAssets';
import type { ProviderVerificationResult } from '@/core/counterparty/unpack/providerVerify';
import { formatAmount } from '@/core/format';
import { fromSatoshis } from '@/core/numeric';
import { t } from '@/i18n';
import { ApprovalCopyButton, ApprovalIdentifier } from './approval-identifier';
import { ApprovalList } from './approval-list';
import { VerificationDetails } from './verification-details';

/**
 * A value in the screen's one unit. Marketplace screens state every price and fee in sats, so their
 * inputs and outputs do too; a list in BTC under a summary in sats reads as two different sums.
 */
type ApprovalUnit = 'btc' | 'sats';

function formatApprovalValue(sats: number, unit: ApprovalUnit): string {
  return unit === 'sats'
    ? t('psbt_approve_sats', [formatAmount({ value: sats, maximumFractionDigits: 0 })])
    : `${formatAmount({ value: fromSatoshis(sats, true), minimumFractionDigits: 8, maximumFractionDigits: 8 })} BTC`;
}

interface ApprovalDetailInput {
  index: number;
  txid: string;
  vout: number;
  value?: number;
  address?: string;
}

interface ApprovalDetailOutput {
  index: number;
  value: number;
  address?: string;
  type: string;
}

/** The byte-derived transaction facts shared by raw-transaction and PSBT approvals. */
export function ApprovalTransactionDetails({
  txid,
  inputs,
  outputs,
  attachedAssets,
  verification,
  attachVout,
  unit = 'btc',
}: {
  txid?: string;
  inputs: ApprovalDetailInput[];
  outputs: ApprovalDetailOutput[];
  attachedAssets: InputAttachedAssets[];
  verification?: ProviderVerificationResult;
  /** The output an attach turns into the new asset-bearing UTXO, so the list can mark it. */
  attachVout?: number;
  unit?: ApprovalUnit;
}) {
  const attachedByInput = new Map(attachedAssets.map((entry) => [entry.inputIndex, entry]));

  return (
    <Collapsible compact variant="card" title={t('common_transaction')}>
      {txid && (
        <div>
          <h4 className="mb-2 text-xs font-medium uppercase text-gray-500">{t('common_tx_hash')}</h4>
          <div className="rounded bg-gray-50 px-2 py-1.5 text-gray-700">
            <ApprovalIdentifier value={txid} copyLabel={t('common_tx_hash')} />
          </div>
        </div>
      )}

      <div>
        <h4 className="mb-2 text-xs font-medium uppercase text-gray-500">
          {t('approval_approval_transaction_details_inputs', [String(inputs.length)])}
        </h4>
        <ApprovalList
          items={inputs}
          render={(input) => {
            const inputAssets = attachedByInput.get(input.index);
            return (
              <div key={input.index} className="space-y-0.5 rounded bg-gray-50 px-2 py-1.5 text-xs">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="text-gray-600">
                    #{input.index}
                    {/* On the index line, so the address below keeps the full width. */}
                    {input.address && <ApprovalCopyButton value={input.address} className="-my-1 ml-1 align-middle" />}
                  </span>
                  {input.value !== undefined && (
                    <span className="ml-auto font-medium tabular-nums text-gray-900">{formatApprovalValue(input.value, unit)}</span>
                  )}
                </div>
                {/* In full: the signer list and inputs are where a lookalike address would hide. */}
                {input.address && <div className="text-gray-700"><ApprovalIdentifier value={input.address} copy={false} /></div>}
                <div className="text-gray-500"><ApprovalIdentifier value={`${input.txid}:${input.vout}`} copy={false} /></div>
                {inputAssets?.assets.map((asset) => (
                  <div key={asset.asset} className="flex flex-wrap items-baseline justify-between gap-x-3 text-purple-700">
                    <span className="min-w-0 [overflow-wrap:anywhere]">{asset.asset_longname ?? asset.asset}</span>
                    <span className="ml-auto font-medium tabular-nums">{asset.quantity_normalized}</span>
                  </div>
                ))}
                {inputAssets?.lookupFailed && (
                  <div className="text-amber-600">{t('approval_approval_transaction_details_asset_status_unavailable')}</div>
                )}
              </div>
            );
          }}
        />
      </div>

      <div>
        <h4 className="mb-2 text-xs font-medium uppercase text-gray-500">
          {t('approval_approval_transaction_details_outputs', [String(outputs.length)])}
        </h4>
        <ApprovalList
          items={outputs}
          render={(output) => (
            <div key={output.index} className="space-y-0.5 rounded bg-gray-50 px-2 py-1.5 text-xs">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                {/* The buttons' blue, not a warning color: the data output is the protocol
                    working as designed. Indexed so "New UTXO …:1" maps to a row here. */}
                <span className={output.type === 'op_return' ? 'text-blue-500' : 'text-gray-600'}>
                  #{output.index}{' '}
                  {output.type === 'op_return' ? 'OP_RETURN' : output.type.toUpperCase()}
                  {output.address && <ApprovalCopyButton value={output.address} className="-my-1 ml-1 align-middle" />}
                </span>
                <span className="ml-auto font-medium tabular-nums text-gray-900">{formatApprovalValue(output.value, unit)}</span>
              </div>
              {output.type === 'op_return' && verification?.localUnpack?.success && (
                <div className="text-gray-500">{t('approval_approval_transaction_details_counterparty_protocol')}</div>
              )}
              {/* Destinations are shown in full: short address fragments are grindable. */}
              {output.address && <div className="text-gray-700"><ApprovalIdentifier value={output.address} copy={false} /></div>}
              {attachVout === output.index && (
                <div className="text-purple-700">{t('approval_approval_transaction_details_assets_attach_to_this_output')}</div>
              )}
            </div>
          )}
        />
      </div>

      <VerificationDetails verification={verification} />
    </Collapsible>
  );
}
