import { AddressOptionsForm } from "./form";
import { ReviewAddressOptions } from "./review";
import { Composer } from "@/components/composer";
import { composeBroadcast } from "@/utils/blockchain/counterparty";

export function ComposeBroadcastAddressOptions() {
  return (
    <div className="p-4">
      <Composer
        initialTitle="Broadcast"
        FormComponent={(props) => <AddressOptionsForm {...props} />}
        ReviewComponent={ReviewAddressOptions}
        composeTransaction={composeBroadcast}
      />
    </div>
  );
}

export default ComposeBroadcastAddressOptions;
