import { type ReactNode } from "react";
import type { Transaction } from "@/utils/blockchain/counterparty/api";

/**
 * Renders detailed information for sweep transactions
 */
export function sweep(tx: Transaction): Array<{ label: string; value: string | ReactNode }> {
  const params = tx.unpacked_data?.params;
  if (!params) return [];
  
  const fields: Array<{ label: string; value: string | ReactNode }> = [
    {
      label: "Type",
      value: "Sweep All Assets",
    },
    {
      label: "Destination",
      value: (
        <span className="text-xs break-all">
          {params.destination}
        </span>
      ),
    },
  ];
  
  // Flags
  if (params.flags !== undefined) {
    const flagDescriptions: string[] = [];
    if (params.flags & 1) flagDescriptions.push("Include Balances");
    if (params.flags & 2) flagDescriptions.push("Include Ownership");
    if (params.flags & 4) flagDescriptions.push("Close Dispensers");
    
    fields.push({
      label: "Flags",
      value: flagDescriptions.length > 0 ? flagDescriptions.join(", ") : `Raw value: ${params.flags}`,
    });
  }
  
  // Memo
  if (params.memo) {
    fields.push({
      label: "Memo",
      value: (
        <div className="break-all">
          {params.memo}
        </div>
      ),
    });
  }
  
  // Show swept assets if available in events
  const sweepEvents = tx.events?.filter((e: any) => 
    e.event === 'ASSET_TRANSFER' || 
    e.event === 'SEND' || 
    e.event === 'OWNERSHIP_TRANSFER'
  );
  
  if (sweepEvents && sweepEvents.length > 0) {
    fields.push({
      label: "Assets Swept",
      value: (
        <div className="space-y-1 max-h-32 overflow-y-auto">
          {sweepEvents.map((event: any, idx: number) => (
            <div key={idx} className="text-xs">
              {event.params.asset}: {event.params.quantity || "ownership"}
            </div>
          ))}
        </div>
      ),
    });
  }
  
  return fields;
}