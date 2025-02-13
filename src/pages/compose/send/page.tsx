import { SendForm } from "./form";
import { ReviewSend } from "./review";
import { Composer } from "@/components/composer";
import { composeSend, signSendTransaction } from "@/utils/counterparty";

export function ComposeSendPage() {
  return (
    <div className="p-4">
      <Composer
        initialTitle="Send"
        FormComponent={SendForm}
        ReviewComponent={ReviewSend}
        composeTransaction={composeSend}
        signTransaction={signSendTransaction}
      />
    </div>
  );
}
