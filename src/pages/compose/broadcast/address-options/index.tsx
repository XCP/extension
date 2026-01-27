import { AddressOptionsForm } from "./form";
import { ReviewAddressOptions } from "./review";
import { Composer } from "@/components/composer";
import { composeBroadcast } from "@/utils/blockchain/counterparty/compose";
import type { BroadcastOptions } from "@/utils/blockchain/counterparty/compose";

function ComposeBroadcastAddressOptionsPage() {
  return (
    <div className="p-4">
      <Composer<BroadcastOptions>
        composeType="broadcast"
        composeApiMethod={composeBroadcast}
        initialTitle="Broadcast"
        FormComponent={AddressOptionsForm}
        ReviewComponent={ReviewAddressOptions}
      />
    </div>
  );
}

export default ComposeBroadcastAddressOptionsPage;
