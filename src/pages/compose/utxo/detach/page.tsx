import { useParams } from "react-router-dom";
import { DetachForm } from "./form";
import { ReviewDetach } from "./review";
import { Composer } from "@/components/composer";
import { composeDetach } from "@/utils/blockchain/counterparty";

export function ComposeUtxoDetach() {
  const { utxo } = useParams<{ utxo: string }>();

  return (
    <div className="p-4">
      <Composer
        initialTitle="Detach"
        FormComponent={(props) => <DetachForm {...props} initialUtxo={utxo || ""} />}
        ReviewComponent={ReviewDetach}
        composeTransaction={composeDetach}
      />
    </div>
  );
}

export default ComposeUtxoDetach;
