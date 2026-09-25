import { FaCheck, FiCopy } from '@/components/icons';
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard';
import { t } from '@/i18n';

/**
 * Copies an address, outpoint or transaction id exactly as signed.
 *
 * Comparing a value on screen against the one the site or a block explorer shows is the check a
 * careful signer makes; copying it avoids reading 60 characters by eye. The value copied is the
 * full string, never the displayed form.
 */
export function ApprovalCopyButton({ value, label, className = '' }: { value: string; label?: string; className?: string }) {
  const { copy, isCopied } = useCopyToClipboard();
  const copied = isCopied(value);
  const name = label ? t('approval_copy_named', [label]) : t('approval_copy');
  return (
    <button
      type="button"
      onClick={() => void copy(value)}
      aria-label={name}
      title={name}
      className={`inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded text-gray-400 hover:bg-gray-100 hover:text-gray-700 focus-visible:outline-2 focus-visible:outline-blue-600 ${className}`}
    >
      {copied
        ? <FaCheck className="size-3 text-green-600" aria-hidden="true" />
        : <FiCopy className="size-3.5" aria-hidden="true" />}
      <span className="sr-only" aria-live="polite">{copied ? t('common_copied') : ''}</span>
    </button>
  );
}

/**
 * An address, outpoint or txid in full: monospace, with nothing inserted into the value. Never
 * truncated — a short fragment of an address is what a lookalike grinder matches.
 *
 * At 11px a Native SegWit or Legacy address fits one line at popup width, even inside a list item.
 * The value only breaks when it cannot fit a line on its own (a Taproot address, an outpoint), and
 * then it fills each line; splitting at the midpoint left two half-width lines that read as two
 * values. The copy button follows in the text flow, so it moves to the next line rather than
 * squeezing the value into a narrower column.
 */
export function ApprovalIdentifier({ value, className = '', copyLabel, copy = true }: {
  value: string;
  className?: string;
  /** Names the value for the copy button's accessible label, e.g. "Delivery". */
  copyLabel?: string;
  /** Off where the copy button sits elsewhere, such as on a fact's label line. */
  copy?: boolean;
}) {
  return (
    <span className={`leading-4 ${className}`}>
      <span data-approval-identifier="" className="select-all font-mono text-[11px] [overflow-wrap:anywhere] [word-break:normal]">
        {value}
      </span>
      {copy && <ApprovalCopyButton value={value} label={copyLabel} className="-my-1 ml-1 align-middle" />}
    </span>
  );
}
