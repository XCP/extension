import { type ReactElement, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ErrorAlert } from "@/components/ui/error-alert";
import { formatAddress, formatAmount } from "@/utils/format";
import { fromSatoshis, formatFeeRate } from "@/utils/numeric";
import { useMarketPrices } from "@/hooks/useMarketPrices";
import { useSettings } from "@/contexts/settings-context";

/**
 * Transaction result from API response
 */
interface TransactionResult {
  params: {
    source: string;
    destination?: string;
    [key: string]: any;
  };
  btc_fee: number;
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
  const { btc: btcPrice } = useMarketPrices(settings.fiat);

  // Calculate fee in fiat
  const feeInBtc = fromSatoshis(result.btc_fee, true);
  const feeInFiat = btcPrice ? feeInBtc * btcPrice : null;

  return (
    <div className="p-4 bg-white rounded-lg shadow-lg space-y-4">
      <h2 className="text-lg font-bold text-gray-900">Review Transaction</h2>
      
      {error && (
        <ErrorAlert 
          message={error}
          onClose={() => {
            // Error dismissal is handled by parent component
            // This is just for UI feedback
          }}
        />
      )}
      
      <div className="space-y-4">
        {/* Source Address */}
        <div className="space-y-1">
          <label className="font-semibold text-gray-700">From:</label>
          <div className="bg-gray-50 p-2 rounded break-all text-gray-900">
            {formatAddress(result.params.source, true)}
          </div>
        </div>
        
        {/* Destination Address (if present) - show full address */}
        {result.params.destination && (
          <div className="space-y-1">
            <label className="font-semibold text-gray-700">To:</label>
            <div className="bg-gray-50 p-2 rounded break-all text-gray-900">
              {formatAddress(result.params.destination, false)}
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
      
      {/* Raw Transaction Details (Collapsible) */}
      <details className="mt-4">
        <summary className="text-md font-semibold cursor-pointer text-gray-700 hover:text-gray-900 select-none">
          Raw Transaction
        </summary>
        <pre className="mt-2 overflow-auto text-sm bg-gray-50 p-3 rounded-md h-44 border border-gray-200">
          {JSON.stringify(apiResponse, null, 2)}
        </pre>
      </details>
      
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