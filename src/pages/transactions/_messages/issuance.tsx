import type { ReactNode } from "react";
import type { Transaction } from "@/core/counterparty/api";
import { formatAmount } from "@/core/format";
import { isGreaterThan } from "@/core/numeric";

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

  // Use API-provided normalized values (verbose=true always returns these)
  const isDivisible = params.divisible ?? true;
  const quantity = params.quantity_normalized;
  // A normalized quantity is a decimal string; compare it as a number without narrowing it first.
  const hasSupply = isGreaterThan(quantity ?? 0, 0);
  
  const fields: Array<{ label: string; value: string | ReactNode }> = [];
  
  // Determine issuance type
  let issuanceType = "Asset Issuance";
  if (params.transfer_destination) {
    issuanceType = "Ownership Transfer";
  } else if (!hasSupply && params.description === "") {
    issuanceType = "Supply Reset";
  } else if (!hasSupply && params.lock) {
    issuanceType = "Supply Lock";
  } else if (params.description && !hasSupply) {
    issuanceType = "Description Update";
  } else if (hasSupply && params.asset && params.asset.includes('.')) {
    issuanceType = "Subasset Creation";
  } else if (hasSupply) {
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
  if (hasSupply) {
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