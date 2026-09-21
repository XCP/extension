import type { ReactElement } from "react";
import { useNavigate } from "react-router";
import { FaSpinner } from "@/components/icons";
import { ErrorAlert } from "@/components/ui/error-alert";
import { formatTxid } from "@/core/format";
import type { UtxoSource } from "@/hooks/useUtxoSource";

/**
 * Shows which UTXO a compose form is spending from, what it holds, and any
 * failure to load that. Also carries the hidden sourceUtxo field that the
 * form action reads.
 *
 * @param props - The component props
 * @returns A ReactElement for the source UTXO section of a compose form
 */
export function UtxoSourceField({ source }: { source: UtxoSource }): ReactElement {
  const navigate = useNavigate();
  const { utxo, balances, isLoadingBalances, error, dismissError } = source;

  return (
    <>
      {error && (
        <div className="mb-4">
          <ErrorAlert message={error} onClose={dismissError} />
        </div>
      )}

      {/* Hidden UTXO input - always passed to formAction */}
      <input type="hidden" name="sourceUtxo" value={utxo} />

      {/* UTXO Display - styled like an input */}
      {utxo && (
        <div>
          <span className="block text-sm font-medium text-gray-700">
            Output <span className="text-red-500">*</span>
          </span>
          <button
            type="button"
            onClick={() => navigate(`/assets/utxos/${utxo}`)}
            className="text-left mt-1 block w-full p-2.5 rounded-md border border-gray-300 bg-gray-50 hover:bg-gray-100 cursor-pointer flex justify-between items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <span className="text-sm font-mono text-blue-600 hover:text-blue-800">
              {formatTxid(utxo)}
            </span>
            <span className="text-sm text-gray-500">
              {isLoadingBalances ? (
                <span className="flex items-center gap-1">
                  <FaSpinner className="animate-spin size-4" aria-hidden="true" />
                  Loading…
                </span>
              ) : (
                `${balances.length} ${balances.length === 1 ? "Balance" : "Balances"}`
              )}
            </span>
          </button>
        </div>
      )}
    </>
  );
}
