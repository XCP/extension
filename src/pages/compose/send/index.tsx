import { useParams } from "react-router-dom";
import { SendForm } from "./form";
import { ReviewSend } from "./review";
import { Composer } from "@/components/composer/composer";
import { composeSendOrMPMA } from "@/utils/blockchain/counterparty/compose";
import type { SendOrMPMAOptions } from "@/utils/blockchain/counterparty/compose";

function ComposeSendPage() {
  const { asset } = useParams<{ asset?: string }>();

  return (
    <div className="p-4">
      <Composer<SendOrMPMAOptions>
        composeType="send"
        composeApiMethod={composeSendOrMPMA}
        initialTitle="Send"
        FormComponent={(props) => <SendForm {...props} initialAsset={asset || "BTC"} />}
        ReviewComponent={ReviewSend}
      />
    </div>
  );
}

export default ComposeSendPage;
