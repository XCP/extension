import type { ReactElement } from "react";
import { FaCheck, FaCheckCircle, FaClipboard } from "@/components/icons";
import { Button } from "@/components/ui/button";
import type { ComposerBroadcastResult } from '@/contexts/composer-context-object';
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard";

import { t } from '@/i18n';

/**
 * API response structure for transaction broadcast
 */
type ApiResponse = ComposerBroadcastResult;

/**
 * Props for the SuccessScreen component
 */
interface SuccessScreenProps {
  /** API response containing broadcast details */
  apiResponse: ApiResponse;
  /** Optional custom explorer URL template (use {txid} as placeholder) */
  explorerUrlTemplate?: string;
}

/**
 * Default blockchain explorer URL template
 */
const DEFAULT_EXPLORER_URL = "https://mempool.space/tx/{txid}";

/**
 * Displays a success screen after transaction broadcast.
 * 
 * This component shows a success message with the transaction ID,
 * allows copying the ID to clipboard, and provides a link to view
 * the transaction on a blockchain explorer.
 * 
 * @example
 * ```tsx
 * <SuccessScreen
 *   apiResponse={{ broadcast: { txid: "abc123..." } }}
 *   explorerUrlTemplate="https://mempool.space/tx/{txid}"
 * />
 * ```
 */
export function SuccessScreen({
  apiResponse,
  explorerUrlTemplate = DEFAULT_EXPLORER_URL
}: SuccessScreenProps): ReactElement {
  // Transaction IDs and signed public transactions are not secrets.
  const { copy, isCopied } = useCopyToClipboard(undefined, 0);

  // Extract transaction ID safely
  const txid = apiResponse?.broadcast?.txid || "unknown";
  const explorerUrl = explorerUrlTemplate.replace("{txid}", txid);
  const warning = apiResponse.broadcastWarning;
  const revealTxid = apiResponse.revealBroadcast?.txid;

  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-6rem)]">
      {/* Success Card */}
      <div className={`p-6 ${warning ? 'bg-amber-50' : 'bg-green-50'} rounded-lg shadow-lg text-center max-w-md w-full`}>
        {/* Success Icon */}
        {!warning && <FaCheckCircle
          className="text-green-600 size-10 mx-auto"
          aria-hidden="true"
        />}

        {/* Success Title */}
        <h2 className={`text-xl font-bold ${warning ? 'text-amber-800' : 'text-green-800'} mt-3`}>
          {warning ? t('screens_success_screen_broadcast_incomplete') : t('screens_success_screen_transaction_successful')}
        </h2>

        {/* Success Message */}
        {warning ? <p role="alert" className="mt-3 text-sm text-amber-900 text-left break-all whitespace-pre-wrap select-text">{warning}</p> : <p className="mt-1 text-sm text-green-700">
          {t('screens_success_screen_your_transaction_was_broadcasted')}
        </p>}

        {/* Transaction ID Display - Clickable to copy */}
        <div className="mt-4">
          <span className="block text-xs font-medium text-gray-600 mb-1">
            {warning || revealTxid ? t('psbts_approve_commit_transaction') : t('screens_success_screen_transaction_id')}
          </span>
          <button type="button"
            onClick={() => void copy(txid)}
            aria-label={t('screens_success_screen_click_to_copy_transaction_id')}
            className="block w-full text-left font-mono text-xs bg-white border border-gray-200 rounded-lg p-2 break-all text-gray-800 cursor-pointer hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 transition-colors select-all"
          >
            {txid}
          </button>
        </div>

        {/* Copy Button */}
        <Button
          onClick={() => void copy(txid)}
          color="blue"
          fullWidth
          className="mt-4"
          aria-label={isCopied(txid) ? t('screens_success_screen_transaction_id_copied') : t('consolidate_success_copy_transaction_id')}
        >
          {isCopied(txid) ? (
            <>
              <FaCheck className="size-4 mr-2" aria-hidden="true" />
              <span>{t('common_copied')}</span>
            </>
          ) : (
            <>
              <FaClipboard className="size-4 mr-2" aria-hidden="true" />
              <span>{t('screens_success_screen_copy_transaction_id')}</span>
            </>
          )}
        </Button>
        {revealTxid && <div className="mt-4">
          <span className="block text-xs font-medium text-gray-600 mb-1">{t('psbts_approve_reveal_transaction')}</span>
          <button type="button" onClick={() => void copy(revealTxid)}
            aria-label={t('screens_success_screen_click_to_copy_transaction_id')}
            className="block w-full text-left font-mono text-xs bg-white border border-gray-200 rounded-lg p-2 break-all select-all">
            {revealTxid}
          </button>
          <a href={explorerUrlTemplate.replace('{txid}', revealTxid)} target="_blank" rel="noopener noreferrer"
            className="text-xs text-blue-600 hover:underline">
            {t('screens_success_screen_view_on_mempool_space')}
          </a>
        </div>}
      </div>

      {/* Mempool link - Footer outside the green box */}
      {txid !== "unknown" && (
        <a
          href={explorerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 text-xs text-gray-500 hover:text-blue-600 hover:underline transition-colors"
          aria-label={t('screens_success_screen_view_transaction_on_mempool_space')}
        >
          {t('screens_success_screen_view_on_mempool_space')}
        </a>
      )}
    </div>
  );
}
