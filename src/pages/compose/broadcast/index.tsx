import { BroadcastForm } from "./form";
import { ReviewBroadcast } from "./review";
import { Composer } from "@/components/composer";
import { composeBroadcast } from "@/utils/blockchain/counterparty/compose";
import type { BroadcastOptions } from "@/utils/blockchain/counterparty/compose";

function ComposeBroadcast() {
  return (
    <div className="p-4">
      <Composer<BroadcastOptions>
        initialTitle="Broadcast"
        FormComponent={BroadcastForm}
        ReviewComponent={ReviewBroadcast}
        composeApiMethod={composeBroadcast}
      />
    </div>
  );
}

export default ComposeBroadcast;
