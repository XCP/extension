import { useParams } from "react-router";
import { Composer } from "@/components/composer/composer";
import type { MoveOptions } from "@/core/counterparty/compose";
import { composeMove } from "@/core/counterparty/compose";
import { t } from '@/i18n';
import { UtxoMoveForm } from "@/pages/compose/utxo/move/form";
import { ReviewUtxoMove } from "@/pages/compose/utxo/move/review";

function ComposeUtxoMovePage() {
  const { txId } = useParams<{ txId: string }>();

  return (
    <div className="p-4">
      <Composer<MoveOptions>
        composeType="move"
        composeApiMethod={composeMove}
        initialTitle={t('utxo_move_move_utxo')}
        FormComponent={(props) => <UtxoMoveForm {...props} initialUtxo={txId || ""} />}
        ReviewComponent={ReviewUtxoMove}
      />
    </div>
  );
}

export default ComposeUtxoMovePage;
