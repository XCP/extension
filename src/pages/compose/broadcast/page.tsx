import { BroadcastForm } from "./form";
import { ReviewBroadcast } from "./review";
import { Composer } from "@/components/composer";
import { composeBroadcast } from "@/utils/blockchain/counterparty";

export function ComposeBroadcast() {
  return (
    <div className="p-4">
      <Composer
        initialTitle="Broadcast"
        FormComponent={(props) => <BroadcastForm {...props} />}
        ReviewComponent={ReviewBroadcast}
        composeTransaction={composeBroadcast}
      />
    </div>
  );
}

export default ComposeBroadcast;
