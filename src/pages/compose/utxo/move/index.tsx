import { useParams } from "react-router-dom";
import { UtxoMoveForm } from "./form";
import { ReviewUtxoMove } from "./review";
import { Composer } from "@/components/composer/composer";
import { composeMove } from "@/utils/blockchain/counterparty/compose";
import type { MoveOptions } from "@/utils/blockchain/counterparty/compose";

function ComposeUtxoMovePage() {
  const { txId } = useParams<{ txId: string }>();

  return (
    <div className="p-4">
      <Composer<MoveOptions>
        composeType="move"
        composeApiMethod={composeMove}
        initialTitle="Move UTXO"
        FormComponent={(props) => <UtxoMoveForm {...props} initialUtxo={txId || ""} />}
        ReviewComponent={ReviewUtxoMove}
      />
    </div>
  );
}

export default ComposeUtxoMovePage;
