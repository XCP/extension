import { type ReactElement, type ReactNode } from "react";
import { Button } from "@/components/button";
import { ErrorAlert } from "@/components/error-alert";
import { Spinner } from "@/components/spinner";
import { formatAddress, formatAmount } from "@/utils/format";
import { fromSatoshis } from "@/utils/numeric";
import { getVendorLabel, getVendorConfirmInstructions } from "@/utils/hardware";
import type { HardwareWalletVendor } from "@/utils/hardware/types";

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
  customFields: CustomField[];
  /** Error message to display */
  error: string | null;
  /** Whether the transaction is being signed */
  isSigning: boolean;
  /** Hide the back button (e.g., for provider requests with no form to go back to) */
  hideBackButton?: boolean;
  /** Whether signing with a hardware wallet */
  isHardwareWallet?: boolean;
  /** Hardware wallet vendor (trezor/ledger) */
  hardwareVendor?: HardwareWalletVendor;
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
  customFields,
  error,
  isSigning,
  hideBackButton = false,
  isHardwareWallet = false,
  hardwareVendor,
}: ReviewScreenProps): ReactElement {
  const { result } = apiResponse;

  return (
    <div className="p-4 bg-white rounded-lg shadow-lg space-y-4">
      <h3 className="text-lg font-bold text-gray-900">Review Transaction</h3>
      
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
        
        {/* Destination Address (if present) */}
        {result.params.destination && (
          <div className="space-y-1">
            <label className="font-semibold text-gray-700">To:</label>
            <div className="bg-gray-50 p-2 rounded break-all text-gray-900">
              {formatAddress(result.params.destination, true)}
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
            {formatAmount({
              value: fromSatoshis(result.btc_fee, true),
              minimumFractionDigits: 8,
              maximumFractionDigits: 8,
            })}{" "}
            BTC
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
      
      {/* Hardware wallet guidance during signing */}
      {isSigning && isHardwareWallet && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Spinner />
            <span className="text-sm font-medium text-blue-800">Check your {getVendorLabel(hardwareVendor)}</span>
          </div>
          <p className="text-xs text-blue-600">
            Review the transaction details on your device screen
          </p>
          <p className="text-xs text-blue-600 mt-1">
            {getVendorConfirmInstructions(hardwareVendor)}
          </p>
        </div>
      )}

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
          aria-label={isSigning ? "Signing transaction..." : "Sign and broadcast transaction"}
        >
          {isSigning ? (
            isHardwareWallet ? (
              <span className="flex items-center justify-center gap-2">
                <Spinner />
                Check Device...
              </span>
            ) : (
              "Signing..."
            )
          ) : (
            "Sign & Broadcast"
          )}
        </Button>
      </div>
    </div>
  );
}