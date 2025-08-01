import { useParams } from "react-router-dom";
import { SendForm } from "./form";
import { ReviewSend } from "./review";
import { Composer } from "@/components/composer";
import { composeSend } from "@/utils/blockchain/counterparty";
import type { SendOptions } from "@/utils/blockchain/counterparty";

export function ComposeSend() {
  const { asset } = useParams<{ asset: string }>();

  return (
    <div className="p-4">
      <Composer<SendOptions>
        initialTitle="Send"
        FormComponent={(props) => <SendForm {...props} initialAsset={asset || "BTC"} />}
        ReviewComponent={ReviewSend}
        composeTransaction={composeSend}
      />
    </div>
  );
}

export default ComposeSend;
