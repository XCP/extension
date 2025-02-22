import { useParams } from "react-router-dom";
import { UtxoMoveForm } from "./form";
import { ReviewUtxoMove } from "./review";
import { Composer } from "@/components/composer";
import { composeMove } from "@/utils/blockchain/counterparty";

export function ComposeUtxoMove() {
  const { utxo } = useParams<{ utxo: string }>();

  return (
    <div className="p-4">
      <Composer
        initialTitle="Move UTXO"
        FormComponent={(props) => <UtxoMoveForm {...props} initialUtxo={utxo || ""} />}
        ReviewComponent={ReviewUtxoMove}
        composeTransaction={composeMove}
      />
    </div>
  );
}

export default ComposeUtxoMove;
