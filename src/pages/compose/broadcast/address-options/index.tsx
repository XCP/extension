import { AddressOptionsForm } from "./form";
import { ReviewAddressOptions } from "./review";
import { Composer } from "@/components/composer";
import { composeBroadcast } from "@/utils/blockchain/counterparty/compose";
import type { BroadcastOptions } from "@/utils/blockchain/counterparty/compose";

function ComposeBroadcastAddressOptions() {
  return (
    <div className="p-4">
      <Composer<BroadcastOptions>
        initialTitle="Broadcast"
        FormComponent={AddressOptionsForm}
        ReviewComponent={ReviewAddressOptions}
        composeApiMethod={composeBroadcast}
      />
    </div>
  );
}

export default ComposeBroadcastAddressOptions;
