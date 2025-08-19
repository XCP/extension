import { type ReactNode } from "react";
import { formatAmount } from "@/utils/format";
import type { Transaction } from "@/utils/blockchain/counterparty";

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
          value: isDivisible ? params.max_mint_per_tx / 1e8 : params.max_mint_per_tx,
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
    
    if (params.price !== undefined) {
      fields.push({
        label: "Price per Mint",
        value: `${formatAmount({
          value: params.price / 1e8,
          minimumFractionDigits: 8,
          maximumFractionDigits: 8,
        })} XCP`,
      });
    }
    
    if (params.quantity_by_price !== undefined) {
      fields.push({
        label: "Quantity per Price",
        value: formatAmount({
          value: isDivisible ? params.quantity_by_price / 1e8 : params.quantity_by_price,
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
        value: isDivisible ? params.hard_cap / 1e8 : params.hard_cap,
        minimumFractionDigits: isDivisible ? 8 : 0,
        maximumFractionDigits: isDivisible ? 8 : 0,
      }),
    });
  }
  
  if (params.soft_cap !== undefined && params.soft_cap > 0) {
    fields.push({
      label: "Soft Cap",
      value: formatAmount({
        value: isDivisible ? params.soft_cap / 1e8 : params.soft_cap,
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
        value: isDivisible ? params.premint_quantity / 1e8 : params.premint_quantity,
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