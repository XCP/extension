import { BroadcastForm } from "./form";
import { ReviewBroadcast } from "./review";
import { Composer } from "@/components/composer";
import { composeBroadcast } from "@/utils/blockchain/counterparty";
import type { BroadcastOptions } from "@/utils/blockchain/counterparty";

export function ComposeBroadcast() {
  return (
    <div className="p-4">
      <Composer<BroadcastOptions>
        initialTitle="Broadcast"
        FormComponent={BroadcastForm}
        ReviewComponent={ReviewBroadcast}
        composeApi={composeBroadcast}
      />
    </div>
  );
}

export default ComposeBroadcast;
