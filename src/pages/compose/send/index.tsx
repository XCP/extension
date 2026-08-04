import { useParams } from "react-router";
import { SendForm } from "@/pages/compose/send/form";
import { ReviewSend } from "@/pages/compose/send/review";
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
