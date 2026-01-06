import { useParams } from "react-router-dom";
import { SendForm } from "./form";
import { ReviewSend } from "./review";
import { Composer } from "@/components/composer";
import { composeSend, composeMPMA } from "@/utils/blockchain/counterparty/compose";
import { isHexMemo, stripHexPrefix } from "@/utils/blockchain/counterparty/memo";
import type { SendOptions, MPMAOptions, ApiResponse } from "@/utils/blockchain/counterparty/compose";

interface ExtendedSendOptions extends SendOptions {
  destinations?: string; // Comma-separated list for MPMA
}

function ComposeSend() {
  const { asset } = useParams<{ asset?: string }>();

  // Wrapper function that determines which compose function to use
  const composeTransaction = async (data: ExtendedSendOptions): Promise<ApiResponse> => {
    // Auto-detect hex memo and process it
    let processedMemo = data.memo;
    let memoIsHex = false;

    if (data.memo && isHexMemo(data.memo)) {
      processedMemo = stripHexPrefix(data.memo);
      memoIsHex = true;
    }

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
        ...(processedMemo && {
          memos: destArray.map(() => processedMemo as string),
          memos_are_hex: destArray.map(() => memoIsHex)
        })
      };

      // Compose MPMA transaction
      const response = await composeMPMA(mpmaOptions);
      // Mark as MPMA for review component
      response.result.name = 'mpma';
      return response;
    } else {
      // Single destination - use regular send with processed memo
      const sendOptions = {
        ...data,
        ...(processedMemo && {
          memo: processedMemo,
          memo_is_hex: memoIsHex
        })
      };
      const response = await composeSend(sendOptions);
      response.result.name = 'send';
      return response;
    }
  };

  return (
    <div className="p-4">
      <Composer<ExtendedSendOptions>
        composeType="send"
        composeApiMethod={composeTransaction}
        initialTitle="Send"
        FormComponent={(props) => <SendForm {...props} initialAsset={asset || "BTC"} />}
        ReviewComponent={ReviewSend}
      />
    </div>
  );
}

export default ComposeSend;
