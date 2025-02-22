import { useParams } from "react-router-dom";
import { UtxoDetachForm } from "./form";
import { ReviewUtxoDetach } from "./review";
import { Composer } from "@/components/composer";
import { composeDetach } from "@/utils/blockchain/counterparty";

export function ComposeUtxoDetach() {
  const { utxo } = useParams<{ utxo: string }>();

  return (
    <div className="p-4">
      <Composer
        initialTitle="Detach"
        FormComponent={(props) => <UtxoDetachForm {...props} initialUtxo={utxo || ""} />}
        ReviewComponent={ReviewUtxoDetach}
        composeTransaction={composeDetach}
      />
    </div>
  );
}

export default ComposeUtxoDetach;
