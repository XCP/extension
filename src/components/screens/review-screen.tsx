import type { ReactElement, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Collapsible } from "@/components/ui/collapsible";
import { ErrorAlert } from "@/components/ui/error-alert";
import { useComposerOptional } from "@/contexts/composer-context-object";
import { useSettings } from "@/contexts/settings-context";
import { formatAddress, formatAmount } from "@/core/format";
import { formatFeeRate, fromSatoshis } from "@/core/numeric";
import { useMarketPrices } from "@/hooks/useMarketPrices";

/**
 * Transaction result from API response
 */
interface TransactionResult {
  params: {
    source?: string;
    destination?: string;
    address?: string;
    dispenser?: string;
    [key: string]: any;
  };
  name?: string;
  btc_fee: number;
  xcp_fee?: number;
  [key: string]: any;
}

/**
 * API response structure for transaction composition
 */
interface ApiResponse {
  result: TransactionResult;
  [key: string]: any;
}

/**
 * Custom field for displaying transaction details
 */
interface CustomField {
  label: string;
  value: string | number | ReactNode;
  rightElement?: ReactNode;
}

/**
 * Props for the ReviewScreen component
 */
interface ReviewScreenProps {
  /** API response containing transaction details */
  apiResponse: ApiResponse;
  /** Callback when user clicks sign button */
  onSign: () => void;
  /** Callback when user clicks back button */
  onBack: () => void;
  /** Additional fields to display in the review */
  customFields?: CustomField[];
  /** Error message to display */
  error: string | null;
  /** Whether the transaction is being signed */
  isSigning: boolean;
  /** Hide the back button (e.g., for provider requests with no form to go back to) */
  hideBackButton?: boolean;
}

/**
 * Displays a transaction review screen with details and actions.
 * 
 * This component shows transaction details in a structured format,
 * allowing users to review before signing and broadcasting.
 * 
 * @example
 * ```tsx
 * <ReviewScreen
 *   apiResponse={composedTransaction}
 *   onSign={() => signTransaction()}
 *   onBack={() => goBack()}
 *   customFields={[
 *     { label: "Amount", value: "100 XCP" },
 *     { label: "Memo", value: "Payment for services" }
 *   ]}
 *   error={null}
 *   isSigning={false}
 * />
 * ```
 */
export function ReviewScreen({
  apiResponse,
  onSign,
  onBack,
  customFields = [],
  error,
  isSigning,
  hideBackButton = false,
}: ReviewScreenProps): ReactElement {
  const { result } = apiResponse;
  const { settings } = useSettings();
  const { btc: btcPrice, xcp: xcpPrice } = useMarketPrices(settings.fiat);

  // Prefer the destination the transaction actually encodes over the API's echo of the request.
  // `result.params` is the composer repeating what it was asked for, so it cannot testify about
  // the composer (ADR-019): a response that composed a different recipient than it echoed would
  // otherwise display as correct. Types with byte equality are already proven, but the ones
  // verified only field by field — btcpay, dispenser, the pool and UTXO screens — are exactly
  // where an unenumerated difference could hide, and they all render through here.
  //
  // Optional context because this component is also rendered outside a compose flow.
  const decoded = useComposerOptional()?.state.decodedMessage?.data as
    | { destination?: string; source?: string }
    | undefined;

  const sourceAddress = result.name === "dispense" ? result.params.address : result.params.source;
  const destinationAddress = result.name === "dispense"
    ? result.params.dispenser
    // A move encodes "txid:vout"; anything else the decoder reports is an address.
    : decoded?.destination ?? result.params.destination;

  // Calculate fee in fiat
  const feeInBtc = fromSatoshis(result.btc_fee, true);
  const feeInFiat = btcPrice ? feeInBtc * btcPrice : null;
  const xcpFee = result.xcp_fee === undefined ? null : fromSatoshis(result.xcp_fee, true);
  const xcpFeeInFiat = xcpFee !== null && xcpPrice ? xcpFee * xcpPrice : null;

  return (
    <div className="p-4 bg-white rounded-lg shadow-lg space-y-4">
      <h2 className="text-lg font-bold text-gray-900">Review Transaction</h2>
      
      {error && (
        <ErrorAlert
          message={error}
          onClose={hideBackButton ? undefined : onBack}
        />
      )}
      
      <div className="space-y-4">
        {/* Source Address */}
        <div className="space-y-1">
          <label className="font-semibold text-gray-700">From:</label>
          <div className="bg-gray-50 p-2 rounded break-all text-gray-900">
            {formatAddress(sourceAddress, true)}
          </div>
        </div>
        
        {/* Destination Address (if present) - show full address */}
        {destinationAddress && (
          <div className="space-y-1">
            <label className="font-semibold text-gray-700">To:</label>
            <div className="bg-gray-50 p-2 rounded break-all text-gray-900">
              {formatAddress(destinationAddress, false)}
            </div>
          </div>
        )}
        
        {/* Custom Fields */}
        {customFields.map((field, idx) => (
          <div key={`field-${idx}-${field.label}`} className="space-y-1">
            <label className="font-semibold text-gray-700">{field.label}:</label>
            <div className="bg-gray-50 p-2 rounded break-all text-gray-900">
              {typeof field.value === 'string' && field.value.includes('\n') ? (
                <div className="whitespace-pre-line">{field.value}</div>
              ) : typeof field.value === 'string' || typeof field.value === 'number' ? (
                <div className="flex justify-between items-center">
                  <span className="break-all">{field.value}</span>
                  {field.rightElement}
                </div>
              ) : (
                field.value
              )}
            </div>
          </div>
        ))}

        {xcpFee !== null && (
          <div className="space-y-1">
            <label className="font-semibold text-gray-700">XCP Fee:</label>
            <div className="bg-gray-50 p-2 rounded text-gray-900">
              <div className="flex justify-between items-center">
                <span>
                  {formatAmount({
                    value: xcpFee,
                    minimumFractionDigits: 8,
                    maximumFractionDigits: 8,
                  })}{" "}
                  XCP
                </span>
                {xcpFeeInFiat !== null && (
                  <span className="text-gray-500">
                    ${formatAmount({ value: xcpFeeInFiat, minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
        
        {/* Transaction Fee */}
        <div className="space-y-1">
          <label className="font-semibold text-gray-700">Fee:</label>
          <div className="bg-gray-50 p-2 rounded text-gray-900">
            <div className="flex justify-between items-center">
              <div>
                <span>
                  {formatAmount({
                    value: feeInBtc,
                    minimumFractionDigits: 8,
                    maximumFractionDigits: 8,
                  })}{" "}
                  BTC
                </span>
                {result.signed_tx_estimated_size?.adjusted_vsize && (
                  <span className="text-gray-500 ml-2">
                    ({formatFeeRate(result.btc_fee, result.signed_tx_estimated_size.adjusted_vsize)} sats/vB)
                  </span>
                )}
              </div>
              {feeInFiat !== null && (
                <span className="text-gray-500">
                  ${formatAmount({ value: feeInFiat, minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
      
      {/* Raw Transaction Details */}
      <Collapsible title="Raw Transaction" className="mt-4">
        <pre className="overflow-auto text-sm bg-gray-50 p-3 rounded-md h-44 border border-gray-200">
          {JSON.stringify(apiResponse, null, 2)}
        </pre>
      </Collapsible>
      
      {/* Action Buttons */}
      <div className="flex space-x-4">
        {!hideBackButton && (
          <Button
            onClick={onBack}
            color="gray"
            disabled={isSigning}
            aria-label="Go back to edit transaction"
          >
            Back
          </Button>
        )}
        <Button
          onClick={onSign}
          color="blue"
          fullWidth
          disabled={isSigning}
          aria-label={isSigning ? "Signing transaction…" : "Sign and broadcast transaction"}
        >
          {isSigning ? "Signing…" : "Sign & Broadcast"}
        </Button>
      </div>
    </div>
  );
}
