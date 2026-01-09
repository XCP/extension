import { type ReactNode } from "react";
import { formatAmount } from "@/utils/format";
import { fromSatoshis } from "@/utils/numeric";
import type { Transaction } from "@/utils/blockchain/counterparty/api";

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

  // Mint model
  if (params.burn_payment === false) {
    fields.push({
      label: "Mint Model",
      value: "BTC Fee Only (to miners)",
    });
    
    if (params.max_mint_per_tx !== undefined) {
      fields.push({
        label: "Max Mint per TX",
        value: formatAmount({
          value: isDivisible ? fromSatoshis(params.max_mint_per_tx, true) : params.max_mint_per_tx,
          minimumFractionDigits: isDivisible ? 8 : 0,
          maximumFractionDigits: isDivisible ? 8 : 0,
        }),
      });
    }
  } else {
    fields.push({
      label: "Mint Model",
      value: params.burn_payment ? "XCP Fee (burned)" : "XCP Fee (to issuer)",
    });
    
    // Support both new naming (lot_price) and legacy naming (price)
    const lotPrice = params.lot_price ?? params.price;
    if (lotPrice !== undefined) {
      fields.push({
        label: "Price per Mint",
        value: `${formatAmount({
          value: fromSatoshis(lotPrice, true),
          minimumFractionDigits: 8,
          maximumFractionDigits: 8,
        })} XCP`,
      });
    }

    // Support both new naming (lot_size) and legacy naming (quantity_by_price)
    const lotSize = params.lot_size ?? params.quantity_by_price;
    if (lotSize !== undefined) {
      fields.push({
        label: "Quantity per Price",
        value: formatAmount({
          value: isDivisible ? fromSatoshis(lotSize, true) : lotSize,
          minimumFractionDigits: isDivisible ? 8 : 0,
          maximumFractionDigits: isDivisible ? 8 : 0,
        }),
      });
    }
  }

  // Caps
  if (params.hard_cap !== undefined && params.hard_cap > 0) {
    fields.push({
      label: "Hard Cap",
      value: formatAmount({
        value: isDivisible ? fromSatoshis(params.hard_cap, true) : params.hard_cap,
        minimumFractionDigits: isDivisible ? 8 : 0,
        maximumFractionDigits: isDivisible ? 8 : 0,
      }),
    });
  }
  
  if (params.soft_cap !== undefined && params.soft_cap > 0) {
    fields.push({
      label: "Soft Cap",
      value: formatAmount({
        value: isDivisible ? fromSatoshis(params.soft_cap, true) : params.soft_cap,
        minimumFractionDigits: isDivisible ? 8 : 0,
        maximumFractionDigits: isDivisible ? 8 : 0,
      }),
    });
  }

  // Premint
  if (params.premint_quantity !== undefined && params.premint_quantity > 0) {
    fields.push({
      label: "Premint",
      value: formatAmount({
        value: isDivisible ? fromSatoshis(params.premint_quantity, true) : params.premint_quantity,
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