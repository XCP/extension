import { Composer } from "@/components/composer/composer";
import { AddressOptionsForm } from "@/pages/compose/broadcast/address-options/form";
import { ReviewAddressOptions } from "@/pages/compose/broadcast/address-options/review";
import type { BroadcastOptions } from "@/utils/blockchain/counterparty/compose";
import { composeBroadcast } from "@/utils/blockchain/counterparty/compose";

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
