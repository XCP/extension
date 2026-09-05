import { ApprovalFacts } from '@/components/domain/approval/approval-facts';
import { ApprovalIdentifier } from '@/components/domain/approval/approval-identifier';
import type { MoneyMovement } from '@/components/domain/approval/money-movement';
import { MoneyMovementView } from '@/components/domain/approval/money-movement-view';
import { type OrderAction, OrderCard } from '@/components/domain/approval/order-card';
import type { PsbtFlexibilityKind } from '@/components/domain/approval/psbt-flexibility';
import type { ProtocolField } from '@/core/counterparty/describe';
import { formatAmount } from '@/core/format';
import { fromSatoshis } from '@/core/numeric';

/**
 * Split a trailing address off a headline so the two can be set differently.
 *
 * A send or sweep headline ends in an address, which is one unbreakable token: set in 18px bold it
 * overflows the popup and puts a horizontal scrollbar under the whole screen, pushing the tail of
 * the destination out of view — on the line that says where the money goes. Truncating instead
 * would reintroduce the lookalike-grinding problem the outputs list deliberately avoids.
 *
 * With the address on its own line the sentence's trailing "to" dangles ("Send 1 XCP to"), so it
 * is dropped — the mono line beneath already reads as the destination.
 *
 * A description may also carry its own second line ("ASSET\nIssue 1,000"); that comes back as
 * `subline`, set like the address line but in the text face.
 *
 * Lives here because both approval screens render this headline, and it was once fixed inline on
 * the transaction screen only, so the PSBT screen kept overflowing.
 */
export function splitTrailingAddress(
  description: string
): { sentence: string; address?: string; subline?: string } {
  const [first, ...rest] = description.split('\n');
  const subline = rest.length > 0 ? rest.join(' ') : undefined;
  const match = first!.match(
    /^(.*?)\s((?:bc1|tb1)[023456789acdefghjklmnpqrstuvwxyz]{20,}|[13][1-9A-HJ-NP-Za-km-z]{25,34})$/
  );
  if (!match) return { sentence: first!, subline };
  return { sentence: match[1]!.replace(/\s+to$/, ''), address: match[2]!, subline };
}

interface ApprovalSummaryCardProps {
  /** Decoded Counterparty action, if any — the "what kind" headline. */
  txAction: { label: string; description: string } | null;
  /** A structured marketplace summary contains a quantity, rather than a sentence. */
  principal?: boolean;
  /** Verified principal consequences that must precede supporting BTC movement. */
  primaryFacts?: ProtocolField[];
  /**
   * A DEX order, which gets a card of its own instead of the label-and-sentence treatment: a trade
   * is two amounts that only mean something as a pair. Takes precedence over txAction.
   */
  order?: OrderAction | null;
  /** Structural net effect on the signer's wallet. */
  movement: MoneyMovement;
  /** The exact flexibility left by the requested ANYONECANPAY signatures. */
  flexibility?: PsbtFlexibilityKind;
  hasHighFee: boolean;
  /** The footer opens a focused Review step for caution details. */
  deferCautions?: boolean;
  /** Outputs exceed inputs; the fee depends on inputs the counterparty has yet to add. */
  unfunded?: boolean;
  /**
   * Skip the money-movement block. For an unfunded marketplace authorization nothing is moving
   * yet, and rendering the movement resolves to an alarming "Couldn't be determined" for a state
   * the semantic facts already describe precisely.
   */
  hideMovement?: boolean;
  /** Counterparty protocol fee in base units. Preserve the decoder's exact string/bigint. */
  protocolFeeXcp: unknown;
}

function formatProtocolFee(value: unknown): string | null {
  if (value == null) return null;
  let digits: string;
  if (typeof value === 'bigint' && value >= 0n) digits = value.toString();
  else if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) digits = String(value);
  else if (typeof value === 'string' && /^\d+$/.test(value.trim())) digits = value.trim();
  else return 'Unavailable';
  if (!/[1-9]/.test(digits)) return null;
  // Both the division and the formatter consume decimal strings: Number would round a uint64.
  return `${formatAmount({
    value: fromSatoshis(digits), minimumFractionDigits: 8, maximumFractionDigits: 8,
  })} XCP`;
}

/**
 * ApprovalSummaryCard — the top-of-screen "what am I signing" card. When the
 * transaction is a Counterparty action, that is the headline and the BTC
 * money-movement shows as detail beneath it (composition A); otherwise the
 * money-movement leads. Either way the money-movement is always present, so
 * unexpected funds leaving the wallet are visible — the anti-blind-signing goal.
 */
export function ApprovalSummaryCard({
  txAction,
  principal = false,
  primaryFacts = [],
  order,
  movement,
  flexibility,
  hasHighFee,
  deferCautions,
  unfunded,
  hideMovement,
  protocolFeeXcp,
}: ApprovalSummaryCardProps) {
  const protocolFee = formatProtocolFee(protocolFeeXcp);
  return (
    <div className="bg-white rounded-lg shadow-sm p-4">
      {order ? <OrderCard order={order} /> : txAction && (
        <div className={`text-center ${hideMovement ? '' : 'mb-3'}`}>
          {/* No eyebrow when the page header already names the action (marketplace screens). */}
          {txAction.label && <p className={principal ? 'mb-2 text-lg leading-6 font-semibold text-gray-900' : 'text-xs text-gray-500 mb-1'}>{txAction.label}</p>}
          {(() => {
            const { sentence, address, subline } = splitTrailingAddress(txAction.description);
            return (
              <>
                <p className={`${principal ? 'text-2xl leading-tight tabular-nums' : 'text-lg leading-6'} font-semibold text-gray-900 break-words`}>{sentence}</p>
                {subline && <p className="mt-1 text-sm leading-5 text-gray-700 break-words">{subline}</p>}
                {address && (
                  <p className="mt-2 text-gray-700">
                    <ApprovalIdentifier value={address} />
                  </p>
                )}
              </>
            );
          })()}
        </div>
      )}
      {primaryFacts.length > 0 && (
        <div className="mb-3 border-b border-gray-100 pb-3">
          <ApprovalFacts fields={primaryFacts} />
        </div>
      )}
      {!hideMovement && (
        <MoneyMovementView
          movement={movement}
          flexibility={flexibility}
          hasHighFee={hasHighFee}
          deferCautions={deferCautions}
          unfunded={unfunded}
          showHeadline={!txAction && !order}
        />
      )}
      {protocolFee !== null && (
        <div className="mt-1.5 flex items-center justify-center gap-2 text-xs">
          <span className="text-gray-500">Protocol Fee:</span>
          <span className="text-sm font-medium text-purple-700">
            {protocolFee}
          </span>
        </div>
      )}
    </div>
  );
}
