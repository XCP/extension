import { type ReactNode } from "react";
import { formatAmount, formatAddress } from "@/utils/format";
import { fromSatoshis } from "@/utils/numeric";
import type { Transaction } from "@/utils/blockchain/counterparty";

/**
 * Renders detailed information for MPMA (Multi-Peer Multi-Asset) transactions
 */
export function mpma(tx: Transaction): Array<{ label: string; value: string | ReactNode }> {
  const params = tx.unpacked_data?.params;
  if (!params) return [];
  
  const assetDestQuantList = params.asset_dest_quant_list || [];
  
  // Group by asset
  const assetGroups: Record<string, { 
    destinations: string[]; 
    quantity: number; 
    isDivisible: boolean;
    totalQuantity: number;
  }> = {};
  
  assetDestQuantList.forEach((item: any[]) => {
    const [asset, destination, quantity] = item;
    if (!assetGroups[asset]) {
      assetGroups[asset] = { 
        destinations: [], 
        quantity: 0,
        isDivisible: params.asset_info?.divisible ?? false,
        totalQuantity: 0,
      };
    }
    assetGroups[asset].destinations.push(destination);
    assetGroups[asset].quantity = quantity; // Same quantity per destination in MPMA
    assetGroups[asset].totalQuantity += quantity;
  });

  const fields: Array<{ label: string; value: string | ReactNode }> = [];
  
  // Add summary
  const totalDestinations = new Set(assetDestQuantList.map((item: any[]) => item[1])).size;
  const totalAssets = Object.keys(assetGroups).length;
  
  fields.push({
    label: "Type",
    value: `Multi-Send (${totalAssets} asset${totalAssets > 1 ? 's' : ''} to ${totalDestinations} address${totalDestinations > 1 ? 'es' : ''})`,
  });
  
  // Process each asset group
  Object.entries(assetGroups).forEach(([asset, data]) => {
    const displayQuantity = data.isDivisible ? fromSatoshis(data.quantity, true) : data.quantity;
    const displayTotal = data.isDivisible ? fromSatoshis(data.totalQuantity, true) : data.totalQuantity;
    
    fields.push({
      label: `${asset} Recipients (${data.destinations.length})`,
      value: (
        <div className="space-y-1 max-h-32 overflow-y-auto">
          {data.destinations.map((dest, idx) => (
            <div key={idx} className="text-xs break-all py-0.5">
              {formatAddress(dest)}
            </div>
          ))}
        </div>
      ),
    });
    
    fields.push({
      label: `${asset} per Address`,
      value: formatAmount({
        value: displayQuantity,
        minimumFractionDigits: data.isDivisible ? 8 : 0,
        maximumFractionDigits: data.isDivisible ? 8 : 0,
      }),
    });
    
    fields.push({
      label: `Total ${asset} Sent`,
      value: formatAmount({
        value: displayTotal,
        minimumFractionDigits: data.isDivisible ? 8 : 0,
        maximumFractionDigits: data.isDivisible ? 8 : 0,
      }),
    });
  });
  
  // Add memos if present
  if (params.memos && params.memos.length > 0) {
    fields.push({
      label: "Memo",
      value: (
        <div className="break-all">
          {params.memos[0]}
        </div>
      ),
    });
  }
  
  return fields;
}