import { BroadcastForm } from "./form";
import { ReviewBroadcast } from "./review";
import { Composer } from "@/components/composer";
import { composeBroadcast } from "@/utils/blockchain/counterparty/compose";
import type { BroadcastOptions } from "@/utils/blockchain/counterparty/compose";

function ComposeBroadcast() {
  return (
    <div className="p-4">
      <Composer<BroadcastOptions>
        composeType="broadcast"
        composeApiMethod={composeBroadcast}
        initialTitle="Broadcast"
        FormComponent={BroadcastForm}
        ReviewComponent={ReviewBroadcast}
      />
    </div>
  );
}

export default ComposeBroadcast;
