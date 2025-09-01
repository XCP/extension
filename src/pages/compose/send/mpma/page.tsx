import { MPMAForm } from "./form";
import { ReviewMPMA } from "./review";
import { Composer } from "@/components/composer";
import { composeMPMA } from "@/utils/blockchain/counterparty";
import type { MPMAOptions, ApiResponse } from "@/utils/blockchain/counterparty";

interface MPMAData {
  sourceAddress: string;
  assets: string;
  destinations: string;
  quantities: string;
  memos?: string;
  memos_are_hex?: string;
  sat_per_vbyte: number;
}

export function ComposeMPMA() {
  const composeTransaction = async (data: MPMAData): Promise<ApiResponse> => {
    // Parse the comma-separated values
    const assets = data.assets.split(',');
    const destinations = data.destinations.split(',');
    const quantities = data.quantities.split(',');
    const memos = data.memos ? data.memos.split(',') : undefined;
    const memosAreHex = data.memos_are_hex ? data.memos_are_hex.split(',').map(v => v === 'true') : undefined;
    
    // Create MPMA options
    const mpmaOptions: MPMAOptions = {
      sourceAddress: data.sourceAddress,
      assets,
      destinations,
      quantities,
      sat_per_vbyte: data.sat_per_vbyte,
      ...(memos && { memos }),
      ...(memosAreHex && { memos_are_hex: memosAreHex })
    };
    
    // Compose MPMA transaction
    const response = await composeMPMA(mpmaOptions);
    return response;
  };

  return (
    <div className="p-4">
      <Composer<MPMAData>
        initialTitle="MPMA Send"
        FormComponent={MPMAForm}
        ReviewComponent={ReviewMPMA}
        composeApi={composeTransaction}
      />
    </div>
  );
}

export default ComposeMPMA;