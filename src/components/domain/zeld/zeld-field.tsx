import type { ReactElement } from "react";
import { formatAmount } from "@/core/format";
import { zeldBaseUnitsToDisplay } from "@/core/zeld/api";
import type { ZeldHuntMetadata, ZeldProtectionMetadata, ZeldSendMetadata } from "@/core/zeld/types";

function formatAttempts(attempts: number): string {
  if (attempts >= 1_000_000) return `${(attempts / 1_000_000).toFixed(1)}M`;
  if (attempts >= 1_000) return `${Math.round(attempts / 1_000)}K`;
  return String(attempts);
}

/**
 * Everything ZELD did to this transaction: what a send of it moves, which ZELD-bearing outputs
 * the guard kept out or carried forward, and what the hunt found. Found means the txid below is
 * the one that will be signed and broadcast; the leading zeros are what earns the reward.
 */
export function ZeldField({
  hunt,
  protection,
  send,
}: {
  hunt?: ZeldHuntMetadata;
  protection?: ZeldProtectionMetadata;
  send?: ZeldSendMetadata;
}): ReactElement {
  const seconds = hunt ? (hunt.elapsed_ms / 1000).toFixed(1) : '';
  return (
    <div className="space-y-1">
      <span className="block font-semibold text-gray-700">ZELD:</span>
      <div className="bg-gray-50 p-2 rounded text-gray-900 space-y-1">
        {send?.park && (
          <div>
            Moves {formatAmount({ value: zeldBaseUnitsToDisplay(BigInt(send.amount_base_units)), minimumFractionDigits: 8, maximumFractionDigits: 8 })} ZELD
            {' '}onto a small output of your own; the rest of the BTC returns as clean change.
          </div>
        )}
        {send && !send.park && (
          <div>
            Sends {formatAmount({ value: zeldBaseUnitsToDisplay(BigInt(send.amount_base_units)), minimumFractionDigits: 8, maximumFractionDigits: 8 })} ZELD
            {' '}to the recipient's output; {formatAmount({ value: zeldBaseUnitsToDisplay(BigInt(send.remainder_base_units)), minimumFractionDigits: 8, maximumFractionDigits: 8 })}
            {' '}stays on your change, which comes first so a wrong balance can only send less, never elsewhere.
          </div>
        )}
        {protection?.change_first && !send && (
          <div>Your change comes first, so any ZELD on the inputs, and any reward, stays with you.</div>
        )}
        {protection && protection.excluded.length > 0 && (
          <div>
            Kept {protection.excluded.length} output{protection.excluded.length === 1 ? '' : 's'} holding ZELD out of
            this transaction, because it pays someone else first and the ZELD would have gone with it.
          </div>
        )}
        {protection && protection.carried_forward.length > 0 && !send && (
          <div>
            Spends {protection.carried_forward.length} output{protection.carried_forward.length === 1 ? '' : 's'} holding
            ZELD; the ZELD moves to your change output.
          </div>
        )}
        {protection?.api_unavailable && (
          <div className="text-sm text-amber-700">
            The ZELD indexer could not be reached, so only outputs on six-zero txids were recognised
            as holding ZELD.
          </div>
        )}
        {hunt?.status === 'found' && hunt.txid && (
          <>
            <div>
              Found a txid with {hunt.zero_count} leading zeros in {seconds}s
              {' '}({formatAttempts(hunt.attempts)} hashes).
            </div>
            <div className="font-mono text-xs break-all">
              <span className="font-bold">{hunt.txid.slice(0, hunt.zero_count)}</span>
              {hunt.txid.slice(hunt.zero_count)}
            </div>
            <div className="text-sm text-gray-500">
              Earns ZELD on your change output when it confirms. A rarer txid in the same block
              divides the reward by 16 per extra zero.
            </div>
          </>
        )}
        {hunt?.status === 'not_found' && (
          <div>
            No txid with {hunt.target_zeros} leading zeros within {hunt.seconds}s
            {' '}({formatAttempts(hunt.attempts)} hashes). Sending as composed.
          </div>
        )}
        {hunt?.status === 'skipped' && (
          <div>Hunt skipped. {hunt.reason}</div>
        )}
      </div>
    </div>
  );
}
