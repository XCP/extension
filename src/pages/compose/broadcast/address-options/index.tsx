import { Composer } from "@/components/composer/composer";
import type { BroadcastOptions } from "@/core/counterparty/compose";
import { composeBroadcast } from "@/core/counterparty/compose";
import { AddressOptionsForm } from "@/pages/compose/broadcast/address-options/form";
import { ReviewAddressOptions } from "@/pages/compose/broadcast/address-options/review";

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
