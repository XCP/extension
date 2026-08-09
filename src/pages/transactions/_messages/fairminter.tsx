import type { ReactNode } from "react";
import type { Transaction } from "@/core/counterparty/api";
import {
  describeFairminterPaymentModel,
  isPaidFairminter,
  readFairminterPaymentModel,
} from "@/core/counterparty/fairminterModel";
import { formatAmount } from "@/core/format";
import { isGreaterThan } from "@/core/numeric";

/**
 * Renders detailed information for fairminter creation transactions
 */
export function fairminter(tx: Transaction): Array<{ label: string; value: string | ReactNode }> {
  const params = tx.unpacked_data?.params;
  if (!params) return [];
  
  const isDivisible = params.divisible ?? true;
  
  const fields: Array<{ label: string; value: string | ReactNode }> = [
    {
      label: "Type",
      value: "Fairminter Creation",
    },
    {
      label: "Asset",
      value: params.asset,
    },
    {
      label: "Status",
      value: params.status === 0 ? "🟢 Open" : 
             params.status === 1 ? "🔴 Closed" : 
             params.status === 2 ? "⚠️ Pending" : "Unknown",
    },
  ];

  // Mint model. Derived from the price first: burn_payment says where a payment goes, not whether
  // there is one, so reading it alone reported ordinary pay-the-issuer fairminters as free.
  const paymentModel = readFairminterPaymentModel(params);

  fields.push({
    label: "Mint Model",
    value: describeFairminterPaymentModel(paymentModel),
  });

  // Bounds a paid mint as well as a free one — core rejects any quantity above it either way —
  // so it is not part of the free-mint branch.
  if (params.max_mint_per_tx_normalized !== undefined) {
    fields.push({
      label: "Max Mint per TX",
      value: formatAmount({
        value: Number(params.max_mint_per_tx_normalized),
        minimumFractionDigits: isDivisible ? 8 : 0,
        maximumFractionDigits: isDivisible ? 8 : 0,
      }),
    });
  }

  if (isPaidFairminter(paymentModel)) {
    // Price per mint (normalized)
    if (params.price_normalized !== undefined) {
      fields.push({
        label: "Price per Mint",
        value: `${formatAmount({
          value: params.price_normalized,
          minimumFractionDigits: 8,
          maximumFractionDigits: 8,
        })} XCP`,
      });
    }

    // Quantity per price (normalized)
    if (params.quantity_by_price_normalized !== undefined) {
      fields.push({
        label: "Quantity per Price",
        value: formatAmount({
          value: params.quantity_by_price_normalized,
          minimumFractionDigits: isDivisible ? 8 : 0,
          maximumFractionDigits: isDivisible ? 8 : 0,
        }),
      });
    }
  }

  // Caps (use API-provided normalized values)
  if (params.hard_cap_normalized !== undefined && Number(params.hard_cap_normalized) > 0) {
    fields.push({
      label: "Hard Cap",
      value: formatAmount({
        value: Number(params.hard_cap_normalized),
        minimumFractionDigits: isDivisible ? 8 : 0,
        maximumFractionDigits: isDivisible ? 8 : 0,
      }),
    });
  }

  if (params.max_mint_per_address_normalized !== undefined && Number(params.max_mint_per_address_normalized) > 0) {
    fields.push({
      label: "Max Mint per Address",
      value: formatAmount({
        value: Number(params.max_mint_per_address_normalized),
        minimumFractionDigits: isDivisible ? 8 : 0,
        maximumFractionDigits: isDivisible ? 8 : 0,
      }),
    });
  }

  if (params.soft_cap_normalized !== undefined && Number(params.soft_cap_normalized) > 0) {
    fields.push({
      label: "Soft Cap",
      value: formatAmount({
        value: Number(params.soft_cap_normalized),
        minimumFractionDigits: isDivisible ? 8 : 0,
        maximumFractionDigits: isDivisible ? 8 : 0,
      }),
    });
  }

  // Premint (use API-provided normalized value)
  if (params.premint_quantity_normalized !== undefined && isGreaterThan(params.premint_quantity_normalized, 0)) {
    fields.push({
      label: "Premint",
      value: formatAmount({
        value: params.premint_quantity_normalized,
        minimumFractionDigits: isDivisible ? 8 : 0,
        maximumFractionDigits: isDivisible ? 8 : 0,
      }),
    });
  }

  // Commission
  if (params.minted_asset_commission !== undefined && params.minted_asset_commission > 0) {
    fields.push({
      label: "Commission",
      value: `${(params.minted_asset_commission * 100).toFixed(2)}%`,
    });
  }

  // Blocks
  if (params.start_block !== undefined) {
    fields.push({
      label: "Start Block",
      value: params.start_block.toString(),
    });
  }
  
  if (params.end_block !== undefined) {
    fields.push({
      label: "End Block",
      value: params.end_block.toString(),
    });
  }

  // Description
  if (params.description) {
    fields.push({
      label: "Description",
      value: (
        <div className="break-all">
          {params.description}
        </div>
      ),
    });
  }

  // Locks
  fields.push({
    label: "Divisible",
    value: isDivisible ? "Yes (8 decimals)" : "No (whole units)",
  });
  
  if (params.lock_description !== undefined) {
    fields.push({
      label: "Description Locked",
      value: params.lock_description ? "🔒 Yes" : "🔓 No",
    });
  }
  
  if (params.lock_quantity !== undefined) {
    fields.push({
      label: "Quantity Locked",
      value: params.lock_quantity ? "🔒 Yes" : "🔓 No",
    });
  }

  return fields;
}
