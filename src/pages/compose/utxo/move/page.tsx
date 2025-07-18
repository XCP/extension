import { useParams } from "react-router-dom";
import { UtxoMoveForm } from "./form";
import { ReviewUtxoMove } from "./review";
import { Composer } from "@/components/composer";
import { composeMove } from "@/utils/blockchain/counterparty";
import type { MoveOptions } from "@/utils/blockchain/counterparty";

export function ComposeUtxoMove() {
  const { txid } = useParams<{ txid: string }>();

  return (
    <div className="p-4">
      <Composer<MoveOptions>
        initialTitle="Move UTXO"
        FormComponent={(props) => <UtxoMoveForm {...props} initialUtxo={txid || ""} />}
        ReviewComponent={ReviewUtxoMove}
        composeTransaction={composeMove}
      />
    </div>
  );
}

export default ComposeUtxoMove;
