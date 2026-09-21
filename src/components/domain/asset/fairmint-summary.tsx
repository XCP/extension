/**
 * What a fairmint costs per lot, and where the payment goes.
 *
 * The form's only price text lived in the amount field's help text, which renders only when
 * showHelpText is on — off by default. This is shown unconditionally.
 *
 * Deliberately not a review screen. The running total and the issuer's address both used to appear
 * here, and between them they turned the form into a worse copy of the screen that follows it —
 * the total in particular rendered as a bare "— XCP" until something was typed. Both are on the
 * review screen, which is where the figures being signed for belong.
 */

import type { ReactElement } from "react";
import type { FairminterDetails } from "@/core/counterparty/api";
import {
  describeFairminterPaymentModel,
  getFairminterLotCost,
  isPaidFairminter,
  readFairminterPaymentModel,
} from "@/core/counterparty/fairminterModel";
import { formatAmount } from "@/core/format";
import { isGreaterThan } from "@/core/numeric";


function Row({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <span className="text-gray-500 flex-shrink-0">{label}</span>
      <span className="text-gray-900 font-medium text-right break-all">{value}</span>
    </div>
  );
}

export function FairmintSummary({
  fairminter,
  quantity,
}: {
  fairminter: FairminterDetails;
  /** What the user has asked to mint, in display units. Blank until they type. */
  quantity: string;
}): ReactElement {
  const model = readFairminterPaymentModel(fairminter);
  const paid = isPaidFairminter(model);
  const hasQuantity = isGreaterThan(quantity || 0, 0);
  const decimals = fairminter.divisible === false ? 0 : 8;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3 space-y-1.5">
      {hasQuantity && (
        <Row
          label="You receive"
          value={`${formatAmount({
            value: quantity,
            maximumFractionDigits: decimals,
            minimumFractionDigits: 0,
          })} ${fairminter.asset}`}
        />
      )}

      {paid ? (
        <Row label="Price" value={`${getFairminterLotCost(fairminter)} XCP per lot`} />
      ) : (
        // A free mint's whole cost is the miner fee, and its amount is set by the fairminter.
        <Row label="Price" value="Bitcoin network fee only" />
      )}

      <Row label="Payment" value={describeFairminterPaymentModel(model)} />
    </div>
  );
}
