import { useParams } from "react-router";
import { Composer } from "@/components/composer/composer";
import type { MoveOptions } from "@/core/blockchain/counterparty/compose";
import { composeMove } from "@/core/blockchain/counterparty/compose";
import { UtxoMoveForm } from "@/pages/compose/utxo/move/form";
import { ReviewUtxoMove } from "@/pages/compose/utxo/move/review";

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
