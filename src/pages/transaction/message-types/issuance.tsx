import { type ReactNode } from "react";
import { formatAmount } from "@/utils/format";
import { fromSatoshis } from "@/utils/numeric";
import type { Transaction } from "@/utils/blockchain/counterparty/api";

/**
 * Renders detailed information for issuance transactions
 */
export function issuance(tx: Transaction): Array<{ label: string; value: string | ReactNode }> {
  // Try to get params from unpacked_data first, then check events
  let params = tx.unpacked_data?.params;
  if (!params) {
    const issuanceEvent = tx.events?.find((e: any) => 
      e.event === 'ISSUANCE' || 
      e.event === 'ASSET_ISSUANCE' ||
      e.event === 'ASSET_CREATION'
    );
    params = issuanceEvent?.params;
  }
  if (!params) return [];
  
  const isDivisible = params.divisible ?? true;
  const quantity = isDivisible ? fromSatoshis(params.quantity, true) : params.quantity;
  
  const fields: Array<{ label: string; value: string | ReactNode }> = [];
  
  // Determine issuance type
  let issuanceType = "Asset Issuance";
  if (params.transfer_destination) {
    issuanceType = "Ownership Transfer";
  } else if (quantity === 0 && params.description === "") {
    issuanceType = "Supply Reset";
  } else if (quantity === 0 && params.lock) {
    issuanceType = "Supply Lock";
  } else if (params.description && quantity === 0) {
    issuanceType = "Description Update";
  } else if (quantity > 0 && params.asset && params.asset.includes('.')) {
    issuanceType = "Subasset Creation";
  } else if (quantity > 0) {
    issuanceType = "Supply Increase";
  }
  
  fields.push({
    label: "Type",
    value: issuanceType,
  });
  
  fields.push({
    label: "Asset",
    value: params.asset,
  });
  
  // Show quantity if not zero
  if (quantity !== 0) {
    fields.push({
      label: "Quantity",
      value: formatAmount({
        value: quantity,
        minimumFractionDigits: isDivisible ? 8 : 0,
        maximumFractionDigits: isDivisible ? 8 : 0,
      }),
    });
  }
  
  // Asset properties
  fields.push({
    label: "Divisible",
    value: isDivisible ? "Yes (8 decimal places)" : "No (whole units only)",
  });
  
  if (params.lock !== undefined) {
    fields.push({
      label: "Supply Locked",
      value: params.lock ? "🔒 Yes" : "🔓 No",
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
  
  // Transfer destination
  if (params.transfer_destination) {
    fields.push({
      label: "Transfer To",
      value: (
        <span className="text-xs break-all">
          {params.transfer_destination}
        </span>
      ),
    });
  }
  
  // Parent asset for subassets
  if (params.asset && params.asset.includes('.')) {
    const parentAsset = params.asset.split('.')[0];
    fields.push({
      label: "Parent Asset",
      value: parentAsset,
    });
  }
  
  // Call date/price for callable assets
  if (params.callable !== undefined && params.callable) {
    fields.push({
      label: "Callable",
      value: "Yes",
    });
    
    if (params.call_date) {
      fields.push({
        label: "Call Date",
        value: new Date(params.call_date * 1000).toLocaleDateString(),
      });
    }
    
    if (params.call_price) {
      fields.push({
        label: "Call Price",
        value: `${formatAmount({
          value: params.call_price,
          minimumFractionDigits: 2,
          maximumFractionDigits: 8,
        })} XCP`,
      });
    }
  }
  
  return fields;
}