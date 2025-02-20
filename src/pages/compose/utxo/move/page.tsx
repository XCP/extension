import { useParams } from "react-router-dom";
import { MoveForm } from "./form";
import { ReviewMove } from "./review";
import { Composer } from "@/components/composer";
import { composeMovetoutxo } from "@/utils/blockchain/counterparty";

export function ComposeUtxoMove() {
  const { utxo } = useParams<{ utxo: string }>();

  return (
    <div className="p-4">
      <Composer
        initialTitle="Move UTXO"
        FormComponent={(props) => <MoveForm {...props} initialUtxo={utxo || ""} />}
        ReviewComponent={ReviewMove}
        composeTransaction={composeMovetoutxo}
      />
    </div>
  );
}

export default ComposeUtxoMove;
