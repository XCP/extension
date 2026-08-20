import { Collapsible } from '@/components/ui/collapsible';
import type { InputAttachedAssets } from '@/core/counterparty/inputAssets';
import type { ProviderVerificationResult } from '@/core/counterparty/unpack/providerVerify';
import { formatAddress, formatAmount } from '@/core/format';
import { fromSatoshis } from '@/core/numeric';
import { VerificationDetails } from './verification-details';

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

interface ApprovalDetailRecipient {
  asset: string;
  quantity: string;
  address: string;
}

/** The byte-derived transaction facts shared by raw-transaction and PSBT approvals. */
export function ApprovalTransactionDetails({
  txid,
  inputs,
  outputs,
  recipients,
  attachedAssets,
  verification,
}: {
  txid?: string;
  inputs: ApprovalDetailInput[];
  outputs: ApprovalDetailOutput[];
  recipients: ApprovalDetailRecipient[];
  attachedAssets: InputAttachedAssets[];
  verification?: ProviderVerificationResult;
}) {
  const attachedByInput = new Map(attachedAssets.map((entry) => [entry.inputIndex, entry]));

  return (
    <Collapsible variant="card" title="Transaction Details">
      {txid && (
        <div>
          <h4 className="mb-2 text-xs font-medium uppercase text-gray-500">TX Hash</h4>
          <div className="break-all rounded bg-gray-50 p-2 text-xs text-gray-600">{txid}</div>
        </div>
      )}

      <div>
        <h4 className="mb-2 text-xs font-medium uppercase text-gray-500">
          Inputs ({inputs.length})
        </h4>
        <div className="space-y-2">
          {inputs.map((input) => {
            const inputAssets = attachedByInput.get(input.index);
            return (
              <div key={input.index} className="rounded bg-gray-50 p-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-600">#{input.index}</span>
                  {input.value !== undefined && (
                    <span className="font-medium text-gray-900">
                      {formatAmount({
                        value: fromSatoshis(input.value, true),
                        minimumFractionDigits: 8,
                        maximumFractionDigits: 8,
                      })}{' '}
                      BTC
                    </span>
                  )}
                </div>
                {input.address && (
                  <div className="truncate text-gray-500" title={input.address}>
                    {formatAddress(input.address, true)}
                  </div>
                )}
                <div className="truncate text-gray-400" title={input.txid}>
                  {input.txid.slice(0, 8)}...:{input.vout}
                </div>
                {inputAssets?.assets.map((asset) => (
                  <div key={asset.asset} className="mt-1 flex justify-between text-purple-700">
                    <span className="truncate" title={asset.asset_longname ?? asset.asset}>
                      {asset.asset_longname ?? asset.asset}
                    </span>
                    <span className="ml-2 flex-shrink-0 font-medium">
                      {asset.quantity_normalized}
                    </span>
                  </div>
                ))}
                {inputAssets?.lookupFailed && (
                  <div className="mt-1 text-amber-600">Asset status unavailable</div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <h4 className="mb-2 text-xs font-medium uppercase text-gray-500">
          Outputs ({outputs.length})
        </h4>
        <div className="space-y-2">
          {outputs.map((output) => (
            <div key={output.index} className="rounded bg-gray-50 p-2 text-xs">
              <div className="flex justify-between">
                <span className={output.type === 'op_return' ? 'text-purple-600' : 'text-gray-600'}>
                  {output.type === 'op_return' ? 'OP_RETURN' : output.type.toUpperCase()}
                </span>
                <span className="font-medium text-gray-900">
                  {formatAmount({
                    value: fromSatoshis(output.value, true),
                    minimumFractionDigits: 8,
                    maximumFractionDigits: 8,
                  })}{' '}
                  BTC
                </span>
              </div>
              {/* Destinations are shown in full: short address fragments are grindable. */}
              {output.address && (
                <div className="break-all font-mono text-gray-500" title={output.address}>
                  {formatAddress(output.address, false)}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {recipients.length > 0 && (
        <div>
          <h4 className="mb-2 text-xs font-medium uppercase text-gray-500">
            Recipients ({recipients.length})
          </h4>
          <div className="space-y-2">
            {recipients.map((recipient, index) => (
              <div key={`${recipient.address}-${index}`} className="rounded bg-gray-50 p-2 text-xs">
                <div className="flex justify-between gap-2">
                  <span className="truncate text-gray-600">{recipient.asset}</span>
                  <span className="flex-shrink-0 font-medium text-gray-900">
                    {recipient.quantity}
                  </span>
                </div>
                <div className="break-all font-mono text-gray-500" title={recipient.address}>
                  {recipient.address}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <VerificationDetails verification={verification} />
    </Collapsible>
  );
}
