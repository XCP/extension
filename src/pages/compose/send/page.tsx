import { useParams } from "react-router-dom";
import { SendForm } from "./form";
import { ReviewSend } from "./review";
import { Composer } from "@/components/composer";
import { composeSend, composeMPMA } from "@/utils/blockchain/counterparty";
import type { SendOptions, MPMAOptions, ApiResponse } from "@/utils/blockchain/counterparty";

interface ExtendedSendOptions extends SendOptions {
  destinations?: string; // Comma-separated list for MPMA
}

export function ComposeSend() {
  const { asset } = useParams<{ asset: string }>();

  // Wrapper function that determines which compose function to use
  const composeTransaction = async (data: ExtendedSendOptions): Promise<ApiResponse> => {
    // Check if we have multiple destinations (MPMA)
    if (data.destinations && data.destinations.includes(',')) {
      // Parse multiple destinations
      const destArray = data.destinations.split(',').map((d: string) => d.trim());
      
      // Create MPMA options
      const mpmaOptions: MPMAOptions = {
        sourceAddress: data.sourceAddress,
        assets: destArray.map(() => data.asset), // Same asset for all
        destinations: destArray,
        quantities: destArray.map(() => data.quantity.toString()), // Same quantity for all
        sat_per_vbyte: data.sat_per_vbyte,
        ...(data.memo && { 
          memos: destArray.map(() => data.memo as string),
          memos_are_hex: destArray.map(() => data.memo_is_hex || false)
        })
      };
      
      // Compose MPMA transaction
      const response = await composeMPMA(mpmaOptions);
      // Mark as MPMA for review component
      response.result.name = 'mpma';
      return response;
    } else {
      // Single destination - use regular send
      const response = await composeSend(data);
      response.result.name = 'send';
      return response;
    }
  };

  return (
    <div className="p-4">
      <Composer<ExtendedSendOptions>
        initialTitle="Send"
        FormComponent={(props) => <SendForm {...props} initialAsset={asset || "BTC"} />}
        ReviewComponent={ReviewSend}
        composeTransaction={composeTransaction}
      />
    </div>
  );
}

export default ComposeSend;
