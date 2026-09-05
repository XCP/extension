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

/** The byte-derived transaction facts shared by raw-transaction and PSBT approvals. */
export function ApprovalTransactionDetails({
  txid,
  inputs,
  outputs,
  attachedAssets,
  verification,
  attachVout,
}: {
  txid?: string;
  inputs: ApprovalDetailInput[];
  outputs: ApprovalDetailOutput[];
  attachedAssets: InputAttachedAssets[];
  verification?: ProviderVerificationResult;
  /** The output an attach turns into the new asset-bearing UTXO, so the list can mark it. */
  attachVout?: number;
}) {
  const attachedByInput = new Map(attachedAssets.map((entry) => [entry.inputIndex, entry]));

  return (
    <Collapsible compact variant="card" title="Transaction Details">
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
                {/* The buttons' blue, not a warning color: the data output is the protocol
                    working as designed. Indexed so "New UTXO …:1" maps to a row here. */}
                <span className={output.type === 'op_return' ? 'text-blue-500' : 'text-gray-600'}>
                  #{output.index}{' '}
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
              {output.type === 'op_return' && verification?.localUnpack?.success && (
                <div className="mt-0.5 text-gray-500">Counterparty protocol</div>
              )}
              {/* Destinations are shown in full: short address fragments are grindable. */}
              {output.address && (
                <div className="break-all font-mono text-gray-500" title={output.address}>
                  {formatAddress(output.address, false)}
                </div>
              )}
              {attachVout === output.index && (
                <div className="mt-1 text-purple-700">Assets attach to this output</div>
              )}
            </div>
          ))}
        </div>
      </div>

      <VerificationDetails verification={verification} />
    </Collapsible>
  );
}
