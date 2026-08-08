/**
 * What a fairmint costs and where the payment goes.
 *
 * The form's only price text lived in the amount field's help text, which renders only when
 * showHelpText is on — off by default. This is shown unconditionally.
 */

import type { ReactElement } from "react";
import {
  describeFairminterPaymentModel,
  getFairmintCost,
  getFairminterLotCost,
  getFairminterPaymentModel,
  isPaidFairminter,
} from "@/core/counterparty/fairminterModel";
import { formatAmount } from "@/core/format";
import { isGreaterThan } from "@/core/numeric";

export interface FairmintSummaryFairminter {
  asset: string;
  source?: string;
  price?: number | string | null;
  price_normalized?: string | null;
  quantity_by_price_normalized?: string | null;
  burn_payment?: boolean;
  soft_cap?: number;
  soft_cap_normalized?: string;
  divisible?: boolean;
}

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
  fairminter: FairmintSummaryFairminter;
  /** What the user has asked to mint, in display units. Blank until they type. */
  quantity: string;
}): ReactElement {
  const model = getFairminterPaymentModel({
    price: fairminter.price ?? fairminter.price_normalized,
    burnPayment: fairminter.burn_payment,
  });
  const paid = isPaidFairminter(model);
  const hasQuantity = isGreaterThan(quantity || 0, 0);
  const decimals = fairminter.divisible === false ? 0 : 8;

  const totalCost = paid ? getFairmintCost(fairminter, quantity || 0) : "0";
  const hasSoftCap = isGreaterThan(fairminter.soft_cap_normalized ?? fairminter.soft_cap ?? 0, 0);

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
        <>
          <Row label="Price" value={`${getFairminterLotCost(fairminter)} XCP per lot`} />
          {totalCost !== null && (
            <Row label="You pay" value={hasQuantity ? `${totalCost} XCP` : "— XCP"} />
          )}
        </>
      ) : (
        // A free mint's whole cost is the miner fee, and its amount is set by the fairminter.
        <Row label="You pay" value="Bitcoin network fee only" />
      )}

      <Row label="Payment" value={describeFairminterPaymentModel(model)} />

      {model === "issuer" && fairminter.source && (
        <Row label="Paid to" value={fairminter.source} />
      )}

      {hasSoftCap && (
        // Core sends both the payment and the assets to UNSPENDABLE until the soft cap is met.
        <p className="pt-1 text-xs text-yellow-800 bg-yellow-50 border border-yellow-200 rounded p-2">
          This fairminter has a soft cap. Until it is reached, your payment and the tokens are both
          held in escrow — nothing is credited when this transaction confirms, and your XCP is
          refunded if the cap is missed by its deadline.
        </p>
      )}
    </div>
  );
}
