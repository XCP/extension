import { AddressOptionsForm } from "./form";
import { ReviewAddressOptions } from "./review";
import { Composer } from "@/components/composer";
import { composeBroadcast } from "@/utils/blockchain/counterparty";
import type { BroadcastOptions } from "@/utils/blockchain/counterparty";

export function ComposeBroadcastAddressOptions() {
  return (
    <div className="p-4">
      <Composer<BroadcastOptions>
        initialTitle="Broadcast"
        FormComponent={AddressOptionsForm}
        ReviewComponent={ReviewAddressOptions}
        composeTransaction={composeBroadcast}
      />
    </div>
  );
}

export default ComposeBroadcastAddressOptions;
