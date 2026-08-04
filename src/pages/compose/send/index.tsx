import { useParams } from "react-router";
import { Composer } from "@/components/composer/composer";
import type { SendOrMPMAOptions } from "@/core/counterparty/compose";
import { composeSendOrMPMA } from "@/core/counterparty/compose";
import { SendForm } from "@/pages/compose/send/form";
import { ReviewSend } from "@/pages/compose/send/review";

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
