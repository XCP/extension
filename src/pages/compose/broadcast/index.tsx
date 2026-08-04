import { Composer } from "@/components/composer/composer";
import { BroadcastForm } from "@/pages/compose/broadcast/form";
import { ReviewBroadcast } from "@/pages/compose/broadcast/review";
import type { BroadcastOptions } from "@/utils/blockchain/counterparty/compose";
import { composeBroadcast } from "@/utils/blockchain/counterparty/compose";

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
