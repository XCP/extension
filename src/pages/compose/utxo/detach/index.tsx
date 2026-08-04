import { useParams } from "react-router";
import { Composer } from "@/components/composer/composer";
import { UtxoDetachForm } from "@/pages/compose/utxo/detach/form";
import { ReviewUtxoDetach } from "@/pages/compose/utxo/detach/review";
import type { DetachOptions } from "@/utils/blockchain/counterparty/compose";
import { composeDetach } from "@/utils/blockchain/counterparty/compose";

function ComposeUtxoDetachPage() {
  const { txId } = useParams<{ txId: string }>();

  return (
    <div className="p-4">
      <Composer<DetachOptions>
        composeType="detach"
        composeApiMethod={composeDetach}
        initialTitle="Detach UTXO"
        FormComponent={(props) => <UtxoDetachForm {...props} initialUtxo={txId || ""} />}
        ReviewComponent={ReviewUtxoDetach}
      />
    </div>
  );
}

export default ComposeUtxoDetachPage;
