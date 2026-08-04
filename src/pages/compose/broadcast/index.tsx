import { Composer } from "@/components/composer/composer";
import type { BroadcastOptions } from "@/core/blockchain/counterparty/compose";
import { composeBroadcast } from "@/core/blockchain/counterparty/compose";
import { BroadcastForm } from "@/pages/compose/broadcast/form";
import { ReviewBroadcast } from "@/pages/compose/broadcast/review";

function ComposeBroadcastPage() {
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

export default ComposeBroadcastPage;
