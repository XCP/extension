import { BroadcastInscriptionForm } from "./form";
import { ReviewBroadcastInscription } from "./review";
import { Composer } from "@/components/composer";
import { composeBroadcast } from "@/utils/blockchain/counterparty";
import type { BroadcastOptions } from "@/utils/blockchain/counterparty";

export function ComposeBroadcastInscription() {
  return (
    <div className="p-4">
      <Composer<BroadcastOptions>
        initialTitle="Broadcast"
        FormComponent={BroadcastInscriptionForm}
        ReviewComponent={ReviewBroadcastInscription}
        composeTransaction={composeBroadcast}
      />
    </div>
  );
}

export default ComposeBroadcastInscription;