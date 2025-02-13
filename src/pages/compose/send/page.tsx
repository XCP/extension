import { SendForm } from "./form";
import { ReviewSend } from "./review";
import { Composer } from "@/components/composer";
import { composeSend } from "@/utils/blockchain/counterparty";

export function ComposeSend() {
  return (
    <div className="p-4">
      <Composer
        initialTitle="Send"
        FormComponent={SendForm}
        ReviewComponent={ReviewSend}
        composeTransaction={composeSend}
      />
    </div>
  );
}
