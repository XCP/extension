import type {
  BitcoinPaymentIntentV1,
  BitcoinPaymentProof,
} from '@/core/bitcoin/providerPayment';
import { formatAddress, formatAmount } from '@/core/format';
import { fromSatoshis } from '@/core/numeric';

const btc = (sats: number) => formatAmount({
  value: fromSatoshis(sats, true),
  minimumFractionDigits: 8,
  maximumFractionDigits: 8,
});

/**
 * Semantic context for the dedicated plain-Bitcoin provider capability.
 *
 * In the failure state this card is the screen's one voice: the approval page suppresses its
 * generic warning stack for the payment gate, so the concrete reasons must be carried here —
 * and the mismatch must be inspectable, which means showing the site's claim beside what the
 * transaction actually pays.
 */
export function BitcoinPaymentCard({
  intent,
  proof,
  failure,
}: {
  intent: BitcoinPaymentIntentV1;
  proof: BitcoinPaymentProof | undefined;
  /** The gating reasons from the analyzer, when the payment could not be proved. */
  failure?: string[];
}) {
  return (
    <div className={`rounded-lg border p-4 ${
      proof?.proved ? 'border-blue-200 bg-blue-50' : 'border-danger-200 bg-danger-50'
    }`}>
      <p className={`text-sm font-semibold ${proof?.proved ? 'text-blue-900' : 'text-danger-900'}`}>
        {proof?.proved ? 'Bitcoin payment outputs verified' : 'Bitcoin payment did not verify'}
      </p>
      {intent.description && (
        <p className={`mt-1 text-xs ${proof?.proved ? 'text-blue-800' : 'text-danger-800'}`}>
          Site description: {intent.description}
        </p>
      )}
      {intent.reference && (
        <p className={`mt-1 text-xs ${proof?.proved ? 'text-blue-700' : 'text-danger-700'}`}>
          Reference: {intent.reference}
        </p>
      )}
      {proof?.proved && (
        <div className="mt-3 space-y-2 border-t border-blue-200 pt-3">
          {proof.outputs.map((output) => (
            <div key={output.index} className="text-xs text-blue-950">
              <div className="flex justify-between gap-3">
                <span>Payment output #{output.index}</span>
                <span className="font-semibold">{btc(output.amountSats)} BTC</span>
              </div>
              <p className="mt-1 break-all font-mono text-blue-800">
                {formatAddress(output.address, false)}
              </p>
            </div>
          ))}
        </div>
      )}
      {proof?.proved ? (
        <p className="mt-3 text-xs text-blue-700">
          The wallet matched these terms to the PSBT. The site name and description are context,
          not authority to sign.
        </p>
      ) : (
        <>
          {/* The claim beside the bytes, so the mismatch is inspectable rather than asserted. */}
          <div className="mt-3 space-y-2 border-t border-danger-200 pt-3 text-xs text-danger-950">
            <p className="font-semibold">Site declared</p>
            {intent.outputs.map((output, index) => (
              <div key={`declared-${index}`}>
                <div className="flex justify-between gap-3">
                  <span>Payment</span>
                  <span className="font-semibold">{btc(output.amountSats)} BTC</span>
                </div>
                <p className="mt-0.5 break-all font-mono text-danger-800">
                  {formatAddress(output.address, false)}
                </p>
              </div>
            ))}
            <p className="pt-1 font-semibold">Transaction pays</p>
            {proof && proof.outputs.length > 0 ? (
              proof.outputs.map((output) => (
                <div key={`actual-${output.index}`}>
                  <div className="flex justify-between gap-3">
                    <span>Output #{output.index}</span>
                    <span className="font-semibold">{btc(output.amountSats)} BTC</span>
                  </div>
                  <p className="mt-0.5 break-all font-mono text-danger-800">
                    {formatAddress(output.address, false)}
                  </p>
                </div>
              ))
            ) : (
              <p className="text-danger-800">No external payment output</p>
            )}
          </div>
          {failure && failure.length > 0 && (
            <ul className="mt-3 space-y-1 border-t border-danger-200 pt-3 text-xs leading-5 text-danger-800">
              {failure.map((reason) => (
                <li key={reason}>• {reason}</li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
