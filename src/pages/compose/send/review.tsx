import type { ReactElement, ReactNode } from "react";
import { getDieselMintReviewFields } from "@/components/domain/tx/diesel-mint-review-fields";
import { normalizeQuantity } from "@/components/domain/tx/tx-action-info";
import { ReviewScreen } from "@/components/screens/review-screen";
import { useComposer } from "@/contexts/composer-context-object";
import { useSettings } from "@/contexts/settings-context";
import { formatAmount } from "@/core/format";
import { type BigNumber, fromSatoshis, multiply, toBigNumber } from "@/core/numeric";
import { useMarketPrices } from "@/hooks/useMarketPrices";

/**
 * Props for the ReviewSend component.
 */
interface ReviewSendProps {
  apiResponse: any;
  onSign: () => void;
  onBack: () => void;
  error: string | null;
  isSigning: boolean;
}

/**
 * Displays a review screen for sending transactions.
 * Handles both single sends and MPMA (multi-send) transactions.
 */
export function ReviewSend({
  apiResponse,
  onSign,
  onBack,
  error,
  isSigning,
}: ReviewSendProps): ReactElement {
  const { result } = apiResponse;
  const isMPMA = result.name === 'mpma';
  const { settings } = useSettings();
  const { btc: btcPrice } = useMarketPrices(settings.fiat);
  const { state: { decodedMessage } } = useComposer();

  // Build custom fields based on transaction type
  let customFields: Array<{ label: string; value: string | number | ReactNode; rightElement?: ReactNode }> = [];

  if (isMPMA) {
    // MPMA transaction - show expandable list of sends
    // Use normalized quantities from verbose API response
    const assetDestQuantListNormalized = result.params.asset_dest_quant_list_normalized || [];
    const assetDestQuantList = result.params.asset_dest_quant_list || [];

    // Prefer the recipients the transaction actually encodes over the API's echoed list, so a
    // substituted recipient cannot hide behind a correct-looking echo (ADR-019).
    const decodedSends = (decodedMessage?.data as
      | { sends?: Array<{ asset: string; destination: string; quantity: bigint }> }
      | undefined)?.sends;

    const transactions = decodedSends
      ? decodedSends.map((send, index) => ({
          asset: send.asset,
          destination: send.destination,
          quantity: normalizeQuantity(send.quantity, send.asset, result.params, 'asset'),
          memo: result.params.memos?.[index],
        }))
      : assetDestQuantListNormalized.map((item: any[], index: number) => {
          const [asset, destination, quantity] = item;
          return { asset, destination, quantity, memo: result.params.memos?.[index] };
        });

    // Total across the recipients shown above, so the total and the list cannot disagree.
    const totalQuantity = transactions.reduce(
      (sum: BigNumber, tx: { quantity: string | number }) => sum.plus(toBigNumber(tx.quantity)),
      toBigNumber(0)
    );
    const asset = transactions[0]?.asset ?? assetDestQuantList[0]?.[0] ?? '';

    // Show expanded list as custom field
    customFields.push({
      label: `Sends (${transactions.length})`,
      value: "",
      rightElement: (
        <div className="space-y-2 max-h-48 overflow-y-auto mt-2 w-full">
          {transactions.map((tx: any, idx: number) => (
            <div key={idx} className="text-xs border-b border-gray-200 pb-1">
              <div className="font-medium">
                {tx.quantity} {tx.asset}
              </div>
              {/* Wrapped rather than truncated. These recipients are read from the transaction's
                  own bytes above so a substituted one cannot hide behind the echo — clipping the
                  address to a prefix would give that back, since the start of a bech32 address is
                  the part that does not vary. */}
              <div className="text-gray-600 break-all font-mono" title={tx.destination}>
                → {tx.destination}
              </div>
              {tx.memo && (
                <div className="text-gray-500 truncate">
                  Memo: {tx.memo}
                </div>
              )}
            </div>
          ))}
        </div>
      )
    });

    // Total amount
    customFields.push({
      label: "Total",
      value: `${totalQuantity} ${asset}`,
    });
  } else {
    // Single send. Asset, amount, destination and memo are read from the transaction's own message
    // rather than from result.params, which is the API's echo of the request and so cannot testify
    // about the API (ADR-019). A response that composed something other than what it echoed shows
    // the truth here. Divisibility still comes from asset_info — it is a ledger fact rather than a
    // property of this transaction — so only the decimal point retains an echo dependency.
    const decoded = decodedMessage?.data as
      | { asset?: string; quantity?: bigint; destination?: string; memo?: string }
      | undefined;

    const asset = decoded?.asset ?? result.params.asset;
    const isBtc = asset === 'BTC';
    const quantityDisplay = decoded?.quantity !== undefined
      ? normalizeQuantity(decoded.quantity, asset, result.params, 'asset')
      : (result.params.quantity_normalized ?? result.params.quantity);
    const memo = decoded?.memo ?? result.params.memo;
    const amountInFiat = isBtc && btcPrice ? multiply(quantityDisplay ?? 0, btcPrice) : null;
    // Sends have one host output before more_outputs. The verified mint pointer marks where
    // injected wallet storage begins; everything before it is still the caller's BTC payment.
    const extraBtcOutputs = result.params.more_outputs
      ? String(result.params.more_outputs).split(',').slice(0,
          result.diesel_mint ? Math.max(0, result.diesel_mint.utxo_vout - 1) : undefined)
      : [];

    customFields = [
      {
        label: "Amount",
        value: `${quantityDisplay} ${asset}`,
        rightElement: amountInFiat !== null ? (
          <span className="text-gray-500">
            ${formatAmount({ value: amountInFiat, minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        ) : undefined,
      },
      ...(memo ? [{ label: "Memo", value: String(memo) }] : []),
      ...extraBtcOutputs.map((output) => {
        const sats = output.split(':')[0] ?? '0';
        const btcVal = fromSatoshis(sats);
        const fiatVal = btcPrice ? multiply(btcVal, btcPrice) : null;
        return {
          label: "Amount",
          value: `${formatAmount({ value: btcVal, minimumFractionDigits: 8, maximumFractionDigits: 8 })} BTC`,
          rightElement: fiatVal !== null ? (
            <span className="text-gray-500">
              ${formatAmount({ value: fiatVal, minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          ) : undefined,
        };
      }),
      ...getDieselMintReviewFields(result.diesel_mint),
    ];
  }

  return (
    <ReviewScreen
      apiResponse={apiResponse}
      onSign={onSign}
      onBack={onBack}
      customFields={customFields}
      error={error}
      isSigning={isSigning}
    />
  );
}
